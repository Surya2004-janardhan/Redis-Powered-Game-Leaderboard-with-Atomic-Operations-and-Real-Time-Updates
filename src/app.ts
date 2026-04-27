import express, { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { createClient } from "redis";
import { v4 as uuidv4 } from "uuid";

const API_PORT = Number(process.env.API_PORT ?? "3000");
const REDIS_URL = process.env.REDIS_URL ?? "redis://redis:6379";
const SESSION_TTL_SECONDS = 1800;
const GLOBAL_LEADERBOARD_KEY = "leaderboard:global";
const GAME_EVENTS_CHANNEL = "game-events";

const invalidateAndCreateSessionLua = `
local userSetKey = KEYS[1]
local newSessionKey = KEYS[2]

local newSessionId = ARGV[1]
local userId = ARGV[2]
local createdAt = ARGV[3]
local ipAddress = ARGV[4]
local deviceType = ARGV[5]
local ttl = tonumber(ARGV[6])

local oldSessions = redis.call('SMEMBERS', userSetKey)
for _, sid in ipairs(oldSessions) do
  redis.call('DEL', 'session:' .. sid)
end

redis.call('DEL', userSetKey)
redis.call('SADD', userSetKey, newSessionId)
redis.call('HSET', newSessionKey,
  'userId', userId,
  'createdAt', createdAt,
  'lastActive', createdAt,
  'ipAddress', ipAddress,
  'deviceType', deviceType
)
redis.call('EXPIRE', newSessionKey, ttl)

return newSessionId
`;

const submitAnswerLua = `
local roundKey = KEYS[1]
local submissionsKey = KEYS[2]
local leaderboardKey = KEYS[3]

local playerId = ARGV[1]
local answer = ARGV[2]
local currentTime = tonumber(ARGV[3])
local points = tonumber(ARGV[4])

local endTime = redis.call('HGET', roundKey, 'endTime')
if not endTime or currentTime >= tonumber(endTime) then
  return {'ERROR', 'ROUND_EXPIRED'}
end

if redis.call('SISMEMBER', submissionsKey, playerId) == 1 then
  return {'ERROR', 'DUPLICATE_SUBMISSION'}
end

redis.call('SADD', submissionsKey, playerId)
redis.call('HSET', roundKey, 'answer:' .. playerId, answer)

local newScore = redis.call('ZINCRBY', leaderboardKey, points, playerId)
return {'SUCCESS', newScore}
`;

const app = express();
app.use(express.json());

const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    family: 4
  }
});
const redisSubscriber = redisClient.duplicate();
const sseClients = new Set<Response>();

redisClient.on("error", (error) => console.error("Redis client error:", error));
redisSubscriber.on("error", (error) => console.error("Redis subscriber error:", error));

async function initRedis(): Promise<void> {
  await redisClient.connect();
  await redisSubscriber.connect();
  await redisSubscriber.subscribe(GAME_EVENTS_CHANNEL, (message) => {
    let payload: { event?: string; data?: unknown } = {};
    try {
      payload = JSON.parse(message) as { event?: string; data?: unknown };
    } catch {
      payload = { event: "message", data: message };
    }
    const eventName = payload.event ?? "message";
    const data = payload.data ?? payload;
    const serializedData = JSON.stringify(data);
    for (const client of sseClients) {
      client.write(`event: ${eventName}\n`);
      client.write(`data: ${serializedData}\n\n`);
    }
  });
}

app.get("/health", async (_req: Request, res: Response) => {
  try {
    await redisClient.ping();
    res.status(200).json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unhealthy" });
  }
});

app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "rate limit exceeded" }
  })
);

app.post("/api/sessions", async (req: Request, res: Response) => {
  const { userId, ipAddress, deviceType } = req.body as {
    userId?: string;
    ipAddress?: string;
    deviceType?: string;
  };
  if (!userId || !ipAddress || !deviceType) {
    res.status(400).json({ error: "userId, ipAddress, and deviceType are required" });
    return;
  }

  const sessionId = uuidv4();
  const nowIso = new Date().toISOString();
  const userSessionSetKey = `user_sessions:${userId}`;
  const sessionKey = `session:${sessionId}`;

  await redisClient.eval(invalidateAndCreateSessionLua, {
    keys: [userSessionSetKey, sessionKey],
    arguments: [sessionId, userId, nowIso, ipAddress, deviceType, String(SESSION_TTL_SECONDS)]
  });

  res.status(201).json({ sessionId });
});

app.post("/api/leaderboard/scores", async (req: Request, res: Response) => {
  const { playerId, points } = req.body as { playerId?: string; points?: number };
  if (!playerId || typeof points !== "number") {
    res.status(400).json({ error: "playerId and numeric points are required" });
    return;
  }

  const newScoreRaw = await redisClient.zIncrBy(GLOBAL_LEADERBOARD_KEY, points, playerId);
  const newScore = Number(newScoreRaw);

  await redisClient.publish(
    GAME_EVENTS_CHANNEL,
    JSON.stringify({
      event: "leaderboard_updated",
      data: { playerId, newScore }
    })
  );

  res.status(200).json({ playerId, newScore });
});

app.get("/api/leaderboard/top/:count", async (req: Request, res: Response) => {
  const count = Number(req.params.count);
  if (!Number.isInteger(count) || count <= 0) {
    res.status(400).json({ error: "count must be a positive integer" });
    return;
  }

  const players = await redisClient.zRangeWithScores(GLOBAL_LEADERBOARD_KEY, 0, count - 1, { REV: true });
  const response = players.map((entry, index) => ({
    rank: index + 1,
    playerId: entry.value,
    score: Number(entry.score)
  }));

  res.status(200).json(response);
});

app.get("/api/leaderboard/player/:playerId", async (req: Request, res: Response) => {
  const playerId = String(req.params.playerId);
  const rankZeroBased = await redisClient.zRevRank(GLOBAL_LEADERBOARD_KEY, playerId);
  const score = await redisClient.zScore(GLOBAL_LEADERBOARD_KEY, playerId);
  if (rankZeroBased === null || score === null) {
    res.status(404).json({ error: "player not found" });
    return;
  }

  const totalPlayers = await redisClient.zCard(GLOBAL_LEADERBOARD_KEY);
  const rank = rankZeroBased + 1;
  const percentile = Number((((totalPlayers - rank + 1) / Math.max(totalPlayers, 1)) * 100).toFixed(2));

  const aboveStart = Math.max(0, rankZeroBased - 2);
  const aboveStop = rankZeroBased - 1;
  const belowStart = rankZeroBased + 1;
  const belowStop = Math.min(totalPlayers - 1, rankZeroBased + 2);

  const aboveRaw =
    aboveStop >= aboveStart
      ? await redisClient.zRangeWithScores(GLOBAL_LEADERBOARD_KEY, aboveStart, aboveStop, { REV: true })
      : [];
  const belowRaw =
    belowStop >= belowStart
      ? await redisClient.zRangeWithScores(GLOBAL_LEADERBOARD_KEY, belowStart, belowStop, { REV: true })
      : [];

  const nearbyAbove = aboveRaw.map((entry, idx) => ({
    rank: aboveStart + idx + 1,
    playerId: entry.value,
    score: Number(entry.score)
  }));
  const nearbyBelow = belowRaw.map((entry, idx) => ({
    rank: belowStart + idx + 1,
    playerId: entry.value,
    score: Number(entry.score)
  }));

  res.status(200).json({
    playerId,
    score: Number(score),
    rank,
    percentile,
    nearbyPlayers: {
      above: nearbyAbove,
      below: nearbyBelow
    }
  });
});

app.post("/api/game/submit", async (req: Request, res: Response) => {
  const { gameId, roundId, playerId, answer } = req.body as {
    gameId?: string;
    roundId?: string;
    playerId?: string;
    answer?: string;
  };
  if (!gameId || !roundId || !playerId || !answer) {
    res.status(400).json({ error: "gameId, roundId, playerId, and answer are required" });
    return;
  }

  const roundKey = `game_round:${gameId}:${roundId}`;
  const submissionsKey = `submissions:${gameId}:${roundId}`;
  const luaResult = (await redisClient.eval(submitAnswerLua, {
    keys: [roundKey, submissionsKey, GLOBAL_LEADERBOARD_KEY],
    arguments: [playerId, answer, String(Date.now()), "10"]
  })) as [string, string];

  if (luaResult[0] === "ERROR") {
    if (luaResult[1] === "DUPLICATE_SUBMISSION") {
      res.status(400).json({ status: "ERROR", code: "DUPLICATE_SUBMISSION" });
      return;
    }
    if (luaResult[1] === "ROUND_EXPIRED") {
      res.status(403).json({ status: "ERROR", code: "ROUND_EXPIRED" });
      return;
    }
    res.status(400).json({ status: "ERROR", code: luaResult[1] });
    return;
  }

  res.status(200).json({ status: "SUCCESS", newScore: Number(luaResult[1]) });
});

app.get("/api/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.add(res);
  res.write("event: connected\n");
  res.write("data: {\"status\":\"connected\"}\n\n");

  const keepAliveTimer = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 20000);

  req.on("close", () => {
    clearInterval(keepAliveTimer);
    sseClients.delete(res);
    res.end();
  });
});

app.get("/api/admin/sessions/user/:userId", async (req: Request, res: Response) => {
  const userId = String(req.params.userId);
  const sessionIds = await redisClient.sMembers(`user_sessions:${userId}`);

  const sessions = await Promise.all(
    sessionIds.map(async (sessionId) => {
      const data = await redisClient.hGetAll(`session:${sessionId}`);
      if (Object.keys(data).length === 0) {
        return null;
      }
      return {
        sessionId,
        ipAddress: data.ipAddress ?? "",
        lastActive: data.lastActive ?? "",
        deviceType: data.deviceType ?? ""
      };
    })
  );

  res.status(200).json(sessions.filter(Boolean));
});

app.delete("/api/admin/sessions/:sessionId", async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const sessionKey = `session:${sessionId}`;
  const userId = await redisClient.hGet(sessionKey, "userId");

  await redisClient.del(sessionKey);
  if (userId) {
    await redisClient.sRem(`user_sessions:${userId}`, sessionId);
  }

  res.status(204).send();
});

async function start(): Promise<void> {
  await initRedis();
  app.listen(API_PORT, () => {
    console.log(`API server listening on port ${API_PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

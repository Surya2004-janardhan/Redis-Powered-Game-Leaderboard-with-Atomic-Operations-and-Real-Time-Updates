import { Request, Response } from "express";
import { redisClient, GAME_EVENTS_CHANNEL } from "../redis/client";

export const GLOBAL_LEADERBOARD_KEY = "leaderboard:global";

export const submitScore = async (req: Request, res: Response): Promise<void> => {
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
};

export const getTopPlayers = async (req: Request, res: Response): Promise<void> => {
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
};

export const getPlayerRank = async (req: Request, res: Response): Promise<void> => {
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
};

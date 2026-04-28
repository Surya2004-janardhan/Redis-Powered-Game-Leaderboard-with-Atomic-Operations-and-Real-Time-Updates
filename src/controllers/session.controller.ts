import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { redisClient } from "../redis/client";
import { invalidateAndCreateSessionLua } from "../redis/scripts";

const SESSION_TTL_SECONDS = 1800;

export const createSession = async (req: Request, res: Response): Promise<void> => {
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
};

import { Request, Response } from "express";
import { redisClient } from "../redis/client";

export const getUserSessions = async (req: Request, res: Response): Promise<void> => {
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
};

export const deleteSession = async (req: Request, res: Response): Promise<void> => {
  const sessionId = String(req.params.sessionId);
  const sessionKey = `session:${sessionId}`;
  const userId = await redisClient.hGet(sessionKey, "userId");

  await redisClient.del(sessionKey);
  if (userId) {
    await redisClient.sRem(`user_sessions:${userId}`, sessionId);
  }

  res.status(204).send();
};

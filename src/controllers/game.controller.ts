import { Request, Response } from "express";
import { redisClient } from "../redis/client";
import { submitAnswerLua } from "../redis/scripts";
import { GLOBAL_LEADERBOARD_KEY } from "./leaderboard.controller";

const DEFAULT_SUBMISSION_POINTS = 10;

export const submitGameAnswer = async (req: Request, res: Response): Promise<void> => {
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
    arguments: [playerId, answer, String(Date.now()), String(DEFAULT_SUBMISSION_POINTS)]
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
};

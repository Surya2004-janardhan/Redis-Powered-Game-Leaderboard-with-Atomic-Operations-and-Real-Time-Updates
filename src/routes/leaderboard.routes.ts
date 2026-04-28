import { Router } from "express";
import { submitScore, getTopPlayers, getPlayerRank } from "../controllers/leaderboard.controller";

const router = Router();

router.post("/scores", submitScore);
router.get("/top/:count", getTopPlayers);
router.get("/player/:playerId", getPlayerRank);

export default router;

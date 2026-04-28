import { Router } from "express";
import { submitGameAnswer } from "../controllers/game.controller";

const router = Router();

router.post("/submit", submitGameAnswer);

export default router;

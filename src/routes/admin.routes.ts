import { Router } from "express";
import { getUserSessions, deleteSession } from "../controllers/admin.controller";

const router = Router();

router.get("/sessions/user/:userId", getUserSessions);
router.delete("/sessions/:sessionId", deleteSession);

export default router;

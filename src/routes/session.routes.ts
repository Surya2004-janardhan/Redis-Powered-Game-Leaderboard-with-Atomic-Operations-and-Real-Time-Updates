import { Router } from "express";
import { createSession } from "../controllers/session.controller";

const router = Router();

router.post("/", createSession);

export default router;

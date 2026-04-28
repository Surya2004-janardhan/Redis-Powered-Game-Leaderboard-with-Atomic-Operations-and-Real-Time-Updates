import { Router } from "express";
import { handleEventsConnection } from "../controllers/events.controller";

const router = Router();

router.get("/", handleEventsConnection);

export default router;

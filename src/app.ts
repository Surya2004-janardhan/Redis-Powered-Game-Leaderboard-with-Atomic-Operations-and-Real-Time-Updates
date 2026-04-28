import express, { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { redisClient } from "./redis/client";

import sessionRoutes from "./routes/session.routes";
import leaderboardRoutes from "./routes/leaderboard.routes";
import gameRoutes from "./routes/game.routes";
import eventsRoutes from "./routes/events.routes";
import adminRoutes from "./routes/admin.routes";

const app = express();

app.use(express.json());
app.use(
  rateLimit({
    windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
    message: { error: "rate limit exceeded" }
  })
);

app.get("/health", async (_req: Request, res: Response) => {
  try {
    await redisClient.ping();
    res.status(200).json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unhealthy" });
  }
});

app.use("/api/sessions", sessionRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/admin", adminRoutes);

export default app;

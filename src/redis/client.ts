import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://redis:6379";
export const GAME_EVENTS_CHANNEL = "game-events";

export const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    family: 4
  }
});

export const redisSubscriber = redisClient.duplicate();

redisClient.on("error", (error) => console.error("Redis client error:", error));
redisSubscriber.on("error", (error) => console.error("Redis subscriber error:", error));

export async function initRedis(onEventMessage: (message: string) => void): Promise<void> {
  await redisClient.connect();
  await redisSubscriber.connect();
  await redisSubscriber.subscribe(GAME_EVENTS_CHANNEL, onEventMessage);
}

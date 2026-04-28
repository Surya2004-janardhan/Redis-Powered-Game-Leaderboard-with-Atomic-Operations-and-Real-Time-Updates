import { after, before } from "node:test";
import { redisClient, redisSubscriber, initRedis } from "../src/redis/client";

before(async () => {
  // Connect and clean database beforehand so state doesn't persist across runs
  await initRedis(() => {});
  await redisClient.flushDb();
});

after(async () => {
  // Gracefully quit
  await redisClient.quit();
  await redisSubscriber.quit();
});

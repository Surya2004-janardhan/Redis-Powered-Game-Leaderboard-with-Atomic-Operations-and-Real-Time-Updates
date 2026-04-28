import { after, before } from "node:test";
import { redisClient, redisSubscriber, initRedis } from "../src/redis/client";

before(async () => {
  // Try to connect to localhost default
  await initRedis(() => {});
});

after(async () => {
  // Cleanup test data
  const keys = await redisClient.keys("*");
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
  await redisClient.quit();
  await redisSubscriber.quit();
});

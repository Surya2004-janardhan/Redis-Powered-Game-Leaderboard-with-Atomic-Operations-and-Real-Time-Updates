import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import app from "../src/app";
import { redisClient } from "../src/redis/client";
import "./setup";

test("Game API", async (t) => {
  await t.test("POST /api/game/submit with valid input", async () => {
    // Seed an active round
    await redisClient.hSet("game_round:g1:r1", "endTime", String(Date.now() + 10000));

    const res = await request(app)
      .post("/api/game/submit")
      .send({ gameId: "g1", roundId: "r1", playerId: "p-100", answer: "A" });
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "SUCCESS");
  });

  await t.test("POST /api/game/submit avoids duplicates", async () => {
    await redisClient.hSet("game_round:g1:r1", "endTime", String(Date.now() + 10000));
    // simulate a previous answer
    await redisClient.sAdd("submissions:g1:r1", "p-100");

    const res = await request(app)
      .post("/api/game/submit")
      .send({ gameId: "g1", roundId: "r1", playerId: "p-100", answer: "A" });
    
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, "DUPLICATE_SUBMISSION");
  });

  await t.test("POST /api/game/submit rejects expired rounds", async () => {
    await redisClient.hSet("game_round:g1:r2", "endTime", String(Date.now() - 10000));

    const res = await request(app)
      .post("/api/game/submit")
      .send({ gameId: "g1", roundId: "r2", playerId: "p-200", answer: "B" });
    
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, "ROUND_EXPIRED");
  });
});

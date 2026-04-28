import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import app from "../src/app";
import { redisClient } from "../src/redis/client";
import "./setup";

test("Leaderboard API", async (t) => {
  await t.test("POST /api/leaderboard/scores increments score", async () => {
    const res = await request(app)
      .post("/api/leaderboard/scores")
      .send({ playerId: "player-1", points: 50 });
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.newScore, 50);

    const res2 = await request(app)
      .post("/api/leaderboard/scores")
      .send({ playerId: "player-1", points: 20 });
    
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.newScore, 70);

    const actual = await redisClient.zScore("leaderboard:global", "player-1");
    assert.strictEqual(actual, 70);
  });

  await t.test("GET /api/leaderboard/top fetches the leaderboard sorted", async () => {
    await request(app).post("/api/leaderboard/scores").send({ playerId: "player-A", points: 100 });
    await request(app).post("/api/leaderboard/scores").send({ playerId: "player-B", points: 50 });
    await request(app).post("/api/leaderboard/scores").send({ playerId: "player-C", points: 200 });

    const res = await request(app).get("/api/leaderboard/top/2");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 2);
    assert.strictEqual(res.body[0].playerId, "player-C");
    assert.strictEqual(res.body[1].playerId, "player-A");
  });

  await t.test("GET /api/leaderboard/player fetches single player context", async () => {
    const res = await request(app).get("/api/leaderboard/player/player-B");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.playerId, "player-B");
    // We added player-1 (70), player-A (100), player-B (50), player-C (200)
    // Ranks: 1: C!200, 2: A!100, 3: player-1!70, 4: B!50
    assert.strictEqual(res.body.rank, 4);
    assert.strictEqual(res.body.nearbyPlayers.above.length > 0, true);
  });
});

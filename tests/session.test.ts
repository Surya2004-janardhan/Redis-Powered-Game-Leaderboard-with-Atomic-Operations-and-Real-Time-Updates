import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import app from "../src/app";
import { redisClient } from "../src/redis/client";
import "./setup"; // ensures before/after hooks run

test("Session API", async (t) => {
  await t.test("POST /api/sessions should create a session and return sessionId", async () => {
    const res = await request(app)
      .post("/api/sessions")
      .send({
        userId: "test-user-123",
        ipAddress: "127.0.0.1",
        deviceType: "desktop"
      });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.sessionId);

    // Verify Redis presence
    const userSessions = await redisClient.sMembers("user_sessions:test-user-123");
    assert.strictEqual(userSessions.length, 1);
    assert.strictEqual(userSessions[0], res.body.sessionId);
  });

  await t.test("POST /api/sessions should reject missing payload", async () => {
    const res = await request(app)
      .post("/api/sessions")
      .send({ userId: "test" });
    
    assert.strictEqual(res.status, 400);
  });

  await t.test("POST /api/sessions should invalidate old sessions on new login", async () => {
    // Log in first time
    const res1 = await request(app).post("/api/sessions").send({ userId: "user-alpha", ipAddress: "1", deviceType: "m" });
    assert.strictEqual(res1.status, 201);
    const sid1 = res1.body.sessionId;

    // Log in second time
    const res2 = await request(app).post("/api/sessions").send({ userId: "user-alpha", ipAddress: "2", deviceType: "d" });
    assert.strictEqual(res2.status, 201);
    const sid2 = res2.body.sessionId;

    const userSessions = await redisClient.sMembers("user_sessions:user-alpha");
    assert.strictEqual(userSessions.length, 1);
    assert.strictEqual(userSessions[0], sid2);
    
    // Check old session hash
    const oldExists = await redisClient.exists(`session:${sid1}`);
    assert.strictEqual(oldExists, 0);
  });
});

import app from "./app";
import { initRedis } from "./redis/client";
import { sseClients } from "./controllers/events.controller";

const API_PORT = Number(process.env.API_PORT ?? "3000");

async function start(): Promise<void> {
  await initRedis((message: string) => {
    let payload: { event?: string; data?: unknown } = {};
    try {
      payload = JSON.parse(message) as { event?: string; data?: unknown };
    } catch {
      payload = { event: "message", data: message };
    }
    const eventName = payload.event ?? "message";
    const data = payload.data ?? payload;
    const serializedData = JSON.stringify(data);
    for (const client of sseClients) {
      client.write(`event: ${eventName}\n`);
      client.write(`data: ${serializedData}\n\n`);
    }
  });

  app.listen(API_PORT, () => {
    console.log(`API server listening on port ${API_PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

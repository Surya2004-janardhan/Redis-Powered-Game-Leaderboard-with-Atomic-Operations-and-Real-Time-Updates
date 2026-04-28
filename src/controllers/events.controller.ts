import { Request, Response } from "express";

const SSE_KEEPALIVE_INTERVAL_MS = 20_000;
export const sseClients = new Set<Response>();

export const handleEventsConnection = (req: Request, res: Response): void => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.add(res);
  res.write("event: connected\n");
  res.write("data: {\"status\":\"connected\"}\n\n");

  const keepAliveTimer = setInterval(() => {
    res.write(": keepalive\n\n");
  }, SSE_KEEPALIVE_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(keepAliveTimer);
    sseClients.delete(res);
    res.end();
  });
};

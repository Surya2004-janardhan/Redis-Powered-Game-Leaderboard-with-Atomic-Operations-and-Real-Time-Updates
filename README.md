# Redis-Powered Game Leaderboard

A production-style backend service for real-time game leaderboards powered by **Redis**, **Express**, and **TypeScript**.

It demonstrates:
- atomic updates with Redis Lua scripts,
- low-latency ranking with sorted sets,
- real-time leaderboard events via Server-Sent Events (SSE),
- session lifecycle management with TTL,
- containerized local development using Docker Compose.

---

## Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Quick Start (Docker)](#quick-start-docker)
- [Quick Start (Local Node.js)](#quick-start-local-nodejs)
- [Available Scripts](#available-scripts)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
  - [Health](#health)
  - [Session APIs](#session-apis)
  - [Leaderboard APIs](#leaderboard-apis)
  - [Game Submission API](#game-submission-api)
  - [Real-Time Events (SSE)](#real-time-events-sse)
- [Redis Data Model](#redis-data-model)
- [Validation](#validation)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Atomic session replacement**  
  Creating a new session for a user invalidates old sessions in one Lua script execution.

- **Atomic gameplay submission logic**  
  One Lua script enforces:
  - round is still active,
  - duplicate submission prevention,
  - score update in leaderboard.

- **Global leaderboard with rank + percentile**  
  Efficient ranking and score retrieval using Redis sorted sets.

- **Nearby player context**  
  Player lookup returns neighbors above and below for context.

- **Real-time notifications**  
  Score updates are published on Redis Pub/Sub and streamed to clients via SSE.

- **Rate-limited API**  
  Basic request throttling with `express-rate-limit`.

---

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Web Framework:** Express 5
- **Data Store:** Redis 7
- **Containerization:** Docker + Docker Compose

---

## Project Structure

```text
.
├── src/
│   └── app.ts              # Main API server, Redis integration, Lua scripts, SSE
├── Dockerfile              # Multi-stage image build
├── docker-compose.yml      # Redis + API local orchestration
├── .env.example            # Environment variable reference
├── package.json            # Scripts and dependencies
└── tsconfig.json           # TypeScript configuration
```

---

## How It Works

1. API receives session, score, and game submission requests.
2. Redis Lua scripts guarantee atomic state transitions for critical paths.
3. Leaderboard scores are stored in a sorted set (`leaderboard:global`).
4. Score updates publish events to Redis channel `game-events`.
5. SSE endpoint (`/api/events`) forwards those events to connected clients.

---

## Prerequisites

For Docker setup:
- Docker
- Docker Compose

For local Node.js setup:
- Node.js 20+
- Redis instance accessible by `REDIS_URL`

---

## Quick Start (Docker)

1. Clone the repository.
2. Optionally create a `.env` from `.env.example`:

```bash
cp .env.example .env
```

3. Start services:

```bash
docker compose up --build
```

4. Verify health:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{ "status": "ok" }
```

---

## Quick Start (Local Node.js)

1. Install dependencies:

```bash
npm ci
```

2. Create env file:

```bash
cp .env.example .env
```

3. Ensure Redis is running and reachable by `REDIS_URL`.

4. Run in development mode:

```bash
npm run dev
```

---

## Available Scripts

- `npm run dev` – Run API with ts-node.
- `npm run build` – Compile TypeScript to `dist/`.
- `npm run start` – Run compiled app from `dist/app.js`.
- `npm test` – Run Node test runner (`node --test`).

---

## Environment Variables

From `.env.example`:

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `API_PORT` | `3000` | HTTP server port |

---

## API Reference

Base URL: `http://localhost:3000`

### Health

#### `GET /health`
Checks API and Redis connectivity.

**Response**
```json
{ "status": "ok" }
```

---

### Session APIs

#### `POST /api/sessions`
Creates a new session and invalidates previous sessions for the same user.

**Request**
```json
{
  "userId": "u1",
  "ipAddress": "203.0.113.10",
  "deviceType": "desktop"
}
```

**Response (201)**
```json
{ "sessionId": "generated-uuid" }
```

#### `GET /api/admin/sessions/user/:userId`
Returns active sessions for a user.

#### `DELETE /api/admin/sessions/:sessionId`
Deletes a specific session.

---

### Leaderboard APIs

#### `POST /api/leaderboard/scores`
Increments a player’s score and emits a real-time event.

**Request**
```json
{
  "playerId": "player-1",
  "points": 25
}
```

**Response**
```json
{
  "playerId": "player-1",
  "newScore": 25
}
```

#### `GET /api/leaderboard/top/:count`
Returns top N ranked players.

**Example**
`GET /api/leaderboard/top/3`

**Response**
```json
[
  { "rank": 1, "playerId": "player-1", "score": 100 },
  { "rank": 2, "playerId": "player-2", "score": 80 }
]
```

#### `GET /api/leaderboard/player/:playerId`
Returns player score, rank, percentile, and nearby players.

**Response**
```json
{
  "playerId": "player-1",
  "score": 100,
  "rank": 1,
  "percentile": 100,
  "nearbyPlayers": {
    "above": [],
    "below": [{ "rank": 2, "playerId": "player-2", "score": 80 }]
  }
}
```

---

### Game Submission API

#### `POST /api/game/submit`
Submits a player answer for a game round with atomic validation.

**Request**
```json
{
  "gameId": "g1",
  "roundId": "r1",
  "playerId": "player-1",
  "answer": "A"
}
```

**Success Response**
```json
{
  "status": "SUCCESS",
  "newScore": 110
}
```

**Error Codes**
- `DUPLICATE_SUBMISSION` (400)
- `ROUND_EXPIRED` (403)

> Note: This endpoint expects round metadata to exist in Redis at  
> `game_round:{gameId}:{roundId}` with an `endTime` field (epoch milliseconds).

---

### Real-Time Events (SSE)

#### `GET /api/events`
Opens a Server-Sent Events stream for real-time updates.

When leaderboard scores change, clients receive:
- `event: leaderboard_updated`
- `data: {"playerId":"...","newScore":...}`

**Quick test**
```bash
curl -N http://localhost:3000/api/events
```

Then in another terminal:
```bash
curl -X POST http://localhost:3000/api/leaderboard/scores \
  -H "Content-Type: application/json" \
  -d '{"playerId":"player-1","points":5}'
```

---

## Redis Data Model

- `leaderboard:global` (sorted set)  
  `member=playerId`, `score=points`

- `user_sessions:{userId}` (set)  
  Active session IDs for a user

- `session:{sessionId}` (hash + TTL)  
  Session details (`userId`, `createdAt`, `lastActive`, `ipAddress`, `deviceType`)

- `game_round:{gameId}:{roundId}` (hash)  
  Round metadata including `endTime` and stored answers

- `submissions:{gameId}:{roundId}` (set)  
  Players who already submitted for the round

---

## Validation

```bash
npm test
npm run build
```

---

## Troubleshooting

- **`/health` returns unhealthy**  
  Verify Redis is running and `REDIS_URL` is correct.

- **Cannot connect to SSE stream**  
  Ensure reverse proxies (if any) support streaming responses.

- **`ROUND_EXPIRED` from submit API**  
  Confirm `endTime` is set and greater than current epoch milliseconds.

- **No events after score update**  
  Confirm SSE client remains connected and API process has Redis pub/sub connectivity.

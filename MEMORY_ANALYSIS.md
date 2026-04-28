# Redis Memory Analysis

## Test Setup

- Redis version: `7.x` (alpine image)
- Session hash key shape: `session:{sessionId}`
- Leaderboard key: `leaderboard:global`
- Large leaderboard seed size: `100000+` players

## 1) Hash Memory Usage (Session Object)

Sample commands:

```bash
HSET session:sample userId test-user createdAt 2026-01-01T00:00:00.000Z lastActive 2026-01-01T00:00:00.000Z ipAddress 10.0.0.1 deviceType desktop
MEMORY USAGE session:sample
OBJECT ENCODING session:sample
```

Observed:

- `MEMORY USAGE session:sample` is typically small (hundreds of bytes).
- `OBJECT ENCODING session:sample` is compact (`listpack`) for a small hash payload.

## 2) Sorted Set Memory Usage (100k+ players)

Sample commands:

```bash
# seed 100k players
for i in $(seq 1 100000); do redis-cli ZADD leaderboard:global $i player-$i > /dev/null; done
MEMORY USAGE leaderboard:global
OBJECT ENCODING leaderboard:global
```

Observed:

- Memory usage scales with element count and member length.
- With this cardinality, Redis uses `skiplist` encoding for the zset.

## 3) Encoding Comparison: Compact vs Forced Skiplist

Default behavior favors compact encoding for small zsets:

```bash
CONFIG SET zset-max-ziplist-entries 128
CONFIG SET zset-max-ziplist-value 64
DEL leaderboard:small
ZADD leaderboard:small 10 p1 20 p2 30 p3
OBJECT ENCODING leaderboard:small
MEMORY USAGE leaderboard:small
```

Forced skiplist for the same small dataset:

```bash
CONFIG SET zset-max-ziplist-entries 1
DEL leaderboard:small
ZADD leaderboard:small 10 p1 20 p2 30 p3
OBJECT ENCODING leaderboard:small
MEMORY USAGE leaderboard:small
```

Observed comparison:

- Compact/ziplist encoding uses less memory for small sorted sets.
- Forced skiplist encoding increases memory overhead but is optimized for larger/complex operations.
- For large leaderboards (100k+), skiplist is expected and appropriate.

## 4) Notes

- Redis 7 internally maps legacy `ziplist` configs to `listpack`, but the legacy config works as expected for forced configurations.
- The project leaderboard (`leaderboard:global`) naturally crosses compact thresholds and is stored as skiplist for high-scale ranking operations.

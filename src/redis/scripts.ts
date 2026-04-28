export const invalidateAndCreateSessionLua = `
local userSetKey = KEYS[1]
local newSessionKey = KEYS[2]

local newSessionId = ARGV[1]
local userId = ARGV[2]
local createdAt = ARGV[3]
local ipAddress = ARGV[4]
local deviceType = ARGV[5]
local ttl = tonumber(ARGV[6])

local oldSessions = redis.call('SMEMBERS', userSetKey)
for _, sid in ipairs(oldSessions) do
  redis.call('DEL', 'session:' .. sid)
end

redis.call('DEL', userSetKey)
redis.call('SADD', userSetKey, newSessionId)
redis.call('HSET', newSessionKey,
  'userId', userId,
  'createdAt', createdAt,
  'lastActive', createdAt,
  'ipAddress', ipAddress,
  'deviceType', deviceType
)
redis.call('EXPIRE', newSessionKey, ttl)

return newSessionId
`;

export const submitAnswerLua = `
local roundKey = KEYS[1]
local submissionsKey = KEYS[2]
local leaderboardKey = KEYS[3]

local playerId = ARGV[1]
local answer = ARGV[2]
local currentTime = tonumber(ARGV[3])
local points = tonumber(ARGV[4])

local endTime = redis.call('HGET', roundKey, 'endTime')
if not endTime or currentTime >= tonumber(endTime) then
  return {'ERROR', 'ROUND_EXPIRED'}
end

if redis.call('SISMEMBER', submissionsKey, playerId) == 1 then
  return {'ERROR', 'DUPLICATE_SUBMISSION'}
end

redis.call('SADD', submissionsKey, playerId)
redis.call('HSET', roundKey, 'answer:' .. playerId, answer)

local newScore = redis.call('ZINCRBY', leaderboardKey, points, playerId)
return {'SUCCESS', newScore}
`;

import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const globalForRedis = globalThis as unknown as {
  redisClient: Redis | undefined;
  redisSubscriber: Redis | undefined;
};

export const redis =
  globalForRedis.redisClient ??
  new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      if (process.env.NODE_ENV === "production" && !process.env.DOCKER) {
        // limit reconnection spam if redis is not running during local build
        if (times > 3) return null;
      }
      return Math.min(times * 100, 2000);
    },
  });

redis.on("error", (err) => {
  // Silent in build or log warning
  if (process.env.NODE_ENV !== "production") {
    // console.warn("[Redis]", err.message);
  }
});

export function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  client.on("error", () => {});
  return client;
}

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisClient = redis;
}

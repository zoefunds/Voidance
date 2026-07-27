import { Redis } from "ioredis";
import { env } from "./config/env.js";
import { logger } from "./logger.js";

/**
 * Redis is optional infrastructure: a short-TTL response cache for the hot
 * read endpoints (/api/policies, /api/stats) and a distributed store for
 * express-rate-limit so limits stay correct across restarts and any future
 * multi-machine deploy. Its absence must never take the API down — every
 * caller of `redis` treats a null client (or a Redis error) as a cache miss
 * and falls straight through to Postgres, which is what keeps this service
 * "never dies" even if Upstash has a bad day.
 */
export const redis: Redis | null = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
      retryStrategy: (times: number) => Math.min(times * 200, 3000),
    })
  : null;

redis?.on("error", (err: Error) => {
  logger.warn({ err }, "redis error — falling back to direct DB reads");
});

redis?.on("connect", () => logger.info("redis connected"));

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // best-effort cache — a write failure is never fatal
  }
}

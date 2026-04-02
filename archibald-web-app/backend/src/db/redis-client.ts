import { Redis } from 'ioredis';

export type RedisClient = {
  set: (key: string, value: string, expiryMode: 'EX', ttlSeconds: number) => Promise<unknown>;
  exists: (key: string) => Promise<number>;
  del: (key: string) => Promise<number>;
};

export function createRedisClient(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });
}

export async function revokeToken(redis: RedisClient, jti: string, ttlSeconds: number): Promise<void> {
  await redis.set(`revoked:${jti}`, '1', 'EX', ttlSeconds);
}

export async function isTokenRevoked(redis: RedisClient, jti: string): Promise<boolean> {
  const result = await redis.exists(`revoked:${jti}`);
  return result === 1;
}

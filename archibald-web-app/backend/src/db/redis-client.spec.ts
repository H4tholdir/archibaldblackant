import { describe, expect, test, vi } from 'vitest';
import { revokeToken, isTokenRevoked } from './redis-client';
import type { RedisClient } from './redis-client';

const jti = 'test-jti-uuid';
const ttlSeconds = 8 * 60 * 60;

function makeRedisStub(existsResult: number): RedisClient & { set: ReturnType<typeof vi.fn>; exists: ReturnType<typeof vi.fn> } {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    exists: vi.fn().mockResolvedValue(existsResult),
    del: vi.fn().mockResolvedValue(1),
  };
}

describe('revokeToken', () => {
  test('calls redis.set with the correct revoked key, value "1", EX mode, and ttl', async () => {
    const redis = makeRedisStub(0);
    await revokeToken(redis, jti, ttlSeconds);
    expect(redis.set).toHaveBeenCalledWith(`revoked:${jti}`, '1', 'EX', ttlSeconds);
  });
});

describe('isTokenRevoked', () => {
  test('returns true when redis.exists returns 1', async () => {
    const redis = makeRedisStub(1);
    const result = await isTokenRevoked(redis, jti);
    expect(result).toBe(true);
  });

  test('returns false when redis.exists returns 0', async () => {
    const redis = makeRedisStub(0);
    const result = await isTokenRevoked(redis, jti);
    expect(result).toBe(false);
  });
});

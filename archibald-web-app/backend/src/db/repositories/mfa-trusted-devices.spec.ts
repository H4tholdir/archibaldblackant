import { createHash } from 'crypto';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import type { QueryResult } from 'pg';

function createMockPool(): { pool: DbPool; queryFn: ReturnType<typeof vi.fn> } {
  const queryFn = vi.fn();
  const pool = {
    query: queryFn,
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    withTransaction: vi.fn(),
  } as unknown as DbPool;
  return { pool, queryFn };
}

const SAMPLE_USER_ID = 'user-abc-123';
const SAMPLE_DEVICE_ID = 'device-xyz-456';
const SAMPLE_RAW_TOKEN = 'a'.repeat(64);

describe('createTrustToken', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('calls DELETE before INSERT (correct order, no race with old tokens)', async () => {
    const { pool, queryFn } = createMockPool();
    queryFn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);

    const { createTrustToken } = await import('./mfa-trusted-devices');
    await createTrustToken(pool, SAMPLE_USER_ID, SAMPLE_DEVICE_ID);

    expect(queryFn).toHaveBeenCalledTimes(2);
    const firstCall = queryFn.mock.calls[0][0] as string;
    const secondCall = queryFn.mock.calls[1][0] as string;
    expect(firstCall).toContain('DELETE FROM agents.mfa_trusted_devices');
    expect(secondCall).toContain('INSERT INTO agents.mfa_trusted_devices');
  });

  test('returns a hex string of 64 characters (32 random bytes)', async () => {
    const { pool, queryFn } = createMockPool();
    queryFn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);

    const { createTrustToken } = await import('./mfa-trusted-devices');
    const raw = await createTrustToken(pool, SAMPLE_USER_ID, SAMPLE_DEVICE_ID);

    expect(raw).toMatch(/^[0-9a-f]{64}$/);
  });

  test('passes userId, deviceId, and SHA-256 hash of raw token to INSERT', async () => {
    const { pool, queryFn } = createMockPool();
    queryFn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);

    const { createTrustToken } = await import('./mfa-trusted-devices');
    const raw = await createTrustToken(pool, SAMPLE_USER_ID, SAMPLE_DEVICE_ID);

    const insertCall = queryFn.mock.calls[1];
    const insertParams = insertCall[1] as string[];
    const [passedUserId, passedDeviceId, passedHash] = insertParams;

    expect(passedUserId).toBe(SAMPLE_USER_ID);
    expect(passedDeviceId).toBe(SAMPLE_DEVICE_ID);
    expect(passedHash).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(passedHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyTrustToken', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('returns true when pool returns non-empty rows', async () => {
    const { pool, queryFn } = createMockPool();
    queryFn.mockResolvedValue({
      rows: [{ id: 'trust-row-1' }],
      rowCount: 1,
    } as unknown as QueryResult);

    const { verifyTrustToken } = await import('./mfa-trusted-devices');
    const result = await verifyTrustToken(pool, SAMPLE_USER_ID, SAMPLE_DEVICE_ID, SAMPLE_RAW_TOKEN);

    expect(result).toBe(true);
  });

  test('returns false when pool returns empty rows', async () => {
    const { pool, queryFn } = createMockPool();
    queryFn.mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as unknown as QueryResult);

    const { verifyTrustToken } = await import('./mfa-trusted-devices');
    const result = await verifyTrustToken(pool, SAMPLE_USER_ID, SAMPLE_DEVICE_ID, SAMPLE_RAW_TOKEN);

    expect(result).toBe(false);
  });

  test('query includes expires_at > NOW() expiry check', async () => {
    const { pool, queryFn } = createMockPool();
    queryFn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);

    const { verifyTrustToken } = await import('./mfa-trusted-devices');
    await verifyTrustToken(pool, SAMPLE_USER_ID, SAMPLE_DEVICE_ID, SAMPLE_RAW_TOKEN);

    const querySql = queryFn.mock.calls[0][0] as string;
    expect(querySql).toContain('expires_at > NOW()');
  });
});

describe('revokeAllTrustTokens', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('calls DELETE with the correct userId', async () => {
    const { pool, queryFn } = createMockPool();
    queryFn.mockResolvedValue({ rows: [], rowCount: 3 } as unknown as QueryResult);

    const { revokeAllTrustTokens } = await import('./mfa-trusted-devices');
    await revokeAllTrustTokens(pool, SAMPLE_USER_ID);

    expect(queryFn).toHaveBeenCalledTimes(1);
    const [sql, params] = queryFn.mock.calls[0] as [string, string[]];
    expect(sql).toContain('DELETE FROM agents.mfa_trusted_devices');
    expect(params).toEqual([SAMPLE_USER_ID]);
  });
});

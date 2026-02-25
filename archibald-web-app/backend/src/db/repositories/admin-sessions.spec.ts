import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import type { QueryResult } from 'pg';

function createMockPool(queryFn: ReturnType<typeof vi.fn>): DbPool {
  return {
    query: queryFn,
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

describe('createSession', () => {
  const ADMIN_USER_ID = 'admin-user-001';
  const IMPERSONATED_USER_ID = 'agent-user-042';
  const RETURNED_SESSION_ID = 7;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('inserts session and returns RETURNING id', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [{ id: RETURNED_SESSION_ID }],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { createSession } = await import('./admin-sessions');
    const result = await createSession(pool, ADMIN_USER_ID, IMPERSONATED_USER_ID);

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO system.admin_sessions'),
      [ADMIN_USER_ID, IMPERSONATED_USER_ID, expect.any(Number), expect.any(Number)],
    );
    expect(result).toBe(RETURNED_SESSION_ID);
  });

  test('passes Date.now() timestamps for started_at and last_active', async () => {
    const frozenNow = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(frozenNow);

    const queryFn = vi.fn().mockResolvedValue({
      rows: [{ id: 1 }],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { createSession } = await import('./admin-sessions');
    await createSession(pool, ADMIN_USER_ID, IMPERSONATED_USER_ID);

    expect(queryFn).toHaveBeenCalledWith(
      expect.any(String),
      [ADMIN_USER_ID, IMPERSONATED_USER_ID, frozenNow, frozenNow],
    );
  });
});

describe('closeSession', () => {
  const SESSION_ID = 7;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('updates ended_at for the given session id', async () => {
    const frozenNow = 1700000099000;
    vi.spyOn(Date, 'now').mockReturnValue(frozenNow);

    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { closeSession } = await import('./admin-sessions');
    await closeSession(pool, SESSION_ID);

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE system.admin_sessions'),
      [SESSION_ID, frozenNow],
    );
  });

  test('is idempotent — does not throw when session already closed or not found', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { closeSession } = await import('./admin-sessions');

    await expect(closeSession(pool, 999)).resolves.toBeUndefined();
  });
});

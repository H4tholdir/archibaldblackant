import { describe, expect, test, vi } from 'vitest';
import {
  createCircuitBreaker,
  CONSECUTIVE_THRESHOLD,
  DAILY_THRESHOLD,
  PAUSE_DURATION_MS,
  DAILY_PAUSE_DURATION_MS,
} from './circuit-breaker';

function createMockPool(queryResults: { rows: unknown[]; rowCount?: number }[] = []) {
  let callIndex = 0;
  const mockQuery = vi.fn().mockImplementation(() => {
    const result = queryResults[callIndex] ?? { rows: [], rowCount: 0 };
    callIndex++;
    return Promise.resolve(result);
  });

  return {
    query: mockQuery,
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn(),
  };
}

describe('createCircuitBreaker', () => {
  const userId = 'agent-001';
  const syncType = 'customers';

  describe('isPaused', () => {
    test('returns false when no state exists', async () => {
      const pool = createMockPool([{ rows: [] }]);
      const cb = createCircuitBreaker(pool);

      const result = await cb.isPaused(userId, syncType);

      expect(result).toBe(false);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('system.circuit_breaker'),
        [userId, syncType],
      );
    });

    test('returns true when paused_until is in the future', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const pool = createMockPool([{ rows: [{ paused_until: futureDate }] }]);
      const cb = createCircuitBreaker(pool);

      const result = await cb.isPaused(userId, syncType);

      expect(result).toBe(true);
    });

    test('returns false when paused_until is in the past', async () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const pool = createMockPool([{ rows: [{ paused_until: pastDate }] }]);
      const cb = createCircuitBreaker(pool);

      const result = await cb.isPaused(userId, syncType);

      expect(result).toBe(false);
    });

    test('returns false when paused_until is null', async () => {
      const pool = createMockPool([{ rows: [{ paused_until: null }] }]);
      const cb = createCircuitBreaker(pool);

      const result = await cb.isPaused(userId, syncType);

      expect(result).toBe(false);
    });
  });

  describe('recordFailure', () => {
    test('executes UPSERT with correct SQL and parameters', async () => {
      const pool = createMockPool([{ rows: [] }]);
      const cb = createCircuitBreaker(pool);
      const errorMessage = 'ERP connection timeout';

      await cb.recordFailure(userId, syncType, errorMessage);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO system.circuit_breaker');
      expect(sql).toContain('ON CONFLICT (user_id, sync_type)');
      expect(sql).toContain('consecutive_failures');
      expect(sql).toContain('total_failures_24h');
      expect(params).toEqual(expect.arrayContaining([userId, syncType, errorMessage]));
    });

    test('sets paused_until when consecutive threshold is reached', async () => {
      const pool = createMockPool([{ rows: [] }]);
      const cb = createCircuitBreaker(pool);

      await cb.recordFailure(userId, syncType, 'timeout');

      const [sql] = pool.query.mock.calls[0];
      expect(sql).toContain('paused_until');
      expect(sql).toContain(String(CONSECUTIVE_THRESHOLD));
    });

    test('sets longer pause when daily threshold is reached', async () => {
      const pool = createMockPool([{ rows: [] }]);
      const cb = createCircuitBreaker(pool);

      await cb.recordFailure(userId, syncType, 'timeout');

      const [sql] = pool.query.mock.calls[0];
      expect(sql).toContain(String(DAILY_THRESHOLD));
    });
  });

  describe('recordSuccess', () => {
    test('executes UPSERT that resets consecutive_failures and clears paused_until', async () => {
      const pool = createMockPool([{ rows: [] }]);
      const cb = createCircuitBreaker(pool);

      await cb.recordSuccess(userId, syncType);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO system.circuit_breaker');
      expect(sql).toContain('ON CONFLICT (user_id, sync_type)');
      expect(sql).toContain('consecutive_failures = 0');
      expect(sql).toContain('paused_until = NULL');
      expect(sql).toContain('last_success_at');
      expect(params).toEqual([userId, syncType]);
    });
  });

  describe('resetForUser', () => {
    test('deletes all circuit breaker rows for the given user', async () => {
      const pool = createMockPool([{ rows: [], rowCount: 2 }]);
      const cb = createCircuitBreaker(pool);

      await cb.resetForUser(userId);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toContain('DELETE FROM system.circuit_breaker');
      expect(sql).toContain('user_id = $1');
      expect(params).toEqual([userId]);
    });
  });

  describe('resetDailyCounts', () => {
    test('resets total_failures_24h to 0 for all rows where it is positive', async () => {
      const pool = createMockPool([{ rows: [], rowCount: 3 }]);
      const cb = createCircuitBreaker(pool);

      await cb.resetDailyCounts();

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql] = pool.query.mock.calls[0];
      expect(sql).toContain('UPDATE system.circuit_breaker');
      expect(sql).toContain('total_failures_24h = 0');
      expect(sql).toContain('total_failures_24h > 0');
    });
  });

  describe('getState', () => {
    test('returns null when no state exists', async () => {
      const pool = createMockPool([{ rows: [] }]);
      const cb = createCircuitBreaker(pool);

      const result = await cb.getState(userId, syncType);

      expect(result).toBeNull();
    });

    test('returns mapped state when row exists', async () => {
      const now = new Date();
      const pool = createMockPool([{
        rows: [{
          user_id: userId,
          sync_type: syncType,
          consecutive_failures: 2,
          total_failures_24h: 4,
          last_failure_at: now.toISOString(),
          paused_until: null,
          last_error: 'connection refused',
          last_success_at: null,
          updated_at: now.toISOString(),
        }],
      }]);
      const cb = createCircuitBreaker(pool);

      const result = await cb.getState(userId, syncType);

      expect(result).toEqual({
        userId,
        syncType,
        consecutiveFailures: 2,
        totalFailures24h: 4,
        lastFailureAt: expect.any(Date),
        pausedUntil: null,
        lastError: 'connection refused',
        lastSuccessAt: null,
        updatedAt: expect.any(Date),
      });
    });

    test('maps all date fields correctly when present', async () => {
      const failureDate = new Date('2026-03-28T10:00:00Z');
      const pauseDate = new Date('2026-03-28T12:00:00Z');
      const successDate = new Date('2026-03-28T08:00:00Z');
      const updatedDate = new Date('2026-03-28T10:00:00Z');

      const pool = createMockPool([{
        rows: [{
          user_id: userId,
          sync_type: syncType,
          consecutive_failures: 3,
          total_failures_24h: 6,
          last_failure_at: failureDate.toISOString(),
          paused_until: pauseDate.toISOString(),
          last_error: 'ERP down',
          last_success_at: successDate.toISOString(),
          updated_at: updatedDate.toISOString(),
        }],
      }]);
      const cb = createCircuitBreaker(pool);

      const result = await cb.getState(userId, syncType);

      expect(result).toEqual({
        userId,
        syncType,
        consecutiveFailures: 3,
        totalFailures24h: 6,
        lastFailureAt: failureDate,
        pausedUntil: pauseDate,
        lastError: 'ERP down',
        lastSuccessAt: successDate,
        updatedAt: updatedDate,
      });
    });
  });

  describe('constants', () => {
    test('thresholds match documented values', () => {
      expect(CONSECUTIVE_THRESHOLD).toBe(3);
      expect(DAILY_THRESHOLD).toBe(6);
      expect(PAUSE_DURATION_MS).toBe(2 * 60 * 60 * 1000);
      expect(DAILY_PAUSE_DURATION_MS).toBe(24 * 60 * 60 * 1000);
    });
  });
});

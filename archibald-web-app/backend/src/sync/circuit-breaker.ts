import type { DbPool } from '../db/pool';

type CircuitBreakerState = {
  userId: string;
  syncType: string;
  consecutiveFailures: number;
  totalFailures24h: number;
  lastFailureAt: Date | null;
  pausedUntil: Date | null;
  lastError: string | null;
  lastSuccessAt: Date | null;
  updatedAt: Date;
};

type CircuitBreakerRow = {
  user_id: string;
  sync_type: string;
  consecutive_failures: number;
  total_failures_24h: number;
  last_failure_at: string | null;
  paused_until: string | null;
  last_error: string | null;
  last_success_at: string | null;
  updated_at: string;
};

const CONSECUTIVE_THRESHOLD = 3;
const DAILY_THRESHOLD = 6;
const PAUSE_DURATION_MS = 2 * 60 * 60 * 1000;
const DAILY_PAUSE_DURATION_MS = 24 * 60 * 60 * 1000;

function toDateOrNull(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function mapRowToState(row: CircuitBreakerRow): CircuitBreakerState {
  return {
    userId: row.user_id,
    syncType: row.sync_type,
    consecutiveFailures: row.consecutive_failures,
    totalFailures24h: row.total_failures_24h,
    lastFailureAt: toDateOrNull(row.last_failure_at),
    pausedUntil: toDateOrNull(row.paused_until),
    lastError: row.last_error,
    lastSuccessAt: toDateOrNull(row.last_success_at),
    updatedAt: new Date(row.updated_at),
  };
}

function createCircuitBreaker(pool: DbPool) {
  return {
    async isPaused(userId: string, syncType: string): Promise<boolean> {
      const { rows } = await pool.query<{ paused_until: string | null }>(
        `SELECT paused_until FROM system.circuit_breaker
         WHERE user_id = $1 AND sync_type = $2`,
        [userId, syncType],
      );

      if (rows.length === 0) return false;
      const pausedUntil = rows[0].paused_until;
      if (!pausedUntil) return false;

      return new Date(pausedUntil) > new Date();
    },

    async recordFailure(userId: string, syncType: string, error: string): Promise<void> {
      await pool.query(
        `INSERT INTO system.circuit_breaker (user_id, sync_type, consecutive_failures, total_failures_24h, last_failure_at, last_error, paused_until, updated_at)
         VALUES ($1, $2, 1, 1, NOW(), $3,
           CASE WHEN 1 >= ${CONSECUTIVE_THRESHOLD} THEN NOW() + INTERVAL '${PAUSE_DURATION_MS / 1000} seconds'
                WHEN 1 >= ${DAILY_THRESHOLD} THEN NOW() + INTERVAL '${DAILY_PAUSE_DURATION_MS / 1000} seconds'
                ELSE NULL END,
           NOW())
         ON CONFLICT (user_id, sync_type) DO UPDATE SET
           consecutive_failures = system.circuit_breaker.consecutive_failures + 1,
           total_failures_24h = system.circuit_breaker.total_failures_24h + 1,
           last_failure_at = NOW(),
           last_error = $3,
           paused_until = CASE
             WHEN system.circuit_breaker.total_failures_24h + 1 >= ${DAILY_THRESHOLD}
               THEN NOW() + INTERVAL '${DAILY_PAUSE_DURATION_MS / 1000} seconds'
             WHEN system.circuit_breaker.consecutive_failures + 1 >= ${CONSECUTIVE_THRESHOLD}
               THEN NOW() + INTERVAL '${PAUSE_DURATION_MS / 1000} seconds'
             ELSE system.circuit_breaker.paused_until END,
           updated_at = NOW()`,
        [userId, syncType, error],
      );
    },

    async recordSuccess(userId: string, syncType: string): Promise<void> {
      await pool.query(
        `INSERT INTO system.circuit_breaker (user_id, sync_type, consecutive_failures, total_failures_24h, last_success_at, updated_at)
         VALUES ($1, $2, 0, 0, NOW(), NOW())
         ON CONFLICT (user_id, sync_type) DO UPDATE SET
           consecutive_failures = 0,
           paused_until = NULL,
           last_success_at = NOW(),
           updated_at = NOW()`,
        [userId, syncType],
      );
    },

    async resetForUser(userId: string): Promise<void> {
      await pool.query(
        `DELETE FROM system.circuit_breaker WHERE user_id = $1`,
        [userId],
      );
    },

    async resetDailyCounts(): Promise<void> {
      await pool.query(
        `UPDATE system.circuit_breaker SET total_failures_24h = 0, updated_at = NOW()
         WHERE total_failures_24h > 0`,
      );
    },

    async getState(userId: string, syncType: string): Promise<CircuitBreakerState | null> {
      const { rows } = await pool.query<CircuitBreakerRow>(
        `SELECT user_id, sync_type, consecutive_failures, total_failures_24h,
                last_failure_at, paused_until, last_error, last_success_at, updated_at
         FROM system.circuit_breaker
         WHERE user_id = $1 AND sync_type = $2`,
        [userId, syncType],
      );

      if (rows.length === 0) return null;
      return mapRowToState(rows[0]);
    },
  };
}

export {
  createCircuitBreaker,
  mapRowToState,
  toDateOrNull,
  CONSECUTIVE_THRESHOLD,
  DAILY_THRESHOLD,
  PAUSE_DURATION_MS,
  DAILY_PAUSE_DURATION_MS,
};
export type { CircuitBreakerState, CircuitBreakerRow };

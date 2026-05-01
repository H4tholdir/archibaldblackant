import type { DbPool } from '../pool';

export type CircuitState = 'closed' | 'open' | 'half_open';

export type CircuitStateRow = {
  userId: string;
  state: CircuitState;
  consecutiveErpFailures: number;
  openedAt: Date | null;
  lastProbeAt: Date | null;
  nextProbeAt: Date | null;
  lastErrorMessage: string | null;
  updatedAt: Date;
};

export async function getState(pool: DbPool, userId: string): Promise<CircuitStateRow | null> {
  const { rows } = await pool.query<{
    user_id: string;
    state: CircuitState;
    consecutive_erp_failures: number;
    opened_at: Date | null;
    last_probe_at: Date | null;
    next_probe_at: Date | null;
    last_error_message: string | null;
    updated_at: Date;
  }>(
    `SELECT user_id, state, consecutive_erp_failures, opened_at, last_probe_at,
            next_probe_at, last_error_message, updated_at
     FROM system.agent_circuit_state WHERE user_id = $1`,
    [userId],
  );
  if (!rows[0]) return null;
  return {
    userId: rows[0].user_id,
    state: rows[0].state,
    consecutiveErpFailures: rows[0].consecutive_erp_failures,
    openedAt: rows[0].opened_at,
    lastProbeAt: rows[0].last_probe_at,
    nextProbeAt: rows[0].next_probe_at,
    lastErrorMessage: rows[0].last_error_message,
    updatedAt: rows[0].updated_at,
  };
}

export async function recordErpFailure(
  pool: DbPool,
  userId: string,
  errorMessage: string,
): Promise<{ shouldOpen: boolean; failures: number }> {
  const { rows: [row] } = await pool.query<{ consecutive_erp_failures: number }>(
    `INSERT INTO system.agent_circuit_state (user_id, state, consecutive_erp_failures, last_error_message, updated_at)
     VALUES ($1, 'closed', 1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET
       consecutive_erp_failures = system.agent_circuit_state.consecutive_erp_failures + 1,
       last_error_message = $2,
       updated_at = now()
     RETURNING consecutive_erp_failures`,
    [userId, errorMessage],
  );
  return { shouldOpen: row.consecutive_erp_failures >= 3, failures: row.consecutive_erp_failures };
}

export async function openCircuit(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE system.agent_circuit_state
     SET state = 'open', opened_at = now(),
         next_probe_at = now() + INTERVAL '5 minutes',
         updated_at = now()
     WHERE user_id = $1`,
    [userId],
  );
}

export async function setHalfOpen(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE system.agent_circuit_state
     SET state = 'half_open', last_probe_at = now(), updated_at = now()
     WHERE user_id = $1`,
    [userId],
  );
}

export async function closeCircuit(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE system.agent_circuit_state
     SET state = 'closed', consecutive_erp_failures = 0,
         opened_at = NULL, last_error_message = NULL, updated_at = now()
     WHERE user_id = $1`,
    [userId],
  );
}

export async function rescheduleProbe(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE system.agent_circuit_state
     SET state = 'open', last_probe_at = now(),
         next_probe_at = now() + INTERVAL '5 minutes',
         updated_at = now()
     WHERE user_id = $1`,
    [userId],
  );
}

export async function findCircuitsToProbe(pool: DbPool): Promise<string[]> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM system.agent_circuit_state
     WHERE state = 'open' AND next_probe_at <= now()`,
  );
  return rows.map(r => r.user_id);
}

export async function recordErpSuccess(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO system.agent_circuit_state (user_id, state, consecutive_erp_failures, updated_at)
     VALUES ($1, 'closed', 0, now())
     ON CONFLICT (user_id) DO UPDATE SET
       consecutive_erp_failures = 0,
       state = 'closed',
       opened_at = NULL,
       updated_at = now()`,
    [userId],
  );
}

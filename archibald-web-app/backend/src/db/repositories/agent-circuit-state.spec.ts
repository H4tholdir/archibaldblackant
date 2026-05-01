import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createPool } from '../pool';
import {
  getState, recordErpFailure, openCircuit, setHalfOpen, closeCircuit,
  rescheduleProbe, findCircuitsToProbe, recordErpSuccess,
} from './agent-circuit-state';

const skipIf = process.env.CI === 'true' || !process.env.PG_HOST;

const pool = createPool({
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5432),
  database: process.env.PG_DATABASE ?? 'archibald_test',
  user: process.env.PG_USER ?? 'archibald',
  password: process.env.PG_PASSWORD ?? 'archibald',
  maxConnections: 5,
});

describe.skipIf(skipIf)('agent-circuit-state repository', () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM system.agent_circuit_state WHERE user_id LIKE 'test_%'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM system.agent_circuit_state WHERE user_id LIKE 'test_%'");
    await pool.end();
  });

  it('records first failure and creates row in closed state', async () => {
    const result = await recordErpFailure(pool, 'test_a', 'login failed');
    expect(result.failures).toBe(1);
    expect(result.shouldOpen).toBe(false);
  });

  it('triggers shouldOpen=true on 3rd failure', async () => {
    await recordErpFailure(pool, 'test_b', 'err1');
    await recordErpFailure(pool, 'test_b', 'err2');
    const result = await recordErpFailure(pool, 'test_b', 'err3');
    expect(result.shouldOpen).toBe(true);
    expect(result.failures).toBe(3);
  });

  it('opens circuit and sets next_probe_at', async () => {
    await recordErpFailure(pool, 'test_c', 'err');
    await openCircuit(pool, 'test_c');
    const state = await getState(pool, 'test_c');
    expect(state?.state).toBe('open');
    expect(state?.nextProbeAt).toBeDefined();
  });

  it('findCircuitsToProbe returns open circuits with past next_probe_at', async () => {
    await recordErpFailure(pool, 'test_d', 'err');
    await openCircuit(pool, 'test_d');
    await pool.query(
      "UPDATE system.agent_circuit_state SET next_probe_at = now() - INTERVAL '1 minute' WHERE user_id = 'test_d'",
    );
    const toProbe = await findCircuitsToProbe(pool);
    expect(toProbe).toContain('test_d');
  });

  it('closeCircuit resets consecutive_erp_failures to 0', async () => {
    await recordErpFailure(pool, 'test_e', 'err');
    await recordErpFailure(pool, 'test_e', 'err');
    await closeCircuit(pool, 'test_e');
    const state = await getState(pool, 'test_e');
    expect(state?.state).toBe('closed');
    expect(state?.consecutiveErpFailures).toBe(0);
  });

  it('recordErpSuccess resets open circuit to closed with 0 failures', async () => {
    await recordErpFailure(pool, 'test_f', 'err');
    await recordErpFailure(pool, 'test_f', 'err');
    await recordErpFailure(pool, 'test_f', 'err');
    await openCircuit(pool, 'test_f');
    await recordErpSuccess(pool, 'test_f');
    const state = await getState(pool, 'test_f');
    expect(state?.state).toBe('closed');
    expect(state?.consecutiveErpFailures).toBe(0);
  });
});

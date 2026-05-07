import { describe, it, test, expect, beforeEach, afterAll } from 'vitest';
import { createPool } from '../pool';
import type { DbPool } from '../pool';
import {
  enqueueTask,
  pickupNextTask,
  updateTaskHeartbeat,
  updateTaskPhase,
  completeTask,
  failTask,
  findOrphanRunningTasks,
  countActiveByUser,
} from './agent-queue';

const skipIf = process.env.CI === 'true' || !process.env.PG_HOST;

const pool: DbPool = createPool({
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5432),
  database: process.env.PG_DATABASE ?? 'archibald_test',
  user: process.env.PG_USER ?? 'archibald',
  password: process.env.PG_PASSWORD ?? 'archibald',
  maxConnections: 5,
});

describe.skipIf(skipIf)('agent-queue repository', () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM system.agent_operation_queue WHERE user_id LIKE 'test_%'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM system.agent_operation_queue WHERE user_id LIKE 'test_%'");
    await pool.end();
  });

  describe('enqueueTask', () => {
    it('inserts a task with status enqueued and computed position', async () => {
      const taskId = await enqueueTask(pool, {
        userId: 'test_alice',
        taskType: 'submit-order',
        payload: { pendingOrderId: 'p1' },
      });

      expect(taskId).toBeGreaterThan(0n);

      const { rows } = await pool.query<{ status: string; position: number }>(
        'SELECT status, position FROM system.agent_operation_queue WHERE task_id = $1',
        [taskId.toString()],
      );
      expect(rows[0].status).toBe('enqueued');
      expect(rows[0].position).toBe(1);
    });

    it('assigns position incrementally per user', async () => {
      const t1 = await enqueueTask(pool, { userId: 'test_bob', taskType: 'submit-order', payload: {} });
      const t2 = await enqueueTask(pool, { userId: 'test_bob', taskType: 'submit-order', payload: {} });
      const t3 = await enqueueTask(pool, { userId: 'test_charlie', taskType: 'submit-order', payload: {} });

      const { rows } = await pool.query<{ task_id: string; position: number; user_id: string }>(
        'SELECT task_id, position, user_id FROM system.agent_operation_queue WHERE task_id IN ($1, $2, $3) ORDER BY task_id',
        [t1.toString(), t2.toString(), t3.toString()],
      );
      expect(rows.find(r => BigInt(r.task_id) === t1)?.position).toBe(1);
      expect(rows.find(r => BigInt(r.task_id) === t2)?.position).toBe(2);
      expect(rows.find(r => BigInt(r.task_id) === t3)?.position).toBe(1);
    });
  });

  describe('pickupNextTask', () => {
    it('returns the next enqueued task (FIFO by enqueued_at among same priority)', async () => {
      const t1 = await enqueueTask(pool, { userId: 'test_dave', taskType: 'submit-order', payload: { p: 1 } });
      await enqueueTask(pool, { userId: 'test_dave', taskType: 'submit-order', payload: { p: 2 } });

      const pickedFirst = await pickupNextTask(pool);
      expect(pickedFirst?.taskId).toBe(t1);
      expect(pickedFirst?.status).toBe('running');
    });

    it('returns null if no enqueued tasks', async () => {
      const picked = await pickupNextTask(pool);
      expect(picked).toBeNull();
    });

    it('does not pickup a task already running for the same user', async () => {
      await enqueueTask(pool, { userId: 'test_frank', taskType: 'submit-order', payload: {} });
      await pickupNextTask(pool); // mark as running
      const second = await pickupNextTask(pool);
      expect(second).toBeNull();
    });

    it('non preleva il secondo task se il primo è ancora running — bug concorrenza', async () => {
      // Scenario reale: 3 ordini enqueued quasi simultaneamente per lo stesso utente.
      // Il worker prende il primo (running). Prima del fix, un secondo worker poteva
      // prendere il secondo task ignorando lo stato 'running' del primo.
      const t1 = await enqueueTask(pool, { userId: 'test_concurr', taskType: 'submit-order', payload: { order: 1 } });
      await enqueueTask(pool, { userId: 'test_concurr', taskType: 'submit-order', payload: { order: 2 } });
      await enqueueTask(pool, { userId: 'test_concurr', taskType: 'submit-order', payload: { order: 3 } });

      // Worker1 prende il primo task
      const picked1 = await pickupNextTask(pool);
      expect(picked1?.taskId).toBe(t1);
      expect(picked1?.status).toBe('running');

      // Worker2 tenta di prendere un task mentre Worker1 è ancora 'running' → deve tornare null
      const picked2 = await pickupNextTask(pool);
      expect(picked2).toBeNull();

      // Anche Worker3 → null
      const picked3 = await pickupNextTask(pool);
      expect(picked3).toBeNull();
    });
  });

  describe('updateTaskPhase', () => {
    it('persists phase and erp_order_id together (atomic)', async () => {
      const t = await enqueueTask(pool, { userId: 'test_g', taskType: 'submit-order', payload: {} });
      await pickupNextTask(pool);

      await updateTaskPhase(pool, t, 'erp_save_done', '53.805');

      const { rows } = await pool.query<{ phase: string; erp_order_id: string }>(
        'SELECT phase, erp_order_id FROM system.agent_operation_queue WHERE task_id = $1',
        [t.toString()],
      );
      expect(rows[0].phase).toBe('erp_save_done');
      expect(rows[0].erp_order_id).toBe('53.805');
    });
  });

  describe('findOrphanRunningTasks', () => {
    it('returns tasks running with stale heartbeat', async () => {
      const t = await enqueueTask(pool, { userId: 'test_h', taskType: 'submit-order', payload: {} });
      await pickupNextTask(pool);
      // Force heartbeat backwards
      await pool.query(
        "UPDATE system.agent_operation_queue SET heartbeat_at = now() - INTERVAL '90 seconds' WHERE task_id = $1",
        [t.toString()],
      );

      const orphans = await findOrphanRunningTasks(pool, 60);
      expect(orphans.find(o => o.taskId === t)).toBeDefined();
    });
  });

  describe('countActiveByUser', () => {
    it('counts tasks in enqueued + running for a user', async () => {
      await enqueueTask(pool, { userId: 'test_i', taskType: 'submit-order', payload: {} });
      await enqueueTask(pool, { userId: 'test_i', taskType: 'submit-order', payload: {} });
      const t3 = await enqueueTask(pool, { userId: 'test_i', taskType: 'submit-order', payload: {} });
      await completeTask(pool, t3);

      const count = await countActiveByUser(pool, 'test_i');
      expect(count).toBe(2);
    });
  });
});

describe.skipIf(process.env.CI === 'true' || !process.env.PG_HOST)('pickupNextTask priority', () => {
  const userId = 'test-user-priority';

  beforeEach(async () => {
    await pool.query(
      `DELETE FROM system.agent_operation_queue WHERE user_id = $1`, [userId]
    );
  });

  test('pickuppa P=10 prima di P=500 indipendentemente dall\'ordine di enqueue', async () => {
    // Enqueua prima P=500, poi P=10
    await pool.query(
      `INSERT INTO system.agent_operation_queue (user_id, task_type, payload, position, status, priority)
       VALUES ($1, 'sync-orders', '{}', 1, 'enqueued', 500)`,
      [userId]
    );
    await pool.query(
      `INSERT INTO system.agent_operation_queue (user_id, task_type, payload, position, status, priority)
       VALUES ($1, 'submit-order', '{}', 2, 'enqueued', 10)`,
      [userId]
    );

    const picked = await pickupNextTask(pool);
    expect(picked?.taskType).toBe('submit-order');
    expect(picked?.userId).toBe(userId);
  });

  test('rispetta run_after: non pickuppa task con run_after nel futuro', async () => {
    await pool.query(
      `INSERT INTO system.agent_operation_queue (user_id, task_type, payload, position, status, priority, run_after)
       VALUES ($1, 'sync-orders', '{}', 1, 'enqueued', 500, NOW() + INTERVAL '60 seconds')`,
      [userId]
    );

    const picked = await pickupNextTask(pool);
    expect(picked).toBeNull();
  });

  test('non pickuppa P=500 per userId in sync_paused_users', async () => {
    await pool.query(
      `INSERT INTO system.sync_paused_users (user_id, reason) VALUES ($1, 'test') ON CONFLICT DO NOTHING`,
      [userId]
    );
    await pool.query(
      `INSERT INTO system.agent_operation_queue (user_id, task_type, payload, position, status, priority)
       VALUES ($1, 'sync-orders', '{}', 1, 'enqueued', 500)`,
      [userId]
    );

    const picked = await pickupNextTask(pool);
    expect(picked).toBeNull();

    await pool.query(`DELETE FROM system.sync_paused_users WHERE user_id = $1`, [userId]);
  });
});

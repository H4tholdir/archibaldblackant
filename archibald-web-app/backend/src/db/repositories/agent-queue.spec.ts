import { describe, it, expect, beforeEach, afterAll } from 'vitest';
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
        [taskId],
      );
      expect(rows[0].status).toBe('enqueued');
      expect(rows[0].position).toBe(1);
    });

    it('assigns position incrementally per user', async () => {
      const t1 = await enqueueTask(pool, { userId: 'test_bob', taskType: 'submit-order', payload: {} });
      const t2 = await enqueueTask(pool, { userId: 'test_bob', taskType: 'submit-order', payload: {} });
      const t3 = await enqueueTask(pool, { userId: 'test_charlie', taskType: 'submit-order', payload: {} });

      const { rows } = await pool.query<{ task_id: bigint; position: number; user_id: string }>(
        'SELECT task_id, position, user_id FROM system.agent_operation_queue WHERE task_id IN ($1, $2, $3) ORDER BY task_id',
        [t1, t2, t3],
      );
      expect(rows.find(r => r.task_id === t1)?.position).toBe(1);
      expect(rows.find(r => r.task_id === t2)?.position).toBe(2);
      expect(rows.find(r => r.task_id === t3)?.position).toBe(1);
    });
  });

  describe('pickupNextTask', () => {
    it('returns the next enqueued task for the user (FIFO by position)', async () => {
      const t1 = await enqueueTask(pool, { userId: 'test_dave', taskType: 'submit-order', payload: { p: 1 } });
      await enqueueTask(pool, { userId: 'test_dave', taskType: 'submit-order', payload: { p: 2 } });

      const pickedFirst = await pickupNextTask(pool, 'test_dave');
      expect(pickedFirst?.taskId).toBe(t1);
      expect(pickedFirst?.status).toBe('running');
    });

    it('returns null if no enqueued tasks', async () => {
      const picked = await pickupNextTask(pool, 'test_eve');
      expect(picked).toBeNull();
    });

    it('does not pickup a task already running', async () => {
      await enqueueTask(pool, { userId: 'test_frank', taskType: 'submit-order', payload: {} });
      await pickupNextTask(pool, 'test_frank'); // mark as running
      const second = await pickupNextTask(pool, 'test_frank');
      expect(second).toBeNull();
    });
  });

  describe('updateTaskPhase', () => {
    it('persists phase and erp_order_id together (atomic)', async () => {
      const t = await enqueueTask(pool, { userId: 'test_g', taskType: 'submit-order', payload: {} });
      await pickupNextTask(pool, 'test_g');

      await updateTaskPhase(pool, t, 'erp_save_done', '53.805');

      const { rows } = await pool.query<{ phase: string; erp_order_id: string }>(
        'SELECT phase, erp_order_id FROM system.agent_operation_queue WHERE task_id = $1',
        [t],
      );
      expect(rows[0].phase).toBe('erp_save_done');
      expect(rows[0].erp_order_id).toBe('53.805');
    });
  });

  describe('findOrphanRunningTasks', () => {
    it('returns tasks running with stale heartbeat', async () => {
      const t = await enqueueTask(pool, { userId: 'test_h', taskType: 'submit-order', payload: {} });
      await pickupNextTask(pool, 'test_h');
      // Force heartbeat backwards
      await pool.query(
        "UPDATE system.agent_operation_queue SET heartbeat_at = now() - INTERVAL '90 seconds' WHERE task_id = $1",
        [t],
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

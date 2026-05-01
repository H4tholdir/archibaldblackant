import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createPool } from '../pool';
import { recordTaskStart, recordTaskFinish, recordPhase } from './bot-metrics';
import { enqueueTask } from './agent-queue';

const skipIf = process.env.CI === 'true' || !process.env.PG_HOST;

const pool = createPool({
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5432),
  database: process.env.PG_DATABASE ?? 'archibald_test',
  user: process.env.PG_USER ?? 'archibald',
  password: process.env.PG_PASSWORD ?? 'archibald',
  maxConnections: 5,
});

describe.skipIf(skipIf)('bot-metrics repository', () => {
  beforeEach(async () => {
    await pool.query(
      "DELETE FROM system.bot_phase_metrics WHERE task_id IN (SELECT task_id FROM system.bot_task_metrics WHERE user_id LIKE 'test_%')",
    );
    await pool.query("DELETE FROM system.bot_task_metrics WHERE user_id LIKE 'test_%'");
    await pool.query("DELETE FROM system.agent_operation_queue WHERE user_id LIKE 'test_%'");
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('recordTaskStart', () => {
    it('records task start with ui_duration_ms', async () => {
      const taskId = await enqueueTask(pool, {
        userId: 'test_metrics_a',
        taskType: 'submit-order',
        payload: {},
      });
      const enqueuedAt = new Date();
      await recordTaskStart(pool, {
        taskId,
        userId: 'test_metrics_a',
        taskType: 'submit-order',
        agentMode: 'simple',
        customerId: 'c1',
        customerName: 'Cust',
        numArticles: 5,
        uiStartedAt: new Date(Date.now() - 60000),
        uiCompletedAt: new Date(Date.now() - 1000),
        enqueuedAt,
        uiDurationMs: 59000,
      });
      const { rows } = await pool.query<{ ui_duration_ms: string }>(
        `SELECT ui_duration_ms FROM system.bot_task_metrics WHERE task_id = $1`,
        [taskId.toString()],
      );
      expect(parseInt(rows[0].ui_duration_ms, 10)).toBe(59000);
    });
  });

  describe('recordTaskFinish', () => {
    it('computes queue_wait_ms, bot_duration_ms, total_e2e_ms', async () => {
      const taskId = await enqueueTask(pool, {
        userId: 'test_metrics_b',
        taskType: 'submit-order',
        payload: {},
      });
      const enqueued = new Date();
      await recordTaskStart(pool, {
        taskId,
        userId: 'test_metrics_b',
        taskType: 'submit-order',
        enqueuedAt: enqueued,
        uiDurationMs: 10000,
      });
      const started = new Date(enqueued.getTime() + 2000);
      const completed = new Date(started.getTime() + 30000);
      await recordTaskFinish(pool, {
        taskId,
        startedAt: started,
        completedAt: completed,
        status: 'completed',
        retryCount: 0,
        orderId: '53.999',
        uiDurationMs: 10000,
      });
      const { rows } = await pool.query<{ total_e2e_ms: string; queue_wait_ms: string; bot_duration_ms: string }>(
        `SELECT total_e2e_ms, queue_wait_ms, bot_duration_ms FROM system.bot_task_metrics WHERE task_id = $1`,
        [taskId.toString()],
      );
      const queueWait = parseInt(rows[0].queue_wait_ms, 10);
      const botDuration = parseInt(rows[0].bot_duration_ms, 10);
      const totalE2e = parseInt(rows[0].total_e2e_ms, 10);

      expect(Math.round(queueWait / 1000)).toBe(2);   // 2 secondi
      expect(Math.round(botDuration / 1000)).toBe(30); // 30 secondi
      expect(Math.round(totalE2e / 1000)).toBe(42);    // 42 secondi
    });
  });

  describe('recordPhase', () => {
    it('records phase with computed duration_ms', async () => {
      const taskId = await enqueueTask(pool, {
        userId: 'test_metrics_c',
        taskType: 'submit-order',
        payload: {},
      });
      await recordTaskStart(pool, {
        taskId,
        userId: 'test_metrics_c',
        taskType: 'submit-order',
        enqueuedAt: new Date(),
      });
      const start = new Date();
      const end = new Date(start.getTime() + 15000);
      await recordPhase(pool, { taskId, phase: 'login', startedAt: start, completedAt: end });
      const { rows } = await pool.query<{ duration_ms: string }>(
        `SELECT duration_ms FROM system.bot_phase_metrics WHERE task_id = $1`,
        [taskId.toString()],
      );
      expect(parseInt(rows[0].duration_ms, 10)).toBe(15000);
    });
  });
});

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createPool } from '../db/pool';
import {
  enqueueTask,
  pickupNextTask,
  updateTaskPhase,
  getTaskById,
} from '../db/repositories/agent-queue';
import { recoverOrphans } from './auto-recovery';

const skipIf = process.env.CI === 'true' || !process.env.PG_HOST;

const pool = createPool({
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5432),
  database: process.env.PG_DATABASE ?? 'archibald_test',
  user: process.env.PG_USER ?? 'archibald',
  password: process.env.PG_PASSWORD ?? 'archibald',
  maxConnections: 5,
});

const forceOrphan = (taskId: bigint) =>
  pool.query(
    "UPDATE system.agent_operation_queue SET heartbeat_at = now() - INTERVAL '90 seconds' WHERE task_id = $1",
    [taskId.toString()],
  );

describe.skipIf(skipIf)('recoverOrphans', () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM system.agent_operation_queue WHERE user_id LIKE 'test_rec_%'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM system.agent_operation_queue WHERE user_id LIKE 'test_rec_%'");
    await pool.end();
  });

  it('calls resumeFromErpSaveDone for task with phase=erp_save_done and erpOrderId set', async () => {
    const taskId = await enqueueTask(pool, {
      userId: 'test_rec_a',
      taskType: 'submit-order',
      payload: { pendingOrderId: 'p1' },
    });
    await pickupNextTask(pool, 'test_rec_a');
    await updateTaskPhase(pool, taskId, 'erp_save_done', '53.999');
    await forceOrphan(taskId);

    const resumeFn = vi.fn().mockResolvedValue(undefined);
    const reEnqueueFn = vi.fn().mockResolvedValue(undefined);
    await recoverOrphans(pool, { resumeFromErpSaveDone: resumeFn, reEnqueueTask: reEnqueueFn });

    expect(resumeFn).toHaveBeenCalledWith(
      expect.objectContaining({ taskId, erpOrderId: '53.999' }),
    );
    expect(reEnqueueFn).not.toHaveBeenCalled();
  });

  it('calls reEnqueueTask for task with phase=null (not saved on ERP yet)', async () => {
    const taskId = await enqueueTask(pool, {
      userId: 'test_rec_b',
      taskType: 'submit-order',
      payload: {},
    });
    await pickupNextTask(pool, 'test_rec_b');
    await forceOrphan(taskId);

    const resumeFn = vi.fn().mockResolvedValue(undefined);
    const reEnqueueFn = vi.fn().mockResolvedValue(undefined);
    await recoverOrphans(pool, { resumeFromErpSaveDone: resumeFn, reEnqueueTask: reEnqueueFn });

    expect(reEnqueueFn).toHaveBeenCalledWith(expect.objectContaining({ taskId }));
    expect(resumeFn).not.toHaveBeenCalled();
  });

  it('marks completed for task with phase=db_committed', async () => {
    const taskId = await enqueueTask(pool, {
      userId: 'test_rec_c',
      taskType: 'submit-order',
      payload: {},
    });
    await pickupNextTask(pool, 'test_rec_c');
    await updateTaskPhase(pool, taskId, 'db_committed');
    await forceOrphan(taskId);

    await recoverOrphans(pool, {
      resumeFromErpSaveDone: vi.fn(),
      reEnqueueTask: vi.fn(),
    });

    const after = await getTaskById(pool, taskId);
    expect(after?.status).toBe('completed');
  });

  it('calls reEnqueueTask when phase=erp_save_done but erpOrderId is null', async () => {
    const taskId = await enqueueTask(pool, {
      userId: 'test_rec_d',
      taskType: 'submit-order',
      payload: {},
    });
    await pickupNextTask(pool, 'test_rec_d');
    await pool.query(
      "UPDATE system.agent_operation_queue SET phase = 'erp_save_done', heartbeat_at = now() - INTERVAL '90 seconds' WHERE task_id = $1",
      [taskId.toString()],
    );

    const resumeFn = vi.fn().mockResolvedValue(undefined);
    const reEnqueueFn = vi.fn().mockResolvedValue(undefined);
    await recoverOrphans(pool, { resumeFromErpSaveDone: resumeFn, reEnqueueTask: reEnqueueFn });

    expect(reEnqueueFn).toHaveBeenCalledWith(expect.objectContaining({ taskId }));
    expect(resumeFn).not.toHaveBeenCalled();
  });

  it('does nothing when there are no orphan tasks', async () => {
    const resumeFn = vi.fn().mockResolvedValue(undefined);
    const reEnqueueFn = vi.fn().mockResolvedValue(undefined);
    await recoverOrphans(pool, { resumeFromErpSaveDone: resumeFn, reEnqueueTask: reEnqueueFn });
    expect(resumeFn).not.toHaveBeenCalled();
    expect(reEnqueueFn).not.toHaveBeenCalled();
  });
});

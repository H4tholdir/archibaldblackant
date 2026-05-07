import { describe, test, expect, vi } from 'vitest';
import { enqueuePostOpSyncs } from './post-op-sync';
import type { DbPool } from '../db/pool';
import type { EnqueueWithDedupParams } from '../db/repositories/agent-queue';

const mockPool = {} as DbPool;

describe('enqueuePostOpSyncs', () => {
  test('dopo submit-order, enqueua sync-orders(P=100) e sync-order-articles(P=50)', async () => {
    const enqueuedTasks: Array<{ taskType: string; priority: number }> = [];
    const mockEnqueue = vi.fn().mockImplementation(async (_pool: DbPool, params: EnqueueWithDedupParams) => {
      enqueuedTasks.push({ taskType: params.taskType, priority: params.priority });
      return null;
    });

    await enqueuePostOpSyncs(mockPool, 'user-1', 'submit-order', { orderId: 'ord-1' }, mockEnqueue);

    expect(enqueuedTasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskType: 'sync-orders', priority: 100 }),
      expect.objectContaining({ taskType: 'sync-order-articles', priority: 50 }),
    ]));
  });

  test('dopo edit-order, enqueua sync-orders e sync-order-articles se orderId presente', async () => {
    const enqueuedTasks: Array<{ taskType: string }> = [];
    const mockEnqueue = vi.fn().mockImplementation(async (_pool: DbPool, params: EnqueueWithDedupParams) => {
      enqueuedTasks.push({ taskType: params.taskType });
      return null;
    });

    await enqueuePostOpSyncs(mockPool, 'user-1', 'edit-order', { orderId: 'ord-2' }, mockEnqueue);

    expect(enqueuedTasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskType: 'sync-orders' }),
      expect.objectContaining({ taskType: 'sync-order-articles' }),
    ]));
  });

  test('dopo submit-order senza orderId, enqueua solo sync-orders', async () => {
    const enqueuedTasks: Array<{ taskType: string }> = [];
    const mockEnqueue = vi.fn().mockImplementation(async (_pool: DbPool, params: EnqueueWithDedupParams) => {
      enqueuedTasks.push({ taskType: params.taskType });
      return null;
    });

    await enqueuePostOpSyncs(mockPool, 'user-1', 'submit-order', {}, mockEnqueue);

    expect(enqueuedTasks).toEqual([expect.objectContaining({ taskType: 'sync-orders' })]);
  });

  test('dopo delete-order, enqueua solo sync-orders', async () => {
    const enqueuedTasks: Array<{ taskType: string }> = [];
    const mockEnqueue = vi.fn().mockImplementation(async (_pool: DbPool, params: EnqueueWithDedupParams) => {
      enqueuedTasks.push({ taskType: params.taskType });
      return null;
    });

    await enqueuePostOpSyncs(mockPool, 'user-1', 'delete-order', {}, mockEnqueue);

    expect(enqueuedTasks).toEqual([expect.objectContaining({ taskType: 'sync-orders' })]);
  });

  test('dopo create-customer, enqueua sync-customers', async () => {
    const enqueuedTasks: Array<{ taskType: string }> = [];
    const mockEnqueue = vi.fn().mockImplementation(async (_pool: DbPool, params: EnqueueWithDedupParams) => {
      enqueuedTasks.push({ taskType: params.taskType });
      return null;
    });

    await enqueuePostOpSyncs(mockPool, 'user-1', 'create-customer', {}, mockEnqueue);

    expect(enqueuedTasks).toEqual([expect.objectContaining({ taskType: 'sync-customers' })]);
  });

  test('dopo sync-orders (non ERP write), non enqueua nulla', async () => {
    const mockEnqueue = vi.fn();

    await enqueuePostOpSyncs(mockPool, 'user-1', 'sync-orders', {}, mockEnqueue);

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test('se enqueue fallisce, non lancia eccezione', async () => {
    const mockEnqueue = vi.fn().mockRejectedValue(new Error('DB error'));

    await expect(
      enqueuePostOpSyncs(mockPool, 'user-1', 'submit-order', { orderId: 'ord-1' }, mockEnqueue)
    ).resolves.not.toThrow();
  });
});

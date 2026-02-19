import { describe, expect, test, vi } from 'vitest';
import { handleDeleteOrder, type DeleteOrderBot, type DeleteOrderData } from './delete-order';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(result = { success: true, message: 'Order deleted' }): DeleteOrderBot {
  return {
    deleteOrderFromArchibald: vi.fn().mockResolvedValue(result),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: DeleteOrderData = {
  orderId: 'ORD-001',
};

describe('handleDeleteOrder', () => {
  test('calls bot.deleteOrderFromArchibald with orderId', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleDeleteOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.deleteOrderFromArchibald).toHaveBeenCalledWith('ORD-001');
  });

  test('deletes order articles, state history, and order record from DB', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleDeleteOrder(pool, bot, sampleData, 'user-1', vi.fn());

    const queries = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string);

    expect(queries.some(q => q.includes('DELETE FROM agents.order_state_history'))).toBe(true);
    expect(queries.some(q => q.includes('DELETE FROM agents.order_articles'))).toBe(true);
    expect(queries.some(q => q.includes('DELETE FROM agents.order_records'))).toBe(true);
  });

  test('returns success and message from bot', async () => {
    const pool = createMockPool();
    const bot = createMockBot({ success: true, message: 'Deleted' });

    const result = await handleDeleteOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(result).toEqual({ success: true, message: 'Deleted' });
  });

  test('throws when bot returns success: false', async () => {
    const pool = createMockPool();
    const bot = createMockBot({ success: false, message: 'Cannot delete' });

    await expect(
      handleDeleteOrder(pool, bot, sampleData, 'user-1', vi.fn()),
    ).rejects.toThrow('Cannot delete');
  });

  test('reports progress at 100 on completion', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleDeleteOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });
});

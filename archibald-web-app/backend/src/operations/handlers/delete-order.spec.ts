import { describe, expect, test, vi } from 'vitest';
import { handleDeleteOrder, type DeleteOrderBot, type DeleteOrderData } from './delete-order';
import type { DbPool } from '../../db/pool';
import { checkBotResult, saveBotResult, clearBotResult } from '../bot-result-store';

vi.mock('../bot-result-store', () => ({
  checkBotResult: vi.fn().mockResolvedValue(null),
  saveBotResult: vi.fn().mockResolvedValue(undefined),
  clearBotResult: vi.fn().mockResolvedValue(undefined),
}));

function createMockPool(): DbPool {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  return {
    query,
    withTransaction: vi.fn(async (fn) => fn({ query })),
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

  test('skips bot call when bot_result exists (recovery path)', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce({ success: true, message: 'Already deleted' });
    const pool = createMockPool();
    const bot = createMockBot();

    const result = await handleDeleteOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.deleteOrderFromArchibald).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(pool.withTransaction).toHaveBeenCalled();
  });

  test('calls bot and saves result when no bot_result exists (normal path)', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce(null);
    const pool = createMockPool();
    const bot = createMockBot();

    await handleDeleteOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.deleteOrderFromArchibald).toHaveBeenCalledWith('ORD-001');
    expect(saveBotResult).toHaveBeenCalledWith(
      pool, 'user-1', 'delete-order', 'ORD-001', { success: true, message: 'Order deleted' },
    );
  });

  test('clears bot_result after successful DB transaction', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce(null);
    const pool = createMockPool();
    const bot = createMockBot();

    await handleDeleteOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(clearBotResult).toHaveBeenCalledWith(pool, 'user-1', 'delete-order', 'ORD-001');
  });

  test('bot_result persists if DB transaction fails', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce(null);
    vi.mocked(saveBotResult).mockResolvedValueOnce(undefined);
    vi.mocked(clearBotResult).mockClear();
    const pool = createMockPool();
    (pool.withTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));
    const bot = createMockBot();

    await expect(
      handleDeleteOrder(pool, bot, sampleData, 'user-1', vi.fn()),
    ).rejects.toThrow('DB error');

    expect(saveBotResult).toHaveBeenCalled();
    expect(clearBotResult).not.toHaveBeenCalled();
  });
});

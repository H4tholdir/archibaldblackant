import { describe, expect, test, vi } from 'vitest';
import { handleEditOrder, type EditOrderBot, type EditOrderData } from './edit-order';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    query,
    withTransaction: vi.fn(async (fn) => fn({ query })),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(result = { success: true, message: 'Order edited' }): EditOrderBot {
  return {
    editOrderInArchibald: vi.fn().mockResolvedValue(result),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: EditOrderData = {
  orderId: 'ORD-001',
  modifications: [{ field: 'quantity', lineIndex: 0, newValue: 5 }],
  updatedItems: [
    {
      articleCode: 'ART-01',
      articleDescription: 'Widget',
      quantity: 5,
      unitPrice: 10,
      discountPercent: 0,
      lineAmount: 50,
      vatPercent: 22,
      vatAmount: 11,
      lineTotalWithVat: 61,
    },
  ],
};

describe('handleEditOrder', () => {
  test('calls bot.editOrderInArchibald with orderId and modifications', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.editOrderInArchibald).toHaveBeenCalledWith('ORD-001', sampleData.modifications);
  });

  test('deletes existing articles and saves updated items', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn());

    const deleteCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM agents.order_articles'));
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][1]).toEqual(['ORD-001', 'user-1']);

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.order_articles'));
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toContain('ART-01');
  });

  test('skips article update when updatedItems is undefined', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const data: EditOrderData = { orderId: 'ORD-001', modifications: [{ field: 'x' }] };

    await handleEditOrder(pool, bot, data, 'user-1', vi.fn());

    const deleteCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM agents.order_articles'));
    expect(deleteCalls).toHaveLength(0);
  });

  test('returns success and message from bot', async () => {
    const pool = createMockPool();
    const bot = createMockBot({ success: true, message: 'Done' });

    const result = await handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(result).toEqual({ success: true, message: 'Done' });
  });

  test('throws when bot returns success: false', async () => {
    const pool = createMockPool();
    const bot = createMockBot({ success: false, message: 'Failed to edit' });

    await expect(
      handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn()),
    ).rejects.toThrow('Failed to edit');
  });

  test('reports progress', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleEditOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });
});

import { describe, expect, test, vi } from 'vitest';
import { handleSubmitOrder, type SubmitOrderBot, type SubmitOrderData } from './submit-order';
import type { DbPool } from '../../db/pool';
import { checkBotResult, saveBotResult, clearBotResult } from '../bot-result-store';

vi.mock('../bot-result-store', () => ({
  checkBotResult: vi.fn().mockResolvedValue(null),
  saveBotResult: vi.fn().mockResolvedValue(undefined),
  clearBotResult: vi.fn().mockResolvedValue(undefined),
}));

function createMockPool(): DbPool {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    query,
    withTransaction: vi.fn(async (fn) => fn({ query })),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(orderId = 'ORD-001'): SubmitOrderBot {
  return {
    createOrder: vi.fn().mockResolvedValue(orderId),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: SubmitOrderData = {
  pendingOrderId: 'pending-123',
  customerId: 'CUST-001',
  customerName: 'Acme Corp',
  items: [
    { articleCode: 'ART-01', productName: 'Widget', quantity: 10, price: 5.00, discount: 10 },
    { articleCode: 'ART-02', productName: 'Gadget', quantity: 5, price: 20.00 },
  ],
  discountPercent: 5,
};

describe('handleSubmitOrder', () => {
  test('calls bot.createOrder with the order data', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(bot.createOrder).toHaveBeenCalledWith(sampleData);
  });

  test('saves order record to agents.order_records', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_records'));
    expect(insertCalls).toHaveLength(1);

    const params = insertCalls[0][1] as unknown[];
    expect(params[0]).toBe('ORD-001');
    expect(params[1]).toBe('user-1');
    expect(params[3]).toBe('CUST-001');
    expect(params[4]).toBe('Acme Corp');
  });

  test('saves order articles to agents.order_articles', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const articleCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_articles'));
    expect(articleCalls).toHaveLength(1);

    const params = articleCalls[0][1] as unknown[];
    expect(params).toContain('ORD-001');
    expect(params).toContain('ART-01');
    expect(params).toContain('ART-02');
  });

  test('updates fresis_history to link pending order', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const fresisCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE agents.fresis_history'));
    expect(fresisCalls).toHaveLength(1);

    const params = fresisCalls[0][1] as unknown[];
    expect(params).toContain('ORD-001');
    expect(params).toContain('user-1');
    expect(params).toContain('pending-123');
  });

  test('deletes pending order from agents.pending_orders', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const deleteCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('DELETE FROM agents.pending_orders'));
    expect(deleteCalls).toHaveLength(1);

    const params = deleteCalls[0][1] as unknown[];
    expect(params).toContain('pending-123');
  });

  test('returns orderId in result', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    const result = await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(result.orderId).toBe('ORD-001');
  });

  test('calculates gross and total amounts correctly', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_records'));
    const params = insertCalls[0][1] as unknown[];

    // grossAmount = (10*5*(1-10/100)) + (5*20*(1-0/100)) = 45 + 100 = 145
    // totalAmount = 145 * (1-5/100) = 137.75
    const grossIdx = params.indexOf('145.00');
    const totalIdx = params.indexOf('137.75');
    expect(grossIdx).toBeGreaterThan(-1);
    expect(totalIdx).toBeGreaterThan(-1);
  });

  test('reports progress at key milestones', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(expect.any(Number), expect.any(String));
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(lastCall[0]).toBe(100);
  });

  test('handles warehouse-only orders with correct salesStatus', async () => {
    const pool = createMockPool();
    const bot = createMockBot('warehouse-WH001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_records'));
    const params = insertCalls[0][1] as unknown[];
    expect(params).toContain('WAREHOUSE_FULFILLED');
  });

  test('wires bot progress callback via setProgressCallback', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(bot.setProgressCallback).toHaveBeenCalledWith(expect.any(Function));
  });

  test('skips bot call when bot_result exists (recovery path)', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce({ orderId: 'ORD-RECOVERED' });
    const pool = createMockPool();
    const bot = createMockBot();

    const result = await handleSubmitOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.createOrder).not.toHaveBeenCalled();
    expect(result.orderId).toBe('ORD-RECOVERED');
    expect(pool.withTransaction).toHaveBeenCalled();
  });

  test('calls bot and saves result when no bot_result exists (normal path)', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce(null);
    const pool = createMockPool();
    const bot = createMockBot('ORD-NEW');

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.createOrder).toHaveBeenCalledWith(sampleData);
    expect(saveBotResult).toHaveBeenCalledWith(
      pool, 'user-1', 'submit-order', 'pending-123', { orderId: 'ORD-NEW' },
    );
  });

  test('clears bot_result after successful DB transaction', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce(null);
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(clearBotResult).toHaveBeenCalledWith(pool, 'user-1', 'submit-order', 'pending-123');
  });

  test('bot_result persists if DB transaction fails', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce(null);
    vi.mocked(saveBotResult).mockResolvedValueOnce(undefined);
    vi.mocked(clearBotResult).mockClear();
    const pool = createMockPool();
    (pool.withTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));
    const bot = createMockBot('ORD-001');

    await expect(
      handleSubmitOrder(pool, bot, sampleData, 'user-1', vi.fn()),
    ).rejects.toThrow('DB error');

    expect(saveBotResult).toHaveBeenCalled();
    expect(clearBotResult).not.toHaveBeenCalled();
  });

  test('emits PENDING_SUBMITTED after transaction with pendingOrderId and orderId', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onEmit = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', vi.fn(), onEmit);

    expect(onEmit).toHaveBeenCalledWith({
      type: 'PENDING_SUBMITTED',
      payload: { pendingOrderId: 'pending-123', orderId: 'ORD-001' },
      timestamp: expect.any(String),
    });
  });

  test('emits ORDER_NUMBERS_RESOLVED with order mapping after transaction', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onEmit = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', vi.fn(), onEmit);

    expect(onEmit).toHaveBeenCalledWith({
      type: 'ORDER_NUMBERS_RESOLVED',
      payload: {
        pendingOrderId: 'pending-123',
        orderId: 'ORD-001',
        orderNumber: 'PENDING-ORD-001',
        customerId: 'CUST-001',
        customerName: 'Acme Corp',
      },
      timestamp: expect.any(String),
    });
  });

  test('does not throw if onEmit is undefined', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');

    const result = await handleSubmitOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(result.orderId).toBe('ORD-001');
  });
});

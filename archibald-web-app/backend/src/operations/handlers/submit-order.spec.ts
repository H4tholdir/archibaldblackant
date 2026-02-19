import { describe, expect, test, vi } from 'vitest';
import { handleSubmitOrder, type SubmitOrderBot, type SubmitOrderData } from './submit-order';
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
});

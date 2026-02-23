import { describe, expect, test, vi } from 'vitest';
import { handleSendToVerona, type SendToVeronaBot, type SendToVeronaData } from './send-to-verona';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  const queryMock = vi.fn()
    .mockResolvedValueOnce({ rows: [{ current_state: 'bozza' }], rowCount: 1 })
    .mockResolvedValue({ rows: [], rowCount: 1 });
  return {
    query: queryMock,
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(result = { success: true, message: 'Sent to Verona' }): SendToVeronaBot {
  return {
    sendOrderToVerona: vi.fn().mockResolvedValue(result),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: SendToVeronaData = {
  orderId: 'ORD-001',
};

describe('handleSendToVerona', () => {
  test('calls bot.sendOrderToVerona with orderId', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.sendOrderToVerona).toHaveBeenCalledWith('ORD-001');
  });

  test('updates order state to inviato_milano via updateOrderState', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const stateUpdateCall = calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE agents.order_records SET current_state'),
    );
    expect(stateUpdateCall).toBeDefined();
    expect(stateUpdateCall![1]).toEqual(['inviato_milano', expect.any(Number), 'ORD-001', 'user-1']);
  });

  test('executes 4 DB queries for audit trail', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls[0][0]).toContain('SELECT current_state');
    expect(calls[1][0]).toContain('UPDATE agents.order_records SET current_state');
    expect(calls[2][0]).toContain('INSERT INTO agents.order_state_history');
    expect(calls[3][0]).toContain('UPDATE agents.order_records SET sent_to_milano_at');
  });

  test('inserts audit entry in order_state_history', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const historyInsert = calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.order_state_history'),
    );
    expect(historyInsert).toBeDefined();

    const params = historyInsert![1] as unknown[];
    expect(params).toEqual([
      'ORD-001', 'user-1', 'bozza', 'inviato_milano',
      'system', 'Sent to Verona', null, 'send-to-verona',
      expect.any(String), expect.any(String),
    ]);
  });

  test('returns success with sentToMilanoAt timestamp', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    const result = await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    expect(result.success).toBe(true);
    expect(result.sentToMilanoAt).toBeDefined();
    expect(typeof result.sentToMilanoAt).toBe('string');
  });

  test('throws when bot returns success: false', async () => {
    const pool = createMockPool();
    const bot = createMockBot({ success: false, message: 'Send failed' });

    await expect(
      handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn()),
    ).rejects.toThrow('Send failed');
  });

  test('reports progress at 100 on completion', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });
});

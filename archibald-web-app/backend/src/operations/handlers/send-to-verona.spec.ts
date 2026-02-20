import { describe, expect, test, vi } from 'vitest';
import { handleSendToVerona, type SendToVeronaBot, type SendToVeronaData } from './send-to-verona';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
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

  test('updates order state to inviato_verona in DB', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    const updateCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE agents.order_records'));
    expect(updateCalls).toHaveLength(1);

    const params = updateCalls[0][1] as unknown[];
    expect(params).toContain('inviato_verona');
    expect(params).toContain('ORD-001');
    expect(params).toContain('user-1');
  });

  test('executes only one DB query (UPDATE order state)', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    expect(pool.query).toHaveBeenCalledTimes(1);
    const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('UPDATE agents.order_records');
  });

  test('returns success with sentToVeronaAt timestamp', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    const result = await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    expect(result.success).toBe(true);
    expect(result.sentToVeronaAt).toBeDefined();
    expect(typeof result.sentToVeronaAt).toBe('string');
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

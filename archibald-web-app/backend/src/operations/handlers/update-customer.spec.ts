import { describe, expect, test, vi } from 'vitest';
import { handleUpdateCustomer, type UpdateCustomerBot, type UpdateCustomerData } from './update-customer';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ name: 'Old Name', archibald_name: null }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 1 }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(): UpdateCustomerBot {
  return {
    updateCustomer: vi.fn().mockResolvedValue(undefined),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: UpdateCustomerData = {
  customerProfile: 'CUST-001',
  name: 'Updated Corp S.r.l.',
  vatNumber: 'IT01234567890',
  street: 'Via Milano 10',
};

describe('handleUpdateCustomer', () => {
  test('fetches original name before updating', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleUpdateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    const selectCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(selectCall[0]).toContain('SELECT');
    expect(selectCall[0]).toContain('agents.customers');
    expect(selectCall[1]).toContain('CUST-001');
  });

  test('calls bot.updateCustomer with profile, data, and original name', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleUpdateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.updateCustomer).toHaveBeenCalledWith(
      'CUST-001',
      sampleData,
      'Old Name',
    );
  });

  test('updates bot_status to placed on success', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleUpdateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    const updateCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('bot_status'));
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateCalls.some((c: unknown[]) => (c[1] as unknown[]).includes('placed'))).toBe(true);
  });

  test('returns success in result', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    const result = await handleUpdateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(result.success).toBe(true);
  });

  test('reports progress at 100 on completion', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleUpdateCustomer(pool, bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });
});

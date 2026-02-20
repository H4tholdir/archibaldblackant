import { describe, expect, test, vi } from 'vitest';
import { handleCreateCustomer, type CreateCustomerBot, type CreateCustomerData } from './create-customer';
import type { DbPool } from '../../db/pool';
import { checkBotResult, saveBotResult, clearBotResult } from '../bot-result-store';

vi.mock('../bot-result-store', () => ({
  checkBotResult: vi.fn().mockResolvedValue(null),
  saveBotResult: vi.fn().mockResolvedValue(undefined),
  clearBotResult: vi.fn().mockResolvedValue(undefined),
}));

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(): CreateCustomerBot {
  return {
    createCustomer: vi.fn().mockResolvedValue('CUST-PROFILE-001'),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: CreateCustomerData = {
  name: 'New Corp S.r.l.',
  vatNumber: 'IT01234567890',
  pec: 'newcorp@pec.it',
  sdi: 'ABCDE12',
  street: 'Via Roma 1',
  postalCode: '37100',
  phone: '+390451234567',
  email: 'info@newcorp.it',
};

describe('handleCreateCustomer', () => {
  test('calls bot.createCustomer with customer data', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.createCustomer).toHaveBeenCalledWith(sampleData);
  });

  test('saves customer with pending status before bot call', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.customers'));
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
  });

  test('updates customer bot_status to placed on success', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    const updateCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE agents.customers') && (c[0] as string).includes('bot_status'));
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][1]).toContain('placed');
  });

  test('returns customerProfile in result', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    const result = await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(result.customerProfile).toBeDefined();
    expect(typeof result.customerProfile).toBe('string');
  });

  test('reports progress at key milestones', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  test('skips bot call when bot_result exists (recovery path)', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce({ customerProfile: 'CUST-RECOVERED' });
    const pool = createMockPool();
    const bot = createMockBot();

    const result = await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.createCustomer).not.toHaveBeenCalled();
    expect(result.customerProfile).toBe('CUST-RECOVERED');
  });

  test('calls bot and saves result when no bot_result exists (normal path)', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce(null);
    const pool = createMockPool();
    const bot = createMockBot();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.createCustomer).toHaveBeenCalledWith(sampleData);
    expect(saveBotResult).toHaveBeenCalledWith(
      pool, 'user-1', 'create-customer', 'New Corp S.r.l.', { customerProfile: 'CUST-PROFILE-001' },
    );
  });

  test('clears bot_result after successful DB update', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce(null);
    const pool = createMockPool();
    const bot = createMockBot();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(clearBotResult).toHaveBeenCalledWith(pool, 'user-1', 'create-customer', 'New Corp S.r.l.');
  });

  test('bot_result persists if DB update fails', async () => {
    vi.mocked(checkBotResult).mockResolvedValueOnce(null);
    vi.mocked(saveBotResult).mockResolvedValueOnce(undefined);
    vi.mocked(clearBotResult).mockClear();
    const pool = createMockPool();
    const queryMock = pool.query as ReturnType<typeof vi.fn>;
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    queryMock.mockRejectedValueOnce(new Error('DB error'));
    const bot = createMockBot();

    await expect(
      handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn()),
    ).rejects.toThrow('DB error');

    expect(saveBotResult).toHaveBeenCalled();
    expect(clearBotResult).not.toHaveBeenCalled();
  });
});

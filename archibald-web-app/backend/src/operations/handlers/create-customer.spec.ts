import { describe, expect, test, vi } from 'vitest';
import { handleCreateCustomer, type CreateCustomerBot, type CreateCustomerData } from './create-customer';
import type { DbPool } from '../../db/pool';

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
    buildCustomerSnapshot: vi.fn().mockResolvedValue(null),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: CreateCustomerData = {
  erpId: 'TEMP-1700000000',
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
  test('handler returns stub result for backward compatibility', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    const result = await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(result.erpId).toBe('STUB');
  });

  test('calls onProgress with completion status', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, 'Handler deprecated — use interactive route /customer/save');
  });

  test('does not call bot methods when stubified', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.createCustomer).not.toHaveBeenCalled();
    expect(bot.buildCustomerSnapshot).not.toHaveBeenCalled();
  });

  test('does not call pool.query when stubified', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(pool.query).not.toHaveBeenCalled();
  });
});

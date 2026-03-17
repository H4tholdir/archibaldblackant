import { describe, expect, test, vi, beforeEach } from 'vitest';
import { handleUpdateCustomer, type UpdateCustomerBot, type UpdateCustomerData } from './update-customer';
import type { DbPool } from '../../db/pool';
import type { AddressEntry } from '../../types';
import { upsertAddressesForCustomer } from '../../db/repositories/customer-addresses';

vi.mock('../../db/repositories/customer-addresses', () => ({
  upsertAddressesForCustomer: vi.fn().mockResolvedValue(undefined),
  getAddressById: vi.fn().mockResolvedValue(null),
}));

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
  originalName: 'Original Corp S.r.l.',
  name: 'Updated Corp S.r.l.',
  vatNumber: 'IT01234567890',
  street: 'Via Milano 10',
};

describe('handleUpdateCustomer', () => {
  test('uses originalName from data when provided', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleUpdateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.updateCustomer).toHaveBeenCalledWith(
      'CUST-001',
      sampleData,
      'Original Corp S.r.l.',
    );
  });

  test('falls back to DB lookup when originalName not provided', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const { originalName: _, ...dataWithoutOriginalName } = sampleData;

    await handleUpdateCustomer(pool, bot, dataWithoutOriginalName, 'user-1', vi.fn());

    const selectCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(selectCall[0]).toContain('SELECT');
    expect(selectCall[0]).toContain('agents.customers');

    expect(bot.updateCustomer).toHaveBeenCalledWith(
      'CUST-001',
      dataWithoutOriginalName,
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

describe('handleUpdateCustomer — addresses', () => {
  const addressEntry: AddressEntry = { tipo: 'Consegna', via: 'Via Verdi 1', cap: '37100', citta: 'Verona' };
  const mappedAddress = { tipo: 'Consegna', nome: null, via: 'Via Verdi 1', cap: '37100', citta: 'Verona', contea: null, stato: null, idRegione: null, contra: null };
  const userId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('calls upsertAddressesForCustomer with provided addresses after bot update', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const data: UpdateCustomerData = { ...sampleData, addresses: [addressEntry] };

    await handleUpdateCustomer(pool, bot, data, userId, vi.fn());

    expect(upsertAddressesForCustomer).toHaveBeenCalledWith(pool, userId, sampleData.customerProfile, [mappedAddress]);
  });

  test('calls upsertAddressesForCustomer with empty array when addresses absent', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const { addresses: _, ...dataWithoutAddresses } = { ...sampleData, addresses: undefined };

    await handleUpdateCustomer(pool, bot, dataWithoutAddresses, userId, vi.fn());

    expect(upsertAddressesForCustomer).toHaveBeenCalledWith(pool, userId, sampleData.customerProfile, []);
  });
});

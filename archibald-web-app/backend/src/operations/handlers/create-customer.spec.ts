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

  test('updates customer bot_status to snapshot on success', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    const updateCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE agents.customers') && (c[0] as string).includes('bot_status'));
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][1]).toContain('snapshot');
  });

  test('returns erpId in result', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    const result = await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    expect(result.erpId).toBeDefined();
    expect(typeof result.erpId).toBe('string');
  });

  test('uses erpId from data when provided', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', vi.fn());

    const insertCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    const params = insertCall[1] as unknown[];
    expect(params[0]).toBe('TEMP-1700000000');
  });

  test('generates TEMP profile when erpId not provided', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const { erpId: _, ...dataWithoutProfile } = sampleData;

    await handleCreateCustomer(pool, bot, dataWithoutProfile, 'user-1', vi.fn());

    const insertCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    const params = insertCall[1] as unknown[];
    expect(params[0]).toMatch(/^TEMP-\d+$/);
  });

  test('reports progress at key milestones', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleCreateCustomer(pool, bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  test('persists snapshot.name as archibald_name in UPDATE when ERP normalizes name differently', async () => {
    const erpName = 'NEW CORP SRL';
    const formName = 'New Corp S.r.l.';
    const pool = createMockPool();
    const bot: CreateCustomerBot = {
      createCustomer: vi.fn().mockResolvedValue('CUST-001'),
      buildCustomerSnapshot: vi.fn().mockResolvedValue({
        internalId: '42', name: erpName, nameAlias: null,
        vatNumber: null, vatValidated: null, fiscalCode: null,
        pec: null, sdi: null, notes: null, street: null,
        postalCode: null, city: null, county: null,
        state: null, country: null, phone: null, mobile: null,
        email: null, url: null, attentionTo: null, deliveryMode: null,
        paymentTerms: null, sector: null, priceGroup: null, lineDiscount: null,
      }),
      setProgressCallback: vi.fn(),
    };

    await handleCreateCustomer(pool, bot, { ...sampleData, name: formName }, 'user-1', vi.fn());

    const updateCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE agents.customers'));
    expect(updateCalls).toHaveLength(1);
    const [sql, params] = updateCalls[0] as [string, unknown[]];
    expect(sql).toContain('archibald_name');
    expect(params).toContain(erpName);
  });
});

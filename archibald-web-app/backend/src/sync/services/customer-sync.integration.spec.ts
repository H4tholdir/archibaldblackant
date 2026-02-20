import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import { setupTestDb, truncateAllTables, destroyTestDb } from '../../db/integration/test-db-setup';
import { syncCustomers, type CustomerSyncDeps, type ParsedCustomer } from './customer-sync';

const TEST_USER_ID = 'integration-test-user';
const TEST_PDF_PATH = '/tmp/test-customers.pdf';

function makeCustomer(overrides: Partial<ParsedCustomer> & { customerProfile: string; name: string }): ParsedCustomer {
  return {
    customerProfile: overrides.customerProfile,
    name: overrides.name,
    vatNumber: overrides.vatNumber ?? 'IT00000000000',
    fiscalCode: overrides.fiscalCode,
    phone: overrides.phone ?? '+39000000000',
    email: overrides.email,
    street: overrides.street,
    postalCode: overrides.postalCode,
    city: overrides.city,
  };
}

function makeDeps(pool: DbPool, customers: ParsedCustomer[]): CustomerSyncDeps {
  return {
    pool,
    downloadPdf: vi.fn().mockResolvedValue(TEST_PDF_PATH),
    parsePdf: vi.fn().mockResolvedValue(customers),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

const noopProgress = vi.fn();
const neverStop = () => false;

describe('syncCustomers (integration)', () => {
  let pool: DbPool;

  beforeAll(async () => {
    pool = await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
  });

  afterAll(async () => {
    if (pool) await destroyTestDb(pool);
  });

  test('first sync inserts new customers', async () => {
    const customers = [
      makeCustomer({ customerProfile: 'CP-001', name: 'Rossi SRL', vatNumber: 'IT12345678901', city: 'Milano' }),
      makeCustomer({ customerProfile: 'CP-002', name: 'Bianchi SPA', vatNumber: 'IT98765432109', city: 'Roma' }),
    ];
    const deps = makeDeps(pool, customers);

    const result = await syncCustomers(deps, TEST_USER_ID, noopProgress, neverStop);

    expect(result).toEqual({
      success: true,
      customersProcessed: 2,
      newCustomers: 2,
      updatedCustomers: 0,
      deletedCustomers: 0,
      duration: expect.any(Number),
    });

    const { rows } = await pool.query<{ customer_profile: string; name: string; city: string }>(
      'SELECT customer_profile, name, city FROM agents.customers WHERE user_id = $1 ORDER BY customer_profile',
      [TEST_USER_ID],
    );
    expect(rows).toEqual([
      { customer_profile: 'CP-001', name: 'Rossi SRL', city: 'Milano' },
      { customer_profile: 'CP-002', name: 'Bianchi SPA', city: 'Roma' },
    ]);
  });

  test('second sync with same data produces no updates (hash unchanged)', async () => {
    const customers = [
      makeCustomer({ customerProfile: 'CP-010', name: 'Verdi SNC', vatNumber: 'IT11111111111', city: 'Torino' }),
    ];
    const deps = makeDeps(pool, customers);

    await syncCustomers(deps, TEST_USER_ID, vi.fn(), neverStop);

    const secondResult = await syncCustomers(makeDeps(pool, customers), TEST_USER_ID, vi.fn(), neverStop);

    expect(secondResult.updatedCustomers).toBe(0);
    expect(secondResult.newCustomers).toBe(0);
    expect(secondResult.customersProcessed).toBe(1);
  });

  test('sync with modified data triggers hash change and update', async () => {
    const originalCustomer = makeCustomer({ customerProfile: 'CP-020', name: 'Neri SRL', vatNumber: 'IT22222222222', city: 'Firenze' });
    await syncCustomers(makeDeps(pool, [originalCustomer]), TEST_USER_ID, vi.fn(), neverStop);

    const modifiedCustomer = makeCustomer({ customerProfile: 'CP-020', name: 'Neri SRL Updated', vatNumber: 'IT22222222222', city: 'Bologna' });
    const result = await syncCustomers(makeDeps(pool, [modifiedCustomer]), TEST_USER_ID, vi.fn(), neverStop);

    expect(result.updatedCustomers).toBe(1);
    expect(result.newCustomers).toBe(0);

    const { rows } = await pool.query<{ name: string; city: string }>(
      'SELECT name, city FROM agents.customers WHERE customer_profile = $1 AND user_id = $2',
      ['CP-020', TEST_USER_ID],
    );
    expect(rows).toEqual([{ name: 'Neri SRL Updated', city: 'Bologna' }]);
  });

  test('sync with fewer customers deletes removed ones', async () => {
    const threeCustomers = [
      makeCustomer({ customerProfile: 'CP-030', name: 'Alpha SRL' }),
      makeCustomer({ customerProfile: 'CP-031', name: 'Beta SRL' }),
      makeCustomer({ customerProfile: 'CP-032', name: 'Gamma SRL' }),
    ];
    await syncCustomers(makeDeps(pool, threeCustomers), TEST_USER_ID, vi.fn(), neverStop);

    const twoCustomers = [
      makeCustomer({ customerProfile: 'CP-030', name: 'Alpha SRL' }),
      makeCustomer({ customerProfile: 'CP-032', name: 'Gamma SRL' }),
    ];
    const result = await syncCustomers(makeDeps(pool, twoCustomers), TEST_USER_ID, vi.fn(), neverStop);

    expect(result.deletedCustomers).toBe(1);

    const { rows } = await pool.query<{ customer_profile: string }>(
      'SELECT customer_profile FROM agents.customers WHERE user_id = $1 ORDER BY customer_profile',
      [TEST_USER_ID],
    );
    expect(rows).toEqual([
      { customer_profile: 'CP-030' },
      { customer_profile: 'CP-032' },
    ]);
  });

  test('shouldStop aborts mid-loop with 15+ parsed customers producing partial insert', async () => {
    const totalRecords = 15;
    const customers = Array.from({ length: totalRecords }, (_, i) =>
      makeCustomer({
        customerProfile: `CP-STOP-${String(i).padStart(3, '0')}`,
        name: `StopCustomer ${i}`,
        vatNumber: `IT${String(i).padStart(11, '0')}`,
        phone: `+3900${String(i).padStart(7, '0')}`,
      }),
    );
    const deps = makeDeps(pool, customers);

    let shouldStopCallCount = 0;
    const shouldStop = () => {
      shouldStopCallCount++;
      if (shouldStopCallCount <= 3) return false;
      return true;
    };

    const result = await syncCustomers(deps, TEST_USER_ID, vi.fn(), shouldStop);

    expect(result.success).toBe(false);
    expect(result.error).toContain('stop');

    const { rows } = await pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM agents.customers WHERE user_id = $1 AND customer_profile LIKE 'CP-STOP-%'",
      [TEST_USER_ID],
    );
    const insertedCount = parseInt(rows[0].count, 10);
    expect(insertedCount).toBeGreaterThan(0);
    expect(insertedCount).toBeLessThan(totalRecords);
  });
});

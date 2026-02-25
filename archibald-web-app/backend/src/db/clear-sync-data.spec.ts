import { describe, expect, test, vi } from 'vitest';
import type { DbPool, TxClient } from './pool';
import { clearSyncData, isValidSyncType } from './clear-sync-data';

function createMockPool(): { pool: DbPool; getQueries: () => string[] } {
  const txQuery = vi.fn();

  const pool: DbPool = {
    query: vi.fn(),
    withTransaction: vi.fn(async (fn: (tx: TxClient) => Promise<unknown>) => {
      const tx: TxClient = { query: txQuery };
      return fn(tx);
    }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 5, idleCount: 3, waitingCount: 0 }),
  };

  return {
    pool,
    getQueries: () => txQuery.mock.calls.map((c: unknown[]) => c[0] as string),
  };
}

describe('isValidSyncType', () => {
  const validTypes = ['customers', 'products', 'prices', 'orders', 'ddt', 'invoices'];

  test.each(validTypes)('returns true for valid type "%s"', (type) => {
    expect(isValidSyncType(type)).toBe(true);
  });

  test.each(['invalid', 'users', 'warehouse', '', 'CUSTOMERS'])(
    'returns false for invalid type "%s"',
    (type) => {
      expect(isValidSyncType(type)).toBe(false);
    },
  );
});

describe('clearSyncData', () => {
  test('rejects invalid sync type', async () => {
    const { pool } = createMockPool();
    await expect(clearSyncData(pool, 'invalid')).rejects.toThrow(
      'Invalid sync type: invalid',
    );
  });

  test('returns success message with sync type name', async () => {
    const { pool } = createMockPool();
    const result = await clearSyncData(pool, 'customers');
    expect(result).toEqual({
      message: 'Database customers cancellato con successo. Esegui una sync per ricrearlo.',
    });
  });

  test('customers truncates agents.customers and clears sync state', async () => {
    const { pool, getQueries } = createMockPool();
    await clearSyncData(pool, 'customers');
    expect(getQueries()).toEqual([
      'TRUNCATE TABLE agents.customers CASCADE',
      `DELETE FROM agents.agent_sync_state WHERE sync_type = 'customers'`,
    ]);
  });

  test('products truncates all product tables and clears sync metadata', async () => {
    const { pool, getQueries } = createMockPool();
    await clearSyncData(pool, 'products');
    expect(getQueries()).toEqual([
      'TRUNCATE TABLE shared.product_changes CASCADE',
      'TRUNCATE TABLE shared.product_images CASCADE',
      'TRUNCATE TABLE shared.products CASCADE',
      'TRUNCATE TABLE shared.sync_sessions CASCADE',
      `DELETE FROM shared.sync_metadata WHERE sync_type = 'products'`,
    ]);
  });

  test('prices truncates shared.prices and clears sync metadata', async () => {
    const { pool, getQueries } = createMockPool();
    await clearSyncData(pool, 'prices');
    expect(getQueries()).toEqual([
      'TRUNCATE TABLE shared.prices CASCADE',
      `DELETE FROM shared.sync_metadata WHERE sync_type = 'prices'`,
    ]);
  });

  test('orders truncates all order-related tables and clears sync state', async () => {
    const { pool, getQueries } = createMockPool();
    await clearSyncData(pool, 'orders');
    expect(getQueries()).toEqual([
      'TRUNCATE TABLE agents.order_articles CASCADE',
      'TRUNCATE TABLE agents.order_state_history CASCADE',
      'TRUNCATE TABLE agents.widget_order_exclusions CASCADE',
      'TRUNCATE TABLE agents.order_records CASCADE',
      `DELETE FROM agents.agent_sync_state WHERE sync_type = 'orders'`,
    ]);
  });

  test('ddt nullifies ddt columns and clears sync state', async () => {
    const { pool, getQueries } = createMockPool();
    await clearSyncData(pool, 'ddt');
    const queries = getQueries();
    expect(queries).toHaveLength(2);
    expect(queries[0]).toMatch(/^UPDATE agents\.order_records SET ddt_number = NULL/);
    expect(queries[0]).toContain('tracking_number = NULL');
    expect(queries[1]).toBe(
      `DELETE FROM agents.agent_sync_state WHERE sync_type = 'ddt'`,
    );
  });

  test('invoices nullifies invoice columns and clears sync state', async () => {
    const { pool, getQueries } = createMockPool();
    await clearSyncData(pool, 'invoices');
    const queries = getQueries();
    expect(queries).toHaveLength(2);
    expect(queries[0]).toMatch(/^UPDATE agents\.order_records SET invoice_number = NULL/);
    expect(queries[0]).toContain('invoice_closed = NULL');
    expect(queries[1]).toBe(
      `DELETE FROM agents.agent_sync_state WHERE sync_type = 'invoices'`,
    );
  });

  test('wraps all operations in a transaction', async () => {
    const { pool } = createMockPool();
    await clearSyncData(pool, 'customers');
    expect(pool.withTransaction).toHaveBeenCalledTimes(1);
  });
});

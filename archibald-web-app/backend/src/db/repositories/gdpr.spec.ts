import { describe, it, expect, vi } from 'vitest';
import { eraseCustomerPersonalData, hasActiveOrders } from './gdpr';
import type { DbPool } from '../pool';

function makePool(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
    withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
    end: vi.fn(),
    getStats: vi.fn(),
  } as unknown as DbPool;
}

describe('hasActiveOrders', () => {
  it('returns true when pending orders exist', async () => {
    const pool = makePool([{ count: '2' }]);
    expect(await hasActiveOrders(pool, 'cust-1')).toBe(true);
  });

  it('returns false when no pending orders', async () => {
    const pool = makePool([{ count: '0' }]);
    expect(await hasActiveOrders(pool, 'cust-1')).toBe(false);
  });
});

describe('eraseCustomerPersonalData', () => {
  it('anonymizes personal data in agents.customers and shared.sub_clients', async () => {
    const txQuery = vi.fn().mockResolvedValue({ rows: [] });
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) =>
        fn({ query: txQuery }),
      ),
      end: vi.fn(),
      getStats: vi.fn(),
    } as unknown as DbPool;

    const customerProfile = 'cust-profile-1';
    await eraseCustomerPersonalData(pool, customerProfile);

    expect(txQuery).toHaveBeenCalledTimes(2);

    const [firstCall, secondCall] = txQuery.mock.calls as [[string, unknown[]], [string, unknown[]]];

    expect(firstCall[0]).toEqual(expect.stringContaining('agents.customers'));
    expect(firstCall[0]).toEqual(expect.stringContaining('email'));
    expect(firstCall[0]).toEqual(expect.stringContaining('fiscal_code'));
    expect(firstCall[1][1]).toBe(customerProfile);

    expect(secondCall[0]).toEqual(expect.stringContaining('shared.sub_clients'));
    expect(secondCall[0]).toEqual(expect.stringContaining('cod_fiscale'));
    expect(secondCall[0]).toEqual(expect.stringContaining('pers_da_contattare'));
    expect(secondCall[1][1]).toBe(customerProfile);
  });
});

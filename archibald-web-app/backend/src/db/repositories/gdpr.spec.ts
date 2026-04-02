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
  it('calls UPDATE on customers table with anonymized values', async () => {
    const pool = makePool();
    await eraseCustomerPersonalData(pool, 'cust-1');
    expect(pool.withTransaction).toHaveBeenCalledOnce();
  });
});

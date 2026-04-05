import { describe, it, expect, vi } from 'vitest';
import { getInactiveCustomers } from './retention';
import type { DbPool } from '../pool';

const userId = 'user-1';
const thresholdMonths = 24;
const twoYearsAgo = new Date('2024-04-01T00:00:00Z');

describe('getInactiveCustomers', () => {
  it('returns mapped InactiveCustomerSummary rows from DB', async () => {
    const dbRow = { customer_profile: 'cp-1', name: 'Acme Srl', last_activity_at: twoYearsAgo };
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [dbRow] }),
      withTransaction: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn(),
    } as unknown as DbPool;

    const result = await getInactiveCustomers(pool, userId, thresholdMonths);

    expect(result).toEqual([
      { customerProfile: 'cp-1', name: 'Acme Srl', lastActivityAt: twoYearsAgo },
    ]);
    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toEqual(expect.stringContaining('agents.customers'));
    expect(sql).toEqual(expect.stringContaining('last_activity_at'));
    expect(sql).toEqual(expect.stringContaining("($2 || ' months')::INTERVAL"));
    expect(sql).toEqual(expect.stringContaining('ORDER BY last_activity_at ASC'));
    expect(params[0]).toBe(userId);
    expect(params[1]).toBe(thresholdMonths);
  });

  it('returns empty array when no inactive customers', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      withTransaction: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn(),
    } as unknown as DbPool;

    const result = await getInactiveCustomers(pool, userId, thresholdMonths);

    expect(result).toEqual([]);
  });
});

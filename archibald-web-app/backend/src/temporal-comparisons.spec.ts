import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from './db/pool';
import { parseItalianCurrency, calculateRevenueInRange, countOrdersInRange } from './temporal-comparisons';

type RevenueRow = { id: string; order_number: string; creation_date: string; total_amount: string };

function makePool(rows: RevenueRow[]): { pool: DbPool; capturedSql: () => string } {
  let sql = '';
  const pool = {
    query: vi.fn(async (text: string, _params?: unknown[]) => {
      sql = text;
      return { rows, rowCount: rows.length };
    }),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  } as unknown as DbPool;
  return { pool, capturedSql: () => sql };
}

describe('parseItalianCurrency', () => {
  test('parses Italian format with decimal comma', () => {
    expect(parseItalianCurrency('409,85')).toBe(409.85);
  });

  test('parses Italian format with thousands separator and decimal comma', () => {
    expect(parseItalianCurrency('1.791,01')).toBe(1791.01);
  });

  test('parses Italian format with euro symbol', () => {
    expect(parseItalianCurrency('105,60 €')).toBe(105.60);
  });

  test('parses plain numeric format (English decimal dot, no comma)', () => {
    expect(parseItalianCurrency('409.85')).toBe(409.85);
  });

  test('parses plain numeric format with no decimals', () => {
    expect(parseItalianCurrency('500.00')).toBe(500);
  });

  test('returns 0 for null', () => {
    expect(parseItalianCurrency(null)).toBe(0);
  });

  test('returns 0 for empty string', () => {
    expect(parseItalianCurrency('')).toBe(0);
  });

  test('returns 0 for non-numeric string', () => {
    expect(parseItalianCurrency('N/A')).toBe(0);
  });

  test('parses negative Italian format', () => {
    expect(parseItalianCurrency('-4.264,48 €')).toBe(-4264.48);
  });
});

describe('calculateRevenueInRange', () => {
  const start = new Date('2026-01-01');
  const end = new Date('2026-01-31');
  const userId = 'user-1';

  test('SQL does not filter out negative total_amounts', async () => {
    const { pool, capturedSql } = makePool([]);
    await calculateRevenueInRange(pool, userId, start, end);
    expect(capturedSql()).not.toContain("NOT LIKE '-%'");
    expect(capturedSql()).not.toContain('NOT EXISTS');
  });

  test('NC amount cancels original — arithmetic sum is zero', async () => {
    const { pool } = makePool([
      { id: 'o1', order_number: 'ORD/001', creation_date: '2026-01-10', total_amount: '262,30 €' },
      { id: 'o2', order_number: 'ORD/002', creation_date: '2026-01-20', total_amount: '-262,30 €' },
    ]);
    expect(await calculateRevenueInRange(pool, userId, start, end)).toBe(0);
  });

  test('partial NC reduces revenue by the exact NC amount', async () => {
    const { pool } = makePool([
      { id: 'o1', order_number: 'ORD/001', creation_date: '2026-01-10', total_amount: '175,95 €' },
      { id: 'o2', order_number: 'ORD/002', creation_date: '2026-01-20', total_amount: '-183,28 €' },
    ]);
    expect(await calculateRevenueInRange(pool, userId, start, end)).toBe(-7.33);
  });

  test('NC triad nets to replacement order value', async () => {
    const { pool } = makePool([
      { id: 'o1', order_number: 'ORD/001', creation_date: '2026-01-10', total_amount: '262,30 €' },
      { id: 'o2', order_number: 'ORD/002', creation_date: '2026-01-20', total_amount: '-262,30 €' },
      { id: 'o3', order_number: 'ORD/003', creation_date: '2026-01-22', total_amount: '270,00 €' },
    ]);
    expect(await calculateRevenueInRange(pool, userId, start, end)).toBe(270);
  });
});

describe('countOrdersInRange', () => {
  const start = new Date('2026-01-01');
  const end = new Date('2026-01-31');
  const userId = 'user-1';

  test('SQL still excludes NCs and paired originals from count', async () => {
    const countPool = {
      query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [{ count: '3' }], rowCount: 1 })),
      end: vi.fn(async () => {}),
      getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
    } as unknown as DbPool;
    await countOrdersInRange(countPool, userId, start, end);
    const sql: string = (countPool.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sql).toContain("NOT LIKE '-%'");
    expect(sql).toContain('NOT EXISTS');
  });
});

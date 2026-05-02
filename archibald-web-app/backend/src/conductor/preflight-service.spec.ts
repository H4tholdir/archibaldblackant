import { describe, test, expect, vi } from 'vitest';
import { preflightPending } from './preflight-service';
import type { DbPool } from '../db/pool';

function makePool(responses: Record<string, unknown[]>): DbPool {
  const query = vi.fn().mockImplementation((sql: string) => {
    for (const [key, rows] of Object.entries(responses)) {
      if (sql.includes(key)) return Promise.resolve({ rows, rowCount: rows.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  return { query, withTransaction: vi.fn(), end: vi.fn(), getStats: vi.fn() } as unknown as DbPool;
}

describe('preflightPending', () => {
  test('returns empty changes when pending not found', async () => {
    const pool = makePool({ 'pending_orders': [] });
    const result = await preflightPending(pool, 'user-1', 'pending-x');
    expect(result.changes).toEqual([]);
  });

  test('returns empty changes when no sync after confirmed_at', async () => {
    const pool = makePool({
      'pending_orders': [{ confirmed_at: '2026-01-02T10:00:00Z', items: [] }],
      'active_jobs': [{ completed_at: '2026-01-01T10:00:00Z' }],
    });
    const result = await preflightPending(pool, 'user-1', 'p1');
    expect(result.changes).toEqual([]);
  });

  test('detects discontinued article', async () => {
    const pool = makePool({
      'pending_orders': [{
        confirmed_at: '2026-01-01T10:00:00Z',
        items: [{ articleCode: 'ART-01', price: 10.00, quantity: 5 }],
      }],
      'active_jobs': [{ completed_at: '2026-01-02T10:00:00Z' }],
      'shared.products': [{ id: 'ART-01', deleted_at: '2026-01-02T09:00:00Z' }],
    });
    const result = await preflightPending(pool, 'user-1', 'p1');
    expect(result.changes).toEqual([
      expect.objectContaining({ articleCode: 'ART-01', type: 'discontinued' }),
    ]);
  });
});

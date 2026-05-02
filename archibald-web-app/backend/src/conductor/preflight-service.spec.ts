import { describe, test, expect, vi } from 'vitest';
import { preflightPending } from './preflight-service';
import type { DbPool } from '../db/pool';

type QueryMatcher = { match: string; rows: unknown[] };

function makePool(matchers: QueryMatcher[]): DbPool {
  const query = vi.fn().mockImplementation((sql: string) => {
    for (const m of matchers) {
      if (sql.includes(m.match)) return Promise.resolve({ rows: m.rows, rowCount: m.rows.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  return { query, withTransaction: vi.fn(), end: vi.fn(), getStats: vi.fn() } as unknown as DbPool;
}

// created_at è unix ms — 2026-01-01T10:00:00Z = 1735725600000
const PENDING_CREATED_AT_MS = new Date('2026-01-01T10:00:00Z').getTime();
const PENDING_BEFORE_SYNC = {
  match: 'pending_orders',
  rows: [{ created_at: PENDING_CREATED_AT_MS, items_json: [{ articleCode: 'ART-01', price: 10.00, quantity: 5 }] }],
};
// sync completata DOPO il pending — lastSyncMs > pendingCreatedMs → si procede
const SYNC_AFTER_CONFIRMED = { match: 'sync_sessions', rows: [{ completed_at: '2026-01-02T10:00:00Z' }] };
// sync completata PRIMA del pending — lastSyncMs <= pendingCreatedMs → return empty
const SYNC_BEFORE_CONFIRMED = { match: 'sync_sessions', rows: [{ completed_at: '2026-01-01T08:00:00Z' }] };

describe('preflightPending', () => {
  test('returns empty changes when pending not found', async () => {
    const pool = makePool([{ match: 'pending_orders', rows: [] }]);
    const result = await preflightPending(pool, 'user-1', 'pending-x');
    expect(result.changes).toEqual([]);
  });

  test('returns empty changes when no sync after confirmed_at', async () => {
    const pool = makePool([
      { match: 'pending_orders', rows: [{ created_at: new Date('2026-01-02T10:00:00Z').getTime(), items_json: [] }] },
      SYNC_BEFORE_CONFIRMED,
    ]);
    const result = await preflightPending(pool, 'user-1', 'p1');
    expect(result.changes).toEqual([]);
  });

  test('detects discontinued article (deleted_at non null)', async () => {
    const pool = makePool([
      PENDING_BEFORE_SYNC,
      SYNC_AFTER_CONFIRMED,
      { match: 'shared.products WHERE id = ANY', rows: [{ id: 'ART-01', deleted_at: '2026-01-02T09:00:00Z', name: 'Widget' }] },
    ]);
    const result = await preflightPending(pool, 'user-1', 'p1');
    expect(result.changes).toEqual([
      expect.objectContaining({ articleCode: 'ART-01', type: 'discontinued' }),
    ]);
  });

  test('detects price_changed when current price differs by more than 0.01', async () => {
    const pool = makePool([
      PENDING_BEFORE_SYNC,
      SYNC_AFTER_CONFIRMED,
      { match: 'shared.products WHERE id = ANY', rows: [{ id: 'ART-01', deleted_at: null, name: 'Widget' }] },
      { match: 'shared.prices', rows: [{ product_id: 'ART-01', unit_price: '12.50' }] },
    ]);
    const result = await preflightPending(pool, 'user-1', 'p1');
    expect(result.changes).toEqual([
      expect.objectContaining({ articleCode: 'ART-01', type: 'price_changed', oldPrice: 10.00, newPrice: 12.50 }),
    ]);
  });

  test('returns no changes when price is within tolerance (delta <= 0.01)', async () => {
    const pool = makePool([
      PENDING_BEFORE_SYNC,
      SYNC_AFTER_CONFIRMED,
      { match: 'shared.products WHERE id = ANY', rows: [{ id: 'ART-01', deleted_at: null, name: 'Widget' }] },
      { match: 'shared.prices', rows: [{ product_id: 'ART-01', unit_price: '10.005' }] },
    ]);
    const result = await preflightPending(pool, 'user-1', 'p1');
    expect(result.changes).toEqual([]);
  });
});

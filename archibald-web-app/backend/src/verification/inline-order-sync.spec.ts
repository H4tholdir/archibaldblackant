import { describe, expect, test, vi } from 'vitest';
import { saveArticlesToDb } from './inline-order-sync';
import type { DbPool } from '../db/pool';

type QueryCall = [string, unknown[]?];

function createMockPool(warehouseRows: Record<string, unknown>[] = []): { pool: DbPool; calls: () => QueryCall[] } {
  const calls: QueryCall[] = [];
  const query = vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
    calls.push([sql, params]);
    if (sql.includes('warehouse_quantity > 0')) {
      return Promise.resolve({ rows: warehouseRows, rowCount: warehouseRows.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  const pool = { query, withTransaction: vi.fn(), end: vi.fn(), getStats: vi.fn() } as unknown as DbPool;
  return { pool, calls: () => calls };
}

const erpArticle = (code: string, qty: number, price: number) => ({
  articleCode: code,
  description: `Desc ${code}`,
  quantity: qty,
  unitPrice: price,
  discountPercent: 0,
  lineAmount: qty * price,
  vatPercent: 22,
  vatAmount: Math.round(qty * price * 22 / 100 * 100) / 100,
  lineTotalWithVat: Math.round((qty * price + qty * price * 22 / 100) * 100) / 100,
});

describe('saveArticlesToDb', () => {
  test('queries warehouse snapshot before DELETE', async () => {
    const { pool, calls } = createMockPool();
    await saveArticlesToDb(pool, 'ORD-1', 'user-1', [erpArticle('ART-A', 3, 10)]);
    const queryOrder = calls().map(c => {
      if (c[0].includes('warehouse_quantity > 0')) return 'select-warehouse';
      if (c[0].includes('DELETE')) return 'delete';
      return 'other';
    });
    expect(queryOrder[0]).toBe('select-warehouse');
    expect(queryOrder[1]).toBe('delete');
  });

  test('re-inserts warehouse-only articles not present in ERP PDF', async () => {
    const warehouseOnlyRow = {
      article_code: '9644.104.100',
      article_description: 'Articolo magazzino',
      quantity: '7',
      unit_price: '25.00',
      discount_percent: null,
      line_amount: '175.00',
      warehouse_quantity: '7',
      warehouse_sources_json: null,
      vat_percent: '22',
      vat_amount: '38.50',
      line_total_with_vat: '213.50',
      is_ghost: false,
    };
    const { pool, calls } = createMockPool([warehouseOnlyRow]);
    await saveArticlesToDb(pool, 'ORD-1', 'user-1', [erpArticle('ART-ERP', 2, 10)]);

    const inserts = calls().filter(c => c[0].includes('INSERT INTO agents.order_articles'));
    expect(inserts).toHaveLength(2);
    const warehouseInsert = inserts[1][1] as unknown[];
    expect(warehouseInsert).toContain('9644.104.100');
    expect(warehouseInsert).toContain(7);
  });

  test('restores warehouse_quantity for partial-warehouse ERP articles', async () => {
    const partialRow = {
      article_code: 'H364RA.103.010',
      article_description: 'Articolo parziale',
      quantity: '4',
      unit_price: '50.00',
      discount_percent: null,
      line_amount: '200.00',
      warehouse_quantity: '1',
      warehouse_sources_json: null,
      vat_percent: '22',
      vat_amount: '44.00',
      line_total_with_vat: '244.00',
      is_ghost: false,
    };
    const { pool, calls } = createMockPool([partialRow]);
    await saveArticlesToDb(pool, 'ORD-1', 'user-1', [erpArticle('H364RA.103.010', 3, 50)]);

    const inserts = calls().filter(c => c[0].includes('INSERT INTO agents.order_articles'));
    expect(inserts).toHaveLength(1);
    const params = inserts[0][1] as unknown[];
    expect(params).toContain('H364RA.103.010');
    expect(params).toContain(1);
  });

  test('does not insert warehouse-only batch when no warehouse-only rows exist', async () => {
    const { pool, calls } = createMockPool();
    await saveArticlesToDb(pool, 'ORD-1', 'user-1', [erpArticle('ART-A', 2, 10)]);

    const inserts = calls().filter(c => c[0].includes('INSERT INTO agents.order_articles'));
    expect(inserts).toHaveLength(1);
  });

  test('warehouse_sources_json is preserved for warehouse-only articles', async () => {
    const sources = [{ warehouseItemId: 99, boxName: 'BOX-A', quantity: 7 }];
    const row = {
      article_code: 'WH-ONLY',
      article_description: null,
      quantity: '7',
      unit_price: '10.00',
      discount_percent: null,
      line_amount: '70.00',
      warehouse_quantity: '7',
      warehouse_sources_json: sources,
      vat_percent: '22',
      vat_amount: '15.40',
      line_total_with_vat: '85.40',
      is_ghost: false,
    };
    const { pool, calls } = createMockPool([row]);
    await saveArticlesToDb(pool, 'ORD-1', 'user-1', []);

    const inserts = calls().filter(c => c[0].includes('INSERT INTO agents.order_articles'));
    expect(inserts).toHaveLength(1);
    const params = inserts[0][1] as unknown[];
    expect(params).toContain(sources);
  });

  test('article_search_text in UPDATE includes both ERP and warehouse-only articles', async () => {
    const row = {
      article_code: 'WH-ONLY',
      article_description: 'Magazzino',
      quantity: '5',
      unit_price: '10.00',
      discount_percent: null,
      line_amount: '50.00',
      warehouse_quantity: '5',
      warehouse_sources_json: null,
      vat_percent: '22',
      vat_amount: '11.00',
      line_total_with_vat: '61.00',
      is_ghost: false,
    };
    const { pool, calls } = createMockPool([row]);
    await saveArticlesToDb(pool, 'ORD-1', 'user-1', [erpArticle('ART-ERP', 2, 10)]);

    const update = calls().find(c => c[0].includes('UPDATE agents.order_records'));
    const searchText = (update![1] as unknown[])[5] as string;
    expect(searchText).toContain('ART-ERP');
    expect(searchText).toContain('WH-ONLY');
  });
});

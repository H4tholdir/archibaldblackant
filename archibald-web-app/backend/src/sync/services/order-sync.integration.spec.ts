import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import { setupTestDb, truncateAllTables, destroyTestDb } from '../../db/integration/test-db-setup';
import { syncOrders, type OrderSyncDeps, type ParsedOrder } from './order-sync';
import { computeOrderHash } from '../../db/repositories/orders';

const TEST_USER_ID = 'integration-test-user';
const TEST_PDF_PATH = '/tmp/test-orders.pdf';

function makeOrder(overrides: Partial<ParsedOrder> & { id: string; orderNumber: string; customerName: string; creationDate: string }): ParsedOrder {
  return {
    id: overrides.id,
    orderNumber: overrides.orderNumber,
    customerProfileId: overrides.customerProfileId,
    customerName: overrides.customerName,
    creationDate: overrides.creationDate,
    deliveryDate: overrides.deliveryDate,
    salesStatus: overrides.salesStatus ?? 'Open',
    orderType: overrides.orderType,
    documentStatus: overrides.documentStatus,
    salesOrigin: overrides.salesOrigin,
    transferStatus: overrides.transferStatus,
    totalAmount: overrides.totalAmount,
  };
}

function makeDeps(pool: DbPool, orders: ParsedOrder[]): OrderSyncDeps {
  return {
    pool,
    downloadPdf: vi.fn().mockResolvedValue(TEST_PDF_PATH),
    parsePdf: vi.fn().mockResolvedValue(orders),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

const neverStop = () => false;

describe('syncOrders (integration)', () => {
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

  test('sync inserts orders and verifies rows', async () => {
    const orders = [
      makeOrder({ id: 'ORD-001', orderNumber: 'SO-001', customerName: 'Rossi SRL', creationDate: '2026-01-15', totalAmount: '1500.00' }),
      makeOrder({ id: 'ORD-002', orderNumber: 'SO-002', customerName: 'Bianchi SPA', creationDate: '2026-01-16', totalAmount: '2500.00' }),
    ];
    const deps = makeDeps(pool, orders);

    const result = await syncOrders(deps, TEST_USER_ID, vi.fn(), neverStop);

    expect(result).toEqual({
      success: true,
      ordersProcessed: 2,
      ordersInserted: 2,
      ordersUpdated: 0,
      ordersSkipped: 0,
      ordersDeleted: 0,
      duration: expect.any(Number),
    });

    const { rows } = await pool.query<{ id: string; order_number: string; customer_name: string; total_amount: string }>(
      'SELECT id, order_number, customer_name, total_amount FROM agents.order_records WHERE user_id = $1 ORDER BY id',
      [TEST_USER_ID],
    );
    expect(rows).toEqual([
      { id: 'ORD-001', order_number: 'SO-001', customer_name: 'Rossi SRL', total_amount: '1500.00' },
      { id: 'ORD-002', order_number: 'SO-002', customer_name: 'Bianchi SPA', total_amount: '2500.00' },
    ]);
  });

  test('second sync with same data produces no updates (hash match)', async () => {
    const orders = [
      makeOrder({ id: 'ORD-010', orderNumber: 'SO-010', customerName: 'Verdi SNC', creationDate: '2026-02-01', salesStatus: 'Open', totalAmount: '500.00' }),
    ];

    await syncOrders(makeDeps(pool, orders), TEST_USER_ID, vi.fn(), neverStop);
    const secondResult = await syncOrders(makeDeps(pool, orders), TEST_USER_ID, vi.fn(), neverStop);

    expect(secondResult.ordersInserted).toBe(0);
    expect(secondResult.ordersUpdated).toBe(0);
    expect(secondResult.ordersSkipped).toBe(1);
  });

  test('sync with missing order deletes stale record and cascades to order_articles', async () => {
    const twoOrders = [
      makeOrder({ id: 'ORD-020', orderNumber: 'SO-020', customerName: 'Alpha SRL', creationDate: '2026-03-01' }),
      makeOrder({ id: 'ORD-021', orderNumber: 'SO-021', customerName: 'Beta SRL', creationDate: '2026-03-02' }),
    ];
    await syncOrders(makeDeps(pool, twoOrders), TEST_USER_ID, vi.fn(), neverStop);

    await pool.query(
      `INSERT INTO agents.order_articles (order_id, user_id, article_code, quantity, created_at) VALUES ($1, $2, $3, $4, NOW())`,
      ['ORD-021', TEST_USER_ID, 'ART-001', 5],
    );

    const oneOrder = [
      makeOrder({ id: 'ORD-020', orderNumber: 'SO-020', customerName: 'Alpha SRL', creationDate: '2026-03-01' }),
    ];
    const result = await syncOrders(makeDeps(pool, oneOrder), TEST_USER_ID, vi.fn(), neverStop);

    expect(result.ordersDeleted).toBe(1);

    const { rows: orderRows } = await pool.query<{ id: string }>(
      'SELECT id FROM agents.order_records WHERE user_id = $1 ORDER BY id',
      [TEST_USER_ID],
    );
    expect(orderRows).toEqual([{ id: 'ORD-020' }]);

    const { rows: articleRows } = await pool.query<{ order_id: string }>(
      'SELECT order_id FROM agents.order_articles WHERE order_id = $1',
      ['ORD-021'],
    );
    expect(articleRows).toEqual([]);
  });

  test('hash-based update detection triggers when field changes', async () => {
    const originalOrder = makeOrder({
      id: 'ORD-030',
      orderNumber: 'SO-030',
      customerName: 'Neri SRL',
      creationDate: '2026-04-01',
      salesStatus: 'Open',
      documentStatus: 'Draft',
      totalAmount: '1000.00',
    });
    await syncOrders(makeDeps(pool, [originalOrder]), TEST_USER_ID, vi.fn(), neverStop);

    const modifiedOrder = makeOrder({
      id: 'ORD-030',
      orderNumber: 'SO-030',
      customerName: 'Neri SRL',
      creationDate: '2026-04-01',
      salesStatus: 'Confirmed',
      documentStatus: 'Approved',
      totalAmount: '1200.00',
    });

    const originalHash = computeOrderHash(originalOrder);
    const modifiedHash = computeOrderHash(modifiedOrder);
    expect(originalHash).not.toBe(modifiedHash);

    const result = await syncOrders(makeDeps(pool, [modifiedOrder]), TEST_USER_ID, vi.fn(), neverStop);

    expect(result.ordersUpdated).toBe(1);

    const { rows } = await pool.query<{ sales_status: string; document_status: string; total_amount: string }>(
      'SELECT sales_status, document_status, total_amount FROM agents.order_records WHERE id = $1 AND user_id = $2',
      ['ORD-030', TEST_USER_ID],
    );
    expect(rows).toEqual([{ sales_status: 'Confirmed', document_status: 'Approved', total_amount: '1200.00' }]);
  });
});

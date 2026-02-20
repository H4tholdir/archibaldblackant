import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import type { OrderInput, OrderArticleInput } from './orders';

function createMockPool(queryImpl?: DbPool['query']): DbPool & { queryCalls: Array<{ text: string; params?: unknown[] }> } {
  const queryCalls: Array<{ text: string; params?: unknown[] }> = [];

  return {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params });
      if (queryImpl) return queryImpl(text, params);
      return { rows: [], rowCount: 0 } as any;
    }),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

const SAMPLE_ORDER: OrderInput = {
  id: '70.962',
  orderNumber: 'ORD/26000887',
  customerProfileId: '1002241',
  customerName: 'Carrazza Giovanni',
  deliveryName: 'Carrazza Giovanni',
  deliveryAddress: 'Via Mezzacapo, 121 84036 Sala Consilina Sa',
  creationDate: '2026-01-20T12:04:22',
  deliveryDate: '2026-01-21',
  remainingSalesFinancial: null,
  customerReference: null,
  salesStatus: 'Ordine aperto',
  orderType: 'Ordine di vendita',
  documentStatus: 'Nessuno',
  salesOrigin: 'Agent',
  transferStatus: 'Trasferito',
  transferDate: '2026-01-20',
  completionDate: '2026-01-20',
  discountPercent: '21,49 %',
  grossAmount: '105,60 \u20ac',
  totalAmount: '82,91 \u20ac',
};

const SAMPLE_ORDER_ROW = {
  id: '70.962',
  user_id: 'user-1',
  order_number: 'ORD/26000887',
  customer_profile_id: '1002241',
  customer_name: 'Carrazza Giovanni',
  delivery_name: 'Carrazza Giovanni',
  delivery_address: 'Via Mezzacapo, 121 84036 Sala Consilina Sa',
  creation_date: '2026-01-20T12:04:22',
  delivery_date: '2026-01-21',
  remaining_sales_financial: null,
  customer_reference: null,
  sales_status: 'Ordine aperto',
  order_type: 'Ordine di vendita',
  document_status: 'Nessuno',
  sales_origin: 'Agent',
  transfer_status: 'Trasferito',
  transfer_date: '2026-01-20',
  completion_date: '2026-01-20',
  discount_percent: '21,49 %',
  gross_amount: '105,60 \u20ac',
  total_amount: '82,91 \u20ac',
  is_quote: null,
  is_gift_order: null,
  hash: 'abc123',
  last_sync: 1737370000,
  created_at: '2026-01-20T12:04:22Z',
  ddt_number: null,
  ddt_delivery_date: null,
  ddt_id: null,
  ddt_customer_account: null,
  ddt_sales_name: null,
  ddt_delivery_name: null,
  delivery_terms: null,
  delivery_method: null,
  delivery_city: null,
  attention_to: null,
  ddt_delivery_address: null,
  ddt_total: null,
  ddt_customer_reference: null,
  ddt_description: null,
  tracking_number: null,
  tracking_url: null,
  tracking_courier: null,
  delivery_completed_date: null,
  invoice_number: null,
  invoice_date: null,
  invoice_amount: null,
  invoice_customer_account: null,
  invoice_billing_name: null,
  invoice_quantity: null,
  invoice_remaining_amount: null,
  invoice_tax_amount: null,
  invoice_line_discount: null,
  invoice_total_discount: null,
  invoice_due_date: null,
  invoice_payment_terms_id: null,
  invoice_purchase_order: null,
  invoice_closed: null,
  invoice_days_past_due: null,
  invoice_settled_amount: null,
  invoice_last_payment_id: null,
  invoice_last_settlement_date: null,
  invoice_closed_date: null,
  current_state: null,
  sent_to_verona_at: null,
  archibald_order_id: null,
  total_vat_amount: null,
  total_with_vat: null,
  articles_synced_at: null,
  shipping_cost: null,
  shipping_tax: null,
};

describe('getOrderById', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns mapped order when found', async () => {
    const pool = createMockPool(async () => ({ rows: [SAMPLE_ORDER_ROW], rowCount: 1 }) as any);

    const { getOrderById } = await import('./orders');
    const result = await getOrderById(pool, 'user-1', '70.962');

    expect(result).toEqual(expect.objectContaining({
      id: '70.962',
      userId: 'user-1',
      orderNumber: 'ORD/26000887',
      customerName: 'Carrazza Giovanni',
      salesStatus: 'Ordine aperto',
      lastSync: 1737370000,
    }));
  });

  test('returns null when order not found', async () => {
    const pool = createMockPool(async () => ({ rows: [], rowCount: 0 }) as any);

    const { getOrderById } = await import('./orders');
    const result = await getOrderById(pool, 'user-1', 'nonexistent');

    expect(result).toBeNull();
  });

  test('queries with correct parameters', async () => {
    const pool = createMockPool();

    const { getOrderById } = await import('./orders');
    await getOrderById(pool, 'user-abc', 'order-xyz');

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM agents.order_records WHERE id = $1 AND user_id = $2',
      ['order-xyz', 'user-abc'],
    );
  });
});

describe('upsertOrder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('inserts new order when not existing', async () => {
    const pool = createMockPool(async (text) => {
      if (text.includes('SELECT hash')) return { rows: [], rowCount: 0 } as any;
      return { rows: [], rowCount: 1 } as any;
    });

    const { upsertOrder } = await import('./orders');
    const result = await upsertOrder(pool, 'user-1', SAMPLE_ORDER);

    expect(result.action).toBe('inserted');
    const insertCall = pool.queryCalls.find((c) => c.text.includes('INSERT INTO agents.order_records'));
    expect(insertCall).toBeDefined();
    expect(insertCall!.params![0]).toBe('70.962');
    expect(insertCall!.params![1]).toBe('user-1');
    expect(insertCall!.params![2]).toBe('ORD/26000887');
  });

  test('skips unchanged order with same hash', async () => {
    const { computeHash } = await import('./orders');
    const existingHash = computeHash(SAMPLE_ORDER);

    const pool = createMockPool(async (text) => {
      if (text.includes('SELECT hash')) {
        return { rows: [{ hash: existingHash, order_number: 'ORD/26000887' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 1 } as any;
    });

    const { upsertOrder } = await import('./orders');
    const result = await upsertOrder(pool, 'user-1', SAMPLE_ORDER);

    expect(result.action).toBe('skipped');
    const updateCall = pool.queryCalls.find((c) => c.text.includes('UPDATE') && c.text.includes('last_sync'));
    expect(updateCall).toBeDefined();
  });

  test('updates order when hash differs', async () => {
    const pool = createMockPool(async (text) => {
      if (text.includes('SELECT hash')) {
        return { rows: [{ hash: 'old-different-hash', order_number: 'ORD/26000887' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 1 } as any;
    });

    const { upsertOrder } = await import('./orders');
    const result = await upsertOrder(pool, 'user-1', SAMPLE_ORDER);

    expect(result.action).toBe('updated');
    const updateCall = pool.queryCalls.find((c) => c.text.includes('UPDATE') && c.text.includes('customer_profile_id'));
    expect(updateCall).toBeDefined();
  });

  test('detects order number change from PENDING to ORD', async () => {
    const pool = createMockPool(async (text) => {
      if (text.includes('SELECT hash')) {
        return { rows: [{ hash: 'same-hash-wont-matter', order_number: 'PENDING-70.962' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 1 } as any;
    });

    const { upsertOrder } = await import('./orders');
    const result = await upsertOrder(pool, 'user-1', SAMPLE_ORDER);

    expect(result.orderNumberChanged).toEqual({
      from: 'PENDING-70.962',
      to: 'ORD/26000887',
    });
  });
});

describe('getOrdersByUser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns mapped orders for user', async () => {
    const secondRow = { ...SAMPLE_ORDER_ROW, id: '70.963', order_number: 'ORD/26000888' };
    const pool = createMockPool(async () => ({ rows: [SAMPLE_ORDER_ROW, secondRow], rowCount: 2 }) as any);

    const { getOrdersByUser } = await import('./orders');
    const result = await getOrdersByUser(pool, 'user-1');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('70.962');
    expect(result[1].id).toBe('70.963');
  });

  test('applies search filter with ILIKE', async () => {
    const pool = createMockPool();

    const { getOrdersByUser } = await import('./orders');
    await getOrdersByUser(pool, 'user-1', { search: 'Carrazza' });

    const call = pool.queryCalls[0];
    expect(call.text).toContain('ILIKE');
    expect(call.params).toContain('%Carrazza%');
  });

  test('applies status filter with exact match', async () => {
    const pool = createMockPool();

    const { getOrdersByUser } = await import('./orders');
    await getOrdersByUser(pool, 'user-1', { status: 'Ordine aperto' });

    const call = pool.queryCalls[0];
    expect(call.text).toContain('sales_status =');
    expect(call.params).toContain('Ordine aperto');
  });

  test('applies date range filters', async () => {
    const pool = createMockPool();

    const { getOrdersByUser } = await import('./orders');
    await getOrdersByUser(pool, 'user-1', { dateFrom: '2026-01-01', dateTo: '2026-01-31' });

    const call = pool.queryCalls[0];
    expect(call.text).toContain('creation_date >=');
    expect(call.text).toContain('creation_date <=');
    expect(call.params).toContain('2026-01-01');
    expect(call.params).toContain('2026-01-31');
  });

  test('applies pagination with limit and offset', async () => {
    const pool = createMockPool();

    const { getOrdersByUser } = await import('./orders');
    await getOrdersByUser(pool, 'user-1', { limit: 25, offset: 50 });

    const call = pool.queryCalls[0];
    expect(call.text).toContain('LIMIT');
    expect(call.text).toContain('OFFSET');
    expect(call.params).toContain(25);
    expect(call.params).toContain(50);
  });

  test('uses default limit 1000 and offset 0 when not specified', async () => {
    const pool = createMockPool();

    const { getOrdersByUser } = await import('./orders');
    await getOrdersByUser(pool, 'user-1');

    const call = pool.queryCalls[0];
    expect(call.params).toContain(1000);
    expect(call.params).toContain(0);
  });
});

describe('countOrders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns count for user', async () => {
    const pool = createMockPool(async () => ({ rows: [{ count: '42' }], rowCount: 1 }) as any);

    const { countOrders } = await import('./orders');
    const result = await countOrders(pool, 'user-1');

    expect(result).toBe(42);
  });

  test('applies filters to count query', async () => {
    const pool = createMockPool(async () => ({ rows: [{ count: '5' }], rowCount: 1 }) as any);

    const { countOrders } = await import('./orders');
    const result = await countOrders(pool, 'user-1', { status: 'Consegnato', search: 'test' });

    expect(result).toBe(5);
    const call = pool.queryCalls[0];
    expect(call.text).toContain('COUNT(*)');
    expect(call.text).toContain('sales_status =');
    expect(call.text).toContain('ILIKE');
  });
});

describe('deleteOrderById', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('deletes child records then order and returns affected rows', async () => {
    const pool = createMockPool(async (text) => {
      if (text.includes('DELETE FROM agents.order_records')) return { rows: [], rowCount: 1 } as any;
      return { rows: [], rowCount: 0 } as any;
    });

    const { deleteOrderById } = await import('./orders');
    const result = await deleteOrderById(pool, 'user-1', '70.962');

    expect(result).toBe(1);

    const deleteHistoryCall = pool.queryCalls.find((c) => c.text.includes('order_state_history'));
    const deleteArticlesCall = pool.queryCalls.find((c) => c.text.includes('order_articles'));
    const deleteOrderCall = pool.queryCalls.find((c) => c.text.includes('order_records'));
    expect(deleteHistoryCall).toBeDefined();
    expect(deleteArticlesCall).toBeDefined();
    expect(deleteOrderCall).toBeDefined();
  });

  test('passes userId and orderId to all delete queries', async () => {
    const pool = createMockPool();

    const { deleteOrderById } = await import('./orders');
    await deleteOrderById(pool, 'user-abc', 'order-xyz');

    for (const call of pool.queryCalls) {
      expect(call.params).toContain('order-xyz');
      expect(call.params).toContain('user-abc');
    }
  });
});

describe('saveOrderArticles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns 0 for empty array without querying', async () => {
    const pool = createMockPool();

    const { saveOrderArticles } = await import('./orders');
    const result = await saveOrderArticles(pool, []);

    expect(result).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('batch inserts articles and returns count', async () => {
    const pool = createMockPool();
    const articles: OrderArticleInput[] = [
      { orderId: '70.962', userId: 'user-1', articleCode: 'ART001', quantity: 10 },
      { orderId: '70.962', userId: 'user-1', articleCode: 'ART002', quantity: 5, unitPrice: 12.50 },
    ];

    const { saveOrderArticles } = await import('./orders');
    const result = await saveOrderArticles(pool, articles);

    expect(result).toBe(2);
    const call = pool.queryCalls[0];
    expect(call.text).toContain('INSERT INTO agents.order_articles');
    expect(call.params).toContain('ART001');
    expect(call.params).toContain('ART002');
    expect(call.params).toContain(10);
    expect(call.params).toContain(5);
  });

  test('uses single INSERT with multiple value tuples', async () => {
    const pool = createMockPool();
    const articles: OrderArticleInput[] = [
      { orderId: '70.962', userId: 'user-1', articleCode: 'A1', quantity: 1 },
      { orderId: '70.962', userId: 'user-1', articleCode: 'A2', quantity: 2 },
      { orderId: '70.962', userId: 'user-1', articleCode: 'A3', quantity: 3 },
    ];

    const { saveOrderArticles } = await import('./orders');
    await saveOrderArticles(pool, articles);

    expect(pool.queryCalls).toHaveLength(1);
    expect(pool.queryCalls[0].params).toHaveLength(42);
  });
});

describe('updateOrderState', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('updates order state and inserts history record', async () => {
    const pool = createMockPool(async (text) => {
      if (text.includes('SELECT current_state')) {
        return { rows: [{ current_state: 'pending' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 1 } as any;
    });

    const { updateOrderState } = await import('./orders');
    await updateOrderState(pool, 'user-1', '70.962', 'shipped', 'system', 'Order shipped', 'high', 'sync');

    const updateCall = pool.queryCalls.find((c) => c.text.includes('UPDATE agents.order_records SET current_state'));
    expect(updateCall).toBeDefined();
    expect(updateCall!.params![0]).toBe('shipped');

    const historyCall = pool.queryCalls.find((c) => c.text.includes('INSERT INTO agents.order_state_history'));
    expect(historyCall).toBeDefined();
    expect(historyCall!.params).toContain('pending');
    expect(historyCall!.params).toContain('shipped');
    expect(historyCall!.params).toContain('system');
    expect(historyCall!.params).toContain('Order shipped');
    expect(historyCall!.params).toContain('high');
    expect(historyCall!.params).toContain('sync');
  });

  test('does nothing when order not found', async () => {
    const pool = createMockPool(async () => ({ rows: [], rowCount: 0 }) as any);

    const { updateOrderState } = await import('./orders');
    await updateOrderState(pool, 'user-1', 'nonexistent', 'shipped', 'system', null);

    const updateCall = pool.queryCalls.find((c) => c.text.includes('UPDATE agents.order_records SET current_state'));
    expect(updateCall).toBeUndefined();
  });

  test('handles null confidence and source', async () => {
    const pool = createMockPool(async (text) => {
      if (text.includes('SELECT current_state')) {
        return { rows: [{ current_state: null }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 1 } as any;
    });

    const { updateOrderState } = await import('./orders');
    await updateOrderState(pool, 'user-1', '70.962', 'new-state', 'actor', null);

    const historyCall = pool.queryCalls.find((c) => c.text.includes('INSERT INTO agents.order_state_history'));
    expect(historyCall!.params![6]).toBeNull();
    expect(historyCall!.params![7]).toBeNull();
  });
});

describe('getStateHistory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns mapped state history entries', async () => {
    const historyRow = {
      id: 1,
      order_id: '70.962',
      user_id: 'user-1',
      old_state: 'pending',
      new_state: 'shipped',
      actor: 'system',
      notes: 'Auto-detected',
      confidence: 'high',
      source: 'sync',
      timestamp: '2026-01-20T15:00:00Z',
      created_at: '2026-01-20T15:00:00Z',
    };
    const pool = createMockPool(async () => ({ rows: [historyRow], rowCount: 1 }) as any);

    const { getStateHistory } = await import('./orders');
    const result = await getStateHistory(pool, 'user-1', '70.962');

    expect(result).toEqual([{
      id: 1,
      orderId: '70.962',
      userId: 'user-1',
      oldState: 'pending',
      newState: 'shipped',
      actor: 'system',
      notes: 'Auto-detected',
      confidence: 'high',
      source: 'sync',
      timestamp: '2026-01-20T15:00:00Z',
      createdAt: '2026-01-20T15:00:00Z',
    }]);
  });
});

describe('getOrderArticles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns mapped articles for order', async () => {
    const articleRow = {
      id: 1,
      order_id: '70.962',
      user_id: 'user-1',
      article_code: 'ART001',
      article_description: 'Test Article',
      quantity: 10,
      unit_price: 25.50,
      discount_percent: 10,
      line_amount: 229.50,
      vat_percent: 22,
      vat_amount: 50.49,
      line_total_with_vat: 279.99,
      warehouse_quantity: null,
      warehouse_sources_json: null,
      created_at: '2026-01-20T12:00:00Z',
    };
    const pool = createMockPool(async () => ({ rows: [articleRow], rowCount: 1 }) as any);

    const { getOrderArticles } = await import('./orders');
    const result = await getOrderArticles(pool, '70.962', 'user-1');

    expect(result).toEqual([{
      id: 1,
      orderId: '70.962',
      userId: 'user-1',
      articleCode: 'ART001',
      articleDescription: 'Test Article',
      quantity: 10,
      unitPrice: 25.50,
      discountPercent: 10,
      lineAmount: 229.50,
      vatPercent: 22,
      vatAmount: 50.49,
      lineTotalWithVat: 279.99,
      warehouseQuantity: null,
      warehouseSourcesJson: null,
      createdAt: '2026-01-20T12:00:00Z',
    }]);
  });
});

describe('deleteOrderArticles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('deletes articles and returns affected count', async () => {
    const pool = createMockPool(async () => ({ rows: [], rowCount: 3 }) as any);

    const { deleteOrderArticles } = await import('./orders');
    const result = await deleteOrderArticles(pool, '70.962', 'user-1');

    expect(result).toBe(3);
    expect(pool.query).toHaveBeenCalledWith(
      'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
      ['70.962', 'user-1'],
    );
  });
});

describe('updateOrderDDT', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('updates DDT fields and returns affected rows', async () => {
    const pool = createMockPool(async () => ({ rows: [], rowCount: 1 }) as any);

    const { updateOrderDDT } = await import('./orders');
    const result = await updateOrderDDT(pool, 'user-1', '70.962', {
      ddtNumber: 'DDT/001',
      ddtDeliveryDate: '2026-01-25',
      trackingNumber: 'TRK123',
    });

    expect(result).toBe(1);
    const call = pool.queryCalls[0];
    expect(call.text).toContain('UPDATE agents.order_records');
    expect(call.params).toContain('DDT/001');
    expect(call.params).toContain('2026-01-25');
    expect(call.params).toContain('TRK123');
  });
});

describe('updateInvoiceData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('updates invoice fields and returns affected rows', async () => {
    const pool = createMockPool(async () => ({ rows: [], rowCount: 1 }) as any);

    const { updateInvoiceData } = await import('./orders');
    const result = await updateInvoiceData(pool, 'user-1', '70.962', {
      invoiceNumber: 'INV/001',
      invoiceAmount: '82,91 \u20ac',
      invoiceClosed: false,
    });

    expect(result).toBe(1);
    const call = pool.queryCalls[0];
    expect(call.text).toContain('UPDATE agents.order_records');
    expect(call.params).toContain('INV/001');
    expect(call.params).toContain('82,91 \u20ac');
    expect(call.params).toContain(false);
  });
});

describe('deleteOrdersNotInList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns 0 for empty validOrderIds', async () => {
    const pool = createMockPool();

    const { deleteOrdersNotInList } = await import('./orders');
    const result = await deleteOrdersNotInList(pool, 'user-1', []);

    expect(result).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('returns 0 when no stale orders found', async () => {
    const pool = createMockPool(async () => ({ rows: [], rowCount: 0 }) as any);

    const { deleteOrdersNotInList } = await import('./orders');
    const result = await deleteOrdersNotInList(pool, 'user-1', ['70.962', '70.963']);

    expect(result).toBe(0);
  });

  test('deletes stale orders with cascade', async () => {
    let callCount = 0;
    const pool = createMockPool(async (text) => {
      callCount++;
      if (text.includes('SELECT id FROM agents.order_records')) {
        return { rows: [{ id: '70.999' }], rowCount: 1 } as any;
      }
      if (text.includes('DELETE FROM agents.order_records')) {
        return { rows: [], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const { deleteOrdersNotInList } = await import('./orders');
    const result = await deleteOrdersNotInList(pool, 'user-1', ['70.962']);

    expect(result).toBe(1);
    const articleDeleteCall = pool.queryCalls.find((c) => c.text.includes('DELETE FROM agents.order_articles'));
    const historyDeleteCall = pool.queryCalls.find((c) => c.text.includes('DELETE FROM agents.order_state_history'));
    const orderDeleteCall = pool.queryCalls.find((c) => c.text.includes('DELETE FROM agents.order_records'));
    expect(articleDeleteCall).toBeDefined();
    expect(historyDeleteCall).toBeDefined();
    expect(orderDeleteCall).toBeDefined();
    expect(articleDeleteCall!.params).toContain('70.999');
  });
});

describe('computeHash', () => {
  test('produces consistent hash for same input', async () => {
    const { computeHash } = await import('./orders');
    const hash1 = computeHash(SAMPLE_ORDER);
    const hash2 = computeHash(SAMPLE_ORDER);
    expect(hash1).toBe(hash2);
  });

  test('produces different hash for different salesStatus', async () => {
    const { computeHash } = await import('./orders');
    const hash1 = computeHash(SAMPLE_ORDER);
    const hash2 = computeHash({ ...SAMPLE_ORDER, salesStatus: 'Consegnato' });
    expect(hash1).not.toBe(hash2);
  });

  test('produces different hash for different totalAmount', async () => {
    const { computeHash } = await import('./orders');
    const hash1 = computeHash(SAMPLE_ORDER);
    const hash2 = computeHash({ ...SAMPLE_ORDER, totalAmount: '999,00 \u20ac' });
    expect(hash1).not.toBe(hash2);
  });
});

describe('mapRowToOrder', () => {
  test('maps all snake_case fields to camelCase', async () => {
    const { mapRowToOrder } = await import('./orders');
    const order = mapRowToOrder(SAMPLE_ORDER_ROW);

    expect(order.id).toBe(SAMPLE_ORDER_ROW.id);
    expect(order.userId).toBe(SAMPLE_ORDER_ROW.user_id);
    expect(order.orderNumber).toBe(SAMPLE_ORDER_ROW.order_number);
    expect(order.customerProfileId).toBe(SAMPLE_ORDER_ROW.customer_profile_id);
    expect(order.customerName).toBe(SAMPLE_ORDER_ROW.customer_name);
    expect(order.deliveryName).toBe(SAMPLE_ORDER_ROW.delivery_name);
    expect(order.creationDate).toBe(SAMPLE_ORDER_ROW.creation_date);
    expect(order.salesStatus).toBe(SAMPLE_ORDER_ROW.sales_status);
    expect(order.lastSync).toBe(SAMPLE_ORDER_ROW.last_sync);
    expect(order.createdAt).toBe(SAMPLE_ORDER_ROW.created_at);
    expect(order.shippingCost).toBe(SAMPLE_ORDER_ROW.shipping_cost);
    expect(order.shippingTax).toBe(SAMPLE_ORDER_ROW.shipping_tax);
  });
});

describe('getOrderByNumber', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('queries by order_number and returns mapped order', async () => {
    const pool = createMockPool(async () => ({ rows: [SAMPLE_ORDER_ROW], rowCount: 1 }) as any);

    const { getOrderByNumber } = await import('./orders');
    const result = await getOrderByNumber(pool, 'user-1', 'ORD/26000887');

    expect(result).toEqual(expect.objectContaining({
      id: '70.962',
      orderNumber: 'ORD/26000887',
    }));
    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM agents.order_records WHERE order_number = $1 AND user_id = $2',
      ['ORD/26000887', 'user-1'],
    );
  });

  test('returns null when order number not found', async () => {
    const pool = createMockPool(async () => ({ rows: [], rowCount: 0 }) as any);

    const { getOrderByNumber } = await import('./orders');
    const result = await getOrderByNumber(pool, 'user-1', 'ORD/NONEXISTENT');

    expect(result).toBeNull();
  });
});

describe('buildFilterClause', () => {
  test('returns empty clause when no options provided', async () => {
    const { buildFilterClause } = await import('./orders');
    const result = buildFilterClause();
    expect(result).toEqual({ clause: '', params: [] });
  });

  test('returns empty clause when empty options provided', async () => {
    const { buildFilterClause } = await import('./orders');
    const result = buildFilterClause({});
    expect(result).toEqual({ clause: '', params: [] });
  });

  test('combines multiple filters with AND', async () => {
    const { buildFilterClause } = await import('./orders');
    const result = buildFilterClause({ status: 'Ordine aperto', customer: 'Giovanni' });
    expect(result.clause).toContain('AND');
    expect(result.params).toContain('%Giovanni%');
  });
});

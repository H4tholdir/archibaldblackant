import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';

function createMockPool(): DbPool & { queryCalls: Array<{ text: string; params?: unknown[] }> } {
  const queryCalls: Array<{ text: string; params?: unknown[] }> = [];

  return {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params });
      return { rows: [], rowCount: 0 } as any;
    }),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

const TEST_USER_ID = 'user-fresis-001';

const sampleHistoryRow = {
  id: 'fh-001',
  user_id: TEST_USER_ID,
  original_pending_order_id: 'pending-001',
  sub_client_codice: 'SC001',
  sub_client_name: 'Sub Client One',
  sub_client_data: { address: 'Via Roma 1' },
  customer_id: 'CUST001',
  customer_name: 'Acme Corp',
  items: [{ code: 'ART001', qty: 2 }],
  discount_percent: 10.5,
  target_total_with_vat: 1210.0,
  shipping_cost: 15.0,
  shipping_tax: 3.3,
  merged_into_order_id: null,
  merged_at: null,
  created_at: '2026-01-10T10:00:00Z',
  updated_at: '2026-01-15T14:30:00Z',
  notes: 'Test note',
  archibald_order_id: 'AO-001',
  archibald_order_number: 'AON-001',
  current_state: 'confirmed',
  state_updated_at: '2026-01-12T08:00:00Z',
  ddt_number: 'DDT-001',
  ddt_delivery_date: '2026-01-20',
  tracking_number: 'TRK-001',
  tracking_url: 'https://tracking.example.com/TRK-001',
  tracking_courier: 'BRT',
  delivery_completed_date: null,
  invoice_number: 'INV-001',
  invoice_date: '2026-01-25',
  invoice_amount: '1210.00',
  source: 'app',
  revenue: 500.0,
  invoice_closed: false,
  invoice_remaining_amount: '600.00',
  invoice_due_date: '2026-02-25',
  arca_data: null,
  parent_customer_name: 'Parent Corp',
};

describe('getAll', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns all mapped records for user', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [sampleHistoryRow],
      rowCount: 1,
    });

    const { getAll, mapRowToFresisHistory } = await import('./fresis-history');
    const result = await getAll(pool, TEST_USER_ID);

    expect(result).toEqual([mapRowToFresisHistory(sampleHistoryRow)]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM agents.fresis_history'),
      [TEST_USER_ID],
    );
  });

  test('returns empty array when no records exist', async () => {
    const pool = createMockPool();

    const { getAll } = await import('./fresis-history');
    const result = await getAll(pool, TEST_USER_ID);

    expect(result).toEqual([]);
  });

  test('includes user_id filter in WHERE clause', async () => {
    const pool = createMockPool();

    const { getAll } = await import('./fresis-history');
    await getAll(pool, TEST_USER_ID);

    const call = pool.queryCalls[0];
    expect(call.text).toContain('user_id = $1');
    expect(call.params).toEqual([TEST_USER_ID]);
  });
});

describe('getById', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns mapped record when found', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [sampleHistoryRow],
      rowCount: 1,
    });

    const { getById, mapRowToFresisHistory } = await import('./fresis-history');
    const result = await getById(pool, TEST_USER_ID, 'fh-001');

    expect(result).toEqual(mapRowToFresisHistory(sampleHistoryRow));
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM agents.fresis_history'),
      ['fh-001', TEST_USER_ID],
    );
  });

  test('returns null when record not found', async () => {
    const pool = createMockPool();

    const { getById } = await import('./fresis-history');
    const result = await getById(pool, TEST_USER_ID, 'nonexistent');

    expect(result).toBeNull();
  });

  test('query filters by both id and user_id', async () => {
    const pool = createMockPool();

    const { getById } = await import('./fresis-history');
    await getById(pool, TEST_USER_ID, 'fh-001');

    const call = pool.queryCalls[0];
    expect(call.text).toContain('id = $1');
    expect(call.text).toContain('user_id = $2');
    expect(call.params).toEqual(['fh-001', TEST_USER_ID]);
  });
});

describe('upsertRecords', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('performs batch upsert and returns inserted/updated counts', async () => {
    const pool = createMockPool();
    const queryMock = pool.query as ReturnType<typeof vi.fn>;
    queryMock.mockResolvedValueOnce({
      rows: [{ action: 'inserted' }, { action: 'updated' }],
      rowCount: 2,
    });

    const { upsertRecords } = await import('./fresis-history');
    const records = [
      {
        id: 'fh-new',
        originalPendingOrderId: null,
        subClientCodice: 'SC001',
        subClientName: 'Sub Client',
        subClientData: null,
        customerId: 'CUST001',
        customerName: 'Customer One',
        items: [{ code: 'A1', qty: 1 }],
        discountPercent: null,
        targetTotalWithVat: null,
        shippingCost: null,
        shippingTax: null,
        revenue: null,
        mergedIntoOrderId: null,
        mergedAt: null,
        createdAt: '2026-01-10T00:00:00Z',
        updatedAt: '2026-01-10T00:00:00Z',
        notes: null,
        archibaldOrderId: null,
        archibaldOrderNumber: null,
        currentState: null,
        stateUpdatedAt: null,
        ddtNumber: null,
        ddtDeliveryDate: null,
        trackingNumber: null,
        trackingUrl: null,
        trackingCourier: null,
        deliveryCompletedDate: null,
        invoiceNumber: null,
        invoiceDate: null,
        invoiceAmount: null,
        invoiceClosed: null,
        invoiceRemainingAmount: null,
        invoiceDueDate: null,
        arcaData: null,
        parentCustomerName: null,
        source: 'app',
      },
      {
        id: 'fh-existing',
        originalPendingOrderId: 'pending-002',
        subClientCodice: 'SC002',
        subClientName: 'Sub Client 2',
        subClientData: { addr: 'Via Verdi' },
        customerId: 'CUST002',
        customerName: 'Customer Two',
        items: [{ code: 'A2', qty: 3 }],
        discountPercent: 5,
        targetTotalWithVat: 550,
        shippingCost: 10,
        shippingTax: 2.2,
        revenue: 200,
        mergedIntoOrderId: null,
        mergedAt: null,
        createdAt: '2026-01-08T00:00:00Z',
        updatedAt: '2026-01-12T00:00:00Z',
        notes: 'Updated',
        archibaldOrderId: 'AO-002',
        archibaldOrderNumber: 'AON-002',
        currentState: 'shipped',
        stateUpdatedAt: '2026-01-11T00:00:00Z',
        ddtNumber: 'DDT-002',
        ddtDeliveryDate: '2026-01-18',
        trackingNumber: 'TRK-002',
        trackingUrl: 'https://track.example.com/TRK-002',
        trackingCourier: 'DHL',
        deliveryCompletedDate: null,
        invoiceNumber: null,
        invoiceDate: null,
        invoiceAmount: null,
        invoiceClosed: null,
        invoiceRemainingAmount: null,
        invoiceDueDate: null,
        arcaData: null,
        parentCustomerName: null,
        source: 'app',
      },
    ];

    const result = await upsertRecords(pool, TEST_USER_ID, records);

    expect(result).toEqual({ inserted: 1, updated: 1 });
  });

  test('returns zeros for empty records array', async () => {
    const pool = createMockPool();

    const { upsertRecords } = await import('./fresis-history');
    const result = await upsertRecords(pool, TEST_USER_ID, []);

    expect(result).toEqual({ inserted: 0, updated: 0 });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('uses ON CONFLICT(id) DO UPDATE in query', async () => {
    const pool = createMockPool();
    const queryMock = pool.query as ReturnType<typeof vi.fn>;
    queryMock.mockResolvedValueOnce({
      rows: [{ action: 'inserted' }],
      rowCount: 1,
    });

    const { upsertRecords } = await import('./fresis-history');
    await upsertRecords(pool, TEST_USER_ID, [
      {
        id: 'fh-test',
        originalPendingOrderId: null,
        subClientCodice: 'SC001',
        subClientName: 'Test',
        subClientData: null,
        customerId: 'C1',
        customerName: 'Cust',
        items: [],
        discountPercent: null,
        targetTotalWithVat: null,
        shippingCost: null,
        shippingTax: null,
        revenue: null,
        mergedIntoOrderId: null,
        mergedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        notes: null,
        archibaldOrderId: null,
        archibaldOrderNumber: null,
        currentState: null,
        stateUpdatedAt: null,
        ddtNumber: null,
        ddtDeliveryDate: null,
        trackingNumber: null,
        trackingUrl: null,
        trackingCourier: null,
        deliveryCompletedDate: null,
        invoiceNumber: null,
        invoiceDate: null,
        invoiceAmount: null,
        invoiceClosed: null,
        invoiceRemainingAmount: null,
        invoiceDueDate: null,
        arcaData: null,
        parentCustomerName: null,
        source: 'app',
      },
    ]);

    const [text] = vi.mocked(pool.query).mock.calls[0];
    expect(text).toContain('ON CONFLICT(id) DO UPDATE');
    expect(text).toContain('INSERT INTO agents.fresis_history');
  });

  test('stringifies JSONB fields', async () => {
    const pool = createMockPool();
    const queryMock = pool.query as ReturnType<typeof vi.fn>;
    queryMock.mockResolvedValueOnce({
      rows: [{ action: 'inserted' }],
      rowCount: 1,
    });

    const { upsertRecords } = await import('./fresis-history');
    const itemsData = [{ code: 'A1', qty: 5 }];
    const subClientData = { address: 'Via Roma' };
    const arcaData = { docType: 'FT' };

    await upsertRecords(pool, TEST_USER_ID, [
      {
        id: 'fh-json',
        originalPendingOrderId: null,
        subClientCodice: 'SC001',
        subClientName: 'Test',
        subClientData,
        customerId: 'C1',
        customerName: 'Cust',
        items: itemsData,
        discountPercent: null,
        targetTotalWithVat: null,
        shippingCost: null,
        shippingTax: null,
        revenue: null,
        mergedIntoOrderId: null,
        mergedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        notes: null,
        archibaldOrderId: null,
        archibaldOrderNumber: null,
        currentState: null,
        stateUpdatedAt: null,
        ddtNumber: null,
        ddtDeliveryDate: null,
        trackingNumber: null,
        trackingUrl: null,
        trackingCourier: null,
        deliveryCompletedDate: null,
        invoiceNumber: null,
        invoiceDate: null,
        invoiceAmount: null,
        invoiceClosed: null,
        invoiceRemainingAmount: null,
        invoiceDueDate: null,
        arcaData,
        parentCustomerName: null,
        source: 'app',
      },
    ]);

    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toContain(JSON.stringify(itemsData));
    expect(params).toContain(JSON.stringify(subClientData));
    expect(params).toContain(JSON.stringify(arcaData));
  });
});

describe('deleteRecord', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('deletes record and returns row count', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    });

    const { deleteRecord } = await import('./fresis-history');
    const result = await deleteRecord(pool, TEST_USER_ID, 'fh-001');

    expect(result).toBe(1);
    const [text, params] = vi.mocked(pool.query).mock.calls[0];
    expect(text).toContain('DELETE FROM agents.fresis_history');
    expect(text).toContain('id = $1');
    expect(text).toContain('user_id = $2');
    expect(params).toEqual(['fh-001', TEST_USER_ID]);
  });

  test('returns 0 when record does not exist', async () => {
    const pool = createMockPool();

    const { deleteRecord } = await import('./fresis-history');
    const result = await deleteRecord(pool, TEST_USER_ID, 'nonexistent');

    expect(result).toBe(0);
  });
});

describe('getByMotherOrder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns records matching merged_into_order_id, archibald_order_id, or LIKE pattern', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [sampleHistoryRow],
      rowCount: 1,
    });

    const { getByMotherOrder, mapRowToFresisHistory } = await import('./fresis-history');
    const result = await getByMotherOrder(pool, TEST_USER_ID, 'AO-001');

    expect(result).toEqual([mapRowToFresisHistory(sampleHistoryRow)]);
  });

  test('query uses OR conditions for merged_into_order_id, archibald_order_id, and LIKE', async () => {
    const pool = createMockPool();

    const { getByMotherOrder } = await import('./fresis-history');
    await getByMotherOrder(pool, TEST_USER_ID, 'AO-001');

    const call = pool.queryCalls[0];
    expect(call.text).toContain('merged_into_order_id = ');
    expect(call.text).toContain('archibald_order_id = ');
    expect(call.text).toContain('archibald_order_id LIKE');
    expect(call.text).toContain('user_id = $1');
  });

  test('passes orderId for all three match conditions', async () => {
    const pool = createMockPool();

    const { getByMotherOrder } = await import('./fresis-history');
    await getByMotherOrder(pool, TEST_USER_ID, 'ORD-123');

    const call = pool.queryCalls[0];
    expect(call.params).toContain(TEST_USER_ID);
    expect(call.params).toContain('ORD-123');
  });

  test('returns empty array when no matches', async () => {
    const pool = createMockPool();

    const { getByMotherOrder } = await import('./fresis-history');
    const result = await getByMotherOrder(pool, TEST_USER_ID, 'nonexistent');

    expect(result).toEqual([]);
  });

  test('uses LIKE pattern with orderId for JSON-embedded IDs', async () => {
    const pool = createMockPool();

    const { getByMotherOrder } = await import('./fresis-history');
    await getByMotherOrder(pool, TEST_USER_ID, 'ORD-123');

    const call = pool.queryCalls[0];
    expect(call.params).toContain('%ORD-123%');
  });
});

describe('mapRowToFresisHistory', () => {
  test('maps snake_case row to camelCase record', async () => {
    const { mapRowToFresisHistory } = await import('./fresis-history');
    const result = mapRowToFresisHistory(sampleHistoryRow);

    expect(result).toEqual({
      id: 'fh-001',
      userId: TEST_USER_ID,
      originalPendingOrderId: 'pending-001',
      subClientCodice: 'SC001',
      subClientName: 'Sub Client One',
      subClientData: { address: 'Via Roma 1' },
      customerId: 'CUST001',
      customerName: 'Acme Corp',
      items: [{ code: 'ART001', qty: 2 }],
      discountPercent: 10.5,
      targetTotalWithVat: 1210.0,
      shippingCost: 15.0,
      shippingTax: 3.3,
      mergedIntoOrderId: null,
      mergedAt: null,
      createdAt: '2026-01-10T10:00:00Z',
      updatedAt: '2026-01-15T14:30:00Z',
      notes: 'Test note',
      archibaldOrderId: 'AO-001',
      archibaldOrderNumber: 'AON-001',
      currentState: 'confirmed',
      stateUpdatedAt: '2026-01-12T08:00:00Z',
      ddtNumber: 'DDT-001',
      ddtDeliveryDate: '2026-01-20',
      trackingNumber: 'TRK-001',
      trackingUrl: 'https://tracking.example.com/TRK-001',
      trackingCourier: 'BRT',
      deliveryCompletedDate: null,
      invoiceNumber: 'INV-001',
      invoiceDate: '2026-01-25',
      invoiceAmount: '1210.00',
      source: 'app',
      revenue: 500.0,
      invoiceClosed: false,
      invoiceRemainingAmount: '600.00',
      invoiceDueDate: '2026-02-25',
      arcaData: null,
      parentCustomerName: 'Parent Corp',
    });
  });

  test('handles null optional fields', async () => {
    const { mapRowToFresisHistory } = await import('./fresis-history');
    const minimalRow = {
      id: 'fh-min',
      user_id: TEST_USER_ID,
      original_pending_order_id: null,
      sub_client_codice: 'SC',
      sub_client_name: 'Sub',
      sub_client_data: null,
      customer_id: 'C1',
      customer_name: 'Customer',
      items: [],
      discount_percent: null,
      target_total_with_vat: null,
      shipping_cost: null,
      shipping_tax: null,
      merged_into_order_id: null,
      merged_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      notes: null,
      archibald_order_id: null,
      archibald_order_number: null,
      current_state: null,
      state_updated_at: null,
      ddt_number: null,
      ddt_delivery_date: null,
      tracking_number: null,
      tracking_url: null,
      tracking_courier: null,
      delivery_completed_date: null,
      invoice_number: null,
      invoice_date: null,
      invoice_amount: null,
      source: 'app',
      revenue: null,
      invoice_closed: null,
      invoice_remaining_amount: null,
      invoice_due_date: null,
      arca_data: null,
      parent_customer_name: null,
    };

    const result = mapRowToFresisHistory(minimalRow);

    expect(result.id).toBe('fh-min');
    expect(result.originalPendingOrderId).toBeNull();
    expect(result.subClientData).toBeNull();
    expect(result.arcaData).toBeNull();
    expect(result.parentCustomerName).toBeNull();
  });
});

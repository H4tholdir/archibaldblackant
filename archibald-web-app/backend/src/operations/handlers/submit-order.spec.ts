import { describe, expect, test, vi } from 'vitest';
import { handleSubmitOrder, type SubmitOrderBot, type SubmitOrderData } from './submit-order';
import type { DbPool } from '../../db/pool';

vi.mock('../../db/repositories/customer-addresses', () => ({
  getAddressById: vi.fn(),
}));

import { getAddressById } from '../../db/repositories/customer-addresses';

function createMockPool(catalogPrices: Record<string, number> = {}): DbPool {
  const query = vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
    if (typeof sql === 'string' && sql.includes('vat_validated_at') && sql.includes('agents.customers')) {
      return Promise.resolve({
        rows: [{
          vat_validated_at: '2026-01-01T00:00:00Z',
          pec: 'test@pec.it',
          sdi: null,
          street: 'Via Test 1',
          postal_code: '80100',
        }],
        rowCount: 1,
      });
    }
    if (typeof sql === 'string' && sql.includes('RETURNING id')) {
      return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
    }
    if (typeof sql === 'string' && sql.includes('shared.prices') && Array.isArray(params?.[0])) {
      const requestedCodes = params![0] as string[];
      const rows = requestedCodes
        .filter((code) => catalogPrices[code] !== undefined)
        .map((code) => ({ product_id: code, unit_price: String(catalogPrices[code]) }));
      return Promise.resolve({ rows, rowCount: rows.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  return {
    query,
    withTransaction: vi.fn(async (fn) => fn({ query })),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(orderId = 'ORD-001'): SubmitOrderBot {
  return {
    createOrder: vi.fn().mockResolvedValue(orderId),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: SubmitOrderData = {
  pendingOrderId: 'pending-123',
  customerId: 'CUST-001',
  customerName: 'Acme Corp',
  items: [
    { articleCode: 'ART-01', productName: 'Widget', quantity: 10, price: 5.00, discount: 10 },
    { articleCode: 'ART-02', productName: 'Gadget', quantity: 5, price: 20.00 },
  ],
  discountPercent: 5,
};

describe('handleSubmitOrder', () => {
  test('calls bot.createOrder with the order data', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(bot.createOrder).toHaveBeenCalledWith(sampleData);
  });

  test('saves order record to agents.order_records', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_records'));
    expect(insertCalls).toHaveLength(1);

    const params = insertCalls[0][1] as unknown[];
    expect(params[0]).toBe('ORD-001');
    expect(params[1]).toBe('user-1');
    expect(params[3]).toBe('CUST-001');
    expect(params[4]).toBe('Acme Corp');
  });

  test('saves order articles to agents.order_articles', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const articleCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_articles'));
    expect(articleCalls).toHaveLength(1);

    const params = articleCalls[0][1] as unknown[];
    expect(params).toContain('ORD-001');
    expect(params).toContain('ART-01');
    expect(params).toContain('ART-02');
  });

  test('updates fresis_history to link pending order', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const fresisCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE agents.fresis_history'));
    expect(fresisCalls).toHaveLength(1);

    const params = fresisCalls[0][1] as unknown[];
    expect(params).toContain('ORD-001');
    expect(params).toContain('user-1');
    expect(params).toContain('pending-123');
  });

  test('deletes pending order from agents.pending_orders', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const deleteCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('DELETE FROM agents.pending_orders'));
    expect(deleteCalls).toHaveLength(1);

    const params = deleteCalls[0][1] as unknown[];
    expect(params).toContain('pending-123');
  });

  test('returns orderId in result', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    const result = await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(result.orderId).toBe('ORD-001');
  });

  test('calculates gross and total amounts correctly', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_records'));
    const params = insertCalls[0][1] as unknown[];

    // grossAmount = (10*5*(1-10/100)) + (5*20*(1-0/100)) = 45 + 100 = 145
    // totalAmount = 145 * (1-5/100) = 137.75
    // Stored as Italian format (comma as decimal separator)
    const grossIdx = params.indexOf('145,00');
    const totalIdx = params.indexOf('137,75');
    expect(grossIdx).toBeGreaterThan(-1);
    expect(totalIdx).toBeGreaterThan(-1);
  });

  test('reports progress at key milestones', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(expect.any(Number), expect.any(String));
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(lastCall[0]).toBe(100);
  });

  test('handles warehouse-only orders with correct salesStatus', async () => {
    const pool = createMockPool();
    const bot = createMockBot('warehouse-WH001');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_records'));
    const params = insertCalls[0][1] as unknown[];
    expect(params).toContain('WAREHOUSE_FULFILLED');
  });

  test('saves vat_percent, vat_amount, and line_total_with_vat for articles', async () => {
    const pool = createMockPool();
    const bot = createMockBot('ORD-001');
    const onProgress = vi.fn();

    const dataWithVat: SubmitOrderData = {
      pendingOrderId: 'pending-vat',
      customerId: 'CUST-001',
      customerName: 'Acme Corp',
      items: [
        { articleCode: 'ART-01', productName: 'Widget', quantity: 2, price: 100, discount: 10, vat: 22 },
      ],
    };

    await handleSubmitOrder(pool, bot, dataWithVat, 'user-1', onProgress);

    const articleCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_articles'));
    expect(articleCalls).toHaveLength(1);

    const sql = articleCalls[0][0] as string;
    expect(sql).toContain('vat_percent');
    expect(sql).toContain('vat_amount');
    expect(sql).toContain('line_total_with_vat');

    const params = articleCalls[0][1] as unknown[];
    // lineAmount = 2 * 100 * (1 - 10/100) = 180
    // vatAmount = 180 * 22 / 100 = 39.6
    // lineTotalWithVat = 180 + 39.6 = 219.6
    expect(params).toContain(22);    // vat_percent
    expect(params).toContain(39.6);  // vat_amount
    expect(params).toContain(219.6); // line_total_with_vat
  });

  test('wires bot progress callback via setProgressCallback', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(bot.setProgressCallback).toHaveBeenCalledWith(expect.any(Function));
  });

  describe('snapshot uses current catalog price', () => {
    const historicalPrice = 17.21;
    const catalogPrice = 32.31;
    const qty = 5;
    const discount = 63;

    const dataWithStalePrice: SubmitOrderData = {
      pendingOrderId: 'pending-stale',
      customerId: 'CUST-FRESIS',
      customerName: 'Fresis Soc Cooperativa',
      items: [
        { articleCode: 'H162SL.314.014', quantity: qty, price: historicalPrice, discount },
      ],
    };

    test('uses catalog price from shared.prices instead of submitted stale price', async () => {
      const pool = createMockPool({ 'H162SL.314.014': catalogPrice });
      const bot = createMockBot('ORD-002');
      const onProgress = vi.fn();

      await handleSubmitOrder(pool, bot, dataWithStalePrice, 'user-1', onProgress);

      const snapshotItemCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
        .filter((call: unknown[]) => typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO agents.order_verification_snapshot_items'));
      expect(snapshotItemCalls).toHaveLength(1);

      const params = snapshotItemCalls[0][1] as unknown[];
      // unitPrice deve essere il prezzo di catalogo corrente
      expect(params).toContain(catalogPrice);
      expect(params).not.toContain(historicalPrice);
      // expectedLineAmount ricalcolato con il prezzo corrente: 5 * 32.31 * (1 - 63/100) = 59.77
      const expectedAmount = Math.round(qty * catalogPrice * (1 - discount / 100) * 100) / 100;
      expect(params).toContain(expectedAmount);
    });

    test('falls back to submitted price when article not found in shared.prices', async () => {
      const pool = createMockPool({}); // nessun prezzo in catalogo
      const bot = createMockBot('ORD-003');
      const onProgress = vi.fn();

      await handleSubmitOrder(pool, bot, dataWithStalePrice, 'user-1', onProgress);

      const snapshotItemCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
        .filter((call: unknown[]) => typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO agents.order_verification_snapshot_items'));
      expect(snapshotItemCalls).toHaveLength(1);

      const params = snapshotItemCalls[0][1] as unknown[];
      expect(params).toContain(historicalPrice);
    });
  });
});

function createMockPoolWithCustomer(
  customerRow: Record<string, string | null> | null,
  catalogPrices: Record<string, number> = {},
): DbPool {
  const query = vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
    if (typeof sql === 'string' && sql.includes('vat_validated_at') && sql.includes('agents.customers')) {
      return Promise.resolve({
        rows: customerRow ? [customerRow] : [],
        rowCount: customerRow ? 1 : 0,
      });
    }
    if (typeof sql === 'string' && sql.includes('RETURNING id')) {
      return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
    }
    if (typeof sql === 'string' && sql.includes('shared.prices') && Array.isArray(params?.[0])) {
      const requestedCodes = params![0] as string[];
      const rows = requestedCodes
        .filter((code) => catalogPrices[code] !== undefined)
        .map((code) => ({ product_id: code, unit_price: String(catalogPrices[code]) }));
      return Promise.resolve({ rows, rowCount: rows.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  return {
    query,
    withTransaction: vi.fn(async (fn) => fn({ query })),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const deliveryAddress = {
  id: 42,
  userId: 'user-1',
  customerProfile: 'CUST-001',
  tipo: 'Consegna',
  nome: null,
  via: 'Via Roma 1',
  cap: '37100',
  citta: 'Verona',
  contea: null,
  stato: null,
  idRegione: null,
  contra: null,
};

describe('handleSubmitOrder — delivery address resolution', () => {
  test('resolves deliveryAddress from DB and passes to bot when deliveryAddressId provided', async () => {
    vi.mocked(getAddressById).mockResolvedValue(deliveryAddress);
    const pool = createMockPool();
    const bot = createMockBot('ORD-ADDR');
    const onProgress = vi.fn();

    const dataWithAddressId: SubmitOrderData = {
      ...sampleData,
      deliveryAddressId: 42,
    };

    await handleSubmitOrder(pool, bot, dataWithAddressId, 'user-1', onProgress);

    expect(getAddressById).toHaveBeenCalledWith(pool, 'user-1', 42);
    expect(bot.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryAddress }),
    );
  });

  test('does not call getAddressById when deliveryAddressId not provided', async () => {
    vi.mocked(getAddressById).mockClear();
    const pool = createMockPool();
    const bot = createMockBot('ORD-NO-ADDR');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(getAddressById).not.toHaveBeenCalled();
  });
});

describe('handleSubmitOrder — completeness guard', () => {
  const INCOMPLETE_CUSTOMER = {
    vat_validated_at: null,
    pec: null,
    sdi: null,
    street: 'Via Roma 1',
    postal_code: '80100',
  };

  const COMPLETE_CUSTOMER = {
    vat_validated_at: '2026-01-01T00:00:00Z',
    pec: 'mario@pec.it',
    sdi: null,
    street: 'Via Roma 1',
    postal_code: '80100',
  };

  test('returns success:false when customer not found in DB', async () => {
    const pool = createMockPoolWithCustomer(null);
    const bot = createMockBot();
    const onProgress = vi.fn();

    const result = await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress) as unknown as Record<string, unknown>;

    expect(result).toEqual({ success: false, error: 'Cliente non trovato' });
    expect(bot.createOrder).not.toHaveBeenCalled();
  });

  test('throws Error when customer data is incomplete', async () => {
    const pool = createMockPoolWithCustomer(INCOMPLETE_CUSTOMER);
    const bot = createMockBot();
    const onProgress = vi.fn();

    await expect(
      handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress),
    ).rejects.toThrow('Dati cliente incompleti. Aggiorna la scheda cliente prima di inviare l\'ordine.');
    expect(bot.createOrder).not.toHaveBeenCalled();
  });

  test('proceeds normally when customer data is complete', async () => {
    const pool = createMockPoolWithCustomer(COMPLETE_CUSTOMER);
    const bot = createMockBot('ORD-COMPLETE');
    const onProgress = vi.fn();

    const result = await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(result.orderId).toBe('ORD-COMPLETE');
    expect(bot.createOrder).toHaveBeenCalled();
  });
});

describe('handleSubmitOrder — customer name resolution', () => {
  const staleNameData: SubmitOrderData = {
    ...sampleData,
    customerName: 'Old Stale Name',
  };

  test('uses archibald_name from DB when present instead of data.customerName', async () => {
    const pool = createMockPoolWithCustomer({
      vat_validated_at: '2026-01-01T00:00:00Z',
      pec: 'test@pec.it',
      sdi: null,
      street: 'Via Test 1',
      postal_code: '80100',
      archibald_name: 'Current Archibald Name',
      name: 'Current Display Name',
    });
    const bot = createMockBot('ORD-NAME');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, staleNameData, 'user-1', onProgress);

    expect(bot.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ customerName: 'Current Archibald Name' }),
    );
  });

  test('falls back to name from DB when archibald_name is null', async () => {
    const pool = createMockPoolWithCustomer({
      vat_validated_at: '2026-01-01T00:00:00Z',
      pec: 'test@pec.it',
      sdi: null,
      street: 'Via Test 1',
      postal_code: '80100',
      archibald_name: null,
      name: 'Current Display Name',
    });
    const bot = createMockBot('ORD-NAME-2');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, staleNameData, 'user-1', onProgress);

    expect(bot.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ customerName: 'Current Display Name' }),
    );
  });
});

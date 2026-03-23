import { describe, expect, test, vi } from 'vitest';
import { handleSubmitOrder, calculateAmounts, type SubmitOrderBot, type SubmitOrderData, type SubmitOrderItem } from './submit-order';
import type { DbPool } from '../../db/pool';
import { arcaLineAmount, round2 } from '../../utils/arca-math';

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
  fallbackCustomerRow: Record<string, string | null> | null = null,
): DbPool {
  const query = vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
    if (typeof sql === 'string' && sql.includes('vat_validated_at') && sql.includes('agents.customers')) {
      const isFallbackQuery = sql.includes('NOT LIKE');
      const row = isFallbackQuery ? fallbackCustomerRow : customerRow;
      return Promise.resolve({
        rows: row ? [row] : [],
        rowCount: row ? 1 : 0,
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

  test('throws when customer not found in DB', async () => {
    const pool = createMockPoolWithCustomer(null);
    const bot = createMockBot();
    const onProgress = vi.fn();

    await expect(
      handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress),
    ).rejects.toThrow('Cliente non trovato');
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

describe('handleSubmitOrder — ghost-only orders', () => {
  const ghostItems = [
    {
      articleCode: 'GHOST001',
      description: 'Articolo fantasma 1',
      quantity: 3,
      price: 10,
      discount: 0,
      vat: 22,
      isGhostArticle: true,
      warehouseQuantity: 3,
      warehouseSources: [],
    },
    {
      articleCode: 'GHOST002',
      description: 'Articolo fantasma 2',
      quantity: 1,
      price: 25.50,
      discount: 10,
      vat: 22,
      isGhostArticle: true,
      warehouseQuantity: 1,
      warehouseSources: [],
    },
  ];

  const ghostData: SubmitOrderData = {
    pendingOrderId: 'pending-ghost',
    customerId: 'CUST-001',
    customerName: 'Acme Corp',
    items: ghostItems,
  };

  test('does not call bot.createOrder when all items are ghost', async () => {
    const pool = createMockPool();
    const bot = createMockBot('should-not-be-used');
    const onProgress = vi.fn();

    const result = await handleSubmitOrder(pool, bot, ghostData, 'user-1', onProgress);

    expect(bot.createOrder).not.toHaveBeenCalled();
    expect(result.orderId).toMatch(/^ghost-\d+$/);
  });

  test('does not call bot.setProgressCallback for ghost-only orders', async () => {
    const pool = createMockPool();
    const bot = createMockBot('should-not-be-used');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, ghostData, 'user-1', onProgress);

    expect(bot.setProgressCallback).not.toHaveBeenCalled();
  });

  test('skips isCustomerComplete check for ghost-only orders', async () => {
    const incompleteCustomer = {
      vat_validated_at: null,
      pec: null,
      sdi: null,
      street: null,
      postal_code: null,
      name: 'Incomplete Customer',
      archibald_name: null,
    };
    const pool = createMockPoolWithCustomer(incompleteCustomer);
    const bot = createMockBot('should-not-be-used');
    const onProgress = vi.fn();

    const result = await handleSubmitOrder(pool, bot, ghostData, 'user-1', onProgress);

    expect(result.orderId).toMatch(/^ghost-\d+$/);
    expect(bot.createOrder).not.toHaveBeenCalled();
  });

  test('still fetches customer for effectiveCustomerName in fresis_history update', async () => {
    const pool = createMockPoolWithCustomer({
      vat_validated_at: '2026-01-01',
      pec: 'x@pec.it',
      sdi: null,
      street: 'Via X',
      postal_code: '80100',
      name: 'DB Customer Name',
      archibald_name: 'Archibald Name',
    });
    const bot = createMockBot('should-not-be-used');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, ghostData, 'user-1', onProgress);

    const customerQuery = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .find((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('vat_validated_at'));
    expect(customerQuery).toBeDefined();
  });

  test('inserts order_records with WAREHOUSE_FULFILLED status and ghost- prefix', async () => {
    const pool = createMockPool();
    const bot = createMockBot('should-not-be-used');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, ghostData, 'user-1', onProgress);

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_records'));
    expect(insertCalls).toHaveLength(1);

    const params = insertCalls[0][1] as unknown[];
    expect(params[0]).toMatch(/^ghost-\d+$/);
    expect(params).toContain('WAREHOUSE_FULFILLED');
    expect(params).toContain('Warehouse');
  });

  test('inserts order_articles with is_ghost column', async () => {
    const pool = createMockPool();
    const bot = createMockBot('should-not-be-used');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, ghostData, 'user-1', onProgress);

    const articleCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_articles'));
    expect(articleCalls).toHaveLength(1);

    const sql = articleCalls[0][0] as string;
    expect(sql).toContain('is_ghost');

    const params = articleCalls[0][1] as unknown[];
    // 15 params per item, 2 items = 30 params
    // is_ghost is the 15th param for each item (index 14 and 29)
    expect(params[14]).toBe(true);
    expect(params[29]).toBe(true);
  });

  test('sets articles_synced_at in order_records for ghost-only orders', async () => {
    const pool = createMockPool();
    const bot = createMockBot('should-not-be-used');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, ghostData, 'user-1', onProgress);

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_records'));
    expect(insertCalls).toHaveLength(1);

    const sql = insertCalls[0][0] as string;
    expect(sql).toContain('articles_synced_at');

    // articles_synced_at is the 25th param (index 24, 0-based) — must be a non-null ISO timestamp
    const insertParams = insertCalls[0][1] as unknown[];
    expect(typeof insertParams[24]).toBe('string');
    expect(insertParams[24]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('deletes pending order on success', async () => {
    const pool = createMockPool();
    const bot = createMockBot('should-not-be-used');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, ghostData, 'user-1', onProgress);

    const deleteCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('DELETE FROM agents.pending_orders'));
    expect(deleteCalls).toHaveLength(1);

    const params = deleteCalls[0][1] as unknown[];
    expect(params).toContain('pending-ghost');
  });

  test('updates fresis_history for ghost-only orders', async () => {
    const pool = createMockPool();
    const bot = createMockBot('should-not-be-used');
    const onProgress = vi.fn();

    await handleSubmitOrder(pool, bot, ghostData, 'user-1', onProgress);

    const fresisCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE agents.fresis_history'));
    expect(fresisCalls).toHaveLength(1);

    const params = fresisCalls[0][1] as unknown[];
    expect(params[0]).toMatch(/^ghost-\d+$/);
    expect(params).toContain('pending-ghost');
  });

  test('does not skip bot when mixed ghost and non-ghost items', async () => {
    const mixedData: SubmitOrderData = {
      pendingOrderId: 'pending-mixed',
      customerId: 'CUST-001',
      customerName: 'Acme Corp',
      items: [
        { articleCode: 'GHOST001', description: 'Ghost', quantity: 1, price: 10, isGhostArticle: true },
        { articleCode: 'REAL001', description: 'Real', quantity: 1, price: 10 },
      ],
    };
    const pool = createMockPool();
    const bot = createMockBot('ORD-MIXED');
    const onProgress = vi.fn();

    const result = await handleSubmitOrder(pool, bot, mixedData, 'user-1', onProgress);

    expect(bot.createOrder).toHaveBeenCalled();
    expect(result.orderId).toBe('ORD-MIXED');
  });
});

describe('handleSubmitOrder — TEMP profile fallback', () => {
  const completeCustomerRow = {
    vat_validated_at: '2026-01-01T00:00:00Z',
    pec: 'test@pec.it',
    sdi: null,
    street: 'Via Test 1',
    postal_code: '80100',
    archibald_name: null,
    name: 'Lab. Odont. Acerra GiovanniAcerra Giovanni',
  };

  const tempIdData: SubmitOrderData = {
    ...sampleData,
    customerId: 'TEMP-1773786617319',
    customerName: 'Acerra Giovanni',
  };

  test('falls back to name ILIKE match when TEMP customerId is not found by exact profile', async () => {
    const pool = createMockPoolWithCustomer(null, {}, completeCustomerRow);
    const bot = createMockBot('ORD-TEMP-FALLBACK');
    const onProgress = vi.fn();

    const result = await handleSubmitOrder(pool, bot, tempIdData, 'user-1', onProgress);

    expect(result.orderId).toBe('ORD-TEMP-FALLBACK');
    expect(bot.createOrder).toHaveBeenCalled();
  });

  test('throws when TEMP profile and no name match found', async () => {
    const pool = createMockPoolWithCustomer(null, {}, null);
    const bot = createMockBot();
    const onProgress = vi.fn();

    await expect(
      handleSubmitOrder(pool, bot, tempIdData, 'user-1', onProgress),
    ).rejects.toThrow('Cliente non trovato');
    expect(bot.createOrder).not.toHaveBeenCalled();
  });
});

describe('calculateAmounts', () => {
  const items: SubmitOrderItem[] = [
    { articleCode: 'A1', quantity: 7,  price: 167.20, discount: 45.00 },
    { articleCode: 'A2', quantity: 10, price: 11.29,  discount: 70.40 },
  ];

  test('grossAmount = somma arcaLineAmount, total = round2(grossAmount × scontif)', () => {
    const { grossAmount, total } = calculateAmounts(items, 10);
    expect(grossAmount).toBe(677.14);
    expect(total).toBe(609.43);
  });

  test('sconto globale 0% → total === grossAmount', () => {
    const singleItem: SubmitOrderItem[] = [{ articleCode: 'X', quantity: 1, price: 100, discount: 0 }];
    const { grossAmount, total } = calculateAmounts(singleItem, 0);
    expect(total).toBe(grossAmount);
  });
});

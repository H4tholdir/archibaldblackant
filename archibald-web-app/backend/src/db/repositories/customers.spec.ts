import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import type { Customer, CustomerRow } from './customers';

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

const TEST_USER_ID = 'user-abc-123';

const sampleRow: CustomerRow = {
  erp_id: 'CUST001',
  user_id: TEST_USER_ID,
  account_num: 'INT-1',
  name: 'Acme Corporation',
  vat_number: 'IT12345678901',
  fiscal_code: 'RSSMRA80A01H501Z',
  sdi: '0000000',
  pec: 'acme@pec.it',
  phone: '+39 02 1234567',
  mobile: '+39 333 1234567',
  email: 'info@acme.it',
  url: 'https://acme.it',
  attention_to: 'Mario Rossi',
  street: 'Via Roma 1',
  logistics_address: 'Via Logistica 5',
  postal_code: '20100',
  city: 'Milano',
  customer_type: 'Retail',
  type: 'Standard',
  delivery_terms: 'FedEx',
  description: 'Important client',
  last_order_date: '2026-01-15',
  actual_order_count: 10,
  actual_sales: 50000.5,
  previous_order_count_1: 8,
  previous_sales_1: 40000.0,
  previous_order_count_2: 5,
  previous_sales_2: 25000.0,
  external_account_number: 'EXT-001',
  our_account_number: 'OUR-001',
  hash: 'abc123hash',
  last_sync: 1700000000000,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
  bot_status: 'placed',
  archibald_name: 'ACME CORP',
  photo: null,
  vat_validated_at: null,
  sector: null,
  price_group: null,
  line_discount: null,
  payment_terms: null,
  notes: null,
  name_alias: null,
  county: null,
  state: null,
  country: null,
  agent_notes: null,
};

describe('getCustomerByProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns mapped customer when row exists', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [sampleRow],
      rowCount: 1,
    });

    const { getCustomerByProfile, mapRowToCustomer } = await import('./customers');
    const result = await getCustomerByProfile(pool, TEST_USER_ID, 'CUST001');

    expect(result).toEqual(mapRowToCustomer(sampleRow));
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM agents.customers'),
      ['CUST001', TEST_USER_ID],
    );
  });

  test('returns undefined when no row found', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const { getCustomerByProfile } = await import('./customers');
    const result = await getCustomerByProfile(pool, TEST_USER_ID, 'NONEXISTENT');

    expect(result).toBeUndefined();
  });

  test('query includes both erp_id and user_id in WHERE', async () => {
    const pool = createMockPool();

    const { getCustomerByProfile } = await import('./customers');
    await getCustomerByProfile(pool, TEST_USER_ID, 'CUST001');

    const call = pool.queryCalls[0];
    expect(call.text).toContain('erp_id = $1');
    expect(call.text).toContain('user_id = $2');
    expect(call.params).toEqual(['CUST001', TEST_USER_ID]);
  });
});

describe('upsertCustomers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('inserts new customers when none exist', async () => {
    const pool = createMockPool();
    const queryMock = pool.query as ReturnType<typeof vi.fn>;
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const { upsertCustomers } = await import('./customers');
    const customers = [
      { erpId: 'CUST001', name: 'Acme Corp' },
      { erpId: 'CUST002', name: 'Beta Inc' },
    ];

    const result = await upsertCustomers(pool, TEST_USER_ID, customers);

    expect(result).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
  });

  test('marks unchanged when hash matches', async () => {
    const pool = createMockPool();
    const { calculateHash } = await import('./customers');
    const existingHash = calculateHash({ erpId: 'CUST001', name: 'Acme Corp' });

    const queryMock = pool.query as ReturnType<typeof vi.fn>;
    queryMock.mockResolvedValueOnce({
      rows: [{ erp_id: 'CUST001', hash: existingHash }],
      rowCount: 1,
    });

    const { upsertCustomers } = await import('./customers');
    const result = await upsertCustomers(pool, TEST_USER_ID, [
      { erpId: 'CUST001', name: 'Acme Corp' },
    ]);

    expect(result).toEqual({ inserted: 0, updated: 0, unchanged: 1 });
  });

  test('updates when hash differs', async () => {
    const pool = createMockPool();
    const queryMock = pool.query as ReturnType<typeof vi.fn>;
    queryMock.mockResolvedValueOnce({
      rows: [{ erp_id: 'CUST001', hash: 'old-different-hash' }],
      rowCount: 1,
    });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const { upsertCustomers } = await import('./customers');
    const result = await upsertCustomers(pool, TEST_USER_ID, [
      { erpId: 'CUST001', name: 'Acme Corp Updated' },
    ]);

    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
  });

  test('handles mix of insert, update, and unchanged', async () => {
    const pool = createMockPool();
    const { calculateHash } = await import('./customers');
    const unchangedHash = calculateHash({ erpId: 'CUST002', name: 'Beta Inc' });

    const queryMock = pool.query as ReturnType<typeof vi.fn>;
    queryMock.mockResolvedValueOnce({
      rows: [
        { erp_id: 'CUST001', hash: 'old-hash' },
        { erp_id: 'CUST002', hash: unchangedHash },
      ],
      rowCount: 2,
    });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const { upsertCustomers } = await import('./customers');
    const result = await upsertCustomers(pool, TEST_USER_ID, [
      { erpId: 'CUST001', name: 'Acme Updated' },
      { erpId: 'CUST002', name: 'Beta Inc' },
      { erpId: 'CUST003', name: 'Gamma New' },
    ]);

    expect(result).toEqual({ inserted: 1, updated: 1, unchanged: 1 });
  });

  test('returns all zeros for empty input', async () => {
    const pool = createMockPool();

    const { upsertCustomers } = await import('./customers');
    const result = await upsertCustomers(pool, TEST_USER_ID, []);

    expect(result).toEqual({ inserted: 0, updated: 0, unchanged: 0 });
  });

  test('passes user_id in all queries', async () => {
    const pool = createMockPool();
    const queryMock = pool.query as ReturnType<typeof vi.fn>;
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const { upsertCustomers } = await import('./customers');
    await upsertCustomers(pool, TEST_USER_ID, [
      { erpId: 'CUST001', name: 'Acme' },
    ]);

    for (const call of pool.queryCalls) {
      if (call.params && call.params.length > 0) {
        expect(call.params).toContain(TEST_USER_ID);
      }
    }
  });
});

describe('getCustomers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns all customers for user when no search query', async () => {
    const pool = createMockPool();
    const rowWithoutPhoto = { ...sampleRow, photo: undefined };
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [rowWithoutPhoto],
      rowCount: 1,
    });

    const { getCustomers, mapRowToCustomer } = await import('./customers');
    const result = await getCustomers(pool, TEST_USER_ID);

    expect(result).toEqual([mapRowToCustomer(rowWithoutPhoto)]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $1'),
      [TEST_USER_ID],
    );
  });

  test('searches across multiple fields when query provided', async () => {
    const pool = createMockPool();

    const { getCustomers } = await import('./customers');
    await getCustomers(pool, TEST_USER_ID, 'acme');

    const call = pool.queryCalls[0];
    expect(call.text).toContain('ILIKE');
    expect(call.text).toContain('name');
    expect(call.text).toContain('erp_id');
    expect(call.text).toContain('vat_number');
    expect(call.text).toContain('city');
    expect(call.params).toContain('%acme%');
  });

  test('splits multi-word query into AND conditions per word', async () => {
    const pool = createMockPool();

    const { getCustomers } = await import('./customers');
    await getCustomers(pool, TEST_USER_ID, 'esposito gerardo');

    const call = pool.queryCalls[0];
    expect(call.params).toEqual([TEST_USER_ID, '%esposito%', '%gerardo%']);
    const andCount = (call.text.match(/\) AND \(/g) ?? []).length;
    expect(andCount).toBe(1);
  });

  test('excludes photo column in search queries', async () => {
    const pool = createMockPool();

    const { getCustomers } = await import('./customers');
    await getCustomers(pool, TEST_USER_ID, 'test');

    const call = pool.queryCalls[0];
    expect(call.text).not.toContain('photo');
  });

  test('returns empty array when no matches', async () => {
    const pool = createMockPool();

    const { getCustomers } = await import('./customers');
    const result = await getCustomers(pool, TEST_USER_ID, 'nonexistent');

    expect(result).toEqual([]);
  });

  test('includes user_id filter in WHERE clause', async () => {
    const pool = createMockPool();

    const { getCustomers } = await import('./customers');
    await getCustomers(pool, TEST_USER_ID);

    const call = pool.queryCalls[0];
    expect(call.text).toContain('user_id');
    expect(call.params).toContain(TEST_USER_ID);
  });
});

describe('deleteCustomers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('soft-deletes customers by profile IDs for given user', async () => {
    const pool = createMockPool();

    const { deleteCustomers } = await import('./customers');
    const result = await deleteCustomers(pool, TEST_USER_ID, ['CUST001', 'CUST002']);

    expect(result).toBe(0);
    const call = pool.queryCalls[0];
    expect(call.text).toContain('UPDATE agents.customers SET deleted_at = NOW()');
    expect(call.text).toContain('user_id');
    expect(call.params).toEqual(['CUST001', 'CUST002', TEST_USER_ID]);
  });

  test('returns 0 for empty ids array', async () => {
    const pool = createMockPool();

    const { deleteCustomers } = await import('./customers');
    const result = await deleteCustomers(pool, TEST_USER_ID, []);

    expect(result).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('uses parameterized placeholders for each id', async () => {
    const pool = createMockPool();

    const { deleteCustomers } = await import('./customers');
    await deleteCustomers(pool, TEST_USER_ID, ['A', 'B', 'C']);

    const call = pool.queryCalls[0];
    expect(call.text).toContain('$1');
    expect(call.text).toContain('$2');
    expect(call.text).toContain('$3');
    expect(call.text).toContain('$4');
    expect(call.params).toEqual(['A', 'B', 'C', TEST_USER_ID]);
  });
});

describe('updateVatValidatedAt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const TEST_ERP_ID = 'CUST001';

  test('issues UPDATE on agents.customers setting vat_validated_at', async () => {
    const pool = createMockPool();

    const { updateVatValidatedAt } = await import('./customers');
    await updateVatValidatedAt(pool, TEST_USER_ID, TEST_ERP_ID);

    const call = pool.queryCalls[0];
    expect(call.text).toContain('UPDATE agents.customers');
    expect(call.text).toContain('SET vat_validated_at = NOW()');
    expect(call.params).toEqual([TEST_ERP_ID, TEST_USER_ID]);
  });
});

describe('mapRowToCustomer', () => {
  test('maps snake_case row to camelCase customer', async () => {
    const { mapRowToCustomer } = await import('./customers');
    const result = mapRowToCustomer(sampleRow);

    expect(result).toEqual({
      erpId: 'CUST001',
      userId: TEST_USER_ID,
      accountNum: 'INT-1',
      name: 'Acme Corporation',
      vatNumber: 'IT12345678901',
      fiscalCode: 'RSSMRA80A01H501Z',
      sdi: '0000000',
      pec: 'acme@pec.it',
      phone: '+39 02 1234567',
      mobile: '+39 333 1234567',
      email: 'info@acme.it',
      url: 'https://acme.it',
      attentionTo: 'Mario Rossi',
      street: 'Via Roma 1',
      logisticsAddress: 'Via Logistica 5',
      postalCode: '20100',
      city: 'Milano',
      customerType: 'Retail',
      type: 'Standard',
      deliveryTerms: 'FedEx',
      description: 'Important client',
      lastOrderDate: '2026-01-15',
      actualOrderCount: 10,
      actualSales: 50000.5,
      previousOrderCount1: 8,
      previousSales1: 40000.0,
      previousOrderCount2: 5,
      previousSales2: 25000.0,
      externalAccountNumber: 'EXT-001',
      ourAccountNumber: 'OUR-001',
      hash: 'abc123hash',
      lastSync: 1700000000000,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
      botStatus: 'placed',
      archibaldName: 'ACME CORP',
      photo: null,
      vatValidatedAt: null,
      sector: null,
      priceGroup: null,
      lineDiscount: null,
      paymentTerms: null,
      notes: null,
      nameAlias: null,
      county: null,
      state: null,
      country: null,
      agentNotes: null,
    });
  });

  test('handles null optional fields', async () => {
    const { mapRowToCustomer } = await import('./customers');
    const minimalRow: CustomerRow = {
      erp_id: 'CUST002',
      user_id: TEST_USER_ID,
      account_num: null,
      name: 'Minimal',
      vat_number: null,
      fiscal_code: null,
      sdi: null,
      pec: null,
      phone: null,
      mobile: null,
      email: null,
      url: null,
      attention_to: null,
      street: null,
      logistics_address: null,
      postal_code: null,
      city: null,
      customer_type: null,
      type: null,
      delivery_terms: null,
      description: null,
      last_order_date: null,
      actual_order_count: null,
      actual_sales: null,
      previous_order_count_1: null,
      previous_sales_1: null,
      previous_order_count_2: null,
      previous_sales_2: null,
      external_account_number: null,
      our_account_number: null,
      hash: 'minhash',
      last_sync: 1700000000000,
      created_at: null,
      updated_at: null,
      bot_status: null,
      archibald_name: null,
      photo: null,
      vat_validated_at: null,
      sector: null,
      price_group: null,
      line_discount: null,
      payment_terms: null,
      notes: null,
      name_alias: null,
      county: null,
      state: null,
      country: null,
      agent_notes: null,
    };

    const result = mapRowToCustomer(minimalRow);

    expect(result.erpId).toBe('CUST002');
    expect(result.name).toBe('Minimal');
    expect(result.accountNum).toBeNull();
    expect(result.vatNumber).toBeNull();
    expect(result.createdAt).toBeNull();
  });
});

const completeCustomer: Customer = {
  erpId: 'C001',
  userId: 'user-1',
  accountNum: null,
  name: 'Acme Srl',
  vatNumber: 'IT12345678901',
  fiscalCode: null,
  sdi: null,
  pec: 'acme@pec.it',
  phone: null,
  mobile: null,
  email: null,
  url: null,
  attentionTo: null,
  street: 'Via Roma 1',
  logisticsAddress: null,
  postalCode: '80100',
  city: 'Napoli',
  customerType: null,
  type: null,
  deliveryTerms: null,
  description: null,
  lastOrderDate: null,
  actualOrderCount: null,
  actualSales: null,
  previousOrderCount1: null,
  previousSales1: null,
  previousOrderCount2: null,
  previousSales2: null,
  externalAccountNumber: null,
  ourAccountNumber: null,
  hash: 'abc123',
  lastSync: 1711497600000,
  createdAt: null,
  updatedAt: null,
  botStatus: null,
  archibaldName: null,
  vatValidatedAt: '2026-01-15T10:00:00Z',
  photo: null,
  sector: null,
  priceGroup: null,
  lineDiscount: null,
  paymentTerms: null,
  notes: null,
  nameAlias: null,
  county: null,
  state: null,
  country: null,
  agentNotes: null,
};

describe('isCustomerComplete', () => {
  test('returns true when all mandatory fields are present (pec path)', async () => {
    const { isCustomerComplete } = await import('./customers');
    expect(isCustomerComplete(completeCustomer)).toBe(true);
  });

  test('returns true when sdi is provided instead of pec', async () => {
    const { isCustomerComplete } = await import('./customers');
    const customer: Customer = { ...completeCustomer, pec: null, sdi: 'ABCDEF1' };
    expect(isCustomerComplete(customer)).toBe(true);
  });

  test('returns false when name is missing', async () => {
    const { isCustomerComplete } = await import('./customers');
    const customer: Customer = { ...completeCustomer, name: '' };
    expect(isCustomerComplete(customer)).toBe(false);
  });

  test('returns false when vatNumber is missing', async () => {
    const { isCustomerComplete } = await import('./customers');
    const customer: Customer = { ...completeCustomer, vatNumber: null };
    expect(isCustomerComplete(customer)).toBe(false);
  });

  test('returns false when vatValidatedAt is null', async () => {
    const { isCustomerComplete } = await import('./customers');
    const customer: Customer = { ...completeCustomer, vatValidatedAt: null };
    expect(isCustomerComplete(customer)).toBe(false);
  });

  test('returns false when both pec and sdi are missing', async () => {
    const { isCustomerComplete } = await import('./customers');
    const customer: Customer = { ...completeCustomer, pec: null, sdi: null };
    expect(isCustomerComplete(customer)).toBe(false);
  });

  test('returns false when street is missing', async () => {
    const { isCustomerComplete } = await import('./customers');
    const customer: Customer = { ...completeCustomer, street: null };
    expect(isCustomerComplete(customer)).toBe(false);
  });

  test('returns false when postalCode is missing', async () => {
    const { isCustomerComplete } = await import('./customers');
    const customer: Customer = { ...completeCustomer, postalCode: null };
    expect(isCustomerComplete(customer)).toBe(false);
  });

  test('returns false when city is missing', async () => {
    const { isCustomerComplete } = await import('./customers');
    const customer: Customer = { ...completeCustomer, city: null };
    expect(isCustomerComplete(customer)).toBe(false);
  });
});

describe('updateAgentNotes', () => {
  test('calls UPDATE with agent_notes and correct params', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    const { updateAgentNotes } = await import('./customers');
    await updateAgentNotes(pool as never, 'user1', '55.261', 'Note test');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string, unknown[]]>;
    const updateCall = calls.find(([sql]) => sql.includes('agent_notes'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual(['Note test', '55.261', 'user1']);
  });

  test('passes null to DB when notes is null', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    const { updateAgentNotes } = await import('./customers');
    await updateAgentNotes(pool as never, 'user1', '55.261', null);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string, unknown[]]>;
    const updateCall = calls.find(([sql]) => sql.includes('agent_notes'));
    expect(updateCall![1][0]).toBeNull();
  });
});

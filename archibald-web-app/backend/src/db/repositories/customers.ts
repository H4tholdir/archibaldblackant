import { createHash } from 'crypto';
import type { DbPool } from '../pool';

type CustomerRow = {
  erp_id: string;
  user_id: string;
  account_num: string | null;
  name: string;
  vat_number: string | null;
  fiscal_code: string | null;
  sdi: string | null;
  pec: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  url: string | null;
  attention_to: string | null;
  street: string | null;
  logistics_address: string | null;
  postal_code: string | null;
  city: string | null;
  customer_type: string | null;
  type: string | null;
  delivery_terms: string | null;
  description: string | null;
  last_order_date: string | null;
  actual_order_count: number | null;
  actual_sales: number | null;
  previous_order_count_1: number | null;
  previous_sales_1: number | null;
  previous_order_count_2: number | null;
  previous_sales_2: number | null;
  external_account_number: string | null;
  our_account_number: string | null;
  hash: string;
  last_sync: number;
  created_at: string | null;
  updated_at: string | null;
  bot_status: string | null;
  archibald_name: string | null;
  photo: string | null;
  vat_validated_at: string | null;
  sector: string | null;
  price_group: string | null;
  line_discount: string | null;
  payment_terms: string | null;
  notes: string | null;
  name_alias: string | null;
  county: string | null;
  state: string | null;
  country: string | null;
  agent_notes: string | null;
};

type Customer = {
  erpId: string;
  userId: string;
  accountNum: string | null;
  name: string;
  vatNumber: string | null;
  fiscalCode: string | null;
  sdi: string | null;
  pec: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  url: string | null;
  attentionTo: string | null;
  street: string | null;
  logisticsAddress: string | null;
  postalCode: string | null;
  city: string | null;
  customerType: string | null;
  type: string | null;
  deliveryTerms: string | null;
  description: string | null;
  lastOrderDate: string | null;
  actualOrderCount: number | null;
  actualSales: number | null;
  previousOrderCount1: number | null;
  previousSales1: number | null;
  previousOrderCount2: number | null;
  previousSales2: number | null;
  externalAccountNumber: string | null;
  ourAccountNumber: string | null;
  hash: string;
  lastSync: number;
  createdAt: string | null;
  updatedAt: string | null;
  botStatus: string | null;
  archibaldName: string | null;
  vatValidatedAt: string | null;
  photo: string | null;
  sector: string | null;
  priceGroup: string | null;
  lineDiscount: string | null;
  paymentTerms: string | null;
  notes: string | null;
  nameAlias: string | null;
  county: string | null;
  state: string | null;
  country: string | null;
  agentNotes: string | null;
};

type CustomerInput = {
  erpId: string;
  accountNum?: string;
  name: string;
  vatNumber?: string;
  fiscalCode?: string;
  sdi?: string;
  pec?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  url?: string;
  attentionTo?: string;
  street?: string;
  logisticsAddress?: string;
  postalCode?: string;
  city?: string;
  customerType?: string;
  type?: string;
  deliveryTerms?: string;
  description?: string;
  lastOrderDate?: string;
  actualOrderCount?: number;
  actualSales?: number;
  previousOrderCount1?: number;
  previousSales1?: number;
  previousOrderCount2?: number;
  previousSales2?: number;
  externalAccountNumber?: string;
  ourAccountNumber?: string;
};

type CustomerFormInput = {
  name: string;
  vatNumber?: string;
  pec?: string;
  sdi?: string;
  street?: string;
  postalCode?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  url?: string;
  deliveryMode?: string;
  paymentTerms?: string;
  fiscalCode?: string;
  sector?: string;
  attentionTo?: string;
  notes?: string;
  county?: string;
  state?: string;
  country?: string;
};

type UpsertResult = {
  inserted: number;
  updated: number;
  unchanged: number;
};

const COLUMNS_WITHOUT_PHOTO = `
  erp_id, user_id, account_num, name,
  vat_number, fiscal_code, sdi, pec,
  phone, mobile, email, url, attention_to,
  street, logistics_address, postal_code, city,
  customer_type, type, delivery_terms, description,
  last_order_date, actual_order_count, actual_sales,
  previous_order_count_1, previous_sales_1,
  previous_order_count_2, previous_sales_2,
  external_account_number, our_account_number,
  hash, last_sync, created_at, updated_at, bot_status, archibald_name, vat_validated_at,
  sector, price_group, line_discount, payment_terms, notes, name_alias, county, state, country, agent_notes
`;

function mapRowToCustomer(row: CustomerRow): Customer {
  return {
    erpId: row.erp_id,
    userId: row.user_id,
    accountNum: row.account_num,
    name: row.name,
    vatNumber: row.vat_number,
    fiscalCode: row.fiscal_code,
    sdi: row.sdi,
    pec: row.pec,
    phone: row.phone,
    mobile: row.mobile,
    email: row.email,
    url: row.url,
    attentionTo: row.attention_to,
    street: row.street,
    logisticsAddress: row.logistics_address,
    postalCode: row.postal_code,
    city: row.city,
    customerType: row.customer_type,
    type: row.type,
    deliveryTerms: row.delivery_terms,
    description: row.description,
    lastOrderDate: row.last_order_date,
    actualOrderCount: row.actual_order_count,
    actualSales: row.actual_sales,
    previousOrderCount1: row.previous_order_count_1,
    previousSales1: row.previous_sales_1,
    previousOrderCount2: row.previous_order_count_2,
    previousSales2: row.previous_sales_2,
    externalAccountNumber: row.external_account_number,
    ourAccountNumber: row.our_account_number,
    hash: row.hash,
    lastSync: row.last_sync,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    botStatus: row.bot_status,
    archibaldName: row.archibald_name,
    vatValidatedAt: row.vat_validated_at,
    photo: row.photo,
    sector: row.sector,
    priceGroup: row.price_group,
    lineDiscount: row.line_discount,
    paymentTerms: row.payment_terms,
    notes: row.notes,
    nameAlias: row.name_alias,
    county: row.county,
    state: row.state,
    country: row.country,
    agentNotes: row.agent_notes,
  };
}

function calculateHash(customer: CustomerInput): string {
  const data = [
    customer.erpId,
    customer.accountNum,
    customer.name,
    customer.vatNumber,
    customer.fiscalCode,
    customer.sdi,
    customer.pec,
    customer.phone,
    customer.mobile,
    customer.email,
    customer.url,
    customer.attentionTo,
    customer.street,
    customer.logisticsAddress,
    customer.postalCode,
    customer.city,
    customer.customerType,
    customer.type,
    customer.deliveryTerms,
    customer.description,
    customer.lastOrderDate,
    customer.actualOrderCount,
    customer.actualSales,
    customer.previousOrderCount1,
    customer.previousSales1,
    customer.previousOrderCount2,
    customer.previousSales2,
    customer.externalAccountNumber,
    customer.ourAccountNumber,
  ]
    .map((v) => String(v ?? ''))
    .join('|');

  return createHash('sha256').update(data).digest('hex');
}

async function getCustomers(
  pool: DbPool,
  userId: string,
  searchQuery?: string,
): Promise<Customer[]> {
  if (searchQuery) {
    const words = searchQuery.trim().split(/\s+/).filter(w => w.length > 0);
    const patterns = words.map(w => `%${w}%`);
    const searchFields = [
      'name', 'erp_id', 'vat_number', 'city', 'fiscal_code',
      'street', 'postal_code', 'phone', 'mobile', 'email', 'pec', 'sdi',
    ];
    const wordConditions = words
      .map((_, i) => `(${searchFields.map(f => `${f} ILIKE $${i + 2}`).join(' OR ')})`)
      .join(' AND ');
    const { rows } = await pool.query<CustomerRow>(
      `SELECT ${COLUMNS_WITHOUT_PHOTO} FROM agents.customers
       WHERE user_id = $1
         AND hidden = FALSE
         AND deleted_at IS NULL
         AND ${wordConditions}
       ORDER BY
         CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,
         CASE WHEN TO_DATE(NULLIF(last_order_date, ''), 'DD/MM/YYYY') > NOW() - INTERVAL '30 days' THEN 0 ELSE 1 END,
         name ASC
       LIMIT 100`,
      [userId, ...patterns],
    );
    return rows.map(mapRowToCustomer);
  }

  const { rows } = await pool.query<CustomerRow>(
    `SELECT ${COLUMNS_WITHOUT_PHOTO} FROM agents.customers
     WHERE user_id = $1 AND hidden = FALSE AND deleted_at IS NULL
     ORDER BY name ASC`,
    [userId],
  );
  return rows.map(mapRowToCustomer);
}

async function getHiddenCustomers(pool: DbPool, userId: string): Promise<Customer[]> {
  const { rows } = await pool.query<CustomerRow>(
    `SELECT ${COLUMNS_WITHOUT_PHOTO} FROM agents.customers
     WHERE user_id = $1 AND hidden = TRUE AND deleted_at IS NULL
     ORDER BY name ASC`,
    [userId],
  );
  return rows.map(mapRowToCustomer);
}

async function setCustomerHidden(
  pool: DbPool,
  userId: string,
  erpId: string,
  hidden: boolean,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE agents.customers SET hidden = $3, updated_at = NOW()
     WHERE user_id = $1 AND erp_id = $2`,
    [userId, erpId, hidden],
  );
  return (result.rowCount ?? 0) > 0;
}

async function getCustomerByProfile(
  pool: DbPool,
  userId: string,
  erpId: string,
): Promise<Customer | undefined> {
  const { rows } = await pool.query<CustomerRow>(
    `SELECT * FROM agents.customers
     WHERE erp_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [erpId, userId],
  );
  return rows.length > 0 ? mapRowToCustomer(rows[0]) : undefined;
}

async function getCustomerCount(pool: DbPool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM agents.customers WHERE user_id = $1 AND deleted_at IS NULL',
    [userId],
  );
  return parseInt(rows[0].count, 10);
}

async function getLastSyncTime(pool: DbPool, userId: string): Promise<number | null> {
  const { rows } = await pool.query<{ last_sync: string | null }>(
    'SELECT MAX(last_sync) AS last_sync FROM agents.customers WHERE user_id = $1 AND deleted_at IS NULL',
    [userId],
  );
  const value = rows[0].last_sync;
  return value !== null ? Number(value) : null;
}

async function getGlobalCustomerCount(pool: DbPool): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM agents.customers WHERE deleted_at IS NULL',
  );
  return parseInt(rows[0].count, 10);
}

async function getGlobalCustomerLastSyncTime(pool: DbPool): Promise<number | null> {
  const { rows } = await pool.query<{ last_sync: string | null }>(
    'SELECT MAX(last_sync) AS last_sync FROM agents.customers WHERE deleted_at IS NULL',
  );
  const value = rows[0].last_sync;
  return value !== null ? Number(value) : null;
}

async function upsertCustomers(
  pool: DbPool,
  userId: string,
  customers: CustomerInput[],
): Promise<UpsertResult> {
  if (customers.length === 0) {
    return { inserted: 0, updated: 0, unchanged: 0 };
  }

  const now = Date.now();
  const profiles = customers.map((c) => c.erpId);

  const placeholders = profiles.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: existingRows } = await pool.query<{ erp_id: string; hash: string }>(
    `SELECT erp_id, hash FROM agents.customers
     WHERE user_id = $${profiles.length + 1}
       AND erp_id IN (${placeholders})`,
    [...profiles, userId],
  );

  const existingMap = new Map(existingRows.map((r) => [r.erp_id, r.hash]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const customer of customers) {
    const hash = calculateHash(customer);
    const existingHash = existingMap.get(customer.erpId);

    if (existingHash === undefined) {
      await pool.query(
        `INSERT INTO agents.customers (
          erp_id, user_id, account_num, name,
          vat_number, fiscal_code, sdi, pec,
          phone, mobile, email, url, attention_to,
          street, logistics_address, postal_code, city,
          customer_type, type, delivery_terms, description,
          last_order_date, actual_order_count, actual_sales,
          previous_order_count_1, previous_sales_1,
          previous_order_count_2, previous_sales_2,
          external_account_number, our_account_number,
          hash, last_sync
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20, $21,
          $22, $23, $24,
          $25, $26,
          $27, $28,
          $29, $30,
          $31, $32
        )`,
        [
          customer.erpId, userId, customer.accountNum ?? null, customer.name,
          customer.vatNumber ?? null, customer.fiscalCode ?? null, customer.sdi ?? null, customer.pec ?? null,
          customer.phone ?? null, customer.mobile ?? null, customer.email ?? null, customer.url ?? null, customer.attentionTo ?? null,
          customer.street ?? null, customer.logisticsAddress ?? null, customer.postalCode ?? null, customer.city ?? null,
          customer.customerType ?? null, customer.type ?? null, customer.deliveryTerms ?? null, customer.description ?? null,
          customer.lastOrderDate ?? null, customer.actualOrderCount ?? 0, customer.actualSales ?? 0.0,
          customer.previousOrderCount1 ?? 0, customer.previousSales1 ?? 0.0,
          customer.previousOrderCount2 ?? 0, customer.previousSales2 ?? 0.0,
          customer.externalAccountNumber ?? null, customer.ourAccountNumber ?? null,
          hash, now,
        ],
      );
      inserted++;
    } else if (existingHash !== hash) {
      await pool.query(
        `UPDATE agents.customers SET
          account_num = $3, name = $4,
          vat_number = $5, fiscal_code = $6, sdi = $7, pec = $8,
          phone = $9, mobile = $10, email = $11, url = $12, attention_to = $13,
          street = $14, logistics_address = $15, postal_code = $16, city = $17,
          customer_type = $18, type = $19, delivery_terms = $20, description = $21,
          last_order_date = $22, actual_order_count = $23, actual_sales = $24,
          previous_order_count_1 = $25, previous_sales_1 = $26,
          previous_order_count_2 = $27, previous_sales_2 = $28,
          external_account_number = $29, our_account_number = $30,
          hash = $31, last_sync = $32, updated_at = NOW()
        WHERE erp_id = $1 AND user_id = $2`,
        [
          customer.erpId, userId, customer.accountNum ?? null, customer.name,
          customer.vatNumber ?? null, customer.fiscalCode ?? null, customer.sdi ?? null, customer.pec ?? null,
          customer.phone ?? null, customer.mobile ?? null, customer.email ?? null, customer.url ?? null, customer.attentionTo ?? null,
          customer.street ?? null, customer.logisticsAddress ?? null, customer.postalCode ?? null, customer.city ?? null,
          customer.customerType ?? null, customer.type ?? null, customer.deliveryTerms ?? null, customer.description ?? null,
          customer.lastOrderDate ?? null, customer.actualOrderCount ?? 0, customer.actualSales ?? 0.0,
          customer.previousOrderCount1 ?? 0, customer.previousSales1 ?? 0.0,
          customer.previousOrderCount2 ?? 0, customer.previousSales2 ?? 0.0,
          customer.externalAccountNumber ?? null, customer.ourAccountNumber ?? null,
          hash, now,
        ],
      );
      updated++;
    } else {
      unchanged++;
    }
  }

  return { inserted, updated, unchanged };
}

async function findDeletedCustomers(
  pool: DbPool,
  userId: string,
  currentIds: string[],
): Promise<string[]> {
  if (currentIds.length === 0) {
    return [];
  }

  const placeholders = currentIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<{ erp_id: string }>(
    `SELECT erp_id FROM agents.customers
     WHERE user_id = $${currentIds.length + 1}
       AND deleted_at IS NULL
       AND erp_id NOT IN (${placeholders})`,
    [...currentIds, userId],
  );
  return rows.map((r) => r.erp_id);
}

async function deleteCustomers(
  pool: DbPool,
  userId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool.query(
    `UPDATE agents.customers SET deleted_at = NOW()
     WHERE erp_id IN (${placeholders})
       AND user_id = $${ids.length + 1}
       AND deleted_at IS NULL`,
    [...ids, userId],
  );
  return result.rowCount ?? 0;
}

async function upsertSingleCustomer(
  pool: DbPool,
  userId: string,
  formData: CustomerFormInput,
  erpId: string,
  botStatus: string,
): Promise<Customer> {
  const now = Date.now();
  const customerData: CustomerInput = {
    erpId: erpId,
    name: formData.name,
    vatNumber: formData.vatNumber,
    pec: formData.pec,
    sdi: formData.sdi,
    street: formData.street,
    postalCode: formData.postalCode,
    phone: formData.phone,
    email: formData.email,
    deliveryTerms: formData.deliveryMode,
  };
  const hash = calculateHash(customerData);

  await pool.query(
    `INSERT INTO agents.customers (
      erp_id, user_id, name, vat_number, fiscal_code, pec, sdi,
      street, postal_code, phone, mobile, email, url, attention_to,
      delivery_terms, payment_terms, sector, notes, county, state, country,
      price_group, line_discount,
      hash, last_sync, bot_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    ON CONFLICT (erp_id, user_id) DO UPDATE SET
      name = EXCLUDED.name,
      vat_number = EXCLUDED.vat_number,
      fiscal_code = EXCLUDED.fiscal_code,
      pec = EXCLUDED.pec,
      sdi = EXCLUDED.sdi,
      street = EXCLUDED.street,
      postal_code = EXCLUDED.postal_code,
      phone = EXCLUDED.phone,
      mobile = EXCLUDED.mobile,
      email = EXCLUDED.email,
      url = EXCLUDED.url,
      attention_to = EXCLUDED.attention_to,
      delivery_terms = EXCLUDED.delivery_terms,
      payment_terms = EXCLUDED.payment_terms,
      sector = EXCLUDED.sector,
      notes = EXCLUDED.notes,
      county = EXCLUDED.county,
      state = EXCLUDED.state,
      country = EXCLUDED.country,
      price_group = EXCLUDED.price_group,
      line_discount = EXCLUDED.line_discount,
      hash = EXCLUDED.hash,
      last_sync = EXCLUDED.last_sync,
      bot_status = EXCLUDED.bot_status,
      updated_at = NOW()`,
    [
      erpId, userId, formData.name,
      formData.vatNumber ?? null, formData.fiscalCode ?? null,
      formData.pec ?? null, formData.sdi ?? null,
      formData.street ?? null, formData.postalCode ?? null,
      formData.phone ?? null, formData.mobile ?? null,
      formData.email ?? null, formData.url ?? null,
      formData.attentionTo ?? null,
      formData.deliveryMode ?? null, formData.paymentTerms ?? null,
      formData.sector ?? null, formData.notes ?? null,
      formData.county ?? null, formData.state ?? null, formData.country ?? null,
      'DETTAGLIO (consigliato)', 'N/A',
      hash, now, botStatus,
    ],
  );

  const { rows } = await pool.query<CustomerRow>(
    `SELECT * FROM agents.customers
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );
  return mapRowToCustomer(rows[0]);
}

async function updateCustomerBotStatus(
  pool: DbPool,
  userId: string,
  erpId: string,
  status: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET bot_status = $1, updated_at = NOW()
     WHERE erp_id = $2 AND user_id = $3`,
    [status, erpId, userId],
  );
}

async function updateArchibaldName(
  pool: DbPool,
  userId: string,
  erpId: string,
  name: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET archibald_name = $1, updated_at = NOW()
     WHERE erp_id = $2 AND user_id = $3`,
    [name, erpId, userId],
  );
}

async function updateVatValidatedAt(
  pool: DbPool,
  userId: string,
  erpId: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers
     SET vat_validated_at = NOW()
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );
}

async function getCustomerPhoto(
  pool: DbPool,
  userId: string,
  erpId: string,
): Promise<string | undefined> {
  const { rows } = await pool.query<{ photo: string | null }>(
    `SELECT photo FROM agents.customers
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );
  return rows.length > 0 ? (rows[0].photo ?? undefined) : undefined;
}

async function setCustomerPhoto(
  pool: DbPool,
  userId: string,
  erpId: string,
  photo: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET photo = $1, updated_at = NOW()
     WHERE erp_id = $2 AND user_id = $3`,
    [photo, erpId, userId],
  );
}

async function deleteCustomerPhoto(
  pool: DbPool,
  userId: string,
  erpId: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET photo = NULL, updated_at = NOW()
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );
}

function isCustomerComplete(customer: Customer): boolean {
  return !!(
    customer.name &&
    customer.vatNumber &&
    customer.vatValidatedAt &&
    (customer.pec || customer.sdi) &&
    customer.street &&
    customer.postalCode &&
    customer.city
  );
}

async function getIncompleteCustomersCount(pool: DbPool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM agents.customers
     WHERE user_id = $1
       AND deleted_at IS NULL
       AND (
         name IS NULL OR name = '' OR
         vat_number IS NULL OR
         vat_validated_at IS NULL OR
         (pec IS NULL AND sdi IS NULL) OR
         street IS NULL OR
         postal_code IS NULL OR
         city IS NULL
       )`,
    [userId],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

async function updateAgentNotes(
  pool: DbPool,
  userId: string,
  erpId: string,
  notes: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET agent_notes = $1, updated_at = NOW()
     WHERE erp_id = $2 AND user_id = $3`,
    [notes, erpId, userId],
  );
}

export {
  getCustomers,
  getHiddenCustomers,
  setCustomerHidden,
  getCustomerByProfile,
  getCustomerCount,
  getLastSyncTime,
  getGlobalCustomerCount,
  getGlobalCustomerLastSyncTime,
  upsertCustomers,
  findDeletedCustomers,
  deleteCustomers,
  upsertSingleCustomer,
  updateCustomerBotStatus,
  updateArchibaldName,
  updateVatValidatedAt,
  updateAgentNotes,
  getCustomerPhoto,
  setCustomerPhoto,
  deleteCustomerPhoto,
  isCustomerComplete,
  getIncompleteCustomersCount,
  mapRowToCustomer,
  calculateHash,
  type CustomerRow,
  type Customer,
  type CustomerInput,
  type CustomerFormInput,
  type UpsertResult,
};

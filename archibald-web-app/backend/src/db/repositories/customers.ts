import { createHash } from 'crypto';
import type { DbPool } from '../pool';

type CustomerRow = {
  customer_profile: string;
  user_id: string;
  internal_id: string | null;
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
};

type Customer = {
  customerProfile: string;
  userId: string;
  internalId: string | null;
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
  photo: string | null;
};

type CustomerInput = {
  customerProfile: string;
  internalId?: string;
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
};

type UpsertResult = {
  inserted: number;
  updated: number;
  unchanged: number;
};

const COLUMNS_WITHOUT_PHOTO = `
  customer_profile, user_id, internal_id, name,
  vat_number, fiscal_code, sdi, pec,
  phone, mobile, email, url, attention_to,
  street, logistics_address, postal_code, city,
  customer_type, type, delivery_terms, description,
  last_order_date, actual_order_count, actual_sales,
  previous_order_count_1, previous_sales_1,
  previous_order_count_2, previous_sales_2,
  external_account_number, our_account_number,
  hash, last_sync, created_at, updated_at, bot_status, archibald_name
`;

function mapRowToCustomer(row: CustomerRow): Customer {
  return {
    customerProfile: row.customer_profile,
    userId: row.user_id,
    internalId: row.internal_id,
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
    photo: row.photo,
  };
}

function calculateHash(customer: CustomerInput): string {
  const data = [
    customer.customerProfile,
    customer.internalId,
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
    const pattern = `%${searchQuery}%`;
    const { rows } = await pool.query<CustomerRow>(
      `SELECT ${COLUMNS_WITHOUT_PHOTO} FROM agents.customers
       WHERE user_id = $1
         AND (name ILIKE $2
           OR customer_profile ILIKE $2
           OR vat_number ILIKE $2
           OR city ILIKE $2
           OR fiscal_code ILIKE $2
           OR street ILIKE $2
           OR postal_code ILIKE $2)
       ORDER BY name ASC
       LIMIT 100`,
      [userId, pattern],
    );
    return rows.map(mapRowToCustomer);
  }

  const { rows } = await pool.query<CustomerRow>(
    `SELECT ${COLUMNS_WITHOUT_PHOTO} FROM agents.customers
     WHERE user_id = $1
     ORDER BY name ASC`,
    [userId],
  );
  return rows.map(mapRowToCustomer);
}

async function getCustomerByProfile(
  pool: DbPool,
  userId: string,
  customerProfile: string,
): Promise<Customer | undefined> {
  const { rows } = await pool.query<CustomerRow>(
    `SELECT * FROM agents.customers
     WHERE customer_profile = $1 AND user_id = $2`,
    [customerProfile, userId],
  );
  return rows.length > 0 ? mapRowToCustomer(rows[0]) : undefined;
}

async function getCustomerCount(pool: DbPool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM agents.customers WHERE user_id = $1',
    [userId],
  );
  return parseInt(rows[0].count, 10);
}

async function getLastSyncTime(pool: DbPool, userId: string): Promise<number | null> {
  const { rows } = await pool.query<{ last_sync: string | null }>(
    'SELECT MAX(last_sync) AS last_sync FROM agents.customers WHERE user_id = $1',
    [userId],
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
  const profiles = customers.map((c) => c.customerProfile);

  const placeholders = profiles.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: existingRows } = await pool.query<{ customer_profile: string; hash: string }>(
    `SELECT customer_profile, hash FROM agents.customers
     WHERE user_id = $${profiles.length + 1}
       AND customer_profile IN (${placeholders})`,
    [...profiles, userId],
  );

  const existingMap = new Map(existingRows.map((r) => [r.customer_profile, r.hash]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const customer of customers) {
    const hash = calculateHash(customer);
    const existingHash = existingMap.get(customer.customerProfile);

    if (existingHash === undefined) {
      await pool.query(
        `INSERT INTO agents.customers (
          customer_profile, user_id, internal_id, name,
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
          customer.customerProfile, userId, customer.internalId ?? null, customer.name,
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
          internal_id = $3, name = $4,
          vat_number = $5, fiscal_code = $6, sdi = $7, pec = $8,
          phone = $9, mobile = $10, email = $11, url = $12, attention_to = $13,
          street = $14, logistics_address = $15, postal_code = $16, city = $17,
          customer_type = $18, type = $19, delivery_terms = $20, description = $21,
          last_order_date = $22, actual_order_count = $23, actual_sales = $24,
          previous_order_count_1 = $25, previous_sales_1 = $26,
          previous_order_count_2 = $27, previous_sales_2 = $28,
          external_account_number = $29, our_account_number = $30,
          hash = $31, last_sync = $32, updated_at = NOW()
        WHERE customer_profile = $1 AND user_id = $2`,
        [
          customer.customerProfile, userId, customer.internalId ?? null, customer.name,
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
  const { rows } = await pool.query<{ customer_profile: string }>(
    `SELECT customer_profile FROM agents.customers
     WHERE user_id = $${currentIds.length + 1}
       AND customer_profile NOT IN (${placeholders})`,
    [...currentIds, userId],
  );
  return rows.map((r) => r.customer_profile);
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
    `DELETE FROM agents.customers
     WHERE customer_profile IN (${placeholders})
       AND user_id = $${ids.length + 1}`,
    [...ids, userId],
  );
  return result.rowCount ?? 0;
}

async function upsertSingleCustomer(
  pool: DbPool,
  userId: string,
  formData: CustomerFormInput,
  customerProfile: string,
  botStatus: string,
): Promise<Customer> {
  const now = Date.now();
  const customerData: CustomerInput = {
    customerProfile,
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
      customer_profile, user_id, name, vat_number, pec, sdi,
      street, postal_code, phone, mobile, email, url,
      delivery_terms, hash, last_sync, bot_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (customer_profile, user_id) DO UPDATE SET
      name = EXCLUDED.name,
      vat_number = EXCLUDED.vat_number,
      pec = EXCLUDED.pec,
      sdi = EXCLUDED.sdi,
      street = EXCLUDED.street,
      postal_code = EXCLUDED.postal_code,
      phone = EXCLUDED.phone,
      mobile = EXCLUDED.mobile,
      email = EXCLUDED.email,
      url = EXCLUDED.url,
      delivery_terms = EXCLUDED.delivery_terms,
      hash = EXCLUDED.hash,
      last_sync = EXCLUDED.last_sync,
      bot_status = EXCLUDED.bot_status,
      updated_at = NOW()`,
    [
      customerProfile, userId, formData.name,
      formData.vatNumber ?? null, formData.pec ?? null, formData.sdi ?? null,
      formData.street ?? null, formData.postalCode ?? null,
      formData.phone ?? null, formData.mobile ?? null,
      formData.email ?? null, formData.url ?? null,
      formData.deliveryMode ?? null, hash, now, botStatus,
    ],
  );

  const { rows } = await pool.query<CustomerRow>(
    `SELECT * FROM agents.customers
     WHERE customer_profile = $1 AND user_id = $2`,
    [customerProfile, userId],
  );
  return mapRowToCustomer(rows[0]);
}

async function updateCustomerBotStatus(
  pool: DbPool,
  userId: string,
  customerProfile: string,
  status: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET bot_status = $1, updated_at = NOW()
     WHERE customer_profile = $2 AND user_id = $3`,
    [status, customerProfile, userId],
  );
}

async function updateArchibaldName(
  pool: DbPool,
  userId: string,
  customerProfile: string,
  name: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET archibald_name = $1, updated_at = NOW()
     WHERE customer_profile = $2 AND user_id = $3`,
    [name, customerProfile, userId],
  );
}

async function getCustomerPhoto(
  pool: DbPool,
  userId: string,
  customerProfile: string,
): Promise<string | undefined> {
  const { rows } = await pool.query<{ photo: string | null }>(
    `SELECT photo FROM agents.customers
     WHERE customer_profile = $1 AND user_id = $2`,
    [customerProfile, userId],
  );
  return rows.length > 0 ? (rows[0].photo ?? undefined) : undefined;
}

async function setCustomerPhoto(
  pool: DbPool,
  userId: string,
  customerProfile: string,
  photo: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET photo = $1, updated_at = NOW()
     WHERE customer_profile = $2 AND user_id = $3`,
    [photo, customerProfile, userId],
  );
}

async function deleteCustomerPhoto(
  pool: DbPool,
  userId: string,
  customerProfile: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET photo = NULL, updated_at = NOW()
     WHERE customer_profile = $1 AND user_id = $2`,
    [customerProfile, userId],
  );
}

export {
  getCustomers,
  getCustomerByProfile,
  getCustomerCount,
  getLastSyncTime,
  upsertCustomers,
  deleteCustomers,
  upsertSingleCustomer,
  updateCustomerBotStatus,
  updateArchibaldName,
  getCustomerPhoto,
  setCustomerPhoto,
  deleteCustomerPhoto,
  mapRowToCustomer,
  calculateHash,
  type Customer,
  type CustomerFormInput,
};

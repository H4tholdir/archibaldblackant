import type { DbPool } from '../pool';

type FresisHistoryRow = {
  id: string;
  user_id: string;
  original_pending_order_id: string | null;
  sub_client_codice: string;
  sub_client_name: string;
  sub_client_data: unknown | null;
  customer_id: string;
  customer_name: string;
  items: unknown;
  discount_percent: number | null;
  target_total_with_vat: number | null;
  shipping_cost: number | null;
  shipping_tax: number | null;
  merged_into_order_id: string | null;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  notes: string | null;
  archibald_order_id: string | null;
  archibald_order_number: string | null;
  current_state: string | null;
  state_updated_at: string | null;
  ddt_number: string | null;
  ddt_delivery_date: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_courier: string | null;
  delivery_completed_date: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_amount: string | null;
  source: string;
  revenue: number | null;
  invoice_closed: boolean | null;
  invoice_remaining_amount: string | null;
  invoice_due_date: string | null;
  arca_data: unknown | null;
  parent_customer_name: string | null;
};

type FresisHistoryRecord = {
  id: string;
  userId: string;
  originalPendingOrderId: string | null;
  subClientCodice: string;
  subClientName: string;
  subClientData: unknown | null;
  customerId: string;
  customerName: string;
  items: unknown;
  discountPercent: number | null;
  targetTotalWithVat: number | null;
  shippingCost: number | null;
  shippingTax: number | null;
  mergedIntoOrderId: string | null;
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  archibaldOrderId: string | null;
  archibaldOrderNumber: string | null;
  currentState: string | null;
  stateUpdatedAt: string | null;
  ddtNumber: string | null;
  ddtDeliveryDate: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingCourier: string | null;
  deliveryCompletedDate: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceAmount: string | null;
  source: string;
  revenue: number | null;
  invoiceClosed: boolean | null;
  invoiceRemainingAmount: string | null;
  invoiceDueDate: string | null;
  arcaData: unknown | null;
  parentCustomerName: string | null;
};

type FresisDiscountRow = {
  id: string;
  article_code: string;
  discount_percent: number;
  kp_price_unit: number | null;
  user_id: string;
  created_at: number;
  updated_at: number;
};

type FresisDiscount = {
  id: string;
  articleCode: string;
  discountPercent: number;
  kpPriceUnit: number | null;
  userId: string;
  createdAt: number;
  updatedAt: number;
};

type FresisHistoryInput = {
  id: string;
  originalPendingOrderId: string | null;
  subClientCodice: string;
  subClientName: string;
  subClientData: unknown | null;
  customerId: string;
  customerName: string;
  items: unknown;
  discountPercent: number | null;
  targetTotalWithVat: number | null;
  shippingCost: number | null;
  shippingTax: number | null;
  revenue: number | null;
  mergedIntoOrderId: string | null;
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  archibaldOrderId: string | null;
  archibaldOrderNumber: string | null;
  currentState: string | null;
  stateUpdatedAt: string | null;
  ddtNumber: string | null;
  ddtDeliveryDate: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingCourier: string | null;
  deliveryCompletedDate: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceAmount: string | null;
  invoiceClosed: boolean | null;
  invoiceRemainingAmount: string | null;
  invoiceDueDate: string | null;
  arcaData: unknown | null;
  parentCustomerName: string | null;
  source: string;
};

type StateData = {
  currentState?: string | null;
  parentCustomerName?: string | null;
  ddtNumber?: string | null;
  ddtDeliveryDate?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  trackingCourier?: string | null;
  deliveryCompletedDate?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoiceAmount?: string | null;
  invoiceClosed?: boolean | null;
  invoiceRemainingAmount?: string | null;
  invoiceDueDate?: string | null;
};

function mapRowToFresisHistory(row: FresisHistoryRow): FresisHistoryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    originalPendingOrderId: row.original_pending_order_id,
    subClientCodice: row.sub_client_codice,
    subClientName: row.sub_client_name,
    subClientData: row.sub_client_data,
    customerId: row.customer_id,
    customerName: row.customer_name,
    items: row.items,
    discountPercent: row.discount_percent,
    targetTotalWithVat: row.target_total_with_vat,
    shippingCost: row.shipping_cost,
    shippingTax: row.shipping_tax,
    mergedIntoOrderId: row.merged_into_order_id,
    mergedAt: row.merged_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notes: row.notes,
    archibaldOrderId: row.archibald_order_id,
    archibaldOrderNumber: row.archibald_order_number,
    currentState: row.current_state,
    stateUpdatedAt: row.state_updated_at,
    ddtNumber: row.ddt_number,
    ddtDeliveryDate: row.ddt_delivery_date,
    trackingNumber: row.tracking_number,
    trackingUrl: row.tracking_url,
    trackingCourier: row.tracking_courier,
    deliveryCompletedDate: row.delivery_completed_date,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    invoiceAmount: row.invoice_amount,
    source: row.source,
    revenue: row.revenue,
    invoiceClosed: row.invoice_closed,
    invoiceRemainingAmount: row.invoice_remaining_amount,
    invoiceDueDate: row.invoice_due_date,
    arcaData: row.arca_data,
    parentCustomerName: row.parent_customer_name,
  };
}

function mapRowToFresisDiscount(row: FresisDiscountRow): FresisDiscount {
  return {
    id: row.id,
    articleCode: row.article_code,
    discountPercent: row.discount_percent,
    kpPriceUnit: row.kp_price_unit,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getAll(pool: DbPool, userId: string): Promise<FresisHistoryRecord[]> {
  const { rows } = await pool.query<FresisHistoryRow>(
    'SELECT * FROM agents.fresis_history WHERE user_id = $1',
    [userId],
  );
  return rows.map(mapRowToFresisHistory);
}

async function getById(pool: DbPool, userId: string, recordId: string): Promise<FresisHistoryRecord | null> {
  const { rows: [row] } = await pool.query<FresisHistoryRow>(
    'SELECT * FROM agents.fresis_history WHERE id = $1 AND user_id = $2',
    [recordId, userId],
  );
  return row ? mapRowToFresisHistory(row) : null;
}

async function upsertRecords(
  pool: DbPool,
  userId: string,
  records: FresisHistoryInput[],
): Promise<{ inserted: number; updated: number }> {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  const values: unknown[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const base = i * 38;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20}, $${base + 21}, $${base + 22}, $${base + 23}, $${base + 24}, $${base + 25}, $${base + 26}, $${base + 27}, $${base + 28}, $${base + 29}, $${base + 30}, $${base + 31}, $${base + 32}, $${base + 33}, $${base + 34}, $${base + 35}, $${base + 36}, $${base + 37}, $${base + 38})`,
    );
    const r = records[i];
    values.push(
      r.id, userId, r.originalPendingOrderId, r.subClientCodice, r.subClientName,
      r.subClientData ? JSON.stringify(r.subClientData) : null, r.customerId, r.customerName,
      JSON.stringify(r.items), r.discountPercent,
      r.targetTotalWithVat, r.shippingCost, r.shippingTax, r.revenue,
      r.mergedIntoOrderId, r.mergedAt, r.createdAt, r.updatedAt,
      r.notes, r.archibaldOrderId, r.archibaldOrderNumber,
      r.currentState, r.stateUpdatedAt, r.ddtNumber, r.ddtDeliveryDate,
      r.trackingNumber, r.trackingUrl, r.trackingCourier, r.deliveryCompletedDate,
      r.invoiceNumber, r.invoiceDate, r.invoiceAmount, r.invoiceClosed,
      r.invoiceRemainingAmount, r.invoiceDueDate,
      r.arcaData ? JSON.stringify(r.arcaData) : null, r.parentCustomerName, r.source,
    );
  }

  const { rows } = await pool.query<{ action: string }>(
    `INSERT INTO agents.fresis_history (
      id, user_id, original_pending_order_id, sub_client_codice, sub_client_name,
      sub_client_data, customer_id, customer_name, items, discount_percent,
      target_total_with_vat, shipping_cost, shipping_tax, revenue,
      merged_into_order_id, merged_at, created_at, updated_at,
      notes, archibald_order_id, archibald_order_number,
      current_state, state_updated_at, ddt_number, ddt_delivery_date,
      tracking_number, tracking_url, tracking_courier, delivery_completed_date,
      invoice_number, invoice_date, invoice_amount, invoice_closed,
      invoice_remaining_amount, invoice_due_date, arca_data, parent_customer_name, source
    ) VALUES ${placeholders.join(', ')}
    ON CONFLICT(id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      original_pending_order_id = EXCLUDED.original_pending_order_id,
      sub_client_codice = EXCLUDED.sub_client_codice,
      sub_client_name = EXCLUDED.sub_client_name,
      sub_client_data = EXCLUDED.sub_client_data,
      customer_id = EXCLUDED.customer_id,
      customer_name = EXCLUDED.customer_name,
      items = EXCLUDED.items,
      discount_percent = EXCLUDED.discount_percent,
      target_total_with_vat = EXCLUDED.target_total_with_vat,
      shipping_cost = EXCLUDED.shipping_cost,
      shipping_tax = EXCLUDED.shipping_tax,
      revenue = EXCLUDED.revenue,
      merged_into_order_id = EXCLUDED.merged_into_order_id,
      merged_at = EXCLUDED.merged_at,
      updated_at = EXCLUDED.updated_at,
      notes = EXCLUDED.notes,
      archibald_order_id = EXCLUDED.archibald_order_id,
      archibald_order_number = EXCLUDED.archibald_order_number,
      current_state = EXCLUDED.current_state,
      state_updated_at = EXCLUDED.state_updated_at,
      ddt_number = EXCLUDED.ddt_number,
      ddt_delivery_date = EXCLUDED.ddt_delivery_date,
      tracking_number = EXCLUDED.tracking_number,
      tracking_url = EXCLUDED.tracking_url,
      tracking_courier = EXCLUDED.tracking_courier,
      delivery_completed_date = EXCLUDED.delivery_completed_date,
      invoice_number = EXCLUDED.invoice_number,
      invoice_date = EXCLUDED.invoice_date,
      invoice_amount = EXCLUDED.invoice_amount,
      invoice_closed = EXCLUDED.invoice_closed,
      invoice_remaining_amount = EXCLUDED.invoice_remaining_amount,
      invoice_due_date = EXCLUDED.invoice_due_date,
      arca_data = EXCLUDED.arca_data,
      parent_customer_name = EXCLUDED.parent_customer_name,
      source = EXCLUDED.source
    RETURNING CASE WHEN xmax = 0 THEN 'inserted' ELSE 'updated' END AS action`,
    values,
  );

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    if (row.action === 'inserted') inserted++;
    else updated++;
  }

  return { inserted, updated };
}

async function deleteRecord(pool: DbPool, userId: string, recordId: string): Promise<number> {
  const { rowCount } = await pool.query(
    'DELETE FROM agents.fresis_history WHERE id = $1 AND user_id = $2',
    [recordId, userId],
  );
  return rowCount ?? 0;
}

async function getByMotherOrder(
  pool: DbPool,
  userId: string,
  orderId: string,
): Promise<FresisHistoryRecord[]> {
  const { rows } = await pool.query<FresisHistoryRow>(
    `SELECT * FROM agents.fresis_history
     WHERE user_id = $1 AND (
       merged_into_order_id = $2
       OR archibald_order_id = $3
       OR archibald_order_id LIKE $4
     )`,
    [userId, orderId, orderId, `%${orderId}%`],
  );
  return rows.map(mapRowToFresisHistory);
}

async function getSiblings(
  pool: DbPool,
  userId: string,
  archibaldOrderIds: string[],
): Promise<FresisHistoryRecord[]> {
  if (archibaldOrderIds.length === 0) return [];

  const conditions: string[] = [];
  const params: unknown[] = [userId];
  let paramIndex = 2;

  for (const id of archibaldOrderIds) {
    conditions.push(
      `(archibald_order_id = $${paramIndex} OR archibald_order_id LIKE $${paramIndex + 1} OR merged_into_order_id = $${paramIndex + 2})`,
    );
    params.push(id, `%${id}%`, id);
    paramIndex += 3;
  }

  const { rows } = await pool.query<FresisHistoryRow>(
    `SELECT * FROM agents.fresis_history WHERE user_id = $1 AND (${conditions.join(' OR ')})`,
    params,
  );
  return rows.map(mapRowToFresisHistory);
}

async function propagateState(
  pool: DbPool,
  userId: string,
  orderId: string,
  stateData: StateData,
): Promise<number> {
  const now = new Date().toISOString();

  const { rowCount } = await pool.query(
    `UPDATE agents.fresis_history SET
      current_state = COALESCE($1, current_state),
      state_updated_at = $2,
      parent_customer_name = COALESCE($3, parent_customer_name),
      ddt_number = COALESCE($4, ddt_number),
      ddt_delivery_date = COALESCE($5, ddt_delivery_date),
      tracking_number = COALESCE($6, tracking_number),
      tracking_url = COALESCE($7, tracking_url),
      tracking_courier = COALESCE($8, tracking_courier),
      delivery_completed_date = COALESCE($9, delivery_completed_date),
      invoice_number = COALESCE($10, invoice_number),
      invoice_date = COALESCE($11, invoice_date),
      invoice_amount = COALESCE($12, invoice_amount),
      invoice_closed = COALESCE($13, invoice_closed),
      invoice_remaining_amount = COALESCE($14, invoice_remaining_amount),
      invoice_due_date = COALESCE($15, invoice_due_date),
      updated_at = $16
    WHERE user_id = $17 AND (
      merged_into_order_id = $18
      OR archibald_order_id = $19
      OR archibald_order_id LIKE $20
    ) AND source = 'app'`,
    [
      stateData.currentState ?? null, now,
      stateData.parentCustomerName ?? null,
      stateData.ddtNumber ?? null, stateData.ddtDeliveryDate ?? null,
      stateData.trackingNumber ?? null, stateData.trackingUrl ?? null,
      stateData.trackingCourier ?? null, stateData.deliveryCompletedDate ?? null,
      stateData.invoiceNumber ?? null, stateData.invoiceDate ?? null,
      stateData.invoiceAmount ?? null, stateData.invoiceClosed ?? null,
      stateData.invoiceRemainingAmount ?? null, stateData.invoiceDueDate ?? null,
      now, userId, orderId, orderId, `%"${orderId}"%`,
    ],
  );

  return rowCount ?? 0;
}

async function deleteArcaImports(pool: DbPool, userId: string): Promise<number> {
  const { rowCount } = await pool.query(
    "DELETE FROM agents.fresis_history WHERE user_id = $1 AND source = 'arca_import'",
    [userId],
  );
  return rowCount ?? 0;
}

async function getArcaExport(
  pool: DbPool,
  userId: string,
  fromDate?: string,
  toDate?: string,
): Promise<FresisHistoryRecord[]> {
  let query = 'SELECT * FROM agents.fresis_history WHERE user_id = $1 AND arca_data IS NOT NULL';
  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (fromDate) {
    query += ` AND created_at >= $${paramIndex}`;
    params.push(fromDate);
    paramIndex++;
  }

  if (toDate) {
    query += ` AND created_at <= $${paramIndex}`;
    params.push(toDate + 'T23:59:59');
    paramIndex++;
  }

  const { rows } = await pool.query<FresisHistoryRow>(query, params);
  return rows.map(mapRowToFresisHistory);
}

async function updateItems(
  pool: DbPool,
  userId: string,
  recordId: string,
  itemsJson: unknown,
): Promise<number> {
  const now = new Date().toISOString();
  const { rowCount } = await pool.query(
    'UPDATE agents.fresis_history SET items = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
    [JSON.stringify(itemsJson), now, recordId, userId],
  );
  return rowCount ?? 0;
}

async function getDiscounts(pool: DbPool, userId: string): Promise<FresisDiscount[]> {
  const { rows } = await pool.query<FresisDiscountRow>(
    'SELECT * FROM agents.fresis_discounts WHERE user_id = $1',
    [userId],
  );
  return rows.map(mapRowToFresisDiscount);
}

async function upsertDiscount(
  pool: DbPool,
  userId: string,
  id: string,
  articleCode: string,
  discountPercent: number,
  kpPriceUnit?: number | null,
): Promise<void> {
  const now = Date.now();
  await pool.query(
    `INSERT INTO agents.fresis_discounts (id, article_code, discount_percent, kp_price_unit, user_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(id) DO UPDATE SET
      article_code = EXCLUDED.article_code,
      discount_percent = EXCLUDED.discount_percent,
      kp_price_unit = EXCLUDED.kp_price_unit,
      updated_at = EXCLUDED.updated_at`,
    [id, articleCode, discountPercent, kpPriceUnit ?? null, userId, now, now],
  );
}

async function deleteDiscount(pool: DbPool, userId: string, id: string): Promise<number> {
  const { rowCount } = await pool.query(
    'DELETE FROM agents.fresis_discounts WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return rowCount ?? 0;
}

export {
  getAll,
  getById,
  upsertRecords,
  deleteRecord,
  getByMotherOrder,
  getSiblings,
  propagateState,
  getDiscounts,
  upsertDiscount,
  deleteDiscount,
  mapRowToFresisHistory,
  type FresisHistoryRecord,
  type FresisHistoryInput,
  type FresisDiscount,
  type StateData,
};

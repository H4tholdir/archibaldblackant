import crypto from 'crypto';
import type { DbPool } from '../pool';
import type { DdtEntry, DdtRow } from './order-ddts';
import { mapRowToDdtEntry } from './order-ddts';
import type { InvoiceEntry, InvoiceRow } from './order-invoices';
import { mapRowToInvoiceEntry } from './order-invoices';

type OrderRow = {
  id: string;
  user_id: string;
  order_number: string;
  customer_account_num: string | null;
  customer_name: string;
  delivery_name: string | null;
  delivery_address: string | null;
  creation_date: string;
  delivery_date: string | null;
  order_description: string | null;
  customer_reference: string | null;
  sales_status: string | null;
  order_type: string | null;
  document_status: string | null;
  sales_origin: string | null;
  transfer_status: string | null;
  transfer_date: string | null;
  completion_date: string | null;
  discount_percent: string | null;
  gross_amount: string | null;
  total_amount: string | null;
  is_quote: string | null;
  is_gift_order: string | null;
  hash: string;
  last_sync: number;
  created_at: string;
  ddt_number: string | null;
  ddt_delivery_date: string | null;
  ddt_id: string | null;
  ddt_customer_account: string | null;
  ddt_sales_name: string | null;
  ddt_delivery_name: string | null;
  delivery_terms: string | null;
  delivery_method: string | null;
  delivery_city: string | null;
  attention_to: string | null;
  ddt_delivery_address: string | null;
  ddt_quantity: string | null;
  ddt_customer_reference: string | null;
  ddt_description: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_courier: string | null;
  delivery_completed_date: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_amount: string | null;
  invoice_customer_account: string | null;
  invoice_billing_name: string | null;
  invoice_quantity: number | null;
  invoice_remaining_amount: string | null;
  invoice_tax_amount: string | null;
  invoice_line_discount: string | null;
  invoice_total_discount: string | null;
  invoice_due_date: string | null;
  invoice_payment_terms_id: string | null;
  invoice_purchase_order: string | null;
  invoice_closed: boolean | null;
  invoice_days_past_due: string | null;
  invoice_settled_amount: string | null;
  invoice_last_payment_id: string | null;
  invoice_last_settlement_date: string | null;
  invoice_closed_date: string | null;
  current_state: string | null;
  sent_to_verona_at: string | null;
  archibald_order_id: string | null;
  total_vat_amount: string | null;
  total_with_vat: string | null;
  articles_synced_at: string | null;
  shipping_cost: number | null;
  shipping_tax: number | null;
  article_search_text: string | null;
  verification_status: string | null;
  verification_notes: string | null;
  tracking_status: string | null;
  tracking_key_status_cd: string | null;
  tracking_status_bar_cd: string | null;
  tracking_estimated_delivery: string | null;
  tracking_last_location: string | null;
  tracking_last_event: string | null;
  tracking_last_event_at: string | null;
  tracking_last_synced_at: string | null;
  tracking_sync_failures: number | null;
  tracking_origin: string | null;
  tracking_destination: string | null;
  tracking_service_desc: string | null;
  delivery_confirmed_at: string | null;
  delivery_signed_by: string | null;
  notes: string | null;
  tracking_events: unknown;
  arca_kt_synced_at: string | null;
  ddts_json: unknown;
  invoices_json: unknown;
};


type Order = {
  id: string;
  userId: string;
  orderNumber: string;
  customerAccountNum: string | null;
  customerName: string;
  deliveryName: string | null;
  deliveryAddress: string | null;
  date: string;
  deliveryDate: string | null;
  orderDescription: string | null;
  customerReference: string | null;
  status: string | null;
  orderType: string | null;
  documentState: string | null;
  salesOrigin: string | null;
  transferStatus: string | null;
  transferDate: string | null;
  completionDate: string | null;
  discountPercent: string | null;
  grossAmount: string | null;
  total: string | null;
  isQuote: string | null;
  isGiftOrder: string | null;
  hash: string;
  lastSync: number;
  createdAt: string;
  state: string | null;
  sentToVeronaAt: string | null;
  archibaldOrderId: string | null;
  totalVatAmount: string | null;
  totalWithVat: string | null;
  articlesSyncedAt: string | null;
  shippingCost: number | null;
  shippingTax: number | null;
  articleSearchText: string | null;
  verificationStatus: string | null;
  verificationNotes: string | null;
  notes: string | undefined;
  arcaKtSyncedAt: string | null;
  ddts: DdtEntry[];
  invoices: InvoiceEntry[];
};

type OrderInput = {
  id: string;
  orderNumber: string;
  customerAccountNum: string | null;
  customerName: string;
  deliveryName: string | null;
  deliveryAddress: string | null;
  date: string;
  deliveryDate: string | null;
  orderDescription: string | null;
  customerReference: string | null;
  status: string | null;
  orderType: string | null;
  documentState: string | null;
  salesOrigin: string | null;
  transferStatus: string | null;
  transferDate: string | null;
  completionDate: string | null;
  discountPercent: string | null;
  grossAmount: string | null;
  total: string | null;
  isQuote?: string | null;
  isGiftOrder?: string | null;
};

type UpsertResult = {
  action: 'inserted' | 'updated' | 'skipped';
  orderNumberChanged?: { from: string; to: string };
};

type OrderFilterOptions = {
  limit?: number;
  offset?: number;
  status?: string;
  customer?: string;
  customerAccountNum?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

type OrderArticleRow = {
  id: number;
  order_id: string;
  user_id: string;
  article_code: string;
  article_description: string | null;
  quantity: number;
  unit_price: number | null;
  discount_percent: number | null;
  line_amount: number | null;
  vat_percent: number | null;
  vat_amount: number | null;
  line_total_with_vat: number | null;
  warehouse_quantity: number | null;
  warehouse_sources_json: string | null;
  created_at: string;
};

type OrderArticle = {
  id: number;
  orderId: string;
  userId: string;
  articleCode: string;
  articleDescription: string | null;
  quantity: number;
  unitPrice: number | null;
  discountPercent: number | null;
  lineAmount: number | null;
  vatPercent: number | null;
  vatAmount: number | null;
  lineTotalWithVat: number | null;
  warehouseQuantity: number | null;
  warehouseSourcesJson: string | null;
  createdAt: string;
};

type OrderArticleInput = {
  orderId: string;
  userId: string;
  articleCode: string;
  articleDescription?: string | null;
  quantity: number;
  unitPrice?: number | null;
  discountPercent?: number | null;
  lineAmount?: number | null;
  vatPercent?: number | null;
  vatAmount?: number | null;
  lineTotalWithVat?: number | null;
  warehouseQuantity?: number | null;
  warehouseSourcesJson?: string | null;
};

type StateHistoryRow = {
  id: number;
  order_id: string;
  user_id: string;
  old_state: string | null;
  new_state: string;
  actor: string;
  notes: string | null;
  confidence: string | null;
  source: string | null;
  timestamp: string;
  created_at: string;
};

type StateHistory = {
  id: number;
  orderId: string;
  userId: string;
  oldState: string | null;
  newState: string;
  actor: string;
  notes: string | null;
  confidence: string | null;
  source: string | null;
  timestamp: string;
  createdAt: string;
};


function mapRowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    orderNumber: row.order_number,
    customerAccountNum: row.customer_account_num,
    customerName: row.customer_name,
    deliveryName: row.delivery_name,
    deliveryAddress: row.delivery_address,
    date: row.creation_date,
    deliveryDate: row.delivery_date,
    orderDescription: row.order_description,
    customerReference: row.customer_reference,
    status: row.sales_status,
    orderType: row.order_type,
    documentState: row.document_status,
    salesOrigin: row.sales_origin,
    transferStatus: row.transfer_status,
    transferDate: row.transfer_date,
    completionDate: row.completion_date,
    discountPercent: row.discount_percent,
    grossAmount: row.gross_amount,
    total: row.total_amount,
    isQuote: row.is_quote ?? null,
    isGiftOrder: row.is_gift_order ?? null,
    hash: row.hash,
    lastSync: row.last_sync,
    createdAt: row.created_at,
    state: row.current_state,
    sentToVeronaAt: row.sent_to_verona_at,
    archibaldOrderId: row.archibald_order_id,
    totalVatAmount: row.total_vat_amount,
    totalWithVat: row.total_with_vat,
    articlesSyncedAt: row.articles_synced_at,
    shippingCost: row.shipping_cost,
    shippingTax: row.shipping_tax,
    articleSearchText: row.article_search_text,
    verificationStatus: row.verification_status === 'correction_failed' || row.verification_status === 'mismatch_detected'
      ? row.verification_status
      : null,
    verificationNotes: row.verification_status === 'correction_failed' || row.verification_status === 'mismatch_detected'
      ? row.verification_notes
      : null,
    notes: row.notes ?? undefined,
    arcaKtSyncedAt: row.arca_kt_synced_at,
    ddts: Array.isArray(row.ddts_json) ? (row.ddts_json as DdtRow[]).map(mapRowToDdtEntry) : [],
    invoices: Array.isArray(row.invoices_json) ? (row.invoices_json as InvoiceRow[]).map(mapRowToInvoiceEntry) : [],
  };
}

function mapRowToArticle(row: OrderArticleRow): OrderArticle {
  return {
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    articleCode: row.article_code,
    articleDescription: row.article_description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    discountPercent: row.discount_percent,
    lineAmount: row.line_amount,
    vatPercent: row.vat_percent,
    vatAmount: row.vat_amount,
    lineTotalWithVat: row.line_total_with_vat,
    warehouseQuantity: row.warehouse_quantity,
    warehouseSourcesJson: row.warehouse_sources_json,
    createdAt: row.created_at,
  };
}

function mapRowToStateHistory(row: StateHistoryRow): StateHistory {
  return {
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    oldState: row.old_state,
    newState: row.new_state,
    actor: row.actor,
    notes: row.notes,
    confidence: row.confidence,
    source: row.source,
    timestamp: row.timestamp,
    createdAt: row.created_at,
  };
}

function computeHash(order: OrderInput): string {
  const hashInput = [
    order.id,
    order.orderNumber,
    order.status,
    order.documentState,
    order.transferStatus,
    order.total,
  ].join('|');
  return crypto.createHash('md5').update(hashInput).digest('hex');
}

async function getOrderById(pool: DbPool, userId: string, orderId: string): Promise<Order | null> {
  const { rows: [order] } = await pool.query<OrderRow>(
    `SELECT o.*, ovs.verification_status, ovs.verification_notes,
      (SELECT COALESCE(json_agg(row_to_json(d.*) ORDER BY d.position), '[]'::json)
       FROM agents.order_ddts d WHERE d.order_id = o.id AND d.user_id = o.user_id
      ) AS ddts_json,
      (SELECT COALESCE(json_agg(row_to_json(i.*) ORDER BY i.position), '[]'::json)
       FROM agents.order_invoices i WHERE i.order_id = o.id AND i.user_id = o.user_id
      ) AS invoices_json
    FROM agents.order_records o
    LEFT JOIN agents.order_verification_snapshots ovs ON ovs.order_id = o.id AND ovs.user_id = o.user_id
    WHERE o.id = $1 AND o.user_id = $2`,
    [orderId, userId],
  );
  return order ? mapRowToOrder(order) : null;
}

async function getOrderByNumber(pool: DbPool, userId: string, orderNumber: string): Promise<Order | null> {
  const { rows: [order] } = await pool.query<OrderRow>(
    `SELECT o.*,
      (SELECT COALESCE(json_agg(row_to_json(d.*) ORDER BY d.position), '[]'::json)
       FROM agents.order_ddts d WHERE d.order_id = o.id AND d.user_id = o.user_id
      ) AS ddts_json,
      (SELECT COALESCE(json_agg(row_to_json(i.*) ORDER BY i.position), '[]'::json)
       FROM agents.order_invoices i WHERE i.order_id = o.id AND i.user_id = o.user_id
      ) AS invoices_json
    FROM agents.order_records o
    WHERE o.order_number = $1 AND o.user_id = $2`,
    [orderNumber, userId],
  );
  return order ? mapRowToOrder(order) : null;
}

function buildFilterClause(options?: OrderFilterOptions): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 2;

  if (options?.search) {
    const searchParam = `%${options.search}%`;
    conditions.push(`(
      o.order_number ILIKE $${paramIndex} OR
      o.customer_name ILIKE $${paramIndex} OR
      o.total_amount ILIKE $${paramIndex} OR
      o.gross_amount ILIKE $${paramIndex} OR
      o.delivery_address ILIKE $${paramIndex} OR
      o.customer_reference ILIKE $${paramIndex} OR
      EXISTS (SELECT 1 FROM agents.order_ddts d WHERE d.order_id = o.id AND d.ddt_number ILIKE $${paramIndex}) OR
      EXISTS (SELECT 1 FROM agents.order_ddts d WHERE d.order_id = o.id AND d.tracking_number ILIKE $${paramIndex}) OR
      EXISTS (SELECT 1 FROM agents.order_invoices i WHERE i.order_id = o.id AND i.invoice_number ILIKE $${paramIndex})
    )`);
    params.push(searchParam);
    paramIndex++;
  }

  if (options?.customerAccountNum) {
    conditions.push(`o.customer_account_num = (SELECT account_num FROM agents.customers WHERE erp_id = $${paramIndex} AND user_id = $1)`);
    params.push(options.customerAccountNum);
    paramIndex++;
  } else if (options?.customer) {
    conditions.push(`translate(o.customer_name, E'\\n\\r\\t', '   ') ILIKE $${paramIndex}`);
    params.push(`%${options.customer.replace(/[\n\r\t]+/g, ' ').trim()}%`);
    paramIndex++;
  }

  if (options?.status) {
    conditions.push(`o.sales_status = $${paramIndex}`);
    params.push(options.status);
    paramIndex++;
  }

  if (options?.dateFrom) {
    conditions.push(`o.creation_date >= $${paramIndex}`);
    params.push(options.dateFrom);
    paramIndex++;
  }

  if (options?.dateTo) {
    conditions.push(`o.creation_date <= $${paramIndex}`);
    params.push(options.dateTo);
    paramIndex++;
  }

  const clause = conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';
  return { clause, params };
}

async function getOrdersByUser(
  pool: DbPool,
  userId: string,
  options?: OrderFilterOptions,
): Promise<Order[]> {
  const { clause, params: filterParams } = buildFilterClause(options);
  const limit = options?.limit ?? 1000;
  const offset = options?.offset ?? 0;

  const allParams = [userId, ...filterParams, limit, offset];
  const limitParamIndex = allParams.length - 1;
  const offsetParamIndex = allParams.length;

  const { rows } = await pool.query<OrderRow>(
    `SELECT o.*, ovs.verification_status, ovs.verification_notes,
      (SELECT COALESCE(json_agg(row_to_json(d.*) ORDER BY d.position), '[]'::json)
       FROM agents.order_ddts d WHERE d.order_id = o.id AND d.user_id = o.user_id
      ) AS ddts_json,
      (SELECT COALESCE(json_agg(row_to_json(i.*) ORDER BY i.position), '[]'::json)
       FROM agents.order_invoices i WHERE i.order_id = o.id AND i.user_id = o.user_id
      ) AS invoices_json
    FROM agents.order_records o
    LEFT JOIN agents.order_verification_snapshots ovs ON ovs.order_id = o.id AND ovs.user_id = o.user_id
    WHERE o.user_id = $1${clause} ORDER BY o.creation_date DESC LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
    allParams,
  );

  return rows.map(mapRowToOrder);
}

async function countOrders(
  pool: DbPool,
  userId: string,
  options?: OrderFilterOptions,
): Promise<number> {
  const { clause, params: filterParams } = buildFilterClause(options);
  const allParams = [userId, ...filterParams];

  const { rows: [row] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM agents.order_records o WHERE o.user_id = $1${clause}`,
    allParams,
  );

  return parseInt(row.count, 10);
}

async function upsertOrder(
  pool: DbPool,
  userId: string,
  order: OrderInput,
): Promise<UpsertResult> {
  const now = Math.floor(Date.now() / 1000);
  const hash = computeHash(order);

  const { rows: [existing] } = await pool.query<{ hash: string; order_number: string }>(
    'SELECT hash, order_number FROM agents.order_records WHERE id = $1 AND user_id = $2',
    [order.id, userId],
  );

  const orderNumberChanged = existing && existing.order_number !== order.orderNumber
    ? { from: existing.order_number, to: order.orderNumber }
    : undefined;

  if (!existing) {
    await pool.query(
      `INSERT INTO agents.order_records (
        id, user_id, order_number, customer_account_num, customer_name,
        delivery_name, delivery_address, creation_date, delivery_date,
        order_description, customer_reference, sales_status,
        order_type, document_status, sales_origin, transfer_status,
        transfer_date, completion_date, discount_percent, gross_amount,
        total_amount, is_quote, is_gift_order, hash, last_sync, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
      [
        order.id, userId, order.orderNumber, order.customerAccountNum, order.customerName,
        order.deliveryName, order.deliveryAddress, order.date, order.deliveryDate,
        order.orderDescription, order.customerReference, order.status,
        order.orderType, order.documentState, order.salesOrigin, order.transferStatus,
        order.transferDate, order.completionDate, order.discountPercent, order.grossAmount,
        order.total, order.isQuote ?? null, order.isGiftOrder ?? null,
        hash, now, new Date().toISOString(),
      ],
    );
    return { action: 'inserted' };
  }

  if (existing.hash === hash) {
    await pool.query(
      'UPDATE agents.order_records SET last_sync = $1, order_number = $2 WHERE id = $3 AND user_id = $4',
      [now, order.orderNumber, order.id, userId],
    );
    return { action: 'skipped', orderNumberChanged };
  }

  await pool.query(
    `UPDATE agents.order_records SET
      order_number = $1, customer_account_num = $2, customer_name = $3, delivery_name = $4,
      delivery_address = $5, creation_date = $6, delivery_date = $7,
      order_description = $8, customer_reference = $9, sales_status = $10,
      order_type = $11, document_status = $12, sales_origin = $13, transfer_status = $14,
      transfer_date = $15, completion_date = $16, discount_percent = $17,
      gross_amount = $18, total_amount = $19, is_quote = $20, is_gift_order = $21,
      hash = $22, last_sync = $23, articles_synced_at = NULL
    WHERE id = $24 AND user_id = $25`,
    [
      order.orderNumber, order.customerAccountNum, order.customerName, order.deliveryName,
      order.deliveryAddress, order.date, order.deliveryDate,
      order.orderDescription, order.customerReference, order.status,
      order.orderType, order.documentState, order.salesOrigin, order.transferStatus,
      order.transferDate, order.completionDate, order.discountPercent,
      order.grossAmount, order.total, order.isQuote ?? null, order.isGiftOrder ?? null,
      hash, now,
      order.id, userId,
    ],
  );
  return { action: 'updated', orderNumberChanged };
}

async function deleteOrderById(pool: DbPool, userId: string, orderId: string): Promise<number> {
  await pool.query(
    'DELETE FROM agents.order_state_history WHERE order_id = $1 AND user_id = $2',
    [orderId, userId],
  );
  await pool.query(
    'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
    [orderId, userId],
  );
  const { rowCount } = await pool.query(
    'DELETE FROM agents.order_records WHERE id = $1 AND user_id = $2',
    [orderId, userId],
  );
  return rowCount ?? 0;
}

async function getOrderArticles(pool: DbPool, orderId: string, userId: string): Promise<OrderArticle[]> {
  const { rows } = await pool.query<OrderArticleRow>(
    `SELECT id, order_id, user_id, article_code, article_description, quantity,
      unit_price, discount_percent, line_amount, vat_percent, vat_amount,
      line_total_with_vat, warehouse_quantity, warehouse_sources_json, created_at
    FROM agents.order_articles
    WHERE order_id = $1 AND user_id = $2
    ORDER BY id`,
    [orderId, userId],
  );
  return rows.map(mapRowToArticle);
}

async function saveOrderArticles(pool: DbPool, articles: OrderArticleInput[]): Promise<number> {
  if (articles.length === 0) return 0;

  const now = new Date().toISOString();
  const values: unknown[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < articles.length; i++) {
    const base = i * 14;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14})`,
    );
    const a = articles[i];
    values.push(
      a.orderId, a.userId, a.articleCode, a.articleDescription ?? null,
      a.quantity, a.unitPrice ?? null, a.discountPercent ?? null, a.lineAmount ?? null,
      a.vatPercent ?? null, a.vatAmount ?? null, a.lineTotalWithVat ?? null,
      a.warehouseQuantity ?? null, a.warehouseSourcesJson ?? null, now,
    );
  }

  await pool.query(
    `INSERT INTO agents.order_articles (
      order_id, user_id, article_code, article_description, quantity,
      unit_price, discount_percent, line_amount, vat_percent, vat_amount,
      line_total_with_vat, warehouse_quantity, warehouse_sources_json, created_at
    ) VALUES ${placeholders.join(', ')}`,
    values,
  );

  return articles.length;
}

async function deleteOrderArticles(pool: DbPool, orderId: string, userId: string): Promise<number> {
  const { rowCount } = await pool.query(
    'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
    [orderId, userId],
  );
  return rowCount ?? 0;
}

async function updateOrderState(
  pool: DbPool,
  userId: string,
  orderId: string,
  newState: string,
  actor: string,
  notes: string | null,
  confidence?: string | null,
  source?: string | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const timestamp = new Date().toISOString();

  const { rows: [currentOrder] } = await pool.query<{ current_state: string | null }>(
    'SELECT current_state FROM agents.order_records WHERE id = $1 AND user_id = $2',
    [orderId, userId],
  );

  if (!currentOrder) return;

  const oldState = currentOrder.current_state;

  await pool.query(
    'UPDATE agents.order_records SET current_state = $1, last_sync = $2 WHERE id = $3 AND user_id = $4',
    [newState, now, orderId, userId],
  );

  await pool.query(
    `INSERT INTO agents.order_state_history (
      order_id, user_id, old_state, new_state, actor, notes, confidence, source, timestamp, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [orderId, userId, oldState, newState, actor, notes, confidence ?? null, source ?? null, timestamp, timestamp],
  );
}

async function getStateHistory(pool: DbPool, userId: string, orderId: string): Promise<StateHistory[]> {
  const { rows } = await pool.query<StateHistoryRow>(
    `SELECT id, order_id, user_id, old_state, new_state, actor, notes, confidence, source, timestamp, created_at
    FROM agents.order_state_history
    WHERE order_id = $1 AND user_id = $2
    ORDER BY timestamp DESC`,
    [orderId, userId],
  );
  return rows.map(mapRowToStateHistory);
}


type LastSaleEntry = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  quantity: number;
  unitPrice: number | null;
  discountPercent: number;
  orderDiscountPercent: number;
  lineAmount: number | null;
  date: string;
};

type OrderNumberMapping = {
  id: string;
  orderNumber: string;
};

async function getOrderNumbersByIds(
  pool: DbPool,
  userId: string,
  orderIds: string[],
): Promise<OrderNumberMapping[]> {
  if (orderIds.length === 0) return [];

  const placeholders = orderIds.map((_, i) => `$${i + 2}`).join(', ');
  const { rows } = await pool.query<{ id: string; order_number: string }>(
    `SELECT id, order_number FROM agents.order_records WHERE user_id = $1 AND id IN (${placeholders})`,
    [userId, ...orderIds],
  );
  return rows.map((r) => ({ id: r.id, orderNumber: r.order_number }));
}

async function getLastSalesForArticle(pool: DbPool, articleCode: string, userId: string): Promise<LastSaleEntry[]> {
  const { rows } = await pool.query<{
    order_id: string;
    order_number: string;
    customer_name: string;
    quantity: number;
    unit_price: number | null;
    discount_percent: number | null;
    order_discount_percent: string | null;
    line_amount: number | null;
    creation_date: string;
  }>(
    `SELECT a.order_id, o.order_number, o.customer_name, a.quantity, a.unit_price,
            COALESCE(a.discount_percent, 0) AS discount_percent,
            o.discount_percent AS order_discount_percent,
            a.line_amount, o.creation_date
     FROM agents.order_articles a
     JOIN agents.order_records o ON a.order_id = o.id AND a.user_id = o.user_id
     WHERE a.article_code = $1
       AND o.user_id = $2
       AND o.total_amount NOT LIKE '-%'
       AND NOT EXISTS (
         SELECT 1 FROM agents.order_records cn
         WHERE cn.user_id = o.user_id
           AND cn.customer_name = o.customer_name
           AND cn.total_amount LIKE '-%'
           AND ABS(
             CASE WHEN cn.total_amount ~ '^-?[0-9.,]+ ?€?$'
               THEN CAST(REPLACE(REPLACE(REPLACE(cn.total_amount, '.', ''), ',', '.'), ' €', '') AS NUMERIC)
               ELSE 0 END
             + CASE WHEN o.total_amount ~ '^-?[0-9.,]+ ?€?$'
               THEN CAST(REPLACE(REPLACE(REPLACE(o.total_amount, '.', ''), ',', '.'), ' €', '') AS NUMERIC)
               ELSE 0 END
           ) < 1.0
           AND cn.creation_date >= o.creation_date
       )
     ORDER BY o.creation_date DESC
     LIMIT 20`,
    [articleCode, userId],
  );
  return rows.map((r) => ({
    orderId: r.order_id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    discountPercent: r.discount_percent ?? 0,
    orderDiscountPercent: r.order_discount_percent ? parseFloat(r.order_discount_percent) : 0,
    lineAmount: r.line_amount,
    date: r.creation_date,
  }));
}

async function deleteOrdersNotInList(
  pool: DbPool,
  userId: string,
  validOrderIds: string[],
): Promise<number> {
  if (validOrderIds.length === 0) return 0;

  const placeholders = validOrderIds.map((_, i) => `$${i + 2}`).join(', ');

  const { rows: staleRows } = await pool.query<{ id: string }>(
    `SELECT id FROM agents.order_records WHERE user_id = $1 AND id NOT IN (${placeholders})`,
    [userId, ...validOrderIds],
  );

  if (staleRows.length === 0) return 0;

  const staleIds = staleRows.map((r) => r.id);
  const stalePlaceholders = staleIds.map((_, i) => `$${i + 2}`).join(', ');

  await pool.query(
    `DELETE FROM agents.order_articles WHERE user_id = $1 AND order_id IN (${stalePlaceholders})`,
    [userId, ...staleIds],
  );
  await pool.query(
    `DELETE FROM agents.order_state_history WHERE user_id = $1 AND order_id IN (${stalePlaceholders})`,
    [userId, ...staleIds],
  );

  const deleteOrderPlaceholders = staleIds.map((_, i) => `$${i + 2}`).join(', ');
  const { rowCount } = await pool.query(
    `DELETE FROM agents.order_records WHERE user_id = $1 AND id IN (${deleteOrderPlaceholders})`,
    [userId, ...staleIds],
  );

  return rowCount ?? 0;
}

type CustomerHistoryItem = {
  articleCode: string;
  productName: string;
  description: string;
  quantity: number;
  price: number;
  discount: number;
  vat: number;
};

type CustomerHistoryOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  createdAt: string;
  discountPercent?: number;
  items: CustomerHistoryItem[];
};

async function getOrdersNeedingArticleSync(
  pool: DbPool,
  userId: string,
  limit: number,
): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM agents.order_records
     WHERE user_id = $1
       AND order_number NOT LIKE 'NC/%'
       AND order_type != 'Warehouse'
       AND (
         articles_synced_at IS NULL
         OR (
           current_state NOT IN ('consegnato', 'fatturato', 'pagamento_scaduto', 'pagato')
           AND articles_synced_at::timestamptz < NOW() - INTERVAL '1 day'
         )
         OR articles_synced_at::timestamptz < NOW() - INTERVAL '7 days'
       )
     ORDER BY articles_synced_at NULLS FIRST, creation_date DESC
     LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => r.id);
}

async function resetArticlesSyncedAt(
  pool: DbPool,
  userId: string,
  orderId: string,
): Promise<void> {
  await pool.query(
    'UPDATE agents.order_records SET articles_synced_at = NULL WHERE id = $1 AND user_id = $2',
    [orderId, userId],
  );
}

async function getOrderHistoryByCustomer(
  pool: DbPool,
  userId: string,
  customerName: string,
): Promise<CustomerHistoryOrder[]> {
  const { rows } = await pool.query<{
    id: string;
    order_number: string;
    customer_name: string;
    creation_date: string;
    order_discount_percent: string | null;
    article_code: string;
    article_description: string | null;
    quantity: number;
    unit_price: number | null;
    discount_percent: number | null;
    vat_percent: number | null;
  }>(
    `SELECT o.id, o.order_number, o.customer_name, o.creation_date,
            o.discount_percent AS order_discount_percent,
            a.article_code, a.article_description, a.quantity, a.unit_price,
            a.discount_percent,
            COALESCE(p.vat, NULLIF(a.vat_percent, 0), 0) AS vat_percent
     FROM agents.order_records o
     JOIN agents.order_articles a ON a.order_id = o.id AND a.user_id = o.user_id
     LEFT JOIN LATERAL (
       SELECT vat FROM shared.products
       WHERE name = a.article_code AND deleted_at IS NULL AND vat IS NOT NULL
       LIMIT 1
     ) p ON TRUE
     WHERE o.user_id = $1 AND LOWER(o.customer_name) = LOWER($2)
       AND o.total_amount NOT LIKE '-%'
       AND NOT EXISTS (
         SELECT 1 FROM agents.order_records cn
         WHERE cn.user_id = o.user_id
           AND cn.customer_name = o.customer_name
           AND cn.total_amount LIKE '-%'
           AND ABS(
             CASE WHEN cn.total_amount ~ '^-?[0-9.,]+ ?€?$'
               THEN CAST(REPLACE(REPLACE(REPLACE(cn.total_amount, '.', ''), ',', '.'), ' €', '') AS NUMERIC)
               ELSE 0 END
             + CASE WHEN o.total_amount ~ '^-?[0-9.,]+ ?€?$'
               THEN CAST(REPLACE(REPLACE(REPLACE(o.total_amount, '.', ''), ',', '.'), ' €', '') AS NUMERIC)
               ELSE 0 END
           ) < 1.0
           AND cn.creation_date >= o.creation_date
       )
     ORDER BY o.creation_date DESC`,
    [userId, customerName],
  );

  const ordersMap = new Map<string, CustomerHistoryOrder>();
  for (const row of rows) {
    let order = ordersMap.get(row.id);
    if (!order) {
      order = {
        id: row.id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        createdAt: row.creation_date,
        ...(row.order_discount_percent ? { discountPercent: parseFloat(row.order_discount_percent) } : {}),
        items: [],
      };
      ordersMap.set(row.id, order);
    }
    order.items.push({
      articleCode: row.article_code,
      productName: row.article_code,
      description: row.article_description ?? '',
      quantity: row.quantity,
      price: row.unit_price ?? 0,
      discount: row.discount_percent ?? 0,
      vat: row.vat_percent ?? 0,
    });
  }

  return Array.from(ordersMap.values());
}

type WarehousePickupArticle = {
  id: string;
  articleCode: string;
  articleDescription: string | null;
  quantity: number;
  boxName: string;
  status: 'venduto' | 'riservato' | 'ghost';
  subClientName: string | null;
  isGhost: boolean;
};

type WarehousePickupOrder = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  creationDate: string;
  articles: WarehousePickupArticle[];
};

type WarehousePickupRow = {
  order_id: string;
  order_number: string;
  customer_name: string;
  creation_date: string;
  item_id: string;
  article_code: string;
  article_description: string | null;
  quantity: number;
  box_name: string;
  status: 'venduto' | 'riservato' | 'ghost';
  sub_client_name: string | null;
  is_ghost: boolean;
};

async function getWarehousePickupsByDate(
  pool: DbPool,
  userId: string,
  date: string,
): Promise<WarehousePickupOrder[]> {
  const { rows } = await pool.query<WarehousePickupRow>(
    `SELECT
       COALESCE(wi.sold_in_order, wi.reserved_for_order) AS order_id,
       COALESCE(o.order_number, wi.order_number)         AS order_number,
       COALESCE(o.customer_name, wi.customer_name)       AS customer_name,
       COALESCE(o.creation_date, wi.order_date)          AS creation_date,
       'wh-' || wi.id::text                              AS item_id,
       wi.article_code,
       wi.description AS article_description,
       wi.quantity,
       wi.box_name,
       CASE WHEN wi.sold_in_order IS NOT NULL THEN 'venduto' ELSE 'riservato' END AS status,
       wi.sub_client_name,
       FALSE AS is_ghost
     FROM agents.warehouse_items wi
     LEFT JOIN agents.order_records o
       ON o.id = COALESCE(wi.sold_in_order, wi.reserved_for_order)
       AND o.user_id = wi.user_id
     WHERE wi.user_id = $1
       AND (wi.sold_in_order IS NOT NULL OR wi.reserved_for_order IS NOT NULL)
       AND DATE(wi.order_date) = $2::date

     UNION ALL

     SELECT
       po.id                                                                   AS order_id,
       'ghost-' || po.id                                                       AS order_number,
       po.customer_name                                                        AS customer_name,
       to_timestamp(po.created_at / 1000.0)::text                             AS creation_date,
       'gh-' || po.id || '-' || (item->>'articleCode')                        AS item_id,
       item->>'articleCode'                                                    AS article_code,
       COALESCE(item->>'description', item->>'productName')                   AS article_description,
       (item->>'quantity')::int                                                AS quantity,
       'ghost'                                                                 AS box_name,
       'ghost'                                                                 AS status,
       po.sub_client_name                                                      AS sub_client_name,
       TRUE                                                                    AS is_ghost
     FROM agents.pending_orders po,
          jsonb_array_elements(po.items_json) AS item
     WHERE po.user_id = $1
       AND (item->>'isGhostArticle')::boolean IS TRUE
       AND po.status IN ('pending', 'syncing', 'error')
       AND DATE(to_timestamp(po.created_at / 1000.0) AT TIME ZONE 'Europe/Rome') = $2::date

     ORDER BY creation_date ASC, order_number ASC, item_id ASC`,
    [userId, date],
  );

  const ordersMap = new Map<string, WarehousePickupOrder>();
  for (const row of rows) {
    let order = ordersMap.get(row.order_id);
    if (!order) {
      order = {
        orderId: row.order_id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        creationDate: row.creation_date,
        articles: [],
      };
      ordersMap.set(row.order_id, order);
    }
    order.articles.push({
      id: row.item_id,
      articleCode: row.article_code,
      articleDescription: row.article_description,
      quantity: row.quantity,
      boxName: row.box_name,
      status: row.status,
      subClientName: row.sub_client_name,
      isGhost: row.is_ghost,
    });
  }

  return Array.from(ordersMap.values());
}

const KT_ELIGIBLE_CUTOFF_DATE = '2026-03-09';

type KtEligibleOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerAccountNum: string | null;
  creationDate: string;
  discountPercent: number | null;
  notes: string | null;
  articlesSyncedAt: string | null;
};

async function getKtEligibleOrders(pool: DbPool, userId: string): Promise<KtEligibleOrder[]> {
  const { rows } = await pool.query<{
    id: string;
    order_number: string;
    customer_name: string;
    customer_account_num: string | null;
    creation_date: string;
    discount_percent: string | null;
    order_description: string | null;
    articles_synced_at: string | null;
  }>(
    `SELECT o.id, o.order_number, o.customer_name, o.customer_account_num,
            o.creation_date, o.discount_percent, o.order_description,
            o.articles_synced_at
     FROM agents.order_records o
     WHERE o.user_id = $1
       AND o.sent_to_verona_at >= $2
       AND o.arca_kt_synced_at IS NULL
       AND o.customer_name != 'Fresis Soc Cooperativa'
     ORDER BY o.creation_date ASC`,
    [userId, KT_ELIGIBLE_CUTOFF_DATE],
  );

  return rows.map((r) => ({
    id: r.id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    customerAccountNum: r.customer_account_num,
    creationDate: r.creation_date,
    discountPercent: r.discount_percent != null ? parseFloat(r.discount_percent) : null,
    notes: r.order_description,
    articlesSyncedAt: r.articles_synced_at,
  }));
}

export {
  getOrderById,
  getOrderByNumber,
  getOrdersByUser,
  countOrders,
  upsertOrder,
  deleteOrderById,
  getOrderArticles,
  saveOrderArticles,
  deleteOrderArticles,
  updateOrderState,
  getStateHistory,
  deleteOrdersNotInList,
  getLastSalesForArticle,
  getOrderNumbersByIds,
  getOrderHistoryByCustomer,
  getOrdersNeedingArticleSync,
  resetArticlesSyncedAt,
  getWarehousePickupsByDate,
  mapRowToOrder,
  mapRowToArticle,
  mapRowToStateHistory,
  computeHash,
  buildFilterClause,
  type OrderRow,
  type Order,
  type OrderInput,
  type UpsertResult,
  type OrderFilterOptions,
  type OrderArticleRow,
  type OrderArticle,
  type OrderArticleInput,
  type StateHistoryRow,
  type StateHistory,
  type LastSaleEntry,
  type OrderNumberMapping,
  type CustomerHistoryOrder,
  type CustomerHistoryItem,
  type WarehousePickupArticle,
  type WarehousePickupOrder,
  getKtEligibleOrders,
  type KtEligibleOrder,
};

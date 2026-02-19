import crypto from 'crypto';
import type { DbPool } from '../pool';

type OrderRow = {
  id: string;
  user_id: string;
  order_number: string;
  customer_profile_id: string | null;
  customer_name: string;
  delivery_name: string | null;
  delivery_address: string | null;
  creation_date: string;
  delivery_date: string | null;
  remaining_sales_financial: string | null;
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
  ddt_total: string | null;
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
  sent_to_milano_at: string | null;
  archibald_order_id: string | null;
  total_vat_amount: string | null;
  total_with_vat: string | null;
  articles_synced_at: string | null;
  shipping_cost: number | null;
  shipping_tax: number | null;
};

type Order = {
  id: string;
  userId: string;
  orderNumber: string;
  customerProfileId: string | null;
  customerName: string;
  deliveryName: string | null;
  deliveryAddress: string | null;
  creationDate: string;
  deliveryDate: string | null;
  remainingSalesFinancial: string | null;
  customerReference: string | null;
  salesStatus: string | null;
  orderType: string | null;
  documentStatus: string | null;
  salesOrigin: string | null;
  transferStatus: string | null;
  transferDate: string | null;
  completionDate: string | null;
  discountPercent: string | null;
  grossAmount: string | null;
  totalAmount: string | null;
  isQuote: string | null;
  isGiftOrder: string | null;
  hash: string;
  lastSync: number;
  createdAt: string;
  ddtNumber: string | null;
  ddtDeliveryDate: string | null;
  ddtId: string | null;
  ddtCustomerAccount: string | null;
  ddtSalesName: string | null;
  ddtDeliveryName: string | null;
  deliveryTerms: string | null;
  deliveryMethod: string | null;
  deliveryCity: string | null;
  attentionTo: string | null;
  ddtDeliveryAddress: string | null;
  ddtTotal: string | null;
  ddtCustomerReference: string | null;
  ddtDescription: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingCourier: string | null;
  deliveryCompletedDate: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceAmount: string | null;
  invoiceCustomerAccount: string | null;
  invoiceBillingName: string | null;
  invoiceQuantity: number | null;
  invoiceRemainingAmount: string | null;
  invoiceTaxAmount: string | null;
  invoiceLineDiscount: string | null;
  invoiceTotalDiscount: string | null;
  invoiceDueDate: string | null;
  invoicePaymentTermsId: string | null;
  invoicePurchaseOrder: string | null;
  invoiceClosed: boolean | null;
  invoiceDaysPastDue: string | null;
  invoiceSettledAmount: string | null;
  invoiceLastPaymentId: string | null;
  invoiceLastSettlementDate: string | null;
  invoiceClosedDate: string | null;
  currentState: string | null;
  sentToMilanoAt: string | null;
  archibaldOrderId: string | null;
  totalVatAmount: string | null;
  totalWithVat: string | null;
  articlesSyncedAt: string | null;
  shippingCost: number | null;
  shippingTax: number | null;
};

type OrderInput = {
  id: string;
  orderNumber: string;
  customerProfileId: string | null;
  customerName: string;
  deliveryName: string | null;
  deliveryAddress: string | null;
  creationDate: string;
  deliveryDate: string | null;
  remainingSalesFinancial: string | null;
  customerReference: string | null;
  salesStatus: string | null;
  orderType: string | null;
  documentStatus: string | null;
  salesOrigin: string | null;
  transferStatus: string | null;
  transferDate: string | null;
  completionDate: string | null;
  discountPercent: string | null;
  grossAmount: string | null;
  totalAmount: string | null;
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

type DDTData = {
  ddtNumber: string;
  ddtDeliveryDate?: string | null;
  ddtId?: string | null;
  ddtCustomerAccount?: string | null;
  ddtSalesName?: string | null;
  ddtDeliveryName?: string | null;
  deliveryTerms?: string | null;
  deliveryMethod?: string | null;
  deliveryCity?: string | null;
  attentionTo?: string | null;
  ddtDeliveryAddress?: string | null;
  ddtTotal?: string | null;
  ddtCustomerReference?: string | null;
  ddtDescription?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  trackingCourier?: string | null;
};

type InvoiceData = {
  invoiceNumber: string;
  invoiceDate?: string | null;
  invoiceAmount?: string | null;
  invoiceCustomerAccount?: string | null;
  invoiceBillingName?: string | null;
  invoiceQuantity?: number | null;
  invoiceRemainingAmount?: string | null;
  invoiceTaxAmount?: string | null;
  invoiceLineDiscount?: string | null;
  invoiceTotalDiscount?: string | null;
  invoiceDueDate?: string | null;
  invoicePaymentTermsId?: string | null;
  invoicePurchaseOrder?: string | null;
  invoiceClosed?: boolean | null;
  invoiceDaysPastDue?: string | null;
  invoiceSettledAmount?: string | null;
  invoiceLastPaymentId?: string | null;
  invoiceLastSettlementDate?: string | null;
  invoiceClosedDate?: string | null;
};

function mapRowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    orderNumber: row.order_number,
    customerProfileId: row.customer_profile_id,
    customerName: row.customer_name,
    deliveryName: row.delivery_name,
    deliveryAddress: row.delivery_address,
    creationDate: row.creation_date,
    deliveryDate: row.delivery_date,
    remainingSalesFinancial: row.remaining_sales_financial,
    customerReference: row.customer_reference,
    salesStatus: row.sales_status,
    orderType: row.order_type,
    documentStatus: row.document_status,
    salesOrigin: row.sales_origin,
    transferStatus: row.transfer_status,
    transferDate: row.transfer_date,
    completionDate: row.completion_date,
    discountPercent: row.discount_percent,
    grossAmount: row.gross_amount,
    totalAmount: row.total_amount,
    isQuote: row.is_quote ?? null,
    isGiftOrder: row.is_gift_order ?? null,
    hash: row.hash,
    lastSync: row.last_sync,
    createdAt: row.created_at,
    ddtNumber: row.ddt_number,
    ddtDeliveryDate: row.ddt_delivery_date,
    ddtId: row.ddt_id,
    ddtCustomerAccount: row.ddt_customer_account,
    ddtSalesName: row.ddt_sales_name,
    ddtDeliveryName: row.ddt_delivery_name,
    deliveryTerms: row.delivery_terms,
    deliveryMethod: row.delivery_method,
    deliveryCity: row.delivery_city,
    attentionTo: row.attention_to,
    ddtDeliveryAddress: row.ddt_delivery_address,
    ddtTotal: row.ddt_total,
    ddtCustomerReference: row.ddt_customer_reference,
    ddtDescription: row.ddt_description,
    trackingNumber: row.tracking_number,
    trackingUrl: row.tracking_url,
    trackingCourier: row.tracking_courier,
    deliveryCompletedDate: row.delivery_completed_date,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    invoiceAmount: row.invoice_amount,
    invoiceCustomerAccount: row.invoice_customer_account,
    invoiceBillingName: row.invoice_billing_name,
    invoiceQuantity: row.invoice_quantity,
    invoiceRemainingAmount: row.invoice_remaining_amount,
    invoiceTaxAmount: row.invoice_tax_amount,
    invoiceLineDiscount: row.invoice_line_discount,
    invoiceTotalDiscount: row.invoice_total_discount,
    invoiceDueDate: row.invoice_due_date,
    invoicePaymentTermsId: row.invoice_payment_terms_id,
    invoicePurchaseOrder: row.invoice_purchase_order,
    invoiceClosed: row.invoice_closed ?? null,
    invoiceDaysPastDue: row.invoice_days_past_due,
    invoiceSettledAmount: row.invoice_settled_amount,
    invoiceLastPaymentId: row.invoice_last_payment_id,
    invoiceLastSettlementDate: row.invoice_last_settlement_date,
    invoiceClosedDate: row.invoice_closed_date,
    currentState: row.current_state,
    sentToMilanoAt: row.sent_to_milano_at,
    archibaldOrderId: row.archibald_order_id,
    totalVatAmount: row.total_vat_amount,
    totalWithVat: row.total_with_vat,
    articlesSyncedAt: row.articles_synced_at,
    shippingCost: row.shipping_cost,
    shippingTax: row.shipping_tax,
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
    order.salesStatus,
    order.documentStatus,
    order.transferStatus,
    order.totalAmount,
  ].join('|');
  return crypto.createHash('md5').update(hashInput).digest('hex');
}

async function getOrderById(pool: DbPool, userId: string, orderId: string): Promise<Order | null> {
  const { rows: [order] } = await pool.query<OrderRow>(
    'SELECT * FROM agents.order_records WHERE id = $1 AND user_id = $2',
    [orderId, userId],
  );
  return order ? mapRowToOrder(order) : null;
}

async function getOrderByNumber(pool: DbPool, userId: string, orderNumber: string): Promise<Order | null> {
  const { rows: [order] } = await pool.query<OrderRow>(
    'SELECT * FROM agents.order_records WHERE order_number = $1 AND user_id = $2',
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
      order_number ILIKE $${paramIndex} OR
      customer_name ILIKE $${paramIndex} OR
      total_amount ILIKE $${paramIndex} OR
      gross_amount ILIKE $${paramIndex} OR
      tracking_number ILIKE $${paramIndex} OR
      ddt_number ILIKE $${paramIndex} OR
      invoice_number ILIKE $${paramIndex} OR
      delivery_address ILIKE $${paramIndex} OR
      customer_reference ILIKE $${paramIndex}
    )`);
    params.push(searchParam);
    paramIndex++;
  }

  if (options?.customer) {
    conditions.push(`customer_name ILIKE $${paramIndex}`);
    params.push(`%${options.customer}%`);
    paramIndex++;
  }

  if (options?.status) {
    conditions.push(`sales_status = $${paramIndex}`);
    params.push(options.status);
    paramIndex++;
  }

  if (options?.dateFrom) {
    conditions.push(`creation_date >= $${paramIndex}`);
    params.push(options.dateFrom);
    paramIndex++;
  }

  if (options?.dateTo) {
    conditions.push(`creation_date <= $${paramIndex}`);
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
    `SELECT * FROM agents.order_records WHERE user_id = $1${clause} ORDER BY creation_date DESC LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
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
    `SELECT COUNT(*) as count FROM agents.order_records WHERE user_id = $1${clause}`,
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
        id, user_id, order_number, customer_profile_id, customer_name,
        delivery_name, delivery_address, creation_date, delivery_date,
        remaining_sales_financial, customer_reference, sales_status,
        order_type, document_status, sales_origin, transfer_status,
        transfer_date, completion_date, discount_percent, gross_amount,
        total_amount, is_quote, is_gift_order, hash, last_sync, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
      [
        order.id, userId, order.orderNumber, order.customerProfileId, order.customerName,
        order.deliveryName, order.deliveryAddress, order.creationDate, order.deliveryDate,
        order.remainingSalesFinancial, order.customerReference, order.salesStatus,
        order.orderType, order.documentStatus, order.salesOrigin, order.transferStatus,
        order.transferDate, order.completionDate, order.discountPercent, order.grossAmount,
        order.totalAmount, order.isQuote ?? null, order.isGiftOrder ?? null,
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
      order_number = $1, customer_profile_id = $2, customer_name = $3, delivery_name = $4,
      delivery_address = $5, creation_date = $6, delivery_date = $7,
      remaining_sales_financial = $8, customer_reference = $9, sales_status = $10,
      order_type = $11, document_status = $12, sales_origin = $13, transfer_status = $14,
      transfer_date = $15, completion_date = $16, discount_percent = $17,
      gross_amount = $18, total_amount = $19, is_quote = $20, is_gift_order = $21,
      hash = $22, last_sync = $23
    WHERE id = $24 AND user_id = $25`,
    [
      order.orderNumber, order.customerProfileId, order.customerName, order.deliveryName,
      order.deliveryAddress, order.creationDate, order.deliveryDate,
      order.remainingSalesFinancial, order.customerReference, order.salesStatus,
      order.orderType, order.documentStatus, order.salesOrigin, order.transferStatus,
      order.transferDate, order.completionDate, order.discountPercent,
      order.grossAmount, order.totalAmount, order.isQuote ?? null, order.isGiftOrder ?? null,
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

async function updateOrderDDT(
  pool: DbPool,
  userId: string,
  orderId: string,
  ddtData: DDTData,
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);

  const { rowCount } = await pool.query(
    `UPDATE agents.order_records SET
      ddt_number = $1, ddt_delivery_date = $2, ddt_id = $3, ddt_customer_account = $4,
      ddt_sales_name = $5, ddt_delivery_name = $6, delivery_terms = $7, delivery_method = $8,
      delivery_city = $9, attention_to = $10, ddt_delivery_address = $11, ddt_total = $12,
      ddt_customer_reference = $13, ddt_description = $14, tracking_number = $15,
      tracking_url = $16, tracking_courier = $17, last_sync = $18
    WHERE id = $19 AND user_id = $20`,
    [
      ddtData.ddtNumber, ddtData.ddtDeliveryDate ?? null, ddtData.ddtId ?? null,
      ddtData.ddtCustomerAccount ?? null, ddtData.ddtSalesName ?? null,
      ddtData.ddtDeliveryName ?? null, ddtData.deliveryTerms ?? null,
      ddtData.deliveryMethod ?? null, ddtData.deliveryCity ?? null,
      ddtData.attentionTo ?? null, ddtData.ddtDeliveryAddress ?? null,
      ddtData.ddtTotal ?? null, ddtData.ddtCustomerReference ?? null,
      ddtData.ddtDescription ?? null, ddtData.trackingNumber ?? null,
      ddtData.trackingUrl ?? null, ddtData.trackingCourier ?? null,
      now, orderId, userId,
    ],
  );

  return rowCount ?? 0;
}

async function updateInvoiceData(
  pool: DbPool,
  userId: string,
  orderId: string,
  invoiceData: InvoiceData,
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);

  const { rowCount } = await pool.query(
    `UPDATE agents.order_records SET
      invoice_number = $1, invoice_date = $2, invoice_amount = $3,
      invoice_customer_account = $4, invoice_billing_name = $5, invoice_quantity = $6,
      invoice_remaining_amount = $7, invoice_tax_amount = $8, invoice_line_discount = $9,
      invoice_total_discount = $10, invoice_due_date = $11, invoice_payment_terms_id = $12,
      invoice_purchase_order = $13, invoice_closed = $14, invoice_days_past_due = $15,
      invoice_settled_amount = $16, invoice_last_payment_id = $17,
      invoice_last_settlement_date = $18, invoice_closed_date = $19, last_sync = $20
    WHERE id = $21 AND user_id = $22`,
    [
      invoiceData.invoiceNumber, invoiceData.invoiceDate ?? null,
      invoiceData.invoiceAmount ?? null, invoiceData.invoiceCustomerAccount ?? null,
      invoiceData.invoiceBillingName ?? null, invoiceData.invoiceQuantity ?? null,
      invoiceData.invoiceRemainingAmount ?? null, invoiceData.invoiceTaxAmount ?? null,
      invoiceData.invoiceLineDiscount ?? null, invoiceData.invoiceTotalDiscount ?? null,
      invoiceData.invoiceDueDate ?? null, invoiceData.invoicePaymentTermsId ?? null,
      invoiceData.invoicePurchaseOrder ?? null, invoiceData.invoiceClosed ?? null,
      invoiceData.invoiceDaysPastDue ?? null, invoiceData.invoiceSettledAmount ?? null,
      invoiceData.invoiceLastPaymentId ?? null, invoiceData.invoiceLastSettlementDate ?? null,
      invoiceData.invoiceClosedDate ?? null, now,
      orderId, userId,
    ],
  );

  return rowCount ?? 0;
}

type LastSaleEntry = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  quantity: number;
  unitPrice: number | null;
  lineAmount: number | null;
  creationDate: string;
};

async function getLastSalesForArticle(pool: DbPool, articleCode: string): Promise<LastSaleEntry[]> {
  const { rows } = await pool.query<{
    order_id: string;
    order_number: string;
    customer_name: string;
    quantity: number;
    unit_price: number | null;
    line_amount: number | null;
    creation_date: string;
  }>(
    `SELECT a.order_id, o.order_number, o.customer_name, a.quantity, a.unit_price, a.line_amount, o.creation_date
     FROM agents.order_articles a
     JOIN agents.order_records o ON a.order_id = o.id AND a.user_id = o.user_id
     WHERE a.article_code = $1
     ORDER BY o.creation_date DESC
     LIMIT 20`,
    [articleCode],
  );
  return rows.map((r) => ({
    orderId: r.order_id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    lineAmount: r.line_amount,
    creationDate: r.creation_date,
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
  const stalePlaceholders = staleIds.map((_, i) => `$${i + 1}`).join(', ');

  await pool.query(
    `DELETE FROM agents.order_articles WHERE order_id IN (${stalePlaceholders})`,
    staleIds,
  );
  await pool.query(
    `DELETE FROM agents.order_state_history WHERE order_id IN (${stalePlaceholders})`,
    staleIds,
  );

  const deleteOrderPlaceholders = staleIds.map((_, i) => `$${i + 2}`).join(', ');
  const { rowCount } = await pool.query(
    `DELETE FROM agents.order_records WHERE user_id = $1 AND id IN (${deleteOrderPlaceholders})`,
    [userId, ...staleIds],
  );

  return rowCount ?? 0;
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
  updateOrderDDT,
  updateInvoiceData,
  deleteOrdersNotInList,
  getLastSalesForArticle,
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
  type DDTData,
  type InvoiceData,
  type LastSaleEntry,
};

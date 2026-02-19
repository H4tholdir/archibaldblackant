import type { DbPool } from '../pool';

type PendingOrderRow = {
  id: string;
  user_id: string;
  customer_id: string;
  customer_name: string;
  items_json: unknown;
  status: string;
  discount_percent: number | null;
  target_total_with_vat: number | null;
  retry_count: number;
  error_message: string | null;
  created_at: number;
  updated_at: number;
  device_id: string;
  origin_draft_id: string | null;
  synced_to_archibald: boolean;
  shipping_cost: number;
  shipping_tax: number;
  sub_client_codice: string | null;
  sub_client_name: string | null;
  sub_client_data_json: unknown | null;
};

type PendingOrder = {
  id: string;
  userId: string;
  customerId: string;
  customerName: string;
  itemsJson: unknown;
  status: string;
  discountPercent: number | null;
  targetTotalWithVat: number | null;
  retryCount: number;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
  deviceId: string;
  originDraftId: string | null;
  syncedToArchibald: boolean;
  shippingCost: number;
  shippingTax: number;
  subClientCodice: string | null;
  subClientName: string | null;
  subClientDataJson: unknown | null;
};

type PendingOrderInput = {
  id: string;
  customerId: string;
  customerName: string;
  itemsJson: unknown;
  status?: string;
  discountPercent?: number | null;
  targetTotalWithVat?: number | null;
  deviceId: string;
  originDraftId?: string | null;
  shippingCost?: number;
  shippingTax?: number;
  subClientCodice?: string | null;
  subClientName?: string | null;
  subClientDataJson?: unknown | null;
  idempotencyKey?: string | null;
};

type UpsertResult = {
  id: string;
  action: 'created' | 'updated';
  serverUpdatedAt: number;
};

function mapRowToPendingOrder(row: PendingOrderRow): PendingOrder {
  return {
    id: row.id,
    userId: row.user_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    itemsJson: row.items_json,
    status: row.status,
    discountPercent: row.discount_percent,
    targetTotalWithVat: row.target_total_with_vat,
    retryCount: row.retry_count,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deviceId: row.device_id,
    originDraftId: row.origin_draft_id,
    syncedToArchibald: row.synced_to_archibald,
    shippingCost: row.shipping_cost,
    shippingTax: row.shipping_tax,
    subClientCodice: row.sub_client_codice,
    subClientName: row.sub_client_name,
    subClientDataJson: row.sub_client_data_json,
  };
}

async function getPendingOrders(pool: DbPool, userId: string): Promise<PendingOrder[]> {
  const { rows } = await pool.query<PendingOrderRow>(
    'SELECT * FROM agents.pending_orders WHERE user_id = $1 ORDER BY updated_at DESC',
    [userId],
  );
  return rows.map(mapRowToPendingOrder);
}

async function upsertPendingOrder(
  pool: DbPool,
  userId: string,
  order: PendingOrderInput,
): Promise<UpsertResult> {
  const now = Date.now();

  const { rows: [existing] } = await pool.query<{ id: string }>(
    'SELECT id FROM agents.pending_orders WHERE id = $1 AND user_id = $2',
    [order.id, userId],
  );

  const action: 'created' | 'updated' = existing ? 'updated' : 'created';

  await pool.query(
    `INSERT INTO agents.pending_orders (
      id, user_id, customer_id, customer_name, items_json, status,
      discount_percent, target_total_with_vat, device_id, origin_draft_id,
      shipping_cost, shipping_tax, sub_client_codice, sub_client_name,
      sub_client_data_json, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (id) DO UPDATE SET
      customer_id = EXCLUDED.customer_id,
      customer_name = EXCLUDED.customer_name,
      items_json = EXCLUDED.items_json,
      status = EXCLUDED.status,
      discount_percent = EXCLUDED.discount_percent,
      target_total_with_vat = EXCLUDED.target_total_with_vat,
      device_id = EXCLUDED.device_id,
      shipping_cost = EXCLUDED.shipping_cost,
      shipping_tax = EXCLUDED.shipping_tax,
      sub_client_codice = EXCLUDED.sub_client_codice,
      sub_client_name = EXCLUDED.sub_client_name,
      sub_client_data_json = EXCLUDED.sub_client_data_json,
      updated_at = EXCLUDED.updated_at,
      origin_draft_id = EXCLUDED.origin_draft_id`,
    [
      order.id, userId, order.customerId, order.customerName,
      JSON.stringify(order.itemsJson), order.status ?? 'pending',
      order.discountPercent ?? null, order.targetTotalWithVat ?? null,
      order.deviceId, order.originDraftId ?? null,
      order.shippingCost ?? 0, order.shippingTax ?? 0,
      order.subClientCodice ?? null, order.subClientName ?? null,
      order.subClientDataJson ? JSON.stringify(order.subClientDataJson) : null,
      now, now,
    ],
  );

  return { id: order.id, action, serverUpdatedAt: now };
}

async function deletePendingOrder(pool: DbPool, userId: string, orderId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM agents.pending_orders WHERE id = $1 AND user_id = $2',
    [orderId, userId],
  );
  return (rowCount ?? 0) > 0;
}

export {
  getPendingOrders,
  upsertPendingOrder,
  deletePendingOrder,
  mapRowToPendingOrder,
  type PendingOrderRow,
  type PendingOrder,
  type PendingOrderInput,
  type UpsertResult,
};

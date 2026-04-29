import type { DbPool } from '../pool';

type OrderDdtInput = {
  orderId: string;
  userId: string;
  ddtNumber: string;
  ddtId: string | null;
  ddtDeliveryDate: string | null;
  ddtCustomerAccount: string | null;
  ddtSalesName: string | null;
  ddtDeliveryName: string | null;
  deliveryTerms: string | null;
  deliveryMethod: string | null;
  deliveryCity: string | null;
  attentionTo: string | null;
  ddtDeliveryAddress: string | null;
  ddtQuantity: string | null;
  ddtCustomerReference: string | null;
  ddtDescription: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingCourier: string | null;
};

type DdtTrackingUpdate = {
  trackingStatus: string;
  trackingKeyStatusCd: string;
  trackingStatusBarCd: string;
  trackingEstimatedDelivery: string;
  trackingLastLocation: string;
  trackingLastEvent: string;
  trackingLastEventAt: string;
  trackingOrigin: string;
  trackingDestination: string;
  trackingServiceDesc: string;
  deliveryConfirmedAt: string | null;
  deliverySignedBy: string | null;
  trackingEvents: unknown;
  trackingSyncFailures: number;
  trackingDelayReason: string | null;
  trackingDeliveryAttempts: number | null;
  trackingAttemptedDeliveryAt: string | null;
};

type DdtRow = {
  id: string;
  order_id: string;
  user_id: string;
  position: number;
  ddt_number: string;
  ddt_id: string | null;
  ddt_delivery_date: string | null;
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
  tracking_status: string | null;
  tracking_key_status_cd: string | null;
  tracking_status_bar_cd: string | null;
  tracking_estimated_delivery: string | null;
  tracking_last_location: string | null;
  tracking_last_event: string | null;
  tracking_last_event_at: string | null;
  tracking_origin: string | null;
  tracking_destination: string | null;
  tracking_service_desc: string | null;
  tracking_last_synced_at: string | null;
  tracking_sync_failures: number | null;
  tracking_events: unknown;
  tracking_delay_reason: string | null;
  tracking_delivery_attempts: number | null;
  tracking_attempted_delivery_at: string | null;
  delivery_confirmed_at: string | null;
  delivery_signed_by: string | null;
};

type DdtEntry = {
  id: string;
  orderId: string;
  position: number;
  ddtNumber: string;
  ddtId: string | null;
  ddtDeliveryDate: string | null;
  ddtCustomerAccount: string | null;
  ddtSalesName: string | null;
  ddtDeliveryName: string | null;
  deliveryTerms: string | null;
  deliveryMethod: string | null;
  deliveryCity: string | null;
  attentionTo: string | null;
  ddtDeliveryAddress: string | null;
  ddtQuantity: string | null;
  ddtCustomerReference: string | null;
  ddtDescription: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingCourier: string | null;
  trackingStatus: string | null;
  trackingKeyStatusCd: string | null;
  trackingStatusBarCd: string | null;
  trackingEstimatedDelivery: string | null;
  trackingLastLocation: string | null;
  trackingLastEvent: string | null;
  trackingLastEventAt: string | null;
  trackingOrigin: string | null;
  trackingDestination: string | null;
  trackingServiceDesc: string | null;
  trackingLastSyncedAt: string | null;
  trackingSyncFailures: number | null;
  trackingEvents: unknown;
  trackingDelayReason: string | null;
  trackingDeliveryAttempts: number | null;
  trackingAttemptedDeliveryAt: string | null;
  deliveryConfirmedAt: string | null;
  deliverySignedBy: string | null;
};

function mapRowToDdtEntry(row: DdtRow): DdtEntry {
  return {
    id: row.id,
    orderId: row.order_id,
    position: row.position,
    ddtNumber: row.ddt_number,
    ddtId: row.ddt_id,
    ddtDeliveryDate: row.ddt_delivery_date,
    ddtCustomerAccount: row.ddt_customer_account,
    ddtSalesName: row.ddt_sales_name,
    ddtDeliveryName: row.ddt_delivery_name,
    deliveryTerms: row.delivery_terms,
    deliveryMethod: row.delivery_method,
    deliveryCity: row.delivery_city,
    attentionTo: row.attention_to,
    ddtDeliveryAddress: row.ddt_delivery_address,
    ddtQuantity: row.ddt_quantity,
    ddtCustomerReference: row.ddt_customer_reference,
    ddtDescription: row.ddt_description,
    trackingNumber: row.tracking_number,
    trackingUrl: row.tracking_url,
    trackingCourier: row.tracking_courier,
    trackingStatus: row.tracking_status,
    trackingKeyStatusCd: row.tracking_key_status_cd,
    trackingStatusBarCd: row.tracking_status_bar_cd,
    trackingEstimatedDelivery: row.tracking_estimated_delivery,
    trackingLastLocation: row.tracking_last_location,
    trackingLastEvent: row.tracking_last_event,
    trackingLastEventAt: row.tracking_last_event_at,
    trackingOrigin: row.tracking_origin,
    trackingDestination: row.tracking_destination,
    trackingServiceDesc: row.tracking_service_desc,
    trackingLastSyncedAt: row.tracking_last_synced_at,
    trackingSyncFailures: row.tracking_sync_failures,
    trackingEvents: row.tracking_events,
    trackingDelayReason: row.tracking_delay_reason,
    trackingDeliveryAttempts: row.tracking_delivery_attempts,
    trackingAttemptedDeliveryAt: row.tracking_attempted_delivery_at,
    deliveryConfirmedAt: row.delivery_confirmed_at,
    deliverySignedBy: row.delivery_signed_by,
  };
}

async function upsertOrderDdt(pool: DbPool, input: OrderDdtInput): Promise<'inserted' | 'updated'> {
  const { rows: [row] } = await pool.query<{ is_insert: boolean }>(
    `INSERT INTO agents.order_ddts (
      order_id, user_id, ddt_number, ddt_id,
      ddt_delivery_date, ddt_customer_account, ddt_sales_name,
      ddt_delivery_name, delivery_terms, delivery_method,
      delivery_city, attention_to, ddt_delivery_address,
      ddt_quantity, ddt_customer_reference, ddt_description,
      tracking_number, tracking_url, tracking_courier, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
    ON CONFLICT (order_id, user_id, ddt_number) DO UPDATE SET
      ddt_id = EXCLUDED.ddt_id,
      ddt_delivery_date = EXCLUDED.ddt_delivery_date,
      ddt_customer_account = EXCLUDED.ddt_customer_account,
      ddt_sales_name = EXCLUDED.ddt_sales_name,
      ddt_delivery_name = EXCLUDED.ddt_delivery_name,
      delivery_terms = EXCLUDED.delivery_terms,
      delivery_method = EXCLUDED.delivery_method,
      delivery_city = EXCLUDED.delivery_city,
      attention_to = EXCLUDED.attention_to,
      ddt_delivery_address = EXCLUDED.ddt_delivery_address,
      ddt_quantity = EXCLUDED.ddt_quantity,
      ddt_customer_reference = EXCLUDED.ddt_customer_reference,
      ddt_description = EXCLUDED.ddt_description,
      tracking_number = COALESCE(EXCLUDED.tracking_number, agents.order_ddts.tracking_number),
      tracking_url = COALESCE(EXCLUDED.tracking_url, agents.order_ddts.tracking_url),
      tracking_courier = COALESCE(EXCLUDED.tracking_courier, agents.order_ddts.tracking_courier),
      updated_at = NOW()
    RETURNING (xmax = 0) AS is_insert`,
    [
      input.orderId, input.userId, input.ddtNumber, input.ddtId ?? null,
      input.ddtDeliveryDate ?? null, input.ddtCustomerAccount ?? null,
      input.ddtSalesName ?? null, input.ddtDeliveryName ?? null,
      input.deliveryTerms ?? null, input.deliveryMethod ?? null,
      input.deliveryCity ?? null, input.attentionTo ?? null,
      input.ddtDeliveryAddress ?? null, input.ddtQuantity ?? null,
      input.ddtCustomerReference ?? null, input.ddtDescription ?? null,
      input.trackingNumber ?? null, input.trackingUrl ?? null,
      input.trackingCourier ?? null,
    ],
  );
  return row.is_insert ? 'inserted' : 'updated';
}

async function repositionOrderDdts(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE agents.order_ddts SET position = subq.pos
     FROM (
       SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY order_id
           ORDER BY NULLIF(REPLACE(ddt_id, '.', ''), '')::bigint ASC NULLS LAST
         ) - 1 AS pos
       FROM agents.order_ddts WHERE user_id = $1
     ) subq
     WHERE order_ddts.id = subq.id AND order_ddts.user_id = $1`,
    [userId],
  );
}

async function getDdtsForOrder(pool: DbPool, userId: string, orderId: string): Promise<DdtEntry[]> {
  const { rows } = await pool.query<DdtRow>(
    `SELECT * FROM agents.order_ddts
     WHERE user_id = $1 AND order_id = $2
     ORDER BY position ASC`,
    [userId, orderId],
  );
  return rows.map(mapRowToDdtEntry);
}

async function getDdtsNeedingTracking(
  pool: DbPool,
  userId: string,
): Promise<Array<{ ddtId: string; orderId: string; orderNumber: string; trackingNumber: string }>> {
  const { rows } = await pool.query<{
    id: string; order_id: string; order_number: string; tracking_number: string;
  }>(
    `SELECT od.id, od.order_id, o.order_number, od.tracking_number
     FROM agents.order_ddts od
     JOIN agents.order_records o ON o.id = od.order_id
     WHERE od.user_id = $1
       AND od.tracking_number IS NOT NULL
       AND od.tracking_courier = 'FEDEX'
       AND od.delivery_confirmed_at IS NULL
       AND (
         COALESCE(od.tracking_sync_failures, 0) < 3
         OR (od.tracking_sync_failures = 3 AND od.tracking_last_synced_at < NOW() - INTERVAL '6 hours')
         OR (od.tracking_sync_failures = 4 AND od.tracking_last_synced_at < NOW() - INTERVAL '24 hours')
         OR (od.tracking_sync_failures = 5 AND od.tracking_last_synced_at < NOW() - INTERVAL '36 hours')
         OR (od.tracking_sync_failures = 6 AND od.tracking_last_synced_at < NOW() - INTERVAL '48 hours')
       )
       AND o.creation_date::date >= (NOW() - INTERVAL '180 days')::date
     ORDER BY od.tracking_last_synced_at ASC NULLS FIRST`,
    [userId],
  );
  return rows.map((r) => ({
    ddtId: r.id,
    orderId: r.order_id,
    orderNumber: r.order_number,
    trackingNumber: r.tracking_number,
  }));
}

async function updateDdtTracking(pool: DbPool, ddtId: string, data: DdtTrackingUpdate): Promise<void> {
  await pool.query(
    `UPDATE agents.order_ddts SET
      tracking_status = $2,
      tracking_key_status_cd = $3,
      tracking_status_bar_cd = $4,
      tracking_estimated_delivery = $5,
      tracking_last_location = $6,
      tracking_last_event = $7,
      tracking_last_event_at = $8,
      tracking_origin = $9,
      tracking_destination = $10,
      tracking_service_desc = $11,
      delivery_confirmed_at = $12,
      delivery_signed_by = $13,
      tracking_events = $14,
      tracking_sync_failures = $15,
      tracking_delay_reason = $16,
      tracking_delivery_attempts = $17,
      tracking_attempted_delivery_at = $18,
      tracking_last_synced_at = NOW(),
      updated_at = NOW()
    WHERE id = $1`,
    [
      ddtId,
      data.trackingStatus, data.trackingKeyStatusCd, data.trackingStatusBarCd,
      data.trackingEstimatedDelivery, data.trackingLastLocation,
      data.trackingLastEvent, data.trackingLastEventAt,
      data.trackingOrigin, data.trackingDestination, data.trackingServiceDesc,
      data.deliveryConfirmedAt, data.deliverySignedBy,
      JSON.stringify(data.trackingEvents), data.trackingSyncFailures,
      data.trackingDelayReason, data.trackingDeliveryAttempts,
      data.trackingAttemptedDeliveryAt,
    ],
  );
}

async function incrementDdtTrackingFailures(pool: DbPool, ddtId: string): Promise<void> {
  await pool.query(
    `UPDATE agents.order_ddts SET
      tracking_sync_failures = COALESCE(tracking_sync_failures, 0) + 1,
      tracking_last_synced_at = NOW(),
      updated_at = NOW()
    WHERE id = $1`,
    [ddtId],
  );
}

async function computeAndUpdateOrderDeliveryState(pool: DbPool, orderId: string): Promise<void> {
  const { rows: [stats] } = await pool.query<{ total: string; delivered: string }>(
    `SELECT COUNT(*) AS total, COUNT(delivery_confirmed_at) AS delivered
     FROM agents.order_ddts WHERE order_id = $1`,
    [orderId],
  );
  const total = parseInt(stats.total, 10);
  const delivered = parseInt(stats.delivered, 10);
  if (total === 0 || delivered === 0) return;
  const newState = delivered === total ? 'consegnato' : 'parzialmente_consegnato';
  await pool.query(
    `UPDATE agents.order_records SET current_state = $1 WHERE id = $2`,
    [newState, orderId],
  );
}

export {
  upsertOrderDdt,
  repositionOrderDdts,
  getDdtsForOrder,
  getDdtsNeedingTracking,
  updateDdtTracking,
  incrementDdtTrackingFailures,
  computeAndUpdateOrderDeliveryState,
  mapRowToDdtEntry,
};
export type { OrderDdtInput, DdtTrackingUpdate, DdtEntry, DdtRow };

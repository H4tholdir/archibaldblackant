# Order Documents Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 36 flat DDT/invoice/tracking columns on `order_records` with two normalized tables (`order_ddts`, `order_invoices`) supporting multiple documents per order (backorder, NC).

**Architecture:** Non-destructive migration 042 creates new tables and copies existing data. All sync/repository code is updated to read/write the new tables. Migration 043 (deferred deploy) drops the old columns after verification.

**Tech Stack:** PostgreSQL, TypeScript, Express, React 19, Vitest, BullMQ

**Spec:** `docs/superpowers/specs/2026-03-29-order-documents-redesign.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `backend/src/db/migrations/042-order-documents-tables.sql` | Create `order_ddts` + `order_invoices`, migrate data |
| `backend/src/db/repositories/order-ddts.ts` | All DDT CRUD + tracking + delivery state |
| `backend/src/db/repositories/order-ddts.spec.ts` | Unit tests for order-ddts |
| `backend/src/db/repositories/order-invoices.ts` | All Invoice CRUD |
| `backend/src/db/repositories/order-invoices.spec.ts` | Unit tests for order-invoices |
| `backend/src/db/migrations/043-drop-order-documents-columns.sql` | Drop old flat columns (deferred) |

### Modified files
| File | Changes |
|------|---------|
| `backend/src/sync/services/ddt-sync.ts` | Group by order → UPSERT into `order_ddts` → reposition |
| `backend/src/sync/services/ddt-sync.spec.ts` | Update mock to test group/sort/upsert logic |
| `backend/src/sync/services/invoice-sync.ts` | Group by order → UPSERT into `order_invoices` → reposition |
| `backend/src/sync/services/invoice-sync.spec.ts` | Update mock to test group/sort/upsert logic |
| `backend/src/sync/services/tracking-sync.ts` | Use `order_ddts` for tracking queries |
| `backend/src/sync/services/tracking-sync.spec.ts` | Update mocks for DDT-based tracking |
| `backend/src/db/clear-sync-data.ts` | `clearDdt` → TRUNCATE `order_ddts`; `clearInvoices` → TRUNCATE `order_invoices` |
| `backend/src/db/clear-sync-data.spec.ts` | Update assertions for TRUNCATE |
| `backend/src/db/repositories/orders.ts` | Remove flat DDT/invoice/tracking fields; add JSON_AGG subqueries; remove old functions |
| `backend/src/routes/orders.ts` | Update imports (remove old types) |
| `frontend/src/types/order.ts` | Add `DdtEntry`, `InvoiceEntry`; update `Order` interface |
| `frontend/src/utils/orderStatus.ts` | `order.ddt?.x` → `order.ddts[0]?.x`; invoice fields → `order.invoices[0]?.x` |
| `frontend/src/pages/OrderHistory.tsx` | Update DDT/invoice field access for Excel export |
| `frontend/src/components/OrderCardNew.tsx` | Update DDT/invoice sections; add backorder toggle |
| `frontend/src/utils/fresisHistoryFilters.ts` | Update DDT/invoice field access |
| `frontend/src/components/TrackingTimeline.tsx` | Update tracking field access |
| `frontend/src/components/ArcaTabOrdineMadre.tsx` | `order.ddt` → `order.ddts[0]` |
| `frontend/src/components/ArcaTabTesta.tsx` | `order.ddt` → `order.ddts[0]`; invoice → `order.invoices[0]` |
| `frontend/src/components/ArcaDocumentDetail.tsx` | invoice → `order.invoices[0]` |
| `frontend/src/components/ArcaDocumentList.tsx` | invoice → `order.invoices[0]` |
| `frontend/src/components/OrderPickerModal.tsx` | DDT/invoice field access |
| `frontend/src/pages/FresisHistoryPage.tsx` | invoice → `order.invoices[0]` |

---

## Task 1: Migration 042 — Create tables and copy data

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/042-order-documents-tables.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 042-order-documents-tables.sql
-- Non-destructive: creates new tables, copies existing flat data. Old columns preserved.

BEGIN;

-- ── order_ddts ──
CREATE TABLE IF NOT EXISTS agents.order_ddts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      TEXT NOT NULL REFERENCES agents.order_records(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  position      SMALLINT NOT NULL DEFAULT 0,
  ddt_number    TEXT NOT NULL,
  ddt_id        TEXT,
  ddt_delivery_date     TEXT,
  ddt_customer_account  TEXT,
  ddt_sales_name        TEXT,
  ddt_delivery_name     TEXT,
  delivery_terms        TEXT,
  delivery_method       TEXT,
  delivery_city         TEXT,
  attention_to          TEXT,
  ddt_delivery_address  TEXT,
  ddt_quantity          TEXT,
  ddt_customer_reference TEXT,
  ddt_description       TEXT,
  -- Tracking (per-DDT)
  tracking_number       TEXT,
  tracking_url          TEXT,
  tracking_courier      TEXT,
  tracking_status       TEXT,
  tracking_key_status_cd TEXT,
  tracking_status_bar_cd TEXT,
  tracking_estimated_delivery TEXT,
  tracking_last_location TEXT,
  tracking_last_event   TEXT,
  tracking_last_event_at TEXT,
  tracking_origin       TEXT,
  tracking_destination  TEXT,
  tracking_service_desc TEXT,
  tracking_last_synced_at TIMESTAMPTZ,
  tracking_sync_failures SMALLINT DEFAULT 0,
  tracking_events       JSONB,
  tracking_delay_reason TEXT,
  tracking_delivery_attempts SMALLINT,
  tracking_attempted_delivery_at TEXT,
  delivery_confirmed_at TEXT,
  delivery_signed_by    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, ddt_number)
);

CREATE INDEX idx_order_ddts_user_order ON agents.order_ddts (user_id, order_id);
CREATE INDEX idx_order_ddts_tracking   ON agents.order_ddts (user_id, tracking_number)
  WHERE tracking_number IS NOT NULL;

-- ── order_invoices ──
CREATE TABLE IF NOT EXISTS agents.order_invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      TEXT NOT NULL REFERENCES agents.order_records(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  position      SMALLINT NOT NULL DEFAULT 0,
  invoice_number TEXT NOT NULL,
  invoice_date           TEXT,
  invoice_amount         TEXT,
  invoice_customer_account TEXT,
  invoice_billing_name   TEXT,
  invoice_quantity       INTEGER,
  invoice_remaining_amount TEXT,
  invoice_tax_amount     TEXT,
  invoice_line_discount  TEXT,
  invoice_total_discount TEXT,
  invoice_due_date       TEXT,
  invoice_payment_terms_id TEXT,
  invoice_purchase_order TEXT,
  invoice_closed         BOOLEAN,
  invoice_days_past_due  TEXT,
  invoice_settled_amount TEXT,
  invoice_last_payment_id TEXT,
  invoice_last_settlement_date TEXT,
  invoice_closed_date    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, invoice_number)
);

CREATE INDEX idx_order_invoices_user_order ON agents.order_invoices (user_id, order_id);

-- ── Copy existing data ──
INSERT INTO agents.order_ddts (
  order_id, user_id, position, ddt_number, ddt_id,
  ddt_delivery_date, ddt_customer_account, ddt_sales_name,
  ddt_delivery_name, delivery_terms, delivery_method,
  delivery_city, attention_to, ddt_delivery_address,
  ddt_quantity, ddt_customer_reference, ddt_description,
  tracking_number, tracking_url, tracking_courier,
  tracking_status, tracking_key_status_cd, tracking_status_bar_cd,
  tracking_estimated_delivery, tracking_last_location,
  tracking_last_event, tracking_last_event_at,
  tracking_origin, tracking_destination, tracking_service_desc,
  tracking_last_synced_at, tracking_sync_failures, tracking_events,
  tracking_delay_reason, tracking_delivery_attempts,
  tracking_attempted_delivery_at, delivery_confirmed_at,
  delivery_signed_by
)
SELECT
  id, user_id, 0, ddt_number, ddt_id,
  ddt_delivery_date, ddt_customer_account, ddt_sales_name,
  ddt_delivery_name, delivery_terms, delivery_method,
  delivery_city, attention_to, ddt_delivery_address,
  ddt_quantity, ddt_customer_reference, ddt_description,
  tracking_number, tracking_url, tracking_courier,
  tracking_status, tracking_key_status_cd, tracking_status_bar_cd,
  tracking_estimated_delivery, tracking_last_location,
  tracking_last_event, tracking_last_event_at,
  tracking_origin, tracking_destination, tracking_service_desc,
  tracking_last_synced_at, tracking_sync_failures, tracking_events,
  tracking_delay_reason, tracking_delivery_attempts,
  tracking_attempted_delivery_at, delivery_confirmed_at,
  delivery_signed_by
FROM agents.order_records
WHERE ddt_number IS NOT NULL;

INSERT INTO agents.order_invoices (
  order_id, user_id, position, invoice_number,
  invoice_date, invoice_amount, invoice_customer_account,
  invoice_billing_name, invoice_quantity, invoice_remaining_amount,
  invoice_tax_amount, invoice_line_discount, invoice_total_discount,
  invoice_due_date, invoice_payment_terms_id, invoice_purchase_order,
  invoice_closed, invoice_days_past_due, invoice_settled_amount,
  invoice_last_payment_id, invoice_last_settlement_date,
  invoice_closed_date
)
SELECT
  id, user_id, 0, invoice_number,
  invoice_date, invoice_amount, invoice_customer_account,
  invoice_billing_name, invoice_quantity, invoice_remaining_amount,
  invoice_tax_amount, invoice_line_discount, invoice_total_discount,
  invoice_due_date, invoice_payment_terms_id, invoice_purchase_order,
  invoice_closed, invoice_days_past_due, invoice_settled_amount,
  invoice_last_payment_id, invoice_last_settlement_date,
  invoice_closed_date
FROM agents.order_records
WHERE invoice_number IS NOT NULL;

COMMIT;
```

- [ ] **Step 2: Verify migration runs locally**

Run: `npm run build --prefix archibald-web-app/backend` (migration is applied at startup)

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/042-order-documents-tables.sql
git commit -m "feat(db): add order_ddts and order_invoices tables (migration 042)"
```

---

## Task 2: New repository — `order-ddts.ts`

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/order-ddts.ts`
- Create: `archibald-web-app/backend/src/db/repositories/order-ddts.spec.ts`

- [ ] **Step 1: Write the failing tests**

File: `archibald-web-app/backend/src/db/repositories/order-ddts.spec.ts`

```typescript
import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../pool';
import {
  upsertOrderDdt,
  repositionOrderDdts,
  getDdtsForOrder,
  getDdtsNeedingTracking,
  updateDdtTracking,
  incrementDdtTrackingFailures,
  computeAndUpdateOrderDeliveryState,
  type OrderDdtInput,
} from './order-ddts';

function createMockPool(queryResults: Array<{ rows: unknown[]; rowCount?: number }> = []): DbPool {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;
      return Promise.resolve(result);
    }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const baseDdtInput: OrderDdtInput = {
  orderId: 'ord-1',
  userId: 'user-1',
  ddtNumber: 'DDT/26001',
  ddtId: '12345',
  ddtDeliveryDate: '3/28/2026',
  ddtCustomerAccount: 'CUST001',
  ddtSalesName: 'Test Sales',
  ddtDeliveryName: 'Test Delivery',
  deliveryTerms: 'FOB',
  deliveryMethod: 'Ground',
  deliveryCity: 'Naples',
  attentionTo: 'Mario',
  ddtDeliveryAddress: 'Via Roma 1',
  ddtQuantity: '10',
  ddtCustomerReference: 'REF001',
  ddtDescription: 'Test shipment',
  trackingNumber: '445291890750',
  trackingUrl: null,
  trackingCourier: 'FEDEX',
};

describe('upsertOrderDdt', () => {
  test('returns "inserted" when xmax = 0 (new row)', async () => {
    const pool = createMockPool([{ rows: [{ is_insert: true }], rowCount: 1 }]);
    const result = await upsertOrderDdt(pool, baseDdtInput);
    expect(result).toBe('inserted');
    expect(pool.query).toHaveBeenCalledOnce();
  });

  test('returns "updated" when xmax != 0 (existing row)', async () => {
    const pool = createMockPool([{ rows: [{ is_insert: false }], rowCount: 1 }]);
    const result = await upsertOrderDdt(pool, baseDdtInput);
    expect(result).toBe('updated');
  });
});

describe('repositionOrderDdts', () => {
  test('executes reposition query with userId', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 3 }]);
    await repositionOrderDdts(pool, 'user-1');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ROW_NUMBER()'),
      ['user-1'],
    );
  });
});

describe('getDdtsForOrder', () => {
  test('returns DDTs sorted by position', async () => {
    const mockRows = [
      { id: 'ddt-1', position: 0, ddt_number: 'DDT/001', ddt_id: '100' },
      { id: 'ddt-2', position: 1, ddt_number: 'DDT/002', ddt_id: '200' },
    ];
    const pool = createMockPool([{ rows: mockRows }]);
    const result = await getDdtsForOrder(pool, 'user-1', 'ord-1');
    expect(result).toHaveLength(2);
    expect(result[0].ddtNumber).toBe('DDT/001');
    expect(result[1].ddtNumber).toBe('DDT/002');
  });
});

describe('getDdtsNeedingTracking', () => {
  test('returns DDTs with tracking_number set and not yet delivered', async () => {
    const mockRows = [
      { id: 'ddt-1', order_id: 'ord-1', order_number: 'ORD/001', tracking_number: 'TRK111' },
    ];
    const pool = createMockPool([{ rows: mockRows }]);
    const result = await getDdtsNeedingTracking(pool, 'user-1');
    expect(result).toEqual([{
      ddtId: 'ddt-1',
      orderId: 'ord-1',
      orderNumber: 'ORD/001',
      trackingNumber: 'TRK111',
    }]);
  });
});

describe('updateDdtTracking', () => {
  test('updates tracking fields on the DDT row', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 1 }]);
    await updateDdtTracking(pool, 'ddt-1', {
      trackingStatus: 'in_transit',
      trackingKeyStatusCd: 'IT',
      trackingStatusBarCd: 'OW',
      trackingEstimatedDelivery: '2026-03-30',
      trackingLastLocation: 'Milan, IT',
      trackingLastEvent: 'In transit',
      trackingLastEventAt: '2026-03-29 10:00',
      trackingOrigin: 'Verona, IT',
      trackingDestination: 'Naples, IT',
      trackingServiceDesc: 'FedEx Priority',
      deliveryConfirmedAt: null,
      deliverySignedBy: null,
      trackingEvents: [],
      trackingSyncFailures: 0,
      trackingDelayReason: null,
      trackingDeliveryAttempts: null,
      trackingAttemptedDeliveryAt: null,
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('tracking_status'),
      expect.arrayContaining(['ddt-1', 'in_transit']),
    );
  });
});

describe('incrementDdtTrackingFailures', () => {
  test('increments failure counter on DDT', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 1 }]);
    await incrementDdtTrackingFailures(pool, 'ddt-1');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('tracking_sync_failures'),
      ['ddt-1'],
    );
  });
});

describe('computeAndUpdateOrderDeliveryState', () => {
  test('sets consegnato when all DDTs delivered', async () => {
    const pool = createMockPool([
      { rows: [{ total: '2', delivered: '2' }] },
      { rows: [], rowCount: 1 },
    ]);
    await computeAndUpdateOrderDeliveryState(pool, 'ord-1');
    expect(pool.query).toHaveBeenCalledTimes(2);
    const updateCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(updateCall[1]).toContain('consegnato');
  });

  test('sets parzialmente_consegnato when some DDTs delivered', async () => {
    const pool = createMockPool([
      { rows: [{ total: '3', delivered: '1' }] },
      { rows: [], rowCount: 1 },
    ]);
    await computeAndUpdateOrderDeliveryState(pool, 'ord-1');
    const updateCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(updateCall[1]).toContain('parzialmente_consegnato');
  });

  test('does nothing when no DDTs exist', async () => {
    const pool = createMockPool([{ rows: [{ total: '0', delivered: '0' }] }]);
    await computeAndUpdateOrderDeliveryState(pool, 'ord-1');
    expect(pool.query).toHaveBeenCalledOnce();
  });

  test('does nothing when zero delivered', async () => {
    const pool = createMockPool([{ rows: [{ total: '2', delivered: '0' }] }]);
    await computeAndUpdateOrderDeliveryState(pool, 'ord-1');
    expect(pool.query).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run order-ddts.spec`
Expected: FAIL — module `./order-ddts` not found

- [ ] **Step 3: Write implementation**

File: `archibald-web-app/backend/src/db/repositories/order-ddts.ts`

```typescript
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
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
              COALESCE($17, (SELECT tracking_number FROM agents.order_ddts WHERE order_id=$1 AND ddt_number=$3)),
              COALESCE($18, (SELECT tracking_url FROM agents.order_ddts WHERE order_id=$1 AND ddt_number=$3)),
              COALESCE($19, (SELECT tracking_courier FROM agents.order_ddts WHERE order_id=$1 AND ddt_number=$3)),
              NOW())
    ON CONFLICT (order_id, ddt_number) DO UPDATE SET
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
           ORDER BY NULLIF(ddt_id,'')::bigint ASC NULLS LAST
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
       AND od.delivery_confirmed_at IS NULL
       AND COALESCE(od.tracking_sync_failures, 0) < 3
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --run order-ddts.spec`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/order-ddts.ts archibald-web-app/backend/src/db/repositories/order-ddts.spec.ts
git commit -m "feat(db): add order-ddts repository with upsert, reposition, tracking"
```

---

## Task 3: New repository — `order-invoices.ts`

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/order-invoices.ts`
- Create: `archibald-web-app/backend/src/db/repositories/order-invoices.spec.ts`

- [ ] **Step 1: Write the failing tests**

File: `archibald-web-app/backend/src/db/repositories/order-invoices.spec.ts`

```typescript
import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../pool';
import {
  upsertOrderInvoice,
  repositionOrderInvoices,
  getInvoicesForOrder,
  type OrderInvoiceInput,
} from './order-invoices';

function createMockPool(queryResults: Array<{ rows: unknown[]; rowCount?: number }> = []): DbPool {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;
      return Promise.resolve(result);
    }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const baseInvoiceInput: OrderInvoiceInput = {
  orderId: 'ord-1',
  userId: 'user-1',
  invoiceNumber: 'FT/26001',
  invoiceDate: '3/28/2026',
  invoiceAmount: '1,234.56',
  invoiceCustomerAccount: 'CUST001',
  invoiceBillingName: 'Test Billing',
  invoiceQuantity: 10,
  invoiceRemainingAmount: '0.00',
  invoiceTaxAmount: '271.60',
  invoiceLineDiscount: '0.00',
  invoiceTotalDiscount: '0.00',
  invoiceDueDate: '4/28/2026',
  invoicePaymentTermsId: 'NET30',
  invoicePurchaseOrder: 'PO-001',
  invoiceClosed: false,
  invoiceDaysPastDue: '0',
  invoiceSettledAmount: '0.00',
  invoiceLastPaymentId: null,
  invoiceLastSettlementDate: null,
  invoiceClosedDate: null,
};

describe('upsertOrderInvoice', () => {
  test('returns "inserted" when xmax = 0', async () => {
    const pool = createMockPool([{ rows: [{ is_insert: true }], rowCount: 1 }]);
    const result = await upsertOrderInvoice(pool, baseInvoiceInput);
    expect(result).toBe('inserted');
  });

  test('returns "updated" when xmax != 0', async () => {
    const pool = createMockPool([{ rows: [{ is_insert: false }], rowCount: 1 }]);
    const result = await upsertOrderInvoice(pool, baseInvoiceInput);
    expect(result).toBe('updated');
  });
});

describe('repositionOrderInvoices', () => {
  test('executes reposition query', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 2 }]);
    await repositionOrderInvoices(pool, 'user-1');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ROW_NUMBER()'),
      ['user-1'],
    );
  });
});

describe('getInvoicesForOrder', () => {
  test('returns invoices sorted by position', async () => {
    const mockRows = [
      { id: 'inv-1', position: 0, invoice_number: 'FT/001', invoice_date: '3/1/2026' },
      { id: 'inv-2', position: 1, invoice_number: 'NC/001', invoice_date: '3/5/2026' },
    ];
    const pool = createMockPool([{ rows: mockRows }]);
    const result = await getInvoicesForOrder(pool, 'user-1', 'ord-1');
    expect(result).toHaveLength(2);
    expect(result[0].invoiceNumber).toBe('FT/001');
    expect(result[1].invoiceNumber).toBe('NC/001');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run order-invoices.spec`
Expected: FAIL — module `./order-invoices` not found

- [ ] **Step 3: Write implementation**

File: `archibald-web-app/backend/src/db/repositories/order-invoices.ts`

```typescript
import type { DbPool } from '../pool';

type OrderInvoiceInput = {
  orderId: string;
  userId: string;
  invoiceNumber: string;
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
};

type InvoiceRow = {
  id: string;
  order_id: string;
  user_id: string;
  position: number;
  invoice_number: string;
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
};

type InvoiceEntry = {
  id: string;
  orderId: string;
  position: number;
  invoiceNumber: string;
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
};

function mapRowToInvoiceEntry(row: InvoiceRow): InvoiceEntry {
  return {
    id: row.id,
    orderId: row.order_id,
    position: row.position,
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
    invoiceClosed: row.invoice_closed,
    invoiceDaysPastDue: row.invoice_days_past_due,
    invoiceSettledAmount: row.invoice_settled_amount,
    invoiceLastPaymentId: row.invoice_last_payment_id,
    invoiceLastSettlementDate: row.invoice_last_settlement_date,
    invoiceClosedDate: row.invoice_closed_date,
  };
}

async function upsertOrderInvoice(pool: DbPool, input: OrderInvoiceInput): Promise<'inserted' | 'updated'> {
  const { rows: [row] } = await pool.query<{ is_insert: boolean }>(
    `INSERT INTO agents.order_invoices (
      order_id, user_id, invoice_number, invoice_date, invoice_amount,
      invoice_customer_account, invoice_billing_name, invoice_quantity,
      invoice_remaining_amount, invoice_tax_amount, invoice_line_discount,
      invoice_total_discount, invoice_due_date, invoice_payment_terms_id,
      invoice_purchase_order, invoice_closed, invoice_days_past_due,
      invoice_settled_amount, invoice_last_payment_id,
      invoice_last_settlement_date, invoice_closed_date, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
    ON CONFLICT (order_id, invoice_number) DO UPDATE SET
      invoice_date = EXCLUDED.invoice_date,
      invoice_amount = EXCLUDED.invoice_amount,
      invoice_customer_account = EXCLUDED.invoice_customer_account,
      invoice_billing_name = EXCLUDED.invoice_billing_name,
      invoice_quantity = EXCLUDED.invoice_quantity,
      invoice_remaining_amount = EXCLUDED.invoice_remaining_amount,
      invoice_tax_amount = EXCLUDED.invoice_tax_amount,
      invoice_line_discount = EXCLUDED.invoice_line_discount,
      invoice_total_discount = EXCLUDED.invoice_total_discount,
      invoice_due_date = EXCLUDED.invoice_due_date,
      invoice_payment_terms_id = EXCLUDED.invoice_payment_terms_id,
      invoice_purchase_order = EXCLUDED.invoice_purchase_order,
      invoice_closed = EXCLUDED.invoice_closed,
      invoice_days_past_due = EXCLUDED.invoice_days_past_due,
      invoice_settled_amount = EXCLUDED.invoice_settled_amount,
      invoice_last_payment_id = EXCLUDED.invoice_last_payment_id,
      invoice_last_settlement_date = EXCLUDED.invoice_last_settlement_date,
      invoice_closed_date = EXCLUDED.invoice_closed_date,
      updated_at = NOW()
    RETURNING (xmax = 0) AS is_insert`,
    [
      input.orderId, input.userId, input.invoiceNumber,
      input.invoiceDate ?? null, input.invoiceAmount ?? null,
      input.invoiceCustomerAccount ?? null, input.invoiceBillingName ?? null,
      input.invoiceQuantity ?? null, input.invoiceRemainingAmount ?? null,
      input.invoiceTaxAmount ?? null, input.invoiceLineDiscount ?? null,
      input.invoiceTotalDiscount ?? null, input.invoiceDueDate ?? null,
      input.invoicePaymentTermsId ?? null, input.invoicePurchaseOrder ?? null,
      input.invoiceClosed ?? null, input.invoiceDaysPastDue ?? null,
      input.invoiceSettledAmount ?? null, input.invoiceLastPaymentId ?? null,
      input.invoiceLastSettlementDate ?? null, input.invoiceClosedDate ?? null,
    ],
  );
  return row.is_insert ? 'inserted' : 'updated';
}

async function repositionOrderInvoices(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE agents.order_invoices SET position = subq.pos
     FROM (
       SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY order_id
           ORDER BY invoice_date ASC NULLS LAST
         ) - 1 AS pos
       FROM agents.order_invoices WHERE user_id = $1
     ) subq
     WHERE order_invoices.id = subq.id AND order_invoices.user_id = $1`,
    [userId],
  );
}

async function getInvoicesForOrder(pool: DbPool, userId: string, orderId: string): Promise<InvoiceEntry[]> {
  const { rows } = await pool.query<InvoiceRow>(
    `SELECT * FROM agents.order_invoices
     WHERE user_id = $1 AND order_id = $2
     ORDER BY position ASC`,
    [userId, orderId],
  );
  return rows.map(mapRowToInvoiceEntry);
}

export {
  upsertOrderInvoice,
  repositionOrderInvoices,
  getInvoicesForOrder,
  mapRowToInvoiceEntry,
};
export type { OrderInvoiceInput, InvoiceEntry, InvoiceRow };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --run order-invoices.spec`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/order-invoices.ts archibald-web-app/backend/src/db/repositories/order-invoices.spec.ts
git commit -m "feat(db): add order-invoices repository with upsert, reposition"
```

---

## Task 4: Rewrite `ddt-sync.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/services/ddt-sync.ts`
- Modify: `archibald-web-app/backend/src/sync/services/ddt-sync.spec.ts`

- [ ] **Step 1: Update the test**

Replace `archibald-web-app/backend/src/sync/services/ddt-sync.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { syncDdt, type DdtSyncDeps } from './ddt-sync';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn()
      // First call: SELECT id FROM order_records (for order lookup)
      .mockResolvedValueOnce({ rows: [{ id: 'ORD-1' }], rowCount: 1 })
      // Second call: upsertOrderDdt RETURNING
      .mockResolvedValueOnce({ rows: [{ is_insert: true }], rowCount: 1 })
      // Third call: repositionOrderDdts
      .mockResolvedValue({ rows: [], rowCount: 0 }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockDeps(pool?: DbPool): DdtSyncDeps {
  return {
    pool: pool ?? createMockPool(),
    downloadPdf: vi.fn().mockResolvedValue('/tmp/ddt.pdf'),
    parsePdf: vi.fn().mockResolvedValue([
      { orderNumber: 'SO-001', ddtNumber: 'DDT-001', ddtDeliveryDate: '2026-01-15', ddtId: '100', trackingNumber: 'TRK-123' },
    ]),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

describe('syncDdt', () => {
  test('groups DDTs by order, sorts by ddtId, and upserts into order_ddts', async () => {
    const pool = createMockPool();
    const deps = createMockDeps(pool);
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue([
      { orderNumber: 'SO-001', ddtNumber: 'DDT-002', ddtId: '200', trackingNumber: null },
      { orderNumber: 'SO-001', ddtNumber: 'DDT-001', ddtId: '100', trackingNumber: 'TRK-123' },
    ]);
    // Mock: order lookup + 2 upserts + 1 reposition
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [{ id: 'ORD-1' }], rowCount: 1 })   // lookup SO-001
      .mockResolvedValueOnce({ rows: [{ is_insert: true }], rowCount: 1 })  // upsert DDT-001 (sorted first)
      .mockResolvedValueOnce({ rows: [{ is_insert: true }], rowCount: 1 })  // upsert DDT-002
      .mockResolvedValue({ rows: [], rowCount: 0 });                        // reposition

    const result = await syncDdt(deps, 'user-1', vi.fn(), () => false);
    expect(result.success).toBe(true);
    expect(result.ddtProcessed).toBe(2);
  });

  test('stops on shouldStop', async () => {
    const deps = createMockDeps();
    const result = await syncDdt(deps, 'user-1', vi.fn(), () => true);
    expect(result.success).toBe(false);
  });

  test('cleans up PDF on error', async () => {
    const deps = createMockDeps();
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
    await syncDdt(deps, 'user-1', vi.fn(), () => false);
    expect(deps.cleanupFile).toHaveBeenCalledWith('/tmp/ddt.pdf');
  });

  test('reports progress at 100', async () => {
    const deps = createMockDeps();
    const onProgress = vi.fn();
    await syncDdt(deps, 'user-1', onProgress, () => false);
    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run ddt-sync.spec`
Expected: FAIL — upsert query not matching mock

- [ ] **Step 3: Rewrite ddt-sync.ts**

Replace the core loop in `archibald-web-app/backend/src/sync/services/ddt-sync.ts`. Key changes:
1. Import `upsertOrderDdt` and `repositionOrderDdts` from `../../db/repositories/order-ddts`
2. Group parsed DDTs by `orderNumber`
3. Sort each group by `ddtId` ASC (lower ddtId = older = primary)
4. For each DDT: look up `order_records.id` → call `upsertOrderDdt`
5. After all upserts: call `repositionOrderDdts(pool, userId)`

The sync function signature and `DdtSyncDeps` stay the same. Replace the `for (const ddt of parsedDdts)` loop with:

```typescript
// Group by orderNumber
const groups = new Map<string, ParsedDdt[]>();
for (const ddt of parsedDdts) {
  const list = groups.get(ddt.orderNumber) ?? [];
  list.push(ddt);
  groups.set(ddt.orderNumber, list);
}

// Sort each group by ddtId ASC (primary first)
for (const ddts of groups.values()) {
  ddts.sort((a, b) => Number(a.ddtId ?? 0) - Number(b.ddtId ?? 0));
}

let ddtUpdated = 0;
let ddtSkipped = 0;

for (const [orderNumber, ddts] of groups) {
  const { rows: [order] } = await pool.query<{ id: string }>(
    'SELECT id FROM agents.order_records WHERE order_number = $1 AND user_id = $2',
    [orderNumber, userId],
  );
  if (!order) { ddtSkipped += ddts.length; continue; }

  for (const ddt of ddts) {
    await upsertOrderDdt(pool, {
      orderId: order.id,
      userId,
      ddtNumber: ddt.ddtNumber,
      ddtId: ddt.ddtId ?? null,
      ddtDeliveryDate: ddt.ddtDeliveryDate ?? null,
      ddtCustomerAccount: ddt.ddtCustomerAccount ?? null,
      ddtSalesName: ddt.ddtSalesName ?? null,
      ddtDeliveryName: ddt.ddtDeliveryName ?? null,
      deliveryTerms: ddt.deliveryTerms ?? null,
      deliveryMethod: ddt.deliveryMethod ?? null,
      deliveryCity: ddt.deliveryCity ?? null,
      attentionTo: ddt.attentionTo ?? null,
      ddtDeliveryAddress: ddt.ddtDeliveryAddress ?? null,
      ddtQuantity: ddt.ddtQuantity ?? null,
      ddtCustomerReference: ddt.ddtCustomerReference ?? null,
      ddtDescription: ddt.ddtDescription ?? null,
      trackingNumber: ddt.trackingNumber ?? null,
      trackingUrl: ddt.trackingUrl ?? null,
      trackingCourier: ddt.trackingCourier ?? null,
    });
    ddtUpdated++;
  }
}

// Reposition all DDTs for this user
await repositionOrderDdts(pool, userId);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --run ddt-sync.spec`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/services/ddt-sync.ts archibald-web-app/backend/src/sync/services/ddt-sync.spec.ts
git commit -m "refactor(sync): ddt-sync writes to order_ddts with group/sort/upsert"
```

---

## Task 5: Rewrite `invoice-sync.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/services/invoice-sync.ts`
- Modify: `archibald-web-app/backend/src/sync/services/invoice-sync.spec.ts`

Same pattern as Task 4. Key changes:
1. Import `upsertOrderInvoice` and `repositionOrderInvoices` from `../../db/repositories/order-invoices`
2. Group by `orderNumber`, sort by `invoiceDate` ASC
3. For each invoice: look up `order_records.id` → call `upsertOrderInvoice`
4. After all upserts: call `repositionOrderInvoices(pool, userId)`

- [ ] **Step 1: Update the test**

Replace `archibald-web-app/backend/src/sync/services/invoice-sync.spec.ts` — same structure as ddt-sync.spec.ts but with invoice fields and `upsertOrderInvoice` mock expectations.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run invoice-sync.spec`

- [ ] **Step 3: Rewrite invoice-sync.ts**

Replace the `for (const inv of parsedInvoices)` loop with grouping/sorting/upsert pattern, identical structure to Task 4 but calling `upsertOrderInvoice` and `repositionOrderInvoices`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --run invoice-sync.spec`

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/services/invoice-sync.ts archibald-web-app/backend/src/sync/services/invoice-sync.spec.ts
git commit -m "refactor(sync): invoice-sync writes to order_invoices with group/sort/upsert"
```

---

## Task 6: Update `clear-sync-data.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/db/clear-sync-data.ts`
- Modify: `archibald-web-app/backend/src/db/clear-sync-data.spec.ts`

- [ ] **Step 1: Update the tests**

In `clear-sync-data.spec.ts`, update the `ddt` and `invoices` test cases:

```typescript
test('ddt truncates order_ddts and clears sync state', async () => {
  const { pool, getQueries } = createMockPool();
  await clearSyncData(pool, 'ddt');
  expect(getQueries()).toEqual([
    'TRUNCATE TABLE agents.order_ddts',
    `DELETE FROM agents.agent_sync_state WHERE sync_type = 'ddt'`,
  ]);
});

test('invoices truncates order_invoices and clears sync state', async () => {
  const { pool, getQueries } = createMockPool();
  await clearSyncData(pool, 'invoices');
  expect(getQueries()).toEqual([
    'TRUNCATE TABLE agents.order_invoices',
    `DELETE FROM agents.agent_sync_state WHERE sync_type = 'invoices'`,
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run clear-sync-data.spec`
Expected: FAIL — queries still use UPDATE SET NULL

- [ ] **Step 3: Update clear-sync-data.ts**

Replace `clearDdt` and `clearInvoices` functions:

```typescript
async function clearDdt(tx: TxClient): Promise<void> {
  await tx.query('TRUNCATE TABLE agents.order_ddts');
  await tx.query(
    `DELETE FROM agents.agent_sync_state WHERE sync_type = 'ddt'`,
  );
}

async function clearInvoices(tx: TxClient): Promise<void> {
  await tx.query('TRUNCATE TABLE agents.order_invoices');
  await tx.query(
    `DELETE FROM agents.agent_sync_state WHERE sync_type = 'invoices'`,
  );
}
```

Remove `DDT_COLUMNS` and `INVOICE_COLUMNS` constants (no longer needed).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --run clear-sync-data.spec`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/clear-sync-data.ts archibald-web-app/backend/src/db/clear-sync-data.spec.ts
git commit -m "refactor(sync): clear-sync-data uses order_ddts/order_invoices tables"
```

---

## Task 7: Update `tracking-sync.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/services/tracking-sync.ts`
- Modify: `archibald-web-app/backend/src/sync/services/tracking-sync.spec.ts`

- [ ] **Step 1: Update imports and function calls**

In `tracking-sync.ts`:
1. Replace imports from `../../db/repositories/orders` with imports from `../../db/repositories/order-ddts`
2. Replace `getOrdersNeedingTrackingSync` → `getDdtsNeedingTracking`
3. Replace `updateTrackingData(pool, userId, orderNumber, data)` → `updateDdtTracking(pool, ddtId, data)`
4. Replace `incrementTrackingSyncFailures(pool, userId, orderNumber)` → `incrementDdtTrackingFailures(pool, ddtId)`
5. After each successful tracking update, call `computeAndUpdateOrderDeliveryState(pool, orderId)`
6. The tracking-to-order map becomes tracking-to-ddt: `Map<string, { ddtId: string; orderId: string; orderNumber: string }>`

Key code change in the loop:

```typescript
const ddts = await getDdtsNeedingTracking(pool, userId);
// ...
const trackingToDdt = new Map<string, { ddtId: string; orderId: string; orderNumber: string }>();
const trackingNumbers: string[] = [];
for (const ddt of ddts) {
  trackingToDdt.set(ddt.trackingNumber, ddt);
  trackingNumbers.push(ddt.trackingNumber);
}
// ... after FedEx API call ...
for (const result of results) {
  const ddt = trackingToDdt.get(result.trackingNumber);
  if (!ddt) continue;
  if (result.success) {
    // ... same status mapping ...
    await updateDdtTracking(pool, ddt.ddtId, { /* same data */ });
    await computeAndUpdateOrderDeliveryState(pool, ddt.orderId);
    // ... exception/notification logic uses ddt.orderNumber ...
  } else {
    await incrementDdtTrackingFailures(pool, ddt.ddtId);
  }
}
```

- [ ] **Step 2: Update tracking-sync.spec.ts**

Update `makeMockPool` to match new query patterns:
- `getDdtsNeedingTracking` query contains `od.tracking_number IS NOT NULL`
- `updateDdtTracking` query contains `tracking_status =` with `WHERE id = $1`
- `incrementDdtTrackingFailures` query contains `tracking_sync_failures`
- `computeAndUpdateOrderDeliveryState` query contains `COUNT(delivery_confirmed_at)`

The mock orders array shape changes:
```typescript
// Before:
const mockOrders = [{ order_number: 'ORD/001', tracking_number: 'TRK111' }];
// After:
const mockDdts = [{ id: 'ddt-1', order_id: 'ord-1', order_number: 'ORD/001', tracking_number: 'TRK111' }];
```

Update the pool mock to detect the new query patterns.

- [ ] **Step 3: Run tests**

Run: `npm test --prefix archibald-web-app/backend -- --run tracking-sync.spec`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/sync/services/tracking-sync.ts archibald-web-app/backend/src/sync/services/tracking-sync.spec.ts
git commit -m "refactor(sync): tracking-sync reads/writes order_ddts instead of order_records"
```

---

## Task 8: Update `orders.ts` repository

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/orders.ts`
- Modify: `archibald-web-app/backend/src/routes/orders.ts` (imports only)

This is the largest backend task. Changes:

- [ ] **Step 1: Update Order type**

1. Remove from `Order` type: all flat DDT fields (`ddtNumber`, `ddtDeliveryDate`, etc.), all flat invoice fields (`invoiceNumber`, `invoiceDate`, etc.), all flat tracking fields (`trackingNumber`, `trackingUrl`, `trackingCourier`, `trackingStatus`, etc.), `deliveryCompletedDate`, `ddt: DdtInfo`, `tracking: TrackingInfo`
2. Add to `Order` type: `ddts: DdtEntry[]`, `invoices: InvoiceEntry[]`
3. Import `DdtEntry` from `./order-ddts` and `InvoiceEntry` from `./order-invoices`
4. Remove `DdtInfo` and `TrackingInfo` types from orders.ts

- [ ] **Step 2: Add JSON_AGG subqueries to getOrdersByUser and getOrderById**

Add to `OrderRow`: `ddts_json: unknown`, `invoices_json: unknown`

Update `getOrdersByUser` query:
```sql
SELECT o.*, ovs.verification_status, ovs.verification_notes,
  (SELECT COALESCE(json_agg(json_build_object(
    'id', d.id, 'order_id', d.order_id, 'user_id', d.user_id,
    'position', d.position, 'ddt_number', d.ddt_number,
    'ddt_id', d.ddt_id, 'ddt_delivery_date', d.ddt_delivery_date,
    -- ... all columns ...
  ) ORDER BY d.position), '[]'::json)
  FROM agents.order_ddts d WHERE d.order_id = o.id AND d.user_id = o.user_id AND d.position = 0
  ) AS ddts_json,
  (SELECT COALESCE(json_agg(json_build_object(
    'id', i.id, 'order_id', i.order_id, 'user_id', i.user_id,
    'position', i.position, 'invoice_number', i.invoice_number,
    -- ... all columns ...
  ) ORDER BY i.position), '[]'::json)
  FROM agents.order_invoices i WHERE i.order_id = o.id AND i.user_id = o.user_id AND i.position = 0
  ) AS invoices_json
FROM agents.order_records o
LEFT JOIN agents.order_verification_snapshots ovs ON ovs.order_id = o.id AND ovs.user_id = o.user_id
WHERE o.user_id = $1...
```

For `getOrderById`: same but WITHOUT `AND d.position = 0` / `AND i.position = 0` (load all).

- [ ] **Step 3: Update mapRowToOrder**

```typescript
function mapRowToOrder(row: OrderRow): Order {
  const ddtsRaw = (row.ddts_json ?? []) as DdtRow[];
  const invoicesRaw = (row.invoices_json ?? []) as InvoiceRow[];
  return {
    // ... base fields (unchanged) ...
    ddts: ddtsRaw.map(mapRowToDdtEntry),
    invoices: invoicesRaw.map(mapRowToInvoiceEntry),
    // Remove all old flat DDT/invoice/tracking mappings
  };
}
```

Import `mapRowToDdtEntry, type DdtRow` from `./order-ddts` and `mapRowToInvoiceEntry, type InvoiceRow` from `./order-invoices`.

- [ ] **Step 4: Update buildFilterClause**

Replace search references to flat columns:
```typescript
// Before:
tracking_number ILIKE $N OR ddt_number ILIKE $N OR invoice_number ILIKE $N
// After:
EXISTS (SELECT 1 FROM agents.order_ddts d WHERE d.order_id = o.id AND d.ddt_number ILIKE $N) OR
EXISTS (SELECT 1 FROM agents.order_ddts d WHERE d.order_id = o.id AND d.tracking_number ILIKE $N) OR
EXISTS (SELECT 1 FROM agents.order_invoices i WHERE i.order_id = o.id AND i.invoice_number ILIKE $N)
```

Also add `o` alias to `countOrders` query: `FROM agents.order_records o WHERE o.user_id = $1`.

- [ ] **Step 5: Remove old functions**

Delete from orders.ts:
- `updateOrderDDT`
- `updateInvoiceData`
- `updateTrackingData`
- `incrementTrackingSyncFailures`
- `getOrdersNeedingTrackingSync`
- `DDTData` type
- `InvoiceData` type

Remove these from exports and from `routes/orders.ts` imports.

- [ ] **Step 6: Run type-check and tests**

Run: `npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend -- --run`
Expected: PASS (fix any remaining type errors)

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/orders.ts archibald-web-app/backend/src/routes/orders.ts
git commit -m "refactor(orders): replace flat DDT/invoice columns with JSON_AGG from order_ddts/order_invoices"
```

---

## Task 9: Frontend `types/order.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/types/order.ts`

- [ ] **Step 1: Add DdtEntry and InvoiceEntry types, update Order**

```typescript
// Replace DDTInfo with DdtEntry
export type DdtEntry = {
  id: string;
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
  trackingEvents: Array<{
    date: string; time: string; gmtOffset: string;
    status: string; statusCD: string; scanLocation: string;
    delivered: boolean; exception: boolean;
    exceptionCode: string; exceptionDescription?: string;
  }> | null;
  trackingDelayReason: string | null;
  trackingDeliveryAttempts: number | null;
  trackingAttemptedDeliveryAt: string | null;
  deliveryConfirmedAt: string | null;
  deliverySignedBy: string | null;
};

export type InvoiceEntry = {
  id: string;
  position: number;
  invoiceNumber: string;
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
};
```

Update `Order` interface:
- Remove `ddt?: DDTInfo`, `tracking?: TrackingInfo`, all flat invoice fields, all flat tracking fields
- Add `ddts: DdtEntry[]`, `invoices: InvoiceEntry[]`
- Keep `currentState?: string` (now includes `parzialmente_consegnato`)
- Keep `DDTInfo` and `TrackingInfo` interfaces (mark as `@deprecated`) temporarily until all consumers are migrated

- [ ] **Step 2: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: Many errors — this drives Tasks 10-12

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/types/order.ts
git commit -m "refactor(types): add DdtEntry/InvoiceEntry, update Order interface"
```

---

## Task 10: Frontend `utils/orderStatus.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/orderStatus.ts`

- [ ] **Step 1: Update all accessor functions**

```typescript
// Helper to get primary DDT
function primaryDdt(order: Order): DdtEntry | undefined {
  return order.ddts?.[0];
}

// Helper to get primary invoice
function primaryInvoice(order: Order): InvoiceEntry | undefined {
  return order.invoices?.[0];
}

export function isInvoicePaid(order: Order): boolean {
  const inv = primaryInvoice(order);
  if (inv?.invoiceClosed === true) return true;
  if (inv?.invoiceRemainingAmount) {
    const remaining = parseItalianAmount(inv.invoiceRemainingAmount);
    return !isNaN(remaining) && remaining <= 0;
  }
  return false;
}

function hasTrackingData(order: Order): boolean {
  const ddt = primaryDdt(order);
  return !!(ddt?.trackingNumber?.trim());
}

export function isLikelyDelivered(order: Order): boolean {
  const ddt = primaryDdt(order);
  const inv = primaryInvoice(order);
  const isStatusConsegnato = order.status?.toUpperCase() === 'CONSEGNATO';
  if (!hasTrackingData(order) && !isStatusConsegnato) return false;
  if (inv?.invoiceNumber) return true;
  if (ddt?.deliveryConfirmedAt) return true;
  const shippedDate = ddt?.ddtDeliveryDate;
  if (!shippedDate) return false;
  const daysSinceShipped = (Date.now() - new Date(shippedDate).getTime()) / 86_400_000;
  return daysSinceShipped >= 3;
}

export function isOverdue(order: Order): boolean {
  const inv = primaryInvoice(order);
  if (!inv?.invoiceNumber) return false;
  if (isInvoicePaid(order)) return false;
  if (!inv.invoiceDueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(inv.invoiceDueDate) < today;
}
```

In `getOrderStatus`: replace `order.trackingStatus` → `primaryDdt(order)?.trackingStatus`, `order.invoiceNumber` → `primaryInvoice(order)?.invoiceNumber`, `order.deliveryConfirmedAt` → `primaryDdt(order)?.deliveryConfirmedAt`.

Add `parzialmente_consegnato` to `ORDER_STATUS_STYLES` and handle it in `getOrderStatus`:
```typescript
'partially-delivered': {
  label: 'Parz. consegnato',
  description: 'Consegna parziale — backorder in transito',
  borderColor: '#FF9800',
  backgroundColor: '#FFF3E0',
  icon: '📦',
  sidebarLabel: 'Parz. consegnato',
},
```

- [ ] **Step 2: Run type-check and tests**

Run: `npm run type-check --prefix archibald-web-app/frontend`

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/utils/orderStatus.ts
git commit -m "refactor(frontend): orderStatus uses ddts[]/invoices[] arrays"
```

---

## Task 11: Frontend `OrderCardNew.tsx` — backorder toggle

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`

- [ ] **Step 1: Update DDT/invoice access**

Replace:
```typescript
const ddt = order.ddt;
```
with:
```typescript
const ddt = order.ddts?.[0] ?? null;
const backorderDdts = (order.ddts ?? []).slice(1);
const inv = order.invoices?.[0] ?? null;
```

Update all `order.invoiceNumber` → `inv?.invoiceNumber`, `order.invoiceDate` → `inv?.invoiceDate`, etc.

Update tracking fallback:
```typescript
// Before:
const tracking = order.tracking || { trackingNumber: ddt?.trackingNumber, trackingUrl: ddt?.trackingUrl, trackingCourier: ddt?.trackingCourier };
// After:
const tracking = { trackingNumber: ddt?.trackingNumber, trackingUrl: ddt?.trackingUrl, trackingCourier: ddt?.trackingCourier };
```

- [ ] **Step 2: Add backorder toggle section**

After the primary DDT section, add:
```tsx
{backorderDdts.length > 0 && (
  <div style={{ marginTop: 8 }}>
    <button
      onClick={() => setShowBackorders(!showBackorders)}
      style={{ background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', fontSize: 13 }}
    >
      {showBackorders ? '▼' : '▶'} {backorderDdts.length} backorder DDT
    </button>
    {showBackorders && backorderDdts.map((bd) => (
      <div key={bd.id} style={{ marginLeft: 16, marginTop: 4, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
        <div style={{ fontWeight: 500 }}>{bd.ddtNumber} — {bd.ddtDeliveryDate}</div>
        {bd.trackingNumber && <div style={{ fontSize: 12, color: '#666' }}>Tracking: {bd.trackingNumber}</div>}
        {bd.deliveryConfirmedAt && <div style={{ fontSize: 12, color: '#4caf50' }}>Consegnato</div>}
      </div>
    ))}
  </div>
)}
```

Add `showBackorders` state: `const [showBackorders, setShowBackorders] = useState(false);`

- [ ] **Step 3: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(frontend): OrderCardNew supports multiple DDTs with backorder toggle"
```

---

## Task 12: Frontend — remaining components

**Files to modify (mechanical `order.ddt` → `order.ddts[0]` and `order.invoice*` → `order.invoices[0]?.invoice*`):**

- `archibald-web-app/frontend/src/pages/OrderHistory.tsx`
- `archibald-web-app/frontend/src/utils/fresisHistoryFilters.ts`
- `archibald-web-app/frontend/src/components/TrackingTimeline.tsx`
- `archibald-web-app/frontend/src/components/ArcaTabOrdineMadre.tsx`
- `archibald-web-app/frontend/src/components/ArcaTabTesta.tsx`
- `archibald-web-app/frontend/src/components/ArcaDocumentDetail.tsx`
- `archibald-web-app/frontend/src/components/ArcaDocumentList.tsx`
- `archibald-web-app/frontend/src/components/OrderPickerModal.tsx`
- `archibald-web-app/frontend/src/pages/FresisHistoryPage.tsx`

- [ ] **Step 1: Fix each file**

For each file, apply these mechanical replacements:
- `order.ddt?.` → `order.ddts?.[0]?.`
- `order.ddt` (assignment) → `order.ddts?.[0]`
- `order.invoiceNumber` → `order.invoices?.[0]?.invoiceNumber`
- `order.invoiceDate` → `order.invoices?.[0]?.invoiceDate`
- `order.invoiceAmount` → `order.invoices?.[0]?.invoiceAmount`
- (repeat for all 19 invoice fields)
- `order.trackingStatus` → `order.ddts?.[0]?.trackingStatus`
- `order.deliveryConfirmedAt` → `order.ddts?.[0]?.deliveryConfirmedAt`
- `order.deliverySignedBy` → `order.ddts?.[0]?.deliverySignedBy`
- `order.trackingEvents` → `order.ddts?.[0]?.trackingEvents`
- `order.ddt.deliveryAddress` → `order.ddts[0]?.ddtDeliveryAddress` (field renamed)
- `order.ddt.customerReference` → `order.ddts[0]?.ddtCustomerReference` (field renamed)
- `order.ddt.description` → `order.ddts[0]?.ddtDescription` (field renamed)

Use TypeScript type-check as the guide: run `npm run type-check --prefix archibald-web-app/frontend` after each file to verify no remaining errors in that file.

- [ ] **Step 2: Run full type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS — zero type errors

- [ ] **Step 3: Run frontend tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/
git commit -m "refactor(frontend): migrate all components to ddts[]/invoices[] arrays"
```

---

## Task 13: Full test gate

- [ ] **Step 1: Run backend type-check and tests**

```bash
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend -- --run
```

- [ ] **Step 2: Run frontend type-check and tests**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend -- --run
```

Fix any remaining failures before proceeding to Task 14.

---

## Task 14: Migration 043 — Drop old columns (DEFERRED DEPLOY)

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/043-drop-order-documents-columns.sql`

> **Deploy separately** after verifying migration 042 + new code work correctly in production.

- [ ] **Step 1: Write migration**

```sql
-- 043-drop-order-documents-columns.sql
-- DESTRUCTIVE: Drop old flat DDT/invoice/tracking columns from order_records.
-- Only run AFTER verifying migration 042 + new code work correctly.

BEGIN;

ALTER TABLE agents.order_records
  DROP COLUMN IF EXISTS ddt_number,
  DROP COLUMN IF EXISTS ddt_delivery_date,
  DROP COLUMN IF EXISTS ddt_id,
  DROP COLUMN IF EXISTS ddt_customer_account,
  DROP COLUMN IF EXISTS ddt_sales_name,
  DROP COLUMN IF EXISTS ddt_delivery_name,
  DROP COLUMN IF EXISTS delivery_terms,
  DROP COLUMN IF EXISTS delivery_method,
  DROP COLUMN IF EXISTS delivery_city,
  DROP COLUMN IF EXISTS attention_to,
  DROP COLUMN IF EXISTS ddt_delivery_address,
  DROP COLUMN IF EXISTS ddt_quantity,
  DROP COLUMN IF EXISTS ddt_customer_reference,
  DROP COLUMN IF EXISTS ddt_description,
  DROP COLUMN IF EXISTS tracking_number,
  DROP COLUMN IF EXISTS tracking_url,
  DROP COLUMN IF EXISTS tracking_courier,
  DROP COLUMN IF EXISTS delivery_completed_date,
  DROP COLUMN IF EXISTS tracking_status,
  DROP COLUMN IF EXISTS tracking_key_status_cd,
  DROP COLUMN IF EXISTS tracking_status_bar_cd,
  DROP COLUMN IF EXISTS tracking_estimated_delivery,
  DROP COLUMN IF EXISTS tracking_last_location,
  DROP COLUMN IF EXISTS tracking_last_event,
  DROP COLUMN IF EXISTS tracking_last_event_at,
  DROP COLUMN IF EXISTS tracking_last_synced_at,
  DROP COLUMN IF EXISTS tracking_sync_failures,
  DROP COLUMN IF EXISTS tracking_origin,
  DROP COLUMN IF EXISTS tracking_destination,
  DROP COLUMN IF EXISTS tracking_service_desc,
  DROP COLUMN IF EXISTS delivery_confirmed_at,
  DROP COLUMN IF EXISTS delivery_signed_by,
  DROP COLUMN IF EXISTS tracking_events,
  DROP COLUMN IF EXISTS tracking_delay_reason,
  DROP COLUMN IF EXISTS tracking_delivery_attempts,
  DROP COLUMN IF EXISTS tracking_attempted_delivery_at,
  DROP COLUMN IF EXISTS invoice_number,
  DROP COLUMN IF EXISTS invoice_date,
  DROP COLUMN IF EXISTS invoice_amount,
  DROP COLUMN IF EXISTS invoice_customer_account,
  DROP COLUMN IF EXISTS invoice_billing_name,
  DROP COLUMN IF EXISTS invoice_quantity,
  DROP COLUMN IF EXISTS invoice_remaining_amount,
  DROP COLUMN IF EXISTS invoice_tax_amount,
  DROP COLUMN IF EXISTS invoice_line_discount,
  DROP COLUMN IF EXISTS invoice_total_discount,
  DROP COLUMN IF EXISTS invoice_due_date,
  DROP COLUMN IF EXISTS invoice_payment_terms_id,
  DROP COLUMN IF EXISTS invoice_purchase_order,
  DROP COLUMN IF EXISTS invoice_closed,
  DROP COLUMN IF EXISTS invoice_days_past_due,
  DROP COLUMN IF EXISTS invoice_settled_amount,
  DROP COLUMN IF EXISTS invoice_last_payment_id,
  DROP COLUMN IF EXISTS invoice_last_settlement_date,
  DROP COLUMN IF EXISTS invoice_closed_date;

COMMIT;
```

- [ ] **Step 2: Commit (do NOT deploy yet)**

```bash
git add archibald-web-app/backend/src/db/migrations/043-drop-order-documents-columns.sql
git commit -m "feat(db): migration 043 drops old flat DDT/invoice columns (deferred deploy)"
```

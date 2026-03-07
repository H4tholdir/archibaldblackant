# FedEx Tracking Sync — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sync FedEx tracking data via Puppeteer network interception to provide real-time shipment status and visual timeline in the PWA.

**Architecture:** Puppeteer headless browser intercepts JSON responses from `api.fedex.com/track/v2/shipments` when navigating FedEx tracking pages. Data is stored in `order_records` (JSONB + summary fields). Frontend shows a 5-step progress bar on collapsed cards and full event timeline on expanded cards. Sync runs every 3h in burst mode (open browser, process batch, close).

**Tech Stack:** Puppeteer + puppeteer-extra-plugin-stealth, PostgreSQL JSONB, Express handler, BullMQ job, React inline styles.

**Design doc:** `docs/plans/2026-03-07-fedex-tracking-sync-design.md`

---

## Task 1: DB Migration

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/011-tracking-sync.sql`

**Step 1: Write the migration**

```sql
-- 011: Add tracking sync fields to order_records
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_status TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_key_status_cd TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_status_bar_cd TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_estimated_delivery TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_last_location TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_last_event TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_last_event_at TIMESTAMPTZ;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_last_synced_at TIMESTAMPTZ;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_sync_failures INTEGER DEFAULT 0;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_origin TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_destination TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_service_desc TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMPTZ;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS delivery_signed_by TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_events JSONB;

CREATE INDEX IF NOT EXISTS idx_order_records_tracking_active
ON agents.order_records (tracking_number, tracking_status)
WHERE tracking_number IS NOT NULL
  AND (tracking_status IS NULL OR tracking_status NOT IN ('delivered'))
  AND delivery_confirmed_at IS NULL;
```

**Step 2: Verify migration runs locally**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: PASS (compilation succeeds)

**Step 3: Commit**

```
feat(db): add tracking sync fields to order_records (migration 011)
```

---

## Task 2: Backend types and repository mapping

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/orders.ts` (OrderRow type, mapRowToOrder)

**Step 1: Add tracking fields to OrderRow type**

Add these fields to the `OrderRow` type (snake_case DB columns):

```ts
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
tracking_events: unknown; // JSONB
```

**Step 2: Add fields to Order type and mapRowToOrder**

Map snake_case to camelCase in `mapRowToOrder`:

```ts
trackingStatus: row.tracking_status ?? undefined,
trackingKeyStatusCd: row.tracking_key_status_cd ?? undefined,
trackingStatusBarCd: row.tracking_status_bar_cd ?? undefined,
trackingEstimatedDelivery: row.tracking_estimated_delivery ?? undefined,
trackingLastLocation: row.tracking_last_location ?? undefined,
trackingLastEvent: row.tracking_last_event ?? undefined,
trackingLastEventAt: row.tracking_last_event_at ?? undefined,
trackingLastSyncedAt: row.tracking_last_synced_at ?? undefined,
trackingSyncFailures: row.tracking_sync_failures ?? undefined,
trackingOrigin: row.tracking_origin ?? undefined,
trackingDestination: row.tracking_destination ?? undefined,
trackingServiceDesc: row.tracking_service_desc ?? undefined,
deliveryConfirmedAt: row.delivery_confirmed_at ?? undefined,
deliverySignedBy: row.delivery_signed_by ?? undefined,
trackingEvents: row.tracking_events ?? undefined,
```

**Step 3: Add tracking update function to repository**

Create `updateTrackingData(pool, userId, orderNumber, trackingData)` that UPDATEs all 15 tracking fields for a given order.

**Step 4: Run type-check**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: PASS

**Step 5: Commit**

```
feat(backend): add tracking sync fields to OrderRow and mapRowToOrder
```

---

## Task 3: FedEx scraper module

**Files:**
- Create: `archibald-web-app/backend/src/sync/services/fedex-tracking-scraper.ts`
- Create: `archibald-web-app/backend/src/sync/services/fedex-tracking-scraper.spec.ts`

**Step 1: Install dependencies**

```bash
cd archibald-web-app/backend
npm install puppeteer-extra puppeteer-extra-plugin-stealth
```

Note: `puppeteer` is already a dependency (used by archibald-bot).

**Step 2: Write types**

```ts
type FedExScanEvent = {
  date: string;
  time: string;
  gmtOffset: string;
  status: string;
  statusCD: string;
  scanLocation: string;
  delivered: boolean;
  exception: boolean;
};

type FedExTrackingResult = {
  trackingNumber: string;
  success: boolean;
  error?: string;
  keyStatus?: string;
  keyStatusCD?: string;
  statusBarCD?: string;
  lastScanStatus?: string;
  lastScanDateTime?: string;
  lastScanLocation?: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  receivedByName?: string;
  origin?: string;
  destination?: string;
  serviceDesc?: string;
  scanEvents?: FedExScanEvent[];
};
```

**Step 3: Write the `parseTrackingResponse` pure function (testable)**

This function takes the raw JSON from `api.fedex.com/track/v2/shipments` and returns `FedExTrackingResult`. This is the core parsing logic, fully unit-testable without Puppeteer.

```ts
function parseTrackingResponse(
  trackingNumber: string,
  json: { output?: { packages?: Array<Record<string, unknown>> } },
): FedExTrackingResult
```

Logic:
- Extract `packages[0]` from response
- Map fields: `keyStatus`, `keyStatusCD`, `statusBarCD`, `lastScanStatus`, `lastScanDateTime`
- Build origin from `shipperAddress.city + ", " + shipperAddress.countryCode`
- Build destination from `recipientAddress.city + ", " + recipientAddress.countryCode`
- Map `scanEventList` to `FedExScanEvent[]` (keep only the fields we need)
- Return `{ success: true, ...fields }` or `{ success: false, error }` if packages missing

**Step 4: Write unit tests for `parseTrackingResponse`**

Test with the real JSON structure captured from FedEx (use the verified data from the design doc). Test cases:
- Normal in-transit response (the 445291931033 example)
- Delivered response (with `actDeliveryDt` and `receivedByNm` populated, `scanEventList` with `delivered: true`)
- Empty/missing packages array
- Missing scanEventList

**Step 5: Run tests**

Run: `npm test --prefix archibald-web-app/backend -- --run fedex-tracking-scraper`
Expected: PASS

**Step 6: Write the `scrapeFedExTracking` function**

```ts
async function scrapeFedExTracking(
  trackingNumbers: string[],
  onProgress?: (processed: number, total: number) => void,
): Promise<FedExTrackingResult[]>
```

Logic:
1. Launch `puppeteer-extra` with stealth plugin
2. Create one page
3. For each tracking number:
   - Set up response listener for `api.fedex.com/track/v2/shipments`
   - Navigate to `https://www.fedex.com/fedextrack/?trknbr={number}`
   - Wait for intercepted response (timeout 15s)
   - Call `parseTrackingResponse` on the JSON
   - Random delay 2-5 seconds
   - Report progress
4. Close browser
5. Return results array

Browser flags: `--no-sandbox`, `--disable-gpu`, `--disable-dev-shm-usage`, `--disable-setuid-sandbox`
User-Agent: random from pool of 10-15 real Chrome UAs

**Step 7: Commit**

```
feat(backend): add FedEx tracking scraper with network interception
```

---

## Task 4: Tracking sync service

**Files:**
- Create: `archibald-web-app/backend/src/sync/services/tracking-sync.ts`
- Create: `archibald-web-app/backend/src/sync/services/tracking-sync.spec.ts`

**Step 1: Write types**

```ts
type TrackingSyncDeps = {
  pool: DbPool;
  scrapeFedEx: (trackingNumbers: string[], onProgress?: (p: number, t: number) => void) => Promise<FedExTrackingResult[]>;
};

type TrackingSyncResult = {
  success: boolean;
  trackingProcessed: number;
  trackingUpdated: number;
  trackingFailed: number;
  newDeliveries: number;
  duration: number;
  error?: string;
  suspended?: boolean;
};
```

**Step 2: Write `mapTrackingStatus` pure function**

```ts
function mapTrackingStatus(statusBarCD: string, keyStatusCD: string): string
```

Mapping (from design doc):
- `statusBarCD === 'DL'` -> `'delivered'`
- `statusBarCD === 'DE'` -> `'exception'`
- `keyStatusCD === 'OD'` -> `'out_for_delivery'`
- `statusBarCD === 'OW'` -> `'in_transit'`
- else -> `'pending'`

**Step 3: Write unit tests for `mapTrackingStatus`**

Test all mapping cases.

**Step 4: Write `syncTracking` main function**

```ts
async function syncTracking(
  deps: TrackingSyncDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  shouldStop: () => boolean,
): Promise<TrackingSyncResult>
```

Logic:
1. Query active tracking orders (tracking_number NOT NULL, delivery_confirmed_at IS NULL)
2. Pass tracking numbers to scraper in batches of 50
3. For each result:
   - If success: call `updateTrackingData` repo function with mapped fields
   - If delivered: also set `delivery_confirmed_at`, `delivery_signed_by`
   - If failure: increment `tracking_sync_failures`
4. If >50% failures: set `suspended = true`, return early
5. Return result counts

**Step 5: Write integration test for syncTracking**

Test with mocked scraper (don't call real FedEx). Verify:
- DB gets updated correctly for in-transit result
- DB gets updated correctly for delivered result
- Failure counter increments on error
- Suspension triggers at >50% failure rate

**Step 6: Run tests**

Run: `npm test --prefix archibald-web-app/backend -- --run tracking-sync`
Expected: PASS

**Step 7: Commit**

```
feat(backend): add tracking sync service with status mapping
```

---

## Task 5: Operation handler and registration

**Files:**
- Create: `archibald-web-app/backend/src/operations/handlers/sync-tracking.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/index.ts` (add export)
- Modify: `archibald-web-app/backend/src/operations/operation-types.ts` (add 'sync-tracking')
- Modify: `archibald-web-app/backend/src/main.ts` (register handler)
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts` (add to agentTypes)

**Step 1: Create handler**

Follow exact pattern of `sync-ddt.ts`:

```ts
import type { DbPool } from '../../db/pool';
import type { TrackingSyncResult } from '../../sync/services/tracking-sync';
import { syncTracking } from '../../sync/services/tracking-sync';
import { scrapeFedExTracking } from '../../sync/services/fedex-tracking-scraper';
import type { OperationHandler } from '../operation-processor';

function createSyncTrackingHandler(pool: DbPool): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const result: TrackingSyncResult = await syncTracking(
      { pool, scrapeFedEx: scrapeFedExTracking },
      userId,
      onProgress,
      () => false,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncTrackingHandler };
```

**Step 2: Add to operation-types.ts**

- Add `'sync-tracking'` to `OPERATION_TYPES` array (after `'sync-ddt'`)
- Add `'sync-tracking': 17` to `OPERATION_PRIORITIES`
- Add `'sync-tracking'` to `SCHEDULED_SYNCS` set
- Add `'sync-tracking'` to `AGENT_SYNC_CHAIN` array (after `'sync-invoices'`)

**Step 3: Export from handlers/index.ts**

Add `export { createSyncTrackingHandler } from './sync-tracking';`

**Step 4: Register in main.ts**

In the handlers object, add:

```ts
'sync-tracking': createSyncTrackingHandler(pool),
```

Note: unlike sync-ddt, this handler does NOT use the Archibald browser pool. It has its own Puppeteer instance inside the scraper.

**Step 5: Add to sync-scheduler.ts**

In `updateInterval` function (line 148), add `'tracking'` to the agentTypes Set:

```ts
const agentTypes = new Set(['customers', 'orders', 'ddt', 'invoices', 'tracking']);
```

**Step 6: Run type-check and existing tests**

Run: `npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend`
Expected: PASS (no regressions)

**Step 7: Commit**

```
feat(backend): register sync-tracking handler and scheduler
```

---

## Task 6: Frontend Order type and status logic

**Files:**
- Modify: `archibald-web-app/frontend/src/types/order.ts` (add tracking fields)
- Modify: `archibald-web-app/frontend/src/utils/orderStatus.ts` (data-driven logic)
- Modify: `archibald-web-app/frontend/src/utils/orderStatus.spec.ts` (new tests)

**Step 1: Add fields to Order interface**

In `order.ts`, add to `Order` interface:

```ts
trackingStatus?: string;
trackingKeyStatusCd?: string;
trackingStatusBarCd?: string;
trackingEstimatedDelivery?: string;
trackingLastLocation?: string;
trackingLastEvent?: string;
trackingLastEventAt?: string;
trackingOrigin?: string;
trackingDestination?: string;
trackingServiceDesc?: string;
trackingSyncFailures?: number;
deliveryConfirmedAt?: string;
deliverySignedBy?: string;
trackingEvents?: Array<{
  date: string;
  time: string;
  gmtOffset: string;
  status: string;
  statusCD: string;
  scanLocation: string;
  delivered: boolean;
  exception: boolean;
}>;
```

**Step 2: Add 'exception' to OrderStatusCategory and styles**

Add to `OrderStatusCategory` type:

```ts
| "exception"
```

Add to `ORDER_STATUS_STYLES`:

```ts
exception: {
  category: "exception",
  label: "Eccezione corriere",
  description: "Il corriere segnala un problema con la spedizione",
  borderColor: "#E65100",
  backgroundColor: "#FFF3E0",
},
```

**Step 3: Modify getOrderStatus — add tracking-based checks**

Insert BEFORE the existing `isLikelyDelivered` check (priority 4) and `isInTransit` check (priority 5):

```ts
// Data-driven tracking status (from FedEx sync)
if (order.deliveryConfirmedAt) {
  return ORDER_STATUS_STYLES.delivered;
}

if (order.trackingStatus === 'exception') {
  return ORDER_STATUS_STYLES.exception;
}

if (order.trackingStatus === 'out_for_delivery' || order.trackingStatus === 'in_transit') {
  return ORDER_STATUS_STYLES["in-transit"];
}
```

The existing `isLikelyDelivered` and `isInTransit` euristiche restano come fallback per ordini senza tracking sync.

**Step 4: Write new tests**

Test cases:
- Order with `deliveryConfirmedAt` set -> delivered (even without invoice)
- Order with `trackingStatus = 'in_transit'` -> in-transit
- Order with `trackingStatus = 'out_for_delivery'` -> in-transit
- Order with `trackingStatus = 'exception'` -> exception
- Order with `trackingStatus = null` + old euristic data -> fallback to old logic
- Priority: paid > overdue > invoiced > deliveryConfirmedAt > exception > trackingStatus in_transit > old euristiche

**Step 5: Run tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run orderStatus`
Expected: PASS

**Step 6: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 7: Commit**

```
feat(frontend): data-driven order status with FedEx tracking fallback
```

---

## Task 7: Frontend mini progress bar (card collassata)

**Files:**
- Create: `archibald-web-app/frontend/src/components/TrackingProgressBar.tsx`
- Create: `archibald-web-app/frontend/src/components/TrackingProgressBar.spec.tsx`
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx` (integrate in header)

**Step 1: Write `getTrackingStep` pure function**

```ts
type TrackingStep = {
  label: string;
  detail: string; // "Bielefeld DE, 4:18 PM"
  completed: boolean;
  active: boolean;
};

function getTrackingSteps(
  scanEvents: FedExScanEvent[],
  destinationCountry: string,
): TrackingStep[]
```

Logic (from design):
- Step 0 "Ritirato": PU event
- Step 1 "In viaggio": DP/IT/AR events
- Step 2 "Hub locale": AR event where scanLocation ends with destination country code
- Step 3 "In consegna": OD event
- Step 4 "Consegnato": DL event

For each step, find the LATEST matching event, extract location + time for detail.
Mark completed = true for all steps up to and including the current.
Mark active = true for the current step only.

**Step 2: Write unit tests for `getTrackingSteps`**

Test with real scan events from the 445291931033 example. Expected:
- Ritirato: completed, detail "BIELEFELD DE, 4:18 PM"
- In viaggio: active, detail "ROISSY CHARLES DE GAULLE CEDEX FR, 4:57 AM"
- Hub locale: not completed (no AR in IT yet)
- In consegna: not completed
- Consegnato: not completed

Also test fully delivered scenario and edge cases.

**Step 3: Write TrackingProgressBar component**

Props: `{ steps: TrackingStep[], borderColor: string, origin: string, destination: string }`

Renders:
- 5 circles connected by lines
- Completed circles: filled with `borderColor`
- Active circle: filled + pulse animation
- Future circles: gray border, empty
- Below active circle: detail text (event + location + time)
- Origin label on left, destination on right

Use inline styles (consistent with codebase).

**Step 4: Write component test**

Test that it renders all 5 steps, marks active one, shows detail text.

**Step 5: Integrate in OrderCardNew.tsx header**

In the header section (card collapsed), after the status badge:

```tsx
{order.trackingStatus && order.trackingEvents && order.trackingEvents.length > 0 && (
  <TrackingProgressBar
    steps={getTrackingSteps(order.trackingEvents, order.trackingDestination?.split(', ').pop() || 'IT')}
    borderColor={orderStatusStyle.borderColor}
    origin={order.trackingOrigin || ''}
    destination={order.trackingDestination || ''}
  />
)}
```

Only shown when tracking sync data is available. Old orders without tracking show nothing new.

**Step 6: Run tests and type-check**

Run: `npm test --prefix archibald-web-app/frontend && npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 7: Commit**

```
feat(frontend): add tracking progress bar to collapsed order card
```

---

## Task 8: Frontend timeline espansa

**Files:**
- Create: `archibald-web-app/frontend/src/components/TrackingTimeline.tsx`
- Create: `archibald-web-app/frontend/src/components/TrackingTimeline.spec.tsx`
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx` (integrate in expanded tracking section)

**Step 1: Write `groupEventsByDay` pure function**

```ts
type GroupedEvents = {
  dayLabel: string; // "Sabato, 7 mar 2026"
  events: Array<{
    time: string;   // "04:57"
    status: string;
    location: string;
    isLatest: boolean;
  }>;
}[];

function groupEventsByDay(scanEvents: FedExScanEvent[]): GroupedEvents
```

Groups events by `date` field, formats day label in Italian, marks the first event (most recent) as `isLatest`.

**Step 2: Write unit tests for `groupEventsByDay`**

Test with the real 445291931033 scan events. Expected: 2 groups (Friday 6 mar, Saturday 7 mar), correct event counts per day.

**Step 3: Write TrackingTimeline component**

Props: `{ order: Order, borderColor: string }`

Renders:
- Header: estimated delivery date (or confirmed + signed by)
- Origin -> Destination route
- Vertical timeline with day groups
- Each event: time, dot, status text, location
- Latest event highlighted with borderColor
- "Apri tracking su FedEx" link button at bottom

**Step 4: Write component test**

Test rendering with mock order data containing trackingEvents.

**Step 5: Integrate in OrderCardNew.tsx expanded section**

Replace or augment the current tracking section (lines ~2280-2640) with:

```tsx
{order.trackingEvents && order.trackingEvents.length > 0 ? (
  <TrackingTimeline order={order} borderColor={orderStatusStyle.borderColor} />
) : (
  /* existing tracking display (just the button) */
)}
```

Keep existing DDT, recipient, shipping details sections unchanged.

**Step 6: Run tests and type-check**

Run: `npm test --prefix archibald-web-app/frontend && npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 7: Commit**

```
feat(frontend): add full tracking timeline to expanded order card
```

---

## Task 9: SyncControlPanel and monitoring integration

**Files:**
- Modify: `archibald-web-app/frontend/src/components/SyncControlPanel.tsx`

**Step 1: Add 'tracking' to SyncType**

Add `| "tracking"` to the `SyncType` union (line 6-13).

**Step 2: Add to syncSections**

```ts
{ type: "tracking", label: "Tracking FedEx", icon: "📍", priority: 4 },
```

**Step 3: Add to ALL_SYNC_TYPES**

Add `"tracking"` to the array (line 51).

**Step 4: Add to state objects**

Add `"tracking": false` to both `syncing` and `deletingDb` initial state objects.

**Step 5: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 6: Commit**

```
feat(frontend): integrate tracking sync in SyncControlPanel
```

---

## Task 10: Update OrderStatusLegend

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderStatusLegend.tsx`

**Step 1: Verify legend auto-updates**

The legend uses `getAllStatusStyles()` which returns all entries from `ORDER_STATUS_STYLES`. Since we added `exception` to the styles in Task 6, the legend should automatically include it.

Verify by checking that `getAllStatusStyles()` returns 11 items (was 10).

**Step 2: Run tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run orderStatus`
Expected: Update the test "returns all 10 status styles" to expect 11.

**Step 3: Commit**

```
fix(frontend): update status legend test for new exception status
```

---

## Task 11: Final integration test and cleanup

**Step 1: Run full backend test suite**

Run: `npm test --prefix archibald-web-app/backend`
Expected: PASS

**Step 2: Run full frontend test suite**

Run: `npm test --prefix archibald-web-app/frontend`
Expected: PASS

**Step 3: Run type-check on both**

Run: `npm run build --prefix archibald-web-app/backend && npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 4: Final commit**

```
chore: FedEx tracking sync implementation complete
```

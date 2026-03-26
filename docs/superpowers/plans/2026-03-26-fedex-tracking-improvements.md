# FedEx Tracking Improvements & Reportistica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estendere il sistema FedEx per riconoscere tutti i codici di stato, tracciare le eccezioni in una tabella dedicata, arricchire le notifiche, aggiornare la UI delle card ordine e aggiungere una sezione di reportistica admin con export PDF per reclami.

**Architecture:** Il DB viene modificato per primo (migration 036), poi il backend sync e repository, poi le API e il frontend. Ogni task produce codice compilabile e testato in isolamento.

**Tech Stack:** Express + pg pool (backend), React 19 + TypeScript strict (frontend), Vitest, schema `agents.*`. Puppeteer già installato per PDF. Pattern factory `createXxxRouter(deps)` per i router.

---

## File Structure

**Nuovi file:**
- `backend/src/db/migrations/036-fedex-tracking-improvements.sql`
- `backend/src/db/repositories/tracking-exceptions.ts`
- `backend/src/services/fedex-claim-pdf.ts`
- `backend/src/routes/tracking.ts`
- `frontend/src/services/fedex-report.service.ts`
- `frontend/src/components/admin/FedExReportSection.tsx`

**File modificati:**
- `backend/src/sync/services/fedex-api-tracker.ts` — nuovi campi nei tipi e nel parsing
- `backend/src/sync/services/tracking-sync.ts` — `mapTrackingStatus` espanso, logging eccezioni, risoluzione
- `backend/src/db/repositories/orders.ts` — 3 nuove colonne in `updateTrackingData`
- `backend/src/main.ts` — notifiche arricchite, nuovi tipi evento, registra router tracking
- `backend/src/routes/admin.ts` — 4 nuovi endpoint `/tracking/*`
- `frontend/src/services/notifications.service.ts` — `getNotificationRoute` con `?highlight=`
- `frontend/src/components/TrackingProgressBar.tsx` — nuovi stati, `exceptionCode`
- `frontend/src/components/OrderCardNew.tsx` — badge eccezioni storiche, colori held/returning/canceled
- `frontend/src/pages/OrderHistory.tsx` — highlight query param, filtro eccezioni
- `frontend/src/pages/AdminPage.tsx` — aggiunge `FedExReportSection`

---

## Task 1: DB Migration 036

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/036-fedex-tracking-improvements.sql`

- [ ] **Step 1: Crea il file di migrazione**

```sql
-- 036: FedEx tracking improvements — new columns + tracking_exceptions table

ALTER TABLE agents.order_records
  ADD COLUMN IF NOT EXISTS tracking_delay_reason          TEXT,
  ADD COLUMN IF NOT EXISTS tracking_delivery_attempts     INTEGER,
  ADD COLUMN IF NOT EXISTS tracking_attempted_delivery_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS agents.tracking_exceptions (
  id                    SERIAL PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  order_number          TEXT NOT NULL,
  tracking_number       TEXT NOT NULL,
  exception_code        TEXT,
  exception_description TEXT NOT NULL,
  exception_type        TEXT NOT NULL
    CHECK (exception_type IN ('exception', 'held', 'returning', 'canceled')),
  occurred_at           TIMESTAMPTZ NOT NULL,
  resolved_at           TIMESTAMPTZ,
  resolution            TEXT CHECK (resolution IN ('delivered', 'returned', 'claimed')),
  claim_status          TEXT DEFAULT NULL
    CHECK (claim_status IN ('open', 'submitted', 'resolved')),
  claim_submitted_at    TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tracking_number, occurred_at)
);

CREATE INDEX IF NOT EXISTS idx_tracking_exceptions_user
  ON agents.tracking_exceptions (user_id);
CREATE INDEX IF NOT EXISTS idx_tracking_exceptions_order
  ON agents.tracking_exceptions (order_number);
CREATE INDEX IF NOT EXISTS idx_tracking_exceptions_open
  ON agents.tracking_exceptions (user_id, resolved_at)
  WHERE resolved_at IS NULL;

DROP INDEX IF EXISTS idx_order_records_tracking_active;
CREATE INDEX IF NOT EXISTS idx_order_records_tracking_active
ON agents.order_records (tracking_number, tracking_status)
WHERE tracking_number IS NOT NULL
  AND (tracking_status IS NULL
       OR tracking_status NOT IN ('delivered', 'returning', 'canceled'))
  AND delivery_confirmed_at IS NULL;
```

- [ ] **Step 2: Applica la migrazione e verifica**

```bash
npm run migrate --prefix archibald-web-app/backend
```

Expected: `Applied migration: 036-fedex-tracking-improvements.sql`

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/036-fedex-tracking-improvements.sql
git commit -m "feat(db): migration 036 — FedEx tracking improvements + tracking_exceptions table"
```

---

## Task 2: `fedex-api-tracker.ts` — nuovi tipi e campi di parsing

**Files:**
- Modify: `archibald-web-app/backend/src/sync/services/fedex-api-tracker.ts`
- Test: `archibald-web-app/backend/src/sync/services/fedex-api-tracker.spec.ts`

- [ ] **Step 1: Scrivi il test failing per `parseApiTrackResult`**

Crea il file `archibald-web-app/backend/src/sync/services/fedex-api-tracker.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { parseApiTrackResult } from './fedex-api-tracker';

describe('parseApiTrackResult', () => {
  test('estrae exceptionCode dal scan event', () => {
    const result = parseApiTrackResult('123', {
      latestStatusDetail: { code: 'DE', derivedCode: 'DE', statusByLocale: 'Eccezione', description: 'Exception' },
      scanEvents: [{
        date: '2026-03-25T10:14:00+01:00',
        eventDescription: 'Delivery exception',
        derivedStatusCode: 'DE',
        exceptionCode: 'DEX08',
        exceptionDescription: 'Recipient not in',
      }],
    });
    expect(result.success).toBe(true);
    expect(result.scanEvents?.[0].exceptionCode).toBe('DEX08');
  });

  test('estrae delayReason, deliveryAttempts e attemptedDeliveryAt', () => {
    const result = parseApiTrackResult('456', {
      latestStatusDetail: {
        code: 'DE', derivedCode: 'DE', statusByLocale: 'Eccezione', description: 'Delay',
        delayDetail: { type: 'WEATHER', subType: 'SNOW', status: 'DELAYED' },
      },
      deliveryDetails: { deliveryAttempts: '3' },
      dateAndTimes: [{ type: 'ATTEMPTED_DELIVERY', dateTime: '2026-03-24T09:00:00+01:00' }],
    });
    expect(result.delayReason).toBe('WEATHER');
    expect(result.deliveryAttempts).toBe(3);
    expect(result.attemptedDeliveryAt).toBe('2026-03-24T09:00:00+01:00');
  });

  test('returns undefined for missing optional fields', () => {
    const result = parseApiTrackResult('789', {
      latestStatusDetail: { code: 'IT', derivedCode: 'IT', statusByLocale: 'In transito', description: 'In transit' },
    });
    expect(result.delayReason).toBeUndefined();
    expect(result.deliveryAttempts).toBeUndefined();
    expect(result.attemptedDeliveryAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verifica che il test fallisce**

```bash
npm test --prefix archibald-web-app/backend -- fedex-api-tracker.spec
```

Expected: FAIL — `result.scanEvents?.[0].exceptionCode` is undefined

- [ ] **Step 3: Aggiorna i tipi in `fedex-api-tracker.ts`**

Sostituisci il blocco dei tipi (righe 74–105) con:

```typescript
type FedExApiScanEvent = {
  date?: string;
  derivedStatus?: string;
  eventDescription?: string;
  eventType?: string;
  derivedStatusCode?: string;
  scanLocation?: FedExApiAddress;
  exceptionCode?: string;
  exceptionDescription?: string;
};

type FedExApiTrackResult = {
  trackingNumberInfo?: { trackingNumber?: string };
  latestStatusDetail?: {
    code?: string;
    derivedCode?: string;
    statusByLocale?: string;
    description?: string;
    scanLocation?: FedExApiAddress;
    delayDetail?: { type?: string; subType?: string; status?: string };
  };
  dateAndTimes?: Array<{ type?: string; dateTime?: string }>;
  serviceDetail?: { description?: string; type?: string };
  shipperInformation?: { address?: FedExApiAddress };
  recipientInformation?: { address?: FedExApiAddress };
  originLocation?: { locationContactAndAddress?: { address?: FedExApiAddress } };
  destinationLocation?: { locationContactAndAddress?: { address?: FedExApiAddress } };
  deliveryDetails?: {
    receivedByName?: string;
    actualDeliveryAddress?: FedExApiAddress;
    deliveryAttempts?: string;
  };
  scanEvents?: FedExApiScanEvent[];
  error?: { code?: string; message?: string };
};
```

Aggiungi `delayReason`, `deliveryAttempts`, `attemptedDeliveryAt` al tipo `FedExTrackingResult` (righe 15–32):

```typescript
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
  delayReason?: string;
  deliveryAttempts?: number;
  attemptedDeliveryAt?: string;
  scanEvents?: FedExScanEvent[];
};
```

Aggiungi `exceptionCode` a `FedExScanEvent` (righe 3–13):

```typescript
type FedExScanEvent = {
  date: string;
  time: string;
  gmtOffset: string;
  status: string;
  statusCD: string;
  scanLocation: string;
  delivered: boolean;
  exception: boolean;
  exceptionCode: string;
  exceptionDescription: string;
};
```

- [ ] **Step 4: Aggiorna `parseApiTrackResult` per estrarre i nuovi campi**

Nel mapping di `scanEvents` (linea ~145), aggiungi `exceptionCode`:

```typescript
const scanEvents: FedExScanEvent[] = (result.scanEvents ?? []).map((e) => ({
  date: e.date?.split('T')[0] ?? '',
  time: e.date?.split('T')[1]?.split(/[+-]/)[0] ?? '',
  gmtOffset: '',
  status: e.eventDescription ?? e.derivedStatus ?? '',
  statusCD: e.derivedStatusCode ?? e.eventType ?? '',
  scanLocation: buildLocation(e.scanLocation) ?? '',
  delivered: e.derivedStatusCode === 'DL',
  exception: e.derivedStatusCode === 'DE' || Boolean(e.exceptionDescription),
  exceptionCode: e.exceptionCode ?? '',
  exceptionDescription: e.exceptionDescription ?? '',
}));
```

Prima del `return` finale in `parseApiTrackResult`, aggiungi:

```typescript
  return {
    trackingNumber,
    success: true,
    keyStatus: latest?.statusByLocale,
    keyStatusCD: latest?.derivedCode,
    statusBarCD: latest?.code,
    lastScanStatus: latest?.description,
    lastScanDateTime: scanEvents.length > 0
      ? `${scanEvents[0].date} ${scanEvents[0].time}`
      : undefined,
    lastScanLocation,
    estimatedDelivery: findDateTime(result.dateAndTimes, 'ESTIMATED_DELIVERY'),
    actualDelivery: findDateTime(result.dateAndTimes, 'ACTUAL_DELIVERY'),
    receivedByName: result.deliveryDetails?.receivedByName,
    origin: buildLocation(shipperAddr),
    destination: buildLocation(recipientAddr),
    serviceDesc: result.serviceDetail?.description,
    delayReason: result.latestStatusDetail?.delayDetail?.type,
    deliveryAttempts: result.deliveryDetails?.deliveryAttempts
      ? parseInt(result.deliveryDetails.deliveryAttempts, 10)
      : undefined,
    attemptedDeliveryAt: findDateTime(result.dateAndTimes, 'ATTEMPTED_DELIVERY'),
    scanEvents,
  };
```

- [ ] **Step 5: Verifica test + type-check**

```bash
npm test --prefix archibald-web-app/backend -- fedex-api-tracker.spec
npm run build --prefix archibald-web-app/backend
```

Expected: 3 test PASS, build OK

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/sync/services/fedex-api-tracker.ts \
        archibald-web-app/backend/src/sync/services/fedex-api-tracker.spec.ts
git commit -m "feat(fedex): extract exceptionCode, delayReason, deliveryAttempts from API response"
```

---

## Task 3: `mapTrackingStatus` + `updateTrackingData` nuovi campi

**Files:**
- Modify: `archibald-web-app/backend/src/sync/services/tracking-sync.ts`
- Modify: `archibald-web-app/backend/src/db/repositories/orders.ts`
- Test: `archibald-web-app/backend/src/sync/services/tracking-sync.spec.ts`

- [ ] **Step 1: Scrivi test failing per `mapTrackingStatus`**

Crea `archibald-web-app/backend/src/sync/services/tracking-sync.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { mapTrackingStatus } from './tracking-sync';

describe('mapTrackingStatus', () => {
  const cases: Array<[string, string, string]> = [
    ['DL', 'DL', 'delivered'],
    ['RS', 'IT', 'returning'],
    ['RP', 'IT', 'returning'],
    ['IT', 'RS', 'returning'],
    ['HL', 'IT', 'held'],
    ['HP', 'IT', 'held'],
    ['IT', 'HL', 'held'],
    ['CA', 'IT', 'canceled'],
    ['DE', 'IT', 'exception'],
    ['IT', 'DE', 'exception'],
    ['IT', 'DF', 'exception'],
    ['SE', 'IT', 'exception'],
    ['DY', 'IT', 'exception'],
    ['DD', 'IT', 'exception'],
    ['CD', 'IT', 'exception'],
    ['OD', 'OD', 'out_for_delivery'],
    ['IT', 'OD', 'out_for_delivery'],
    ['IT', 'IT', 'in_transit'],
    ['PU', 'PU', 'in_transit'],
    ['OW', 'IT', 'in_transit'],
    ['AR', 'IT', 'in_transit'],
    ['DP', 'IT', 'in_transit'],
    ['AF', 'IT', 'in_transit'],
    ['FD', 'IT', 'in_transit'],
    ['XX', 'YY', 'pending'],
  ];

  test.each(cases)('statusBarCD=%s keyStatusCD=%s → %s', (bar, key, expected) => {
    expect(mapTrackingStatus(bar, key)).toBe(expected);
  });
});
```

- [ ] **Step 2: Verifica che il test fallisce per i nuovi codici**

```bash
npm test --prefix archibald-web-app/backend -- tracking-sync.spec
```

Expected: FAIL per RS→returning, HL→held, CA→canceled, SE→exception, DY→exception, DD→exception, CD→exception

- [ ] **Step 3: Sostituisci `mapTrackingStatus` in `tracking-sync.ts`**

Sostituisci la funzione alle righe 24–32 con:

```typescript
function mapTrackingStatus(statusBarCD: string, keyStatusCD: string): string {
  if (statusBarCD === 'DL') return 'delivered';
  if (statusBarCD === 'RS' || statusBarCD === 'RP' || keyStatusCD === 'RS') return 'returning';
  if (statusBarCD === 'HL' || statusBarCD === 'HP' || keyStatusCD === 'HL') return 'held';
  if (statusBarCD === 'CA') return 'canceled';
  if (statusBarCD === 'DE' || keyStatusCD === 'DE' || keyStatusCD === 'DF'
    || statusBarCD === 'SE' || statusBarCD === 'DY'
    || statusBarCD === 'DD' || statusBarCD === 'CD') return 'exception';
  if (keyStatusCD === 'OD' || statusBarCD === 'OD') return 'out_for_delivery';
  if (statusBarCD === 'IT' || statusBarCD === 'OW' || statusBarCD === 'PU'
    || statusBarCD === 'DP' || statusBarCD === 'AR' || statusBarCD === 'AF'
    || statusBarCD === 'FD') return 'in_transit';
  return 'pending';
}
```

- [ ] **Step 4: Aggiorna `updateTrackingData` in `orders.ts`**

Trova la funzione `updateTrackingData`. Aggiungi i 3 nuovi campi al tipo `data`:

```typescript
async function updateTrackingData(
  pool: DbPool,
  userId: string,
  orderNumber: string,
  data: {
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
  },
): Promise<void>
```

Nella query UPDATE, aggiungi al SET (dopo `tracking_last_synced_at = NOW()`):

```sql
tracking_delay_reason = $17,
tracking_delivery_attempts = $18,
tracking_attempted_delivery_at = $19
```

Aggiungi i 3 parametri in coda all'array dei valori:
```typescript
data.trackingDelayReason,
data.trackingDeliveryAttempts,
data.trackingAttemptedDeliveryAt,
```

- [ ] **Step 5: Aggiorna la chiamata in `tracking-sync.ts`**

In `syncTracking`, nella chiamata a `updateTrackingData` (riga ~87), aggiungi i 3 nuovi campi:

```typescript
await updateTrackingData(pool, userId, orderNumber, {
  trackingStatus: status,
  trackingKeyStatusCd: result.keyStatusCD ?? '',
  trackingStatusBarCd: result.statusBarCD ?? '',
  trackingEstimatedDelivery: result.estimatedDelivery ?? '',
  trackingLastLocation: result.lastScanLocation ?? '',
  trackingLastEvent: result.lastScanStatus ?? '',
  trackingLastEventAt: result.lastScanDateTime ?? '',
  trackingOrigin: result.origin ?? '',
  trackingDestination: result.destination ?? '',
  trackingServiceDesc: result.serviceDesc ?? '',
  deliveryConfirmedAt: status === 'delivered' ? (result.actualDelivery ?? null) : null,
  deliverySignedBy: status === 'delivered' ? (result.receivedByName ?? null) : null,
  trackingEvents: result.scanEvents ?? [],
  trackingSyncFailures: 0,
  trackingDelayReason: result.delayReason ?? null,
  trackingDeliveryAttempts: result.deliveryAttempts ?? null,
  trackingAttemptedDeliveryAt: result.attemptedDeliveryAt ?? null,
});
```

- [ ] **Step 6: Verifica test + build**

```bash
npm test --prefix archibald-web-app/backend -- tracking-sync.spec
npm run build --prefix archibald-web-app/backend
```

Expected: tutti i 25 casi PASS, build OK

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/sync/services/tracking-sync.ts \
        archibald-web-app/backend/src/sync/services/tracking-sync.spec.ts \
        archibald-web-app/backend/src/db/repositories/orders.ts
git commit -m "feat(tracking): expand mapTrackingStatus + save delay/attempts fields"
```

---

## Task 4: Repository `tracking-exceptions`

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/tracking-exceptions.ts`
- Test: `archibald-web-app/backend/src/db/repositories/tracking-exceptions.spec.ts`

- [ ] **Step 1: Scrivi test di integrazione failing**

Crea `archibald-web-app/backend/src/db/repositories/tracking-exceptions.spec.ts`:

```typescript
import { describe, expect, test, beforeEach } from 'vitest';
import { createTestPool, cleanupTestDb } from '../../test-helpers/db';
import {
  logTrackingException,
  resolveOpenExceptions,
  getExceptionsByUser,
  updateClaimStatus,
  getExceptionById,
} from './tracking-exceptions';
import type { DbPool } from '../pool';

describe('tracking-exceptions repository', () => {
  let pool: DbPool;
  const userId = 'test-user-001';
  const orderNumber = 'ORD-TEST-001';
  const trackingNumber = 'FX999TEST001';

  beforeEach(async () => {
    pool = await createTestPool();
    await cleanupTestDb(pool, userId);
  });

  test('logTrackingException inserisce un record', async () => {
    await logTrackingException(pool, {
      userId,
      orderNumber,
      trackingNumber,
      exceptionCode: 'DEX08',
      exceptionDescription: 'Recipient not in',
      exceptionType: 'exception',
      occurredAt: '2026-03-25T10:14:00',
    });
    const rows = await getExceptionsByUser(pool, userId, { status: 'open' });
    expect(rows).toEqual([expect.objectContaining({
      orderNumber,
      trackingNumber,
      exceptionCode: 'DEX08',
      exceptionDescription: 'Recipient not in',
      exceptionType: 'exception',
      resolvedAt: null,
    })]);
  });

  test('logTrackingException è idempotente — stesso (trackingNumber, occurredAt) non duplica', async () => {
    const params = {
      userId, orderNumber, trackingNumber,
      exceptionCode: 'DEX08', exceptionDescription: 'Recipient not in',
      exceptionType: 'exception' as const, occurredAt: '2026-03-25T10:14:00',
    };
    await logTrackingException(pool, params);
    await logTrackingException(pool, params);
    const rows = await getExceptionsByUser(pool, userId, { status: 'open' });
    expect(rows).toHaveLength(1);
  });

  test('resolveOpenExceptions imposta resolved_at e resolution', async () => {
    await logTrackingException(pool, {
      userId, orderNumber, trackingNumber,
      exceptionCode: 'DEX08', exceptionDescription: 'Recipient not in',
      exceptionType: 'exception', occurredAt: '2026-03-25T10:14:00',
    });
    await resolveOpenExceptions(pool, orderNumber, 'delivered');
    const rows = await getExceptionsByUser(pool, userId, { status: 'open' });
    expect(rows).toHaveLength(0);
    const closed = await getExceptionsByUser(pool, userId, { status: 'closed' });
    expect(closed).toEqual([expect.objectContaining({ resolution: 'delivered' })]);
  });

  test('updateClaimStatus aggiorna claim_status', async () => {
    await logTrackingException(pool, {
      userId, orderNumber, trackingNumber,
      exceptionCode: 'DEX10', exceptionDescription: 'Damaged',
      exceptionType: 'exception', occurredAt: '2026-03-20T09:00:00',
    });
    const rows = await getExceptionsByUser(pool, userId, { status: 'all' });
    await updateClaimStatus(pool, rows[0].id, 'open', userId);
    const updated = await getExceptionById(pool, rows[0].id);
    expect(updated?.claimStatus).toBe('open');
  });
});
```

- [ ] **Step 2: Verifica che il test fallisce**

```bash
npm test --prefix archibald-web-app/backend -- tracking-exceptions.spec
```

Expected: FAIL — module not found

- [ ] **Step 3: Crea il repository**

Crea `archibald-web-app/backend/src/db/repositories/tracking-exceptions.ts`:

```typescript
import type { DbPool } from '../pool';

export type TrackingException = {
  id: number;
  userId: string;
  orderNumber: string;
  trackingNumber: string;
  exceptionCode: string | null;
  exceptionDescription: string;
  exceptionType: 'exception' | 'held' | 'returning' | 'canceled';
  occurredAt: Date;
  resolvedAt: Date | null;
  resolution: 'delivered' | 'returned' | 'claimed' | null;
  claimStatus: 'open' | 'submitted' | 'resolved' | null;
  claimSubmittedAt: Date | null;
  notes: string | null;
  createdAt: Date;
};

export type LogExceptionParams = {
  userId: string;
  orderNumber: string;
  trackingNumber: string;
  exceptionCode: string;
  exceptionDescription: string;
  exceptionType: TrackingException['exceptionType'];
  occurredAt: string;
};

export type ExceptionFilters = {
  status?: 'open' | 'closed' | 'all';
  from?: string;
  to?: string;
};

function toException(row: Record<string, unknown>): TrackingException {
  return {
    id: row.id as number,
    userId: row.user_id as string,
    orderNumber: row.order_number as string,
    trackingNumber: row.tracking_number as string,
    exceptionCode: row.exception_code as string | null,
    exceptionDescription: row.exception_description as string,
    exceptionType: row.exception_type as TrackingException['exceptionType'],
    occurredAt: row.occurred_at as Date,
    resolvedAt: row.resolved_at as Date | null,
    resolution: row.resolution as TrackingException['resolution'],
    claimStatus: row.claim_status as TrackingException['claimStatus'],
    claimSubmittedAt: row.claim_submitted_at as Date | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as Date,
  };
}

export async function logTrackingException(pool: DbPool, params: LogExceptionParams): Promise<void> {
  await pool.query(
    `INSERT INTO agents.tracking_exceptions
       (user_id, order_number, tracking_number, exception_code, exception_description,
        exception_type, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tracking_number, occurred_at) DO NOTHING`,
    [params.userId, params.orderNumber, params.trackingNumber,
     params.exceptionCode || null, params.exceptionDescription,
     params.exceptionType, params.occurredAt],
  );
}

export async function resolveOpenExceptions(
  pool: DbPool,
  orderNumber: string,
  resolution: 'delivered' | 'returned',
): Promise<void> {
  await pool.query(
    `UPDATE agents.tracking_exceptions
     SET resolved_at = NOW(), resolution = $2
     WHERE order_number = $1 AND resolved_at IS NULL`,
    [orderNumber, resolution],
  );
}

// userId obbligatorio per agenti; opzionale per admin (se assente, restituisce tutto)
export async function getExceptionsByUser(
  pool: DbPool,
  userId: string | undefined,
  filters: ExceptionFilters,
): Promise<TrackingException[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (userId) { conditions.push(`user_id = $${idx++}`); values.push(userId); }
  if (filters.status === 'open') {
    conditions.push('resolved_at IS NULL');
  } else if (filters.status === 'closed') {
    conditions.push('resolved_at IS NOT NULL');
  }
  if (filters.from) { conditions.push(`occurred_at >= $${idx++}`); values.push(filters.from); }
  if (filters.to)   { conditions.push(`occurred_at <= $${idx++}`); values.push(filters.to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM agents.tracking_exceptions
     ${where}
     ORDER BY occurred_at DESC`,
    values,
  );
  return rows.map(toException);
}

export async function getExceptionStats(
  pool: DbPool,
  filters: { userId?: string; from?: string; to?: string },
): Promise<{
  total: number;
  exceptionActive: number;
  held: number;
  returning: number;
  byCode: Array<{ code: string | null; description: string; count: number }>;
  claimsSummary: { open: number; submitted: number; resolved: number };
}> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (filters.userId) { conditions.push(`user_id = $${idx++}`); values.push(filters.userId); }
  if (filters.from)   { conditions.push(`occurred_at >= $${idx++}`); values.push(filters.from); }
  if (filters.to)     { conditions.push(`occurred_at <= $${idx++}`); values.push(filters.to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [totals, byCode, claims] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE exception_type = 'exception' AND resolved_at IS NULL)::int AS exception_active,
         COUNT(*) FILTER (WHERE exception_type = 'held' AND resolved_at IS NULL)::int AS held,
         COUNT(*) FILTER (WHERE exception_type = 'returning' AND resolved_at IS NULL)::int AS returning
       FROM agents.tracking_exceptions ${where}`,
      values,
    ),
    pool.query(
      `SELECT exception_code AS code, exception_description AS description, COUNT(*)::int AS count
       FROM agents.tracking_exceptions ${where}
       GROUP BY exception_code, exception_description
       ORDER BY count DESC`,
      values,
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE claim_status = 'open')::int AS open,
         COUNT(*) FILTER (WHERE claim_status = 'submitted')::int AS submitted,
         COUNT(*) FILTER (WHERE claim_status = 'resolved')::int AS resolved
       FROM agents.tracking_exceptions ${where}`,
      values,
    ),
  ]);

  return {
    total: totals.rows[0].total,
    exceptionActive: totals.rows[0].exception_active,
    held: totals.rows[0].held,
    returning: totals.rows[0].returning,
    byCode: byCode.rows,
    claimsSummary: claims.rows[0],
  };
}

export async function updateClaimStatus(
  pool: DbPool,
  id: number,
  claimStatus: 'open' | 'submitted' | 'resolved',
  userId: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.tracking_exceptions
     SET claim_status = $1, claim_submitted_at = CASE WHEN $1 = 'submitted' THEN NOW() ELSE claim_submitted_at END
     WHERE id = $2 AND user_id = $3`,
    [claimStatus, id, userId],
  );
}

export async function getExceptionById(
  pool: DbPool,
  id: number,
): Promise<TrackingException | null> {
  const { rows } = await pool.query(
    'SELECT * FROM agents.tracking_exceptions WHERE id = $1',
    [id],
  );
  return rows.length > 0 ? toException(rows[0]) : null;
}
```

- [ ] **Step 4: Verifica test + build**

```bash
npm test --prefix archibald-web-app/backend -- tracking-exceptions.spec
npm run build --prefix archibald-web-app/backend
```

Expected: 4 test PASS, build OK

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/tracking-exceptions.ts \
        archibald-web-app/backend/src/db/repositories/tracking-exceptions.spec.ts
git commit -m "feat(db): tracking-exceptions repository with log/resolve/stats/claim"
```

---

## Task 5: Exception logging + risoluzione in `syncTracking`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/services/tracking-sync.ts`

- [ ] **Step 1: Aggiorna imports e `TrackingEventType` in `tracking-sync.ts`**

Aggiungi import in cima al file:

```typescript
import {
  logTrackingException,
  resolveOpenExceptions,
} from '../../db/repositories/tracking-exceptions';
```

Sostituisci la riga `type TrackingEventType`:

```typescript
type TrackingEventType = 'delivered' | 'exception' | 'held' | 'returning' | 'canceled';
```

- [ ] **Step 2: Aggiungi logging e risoluzione nel loop**

Dopo il blocco `updateTrackingData` (dopo la riga ~102), aggiungi:

```typescript
        // Logga eccezione se anomalia, dedup su (tracking_number, occurred_at)
        if (['exception', 'held', 'returning', 'canceled'].includes(status)) {
          const exceptionStatusCDs: Record<string, string[]> = {
            exception: ['DE', 'SE', 'DY', 'DD', 'CD'],
            held:      ['HL', 'HP'],
            returning: ['RS', 'RP'],
            canceled:  ['CA'],
          };
          const codes = exceptionStatusCDs[status] ?? [];
          const latestEvent = (result.scanEvents ?? [])
            .find((ev) => codes.includes(ev.statusCD) || (status === 'exception' && ev.exception));
          if (latestEvent) {
            await logTrackingException(pool, {
              userId,
              orderNumber,
              trackingNumber: result.trackingNumber,
              exceptionCode: latestEvent.exceptionCode,
              exceptionDescription: latestEvent.exceptionDescription || latestEvent.status,
              exceptionType: status as 'exception' | 'held' | 'returning' | 'canceled',
              occurredAt: `${latestEvent.date}T${latestEvent.time}`,
            });
          }
        }

        // Risolvi eccezioni aperte quando l'ordine viene consegnato
        if (status === 'delivered') {
          await resolveOpenExceptions(pool, orderNumber, 'delivered');
        }
```

- [ ] **Step 3: Espandi il controllo `onTrackingEvent`**

Sostituisci la riga 109:

```typescript
        if (onTrackingEvent && (status === 'delivered' || status === 'exception')) {
```

Con:

```typescript
        if (onTrackingEvent && (['delivered', 'exception', 'held', 'returning', 'canceled'] as string[]).includes(status)) {
```

- [ ] **Step 4: Build per verificare TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: build OK senza errori

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/services/tracking-sync.ts
git commit -m "feat(tracking): log exceptions to tracking_exceptions, resolve on delivery"
```

---

## Task 6: Notifiche arricchite in `main.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiorna il callback `onTrackingEvent` in `main.ts`**

Trova le righe ~891-923 (callback `onTrackingEvent` in `createSyncTrackingHandler`). Sostituisci il blocco `if (type === 'delivered') { ... } else { ... }` con:

```typescript
          if (type === 'delivered') {
            await createNotification(notificationDeps, {
              target: 'user',
              userId: agentId,
              type: 'fedex_delivered',
              severity: 'success',
              title: 'Ordine consegnato',
              body: `L'ordine ${orderNumber} (${customerName}) è stato consegnato.`,
              data: { orderNumber, customerName },
            });
          } else if (type === 'held') {
            await createNotification(notificationDeps, {
              target: 'user',
              userId: agentId,
              type: 'fedex_exception',
              severity: 'warning',
              title: 'Ordine in giacenza FedEx',
              body: `L'ordine ${orderNumber} (${customerName}) è disponibile per il ritiro presso un punto FedEx.`,
              data: { orderNumber, customerName, exceptionType: 'held' },
            });
          } else if (type === 'returning') {
            await createNotification(notificationDeps, {
              target: 'user',
              userId: agentId,
              type: 'fedex_exception',
              severity: 'warning',
              title: 'Ordine in ritorno FedEx',
              body: `L'ordine ${orderNumber} (${customerName}) è in ritorno al mittente.`,
              data: { orderNumber, customerName, exceptionType: 'returning' },
            });
          } else {
            // type === 'exception' | 'canceled'
            const orderData = await pool.query(
              `SELECT tracking_events FROM agents.order_records
               WHERE user_id = $1 AND order_number = $2`,
              [agentId, orderNumber],
            );
            const events = (orderData.rows[0]?.tracking_events ?? []) as Array<{ exception: boolean; exceptionDescription?: string; exceptionCode?: string }>;
            const latestEx = events.find((ev) => ev.exception);
            const reason = latestEx?.exceptionDescription
              ? (latestEx.exceptionCode ? `${latestEx.exceptionCode}: ${latestEx.exceptionDescription}` : latestEx.exceptionDescription)
              : 'Problema di consegna';
            await createNotification(notificationDeps, {
              target: 'user',
              userId: agentId,
              type: 'fedex_exception',
              severity: 'warning',
              title: 'Eccezione tracking FedEx',
              body: `Ordine ${orderNumber} (${customerName}): ${reason}.`,
              data: { orderNumber, customerName, reason, exceptionType: type },
            });
          }
```

- [ ] **Step 2: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: build OK

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/main.ts
git commit -m "feat(notifications): enrich FedEx notification body with exception reason and new event types"
```

---

## Task 7: Admin API — endpoint `/tracking/*`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/admin.ts`
- Test: `archibald-web-app/backend/src/routes/admin.tracking.spec.ts`

- [ ] **Step 1: Aggiungi import repository e PDF service in `admin.ts`**

In cima ad `admin.ts`, aggiungi:

```typescript
import {
  getExceptionStats,
  getExceptionsByUser,
  updateClaimStatus,
  getExceptionById,
} from '../db/repositories/tracking-exceptions';
import { generateClaimPdf } from '../services/fedex-claim-pdf';
```

- [ ] **Step 2: Aggiungi i 4 endpoint in `admin.ts`**

Alla fine della factory function `createAdminRouter`, prima del `return router`, aggiungi:

```typescript
  // --- Tracking FedEx ---

  router.get('/tracking/stats', async (req, res) => {
    try {
      const { userId, from, to } = req.query as Record<string, string>;
      const stats = await getExceptionStats(deps.pool, { userId, from, to });
      // Aggiungi conteggio ordini con tracking dallo stato corrente
      const { rows } = await deps.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE tracking_status IS NOT NULL)::int AS total_with_tracking,
           COUNT(*) FILTER (WHERE tracking_status = 'delivered')::int AS delivered
         FROM agents.order_records
         ${userId ? 'WHERE user_id = $1' : ''}`,
        userId ? [userId] : [],
      );
      res.json({ ...rows[0], ...stats });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/tracking/exceptions', async (req, res) => {
    try {
      const { userId, status = 'all', from, to } = req.query as Record<string, string>;
      // userId è opzionale: se assente, restituisce eccezioni di tutti gli agenti
      const exceptions = await getExceptionsByUser(
        deps.pool,
        userId || undefined,
        { status: status as 'open' | 'closed' | 'all', from, to },
      );
      res.json(exceptions);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/tracking/exceptions/:id/claim', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { claimStatus } = req.body as { claimStatus: 'open' | 'submitted' | 'resolved' };
      const allowed: Array<'open' | 'submitted' | 'resolved'> = ['open', 'submitted', 'resolved'];
      if (!allowed.includes(claimStatus)) {
        return res.status(400).json({ error: 'Invalid claimStatus' });
      }
      const exception = await getExceptionById(deps.pool, id);
      if (!exception) return res.status(404).json({ error: 'Not found' });
      await updateClaimStatus(deps.pool, id, claimStatus, exception.userId);
      res.json({ id, claimStatus });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/tracking/exceptions/:id/claim-pdf', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const exception = await getExceptionById(deps.pool, id);
      if (!exception) return res.status(404).json({ error: 'Not found' });
      const pdfBuffer = await generateClaimPdf(exception);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="reclamo-${exception.trackingNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 3: Scrivi test di integrazione**

Crea `archibald-web-app/backend/src/routes/admin.tracking.spec.ts`:

```typescript
import { describe, expect, test, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, createTestPool, cleanupTestDb, createTestAdminSession } from '../test-helpers/app';
import { logTrackingException } from '../db/repositories/tracking-exceptions';

describe('GET /api/admin/tracking/stats', () => {
  let app: ReturnType<typeof createTestApp>;
  const userId = 'test-admin-tracking-001';

  beforeEach(async () => {
    const pool = await createTestPool();
    app = createTestApp(pool);
    await cleanupTestDb(pool, userId);
    await logTrackingException(pool, {
      userId, orderNumber: 'ORD-T-001', trackingNumber: 'FX001',
      exceptionCode: 'DEX08', exceptionDescription: 'Recipient not in',
      exceptionType: 'exception', occurredAt: '2026-03-25T10:00:00',
    });
  });

  test('restituisce stats aggregate', async () => {
    const session = await createTestAdminSession(app);
    const res = await request(app)
      .get('/api/admin/tracking/stats')
      .set('Cookie', session.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: expect.any(Number),
      exceptionActive: expect.any(Number),
    });
  });
});

describe('PATCH /api/admin/tracking/exceptions/:id/claim', () => {
  test('aggiorna claim_status su open', async () => {
    const pool = await createTestPool();
    const app = createTestApp(pool);
    await logTrackingException(pool, {
      userId: 'admin-001', orderNumber: 'ORD-T-002', trackingNumber: 'FX002',
      exceptionCode: 'DEX10', exceptionDescription: 'Damaged',
      exceptionType: 'exception', occurredAt: '2026-03-20T09:00:00',
    });
    const exceptions = await request(app)
      .get('/api/admin/tracking/exceptions?userId=admin-001')
      .set('Cookie', (await createTestAdminSession(app)).cookie);
    const id = exceptions.body[0].id;
    const res = await request(app)
      .patch(`/api/admin/tracking/exceptions/${id}/claim`)
      .set('Cookie', (await createTestAdminSession(app)).cookie)
      .send({ claimStatus: 'open' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, claimStatus: 'open' });
  });

  test('restituisce 400 per claimStatus non valido', async () => {
    const pool = await createTestPool();
    const app = createTestApp(pool);
    const session = await createTestAdminSession(app);
    const res = await request(app)
      .patch('/api/admin/tracking/exceptions/1/claim')
      .set('Cookie', session.cookie)
      .send({ claimStatus: 'invalid' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Build + test**

```bash
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend -- admin.tracking.spec
```

Expected: build OK, test PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/admin.ts \
        archibald-web-app/backend/src/routes/admin.tracking.spec.ts
git commit -m "feat(api): admin tracking endpoints — stats, exceptions list, claim status, PDF"
```

---

## Task 8: Agent tracking route `/api/tracking/my-exceptions`

**Files:**
- Create: `archibald-web-app/backend/src/routes/tracking.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Crea il router**

Crea `archibald-web-app/backend/src/routes/tracking.ts`:

```typescript
import { Router } from 'express';
import type { DbPool } from '../db/pool';
import { getExceptionsByUser } from '../db/repositories/tracking-exceptions';

type TrackingRouterDeps = { pool: DbPool };

function createTrackingRouter(deps: TrackingRouterDeps): Router {
  const router = Router();

  router.get('/my-exceptions', async (req, res) => {
    const userId = (req.session as { userId?: string }).userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { status = 'all', from, to } = req.query as Record<string, string>;
      const exceptions = await getExceptionsByUser(
        deps.pool,
        userId,
        { status: status as 'open' | 'closed' | 'all', from, to },
      );
      res.json(exceptions);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export { createTrackingRouter };
```

- [ ] **Step 2: Registra il router in `main.ts`**

Trova la sezione dove sono registrati gli altri router (cerca `app.use('/api/`). Aggiungi:

```typescript
import { createTrackingRouter } from './routes/tracking';
// ...
app.use('/api/tracking', createTrackingRouter({ pool }));
```

- [ ] **Step 3: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: build OK

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/routes/tracking.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(api): agent tracking route GET /api/tracking/my-exceptions"
```

---

## Task 9: PDF claim generation

**Files:**
- Create: `archibald-web-app/backend/src/services/fedex-claim-pdf.ts`

- [ ] **Step 1: Crea il servizio PDF**

Crea `archibald-web-app/backend/src/services/fedex-claim-pdf.ts`:

```typescript
import type { TrackingException } from '../db/repositories/tracking-exceptions';

async function generateClaimPdf(exception: TrackingException): Promise<Buffer> {
  // Puppeteer è già disponibile nel progetto
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({ headless: true });
  const page = await browser.newPage();

  const html = buildClaimHtml(exception);
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } });

  await browser.close();
  return Buffer.from(pdf);
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function buildClaimHtml(ex: TrackingException): string {
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; margin: 0; }
  h1 { font-size: 20px; color: #4d148c; margin-bottom: 4px; }
  h2 { font-size: 14px; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 12px 0; }
  .field label { font-size: 10px; color: #888; text-transform: uppercase; display: block; }
  .field span { font-weight: 600; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 700;
           background: #fff3e0; color: #e65100; }
  .signature-box { border: 1px solid #ccc; border-radius: 6px; padding: 16px; margin-top: 8px; height: 60px; }
  .footer { margin-top: 40px; font-size: 11px; color: #aaa; text-align: center; }
</style>
</head><body>
  <h1>📦 Dichiarazione Reclamo Spedizione FedEx</h1>
  <div style="font-size:12px;color:#888;">Generato il ${formatDateTime(new Date())}</div>

  <h2>Dati Spedizione</h2>
  <div class="grid">
    <div class="field"><label>Tracking Number</label><span style="font-family:monospace;">${ex.trackingNumber}</span></div>
    <div class="field"><label>Numero Ordine</label><span>${ex.orderNumber}</span></div>
    <div class="field"><label>Data Eccezione</label><span>${formatDateTime(ex.occurredAt)}</span></div>
    <div class="field"><label>Tipo Anomalia</label><span class="badge">${ex.exceptionType.toUpperCase()}</span></div>
  </div>

  <h2>Dettaglio Eccezione</h2>
  <div class="grid">
    <div class="field"><label>Codice Eccezione</label><span>${ex.exceptionCode ?? '—'}</span></div>
    <div class="field"><label>Descrizione</label><span>${ex.exceptionDescription}</span></div>
  </div>

  <h2>Stato Reclamo</h2>
  <div class="grid">
    <div class="field"><label>Stato</label><span>${ex.claimStatus ?? 'Non avviato'}</span></div>
    <div class="field"><label>Data invio</label><span>${formatDate(ex.claimSubmittedAt)}</span></div>
    ${ex.notes ? `<div class="field" style="grid-column:span 2"><label>Note</label><span>${ex.notes}</span></div>` : ''}
  </div>

  <h2>Firma Agente</h2>
  <p style="font-size:12px;color:#666;">Con la presente si dichiara che i dati riportati sono veritieri e si richiede formalmente l'apertura di un reclamo presso FedEx per il tracking number indicato.</p>
  <div class="grid" style="margin-top:16px;">
    <div>
      <div style="font-size:11px;color:#888;margin-bottom:4px;">Firma agente</div>
      <div class="signature-box"></div>
    </div>
    <div>
      <div style="font-size:11px;color:#888;margin-bottom:4px;">Data</div>
      <div class="signature-box"></div>
    </div>
  </div>

  <div class="footer">Documento generato automaticamente — Archibald Agent Platform</div>
</body></html>`;
}

export { generateClaimPdf };
```

- [ ] **Step 2: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: build OK

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/services/fedex-claim-pdf.ts
git commit -m "feat(pdf): FedEx claim PDF generator using Puppeteer"
```

---

## Task 10: Frontend — `notifications.service.ts` navigate-to specifico

**Files:**
- Modify: `archibald-web-app/frontend/src/services/notifications.service.ts`
- Modify: `archibald-web-app/frontend/src/pages/OrderHistory.tsx`
- Test: `archibald-web-app/frontend/src/services/notifications.service.spec.ts`

- [ ] **Step 1: Scrivi test failing**

Crea `archibald-web-app/frontend/src/services/notifications.service.spec.ts` (o aggiorna se esiste):

```typescript
import { describe, expect, test } from 'vitest';
import { getNotificationRoute } from './notifications.service';
import type { Notification } from '../types/notification';

const makeNotif = (type: string, data?: Record<string, string>): Notification =>
  ({ id: 1, type, data, severity: 'info', title: '', body: '', read: false, createdAt: '' }) as unknown as Notification;

describe('getNotificationRoute', () => {
  test('fedex_exception con orderNumber → /orders?highlight=ORD-001', () => {
    expect(getNotificationRoute(makeNotif('fedex_exception', { orderNumber: 'ORD-001' })))
      .toBe('/orders?highlight=ORD-001');
  });

  test('fedex_delivered con orderNumber → /orders?highlight=ORD-002', () => {
    expect(getNotificationRoute(makeNotif('fedex_delivered', { orderNumber: 'ORD-002' })))
      .toBe('/orders?highlight=ORD-002');
  });

  test('fedex_exception senza orderNumber → /orders', () => {
    expect(getNotificationRoute(makeNotif('fedex_exception')))
      .toBe('/orders');
  });
});
```

- [ ] **Step 2: Verifica test failing**

```bash
npm test --prefix archibald-web-app/frontend -- notifications.service.spec
```

Expected: FAIL

- [ ] **Step 3: Aggiorna `getNotificationRoute`**

In `notifications.service.ts`, sostituisci le righe:

```typescript
    case 'fedex_exception':
    case 'fedex_delivered':
      return '/orders';
```

Con:

```typescript
    case 'fedex_exception':
    case 'fedex_delivered':
      return notification.data?.orderNumber
        ? `/orders?highlight=${notification.data.orderNumber}`
        : '/orders';
```

- [ ] **Step 4: Aggiungi `id` alle card e highlight in `OrderHistory.tsx`**

In `OrderHistory.tsx`, trova dove viene renderizzata ogni `OrderCardNew`. Aggiungi `id={`order-card-${order.orderNumber}`}` al wrapper div esterno di ogni card (o alla card stessa se ha un wrapper).

Aggiungi questo `useEffect` nel componente `OrderHistory`:

```typescript
useEffect(() => {
  const highlight = new URLSearchParams(location.search).get('highlight');
  if (!highlight || orders.length === 0) return;
  const el = document.getElementById(`order-card-${highlight}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'box-shadow 0.3s';
    el.style.boxShadow = '0 0 0 3px #cc0066';
    const timer = setTimeout(() => { el.style.boxShadow = ''; }, 2000);
    return () => clearTimeout(timer);
  }
}, [orders, location.search]);
```

Assicurati che `location` venga da `useLocation()` di React Router (già importato se la pagina usa routing).

- [ ] **Step 5: Aggiungi filtro rapido "⚠ Con eccezioni" in `OrderHistory.tsx`**

Aggiungi uno stato per il filtro e un pulsante di toggle nella toolbar filtri della pagina:

```typescript
const [showOnlyExceptions, setShowOnlyExceptions] = useState(false);
```

Nella logica di filtraggio degli ordini (dove si costruisce `filteredOrders`), aggiungi:

```typescript
const exceptionStatuses = new Set(['exception', 'held', 'returning']);
const displayedOrders = showOnlyExceptions
  ? filteredOrders.filter((o) => {
      if (exceptionStatuses.has(o.trackingStatus ?? '')) return true;
      if (o.trackingStatus === 'delivered') {
        const events = (o.trackingEvents ?? []) as Array<{ exception: boolean }>;
        return events.some((ev) => ev.exception);
      }
      return false;
    })
  : filteredOrders;
```

Aggiungi il pulsante toggle vicino agli altri filtri:

```tsx
<button
  onClick={() => setShowOnlyExceptions((v) => !v)}
  style={{
    background: showOnlyExceptions ? '#fff0f5' : '#f5f5f5',
    color: showOnlyExceptions ? '#cc0066' : '#666',
    border: `1px solid ${showOnlyExceptions ? '#cc0066' : '#ddd'}`,
    borderRadius: '20px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  }}
>
  ⚠ Con eccezioni
</button>
```

Assicurati che il rendering usi `displayedOrders` invece di `filteredOrders`.

- [ ] **Step 6: Test + type-check**

```bash
npm test --prefix archibald-web-app/frontend -- notifications.service.spec
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 3 test PASS, type-check OK

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/services/notifications.service.ts \
        archibald-web-app/frontend/src/services/notifications.service.spec.ts \
        archibald-web-app/frontend/src/pages/OrderHistory.tsx
git commit -m "feat(frontend): navigate to specific order on FedEx notification click + exception quick filter"
```

---

## Task 11: `TrackingProgressBar.tsx` — nuovi stati e `exceptionCode`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/TrackingProgressBar.tsx`
- Test: `archibald-web-app/frontend/src/components/TrackingProgressBar.spec.tsx`

- [ ] **Step 1: Scrivi test failing**

Crea `archibald-web-app/frontend/src/components/TrackingProgressBar.spec.tsx`:

```typescript
import { describe, expect, test } from 'vitest';
import { getTrackingInfo } from './TrackingProgressBar';
import type { Order } from '../types/order';

const baseOrder = (overrides: Partial<Order> = {}): Order => ({
  orderNumber: 'ORD-001',
  trackingStatus: 'in_transit',
  trackingOrigin: 'VERONA, IT',
  trackingDestination: 'NAPOLI, IT',
  trackingEvents: [],
  ...overrides,
} as unknown as Order);

describe('getTrackingInfo', () => {
  test('status held → label "🏪 In giacenza"', () => {
    const info = getTrackingInfo(baseOrder({
      trackingStatus: 'held',
      trackingEvents: [{ date: '2026-03-26', time: '09:00:00', gmtOffset: '', status: 'Held at location', statusCD: 'HL', scanLocation: 'NAPOLI, IT', delivered: false, exception: false, exceptionCode: '', exceptionDescription: '' }],
    }));
    expect(info.label).toBe('🏪 In giacenza');
  });

  test('status returning → label "↩ In ritorno"', () => {
    const info = getTrackingInfo(baseOrder({
      trackingStatus: 'returning',
      trackingEvents: [{ date: '2026-03-26', time: '10:00:00', gmtOffset: '', status: 'Return in progress', statusCD: 'RS', scanLocation: 'MILANO, IT', delivered: false, exception: false, exceptionCode: '', exceptionDescription: '' }],
    }));
    expect(info.label).toBe('↩ In ritorno');
  });

  test('exceptionCode viene prefissato nella exceptionReason', () => {
    const info = getTrackingInfo(baseOrder({
      trackingStatus: 'exception',
      trackingEvents: [{ date: '2026-03-25', time: '10:14:00', gmtOffset: '', status: 'Delivery exception', statusCD: 'DE', scanLocation: 'NAPOLI, IT', delivered: false, exception: true, exceptionCode: 'DEX08', exceptionDescription: 'Recipient not in' }],
    }));
    expect(info.exceptionReason).toBe('DEX08: Recipient not in');
  });

  test('exceptionCode vuoto → mostra solo exceptionDescription', () => {
    const info = getTrackingInfo(baseOrder({
      trackingStatus: 'exception',
      trackingEvents: [{ date: '2026-03-25', time: '10:14:00', gmtOffset: '', status: 'Delivery exception', statusCD: 'DE', scanLocation: 'NAPOLI, IT', delivered: false, exception: true, exceptionCode: '', exceptionDescription: 'Customer not available' }],
    }));
    expect(info.exceptionReason).toBe('Customer not available');
  });
});
```

- [ ] **Step 2: Verifica test failing**

```bash
npm test --prefix archibald-web-app/frontend -- TrackingProgressBar.spec
```

Expected: FAIL

- [ ] **Step 3: Aggiorna `TrackingProgressBar.tsx`**

**Aggiungi `exceptionCode` a `ScanEvent`** (riga 3):

```typescript
export type ScanEvent = {
  date: string;
  time: string;
  gmtOffset: string;
  status: string;
  statusCD: string;
  scanLocation: string;
  delivered: boolean;
  exception: boolean;
  exceptionCode: string;
  exceptionDescription?: string;
};
```

**Aggiungi `trackingStatus` override in `getTrackingInfo`** — dopo `const isDelivered = highestCompleted === 4;` (riga ~125), aggiungi:

```typescript
  const trackingStatus = order.trackingStatus as string | undefined;

  // Override label/icon per stati anomali che non mappano su uno dei 5 step
  const labelOverride: Record<string, { icon: string; label: string }> = {
    held:      { icon: '🏪', label: '🏪 In giacenza' },
    returning: { icon: '↩️', label: '↩ In ritorno' },
    canceled:  { icon: '✕', label: '✕ Annullato' },
  };
  const override = trackingStatus ? labelOverride[trackingStatus] : undefined;
```

Aggiorna la costruzione del return object usando `override`:

```typescript
  return {
    icon: override ? override.icon : (highestCompleted >= 0 ? STEP_ICONS[highestCompleted] : ''),
    label: override ? override.label : (highestCompleted >= 0 ? STEP_LABELS[highestCompleted] : ''),
    location, dateTime, rightInfo,
    exceptionReason: exceptionEvent
      ? (exceptionEvent.exceptionCode
          ? `${exceptionEvent.exceptionCode}: ${exceptionEvent.exceptionDescription || exceptionEvent.status}`
          : exceptionEvent.exceptionDescription || exceptionEvent.status || '')
      : '',
    dotsCompleted, dayCount, delivered: isDelivered, origin, destination,
  };
```

- [ ] **Step 4: Test + type-check**

```bash
npm test --prefix archibald-web-app/frontend -- TrackingProgressBar.spec
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 4 test PASS, type-check OK

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/TrackingProgressBar.tsx \
        archibald-web-app/frontend/src/components/TrackingProgressBar.spec.tsx
git commit -m "feat(ui): TrackingProgressBar supports held/returning/canceled states and exceptionCode prefix"
```

---

## Task 12: `OrderCardNew.tsx` — badge eccezioni storiche + nuovi colori

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`
- Test: (aggiungi test al file esistente se presente, altrimenti crea `OrderCardNew.spec.tsx`)

- [ ] **Step 1: Aggiungi i nuovi colori di stato**

In `OrderCardNew.tsx`, trova la funzione o la logica che determina `borderColor` e `backgroundColor` in base allo stato ordine (cerca `case 'exception':` o `trackingStatus`). Aggiungi:

```typescript
case 'held':      borderColor = '#cc0066'; backgroundColor = '#fff0f5'; break;
case 'returning': borderColor = '#cc0066'; backgroundColor = '#fff0f5'; break;
case 'canceled':  borderColor = '#757575'; backgroundColor = '#f5f5f5'; break;
```

- [ ] **Step 2: Aggiungi badge eccezioni storiche**

Trova dove viene renderizzato il badge di stato tracking (es. il badge "Consegnato", "In transito", ecc.). Dopo di esso, aggiungi il conteggio eccezioni storiche:

```tsx
{order.trackingStatus === 'delivered' && (() => {
  const events = (order.trackingEvents || []) as Array<{ exception: boolean }>;
  const exceptionsCount = events.filter((ev) => ev.exception).length;
  return exceptionsCount > 0 ? (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, color: '#b45309',
      background: '#fef3c7', border: '1px solid #fcd34d',
      borderRadius: 20, padding: '2px 8px', marginTop: 6,
    }}>
      ⚠️ {exceptionsCount} {exceptionsCount === 1 ? 'eccezione' : 'eccezioni'} in transito
    </div>
  ) : null;
})()}
```

- [ ] **Step 3: Aggiungi `id` alla card**

Trova il div wrapper più esterno della card (quello con il `borderRadius`, `boxShadow`, ecc.). Aggiungi:

```tsx
id={`order-card-${order.orderNumber}`}
```

- [ ] **Step 4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: OK

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(ui): order card exception history badge on delivered orders + held/returning/canceled colors"
```

---

## Task 13: `fedex-report.service.ts`

**Files:**
- Create: `archibald-web-app/frontend/src/services/fedex-report.service.ts`
- Test: `archibald-web-app/frontend/src/services/fedex-report.service.spec.ts`

- [ ] **Step 1: Scrivi test failing**

Crea `archibald-web-app/frontend/src/services/fedex-report.service.spec.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { getTrackingStats, getTrackingExceptions, updateClaimStatus } from './fedex-report.service';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const makeResponse = (body: unknown) => ({
  ok: true,
  json: () => Promise.resolve(body),
});

beforeEach(() => mockFetch.mockReset());

describe('getTrackingStats', () => {
  test('chiama /api/admin/tracking/stats con i filtri corretti', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ total: 5 }));
    const result = await getTrackingStats({ from: '2026-01-01', to: '2026-03-31' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/tracking/stats?'),
      expect.any(Object),
    );
    expect(result).toMatchObject({ total: 5 });
  });
});

describe('updateClaimStatus', () => {
  test('chiama PATCH con il body corretto', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ id: 1, claimStatus: 'open' }));
    await updateClaimStatus(1, 'open');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/tracking/exceptions/1/claim'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
```

- [ ] **Step 2: Verifica failing**

```bash
npm test --prefix archibald-web-app/frontend -- fedex-report.service.spec
```

Expected: FAIL — module not found

- [ ] **Step 3: Crea il servizio**

Crea `archibald-web-app/frontend/src/services/fedex-report.service.ts`:

```typescript
import { fetchWithRetry } from '../utils/fetch-with-retry';

export type TrackingStats = {
  totalWithTracking: number;
  delivered: number;
  exceptionActive: number;
  held: number;
  returning: number;
  byCode: Array<{ code: string | null; description: string; count: number }>;
  claimsSummary: { open: number; submitted: number; resolved: number };
};

export type TrackingException = {
  id: number;
  userId: string;
  orderNumber: string;
  trackingNumber: string;
  exceptionCode: string | null;
  exceptionDescription: string;
  exceptionType: 'exception' | 'held' | 'returning' | 'canceled';
  occurredAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  claimStatus: 'open' | 'submitted' | 'resolved' | null;
  claimSubmittedAt: string | null;
  notes: string | null;
};

type StatsFilters = { userId?: string; from?: string; to?: string };
type ExceptionsFilters = { userId?: string; status?: string; from?: string; to?: string };
type ClaimStatus = 'open' | 'submitted' | 'resolved';

function toQueryString(params: Record<string, string | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function getTrackingStats(filters: StatsFilters = {}): Promise<TrackingStats> {
  return fetchWithRetry(`/api/admin/tracking/stats${toQueryString(filters)}`);
}

async function getTrackingExceptions(filters: ExceptionsFilters = {}): Promise<TrackingException[]> {
  return fetchWithRetry(`/api/admin/tracking/exceptions${toQueryString(filters)}`);
}

async function updateClaimStatus(id: number, claimStatus: ClaimStatus): Promise<void> {
  await fetchWithRetry(`/api/admin/tracking/exceptions/${id}/claim`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimStatus }),
  });
}

function downloadClaimPdf(id: number, trackingNumber: string): void {
  const a = document.createElement('a');
  a.href = `/api/admin/tracking/exceptions/${id}/claim-pdf`;
  a.download = `reclamo-${trackingNumber}.pdf`;
  a.click();
}

function exportExceptionsCsv(exceptions: TrackingException[]): void {
  const headers = ['ID', 'Ordine', 'Tracking', 'Tipo', 'Codice', 'Descrizione', 'Data', 'Stato', 'Reclamo'];
  const rows = exceptions.map((e) => [
    e.id, e.orderNumber, e.trackingNumber, e.exceptionType,
    e.exceptionCode ?? '', e.exceptionDescription,
    new Date(e.occurredAt).toLocaleDateString('it-IT'),
    e.resolvedAt ? 'Risolto' : 'Aperto',
    e.claimStatus ?? '—',
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eccezioni-fedex-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function getMyExceptions(filters: Omit<ExceptionsFilters, 'userId'> = {}): Promise<TrackingException[]> {
  return fetchWithRetry(`/api/tracking/my-exceptions${toQueryString(filters)}`);
}

export { getTrackingStats, getTrackingExceptions, updateClaimStatus, downloadClaimPdf, exportExceptionsCsv, getMyExceptions };
```

- [ ] **Step 4: Test + type-check**

```bash
npm test --prefix archibald-web-app/frontend -- fedex-report.service.spec
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 2 test PASS, type-check OK

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/services/fedex-report.service.ts \
        archibald-web-app/frontend/src/services/fedex-report.service.spec.ts
git commit -m "feat(frontend): fedex-report.service with stats, exceptions, claim, CSV, PDF"
```

---

## Task 14: `FedExReportSection.tsx` + `AdminPage.tsx`

**Files:**
- Create: `archibald-web-app/frontend/src/components/admin/FedExReportSection.tsx`
- Modify: `archibald-web-app/frontend/src/pages/AdminPage.tsx`
- Test: `archibald-web-app/frontend/src/components/admin/FedExReportSection.spec.tsx`

- [ ] **Step 1: Crea la directory se non esiste**

```bash
mkdir -p archibald-web-app/frontend/src/components/admin
```

- [ ] **Step 2: Scrivi test failing**

Crea `archibald-web-app/frontend/src/components/admin/FedExReportSection.spec.tsx`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FedExReportSection } from './FedExReportSection';

vi.mock('../../services/fedex-report.service', () => ({
  getTrackingStats: vi.fn().mockResolvedValue({
    totalWithTracking: 50, delivered: 42, exceptionActive: 4, held: 2, returning: 1,
    byCode: [{ code: 'DEX08', description: 'Recipient not in', count: 3 }],
    claimsSummary: { open: 2, submitted: 1, resolved: 0 },
  }),
  getTrackingExceptions: vi.fn().mockResolvedValue([
    { id: 1, orderNumber: 'ORD-001', trackingNumber: 'FX001', exceptionType: 'exception',
      exceptionCode: 'DEX08', exceptionDescription: 'Recipient not in',
      occurredAt: '2026-03-25T10:00:00', resolvedAt: null, resolution: null,
      claimStatus: null, claimSubmittedAt: null, notes: null, userId: 'u1' },
  ]),
  updateClaimStatus: vi.fn(),
  downloadClaimPdf: vi.fn(),
  exportExceptionsCsv: vi.fn(),
}));

describe('FedExReportSection', () => {
  test('mostra i contatori statistiche', async () => {
    render(<FedExReportSection />);
    await waitFor(() => {
      expect(screen.getByText('42')).toBeTruthy();  // delivered
      expect(screen.getByText('4')).toBeTruthy();   // exceptionActive
    });
  });

  test('mostra una riga per ogni eccezione', async () => {
    render(<FedExReportSection />);
    await waitFor(() => {
      expect(screen.getByText('ORD-001')).toBeTruthy();
      expect(screen.getByText('FX001')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 3: Verifica failing**

```bash
npm test --prefix archibald-web-app/frontend -- FedExReportSection.spec
```

Expected: FAIL — module not found

- [ ] **Step 4: Crea `FedExReportSection.tsx`**

Crea `archibald-web-app/frontend/src/components/admin/FedExReportSection.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  getTrackingStats,
  getTrackingExceptions,
  updateClaimStatus,
  downloadClaimPdf,
  exportExceptionsCsv,
} from '../../services/fedex-report.service';
import type { TrackingStats, TrackingException } from '../../services/fedex-report.service';

const CLAIM_LABELS: Record<string, string> = {
  open: 'Aperto',
  submitted: 'Inviato',
  resolved: 'Risolto',
};
const CLAIM_COLORS: Record<string, { bg: string; color: string }> = {
  open:      { bg: '#fff3e0', color: '#e65100' },
  submitted: { bg: '#e3f2fd', color: '#1565c0' },
  resolved:  { bg: '#e8f5e9', color: '#1b5e20' },
};

export function FedExReportSection() {
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [exceptions, setExceptions] = useState<TrackingException[]>([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('3m');
  const [loading, setLoading] = useState(true);

  function getPeriodDates(): { from: string; to: string } {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date();
    if (periodFilter === '3m') from.setMonth(from.getMonth() - 3);
    else if (periodFilter === '6m') from.setMonth(from.getMonth() - 6);
    else from.setFullYear(from.getFullYear() - 1);
    return { from: from.toISOString().slice(0, 10), to };
  }

  async function load() {
    setLoading(true);
    const { from, to } = getPeriodDates();
    const filters = { userId: agentFilter || undefined, from, to };
    const [s, e] = await Promise.all([getTrackingStats(filters), getTrackingExceptions({ ...filters, status: 'all' })]);
    setStats(s);
    setExceptions(e);
    setLoading(false);
  }

  useEffect(() => { load(); }, [agentFilter, periodFilter]);

  async function handleClaimUpdate(id: number, status: 'open' | 'submitted' | 'resolved') {
    await updateClaimStatus(id, status);
    setExceptions((prev) => prev.map((e) => e.id === id ? { ...e, claimStatus: status } : e));
  }

  const maxCount = Math.max(...(stats?.byCode.map((b) => b.count) ?? [1]), 1);

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: '16px' }}>

      {/* Header + filtri */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1a1a2e' }}>📦 Report Spedizioni FedEx</div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Eccezioni, reclami e statistiche</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            placeholder="ID agente..."
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', width: '140px' }}
          />
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}
            style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}>
            <option value="3m">Ultimi 3 mesi</option>
            <option value="6m">Ultimi 6 mesi</option>
            <option value="1y">Ultimo anno</option>
          </select>
        </div>
      </div>

      {loading && <div style={{ color: '#aaa', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Caricamento...</div>}

      {!loading && stats && (
        <>
          {/* Stat boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { num: stats.delivered, label: 'Consegnati', color: '#1b5e20' },
              { num: stats.exceptionActive + stats.held + stats.returning, label: 'Con eccezioni', color: '#cc0066' },
              { num: stats.claimsSummary.open + stats.claimsSummary.submitted, label: 'Reclami aperti', color: '#1565c0' },
              { num: stats.exceptionActive, label: 'In eccezione ora', color: '#e65100' },
            ].map(({ num, label, color }) => (
              <div key={label} style={{ background: '#f8f9fa', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-1px', color }}>{num}</div>
                <div style={{ fontSize: '10px', color: '#888', fontWeight: 700, textTransform: 'uppercase', marginTop: '4px' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Chart eccezioni per codice */}
          {stats.byCode.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', marginBottom: '10px' }}>Eccezioni per tipo</div>
              {stats.byCode.slice(0, 6).map((b) => (
                <div key={b.code ?? 'other'} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px' }}>
                  <div style={{ fontSize: '11px', color: '#555', width: '220px', flexShrink: 0 }}>
                    {b.code ? `${b.code} — ` : ''}{b.description}
                  </div>
                  <div style={{ flex: 1, height: '18px', background: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round((b.count / maxCount) * 100)}%`, height: '100%', background: '#cc0066', borderRadius: '4px', display: 'flex', alignItems: 'center', paddingLeft: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#fff', fontWeight: 700 }}>{b.count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tabella eccezioni */}
      {!loading && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Lista eccezioni</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => exportExceptionsCsv(exceptions)}
                style={{ background: '#e8f5e9', color: '#1b5e20', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                ⬇ Export CSV
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Tracking', 'Ordine', 'Tipo', 'Motivo', 'Data', 'Stato reclamo', 'Azioni'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', background: '#f5f5f5', color: '#888', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exceptions.map((ex) => {
                  const cs = ex.claimStatus;
                  const colors = cs ? CLAIM_COLORS[cs] : null;
                  return (
                    <tr key={ex.id}>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', borderBottom: '1px solid #f5f5f5' }}>{ex.trackingNumber}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5' }}>{ex.orderNumber}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#cc0066', fontWeight: 600 }}>{ex.exceptionType}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5' }}>{ex.exceptionCode ? `${ex.exceptionCode}: ` : ''}{ex.exceptionDescription}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', whiteSpace: 'nowrap' }}>{new Date(ex.occurredAt).toLocaleDateString('it-IT')}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5' }}>
                        {cs && colors ? (
                          <span style={{ background: colors.bg, color: colors.color, borderRadius: '10px', padding: '2px 8px', fontSize: '10px', fontWeight: 700 }}>
                            {CLAIM_LABELS[cs]}
                          </span>
                        ) : <span style={{ color: '#bbb', fontSize: '11px' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {!cs && (
                            <button onClick={() => handleClaimUpdate(ex.id, 'open')}
                              style={{ background: '#fff3e0', color: '#e65100', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>
                              Apri reclamo
                            </button>
                          )}
                          {cs === 'open' && (
                            <button onClick={() => handleClaimUpdate(ex.id, 'submitted')}
                              style={{ background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>
                              Segna inviato
                            </button>
                          )}
                          <button onClick={() => downloadClaimPdf(ex.id, ex.trackingNumber)}
                            style={{ background: '#1565c0', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>
                            📄 PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {exceptions.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#aaa', fontSize: '13px' }}>Nessuna eccezione nel periodo selezionato</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Aggiungi `FedExReportSection` ad `AdminPage.tsx`**

In `AdminPage.tsx`, aggiungi l'import:

```typescript
import { FedExReportSection } from '../components/admin/FedExReportSection';
```

Dopo il componente `SyncMonitoringDashboard` (o dopo il primo blocco di monitoraggio), aggiungi:

```tsx
<FedExReportSection />
```

- [ ] **Step 6: Test + type-check completo**

```bash
npm test --prefix archibald-web-app/frontend -- FedExReportSection.spec
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/backend
```

Expected: tutti i test PASS, type-check OK, backend build OK

- [ ] **Step 7: Commit finale**

```bash
git add archibald-web-app/frontend/src/components/admin/FedExReportSection.tsx \
        archibald-web-app/frontend/src/components/admin/FedExReportSection.spec.tsx \
        archibald-web-app/frontend/src/pages/AdminPage.tsx
git commit -m "feat(admin): FedEx report section with stats, exception list, claim management and CSV/PDF export"
```

---

## Verifica finale

```bash
npm run type-check --prefix archibald-web-app/frontend
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/backend
```

Expected: 0 errori, tutti i test PASS.

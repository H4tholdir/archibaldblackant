# FedEx Tracking Improvements & Reportistica — Design Spec

## Goal

Migliorare il sistema FedEx in tre direzioni collegate: (1) riconoscere correttamente tutti i codici di stato e di eccezione dell'API FedEx, arricchendo i dati salvati; (2) aggiornare la UI delle card ordine e le notifiche per riflettere questi dati; (3) aggiungere una sezione di reportistica admin/agente con export per reclami.

## Architecture

Quattro aree di cambiamento indipendenti ma con una dipendenza sequenziale: il DB va modificato per primo, poi il backend, poi il frontend.

1. **DB** — migration 036: nuovi campi su `order_records` + nuova tabella `tracking_exceptions`
2. **Backend sync** — `fedex-api-tracker.ts` estrae più campi; `tracking-sync.ts` corregge `mapTrackingStatus`, salva nuovi campi, logga eccezioni, risolve eccezioni alla consegna
3. **Backend notifiche + admin API** — corpo notifica arricchito, navigate-to con `orderNumber`, nuovi endpoint `/api/admin/tracking/*`
4. **Frontend** — `TrackingProgressBar`, `OrderCardNew`, `notifications.service.ts`, `OrderHistory`, nuova `FedExReportSection` in `AdminPage`

**Tech stack**: Express + pg pool (backend), React 19 + TypeScript strict (frontend), Vitest (test), schema `agents.*`.

---

## Sezione 1 — DB: migration 036

**File**: `backend/src/db/migrations/036-fedex-tracking-improvements.sql`

### 1a — Nuovi campi su `agents.order_records`

```sql
ALTER TABLE agents.order_records
  ADD COLUMN IF NOT EXISTS tracking_delay_reason       TEXT,
  ADD COLUMN IF NOT EXISTS tracking_delivery_attempts  INTEGER,
  ADD COLUMN IF NOT EXISTS tracking_attempted_delivery_at TIMESTAMPTZ;
```

- `tracking_delay_reason`: causa del ritardo FedEx (es. `WEATHER`, `OPERATIONAL`) dal campo `delayDetail.type`
- `tracking_delivery_attempts`: numero di tentativi di consegna dal campo `deliveryDetails.deliveryAttempts`
- `tracking_attempted_delivery_at`: timestamp dell'ultimo tentativo fallito da `dateAndTimes[ATTEMPTED_DELIVERY]`

### 1b — Nuova tabella `agents.tracking_exceptions`

```sql
CREATE TABLE IF NOT EXISTS agents.tracking_exceptions (
  id                   SERIAL PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  order_number         TEXT NOT NULL,
  tracking_number      TEXT NOT NULL,
  exception_code       TEXT,
  exception_description TEXT NOT NULL,
  exception_type       TEXT NOT NULL
    CHECK (exception_type IN ('exception', 'held', 'returning', 'delay', 'canceled')),
  occurred_at          TIMESTAMPTZ NOT NULL,
  resolved_at          TIMESTAMPTZ,
  resolution           TEXT CHECK (resolution IN ('delivered', 'returned', 'claimed', NULL)),
  claim_status         TEXT DEFAULT NULL
    CHECK (claim_status IN ('open', 'submitted', 'resolved', NULL)),
  claim_submitted_at   TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tracking_number, occurred_at)
);

CREATE INDEX IF NOT EXISTS idx_tracking_exceptions_user
  ON agents.tracking_exceptions (user_id);
CREATE INDEX IF NOT EXISTS idx_tracking_exceptions_order
  ON agents.tracking_exceptions (order_number);
CREATE INDEX IF NOT EXISTS idx_tracking_exceptions_open
  ON agents.tracking_exceptions (user_id, resolved_at)
  WHERE resolved_at IS NULL;
```

- `UNIQUE (tracking_number, occurred_at)` previene duplicati in caso di sync ripetute
- `exception_type` mappa ai nuovi stati del tracking
- `claim_status NULL` = nessun reclamo; `open` = reclamo aperto; `submitted` = inviato a FedEx; `resolved` = chiuso

### 1c — Aggiornamento indice tracking active

```sql
DROP INDEX IF EXISTS idx_order_records_tracking_active;
CREATE INDEX IF NOT EXISTS idx_order_records_tracking_active
ON agents.order_records (tracking_number, tracking_status)
WHERE tracking_number IS NOT NULL
  AND (tracking_status IS NULL
       OR tracking_status NOT IN ('delivered', 'returning', 'canceled'))
  AND delivery_confirmed_at IS NULL;
```

Aggiunge `returning` e `canceled` agli stati finali esclusi dall'indice.

---

## Sezione 2 — Backend: `fedex-api-tracker.ts`

**File**: `backend/src/sync/services/fedex-api-tracker.ts`

### 2a — Nuovi campi in `FedExScanEvent`

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
  exceptionCode: string;       // NUOVO — es. "DEX08", "" se assente
  exceptionDescription: string;
};
```

Nel parsing di ogni `scanEvent` aggiungere:
```ts
exceptionCode: ev.exceptionCode ?? '',
```

### 2b — Nuovi campi in `FedExTrackingResult`

```ts
type FedExTrackingResult = {
  // ... campi esistenti ...
  delayReason?: string;           // NUOVO — latestStatusDetail.delayDetail.type
  deliveryAttempts?: number;      // NUOVO — deliveryDetails.deliveryAttempts (parsed int)
  attemptedDeliveryAt?: string;   // NUOVO — dateAndTimes[ATTEMPTED_DELIVERY].dateTime
};
```

Nel parsing della response aggiungere:
```ts
delayReason: trackResult.latestStatusDetail?.delayDetail?.type,
deliveryAttempts: trackResult.deliveryDetails?.deliveryAttempts
  ? parseInt(trackResult.deliveryDetails.deliveryAttempts, 10)
  : undefined,
attemptedDeliveryAt: trackResult.dateAndTimes
  ?.find(d => d.type === 'ATTEMPTED_DELIVERY')?.dateTime,
```

---

## Sezione 3 — Backend: `tracking-sync.ts`

**File**: `backend/src/sync/services/tracking-sync.ts`

### 3a — `mapTrackingStatus` espanso

```ts
function mapTrackingStatus(statusBarCD: string, keyStatusCD: string): string {
  if (statusBarCD === 'DL') return 'delivered';
  if (statusBarCD === 'RS' || statusBarCD === 'RP'
    || keyStatusCD === 'RS') return 'returning';
  if (statusBarCD === 'HL' || statusBarCD === 'HP'
    || keyStatusCD === 'HL') return 'held';
  if (statusBarCD === 'CA') return 'canceled';
  if (statusBarCD === 'DE' || keyStatusCD === 'DE'
    || keyStatusCD === 'DF' || statusBarCD === 'SE'
    || statusBarCD === 'DY' || statusBarCD === 'DD'
    || statusBarCD === 'CD') return 'exception';
  if (keyStatusCD === 'OD' || statusBarCD === 'OD') return 'out_for_delivery';
  if (statusBarCD === 'IT' || statusBarCD === 'OW' || statusBarCD === 'PU'
    || statusBarCD === 'DP' || statusBarCD === 'AR' || statusBarCD === 'AF'
    || statusBarCD === 'FD') return 'in_transit';
  return 'pending';
}
```

Nuovi stati aggiunti: `returning` (RS/RP), `held` (HL/HP), `canceled` (CA). I codici `SE`, `DY`, `DD`, `CD` vengono mappati su `exception` (equivalenti semantici di `DE`).

### 3b — Salvataggio nuovi campi in `updateTrackingData`

La chiamata a `updateTrackingData` nel repository aggiunge:
```ts
tracking_delay_reason: result.delayReason ?? null,
tracking_delivery_attempts: result.deliveryAttempts ?? null,
tracking_attempted_delivery_at: result.attemptedDeliveryAt ?? null,
```

Il repository `updateTrackingData` in `backend/src/db/repositories/orders.ts` aggiunge queste tre colonne nella query UPDATE.

### 3c — Tipo `TrackingEventType` espanso

```ts
type TrackingEventType = 'delivered' | 'exception' | 'held' | 'returning' | 'canceled';
```

Il callback `onTrackingEvent` viene chiamato per tutti i nuovi stati oltre a `delivered` e `exception`.

### 3d — Logging eccezioni nella tabella `tracking_exceptions`

Aggiungere in `syncTracking`, dopo `updateTrackingData`, una chiamata a `logTrackingException`:

```ts
// Logga eccezione se status è eccezione/giacenza/ritorno/cancellato
// e non esiste già un record per questo (tracking_number, occurred_at)
if (['exception', 'held', 'returning', 'canceled'].includes(newStatus)) {
  // Strategia di ricerca evento per tipo: ogni stato ha codici diversi
  const exceptionStatusCDs: Record<string, string[]> = {
    exception: ['DE', 'SE', 'DY', 'DD', 'CD'],
    held:      ['HL', 'HP'],
    returning: ['RS', 'RP'],
    canceled:  ['CA'],
  };
  const codes = exceptionStatusCDs[newStatus] ?? [];
  const latestEvent = result.scanEvents
    ?.find(ev => codes.includes(ev.statusCD) || (newStatus === 'exception' && ev.exception));
  if (latestEvent) {
    await logTrackingException(pool, {
      userId,
      orderNumber,
      trackingNumber: result.trackingNumber,
      exceptionCode: latestEvent.exceptionCode,
      exceptionDescription: latestEvent.exceptionDescription || latestEvent.status,
      exceptionType: newStatus as 'exception' | 'held' | 'returning' | 'canceled',
      occurredAt: `${latestEvent.date}T${latestEvent.time}`,
    });
  }
}
```

### 3e — Risoluzione eccezioni alla consegna

Quando `newStatus === 'delivered'`:
```ts
await resolveOpenExceptions(pool, orderNumber, 'delivered');
```

Quando `newStatus === 'returning'` e il ritorno si completa (ordine ricevuto):
```ts
await resolveOpenExceptions(pool, orderNumber, 'returned');
```

La funzione `resolveOpenExceptions` nel repository aggiorna `resolved_at = NOW()` e `resolution = 'delivered'/'returned'` su tutti i record aperti per `order_number`.

---

## Sezione 4 — Backend: repository `tracking-exceptions`

**File**: `backend/src/db/repositories/tracking-exceptions.ts`

```ts
type TrackingException = {
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

type LogExceptionParams = {
  userId: string;
  orderNumber: string;
  trackingNumber: string;
  exceptionCode: string;
  exceptionDescription: string;
  exceptionType: TrackingException['exceptionType'];
  occurredAt: string;
};
```

Funzioni:
- `logTrackingException(pool, params)` — INSERT ... ON CONFLICT (tracking_number, occurred_at) DO NOTHING
- `resolveOpenExceptions(pool, orderNumber, resolution)` — UPDATE SET resolved_at, resolution WHERE resolved_at IS NULL AND order_number = $1
- `getExceptionsByUser(pool, userId, filters)` — GET con filtri: status (open/closed), from, to
- `getExceptionStats(pool, filters)` — aggregati: total, by_type, by_exception_code
- `updateClaimStatus(pool, id, claimStatus, userId)` — PATCH claim_status (verifica userId per sicurezza)
- `getExceptionById(pool, id)` — per PDF generation

---

## Sezione 5 — Backend: notifiche

**File**: `backend/src/main.ts` — callback `onTrackingEvent`

### 5a — Corpo notifica arricchito

```ts
// Recupera il motivo eccezione dall'ultimo evento scan
const latestException = order.trackingEvents
  ?.find((ev: { exception: boolean }) => ev.exception);
const reason = latestException?.exceptionDescription || 'Problema di consegna';

await createNotification(notificationDeps, {
  type: 'fedex_exception',
  severity: 'warning',
  title: 'Eccezione tracking FedEx',
  body: `Ordine ${orderNumber} (${customerName}): ${reason}.`,
  data: { orderNumber, customerName, reason },
});
```

Analogamente per `held`:
```ts
body: `Ordine ${orderNumber} (${customerName}) in giacenza presso punto FedEx.`
```

Per `returning`:
```ts
body: `Ordine ${orderNumber} (${customerName}) in ritorno al mittente.`
```

### 5b — Notifiche per nuovi stati

Il callback `onTrackingEvent` gestisce anche `held` e `returning` come tipi distinti, creando notifiche con `type: 'fedex_exception'` (stesso tipo, la distinzione è nel corpo e in `data.exceptionType`).

---

## Sezione 6 — Backend: API tracking

Due file: uno per admin (include gestione claim + PDF), uno per agenti (sola lettura proprie eccezioni).

**File A**: `backend/src/routes/admin.ts` — aggiunge sotto-router `tracking` (admin-only)

```
GET  /api/admin/tracking/stats
     ?userId=<agentId>&from=<ISO>&to=<ISO>
     → { totalWithTracking, delivered, exceptionActive, held, returning,
         exceptionsByCode: [{code, description, count}],
         claimsSummary: {open, submitted, resolved} }

GET  /api/admin/tracking/exceptions
     ?userId=<agentId>&status=open|closed|all&from=<ISO>&to=<ISO>
     → TrackingException[]  (join con order_records per customerName)

PATCH /api/admin/tracking/exceptions/:id/claim
      body: { claimStatus: 'open' | 'submitted' | 'resolved' }
      → { id, claimStatus }

GET  /api/admin/tracking/exceptions/:id/claim-pdf
     → application/pdf (generato con Puppeteer)
```

**File B**: `backend/src/routes/tracking.ts` — nuovo router per agenti (registrato come `/api/tracking`)

```
GET  /api/tracking/my-exceptions
     ?status=open|closed|all&from=<ISO>&to=<ISO>
     → TrackingException[] filtrate per userId della sessione corrente
```

Il router `tracking.ts` segue il pattern factory `createTrackingRouter(deps)` già usato dagli altri router. Richiede autenticazione ma non ruolo admin. Il `userId` è sempre `req.session.userId` (non parametro).

---

## Sezione 7 — Backend: PDF reclamo

**File**: `backend/src/services/fedex-claim-pdf.ts`

Usa Puppeteer (già installato) per generare PDF da template HTML:

```ts
async function generateClaimPdf(exception: TrackingException & { order: OrderInfo }): Promise<Buffer>
```

Il template HTML del reclamo include:
- Header: logo FedEx + titolo "Dichiarazione Reclamo Spedizione"
- Dati spedizione: tracking number, numero ordine, data spedizione, servizio
- Destinatario: nome cliente, indirizzo
- Eccezione: codice (es. DEX08), descrizione, data/ora, luogo
- Tentativi consegna: numero, date dei tentativi falliti
- Cronologia eventi: tabella con tutti gli scan events
- Spazio firma: "Firma agente" + "Data presentazione reclamo"

---

## Sezione 8 — Frontend: `TrackingProgressBar.tsx`

**Modifiche a** `frontend/src/components/TrackingProgressBar.tsx`

### 8a — Nuovi stati visivi

Tutti gli stati anomali (`exception`, `held`, `returning`) usano lo **stesso colore** già definito per `exception`: `#cc0066` / background `#fff0f5`. La distinzione è solo nel testo del label e nel messaggio.

| Status | Colore dot/line | Background card | Label step | Messaggio sotto |
|--------|-----------------|-----------------|------------|-----------------|
| `exception` | `#cc0066` | `#fff0f5` | `⚠ Eccezione` | `exceptionDescription` (DEX code) |
| `held` | `#cc0066` | `#fff0f5` | `🏪 Giacenza` | Indirizzo punto ritiro |
| `returning` | `#cc0066` | `#fff0f5` | `↩ In ritorno` | Motivo reso |
| `canceled` | `#757575` | `#f5f5f5` | `✕ Annullato` | — |

`canceled` usa il grigio neutro perché non è un'eccezione operativa ma uno stato finale definitivo.

### 8b — Motivo eccezione nella barra compatta

Quando `info.exceptionReason` è presente (già esiste il campo), mostrare il `exceptionCode` prefissato se disponibile:

```ts
// Attuale: mostra exceptionReason generico
// NUOVO: se scanEvent ha exceptionCode, prefissa
const exceptionLabel = exceptionCode
  ? `${exceptionCode}: ${exceptionReason}`
  : exceptionReason;
```

Il componente ottiene `exceptionCode` dal primo scan event con `exception: true`.

---

## Sezione 9 — Frontend: `OrderCardNew.tsx`

**File**: `frontend/src/components/OrderCardNew.tsx`

### 9a — Badge eccezioni storiche su ordini consegnati

Quando `order.trackingStatus === 'delivered'`:
1. Contare gli eventi in `order.trackingEvents` dove `ev.exception === true`
2. Se `exceptionsCount > 0`, mostrare sotto il badge "Consegnato" un secondo badge:

```tsx
{exceptionsCount > 0 && (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, fontWeight: 600, color: '#b45309',
    background: '#fef3c7', border: '1px solid #fcd34d',
    borderRadius: 20, padding: '2px 8px', marginTop: 6,
  }}>
    ⚠️ {exceptionsCount} {exceptionsCount === 1 ? 'eccezione' : 'eccezioni'} in transito
  </div>
)}
```

### 9b — Colori per nuovi stati

Aggiungere a `getOrderBorderColor` (o funzione equivalente). `held` e `returning` condividono il colore di `exception`:

```ts
case 'held':      return { borderColor: '#cc0066', backgroundColor: '#fff0f5' };
case 'returning': return { borderColor: '#cc0066', backgroundColor: '#fff0f5' };
case 'canceled':  return { borderColor: '#757575', backgroundColor: '#f5f5f5' };
```

---

## Sezione 10 — Frontend: notifiche navigate-to

**File**: `frontend/src/services/notifications.service.ts`

Modificare `getNotificationRoute` per i tipi FedEx:

```ts
case 'fedex_exception':
case 'fedex_delivered':
  return notification.data?.orderNumber
    ? `/orders?highlight=${notification.data.orderNumber}`
    : '/orders';
```

**File**: `frontend/src/pages/OrderHistory.tsx` (o pagina ordini equivalente)

Alla mount, leggere `new URLSearchParams(location.search).get('highlight')`. Se presente, trovare la card con quell'`orderNumber`, scrollare fino ad essa e applicare un bordo lampeggiante per 2 secondi:

```ts
useEffect(() => {
  const highlight = new URLSearchParams(location.search).get('highlight');
  if (!highlight) return;
  const el = document.getElementById(`order-card-${highlight}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.boxShadow = '0 0 0 3px #cc0066';
    setTimeout(() => { el.style.boxShadow = ''; }, 2000);
  }
}, [orders]);
```

Ogni card ordine deve avere `id={`order-card-${order.orderNumber}`}`.

---

## Sezione 11 — Frontend: `FedExReportSection.tsx`

**File**: `frontend/src/components/admin/FedExReportSection.tsx`
**Modifica**: `frontend/src/pages/AdminPage.tsx` — aggiunge il componente dopo `SyncMonitoringDashboard`

### 11a — Struttura del componente

```
FedExReportSection
├── Filtri (agente + periodo)
├── StatBoxes (4 card: consegnati, con eccezioni, reclami aperti, in eccezione ora)
├── ExceptionsByCodeChart (barre orizzontali per tipo DEX)
├── ExceptionsList (tabella con claim_status + azioni)
│   ├── Row → badge Aperto/Inviato/Risolto
│   ├── Row → button "📄 PDF Reclamo" (chiama GET /claim-pdf)
│   └── Row → button "✓ Segna risolto"
└── ExportCsvButton
```

### 11b — API service

**File**: `frontend/src/services/fedex-report.service.ts`

```ts
function getTrackingStats(filters: TrackingStatsFilters): Promise<TrackingStats>
function getTrackingExceptions(filters: TrackingExceptionsFilters): Promise<TrackingException[]>
function updateClaimStatus(id: number, claimStatus: ClaimStatus): Promise<void>
function downloadClaimPdf(id: number): Promise<void>  // apre blob URL
function exportExceptionsCsv(filters: TrackingExceptionsFilters): void  // CSV client-side
```

---

## Sezione 12 — Frontend: vista agente eccezioni

Gli agenti accedono alle proprie eccezioni tramite `GET /api/tracking/my-exceptions` (Sezione 6, File B).

Nell'`OrderHistory.tsx` (pagina ordini agente), aggiungere un filtro rapido "⚠ Con eccezioni" che filtra localmente gli ordini dove `trackingStatus` è `exception`, `held`, o `returning`, o dove ci sono eccezioni storiche su ordini `delivered` (badge giallo presente).

Il servizio frontend per l'agente usa `fedex-report.service.ts` chiamando `/api/tracking/my-exceptions` (non l'endpoint admin).

Non serve una pagina separata: è un filtro aggiuntivo nella lista ordini esistente.

---

## Sezione 13 — Testing

- Unit test `mapTrackingStatus` — tutti i codici nuovi (RS→returning, HL→held, CA→canceled, SE→exception, DY→exception)
- Unit test `logTrackingException` + `resolveOpenExceptions` — verifica dedup ON CONFLICT, verifica risoluzione
- Unit test `generateClaimPdf` — mock Puppeteer, verifica buffer restituito
- Integration test `GET /api/admin/tracking/stats` — dati aggregati corretti
- Integration test `GET /api/admin/tracking/exceptions` — filtri per status e agente
- Integration test `PATCH .../claim` — aggiornamento claim_status con verifica autorizzazione
- Unit test `FedExReportSection` — render con dati mock, click PDF, export CSV
- Unit test `TrackingProgressBar` — nuovi stati `held`, `returning`, `canceled` renderizzano correttamente
- Unit test `OrderCardNew` — badge eccezioni storiche appare solo su `delivered` con `exception: true` negli eventi

---

## Scope escluso

- Web Push / notifiche push native (nessuna dipendenza da service worker)
- Integrazione diretta con portale reclami FedEx (il PDF è per uso manuale)
- Storico revisioni dei claim (solo stato corrente)
- Notifiche email dei reclami

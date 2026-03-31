# Pending Orders UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix tre problemi nel flusso pending orders: progress bar che si azzera navigando, multi-invio con bug isGhostArticle e coda non serializzata, fetch header ERP immediato dopo piazzamento ordine.

**Architecture:** (1) Frontend usa `OperationTrackingContext.activeOperations` come sorgente live per la progress bar sulla card. (2) Backend introduce una coda `bot-queue` dedicata con `concurrency: 1` per serializzare la creazione di ordini sull'ERP; il meccanismo di worker esistente in `main.ts` la raccoglie automaticamente. (3) Il bot aggiunge un metodo `readOrderHeader` che naviga alla DetailView dopo il piazzamento e legge i campi ERP, aggiornando `order_records` prima della sync articoli.

**Tech Stack:** React 19 + TypeScript strict (frontend), Node 20 + BullMQ + Puppeteer (backend), Vitest (test), PostgreSQL via `pg`.

**Spec:** `docs/superpowers/specs/2026-03-31-pending-orders-ux-improvements-design.md`

---

## File Map

| File | Azione |
|------|--------|
| `frontend/src/pages/PendingOrdersPage.tsx` | M — progress bar liveOp, isGhostArticle, savePendingOrder non-blocking |
| `backend/src/config.ts` | M — aggiungi config `bot-queue` |
| `backend/src/operations/queue-router.ts` | M — aggiungi `bot-queue` a QueueName/QUEUE_NAMES, reroute `submit-order` |
| `backend/src/operations/handlers/submit-order.ts` | M — estendi SubmitOrderBot, aggiungi readOrderHeader call + cooldown |
| `backend/src/bot/archibald-bot.ts` | M — implementa `readOrderHeader` |
| `backend/scripts/diag-order-header-fields.mjs` | C — diagnostico selettori XAF DetailView ordine |
| `backend/src/operations/queue-router.spec.ts` | M — aggiorna test per nuovo routing |
| `backend/src/operations/handlers/submit-order.spec.ts` | M — aggiunge test readOrderHeader + cooldown |
| `frontend/src/pages/PendingOrdersPage.spec.tsx` | M — aggiorna test per liveOp + isGhostArticle |

---

## Task 1: Fix progress bar restoration dopo navigazione

**Spec:** §1 — `PendingOrdersPage` usa `activeOperations` da `OperationTrackingContext` come dato live per `JobProgressBar`.

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx:42,1054-1060,1446-1453`
- Test: `archibald-web-app/frontend/src/pages/PendingOrdersPage.spec.tsx`

- [ ] **Step 1: Aggiorna l'import di `useOperationTracking` a riga 42**

```tsx
// PRIMA (riga 42):
const { trackOperation } = useOperationTracking();

// DOPO:
const { trackOperation, activeOperations } = useOperationTracking();
```

- [ ] **Step 2: Aggiungi `liveOp` nella card map, prima delle variabili derivate (riga 1054)**

Trova questo blocco (riga 1054-1060):
```tsx
const isJobActive =
  order.jobStatus &&
  ["started", "processing"].includes(order.jobStatus);
const isJobCompleted = order.jobStatus === "completed";
const isJobFailed = order.jobStatus === "failed";
const isPersistedError = order.status === "error" && !isJobActive && !isJobFailed;
const isStale = staleJobIds.has(order.id!);
```

Sostituisci con:
```tsx
const liveOp = activeOperations.find(o => o.orderId === order.id);
const isJobActive =
  order.jobStatus &&
  ["started", "processing"].includes(order.jobStatus);
const isJobCompleted = order.jobStatus === "completed";
const isJobFailed = order.jobStatus === "failed";
const isPersistedError = order.status === "error" && !isJobActive && !isJobFailed;
const isStale = staleJobIds.has(order.id!);
```

- [ ] **Step 3: Aggiorna la condizione di rendering e le props di `JobProgressBar` (riga 1446-1453)**

Trova questo blocco:
```tsx
{(isJobActive || isJobCompleted || isJobFailed) && (
  <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
    <JobProgressBar
      progress={order.jobProgress || 0}
      operation={order.jobOperation || "In attesa..."}
      status={order.jobStatus || "idle"}
      error={isJobFailed ? order.jobError : undefined}
    />
```

Sostituisci con:
```tsx
{(liveOp != null || isJobActive || isJobCompleted || isJobFailed) && (
  <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
    <JobProgressBar
      progress={liveOp?.progress ?? order.jobProgress ?? 0}
      operation={liveOp?.label ?? order.jobOperation ?? "In attesa..."}
      status={
        liveOp != null
          ? liveOp.status === "completed" ? "completed"
            : liveOp.status === "failed" ? "failed"
            : liveOp.status === "queued" ? "started"
            : "processing"
          : order.jobStatus ?? "idle"
      }
      error={
        (liveOp?.status === "failed" ? liveOp.error : undefined) ??
        (isJobFailed ? order.jobError : undefined)
      }
    />
```

- [ ] **Step 4: Scrivi il test failing**

In `archibald-web-app/frontend/src/pages/PendingOrdersPage.spec.tsx`, cerca il test per il `JobProgressBar` (se esiste) o aggiungi in una describe appropriata:

```tsx
it('mostra il progresso live da activeOperations quando si ritorna sulla pagina', async () => {
  const orderId = 'order-123';
  const mockActiveOperations = [
    {
      orderId,
      jobId: 'job-abc',
      customerName: 'Cliente Test',
      status: 'active' as const,
      progress: 65,
      label: 'Inserimento articoli',
      startedAt: Date.now(),
    },
  ];

  // Render con un ordine che ha jobStatus: undefined (DB non aggiornato)
  // ma activeOperations ha dati live
  render(
    <MockProviders activeOperations={mockActiveOperations}>
      <PendingOrdersPage />
    </MockProviders>
  );

  // La barra deve mostrare 65% dal liveOp, non 0% dal DB
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '65');
  // oppure, se JobProgressBar non usa aria, verifica il testo:
  expect(screen.getByText(/65%/)).toBeInTheDocument();
});
```

- [ ] **Step 5: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/frontend -- --run --reporter=verbose 2>&1 | grep -A 5 "mostra il progresso live"
```

Expected: FAIL

- [ ] **Step 6: Verifica che l'implementazione faccia passare i test**

```bash
npm test --prefix archibald-web-app/frontend -- --run 2>&1 | tail -20
```

Expected: tutti i test passano incluso il nuovo.

- [ ] **Step 7: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx \
        archibald-web-app/frontend/src/pages/PendingOrdersPage.spec.tsx
git commit -m "fix(pending): ripristina progress bar card dopo navigazione usando activeOperations"
```

---

## Task 2: Fix isGhostArticle mancante e savePendingOrder non-bloccante

**Spec:** §2a + §2b

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

- [ ] **Step 1: Aggiungi `isGhostArticle` in `handleSubmitOrders` (righe ~292-310)**

Trova il mapping items in `handleSubmitOrders`:
```tsx
return enqueueOperation('submit-order', {
  // ...
  items: items.map((item) => ({
    articleCode: item.articleCode,
    productName: item.productName,
    description: item.description,
    quantity: item.quantity,
    price: item.price,
    discount: item.discount,
    vat: item.vat,
    warehouseQuantity: item.warehouseQuantity || 0,
    warehouseSources: item.warehouseSources || [],
  })),
```

Aggiungi `isGhostArticle: item.isGhostArticle,` come ultima proprietà prima della chiusura `}`:
```tsx
items: items.map((item) => ({
  articleCode: item.articleCode,
  productName: item.productName,
  description: item.description,
  quantity: item.quantity,
  price: item.price,
  discount: item.discount,
  vat: item.vat,
  warehouseQuantity: item.warehouseQuantity || 0,
  warehouseSources: item.warehouseSources || [],
  isGhostArticle: item.isGhostArticle,
})),
```

- [ ] **Step 2: Aggiungi `isGhostArticle` in `handleRetryOrder` (righe ~400-415)**

Stesso pattern — trova il mapping items in `handleRetryOrder` e aggiungi `isGhostArticle: item.isGhostArticle,`.

- [ ] **Step 3: Rendi il loop `savePendingOrder` non-bloccante (righe ~330-340)**

Trova questo blocco in `handleSubmitOrders` (DOPO il loop `trackOperation`):
```tsx
for (const orderId of selectedOrderIds) {
  const order = orders.find((o) => o.id === orderId);
  if (order) {
    await savePendingOrder({
      ...order,
      status: "syncing",
      updatedAt: new Date().toISOString(),
      needsSync: true,
    });
  }
}
```

Sostituisci con:
```tsx
void Promise.allSettled(
  Array.from(selectedOrderIds).map((orderId) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return Promise.resolve();
    return savePendingOrder({
      ...order,
      status: "syncing",
      updatedAt: new Date().toISOString(),
      needsSync: true,
    });
  }),
);
```

- [ ] **Step 4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori.

- [ ] **Step 5: Test frontend**

```bash
npm test --prefix archibald-web-app/frontend -- --run 2>&1 | tail -10
```

Expected: tutti passano.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "fix(pending): passa isGhostArticle al backend e rendi savePendingOrder non-bloccante"
```

---

## Task 3: Aggiungi coda `bot-queue` con concurrency 1

**Spec:** §2c — `submit-order` va su una coda dedicata, processata un job alla volta. `main.ts` non richiede modifiche: crea automaticamente worker per ogni nome in `QUEUE_NAMES`.

**Files:**
- Modify: `archibald-web-app/backend/src/config.ts`
- Modify: `archibald-web-app/backend/src/operations/queue-router.ts`
- Test: `archibald-web-app/backend/src/operations/queue-router.spec.ts`

- [ ] **Step 1: Scrivi il test failing per il nuovo routing**

In `archibald-web-app/backend/src/operations/queue-router.spec.ts`, aggiungi:
```ts
import { describe, expect, it } from 'vitest';
import { getQueueForOperation, QUEUE_NAMES } from './queue-router';

describe('getQueueForOperation', () => {
  it('instrada submit-order su bot-queue', () => {
    expect(getQueueForOperation('submit-order')).toBe('bot-queue');
  });

  it('include bot-queue in QUEUE_NAMES', () => {
    expect(QUEUE_NAMES).toContain('bot-queue');
  });

  it('non instrada create-customer su bot-queue', () => {
    expect(getQueueForOperation('create-customer')).toBe('writes');
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/backend -- --run queue-router 2>&1 | tail -15
```

Expected: FAIL — `'submit-order'` ancora punta a `'writes'`.

- [ ] **Step 3: Aggiungi config `bot-queue` in `config.ts`**

In `archibald-web-app/backend/src/config.ts`, all'interno dell'oggetto `queues`, aggiungi dopo la entry `'shared-sync'`:

```ts
'bot-queue': {
  concurrency: 1,
  lockDuration: 900_000,    // 15 min: copre worst case (~20 articoli + header read + cooldown)
  stalledInterval: 30_000,
  removeOnComplete: { count: 100 } as const,
},
```

- [ ] **Step 4: Aggiorna `queue-router.ts`**

Sostituisci l'intero contenuto del file con:
```ts
import type { OperationType } from './operation-types';

type QueueName = 'writes' | 'agent-sync' | 'enrichment' | 'shared-sync' | 'bot-queue';

const QUEUE_NAMES: readonly QueueName[] = ['writes', 'agent-sync', 'enrichment', 'shared-sync', 'bot-queue'] as const;

const QUEUE_ROUTING: Record<OperationType, QueueName> = {
  'submit-order': 'bot-queue',
  'create-customer': 'writes',
  'update-customer': 'writes',
  'read-vat-status': 'writes',
  'send-to-verona': 'writes',
  'batch-send-to-verona': 'writes',
  'edit-order': 'writes',
  'delete-order': 'writes',
  'batch-delete-orders': 'writes',
  'download-ddt-pdf': 'writes',
  'download-invoice-pdf': 'writes',
  'sync-customers': 'agent-sync',
  'sync-orders': 'agent-sync',
  'sync-ddt': 'agent-sync',
  'sync-invoices': 'agent-sync',
  'sync-order-articles': 'enrichment',
  'sync-order-states': 'enrichment',
  'sync-tracking': 'enrichment',
  'sync-customer-addresses': 'enrichment',
  'sync-products': 'shared-sync',
  'sync-prices': 'shared-sync',
};

function getQueueForOperation(type: OperationType): QueueName {
  return QUEUE_ROUTING[type];
}

export { getQueueForOperation, QUEUE_ROUTING, QUEUE_NAMES, type QueueName };
```

- [ ] **Step 5: Esegui i test — devono passare**

```bash
npm test --prefix archibald-web-app/backend -- --run queue-router 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 6: Build backend per verificare TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Expected: 0 errori. `config.ts` e `main.ts` devono compilare senza errori perché `QUEUE_NAMES` guida automaticamente la creazione dei worker.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/config.ts \
        archibald-web-app/backend/src/operations/queue-router.ts \
        archibald-web-app/backend/src/operations/queue-router.spec.ts
git commit -m "feat(queue): aggiungi bot-queue concurrency-1 per serializzare submit-order"
```

---

## Task 4: Aggiungi cooldown post-piazzamento in `handleSubmitOrder`

**Spec:** §2d — sleep di 5s dopo `onProgress(100)` per dare respiro al DOM DevExpress prima che il prossimo ordine inizi.

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts:484-497`
- Test: `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts`

- [ ] **Step 1: Scrivi test failing**

In `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts`, aggiungi nel describe `handleSubmitOrder`:

```ts
it('attende 5s di cooldown dopo il completamento (non-warehouse)', async () => {
  const startMs = Date.now();

  await handleSubmitOrder(
    mockPool,
    mockBot,        // bot con isGhostOnly=false (ha createOrder etc.)
    validOrderData, // ordine normale non-warehouse
    'user-1',
    vi.fn(),
  );

  const elapsed = Date.now() - startMs;
  expect(elapsed).toBeGreaterThanOrEqual(4_500); // tolleranza 500ms
});

it('non attende cooldown per ordini ghost-only', async () => {
  const startMs = Date.now();

  await handleSubmitOrder(
    mockPool,
    mockBot,
    { ...validOrderData, items: [{ ...ghostItem, isGhostArticle: true }] },
    'user-1',
    vi.fn(),
  );

  const elapsed = Date.now() - startMs;
  expect(elapsed).toBeLessThan(4_000);
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/backend -- --run submit-order 2>&1 | grep -A 3 "cooldown"
```

Expected: FAIL — nessun cooldown attuale.

- [ ] **Step 3: Aggiungi il cooldown in `handleSubmitOrder`**

Trova questo blocco alla fine di `handleSubmitOrder` (righe ~484-497):
```ts
  if (verificationPassed) {
    await pool.query('DELETE FROM agents.pending_orders WHERE id = $1', [data.pendingOrderId]);
    onProgress(100, 'Ordine completato');
  } else {
    await pool.query(
      `UPDATE agents.pending_orders
       SET status = 'error', error_message = $1, archibald_order_id = $2, updated_at = $3
       WHERE id = $4`,
      ['Discrepanze rilevate nell\'ordine - verifica necessaria', orderId, Date.now(), data.pendingOrderId],
    );
    onProgress(100, 'Ordine creato con discrepanze');
  }

  return { orderId, verificationStatus };
```

Sostituisci con:
```ts
  if (verificationPassed) {
    await pool.query('DELETE FROM agents.pending_orders WHERE id = $1', [data.pendingOrderId]);
    onProgress(100, 'Ordine completato');
  } else {
    await pool.query(
      `UPDATE agents.pending_orders
       SET status = 'error', error_message = $1, archibald_order_id = $2, updated_at = $3
       WHERE id = $4`,
      ['Discrepanze rilevate nell\'ordine - verifica necessaria', orderId, Date.now(), data.pendingOrderId],
    );
    onProgress(100, 'Ordine creato con discrepanze');
  }

  // Cooldown: mantieni il lock agentivo 5s per dare respiro al DOM DevExpress
  // prima che il prossimo ordine in bot-queue parta
  if (!isWarehouseOnly) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 5_000); });
  }

  return { orderId, verificationStatus };
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --run submit-order 2>&1 | tail -15
```

Expected: PASS (i nuovi test di cooldown impiegheranno ~5s ciascuno — è normale).

- [ ] **Step 5: Build backend**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: 0 errori.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts \
        archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts
git commit -m "feat(submit-order): aggiungi cooldown 5s post-completamento per DevExpress DOM"
```

---

## Task 5: Estendi `SubmitOrderBot` e aggiungi chiamata `readOrderHeader`

**Spec:** §3 — il bot legge i campi header dopo il piazzamento; il handler aggiorna `order_records`.

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts`
- Test: `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts`

- [ ] **Step 1: Aggiungi il tipo `OrderHeaderData` in `submit-order.ts`**

Inserisci dopo i tipi `SubmitOrderItem` e `SubmitOrderData`, prima di `SubmitOrderBot`:

```ts
type OrderHeaderData = {
  orderNumber: string | null;
  orderDescription: string | null;
  customerReference: string | null;
  deliveryDate: string | null;
  deliveryName: string | null;
  deliveryAddress: string | null;
  salesStatus: string | null;
  documentStatus: string | null;
  transferStatus: string | null;
};
```

- [ ] **Step 2: Estendi `SubmitOrderBot` con `readOrderHeader`**

Trova il tipo `SubmitOrderBot` e aggiungi il metodo:

```ts
type SubmitOrderBot = {
  createOrder: (orderData: SubmitOrderData) => Promise<string>;
  deleteOrderFromArchibald: (orderId: string) => Promise<{ success: boolean; message: string }>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
  readOrderHeader: (orderId: string) => Promise<OrderHeaderData | null>;
};
```

- [ ] **Step 3: Scrivi test failing per `readOrderHeader`**

In `submit-order.spec.ts`, aggiungi due test nel describe `handleSubmitOrder`:

```ts
it('chiama readOrderHeader e aggiorna order_records dopo il piazzamento', async () => {
  const mockHeader: OrderHeaderData = {
    orderNumber: 'SO-2024-001234',
    orderDescription: 'Riferimento cliente',
    customerReference: 'RC-001',
    deliveryDate: '4/5/2024',
    deliveryName: 'Mario Rossi',
    deliveryAddress: 'Via Roma 1',
    salesStatus: 'Giornale',
    documentStatus: 'Nessuno',
    transferStatus: 'Non trasferibile',
  };

  const bot = createMockBot({ readOrderHeader: vi.fn().mockResolvedValue(mockHeader) });

  await handleSubmitOrder(mockPool, bot, validOrderData, 'user-1', vi.fn());

  expect(bot.readOrderHeader).toHaveBeenCalledWith(expect.any(String));
  expect(mockPool.query).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE agents.order_records'),
    expect.arrayContaining(['SO-2024-001234', 'RC-001', 'Riferimento cliente']),
  );
});

it('continua normalmente se readOrderHeader restituisce null', async () => {
  const bot = createMockBot({ readOrderHeader: vi.fn().mockResolvedValue(null) });

  await expect(
    handleSubmitOrder(mockPool, bot, validOrderData, 'user-1', vi.fn())
  ).resolves.not.toThrow();

  // Nessun UPDATE per l'header
  const calls = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls;
  const headerUpdate = calls.find((args: unknown[]) =>
    typeof args[0] === 'string' && args[0].includes('UPDATE agents.order_records') && args[0].includes('order_number'),
  );
  expect(headerUpdate).toBeUndefined();
});

it('continua normalmente se readOrderHeader lancia eccezione', async () => {
  const bot = createMockBot({
    readOrderHeader: vi.fn().mockRejectedValue(new Error('ERP unreachable')),
  });

  await expect(
    handleSubmitOrder(mockPool, bot, validOrderData, 'user-1', vi.fn())
  ).resolves.not.toThrow();
});
```

- [ ] **Step 4: Esegui — deve fallire**

```bash
npm test --prefix archibald-web-app/backend -- --run submit-order 2>&1 | grep -A 3 "readOrderHeader"
```

Expected: FAIL — il tipo `SubmitOrderBot` non ha ancora `readOrderHeader`, TypeScript error.

- [ ] **Step 5: Aggiungi la chiamata `readOrderHeader` in `handleSubmitOrder`**

Trova questa sezione in `handleSubmitOrder` (dopo `batchTransfer`, prima di `let verificationStatus`):

```ts
  if (!isWarehouseOnly) {
    const transferred = await batchTransfer(pool, userId, [`pending-${data.pendingOrderId}`], orderId);
    logger.info('[SubmitOrder] Warehouse reservations transferred to Archibald order', {
      orderId, pendingOrderId: data.pendingOrderId, transferred,
    });
  }

  let verificationStatus: string | undefined;
```

Inserisci TRA il blocco `batchTransfer` e `let verificationStatus`:

```ts
  // Lettura immediata header ordine dal ERP
  if (!isWarehouseOnly) {
    onProgress(68, 'Lettura dettagli ordine dal ERP...');
    try {
      const header = await bot.readOrderHeader(orderId);
      if (header) {
        await pool.query(
          `UPDATE agents.order_records SET
             order_number = COALESCE($1, order_number),
             customer_reference = $2,
             order_description = $3,
             delivery_date = $4,
             delivery_name = $5,
             delivery_address = $6,
             sales_status = COALESCE($7, sales_status),
             document_status = COALESCE($8, document_status),
             transfer_status = COALESCE($9, transfer_status),
             last_sync = $10
           WHERE id = $11 AND user_id = $12`,
          [
            header.orderNumber,
            header.customerReference,
            header.orderDescription,
            header.deliveryDate,
            header.deliveryName,
            header.deliveryAddress,
            header.salesStatus,
            header.documentStatus,
            header.transferStatus,
            Math.floor(Date.now() / 1000),
            orderId,
            userId,
          ],
        );
        onProgress(69, 'Dettagli ordine aggiornati');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[SubmitOrder] readOrderHeader failed, sync schedulata recupererà', { orderId, error: message });
      onProgress(69, 'Lettura dettagli posticipata');
    }
  }
```

Aggiungi anche l'export del tipo in fondo al file:
```ts
export { handleSubmitOrder, createSubmitOrderHandler, calculateAmounts, type SubmitOrderData, type SubmitOrderBot, type SubmitOrderItem, type OrderHeaderData };
```

- [ ] **Step 6: Aggiorna i mock del bot negli spec esistenti**

Tutti i mock di `SubmitOrderBot` negli spec devono aggiungere `readOrderHeader`. Cerca i mock esistenti nel file:
```ts
// Aggiungi a ogni mock bot:
readOrderHeader: vi.fn().mockResolvedValue(null),
```

- [ ] **Step 7: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --run submit-order 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 8: Build backend**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: 0 errori. Il build fallirà se `archibald-bot.ts` espone `readOrderHeader` ma il tipo `SubmitOrderBot` non corrisponde — verificare.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts \
        archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts
git commit -m "feat(submit-order): leggi header ordine ERP post-piazzamento e aggiorna order_records"
```

---

## Task 6: Script diagnostico per selettori XAF DetailView ordine

**Spec:** §3b — prima di implementare `readOrderHeader` nel bot, scopriamo gli ID esatti degli elementi XAF nella DetailView dell'ordine. Metodologia consolidata del progetto.

**Files:**
- Create: `archibald-web-app/backend/scripts/diag-order-header-fields.mjs`

- [ ] **Step 1: Crea lo script diagnostico**

```js
/**
 * Diagnostico: scopre i selettori XAF per i campi header di un ordine
 * nella SALESTABLE_DetailViewAgent.
 *
 * Uso: node archibald-web-app/backend/scripts/diag-order-header-fields.mjs ORDER_ID
 * Esempio: node archibald-web-app/backend/scripts/diag-order-header-fields.mjs 51980
 *
 * Stampa: per ogni campo target, l'ID DOM esatto e il testo corrente.
 */

import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const ORDER_ID = process.argv[2] ?? '';

const log = (tag, msg) => console.log(`[${new Date().toISOString().slice(11, 23)}][${tag}] ${msg}`);

const PROD_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security',
  '--ignore-certificate-errors', '--disable-dev-shm-usage', '--disable-gpu',
];

const TARGET_FIELDS = [
  'SALESID', 'PURCHORDERFORMNUM', 'CUSTOMERREF', 'DELIVERYDATE',
  'DELIVERYNAME', 'DLVADDRESS', 'SALESSTATUS', 'DOCUMENTSTATUS', 'TRANSFERSTATUS',
];

async function waitNoLoading(page, timeout = 10_000) {
  await page.waitForFunction(
    () => {
      const panels = Array.from(document.querySelectorAll('[id*="LPV"],.dxlp,[id*="Loading"]'));
      return !panels.some((el) => {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
      });
    },
    { timeout, polling: 200 },
  ).catch(() => {});
}

async function main() {
  if (!ORDER_ID) {
    log('ERR', 'Uso: node diag-order-header-fields.mjs ORDER_ID');
    process.exit(1);
  }

  log('INIT', `Scansione DetailView ordine ${ORDER_ID}`);
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 100,
    args: PROD_ARGS,
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8' });
  await page.setViewport({ width: 1280, height: 900 });

  // Login
  log('AUTH', 'Login...');
  await page.goto(`${ARCHIBALD_URL}/Login.aspx`, { waitUntil: 'domcontentloaded' });
  const userField = await page.$('[id*="UserName"], input[name*="user"], input[type="text"]');
  const passField = await page.$('[id*="Password"], input[name*="pass"], input[type="password"]');
  if (!userField || !passField) throw new Error('Form di login non trovato');
  await userField.type(USERNAME);
  await passField.type(PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15_000 });
  log('AUTH', 'Login OK');

  // Naviga alla DetailView
  const cleanId = ORDER_ID.replace(/\./g, '');
  const url = `${ARCHIBALD_URL}/SALESTABLE_DetailViewAgent/${cleanId}/?mode=View`;
  log('NAV', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitNoLoading(page);
  log('DOM', 'Pagina caricata');

  // Scansione campi
  log('SCAN', `--- Ricerca di ${TARGET_FIELDS.length} campi ---`);
  const results = await page.evaluate((fields) => {
    return fields.map((field) => {
      const all = Array.from(document.querySelectorAll(`[id*="${field}"]`));
      return {
        field,
        count: all.length,
        elements: all.slice(0, 5).map((el) => ({
          id: el.id,
          tag: el.tagName,
          text: (el.textContent || '').trim().slice(0, 100),
          isVisible: el.getBoundingClientRect().width > 0,
        })),
      };
    });
  }, TARGET_FIELDS);

  for (const r of results) {
    if (r.count === 0) {
      log('MISS', `${r.field}: NON TROVATO — cercherà varianti`);
    } else {
      log('FOUND', `${r.field}: ${r.count} elemento/i`);
      for (const el of r.elements) {
        log(`  `, `id="${el.id}" tag=${el.tag} visibile=${el.isVisible} text="${el.text}"`);
      }
    }
  }

  // Dump completo di tutti gli id xaf_dvi (per debug)
  const xafIds = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[id*="xaf_dvi"]'))
      .map((el) => ({ id: el.id, text: (el.textContent || '').trim().slice(0, 60) }));
  });

  log('XAF', `--- Tutti gli elementi xaf_dvi (${xafIds.length}) ---`);
  for (const x of xafIds) {
    log('  ', `id="${x.id}" text="${x.text}"`);
  }

  await browser.close();
  log('DONE', 'Scansione completata. Usa gli id trovati per implementare readOrderHeader.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Esegui il diagnostico con un ordine reale**

Scegli un ordine recente dal DB di produzione (o staging). Esempio:
```bash
node archibald-web-app/backend/scripts/diag-order-header-fields.mjs 51980
```

- [ ] **Step 3: Annota i risultati**

Dai log, identifica per ogni campo:
- L'ID DOM esatto (es. `xaf_dviSALESID_View` o `ASPxFormLayout_dviSALESID`)
- Se il campo è visibile e il testo corrisponde ai dati attesi

Questi ID saranno usati nel Task 7 per implementare `readOrderHeader`.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/scripts/diag-order-header-fields.mjs
git commit -m "chore(diag): aggiungi script diagnostico per selettori XAF DetailView ordine"
```

---

## Task 7: Implementa `readOrderHeader` in `archibald-bot.ts`

**Spec:** §3b — naviga alla DetailView ordine in view mode, legge i campi con i selettori identificati nel Task 6.

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`

**Pre-condizione:** Task 6 completato — hai i selettori XAF esatti.

- [ ] **Step 1: Aggiungi `readOrderHeader` alla classe `ArchibaldBot`**

Cerca la sezione del bot con i metodi pubblici (vicino a `createOrder`, `deleteOrderFromArchibald`). Aggiungi il metodo. Sostituisci i placeholder `SELECTOR_FOR_*` con gli ID reali trovati nel diagnostico:

```ts
async readOrderHeader(orderId: string): Promise<OrderHeaderData | null> {
  if (!this.page) {
    logger.warn('[ArchibaldBot] readOrderHeader: page non inizializzata', { orderId });
    return null;
  }

  const cleanOrderId = orderId.replace(/\./g, '');
  const orderUrl = `${config.archibald.url}/SALESTABLE_DetailViewAgent/${cleanOrderId}/?mode=View`;

  logger.info('[ArchibaldBot] readOrderHeader: navigazione', { orderId, cleanOrderId });

  try {
    await this.page.goto(orderUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    await this.waitForDevExpressReady({ timeout: 10_000 });

    // Selettori identificati con diag-order-header-fields.mjs (Task 6)
    // Pattern: [id*="FIELDNAME"] corrisponde a xaf_dvi{FIELDNAME}_View o simili
    const header = await this.page.evaluate(() => {
      function getText(pattern: string): string | null {
        const el = document.querySelector(`[id*="${pattern}"]`);
        const text = el?.textContent?.trim() ?? null;
        return text && text.length > 0 ? text : null;
      }

      return {
        orderNumber: getText('SALESID'),
        orderDescription: getText('PURCHORDERFORMNUM'),
        customerReference: getText('CUSTOMERREF'),
        deliveryDate: getText('DELIVERYDATE'),
        deliveryName: getText('DELIVERYNAME'),
        deliveryAddress: getText('DLVADDRESS'),
        salesStatus: getText('SALESSTATUS'),
        documentStatus: getText('DOCUMENTSTATUS'),
        transferStatus: getText('TRANSFERSTATUS'),
      };
    });

    logger.info('[ArchibaldBot] readOrderHeader: header letto', { orderId, header });
    return header;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('[ArchibaldBot] readOrderHeader: fallito', { orderId, error: message });
    return null;
  }
}
```

**IMPORTANTE:** Se il diagnostico ha trovato selettori diversi da `[id*="FIELDNAME"]` (es. il campo SALESID ha ID `xaf_dviSALESID_View_S_D`), aggiusta il selettore nell'evaluate corrispondente. Ad esempio:
```ts
// Se SALESID ha ID esatto 'xaf_dviSALESID_View':
orderNumber: document.getElementById('xaf_dviSALESID_View')?.textContent?.trim() ?? null,
```

- [ ] **Step 2: Importa `OrderHeaderData` in `archibald-bot.ts`**

Verifica che il tipo `OrderHeaderData` sia importato o ridefinito localmente. Se è esportato da `submit-order.ts`:

```ts
import type { OrderHeaderData } from '../operations/handlers/submit-order';
```

O ridefiniscilo localmente nel bot (copia identica) per evitare dipendenze circolari.

- [ ] **Step 3: Build backend**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Expected: 0 errori. Se il tipo `OrderHeaderData` causa problemi di import circolare, ridefiniscilo localmente nel bot (è solo 9 campi `string | null`).

- [ ] **Step 4: Test E2E locale — verifica che il bot legga i campi correttamente**

Prima del deploy, eseguire un test E2E locale seguendo la procedura in `memory/feedback_e2e_before_deploy.md`:
1. Inviare un ordine pending reale dalla PWA
2. Verificare nei log che `readOrderHeader` venga chiamato e restituisca dati non-null
3. Verificare in produzione (o staging) che `order_records` venga aggiornato con SALESID reale, delivery_date, etc.

```bash
# Log del backend durante il test E2E:
# Cerca: "[ArchibaldBot] readOrderHeader: header letto"
# e: "[SubmitOrder] readOrderHeader failed" (non deve apparire)
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): implementa readOrderHeader per fetch immediato header ERP dopo piazzamento ordine"
```

---

## Self-Review

### Copertura spec

| Spec §  | Task |
|---------|------|
| §1 — progress bar card | Task 1 ✓ |
| §2a — isGhostArticle | Task 2 ✓ |
| §2b — savePendingOrder non-blocking | Task 2 ✓ |
| §2c — bot-queue concurrency 1 | Task 3 ✓ |
| §2d — cooldown 5s | Task 4 ✓ |
| §3 — OrderHeaderData type | Task 5 ✓ |
| §3 — SubmitOrderBot.readOrderHeader interface | Task 5 ✓ |
| §3 — chiamata handler + UPDATE DB | Task 5 ✓ |
| §3 — diagnostico selettori XAF | Task 6 ✓ |
| §3 — implementazione bot | Task 7 ✓ |

### Placeholder scan

- Task 7 usa `getText('SALESID')` con il pattern generico `[id*="FIELDNAME"]` — questa è la scelta corretta come punto di partenza; il Task 6 guida il raffinamento con i selettori esatti. Non è un placeholder.
- Tutti i test hanno codice concreto.
- Tutti i commit hanno messaggi specifici.

### Type consistency

- `OrderHeaderData`: definito in Task 5 (`submit-order.ts`), usato in Task 5 (handler) e Task 7 (bot). Import da `submit-order.ts` oppure ridefinito nel bot — coerente.
- `SubmitOrderBot.readOrderHeader`: definito in Task 5, i mock negli spec aggiornati in Task 5.
- `QueueName` include `'bot-queue'`: Task 3 definisce il tipo, Task 3 aggiorna routing. `config.ts` usa il letterale stringa — coerente.

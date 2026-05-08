# Fase 3 — BullMQ Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminare completamente BullMQ dal backend Archibald migrando le ultime 2 operazioni rimanenti (`sync-order-states`, `sync-tracking`) al Conductor, rimuovendo le 5 operazioni catalog/AI incomplete, e dismettendo tutta l'infrastruttura BullMQ (worker, queue facade, dipendenza npm).

**Architecture:** Le operazioni `sync-order-states` e `sync-tracking` sono già presenti in `conductor/types.ts` come `TaskType` con priority=500 — mancano solo il routing in `queue-router.ts` e i TaskHandler in `main.ts`. Le 5 operazioni catalog/AI (`catalog-ingestion`, `catalog-product-enrichment`, `web-product-enrichment`, `recognition-feedback`, `re-extract-pictograms`) vengono eliminate: i loro handler sono incompleti e verranno riscritti da zero quando la feature sarà pronta. Dopo la migrazione, nulla usa più BullMQ e l'intera infrastruttura (4 Worker, allQueues, createOperationProcessor, Redis dedicato per i worker) può essere rimossa.

**Tech Stack:** TypeScript strict, Node 20, Express, PostgreSQL, Conductor (DB-backed queue), ioredis (resta per JWT revocation), Vitest.

**Prerequisiti da leggere prima di ogni task:**
- `archibald-web-app/backend/src/operations/queue-router.ts` — routing attuale
- `archibald-web-app/backend/src/conductor/types.ts` — TaskType già definiti
- `archibald-web-app/backend/src/main.ts` linee 165-180 (allQueues + queue) e 1174-1291 (handlers BullMQ) e 1905-1981 (createOperationProcessor + workers)
- `archibald-web-app/backend/src/operations/operation-types.ts` — tipi da rimuovere

---

## File Map

| File | Azione | Task |
|------|--------|------|
| `src/operations/queue-router.ts` | MODIFY — aggiungi a CONDUCTOR_OPERATIONS, rimuovi da QUEUE_ROUTING | 1+2 |
| `src/main.ts` | MODIFY — aggiungi 2 TaskHandler, rimuovi handlers BullMQ, rimuovi workers/processor | 1+2+3 |
| `src/operations/operation-types.ts` | MODIFY — rimuovi 5 tipi catalog/AI | 2 |
| `src/operations/handlers/index.ts` | MODIFY — rimuovi 5 export catalog/AI + sync-order-states/tracking factories | 2+3 |
| `src/operations/handlers/catalog-ingestion.ts` | DELETE | 2 |
| `src/operations/handlers/catalog-product-enrichment.ts` | DELETE | 2 |
| `src/operations/handlers/web-product-enrichment.ts` | DELETE | 2 |
| `src/operations/handlers/recognition-feedback.ts` | DELETE | 2 |
| `src/operations/handlers/re-extract-pictograms.ts` | DELETE | 2 |
| `src/operations/operation-processor.ts` | MODIFY — solo type stub | 3 |
| `src/operations/operation-queue.ts` | MODIFY — rimuovi BullMQ, crea Conductor-only facade | 4 |
| `package.json` | MODIFY — rimuovi bullmq | 5 |

---

## Task 1 — Migra `sync-order-states` e `sync-tracking` al Conductor

**Files:**
- Modify: `archibald-web-app/backend/src/operations/queue-router.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

**Contesto:** `sync-order-states` e `sync-tracking` sono già in `conductor/types.ts` con priority=500. Mancano solo: (a) spostarli da `QUEUE_ROUTING` a `CONDUCTOR_OPERATIONS` in `queue-router.ts`, (b) aggiungere i loro TaskHandler in `main.ts` con lo stesso pattern degli altri sync P=500 (es. `syncOrdersTaskHandler`).

- [ ] **Step 1: Aggiorna `queue-router.ts`**

In `archibald-web-app/backend/src/operations/queue-router.ts`, modifica:

```typescript
// QUEUE_ROUTING: rimuovi sync-order-states e sync-tracking
const QUEUE_ROUTING: Partial<Record<OperationType, QueueName>> = {
  'catalog-ingestion':          'enrichment',
  'catalog-product-enrichment': 'enrichment',
  'web-product-enrichment':     'enrichment',
  'recognition-feedback':       'enrichment',
  're-extract-pictograms':      'enrichment',
};

// CONDUCTOR_OPERATIONS: aggiungi sync-order-states e sync-tracking
const CONDUCTOR_OPERATIONS: readonly OperationType[] = [
  'submit-order',
  'send-to-verona',
  'batch-send-to-verona',
  'edit-order',
  'delete-order',
  'batch-delete-orders',
  'create-customer',
  'update-customer',
  'read-vat-status',
  'refresh-customer',
  'download-ddt-pdf',
  'download-invoice-pdf',
  'sync-order-articles',
  'sync-customer-addresses',
  'sync-orders',
  'sync-customers',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
  'sync-order-states',   // ← AGGIUNTO
  'sync-tracking',       // ← AGGIUNTO
] as const;
```

- [ ] **Step 2: Aggiungi `syncOrderStatesTaskHandler` in `main.ts`**

Cerca la zona dei sync TaskHandler (~riga 1500 in poi, es. dopo `syncProductsTaskHandler`). Aggiungi:

```typescript
const syncOrderStatesTaskHandler: TaskHandler = async (task, ctx) => {
  const taskIdStr = task.taskId.toString();
  const onProgress = (progress: number, label?: string) => {
    broadcastEvent(ctx.userId, {
      event: 'JOB_PROGRESS',
      progress,
      label,
      taskId: taskIdStr,
      jobId: taskIdStr,
    });
  };
  const handler = createSyncOrderStatesHandler(pool);
  return handler(null, task.payload as Record<string, unknown>, ctx.userId, onProgress);
};
```

- [ ] **Step 3: Aggiungi `syncTrackingTaskHandler` in `main.ts`**

Subito dopo il precedente:

```typescript
const syncTrackingTaskHandler: TaskHandler = async (task, ctx) => {
  const taskIdStr = task.taskId.toString();
  const onProgress = (progress: number, label?: string) => {
    broadcastEvent(ctx.userId, {
      event: 'JOB_PROGRESS',
      progress,
      label,
      taskId: taskIdStr,
      jobId: taskIdStr,
    });
  };
  const handler = createSyncTrackingHandler(
    pool,
    async (type, orderNumber) => {
      // Usa la stessa onTrackingEvent closure già definita nel vecchio handlers BullMQ
      // (la closure con createNotification per fedex_delivered/exception ecc.)
      // Cerca in main.ts la definizione di createSyncTrackingHandler(pool, ...) esistente
      // e copia l'intera callback onTrackingEvent da lì.
      const { rows } = await pool.query<{ user_id: string; customer_name: string }>(
        `SELECT user_id, customer_name FROM agents.order_records WHERE order_number = $1 LIMIT 1`,
        [orderNumber],
      );
      if (rows.length === 0) return;
      const { user_id: agentId, customer_name: customerName } = rows[0];
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
        const orderData = await pool.query(
          `SELECT d.tracking_events FROM agents.order_ddts d
           JOIN agents.order_records r ON r.id = d.order_id AND r.user_id = d.user_id
           WHERE r.user_id = $1 AND r.order_number = $2 LIMIT 1`,
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
    },
  );
  return handler(null, task.payload as Record<string, unknown>, ctx.userId, onProgress);
};
```

**Nota:** La callback `onTrackingEvent` sopra è la stessa già presente nella `handlers` BullMQ object (righe ~1174-1239 di main.ts). Leggi quella sezione e assicurati di copiare la logica esatta senza modificarla.

- [ ] **Step 4: Registra i 2 nuovi handler nell'oggetto `handlers` Conductor**

Cerca l'oggetto `handlers` passato al Conductor (dove ci sono `syncCustomersTaskHandler`, `syncOrdersTaskHandler` ecc.) e aggiungi:

```typescript
'sync-order-states': syncOrderStatesTaskHandler,
'sync-tracking': syncTrackingTaskHandler,
```

- [ ] **Step 5: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`

- [ ] **Step 6: Verifica che il routing funzioni**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/ 2>&1 | grep -E "Tests |FAIL" | tail -3
```

Expected: test passano.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/operations/queue-router.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(conductor): migra sync-order-states e sync-tracking da BullMQ al Conductor P=500"
```

---

## Task 2 — Rimuovi le 5 operazioni catalog/AI

**Files:**
- Modify: `archibald-web-app/backend/src/operations/operation-types.ts`
- Modify: `archibald-web-app/backend/src/operations/queue-router.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/index.ts`
- Modify: `archibald-web-app/backend/src/main.ts`
- Delete: 5 handler files

**Contesto:** Le operazioni `catalog-ingestion`, `catalog-product-enrichment`, `web-product-enrichment`, `recognition-feedback`, `re-extract-pictograms` sono incomplete e non usate in produzione. Vengono rimosse insieme ai loro handler. Le callback post-sync-products che le accodavano (righe 1170-1171 e 1778-1779 di main.ts) vengono anche rimosse.

- [ ] **Step 1: Rimuovi dai tipi in `operation-types.ts`**

In `archibald-web-app/backend/src/operations/operation-types.ts`, rimuovi dalla lista `OPERATION_TYPES`:

```typescript
// Rimuovi queste 5 righe:
  'catalog-ingestion',
  'catalog-product-enrichment',
  'web-product-enrichment',
  'recognition-feedback',
  're-extract-pictograms',
```

Rimuovi da `OPERATION_PRIORITIES`:
```typescript
// Rimuovi queste 4 righe:
  'catalog-ingestion':          5,
  'catalog-product-enrichment': 3,
  'web-product-enrichment':     2,
  'recognition-feedback':       5,
  're-extract-pictograms':      4,
```

(SCHEDULED_SYNCS non contiene queste operazioni — nessuna modifica lì.)

- [ ] **Step 2: Rimuovi da `QUEUE_ROUTING` in `queue-router.ts`**

In `archibald-web-app/backend/src/operations/queue-router.ts`, la `QUEUE_ROUTING` diventa completamente vuota:

```typescript
const QUEUE_ROUTING: Partial<Record<OperationType, QueueName>> = {};
```

- [ ] **Step 3: Rimuovi i 5 export da `handlers/index.ts`**

In `archibald-web-app/backend/src/operations/handlers/index.ts`, rimuovi queste righe:

```typescript
// RIMUOVI:
export { createRecognitionFeedbackHandler } from './recognition-feedback';
export { createCatalogIngestionHandler } from './catalog-ingestion';
export { createCatalogProductEnrichmentHandler } from './catalog-product-enrichment';
export { createWebProductEnrichmentHandler } from './web-product-enrichment';
export { createReExtractPictogramsHandler } from './re-extract-pictograms';
```

- [ ] **Step 4: Rimuovi dalla `handlers` BullMQ object in `main.ts` + rimuovi imports + rimuovi callbacks**

In `main.ts`:

**A) Rimuovi dalla `handlers` object (~righe 1241-1300):**
```typescript
// RIMUOVI questi 5 handler + la condizione anthropic:
'recognition-feedback': createRecognitionFeedbackHandler({ pool }),
...(config.recognition.anthropicApiKey && anthropicCatalogClient ? {
  'catalog-ingestion': createCatalogIngestionHandler({ ... }),
  'catalog-product-enrichment': createCatalogProductEnrichmentHandler({ pool }),
  'web-product-enrichment': createWebProductEnrichmentHandler({ ... }),
  're-extract-pictograms': createReExtractPictogramsHandler({ ... }),
} : {}),
```

**B) Rimuovi le callback post-sync-products (~righe 1169-1172):**
```typescript
// Nella callback di sync-products, rimuovi:
async (productId: string) => {
  await allQueues['enrichment'].enqueue('catalog-product-enrichment', 'service', { productId });
  await allQueues['enrichment'].enqueue('web-product-enrichment', 'service', { productId }, undefined, 30_000);
},
```
(La callback diventa `undefined` o viene rimossa del tutto dal parametro di `createSyncProductsHandler`)

**C) Stessa callback nella seconda occorrenza (~righe 1777-1780):**
Cerca l'altra chiamata `allQueues['enrichment'].enqueue('catalog-product-enrichment'...)` e rimuovila.

**D) `catalogPdf` e `anthropicCatalogClient` — NON rimuovere:**

Queste variabili restano perché sono ancora usate da `recognitionDeps` (recognition route). Dopo aver rimosso i catalog handler registrations in Step 4A, `catalogPdf` e `anthropicCatalogClient` vengono usate SOLO da `recognitionDeps`. TypeScript non segnalerà errori. Nessuna modifica necessaria.

**E) Rimuovi gli import in cima a main.ts:**
```typescript
// RIMUOVI (se presenti):
import { createCatalogIngestionHandler } from './operations/handlers';
import { createCatalogProductEnrichmentHandler } from './operations/handlers';
import { createWebProductEnrichmentHandler } from './operations/handlers';
import { createReExtractPictogramsHandler } from './operations/handlers';
import { createRecognitionFeedbackHandler } from './operations/handlers';
import { createCatalogPdfService } from './services/catalog-pdf-service';
```

**Nota:** Questi import arrivano dal barrel `./operations/handlers`. Controlla quali sono importati direttamente nella parte imports di main.ts (~righe 28-107).

- [ ] **Step 5: Elimina i 5 file handler**

```bash
cd archibald-web-app/backend
rm src/operations/handlers/catalog-ingestion.ts
rm src/operations/handlers/catalog-ingestion.spec.ts 2>/dev/null || true
rm src/operations/handlers/catalog-product-enrichment.ts
rm src/operations/handlers/web-product-enrichment.ts
rm src/operations/handlers/recognition-feedback.ts
rm src/operations/handlers/re-extract-pictograms.ts
```

- [ ] **Step 6: Controlla se `createSyncProductsHandler` accetta la callback opzionale**

Apri `archibald-web-app/backend/src/operations/handlers/sync-products.ts` e verifica la firma di `createSyncProductsHandler`. Se il terzo argomento (callback post-sync) è già opzionale, rimuoverlo da main.ts è sufficiente. Se non è opzionale, rendilo opzionale:

```typescript
// In sync-products.ts, cambia la firma se necessario:
function createSyncProductsHandler(
  // ...
  onEnrichProduct?: (productId: string) => Promise<void>,  // aggiunge il ?
): OperationHandler
```

- [ ] **Step 7: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`. Se ci sono errori, correggi le importazioni mancanti o i parametri rimasti.

- [ ] **Step 8: Test suite**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: nessuna regressione.

- [ ] **Step 9: Commit**

```bash
git add -A archibald-web-app/backend/src/
git commit -m "feat(bullmq): rimuovi operazioni catalog/AI incomplete — catalog-ingestion, enrichment, recognition-feedback, re-extract-pictograms"
```

---

## Task 3 — Rimuovi BullMQ workers e `createOperationProcessor` da `main.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/main.ts`
- Modify: `archibald-web-app/backend/src/operations/operation-processor.ts` (ridotto a type stub)

**Contesto:** Dopo Task 1+2, nessuna operazione usa più BullMQ. I 4 worker (`writes`, `agent-sync`, `enrichment`, `shared-sync`) sono tutti idle. `createOperationProcessor` era il dispatcher per i job BullMQ — non serve più. Lo riduciamo a un type stub perché molti handler files importano `OperationHandler` da lì.

- [ ] **Step 1: Riduci `operation-processor.ts` a type stub**

Sostituisci l'intero contenuto di `archibald-web-app/backend/src/operations/operation-processor.ts` con:

```typescript
/**
 * Type stub — createOperationProcessor rimosso in Fase 3 (eliminazione BullMQ).
 * OperationHandler è mantenuto per compatibilità con i file handler esistenti.
 * Sarà rimosso in un cleanup separato quando i createSyncXxxHandler saranno eliminati dai handler files.
 */
type OperationHandler = (
  context: unknown,
  data: Record<string, unknown>,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
) => Promise<Record<string, unknown>>;

export type { OperationHandler };
```

- [ ] **Step 2: Rimuovi l'import di `createOperationProcessor` da `main.ts`**

In `main.ts`, rimuovi dalla riga con l'import (cerca `createOperationProcessor`):

```typescript
// RIMUOVI questa riga (o rimuovi createOperationProcessor dall'import):
import { createOperationProcessor } from './operations/operation-processor';
```

Se `OperationHandler` è ancora importato da `operation-processor` in `main.ts`, mantieni solo il type import:

```typescript
import type { OperationHandler } from './operations/operation-processor';
```

- [ ] **Step 3: Rimuovi `createOperationProcessor` da `main.ts`**

Elimina il blocco `const processor = createOperationProcessor({ ... })` (~righe 1905-1948).

**Attenzione:** Prima di eliminare, controlla se `onJobStarted`, `onJobCompleted`, `onJobFailed` vengono usati altrove. Se no, elimina tutto il blocco.

- [ ] **Step 4: Rimuovi `createWorkerForQueue` e i 4 worker instances da `main.ts`**

Elimina:
```typescript
// RIMUOVI:
function createWorkerForQueue(queueName: QueueName) { ... }

const workers = Object.fromEntries(
  QUEUE_NAMES.map(name => [name, createWorkerForQueue(name)]),
) as Record<QueueName, { worker: Worker; connection: Redis }>;
```

- [ ] **Step 5: Aggiorna `shutdown` in `main.ts` per rimuovere workers**

Cerca il blocco `shutdown`:
```typescript
// RIMUOVI queste righe dal shutdown:
await Promise.all(
  Object.values(workers).map(({ worker: w }) => w.close()),
);
await queue.close();
// Chiudi anche le Redis connections dei worker (se presenti nel shutdown)
```

**Mantieni** `await queue.close()` per ora — verrà gestito in Task 4.

- [ ] **Step 6: Rimuovi import `Worker` e `Redis` BullMQ da `main.ts`**

```typescript
// RIMUOVI questi import:
import { Worker } from 'bullmq';
// (mantieni import { Redis } from 'ioredis' solo se usato per sharedRedisClient, altrimenti rimuovi)
```

Controlla se `Redis` da `ioredis` è usato per altro in main.ts. `sharedRedisClient = createRedisClient()` usa una funzione wrapper — potrebbe non usare `Redis` direttamente. Se `Redis` non è usato dopo la rimozione dei worker, rimuovi anche quell'import.

Rimuovi anche `redisConfig` se non usato dopo la rimozione di `allQueues`:
```typescript
// RIMUOVI se non più usato:
const redisConfig = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
};
```

- [ ] **Step 7: Rimuovi `allQueues` da `main.ts`**

```typescript
// RIMUOVI:
const allQueues = Object.fromEntries(
  QUEUE_NAMES.map(name => [
    name,
    createOperationQueue(name, redisConfig, config.queues[name].removeOnComplete),
  ]),
) as Record<QueueName, ReturnType<typeof createOperationQueue>>;
```

**Nota:** Dopo aver rimosso le callback post-sync in Task 2 (righe 1170-1171 e 1778-1779), `allQueues` non è più referenziato.

- [ ] **Step 8: Rimuovi import `createOperationQueue`, `createMultiQueueFacade` da `main.ts`**

```typescript
// RIMUOVI dall'import di operation-queue:
import { createOperationQueue, createMultiQueueFacade, setConductorForRouting } from './operations/operation-queue';
```

**Nota:** `setConductorForRouting` viene ancora chiamato in main.ts per configurare il routing verso il Conductor. Verificare se è ancora necessario dopo la semplificazione di `operation-queue.ts` in Task 4. Per ora mantieni se necessario.

- [ ] **Step 9: Rimuovi import `QUEUE_NAMES`, `QueueName` da `main.ts`**

```typescript
// RIMUOVI se non più usati:
import { QUEUE_NAMES } from './operations/queue-router';
import type { QueueName } from './operations/queue-router';
```

- [ ] **Step 10: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`. Correggi eventuali errori prima di procedere.

- [ ] **Step 11: Test suite**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: nessuna regressione.

- [ ] **Step 12: Commit**

```bash
git add archibald-web-app/backend/src/main.ts \
        archibald-web-app/backend/src/operations/operation-processor.ts
git commit -m "feat(bullmq): rimuovi workers, createOperationProcessor e allQueues da main.ts"
```

---

## Task 4 — Semplifica `operation-queue.ts` e rimuovi il package `bullmq`

**Files:**
- Rewrite: `archibald-web-app/backend/src/operations/operation-queue.ts`
- Modify: `archibald-web-app/backend/src/operations/queue-router.ts`
- Modify: `archibald-web-app/backend/package.json`

**Contesto:** Dopo Task 3, `operation-queue.ts` contiene BullMQ Queue instances che non vengono più usate. Il file può essere semplificato: `queue` diventa una facade puramente Conductor, senza BullMQ. `QUEUE_NAMES`, `QueueName` e `QUEUE_ROUTING` diventano inutili.

- [ ] **Step 1: Verifica che `queue` sia ancora usato nelle routes**

```bash
grep -rn "queue\.\|queue," archibald-web-app/backend/src/routes/ | grep -v "agent-queue" | head -10
```

I route files usano `queue.enqueue()` e a volte `queue.getJobStatus()`. Identifica tutti i call site.

- [ ] **Step 2: Sostituisci `operation-queue.ts` con implementazione Conductor-only**

Leggi il file attuale, poi sostituiscilo con:

```typescript
import type { OperationType } from './operation-types';
import type { Conductor } from '../conductor/dispatcher';

// Stato interno: il Conductor viene registrato dopo l'init in main.ts
let conductorRef: Conductor | null = null;

function setConductorForRouting(c: Conductor | null): void {
  conductorRef = c;
}

// JobStatus — usato da GET /api/operations/:jobId/status
// Dopo l'eliminazione BullMQ restituisce sempre null (404 in route).
// Il frontend gestisce silenziosamente il 404.
type JobStatus = {
  jobId: string;
  type: string;
  userId: string;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  progressLabel?: string;
  result: Record<string, unknown> | null;
  failedReason: string | undefined;
};

type AgentJob = {
  jobId: string;
  type: string;
  state: string;
  progress: number;
};

type QueueStats = {
  waiting: number; active: number; completed: number;
  failed: number; delayed: number; prioritized: number;
};

type OperationQueueFacade = {
  enqueue: (type: OperationType, userId: string, data: Record<string, unknown>, idempotencyKey?: string, delayMs?: number) => Promise<string>;
  getJobStatus: (jobId: string) => Promise<JobStatus | null>;
  getAgentJobs: (userId: string) => Promise<AgentJob[]>;
  getStats: () => Promise<QueueStats>;
  close: () => Promise<void>;
};

function createQueue(): OperationQueueFacade {
  return {
    async enqueue(type, userId, data): Promise<string> {
      if (!conductorRef) {
        throw new Error(`Conductor not initialized — cannot enqueue '${type}'. Call setConductorForRouting() first.`);
      }
      const taskId = await conductorRef.enqueueTaskExternal({
        userId,
        taskType: type,
        payload: data,
      });
      return taskId.toString();
    },

    // Restituisce null: dopo la rimozione BullMQ non c'è più un job status
    // sincrono per-job. Il frontend gestisce il 404 silenziosamente.
    async getJobStatus(_jobId): Promise<JobStatus | null> {
      return null;
    },

    async getAgentJobs(_userId): Promise<AgentJob[]> {
      return [];
    },

    async getStats(): Promise<QueueStats> {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, prioritized: 0 };
    },

    async close(): Promise<void> {
      // Nessuna connessione BullMQ da chiudere
    },
  };
}

export { createQueue, setConductorForRouting };
export type { JobStatus, AgentJob, QueueStats, OperationQueueFacade };
```

- [ ] **Step 3: Aggiorna `main.ts` per usare `createQueue()`**

Nella sezione dove veniva creato `queue` (~riga 180), cambia:

```typescript
// PRIMA:
const queue = createMultiQueueFacade(allQueues);

// DOPO:
const queue = createQueue();
```

E aggiorna l'import:

```typescript
// PRIMA:
import { createOperationQueue, createMultiQueueFacade, setConductorForRouting } from './operations/operation-queue';

// DOPO:
import { createQueue, setConductorForRouting } from './operations/operation-queue';
```

Verifica che `queue.close()` nel shutdown funzioni (il nuovo `close()` è un no-op).

- [ ] **Step 4: Rimuovi `QUEUE_ROUTING`, `QUEUE_NAMES`, `QueueName` da `queue-router.ts`**

Ora che `QUEUE_ROUTING` è vuoto e non ci sono più BullMQ queues, rimuovi da `queue-router.ts`:

```typescript
// RIMUOVI:
type QueueName = 'writes' | 'agent-sync' | 'enrichment' | 'shared-sync';
const QUEUE_NAMES: readonly QueueName[] = ['writes', 'agent-sync', 'enrichment', 'shared-sync'] as const;
const QUEUE_ROUTING: Partial<Record<OperationType, QueueName>> = {};
function getQueueForOperation(type: OperationType): QueueName | undefined {
  return QUEUE_ROUTING[type];
}

// AGGIORNA export rimuovendo:
// getQueueForOperation, QUEUE_ROUTING, QUEUE_NAMES, QueueName
```

- [ ] **Step 5: Rimuovi `bullmq` da `package.json`**

```bash
cd archibald-web-app/backend && npm uninstall bullmq 2>&1 | tail -5
```

Expected: bullmq rimosso da `package.json` e `package-lock.json`.

- [ ] **Step 6: Verifica che `ioredis` sia mantenuto**

```bash
grep "ioredis" archibald-web-app/backend/package.json
```

Expected: `ioredis` è ancora presente (serve per JWT revocation in `db/redis-client.ts`).

- [ ] **Step 7: Type-check finale**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`

- [ ] **Step 8: Test suite finale**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: nessuna regressione rispetto alla baseline pre-Fase 3.

- [ ] **Step 9: Verifica che il build non importi più bullmq**

```bash
grep -rn "from 'bullmq'\|require('bullmq')" archibald-web-app/backend/src/ | head -5
```

Expected: nessun risultato.

- [ ] **Step 10: Commit**

```bash
git add archibald-web-app/backend/src/operations/operation-queue.ts \
        archibald-web-app/backend/src/operations/queue-router.ts \
        archibald-web-app/backend/src/main.ts \
        archibald-web-app/backend/package.json \
        archibald-web-app/backend/package-lock.json
git commit -m "feat(bullmq): elimina dipendenza bullmq — queue semplificata Conductor-only, QUEUE_ROUTING rimosso"
```

---

## Task 5 — Verifica E2E e cleanup finale

**Files:**
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts` (se necessario)
- Verify: deploy VPS e test integrazione

- [ ] **Step 1: Verifica `sync-scheduler.ts` usa il Conductor per sync-order-states e sync-tracking**

Leggi `archibald-web-app/backend/src/sync/sync-scheduler.ts` righe 132-140. Verifica che `enqueueAgentSyncs` chiami `enqueue('sync-order-states', userId, {})` e `enqueue('sync-tracking', userId, {})` — questi ora arrivano al Conductor via `setConductorForRouting`.

Se lo scheduler usa `queue.enqueue()` (passata come callback `enqueue`), il routing avviene in `createQueue().enqueue()` che chiama `conductorRef.enqueueTaskExternal`. **Nessuna modifica necessaria allo scheduler.**

- [ ] **Step 2: Build completo**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: build success.

- [ ] **Step 3: Test suite completo**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: stesso numero di test passanti della baseline prima di Fase 3.

- [ ] **Step 4: Push e verifica CI/CD**

```bash
git push origin master 2>&1
gh run list --branch master --limit 2 2>&1
```

Expected: CI/CD ✅ (build + deploy).

- [ ] **Step 5: Verifica su VPS che sync-order-states e sync-tracking vengano prese dal Conductor**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml exec -T postgres psql -U archibald -d archibald -c \
  \"SELECT task_type, status, count(*) FROM system.agent_operation_queue WHERE task_type IN ('sync-order-states','sync-tracking') GROUP BY task_type, status;\""
```

Expected: righe con `status='completed'` per entrambi i tipi (dopo che lo scheduler ha triggerato almeno un ciclo, ~10 min).

- [ ] **Step 6: Verifica che il worker enrichment BullMQ sia scomparso dai log**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml logs --tail=20 backend 2>&1 | grep -i 'bullmq\|worker\|enrichment'" | head -10
```

Expected: nessuna riga BullMQ nei log.

---

## Checklist spec coverage

| Requisito | Task |
|-----------|------|
| sync-order-states → Conductor P=500 | Task 1 |
| sync-tracking → Conductor P=500 | Task 1 |
| catalog-ingestion rimosso | Task 2 |
| catalog-product-enrichment rimosso | Task 2 |
| web-product-enrichment rimosso | Task 2 |
| recognition-feedback rimosso | Task 2 |
| re-extract-pictograms rimosso | Task 2 |
| BullMQ Worker × 4 rimossi | Task 3 |
| createOperationProcessor rimosso | Task 3 |
| allQueues rimosso | Task 3 |
| operation-queue.ts Conductor-only | Task 4 |
| bullmq npm rimosso | Task 4 |
| ioredis mantenuto (JWT revocation) | Task 4 |
| sync-scheduler invariato | Task 5 |
| CI/CD verde | Task 5 |

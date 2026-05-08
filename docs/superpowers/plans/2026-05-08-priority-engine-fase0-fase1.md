# Priority Engine — Fase 0 + Fase 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantire che le operazioni utente (submit-order, edit-order) abbiano sempre priority reale P=10 nel DB e possano preemptare i task BG P=500 in esecuzione entro 15s.

**Architecture:** Fix a catena: (1) priority end-to-end negli enqueue, (2) PreemptedSignal class + scrapeListView sicuro, (3) forceReleaseByUserId nel BrowserPool, (4) makeCooperativeShouldStop implementata, (5) EP scoring nel pickup + signalPreemption + Worker re-enqueue con delayed NOTIFY. Migration #083 tra F0 e F1.

**Tech Stack:** TypeScript, PostgreSQL (`pg`), Puppeteer, Vitest, `npm test --prefix archibald-web-app/backend`

**Spec:** `docs/superpowers/specs/2026-05-08-priority-engine-adaptive-scheduler-design.md`

---

## File map

| File | Azione | Motivo |
|------|--------|--------|
| `src/db/repositories/agent-queue.ts` | Modify | enqueueTask priority, FOR UPDATE fix, EP in pickupNextTask |
| `src/conductor/dispatcher.ts` | Modify | enqueueTaskExternal passa priority, signalPreemption |
| `src/conductor/types.ts` | Modify | preemptRequested in TaskRow |
| `src/conductor/worker.ts` | Modify | catch PreemptedSignal, delayed NOTIFY, success:false guard, priority in acquireContext |
| `src/conductor/preempted-signal.ts` | Create | PreemptedSignal class + type guard |
| `src/bot/browser-pool.ts` | Modify | forceReleaseByUserId + export |
| `src/main.ts` | Modify | cable forceReleaseByUserId, makeBrowserPoolAdapter con priority |
| `src/sync/scraper/list-view-scraper.ts` | Modify | ritorna { rows, preempted } |
| `src/sync/scraper/html-sync-utils.ts` | Modify | makeCooperativeShouldStop reale |
| `src/operations/handlers/sync-orders.ts` | Modify | usa result.preempted |
| `src/operations/handlers/sync-customers.ts` | Modify | usa result.preempted |
| `src/operations/handlers/sync-ddt.ts` | Modify | usa result.preempted |
| `src/operations/handlers/sync-invoices.ts` | Modify | usa result.preempted |
| `src/operations/handlers/sync-prices.ts` | Modify | usa result.preempted |
| `src/operations/handlers/sync-customer-addresses.ts` | Modify | shouldStop in batch + reliable guard |
| `src/operations/handlers/sync-products.ts` | Modify | zero-result guard fuori dal catch |
| `src/db/migrations/083-priority-engine.sql` | Create | preempt_requested, indice, sync_freshness skeleton |
| `src/db/repositories/agent-queue.spec.ts` | Modify | test priority enqueue, EP pickup |
| `src/conductor/worker.spec.ts` | Modify | test PreemptedSignal handling |
| `src/sync/scraper/list-view-scraper.spec.ts` | Modify | test preempted flag |

---

## Task 1: Fix `enqueueTask` — priority + FOR UPDATE in scalar subquery

**Files:**
- Modify: `src/db/repositories/agent-queue.ts:60-96`
- Modify: `src/db/repositories/agent-queue.spec.ts`

- [ ] **Step 1: Scrivi il test failing per priority**

Nel file `src/db/repositories/agent-queue.spec.ts`, aggiungi in `describe('enqueueTask', ...)`:

```typescript
test('uses TASK_PRIORITY for the task type instead of DB default 500', async () => {
  const taskId = await enqueueTask(pool, {
    userId: TEST_USER_ID,
    taskType: 'submit-order',
    payload: {},
    priority: TASK_PRIORITY['submit-order'],
  });
  const { rows: [row] } = await pool.query(
    'SELECT priority FROM system.agent_operation_queue WHERE task_id = $1',
    [taskId.toString()],
  );
  expect(row.priority).toBe(10);
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/db/repositories/agent-queue.spec.ts
```

Atteso: FAIL — `expected 500, received 10` (o simile, perché il campo non viene ancora passato).

- [ ] **Step 3: Aggiorna `EnqueueParams` e `enqueueTask` in `agent-queue.ts`**

```typescript
// Riga 60 — aggiorna il tipo
export type EnqueueParams = {
  userId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  batchId?: string;
  priority?: number; // opzionale — se assente, usa TASK_PRIORITY[taskType] ?? 500
};

// Riga 67 — aggiorna la funzione
export async function enqueueTask(pool: DbPool, params: EnqueueParams): Promise<bigint> {
  const priority = params.priority ?? TASK_PRIORITY[params.taskType] ?? 500;

  return await pool.withTransaction(async (tx) => {
    // FIX: rimosso FOR UPDATE dentro scalar subquery (causa 0A000 come in enqueueWithDedup)
    const { rows: [maxRow] } = await tx.query<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_position
       FROM system.agent_operation_queue
       WHERE user_id = $1 AND status IN ('enqueued', 'running')`,
      [params.userId],
    );

    const { rows: [task] } = await tx.query<{ task_id: string }>(
      `INSERT INTO system.agent_operation_queue
       (user_id, task_type, payload, batch_id, position, status, priority)
       VALUES ($1, $2, $3, $4, $5, 'enqueued', $6)
       RETURNING task_id`,
      [
        params.userId,
        params.taskType,
        JSON.stringify(params.payload),
        params.batchId ?? null,
        maxRow.next_position,
        priority,
      ],
    );

    return BigInt(task.task_id);
  });
}
```

Aggiungi l'import di `TASK_PRIORITY` in cima al file:
```typescript
import { TASK_PRIORITY } from '../../conductor/types';
```

- [ ] **Step 4: Esegui il test per verificare che passi**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/db/repositories/agent-queue.spec.ts
```

Atteso: PASS per il nuovo test. Tutti gli altri test agent-queue devono continuare a passare.

- [ ] **Step 5: Build per verifica TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: nessun errore TypeScript.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/agent-queue.ts \
        archibald-web-app/backend/src/db/repositories/agent-queue.spec.ts
git commit -m "fix(queue): enqueueTask passa priority da TASK_PRIORITY + rimuove FOR UPDATE da scalar subquery"
```

---

## Task 2: Crea `PreemptedSignal` class

**Files:**
- Create: `src/conductor/preempted-signal.ts`
- Create: `src/conductor/preempted-signal.spec.ts`

- [ ] **Step 1: Scrivi il test**

Crea `src/conductor/preempted-signal.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { PreemptedSignal, isPreemptedSignal } from './preempted-signal';

describe('PreemptedSignal', () => {
  test('è istanza di Error', () => {
    expect(new PreemptedSignal()).toBeInstanceOf(Error);
  });

  test('isPreemptedSignal riconosce PreemptedSignal', () => {
    expect(isPreemptedSignal(new PreemptedSignal())).toBe(true);
  });

  test('isPreemptedSignal rigetta Error generico', () => {
    expect(isPreemptedSignal(new Error('generic'))).toBe(false);
  });

  test('isPreemptedSignal rigetta null e primitive', () => {
    expect(isPreemptedSignal(null)).toBe(false);
    expect(isPreemptedSignal('string')).toBe(false);
    expect(isPreemptedSignal(undefined)).toBe(false);
  });

  test('tag è preempted', () => {
    const s = new PreemptedSignal();
    expect(s.tag).toBe('preempted');
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/conductor/preempted-signal.spec.ts
```

Atteso: FAIL — modulo non trovato.

- [ ] **Step 3: Crea il file**

Crea `src/conductor/preempted-signal.ts`:

```typescript
export class PreemptedSignal extends Error {
  readonly tag = 'preempted' as const;

  constructor() {
    super('Task preempted by higher-priority operation');
    this.name = 'PreemptedSignal';
  }
}

export function isPreemptedSignal(err: unknown): err is PreemptedSignal {
  return (
    err instanceof PreemptedSignal &&
    (err as PreemptedSignal).tag === 'preempted'
  );
}
```

- [ ] **Step 4: Esegui il test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/conductor/preempted-signal.spec.ts
```

Atteso: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/conductor/preempted-signal.ts \
        archibald-web-app/backend/src/conductor/preempted-signal.spec.ts
git commit -m "feat(conductor): PreemptedSignal class per preemption cooperativa"
```

---

## Task 3: `scrapeListView` ritorna `{ rows, preempted }`

**Files:**
- Modify: `src/sync/scraper/list-view-scraper.ts`
- Modify: `src/sync/scraper/list-view-scraper.spec.ts`

- [ ] **Step 1: Scrivi il test failing**

Nel file `list-view-scraper.spec.ts`, aggiungi in `describe('scrapeListView', ...)`:

```typescript
test('ritorna preempted:true quando shouldStop scatta durante la paginazione', async () => {
  // shouldStop ritorna true alla seconda chiamata (dopo la prima pagina)
  let callCount = 0;
  const shouldStop = async () => { callCount++; return callCount >= 2; };

  const mockPage = createMockPageWithTwoPages(); // helper già nel file spec
  const result = await scrapeListView(mockPage, testConfig, () => {}, shouldStop);

  expect(result.preempted).toBe(true);
  expect(result.rows.length).toBeGreaterThan(0); // prima pagina già letta
});

test('ritorna preempted:false in esecuzione normale', async () => {
  const shouldStop = async () => false;
  const mockPage = createMockPageWithOnePage();
  const result = await scrapeListView(mockPage, testConfig, () => {}, shouldStop);

  expect(result.preempted).toBe(false);
  expect(result.rows.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/sync/scraper/list-view-scraper.spec.ts
```

Atteso: FAIL — `result.preempted` non esiste, o TypeScript error.

- [ ] **Step 3: Aggiorna `scrapeListView` per ritornare `{ rows, preempted }`**

Trova il tipo di ritorno attuale in `list-view-scraper.ts` (circa riga 50) e il loop di paginazione. Aggiungi `preempted` al tipo di ritorno e controlla `shouldStop` tra pagine:

```typescript
// Aggiorna il tipo di ritorno (vicino all'inizio del file)
export type ScrapeResult = {
  rows: ScrapedRow[];
  preempted: boolean;
};

// Nella funzione scrapeListView, aggiorna la signature:
export async function scrapeListView(
  page: Page,
  config: ScraperConfig,
  onProgress: (progress: ScrapeProgress) => void,
  shouldStop?: () => Promise<boolean> | boolean,
): Promise<ScrapeResult> {   // <-- era: Promise<ScrapedRow[]>

  // ... tutto il codice esistente fino al loop pagine ...

  let preempted = false;

  // Nel loop di paginazione, DOPO aver letto i dati di una pagina e PRIMA di andare alla successiva:
  if (shouldStop && await shouldStop()) {
    preempted = true;
    break; // ferma la paginazione pulitamente
  }

  // Alla fine, sostituisci: return allRows;
  // Con:
  return { rows: allRows, preempted };
}
```

**ATTENZIONE**: tutti i caller esistenti di `scrapeListView` che usano `.map()`, spread, o lunghezza diretta sul risultato devono essere aggiornati per usare `.rows` (vedi Task 4).

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/sync/scraper/list-view-scraper.spec.ts
```

Atteso: PASS per i nuovi test. Se alcuni test esistenti falliscono per il tipo di ritorno cambiato, aggiornali in questo step.

- [ ] **Step 5: Verifica TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

TypeScript mostrerà tutti i caller che devono essere aggiornati. **Non fare il commit finché il build non è pulito** — segui il Task 4 per tutti i caller.

---

## Task 4: Aggiorna gli HTML sync handler per usare `result.preempted`

**Files:**
- Modify: `src/operations/handlers/sync-orders.ts`
- Modify: `src/operations/handlers/sync-customers.ts`
- Modify: `src/operations/handlers/sync-ddt.ts`
- Modify: `src/operations/handlers/sync-invoices.ts`
- Modify: `src/operations/handlers/sync-prices.ts`

Questo task aggiorna tutti e 5 gli handler HTML. Il pattern è identico per tutti.

- [ ] **Step 1: Pattern da applicare a ogni handler**

In ogni handler `handleSyncXxxViaHtml`, dopo la chiamata a `scrapeListView`, cambia:

```typescript
// PRIMA (esempio sync-orders.ts riga ~83):
const rows = await scrapeListView(page, ordersConfig, progressCb, makeCooperativeShouldStop(pool, userId));
await checkScraperCompleteness(pool, 'agents.order_records', userId, rows.length, 'orders');

// DOPO:
const { rows, preempted } = await scrapeListView(page, ordersConfig, progressCb, makeCooperativeShouldStop(pool, userId));
if (preempted) {
  throw new PreemptedSignal();
}
await checkScraperCompleteness(pool, 'agents.order_records', userId, rows.length, 'orders');
```

Aggiungi l'import di `PreemptedSignal` in cima a ogni file:
```typescript
import { PreemptedSignal } from '../../conductor/preempted-signal';
```

- [ ] **Step 2: Applica il pattern a `sync-orders.ts`**

Modifica `handleSyncOrdersViaHtml` in `src/operations/handlers/sync-orders.ts`:
- Aggiungi import `PreemptedSignal`
- Destructure `{ rows, preempted }` dal risultato di `scrapeListView`
- Aggiungi `if (preempted) throw new PreemptedSignal();` prima di `checkScraperCompleteness`

- [ ] **Step 3: Applica il pattern a `sync-customers.ts`**

Stessa modifica in `handleSyncCustomersViaHtml`. La tabella da passare a `checkScraperCompleteness` è `'agents.customers'`.

- [ ] **Step 4: Applica il pattern a `sync-ddt.ts`**

Stessa modifica in `handleSyncDdtViaHtml`. Tabella: `'agents.order_ddts'`.

- [ ] **Step 5: Applica il pattern a `sync-invoices.ts`**

Stessa modifica in `handleSyncInvoicesViaHtml`. Tabella: `'agents.order_invoices'`.

- [ ] **Step 6: Applica il pattern a `sync-prices.ts`**

In `sync-prices.ts` il pattern è leggermente diverso (usa `domExtraction` invece di `filterToggleWorkaround`). Applica comunque il destructure e il check preempted prima di qualsiasi scrittura DB.

- [ ] **Step 7: Verifica build pulita**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: zero errori TypeScript.

- [ ] **Step 8: Esegui tutti i test degli handler**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/operations/handlers/
```

Atteso: tutti PASS.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/backend/src/sync/scraper/list-view-scraper.ts \
        archibald-web-app/backend/src/operations/handlers/sync-orders.ts \
        archibald-web-app/backend/src/operations/handlers/sync-customers.ts \
        archibald-web-app/backend/src/operations/handlers/sync-ddt.ts \
        archibald-web-app/backend/src/operations/handlers/sync-invoices.ts \
        archibald-web-app/backend/src/operations/handlers/sync-prices.ts
git commit -m "feat(scraper): scrapeListView ritorna {rows,preempted} — handler usano PreemptedSignal per preemption sicura"
```

---

## Task 5: Fix `sync-customer-addresses` — shouldStop in batch + reliable guard

**Files:**
- Modify: `src/operations/handlers/sync-customer-addresses.ts`
- Modify: `src/operations/handlers/sync-customer-addresses.spec.ts`

- [ ] **Step 1: Scrivi test failing per reliable guard**

In `sync-customer-addresses.spec.ts`, aggiungi:

```typescript
test('non cancella indirizzi esistenti se readAltAddresses ritorna reliable:false con array vuoto', async () => {
  const mockBot = {
    initialize: vi.fn(),
    navigateToCustomerByErpId: vi.fn(),
    readAltAddresses: vi.fn().mockResolvedValue({ addresses: [], reliable: false }),
    close: vi.fn(),
  };
  const mockPool = createMockPool([
    // upsertAddressesForCustomer NON deve essere chiamata
  ]);
  const upsertSpy = vi.spyOn(customerAddressRepo, 'upsertAddressesForCustomer');

  await handleSyncCustomerAddresses(
    mockPool,
    mockBot,
    { customers: [{ erpId: '55.261', customerName: 'Fresis' }] },
    'test-user',
    () => {},
  );

  expect(upsertSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/operations/handlers/sync-customer-addresses.spec.ts
```

Atteso: FAIL — l'upsert viene chiamato (bug attuale).

- [ ] **Step 3: Aggiungi reliable guard nel loop batch**

In `src/operations/handlers/sync-customer-addresses.ts`, nel loop batch (attorno alla riga 75):

```typescript
import { PreemptedSignal } from '../../conductor/preempted-signal';

// All'inizio del loop, aggiungi shouldStop check:
for (let i = 0; i < customers.length; i++) {
  const { erpId, customerName } = customers[i];
  onProgress(Math.floor((i / customers.length) * 90) + 5, `${customerName} (${i + 1}/${customers.length})`);

  // Preemption cooperativa: ferma il batch se arriva un task utente prioritario
  if (shouldStop && await shouldStop()) {
    throw new PreemptedSignal();
    // Nota: indirizzi già scritti per clienti 0..i-1 sono validi e restano nel DB.
    // Il task ripartirà da capo (idempotente).
  }

  try {
    await bot.navigateToCustomerByErpId(erpId);
    const { addresses, reliable } = await bot.readAltAddresses();

    // Reliable guard: se ERP lento (timeout >12s), reliable=false + addresses=[]
    // → NON cancellare gli indirizzi esistenti del cliente
    if (!reliable && addresses.length === 0) {
      logger.warn('[sync-customer-addresses] ERP timeout — skip upsert to preserve existing data', { erpId });
      errorsCount++;
      continue;
    }

    if (!dryRun) {
      await upsertAddressesForCustomer(pool, userId, erpId, addresses);
      await setAddressesSyncedAt(pool, userId, erpId);
    } else {
      // ... dryRun logging invariato ...
    }
    addressesCount += addresses.length;
  } catch (err) {
    // ... catch invariato, ma rilancia PreemptedSignal ...
    if (isPreemptedSignal(err)) throw err;
    if (isBrowserConnectionError(err)) {
      logger.warn('[sync-customer-addresses] Browser closed externally', { erpId, err: String(err) });
      throw new PreemptedSignal(); // safety net: tratta CDP close come preemption
    }
    // ... resto del catch invariato
  }
}
```

La funzione deve accettare `shouldStop` come parametro opzionale. Aggiorna la signature di `handleSyncCustomerAddresses`:

```typescript
async function handleSyncCustomerAddresses(
  pool: DbPool,
  bot: SyncCustomerAddressesBot,
  data: SyncCustomerAddressesData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: DryRunOpts = {},
  shouldStop?: () => Promise<boolean>,  // NUOVO
): Promise<SyncCustomerAddressesResult>
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/operations/handlers/sync-customer-addresses.spec.ts
```

Atteso: PASS per il nuovo test. Tutti gli esistenti restano PASS.

- [ ] **Step 5: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.ts \
        archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.spec.ts
git commit -m "fix(sync): sync-customer-addresses — reliable guard previene silent delete + shouldStop nel batch"
```

---

## Task 6: Fix `sync-products` zero-result guard + Worker `success:false` check

**Files:**
- Modify: `src/operations/handlers/sync-products.ts`
- Modify: `src/conductor/worker.ts`

- [ ] **Step 1: Scrivi test failing per sync-products guard**

In `src/operations/handlers/sync-products.spec.ts`:

```typescript
test('lancia errore se syncProducts ritorna success:false invece di completare silenziosamente', async () => {
  const mockSyncProducts = vi.fn().mockResolvedValue({ success: false, syncedCount: 0 });
  
  await expect(
    handleSyncProductsWithGuard(mockPool, mockBot, mockParsePdf, mockCleanup,
      mockSoftDelete, mockTrackCreated, () => {}, {})
  ).rejects.toThrow(/sync-products.*0 products/);
});
```

- [ ] **Step 2: Aggiorna `handleSyncProducts` per lanciare su success:false**

In `sync-products.ts`:

```typescript
export async function handleSyncProducts(
  pool: DbPool,
  bot: SyncProductsBot,
  parsePdf: (pdfPath: string) => Promise<ParsedProduct[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  softDeleteGhosts: SoftDeleteGhostsFn,
  trackProductCreated: TrackProductCreatedFn,
  onProgress: (progress: number, label?: string) => void,
  opts: SyncProductsDryRunOpts = {},
  onProductsChanged?: (n: number, u: number, g: number) => Promise<void>,
  onProductsMissingVat?: () => Promise<void>,
): Promise<ProductSyncResult> {
  const result = await syncProducts(
    { pool, downloadPdf: () => bot.downloadProductsPdf(), parsePdf, cleanupFile,
      softDeleteGhosts, trackProductCreated, onProductsChanged, onProductsMissingVat, ...opts },
    onProgress,
    () => false,
  );

  // Guard fuori dal catch interno di syncProducts — lancia per far sì che il Worker
  // chiami failTask invece di completeTask (previene soft-delete su sync fallita)
  if (!result.success || (result as any).syncedCount === 0) {
    throw new Error(
      `sync-products: ${(result as any).syncedCount ?? 'unknown'} products parsed — aborting to prevent DB overwrite (success=${result.success})`,
    );
  }

  return result;
}
```

- [ ] **Step 3: Aggiungi guard `success:false` nel Worker**

In `src/conductor/worker.ts`, dopo `const result = await handler(effectiveTask, ...)`, aggiungi:

```typescript
const result = await handler(effectiveTask, { metrics: this.deps.metrics, userId: this.userId });

// Guard: se il handler riporta success:false esplicitamente, trattalo come failure
// per evitare che sync fallite vengano marcate completed e freshness aggiornata.
if ('success' in result && result.success === false) {
  throw new Error(`Handler ${task.taskType} reported success:false`);
}
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/operations/handlers/sync-products.spec.ts src/conductor/worker.spec.ts
```

- [ ] **Step 5: Build + commit**

```bash
npm run build --prefix archibald-web-app/backend
git add archibald-web-app/backend/src/operations/handlers/sync-products.ts \
        archibald-web-app/backend/src/conductor/worker.ts
git commit -m "fix(sync): sync-products guard fuori da catch + Worker rigetta success:false come failure"
```

---

## Task 7: `forceReleaseByUserId` nel BrowserPool

**Files:**
- Modify: `src/bot/browser-pool.ts`

- [ ] **Step 1: Aggiungi `forceReleaseByUserId` alla funzione factory**

In `src/bot/browser-pool.ts`, aggiungi questa funzione vicino a `removeContextFromPool` (attorno riga 158):

```typescript
async function forceReleaseByUserId(userId: string, priority = 500): Promise<void> {
  // Cancella warm window se attivo (evita che il context venga riusato)
  const warmEntry = warmWindowMutex.get(userId);
  if (warmEntry) {
    clearTimeout(warmEntry.timer);
    warmEntry.resolve();
    warmWindowMutex.delete(userId);
  }

  // Rimuovi e chiudi il context (removeContextFromPool gestisce browserContextCounts)
  await removeContextFromPool(userId);

  // Decrementa il slot corretto (il task preemptato era P>=500 → sync slot)
  const isSync = priority >= 500;
  if (isSync) { activeSyncSlots = Math.max(0, activeSyncSlots - 1); }
  else { activeWriteSlots = Math.max(0, activeWriteSlots - 1); }

  logger.info('[BrowserPool] Force-released context for preemption', { userId, priority });
}
```

Aggiungi `forceReleaseByUserId` al return object della factory (circa riga 412):

```typescript
return { initialize, acquireContext, releaseContext, forceReleaseByUserId, getStats, shutdown };
```

Aggiungi al tipo `BrowserPool` se esiste (cerca `BrowserPool` type export):

```typescript
forceReleaseByUserId: (userId: string, priority?: number) => Promise<void>;
```

- [ ] **Step 2: Aggiorna `main.ts` — cable `forceReleaseByUserId` nel Conductor**

In `main.ts` riga 1473, sostituisci:

```typescript
releaseBrowserContext: async (_userId: string) => {},
```

Con:

```typescript
releaseBrowserContext: (userId: string, priority = 500) => browserPool.forceReleaseByUserId(userId, priority),
```

- [ ] **Step 3: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/bot/browser-pool.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(browser-pool): forceReleaseByUserId per safety net preemption — rimosso no-op dal Conductor"
```

---

## Task 8: Passa `task.priority` ad `acquireContext` negli handler

**Files:**
- Modify: `src/main.ts`

`acquireContext` già accetta `priority` nelle options (già implementato nel pool). Bisogna solo passarlo dagli handler task.

- [ ] **Step 1: Aggiorna `makeBrowserPoolAdapter` in `main.ts`**

Trova la funzione `makeBrowserPoolAdapter` (circa riga 755) e modificala per accettare `priority`:

```typescript
function makeBrowserPoolAdapter(priority = 500) {
  return {
    acquireContext: async (userId: string, opts?: { fromQueue?: boolean }) =>
      browserPool.acquireContext(userId, { ...opts, priority }) as unknown as { newPage: () => Promise<import('puppeteer').Page> },
    releaseContext: (userId: string, context: unknown, ok: boolean) =>
      browserPool.releaseContext(userId, context as never, ok, priority),
  };
}
```

- [ ] **Step 2: Aggiorna ogni `syncXxxTaskHandler` per passare `task.priority`**

Per ogni handler che chiama `makeBrowserPoolAdapter()`, aggiungi la priority:

```typescript
// ESEMPIO — syncOrdersTaskHandler (riga ~774):
const result = await handleSyncOrdersViaHtml(
  { pool, browserPool: makeBrowserPoolAdapter(task.priority) }, // <-- aggiunto task.priority
  ctx.userId, onProgress, { dryRun, dryRunLogger },
);
```

Stessa modifica per: `syncCustomersTaskHandler`, `syncDdtTaskHandler`, `syncInvoicesTaskHandler`, `syncPricesTaskHandler`.

- [ ] **Step 3: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/main.ts
git commit -m "fix(browser-pool): task.priority passato ad acquireContext — lane WRITE/SYNC rispettate"
```

---

## Task 9: Migration #083

**Files:**
- Create: `src/db/migrations/083-priority-engine.sql`

- [ ] **Step 1: Crea il file migration**

Crea `src/db/migrations/083-priority-engine.sql`:

```sql
-- Migration 083: Priority Engine — preempt_requested + indice pressure + sync_freshness skeleton
-- Applicata: [DATA]

-- 1. Colonna preemption flag
ALTER TABLE system.agent_operation_queue
  ADD COLUMN IF NOT EXISTS preempt_requested BOOLEAN NOT NULL DEFAULT false;

-- 2. Indice per pressure check (hot path EP pickup — subquery EXISTS per P<=10)
CREATE INDEX IF NOT EXISTS idx_aq_user_status_priority
  ON system.agent_operation_queue (user_id, status, priority)
  WHERE status IN ('enqueued', 'running');

-- 3. Tabella freshness per adaptive scheduler (Fase 2 — Piano 2)
CREATE TABLE IF NOT EXISTS agents.sync_freshness (
  user_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  last_completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sync_type)
);

-- 4. Backfill freshness anti-flood: CROSS JOIN copre TUTTE le combo (userId × syncType)
-- Combo senza history: COALESCE a NOW() → trattate come "appena sincronizzate" → no flood al 1° tick
INSERT INTO agents.sync_freshness (user_id, sync_type, last_completed_at)
SELECT
  u.user_id,
  s.sync_type,
  COALESCE(
    (SELECT MAX(completed_at)
     FROM system.agent_operation_queue
     WHERE user_id = u.user_id AND task_type = s.sync_type AND status = 'completed'),
    NOW()
  ) AS last_completed_at
FROM
  (SELECT DISTINCT id AS user_id FROM agents.users WHERE whitelisted = TRUE) u
  CROSS JOIN (VALUES
    ('sync-orders'), ('sync-customers'), ('sync-ddt'), ('sync-invoices'),
    ('sync-products'), ('sync-prices'), ('sync-tracking'), ('sync-order-states')
  ) s(sync_type)
ON CONFLICT (user_id, sync_type) DO UPDATE SET last_completed_at = EXCLUDED.last_completed_at;
```

- [ ] **Step 2: Aggiorna `TaskRow` in `types.ts`**

In `src/conductor/types.ts`, aggiungi il nuovo campo:

```typescript
export type TaskRow = {
  // ... campi esistenti ...
  priority: number;
  runAfter: Date | null;
  requiresBrowser: boolean;
  dedupKeyExternal: string | null;
  preemptRequested: boolean; // NUOVO
};
```

- [ ] **Step 3: Aggiorna `mapRow` in `agent-queue.ts`**

In `src/db/repositories/agent-queue.ts`, nel type `DbTaskRow` e nella funzione `mapRow`:

```typescript
type DbTaskRow = {
  // ... campi esistenti ...
  preempt_requested: boolean;
};

function mapRow(row: DbTaskRow): TaskRow {
  return {
    // ... campi esistenti ...
    preemptRequested: row.preempt_requested ?? false,
  };
}
```

- [ ] **Step 4: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 5: Applica la migration in produzione**

```bash
# Salva SSH key
awk '/BEGIN OPENSSH/,/END OPENSSH/' VPS-ACCESS-CREDENTIALS.md > /tmp/archibald_vps && chmod 600 /tmp/archibald_vps

# Esegui migration
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald" \
  < archibald-web-app/backend/src/db/migrations/083-priority-engine.sql

# Verifica
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT column_name FROM information_schema.columns WHERE table_name='agent_operation_queue' AND column_name='preempt_requested';\""
```

Atteso: la colonna `preempt_requested` appare nel risultato.

- [ ] **Step 6: Inserisci riga in `system.migrations`**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"INSERT INTO system.migrations (name, applied_at) VALUES ('083-priority-engine.sql', NOW()) ON CONFLICT DO NOTHING;\""
```

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/083-priority-engine.sql \
        archibald-web-app/backend/src/conductor/types.ts \
        archibald-web-app/backend/src/db/repositories/agent-queue.ts
git commit -m "feat(migration): 083 — preempt_requested, indice pressure, sync_freshness skeleton"
```

---

## Task 10: `makeCooperativeShouldStop` — implementazione reale

**Files:**
- Modify: `src/sync/scraper/html-sync-utils.ts`
- Modify: `src/sync/scraper/html-sync-utils.spec.ts`

- [ ] **Step 1: Scrivi il test**

In `html-sync-utils.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { makeCooperativeShouldStop } from './html-sync-utils';

describe('makeCooperativeShouldStop', () => {
  test('ritorna true se c\'è un task P<=10 in coda per userId', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{}] }), // 1 row = P<=10 pending
    } as any;

    const shouldStop = makeCooperativeShouldStop(mockPool, 'user-123');
    expect(await shouldStop()).toBe(true);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('priority <= 10'),
      ['user-123'],
    );
  });

  test('ritorna false se non ci sono task P<=10 in coda', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }), // 0 rows = nessun P<=10 pending
    } as any;

    const shouldStop = makeCooperativeShouldStop(mockPool, 'user-123');
    expect(await shouldStop()).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/sync/scraper/html-sync-utils.spec.ts
```

Atteso: FAIL — `makeCooperativeShouldStop` ritorna ancora `() => false`.

- [ ] **Step 3: Implementa `makeCooperativeShouldStop`**

Sostituisci il TODO in `html-sync-utils.ts`:

```typescript
export function makeCooperativeShouldStop(
  pool: DbPool,
  userId: string,
): () => Promise<boolean> {
  // Stessa soglia dell'EP scoring: solo ERP write (P<=10) triggera preemption.
  // P=50 (post-op sync-order-articles) non ferma le sync BG — EP ordering è sufficiente.
  return async () => {
    const { rows } = await pool.query(
      `SELECT 1 FROM system.agent_operation_queue
       WHERE user_id = $1 AND status = 'enqueued' AND priority <= 10
         AND (run_after IS NULL OR run_after <= NOW())
       LIMIT 1`,
      [userId],
    );
    return rows.length > 0;
  };
}
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/sync/scraper/html-sync-utils.spec.ts
```

Atteso: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/scraper/html-sync-utils.ts \
        archibald-web-app/backend/src/sync/scraper/html-sync-utils.spec.ts
git commit -m "feat(scraper): makeCooperativeShouldStop — preemption cooperativa attiva su P<=10 pending"
```

---

## Task 11: EP scoring in `pickupNextTask` + indice

**Files:**
- Modify: `src/db/repositories/agent-queue.ts`
- Modify: `src/db/repositories/agent-queue.spec.ts`

- [ ] **Step 1: Scrivi i test**

In `agent-queue.spec.ts`, aggiungi in `describe('pickupNextTask', ...)`:

```typescript
test('pickuppa P=10 prima di P=500 anche con anti-starvation', async () => {
  // Inserisci P=500 in coda prima, poi P=10
  await insertTask(pool, { userId: TEST_USER, taskType: 'sync-orders', priority: 500 });
  await insertTask(pool, { userId: TEST_USER, taskType: 'submit-order', priority: 10 });

  const task = await pickupNextTask(pool);
  expect(task?.taskType).toBe('submit-order');
  expect(task?.priority).toBe(10);
});

test('non pickuppa P=500 se P<=10 è pending per lo stesso userId', async () => {
  // Inserisci un P<=10 enqueued e un P=500
  await insertTask(pool, { userId: TEST_USER, taskType: 'submit-order', priority: 10 });
  // Crea un secondo userId per poter pickuppare un task
  await insertTask(pool, { userId: OTHER_USER, taskType: 'sync-orders', priority: 500 });

  // Il pickup per TEST_USER deve prendere submit-order, non sync-orders
  // Il P=500 di OTHER_USER non ha pressione → può essere pickuppato per OTHER_USER
  const taskForTestUser = await pickupNextTask(pool);
  // Solo test-user ha P<=10 → viene pickuppato il P=10
  expect(taskForTestUser?.taskType).toBe('submit-order');
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/db/repositories/agent-queue.spec.ts
```

Atteso: i nuovi test PASS se il comportamento è già corretto (priority ASC già funziona), FAIL se non lo è.

- [ ] **Step 3: Aggiorna `pickupNextTask` con EP scoring e pressure soppressione**

Sostituisci il `ORDER BY` in `pickupNextTask`:

```typescript
export async function pickupNextTask(pool: DbPool): Promise<TaskRow | null> {
  const { rows } = await pool.query<DbTaskRow>(`
    UPDATE system.agent_operation_queue
    SET status = 'running',
        started_at = NOW(),
        heartbeat_at = NOW()
    WHERE task_id = (
      SELECT aoq.task_id
      FROM system.agent_operation_queue aoq
      WHERE aoq.status = 'enqueued'
        AND (aoq.run_after IS NULL OR aoq.run_after <= NOW())
        AND aoq.user_id NOT IN (
          SELECT DISTINCT user_id
          FROM system.agent_operation_queue
          WHERE status = 'running'
        )
        AND NOT (
          aoq.priority = 500
          AND aoq.user_id IN (SELECT user_id FROM system.sync_paused_users)
        )
        AND pg_try_advisory_xact_lock(hashtext(aoq.user_id))
      ORDER BY (
        aoq.priority::float
        -- Anti-starvation: task in attesa da >5min vengono promossi progressivamente
        / GREATEST(1.0, 1.0 + LOG(2, GREATEST(
            1,
            EXTRACT(EPOCH FROM (NOW() - aoq.enqueued_at)) / 300.0
          )))
        -- Pressure soppressione: P>=500 con P<=10 pending per userId → EP=999
        * CASE
            WHEN aoq.priority >= 500 AND EXISTS (
              SELECT 1 FROM system.agent_operation_queue q2
              WHERE q2.user_id = aoq.user_id
                AND q2.status IN ('enqueued', 'running')
                AND q2.priority <= 10
            ) THEN 999.0
            ELSE 1.0
          END
      ) ASC, aoq.enqueued_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  return rows[0] ? mapRow(rows[0]) : null;
}
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/db/repositories/agent-queue.spec.ts
```

Atteso: tutti PASS inclusi i nuovi.

- [ ] **Step 5: Build + commit**

```bash
npm run build --prefix archibald-web-app/backend
git add archibald-web-app/backend/src/db/repositories/agent-queue.ts \
        archibald-web-app/backend/src/db/repositories/agent-queue.spec.ts
git commit -m "feat(queue): EP scoring in pickupNextTask — anti-starvation + P>=500 soppresso se P<=10 pending"
```

---

## Task 12: `signalPreemption` nel Conductor + Worker re-enqueue con delayed NOTIFY

**Files:**
- Modify: `src/conductor/dispatcher.ts`
- Modify: `src/conductor/worker.ts`
- Modify: `src/conductor/worker.spec.ts`

- [ ] **Step 1: Scrivi test Worker per PreemptedSignal handling**

In `worker.spec.ts`:

```typescript
test('re-accoda il task con run_after=+30s invece di failTask quando handler lancia PreemptedSignal', async () => {
  const mockHandler = vi.fn().mockRejectedValue(new PreemptedSignal());
  const poolQuerySpy = vi.fn().mockResolvedValue({ rows: [] });
  // ... setup worker con mock ...

  await worker.runUntilEmpty();

  // Verifica che sia stata chiamata la query di re-enqueue (run_after)
  const reEnqueueCall = poolQuerySpy.mock.calls.find(call =>
    String(call[0]).includes('run_after = NOW()') && String(call[0]).includes('30 seconds')
  );
  expect(reEnqueueCall).toBeDefined();

  // Verifica che failTask NON sia stata chiamata
  const failCall = poolQuerySpy.mock.calls.find(call =>
    String(call[0]).includes('error_class')
  );
  expect(failCall).toBeUndefined();
});
```

- [ ] **Step 2: Aggiungi `signalPreemption` in `dispatcher.ts`**

Aggiungi il metodo privato e chiamalo da `enqueueTaskExternal` quando il task è P<=10:

```typescript
import { TASK_PRIORITY } from './types';

async enqueueTaskExternal(params: {
  userId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  batchId?: string;
}): Promise<bigint> {
  const taskId = await queueRepo.enqueueTask(this.deps.pool, params);
  // Il NOTIFY viene emesso automaticamente dal trigger DB

  // Segnala preemption se è un task ad alta priorità (P<=10) e c'è un BG task running
  const priority = TASK_PRIORITY[params.taskType] ?? 500;
  if (priority <= 10) {
    this.signalPreemption(params.userId).catch(() => {}); // fire-and-forget
  }

  return taskId;
}

private async signalPreemption(userId: string): Promise<void> {
  // Cattura il task_id SPECIFICO ora — evita di chiudere un task diverso avviato dopo
  const { rows } = await this.deps.pool.query<{ task_id: string }>(
    `UPDATE system.agent_operation_queue
     SET preempt_requested = true
     WHERE user_id = $1 AND status = 'running' AND priority >= 500
     RETURNING task_id`,
    [userId],
  );
  if (rows.length === 0) return; // nessun BG task in esecuzione

  const targetTaskId = rows[0].task_id;

  setTimeout(async () => {
    try {
      const { rows: still } = await this.deps.pool.query(
        `SELECT 1 FROM system.agent_operation_queue
         WHERE task_id = $1 AND status = 'running'`,
        [targetTaskId],
      );
      if (still.length > 0) {
        logger.warn('[Conductor] Safety net: force-closing browser after 15s preemption timeout', { userId, targetTaskId });
        await this.deps.releaseBrowserContext(userId, 500);
      }
    } catch (err) {
      logger.warn('[Conductor] signalPreemption safety net error', { err });
    }
  }, 15_000);
}
```

Aggiorna `DispatcherDeps` per accettare `priority` in `releaseBrowserContext`:

```typescript
export type DispatcherDeps = {
  pool: DbPool;
  handlers: Partial<Record<TaskType, TaskHandler>>;
  broadcast: (userId: string, event: Record<string, unknown>) => void;
  releaseBrowserContext: (userId: string, priority?: number) => Promise<void>;
};
```

- [ ] **Step 3: Aggiungi re-enqueue PreemptedSignal nel `Worker.executeTask`**

In `worker.ts`, nel blocco catch di `executeTask`, aggiungi PRIMA del catch generico:

```typescript
import { isPreemptedSignal } from './preempted-signal';
import { isBrowserConnectionError } from '../operations/handlers/sync-customer-addresses';
// (oppure sposta isBrowserConnectionError in un file comune)

// Nel catch di executeTask:
} catch (err: unknown) {
  // Preemption: re-enqueue con run_after=+30s — NON è un failure
  if (isPreemptedSignal(err) || isBrowserConnectionError(err)) {
    this.stopHeartbeat();
    logger.info(`[Worker ${this.userId}] Task preempted — re-enqueue with run_after=+30s`, {
      taskId: task.taskId.toString(),
      taskType: task.taskType,
    });

    await this.deps.pool.query(
      `UPDATE system.agent_operation_queue
       SET status = 'enqueued',
           preempt_requested = false,
           run_after = NOW() + INTERVAL '30 seconds',
           started_at = NULL,
           heartbeat_at = NULL
       WHERE task_id = $1`,
      [task.taskId.toString()],
    );

    // Delayed NOTIFY: sveglia il Worker dopo 31s (quando run_after scade)
    // senza polling stretto. Se il task utente dura >30s, EP=999 impedisce
    // pickup anticipato — corretto per design.
    setTimeout(() => {
      this.deps.pool.query(
        `SELECT pg_notify('agent_queue_changed', $1)`,
        [task.userId],
      ).catch(() => {});
    }, 31_000);

    deleteActiveJob(this.deps.pool, task.taskId.toString()).catch(() => {});
    return; // NON chiama failTask
  }

  // ... resto del catch esistente invariato ...
```

- [ ] **Step 4: Esegui tutti i test conductor**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/conductor/
```

- [ ] **Step 5: Build completo**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/conductor/dispatcher.ts \
        archibald-web-app/backend/src/conductor/worker.ts \
        archibald-web-app/backend/src/conductor/worker.spec.ts
git commit -m "feat(conductor): signalPreemption + safety net 15s + Worker re-enqueue PreemptedSignal con delayed NOTIFY"
```

---

## Task 13: Test suite finale + push + verifica prod

- [ ] **Step 1: Esegui tutta la test suite backend**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: tutti PASS. Se ci sono fallimenti, risolvili prima di procedere.

- [ ] **Step 2: Build frontend (verifica che non ci siano regressioni)**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 3: Push a GitHub (trigger CI/CD)**

```bash
git push origin master
```

- [ ] **Step 4: Verifica deploy completato**

```bash
gh run list --limit 3
```

Atteso: `completed success` per entrambi CI e CD.

- [ ] **Step 5: Verifica prod — priority nei task**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT task_type, priority, COUNT(*) FROM system.agent_operation_queue \
     WHERE task_type IN ('submit-order','edit-order','sync-orders') \
     AND completed_at > NOW() - INTERVAL '1 hour' \
     GROUP BY 1,2 ORDER BY 1,2;\""
```

Atteso: `submit-order` con `priority=10`, `sync-orders` con `priority=500`.

- [ ] **Step 6: Verifica prod — nessun 0A000 nei log**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   logs backend --tail 50 2>&1 | grep '0A000'"
```

Atteso: nessun output.

- [ ] **Step 7: Test manuale — bottone "Aggiorna Articoli"**

Vai su `formicanera.com/orders`, apri un ordine, tab Articoli, clicca "Aggiorna Articoli". Deve funzionare senza errore rosso.

---

## Self-review checklist

**Spec coverage:**
- F0-1 ✅ (già deployato)
- F0-2 ✅ Task 1
- F0-3 ✅ Task 7
- F0-4 ✅ Task 2+3+4
- F0-5 ✅ Task 5
- F0-6 ✅ Task 6
- F0-7 ✅ implicito nel Task 6 (Worker success:false check)
- F0-8 ✅ Task 8
- F0-9 ⚠️ Non coperto — richiede sessione Playwright live sul DOM ERP (investigazione manuale separata)
- F1-1 ✅ Task 11
- F1-2 ✅ Task 10
- F1-3 ✅ Task 12
- F1-4 ✅ Task 12 (delayed NOTIFY)
- Migration #083 ✅ Task 9

**F0-9 gap**: la fix del selettore filter `OrdersAll` richiede una sessione Playwright live sul DOM ERP prod per trovare il nome corretto del combo. Non è automatizzabile senza accesso diretto. Da fare come task separato di diagnostica con `feedback_playwright_erp_access_flow.md` come guida.

**Prossimo piano**: `2026-05-08-adaptive-scheduler-banner-fase2-fase3.md` — F2 (staleness scoring, scheduler loop) e F3 (banner UX, QueueDrawer).

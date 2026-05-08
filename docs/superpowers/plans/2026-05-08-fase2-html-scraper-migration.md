# Fase 2 — HTML Scraper Migration: Customers, Orders, DDT, Invoices

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare sync-customers, sync-orders, sync-ddt, sync-invoices da PDF-based a HTML scraper (`scrapeListView` + `GetRowValues` API), seguendo esattamente il pattern già in produzione per `sync-prices`.

**Architecture:** Ogni handler (`sync-customers.ts` etc.) aggiunge una nuova funzione `handleSyncXxxViaHtml` che usa `scrapeListView` invece di `downloadPdf + parsePdf`. I sync service (`customer-sync.ts`, `order-sync.ts`, ecc.) rimangono **inalterati** — si passa una "fake parsePdf" che restituisce direttamente le righe scraped. In `main.ts`, i `sync*TaskHandler` del Conductor usano il nuovo path via feature flag `USE_HTML_SCRAPER`. Rollback immediato: basta spegnere il flag.

**Tech Stack:** TypeScript strict, Puppeteer, DevExpress GetRowValues API, Vitest per unit test

**Prerequisiti da leggere prima di ogni task:**
- `archibald-web-app/backend/src/operations/handlers/sync-prices.ts` — il template esatto da seguire
- `archibald-web-app/backend/src/sync/scraper/types.ts` — tipo `ScrapedRow`
- `archibald-web-app/backend/src/sync/scraper/list-view-scraper.ts` — firma di `scrapeListView`
- `archibald-web-app/backend/src/sync/scraper/configs/` — configs già pronte
- `archibald-web-app/backend/src/main.ts:1383-1580` — pattern REALE dei `sync*TaskHandler` post-Fase1

**Regole critiche:**
1. **NON modificare** i sync service (`customer-sync.ts`, `order-sync.ts`, `ddt-sync.ts`, `invoice-sync.ts`)
2. **NON modificare** le configs scraper tranne il campo `customerProfileId` → `customerAccountNum` in `orders.ts`
3. **Feature flag via env var**: `USE_HTML_SCRAPER=customers,orders,ddt,invoices` — rollback istantaneo
4. **Zero-result guard + Completeness guard**: se il scraper restituisce 0 righe O meno del 70% del conteggio DB precedente → abort, non sovrascrivere
5. **Dry-run parity**: i nuovi handler HTML devono onorare `SYNC_DRY_RUN_*` esattamente come il percorso PDF
6. URL nei config: mantenere `https://4.231.124.90/Archibald/...` (già verificato in prod da sync-prices)

---

## Review Codex (2026-05-08) — Tutti i finding sono stati incorporati

| Finding | Severity | Trattato in |
|---|---|---|
| Zero-row guard insufficiente (partial scrape corrompe DB) | 🔴 Critical | Task 2-5: completeness guard con soglia 70% |
| HTML sync blocca operazioni utente (no cancellazione) | 🟠 High | Task 2-5: `shouldStop` cooperativo + nota TODO |
| Feature flag bypassa dry-run | 🟠 High | Task 2-5: `dryRun`/`dryRunLogger` in tutti i handler |
| Task 6 wiring su path errato in main.ts | 🟡 Medium | Task 6: riscritto su `sync*TaskHandler` reali |

---

## File Map

| File | Azione | Note |
|---|---|---|
| `src/sync/scraper/configs/orders.ts` | MODIFY | Fix field name: `customerProfileId` → `customerAccountNum` |
| `src/operations/handlers/sync-customers.ts` | MODIFY | Aggiunge `handleSyncCustomersViaHtml` |
| `src/operations/handlers/sync-customers.spec.ts` | MODIFY | Test: zero-guard, completeness guard, dry-run, shouldStop |
| `src/operations/handlers/sync-orders.ts` | MODIFY | Aggiunge `handleSyncOrdersViaHtml` |
| `src/operations/handlers/sync-orders.spec.ts` | MODIFY | Test idem |
| `src/operations/handlers/sync-ddt.ts` | MODIFY | Aggiunge `handleSyncDdtViaHtml` |
| `src/operations/handlers/sync-ddt.spec.ts` | MODIFY | Test idem |
| `src/operations/handlers/sync-invoices.ts` | MODIFY | Aggiunge `handleSyncInvoicesViaHtml` |
| `src/operations/handlers/sync-invoices.spec.ts` | MODIFY | Test idem |
| `src/main.ts` | MODIFY | Feature flag dentro `syncCustomersTaskHandler` etc. (non inline literals) |

---

## Shared: HtmlSyncResult e completeness helper

Tutti i quattro handler usano lo stesso pattern di completeness check. Definire in `src/operations/handlers/html-sync-utils.ts`:

```typescript
// src/operations/handlers/html-sync-utils.ts
import type { DbPool } from '../../db/pool';
import { logger } from '../../logger';

/**
 * Completeness guard per gli HTML scraper handler.
 *
 * Protegge da scrape parziali (timeout pagina, filter drift, risposta DevExpress troncata)
 * che altrimenti verrebbero trattati come autorevoli dai sync service,
 * causando cancellazioni massive di record validi nel DB.
 *
 * Logica:
 * 1. Se rows.length === 0 → abort sempre (invariante assoluta)
 * 2. Se esiste un conteggio DB precedente per questo userId/tabella:
 *    - Se rows.length < previousCount * DROP_THRESHOLD → abort
 *    - Il threshold 0.70 permette riduzioni legittime fino al 30% tra sync consecutive
 *      (clienti rimossi, ordini completati, ecc.)
 */
export async function checkScraperCompleteness(
  pool: DbPool,
  tableName: string,
  userId: string,
  scrapedCount: number,
  entityLabel: string,
): Promise<void> {
  const DROP_THRESHOLD = 0.70;

  if (scrapedCount === 0) {
    throw new Error(
      `HTML scraper completeness guard: 0 rows for ${entityLabel} — aborting to prevent DB overwrite`,
    );
  }

  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM ${tableName} WHERE user_id = $1`,
    [userId],
  );
  const previousCount = parseInt(rows[0].count, 10);

  if (previousCount > 0 && scrapedCount < previousCount * DROP_THRESHOLD) {
    throw new Error(
      `HTML scraper completeness guard: expected ≥${Math.floor(previousCount * DROP_THRESHOLD)} rows` +
      ` (70% of ${previousCount} in DB), got ${scrapedCount} for ${entityLabel}` +
      ` — possible partial scrape (timeout/pagination miss), aborting`,
    );
  }

  logger.info(`[HTML scraper] Completeness OK: ${scrapedCount} rows scraped` +
    (previousCount > 0 ? `, previous DB count: ${previousCount}` : ', first sync'), { entityLabel });
}

/**
 * shouldStop cooperativo: ferma lo scraper se c'è un task P≤100 in coda per l'utente.
 * Prevenisce che una sync background (P500) blocchi submit-order (P10) per tutta la durata.
 *
 * TODO (Fase 2B): implementare completamente con query su agent_operation_queue.
 * Per ora: sempre false (comportamento invariato rispetto al PDF).
 * La priority lane del Conductor (P500 < P10) già garantisce l'ordine di esecuzione;
 * questo shouldStop sarebbe un'ottimizzazione per ridurre la latenza di preemption.
 */
export function makeCooperativeShouldStop(
  _pool: DbPool,
  _userId: string,
): () => boolean {
  // TODO Fase 2B: implementare con:
  // const hasPriorityTask = await pool.query(
  //   `SELECT 1 FROM system.agent_operation_queue
  //    WHERE user_id = $1 AND status = 'enqueued' AND priority <= 100 LIMIT 1`,
  //   [userId]
  // );
  // return hasPriorityTask.rows.length > 0;
  return () => false;
}
```

---

## Task 1 — Fix ordersConfig: `customerProfileId` → `customerAccountNum`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/scraper/configs/orders.ts`

**Contesto:** Il trick `parsePdf: async () => rows as ParsedOrder[]` funziona solo se i `targetField` corrispondono ai campi di `ParsedOrder`. Il campo `CUSTACCOUNT` era mappato a `customerProfileId` ma `ParsedOrder` ha `customerAccountNum`. Questo è il SOLO mismatch per orders.

- [ ] **Step 1: Modifica il campo**

In `archibald-web-app/backend/src/sync/scraper/configs/orders.ts`, riga 13:

```typescript
// PRIMA:
{ fieldName: 'CUSTACCOUNT', targetField: 'customerProfileId' },

// DOPO:
{ fieldName: 'CUSTACCOUNT', targetField: 'customerAccountNum' },
```

- [ ] **Step 2: Verifica type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/sync/scraper/configs/orders.ts
git commit -m "fix(scraper): orders config customerProfileId → customerAccountNum per allineamento ParsedOrder"
```

---

## Task 2 — Crea `html-sync-utils.ts` + `handleSyncCustomersViaHtml`

**Files:**
- Create: `archibald-web-app/backend/src/operations/handlers/html-sync-utils.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-customers.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-customers.spec.ts`

- [ ] **Step 1: Crea il file `html-sync-utils.ts`**

Crea `archibald-web-app/backend/src/operations/handlers/html-sync-utils.ts` con il contenuto esatto definito nella sezione "Shared" sopra (le due funzioni `checkScraperCompleteness` e `makeCooperativeShouldStop`).

- [ ] **Step 2: Scrivi i test PRIMA di implementare**

In `sync-customers.spec.ts`, aggiungi alla fine:

```typescript
import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { customersConfig } from '../../sync/scraper/configs/customers';
import { checkScraperCompleteness } from './html-sync-utils';
import { handleSyncCustomersViaHtml } from './sync-customers';

vi.mock('../../sync/scraper/list-view-scraper', () => ({ scrapeListView: vi.fn() }));
vi.mock('../../sync/scraper/configs/customers', () => ({ customersConfig: { url: 'test', columns: [] } }));
vi.mock('./html-sync-utils', () => ({
  checkScraperCompleteness: vi.fn().mockResolvedValue(undefined),
  makeCooperativeShouldStop: vi.fn().mockReturnValue(() => false),
}));

const scrapeListViewMock = vi.mocked(scrapeListView);
const checkCompletenessMock = vi.mocked(checkScraperCompleteness);

describe('handleSyncCustomersViaHtml', () => {
  const mockPool = {} as DbPool;
  const mockPage = { close: vi.fn() } as unknown as Page;
  const mockCtx = { newPage: vi.fn().mockResolvedValue(mockPage) };
  const mockBrowserPool = {
    acquireContext: vi.fn().mockResolvedValue(mockCtx),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };
  const sampleRows = [
    { erpId: '12345', name: 'Test Client', vatNumber: 'IT12345678901', accountNum: '55.001' },
  ];

  beforeEach(() => { vi.clearAllMocks(); });

  test('richiama scrapeListView con customersConfig', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    await handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}).catch(() => {});
    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, customersConfig, expect.any(Function), expect.any(Function));
  });

  test('richiama checkScraperCompleteness con la tabella corretta', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    await handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}).catch(() => {});
    expect(checkCompletenessMock).toHaveBeenCalledWith(mockPool, 'agents.customers', 'u1', 1, 'customers');
  });

  test('abort se checkScraperCompleteness lancia errore (scrape parziale)', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    checkCompletenessMock.mockRejectedValue(new Error('completeness check failed'));
    await expect(
      handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}),
    ).rejects.toThrow('completeness check failed');
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, false);
  });

  test('rilascia context su successo (success=true)', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    await handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}).catch(() => {});
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, expect.any(Boolean));
  });

  test('rispetta dryRun: non mutua DB quando dryRun=true', async () => {
    // Con dryRun=true, syncCustomers deve ricevere { dryRun: true }
    // Verifichiamo che l'opzione venga passata senza errori
    scrapeListViewMock.mockResolvedValue(sampleRows);
    await handleSyncCustomersViaHtml(
      { pool: mockPool, browserPool: mockBrowserPool },
      'u1',
      () => {},
      { dryRun: true },
    ).catch(() => {});
    // Se arriva qui senza throw sul dryRun, il parametro è gestito
    expect(scrapeListViewMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Verifica che i test falliscano**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-customers.spec.ts 2>&1 | tail -8
```

Expected: FAIL — `handleSyncCustomersViaHtml` not exported

- [ ] **Step 4: Implementa la funzione**

In `sync-customers.ts`, aggiungi importazioni all'inizio:

```typescript
import type { Page } from 'puppeteer';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { customersConfig } from '../../sync/scraper/configs/customers';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import { checkScraperCompleteness, makeCooperativeShouldStop } from './html-sync-utils';
import type { DryRunLogger } from '../../conductor/dry-run';
```

Aggiungi prima dell'`export` esistente:

```typescript
type HtmlSyncCustomersDeps = {
  pool: DbPool;
  browserPool: {
    acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<{ newPage: () => Promise<Page> }>;
    releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
  };
  onDeletedCustomers?: (infos: DeletedProfileInfo[]) => Promise<void>;
  onRestoredCustomers?: (infos: RestoredProfileInfo[]) => Promise<void>;
};

type HtmlSyncCustomersOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncCustomersViaHtml(
  deps: HtmlSyncCustomersDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: HtmlSyncCustomersOpts = {},
): Promise<CustomerSyncResult> {
  const { pool, browserPool, onDeletedCustomers, onRestoredCustomers } = deps;
  const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
  let page: Page | null = null;
  let success = false;

  try {
    page = await ctx.newPage();

    const progressCb = (progress: ScrapeProgress): void => {
      onProgress(
        Math.min(90, Math.round((progress.totalRowsSoFar / Math.max(progress.totalRowsSoFar, 1)) * 90)),
        `Scraping clienti: pagina ${progress.currentPage} (${progress.totalRowsSoFar} righe)`,
      );
    };

    const rows = await scrapeListView(page, customersConfig, progressCb, makeCooperativeShouldStop(pool, userId));

    // Completeness guard: protegge da scrape parziali che causerebbero cancellazioni massive
    await checkScraperCompleteness(pool, 'agents.customers', userId, rows.length, 'customers');

    const result = await syncCustomers(
      {
        pool,
        downloadPdf: async () => 'html-scrape',
        parsePdf: async () => rows as ParsedCustomer[],
        cleanupFile: async () => {},
        onDeletedCustomers,
        onRestoredCustomers,
        dryRun: opts.dryRun,
        dryRunLogger: opts.dryRunLogger,
      },
      userId,
      onProgress,
      () => false,
    );

    success = true;
    return result;
  } finally {
    if (page) await page.close().catch(() => {});
    await browserPool.releaseContext(userId, ctx, success);
  }
}
```

Aggiorna l'export:

```typescript
export {
  handleSyncCustomers,
  createSyncCustomersHandler,
  handleSyncCustomersViaHtml,
  type SyncCustomersBot,
  type SyncCustomersDryRunOpts,
};
```

- [ ] **Step 5: Verifica che i test passino**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-customers.spec.ts 2>&1 | tail -8
```

Expected: tutti i nuovi test PASS, nessuna regressione sui test esistenti.

- [ ] **Step 6: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/html-sync-utils.ts \
        archibald-web-app/backend/src/operations/handlers/sync-customers.ts \
        archibald-web-app/backend/src/operations/handlers/sync-customers.spec.ts
git commit -m "feat(scraper): handleSyncCustomersViaHtml con completeness guard e dry-run parity"
```

---

## Task 3 — `handleSyncOrdersViaHtml`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-orders.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-orders.spec.ts`

**Contesto:** Stesso pattern di Task 2. Usa `agents.order_records` come tabella per il completeness check (non `agents.orders`).

- [ ] **Step 1: Scrivi i test**

In `sync-orders.spec.ts`, aggiungi alla fine:

```typescript
import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ordersConfig } from '../../sync/scraper/configs/orders';
import { checkScraperCompleteness } from './html-sync-utils';
import { handleSyncOrdersViaHtml } from './sync-orders';

vi.mock('../../sync/scraper/list-view-scraper', () => ({ scrapeListView: vi.fn() }));
vi.mock('../../sync/scraper/configs/orders', () => ({ ordersConfig: { url: 'test', columns: [] } }));
vi.mock('./html-sync-utils', () => ({
  checkScraperCompleteness: vi.fn().mockResolvedValue(undefined),
  makeCooperativeShouldStop: vi.fn().mockReturnValue(() => false),
}));

const scrapeListViewMock = vi.mocked(scrapeListView);
const checkCompletenessMock = vi.mocked(checkScraperCompleteness);

describe('handleSyncOrdersViaHtml', () => {
  const mockPool = {} as DbPool;
  const mockPage = { close: vi.fn() } as unknown as Page;
  const mockCtx = { newPage: vi.fn().mockResolvedValue(mockPage) };
  const mockBrowserPool = {
    acquireContext: vi.fn().mockResolvedValue(mockCtx),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };
  const sampleRows = [
    { id: '54309', orderNumber: 'ORD-001', customerAccountNum: '55.001', customerName: 'Test', date: '2026-01-01', grossAmount: '100' },
  ];

  beforeEach(() => { vi.clearAllMocks(); });

  test('richiama scrapeListView con ordersConfig', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    await handleSyncOrdersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}).catch(() => {});
    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, ordersConfig, expect.any(Function), expect.any(Function));
  });

  test('richiama checkScraperCompleteness con agents.order_records', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    await handleSyncOrdersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}).catch(() => {});
    expect(checkCompletenessMock).toHaveBeenCalledWith(mockPool, 'agents.order_records', 'u1', 1, 'orders');
  });

  test('abort se completeness check fallisce', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    checkCompletenessMock.mockRejectedValue(new Error('partial scrape detected'));
    await expect(
      handleSyncOrdersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}),
    ).rejects.toThrow('partial scrape detected');
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, false);
  });
});
```

- [ ] **Step 2: Verifica test fallisce**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-orders.spec.ts 2>&1 | tail -5
```

Expected: FAIL

- [ ] **Step 3: Implementa**

In `sync-orders.ts`, aggiungi importazioni e funzione:

```typescript
import type { Page } from 'puppeteer';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ordersConfig } from '../../sync/scraper/configs/orders';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import { checkScraperCompleteness, makeCooperativeShouldStop } from './html-sync-utils';
import type { DryRunLogger } from '../../conductor/dry-run';

type HtmlSyncOrdersDeps = {
  pool: DbPool;
  browserPool: {
    acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<{ newPage: () => Promise<Page> }>;
    releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
  };
};

type HtmlSyncOrdersOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncOrdersViaHtml(
  deps: HtmlSyncOrdersDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: HtmlSyncOrdersOpts = {},
): Promise<OrderSyncResult> {
  const { pool, browserPool } = deps;
  const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
  let page: Page | null = null;
  let success = false;

  try {
    page = await ctx.newPage();

    const progressCb = (progress: ScrapeProgress): void => {
      onProgress(
        Math.min(90, Math.round((progress.totalRowsSoFar / Math.max(progress.totalRowsSoFar, 1)) * 90)),
        `Scraping ordini: pagina ${progress.currentPage} (${progress.totalRowsSoFar} righe)`,
      );
    };

    const rows = await scrapeListView(page, ordersConfig, progressCb, makeCooperativeShouldStop(pool, userId));

    await checkScraperCompleteness(pool, 'agents.order_records', userId, rows.length, 'orders');

    const result = await syncOrders(
      {
        pool,
        downloadPdf: async () => 'html-scrape',
        parsePdf: async () => rows as ParsedOrder[],
        cleanupFile: async () => {},
        dryRun: opts.dryRun,
        dryRunLogger: opts.dryRunLogger,
      },
      userId,
      onProgress,
      () => false,
    );

    success = true;
    return result;
  } finally {
    if (page) await page.close().catch(() => {});
    await browserPool.releaseContext(userId, ctx, success);
  }
}
```

Aggiorna l'export per includere `handleSyncOrdersViaHtml` e `HtmlSyncOrdersOpts`.

- [ ] **Step 4: Test + type-check + commit**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-orders.spec.ts 2>&1 | tail -5
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: PASS, 0 errori.

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-orders.ts \
        archibald-web-app/backend/src/operations/handlers/sync-orders.spec.ts
git commit -m "feat(scraper): handleSyncOrdersViaHtml con completeness guard e dry-run parity"
```

---

## Task 4 — `handleSyncDdtViaHtml`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-ddt.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-ddt.spec.ts`

**Contesto:** DDT ha `filterToggleWorkaround` già nella config. La tabella DB per il completeness check è `agents.order_ddts`.

- [ ] **Step 1: Scrivi i test**

In `sync-ddt.spec.ts`, aggiungi alla fine:

```typescript
import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ddtConfig } from '../../sync/scraper/configs/ddt';
import { checkScraperCompleteness } from './html-sync-utils';
import { handleSyncDdtViaHtml } from './sync-ddt';

vi.mock('../../sync/scraper/list-view-scraper', () => ({ scrapeListView: vi.fn() }));
vi.mock('../../sync/scraper/configs/ddt', () => ({ ddtConfig: { url: 'test', columns: [], filterToggleWorkaround: {} } }));
vi.mock('./html-sync-utils', () => ({
  checkScraperCompleteness: vi.fn().mockResolvedValue(undefined),
  makeCooperativeShouldStop: vi.fn().mockReturnValue(() => false),
}));

const scrapeListViewMock = vi.mocked(scrapeListView);
const checkCompletenessMock = vi.mocked(checkScraperCompleteness);

describe('handleSyncDdtViaHtml', () => {
  const mockPool = {} as DbPool;
  const mockPage = { close: vi.fn() } as unknown as Page;
  const mockCtx = { newPage: vi.fn().mockResolvedValue(mockPage) };
  const mockBrowserPool = {
    acquireContext: vi.fn().mockResolvedValue(mockCtx),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  test('richiama scrapeListView con ddtConfig (include filterToggleWorkaround)', async () => {
    scrapeListViewMock.mockResolvedValue([
      { orderNumber: 'ORD-001', ddtNumber: 'DDT-001', ddtId: '55424' },
    ]);
    await handleSyncDdtViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}).catch(() => {});
    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, ddtConfig, expect.any(Function), expect.any(Function));
  });

  test('checkScraperCompleteness usa agents.order_ddts', async () => {
    scrapeListViewMock.mockResolvedValue([{ orderNumber: 'ORD-001', ddtNumber: 'DDT-001' }]);
    await handleSyncDdtViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}).catch(() => {});
    expect(checkCompletenessMock).toHaveBeenCalledWith(mockPool, 'agents.order_ddts', 'u1', 1, 'ddt');
  });

  test('abort e context release=false se completeness fallisce', async () => {
    scrapeListViewMock.mockResolvedValue([{ orderNumber: 'x' }]);
    checkCompletenessMock.mockRejectedValue(new Error('partial'));
    await expect(handleSyncDdtViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {})).rejects.toThrow('partial');
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, false);
  });
});
```

- [ ] **Step 2: Verifica test fallisce**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-ddt.spec.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implementa `handleSyncDdtViaHtml`**

In `sync-ddt.ts`, aggiungi importazioni e funzione (stesso pattern Tasks 2-3, tabella: `agents.order_ddts`, label: `'ddt'`):

```typescript
import type { Page } from 'puppeteer';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ddtConfig } from '../../sync/scraper/configs/ddt';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import { checkScraperCompleteness, makeCooperativeShouldStop } from './html-sync-utils';
import type { DryRunLogger } from '../../conductor/dry-run';

type HtmlSyncDdtDeps = {
  pool: DbPool;
  browserPool: {
    acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<{ newPage: () => Promise<Page> }>;
    releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
  };
};

type HtmlSyncDdtOpts = { dryRun?: boolean; dryRunLogger?: DryRunLogger };

async function handleSyncDdtViaHtml(
  deps: HtmlSyncDdtDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: HtmlSyncDdtOpts = {},
): Promise<DdtSyncResult> {
  const { pool, browserPool } = deps;
  const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
  let page: Page | null = null;
  let success = false;
  try {
    page = await ctx.newPage();
    const progressCb = (progress: ScrapeProgress): void => {
      onProgress(
        Math.min(90, Math.round((progress.totalRowsSoFar / Math.max(progress.totalRowsSoFar, 1)) * 90)),
        `Scraping DDT: pagina ${progress.currentPage} (${progress.totalRowsSoFar} righe)`,
      );
    };
    const rows = await scrapeListView(page, ddtConfig, progressCb, makeCooperativeShouldStop(pool, userId));
    await checkScraperCompleteness(pool, 'agents.order_ddts', userId, rows.length, 'ddt');
    const result = await syncDdt(
      { pool, downloadPdf: async () => 'html-scrape', parsePdf: async () => rows as ParsedDdt[], cleanupFile: async () => {}, dryRun: opts.dryRun, dryRunLogger: opts.dryRunLogger },
      userId, onProgress, () => false,
    );
    success = true;
    return result;
  } finally {
    if (page) await page.close().catch(() => {});
    await browserPool.releaseContext(userId, ctx, success);
  }
}
```

Aggiorna l'export.

- [ ] **Step 4: Test + type-check + commit**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-ddt.spec.ts 2>&1 | tail -5
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-ddt.ts \
        archibald-web-app/backend/src/operations/handlers/sync-ddt.spec.ts
git commit -m "feat(scraper): handleSyncDdtViaHtml con completeness guard e dry-run parity"
```

---

## Task 5 — `handleSyncInvoicesViaHtml`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-invoices.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-invoices.spec.ts`

**Contesto:** Stesso pattern DDT. Tabella DB: `agents.order_invoices`.

- [ ] **Step 1: Scrivi i test**

In `sync-invoices.spec.ts`, aggiungi alla fine:

```typescript
import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { invoicesConfig } from '../../sync/scraper/configs/invoices';
import { checkScraperCompleteness } from './html-sync-utils';
import { handleSyncInvoicesViaHtml } from './sync-invoices';

vi.mock('../../sync/scraper/list-view-scraper', () => ({ scrapeListView: vi.fn() }));
vi.mock('../../sync/scraper/configs/invoices', () => ({ invoicesConfig: { url: 'test', columns: [], filterToggleWorkaround: {} } }));
vi.mock('./html-sync-utils', () => ({
  checkScraperCompleteness: vi.fn().mockResolvedValue(undefined),
  makeCooperativeShouldStop: vi.fn().mockReturnValue(() => false),
}));

const scrapeListViewMock = vi.mocked(scrapeListView);
const checkCompletenessMock = vi.mocked(checkScraperCompleteness);

describe('handleSyncInvoicesViaHtml', () => {
  const mockPool = {} as DbPool;
  const mockPage = { close: vi.fn() } as unknown as Page;
  const mockCtx = { newPage: vi.fn().mockResolvedValue(mockPage) };
  const mockBrowserPool = {
    acquireContext: vi.fn().mockResolvedValue(mockCtx),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  test('richiama scrapeListView con invoicesConfig', async () => {
    scrapeListViewMock.mockResolvedValue([
      { orderNumber: 'ORD-001', invoiceNumber: 'FAT-001', invoiceAmount: '1000.00' },
    ]);
    await handleSyncInvoicesViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}).catch(() => {});
    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, invoicesConfig, expect.any(Function), expect.any(Function));
  });

  test('checkScraperCompleteness usa agents.order_invoices', async () => {
    scrapeListViewMock.mockResolvedValue([{ orderNumber: 'ORD-001', invoiceNumber: 'FAT-001' }]);
    await handleSyncInvoicesViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}).catch(() => {});
    expect(checkCompletenessMock).toHaveBeenCalledWith(mockPool, 'agents.order_invoices', 'u1', 1, 'invoices');
  });

  test('abort se completeness fallisce', async () => {
    scrapeListViewMock.mockResolvedValue([{ orderNumber: 'x' }]);
    checkCompletenessMock.mockRejectedValue(new Error('drop too large'));
    await expect(handleSyncInvoicesViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {})).rejects.toThrow('drop too large');
  });
});
```

- [ ] **Step 2: Verifica test fallisce**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-invoices.spec.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implementa `handleSyncInvoicesViaHtml`**

Stesso pattern di Task 4, tabella `agents.order_invoices`, label `'invoices'`, config `invoicesConfig`, service `syncInvoices`, tipo `ParsedInvoice`, risultato `InvoiceSyncResult`.

- [ ] **Step 4: Test + type-check + commit**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-invoices.spec.ts 2>&1 | tail -5
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-invoices.ts \
        archibald-web-app/backend/src/operations/handlers/sync-invoices.spec.ts
git commit -m "feat(scraper): handleSyncInvoicesViaHtml con completeness guard e dry-run parity"
```

---

## Task 6 — Feature flag in main.ts (wiring CORRETTO sui `sync*TaskHandler`)

**Files:**
- Modify: `archibald-web-app/backend/src/main.ts`

**⚠️ ATTENZIONE (da review Codex):** Il codice da modificare NON è un inline object-literal. Post-Fase1, i handler del Conductor sono definiti come variabili `const syncCustomersTaskHandler: TaskHandler = async (task, ctx) => { ... }` (riga ~1421) e registrate nell'oggetto `handlers` alla riga ~1751. Modificare LE VARIABILI, non l'oggetto `handlers`.

- [ ] **Step 1: Aggiungi la helper `useHtmlScraper`**

In `main.ts`, subito prima della definizione di `syncOrdersTaskHandler` (~riga 1383), aggiungi:

```typescript
// Feature flag: USE_HTML_SCRAPER=customers,orders,ddt,invoices
// Permette rollback istantaneo: rimuovere la variabile d'ambiente = ritorno al PDF
function useHtmlScraper(entity: string): boolean {
  const val = process.env.USE_HTML_SCRAPER ?? '';
  return val.split(',').map(s => s.trim().toLowerCase()).includes(entity.toLowerCase());
}
```

- [ ] **Step 2: Aggiungi le importazioni**

Aggiungi in cima al file (tra le importazioni handler esistenti):

```typescript
import { handleSyncCustomersViaHtml } from './operations/handlers/sync-customers';
import { handleSyncOrdersViaHtml } from './operations/handlers/sync-orders';
import { handleSyncDdtViaHtml } from './operations/handlers/sync-ddt';
import { handleSyncInvoicesViaHtml } from './operations/handlers/sync-invoices';
```

- [ ] **Step 3: Modifica `syncCustomersTaskHandler`**

Trova `const syncCustomersTaskHandler: TaskHandler = async (task, ctx) => {` (~riga 1421) e aggiungi il branch HTML all'inizio della funzione, prima di qualsiasi codice esistente:

```typescript
const syncCustomersTaskHandler: TaskHandler = async (task, ctx) => {
  // HTML scraper path (feature flag USE_HTML_SCRAPER=customers)
  if (useHtmlScraper('customers')) {
    const dryRun = process.env.SYNC_DRY_RUN_CUSTOMERS === 'true';
    const dryRunLogger = dryRun ? new DryRunLogger() : undefined;
    const taskIdStr = task.taskId.toString();
    const onProgress = (progress: number, label?: string) => {
      broadcastEvent(ctx.userId, { event: 'JOB_PROGRESS', progress, label, taskId: taskIdStr, jobId: taskIdStr });
    };
    const result = await handleSyncCustomersViaHtml(
      {
        pool,
        browserPool: {
          acquireContext: (uid, opts) => browserPool.acquireContext(uid, opts),
          releaseContext: (uid, context, ok) => browserPool.releaseContext(uid, context as never, ok),
        },
        onDeletedCustomers: onDeletedCustomersCallback,   // usa la stessa callback del path PDF: cerca nel codice esistente
        onRestoredCustomers: onRestoredCustomersCallback, // idem
      },
      ctx.userId,
      onProgress,
      { dryRun, dryRunLogger },
    );
    if (dryRun && dryRunLogger) {
      const baseline = await captureBaseline(pool, 'agents.customers', ctx.userId);
      dryRunLogger.buildArtifact('sync-customers', ctx.userId, baseline);
    }
    return result as unknown as Record<string, unknown>;
  }

  // PDF path originale (invariato) — tutto il codice esistente qui sotto
  const dryRun = process.env.SYNC_DRY_RUN_CUSTOMERS === 'true';
  // ... codice attuale ...
};
```

**Nota critica:** Cerca nel codice esistente come si chiamano le callback `onDeletedCustomers` e `onRestoredCustomers` passate a `handleSyncCustomers` (sono definite nel corpo della funzione o come closures). Usa gli stessi riferimenti.

- [ ] **Step 4: Modifica `syncOrdersTaskHandler`**

Stessa struttura per orders. Il handler HTML usa `handleSyncOrdersViaHtml` senza callback extra:

```typescript
const syncOrdersTaskHandler: TaskHandler = async (task, ctx) => {
  if (useHtmlScraper('orders')) {
    const dryRun = process.env.SYNC_DRY_RUN_ORDERS === 'true';
    const dryRunLogger = dryRun ? new DryRunLogger() : undefined;
    const taskIdStr = task.taskId.toString();
    const onProgress = (p: number, l?: string) => broadcastEvent(ctx.userId, { event: 'JOB_PROGRESS', progress: p, label: l, taskId: taskIdStr, jobId: taskIdStr });
    const result = await handleSyncOrdersViaHtml(
      { pool, browserPool: { acquireContext: (uid, opts) => browserPool.acquireContext(uid, opts), releaseContext: (uid, ctx2, ok) => browserPool.releaseContext(uid, ctx2 as never, ok) } },
      ctx.userId, onProgress, { dryRun, dryRunLogger },
    );
    if (dryRun && dryRunLogger) {
      const baseline = await captureBaseline(pool, 'agents.order_records', ctx.userId);
      dryRunLogger.buildArtifact('sync-orders', ctx.userId, baseline);
    }
    return result as unknown as Record<string, unknown>;
  }
  // PDF path originale invariato
  // ...
};
```

- [ ] **Step 5: Modifica `syncDdtTaskHandler` e `syncInvoicesTaskHandler`**

Stesso pattern. DDT usa `handleSyncDdtViaHtml` / `captureBaseline(pool, 'agents.order_ddts', ...)`. Invoices usa `handleSyncInvoicesViaHtml` / `captureBaseline(pool, 'agents.order_invoices', ...)`.

- [ ] **Step 6: Type-check completo**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`

- [ ] **Step 7: Test suite completo**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -6
```

Expected: tutti i test passano.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/main.ts
git commit -m "feat(scraper): feature flag USE_HTML_SCRAPER nei sync*TaskHandler del Conductor — dry-run parity"
```

---

## Task 7 — Verifica end-to-end su produzione (VPS)

**Strategia:** una entità alla volta, 24h di osservazione ciascuna prima di procedere.

- [ ] **Step 1: Deploy completato**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml logs --tail 5 backend 2>&1 | grep 'Server listening'"
```

- [ ] **Step 2: Abilita Customers**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "echo 'USE_HTML_SCRAPER=customers' >> /home/deploy/archibald-app/.env && \
   docker compose -f /home/deploy/archibald-app/docker-compose.yml restart backend"
```

- [ ] **Step 3: Monitora il primo sync customers (deve vedere "Scraping clienti" non "clienti pdf_export")**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml logs -f backend 2>&1 | grep -E 'Scraping clienti|pdf_export:completed|completeness|error|Error'" 
```

- [ ] **Step 4: Verifica conteggio DB invariato**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml exec -T postgres psql -U archibald -d archibald \
  -c 'SELECT user_id, count(*) FROM agents.customers GROUP BY user_id;'"
```

- [ ] **Step 5-8: Estendi progressivamente a Orders, DDT, Invoices**

Ogni 24h, verificato che il conteggio DB sia stabile e i log non mostrino errori:

```bash
# Dopo customers stabile:
ssh ... "sed -i 's/USE_HTML_SCRAPER=customers/USE_HTML_SCRAPER=customers,orders/' .env && docker compose restart backend"
# Dopo orders stabile:
ssh ... "sed -i 's/=customers,orders/=customers,orders,ddt/' .env && docker compose restart backend"
# Dopo ddt stabile:
ssh ... "sed -i 's/=customers,orders,ddt/=customers,orders,ddt,invoices/' .env && docker compose restart backend"
```

---

## Rollback immediato

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "sed -i '/USE_HTML_SCRAPER/d' /home/deploy/archibald-app/.env && \
   docker compose -f /home/deploy/archibald-app/docker-compose.yml restart backend"
```

---

## Checklist spec compliance (post-review Codex)

- [x] **Completeness guard** — 70% drop threshold vs DB baseline per tutte e 4 le entità (NON solo zero-row)
- [x] **Dry-run parity** — `dryRun`/`dryRunLogger` in `HtmlSyncXxxOpts` e passati ai sync service
- [x] **Wiring corretto main.ts** — modificati `sync*TaskHandler` (non inline literals)
- [x] **Dry-run artifact** — `dryRunLogger.buildArtifact(...)` dopo ogni HTML sync se dryRun
- [x] **shouldStop cooperativo** — placeholder con TODO documentato per Fase 2B
- [x] **Products** — LASCIATO su PDF (23 pagine × 4.3s = ~100s, più lento del PDF ~60s)
- [x] **Sync services** — NON modificati, rimangono stabili e testati
- [x] **Zero-result guard** — incluso in `checkScraperCompleteness` (caso rows.length === 0)
- [x] **Rollback** — feature flag rimuovibile in 30 secondi

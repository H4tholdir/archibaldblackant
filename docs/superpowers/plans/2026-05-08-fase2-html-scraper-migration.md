# Fase 2 — HTML Scraper Migration: Customers, Orders, DDT, Invoices

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare sync-customers, sync-orders, sync-ddt, sync-invoices da PDF-based a HTML scraper (`scrapeListView` + `GetRowValues` API), seguendo esattamente il pattern già in produzione per `sync-prices`.

**Architecture:** Ogni handler (`sync-customers.ts` etc.) aggiunge una nuova funzione `handleSyncXxxViaHtml` che usa `scrapeListView` invece di `downloadPdf + parsePdf`. I sync service (`customer-sync.ts`, `order-sync.ts`, ecc.) rimangono **inalterati** — si passa una "fake parsePdf" che restituisce direttamente le righe scraped. In `main.ts`, il Conductor chiama il nuovo handler via feature flag `USE_HTML_SCRAPER`. Rollback immediato: basta spegnere il flag.

**Tech Stack:** TypeScript strict, Puppeteer, DevExpress GetRowValues API, Vitest per unit test

**Prerequisiti da leggere prima di ogni task:**
- `archibald-web-app/backend/src/operations/handlers/sync-prices.ts` — il template esatto da seguire
- `archibald-web-app/backend/src/sync/scraper/types.ts` — tipo `ScrapedRow`
- `archibald-web-app/backend/src/sync/scraper/list-view-scraper.ts` — firma di `scrapeListView`
- `archibald-web-app/backend/src/sync/scraper/configs/` — configs già pronte

**Regole critiche:**
1. **NON modificare** i sync service (`customer-sync.ts`, `order-sync.ts`, `ddt-sync.ts`, `invoice-sync.ts`) — sono già testati
2. **NON modificare** le configs scraper tranne il campo `customerProfileId` → `customerAccountNum` in `orders.ts`
3. **Feature flag via env var**: `USE_HTML_SCRAPER=customers,orders,ddt,invoices` — permette rollback istantaneo
4. **Zero-result guard** (dalla memoria): se il scraper restituisce 0 righe, NON sovrascrivere il DB — lanciare errore
5. URL nei config: mantenere `https://4.231.124.90/Archibald/...` (già verificato in prod da sync-prices)

---

## File Map

| File | Azione | Note |
|---|---|---|
| `src/sync/scraper/configs/orders.ts` | MODIFY | Fix field name: `customerProfileId` → `customerAccountNum` |
| `src/operations/handlers/sync-customers.ts` | MODIFY | Aggiunge `handleSyncCustomersViaHtml` |
| `src/operations/handlers/sync-customers.spec.ts` | MODIFY | Test per la nuova funzione |
| `src/operations/handlers/sync-orders.ts` | MODIFY | Aggiunge `handleSyncOrdersViaHtml` |
| `src/operations/handlers/sync-orders.spec.ts` | MODIFY | Test per la nuova funzione |
| `src/operations/handlers/sync-ddt.ts` | MODIFY | Aggiunge `handleSyncDdtViaHtml` |
| `src/operations/handlers/sync-ddt.spec.ts` | MODIFY | Test per la nuova funzione |
| `src/operations/handlers/sync-invoices.ts` | MODIFY | Aggiunge `handleSyncInvoicesViaHtml` |
| `src/operations/handlers/sync-invoices.spec.ts` | MODIFY | Test per la nuova funzione |
| `src/main.ts` | MODIFY | Feature flag: usa Html handlers nel Conductor se `USE_HTML_SCRAPER` contiene l'entità |

---

## Task 1 — Fix ordersConfig: campo `customerProfileId` → `customerAccountNum`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/scraper/configs/orders.ts`

**Contesto:** Il trick `parsePdf: async () => rows as ParsedOrder[]` funziona solo se i `targetField` nello ScrapedRow corrispondono ai campi di `ParsedOrder`. Il campo `CUSTACCOUNT` era mappato a `customerProfileId` ma `ParsedOrder` ha `customerAccountNum`. Questo è il SOLO mismatch per orders.

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

## Task 2 — `handleSyncCustomersViaHtml` in sync-customers handler

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-customers.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-customers.spec.ts`

**Contesto:** Il pattern da seguire è IDENTICO a `sync-prices.ts`. Leggerlo prima. Il scraper restituisce `ScrapedRow[]` con gli stessi `targetField` di `ParsedCustomer`. Li passiamo come "fake parsePdf" a `syncCustomers()`.

- [ ] **Step 1: Scrivi il test PRIMA di implementare**

In `sync-customers.spec.ts`, aggiungi questo describe block alla fine del file:

```typescript
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { customersConfig } from '../../sync/scraper/configs/customers';
import { handleSyncCustomersViaHtml } from './sync-customers';

vi.mock('../../sync/scraper/list-view-scraper', () => ({
  scrapeListView: vi.fn(),
}));
vi.mock('../../sync/scraper/configs/customers', () => ({
  customersConfig: { url: 'test', columns: [] },
}));

const scrapeListViewMock = vi.mocked(scrapeListView);

describe('handleSyncCustomersViaHtml', () => {
  const mockPool = {} as DbPool;
  const mockPage = { close: vi.fn() } as unknown as Page;
  const mockCtx = { newPage: vi.fn().mockResolvedValue(mockPage) };
  const mockBrowserPool = {
    acquireContext: vi.fn().mockResolvedValue(mockCtx),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    scrapeListViewMock.mockResolvedValue([
      { erpId: '12345', name: 'Test Client', vatNumber: 'IT12345678901', accountNum: '55.001' },
    ]);
  });

  test('richiama scrapeListView con la config clienti', async () => {
    await handleSyncCustomersViaHtml(
      { pool: mockPool, browserPool: mockBrowserPool },
      'test-user',
      () => {},
    ).catch(() => {});

    expect(scrapeListViewMock).toHaveBeenCalledWith(
      mockPage,
      customersConfig,
      expect.any(Function),
      expect.any(Function),
    );
  });

  test('lancia errore se scraper restituisce 0 righe (zero-result guard)', async () => {
    scrapeListViewMock.mockResolvedValue([]);

    await expect(
      handleSyncCustomersViaHtml(
        { pool: mockPool, browserPool: mockBrowserPool },
        'test-user',
        () => {},
      ),
    ).rejects.toThrow('HTML scraper returned 0 rows for customers');
  });

  test('rilascia il context anche in caso di errore', async () => {
    scrapeListViewMock.mockRejectedValue(new Error('ERP error'));

    await expect(
      handleSyncCustomersViaHtml(
        { pool: mockPool, browserPool: mockBrowserPool },
        'test-user',
        () => {},
      ),
    ).rejects.toThrow('ERP error');

    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('test-user', mockCtx, false);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-customers.spec.ts 2>&1 | tail -10
```

Expected: FAIL — `handleSyncCustomersViaHtml` not exported

- [ ] **Step 3: Implementa la funzione**

In `sync-customers.ts`, aggiungi queste importazioni in cima:

```typescript
import type { Page } from 'puppeteer';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { customersConfig } from '../../sync/scraper/configs/customers';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import { syncCustomers } from '../../sync/services/customer-sync';
```

Poi aggiungi prima dell'`export`:

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

async function handleSyncCustomersViaHtml(
  deps: HtmlSyncCustomersDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
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

    const rows = await scrapeListView(page, customersConfig, progressCb, () => false);

    if (rows.length === 0) {
      throw new Error('HTML scraper returned 0 rows for customers — aborting to prevent DB overwrite');
    }

    const result = await syncCustomers(
      {
        pool,
        downloadPdf: async () => 'html-scrape',
        parsePdf: async () => rows as ParsedCustomer[],
        cleanupFile: async () => {},
        onDeletedCustomers,
        onRestoredCustomers,
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

Aggiungi `handleSyncCustomersViaHtml` all'export:

```typescript
export { handleSyncCustomers, createSyncCustomersHandler, handleSyncCustomersViaHtml, type SyncCustomersBot, type SyncCustomersDryRunOpts };
```

- [ ] **Step 4: Verifica che il test passi**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-customers.spec.ts 2>&1 | tail -10
```

Expected: PASS — tutti i nuovi test passano, nessun test esistente regredisce

- [ ] **Step 5: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-customers.ts \
        archibald-web-app/backend/src/operations/handlers/sync-customers.spec.ts
git commit -m "feat(scraper): aggiunge handleSyncCustomersViaHtml — HTML scraper per sync clienti"
```

---

## Task 3 — `handleSyncOrdersViaHtml` in sync-orders handler

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-orders.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-orders.spec.ts`

**Contesto:** Stesso pattern di Task 2. `ParsedOrder` ha `customerAccountNum` (già fixato in Task 1). Attenzione: `ParsedOrder` ha un campo `customerName: string` (required) — il config lo mappa da `SALESNAME → customerName`. Se assente dal scraper, `syncOrders` potrebbe fallire. Da verificare.

- [ ] **Step 1: Controlla che la firma di `syncOrders` accetti i campi del config**

Leggi `order-sync.ts` per trovare l'uso di `ParsedOrder.customerName` e `ParsedOrder.customerAccountNum`.

Se `customerName` è required in `syncOrders`: il config ha `{ fieldName: 'SALESNAME', targetField: 'customerName' }` — verificare che SALESNAME sia presente nella grid degli ordini (già confermato nel test empirico: ✅).

- [ ] **Step 2: Scrivi il test**

In `sync-orders.spec.ts`, aggiungi alla fine:

```typescript
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ordersConfig } from '../../sync/scraper/configs/orders';
import { handleSyncOrdersViaHtml } from './sync-orders';

vi.mock('../../sync/scraper/list-view-scraper', () => ({ scrapeListView: vi.fn() }));
vi.mock('../../sync/scraper/configs/orders', () => ({ ordersConfig: { url: 'test', columns: [] } }));

const scrapeListViewMock = vi.mocked(scrapeListView);

describe('handleSyncOrdersViaHtml', () => {
  const mockPool = {} as DbPool;
  const mockPage = { close: vi.fn() } as unknown as Page;
  const mockCtx = { newPage: vi.fn().mockResolvedValue(mockPage) };
  const mockBrowserPool = {
    acquireContext: vi.fn().mockResolvedValue(mockCtx),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  test('richiama scrapeListView con ordersConfig', async () => {
    scrapeListViewMock.mockResolvedValue([
      { id: '12345', orderNumber: 'ORD-001', customerAccountNum: '55.001', customerName: 'Test', date: '2026-01-01', grossAmount: '100' },
    ]);

    await handleSyncOrdersViaHtml(
      { pool: mockPool, browserPool: mockBrowserPool },
      'test-user',
      () => {},
    ).catch(() => {});

    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, ordersConfig, expect.any(Function), expect.any(Function));
  });

  test('zero-result guard: lancia errore se 0 righe', async () => {
    scrapeListViewMock.mockResolvedValue([]);

    await expect(
      handleSyncOrdersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'test-user', () => {}),
    ).rejects.toThrow('HTML scraper returned 0 rows for orders');
  });

  test('rilascia context in caso di errore', async () => {
    scrapeListViewMock.mockRejectedValue(new Error('net error'));

    await expect(
      handleSyncOrdersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'test-user', () => {}),
    ).rejects.toThrow('net error');

    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('test-user', mockCtx, false);
  });
});
```

- [ ] **Step 3: Verifica che il test fallisca**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-orders.spec.ts 2>&1 | tail -5
```

Expected: FAIL

- [ ] **Step 4: Implementa `handleSyncOrdersViaHtml`**

In `sync-orders.ts`, aggiungi importazioni:

```typescript
import type { Page } from 'puppeteer';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ordersConfig } from '../../sync/scraper/configs/orders';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
```

Aggiungi prima dell'export:

```typescript
type HtmlSyncOrdersDeps = {
  pool: DbPool;
  browserPool: {
    acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<{ newPage: () => Promise<Page> }>;
    releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
  };
};

async function handleSyncOrdersViaHtml(
  deps: HtmlSyncOrdersDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
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

    const rows = await scrapeListView(page, ordersConfig, progressCb, () => false);

    if (rows.length === 0) {
      throw new Error('HTML scraper returned 0 rows for orders — aborting to prevent DB overwrite');
    }

    const result = await syncOrders(
      {
        pool,
        downloadPdf: async () => 'html-scrape',
        parsePdf: async () => rows as ParsedOrder[],
        cleanupFile: async () => {},
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

Aggiorna l'export per includere `handleSyncOrdersViaHtml`.

- [ ] **Step 5: Test + type-check + commit**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-orders.spec.ts 2>&1 | tail -5
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: test PASS, 0 errori TypeScript.

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-orders.ts \
        archibald-web-app/backend/src/operations/handlers/sync-orders.spec.ts
git commit -m "feat(scraper): aggiunge handleSyncOrdersViaHtml — HTML scraper per sync ordini"
```

---

## Task 4 — `handleSyncDdtViaHtml` in sync-ddt handler

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-ddt.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-ddt.spec.ts`

**Contesto:** DDT ha `filterToggleWorkaround` nella config (già implementato nel list-view-scraper). Il test empirico ha confermato che funziona in ~10s. I targetField della config corrispondono esattamente a `ParsedDdt` — nessun mismatch.

- [ ] **Step 1: Scrivi il test**

In `sync-ddt.spec.ts`, aggiungi alla fine:

```typescript
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ddtConfig } from '../../sync/scraper/configs/ddt';
import { handleSyncDdtViaHtml } from './sync-ddt';

vi.mock('../../sync/scraper/list-view-scraper', () => ({ scrapeListView: vi.fn() }));
vi.mock('../../sync/scraper/configs/ddt', () => ({ ddtConfig: { url: 'test', columns: [], filterToggleWorkaround: {} } }));

const scrapeListViewMock = vi.mocked(scrapeListView);

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

    await handleSyncDdtViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'test-user', () => {}).catch(() => {});

    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, ddtConfig, expect.any(Function), expect.any(Function));
  });

  test('zero-result guard per DDT', async () => {
    scrapeListViewMock.mockResolvedValue([]);

    await expect(
      handleSyncDdtViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'test-user', () => {}),
    ).rejects.toThrow('HTML scraper returned 0 rows for ddt');
  });
});
```

- [ ] **Step 2: Verifica che il test fallisca**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-ddt.spec.ts 2>&1 | tail -5
```

Expected: FAIL

- [ ] **Step 3: Implementa `handleSyncDdtViaHtml`**

In `sync-ddt.ts`, aggiungi importazioni e funzione seguendo lo stesso pattern dei Task 2-3:

```typescript
import type { Page } from 'puppeteer';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ddtConfig } from '../../sync/scraper/configs/ddt';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';

type HtmlSyncDdtDeps = {
  pool: DbPool;
  browserPool: {
    acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<{ newPage: () => Promise<Page> }>;
    releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
  };
};

async function handleSyncDdtViaHtml(
  deps: HtmlSyncDdtDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
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

    const rows = await scrapeListView(page, ddtConfig, progressCb, () => false);

    if (rows.length === 0) {
      throw new Error('HTML scraper returned 0 rows for ddt — aborting to prevent DB overwrite');
    }

    const result = await syncDdt(
      {
        pool,
        downloadPdf: async () => 'html-scrape',
        parsePdf: async () => rows as ParsedDdt[],
        cleanupFile: async () => {},
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

Aggiorna l'export.

- [ ] **Step 4: Test + type-check + commit**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-ddt.spec.ts 2>&1 | tail -5
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: test PASS, 0 errori.

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-ddt.ts \
        archibald-web-app/backend/src/operations/handlers/sync-ddt.spec.ts
git commit -m "feat(scraper): aggiunge handleSyncDdtViaHtml — HTML scraper per sync DDT"
```

---

## Task 5 — `handleSyncInvoicesViaHtml` in sync-invoices handler

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-invoices.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-invoices.spec.ts`

**Contesto:** Stesso pattern di Task 4 (DDT). Le Invoices hanno anch'esse `filterToggleWorkaround` nella config. Tutti i targetField corrispondono a `ParsedInvoice`.

- [ ] **Step 1: Scrivi il test**

In `sync-invoices.spec.ts`, aggiungi alla fine:

```typescript
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { invoicesConfig } from '../../sync/scraper/configs/invoices';
import { handleSyncInvoicesViaHtml } from './sync-invoices';

vi.mock('../../sync/scraper/list-view-scraper', () => ({ scrapeListView: vi.fn() }));
vi.mock('../../sync/scraper/configs/invoices', () => ({ invoicesConfig: { url: 'test', columns: [], filterToggleWorkaround: {} } }));

const scrapeListViewMock = vi.mocked(scrapeListView);

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

    await handleSyncInvoicesViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'test-user', () => {}).catch(() => {});

    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, invoicesConfig, expect.any(Function), expect.any(Function));
  });

  test('zero-result guard per fatture', async () => {
    scrapeListViewMock.mockResolvedValue([]);

    await expect(
      handleSyncInvoicesViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'test-user', () => {}),
    ).rejects.toThrow('HTML scraper returned 0 rows for invoices');
  });
});
```

- [ ] **Step 2: Verifica che il test fallisca**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-invoices.spec.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implementa `handleSyncInvoicesViaHtml`**

Stesso pattern dei task precedenti. Importa `invoicesConfig` da `../../sync/scraper/configs/invoices`.
Usa `syncInvoices` con fake parsePdf. Zero-result guard. Export.

```typescript
import type { Page } from 'puppeteer';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { invoicesConfig } from '../../sync/scraper/configs/invoices';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';

type HtmlSyncInvoicesDeps = {
  pool: DbPool;
  browserPool: {
    acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<{ newPage: () => Promise<Page> }>;
    releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
  };
};

async function handleSyncInvoicesViaHtml(
  deps: HtmlSyncInvoicesDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<InvoiceSyncResult> {
  const { pool, browserPool } = deps;
  const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
  let page: Page | null = null;
  let success = false;

  try {
    page = await ctx.newPage();

    const progressCb = (progress: ScrapeProgress): void => {
      onProgress(
        Math.min(90, Math.round((progress.totalRowsSoFar / Math.max(progress.totalRowsSoFar, 1)) * 90)),
        `Scraping fatture: pagina ${progress.currentPage} (${progress.totalRowsSoFar} righe)`,
      );
    };

    const rows = await scrapeListView(page, invoicesConfig, progressCb, () => false);

    if (rows.length === 0) {
      throw new Error('HTML scraper returned 0 rows for invoices — aborting to prevent DB overwrite');
    }

    const result = await syncInvoices(
      {
        pool,
        downloadPdf: async () => 'html-scrape',
        parsePdf: async () => rows as ParsedInvoice[],
        cleanupFile: async () => {},
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

- [ ] **Step 4: Test + type-check + commit**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/sync-invoices.spec.ts 2>&1 | tail -5
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: PASS, 0 errori.

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-invoices.ts \
        archibald-web-app/backend/src/operations/handlers/sync-invoices.spec.ts
git commit -m "feat(scraper): aggiunge handleSyncInvoicesViaHtml — HTML scraper per sync fatture"
```

---

## Task 6 — Feature flag in main.ts + wiring Conductor

**Files:**
- Modify: `archibald-web-app/backend/src/main.ts`

**Contesto:** I Conductor task handlers (`sync-customers`, `sync-orders`, `sync-ddt`, `sync-invoices`) in `main.ts` ora hanno un'alternativa HTML. Aggiungiamo un feature flag: `USE_HTML_SCRAPER` è una stringa CSV (es. `"customers,orders,ddt,invoices"`) che indica quali entità usare con il nuovo scraper. Se l'entità non è nell'elenco → percorso PDF esistente (invariato).

- [ ] **Step 1: Aggiungi la helper function del feature flag**

All'inizio della sezione "Conductor handlers" in `main.ts`, aggiungi:

```typescript
// Feature flag: USE_HTML_SCRAPER=customers,orders,ddt,invoices
// Controlla quale sync usa l'HTML scraper invece del PDF
function useHtmlScraper(entity: string): boolean {
  const val = process.env.USE_HTML_SCRAPER ?? '';
  return val.split(',').map(s => s.trim().toLowerCase()).includes(entity.toLowerCase());
}
```

- [ ] **Step 2: Modifica il handler `sync-customers` nel Conductor**

Trova nel `main.ts` la sezione del Conductor handler per `sync-customers`. Attualmente chiama `handleSyncCustomers(pool, bot, parsePdf, ...)`. Aggiorna:

```typescript
'sync-customers': async (task, ctx) => {
  if (useHtmlScraper('customers')) {
    // Percorso HTML scraper (nuovo)
    const result = await handleSyncCustomersViaHtml(
      {
        pool,
        browserPool: {
          acquireContext: (uid, opts) => browserPool.acquireContext(uid, opts),
          releaseContext: (uid, context, ok) => browserPool.releaseContext(uid, context as never, ok),
        },
        onDeletedCustomers: deletedCustomersCallback,   // usa la stessa callback del percorso PDF
        onRestoredCustomers: restoredCustomersCallback, // idem
      },
      ctx.userId,
      (_progress, _label) => {},
    );
    return result as unknown as Record<string, unknown>;
  }
  // Percorso PDF originale (invariato)
  const dryRun = process.env.SYNC_DRY_RUN_CUSTOMERS === 'true';
  // ... codice esistente ...
},
```

**Nota:** cerca nel file le variabili `deletedCustomersCallback` e `restoredCustomersCallback` (o come si chiamano nel codice esistente) e usa i riferimenti corretti.

- [ ] **Step 3: Modifica il handler `sync-orders`**

Stesso pattern:

```typescript
'sync-orders': async (task, ctx) => {
  if (useHtmlScraper('orders')) {
    const result = await handleSyncOrdersViaHtml(
      {
        pool,
        browserPool: {
          acquireContext: (uid, opts) => browserPool.acquireContext(uid, opts),
          releaseContext: (uid, context, ok) => browserPool.releaseContext(uid, context as never, ok),
        },
      },
      ctx.userId,
      (_progress, _label) => {},
    );
    return result as unknown as Record<string, unknown>;
  }
  // percorso PDF originale invariato
},
```

- [ ] **Step 4: Modifica i handler `sync-ddt` e `sync-invoices`**

Stesso pattern per DDT e Invoices. La funzione `HtmlSyncDdtDeps` e `HtmlSyncInvoicesDeps` accettano solo `pool` e `browserPool` — non hanno callback extra.

- [ ] **Step 5: Aggiungi le importazioni delle nuove funzioni all'inizio di main.ts**

```typescript
import { handleSyncCustomersViaHtml } from './operations/handlers/sync-customers';
import { handleSyncOrdersViaHtml } from './operations/handlers/sync-orders';
import { handleSyncDdtViaHtml } from './operations/handlers/sync-ddt';
import { handleSyncInvoicesViaHtml } from './operations/handlers/sync-invoices';
```

- [ ] **Step 6: Type-check completo**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | wc -l
```

Expected: `0`

- [ ] **Step 7: Test suite completo (no PG_HOST)**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -10
```

Expected: tutti i test passano.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/main.ts
git commit -m "feat(scraper): feature flag USE_HTML_SCRAPER in main.ts — wiring Conductor handler per 4 entità"
```

---

## Task 7 — Verifica end-to-end su produzione (VPS)

**Prerequisito:** Task 1-6 completati e deployati su master → CI/CD ha fatto il deploy.

**Strategia:** Attivare una entità alla volta su VPS, monitorare i log per 24h prima di passare alla successiva.

- [ ] **Step 1: Deploy e verifica migration applicata**

```bash
# Verifica che il deploy sia completato
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml logs --tail 10 backend" | grep "Server listening"
```

- [ ] **Step 2: Abilita HTML scraper per Customers**

```bash
# Aggiorna .env su VPS (aggiungere USE_HTML_SCRAPER)
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "echo 'USE_HTML_SCRAPER=customers' >> /home/deploy/archibald-app/.env && \
   docker compose -f /home/deploy/archibald-app/docker-compose.yml restart backend"
```

- [ ] **Step 3: Monitora i log per il primo sync customers**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml logs -f backend 2>&1 | grep -E 'sync-customers|Scraping clienti|error|Error'" 
```

Expected: vedere `"Scraping clienti: pagina X (N righe)"` nei log — NON `"clienti pdf_export"`. Verificare che il count dei clienti nel DB non sia cambiato in modo inatteso.

- [ ] **Step 4: Confronto conteggi DB**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml exec -T postgres psql -U archibald -d archibald -c \
  'SELECT user_id, count(*) FROM agents.customers GROUP BY user_id ORDER BY user_id;'"
```

Confrontare con il conteggio atteso (~1300 clienti).

- [ ] **Step 5: Dopo 24h stabile → estendi a Orders**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "sed -i 's/USE_HTML_SCRAPER=customers/USE_HTML_SCRAPER=customers,orders/' /home/deploy/archibald-app/.env && \
   docker compose -f /home/deploy/archibald-app/docker-compose.yml restart backend"
```

Monitora: `"Scraping ordini: pagina"` nei log. Conta gli ordini nel DB.

- [ ] **Step 6: Dopo 24h stabile → estendi a DDT**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "sed -i 's/USE_HTML_SCRAPER=customers,orders/USE_HTML_SCRAPER=customers,orders,ddt/' /home/deploy/archibald-app/.env && \
   docker compose -f /home/deploy/archibald-app/docker-compose.yml restart backend"
```

- [ ] **Step 7: Dopo 24h stabile → estendi a Invoices**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "sed -i 's/USE_HTML_SCRAPER=customers,orders,ddt/USE_HTML_SCRAPER=customers,orders,ddt,invoices/' /home/deploy/archibald-app/.env && \
   docker compose -f /home/deploy/archibald-app/docker-compose.yml restart backend"
```

- [ ] **Step 8: Dopo 48h tutte stabili → commit finale**

Una volta confermato che tutte e 4 le entità funzionano, aggiornare la memoria del progetto e documentare i risultati.

---

## Rollback

Se qualcosa va storto in produzione:

```bash
# Rollback istantaneo: rimuovi USE_HTML_SCRAPER dall'env
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "sed -i '/USE_HTML_SCRAPER/d' /home/deploy/archibald-app/.env && \
   docker compose -f /home/deploy/archibald-app/docker-compose.yml restart backend"
```

Il backend torna immediatamente al percorso PDF originale.

---

## Checklist spec compliance

- [x] Customers: zero mismatch fields, fake parsePdf trick funziona
- [x] Orders: fix `customerProfileId` → `customerAccountNum` (Task 1)
- [x] DDT: zero mismatch fields, filterToggleWorkaround già nella config
- [x] Invoices: zero mismatch fields, filterToggleWorkaround già nella config
- [x] Zero-result guard in ogni handler (non sovrascrive DB se 0 righe)
- [x] Feature flag per rollback istantaneo
- [x] Products: LASCIATO su PDF (23 pagine × 4.3s = ~100s, più lento del PDF da 60s)
- [x] Sync service (`customer-sync.ts`, `order-sync.ts`, ecc.) NON modificati

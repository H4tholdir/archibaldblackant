# Sync Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correggere i tre bug che causano le anomalie sync (session expiry, circuit breaker silenzioso, CYCLE_SIZE_WARNING).

**Architecture:** Fix A+B+C risolvono la session expiry del service-account tramite expiry più corto (15 min), rilevamento redirect login, e retry automatico. Fix 2 corregge il circuit breaker estraendo `withAnomalyNotification` come funzione testabile che fa throw dopo aver creato la notifica. Fix 3 aggiunge exception handling per-ciclo nel parser Python e un fallback difensivo nel TypeScript.

**Tech Stack:** TypeScript (backend Node.js), Python 3 (parse-products-pdf.py), Vitest, pdfplumber

---

## File Structure

| File | Azione |
|------|--------|
| `backend/src/bot/browser-pool.ts` | Fix A: aggiungere `serviceAccountContextExpiryMs` + helper `isServiceUser` |
| `backend/src/config.ts` | Fix A: aggiungere `serviceAccountContextExpiryMs` (default 900000ms = 15 min) |
| `backend/src/bot/browser-pool.spec.ts` | Fix A: 2 nuovi test su scadenza contestualizzata |
| `backend/src/main.ts` | Fix A (pass config) + Fix C (retry) + Fix 2 (use extracted wrapper) + Fix 3 (CHANGED notification) |
| `backend/src/main.spec.ts` | Fix A: aggiornare mock config |
| `backend/src/bot/archibald-bot.ts` | Fix B: rilevare redirect a login page dopo `page.goto()` |
| `backend/src/anomaly-notification-wrapper.ts` | Fix 2: nuova funzione `withAnomalyNotification` testabile |
| `backend/src/anomaly-notification-wrapper.spec.ts` | Fix 2: unit test |
| `backend/src/pdf-parser-products-service.ts` | Fix 3 TS: fallback recovery CYCLE_SIZE_WARNING CHANGED |
| `backend/src/pdf-parser-products-service.spec.ts` | Fix 3 TS: unit test |
| `scripts/parse-products-pdf.py` | Fix 3 Python: per-cycle exception handling + guard 0 prodotti |

---

## Task 1: Fix A — Context expiry ridotta per service-account

**Files:**
- Modify: `backend/src/bot/browser-pool.ts:32-39` (BrowserPoolConfig type + acquireContext)
- Modify: `backend/src/config.ts:89-93`
- Modify: `backend/src/main.ts:108-122`
- Modify: `backend/src/main.spec.ts:18`
- Modify: `backend/src/bot/browser-pool.spec.ts:47-231`

- [ ] **Step 1: Scrivere i test fallenti in `browser-pool.spec.ts`**

Aggiungere dopo il `describe('createBrowserPool', () => {` esistente ma PRIMA del primo test, un nuovo `describe` per l'expiry:

```typescript
describe('service-account context expiry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('service-account context is evicted after serviceAccountContextExpiryMs', async () => {
    const serviceAccountExpiryMs = 15 * 60 * 1000;
    const config: BrowserPoolConfig = {
      ...defaultConfig,
      contextExpiryMs: 30 * 60 * 1000,
      serviceAccountContextExpiryMs: serviceAccountExpiryMs,
    };
    const browser = createMockBrowser();
    launchFn.mockResolvedValue(browser);

    vi.useFakeTimers();
    const pool = createBrowserPool(config, launchFn);
    await pool.initialize();

    await pool.acquireContext('service-account', { fromQueue: true });
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(serviceAccountExpiryMs + 1000);

    await pool.acquireContext('service-account', { fromQueue: true });
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);
  });

  test('non-service-account context is NOT evicted after serviceAccountContextExpiryMs', async () => {
    const serviceAccountExpiryMs = 15 * 60 * 1000;
    const config: BrowserPoolConfig = {
      ...defaultConfig,
      contextExpiryMs: 30 * 60 * 1000,
      serviceAccountContextExpiryMs: serviceAccountExpiryMs,
    };
    const mockCtx = createMockContext();
    const browser = createMockBrowser(() => mockCtx);
    launchFn.mockResolvedValue(browser);

    vi.useFakeTimers();
    const pool = createBrowserPool(config, launchFn);
    await pool.initialize();

    const ctx1 = await pool.acquireContext('agent-1', { fromQueue: true });
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(serviceAccountExpiryMs + 1000);

    const ctx2 = await pool.acquireContext('agent-1', { fromQueue: true });
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(1);
    expect(ctx2).toBe(ctx1);
  });
});
```

- [ ] **Step 2: Eseguire i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose browser-pool.spec.ts
```

Atteso: FAIL — `serviceAccountContextExpiryMs` non è una proprietà valida di `BrowserPoolConfig`.

- [ ] **Step 3: Aggiungere `serviceAccountContextExpiryMs` a `BrowserPoolConfig` e `isServiceUser` helper in `browser-pool.ts`**

In `browser-pool.ts`, nel tipo `BrowserPoolConfig` (riga 32-39), aggiungere il campo opzionale:

```typescript
type BrowserPoolConfig = {
  maxBrowsers: number;
  maxContextsPerBrowser: number;
  contextExpiryMs: number;
  serviceAccountContextExpiryMs?: number;
  launchOptions: Record<string, unknown>;
  sessionValidationUrl: string;
  loginFn?: LoginFn;
};
```

Aggiungere la funzione helper PRIMA di `createBrowserPool` (riga 56):

```typescript
function isServiceUser(userId: string): boolean {
  return userId === 'service-account' || userId.endsWith('-service') || userId === 'sync-orchestrator';
}
```

- [ ] **Step 4: Aggiornare `acquireContext` in `browser-pool.ts` per usare l'expiry ridotta**

In `acquireContext`, sostituire la riga 180:

```typescript
      if (age < poolConfig.contextExpiryMs) {
```

Con:

```typescript
      const expiryMs = poolConfig.serviceAccountContextExpiryMs !== undefined && isServiceUser(userId)
        ? poolConfig.serviceAccountContextExpiryMs
        : poolConfig.contextExpiryMs;
      if (age < expiryMs) {
```

- [ ] **Step 5: Aggiungere `serviceAccountContextExpiryMs` a `config.ts`**

In `config.ts`, nel blocco `browserPool` (riga 89-93), aggiungere:

```typescript
  browserPool: {
    maxBrowsers: parseInt(process.env.BROWSER_POOL_MAX_BROWSERS || "3", 10),
    maxContextsPerBrowser: parseInt(process.env.BROWSER_POOL_MAX_CONTEXTS || "8", 10),
    contextExpiryMs: parseInt(process.env.BROWSER_POOL_CONTEXT_EXPIRY_MS || "1800000", 10),
    serviceAccountContextExpiryMs: parseInt(process.env.BROWSER_POOL_SERVICE_ACCOUNT_CONTEXT_EXPIRY_MS || "900000", 10),
  },
```

- [ ] **Step 6: Aggiornare `main.ts` per passare `serviceAccountContextExpiryMs` al browser pool**

In `main.ts`, nel blocco `createBrowserPool` (riga 108-122), aggiungere il campo:

```typescript
  const browserPool = createBrowserPool(
    {
      maxBrowsers: config.browserPool.maxBrowsers,
      maxContextsPerBrowser: config.browserPool.maxContextsPerBrowser,
      contextExpiryMs: config.browserPool.contextExpiryMs,
      serviceAccountContextExpiryMs: config.browserPool.serviceAccountContextExpiryMs,
      launchOptions: {
        headless: config.puppeteer.headless,
        // ... (resto invariato)
```

- [ ] **Step 7: Aggiornare il mock config in `main.spec.ts`**

In `main.spec.ts` riga 18, aggiornare il mock `browserPool`:

```typescript
    browserPool: { maxBrowsers: 3, maxContextsPerBrowser: 8, contextExpiryMs: 1800000, serviceAccountContextExpiryMs: 900000 },
```

- [ ] **Step 8: Eseguire i test per verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose browser-pool.spec.ts
```

Atteso: PASS — tutti i test, inclusi i due nuovi.

- [ ] **Step 9: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: nessun errore.

- [ ] **Step 10: Commit**

```bash
git add archibald-web-app/backend/src/bot/browser-pool.ts \
        archibald-web-app/backend/src/bot/browser-pool.spec.ts \
        archibald-web-app/backend/src/config.ts \
        archibald-web-app/backend/src/main.ts \
        archibald-web-app/backend/src/main.spec.ts
git commit -m "fix(browser-pool): riduce context expiry a 15 min per service-account"
```

---

## Task 2: Fix B — Rilevamento redirect login in `downloadPDFExport`

**Files:**
- Modify: `backend/src/bot/archibald-bot.ts:9265-9270`

- [ ] **Step 1: Aggiungere il controllo URL dopo `page.goto()` in `archibald-bot.ts`**

In `downloadPDFExport`, dopo il blocco `await page.goto(pageUrl, ...)` (riga 9265-9268), inserire il controllo URL **prima** del `logger.info` esistente:

```typescript
      await page.goto(pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      const currentUrl = page.url();
      if (currentUrl.includes('Login')) {
        throw new Error(
          `SessionExpiredError: redirect to login page (expected: ${pageUrl}, got: ${currentUrl})`,
        );
      }
      logger.info(`[ArchibaldBot] ${filePrefix} pdf_export:page_loaded url=${pageUrl}`);
      stage = 'pdf_export:page_loaded';
```

- [ ] **Step 2: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "fix(bot): rileva redirect login page in downloadPDFExport (SessionExpiredError)"
```

---

## Task 3: Fix C — Retry automatico su SessionExpiredError in `sync-products`

**Files:**
- Modify: `backend/src/main.ts:883-895` (lambda `downloadProductsPdf`)

- [ ] **Step 1: Aggiornare la lambda `downloadProductsPdf` in `main.ts`**

Nel gestore `'sync-products'` (attorno a riga 883), sostituire l'attuale lambda `downloadProductsPdf`:

```typescript
// PRIMA:
        downloadProductsPdf: async () => {
          const bot = createBotForUser(userId);
          const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
          let contextHealthy = false;
          try {
            const result = await bot.downloadProductsPDF(ctx as unknown as BrowserContext);
            contextHealthy = true;
            return result;
          } finally {
            await browserPool.releaseContext(userId, ctx as never, contextHealthy);
          }
        },
```

Con:

```typescript
        downloadProductsPdf: async () => {
          const bot = createBotForUser(userId);
          const attemptDownload = async () => {
            const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
            let contextHealthy = false;
            try {
              const result = await bot.downloadProductsPDF(ctx as unknown as BrowserContext);
              contextHealthy = true;
              return result;
            } finally {
              await browserPool.releaseContext(userId, ctx as never, contextHealthy);
            }
          };
          try {
            return await attemptDownload();
          } catch (err) {
            if (err instanceof Error && err.message.includes('SessionExpiredError')) {
              return attemptDownload();
            }
            throw err;
          }
        },
```

- [ ] **Step 2: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/main.ts
git commit -m "fix(sync): retry downloadProductsPdf una volta su SessionExpiredError"
```

---

## Task 4: Fix 2 — `withAnomalyNotification` fa throw dopo notifica anomalia

**Files:**
- Create: `backend/src/anomaly-notification-wrapper.ts`
- Create: `backend/src/anomaly-notification-wrapper.spec.ts`
- Modify: `backend/src/main.ts:541-556` (rimuovere closure inline, importare ed usare funzione estratta)

- [ ] **Step 1: Scrivere il test fallente in `anomaly-notification-wrapper.spec.ts`**

Creare il file `backend/src/anomaly-notification-wrapper.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { withAnomalyNotification } from './anomaly-notification-wrapper';

describe('withAnomalyNotification', () => {
  const mockContext = {} as unknown;
  const mockOnProgress = vi.fn();

  test('throws error and calls notifyFn when handler returns success: false', async () => {
    const syncError = 'PDF download failed [pdf_export:page_loaded/timeout]: waiting for selector timed out';
    const handler = vi.fn().mockResolvedValue({ success: false, error: syncError });
    const notifyFn = vi.fn().mockResolvedValue(undefined);

    const wrapped = withAnomalyNotification(handler, 'Prodotti', notifyFn);

    await expect(
      wrapped(mockContext, {}, 'service-account', mockOnProgress),
    ).rejects.toThrow(syncError);

    expect(notifyFn).toHaveBeenCalledWith(expect.objectContaining({
      target: 'admin',
      type: 'sync_anomaly',
      severity: 'error',
      title: 'Anomalia sincronizzazione: Prodotti',
      body: syncError,
    }));
  });

  test('does not throw and skips notification when error includes "stop"', async () => {
    const handler = vi.fn().mockResolvedValue({ success: false, error: 'sync stopped by user request' });
    const notifyFn = vi.fn().mockResolvedValue(undefined);

    const wrapped = withAnomalyNotification(handler, 'Prodotti', notifyFn);

    const result = await wrapped(mockContext, {}, 'service-account', mockOnProgress);

    expect(result).toEqual({ success: false, error: 'sync stopped by user request' });
    expect(notifyFn).not.toHaveBeenCalled();
  });

  test('returns result and skips notification when handler returns success: true', async () => {
    const handler = vi.fn().mockResolvedValue({ success: true, count: 42 });
    const notifyFn = vi.fn().mockResolvedValue(undefined);

    const wrapped = withAnomalyNotification(handler, 'Prezzi', notifyFn);

    const result = await wrapped(mockContext, {}, 'service-account', mockOnProgress);

    expect(result).toEqual({ success: true, count: 42 });
    expect(notifyFn).not.toHaveBeenCalled();
  });

  test('truncates error body to 300 characters in the notification', async () => {
    const longError = 'e'.repeat(400);
    const handler = vi.fn().mockResolvedValue({ success: false, error: longError });
    const notifyFn = vi.fn().mockResolvedValue(undefined);

    const wrapped = withAnomalyNotification(handler, 'Clienti', notifyFn);

    await expect(
      wrapped(mockContext, {}, 'service-account', mockOnProgress),
    ).rejects.toThrow(longError);

    expect(notifyFn).toHaveBeenCalledWith(expect.objectContaining({
      body: 'e'.repeat(300),
    }));
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose anomaly-notification-wrapper.spec.ts
```

Atteso: FAIL — modulo non trovato.

- [ ] **Step 3: Creare `anomaly-notification-wrapper.ts`**

Creare il file `backend/src/anomaly-notification-wrapper.ts`:

```typescript
import type { OperationHandler } from './operations/operation-processor';
import type { CreateNotificationParams } from './services/notification-service';

type AnomalyNotifyFn = (params: CreateNotificationParams) => Promise<void>;

function withAnomalyNotification(
  handler: OperationHandler,
  syncName: string,
  notifyFn: AnomalyNotifyFn,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const result = await handler(context, data, userId, onProgress);
    const r = result as { success?: boolean; error?: string };
    if (r.success === false && r.error && !r.error.includes('stop')) {
      await notifyFn({
        target: 'admin',
        type: 'sync_anomaly',
        severity: 'error',
        title: `Anomalia sincronizzazione: ${syncName}`,
        body: r.error.slice(0, 300),
        data: { syncName, error: r.error },
      }).catch(() => {});
      throw new Error(r.error);
    }
    return result;
  };
}

export { withAnomalyNotification };
export type { AnomalyNotifyFn };
```

- [ ] **Step 4: Eseguire il test per verificare che passi**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose anomaly-notification-wrapper.spec.ts
```

Atteso: PASS — tutti e 4 i test.

- [ ] **Step 5: Aggiornare `main.ts` per usare la funzione estratta**

In `main.ts`:

**5a. Aggiungere l'import** nella sezione degli import esistenti:

```typescript
import { withAnomalyNotification } from './anomaly-notification-wrapper';
```

**5b. Rimuovere la closure inline** (righe 540-556 circa):

```typescript
  // Wraps a sync handler: if the result is a failure (not a user-requested stop), notifies admin.
  const withAnomalyNotification = (handler: OperationHandler, syncName: string): OperationHandler =>
    async (context, data, userId, onProgress) => {
      const result = await handler(context, data, userId, onProgress);
      const r = result as { success?: boolean; error?: string };
      if (r.success === false && r.error && !r.error.includes('stop')) {
        await createNotification(notificationDeps, {
          target: 'admin',
          type: 'sync_anomaly',
          severity: 'error',
          title: `Anomalia sincronizzazione: ${syncName}`,
          body: r.error.slice(0, 300),
          data: { syncName, error: r.error },
        }).catch(() => {});
      }
      return result;
    };
```

**5c. Aggiungere `notifyAdmin` helper** dopo la definizione di `notificationDeps` (riga ~505):

```typescript
  const notifyAdmin = (params: CreateNotificationParams) =>
    createNotification(notificationDeps, params);
```

**5d. Aggiornare le tre chiamate** a `withAnomalyNotification` per passare `notifyAdmin`:

```typescript
// riga ~720:
'sync-prices': withAnomalyNotification(createSyncPricesHandler({...}), 'Prezzi', notifyAdmin),

// riga ~744:
'sync-customers': withAnomalyNotification(createSyncCustomersHandler(...), 'Clienti', notifyAdmin),

// riga ~879:
'sync-products': withAnomalyNotification(createSyncProductsHandler(...), 'Prodotti', notifyAdmin),
```

**5e. Aggiungere l'import di `CreateNotificationParams`** nella riga dell'import esistente di `notification-service`:

```typescript
import { createNotification, type CreateNotificationParams } from './services/notification-service';
```

- [ ] **Step 6: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: nessun errore.

- [ ] **Step 7: Eseguire i test completi backend**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: PASS — tutti i test esistenti più i 4 nuovi.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/anomaly-notification-wrapper.ts \
        archibald-web-app/backend/src/anomaly-notification-wrapper.spec.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "fix(sync): withAnomalyNotification fa throw dopo notifica — circuit breaker ora conta i fallimenti"
```

---

## Task 5: Fix 3 — Python per-cycle resilience + TypeScript safety

### Parte A: Python

**Files:**
- Modify: `scripts/parse-products-pdf.py:124-175` (parse_streaming), `scripts/parse-products-pdf.py:362-397` (main)

- [ ] **Step 1: Aggiungere exception handling per-ciclo in `parse_streaming()`**

In `parse-products-pdf.py`, nel metodo `parse_streaming()`, wrappare l'intero corpo del `for cycle in range(cycles):` in un `try/except`:

```python
    def parse_streaming(self) -> Generator[ParsedProduct, None, None]:
        self.PAGES_PER_CYCLE = self._detect_cycle_size()
        print(f"Detected cycle size: {self.PAGES_PER_CYCLE} pages", file=sys.stderr)

        with pdfplumber.open(self.pdf_path) as pdf:
            total_pages = len(pdf.pages)
            cycles = total_pages // self.PAGES_PER_CYCLE

        for cycle in range(cycles):
            base_idx = cycle * self.PAGES_PER_CYCLE
            try:
                with pdfplumber.open(self.pdf_path) as pdf:
                    cycle_tables = []
                    for offset in range(self.PAGES_PER_CYCLE):
                        page_idx = base_idx + offset
                        if page_idx < total_pages:
                            page = pdf.pages[page_idx]
                            tables = page.extract_tables()
                            if tables:
                                if cycle == 0 and tables[0] and len(tables[0]) > 0:
                                    headers = [(h or '').strip() for h in tables[0][0]]
                                    rows_count = len(tables[0]) - 1
                                    print(f"DIAG_PAGE:{offset+1}/{self.PAGES_PER_CYCLE} headers={headers} rows={rows_count}", file=sys.stderr)
                                table_data = tables[0][1:] if len(tables[0]) > 1 else []
                                cycle_tables.append(table_data)
                            else:
                                cycle_tables.append([])
                        else:
                            cycle_tables.append([])

                products = self._parse_single_cycle(cycle_tables)
                for product in products:
                    yield product

                del cycle_tables
            except Exception as e:
                print(f"CYCLE_PARSE_ERROR:cycle={cycle} base_idx={base_idx} error={str(e)}", file=sys.stderr)
```

**Nota importante:** il `try` inizia su `with pdfplumber.open(...)` e il `except` è al livello del `for cycle`. Questo significa che un'eccezione in un singolo ciclo viene loggata su stderr e il parsing continua con il ciclo successivo.

- [ ] **Step 2: Aggiungere il guard 0-prodotti in `main()`**

In `parse-products-pdf.py`, nella funzione `main()`, dopo l'accumulo di `products_list` e PRIMA di costruire `output`, aggiungere:

```python
def main():
    if len(sys.argv) != 2:
        print(json.dumps({
            "error": "Usage: python3 parse-products-pdf-optimized.py <path-to-pdf>"
        }))
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        parser = ProductsPDFParserOptimized(pdf_path)

        products_list = []
        for product in parser.parse_streaming():
            products_list.append(asdict(product))

        if len(products_list) == 0:
            print(json.dumps({"error": "Parse produced 0 products — aborting to prevent catalog wipe"}))
            sys.exit(1)

        output = {
            "products": products_list,
            "count": len(products_list),
            "source": pdf_path,
        }

        print(json.dumps(output, indent=2, ensure_ascii=False))

    except FileNotFoundError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Parse failed: {str(e)}"}))
        sys.exit(1)
```

- [ ] **Step 3: Verificare la sintassi Python**

```bash
python3 -m py_compile scripts/parse-products-pdf.py && echo "OK"
```

Atteso: `OK` (nessun errore di sintassi).

- [ ] **Step 4: Commit Python**

```bash
git add scripts/parse-products-pdf.py
git commit -m "fix(parser): exception handling per-ciclo + guard 0-prodotti per prevenire catalog wipe"
```

---

### Parte B: TypeScript — fallback recovery CYCLE_SIZE_WARNING

**Files:**
- Modify: `backend/src/pdf-parser-products-service.ts:103-136`
- Create: `backend/src/pdf-parser-products-service.spec.ts`
- Modify: `backend/src/main.ts:881` (callback parsePdf in sync-products)

- [ ] **Step 5: Scrivere i test fallenti in `pdf-parser-products-service.spec.ts`**

Creare il file `backend/src/pdf-parser-products-service.spec.ts`:

```typescript
import { describe, expect, test, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';
import { PDFParserProductsService } from './pdf-parser-products-service';

function createMockProcess(exitCode: number, stdoutData: string, stderrData: string) {
  const proc = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  Object.assign(proc, { stdout, stderr });

  setImmediate(() => {
    if (stdoutData) stdout.emit('data', stdoutData);
    if (stderrData) stderr.emit('data', stderrData);
    proc.emit('close', exitCode);
  });

  return proc;
}

const validProductsJson = JSON.stringify({
  products: [{ id_articolo: 'P001', nome_articolo: 'Prodotto Test' }],
  count: 1,
  source: 'test.pdf',
});

const cycleSizeChangedWarning =
  'CYCLE_SIZE_WARNING:{"parser":"products","detected":5,"expected":8,"status":"CHANGED"}';

describe('PDFParserProductsService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance between tests
    (PDFParserProductsService as unknown as { instance: undefined }).instance = undefined;
  });

  describe('parsePDF', () => {
    test('rejects when Python exits non-zero with no CYCLE_SIZE_WARNING', async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess(1, JSON.stringify({ error: 'Parse failed: memory error' }), 'RuntimeError: out of memory') as never,
      );

      const service = PDFParserProductsService.getInstance();
      await expect(service.parsePDF('/tmp/test.pdf')).rejects.toThrow('Python script exited with code 1');
    });

    test('rejects when Python exits non-zero and stdout is empty despite CYCLE_SIZE_WARNING', async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess(1, '', cycleSizeChangedWarning) as never,
      );

      const service = PDFParserProductsService.getInstance();
      await expect(service.parsePDF('/tmp/test.pdf')).rejects.toThrow('Python script exited with code 1');
    });

    test('resolves with products when Python exits non-zero but CYCLE_SIZE_WARNING CHANGED with valid stdout', async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess(1, validProductsJson, cycleSizeChangedWarning) as never,
      );

      const service = PDFParserProductsService.getInstance();
      const products = await service.parsePDF('/tmp/test.pdf');

      expect(products).toEqual([{ id_articolo: 'P001', nome_articolo: 'Prodotto Test' }]);
    });

    test('records CHANGED warning in getLastWarnings after recovery', async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess(1, validProductsJson, cycleSizeChangedWarning) as never,
      );

      const service = PDFParserProductsService.getInstance();
      await service.parsePDF('/tmp/test.pdf');

      expect(service.getLastWarnings()).toEqual([{
        parser: 'products',
        detected: 5,
        expected: 8,
        status: 'CHANGED',
      }]);
    });
  });
});
```

- [ ] **Step 6: Eseguire i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose pdf-parser-products-service.spec.ts
```

Atteso: FAIL — i test del path di recovery falliscono perché `parsePDF` rifiuta sempre su exit code ≠ 0.

- [ ] **Step 7: Aggiornare `pdf-parser-products-service.ts` per gestire il fallback CYCLE_SIZE_WARNING**

In `pdf-parser-products-service.ts`, nel handler `python.on('close', (code) => {...})`, sostituire il branch `else` (righe 127-136):

```typescript
// PRIMA:
        } else {
          logger.error("[PDFParserProductsService] Python script failed", {
            code,
            stderr,
            duration,
          });
          reject(
            new Error(`Python script exited with code ${code}: ${stderr}`),
          );
        }
```

Con:

```typescript
        } else {
          const warnings = extractCycleSizeWarnings(stderr);
          const hasChanged = warnings.some((w) => w.status === "CHANGED");
          if (hasChanged) {
            try {
              const partial = JSON.parse(stdout) as { products: ParsedProduct[] };
              if (partial.products && partial.products.length > 0) {
                logger.warn(
                  `[PDFParserProductsService] Python exited non-zero but recovered ${partial.products.length} products via CYCLE_SIZE_WARNING fallback`,
                  { code, warnings },
                );
                this.lastWarnings = warnings;
                resolve(partial.products);
                return;
              }
            } catch {
              // stdout is not valid products JSON, fall through to reject
            }
          }
          logger.error("[PDFParserProductsService] Python script failed", {
            code,
            stderr,
            duration,
          });
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        }
```

- [ ] **Step 8: Eseguire i test per verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose pdf-parser-products-service.spec.ts
```

Atteso: PASS — tutti e 4 i test.

- [ ] **Step 9: Aggiornare la callback `parsePdf` in `main.ts` per creare notifica su CHANGED**

In `main.ts`, nel gestore `'sync-products'`, sostituire la callback `parsePdf` (riga 881):

```typescript
// PRIMA:
      async (pdfPath) => (await productsParser.parsePDF(pdfPath)).map(adaptProduct),
```

Con:

```typescript
      async (pdfPath) => {
        const rawProducts = await productsParser.parsePDF(pdfPath);
        for (const w of productsParser.getLastWarnings()) {
          if (w.status === 'CHANGED') {
            await createNotification(notificationDeps, {
              target: 'admin',
              type: 'sync_anomaly',
              severity: 'warning',
              title: 'Sync prodotti: layout PDF cambiato',
              body: `Ciclo rilevato: ${w.detected} pagine (attese: ${w.expected}). Colonne potrebbero essere cambiate.`,
              data: { warning: w },
            }).catch(() => {});
            break;
          }
        }
        return rawProducts.map(adaptProduct);
      },
```

- [ ] **Step 10: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: nessun errore.

- [ ] **Step 11: Eseguire i test completi backend**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: PASS — tutti i test.

- [ ] **Step 12: Commit**

```bash
git add archibald-web-app/backend/src/pdf-parser-products-service.ts \
        archibald-web-app/backend/src/pdf-parser-products-service.spec.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "fix(parser): fallback TypeScript su CYCLE_SIZE_WARNING CHANGED + notifica ciclo PDF cambiato"
```

---

## Verifica finale

- [ ] **Eseguire tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: PASS.

- [ ] **Build completo**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: nessun errore.

# Store-and-Deliver Document Downloads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminare l'errore "Nessun PDF ricevuto dal server" rendendo il download di DDT, fatture e note di credito robusto al riavvio di job, requeue e connessioni WebSocket instabili.

**Architecture:** Il bot scarica il PDF e lo salva in Redis con TTL 5 minuti, poi restituisce un `downloadKey` nel risultato del job invece del base64. Il frontend riceve la chiave dal JOB_COMPLETED, esegue `GET /api/documents/download/:key` (autenticato), e ottiene i byte direttamente. Un fix separato in `waitForJobViaWebSocket` intercetta `JOB_REQUEUED` e segue il nuovo `jobId`.

**Tech Stack:** ioredis (già installato), Express, BullMQ, React 19, TypeScript strict

---

## File Map

| Azione | File | Responsabilità |
|--------|------|----------------|
| Crea | `backend/src/services/document-store.ts` | Salva/recupera Buffer da Redis con TTL |
| Crea | `backend/src/services/document-store.spec.ts` | Unit test del document store |
| Crea | `backend/src/routes/documents.ts` | Route autenticata `GET /download/:key` |
| Modifica | `backend/src/operations/handlers/download-ddt-pdf.ts` | Accetta `DocumentStoreLike`, ritorna `downloadKey` |
| Modifica | `backend/src/operations/handlers/download-invoice-pdf.ts` | Accetta `DocumentStoreLike`, ritorna `downloadKey` |
| Modifica | `backend/src/server.ts` | Aggiunge `documentStore` a `AppDeps`, monta router |
| Modifica | `backend/src/main.ts` | Crea document store e passa a `createApp` |
| Modifica | `frontend/src/api/operations.ts` | Gestisce `JOB_REQUEUED` in `waitForJobViaWebSocket` |
| Modifica | `frontend/src/components/OrderCardNew.tsx` | Cambia download da base64 a fetch con chiave; fix `handleDownloadDDT` searchTerm bug |

---

## Task 1: Crea document store (Redis-based)

**Files:**
- Crea: `archibald-web-app/backend/src/services/document-store.ts`
- Crea: `archibald-web-app/backend/src/services/document-store.spec.ts`

- [ ] **Step 1: Scrivi il test fallente**

```typescript
// archibald-web-app/backend/src/services/document-store.spec.ts
import { describe, expect, test, vi } from 'vitest';
import { createDocumentStore } from './document-store';

const KEY_PREFIX = 'doc:download:';

describe('createDocumentStore', () => {
  test('save stores buffer in Redis with 5-minute TTL and returns a UUID key', async () => {
    const setex = vi.fn().mockResolvedValue('OK');
    const redis = { setex, getBuffer: vi.fn() } as never;
    const store = createDocumentStore(redis);
    const pdf = Buffer.from('fake-pdf-bytes');

    const key = await store.save(pdf, 'DDT_123');

    expect(key).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(setex).toHaveBeenCalledWith(
      `${KEY_PREFIX}${key}`,
      300,           // 5 minutes
      pdf,
    );
  });

  test('get returns buffer when key exists', async () => {
    const buffer = Buffer.from('pdf-data');
    const getBuffer = vi.fn().mockResolvedValue(buffer);
    const redis = { setex: vi.fn(), getBuffer } as never;
    const store = createDocumentStore(redis);
    const key = 'test-uuid';

    const result = await store.get(key);

    expect(getBuffer).toHaveBeenCalledWith(`${KEY_PREFIX}${key}`);
    expect(result).toBe(buffer);
  });

  test('get returns null when key does not exist', async () => {
    const getBuffer = vi.fn().mockResolvedValue(null);
    const redis = { setex: vi.fn(), getBuffer } as never;
    const store = createDocumentStore(redis);

    const result = await store.get('missing-key');

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui i test — devono fallire**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose document-store
```

Atteso: FAIL — `createDocumentStore` non esiste.

- [ ] **Step 3: Implementa il document store**

```typescript
// archibald-web-app/backend/src/services/document-store.ts
import { randomUUID } from 'crypto';

const DOC_TTL_SECONDS = 5 * 60; // 5 minutes
const KEY_PREFIX = 'doc:download:';

type RedisBinaryClient = {
  setex: (key: string, seconds: number, value: Buffer) => Promise<unknown>;
  getBuffer: (key: string) => Promise<Buffer | null>;
};

type DocumentStoreLike = {
  save: (pdf: Buffer, docName: string) => Promise<string>;
  get: (key: string) => Promise<Buffer | null>;
};

function createDocumentStore(redis: RedisBinaryClient): DocumentStoreLike {
  return {
    async save(pdf) {
      const key = randomUUID();
      await redis.setex(`${KEY_PREFIX}${key}`, DOC_TTL_SECONDS, pdf);
      return key;
    },
    async get(key) {
      return redis.getBuffer(`${KEY_PREFIX}${key}`);
    },
  };
}

export { createDocumentStore, type DocumentStoreLike, type RedisBinaryClient };
```

- [ ] **Step 4: Esegui i test — devono passare**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose document-store
```

Atteso: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/services/document-store.ts archibald-web-app/backend/src/services/document-store.spec.ts
git commit -m "feat(documents): add Redis-based document store with 5-min TTL"
```

---

## Task 2: Modifica handler DDT per usare document store

**Files:**
- Modifica: `archibald-web-app/backend/src/operations/handlers/download-ddt-pdf.ts`

- [ ] **Step 1: Scrivi il test fallente**

Il file di test esiste già. Leggi `download-ddt-pdf.spec.ts` se presente (cerca con glob), altrimenti crea:

```typescript
// archibald-web-app/backend/src/operations/handlers/download-ddt-pdf.spec.ts
import { describe, expect, test, vi } from 'vitest';
import { handleDownloadDdtPdf } from './download-ddt-pdf';

describe('handleDownloadDdtPdf', () => {
  test('salva il PDF nel document store e ritorna il downloadKey', async () => {
    const pdfBuffer = Buffer.from('fake-ddt-pdf');
    const downloadKey = 'abc-uuid';

    const bot = {
      downloadDDTPDF: vi.fn().mockResolvedValue(pdfBuffer),
      setProgressCallback: vi.fn(),
    };
    const documentStore = {
      save: vi.fn().mockResolvedValue(downloadKey),
      get: vi.fn(),
    };
    const onProgress = vi.fn();

    const result = await handleDownloadDdtPdf(
      bot,
      documentStore,
      { orderId: 'ORD/123', searchTerm: 'DDT/456' },
      'user1',
      onProgress,
    );

    expect(bot.downloadDDTPDF).toHaveBeenCalledWith('ORD/123', 'DDT/456');
    expect(documentStore.save).toHaveBeenCalledWith(pdfBuffer, 'DDT/456');
    expect(result).toEqual({ downloadKey });
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose download-ddt-pdf
```

Atteso: FAIL — `handleDownloadDdtPdf` ha firma diversa.

- [ ] **Step 3: Modifica l'handler DDT**

```typescript
// archibald-web-app/backend/src/operations/handlers/download-ddt-pdf.ts
import type { OperationHandler } from '../operation-processor';
import type { DocumentStoreLike } from '../../services/document-store';

type DownloadDdtPdfData = {
  orderId: string;
  ddtNumber?: string;
  searchTerm?: string;
};

type DownloadDdtPdfBot = {
  downloadDDTPDF: (orderId: string, ddtNumber: string) => Promise<Buffer>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleDownloadDdtPdf(
  bot: DownloadDdtPdfBot,
  documentStore: DocumentStoreLike,
  data: DownloadDdtPdfData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ downloadKey: string }> {
  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  const docName = data.searchTerm ?? data.ddtNumber ?? data.orderId;
  onProgress(10, 'Download DDT PDF');
  const pdf = await bot.downloadDDTPDF(data.orderId, docName);

  onProgress(80, 'Salvataggio documento');
  const downloadKey = await documentStore.save(pdf, docName);

  onProgress(100, 'Download completato');
  return { downloadKey };
}

function createDownloadDdtPdfHandler(
  createBot: (userId: string) => DownloadDdtPdfBot,
  documentStore: DocumentStoreLike,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as DownloadDdtPdfData;
    return handleDownloadDdtPdf(bot, documentStore, typedData, userId, onProgress);
  };
}

export { handleDownloadDdtPdf, createDownloadDdtPdfHandler, type DownloadDdtPdfData, type DownloadDdtPdfBot };
```

- [ ] **Step 4: Esegui test e type-check**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose download-ddt-pdf
npm run build --prefix archibald-web-app/backend
```

Atteso: PASS test, PASS build (errori di tipo su main.ts per firma factory cambiata — normali, risolti nel Task 5).

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/download-ddt-pdf.ts archibald-web-app/backend/src/operations/handlers/download-ddt-pdf.spec.ts
git commit -m "feat(handlers): download-ddt-pdf stores PDF in document store, returns downloadKey"
```

---

## Task 3: Modifica handler fatture per usare document store

**Files:**
- Modifica: `archibald-web-app/backend/src/operations/handlers/download-invoice-pdf.ts`

- [ ] **Step 1: Scrivi il test fallente**

```typescript
// archibald-web-app/backend/src/operations/handlers/download-invoice-pdf.spec.ts
import { describe, expect, test, vi } from 'vitest';
import { handleDownloadInvoicePdf } from './download-invoice-pdf';

describe('handleDownloadInvoicePdf', () => {
  test('salva il PDF nel document store e ritorna il downloadKey', async () => {
    const pdfBuffer = Buffer.from('fake-invoice-pdf');
    const downloadKey = 'def-uuid';

    const bot = {
      downloadInvoicePDF: vi.fn().mockResolvedValue(pdfBuffer),
      setProgressCallback: vi.fn(),
    };
    const documentStore = {
      save: vi.fn().mockResolvedValue(downloadKey),
      get: vi.fn(),
    };
    const onProgress = vi.fn();

    const result = await handleDownloadInvoicePdf(
      bot,
      documentStore,
      { orderId: 'ORD/123', searchTerm: 'FT/789' },
      'user1',
      onProgress,
    );

    expect(bot.downloadInvoicePDF).toHaveBeenCalledWith('ORD/123', 'FT/789');
    expect(documentStore.save).toHaveBeenCalledWith(pdfBuffer, 'FT/789');
    expect(result).toEqual({ downloadKey });
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose download-invoice-pdf
```

Atteso: FAIL.

- [ ] **Step 3: Modifica l'handler fatture (pattern identico al DDT)**

```typescript
// archibald-web-app/backend/src/operations/handlers/download-invoice-pdf.ts
import type { OperationHandler } from '../operation-processor';
import type { DocumentStoreLike } from '../../services/document-store';

type DownloadInvoicePdfData = {
  orderId: string;
  invoiceNumber?: string;
  searchTerm?: string;
};

type DownloadInvoicePdfBot = {
  downloadInvoicePDF: (orderId: string, invoiceNumber: string) => Promise<Buffer>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleDownloadInvoicePdf(
  bot: DownloadInvoicePdfBot,
  documentStore: DocumentStoreLike,
  data: DownloadInvoicePdfData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ downloadKey: string }> {
  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  const docName = data.searchTerm ?? data.invoiceNumber ?? data.orderId;
  onProgress(10, 'Download fattura PDF');
  const pdf = await bot.downloadInvoicePDF(data.orderId, docName);

  onProgress(80, 'Salvataggio documento');
  const downloadKey = await documentStore.save(pdf, docName);

  onProgress(100, 'Download completato');
  return { downloadKey };
}

function createDownloadInvoicePdfHandler(
  createBot: (userId: string) => DownloadInvoicePdfBot,
  documentStore: DocumentStoreLike,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as DownloadInvoicePdfData;
    return handleDownloadInvoicePdf(bot, documentStore, typedData, userId, onProgress);
  };
}

export { handleDownloadInvoicePdf, createDownloadInvoicePdfHandler, type DownloadInvoicePdfData, type DownloadInvoicePdfBot };
```

- [ ] **Step 4: Esegui test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose download-invoice-pdf
```

Atteso: PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/download-invoice-pdf.ts archibald-web-app/backend/src/operations/handlers/download-invoice-pdf.spec.ts
git commit -m "feat(handlers): download-invoice-pdf stores PDF in document store, returns downloadKey"
```

---

## Task 4: Aggiungi route autenticata per il download

**Files:**
- Crea: `archibald-web-app/backend/src/routes/documents.ts`
- Modifica: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Crea la route documents**

```typescript
// archibald-web-app/backend/src/routes/documents.ts
import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { DocumentStoreLike } from '../services/document-store';
import { logger } from '../logger';

type DocumentsRouterDeps = {
  documentStore: DocumentStoreLike;
};

function createDocumentsRouter(deps: DocumentsRouterDeps) {
  const { documentStore } = deps;
  const router = Router();

  router.get('/download/:key', async (req: AuthRequest, res) => {
    const { key } = req.params;

    try {
      const buffer = await documentStore.get(key);

      if (!buffer) {
        return res.status(404).json({ success: false, error: 'Documento non trovato o scaduto' });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${key}.pdf"`);
      res.send(buffer);
    } catch (error) {
      logger.error('Failed to retrieve document', { key, error });
      res.status(500).json({ success: false, error: 'Errore nel recupero del documento' });
    }
  });

  return router;
}

export { createDocumentsRouter, type DocumentsRouterDeps };
```

- [ ] **Step 2: Aggiungi `documentStore` a `AppDeps` in server.ts**

In `server.ts`, aggiungi la dipendenza al tipo `AppDeps`:

Trova il blocco (linea ~149):
```typescript
  redis?: RedisClient;
```

Sostituisci con:
```typescript
  redis?: RedisClient;
  documentStore?: DocumentStoreLike;
```

E aggiungi l'import in cima al file (dopo gli import esistenti dei services):
```typescript
import type { DocumentStoreLike } from './services/document-store';
import { createDocumentsRouter } from './routes/documents';
```

- [ ] **Step 3: Monta il router in server.ts**

Cerca l'area dove sono montati i router (intorno a linea 1043, dopo `/api/share`), aggiungi:
```typescript
  if (deps.documentStore) {
    app.use('/api/documents', authenticate, createDocumentsRouter({ documentStore: deps.documentStore }));
  }
```

Inserisci subito dopo il blocco `/api/share`:
```typescript
  app.use('/api/share', (req, res, next) => { ... }); // esistente

  // Aggiungi qui:
  if (deps.documentStore) {
    app.use('/api/documents', authenticate, createDocumentsRouter({ documentStore: deps.documentStore }));
  }
```

- [ ] **Step 4: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: errori solo su main.ts (dove `createDownloadDdtPdfHandler` e `createDownloadInvoicePdfHandler` mancano del secondo argomento). Tutti gli altri file OK.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/documents.ts archibald-web-app/backend/src/server.ts
git commit -m "feat(routes): add authenticated GET /api/documents/download/:key"
```

---

## Task 5: Wiring in main.ts

**Files:**
- Modifica: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiungi import del document store**

In cima a `main.ts`, vicino agli altri import dei services:
```typescript
import { createDocumentStore } from './services/document-store';
```

- [ ] **Step 2: Crea l'istanza del document store**

Dopo la creazione di `sharedRedisClient` (linea ~121):
```typescript
const sharedRedisClient = createRedisClient();
// Aggiungi subito dopo:
const documentStore = createDocumentStore(sharedRedisClient);
```

- [ ] **Step 3: Passa documentStore a createApp**

Trova il blocco `const app = createApp({` (linea ~443), aggiungi:
```typescript
const app = createApp({
  pool,
  queue,
  agentLock,
  browserPool,
  syncScheduler,
  wsServer,
  passwordCache,
  pdfStore,
  generateJWT,
  verifyToken: verifyJWT,
  sendEmail,
  uploadToDropbox,
  onJobEvent: jobEventBus.onJobEvent,
  createCustomerBot: (userId) => createBotForUser(userId),
  broadcast: (userId, msg) => wsServer.broadcast(userId, msg),
  onLoginSuccess: (userId) => { ... },
  getCircuitBreakerStatus: () => circuitBreaker.getAllStatus(),
  redis: sharedRedisClient,
  documentStore,            // ← aggiunto
  sendSecurityAlert: (event, details) => securityAlertService.send(event, details),
  catalogVisionService,
  embeddingSvc,
  catalogPdf,
  recognitionDailyLimit: config.recognition.dailyLimit,
  recognitionTimeoutMs: config.recognition.timeoutMs,
  recognitionMinSimilarity: config.recognition.minSimilarity,
});
```

- [ ] **Step 4: Passa documentStore ai due handler**

Trova i blocchi `'download-ddt-pdf': createDownloadDdtPdfHandler(...)` (linea ~743) e `'download-invoice-pdf': createDownloadInvoicePdfHandler(...)` (linea ~760).

Per DDT (linea ~743-759):
```typescript
'download-ddt-pdf': createDownloadDdtPdfHandler((userId) => {
  const bot = createBotForUser(userId);
  return {
    downloadDDTPDF: async (_orderId, ddtNumber) => {
      const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
      let contextHealthy = false;
      try {
        const result = await bot.downloadSingleDDTPDF(ctx as unknown as BrowserContext, ddtNumber);
        contextHealthy = true;
        return result;
      } finally {
        await browserPool.releaseContext(userId, ctx as never, contextHealthy);
      }
    },
    setProgressCallback: (cb) => bot.setProgressCallback(cb),
  };
}, documentStore),   // ← secondo argomento aggiunto
```

Per Invoice (linea ~760-776):
```typescript
'download-invoice-pdf': createDownloadInvoicePdfHandler((userId) => {
  const bot = createBotForUser(userId);
  return {
    downloadInvoicePDF: async (_orderId, invoiceNumber) => {
      const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
      let contextHealthy = false;
      try {
        const result = await bot.downloadSingleInvoicePDF(ctx as unknown as BrowserContext, invoiceNumber);
        contextHealthy = true;
        return result;
      } finally {
        await browserPool.releaseContext(userId, ctx as never, contextHealthy);
      }
    },
    setProgressCallback: (cb) => bot.setProgressCallback(cb),
  };
}, documentStore),   // ← secondo argomento aggiunto
```

- [ ] **Step 5: Type-check completo backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: build OK senza errori di tipo.

- [ ] **Step 6: Esegui test backend**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: tutti i test passano.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/main.ts
git commit -m "feat(main): wire document store to download handlers and createApp"
```

---

## Task 6: Fix JOB_REQUEUED in waitForJobViaWebSocket

**Files:**
- Modifica: `archibald-web-app/frontend/src/api/operations.ts`

Quando un job viene rimesso in coda (`JOB_REQUEUED`), il frontend attende il `jobId` originale che ha già result `{ requeued: true }`. Il fix: subscribi a `JOB_REQUEUED` e re-inizia l'attesa sul `newJobId`.

- [ ] **Step 1: Scrivi il test fallente**

Aggiungi in `operations.spec.ts` (crea se non esiste):

```typescript
// archibald-web-app/frontend/src/api/operations.spec.ts
import { describe, expect, test, vi } from 'vitest';
import { waitForJobViaWebSocket } from './operations';

describe('waitForJobViaWebSocket', () => {
  test('segue il nuovo jobId quando JOB_REQUEUED arriva per il jobId originale', async () => {
    const originalJobId = 'job-1';
    const newJobId = 'job-2';
    const downloadKey = 'abc-key';

    const callbacks: Record<string, Array<(payload: unknown) => void>> = {};

    const subscribe = vi.fn((eventType: string, cb: (payload: unknown) => void) => {
      callbacks[eventType] = callbacks[eventType] ?? [];
      callbacks[eventType].push(cb);
      return () => {};
    });

    const fire = (eventType: string, payload: unknown) => {
      for (const cb of callbacks[eventType] ?? []) cb(payload);
    };

    // Aspetta che waitForJobViaWebSocket registri i listener, poi simula gli eventi
    setTimeout(() => {
      // Arriva JOB_REQUEUED per il job originale
      fire('JOB_REQUEUED', { originalJobId, newJobId, type: 'download-ddt-pdf' });
      // Il nuovo job completa con downloadKey
      setTimeout(() => {
        fire('JOB_COMPLETED', { jobId: newJobId, result: { downloadKey } });
      }, 10);
    }, 10);

    const result = await waitForJobViaWebSocket(originalJobId, {
      subscribe,
      wsFallbackMs: 5000,
      maxWaitMs: 5000,
      skipSafetyPoll: true,
    });

    expect(result).toEqual({ downloadKey });
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose operations
```

Atteso: FAIL — il test non risolve (timeout) o risolve con risultato sbagliato.

- [ ] **Step 3: Aggiungi gestione JOB_REQUEUED in waitForJobViaWebSocket**

In `operations.ts`, all'interno di `waitForJobViaWebSocket`, dopo l'ultima riga `unsubscribers.push(subscribe('JOB_FAILED', handleEvent('JOB_FAILED')));` (linea ~292), aggiungi:

```typescript
    unsubscribers.push(subscribe('JOB_REQUEUED', (payload) => {
      if (resolved) return;
      const p = (payload ?? {}) as Record<string, unknown>;
      if (p.originalJobId !== jobId) return;

      markWsActive();

      const newJobId = p.newJobId as string;
      waitForJobViaWebSocket(newJobId, options)
        .then((result) => { if (!resolved) { cleanup(); resolve(result); } })
        .catch((err) => { if (!resolved) { cleanup(); reject(err); } });
    }));
```

- [ ] **Step 4: Esegui test frontend**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose operations
```

Atteso: PASS.

- [ ] **Step 5: Esegui type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: OK.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/api/operations.ts archibald-web-app/frontend/src/api/operations.spec.ts
git commit -m "fix(operations): follow newJobId when JOB_REQUEUED is received"
```

---

## Task 7: Fix frontend download flow e bug handleDownloadDDT

**Files:**
- Modifica: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`

Due cambiamenti:
1. `downloadPdfWithProgress`: sostituisce decode base64 con `fetch /api/documents/download/:key`
2. `handleDownloadDDT`: passa `ddt?.ddtNumber` come `searchTerm` (fix bug — attualmente passa `order.orderNumber`)

- [ ] **Step 1: Modifica `downloadPdfWithProgress` in OrderCardNew.tsx**

Trova la funzione `downloadPdfWithProgress` (intorno a linea 3974). Cambia due cose:

**A) Rimuovi il prefisso `_` dal parametro `token`** (riga ~3977):
```typescript
// Da:
function downloadPdfWithProgress(
  orderId: string,
  type: "invoice" | "ddt",
  _token: string,
// A:
function downloadPdfWithProgress(
  orderId: string,
  type: "invoice" | "ddt",
  token: string,
```

**B) Sostituisci il blocco di decode base64 e trigger download** (linee ~4012-4035):

```typescript
// Da:
      const resultData = (result.data ?? result) as Record<string, unknown>;
      const pdfBase64 = resultData.pdf as string;
      if (!pdfBase64) {
        onError("Nessun PDF ricevuto dal server");
        return;
      }

      onProgress("Download completato!", 100);

      const byteCharacters = atob(pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${type === "ddt" ? "DDT" : docLabel ?? "Fattura"}_${orderId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(downloadUrl);

// A:
      const resultData = (result.data ?? result) as Record<string, unknown>;
      const downloadKey = resultData.downloadKey as string;
      if (!downloadKey) {
        onError("Nessun documento ricevuto dal server");
        return;
      }

      onProgress("Download documento...", 95);

      const pdfResponse = await fetch(`/api/documents/download/${downloadKey}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!pdfResponse.ok) {
        onError("Errore nel download del documento");
        return;
      }

      onProgress("Download completato!", 100);

      const arrayBuffer = await pdfResponse.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${type === "ddt" ? "DDT" : docLabel ?? "Fattura"}_${orderId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
```

- [ ] **Step 2: Fix `handleDownloadDDT` — passa ddt.ddtNumber come searchTerm**

Trova `handleDownloadDDT` (intorno a linea 2886). La chiamata a `downloadPdfWithProgress` è:

```typescript
    downloadPdfWithProgress(
      order.orderNumber || order.id,
      "ddt",
      token,
      (stage, percent) => setDdtProgress({ active: true, percent, stage }),
      () =>
        setTimeout(
          () => setDdtProgress({ active: false, percent: 0, stage: "" }),
          1500,
        ),
      (error) => {
        setDdtError(error);
        setDdtProgress({ active: false, percent: 0, stage: "" });
      },
      subscribe,
      undefined,
      (jobId) => trackOperation(order.id, jobId, order.customerName || order.id, 'Download DDT...'),
    );
```

Sostituisci con (aggiunto solo `ddt?.ddtNumber` come decimo argomento `searchTerm`):

```typescript
    downloadPdfWithProgress(
      order.orderNumber || order.id,
      "ddt",
      token,
      (stage, percent) => setDdtProgress({ active: true, percent, stage }),
      () =>
        setTimeout(
          () => setDdtProgress({ active: false, percent: 0, stage: "" }),
          1500,
        ),
      (error) => {
        setDdtError(error);
        setDdtProgress({ active: false, percent: 0, stage: "" });
      },
      subscribe,
      undefined,
      (jobId) => trackOperation(order.id, jobId, order.customerName || order.id, 'Download DDT...'),
      ddt?.ddtNumber,
    );
```

- [ ] **Step 3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: OK.

- [ ] **Step 4: Test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Atteso: PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "fix(downloads): fetch PDF via downloadKey, fix DDT searchTerm bug"
```

---

## Task 8: Verifica finale e gate CI

- [ ] **Step 1: Build backend completo**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: OK senza errori.

- [ ] **Step 2: Test backend completo**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: tutti i test passano.

- [ ] **Step 3: Type-check frontend completo**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: OK.

- [ ] **Step 4: Test frontend completo**

```bash
npm test --prefix archibald-web-app/frontend
```

Atteso: tutti i test passano.

---

## Self-Review

### Spec coverage

| Requisito | Task |
|-----------|------|
| Bot salva PDF in Redis + ritorna `downloadKey` (DDT) | Task 1 + 2 + 5 |
| Bot salva PDF in Redis + ritorna `downloadKey` (Fatture/NC) | Task 1 + 3 + 5 |
| Route `GET /api/documents/download/:key` autenticata | Task 4 |
| Frontend fetch PDF via chiave (non base64) | Task 7 |
| JOB_REQUEUED: frontend segue il nuovo job | Task 6 |
| Fix bug `handleDownloadDDT` searchTerm | Task 7 |

### Type consistency

- `DocumentStoreLike.save(pdf: Buffer, docName: string): Promise<string>` — usato uguale in Task 1, 2, 3
- `DocumentStoreLike.get(key: string): Promise<Buffer | null>` — usato uguale in Task 1, 4
- `createDownloadDdtPdfHandler(createBot, documentStore)` — firma Task 2 = wiring Task 5 ✓
- `createDownloadInvoicePdfHandler(createBot, documentStore)` — firma Task 3 = wiring Task 5 ✓
- `waitForJobViaWebSocket` aggiunge listener senza cambiare la firma pubblica ✓

### Note di credito

Le NC usano `download-invoice-pdf` con `searchTerm = 'NC/XXXXX'` — coperte automaticamente dal Task 3.

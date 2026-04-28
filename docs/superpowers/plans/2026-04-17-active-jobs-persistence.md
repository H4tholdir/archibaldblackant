# Active Jobs Persistence — Banner Bot per Tutti i Tipi di Operazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dopo un ricaricamento della pagina, il banner di progresso del bot riappare per QUALSIASI operazione bot in volo (non solo `submit-order`).

**Architecture:** Nuova tabella `system.active_jobs` nel DB PostgreSQL. `onJobStarted` in main.ts fa INSERT per tutti i 10 tipi BullMQ tracciati. `onJobCompleted`/`onJobFailed` fanno DELETE. `GET /api/active-jobs` espone i job attivi dell'utente. `OperationTrackingContext` usa `getActiveJobs()` per il recovery al mount invece di `getPendingOrders()`.

**Tech Stack:** PostgreSQL, Express, TypeScript strict, React 19, Vitest, Testing Library

**Nota importante su `create-customer`:** Questo tipo usa una sessione interattiva sincrona (non BullMQ), con un `randomUUID()` come taskId. Non passa per `onJobStarted`. Viene coperto via due callback opzionali (`recordJobStarted`/`recordJobFinished`) nei deps del route `customer-interactive`.

**Tipi coperti (11 totali):** 10 BullMQ (`submit-order`, `send-to-verona`, `delete-order`, `edit-order`, `update-customer`, `batch-delete-orders`, `batch-send-to-verona`, `read-vat-status`, `download-ddt-pdf`, `download-invoice-pdf`) + 1 interattivo (`create-customer` via route)

---

## File Structure

| File | Azione | Responsabilità |
|------|--------|----------------|
| `backend/src/db/migrations/062-active-jobs.sql` | CREATE | Schema tabella `system.active_jobs` |
| `backend/src/db/repositories/active-jobs.ts` | CREATE | CRUD: insert/delete/getByUserId/deleteStale |
| `backend/src/db/repositories/active-jobs.spec.ts` | CREATE | Test integrazione repository |
| `backend/src/routes/active-jobs.ts` | CREATE | Route `GET /api/active-jobs` |
| `backend/src/routes/active-jobs.spec.ts` | CREATE | Test route |
| `backend/src/operations/operation-processor.ts` | MODIFY | Aggiunge `onJobCompleted`, aggiunge `jobId` a `onJobFailed` |
| `backend/src/routes/orders.ts` | MODIFY | Aggiunge `customerName` all'enqueue data di `send-to-verona` |
| `backend/src/main.ts` | MODIFY | Aggiorna onJobStarted/onJobCompleted/onJobFailed, aggiunge cleanup interval, include download types |
| `backend/src/server.ts` | MODIFY | Monta route `/api/active-jobs` |
| `frontend/src/api/operations.ts` | MODIFY | Aggiunge `getActiveJobs()` |
| `frontend/src/contexts/OperationTrackingContext.tsx` | MODIFY | Recovery usa `getActiveJobs` invece di `getPendingOrders` |
| `frontend/src/contexts/OperationTrackingContext.spec.tsx` | MODIFY | Aggiorna test recovery |

---

## Task 1: Migration 062 — `system.active_jobs`

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/062-active-jobs.sql`

- [ ] **Step 1: Scrivi il file SQL**

```sql
-- Migration 062: Active jobs persistence
-- Tracks in-flight BullMQ bot operations so the frontend banner
-- can recover after page reload without relying on operation-specific DB columns.

CREATE TABLE IF NOT EXISTS system.active_jobs (
  job_id      TEXT        PRIMARY KEY,
  type        TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,
  entity_id   TEXT        NOT NULL,
  entity_name TEXT        NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_jobs_user_id ON system.active_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_active_jobs_started_at ON system.active_jobs(started_at);
```

- [ ] **Step 2: Verifica che il file esista e sia leggibile**

```bash
cat archibald-web-app/backend/src/db/migrations/062-active-jobs.sql
```

Expected: contenuto SQL identico a sopra.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/062-active-jobs.sql
git commit -m "feat(db): migration 062 — system.active_jobs per persistenza banner bot"
```

---

## Task 2: Repository `active-jobs.ts`

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/active-jobs.ts`
- Create: `archibald-web-app/backend/src/db/repositories/active-jobs.spec.ts`

- [ ] **Step 1: Scrivi il test failing**

Crea `archibald-web-app/backend/src/db/repositories/active-jobs.spec.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createPool } from '../pool';
import { runMigrations, loadMigrationFiles } from '../migrate';
import path from 'path';
import {
  insertActiveJob,
  deleteActiveJob,
  getActiveJobsByUserId,
  deleteStaleActiveJobs,
} from './active-jobs';

const pool = createPool({
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5432),
  database: process.env.PG_DATABASE ?? 'archibald_test',
  user: process.env.PG_USER ?? 'archibald',
  password: process.env.PG_PASSWORD ?? 'archibald',
});

async function cleanTable() {
  await pool.query("DELETE FROM system.active_jobs");
}

describe('active-jobs repository', () => {
  beforeEach(async () => {
    const migrationsDir = path.resolve(__dirname, '../migrations');
    const migrations = loadMigrationFiles(migrationsDir);
    await runMigrations(pool, migrations);
    await cleanTable();
  });

  afterEach(async () => {
    await cleanTable();
  });

  describe('insertActiveJob', () => {
    test('inserisce un record recuperabile per userId', async () => {
      await insertActiveJob(pool, {
        jobId: 'job-1',
        type: 'submit-order',
        userId: 'user-1',
        entityId: 'order-1',
        entityName: 'Mario Rossi',
      });

      const jobs = await getActiveJobsByUserId(pool, 'user-1');
      expect(jobs).toEqual([
        expect.objectContaining({
          jobId: 'job-1',
          type: 'submit-order',
          userId: 'user-1',
          entityId: 'order-1',
          entityName: 'Mario Rossi',
        }),
      ]);
    });

    test('non inserisce duplicati — ON CONFLICT DO NOTHING', async () => {
      await insertActiveJob(pool, {
        jobId: 'job-dup',
        type: 'submit-order',
        userId: 'user-1',
        entityId: 'order-1',
        entityName: 'Mario Rossi',
      });
      await insertActiveJob(pool, {
        jobId: 'job-dup',
        type: 'submit-order',
        userId: 'user-1',
        entityId: 'order-1',
        entityName: 'Mario Rossi (aggiornato)',
      });

      const jobs = await getActiveJobsByUserId(pool, 'user-1');
      expect(jobs).toHaveLength(1);
    });
  });

  describe('deleteActiveJob', () => {
    test('elimina il record per jobId', async () => {
      await insertActiveJob(pool, {
        jobId: 'job-del',
        type: 'delete-order',
        userId: 'user-2',
        entityId: 'order-99',
        entityName: 'Luigi Verdi',
      });

      await deleteActiveJob(pool, 'job-del');

      const jobs = await getActiveJobsByUserId(pool, 'user-2');
      expect(jobs).toEqual([]);
    });

    test('è idempotente quando il record non esiste', async () => {
      await expect(deleteActiveJob(pool, 'non-existent')).resolves.toBeUndefined();
    });
  });

  describe('getActiveJobsByUserId', () => {
    test('restituisce solo i job dello userId richiesto', async () => {
      await insertActiveJob(pool, { jobId: 'j-a', type: 'submit-order', userId: 'user-A', entityId: 'e1', entityName: 'A' });
      await insertActiveJob(pool, { jobId: 'j-b', type: 'send-to-verona', userId: 'user-B', entityId: 'e2', entityName: 'B' });

      const jobsA = await getActiveJobsByUserId(pool, 'user-A');
      expect(jobsA).toEqual([expect.objectContaining({ jobId: 'j-a', userId: 'user-A' })]);

      const jobsB = await getActiveJobsByUserId(pool, 'user-B');
      expect(jobsB).toEqual([expect.objectContaining({ jobId: 'j-b', userId: 'user-B' })]);
    });

    test('restituisce array vuoto se non ci sono job', async () => {
      const jobs = await getActiveJobsByUserId(pool, 'user-nessuno');
      expect(jobs).toEqual([]);
    });
  });

  describe('deleteStaleActiveJobs', () => {
    test('elimina record più vecchi di N ms', async () => {
      await pool.query(`
        INSERT INTO system.active_jobs (job_id, type, user_id, entity_id, entity_name, started_at)
        VALUES ('job-old', 'edit-order', 'user-1', 'e1', 'Test', NOW() - INTERVAL '3 hours')
      `);
      await insertActiveJob(pool, { jobId: 'job-new', type: 'edit-order', userId: 'user-1', entityId: 'e2', entityName: 'Test' });

      const deleted = await deleteStaleActiveJobs(pool, 2 * 60 * 60 * 1000);

      expect(deleted).toBe(1);
      const remaining = await getActiveJobsByUserId(pool, 'user-1');
      expect(remaining).toEqual([expect.objectContaining({ jobId: 'job-new' })]);
    });
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- active-jobs.spec
```

Expected: FAIL — `active-jobs.ts` non esiste ancora.

- [ ] **Step 3: Implementa il repository**

Crea `archibald-web-app/backend/src/db/repositories/active-jobs.ts`:

```typescript
import type { DbPool } from '../pool';

type ActiveJob = {
  jobId: string;
  type: string;
  userId: string;
  entityId: string;
  entityName: string;
  startedAt: string;
};

type InsertActiveJobParams = {
  jobId: string;
  type: string;
  userId: string;
  entityId: string;
  entityName: string;
};

async function insertActiveJob(pool: DbPool, params: InsertActiveJobParams): Promise<void> {
  await pool.query(
    `INSERT INTO system.active_jobs (job_id, type, user_id, entity_id, entity_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (job_id) DO NOTHING`,
    [params.jobId, params.type, params.userId, params.entityId, params.entityName],
  );
}

async function deleteActiveJob(pool: DbPool, jobId: string): Promise<void> {
  await pool.query('DELETE FROM system.active_jobs WHERE job_id = $1', [jobId]);
}

async function getActiveJobsByUserId(pool: DbPool, userId: string): Promise<ActiveJob[]> {
  const result = await pool.query<{
    job_id: string;
    type: string;
    user_id: string;
    entity_id: string;
    entity_name: string;
    started_at: Date;
  }>(
    'SELECT job_id, type, user_id, entity_id, entity_name, started_at FROM system.active_jobs WHERE user_id = $1 ORDER BY started_at ASC',
    [userId],
  );
  return result.rows.map((row) => ({
    jobId: row.job_id,
    type: row.type,
    userId: row.user_id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    startedAt: row.started_at.toISOString(),
  }));
}

async function deleteStaleActiveJobs(pool: DbPool, olderThanMs: number): Promise<number> {
  const result = await pool.query(
    'DELETE FROM system.active_jobs WHERE started_at < NOW() - ($1 || \' milliseconds\')::INTERVAL',
    [olderThanMs],
  );
  return result.rowCount ?? 0;
}

export {
  insertActiveJob,
  deleteActiveJob,
  getActiveJobsByUserId,
  deleteStaleActiveJobs,
  type ActiveJob,
  type InsertActiveJobParams,
};
```

- [ ] **Step 4: Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/backend -- active-jobs.spec
```

Expected: PASS — tutti i test del describe passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/active-jobs.ts archibald-web-app/backend/src/db/repositories/active-jobs.spec.ts
git commit -m "feat(backend): repository active-jobs — insert/delete/getByUserId/deleteStale"
```

---

## Task 3: Route `GET /api/active-jobs`

**Files:**
- Create: `archibald-web-app/backend/src/routes/active-jobs.ts`
- Create: `archibald-web-app/backend/src/routes/active-jobs.spec.ts`

- [ ] **Step 1: Scrivi il test failing**

Crea `archibald-web-app/backend/src/routes/active-jobs.spec.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createActiveJobsRouter } from './active-jobs';
import type { AuthRequest } from '../middleware/auth';
import type { ActiveJob } from '../db/repositories/active-jobs';

const mockGetActiveJobsByUserId = vi.fn<(pool: unknown, userId: string) => Promise<ActiveJob[]>>();

vi.mock('../db/repositories/active-jobs', () => ({
  getActiveJobsByUserId: (...args: Parameters<typeof mockGetActiveJobsByUserId>) =>
    mockGetActiveJobsByUserId(...args),
}));

function buildApp(userId = 'user-test') {
  const app = express();
  app.use((req, _res, next) => {
    (req as AuthRequest).user = { userId, username: 'test', role: 'agent' };
    next();
  });
  app.use('/api/active-jobs', createActiveJobsRouter({ pool: {} as never }));
  return app;
}

describe('GET /api/active-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('restituisce i job attivi per l\'utente autenticato', async () => {
    const fakeJobs: ActiveJob[] = [
      { jobId: 'j1', type: 'submit-order', userId: 'user-test', entityId: 'order-1', entityName: 'Mario Rossi', startedAt: '2026-01-01T00:00:00.000Z' },
    ];
    mockGetActiveJobsByUserId.mockResolvedValueOnce(fakeJobs);

    const res = await request(buildApp()).get('/api/active-jobs');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, jobs: fakeJobs });
    expect(mockGetActiveJobsByUserId).toHaveBeenCalledWith(expect.anything(), 'user-test');
  });

  test('restituisce array vuoto se non ci sono job', async () => {
    mockGetActiveJobsByUserId.mockResolvedValueOnce([]);

    const res = await request(buildApp()).get('/api/active-jobs');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, jobs: [] });
  });

  test('restituisce 500 se la query fallisce', async () => {
    mockGetActiveJobsByUserId.mockRejectedValueOnce(new Error('db error'));

    const res = await request(buildApp()).get('/api/active-jobs');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'Internal server error' });
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- active-jobs.spec
```

Expected: FAIL — `active-jobs.ts` route non esiste ancora.

- [ ] **Step 3: Implementa la route**

Crea `archibald-web-app/backend/src/routes/active-jobs.ts`:

```typescript
import { Router } from 'express';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import { getActiveJobsByUserId } from '../db/repositories/active-jobs';

type ActiveJobsRouterDeps = {
  pool: DbPool;
};

function createActiveJobsRouter(deps: ActiveJobsRouterDeps) {
  const { pool } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const jobs = await getActiveJobsByUserId(pool, userId);
      res.json({ success: true, jobs });
    } catch {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  return router;
}

export { createActiveJobsRouter };
```

- [ ] **Step 4: Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/backend -- active-jobs.spec
```

Expected: PASS — tutti e 3 i test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/active-jobs.ts archibald-web-app/backend/src/routes/active-jobs.spec.ts
git commit -m "feat(backend): route GET /api/active-jobs — restituisce job in volo per utente"
```

---

## Task 4: Montaggio route in `server.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Aggiungi l'import in server.ts**

Trova il blocco di import delle route (dove sono importate le altre `createXxxRouter`). Aggiungi dopo l'ultima import di route:

```typescript
import { createActiveJobsRouter } from './routes/active-jobs';
```

- [ ] **Step 2: Monta la route**

Trova nell'app Express dove sono montate le altre route autenticate (es. `app.use('/api/pending-orders', authenticate, ...)`). Aggiungi la nuova route vicino alle route di operazioni:

```typescript
app.use('/api/active-jobs', authenticate, createActiveJobsRouter({ pool }));
```

- [ ] **Step 3: Verifica type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori TypeScript.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): monta route /api/active-jobs nell'app Express"
```

---

## Task 5: `operation-processor.ts` — `onJobCompleted` + `jobId` in `onJobFailed`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/operation-processor.ts`

- [ ] **Step 1: Leggi le righe da modificare**

Leggi il file `operation-processor.ts` e individua:
- La definizione `type OnJobFailedFn` (attualmente senza `jobId`)
- Il tipo `ProcessorDeps` (mancante `onJobCompleted`)
- La riga `const { ..., onJobFailed, ... } = deps;`
- La chiamata `await onJobFailed(type, data, userId, errorMessage).catch(() => {});`
- Il punto dopo il `broadcast(userId, { event: 'JOB_COMPLETED', ... })` dove aggiungere il callback

- [ ] **Step 2: Aggiungi `OnJobCompletedFn` e aggiorna `OnJobFailedFn`**

Modifica le definizioni dei tipi. Prima (`righe ~35-37`):

```typescript
type OnJobFailedFn = (type: OperationType, data: Record<string, unknown>, userId: string, error: string) => Promise<void>;

type OnJobStartedFn = (type: OperationType, data: Record<string, unknown>, userId: string, jobId: string) => Promise<void>;
```

Dopo:

```typescript
type OnJobFailedFn = (type: OperationType, data: Record<string, unknown>, userId: string, error: string, jobId: string) => Promise<void>;

type OnJobStartedFn = (type: OperationType, data: Record<string, unknown>, userId: string, jobId: string) => Promise<void>;

type OnJobCompletedFn = (type: OperationType, data: Record<string, unknown>, userId: string, jobId: string) => Promise<void>;
```

- [ ] **Step 3: Aggiungi `onJobCompleted` a `ProcessorDeps`**

Trova `type ProcessorDeps`. Aggiungi dopo `onJobStarted?`:

```typescript
  onJobCompleted?: OnJobCompletedFn;
```

- [ ] **Step 4: Aggiorna la destructuring e le chiamate**

Trova la riga:
```typescript
const { agentLock, browserPool, broadcast, enqueue, handlers, onJobFailed, onJobStarted, circuitBreaker } = deps;
```

Sostituisci con:
```typescript
const { agentLock, browserPool, broadcast, enqueue, handlers, onJobFailed, onJobStarted, onJobCompleted, circuitBreaker } = deps;
```

- [ ] **Step 5: Aggiungi la chiamata `onJobCompleted` dopo JOB_COMPLETED broadcast**

Trova il blocco:
```typescript
      broadcast(userId, {
        event: 'JOB_COMPLETED',
        jobId: job.id,
        type,
        result,
      });

      return { success: true, data: result, duration: Date.now() - startTime };
```

Aggiungi tra il broadcast e il return:
```typescript
      if (onJobCompleted) {
        await onJobCompleted(type, data, userId, job.id).catch(() => {});
      }
```

- [ ] **Step 6: Aggiorna la chiamata `onJobFailed` per passare `job.id`**

Trova:
```typescript
      if (onJobFailed) {
        await onJobFailed(type, data, userId, errorMessage).catch(() => {});
      }
```

Sostituisci con:
```typescript
      if (onJobFailed) {
        await onJobFailed(type, data, userId, errorMessage, job.id).catch(() => {});
      }
```

- [ ] **Step 7: Verifica type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori TypeScript.

- [ ] **Step 8: Aggiungi `OnJobCompletedFn` al blocco export**

Trova il blocco `export {` in fondo al file `operation-processor.ts`. Aggiungi `OnJobCompletedFn` insieme a `OnJobStartedFn` che già esportato:

```typescript
  OnJobCompletedFn,
```

- [ ] **Step 9: Verifica type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori TypeScript.

- [ ] **Step 10: Commit**

```bash
git add archibald-web-app/backend/src/operations/operation-processor.ts
git commit -m "feat(backend): operation-processor aggiunge onJobCompleted e jobId in onJobFailed"
```

---

## Task 6: `main.ts` — INSERT/DELETE in `active_jobs` per tutti i tipi

**Files:**
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiungi l'import del nuovo repository**

Trova il blocco di import in main.ts (es. dove è importato `updateJobTracking`):

```typescript
import { updateJobTracking } from './db/repositories/pending-orders';
```

Aggiungi subito dopo:

```typescript
import { insertActiveJob, deleteActiveJob, deleteStaleActiveJobs } from './db/repositories/active-jobs';
```

- [ ] **Step 2: Aggiungi la costante ACTIVE_JOB_TYPES e la funzione extractEntityInfo**

Trova la costante `DEFAULT_AGENT_SYNC_MS` (riga ~97) e aggiungi subito dopo, prima di `async function bootstrap()`:

```typescript
const ACTIVE_JOB_TYPES = new Set<string>([
  'submit-order',
  'send-to-verona',
  'delete-order',
  'edit-order',
  'update-customer',
  'batch-delete-orders',
  'batch-send-to-verona',
  'read-vat-status',
  'download-ddt-pdf',
  'download-invoice-pdf',
]);

function extractEntityInfo(type: string, data: Record<string, unknown>): { entityId: string; entityName: string } {
  const orderIds = data.orderIds as string[] | undefined;
  const entityName = String(
    data.entityName ??        // campo generico usato dai download
    data.customerName ??      // submit-order, delete-order, edit-order, send-to-verona
    (orderIds ? `${orderIds.length} ordini` : undefined) ??
    data.erpId ??
    data.orderId ??
    data.pendingOrderId ??
    type,
  );
  const entityId = String(
    data.pendingOrderId ??
    data.orderId ??
    (orderIds ? orderIds[0] : undefined) ??
    data.erpId ??
    '',
  );
  return { entityId, entityName };
}
```

- [ ] **Step 3: Aggiorna `onJobStarted` per tutti i tipi**

Trova il blocco esistente:
```typescript
    onJobStarted: async (type, data, _userId, jobId) => {
      if (type === 'submit-order' && data.pendingOrderId) {
        await updateJobTracking(pool, data.pendingOrderId as string, jobId);
      }
    },
```

Sostituisci con:
```typescript
    onJobStarted: async (type, data, userId, jobId) => {
      if (type === 'submit-order' && data.pendingOrderId) {
        await updateJobTracking(pool, data.pendingOrderId as string, jobId);
      }
      if (ACTIVE_JOB_TYPES.has(type)) {
        const { entityId, entityName } = extractEntityInfo(type, data);
        await insertActiveJob(pool, { jobId, type, userId, entityId, entityName }).catch(() => {});
      }
    },
```

- [ ] **Step 4: Aggiungi `onJobCompleted`**

Trova il blocco `onJobFailed` e aggiungi `onJobCompleted` subito dopo (o prima — l'ordine non importa):

```typescript
    onJobCompleted: async (type, _data, _userId, jobId) => {
      if (ACTIVE_JOB_TYPES.has(type)) {
        await deleteActiveJob(pool, jobId).catch(() => {});
      }
    },
```

- [ ] **Step 5: Aggiorna `onJobFailed` per eliminare da `active_jobs`**

Trova il blocco:
```typescript
    onJobFailed: async (type, data, _userId, errorMessage) => {
      if (type === 'submit-order') {
        const pendingOrderId = (data as Record<string, unknown>).pendingOrderId as string | undefined;
        if (pendingOrderId) {
          const { updatePendingOrderError } = await import('./db/repositories/pending-orders');
          await updatePendingOrderError(pool, pendingOrderId, errorMessage);
        }
      }
    },
```

Sostituisci con:
```typescript
    onJobFailed: async (type, data, _userId, errorMessage, jobId) => {
      if (type === 'submit-order') {
        const pendingOrderId = (data as Record<string, unknown>).pendingOrderId as string | undefined;
        if (pendingOrderId) {
          const { updatePendingOrderError } = await import('./db/repositories/pending-orders');
          await updatePendingOrderError(pool, pendingOrderId, errorMessage);
        }
      }
      if (ACTIVE_JOB_TYPES.has(type)) {
        await deleteActiveJob(pool, jobId).catch(() => {});
      }
    },
```

- [ ] **Step 6: Aggiungi cleanup periodico degli orphan records**

Trova nel corpo di `bootstrap()` il blocco degli interval (es. `const cleanupInterval = setInterval(...)`). Aggiungi un nuovo interval:

```typescript
  const activeJobsCleanupInterval = setInterval(async () => {
    await deleteStaleActiveJobs(pool, 2 * 60 * 60 * 1000).catch(() => {});
  }, 30 * 60 * 1000);
```

Assicurati di aggiungere anche il `clearInterval` nel blocco `shutdown`:
```typescript
  clearInterval(activeJobsCleanupInterval);
```

- [ ] **Step 7: Aggiorna la route `send-to-verona` in `orders.ts`**

La route backend per `send-to-verona` carica già l'oggetto `order` dal DB (`const order = await getOrderById(userId, orderId)`). L'ordine ha un campo `customerName`. Aggiungi `customerName` all'enqueue data.

Trova in `archibald-web-app/backend/src/routes/orders.ts` la riga:

```typescript
      const jobId = await queue.enqueue('send-to-verona', userId, { orderId });
```

Sostituisci con:

```typescript
      const jobId = await queue.enqueue('send-to-verona', userId, { orderId, customerName: order.customerName ?? orderId });
```

- [ ] **Step 8: Verifica type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori TypeScript.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/backend/src/main.ts archibald-web-app/backend/src/routes/orders.ts
git commit -m "feat(backend): main.ts persiste active_jobs per tutti i tipi BullMQ tracciati, include download"
```

---

## Task 7: Frontend `getActiveJobs()` in `api/operations.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/api/operations.ts`

- [ ] **Step 1: Aggiungi il tipo `ActiveJob` e la funzione `getActiveJobs`**

Aggiungi dopo la definizione di `DashboardResponse` (riga ~61):

```typescript
type ActiveJob = {
  jobId: string;
  type: string;
  userId: string;
  entityId: string;
  entityName: string;
  startedAt: string;
};

type ActiveJobsResponse = {
  success: boolean;
  jobs: ActiveJob[];
};
```

Aggiungi dopo la funzione `getQueueStats`:

```typescript
async function getActiveJobs(): Promise<ActiveJobsResponse> {
  const response = await fetch('/api/active-jobs', {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
```

- [ ] **Step 2: Aggiungi i nuovi export**

Trova il blocco `export { ... }` in fondo al file. Aggiungi:

```typescript
  getActiveJobs,
  type ActiveJob,
  type ActiveJobsResponse,
```

- [ ] **Step 3: Verifica type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori TypeScript.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/api/operations.ts
git commit -m "feat(frontend): api getActiveJobs() per recovery banner bot al reload"
```

---

## Task 8: Frontend recovery in `OperationTrackingContext.tsx`

**Files:**
- Modify: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx`
- Modify: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx`

- [ ] **Step 1: Scrivi i test failing**

In `OperationTrackingContext.spec.tsx`:

1. **Rimuovi completamente** il mock `vi.mock("../api/pending-orders", ...)` (non è più usato da questo context).
2. **Aggiorna** il mock `vi.mock("../api/operations", ...)` esistente per includere `getActiveJobs`:

```typescript
vi.mock("../api/pending-orders", () => ({
  getPendingOrders: vi.fn().mockResolvedValue([]),
}));
```

Rimuovi il blocco sopra e sostituisci l'unico mock di `../api/operations` con:

```typescript
vi.mock("../api/operations", () => ({
  getJobStatus: vi.fn().mockResolvedValue({
    success: true,
    job: {
      jobId: "job-1",
      type: "submit-order",
      userId: "user-1",
      state: "active",
      progress: 50,
      result: null,
      failedReason: undefined,
    },
  }),
  getActiveJobs: vi.fn().mockResolvedValue({ success: true, jobs: [] }),
}));
```

**Rimuovi** il mock separato di `../api/operations` (già presente) e **uniscilo** in un unico mock di `../api/operations` con entrambe le funzioni.

Sostituisci il test `"recovers processing orders on mount"` con:

```typescript
test("recupera job attivi al mount tramite getActiveJobs", async () => {
  vi.useRealTimers();

  const { getActiveJobs } = await import("../api/operations");
  const { getJobStatus } = await import("../api/operations");

  (getActiveJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    success: true,
    jobs: [
      {
        jobId: "job-99",
        type: "submit-order",
        userId: "user-1",
        entityId: "order-99",
        entityName: "Luigi Verdi",
        startedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });

  (getJobStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    success: true,
    job: {
      jobId: "job-99",
      type: "submit-order",
      userId: "user-1",
      state: "active",
      progress: 30,
      result: null,
      failedReason: undefined,
    },
  });

  const { result } = renderHook(() => useOperationTracking(), {
    wrapper: Wrapper,
  });

  await waitFor(() => {
    expect(result.current.activeOperations).toEqual([
      expect.objectContaining({
        orderId: "order-99",
        jobId: "job-99",
        customerName: "Luigi Verdi",
        status: "active",
        progress: 30,
      }),
    ]);
  });
  expect(getJobStatus).toHaveBeenCalledWith("job-99");

  vi.useFakeTimers();
});
```

Sostituisci il test `"ignores orders not in processing status"` con:

```typescript
test("restituisce operazioni vuote se getActiveJobs risponde con array vuoto", async () => {
  vi.useRealTimers();

  const { getActiveJobs } = await import("../api/operations");
  const { getJobStatus } = await import("../api/operations");

  (getActiveJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    success: true,
    jobs: [],
  });

  const { result } = renderHook(() => useOperationTracking(), {
    wrapper: Wrapper,
  });

  await new Promise((r) => setTimeout(r, 50));

  expect(result.current.activeOperations).toEqual([]);
  expect(getJobStatus).not.toHaveBeenCalled();

  vi.useFakeTimers();
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscono**

```bash
npm test --prefix archibald-web-app/frontend -- OperationTrackingContext.spec
```

Expected: FAIL — il context ancora usa `getPendingOrders`.

- [ ] **Step 3: Aggiorna `OperationTrackingContext.tsx`**

**Aggiungi la funzione `deriveNavigateTo`** sopra il componente `OperationTrackingProvider`:

```typescript
function deriveNavigateTo(type: string, entityId: string): string | undefined {
  if (type === 'update-customer' || type === 'read-vat-status') return `/customers/${entityId}`;
  if (type === 'create-customer') return '/customers';
  if (type === 'submit-order') return '/pending-orders';
  if (['send-to-verona', 'delete-order', 'edit-order', 'batch-delete-orders',
       'batch-send-to-verona', 'download-ddt-pdf', 'download-invoice-pdf'].includes(type)) return '/orders';
  return undefined;
}
```

**Modifica l'import** in cima al file:

Rimuovi:
```typescript
import { getPendingOrders } from "../api/pending-orders";
import { getJobStatus } from "../api/operations";
```

Sostituisci con:
```typescript
import { getActiveJobs, getJobStatus } from "../api/operations";
```

**Sostituisci la funzione `recover()`** nell'`useEffect` di mount:

Rimuovi:
```typescript
    async function recover() {
      try {
        const pendingOrders = await getPendingOrders();
        const inFlight = pendingOrders.filter(
          (o) => o.status === "processing" && o.jobId,
        );

        if (cancelled || inFlight.length === 0) return;

        const recovered: TrackedOperation[] = [];

        for (const order of inFlight) {
          try {
            const { job } = await getJobStatus(order.jobId!);
            if (cancelled) return;

            const status = job.state === "completed"
              ? "completed" as const
              : job.state === "failed"
                ? "failed" as const
                : job.state === "active"
                  ? "active" as const
                  : "queued" as const;

            recovered.push({
              orderId: order.id,
              jobId: order.jobId!,
              customerName: order.customerName,
              status,
              progress: status === "completed" ? 100 : (job.progress ?? 0),
              label: status === "completed"
                ? "Ordine completato"
                : status === "failed"
                  ? "Errore"
                  : "Recupero in corso...",
              error: job.failedReason,
              startedAt: order.jobStartedAt
                ? new Date(order.jobStartedAt).getTime()
                : Date.now(),
            });
          } catch {
            // Skip orders whose job status can't be fetched
          }
        }

        if (!cancelled && recovered.length > 0) {
          setOperations(recovered);
          for (const op of recovered) {
            if (op.status === "completed") {
              scheduleDismiss(op.orderId);
            }
          }
        }
      } catch {
        // Recovery failed silently — user can still track new operations
      }
    }
```

Sostituisci con:
```typescript
    async function recover() {
      try {
        const { jobs } = await getActiveJobs();

        if (cancelled || jobs.length === 0) return;

        const recovered: TrackedOperation[] = [];

        for (const activeJob of jobs) {
          try {
            const { job } = await getJobStatus(activeJob.jobId);
            if (cancelled) return;

            const status = job.state === "completed"
              ? "completed" as const
              : job.state === "failed"
                ? "failed" as const
                : job.state === "active"
                  ? "active" as const
                  : "queued" as const;

            recovered.push({
              orderId: activeJob.entityId,
              jobId: activeJob.jobId,
              customerName: activeJob.entityName,
              status,
              progress: status === "completed" ? 100 : (job.progress ?? 0),
              label: status === "completed"
                ? "Operazione completata"
                : status === "failed"
                  ? "Errore"
                  : "Recupero in corso...",
              error: job.failedReason,
              startedAt: new Date(activeJob.startedAt).getTime(),
              navigateTo: deriveNavigateTo(activeJob.type, activeJob.entityId),
            });
          } catch {
            // Skip jobs il cui status non è recuperabile
          }
        }

        if (!cancelled && recovered.length > 0) {
          setOperations(recovered);
          for (const op of recovered) {
            if (op.status === "completed") {
              scheduleDismiss(op.orderId);
            }
          }
        }
      } catch {
        // Recovery failed silently — user can still track new operations
      }
    }
```

- [ ] **Step 4: Esegui i test per verificare che passano**

```bash
npm test --prefix archibald-web-app/frontend -- OperationTrackingContext.spec
```

Expected: PASS — tutti i test passano, inclusi quelli di recovery aggiornati.

- [ ] **Step 5: Verifica type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori TypeScript.

- [ ] **Step 6: Esegui la suite completa frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Expected: tutti i test passano (numero precedente ± nuovi test aggiunti).

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx
git commit -m "feat(frontend): recovery banner usa getActiveJobs — copertura universale operazioni bot"
```

---

---

## Task 9: `create-customer` — Persistenza via route interattiva

**Files:**
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.ts`
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.spec.ts`
- Modify: `archibald-web-app/backend/src/server.ts`

**Contesto:** `create-customer` non usa BullMQ — il route genera `taskId = randomUUID()`, esegue il bot in un blocco fire-and-forget e invia eventi WS direttamente. Il route ha `userId` e `customerData.name`. Basta aggiungere due callback opzionali ai deps e chiamarle al momento giusto: `recordJobStarted` dentro il fire-and-forget dopo `broadcast JOB_STARTED`, `recordJobFinished` nel blocco `finally`.

- [ ] **Step 1: Scrivi i test failing**

Nel file `customer-interactive.spec.ts`, aggiungi nella funzione `createMockDeps` i due nuovi campi:

```typescript
function createMockDeps(sessionManager?: InteractiveSessionManager): CustomerInteractiveRouterDeps {
  return {
    // ... tutti i campi esistenti ...
    recordJobStarted: vi.fn().mockResolvedValue(undefined),
    recordJobFinished: vi.fn().mockResolvedValue(undefined),
  };
}
```

Aggiungi alla fine del `describe('POST /api/customers/interactive/:sessionId/save', ...)` questi due test:

```typescript
    test('chiama recordJobStarted con taskId, entityId=taskId, entityName=nome cliente', async () => {
      const deps = createMockDeps();
      const app = buildApp(deps);

      const session = deps.sessionManager.createSession('user-1');
      deps.sessionManager.updateState(session, 'ready');

      await request(app)
        .post(`/api/customers/interactive/${session}/save`)
        .set('Authorization', 'Bearer test')
        .send({ name: 'Mario Rossi', vatNumber: 'IT12345678901' });

      // Aspetta il fire-and-forget
      await new Promise((r) => setTimeout(r, 50));

      expect(deps.recordJobStarted).toHaveBeenCalledOnce();
      const [jobId, entityId, entityName, userId] = (deps.recordJobStarted as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(jobId).toBeTypeOf('string');
      expect(entityId).toBe(jobId);
      expect(entityName).toBe('Mario Rossi');
      expect(userId).toBe('user-1');
    });

    test('chiama recordJobFinished dopo il completamento del bot', async () => {
      const deps = createMockDeps();
      const app = buildApp(deps);

      const session = deps.sessionManager.createSession('user-1');
      deps.sessionManager.updateState(session, 'ready');

      await request(app)
        .post(`/api/customers/interactive/${session}/save`)
        .set('Authorization', 'Bearer test')
        .send({ name: 'Mario Rossi', vatNumber: 'IT12345678901' });

      await new Promise((r) => setTimeout(r, 50));

      expect(deps.recordJobFinished).toHaveBeenCalledOnce();
      const [calledJobId] = (deps.recordJobFinished as ReturnType<typeof vi.fn>).mock.calls[0];
      const [startedJobId] = (deps.recordJobStarted as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(calledJobId).toBe(startedJobId);
    });
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- customer-interactive.spec
```

Expected: FAIL — i nuovi test falliscono perché i deps non hanno ancora quei campi.

- [ ] **Step 3: Aggiungi i due campi opzionali a `CustomerInteractiveRouterDeps`**

Nel file `customer-interactive.ts`, trova `type CustomerInteractiveRouterDeps` e aggiungi in fondo:

```typescript
  recordJobStarted?: (jobId: string, entityId: string, entityName: string, userId: string) => Promise<void>;
  recordJobFinished?: (jobId: string) => Promise<void>;
```

- [ ] **Step 4: Distruggi i nuovi campi dalla deps nel route**

Trova la riga che inizia con:
```typescript
    sessionManager, createBot, broadcast,
```

Aggiungi `recordJobStarted, recordJobFinished` alla destructuring. Il blocco deps è già estratto all'inizio del router, aggiungi lì:

```typescript
  const { ..., recordJobStarted, recordJobFinished } = deps;
```

- [ ] **Step 5: Chiama `recordJobStarted` dentro il fire-and-forget, dopo `broadcast JOB_STARTED`**

Trova nel fire-and-forget il blocco:
```typescript
          broadcast(userId, {
            type: 'JOB_STARTED',
            payload: { jobId: taskId },
            timestamp: now(),
          });
```

Aggiungi subito dopo:
```typescript
          await recordJobStarted?.(taskId, taskId, customerData.name, userId).catch(() => {});
```

- [ ] **Step 6: Chiama `recordJobFinished` nel blocco `finally`**

Trova il blocco `finally` (dopo `broadcast JOB_FAILED`):
```typescript
        } finally {
          if (sessionHadSyncsPaused) {
```

Aggiungi come prima istruzione del `finally`:
```typescript
        } finally {
          await recordJobFinished?.(taskId).catch(() => {});
          if (sessionHadSyncsPaused) {
```

- [ ] **Step 7: Esegui i test per verificare che passano**

```bash
npm test --prefix archibald-web-app/backend -- customer-interactive.spec
```

Expected: PASS — tutti i test, inclusi i 2 nuovi.

- [ ] **Step 8: Aggiungi l'import di `insertActiveJob`/`deleteActiveJob` in `server.ts`**

Trova il blocco di import del repository in `server.ts`. Aggiungi:

```typescript
import { insertActiveJob, deleteActiveJob } from './db/repositories/active-jobs';
```

Nota: `main.ts` ha già questo import (aggiunto in Task 6). `server.ts` è un file separato e richiede il proprio import.

- [ ] **Step 9: Aggiorna `server.ts` per passare le deps**

Trova il blocco `createCustomerInteractiveRouter({...})` in `server.ts` (riga ~549). Aggiungi i due nuovi campi prima della chiusura `}))`:

```typescript
      recordJobStarted: async (jobId, entityId, entityName, userId) => {
        await insertActiveJob(pool, { jobId, type: 'create-customer', userId, entityId, entityName }).catch(() => {});
      },
      recordJobFinished: async (jobId) => {
        await deleteActiveJob(pool, jobId).catch(() => {});
      },
```

- [ ] **Step 10: Verifica type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori TypeScript.

- [ ] **Step 11: Esegui l'intera suite backend**

```bash
npm test --prefix archibald-web-app/backend
```

Expected: tutti i test passano.

- [ ] **Step 12: Commit**

```bash
git add archibald-web-app/backend/src/routes/customer-interactive.ts archibald-web-app/backend/src/routes/customer-interactive.spec.ts archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): create-customer persiste active_jobs via route interattiva"
```

---

---

## Task 10: Frontend — `customerName`/`entityName` nei payload di enqueue

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`
- Modify: `archibald-web-app/frontend/src/api/fresis-history.ts`
- Modify: `archibald-web-app/frontend/src/pages/FresisHistoryPage.tsx`
- Modify: `archibald-web-app/frontend/src/api/document-download.ts`

**Contesto:** Questi sono piccoli payload additions — nessun cambio di logica, nessuna nuova funzione. `extractEntityInfo` nel backend (Task 6) cerca già `data.entityName` e `data.customerName`. Il type-check è l'unico gate necessario, nessun nuovo test.

- [ ] **Step 1: `delete-order` in `OrderCardNew.tsx`**

Trova la riga (intorno alla riga 4082):
```typescript
      const result = await enqueueOperation('delete-order', {
        orderId: order.id,
      });
```

Sostituisci con:
```typescript
      const result = await enqueueOperation('delete-order', {
        orderId: order.id,
        customerName: order.customerName || order.id,
      });
```

- [ ] **Step 2: `edit-order` in `OrderCardNew.tsx`**

Trova la riga (intorno alla riga 1295):
```typescript
      const result = await enqueueOperation('edit-order', {
        orderId,
        modifications,
        updatedItems: editItems,
        notes: editNotes,
        noShipping: editNoShipping || undefined,
      });
```

Sostituisci con:
```typescript
      const result = await enqueueOperation('edit-order', {
        orderId,
        modifications,
        updatedItems: editItems,
        notes: editNotes,
        noShipping: editNoShipping || undefined,
        customerName: customerName || orderId,
      });
```

- [ ] **Step 3: `delete-order` in `fresis-history.ts` — aggiorna firma**

Trova la funzione `deleteFromArchibald` in `archibald-web-app/frontend/src/api/fresis-history.ts`:
```typescript
export async function deleteFromArchibald(
  id: string,
): Promise<{ message: string; jobId: string }> {
  const result = await enqueueOperation('delete-order', {
    orderId: id,
  });
  return { message: 'Delete job enqueued', jobId: result.jobId };
}
```

Sostituisci con:
```typescript
export async function deleteFromArchibald(
  id: string,
  customerName?: string,
): Promise<{ message: string; jobId: string }> {
  const result = await enqueueOperation('delete-order', {
    orderId: id,
    ...(customerName ? { customerName } : {}),
  });
  return { message: 'Delete job enqueued', jobId: result.jobId };
}
```

- [ ] **Step 4: Aggiorna il call site in `FresisHistoryPage.tsx`**

Trova la riga (intorno alla riga 398):
```typescript
        const result = await deleteFromArchibald(id);
```

Sostituisci con:
```typescript
        const result = await deleteFromArchibald(id, order.customerName || undefined);
```

- [ ] **Step 5: Download — aggiungi `entityName` in `document-download.ts`**

Trova la riga in `archibald-web-app/frontend/src/api/document-download.ts`:
```typescript
      const { jobId } = await enqueueOperation(operationType, { orderId, searchTerm: searchTerm ?? orderId });
```

Sostituisci con:
```typescript
      const { jobId } = await enqueueOperation(operationType, {
        orderId,
        searchTerm: searchTerm ?? orderId,
        ...(docLabel ? { entityName: docLabel } : {}),
      });
```

- [ ] **Step 6: Verifica type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori TypeScript.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx archibald-web-app/frontend/src/api/fresis-history.ts archibald-web-app/frontend/src/pages/FresisHistoryPage.tsx archibald-web-app/frontend/src/api/document-download.ts
git commit -m "feat(frontend): aggiunge customerName/entityName ai payload enqueue per banner post-reload"
```

---

## Task 11: Frontend — `navigateTo` nelle chiamate `trackOperation` live

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/OrderHistory.tsx`
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`
- Modify: `archibald-web-app/frontend/src/contexts/DownloadQueueContext.tsx`

**Contesto:** `CustomerProfilePage.tsx` e `CustomerCreateModal.tsx` hanno già i `navigateTo` corretti. `FresisHistoryPage.tsx` è esclusa (delete-order da storico non necessita navigazione). Questo task aggiunge il 6° argomento alle chiamate rimanenti.

- [ ] **Step 1: `OrderHistory.tsx` — send-to-verona, batch-delete-orders, batch-send-to-verona**

Trova (riga ~802):
```typescript
        trackOperation(modalOrderId, data.jobId, modalCustomerName || modalOrderId, 'Invio a Verona...', 'Inviato a Verona');
```
Sostituisci con:
```typescript
        trackOperation(modalOrderId, data.jobId, modalCustomerName || modalOrderId, 'Invio a Verona...', 'Inviato a Verona', '/orders');
```

Trova (riga ~887):
```typescript
        trackOperation(ids[0], data.jobId, `${ids.length} ordini`, "Eliminazione batch...");
```
Sostituisci con:
```typescript
        trackOperation(ids[0], data.jobId, `${ids.length} ordini`, "Eliminazione batch...", undefined, '/orders');
```

Trova (riga ~908):
```typescript
        trackOperation(ids[0], data.jobId, `${ids.length} ordini`, "Invio a Verona...", "Inviato a Verona");
```
Sostituisci con:
```typescript
        trackOperation(ids[0], data.jobId, `${ids.length} ordini`, "Invio a Verona...", "Inviato a Verona", '/orders');
```

- [ ] **Step 2: `OrderCardNew.tsx` — edit-order, delete-order**

Trova (riga ~1309):
```typescript
      trackOperation(orderId, result.jobId, customerName || orderId, 'Modifica ordine...');
```
Sostituisci con:
```typescript
      trackOperation(orderId, result.jobId, customerName || orderId, 'Modifica ordine...', undefined, '/orders');
```

Trova (riga ~4090):
```typescript
      trackOperation(order.id, result.jobId, order.customerName || order.id, 'Eliminazione ordine...');
```
Sostituisci con:
```typescript
      trackOperation(order.id, result.jobId, order.customerName || order.id, 'Eliminazione ordine...', undefined, '/orders');
```

- [ ] **Step 3: `PendingOrdersPage.tsx` — submit-order (due call site)**

Trova (riga ~329):
```typescript
          trackOperation(order.id!, jobId, order.customerName);
```
Sostituisci con:
```typescript
          trackOperation(order.id!, jobId, order.customerName, undefined, undefined, '/pending-orders');
```

Trova (riga ~424):
```typescript
      trackOperation(order.id!, result.jobId, order.customerName);
```
Sostituisci con:
```typescript
      trackOperation(order.id!, result.jobId, order.customerName, undefined, undefined, '/pending-orders');
```

- [ ] **Step 4: `DownloadQueueContext.tsx` — download-ddt/invoice**

Trova (riga ~76):
```typescript
        trackOperation(
          item.orderId,
          jobId,
          item.displayName,
          `Download ${item.docLabel}...`,
        ),
```
Sostituisci con:
```typescript
        trackOperation(
          item.orderId,
          jobId,
          item.displayName,
          `Download ${item.docLabel}...`,
          undefined,
          '/orders',
        ),
```

- [ ] **Step 5: Verifica type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori TypeScript.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/pages/OrderHistory.tsx archibald-web-app/frontend/src/components/OrderCardNew.tsx archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx archibald-web-app/frontend/src/contexts/DownloadQueueContext.tsx
git commit -m "feat(frontend): aggiunge navigateTo alle chiamate trackOperation per tutti i tipi operazione"
```

---

## Self-Review

### Spec Coverage

| Requisito | Task che lo implementa |
|-----------|------------------------|
| Banner persiste dopo reload per `submit-order` | Task 6 (onJobStarted), Task 8 (recovery) |
| Banner persiste dopo reload per `send-to-verona` | Task 6 (ACTIVE_JOB_TYPES), Task 8 |
| Banner persiste dopo reload per `delete-order` | Task 6, Task 8 |
| Banner persiste dopo reload per `edit-order` | Task 6, Task 8 |
| Banner persiste dopo reload per `update-customer` | Task 6, Task 8 |
| Banner persiste dopo reload per `batch-delete-orders` | Task 6, Task 8 |
| Banner persiste dopo reload per `batch-send-to-verona` | Task 6, Task 8 |
| Banner persiste dopo reload per `read-vat-status` | Task 6, Task 8 |
| Banner persiste dopo reload per `create-customer` | Task 9 (route interattiva) |
| Banner persiste dopo reload per `download-ddt-pdf` / `download-invoice-pdf` | Task 6 (ACTIVE_JOB_TYPES), Task 8 |
| `send-to-verona` mostra nome cliente (non orderId) | Task 6 Step 7 (route orders.ts) |
| `delete-order` / `edit-order` mostrano nome cliente | Task 10 Step 1-4 |
| Download mostra etichetta documento | Task 10 Step 5 |
| `navigateTo` corretto in banner live (tutti i tipi) | Task 11 |
| `navigateTo` corretto in banner recuperato (recovery) | Task 8 (`deriveNavigateTo`) |
| Cleanup orphan records (es. crash server) | Task 6 (cleanup interval) |
| Eliminazione record al completamento job | Task 5 (onJobCompleted), Task 6, Task 9 |
| Eliminazione record al fallimento job | Task 5 (jobId in onJobFailed), Task 6, Task 9 |

### Limitazioni note

- Nessuna limitazione significativa rimasta. `batch-delete-orders` e `batch-send-to-verona` mostrano `N ordini` — corretto per operazioni multi-target senza un unico nome cliente.

### Placeholder scan

Nessun placeholder presente — ogni step ha codice reale.

### Type consistency

- `ActiveJob` è definito nel repository e riusato nella route e nel frontend.
- `OnJobCompletedFn` e `OnJobFailedFn` (aggiornata) usano lo stesso `OperationType` del processore.
- `extractEntityInfo` usa `Record<string, unknown>` allineato con la firma esistente di `onJobStarted`.

# Adaptive Scheduler + Banner UX — Fase 2 + Fase 3: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il timer fisso dello scheduler con un sistema adattivo basato su staleness scoring, e migliorare la UX del banner con messaggi specifici, indicatore pressione e QueueDrawer a 3 sezioni.

**Prerequisito:** Piano 1 completato e in prod (`docs/superpowers/plans/2026-05-08-priority-engine-fase0-fase1.md`). Migration #083 applicata.

**Architecture:** (1) Repository `sync_freshness` + aggiornamento Worker post-complete; (2) `stalenessScore()` + `createAdaptiveScheduler()` con `setTimeout` chaining in nuovo file; (3) Sostituzione scheduler in `main.ts`, rimozione `smartCustomerSync` stop/start; (4) Frontend: `priority` in TrackedOperation, BG labels specifiche, pressione derivata da state, QueueDrawer 3 sezioni, ETA lato client.

**Tech Stack:** TypeScript, PostgreSQL (`pg`), Vitest, React 19, `npm test --prefix archibald-web-app/backend`, `npm run type-check --prefix archibald-web-app/frontend`

**Spec:** `docs/superpowers/specs/2026-05-08-priority-engine-adaptive-scheduler-design.md`

---

## File map

| File | Azione | Motivo |
|------|--------|--------|
| `src/db/repositories/sync-freshness.ts` | Create | CRUD per agents.sync_freshness |
| `src/db/repositories/sync-freshness.spec.ts` | Create | test integrazione freshness |
| `src/sync/adaptive-scheduler.ts` | Create | nuovo scheduler con staleness scoring |
| `src/sync/adaptive-scheduler.spec.ts` | Create | test unità stalenessScore + tick logic |
| `src/sync/sync-scheduler.ts` | Modify | rimuovere stop()/start() da smartCustomerSync |
| `src/sync/sync-scheduler.spec.ts` | Modify | aggiornare test smartCustomerSync |
| `src/conductor/worker.ts` | Modify | update freshness on complete + priority in JOB_STARTED |
| `src/main.ts` | Modify | wiring adaptive scheduler, rimozione vecchio scheduler |
| `src/contexts/OperationTrackingContext.tsx` | Modify | TrackedOperation + priority field, pressione derivata |
| `src/contexts/OperationTrackingContext.spec.tsx` | Modify | test nuovi campi |
| `src/components/GlobalOperationBanner.tsx` | Modify | pressure indicator in BgStripe |
| `src/components/GlobalOperationBanner.spec.tsx` | Modify | test pressure indicator |
| `src/components/QueueDrawer.tsx` | Modify | 3 sezioni, label specifiche, ETA |
| `src/components/QueueDrawer.spec.tsx` | Modify | test sezioni |

---

## Task 1: Repository `sync_freshness`

**Files:**
- Create: `src/db/repositories/sync-freshness.ts`
- Create: `src/db/repositories/sync-freshness.spec.ts`

- [ ] **Step 1: Scrivi il test (integration — richiede PG_HOST)**

Crea `src/db/repositories/sync-freshness.spec.ts`:

```typescript
import { describe, expect, test, beforeEach } from 'vitest';
import { createPool } from '../pool';
import { updateSyncFreshness, getLastSyncAt, getAllFreshnessForUser } from './sync-freshness';

const TEST_USER = 'test-freshness-user';

describe.skipIf(!process.env.PG_HOST)('sync_freshness repository', () => {
  const pool = createPool();

  beforeEach(async () => {
    await pool.query(
      `DELETE FROM agents.sync_freshness WHERE user_id = $1`,
      [TEST_USER],
    );
  });

  test('updateSyncFreshness inserisce o aggiorna last_completed_at', async () => {
    await updateSyncFreshness(pool, TEST_USER, 'sync-orders');
    const result = await getLastSyncAt(pool, TEST_USER, 'sync-orders');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeCloseTo(Date.now(), -3); // entro 1s
  });

  test('getLastSyncAt ritorna null se non esiste', async () => {
    const result = await getLastSyncAt(pool, TEST_USER, 'sync-orders');
    expect(result).toBeNull();
  });

  test('getAllFreshnessForUser ritorna mappa syncType → Date', async () => {
    await updateSyncFreshness(pool, TEST_USER, 'sync-orders');
    await updateSyncFreshness(pool, TEST_USER, 'sync-customers');
    const map = await getAllFreshnessForUser(pool, TEST_USER);
    expect(map['sync-orders']).toBeInstanceOf(Date);
    expect(map['sync-customers']).toBeInstanceOf(Date);
    expect(map['sync-ddt']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

```bash
PG_HOST=localhost npm test --prefix archibald-web-app/backend -- --reporter=verbose src/db/repositories/sync-freshness.spec.ts
```

Atteso: FAIL — modulo non trovato.

- [ ] **Step 3: Crea il repository**

Crea `src/db/repositories/sync-freshness.ts`:

```typescript
import type { DbPool } from '../pool';

export async function updateSyncFreshness(
  pool: DbPool,
  userId: string,
  syncType: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.sync_freshness (user_id, sync_type, last_completed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, sync_type)
     DO UPDATE SET last_completed_at = NOW()`,
    [userId, syncType],
  );
}

export async function getLastSyncAt(
  pool: DbPool,
  userId: string,
  syncType: string,
): Promise<Date | null> {
  const { rows } = await pool.query<{ last_completed_at: Date }>(
    `SELECT last_completed_at FROM agents.sync_freshness WHERE user_id = $1 AND sync_type = $2`,
    [userId, syncType],
  );
  return rows[0]?.last_completed_at ?? null;
}

export async function getAllFreshnessForUser(
  pool: DbPool,
  userId: string,
): Promise<Record<string, Date>> {
  const { rows } = await pool.query<{ sync_type: string; last_completed_at: Date }>(
    `SELECT sync_type, last_completed_at FROM agents.sync_freshness WHERE user_id = $1`,
    [userId],
  );
  return Object.fromEntries(rows.map(r => [r.sync_type, r.last_completed_at]));
}
```

- [ ] **Step 4: Esegui i test**

```bash
PG_HOST=localhost npm test --prefix archibald-web-app/backend -- --reporter=verbose src/db/repositories/sync-freshness.spec.ts
```

Atteso: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/sync-freshness.ts \
        archibald-web-app/backend/src/db/repositories/sync-freshness.spec.ts
git commit -m "feat(db): repository sync_freshness per adaptive scheduler"
```

---

## Task 2: Worker aggiorna freshness al completamento + priority in JOB_STARTED

**Files:**
- Modify: `src/conductor/worker.ts`
- Modify: `src/conductor/worker.spec.ts`

- [ ] **Step 1: Scrivi test failing per priority in JOB_STARTED**

In `worker.spec.ts`, aggiungi in `describe('executeTask', ...)`:

```typescript
test('JOB_STARTED include priority del task', async () => {
  const broadcasts: Record<string, unknown>[] = [];
  const worker = createWorker({
    ...defaultDeps,
    broadcast: (_userId, event) => { broadcasts.push(event); },
  });

  // Esegui un task P=10
  await executeTaskWithPriority(worker, { priority: 10, taskType: 'submit-order', ... });

  const startedEvent = broadcasts.find(e => e.event === 'JOB_STARTED');
  expect(startedEvent?.priority).toBe(10);
});
```

- [ ] **Step 2: Aggiungi `priority` al broadcast JOB_STARTED in `worker.ts`**

Nel metodo `executeTask`, nel broadcast `JOB_STARTED` (riga ~173):

```typescript
this.deps.broadcast(this.userId, {
  event: 'JOB_STARTED',
  taskId: taskIdStr,
  jobId: taskIdStr,
  type: task.taskType,
  priority: task.priority, // NUOVO — usato dal frontend per ordinamento EP
  entityId,
  entityName,
  ...(task.taskType === 'submit-order' && task.payload.pendingOrderId
    ? { pendingOrderId: task.payload.pendingOrderId }
    : {}),
});
```

- [ ] **Step 3: Aggiungi aggiornamento freshness dopo completeTask**

Nel metodo `executeTask`, dopo `await queueRepo.completeTask(...)` e il check `result.success !== false`:

```typescript
import { updateSyncFreshness } from '../db/repositories/sync-freshness';

// Lista dei sync type che aggiornano freshness
const SYNC_TYPES_WITH_FRESHNESS = new Set([
  'sync-orders', 'sync-customers', 'sync-ddt', 'sync-invoices',
  'sync-products', 'sync-prices', 'sync-tracking', 'sync-order-states',
]);

// Dopo completeTask, aggiorna freshness SOLO se il sync ha avuto successo
if (SYNC_TYPES_WITH_FRESHNESS.has(task.taskType) && !('success' in result && result.success === false)) {
  updateSyncFreshness(this.deps.pool, task.userId, task.taskType)
    .catch((err: unknown) => logger.warn('[Worker] updateSyncFreshness failed', { err, taskType: task.taskType }));
}
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/conductor/worker.spec.ts
```

- [ ] **Step 5: Build + commit**

```bash
npm run build --prefix archibald-web-app/backend
git add archibald-web-app/backend/src/conductor/worker.ts \
        archibald-web-app/backend/src/conductor/worker.spec.ts
git commit -m "feat(worker): aggiorna sync_freshness al completamento + priority in JOB_STARTED"
```

---

## Task 3: `stalenessScore` + config target freshness

**Files:**
- Create: `src/sync/adaptive-scheduler.ts`
- Create: `src/sync/adaptive-scheduler.spec.ts`

- [ ] **Step 1: Scrivi i test per `stalenessScore`**

Crea `src/sync/adaptive-scheduler.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { stalenessScore, getTargetFreshnessMs } from './adaptive-scheduler';

describe('stalenessScore', () => {
  test('ritorna 2.0 se lastSyncAt è null (mai sincronizzato)', () => {
    expect(stalenessScore(null, 20 * 60_000)).toBe(2.0);
  });

  test('ritorna ~0 se sincronizzato ora', () => {
    expect(stalenessScore(new Date(), 20 * 60_000)).toBeCloseTo(0, 1);
  });

  test('ritorna 1.0 se il tempo trascorso è uguale al target (alla soglia)', () => {
    const targetMs = 20 * 60_000;
    const lastSync = new Date(Date.now() - targetMs);
    expect(stalenessScore(lastSync, targetMs)).toBeCloseTo(1.0, 1);
  });

  test('ritorna >1 se dati scaduti (tempo > target)', () => {
    const targetMs = 20 * 60_000;
    const lastSync = new Date(Date.now() - targetMs * 1.5);
    expect(stalenessScore(lastSync, targetMs)).toBeGreaterThan(1.0);
  });
});

describe('getTargetFreshnessMs', () => {
  test('sync-orders active: 20 minuti', () => {
    expect(getTargetFreshnessMs('sync-orders', 'active')).toBe(20 * 60_000);
  });

  test('sync-ddt idle: null (sospeso)', () => {
    expect(getTargetFreshnessMs('sync-ddt', 'idle')).toBeNull();
  });

  test('sync-orders offline: null (sospeso)', () => {
    expect(getTargetFreshnessMs('sync-orders', 'offline')).toBeNull();
  });

  test('sync-tracking active: 15 minuti', () => {
    expect(getTargetFreshnessMs('sync-tracking', 'active')).toBe(15 * 60_000);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/sync/adaptive-scheduler.spec.ts
```

Atteso: FAIL — modulo non trovato.

- [ ] **Step 3: Crea le funzioni in `adaptive-scheduler.ts`**

Crea `src/sync/adaptive-scheduler.ts` con:

```typescript
import type { DbPool } from '../db/pool';
import type { TaskType } from '../conductor/types';
import { enqueueWithDedup } from '../db/repositories/agent-queue';
import { getAllFreshnessForUser } from '../db/repositories/sync-freshness';
import { logger } from '../logger';

export type ActivityLevel = 'active' | 'idle' | 'offline';

// Tipo di ritorno dello scheduler: funzione stop
export type StopScheduler = () => void;

// TARGET FRESHNESS per (syncType, activityLevel) in millisecondi.
// null = sospeso (non schedulare).
const TARGET_FRESHNESS_MS: Record<string, Partial<Record<ActivityLevel, number>>> = {
  'sync-orders':            { active: 20 * 60_000, idle: 60 * 60_000 },
  'sync-customers':         { active: 30 * 60_000, idle: 120 * 60_000 },
  'sync-ddt':               { active: 60 * 60_000 },
  'sync-invoices':          { active: 60 * 60_000 },
  'sync-products':          { active: 240 * 60_000 },
  'sync-prices':            { active: 240 * 60_000 },
  'sync-tracking':          { active: 15 * 60_000, idle: 30 * 60_000 },
  'sync-order-states':      { active: 5 * 60_000, idle: 15 * 60_000 },
};

export function getTargetFreshnessMs(syncType: string, level: ActivityLevel): number | null {
  return TARGET_FRESHNESS_MS[syncType]?.[level] ?? null;
}

export function stalenessScore(lastSyncAt: Date | null, targetFreshnessMs: number): number {
  if (!lastSyncAt) return 2.0; // mai sincronizzato → enqueue urgente
  return (Date.now() - lastSyncAt.getTime()) / targetFreshnessMs;
  // <1 = ancora fresco → skip; >=1 = scaduto → enqueue
}

const SYNC_TYPES = Object.keys(TARGET_FRESHNESS_MS) as TaskType[];

type GetAgentsByActivityFn = () => { active: string[]; idle: string[] };
type HasPendingTrackingFn = (pool: DbPool, userId: string) => Promise<boolean>;

type AdaptiveSchedulerDeps = {
  pool: DbPool;
  getAgentsByActivity: GetAgentsByActivityFn;
  hasPendingTracking?: HasPendingTrackingFn;
};

export async function schedulerTick(deps: AdaptiveSchedulerDeps): Promise<void> {
  const { pool, getAgentsByActivity, hasPendingTracking } = deps;
  const { active, idle } = getAgentsByActivity();

  const allAgents: Array<{ userId: string; level: ActivityLevel }> = [
    ...active.map(userId => ({ userId, level: 'active' as ActivityLevel })),
    ...idle.map(userId => ({ userId, level: 'idle' as ActivityLevel })),
  ];

  for (const { userId, level } of allAgents) {
    // Queue pressure: skip se userId ha op ERP write (P<=10) in coda o running
    const { rows: pressureRows } = await pool.query(
      `SELECT 1 FROM system.agent_operation_queue
       WHERE user_id = $1 AND status IN ('enqueued','running') AND priority <= 10 LIMIT 1`,
      [userId],
    );
    if (pressureRows.length > 0) {
      logger.debug('[AdaptiveScheduler] Skip: queue pressure for user', { userId });
      continue;
    }

    const freshness = await getAllFreshnessForUser(pool, userId);

    for (const syncType of SYNC_TYPES) {
      // sync-tracking: solo se ci sono ordini con tracking pending
      if (syncType === 'sync-tracking' && hasPendingTracking) {
        const hasPending = await hasPendingTracking(pool, userId);
        if (!hasPending) continue;
      }

      const target = getTargetFreshnessMs(syncType, level);
      if (!target) continue; // sospeso per questo livello

      const lastSyncAt = freshness[syncType] ?? null;
      const score = stalenessScore(lastSyncAt, target);

      if (score >= 1.0) {
        await enqueueWithDedup(pool, {
          userId,
          taskType: syncType,
          payload: {},
          priority: 500,
          requiresBrowser: true,
        }).catch((err: unknown) => {
          logger.warn('[AdaptiveScheduler] enqueue failed', { syncType, userId, err });
        });
      }
    }
  }
}

export function createAdaptiveScheduler(
  deps: AdaptiveSchedulerDeps,
  tickIntervalMs = 60_000,
): StopScheduler {
  let active = true;

  const loop = async (): Promise<void> => {
    if (!active) return;
    try {
      await schedulerTick(deps);
    } catch (err) {
      logger.error('[AdaptiveScheduler] tick error', { err });
    }
    if (active) setTimeout(loop, tickIntervalMs);
  };

  setTimeout(loop, tickIntervalMs); // primo tick dopo 1 intervallo (non subito)

  return () => { active = false; };
}
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/sync/adaptive-scheduler.spec.ts
```

Atteso: tutti PASS.

- [ ] **Step 5: Build + commit**

```bash
npm run build --prefix archibald-web-app/backend
git add archibald-web-app/backend/src/sync/adaptive-scheduler.ts \
        archibald-web-app/backend/src/sync/adaptive-scheduler.spec.ts
git commit -m "feat(scheduler): createAdaptiveScheduler con stalenessScore — sostituisce timer fissi"
```

---

## Task 4: Wire adaptive scheduler in `main.ts` + rimuovi smartCustomerSync stop/start

**Files:**
- Modify: `src/main.ts`
- Modify: `src/sync/sync-scheduler.ts`
- Modify: `src/sync/sync-scheduler.spec.ts`

- [ ] **Step 1: Rimuovi `stop()`/`start()` da `smartCustomerSync` in `sync-scheduler.ts`**

Nella funzione `smartCustomerSync`, rimuovi le chiamate a `stop()` e `start()`. Il mechanism `sync_paused_users` rimane — il Conductor già rispetta la pausa nel pickup.

```typescript
async function smartCustomerSync(userId: string, pool?: DbPool): Promise<void> {
  if (sessionCount > 0) {
    sessionCount++;
    resetSafetyTimeout();
    return;
  }

  sessionCount = 1;

  if (pool) {
    pool.query(
      `INSERT INTO system.sync_paused_users (user_id, reason)
       VALUES ($1, 'interactive_session') ON CONFLICT DO NOTHING`,
      [userId]
    ).catch((err: unknown) => logger.warn('[SyncScheduler] Failed to insert sync_paused_users', { err }));
  }

  // RIMOSSO: if (running) { stop(); } — non fermiamo più l'intero scheduler
  // Il Conductor già esclude P=500 per userId in sync_paused_users

  resetSafetyTimeout();

  const { active } = getAgentsByActivity();
  const targetUserId = active.includes(userId) ? userId : active[0] ?? userId;
  await enqueue('sync-customers', targetUserId, {});
}
```

- [ ] **Step 2: Aggiorna i test di `smartCustomerSync` in `sync-scheduler.spec.ts`**

Trova i test che verificano che lo scheduler si fermi quando viene chiamato `smartCustomerSync`. Aggiornali per verificare che lo scheduler NON si ferma (rimuovili o aggiornali).

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/sync/sync-scheduler.spec.ts
```

Risolvi eventuali fallimenti aggiornando i test che si aspettavano il vecchio comportamento di stop.

- [ ] **Step 3: Aggiungi wiring adaptive scheduler in `main.ts`**

Dopo la creazione del Conductor (circa riga 504), aggiungi:

```typescript
import { createAdaptiveScheduler } from './sync/adaptive-scheduler';

// Funzione per verificare se esistono ordini con tracking pending
async function hasPendingTrackingOrders(pool: DbPool, userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM agents.order_records
     WHERE user_id = $1 AND tracking_number IS NOT NULL
       AND courier IS NOT NULL AND delivered_at IS NULL
     LIMIT 1`,
    [userId],
  );
  return rows.length > 0;
}

// Avvia adaptive scheduler (inizia dopo 1 minuto)
const stopAdaptiveScheduler = createAdaptiveScheduler({
  pool,
  getAgentsByActivity: () => ({
    active: cachedActiveAgents,
    idle: cachedIdleAgents,
  }),
  hasPendingTracking: hasPendingTrackingOrders,
});
```

- [ ] **Step 4: Aggiungi `stopAdaptiveScheduler` nel graceful shutdown**

Nel cleanup di main.ts (cerca `clearInterval` e `syncScheduler.stop()`), aggiungi:

```typescript
stopAdaptiveScheduler();
```

- [ ] **Step 5: Mantieni il vecchio scheduler per le sync NON coperte dall'adaptive (article sync, address sync, reminder)**

Il vecchio `syncScheduler` gestisce alcune operazioni che l'adaptive scheduler non copre:
- `scheduleArticleSync` (enqueue sync-order-articles per ordini con articles_synced_at IS NULL)
- `scheduleAddressSync` (enqueue sync-customer-addresses per clienti con addresses_synced_at IS NULL)
- `checkCustomerReminders` (reminder giornalieri)

**Mantieni** `syncScheduler.start()` esistente ma riduci il suo `agentSyncMs` a solo ciò che fa ancora (article + address + reminders). Le sync principali (orders, customers, ddt, invoices, products, prices, tracking, order-states) sono ora gestite dall'adaptive scheduler.

Per evitare conflitti, rimuovi `ACTIVE_SYNC_TYPES` e `IDLE_SYNC_TYPES` dal vecchio scheduler e lascia solo `scheduleArticleSync`, `scheduleAddressSync`, `checkCustomerReminders`.

- [ ] **Step 6: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 7: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend
```

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/main.ts \
        archibald-web-app/backend/src/sync/sync-scheduler.ts \
        archibald-web-app/backend/src/sync/sync-scheduler.spec.ts
git commit -m "feat(scheduler): wiring adaptive scheduler in main.ts + rimozione smartCustomerSync stop/start"
```

---

## Task 5: Frontend — `priority` in `TrackedOperation` + pressione derivata

**Files:**
- Modify: `src/contexts/OperationTrackingContext.tsx`
- Modify: `src/contexts/OperationTrackingContext.spec.tsx`

- [ ] **Step 1: Scrivi il test per il campo `priority`**

In `OperationTrackingContext.spec.tsx`:

```typescript
test('TrackedOperation include priority da JOB_STARTED event', async () => {
  // Simula WS message JOB_STARTED con priority=10
  const { result } = renderHook(() => useOperationTracking(), { wrapper: TestWrapper });

  act(() => {
    simulateWsMessage({
      event: 'JOB_STARTED',
      jobId: 'job-1',
      taskId: 'job-1',
      type: 'submit-order',
      priority: 10,
      entityName: 'Ordine #1234',
      entityId: 'ord-1',
    });
  });

  expect(result.current.userOperations[0]?.priority).toBe(10);
});
```

- [ ] **Step 2: Aggiungi `priority` e `hasPressure` a `TrackedOperation` e al contesto**

In `OperationTrackingContext.tsx`:

```typescript
// Aggiorna il tipo TrackedOperation
type TrackedOperation = {
  orderId: string;
  jobId: string;
  customerName: string;
  status: "queued" | "active" | "completed" | "failed" | "cancelled";
  progress: number;
  label: string;
  completedLabel?: string;
  navigateTo?: string;
  operationType?: string;
  error?: string;
  startedAt: number;
  dismissedAt?: number;
  isBackground: boolean;
  priority?: number;      // NUOVO — da JOB_STARTED
  runAfter?: number;      // NUOVO — timestamp ms se task preemptato con run_after
};

// Aggiorna OperationTrackingValue
type OperationTrackingValue = {
  activeOperations: TrackedOperation[];
  userOperations: TrackedOperation[];
  backgroundOperations: TrackedOperation[];
  hasPressure: boolean;   // NUOVO — true se ci sono user ERP write ops active/queued
  trackOperation: (...) => void;
  dismissOperation: (jobId: string) => void;
  cancelOperation: (jobId: string) => Promise<void>;
};
```

Aggiungi `priority` nei punti dove viene creata una `TrackedOperation` da WS events (cerca ogni luogo dove viene creato un oggetto con `isBackground`):

```typescript
// Dove viene processato JOB_STARTED (cerca event === 'JOB_STARTED')
isBackground: isBackgroundOperation(type),
priority: (event as any).priority as number | undefined,
```

Aggiungi `hasPressure` nel valore del contesto:

```typescript
// Operazioni ERP write (P=10) che indicano pressione alta
const ERP_WRITE_TYPES = new Set([
  'submit-order', 'edit-order', 'delete-order', 'send-to-verona',
  'batch-send-to-verona', 'batch-delete-orders', 'create-customer', 'update-customer',
]);

const hasPressure = userOperations.some(
  op => ERP_WRITE_TYPES.has(op.operationType ?? '') &&
    (op.status === 'active' || op.status === 'queued')
);

// Nel return del context value:
return {
  activeOperations, userOperations, backgroundOperations,
  hasPressure, // NUOVO
  trackOperation, dismissOperation, cancelOperation,
};
```

- [ ] **Step 3: Aggiorna il tipo `useOperationTracking`**

Cerca dove viene esportato `useOperationTracking` e aggiungi `hasPressure` al tipo:

```typescript
export function useOperationTracking(): OperationTrackingValue {
  // ...
}
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/contexts/OperationTrackingContext.spec.tsx
```

- [ ] **Step 5: Type check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx \
        archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx
git commit -m "feat(frontend): TrackedOperation.priority + hasPressure derivata da ERP write ops"
```

---

## Task 6: Frontend — Pressure indicator in GlobalOperationBanner

**Files:**
- Modify: `src/components/GlobalOperationBanner.tsx`
- Modify: `src/components/GlobalOperationBanner.spec.tsx`

- [ ] **Step 1: Scrivi il test**

In `GlobalOperationBanner.spec.tsx`:

```typescript
test('BgStripe mostra "Sync in pausa" quando hasPressure=true', () => {
  const { getByText } = render(
    <GlobalOperationBanner
      userOps={[mockActiveSubmitOrder]}
      bgOps={[mockActiveSyncOrders]}
      hasPressure={true}
    />
  );
  expect(getByText(/pausa/i)).toBeInTheDocument();
});

test('BgStripe mostra label sync quando hasPressure=false', () => {
  const { getByText } = render(
    <GlobalOperationBanner
      userOps={[]}
      bgOps={[mockActiveSyncOrders]}
      hasPressure={false}
    />
  );
  expect(getByText(/Aggiornamento ordini/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Aggiorna `GlobalOperationBanner` per ricevere e usare `hasPressure`**

In `GlobalOperationBanner.tsx`, aggiungi `hasPressure` come prop e aggiorna `BgStripe`:

```typescript
// Label specifiche per operazioni BG
const BG_OP_ACTIVE_LABELS: Record<string, string> = {
  'sync-orders': 'Aggiornamento ordini',
  'sync-customers': 'Aggiornamento clienti',
  'sync-ddt': 'Aggiornamento DDT',
  'sync-invoices': 'Aggiornamento fatture',
  'sync-products': 'Aggiornamento prodotti',
  'sync-prices': 'Aggiornamento prezzi',
  'sync-tracking': 'Verifica spedizioni',
  'sync-order-states': 'Aggiornamento stati',
  'sync-customer-addresses': 'Aggiornamento indirizzi',
  'sync-order-articles': 'Caricamento articoli',
};

function BgStripe({
  bgOps,
  hasPressure,
  isExpanded,
  onClick,
}: {
  bgOps: TrackedOperation[];
  hasPressure: boolean;
  isExpanded: boolean;
  onClick: () => void;
}) {
  // Se pressione alta (user ERP write ops attive): mostra messaggio pausa
  if (hasPressure) {
    return (
      <div style={BG_STRIPE_STYLE} onClick={onClick}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4a5568", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: "11px", color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ⏸ Sync automatiche in pausa
        </span>
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{isExpanded ? "▲" : "▸"}</span>
      </div>
    );
  }

  // Label specifiche per il tipo di sync attivo
  const activeOp = bgOps.find(op => op.status === 'active');
  const label = activeOp
    ? (BG_OP_ACTIVE_LABELS[activeOp.operationType ?? ''] ?? activeOp.label)
    : bgOps.map(op => BG_OP_ACTIVE_LABELS[op.operationType ?? ''] ?? op.label).join(', ');

  return (
    <div style={BG_STRIPE_STYLE} onClick={onClick}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a3e635", flexShrink: 0, animation: "gob-pulse 2s ease-in-out infinite" }} />
      <span style={{ flex: 1, fontSize: "11px", color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{isExpanded ? "▲" : "▸"}</span>
    </div>
  );
}
```

- [ ] **Step 3: Aggiorna il componente principale per passare `hasPressure`**

In `GlobalOperationBanner`, leggi `hasPressure` dal contesto e passalo a `BgStripe`:

```typescript
const { userOperations, backgroundOperations, hasPressure } = useOperationTracking();
// ...
<BgStripe bgOps={backgroundOperations} hasPressure={hasPressure} isExpanded={isExpanded} onClick={handleBgClick} />
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/components/GlobalOperationBanner.spec.tsx
```

- [ ] **Step 5: Type check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx \
        archibald-web-app/frontend/src/components/GlobalOperationBanner.spec.tsx
git commit -m "feat(banner): pressure indicator in BgStripe + label specifiche BG ops"
```

---

## Task 7: Frontend — QueueDrawer 3 sezioni + ETA

**Files:**
- Modify: `src/components/QueueDrawer.tsx`
- Modify: `src/components/QueueDrawer.spec.tsx`

- [ ] **Step 1: Scrivi i test**

In `QueueDrawer.spec.tsx`:

```typescript
test('mostra sezione "Tue operazioni" con user ops', () => {
  const { getByText } = render(
    <QueueDrawer
      isOpen={true}
      userOperations={[mockSubmitOrder]}
      bgOperations={[mockSyncOrders]}
      hasPressure={false}
      onClose={vi.fn()}
      onCancel={vi.fn()}
      onNavigate={vi.fn()}
    />
  );
  expect(getByText(/Tue operazioni/i)).toBeInTheDocument();
});

test('quando hasPressure, mostra sezione "In pausa" per le bg ops', () => {
  const { getByText } = render(
    <QueueDrawer
      isOpen={true}
      userOperations={[mockSubmitOrder]}
      bgOperations={[mockSyncOrders]}
      hasPressure={true}
      onClose={vi.fn()}
      onCancel={vi.fn()}
      onNavigate={vi.fn()}
    />
  );
  expect(getByText(/In pausa/i)).toBeInTheDocument();
});

test('mostra ETA per op active con startedAt', () => {
  const opWithEta = { ...mockSubmitOrder, status: 'active', startedAt: Date.now() - 15_000, operationType: 'submit-order' };
  const { container } = render(
    <QueueDrawer isOpen={true} userOperations={[opWithEta]} bgOperations={[]} hasPressure={false} onClose={vi.fn()} onCancel={vi.fn()} onNavigate={vi.fn()} />
  );
  // Deve mostrare un testo tipo "~30s" o "~1min"
  expect(container.textContent).toMatch(/~\d+/);
});
```

- [ ] **Step 2: Aggiorna `QueueDrawer.tsx` con 3 sezioni + ETA + label specifiche**

```typescript
// Durate default per ETA (ms) — fallback se metrics non disponibili
const DEFAULT_DURATION_MS: Partial<Record<string, number>> = {
  'submit-order': 45_000, 'edit-order': 30_000, 'delete-order': 20_000,
  'send-to-verona': 35_000, 'create-customer': 40_000, 'update-customer': 25_000,
  'sync-orders': 35_000, 'sync-customers': 50_000, 'sync-ddt': 80_000,
  'sync-invoices': 20_000, 'sync-tracking': 5_000, 'sync-order-articles': 30_000,
};

const BG_OP_LABELS_SPECIFIC: Record<string, string> = {
  'sync-orders': 'Aggiornamento ordini',
  'sync-customers': 'Aggiornamento clienti',
  'sync-ddt': 'Aggiornamento DDT',
  'sync-invoices': 'Aggiornamento fatture',
  'sync-products': 'Aggiornamento prodotti',
  'sync-prices': 'Aggiornamento prezzi',
  'sync-tracking': 'Verifica spedizioni',
  'sync-order-states': 'Aggiornamento stati',
  'sync-customer-addresses': 'Aggiornamento indirizzi',
  'sync-order-articles': 'Caricamento articoli ordine',
};

function formatEta(op: TrackedOperation): string | null {
  if (op.status !== 'active' || !op.startedAt || !op.operationType) return null;
  const elapsed = Date.now() - op.startedAt;
  const total = DEFAULT_DURATION_MS[op.operationType];
  if (!total) return null;
  const remaining = Math.max(0, total - elapsed);
  if (remaining < 5_000) return '~5s';
  if (remaining < 60_000) return `~${Math.ceil(remaining / 1_000)}s`;
  return `~${Math.ceil(remaining / 60_000)}min`;
}

// Aggiorna il tipo delle props
type QueueDrawerProps = {
  isOpen: boolean;
  userOperations: TrackedOperation[];
  bgOperations: TrackedOperation[];
  hasPressure: boolean;       // NUOVO
  onClose: () => void;
  onCancel: (jobId: string) => Promise<void>;
  onNavigate: (path: string) => void;
};

// Nel corpo del componente QueueDrawer, sostituisci le sezioni esistenti
// con 3 sezioni:

// SEZIONE 1: Tue operazioni
{userOperations.length > 0 && (
  <div style={{ padding: '10px 16px 6px' }}>
    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#8892a4', marginBottom: '8px' }}>
      Tue operazioni
    </div>
    {userOperations.map(op => (
      <QueueItem
        key={op.jobId}
        op={op}
        label={USER_OP_LABELS[op.operationType ?? ''] ?? op.label}
        eta={formatEta(op)}
        onCancel={onCancel}
        onNavigate={onNavigate}
      />
    ))}
  </div>
)}

// SEZIONE 2: Automatiche (bg ops non preemptate e non paused)
{bgOperations.length > 0 && !hasPressure && (
  <div style={{ padding: '6px 16px', borderTop: '1px solid #f1f2f6' }}>
    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#8892a4', marginBottom: '8px' }}>
      Automatiche
    </div>
    {bgOperations.filter(op => op.status !== 'cancelled').map(op => (
      <QueueItem
        key={op.jobId}
        op={op}
        label={BG_OP_LABELS_SPECIFIC[op.operationType ?? ''] ?? op.label}
        eta={formatEta(op)}
        onCancel={onCancel}
        onNavigate={onNavigate}
      />
    ))}
  </div>
)}

// SEZIONE 3: In pausa (solo quando hasPressure=true e ci sono bg ops)
{bgOperations.length > 0 && hasPressure && (
  <div style={{ padding: '6px 16px', borderTop: '1px solid #f1f2f6' }}>
    <div style={{ fontSize: '11px', color: '#b2bec3', textAlign: 'center', padding: '8px 0' }}>
      ⏸ {bgOperations.length} sync automatiche in pausa — riprenderanno al termine delle tue operazioni
    </div>
  </div>
)}
```

Crea un componente interno `QueueItem` per un singolo item della lista (riutilizzabile tra sezioni).

- [ ] **Step 3: Aggiorna il parent che usa `QueueDrawer`** per passare `hasPressure`

Cerca dove `QueueDrawer` viene renderizzato in `GlobalOperationBanner.tsx` e aggiungi `hasPressure`:

```typescript
<QueueDrawer
  isOpen={isExpanded}
  userOperations={userOperations}
  bgOperations={backgroundOperations}
  hasPressure={hasPressure}  // NUOVO
  onClose={() => setIsExpanded(false)}
  onCancel={cancelOperation}
  onNavigate={(path) => { navigate(path); setIsExpanded(false); }}
/>
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose src/components/QueueDrawer.spec.tsx
```

- [ ] **Step 5: Type check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/QueueDrawer.tsx \
        archibald-web-app/frontend/src/components/QueueDrawer.spec.tsx \
        archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx
git commit -m "feat(drawer): QueueDrawer 3 sezioni (utente/automatiche/pausa) + ETA + label specifiche"
```

---

## Task 8: Test suite finale + push + verifica prod

- [ ] **Step 1: Esegui tutta la test suite backend**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: tutti PASS.

- [ ] **Step 2: Type check frontend completo**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: zero errori TypeScript.

- [ ] **Step 3: Test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

- [ ] **Step 4: Push**

```bash
git push origin master
```

- [ ] **Step 5: Verifica deploy**

```bash
gh run list --limit 3
```

Atteso: `completed success`.

- [ ] **Step 6: Verifica prod — adaptive scheduler gira**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   logs backend --tail 100 2>&1 | grep 'AdaptiveScheduler'"
```

Atteso: log `[AdaptiveScheduler]` con enqueue e score > 1.0.

- [ ] **Step 7: Verifica prod — sync_freshness si aggiorna**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   'SELECT user_id, sync_type, last_completed_at FROM agents.sync_freshness ORDER BY last_completed_at DESC LIMIT 10;'"
```

Atteso: righe con `last_completed_at` recenti (ultime ore).

- [ ] **Step 8: Test manuale pressione banner**

1. Vai su `formicanera.com/orders`
2. Invia un ordine (submit-order)
3. Verifica che la striscia BG del banner mostri "⏸ Sync automatiche in pausa"
4. Dopo il completamento dell'ordine, verifica che la striscia BG torni a mostrare le sync normalmente

---

## Self-review checklist

**Spec coverage:**
- F2-1 ✅ Task 1+2 (sync_freshness repository + Worker update)
- F2-2 ✅ Task 3 (stalenessScore + createAdaptiveScheduler)
- F2-3 ✅ Task 3+4 (schedulerTick con freshness + pressure)
- F2-4 ✅ Task 4 (rimozione smartCustomerSync stop/start)
- F2 dedup_key_external: già gestito da `enqueueWithDedup` — nessuna azione aggiuntiva
- F3-1 ✅ Task 5 (TrackedOperation.priority + hasPressure)
- F3-2 ✅ Task 6 (label specifiche BgStripe)
- F3-3 ✅ Task 6 (pressure indicator)
- F3-4 ✅ Task 7 (QueueDrawer 3 sezioni)
- F3-5 ✅ Task 7 (ETA con DEFAULT_DURATION_MS, tabella bot_task_metrics per miglioramento futuro)

**Gap nota**: il vecchio scheduler (`sync-scheduler.ts`) continua a gestire article sync, address sync e reminders. La migrazione è graduale — il vecchio scheduler rimane attivo per queste funzioni. Se in futuro si vuole migrare anche article/address sync al nuovo scheduler, è un task separato.

**F0-9 (filter combo OrdersAll)** rimane non coperto — richiede sessione live Playwright su ERP DOM. Documentato come task separato di diagnostica.

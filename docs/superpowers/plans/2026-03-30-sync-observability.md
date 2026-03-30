# Sync Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correggere tre bug di deduplication BullMQ + aggiungere classificazione outcome nei job sync per eliminare falsi positivi nella dashboard di monitoring.

**Architecture:** Quattro fix mirati in cinque file backend + aggiornamento frontend. Nessuna nuova infrastruttura, nessun nuovo schema DB. Il processor già scrive `{ circuitBreakerSkipped, rescheduled, skipped }` nel `returnvalue.data` dei job; questa implementazione li legge e li espone correttamente.

**Tech Stack:** BullMQ (queue options), TypeScript strict, Express + Supertest (integration tests), Vitest (unit tests), React 19 (dashboard component)

---

## File Map

| File | Ruolo |
|------|-------|
| `backend/src/operations/operation-queue.ts:61` | `removeOnFail: { age: 3600, count: 100 }` |
| `backend/src/operations/operation-queue.spec.ts:72` | Aggiornare assertion `removeOnFail` |
| `backend/src/sync/sync-scheduler.ts:90` | JobId semi-statico per `sync-customer-addresses` |
| `backend/src/sync/sync-scheduler.spec.ts` | Aggiornare 2 test sul jobId indirizzi |
| `backend/src/sync/circuit-breaker.ts` | Aggiungere `getAllStatus()` + tipo `CircuitBreaker` |
| `backend/src/sync/circuit-breaker.spec.ts` | Test per `getAllStatus()` |
| `backend/src/routes/sync-status.ts` | `classifyOutcome`, metriche real vs skip, endpoint CB |
| `backend/src/routes/sync-status.spec.ts` | Test `classifyOutcome` + endpoint CB |
| `backend/src/server.ts` | Aggiungere `getCircuitBreakerStatus` a `AppDeps` e `syncStatusDeps` |
| `backend/src/main.ts` | Passare `getCircuitBreakerStatus: () => circuitBreaker.getAllStatus()` |
| `frontend/src/components/SyncMonitoringDashboard.tsx` | Tipi aggiornati, icone outcome, `lastRealRunTime`, sezione CB |

---

## Task 1: Fix `removeOnFail` in operation-queue.ts

**Files:**
- Modify: `archibald-web-app/backend/src/operations/operation-queue.ts` (riga 61)
- Test: `archibald-web-app/backend/src/operations/operation-queue.spec.ts` (riga 69-73)

**Contesto:** Il test `'enqueue adds job with correct priority and returns jobId'` verifica le opzioni passate a `mockAdd`. La riga con `removeOnFail` va aggiornata prima dell'implementazione.

- [ ] **Step 1: Aggiornare il test (TDD — fare fallire prima)**

Nel file `operation-queue.spec.ts`, trovare la chiamata `expect(mockAdd).toHaveBeenCalledWith(...)` nel test `'enqueue adds job with correct priority and returns jobId'`. Cambiare solo la riga `removeOnFail`:

```ts
// Prima (riga ~72):
removeOnFail: { count: 100 },

// Dopo:
removeOnFail: { age: 3600, count: 100 },
```

- [ ] **Step 2: Verificare che il test fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose operation-queue.spec.ts
```

Expected: FAIL — `expected { count: 100 } to deeply equal { age: 3600, count: 100 }`

- [ ] **Step 3: Applicare il fix in operation-queue.ts**

Nel file `operation-queue.ts`, nella funzione `getJobOptions` (~riga 57-73), cambiare:

```ts
// Prima (riga 61):
removeOnFail: { count: 100 },

// Dopo:
removeOnFail: { age: 3600, count: 100 },
```

- [ ] **Step 4: Verificare che i test passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose operation-queue.spec.ts
```

Expected: tutti i test PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/operation-queue.ts \
        archibald-web-app/backend/src/operations/operation-queue.spec.ts
git commit -m "fix(queue): add age:3600 to removeOnFail so failed jobIds are released after 1h"
```

---

## Task 2: Semi-static jobId per `sync-customer-addresses`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts` (riga 90)
- Test: `archibald-web-app/backend/src/sync/sync-scheduler.spec.ts` (righe 394–440)

**Contesto:** `ADDRESS_SYNC_DELAY_MS = 5 * 60 * 1000` è già definito ed esportato dal file. Il jobId `sync-customer-addresses-${agentUserId}-${Math.floor(Date.now() / ADDRESS_SYNC_DELAY_MS)}` cambia ogni 5 minuti mantenendo la deduplicazione dentro la finestra.

- [ ] **Step 1: Aggiornare il primo test — usa `expect.stringMatching`**

Nel file `sync-scheduler.spec.ts`, trovare il test `'enqueues sync-customer-addresses after ADDRESS_SYNC_DELAY_MS for active agents'` (riga ~394). Cambiare l'assertion finale da:

```ts
expect(enqueue).toHaveBeenCalledWith(
  'sync-customer-addresses',
  'user-1',
  {
    customers: [
      { erpId: 'CUST-001', customerName: 'Rossi Mario' },
      { erpId: 'CUST-002', customerName: 'Verdi Luca' },
    ],
  },
  'sync-customer-addresses-user-1',
);
```

a:

```ts
expect(enqueue).toHaveBeenCalledWith(
  'sync-customer-addresses',
  'user-1',
  {
    customers: [
      { erpId: 'CUST-001', customerName: 'Rossi Mario' },
      { erpId: 'CUST-002', customerName: 'Verdi Luca' },
    ],
  },
  expect.stringMatching(/^sync-customer-addresses-user-1-\d+$/),
);
```

- [ ] **Step 2: Sostituire il secondo test — verifica il cambio di slot**

Trovare e rimpiazzare integralmente il test `'address sync uses stable idempotency key sync-customer-addresses-{userId}'` (riga ~425) con:

```ts
test('address sync jobId changes across time slots to prevent permanent deduplication', async () => {
  vi.setSystemTime(0);
  const enqueue = createMockEnqueue();
  const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
    { erp_id: 'CUST-001', name: 'Rossi Mario' },
  ]);
  const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), undefined, getCustomersNeedingAddressSync);

  scheduler.start(intervals);
  await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);
  const call1 = enqueue.mock.calls.find((c) => c[0] === 'sync-customer-addresses');
  expect(call1).toBeDefined();
  const jobId1 = call1![3] as string;

  enqueue.mockClear();
  await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);
  const call2 = enqueue.mock.calls.find((c) => c[0] === 'sync-customer-addresses');
  expect(call2).toBeDefined();
  const jobId2 = call2![3] as string;

  expect(jobId1).toMatch(/^sync-customer-addresses-user-1-\d+$/);
  expect(jobId2).toMatch(/^sync-customer-addresses-user-1-\d+$/);
  expect(jobId1).not.toBe(jobId2);

  scheduler.stop();
});
```

- [ ] **Step 3: Verificare che i 2 test falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose sync-scheduler.spec.ts
```

Expected: 2 test FAIL — il pattern `\d+` non matcha `'sync-customer-addresses-user-1'` (no numero finale) e i due jobId sono identici.

- [ ] **Step 4: Applicare il fix in sync-scheduler.ts**

Nel file `sync-scheduler.ts`, nella funzione `scheduleAddressSync` (~riga 86-101), cambiare la riga con il 4° argomento di `enqueue`:

```ts
// Prima (riga 90):
`sync-customer-addresses-${agentUserId}`,

// Dopo:
`sync-customer-addresses-${agentUserId}-${Math.floor(Date.now() / ADDRESS_SYNC_DELAY_MS)}`,
```

- [ ] **Step 5: Verificare che tutti i test passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose sync-scheduler.spec.ts
```

Expected: tutti i test PASS.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/sync/sync-scheduler.ts \
        archibald-web-app/backend/src/sync/sync-scheduler.spec.ts
git commit -m "fix(scheduler): semi-static jobId for sync-customer-addresses prevents permanent BullMQ deduplication"
```

---

## Task 3: Aggiungere `getAllStatus()` a circuit-breaker.ts

**Files:**
- Modify: `archibald-web-app/backend/src/sync/circuit-breaker.ts`
- Test: `archibald-web-app/backend/src/sync/circuit-breaker.spec.ts`

**Contesto:** `mapRowToState` e `CircuitBreakerRow` sono già definiti nel file e gestiscono il mapping corretto da row DB a `CircuitBreakerState`.

- [ ] **Step 1: Scrivere i test failing per `getAllStatus()`**

In `circuit-breaker.spec.ts`, aggiungere questo `describe` block subito prima dell'ultimo `});` del file:

```ts
describe('getAllStatus', () => {
  test('returns empty array when no circuit breaker entries exist', async () => {
    const pool = createMockPool([{ rows: [] }]);
    const cb = createCircuitBreaker(pool);

    const result = await cb.getAllStatus();

    expect(result).toEqual([]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('system.circuit_breaker'),
    );
  });

  test('returns mapped CircuitBreakerState for all entries ordered by updated_at DESC', async () => {
    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const nowDate = new Date().toISOString();
    const rows = [
      {
        user_id: 'user-1',
        sync_type: 'sync-orders',
        consecutive_failures: 3,
        total_failures_24h: 5,
        last_failure_at: futureDate,
        paused_until: futureDate,
        last_error: 'Connection timeout',
        last_success_at: null,
        updated_at: nowDate,
      },
    ];
    const pool = createMockPool([{ rows }]);
    const cb = createCircuitBreaker(pool);

    const result = await cb.getAllStatus();

    expect(result).toEqual([{
      userId: 'user-1',
      syncType: 'sync-orders',
      consecutiveFailures: 3,
      totalFailures24h: 5,
      lastFailureAt: new Date(futureDate),
      pausedUntil: new Date(futureDate),
      lastError: 'Connection timeout',
      lastSuccessAt: null,
      updatedAt: new Date(nowDate),
    }]);
  });

  test('returns multiple entries', async () => {
    const nowDate = new Date().toISOString();
    const rows = [
      {
        user_id: 'user-1', sync_type: 'sync-orders', consecutive_failures: 1,
        total_failures_24h: 1, last_failure_at: null, paused_until: null,
        last_error: null, last_success_at: null, updated_at: nowDate,
      },
      {
        user_id: 'user-2', sync_type: 'sync-customers', consecutive_failures: 2,
        total_failures_24h: 2, last_failure_at: null, paused_until: null,
        last_error: null, last_success_at: null, updated_at: nowDate,
      },
    ];
    const pool = createMockPool([{ rows }]);
    const cb = createCircuitBreaker(pool);

    const result = await cb.getAllStatus();

    expect(result).toHaveLength(2);
    expect(result[0].userId).toBe('user-1');
    expect(result[1].userId).toBe('user-2');
  });
});
```

- [ ] **Step 2: Verificare che i test falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose circuit-breaker.spec.ts
```

Expected: 3 test FAIL — `cb.getAllStatus is not a function`

- [ ] **Step 3: Aggiungere `getAllStatus` a circuit-breaker.ts**

Nel file `circuit-breaker.ts`, aggiungere `getAllStatus` come ultimo metodo nell'oggetto ritornato da `createCircuitBreaker` (subito dopo `getState`, prima della chiusura `};`):

```ts
async getAllStatus(): Promise<CircuitBreakerState[]> {
  const { rows } = await pool.query<CircuitBreakerRow>(
    `SELECT user_id, sync_type, consecutive_failures, total_failures_24h,
            last_failure_at, paused_until, last_error, last_success_at, updated_at
     FROM system.circuit_breaker
     ORDER BY updated_at DESC`,
  );
  return rows.map(mapRowToState);
},
```

Alla fine del file, aggiungere `CircuitBreaker` al tipo esportato. Aggiungere prima della sezione `export`:

```ts
type CircuitBreaker = ReturnType<typeof createCircuitBreaker>;
```

E aggiornare l'export esistente per includere `CircuitBreaker`:

```ts
// Prima:
export type { CircuitBreakerState, CircuitBreakerRow };

// Dopo:
export type { CircuitBreakerState, CircuitBreakerRow, CircuitBreaker };
```

- [ ] **Step 4: Verificare che tutti i test passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose circuit-breaker.spec.ts
```

Expected: tutti i test PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/circuit-breaker.ts \
        archibald-web-app/backend/src/sync/circuit-breaker.spec.ts
git commit -m "feat(circuit-breaker): add getAllStatus() to expose all CB entries for monitoring"
```

---

## Task 4: Aggiornare sync-status.ts — classifyOutcome, metriche reali, endpoint CB

**Files:**
- Modify: `archibald-web-app/backend/src/routes/sync-status.ts`
- Test: `archibald-web-app/backend/src/routes/sync-status.spec.ts`

**Contesto chiave:**
- `job.returnvalue` è di tipo `OperationJobResult = { success: boolean; data?: Record<string,unknown>; duration: number }`
- I segnali di skip sono in `job.returnvalue.data`: `{ circuitBreakerSkipped: true }`, `{ rescheduled: true }`, `{ skipped: true }`
- Il test usa `(deps.queue as any).queue = { getJobs: vi.fn()... }` perché `createMockDeps()` non lo inizializza

### 4a — Scrivere i test failing

- [ ] **Step 1: Aggiornare l'import in sync-status.spec.ts**

Alla riga 4, aggiungere `classifyOutcome` all'import:

```ts
// Prima:
import { createSyncStatusRouter, createQuickCheckRouter, type SyncStatusRouterDeps } from './sync-status';

// Dopo:
import { createSyncStatusRouter, createQuickCheckRouter, classifyOutcome, type SyncStatusRouterDeps } from './sync-status';
```

- [ ] **Step 2: Aggiungere i nuovi `describe` blocks a sync-status.spec.ts**

Aggiungere i seguenti blocchi alla fine del file (prima dell'ultimo `}`):

```ts
describe('classifyOutcome', () => {
  test('circuitBreakerSkipped in data → circuit_breaker_skip', () => {
    expect(classifyOutcome({ data: { circuitBreakerSkipped: true } })).toBe('circuit_breaker_skip');
  });

  test('rescheduled in data → rescheduled', () => {
    expect(classifyOutcome({ data: { rescheduled: true } })).toBe('rescheduled');
  });

  test('skipped in data → skipped', () => {
    expect(classifyOutcome({ data: { skipped: true } })).toBe('skipped');
  });

  test('normal result → real', () => {
    expect(classifyOutcome({ success: true, data: {}, duration: 1000 })).toBe('real');
  });

  test('null returnvalue → real', () => {
    expect(classifyOutcome(null)).toBe('real');
  });
});

describe('GET /api/sync/monitoring/sync-history', () => {
  function makeMockJob(overrides: {
    type?: string;
    finishedOn?: number;
    processedOn?: number;
    failedReason?: string;
    returnvalue?: Record<string, unknown> | null;
  } = {}) {
    const finishedOn = overrides.finishedOn ?? Date.now();
    return {
      data: { type: overrides.type ?? 'sync-customers', userId: 'user-1' },
      finishedOn,
      processedOn: overrides.processedOn ?? finishedOn - 1000,
      failedReason: overrides.failedReason,
      returnvalue: overrides.returnvalue ?? { success: true, data: {}, duration: 1000 },
    };
  }

  function setQueueJobs(d: SyncStatusRouterDeps, jobs: ReturnType<typeof makeMockJob>[]) {
    (d.queue as any).queue = { getJobs: vi.fn().mockResolvedValue(jobs) };
  }

  test('circuit_breaker_skip outcome: circuitBreakerActive true and health paused', async () => {
    setQueueJobs(deps, [
      makeMockJob({ returnvalue: { success: true, data: { circuitBreakerSkipped: true }, duration: 1 } }),
    ]);

    const app = createApp(deps);
    const res = await request(app).get('/api/sync/monitoring/sync-history');

    expect(res.status).toBe(200);
    const stats = res.body.types['sync-customers'];
    expect(stats.circuitBreakerActive).toBe(true);
    expect(stats.health).toBe('paused');
    expect(stats.history[0].outcome).toBe('circuit_breaker_skip');
    expect(stats.skipCount).toBe(1);
  });

  test('lastRealRunTime excludes skip outcomes, uses most recent real job', async () => {
    const realJobTime = 1_000_000;
    const skipJobTime = 2_000_000;
    setQueueJobs(deps, [
      makeMockJob({ finishedOn: skipJobTime, returnvalue: { success: true, data: { rescheduled: true }, duration: 1 } }),
      makeMockJob({ finishedOn: realJobTime }),
    ]);

    const app = createApp(deps);
    const res = await request(app).get('/api/sync/monitoring/sync-history');

    const stats = res.body.types['sync-customers'];
    expect(stats.lastRealRunTime).toBe(new Date(realJobTime).toISOString());
    expect(stats.lastRunTime).toBe(new Date(skipJobTime).toISOString()); // lastRunTime non cambia
  });

  test('consecutiveFailures counts real failed jobs; CB skip does not reset the streak', async () => {
    setQueueJobs(deps, [
      makeMockJob({ finishedOn: 2000, returnvalue: { success: true, data: { circuitBreakerSkipped: true }, duration: 1 } }),
      makeMockJob({ finishedOn: 1000, failedReason: 'timeout' }),
    ]);

    const app = createApp(deps);
    const res = await request(app).get('/api/sync/monitoring/sync-history');

    const stats = res.body.types['sync-customers'];
    expect(stats.consecutiveFailures).toBe(1);
  });
});

describe('GET /api/sync/monitoring/circuit-breaker', () => {
  test('returns empty entries when getCircuitBreakerStatus not provided', async () => {
    const app = createApp(deps);
    const res = await request(app).get('/api/sync/monitoring/circuit-breaker');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, entries: [] });
  });

  test('returns mapped entries with isPaused computed from pausedUntil', async () => {
    const futureDate = new Date(Date.now() + 3_600_000);
    deps.getCircuitBreakerStatus = vi.fn().mockResolvedValue([{
      userId: 'user-1',
      syncType: 'sync-orders',
      consecutiveFailures: 3,
      totalFailures24h: 5,
      lastFailureAt: futureDate,
      pausedUntil: futureDate,
      lastError: 'Connection timeout',
      lastSuccessAt: null,
      updatedAt: new Date(),
    }]);

    const app = createApp(deps);
    const res = await request(app).get('/api/sync/monitoring/circuit-breaker');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).toMatchObject({
      userId: 'user-1',
      syncType: 'sync-orders',
      consecutiveFailures: 3,
      isPaused: true,
      lastError: 'Connection timeout',
    });
  });

  test('isPaused is false when pausedUntil is null', async () => {
    deps.getCircuitBreakerStatus = vi.fn().mockResolvedValue([{
      userId: 'user-1',
      syncType: 'sync-customers',
      consecutiveFailures: 1,
      totalFailures24h: 1,
      lastFailureAt: new Date(),
      pausedUntil: null,
      lastError: 'minor error',
      lastSuccessAt: null,
      updatedAt: new Date(),
    }]);

    const app = createApp(deps);
    const res = await request(app).get('/api/sync/monitoring/circuit-breaker');

    expect(res.body.entries[0].isPaused).toBe(false);
    expect(res.body.entries[0].pausedUntil).toBeNull();
  });
});
```

- [ ] **Step 3: Verificare che i test falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose sync-status.spec.ts
```

Expected: 10 test FAIL — `classifyOutcome is not exported`, `circuitBreakerActive` undefined, ecc.

### 4b — Implementare le modifiche a sync-status.ts

- [ ] **Step 4: Aggiungere import e tipi**

In cima a `sync-status.ts`, aggiungere l'import di `CircuitBreakerState` dopo gli import esistenti:

```ts
import type { CircuitBreakerState } from '../sync/circuit-breaker';
```

Aggiungere `getCircuitBreakerStatus` alla fine di `SyncStatusRouterDeps` (riga ~35, prima della `};`):

```ts
getCircuitBreakerStatus?: () => Promise<CircuitBreakerState[]>;
```

- [ ] **Step 5: Aggiungere `JobOutcome` e `classifyOutcome` prima di `createSyncStatusRouter`**

Inserire subito prima della riga `function createSyncStatusRouter(deps: SyncStatusRouterDeps)`:

```ts
type JobOutcome = 'real' | 'circuit_breaker_skip' | 'rescheduled' | 'skipped';

function classifyOutcome(returnvalue: Record<string, unknown> | null | undefined): JobOutcome {
  const data = returnvalue?.data as Record<string, unknown> | undefined;
  if (data?.circuitBreakerSkipped) return 'circuit_breaker_skip';
  if (data?.rescheduled) return 'rescheduled';
  if (data?.skipped) return 'skipped';
  return 'real';
}
```

- [ ] **Step 6: Sostituire il loop interno di `/monitoring/sync-history`**

Nel handler `router.get('/monitoring/sync-history', ...)`, sostituire tutto il blocco `for (const syncType of SYNC_HISTORY_TYPES)` (righe 125-189) con:

```ts
for (const syncType of SYNC_HISTORY_TYPES) {
  const typeJobs = byType.get(syncType)!;
  typeJobs.sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));

  let consecutiveFailures = 0;
  let totalCompleted = 0;
  let totalFailed = 0;

  for (const job of typeJobs) {
    if (job.failedReason) {
      totalFailed++;
    } else {
      totalCompleted++;
    }
  }

  // Solo i job 'real' failed incrementano consecutiveFailures.
  // Gli skip (CB, rescheduled, skipped) non azzerano la streak né la incrementano.
  for (const job of typeJobs) {
    if (job.failedReason) {
      consecutiveFailures++;
    } else {
      const outcome = classifyOutcome(job.returnvalue as Record<string, unknown> | null);
      if (outcome === 'real') break;
    }
  }

  const lastJob = typeJobs[0] ?? null;
  const lastRunTime = lastJob?.finishedOn
    ? new Date(lastJob.finishedOn).toISOString()
    : null;
  const lastDuration = lastJob?.finishedOn && lastJob.processedOn
    ? lastJob.finishedOn - lastJob.processedOn
    : null;

  const lastSuccess: boolean | null = lastJob ? !lastJob.failedReason : null;
  const lastError: string | null = lastJob?.failedReason ?? null;

  const realJob = typeJobs.find(
    (job) => !job.failedReason && classifyOutcome(job.returnvalue as Record<string, unknown> | null) === 'real',
  ) ?? null;
  const lastRealRunTime = realJob?.finishedOn ? new Date(realJob.finishedOn).toISOString() : null;
  const lastRealDuration = realJob?.finishedOn && realJob.processedOn
    ? realJob.finishedOn - realJob.processedOn
    : null;

  const recentJobs = typeJobs.slice(0, 20);
  const circuitBreakerActive = recentJobs.some(
    (job) => !job.failedReason && classifyOutcome(job.returnvalue as Record<string, unknown> | null) === 'circuit_breaker_skip',
  );
  const skipCount = recentJobs.filter(
    (job) => !job.failedReason && classifyOutcome(job.returnvalue as Record<string, unknown> | null) !== 'real',
  ).length;

  const staleThresholdMs = STALE_THRESHOLDS_MS[syncType as OperationType];
  const isStale = staleThresholdMs !== undefined && realJob?.finishedOn !== undefined
    ? Date.now() - realJob.finishedOn > staleThresholdMs
    : false;

  const health: 'healthy' | 'degraded' | 'stale' | 'idle' | 'paused' =
    typeJobs.length === 0 ? 'idle'
      : circuitBreakerActive ? 'paused'
        : consecutiveFailures >= 3 ? 'degraded'
          : isStale ? 'stale'
            : 'healthy';

  const history = typeJobs.slice(0, 20).map((job) => ({
    timestamp: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
    success: !job.failedReason,
    error: job.failedReason ?? null,
    outcome: classifyOutcome(job.returnvalue as Record<string, unknown> | null),
  }));

  types[syncType] = {
    lastRunTime,
    lastDuration,
    lastSuccess,
    lastError,
    health,
    totalCompleted,
    totalFailed,
    consecutiveFailures,
    history,
    lastRealRunTime,
    lastRealDuration,
    circuitBreakerActive,
    skipCount,
  };
}
```

- [ ] **Step 7: Aggiungere il nuovo endpoint `/monitoring/circuit-breaker`**

Subito dopo la chiusura dell'handler `/monitoring/sync-history` (dopo la riga `res.json({ success: true, types });`), aggiungere:

```ts
router.get('/monitoring/circuit-breaker', async (_req: AuthRequest, res) => {
  try {
    if (!deps.getCircuitBreakerStatus) {
      return res.json({ success: true, entries: [] });
    }
    const states = await deps.getCircuitBreakerStatus();
    const now = new Date();
    const entries = states.map((s) => ({
      userId: s.userId,
      syncType: s.syncType,
      consecutiveFailures: s.consecutiveFailures,
      totalFailures24h: s.totalFailures24h,
      lastFailureAt: s.lastFailureAt?.toISOString() ?? null,
      lastError: s.lastError,
      pausedUntil: s.pausedUntil?.toISOString() ?? null,
      isPaused: s.pausedUntil ? s.pausedUntil > now : false,
      lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
    }));
    res.json({ success: true, entries });
  } catch (error) {
    logger.error('Error fetching circuit breaker status', { error });
    res.status(500).json({ success: false, error: 'Errore nel recupero circuit breaker status' });
  }
});
```

- [ ] **Step 8: Aggiornare l'export a fine file**

Alla riga 548, cambiare:

```ts
// Prima:
export { createSyncStatusRouter, createQuickCheckRouter, type SyncStatusRouterDeps, type ResetSyncType };

// Dopo:
export { createSyncStatusRouter, createQuickCheckRouter, classifyOutcome, type SyncStatusRouterDeps, type ResetSyncType, type JobOutcome };
```

- [ ] **Step 9: Verificare che tutti i test passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose sync-status.spec.ts
```

Expected: tutti i test PASS.

- [ ] **Step 10: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Expected: nessun errore TypeScript.

- [ ] **Step 11: Commit**

```bash
git add archibald-web-app/backend/src/routes/sync-status.ts \
        archibald-web-app/backend/src/routes/sync-status.spec.ts
git commit -m "feat(sync): classifyOutcome, real vs skip metrics, paused health, circuit-breaker endpoint"
```

---

## Task 5: Wire `getCircuitBreakerStatus` in server.ts e main.ts

**Files:**
- Modify: `archibald-web-app/backend/src/server.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

**Contesto:** In `main.ts`, `circuitBreaker` è creato a riga 256 con `createCircuitBreaker(pool)`. La `createApp` function è chiamata a riga 379. La `syncStatusDeps` è in `server.ts` righe 727-739.

- [ ] **Step 1: Aggiornare `AppDeps` e aggiungere import in server.ts**

In `server.ts`, aggiungere dopo gli import esistenti (dopo la riga con `import { logger }`):

```ts
import type { CircuitBreakerState } from './sync/circuit-breaker';
```

Nel tipo `AppDeps` (~riga 110-128), aggiungere prima della `};`:

```ts
getCircuitBreakerStatus?: () => Promise<CircuitBreakerState[]>;
```

- [ ] **Step 2: Aggiungere `getCircuitBreakerStatus` a `syncStatusDeps` in server.ts**

Nella funzione `createApp`, trovare `syncStatusDeps` (righe 727-739) e aggiungere come ultima riga prima della `};`:

```ts
getCircuitBreakerStatus: deps.getCircuitBreakerStatus,
```

- [ ] **Step 3: Passare `getCircuitBreakerStatus` nella chiamata `createApp` in main.ts**

In `main.ts`, trovare la chiamata `createApp({` (riga 379). Aggiungere subito prima della `});` finale:

```ts
getCircuitBreakerStatus: () => circuitBreaker.getAllStatus(),
```

- [ ] **Step 4: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Expected: build OK, nessun errore TypeScript.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/server.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(server): wire getCircuitBreakerStatus into sync monitoring deps"
```

---

## Task 6: Aggiornare SyncMonitoringDashboard.tsx

**Files:**
- Modify: `archibald-web-app/frontend/src/components/SyncMonitoringDashboard.tsx`

**Contesto:** Il componente è un display puro. Le modifiche sono: tipi aggiornati, badge `'paused'`, status line con `lastRealRunTime`, icone outcome nella history table, sezione CB sotto Active Jobs.

- [ ] **Step 1: Aggiornare i tipi**

Nella sezione tipi all'inizio del file, applicare queste modifiche:

**Aggiungere `JobOutcome` dopo gli import:**
```ts
type JobOutcome = 'real' | 'circuit_breaker_skip' | 'rescheduled' | 'skipped';
```

**Aggiornare `HistoryEntry`** (cambia `duration: number` → `number | null` e aggiunge `outcome`):
```ts
type HistoryEntry = {
  timestamp: string | null;
  duration: number | null;
  success: boolean;
  error: string | null;
  outcome: JobOutcome;
};
```

**Aggiornare `SyncTypeStats`** (aggiunge `'paused'` a `health` e 4 nuovi campi):
```ts
type SyncTypeStats = {
  lastRunTime: string | null;
  lastDuration: number | null;
  lastSuccess: boolean | null;
  lastError: string | null;
  health: 'healthy' | 'degraded' | 'stale' | 'idle' | 'paused';
  totalCompleted: number;
  totalFailed: number;
  consecutiveFailures: number;
  history: HistoryEntry[];
  lastRealRunTime: string | null;
  lastRealDuration: number | null;
  circuitBreakerActive: boolean;
  skipCount: number;
};
```

**Aggiungere tipi CB** (dopo `SyncHistoryData`):
```ts
type CircuitBreakerEntry = {
  userId: string;
  syncType: string;
  consecutiveFailures: number;
  totalFailures24h: number;
  lastFailureAt: string | null;
  lastError: string | null;
  pausedUntil: string | null;
  isPaused: boolean;
  lastSuccessAt: string | null;
};

type CircuitBreakerData = {
  entries: CircuitBreakerEntry[];
};
```

- [ ] **Step 2: Aggiornare `getHealthBadge` per gestire `'paused'`**

Cambiare la firma e aggiungere il case `'paused'`:

```ts
function getHealthBadge(health: 'healthy' | 'degraded' | 'stale' | 'idle' | 'paused') {
  switch (health) {
    case 'healthy':
      return { color: '#4caf50', bg: '#e8f5e9', label: 'HEALTHY' };
    case 'degraded':
      return { color: '#f44336', bg: '#ffebee', label: 'DEGRADED' };
    case 'stale':
      return { color: '#e65100', bg: '#fff8e1', label: 'STALE' };
    case 'idle':
      return { color: '#ff9800', bg: '#fff3e0', label: 'IDLE' };
    case 'paused':
      return { color: '#7b1fa2', bg: '#f3e5f5', label: 'PAUSA CB' };
  }
}
```

- [ ] **Step 3: Aggiungere stato e fetch per Circuit Breaker**

Nel componente `SyncMonitoringDashboard`, aggiungere il state dopo `fetchError`:

```ts
const [cbData, setCbData] = useState<CircuitBreakerData | null>(null);
```

Aggiungere `fetchCbStatus` callback dopo `fetchHistory`:

```ts
const fetchCbStatus = useCallback(async () => {
  try {
    const res = await fetch('/api/sync/monitoring/circuit-breaker', {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      setCbData({ entries: data.entries });
    }
  } catch {
    /* CB polling — non critico */
  }
}, []);
```

Aggiornare il primo `useEffect` per chiamare anche `fetchCbStatus`:

```ts
useEffect(() => {
  fetchStatus();
  fetchHistory();
  fetchCbStatus();
}, [fetchStatus, fetchHistory, fetchCbStatus]);
```

Aggiungere un `useEffect` per il polling CB ogni 60s (dopo il polling esistente):

```ts
useEffect(() => {
  const cbTimer = setInterval(fetchCbStatus, 60000);
  return () => clearInterval(cbTimer);
}, [fetchCbStatus]);
```

- [ ] **Step 4: Aggiornare la status line della card**

Trovare il commento `{/* Status line */}` (~riga 382). Rimpiazzare le due `<span>` con `Last:` e `Durata:` con:

```tsx
<span>
  <strong>Reale:</strong> {formatTime(stats?.lastRealRunTime ?? null)}
</span>
<span>
  <strong>Durata:</strong>{" "}
  {formatDuration(stats?.lastRealDuration ?? null)}
</span>
{stats && stats.skipCount > 0 && (
  <span style={{ color: '#7b1fa2', fontSize: '12px' }}>
    ⏭ {stats.skipCount} saltati
  </span>
)}
```

- [ ] **Step 5: Aggiornare la history table — icone e colori outcome**

Nella `<tbody>` della tabella history (~riga 444), aggiornare ogni `<tr>`:

**Colore di riga** — sostituire `backgroundColor: i % 2 === 0 ? "white" : "#fafafa"` con:

```ts
backgroundColor:
  entry.outcome === 'circuit_breaker_skip' ? '#f3e5f5'
    : entry.outcome === 'rescheduled' ? '#fff8e1'
      : entry.outcome === 'skipped' ? '#f5f5f5'
        : entry.success ? 'white'
          : '#ffebee',
```

**Icona esito** — sostituire `{entry.success ? "✅" : "❌"}` con:

```tsx
{entry.outcome === 'circuit_breaker_skip' ? '⏸'
  : entry.outcome === 'rescheduled' ? '🔄'
    : entry.outcome === 'skipped' ? '⏭'
      : entry.success ? '✅' : '❌'}
```

- [ ] **Step 6: Aggiungere sezione Circuit Breaker**

Trovare il commento `{/* 4. Active Jobs */}`. Subito dopo la chiusura `</div>` di quella sezione (prima di `{/* 5. Scheduler Config */}`), inserire:

```tsx
{/* 4b. Circuit Breaker Status */}
{cbData && cbData.entries.some((e) => e.isPaused) && (
  <div
    style={{
      marginBottom: '24px',
      padding: '16px',
      backgroundColor: '#f3e5f5',
      borderRadius: '8px',
      border: '2px solid #7b1fa2',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}
  >
    <h4 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600, color: '#7b1fa2' }}>
      ⏸ Circuit Breaker Attivo
    </h4>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {cbData.entries.filter((e) => e.isPaused).map((entry) => (
        <div
          key={`${entry.userId}-${entry.syncType}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '8px 12px',
            backgroundColor: 'white',
            borderRadius: '6px',
            fontSize: '13px',
          }}
        >
          <span style={{ fontWeight: 600 }}>{entry.syncType}</span>
          <span style={{ color: '#666', fontFamily: 'monospace', fontSize: '11px' }}>
            {entry.userId.slice(0, 8)}...
          </span>
          <span style={{ color: '#c62828' }}>
            {entry.consecutiveFailures} errori consecutivi
          </span>
          {entry.pausedUntil && (
            <span style={{ color: '#7b1fa2' }}>
              pausa fino alle {formatTime(entry.pausedUntil)}
            </span>
          )}
          {entry.lastError && (
            <span
              style={{
                color: '#999',
                fontSize: '12px',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.lastError.slice(0, 60)}
            </span>
          )}
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 7: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -20
```

Expected: nessun errore TypeScript.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/frontend/src/components/SyncMonitoringDashboard.tsx
git commit -m "feat(dashboard): outcome icons, lastRealRunTime, paused health, circuit breaker section"
```

---

## Task 7: Verifica finale — test suite completo

- [ ] **Step 1: Run backend tests completi**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -30
```

Expected: tutti i test PASS.

- [ ] **Step 2: Backend build**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -10
```

Expected: build OK.

- [ ] **Step 3: Frontend type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Expected: nessun errore.

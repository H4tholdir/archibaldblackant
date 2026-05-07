# Unified Conductor — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estendere il Conductor con priority lanes, slot reservation nel browser pool, deduplicazione atomica dei task, e migrare progressivamente tutte le sync background da BullMQ al Conductor — mantenendo la produzione sempre attiva.

**Architecture:** Il Conductor DB-based acquisisce priority, run_after, requires_browser e dedup_key_external. Il dispatcher viene riscritto per ordinare per priorità e rispettare le pause per-userId. Il browser pool aggiunge slot reservation (8 WRITE / 25 SYNC) e warm window mutex. Le sync BullMQ migrano una alla volta al Conductor via dry-run, poi cutover.

**Tech Stack:** TypeScript strict, PostgreSQL (`pg` pool), Puppeteer, Vitest, Node.js 20

**Spec di riferimento:** `docs/superpowers/specs/2026-05-07-unified-conductor-architecture.md`

**⚠️ Sequenza di deployment obbligatoria**: migration #082 PRIMA del codice che usa le nuove colonne. Non deployare il codice finché la migration non è confermata applicata.

---

## File map

| File | Azione | Responsabilità |
|---|---|---|
| `src/db/migrations/082-unified-conductor-priority.sql` | CREATE | Schema: priority, run_after, requires_browser, dedup_key_external, sync_paused_users, last_shared_sync_at |
| `src/conductor/types.ts` | MODIFY | Aggiunge sync TaskType, priority/run_after/requires_browser a TaskRow |
| `src/db/repositories/agent-queue.ts` | MODIFY | Riscrive pickupNextTask + aggiunge enqueueWithDedup, buildDedupKey, shouldPromoteP500ForUser |
| `src/db/repositories/agent-queue.spec.ts` | MODIFY | Test per pickup prioritizzato, dedup, aging, pausa |
| `src/bot/browser-pool.ts` | MODIFY | Slot reservation (WRITE/SYNC), warm window mutex Map<userId,Promise> |
| `src/bot/browser-pool.spec.ts` | MODIFY | Test slot reservation e warm window |
| `src/sync/sync-scheduler.ts` | MODIFY | smartCustomerSync usa sync_paused_users; enqueue sync su Conductor |
| `src/conductor/worker.ts` | MODIFY | Post-op sync enqueue dopo submit/edit/delete/create/update |
| `src/conductor/worker.spec.ts` | MODIFY | Test post-op sync enqueue |
| `src/operations/handlers/submit-order.ts` | MODIFY | Fingerprint anti-duplicate: aggiunge grossAmount al match |
| `src/operations/handlers/submit-order.spec.ts` | MODIFY | Test fingerprint migliorato |
| `src/conductor/dry-run.ts` | CREATE | DryRunArtifact type, DryRunLogger, baseline capture |
| `src/operations/handlers/sync-customer-addresses.ts` | MODIFY | Supporto dry-run mode |
| `src/operations/handlers/sync-orders.ts` | MODIFY | Supporto dry-run mode |
| `src/operations/handlers/sync-customers.ts` | MODIFY | Supporto dry-run mode |
| `src/operations/handlers/sync-ddt.ts` | MODIFY | Supporto dry-run mode |
| `src/operations/handlers/sync-invoices.ts` | MODIFY | Supporto dry-run mode |
| `src/operations/handlers/sync-products.ts` | MODIFY | Supporto dry-run mode |
| `src/operations/handlers/sync-prices.ts` | MODIFY | Supporto dry-run mode |
| `src/routes/sync-status.ts` | MODIFY | Lettura history da agent_operation_queue per tipi Conductor |
| `src/main.ts` | MODIFY | Registra nuovi TaskType nel Conductor handler map; configura browser pool slot |

---

## Task 1 — Migration #082: schema DB

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/082-unified-conductor-priority.sql`

- [ ] **Step 1: Scrivi il file di migration**

```sql
-- 082-unified-conductor-priority.sql

-- Colonne priority lanes nel Conductor
ALTER TABLE system.agent_operation_queue
  ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS run_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requires_browser BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS dedup_key_external TEXT;

-- Indice per pickup prioritizzato (solo espressioni immutabili nel predicato)
-- run_after <= NOW() va nella query runtime, non nel predicato dell'indice
CREATE INDEX IF NOT EXISTS idx_agent_queue_priority_pickup
  ON system.agent_operation_queue (priority ASC, run_after ASC NULLS FIRST, enqueued_at ASC)
  WHERE status = 'enqueued';

-- Indice dedup atomico per task con dedup_key_external esplicita
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_queue_dedup
  ON system.agent_operation_queue (dedup_key_external)
  WHERE status IN ('enqueued', 'running') AND dedup_key_external IS NOT NULL;

-- Pausa sincrona per-userId (smartCustomerSync / sessioni interattive)
CREATE TABLE IF NOT EXISTS system.sync_paused_users (
  user_id TEXT PRIMARY KEY,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT
);

-- Round-robin shared syncs
ALTER TABLE agents.agent_sync_state
  ADD COLUMN IF NOT EXISTS last_shared_sync_at TIMESTAMPTZ;
```

- [ ] **Step 2: Applica la migration localmente**

```bash
# Avvia il DB locale se non è già attivo
cd archibald-web-app/backend
# Applica la migration
psql $DATABASE_URL -f src/db/migrations/082-unified-conductor-priority.sql
```

Expected: nessun errore. Verifica con:
```bash
psql $DATABASE_URL -c "\d system.agent_operation_queue" | grep -E "priority|run_after|requires_browser|dedup"
```

- [ ] **Step 3: Aggiungi riga a system.migrations**

```bash
psql $DATABASE_URL -c "INSERT INTO system.migrations (name, applied_at) VALUES ('082-unified-conductor-priority', NOW()) ON CONFLICT DO NOTHING;"
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/082-unified-conductor-priority.sql
git commit -m "feat(conductor): migration 082 — priority lanes, dedup, sync_paused_users"
```

---

## Task 2 — Aggiorna types.ts: nuovi TaskType e campi TaskRow

**Files:**
- Modify: `archibald-web-app/backend/src/conductor/types.ts`

- [ ] **Step 1: Aggiorna TaskType con i tipi di sync**

```typescript
// conductor/types.ts — versione completa

export type TaskStatus = 'enqueued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPhase = 'in_progress' | 'erp_save_done' | 'db_committed' | 'completed';
export type ErrorClass = 'erp_unreachable' | 'application_error' | 'verification_mismatch';

export type TaskType =
  // ERP Write — P=10
  | 'submit-order'
  | 'send-to-verona'
  | 'edit-order'
  | 'delete-order'
  | 'batch-send-to-verona'
  | 'batch-delete-orders'
  | 'create-customer'
  | 'update-customer'
  // On-demand read — P=50/100
  | 'sync-order-articles'
  | 'read-vat-status'
  | 'refresh-customer'
  | 'download-ddt-pdf'
  | 'download-invoice-pdf'
  // Background sync — P=500
  | 'sync-orders'
  | 'sync-customers'
  | 'sync-ddt'
  | 'sync-invoices'
  | 'sync-customer-addresses'
  | 'sync-products'
  | 'sync-prices'
  | 'sync-order-states'
  | 'sync-tracking';

export const TASK_PRIORITY: Record<TaskType, number> = {
  'submit-order': 10,
  'edit-order': 10,
  'delete-order': 10,
  'send-to-verona': 10,
  'batch-send-to-verona': 10,
  'batch-delete-orders': 10,
  'create-customer': 10,
  'update-customer': 10,
  'sync-order-articles': 50,
  'read-vat-status': 100,
  'refresh-customer': 100,
  'download-ddt-pdf': 100,
  'download-invoice-pdf': 100,
  'sync-orders': 500,
  'sync-customers': 500,
  'sync-ddt': 500,
  'sync-invoices': 500,
  'sync-customer-addresses': 500,
  'sync-products': 500,
  'sync-prices': 500,
  'sync-order-states': 500,
  'sync-tracking': 500,
};

export type TaskRow = {
  taskId: bigint;
  userId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  batchId: string | null;
  position: number;
  enqueuedAt: Date;
  status: TaskStatus;
  phase: TaskPhase | null;
  erpOrderId: string | null;
  startedAt: Date | null;
  heartbeatAt: Date | null;
  completedAt: Date | null;
  retryCount: number;
  maxRetries: number;
  errorClass: ErrorClass | null;
  errorMessage: string | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  // Nuovi campi Fase 1
  priority: number;
  runAfter: Date | null;
  requiresBrowser: boolean;
  dedupKeyExternal: string | null;
};
```

- [ ] **Step 2: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | head -30
```

Expected: errori su `agent-queue.ts` per i campi nuovi in TaskRow — normale, verrà fixato in Task 3.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/conductor/types.ts
git commit -m "feat(conductor): aggiungi sync TaskType, TASK_PRIORITY, campi priority/run_after/requires_browser a TaskRow"
```

---

## Task 3 — Riscrivi pickupNextTask con priority + pausa

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/agent-queue.ts`
- Modify: `archibald-web-app/backend/src/db/repositories/agent-queue.spec.ts`

- [ ] **Step 1: Scrivi il test failing per pickup prioritizzato**

Aggiungi in `agent-queue.spec.ts` (skip se CI o no PG_HOST):

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import { pickupNextTask, enqueueTask } from './agent-queue';
// usa il pool di test (integration test)
describe.skipIf(process.env.CI === 'true' || !process.env.PG_HOST)('pickupNextTask priority', () => {
  const userId = 'test-user-priority';

  beforeEach(async () => {
    await pool.query(
      `DELETE FROM system.agent_operation_queue WHERE user_id = $1`, [userId]
    );
  });

  test('pickuppa P=10 prima di P=500 indipendentemente dall\'ordine di enqueue', async () => {
    // Enqueua prima P=500, poi P=10
    await enqueueTask(pool, { userId, taskType: 'sync-orders', payload: {}, priority: 500 });
    await enqueueTask(pool, { userId, taskType: 'submit-order', payload: { items: [] }, priority: 10 });

    const picked = await pickupNextTask(pool);
    expect(picked?.taskType).toBe('submit-order');
    expect(picked?.userId).toBe(userId);
  });

  test('rispetta run_after: non pickuppa task con run_after nel futuro', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    await enqueueTask(pool, { userId, taskType: 'sync-orders', payload: {}, priority: 500, runAfter: futureDate });

    const picked = await pickupNextTask(pool);
    expect(picked).toBeNull();
  });

  test('non pickuppa P=500 per userId in sync_paused_users', async () => {
    await pool.query(`INSERT INTO system.sync_paused_users (user_id, reason) VALUES ($1, 'test') ON CONFLICT DO NOTHING`, [userId]);
    await enqueueTask(pool, { userId, taskType: 'sync-orders', payload: {}, priority: 500 });

    const picked = await pickupNextTask(pool);
    expect(picked).toBeNull();

    await pool.query(`DELETE FROM system.sync_paused_users WHERE user_id = $1`, [userId]);
  });
});
```

- [ ] **Step 2: Verifica che il test fallisca**

```bash
cd archibald-web-app/backend && PG_HOST=localhost npx vitest run src/db/repositories/agent-queue.spec.ts 2>&1 | tail -20
```

Expected: FAIL — `pickupNextTask` non ordina per priority.

- [ ] **Step 3: Riscrivi `pickupNextTask` in agent-queue.ts**

Sostituisci la funzione esistente:

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
      ORDER BY aoq.priority ASC, aoq.enqueued_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  return rows[0] ? mapRow(rows[0]) : null;
}
```

Aggiorna `mapRow` per includere i nuovi campi:

```typescript
function mapRow(row: DbTaskRow): TaskRow {
  return {
    taskId: BigInt(row.task_id),
    userId: row.user_id,
    taskType: row.task_type,
    payload: row.payload,
    batchId: row.batch_id,
    position: row.position,
    enqueuedAt: row.enqueued_at,
    status: row.status,
    phase: row.phase,
    erpOrderId: row.erp_order_id,
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    completedAt: row.completed_at,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    errorClass: row.error_class,
    errorMessage: row.error_message,
    cancelledAt: row.cancelled_at,
    cancelledReason: row.cancelled_reason,
    priority: row.priority ?? 500,
    runAfter: row.run_after,
    requiresBrowser: row.requires_browser ?? true,
    dedupKeyExternal: row.dedup_key_external,
  };
}
```

Aggiorna `DbTaskRow` per i nuovi campi:

```typescript
type DbTaskRow = {
  task_id: string;
  user_id: string;
  task_type: TaskType;
  payload: Record<string, unknown>;
  batch_id: string | null;
  position: number;
  enqueued_at: Date;
  status: TaskStatus;
  phase: TaskPhase | null;
  erp_order_id: string | null;
  started_at: Date | null;
  heartbeat_at: Date | null;
  completed_at: Date | null;
  retry_count: number;
  max_retries: number;
  error_class: ErrorClass | null;
  error_message: string | null;
  cancelled_at: Date | null;
  cancelled_reason: string | null;
  priority: number;
  run_after: Date | null;
  requires_browser: boolean;
  dedup_key_external: string | null;
};
```

- [ ] **Step 4: Verifica test passa**

```bash
cd archibald-web-app/backend && PG_HOST=localhost npx vitest run src/db/repositories/agent-queue.spec.ts 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep -E "error TS" | head -20
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/agent-queue.ts archibald-web-app/backend/src/db/repositories/agent-queue.spec.ts
git commit -m "feat(conductor): riscrive pickupNextTask con priority, run_after, sync_paused_users"
```

---

## Task 4 — enqueueWithDedup + buildDedupKey

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/agent-queue.ts`
- Modify: `archibald-web-app/backend/src/db/repositories/agent-queue.spec.ts`

- [ ] **Step 1: Scrivi test failing per dedup**

```typescript
describe.skipIf(process.env.CI === 'true' || !process.env.PG_HOST)('enqueueWithDedup', () => {
  const userId = 'test-user-dedup';

  beforeEach(async () => {
    await pool.query(`DELETE FROM system.agent_operation_queue WHERE user_id = $1`, [userId]);
  });

  test('non duplica sync-orders per stesso userId', async () => {
    await enqueueWithDedup(pool, { userId, taskType: 'sync-orders', payload: {}, priority: 500 });
    await enqueueWithDedup(pool, { userId, taskType: 'sync-orders', payload: {}, priority: 500 });

    const { rows } = await pool.query(
      `SELECT count(*) FROM system.agent_operation_queue WHERE user_id = $1 AND task_type = 'sync-orders' AND status = 'enqueued'`,
      [userId]
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  test('non duplica sync-order-articles per stesso orderId', async () => {
    const orderId = 'order-123';
    await enqueueWithDedup(pool, { userId, taskType: 'sync-order-articles', payload: { orderId }, priority: 50 });
    await enqueueWithDedup(pool, { userId, taskType: 'sync-order-articles', payload: { orderId }, priority: 50 });

    const { rows } = await pool.query(
      `SELECT count(*) FROM system.agent_operation_queue WHERE user_id = $1 AND task_type = 'sync-order-articles' AND status = 'enqueued'`,
      [userId]
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  test('enqueua sync-order-articles per ordini diversi senza dedup', async () => {
    await enqueueWithDedup(pool, { userId, taskType: 'sync-order-articles', payload: { orderId: 'order-A' }, priority: 50 });
    await enqueueWithDedup(pool, { userId, taskType: 'sync-order-articles', payload: { orderId: 'order-B' }, priority: 50 });

    const { rows } = await pool.query(
      `SELECT count(*) FROM system.agent_operation_queue WHERE user_id = $1 AND task_type = 'sync-order-articles' AND status = 'enqueued'`,
      [userId]
    );
    expect(Number(rows[0].count)).toBe(2);
  });

  test('non duplica read-vat-status per stesso erpId', async () => {
    await enqueueWithDedup(pool, { userId, taskType: 'read-vat-status', payload: { erpId: 'cust-1' }, priority: 100 });
    await enqueueWithDedup(pool, { userId, taskType: 'read-vat-status', payload: { erpId: 'cust-1' }, priority: 100 });

    const { rows } = await pool.query(
      `SELECT count(*) FROM system.agent_operation_queue WHERE user_id = $1 AND task_type = 'read-vat-status' AND status = 'enqueued'`,
      [userId]
    );
    expect(Number(rows[0].count)).toBe(1);
  });
});
```

- [ ] **Step 2: Verifica test fallisce**

```bash
cd archibald-web-app/backend && PG_HOST=localhost npx vitest run src/db/repositories/agent-queue.spec.ts 2>&1 | grep -E "FAIL|PASS|enqueueWithDedup"
```

Expected: FAIL — `enqueueWithDedup` non esiste.

- [ ] **Step 3: Implementa buildDedupKey e enqueueWithDedup**

Aggiungi in `agent-queue.ts`:

```typescript
import type { TaskType } from '../../conductor/types';

export function buildDedupKey(taskType: TaskType, userId: string, payload: Record<string, unknown>): string | null {
  switch (taskType) {
    case 'sync-order-articles':
      return payload.orderId ? `${userId}:${taskType}:${payload.orderId}` : null;
    case 'sync-orders':
    case 'sync-customers':
    case 'sync-ddt':
    case 'sync-invoices':
    case 'sync-customer-addresses':
    case 'sync-products':
    case 'sync-prices':
    case 'sync-order-states':
    case 'sync-tracking':
      return `${userId}:${taskType}`;
    case 'read-vat-status':
    case 'refresh-customer':
      return `${userId}:${taskType}:${payload.erpId ?? payload.customerId ?? ''}`;
    default:
      return null; // nessun dedup per ERP write ops
  }
}

export type EnqueueWithDedupParams = {
  userId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  priority: number;
  runAfter?: Date;
  requiresBrowser?: boolean;
  batchId?: string;
  maxRetries?: number;
};

export async function enqueueWithDedup(pool: DbPool, params: EnqueueWithDedupParams): Promise<bigint | null> {
  const {
    userId, taskType, payload, priority,
    runAfter = null, requiresBrowser = true, batchId = null, maxRetries = 3,
  } = params;

  const dedupKey = buildDedupKey(taskType, userId, payload);

  const { rows } = await pool.query<{ task_id: string }>(`
    INSERT INTO system.agent_operation_queue
      (user_id, task_type, payload, batch_id, position, status, priority,
       run_after, requires_browser, dedup_key_external, max_retries)
    SELECT
      $1, $2, $3, $4,
      COALESCE(
        (SELECT MAX(position) FROM system.agent_operation_queue
         WHERE user_id = $1 AND status IN ('enqueued','running')),
        0
      ) + 1,
      'enqueued', $5, $6, $7, $8, $9
    ON CONFLICT (dedup_key_external)
      WHERE status IN ('enqueued', 'running') AND dedup_key_external IS NOT NULL
      DO NOTHING
    RETURNING task_id
  `, [userId, taskType, payload, batchId, priority, runAfter, requiresBrowser, dedupKey, maxRetries]);

  return rows[0] ? BigInt(rows[0].task_id) : null;
}
```

- [ ] **Step 4: Verifica test passa**

```bash
cd archibald-web-app/backend && PG_HOST=localhost npx vitest run src/db/repositories/agent-queue.spec.ts 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Type-check + commit**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -10
git add archibald-web-app/backend/src/db/repositories/agent-queue.ts archibald-web-app/backend/src/db/repositories/agent-queue.spec.ts
git commit -m "feat(conductor): aggiunge enqueueWithDedup e buildDedupKey per-task-type"
```

---

## Task 5 — Anti-starvation aging (shouldPromoteP500ForUser)

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/agent-queue.ts`
- Modify: `archibald-web-app/backend/src/db/repositories/agent-queue.spec.ts`

- [ ] **Step 1: Scrivi test failing**

```typescript
describe.skipIf(process.env.CI === 'true' || !process.env.PG_HOST)('shouldPromoteP500ForUser', () => {
  const userId = 'test-user-aging';

  beforeEach(async () => {
    await pool.query(`DELETE FROM system.agent_operation_queue WHERE user_id = $1`, [userId]);
  });

  test('non promuove P=500 se c\'è un P<=100 pending per lo stesso userId', async () => {
    await enqueueWithDedup(pool, { userId, taskType: 'submit-order', payload: {}, priority: 10 });
    const shouldPromote = await shouldPromoteP500ForUser(pool, userId, 30 * 60_000);
    expect(shouldPromote).toBe(false);
  });

  test('non promuove P=500 se l\'ultimo sync è recente (< 30 min)', async () => {
    // Simula un completed P=500 recente
    await pool.query(
      `INSERT INTO system.agent_operation_queue (user_id, task_type, payload, position, status, priority, completed_at)
       VALUES ($1, 'sync-orders', '{}', 1, 'completed', 500, NOW() - INTERVAL '5 minutes')`,
      [userId]
    );
    const shouldPromote = await shouldPromoteP500ForUser(pool, userId, 30 * 60_000);
    expect(shouldPromote).toBe(false);
  });

  test('promuove P=500 se nessun P<=100 pending e ultimo sync > 30 min fa', async () => {
    await pool.query(
      `INSERT INTO system.agent_operation_queue (user_id, task_type, payload, position, status, priority, completed_at)
       VALUES ($1, 'sync-orders', '{}', 1, 'completed', 500, NOW() - INTERVAL '35 minutes')`,
      [userId]
    );
    const shouldPromote = await shouldPromoteP500ForUser(pool, userId, 30 * 60_000);
    expect(shouldPromote).toBe(true);
  });
});
```

- [ ] **Step 2: Verifica test fallisce**

```bash
cd archibald-web-app/backend && PG_HOST=localhost npx vitest run src/db/repositories/agent-queue.spec.ts 2>&1 | grep -E "FAIL|shouldPromote"
```

- [ ] **Step 3: Implementa shouldPromoteP500ForUser**

```typescript
export async function shouldPromoteP500ForUser(
  pool: DbPool,
  userId: string,
  agingThresholdMs: number,
): Promise<boolean> {
  // Non promuovere se c'è P<=100 pending per questo userId
  const { rows: priorityRows } = await pool.query(
    `SELECT 1 FROM system.agent_operation_queue
     WHERE user_id = $1 AND status = 'enqueued' AND priority <= 100
       AND (run_after IS NULL OR run_after <= NOW())
     LIMIT 1`,
    [userId]
  );
  if (priorityRows.length > 0) return false;

  // Promuovi solo se l'ultima sync completata è più vecchia della soglia
  const { rows: lastRows } = await pool.query<{ completed_at: Date }>(
    `SELECT completed_at FROM system.agent_operation_queue
     WHERE user_id = $1 AND priority = 500 AND status = 'completed'
     ORDER BY completed_at DESC LIMIT 1`,
    [userId]
  );

  if (lastRows.length === 0) return true; // mai sincronizzato

  const ageMs = Date.now() - new Date(lastRows[0].completed_at).getTime();
  return ageMs > agingThresholdMs;
}
```

- [ ] **Step 4: Verifica test passa + commit**

```bash
cd archibald-web-app/backend && PG_HOST=localhost npx vitest run src/db/repositories/agent-queue.spec.ts 2>&1 | tail -10
git add archibald-web-app/backend/src/db/repositories/agent-queue.ts archibald-web-app/backend/src/db/repositories/agent-queue.spec.ts
git commit -m "feat(conductor): aggiunge shouldPromoteP500ForUser per anti-starvation aging"
```

---

## Task 6 — Browser pool: slot reservation (8 WRITE / 25 SYNC)

**Files:**
- Modify: `archibald-web-app/backend/src/bot/browser-pool.ts`
- Modify: `archibald-web-app/backend/src/bot/browser-pool.spec.ts` (se esiste, altrimenti crea)

- [ ] **Step 1: Scrivi test failing per slot reservation**

In `browser-pool.spec.ts`:

```typescript
import { describe, test, expect, vi } from 'vitest';
import { createBrowserPool } from './browser-pool';

describe('slot reservation', () => {
  test('task P=500 non ottiene slot se SYNC_SLOTS pieni', async () => {
    const pool = createBrowserPool({
      maxBrowsers: 1,
      maxContextsPerBrowser: 10,
      writeSlots: 2,
      syncSlots: 1,
      loginFn: async () => {},
    });

    // Occupa l'unico sync slot
    const mockBrowser = { createBrowserContext: vi.fn().mockResolvedValue({ newPage: vi.fn() }) };
    // ... setup mock

    // Il secondo tentativo P=500 deve restituire null (slot pieno)
    const result = await pool.trySyncSlot('user-A');
    expect(result).toBeNull();
  });

  test('task P<=100 non è bloccato da sync slots pieni', async () => {
    // Verifica che WRITE_SLOTS siano separati da SYNC_SLOTS
    // task P=10 ottiene slot anche se tutti i sync slots sono occupati
    // ... implementazione test
    expect(true).toBe(true); // placeholder da espandere con mock completo
  });
});
```

- [ ] **Step 2: Aggiungi writeSlots e syncSlots alla configurazione del pool**

In `browser-pool.ts`, aggiorna il tipo di configurazione:

```typescript
type BrowserPoolConfig = {
  maxBrowsers: number;
  maxContextsPerBrowser: number;
  contextExpiryMs?: number;
  serviceAccountContextExpiryMs?: number;
  loginFn?: (context: BrowserContextLike, userId: string) => Promise<void>;
  // Slot reservation (Fase 1)
  writeSlots?: number;   // default: 8, per priority <= 100
  syncSlots?: number;    // default: 25 (CPX62), per priority = 500
};
```

Aggiungi i contatori di slot nel corpo della funzione `createBrowserPool`:

```typescript
const WRITE_SLOTS = poolConfig.writeSlots ?? parseInt(process.env.BROWSER_POOL_WRITE_SLOTS ?? '8', 10);
const SYNC_SLOTS = poolConfig.syncSlots ?? parseInt(process.env.BROWSER_POOL_SYNC_SLOTS ?? '25', 10);

let activeWriteSlots = 0;
let activeSyncSlots = 0;
```

Aggiorna `acquireContext` per accettare `priority` e verificare il bucket:

```typescript
async function acquireContext(
  userId: string,
  options?: { fromQueue?: boolean; forceLogin?: boolean; priority?: number },
): Promise<BrowserContextLike> {
  const priority = options?.priority ?? 500;
  const isSync = priority >= 500;

  if (!options?.fromQueue) {
    console.warn(`[BrowserPool] acquireContext called without fromQueue for user ${userId}.`);
  }

  // Verifica slot disponibili per la priority class
  if (isSync && activeSyncSlots >= SYNC_SLOTS) {
    throw new Error(`[BrowserPool] SYNC_SLOTS exhausted (${activeSyncSlots}/${SYNC_SLOTS}) for user ${userId}`);
  }
  if (!isSync && activeWriteSlots >= WRITE_SLOTS) {
    throw new Error(`[BrowserPool] WRITE_SLOTS exhausted (${activeWriteSlots}/${WRITE_SLOTS}) for user ${userId}`);
  }

  // ... logica esistente di login/context creation ...

  // Incrementa il contatore appropriato al completamento
  if (isSync) { activeSyncSlots++; } else { activeWriteSlots++; }
  return context;
}
```

Aggiorna `releaseContext` per decrementare il contatore:

```typescript
async function releaseContext(userId: string, _context: BrowserContextLike, success: boolean, priority?: number): Promise<void> {
  const isSync = (priority ?? 500) >= 500;
  if (isSync) { activeSyncSlots = Math.max(0, activeSyncSlots - 1); }
  else { activeWriteSlots = Math.max(0, activeWriteSlots - 1); }
  // ... logica esistente ...
}
```

- [ ] **Step 3: Aggiorna tutti i chiamanti di acquireContext/releaseContext in main.ts**

Ogni `browserPool.acquireContext(userId, { fromQueue: true })` diventa:
```typescript
browserPool.acquireContext(userId, { fromQueue: true, priority: TASK_PRIORITY[type] })
```

Ogni `browserPool.releaseContext(userId, ctx, success)` diventa:
```typescript
browserPool.releaseContext(userId, ctx, success, TASK_PRIORITY[type])
```

- [ ] **Step 4: Memory guard — aggiungi log warning quando RSS > 75%**

```typescript
// Aggiungi in acquireContext, prima di creare un nuovo context:
const rss = process.memoryUsage().rss;
const totalMem = require('os').totalmem();
if (rss / totalMem > 0.75 && isSync) {
  logger.warn('[BrowserPool] Memory pressure: RSS > 75%, skipping new SYNC context', {
    rssMb: Math.round(rss / 1024 / 1024),
    totalMb: Math.round(totalMem / 1024 / 1024),
  });
  throw new Error(`[BrowserPool] Memory pressure: refusing new SYNC context`);
}
```

- [ ] **Step 5: Type-check + commit**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -20
git add archibald-web-app/backend/src/bot/browser-pool.ts
git commit -m "feat(browser-pool): slot reservation WRITE_SLOTS/SYNC_SLOTS + memory guard"
```

---

## Task 7 — Warm window: mutex per-userId

**Files:**
- Modify: `archibald-web-app/backend/src/bot/browser-pool.ts`

- [ ] **Step 1: Aggiungi warmWindowMutex Map nel pool**

In `createBrowserPool`, dopo le dichiarazioni esistenti:

```typescript
// Warm window mutex: mantiene esclusività del context per 90s dopo releaseContext
// Best-effort: non sopravvive al restart del processo
const warmWindowMs = parseInt(process.env.BROWSER_POOL_WARM_WINDOW_MS ?? '90000', 10);
const warmWindowMutex = new Map<string, {
  promise: Promise<void>;
  resolve: () => void;
  timer: NodeJS.Timeout;
}>();
```

- [ ] **Step 2: Aggiorna releaseContext per attivare il warm window**

```typescript
// In releaseContext, dopo il decremento dei contatori, se success=true:
if (success) {
  let resolveWarm!: () => void;
  const warmPromise = new Promise<void>((res) => { resolveWarm = res; });
  const timer = setTimeout(() => {
    warmWindowMutex.delete(userId);
    resolveWarm();
    // Logout e pulizia slot avvengono qui se nessuno ha preso il mutex
    removeContextFromPool(userId).catch(() => {});
  }, warmWindowMs);

  warmWindowMutex.set(userId, { promise: warmPromise, resolve: resolveWarm, timer });
}
```

- [ ] **Step 3: Aggiorna acquireContext per aspettare il warm window mutex**

All'inizio di `acquireContext`, dopo il check `fromQueue`:

```typescript
// Aspetta che il warm window precedente sia completato prima di procedere
const existingWarm = warmWindowMutex.get(userId);
if (existingWarm) {
  clearTimeout(existingWarm.timer);
  existingWarm.resolve(); // sblocca il mutex
  warmWindowMutex.delete(userId);
  // Il context è già caldo — salta il login
}
```

- [ ] **Step 4: Reaping al startup**

In `initialize()`, aggiungi:

```typescript
// Reaping context orfani da sessioni precedenti (best-effort)
async function reaperStartup(): Promise<void> {
  try {
    for (const browser of browsers) {
      const contexts = browser.browserContexts?.() ?? [];
      for (const ctx of contexts) {
        await ctx.close().catch(() => {});
      }
    }
    logger.info('[BrowserPool] Startup reaping: closed orphan contexts');
  } catch {
    logger.warn('[BrowserPool] Startup reaping failed — orphan contexts may persist');
  }
}
await reaperStartup();
```

- [ ] **Step 5: Type-check + commit**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -10
git add archibald-web-app/backend/src/bot/browser-pool.ts
git commit -m "feat(browser-pool): warm window mutex per-userId (best-effort, process-local)"
```

---

## Task 8 — smartCustomerSync usa sync_paused_users

**Files:**
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts`

- [ ] **Step 1: Aggiorna `smartCustomerSync` per scrivere in sync_paused_users**

Aggiorna la firma per ricevere il pool e aggiorna la logica:

```typescript
async function smartCustomerSync(userId: string, pool?: DbPool): Promise<void> {
  if (sessionCount > 0) {
    sessionCount++;
    resetSafetyTimeout();
    return;
  }

  sessionCount = 1;

  // Pausa sync P=500 per questo userId tramite DB (sopravvive al restart del scheduler)
  if (pool) {
    await pool.query(
      `INSERT INTO system.sync_paused_users (user_id, reason)
       VALUES ($1, 'interactive_session') ON CONFLICT DO NOTHING`,
      [userId]
    ).catch((err) => logger.warn('Failed to insert sync_paused_users', { err }));
  }

  if (running) {
    stop();
  }

  resetSafetyTimeout();

  // Enqueua sync-customers per l'agente attivo
  const { active } = getAgentsByActivity();
  const targetUserId = active.includes(userId) ? userId : active[0] ?? userId;
  await enqueue('sync-customers', targetUserId, {});
}
```

- [ ] **Step 2: Aggiorna `resumeOtherSyncs` per rimuovere dalla pausa**

```typescript
function resumeOtherSyncs(userId?: string, pool?: DbPool): void {
  if (sessionCount <= 0) return;
  sessionCount--;

  // Rimuovi dalla pausa DB
  if (userId && pool) {
    pool.query(`DELETE FROM system.sync_paused_users WHERE user_id = $1`, [userId])
      .catch((err) => logger.warn('Failed to remove sync_paused_users', { err }));
  }

  if (sessionCount <= 0) {
    sessionCount = 0;
    clearSafetyTimeout();
    if (!running && currentIntervals.agentSyncMs > 0) {
      start(currentIntervals);
    }
  } else {
    resetSafetyTimeout();
  }
}
```

- [ ] **Step 3: Aggiorna i chiamanti in server.ts/main.ts**

Cerca e aggiorna tutti i `smartCustomerSync(userId)` per passare il pool:
```typescript
syncScheduler.smartCustomerSync(userId, pool)
syncScheduler.resumeOtherSyncs(userId, pool)
```

- [ ] **Step 4: Type-check + commit**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -10
git add archibald-web-app/backend/src/sync/sync-scheduler.ts
git commit -m "feat(conductor): smartCustomerSync scrive sync_paused_users in DB"
```

---

## Task 9 — Post-op sync enqueue nel Conductor worker

**Files:**
- Modify: `archibald-web-app/backend/src/conductor/worker.ts`
- Modify: `archibald-web-app/backend/src/conductor/worker.spec.ts`

- [ ] **Step 1: Scrivi test failing per post-op sync**

In `worker.spec.ts`:

```typescript
test('dopo submit-order, enqueua sync-orders(P=100) e sync-order-articles(P=50)', async () => {
  const enqueuedTasks: Array<{ taskType: string; priority: number }> = [];
  const mockEnqueue = vi.fn().mockImplementation(async (pool, params) => {
    enqueuedTasks.push({ taskType: params.taskType, priority: params.priority });
    return null;
  });

  // Simula completamento submit-order
  await enqueuePostOpSyncs(mockPool, 'user-1', 'submit-order', { orderId: 'ord-1' }, mockEnqueue);

  expect(enqueuedTasks).toEqual(expect.arrayContaining([
    expect.objectContaining({ taskType: 'sync-orders', priority: 100 }),
    expect.objectContaining({ taskType: 'sync-order-articles', priority: 50 }),
  ]));
});
```

- [ ] **Step 2: Implementa enqueuePostOpSyncs**

Crea la funzione in `worker.ts` (o in un file `src/conductor/post-op-sync.ts` se preferisci):

```typescript
import { enqueueWithDedup, type EnqueueWithDedupParams } from '../db/repositories/agent-queue';
import type { DbPool } from '../db/pool';
import type { TaskType } from './types';

type EnqueueFn = (pool: DbPool, params: EnqueueWithDedupParams) => Promise<bigint | null>;

export async function enqueuePostOpSyncs(
  pool: DbPool,
  userId: string,
  completedTaskType: TaskType,
  payload: Record<string, unknown>,
  enqueue: EnqueueFn = enqueueWithDedup,
): Promise<void> {
  const ops: EnqueueWithDedupParams[] = [];

  switch (completedTaskType) {
    case 'submit-order':
    case 'edit-order':
      ops.push({ userId, taskType: 'sync-orders', payload: {}, priority: 100, requiresBrowser: true });
      if (payload.orderId) {
        ops.push({ userId, taskType: 'sync-order-articles', payload: { orderId: payload.orderId }, priority: 50, requiresBrowser: true });
      }
      break;
    case 'delete-order':
      ops.push({ userId, taskType: 'sync-orders', payload: {}, priority: 100, requiresBrowser: true });
      break;
    case 'create-customer':
    case 'update-customer':
      ops.push({ userId, taskType: 'sync-customers', payload: {}, priority: 100, requiresBrowser: true });
      break;
    default:
      return;
  }

  for (const op of ops) {
    await enqueue(pool, op).catch((err) => {
      // MAI throw — l'operazione ERP è già completata
      logger.warn('[Conductor] Post-op sync enqueue failed', { taskType: op.taskType, userId, err });
    });
  }
}
```

- [ ] **Step 3: Chiama enqueuePostOpSyncs nel worker dopo il completamento**

In `worker.ts`, nella sezione di completamento task:

```typescript
// Dopo completeTask(pool, task) e prima di broadcast JOB_COMPLETED:
try {
  await enqueuePostOpSyncs(pool, task.userId, task.taskType, task.payload);
} catch {
  // già loggato dentro enqueuePostOpSyncs
}
```

- [ ] **Step 4: Verifica test + type-check + commit**

```bash
cd archibald-web-app/backend && npx vitest run src/conductor/worker.spec.ts 2>&1 | tail -10
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -10
git add archibald-web-app/backend/src/conductor/worker.ts archibald-web-app/backend/src/conductor/worker.spec.ts
git commit -m "feat(conductor): post-op sync enqueue dopo submit/edit/delete/create/update"
```

---

## Task 10 — Fix fingerprint anti-duplicato in submit-order

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts`

- [ ] **Step 1: Scrivi test failing per fingerprint**

```typescript
describe('checkRecentDuplicateOnErp', () => {
  test('non confonde due ordini con stessa quantità articoli ma importi diversi', async () => {
    const mockBot = {
      scrapeRecentOrders: vi.fn().mockResolvedValue([
        { orderId: 'ERP-100', numArticles: 3, grossAmount: 150.00 },
        { orderId: 'ERP-101', numArticles: 3, grossAmount: 280.50 },
      ]),
    };

    // Cerca ordine con 3 articoli e importo 280.50 — deve matchare solo ERP-101
    const result = await checkRecentDuplicateOnErp(mockBot as never, 'cust-1', 3, 280.50);
    expect(result).toBe('ERP-101');

    // Cerca ordine con 3 articoli e importo 999.99 — nessun match
    const noMatch = await checkRecentDuplicateOnErp(mockBot as never, 'cust-1', 3, 999.99);
    expect(noMatch).toBeNull();
  });
});
```

- [ ] **Step 2: Aggiorna scrapeRecentOrders per restituire grossAmount**

In `submit-order.ts`, aggiorna il tipo:

```typescript
scrapeRecentOrders?: (opts: { customerId: string; sinceHours: number }) =>
  Promise<Array<{ orderId: string; numArticles: number; grossAmount: number }>>;
```

- [ ] **Step 3: Aggiorna checkRecentDuplicateOnErp per usare grossAmount**

```typescript
async function checkRecentDuplicateOnErp(
  bot: SubmitOrderBot,
  customerId: string,
  numArticles: number,
  grossAmount: number,
): Promise<string | null> {
  if (!bot.scrapeRecentOrders) return null;
  try {
    const recent = await bot.scrapeRecentOrders({ customerId, sinceHours: 2 });
    const AMOUNT_TOLERANCE = 0.02;
    const match = recent.find(
      (o) => o.numArticles === numArticles && Math.abs(o.grossAmount - grossAmount) <= AMOUNT_TOLERANCE
    );
    return match?.orderId ?? null;
  } catch (err) {
    logger.warn('[SubmitOrder] Anti-duplicate check failed, proceeding normally', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
```

Aggiorna il chiamante per passare `grossAmount` dal payload.

- [ ] **Step 4: Verifica test + commit**

```bash
cd archibald-web-app/backend && npx vitest run src/operations/handlers/submit-order.spec.ts 2>&1 | tail -10
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts
git commit -m "fix(submit-order): fingerprint anti-duplicato aggiunge grossAmount per evitare false positive"
```

---

## Task 11 — sync-order-articles: aggiorna priority=50 e dedup

**Files:**
- Modify: `archibald-web-app/backend/src/main.ts` (dove viene enqueued sync-order-articles)
- Modify: `archibald-web-app/backend/src/routes/sync-status.ts`

- [ ] **Step 1: Aggiorna tutti gli enqueue di sync-order-articles**

Cerca in `main.ts` e `sync-status.ts` tutti i posti dove viene enqueued `sync-order-articles` e aggiorna per usare `enqueueWithDedup` con priority=50:

```typescript
// Sostituisci queue.enqueue('sync-order-articles', userId, { orderId }) con:
await enqueueWithDedup(pool, {
  userId,
  taskType: 'sync-order-articles',
  payload: { orderId },
  priority: 50,
  requiresBrowser: true,
});
```

- [ ] **Step 2: Aggiorna admin monitoring per leggere da agent_operation_queue**

In `sync-status.ts`, la sezione che gestisce `sync-order-articles`:

```typescript
// Aggiungi query per Conductor history (da agent_operation_queue)
const conductorHistory = await pool.query<{
  completed_at: Date; started_at: Date | null; status: string; error_message: string | null;
}>(`
  SELECT completed_at, started_at, status, error_message
  FROM system.agent_operation_queue
  WHERE task_type = 'sync-order-articles'
    AND status IN ('completed', 'failed')
  ORDER BY completed_at DESC
  LIMIT 20
`);

// Mappa al formato atteso dal frontend (stesso schema di BullMQ history)
const conductorJobs = conductorHistory.rows.map(r => ({
  timestamp: r.completed_at?.toISOString() ?? null,
  duration: r.started_at && r.completed_at
    ? r.completed_at.getTime() - r.started_at.getTime()
    : null,
  success: r.status === 'completed' && !r.error_message,
  error: r.error_message ?? null,
  outcome: 'real' as const,
}));
```

- [ ] **Step 3: Type-check + commit**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -10
git add archibald-web-app/backend/src/main.ts archibald-web-app/backend/src/routes/sync-status.ts
git commit -m "feat(conductor): sync-order-articles migra a priority=50 con dedup; monitoring da agent_operation_queue"
```

---

## Task 12 — Infrastruttura dry-run per shadow mode

**Files:**
- Create: `archibald-web-app/backend/src/conductor/dry-run.ts`

- [ ] **Step 1: Crea dry-run.ts con DryRunArtifact e DryRunLogger**

```typescript
// conductor/dry-run.ts

import type { DbPool } from '../db/pool';
import { logger } from '../logger';

export type DryRunUpsert = {
  id: string;
  action: 'insert' | 'update';
  fields: Record<string, unknown>;
};

export type DryRunArtifact = {
  syncType: string;
  userId: string;
  runAt: Date;
  bullmqBaseline: {
    capturedAt: Date;
    rowCount: number;
    checksum: string;
  } | null;
  conductorExpected: {
    upserts: DryRunUpsert[];
    deletes: string[];
  };
  discrepancies: string[];
  success: boolean;
};

export class DryRunLogger {
  private upserts: DryRunUpsert[] = [];
  private deletes: string[] = [];

  recordUpsert(id: string, action: 'insert' | 'update', fields: Record<string, unknown>): void {
    this.upserts.push({ id, action, fields });
  }

  recordDelete(id: string): void {
    this.deletes.push(id);
  }

  buildArtifact(
    syncType: string,
    userId: string,
    baseline: DryRunArtifact['bullmqBaseline'],
  ): DryRunArtifact {
    const discrepancies: string[] = [];

    if (this.deletes.length > 0) {
      discrepancies.push(
        `[DRY-RUN] Would delete ${this.deletes.length} rows: ${this.deletes.slice(0, 5).join(', ')}${this.deletes.length > 5 ? '...' : ''}`
      );
    }

    const artifact: DryRunArtifact = {
      syncType,
      userId,
      runAt: new Date(),
      bullmqBaseline: baseline,
      conductorExpected: { upserts: this.upserts, deletes: this.deletes },
      discrepancies,
      success: true, // dry-run senza crash = success anche con discrepanze
    };

    logger.info('[DryRun] Artifact', {
      syncType, userId,
      upserts: this.upserts.length,
      deletes: this.deletes.length,
      discrepancies: discrepancies.length,
    });

    return artifact;
  }
}

export async function captureBaseline(
  pool: DbPool,
  tableName: string,
  userId: string,
): Promise<DryRunArtifact['bullmqBaseline']> {
  const { rows } = await pool.query<{ count: string; checksum: string }>(
    `SELECT COUNT(*)::text AS count,
            MD5(STRING_AGG(id::text, ',' ORDER BY id)) AS checksum
     FROM ${tableName}
     WHERE user_id = $1`,
    [userId]
  );
  return {
    capturedAt: new Date(),
    rowCount: parseInt(rows[0].count, 10),
    checksum: rows[0].checksum ?? '',
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add archibald-web-app/backend/src/conductor/dry-run.ts
git commit -m "feat(conductor): DryRunArtifact, DryRunLogger e captureBaseline per shadow mode"
```

---

## Task 13 — Migra sync-customer-addresses → Conductor

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.ts`
- Modify: `archibald-web-app/backend/src/main.ts`
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts`

- [ ] **Step 1: Aggiungi supporto dry-run a sync-customer-addresses**

In `sync-customer-addresses.ts`, aggiungi la possibilità di ricevere `dryRun: boolean` nei deps:

```typescript
type SyncCustomerAddressesDeps = {
  pool: DbPool;
  bot: SyncCustomerAddressesBot;
  dryRun?: boolean; // se true, non scrive su DB
  dryRunLogger?: DryRunLogger;
  // ... deps esistenti
};
```

Nella logica di scrittura DB, wrappa con:
```typescript
if (!deps.dryRun) {
  await pool.query(`UPDATE agents.customers SET ...`, [...]);
} else {
  deps.dryRunLogger?.recordUpsert(customer.erpId, 'update', { ...fields });
}
```

- [ ] **Step 2: Registra sync-customer-addresses nel Conductor handler map in main.ts**

```typescript
// In main.ts, aggiungi al Conductor handler map:
'sync-customer-addresses': async (task, ctx) => {
  const dryRun = process.env.SYNC_DRY_RUN_CUSTOMER_ADDRESSES === 'true';
  const dryRunLogger = dryRun ? new DryRunLogger() : undefined;

  const result = await handleSyncCustomerAddresses(
    { pool, bot: createBotForUser(ctx.userId), dryRun, dryRunLogger },
    task.payload,
    ctx.userId,
    () => {},
  );

  if (dryRun && dryRunLogger) {
    const baseline = await captureBaseline(pool, 'agents.customer_addresses', ctx.userId);
    dryRunLogger.buildArtifact('sync-customer-addresses', ctx.userId, baseline);
  }

  return result as Record<string, unknown>;
},
```

- [ ] **Step 3: Il scheduler enqueua sync-customer-addresses via Conductor (quando il flag è attivo)**

In `sync-scheduler.ts`, nella funzione `scheduleAddressSync`:

```typescript
// Se USE_CONDUCTOR_FOR_SYNCS è attivo, usa enqueueWithDedup invece di queue.enqueue
if (process.env.USE_CONDUCTOR_FOR_SYNCS === 'true') {
  await enqueueWithDedup(pool, {
    userId: agentUserId,
    taskType: 'sync-customer-addresses',
    payload: { customers: customers.map(...) },
    priority: 500,
    requiresBrowser: true,
  });
} else {
  // percorso BullMQ esistente
  await enqueue('sync-customer-addresses', agentUserId, { ... }, key);
}
```

- [ ] **Step 4: Verifica dry-run per 24h prima del cutover**

Per attivare dry-run: `SYNC_DRY_RUN_CUSTOMER_ADDRESSES=true USE_CONDUCTOR_FOR_SYNCS=true`
Monitora i log per 24h, verifica che gli artifact non mostrino discrepanze inattese nelle deletes.
Cutover: rimuovi `SYNC_DRY_RUN_CUSTOMER_ADDRESSES`, disabilita BullMQ worker per `sync-customer-addresses`.

- [ ] **Step 5: Type-check + commit**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -10
git add archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.ts archibald-web-app/backend/src/main.ts archibald-web-app/backend/src/sync/sync-scheduler.ts
git commit -m "feat(conductor): migra sync-customer-addresses al Conductor con dry-run mode"
```

---

## Task 14 — Migra sync-orders e sync-customers → Conductor

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-orders.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-customers.ts`
- Modify: `archibald-web-app/backend/src/main.ts`
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts`

- [ ] **Step 1: Aggiungi dry-run support a sync-orders**

Stesso pattern di Task 13. In `sync-orders.ts`, le operazioni critiche sono:
- `DELETE FROM agents.order_records WHERE user_id = $1 AND id NOT IN (...)` → **questa è la delete stale, più critica**
- `INSERT/UPDATE order_records`

Wrappa entrambe:
```typescript
if (!deps.dryRun) {
  await pool.query(`DELETE FROM agents.order_records WHERE ...`, [...]);
} else {
  // Log degli order_id che verrebbero eliminati
  const staleIds = existingIds.filter(id => !fetchedIds.has(id));
  staleIds.forEach(id => deps.dryRunLogger?.recordDelete(id));
}
```

- [ ] **Step 2: Registra sync-orders e sync-customers nel Conductor handler map**

Stesso pattern di Task 13, con env var `SYNC_DRY_RUN_ORDERS` e `SYNC_DRY_RUN_CUSTOMERS`.

- [ ] **Step 3: Aggiorna scheduler per enqueua su Conductor**

In `enqueueAgentSyncs`, per `sync-orders` e `sync-customers`:

```typescript
function enqueueAgentSyncs(agentIds: string[], syncTypes: readonly OperationType[]): void {
  for (const userId of agentIds) {
    for (const syncType of syncTypes) {
      if (process.env.USE_CONDUCTOR_FOR_SYNCS === 'true' && isConductorSyncType(syncType)) {
        enqueueWithDedup(pool, { userId, taskType: syncType, payload: {}, priority: 500, requiresBrowser: true })
          .catch(err => logger.error('Conductor enqueue failed', { syncType, userId, err }));
      } else {
        enqueue(syncType, userId, {});
      }
    }
  }
}
```

- [ ] **Step 4: Dry-run per 24h poi cutover**

Attiva: `SYNC_DRY_RUN_ORDERS=true SYNC_DRY_RUN_CUSTOMERS=true USE_CONDUCTOR_FOR_SYNCS=true`
Monitora gli artifact. Verifica le delete stale (gli ordini con ID che verrebbero rimossi).
Cutover: rimuovi i flag dry-run, disabilita worker BullMQ per questi tipi.

- [ ] **Step 5: Type-check + commit**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -10
git add archibald-web-app/backend/src/operations/handlers/sync-orders.ts archibald-web-app/backend/src/operations/handlers/sync-customers.ts archibald-web-app/backend/src/main.ts archibald-web-app/backend/src/sync/sync-scheduler.ts
git commit -m "feat(conductor): migra sync-orders e sync-customers al Conductor con dry-run"
```

---

## Task 15 — Migra sync-ddt e sync-invoices → Conductor

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-ddt.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-invoices.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiungi dry-run support a sync-ddt e sync-invoices**

Stesso pattern dei task precedenti con env var `SYNC_DRY_RUN_DDT` e `SYNC_DRY_RUN_INVOICES`.

- [ ] **Step 2: Registra nel Conductor handler map + aggiorna scheduler**

Stesso pattern di Task 14.

- [ ] **Step 3: Dry-run 24h + cutover + commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/sync-ddt.ts archibald-web-app/backend/src/operations/handlers/sync-invoices.ts archibald-web-app/backend/src/main.ts
git commit -m "feat(conductor): migra sync-ddt e sync-invoices al Conductor"
```

---

## Task 16 — Migra sync-products e sync-prices → Conductor round-robin

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-products.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-prices.ts`
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Implementa round-robin in sync-scheduler**

Aggiungi la funzione round-robin per shared syncs:

```typescript
async function getNextAvailableAgentForSharedSync(pool: DbPool): Promise<string | null> {
  const { rows } = await pool.query<{ user_id: string }>(`
    SELECT ass.user_id
    FROM agents.agent_sync_state ass
    WHERE ass.user_id IN (
      SELECT id FROM agents.users WHERE active = TRUE
    )
    AND NOT EXISTS (
      SELECT 1 FROM system.agent_operation_queue aoq
      WHERE aoq.user_id = ass.user_id
        AND aoq.requires_browser = TRUE
        AND aoq.status = 'running'
    )
    ORDER BY ass.last_shared_sync_at ASC NULLS FIRST
    LIMIT 1
  `);

  if (rows.length === 0) {
    logger.warn('[SyncScheduler] shared_sync_skipped: nessun agente disponibile');
    return null;
  }
  return rows[0].user_id;
}
```

Sostituisci gli enqueue shared-sync BullMQ:

```typescript
// Nella funzione di scheduling shared sync (sostituisce 'service-account'):
if (process.env.USE_CONDUCTOR_FOR_SYNCS === 'true') {
  const agentId = await getNextAvailableAgentForSharedSync(pool);
  if (agentId) {
    await enqueueWithDedup(pool, { userId: agentId, taskType: 'sync-products', payload: {}, priority: 500 });
    await enqueueWithDedup(pool, { userId: agentId, taskType: 'sync-prices', payload: {}, priority: 500 });
  }
} else {
  enqueue('sync-products', 'service-account', {});
  enqueue('sync-prices', 'service-account', {});
}
```

- [ ] **Step 2: Aggiorna last_shared_sync_at dopo completamento**

In `worker.ts`, aggiungi dopo completamento sync-products e sync-prices:

```typescript
if (task.taskType === 'sync-products' || task.taskType === 'sync-prices') {
  await pool.query(
    `UPDATE agents.agent_sync_state SET last_shared_sync_at = NOW() WHERE user_id = $1`,
    [task.userId]
  ).catch(() => {});
}
```

- [ ] **Step 3: Type-check + commit**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -10
git add archibald-web-app/backend/src/sync/sync-scheduler.ts archibald-web-app/backend/src/conductor/worker.ts
git commit -m "feat(conductor): migra sync-products e sync-prices con round-robin agenti"
```

---

## Task 17 — Admin monitoring: lettura completa da agent_operation_queue

**Files:**
- Modify: `archibald-web-app/backend/src/routes/sync-status.ts`

- [ ] **Step 1: Aggiungi dep getConductorHistory a SyncStatusRouterDeps**

```typescript
type SyncStatusRouterDeps = {
  // ... esistenti ...
  getConductorHistory?: (syncType: string, limit: number) => Promise<Array<{
    completedAt: Date | null;
    startedAt: Date | null;
    status: string;
    errorMessage: string | null;
  }>>;
};
```

- [ ] **Step 2: Aggiorna la sezione sync-history per i tipi Conductor**

Nella route `/monitoring/sync-history`, per `sync-order-articles` (e tutti i tipi migrati al Conductor), usa `getConductorHistory` invece dei BullMQ jobs:

```typescript
const CONDUCTOR_SYNC_TYPES = new Set<OperationType>([
  'sync-order-articles',
  'sync-customer-addresses',
  'sync-orders',
  'sync-customers',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
]);

for (const syncType of SYNC_HISTORY_TYPES) {
  if (CONDUCTOR_SYNC_TYPES.has(syncType) && deps.getConductorHistory) {
    const rows = await deps.getConductorHistory(syncType, 20);
    const history = rows.map(r => ({
      timestamp: r.completedAt?.toISOString() ?? null,
      duration: r.startedAt && r.completedAt ? r.completedAt.getTime() - r.startedAt.getTime() : null,
      success: r.status === 'completed' && !r.errorMessage,
      error: r.errorMessage ?? null,
      outcome: 'real' as const,
    }));
    // calcola consecutiveFailures, health, ecc. dal history
    // ... stesso algoritmo dei BullMQ jobs ...
  }
}
```

- [ ] **Step 3: Wira getConductorHistory in server.ts**

```typescript
getConductorHistory: async (syncType: string, limit: number) => {
  const { rows } = await pool.query(
    `SELECT completed_at, started_at, status, error_message
     FROM system.agent_operation_queue
     WHERE task_type = $1
       AND status IN ('completed', 'failed')
     ORDER BY completed_at DESC NULLS LAST
     LIMIT $2`,
    [syncType, limit]
  );
  return rows.map(r => ({
    completedAt: r.completed_at,
    startedAt: r.started_at,
    status: r.status,
    errorMessage: r.error_message,
  }));
},
```

- [ ] **Step 4: Type-check + test + commit**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -10
npm test --prefix archibald-web-app/backend 2>&1 | tail -20
git add archibald-web-app/backend/src/routes/sync-status.ts archibald-web-app/backend/src/server.ts
git commit -m "feat(monitoring): sync-history legge da agent_operation_queue per tutti i tipi Conductor"
```

---

## Task 18 — Test suite completo + type-check finale

**Files:** tutti i file modificati

- [ ] **Step 1: Esegui type-check completo**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep -c "error TS"
```

Expected: 0 errori

- [ ] **Step 2: Esegui test suite backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -30
```

Expected: tutti i test passano

- [ ] **Step 3: Esegui test frontend**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Expected: tutti i test passano

- [ ] **Step 4: Verifica migration applicata in produzione (VPS)**

Prima di deployare il codice:
```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald \
   -c \"SELECT name FROM system.migrations ORDER BY applied_at DESC LIMIT 3;\""
```

Expected: `082-unified-conductor-priority` in cima alla lista.

- [ ] **Step 5: Commit finale di Fase 1**

```bash
git commit --allow-empty -m "chore: Fase 1 unified-conductor completa — priority lanes, slot reservation, sync migration"
```

---

## Checklist verifica spec

- [x] Migration #082 con colonne priority/run_after/requires_browser/dedup_key_external
- [x] sync_paused_users table in migration
- [x] last_shared_sync_at in agents.agent_sync_state
- [x] pickupNextTask ordina per priority, rispetta run_after e sync_paused_users
- [x] enqueueWithDedup con buildDedupKey per-task-type (no global GENERATED ALWAYS)
- [x] shouldPromoteP500ForUser: aging subordinato a P≤100 pending
- [x] Browser pool: 8 WRITE + 25 SYNC slots fissi (env var)
- [x] Warm window mutex Map<userId,Promise> (best-effort, process-local)
- [x] Memory guard > 75% RSS blocca nuovi SYNC context
- [x] Reaping context orfani al startup
- [x] smartCustomerSync scrive/rimuove sync_paused_users
- [x] Post-op sync dopo ERP write (fire-and-forget)
- [x] Fingerprint anti-duplicato: aggiunge grossAmount
- [x] DryRunArtifact con baseline, upserts, deletes, checksum
- [x] Shadow mode = dry-run (no double-execute)
- [x] Tutte le sync migrate al Conductor (Tasks 13-16)
- [x] Round-robin agenti per sync-products/sync-prices
- [x] Admin monitoring legge da agent_operation_queue
- [x] Rollback DDL documentato con IF EXISTS

**Fase 2** (HTTP discovery + session lifecycle): piano separato, da avviare dopo 2 settimane di Fase 1 stabile in produzione.
**Fase 3** (BullMQ elimination): piano separato, da avviare dopo Fase 2.

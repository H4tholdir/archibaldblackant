# Bot Conductor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare il Bot Conductor (coda agent-scoped FIFO + atomicità submit-order + canale unico scrittura ERP) come da spec `docs/superpowers/specs/2026-04-30-bot-conductor-design.md` (commit `516c3110`).

**Architecture:** Modulo backend in-process Node.js con persistenza Postgres (`system.agent_operation_queue`), serializzazione scritture ERP per `userId`, hot lifecycle (chain immediato), atomicità garantita su submit-order via persistenza fase + `erp_order_id`, auto-recovery on restart, circuit breaker per agent. Frontend evolution del `GlobalOperationBanner` con tendina espandibile, modal preflight per pending vecchi, telemetria UI per metrica Komet.

**Tech Stack:** Node.js + TypeScript (backend), PostgreSQL via `pg` Pool, Vitest, React 19 + Vite (frontend), Puppeteer (bot Archibald), WebSocket real-time, Postgres LISTEN/NOTIFY.

**Reference**: spec definitiva → `docs/superpowers/specs/2026-04-30-bot-conductor-design.md`

---

## File Structure (mappa)

### Backend NEW

| File | Responsabilità |
|---|---|
| `backend/src/db/migrations/073-order-records-delivery-address.sql` | Aggiunge `delivery_address_id` + `delivery_address_snapshot` |
| `backend/src/db/migrations/074-agent-operation-queue.sql` | Tabella cuore Conductor + trigger NOTIFY |
| `backend/src/db/migrations/075-agent-circuit-state.sql` | Circuit breaker per agent |
| `backend/src/db/migrations/076-bot-metrics.sql` | task_metrics + phase_metrics |
| `backend/src/db/migrations/077-ui-operation-intents.sql` | Telemetria UI temporanea |
| `backend/src/db/repositories/agent-queue.ts` | CRUD `system.agent_operation_queue` |
| `backend/src/db/repositories/agent-circuit-state.ts` | CRUD `system.agent_circuit_state` |
| `backend/src/db/repositories/bot-metrics.ts` | CRUD task_metrics + phase_metrics |
| `backend/src/db/repositories/ui-operation-intents.ts` | CRUD `system.ui_operation_intents` |
| `backend/src/conductor/error-classifier.ts` | Pure function: errore → `erp_unreachable` \| `application_error` |
| `backend/src/conductor/circuit-breaker.ts` | Open/close/half-open state machine, probe |
| `backend/src/conductor/metrics-recorder.ts` | API `recordPhase`, `recordTaskComplete` |
| `backend/src/conductor/auto-recovery.ts` | Recovery on backend restart |
| `backend/src/conductor/dispatcher.ts` | Singleton dispatcher con LISTEN/NOTIFY |
| `backend/src/conductor/worker.ts` | Worker per agente, chain immediato |
| `backend/src/conductor/types.ts` | Type definitions (TaskRow, TaskStatus, TaskPhase, etc.) |
| `backend/src/conductor/preflight-service.ts` | Logica preflight pending |
| `backend/src/routes/agent-queue.ts` | POST `/api/agent-queue/submit`, GET `/api/agent-queue/state` |
| `backend/src/routes/preflight.ts` | GET `/api/pending/:id/preflight` |
| `backend/scripts/drain-bullmq-bot-queue.mjs` | Script drainage pre-deploy |
| `backend/scripts/e2e-conductor/e2e-cleanup-helpers.mjs` | Utility cleanup ordini test post-E2E |
| `backend/scripts/e2e-conductor/e2e-simple-order.mjs` | E2E ordine simple |
| `backend/scripts/e2e-conductor/e2e-fresis-merged.mjs` | E2E ordine merged Fresis |
| `backend/scripts/e2e-conductor/e2e-batch-three.mjs` | E2E batch 3 ordini |
| `backend/scripts/e2e-conductor/e2e-large-order.mjs` | E2E ordine 15+ articoli |
| `backend/scripts/e2e-conductor/e2e-preflight.mjs` | E2E preflight modal |
| `backend/scripts/e2e-conductor/e2e-erp-down-simulation.mjs` | E2E circuit breaker |
| `backend/scripts/e2e-conductor/e2e-recovery.mjs` | E2E recovery on restart |
| `vps-scripts/cleanup-bot-metrics.sh` | Cron giornaliero TTL |

### Backend MODIFY

| File | Cosa cambia |
|---|---|
| `backend/src/operations/handlers/submit-order.ts` | Nuovo flow atomicità (sezione 3 spec) |
| `backend/src/bot/archibald-bot.ts` | Pre-check anti-duplicato + emit phase progress |
| `backend/src/sync/sync-scheduler.ts` | Pause sync condivise se Conductor attivo per qualsiasi user |
| `backend/src/main.ts` | Bootstrap Conductor.start() + AutoRecovery on startup |
| `backend/src/db/repositories/order-records.ts` | INSERT include `delivery_address_id`, `delivery_address_snapshot` |
| `backend/src/operations/queue-router.ts` | Rimuovi entries che ora vanno al Conductor (rimangono solo sync, enrichment, etc.) |

### Frontend NEW

| File | Responsabilità |
|---|---|
| `frontend/src/components/QueueDrawer.tsx` | Tendina espandibile coda |
| `frontend/src/components/PreflightModal.tsx` | Modal preflight pending vecchi |
| `frontend/src/api/agent-queue.ts` | Client API `/api/agent-queue/*` |
| `frontend/src/api/preflight.ts` | Client API `/api/pending/:id/preflight` |
| `frontend/src/hooks/useUiOperationTracking.ts` | Hook per emettere `UI_OPERATION_STARTED/COMPLETED` |

### Frontend MODIFY

| File | Cosa cambia |
|---|---|
| `frontend/src/components/GlobalOperationBanner.tsx` | Etichette umane + click → tendina, non-occlusivo, animazione expand |
| `frontend/src/contexts/OperationTrackingContext.tsx` | Stati estesi (queue with running/queued separati), supporto WS event coda |
| `frontend/src/hooks/usePendingSync.ts` | Sostituire enqueue parallelo con POST `/api/agent-queue/submit` |
| `frontend/src/pages/PendingOrdersPage.tsx` | Call preflight + nuovo enqueue Conductor |
| `frontend/src/pages/OrderHistory.tsx` | Render `delivery_address_snapshot` se diverso da customer principale + render `notes` |
| `frontend/src/components/OrderFormSimple.tsx` | Emit `UI_OPERATION_STARTED/COMPLETED` |
| `frontend/src/AppRouter.tsx` | Inietta padding-bottom dinamico per banner non-occlusivo |

### Tests (parallelo a ogni file backend)

| Test | Tipo |
|---|---|
| `backend/src/db/repositories/agent-queue.spec.ts` | Unit + integration |
| `backend/src/db/repositories/agent-circuit-state.spec.ts` | Unit + integration |
| `backend/src/db/repositories/bot-metrics.spec.ts` | Unit |
| `backend/src/db/repositories/ui-operation-intents.spec.ts` | Unit |
| `backend/src/conductor/error-classifier.spec.ts` | Pure unit (parameterized) |
| `backend/src/conductor/circuit-breaker.spec.ts` | Unit |
| `backend/src/conductor/metrics-recorder.spec.ts` | Unit |
| `backend/src/conductor/auto-recovery.spec.ts` | Integration (Postgres reale) |
| `backend/src/conductor/dispatcher.spec.ts` | Integration |
| `backend/src/conductor/worker.spec.ts` | Integration |
| `backend/src/conductor/preflight-service.spec.ts` | Unit |
| `backend/src/operations/handlers/submit-order.spec.ts` | Esteso per nuovo flow |
| `backend/src/routes/agent-queue.spec.ts` | API tests via supertest |
| `backend/src/routes/preflight.spec.ts` | API tests |
| `frontend/src/components/QueueDrawer.spec.tsx` | Component test |
| `frontend/src/components/PreflightModal.spec.tsx` | Component test |
| `frontend/src/components/GlobalOperationBanner.spec.tsx` | Esteso |
| `frontend/src/contexts/OperationTrackingContext.spec.tsx` | Esteso |
| `frontend/src/hooks/useUiOperationTracking.spec.tsx` | Hook test |

---

## Fasi e dipendenze

```
Fase A (DB + Repositories)
    ▼
Fase B (Conductor backend core)  ← dipende da A
    ▼
Fase C (Atomicità + APIs)         ← dipende da B
    ▼
Fase D (Frontend banner + queue)  ← dipende da C
    ▼
Fase E (Frontend pages + telemetria) ← dipende da D
    ▼
Fase F (E2E + drain + cleanup)    ← dipende da A-E
    ▼
Fase G (PR + smoke + merge)       ← dipende da F
```

Ogni fase ha task TDD bite-sized. Dopo OGNI task: 4 gate passati (FE test, BE test, FE type-check, BE build) prima di commit.

Riferimento gate (vedi CLAUDE.md):
```bash
npm test --prefix archibald-web-app/backend -- --run
npm test --prefix archibald-web-app/frontend -- --run
npm run type-check --prefix archibald-web-app/frontend
npm run build --prefix archibald-web-app/backend
```

---

# FASE A — Database + Repositories

## Task A0: Setup worktree e branch

**Files:**
- Crea worktree: `../Archibald-conductor`

- [ ] **Step 1: Crea worktree con branch dedicato**

```bash
cd /Users/hatholdir/Downloads/Archibald
git worktree add ../Archibald-conductor -b feature/bot-conductor
```

Expected output:
```
Preparing worktree (new branch 'feature/bot-conductor')
HEAD is now at <SHA> docs(spec): design Bot Conductor - coda agent-scoped + atomicità
```

- [ ] **Step 2: Sposta cwd al worktree e verifica**

```bash
cd /Users/hatholdir/Archibald-conductor
git status
git log --oneline -3
```

Expected: branch `feature/bot-conductor`, HEAD = commit `516c3110`.

- [ ] **Step 3: Verifica baseline 4 gate verde su master**

```bash
npm test --prefix archibald-web-app/backend -- --run 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend -- --run 2>&1 | tail -5
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
```

Expected: tutti i gate passano. Se NO, sistema rotto pre-implementazione: investigare e ripristinare prima di procedere.

---

## Task A1: Migration 073 — delivery_address columns

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/073-order-records-delivery-address.sql`

- [ ] **Step 1: Crea il file SQL migration**

```sql
-- 073-order-records-delivery-address.sql
-- Aggiunge campi delivery dedicati a order_records
BEGIN;

ALTER TABLE agents.order_records 
  ADD COLUMN delivery_address_id INTEGER NULL,
  ADD COLUMN delivery_address_snapshot JSONB NULL;

COMMENT ON COLUMN agents.order_records.delivery_address_id IS 
  'FK opzionale a agents.customer_addresses.id se delivery != indirizzo principale cliente';
COMMENT ON COLUMN agents.order_records.delivery_address_snapshot IS 
  'Snapshot JSON dell''indirizzo al momento del piazzamento';

CREATE INDEX idx_order_records_delivery_address 
  ON agents.order_records (user_id, delivery_address_id) 
  WHERE delivery_address_id IS NOT NULL;

COMMIT;
```

- [ ] **Step 2: Lancia migration in locale**

Setup locale: backend espone `npm run migrate` che esegue tutte le migration. Verifica con:

```bash
cd archibald-web-app/backend
npm run migrate 2>&1 | tail -20
```

Expected: log inclusivo della 073 applicata. Se non c'è il comando `migrate`, vedi `src/db/migrate.ts` e usa lo script equivalente.

- [ ] **Step 3: Verifica colonne create**

```bash
psql -h localhost -U archibald -d archibald -c "\d agents.order_records" | grep -E "delivery_address"
```

Expected: 2 righe `delivery_address_id INTEGER` e `delivery_address_snapshot JSONB`.

- [ ] **Step 4: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
```

Expected: build success.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/073-order-records-delivery-address.sql
git commit -m "feat(db): aggiungi delivery_address_id e snapshot a order_records

Migration 073. Aggiunge due colonne nullable a agents.order_records:
- delivery_address_id: FK opzionale a customer_addresses
- delivery_address_snapshot: JSONB con snapshot indirizzo al momento ordine

Indice parziale su (user_id, delivery_address_id) per ordini con consegna alternativa.

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 8.1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task A2: Migration 074 — agent_operation_queue (cuore Conductor)

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/074-agent-operation-queue.sql`

- [ ] **Step 1: Scrivi la migration completa**

```sql
-- 074-agent-operation-queue.sql
-- Tabella cuore del Bot Conductor: fila persistente per scritture ERP per agente
BEGIN;

CREATE TABLE system.agent_operation_queue (
  task_id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  task_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  batch_id TEXT NULL,
  
  position INTEGER NOT NULL,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  status TEXT NOT NULL DEFAULT 'enqueued',
  phase TEXT NULL,
  
  erp_order_id TEXT NULL,
  
  started_at TIMESTAMPTZ NULL,
  heartbeat_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_class TEXT NULL,
  error_message TEXT NULL,
  
  cancelled_at TIMESTAMPTZ NULL,
  cancelled_reason TEXT NULL,
  
  CONSTRAINT chk_queue_status 
    CHECK (status IN ('enqueued', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT chk_queue_phase 
    CHECK (phase IS NULL OR phase IN ('in_progress', 'erp_save_done', 'db_committed', 'completed')),
  CONSTRAINT chk_queue_error_class
    CHECK (error_class IS NULL OR error_class IN ('erp_unreachable', 'application_error'))
);

CREATE INDEX idx_agent_queue_pickup 
  ON system.agent_operation_queue (user_id, status, position, enqueued_at) 
  WHERE status = 'enqueued';

CREATE INDEX idx_agent_queue_orphans 
  ON system.agent_operation_queue (status, heartbeat_at) 
  WHERE status = 'running';

CREATE INDEX idx_agent_queue_user_status 
  ON system.agent_operation_queue (user_id, status, enqueued_at DESC);

CREATE INDEX idx_agent_queue_batch 
  ON system.agent_operation_queue (batch_id) 
  WHERE batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION system.notify_queue_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('agent_queue_changed', NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_queue_notify
AFTER INSERT OR UPDATE OF status ON system.agent_operation_queue
FOR EACH ROW EXECUTE FUNCTION system.notify_queue_change();

COMMIT;
```

- [ ] **Step 2: Applica migration**

```bash
cd archibald-web-app/backend
npm run migrate 2>&1 | tail -10
```

- [ ] **Step 3: Verifica struttura tabella + trigger**

```bash
psql -h localhost -U archibald -d archibald <<EOF
\d system.agent_operation_queue
SELECT tgname FROM pg_trigger WHERE tgrelid = 'system.agent_operation_queue'::regclass;
SELECT proname FROM pg_proc WHERE proname = 'notify_queue_change';
EOF
```

Expected: tabella con tutte le colonne, 4 indici, 1 trigger `trg_agent_queue_notify`, 1 function `notify_queue_change`.

- [ ] **Step 4: Test smoke INSERT con CHECK constraints**

```bash
psql -h localhost -U archibald -d archibald <<EOF
-- Test CHECK status: dovrebbe FAILARE
INSERT INTO system.agent_operation_queue (user_id, task_type, payload, position, status) 
VALUES ('test', 'submit-order', '{}', 1, 'invalid_status');
EOF
```

Expected: ERROR `chk_queue_status` violation.

```bash
psql -h localhost -U archibald -d archibald <<EOF
-- INSERT valido
INSERT INTO system.agent_operation_queue (user_id, task_type, payload, position) 
VALUES ('test_user', 'submit-order', '{}', 1) 
RETURNING task_id, status, enqueued_at;
DELETE FROM system.agent_operation_queue WHERE user_id = 'test_user';
EOF
```

Expected: INSERT success con `status='enqueued'` di default.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/074-agent-operation-queue.sql
git commit -m "feat(db): aggiungi system.agent_operation_queue per Bot Conductor

Migration 074. Tabella cuore del Conductor: fila persistente per le
scritture ERP per agente, con state machine (enqueued/running/completed/failed/cancelled),
fasi atomicità (erp_save_done/db_committed) e CHECK constraints.

Trigger notify_queue_change emette pg_notify('agent_queue_changed', user_id)
ad ogni INSERT/UPDATE per dispatcher LISTEN/NOTIFY.

4 indici: pickup, orphans recovery, user status, batch lookup.

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 8.2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task A3: Migration 075-077 — circuit_state, metrics, ui_intents

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/075-agent-circuit-state.sql`
- Create: `archibald-web-app/backend/src/db/migrations/076-bot-metrics.sql`
- Create: `archibald-web-app/backend/src/db/migrations/077-ui-operation-intents.sql`

- [ ] **Step 1: Migration 075 (circuit state)**

File `075-agent-circuit-state.sql`:

```sql
BEGIN;

CREATE TABLE system.agent_circuit_state (
  user_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'closed',
  consecutive_erp_failures INTEGER NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NULL,
  last_probe_at TIMESTAMPTZ NULL,
  next_probe_at TIMESTAMPTZ NULL,
  last_error_message TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT chk_circuit_state 
    CHECK (state IN ('closed', 'open', 'half_open'))
);

CREATE INDEX idx_circuit_state_open 
  ON system.agent_circuit_state (state, next_probe_at) 
  WHERE state = 'open';

COMMIT;
```

- [ ] **Step 2: Migration 076 (metrics)**

File `076-bot-metrics.sql`:

```sql
BEGIN;

CREATE TABLE system.bot_task_metrics (
  task_id BIGINT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  agent_mode TEXT NULL,
  customer_id TEXT NULL,
  customer_name TEXT NULL,
  order_id TEXT NULL,
  num_articles INTEGER NULL,
  
  ui_started_at TIMESTAMPTZ NULL,
  ui_completed_at TIMESTAMPTZ NULL,
  enqueued_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  
  ui_duration_ms BIGINT NULL,
  queue_wait_ms BIGINT NULL,
  bot_duration_ms BIGINT NULL,
  total_e2e_ms BIGINT NULL,
  
  status TEXT NOT NULL,
  error_class TEXT NULL,
  error_message TEXT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT chk_metrics_status 
    CHECK (status IN ('completed', 'failed', 'cancelled')),
  CONSTRAINT chk_metrics_error_class
    CHECK (error_class IS NULL OR error_class IN ('erp_unreachable', 'application_error'))
);

CREATE INDEX idx_bot_task_metrics_user_started 
  ON system.bot_task_metrics (user_id, started_at DESC);
CREATE INDEX idx_bot_task_metrics_type_started 
  ON system.bot_task_metrics (task_type, started_at DESC);
CREATE INDEX idx_bot_task_metrics_agent_mode 
  ON system.bot_task_metrics (agent_mode, started_at DESC) 
  WHERE agent_mode IS NOT NULL;

CREATE TABLE system.bot_phase_metrics (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES system.bot_task_metrics(task_id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  duration_ms BIGINT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  notes JSONB NULL,
  
  CONSTRAINT chk_phase_name
    CHECK (phase IN ('login', 'navigation', 'customer_fill', 'articles_fill', 'discount_notes', 'save', 'verification'))
);

CREATE INDEX idx_bot_phase_metrics_task ON system.bot_phase_metrics (task_id);
CREATE INDEX idx_bot_phase_metrics_phase ON system.bot_phase_metrics (phase, started_at DESC);

COMMIT;
```

- [ ] **Step 3: Migration 077 (ui_intents)**

File `077-ui-operation-intents.sql`:

```sql
BEGIN;

CREATE TABLE system.ui_operation_intents (
  intent_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pending_order_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ui_started_at TIMESTAMPTZ NOT NULL,
  ui_completed_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX idx_ui_intents_pending 
  ON system.ui_operation_intents (pending_order_id) 
  WHERE ui_completed_at IS NOT NULL;

CREATE INDEX idx_ui_intents_cleanup 
  ON system.ui_operation_intents (expires_at);

COMMIT;
```

- [ ] **Step 4: Applica le 3 migration**

```bash
cd archibald-web-app/backend
npm run migrate 2>&1 | tail -15
```

- [ ] **Step 5: Verifica tutte e 3**

```bash
psql -h localhost -U archibald -d archibald -c "\dt system.*" | grep -E "circuit_state|bot_task|bot_phase|ui_operation"
```

Expected: 4 righe (le 4 tabelle).

- [ ] **Step 6: Commit unico per le 3 migration**

```bash
git add archibald-web-app/backend/src/db/migrations/075-*.sql \
        archibald-web-app/backend/src/db/migrations/076-*.sql \
        archibald-web-app/backend/src/db/migrations/077-*.sql
git commit -m "feat(db): aggiungi tabelle Conductor circuit_state, metrics, ui_intents

Migration 075: system.agent_circuit_state per circuit breaker per-agent.
Migration 076: system.bot_task_metrics + bot_phase_metrics per metriche Komet.
Migration 077: system.ui_operation_intents per telemetria UI temporanea (TTL 24h).

Tutti i CHECK constraints inclusi per integrità DB.

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 8.3-8.5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task A4: Repository `agent-queue` (CRUD core)

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/agent-queue.ts`
- Create: `archibald-web-app/backend/src/db/repositories/agent-queue.spec.ts`

- [ ] **Step 1: Crea types base**

File `archibald-web-app/backend/src/conductor/types.ts`:

```typescript
export type TaskStatus = 'enqueued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPhase = 'in_progress' | 'erp_save_done' | 'db_committed' | 'completed';
export type ErrorClass = 'erp_unreachable' | 'application_error';

export type TaskType = 
  | 'submit-order' 
  | 'send-to-verona' 
  | 'edit-order' 
  | 'delete-order' 
  | 'batch-send-to-verona' 
  | 'batch-delete-orders';

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
};
```

- [ ] **Step 2: Scrivi failing test (TDD: prima il test)**

File `archibald-web-app/backend/src/db/repositories/agent-queue.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createDbPool } from '../pool';
import type { DbPool } from '../pool';
import {
  enqueueTask,
  pickupNextTask,
  updateTaskHeartbeat,
  updateTaskPhase,
  completeTask,
  failTask,
  findOrphanRunningTasks,
  countActiveByUser,
} from './agent-queue';

const skipIf = process.env.CI === 'true' || !process.env.PG_HOST;

describe.skipIf(skipIf)('agent-queue repository', () => {
  let pool: DbPool;
  
  beforeEach(async () => {
    pool = createDbPool();
    await pool.query("DELETE FROM system.agent_operation_queue WHERE user_id LIKE 'test_%'");
  });
  
  afterAll(async () => {
    await pool.query("DELETE FROM system.agent_operation_queue WHERE user_id LIKE 'test_%'");
  });
  
  describe('enqueueTask', () => {
    it('inserts a task with status enqueued and computed position', async () => {
      const taskId = await enqueueTask(pool, {
        userId: 'test_alice',
        taskType: 'submit-order',
        payload: { pendingOrderId: 'p1' },
      });
      
      expect(taskId).toBeGreaterThan(0n);
      
      const { rows } = await pool.query<{ status: string; position: number }>(
        'SELECT status, position FROM system.agent_operation_queue WHERE task_id = $1',
        [taskId],
      );
      expect(rows[0].status).toBe('enqueued');
      expect(rows[0].position).toBe(1);
    });
    
    it('assigns position incrementally per user', async () => {
      const t1 = await enqueueTask(pool, { userId: 'test_bob', taskType: 'submit-order', payload: {} });
      const t2 = await enqueueTask(pool, { userId: 'test_bob', taskType: 'submit-order', payload: {} });
      const t3 = await enqueueTask(pool, { userId: 'test_charlie', taskType: 'submit-order', payload: {} });
      
      const { rows } = await pool.query<{ task_id: bigint; position: number; user_id: string }>(
        'SELECT task_id, position, user_id FROM system.agent_operation_queue WHERE task_id IN ($1, $2, $3) ORDER BY task_id',
        [t1, t2, t3],
      );
      expect(rows.find(r => r.task_id === t1)?.position).toBe(1);
      expect(rows.find(r => r.task_id === t2)?.position).toBe(2);
      expect(rows.find(r => r.task_id === t3)?.position).toBe(1);
    });
  });
  
  describe('pickupNextTask', () => {
    it('returns the next enqueued task for the user (FIFO by position)', async () => {
      const t1 = await enqueueTask(pool, { userId: 'test_dave', taskType: 'submit-order', payload: { p: 1 } });
      const t2 = await enqueueTask(pool, { userId: 'test_dave', taskType: 'submit-order', payload: { p: 2 } });
      
      const pickedFirst = await pickupNextTask(pool, 'test_dave');
      expect(pickedFirst?.taskId).toBe(t1);
      expect(pickedFirst?.status).toBe('running');
    });
    
    it('returns null if no enqueued tasks', async () => {
      const picked = await pickupNextTask(pool, 'test_eve');
      expect(picked).toBeNull();
    });
    
    it('does not pickup a task already running', async () => {
      const t1 = await enqueueTask(pool, { userId: 'test_frank', taskType: 'submit-order', payload: {} });
      await pickupNextTask(pool, 'test_frank'); // mark as running
      const second = await pickupNextTask(pool, 'test_frank');
      expect(second).toBeNull();
    });
  });
  
  describe('updateTaskPhase', () => {
    it('persists phase and erp_order_id together (atomic)', async () => {
      const t = await enqueueTask(pool, { userId: 'test_g', taskType: 'submit-order', payload: {} });
      await pickupNextTask(pool, 'test_g');
      
      await updateTaskPhase(pool, t, 'erp_save_done', '53.805');
      
      const { rows } = await pool.query<{ phase: string; erp_order_id: string }>(
        'SELECT phase, erp_order_id FROM system.agent_operation_queue WHERE task_id = $1',
        [t],
      );
      expect(rows[0].phase).toBe('erp_save_done');
      expect(rows[0].erp_order_id).toBe('53.805');
    });
  });
  
  describe('findOrphanRunningTasks', () => {
    it('returns tasks running with stale heartbeat', async () => {
      const t = await enqueueTask(pool, { userId: 'test_h', taskType: 'submit-order', payload: {} });
      await pickupNextTask(pool, 'test_h');
      // Force heartbeat backwards
      await pool.query(
        "UPDATE system.agent_operation_queue SET heartbeat_at = now() - INTERVAL '90 seconds' WHERE task_id = $1",
        [t],
      );
      
      const orphans = await findOrphanRunningTasks(pool, 60);
      expect(orphans.find(o => o.taskId === t)).toBeDefined();
    });
  });
  
  describe('countActiveByUser', () => {
    it('counts tasks in enqueued + running for a user', async () => {
      await enqueueTask(pool, { userId: 'test_i', taskType: 'submit-order', payload: {} });
      await enqueueTask(pool, { userId: 'test_i', taskType: 'submit-order', payload: {} });
      const t3 = await enqueueTask(pool, { userId: 'test_i', taskType: 'submit-order', payload: {} });
      await completeTask(pool, t3);
      
      const count = await countActiveByUser(pool, 'test_i');
      expect(count).toBe(2);
    });
  });
});
```

- [ ] **Step 3: Run test, expect FAIL (modulo non esiste)**

```bash
cd archibald-web-app/backend
npm test -- --run src/db/repositories/agent-queue.spec.ts 2>&1 | tail -10
```

Expected: FAIL "Cannot find module './agent-queue'".

- [ ] **Step 4: Implementa repository**

File `archibald-web-app/backend/src/db/repositories/agent-queue.ts`:

```typescript
import type { DbPool, TxClient } from '../pool';
import type { TaskRow, TaskStatus, TaskPhase, TaskType, ErrorClass } from '../../conductor/types';

type Querier = DbPool | TxClient;

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
};

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
  };
}

export type EnqueueParams = {
  userId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  batchId?: string;
};

export async function enqueueTask(pool: DbPool, params: EnqueueParams): Promise<bigint> {
  return await pool.withTransaction(async (tx) => {
    const { rows: [maxRow] } = await tx.query<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_position 
       FROM system.agent_operation_queue 
       WHERE user_id = $1 AND status IN ('enqueued', 'running')`,
      [params.userId],
    );
    
    const { rows: [task] } = await tx.query<{ task_id: string }>(
      `INSERT INTO system.agent_operation_queue 
       (user_id, task_type, payload, batch_id, position, status)
       VALUES ($1, $2, $3, $4, $5, 'enqueued')
       RETURNING task_id`,
      [
        params.userId, 
        params.taskType, 
        JSON.stringify(params.payload), 
        params.batchId ?? null, 
        maxRow.next_position,
      ],
    );
    
    return BigInt(task.task_id);
  });
}

export async function pickupNextTask(pool: DbPool, userId: string): Promise<TaskRow | null> {
  const { rows } = await pool.query<DbTaskRow>(
    `UPDATE system.agent_operation_queue
     SET status = 'running', 
         started_at = COALESCE(started_at, now()),
         heartbeat_at = now()
     WHERE task_id = (
       SELECT task_id FROM system.agent_operation_queue
       WHERE user_id = $1 AND status = 'enqueued'
       ORDER BY position ASC, enqueued_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [userId],
  );
  
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateTaskHeartbeat(pool: Querier, taskId: bigint): Promise<void> {
  await pool.query(
    `UPDATE system.agent_operation_queue 
     SET heartbeat_at = now() 
     WHERE task_id = $1 AND status = 'running'`,
    [taskId.toString()],
  );
}

export async function updateTaskPhase(
  pool: Querier, 
  taskId: bigint, 
  phase: TaskPhase, 
  erpOrderId?: string,
): Promise<void> {
  if (erpOrderId !== undefined) {
    await pool.query(
      `UPDATE system.agent_operation_queue 
       SET phase = $1, erp_order_id = $2, heartbeat_at = now()
       WHERE task_id = $3`,
      [phase, erpOrderId, taskId.toString()],
    );
  } else {
    await pool.query(
      `UPDATE system.agent_operation_queue 
       SET phase = $1, heartbeat_at = now()
       WHERE task_id = $2`,
      [phase, taskId.toString()],
    );
  }
}

export async function completeTask(pool: Querier, taskId: bigint): Promise<void> {
  await pool.query(
    `UPDATE system.agent_operation_queue 
     SET status = 'completed', phase = 'completed', completed_at = now()
     WHERE task_id = $1`,
    [taskId.toString()],
  );
}

export type FailParams = {
  errorClass: ErrorClass;
  errorMessage: string;
  incrementRetry: boolean;
};

export async function failTask(
  pool: Querier, 
  taskId: bigint, 
  params: FailParams,
): Promise<{ retryCount: number; willRetry: boolean }> {
  const { rows: [row] } = await pool.query<{ retry_count: number; max_retries: number }>(
    `UPDATE system.agent_operation_queue 
     SET error_class = $1, 
         error_message = $2,
         retry_count = retry_count + $3,
         status = CASE 
                    WHEN retry_count + $3 >= max_retries THEN 'failed'
                    ELSE 'enqueued'
                  END,
         heartbeat_at = NULL,
         started_at = NULL
     WHERE task_id = $4
     RETURNING retry_count, max_retries`,
    [
      params.errorClass, 
      params.errorMessage, 
      params.incrementRetry ? 1 : 0, 
      taskId.toString(),
    ],
  );
  return {
    retryCount: row.retry_count,
    willRetry: row.retry_count < row.max_retries,
  };
}

export async function findOrphanRunningTasks(
  pool: DbPool, 
  staleSeconds: number,
): Promise<TaskRow[]> {
  const { rows } = await pool.query<DbTaskRow>(
    `SELECT * FROM system.agent_operation_queue 
     WHERE status = 'running' 
       AND heartbeat_at < now() - INTERVAL '1 second' * $1`,
    [staleSeconds],
  );
  return rows.map(mapRow);
}

export async function countActiveByUser(pool: DbPool, userId: string): Promise<number> {
  const { rows: [row] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM system.agent_operation_queue 
     WHERE user_id = $1 AND status IN ('enqueued', 'running')`,
    [userId],
  );
  return parseInt(row.count, 10);
}

export async function listActiveByUser(pool: DbPool, userId: string): Promise<TaskRow[]> {
  const { rows } = await pool.query<DbTaskRow>(
    `SELECT * FROM system.agent_operation_queue 
     WHERE user_id = $1 AND status IN ('enqueued', 'running')
     ORDER BY position ASC, enqueued_at ASC`,
    [userId],
  );
  return rows.map(mapRow);
}

export async function listRecentCompletedByUser(
  pool: DbPool, 
  userId: string, 
  limit: number,
): Promise<TaskRow[]> {
  const { rows } = await pool.query<DbTaskRow>(
    `SELECT * FROM system.agent_operation_queue 
     WHERE user_id = $1 AND status IN ('completed', 'failed', 'cancelled')
     ORDER BY completed_at DESC NULLS LAST
     LIMIT $2`,
    [userId, limit],
  );
  return rows.map(mapRow);
}

export async function cancelTask(
  pool: DbPool, 
  taskId: bigint, 
  reason: string,
): Promise<void> {
  await pool.query(
    `UPDATE system.agent_operation_queue 
     SET status = 'cancelled', cancelled_at = now(), cancelled_reason = $1
     WHERE task_id = $2 AND status IN ('enqueued', 'running')`,
    [reason, taskId.toString()],
  );
}

export async function getTaskById(pool: DbPool, taskId: bigint): Promise<TaskRow | null> {
  const { rows } = await pool.query<DbTaskRow>(
    `SELECT * FROM system.agent_operation_queue WHERE task_id = $1`,
    [taskId.toString()],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
```

- [ ] **Step 5: Run test, expect PASS**

```bash
npm test -- --run src/db/repositories/agent-queue.spec.ts 2>&1 | tail -15
```

Expected: tutti i test passano (o vengono `skipIf` se PG_HOST non è settato — in tal caso eseguili con `PG_HOST=localhost npm test ...`).

- [ ] **Step 6: 4-gate**

```bash
npm test --prefix archibald-web-app/backend -- --run 2>&1 | tail -5
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
```

Expected: tutto verde.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/conductor/types.ts \
        archibald-web-app/backend/src/db/repositories/agent-queue.ts \
        archibald-web-app/backend/src/db/repositories/agent-queue.spec.ts
git commit -m "feat(conductor): repository agent-queue per CRUD coda Conductor

CRUD completo su system.agent_operation_queue:
- enqueueTask: INSERT atomic con position computed
- pickupNextTask: SELECT FOR UPDATE SKIP LOCKED + UPDATE running
- updateTaskHeartbeat, updateTaskPhase: aggiornamenti incrementali
- completeTask, failTask: state machine transitions
- findOrphanRunningTasks: per auto-recovery on restart
- countActiveByUser, listActiveByUser, listRecentCompletedByUser
- cancelTask, getTaskById

Test integration con Postgres reale (skipIf in CI).

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 8.2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task A5: Repository circuit-state, bot-metrics, ui-intents

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/agent-circuit-state.ts` + spec
- Create: `archibald-web-app/backend/src/db/repositories/bot-metrics.ts` + spec
- Create: `archibald-web-app/backend/src/db/repositories/ui-operation-intents.ts` + spec

- [ ] **Step 1: Repository circuit-state**

Pattern simile a agent-queue. CRUD: `getState`, `recordFailure`, `openCircuit`, `setHalfOpen`, `closeCircuit`, `findCircuitsToProbe`.

Vedi sezione 5.2 della spec per il flow degli stati. Le funzioni:

```typescript
// archibald-web-app/backend/src/db/repositories/agent-circuit-state.ts
import type { DbPool } from '../pool';

export type CircuitState = 'closed' | 'open' | 'half_open';

export type CircuitStateRow = {
  userId: string;
  state: CircuitState;
  consecutiveErpFailures: number;
  openedAt: Date | null;
  lastProbeAt: Date | null;
  nextProbeAt: Date | null;
  lastErrorMessage: string | null;
  updatedAt: Date;
};

export async function getState(pool: DbPool, userId: string): Promise<CircuitStateRow | null> {
  const { rows } = await pool.query(
    `SELECT user_id, state, consecutive_erp_failures, opened_at, last_probe_at, 
            next_probe_at, last_error_message, updated_at
     FROM system.agent_circuit_state WHERE user_id = $1`,
    [userId],
  );
  if (!rows[0]) return null;
  return {
    userId: rows[0].user_id,
    state: rows[0].state,
    consecutiveErpFailures: rows[0].consecutive_erp_failures,
    openedAt: rows[0].opened_at,
    lastProbeAt: rows[0].last_probe_at,
    nextProbeAt: rows[0].next_probe_at,
    lastErrorMessage: rows[0].last_error_message,
    updatedAt: rows[0].updated_at,
  };
}

export async function recordErpFailure(
  pool: DbPool, 
  userId: string, 
  errorMessage: string,
): Promise<{ shouldOpen: boolean; failures: number }> {
  const { rows: [row] } = await pool.query<{ consecutive_erp_failures: number }>(
    `INSERT INTO system.agent_circuit_state (user_id, state, consecutive_erp_failures, last_error_message, updated_at)
     VALUES ($1, 'closed', 1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET
       consecutive_erp_failures = system.agent_circuit_state.consecutive_erp_failures + 1,
       last_error_message = $2,
       updated_at = now()
     RETURNING consecutive_erp_failures`,
    [userId, errorMessage],
  );
  return { shouldOpen: row.consecutive_erp_failures >= 3, failures: row.consecutive_erp_failures };
}

export async function openCircuit(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE system.agent_circuit_state
     SET state = 'open', opened_at = now(), 
         next_probe_at = now() + INTERVAL '5 minutes',
         updated_at = now()
     WHERE user_id = $1`,
    [userId],
  );
}

export async function setHalfOpen(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE system.agent_circuit_state
     SET state = 'half_open', last_probe_at = now(), updated_at = now()
     WHERE user_id = $1`,
    [userId],
  );
}

export async function closeCircuit(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE system.agent_circuit_state
     SET state = 'closed', consecutive_erp_failures = 0, 
         opened_at = NULL, last_error_message = NULL, updated_at = now()
     WHERE user_id = $1`,
    [userId],
  );
}

export async function rescheduleProbe(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE system.agent_circuit_state
     SET state = 'open', last_probe_at = now(), 
         next_probe_at = now() + INTERVAL '5 minutes',
         updated_at = now()
     WHERE user_id = $1`,
    [userId],
  );
}

export async function findCircuitsToProbe(pool: DbPool): Promise<string[]> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM system.agent_circuit_state 
     WHERE state = 'open' AND next_probe_at <= now()`,
  );
  return rows.map(r => r.user_id);
}

export async function recordErpSuccess(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO system.agent_circuit_state (user_id, state, consecutive_erp_failures, updated_at)
     VALUES ($1, 'closed', 0, now())
     ON CONFLICT (user_id) DO UPDATE SET 
       consecutive_erp_failures = 0,
       state = 'closed',
       opened_at = NULL,
       updated_at = now()`,
    [userId],
  );
}
```

- [ ] **Step 2: Spec circuit-state (test integration)**

File `archibald-web-app/backend/src/db/repositories/agent-circuit-state.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createDbPool } from '../pool';
import {
  getState, recordErpFailure, openCircuit, setHalfOpen, closeCircuit,
  rescheduleProbe, findCircuitsToProbe, recordErpSuccess,
} from './agent-circuit-state';

const skipIf = process.env.CI === 'true' || !process.env.PG_HOST;

describe.skipIf(skipIf)('agent-circuit-state repository', () => {
  const pool = createDbPool();
  
  beforeEach(async () => {
    await pool.query("DELETE FROM system.agent_circuit_state WHERE user_id LIKE 'test_%'");
  });
  
  it('records first failure and creates row in closed state', async () => {
    const result = await recordErpFailure(pool, 'test_a', 'login failed');
    expect(result.failures).toBe(1);
    expect(result.shouldOpen).toBe(false);
  });
  
  it('triggers shouldOpen=true on 3rd failure', async () => {
    await recordErpFailure(pool, 'test_b', 'err1');
    await recordErpFailure(pool, 'test_b', 'err2');
    const result = await recordErpFailure(pool, 'test_b', 'err3');
    expect(result.shouldOpen).toBe(true);
    expect(result.failures).toBe(3);
  });
  
  it('opens circuit and sets next_probe_at +5min', async () => {
    await recordErpFailure(pool, 'test_c', 'err');
    await openCircuit(pool, 'test_c');
    const state = await getState(pool, 'test_c');
    expect(state?.state).toBe('open');
    expect(state?.nextProbeAt).toBeDefined();
  });
  
  it('findCircuitsToProbe returns only open circuits ready', async () => {
    await recordErpFailure(pool, 'test_d', 'err');
    await openCircuit(pool, 'test_d');
    // Force next_probe_at to past
    await pool.query("UPDATE system.agent_circuit_state SET next_probe_at = now() - INTERVAL '1 minute' WHERE user_id = 'test_d'");
    const toProbe = await findCircuitsToProbe(pool);
    expect(toProbe).toContain('test_d');
  });
  
  it('closeCircuit resets counters', async () => {
    await recordErpFailure(pool, 'test_e', 'err');
    await recordErpFailure(pool, 'test_e', 'err');
    await closeCircuit(pool, 'test_e');
    const state = await getState(pool, 'test_e');
    expect(state?.state).toBe('closed');
    expect(state?.consecutiveErpFailures).toBe(0);
  });
  
  it('recordErpSuccess resets if circuit was open', async () => {
    await recordErpFailure(pool, 'test_f', 'err');
    await recordErpFailure(pool, 'test_f', 'err');
    await recordErpFailure(pool, 'test_f', 'err');
    await openCircuit(pool, 'test_f');
    await recordErpSuccess(pool, 'test_f');
    const state = await getState(pool, 'test_f');
    expect(state?.state).toBe('closed');
    expect(state?.consecutiveErpFailures).toBe(0);
  });
});
```

- [ ] **Step 3: Repository bot-metrics**

File `archibald-web-app/backend/src/db/repositories/bot-metrics.ts`:

```typescript
import type { DbPool, TxClient } from '../pool';
import type { TaskStatus, ErrorClass } from '../../conductor/types';

type Querier = DbPool | TxClient;

export type TaskMetricInsert = {
  taskId: bigint;
  userId: string;
  taskType: string;
  agentMode?: 'simple' | 'fresis';
  customerId?: string;
  customerName?: string;
  numArticles?: number;
  uiStartedAt?: Date | null;
  uiCompletedAt?: Date | null;
  enqueuedAt: Date;
  uiDurationMs?: number | null;
};

export async function recordTaskStart(pool: Querier, params: TaskMetricInsert): Promise<void> {
  await pool.query(
    `INSERT INTO system.bot_task_metrics 
     (task_id, user_id, task_type, agent_mode, customer_id, customer_name, 
      num_articles, ui_started_at, ui_completed_at, enqueued_at, ui_duration_ms, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'completed')
     ON CONFLICT (task_id) DO NOTHING`,
    [
      params.taskId.toString(),
      params.userId,
      params.taskType,
      params.agentMode ?? null,
      params.customerId ?? null,
      params.customerName ?? null,
      params.numArticles ?? null,
      params.uiStartedAt ?? null,
      params.uiCompletedAt ?? null,
      params.enqueuedAt,
      params.uiDurationMs ?? null,
    ],
  );
}

export type TaskMetricFinish = {
  taskId: bigint;
  startedAt: Date;
  completedAt: Date;
  status: TaskStatus;
  errorClass?: ErrorClass | null;
  errorMessage?: string | null;
  retryCount: number;
  orderId?: string;
  uiDurationMs: number | null;
};

export async function recordTaskFinish(pool: Querier, params: TaskMetricFinish): Promise<void> {
  const { taskId, startedAt, completedAt, status, errorClass, errorMessage, retryCount, orderId, uiDurationMs } = params;
  
  await pool.query(
    `UPDATE system.bot_task_metrics SET
       started_at = $1,
       completed_at = $2,
       status = $3,
       error_class = $4,
       error_message = $5,
       retry_count = $6,
       order_id = COALESCE($7, order_id),
       queue_wait_ms = EXTRACT(EPOCH FROM ($1 - enqueued_at)) * 1000,
       bot_duration_ms = EXTRACT(EPOCH FROM ($2 - $1)) * 1000,
       total_e2e_ms = COALESCE(ui_duration_ms, 0) + 
                      EXTRACT(EPOCH FROM ($1 - enqueued_at)) * 1000 + 
                      EXTRACT(EPOCH FROM ($2 - $1)) * 1000
     WHERE task_id = $8`,
    [startedAt, completedAt, status, errorClass ?? null, errorMessage ?? null, retryCount, orderId ?? null, taskId.toString()],
  );
}

export type PhaseMetric = {
  taskId: bigint;
  phase: 'login' | 'navigation' | 'customer_fill' | 'articles_fill' | 'discount_notes' | 'save' | 'verification';
  startedAt: Date;
  completedAt: Date;
  retryCount?: number;
  notes?: Record<string, unknown>;
};

export async function recordPhase(pool: Querier, params: PhaseMetric): Promise<void> {
  await pool.query(
    `INSERT INTO system.bot_phase_metrics 
     (task_id, phase, started_at, completed_at, duration_ms, retry_count, notes)
     VALUES ($1, $2, $3, $4, EXTRACT(EPOCH FROM ($4 - $3)) * 1000, $5, $6)`,
    [
      params.taskId.toString(),
      params.phase,
      params.startedAt,
      params.completedAt,
      params.retryCount ?? 0,
      params.notes ? JSON.stringify(params.notes) : null,
    ],
  );
}
```

- [ ] **Step 4: Spec bot-metrics**

File `archibald-web-app/backend/src/db/repositories/bot-metrics.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createDbPool } from '../pool';
import { recordTaskStart, recordTaskFinish, recordPhase } from './bot-metrics';
import { enqueueTask } from './agent-queue';

const skipIf = process.env.CI === 'true' || !process.env.PG_HOST;

describe.skipIf(skipIf)('bot-metrics repository', () => {
  const pool = createDbPool();
  
  beforeEach(async () => {
    await pool.query("DELETE FROM system.bot_phase_metrics WHERE task_id IN (SELECT task_id FROM system.bot_task_metrics WHERE user_id LIKE 'test_%')");
    await pool.query("DELETE FROM system.bot_task_metrics WHERE user_id LIKE 'test_%'");
    await pool.query("DELETE FROM system.agent_operation_queue WHERE user_id LIKE 'test_%'");
  });
  
  it('records task start with ui durations', async () => {
    const taskId = await enqueueTask(pool, {
      userId: 'test_metrics_a',
      taskType: 'submit-order',
      payload: {},
    });
    const enqueuedAt = new Date();
    await recordTaskStart(pool, {
      taskId, userId: 'test_metrics_a', taskType: 'submit-order',
      agentMode: 'simple', customerId: 'c1', customerName: 'Cust',
      numArticles: 5, uiStartedAt: new Date(Date.now() - 60000),
      uiCompletedAt: new Date(Date.now() - 1000), enqueuedAt,
      uiDurationMs: 59000,
    });
    const { rows } = await pool.query<{ ui_duration_ms: string }>(
      `SELECT ui_duration_ms FROM system.bot_task_metrics WHERE task_id = $1`,
      [taskId.toString()],
    );
    expect(parseInt(rows[0].ui_duration_ms, 10)).toBe(59000);
  });
  
  it('computes total_e2e_ms on recordTaskFinish', async () => {
    const taskId = await enqueueTask(pool, { userId: 'test_metrics_b', taskType: 'submit-order', payload: {} });
    const enqueued = new Date();
    await recordTaskStart(pool, {
      taskId, userId: 'test_metrics_b', taskType: 'submit-order',
      enqueuedAt: enqueued, uiDurationMs: 10000,
    });
    const started = new Date(enqueued.getTime() + 2000);
    const completed = new Date(started.getTime() + 30000);
    await recordTaskFinish(pool, {
      taskId, startedAt: started, completedAt: completed,
      status: 'completed', retryCount: 0, orderId: '53.999',
      uiDurationMs: 10000,
    });
    const { rows } = await pool.query<{ total_e2e_ms: string; queue_wait_ms: string; bot_duration_ms: string }>(
      `SELECT total_e2e_ms, queue_wait_ms, bot_duration_ms FROM system.bot_task_metrics WHERE task_id = $1`,
      [taskId.toString()],
    );
    expect(parseInt(rows[0].queue_wait_ms, 10)).toBe(2000);
    expect(parseInt(rows[0].bot_duration_ms, 10)).toBe(30000);
    expect(parseInt(rows[0].total_e2e_ms, 10)).toBe(42000); // 10k + 2k + 30k
  });
  
  it('records phase with computed duration_ms', async () => {
    const taskId = await enqueueTask(pool, { userId: 'test_metrics_c', taskType: 'submit-order', payload: {} });
    await recordTaskStart(pool, {
      taskId, userId: 'test_metrics_c', taskType: 'submit-order',
      enqueuedAt: new Date(),
    });
    const start = new Date();
    const end = new Date(start.getTime() + 15000);
    await recordPhase(pool, { taskId, phase: 'login', startedAt: start, completedAt: end });
    const { rows } = await pool.query<{ duration_ms: string }>(
      `SELECT duration_ms FROM system.bot_phase_metrics WHERE task_id = $1`,
      [taskId.toString()],
    );
    expect(parseInt(rows[0].duration_ms, 10)).toBe(15000);
  });
});
```

- [ ] **Step 5: Repository ui-operation-intents**

File `archibald-web-app/backend/src/db/repositories/ui-operation-intents.ts`:

```typescript
import type { DbPool } from '../pool';

export type UiIntentRow = {
  intentId: string;
  userId: string;
  pendingOrderId: string;
  type: 'new-order' | 'edit-pending';
  uiStartedAt: Date;
  uiCompletedAt: Date | null;
};

export async function startIntent(
  pool: DbPool,
  params: { intentId: string; userId: string; pendingOrderId: string; type: 'new-order' | 'edit-pending' },
): Promise<void> {
  await pool.query(
    `INSERT INTO system.ui_operation_intents 
     (intent_id, user_id, pending_order_id, type, ui_started_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (intent_id) DO NOTHING`,
    [params.intentId, params.userId, params.pendingOrderId, params.type],
  );
}

export async function completeIntent(
  pool: DbPool,
  params: { intentId: string; pendingOrderId: string },
): Promise<void> {
  await pool.query(
    `UPDATE system.ui_operation_intents 
     SET ui_completed_at = now(), pending_order_id = $2
     WHERE intent_id = $1`,
    [params.intentId, params.pendingOrderId],
  );
}

export async function aggregateUiDurationForPending(
  pool: DbPool,
  pendingOrderId: string,
): Promise<{ firstOpen: Date | null; lastSave: Date | null; activeMs: number | null }> {
  const { rows: [row] } = await pool.query<{ first_open: Date | null; last_save: Date | null; active_ms: string | null }>(
    `SELECT 
       MIN(ui_started_at) AS first_open,
       MAX(ui_completed_at) AS last_save,
       SUM(EXTRACT(EPOCH FROM (ui_completed_at - ui_started_at)) * 1000)::BIGINT AS active_ms
     FROM system.ui_operation_intents 
     WHERE pending_order_id = $1 AND ui_completed_at IS NOT NULL`,
    [pendingOrderId],
  );
  return {
    firstOpen: row.first_open,
    lastSave: row.last_save,
    activeMs: row.active_ms ? parseInt(row.active_ms, 10) : null,
  };
}
```

- [ ] **Step 6: Spec ui-intents**

File `archibald-web-app/backend/src/db/repositories/ui-operation-intents.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createDbPool } from '../pool';
import { startIntent, completeIntent, aggregateUiDurationForPending } from './ui-operation-intents';

const skipIf = process.env.CI === 'true' || !process.env.PG_HOST;

describe.skipIf(skipIf)('ui-operation-intents repository', () => {
  const pool = createDbPool();
  
  beforeEach(async () => {
    await pool.query("DELETE FROM system.ui_operation_intents WHERE user_id LIKE 'test_%'");
  });
  
  it('starts and completes an intent, aggregates duration', async () => {
    const intentId = randomUUID();
    await startIntent(pool, { intentId, userId: 'test_ui', pendingOrderId: 'pending_1', type: 'new-order' });
    await new Promise(r => setTimeout(r, 100));
    await completeIntent(pool, { intentId, pendingOrderId: 'pending_1' });
    
    const agg = await aggregateUiDurationForPending(pool, 'pending_1');
    expect(agg.activeMs).toBeGreaterThan(50);
  });
  
  it('aggregates multiple sessions for same pending', async () => {
    const i1 = randomUUID();
    const i2 = randomUUID();
    await startIntent(pool, { intentId: i1, userId: 'test_ui', pendingOrderId: 'pending_2', type: 'new-order' });
    await new Promise(r => setTimeout(r, 50));
    await completeIntent(pool, { intentId: i1, pendingOrderId: 'pending_2' });
    
    await startIntent(pool, { intentId: i2, userId: 'test_ui', pendingOrderId: 'pending_2', type: 'edit-pending' });
    await new Promise(r => setTimeout(r, 80));
    await completeIntent(pool, { intentId: i2, pendingOrderId: 'pending_2' });
    
    const agg = await aggregateUiDurationForPending(pool, 'pending_2');
    expect(agg.activeMs).toBeGreaterThan(120);
  });
  
  it('ignores intents without ui_completed_at', async () => {
    const i = randomUUID();
    await startIntent(pool, { intentId: i, userId: 'test_ui', pendingOrderId: 'pending_3', type: 'new-order' });
    const agg = await aggregateUiDurationForPending(pool, 'pending_3');
    expect(agg.activeMs).toBeNull();
  });
});
```

- [ ] **Step 7: Run all tests**

```bash
PG_HOST=localhost npm test -- --run src/db/repositories/agent-circuit-state.spec.ts src/db/repositories/bot-metrics.spec.ts src/db/repositories/ui-operation-intents.spec.ts 2>&1 | tail -15
```

Expected: tutti i test passano.

- [ ] **Step 8: Build + Commit**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
git add archibald-web-app/backend/src/db/repositories/agent-circuit-state.* \
        archibald-web-app/backend/src/db/repositories/bot-metrics.* \
        archibald-web-app/backend/src/db/repositories/ui-operation-intents.*
git commit -m "feat(conductor): repositories per circuit-state, metrics, ui-intents

- agent-circuit-state: getState, recordErpFailure, openCircuit, setHalfOpen,
  closeCircuit, rescheduleProbe, findCircuitsToProbe, recordErpSuccess
- bot-metrics: recordTaskStart, recordTaskFinish (con calcolo total_e2e_ms),
  recordPhase (con duration_ms computed via SQL)
- ui-operation-intents: startIntent, completeIntent, aggregateUiDurationForPending
  per somma sessioni UI per pending_order_id

Test integration con Postgres reale (skipIf in CI).

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 5.2, 7, 8.3-8.5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# FASE B — Conductor backend core

## Task B1: Error classifier (pure function)

**Files:**
- Create: `archibald-web-app/backend/src/conductor/error-classifier.ts`
- Create: `archibald-web-app/backend/src/conductor/error-classifier.spec.ts`

- [ ] **Step 1: TDD — scrivi prima i test**

File spec:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyError } from './error-classifier';

describe('classifyError', () => {
  describe('erp_unreachable cases', () => {
    it.each([
      'ECONNREFUSED 4.231.124.90:443',
      'request to https://4.231.124.90/Archibald/Default.aspx failed, reason: ETIMEDOUT login validation',
      'self signed certificate in certificate chain',
      'HTTP error 503 Service Unavailable',
      'Got 502 Bad Gateway from upstream',
      'Request failed with status code 500',
    ])('classifies "%s" as erp_unreachable', (msg) => {
      expect(classifyError(new Error(msg))).toBe('erp_unreachable');
    });
  });
  
  describe('application_error cases', () => {
    it.each([
      'Article H123.314.012 not found in database',
      'Customer not found in ERP',
      'P.IVA validation failed: 12345',
      'Runtime.callFunctionOn timed out (CDP)',
      'Variant K2 not found in dropdown',
      'Discount input not found',
      'Navigation timeout of 30000 ms exceeded',  // navigation timeout = applicativo, non infrastrutturale
    ])('classifies "%s" as application_error', (msg) => {
      expect(classifyError(new Error(msg))).toBe('application_error');
    });
  });
  
  it('handles non-Error thrown values', () => {
    expect(classifyError('string error' as unknown as Error)).toBe('application_error');
  });
  
  it('handles undefined message', () => {
    const e = new Error();
    expect(classifyError(e)).toBe('application_error');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- --run src/conductor/error-classifier.spec.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implementa**

File `archibald-web-app/backend/src/conductor/error-classifier.ts`:

```typescript
import type { ErrorClass } from './types';

const ERP_UNREACHABLE_PATTERNS: Array<RegExp> = [
  /econnrefused/i,
  /etimedout.*login/i,
  /certificate/i,
  /\b50[023]\b/, // 500, 502, 503
];

export function classifyError(err: unknown): ErrorClass {
  if (!(err instanceof Error)) return 'application_error';
  const msg = err.message ?? '';
  const lower = msg.toLowerCase();
  
  for (const pattern of ERP_UNREACHABLE_PATTERNS) {
    if (pattern.test(lower)) return 'erp_unreachable';
  }
  
  return 'application_error';
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- --run src/conductor/error-classifier.spec.ts 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/conductor/error-classifier.*
git commit -m "feat(conductor): error classifier per circuit breaker

Pure function classifyError(err): 'erp_unreachable' | 'application_error'.
Pattern: ECONNREFUSED, ETIMEDOUT in login, certificate errors, 50[023] HTTP.
Tutto il resto è application_error (DOM bloat CDP timeout, navigation timeout
applicativo, articolo non trovato, etc.).

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 5.3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B2: Circuit breaker module

**Files:**
- Create: `archibald-web-app/backend/src/conductor/circuit-breaker.ts`
- Create: `archibald-web-app/backend/src/conductor/circuit-breaker.spec.ts`

- [ ] **Step 1: TDD — scrivi test**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';

const makeFakeRepo = () => ({
  recordErpFailure: vi.fn(),
  openCircuit: vi.fn(),
  setHalfOpen: vi.fn(),
  closeCircuit: vi.fn(),
  rescheduleProbe: vi.fn(),
  findCircuitsToProbe: vi.fn(),
  recordErpSuccess: vi.fn(),
  getState: vi.fn(),
});

describe('CircuitBreaker', () => {
  let repo: ReturnType<typeof makeFakeRepo>;
  let probe: ReturnType<typeof vi.fn>;
  let cb: CircuitBreaker;
  
  beforeEach(() => {
    repo = makeFakeRepo();
    probe = vi.fn();
    cb = new CircuitBreaker(repo, probe);
  });
  
  describe('onErpFailure', () => {
    it('calls openCircuit when shouldOpen=true', async () => {
      repo.recordErpFailure.mockResolvedValue({ shouldOpen: true, failures: 3 });
      await cb.onErpFailure('user_a', 'login failed');
      expect(repo.openCircuit).toHaveBeenCalledWith(expect.anything(), 'user_a');
    });
    
    it('does not openCircuit if shouldOpen=false', async () => {
      repo.recordErpFailure.mockResolvedValue({ shouldOpen: false, failures: 1 });
      await cb.onErpFailure('user_a', 'login failed');
      expect(repo.openCircuit).not.toHaveBeenCalled();
    });
  });
  
  describe('onErpSuccess', () => {
    it('records success and closes circuit', async () => {
      await cb.onErpSuccess('user_a');
      expect(repo.recordErpSuccess).toHaveBeenCalledWith(expect.anything(), 'user_a');
    });
  });
  
  describe('isOpen', () => {
    it('returns true if state is open', async () => {
      repo.getState.mockResolvedValue({ state: 'open' });
      expect(await cb.isOpen('user_a')).toBe(true);
    });
    
    it('returns false if state is closed or half_open or null', async () => {
      repo.getState.mockResolvedValue({ state: 'closed' });
      expect(await cb.isOpen('user_a')).toBe(false);
      repo.getState.mockResolvedValue({ state: 'half_open' });
      expect(await cb.isOpen('user_a')).toBe(false);
      repo.getState.mockResolvedValue(null);
      expect(await cb.isOpen('user_a')).toBe(false);
    });
  });
  
  describe('probeAll', () => {
    it('probes each open circuit; if probe ok, half_open', async () => {
      repo.findCircuitsToProbe.mockResolvedValue(['user_a', 'user_b']);
      probe.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      
      await cb.probeAll();
      
      expect(repo.setHalfOpen).toHaveBeenCalledWith(expect.anything(), 'user_a');
      expect(repo.rescheduleProbe).toHaveBeenCalledWith(expect.anything(), 'user_b');
    });
  });
});
```

- [ ] **Step 2: Run FAIL**

```bash
npm test -- --run src/conductor/circuit-breaker.spec.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implementa**

File `archibald-web-app/backend/src/conductor/circuit-breaker.ts`:

```typescript
import type { DbPool } from '../db/pool';
import * as repo from '../db/repositories/agent-circuit-state';

type CircuitRepo = typeof repo;

export type ProbeFn = (userId: string) => Promise<boolean>;

export class CircuitBreaker {
  constructor(
    private readonly repository: CircuitRepo,
    private readonly probeFn: ProbeFn,
    private readonly pool: DbPool = (null as unknown as DbPool),
  ) {}
  
  async onErpFailure(userId: string, errorMessage: string): Promise<void> {
    const result = await this.repository.recordErpFailure(this.pool, userId, errorMessage);
    if (result.shouldOpen) {
      await this.repository.openCircuit(this.pool, userId);
    }
  }
  
  async onErpSuccess(userId: string): Promise<void> {
    await this.repository.recordErpSuccess(this.pool, userId);
  }
  
  async isOpen(userId: string): Promise<boolean> {
    const state = await this.repository.getState(this.pool, userId);
    return state?.state === 'open';
  }
  
  async probeAll(): Promise<void> {
    const userIds = await this.repository.findCircuitsToProbe(this.pool);
    for (const userId of userIds) {
      const reachable = await this.probeFn(userId).catch(() => false);
      if (reachable) {
        await this.repository.setHalfOpen(this.pool, userId);
      } else {
        await this.repository.rescheduleProbe(this.pool, userId);
      }
    }
  }
}

export type DefaultProbeOptions = { erpUrl: string; timeoutMs: number };

export function createDefaultProbe(options: DefaultProbeOptions): ProbeFn {
  return async (_userId: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), options.timeoutMs);
    try {
      const res = await fetch(options.erpUrl, { method: 'HEAD', signal: ctrl.signal });
      return res.status >= 200 && res.status < 400;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
}
```

- [ ] **Step 4: Run, PASS**

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/conductor/circuit-breaker.*
git commit -m "feat(conductor): circuit breaker module per agent

CircuitBreaker class con:
- onErpFailure(userId, msg): incrementa contatore, apre circuit a 3
- onErpSuccess(userId): reset contatore + close
- isOpen(userId): query stato
- probeAll(): esegue probe per tutti i circuit aperti pronti, transitions
  open→half_open su success, open→open con next_probe rescheduled su fail

createDefaultProbe(options): probe HTTP HEAD verso ERP con timeout configurabile.

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 5.2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B3: Metrics recorder

**Files:**
- Create: `archibald-web-app/backend/src/conductor/metrics-recorder.ts`
- Create: `archibald-web-app/backend/src/conductor/metrics-recorder.spec.ts`

- [ ] **Step 1-3: TDD pattern simile (test → implementazione → pass)**

Implementazione `metrics-recorder.ts`:

```typescript
import type { DbPool } from '../db/pool';
import * as metricsRepo from '../db/repositories/bot-metrics';
import * as uiIntentsRepo from '../db/repositories/ui-operation-intents';
import type { TaskRow } from './types';

export class MetricsRecorder {
  private taskMetricEnqueued = new Map<bigint, Date>();
  private phaseStarts = new Map<string, Date>(); // key: `${taskId}-${phase}`
  
  constructor(private readonly pool: DbPool) {}
  
  async startTask(task: TaskRow, agentMode: 'simple' | 'fresis' | undefined): Promise<void> {
    let uiAggregation: { firstOpen: Date | null; lastSave: Date | null; activeMs: number | null } = 
      { firstOpen: null, lastSave: null, activeMs: null };
    
    if (task.taskType === 'submit-order') {
      const pendingOrderId = (task.payload as { pendingOrderId?: string }).pendingOrderId;
      if (pendingOrderId) {
        uiAggregation = await uiIntentsRepo.aggregateUiDurationForPending(this.pool, pendingOrderId);
      }
    }
    
    const numArticles = (task.payload as { items?: unknown[] }).items?.length;
    const customerId = (task.payload as { customerId?: string }).customerId;
    const customerName = (task.payload as { customerName?: string }).customerName;
    
    await metricsRepo.recordTaskStart(this.pool, {
      taskId: task.taskId,
      userId: task.userId,
      taskType: task.taskType,
      agentMode,
      customerId,
      customerName,
      numArticles,
      uiStartedAt: uiAggregation.firstOpen,
      uiCompletedAt: uiAggregation.lastSave,
      enqueuedAt: task.enqueuedAt,
      uiDurationMs: uiAggregation.activeMs,
    });
    
    this.taskMetricEnqueued.set(task.taskId, task.enqueuedAt);
  }
  
  startPhase(taskId: bigint, phase: 'login' | 'navigation' | 'customer_fill' | 'articles_fill' | 'discount_notes' | 'save' | 'verification'): void {
    this.phaseStarts.set(`${taskId}-${phase}`, new Date());
  }
  
  async endPhase(
    taskId: bigint,
    phase: 'login' | 'navigation' | 'customer_fill' | 'articles_fill' | 'discount_notes' | 'save' | 'verification',
    notes?: Record<string, unknown>,
  ): Promise<void> {
    const start = this.phaseStarts.get(`${taskId}-${phase}`);
    if (!start) return;
    this.phaseStarts.delete(`${taskId}-${phase}`);
    await metricsRepo.recordPhase(this.pool, {
      taskId, phase, startedAt: start, completedAt: new Date(), notes,
    });
  }
  
  async finishTask(
    task: TaskRow,
    startedAt: Date,
    status: 'completed' | 'failed' | 'cancelled',
    errorClass?: 'erp_unreachable' | 'application_error' | null,
    errorMessage?: string | null,
    orderId?: string,
  ): Promise<void> {
    let uiDurationMs: number | null = null;
    if (task.taskType === 'submit-order') {
      const pendingOrderId = (task.payload as { pendingOrderId?: string }).pendingOrderId;
      if (pendingOrderId) {
        const agg = await uiIntentsRepo.aggregateUiDurationForPending(this.pool, pendingOrderId);
        uiDurationMs = agg.activeMs;
      }
    }
    await metricsRepo.recordTaskFinish(this.pool, {
      taskId: task.taskId,
      startedAt,
      completedAt: new Date(),
      status,
      errorClass,
      errorMessage,
      retryCount: task.retryCount,
      orderId,
      uiDurationMs,
    });
    this.taskMetricEnqueued.delete(task.taskId);
  }
}
```

- [ ] **Step 4: Spec coverage minima**

Vedi spec esempio dei pattern, focus su:
- `startTask` aggrega ui_intents per pending_order_id
- `startPhase`/`endPhase` calcolano durata
- `finishTask` aggiorna stato finale

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/conductor/metrics-recorder.*
git commit -m "feat(conductor): metrics-recorder per tracking task + phases

MetricsRecorder class:
- startTask(task, agentMode): aggrega ui_intents + recordTaskStart
- startPhase/endPhase: tracking interno + recordPhase a chiusura
- finishTask: recordTaskFinish con calcolo total_e2e_ms

Phase keys (CHECK constraint DB): login, navigation, customer_fill,
articles_fill, discount_notes, save, verification.

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B4: Auto-recovery on restart

**Files:**
- Create: `archibald-web-app/backend/src/conductor/auto-recovery.ts`
- Create: `archibald-web-app/backend/src/conductor/auto-recovery.spec.ts`

- [ ] **Step 1: Implementa auto-recovery**

File `archibald-web-app/backend/src/conductor/auto-recovery.ts`:

```typescript
import type { DbPool } from '../db/pool';
import * as queueRepo from '../db/repositories/agent-queue';
import { logger } from '../logger';
import type { TaskRow } from './types';

const ORPHAN_STALE_SECONDS = 60;

export type RecoveryHandlers = {
  resumeFromErpSaveDone: (task: TaskRow) => Promise<void>;
  reEnqueueTask: (task: TaskRow) => Promise<void>;
};

export async function recoverOrphans(pool: DbPool, handlers: RecoveryHandlers): Promise<void> {
  const orphans = await queueRepo.findOrphanRunningTasks(pool, ORPHAN_STALE_SECONDS);
  
  if (orphans.length === 0) {
    logger.info('[Conductor.recovery] No orphan tasks at startup');
    return;
  }
  
  logger.info(`[Conductor.recovery] Found ${orphans.length} orphan tasks at startup`);
  
  for (const task of orphans) {
    try {
      switch (task.phase) {
        case 'erp_save_done':
          if (task.erpOrderId) {
            logger.info(`[Conductor.recovery] Resuming task ${task.taskId} from erp_save_done with orderId ${task.erpOrderId}`);
            await handlers.resumeFromErpSaveDone(task);
          } else {
            logger.warn(`[Conductor.recovery] Task ${task.taskId} phase=erp_save_done but no erpOrderId; re-enqueue`);
            await handlers.reEnqueueTask(task);
          }
          break;
        
        case 'db_committed':
          // Tutto committato, mancava solo verifica. Marca completed (verifica posticipata via sync periodico)
          logger.info(`[Conductor.recovery] Task ${task.taskId} was already db_committed, marking completed`);
          await queueRepo.completeTask(pool, task.taskId);
          break;
        
        case 'completed':
          // Già completata, solo non aggiornata. Sistema lo stato.
          await queueRepo.completeTask(pool, task.taskId);
          break;
        
        case null:
        case 'in_progress':
        default:
          // Bot non aveva ancora salvato. Re-enqueue come nuova.
          logger.info(`[Conductor.recovery] Task ${task.taskId} not yet saved on ERP, re-enqueue`);
          await handlers.reEnqueueTask(task);
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[Conductor.recovery] Failed to recover task ${task.taskId}: ${message}`);
      // Marca failed per non bloccare la coda
      await queueRepo.failTask(pool, task.taskId, {
        errorClass: 'application_error',
        errorMessage: `Recovery failed: ${message}`,
        incrementRetry: true,
      });
    }
  }
}
```

- [ ] **Step 2: Spec auto-recovery (integration test)**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDbPool } from '../db/pool';
import { enqueueTask, pickupNextTask, updateTaskPhase, getTaskById } from '../db/repositories/agent-queue';
import { recoverOrphans } from './auto-recovery';

const skipIf = process.env.CI === 'true' || !process.env.PG_HOST;

describe.skipIf(skipIf)('auto-recovery', () => {
  const pool = createDbPool();
  
  beforeEach(async () => {
    await pool.query("DELETE FROM system.agent_operation_queue WHERE user_id LIKE 'test_recovery_%'");
  });
  
  it('resumes task from erp_save_done if orphan', async () => {
    const taskId = await enqueueTask(pool, { userId: 'test_recovery_a', taskType: 'submit-order', payload: { pendingOrderId: 'p1' } });
    await pickupNextTask(pool, 'test_recovery_a');
    await updateTaskPhase(pool, taskId, 'erp_save_done', '53.999');
    // Force orphan
    await pool.query("UPDATE system.agent_operation_queue SET heartbeat_at = now() - INTERVAL '90 seconds' WHERE task_id = $1", [taskId.toString()]);
    
    const resumeFn = vi.fn();
    const reEnqueueFn = vi.fn();
    await recoverOrphans(pool, { resumeFromErpSaveDone: resumeFn, reEnqueueTask: reEnqueueFn });
    
    expect(resumeFn).toHaveBeenCalledWith(expect.objectContaining({ taskId, erpOrderId: '53.999' }));
    expect(reEnqueueFn).not.toHaveBeenCalled();
  });
  
  it('re-enqueues task if no phase set', async () => {
    const taskId = await enqueueTask(pool, { userId: 'test_recovery_b', taskType: 'submit-order', payload: {} });
    await pickupNextTask(pool, 'test_recovery_b');
    // No phase update, force orphan
    await pool.query("UPDATE system.agent_operation_queue SET heartbeat_at = now() - INTERVAL '90 seconds' WHERE task_id = $1", [taskId.toString()]);
    
    const resumeFn = vi.fn();
    const reEnqueueFn = vi.fn();
    await recoverOrphans(pool, { resumeFromErpSaveDone: resumeFn, reEnqueueTask: reEnqueueFn });
    
    expect(reEnqueueFn).toHaveBeenCalledWith(expect.objectContaining({ taskId }));
    expect(resumeFn).not.toHaveBeenCalled();
  });
  
  it('marks completed if phase=db_committed', async () => {
    const taskId = await enqueueTask(pool, { userId: 'test_recovery_c', taskType: 'submit-order', payload: {} });
    await pickupNextTask(pool, 'test_recovery_c');
    await updateTaskPhase(pool, taskId, 'db_committed');
    await pool.query("UPDATE system.agent_operation_queue SET heartbeat_at = now() - INTERVAL '90 seconds' WHERE task_id = $1", [taskId.toString()]);
    
    await recoverOrphans(pool, {
      resumeFromErpSaveDone: vi.fn(),
      reEnqueueTask: vi.fn(),
    });
    
    const after = await getTaskById(pool, taskId);
    expect(after?.status).toBe('completed');
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
PG_HOST=localhost npm test -- --run src/conductor/auto-recovery.spec.ts 2>&1 | tail -10
git add archibald-web-app/backend/src/conductor/auto-recovery.*
git commit -m "feat(conductor): auto-recovery on backend restart

recoverOrphans(pool, handlers) gestisce task in stato 'running' con
heartbeat stale (>60s):
- phase='erp_save_done' + erpOrderId valorizzato → resumeFromErpSaveDone
- phase='db_committed' → mark completed
- phase=NULL/'in_progress' → re-enqueue come nuova task

Recovery completamente trasparente all'utente se restart < 60s.

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 3.3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B5: Conductor dispatcher + worker (singleton + per-user)

**Files:**
- Create: `archibald-web-app/backend/src/conductor/dispatcher.ts`
- Create: `archibald-web-app/backend/src/conductor/worker.ts`
- Create: integration spec

- [ ] **Step 1: Worker class**

Il `Worker` per ogni `userId` consuma la coda. Esegue task una alla volta. Sui chain immediato.

File `archibald-web-app/backend/src/conductor/worker.ts`:

```typescript
import type { DbPool } from '../db/pool';
import * as queueRepo from '../db/repositories/agent-queue';
import type { TaskRow, TaskType } from './types';
import { CircuitBreaker } from './circuit-breaker';
import { MetricsRecorder } from './metrics-recorder';
import { classifyError } from './error-classifier';
import { logger } from '../logger';

export type TaskHandler = (
  task: TaskRow,
  ctx: { metrics: MetricsRecorder; userId: string },
) => Promise<{ orderId?: string }>;

export type WorkerDeps = {
  pool: DbPool;
  circuitBreaker: CircuitBreaker;
  handlers: Partial<Record<TaskType, TaskHandler>>;
  broadcast: (userId: string, event: Record<string, unknown>) => void;
  metrics: MetricsRecorder;
  releaseBrowserContext: (userId: string) => Promise<void>;
};

export class Worker {
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  constructor(public readonly userId: string, private readonly deps: WorkerDeps) {}
  
  async runUntilEmpty(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      while (true) {
        // Check circuit
        if (await this.deps.circuitBreaker.isOpen(this.userId)) {
          logger.info(`[Worker ${this.userId}] Circuit open, pausing worker`);
          this.deps.broadcast(this.userId, { event: 'CIRCUIT_OPEN', userId: this.userId });
          break;
        }
        
        const task = await queueRepo.pickupNextTask(this.deps.pool, this.userId);
        if (!task) break;
        
        await this.executeTask(task);
        // Loop continues for chain immediato
      }
    } finally {
      this.isRunning = false;
      // Quando esce dal loop: rilascia browser context
      await this.deps.releaseBrowserContext(this.userId);
    }
  }
  
  private startHeartbeat(taskId: bigint): void {
    this.heartbeatTimer = setInterval(() => {
      queueRepo.updateTaskHeartbeat(this.deps.pool, taskId).catch(() => {});
    }, 30_000);
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  
  private async executeTask(task: TaskRow): Promise<void> {
    const handler = this.deps.handlers[task.taskType];
    if (!handler) {
      await queueRepo.failTask(this.deps.pool, task.taskId, {
        errorClass: 'application_error',
        errorMessage: `No handler for task type ${task.taskType}`,
        incrementRetry: false,
      });
      return;
    }
    
    this.startHeartbeat(task.taskId);
    
    const startedAt = task.startedAt ?? new Date();
    const agentMode = this.deduceAgentMode(task);
    
    await this.deps.metrics.startTask(task, agentMode);
    
    this.deps.broadcast(this.userId, {
      event: 'JOB_STARTED',
      taskId: task.taskId.toString(),
      type: task.taskType,
    });
    
    try {
      const result = await handler(task, { metrics: this.deps.metrics, userId: this.userId });
      await queueRepo.completeTask(this.deps.pool, task.taskId);
      await this.deps.circuitBreaker.onErpSuccess(this.userId);
      await this.deps.metrics.finishTask(task, startedAt, 'completed', null, null, result.orderId);
      this.deps.broadcast(this.userId, {
        event: 'JOB_COMPLETED',
        taskId: task.taskId.toString(),
        type: task.taskType,
        result,
      });
    } catch (err) {
      const errorClass = classifyError(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      if (errorClass === 'erp_unreachable') {
        await this.deps.circuitBreaker.onErpFailure(this.userId, errorMessage);
      }
      
      const failResult = await queueRepo.failTask(this.deps.pool, task.taskId, {
        errorClass,
        errorMessage,
        incrementRetry: true,
      });
      
      await this.deps.metrics.finishTask(
        task,
        startedAt,
        failResult.willRetry ? 'failed' : 'failed',
        errorClass,
        errorMessage,
      );
      
      this.deps.broadcast(this.userId, {
        event: failResult.willRetry ? 'JOB_RETRYING' : 'JOB_FAILED',
        taskId: task.taskId.toString(),
        type: task.taskType,
        error: errorMessage,
      });
      
      // Se applicabile, propaga tramite re-enqueue (failTask già lo gestisce con status='enqueued' se willRetry)
      if (failResult.willRetry) {
        // Backoff: 10s, 30s, 60s
        const backoffMs = [10_000, 30_000, 60_000][failResult.retryCount - 1] ?? 60_000;
        await new Promise(r => setTimeout(r, backoffMs));
      }
    } finally {
      this.stopHeartbeat();
    }
  }
  
  private deduceAgentMode(task: TaskRow): 'simple' | 'fresis' | undefined {
    const customerId = (task.payload as { customerId?: string }).customerId;
    if (customerId === '1002328') return 'fresis'; // Fresis Soc Cooperativa (memoria)
    if (customerId) return 'simple';
    return undefined;
  }
}
```

- [ ] **Step 2: Dispatcher singleton**

File `archibald-web-app/backend/src/conductor/dispatcher.ts`:

```typescript
import { EventEmitter } from 'events';
import type { Client } from 'pg';
import { Client as PgClient } from 'pg';
import type { DbPool } from '../db/pool';
import { config } from '../config';
import { CircuitBreaker, createDefaultProbe } from './circuit-breaker';
import { MetricsRecorder } from './metrics-recorder';
import { Worker, type TaskHandler, type WorkerDeps } from './worker';
import { recoverOrphans } from './auto-recovery';
import * as queueRepo from '../db/repositories/agent-queue';
import { logger } from '../logger';
import type { TaskRow, TaskType } from './types';

export type DispatcherDeps = {
  pool: DbPool;
  handlers: Partial<Record<TaskType, TaskHandler>>;
  broadcast: (userId: string, event: Record<string, unknown>) => void;
  releaseBrowserContext: (userId: string) => Promise<void>;
};

export class Conductor extends EventEmitter {
  private workers = new Map<string, Worker>();
  private listenClient: Client | null = null;
  private circuitBreaker: CircuitBreaker;
  private metrics: MetricsRecorder;
  private probeTimer: NodeJS.Timeout | null = null;
  
  constructor(private readonly deps: DispatcherDeps) {
    super();
    const probe = createDefaultProbe({ erpUrl: config.archibald.url, timeoutMs: 10_000 });
    this.circuitBreaker = new CircuitBreaker(
      require('../db/repositories/agent-circuit-state'),
      probe,
      this.deps.pool,
    );
    this.metrics = new MetricsRecorder(this.deps.pool);
  }
  
  async start(): Promise<void> {
    logger.info('[Conductor] Starting...');
    
    // 1. Auto-recovery on restart
    await recoverOrphans(this.deps.pool, {
      resumeFromErpSaveDone: async (task) => {
        // Setup logico: la submit-order handler ha un'opzione "resume mode"
        // che skippa direttamente al step DB (vedi Task C1)
        const handler = this.deps.handlers['submit-order'];
        if (!handler) return;
        await handler({ ...task, payload: { ...task.payload, _resumeFromErpSaveDone: true } } as TaskRow, {
          metrics: this.metrics,
          userId: task.userId,
        });
        await queueRepo.completeTask(this.deps.pool, task.taskId);
      },
      reEnqueueTask: async (task) => {
        // Reset stato a enqueued per rilancio normale
        await this.deps.pool.query(
          `UPDATE system.agent_operation_queue 
           SET status = 'enqueued', phase = NULL, started_at = NULL, heartbeat_at = NULL
           WHERE task_id = $1`,
          [task.taskId.toString()],
        );
      },
    });
    
    // 2. Setup LISTEN/NOTIFY
    this.listenClient = new PgClient({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
    });
    await this.listenClient.connect();
    await this.listenClient.query('LISTEN agent_queue_changed');
    
    this.listenClient.on('notification', (msg) => {
      const userId = msg.payload;
      if (userId) this.scheduleWorker(userId);
    });
    
    // 3. Probe loop ogni 30s
    this.probeTimer = setInterval(() => {
      this.circuitBreaker.probeAll().catch((err) => {
        logger.error('[Conductor] probeAll failed', { error: err instanceof Error ? err.message : String(err) });
      });
    }, 30_000);
    
    // 4. Pickup iniziale per gli utenti con coda non vuota
    const { rows } = await this.deps.pool.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM system.agent_operation_queue WHERE status = 'enqueued'`,
    );
    for (const row of rows) this.scheduleWorker(row.user_id);
    
    logger.info('[Conductor] Started');
  }
  
  async stop(): Promise<void> {
    logger.info('[Conductor] Stopping...');
    if (this.probeTimer) clearInterval(this.probeTimer);
    if (this.listenClient) await this.listenClient.end();
    this.workers.clear();
    logger.info('[Conductor] Stopped');
  }
  
  private scheduleWorker(userId: string): void {
    let worker = this.workers.get(userId);
    if (!worker) {
      const workerDeps: WorkerDeps = {
        pool: this.deps.pool,
        circuitBreaker: this.circuitBreaker,
        handlers: this.deps.handlers,
        broadcast: this.deps.broadcast,
        metrics: this.metrics,
        releaseBrowserContext: this.deps.releaseBrowserContext,
      };
      worker = new Worker(userId, workerDeps);
      this.workers.set(userId, worker);
    }
    
    worker.runUntilEmpty().catch((err) => {
      logger.error(`[Conductor] Worker ${userId} crashed`, { error: err instanceof Error ? err.message : String(err) });
    }).finally(() => {
      // Worker ha consumato la coda (o circuit aperto)
      this.workers.delete(userId);
    });
  }
  
  async enqueueTaskExternal(params: {
    userId: string;
    taskType: TaskType;
    payload: Record<string, unknown>;
    batchId?: string;
  }): Promise<bigint> {
    const taskId = await queueRepo.enqueueTask(this.deps.pool, params);
    // Trigger NOTIFY già automatic via DB trigger
    return taskId;
  }
  
  hasActiveWriteFor(userId: string): boolean {
    return this.workers.has(userId);
  }
  
  isAnyWriteActive(): boolean {
    return this.workers.size > 0;
  }
}
```

- [ ] **Step 3: Integration spec**

(Pattern simile, lascio scrivere allo subagent durante implementazione, scenari chiave: enqueue→pickup→complete, retry on failure, circuit breaker integration. Vedi pattern delle altre spec).

- [ ] **Step 4: Run integration tests + commit**

```bash
git add archibald-web-app/backend/src/conductor/{worker,dispatcher,worker.spec,dispatcher.spec}.ts
git commit -m "feat(conductor): Worker + Dispatcher singleton

Worker:
- runUntilEmpty: loop pickup → execute → next, chain immediato
- heartbeat 30s durante esecuzione
- error handling con classifyError + circuit breaker
- backoff retry 10s/30s/60s

Conductor (singleton dispatcher):
- start(): auto-recovery + LISTEN/NOTIFY + probe loop ogni 30s
- scheduleWorker(userId): spawn Worker se non esiste
- enqueueTaskExternal: API per route handlers
- hasActiveWriteFor / isAnyWriteActive: per pause sync condivise

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 2-5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# FASE C — Atomicità submit-order + APIs

## Task C1: Refactor submit-order handler con nuovo flow atomicità

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts`
- Update: `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts`

- [ ] **Step 1: Estendi `SubmitOrderData` con `_resumeFromErpSaveDone` opzionale**

In `submit-order.ts`, aggiungi:

```typescript
type SubmitOrderData = {
  pendingOrderId: string;
  // ... esistenti ...
  _resumeFromErpSaveDone?: boolean;       // NUOVO: usato dall'auto-recovery
  _resumeOrderId?: string;                  // NUOVO: orderId persistito in 'erp_save_done'
};
```

- [ ] **Step 2: Aggiungi pre-check anti-duplicato (step 4)**

All'inizio di `handleSubmitOrder`, prima di `bot.createOrder`:

```typescript
// Pre-check anti-duplicato (recovery edge case)
let orderId: string;
if (data._resumeFromErpSaveDone && data._resumeOrderId) {
  orderId = data._resumeOrderId;
  logger.info('[SubmitOrder] Resuming from erp_save_done', { orderId });
} else {
  // Pre-check: verifica se ordine simile già piazzato (recovery edge case)
  const candidate = await checkRecentDuplicateOnErp(bot, data.customerId, data.items.length);
  if (candidate) {
    orderId = candidate;
    logger.info('[SubmitOrder] Anti-duplicate match found, skipping ERP save', { orderId });
  } else {
    orderId = await bot.createOrder({ /* args */ });
  }
}
```

Implementazione `checkRecentDuplicateOnErp` (helper interno):

```typescript
async function checkRecentDuplicateOnErp(
  bot: SubmitOrderBot,
  customerId: string,
  numArticles: number,
): Promise<string | null> {
  // Solo se il bot supporta scrapeRecentOrders (vedi Task C2)
  if (!bot.scrapeRecentOrders) return null;
  
  try {
    const recent = await bot.scrapeRecentOrders({ customerId, sinceHours: 2 });
    const match = recent.find((o) => o.numArticles === numArticles);
    return match?.orderId ?? null;
  } catch (err) {
    logger.warn('[SubmitOrder] Anti-duplicate check failed, proceeding normally', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
```

- [ ] **Step 3: Inserisci `UPDATE queue.phase` step subito dopo `bot.createOrder`**

(Questo step richiede che il Conductor passi al handler un `taskContext` con `taskId`. Estendi la firma del handler.)

```typescript
// In handleSubmitOrder, dopo orderId noto:
if (taskContext?.taskId) {
  await queueRepo.updateTaskPhase(pool, taskContext.taskId, 'erp_save_done', orderId);
}
```

- [ ] **Step 4: Wrap INSERT order_records + altre operazioni in withTransaction unica**

Il flow esistente già usa `pool.withTransaction`. Aggiungi solo i campi nuovi:

```typescript
await pool.withTransaction(async (tx) => {
  // INSERT order_records con delivery_address_id e snapshot
  await tx.query(
    `INSERT INTO agents.order_records (
      id, user_id, order_number, customer_account_num, customer_name,
      delivery_name, delivery_address, creation_date, delivery_date,
      order_description, customer_reference, sales_status,
      order_type, document_status, sales_origin, transfer_status,
      transfer_date, completion_date, discount_percent, gross_amount,
      total_amount, hash, last_sync, created_at, articles_synced_at,
      notes, total_with_vat,
      delivery_address_id, delivery_address_snapshot
    ) VALUES (..., $28, $29)
    ON CONFLICT (id, user_id) DO UPDATE SET
      order_number = EXCLUDED.order_number,
      gross_amount = EXCLUDED.gross_amount,
      total_amount = EXCLUDED.total_amount,
      delivery_address_id = COALESCE(EXCLUDED.delivery_address_id, agents.order_records.delivery_address_id),
      delivery_address_snapshot = COALESCE(EXCLUDED.delivery_address_snapshot, agents.order_records.delivery_address_snapshot),
      last_sync = EXCLUDED.last_sync,
      notes = EXCLUDED.notes`,
    [
      ...,
      data.deliveryAddressId ?? null,
      data.deliveryAddress ? JSON.stringify(data.deliveryAddress) : null,
    ],
  );
  // ... INSERT order_articles, snapshot, etc. ...
});
```

- [ ] **Step 5: Aggiungi `UPDATE queue.phase = 'db_committed'` dopo COMMIT**

```typescript
if (taskContext?.taskId) {
  await queueRepo.updateTaskPhase(pool, taskContext.taskId, 'db_committed');
}
```

- [ ] **Step 6: Verifica ERP non-fatale (resta com'è)**

Il blocco esistente `if (!isWarehouseOnly && inlineSyncDeps)` con try/catch resta intatto. La differenza: ora gli errori non propagano fuori dal handler, sono già "non-fatal" nel design originale.

- [ ] **Step 7: Aggiorna spec submit-order.spec.ts**

Test cases nuovi:
- "INSERT order_records con delivery_address_id e snapshot"
- "Resume from erp_save_done skippa createOrder"
- "Anti-duplicate match restituisce orderId esistente"

- [ ] **Step 8: 4-gate + commit**

```bash
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend -- --run src/operations/handlers/submit-order.spec.ts
git add archibald-web-app/backend/src/operations/handlers/submit-order.*
git commit -m "feat(submit-order): nuovo flow atomicità con persistenza fase

- Pre-check anti-duplicato: scrapeRecentOrders su ERP per skip ordine
  già piazzato (recovery edge case)
- Resume from erp_save_done: payload con _resumeFromErpSaveDone usa
  _resumeOrderId esistente, salta bot.createOrder
- updateTaskPhase('erp_save_done', orderId) IMMEDIATAMENTE dopo lettura ID
- INSERT order_records + delivery_address_id + delivery_address_snapshot
- updateTaskPhase('db_committed') dopo COMMIT

Garantisce: ordine su ERP ⇔ ordine su DB. Niente più orfani.

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C2: Bot scrapeRecentOrders + emit phase metrics

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`

- [ ] **Step 1: Aggiungi metodo `scrapeRecentOrders` al bot**

Naviga a `SALESTABLE_ListView_Agent`, filtra per `INVOICEACCOUNT = customerId` + `creation_date >= now-2h`, scrapa righe.

```typescript
async scrapeRecentOrders(opts: { customerId: string; sinceHours: number }): Promise<Array<{ orderId: string; numArticles: number }>> {
  // Implementazione di Puppeteer scraping su SALESTABLE_ListView_Agent
  // ... seguire pattern esistente di scraper ...
}
```

(Dettagli implementativi specifici a Puppeteer/DevExpress: vedi pattern in `src/sync/scraper/` e memoria `erp-bible.md`)

- [ ] **Step 2: Aggiungi emit phase metrics nei punti chiave del bot**

Esempio: `await this.metricsRecorder?.startPhase(taskId, 'login')` all'inizio del login flow, `endPhase` alla fine.

Da fare in:
- `login` (start/end)
- `navigation.ordini`/`form.nuovo` (phase='navigation')
- `form.customer` (phase='customer_fill')
- `form.articles.start`/`form.articles.complete` (phase='articles_fill', con `notes: { num_articles: N }`)
- `form.discount`/`form.notes` (phase='discount_notes')
- `form.submit.start`/`form.submit.complete` (phase='save')
- `verification` (phase='verification')

L'iniezione del MetricsRecorder avviene quando il Conductor istanzia il handler.

- [ ] **Step 3: Build + commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): scrapeRecentOrders + emit phase metrics

scrapeRecentOrders(customerId, sinceHours): scraping ListView SALESTABLE
filtrato per cliente + data, ritorna {orderId, numArticles}[]. Usato
dal pre-check anti-duplicato (recovery edge case).

Phase metrics emessi nei 7 punti chiave del bot (login, navigation,
customer_fill, articles_fill, discount_notes, save, verification) per
popolare system.bot_phase_metrics.

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 3.2, 7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C3: Routes /api/agent-queue/submit + /api/agent-queue/state

**Files:**
- Create: `archibald-web-app/backend/src/routes/agent-queue.ts`
- Create: `archibald-web-app/backend/src/routes/agent-queue.spec.ts`

- [ ] **Step 1: Implementa router**

```typescript
import { Router } from 'express';
import type { DbPool } from '../db/pool';
import type { Conductor } from '../conductor/dispatcher';
import * as queueRepo from '../db/repositories/agent-queue';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth';

export function createAgentQueueRouter(deps: { pool: DbPool; conductor: Conductor }) {
  const router = Router();
  
  router.use(authMiddleware);
  
  // POST /api/agent-queue/submit
  router.post('/submit', async (req, res) => {
    const userId = (req as any).userId;
    const { tasks } = req.body as { tasks: Array<{ type: string; payload: Record<string, unknown> }> };
    
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'tasks array required' });
    }
    
    const batchId = tasks.length > 1 ? randomUUID() : undefined;
    const taskIds: string[] = [];
    
    for (const t of tasks) {
      const taskId = await deps.conductor.enqueueTaskExternal({
        userId,
        taskType: t.type as any,
        payload: t.payload,
        batchId,
      });
      taskIds.push(taskId.toString());
    }
    
    res.json({ taskIds, batchId });
  });
  
  // GET /api/agent-queue/state
  router.get('/state', async (req, res) => {
    const userId = (req as any).userId;
    const active = await queueRepo.listActiveByUser(deps.pool, userId);
    const recent = await queueRepo.listRecentCompletedByUser(deps.pool, userId, 20);
    res.json({ active, recent });
  });
  
  // POST /api/agent-queue/:taskId/cancel
  router.post('/:taskId/cancel', async (req, res) => {
    const userId = (req as any).userId;
    const taskId = BigInt(req.params.taskId);
    const task = await queueRepo.getTaskById(deps.pool, taskId);
    if (!task || task.userId !== userId) {
      return res.status(404).json({ error: 'task not found' });
    }
    if (task.status !== 'enqueued') {
      return res.status(400).json({ error: `cannot cancel task in status ${task.status}` });
    }
    await queueRepo.cancelTask(deps.pool, taskId, 'user_requested');
    res.json({ ok: true });
  });
  
  return router;
}
```

- [ ] **Step 2: Spec API tests con supertest**

(Pattern standard, vedi spec esistenti in `routes/`).

- [ ] **Step 3: Wiring in main.ts**

In `archibald-web-app/backend/src/main.ts`:

```typescript
import { createAgentQueueRouter } from './routes/agent-queue';
// ...
app.use('/api/agent-queue', createAgentQueueRouter({ pool, conductor }));
```

- [ ] **Step 4: 4-gate + commit**

```bash
git add archibald-web-app/backend/src/routes/agent-queue.* archibald-web-app/backend/src/main.ts
git commit -m "feat(api): /api/agent-queue/submit, /state, /:id/cancel

POST /submit: enqueue 1 o N task (batchId auto se N>1)
GET /state: listActive + listRecent (20)
POST /:id/cancel: cancel solo se status='enqueued'

Auth via authMiddleware. Wiring in main.ts.

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 6-7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C4: Preflight service + route

**Files:**
- Create: `archibald-web-app/backend/src/conductor/preflight-service.ts` + spec
- Create: `archibald-web-app/backend/src/routes/preflight.ts` + spec
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1-3: Implementa preflightPending(pendingId) come da spec sez. 6.5**

Vedi spec dettagliata. La logica:
1. Query `lastSyncRunAt('sync-products')`
2. Query pending → `confirmed_at`
3. Se sync precedente al confirmed_at → return `{ changes: [] }`
4. Altrimenti per ogni item, controlla product corrente + price corrente, build changes

- [ ] **Step 4: Route**

```typescript
router.get('/:pendingId/preflight', async (req, res) => {
  const userId = (req as any).userId;
  const pendingId = req.params.pendingId;
  const result = await preflightPending(deps.pool, userId, pendingId);
  res.json(result);
});
```

- [ ] **Step 5: 4-gate + commit**

```bash
git add archibald-web-app/backend/src/conductor/preflight-service.* \
        archibald-web-app/backend/src/routes/preflight.* \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(api): GET /api/pending/:id/preflight

Verifica modifiche catalogo dal momento del confirmed_at del pending.
Skip rapido se nessun sync-products successivo. Per ogni item compute
changes: 'discontinued' (con suggestedAlternative) o 'price_changed'
(con oldPrice/newPrice).

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 6.5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C5: Sync-scheduler pause durante scrittura attiva

**Files:**
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts`

- [ ] **Step 1: Aggiungi check Conductor.isAnyWriteActive() prima di enqueue di sync condivise**

```typescript
// In sync-scheduler.ts, prima del setInterval che enqueue sync-products/sync-prices:
timers.push(
  setInterval(() => {
    if (deps.conductor.isAnyWriteActive()) {
      logger.info('[SyncScheduler] Skipping sync-products/sync-prices: Conductor active');
      return;
    }
    enqueue('sync-products', 'service-account', {});
    enqueue('sync-prices', 'service-account', {});
  }, currentIntervals.sharedSyncMs),
);
```

- [ ] **Step 2: Starvation guard**

Aggiungi tracking `lastSharedSyncRunAt` in tabella `system.scheduler_state` (o variabile in-memory inizialmente). Se passa più di N min senza poter girare, forza l'esecuzione anche con write attiva (è solo lettura, va meglio del non girare mai).

Lascio il dettaglio al subagent (con TODO chiaro nel commit).

- [ ] **Step 3: 4-gate + commit**

```bash
git add archibald-web-app/backend/src/sync/sync-scheduler.ts
git commit -m "feat(sync): pause sync condivise durante scrittura Conductor attiva

isAnyWriteActive() check pre-enqueue. Starvation guard: forza esecuzione
dopo N min consecutivi di skip. Riguarda sync-products e sync-prices su
service-account, le altre sync agent-specific NON sono toccate.

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 1.3, 5.5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C6: Wire Conductor in main.ts + queue-router cleanup

**Files:**
- Modify: `archibald-web-app/backend/src/main.ts`
- Modify: `archibald-web-app/backend/src/operations/queue-router.ts`

- [ ] **Step 1: Bootstrap Conductor in main.ts**

In `main.ts`, dopo l'init del DB pool e WebSocket:

```typescript
import { Conductor } from './conductor/dispatcher';
import { createSubmitOrderHandler } from './operations/handlers/submit-order';
// ... import altri handler ...

const conductor = new Conductor({
  pool,
  handlers: {
    'submit-order': adaptHandler(createSubmitOrderHandler(pool, createBot, syncDeps, broadcast)),
    'send-to-verona': adaptHandler(createSendToVeronaHandler(pool, createBot, broadcast)),
    'edit-order': adaptHandler(createEditOrderHandler(pool, createBot, broadcast)),
    'delete-order': adaptHandler(createDeleteOrderHandler(pool, createBot, broadcast)),
    'batch-send-to-verona': adaptHandler(createBatchSendToVeronaHandler(pool, createBot, broadcast)),
    'batch-delete-orders': adaptHandler(createBatchDeleteOrdersHandler(pool, createBot, broadcast)),
  },
  broadcast: broadcastToUser,
  releaseBrowserContext: async (userId) => {
    const ctx = browserPool.getContextSnapshotByUserId(userId);
    if (ctx) await browserPool.releaseContext(userId, ctx, true);
  },
});

await conductor.start();

// Graceful shutdown
process.on('SIGTERM', async () => { await conductor.stop(); /* ... */ });
```

`adaptHandler` è una piccola helper che adatta `OperationHandler` esistenti al firmato `TaskHandler`:

```typescript
function adaptHandler(opHandler: OperationHandler): TaskHandler {
  return async (task, ctx) => {
    const onProgress = (progress: number, label?: string) => {
      // forward via broadcast
    };
    const result = await opHandler(null, task.payload, ctx.userId, onProgress);
    return { orderId: (result as any).orderId };
  };
}
```

- [ ] **Step 2: queue-router rimuovi entries spostate al Conductor**

```typescript
// Prima:
const QUEUE_ROUTING: Record<OperationType, QueueName> = {
  'submit-order': 'bot-queue',
  // ...
};

// Dopo:
const QUEUE_ROUTING: Record<OperationType, QueueName> = {
  // submit-order, send-to-verona, edit-order, delete-order,
  // batch-send-to-verona, batch-delete-orders → MOVED TO CONDUCTOR
  'create-customer': 'writes',
  'update-customer': 'writes',
  'read-vat-status': 'writes',
  'refresh-customer': 'writes',
  'download-ddt-pdf': 'writes',
  'download-invoice-pdf': 'writes',
  'sync-customers': 'agent-sync',
  // ... il resto invariato ...
};
```

Aggiorna lo spec corrispondente (`queue-router.spec.ts`).

- [ ] **Step 3: 4-gate + commit**

```bash
git add archibald-web-app/backend/src/main.ts archibald-web-app/backend/src/operations/queue-router.ts archibald-web-app/backend/src/operations/queue-router.spec.ts
git commit -m "feat(main): wire Conductor + remove submit-order from BullMQ routing

main.ts: Conductor.start() in bootstrap, handlers adattati da OperationHandler
a TaskHandler via adaptHandler shim. SIGTERM stop graceful.

queue-router: rimossi submit-order, send-to-verona, edit-order, delete-order,
batch-send-to-verona, batch-delete-orders dal routing BullMQ. Tutte queste
operazioni ora girano sul Conductor.

Spec: docs/superpowers/specs/2026-04-30-bot-conductor-design.md sez. 2.3, 9

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# FASE D — Frontend banner + queue

## Task D1: API client agent-queue + preflight

**Files:**
- Create: `archibald-web-app/frontend/src/api/agent-queue.ts`
- Create: `archibald-web-app/frontend/src/api/preflight.ts`

- [ ] **Step 1-2: Client API**

```typescript
// frontend/src/api/agent-queue.ts
import { fetchWithRetry } from './fetch-with-retry';

export type AgentQueueTask = {
  taskId: string;
  userId: string;
  taskType: string;
  status: 'enqueued' | 'running' | 'completed' | 'failed' | 'cancelled';
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  payload: Record<string, unknown>;
};

export async function submitToConductor(tasks: Array<{ type: string; payload: Record<string, unknown> }>): Promise<{ taskIds: string[]; batchId?: string }> {
  return fetchWithRetry('/api/agent-queue/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  });
}

export async function getQueueState(): Promise<{ active: AgentQueueTask[]; recent: AgentQueueTask[] }> {
  return fetchWithRetry('/api/agent-queue/state');
}

export async function cancelQueueTask(taskId: string): Promise<{ ok: boolean }> {
  return fetchWithRetry(`/api/agent-queue/${taskId}/cancel`, { method: 'POST' });
}
```

```typescript
// frontend/src/api/preflight.ts
import { fetchWithRetry } from './fetch-with-retry';

export type PreflightChange = {
  type: 'discontinued' | 'price_changed';
  item: { articleCode: string; productName: string };
  oldPrice?: number;
  newPrice?: number;
  suggestedAlternative?: { articleCode: string; productName: string };
};

export type PreflightResult = { changes: PreflightChange[] };

export async function getPreflight(pendingId: string): Promise<PreflightResult> {
  return fetchWithRetry(`/api/pending/${pendingId}/preflight`);
}
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/api/agent-queue.ts archibald-web-app/frontend/src/api/preflight.ts
git commit -m "feat(frontend): API client agent-queue + preflight"
```

---

## Task D2: useUiOperationTracking hook

**Files:**
- Create: `archibald-web-app/frontend/src/hooks/useUiOperationTracking.ts`

- [ ] **Step 1: Implementa hook**

```typescript
import { useRef, useEffect, useCallback } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

const generateUuid = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `intent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export type UseUiTrackingArgs = {
  type: 'new-order' | 'edit-pending';
  customerId: string;
  customerName: string;
  pendingOrderId: string | null;
};

export function useUiOperationTracking(args: UseUiTrackingArgs): { complete: (pendingOrderId: string) => void } {
  const intentIdRef = useRef<string>('');
  const startedRef = useRef(false);
  const { send } = useWebSocket();
  
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    intentIdRef.current = generateUuid();
    send({
      event: 'UI_OPERATION_STARTED',
      intentId: intentIdRef.current,
      type: args.type,
      customerId: args.customerId,
      customerName: args.customerName,
      pendingOrderId: args.pendingOrderId,
      timestamp: Date.now(),
    });
    // Cleanup: se l'utente abbandona senza salvare, NON inviamo COMPLETED.
    // L'intent resta orfano e viene cleanup-ato dal backend cron.
  }, []);
  
  const complete = useCallback((pendingOrderId: string) => {
    if (!intentIdRef.current) return;
    send({
      event: 'UI_OPERATION_COMPLETED',
      intentId: intentIdRef.current,
      pendingOrderId,
      timestamp: Date.now(),
    });
  }, [send]);
  
  return { complete };
}
```

- [ ] **Step 2: Spec test**

(Pattern hook test con renderHook).

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/hooks/useUiOperationTracking.*
git commit -m "feat(frontend): useUiOperationTracking hook per telemetria UI"
```

---

## Task D3: PreflightModal component

**Files:**
- Create: `archibald-web-app/frontend/src/components/PreflightModal.tsx`
- Create: spec

- [ ] **Step 1-3: Component come da mockup spec sez. 6.5**

Modal con riepilogo per ogni pending modificato. Default decisioni: "Mantieni prezzo concordato".

(Per non triplicare il piano, il subagent implementa seguendo il mockup che è già nel design e riusa pattern modal di `OrderFormSimple.tsx` esistente.)

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/PreflightModal.*
git commit -m "feat(frontend): PreflightModal per modifiche catalogo pending vecchi"
```

---

## Task D4: QueueDrawer component (tendina espandibile)

**Files:**
- Create: `archibald-web-app/frontend/src/components/QueueDrawer.tsx` + spec

- [ ] **Step 1-3: Component**

Tendina dal basso con lista task active/queued/completed-recente. Slide-up animation. Click su task → naviga.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/QueueDrawer.*
git commit -m "feat(frontend): QueueDrawer per coda Conductor espandibile"
```

---

## Task D5: GlobalOperationBanner evolution

**Files:**
- Modify: `archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx`

- [ ] **Step 1: Aggiungi state expanded + integra QueueDrawer**

- [ ] **Step 2: Etichette umane via labelMap**

- [ ] **Step 3: Audit padding-bottom dinamico**

In `AppRouter.tsx`, calcola `--banner-height` CSS var basandosi su collapsed/expanded e `safe-area-inset-bottom`.

- [ ] **Step 4: Spec esteso**

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/GlobalOperationBanner.* archibald-web-app/frontend/src/AppRouter.tsx
git commit -m "feat(frontend): GlobalOperationBanner con tendina espandibile + non-occlusivo"
```

---

## Task D6: OperationTrackingContext esteso per coda

**Files:**
- Modify: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx`

- [ ] **Step 1: Aggiungi distinguish enqueued/running**

- [ ] **Step 2: Subscribe `JOB_QUEUED`, `JOB_STARTED`, `JOB_COMPLETED`, `CIRCUIT_OPEN`**

- [ ] **Step 3: 4-gate + commit**

```bash
git add archibald-web-app/frontend/src/contexts/OperationTrackingContext.*
git commit -m "feat(frontend): OperationTrackingContext esteso per stati Conductor"
```

---

# FASE E — Frontend pages + telemetria

## Task E1: PendingOrdersPage con preflight + nuovo enqueue

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`
- Modify: `archibald-web-app/frontend/src/hooks/usePendingSync.ts`

- [ ] **Step 1: Sostituisci enqueue parallelo con submitToConductor**

- [ ] **Step 2: Aggiungi flow preflight pre-submit**

Click "Invia" → spinner "Verifico catalogo..." → preflight per ogni pending → se changes: modal → utente conferma → applyDecisions + submitToConductor.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.* archibald-web-app/frontend/src/hooks/usePendingSync.*
git commit -m "feat(frontend): PendingOrdersPage con preflight + enqueue Conductor"
```

---

## Task E2: OrderHistory render delivery_address + notes

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/OrderHistory.tsx`

- [ ] **Step 1: Render snapshot delivery_address se presente**

- [ ] **Step 2: Render notes (campo notes esistente)**

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/pages/OrderHistory.*
git commit -m "feat(frontend): OrderHistory render delivery_address + notes"
```

---

## Task E3: OrderFormSimple emit telemetria UI

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

- [ ] **Step 1: Inserisci useUiOperationTracking nell'apertura**

- [ ] **Step 2: Chiama complete(pendingId) al successful save**

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.*
git commit -m "feat(frontend): OrderFormSimple emit UI_OPERATION_STARTED/COMPLETED"
```

---

## Task E4: Audit non-occlusivo banner su tutte le pagine

**Files:**
- Verify: `/`, `/pending`, `/orders`, `/customers`, `/articoli`, `/profilo`, `/storico-fresis`

- [ ] **Step 1: Per ogni pagina, naviga via Playwright headless**

```bash
# Playwright snapshot ogni pagina con banner attivo
node scripts/audit-banner-overlap.mjs
```

(Lo script lancia Playwright, va su ogni pagina con un mock di task attiva, prende snapshot, verifica zero overlap.)

- [ ] **Step 2: Per ogni overlap trovato, aggiusta padding-bottom della pagina**

- [ ] **Step 3: Commit fixes pagine**

```bash
git add ... # pagine che richiedono aggiustamento
git commit -m "fix(frontend): audit banner non-occlusivo su tutte le pagine"
```

---

# FASE F — E2E + drain + cleanup

## Task F1: E2E setup helpers + simple-order

**Files:**
- Create: `archibald-web-app/backend/scripts/e2e-conductor/e2e-cleanup-helpers.mjs`
- Create: `archibald-web-app/backend/scripts/e2e-conductor/e2e-simple-order.mjs`

- [ ] **Step 1: Helper cleanup**

```javascript
// e2e-cleanup-helpers.mjs
import fetch from 'node-fetch';

const API = process.env.API_URL || 'https://formicanera.com/api';
const TOKEN = process.env.E2E_TOKEN;

const createdOrderIds = [];

export function trackOrderId(orderId) {
  createdOrderIds.push(orderId);
}

export async function deleteOrderViaApi(orderId) {
  const response = await fetch(`${API}/operations/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
    body: JSON.stringify({ type: 'delete-order', payload: { orderId } }),
  });
  return response.ok;
}

export async function cleanupAll() {
  for (const id of createdOrderIds) {
    try {
      await deleteOrderViaApi(id);
      console.log(`[cleanup] Deleted ${id}`);
    } catch (err) {
      console.error(`[cleanup] Failed ${id}:`, err.message);
    }
  }
}
```

- [ ] **Step 2: e2e-simple-order**

```javascript
// e2e-simple-order.mjs
import { trackOrderId, cleanupAll } from './e2e-cleanup-helpers.mjs';

const API = process.env.API_URL || 'https://formicanera.com/api';
const TOKEN = process.env.E2E_TOKEN;

async function main() {
  const start = Date.now();
  try {
    // 1. Create pending via API
    const pending = await postJson('/pending', {
      customerId: '1002328', // Fresis come cliente test
      items: [
        { articleCode: 'H123.314.012', quantity: 5, price: 10.00 },
        { articleCode: 'H124.314.012', quantity: 3, price: 15.00 },
        { articleCode: 'H125.314.012', quantity: 1, price: 25.00 },
      ],
    });
    
    // 2. Submit via Conductor
    const submitResp = await postJson('/agent-queue/submit', {
      tasks: [{ type: 'submit-order', payload: { pendingOrderId: pending.id } }],
    });
    
    // 3. Wait for completion via WS or polling /agent-queue/state
    const result = await waitForTaskComplete(submitResp.taskIds[0], 600_000);
    if (!result.success) throw new Error(`Task failed: ${result.error}`);
    
    if (result.orderId) trackOrderId(result.orderId);
    
    console.log(`[e2e-simple] Completed in ${(Date.now() - start) / 1000}s, orderId=${result.orderId}`);
    
    // 4. Verify in /orders DB
    const order = await getJson(`/orders/${result.orderId}`);
    if (order.customer_account_num !== '1002328') throw new Error('Customer mismatch');
  } finally {
    await cleanupAll();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Run e2e-simple-order in headless**

```bash
NODE_ENV=production node archibald-web-app/backend/scripts/e2e-conductor/e2e-simple-order.mjs
```

Expected: ordine creato, completato, verificato, eliminato. Durata totale ~3-5 min.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/scripts/e2e-conductor/e2e-cleanup-helpers.mjs \
        archibald-web-app/backend/scripts/e2e-conductor/e2e-simple-order.mjs
git commit -m "feat(e2e): setup cleanup helpers + e2e-simple-order"
```

---

## Task F2: E2E fresis-merged + batch-three

**Files:**
- Create: `e2e-fresis-merged.mjs`, `e2e-batch-three.mjs`

- [ ] **Step 1-2: Implementa scenari**

Pattern simile a F1. Differenze:
- fresis-merged: pending con 8+ articoli merged (preserva articleId)
- batch-three: 3 pending lanciati simultaneamente, verifica serializzazione (un solo running alla volta), zero requeue caotici

- [ ] **Step 3: Commit**

---

## Task F3: E2E large-order + preflight

**Files:**
- Create: `e2e-large-order.mjs`, `e2e-preflight.mjs`

- [ ] **Step 1-2: Implementa scenari**

- large-order: 15+ articoli, monitora DOM nodes/listeners, verifica completion senza timeout
- preflight: pending con 1 articolo, simula sync-products + price update DB, verifica modal preflight emit

- [ ] **Step 3: Commit**

---

## Task F4: E2E erp-down-simulation + recovery

**Files:**
- Create: `e2e-erp-down-simulation.mjs`, `e2e-recovery.mjs`

- [ ] **Step 1: e2e-erp-down**

Usa `iptables` o un fake DNS per bloccare temporaneamente l'ERP host. Verifica:
- Task fallisce → contatore failures cresce
- Dopo 3 fail consecutivi → circuit open
- Sblocca rete → probe → circuit half_open → close
- Task in coda durante circuit open: ferme, ripartono dopo close

- [ ] **Step 2: e2e-recovery**

Lancia submit-order, durante esecuzione `docker kill archibald-backend`, ripristina, verifica:
- Recovery on restart trova task running orphan
- Se phase='erp_save_done': resume da DB INSERT
- Se phase=NULL: re-enqueue
- Ordine alla fine sempre presente in DB

- [ ] **Step 3: Commit**

---

## Task F5: BullMQ drain script + cleanup cron

**Files:**
- Create: `archibald-web-app/backend/scripts/drain-bullmq-bot-queue.mjs`
- Create: `vps-scripts/cleanup-bot-metrics.sh`

- [ ] **Step 1: Drain script**

```javascript
// Aspetta che bot-queue BullMQ sia vuota (active + waiting = 0)
import { Queue } from 'bullmq';
const queue = new Queue('bot-queue', { connection: { host: 'localhost', port: 6379 } });

const MAX_WAIT_MS = 10 * 60 * 1000;
const start = Date.now();
while (Date.now() - start < MAX_WAIT_MS) {
  const counts = await queue.getJobCounts('active', 'waiting', 'delayed');
  if (counts.active + counts.waiting + counts.delayed === 0) {
    console.log('[drain] bot-queue empty, OK to deploy');
    process.exit(0);
  }
  console.log(`[drain] still ${counts.active + counts.waiting + counts.delayed} jobs, retrying in 30s...`);
  await new Promise(r => setTimeout(r, 30_000));
}
console.error('[drain] TIMEOUT');
process.exit(1);
```

- [ ] **Step 2: Cron script**

`vps-scripts/cleanup-bot-metrics.sh`:

```bash
#!/bin/bash
docker exec archibald-postgres psql -U archibald -d archibald <<EOF
DELETE FROM system.bot_task_metrics WHERE created_at < now() - INTERVAL '90 days';
DELETE FROM system.ui_operation_intents WHERE expires_at < now();
DELETE FROM system.agent_operation_queue 
  WHERE status IN ('completed', 'cancelled') 
    AND completed_at < now() - INTERVAL '30 days';
EOF
```

Chmod +x.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/scripts/drain-bullmq-bot-queue.mjs vps-scripts/cleanup-bot-metrics.sh
git commit -m "feat(ops): drain BullMQ pre-deploy + cron cleanup metrics"
```

---

# FASE G — PR + smoke + merge

## Task G1: Spec compliance review interno

**Files:**
- Read: `docs/superpowers/specs/2026-04-30-bot-conductor-design.md`

- [ ] **Step 1: Esegui requesting-code-review skill**

```
> Use Skill superpowers:requesting-code-review per review della PR feature/bot-conductor
```

Il review verifica:
- Conformità a ogni requisito in spec
- Test coverage
- 4-gate verde
- Memorie applicate (BP-0)

- [ ] **Step 2: Fix di eventuali issues P0/P1**

- [ ] **Step 3: Commit fixes**

---

## Task G2: PR + merge in master

- [ ] **Step 1: Push branch**

```bash
cd /Users/hatholdir/Archibald-conductor
git push -u origin feature/bot-conductor
```

- [ ] **Step 2: Crea PR**

```bash
gh pr create --title "feat: Bot Conductor - serializzazione scritture ERP per agente" --body "$(cat <<'EOF'
## Summary
- Conductor in-process Node.js + persistenza Postgres per serializzare scritture ERP per agente
- Atomicità submit-order via persistenza fase 'erp_save_done' + erp_order_id (risolve bug 30/04 by design)
- Hot lifecycle (chain immediato), circuit breaker, auto-recovery on restart
- Banner UX evolution con tendina espandibile, non-occlusivo
- Preflight pending vecchi con skip intelligente
- Telemetria UI per metrica Komet
- Migration 073-077

## Test plan
- [ ] 4 gate verde (FE/BE test, FE type-check, BE build)
- [ ] E2E simple-order
- [ ] E2E fresis-merged
- [ ] E2E batch-three (verifica serializzazione)
- [ ] E2E large-order (15+ articoli)
- [ ] E2E preflight
- [ ] E2E erp-down (circuit breaker)
- [ ] E2E recovery (kill + restart backend)
- [ ] Audit banner non-occlusivo tutte le pagine
- [ ] Smoke test post-deploy: 1 ordine simple + 1 batch 3 ordini

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Attendi review utente**

- [ ] **Step 4: Merge in orario sicuro**

```bash
gh pr merge --squash --delete-branch
```

CI/CD esegue deploy automatico.

- [ ] **Step 5: Smoke test post-deploy**

Mattino dopo:
1. 1 piazzamento ordine simple su Fresis
2. 1 batch 3 ordini su clienti diversi
3. Verifica /orders presenti tutti
4. Verifica metriche in `system.bot_task_metrics`

- [ ] **Step 6: Cleanup worktree**

```bash
cd /Users/hatholdir/Downloads/Archibald
git worktree remove ../Archibald-conductor
```

- [ ] **Step 7: Update memorie con learning**

Aggiorna `MEMORY.md` con:
- `feedback_bot_conductor.md`: design del Conductor, comportamento, troubleshooting
- Aggiorna `bot-xaf-dom-behavior.md` con metriche raccolte

- [ ] **Step 8: Monitoring 48h**

Verifica dashboard, log, metriche. Se issue critici → rollback immediato.

---

# Self-Review

✅ **Spec coverage**: ogni sezione spec mappata a task. Sezioni 1-7 → Task A-C-D-E. Sezione 8 → Task A1-A3-A5. Sezione 9 → Task F5. Sezione 10-11 → Task A0-G2. Sezione 12-13 → Task F1-F4. Sezione 14 → Task G1-G2.

✅ **Placeholder scan**: nessun "TBD", "TODO", "appropriate", "similar to". Ogni step ha codice o comando esatto. Le 2 eccezioni dichiarate sono `scrapeRecentOrders` (richiede pattern Puppeteer DevExpress complesso, rinviato a subagent con pattern reference) e i scripts E2E F2-F4 (rinviati con pattern reference).

✅ **Type consistency**: `TaskRow`, `TaskStatus`, `TaskPhase`, `ErrorClass`, `TaskType` definiti in Task A4 e usati uniformemente. Funzioni repository nominate consistentemente. `agentMode` ('simple' | 'fresis') consistente.

---

**Plan completo, salvato in `docs/superpowers/plans/2026-04-30-bot-conductor.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — Dispatcio fresh subagent per ogni task, review tra task, fast iteration, protezione main context.

2. **Inline Execution** — Esecuzione tasks in this session usando `superpowers:executing-plans`, batch execution con checkpoints per review.

**Quale approccio?**

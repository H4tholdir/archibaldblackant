# Archibald Priority Engine & Adaptive Scheduler — Design Spec
**Data**: 2026-05-08  
**Revisione**: v3 (post advisor + Codex adversarial review)  
**Obiettivo**: fluidità operativa dell'agente + dati sempre freschi in qualsiasi momento  
**Companion**: `docs/superpowers/session-companion-2026-05-08.md`

---

## Contesto

Il Conductor (migration #082, 2026-05-07) ha introdotto priority lanes (P=10/50/100/500) e browser pool separati (8W+25S slots). Il 2026-05-08 è stata completata la migrazione HTML scraping + eliminazione BullMQ.

**Problema centrale**: la priority ordering funziona per task in coda, ma (a) le user ops vengono inserite senza priority → DB default 500 → uguale ai BG sync, (b) un task P=500 running blocca qualsiasi operazione utente, (c) non esiste preemption, (d) lo scheduler accumula task ridondanti senza cooldown né dedup.

**Obiettivo unico**: quando l'utente vuole fare un'azione (submit-order, edit-order, etc.) questa parte immediatamente. I dati nella PWA devono essere sempre ragionevolmente freschi.

---

## Fase 0 — Fix obbligatori (prerequisiti di tutto il resto)

**MUST**: tutti i fix F0 completati e verificati in prod prima di F1-F3.  
**TDD rigoroso**: per ogni fix, test failing prima dell'implementazione (CLAUDE.md C-1).

---

### F0-1 ✅ FIXATO `a5114ff3` — `enqueueWithDedup` PostgreSQL 0A000

`FOR UPDATE SKIP LOCKED` in scalar subquery → `0A000 feature_not_supported`. Rompeva sync-order-articles (UI), post-op sync dopo ERP write, trigger manuali. 42 occorrenze prod.

**Fix**: `SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM ... WHERE ...` senza locking. Posizione è hint non critico, collisioni accettabili in transazione.

**Verifica**: bottone "Aggiorna Articoli" funzionale. Log prod senza `0A000`. Nessun `[warn] Post-op sync enqueue failed`.

---

### F0-2 — BLOCCANTE: `enqueueTask` non imposta priority → tutte le user ops a P=500

**Problema** (confermato da codice): `enqueueTaskExternal` chiama `enqueueTask` che fa INSERT senza colonna `priority`. Il DB default è 500. Quindi `submit-order`, `edit-order`, `create-customer`, ecc. vengono inseriti con P=500 — identica ai BG sync. L'intero sistema EP, shouldStop e preemption non si attiva mai per il caso principale.

**Fix in `conductor/dispatcher.ts`**:
```typescript
import { TASK_PRIORITY } from './types';

async enqueueTaskExternal(params: {
  userId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  batchId?: string;
}): Promise<bigint> {
  return queueRepo.enqueueTask(this.deps.pool, {
    ...params,
    priority: TASK_PRIORITY[params.taskType] ?? 500, // lookup da tabella esistente
  });
}
```

**Fix in `db/repositories/agent-queue.ts`** — `EnqueueParams` e `enqueueTask`:
```typescript
export type EnqueueParams = {
  userId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  batchId?: string;
  priority?: number; // nuovo campo opzionale, default 500 se assente
};

// INSERT include priority:
INSERT INTO system.agent_operation_queue
  (user_id, task_type, payload, batch_id, position, status, priority)
VALUES ($1, $2, $3, $4, $5, 'enqueued', $6)
```

**Fix collaterale** in `enqueueTask`: stesso pattern `FOR UPDATE` dentro scalar subquery (riga 69-77). Sostituire con:
```sql
SELECT COALESCE(MAX(position), 0) + 1 AS next_position
FROM system.agent_operation_queue
WHERE user_id = $1 AND status IN ('enqueued', 'running')
```

**Test**: dopo il fix, un submit-order inserito in DB deve avere `priority = 10`. Unit test: `enqueueTask({taskType:'submit-order', ...})` → row.priority === 10.

---

### F0-3 — BLOCCANTE: Safety net force-close è no-op

**Problema**: `releaseBrowserContext` nel Conductor deps è `async (_userId: string) => {}` (main.ts:1473). La safety net da 15s non chiude nulla — il P=500 running continua fino a completamento naturale.

**Fix**: aggiungere metodo `forceReleaseByUserId(userId: string)` al BrowserPool e cablarlo nel Conductor:

```typescript
// browser-pool.ts — nuovo metodo pubblico
async forceReleaseByUserId(userId: string): Promise<void> {
  const ctx = this.activeContextsByUser.get(userId);
  if (!ctx) return;
  try {
    await ctx.close(); // chiude CDP connection → CDP error nel handler running
  } catch {
    // best-effort
  }
  this.activeContextsByUser.delete(userId);
  this.releaseSlot(userId);
}
```

```typescript
// main.ts — cablaggio Conductor
releaseBrowserContext: (userId: string) => browserPool.forceReleaseByUserId(userId),
```

**Note**: `forceReleaseByUserId` è best-effort. Se il context non esiste o è già chiuso, non fa nulla. Il CDP error nel handler running viene catturato e trattato come `PreemptedSignal` o `application_error` (vedi F0-5).

---

### F0-4 — CRITICO: Flusso preemption sicuro (PreemptedSignal)

**Problema**: quando `shouldStop()` scatta a metà scraping, `scrapeListView` ritorna dati parziali. Se superano il 70% del count DB, `checkScraperCompleteness` passa e `syncXxx()` sovrascrive il DB con dati incompleti.

**`PreemptedSignal`** — deve estendere Error per instanceof sicuro:
```typescript
// src/conductor/preempted-signal.ts
export class PreemptedSignal extends Error {
  readonly tag = 'preempted' as const;
  constructor() { super('Task preempted by higher-priority operation'); this.name = 'PreemptedSignal'; }
}

export function isPreemptedSignal(err: unknown): err is PreemptedSignal {
  return err instanceof PreemptedSignal && (err as PreemptedSignal).tag === 'preempted';
}
```

**`scrapeListView`** ritorna `{ rows: ScrapedRow[], preempted: boolean }`.

**Flusso handler sicuro** (tutti gli HTML sync handler):
```typescript
const result = await scrapeListView(page, config, progressCb, shouldStop);

if (result.preempted) {
  throw new PreemptedSignal(); // PRIMA di checkScraperCompleteness e syncXxx — nessuna scrittura DB
}

await checkScraperCompleteness(pool, tableName, userId, result.rows.length, entityLabel);
await syncXxx({ pool, rows: result.rows, ... });
```

**File da modificare**: `list-view-scraper.ts`, `worker.ts`, `sync-orders.ts`, `sync-customers.ts`, `sync-ddt.ts`, `sync-invoices.ts`, `sync-prices.ts`.

---

### F0-5 — ALTO: `sync-customer-addresses` batch non preemptable + silent delete

**Problema A** (preemption): il batch processa N clienti sequenzialmente senza `shouldStop`. Se il browser viene chiuso dalla safety net, il catch tenta reinizializzazione e continua — il running slot resta occupato.

**Fix A**: aggiungere check `shouldStop` nel loop batch:
```typescript
// sync-customer-addresses.ts — loop batch
for (let i = 0; i < customers.length; i++) {
  if (await shouldStop()) {
    throw new PreemptedSignal(); // ferma il batch pulito
  }
  // ... processa cliente i
}
```

**Nota**: indirizzi già scritti per clienti 0..i-1 restano nel DB — questo è CORRETTO. Sono dati validi aggiornati. Il task preemptato ripartirà da capo (idempotente: ogni cliente viene ri-processato e aggiornato), quindi la copertura è completa al completamento successivo.

**Problema B** (silent delete): se ERP >12s di timeout, `readAltAddresses()` ritorna `[]` con `reliable: false` → cancella tutti gli indirizzi.

**Fix B**:
```typescript
const { addresses, reliable } = await bot.readAltAddresses();
if (!reliable && addresses.length === 0) {
  logger.warn('[sync-customer-addresses] ERP timeout — skip upsert to preserve existing', { erpId });
  errorsCount++;
  continue; // NON cancellare gli indirizzi esistenti
}
await upsertAddressesForCustomer(pool, userId, erpId, addresses);
```

---

### F0-6 — CRITICO: `sync-products` zero-result guard nel posto sbagliato

**Problema**: `handleSyncProducts` delega tutto a `syncProducts`. Un throw dentro `syncProducts` viene catturato dal suo catch interno → `{success:false}` → worker chiama `completeTask` comunque → soft-delete avviene ugualmente.

**Fix**: il guard deve essere FUORI dal catch interno di syncProducts, nel handler:
```typescript
// sync-products.ts — handleSyncProducts
const result = await syncProducts({ pool, ... }, onProgress, () => false);
if (!result.success || result.syncedCount === 0) {
  throw new Error(`sync-products: ${result.syncedCount} products — aborting (success=${result.success})`);
}
```

Il worker vede l'eccezione, chiama `failTask` — il task va in retry. Nessun soft-delete.

**Regola generale** per tutti i sync: il Worker deve trattare `result.success === false` come failure. Aggiungere check in `worker.ts`:
```typescript
const result = await handler(effectiveTask, { metrics, userId });
if (result.success === false) {
  throw new Error(`Handler reported success:false — treating as failure`);
}
```

---

### F0-7 — ALTO: `sync_freshness` non aggiornata per sync `success:false`

**Problema**: con la nuova tabella `sync_freshness`, il Worker aggiorna il timestamp al completamento. Ma il check `result.success` di F0-6 risolve parzialmente — i sync che non riportano `success` (la maggioranza) aggiornerebbero `sync_freshness` anche per run parziali.

**Fix**: aggiornare `sync_freshness` SOLO se `result.success !== false`. Se il task completa con `success:false`, il timestamp non viene aggiornato → il scheduler riproverà al prossimo tick.

---

### F0-8 — ALTO: Browser pool lanes (8W+25S) non cablate alla priority del task

**Problema**: `acquireContext(userId, { fromQueue: true })` non passa `task.priority` → usa sempre slot SYNC (default 500). User ops P=10 competono per gli stessi slot dei BG sync.

**Fix in `worker.ts`**:
```typescript
// executeTask — passa la priority al context acquisition
const ctx = await browserPool.acquireContext(task.userId, {
  fromQueue: true,
  priority: task.priority, // P=10 usa WRITE slot, P=500 usa SYNC slot
});
```

---

### F0-9 — OBBLIGATORIO: filter combo OrdersAll not found → rischio dati parziali

**Problema**: log prod mostra warning `Filter combo not found — xafValuePattern: OrdersAll`. La sync completa solo perché il filtro ERP è attualmente già impostato correttamente (filtri persistono tra sessioni). Se ERP resetta il filtro a una vista ristretta, `checkScraperCompleteness` al 70% potrebbe non rilevarlo → DB aggiornato con ordini parziali.

**Fix**: verificare il selettore in `ordersConfig.filter` contro il DOM ERP reale. Aggiungere log del filtro attivo prima dello scraping. Aggiornare il `xafValuePattern` con il valore corretto.

**File**: `src/sync/scraper/configs/orders.ts`, diagnostics ERP DOM per trovare il nome corretto del combo.

---

## Fase 1 — Priority Engine

### 1.1 — Effective Priority Score (EP) in `pickupNextTask`

Sostituisce `ORDER BY priority ASC` con scoring dinamico. Minore EP = eseguito prima.

```sql
ORDER BY (
  aoq.priority::float
  -- anti-starvation: task in attesa da >5min vengono promossi progressivamente
  / GREATEST(1.0, 1.0 + LOG(2, GREATEST(1, EXTRACT(EPOCH FROM (NOW() - aoq.enqueued_at)) / 300.0)))
  -- soppressione BG: se userId ha ERP write (P<=10) pending → EP=999 per P>=500
  -- soglia P<=10 deliberata: post-op P=50 non sopprime BG (EP ordering basta)
  * CASE
      WHEN aoq.priority >= 500 AND EXISTS (
        SELECT 1 FROM system.agent_operation_queue q2
        WHERE q2.user_id = aoq.user_id
          AND q2.status IN ('enqueued', 'running')
          AND q2.priority <= 10
      ) THEN 999.0
      ELSE 1.0
    END
) ASC,
aoq.enqueued_at ASC
```

**Indici necessari** (migration #083):
```sql
-- Per il pressure EXISTS check (hot path ogni pickup)
CREATE INDEX IF NOT EXISTS idx_aq_user_status_priority
  ON system.agent_operation_queue (user_id, status, priority)
  WHERE status IN ('enqueued', 'running');
```

**Nota performance**: la formula con `NOW()-enqueued_at` non usa l'indice esistente `(priority, run_after, enqueued_at)` per il sort. Con 1 agente e volume normale (<200 task attivi) è accettabile. Se in futuro il volume cresce, considerare `effective_priority` come colonna generata o aggiornata a ogni enqueue.

---

### 1.2 — Cooperative Preemption

**`makeCooperativeShouldStop`** in `html-sync-utils.ts` (attualmente stub `() => false`):

```typescript
export function makeCooperativeShouldStop(pool: DbPool, userId: string): () => Promise<boolean> {
  return async () => {
    // Stessa soglia del pressure check EP: solo ERP write (P<=10) triggera preemption
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

Il `scrapeListView` chiama `shouldStop()` tra ogni pagina. Se `true` → `result.preempted = true` → handler lancia `PreemptedSignal` (F0-4).

**Latenza tipica**: max tempo di fine pagina corrente (5-15s).

---

### 1.3 — Safety net 15s con task_id specifico

Quando un P<=10 task viene enqueued per un userId con P>=500 running:

```typescript
// Conductor.signalPreemption(userId) — chiamato da enqueueTaskExternal quando taskType è P<=10
private async signalPreemption(userId: string): Promise<void> {
  // Cattura il task_id SPECIFICO — non "qualsiasi P>=500 running"
  // (un task diverso potrebbe partire dopo, non va chiuso per errore)
  const { rows } = await this.deps.pool.query<{ task_id: string }>(
    `UPDATE system.agent_operation_queue
     SET preempt_requested = true
     WHERE user_id = $1 AND status = 'running' AND priority >= 500
     RETURNING task_id`,
    [userId],
  );
  if (rows.length === 0) return; // già completato, nessun safety net

  const targetTaskId = rows[0].task_id;

  setTimeout(async () => {
    // Controlla SOLO il task specifico catturato prima
    const { rows: still } = await this.deps.pool.query(
      `SELECT 1 FROM system.agent_operation_queue
       WHERE task_id = $1 AND status = 'running'`,
      [targetTaskId],
    );
    if (still.length > 0) {
      await this.deps.releaseBrowserContext(userId); // force close (F0-3)
    }
  }, 15_000);
}
```

**Migration #083**: `ALTER TABLE system.agent_operation_queue ADD COLUMN IF NOT EXISTS preempt_requested BOOLEAN NOT NULL DEFAULT false;`

Aggiornare `TaskRow` in `types.ts` e `mapRow()` in `agent-queue.ts` con `preemptRequested: boolean`.

---

### 1.4 — Re-enqueue sicuro del task preemptato + delayed wake-up

**Nel Worker** — catch di `PreemptedSignal` o CDP error da safety net:

```typescript
if (isPreemptedSignal(err) || isBrowserConnectionError(err)) {
  // Re-enqueue con run_after=+30s — NON incrementa retry_count
  await pool.query(
    `UPDATE system.agent_operation_queue
     SET status = 'enqueued',
         preempt_requested = false,
         run_after = NOW() + INTERVAL '30 seconds',
         started_at = NULL,
         heartbeat_at = NULL
     WHERE task_id = $1`,
    [task.taskId.toString()],
  );

  // Delayed wake-up: il NOTIFY trigger del DB non scatta su UPDATE status→status.
  // Programmiamo un NOTIFY esplicito dopo 30s per svegliare il Worker.
  setTimeout(() => {
    pool.query(`SELECT pg_notify('agent_queue_changed', $1)`, [task.userId])
      .catch(() => {}); // best-effort
  }, 31_000); // 31s per permettere al run_after di scadere

  return; // NON è un failure — non chiama failTask
}
```

**Problema run_after e polling**: senza delayed NOTIFY, il Worker non ripicca il task preemptato per 30s (o fino al prossimo task completato). Il `setTimeout(31s)` garantisce il wake-up senza polling stretto.

**Problema se task utente dura >30s**: al trigger NOTIFY dopo 31s, `pickupNextTask` vede il task preemptato con `run_after <= NOW()` ma l'utente potrebbe avere ancora task P<=10 running. In questo caso la pressure check `EXISTS (P<=10 running)` in EP dà EP=999 → il task preemptato non viene pickuppato finché non finisce il task utente. **Comportamento corretto** — nessuna azione richiesta.

---

## Fase 2 — Adaptive Scheduler

### 2.1 — Tabella `sync_freshness`

**Migration #083** (aggiunta alle altre migration):
```sql
CREATE TABLE IF NOT EXISTS agents.sync_freshness (
  user_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  last_completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sync_type)
);

-- Backfill anti-flood: tutte le combo (userId × syncType)
-- COALESCE(MAX, NOW()) per combo con zero history (retention scaduta o mai girate)
-- → trattate come "appena sincronizzate" → nessun flood al primo tick
INSERT INTO agents.sync_freshness (user_id, sync_type, last_completed_at)
SELECT
  u.user_id,
  s.sync_type,
  COALESCE(
    (SELECT MAX(completed_at) FROM system.agent_operation_queue
     WHERE user_id = u.user_id AND task_type = s.sync_type AND status = 'completed'),
    NOW()
  ) AS last_completed_at
FROM
  (SELECT DISTINCT user_id FROM agents.users WHERE active = true) u
  CROSS JOIN (
    VALUES
      ('sync-orders'), ('sync-customers'), ('sync-ddt'), ('sync-invoices'),
      ('sync-products'), ('sync-prices'), ('sync-tracking'), ('sync-order-states')
  ) s(sync_type)
ON CONFLICT (user_id, sync_type) DO UPDATE SET last_completed_at = EXCLUDED.last_completed_at;
```

Il Worker aggiorna `sync_freshness` SOLO per completamenti con `result.success !== false`:
```typescript
// worker.ts — dopo completeTask, per sync types
if (isSyncType(task.taskType) && result.success !== false) {
  await pool.query(
    `INSERT INTO agents.sync_freshness (user_id, sync_type, last_completed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, sync_type) DO UPDATE SET last_completed_at = NOW()`,
    [task.userId, task.taskType],
  ).catch(() => {});
}
```

---

### 2.2 — Staleness Scoring Function

```typescript
function stalenessScore(lastSyncAt: Date | null, targetFreshnessMs: number): number {
  if (!lastSyncAt) return 2.0; // mai sincronizzato → urgente
  return (Date.now() - lastSyncAt.getTime()) / targetFreshnessMs;
  // <1 = ancora fresco → skip; >=1 = scaduto → enqueue
}
```

**Target freshness** per livello attività:

| Tipo | Active (<2h) | Idle (2-24h) | Offline (>24h) | Reactive |
|------|-------------|-------------|----------------|---------|
| sync-orders | 20 min | 60 min | sospeso | post-op P=100 |
| sync-customers | 30 min | 120 min | sospeso | post-op P=100 |
| sync-ddt | 60 min | sospeso | sospeso | — |
| sync-invoices | 60 min | sospeso | sospeso | — |
| sync-products | 240 min | sospeso | sospeso | manual only |
| sync-prices | 240 min | sospeso | sospeso | manual only |
| sync-tracking | 15 min | 30 min | sospeso | solo se ordini pending |
| sync-order-states | 5 min | 15 min | sospeso | — |

---

### 2.3 — Scheduler loop senza re-entry

**`setInterval` → `setTimeout` concatenato**: il tick successivo parte solo dopo il completamento del precedente.

```typescript
function startSchedulerLoop(tickFn: () => Promise<void>, intervalMs: number): () => void {
  let active = true;
  const loop = async () => {
    if (!active) return;
    await tickFn().catch(err => logger.error('[scheduler] tick error', { err }));
    if (active) setTimeout(loop, intervalMs);
  };
  setTimeout(loop, intervalMs); // primo tick dopo 1 intervallo
  return () => { active = false; }; // stop function
}
```

**Scheduler tick logic**:
```typescript
async function schedulerTick(): Promise<void> {
  const { active, idle } = getAgentsByActivity();

  for (const userId of [...active, ...idle]) {
    const level = active.includes(userId) ? 'active' : 'idle';

    // Queue pressure: skip enqueue BG se P<=10 pending (stessa soglia EP pickup)
    const { rows: pressureRows } = await pool.query(
      `SELECT 1 FROM system.agent_operation_queue
       WHERE user_id = $1 AND status IN ('enqueued','running') AND priority <= 10 LIMIT 1`,
      [userId],
    );
    if (pressureRows.length > 0) continue;

    for (const syncType of getSyncTypesForLevel(level)) {
      if (syncType === 'sync-tracking' && !await hasOrdersWithPendingTracking(pool, userId)) continue;

      const { rows: [fresh] } = await pool.query<{ last_completed_at: Date }>(
        `SELECT last_completed_at FROM agents.sync_freshness WHERE user_id = $1 AND sync_type = $2`,
        [userId, syncType],
      );
      const target = getTargetFreshnessMs(syncType, level);
      if (!target) continue;

      if (stalenessScore(fresh?.last_completed_at ?? null, target) >= 1.0) {
        await enqueueWithDedup(pool, {
          userId, taskType: syncType as TaskType, payload: {}, priority: 500, requiresBrowser: true,
        }).catch(err => logger.warn('[scheduler] enqueue failed', { syncType, userId, err }));
      }
    }
  }
}
```

---

### 2.4 — Rimozione `smartCustomerSync` scheduler-stop

`smartCustomerSync` attualmente ferma l'intero scheduler quando un utente apre un form. Troppo aggressivo — colpisce tutti i userId, non solo quello in sessione.

**Nuovo comportamento**:
- Apertura form → INSERT in `system.sync_paused_users` (già esiste)
- Scheduler NON si ferma — `pickupNextTask` già esclude P=500 per userId paused
- Chiusura form → DELETE da `sync_paused_users`
- Rimozione delle chiamate `stop()`/`start()` da `smartCustomerSync`
- Il `sessionCount` e `safetyTimeout` diventano obsoleti e vengono rimossi

---

## Fase 3 — Banner UX

### 3.1 — Nuovi campi `TrackedOperation` frontend

```typescript
type TrackedOperation = {
  // ... campi esistenti ...
  priority?: number;           // da JOB_STARTED — mostra peso visivo
  effectivePriority?: number;  // calcolato lato client per ordinamento drawer
  isPreempted?: boolean;       // task BG che è stato preemptato e ripartirà
  runAfter?: number;           // timestamp ms — "riprende tra Xs"
};
```

`JOB_STARTED` broadcast deve includere `priority` dal task. `JOB_QUEUED` deve includere `operationType` e `priority`.

---

### 3.2 — Messaggi specifici per operazioni BG

```typescript
const BG_OP_LABELS: Record<string, { active: string; completed: string }> = {
  'sync-orders':            { active: 'Aggiornamento ordini', completed: 'Ordini aggiornati' },
  'sync-customers':         { active: 'Aggiornamento clienti', completed: 'Clienti aggiornati' },
  'sync-ddt':               { active: 'Aggiornamento DDT', completed: 'DDT aggiornati' },
  'sync-invoices':          { active: 'Aggiornamento fatture', completed: 'Fatture aggiornate' },
  'sync-products':          { active: 'Aggiornamento prodotti', completed: 'Prodotti aggiornati' },
  'sync-prices':            { active: 'Aggiornamento prezzi', completed: 'Prezzi aggiornati' },
  'sync-tracking':          { active: 'Verifica spedizioni', completed: 'Spedizioni verificate' },
  'sync-order-states':      { active: 'Aggiornamento stati', completed: 'Stati aggiornati' },
  'sync-customer-addresses':{ active: 'Aggiornamento indirizzi', completed: 'Indirizzi aggiornati' },
  'sync-order-articles':    { active: 'Caricamento articoli', completed: 'Articoli caricati' },
};
```

### 3.3 — Pressure indicator nel banner BG

- **Pressione alta** (P<=10 op in coda): striscia scura mostra "⏸ Sync automatiche in pausa — operazioni in corso"
- **Pressione nulla**: striscia mostra sync attive o "Tutto aggiornato"

La striscia mostra lo stato della pressure propagato via WebSocket (nuovo evento `QUEUE_PRESSURE_CHANGED`).

### 3.4 — QueueDrawer EP-ordered con sezioni

Il drawer divide in:
1. **"Tue operazioni"** — P<=100, ordinate per `priority` ASC poi `startedAt` ASC
2. **"Automatiche"** — P=500 non preemptati, con stima "riprende tra Xs" se `runAfter` presente
3. **"In pausa"** — N sync soppresse per pressione (solo count, non lista)

### 3.5 — ETA per operazione corrente

Source: `system.bot_task_metrics` (NON `agents.operation_metrics` che non esiste). Query per durata media per `task_type` nelle ultime 50 run completate.

Default hardcoded se metrics insufficienti:
```typescript
const DEFAULT_DURATION_MS: Partial<Record<TaskType, number>> = {
  'submit-order': 45_000, 'edit-order': 30_000,
  'sync-orders': 35_000, 'sync-customers': 50_000,
  'sync-ddt': 80_000, 'sync-invoices': 20_000,
};
```

---

## Migration #083 — checklist completa

```sql
-- 1. Colonna preemption flag
ALTER TABLE system.agent_operation_queue
  ADD COLUMN IF NOT EXISTS preempt_requested BOOLEAN NOT NULL DEFAULT false;

-- 2. Indice pressure check (hot path EP pickup)
CREATE INDEX IF NOT EXISTS idx_aq_user_status_priority
  ON system.agent_operation_queue (user_id, status, priority)
  WHERE status IN ('enqueued', 'running');

-- 3. Tabella freshness
CREATE TABLE IF NOT EXISTS agents.sync_freshness (
  user_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  last_completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sync_type)
);

-- 4. Backfill freshness anti-flood (CROSS JOIN — copre TUTTE le combo)
INSERT INTO agents.sync_freshness (user_id, sync_type, last_completed_at)
SELECT u.user_id, s.sync_type,
  COALESCE(
    (SELECT MAX(completed_at) FROM system.agent_operation_queue
     WHERE user_id = u.user_id AND task_type = s.sync_type AND status = 'completed'),
    NOW()
  )
FROM (SELECT DISTINCT user_id FROM agents.users WHERE active = true) u
CROSS JOIN (VALUES
  ('sync-orders'),('sync-customers'),('sync-ddt'),('sync-invoices'),
  ('sync-products'),('sync-prices'),('sync-tracking'),('sync-order-states')
) s(sync_type)
ON CONFLICT (user_id, sync_type) DO UPDATE SET last_completed_at = EXCLUDED.last_completed_at;
```

---

## Sequenza di implementazione

```
F0-1 ✅  enqueueWithDedup 0A000 fix
F0-2     enqueueTask priority + FOR UPDATE fix (BLOCCANTE per tutto)
F0-3     forceReleaseByUserId in BrowserPool + cablaggio (BLOCCANTE per safety net)
F0-4     PreemptedSignal class + scrapeListView { rows, preempted }
F0-5     sync-customer-addresses: shouldStop nel batch + reliable guard
F0-6     sync-products: guard fuori dal catch interno + worker result.success check
F0-7     sync_freshness update solo per success !== false
F0-8     acquireContext passa task.priority
F0-9     filter combo OrdersAll fix (diagnostics DOM ERP)

Migration #083 (in prod PRIMA di F1-F3)

F1-1     Effective Priority Score in pickupNextTask + indice
F1-2     makeCooperativeShouldStop implementata
F1-3     signalPreemption in enqueueTaskExternal
F1-4     Worker catch PreemptedSignal: re-enqueue + delayed NOTIFY

F2-1     sync_freshness table + Worker update on complete
F2-2     stalenessScore() + startSchedulerLoop() (setTimeout)
F2-3     schedulerTick() con pressure check e freshness query
F2-4     Rimozione smartCustomerSync stop/start

F3-1     TrackedOperation nuovi campi + broadcast priority
F3-2     Label specifiche BG ops
F3-3     Pressure indicator GlobalOperationBanner
F3-4     QueueDrawer EP-ordered 3 sezioni
F3-5     ETA da bot_task_metrics
```

---

## Edge case e invarianti critici

1. **Priority end-to-end**: dopo F0-2, ogni task nel DB ha priority reale. Verificare con `SELECT task_type, priority, COUNT(*) FROM system.agent_operation_queue GROUP BY 1,2 ORDER BY 1,2`.
2. **PreemptedSignal ≠ failure**: `retry_count` invariato, circuit breaker non registra fallimento, no `error_class` settato.
3. **Re-enqueue idempotente**: dedup_key_external → se scheduler ha già accodato nuovo sync stesso tipo, ON CONFLICT lo ignora. Il task preemptato con `run_after` posteriore viene pickuppato dopo quello fresco.
4. **sync-customer-addresses partial batch**: indirizzi scritti per clienti 0..i-1 prima della preemption sono dati validi. Task ripartirà da capo (idempotente) e coprirà tutti.
5. **Safety net race**: usa `task_id` specifico catturato al momento della richiesta preemption — non "qualsiasi P>=500 running" che potrebbe essere un task successivo.
6. **Freshness flood guard**: CROSS JOIN nel backfill garantisce che tutte le combo esistano nella tabella prima del primo tick scheduler.
7. **Delayed NOTIFY 31s**: garantisce wake-up del Worker per task preemptato senza polling stretto. Se il task utente dura >30s, EP=999 impedisce pickup anticipato — corretto per design.

---

## Testing richiesto (TDD — test failing prima dell'implementazione, CLAUDE.md C-1)

- **F0-2**: `enqueueTask({taskType:'submit-order',...})` → `priority === 10` nel DB
- **F0-4**: `isPreemptedSignal(new PreemptedSignal())` === true; non confonde con Error generico
- **F0-5**: `readAltAddresses()` con `reliable:false, addresses:[]` → skip upsert, dati esistenti intatti
- **F1-1**: `pickupNextTask` — P=10 task pickuppato prima di P=500; P=500 con P<=10 pending → non pickuppato
- **F1-2**: `makeCooperativeShouldStop` — mock pool con P<=10 pending → ritorna true; senza → false
- **F2-2**: `stalenessScore(null, X)` === 2.0; `stalenessScore(now-X*0.5, X)` < 1.0; `stalenessScore(now-X*1.1, X)` > 1.0
- **F2-3**: `schedulerTick()` — nessun enqueue se `score < 1.0`; enqueue se `>= 1.0`; nessun enqueue se P<=10 pending
- **F2-3**: scheduler loop — secondo tick parte solo dopo fine primo (no re-entry con mock lento)
- **Migration**: backfill CROSS JOIN copre tutte le combo anche per userId senza history in queue
- **E2E Playwright prod**: submit-order mentre sync-orders running → sync ferma entro 15s, submit completa, sync riprende entro 60s

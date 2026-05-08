# Archibald Priority Engine & Adaptive Scheduler — Design Spec
**Data**: 2026-05-08  
**Obiettivo**: fluidità operativa dell'agente + dati sempre freschi in qualsiasi momento  
**Companion**: `docs/superpowers/session-companion-2026-05-08.md`

---

## Contesto

Il Conductor (migration #082, 2026-05-07) ha introdotto priority lanes (P=10/50/100/500) e browser pool separati (8W+25S slots). Oggi (2026-05-08) è stata completata la migrazione a HTML scraping per orders/customers/ddt/invoices e l'eliminazione di BullMQ.

**Problema centrale**: la priority ordering funziona per task in coda, ma un task P=500 in stato `running` (sync-orders, 20-125s) blocca qualsiasi operazione utente P=10 (submit-order). Non esiste preemption. Inoltre lo scheduler accumula task BG ridondanti senza cooldown né dedup.

**Obiettivo unico**: quando l'utente vuole fare un'azione (submit-order, edit-order, etc.) questa parte immediatamente, indipendentemente da cosa stia girando in background. I dati nella PWA devono essere sempre ragionevolmente freschi.

---

## Fase 0 — Fix obbligatori di correttezza (prerequisiti)

Tutti i fix in questa fase sono **MUST** e devono essere completati e verificati in produzione prima di implementare le fasi 1-3.

### F0-1 — CRITICO: Bug `enqueueWithDedup` (PostgreSQL 0A000) ✅ FIXATO `a5114ff3`

**Causa**: `FOR UPDATE SKIP LOCKED` usato illegalmente dentro una scalar subquery. PostgreSQL lancia `0A000 feature_not_supported`. Rompe tutti i caller: pulsante sync-order-articles, post-op sync dopo ERP write, trigger manuali sync-status. 42 occorrenze in prod.

**Fix applicato** (`a5114ff3`): rimossa la scalar subquery con `FOR UPDATE SKIP LOCKED`, sostituita con `SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM ... WHERE ...` senza locking. La posizione è un hint di ordinamento non critico.

**Verifica post-deploy**: bottone "Aggiorna Articoli" deve tornare funzionale. Log prod non deve più mostrare `0A000`. Post-op sync dopo submit-order deve apparire come `[warn] Post-op sync enqueue failed` scomparso.

---

### F0-2 — CRITICO: Flusso preemption sicuro (PreemptedSignal prima di checkScraperCompleteness)

**Problema**: quando `shouldStop()` verrà attivata (da implementare in F1-2), `scrapeListView` potrebbe restituire dati parziali che superano la soglia 70% di `checkScraperCompleteness` → `syncOrders()` sovrascrive il DB con una vista incompleta dell'ERP.

**Fix richiesto**: `scrapeListView` deve restituire `{ rows: ScrapedRow[], preempted: boolean }`. Se `preempted === true`:
1. Il handler lancia `new PreemptedSignal()` — una classe speciale non-Error
2. Il Worker cattura `PreemptedSignal` e lo tratta separatamente da `application_error`
3. Il task viene re-accodato con `run_after = NOW() + 30s` (senza incrementare `retry_count`)
4. Nessun dato viene scritto nel DB

Questo fix è un **prerequisito di F1-2** (implementazione `shouldStop`).

```typescript
// Flusso sicuro (handler HTML sync)
const result = await scrapeListView(page, config, progressCb, shouldStop);

if (result.preempted) {
  throw new PreemptedSignal(); // Worker cattura e re-enqueue — nessuna scrittura DB
}

await checkScraperCompleteness(pool, tableName, userId, result.rows.length, entityLabel);
await syncXxx({ pool, rows: result.rows, ... });
```

**File da modificare**:
- `src/sync/scraper/list-view-scraper.ts` — ritorna `{ rows, preempted }`
- `src/conductor/worker.ts` — cattura `PreemptedSignal`, re-enqueue con `run_after`
- Tutti i handler HTML: `sync-orders.ts`, `sync-customers.ts`, `sync-ddt.ts`, `sync-invoices.ts`, `sync-prices.ts`

---

### F0-3 — ALTO: sync-customer-addresses silent delete

**Problema**: se ERP risponde lento (>12s), `waitForFunction` va in timeout. Il catch è silenzioso: `readAltAddresses()` ritorna `[]` con `reliable: false`. `upsertAddressesForCustomer` cancella tutti gli indirizzi esistenti del cliente senza inserirne di nuovi.

**Fix richiesto**: in `handleSyncCustomerAddresses`, aggiungere guard prima dell'upsert:
```typescript
const { addresses, reliable } = await bot.readAltAddresses();
if (!reliable && addresses.length === 0) {
  // ERP timeout — skip upsert, preserva dati esistenti
  logger.warn('[sync-customer-addresses] ERP timeout, skip upsert to preserve existing data', { erpId });
  errorsCount++;
  continue;
}
await upsertAddressesForCustomer(pool, userId, erpId, addresses);
await setAddressesSyncedAt(pool, userId, erpId);
```

**File**: `src/operations/handlers/sync-customer-addresses.ts`

---

### F0-4 — MEDIO: sync-products assenza zero-result guard

**Problema**: `sync-products` usa ancora PDF e non ha `checkScraperCompleteness`. Se il PDF è vuoto o corrotto, `syncProducts()` viene chiamato con 0 prodotti e può fare soft-delete di tutti i prodotti.

**Fix richiesto**: aggiungere guard esplicita in `handleSyncProducts`:
```typescript
if (products.length === 0) {
  throw new Error('sync-products: 0 products parsed — aborting to prevent DB overwrite');
}
```

**File**: `src/operations/handlers/sync-products.ts`

---

### F0-5 — BASSO: sync-prices item_selection sempre NULL

**Problema**: il campo `item_selection` non è catturato dallo scraper HTML prezzi. Risultato: sempre NULL in `shared.prices`.

**Fix richiesto**: investigare se `item_selection` è necessario per la business logic (prezzi per quantità? selezione varianti?). Se sì: aggiungere alla colonna config di `prices.ts`. Se no: documentare come "non disponibile da HTML scraper" e aggiungere commento nel codice.

**File**: `src/sync/scraper/configs/prices.ts`, `src/sync/services/price-sync.ts`

---

### F0-6 — INVESTIGAZIONE: sync-customers non gira da 6h

**Osservazione**: sync-customers ha 97 completions oggi ma ultima alle 10:45 UTC (6h fa). Nel frattempo sync-orders/ddt/invoices continuano a girare normalmente. `sync_paused_users` è vuoto.

**Ipotesi**: `smartCustomerSync` ha fermato il scheduler e la ripartenza non ha ripristinato sync-customers correttamente. Oppure il circuit breaker è aperto per questo tipo.

**Azione**: post-deploy, monitorare se sync-customers riprende. Se non riprende entro 30 min dal deploy, investigare i log per capire la causa e aprire bug fix separato.

---

### F0-7 — FIX OBBLIGATORIO: filter combo OrdersAll not found → rischio sincronizzazione parziale

**Problema**: log prod mostra `[scraper] Filter combo not found — no input matches pattern { xafValuePattern: "OrdersAll" }` per sync-orders. La sync completa perché il filtro ERP è attualmente già impostato su "tutti gli ordini" (filtri persistono tra sessioni), ma questo è un **falso positivo di salute**. Se l'ERP resetta il filtro a una vista ristretta (es. "ultimi 30 giorni"), `checkScraperCompleteness` al 70% potrebbe non rilevare il problema e il DB verrebbe aggiornato con ordini parziali.

**Distinzione dal problema customers**: il log post-deploy mostra sync-customers che cambia filtro con successo (`xaf_a2CustomerListViewAgent → All_Customers`). Il selettore di orders usa un pattern diverso (`OrdersAll`) che non trova corrispondenza nel DOM. I due scraper hanno config filter diverse.

**Fix richiesto**:
1. Leggere il DOM ERP della pagina orders per trovare il selettore corretto del combo filtro
2. Aggiornare `ordersConfig.filter.xafValuePattern` con il valore reale
3. Aggiungere log del valore filtro attivo PRIMA dello scraping (per rilevare future derive)
4. Aggiungere test: verifica che `ensureFilterValue` trovi il combo e lo imposti correttamente

**File**: `src/sync/scraper/configs/orders.ts`, `src/sync/scraper/devexpress-utils.ts`

---

## Fase 1 — Priority Engine (Preemption + Effective Priority)

### 1.1 — Effective Priority Score (EP)

La priority non è solo un valore fisso al momento dell'enqueue. Al momento del pickup, viene calcolata una **effective priority** che incorpora contesto dinamico.

**Formula EP** (minore = più urgente):
```
EP(task) = base_weight(taskType)
           / age_bonus(minutesWaiting)
           × pressure_multiplier(userOpsCount)
```

- `base_weight`: valori statici da `TASK_PRIORITY` (P=10/50/100/500)
- `age_bonus`: anti-starvation. `1 + log₂(max(1, minutesWaiting / 5))` — aumenta progressivamente per task in attesa
- `pressure_multiplier`: se userId ha ≥3 ops utente in coda/running → P=500 tasks ricevono EP=999 (soppresso)

**Implementazione**: SQL in `pickupNextTask` sostituisce `ORDER BY priority ASC` con `ORDER BY effective_priority ASC` calcolata inline.

```sql
ORDER BY (
  aoq.priority::float
  / GREATEST(1.0, 1.0 + LOG(2, GREATEST(1, EXTRACT(EPOCH FROM (NOW() - aoq.enqueued_at)) / 300.0)))
  * CASE
      -- Soglia P<=10 (solo ERP write): post-op sync-order-articles P=50 NON deve sopprimere
      -- altri BG — EP ordering già garantisce che P=50 venga prima di P=500.
      -- Soppressione EP=999 si attiva solo per operazioni write reali (submit/edit/delete/etc.)
      -- per massimizzare throughput totale senza rallentare il drain della coda.
      WHEN aoq.priority >= 500 AND (
        SELECT COUNT(*) FROM system.agent_operation_queue q2
        WHERE q2.user_id = aoq.user_id
          AND q2.status IN ('enqueued', 'running')
          AND q2.priority <= 10
      ) >= 1 THEN 999.0
      ELSE 1.0
    END
) ASC,
aoq.enqueued_at ASC
```

**Note**: questa formula rimane semplice (no ML, no state esterno). Estendibile in futuro con ulteriori segnali.

---

### 1.2 — Cooperative Preemption con Safety Net (Approccio C)

**Meccanismo primario — cooperative**:

Implementare `makeCooperativeShouldStop` in `html-sync-utils.ts` (attualmente stub `() => false`):

```typescript
export function makeCooperativeShouldStop(pool: DbPool, userId: string): () => Promise<boolean> {
  return async () => {
    const { rows } = await pool.query(
      `SELECT 1 FROM system.agent_operation_queue
       WHERE user_id = $1 AND status = 'enqueued' AND priority <= 100
         AND (run_after IS NULL OR run_after <= NOW())
       LIMIT 1`,
      [userId],
    );
    return rows.length > 0;
  };
}
```

Il `scrapeListView` chiama `shouldStop()` tra ogni pagina scraped. Se ritorna `true`:
1. Imposta `result.preempted = true`
2. Ritorna immediatamente senza proseguire la paginazione
3. Il handler vede `preempted=true` → lancia `PreemptedSignal` (F0-2)

**Latenza tipica**: tempo di fine pagina corrente (max 10-15s per pagine lente).

---

**Safety net — hard close dopo 15s**:

Nel Conductor Dispatcher, quando un task P≤100 viene accodato per un userId che ha un task P≥500 in stato `running`:

```typescript
// In Conductor.enqueueHighPriorityTask() — nuovo metodo
private async signalPreemption(userId: string): Promise<void> {
  // Aggiorna il flag preempt_requested nel DB
  await this.deps.pool.query(
    `UPDATE system.agent_operation_queue
     SET preempt_requested = true
     WHERE user_id = $1 AND status = 'running' AND priority >= 500`,
    [userId],
  );
  
  // Safety net: se dopo 15s lo STESSO task specifico è ancora running, chiudi il context.
  // IMPORTANTE: catturare task_id specifico qui — non "qualsiasi P>=500 running" che
  // potrebbe essere un task diverso iniziato dopo (regressione: chiuderebbe context innocente).
  const { rows: runningRows } = await this.deps.pool.query<{ task_id: string }>(
    `SELECT task_id FROM system.agent_operation_queue
     WHERE user_id = $1 AND status = 'running' AND priority >= 500
     LIMIT 1`,
    [userId],
  );
  if (runningRows.length === 0) return; // già completato, nessun safety net necessario

  const targetTaskId = runningRows[0].task_id;
  setTimeout(async () => {
    const { rows } = await this.deps.pool.query(
      `SELECT 1 FROM system.agent_operation_queue
       WHERE task_id = $1 AND status = 'running'`, // controlla SOLO il task specifico
      [targetTaskId],
    );
    if (rows.length > 0) {
      await this.deps.releaseBrowserContext(userId); // forza CDP close solo se ancora running
    }
  }, 15_000);
}
```

**Migration richiesta** (#083): aggiungere colonna `preempt_requested BOOLEAN DEFAULT false` a `system.agent_operation_queue`.

**Aggiornamenti tipo richiesti**: `TaskRow` in `conductor/types.ts` + `mapRow()` in `agent-queue.ts` devono includere `preemptRequested: boolean`.

---

### 1.3 — Re-enqueue del task preemptato

**`PreemptedSignal` deve estendere `Error`** con un discriminator tag per instanceof sicuro nel Worker:

```typescript
export class PreemptedSignal extends Error {
  readonly tag = 'preempted' as const;
  constructor() { super('Task preempted by higher-priority operation'); }
}

// Type guard sicuro
function isPreemptedSignal(err: unknown): err is PreemptedSignal {
  return err instanceof PreemptedSignal && err.tag === 'preempted';
}
```

Il Worker, al posto di `failTask`, chiama `reEnqueuePreempted`:

```typescript
// worker.ts — catch di PreemptedSignal
if (err instanceof PreemptedSignal) {
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
  // Non incrementa retry_count. Non è un fallimento.
  return;
}
```

Il task BG viene ri-accodato con `run_after = NOW() + 30s` — riprende ~30s dopo il completamento del task utente, senza aspettare il prossimo tick dello scheduler (potenzialmente 20-60 min).

---

## Fase 2 — Adaptive Scheduler

### 2.1 — Staleness Scoring Function

Lo scheduler non usa più `setInterval` fisso per tipo. Ogni 60s valuta per ogni (syncType, userId) uno **staleness score**:

```typescript
function stalenessScore(lastSyncAt: Date | null, targetFreshnessMs: number): number {
  if (!lastSyncAt) return 2.0; // mai sincronizzato → urgente
  const ageMs = Date.now() - lastSyncAt.getTime();
  return ageMs / targetFreshnessMs;
  // 0 = appena sincronizzato, 1 = alla soglia, >1 = scaduto → enqueue
}
```

**Flood guard al primo deploy** (migration #083): la tabella `sync_freshness` inizialmente vuota causerebbe `stalenessScore = 2.0` per ogni (userId, syncType) al primo tick → flood. La migration deve includere un backfill:

```sql
INSERT INTO agents.sync_freshness (user_id, sync_type, last_completed_at)
SELECT user_id, task_type,
  -- COALESCE → NOW() per combo senza storia (retention queue scaduta, o mai girato):
  -- tratta come "appena sincronizzato" per evitare flood al primo tick post-deploy.
  COALESCE(MAX(completed_at), NOW()) as last_completed_at
FROM system.agent_operation_queue
WHERE status = 'completed'
  AND task_type IN ('sync-orders','sync-customers','sync-ddt','sync-invoices',
                    'sync-products','sync-prices','sync-tracking','sync-order-states')
GROUP BY user_id, task_type
ON CONFLICT (user_id, sync_type) DO UPDATE SET last_completed_at = EXCLUDED.last_completed_at;
```

Questo popola la tabella con i dati storici esistenti prima che lo scheduler parta.

**Target freshness per tipo e attività utente**:

| Tipo | Active (<2h) | Idle (2-24h) | Offline (>24h) | Trigger reattivo |
|------|-------------|-------------|----------------|-----------------|
| sync-orders | 20 min | 60 min | sospeso | post-op P=100 |
| sync-customers | 30 min | 120 min | sospeso | post-op P=100 |
| sync-ddt | 60 min | sospeso | sospeso | — |
| sync-invoices | 60 min | sospeso | sospeso | — |
| sync-products | 240 min | sospeso | sospeso | manual only |
| sync-prices | 240 min | sospeso | sospeso | manual only |
| sync-tracking | 15 min | 30 min | sospeso | solo se ordini pending |
| sync-order-states | 5 min | 15 min | sospeso | — |

**Implementazione tick**: usare `setTimeout` concatenato (non `setInterval`) per evitare re-entry se la DB è lenta (active+idle × 8 sync types × N query → potenzialmente >60s). Il tick successivo parte solo dopo che quello precedente è completato:

```typescript
async function startSchedulerLoop(): Promise<void> {
  let active = true;
  const loop = async () => {
    if (!active) return;
    await schedulerTick().catch(err => logger.error('[scheduler] tick error', { err }));
    if (active) setTimeout(loop, SCHEDULER_TICK_MS); // prossimo tick solo dopo completamento
  };
  setTimeout(loop, SCHEDULER_TICK_MS);
  return () => { active = false; }; // stop function
}
```

**Logica di enqueue per tick**:
```typescript
async function schedulerTick(): Promise<void> {
  const { active, idle } = getAgentsByActivity();
  
  for (const userId of [...active, ...idle]) {
    const activityLevel = active.includes(userId) ? 'active' : 'idle';
    
    // Queue pressure check: skip BG enqueue se userId ha >=1 op ERP write (P<=10) in coda.
    // Allineato alla soglia EP: P=50 (post-op sync-order-articles) non sopprime BG — EP basta.
    const hasPendingUserOps = await checkUserQueuePressure(pool, userId); // P<=10 count >= 1
    if (hasPendingUserOps) continue;
    
    for (const syncType of ALL_SYNC_TYPES) {
      const target = getTargetFreshness(syncType, activityLevel);
      if (!target) continue; // sospeso per questo livello attività
      
      // Skip sync-tracking se no ordini con tracking pending
      if (syncType === 'sync-tracking' && !await hasOrdersWithPendingTracking(pool, userId)) continue;
      
      const lastSyncAt = await getLastSyncCompletedAt(pool, userId, syncType);
      const score = stalenessScore(lastSyncAt, target);
      
      if (score >= 1.0) {
        await enqueueWithDedup(pool, {
          userId, taskType: syncType, payload: {}, priority: 500,
          requiresBrowser: true,
        });
      }
    }
  }
}
```

---

### 2.2 — dedup_key_external obbligatoria per tutti gli enqueue scheduler

Tutti gli enqueue dallo scheduler usano `enqueueWithDedup` con `dedup_key_external = buildDedupKey(syncType, userId, {})`. L'indice parziale `WHERE status IN ('enqueued', 'running') AND dedup_key_external IS NOT NULL` garantisce che non si accumuli lo stesso sync type due volte.

Il problema attuale (scheduler usa `enqueue` senza dedup che bypassa `enqueueWithDedup`) viene risolto unificando tutto su `enqueueWithDedup`.

---

### 2.3 — Rimozione smartCustomerSync scheduler-stop

`smartCustomerSync` nel sync-scheduler attualmente ferma **l'intero scheduler** quando un utente apre un form ordine. Questo è troppo aggressivo.

**Nuovo comportamento**:
- Alla login/apertura form: aggiunge userId a `sync_paused_users` (già esistente)
- Lo scheduler NON si ferma — continua per altri userId
- `pickupNextTask` già esclude P=500 per userId paused
- Al logout/chiusura form: rimuove da `sync_paused_users`
- Rimozione di `stop()`/`start()` da `smartCustomerSync`

---

### 2.4 — last_sync_completed_at per tipo

Per supportare lo staleness scoring serve tracciare quando ogni sync type è stato completato l'ultima volta per ogni userId.

**Migration #083** aggiunge tabella:
```sql
CREATE TABLE IF NOT EXISTS agents.sync_freshness (
  user_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  last_completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sync_type)
);
```

Il Worker aggiorna questa tabella al completamento di ogni sync task (in `worker.ts`, dopo `completeTask`).

---

## Fase 3 — Banner UX

### 3.1 — Messaggi specifici per operazioni BG

Sostituire le label generiche con messaggi contestuali:

```typescript
const BG_OP_LABELS: Record<string, string> = {
  'sync-orders': 'Aggiornamento ordini',
  'sync-customers': 'Aggiornamento clienti',
  'sync-ddt': 'Aggiornamento DDT',
  'sync-invoices': 'Aggiornamento fatture',
  'sync-products': 'Aggiornamento prodotti',
  'sync-prices': 'Aggiornamento prezzi',
  'sync-tracking': 'Verifica spedizioni',
  'sync-order-states': 'Aggiornamento stati ordini',
  'sync-customer-addresses': 'Aggiornamento indirizzi',
  'sync-order-articles': 'Caricamento articoli ordine',
};
```

### 3.2 — Indicatore pressione nel banner BG

La striscia BG del GlobalOperationBanner mostra:
- Quando pressione alta (≥3 user ops): "⏸ Sync automatiche in pausa" con colore neutro
- Quando pressione media (1-2 user ops): "Sync ridotte — operazioni in corso"
- Quando pressione bassa: lista sync attive/in coda

### 3.3 — QueueDrawer EP-ordered

Il QueueDrawer ordina i task per effective priority (EP) e li divide in sezioni:
1. **"Tue operazioni"** — P≤100, ordinate per EP
2. **"Automatiche in coda"** — P=500 non soppressi, con ETA stimata
3. **"In pausa"** — P=500 soppressi per pressione alta, mostrati come "N in attesa"

### 3.4 — ETA per operazione corrente

Aggiungere ETA stimata basata su durate storiche (da `agents.operation_metrics` se disponibile, altrimenti valori di default per tipo):

```typescript
const DEFAULT_DURATION_MS: Record<string, number> = {
  'submit-order': 45_000,
  'sync-orders': 35_000,
  'sync-customers': 50_000,
  'sync-ddt': 80_000,
  'sync-invoices': 20_000,
  // ...
};
```

---

## Migration Plan

### Migration #083 (da creare)

```sql
-- Colonna preemption flag
ALTER TABLE system.agent_operation_queue
  ADD COLUMN IF NOT EXISTS preempt_requested BOOLEAN NOT NULL DEFAULT false;

-- Tabella staleness tracking
CREATE TABLE IF NOT EXISTS agents.sync_freshness (
  user_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  last_completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sync_type)
);
```

---

## Sequenza di implementazione

```
F0-1 ✅ enqueueWithDedup 0A000 fix (pushato a5114ff3)
F0-2    PreemptedSignal + scrapeListView { rows, preempted }
F0-3    sync-customer-addresses reliable guard
F0-4    sync-products zero-result guard
F0-5    sync-prices item_selection investigation
F0-6    Monitor sync-customers post-deploy
F0-7    Filter combo OrdersAll investigation

Migration #083

F1-1    Effective Priority Score in pickupNextTask
F1-2    makeCooperativeShouldStop implementata
F1-3    PreemptedSignal handler in Worker (re-enqueue run_after=30s)
F1-4    Safety net 15s in Conductor dispatcher

F2-1    sync_freshness table + Worker update on complete
F2-2    stalenessScore() + schedulerTick() nuovo
F2-3    Rimozione smartCustomerSync scheduler-stop
F2-4    dedup_key_external su tutti gli enqueue scheduler

F3-1    Label specifiche BG ops
F3-2    Pressure indicator in GlobalOperationBanner
F3-3    EP-ordered QueueDrawer
F3-4    ETA display
```

---

## Edge case e invarianti critici

1. **PreemptedSignal non conta come failure**: `retry_count` non si incrementa, `error_class` non viene settato, circuit breaker non registra fallimento
2. **Re-enqueue idempotente**: il task preemptato re-accodato con `run_after=+30s` usa `dedup_key_external` — se lo scheduler ha già accodato un nuovo sync dello stesso tipo, quello vince per FIFO (stessa priority, enqueued_at precedente)
3. **Checkscaper completeness non tocca mai dati parziali**: il PreemptedSignal garantisce che nessun dato parziale raggiunga mai i sync service
4. **Pressure check asincrono**: la query per il pressure check in `schedulerTick` è read-only e leggera — OK a 60s tick
5. **Safety net 15s è best-effort**: se il browser context close fallisce, il task continua finché non completa naturalmente. Il P=10 task è già in coda e partirà immediatamente dopo

---

## Testing richiesto (TDD — test prima dell'implementazione per ogni task, CLAUDE.md C-1)

Per ogni task di implementazione: scrivere il test failing PRIMA del codice. Ordine: stub → test failing → implementazione.

- Unit test `stalenessScore()`: boundary null (→2.0), score=0, score=0.5, score=1.0 (soglia), score=1.5 (enqueue)
- Unit test `makeCooperativeShouldStop`: mock pool, verifica → true se P<=50 pending, false altrimenti
- Unit test `isPreemptedSignal()`: instanceof corretto, tag check, distingue da Error generico
- Integration test `enqueueWithDedup`: posizione incrementa con enqueue concorrente, no regressione 0A000
- Integration test `pickupNextTask` con EP scoring: P=10 prima di P=500 anche con starvation; P=500 → EP=999 se P<=50 pending
- Integration test scheduler tick: no enqueue se `stalenessScore < 1.0`; enqueue se `>= 1.0`; no flood su restart (backfill migration)
- E2E Playwright prod: submit-order mentre sync-orders running → sync ferma entro 15s, submit completa, sync riprende entro 60s

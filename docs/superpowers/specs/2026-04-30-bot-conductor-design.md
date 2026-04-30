# Bot Conductor — Design Spec

**Data**: 2026-04-30
**Autore**: Claude (sessione brainstorming con Francesco)
**Stato**: Approvato per implementazione

## 1. Visione e principi

### 1.1 Principio fondamentale

> **La PWA si sovrappone all'ERP, non ne cambia il metodo di utilizzo.** Un agente Komet su ERP fa una sola operazione di scrittura alla volta fino al completamento. La PWA rispetta questo invariante per ogni `userId`, ma aggiunge le possibilità di astrazione che l'ERP non può offrire: batch, asincronia, accodamento durabile, telemetria, ottimizzazione delle ridondanze.

### 1.2 Le 4 garanzie del Conductor

1. **Serializzazione per agente.** Un solo `userId` → una sola operazione di scrittura ERP in volo. Le altre attendono in fila ordinata, deterministicamente.
2. **Atomicità.** Se un'operazione completa su ERP, esiste garantitamente anche nel nostro DB con i dati corretti. Niente race condition, niente stati intermedi visibili.
3. **Durabilità.** Le operazioni accodate sopravvivono a refresh, chiusura PWA, crash backend, riavvio container. Una volta confermate, vengono eseguite, sempre.
4. **Trasparenza.** L'utente vede sempre cosa sta succedendo, senza dettagli tecnici. Banner globale "coccola operativa".

### 1.3 Vincoli operativi (regole d'oro)

- **Letture per `userId` X**: in pause durante una scrittura attiva di X (rispetta il modello ERP).
- **Letture per altri `userId`**: in parallelo, OK (sessioni ERP separate).
- **Sync condivise (`service-account`)**: in pause se ANY agente ha una scrittura attiva, con starvation guard (timeout massimo per evitare di non girare mai).
- **Tutte le scritture ERP** (submit-order, send-to-verona, edit-order, delete-order, batch-*): instradate sul Conductor.

### 1.4 Misurazione del valore (Komet)

L'obiettivo commerciale è dimostrare che durante il "tempo di trasferimento" (T_bot) **l'utente PUÒ iniziare un nuovo ordine** (lo accoda). La metrica end-to-end (Komet) viene scomposta in:

- `T_ui`: tempo agente attivo sul form (compilazione)
- `T_queue`: tempo task in coda
- `T_bot`: tempo bot autonomo
- `T_e2e = T_ui + T_queue + T_bot`

Il differenziale di valore è il **rapporto** T_ui / T_e2e: più piccolo è, più l'agente è libero di lavorare ad altro.

---

## 2. Architettura

### 2.1 Componenti

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (PWA)                               │
│                                                                      │
│  /pending          /orders              GlobalBanner                │
│  click "Invia"  →  POST /api/agent-queue/submit                     │
│                              │                                       │
│                              ▼                                       │
│                       WS JOB_PROGRESS  ←─────┐                       │
└──────────────────────────────│───────────────│──────────────────────┘
                               │               │
                               ▼               │
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Node.js)                            │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │   Conductor Dispatcher (singleton in-process)              │    │
│  │   ─ wakeup loop on Postgres LISTEN/NOTIFY                  │    │
│  │   ─ per-userId serialization                                │    │
│  │   ─ heartbeat persistence                                   │    │
│  │   ─ circuit breaker per-userId (ERP unreachable)           │    │
│  │   ─ auto-recovery on restart                                │    │
│  └────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│           ┌──────────────────┼──────────────────┐                    │
│           ▼                  ▼                  ▼                    │
│      Worker user_A      Worker user_B      Worker user_C             │
│                                                                      │
│  ─ ogni worker tiene il suo bot caldo (chain immediato)             │
│  ─ scrive metriche per task + per fase                              │
│  ─ broadcast WS al frontend                                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       PostgreSQL                                    │
│                                                                      │
│  system.agent_operation_queue   ← fila persistente, fonte di verità │
│  system.agent_circuit_state     ← stato circuit breaker per agent   │
│  system.bot_task_metrics        ← metriche per task                 │
│  system.bot_phase_metrics       ← metriche per fase                 │
│  system.ui_operation_intents    ← telemetria UI temporanea          │
│  agents.order_records (+ campi nuovi)                               │
│  agents.order_verification_snapshots (esistente, riusato)           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (scrittura via bot Puppeteer)
┌─────────────────────────────────────────────────────────────────────┐
│                       ERP Archibald (4.231.124.90)                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 State machine task

```
   ENQUEUED ──► RUNNING ──► COMPLETED
                  │  ▲
                  │  │
                  ▼  │
             FAILED ◄┘ (retry, max 3)
                  │
                  ▼
             CANCELLED (utente)
```

Stati persistenti in `system.agent_operation_queue.status`:
- `enqueued`: in attesa, fila ordinata da `position` ASC poi `enqueued_at` ASC
- `running`: il dispatcher l'ha presa, sta lavorando, `heartbeat_at` aggiornato ogni 30s
- `failed`: tentativi esauriti per quella task, attende intervento utente
- `completed`: terminata con successo
- `cancelled`: l'utente ha cancellato dalla coda

### 2.3 Sostituisce / non tocca

**Sostituisce:**
- Routing `bot-queue` BullMQ per `submit-order`, `send-to-verona`, `edit-order`, `delete-order`, `batch-send-to-verona`, `batch-delete-orders`
- Logica `agentLock.acquire/release` con i requeue MAX_REQUEUE
- `Promise.all` enqueue parallelo del frontend per batch

**Non tocca:**
- Code BullMQ `agent-sync`, `enrichment`, `shared-sync` (continuano per le sync periodiche e le letture di cataloghi)
- `BrowserPool` (riusato così com'è, con la nuova pause durante scritture per stesso userId)
- WebSocket infrastruttura (riusiamo `JOB_PROGRESS`, `JOB_COMPLETED`, `JOB_FAILED`, ne aggiungiamo per la coda)
- La maggioranza del codice `archibald-bot.ts` (15k righe), tocchiamo solo i punti di atomicità

---

## 3. Atomicità del nuovo flow `submit-order`

### 3.1 Sequenza precisa

```
┌─ Conductor (worker user_X) ───────────────────────────────────┐
│                                                                │
│  1. Pickup task da agent_operation_queue (status='enqueued')  │
│  2. UPDATE status='running', started_at=now(), heartbeat_at=now()│
│  3. Acquire BrowserContext (cached o nuovo)                   │
│  4. Pre-check anti-duplicato:                                  │
│     - Se task ha pendingOrderId, cerca su ERP ListView ordini │
│       recenti (ultime 2h) per stesso cliente con stesso        │
│       num_articles. Se match: considera già piazzato,          │
│       skippa direttamente allo step 6 con quell'orderId.       │
│  5. Bot esegue: login + navigation + form + articoli + save    │
│  6. Bot estrae orderId da URL ERP (es. '53.805')               │
│  7. UPDATE queue SET phase='erp_save_done', erp_order_id=$1   │ ◄── PUNTO FERMO
│                                                                │
│  ┌─ pool.withTransaction (ATOMICO) ───────────────────────┐   │
│  │  INSERT order_records (stub completo, dati PWA)         │   │
│  │    + delivery_address_id + delivery_address_snapshot   │   │
│  │  INSERT order_articles (snapshot articoli + prezzi)     │   │
│  │  INSERT order_verification_snapshot                     │   │
│  │  UPDATE fresis_history.archibald_order_id (se Fresis)   │   │
│  │  batchTransfer warehouse reservations (se applicabile)  │   │
│  │  DELETE pending_orders                                   │   │
│  │  COMMIT                                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  8. UPDATE queue SET phase='db_committed'                      │
│                                                                │
│  ┌─ Verifica ERP (NON-FATALE, ogni step in try/catch) ────┐   │
│  │  readOrderHeaderExtended → UPDATE optional fields       │   │
│  │   (orderNumber, deliveryDate, deliveryName,            │   │
│  │    deliveryAddress, salesStatus, documentStatus,       │   │
│  │    transferStatus, customer_reference)                 │   │
│  │  performInlineOrderSync → verifyOrderArticles           │   │
│  │  if mismatch: UPDATE verification_status,               │   │
│  │             broadcast VERIFICATION_RESULT               │   │
│  │  if errore tecnico: verification_status='pending',      │   │
│  │             il sync periodico recupererà                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  9. UPDATE queue SET status='completed', completed_at=now()    │
│ 10. Broadcast WS JOB_COMPLETED                                  │
│ 11. Check coda non vuota → next task (chain hot, no close)     │
│     Else → release BrowserContext, idle                        │
└────────────────────────────────────────────────────────────────┘
```

**Garanzia chiave**: dopo lo step 7 (`phase='erp_save_done'`), l'ordine ESISTE su ERP e abbiamo persistito l'erp_order_id. La transazione del passo 7 è una mini-transazione propria seguita immediatamente dalla transazione `withTransaction` del passo successivo. Tra le due c'è una finestra <50ms; se il backend crasha lì, il recovery on restart usa `phase='erp_save_done'` con `erp_order_id` valorizzato per completare l'INSERT idempotente.

### 3.2 Pre-check anti-duplicato (step 4)

Prima di iniziare il piazzamento, il bot verifica se un ordine simile è già stato piazzato (caso recovery di task ri-eseguita post-crash):

```typescript
async function preCheckDuplicate(
  bot: ArchibaldBot,
  pendingOrderId: string,
  customerId: string,
  numArticles: number,
): Promise<string | null> {
  const recentOrders = await bot.scrapeRecentOrders({
    customerId,
    sinceHours: 2,
  });
  
  const match = recentOrders.find(
    (o) => o.numArticles === numArticles && o.customerInternalId === customerId,
  );
  
  return match?.orderId ?? null;
}
```

Se ritorna un orderId, salta direttamente al passo 7 con quell'ID.

### 3.3 Auto-recovery on restart

Quando il backend riparte (deploy, crash, kill):

```sql
SELECT * FROM system.agent_operation_queue
WHERE status = 'running' 
  AND heartbeat_at < now() - INTERVAL '60 seconds';
```

Per ogni "running orphan", il dispatcher esamina `phase`:

- `phase IS NULL` o `phase='in_progress'`: il bot non aveva ancora salvato. **Re-enqueue** della task come nuova, `status='enqueued'`. Pre-check anti-duplicato al pickup.
- `phase='erp_save_done'` con `erp_order_id` valorizzato: l'ordine È su ERP. **Riprende dal passo successivo (`withTransaction` INSERT order_records)** con INSERT idempotenti (`ON CONFLICT (id, user_id) DO NOTHING`). Il bot non viene rilanciato — solo la parte DB-side del flow.
- `phase='db_committed'`: tutto OK, manca solo verifica. Re-enqueue come task `enrichment` separata (non bloccante).
- `phase='completed'`: marca come `completed`.

L'utente non si accorge mai del crash se il restart avviene in <60s.

---

## 4. Bot lifecycle — Hot intelligente

### 4.1 Comportamento

Quando una task completa lo step 9, il worker fa subito:

```sql
SELECT id, type, payload FROM system.agent_operation_queue
WHERE user_id = $1 AND status = 'enqueued'
ORDER BY position ASC, enqueued_at ASC
LIMIT 1;
```

- **Se trova una task ("chain")**: pickup immediato. Il `BrowserContext` resta aperto e il bot riusa la stessa pagina ERP. Il bot fa solo `navigateToOrdersList()` (~3s) skippando `validateSession` (la sessione è appena stata utilizzata, è certamente valida).
- **Se non trova**: `await browserPool.releaseContext(userId, context, true)`, worker entra in idle. Cold start al prossimo pickup (login + navigation completi).

### 4.2 Risparmio atteso

Per batch di 5 ordini: ~25s × 4 = ~100s recuperati (eliminazione 4 cold start).
Per ordine 12 articoli su batch di 3: ~5 min totali risparmiati.

---

## 5. ERP down handling — Hybrid C

### 5.1 Per-task retry (errori applicativi)

Errori applicativi (articolo non in catalogo, cliente non trovato, P.IVA invalida, DOM bloat CDP timeout, navigation parziale): retry interno della task con backoff `10s → 30s → 60s`. Max 3 tentativi.

Se i 3 falliscono: task → `status='failed'`, `error_class='application_error'`. La coda procede con la prossima. Banner mostra l'errore con [Riprova] / [Cancella].

### 5.2 Circuit breaker per-userId (ERP unreachable)

Se la task fallisce per errore di infrastruttura (login fallisce, network error, certificate, 503): contatore `consecutive_erp_failures` in `system.agent_circuit_state`. Quando arriva a 3 → `circuit_open`.

Durante `circuit_open`: il worker dell'agente in pause. Banner: "ERP non raggiungibile, riprovo automaticamente tra 5 min". Probe ogni 5 min (HTTP HEAD a `https://4.231.124.90/Archibald/`). Se 200/302 → `circuit_half_open`, prima task della coda parte. Se OK → `circuit_closed`. Se fallisce → ritorna `circuit_open`, prossimo probe in 5 min.

### 5.3 Classificazione errori

```typescript
function classifyError(err: Error): 'erp_unreachable' | 'application_error' {
  const msg = err.message.toLowerCase();
  if (
    msg.includes('econnrefused') ||
    (msg.includes('etimedout') && msg.includes('login')) ||
    msg.includes('certificate') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('500')
  ) {
    return 'erp_unreachable';
  }
  return 'application_error';
}
```

---

## 6. UI — Banner globale e modali

### 6.1 Banner collapsed (default)

```
─────────────────────────────────────────────────────────────────────
 ⚙ 3 operazioni in lavorazione · 1 di 3 completata · ████░░ 35%   ▲
─────────────────────────────────────────────────────────────────────
```

- Click su ▲ o sul testo → espande la tendina (animazione slide-up 0.3s).
- Auto-collapse dopo 10s di inattività se nessuna interazione.

### 6.2 Banner expanded

```
─────────────────────────────────────────────────────────────────────
 Coda di lavoro                                              [✕] ▼
─────────────────────────────────────────────────────────────────────
 ✓ Piazza ordine — Dr. Tedesco Mario              completato · 14:55
 ⚙ Piazza ordine — Studio Innamorato       ████████░ 78%  · in corso
 ⏳ Piazza ordine — Clinica Giordano                       in attesa
 ⏳ Invia a Verona — Dr. Pucciarelli                       in attesa
─────────────────────────────────────────────────────────────────────
```

Lista scrollabile, max altezza 60vh. Click su una riga → naviga alla pagina pertinente (cliente, ordine).

### 6.3 Etichette in linguaggio comune

| Backend task type | Etichetta UI |
|---|---|
| `submit-order` | "Piazza ordine — {nomeCliente}" |
| `send-to-verona` | "Invia a Verona — {nomeCliente}" |
| `edit-order` | "Modifica ordine — {nomeCliente}" |
| `delete-order` | "Elimina ordine — {nomeCliente}" |
| `batch-send-to-verona` | "Invia a Verona ({n} ordini)" |
| `batch-delete-orders` | "Elimina {n} ordini" |

Stati:
- ⏳ `enqueued` → "in attesa"
- ⚙ `running` → "in corso · {%}"
- ✓ `completed` → "completato · {ora}"
- ⚠ `failed application_error` → "errore — riprova" (con [Riprova] [Cancella])
- 🔌 circuit aperto → "ERP non raggiungibile · prossimo tentativo {time}"

### 6.4 Posizionamento non-occlusivo

**Vincoli vincolanti**:
- Banner collapsed: 44px fixed bottom. `app-main` ha `padding-bottom: calc(44px + env(safe-area-inset-bottom))` quando il banner è presente.
- Banner expanded: padding aumenta proporzionalmente all'altezza tendina (max 60vh).
- Z-index banner: `1100`. Z-index modal: `1200+`. Modal sempre sopra.
- Modal con backdrop: aggiunge un overlay sopra il banner.
- iPhone con home indicator: rispetto `safe-area-inset-bottom`.

**Audit obbligatorio in fase implementazione**: ogni pagina principale (`/`, `/pending`, `/orders`, `/customers`, `/articoli`, `/profilo`, `/storico-fresis`) e ogni modal testati con banner attivo per zero overlap.

### 6.5 Preflight pending vecchi

Trigger: click "Invia" sul pending (o "Invia tutti" sul batch).

Endpoint backend `GET /api/pending/:id/preflight`:

```typescript
async function preflightPending(pendingId: string): Promise<PreflightResult> {
  const lastProductSync = await getLastSyncRunAt('sync-products');
  const pending = await getPendingOrder(pendingId);

  if (lastProductSync < pending.confirmed_at) {
    return { changes: [] };
  }

  const changes: PreflightChange[] = [];
  for (const item of pending.items) {
    const currentProduct = await getProduct(item.articleId);
    const currentPrice = await getCurrentUnitPrice(item.articleId, pending.customerId);

    if (!currentProduct) {
      changes.push({
        type: 'discontinued',
        item,
        suggestedAlternative: await findVariantAlternative(item.articleCode),
      });
    } else if (Math.abs(currentPrice - item.price) > 0.01) {
      changes.push({
        type: 'price_changed',
        item,
        oldPrice: item.price,
        newPrice: currentPrice,
      });
    }
  }

  return { changes };
}
```

Modal con riepilogo unico per batch. Default: "Mantieni prezzo concordato col cliente". Override con click esplicito.

---

## 7. Telemetria UI per metrica Komet

### 7.1 Eventi WebSocket

```typescript
// Apertura form
ws.send({
  event: 'UI_OPERATION_STARTED',
  intentId: uuid(),
  type: 'new-order' | 'edit-pending',
  customerId: '1002328',
  customerName: 'Fresis Soc Cooperativa',
  pendingOrderId: existingPendingId, // null se nuovo
  timestamp: Date.now(),
});

// Click "Conferma" che crea/aggiorna il pending
ws.send({
  event: 'UI_OPERATION_COMPLETED',
  intentId: uuid_inviato_prima,
  pendingOrderId: createdOrUpdatedPendingId,
  timestamp: Date.now(),
});
```

### 7.2 Tabella `system.ui_operation_intents`

`UI_OPERATION_STARTED` → INSERT row con `ui_started_at = timestamp`.
`UI_OPERATION_COMPLETED` → UPDATE `ui_completed_at` WHERE `intent_id = $1`.
Cleanup giornaliero DELETE WHERE `expires_at < now()`.

### 7.3 Aggregazione su submit-order

Quando l'utente clicca "Invia" e la task entra nella coda:

```sql
SELECT 
  MIN(ui_started_at) AS first_open,
  MAX(ui_completed_at) AS last_save,
  SUM(EXTRACT(EPOCH FROM (ui_completed_at - ui_started_at)) * 1000)::BIGINT AS active_ms
FROM system.ui_operation_intents 
WHERE pending_order_id = $1
  AND ui_completed_at IS NOT NULL;
```

Scrive in `bot_task_metrics`:
- `ui_started_at = first_open`
- `ui_completed_at = last_save`
- `ui_duration_ms = active_ms` (somma sessioni UI)

---

## 8. Schema DB — Migration

### 8.1 Migration `073_order_records_delivery_address.sql`

```sql
BEGIN;

ALTER TABLE agents.order_records 
  ADD COLUMN delivery_address_id INTEGER NULL,
  ADD COLUMN delivery_address_snapshot JSONB NULL;

COMMENT ON COLUMN agents.order_records.delivery_address_id IS 
  'FK opzionale a agents.customer_addresses.id se delivery != indirizzo principale cliente';
COMMENT ON COLUMN agents.order_records.delivery_address_snapshot IS 
  'Snapshot JSON dell''indirizzo al momento del piazzamento (resiste a modifiche successive)';

CREATE INDEX idx_order_records_delivery_address 
  ON agents.order_records (user_id, delivery_address_id) 
  WHERE delivery_address_id IS NOT NULL;

COMMIT;
```

### 8.2 Migration `074_agent_operation_queue.sql`

```sql
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

**Calcolo `position`** (nel codice TypeScript, atomico):

```typescript
async function enqueueTask(
  userId: string, 
  type: string, 
  payload: Json, 
  batchId?: string,
): Promise<bigint> {
  return await pool.withTransaction(async (tx) => {
    const { rows: [maxRow] } = await tx.query<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_position 
       FROM system.agent_operation_queue 
       WHERE user_id = $1 AND status IN ('enqueued', 'running')`,
      [userId],
    );
    
    const { rows: [task] } = await tx.query<{ task_id: bigint }>(
      `INSERT INTO system.agent_operation_queue 
       (user_id, task_type, payload, batch_id, position, status)
       VALUES ($1, $2, $3, $4, $5, 'enqueued')
       RETURNING task_id`,
      [userId, type, payload, batchId ?? null, maxRow.next_position],
    );
    
    return task.task_id;
  });
}
```

### 8.3 Migration `075_agent_circuit_state.sql`

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

### 8.4 Migration `076_bot_metrics.sql`

```sql
BEGIN;

CREATE TABLE system.bot_task_metrics (
  task_id BIGINT PRIMARY KEY,             -- riferimento logico, non FK
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

### 8.5 Migration `077_ui_operation_intents.sql`

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

### 8.6 Cron jobs cleanup

`/home/deploy/archibald-app/vps-scripts/cleanup-bot-metrics.sh` (esecuzione 4:00 AM UTC):

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

Aggiunto al crontab del VPS, accanto a `docker-cleanup.sh` e `reindex-tables.sh`.

---

## 9. Compatibilità e drainage

Durante il deploy del Conductor:
- Drainage `bot-queue` BullMQ pre-deploy: script `drain-bullmq-bot-queue.ts` attende che la coda sia vuota (max 10 min) prima del switch.
- Task fallite vecchie in BullMQ: ignorate (sono già pending_orders in errore visibili all'utente).

---

## 10. Rollout

### 10.1 Workflow

```
master ────────────────────────────────────────────► (deploy automatico via CI/CD)
   │
   └──── feature/bot-conductor (branch + worktree)
              │
              └── PR quando ready
                       │
                       └── merge in master
                              │
                              └── CI builds + push GHCR + deploy VPS
```

### 10.2 Setup worktree

```bash
cd /Users/hatholdir/Downloads/Archibald
git worktree add ../Archibald-conductor feature/bot-conductor
cd ../Archibald-conductor
```

Master invariata durante lo sviluppo. Quando merge → deploy.

### 10.3 Sequenza

| # | Step | Durata stimata |
|---|---|---|
| 1 | Setup worktree + scaffold migration | 1 giorno |
| 2 | Implementazione TDD (~12 task) | 8-12 giorni |
| 3 | Local test suite verde (4 gate) | continuo |
| 4 | E2E reali contro VPS prod | 2 giorni |
| 5 | Spec compliance review interno | 1 giorno |
| 6 | PR + review utente | 1-2 giorni |
| 7 | Merge in orario sicuro → CI/CD deploy | ~10 min |
| 8 | Smoke test produzione | 30 min |
| 9 | Monitoring 24-48h | giorni 1-2 post-deploy |

Stima complessiva: **3-4 settimane**.

### 10.4 Rollback

- `git revert SHA && git push` → CI/CD redeploy.
- Migration 073-077 sono additive: NO rollback DB. Le tabelle nuove restano vuote, le colonne nuove restano NULL.

---

## 11. Testing strategy

### 11.1 Unit tests (Vitest backend)

- `agent-queue-repository.spec.ts`: enqueue, pickup, mutazioni stato, transizioni state machine.
- `conductor-dispatcher.spec.ts`: pickup loop, chain immediato, recovery on restart, circuit breaker logic.
- `error-classifier.spec.ts`: classificazione `erp_unreachable` vs `application_error`.
- `metrics-recorder.spec.ts`: scrittura task_metrics + phase_metrics, calcolo durate.
- `submit-order.spec.ts` (esteso): nuovo flow atomicità con stub completo, INSERT idempotente con ON CONFLICT.

### 11.2 Integration tests (Vitest + Postgres reale)

- `agent-queue.integration.spec.ts`: vera concorrenza, FIFO ordering, transazioni atomiche.
- `conductor-recovery.integration.spec.ts`: simula crash a varie fasi, verifica auto-recovery.
- `metrics-pipeline.integration.spec.ts`: end-to-end UI events → bot_task_metrics popolati.

### 11.3 Frontend tests (Vitest + Testing Library)

- `GlobalOperationBanner.spec.tsx` esteso: collapsed/expanded, etichette umane, non-occlusivo.
- `OperationTrackingContext.spec.tsx` esteso: gestione coda con state machine completa.
- `PreflightModal.spec.tsx` (nuovo): rendering differenze, decisioni utente, default prezzo concordato.
- `OrderFormSimple.spec.tsx`: emissione `UI_OPERATION_STARTED`/`COMPLETED`.

### 11.4 E2E reali contro VPS prod

Script in `scripts/e2e-conductor/`:

- `e2e-simple-order.mjs`: ordine 3 articoli, agente non-Fresis. End-to-end + metrica timing.
- `e2e-fresis-merged.mjs`: ordine merged Fresis 8+ articoli. Preservazione articleId, totali corretti.
- `e2e-batch-three.mjs`: batch 3 ordini lanciati simultaneamente. Serializzazione, zero requeue.
- `e2e-large-order.mjs`: ordine 15+ articoli. DOM cleanup.
- `e2e-preflight.mjs`: pending creato 3 giorni fa con prezzi cambiati. Modal preflight + decisioni.
- `e2e-erp-down-simulation.mjs`: tcpkill/iptables, verifica circuit breaker open/probe/recovery.
- `e2e-recovery.mjs`: kill backend container durante submit-order, verifica recovery on restart.

**Setup E2E**: `headless: process.env.NODE_ENV === 'production'`. VPS prod come target.

**Cleanup E2E**: cliente di test = **Fresis Soc Cooperativa (1002328)**. Gli ordini piazzati durante i test (mai inviati a Verona) vengono cancellati post-test via `delete-order` automatico.

Pattern di cleanup per ogni script E2E:

```javascript
// Pseudo-pattern in scripts/e2e-conductor/*.mjs
const createdOrderIds = [];
try {
  // ... esegui scenario, collect orderIds creati ...
  for (const orderId of resultsOrderIds) createdOrderIds.push(orderId);
} finally {
  for (const orderId of createdOrderIds) {
    await deleteOrderViaApi(orderId).catch((err) =>
      console.error(`Cleanup failed for ${orderId}:`, err.message)
    );
  }
}
```

Il piano implementativo dettaglierà lo script utility `e2e-cleanup-helpers.mjs` condiviso da tutti gli scenari.

---

## 12. Scope esplicito

### 12.1 Dentro scope

1. Migration 073-077.
2. Modulo `Conductor` backend (dispatcher + worker + state machine).
3. Atomicità nuovo flow `submit-order` con persistenza fase.
4. Pre-check anti-duplicato.
5. Hot lifecycle (chain immediato).
6. Circuit breaker per agent + auto-recovery on restart.
7. Banner globale evolution (etichette umane + non-occlusivo + tendina).
8. Preflight pending vecchi con skip intelligente.
9. Telemetria UI events → `ui_operation_intents`.
10. Popolamento `bot_task_metrics` + `bot_phase_metrics`.
11. E2E reali nei 7 scenari.
12. Audit non-occlusivo banner su tutte le pagine.
13. Cron cleanup `cleanup-bot-metrics.sh`.

### 12.2 Fuori scope (PR successivi)

1. Pagina dedicata `/operations` (storico esteso).
2. Recovery script `scripts/recover-orphan-orders.ts` (eliminato: il design previene il problema by design).
3. Refactor `batch-send-to-verona` e `batch-delete` per allineamento al design ERP nativo.
4. "Save and reopen" per ordini grandi (>15 articoli).
5. Eliminazione attiva delle ridondanze (login ripetuto, navigation.ordini ripetuto, readOrderHeader navigation ridondante) — ne valuteremo la necessità con i dati metriche post-deploy.
6. Feature flag per userId `system.feature_flags`.
7. Dashboard `/admin/metrics`.
8. Auto-correzione mismatch verifica.

---

## 13. Rischi residui

1. **Finestra ~50ms di crash tra step 6 e step 7-bis**: mitigata dal pre-check anti-duplicato del bot al pickup. Probabilità rarissima.
2. **Drain `bot-queue` BullMQ pre-deploy**: max 10 min di attesa.
3. **Audit non-occlusivo banner** può scoprire pagine non aggiornabili senza refactor pesante: workaround con classe CSS `no-bottom-banner`.
4. **Telemetria UI dipende da WebSocket**: se WS down, alcune metriche perdute. Non bloccante.
5. **E2E scrivono ordini reali su ERP Komet**: cleanup obbligatorio post-test via `delete-order`.

---

## 14. Definition of Done

Il PR è "Done" quando:
- [ ] Tutti gli unit + integration tests verdi.
- [ ] 4 gate (FE test, BE test, FE type-check, BE build) verdi su CI.
- [ ] Tutti i 7 scenari E2E passati su VPS prod.
- [ ] Audit non-occlusivo banner completato (snapshot Playwright per ogni pagina principale, nessun overlap).
- [ ] Spec compliance review (`superpowers:requesting-code-review`) senza P0/P1 issue.
- [ ] PR approvato dall'utente.
- [ ] Smoke test post-deploy completato (1 ordine simple, 1 batch 3 ordini).
- [ ] Monitoring 48h senza incidenti.

---

## 15. Appendice — File coinvolti (mappa preliminare)

### Backend (nuovi)

- `archibald-web-app/backend/src/db/migrations/073_order_records_delivery_address.sql`
- `archibald-web-app/backend/src/db/migrations/074_agent_operation_queue.sql`
- `archibald-web-app/backend/src/db/migrations/075_agent_circuit_state.sql`
- `archibald-web-app/backend/src/db/migrations/076_bot_metrics.sql`
- `archibald-web-app/backend/src/db/migrations/077_ui_operation_intents.sql`
- `archibald-web-app/backend/src/conductor/dispatcher.ts`
- `archibald-web-app/backend/src/conductor/worker.ts`
- `archibald-web-app/backend/src/conductor/agent-queue-repository.ts`
- `archibald-web-app/backend/src/conductor/circuit-breaker.ts`
- `archibald-web-app/backend/src/conductor/error-classifier.ts`
- `archibald-web-app/backend/src/conductor/metrics-recorder.ts`
- `archibald-web-app/backend/src/conductor/auto-recovery.ts`
- `archibald-web-app/backend/src/routes/agent-queue.ts` (POST /api/agent-queue/submit, GET /api/agent-queue/state)
- `archibald-web-app/backend/src/routes/preflight.ts` (GET /api/pending/:id/preflight)

### Backend (modificati)

- `archibald-web-app/backend/src/operations/handlers/submit-order.ts` — nuovo flow atomicità
- `archibald-web-app/backend/src/bot/archibald-bot.ts` — pre-check anti-duplicato + emit progress per fase metriche
- `archibald-web-app/backend/src/bot/browser-pool.ts` — pause sync condivise durante scrittura attiva
- `archibald-web-app/backend/src/sync/sync-scheduler.ts` — controllo Conductor attivo per pause sync
- `archibald-web-app/backend/src/main.ts` — bootstrap dispatcher + auto-recovery on startup

### Frontend (nuovi)

- `archibald-web-app/frontend/src/components/PreflightModal.tsx`
- `archibald-web-app/frontend/src/components/QueueDrawer.tsx` (la tendina espandibile)
- `archibald-web-app/frontend/src/api/agent-queue.ts`
- `archibald-web-app/frontend/src/api/preflight.ts`
- `archibald-web-app/frontend/src/hooks/useUiOperationTracking.ts`

### Frontend (modificati)

- `archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx` — etichette umane, tendina
- `archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx` — stati estesi
- `archibald-web-app/frontend/src/hooks/usePendingSync.ts` — invio batch via /api/agent-queue/submit
- `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx` — call preflight + nuovo enqueue
- `archibald-web-app/frontend/src/pages/OrderHistory.tsx` — render delivery_address_id + notes
- `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` — emit UI_OPERATION_STARTED/COMPLETED

### E2E

- `archibald-web-app/backend/scripts/e2e-conductor/e2e-simple-order.mjs`
- `archibald-web-app/backend/scripts/e2e-conductor/e2e-fresis-merged.mjs`
- `archibald-web-app/backend/scripts/e2e-conductor/e2e-batch-three.mjs`
- `archibald-web-app/backend/scripts/e2e-conductor/e2e-large-order.mjs`
- `archibald-web-app/backend/scripts/e2e-conductor/e2e-preflight.mjs`
- `archibald-web-app/backend/scripts/e2e-conductor/e2e-erp-down-simulation.mjs`
- `archibald-web-app/backend/scripts/e2e-conductor/e2e-recovery.mjs`

### VPS scripts

- `vps-scripts/cleanup-bot-metrics.sh`

---

**Fine spec.**

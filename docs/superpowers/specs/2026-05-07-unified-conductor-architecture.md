# Unified Conductor Architecture — Scalabilità 70+ Agenti

**Data**: 2026-05-07 (rev. 2026-05-07 post-adversarial-review)
**Autore**: Francesco Formicola + Claude
**Stato**: DRAFT — post-adversarial-review
**Dipende da**: `2026-04-30-bot-conductor-design.md`

---

## Contesto e motivazione

La PWA Archibald è progettata per essere adottata da 70+ agenti Komet in contemporanea. Ogni agente ha le proprie credenziali ERP e gestisce autonomamente tutti i flussi — dati personali (ordini, clienti, DDT, fatture) e dati condivisi (prodotti, prezzi, identici per tutti ma sincronizzati tramite sessione individuale).

Il sistema attuale usa **due architetture parallele senza cross-talk**:
- **Conductor** (DB-based, lock applicativo per-userId): operazioni ERP serializzate per-userId
- **BullMQ** (Redis-based): sync background periodiche per-userId

Questi due sistemi possono interferire — una sync BullMQ e un'operazione Conductor per lo stesso userId possono girare contemporaneamente sullo stesso browser context ERP. Questo è tollerabile a 1 agente, intollerabile a 70.

---

## Assioma fondante #0 — Non-interference & Freshness Guarantee

> Ogni utente PWA è un universo indipendente. Le sue richieste dirette non aspettano mai operazioni di altri utenti né le proprie sync di background. I dati che vede sono sempre i più recenti disponibili.

Tre garanzie ingegneristiche:

| Garanzia | Meccanismo | Condizioni |
|---|---|---|
| **G1 — Isolamento per-utente** | Lock applicativo row-based (`SELECT FOR UPDATE SKIP LOCKED`) per-userId, un task alla volta | Incondizionata |
| **G2 — Priorità diretta su sync** | Priority 10/50/100 scalzano priority 500 nella stessa coda userId; aging anti-starvation per P=500 | Incondizionata |
| **G3 — Freshness dei dati** | Post-op sync immediata + scheduler periodico + WebSocket push | **Best effort**: ≤90s con HTTP PDF, ≤15 min con Puppeteer puro (vedi SLA table) |

> ⚠️ G3 non è incondizionata: dipende dal successo della discovery HTTP (Fase 2). Con Puppeteer puro, la freshness target è ≤15 min, non ≤5 min.

---

## Vincoli di sistema

- **Profilo utenti**: 70+ agenti totali, 10-20 attivi (invio ordini) in un dato momento, restanti in modalità sync passiva
- **Hardware target**: Hetzner CPX62 — 16 vCPU, 32 GB RAM (upgrade da CPX32 attuale); upgrade ulteriore se necessario
- **ERP**: sessione singola sequenziale per-utente — login → 1 operazione → fine. Non progettato per sessioni multiple dello stesso account. Da verificare empiricamente.
- **Nessun service-account**: ogni operazione (diretta o sync) usa le credenziali dell'agente
- **Backend singleton**: il backend deve girare come singola replica (1 container). Non scalabile orizzontalmente finché non viene introdotto leader election per il dispatcher. Questo è un vincolo architetturale esplicito.

---

## Mappa completa delle operazioni

### Operazioni dirette — utente le avvia, bot agisce su ERP

| Operazione | Priorità | Browser | Note |
|---|---|---|---|
| `submit-order` | 10 | Sì — Write | Priorità massima |
| `edit-order` | 10 | Sì — Write | |
| `delete-order` | 10 | Sì — Write | |
| `send-to-verona` | 10 | Sì — Write | Fresis |
| `batch-send-to-verona` | 10 | Sì — Write | |
| `batch-delete-orders` | 10 | Sì — Write | |
| `create-customer` | 10 | Sì — Write | |
| `update-customer` | 10 | Sì — Write | |
| `sync-order-articles` | **50** | Sì — Scraping | Due trigger: utente apre scheda ordine + post-submit auto |
| `read-vat-status` | 100 | Sì — Read | On-demand |
| `refresh-customer` | 100 | Sì — Read | On-demand |
| `download-ddt-pdf` | 100 | Sì — Read | On-demand utente |
| `download-invoice-pdf` | 100 | Sì — Read | On-demand utente |

### Sync background — periodiche, mantengono PWA aggiornata

| Operazione | Priorità | Browser | Note |
|---|---|---|---|
| `sync-orders` | 500 | Da testare (PDF→HTTP?) | Ogni 5 min attivi, 15 min idle |
| `sync-customers` | 500 | Da testare (PDF→HTTP?) | Ogni 5 min attivi, 15 min idle |
| `sync-ddt` | 500 | Da testare (PDF→HTTP?) | Ogni 5 min attivi, 15 min idle |
| `sync-invoices` | 500 | Da testare (PDF→HTTP?) | Ogni 5 min attivi, 15 min idle |
| `sync-customer-addresses` | 500 | Sì — Scraping HTML | Ogni 30 min |
| `sync-products` | 500 | Da testare | Round-robin agenti |
| `sync-prices` | 500 | Sì — HTML scraping | Round-robin agenti |
| `sync-order-states` | 500 | No — DB only | Dopo sync-orders/ddt/invoices; no lock |
| `sync-tracking` | 500 | No — API HTTP FedEx | No lock |

---

## Architettura target

### Visione d'insieme

```
OGGI                                  DOPO
─────────────────────────────         ───────────────────────────────────────
BullMQ (4 code Redis)                 Conductor (unica fonte di verità)
  enrichment, agent-sync,               ├─ [P=10]  ERP Write operations
  shared-sync, writes                   ├─ [P=50]  sync-order-articles (utente attende)
                                        ├─ [P=100] On-demand read/scrape
Conductor (DB-based)                    ├─ [P=500] Background sync (browser)
  ERP write ops                         └─ [P=500] Background sync (no-browser, no lock)

Browser Pool                          Browser Pool (shared, slot fissi)
  1 context per userId, 30-min TTL      ├─ 8 WRITE SLOTS fissi (P≤100)
  3 browser × 8 context = 24 max        └─ 25 SYNC SLOTS fissi (P=500, CPX62)
                                      Lock: row-based applicativo, non pg_advisory_xact_lock
                                      BullMQ → ELIMINATO (Fase 3)
```

---

## Sezione 1 — Priority lanes nel Conductor

### Schema DB — Fase 1 (migration #082)

**Sequenza di deployment obbligatoria**: migration PRIMA del codice. Il codice che referenzia le nuove colonne non viene deployato finché la migration non è confermata applicata in produzione.

```sql
-- APPLY
ALTER TABLE system.agent_operation_queue
  ADD COLUMN priority INT NOT NULL DEFAULT 500,
  ADD COLUMN run_after TIMESTAMPTZ,
  ADD COLUMN requires_browser BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN dedup_key TEXT GENERATED ALWAYS AS (
    user_id || ':' || task_type || ':' || COALESCE(payload->>'orderId', '')
  ) STORED;

-- last_shared_sync_at per round-robin shared syncs
ALTER TABLE agents.agent_sync_state
  ADD COLUMN last_shared_sync_at TIMESTAMPTZ;

CREATE INDEX idx_agent_queue_priority_pickup
  ON system.agent_operation_queue (user_id, priority ASC, enqueued_at ASC)
  WHERE status = 'enqueued' AND (run_after IS NULL OR run_after <= NOW());

-- Deduplicazione atomica per task tipo+userId+orderId
CREATE UNIQUE INDEX idx_agent_queue_dedup
  ON system.agent_operation_queue (dedup_key)
  WHERE status IN ('enqueued', 'running');

-- ROLLBACK (eseguire in caso di rollback del codice)
-- DROP INDEX idx_agent_queue_dedup;
-- DROP INDEX idx_agent_queue_priority_pickup;
-- ALTER TABLE system.agent_operation_queue
--   DROP COLUMN priority, DROP COLUMN run_after,
--   DROP COLUMN requires_browser, DROP COLUMN dedup_key;
-- ALTER TABLE agents.agent_sync_state DROP COLUMN last_shared_sync_at;
```

### Locking model — row-based applicativo (non pg_advisory_xact_lock)

**Chiarimento critico**: `pg_advisory_xact_lock` dura solo per la durata della transazione PostgreSQL di pickup (millisecondi). Non protegge l'operazione ERP che segue (che dura minuti). Il Conductor usa già correttamente un **lock applicativo row-based**: la riga con `status='running'` funge da lock — il dispatcher usa `SELECT FOR UPDATE SKIP LOCKED` per escludere userId già in esecuzione.

Questo lock:
- Sopravvive al restart del processo (la riga `status='running'` persiste in DB)
- Viene recuperato dall'auto-recovery per task orfanati
- Non dipende dalla session PostgreSQL
- È il meccanismo corretto per garantire G1

La spec usa il termine "serializzazione per-userId" intendendo questo meccanismo, non `pg_advisory_xact_lock` puro.

### Logica pickup prioritizzata

`dispatcher.pickupNextTask` ordina per `priority ASC, enqueued_at ASC` (a parità di priority, FIFO). Rispetta `run_after`: se `run_after > NOW()`, il task è ignorato.

**Query pickup (semplificata)**:
```sql
SELECT * FROM system.agent_operation_queue
WHERE status = 'enqueued'
  AND (run_after IS NULL OR run_after <= NOW())
  AND user_id NOT IN (
    SELECT DISTINCT user_id FROM system.agent_operation_queue
    WHERE status = 'running'
  )
ORDER BY priority ASC, enqueued_at ASC
LIMIT 10  -- batch per ridurre lock attempt falliti
FOR UPDATE SKIP LOCKED
```

### Assegnazione priorità per task type

```typescript
const TASK_PRIORITY: Record<TaskType, number> = {
  // P=10: ERP Write — utente aspetta feedback immediato
  'submit-order': 10,
  'edit-order': 10,
  'delete-order': 10,
  'send-to-verona': 10,
  'batch-send-to-verona': 10,
  'batch-delete-orders': 10,
  'create-customer': 10,
  'update-customer': 10,

  // P=50: Utente attende attivamente (apre scheda ordine, verifica post-submit)
  'sync-order-articles': 50,

  // P=100: On-demand read — utente aspetta risultato
  'read-vat-status': 100,
  'refresh-customer': 100,
  'download-ddt-pdf': 100,
  'download-invoice-pdf': 100,

  // P=500: Background sync — silenzioso
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
```

### Deduplicazione task con orderId

Per task parametrici come `sync-order-articles`, il dedup key include l'`orderId` dal payload. L'indice unico `idx_agent_queue_dedup` sulla colonna `dedup_key` garantisce atomicità senza check separato:

```typescript
// Enqueue con deduplicazione atomica
await pool.query(`
  INSERT INTO system.agent_operation_queue (user_id, task_type, payload, priority)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (dedup_key) WHERE status IN ('enqueued', 'running') DO NOTHING
`, [userId, taskType, payload, priority]);
```

Questo sostituisce il check `status IN ('enqueued','running')` lato scheduler — l'atomicità è garantita dal DB, non dall'applicazione.

### Anti-starvation per P=500 (aging)

Un utente molto attivo (molti submit-order consecutivi) può tenere la coda sempre piena di P=10, impedendo alle sync P=500 di girare indefinitamente. Meccanismo di aging:

```typescript
// In pickupNextTask, prima di applicare ORDER BY priority:
// Se last_P500_enqueued_at per questo userId è > 30 min fa
// e ci sono task P=500 in coda → pickuppa il primo P=500 (eccezione alla priorità)
const AGING_THRESHOLD_MS = 30 * 60_000;
```

Implementazione: il dispatcher traccia `last_p500_pickup_at` per userId (in-memory o su DB). Se supera la soglia, forza il pickup di un P=500 indipendentemente dalla priorità.

---

## Sezione 2 — Browser Pool ridisegnato

### Slot reservation — valori fissi conservativi

Il pool usa valori **statici configurabili** (env var), non calcolati dinamicamente dalla RAM disponibile. La RAM disponibile varia durante runtime (GC Node.js, picchi Chromium, crescita PostgreSQL cache) e un calcolo dinamico porta a OOM non prevedibile.

```
WRITE SLOTS — 8 fissi (configurabile: BROWSER_POOL_WRITE_SLOTS)
  Riservati esclusivamente per priority ≤ 100 (P=10, P=50, P=100)
  Mai accessibili da P=500
  Garanzia assoluta: nessun utente aspetta per un slot write

SYNC SLOTS — 25 fissi su CPX62 (configurabile: BROWSER_POOL_SYNC_SLOTS)
  Solo per priority = 500
  Valore conservativo calcolato con dual-constraint:
    RAM bound:  floor((32 GB - 12 GB overhead) / 0.5 GB per context peak) = 40
    CPU bound:  floor(16 vCPU × 0.8 / 0.5 vCPU per context attivo) = 25
    → min(40, 25) = 25 SYNC SLOTS

  ⚠️ 0.5 GB/context è il valore di PICCO (ERP DevExpress attivo, scraping in corso)
  ⚠️ 0.5 vCPU/context è il consumo durante elaborazione attiva
  I valori idle (0.15 GB, 0.05 vCPU) non sono la misura corretta per il sizing

Totale pool: 8 + 25 = 33 context Chromium in contemporanea su CPX62
RAM stimata: 33 × 0.5 GB = 16.5 GB (+ 12 GB overhead = 28.5 GB su 32 GB — margine di ~3.5 GB)
```

**Memory guard a runtime**: se `process.memoryUsage().rss` supera il 75% della RAM totale, il dispatcher non pickuppa nuovi task P=500 (sync background) finché non scende sotto il 65%. I task P≤100 non sono soggetti al memory guard.

### SLA freshness per numero di agenti attivi

| Agenti attivi | Modalità sync | Throughput effettivo | Freshness (ciclo 5 min) |
|---|---|---|---|
| ≤10 | HTTP (~7s/sync) | 25 slot × 8.5/min ≈ 212/min | **≤20s per ciclo** ✅ |
| ≤20 | HTTP (~7s/sync) | 212/min | **≤28s** ✅ |
| ≤20 | Puppeteer (~45s/sync) | 25 slot × 1.3/min ≈ 33/min | **≤3 min** ✅ |
| ≤40 | HTTP | 212/min | **≤57s** ✅ |
| ≤40 | Puppeteer | 33/min | **~6 min** ⚠️ (backlog lento) |
| 70 attivi | HTTP | 212/min | **≤2 min** ✅ |
| 70 attivi | Puppeteer | 33/min | **~12 min** ❌ backlog diverge |

> **Conclusione**: con Puppeteer puro e 40+ agenti tutti attivi, il backlog cresce più velocemente di quanto venga smaltito. L'HTTP discovery (Fase 2) NON è opzionale — è necessaria per supportare il carico pieno.

### Vincolo advisory lock — preemption cooperativa (Fase 1)

Se una sync P=500 è in esecuzione per userId X e arriva un submit-order P=10, il submit aspetta il completamento della sync. Durata massima di attesa:
- **HTTP sync**: ~5-10s — accettabile
- **Puppeteer sync**: fino a 60s — non accettabile senza mitigazione

**Mitigazione obbligatoria Fase 1**: tutte le sync Puppeteer devono essere strutturate a **batch con checkpoint** di max 20 items. Dopo ogni batch, il worker controlla se esiste un task P≤50 in coda per lo stesso userId:

```typescript
// Dentro ogni sync Puppeteer, dopo ogni batch:
const hasPriorityTask = await checkPriorityTaskPending(pool, userId, 50);
if (hasPriorityTask) {
  // Re-enqueua il resto della sync con run_after = now + 5s
  await requeueRemainingSync(pool, userId, taskType, remainingPayload);
  return { completed: false, preempted: true };
}
```

**Nota critica**: `force-release` del lock applicativo (riga status='running') non ferma il Puppeteer task in esecuzione — il bot continua a navigare in background. Il preemption cooperativo via checkpoint è l'unico meccanismo corretto. Il force-release va usato solo per recovery di orfani, non per preemption.

### Lease model — warm window con mutex per-userId

**Vecchio modello**: context cachato per-userId, TTL 30 min → 70 agenti = 70 context sempre in RAM. Insostenibile.

**Nuovo modello — Lease con warm window protetta**:

```
Task A completa
  │
  ▼
Task A esegue TUTTE le operazioni post-completamento
(incluse verifiche ERP, broadcast WebSocket, enqueue post-op sync)
  │
  ▼
releaseContext(userId, contextHealthy)
  ├─ contextHealthy=false → logout + slot libero immediatamente
  └─ contextHealthy=true → warm window = 90s
       ├─ mutex in-memory per userId: nessun altro worker può acquisire
       │   il context mentre warm window è attiva
       ├─ se arriva Task B entro 90s → mutex passato a Task B
       └─ nessun task entro 90s → logout + slot liberato + mutex rimosso

GARANZIA: tra releaseContext e il pickup di Task B,
il context non è mai in stato "libero ma con operazioni Task A in corso".
```

**Implementazione mutex**: `Map<userId, Promise<void>>` in-memory nel browser pool. `acquireContext` per userId X aspetta che il Promise sia resolved prima di procedere. La warm window mantiene il Promise in stato pending finché non viene esplicitamente resolved (da Task B che prende il context, o dal timeout di 90s).

---

## Sezione 3 — Sync background nel Conductor

### Sync con browser (priority=500, SYNC_SLOTS)

Le sync `sync-orders`, `sync-customers`, `sync-ddt`, `sync-invoices`, `sync-customer-addresses` diventano task Conductor con `priority=500` e `requires_browser=TRUE`.

**Idempotenza**: l'INSERT con `ON CONFLICT (dedup_key) DO NOTHING` garantisce che non vengano enqueued duplicati. Il check è atomico a livello DB.

**sync-order-states — guard contro dati stale**:

`sync-order-states` non usa il browser ma SCRIVE su `order_records.current_state`. Per evitare di sovrascrivere uno stato scritto da `submit-order` con dati derivati da una sync precedente al submit, ogni UPDATE deve includere un guard temporale:

```sql
UPDATE agents.order_records
SET current_state = $newState, state_updated_at = NOW()
WHERE id = $orderId AND user_id = $userId
  AND (state_updated_at IS NULL OR state_updated_at < $syncStartedAt)
```

`$syncStartedAt` è il timestamp di inizio del task `sync-order-states`. Questo garantisce che un UPDATE di `submit-order` più recente non venga sovrascritto.

### Sync senza browser (corsia no-lock)

`sync-order-states` e `sync-tracking` hanno `requires_browser=FALSE`. Il worker Conductor:
- Non chiama `acquireContext`
- Non acquisce il lock applicativo row-based (nessun `status='running'` come lock — usano un lock separato leggero o sono idempotenti)
- Girano in parallelo con altre sync senza consumare WRITE/SYNC SLOTS

`sync-order-states` viene enqueued con `run_after = now + 2min` come buffer (euristica). La dipendenza reale è garantita dalla serializzazione per-userId del Conductor: le sync browser per lo stesso userId completano prima che sync-order-states parta, purché siano nella stessa coda.

**Miglioramento futuro**: enqueua `sync-order-states` come post-op di `sync-orders` (event-driven), eliminando il timeout fisso.

### Sync condivise (prodotti, prezzi) — round-robin robusto

Nessun agente referente fisso. Al tick del scheduler:

```sql
-- Query round-robin con definizione esplicita di "disponibile"
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
```

**Caso "nessun agente disponibile"**: logga un warning `shared_sync_skipped`, non silenzioso. La metrica `shared_sync_skipped_cycles` viene monitorata. Se supera 3 cicli consecutivi → alert admin.

**Aggiornamento dopo sync**: al completamento di sync-products/sync-prices, aggiorna `last_shared_sync_at = NOW()` per l'agente che ha eseguito.

### Post-operation sync (Garanzia G3)

Dopo ogni operazione ERP completata, sync mirate vengono enqueued. La deduplicazione è atomica tramite `ON CONFLICT DO NOTHING`:

| Operazione completata | Sync enqueued | Priorità |
|---|---|---|
| `submit-order` | `sync-orders(userId)` | P=100 |
| `submit-order` | `sync-order-articles(orderId)` | P=50 |
| `edit-order` | `sync-orders(userId)` | P=100 |
| `edit-order` | `sync-order-articles(orderId)` | P=50 |
| `delete-order` | `sync-orders(userId)` | P=100 |
| `create-customer` | `sync-customers(userId)` | P=100 |
| `update-customer` | `sync-customers(userId)` | P=100 |

**Dedup semantics P=100 vs P=500**: se un task P=100 `sync-orders` è già enqueued quando il periodic scheduler tenta di aggiungere un P=500 per lo stesso userId, l'INSERT con `ON CONFLICT DO NOTHING` salta il P=500. Non è un problema — la sync P=100 eseguirà a breve e il periodic scheduler aggiungerà il prossimo P=500 al ciclo successivo.

**Freshness con cold context**: se il warm window è scaduto (>90s di inattività), la post-op sync P=50/P=100 deve eseguire un login ERP prima della sync → latenza 15-30s aggiuntivi. Non è "entro secondi" in questo caso — il frontend deve mostrare indicatore "Aggiornamento in corso..." piuttosto che aspettarsi dati istantanei.

---

## Sezione 4 — Migration strategy: 3 fasi senza downtime

### Fase 1 — Conductor esteso + migrazione sync browser (2-3 settimane)

**Pre-requisiti**:
1. Schema migration #082 applicata e verificata in produzione
2. Feature flag `USE_CONDUCTOR_FOR_SYNCS=false` nel codice deployato
3. `smartCustomerSync` / `pauseSyncs` aggiornato (vedi nota sotto)

**Nota `smartCustomerSync`**: `syncScheduler.stop()` oggi ferma i nuovi enqueue BullMQ. Dopo la migrazione, ferma anche i nuovi enqueue al Conductor. Ma i task Conductor già in coda (`status='enqueued'`) vengono comunque processati. Occorre aggiungere: al `stop()` dello scheduler, inserire in DB una flag `syncs_paused_for_userId` che il dispatcher controlla prima del pickup per task P=500 di quel userId. Al `resume()`, rimuovere la flag.

**Ordine di migrazione sync** (una per settimana):

| Step | Tipo | Modalità |
|---|---|---|
| 1 | `sync-order-articles` | Già in Conductor → aggiungere `priority=50`, `dedup_key` |
| 2 | `sync-customer-addresses` | Conductor P=500; disabilita BullMQ worker per tipo |
| 3 | `sync-orders`, `sync-customers` | Conductor P=500; **non shadow mode** — cutover diretto |
| 4 | `sync-ddt`, `sync-invoices` | Conductor P=500; cutover diretto |
| 5 | `sync-products`, `sync-prices` | Conductor P=500, round-robin agenti |

**⚠️ Shadow mode ridefinito — NON double-execute**:

Il shadow mode precedente (entrambe le code attive) causa data corruption: `syncOrders` esegue due volte quasi contemporaneamente per lo stesso userId, le DELETE di ordini stale si basano su snapshot PDF diversi e si contraddicono. Il warehouse viene scritto due volte.

Il shadow mode corretto è **dry-run Conductor**:
- Il worker Conductor esegue la sync ma non scrive sul DB (log-only)
- Confronta il risultato atteso con quello del BullMQ attuale
- Dopo 24h senza discrepanze → cutover (BullMQ worker per quel tipo viene disabilitato)
- Non c'è mai una finestra in cui entrambi scrivono

**Admin monitoring**: aggiornare `/monitoring/sync-history` e `SyncMonitoringDashboard` per leggere da `agent_operation_queue`. Risolve anche il DEGRADED falso positivo di `sync-order-articles`.

**Rollback**: `USE_CONDUCTOR_FOR_SYNCS=false` → il Conductor accetta i nuovi task ma li skippa (dry-run), BullMQ workers restano attivi.

### Fase 2 — Discovery HTTP + session lifecycle (1-2 settimane)

**Discovery HTTP PDF** (script manuale su VPS prod):
```
1. Acquisisci context per un agente → login ERP → estrai cookies di sessione
2. Per ogni tipo di sync, tenta HTTP fetch con Cookie header:
   - CUSTTABLE_ListView → export PDF clienti
   - SALESTABLE_ListView_Agent → export PDF ordini
   - DDT_ListView → export PDF DDT
   - Fatture_ListView → export PDF fatture
3. Verifica: risponde 200? Il PDF è completo e corretto?
4. Attenzione a: ViewState/anti-CSRF token, redirect al login, form postback
   (DevExpress XAF può richiedere POST con ViewState invece di GET semplice)
5. Se richiede POST: testare con i parametri ViewState estratti dalla sessione browser
6. Documenta esito per ogni endpoint
```

**Se HTTP funziona**: `HttpSyncHandler` acquisisce il context solo per estrarre i cookies (2-3s), poi esegue l'HTTP fetch separatamente senza tenere il browser occupato. SYNC_SLOTS sotto pressione molto ridotta.

**Session lifecycle** (implementare in Fase 2):
- Lease model con warm window 90s + mutex in-memory (spec sezione 2)
- Rimuovere il TTL 30-min fisso del vecchio pool
- Test di carico: 25 agenti attivi in simultanea, misurare slot utilization e latenza login

### Fase 3 — Eliminazione BullMQ (1 settimana)

**Pre-condizioni**: tutte le sync migrate a Conductor + BullMQ queue svuotata (drain, non hard-stop) + vecchi job Redis expired (usare `queue.clean()` prima di rimuovere i worker).

```
sync-order-states → setInterval in sync-scheduler
                    enqueua Conductor task, requires_browser=FALSE
sync-tracking     → setInterval in sync-scheduler
                    enqueua Conductor task, requires_browser=FALSE
```

**Rimozione**:
```
npm uninstall bullmq
Rimuovi: BullMQ Workers, createOperationQueue, queue-router QUEUE_ROUTING
Redis: valutare se mantenere per JWT revocation o migrare a DB-based
Admin panel: dashboard Conductor-native
```

**Redis post-BullMQ**: Redis rimane come dipendenza per JWT revocation. Se Redis va down, `isTokenRevoked` lancia eccezione → tutti gli agenti vengono kickati. Valutare migrazione a `system.revoked_tokens` (tabella DB con cleanup periodico) per eliminare Redis come hard dependency. Questa decisione va presa prima di Fase 3.

**Timeline totale**: ~5-6 settimane, produzione sempre attiva.

---

## Sezione 5 — Error handling e circuit breaker

### Gerarchia errori

| Classe | Trigger | Risposta |
|---|---|---|
| **ERP globale** | 3+ userId falliscono nell'ultima finestra 5 min | Pausa tutti i task P=500 (`run_after = now + 10min`); task P≤100 non bloccati |
| **ERP per-utente** | Login fallito, sessione invalidata, 3 fail consecutivi | Circuit breaker per-userId; altri utenti non impattati |
| **Job specifico** | Errore form, ordine non trovato, PDF corrotto | Retry con backoff (Conductor: max_retries, error_class) |

Il circuit breaker globale è un **pre-check nel dispatcher** prima di ogni pickup di task P=500. Evita che un ERP down generi 70 retry contemporanei.

### Pool exhaustion — backpressure sana

Se tutti i WRITE SLOTS (8) sono occupati (>8 submit-order simultanei — raro ma possibile):
- Il task rimane `status='enqueued'`
- WebSocket push: `JOB_QUEUED` con posizione stimata
- Frontend mostra "In coda — avvio imminente"
- Non appena si libera uno slot → pickuppato immediatamente

### Post-op sync failure isolation

```typescript
try {
  await enqueuePostOpSyncs(task);
} catch {
  logger.warn('Post-op sync enqueue failed', { taskId: task.taskId });
  // MAI throw — l'ordine è su ERP e in DB
}
```

### Pre-check anti-duplicato submit-order — fingerprint (nota)

Il Conductor usa un pre-check per evitare di ripiazzare ordini già inviati all'ERP in caso di recovery dopo crash. Il fingerprint attuale (`numArticles + customerId`) è insufficiente: due ordini diversi dello stesso cliente con lo stesso numero di articoli vengono confusi. Questo non è introdotto dalla nuova spec ma va risolto contestualmente — il fingerprint deve includere la somma degli importi o un hash del set articleId+qty. **Da correggere in Fase 1** come prerequisito.

---

## Sezione 6 — Testing strategy

### Unità

- `dispatcher.ts` — priority ordering: task P=10 prima di P=500 stessa coda userId; aging P=500 dopo 30 min
- `browser-pool.ts` — slot reservation: P=500 non ottiene WRITE SLOT; mutex warm window (secondo acquireContext per userId X aspetta)
- `sync-order-states.ts` — guard temporale: UPDATE con `state_updated_at < $syncStartedAt`
- Dedup: INSERT con `ON CONFLICT DO NOTHING` per `sync-order-articles` stesso orderId

### Integrazione

- Conductor priority: submit-order inserito durante sync in esecuzione → preemption cooperativa (checkpoint) scalza correttamente
- Warm window mutex: Task B non parte finché Task A non ha completed tutte le post-completion ops
- Round-robin shared sync: agente fallisce → sync passa al successivo
- Post-op dedup: due trigger P=50 per stesso orderId → uno solo enqueued

### Discovery test (Fase 2, script manuale)

Script Node.js one-shot: autentica → estrae cookies → tenta HTTP fetch di ogni endpoint PDF → confronta output con Puppeteer. Testa anche POST con ViewState per endpoint DevExpress.

### Load test

Simulare 70 agenti: 25 sync BG attive per utente + 3 submit-order simultanei. Misurare:
- Latenza P50/P95 per slot acquisition (target: P95 < 5s per WRITE SLOTS)
- Queue depth per userId (target: nessun userId > 10 task in coda)
- RAM browser pool (target: < 20 GB per 33 context su CPX62)
- CPU utilization (target: < 70% su 16 vCPU sotto carico pieno)
- Zero interferenze: nessun userId vede sessione ERP di un altro

---

## Decisioni aperte (da risolvere in Fase 2)

| Decisione | Opzioni | Dipende da |
|---|---|---|
| PDF sync via HTTP? | HTTP fetch (GET o POST+ViewState) vs Puppeteer | Discovery test su ERP reale |
| Dimensione warm window | 60s / 90s / 120s | Load test latenza login ERP |
| Redis → DB-based JWT revocation | Mantenere Redis vs `system.revoked_tokens` | Valutazione rischio Redis dependency |
| SYNC_SLOTS CPX62 definitivi | 25 (conservativo) vs 30 (ottimistico) | Profiling RAM/CPU effettivi post-upgrade |

---

## Note minori (da correggere contestualmente)

**M-1 — Deploy overlapping: no-browser task doppi per ~10s**
Durante rolling restart di Docker, vecchio e nuovo container sono attivi simultaneamente per ~10s. Entrambi pickuppano task `requires_browser=FALSE` (sync-order-states, sync-tracking) che non hanno il lock row-based. Risultato: doppia esecuzione idempotente — nessuna corruzione, solo spreco. Mitigazione: i task no-browser acquisiscono un lock leggero (`SELECT pg_try_advisory_lock` a session-level) per deduplicare le esecuzioni parallele durante il deploy.

**M-2 — `run_after = 2min` per sync-order-states: euristica fragile**
Se una sync Puppeteer impiega >2 min (ERP lento, PDF grande), sync-order-states parte con dati parziali. Mitigazione già descritta in Sezione 3: enqueue event-driven dopo completamento di sync-orders, non timeout fisso. Da implementare come miglioramento in Fase 2.

**M-3 — Inconsistenza interna: migration step 1 sync-order-articles**
La Sezione 4 Fase 1 step 1 originariamente diceva "aggiungere priority=100" ma la mappa priorità assegna P=50 a sync-order-articles. **Il valore corretto è P=50** — la spec è stata aggiornata di conseguenza in questa revisione.

---

## Operazioni fuori scope (da completare in futuro)

Le seguenti operazioni esistono nel codice ma non sono completate e rimangono su BullMQ enrichment fino a nuova valutazione. Il codice è commentato con TODO espliciti.

| Operazione | Azione |
|---|---|
| `catalog-ingestion` | BullMQ enrichment; migrare a Conductor P=500 `requires_browser=FALSE` quando feature completata o rimuovere |
| `catalog-product-enrichment` | Idem |
| `web-product-enrichment` | Idem |
| `recognition-feedback` | Idem |
| `re-extract-pictograms` | Idem |

---

## Hardware upgrade consigliato

**Da CPX32** (4 vCPU, 8 GB RAM, €17/mo)
**A CPX62** (16 vCPU, 32 GB RAM, €62/mo) — passo immediato prima dei primi agenti
**Upgrade futuro** (32 vCPU, 64 GB+) — se il carico a regime lo richiede

Stima capacità CPX62 con i valori corretti (picco, non idle):
- 8 WRITE SLOTS × 0.5 GB = 4 GB per operazioni dirette
- 25 SYNC SLOTS × 0.5 GB = 12.5 GB per sync background
- Node.js heap + Redis + PostgreSQL: ~8 GB
- Totale stimato: ~24.5 GB su 32 GB disponibili → margine ~7.5 GB ✅

Il testing iniziale con ~10 agenti di controllo usa una frazione di questa capacità — l'architettura non richiede modifiche al codice al crescere degli agenti, solo al valore di `BROWSER_POOL_SYNC_SLOTS`.

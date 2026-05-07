# Unified Conductor Architecture — Scalabilità 70+ Agenti

**Data**: 2026-05-07  
**Autore**: Francesco Formicola + Claude  
**Stato**: DRAFT — in revisione  
**Dipende da**: `2026-04-30-bot-conductor-design.md`

---

## Contesto e motivazione

La PWA Archibald è progettata per essere adottata da 70+ agenti Komet in contemporanea. Ogni agente ha le proprie credenziali ERP e gestisce autonomamente tutti i flussi — dati personali (ordini, clienti, DDT, fatture) e dati condivisi (prodotti, prezzi, che sono identici per tutti ma sincronizzati tramite sessione individuale).

Il sistema attuale usa **due architetture parallele senza cross-talk**:
- **Conductor** (DB-based, `pg_advisory_lock`): operazioni ERP serializzate per-userId
- **BullMQ** (Redis-based): sync background periodiche per-userId

Questi due sistemi possono interferire — una sync BullMQ e un'operazione Conductor per lo stesso userId possono girare contemporaneamente sullo stesso browser context ERP. Questo è tollerabile a 1 agente, intollerabile a 70.

---

## Assioma fondante #0 — Non-interference & Freshness Guarantee

> Ogni utente PWA è un universo indipendente. Le sue richieste dirette non aspettano mai operazioni di altri utenti né le proprie sync di background. I dati che vede sono sempre i più recenti disponibili.

Tre garanzie ingegneristiche non negoziabili:

| Garanzia | Meccanismo |
|---|---|
| **G1 — Isolamento per-utente** | Queue Conductor separata per userId, `pg_advisory_xact_lock` distinto |
| **G2 — Priorità diretta su sync** | Priority 10/50/100 scalzano priority 500 (sync) nella stessa coda userId |
| **G3 — Freshness dei dati** | Post-op sync immediata + scheduler periodico + WebSocket push al completamento |

---

## Vincoli di sistema

- **Profilo utenti**: 70+ agenti totali, 10-20 attivi (invio ordini) in un dato momento, restanti in modalità sync passiva
- **Hardware target**: Hetzner CPX62 — 16 vCPU, 32 GB RAM (upgrade da CPX32 attuale)
- **ERP**: sessione singola sequenziale per-utente — login → 1 operazione → fine. Non progettato per sessioni multiple dello stesso account
- **Nessun service-account**: ogni operazione (diretta o sync) usa le credenziali dell'agente

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
| `sync-order-articles` | **50** | Sì — Scraping | Utente apre scheda ordine (aspetta articoli) |
| `sync-order-articles` (post-submit auto) | **50** | Sì — Scraping | Utente verifica ordine appena creato |
| `read-vat-status` | 100 | Sì — Read | On-demand |
| `refresh-customer` | 100 | Sì — Read | On-demand |
| `download-ddt-pdf` | 100 | Sì — Read | On-demand utente |
| `download-invoice-pdf` | 100 | Sì — Read | On-demand utente |

### Sync background — periodiche, mantengono PWA aggiornata

| Operazione | Priorità | Browser | Note |
|---|---|---|---|
| `sync-orders` | 500 | Da testare (PDF→HTTP?) | Ogni **5 min** attivi, 15 min idle |
| `sync-customers` | 500 | Da testare (PDF→HTTP?) | Ogni **5 min** attivi, 15 min idle |
| `sync-ddt` | 500 | Da testare (PDF→HTTP?) | Ogni **5 min** attivi, 15 min idle |
| `sync-invoices` | 500 | Da testare (PDF→HTTP?) | Ogni **5 min** attivi, 15 min idle |
| `sync-customer-addresses` | 500 | Sì — Scraping HTML | Ogni 30 min |
| `sync-products` | 500 | Da testare | Round-robin agenti |
| `sync-prices` | 500 | Sì — HTML scraping | Round-robin agenti |
| `sync-order-states` | 500 | No — DB only | Dopo sync-orders/ddt/invoices |
| `sync-tracking` | 500 | No — API HTTP FedEx | Separato |

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
  ERP write ops                         └─ [P=500] Background sync (no-browser)

Browser Pool                          Browser Pool (shared, dinamico)
  1 context per userId, 30-min TTL      ├─ 8 WRITE SLOTS fissi (P≤100)
  3 browser × 8 context = 24 max        └─ N SYNC SLOTS dinamici (P=500, scala con RAM)
                                      BullMQ → ELIMINATO (Fase 3)
```

---

## Sezione 1 — Priority lanes nel Conductor

### Schema DB — Fase 1 (migration #082)

```sql
ALTER TABLE system.agent_operation_queue
  ADD COLUMN priority INT NOT NULL DEFAULT 500,
  ADD COLUMN run_after TIMESTAMPTZ,
  ADD COLUMN requires_browser BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX idx_agent_queue_priority_pickup
  ON system.agent_operation_queue (user_id, priority ASC, enqueued_at ASC)
  WHERE status = 'enqueued';
```

### Logica pickup prioritizzata

`dispatcher.pickupNextTask` ordina per `priority ASC, enqueued_at ASC` (a parità di priority, FIFO). Un `submit-order` inserito con `priority=10` viene pickuppato prima di qualsiasi sync in coda con `priority=500`, anche se la sync è stata enqueued da ore.

Rispetta `run_after`: se `run_after > NOW()`, il task è ignorato nel pickup (equivalente al `delay` di BullMQ).

### Assegnazione priorità per task type

```typescript
const TASK_PRIORITY: Record<TaskType, number> = {
  // P=10: ERP Write — utente aspetta feedback
  'submit-order': 10,
  'edit-order': 10,
  'delete-order': 10,
  'send-to-verona': 10,
  'batch-send-to-verona': 10,
  'batch-delete-orders': 10,
  'create-customer': 10,
  'update-customer': 10,

  // P=50: Utente attende attivamente (apre scheda ordine, verifica post-submit)
  'sync-order-articles': 50,  // due trigger: utente apre scheda + post-submit auto

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

---

## Sezione 2 — Browser Pool ridisegnato

### Slot reservation — starvation prevention con pool dinamico

Il pool cresce con la RAM disponibile del server. Il sistema è progettato per hardware scalato (CPX62+ con possibile upgrade futuro), non per il minimo attuale. Il testing iniziale con ~10 agenti di controllo avviene su hardware già adeguato.

```
WRITE SLOTS — 8 fissi, invariabili
  Riservati esclusivamente per priority ≤ 100 (P=10, P=50, P=100)
  Mai accessibili da P=500
  Garanzia assoluta: nessun utente aspetta per un slot write
  Con 10-20 agenti attivi: 8 slot coprono abbondantemente il picco

SYNC SLOTS — dinamici, scalano con RAM
  Solo per priority = 500
  Formula: SYNC_SLOTS = floor((RAM_disponibile_GB - 8) / 0.3)
  Es. CPX62 (32 GB, ~20 GB liberi dopo sistema): ~40 sync slot
  Es. server futuro (64 GB): ~80+ sync slot

Regola:
  task.priority ≤ 100 → WRITE_SLOTS (pool riservato, mai esaurito da sync)
  task.priority = 500 → SYNC_SLOTS (pool dinamico)
```

Con 40 sync slot e sync da 5-10s (HTTP) o 30-60s (Puppeteer):
- HTTP sync: 40 × 12 sync/min = 480 sync/min → 70 agenti × 5 tipi = 350 job ogni 5 min → smaltiti in ~44 secondi
- Puppeteer sync: 40 × 1 sync/min = 40/min → 350 job ogni 5 min → ~9 min per ciclo completo (migliorabile con HTTP discovery)

**Obiettivo freshness**: ciclo di sincronizzazione completo in ≤5 min con HTTP, ≤10 min con Puppeteer puro.

`acquireContext(userId, priority)` riceve la priority e verifica la disponibilità nel bucket corretto prima di assegnare un slot. Se il bucket è pieno → il task rimane in `status='enqueued'` nel Conductor, slot non consumato.

### Vincolo advisory lock — attesa massima per operazioni dirette

**Constraint critico**: `pg_advisory_xact_lock(userId)` serializza ALL'INTERNO del Conductor per userId. Se una sync è in esecuzione per userId X e arriva un submit-order, il submit attende il completamento della sync prima di acquisire il lock.

Mitigazione per fase:
- **Fase 1**: syncs Puppeteer brevi (batch piccoli + checkpoint ogni N items); attesa max ~30-60s
- **Fase 2 (HTTP)**: sync da 5-10s → attesa max ~10s, sostanzialmente impercettibile
- **Long-term**: sync-customer-addresses e sync-order-articles BG con preemption cooperativa (cedono il lock se P≤50 è in attesa)

### Lease model — addio al TTL 30 minuti

**Vecchio modello**: context cachato per-userId, TTL 30 min → 70 agenti = 70 context sempre in RAM (~10 GB). Insostenibile.

**Nuovo modello — Lease con warm window**:

```
Task Conductor inizia
  │
  ▼
acquireContext(userId, priority)
  ├─ slot disponibile? → assegna slot
  │    └─ sessione calda per userId? → riusa context (no re-login)
  │    └─ no sessione calda → login ERP → context pronto
  ├─ slot pieno? → task rimane enqueued, riprova ogni 5s
  │
  ▼
Esegue operazione ERP (1 sola, sequenziale per userId)
  │
  ▼
releaseContext(userId, contextHealthy)
  ├─ contextHealthy=false → logout + slot libero immediatamente
  └─ contextHealthy=true → warm window = 90 secondi
       ├─ se arriva altro task per userId entro 90s → riusa context
       └─ nessun task entro 90s → logout + slot liberato
```

**Effetto**: con 10-20 utenti attivi, in media 10-20 slot occupati al picco. Pool di 20 sufficiente. Il warm window ammortizza il costo del login ERP tra operazioni consecutive dello stesso utente (es. submit-order → sync-orders post-op → download-invoice-pdf).

### Sessione ERP — rispetto del design single-session

L'ERP Archibald è progettato per sessioni sequenziali monooperazione. Il sistema garantisce:
- **1 solo context attivo per userId** in qualsiasi momento (garantito da `pg_advisory_xact_lock`)
- **Operazioni sequenziali**: il Conductor non pickuppa un secondo task per userId mentre il primo è in esecuzione
- Il pool non assegna mai 2 slot allo stesso userId contemporaneamente

---

## Sezione 3 — Sync background nel Conductor

### Sync con browser (priority=500, SYNC_SLOTS)

Le sync `sync-orders`, `sync-customers`, `sync-ddt`, `sync-invoices`, `sync-customer-addresses` diventano task Conductor con `priority=500` e `requires_browser=TRUE`. Il scheduler (setInterval) le enqueua periodicamente per ogni agente attivo.

Idempotency: prima di enqueuing, il sync-scheduler verifica se esiste già un task `status IN ('enqueued','running')` dello stesso `task_type` per lo stesso `user_id`. Se sì, salta l'enqueue (non duplica). Questo check avviene lato scheduler, non nel Conductor stesso (che non ha deduplicazione per-type nativa).

### Sync senza browser (corsia separata)

`sync-order-states` e `sync-tracking` hanno `requires_browser=FALSE`. Il worker Conductor:
- Non chiama `acquireContext` per questi task
- Non acquisisce `pg_advisory_xact_lock` (non serve serializzazione — non accedono all'ERP)
- Li esegue in parallelo con le sync browser senza consumare slot

`sync-order-states` dipende da dati già sincronizzati (ordini, DDT, fatture). Il scheduler la enqueua con `run_after = now + 2min` come euristica per attendere il completamento delle sync precedenti (non è una dipendenza hard — le sync browser per lo stesso userId sono sequenzializzate dal Conductor, quindi sync-order-states verrà effettivamente eseguita dopo di loro anche senza `run_after`). Il `run_after` aggiunge solo un buffer di sicurezza.

### Sync condivise (prodotti, prezzi) — round-robin agenti

Nessun agente referente fisso. Al tick del scheduler per sync-products/sync-prices:

```
1. Query: agenti ordinati per last_shared_sync_at ASC da agents.agent_sync_state
   (nuovo campo da aggiungere: last_shared_sync_at TIMESTAMPTZ — traccia quando l'agente ha eseguito l'ultima sync condivisa)
2. Prendi il primo che non ha task browser in esecuzione
3. Enqueua sync-products con quel userId, priority=500
4. Se al tick successivo quel userId ha fallito → prende il secondo della lista
5. Il dato è identico per tutti → chiunque lo sincronizzi, tutti ne beneficiano
```

Nessun SPOF: se un agente ha problemi di credenziali, la sync passa automaticamente al prossimo agente disponibile.

### Post-operation sync (Garanzia G3)

Dopo ogni operazione ERP completata, il worker Conductor inserisce sync mirate con `priority=100` (on-demand, non background):

| Operazione completata | Sync enqueued |
|---|---|
| `submit-order` | `sync-orders(userId, P=100)` + `sync-order-articles(orderId, P=50)` |
| `edit-order` | `sync-orders(userId, P=100)` + `sync-order-articles(orderId, P=50)` |
| `delete-order` | `sync-orders(userId, P=100)` |
| `create-customer` | `sync-customers(userId, P=100)` |
| `update-customer` | `sync-customers(userId, P=100)` |

Queste sync hanno `priority=100` → scalzano le sync periodiche in coda, garantendo che i dati pertinenti all'operazione appena eseguita vengano aggiornati entro secondi (warm window del context le esegue senza re-login).

---

## Sezione 4 — Migration strategy: 3 fasi senza downtime

### Fase 1 — Conductor esteso + migrazione sync browser (2-3 settimane)

**Pre-requisiti**:
- Schema migration #082 applicata (priority, run_after, requires_browser)
- Feature flag `USE_CONDUCTOR_FOR_SYNCS` (default false → abilita progressivamente)

**Ordine di migrazione sync**:
1. `sync-order-articles` → già in Conductor, aggiungere `priority=100`
2. `sync-customer-addresses` → Conductor priority=500
3. `sync-orders`, `sync-customers` → Conductor priority=500 (drena BullMQ in parallelo)
4. `sync-ddt`, `sync-invoices` → Conductor priority=500
5. `sync-products`, `sync-prices` → Conductor priority=500, round-robin agenti

Per ogni tipo: 48h in shadow mode (entrambe le code attive, confronto risultati), poi cutover.

**Admin monitoring**: aggiornare `/monitoring/sync-history` e `SyncMonitoringDashboard` per leggere da `agent_operation_queue`. Risolve anche il DEGRADED falso positivo di `sync-order-articles`.

**Rollback**: `USE_CONDUCTOR_FOR_SYNCS=false` → BullMQ workers restano attivi durante tutta la Fase 1.

### Fase 2 — Discovery HTTP + session lifecycle (1-2 settimane)

**Discovery HTTP PDF** (script manuale su VPS prod):
```
1. Acquisisci context per un agente → login ERP → estrai cookies
2. Tenta HTTP fetch di ogni endpoint PDF con Cookie header
3. Confronta output (dimensione, contenuto) con download via Puppeteer
4. Documenta: quale endpoint risponde via HTTP? Quale richiede JS?
```

**Se HTTP funziona per alcune sync**:
- `HttpSyncHandler`: acquireContext → extract cookies (2-3s) → releaseContext → HTTP fetch PDF → parse
- Browser occupato 2-3 secondi invece di 30-120 → drastica riduzione pressione su SYNC_SLOTS

**Session lifecycle** (indipendente dall'HTTP):
- Implementare lease model con warm window 90s (sostituisce TTL 30-min fisso)
- Test di carico: 20 agenti attivi in simultanea, misurare slot utilization

### Fase 3 — Eliminazione BullMQ (1 settimana)

**Pre-condizioni**: tutte le sync migrate a Conductor + BullMQ queue svuotata (drain, non hard-stop).

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
Mantieni Redis per JWT revocation (auth)
Admin panel: dashboard Conductor-native, niente più BullMQ queue reads
```

**Timeline totale**: ~5-6 settimane, produzione sempre attiva.

---

## Sezione 5 — Error handling e circuit breaker

### Gerarchia errori

| Classe | Trigger | Risposta |
|---|---|---|
| **ERP globale** | 3+ userId falliscono nell'ultima finestra 5 min | Pausa tutti i job browser, `run_after = now + 10min` |
| **ERP per-utente** | Login fallito, sessione invalidata, 3 fail consecutivi | Circuit breaker per-userId, notifica admin, altri utenti non impattati |
| **Job specifico** | Errore form, ordine non trovato, PDF corrotto | Retry con backoff (Conductor: max_retries, error_class) |

Il circuit breaker globale è un **pre-check nel worker** prima di ogni `acquireContext`. Evita che un ERP down generi 70 retry contemporanei che saturano il pool.

### Pool exhaustion — backpressure sana

Se tutti i WRITE SLOTS sono occupati (scenario estremo: 12+ submit simultanei):
- Il task rimane in `status='enqueued'` nel Conductor
- WebSocket push al frontend: `JOB_QUEUED` con posizione stimata
- Frontend mostra "In coda — avvio imminente" (non un errore)
- Non appena si libera uno slot → il task viene pickuppato immediatamente

### Post-op sync failure isolation

Le sync post-operazione non devono mai far fallire l'operazione principale:

```typescript
// Worker Conductor, dopo completamento handler:
try {
  await enqueuePostOpSyncs(task);
} catch {
  logger.warn('Post-op sync enqueue failed', { taskId: task.taskId });
  // MAI throw — l'ordine è su ERP e in DB
}
```

Se una post-op sync fallisce → il periodic scheduler la recupera entro 10 minuti.

---

## Sezione 6 — Testing strategy

### Unità (aggiungere a suite esistente)

- `dispatcher.ts` — priority ordering: task P=10 pickuppato prima di P=500 nella stessa coda userId
- `browser-pool.ts` — slot reservation: task P=500 non ottiene WRITE SLOT quando SYNC_SLOTS pieni
- `sync-order-states.ts` — `detectOrderState`: già testata, mantenere invariata
- Post-op sync: dopo `submit-order` completato vengono enqueued `sync-orders` + `sync-order-articles`

### Integrazione

- Conductor con priority lanes: submit-order inserito durante sync in esecuzione → scalza correttamente
- Warm window: context riusato entro 90s, re-login dopo 90s di inattività
- Round-robin shared sync: agente fallisce → sync passa al successivo al ciclo successivo

### Discovery test (Fase 2, script manuale)

Script Node.js one-shot: autentica via browser → estrae cookies → prova ogni endpoint PDF via HTTP → confronta output. Eseguire su VPS prod con ERP reale.

### Load test (directory `load-tests` esistente)

Simulare 70 agenti: 10 sync BG per utente + 2-3 submit-order simultanei. Misurare:
- Latenza P50/P95 per slot acquisition nel browser pool
- Queue depth nel Conductor per userId
- RAM e CPU del browser pool (target: < 8 GB per 20 context)
- Zero interferenze: nessun userId vede contaminazione di sessione di un altro

---

## Decisioni aperte (da risolvere in Fase 2)

| Decisione | Opzioni | Dipende da |
|---|---|---|
| PDF sync via HTTP? | HTTP fetch vs Puppeteer | Discovery test su ERP |
| Dimensione warm window | 60s / 90s / 120s | Load test latenza login |
| SYNC_SLOTS iniziali | Basati su RAM disponibile dopo upgrade | Hardware effettivo CPX62+ |
| Frequenza sync agenti attivi | 5 min (target) | Discovery HTTP + SYNC_SLOTS disponibili |

---

## Operazioni fuori scope (da completare in futuro)

Le seguenti operazioni esistono nel codice ma non sono state completate e rimangono su BullMQ enrichment fino a nuova valutazione:

| Operazione | Stato | Azione |
|---|---|---|
| `catalog-ingestion` | Non completata | Mantenere su BullMQ; migrare a Conductor P=500 quando feature completata |
| `catalog-product-enrichment` | Non completata | Idem |
| `web-product-enrichment` | Non completata | Idem |
| `recognition-feedback` | Non completata | Idem |
| `re-extract-pictograms` | Non completata | Idem |

Queste operazioni non richiedono sessione ERP per-agente e sono triggerate raramente da admin. Quando la feature verrà ripresa: verificare se la funzionalità è ancora rilevante, poi migrare al Conductor con `requires_browser=FALSE, priority=500` oppure rimuovere.

---

## Hardware upgrade consigliato

**Da CPX32** (4 vCPU, 8 GB RAM, €17/mo)  
**A CPX62** (16 vCPU, 32 GB RAM, €62/mo) — passo immediato  
**Upgrade futuro** (32 vCPU, 64 GB+) — se il carico a regime lo richiede

Timing: upgrade a CPX62 prima di abilitare i primi agenti in produzione. Il testing iniziale avverrà con un pool di ~10 agenti di controllo — l'architettura è già dimensionata per 70+ e non richiederà modifiche al codice al crescere degli agenti, solo all'hardware.

Stima RAM browser pool (formula dinamica):
- CPX62 (32 GB): ~20 GB liberi → ~40 SYNC SLOTS + 8 WRITE SLOTS = 48 context totali
- Server futuro (64 GB): ~50 GB liberi → ~80+ SYNC SLOTS
- Ogni context Chromium: ~300 MB con pagina carica

# Unified Operation Queue - Design Document

**Data:** 2026-02-19
**Stato:** Approvato
**Scope:** Refactoring completo del sistema bot/sync/queue + migrazione PostgreSQL

---

## 1. Contesto e Problema

### Stato Attuale

La PWA Archibald gestisce 15 tipi di operazioni che loggano su Archibald ERP via Puppeteer. Il sistema attuale presenta:

- **5 livelli di lock sovrapposti** (`activeOperation`, `SyncOrchestrator` mutex, `PriorityManager`, `withUserActionLock`, `BrowserPool` per-user lock)
- **Solo 1 operazione su 15 in coda BullMQ** (submit-order). Le altre 14 girano senza serializzazione controllata.
- **Force-stop nucleare** che interrompe tutti i sync dopo 10 secondi se un ordine non riesce ad acquisire il lock
- **BrowserPool con 2 context hardcoded**, single point of failure (1 processo Chrome)
- **Database SQLite senza WAL** su 4 database su 5, bloccante per scritture concorrenti
- **`index.ts` da 8181 righe** con logica, route, lock e orchestrazione mescolati

### Conseguenze

- Operazioni utente falliscono perche interferiscono con sync in corso
- Sync interrotti a meta dal force-stop causano dati parziali
- Il sistema non scala oltre 1 agente

### Target

- **60+ agenti** con credenziali Archibald proprie
- **Moduli attivabili/disattivabili** per agente (non tutti usano il bot)
- **Zero fallimenti** per operazioni utente
- Codebase pulito, organizzato, scalabile, sicuro

---

## 2. Dati Condivisi vs Per-Agente

| Dato | Scope | Credenziali |
|------|-------|-------------|
| Prodotti | Condiviso tra tutti | Service account |
| Prezzi | Condiviso tra tutti | Service account |
| Clienti | Per-agente | Credenziali agente |
| Ordini | Per-agente | Credenziali agente |
| DDT | Per-agente | Credenziali agente |
| Fatture | Per-agente | Credenziali agente |
| Pending orders | Per-agente | N/A (database locale) |
| Storico ordini (FT) | Per-agente | N/A (database locale) |
| Warehouse | Per-agente | N/A (database locale) |

---

## 3. Architettura Proposta

### 3.1 Coda Unificata (Unified Operation Queue)

Una sola coda BullMQ `"operations"` gestisce TUTTE le operazioni che toccano Archibald. Nessuna eccezione.

```
Frontend (multi-dispositivo)
    |
    +--> POST /api/operations/enqueue
    |      { type, userId, priority, data, idempotencyKey }
    |
    v
+--------------------------------------------------+
|           BullMQ Queue: "operations"              |
|           Redis-backed                            |
|                                                   |
|  Sorted by BullMQ priority (1 = max, 15 = min)   |
|  FIFO within same priority level                  |
|  Concurrency: env.QUEUE_CONCURRENCY (default: 5)  |
+-------------------------+------------------------+
                          |
                          v
+--------------------------------------------------+
|              WORKER PROCESSOR                     |
|                                                   |
|  Per ogni job:                                    |
|  1. Acquire per-agent lock (Map<userId, Promise>) |
|     - Se agent gia attivo: re-enqueue (delay 2s)  |
|  2. Preemption check:                             |
|     - Se write (prio 1-6) e agent ha sync attivo: |
|       requestStop() al sync -> checkpoint -> stop  |
|  3. Acquire BrowserContext da BrowserPool          |
|  4. Execute operation via handler                  |
|  5. Release BrowserContext                         |
|  6. Release per-agent lock                         |
|  7. Broadcast risultato via WebSocket              |
+--------------------------------------------------+
```

### 3.2 Lista Completa Operazioni e Priorita

```
Prio  Tipo                   Categoria    Scope
----  ----                   ---------    -----
1     submit-order           WRITE        Per-agente
2     create-customer        WRITE        Per-agente
3     update-customer        WRITE        Per-agente
4     send-to-verona         WRITE        Per-agente
5     edit-order             WRITE        Per-agente
6     delete-order           WRITE        Per-agente
7     download-ddt-pdf       READ on-dem  Per-agente
8     download-invoice-pdf   READ on-dem  Per-agente
9     sync-order-articles    READ on-dem  Per-agente
10    sync-customers         READ sched   Per-agente
11    sync-orders            READ sched   Per-agente
12    sync-ddt               READ sched   Per-agente
13    sync-invoices          READ sched   Per-agente
14    sync-products          READ sched   Condiviso (service-account)
15    sync-prices            READ sched   Condiviso (service-account)
```

WRITE (1-6): Operazioni utente che scrivono su Archibald. Mai falliscono per interferenza.
READ on-demand (7-9): Utente attende il risultato. Priorita sopra i sync schedulati.
READ scheduled (10-15): Background sync, interrompibili via checkpoint.

### 3.3 Per-Agent Serialization

Due job dello STESSO agente non girano mai in parallelo. Garantito da un lock in-memory nel processor:

```
activeAgentJobs: Map<userId, { jobId, type, abortController }>

Prima di eseguire:
  if activeAgentJobs.has(userId):
    se job corrente e sync (prio 10-15) e nuovo job e write (prio 1-6):
      -> requestStop() sul sync corrente
      -> sync si ferma al checkpoint
      -> sync re-enqueued automaticamente
      -> nuovo job parte
    altrimenti:
      -> re-enqueue con delay 2s, stessa priorita
  else:
    -> segna come attivo, procedi
```

Agenti diversi girano in totale parallelo (credenziali separate, sessioni indipendenti).

### 3.4 Smart Customer Sync

La sessione interattiva di creazione cliente diventa un singolo job `create-customer` nella coda. L'agente non puo fare altre operazioni nel frattempo (per-agent lock lo garantisce).

Lo smart customer sync on-demand diventa:

```
queue.add('sync-customers', { userId }, { priority: 2 });
```

Priorita alta (2) lo fa passare davanti ai sync schedulati. Il per-agent lock garantisce che non interferisca con ordini.

### 3.5 Auto-Sync Scheduler

Semplice timer che accoda job sync alla coda unificata:

```
Per ogni agente con modulo sync attivo:
  setInterval(() => {
    queue.add('sync-customers', { userId }, { priority: 10 });
    queue.add('sync-orders',    { userId }, { priority: 11 });
    queue.add('sync-ddt',       { userId }, { priority: 12 });
    queue.add('sync-invoices',  { userId }, { priority: 13 });
  }, agentSyncIntervalMs);

Per dati condivisi:
  setInterval(() => {
    queue.add('sync-products', { userId: 'service-account' }, { priority: 14 });
    queue.add('sync-prices',   { userId: 'service-account' }, { priority: 15 });
  }, sharedSyncIntervalMs);
```

Nessun mutex, nessun staggered delay, nessun smart sync con reference counting. La coda gestisce tutto.

---

## 4. BrowserPool Scalato

### Stato Attuale

- 1 processo Chrome (`puppeteer.launch()`)
- Max 2 `BrowserContext` hardcoded
- Se Chrome crasha, tutte le sessioni muoiono
- LRU eviction aggressiva

### Design Proposto

```
Browser Pool Manager
|
+-- Browser Process 1 --+-- Context Agent-A
|                        +-- Context Agent-B
|                        +-- ... (fino a MAX_CTX_PER_BROWSER)
|
+-- Browser Process 2 --+-- Context Agent-C
|                        +-- Context Agent-D
|                        +-- ...
|
+-- Browser Process N --+-- Context service-account
                         +-- Context Agent-E
                         +-- ...
```

Configurazione via environment:

```
MAX_BROWSERS=3              # Processi Chrome (default: 3)
MAX_CTX_PER_BROWSER=8       # Context per processo (default: 8)
CONTEXT_EXPIRY_MS=3600000   # 1 ora (default)
```

Totale: 24 sessioni simultanee (ampiamente sufficiente per ~15-20 agenti con bot attivo).

Crash isolation: se un processo Chrome crasha, solo i suoi agenti sono impattati. Gli altri processi continuano.

Assegnamento context: round-robin sul processo con meno context attivi.

API pubblica invariata per i consumer:

```
const context = await browserPool.acquireContext(userId, { fromQueue: true });
// ... operazione ...
browserPool.releaseContext(userId, context, success);
```

Safety net: se `fromQueue` e `false`, logga un WARNING per individuare operazioni non migrate.

---

## 5. Migrazione Database: SQLite -> PostgreSQL

### Motivazione

- SQLite: 1 writer alla volta anche con WAL. Blocca event loop (sincrono).
- PostgreSQL: scritture parallele (row-level locking), async I/O, JSONB, connection pooling.
- Con 60+ agenti, SQLite diventa bottleneck. Meglio migrare ora in un unico refactoring.

### Tech Stack

- `pg` + `pg-pool` (SQL raw, minimo cambio concettuale rispetto a better-sqlite3)
- Prepared statements parametrizzati (`$1, $2, $3`)
- Connection pool: 20-50 connessioni configurabili

### Schema PostgreSQL

```
Schema: shared
  products              -- Catalogo condiviso
  product_variants
  prices
  price_history
  sync_metadata         -- Stato sync condivisi

Schema: agents
  users
  devices
  customers             -- Per-agente
  subclients
  pending_orders        -- Per-agente
  order_records         -- Per-agente
  order_articles
  order_state_history
  fresis_history        -- Per-agente
  fresis_discounts
  warehouse_boxes
  warehouse_items
  pending_change_log
  agent_sync_state      -- Stato sync per-agente

Schema: system
  admin_sessions
  sync_events           -- Log audit
  job_history           -- Storico operazioni
```

### Cambio Pattern nel Codice

```typescript
// PRIMA (better-sqlite3, sincrono, blocca event loop)
const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

// DOPO (pg, asincrono, non blocca event loop)
const { rows: [row] } = await pool.query(
  'SELECT * FROM orders WHERE id = $1',
  [orderId]
);
```

### Deployment

PostgreSQL sul VPS via Docker Compose:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: archibald
      POSTGRES_USER: archibald
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    ports:
      - "127.0.0.1:5432:5432"
    restart: unless-stopped
```

### Migrazione Dati

Script one-shot per migrare dati esistenti da SQLite a PostgreSQL:
1. Legge ogni tabella SQLite
2. Converte tipi (TEXT date -> TIMESTAMPTZ, TEXT json -> JSONB, etc.)
3. Inserisce in PostgreSQL con batch insert
4. Verifica conteggi e integrita referenziale

---

## 6. Error Handling

### Pattern Unico

```typescript
async processJob(job) {
  const { userId, type, data } = job.data;

  try {
    await this.acquireAgentLock(userId);
    const context = await browserPool.acquireContext(userId, { fromQueue: true });

    try {
      const result = await this.executeOperation(type, data, context, job);
      browserPool.releaseContext(userId, context, true);
      wsService.broadcast(userId, { event: 'JOB_COMPLETED', jobId: job.id, result });
      return result;
    } catch (error) {
      browserPool.releaseContext(userId, context, false);
      throw error;
    }
  } catch (error) {
    wsService.broadcast(userId, { event: 'JOB_FAILED', jobId: job.id, error });
    throw error;
  } finally {
    this.releaseAgentLock(userId);
  }
}
```

- `finally` garantisce rilascio lock: zero lock orfani
- Context rilasciato con `false` viene rimosso dal pool
- BullMQ traccia tutti i failed jobs
- WebSocket notifica il frontend in tempo reale
- Nessun "nuclear reset" necessario

### Retry Strategy

```
Tipo                    Auto-retry  Max tentativi  Backoff
submit-order            NO          1              -
edit/delete/verona      NO          1              -
create/update-customer  NO          1              -
download-ddt/invoice    SI          2              5s
sync-*                  SI          3              30s, 60s, 120s
```

Operazioni utente (write): nessun auto-retry. Errori sono tipicamente deterministici. L'utente riceve feedback immediato e puo ritentare manualmente.

Operazioni background (sync): auto-retry con backoff esponenziale. Errori transient (network, timeout) si risolvono da soli.

---

## 7. Monitoring

### Dashboard Unica

```
GET /api/operations/dashboard

{
  queue: {
    waiting: number,
    active: number,
    completed: number,
    failed: number
  },
  activeJobs: [
    { id, type, userId, startedAt, progress }
  ],
  agentStatus: {
    [userId]: { currentJob, queuedJobs }
  },
  browserPool: {
    browsers: number,
    activeContexts: number,
    maxContexts: number
  },
  syncSchedule: {
    [syncType]: { intervalMs, lastRun, nextRun }
  },
  recentHistory: [
    { id, type, userId, status, duration, completedAt }
  ]
}
```

### Endpoint Operativi

```
POST   /api/operations/enqueue           Accoda operazione
GET    /api/operations/:jobId/status     Stato singolo job
GET    /api/operations/user/:userId      Job per agente
POST   /api/operations/:jobId/retry      Ritenta job fallito
POST   /api/operations/:jobId/cancel     Cancella job in attesa
GET    /api/operations/dashboard          Dashboard completa
GET    /api/operations/stats              Statistiche aggregate
```

---

## 8. Sicurezza

| Aspetto | Implementazione |
|---------|-----------------|
| SQL injection | Prepared statements parametrizzati (`$1, $2`) |
| Auth operazioni | JWT obbligatorio su `/api/operations/*` |
| Admin endpoints | `requireAdmin` middleware su TUTTI gli endpoint admin |
| Credenziali agente | Colonna encrypted in PostgreSQL + PasswordCache in memoria |
| Rate limiting | `express-rate-limit` per-endpoint |
| Browser context | Esclusivo per durata job (no condivisione tra operazioni) |
| CORS | Origin whitelist configurabile |
| Helmet | Security headers su tutte le response |

---

## 9. Struttura Codebase

```
backend/src/
+-- config.ts                       Config + PG connection string
+-- server.ts                       Express setup, middleware, avvio
|
+-- operations/                     Cuore del sistema
|   +-- operation-queue.ts          BullMQ queue + worker setup
|   +-- operation-processor.ts      Dispatcher: type -> handler
|   +-- operation-types.ts          OperationType, OperationJobData, etc.
|   +-- agent-lock.ts              Per-agent serialization
|   +-- handlers/                   Un handler per tipo di operazione
|       +-- submit-order.ts
|       +-- edit-order.ts
|       +-- delete-order.ts
|       +-- send-to-verona.ts
|       +-- create-customer.ts
|       +-- update-customer.ts
|       +-- download-ddt-pdf.ts
|       +-- download-invoice-pdf.ts
|       +-- sync-order-articles.ts
|
+-- sync/                           Sync pulito
|   +-- sync-scheduler.ts           Timer semplice -> accoda job
|   +-- services/                   Sync services senza mutex
|       +-- customer-sync.ts
|       +-- order-sync.ts
|       +-- ddt-sync.ts
|       +-- invoice-sync.ts
|       +-- product-sync.ts
|       +-- price-sync.ts
|
+-- bot/                            Bot pulito
|   +-- archibald-bot.ts           Classe bot (Puppeteer operations)
|   +-- browser-pool.ts            Pool multi-browser scalato
|   +-- devexpress-helpers.ts      Utility per controlli DevExpress
|
+-- db/                             PostgreSQL
|   +-- pool.ts                    pg-pool setup
|   +-- migrations/                Schema migrations
|   +-- repositories/              Un repository per dominio
|       +-- orders.ts
|       +-- customers.ts
|       +-- products.ts
|       +-- prices.ts
|       +-- users.ts
|       +-- warehouse.ts
|       +-- fresis-history.ts
|
+-- routes/                         API pulite
|   +-- operations.ts              /api/operations/*
|   +-- auth.ts                    /api/auth/*
|   +-- customers.ts               /api/customers/*
|   +-- products.ts                /api/products/*
|   +-- orders.ts                  /api/orders/*
|   +-- warehouse.ts               /api/warehouse/*
|   +-- fresis-history.ts          /api/fresis-history/*
|   +-- sync-status.ts            /api/sync/*
|   +-- admin.ts                   /api/admin/*
|   +-- share.ts                   /api/share/*
|
+-- realtime/                       WebSocket + SSE
|   +-- websocket-server.ts
|   +-- sse-progress.ts
|
+-- utils/                          Utility condivise
    +-- logger.ts
    +-- pdf-parser.ts
    +-- job-progress-mapper.ts
```

Principi:
- Ogni cartella ha UNA responsabilita
- Zero singleton globali. Pool PG passato via dependency injection.
- Zero file da migliaia di righe. Moduli da 100-300 righe.
- Route separate da logica. Le route validano input e accodano job.
- Un handler, un'operazione. Leggibile, testabile.
- Zero codice legacy, zero alias, zero wrapper.

---

## 10. Cosa Viene Eliminato

```
FILE ELIMINATI:
  priority-manager.ts              ~144 righe
  sync-scheduler.ts (legacy)       ~645 righe
  session-cache-manager.ts         ~136 righe
  session-cleanup-job.ts           ~80 righe

CODICE ELIMINATO DA index.ts (file smantellato):
  withUserActionLock()             ~60 righe
  acquireOrderLock/releaseOrderLock ~90 righe
  acquireSyncLock/releaseSyncLock  ~20 righe
  forceStopAllSyncs()              ~120 righe
  activeOperation globale          ~10 righe
  Tutte le route inline            ~5000+ righe

REFACTORED (logica spostata in moduli puliti):
  sync-orchestrator.ts             Mutex eliminato, scheduler semplificato
  queue-manager.ts                 Sostituito da operations/operation-queue.ts
  Tutte le *-sync-service.ts       Spostati in sync/services/, mutex rimosso
  Tutti i routes/*.ts              Riscritti puliti senza raw new Database()

DIPENDENZE RIMOSSE:
  better-sqlite3                   Sostituito da pg
  dexie (se ancora presente)       Gia rimosso
```

---

## 11. Migrazione Frontend

Il frontend viene aggiornato in parallelo per usare i nuovi endpoint:

```
PRIMA:                              DOPO:
POST /api/bot/submit-orders     ->  POST /api/operations/enqueue
POST /api/orders/:id/edit-*     ->  POST /api/operations/enqueue
POST /api/orders/:id/delete-*   ->  POST /api/operations/enqueue
POST /api/orders/:id/send-to-*  ->  POST /api/operations/enqueue
POST /api/customers             ->  POST /api/operations/enqueue
PUT  /api/customers/:id         ->  POST /api/operations/enqueue
POST /api/sync/:type            ->  POST /api/operations/enqueue
GET  /api/orders/status/:jobId  ->  GET  /api/operations/:jobId/status
GET  /api/queue/stats           ->  GET  /api/operations/stats
GET  /api/sync/status           ->  GET  /api/operations/dashboard
```

I vecchi endpoint NON vengono mantenuti come alias. Clean cut.

---

## 12. Vincoli e Decisioni

| Decisione | Motivazione |
|-----------|-------------|
| Una sola coda BullMQ (non N per-agente) | Piu semplice, stessa efficacia. BullMQ priority + per-agent lock nel processor. |
| PostgreSQL subito (non SQLite+WAL) | Un solo grande refactoring invece di due. SQLite non scala a 60 agenti. |
| `pg` raw (non ORM) | Minimo cambio concettuale da better-sqlite3. Massimo controllo. |
| Concurrency configurabile via env | Scala senza ricompilare. Default 5, aumenta con gli agenti. |
| Clean cut (no alias) | Niente codice legacy, niente refusi, niente ambiguita. |
| Multi-browser process | Crash isolation. Un Chrome che crasha non uccide tutti. |
| Per-agent lock nel processor | Piu semplice di code separate. Stessa garanzia di serializzazione. |
| Preemption graceful via checkpoint | Niente force-stop nucleare. Sync si ferma pulito e riprende. |

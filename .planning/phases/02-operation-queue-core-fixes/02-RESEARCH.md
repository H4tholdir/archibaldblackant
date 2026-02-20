# Phase 2: Operation Queue Core Fixes - Research

**Researched:** 2026-02-20
**Domain:** BullMQ job queue patterns (preemption, cancellation, deduplication, timeout)
**Confidence:** HIGH

<research_summary>
## Summary

Ricerca approfondita sui pattern BullMQ per risolvere i 4 problemi critici della operation queue: shouldStop non collegato, preemption con race condition, assenza di timeout, e deduplicazione basata su timestamp.

Scoperta chiave: BullMQ v5 (il progetto usa v5.66.4) ha **funzionalità native** per 3 dei 4 problemi che attualmente vengono gestiti con codice custom:
- **Job cancellation con AbortSignal** (3° parametro del processor) — sostituisce il pattern shouldStop manuale
- **Deduplication built-in** (`deduplication: { id: '...' }`) — sostituisce l'idempotencyKey basato su timestamp
- **Pattern timeout documentato** (AbortController + setTimeout) — copre l'assenza di timeout

Il 4° problema (preemption) richiede logica custom perché BullMQ non supporta nativamente l'interruzione di job attivi per priorità. Tuttavia, combinando `worker.cancelJob()` con l'AbortSignal, la preemption diventa molto più affidabile del wait fisso attuale di 2 secondi.

**Raccomandazione primaria:** Adottare le feature native BullMQ (AbortSignal, deduplication) invece di mantenere la logica custom. Questo riduce il codice, aumenta l'affidabilità, e si allinea con i pattern documentati dalla libreria.
</research_summary>

<standard_stack>
## Standard Stack

### Core (già nel progetto)
| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| bullmq | ^5.66.4 | Job queue Redis-based | Già installato, ha feature native per dedup + cancellation non ancora sfruttate |
| ioredis | (dep bullmq) | Redis client | Già in uso tramite BullMQ |

### Feature BullMQ native non ancora utilizzate
| Feature | Disponibile da | Scopo | Stato nel progetto |
|---------|---------------|-------|--------------------|
| `deduplication: { id }` | v5.x | Prevenire job duplicati | NON usato — usa timestamp come idempotencyKey |
| Worker `signal` (3° param) | v5.x | AbortSignal per cancellazione | NON usato — worker ha solo `(job) => {}` |
| `worker.cancelJob(id)` | v5.x | Cancellare job attivo | NON usato |
| `UnrecoverableError` | v5.x | Errore non ritentabile | NON usato |

### Non serve nulla di nuovo
Tutti i problemi di Phase 2 sono risolvibili con le feature native di BullMQ v5 già installato. Non servono librerie aggiuntive.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Pattern 1: AbortSignal nel Worker Processor
**Cosa:** Il processor BullMQ accetta un 3° parametro `signal` (AbortSignal) che viene abortito quando si chiama `worker.cancelJob(jobId)`.
**Quando usare:** Sempre — è il meccanismo standard per cancellazione graceful in BullMQ.
**Stato attuale nel progetto:**
```typescript
// ATTUALE — manca signal
const worker = new Worker('operations', async (job) => {
  await processor.processJob({
    id: job.id ?? '',
    data: job.data,
    updateProgress: (p) => job.updateProgress(p),
  });
}, { connection, concurrency: 1 });
```
**Pattern corretto:**
```typescript
// Source: https://docs.bullmq.io/guide/workers/cancelling-jobs
const worker = new Worker('operations', async (job, token, signal) => {
  await processor.processJob({
    id: job.id ?? '',
    data: job.data,
    updateProgress: (p) => job.updateProgress(p),
    signal, // <-- passare il signal al processor
  });
}, { connection, concurrency: 1 });
```

### Pattern 2: Conversione AbortSignal → shouldStop()
**Cosa:** I sync service accettano `shouldStop: () => boolean`. L'AbortSignal BullMQ deve essere convertito in questo pattern.
**Quando usare:** Nei sync handler che chiamano i sync service.
**Stato attuale nel progetto:**
```typescript
// ATTUALE — shouldStop hardcoded a false
return async (context, _data, userId, onProgress) => {
  const result = await syncCustomers(deps, userId, onProgress, () => false);
};
```
**Pattern corretto:**
```typescript
// AbortSignal → shouldStop bridge
return async (context, _data, userId, onProgress, signal) => {
  let stopped = false;
  signal?.addEventListener('abort', () => { stopped = true; });
  const result = await syncCustomers(deps, userId, onProgress, () => stopped);
};
```

### Pattern 3: Deduplication BullMQ nativa
**Cosa:** Usare `deduplication: { id }` nelle opzioni del job per prevenire duplicati.
**Quando usare:** Per sync schedulati (evitare 2 sync-customers per lo stesso utente), e per operazioni write (evitare doppio submit).
**Stato attuale:**
```typescript
// ATTUALE — idempotencyKey è timestamp-based, NON idempotente
idempotencyKey: idempotencyKey ?? `${type}-${userId}-${Date.now()}`
```
**Pattern corretto:**
```typescript
// Source: https://docs.bullmq.io/guide/jobs/deduplication
// Per sync schedulati — deduplica finché il job è attivo (Simple mode)
await queue.add(type, jobData, {
  ...options,
  deduplication: { id: `${type}-${userId}` },
});

// Per operazioni write — deduplica con TTL (Throttle mode)
await queue.add(type, jobData, {
  ...options,
  deduplication: { id: `submit-order-${userId}-${orderId}`, ttl: 30000 },
});
```

### Pattern 4: Timeout con AbortController
**Cosa:** Wrappare l'esecuzione dell'handler in un timeout usando AbortController.
**Quando usare:** Per ogni handler — protegge da hang di Puppeteer/rete.
**Pattern:**
```typescript
// Source: https://docs.bullmq.io/patterns/timeout-jobs
const HANDLER_TIMEOUTS: Record<string, number> = {
  'submit-order': 120_000,     // 2 min
  'sync-customers': 300_000,   // 5 min
  'sync-orders': 300_000,      // 5 min
  'download-ddt-pdf': 60_000,  // 1 min
  // ... etc
};

async function processWithTimeout(handler, context, data, userId, onProgress, signal, timeoutMs) {
  const controller = new AbortController();
  // Combina timeout + signal BullMQ
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener('abort', () => controller.abort());

  try {
    return await handler(context, data, userId, onProgress, controller.signal);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new UnrecoverableError('Handler timeout');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
```

### Pattern 5: Preemption con cancelJob
**Cosa:** Invece del wait fisso di 2 secondi, usare `worker.cancelJob(jobId)` + attendere il rilascio del lock.
**Stato attuale:**
```typescript
// ATTUALE — wait fisso, race condition
if (acquireResult.preemptable) {
  activeJob.requestStop?.();
  await new Promise(resolve => setTimeout(resolve, 2000)); // PROBLEMA
  acquireResult = agentLock.acquire(...);
}
```
**Pattern corretto:**
```typescript
// Preemption con cancellazione reale + polling del lock
if (acquireResult.preemptable) {
  worker.cancelJob(activeJob.jobId);

  // Attendi rilascio lock con timeout
  const maxWait = 30_000; // 30s max
  const pollInterval = 500;
  let waited = 0;
  while (waited < maxWait) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    waited += pollInterval;
    acquireResult = agentLock.acquire(userId, jobId, type);
    if (acquireResult.acquired) break;
  }
}
```

### Anti-Pattern da evitare
- **shouldStop hardcoded a `() => false`:** Rende la preemption impossibile. Ogni handler DEVE collegare shouldStop all'AbortSignal.
- **Wait fisso per preemption:** Il sync potrebbe terminare in 100ms o impiegare 30s. Un wait fisso è sempre sbagliato.
- **Timestamp come idempotencyKey:** `Date.now()` genera un valore unico per ogni chiamata, rendendo la deduplicazione inutile.
- **Nessun timeout su handler:** Se Puppeteer si blocca, il worker si blocca per sempre.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problema | Non costruire | Usa invece | Perché |
|----------|---------------|------------|--------|
| Deduplicazione job | idempotencyKey con timestamp | BullMQ `deduplication: { id }` | BullMQ gestisce atomicamente in Redis, nessuna race condition |
| Cancellazione job | requestStop callback manuale | BullMQ `worker.cancelJob(id)` + AbortSignal | Integrato con lock renewal, stalled detection, cleanup |
| Timeout handler | Nessuno (mancante) | AbortController + setTimeout (pattern BullMQ) | Standard documentato, si compone con AbortSignal nativo |
| Evento deduplicazione | Log manuale | BullMQ `queueEvents.on('deduplicated')` | Evento nativo con jobId e deduplicationId |
| Retry con backoff | Logica custom di requeue | BullMQ `attempts` + `backoff` nelle job options | Già parzialmente in uso, estendere alle write operations |

**Insight chiave:** Il progetto ha implementato manualmente pattern che BullMQ v5 offre nativamente. Migrare alle feature native riduce codice, bug e manutenzione.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: AbortSignal ignorato nei loop lunghi
**Cosa succede:** Il sync controlla shouldStop prima del loop DB, ma NON dentro il `for (const customer of parsedCustomers)`. Con centinaia di clienti, il loop può durare minuti senza controllare.
**Perché succede:** I shouldStop check sono solo tra le macro-fasi (download, parse, DB), non dentro i loop.
**Come evitare:** Aggiungere `if (shouldStop()) throw new SyncStoppedError('db-loop')` ogni N iterazioni (es. ogni 10-20 item) dentro i loop di insert/update.
**Segnali di allarme:** Un sync-customers con 500 clienti non risponde alla preemption per minuti.

### Pitfall 2: Lock non rilasciato dopo cancellazione
**Cosa succede:** Se l'handler viene cancellato via AbortSignal ma il `finally` block nel processor non esegue `agentLock.release()`, il lock rimane bloccato.
**Perché succede:** Il catch/finally deve gestire correttamente sia errori normali che AbortError.
**Come evitare:** Il `finally` block nel `processJob` già fa `agentLock.release()`. Verificare che funzioni anche con AbortError.
**Segnali di allarme:** Dopo una preemption, l'utente rimane bloccato e nessun job parte.

### Pitfall 3: Stalled job con timeout troppo aggressivo
**Cosa succede:** Se il timeout dell'handler è più corto del `stalledInterval` di BullMQ (default 30s), il job può essere considerato "stalled" e riassegnato.
**Perché succede:** BullMQ ha un suo meccanismo di stalled detection indipendente dal timeout custom.
**Come evitare:** Assicurarsi che `lockDuration` del worker sia >= al timeout massimo dell'handler. Per sync lunghi (5 min), impostare `lockDuration: 600_000`.
**Segnali di allarme:** Job che vengono processati 2 volte, errori "job stalled" nei log.

### Pitfall 4: Deduplication e retry in conflitto
**Cosa succede:** Se un job fallisce e deve essere ritentato, ma la deduplication in Simple mode blocca il retry.
**Perché succede:** In Simple mode, la deduplication persiste finché il job non completa o fallisce definitivamente.
**Come evitare:** Per job con retry, usare Throttle mode con TTL appropriato invece di Simple mode. Oppure lasciare che BullMQ gestisca i retry nativamente (il job rimane lo stesso, non viene ri-accodato).
**Segnali di allarme:** Job falliti che non vengono mai ritentati.

### Pitfall 5: Browser context leak durante cancellazione
**Cosa succede:** Se il handler viene cancellato dopo `browserPool.acquireContext` ma prima di `releaseContext`, il browser resta allocato.
**Perché succede:** L'abort interrompe l'esecuzione tra acquire e release.
**Come evitare:** Il `try/catch/finally` nel processJob deve SEMPRE chiamare `releaseContext`. Verificare che il path di cancellazione passi per il finally.
**Segnali di allarme:** Dopo alcune preemption, il browser pool si esaurisce.
</common_pitfalls>

<code_examples>
## Code Examples

### Esempio 1: Worker con AbortSignal (da implementare)
```typescript
// Source: https://docs.bullmq.io/guide/workers/cancelling-jobs
import { Worker, UnrecoverableError } from 'bullmq';

const worker = new Worker('operations', async (job, token, signal) => {
  await processor.processJob({
    id: job.id ?? '',
    data: job.data,
    updateProgress: (p) => job.updateProgress(p),
    signal, // AbortSignal nativo BullMQ
  });
}, {
  connection: { host: redisHost, port: redisPort },
  concurrency: 1,
  lockDuration: 600_000, // 10 min per sync lunghi
});
```

### Esempio 2: Deduplication per sync schedulati
```typescript
// Source: https://docs.bullmq.io/guide/jobs/deduplication
async function enqueue(type, userId, data) {
  const jobData = { type, userId, data, timestamp: Date.now() };
  const options = getJobOptions(type);

  if (isScheduledSync(type)) {
    // Simple mode: blocca duplicati finché il job è attivo
    options.deduplication = { id: `${type}-${userId}` };
  }

  const job = await queue.add(type, jobData, options);
  return job.id!;
}
```

### Esempio 3: Bridge AbortSignal → shouldStop nei sync handler
```typescript
// Pattern per convertire AbortSignal in shouldStop callback
function createSyncCustomersHandler(deps, createBot): OperationHandler {
  return async (context, _data, userId, onProgress, signal) => {
    let stopped = false;
    signal?.addEventListener('abort', () => { stopped = true; });

    const bot = createBot(userId);
    const result = await syncCustomers(
      { pool: deps.pool, downloadPdf: () => bot.downloadCustomersPDF(context), ... },
      userId,
      onProgress,
      () => stopped, // collegato all'AbortSignal
    );
    return result;
  };
}
```

### Esempio 4: Preemption con cancelJob
```typescript
// Source: pattern derivato da https://docs.bullmq.io/guide/workers/cancelling-jobs
async function attemptPreemption(worker, agentLock, activeJob, userId, newJobId, type) {
  // Cancella il job attivo via BullMQ — triggera AbortSignal
  worker.cancelJob(activeJob.jobId);

  // Poll per il rilascio del lock con timeout
  const MAX_WAIT = 30_000;
  const POLL = 500;
  let waited = 0;

  while (waited < MAX_WAIT) {
    await new Promise(r => setTimeout(r, POLL));
    waited += POLL;
    const result = agentLock.acquire(userId, newJobId, type);
    if (result.acquired) return result;
  }

  // Timeout — il job verrà riaccodato
  return { acquired: false, preemptable: false };
}
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Vecchio approccio | Approccio attuale | Quando cambiato | Impatto |
|-------------------|-------------------|-----------------|---------|
| Custom idempotencyKey con timestamp | BullMQ `deduplication: { id }` | BullMQ v5.x (2024) | Deduplicazione atomica in Redis, zero race condition |
| requestStop callback manuale | Worker AbortSignal (3° parametro) | BullMQ v5.x (2024) | Cancellazione integrata con lock management |
| Nessun timeout | AbortController + setTimeout pattern | Documentato in BullMQ v5 | Pattern standard per timeout, non serve libreria |
| `worker.cancelJob()` non disponibile | `worker.cancelJob(id, reason?)` | BullMQ v5.x | Cancellazione specifica per job ID |
| Deduplication solo Simple | Simple + Throttle + Debounce modes | BullMQ v5.x (2024) | Scelta del mode in base al caso d'uso |

**Nuovi pattern da considerare:**
- **`queueEvents.on('deduplicated')`:** Evento per monitorare job deduplicati — utile per logging
- **`UnrecoverableError`:** Errore che previene retry — utile per timeout dove ritentare è inutile
- **`worker.cancelAllJobs()`:** Cancella tutti i job attivi — utile per graceful shutdown
- **Multi-phase cancellation check:** Pattern `signal?.aborted` tra fasi — documentato ufficialmente

**Deprecato/superato:**
- Custom idempotencyKey con timestamp — sostituito da deduplication nativa
- requestStop callback senza integrazione AbortSignal — sostituito da signal nel processor
</sota_updates>

<open_questions>
## Open Questions

1. **Worker reference nel processor**
   - Cosa sappiamo: `worker.cancelJob()` richiede un riferimento al Worker, ma il processor attualmente non lo ha
   - Cosa non è chiaro: Se passare il worker come dependency al processor, o se la preemption debba essere gestita a livello di worker (fuori dal processor)
   - Raccomandazione: Passare una funzione `cancelActiveJob: (jobId: string) => void` come dependency del processor, che internamente chiama `worker.cancelJob()`

2. **OperationHandler signature change**
   - Cosa sappiamo: Aggiungere `signal` alla firma di OperationHandler è un breaking change per tutti i 16 handler
   - Cosa non è chiaro: Se estendere la firma esistente o creare un wrapper
   - Raccomandazione: Estendere OperationHandler aggiungendo `signal?: AbortSignal` come ultimo parametro. Gli handler che non lo usano (write operations) lo ignorano.

3. **shouldStop check frequency nei loop DB**
   - Cosa sappiamo: I sync con centinaia di record possono durare minuti nel loop DB
   - Cosa non è chiaro: Ogni quanti record controllare shouldStop (ogni 1? 10? 50?)
   - Raccomandazione: Ogni 10 record è un buon compromesso. Il costo di `() => stopped` è trascurabile.

4. **Retry per write operations**
   - Cosa sappiamo: Le write operations hanno `attempts: 1` (no retry), ma il context dice "retry automatico con backoff"
   - Cosa non è chiaro: Se retry è sicuro per submit-order, create-customer, send-to-verona (operazioni che modificano il gestionale)
   - Raccomandazione: Aggiungere retry SOLO se le operazioni sono idempotenti (verifica necessaria durante planning). Il submit-order potrebbe creare ordini duplicati con retry.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Context7 `/taskforcesh/bullmq` — deduplication API, options, modes
- Context7 `/websites/bullmq_io` — worker cancellation, AbortSignal, cleanup patterns
- https://docs.bullmq.io/guide/workers/cancelling-jobs — AbortSignal nel processor, cancelJob, cleanup
- https://docs.bullmq.io/guide/jobs/deduplication — Simple, Throttle, Debounce modes, API
- https://docs.bullmq.io/patterns/timeout-jobs — AbortController + setTimeout pattern
- https://docs.bullmq.io/guide/workers/stalled-jobs — stalledInterval, lockDuration, maxStalledCount

### Secondary (MEDIUM confidence)
- https://docs.bullmq.io/guide/jobs/prioritized — Sistema priorità BullMQ (verificato: no preemption nativa)
- https://docs.bullmq.io/guide/workers/graceful-shutdown — Pattern shutdown graceful

### Tertiary (LOW confidence — da validare)
- Nessuna — tutti i finding verificati con documentazione ufficiale
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: BullMQ v5 (già installato nel progetto)
- Ecosystem: AbortSignal/AbortController (Web API standard), ioredis
- Patterns: Job cancellation, deduplication, timeout, preemption
- Pitfalls: Lock leak, stalled detection, dedup+retry conflict, browser context leak

**Confidence breakdown:**
- Standard stack: HIGH — BullMQ v5 già installato, feature native verificate in docs
- Architecture: HIGH — Pattern documentati ufficialmente da BullMQ
- Pitfalls: HIGH — Derivati dall'analisi del codice attuale + docs BullMQ
- Code examples: HIGH — Da Context7 e documentazione ufficiale BullMQ

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 giorni — BullMQ ecosystem stabile)
</metadata>

---

*Phase: 02-operation-queue-core-fixes*
*Research completed: 2026-02-20*
*Ready for planning: yes*

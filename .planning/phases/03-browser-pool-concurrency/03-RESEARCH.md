# Phase 3: Browser Pool & Concurrency - Research

**Researched:** 2026-02-20
**Domain:** BullMQ concurrency per-utente, Puppeteer browser pool scaling, compensating transactions
**Confidence:** HIGH

<research_summary>
## Summary

Ricercato come implementare concurrency per-utente (agenti diversi in parallelo, 1 op/agente) con il sistema BullMQ + Puppeteer esistente, scalando da 1 a 60+ agenti.

Il punto chiave è che **la soluzione più semplice e con meno rischi è aumentare la `concurrency` del Worker BullMQ free da 1 a N**, mantenendo l'agentLock in-memory già esistente per la serializzazione per-utente. Non servono BullMQ Pro, GroupMQ, né puppeteer-cluster — il pattern attuale funziona già, basta sbloccare il parallelismo.

Per la compensating logic post-fallimento bot, il pattern standard è un **check-then-act per-operation**: prima di ritentare, verificare su Archibald se l'operazione è già avvenuta. Questo si implementa come logica specifica per ogni tipo di operazione nei handler, non come infrastruttura generica.

**Primary recommendation:** Aumentare Worker `concurrency` a ~10, mantenere agentLock per serializzazione per-utente, implementare check-before-retry nei bot handler per le operazioni critiche.
</research_summary>

<standard_stack>
## Standard Stack

### Core (già in uso — nessuna libreria nuova)
| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| bullmq | attuale | Job queue | Solo config change: `concurrency: 1` → `concurrency: 10` |
| puppeteer | attuale | Browser automation | Pool config: max browsers/contexts scalati |
| redis | attuale | Queue backend | Nessun cambio |

### Valutati e Scartati
| Libreria | Cosa fa | Perché scartata |
|----------|---------|-----------------|
| @taskforcesh/bullmq-pro | Job groups nativi per-user con round-robin | **Pagamento**. agentLock fa già la stessa cosa gratis. Group concurrency è elegante ma overkill per il caso d'uso |
| groupmq | Per-group FIFO open source (Redis-backed) | Richiederebbe **sostituire BullMQ** interamente. Troppo invasivo per un fix di concurrency |
| puppeteer-cluster | Pool management con concurrency models | Aggiunge dipendenza. Il browser-pool custom già gestisce LRU, session validation, reconnect. puppeteer-cluster non offre nulla in più per il caso d'uso specifico (session cookies Archibald ERP) |

### Perché BullMQ Free + agentLock Basta

BullMQ Pro Groups offre round-robin nativo tra gruppi (utenti) con `group.concurrency: 1`. Ma il pattern attuale è funzionalmente equivalente:

```
Worker concurrency: 10 → può processare fino a 10 job in parallelo
agentLock: Map<userId, ActiveJob> → 1 job/utente in-memory
Collisione: job per utente bloccato → re-enqueue con delay
```

L'agentLock è un Map in-memory nel singolo processo Node.js. Dato che Node.js è single-threaded (event loop), non ci sono race condition sull'acquisizione del lock, neanche con concurrency > 1.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Pattern 1: Worker Concurrency > 1 con agentLock

**Cosa:** Aumentare `concurrency` del Worker BullMQ per processare job di utenti diversi in parallelo.

**Come funziona:**
```
Worker (concurrency: 10)
  ├── Job Alice (submit-order)  → agentLock.acquire('alice') ✓ → processa
  ├── Job Bob (sync-customers)  → agentLock.acquire('bob') ✓ → processa
  ├── Job Carlo (sync-orders)   → agentLock.acquire('carlo') ✓ → processa
  ├── Job Alice (sync-products) → agentLock.acquire('alice') ✗ → re-enqueue
  └── ...fino a 10 paralleli
```

**Cambio richiesto:**
```typescript
// PRIMA (main.ts)
const worker = new Worker('operations', processFn, {
  concurrency: 1,           // ← bottleneck
  lockDuration: 600_000,
});

// DOPO
const worker = new Worker('operations', processFn, {
  concurrency: 10,          // ← parallelo
  lockDuration: 600_000,
});
```

**Perché 10:** Il browser pool supporta 3 browser × 5 context = 15 max. Con 10 concorrenti si ha margine per evitare saturazione.

### Pattern 2: Re-enqueue con Backoff Esponenziale

**Problema:** Con concurrency > 1, un utente con un sync lungo causa re-enqueue continui dei suoi job successivi — ogni 2s un job rimbalza inutilmente.

**Soluzione:** Backoff esponenziale nel re-enqueue.

```typescript
// Calcolo delay basato su tentativi
const attempt = job.data._requeueAttempt ?? 0;
const delay = Math.min(2000 * Math.pow(2, attempt), 30_000); // 2s, 4s, 8s, 16s, max 30s

await enqueue(type, userId, { ...data, _requeueAttempt: attempt + 1 }, { delay });
```

### Pattern 3: Check-Before-Retry (Compensating Transaction)

**Cosa:** Prima di ritentare un'operazione fallita su Archibald, verificare se è già avvenuta.

**Pattern per tipo di operazione:**

| Operazione | Check | Se già completata |
|-----------|-------|-------------------|
| submit-order | Cerca ordine su Archibald per codice cliente + data + articoli | Passa a flusso edit-order |
| send-to-verona | Verifica stato invio su Archibald per l'ordine | Skip, marca come successo |
| create-customer | Cerca cliente su Archibald per codice/ragione sociale | Passa a flusso update-customer |
| delete-order | Verifica se ordine esiste ancora su Archibald | Skip, marca come successo |
| edit-order | Verifica versione corrente dell'ordine su Archibald | Confronta e applica solo le diff |

**Implementazione come orchestrator saga per-handler:**
```typescript
// In ogni handler che modifica stato su Archibald
async function submitOrderHandler(context, data, userId, onProgress, signal) {
  // STEP 1: Check se ordine già esiste
  const existingOrder = await checkOrderExists(context, data.orderCode);

  if (existingOrder) {
    // Ordine già creato (crash precedente post-submit) → switch to edit
    return editOrderHandler(context, { ...data, orderNumber: existingOrder.number }, ...);
  }

  // STEP 2: Procedi con creazione normale
  return createOrder(context, data);
}
```

**Non è un'infrastruttura generica** — ogni operazione ha la sua logica di verifica specifica perché ogni operazione interagisce diversamente con Archibald ERP.

### Pattern 4: Browser Pool Sizing Dinamico

**Problema attuale:** 3 browser × 5 context = 15 max. Per 60+ utenti, le context verranno riciclate continuamente (LRU eviction), causando overhead di sessione re-login.

**Approccio:**
```
Fase attuale (1-5 utenti): 3 browser × 5 context = 15 ← sufficiente
Fase futura (60+ utenti): Scalare con env var BROWSER_POOL_SIZE
```

Non serve cambiare architettura — il pool LRU già gestisce l'eviction. Per 60+ utenti, l'hot set (utenti attivi nello stesso minuto) sarà molto più piccolo del totale.

### Anti-Patterns da Evitare

- **Distributed locking con Redis:** Non necessario. L'agentLock in-memory funziona perché c'è un singolo processo Node.js. Redis locking aggiungerebbe complessità inutile.
- **Worker separati per tipo di operazione:** Crea complessità di deployment. Una singola queue con concurrency > 1 è sufficiente.
- **Retry automatico sulle write operations:** Pericoloso senza check-before-retry. Le write hanno `attempts: 1` intenzionalmente.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problema | Non costruire | Usa invece | Perché |
|----------|--------------|------------|--------|
| Per-user job serialization in Redis | Custom Lua scripts per distributed locking | agentLock in-memory Map | Singolo processo Node.js → non serve distributed lock. Map + event loop = race-condition-free |
| Job group round-robin | Custom scheduling logic | BullMQ `concurrency > 1` + agentLock re-enqueue | BullMQ gestisce il picking dei job. agentLock filtra. Insieme fanno round-robin de facto |
| Browser pool management | Sostituzione con puppeteer-cluster | Browser pool custom esistente | Il pool custom gestisce già session cookies Archibald, LRU, reconnect, validation. puppeteer-cluster è per scraping generico |
| Saga orchestrator generico | Framework saga (temporal.io, saga-pattern libs) | Check-before-retry specifico per handler | Ogni operazione Archibald ha logica di verifica diversa. Un framework generico è overkill per 5-6 tipi di operazione |
| Timeout management | Custom timer pools | AbortController + AbortSignal (già implementato Phase 2) | Standard Web API, integrato in BullMQ e Puppeteer |

**Key insight:** Il sistema attuale è architetturalmente corretto — ha solo `concurrency: 1` come bottleneck e manca la compensating logic. Non serve rearchitettare, serve sbloccare e completare.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Re-enqueue Busy Loop
**Cosa va storto:** Con concurrency > 1, job per utenti bloccati rimbalzano ogni 2s → spreco CPU e Redis ops
**Perché succede:** Il delay fisso di 2s è troppo breve per sync lunghi (fino a 5 min)
**Come evitare:** Backoff esponenziale nel re-enqueue (2s → 4s → 8s → 16s → max 30s) con contatore tentativi nel job data
**Segnali di allarme:** Redis ops/s elevate, job completed/failed ratio anomalo, CPU Redis alta

### Pitfall 2: Browser Pool Exhaustion sotto Carico
**Cosa va storto:** 10 job paralleli richiedono 10 browser context, ma il pool ne supporta 15 max → si avvicina al limite, LRU eviction aggressiva → overhead login
**Perché succede:** Worker concurrency troppo alta rispetto al pool
**Come evitare:** `concurrency` ≤ `maxBrowsers × maxContextsPerBrowser - margine`. Con pool 15, concurrency 10 lascia 5 context di margine per session reuse
**Segnali di allarme:** Context creation rate alta, login Archibald frequenti, slowdown generale

### Pitfall 3: Race Condition agentLock.release nel Finally
**Cosa va storto:** Se due job per lo stesso utente passano entrambi il check agentLock (timing estremo con async), uno rilascia il lock dell'altro
**Perché succede:** In teoria non può succedere perché `acquire()` è sincrono. Ma se il `release()` nel `finally` non verifica il jobId, un job re-enqueuato che acquisisce il lock potrebbe vederlo rilasciato dal primo job
**Come evitare:** `release(userId, jobId)` deve verificare che il jobId corrisponda a quello attivo — non rilasciare se è cambiato
**Segnali di allarme:** Job completati senza lock, due handler per lo stesso utente in parallelo

### Pitfall 4: Check-Before-Retry con Pagine Archibald Lente
**Cosa va storto:** La verifica "esiste già su Archibald?" richiede navigazione pagine → aggiunge 5-15s per ogni retry
**Perché succede:** Archibald ERP è un'applicazione web lenta (legacy ASP.NET)
**Come evitare:** Cache locale dello stato (DB PostgreSQL) + verifica Archibald solo se lo stato locale è ambiguo. Se il job ha completato il submit sul DB ma non la conferma da Archibald, allora serve la verifica
**Segnali di allarme:** Tempi di retry molto lunghi, timeout sui check

### Pitfall 5: Ordini Duplicati durante Preemption
**Cosa va storto:** Un submit-order viene preempted a metà → il bot ha già cliccato "Salva" su Archibald ma il job risulta fallito → retry crea duplicato
**Perché succede:** La preemption (AbortSignal) arriva dopo che il bot ha già inviato la form ma prima della conferma
**Come evitare:** Check-before-retry è l'unica difesa. L'AbortSignal non può annullare un click già fatto. Il check sul DB Archibald verifica se l'ordine è stato creato
**Segnali di allarme:** Ordini duplicati su Archibald, discrepanze tra DB locale e Archibald
</common_pitfalls>

<code_examples>
## Code Examples

### Worker Concurrency Setup
```typescript
// Source: BullMQ docs (https://docs.bullmq.io/guide/workers/concurrency)
// Concurrency > 1 fa beneficiare operazioni IO-heavy (come Puppeteer)
const worker = new Worker('operations', async (job, token, signal) => {
  await processor.processJob({
    id: job.id ?? '',
    data: job.data,
    updateProgress: (p) => job.updateProgress(p),
    signal,
  });
}, {
  connection: { host: redisHost, port: redisPort },
  concurrency: 10,         // Parallelo per utenti diversi
  lockDuration: 600_000,   // 10 min per sync lunghi
});
```

### agentLock.release con Verifica jobId
```typescript
// Pattern: release condizionale per evitare rilascio cross-job
function release(userId: string, jobId: string): boolean {
  const active = activeJobs.get(userId);
  if (!active || active.jobId !== jobId) {
    return false; // Non rilasciare se il job attivo è cambiato
  }
  activeJobs.delete(userId);
  return true;
}
```

### Re-enqueue con Backoff Esponenziale
```typescript
// Nel operation-processor, quando agentLock.acquire() fallisce
const requeueAttempt = (job.data._requeueAttempt ?? 0) + 1;
const delay = Math.min(2_000 * Math.pow(2, requeueAttempt - 1), 30_000);

await enqueue(type, userId, {
  ...originalData,
  _requeueAttempt: requeueAttempt,
}, { delay });
```

### Check-Before-Retry Pattern (submit-order)
```typescript
// Verifica se l'ordine è stato creato su Archibald prima di ritentare
async function submitOrderWithCheck(
  context: BrowserContextLike,
  data: SubmitOrderData,
  userId: string,
) {
  // Step 1: Verifica stato su Archibald
  const existingOrder = await navigateAndCheckOrder(context, {
    customerCode: data.customerCode,
    date: data.orderDate,
    // ... criteri di ricerca
  });

  if (existingOrder) {
    // Ordine già creato durante tentativo precedente
    // → aggiorna DB locale con il numero ordine trovato
    return { success: true, orderNumber: existingOrder.number, recovered: true };
  }

  // Step 2: Ordine non trovato → safe to create
  return await createOrderOnArchibald(context, data);
}
```

### Puppeteer Browser Context Isolation
```typescript
// Source: Puppeteer docs (https://pptr.dev)
// Ogni utente ha il proprio BrowserContext con cookie isolati
const context = await browser.createBrowserContext();
// Il context ha cookie, localStorage e cache indipendenti
const page = await context.newPage();
// Session Archibald (.ASPXAUTH, ASP.NET_SessionId) resta isolata per utente
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Vecchio Approccio | Approccio Attuale | Quando | Impatto |
|-------------------|-------------------|--------|---------|
| BullMQ concurrency: 1 con serializzazione esterna | BullMQ concurrency: N con lock in-memory per-user | Standard BullMQ pattern | Parallelismo tra utenti senza nuove dipendenze |
| BullMQ group key rate limiting (free, pre-3.0) | Rimosso in BullMQ 3.0+, solo in BullMQ Pro | BullMQ 3.0 | Group rate limiting richiede Pro. Ma agentLock copre il caso d'uso |
| Retry cieco dopo fallimento | Check-before-retry (saga pattern) | Best practice consolidata | Previene duplicazioni in sistemi senza transazioni distribuite |
| puppeteer-cluster per pooling | Browser pool custom con session management | Progetto-specifico | puppeteer-cluster è per scraping generico. Per ERP con sessioni cookie, pool custom è superiore |

**Strumenti/pattern nuovi da considerare:**
- **GroupMQ** (openpanel-dev/groupmq): Alternativa open-source a BullMQ Pro Groups. Per-group FIFO con round-robin. Interessante ma troppo invasivo come sostituzione ora. Da rivalutare se il pattern agentLock mostra limiti a 60+ utenti.
- **BullMQ Flows (parent-child)**: Potrebbe essere utile per il pattern check-then-act → creare un parent job "verify" che spawna un child job "execute" se il check passa. Ma aggiunge complessità inutile per 5-6 handler.

**Deprecato/superato:**
- **Group key rate limiting in BullMQ free**: Rimosso in v3.0+, usare agentLock come alternativa
- **Distributed locks Redis (Redlock)**: Overkill per single-process Node.js, usare Map in-memory
</sota_updates>

<open_questions>
## Open Questions

1. **Browser pool sizing ottimale per 60+ utenti**
   - Cosa sappiamo: Pool attuale 3×5=15. L'hot set di utenti attivi nello stesso minuto sarà probabilmente 5-10, non 60.
   - Cosa non è chiaro: Il pattern di utilizzo reale degli agenti (picchi simultanei? distribuzione oraria?)
   - Raccomandazione: Parametrizzare via env var (`BROWSER_POOL_SIZE`, `MAX_CONTEXTS_PER_BROWSER`). Monitorare in produzione. Scalare quando necessario.

2. **Check-before-retry: copertura esatta delle operazioni**
   - Cosa sappiamo: submit-order, send-to-verona, create-customer sono le più critiche. Il CONTEXT.md le menziona esplicitamente.
   - Cosa non è chiaro: Quali operazioni hanno effettivamente avuto duplicazioni in produzione? edit-order e delete-order quanto sono rischiose?
   - Raccomandazione: Implementare check-before-retry per le 3 operazioni critiche (submit, send-to-verona, create-customer). Le altre valutare durante planning.

3. **Re-enqueue vs wait: strategia migliore per job in coda per utente**
   - Cosa sappiamo: Re-enqueue con delay funziona ma è subottimale (job esce dalla queue e rientra).
   - Cosa non è chiaro: BullMQ Pro ha `moveToDelayed` per gruppo. BullMQ free potrebbe simularlo con `moveToDelayed` manuale, ma non è documentato per questo caso d'uso.
   - Raccomandazione: Usare re-enqueue con backoff esponenziale. Semplice, funziona, testabile. Se mostra limiti a scale, valutare GroupMQ.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Context7 `/taskforcesh/bullmq` — Groups, concurrency, rate limiting, deduplication
- Context7 `/websites/bullmq_io` — Group concurrency, rate limiting per group
- Context7 `/puppeteer/puppeteer` — Browser context management, session isolation
- Context7 `/openpanel-dev/groupmq` — Per-group FIFO pattern, concurrency model
- Codebase exploration — browser-pool.ts, agent-lock.ts, operation-processor.ts, operation-queue.ts, main.ts

### Secondary (MEDIUM confidence)
- [BullMQ Concurrency docs](https://docs.bullmq.io/guide/workers/concurrency) — Worker concurrency > 1 per IO-heavy jobs
- [BullMQ Rate Limiting docs](https://docs.bullmq.io/guide/rate-limiting) — Group key support rimosso in v3.0+
- [Saga Pattern - Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga) — Compensating transaction pattern
- [Compensating Transaction pattern - Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction) — Idempotent compensations
- [Puppeteer Browser Contexts](https://deepwiki.com/puppeteer/puppeteer/3.2-browser-and-context-management) — Context isolation per-user
- [puppeteer-cluster](https://github.com/thomasdondorf/puppeteer-cluster) — Concurrency models (PAGE, CONTEXT, BROWSER)

### Tertiary (LOW confidence - needs validation)
- Nessuno — tutti i findings verificati con fonti autorevoli
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: BullMQ Worker concurrency + Puppeteer browser pool
- Ecosystem: BullMQ Pro Groups, GroupMQ, puppeteer-cluster (tutti valutati e scartati)
- Patterns: per-user serialization con agentLock, compensating transactions (check-before-retry), backoff esponenziale re-enqueue
- Pitfalls: busy loop, pool exhaustion, release race condition, ordini duplicati

**Confidence breakdown:**
- Standard stack: HIGH — confermato con Context7 e docs ufficiali, nessuna nuova libreria necessaria
- Architecture: HIGH — pattern agentLock + concurrency > 1 verificato come sound (Node.js event loop = no race conditions su Map)
- Pitfalls: HIGH — derivati da analisi del codice esistente e pattern noti di distributed systems
- Code examples: HIGH — basati su codice esistente + BullMQ/Puppeteer docs ufficiali

**Research date:** 2026-02-20
**Valid until:** 2026-03-22 (30 giorni — BullMQ e Puppeteer ecosistemi stabili)
</metadata>

---

*Phase: 03-browser-pool-concurrency*
*Research completed: 2026-02-20*
*Ready for planning: yes*

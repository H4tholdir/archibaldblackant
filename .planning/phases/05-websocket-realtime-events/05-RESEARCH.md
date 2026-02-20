# Phase 5: WebSocket & Real-time Events - Research

**Researched:** 2026-02-20
**Domain:** WebSocket event architecture (extending existing ws-based server)
**Confidence:** HIGH

<research_summary>
## Summary

Ricerca focalizzata sull'estensione dell'infrastruttura WebSocket esistente nel progetto Archibald. L'analisi del codebase rivela che l'infrastruttura core è già matura: server `ws` con connection pooling per-utente, event buffering (200 eventi, 5 min TTL), replay on reconnect, heartbeat, e reconnection con exponential backoff lato client.

Il gap principale NON è infrastrutturale ma di **copertura eventi**: il frontend ascolta ~20 tipi di evento, ma il backend ne emette solo ~9 (tutti relativi a customer-interactive e JOB_COMPLETED/FAILED). Mancano completamente: PENDING_* (4 eventi), JOB_STARTED/PROGRESS, ORDER_NUMBERS_RESOLVED, ORDER_EDIT/DELETE_*, FRESIS_HISTORY_* (6 eventi), ORDER_SEND_TO_VERONA_PROGRESS.

Per la decisione SSE vs WebSocket: consolidare tutto su WebSocket. L'SSE endpoint attuale è uno stub e l'infrastruttura WS già supporta tutto ciò che SSE farebbe (buffering, replay, unidirectional push). Mantenere due canali real-time aggiunge complessità senza beneficio.

**Primary recommendation:** Emettere tutti gli eventi mancanti via WebSocket esistente, rimuovere lo stub SSE progress, riattivare UnifiedSyncProgress via WS.
</research_summary>

<standard_stack>
## Standard Stack

### Core (già in uso — NESSUN CAMBIO)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ws | ^8.x | WebSocket server Node.js | Leggero, performante, zero overhead vs Socket.IO. Già in uso con infrastruttura matura |
| Native WebSocket | Browser API | WebSocket client frontend | Zero dipendenze, supporto universale. Già in uso via WebSocketContext |

### Supporting (già in uso)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jsonwebtoken | Existing | Auth WS connections | Validazione JWT su query param alla connessione |
| BullMQ | Existing | Job events source | Job progress/completed/failed come sorgente eventi WS |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ws (raw) | Socket.IO | Socket.IO offre rooms/broadcasting/reconnection built-in, MA il progetto ha già implementato tutto questo con ws. Migrare sarebbe un rewrite senza beneficio netto. Overhead maggiore per messaggio (~+30% packet size) |
| ws (raw) | µWebSockets.js | Performance superiore (~10x throughput), MA API diversa, meno ecosystem, e la scala attuale (2-3 dispositivi/utente) non giustifica il cambio |
| WebSocket per progress | SSE (Server-Sent Events) | SSE è più semplice per push unidirezionale, MA il progetto ha già WS con buffering/replay. Aggiungere SSE = 2 canali da mantenere. L'SSE stub va rimosso, non completato |

**Nessuna nuova installazione necessaria.** Tutta l'infrastruttura è già in place.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Architettura Esistente (da preservare)
```
Backend:
src/realtime/
├── websocket-server.ts    # Server WS: connection pool, buffering, replay, heartbeat
└── sse-progress.ts        # Stub SSE → DA RIMUOVERE/SOSTITUIRE

Frontend:
src/contexts/
└── WebSocketContext.tsx    # Provider: connessione, subscribe, reconnection
src/hooks/
├── usePendingSync.ts      # Subscribe pending/job events → refetch
├── useSyncProgress.ts     # SSE client → DA MIGRARE A WS
└── useAutoRefresh.ts      # Polling fallback generico
src/services/
└── fresis-history-realtime.service.ts  # Singleton per operation progress
src/components/
├── UnifiedSyncProgress.tsx # SSE client → DA MIGRARE A WS
├── WebSocketMonitor.tsx    # Health monitoring
└── WebSocketSync.tsx       # Placeholder (quasi vuoto)
```

### Pattern 1: Event Emission Point — Route-Level Broadcast
**What:** Emettere eventi WS direttamente nelle route Express dopo mutazione DB
**When to use:** Operazioni CRUD sincrone (pending orders, fresis history)
**Rationale:** L'evento deve partire DOPO che il DB ha confermato la scrittura, mai prima
```typescript
// Esempio: pending-orders route
router.post('/api/pending-orders', async (req, res) => {
  const result = await pendingOrdersRepo.batchUpsert(userId, orders);
  res.json(result);
  // Emit DOPO la response, non prima
  for (const order of result.created) {
    broadcast(userId, { event: 'PENDING_CREATED', ...order });
  }
  for (const order of result.updated) {
    broadcast(userId, { event: 'PENDING_UPDATED', ...order });
  }
});
```

### Pattern 2: Event Emission Point — Processor-Level Broadcast
**What:** Emettere eventi WS dall'operation-processor durante l'esecuzione di job asincroni
**When to use:** Operazioni BullMQ (job started, progress, completed, failed)
**Rationale:** Il processor è il punto di controllo per tutto il lifecycle del job
```typescript
// Esempio: operation-processor (estensione)
// Prima di eseguire l'handler:
broadcast(userId, { event: 'JOB_STARTED', jobId, type });

// Durante l'esecuzione (onProgress callback):
const onProgress = (progress: number, label: string) => {
  job.updateProgress(progress);
  broadcast(userId, { event: 'JOB_PROGRESS', jobId, type, progress, label });
};

// Dopo completamento (già esistente):
broadcast(userId, { event: 'JOB_COMPLETED', jobId, type, result });
```

### Pattern 3: Event Emission Point — Handler-Level Broadcast
**What:** Emettere eventi operation-specific dagli handler individuali
**When to use:** Quando l'handler ha contesto specifico (ORDER_EDIT_PROGRESS con recordId, ORDER_NUMBERS_RESOLVED con mapping)
**Rationale:** Solo l'handler conosce i dettagli operation-specific
```typescript
// Esempio: handler che emette eventi specifici
const handleOrderEdit = async (ctx, onProgress, broadcast) => {
  broadcast(userId, { event: 'ORDER_EDIT_PROGRESS', recordId, progress: 0, label: 'Navigating...' });
  // ... work ...
  broadcast(userId, { event: 'ORDER_EDIT_PROGRESS', recordId, progress: 50, label: 'Editing...' });
  // ... work ...
  broadcast(userId, { event: 'ORDER_EDIT_COMPLETE', recordId });
};
```

### Pattern 4: Transient vs Buffered Events
**What:** Classificare eventi come transient (non bufferizzati) o buffered (replay on reconnect)
**When to use:** Già implementato nel WS server — applicare ai nuovi eventi
**Regola:**
- **Transient** (no buffer): JOB_PROGRESS, *_PROGRESS — dati effimeri, il client può chiedere stato attuale
- **Buffered** (replay): PENDING_CREATED/UPDATED/DELETED, JOB_COMPLETED/FAILED, *_COMPLETE — eventi di stato che cambiano i dati

### Anti-Patterns to Avoid
- **Emit prima del DB write:** Se l'evento parte prima della conferma DB, un disconnect+reconnect mostra dati fantasma
- **Broadcast a tutti gli utenti:** Usare sempre `broadcast(userId, ...)` non `broadcastToAll()` per eventi user-specific
- **Double event + refetch:** Il frontend ascolta l'evento E fa refetch. L'evento dovrebbe portare abbastanza dati da aggiornare la UI direttamente, evitando una roundtrip HTTP. Il refetch serve solo come fallback/consistency check
- **SSE + WS in parallelo:** Mantenere due canali real-time è complessità inutile quando WS copre entrambi i casi
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reconnection logic | Custom retry loop | Infrastruttura WS già esistente | Già implementato: exponential backoff 1s-30s, visibility change, online/offline detection |
| Event buffering/replay | Custom event store | `eventBuffer` nel WS server | Già implementato: Map per-user, 200 eventi max, 5 min TTL, replay via lastEventTs |
| Heartbeat/keepalive | Custom ping loop | WS server heartbeat | Già implementato: ping 30s, pong timeout detection |
| Per-user routing | Room/channel system | `connectionPool` Map<userId, Set<WS>> | Già implementato: semplice e sufficiente per la scala (2-3 device/utente) |
| SSE progress streaming | Completare lo stub SSE | Route tutto via WebSocket | Lo stub SSE è inutile dato che WS fa già tutto. Rimuovere, non completare |
| Socket.IO migration | Riscrivere per Socket.IO | Mantenere ws + custom code | Il progetto ha già tutto ciò che Socket.IO offre. Migrare = rewrite senza ROI |

**Key insight:** L'infrastruttura real-time di Archibald è già completa a livello di trasporto. Il lavoro di questa phase è esclusivamente a livello di **emissione eventi**: aggiungere `broadcast()` calls nei punti giusti e gestire i nuovi eventi nel frontend.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Emit Before DB Confirmation
**What goes wrong:** Evento WS emesso prima che il DB abbia confermato la scrittura. Se il client fa refetch subito, potrebbe non trovare il dato.
**Why it happens:** Tentazione di emettere l'evento nella stessa promise chain della scrittura, prima dell'await
**How to avoid:** Emettere SEMPRE dopo `await dbOperation()` e dopo `res.json()`. Pattern: DB write → HTTP response → WS broadcast
**Warning signs:** Frontend mostra dati che spariscono dopo refresh, o "ordine fantasma" per un istante

### Pitfall 2: Event Flooding on Batch Operations
**What goes wrong:** Batch upsert di 50 pending orders genera 50 eventi WS in rapida successione, frontend fa 50 refetch
**Why it happens:** Emit per ogni singolo item in un batch
**How to avoid:** Per batch operations, emettere UN evento aggregato (es. `PENDING_BATCH_UPDATED` con array di IDs) oppure debounce lato frontend (già presente in Dashboard: 1.5s debounce)
**Warning signs:** Network tab mostra decine di GET /api/pending-orders in pochi secondi

### Pitfall 3: Missing Broadcast Injection
**What goes wrong:** Route o handler non ha accesso alla funzione `broadcast` e quindi non emette eventi
**Why it happens:** `createWebSocketServer()` ritorna broadcast, ma non tutte le route/handler lo ricevono come dependency
**How to avoid:** Assicurarsi che broadcast sia iniettato come dipendenza in: pending-orders routes, operation-processor (già fatto), tutti gli handler che devono emettere eventi specifici
**Warning signs:** Evento definito nel frontend ma mai ricevuto, nessun errore nel backend

### Pitfall 4: Transient Event Loss After Reconnect
**What goes wrong:** Utente perde connessione durante un JOB_PROGRESS, riconnette, ma i progress events non vengono replayati (sono transient)
**Why it happens:** JOB_PROGRESS è correttamente marcato come transient (non bufferizzato), ma il client non ha modo di sapere lo stato corrente del job
**How to avoid:** Dopo reconnect, il client dovrebbe fare un refetch dello stato corrente (pending orders con job status). Il pattern esiste già in `usePendingSync` che ha polling fallback a 15s
**Warning signs:** Dopo reconnessione, progress bar bloccata su vecchio valore

### Pitfall 5: SSE/WS Race Condition
**What goes wrong:** Se SSE e WS coesistono, eventi duplicati o in ordine diverso sui due canali
**Why it happens:** Due canali indipendenti con timing diverso
**How to avoid:** Consolidare su un solo canale (WebSocket). Rimuovere SSE progress stub
**Warning signs:** UI mostra progress che "salta" o duplica aggiornamenti

### Pitfall 6: Memory Growth from Event Buffers
**What goes wrong:** Event buffer cresce per utenti connessi che generano molti eventi
**Why it happens:** Buffer non pulito se utente non si disconnette mai
**How to avoid:** Già gestito: MAX_BUFFER_AGE_MS = 5 min, EVENT_BUFFER_MAX_SIZE = 200. Verificare che la pulizia funzioni sotto carico
**Warning signs:** Heap memory in crescita costante nel backend
</common_pitfalls>

<code_examples>
## Code Examples

### Evento Mancante: PENDING_CREATED/UPDATED/DELETED da pending-orders.ts
```typescript
// Pattern: inject broadcast nelle route pending-orders
// Source: pattern esistente in customer-interactive.ts
export function createPendingOrdersRoutes(deps: {
  pendingOrdersRepo: PendingOrdersRepository;
  broadcast: (userId: string, event: unknown) => void;  // ← aggiungere
}) {
  router.post('/api/pending-orders', async (req, res) => {
    const result = await deps.pendingOrdersRepo.batchUpsert(userId, orders);
    res.json(result);
    // Emit batch event (NON uno per ordine)
    deps.broadcast(userId, {
      event: 'PENDING_UPDATED',
      orderIds: result.map(o => o.id),
      timestamp: new Date().toISOString(),
    });
  });
}
```

### Evento Mancante: JOB_STARTED/JOB_PROGRESS da operation-processor.ts
```typescript
// Source: estensione del pattern esistente in operation-processor.ts
// Il processor emette già JOB_COMPLETED e JOB_FAILED
// Aggiungere JOB_STARTED prima dell'handler e JOB_PROGRESS nel callback

// Prima dell'handler:
broadcast(userId, {
  event: 'JOB_STARTED',
  jobId: job.id,
  type: operationType,
  timestamp: new Date().toISOString(),
});

// onProgress callback (già esiste, estendere con broadcast):
const onProgress = (progress: number, label: string) => {
  job.updateProgress(progress);
  broadcast(userId, {
    event: 'JOB_PROGRESS',
    jobId: job.id,
    type: operationType,
    progress,
    label,
  });
};
```

### Migrazione SSE → WS: UnifiedSyncProgress
```typescript
// PRIMA (SSE): EventSource su /api/sync/progress
// DOPO (WS): subscribe via WebSocketContext
function UnifiedSyncProgress() {
  const { subscribe } = useWebSocketContext();

  useEffect(() => {
    const unsubs = [
      subscribe('SYNC_PROGRESS', (payload) => {
        // stessa logica di prima, solo canale diverso
        setSyncState(payload);
      }),
      subscribe('SYNC_COMPLETED', (payload) => {
        setSyncState({ ...payload, status: 'completed' });
      }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [subscribe]);
}
```

### Transient Events Configuration
```typescript
// Source: websocket-server.ts (pattern esistente)
// Estendere TRANSIENT_EVENTS con i nuovi progress events
const TRANSIENT_EVENTS = new Set([
  'JOB_PROGRESS',
  'CUSTOMER_UPDATE_PROGRESS',
  // Aggiungere:
  'ORDER_EDIT_PROGRESS',
  'ORDER_DELETE_PROGRESS',
  'FRESIS_HISTORY_EDIT_PROGRESS',
  'FRESIS_HISTORY_DELETE_PROGRESS',
  'ORDER_SEND_TO_VERONA_PROGRESS',
  'SYNC_PROGRESS',
]);
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SSE per progress + WS per events | WS per tutto (single channel) | 2024+ | Tendenza a consolidare su un solo canale real-time per semplicità |
| Socket.IO per tutto | ws per piccola scala, Socket.IO per grande scala | Ongoing | Socket.IO resta standard per app collaborative multi-utente, ma ws è preferibile quando le feature custom sono già implementate |
| Polling per fallback | WebSocket con replay buffer | 2023+ | Event buffering server-side + replay on reconnect elimina la necessità di polling frequente |
| Manual reconnection | Visibility API + Network API + exponential backoff | 2024+ | Browser APIs permettono reconnessione intelligente (già implementato in Archibald) |

**New tools/patterns to consider:**
- **WebSocket over HTTP/2**: Protocollo emergente (RFC 8441) che permette WS multiplexato su una singola connessione TCP. Non ancora necessario per la scala di Archibald
- **WebTransport**: Sostituto futuro di WebSocket basato su HTTP/3 e QUIC. Non production-ready per browser, ignorare per ora

**Deprecated/outdated:**
- **Long polling**: Completamente superato da WebSocket
- **SSE per progress quando WS è già in place**: Aggiunge complessità senza beneficio misurabile
</sota_updates>

<open_questions>
## Open Questions

1. **ORDER_NUMBERS_RESOLVED: dove viene generato?**
   - What we know: Il frontend ascolta questo evento in usePendingSync, serve a mappare ordini pending → numeri ordine reali dopo l'invio
   - What's unclear: Quale handler/processo genera questa informazione? Probabile che sia il send-to-verona handler post-submit
   - Recommendation: Verificare durante planning/execution quale handler produce il mapping pending→real order numbers

2. **FRESIS_HISTORY_BULK_IMPORTED: trigger?**
   - What we know: Il frontend ascolta questo evento per aggiornare la lista dopo import bulk
   - What's unclear: Non c'è ancora un endpoint di bulk import completo (è in Phase 7: subclients API)
   - Recommendation: Implementare l'emissione dell'evento nella route esistente, anche se il bulk import completo arriva dopo

3. **Sync progress granularity: per-record o per-batch?**
   - What we know: I sync handlers (customer, order, product, price) processano record uno alla volta
   - What's unclear: Quanto granulare deve essere il SYNC_PROGRESS? Ogni record? Ogni 10? Percentuale?
   - Recommendation: Emettere ogni 10 record o al 10% di avanzamento per evitare flooding. L'utente ha detto "progress bar live" non "ogni singolo record"
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- **Codebase analysis diretta** — Lettura completa di websocket-server.ts, operation-processor.ts, pending-orders.ts, WebSocketContext.tsx, usePendingSync.ts, UnifiedSyncProgress.tsx, sse-progress.ts, e tutti i componenti che ascoltano eventi WS
- **Pattern esistenti nel progetto** — customer-interactive.ts come modello per broadcast injection

### Secondary (MEDIUM confidence)
- [Ably: WebSockets vs SSE](https://ably.com/blog/websockets-vs-sse) — Confronto dettagliato SSE vs WS, conferma che WS è preferibile quando infrastruttura già in place
- [WebSocket.org: SSE comparison](https://websocket.org/comparisons/sse/) — SSE buono per push unidirezionale, ma ridondante se WS esiste già
- [Jay's Tech Bites: SSE vs WebSockets 2026](https://jaystechbites.com/posts/2026/server-sent-events-vs-websockets/) — Guida recente sulla scelta tra i due protocolli
- [Ably: Socket.IO vs WebSocket](https://ably.com/topic/socketio-vs-websocket) — Socket.IO aggiunge ~30% overhead per messaggio, non giustificato per la scala di Archibald
- [VideoSDK: Socket.IO vs WebSocket](https://www.videosdk.live/developer-hub/websocket/socketio-vs-websocket) — ws preferibile per latenza quando le feature Socket.IO sono già implementate custom
- [OneUpTime: WebSocket Reconnection Logic](https://oneuptime.com/blog/post/2026-01-27-websocket-reconnection-logic/view) — Pattern di reconnection con exponential backoff e message queuing
- [LatteStream: WebSocket Best Practices](https://lattestream.com/blog/websocket-best-practices) — Heartbeat, buffering, replay patterns confermano l'approccio di Archibald

### Tertiary (LOW confidence - needs validation)
- Nessuno — tutti i finding verificati contro il codice o fonti autorevoli
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: WebSocket (ws library) — infrastruttura esistente
- Ecosystem: Nessuna nuova libreria necessaria
- Patterns: Event emission points (route-level, processor-level, handler-level), transient vs buffered, batch events
- Pitfalls: Emit before DB, event flooding, broadcast injection, transient loss, SSE/WS race, memory growth

**Confidence breakdown:**
- Standard stack: HIGH — basato su analisi diretta del codice, nessun cambio di libreria
- Architecture: HIGH — estensione di pattern già funzionanti (customer-interactive.ts come template)
- Pitfalls: HIGH — derivati da analisi del codice e best practices documentate
- Code examples: HIGH — basati su codice esistente nel progetto, non su esempi generici

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 days — stack stabile, nessuna libreria nuova)
</metadata>

---

*Phase: 05-websocket-realtime-events*
*Research completed: 2026-02-20*
*Ready for planning: yes*

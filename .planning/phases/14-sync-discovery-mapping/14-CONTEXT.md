# Phase 14: Sync System Discovery & Mapping - Context

**Gathered:** 2026-01-17
**Status:** Ready for planning

<vision>
## How This Should Work

L'obiettivo di questa fase è **garantire che i 4 database (customers, products, prices, orders) siano sempre aggiornati e che l'utente non percepisca problemi durante i sync**.

Il sistema di sync attuale ha **problemi multipli**:
- Sync che bloccano l'interfaccia mentre sono in esecuzione
- Dati non aggiornati quando l'utente ne ha bisogno
- Conflitti tra sync concorrenti che causano race conditions o performance degradate

Per risolvere questi problemi nelle fasi successive, PRIMA dobbiamo **capire completamente come funziona il sistema oggi**.

**Deliverable finale:** 4 documenti narrativi atomici (uno per ogni database) che raccontano la storia completa di come funziona ogni sync:
- `customers-sync.md` - Come funziona il customer sync (per-user)
- `products-sync.md` - Come funziona il product sync (shared 1:1)
- `prices-sync.md` - Come funziona il price sync (shared 1:1)
- `orders-sync.md` - Come funziona il order sync (per-user)

Ogni documento specifica se è shared o per-user e come questo impatta il comportamento del sync.

</vision>

<essential>
## What Must Be Nailed

Per ogni sync (customers, products, prices, orders), dobbiamo documentare **tutti questi aspetti critici**:

1. **Trigger Points** - Quando parte il sync
   - Automatic triggers: login, reconnect, stale data detection
   - Manual triggers: user button, force refresh
   - Tutti i modi in cui questo specifico sync può essere attivato

2. **Step-by-Step Flow** - Cosa fa internamente
   - Sequenza atomica completa: acquires context → scrapes Archibald → processes data → writes to SQLite → notifies frontend
   - Ogni step documentato con dettagli

3. **Concurrency Scenarios** - Quando può girare con altri sync
   - **Focus principale: single-user concurrency** (un agente che triggera multipli sync)
   - Esempio: login triggera customers+products+prices insieme → cosa succede?
   - Può questo sync girare mentre altri sync sono attivi?
   - Race conditions possibili nella stessa sessione?

4. **Dependencies** - Cosa serve prima
   - Questo sync dipende da altri sync?
   - Esempio: orders sync ha bisogno che customers sia già popolato?
   - Catena di dipendenze tra i 4 sync

5. **Current Issues/Bottlenecks** - Problemi osservati oggi
   - Lentezza, blocking UI, errori frequenti, dati inconsistenti
   - Cosa NON funziona bene nel sistema attuale

**Formato:** Documenti narrativi atomici — stile "storia di come funziona ogni sync". Non tabelle aride, ma spiegazione step-by-step che racconta il flusso.

</essential>

<boundaries>
## What's Out of Scope

Questa fase è **SOLO discovery e mappatura**. Zero implementazione.

**Non facciamo in Phase 14:**
- ❌ Non tocchiamo il codice dei sync (solo analisi e documentazione)
- ❌ Non testiamo i sync (il testing formale è Phase 15)
- ❌ Non progettiamo soluzioni (scheduler, coordination, optimization vengono dopo)
- ❌ Non ottimizziamo performance
- ❌ Non rifactoriamo codice esistente

**Possiamo fare:**
- ✅ Analizzare il codice esistente (read-only)
- ✅ Eseguire sync per osservare il comportamento (non stress testing formale)
- ✅ Documentare problemi osservati (ma non risolverli)
- ✅ Identificare race conditions e bottleneck (ma non fixarli)

**Principio guida:** Capiamo prima, agiamo dopo. Questa fase costruisce la conoscenza necessaria per le fasi successive.

</boundaries>

<specifics>
## Specific Ideas

1. **4 Documenti Atomici** - Struttura definitiva:
   - `customers-sync.md` (per-user sync)
   - `products-sync.md` (shared sync)
   - `prices-sync.md` (shared sync)
   - `orders-sync.md` (per-user sync)

2. **Differenziazione Shared vs Per-User:**
   - Ogni documento specifica chiaramente: "Questo è un sync **shared**" o "Questo è un sync **per-user**"
   - Documentare come questa caratteristica impatta triggers, concurrency, cache invalidation

3. **Focus Concurrency:**
   - **Priorità alta:** Single-user concurrency (un agente, multipli sync nella stessa sessione)
   - Esempio da analizzare: login triggera customers+products+prices → come vengono orchestrati?
   - Multi-user concurrency (shared resources) può essere accennato ma non è il focus principale di questa fase

4. **Stile Narrativo:**
   - Non elenchi puntati aridi
   - Racconta una storia: "Quando l'utente fa login, il customer sync parte perché... poi fa X, poi fa Y, poi scrive Z..."
   - Spiegazioni step-by-step che chiunque può seguire

</specifics>

<notes>
## Additional Context

**Problema originale da risolvere:** "La PWA deve avere tutti i 4 database popolati per funzionare. Prodotti e prezzi sono shared 1:1 tra tutti gli agenti, clienti e ordini sono per singolo utente. I dati vengono scrapati da Archibald. La PWA deve avere sempre tutti i dati aggiornati, e utilizzando GSD vogliamo analizzare tutto il sistema di sync e sviluppare fasi super strutturate."

**Milestone Goal:** "Bulletproof sync reliability with comprehensive analysis of all 4 database sync systems, concurrent scenario testing, and intelligent sync orchestration."

**Phase 14 Position:** Prima fase del milestone v2.0 — costruisce le fondamenta di conoscenza per tutte le 7 fasi successive (15-21).

**Stato codice sync esistente:**
- Backend services: `customer-sync-service.ts`, `product-sync-service.ts`, `price-sync-service.ts`
- PriorityManager già implementato (Phase 4.1-01) per pause/resume coordination
- Frontend cache: IndexedDB con Dexie.js (Phase 8)
- Trigger automatici: login, reconnect (online detection), stale data (3-day threshold)
- Trigger manuali: force refresh button in header

**Decisioni pregresse rilevanti:**
- Phase 4.1-01: PriorityManager singleton per pause/resume durante order creation
- Phase 8: Offline-first architecture con IndexedDB cache
- Phase 8-08: 3-day threshold per stale data warning
- Phase 9: Conflict detection e resolution per dati stale

Questi pattern esistenti devono essere analizzati e documentati in Phase 14.

</notes>

---

*Phase: 14-sync-discovery-mapping*
*Context gathered: 2026-01-17*

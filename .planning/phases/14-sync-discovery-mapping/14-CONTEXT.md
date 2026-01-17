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

In questa fase dobbiamo **capire completamente come funziona il sistema oggi E RISOLVERE I PROBLEMI CRITICI TROVATI**.

**Deliverable finale:**
1. **4 documenti narrativi atomici** (uno per ogni database) che raccontano la storia completa di come funziona ogni sync:
   - `customers-sync.md` - Come funziona il customer sync (per-user)
   - `products-sync.md` - Come funziona il product sync (shared 1:1)
   - `prices-sync.md` - Come funziona il price sync (shared 1:1)
   - `orders-sync.md` - Come funziona il order sync (per-user)

2. **Codice refactorato e ottimizzato** con problemi critici risolti:
   - Race conditions fixate
   - Blocking UI eliminato
   - Concurrency gestita correttamente
   - Performance ottimizzate

Ogni documento specifica se è shared o per-user e come questo impatta il comportamento del sync.

</vision>

<essential>
## What Must Be Nailed

Per ogni sync (customers, products, prices, orders), dobbiamo:

### PARTE 1: Discovery & Documentazione

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

### PARTE 2: Fix & Implementazione

6. **Risolvere Problemi Critici** - Fix immediati
   - Eliminare race conditions identificate
   - Risolvere blocking UI
   - Fixare errori di concurrency
   - Gestire correttamente le dipendenze

7. **Refactoring & Ottimizzazione**
   - Migliorare architettura se necessario
   - Ottimizzare performance dei colli di bottiglia
   - Implementare pattern migliori per concurrency

8. **Testing & Validazione**
   - Creare backup prima delle modifiche
   - Testare ogni fix implementato
   - Validare che i problemi siano risolti

**Formato:**
- Documenti narrativi atomici — stile "storia di come funziona ogni sync"
- Codice pulito e refactorato con problemi risolti
- Test che validano i fix implementati

</essential>

<boundaries>
## What's Out of Scope

Questa fase è **discovery + fix problemi critici**. Include analisi e implementazione.

**Facciamo in Phase 14:**
- ✅ Analizzare il codice esistente (lettura profonda)
- ✅ Documentare come funziona ogni sync (narrativo)
- ✅ Identificare problemi critici (race conditions, blocking UI, bottleneck)
- ✅ **RISOLVERE i problemi critici identificati** (con backup preventivo)
- ✅ Testare i fix implementati
- ✅ Refactorare codice problematico
- ✅ Ottimizzare colli di bottiglia evidenti

**NON facciamo in Phase 14:**
- ❌ Progettare nuovi sistemi complessi (scheduler, orchestrator) → Phase 18
- ❌ Testing formale estensivo con tutti gli scenari edge case → Phase 15
- ❌ Monitoring e observability avanzati → Phase 19
- ❌ Retry strategies e error recovery complessi → Phase 20
- ❌ Performance optimization completa e sistematica → Phase 21

**Principio guida:** Capiamo E agiamo. Questa fase risolve i problemi critici immediati mentre documenta il sistema. Le fasi successive aggiungono features avanzate (monitoring, retry, optimization sistematica).

**Approccio sicuro:**
1. Backup del codice prima di ogni modifica
2. Fix incrementali con test immediati
3. Commit atomici per ogni problema risolto
4. Possibilità di rollback se necessario

</boundaries>

<specifics>
## Specific Ideas

### Workflow per Ogni Sync

**Step 1: Analisi & Discovery** (read-only)
1. Leggere il codice del service (`*-sync-service.ts`)
2. Identificare tutti i trigger points
3. Mappare lo step-by-step flow
4. Analizzare concurrency scenarios
5. Identificare dependencies
6. Documentare current issues

**Step 2: Documentazione Narrativa**
1. Creare documento `{sync-name}-sync.md`
2. Scrivere in stile narrativo (non tabelle)
3. Specificare chiaramente se shared o per-user
4. Documentare problemi trovati con evidenze

**Step 3: Fix & Implementation** (con backup)
1. Creare backup del file originale (`*.ts.backup`)
2. Implementare fix per problemi critici
3. Testare ogni fix immediatamente
4. Commit atomico per ogni problema risolto
5. Aggiornare documentazione con soluzioni implementate

**Step 4: Validazione**
1. Eseguire sync in vari scenari
2. Verificare che problemi siano risolti
3. Documentare risultati test
4. Aggiornare metrics se performance migliorate

### 4 Documenti Atomici - Struttura
Ogni documento include:
- **Type**: Shared o Per-User
- **Trigger Points**: Come viene attivato
- **Flow**: Step-by-step narrativo
- **Concurrency**: Scenari di esecuzione concorrente
- **Dependencies**: Cosa serve prima
- **Issues Found**: Problemi identificati
- **Fixes Implemented**: Soluzioni applicate
- **Test Results**: Validazione dei fix

### Focus Concurrency
- **Priorità alta:** Single-user concurrency (un agente, multipli sync)
- Esempio: login triggera customers+products+prices → come vengono orchestrati?
- Race conditions da identificare e fixare

### Stile Narrativo
Racconta una storia: "Quando l'utente fa login, il customer sync parte perché... poi fa X, poi fa Y, poi scrive Z... PROBLEMA: qui si verifica una race condition perché... FIX: abbiamo risolto con..."

</specifics>

<notes>
## Additional Context

**Problema originale da risolvere:** "La PWA deve avere tutti i 4 database popolati per funzionare. Prodotti e prezzi sono shared 1:1 tra tutti gli agenti, clienti e ordini sono per singolo utente. I dati vengono scrapati da Archibald. La PWA deve avere sempre tutti i dati aggiornati, e utilizzando GSD vogliamo analizzare tutto il sistema di sync e sviluppare fasi super strutturate."

**Milestone Goal:** "Bulletproof sync reliability with comprehensive analysis of all 4 database sync systems, concurrent scenario testing, and intelligent sync orchestration."

**Phase 14 Position:** Prima fase del milestone v2.0 — costruisce le fondamenta di conoscenza E risolve problemi critici per tutte le 7 fasi successive (15-21).

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

Questi pattern esistenti devono essere analizzati, documentati E migliorati in Phase 14.

**Approccio Phase 14 vs Fasi Successive:**
- **Phase 14**: Discovery + fix problemi critici immediati (race conditions, blocking UI, bottleneck evidenti)
- **Phase 15**: Testing formale estensivo con scenari edge case completi
- **Phase 16-17**: Analisi scenari concorrenti avanzati e differenziazione auto/manual
- **Phase 18**: Progettazione e implementazione sync scheduler intelligente
- **Phase 19**: Monitoring e observability avanzati (metriche, dashboard, alerting)
- **Phase 20**: Retry strategies sofisticate e error recovery robusto
- **Phase 21**: Performance optimization sistematica e completa

</notes>

---

*Phase: 14-sync-discovery-mapping*
*Context gathered: 2026-01-17*

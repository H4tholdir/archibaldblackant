# Session Companion — 2026-05-08
## Priority Queue, Preemption & Adaptive Sync Scheduling

> Documento vivo: aggiornato ad ogni passo della sessione.
> Leggi questo per rientrare nel contesto in qualunque momento.

---

## 📌 Contesto di partenza

**Cosa abbiamo oggi (2026-05-08):**
- Conductor (Fase 1, migration #082) con priority lanes: P=10 (ERP write), P=50 (sync-articles on-demand), P=100 (read on-demand), P=500 (BG sync)
- Browser pool: 8 WRITE SLOTS (P<500) + 25 SYNC SLOTS (P≥500)
- BullMQ eliminato — tutto su Conductor
- HTML scraping attivo per customers, orders, DDT, invoices (Fase 2, oggi)
- Sync scheduler: timer fissi ogni `agentSyncMs` (default 10 min) — enqueue 6 sync types per agente senza dedup_key_external
- Global banner: due fasce (utente + BG), QueueDrawer con sezioni separate

**Problemi identificati:**
1. `pickupNextTask` ordina per priority, ma nessuna **preemption** dei task `running` — se sync-orders gira (60-125s), submit-order resta in coda
2. Scheduler: flood di 6 sync × N agenti ogni tick, senza idempotency key → si accumulano
3. Banner BG: messaggi generici ("sync completato" senza dire cosa), ridondante
4. Un solo worker per userId — single-threaded per utente, nessuna corsia parallela
5. `smartCustomerSync` stoppa l'intero scheduler alla login — troppo aggressivo

---

## 🎯 Requisiti dell'utente

### R-1 (CRITICO) — Preemption immediata
Quando l'utente piazza un ordine (o esegue qualsiasi operazione ERP write, P≤10), questa operazione deve **avviarsi immediatamente**, anche se un'operazione BG (P=500) è già in esecuzione. Le sync automatiche NON devono mai bloccare o rallentare le richieste dell'utente.

### R-2 — Coda intelligente per peso
Sistema di gerarchia che riordina la coda in modo intelligente in base al peso delle operazioni. Già esiste `cancelOperation` per task in coda — estenderlo con logica di promozione/spostamento.

### R-3 — Multi-dispositivo persistente
Il global banner deve sincronizzarsi tra tutti i dispositivi dell'utente e persistere alla chiusura/riapertura della PWA.

### R-4 — Sync BG ottimizzate (da progettare)
Le sync automatiche devono girare in modo "consono, elegante, funzionale e soprattutto ottimizzato" secondo logiche di business e operatività. Da ricercare best practice moderne.

### R-5 — Banner chiaro e specifico
I messaggi delle operazioni BG nel banner devono essere specifici e non confusionari. Ridurre ridondanze.

---

## 🔬 Ricerche completate

### Sistemi moderni di job queue + preemption

**BullMQ** (Node.js, Redis): Priority numerica (1=alta). Nessuna preemption nativa dei task running. `changePriority()` per task in coda. O(log n) per enqueue prioritizzato. → **Non preempta running tasks, solo ordina la coda.**

**Sidekiq Pro** (Ruby): Queue weights, strict priority, pausing queues. Anche qui: nessuna preemption del job running — il job finisce, poi il worker prende il prossimo più prioritario. → **Stessa limitazione.**

**Temporal.io**: Workflow Cancellation (cooperativa) + Termination (forzata). Il pattern GA 2024: `priority_key` + `fairness_key` per ordinare i task. La cancellazione cooperativa usa heartbeat signals — il workflow periodicamente controlla se deve fermarsi. → **Pattern cooperativo è lo standard industry.**

**pg-boss + graphile/worker** (PostgreSQL): LISTEN/NOTIFY + `SELECT FOR UPDATE SKIP LOCKED` — esattamente come il nostro Conductor. Nessuna preemption nativa. Graceful shutdown via signal handlers.

### Conclusione chiave della ricerca
**Nessun sistema moderno preempta task running per default.** L'approccio industry-standard è:
1. **Cooperative preemption**: il task in esecuzione controlla periodicamente un flag "devo fermarmi" (heartbeat/signal pattern da Temporal)
2. **Hard termination**: kill del processo/worker come ultima risorsa (non pulito)
3. **Slot separation**: worker pool separati per priority lane — il lane utente è sempre libero

### Scoperta critica nel codice
`makeCooperativeShouldStop(pool, userId)` in `html-sync-utils.ts` è **già scaffoldata** con il TODO "Fase 2B". È già passata a `scrapeListView` in tutti gli HTML sync handler. Restituisce `() => false` (stub). Il sistema di preemption cooperativa è già architettato — basta implementarlo.

### Pattern scheduler moderni
- **Dedup/idempotency key**: standard BullMQ e pg-boss — evita duplicati per lo stesso tipo sync
- **Cooldown window**: "if last_completed_at > now - cooldown, skip enqueue" — pattern standard
- **Backpressure**: non enqueue se il task è già in coda o in esecuzione (gestito da dedup)
- **Activity-aware**: rate diverso per utenti active/idle/offline — già parzialmente implementato con ACTIVE_SYNC_TYPES vs IDLE_SYNC_TYPES

### Frequenze ottimali per Archibald (da durate reali HTML scraping)
| Tipo | Durata reale | Cooldown active | Cooldown idle | Note |
|------|-------------|-----------------|---------------|------|
| sync-orders | 20-50s | 20 min | 60 min | Post-op copre casi urgenti |
| sync-customers | 50s | 30 min | 120 min | |
| sync-ddt | 125s | 60 min | sospesa | |
| sync-invoices | 17s | 60 min | sospesa | |
| sync-products | Mai (PDF) | 4h | sospesa | Manual/weekly |
| sync-prices | HTML | 4h | sospesa | Raramente cambia |
| sync-tracking | 570ms (API) | 15 min | 30 min | Solo ordini pending |
| sync-order-states | DB only | 5 min | 15 min | Istantaneo |

---

## 💡 Approcci considerati

### Preemption
- **A** — Cooperativa pura: shouldStop() tra pagine, latenza 5-15s, pulita
- **B** — Hard browser close: <1s, brutale, usa retry per caso normale
- **C** (SCELTO) — Hybrid: cooperativa primaria + 15s safety net. Garanzia ≤15s.

### Scheduler
- Timer fissi → SCARTATO (flood, ridondanza, nessuna adattività)
- Cooldown fissi per tipo → BASE MINIMA ma non sufficiente
- **Staleness scoring function** (SCELTO) — score dinamico basato su (now - last_sync) / target_freshness

---

## ✅ Decisioni prese

| # | Decisione | Motivazione | Data |
|---|-----------|-------------|------|
| D-1 | Scope: Spec A (priority+scheduling) → Spec B (banner) → Task C (audit) | Sottosistemi dipendenti, A prima | 2026-05-08 |
| D-2 | Preemption: Approccio C Hybrid (cooperativa + 15s safety net) | Pulito + garanzia temporale assoluta | 2026-05-08 |
| D-3 | Scheduler: staleness scoring function (non timer fissi) | Adattivo, nessun valore hardcoded | 2026-05-08 |
| D-4 | Effective Priority: ricalcolata al pickup (non solo all'enqueue) | Permette scoring dinamico in base a contesto | 2026-05-08 |
| D-5 | Queue Pressure System: 0 ops=normale, 1-2=ridotto, 3+=BG soppresso | Garantisce che user ops abbiano sempre risorse libere | 2026-05-08 |

---

## ❓ Domande aperte

_(aggiornato durante il brainstorming)_

---

## 🔥 Bug critici trovati e fixati in questa sessione

### BUG-1 — FIXATO `a5114ff3` — `enqueueWithDedup` rotta con PostgreSQL 0A000
**Causa**: `FOR UPDATE SKIP LOCKED` usato illegalmente dentro una scalar subquery `(SELECT MAX(position) ... FOR UPDATE SKIP LOCKED)`. PostgreSQL code `0A000 feature_not_supported`, routine `CheckSelectLocking`.
**Impatto**: TUTTE le chiamate a `enqueueWithDedup` falliscono — sync-order-articles (bottone UI), post-op sync dopo submit-order/create-customer, trigger manuali. 42 occorrenze in prod.
**Fix**: rimosso `FOR UPDATE SKIP LOCKED` dalla scalar subquery. `SELECT COALESCE(MAX(position), 0) + 1` senza locking — posizione è hint non critico.
**DDT PDF timeout**: aggiunto in log — sync-ddt via PDF impiega >124s → timeout. Da verificare con HTML scraper.

---

## 🚨 Rischi critici identificati (analisi codebase)

### R-CRIT-1 — Preemption + scrape parziale → upsert errato nel DB
**Problema**: se `shouldStop()` scatta a pagina 3/5, `scrapeListView` ritorna dati parziali. Se superano il 70% del count DB precedente, `checkScraperCompleteness` passa e `syncOrders()` sovrascrive il DB con dati incompleti.
**Fix**: `scrapeListView` deve ritornare `{rows, preempted: boolean}`. Se `preempted=true` → handler lancia `PreemptedSignal` (non scrive nulla nel DB) e re-enqueue con `run_after=now+30s`. La preemption deve avvenire PRIMA del completeness check.

### R-HIGH-1 — DDT/Invoices: filter toggle workaround
**Problema**: primo load ERP mostra 0 risultati. Serve toggle "Oggi→Tutti". Se non gestito nei scraper config → sync-ddt/invoices ritorna sempre 0 righe e non aggiorna il DB.
**Verifica richiesta**: leggere `scraper/configs/ddt.ts` e `invoices.ts`.

### R-HIGH-2 — sync-customer-addresses: silent delete se ERP >12s
**Problema**: se ERP lento >12s, `waitForFunction` timeout → `readAltAddresses` ritorna `[]` → `upsertAddressesForCustomer` cancella tutti gli indirizzi esistenti.
**Fix**: guard "se `reliable=false` AND `addresses.length=0` → skip upsert".

### R-MED-1 — Soglia 70% non distingue scrape parziale da riduzione legittima
**Soluzione**: risolta da R-CRIT-1 (PreemptedSignal prima del check). Il 70% resta valido per errori genuini.

### R-LOW-1 — sync-prices: item_selection sempre NULL
**Impatto**: nessuno. Campo già NULL da sempre, nessuna regressione.

---

## 🔬 Verifica prod completata (2026-05-08 ~17:00 UTC)

| Tipo sync | Status | Ultimo run | Note |
|-----------|--------|------------|------|
| sync-orders | ✅ OK | 16:44 UTC | 142 run oggi. Filter OrdersAll warn (non-blocking) |
| sync-ddt | ✅ OK | 16:59 UTC | 133 run. HTML scraper attivo |
| sync-invoices | ✅ OK | 16:59 UTC | 132 run. HTML scraper attivo |
| sync-customer-addresses | ✅ OK | 17:00 UTC | 128 run oggi |
| sync-order-states | ✅ OK | 16:59 UTC | 38 run |
| sync-tracking | ✅ OK | 16:59 UTC | 38 run FedEx API |
| sync-customers | ⚠️ SOSPETTO | 10:45 UTC | Last run 6h fa. 97 run totali oggi. Causa da investigare |
| sync-order-articles | 🔴 ROTTO | 10:47 UTC | Causa: 0A000 bug in enqueueWithDedup. 1 ordine pending |
| enqueueWithDedup | 🔴 ROTTO→FIX | `a5114ff3` | Fix pushato, CI/CD in corso |

**DB stato**: orders=1025, customers=1345, ddt=1144, invoices=353

**Fix deployato**: `a5114ff3` — rimuove `FOR UPDATE SKIP LOCKED` da scalar subquery in `enqueueWithDedup`.

**Da investigare post-deploy**: sync-customers non gira da 6h nonostante scheduler attivo per ddt/invoices/orders. Possibile causa: `smartCustomerSync` ha fermato il scheduler che non si è ripreso per customers.

**Filter combo OrdersAll warning**: non bloccante — orders completa con dati. Da fixare per correttezza.

---

## 📊 Stato di avanzamento

| Fase | Status | Note |
|------|--------|------|
| Scope assessment | ✅ Completato | Opzione A scelta |
| Ricerca best practice | ✅ Completato | Cooperative preemption standard industry |
| Approcci proposti | ✅ Completato | Approccio C (hybrid) scelto |
| Design sistema adattivo | ✅ Presentato | EP scoring + staleness scheduler + pressure system |
| Fase 0 audit identificata | ✅ Completata | R-CRIT-1, R-HIGH-1, R-HIGH-2 trovati |
| Verifica prod | ✅ Completata | sync-order-articles rotto 0A000, fix pushato |
| Design completo approvato | ✅ Approvato | Utente ha confermato |
| Spec scritta su file | 🔄 In corso | |
| Advisor review | ⏳ Pending | |
| Codex adversarial review | ⏳ Pending | |
| Spec B (Banner UX) | ⏳ Pending | |
| Admin/Control Panel audit | ⏳ Pending | task separato |

---

## 📝 Log della sessione

### 2026-05-08 — Avvio sessione

**Richiesta dell'utente:** Riprogettare il sistema di priorità/preemption per il Conductor e le sync BG. L'utente vuole che le operazioni attive (es. submit-order) partano **immediatamente**, preemptando le sync automatiche. Vuole un sistema gerarchico intelligente. Il banner deve essere chiaro. Audit admin/control panel dopo migrazione HTML scraping.

**Comprensione attuale:** Il sistema attuale ha priority ordering corretto (P=10 < P=500 in `ORDER BY priority ASC`) ma **zero preemption** — un task P=500 running non viene mai interrotto, anche se arriva un P=10. Il bottleneck è `user_id NOT IN (SELECT user_id WHERE status='running')` in `pickupNextTask`: un userId può avere UN SOLO task running alla volta. Quindi sync-orders running per 60-125s blocca qualsiasi operazione utente.

**Approccio sessione:** Brainstorming → Spec A → Spec B → Advisor review → Codex adversarial review.

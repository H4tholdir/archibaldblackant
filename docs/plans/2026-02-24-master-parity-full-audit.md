# AUDIT DI PARITÀ COMPLETA: master → feat/unified-operation-queue

## CONTESTO CRITICO

Questa PWA è in **produzione**. Il branch `master` è il baseline funzionante che gli utenti usano
ogni giorno. Il branch `feat/unified-operation-queue` introduce una migrazione architetturale
(SQLite → PostgreSQL, coda BullMQ, route modulari) ma durante la riscrittura **alcune funzionalità
del master sono state perse o degradate**. Se mergiamo senza parità al 100%, gli utenti non
potranno più usare la PWA.

### Architettura master (REFERENCE — è il source of truth)
- **Backend**: monolite `archibald-web-app/backend/src/index.ts` (~8181 righe, 141 endpoint)
- **DB**: SQLite via `better-sqlite3`
- **Servizi**: file singoli in `src/` (customer-sync-service.ts, ddt-sync-service.ts, ecc.)
- **Frontend**: chiamate dirette REST + EventSource/SSE per progress

### Architettura branch (TARGET — deve avere TUTTE le feature del master)
- **Backend**: modulare con `main.ts` (bootstrap) + `server.ts` (wiring) + 17 file route in `src/routes/`
- **DB**: PostgreSQL via `pg` pool + migrazioni SQL in `src/db/migrations/`
- **Queue**: BullMQ con `enqueueOperation` pattern
- **Frontend**: migrato a `api/operations.ts` (enqueueOperation + pollJobUntilDone)
- **159 endpoint** totali nelle route (vs 141 del master)
- **177 file backend rimossi** dal master (refactored nella nuova struttura)

### Piani esistenti da consultare (NON fidarsi ciecamente — verificare indipendentemente)
- `docs/plans/2026-02-24-master-parity-fixes.md` — 9 gap già identificati (F1, F2, F5-F9, B1, B2)
- `docs/plans/2026-02-24-frontend-queue-migration.md` — migrazione frontend a queue
- `docs/plans/2026-02-19-endpoint-migration-plan.md` — piano migrazione endpoint

## COMPITO

Esegui un audit ATOMICO, ESAUSTIVO e SISTEMATICO di parità 1:1 tra master e branch.
Ogni singola funzionalità, endpoint, flusso utente, gestione errori, messaggio di errore,
WebSocket event, e comportamento UX che esiste nel master DEVE esistere e funzionare
identicamente nel branch (adattato alla nuova architettura queue-based).

## METODOLOGIA — FASI OBBLIGATORIE

### FASE 1: MAPPA COMPLETA DEL MASTER (read-only, nessuna modifica)

1. **Endpoint inventory**: Estrai TUTTI i 141 endpoint da `master:archibald-web-app/backend/src/index.ts`
   con: metodo HTTP, path, parametri, body atteso, response shape, middleware usati.

2. **Flussi frontend**: Per OGNI pagina/componente frontend del master, documenta:
   - Quali endpoint chiama
   - Come gestisce errori (messaggi specifici, retry, fallback)
   - Eventuali SSE/WebSocket/polling
   - Stati UI (loading, error, success, empty state)

3. **Servizi backend critici**: Mappa le funzionalità di ogni servizio rimosso:
   - `customer-sync-service.ts`, `ddt-sync-service.ts`, `invoice-sync-service.ts`
   - `customer-db.ts`, `user-db.ts`, `device-manager.ts`
   - `browser-pool.ts`, `interactive-session.ts`
   - `excel-vat-importer.ts`, `fresis-history-realtime.service.ts`
   - `job-progress-mapper.ts`, `dashboard-service.ts`

### FASE 2: VERIFICA 1:1 NEL BRANCH

Per OGNI elemento mappato in Fase 1, verifica nel branch:

1. **Endpoint per endpoint**: Per ognuno dei 141 endpoint master:
   - [ ] Esiste un endpoint equivalente nel branch? (in quale file route?)
   - [ ] Accetta gli stessi parametri/body?
   - [ ] Restituisce la stessa shape di response?
   - [ ] Ha lo stesso middleware auth?
   - [ ] Gestisce gli stessi casi di errore?

2. **Frontend flow per flow**: Per ogni componente modificato:
   - `OrderCardNew.tsx` — edit-order, delete-order, send-to-verona, download PDF, sync-articles
   - `PendingOrdersPage.tsx` — batch submit, singolo submit
   - `SyncButton.tsx` — quick-check → sync condizionale
   - `SyncControlPanel.tsx` — ultima sync, smart customer sync banner, per-type status
   - `OrderHistory.tsx` — storico ordini
   - `CacheRefreshButton.tsx` — refresh cache
   - `SyncBanner.tsx`, `SyncBars.tsx` — indicatori sync
   - `customers.service.ts`, `orders.service.ts` — servizi dati

3. **WebSocket events**: Verifica che TUTTI gli eventi WS del master siano emessi nel branch:
   - `ORDER_SUBMIT_PROGRESS`, `ORDER_SUBMIT_COMPLETE`, `ORDER_SUBMIT_ERROR`
   - `ORDER_DELETE_COMPLETE`, `ORDER_EDIT_COMPLETE`
   - `SYNC_PROGRESS`, `SYNC_COMPLETE`
   - `PDF_DOWNLOAD_PROGRESS`, `PDF_DOWNLOAD_COMPLETE`
   - Qualsiasi altro evento presente nel master

4. **Error handling**: Verifica che ogni `catch`, `setError()`, messaggio di errore italiano
   nel master sia preservato nel branch con lo stesso testo e comportamento.

### FASE 3: REPORT DEI GAP

Produci una tabella con TUTTI i gap trovati:

| # | Severità | Area | File master | File branch | Descrizione gap | Fix proposto |
|---|----------|------|-------------|-------------|-----------------|--------------|

Severità:
- **CRITICO**: L'utente non può completare un'azione (submit ordine, login, sync)
- **ALTO**: Funzionalità degradata (errore silente, messaggio mancante, retry mancante)
- **MEDIO**: UX degradata (info mancante, stato mancante, performance peggiore)
- **BASSO**: Cosmetico o non user-facing

### FASE 4: FIX ATOMICI

Per ogni gap trovato, implementa il fix seguendo queste regole:
- **Un fix per gap** — non raggruppare fix non correlati
- **Preserva l'architettura queue-based** — non reintrodurre chiamate dirette
- **Test**: ogni fix deve passare type-check e test esistenti
- **Nessun effetto collaterale**: ogni fix deve toccare solo i file necessari

### FASE 5: VERIFICA FINALE

Dopo TUTTI i fix:
1. `npm run type-check --prefix archibald-web-app/frontend` ✅
2. `npm test --prefix archibald-web-app/frontend` ✅
3. `npm run build --prefix archibald-web-app/backend` ✅
4. `npm test --prefix archibald-web-app/backend` ✅

## REGOLE ASSOLUTE

1. **Il master è il source of truth.** Se c'è un dubbio, il comportamento del master vince.
2. **Non aggiungere feature nuove.** Solo ripristinare parità.
3. **Non rimuovere feature nuove del branch** che non esistono nel master (es. nuovi endpoint
   di delta-sync, admin, ecc.) — quelli vanno preservati.
4. **Non modificare la nuova architettura.** I fix devono adattarsi al pattern queue/route
   modulari, non regredire al monolite.
5. **Sii paranoico.** Ogni endpoint mancante, ogni messaggio di errore diverso, ogni stato
   UI perso è un potenziale blocco per gli utenti in produzione.
6. **Log tutto.** Per ogni verifica, scrivi esplicitamente "✅ verificato" o "❌ GAP TROVATO".

## ORDINE DI PRIORITÀ DEI FIX

1. Auth flow (login, JWT, middleware) — senza questo niente funziona
2. Submit/edit/delete ordini — core business
3. Sync (customers, orders, products, prices, DDT, invoices) — dati aggiornati
4. PDF download (DDT, fatture) — necessario per operatività
5. Gestione clienti (ricerca, sessioni interattive)
6. Dashboard/monitoring/admin
7. UX (messaggi errore, stati loading, banner informativi)

## FILE CHIAVE DA CONFRONTARE

### Backend (master → branch)
| Master | Branch equivalent |
|--------|-------------------|
| `src/index.ts` (monolite 8181 righe) | `src/server.ts` + `src/main.ts` + `src/routes/*.ts` |
| `src/archibald-bot.ts` | `src/bot/archibald-bot.ts` |
| `src/browser-pool.ts` | `src/bot/browser-pool.ts` |
| `src/customer-db.ts` | `src/db/repositories/customers.ts` |
| `src/user-db.ts` | `src/db/repositories/users.ts` |
| `src/device-manager.ts` | `src/db/repositories/devices.ts` |
| `src/customer-sync-service.ts` | `src/sync/handlers/sync-customers-handler.ts` (verificare) |
| `src/ddt-sync-service.ts` | `src/sync/handlers/sync-ddt-handler.ts` (verificare) |
| `src/invoice-sync-service.ts` | `src/sync/handlers/sync-invoices-handler.ts` (verificare) |
| Migrazioni `.ts` sequenziali | Migrazioni `.sql` in `src/db/migrations/` |

### Frontend (file con diff significativi)
| File | Righe master | Righe branch | Delta |
|------|-------------|-------------|-------|
| `OrderCardNew.tsx` | 4278 | 4312 | +34 |
| `PendingOrdersPage.tsx` | 2132 | 2106 | -26 |
| `SyncControlPanel.tsx` | 648 | 584 | -64 ⚠️ |
| `SyncButton.tsx` | 173 | 168 | -5 |

Il `SyncControlPanel.tsx` con -64 righe è particolarmente sospetto — indica funzionalità rimossa.

## OUTPUT ATTESO

1. Report completo dei gap (tabella)
2. Ogni gap fixato con commit atomico
3. Tutti i test e type-check passano
4. Conferma esplicita che OGNI endpoint del master ha il suo equivalente nel branch

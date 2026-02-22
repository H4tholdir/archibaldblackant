# Project: Archibald — Unified Operation Queue Migration

## What This Is

Completamento del branch `feat/unified-operation-queue` per raggiungere **parità funzionale al 100%** con master, mantenendo la nuova architettura (dependency injection, coda BullMQ unificata, PostgreSQL, route modulari). Dopo il merge, la PWA deve funzionare esattamente come la versione attuale ma su fondamenta solide e moderne.

## Core Value

Una PWA per agenti commerciali Komet che funziona **identicamente** alla versione in produzione, ma con un backend modulare, testabile e manutenibile — pronto per lo sviluppo futuro senza il debito tecnico del monolite `index.ts` da 8.181 righe.

## Requirements

### Validated

- ✓ Auth system (login, logout, refresh, me) — existing
- ✓ Admin user CRUD (create, list, whitelist, delete) — existing
- ✓ Customer CRUD + photo management — existing
- ✓ Product catalog with variants and search — existing
- ✓ Price management with history — existing
- ✓ Order creation via Puppeteer bot automation — existing
- ✓ Order history with state tracking — existing
- ✓ Order edit/delete in Archibald — existing
- ✓ DDT sync (scraper + PDF) — existing
- ✓ Invoice sync (scraper + PDF) — existing
- ✓ PDF download (invoice + DDT) with progress — existing
- ✓ Send to Milano/Verona — existing
- ✓ Subclient management — existing
- ✓ Fresis history + discounts — existing
- ✓ Warehouse management — existing
- ✓ Sync orchestration (customers, products, prices, orders, DDT, invoices) — existing
- ✓ Auto-sync scheduling with start/stop — existing
- ✓ SSE sync progress — existing
- ✓ WebSocket real-time sync — existing
- ✓ Dashboard widgets (budget, orders, exclusions) — existing
- ✓ User target management — existing
- ✓ Privacy settings — existing
- ✓ Health checks — existing
- ✓ BullMQ job management (admin: list, retry, cancel, cleanup) — existing
- ✓ Delta sync — existing
- ✓ Share routes (PDF via Dropbox, email) — existing
- ✓ Graceful shutdown — existing

### Active

#### Elementi MANCANTI (❌) — 18 elementi da implementare

**Priorità ALTA — Funzionalità critiche in produzione:**
- [ ] POST /api/customers/smart-sync — fast sync clienti all'apertura form ordine
- [ ] POST /api/customers/resume-syncs — ripresa sync dopo uscita form
- [ ] POST /api/orders/sync-states — sync stati ordini + propagazione a fresis_history
- [ ] GET /api/orders/resolve-numbers — mapping Archibald IDs → numeri ordine
- [ ] Interactive customer sessions (5 endpoint: start, vat, heartbeat, save, delete) — presenti come stub
- [ ] DELETE /api/sync/:type/clear-db — reset e re-sync completo per tipo

**Priorità MEDIA — Admin/Monitoring:**
- [ ] GET /api/sync/quick-check — check se serve sync iniziale
- [ ] POST /api/sync/intervals/:type — configurazione dinamica intervalli sync
- [ ] POST /api/admin/sync/frequency — admin: modifica frequenza sync
- [ ] GET /api/prices/unmatched — prodotti senza match IVA
- [ ] POST /api/prices/match — trigger matching prezzi
- [ ] GET /api/prices/sync/stats — statistiche sync prezzi
- [ ] GET /api/prices/history/summary — top variazioni prezzo
- [ ] POST /api/sync/reset/:type — reset checkpoint per tipo

**Priorità BASSA — Secondari:**
- [ ] GET /metrics (Prometheus) — monitoring esterno
- [ ] GET /api/cache/export — export cache (valutare se ancora necessario)
- [ ] Adaptive timeouts (3 endpoint) — gestione timeout dinamici
- [ ] GET /api/admin/jobs/retention — retention policy jobs
- [ ] POST /api/test/login — endpoint di debug
- [ ] 6 health check PDF parser — monitoring parser

#### Elementi PARZIALI/STUB (⚠) — 11 elementi da completare

- [ ] Interactive customer sessions — 5 endpoint stub in routes/customer-interactive.ts
- [ ] 6 health check PDF parser — da verificare in server.ts
- [ ] GET /api/customers/sync/metrics — da verificare
- [ ] GET /api/products/sync-history — da verificare
- [ ] GET /api/products/last-sync — da verificare

#### Elementi RIPROGETTATI (🔄) — 42 elementi da verificare parità

- [ ] Verificare che tutti i 42 elementi riprogettati mantengano parità funzionale con master
- [ ] Verificare che il frontend funzioni correttamente con i nuovi path
- [ ] Aggiornare il frontend per tutti i path cambiati (8 path rinominati/unificati)

#### Aggiornamenti Frontend per Path Cambiati

- [ ] GET /api/auth/me → GET /api/auth/verify
- [ ] GET /api/orders/status/:jobId → GET /api/operations/:jobId/status
- [ ] GET /api/orders/my-orders → GET /api/operations/user/:userId
- [ ] GET /api/queue/stats → GET /api/operations/stats
- [ ] GET /api/customers/search → GET /api/customers?search=
- [ ] GET /api/products/search → GET /api/products?search=
- [ ] POST /api/orders/:id/edit-in-archibald → POST /api/operations/enqueue type=edit-order
- [ ] POST /api/orders/:id/delete-from-archibald → POST /api/operations/enqueue type=delete-order

### Out of Scope

- Nuove feature non presenti in master — questo progetto è solo migrazione
- Redesign UI frontend — solo aggiornamento path API
- Phase 28.2 OrderForm rewrite — da completare in progetto successivo
- Migrazione a PostgreSQL in produzione — il branch usa già PostgreSQL ma il deployment è fuori scope

## Constraints

- Lavorare sul branch `feat/unified-operation-queue` esistente
- Parità funzionale 100% con master — nessuna funzionalità persa
- La PWA deve funzionare identicamente alla versione in produzione
- Nuova architettura: dependency injection, BullMQ coda unificata, route modulari
- Database: PostgreSQL (pg pool) nel branch vs SQLite (better-sqlite3) in master

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Completare branch esistente | Il lavoro di migrazione è già al 78% (migrati + riprogettati) | Lavorare su feat/unified-operation-queue |
| Parità funzionale come priorità #1 | L'utente vuole zero regressioni dopo il merge | Verificare ogni endpoint riprogettato |
| Analizzare anche i 🔄 RIPROGETTATI | Non basta implementare i mancanti, i riprogettati devono funzionare identicamente | Review completa dei 42 elementi riprogettati |
| Frontend aggiornamento path only | Nessun redesign, solo aggiornare le chiamate API per i nuovi path | 8 path da aggiornare nel frontend |

## Source Document

Review anatomica completa: `/Users/hatholdir/Downloads/mappa.pdf` (27 pagine)
- Confronto 1:1 di ogni elemento di `index.ts` (master) con il branch
- 129 elementi totali analizzati
- Statistiche: 45% migrato, 33% riprogettato, 8% parziale, 14% mancante

---
*Last updated: 2026-02-22 after initialization*

# Roadmap: Archibald — Unified Operation Queue Migration

## Overview

Completare il branch `feat/unified-operation-queue` raggiungendo parità funzionale al 100% con master. Il primo milestone ha coperto la migrazione architetturale e i 18 endpoint mancanti. Il secondo milestone ha chiuso i 5 elementi rimasti. Il terzo milestone chiude i 25 gap rimanenti trovati nell'audit 1:1 master vs branch.

## Domain Expertise

None

## Milestones

- ✅ **v1.0 Endpoint Parity** - Phases 1-7 (shipped 2026-02-23, 20 plans)
- ✅ **v1.1 Full Feature Parity** - Phases 8-10 (shipped 2026-02-23, 7 plans)
- 🚧 **v1.2 Production Parity** - Phases 11-16 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

<details>
<summary>✅ v1.0 Endpoint Parity (Phases 1-7) - SHIPPED 2026-02-23</summary>

- [x] **Phase 1: Verification & Test Infrastructure** - Verifica dei 42 elementi riprogettati e setup infrastruttura test
- [x] **Phase 2: Critical Missing Endpoints** - 6 endpoint ad alta priorità mancanti
- [x] **Phase 3: Admin & Monitoring Endpoints** - 8 endpoint a media priorità
- [x] **Phase 4: Low Priority & Debug Endpoints** - 6 endpoint a bassa priorità
- [x] **Phase 5: Stubs & Partial Completion** - Completamento degli 11 elementi parziali/stub
- [x] **Phase 6: Frontend Path Migration** - Aggiornamento 8 path API nel frontend
- [x] **Phase 7: Integration Testing & Parity Validation** - Test E2E e validazione parità 100%

### Phase 1: Verification & Test Infrastructure
**Goal**: Verificare che i 42 elementi riprogettati mantengano parità funzionale con master.
**Plans**: 3 plans

Plans:
- [x] 01-01: Audit dei 42 elementi riprogettati
- [x] 01-02: Code audit of 49 redesigned elements
- [x] 01-03: Fix divergenze trovate durante l'audit

### Phase 2: Critical Missing Endpoints
**Goal**: Implementare i 6 endpoint ad alta priorità mancanti.
**Plans**: 4 plans

Plans:
- [x] 02-01: POST /api/customers/smart-sync e POST /api/customers/resume-syncs
- [x] 02-02: POST /api/orders/sync-states e GET /api/orders/resolve-numbers
- [x] 02-03: Interactive customer sessions (5 endpoint)
- [x] 02-04: DELETE /api/sync/:type/clear-db

### Phase 3: Admin & Monitoring Endpoints
**Goal**: Implementare gli 8 endpoint di admin e monitoring a media priorità.
**Plans**: 3 plans

Plans:
- [x] 03-01: GET /api/sync/quick-check, POST /api/sync/intervals/:type, POST /api/admin/sync/frequency
- [x] 03-02: GET /api/prices/unmatched, POST /api/prices/match, GET /api/prices/sync/stats, GET /api/prices/history/summary
- [x] 03-03: POST /api/sync/reset/:type

### Phase 4: Low Priority & Debug Endpoints
**Goal**: Implementare i 6 endpoint a bassa priorità.
**Plans**: 3 plans

Plans:
- [x] 04-01: GET /metrics (Prometheus), GET /api/cache/export
- [x] 04-02: Adaptive timeouts (3 endpoint), GET /api/admin/jobs/retention
- [x] 04-03: POST /api/test/login, 6 health check PDF parser

### Phase 5: Stubs & Partial Completion
**Goal**: Completare gli 11 elementi parziali/stub.
**Plans**: 1 plan

Plans:
- [x] 05-01: Sync monitoring endpoints

### Phase 6: Frontend Path Migration
**Goal**: Aggiornare tutte le chiamate API nel frontend per i path rinominati/unificati.
**Plans**: 3 plans

Plans:
- [x] 06-01: Aggiornare auth/me, orders/status, orders/my-orders
- [x] 06-02: Verification sweep — queue/stats, customers/search, products/search
- [x] 06-03: Verification sweep — edit/delete-in-archibald → operations/enqueue

### Phase 7: Integration Testing & Parity Validation
**Goal**: Validazione end-to-end completa della parità funzionale al 100% con master.
**Plans**: 3 plans

Plans:
- [x] 07-01: Endpoint parity audit (289 tests) + cross-flow integration tests (20 tests)
- [x] 07-02: Response shape regression (21 tests) + frontend API contract verification (23 tests)
- [x] 07-03: Validazione finale e checklist pre-merge

</details>

### ✅ v1.1 Full Feature Parity (Shipped 2026-02-23)

**Milestone Goal:** Implementare i 5 elementi rimasti per parità funzionale completa con master — wiring DI mancante, device registration, price management.

- [x] **Phase 8: Quick Wiring** - Reset checkpoint, test login, audit log send-to-verona
- [x] **Phase 9: Device Registration** - Tabella user_devices, DeviceManager, hook nel login
- [x] **Phase 10: Price Management** - Migrazione price_history, PriceMatchingService, 4 endpoint

## Phase Details

### Phase 8: Quick Wiring
**Goal**: Collegare 3 funzionalità che hanno già slot DI pronti — reset sync checkpoint, test login bot, audit log su invio ordine.
**Depends on**: v1.0 complete
**Research**: Unlikely (codice master analizzato, pattern DI stabiliti)
**Plans**: 2 plans

Plans:
- [x] 08-01: Wire DI dependencies (resetSyncCheckpoint + createTestBot)
- [x] 08-02: Add audit log to send-to-verona handler

### Phase 9: Device Registration
**Goal**: Implementare il device tracking al login — repository CRUD per user_devices (tabella già esistente), hook nel login handler.
**Depends on**: Phase 8
**Research**: Unlikely (schema e logica master analizzati)
**Plans**: 1 plan

Plans:
- [x] 09-01: Device repository + login hook wiring

### Phase 10: Price Management
**Goal**: Implementare il sistema completo di price management — migrazione price_history in PostgreSQL, PriceMatchingService per matching prezzi↔prodotti, 4 endpoint fully functional.
**Depends on**: Phase 9
**Research**: Unlikely (algoritmo matching e schema DB analizzati da master)
**Plans**: 4 plans

Plans:
- [x] 10-01: parseItalianPrice + matchVariant pure functions (TDD)
- [x] 10-02: Price History PostgreSQL migration + repository
- [x] 10-03: matchPricesToProducts service + wire stubs in server.ts
- [x] 10-04: sync-prices operation handler + final verification

### 🚧 v1.2 Production Parity (In Progress)

**Milestone Goal:** Chiudere tutti i 25 gap trovati nell'audit 1:1 master vs branch — bootstrap, stubs, endpoint mancanti, sync enhancements. Design doc: `docs/plans/2026-02-23-full-parity-v1.2-design.md`

- [x] **Phase 11: Bootstrap & Entry Point** - main.ts, migrations, graceful shutdown, background services
- [x] **Phase 12: Subclient System** - Repository PostgreSQL, Excel importer, wire stubs
- [x] **Phase 13: Fresis History Completion** - Arca export/import, FT numbering, endpoint mancanti, bulk discounts
- [x] **Phase 14: Price/VAT Excel Import** - ExcelVatImporter, matching prodotti, propagazione VAT
- [ ] **Phase 15: Admin Session & SSE** - Impersonificazione admin, eventi SSE real-time
- [ ] **Phase 16: Sync Enhancements** - Checkpoint/resume, retry, delta sync, optimizer

## Phase Details (v1.2)

### Phase 11: Bootstrap & Production Entry Point
**Goal**: L'app deve poter partire in produzione — entry point, migrations, shutdown, background services.
**Depends on**: v1.1 complete
**Plans**: 2 plans

Plans:
- [x] 11-01: main.ts entry point (pool, queue, browserPool, scheduler, createApp, listen, shutdown)
- [x] 11-02: Migration runner on startup + background services init

### Phase 12: Subclient System
**Goal**: Subclient CRUD + import Excel completamente funzionanti con tutti i 15 campi dal master.
**Depends on**: Phase 11
**Plans**: 2 plans

Plans:
- [x] 12-01: Subclient PostgreSQL repository + wire stubs in server.ts
- [x] 12-02: Subclient Excel importer (code normalization, header mapping, bulk upsert)

### Phase 13: Fresis History Completion
**Goal**: Tutte le funzionalità fresis — Arca export/import, FT numbering, endpoint mancanti, bulk discounts.
**Depends on**: Phase 11
**Plans**: 2 plans

Plans:
- [x] 13-01: getNextFtNumber + exportArca + importArca implementations
- [x] 13-02: Missing endpoints (reassign-merged, PUT /:id, archive) + discount bulk upload

### Phase 14: Price/VAT Excel Import
**Goal**: Import Excel VAT con matching prodotti e propagazione VAT ai sibling variants.
**Depends on**: Phase 11
**Plans**: 2 plans

Plans:
- [x] 14-01: Foundation — Migration + excel-vat-imports repository + product helpers (findSiblingVariants, updateProductVat)
- [x] 14-02: Excel VAT importer service + wire stubs in server.ts

### Phase 15: Admin Session & SSE
**Goal**: Impersonificazione admin funzionante + eventi SSE real-time per job progress.
**Depends on**: Phase 11
**Plans**: 2 plans

Plans:
- [ ] 15-01: Admin sessions PostgreSQL repository + wire stubs in server.ts
- [ ] 15-02: SSE job event bus + wire onJobEvent in server.ts/main.ts

### Phase 16: Sync Enhancements
**Goal**: Parità completa sistema sync — checkpoint/resume a livello pagina, retry con backoff, delta sync, optimizer.
**Depends on**: Phase 11
**Plans**: 3 plans

Plans:
- [ ] 16-01: Sync checkpoint repository with page-level resume
- [ ] 16-02: Product sync retry + delta sync endpoints
- [ ] 16-03: Slowdown optimizer + smart sync variants

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → ... → 10 → 11 → 12 → 13 → 14 → 15 → 16

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Verification & Test Infrastructure | v1.0 | 3/3 | Complete | 2026-02-22 |
| 2. Critical Missing Endpoints | v1.0 | 4/4 | Complete | 2026-02-22 |
| 3. Admin & Monitoring Endpoints | v1.0 | 3/3 | Complete | 2026-02-23 |
| 4. Low Priority & Debug Endpoints | v1.0 | 3/3 | Complete | 2026-02-23 |
| 5. Stubs & Partial Completion | v1.0 | 1/1 | Complete | 2026-02-23 |
| 6. Frontend Path Migration | v1.0 | 3/3 | Complete | 2026-02-23 |
| 7. Integration Testing & Parity Validation | v1.0 | 3/3 | Complete | 2026-02-23 |
| 8. Quick Wiring | v1.1 | 2/2 | Complete | 2026-02-23 |
| 9. Device Registration | v1.1 | 1/1 | Complete | 2026-02-23 |
| 10. Price Management | v1.1 | 4/4 | Complete | 2026-02-23 |
| 11. Bootstrap & Entry Point | v1.2 | 2/2 | Complete | 2026-02-23 |
| 12. Subclient System | v1.2 | 2/2 | Complete | 2026-02-23 |
| 13. Fresis History Completion | v1.2 | 2/2 | Complete | 2026-02-23 |
| 14. Price/VAT Excel Import | v1.2 | 2/2 | Complete | 2026-02-23 |
| 15. Admin Session & SSE | v1.2 | 0/2 | Not started | - |
| 16. Sync Enhancements | v1.2 | 0/3 | Not started | - |

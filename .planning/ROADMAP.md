# Roadmap: Archibald — Unified Operation Queue Migration

## Overview

Completare il branch `feat/unified-operation-queue` raggiungendo parità funzionale al 100% con master. Il percorso parte dalla verifica degli elementi già riprogettati, procede con l'implementazione dei 18 endpoint mancanti (per priorità), completa gli stub parziali, aggiorna il frontend per i path cambiati, e chiude con una validazione integrata end-to-end.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Verification & Test Infrastructure** - Verifica dei 42 elementi riprogettati e setup infrastruttura test
- [x] **Phase 2: Critical Missing Endpoints** - 6 endpoint ad alta priorità mancanti
- [x] **Phase 3: Admin & Monitoring Endpoints** - 8 endpoint a media priorità
- [x] **Phase 4: Low Priority & Debug Endpoints** - 6 endpoint a bassa priorità
- [x] **Phase 5: Stubs & Partial Completion** - Completamento degli 11 elementi parziali/stub
- [x] **Phase 6: Frontend Path Migration** - Aggiornamento 8 path API nel frontend
- [ ] **Phase 7: Integration Testing & Parity Validation** - Test E2E e validazione parità 100%

## Phase Details

### Phase 1: Verification & Test Infrastructure
**Goal**: Verificare che i 42 elementi riprogettati mantengano parità funzionale con master. Setup test infrastructure per validazione continua.
**Depends on**: Nothing (first phase)
**Research**: Unlikely (review codice esistente, pattern interni)
**Plans**: TBD

Plans:
- [x] 01-01: Audit dei 42 elementi riprogettati — confronto comportamento master vs branch
- [x] 01-02: Code audit of 49 redesigned elements — behavioral comparison master vs branch
- [x] 01-03: Fix divergenze trovate durante l'audit

### Phase 2: Critical Missing Endpoints
**Goal**: Implementare i 6 endpoint ad alta priorità mancanti che sono critici per il funzionamento in produzione.
**Depends on**: Phase 1
**Research**: Likely (logica originale complessa in master)
**Research topics**: Logica smart-sync clienti in index.ts, flusso interactive customer sessions con Puppeteer, propagazione sync-states a fresis_history, mapping resolve-numbers
**Plans**: TBD

Plans:
- [x] 02-01: POST /api/customers/smart-sync e POST /api/customers/resume-syncs
- [x] 02-02: POST /api/orders/sync-states e GET /api/orders/resolve-numbers
- [x] 02-03: Interactive customer sessions (5 endpoint: start, vat, heartbeat, save, delete)
- [x] 02-04: DELETE /api/sync/:type/clear-db — reset e re-sync completo

### Phase 3: Admin & Monitoring Endpoints
**Goal**: Implementare gli 8 endpoint di admin e monitoring a media priorità.
**Depends on**: Phase 2
**Research**: Unlikely (pattern stabiliti nelle fasi precedenti)
**Plans**: TBD

Plans:
- [x] 03-01: GET /api/sync/quick-check, POST /api/sync/intervals/:type, POST /api/admin/sync/frequency
- [x] 03-02: GET /api/prices/unmatched, POST /api/prices/match, GET /api/prices/sync/stats, GET /api/prices/history/summary
- [x] 03-03: POST /api/sync/reset/:type

### Phase 4: Low Priority & Debug Endpoints
**Goal**: Implementare i 6 endpoint a bassa priorità (metrics, cache, debug).
**Depends on**: Phase 3
**Research**: Likely (Prometheus metrics format, adaptive timeouts logic)
**Research topics**: Formato metriche Prometheus, logica adaptive timeout in master index.ts, struttura health check PDF parser
**Plans**: TBD

Plans:
- [x] 04-01: GET /metrics (Prometheus), GET /api/cache/export
- [x] 04-02: Adaptive timeouts (3 endpoint), GET /api/admin/jobs/retention
- [x] 04-03: POST /api/test/login, 6 health check PDF parser

### Phase 5: Stubs & Partial Completion
**Goal**: Completare gli 11 elementi parziali/stub già presenti nel branch.
**Depends on**: Phase 2 (interactive sessions stub dipende da fase 2)
**Research**: Unlikely (stub già presenti, solo completamento implementazione)
**Plans**: TBD

Plans:
- [x] 05-01: Sync monitoring endpoints (4 endpoints: products sync/metrics, sync-history, last-sync + customers sync/metrics)

### Phase 6: Frontend Path Migration
**Goal**: Aggiornare tutte le chiamate API nel frontend per i path rinominati/unificati.
**Depends on**: Phase 2 (i nuovi endpoint devono esistere prima di aggiornare il frontend)
**Research**: Unlikely (mapping 1:1 dei path, lavoro meccanico)
**Plans**: TBD

Plans:
- [x] 06-01: Aggiornare auth/me → auth/verify, orders/status → operations/:jobId/status, orders/my-orders → operations/user/:userId
- [x] 06-02: Verification sweep — all queue/stats, customers/search, products/search migrations confirmed complete
- [x] 06-03: Verification sweep — all edit/delete-in-archibald → operations/enqueue migrations confirmed complete

### Phase 7: Integration Testing & Parity Validation
**Goal**: Validazione end-to-end completa della parità funzionale al 100% con master.
**Depends on**: Phase 6 (tutte le fasi precedenti completate)
**Research**: Unlikely (test interni su funzionalità già implementate)
**Plans**: TBD

Plans:
- [x] 07-01: Endpoint parity audit (289 tests) + cross-flow integration tests (20 tests)
- [ ] 07-02: Test regressione completo — confronto risposte API branch vs master
- [ ] 07-03: Validazione finale e checklist pre-merge

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Verification & Test Infrastructure | 3/3 | Complete | 2026-02-22 |
| 2. Critical Missing Endpoints | 4/4 | Complete | 2026-02-22 |
| 3. Admin & Monitoring Endpoints | 3/3 | Complete | 2026-02-23 |
| 4. Low Priority & Debug Endpoints | 3/3 | Complete | 2026-02-23 |
| 5. Stubs & Partial Completion | 1/1 | Complete | 2026-02-23 |
| 6. Frontend Path Migration | 3/3 | Complete | 2026-02-23 |
| 7. Integration Testing & Parity Validation | 1/3 | In progress | - |

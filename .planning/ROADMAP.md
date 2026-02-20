# Roadmap: Archibald Stabilization

## Overview

Riportare la PWA Archibald Black Ant a perfetto funzionamento dopo due grandi refactoring (eliminazione IndexedDB + queue unificata BullMQ). Si parte dalla pulizia del codice morto, si fixano i bug dal più critico al meno, si implementano le feature mancanti, e si chiude con una suite di test automatici completa (unit, integration, E2E) eseguibile anche in VPS.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Cleanup & Dead Code Removal** - Rimuovere file orfani, dead code, legacy code e naming inconsistencies
- [ ] **Phase 2: Operation Queue Core Fixes** - Fix preemption, shouldStop, timeout handler, deduplicazione
- [ ] **Phase 3: Browser Pool & Concurrency** - Fix race condition user lock, concurrency per-utente, transaction safety
- [x] **Phase 4: Sync Scheduler & Auto-Sync** - Avviare sync scheduler, intervalli configurabili, fix getActiveAgentIds
- [x] **Phase 5: WebSocket & Real-time Events** - Emettere tutti gli eventi WebSocket, implementare/rimuovere SSE
- [x] **Phase 6: Data Integrity & Hardening** - IVA da DB, hashing SHA-256, validazione input, rate limiting, PDF persist
- [ ] **Phase 7: Missing Feature Implementation** - createCustomerBot, subclients API, getNextFtNumber, exportArca, stub
- [ ] **Phase 8: Unit & Integration Tests** - Test per operation processor, agent lock, sync handlers, WebSocket, DB
- [ ] **Phase 9: E2E Tests & VPS Validation** - Playwright E2E su VPS, integration test backend, multi-device
- [ ] **Phase 10: Final Review & Stabilization** - Smoke test, verifica multi-dispositivo, fix regressioni, sign-off

## Phase Details

### Phase 1: Cleanup & Dead Code Removal
**Goal**: Codebase pulito senza file orfani, dead code o naming inconsistencies — base solida per i fix successivi
**Depends on**: Nothing (first phase)
**Research**: Unlikely (internal file operations)
**Plans**: 3 plans

Plans:
- [x] 01-01: Knip analysis + cancellare file orfani frontend (19 deleted) + commit baseline refactoring
- [x] 01-02: Fix naming sentToMilanoAt→sentToVeronaAt (code+DB), rimuovere legacy localStorage keys, rinominare .test.ts→.spec.ts, pulire dead exports
- [x] 01-03: Pulizia root directory (4 dir clutter, ~25 MD file, log, script debug), fix struttura .planning/, .gitignore

### Phase 2: Operation Queue Core Fixes
**Goal**: Preemption funzionante, sync interrompibili, nessun job duplicato, timeout su handler
**Depends on**: Phase 1
**Research**: Unlikely (fixing existing BullMQ patterns)
**Plans**: 3 plans

Plans:
- [ ] 02-01: Implementare shouldStop() reale nei sync handlers collegato a agentLock.setStopCallback
- [ ] 02-02: Fix race condition preemption (attendere stop effettivo) + aggiungere timeout handler
- [ ] 02-03: Implementare deduplicazione idempotency key nella queue + aggiungere shouldStop() check nei loop sync

### Phase 3: Browser Pool & Concurrency
**Goal**: Nessuna race condition nel browser pool, concurrency per-utente, transazioni distribuite sicure
**Depends on**: Phase 2
**Research**: Unlikely (fixing existing Puppeteer pool logic)
**Plans**: 3 plans

Plans:
- [ ] 03-01: Fix race condition browser pool user lock (lock rilasciato prima del completamento)
- [ ] 03-02: Implementare concurrency per-utente nel worker BullMQ (utenti diversi in parallelo, 1 op/utente)
- [ ] 03-03: Gestire fallimento transazione post-bot con compensating logic (submit-order, delete-order, send-to-verona)

### Phase 4: Sync Scheduler & Auto-Sync
**Goal**: Sync automatici funzionanti con intervalli configurabili da admin
**Depends on**: Phase 2
**Research**: Unlikely (fixing existing sync-scheduler.ts)
**Plans**: 3 plans

Plans:
- [x] 04-01: Sync settings persistence layer (migration 007-sync-settings.sql, repository CRUD, unit test)
- [x] 04-02: Refactor scheduler per-type intervals, async agent registry, bootstrap auto-start con DB intervals, API routes funzionanti
- [x] 04-03: Proteggere customer sync da parser failures (count validation) + warning monitoring API

### Phase 5: WebSocket & Real-time Events
**Goal**: Tutti i dispositivi ricevono aggiornamenti real-time per ogni operazione
**Depends on**: Phase 2, Phase 3
**Research**: Unlikely (extending existing WebSocket server)
**Plans**: 3 plans

Plans:
- [ ] 05-01: Emettere eventi PENDING_CREATED/UPDATED/DELETED/SUBMITTED da pending-orders routes
- [ ] 05-02: Emettere JOB_STARTED, JOB_PROGRESS, ORDER_NUMBERS_RESOLVED da operation-processor
- [ ] 05-03: Decidere SSE vs WebSocket per progress, implementare soluzione scelta, riattivare UnifiedSyncProgress

### Phase 6: Data Integrity & Hardening
**Goal**: Dati corretti (IVA, hash), input validati, rate limiting, PDF persistenti
**Depends on**: Phase 4
**Research**: Unlikely (DB queries, crypto, Express middleware)
**Plans**: 4 plans

Plans:
- [ ] 06-01: Fix IVA data flow (products.service.ts shape mismatch) + remove dead order-calculation code (VAT_RATE, calculateItemTotals, calculateOrderTotals, reverseCalculateGlobalDiscount)
- [ ] 06-02: Standardizzare hashing a SHA-256 (eliminare MD5 da price-sync, order-sync, orders repo) + extract shared computeOrderHash
- [ ] 06-03: Validazione parseInt con isNaN su route params + install express-rate-limit con 3 tier (global, strict, auth)
- [ ] 06-04: PDF filesystem store con TTL cleanup (sostituire in-memory Map) + cleanup scheduler

### Phase 7: Missing Feature Implementation
**Goal**: Tutti gli endpoint stub attivamente usati dal frontend funzionanti
**Depends on**: Phase 3, Phase 5
**Research**: Likely (subclient data model, Arca export format, FT numbering)
**Research topics**: Archibald subclient data structure via bot, Arca export format, FT numbering convention
**Plans**: 3 plans

Plans:
- [ ] 07-01: Passare createCustomerBot a createApp + verificare route interattive clienti funzionanti
- [ ] 07-02: Implementare subclients API (getAll, search, getByCode, importSubclients via bot/PDF)
- [ ] 07-03: Implementare getNextFtNumber (numerazione progressiva PostgreSQL) + exportArca + altri stub usati

### Phase 8: Unit & Integration Tests
**Goal**: Copertura test completa per tutti i fix critici e le feature core
**Depends on**: Phase 1-7
**Research**: Unlikely (Vitest already in use)
**Plans**: 5 plans

Plans:
- [ ] 08-01: Unit test operation processor (preemption, shouldStop, timeout, lock acquire/release)
- [ ] 08-02: Unit test agent lock (acquire, release, setStopCallback, preemptable detection)
- [ ] 08-03: Unit test sync handlers (shouldStop interruption, progress callbacks, error handling)
- [ ] 08-04: Integration test WebSocket events (emit + receive per tutti i 9+ eventi)
- [ ] 08-05: Integration test sync services con PostgreSQL (customer, order, product, price sync con DB reale)

### Phase 9: E2E Tests & VPS Validation
**Goal**: Test end-to-end completi eseguiti contro la PWA deployata in VPS
**Depends on**: Phase 8
**Research**: Likely (Playwright remote testing, multi-device simulation)
**Research topics**: Playwright remote test config, multi-device test patterns, VPS test runner setup
**Plans**: 4 plans

Plans:
- [ ] 09-01: Setup Playwright per test remoti contro VPS (config, auth fixtures, base URL)
- [ ] 09-02: E2E test login flow (login, PIN setup, unlock, target wizard, logout, account switch)
- [ ] 09-03: E2E test order flow (crea ordine, modifica, cancella, invia a Verona, verifica sync)
- [ ] 09-04: E2E test multi-device sync (2 browser contexts, verifica real-time sync pending orders)

### Phase 10: Final Review & Stabilization
**Goal**: PWA verificata e stabile, pronta per uso quotidiano in produzione
**Depends on**: Phase 9
**Research**: Unlikely (internal verification)
**Plans**: 2 plans

Plans:
- [ ] 10-01: Smoke test completo di tutte le funzionalità + fix regressioni trovate
- [ ] 10-02: Deploy finale, verifica multi-dispositivo live, documentazione stato produzione

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

Note: Phase 3 and 4 can start after Phase 2. Phase 5 depends on Phase 2+3. Phase 7 depends on Phase 3+5.

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Cleanup & Dead Code | 3/3 | Complete | 2026-02-20 |
| 2. Operation Queue Core | 3/3 | Complete | 2026-02-20 |
| 3. Browser Pool & Concurrency | 3/3 | Complete | 2026-02-20 |
| 4. Sync Scheduler & Auto-Sync | 3/3 | Complete | 2026-02-20 |
| 5. WebSocket & Real-time | 3/3 | Complete | 2026-02-20 |
| 6. Data Integrity & Hardening | 4/4 | Complete | 2026-02-20 |
| 7. Missing Features | 3/3 | Complete | 2026-02-20 |
| 8. Unit & Integration Tests | 5/5 | Complete | 2026-02-20 |
| 9. E2E Tests & VPS | 1/4 | In progress | - |
| 10. Final Review | 0/2 | Not started | - |

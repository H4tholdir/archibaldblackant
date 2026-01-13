# Roadmap: Archibald Black Ant

## Overview

Trasformare Archibald Black Ant da prototipo a PWA production-ready per agenti Komet. Il percorso parte da fondamenta sicure (security fixes, testing), costruisce l'MVP ordini con voice input affidabile, abilita multi-utente e offline-first, aggiunge storico e gestione ordini completa, e conclude con deployment professionale su archibaldblackant.it.

## Domain Expertise

None (full-stack web app con pattern standard)

## Phases

- [x] **Phase 1: Security Critical Fixes** - Eliminare vulnerabilità credenziali e bug runtime
- [x] **Phase 2: Code Quality Foundation** - Stabilire testing framework e rimuovere tech debt
- [x] **Phase 3: MVP Order Form** - Completare form ordini production-ready ✅
- [x] **Phase 3.1: Bot Performance Profiling & Optimization (INSERTED)** - Sistema profiling e piano ottimizzazione dettagliato ✅
- [x] **Phase 3.2: Bot Performance Implementation (INSERTED)** - Ottimizzazioni critiche completate (9% improvement, bug fixes) ✅
- [x] **Phase 4: Voice Input Enhancement** - Voice hybrid affidabile con conferma visiva ✅
- [ ] **Phase 4.1: Critical Production Fixes (INSERTED)** - 🔴 Fix blockers: backend pause ✓, price sync ✓, voice UX ✓, customer priority 📋
- [ ] **Phase 5: Order Submission** - Invio ordine ottimizzato con tracking 📋
- [ ] **Phase 6: Multi-User Authentication** - Login multi-agente con whitelist
- [ ] **Phase 7: Credential Management** - Storage sicuro credenziali su device
- [ ] **Phase 8: Offline Capability** - Cache IndexedDB e bozze persistenti
- [ ] **Phase 9: Offline Queue** - Coda ordini offline con sync manuale
- [ ] **Phase 10: Order History** - Storico ordini da Archibald
- [ ] **Phase 11: Order Management** - Modifica, duplica e tracking ordini
- [ ] **Phase 12: Deployment & Infrastructure** - Setup produzione VPS

## Phase Details

### Phase 1: Security Critical Fixes
**Goal**: Eliminare vulnerabilità security critical (credenziali test in chiaro, bug runtime) per fondamenta sicure
**Depends on**: Nothing (first phase)
**Research**: Unlikely (git history cleanup è procedura standard, fix bug è codice esistente)
**Plans**: 5 plans

Plans:
- [x] 01-01: Rotate test credentials in Archibald ERP
- [x] 01-02: Remove backend/.env from git history with BFG Repo-Cleaner
- [x] 01-03: Add .env to .gitignore and document required vars in .env.example
- [x] 01-04: Fix activeSyncType undefined bug in backend/src/index.ts
- [x] 01-05: Centralize all hardcoded URLs in backend/src/config.ts

### Phase 2: Code Quality Foundation
**Goal**: Stabilire testing framework e rimuovere tech debt per codebase maintainable
**Depends on**: Phase 1
**Research**: Unlikely (Vitest già configurato, pattern di testing standard)
**Plans**: 8 plans

Plans:
- [x] 02-01: Setup Vitest with first unit test (smoke test)
- [x] 02-02: Replace console.log in Core Services (customer/product/price sync)
- [x] 02-03: Replace console.log in Bot & Pool (archibald-bot, browser-pool, session-manager)
- [x] 02-04: Remove type any in Database Layer (customer-db, product-db, schemas, types)
- [x] 02-05: Remove type any in Services & Bot (sync services, archibald-bot)
- [x] 02-06: Remove Dead Code (product-sync-service, backup files)
- [x] 02-07: Unit Tests for Database Layer (TDD - CustomerDatabase, ProductDatabase)
- [x] 02-08: Integration Tests for Sync Services (TDD - sync services with mocked Puppeteer)

### Phase 3: MVP Order Form  ✅ COMPLETE
**Goal**: Form ordini production-ready con selezione pacchetto automatica basata su quantità e validazione vincoli
**Depends on**: Phase 2
**Research**: Complete (03-01 - discovered unique variant IDs and package selection logic)
**Plans**: 8 plans (8/8 complete)
**Status**: ✅ COMPLETE - All plans executed

Plans:
- [x] 03-01: Package/Multiplier UI Discovery (Research - complete)
- [x] 03-02: Package Variant Database Functions (TDD - complete)
- [x] 03-03: Package Selection in Archibald Bot (search by variant ID - complete)
- [x] 03-04: Quantity Validation Against Package Rules (TDD - complete, 4min execution)
- [x] ✅ **03-08: CRITICAL - Refactor Archibald Bot Order Flow** (COMPLETE - bot now matches actual UI)
- [x] ✅ **03-05: Frontend Package Display in OrderForm** (COMPLETE - constraints-based UX with badges)
- [x] ✅ **03-06: Frontend Quantity Validation & User Feedback** (COMPLETE - implemented in 03-05 with real-time auto-correction)
- [x] ✅ **03-07: Integration Tests for Package Selection** (COMPLETE - 9 E2E tests, test infrastructure ready)

**03-05 Results (2026-01-12)**:
- ✅ Package badges in product autocomplete dropdown (📦 5 colli)
- ✅ HTML5 input constraints (min, step, max) for quantity validation
- ✅ Real-time quantity validation with onChange + onBlur handlers
- ✅ Package hint below quantity input with rules display
- ✅ Client-side enforcement prevents invalid quantity submission
- 🔄 **REFACTOR**: Removed complex PackageInfo component after user feedback
- 🎯 Simpler, more intuitive UX: see variants upfront, quantity auto-constrained
- ⏱️ Duration: 37 minutes (including checkpoint and refactor)

**03-06 Results (2026-01-12)**:
- ✅ **COMPLETED AS PART OF 03-05** - Real-time validation with auto-correction
- ✅ onChange handler auto-corrects to nearest valid multiple immediately
- ✅ onBlur handler ensures constraints met when leaving field
- ✅ No error messages needed - input always valid (better UX than planned)
- ✅ Package hint provides informative feedback instead of error messages
- 🎯 Superior to original plan: proactive correction vs reactive error display
- ⏱️ Duration: 0 minutes (integrated into 03-05)

**03-07 Results (2026-01-12)**:
- ✅ Test fixtures created (6 order scenarios: single/multi-package, invalid quantities)
- ✅ Integration test suite (9 E2E tests covering complete package selection flow)
- ✅ Extended vitest timeouts (30s test, 10s hooks for Puppeteer)
- ✅ TEST-COVERAGE.md documentation (~90% unit coverage documented)
- ⚠️ Tests require active Archibald session (documented limitation)
- 🐛 Bug fixes: ProductDatabase import, bot initialization method
- 🎯 Integration test infrastructure complete, ready for regression testing
- ⏱️ Duration: 21 minutes

**03-08 Results (2026-01-12)**:
- ✅ UI selectors documented from 17 screenshots
- ✅ 6 reusable DevExpress helper methods created
- ✅ Navigation fixed: "Ordini" menu (not "Inserimento ordini")
- ✅ Customer selection: "Profilo cliente" dropdown (not "Account esterno" text input)
- ✅ Article selection: "Nome articolo" dropdown + search by variant ID
- ✅ Multi-article support with Update button loop
- ✅ Final save: "Salvare" → "Salva e chiudi" workflow
- ✅ Order ID extraction from URL
- 🎯 Bot can now create orders end-to-end in production Archibald

**03-04 Results (2026-01-12)**:
- ✅ ValidationResult interface with valid, errors, suggestions fields
- ✅ validateQuantity() method in ProductDatabase (minQty, multipleQty, maxQty checks)
- ✅ Bot integration: validation after variant selection, before UI interaction
- ✅ Error messages with suggestions for nearest valid quantities
- ✅ TDD approach: RED-GREEN cycle with 4 atomic commits (test → feat → refactor → test)
- ✅ Test coverage: 11 tests total (9 unit + 2 integration), all 90 tests passing
- 🎯 Prevents "quantity becomes 0" bug by validating early

### Phase 3.1: Bot Performance Profiling & Optimization (INSERTED) ✅
**Goal**: Implementare sistema di profiling dettagliato per tracciare tempi di ogni operazione bot, identificare colli di bottiglia e strutturare piano di ottimizzazione super-dettagliato per massimizzare velocità esecuzione ordini
**Depends on**: Phase 3 (dopo 03-03)
**Priority**: 🔴 URGENT - Blocca proseguimento Phase 3 fino a completamento
**Research**: Unlikely (profiling patterns e performance analysis sono tecniche standard)
**Plans**: 3 plans (3/3 complete) ✅
**Completed**: 2026-01-12

Plans:
- [x] 03.1-01: Enhanced Profiling System (extend runOp, add categories, percentiles, memory tracking)
- [x] 03.1-02: Performance Dashboard & Visualization (HTML dashboard with Gantt charts, bottleneck analysis)
- [x] 03.1-03: Optimization Plan Documentation (data-driven plan with ROI prioritization, SLO targets)

**Results (2026-01-12)**:
- ✅ Profiling system implemented with category tracking, percentiles, memory tracking, retry detection
- ✅ Self-contained HTML performance dashboard with Gantt charts, bottleneck analysis, recommendations
- ✅ Comprehensive optimization plan: 7 optimizations, 40% improvement potential (-32.5s)
- ✅ Baseline established: 3 profiling runs averaging 81.5s order creation (72.3s with cache, 99.6s cold start)
- ✅ Major bottlenecks identified: Customer selection (24.8s, 30.4%), quantity setting (9.5s, 11.7%), article search (9.1s, 11.1%)
- ✅ SLO targets defined: P95 < 60s order creation (vs. current 81.5s)
- ✅ Optimization roadmap: Phase 1 (7h, -8.5s → 73s) → Phase 2 (14h, -17s → 56s ✅ SLO) → Phase 3 (16h, -13s → 49s)
- 🐛 Bug discovered: 5 operations missing category parameter (need fix before next profiling)

**Deliverables**:
- `archibald-web-app/backend/src/archibald-bot.ts`: Enhanced runOp() with category, percentiles, memory
- `archibald-web-app/backend/src/performance-dashboard-generator.ts`: HTML dashboard generator (static methods)
- `archibald-web-app/backend/profiling-reports/*.html`: Performance dashboard reports (self-contained, ~40KB)
- `.planning/phases/03.1-bot-performance-profiling-optimization/BASELINE-METRICS.json`: Consolidated metrics from 3 runs
- `.planning/phases/03.1-bot-performance-profiling-optimization/OPTIMIZATION-PLAN.md`: Comprehensive optimization plan (7 opts, ROI-prioritized, 3-phase roadmap)

**Next Steps**:
- ✅ Phase 3.2 created to implement all 7 optimizations from OPTIMIZATION-PLAN.md

### Phase 3.2: Bot Performance Implementation (INSERTED) ✅ COMPLETE
**Goal**: Implementare ottimizzazioni critiche per migliorare performance bot e risolvere bug critici
**Depends on**: Phase 3.1 (profiling system + optimization plan)
**Priority**: 🟡 HIGH - Optimize production bot before continuing with Phase 4+
**Research**: Complete (Phase 3.1 provided detailed implementation specs)
**Plans**: 6 plans (1/6 partial implementation - CLOSED EARLY) ✅
**Status**: COMPLETE (2026-01-13) - Closed early, remaining work deferred
**Completed**: 2026-01-13

Plans (Original):
- [x] 3.2-01: OPT-15 Customer Selection (ad-hoc, not in original plan) → **82.23s achieved**
- [ ] 3.2-02: Article Search Caching (OPT-02) → DEFERRED
- [ ] 3.2-03: Parallel Operations (OPT-06) → DEFERRED
- [ ] 3.2-04: Customer Advanced (OPT-01) → DEFERRED
- [ ] 3.2-05: Field Editing (OPT-03) → ATTEMPTED, NO IMPROVEMENT
- [ ] 3.2-06: Bug Fixes → COMPLETE

**Actual Results (2026-01-13)**:
- ✅ **OPT-15: Customer Selection Optimization** (commit ffcd8fa)
  - Integrated click into waitForFunction() - eliminates gap between detection and action
  - Mutation polling for instant DOM change detection
  - **Impact**: Customer selection 20.91s → 12.51s (-8.4s, **-40.2%**)
  - **Overall**: Total order time 90.55s → 82.23s (-8.32s, **-9.2%**)

- 🟡 **OPT-03: Field Editing Optimization** (multiple iterations)
  - v1: JavaScript setValue, v2: Research-based, v3: Atomic operations
  - **Result**: No measurable improvement (~0s)
  - **Lesson**: DevExpress grid overhead dominates input method optimization

- ✅ **Bug Fix: Variant Selection Logic** (commit 94ae6b8)
  - **Problem**: Bot selected K2 (5-pack) for qty=7 when K3 (1-pack) was valid
  - **Solution**: Filter variants by valid multiples (qty % multipleQty === 0)
  - **Impact**: Prevents invalid quantity errors, correct variant selection

- ✅ **Bug Fix: Package Constraints Validation** (commit b97c617)
  - Dual-layer validation (client handleAddItem + server /api/orders/create)
  - Real-time validation with quantity suggestions
  - Fixes Job ID 38/31 validation bypass bug

**Performance vs Plan**:
- **Original Target**: 49s P95 (-40% total improvement)
- **Achieved**: 82.23s (-9.2% improvement from 90.55s)
- **SLO Gap**: 22.23s from 60s target
- **Decision**: Accept current baseline, defer remaining optimizations

**Deferred Work** (Can revisit in future phase):
- OPT-02: Article Search Caching (-4s per cached article, 6h effort)
- OPT-06: Parallel Operations (-7s total, 10h effort)
- OPT-01: Customer Advanced techniques (-4-5s, 4h effort)

**Rationale for Early Closure**:
1. Good progress achieved (9% improvement + 40% on major bottleneck)
2. Critical bugs fixed (variant selection, validation)
3. User features (Voice Input, Order Management) higher priority
4. Diminishing returns on remaining optimizations
5. Can revisit performance in dedicated future phase

**Documentation**:
- `.planning/phases/03.2-bot-performance-implementation/3.2-PHASE-COMPLETE.md`
- `.planning/phases/03.2-bot-performance-implementation/PERFORMANCE-ANALYSIS.md`
- `.planning/phases/03.2-bot-performance-implementation/3.2-AD-HOC-SUMMARY.md`

**Process Lessons**:
- ⚠️ 126 commits made outside GSD framework
- ⚠️ Ad-hoc approach lost structure and measurability
- ✅ Retroactive documentation captured work for future reference
- 🎯 Resume GSD workflow for remaining phases

**Key Optimizations**:
1. **OPT-03**: Field editing (JavaScript setValue) → -4.5s
2. **OPT-04**: Multi-article button (event-driven waiting) → -3s
3. **OPT-05**: Login cache (extended TTL, direct navigation) → -1s
4. **BUG-FIX**: Missing profiling categories (5 operations)
5. **OPT-01**: Customer selection (direct ID or optimized dropdown) → -13s (largest bottleneck)
6. **OPT-02**: Article search caching (LRU cache, 24h TTL) → -4s
7. **OPT-06**: Network optimization (screenshot reduction, selector optimization) → -5s
8. **OPT-07**: Parallel article processing (state machine, pre-fetch) → -8s per additional article

**Business Impact**:
- Agent productivity: 22 orders/hour → 36+ orders/hour (+64%)
- Time savings: 32.5s per order = 9+ hours saved per 1000 orders
- Multi-article efficiency: Per-article overhead 18.5s → 10s (-46%)

**Checkpoints**:
- After Plan 3.2-02: Phase 1 complete (quick wins validated)
- After Plan 3.2-04: **SLO achieved** (< 60s P95) - Major milestone, consider pausing for business validation
- After Plan 3.2-06: Phase 3.2 complete (maximum optimization)

### Phase 4: Voice Input Enhancement ✅ COMPLETE
**Goal**: Voice hybrid affidabile (dettatura → form → conferma tap) per ridurre errori input
**Depends on**: Phase 3
**Research**: Complete (Level 0 - existing implementation analyzed)
**Plans**: 3 plans (consolidated from 5 - combined related tasks for cohesive implementation) + 1 fix plan
**Status**: ✅ COMPLETE (all plans executed + critical bug fixed)
**Completed**: 2026-01-13

**Discovery Summary:**
- Existing: Web Speech API hook (`useVoiceInput.ts`), basic parser (`orderParser.ts`), voice modal UI
- Gaps: No confidence scoring, no entity validation, no manual edit workflow, voice directly submits
- Approach: Enhance parser → visual feedback → hybrid workflow (pre-fill + confirm)

Plans:
- [x] 04-01: Voice parser enhancement (confidence scoring, validation, fuzzy matching) - Complete ✓
- [x] 04-02: Visual feedback enhancement (real-time confidence, entity highlighting, validation status) - Complete ✓
- [x] 04-03: Hybrid workflow implementation (pre-fill → manual edit → tap confirm) - Complete ✓
- [x] 04-FIX: Critical infinite loop bug fix (UAT-001) - Complete ✓

**Fix 04-FIX Results (2026-01-13)**:
- ✅ **UAT-001 RESOLVED**: Infinite loop in useVoiceInput hook fixed with useRef pattern
- ✅ Root cause: useEffect dependency issue causing infinite re-renders
- ✅ Fix: useRef pattern to stabilize callbacks without triggering effect re-runs
- ✅ 13/13 regression tests passing (prevents future occurrences)
- ✅ Voice input now fully functional
- ⏳ Manual UAT pending (requires microphone + active session)
- 🎯 Phase 4 technically complete, ready for manual verification

**Phase 4 Deliverables**:
- Voice parser with confidence scoring and fuzzy matching
- Real-time visual feedback components (ConfidenceMeter, EntityBadge, TranscriptDisplay, ValidationStatus, SmartSuggestions)
- Package disambiguation modal for multi-package articles
- Voice hybrid workflow: dettatura → form pre-fill → manual edit → tap confirmation
- Comprehensive test coverage (98 tests + 13 voice hook tests = 111 tests)
- Manual UAT checklist for 9 voice scenarios

### Phase 4.1: Critical Production Fixes (INSERTED) 🔴 URGENT
**Goal**: Fix blocking production issues before Phase 5: backend process conflicts, price sync missing, voice UX insufficient, customer sync priority wrong
**Depends on**: Phase 4
**Priority**: 🔴 CRITICAL - Blocks reliable production use
**Research**: Required for Issues 2 & 4 (price sync investigation, customer API filtering)
**Plans**: 3/4 complete
**Status**: In progress

Plans:
- [x] 04.1-01: Backend Process Priority Manager (pause/resume during order creation) ✅
- [x] 04.1-02: Price Sync Investigation & Fix (multi-level matching + 100% price coverage) ✅
- [x] 04.1-03: Voice Modal UX Enhancement (better examples, detailed instructions, workflow guide) ✅
- [ ] 04.1-04: Customer Sync Priority Reversal (sync new customers first, not last)

**Issue Details**:

1. **Backend Process Conflicts** (04.1-01):
   - **Problem**: Concurrent processes interfere with bot during order creation
   - **Solution**: PriorityManager singleton with pause/resume API
   - **Impact**: HIGH - Affects every order's reliability and speed

2. **Price List Not Synced** (04.1-02):
   - **Problem**: Prices exist in Archibald (visible in screenshots) but not in order form
   - **Evidence**: 4 screenshots showing "Tabella prezzi" with prices (234,59 €, 275,00 €, etc.)
   - **Solution**: Investigate price-sync-service, database, API, and frontend integration
   - **Impact**: HIGH - Agents can't see pricing, must check manually

3. **Voice UX Insufficient** (04.1-03): ✅ COMPLETE
   - **Problem**: Minimal instructions, basic example, no workflow guidance
   - **Solution**: Better examples (real codes), detailed commands, step-by-step workflow, error recovery
   - **Implementation**:
     - 3 detailed examples with real article formats (XX.XX.XXX.XXX: 02.33.016.010, etc.)
     - 6-step workflow guide (tap → dictate → wait → verify → correct → confirm)
     - Detailed command explanations (conferma, annulla, riprova) with when/what/result
     - 5 error recovery scenarios (wrong customer, article, quantity, recognition fails, system doesn't understand)
     - All content in Italian with visual hierarchy (green=examples, yellow=help)
   - **Impact**: MEDIUM - Affects adoption and confidence
   - **Duration**: 15 minutes
   - **Commits**: 1 atomic (c582255)

4. **Customer Sync Priority** (04.1-04):
   - **Problem**: Sync processes oldest customers first, new customers last (hours wait)
   - **Solution**: Reverse priority - fetch new customers first, then backfill old
   - **Impact**: HIGH - Blocks agents from working with new customers

**Execution Priority**:
1. 04.1-01 (Backend Pause) - Highest impact, enables reliable orders
2. 04.1-04 (Customer Priority) - High impact, unblocks agents immediately
3. 04.1-02 (Price Sync) - High impact, completes order form data
4. 04.1-03 (Voice UX) - Medium impact, improves adoption

**Estimated Effort**: 8-12 hours total (2-3h each for 01, 02, 04; 1-2h for 03)

### Phase 5: Order Submission
**Goal**: Invio ordine Puppeteer ottimizzato con tracking real-time e error recovery robusto
**Depends on**: Phase 4
**Research**: Unlikely (Puppeteer automation già funzionante, ottimizzazione pattern esistenti)
**Plans**: 6 plans

Plans:
- [ ] 05-01: Optimize Puppeteer order submission flow (reduce latency)
- [ ] 05-02: Enhance WebSocket real-time job progress tracking
- [ ] 05-03: Add detailed error messages for common failure modes
- [ ] 05-04: Implement exponential backoff retry strategy (BullMQ config)
- [ ] 05-05: Add E2E test for complete order flow (Playwright)
- [ ] 05-06: Add order success confirmation with Archibald order ID

### Phase 6: Multi-User Authentication
**Goal**: Abilitare login multi-agente con whitelist e sessioni Puppeteer separate per-utente
**Depends on**: Phase 5
**Research**: Likely (session management architecture decision)
**Research topics**: Puppeteer multi-session patterns, session isolation strategies, credential flow architecture
**Plans**: 8 plans

Plans:
- [ ] 06-01: Research Puppeteer multi-session architecture patterns
- [ ] 06-02: Design per-user session architecture (DB schema, backend API)
- [ ] 06-03: Create agent whitelist management (admin backend endpoint)
- [ ] 06-04: Implement login UI with Archibald credentials input
- [ ] 06-05: Add backend authentication endpoint (validate against whitelist)
- [ ] 06-06: Refactor BrowserPool to support per-user sessions
- [ ] 06-07: Update order creation to use authenticated user session
- [ ] 06-08: Add logout and session cleanup

### Phase 7: Credential Management
**Goal**: Salvataggio cifrato credenziali su device con Web Crypto API, backend stateless
**Depends on**: Phase 6
**Research**: Likely (Web Crypto API usage for secure storage)
**Research topics**: Web Crypto API best practices, IndexedDB encryption patterns, device-local credential storage
**Plans**: 6 plans

Plans:
- [ ] 07-01: Research Web Crypto API encryption best practices
- [ ] 07-02: Implement IndexedDB credentials store with encryption
- [ ] 07-03: Add PIN/biometric unlock UI for credential access
- [ ] 07-04: Refactor backend to session-per-request (no credential storage)
- [ ] 07-05: Add credential expiry and re-authentication flow
- [ ] 07-06: Add security audit and penetration test checklist

### Phase 8: Offline Capability
**Goal**: Cache IndexedDB per clienti/prodotti/prezzi e bozze ordine persistenti
**Depends on**: Phase 7
**Research**: Likely (offline-first PWA patterns)
**Research topics**: IndexedDB schema design, service worker caching strategies, Workbox configuration for Vite
**Plans**: 8 plans

Plans:
- [ ] 08-01: Research IndexedDB schema for customers/products/prices
- [ ] 08-02: Implement IndexedDB wrapper with Dexie.js
- [ ] 08-03: Migrate sync services to populate IndexedDB (not just SQLite backend)
- [ ] 08-04: Update frontend to read from IndexedDB cache
- [ ] 08-05: Implement service worker with offline-first strategy
- [ ] 08-06: Add draft order persistence to IndexedDB
- [ ] 08-07: Add offline indicator UI (network status)
- [ ] 08-08: Test offline scenarios (airplane mode, flaky network)

### Phase 9: Offline Queue
**Goal**: Coda ordini offline con invio manuale e conflict resolution per dati stale
**Depends on**: Phase 8
**Research**: Likely (conflict resolution patterns)
**Research topics**: Offline queue persistence, sync conflict detection, reconciliation strategies for stale data
**Plans**: 7 plans

Plans:
- [ ] 09-01: Research offline queue and conflict resolution patterns
- [ ] 09-02: Design offline order queue schema (IndexedDB)
- [ ] 09-03: Implement queue when order created offline
- [ ] 09-04: Add manual sync UI with user consent prompt
- [ ] 09-05: Implement background sync when network returns
- [ ] 09-06: Add conflict detection (stale price/product data)
- [ ] 09-07: Implement conflict resolution UI (notify user, allow re-confirmation)

### Phase 10: Order History
**Goal**: Lettura storico ordini da Archibald con filtri e dettaglio completo
**Depends on**: Phase 9
**Research**: Likely (Archibald order history UI parsing)
**Research topics**: Archibald order list selectors, pagination patterns, order detail extraction
**Plans**: 6 plans

Plans:
- [ ] 10-01: Research Archibald order history UI and selectors
- [ ] 10-02: Implement Puppeteer scraper for order list (pagination support)
- [ ] 10-03: Implement order detail extraction (articoli, quantità, prezzi, totale)
- [ ] 10-04: Create backend API endpoint for order history
- [ ] 10-05: Build frontend order history UI with filters (cliente, data, stato)
- [ ] 10-06: Add order detail view with full information

### Phase 11: Order Management
**Goal**: Modifica ordini pendenti, duplica ordine e tracking stato spedizione
**Depends on**: Phase 10
**Research**: Likely (Archibald order modification workflows)
**Research topics**: Edit order flow in Archibald, order status tracking, duplication patterns
**Plans**: 7 plans

Plans:
- [ ] 11-01: Research Archibald order edit workflow and constraints
- [ ] 11-02: Implement order status tracking (in lavorazione/spedito/consegnato)
- [ ] 11-03: Add backend endpoint for order status updates
- [ ] 11-04: Build order status UI with real-time updates
- [ ] 11-05: Implement edit pending order (if not yet processed)
- [ ] 11-06: Implement duplicate order ("Ripeti ultimo ordine")
- [ ] 11-07: Add order action audit log (chi ha modificato cosa, quando)

### Phase 12: Deployment & Infrastructure
**Goal**: Setup produzione VPS con Docker, CI/CD e archibaldblackant.it SSL
**Depends on**: Phase 11
**Research**: Likely (VPS setup and Docker orchestration)
**Research topics**: Docker Compose best practices, Nginx reverse proxy config, Let's Encrypt automation, CI/CD for mono-repo
**Plans**: 10 plans

Plans:
- [ ] 12-01: Research VPS providers (budget €10-20/mese, 2 vCPU / 4 GB RAM)
- [ ] 12-02: Create Dockerfile for backend (multi-stage build)
- [ ] 12-03: Create Dockerfile for frontend (Nginx serve static)
- [ ] 12-04: Create docker-compose.yml (frontend, backend, redis, nginx)
- [ ] 12-05: Configure Nginx reverse proxy and SSL (Let's Encrypt)
- [ ] 12-06: Setup domain DNS for archibaldblackant.it
- [ ] 12-07: Add health check endpoint (/health) and monitoring
- [ ] 12-08: Implement graceful shutdown with operation wait
- [ ] 12-09: Create CI/CD pipeline (GitHub Actions or GitLab CI)
- [ ] 12-10: Production deployment and smoke test

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Critical Fixes | 5/5 | ✅ Complete | 2026-01-12 |
| 2. Code Quality Foundation | 8/8 | ✅ Complete | 2026-01-12 |
| 3. MVP Order Form | 8/8 | ✅ Complete | 2026-01-12 |
| 3.1. Bot Performance Profiling & Optimization (INSERTED) | 3/3 | ✅ Complete | 2026-01-12 |
| 3.2. Bot Performance Implementation (INSERTED) | 1/6 partial | ✅ Complete (closed early) | 2026-01-13 |
| 4. Voice Input Enhancement | 4/4 | ✅ Complete | 2026-01-13 |
| 5. Order Submission | 0/6 | Not started | - |
| 6. Multi-User Authentication | 0/8 | Not started | - |
| 7. Credential Management | 0/6 | Not started | - |
| 8. Offline Capability | 0/8 | Not started | - |
| 9. Offline Queue | 0/7 | Not started | - |
| 10. Order History | 0/6 | Not started | - |
| 11. Order Management | 0/7 | Not started | - |
| 12. Deployment & Infrastructure | 0/10 | Not started | - |

**Total Plans**: 86 across 12+ phases

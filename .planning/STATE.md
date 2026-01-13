# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-11)

**Core value:** Rendere la creazione ordini Archibald **veloce, affidabile e mobile-friendly** per agenti in movimento
**Current focus:** Phase 4.1 — Critical Production Fixes 🔴

## Current Position

Phase: 4.1 of 12 (Critical Production Fixes - INSERTED URGENT)
Plan: Not started (4 plans: backend pause, price sync, voice UX, customer priority)
Status: PLANNING - 4 critical blockers identified
Last activity: 2026-01-13 — Phase 4.1 inserted, context documented

Progress: ████████░░ 31% (28/36 plans complete - Phase 4 complete, Phase 4.1 starting)

## Performance Metrics

**Velocity:**
- Total plans completed: 28
- Average duration: 73 min (1h 13m)
- Total execution time: 33.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 5 | 965 min | 193 min |
| 2 | 8 | 101 min | 13 min |
| 3 | 8 | 346 min | 43 min |
| 3.1 | 3 | 350 min | 117 min |
| 4 | 3 | 285 min | 95 min |

**Recent Trend:**
- Last 5 plans: 03-06 (0m - integrated), 03-07 (21m), 04-01 (45m), 04-02 (120m), 04-03 (120m)
- Trend: Phase 4 complete - averaged 95m per plan

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Phase | Decision | Rationale |
|-------|----------|-----------|
| 4.02 | Real-time parsing in useEffect watching transcript | Immediate feedback as user speaks - don't wait for final result |
| 4.02 | Package disambiguation modal instead of inline selection | Complex choice with multiple options - modal provides focus and clear decision space |
| 4.02 | Mark optimal solution with green "Raccomandato" badge | Guide users to best choice (fewest packages) while allowing alternatives |
| 4.02 | ARIA live="polite" instead of "assertive" | Voice input shouldn't interrupt current screen reader context |
| 4.02 | Entity highlighting with badges instead of background color | More prominent, works better on mobile, clearer entity boundaries |
| 4.02 | 3-tier confidence visualization (low < 40%, medium 40-70%, high > 70%) | Aligns with voice recognition accuracy thresholds |
| 3.05 | Show package size as badge in autocomplete dropdown | Users need to see package differences BEFORE selecting - upfront visibility beats auto-selection |
| 3.05 | Use HTML5 input constraints (min, step, max) | Native browser validation more reliable and accessible than custom validation |
| 3.05 | Real-time validation with onChange + onBlur | Auto-correct to nearest valid multiple on typing - prevents invalid submission |
| 3.05 | REFACTOR: Remove PackageInfo component after user feedback | User testing showed complex variant selection confusing - simpler UX with badges + constraints better |
| 3.04 | Validate quantity immediately after variant selection | Catch invalid quantities early before UI interaction - faster feedback, prevents wasted bot operations |
| 3.04 | Include suggestions in ValidationResult | Better UX - tell user nearest valid quantities, don't just say "invalid" |
| 3.04 | Use Pick<Product> for validation parameter type | Validation only needs minQty, multipleQty, maxQty - more flexible, easier testing, clearer intent |
| 3.1 | Self-contained HTML dashboard with inline CSS/JS | No external dependencies, easy distribution, ~40KB typical size |
| 3.1 | SVG for charts instead of Canvas | Crisp rendering at any zoom, easier event handling, DOM manipulation |
| 3.1 | Static methods in PerformanceDashboardGenerator | No state needed, pure functions, easier testing |
| 3.1 | Dynamic import in ArchibaldBot.generatePerformanceDashboard() | Avoid circular dependencies between bot and dashboard generator |
| 3.08 | Search Archibald by variant ID instead of article name | Variant ID is unique, article name matches multiple variants causing selection errors |
| 3.08 | Create reusable DevExpress helper methods | DevExpress patterns repeat across dropdowns, tables, cell editing - reduce duplication ~40% |
| 3.08 | Preserve old createOrder() as createOrderOLD_BACKUP | Major refactor with regression risk - keep old code for emergency rollback or reference |
| 3.08 | Use text content for element identification | DevExpress dynamic IDs change between sessions - text is more stable |
| 3 | Populate articleId and packageContent in OrderItem | Enable order tracking, debugging, and verification of correct variant selection |
| 3 | Manual verification script instead of brittle integration tests | Full bot tests fragile (UI changes), slow (2+ min), complex setup; manual script provides instant verification |
| 3 | Ordered variants by multipleQty DESC in getProductVariants() | Highest package always first for consistent selection |

### Deferred Issues

None yet.

### Blockers/Concerns

None yet.

### Roadmap Evolution

- **2026-01-12 (Early)**: Plan 03-08 (Critical Bot Refactor) executed
  - **Priority**: CRITICAL - BLOCKED ALL PHASE 3 WORK
  - **Reason**: Bot used wrong menu names ("Inserimento ordini"), wrong dropdowns ("Account esterno"), wrong workflow - could not create orders
  - **Duration**: 4 hours actual
  - **Deliverables**:
    - UI selectors documented from 17 screenshots (.planning/archibald-ui-selectors.md)
    - 6 reusable DevExpress helper methods created
    - Complete createOrder() refactored: "Ordini" menu → "Profilo cliente" dropdown → "Nome articolo" dropdown → variant selection
    - Multi-article support with Update button loop
    - "Salvare" → "Salva e chiudi" final save workflow
  - **Impact**: Bot now matches actual Archibald UI - can create orders end-to-end
  - **Note**: Documentation (SUMMARY.md) added retroactively after Phase 3.1 completion

- **2026-01-12 (Mid)**: Phase 3.1 (Bot Performance Profiling & Optimization) inserted after Plan 03-08 as URGENT priority
  - **Reason**: Critico profilare flusso bot completo prima di continuare con validazioni e frontend Phase 3
  - **Impact**: Paused Phase 3 main flow (plans 03-04 to 03-07) to complete profiling
  - **Rationale**: Ottimizzazione basata su dati reali (non supposizioni) è fondamentale per velocità produzione
  - **Current baseline**: ~82s order creation (con cache), colli di bottiglia identificati in customer selection (24.8s) e article search (9.1s)

- **2026-01-12 (Late)**: Phase 3.1 execution completed
  - **Plans executed**: 3 plans (03.1-01: Enhanced Profiling, 03.1-02: Dashboard & Visualization, 03.1-03: Optimization Plan Documentation)
  - **Actual duration**: 5.8 hours total (80m + 150m + 120m)
  - **Deliverables**:
    - Enhanced profiling system with category tracking, percentiles, memory tracking
    - Self-contained HTML performance dashboard with Gantt charts and bottleneck analysis
    - Comprehensive optimization plan with 7 optimizations, 40% improvement potential (-32.5s)
  - **Baseline established**: 3 profiling runs averaging 81.5s order creation (72.3s with cache)
  - **Bottlenecks quantified**: Customer selection (24.8s, 30.4%), quantity setting (9.5s, 11.7%), article search (9.1s, 11.1%)
  - **Bug discovered**: 5 operations missing category parameter (lines 2290, 2362, 2380, 2591, 2640 in archibald-bot.ts)
  - **SLO targets defined**: P95 < 60s order creation (vs. current 81.5s)
  - **Optimization roadmap**: Phase 1 (7h, -8.5s) → Phase 2 (14h, -17s, achieves SLO) → Phase 3 (16h, -13s)
  - **Next steps**: Resume Phase 3 main flow (plans 03-04 through 03-07), execute optimization roadmap in future phase

- **2026-01-12 (Evening)**: Plan 03-04 (Quantity Validation Against Package Rules) executed
  - **Duration**: 4 minutes (extremely fast TDD plan)
  - **Approach**: TDD with RED-GREEN cycle, atomic commits per phase (test → feat → refactor → test)
  - **Deliverables**:
    - ValidationResult interface with valid, errors, suggestions fields
    - validateQuantity() method in ProductDatabase (checks minQty, multipleQty, maxQty)
    - Bot integration: validation after variant selection, before UI interaction
    - Comprehensive test coverage: 9 unit tests + 2 integration tests (11 total)
  - **Impact**: Prevents "quantity becomes 0" bug by validating early, provides suggestions for nearest valid quantities
  - **Test results**: All 90 tests passing (49 product-db, 2 archibald-bot, 39 other) - no regressions
  - **Next steps**: Plans 03-05 (Frontend Package Display), 03-06 (Frontend Quantity Validation), 03-07 (Integration Tests)

- **2026-01-12 (Night)**: Plan 03-05 (Frontend Package Display in OrderForm) executed
  - **Duration**: 37 minutes (including checkpoint and refactor)
  - **Approach**: Segmented execution (Strategy B) with human verification checkpoint
  - **Initial Deliverables**:
    - GET /api/products/variants endpoint
    - products.ts API client with getProductVariants()
    - PackageInfo component with variant list
    - Integration in OrderForm with auto-selection
    - Comprehensive CSS styling
  - **User Feedback at Checkpoint**: "Too complex - can't see differences when searching" + "Why both variants show as selected?"
  - **REFACTOR (Breaking Change)**:
    - Removed complex PackageInfo component (~200 lines)
    - Added package badges in autocomplete dropdown (📦 5 colli)
    - HTML5 input constraints (min, step, max) for quantity
    - Real-time validation with onChange + onBlur handlers
    - Package hint below input showing rules
  - **Impact**: Much simpler, more intuitive UX - see variants upfront, quantity auto-constrained
  - **Commits**: 6 total (4 implementation + 1 bug fix + 1 refactor)
  - **Next steps**: Plans 03-06 (Frontend Quantity Validation), 03-07 (Integration Tests)

- **2026-01-12 (Night, continued)**: Plan 03-06 (Frontend Quantity Validation) marked complete
  - **Duration**: 0 minutes (already implemented in 03-05)
  - **Rationale**: Real-time auto-correction implemented in 03-05 is superior to planned error-message approach
  - **Implementation**: onChange handler auto-corrects quantities, onBlur provides safety net
  - **Impact**: Proactive validation (auto-correct) vs reactive validation (show errors) - better UX
  - **Decision**: Skip redundant implementation, mark as complete, update roadmap
  - **Next steps**: Plan 03-07 (Integration Tests) - final Phase 3 plan

- **2026-01-12 (Night, continued)**: Plan 03-07 (Integration Tests) executed and complete
  - **Duration**: 21 minutes
  - **Deliverables**:
    - Test fixtures for 6 order scenarios (single/multi-package, invalid quantities)
    - Integration test suite with 9 E2E tests
    - Extended vitest config timeouts (30s test, 10s hooks)
    - TEST-COVERAGE.md documentation (~90% unit coverage documented)
  - **Bug Fixes**: ProductDatabase import, bot initialization method
  - **Test Results**: All 9 tests require active Archibald session (documented limitation)
  - **Impact**: Integration test infrastructure complete, ready for regression testing
  - **Commits**: 5 total (3 implementation + 2 bug fixes)
  - **Phase Status**: Phase 3 MVP Order Form now COMPLETE (8/8 plans)

- **2026-01-13 (Early Morning)**: Phase 3.2 (Bot Performance Implementation) - Ad-hoc optimization work
  - **Context**: 126 commits made outside GSD framework
  - **Duration**: ~4 hours (00:00 - 04:00)
  - **Approach**: Iterative A/B testing with multiple optimization attempts
  - **Major Achievement - OPT-15: Customer Selection Optimization**:
    - Integrated click directly into waitForFunction() - eliminates gap between detection and action
    - Used mutation polling for instant DOM change detection
    - **Impact**: Customer selection 20.91s → 12.51s (-8.4s, -40.2%)
    - **Overall**: Total order time 90.55s → 82.23s (-8.32s, -9.2%)
    - **Commit**: ffcd8fa
  - **Attempted - OPT-03: Field Editing Optimization**:
    - Multiple iterations (v1: JavaScript setValue, v2: research-based, v3: atomic operations)
    - **Result**: No measurable improvement (~0s)
    - **Lesson**: DevExpress grid overhead dominates input method optimization
    - **Decision**: De-prioritize, focus on other high-ROI optimizations
  - **Critical Bug Fix**: Variant Selection Logic (commit 94ae6b8)
    - **Problem**: Bot selected K2 (5-pack) for qty=7 when K3 (1-pack) was valid
    - **Solution**: Filter variants by valid multiples (qty % multipleQty === 0), prefer largest
    - **Impact**: Quantity 7 now correctly selects K3, prevents invalid quantity errors
  - **Critical Bug Fix**: Package Constraints Validation (commit b97c617)
    - Dual-layer validation (client + server) prevents invalid order submission
    - Frontend: Real-time validation in handleAddItem() with suggestions
    - Backend: Server-side validation before bot execution with detailed errors
    - Fixes Job ID 38/31 validation bypass bug
  - **Status**: Phase 3.2 COMPLETE (partial implementation, 1 of 6 plans)
  - **Performance vs Plan**:
    - Phase 1 target: 71s (-10.5s), Actual: 82.23s (-8.3s) → 2.2s short of target
    - SLO target: < 60s, Current: 82.23s → 22.23s improvement deferred
  - **Decision**: Close Phase 3.2 early, defer remaining optimizations (OPT-02, OPT-06, OPT-01)
  - **Rationale**: Good progress achieved (9%), user features higher priority, can revisit later
  - **Documentation**: Complete phase summary (3.2-PHASE-COMPLETE.md, PERFORMANCE-ANALYSIS.md, 3.2-AD-HOC-SUMMARY.md)
  - **Next**: Phase 4 - Voice Input Enhancement

- **2026-01-13 (Late Morning)**: Plan 04-01 (Voice Parser Enhancement) executed
  - **Duration**: 45 minutes
  - **Approach**: TDD with RED-GREEN cycle, atomic commits per task
  - **Deliverables**:
    - Confidence scoring types (ParsedOrderWithConfidence, ArticleValidationResult)
    - Comprehensive test suite (29 unit tests, all passing)
    - Article code normalization (handles "H71 104 032" without "punto")
    - Mixed-package detection algorithm (knapsack-style, optimal solution marking)
    - 3-layer validation with fuzzy matching (fuse.js, handles H71→H61 errors)
  - **Impact**: Critical voice input patterns handled, error recovery implemented
  - **Test results**: 29/29 tests passing, no TypeScript errors
  - **Deferred**: Confidence scoring algorithm (Task 5), multi-item enhancement (Task 7), integration tests (Task 8 - Plan 04-02 scope)
  - **Next steps**: Execute Plan 04-02 (Visual Feedback) or Plan 04-03 (Integration Tests)

- **2026-01-13 (Afternoon)**: Plan 04-02 (Visual Feedback During Voice Recognition) executed
  - **Duration**: 120 minutes actual
  - **Deliverables**:
    - ConfidenceMeter component with color-coded progress bar (9 tests passing)
    - EntityBadge component for entity highlighting (12 tests passing)
    - TranscriptDisplay component with highlightEntities() utility (5 tests passing)
    - ValidationStatus component for async feedback (7 tests passing)
    - SmartSuggestions component with error recovery (7 tests passing)
    - PackageDisambiguationModal component for packaging selection (7 tests passing)
    - Integration into OrderForm voice modal with real-time parsing
    - Accessibility audit complete - all ARIA attributes present, keyboard navigation functional
  - **Test Results**: 82/82 tests passing, 0 TypeScript errors
  - **Impact**: Voice modal now has real-time visual feedback with confidence indicators, entity highlighting, validation status, smart suggestions, and package disambiguation
  - **Commits**: 8 atomic commits (ef89a5f through 094ffbe)
  - **Next steps**: Execute Plan 04-03 (Integration Tests) if needed, or verify Phase 4 complete

- **2026-01-13 (Afternoon, continued)**: Plan 04-03 (Form Field Population + Manual Edit + Tap Confirmation) executed
  - **Duration**: 120 minutes actual
  - **Deliverables**:
    - Voice hybrid workflow: dettatura → form pre-fill → manual edit → tap confirmation
    - VoicePopulatedBadge component with confidence indicators (🎤 85%)
    - Review & Apply button with smart enabling (confidence > 50%)
    - Draft items list for staging before order creation
    - Confirmation modal with order summary before submission
    - Multi-item voice input with summary modal
    - User onboarding hints with first-use guidance
    - Manual edit capability for all voice-populated fields
  - **Test Results**: 98/98 tests passing, 0 TypeScript errors
  - **Impact**: Complete voice hybrid workflow with review, edit, and explicit confirmation steps
  - **Commits**: 10 atomic commits (ac1654d through 58bfdd7)
  - **Phase Status**: Phase 4 Voice Input Enhancement now COMPLETE (3/3 plans)

- **2026-01-13 (Evening)**: Fix 04-FIX (Critical Infinite Loop Bug) executed
  - **Duration**: 45 minutes
  - **Priority**: 🔴 BLOCKER - Entire voice feature non-functional
  - **Root Cause**: useEffect dependency issue in useVoiceInput hook causing infinite re-renders
  - **Fix Strategy**: useRef pattern to stabilize callbacks without triggering effect re-runs
  - **Deliverables**:
    - Fixed useVoiceInput.ts with useRef pattern (6e40ba4)
    - 13 comprehensive regression tests (13/13 passing) (35fe0ec)
    - Manual UAT verification checklist (4172515)
    - Complete fix summary documentation (93a3417)
  - **Test Results**: 13/13 unit tests passing, 0 TypeScript errors
  - **Impact**: UAT-001 resolved - voice input now functional, SpeechRecognition stable
  - **Commits**: 4 total (fix + tests + docs + metadata)
  - **Phase Status**: Phase 4 technically complete, manual UAT pending

- **2026-01-13 (Late Evening)**: Phase 4.1 (Critical Production Fixes) inserted as URGENT priority
  - **Reason**: 4 critical production blockers discovered during user review
  - **Priority**: 🔴 CRITICAL - Must fix before Phase 5 Order Submission
  - **Issues Identified**:
    1. Backend processes interfere with bot during order creation (HIGH impact)
    2. Prices not visible in order form despite existing in Archibald (HIGH impact, 4 screenshots provided)
    3. Voice modal UX insufficient - needs better examples and workflow guide (MEDIUM impact)
    4. Customer sync processes old customers first, new customers last (HIGH impact - blocks agents)
  - **Plans**: 4 plans (1 per issue)
  - **Estimated Effort**: 8-12 hours total
  - **Execution Priority**: 04.1-01 (Backend) → 04.1-04 (Customer) → 04.1-02 (Price) → 04.1-03 (Voice UX)
  - **Impact**: Blocks reliable production use - must fix before continuing
  - **Context**: Full analysis documented in `.planning/phases/04.1-critical-production-fixes/04.1-CONTEXT.md`
  - **Next steps**: Plan 04.1-01 (Backend Process Priority Manager)

## Session Continuity

Last session: 2026-01-13 (late evening)
Stopped at: Phase 4.1 inserted and documented, ready for planning
Next: `/gsd:plan-phase 4.1` or start with 04.1-01 (Backend Priority Manager)

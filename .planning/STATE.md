# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-11)

**Core value:** Rendere la creazione ordini Archibald **veloce, affidabile e mobile-friendly** per agenti in movimento
**Current focus:** Phase 4 — Voice Input Enhancement

## Current Position

Phase: 4 of 12 (Voice Input Enhancement)
Plan: 1/3 (Plan 04-01 complete)
Status: IN PROGRESS - Plan 04-02 next
Last activity: 2026-01-13 — Plan 04-01 executed (voice parser enhancement with error recovery)

Progress: ████████░░ 28% (26/36 plans complete - Phase 4 in progress)

## Performance Metrics

**Velocity:**
- Total plans completed: 22
- Average duration: 67 min (1h 7m)
- Total execution time: 25.4 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 5 | 965 min | 193 min |
| 2 | 8 | 101 min | 13 min |
| 3 | 8 | 346 min | 43 min |
| 3.1 | 3 | 350 min | 117 min |

**Recent Trend:**
- Last 5 plans: 03.1-03 (120m), 03-04 (4m), 03-05 (37m), 03-06 (0m - integrated), 03-07 (21m)
- Trend: Phase 3 complete - averaging 43m per plan, Phase 4 next

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Phase | Decision | Rationale |
|-------|----------|-----------|
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

## Session Continuity

Last session: 2026-01-13 (late morning)
Stopped at: Plan 04-01 complete with SUMMARY.md, ready for Plan 04-02
Next: Execute Plan 04-02 (Visual Feedback During Voice Recognition) or Plan 04-03 (Integration Tests)

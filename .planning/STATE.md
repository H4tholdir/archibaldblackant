# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-11)

**Core value:** Rendere la creazione ordini Archibald **veloce, affidabile e mobile-friendly** per agenti in movimento
**Current focus:** Phase 3 — MVP Order Form

## Current Position

Phase: 3 of 12 (MVP Order Form)
Plan: 4/8 complete (03-01, 03-02, 03-03, 03-08 done; 03-04 through 03-07 remain)
Status: IN PROGRESS
Last activity: 2026-01-12 — Completed 03-08-PLAN.md (Critical Bot Refactor) - documentation added retroactively

Progress: ████████░░ 25%

## Performance Metrics

**Velocity:**
- Total plans completed: 18
- Average duration: 78 min (1h 18m)
- Total execution time: 24.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 5 | 965 min | 193 min |
| 2 | 8 | 101 min | 13 min |
| 3 | 4 | 284 min | 71 min |
| 3.1 | 3 | 350 min | 117 min |

**Recent Trend:**
- Last 5 plans: 03-03 (31m), 03-08 (240m), 03.1-01 (80m), 03.1-02 (150m), 03.1-03 (120m)
- Trend: Phase 3.1 complete, Phase 3 bot refactor complete (240m = 4h actual), now ready for remaining Phase 3 plans (03-04 through 03-07)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Phase | Decision | Rationale |
|-------|----------|-----------|
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

## Session Continuity

Last session: 2026-01-12 23:45
Stopped at: Completed 03-08 documentation (SUMMARY.md created retroactively), STATE.md and ROADMAP.md updated
Next: Continue Phase 3 main flow with plans 03-04 through 03-07 (validation, tests, API endpoints, frontend integration)

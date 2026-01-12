# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-11)

**Core value:** Rendere la creazione ordini Archibald **veloce, affidabile e mobile-friendly** per agenti in movimento
**Current focus:** Phase 3 — MVP Order Form

## Current Position

Phase: 3.1 of 12 (Bot Performance Profiling & Optimization - INSERTED)
Plan: 2/3 complete
Status: In progress
Last activity: 2026-01-12 — Completed 03.1-02-PLAN.md (Performance Dashboard & Visualization)

Progress: █████████░ 23%

## Performance Metrics

**Velocity:**
- Total plans completed: 17
- Average duration: 67 min (1h 7m)
- Total execution time: 20.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 5 | 965 min | 193 min |
| 2 | 8 | 101 min | 13 min |
| 3 | 3 | 44 min | 15 min |
| 3.1 | 2 | 230 min | 115 min |

**Recent Trend:**
- Last 5 plans: 02-08 (9m), 03-02 (4m), 03-03 (31m), 03.1-01 (80m), 03.1-02 (150m)
- Trend: Dashboard/visualization work more complex than expected (150m vs 180m planned = 83% efficiency)

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
| 3 | Search Archibald by variant ID instead of article name | Variant ID is unique, article name matches multiple variants causing selection errors |
| 3 | Populate articleId and packageContent in OrderItem | Enable order tracking, debugging, and verification of correct variant selection |
| 3 | Manual verification script instead of brittle integration tests | Full bot tests fragile (UI changes), slow (2+ min), complex setup; manual script provides instant verification |
| 3 | Ordered variants by multipleQty DESC in getProductVariants() | Highest package always first for consistent selection |

### Deferred Issues

None yet.

### Blockers/Concerns

None yet.

### Roadmap Evolution

- **2026-01-12**: Phase 3.1 (Bot Performance Profiling & Optimization) inserted after Phase 3 as URGENT priority
  - **Reason**: Critico profilare flusso bot completo prima di continuare con validazioni e frontend Phase 3
  - **Impact**: Blocca proseguimento Phase 3 (plans 03-04 to 03-08) fino a completamento Phase 3.1
  - **Rationale**: Ottimizzazione basata su dati reali (non supposizioni) è fondamentale per velocità produzione
  - **Current baseline**: ~82s order creation (con cache), colli di bottiglia identificati in customer selection (24.8s) e article search (9.1s)

- **2026-01-12**: Phase 3.1 planning completed
  - **Plans created**: 3 plans (03.1-01: Enhanced Profiling, 03.1-02: Dashboard & Visualization, 03.1-03: Optimization Plan Documentation)
  - **Scope**: ~6.5 hours total (1.5h + 3h + 2h)
  - **Objective**: Extend runOp() profiling, create HTML dashboard with Gantt charts, document data-driven optimization plan with ROI prioritization and SLO targets
  - **Expected outcome**: Clear optimization roadmap with 6+ opportunities, 42% improvement potential (-34.5s), target P95 < 60s

## Session Continuity

Last session: 2026-01-12 20:50
Stopped at: Completed 03.1-02-PLAN.md (Performance Dashboard & Visualization)
Next: Execute 03.1-03-PLAN.md (Optimization Plan Documentation)

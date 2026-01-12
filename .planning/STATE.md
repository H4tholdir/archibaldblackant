# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-11)

**Core value:** Rendere la creazione ordini Archibald **veloce, affidabile e mobile-friendly** per agenti in movimento
**Current focus:** Phase 3 — MVP Order Form

## Current Position

Phase: 3.1 of 12 (Bot Performance Profiling & Optimization - INSERTED)
Plan: 3/3 complete
Status: COMPLETE
Last activity: 2026-01-12 — Completed 03.1-03-PLAN.md (Optimization Plan Documentation)

Progress: █████████░ 24%

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
| 3.1 | 3 | 350 min | 117 min |

**Recent Trend:**
- Last 5 plans: 03-02 (4m), 03-03 (31m), 03.1-01 (80m), 03.1-02 (150m), 03.1-03 (120m)
- Trend: Phase 3.1 complete - profiling infrastructure and optimization planning finished (350m total vs 390m planned = 90% efficiency)

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

- **2026-01-12**: Phase 3.1 execution completed
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
  - **Next steps**: Resume Phase 3 main flow, execute optimization roadmap in future phase

## Session Continuity

Last session: 2026-01-12 22:30
Stopped at: Completed Phase 3.1 - All profiling and optimization planning finished
Next: Resume Phase 3 main flow (plans 03-04 through 03-08) OR implement Phase 3.1 optimizations

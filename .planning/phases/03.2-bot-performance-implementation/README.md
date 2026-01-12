# Phase 3.2: Bot Performance Implementation

**Status**: ⏳ PLANNED (6 plans ready for execution)

**Goal**: Implement all 7 optimizations from Phase 3.1 to achieve 40% performance improvement (81.5s → 49s P95)

## Overview

Phase 3.2 implements the optimization roadmap documented in Phase 3.1 (Bot Performance Profiling & Optimization). Based on comprehensive profiling data, this phase delivers systematic performance improvements across three categories:

- **Phase 1 (Quick Wins)**: Plans 01-02 - Low complexity, immediate impact (-8.5s)
- **Phase 2 (Major Optimizations)**: Plans 03-04 - High-impact bottleneck elimination (-17s) → **Achieves < 60s SLO ✅**
- **Phase 3 (Advanced Optimizations)**: Plans 05-06 - Advanced techniques for maximum performance (-13s)

## Performance Targets

| Milestone | Target P95 | Improvement | Status |
|-----------|------------|-------------|--------|
| **Baseline** | 81.5s | - | ✅ Measured |
| **Phase 1** | 73s | -8.5s (-10%) | 📋 Planned |
| **Phase 2 (SLO)** | 56s | -17s (-21%) | 📋 Planned |
| **Phase 3** | 49s | -13s (-16%) | 📋 Planned |
| **TOTAL** | **49s** | **-32.5s (-40%)** | 📋 Planned |

## Plans

### Phase 1: Quick Wins (Plans 01-02)

**Target**: 73s P95 (-8.5s, -10% improvement)
**Effort**: 7.25 hours
**Risk**: Low

#### Plan 01: Quick Wins Part 1
**Optimizations**: OPT-03 (Field Editing), OPT-04 (Multi-article Button)
**Impact**: -7.5s
**Techniques**:
- JavaScript setValue for field editing (vs keyboard simulation)
- Event-driven waiting for grid row insertion (vs fixed delays)

#### Plan 02: Quick Wins Part 2
**Optimizations**: OPT-05 (Login Cache), BUG-FIX (Missing Profiling Categories)
**Impact**: -1.0s
**Techniques**:
- Extended cache TTL (48h with validity check)
- Direct navigation to target page (skip homepage)
- Parallel cookie loading
- Fix 5 missing profiling category parameters

### Phase 2: Major Optimizations (Plans 03-04)

**Target**: 56s P95 (-17s, -21% improvement) → **Achieves < 60s SLO ✅**
**Effort**: 14 hours
**Risk**: Moderate

#### Plan 03: Customer Selection Optimization (OPT-01)
**Impact**: -13s (-59% customer selection time)
**Current**: 24.8s (30.4% of total) - largest bottleneck
**Target**: ~10s
**Approaches**:
1. **Direct Customer ID Submission** (highest performance)
2. **Optimized Dropdown Interaction** (lowest risk)
3. **Hybrid: Try Direct, Fallback to Dropdown** (balanced)

**Decision Point**: Choose approach after investigating Archibald form payload structure

#### Plan 04: Article Search Caching (OPT-02)
**Impact**: -4s average
**Current**: 9.1s per article, no caching
**Target**: 5s cached (-45%), 8s uncached (-12%)
**Techniques**:
- LRU cache (100 articles, 24h TTL)
- Persistent cache across sessions (.cache/article-cache.json)
- Pre-fetch top 20 articles during idle
- Expected cache hit rate: 70%+

**Milestone**: **SLO ACHIEVED** - P95 < 60s target met

### Phase 3: Advanced Optimizations (Plans 05-06)

**Target**: 49s P95 (-13s, -16% improvement)
**Effort**: 16 hours
**Risk**: Medium to High

#### Plan 05: Network & Request Optimization (OPT-06)
**Impact**: -5s (-6% overall)
**Optimizations**:
1. Network timing instrumentation (visibility for future work)
2. Screenshot frequency reduction (only errors/critical points) → -2s
3. Selector optimization (XPath → CSS, pre-caching) → -1s
4. Request pipelining (optional, advanced) → 0-2s

#### Plan 06: Parallel Article Processing (OPT-07)
**Impact**: -8s per additional article (-46% multi-article overhead)
**Current**: 18.5s per additional article (linear scaling)
**Target**: 10s per additional article
**Approach Options**:
1. **Parallel Search Only** (conservative): -4s per article
2. **Parallel Search + Operation Overlap** (moderate): -6s per article
3. **Batch Validation** (aggressive): -8s per article (if supported)

**Implementation**:
- State machine for article processing (IDLE → SEARCHING → SELECTING → EDITING → VALIDATING → COMPLETE)
- Safe operation overlap (read-only operations parallel)
- Pre-fetch article N+1 while processing article N

**Decision Point**: Choose approach based on DevExpress concurrency capabilities

## Key Optimizations Summary

| # | Optimization | Priority | Impact | Effort | ROI | Plan |
|---|--------------|----------|--------|--------|-----|------|
| OPT-03 | Field editing optimization | ⭐⭐⭐ | -4.5s | 3h | 1.50s/h | 01 |
| OPT-04 | Multi-article button | ⭐⭐⭐ | -3s | 2h | 1.50s/h | 01 |
| OPT-05 | Login cache enhancement | ⭐⭐ | -1s | 2h | 0.50s/h | 02 |
| BUG | Missing profiling categories | Critical | 0s | 0.25h | - | 02 |
| **OPT-01** | **Customer selection** | ⭐⭐⭐ | **-13s** | 8h | 1.63s/h | **03** |
| **OPT-02** | **Article search caching** | ⭐⭐⭐ | **-4s** | 6h | 0.67s/h | **04** |
| OPT-06 | Network optimization | ⭐⭐⭐ | -5s | 4h | 1.25s/h | 05 |
| OPT-07 | Parallel article processing | ⭐⭐ | -8s | 12h | 0.67s/h | 06 |

**Total**: 8 optimizations (7 + 1 bug fix), 37.25 hours, -32.5s impact

## Dependencies

**Phase 3.1 Prerequisites**:
- ✅ Enhanced profiling system with runOp() tracking
- ✅ Performance dashboard (HTML reports)
- ✅ Baseline metrics documented (81.5s P95)
- ✅ Bottlenecks identified and quantified
- ✅ OPTIMIZATION-PLAN.md with detailed implementation steps

**External Dependencies**:
- ProductDatabase with package variant functions (Phase 3.02)
- DevExpress UI selector patterns (.planning/archibald-ui-selectors.md)
- Archibald session management (.cache/session.json)

## Execution Strategy

### Sequential Execution (Recommended)
Execute plans in order 01 → 02 → 03 → 04 → 05 → 06 for:
- Incremental validation (each plan validates previous improvements)
- Risk mitigation (early plans lower risk, build confidence)
- Clear milestone achievement (Phase 1 → Phase 2 SLO → Phase 3)

### Validation After Each Plan
1. Run profiling 3-5x to measure improvement
2. Generate performance dashboard
3. Compare P95 against expected target (±20% acceptable)
4. Document actual vs expected in SUMMARY.md
5. Verify no regressions in other operations

### Checkpoints
- **After Plan 02**: Phase 1 complete, quick wins validated
- **After Plan 04**: **SLO achieved** (< 60s P95) - major milestone, consider pausing for business validation
- **After Plan 06**: Phase 3 complete, maximum optimization achieved

## Risks & Mitigations

### Plan 01-02 (Low Risk)
- Risk: JavaScript setValue may not work with DevExpress
- Mitigation: Fallback to keyboard simulation, test both approaches

### Plan 03 (Moderate Risk)
- Risk: Direct customer ID submission may not be supported by Archibald form
- Mitigation: Research form payload first (Task 1), choose approach based on findings, implement fallback

### Plan 04 (Low Risk)
- Risk: Cache may serve stale data
- Mitigation: 24h TTL, evict expired entries, validate article still exists

### Plan 05 (Low Risk)
- Risk: Selector optimization may break reliability
- Mitigation: Extensive testing, keep selectors that work, only optimize slow ones

### Plan 06 (High Risk)
- Risk: Parallel operations may cause race conditions
- Mitigation: State machine validates safe concurrency, test with multiple article counts, fallback to sequential

## Success Criteria

### Phase 1 Success (Plans 01-02)
- [ ] Field editing ≤ 6s P95 (vs 9.5s baseline)
- [ ] Multi-article button ≤ 5s P95 (vs 7.0s baseline)
- [ ] Cached login ≤ 1.8s P95 (vs 2.3s baseline)
- [ ] All profiling operations categorized correctly
- [ ] Total order time: ~73s P95 (-8.5s ±1.7s)

### Phase 2 Success (Plans 03-04) - SLO ACHIEVEMENT
- [ ] Customer selection ≤ 13s P95 (vs 24.8s baseline)
- [ ] Article search (cached) ≤ 6s P95 (vs 9.1s baseline)
- [ ] Cache hit rate ≥ 70%
- [ ] **PRIMARY GOAL**: Total order time ≤ 60s P95 ✅
- [ ] Cumulative improvement: -25.5s ±5s

### Phase 3 Success (Plans 05-06) - MAXIMUM OPTIMIZATION
- [ ] Network timing instrumentation provides insights
- [ ] Screenshot overhead reduced (-2s ±0.4s)
- [ ] Selector optimization (-1s ±0.2s)
- [ ] Multi-article per-article overhead ≤ 12s (vs 18.5s baseline)
- [ ] Total single-article order time: ~49s P95 (-32.5s, -40%)

## Monitoring & Validation

### Profiling Methodology
1. Run profiling test: `cd archibald-web-app/backend && npx tsx src/test-complete-flow.ts`
2. Generate dashboard: Automatic HTML report in profiling-reports/
3. Extract P95 metrics from dashboard
4. Compare against baseline and targets

### Continuous Monitoring (Post-Phase)
- Weekly profiling runs (5 consecutive orders)
- Track P50/P95/P99 trends
- Alert if P95 > 60s for 2 consecutive days (SLO violation)
- Quarterly review of optimization effectiveness

## Business Impact

### Performance Improvements
- Single article orders: 81.5s → 49s (-40%)
- Multi-article orders: Per-article overhead -46% (18.5s → 10s)

### Productivity Gains
- Baseline: 22 orders/hour
- After Phase 2 (SLO): 32 orders/hour (+45%)
- After Phase 3: 36+ orders/hour (+64%)

### Time Savings
- 32.5s per order
- 1000 orders: ~9 hours saved
- 10000 orders: ~90 hours saved

## References

- **Phase 3.1 Documentation**: `.planning/phases/03.1-bot-performance-profiling-optimization/`
  - OPTIMIZATION-PLAN.md (detailed optimization specifications)
  - BASELINE-METRICS.json (profiling baseline data)
  - Profiling dashboard HTML reports
- **Archibald UI Documentation**: `.planning/archibald-ui-selectors.md`
- **Implementation**: `archibald-web-app/backend/src/archibald-bot.ts`
- **Profiling System**: runOp() method in archibald-bot.ts

## Next Steps

1. Execute Plan 3.2-01 (Quick Wins Part 1)
2. Validate improvements with profiling
3. Continue through Plan 3.2-06
4. Consider pausing after Plan 3.2-04 for business validation of SLO achievement
5. Document all findings in SUMMARY.md files
6. Update STATE.md with completion metrics

---

**Phase 3.2 planning complete. Ready for execution via `/gsd:execute-plan 3.2-01-PLAN.md`**

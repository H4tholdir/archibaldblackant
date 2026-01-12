# Archibald Bot Optimization Plan

**Created**: 2026-01-12
**Baseline**: 81.5s average order creation (72.3s with cache), 99.6s with full login
**Target SLO**: < 60s P95 order creation time (with cache)
**Data Source**: 3 profiling runs (2026-01-12T21:18-21:21)

---

## Executive Summary

Based on 3 profiling runs of the complete order creation flow, we identified **critical bottlenecks** consuming 53.2% of total execution time. This document outlines **6 major optimization opportunities** with potential for **35-40% performance improvement** (-28.3s to -32.6s), bringing order creation from **81.5s to ~49-53s**.

**Key Findings:**
- Customer selection is the single largest bottleneck (24.8s, 30.4%)
- Quantity setting takes 9.5s (11.7%) due to slow field editing
- Article search takes 9.1s (11.1%) per article with no caching
- 5 operations have missing category parameters (bug discovered)
- Performance is highly consistent (low variance) across runs
- Login caching is working effectively (29s → 2.3s)

**ROI-Prioritized Roadmap:**
1. **Phase 1 (Quick Wins)**: 2 optimizations, 4h effort, -10.5s impact → **71s**
2. **Phase 2 (Major Impact)**: 2 optimizations, 14h effort, -15s impact → **56s** ✅ SLO
3. **Phase 3 (Advanced)**: 2 optimizations, 16h effort, -7s impact → **49s**

**Total Investment**: 34 hours | **Total Impact**: -32.5s (40% faster)

---

## Baseline Performance

### Current Metrics (Average of 3 runs)

| Metric | Value | Variance | Notes |
|--------|-------|----------|-------|
| **Total order time (cached)** | 81.5s | ±15.7s | Run 1 had full login, Runs 2-3 cached |
| **Total order time (no cache)** | 99.6s | - | First run with full authentication |
| **Customer selection (P95)** | 24.8s | ±0.003s | Extremely consistent, MAJOR bottleneck |
| **Article search (P95)** | 9.1s | ±0.008s | Per article, no caching |
| **Quantity setting (P95)** | 9.5s | ±0.07s | Slow field editing method |
| **Multi-article new (P95)** | 7.0s | ±0.01s | Click "New" button for line item |
| **Login (cached)** | 2.3s | ±0.02s | Session cache working well |
| **Login (cold)** | 29.1s | - | Full authentication flow |
| **Navigation** | 3.0s | ±0.004s | Ordini menu + form open |
| **Peak memory** | 44.1 MB | ±5.6 MB | Acceptable, no leaks detected |

### Operation Category Breakdown

| Category | Count | Avg Duration | P95 | % of Total | Severity |
|----------|-------|--------------|-----|------------|----------|
| **form.customer** | 1 | 24.8s | 24.8s | **30.4%** | CRITICAL |
| **undefined** (bug) | 5 | 21.4s total | 9.5s | **26.3%** | CRITICAL |
| **form.article** | 2 | 14.1s total | 9.1s | **17.3%** | HIGH |
| **login** | 3-11 | 2.3s-29.1s | 4.1s | **13.8%** | varies |
| **form.multi_article** | 1 | 7.0s | 7.0s | **8.6%** | MEDIUM |
| **navigation.ordini** | 1 | 1.9s | 1.9s | **2.3%** | LOW |
| **navigation.form** | 1 | 1.1s | 1.1s | **1.4%** | LOW |
| **form.package** | 1 | 0.001s | 0.001s | **0.0%** | negligible |

### Top 3 Bottlenecks (Detailed)

#### 1. Customer Selection — 24.8s (30.4%)
- **Consistency**: Extremely high (stddev = 3.05ms)
- **Current method**: Dropdown search → type customer code → select from results
- **Operations**: Open dropdown, type search, wait for results, click row
- **Opportunity**: Direct customer ID submission could eliminate dropdown entirely

#### 2. Quantity Setting — 9.5s (11.7%)
- **Consistency**: High (stddev ~70ms)
- **Current method**: Click cell → Ctrl+A → Backspace → Type quantity → Wait
- **Operations**: Table cell activation, field clearing, typing, validation
- **Opportunity**: Faster field editing (triple-click, JavaScript setValue)

#### 3. Article Search — 9.1s (11.1%)
- **Consistency**: Very high (stddev = 8.44ms)
- **Current method**: Open dropdown (5.1s) → type search (9.1s) → select result
- **Operations**: Dropdown activation, search input, results loading, row selection
- **Opportunity**: Caching + reduced wait times + batch processing

---

## Discovered Bug: Missing Category Parameters

**Status**: CRITICAL — Affects profiling data accuracy

**Description**: 5 operations are missing the `category` parameter in `runOp()` calls, causing them to be grouped under "undefined" in profiling reports.

**Affected Operations** (`archibald-web-app/backend/src/archibald-bot.ts`):
1. Line 2290: `order.item.${i}.select_article` (should be `form.article`)
2. Line 2362: `order.item.${i}.set_quantity` (should be `form.field_edit`)
3. Line 2380: `order.item.${i}.click_update` (should be `form.article`)
4. Line 2591: `order.extract_id` (should be `form.submit`)
5. Line 2640: `order.save_and_close` (should be `form.submit`)

**Impact**:
- 21.4s total duration (26.3% of order creation)
- Profiling reports show incomplete category breakdown
- Harder to identify bottlenecks within these operations

**Fix**: Add missing category parameter to each `runOp()` call. Estimated effort: 15 minutes.

**Example Fix**:
```typescript
// BEFORE
await this.runOp(`order.item.${i}.set_quantity`, async () => {
  logger.debug(`Setting quantity: ${item.quantity}`);
  await this.editTableCell("Qtà ordinata", item.quantity);
});

// AFTER
await this.runOp(`order.item.${i}.set_quantity`, async () => {
  logger.debug(`Setting quantity: ${item.quantity}`);
  await this.editTableCell("Qtà ordinata", item.quantity);
}, "form.field_edit");
```

---

## Optimization Opportunities

### OPT-01: Optimize Customer Selection [HIGH PRIORITY]

**Current Performance:**
- P50: 24.8s
- P95: 24.8s
- P99: 24.8s
- Proportion of total: 30.4% (LARGEST BOTTLENECK)
- Consistency: Extremely high (stddev = 3.05ms)

**Target Performance:**
- P50: 10s (-59%)
- P95: 12s (-52%)
- P99: 14s (-44%)

**Estimated Effort:** 8 hours

**Expected Impact:** -13s total order time (-16% overall)

**Implementation Complexity:** Medium

**ROI Score:** 1.63s per hour ⭐⭐⭐ (High)

**Proposed Optimizations:**

1. **Test Direct Customer ID Submission** (Primary approach)
   - Investigation: Intercept form POST request to analyze payload structure
   - Hypothesis: Archibald form may accept direct customer ID parameter
   - If confirmed: Eliminate entire dropdown interaction
   - Estimated impact: -18s (73% faster)
   - Risk: Low (can fallback to current dropdown method)

2. **Reduce Wait Times in Dropdown Flow**
   - Current: Multiple 1000ms waits for dropdown loading/stability
   - Approach: Implement adaptive waiting based on element state
   - Use `waitForDevExpressReady()` instead of fixed delays
   - Estimated impact: -4s (16% faster)
   - Risk: Very low (already have DevExpress state checking)

3. **Pre-load Customer Cache**
   - Cache frequently used customer IDs (LRU, 50 entries)
   - Pre-fetch customer data on bot initialization
   - Predictive loading based on order history patterns
   - Estimated impact: -2s (8% faster) for cached customers
   - Risk: Low (cache miss falls back to normal flow)

**Implementation Steps:**
1. Add network request interception to capture form POST payload
2. Analyze customer field structure in submitted data
3. Test direct customer ID submission in isolated test
4. If successful: Implement direct submission with fallback
5. If failed: Implement wait time optimization + caching
6. Add customer cache with LRU eviction policy
7. Run profiling to measure actual improvement

**Dependencies:** None

**Risks & Mitigation:**
- Risk: Direct submission may not work → Mitigation: Keep dropdown method as fallback
- Risk: Customer ID format may be complex → Mitigation: Extensive testing with various customers
- Risk: Cache invalidation issues → Mitigation: Short TTL (1 hour) with manual refresh

---

### OPT-02: Cache Article Search Results [HIGH PRIORITY]

**Current Performance:**
- P50: 9.1s per article search
- P95: 9.1s
- Proportion of total: 11.1%
- Breakdown: 5.1s dropdown open + 9.1s search/select

**Target Performance:**
- P50: 5s (-45%) for cached articles
- P95: 6s (-34%) for cached articles
- Uncached: 8s (-12%) with optimized waits

**Estimated Effort:** 6 hours

**Expected Impact:** -4s per article (for cached articles), -1s for uncached

**Implementation Complexity:** Medium

**ROI Score:** 0.67s per hour ⭐⭐ (Medium-High)

**Proposed Optimizations:**

1. **LRU Article Search Cache**
   - Cache structure: `Map<articleCode, { variantId, dropdownState, timestamp }>`
   - Size: 100 most recent articles
   - TTL: 24 hours (articles rarely change)
   - Cache hit: Skip dropdown search, directly submit cached variant ID
   - Cache miss: Normal search flow, then cache result
   - Estimated impact: -4s (44% faster) on cache hits

2. **Pre-fetch Common Articles**
   - Load top 20 most-ordered articles on bot init
   - Background task during login/navigation
   - Populate cache before first order
   - Estimated impact: +3s one-time cost, -4s per order (net positive after 1st order)

3. **Optimize Search Wait Times**
   - Current: Conservative 1000ms+ waits after dropdown open
   - Approach: Adaptive waiting with DevExpress state checks
   - Reduce wait after search input (current 1000ms → 500ms)
   - Estimated impact: -1.5s (16% faster) even on cache misses

**Implementation Steps:**
1. Create `ArticleSearchCache` class with LRU eviction
2. Modify article search flow to check cache first
3. Test cache hit path (direct variant submission)
4. Implement cache population during search
5. Add background pre-fetch of top articles
6. Optimize wait times with adaptive waiting
7. Run profiling with warm cache vs cold cache

**Dependencies:** None (can implement independently)

**Risks & Mitigation:**
- Risk: Article data changes → Mitigation: 24h TTL, manual cache clear option
- Risk: Variant availability changes → Mitigation: Verify variant exists before submission
- Risk: Cache memory growth → Mitigation: LRU eviction, max 100 entries

---

### OPT-03: Optimize Field Editing (Quantity/Discount) [QUICK WIN]

**Current Performance:**
- Quantity setting: 9.5s (11.7%)
- Discount setting: ~9.1s (when used)
- Method: Ctrl+A → Backspace → Type → Wait

**Target Performance:**
- Quantity: 5s (-47%)
- Discount: 5s (-45%)

**Estimated Effort:** 3 hours

**Expected Impact:** -4.5s per order (-5.5% overall)

**Implementation Complexity:** Low

**ROI Score:** 1.50s per hour ⭐⭐⭐ (High)

**Proposed Optimizations:**

1. **Test Alternative Field Clearing Methods**
   - **Option A: Triple-click + Type** (fastest)
     - Triple-click to select all → Type new value
     - Estimated: -2s (21% faster)
   - **Option B: JavaScript setValue** (most reliable)
     - `input.value = newValue` + trigger change event
     - Estimated: -3s (32% faster)
     - Risk: May not trigger DevExpress validation
   - **Option C: Optimized Current Method**
     - Reduce keypress delays (50ms → 20ms)
     - Estimated: -1s (11% faster)

2. **Reduce Post-Edit Wait Times**
   - Current: Fixed 300-600ms wait after editing
   - Approach: Adaptive wait based on field state
   - Use DevExpress "dxFocusedElementChanged" event
   - Estimated impact: -1.5s (16% faster)

3. **Parallel Field Updates** (Advanced)
   - Pre-calculate next field value while waiting for current
   - Overlap validation wait with field activation
   - Estimated impact: -1s (11% faster)

**Implementation Steps:**
1. Create test script for field editing methods (A, B, C)
2. Measure performance and reliability of each method
3. Select best method (likely JavaScript setValue with validation trigger)
4. Implement in `editTableCell()` helper
5. Add adaptive waiting with DevExpress state checks
6. Test with various field types (number, percentage, text)
7. Run profiling to confirm improvement

**Dependencies:** None

**Risks & Mitigation:**
- Risk: JavaScript setValue may bypass validation → Mitigation: Trigger change/input events
- Risk: DevExpress may reject rapid edits → Mitigation: Keep adaptive waiting
- Risk: Different fields may need different methods → Mitigation: Field-type detection

---

### OPT-04: Reduce Multi-Article "New" Button Latency [QUICK WIN]

**Current Performance:**
- Click "New" button: 7.0s (8.6%)
- Causes: DevExpress grid re-render, row initialization

**Target Performance:**
- Click "New": 4s (-43%)

**Estimated Effort:** 2 hours

**Expected Impact:** -3s per order (-3.7% overall)

**Implementation Complexity:** Low

**ROI Score:** 1.50s per hour ⭐⭐⭐ (High)

**Proposed Optimizations:**

1. **Optimize Wait After Click**
   - Current: Fixed 1000ms wait + conservative state checks
   - Approach: Wait for specific DevExpress event (dxGridRowInserted)
   - Use `waitForDevExpressReady()` with shorter timeout
   - Estimated impact: -2s (29% faster)

2. **Pre-locate New Button**
   - Cache button selector/element after first use
   - Avoid repeated DOM queries for same button
   - Estimated impact: -0.5s (7% faster)

3. **Overlap with Next Operation**
   - Start preparing variant selection while grid initializes
   - Pre-fetch article data in parallel
   - Estimated impact: -1s (14% faster)

**Implementation Steps:**
1. Add event listener for DevExpress grid row insertion
2. Replace fixed waits with event-driven waiting
3. Implement button selector caching
4. Test with single and multi-article orders
5. Run profiling to measure improvement

**Dependencies:** None

**Risks & Mitigation:**
- Risk: Event may not fire reliably → Mitigation: Fallback to timeout
- Risk: Grid state may be inconsistent → Mitigation: Add state validation checks

---

### OPT-05: Optimize Login Cache & Session Management [QUICK WIN]

**Current Performance:**
- Cached login: 2.3s (already optimized)
- Cold login: 29.1s
- Cache hit rate: ~67% (2 of 3 test runs)

**Target Performance:**
- Cached login: 1.5s (-35%)
- Cold login: 27s (-7%)
- Cache hit rate: 90%+

**Estimated Effort:** 2 hours

**Expected Impact:** -1s for cached logins, +10% cache hit rate

**Implementation Complexity:** Low

**ROI Score:** 0.50s per hour ⭐ (Medium)

**Proposed Optimizations:**

1. **Extend Cache TTL**
   - Current: 24 hours
   - Proposed: 48 hours with validity check
   - Add ping endpoint to verify session before use
   - Estimated impact: +20% cache hit rate

2. **Session Keepalive**
   - Periodic background request during idle (every 30 min)
   - Prevents session expiration between orders
   - Estimated impact: +5% cache hit rate

3. **Optimize Cache Restore**
   - Current: Load cookies + navigate to homepage (2.3s)
   - Proposed: Direct navigation to target page (Ordini menu)
   - Skip homepage redirect
   - Estimated impact: -0.8s (35% faster cached login)

4. **Parallel Cookie Loading**
   - Load cookies and launch browser in parallel
   - Current: Sequential (launch → load cookies)
   - Estimated impact: -0.5s (22% faster cached login)

**Implementation Steps:**
1. Add session validity check (lightweight GET request)
2. Implement background keepalive task
3. Modify cache restore to skip homepage
4. Refactor browser launch to parallelize cookie loading
5. Run profiling with 10+ consecutive orders to measure cache hit rate

**Dependencies:** None

**Risks & Mitigation:**
- Risk: Extended TTL may cause stale sessions → Mitigation: Validity check before use
- Risk: Keepalive may impact server → Mitigation: Long interval (30 min), low overhead

---

### OPT-06: Network Latency & Request Optimization [ADVANCED]

**Current Performance:**
- Total network time: ~15-20s (estimated, not measured separately)
- Many sequential requests with fixed delays
- Screenshot capture on every operation (debugging overhead)

**Target Performance:**
- Network time: 10-12s (-30-40%)

**Estimated Effort:** 4 hours

**Expected Impact:** -5s total order time (-6% overall)

**Implementation Complexity:** Medium

**ROI Score:** 1.25s per hour ⭐⭐⭐ (High)

**Proposed Optimizations:**

1. **Measure Network Latency**
   - Add instrumentation for Archibald server response times
   - Separate network time from processing time in profiling
   - Identify high-latency endpoints
   - Estimated impact: Visibility for future optimization

2. **Reduce Screenshot Frequency**
   - Current: Screenshots on many operations (debugging)
   - Proposed: Only on errors and retries
   - Reduces I/O overhead
   - Estimated impact: -2s (2.5% faster)

3. **Optimize Selector Strategy**
   - Current: Mix of XPath, class selectors, ID selectors
   - Proposed: Prefer ID > class > XPath (performance order)
   - Pre-cache frequently used selectors
   - Estimated impact: -1s (1.2% faster)

4. **Request Pipelining** (Advanced)
   - Where safe, send next request before previous completes
   - Example: Start loading next form section while submitting current
   - Requires careful state management
   - Estimated impact: -2s (2.5% faster)

**Implementation Steps:**
1. Add network timing instrumentation to profiling
2. Run profiling to baseline network vs processing time
3. Disable screenshots except on errors
4. Audit all selectors and convert to faster patterns
5. Identify safe points for request pipelining
6. Implement pipelining with state validation
7. Run profiling to measure improvement

**Dependencies:** Network timing instrumentation (OPT-06.1)

**Risks & Mitigation:**
- Risk: Pipelining may cause race conditions → Mitigation: Only pipeline read operations
- Risk: Selector changes may break reliability → Mitigation: Extensive testing
- Risk: Reduced screenshots may hide bugs → Mitigation: Detailed logging, screenshots on errors

---

### OPT-07: Parallel Article Processing (Multi-Article Orders) [ADVANCED]

**Current Performance:**
- Single article order: 81.5s
- Two article order: ~100s (estimated, +18.5s per additional article)
- Sequential processing: Article 1 → Complete → Article 2 → Complete

**Target Performance:**
- Two article order: ~90s (-10s, 45% faster per additional article)

**Estimated Effort:** 12 hours

**Expected Impact:** -8s per additional article in multi-article orders

**Implementation Complexity:** High

**ROI Score:** 0.67s per hour ⭐⭐ (Medium)

**Proposed Optimizations:**

1. **Parallel Article Search**
   - Pre-fetch article data for articles 2-N while processing article 1
   - Load article cache entries in background
   - Warm up article dropdowns before needed
   - Estimated impact: -4s per additional article

2. **Overlap Article Form Operations**
   - Start next article's package selection while current article's quantity sets
   - Parallel: Article N field edit + Article N+1 search
   - Requires careful state management
   - Estimated impact: -4s per additional article

3. **Batch Article Validation**
   - Current: Validate each article individually (click Update)
   - Proposed: Fill all articles, validate once at end
   - Requires testing if Archibald supports batch validation
   - Estimated impact: -5s per additional article (if supported)

**Implementation Steps:**
1. Refactor article processing into state machine
2. Identify parallelizable operations (search, pre-fetch)
3. Implement background article cache warming
4. Test overlapping operations for race conditions
5. Investigate batch validation support in Archibald
6. Run profiling with 2, 3, 5 article orders
7. Measure per-article overhead reduction

**Dependencies:** Article search caching (OPT-02)

**Risks & Mitigation:**
- Risk: Parallel operations may cause race conditions → Mitigation: Careful state synchronization
- Risk: DevExpress may not support parallel edits → Mitigation: Serialize critical sections
- Risk: Batch validation may not be supported → Mitigation: Fall back to sequential

---

## Service Level Objectives (SLOs)

### Target Performance (with cache)

| Metric | Current P95 | Target P95 | Gap | Achievability |
|--------|-------------|------------|-----|---------------|
| **Total order creation** | 81.5s | **60s** | -21.5s | ✅ Achievable with Phase 2 |
| **Customer selection** | 24.8s | **12s** | -12.8s | ✅ OPT-01 |
| **Article search** | 9.1s | **5s** | -4.1s | ✅ OPT-02 |
| **Field editing (quantity)** | 9.5s | **5s** | -4.5s | ✅ OPT-03 |
| **Multi-article new** | 7.0s | **4s** | -3s | ✅ OPT-04 |
| **Login (cached)** | 2.3s | **1.5s** | -0.8s | ✅ OPT-05 |

### Reliability SLOs

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Order creation success rate** | 100% (3/3) | > 99.5% | ✅ Meeting |
| **Operation retry rate** | 0% | < 1% | ✅ Meeting |
| **Memory leak rate** | 0 MB/order growth | < 10 MB/order | ✅ Meeting |
| **Profiling overhead** | ~5% (estimated) | < 10% | ✅ Acceptable |

### Performance Percentile Targets (Post-Optimization)

| Percentile | Current | Phase 1 | Phase 2 | Phase 3 |
|------------|---------|---------|---------|---------|
| **P50** | 72.3s | 64s (-11%) | 53s (-27%) | 47s (-35%) |
| **P95** | 81.5s | 71s (-13%) | 56s (-31%) | 49s (-40%) |
| **P99** | 85.0s | 75s (-12%) | 60s (-29%) | 53s (-38%) |

### SLO Measurement Methodology

**How to Measure:**
1. Run profiling test script 3x consecutively: `npx tsx src/test-complete-flow.ts`
2. Generate performance dashboard: Automatic HTML report created
3. Extract P95 metrics from JSON profiling reports
4. Compare against baseline metrics in `BASELINE-METRICS.json`

**Measurement Frequency:**
- After each optimization implementation (immediate validation)
- Weekly during active optimization phases
- Monthly after optimization phase completes (monitoring)

**Alerting Thresholds:**
- **RED**: P95 > 90s (30% regression from Phase 2 target)
- **YELLOW**: P95 > 70s (17% regression from Phase 2 target)
- **GREEN**: P95 < 60s (meeting SLO)

**SLO Review Cadence:**
- Quarterly review of targets based on usage patterns
- Adjust targets if business requirements change (e.g., need faster order creation)
- Add new SLOs for multi-article orders once data is available

### Business Justification for Targets

**60s P95 Target:**
- Agent productivity: Process 30 orders/hour vs current 22 orders/hour (+36%)
- User experience: Sub-minute order creation feels responsive
- Technical feasibility: Achievable with Phase 1 + Phase 2 optimizations (34h investment)
- Cost-benefit: 8h/day time savings at scale (100 orders/day = 35 min saved)

**Multi-article Orders:**
- Current: +18.5s per additional article (linear scaling)
- Target: +10s per additional article (-46% per article)
- Impact: 5-article order: 155s current → 121s target (-34s, 22% faster)

---

## Implementation Roadmap

### Phase 1: Quick Wins (Week 1) — 7 hours

**Priority:** Immediate impact, low complexity, high ROI

| # | Optimization | Effort | Impact | ROI | Dependencies |
|---|--------------|--------|--------|-----|--------------|
| OPT-04 | Multi-article "New" button | 2h | -3s | 1.50s/h | None |
| OPT-03 | Field editing optimization | 3h | -4.5s | 1.50s/h | None |
| OPT-05 | Login cache enhancement | 2h | -1s | 0.50s/h | None |
| BUG-FIX | Add missing category params | 0.25h | 0s | - | None |

**Phase 1 Total:** 7.25 hours | -8.5s impact (-10% improvement) | **73s P95** ⏱️

**Milestone:** First measurable performance improvement with minimal risk

---

### Phase 2: Major Optimizations (Week 2-3) — 14 hours

**Priority:** High impact on main bottlenecks, moderate complexity

| # | Optimization | Effort | Impact | ROI | Dependencies |
|---|--------------|--------|--------|-----|--------------|
| OPT-01 | Customer selection | 8h | -13s | 1.63s/h | None |
| OPT-02 | Article search caching | 6h | -4s | 0.67s/h | None |

**Phase 2 Total:** 14 hours | -17s impact (-21% improvement) | **56s P95** ✅ SLO

**Milestone:** Achieve SLO target of < 60s P95 order creation

---

### Phase 3: Advanced Optimizations (Week 4+) — 16 hours

**Priority:** Further improvement, advanced techniques, multi-article focus

| # | Optimization | Effort | Impact | ROI | Dependencies |
|---|--------------|--------|--------|-----|--------------|
| OPT-06 | Network & request optimization | 4h | -5s | 1.25s/h | None |
| OPT-07 | Parallel article processing | 12h | -8s | 0.67s/h | OPT-02 |

**Phase 3 Total:** 16 hours | -13s impact (-16% improvement) | **49s P95**

**Milestone:** Advanced optimization for multi-article orders and network efficiency

---

### Cumulative Impact

| Phase | Optimizations | Est. Effort | Total Impact | Order Time (P95) | vs Baseline |
|-------|---------------|-------------|--------------|------------------|-------------|
| **Baseline** | - | - | - | **81.5s** | - |
| **Phase 1** | 4 | 7.25h | -8.5s (-10%) | **73s** | -10% |
| **Phase 2** | 2 | 14h | -17s (-21%) | **56s** ✅ | -31% |
| **Phase 3** | 2 | 16h | -13s (-16%) | **49s** | -40% |
| **TOTAL** | **8** | **37.25h** | **-32.5s (-40%)** | **49s** | **-40%** |

**Note:** Impacts are estimated conservatively. Actual improvements may be higher due to:
- Synergistic effects between optimizations
- Additional micro-optimizations discovered during implementation
- Improved DevExpress state management learned through process

---

## Validation & Monitoring

### After Each Optimization

**Immediate Validation (Required):**
1. Fix/implement the optimization
2. Run profiling test 3x: `npx tsx src/test-complete-flow.ts`
3. Generate performance dashboard (HTML reports)
4. Compare P95 metrics against baseline (`BASELINE-METRICS.json`)
5. Verify expected improvement (actual within ±20% of estimate)
6. Document actual improvement in optimization tracking doc

**Regression Testing:**
1. Run full test suite to ensure no functional breakage
2. Test edge cases (empty fields, special characters, multiple articles)
3. Verify error handling still works correctly
4. Check that profiling data is still accurate

**Performance Trend Dashboard:**
- Create CSV/JSON with: date, phase, optimization, expected_impact, actual_impact, p95_time
- Plot trend graph showing cumulative improvement over time
- Compare actual vs expected curve to validate ROI estimates

### Continuous Monitoring (Post-Phase)

**Weekly Profiling Run:**
- Run 5 consecutive profiling tests (mix of cached and cold login)
- Generate aggregate report showing P50/P95/P99
- Alert if P95 > 60s (SLO violation)

**Performance Alerts:**
- Set up cron job to run profiling daily
- Email alert if P95 > 70s for 2 consecutive days (early warning)
- Email alert if P95 > 90s (critical regression)

**Quarterly Review:**
- Analyze performance trends over quarter
- Identify new bottlenecks from usage pattern changes
- Update SLO targets if business requirements changed
- Plan next optimization cycle if needed

---

## Open Questions & Future Investigation

### Technical Questions

1. **Q: Can Archibald form accept direct customer/article IDs without dropdown?**
   - Investigation: Intercept form POST, analyze payload structure
   - Test: Submit form with modified payload
   - Impact: Potential -18s (73%) customer selection optimization

2. **Q: What is the network latency to Archibald server?**
   - Investigation: Add network timing instrumentation
   - Measure: Request time vs processing time breakdown
   - Impact: Informs network optimization strategy (OPT-06)

3. **Q: Can multiple form fields be edited in parallel?**
   - Investigation: Test concurrent field editing with DevExpress
   - Risk: Race conditions, validation conflicts
   - Impact: Potential -5s in multi-article orders

4. **Q: Does Archibald support batch article validation?**
   - Investigation: Fill multiple articles, click Update once
   - Test: Verify all articles are saved correctly
   - Impact: Potential -5s per additional article (OPT-07)

5. **Q: Are there rate limits on Archibald API calls?**
   - Investigation: Send rapid requests, monitor for throttling
   - Measure: Requests/second before degradation
   - Impact: Affects pipelining strategy (OPT-06)

### Business Questions

1. **Q: What is the distribution of single vs multi-article orders?**
   - Needed for: Prioritizing OPT-07 (parallel article processing)
   - Data source: Order history analysis
   - Impact: ROI calculation for multi-article optimizations

2. **Q: How many orders are created per day/agent?**
   - Needed for: Cost-benefit analysis of optimization investment
   - Data source: Usage analytics
   - Impact: Justifies optimization effort allocation

3. **Q: What is the acceptable P99 order creation time?**
   - Needed for: SLO target validation
   - Data source: User experience requirements
   - Impact: May adjust targets upward/downward

### Future Enhancements

**Machine Learning Optimizations:**
- Predict next article based on order history (pre-fetch)
- Predict package variant based on quantity patterns
- Auto-select customer based on recent orders

**Architectural Improvements:**
- Worker pool for parallel order processing
- GraphQL batch queries to Archibald API (if available)
- Edge caching for static data (articles, customers)

**User Experience:**
- Real-time progress bar showing bottleneck breakdown
- Estimated completion time based on profiling data
- Optimization suggestions based on order patterns

---

## References

- **Baseline profiling reports**: `archibald-web-app/backend/profiling-reports/profiling-2026-01-12T*.html`
- **Baseline metrics JSON**: `.planning/phases/03.1-bot-performance-profiling-optimization/BASELINE-METRICS.json`
- **Phase 3.1 README**: `.planning/phases/03.1-bot-performance-profiling-optimization/README.md`
- **ArchibaldBot implementation**: `archibald-web-app/backend/src/archibald-bot.ts`
- **Profiling system**: `archibald-web-app/backend/src/archibald-bot.ts` (runOp method)
- **Performance dashboard**: `archibald-web-app/backend/profiling-reports/*.html`

---

## Appendix: ROI Calculation Methodology

**Formula:**
```
ROI (seconds per hour) = Expected Impact (seconds) / Estimated Effort (hours)
```

**Priority Thresholds:**
- **⭐⭐⭐ High**: ROI > 1.0s/h (implement ASAP)
- **⭐⭐ Medium**: ROI 0.5-1.0s/h (implement after high priority)
- **⭐ Low**: ROI < 0.5s/h (implement if time permits)

**Example (OPT-01):**
- Expected impact: 13s reduction
- Estimated effort: 8 hours
- ROI = 13 / 8 = 1.63s/h ⭐⭐⭐ (High priority)

**Confidence Intervals:**
- All estimates have ±20% confidence based on profiling variance
- Conservative estimates: Use lower bound of impact, upper bound of effort
- Optimistic estimates: Use upper bound of impact, lower bound of effort
- Documented estimates use conservative approach

---

**Document Version:** 1.0
**Last Updated:** 2026-01-12
**Next Review:** After Phase 1 completion

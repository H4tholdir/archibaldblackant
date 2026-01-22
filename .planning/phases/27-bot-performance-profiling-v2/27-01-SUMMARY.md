# Phase 27-01 Summary: UI Optimization + Slowdown Infrastructure

**Date:** 2026-01-22
**Phase:** 27-bot-performance-profiling-v2
**Plan:** 27-01
**Status:** ✅ Complete

---

## Objective

Implement UI optimization (direct paste in article field) and add per-step slowdown tracking infrastructure to prepare the bot for performance profiling.

---

## Tasks Completed

### Task 1: Direct Paste in Article Name Field ✅

**Problem:** Bot used inefficient 3-step flow for article insertion:
1. Click article dropdown button
2. Click "Enter text to search" input
3. Paste article code

**Solution:** Replaced with single direct paste into article name field, which auto-triggers the filtered dropdown.

**Implementation:**
- Modified `createOrder()` method in `archibald-bot.ts`
- Created new step: `order.item.${i}.paste_article_direct`
- Eliminated `open_article_dropdown` step (was step 5.2)
- Consolidated `search_article` logic into direct paste operation (now step 5.2)
- Renumbered subsequent steps (5.4 → 5.3)

**Benefits:**
- Eliminates 2 UI interaction steps per article
- Reduces complexity and potential failure points
- Faster execution (eliminates dropdown click wait + search input click wait)

**Files Modified:**
- `archibald-web-app/backend/src/archibald-bot.ts` (lines 2544-2726 → 2544-2715)

---

### Task 2: Per-Step Slowdown Tracking Infrastructure ✅

**Purpose:** Enable Phase 27-02's SlowdownOptimizer to test different slowdown values without modifying bot code for each test.

**Implementation:**

1. **Added `SlowdownConfig` interface:**
   ```typescript
   interface SlowdownConfig {
     [stepName: string]: number;
   }
   ```

2. **Modified `createOrder()` signature:**
   - Added optional `slowdownConfig?: SlowdownConfig` parameter
   - Stores config in class property for use throughout order creation
   - Logs config at start of order creation

3. **Added `getSlowdown()` helper method:**
   - Returns configured slowdown value for a given step name
   - Falls back to 200ms default if step not in config

4. **Instrumented key order creation steps:**
   - `click_ordini` - After navigating to orders list
   - `click_nuovo` - After form loads
   - `select_customer` - After customer selection
   - `click_new_article` - After new line item created
   - `paste_article_direct` - After direct paste in article field
   - `select_article` - After article variant selected
   - `paste_qty` - After quantity field edited
   - `click_update` - After update button clicked
   - `click_salvare_dropdown` - After salvare dropdown opened
   - `click_salva_chiudi` - After salva e chiudi clicked

5. **Performance metadata tracking:**
   - Added `slowdownConfigActive` flag to operation metadata
   - Tracks whether custom slowdown config was used

**Benefits:**
- Enables automated profiling without code changes
- Default 200ms behavior preserved
- Per-step optimization ready for binary search
- Performance tracking includes slowdown context

**Files Modified:**
- `archibald-web-app/backend/src/archibald-bot.ts`
  - Interface definition (after imports)
  - Class property (line ~33)
  - `createOrder()` signature and logging (lines 1869-1888)
  - `getSlowdown()` helper (lines 680-689)
  - `runOp()` metadata enrichment (lines 66-91, 115-138)
  - Step instrumentation (10 locations throughout createOrder flow)

---

## Verification

✅ **TypeScript Compilation:** Passed (`npm run build` in backend)
✅ **Code Structure:** All changes localized to `archibald-bot.ts`
✅ **Default Behavior:** 200ms slowdown preserved when no config provided
✅ **Backward Compatibility:** Existing callers unaffected (optional parameter)

---

## Technical Details

### Step Name Conventions

Slowdown step names follow the pattern:
- `click_*` - User actions (button clicks, dropdown interactions)
- `paste_*` - Text input operations
- `select_*` - Selection operations (customer, article variant)

### Default Slowdown Logic

```typescript
private getSlowdown(stepName: string): number {
  return this.slowdownConfig[stepName] ?? 200;
}
```

If `slowdownConfig` is empty or step not found, uses 200ms default.

### Performance Impact (Estimated)

**Direct Paste Optimization:**
- Eliminates 2 steps per article × 200ms each = 400ms saved per article
- For typical order (1 article): ~400ms faster
- For multi-article order (3 articles): ~1200ms faster

**Slowdown Infrastructure:**
- No performance impact with default config
- Enables future optimization via binary search (Phase 27-02)

---

## Commits

**Commit:** `e0f2bcb` - feat(bot): add UI optimization and slowdown tracking infrastructure

**Message:**
```
feat(bot): add UI optimization and slowdown tracking infrastructure

Task 1: Direct paste in article name field
- Replace 3-step flow (dropdown click → search click → paste) with
  single direct paste into article name field
- UI auto-triggers filtered dropdown when text is pasted directly
- Eliminates 2 UI interaction steps per article

Task 2: Per-step slowdown tracking infrastructure
- Add SlowdownConfig interface for per-step slowdown values
- Modify createOrder() to accept optional slowdownConfig parameter
- Add getSlowdown() helper to retrieve configured values (200ms default)
- Instrument key order creation steps with named slowdown points:
  click_ordini, click_nuovo, select_customer, click_new_article,
  paste_article_direct, select_article, paste_qty, click_update,
  click_salvare_dropdown, click_salva_chiudi
- Track slowdown config usage in performance operation metadata

Prepares bot for Phase 27-02 binary search optimization.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Next Steps

**Phase 27-02:** Binary Search Slowdown Optimizer
- Implement automated binary search to find optimal slowdown values
- Test with customer: fresis, article: TD1272.314
- Generate `slowdown-config.json` with per-step optimal values
- Create HTML dashboard showing profiling results

---

## Notes

### Why Combined Commit?

Both tasks are tightly coupled:
- Direct paste optimization IS a step that needs slowdown tracking
- Changes interleaved throughout same method
- Both serve same goal: preparing bot for profiling
- Splitting would create artificial boundaries

### Test Data Reminder

For Phase 27-02 profiling:
- Customer: `fresis` (real customer)
- Article: `TD1272.314` (single packaging, qty=1)
- Keep test orders (don't delete after profiling)

### Architecture Notes

The slowdown infrastructure intentionally does NOT:
- Change any existing wait values
- Add new wait calls (only instruments existing critical points)
- Modify bot logic beyond parameter passing

This ensures:
- Backward compatibility
- Testability (can A/B test with/without custom config)
- Clarity (optimization is separate concern from bot logic)

---

**Status:** Ready for Phase 27-02 (Binary Search Optimizer)

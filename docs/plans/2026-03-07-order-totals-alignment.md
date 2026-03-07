# Order Totals Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify all order total calculations to match Archibald ERP's exact rounding logic: round each line to 2 decimals, then sum.

**Architecture:** A single canonical function `archibaldLineAmount(qty, price, discountPercent)` replaces all inline calculations across frontend (order-calculations.ts, PendingOrdersPage.tsx, OrderCardNew.tsx) and backend (submit-order.ts, edit-order.ts, sync-order-articles.ts). VAT is calculated on the already-rounded imponibile per-line.

**Tech Stack:** TypeScript, Vitest, React (frontend), Express (backend), PostgreSQL

---

### Task 1: Add `archibaldLineAmount` to `order-calculations.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/order-calculations.ts:202-208`
- Test: `archibald-web-app/frontend/src/utils/order-calculations.spec.ts`

**Step 1: Write the failing test**

Add to `order-calculations.spec.ts` at the end, before closing `});`:

```typescript
import {
  // ... existing imports ...
  archibaldLineAmount,
} from "./order-calculations";

describe("archibaldLineAmount", () => {
  test("matches Archibald ERP rounding for real order data", () => {
    // Verified against production PDF saleslines
    expect(archibaldLineAmount(6, 15.56, 15.62)).toBe(78.78);
    expect(archibaldLineAmount(10, 8.45, 30.43)).toBe(58.79);
    expect(archibaldLineAmount(1, 184.74, 30.44)).toBe(128.51);
    expect(archibaldLineAmount(5, 8.88, 34.84)).toBe(28.93);
    expect(archibaldLineAmount(2, 32.46, 34.84)).toBe(42.30);
    expect(archibaldLineAmount(20, 6.86, 34.28)).toBe(90.17);
    expect(archibaldLineAmount(1, 25.97, 15.63)).toBe(21.91);
    expect(archibaldLineAmount(5, 18.20, 34.85)).toBe(59.29);
  });

  test("handles zero discount", () => {
    expect(archibaldLineAmount(3, 10, 0)).toBe(30);
  });

  test("handles 100% discount", () => {
    expect(archibaldLineAmount(5, 20, 100)).toBe(0);
  });

  test("handles zero quantity", () => {
    expect(archibaldLineAmount(0, 50, 10)).toBe(0);
  });

  test("order total is sum of rounded lines", () => {
    // Order 50.203 from production
    const lines = [
      archibaldLineAmount(10, 8.45, 30.43),   // 58.79
      archibaldLineAmount(1, 135.19, 30.44),   // 94.04
      archibaldLineAmount(1, 184.74, 30.44),   // 128.51
      archibaldLineAmount(1, 184.74, 30.44),   // 128.51
    ];
    const total = lines.reduce((s, v) => s + v, 0);
    expect(Math.round(total * 100) / 100).toBe(409.85);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/frontend -- --run order-calculations.spec`
Expected: FAIL - `archibaldLineAmount` is not exported

**Step 3: Write implementation**

Add to `order-calculations.ts` after line 208 (after `roundUp`):

```typescript
/**
 * Exact replica of Archibald ERP line amount calculation.
 * Rounds the full expression to 2 decimals — do NOT round intermediate values.
 */
export function archibaldLineAmount(
  quantity: number,
  unitPrice: number,
  discountPercent: number,
): number {
  return Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/frontend -- --run order-calculations.spec`
Expected: PASS

**Step 5: Commit**

```
feat(calc): add archibaldLineAmount canonical rounding function
```

---

### Task 2: Fix `calculateItemTotals` to use `archibaldLineAmount`

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/order-calculations.ts:21-49`
- Test: `archibald-web-app/frontend/src/utils/order-calculations.spec.ts`

**Step 1: Update `calculateItemTotals`**

Replace lines 21-49:

```typescript
export function calculateItemTotals(
  input: ItemCalculationInput,
): ItemCalculationResult {
  const { unitPrice, quantity, discountType, discountValue = 0 } = input;

  const subtotal = round(unitPrice * quantity);

  let discountPercent = 0;
  let discountAmount = 0;
  if (discountType === "percentage") {
    discountPercent = discountValue;
    discountAmount = round(subtotal * (discountValue / 100));
  } else if (discountType === "amount") {
    discountAmount = Math.min(discountValue, subtotal);
  }

  // Use archibaldLineAmount for percentage discounts (the common case)
  // For amount discounts, fall back to subtraction
  const subtotalAfterDiscount =
    discountType === "percentage"
      ? archibaldLineAmount(quantity, unitPrice, discountPercent)
      : round(subtotal - discountAmount);

  const vat = round(subtotalAfterDiscount * VAT_RATE);
  const total = round(subtotalAfterDiscount + vat);

  return {
    subtotal,
    discount: discountAmount,
    subtotalAfterDiscount,
    vat,
    total,
  };
}
```

**Step 2: Run existing tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run order-calculations.spec`
Expected: PASS (existing values should remain the same for round numbers — verify each)

**Step 3: Commit**

```
refactor(calc): use archibaldLineAmount in calculateItemTotals
```

---

### Task 3: Fix `PendingOrdersPage.tsx` — replace `itemSubtotal` and IIFE recap

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx:11,22-27,1646-1836`

**Step 1: Add import**

At line 11, change:
```typescript
import { calculateShippingCosts } from "../utils/order-calculations";
```
to:
```typescript
import { calculateShippingCosts, archibaldLineAmount } from "../utils/order-calculations";
```

**Step 2: Replace `itemSubtotal` function (lines 22-27)**

```typescript
function itemSubtotal(
  _order: PendingOrder,
  item: { price: number; quantity: number; discount?: number },
): number {
  return archibaldLineAmount(item.quantity, item.price, item.discount || 0);
}
```

**Step 3: Fix the IIFE recap VAT calculation (lines 1667-1675)**

The VAT calculation also needs to use rounded line amounts. Replace the `itemsVAT` reduce block:

```typescript
                        const itemsVAT = order.items.reduce((sum, item) => {
                          const lineAmount = itemSubtotal(order, item);
                          const lineAfterGlobalDiscount = order.discountPercent
                            ? Math.round(lineAmount * (1 - order.discountPercent / 100) * 100) / 100
                            : lineAmount;
                          return (
                            sum + Math.round(lineAfterGlobalDiscount * (item.vat / 100) * 100) / 100
                          );
                        }, 0);
```

**Step 4: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 5: Commit**

```
fix(pending): use archibaldLineAmount for consistent order totals
```

---

### Task 4: Fix `OrderCardNew.tsx` — `recalcLineAmounts`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx:602-608`

**Step 1: Add import**

Add to existing imports from `order-calculations`:
```typescript
import { archibaldLineAmount } from "../utils/order-calculations";
```

(Check if there's already an import from this file and add to it.)

**Step 2: Replace `recalcLineAmounts` (lines 602-608)**

```typescript
function recalcLineAmounts(item: EditItem): EditItem {
  const lineAmount = archibaldLineAmount(item.quantity, item.unitPrice, item.discountPercent);
  const vatAmount = Math.round(lineAmount * (item.vatPercent / 100) * 100) / 100;
  const lineTotalWithVat = Math.round((lineAmount + vatAmount) * 100) / 100;
  return { ...item, lineAmount, vatAmount, lineTotalWithVat };
}
```

**Step 3: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 4: Commit**

```
fix(order-card): use archibaldLineAmount in recalcLineAmounts
```

---

### Task 5: Fix backend `submit-order.ts` — `calculateAmounts` and snapshot

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts:45-59,251,315`

**Step 1: Add `archibaldLineAmount` to submit-order.ts**

Add at top of file (after imports, before `calculateAmounts`):

```typescript
function archibaldLineAmount(quantity: number, unitPrice: number, discountPercent: number): number {
  return Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100;
}
```

Note: this is duplicated from frontend because frontend/backend don't share code. The function is trivial (1 line of math) so duplication is acceptable.

**Step 2: Update `calculateAmounts` (lines 45-59)**

```typescript
function calculateAmounts(
  items: SubmitOrderItem[],
  discountPercent?: number,
): { grossAmount: number; total: number } {
  const grossAmount = items.reduce((sum, item) => {
    return sum + archibaldLineAmount(item.quantity, item.price, item.discount || 0);
  }, 0);

  const total = discountPercent
    ? Math.round(grossAmount * (1 - discountPercent / 100) * 100) / 100
    : grossAmount;

  return { grossAmount, total };
}
```

**Step 3: Update line amount calculation in article insert (line 251)**

Replace line 251:
```typescript
      const lineAmount = item.price * item.quantity * (1 - (item.discount || 0) / 100);
```
with:
```typescript
      const lineAmount = archibaldLineAmount(item.quantity, item.price, item.discount || 0);
```

**Step 4: Update VAT calculation (lines 252-254)**

```typescript
      const vatPercent = item.vat ?? 0;
      const vatAmount = Math.round(lineAmount * vatPercent / 100 * 100) / 100;
      const lineTotalWithVat = Math.round((lineAmount + vatAmount) * 100) / 100;
```

**Step 5: Update snapshot expectedLineAmount (line 315)**

Replace line 315:
```typescript
          expectedLineAmount: item.price * item.quantity * (1 - (item.discount || 0) / 100),
```
with:
```typescript
          expectedLineAmount: archibaldLineAmount(item.quantity, item.price, item.discount || 0),
```

**Step 6: Run type-check and tests**

Run: `npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend -- --run submit-order`
Expected: PASS

**Step 7: Commit**

```
fix(submit-order): use archibaldLineAmount for line and order totals
```

---

### Task 6: Fix backend `edit-order.ts` — align line amount calculation

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/edit-order.ts:93-107`

**Step 1: Add `archibaldLineAmount`**

Add at top of file after imports:

```typescript
function archibaldLineAmount(quantity: number, unitPrice: number, discountPercent: number): number {
  return Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100;
}
```

**Step 2: Verify edit-order uses pre-calculated values**

The edit-order handler receives `updatedItems` with pre-calculated `lineAmount`, `vatAmount`, `lineTotalWithVat` from the frontend. Since Task 4 already fixes `recalcLineAmounts` on the frontend side, the values arriving here will already be correct.

However, lines 101-105 have fallback `?? 0` which means if values are missing, they'd be stored as 0. No change needed here — the fix in Task 4 (frontend) ensures correct values are sent.

**Step 3: Commit (if any change was made)**

```
refactor(edit-order): add archibaldLineAmount for consistency
```

---

### Task 7: Fix `sync-order-articles.ts` — use snapshot discount when available

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-order-articles.ts:38-143`
- Test: `archibald-web-app/backend/src/operations/handlers/sync-order-articles.spec.ts`

**Step 1: Write the failing test**

Add to `sync-order-articles.spec.ts`:

```typescript
test('uses snapshot discount_percent when snapshot exists', async () => {
  const pool = createMockPool();
  // Override: add snapshot query response after order query
  const queryFn = pool.query as ReturnType<typeof vi.fn>;
  queryFn.mockReset();
  queryFn
    // 1st call: SELECT order
    .mockResolvedValueOnce({ rows: [{ id: 'ORD-001', archibald_order_id: '71723' }], rowCount: 1 })
    // 2nd call: SELECT snapshot items
    .mockResolvedValueOnce({
      rows: [
        { article_code: 'ART-01', line_discount_percent: 34.85 },
        { article_code: 'ART-02', line_discount_percent: 15.62 },
      ],
      rowCount: 2,
    })
    // remaining calls: DELETE, INSERT, UPDATE
    .mockResolvedValue({ rows: [], rowCount: 0 });

  const bot = createMockBot();
  const deps = createMockDeps(pool, bot);
  (deps.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue([
    { articleCode: 'ART-01', description: 'Widget', quantity: 5, unitPrice: 8.88, discountPercent: 34.84, lineAmount: 28.93 },
    { articleCode: 'ART-02', description: 'Gadget', quantity: 1, unitPrice: 25.97, discountPercent: 15.63, lineAmount: 21.91 },
  ]);

  await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

  // The INSERT should use snapshot discounts (34.85, 15.62) not PDF discounts (34.84, 15.63)
  const insertCall = queryFn.mock.calls.find(
    (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.order_articles'),
  );
  expect(insertCall).toBeDefined();
  const insertValues = insertCall![1] as unknown[];
  // discount_percent is at index 6 (0-based) for first article, and 6+12=18 for second
  expect(insertValues[6]).toBe(34.85);
  expect(insertValues[18]).toBe(15.62);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run sync-order-articles`
Expected: FAIL (snapshot query not yet implemented)

**Step 3: Implement snapshot cross-reference**

In `sync-order-articles.ts`, after the order fetch (line 57) and before `onProgress(10, ...)`:

```typescript
  // Load snapshot discounts to replace reverse-engineered PDF values
  const { rows: snapshotRows } = await pool.query<{ article_code: string; line_discount_percent: number | null }>(
    `SELECT si.article_code, si.line_discount_percent
     FROM agents.order_verification_snapshot_items si
     JOIN agents.order_verification_snapshots s ON s.id = si.snapshot_id
     WHERE s.order_id = $1 AND s.user_id = $2`,
    [data.orderId, userId],
  );
  const snapshotDiscountMap = new Map<string, number>();
  for (const row of snapshotRows) {
    if (row.line_discount_percent !== null) {
      snapshotDiscountMap.set(row.article_code, row.line_discount_percent);
    }
  }
```

Then in the enrichment loop (line 67-80), after `const vatAmount = ...` and before `return`:

```typescript
    parsedArticles.map(async (article) => {
      const vatPercent = await getProductVat(article.articleCode);
      const vatAmount = parseFloat((article.lineAmount * vatPercent / 100).toFixed(2));
      const lineTotalWithVat = parseFloat((article.lineAmount + vatAmount).toFixed(2));

      // Use original discount from snapshot if available (PDF reverse-engineering is imprecise)
      const discountPercent = snapshotDiscountMap.get(article.articleCode) ?? article.discountPercent;

      return {
        ...article,
        discountPercent,
        vatPercent,
        vatAmount,
        lineTotalWithVat,
      };
    }),
```

**Step 4: Run tests**

Run: `npm test --prefix archibald-web-app/backend -- --run sync-order-articles`
Expected: PASS

**Step 5: Commit**

```
fix(sync): use snapshot discount instead of reverse-engineered PDF value
```

---

### Task 8: Verify `arca-totals.ts` alignment

**Files:**
- Read: `archibald-web-app/frontend/src/utils/arca-totals.ts:116-123`

**Step 1: Verify `calculateRowTotal` already matches**

The existing `calculateRowTotal` uses:
```typescript
return Math.round(prezzoun * quantita * factor * 100) / 100;
```

This is equivalent to `archibaldLineAmount` when `factor = (1 - discountPercent/100)`. No change needed — just verify.

**Step 2: No commit needed**

---

### Task 9: Run full test suites and type-checks

**Step 1: Frontend type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 2: Backend type-check**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: PASS

**Step 3: Frontend tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run`
Expected: PASS

**Step 4: Backend tests**

Run: `npm test --prefix archibald-web-app/backend -- --run`
Expected: PASS

**Step 5: Commit (if any test fix needed)**

---

### Task 10: Final commit

**Step 1: Commit all changes**

```
fix(totals): unify order total calculations to match Archibald ERP rounding

Three sources of rounding discrepancies fixed:
- PendingOrdersPage: itemSubtotal now uses archibaldLineAmount (round per-line)
- submit-order: calculateAmounts now rounds each line before summing
- sync-order-articles: uses snapshot discount instead of imprecise PDF reverse-engineering
- OrderCardNew: recalcLineAmounts rounds lineAmount before computing VAT
```

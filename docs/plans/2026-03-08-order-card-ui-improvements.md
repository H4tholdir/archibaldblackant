# Order Card UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix quick filters, add exception filter, revert tracking to dot-bar with dates+days, redesign card header layout, rename download buttons, change delivered color, fix financial tab background.

**Architecture:** 7 independent changes to frontend. Tasks ordered by dependency: filters first (affect counts), then visual changes.

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library

---

### Task 1: Fix quick filters to match badge category + add exception filter

**Files:**
- Modify: `frontend/src/pages/OrderHistory.tsx:37-46` (QuickFilterType)
- Modify: `frontend/src/pages/OrderHistory.tsx:860-918` (applyQuickFilters)
- Modify: `frontend/src/pages/OrderHistory.tsx:1035-1119` (quickFilterDefs)

**Step 1: Add "exception" to QuickFilterType**

```typescript
type QuickFilterType =
  | "requiresAttention"
  | "editable"
  | "backorder"
  | "inTransit"
  | "delivered"
  | "exception"
  | "invoiced"
  | "overdue"
  | "paid"
  | "stacked";
```

**Step 2: Rewrite all filter cases to use getOrderStatus().category**

Import getOrderStatus at top of file. Replace the switch cases:

```typescript
case "inTransit":
  matches = getOrderStatus(order).category === 'in-transit';
  break;
case "delivered":
  matches = getOrderStatus(order).category === 'delivered';
  break;
case "exception":
  matches = getOrderStatus(order).category === 'exception';
  break;
case "invoiced":
  matches = getOrderStatus(order).category === 'invoiced';
  break;
case "paid":
  matches = getOrderStatus(order).category === 'paid';
  break;
case "overdue":
  matches = getOrderStatus(order).category === 'overdue';
  break;
```

**Step 3: Update quickFilterDefs counts to use same logic**

```typescript
// inTransit count
count: ordersForCounts.filter((o) => getOrderStatus(o).category === 'in-transit').length,

// delivered count
count: ordersForCounts.filter((o) => getOrderStatus(o).category === 'delivered').length,

// Add exception filter def (after inTransit, before delivered)
{
  id: "exception",
  label: "⚠️ Eccezione corriere",
  color: "#E65100",
  bgColor: "#FFF3E0",
  count: ordersForCounts.filter((o) => getOrderStatus(o).category === 'exception').length,
},

// invoiced count
count: ordersForCounts.filter((o) => getOrderStatus(o).category === 'invoiced').length,

// paid count
count: ordersForCounts.filter((o) => getOrderStatus(o).category === 'paid').length,

// overdue count
count: ordersForCounts.filter((o) => getOrderStatus(o).category === 'overdue').length,
```

**Step 4: Run type-check + tests**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Run: `npm test --prefix archibald-web-app/frontend -- --run`

**Step 5: Commit**

```
feat(frontend): fix quick filters to match badge categories, add exception filter
```

---

### Task 2: Revert tracking to dot-bar (Approach A) with dates + day counter

**Files:**
- Rewrite: `frontend/src/components/TrackingProgressBar.tsx`
- Rewrite: `frontend/src/components/TrackingProgressBar.spec.tsx`
- Modify: `frontend/src/components/OrderCardNew.tsx` (update import + usage)

**Step 1: Rewrite TrackingProgressBar.tsx**

Keep `ScanEvent` type export. Restore the 5-step dot bar with these additions:
- Show abbreviated date (e.g. "6 mar") under each **completed** step
- Show date+time under the **active** step
- Add day counter on the bottom-right: "N° giorno" or "consegnato in N giorni"
- Keep origin/destination labels

New exports:
- `ScanEvent` (type, unchanged)
- `getTrackingSteps(scanEvents, destCountryCode)` (same logic as original but step type includes `date` field)
- `TrackingProgressBar` component with props: `{ steps, borderColor, origin, destination, dayCount, delivered }`
- `getDayCount(scanEvents)` — returns number of days between first and last event (or today)

Updated TrackingStep type:
```typescript
type TrackingStep = {
  label: string;
  detail: string;
  date: string;     // abbreviated date "6 mar" or "" if not reached
  completed: boolean;
  active: boolean;
};
```

For date formatting use ITALIAN_MONTHS: gen, feb, mar, apr, mag, giu, lug, ago, set, ott, nov, dic.

The component renders:
- Row 1: origin (left) ... destination (right)
- Row 2: 5 dots with connecting lines
- Row 3: date labels under each completed dot
- Row 4 (center): active step detail (location + time)
- Row 5 (right-aligned): "N° giorno" or "consegnato in N giorni"

**Step 2: Update OrderCardNew.tsx**

Replace `TrackingStrip` import and usage with restored `TrackingProgressBar`:

```tsx
import { TrackingProgressBar, getTrackingSteps, getDayCount } from "./TrackingProgressBar";
```

Usage:
```tsx
{order.trackingStatus && order.trackingEvents && order.trackingEvents.length > 0 && !expanded && (() => {
  const destCountry = (order.trackingDestination || "").split(", ").pop() || "IT";
  const steps = getTrackingSteps(order.trackingEvents, destCountry);
  const dayCount = getDayCount(order.trackingEvents);
  const isDelivered = order.trackingStatus === 'delivered';
  return (
    <TrackingProgressBar
      steps={steps}
      borderColor={orderStatusStyle.borderColor}
      origin={order.trackingOrigin || ""}
      destination={order.trackingDestination || ""}
      dayCount={dayCount}
      delivered={isDelivered}
    />
  );
})()}
```

**Step 3: Run tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run src/components/TrackingProgressBar.spec.tsx`

**Step 4: Commit**

```
feat(frontend): restore dot-bar tracking with dates and day counter
```

---

### Task 3: Reorder card header layout

**Files:**
- Modify: `frontend/src/components/OrderCardNew.tsx:3790-4058`

**New order in collapsed header:**

1. **Row 1:** Customer name (left) + Status badge (right)
2. **Row 2:** Order number + date (immediately after name)
3. **Row 3:** Tracking dot-bar (if tracking exists)
4. **Row 4:** Total amounts — redesigned:
   - Large: total senza IVA (e.g. "454,60 €")
   - Smaller below: total con IVA (e.g. "530,00 € (IVA incl.)")
   - If invoice: show scadenza info inline: "Scad: 30 apr 2026 • 54 giorni rimanenti" or "Scad: 1 gen 2026 • ⚠️ 67 giorni fuori scadenza"
   - Balance badge stays but integrated: "Saldo: 530,00 €" (red if unpaid, green if paid)
5. **Row 5:** Download buttons

For overdue display, make it clearer:
- If `daysPastDue < 0`: show "⚠️ {abs(days)} giorni fuori scadenza" in **red** (#d32f2f)
- If `daysPastDue > 0`: show "{days} giorni rimanenti" in **green** (#2e7d32)

**Step 1: Rearrange the sections**

Move the `{/* Order Number + Date */}` div (lines 3896-3916) to be right after the customer name row (after line 3893, before tracking).

Move the tracking bar to after order number.

Redesign the total amount section to show:
- Totale ordine (senza IVA) grande
- Sotto: totale con IVA piu piccolo
- Invoice info (saldo + scadenza + giorni) su una riga separata, con wording piu chiaro per giorni fuori scadenza

**Step 2: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`

**Step 3: Commit**

```
feat(frontend): redesign card header layout with clearer totals and overdue display
```

---

### Task 4: Add "Scarica" labels to download buttons

**Files:**
- Modify: `frontend/src/components/OrderCardNew.tsx:4160,4260-4262`

**Step 1: Update button text**

DDT button (line 4160): Change `"📄 DDT"` to `"📄 Scarica DDT"`
DDT loading (line 4160): Change `"⏳ DDT..."` to `"⏳ Scaricando DDT..."`

Invoice button (line 4260-4262): Change `"📑 Fattura"` to `"📑 Scarica Fattura"` and `"📑 NC"` to `"📑 Scarica NC"`
Invoice loading: Change `"⏳ Fattura..."` to `"⏳ Scaricando..."` and `"⏳ NC..."` to `"⏳ Scaricando..."`

**Step 2: Commit**

```
fix(frontend): add "Scarica" label to DDT and invoice download buttons
```

---

### Task 5: Change delivered card color to #f286ad

**Files:**
- Modify: `frontend/src/utils/orderStatus.ts:78-84`

**Step 1: Update delivered style**

Change:
```typescript
delivered: {
  category: "delivered",
  label: "Consegnato",
  description: "Consegna confermata con data/ora",
  borderColor: "#0277BD",
  backgroundColor: "#B3E5FC",
},
```
To:
```typescript
delivered: {
  category: "delivered",
  label: "Consegnato",
  description: "Consegna confermata con data/ora",
  borderColor: "#f286ad",
  backgroundColor: "#fce4ec",
},
```

**Step 2: Update test assertions for delivered colors**

In `orderStatus.spec.ts`, update any tests checking delivered borderColor from `"#0277BD"` to `"#f286ad"` and backgroundColor from `"#B3E5FC"` to `"#fce4ec"`.

**Step 3: Run tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run src/utils/orderStatus.spec.ts`

**Step 4: Commit**

```
fix(frontend): change delivered order card color to pink #f286ad
```

---

### Task 6: Fix financial tab background

**Files:**
- Modify: `frontend/src/components/OrderCardNew.tsx:2959-2965`

**Step 1: Add light background to invoice detail grid**

The grid section at line 2959 (`<div style={{ padding: "16px", display: "grid" ...`) has no background. The header above it (line 2910) has `backgroundColor: "#f8f9fa"`. Add the same light background:

```typescript
<div
  style={{
    padding: "16px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "14px",
    backgroundColor: "#f8f9fa",
  }}
>
```

**Step 2: Commit**

```
fix(frontend): add light background to financial tab invoice detail grid
```

---

### Task 7: Dim stacked cards when another card is expanded

**Files:**
- Modify: `frontend/src/pages/OrderHistory.tsx:2164-2201`

**Step 1: Wrap OrderCardStack in a dimming container**

The single-card rendering (line 2214+) already has dimming logic:
```typescript
const someCardExpanded = expandedOrderId !== null && !selectionMode;
const isDimmed = someCardExpanded && !isExpanded;
```

The stack rendering (line 2164-2201) has NO dimming. Add the same logic by wrapping `OrderCardStack` in a div with opacity dimming.

The stack should be dimmed if: `expandedOrderId !== null && !selectionMode && !stack.orderIds.includes(expandedOrderId)`

That is: if some card is expanded and the expanded card is NOT one of the orders in this stack, dim the stack.

```tsx
if (stack) {
  // ...
  if (stackOrders.length > 1) {
    renderedStackIds.add(stack.stackId);
    const stackContainsExpanded = expandedOrderId !== null && stack.orderIds.includes(expandedOrderId);
    const isStackDimmed = expandedOrderId !== null && !selectionMode && !stackContainsExpanded;
    return (
      <div
        key={`stack-${stack.stackId}`}
        style={{
          transition: "opacity 0.3s ease",
          ...(isStackDimmed ? { opacity: 0.3, pointerEvents: "none" as const } : {}),
        }}
      >
        <OrderCardStack ... />
      </div>
    );
  }
}
```

Remember to remove `key` from `OrderCardStack` since it moves to the wrapper div.

**Step 2: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`

**Step 3: Commit**

```
fix(frontend): dim stacked cards when another order card is expanded
```

---

### Task 8: Final verification

**Step 1: Run full frontend test suite**

Run: `npm test --prefix archibald-web-app/frontend -- --run`
Expected: ALL pass

**Step 2: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 3: Push**

```
git push origin master
```

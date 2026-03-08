# Tracking UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign tracking UI with compact strip, Italian translations, updated status hierarchy, and quick filters.

**Architecture:** 5 independent changes to frontend components: (1) rewrite TrackingProgressBar as compact strip, (2) add EN->IT translation map in TrackingTimeline, (3) remove Tracking button from OrderCardNew, (4) reorder getOrderStatus priority, (5) update quick filter logic. Each change is self-contained.

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library

---

### Task 1: Reorder status hierarchy in orderStatus.ts

**Files:**
- Modify: `frontend/src/utils/orderStatus.ts:183-251`
- Modify: `frontend/src/utils/orderStatus.spec.ts`

**Step 1: Update failing tests for new hierarchy**

In `orderStatus.spec.ts`, add test that verifies tracking status overrides invoiced:

```typescript
test("returns in-transit when order is invoiced but tracking says in_transit", () => {
  const order: Partial<Order> = {
    id: "invoiced-but-transit",
    customerName: "Test",
    date: "2026-03-01",
    total: "500.00",
    invoiceNumber: "FAT/2026/001",
    trackingStatus: "in_transit",
  };
  const result = getOrderStatus(order as Order);
  expect(result.category).toBe("in-transit");
});

test("returns delivered when order is invoiced but tracking confirms delivery", () => {
  const order: Partial<Order> = {
    id: "invoiced-but-delivered",
    customerName: "Test",
    date: "2026-03-01",
    total: "500.00",
    invoiceNumber: "FAT/2026/001",
    deliveryConfirmedAt: "2026-03-05T10:00:00Z",
  };
  const result = getOrderStatus(order as Order);
  expect(result.category).toBe("delivered");
});

test("returns exception when order is invoiced but tracking has exception", () => {
  const order: Partial<Order> = {
    id: "invoiced-but-exception",
    customerName: "Test",
    date: "2026-03-01",
    total: "500.00",
    invoiceNumber: "FAT/2026/001",
    trackingStatus: "exception",
  };
  const result = getOrderStatus(order as Order);
  expect(result.category).toBe("exception");
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test --prefix archibald-web-app/frontend -- --run src/utils/orderStatus.spec.ts`
Expected: 3 new tests FAIL (they return "invoiced" instead of tracking status)

**Step 3: Reorder getOrderStatus**

In `orderStatus.ts`, change `getOrderStatus()` to:

```typescript
export function getOrderStatus(order: Order): OrderStatusStyle {
  // 1. Pagato (invariato)
  if (order.invoiceNumber && isInvoicePaid(order)) {
    return ORDER_STATUS_STYLES.paid;
  }
  // 2. Pagamento scaduto (invariato)
  if (isOverdue(order)) {
    return ORDER_STATUS_STYLES.overdue;
  }
  // 3. Eccezione corriere (SALE sopra fatturato)
  if (order.trackingStatus === 'exception') {
    return ORDER_STATUS_STYLES.exception;
  }
  // 4. In transito da tracking API (SALE sopra fatturato)
  if (order.trackingStatus === 'out_for_delivery' || order.trackingStatus === 'in_transit') {
    return ORDER_STATUS_STYLES["in-transit"];
  }
  // 5. Consegnato da tracking API (SALE sopra fatturato)
  if (order.deliveryConfirmedAt) {
    return ORDER_STATUS_STYLES.delivered;
  }
  // 6. Fatturato (SCENDE)
  if (order.invoiceNumber) {
    return ORDER_STATUS_STYLES.invoiced;
  }
  // 7-10. Fallback (invariati)
  if (isLikelyDelivered(order)) {
    return ORDER_STATUS_STYLES.delivered;
  }
  if (isInTransit(order)) {
    return ORDER_STATUS_STYLES["in-transit"];
  }
  // ... rest unchanged (blocked, pending-approval, in-processing, backorder, on-archibald)
}
```

**Step 4: Run tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run src/utils/orderStatus.spec.ts`
Expected: ALL pass. Some existing tests may need updating if they expected "invoiced" for orders with tracking data.

**Step 5: Commit**

```
feat(frontend): tracking status overrides invoiced in order hierarchy
```

---

### Task 2: Update quick filters in OrderHistory.tsx

**Files:**
- Modify: `frontend/src/pages/OrderHistory.tsx:885-891` (applyQuickFilters switch)
- Modify: `frontend/src/pages/OrderHistory.tsx:1068-1079` (quickFilterDefs counts)

**Step 1: Update filter logic**

In `applyQuickFilters`, update the `inTransit` and `delivered` cases:

```typescript
case "inTransit":
  matches = order.trackingStatus === 'in_transit'
    || order.trackingStatus === 'out_for_delivery'
    || isInTransit(order);
  break;

case "delivered":
  matches = !!order.deliveryConfirmedAt || isLikelyDelivered(order);
  break;
```

**Step 2: Update count functions to match**

In `quickFilterDefs`, update the count lambdas to use the same logic:

```typescript
// inTransit count
count: ordersForCounts.filter((o) =>
  o.trackingStatus === 'in_transit'
  || o.trackingStatus === 'out_for_delivery'
  || isInTransit(o)
).length,

// delivered count
count: ordersForCounts.filter((o) =>
  !!o.deliveryConfirmedAt || isLikelyDelivered(o)
).length,
```

**Step 3: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 4: Commit**

```
feat(frontend): update quick filters to use real tracking data
```

---

### Task 3: Rewrite TrackingProgressBar as compact strip

**Files:**
- Rewrite: `frontend/src/components/TrackingProgressBar.tsx`
- Rewrite: `frontend/src/components/TrackingProgressBar.spec.tsx`
- Modify: `frontend/src/components/OrderCardNew.tsx:3891-3901` (update props)

**Step 1: Write new tests**

New spec tests for the strip component:

- `getStripInfo` returns correct icon, label, detail, days for in-transit
- `getStripInfo` returns correct data for delivered (with "consegnato in N giorni")
- `getStripInfo` returns correct data for pickup-only
- `getStripInfo` returns correct data for exception
- `getProgressPercent` returns correct % for each statusCD
- `TrackingStrip` renders all visual elements

**Step 2: Implement new TrackingProgressBar**

Export `TrackingStrip` component with props:
```typescript
type TrackingStripProps = {
  order: Order;  // needs trackingEvents, trackingOrigin, trackingDestination, deliveryConfirmedAt, deliverySignedBy, trackingEstimatedDelivery, trackingStatus
  borderColor: string;
};
```

Key functions:
- `getProgressPercent(events, destCountry)`: returns 0-100 based on highest statusCD reached
- `getDayCount(events)`: calculates days between first and last event (or today)
- `getStripInfo(order)`: returns `{ icon, label, detail, rightInfo, dayLabel }`
- `TrackingStrip`: renders 2-row strip with progress bar

**Step 3: Update OrderCardNew.tsx integration**

Replace the old `TrackingProgressBar` call at line 3891-3901 with the new `TrackingStrip`:

```tsx
{order.trackingStatus && order.trackingEvents && order.trackingEvents.length > 0 && !expanded && (
  <TrackingStrip order={order} borderColor={orderStatusStyle.borderColor} />
)}
```

**Step 4: Run tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run src/components/TrackingProgressBar.spec.tsx`
Expected: ALL pass

**Step 5: Commit**

```
feat(frontend): replace tracking dots with compact info strip
```

---

### Task 4: Add Italian translations to TrackingTimeline

**Files:**
- Modify: `frontend/src/components/TrackingTimeline.tsx`
- Modify: `frontend/src/components/TrackingTimeline.spec.tsx`

**Step 1: Write test for translation**

```typescript
test("translates English event descriptions to Italian", () => {
  const order: Order = {
    ...baseOrder,
    trackingEvents: [
      { date: "2026-03-07", time: "14:00:00", gmtOffset: "+01:00", status: "On the way", statusCD: "IT", scanLocation: "Bologna, IT", delivered: false, exception: false },
      { date: "2026-03-06", time: "10:00:00", gmtOffset: "+01:00", status: "Picked up", statusCD: "PU", scanLocation: "Verona, IT", delivered: false, exception: false },
    ],
  };
  render(<TrackingTimeline order={order} borderColor="#4caf50" />);
  expect(screen.getByText("In viaggio")).toBeTruthy();
  expect(screen.getByText("Ritirato")).toBeTruthy();
});
```

**Step 2: Add translation map and apply in render**

```typescript
const EVENT_TRANSLATIONS: Record<string, string> = {
  "Picked up": "Ritirato",
  "Shipment information sent to FedEx": "Informazioni spedizione inviate a FedEx",
  "Left FedEx origin facility": "Partito dal centro FedEx di origine",
  "Departed FedEx hub": "Partito dall'hub FedEx",
  "Departed FedEx location": "Partito dal centro FedEx",
  "In transit": "In transito",
  "On the way": "In viaggio",
  "Arrived at FedEx hub": "Arrivato all'hub FedEx",
  "Arrived at FedEx location": "Arrivato al centro FedEx",
  "At local FedEx facility": "Presso centro FedEx locale",
  "Out for delivery": "In consegna",
  "On FedEx vehicle for delivery": "Sul veicolo FedEx per la consegna",
  "Delivered": "Consegnato",
  "Delivery exception": "Eccezione di consegna",
  "Shipment arriving On-Time": "Spedizione in arrivo nei tempi previsti",
  "Customer not available or business closed": "Destinatario non disponibile",
  "International shipment release - Import": "Spedizione internazionale sdoganata",
  "Clearance in progress": "Sdoganamento in corso",
  "Package available for clearance": "Pacco disponibile per lo sdoganamento",
  "Clearance delay - Loss report": "Ritardo sdoganamento",
};

function translateStatus(status: string): string {
  return EVENT_TRANSLATIONS[status] ?? status;
}
```

Apply `translateStatus(ev.status)` in the timeline event rendering.

**Step 3: Run tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run src/components/TrackingTimeline.spec.tsx`
Expected: ALL pass

**Step 4: Commit**

```
feat(frontend): translate tracking events from English to Italian
```

---

### Task 5: Remove Tracking button from OrderCardNew

**Files:**
- Modify: `frontend/src/components/OrderCardNew.tsx:4088-4122`

**Step 1: Remove the Tracking button block**

Delete lines 4088-4122 (the `{/* Tracking Button */}` block with the `🚚 Tracking` button).

**Step 2: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 3: Commit**

```
fix(frontend): remove redundant tracking button from order header
```

---

### Task 6: Final verification

**Step 1: Run full frontend test suite**

Run: `npm test --prefix archibald-web-app/frontend -- --run`
Expected: ALL pass

**Step 2: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 3: Final commit and push**

```
git push origin master
```

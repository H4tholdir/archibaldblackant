# Fresis Single Order Discounts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply Fresis dealer discounts (list price + per-line discount) when submitting a single Fresis sub-client order, not only during merge.

**Architecture:** Extract a pure function `applyFresisLineDiscounts` in `order-merge.ts` that transforms items by replacing price with `originalListPrice` and discount with the Fresis dealer discount. Use it in `handleSubmitOrders` (PendingOrdersPage) for single Fresis sub-client orders, after archiving to fresis history.

**Tech Stack:** React 19, TypeScript, Vitest

---

### Task 1: Add `applyFresisLineDiscounts` pure function

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/order-merge.ts`
- Test: `archibald-web-app/frontend/src/utils/order-merge.spec.ts`

**Step 1: Write failing tests for `applyFresisLineDiscounts`**

Add these tests to `order-merge.spec.ts` inside a new `describe("applyFresisLineDiscounts", ...)`:

```ts
import { applyFresisLineDiscounts } from "./order-merge";

describe("applyFresisLineDiscounts", () => {
  test("replaces price with originalListPrice when available", () => {
    const items = [makeItem({ articleCode: "A1", price: 8, originalListPrice: 10 })];
    const result = applyFresisLineDiscounts(items, emptyMap);

    expect(result[0].price).toBe(10);
  });

  test("keeps price unchanged when originalListPrice is undefined", () => {
    const items = [makeItem({ articleCode: "A1", price: 8 })];
    const result = applyFresisLineDiscounts(items, emptyMap);

    expect(result[0].price).toBe(8);
  });

  test("applies discount from discountMap by articleId", () => {
    const discountMap = new Map([["V1", 45]]);
    const items = [makeItem({ articleCode: "A1", articleId: "V1", discount: 10 })];
    const result = applyFresisLineDiscounts(items, discountMap);

    expect(result[0].discount).toBe(45);
  });

  test("applies discount from discountMap by articleCode when articleId not found", () => {
    const discountMap = new Map([["A1", 50]]);
    const items = [makeItem({ articleCode: "A1", discount: 10 })];
    const result = applyFresisLineDiscounts(items, discountMap);

    expect(result[0].discount).toBe(50);
  });

  test("prefers articleId over articleCode in discountMap", () => {
    const discountMap = new Map([["V1", 45], ["A1", 50]]);
    const items = [makeItem({ articleCode: "A1", articleId: "V1", discount: 10 })];
    const result = applyFresisLineDiscounts(items, discountMap);

    expect(result[0].discount).toBe(45);
  });

  test("falls back to FRESIS_DEFAULT_DISCOUNT when article not in map", () => {
    const items = [makeItem({ articleCode: "UNKNOWN", discount: 10 })];
    const result = applyFresisLineDiscounts(items, emptyMap);

    expect(result[0].discount).toBe(FRESIS_DEFAULT_DISCOUNT);
  });

  test("preserves all other item fields", () => {
    const items = [makeItem({
      articleCode: "A1",
      articleId: "V1",
      productName: "Prodotto",
      description: "Desc",
      quantity: 5,
      price: 8,
      vat: 22,
      originalListPrice: 10,
      warehouseQuantity: 2,
      warehouseSources: [{ warehouseItemId: 1, boxName: "BOX1", quantity: 2 }],
    })];
    const discountMap = new Map([["V1", 45]]);
    const result = applyFresisLineDiscounts(items, discountMap);

    expect(result[0]).toEqual({
      articleCode: "A1",
      articleId: "V1",
      productName: "Prodotto",
      description: "Desc",
      quantity: 5,
      price: 10,
      vat: 22,
      discount: 45,
      originalListPrice: 10,
      warehouseQuantity: 2,
      warehouseSources: [{ warehouseItemId: 1, boxName: "BOX1", quantity: 2 }],
    });
  });

  test("does not mutate original items", () => {
    const items = [makeItem({ articleCode: "A1", price: 8, originalListPrice: 10, discount: 5 })];
    const originalPrice = items[0].price;
    const originalDiscount = items[0].discount;
    applyFresisLineDiscounts(items, emptyMap);

    expect(items[0].price).toBe(originalPrice);
    expect(items[0].discount).toBe(originalDiscount);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test --prefix archibald-web-app/frontend -- --run src/utils/order-merge.spec.ts`
Expected: FAIL with "applyFresisLineDiscounts is not a function" or similar import error.

**Step 3: Implement `applyFresisLineDiscounts`**

Add to `order-merge.ts` (after the existing imports, before `mergeFresisPendingOrders`):

```ts
export function applyFresisLineDiscounts(
  items: PendingOrderItem[],
  discountMap: Map<string, number>,
): PendingOrderItem[] {
  return items.map((item) => {
    const lineDiscount =
      discountMap.get(item.articleId ?? "") ??
      discountMap.get(item.articleCode) ??
      FRESIS_DEFAULT_DISCOUNT;

    return {
      ...item,
      price: item.originalListPrice ?? item.price,
      discount: lineDiscount,
    };
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test --prefix archibald-web-app/frontend -- --run src/utils/order-merge.spec.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/utils/order-merge.ts archibald-web-app/frontend/src/utils/order-merge.spec.ts
git commit -m "feat(fresis): add applyFresisLineDiscounts pure function"
```

---

### Task 2: Apply Fresis discounts in `handleSubmitOrders` for single sub-client orders

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx:114-182`

**Step 1: Import `applyFresisLineDiscounts`**

Add to existing imports in `PendingOrdersPage.tsx`:

```ts
import { applyFresisLineDiscounts } from "../utils/order-merge";
```

Note: `getFresisDiscounts` (line 6) and `archiveOrders` (line 7) and `isFresis` (line 15) are already imported.

**Step 2: Modify `handleSubmitOrders` to detect and transform Fresis sub-client orders**

Replace the current `handleSubmitOrders` body (lines 114-182) with:

```ts
  const handleSubmitOrders = async () => {
    if (selectedOrderIds.size === 0) return;

    setSubmitting(true);

    try {
      if (!localStorage.getItem("archibald_jwt")) {
        throw new Error("Token non trovato, rifare login");
      }

      const selectedOrders = orders.filter((o) => selectedOrderIds.has(o.id!));

      // Pre-load Fresis discounts if any selected order is a Fresis sub-client order
      const hasFresisSubclient = selectedOrders.some(
        (o) => isFresis({ id: o.customerId }) && o.subClientCodice,
      );
      let fresisDiscountMap: Map<string, number> | null = null;
      if (hasFresisSubclient) {
        const allDiscounts = await getFresisDiscounts();
        fresisDiscountMap = new Map<string, number>();
        for (const d of allDiscounts) {
          fresisDiscountMap.set(d.id, d.discountPercent);
          fresisDiscountMap.set(d.articleCode, d.discountPercent);
        }
      }

      const results = await Promise.all(
        selectedOrders.map(async (order) => {
          const isFresisSubclient =
            isFresis({ id: order.customerId }) && !!order.subClientCodice;

          // Archive Fresis sub-client orders to history before transforming
          if (isFresisSubclient) {
            await archiveOrders([order]);
          }

          // Transform items for Fresis sub-client: list price + dealer discounts
          const items = isFresisSubclient && fresisDiscountMap
            ? applyFresisLineDiscounts(order.items, fresisDiscountMap)
            : order.items;

          return enqueueOperation('submit-order', {
            pendingOrderId: order.id,
            customerId: order.customerId,
            customerName: order.customerName,
            items: items.map((item) => ({
              articleCode: item.articleCode,
              productName: item.productName,
              description: item.description,
              quantity: item.quantity,
              price: item.price,
              discount: item.discount,
              vat: item.vat,
              warehouseQuantity: item.warehouseQuantity || 0,
              warehouseSources: item.warehouseSources || [],
            })),
            discountPercent: isFresisSubclient ? undefined : order.discountPercent,
            targetTotalWithVAT: isFresisSubclient ? undefined : order.targetTotalWithVAT,
          });
        }),
      );
      const jobIds = results.map((r) => r.jobId);

      const selectedOrders2 = orders.filter((o) => selectedOrderIds.has(o.id!));
      trackJobs(
        selectedOrders2.map((order, i) => ({
          orderId: order.id!,
          jobId: jobIds[i],
        })),
      );

      for (const orderId of selectedOrderIds) {
        const order = orders.find((o) => o.id === orderId);
        if (order) {
          await savePendingOrder({
            ...order,
            status: "syncing",
            updatedAt: new Date().toISOString(),
            needsSync: true,
          });
        }
      }

      toastService.success(
        `Ordini inviati al bot. Job IDs: ${jobIds.join(", ")}`,
      );

      await refetch();
      setSelectedOrderIds(new Set());
    } catch (error) {
      console.error("[PendingOrdersPage] Submission failed:", error);
      toastService.error("Errore durante l'invio degli ordini. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };
```

Key changes:
- Detects Fresis sub-client orders via `isFresis({ id: order.customerId }) && order.subClientCodice`
- Pre-loads Fresis discounts once (not per order)
- Archives each Fresis sub-client order to history before submitting
- Transforms items with `applyFresisLineDiscounts` (list price + dealer discount)
- Clears `discountPercent` and `targetTotalWithVAT` for Fresis orders (those were for the sub-client quote)

**Step 3: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS with no errors

**Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "feat(fresis): apply dealer discounts on single sub-client order submit"
```

---

### Task 3: Add integration test for Fresis sub-client submit flow

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.spec.tsx`

**Step 1: Add test for Fresis sub-client order submission**

Add a new test to `PendingOrdersPage.spec.tsx`:

```ts
import { isFresis } from "../utils/fresis-constants";
import { getFresisDiscounts } from "../api/fresis-discounts";
import { archiveOrders } from "../api/fresis-history";

// ... inside describe("PendingOrdersPage", () => { ...

  test("applies Fresis dealer discounts when submitting a sub-client order", async () => {
    const fresisOrder: PendingOrder = {
      id: "fresis-order-001",
      customerId: "55.261",
      customerName: "Fresis Soc Cooperativa",
      subClientCodice: "12345",
      subClientName: "Bar Roma",
      items: [
        {
          articleCode: "ART100",
          articleId: "V100",
          productName: "Prodotto Test",
          quantity: 10,
          price: 8,
          vat: 22,
          discount: 15,
          originalListPrice: 10,
        },
      ],
      discountPercent: 5,
      targetTotalWithVAT: 100,
      createdAt: "2026-03-05T10:00:00Z",
      updatedAt: "2026-03-05T10:00:00Z",
      status: "pending",
      retryCount: 0,
      deviceId: "test-device-001",
      needsSync: false,
    };

    mockPendingOrders = [fresisOrder];
    vi.mocked(isFresis).mockImplementation((c) => c?.id === "55.261");
    vi.mocked(getFresisDiscounts).mockResolvedValue([
      { id: "V100", articleCode: "ART100", discountPercent: 45, kpPriceUnit: 0 },
    ]);
    vi.mocked(archiveOrders).mockResolvedValue([]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: "job-fresis-001" }),
    } as Response);
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("test-jwt-token");

    render(<PendingOrdersPage />);

    // Select the order
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // first order checkbox

    // Submit
    const submitButton = screen.getByRole("button", {
      name: /Invia Ordini Selezionati/i,
    });
    fireEvent.click(submitButton);

    // Verify archiveOrders was called with original order
    await waitFor(() => {
      expect(archiveOrders).toHaveBeenCalledWith([fresisOrder]);
    });

    // Verify enqueue was called with transformed prices
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/operations/enqueue",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"price":10'), // originalListPrice, not 8
        }),
      );
    });

    // Verify discount was transformed
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/operations/enqueue",
        expect.objectContaining({
          body: expect.stringContaining('"discount":45'), // Fresis discount, not 15
        }),
      );
    });
  });
```

**Step 2: Run tests to verify they pass**

Run: `npm test --prefix archibald-web-app/frontend -- --run src/pages/PendingOrdersPage.spec.tsx`
Expected: ALL PASS

**Step 3: Run full test suite**

Run: `npm test --prefix archibald-web-app/frontend`
Expected: ALL PASS (except known pre-existing failures in customers.service.spec.ts and products.service.spec.ts)

**Step 4: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS

**Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.spec.tsx
git commit -m "test(fresis): add integration test for single sub-client order submit"
```

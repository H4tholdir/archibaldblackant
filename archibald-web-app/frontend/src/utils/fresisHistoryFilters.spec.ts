import { describe, expect, test } from "vitest";
import type { FresisHistoryOrder, PendingOrderItem } from "../db/schema";
import {
  getDateRangeForPreset,
  filterByDateRange,
  filterBySubClient,
  matchesFresisGlobalSearch,
  computeOrderTotals,
  extractUniqueSubClients,
  groupFresisOrdersByPeriod,
} from "./fresisHistoryFilters";

function createFresisOrder(
  overrides: Partial<FresisHistoryOrder> = {},
): FresisHistoryOrder {
  return {
    id: "test-1",
    originalPendingOrderId: "pending-1",
    subClientCodice: "SC001",
    subClientName: "Test SubClient",
    subClientData: { codice: "SC001", ragioneSociale: "Test SubClient" },
    customerId: "cust-1",
    customerName: "Test Customer",
    items: [
      {
        articleCode: "ART001",
        productName: "Prodotto A",
        description: "Desc A",
        quantity: 10,
        price: 5.0,
        vat: 22,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createItem(
  overrides: Partial<PendingOrderItem> = {},
): PendingOrderItem {
  return {
    articleCode: "ART001",
    quantity: 10,
    price: 5.0,
    vat: 22,
    ...overrides,
  };
}

describe("getDateRangeForPreset", () => {
  const ref = new Date(2025, 5, 18); // 2025-06-18, Wednesday

  test("returns today range for 'today'", () => {
    expect(getDateRangeForPreset("today", ref)).toEqual({
      from: "2025-06-18",
      to: "2025-06-18",
    });
  });

  test("returns monday-today for 'thisWeek'", () => {
    expect(getDateRangeForPreset("thisWeek", ref)).toEqual({
      from: "2025-06-16",
      to: "2025-06-18",
    });
  });

  test("returns first of month to today for 'thisMonth'", () => {
    expect(getDateRangeForPreset("thisMonth", ref)).toEqual({
      from: "2025-06-01",
      to: "2025-06-18",
    });
  });

  test("returns 3 months back for 'last3Months'", () => {
    expect(getDateRangeForPreset("last3Months", ref)).toEqual({
      from: "2025-03-18",
      to: "2025-06-18",
    });
  });

  test("returns jan 1 to today for 'thisYear'", () => {
    expect(getDateRangeForPreset("thisYear", ref)).toEqual({
      from: "2025-01-01",
      to: "2025-06-18",
    });
  });

  test("returns null for 'custom'", () => {
    expect(getDateRangeForPreset("custom", ref)).toBeNull();
  });

  test("returns null for null", () => {
    expect(getDateRangeForPreset(null, ref)).toBeNull();
  });

  test("handles Sunday correctly for thisWeek", () => {
    const sunday = new Date(2025, 5, 22); // 2025-06-22 is Sunday
    expect(getDateRangeForPreset("thisWeek", sunday)).toEqual({
      from: "2025-06-16",
      to: "2025-06-22",
    });
  });
});

describe("filterByDateRange", () => {
  const orders = [
    createFresisOrder({ id: "a", createdAt: "2025-01-10T10:00:00Z" }),
    createFresisOrder({ id: "b", createdAt: "2025-03-15T10:00:00Z" }),
    createFresisOrder({ id: "c", createdAt: "2025-06-20T10:00:00Z" }),
  ];

  test("returns all orders when both from and to are empty", () => {
    expect(filterByDateRange(orders, "", "")).toEqual(orders);
  });

  test("filters orders after from date", () => {
    const result = filterByDateRange(orders, "2025-03-01", "");
    expect(result.map((o) => o.id)).toEqual(["b", "c"]);
  });

  test("filters orders before to date", () => {
    const result = filterByDateRange(orders, "", "2025-03-15");
    expect(result.map((o) => o.id)).toEqual(["a", "b"]);
  });

  test("filters orders within range", () => {
    const result = filterByDateRange(orders, "2025-02-01", "2025-04-01");
    expect(result.map((o) => o.id)).toEqual(["b"]);
  });

  test("includes orders on boundary dates", () => {
    const result = filterByDateRange(orders, "2025-01-10", "2025-01-10");
    expect(result.map((o) => o.id)).toEqual(["a"]);
  });
});

describe("filterBySubClient", () => {
  const orders = [
    createFresisOrder({ id: "a", subClientCodice: "SC001" }),
    createFresisOrder({ id: "b", subClientCodice: "SC002" }),
    createFresisOrder({ id: "c", subClientCodice: "SC001" }),
  ];

  test("returns all orders for empty codice", () => {
    expect(filterBySubClient(orders, "")).toEqual(orders);
  });

  test("filters orders by matching codice", () => {
    const result = filterBySubClient(orders, "SC001");
    expect(result.map((o) => o.id)).toEqual(["a", "c"]);
  });

  test("returns empty for non-matching codice", () => {
    expect(filterBySubClient(orders, "SC999")).toEqual([]);
  });
});

describe("matchesFresisGlobalSearch", () => {
  test("returns true for empty query", () => {
    expect(matchesFresisGlobalSearch(createFresisOrder(), "")).toBe(true);
  });

  test("matches on subClientName", () => {
    const order = createFresisOrder({ subClientName: "Panificio Milano" });
    expect(matchesFresisGlobalSearch(order, "panificio")).toBe(true);
  });

  test("matches on subClientCodice", () => {
    const order = createFresisOrder({ subClientCodice: "XYZ99" });
    expect(matchesFresisGlobalSearch(order, "xyz99")).toBe(true);
  });

  test("matches on customerName", () => {
    const order = createFresisOrder({ customerName: "Fresis SRL" });
    expect(matchesFresisGlobalSearch(order, "fresis")).toBe(true);
  });

  test("matches on item articleCode", () => {
    const order = createFresisOrder({
      items: [createItem({ articleCode: "1.204.005" })],
    });
    expect(matchesFresisGlobalSearch(order, "1.204")).toBe(true);
  });

  test("matches on item productName", () => {
    const order = createFresisOrder({
      items: [createItem({ productName: "Ciabatta Rustica" })],
    });
    expect(matchesFresisGlobalSearch(order, "ciabatta")).toBe(true);
  });

  test("matches on item description", () => {
    const order = createFresisOrder({
      items: [createItem({ description: "Pane integrale bio" })],
    });
    expect(matchesFresisGlobalSearch(order, "integrale")).toBe(true);
  });

  test("matches on notes", () => {
    const order = createFresisOrder({ notes: "Consegna urgente" });
    expect(matchesFresisGlobalSearch(order, "urgente")).toBe(true);
  });

  test("matches on ddtNumber", () => {
    const order = createFresisOrder({ ddtNumber: "DDT-2025-001" });
    expect(matchesFresisGlobalSearch(order, "DDT-2025")).toBe(true);
  });

  test("matches on invoiceNumber", () => {
    const order = createFresisOrder({ invoiceNumber: "FT-2025-042" });
    expect(matchesFresisGlobalSearch(order, "FT-2025")).toBe(true);
  });

  test("returns false for non-matching query", () => {
    expect(matchesFresisGlobalSearch(createFresisOrder(), "zzzznotfound")).toBe(
      false,
    );
  });
});

describe("computeOrderTotals", () => {
  test("computes totals for items without discounts", () => {
    const items = [
      createItem({ quantity: 10, price: 5.0 }),
      createItem({ quantity: 5, price: 10.0 }),
    ];
    expect(computeOrderTotals(items, 0)).toEqual({
      totalItems: 15,
      totalGross: 100,
      totalNet: 100,
    });
  });

  test("applies per-item discount", () => {
    const items = [createItem({ quantity: 10, price: 10.0, discount: 10 })];
    expect(computeOrderTotals(items, 0)).toEqual({
      totalItems: 10,
      totalGross: 100,
      totalNet: 90,
    });
  });

  test("applies global discount after per-item discounts", () => {
    const items = [createItem({ quantity: 10, price: 10.0, discount: 10 })];
    const result = computeOrderTotals(items, 20);
    expect(result.totalItems).toBe(10);
    expect(result.totalGross).toBe(100);
    expect(result.totalNet).toBe(72);
  });

  test("handles zero quantity items", () => {
    const items = [createItem({ quantity: 0, price: 10.0 })];
    expect(computeOrderTotals(items, 0)).toEqual({
      totalItems: 0,
      totalGross: 0,
      totalNet: 0,
    });
  });

  test("handles empty items array", () => {
    expect(computeOrderTotals([], 0)).toEqual({
      totalItems: 0,
      totalGross: 0,
      totalNet: 0,
    });
  });

  test("treats undefined discount as zero", () => {
    const items = [
      createItem({ quantity: 5, price: 20.0, discount: undefined }),
    ];
    expect(computeOrderTotals(items, 0)).toEqual({
      totalItems: 5,
      totalGross: 100,
      totalNet: 100,
    });
  });
});

describe("extractUniqueSubClients", () => {
  test("extracts unique sub-clients sorted by name", () => {
    const orders = [
      createFresisOrder({ subClientCodice: "B", subClientName: "Zeta" }),
      createFresisOrder({ subClientCodice: "A", subClientName: "Alpha" }),
      createFresisOrder({ subClientCodice: "B", subClientName: "Zeta" }),
    ];
    expect(extractUniqueSubClients(orders)).toEqual([
      { codice: "A", name: "Alpha" },
      { codice: "B", name: "Zeta" },
    ]);
  });

  test("returns empty array for no orders", () => {
    expect(extractUniqueSubClients([])).toEqual([]);
  });

  test("keeps first name for duplicate codice", () => {
    const orders = [
      createFresisOrder({ subClientCodice: "X", subClientName: "First" }),
      createFresisOrder({ subClientCodice: "X", subClientName: "Second" }),
    ];
    expect(extractUniqueSubClients(orders)).toEqual([
      { codice: "X", name: "First" },
    ]);
  });
});

describe("groupFresisOrdersByPeriod", () => {
  test("returns empty array for empty input", () => {
    expect(groupFresisOrdersByPeriod([])).toEqual([]);
  });

  test("groups today's order into Oggi", () => {
    const now = new Date(2025, 5, 18, 12, 0, 0);
    const order = createFresisOrder({
      id: "today",
      createdAt: new Date(2025, 5, 18, 10, 0, 0).toISOString(),
    });
    const result = groupFresisOrdersByPeriod([order], now);
    expect(result).toEqual([{ period: "Oggi", orders: [order] }]);
  });

  test("groups yesterday into Questa settimana", () => {
    const now = new Date(2025, 5, 18, 12, 0, 0);
    const order = createFresisOrder({
      id: "yesterday",
      createdAt: new Date(2025, 5, 17, 10, 0, 0).toISOString(),
    });
    const result = groupFresisOrdersByPeriod([order], now);
    expect(result).toEqual([{ period: "Questa settimana", orders: [order] }]);
  });

  test("groups old order into Più vecchi", () => {
    const now = new Date(2025, 5, 18, 12, 0, 0);
    const order = createFresisOrder({
      id: "old",
      createdAt: new Date(2025, 3, 10, 10, 0, 0).toISOString(),
    });
    const result = groupFresisOrdersByPeriod([order], now);
    expect(result).toEqual([{ period: "Più vecchi", orders: [order] }]);
  });

  test("sorts orders within group by date descending", () => {
    const now = new Date(2025, 5, 18, 18, 0, 0);
    const earlier = createFresisOrder({
      id: "early",
      createdAt: new Date(2025, 5, 18, 8, 0, 0).toISOString(),
    });
    const later = createFresisOrder({
      id: "late",
      createdAt: new Date(2025, 5, 18, 16, 0, 0).toISOString(),
    });
    const result = groupFresisOrdersByPeriod([earlier, later], now);
    expect(result[0].orders[0].id).toBe("late");
    expect(result[0].orders[1].id).toBe("early");
  });

  test("groups invalid dates into Più vecchi", () => {
    const now = new Date(2025, 5, 18);
    const order = createFresisOrder({
      id: "invalid",
      createdAt: "not-a-date",
    });
    const result = groupFresisOrdersByPeriod([order], now);
    expect(result[0].period).toBe("Più vecchi");
  });

  test("returns only non-empty groups", () => {
    const now = new Date(2025, 5, 18, 12, 0, 0);
    const order = createFresisOrder({
      createdAt: new Date(2025, 5, 18, 10, 0, 0).toISOString(),
    });
    const result = groupFresisOrdersByPeriod([order], now);
    expect(result).toHaveLength(1);
  });
});

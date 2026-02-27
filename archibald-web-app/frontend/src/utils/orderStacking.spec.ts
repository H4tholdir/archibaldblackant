import { describe, expect, test, beforeEach } from "vitest";
import type { Order } from "../types/order";
import {
  isCreditNote,
  normalizeAmount,
  getOrderDate,
  detectNcTriads,
  buildStackMap,
  loadManualStacks,
  saveManualStacks,
  addManualStack,
  removeFromManualStack,
  dissolveManualStack,
  MANUAL_STACKS_KEY,
} from "./orderStacking";

function makeOrder(overrides: Partial<Order> & { id: string }): Order {
  return {
    date: "2026-02-10T10:00:00",
    customerName: "Acme Corp",
    total: "100,00 €",
    status: "Fatturato",
    grossAmount: "150,00 €",
    ...overrides,
  };
}

describe(isCreditNote, () => {
  test("returns true for negative grossAmount", () => {
    expect(isCreditNote(makeOrder({ id: "1", grossAmount: "-4.264,48 €" }))).toBe(true);
  });

  test("returns false for positive grossAmount", () => {
    expect(isCreditNote(makeOrder({ id: "1", grossAmount: "4.264,48 €" }))).toBe(false);
  });

  test("returns false when grossAmount is missing", () => {
    expect(isCreditNote(makeOrder({ id: "1", grossAmount: undefined }))).toBe(false);
  });

  test("handles leading whitespace", () => {
    expect(isCreditNote(makeOrder({ id: "1", grossAmount: "  -100,00 €" }))).toBe(true);
  });
});

describe(normalizeAmount, () => {
  test("strips negative sign and trims", () => {
    expect(normalizeAmount("-4.264,48 €")).toBe("4.264,48 €");
  });

  test("returns positive amount unchanged (trimmed)", () => {
    expect(normalizeAmount("4.264,48 €")).toBe("4.264,48 €");
  });

  test("handles empty string", () => {
    expect(normalizeAmount("")).toBe("");
  });

  test("strips leading whitespace before negative sign", () => {
    expect(normalizeAmount("  -100,00 €")).toBe("100,00 €");
  });
});

describe(getOrderDate, () => {
  test("uses order.date as primary source", () => {
    const order = makeOrder({ id: "1", date: "2026-02-15T10:00:00" });
    expect(getOrderDate(order).toISOString()).toContain("2026-02-15");
  });

  test("returns Invalid Date when date is empty", () => {
    const order = makeOrder({ id: "1", date: "" });
    expect(isNaN(getOrderDate(order).getTime())).toBe(true);
  });
});

describe(detectNcTriads, () => {
  const original = makeOrder({
    id: "47.761",
    customerName: "Cupo",
    grossAmount: "4.264,48 €",
    date: "2026-02-04T17:33:14",
  });

  const creditNote = makeOrder({
    id: "48.068",
    customerName: "Cupo",
    grossAmount: "-4.264,48 €",
    date: "2026-02-10T10:41:57",
  });

  const replacement = makeOrder({
    id: "48.070",
    customerName: "Cupo",
    grossAmount: "4.264,48 €",
    date: "2026-02-10T11:07:05",
  });

  test("detects complete triad (original + NC + replacement)", () => {
    const triads = detectNcTriads([original, creditNote, replacement]);

    expect(triads).toHaveLength(1);
    expect(triads[0].original.id).toBe("47.761");
    expect(triads[0].creditNote.id).toBe("48.068");
    expect(triads[0].replacement?.id).toBe("48.070");
    expect(triads[0].stackId).toBe("nc-47.761");
  });

  test("detects partial triad (original + NC, no replacement)", () => {
    const triads = detectNcTriads([original, creditNote]);

    expect(triads).toHaveLength(1);
    expect(triads[0].original.id).toBe("47.761");
    expect(triads[0].creditNote.id).toBe("48.068");
    expect(triads[0].replacement).toBeNull();
  });

  test("returns empty for orders without matching NC", () => {
    const unrelatedOrder = makeOrder({
      id: "99",
      customerName: "Other",
      grossAmount: "500,00 €",
      date: "2026-01-01",
    });
    expect(detectNcTriads([unrelatedOrder])).toEqual([]);
  });

  test("does not match NC with different customer", () => {
    const ncDiffCustomer = makeOrder({
      id: "nc-1",
      customerName: "Other",
      grossAmount: "-4.264,48 €",
      date: "2026-02-10T10:00:00",
    });
    expect(detectNcTriads([original, ncDiffCustomer])).toEqual([]);
  });

  test("does not match NC with different amount", () => {
    const ncDiffAmount = makeOrder({
      id: "nc-1",
      customerName: "Cupo",
      grossAmount: "-999,99 €",
      date: "2026-02-10T10:00:00",
    });
    expect(detectNcTriads([original, ncDiffAmount])).toEqual([]);
  });

  test("each order participates in at most one triad", () => {
    const nc2 = makeOrder({
      id: "nc-2",
      customerName: "Cupo",
      grossAmount: "-4.264,48 €",
      date: "2026-02-12T10:00:00",
    });
    const triads = detectNcTriads([original, creditNote, nc2, replacement]);

    const allIds = triads.flatMap((t) => [
      t.original.id,
      t.creditNote.id,
      ...(t.replacement ? [t.replacement.id] : []),
    ]);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  test("picks closest original (by date) when multiple candidates", () => {
    const olderOriginal = makeOrder({
      id: "old",
      customerName: "Cupo",
      grossAmount: "4.264,48 €",
      date: "2026-01-01T10:00:00",
    });
    const triads = detectNcTriads([olderOriginal, original, creditNote]);

    expect(triads).toHaveLength(1);
    expect(triads[0].original.id).toBe("47.761");
  });
});

describe(buildStackMap, () => {
  const original = makeOrder({ id: "47.761", customerName: "Cupo", grossAmount: "4.264,48 €", date: "2026-02-04" });
  const creditNote = makeOrder({ id: "48.068", customerName: "Cupo", grossAmount: "-4.264,48 €", date: "2026-02-10" });
  const replacement = makeOrder({ id: "48.070", customerName: "Cupo", grossAmount: "4.264,48 €", date: "2026-02-10T11:00:00" });
  const standalone = makeOrder({ id: "99", customerName: "Other", grossAmount: "100,00 €", date: "2026-02-15" });

  test("creates auto-nc stacks from triads", () => {
    const { stackMap, orderIndex } = buildStackMap(
      [original, creditNote, replacement, standalone],
      [],
    );

    expect(stackMap.size).toBe(1);
    const stack = stackMap.get("nc-47.761")!;
    expect(stack.source).toBe("auto-nc");
    expect(stack.orderIds).toEqual(["47.761", "48.068", "48.070"]);
    expect(orderIndex.get("47.761")).toBe("nc-47.761");
    expect(orderIndex.has("99")).toBe(false);
  });

  test("manual stacks override auto triads", () => {
    const manual = [{ stackId: "manual-1", orderIds: ["47.761", "99"], createdAt: "2026-02-26" }];
    const { stackMap, orderIndex } = buildStackMap(
      [original, creditNote, replacement, standalone],
      manual,
    );

    expect(stackMap.has("nc-47.761")).toBe(false);
    expect(stackMap.has("manual-1")).toBe(true);
    expect(orderIndex.get("47.761")).toBe("manual-1");
    expect(orderIndex.get("99")).toBe("manual-1");
  });

  test("filters out manual stacks with non-existent order IDs", () => {
    const manual = [{ stackId: "manual-1", orderIds: ["nonexistent-1", "nonexistent-2"], createdAt: "2026-02-26" }];
    const { stackMap } = buildStackMap([standalone], manual);
    expect(stackMap.size).toBe(0);
  });

  test("dissolves manual stack with fewer than 2 valid orders", () => {
    const manual = [{ stackId: "manual-1", orderIds: ["99", "nonexistent"], createdAt: "2026-02-26" }];
    const { stackMap } = buildStackMap([standalone], manual);
    expect(stackMap.size).toBe(0);
  });
});

describe("localStorage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("loadManualStacks returns empty array when no data", () => {
    expect(loadManualStacks()).toEqual([]);
  });

  test("saveManualStacks and loadManualStacks roundtrip", () => {
    const stacks = [{ stackId: "s1", orderIds: ["a", "b"], createdAt: "2026-01-01" }];
    saveManualStacks(stacks);
    expect(loadManualStacks()).toEqual(stacks);
  });

  test("loadManualStacks handles corrupted data", () => {
    localStorage.setItem(MANUAL_STACKS_KEY, "not-json");
    expect(loadManualStacks()).toEqual([]);
  });

  test("addManualStack persists a new stack", () => {
    const entry = addManualStack(["a", "b"]);
    expect(entry.stackId).toMatch(/^manual-/);
    expect(entry.orderIds).toEqual(["a", "b"]);
    const loaded = loadManualStacks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].stackId).toBe(entry.stackId);
  });

  test("removeFromManualStack removes order from stack", () => {
    addManualStack(["a", "b", "c"]);
    const stacks = loadManualStacks();
    removeFromManualStack(stacks[0].stackId, "b");
    const updated = loadManualStacks();
    expect(updated[0].orderIds).toEqual(["a", "c"]);
  });

  test("removeFromManualStack dissolves stack when fewer than 2 remain", () => {
    addManualStack(["a", "b"]);
    const stacks = loadManualStacks();
    removeFromManualStack(stacks[0].stackId, "b");
    expect(loadManualStacks()).toEqual([]);
  });

  test("dissolveManualStack removes entire stack", () => {
    addManualStack(["a", "b"]);
    addManualStack(["c", "d"]);
    const stacks = loadManualStacks();
    dissolveManualStack(stacks[0].stackId);
    expect(loadManualStacks()).toHaveLength(1);
  });
});

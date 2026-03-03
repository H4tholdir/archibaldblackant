import { describe, expect, test, beforeEach } from "vitest";
import type { Order } from "../types/order";
import {
  isCreditNote,
  normalizeAmount,
  parseAmount,
  amountsMatch,
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

describe(parseAmount, () => {
  test("parses Italian-formatted positive amount", () => {
    expect(parseAmount("4.264,48 €")).toBe(4264.48);
  });

  test("parses negative amount", () => {
    expect(parseAmount("-213,11 €")).toBe(-213.11);
  });

  test("parses amount without thousands separator", () => {
    expect(parseAmount("250,00 €")).toBe(250);
  });

  test("returns null for empty string", () => {
    expect(parseAmount("")).toBeNull();
  });

  test("returns null for non-numeric string", () => {
    expect(parseAmount("abc")).toBeNull();
  });

  test("parses amount without currency symbol", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
  });
});

describe(amountsMatch, () => {
  test("matches identical amounts", () => {
    expect(amountsMatch("213,11 €", "213,11 €")).toBe(true);
  });

  test("matches positive and negative with same absolute value", () => {
    expect(amountsMatch("-213,11 €", "213,11 €")).toBe(true);
  });

  test("matches amounts within default tolerance of 1€", () => {
    expect(amountsMatch("-338,96 €", "338,94 €")).toBe(true);
  });

  test("rejects amounts differing by more than tolerance", () => {
    expect(amountsMatch("-250,00 €", "402,80 €")).toBe(false);
  });

  test("returns false when either amount is empty", () => {
    expect(amountsMatch("", "213,11 €")).toBe(false);
    expect(amountsMatch("213,11 €", "")).toBe(false);
  });

  test("supports custom tolerance", () => {
    expect(amountsMatch("100,00 €", "102,00 €", 5)).toBe(true);
    expect(amountsMatch("100,00 €", "102,00 €", 1)).toBe(false);
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
    total: "4.264,48 €",
    grossAmount: "5.000,00 €",
    date: "2026-02-04T17:33:14",
  });

  const creditNote = makeOrder({
    id: "48.068",
    customerName: "Cupo",
    total: "-4.264,48 €",
    grossAmount: "-5.000,00 €",
    date: "2026-02-10T10:41:57",
  });

  const replacement = makeOrder({
    id: "48.070",
    customerName: "Cupo",
    total: "4.264,48 €",
    grossAmount: "5.000,00 €",
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

  test("matches on total field, not grossAmount", () => {
    const orig = makeOrder({
      id: "orig",
      customerName: "Test",
      total: "250,00 €",
      grossAmount: "402,80 €",
      date: "2026-01-22T12:00:00",
    });
    const nc = makeOrder({
      id: "nc",
      customerName: "Test",
      total: "-250,00 €",
      grossAmount: "-250,00 €",
      date: "2026-01-26T12:00:00",
    });
    const triads = detectNcTriads([orig, nc]);

    expect(triads).toHaveLength(1);
    expect(triads[0].original.id).toBe("orig");
    expect(triads[0].creditNote.id).toBe("nc");
  });

  test("matches amounts within tolerance of 1€", () => {
    const orig = makeOrder({
      id: "orig",
      customerName: "Test",
      total: "213,11 €",
      grossAmount: "338,94 €",
      date: "2026-02-04T17:00:00",
    });
    const nc = makeOrder({
      id: "nc",
      customerName: "Test",
      total: "-213,11 €",
      grossAmount: "-338,96 €",
      date: "2026-02-10T11:00:00",
    });
    const repl = makeOrder({
      id: "repl",
      customerName: "Test",
      total: "213,09 €",
      grossAmount: "338,94 €",
      date: "2026-02-10T11:30:00",
    });
    const triads = detectNcTriads([orig, nc, repl]);

    expect(triads).toHaveLength(1);
    expect(triads[0].original.id).toBe("orig");
    expect(triads[0].creditNote.id).toBe("nc");
    expect(triads[0].replacement?.id).toBe("repl");
  });

  test("returns empty for orders without matching NC", () => {
    const unrelatedOrder = makeOrder({
      id: "99",
      customerName: "Other",
      total: "500,00 €",
      grossAmount: "500,00 €",
      date: "2026-01-01",
    });
    expect(detectNcTriads([unrelatedOrder])).toEqual([]);
  });

  test("does not match NC with different customer", () => {
    const ncDiffCustomer = makeOrder({
      id: "nc-1",
      customerName: "Other",
      total: "-4.264,48 €",
      grossAmount: "-5.000,00 €",
      date: "2026-02-10T10:00:00",
    });
    expect(detectNcTriads([original, ncDiffCustomer])).toEqual([]);
  });

  test("does not match NC with different amount", () => {
    const ncDiffAmount = makeOrder({
      id: "nc-1",
      customerName: "Cupo",
      total: "-999,99 €",
      grossAmount: "-999,99 €",
      date: "2026-02-10T10:00:00",
    });
    expect(detectNcTriads([original, ncDiffAmount])).toEqual([]);
  });

  test("each order participates in at most one triad", () => {
    const nc2 = makeOrder({
      id: "nc-2",
      customerName: "Cupo",
      total: "-4.264,48 €",
      grossAmount: "-5.000,00 €",
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
      total: "4.264,48 €",
      grossAmount: "5.000,00 €",
      date: "2026-01-01T10:00:00",
    });
    const triads = detectNcTriads([olderOriginal, original, creditNote]);

    expect(triads).toHaveLength(1);
    expect(triads[0].original.id).toBe("47.761");
  });

  test("production case: Dragonetti - NC gross differs from original gross", () => {
    const orig = makeOrder({
      id: "ORD/26001077",
      customerName: "Dragonetti Antonio",
      total: "250,00 €",
      grossAmount: "402,80 €",
      date: "2026-01-22T12:04:50",
    });
    const nc = makeOrder({
      id: "ORD/26001267",
      customerName: "Dragonetti Antonio",
      total: "-250,00 €",
      grossAmount: "-250,00 €",
      date: "2026-01-26T12:18:13",
    });
    const repl = makeOrder({
      id: "ORD/26001266",
      customerName: "Dragonetti Antonio",
      total: "249,98 €",
      grossAmount: "402,80 €",
      date: "2026-01-26T12:14:55",
    });
    const triads = detectNcTriads([orig, nc, repl]);

    expect(triads).toHaveLength(1);
    expect(triads[0].original.id).toBe("ORD/26001077");
    expect(triads[0].creditNote.id).toBe("ORD/26001267");
    expect(triads[0].replacement?.id).toBe("ORD/26001266");
  });

  test("production case: Magma Center - NC gross differs from original gross", () => {
    const orig = makeOrder({
      id: "ORD/26001076",
      customerName: "Magma Center S.R.L.",
      total: "491,80 €",
      grossAmount: "540,40 €",
      date: "2026-01-22T12:04:49",
    });
    const nc = makeOrder({
      id: "ORD/26001271",
      customerName: "Magma Center S.R.L.",
      total: "-491,80 €",
      grossAmount: "-491,80 €",
      date: "2026-01-26T12:27:19",
    });
    const repl = makeOrder({
      id: "ORD/26001269",
      customerName: "Magma Center S.R.L.",
      total: "491,82 €",
      grossAmount: "540,40 €",
      date: "2026-01-26T12:23:54",
    });
    const triads = detectNcTriads([orig, nc, repl]);

    expect(triads).toHaveLength(1);
    expect(triads[0].original.id).toBe("ORD/26001076");
    expect(triads[0].creditNote.id).toBe("ORD/26001271");
    expect(triads[0].replacement?.id).toBe("ORD/26001269");
  });
});

describe(buildStackMap, () => {
  const original = makeOrder({ id: "47.761", customerName: "Cupo", total: "4.264,48 €", grossAmount: "5.000,00 €", date: "2026-02-04" });
  const creditNote = makeOrder({ id: "48.068", customerName: "Cupo", total: "-4.264,48 €", grossAmount: "-5.000,00 €", date: "2026-02-10" });
  const replacement = makeOrder({ id: "48.070", customerName: "Cupo", total: "4.264,48 €", grossAmount: "5.000,00 €", date: "2026-02-10T11:00:00" });
  const standalone = makeOrder({ id: "99", customerName: "Other", total: "100,00 €", grossAmount: "100,00 €", date: "2026-02-15" });

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

  test("dismissed NC stacks suppress triads without showing as manual stacks", () => {
    const dismissed = [{ stackId: "manual-d", orderIds: ["47.761", "48.068", "48.070"], createdAt: "2026-02-26", reason: "__dismissed__" }];
    const { stackMap, orderIndex } = buildStackMap(
      [original, creditNote, replacement, standalone],
      dismissed,
    );

    expect(stackMap.has("nc-47.761")).toBe(false);
    expect(stackMap.has("manual-d")).toBe(false);
    expect(stackMap.size).toBe(0);
    expect(orderIndex.has("47.761")).toBe(false);
  });

  test("dismissed NC with additional manual stack still works", () => {
    const stacks = [
      { stackId: "manual-d", orderIds: ["47.761", "48.068", "48.070"], createdAt: "2026-02-26", reason: "__dismissed__" },
      { stackId: "manual-2", orderIds: ["99", "48.070"], createdAt: "2026-02-26" },
    ];
    const { stackMap } = buildStackMap(
      [original, creditNote, replacement, standalone],
      stacks,
    );

    expect(stackMap.has("nc-47.761")).toBe(false);
    expect(stackMap.has("manual-d")).toBe(false);
    expect(stackMap.has("manual-2")).toBe(true);
    expect(stackMap.get("manual-2")!.orderIds).toEqual(["99", "48.070"]);
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

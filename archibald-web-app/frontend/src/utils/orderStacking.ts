import type { Order } from "../types/order";

type OrderStack = {
  stackId: string;
  orderIds: string[];
  source: "auto-nc" | "manual";
  reason?: string;
};

type StackMap = Map<string, OrderStack>;
type OrderToStackIndex = Map<string, string>;

type NcTriad = {
  stackId: string;
  original: Order;
  creditNote: Order;
  replacement: Order | null;
};

type ManualStackEntry = {
  stackId: string;
  orderIds: string[];
  createdAt: string;
  reason?: string;
};

type ManualStacksStorage = {
  version: 1;
  stacks: ManualStackEntry[];
};

const MANUAL_STACKS_KEY = "archibald_order_stacks";

function isCreditNote(order: Order): boolean {
  const ga = (order.grossAmount as string | undefined) ?? "";
  return ga.trimStart().startsWith("-");
}

function normalizeAmount(grossAmount: string): string {
  return grossAmount.trimStart().replace(/^-/, "").trim();
}

function getOrderDate(order: Order): Date {
  return new Date(order.date || "");
}

function detectNcTriads(orders: Order[]): NcTriad[] {
  const consumed = new Set<string>();
  const triads: NcTriad[] = [];

  const creditNotes = orders.filter((o) => isCreditNote(o));
  const regularOrders = orders.filter((o) => !isCreditNote(o));

  for (const nc of creditNotes) {
    if (consumed.has(nc.id)) continue;

    const ncAbsAmount = normalizeAmount(
      (nc.grossAmount as string | undefined) ?? "",
    );
    if (!ncAbsAmount) continue;

    const ncDate = getOrderDate(nc);

    const originalCandidates = regularOrders
      .filter(
        (o) =>
          !consumed.has(o.id) &&
          o.customerName === nc.customerName &&
          normalizeAmount((o.grossAmount as string | undefined) ?? "") ===
            ncAbsAmount &&
          getOrderDate(o) <= ncDate,
      )
      .sort(
        (a, b) => getOrderDate(b).getTime() - getOrderDate(a).getTime(),
      );

    const original = originalCandidates[0];
    if (!original) continue;

    const replacementCandidates = regularOrders
      .filter(
        (o) =>
          !consumed.has(o.id) &&
          o.id !== original.id &&
          o.customerName === nc.customerName &&
          normalizeAmount((o.grossAmount as string | undefined) ?? "") ===
            ncAbsAmount &&
          getOrderDate(o) >= ncDate,
      )
      .sort(
        (a, b) => getOrderDate(a).getTime() - getOrderDate(b).getTime(),
      );

    const replacement = replacementCandidates[0] ?? null;

    consumed.add(nc.id);
    consumed.add(original.id);
    if (replacement) consumed.add(replacement.id);

    triads.push({
      stackId: `nc-${original.id}`,
      original,
      creditNote: nc,
      replacement,
    });
  }

  return triads;
}

function buildStackMap(
  orders: Order[],
  manualStacks: ManualStackEntry[],
): { stackMap: StackMap; orderIndex: OrderToStackIndex } {
  const stackMap: StackMap = new Map();
  const orderIndex: OrderToStackIndex = new Map();

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const manualOrderIds = new Set(manualStacks.flatMap((s) => s.orderIds));

  const triads = detectNcTriads(orders);

  for (const triad of triads) {
    const ids = [triad.original.id, triad.creditNote.id];
    if (triad.replacement) ids.push(triad.replacement.id);

    const hasManualOverride = ids.some((id) => manualOrderIds.has(id));
    if (hasManualOverride) continue;

    const stack: OrderStack = {
      stackId: triad.stackId,
      orderIds: ids,
      source: "auto-nc",
    };
    stackMap.set(triad.stackId, stack);
    for (const id of ids) {
      orderIndex.set(id, triad.stackId);
    }
  }

  for (const manual of manualStacks) {
    const validIds = manual.orderIds.filter((id) => orderById.has(id));
    if (validIds.length < 2) continue;

    const stack: OrderStack = {
      stackId: manual.stackId,
      orderIds: validIds,
      source: "manual",
      reason: manual.reason,
    };
    stackMap.set(manual.stackId, stack);
    for (const id of validIds) {
      orderIndex.set(id, manual.stackId);
    }
  }

  return { stackMap, orderIndex };
}

function loadManualStacks(): ManualStackEntry[] {
  try {
    const raw = localStorage.getItem(MANUAL_STACKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ManualStacksStorage;
    if (parsed.version !== 1) return [];
    return parsed.stacks;
  } catch {
    return [];
  }
}

function saveManualStacks(stacks: ManualStackEntry[]): void {
  const data: ManualStacksStorage = { version: 1, stacks };
  localStorage.setItem(MANUAL_STACKS_KEY, JSON.stringify(data));
}

function addManualStack(orderIds: string[]): ManualStackEntry {
  const stacks = loadManualStacks();
  const entry: ManualStackEntry = {
    stackId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    orderIds,
    createdAt: new Date().toISOString(),
  };
  stacks.push(entry);
  saveManualStacks(stacks);
  return entry;
}

function removeFromManualStack(stackId: string, orderId: string): void {
  const stacks = loadManualStacks();
  const idx = stacks.findIndex((s) => s.stackId === stackId);
  if (idx === -1) return;
  stacks[idx].orderIds = stacks[idx].orderIds.filter((id) => id !== orderId);
  if (stacks[idx].orderIds.length < 2) {
    stacks.splice(idx, 1);
  }
  saveManualStacks(stacks);
}

function dissolveManualStack(stackId: string): void {
  const stacks = loadManualStacks().filter((s) => s.stackId !== stackId);
  saveManualStacks(stacks);
}

export {
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
  type OrderStack,
  type StackMap,
  type OrderToStackIndex,
  type NcTriad,
  type ManualStackEntry,
};

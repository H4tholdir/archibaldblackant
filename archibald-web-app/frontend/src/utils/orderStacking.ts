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
  const t = (order.total as string | undefined) ?? "";
  return t.trimStart().startsWith("-");
}

function normalizeAmount(amount: string): string {
  return amount.trimStart().replace(/^-/, "").trim();
}

function parseAmount(amount: string): number | null {
  const cleaned = amount.replace(/[€\s]/g, "").trim();
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

function amountsMatch(a: string, b: string, tolerance = 1.0): boolean {
  const numA = parseAmount(a);
  const numB = parseAmount(b);
  if (numA === null || numB === null) return false;
  return Math.abs(Math.abs(numA) - Math.abs(numB)) < tolerance;
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

    const ncTotal = nc.total ?? "";
    const ncNum = parseAmount(ncTotal);
    if (ncNum === null) continue;

    const ncDate = getOrderDate(nc);
    const ncAbs = Math.abs(ncNum);

    const amountDiff = (o: Order): number => {
      const num = parseAmount(o.total ?? "");
      return num === null ? Infinity : Math.abs(Math.abs(num) - ncAbs);
    };

    const matchingCandidates = regularOrders.filter(
      (o) =>
        !consumed.has(o.id) &&
        o.customerName === nc.customerName &&
        amountsMatch(o.total ?? "", ncTotal),
    );

    const originalCandidates = matchingCandidates
      .filter((o) => getOrderDate(o) <= ncDate)
      .sort((a, b) => {
        const diffCmp = amountDiff(a) - amountDiff(b);
        if (diffCmp !== 0) return diffCmp;
        return getOrderDate(b).getTime() - getOrderDate(a).getTime();
      });

    const original = originalCandidates[0];
    if (!original) continue;

    const replacementCandidates = matchingCandidates
      .filter((o) => o.id !== original.id)
      .sort((a, b) => {
        const diffCmp = amountDiff(a) - amountDiff(b);
        if (diffCmp !== 0) return diffCmp;
        const aProximity = Math.abs(getOrderDate(a).getTime() - ncDate.getTime());
        const bProximity = Math.abs(getOrderDate(b).getTime() - ncDate.getTime());
        return aProximity - bProximity;
      });

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
    if (manual.reason === "__dismissed__") continue;
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
  type OrderStack,
  type StackMap,
  type OrderToStackIndex,
  type NcTriad,
  type ManualStackEntry,
};

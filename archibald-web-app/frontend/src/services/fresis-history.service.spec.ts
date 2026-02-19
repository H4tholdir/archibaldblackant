import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../db/schema";
import type {
  FresisHistoryOrder,
  PendingOrder,
  PendingOrderItem,
  SubClient,
} from "../db/schema";
import { fresisHistoryService } from "./fresis-history.service";
import { FRESIS_CUSTOMER_PROFILE } from "../utils/fresis-constants";

const mockSubClient: SubClient = {
  codice: "SC001",
  ragioneSociale: "Test SRL",
};

const mockItems: PendingOrderItem[] = [
  {
    articleCode: "ART001",
    productName: "Prodotto Test",
    quantity: 10,
    price: 5.0,
    vat: 22,
  },
];

function createHistoryOrder(
  overrides: Partial<FresisHistoryOrder> = {},
): FresisHistoryOrder {
  return {
    id: crypto.randomUUID(),
    originalPendingOrderId: crypto.randomUUID(),
    subClientCodice: "SC001",
    subClientName: "Test SRL",
    subClientData: mockSubClient,
    customerId: FRESIS_CUSTOMER_PROFILE,
    customerName: "Fresis",
    items: mockItems,
    createdAt: "2025-06-01T10:00:00Z",
    updatedAt: "2025-06-01T10:00:00Z",
    mergedIntoOrderId: "pending-uuid-1",
    mergedAt: "2025-06-01T10:00:00Z",
    ...overrides,
  };
}

function createPendingOrder(
  overrides: Partial<PendingOrder> = {},
): PendingOrder {
  return {
    id: crypto.randomUUID(),
    customerId: FRESIS_CUSTOMER_PROFILE,
    customerName: "Fresis",
    items: mockItems,
    createdAt: "2025-06-01T10:00:00Z",
    updatedAt: "2025-06-01T10:00:00Z",
    status: "pending",
    retryCount: 0,
    deviceId: "test-device",
    needsSync: false,
    ...overrides,
  };
}

describe("reconcileUnlinkedOrders", () => {
  beforeEach(async () => {
    await db.fresisHistory.clear();
    await db.pendingOrders.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await db.fresisHistory.clear();
    await db.pendingOrders.clear();
  });

  test("returns 0 when no unlinked records exist", async () => {
    await db.fresisHistory.add(
      createHistoryOrder({ archibaldOrderId: "ORD-LINKED" }),
    );

    const result = await fresisHistoryService.reconcileUnlinkedOrders();
    expect(result).toBe(0);
  });

  test("links via jobOrderId when PendingOrder exists locally", async () => {
    const pendingId = crypto.randomUUID();
    const historyId = crypto.randomUUID();
    const archibaldOrderId = "72.12345";

    await db.pendingOrders.add(
      createPendingOrder({
        id: pendingId,
        jobOrderId: archibaldOrderId,
        jobStatus: "completed",
      }),
    );

    await db.fresisHistory.add(
      createHistoryOrder({
        id: historyId,
        mergedIntoOrderId: pendingId,
        archibaldOrderId: undefined,
      }),
    );

    const result = await fresisHistoryService.reconcileUnlinkedOrders();
    expect(result).toBe(1);

    const updated = await db.fresisHistory.get(historyId);
    expect(updated?.archibaldOrderId).toBe(archibaldOrderId);
  });

  test("falls back to server fetch when PendingOrder not in IndexedDB", async () => {
    const historyId = crypto.randomUUID();
    const missingPendingId = "pending-deleted-after-4s";
    const archibaldOrderId = "72.99999";

    await db.fresisHistory.add(
      createHistoryOrder({
        id: historyId,
        mergedIntoOrderId: missingPendingId,
        archibaldOrderId: undefined,
      }),
    );

    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("test-jwt-token");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        record: {
          id: historyId,
          archibaldOrderId,
          archibaldOrderNumber: "ORD/FALLBACK",
          parentCustomerName: "Cliente Test",
          currentState: "spedito",
          stateUpdatedAt: "2025-06-15T10:00:00Z",
          updatedAt: "2025-06-15T10:00:00Z",
        },
      }),
    } as Response);

    const result = await fresisHistoryService.reconcileUnlinkedOrders();
    expect(result).toBe(1);

    const updated = await db.fresisHistory.get(historyId);
    expect(updated?.archibaldOrderId).toBe(archibaldOrderId);
    expect(updated?.currentState).toBe("spedito");
    expect(updated?.parentCustomerName).toBe("Cliente Test");
  });

  test("skips server fallback when no token available", async () => {
    const historyId = crypto.randomUUID();

    await db.fresisHistory.add(
      createHistoryOrder({
        id: historyId,
        mergedIntoOrderId: "pending-missing",
        archibaldOrderId: undefined,
      }),
    );

    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

    const result = await fresisHistoryService.reconcileUnlinkedOrders();
    expect(result).toBe(0);
  });

  test("skips record when server returns no archibaldOrderId", async () => {
    const historyId = crypto.randomUUID();

    await db.fresisHistory.add(
      createHistoryOrder({
        id: historyId,
        mergedIntoOrderId: "pending-not-ready",
        archibaldOrderId: undefined,
      }),
    );

    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("test-jwt-token");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        record: {
          id: historyId,
          archibaldOrderId: null,
          currentState: null,
        },
      }),
    } as Response);

    const result = await fresisHistoryService.reconcileUnlinkedOrders();
    expect(result).toBe(0);

    const unchanged = await db.fresisHistory.get(historyId);
    expect(unchanged?.archibaldOrderId).toBeUndefined();
  });
});

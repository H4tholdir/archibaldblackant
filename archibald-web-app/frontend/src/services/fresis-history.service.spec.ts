import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../db/schema";
import type { FresisHistoryOrder, PendingOrderItem, SubClient } from "../db/schema";
import { fresisHistoryService } from "./fresis-history.service";

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
    customerId: "57.213",
    customerName: "Fresis",
    items: mockItems,
    createdAt: "2025-06-01T10:00:00Z",
    updatedAt: "2025-06-01T10:00:00Z",
    mergedIntoOrderId: "pending-uuid-1",
    mergedAt: "2025-06-01T10:00:00Z",
    ...overrides,
  };
}

describe("syncOrderLifecycles", () => {
  beforeEach(async () => {
    await db.fresisHistory.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await db.fresisHistory.clear();
  });

  test("returns 0 when no records have archibaldOrderId", async () => {
    await db.fresisHistory.add(createHistoryOrder());

    const result = await fresisHistoryService.syncOrderLifecycles();
    expect(result).toBe(0);
  });

  test("returns 0 when no JWT token is available", async () => {
    await db.fresisHistory.add(
      createHistoryOrder({
        archibaldOrderId: "ORD-123",
        currentState: "piazzato",
      }),
    );

    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

    const result = await fresisHistoryService.syncOrderLifecycles();
    expect(result).toBe(0);
  });

  test("skips records with fatturato state", async () => {
    await db.fresisHistory.add(
      createHistoryOrder({
        archibaldOrderId: "ORD-123",
        currentState: "fatturato",
      }),
    );

    const result = await fresisHistoryService.syncOrderLifecycles();
    expect(result).toBe(0);
  });

  test("updates records with lifecycle data from API", async () => {
    const orderId = "ORD-456";
    const historyId = crypto.randomUUID();
    await db.fresisHistory.add(
      createHistoryOrder({
        id: historyId,
        archibaldOrderId: orderId,
        currentState: "piazzato",
      }),
    );

    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("test-jwt-token");

    const mockResponse = {
      success: true,
      data: {
        [orderId]: {
          orderNumber: "ORD/20250601",
          currentState: "spedito",
          ddtNumber: "DDT-789",
          ddtDeliveryDate: "2025-06-10",
          trackingNumber: "TRK123",
          trackingUrl: "https://tracking.example.com/TRK123",
          trackingCourier: "BRT",
          deliveryCompletedDate: null,
          invoiceNumber: null,
          invoiceDate: null,
          invoiceAmount: null,
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fresisHistoryService.syncOrderLifecycles();
    expect(result).toBe(1);

    const updated = await db.fresisHistory.get(historyId);
    expect(updated?.archibaldOrderNumber).toBe("ORD/20250601");
    expect(updated?.currentState).toBe("spedito");
    expect(updated?.ddtNumber).toBe("DDT-789");
    expect(updated?.trackingNumber).toBe("TRK123");
    expect(updated?.trackingCourier).toBe("BRT");
  });

  test("handles API returning null for unknown order IDs", async () => {
    const orderId = "ORD-UNKNOWN";
    const historyId = crypto.randomUUID();
    await db.fresisHistory.add(
      createHistoryOrder({
        id: historyId,
        archibaldOrderId: orderId,
        currentState: "piazzato",
      }),
    );

    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("test-jwt-token");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { [orderId]: null },
      }),
    } as Response);

    const result = await fresisHistoryService.syncOrderLifecycles();
    expect(result).toBe(0);

    const unchanged = await db.fresisHistory.get(historyId);
    expect(unchanged?.currentState).toBe("piazzato");
  });

  test("deduplicates archibaldOrderIds across multiple history records", async () => {
    const sharedOrderId = "ORD-SHARED";
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();

    await db.fresisHistory.bulkAdd([
      createHistoryOrder({
        id: id1,
        archibaldOrderId: sharedOrderId,
        currentState: "piazzato",
      }),
      createHistoryOrder({
        id: id2,
        archibaldOrderId: sharedOrderId,
        currentState: "piazzato",
        subClientCodice: "SC002",
      }),
    ]);

    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("test-jwt-token");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          [sharedOrderId]: {
            orderNumber: "ORD/SHARED01",
            currentState: "trasferito",
            ddtNumber: null,
            ddtDeliveryDate: null,
            trackingNumber: null,
            trackingUrl: null,
            trackingCourier: null,
            deliveryCompletedDate: null,
            invoiceNumber: null,
            invoiceDate: null,
            invoiceAmount: null,
          },
        },
      }),
    } as Response);

    const result = await fresisHistoryService.syncOrderLifecycles();
    expect(result).toBe(2);

    // Verify only one API call was made (deduplication)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callUrl = fetchSpy.mock.calls[0][0] as string;
    const idsInUrl = callUrl.split("ids=")[1]?.split(",");
    expect(idsInUrl).toEqual([sharedOrderId]);

    const record1 = await db.fresisHistory.get(id1);
    const record2 = await db.fresisHistory.get(id2);
    expect(record1?.currentState).toBe("trasferito");
    expect(record2?.currentState).toBe("trasferito");
  });

  test("returns 0 when API response is not ok", async () => {
    await db.fresisHistory.add(
      createHistoryOrder({
        archibaldOrderId: "ORD-FAIL",
        currentState: "piazzato",
      }),
    );

    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("test-jwt-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false }),
    } as Response);

    const result = await fresisHistoryService.syncOrderLifecycles();
    expect(result).toBe(0);
  });
});

import { describe, test, expect, beforeEach, vi } from "vitest";
import { OrderService } from "./orders.service";
import type { PendingOrder } from "../types/pending-order";

vi.mock("../api/pending-orders", () => ({
  savePendingOrder: vi.fn().mockResolvedValue({ id: "test", action: "created", serverUpdatedAt: Date.now() }),
  getPendingOrders: vi.fn().mockResolvedValue([]),
  deletePendingOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../api/warehouse", () => ({
  batchReserve: vi.fn().mockResolvedValue({ reserved: 0, skipped: 0, totalRequestedQty: 0, totalReservedQty: 0, warnings: [] }),
  batchRelease: vi.fn().mockResolvedValue({ released: 0 }),
  batchMarkSold: vi.fn().mockResolvedValue({ sold: 0 }),
  batchReturnSold: vi.fn().mockResolvedValue({ returned: 0 }),
}));

vi.mock("../utils/device-id", () => ({
  getDeviceId: () => "test-device-001",
}));

vi.mock("../utils/fetch-with-retry", () => ({
  fetchWithRetry: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}));

import {
  savePendingOrder as apiSavePendingOrder,
  getPendingOrders as apiGetPendingOrders,
  deletePendingOrder as apiDeletePendingOrder,
} from "../api/pending-orders";
import { batchReserve, batchRelease } from "../api/warehouse";

const mockApiSave = vi.mocked(apiSavePendingOrder);
const mockApiGetAll = vi.mocked(apiGetPendingOrders);
const mockApiDelete = vi.mocked(apiDeletePendingOrder);
const mockBatchReserve = vi.mocked(batchReserve);
const mockBatchRelease = vi.mocked(batchRelease);

describe("OrderService", () => {
  let service: OrderService;

  const mockOrderInput = {
    customerId: "C001",
    customerName: "Mario Rossi",
    items: [
      {
        articleCode: "V001",
        productName: "Vite M6",
        quantity: 100,
        price: 12.5,
        vat: 22,
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockApiSave.mockResolvedValue({ id: "test", action: "created", serverUpdatedAt: Date.now() });
    mockApiGetAll.mockResolvedValue([]);
    mockApiDelete.mockResolvedValue(undefined);
    service = new OrderService();
  });

  describe("savePendingOrder", () => {
    test("saves pending order via API and returns new UUID when no existingOrderId", async () => {
      const id = await service.savePendingOrder(mockOrderInput);

      expect(id).toBeTypeOf("string");
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(mockApiSave).toHaveBeenCalledTimes(1);
      expect(mockApiSave).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: "C001",
          status: "pending",
          retryCount: 0,
          deviceId: "test-device-001",
        }),
      );
    });

    test("uses existingOrderId as order ID when provided", async () => {
      const existingId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const id = await service.savePendingOrder(mockOrderInput, existingId);

      expect(id).toBe(existingId);
      expect(mockApiSave).toHaveBeenCalledWith(
        expect.objectContaining({ id: existingId }),
      );
    });

    test("does not call apiDeletePendingOrder when existingOrderId is provided", async () => {
      await service.savePendingOrder(mockOrderInput, "existing-id-123");

      expect(mockApiDelete).not.toHaveBeenCalled();
    });

    test("reserves warehouse before DB save and throws insufficiente on mismatch", async () => {
      const orderWithWarehouse = {
        ...mockOrderInput,
        items: [{
          ...mockOrderInput.items[0],
          warehouseQuantity: 5,
          warehouseSources: [{ warehouseItemId: 269, boxName: "SCATOLO 5", quantity: 5 }],
        }],
      };
      mockBatchReserve.mockResolvedValueOnce({
        reserved: 1, skipped: 0, totalRequestedQty: 5, totalReservedQty: 4,
        warnings: ["Item 269: richiesti 5 pz ma disponibili solo 4 pz"],
      });

      await expect(service.savePendingOrder(orderWithWarehouse)).rejects.toThrow("insufficiente");

      // DB save must NOT have been called since reserve failed
      expect(mockApiSave).not.toHaveBeenCalled();
    });

    test("releases warehouse reservation when DB save fails", async () => {
      const orderWithWarehouse = {
        ...mockOrderInput,
        items: [{
          ...mockOrderInput.items[0],
          warehouseQuantity: 5,
          warehouseSources: [{ warehouseItemId: 352, boxName: "SCATOLO 5", quantity: 5 }],
        }],
      };
      mockBatchReserve.mockResolvedValueOnce({
        reserved: 1, skipped: 0, totalRequestedQty: 5, totalReservedQty: 5, warnings: [],
      });
      mockApiSave.mockRejectedValueOnce(new Error("HTTP 500"));

      await expect(service.savePendingOrder(orderWithWarehouse)).rejects.toThrow("HTTP 500");

      expect(mockBatchRelease).toHaveBeenCalledWith(expect.stringContaining("pending-"));
    });
  });

  describe("getPendingOrders", () => {
    test("returns pending and error status orders sorted by createdAt", async () => {
      const pending1: PendingOrder = {
        id: "order-1",
        ...mockOrderInput,
        createdAt: "2025-01-23T10:00:00Z",
        updatedAt: "2025-01-23T10:00:00Z",
        status: "pending",
        retryCount: 0,
        deviceId: "test-device",
        needsSync: true,
      };
      const error1: PendingOrder = {
        id: "order-2",
        ...mockOrderInput,
        customerId: "C002",
        createdAt: "2025-01-23T09:00:00Z",
        updatedAt: "2025-01-23T09:00:00Z",
        status: "error",
        retryCount: 1,
        deviceId: "test-device",
        needsSync: true,
      };
      const syncing1: PendingOrder = {
        id: "order-3",
        ...mockOrderInput,
        customerId: "C003",
        createdAt: "2025-01-23T08:00:00Z",
        updatedAt: "2025-01-23T08:00:00Z",
        status: "syncing",
        retryCount: 0,
        deviceId: "test-device",
        needsSync: true,
      };

      mockApiGetAll.mockResolvedValue([pending1, error1, syncing1]);

      const orders = await service.getPendingOrders();

      expect(orders).toHaveLength(2);
      expect(orders[0].customerId).toBe("C002");
      expect(orders[0].status).toBe("error");
      expect(orders[1].customerId).toBe("C001");
      expect(orders[1].status).toBe("pending");
    });

    test("returns empty array when no pending orders exist", async () => {
      mockApiGetAll.mockResolvedValue([]);

      const orders = await service.getPendingOrders();

      expect(orders).toEqual([]);
    });
  });

  describe("updatePendingOrderStatus", () => {
    test("updates order status via API", async () => {
      const order: PendingOrder = {
        id: "order-1",
        ...mockOrderInput,
        createdAt: "2025-01-23T10:00:00Z",
        updatedAt: "2025-01-23T10:00:00Z",
        status: "pending",
        retryCount: 0,
        deviceId: "test-device",
        needsSync: true,
      };

      mockApiGetAll.mockResolvedValue([order]);

      await service.updatePendingOrderStatus("order-1", "syncing");

      expect(mockApiSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "order-1",
          status: "syncing",
          needsSync: true,
        }),
      );
    });

    test("does not throw when updating non-existent order", async () => {
      mockApiGetAll.mockResolvedValue([]);

      await expect(
        service.updatePendingOrderStatus("non-existent-uuid", "error"),
      ).resolves.not.toThrow();
    });
  });

  describe("deletePendingOrder", () => {
    test("deletes order via API", async () => {
      const order: PendingOrder = {
        id: "order-1",
        ...mockOrderInput,
        createdAt: "2025-01-23T10:00:00Z",
        updatedAt: "2025-01-23T10:00:00Z",
        status: "pending",
        retryCount: 0,
        deviceId: "test-device",
        needsSync: true,
      };

      mockApiGetAll.mockResolvedValue([order]);

      await service.deletePendingOrder("order-1");

      expect(mockApiDelete).toHaveBeenCalledWith("order-1");
    });
  });
});

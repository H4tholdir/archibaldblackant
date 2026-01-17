import { describe, expect, test, beforeEach, vi, afterEach } from "vitest";
import type { BrowserContext, Page } from "puppeteer";
import { DDTScraperService, type DDTData } from "./ddt-scraper-service";
import { BrowserPool } from "./browser-pool";
import { OrderDatabase } from "./order-db";

describe("DDTScraperService", () => {
  let service: DDTScraperService;
  let mockContext: BrowserContext;
  let mockPage: Page;

  beforeEach(() => {
    service = new DDTScraperService();

    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn(),
      isClosed: vi.fn().mockReturnValue(false),
      close: vi.fn().mockResolvedValue(undefined),
    } as any;

    mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("scrapeDDTData", () => {
    test("successfully scrapes DDT data with tracking info", async () => {
      vi.spyOn(BrowserPool.getInstance(), "acquireContext").mockResolvedValue(
        mockContext,
      );
      vi.spyOn(BrowserPool.getInstance(), "releaseContext").mockResolvedValue(
        undefined,
      );

      // Mock page scraping
      (mockPage.evaluate as any)
        .mockResolvedValueOnce([
          {
            ddtNumber: "DDT/26000515",
            orderId: "ORD/26000552",
            customerAccountId: "1002209",
            deliveryDate: "12/01/2026",
            deliveryMethod: "FedEx",
            deliveryCity: "Milano",
            trackingNumber: "445291888246",
            trackingUrl:
              "https://www.fedex.com/fedextrack/?trknbr=445291888246",
            trackingCourier: "fedex",
          },
        ])
        .mockResolvedValueOnce(false); // hasNextPage

      const result = await service.scrapeDDTData("testUserId");

      expect(result).toHaveLength(1);
      expect(result[0].ddtNumber).toBe("DDT/26000515");
      expect(result[0].orderId).toBe("ORD/26000552");
      expect(result[0].trackingNumber).toBe("445291888246");
      expect(result[0].trackingCourier).toBe("fedex");
    });

    test("handles pagination correctly", async () => {
      vi.spyOn(BrowserPool.getInstance(), "acquireContext").mockResolvedValue(
        mockContext,
      );
      vi.spyOn(BrowserPool.getInstance(), "releaseContext").mockResolvedValue(
        undefined,
      );

      // Mock page 1 data
      (mockPage.evaluate as any)
        .mockResolvedValueOnce([
          {
            ddtNumber: "DDT/26000515",
            orderId: "ORD/26000552",
            customerAccountId: "1002209",
            deliveryDate: "12/01/2026",
            deliveryMethod: "FedEx",
            deliveryCity: "Milano",
          },
        ])
        .mockResolvedValueOnce(true) // hasNextPage
        .mockResolvedValueOnce(undefined) // clickNextPage
        .mockResolvedValueOnce([
          {
            ddtNumber: "DDT/26000516",
            orderId: "ORD/26000553",
            customerAccountId: "1002210",
            deliveryDate: "13/01/2026",
            deliveryMethod: "UPS Italia",
            deliveryCity: "Roma",
          },
        ])
        .mockResolvedValueOnce(false); // hasNextPage

      const result = await service.scrapeDDTData("testUserId");

      expect(result).toHaveLength(2);
      expect(result[0].ddtNumber).toBe("DDT/26000515");
      expect(result[1].ddtNumber).toBe("DDT/26000516");
    });

    test("handles empty table gracefully", async () => {
      vi.spyOn(BrowserPool.getInstance(), "acquireContext").mockResolvedValue(
        mockContext,
      );
      vi.spyOn(BrowserPool.getInstance(), "releaseContext").mockResolvedValue(
        undefined,
      );

      (mockPage.evaluate as any)
        .mockResolvedValueOnce([]) // empty page
        .mockResolvedValueOnce(false); // hasNextPage

      const result = await service.scrapeDDTData("testUserId");

      expect(result).toHaveLength(0);
    });

    test("releases context even on error", async () => {
      const releaseContextSpy = vi.spyOn(
        BrowserPool.getInstance(),
        "releaseContext",
      );
      vi.spyOn(BrowserPool.getInstance(), "acquireContext").mockResolvedValue(
        mockContext,
      );

      (mockPage.goto as any).mockRejectedValueOnce(
        new Error("Navigation failed"),
      );

      await expect(service.scrapeDDTData("testUserId")).rejects.toThrow(
        "Navigation failed",
      );

      expect(releaseContextSpy).toHaveBeenCalledWith(
        "testUserId",
        mockContext,
        false,
      );
    });
  });

  describe("syncDDTToOrders", () => {
    let orderDb: OrderDatabase;
    let getOrderByIdSpy: any;
    let updateOrderDDTSpy: any;

    beforeEach(() => {
      // Reset singleton for test isolation
      (OrderDatabase as any).instance = undefined;
      orderDb = OrderDatabase.getInstance(":memory:");

      // Mock the service's orderDb to use our test instance
      Object.defineProperty(service, "orderDb", {
        get: () => orderDb,
        configurable: true,
      });

      getOrderByIdSpy = vi.spyOn(orderDb, "getOrderById");
      updateOrderDDTSpy = vi.spyOn(orderDb, "updateOrderDDT");
    });

    test("matches DDT to orders and updates database", async () => {
      const userId = "testUserId";

      // Insert test order
      orderDb.upsertOrders(userId, [
        {
          id: "ORD/26000552",
          orderNumber: "70.614",
          customerProfileId: "1002209",
          customerName: "Test Customer",
          deliveryName: "Test Delivery",
          deliveryAddress: "Via Roma 123",
          creationDate: "2026-01-10T10:00:00Z",
          deliveryDate: "2026-01-15T10:00:00Z",
          status: "Ordine aperto",
          customerReference: null,
        },
      ]);

      // DDT data to sync
      const ddtData: DDTData[] = [
        {
          ddtNumber: "DDT/26000515",
          orderId: "ORD/26000552",
          customerAccountId: "1002209",
          deliveryDate: "12/01/2026",
          deliveryMethod: "FedEx",
          deliveryCity: "Milano",
          trackingNumber: "445291888246",
          trackingUrl: "https://www.fedex.com/fedextrack/?trknbr=445291888246",
          trackingCourier: "fedex",
        },
      ];

      const result = await service.syncDDTToOrders(userId, ddtData);

      expect(result.success).toBe(true);
      expect(result.matched).toBe(1);
      expect(result.notFound).toBe(0);

      // Verify database was updated
      const order = orderDb.getOrderById(userId, "ORD/26000552");
      expect(order?.ddtNumber).toBe("DDT/26000515");
      expect(order?.trackingNumber).toBe("445291888246");
      expect(order?.trackingUrl).toBe(
        "https://www.fedex.com/fedextrack/?trknbr=445291888246",
      );
      expect(order?.trackingCourier).toBe("fedex");
    });

    test("handles order not found in database", async () => {
      const userId = "testUserId";

      // DDT for non-existent order
      const ddtData: DDTData[] = [
        {
          ddtNumber: "DDT/26000515",
          orderId: "ORD/99999999",
          customerAccountId: "1002209",
          deliveryDate: "12/01/2026",
          deliveryMethod: "FedEx",
          deliveryCity: "Milano",
        },
      ];

      const result = await service.syncDDTToOrders(userId, ddtData);

      expect(result.success).toBe(true);
      expect(result.matched).toBe(0);
      expect(result.notFound).toBe(1);
    });

    test("handles multiple DDTs with mixed results", async () => {
      const userId = "testUserId";

      // Insert one test order
      orderDb.upsertOrders(userId, [
        {
          id: "ORD/26000552",
          orderNumber: "70.614",
          customerProfileId: "1002209",
          customerName: "Test Customer",
          deliveryName: "Test Delivery",
          deliveryAddress: "Via Roma 123",
          creationDate: "2026-01-10T10:00:00Z",
          deliveryDate: "2026-01-15T10:00:00Z",
          status: "Ordine aperto",
          customerReference: null,
        },
      ]);

      // DDT data: one matching, one not
      const ddtData: DDTData[] = [
        {
          ddtNumber: "DDT/26000515",
          orderId: "ORD/26000552",
          customerAccountId: "1002209",
          deliveryDate: "12/01/2026",
          deliveryMethod: "FedEx",
          deliveryCity: "Milano",
        },
        {
          ddtNumber: "DDT/26000516",
          orderId: "ORD/99999999",
          customerAccountId: "1002210",
          deliveryDate: "13/01/2026",
          deliveryMethod: "UPS",
          deliveryCity: "Roma",
        },
      ];

      const result = await service.syncDDTToOrders(userId, ddtData);

      expect(result.success).toBe(true);
      expect(result.matched).toBe(1);
      expect(result.notFound).toBe(1);
      expect(result.scrapedCount).toBe(2);
    });

    test("handles DDT with minimal tracking data", async () => {
      const userId = "testUserId";

      orderDb.upsertOrders(userId, [
        {
          id: "ORD/26000552",
          orderNumber: "70.614",
          customerProfileId: "1002209",
          customerName: "Test Customer",
          deliveryName: "Test Delivery",
          deliveryAddress: "Via Roma 123",
          creationDate: "2026-01-10T10:00:00Z",
          deliveryDate: "2026-01-15T10:00:00Z",
          status: "Ordine aperto",
          customerReference: null,
        },
      ]);

      // DDT without tracking info
      const ddtData: DDTData[] = [
        {
          ddtNumber: "DDT/26000515",
          orderId: "ORD/26000552",
          customerAccountId: "1002209",
          deliveryDate: "12/01/2026",
          deliveryMethod: "FedEx",
          deliveryCity: "Milano",
          // No tracking fields
        },
      ];

      const result = await service.syncDDTToOrders(userId, ddtData);

      expect(result.success).toBe(true);
      expect(result.matched).toBe(1);

      const order = orderDb.getOrderById(userId, "ORD/26000552");
      expect(order?.ddtNumber).toBe("DDT/26000515");
      expect(order?.trackingNumber).toBeNull();
      expect(order?.trackingUrl).toBeNull();
      expect(order?.trackingCourier).toBeNull();
    });
  });
});

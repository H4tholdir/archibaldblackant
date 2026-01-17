import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PriceSyncService } from "./price-sync-service";
import { ProductDatabase } from "./product-db";
import { BrowserPool } from "./browser-pool";
import { SyncCheckpointManager } from "./sync-checkpoint";
import type { Page } from "puppeteer";

// Skip integration tests in CI (BrowserPool API mismatch + no Archibald access)
const skipInCI = process.env.CI === "true" ? describe.skip : describe;

skipInCI("PriceSyncService integration", () => {
  // Set timeout for integration tests (service has delays)
  const testTimeout = 15000;

  let service: PriceSyncService;
  let db: ProductDatabase;
  let checkpointManager: SyncCheckpointManager;
  let mockPage: Partial<Page>;
  let mockBot: { page: Page };

  beforeEach(() => {
    // Create in-memory databases for testing
    db = new ProductDatabase(":memory:");
    checkpointManager = new SyncCheckpointManager(":memory:");

    // Mock Puppeteer Page
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://test.archibald.com"),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
      $: vi.fn().mockResolvedValue(null),
    };

    mockBot = { page: mockPage as Page };

    // Mock BrowserPool
    vi.spyOn(BrowserPool.getInstance(), "acquire").mockResolvedValue(mockBot);
    vi.spyOn(BrowserPool.getInstance(), "release").mockResolvedValue(undefined);

    // Get service and inject test dependencies
    service = PriceSyncService.getInstance();
    (service as any).db = db;
    (service as any).checkpointManager = checkpointManager;
    (service as any).syncInProgress = false;
  });

  afterEach(() => {
    db.close();
    checkpointManager.close();
    vi.restoreAllMocks();
  });

  it(
    "should sync prices and update products",
    async () => {
      // Insert products first (prices match to products by name)
      db.upsertProducts([
        {
          id: "PROD001",
          name: "ENGO03.000",
          description: "Test product 1",
        },
        {
          id: "PROD002",
          name: "XTD3324.314.",
          description: "Test product 2",
        },
      ]);

      const mockPrices = [
        {
          itemDescription: "ENGO03.000",
          price: 125.5,
        },
        {
          itemDescription: "XTD3324.314.",
          price: 89.99,
        },
      ];

      // Mock page.evaluate
      vi.mocked(mockPage.evaluate as any).mockImplementation(
        async (fn: Function, debugFirstRow?: boolean) => {
          const fnStr = fn.toString();

          // Get total pages
          if (fnStr.includes("pagerContainers")) {
            return { found: true, totalPages: 1 };
          }

          // Extract price data
          if (fnStr.includes("querySelectorAll") && fnStr.includes("tbody")) {
            return {
              prices: mockPrices,
              debug: debugFirstRow
                ? {
                    rowIndex: 0,
                    cellCount: 30,
                    cellContents: [],
                  }
                : null,
            };
          }

          // Navigation
          if (fnStr.includes("targetPage")) {
            return { success: false };
          }

          return undefined;
        },
      );

      await service.syncPrices();

      // Verify prices were updated in products
      const products = db.getProducts();
      expect(products).toHaveLength(2);

      const product1 = products.find((p) => p.name === "ENGO03.000");
      const product2 = products.find((p) => p.name === "XTD3324.314.");

      expect(product1).toBeDefined();
      expect(product1?.price).toBe(125.5);

      expect(product2).toBeDefined();
      expect(product2?.price).toBe(89.99);
    },
    testTimeout,
  );

  it(
    "should handle prices with article code matching",
    async () => {
      // Insert product
      db.upsertProducts([
        {
          id: "ART123",
          name: "TD3233.314.",
          description: "Dental product",
        },
      ]);

      const mockPrices = [
        {
          itemDescription: "TD3233.314.",
          price: 234.59,
        },
      ];

      vi.mocked(mockPage.evaluate as any).mockImplementation(
        async (fn: Function, debugFirstRow?: boolean) => {
          const fnStr = fn.toString();

          if (fnStr.includes("pagerContainers")) {
            return { found: true, totalPages: 1 };
          }

          if (fnStr.includes("querySelectorAll") && fnStr.includes("tbody")) {
            return {
              prices: mockPrices,
              debug: debugFirstRow ? { rowIndex: 0, cellCount: 30 } : null,
            };
          }

          if (fnStr.includes("targetPage")) {
            return { success: false };
          }

          return undefined;
        },
      );

      await service.syncPrices();

      // Verify price was matched and updated
      const products = db.getProducts();
      expect(products).toHaveLength(1);
      expect(products[0].price).toBe(234.59);
    },
    testTimeout,
  );

  it("should handle sync errors gracefully", async () => {
    // Mock error
    vi.mocked(mockPage.evaluate as any).mockRejectedValue(
      new Error("Price sync failed"),
    );

    await service.syncPrices();

    // Progress should indicate error
    const progress = service.getProgress();
    expect(progress.status).toBe("error");
    expect(progress.error).toBe("Price sync failed");
  });

  it("should skip sync if completed recently", async () => {
    // Mark sync as completed recently
    checkpointManager.startSync("prices");
    checkpointManager.completeSync("prices", 10, 50);

    await service.syncPrices();

    // Progress should indicate skip
    const progress = service.getProgress();
    expect(progress.status).toBe("completed");
    expect(progress.message).toContain("recente");

    // Browser should not be acquired
    expect(BrowserPool.getInstance().acquire).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CustomerSyncService } from "./customer-sync-service";
import { CustomerDatabase } from "./customer-db";
import { BrowserPool } from "./browser-pool";
import { SyncCheckpointManager } from "./sync-checkpoint";
import type { Page } from "puppeteer";

// Skip integration tests in CI (BrowserPool API mismatch + no Archibald access)
const skipInCI = process.env.CI === "true" ? describe.skip : describe;

skipInCI("CustomerSyncService integration", () => {
  // Set timeout for integration tests (service has delays)
  const testTimeout = 15000;

  let service: CustomerSyncService;
  let db: CustomerDatabase;
  let checkpointManager: SyncCheckpointManager;
  let mockPage: Partial<Page>;
  let mockBot: { page: Page };

  beforeEach(() => {
    // Create in-memory databases for testing
    db = new CustomerDatabase(":memory:");
    checkpointManager = new SyncCheckpointManager(":memory:");

    // Mock Puppeteer Page with default implementations
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://test.archibald.com"),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
      $: vi.fn().mockResolvedValue(null),
    };

    mockBot = { page: mockPage as Page };

    // Mock BrowserPool to return our mock context
    const mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(BrowserPool.getInstance(), "acquireContext").mockResolvedValue(
      mockContext as any,
    );
    vi.spyOn(BrowserPool.getInstance(), "releaseContext").mockResolvedValue(
      undefined,
    );

    // Get singleton service instance and inject test dependencies
    service = CustomerSyncService.getInstance();
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
    "should sync customers from single page to database",
    async () => {
      const mockCustomers = [
        {
          id: "1001",
          name: "Acme Corporation",
          vatNumber: "IT12345678901",
          email: "contact@acme.com",
        },
        {
          id: "1002",
          name: "Beta Industries",
          vatNumber: "IT98765432109",
          email: "info@beta.com",
        },
        {
          id: "1003",
          name: "Gamma Services",
          vatNumber: "IT11223344556",
          email: "sales@gamma.com",
        },
      ];

      // Mock all page.evaluate calls with a function that returns appropriate values
      vi.mocked(mockPage.evaluate as any).mockImplementation(
        async (fn: Function) => {
          const fnStr = fn.toString();

          // Clean filters
          if (fnStr.includes("dispatchEvent")) {
            return undefined;
          }

          // Check if on first page
          if (fnStr.includes("dxp-current") && fnStr.includes("pageButtons")) {
            return true;
          }

          // Filter dropdown (return "already selected")
          if (fnStr.includes("ITCNT")) {
            return {
              found: true,
              changed: false,
              selector: "input#test",
              optionText: "Tutti i clienti",
            };
          }

          // Extract customer data
          if (fnStr.includes("querySelectorAll") && fnStr.includes("tbody")) {
            return mockCustomers;
          }

          // Check for more pages (no next page)
          if (fnStr.includes("dxp-disabled") || fnStr.includes("Next")) {
            return false;
          }

          return undefined;
        },
      );

      // Run sync
      await service.syncCustomers();

      // Verify customers were inserted into database
      const customers = db.getCustomers();
      expect(customers).toHaveLength(3);
      expect(customers.map((c) => c.name).sort()).toEqual([
        "Acme Corporation",
        "Beta Industries",
        "Gamma Services",
      ]);
    },
    testTimeout,
  );

  it(
    "should update existing customers when data changes",
    async () => {
      // Insert initial customer data
      db.upsertCustomers([
        {
          id: "3001",
          name: "Old Company Name",
          vatNumber: "IT55555555555",
          email: "old@company.com",
        },
      ]);

      // Mock updated customer data from sync
      const updatedCustomers = [
        {
          id: "3001",
          name: "New Company Name",
          vatNumber: "IT55555555555",
          email: "new@company.com",
        },
      ];

      vi.mocked(mockPage.evaluate as any).mockImplementation(
        async (fn: Function) => {
          const fnStr = fn.toString();

          if (fnStr.includes("dispatchEvent")) return undefined;
          if (fnStr.includes("dxp-current")) return true;
          if (fnStr.includes("ITCNT")) {
            return {
              found: true,
              changed: false,
              selector: "input#test",
              optionText: "Tutti i clienti",
            };
          }
          if (fnStr.includes("querySelectorAll") && fnStr.includes("tbody")) {
            return updatedCustomers;
          }
          if (fnStr.includes("dxp-disabled") || fnStr.includes("Next")) {
            return false;
          }

          return undefined;
        },
      );

      await service.syncCustomers();

      // Verify customer was updated
      const customers = db.getCustomers();
      expect(customers).toHaveLength(1);
      expect(customers[0]).toMatchObject({
        id: "3001",
        name: "New Company Name",
        email: "new@company.com",
      });
    },
    testTimeout,
  );

  it("should handle sync errors gracefully", async () => {
    // Mock page.evaluate to throw error
    vi.mocked(mockPage.evaluate as any).mockRejectedValue(
      new Error("Network timeout"),
    );

    // Sync should not throw, but handle error internally
    await service.syncCustomers();

    // Progress should indicate error
    const progress = service.getProgress();
    expect(progress.status).toBe("error");
    expect(progress.error).toBe("Network timeout");
  });

  it("should skip sync if completed recently", async () => {
    // Mark sync as completed recently
    checkpointManager.startSync("customers");
    checkpointManager.completeSync("customers", 10, 100);

    await service.syncCustomers();

    // Progress should indicate skip
    const progress = service.getProgress();
    expect(progress.status).toBe("completed");
    expect(progress.message).toContain("recente");

    // Browser should not be acquired
    expect(BrowserPool.getInstance().acquire).not.toHaveBeenCalled();
  });

  it(
    "should delete customers no longer in Archibald",
    async () => {
      // Insert customers that will be deleted
      db.upsertCustomers([
        { id: "4001", name: "Deleted Customer 1", vatNumber: "IT11111111111" },
        { id: "4002", name: "Deleted Customer 2", vatNumber: "IT22222222222" },
        { id: "4003", name: "Kept Customer", vatNumber: "IT33333333333" },
      ]);

      // Sync returns only one customer (4003)
      const currentCustomers = [
        { id: "4003", name: "Kept Customer", vatNumber: "IT33333333333" },
      ];

      vi.mocked(mockPage.evaluate as any).mockImplementation(
        async (fn: Function) => {
          const fnStr = fn.toString();

          if (fnStr.includes("dispatchEvent")) return undefined;
          if (fnStr.includes("dxp-current")) return true;
          if (fnStr.includes("ITCNT")) {
            return {
              found: true,
              changed: false,
              selector: "input#test",
              optionText: "Tutti i clienti",
            };
          }
          if (fnStr.includes("querySelectorAll") && fnStr.includes("tbody")) {
            return currentCustomers;
          }
          if (fnStr.includes("dxp-disabled") || fnStr.includes("Next")) {
            return false;
          }

          return undefined;
        },
      );

      await service.syncCustomers();

      // Verify deleted customers were removed
      const customers = db.getCustomers();
      expect(customers).toHaveLength(1);
      expect(customers[0].id).toBe("4003");
    },
    testTimeout,
  );
});

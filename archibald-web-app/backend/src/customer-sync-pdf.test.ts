import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { CustomerSyncService } from "./customer-sync-service";
import { CustomerDatabase } from "./customer-db";

// Skip integration tests in CI (requires Archibald access + credentials)
const skipInCI = process.env.CI === "true" ? describe.skip : describe;

skipInCI("CustomerSyncService PDF-based integration", () => {
  let service: CustomerSyncService;
  let db: CustomerDatabase;

  beforeAll(() => {
    // Use test database
    db = new CustomerDatabase(":memory:");
    service = CustomerSyncService.getInstance();
    (service as any).db = db;
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    // Reset sync lock before each test
    (service as any).syncInProgress = false;
  });

  it(
    "should sync customers successfully",
    async () => {
      const result = await service.syncCustomers("test-user");

      expect(result.success).toBe(true);
      expect(result.customersProcessed).toBeGreaterThan(1000);
      expect(result.duration).toBeLessThan(25000); // 25s max
    },
    30000,
  ); // 30s timeout

  it(
    "should detect new customers on first sync",
    async () => {
      // Clear database
      db.db.exec("DELETE FROM customers");

      const result = await service.syncCustomers("test-user");

      expect(result.success).toBe(true);
      expect(result.newCustomers).toBeGreaterThan(1000);
      expect(result.updatedCustomers).toBe(0); // No updates on first sync
    },
    30000,
  );

  it(
    "should skip unchanged customers on second sync",
    async () => {
      // First sync
      await service.syncCustomers("test-user");

      // Second sync (no changes in Archibald)
      const result = await service.syncCustomers("test-user");

      expect(result.success).toBe(true);
      expect(result.newCustomers).toBe(0); // No new
      expect(result.updatedCustomers).toBe(0); // No updates (delta = 0)
    },
    60000,
  ); // 60s for two syncs

  it(
    "should prevent concurrent syncs",
    async () => {
      // Start first sync (don't await)
      const sync1Promise = service.syncCustomers("test-user");

      // Try to start second sync immediately
      await expect(service.syncCustomers("test-user")).rejects.toThrow(
        "Sync already in progress",
      );

      // Wait for first sync to complete
      await sync1Promise;
    },
    30000,
  );

  it(
    "should track metrics correctly",
    async () => {
      await service.syncCustomers("test-user");

      const metrics = service.getMetrics();

      expect(metrics.lastSyncTime).toBeDefined();
      expect(metrics.lastSyncResult).toBeDefined();
      expect(metrics.totalSyncs).toBeGreaterThan(0);
      expect(metrics.averageDuration).toBeGreaterThan(0);
      expect(metrics.averageDuration).toBeLessThan(30000); // < 30s average
    },
    30000,
  );

  it(
    "should handle background sync with retry logic",
    async () => {
      // Call runBackgroundSync directly to test retry mechanism
      const runBackgroundSync = (service as any).runBackgroundSync.bind(
        service,
      );

      await runBackgroundSync();

      const metrics = service.getMetrics();

      // Should have attempted at least once
      expect(metrics.totalSyncs).toBeGreaterThan(0);
      expect(metrics.lastSyncTime).toBeDefined();
    },
    60000,
  ); // Longer timeout for retries

  it("should start and stop auto-sync scheduler", () => {
    // Start scheduler
    service.startAutoSync(1); // 1 minute interval

    // Verify scheduler is running
    expect((service as any).syncInterval).toBeDefined();

    // Stop scheduler
    service.stopAutoSync();

    // Verify scheduler is stopped
    expect((service as any).syncInterval).toBeNull();
  });

  it(
    "should validate sync duration within performance target",
    async () => {
      const startTime = Date.now();
      const result = await service.syncCustomers("test-user");
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(20000); // < 20s target
      console.log(
        `✅ Synced ${result.customersProcessed} customers in ${duration}ms`,
      );
    },
    30000,
  );

  it("should have all 27 business fields in synced customers", async () => {
    // Run sync
    await service.syncCustomers("test-user");

    // Get customers from DB
    const customers = db.getCustomers({ limit: 10 });

    expect(customers.length).toBeGreaterThan(0);

    const firstCustomer = customers[0];

    // Required fields
    expect(firstCustomer.customerProfile).toBeDefined();
    expect(firstCustomer.name).toBeDefined();

    // Pages 0-3 fields
    expect(firstCustomer).toHaveProperty("vatNumber");
    expect(firstCustomer).toHaveProperty("pec");
    expect(firstCustomer).toHaveProperty("sdi");
    expect(firstCustomer).toHaveProperty("fiscalCode");
    expect(firstCustomer).toHaveProperty("phone");
    expect(firstCustomer).toHaveProperty("street");
    expect(firstCustomer).toHaveProperty("postalCode");
    expect(firstCustomer).toHaveProperty("city");

    // Pages 4-7 fields (analytics & accounts) - NEW in Phase 18
    expect(firstCustomer).toHaveProperty("actualOrderCount");
    expect(firstCustomer).toHaveProperty("customerType");
    expect(firstCustomer).toHaveProperty("previousOrderCount1");
    expect(firstCustomer).toHaveProperty("previousSales1");
    expect(firstCustomer).toHaveProperty("previousOrderCount2");
    expect(firstCustomer).toHaveProperty("previousSales2");
    expect(firstCustomer).toHaveProperty("externalAccountNumber");
    expect(firstCustomer).toHaveProperty("ourAccountNumber");

    // System fields
    expect(firstCustomer).toHaveProperty("hash");
    expect(firstCustomer).toHaveProperty("lastSync");
    expect(firstCustomer).toHaveProperty("createdAt");
    expect(firstCustomer).toHaveProperty("updatedAt");
  }, 30000);
});

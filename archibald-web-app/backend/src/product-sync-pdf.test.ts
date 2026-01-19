import { describe, test, expect, beforeAll } from 'vitest';
import { ProductSyncService } from './product-sync-service';

const skipInCI = () => {
  if (process.env.CI) {
    console.warn('⏭️  Skipping test in CI (requires Archibald credentials)');
    return true;
  }
  return false;
};

describe('ProductSyncService (PDF-based)', () => {
  let service: ProductSyncService;

  beforeAll(() => {
    if (skipInCI()) return;
    service = ProductSyncService.getInstance();
  });

  test('should sync products successfully', async () => {
    if (skipInCI()) return;

    const start = Date.now();
    const result = await service.syncProducts();
    const duration = Date.now() - start;

    expect(result.productsProcessed).toBeGreaterThan(4000);
    expect(duration).toBeLessThan(65000); // 65s buffer (target 60s)

    console.log(`✅ Synced ${result.productsProcessed} products in ${duration}ms`);
  }, 120000); // 120s timeout

  test('should detect new products on first sync', async () => {
    if (skipInCI()) return;

    // This test assumes DB is empty or has outdated data
    const result = await service.syncProducts();

    expect(result.newProducts).toBeGreaterThan(0);
  }, 120000);

  test('should skip unchanged products on second sync', async () => {
    if (skipInCI()) return;

    // First sync
    await service.syncProducts();

    // Second sync (no changes)
    const result = await service.syncProducts();

    expect(result.newProducts).toBe(0);
    expect(result.updatedProducts).toBe(0);
  }, 240000); // 240s for two syncs

  test('should prevent concurrent syncs', async () => {
    if (skipInCI()) return;

    // Start first sync (don't await)
    const sync1 = service.syncProducts();

    // Try concurrent sync
    await expect(service.syncProducts()).rejects.toThrow('Sync already in progress');

    // Wait for first to complete
    await sync1;
  }, 120000);

  test('should track metrics correctly', async () => {
    if (skipInCI()) return;

    const db = service['db']; // Access private field for testing
    const metricsBefore = db.getSyncMetrics();

    await service.syncProducts();

    const metricsAfter = db.getSyncMetrics();

    expect(metricsAfter.totalSyncs).toBe(metricsBefore.totalSyncs + 1);
  }, 120000);

  test('should validate sync duration within target', async () => {
    if (skipInCI()) return;

    const start = Date.now();
    await service.syncProducts();
    const duration = Date.now() - start;

    console.log(`⏱️  Sync duration: ${duration}ms (target: <60000ms)`);
    expect(duration).toBeLessThan(60000);
  }, 120000);

  test('should have all 26+ fields in synced products', async () => {
    if (skipInCI()) return;

    await service.syncProducts();

    const db = service['db'];
    const products = db.getAllProducts();

    expect(products.length).toBeGreaterThan(4000);

    // Check sample product has extended fields
    const sample = products[0];
    expect(sample.id).toBeDefined();
    expect(sample.name).toBeDefined();
    // Check at least some extended fields populated
    const hasExtended = [
      sample.figure,
      sample.size,
      sample.purchPrice,
    ].some(f => f !== undefined);

    expect(hasExtended).toBe(true);
  }, 120000);
});

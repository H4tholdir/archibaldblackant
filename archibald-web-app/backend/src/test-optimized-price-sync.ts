/**
 * Test optimized price sync extraction
 *
 * This tests the new index-based extraction from PRICEDISCTABLE
 */

import { PriceSyncService } from "./price-sync-service";
import { logger } from "./logger";

async function testOptimizedPriceSync() {
  logger.info("🧪 Testing optimized price sync...");

  const priceSync = PriceSyncService.getInstance();

  try {
    // Force full sync to test extraction logic
    logger.info("Starting full price sync (first page only for test)...");

    await priceSync.syncPrices(true); // force full sync

    logger.info("\n✅ Test completed! Check logs above for sample data.");
  } catch (error) {
    logger.error("❌ Test failed:", error);
    throw error;
  }
}

if (require.main === module) {
  testOptimizedPriceSync()
    .then(() => {
      logger.info("\n✅ All tests passed!");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}

export { testOptimizedPriceSync };

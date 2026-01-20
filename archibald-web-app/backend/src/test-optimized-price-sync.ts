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
    // Test price sync (PDF-based, no force parameter needed)
    logger.info("Starting price sync test...");

    await priceSync.syncPrices();

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

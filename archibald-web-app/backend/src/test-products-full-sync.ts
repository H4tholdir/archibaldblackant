import { ProductSyncService } from "./product-sync-service";
import { logger } from "./logger";

async function testProductsFullSync() {
  logger.info("=== Products Full Sync Test ===");

  const service = ProductSyncService.getInstance();

  try {
    const result = await service.syncProducts((progress) => {
      logger.info(`[Progress] ${progress.stage}: ${progress.message}`);
    });

    logger.info("✅ Sync successful:", result);
    logger.info("🎉 Test passed!");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Test failed", { error });
    process.exit(1);
  }
}

testProductsFullSync();

import { customerSyncService } from "./customer-sync-service";
import { logger } from "./logger";

async function testFullSync() {
  try {
    logger.info("Starting full sync test...");

    const result = await customerSyncService.syncCustomers((progress) => {
      logger.info(`[Progress] ${progress.stage}: ${progress.message}`);
    });

    if (result.success) {
      logger.info("✅ Sync successful:", result);
      logger.info(`  - Processed: ${result.customersProcessed}`);
      logger.info(`  - New: ${result.newCustomers}`);
      logger.info(`  - Updated: ${result.updatedCustomers}`);
      logger.info(`  - Duration: ${result.duration}ms`);
      logger.info("🎉 Test passed!");
      process.exit(0);
    } else {
      logger.error("❌ Sync failed:", result.error);
      process.exit(1);
    }
  } catch (error: any) {
    logger.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testFullSync();

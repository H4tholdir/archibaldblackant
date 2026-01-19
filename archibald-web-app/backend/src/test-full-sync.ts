import { customerSyncService } from "./customer-sync-service";
import { PasswordCache } from "./password-cache";
import { UserDatabase } from "./user-db";
import { logger } from "./logger";
import { config } from "./config";

async function testFullSync() {
  try {
    logger.info("Starting full sync test...");

    // Setup: Get credentials from config
    const username = config.archibald.username;
    const password = config.archibald.password;

    if (!username || !password) {
      throw new Error(
        "ARCHIBALD_USERNAME and ARCHIBALD_PASSWORD must be set in .env",
      );
    }

    logger.info(`Using Archibald credentials for user: ${username}`);

    // Create or get test user
    const userDb = UserDatabase.getInstance();
    let user = userDb.getUserByUsername(username);

    if (!user) {
      // Create test user
      user = userDb.createUser(username, "Customer Sync Test User", "admin");
      logger.info(`Created test user: ${user.id}`);
    }

    const userId = user.id;
    logger.info(`Using user: ${userId} (${username})`);

    // Cache password for test user
    PasswordCache.getInstance().set(userId, password);
    logger.info(`Password cached for ${userId}`);

    // Run sync with the test user's ID
    const result = await customerSyncService.syncCustomers((progress) => {
      logger.info(`[Progress] ${progress.stage}: ${progress.message}`);
    }, userId);

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

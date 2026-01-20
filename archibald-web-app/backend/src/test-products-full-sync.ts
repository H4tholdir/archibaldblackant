import { ProductSyncService } from "./product-sync-service";
import { PasswordCache } from "./password-cache";
import { UserDatabase } from "./user-db";
import { logger } from "./logger";
import { config } from "./config";

async function testProductsFullSync() {
  logger.info("=== Products Full Sync Test ===");

  try {
    // Setup: Get credentials from config
    const username = config.archibald.username;
    const password = config.archibald.password;

    if (!username || !password) {
      throw new Error(
        "ARCHIBALD_USERNAME and ARCHIBALD_PASSWORD must be set in .env",
      );
    }

    // Create or get user
    const userDb = UserDatabase.getInstance();
    let user = userDb.getUserByUsername(username);

    if (!user) {
      user = userDb.createUser(username, "Product Sync Test", "admin");
      logger.info(`Created user: ${user.id}`);
    }

    const userId = user.id;
    logger.info(`Using user: ${userId} (${username})`);

    // Cache password for the user
    PasswordCache.getInstance().set(userId, password);
    logger.info(`Password cached for ${userId}`);

    const service = ProductSyncService.getInstance();

    const result = await service.syncProducts(
      (progress) => {
        logger.info(`[Progress] ${progress.stage}: ${progress.message}`);
      },
      userId, // Pass userId to sync
    );

    logger.info("✅ Sync successful:", result);
    logger.info("🎉 Test passed!");
    process.exit(0);
  } catch (error: any) {
    logger.error("❌ Test failed", {
      error: error.message,
      stack: error.stack,
    });
    console.error("Full error:", error);
    process.exit(1);
  }
}

testProductsFullSync();

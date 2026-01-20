import { BrowserPool } from "./browser-pool";
import { ArchibaldBot } from "./archibald-bot";
import { PasswordCache } from "./password-cache";
import { UserDatabase } from "./user-db";
import { logger } from "./logger";
import { config } from "./config";
import { promises as fs } from "fs";

async function testProductsPDFDownload() {
  logger.info("=== Products PDF Download Test ===");
  let context: any = null;
  let userId: string | null = null;

  try {
    // Setup: Get credentials from config
    const username = config.archibald.username;
    const password = config.archibald.password;

    if (!username || !password) {
      throw new Error(
        "ARCHIBALD_USERNAME and ARCHIBALD_PASSWORD must be set in .env",
      );
    }

    // Create or get test user
    const userDb = UserDatabase.getInstance();
    let user = userDb.getUserByUsername(username);

    if (!user) {
      // Create test user
      user = userDb.createUser(username, "Test Products PDF Download", "admin");
      logger.info(`Created test user: ${user.id}`);
    }

    userId = user.id;
    logger.info(`Using user: ${userId} (${username})`);

    // Cache password for test user
    PasswordCache.getInstance().set(userId, password);
    logger.info(`Password cached for ${userId}`);

    // Acquire context
    context = await BrowserPool.getInstance().acquireContext(userId);

    const bot = new ArchibaldBot(userId);

    // Download PDF
    const pdfPath = await bot.downloadProductsPDF(context);
    logger.info(`✅ PDF downloaded: ${pdfPath}`);

    // Check file
    const stats = await fs.stat(pdfPath);
    logger.info(`✅ PDF size: ${Math.round(stats.size / 1024)} KB`);

    // Cleanup
    await fs.unlink(pdfPath);
    logger.info("✅ Temp file cleaned up");

    // Release context
    await BrowserPool.getInstance().releaseContext(userId, context, true);

    logger.info("🎉 Test passed!");
    process.exit(0);
  } catch (error: any) {
    logger.error("❌ Test failed", {
      error: error.message,
      stack: error.stack,
    });
    console.error("Full error:", error);
    if (context && userId) {
      await BrowserPool.getInstance().releaseContext(userId, context, false);
    }
    process.exit(1);
  }
}

testProductsPDFDownload();

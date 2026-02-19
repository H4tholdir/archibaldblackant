import { BrowserPool } from "./browser-pool";
import { ArchibaldBot } from "./bot/archibald-bot";
import { PasswordCache } from "./password-cache";
import { UserDatabase } from "./user-db";
import { logger } from "./logger";
import { config } from "./config";
import * as fs from "fs";

async function testPDFDownload() {
  try {
    logger.info("Starting PDF download test...");

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
      user = userDb.createUser(username, "Test PDF Download User", "admin");
      logger.info(`Created test user: ${user.id}`);
    }

    const userId = user.id;
    logger.info(`Using user: ${userId} (${username})`);

    // Cache password for test user
    PasswordCache.getInstance().set(userId, password);
    logger.info(`Password cached for ${userId}`);

    const browserPool = BrowserPool.getInstance();

    // Acquire context
    const context = await browserPool.acquireContext(userId);
    const bot = new ArchibaldBot(userId);

    // Download PDF
    const pdfPath = await bot.downloadCustomersPDF(context);
    logger.info(`✅ PDF downloaded: ${pdfPath}`);

    // Verify file
    const stats = fs.statSync(pdfPath);
    logger.info(`✅ PDF size: ${(stats.size / 1024).toFixed(2)} KB`);

    // Cleanup
    fs.unlinkSync(pdfPath);
    logger.info("✅ Temp file cleaned up");

    // Release context
    await browserPool.releaseContext(userId, context, true);

    logger.info("🎉 Test passed!");
    process.exit(0);
  } catch (error: any) {
    logger.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testPDFDownload();

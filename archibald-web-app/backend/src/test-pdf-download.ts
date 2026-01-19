import { BrowserPool } from "./browser-pool";
import { ArchibaldBot } from "./archibald-bot";
import { logger } from "./logger";
import * as fs from "fs";

async function testPDFDownload() {
  try {
    logger.info("Starting PDF download test...");

    const browserPool = BrowserPool.getInstance();
    const syncUserId = "test-pdf-download";

    // Acquire context
    const context = await browserPool.acquireContext(syncUserId);
    const bot = new ArchibaldBot(syncUserId);

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
    await browserPool.releaseContext(syncUserId, context, true);

    logger.info("🎉 Test passed!");
    process.exit(0);
  } catch (error: any) {
    logger.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testPDFDownload();

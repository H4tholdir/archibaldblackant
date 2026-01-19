import { BrowserPool } from "./browser-pool";
import { ArchibaldBot } from "./archibald-bot";
import { logger } from "./logger";
import { promises as fs } from "fs";

async function testProductsPDFDownload() {
  logger.info("=== Products PDF Download Test ===");
  let context: any = null;

  try {
    // Acquire context
    context = await BrowserPool.getInstance().acquireContext(
      "test-products-download",
    );

    const bot = new ArchibaldBot("system");

    // Download PDF
    const pdfPath = await bot.downloadProductsPDF(context);
    logger.info(`✅ PDF downloaded: ${pdfPath}`);

    // Check file
    const stats = await fs.stat(pdfPath);
    logger.info(`✅ PDF size: ${Math.round(stats.size / 1024)} KB`);

    // Cleanup
    await fs.unlink(pdfPath);
    logger.info("✅ Temp file cleaned up");

    await BrowserPool.getInstance().releaseContext(
      "test-products-download",
      context,
      true,
    );

    logger.info("🎉 Test passed!");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Test failed", { error });
    if (context) {
      await BrowserPool.getInstance().releaseContext(
        "test-products-download",
        context,
        false,
      );
    }
    process.exit(1);
  }
}

testProductsPDFDownload();

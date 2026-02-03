import { logger } from "./logger";
import { PDFParserPricesService } from "./pdf-parser-prices-service";
import { PriceDatabase } from "./price-db";
import { PriceMatchingService } from "./price-matching-service";
import { PriceHistoryDatabase } from "./price-history-db";

async function testPriceSyncE2E() {
  logger.info("=== Price Sync E2E Test ===");

  try {
    // Step 1: Health check
    logger.info("[Step 1] Running health check...");
    const parserService = PDFParserPricesService.getInstance();
    const health = await parserService.healthCheck();

    if (!health.healthy) {
      throw new Error("Health check failed");
    }
    logger.info("✓ Health check passed");

    // Step 2: Parse PDF
    const pdfPath = process.env.PRICES_PDF_PATH || "/tmp/prezzi-test.pdf";
    logger.info(`[Step 2] Parsing PDF: ${pdfPath}`);
    const parsedPrices = await parserService.parsePDF(pdfPath);
    logger.info(`✓ Parsed ${parsedPrices.length} prices`);

    // Step 3: Save to prices.db
    logger.info("[Step 3] Saving to prices.db...");
    const priceDb = PriceDatabase.getInstance();
    let inserted = 0;

    for (const price of parsedPrices.slice(0, 100)) {
      // Test with first 100
      const result = priceDb.upsertPrice({
        productId: price.product_id,
        productName: price.product_name ?? "Unknown",
        unitPrice: price.unit_price ?? null,
        itemSelection: price.item_selection ?? null,
        packagingDescription: null, // Not in ParsedPrice interface
        currency: price.currency ?? null,
        priceValidFrom: price.price_valid_from ?? null,
        priceValidTo: price.price_valid_to ?? null,
        priceUnit: price.price_unit ?? null,
        accountDescription: price.account_description ?? null,
        accountCode: price.account_code ?? null,
        priceQtyFrom: price.quantity_from
          ? parseFloat(price.quantity_from)
          : null,
        priceQtyTo: price.quantity_to ? parseFloat(price.quantity_to) : null,
        lastModified: null, // Not in ParsedPrice interface
        dataAreaId: null, // Not in ParsedPrice interface
        lastSync: Math.floor(Date.now() / 1000),
      });
      if (result === "inserted") inserted++;
    }
    logger.info(`✓ Saved ${inserted} prices`);

    // Step 4: Match with products.db
    logger.info("[Step 4] Matching prices with products...");
    const matchingService = PriceMatchingService.getInstance();
    const matchResult = await matchingService.matchPricesToProducts();
    logger.info(`✓ Matched ${matchResult.result.matchedProducts} products`);

    // Step 5: Verify history
    logger.info("[Step 5] Verifying price history...");
    const historyDb = PriceHistoryDatabase.getInstance();
    const stats = historyDb.getRecentStats(30);
    logger.info(
      `✓ History: ${stats.totalChanges} changes, ${stats.increases} increases, ${stats.decreases} decreases`,
    );

    // Step 6: Verify sync stats
    logger.info("[Step 6] Verifying sync statistics...");
    const syncStats = priceDb.getSyncStats();
    logger.info(
      `✓ Total prices: ${syncStats.totalPrices}, null prices: ${syncStats.pricesWithNullPrice}`,
    );

    logger.info("=== E2E Test Complete ✓ ===");
    process.exit(0);
  } catch (error) {
    logger.error("❌ E2E Test failed", { error });
    process.exit(1);
  }
}

testPriceSyncE2E();

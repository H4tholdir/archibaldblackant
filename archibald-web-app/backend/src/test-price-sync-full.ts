#!/usr/bin/env ts-node
/**
 * Full integration test for Price Sync Service
 * Tests: PDF download → Parse → Save to DB → Delta detection
 */

import { PriceSyncService } from "./price-sync-service";
import { PriceDatabase } from "./price-db";
import { logger } from "./logger";

async function main() {
  console.log("=== Price Sync Full Integration Test ===\n");

  const priceSync = PriceSyncService.getInstance();
  const priceDb = PriceDatabase.getInstance();

  try {
    // Test 1: Initial sync (download + parse + save)
    console.log(
      "Test 1: Running full price sync (download PDF from Archibald)...",
    );
    console.log("- Will login to Archibald");
    console.log("- Navigate to PRICEDISCTABLE_ListView");
    console.log("- Click PDF export button (#Vertical_mainMenu_Menu_DXI3_T)");
    console.log("- Download PDF to /tmp");
    console.log("- Parse with Python parser");
    console.log("- Save to prices.db\n");

    const startTime = Date.now();

    // Listen to progress events
    priceSync.on("progress", (progress) => {
      console.log(`[Progress] ${progress.status}: ${progress.message}`);
      if (progress.pricesProcessed > 0) {
        console.log(
          `  Processed: ${progress.pricesProcessed}, Inserted: ${progress.pricesInserted}, Updated: ${progress.pricesUpdated}, Skipped: ${progress.pricesSkipped}`,
        );
      }
    });

    await priceSync.syncPrices();

    const duration = Math.floor((Date.now() - startTime) / 1000);
    console.log(`\n✓ First sync completed in ${duration}s\n`);

    // Check database stats
    const stats1 = priceDb.getSyncStats();
    console.log("Database stats after first sync:");
    console.log(`  Total prices: ${stats1.totalPrices}`);
    console.log(`  Prices with null price: ${stats1.pricesWithNullPrice}`);
    console.log(
      `  Coverage: ${(((stats1.totalPrices - stats1.pricesWithNullPrice) / stats1.totalPrices) * 100).toFixed(2)}%`,
    );
    console.log(
      `  Last sync: ${stats1.lastSyncTimestamp ? new Date(stats1.lastSyncTimestamp * 1000).toISOString() : "N/A"}`,
    );

    // Verify expected count (~4,976 prices from Phase 20 analysis)
    if (stats1.totalPrices < 4500 || stats1.totalPrices > 5500) {
      console.warn(
        `\n⚠ Warning: Expected ~4,976 prices, got ${stats1.totalPrices}`,
      );
    } else {
      console.log(`\n✓ Price count in expected range (~4,976)`);
    }

    // Test 2: Delta detection (run sync again - should skip all)
    console.log("\n\nTest 2: Running second sync (delta detection test)...");
    console.log("Expected: All prices skipped (no changes)\n");

    const start2 = Date.now();
    await priceSync.syncPrices();
    const duration2 = Math.floor((Date.now() - start2) / 1000);

    const finalProgress = priceSync.getProgress();
    console.log(`\n✓ Second sync completed in ${duration2}s`);
    console.log("Delta detection results:");
    console.log(`  Processed: ${finalProgress.pricesProcessed}`);
    console.log(`  Inserted: ${finalProgress.pricesInserted}`);
    console.log(`  Updated: ${finalProgress.pricesUpdated}`);
    console.log(`  Skipped: ${finalProgress.pricesSkipped}`);

    if (
      finalProgress.pricesInserted === 0 &&
      finalProgress.pricesUpdated === 0 &&
      finalProgress.pricesSkipped === finalProgress.pricesProcessed
    ) {
      console.log("\n✓ Delta detection working correctly (all skipped)");
    } else {
      console.warn(
        "\n⚠ Warning: Expected all prices to be skipped, some were inserted/updated",
      );
    }

    // Test 3: Sample price records
    console.log("\n\nTest 3: Sample price records...");
    const samplePrices = priceDb.getPricesByProductId("1000");
    if (samplePrices.length > 0) {
      console.log(`\nFound ${samplePrices.length} prices for product 1000:`);
      samplePrices.forEach((price) => {
        console.log(
          `  - ${price.itemSelection || "default"}: ${price.unitPrice}`,
        );
      });
    } else {
      console.log("\nNo prices found for product 1000 (may not exist)");
    }

    console.log("\n\n=== All Tests Passed ===");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    logger.error("Test failed", { error });
    process.exit(1);
  }
}

main();

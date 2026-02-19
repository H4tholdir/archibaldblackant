/**
 * Complete order creation flow test with screenshots at each step
 * This test creates a single order and captures screenshots at every critical step
 * to verify the entire A-Z process.
 *
 * Usage: DEBUG_SCREENSHOTS=true TEST_CREATE_ORDER=true npx tsx src/test-complete-flow.ts
 */

import { ArchibaldBot } from "./bot/archibald-bot";
import { ProductDatabase } from "./product-db";
import { logger } from "./logger";
import type { OrderData } from "./types";
import * as fs from "fs/promises";
import * as path from "path";

async function main() {
  const bot = new ArchibaldBot();
  const db = ProductDatabase.getInstance();

  try {
    logger.info("");
    logger.info("========================================");
    logger.info("  COMPLETE ORDER FLOW TEST WITH SCREENSHOTS");
    logger.info("========================================");
    logger.info("");
    logger.info("This test will create a single order and capture");
    logger.info("screenshots at every step to verify the complete flow.");
    logger.info("");

    // Find test article with multiple packages
    const allProducts = db.getProducts();
    const articleGroups: Record<string, typeof allProducts> = {};
    allProducts.forEach((p) => {
      if (!articleGroups[p.name]) articleGroups[p.name] = [];
      articleGroups[p.name].push(p);
    });

    const multiVariants = Object.entries(articleGroups).filter(
      ([_, products]) => products.length > 1,
    );

    if (multiVariants.length === 0) {
      logger.error("No multi-package articles found. Run product sync first.");
      process.exit(1);
    }

    const [testArticleName, variants] = multiVariants[0];
    const sortedVariants = variants.sort(
      (a, b) => (b.multipleQty || 0) - (a.multipleQty || 0),
    );
    const highestMultiple = sortedVariants[0].multipleQty || 1;
    const lowQuantity = Math.max(1, highestMultiple - 1);

    logger.info("Test Configuration:");
    logger.info(`  Article: ${testArticleName}`);
    logger.info(`  Quantity: ${lowQuantity}`);
    logger.info(`  Expected Package: 1 (lowest variant)`);
    logger.info(`  Variants Available:`);
    variants.forEach((v) => {
      logger.info(
        `    - ${v.id}: package=${v.packageContent}, multipleQty=${v.multipleQty}`,
      );
    });
    logger.info("");

    logger.info("📌 Step 1: Initializing browser...");
    await bot.initialize();
    logger.info("✅ Browser initialized");
    logger.info("");

    logger.info("📌 Step 2: Logging in...");
    await bot.login();
    logger.info("✅ Logged in successfully");
    logger.info("");

    logger.info("📌 Step 3: Creating order with detailed step tracking...");
    logger.info("");

    // OPT-04: Test with 2 articles to verify multi-article "New" button optimization
    const orderData: OrderData = {
      customerId: "",
      customerName: "Fresis Soc Cooperativa",
      items: [
        {
          articleCode: testArticleName,
          quantity: lowQuantity,
          description: "",
          price: 0,
        },
        {
          articleCode: testArticleName, // Same article, second item
          quantity: lowQuantity + 1,
          description: "",
          price: 0,
        },
      ],
    };

    logger.info("Order Details:");
    logger.info(`  Customer: ${orderData.customerName}`);
    logger.info(`  Article 1: ${testArticleName} (qty: ${lowQuantity})`);
    logger.info(`  Article 2: ${testArticleName} (qty: ${lowQuantity + 1})`);
    logger.info("  [Multi-article test for OPT-04: New button optimization]");
    logger.info("");

    logger.info(
      "Creating order... (screenshots will be saved to logs/ directory)",
    );
    const orderId = await bot.createOrder(orderData);

    logger.info("");
    logger.info("========================================");
    logger.info("  ORDER CREATION COMPLETED");
    logger.info("========================================");
    logger.info("");
    logger.info(`✅ Order ID: ${orderId}`);
    logger.info("");

    // Generate performance dashboard
    logger.info("📊 Generating performance dashboard...");
    const paths = await bot.generatePerformanceDashboard("./profiling-reports");
    logger.info("✅ Dashboard generated:");
    logger.info(`   📄 HTML: ${paths.htmlPath}`);
    logger.info(`   📊 JSON: ${paths.jsonPath}`);
    logger.info(`   📈 CSV: ${paths.csvPath}`);
    logger.info("");
    logger.info("🌐 Open HTML dashboard in browser to view results");
    logger.info("");

    logger.info("📸 Screenshots saved in logs/ directory:");
    logger.info("  - Check debug-*.png files for each step");
    logger.info("");
    logger.info("Please verify in Archibald:");
    logger.info(`  1. Order ${orderId} exists`);
    logger.info(`  2. Customer: Fresis Soc Cooperativa`);
    logger.info(`  3. Article: ${testArticleName}`);
    logger.info(`  4. Quantity: ${lowQuantity}`);
    logger.info(`  5. Correct package variant selected`);
    logger.info("");

    await bot.close();
    logger.info("✅ Test complete!");
  } catch (error) {
    logger.error("❌ Test failed:", error);
    logger.error("");
    logger.error(
      "Check logs/ directory for debug screenshots to identify the issue.",
    );
    await bot.close();
    process.exit(1);
  }
}

main();

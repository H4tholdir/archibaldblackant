/**
 * Multi-article order test with different package quantities
 * Tests:
 * - Multiple articles in single order
 * - Different quantity thresholds for package selection
 * - Fast paste method for customer/article input
 *
 * Usage: DEBUG_SCREENSHOTS=true npx tsx src/test-multi-article.ts
 */

import { ArchibaldBot } from "./archibald-bot";
import { ProductDatabase } from "./product-db";
import { logger } from "./logger";
import type { OrderData } from "./types";

async function main() {
  const bot = new ArchibaldBot();
  const db = ProductDatabase.getInstance();

  try {
    logger.info("");
    logger.info("========================================");
    logger.info("  MULTI-ARTICLE ORDER TEST");
    logger.info("  with Package Selection Logic");
    logger.info("========================================");
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
    const lowestMultiple = sortedVariants[sortedVariants.length - 1].multipleQty || 1;

    // Create test cases with different quantities
    const lowQuantity = Math.max(1, highestMultiple - 1); // Should select smallest package
    const highQuantity = highestMultiple + 5; // Should select largest package
    const thresholdQuantity = highestMultiple; // Should select largest package

    logger.info("Test Configuration:");
    logger.info(`  Article: ${testArticleName}`);
    logger.info(`  Variants Available:`);
    variants.forEach((v) => {
      logger.info(
        `    - ${v.id}: package=${v.packageContent}, multipleQty=${v.multipleQty}`,
      );
    });
    logger.info("");
    logger.info("Test Cases:");
    logger.info(`  1. Quantity ${lowQuantity} → Expected package: ${lowestMultiple} (smallest)`);
    logger.info(
      `  2. Quantity ${thresholdQuantity} → Expected package: ${highestMultiple} (largest, at threshold)`,
    );
    logger.info(
      `  3. Quantity ${highQuantity} → Expected package: ${highestMultiple} (largest, above threshold)`,
    );
    logger.info("");

    logger.info("📌 Step 1: Initializing browser...");
    await bot.initialize();
    logger.info("✅ Browser initialized");
    logger.info("");

    logger.info("📌 Step 2: Logging in...");
    await bot.login();
    logger.info("✅ Logged in successfully");
    logger.info("");

    logger.info("📌 Step 3: Creating multi-article order...");
    logger.info("");

    const orderData: OrderData = {
      customerId: "",
      customerName: "Fresis Soc Cooperativa",
      items: [
        {
          articleCode: testArticleName,
          quantity: lowQuantity,
          description: `Test case 1: Low qty (${lowQuantity}) → Small package`,
          price: 0,
        },
        {
          articleCode: testArticleName,
          quantity: thresholdQuantity,
          description: `Test case 2: Threshold qty (${thresholdQuantity}) → Large package`,
          price: 0,
        },
        {
          articleCode: testArticleName,
          quantity: highQuantity,
          description: `Test case 3: High qty (${highQuantity}) → Large package`,
          price: 0,
        },
      ],
    };

    logger.info("Order Configuration:");
    logger.info(`  Customer: ${orderData.customerName}`);
    logger.info(`  Total Line Items: ${orderData.items.length}`);
    logger.info("");
    orderData.items.forEach((item, idx) => {
      const selectedVariant = db.selectPackageVariant(
        item.articleCode,
        item.quantity,
      );
      logger.info(`  Line ${idx + 1}:`);
      logger.info(`    Article: ${item.articleCode}`);
      logger.info(`    Quantity: ${item.quantity}`);
      logger.info(`    Expected Variant: ${selectedVariant?.id}`);
      logger.info(`    Expected Package: ${selectedVariant?.packageContent}`);
      logger.info("");
    });

    logger.info("Creating order with PASTE method (fast)...");
    logger.info("(screenshots will be saved to logs/ directory)");
    logger.info("");

    const startTime = Date.now();
    const orderId = await bot.createOrder(orderData);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.info("");
    logger.info("========================================");
    logger.info("  ORDER CREATION COMPLETED");
    logger.info("========================================");
    logger.info("");
    logger.info(`✅ Order ID: ${orderId}`);
    logger.info(`⏱️  Duration: ${duration}s`);
    logger.info("");
    logger.info("📸 Screenshots saved in logs/ directory");
    logger.info("");

    logger.info("========================================");
    logger.info("  MANUAL VERIFICATION REQUIRED");
    logger.info("========================================");
    logger.info("");
    logger.info("Please verify in Archibald:");
    logger.info(`  1. Order ${orderId} exists`);
    logger.info(`  2. Customer: Fresis Soc Cooperativa`);
    logger.info(`  3. Total line items: 3`);
    logger.info("");
    logger.info(`  Line 1:`);
    logger.info(`    - Article: ${testArticleName}`);
    logger.info(`    - Quantity: ${lowQuantity}`);
    logger.info(
      `    - Package: ${lowestMultiple} (variant ${sortedVariants[sortedVariants.length - 1].id})`,
    );
    logger.info("");
    logger.info(`  Line 2:`);
    logger.info(`    - Article: ${testArticleName}`);
    logger.info(`    - Quantity: ${thresholdQuantity}`);
    logger.info(`    - Package: ${highestMultiple} (variant ${sortedVariants[0].id})`);
    logger.info("");
    logger.info(`  Line 3:`);
    logger.info(`    - Article: ${testArticleName}`);
    logger.info(`    - Quantity: ${highQuantity}`);
    logger.info(`    - Package: ${highestMultiple} (variant ${sortedVariants[0].id})`);
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

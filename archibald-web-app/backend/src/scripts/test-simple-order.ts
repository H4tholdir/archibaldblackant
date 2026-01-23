#!/usr/bin/env tsx
/**
 * Simple test script to verify bot functionality
 * Customer: fresis
 * Article: TD1272.314
 * Quantity: 1
 *
 * Uses BrowserPool for fast login (like order-sync-service)
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { BrowserPool } from "../browser-pool.js";
import { logger } from "../logger.js";

async function testSimpleOrder() {
  logger.info("[Test] Starting simple order test with BrowserPool...");

  const browserPool = BrowserPool.getInstance();
  const testUserId = "order-sync-service"; // Use service user with cached credentials
  let bot: ArchibaldBot | null = null;
  let context: any = null;

  try {
    // Initialize bot with user ID (multi-user mode)
    logger.info("[Test] Initializing bot for user:", testUserId);
    bot = new ArchibaldBot(testUserId);

    // Acquire pre-authenticated context from pool (FAST!)
    logger.info("[Test] Acquiring browser context from pool...");
    const startAcquire = Date.now();
    context = await browserPool.acquireContext(testUserId);
    const acquireDuration = Date.now() - startAcquire;
    logger.info(`[Test] ✅ Context acquired in ${acquireDuration}ms`);

    // Create page in authenticated context
    logger.info("[Test] Creating page in authenticated context...");
    const page = await context.newPage();

    // Initialize bot with the page (no login needed - session already authenticated!)
    await bot.initialize(page);

    logger.info("[Test] ✅ Bot initialized with pre-authenticated session");

    // Create multi-line order
    // Note: Using name "TD1272.314." (with trailing dot) as stored in database
    const orderData = {
      customerName: "fresis",
      items: [
        {
          articleCode: "TD1272.314.",
          quantity: 1,
        },
        {
          articleCode: "TD1272.314.",
          quantity: 1,
        },
        {
          articleCode: "TD1272.314.",
          quantity: 1,
        },
        {
          articleCode: "TD1272.314.",
          quantity: 1,
        },
        {
          articleCode: "H129FSQ.104.023",
          quantity: 3,
        },
        {
          articleCode: "H129FSQ.104.023",
          quantity: 15,
        },
      ],
    };

    logger.info("[Test] Creating order...", { orderData });
    const orderId = await bot.createOrder(orderData);

    logger.info("[Test] ✅ Order created successfully!", { orderId });

    // Generate performance report
    logger.info("[Test] Generating performance report...");
    const reportPath = await bot.writeOperationReport();
    logger.info("[Test] Performance report written to:", { reportPath });

    return orderId;
  } catch (error) {
    logger.error("[Test] ❌ Test failed:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  } finally {
    // Cleanup
    if (bot) {
      logger.info("[Test] Closing bot...");
      await bot.close();
    }

    // Release context back to pool (keep session for reuse)
    if (context) {
      logger.info("[Test] Releasing context back to pool...");
      try {
        await browserPool.releaseContext(testUserId, context, true);
        logger.info("[Test] ✅ Context released");
      } catch (error) {
        logger.warn("[Test] Failed to release context:", error);
      }
    }

    // Shutdown pool
    logger.info("[Test] Shutting down browser pool...");
    await browserPool.shutdown();

    logger.info("[Test] Test complete");
  }
}

// Run test
testSimpleOrder()
  .then((orderId) => {
    logger.info("[Test] SUCCESS - Order ID:", orderId);
    process.exit(0);
  })
  .catch((error) => {
    logger.error("[Test] FAILED:", error);
    process.exit(1);
  });

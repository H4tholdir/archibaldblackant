import { ArchibaldBot } from "../archibald-web-app/backend/src/archibald-bot";
import { config } from "../archibald-web-app/backend/src/config";
import { logger } from "../archibald-web-app/backend/src/logger";
import { PasswordCache } from "../archibald-web-app/backend/src/password-cache";

const USER_ID = process.env.USER_ID || "077c52ec-0ab0-4a35-89cb-51f23b06f94c";

const TEST_ORDERS = [
  { id: "72.918", name: "PENDING-72.918" },
  { id: "72.917", name: "PENDING-72.917" },
  { id: "72.889", name: "PENDING-72.889" },
];

async function testDeleteOrders() {
  logger.info("Starting E2E test: delete draft orders from Archibald");

  // Pre-populate password cache from env (same creds used by service users)
  PasswordCache.getInstance().set(USER_ID, config.archibald.password);

  // Use multi-user mode with BrowserPool (same as order creation)
  const bot = new ArchibaldBot(USER_ID);

  try {
    // initialize() acquires context from BrowserPool which handles login
    await bot.initialize();

    for (const order of TEST_ORDERS) {
      logger.info(`\n--- Deleting order ${order.name} (ID: ${order.id}) ---`);

      const result = await bot.deleteOrderFromArchibald(order.id);

      if (result.success) {
        logger.info(`[OK] ${order.name}: ${result.message}`);
      } else {
        logger.error(`[FAIL] ${order.name}: ${result.message}`);
      }

      // Wait between deletions to let Archibald settle
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    logger.info("\n--- Test completed ---");
  } catch (error) {
    logger.error("Test failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await bot.close();
  }
}

testDeleteOrders().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

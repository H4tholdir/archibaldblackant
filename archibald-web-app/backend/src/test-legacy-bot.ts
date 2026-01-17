#!/usr/bin/env tsx
/**
 * Test script to verify legacy bot functionality
 * Creates an order using the original single-user ArchibaldBot
 */
import { ArchibaldBot } from "./archibald-bot";
import { logger } from "./logger";

async function testLegacyBot() {
  logger.info("🧪 Starting legacy bot test...");

  const bot = new ArchibaldBot();

  try {
    // Initialize bot with legacy single-user mode
    await bot.initialize();
    logger.info("✅ Bot initialized");

    // Login (credentials are taken from config or PasswordCache)
    await bot.login();
    logger.info("✅ Login successful");

    // Create order with correct format
    const orderData = {
      customerId: "FRESIS",
      customerName: "Fresis",
      items: [
        {
          articleCode: "TD1272.314",
          description: "Test article",
          quantity: 1,
          price: 0,
        },
      ],
    };

    logger.info("📝 Creating order:", orderData);
    const result = await bot.createOrder(orderData);

    logger.info("✅ Order created successfully!", result);
    return result;
  } catch (error) {
    logger.error("❌ Legacy bot test failed:", error);
    throw error;
  } finally {
    await bot.close();
    logger.info("🧹 Bot closed");
  }
}

// Run test
testLegacyBot()
  .then((result) => {
    logger.info("🎉 Test completed successfully:", result);
    process.exit(0);
  })
  .catch((error) => {
    logger.error("💥 Test failed:", error);
    process.exit(1);
  });

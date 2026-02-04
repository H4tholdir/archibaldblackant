import { OrderDatabaseNew } from "../src/order-db-new";
import { logger } from "../src/logger";

async function testGetOrderByNumber() {
  logger.info("=== Test getOrderByNumber ===");

  const orderDb = OrderDatabaseNew.getInstance();

  // Test with a real user ID (replace with actual user ID from your system)
  const userId = "test-user";

  // Get all orders for testing
  const orders = orderDb.getOrdersByUser(userId, { limit: 5 });

  if (orders.length === 0) {
    logger.warn("No orders found for testing. Trying system user...");
    const systemOrders = orderDb.getOrdersByUser("system", { limit: 5 });

    if (systemOrders.length === 0) {
      logger.error("No orders found in database. Cannot test.");
      process.exit(1);
    }

    logger.info(`Found ${systemOrders.length} orders for system user`);

    // Test getOrderByNumber vs getOrderById
    for (const order of systemOrders.slice(0, 3)) {
      logger.info(`\n--- Testing order ${order.orderNumber} ---`);

      // Test getOrderById with ID (should work)
      const byId = orderDb.getOrderById("system", order.id);
      logger.info(
        `getOrderById(system, "${order.id}"): ${byId ? "✓ Found" : "✗ Not found"}`,
      );

      // Test getOrderById with order_number (should NOT work - old bug)
      const byIdWithNumber = orderDb.getOrderById("system", order.orderNumber);
      logger.info(
        `getOrderById(system, "${order.orderNumber}"): ${byIdWithNumber ? "✗ Found (BUG!)" : "✓ Not found (expected)"}`,
      );

      // Test getOrderByNumber with order_number (should work - FIX)
      const byNumber = orderDb.getOrderByNumber("system", order.orderNumber);
      logger.info(
        `getOrderByNumber(system, "${order.orderNumber}"): ${byNumber ? "✓ Found" : "✗ Not found"}`,
      );

      if (byNumber) {
        logger.info(`  - Order ID: ${byNumber.id}`);
        logger.info(`  - Customer: ${byNumber.customerName}`);
        logger.info(`  - DDT Number: ${byNumber.ddtNumber || "N/A"}`);
        logger.info(`  - Tracking: ${byNumber.trackingNumber || "N/A"}`);
      }
    }

    logger.info("\n=== Test Complete ✓ ===");
    process.exit(0);
  }

  logger.info(`Found ${orders.length} orders for user ${userId}`);

  // Similar test for regular user
  for (const order of orders.slice(0, 3)) {
    logger.info(`\n--- Testing order ${order.orderNumber} ---`);

    const byId = orderDb.getOrderById(userId, order.id);
    logger.info(
      `getOrderById("${order.id}"): ${byId ? "✓ Found" : "✗ Not found"}`,
    );

    const byIdWithNumber = orderDb.getOrderById(userId, order.orderNumber);
    logger.info(
      `getOrderById("${order.orderNumber}"): ${byIdWithNumber ? "✗ Found (BUG!)" : "✓ Not found (expected)"}`,
    );

    const byNumber = orderDb.getOrderByNumber(userId, order.orderNumber);
    logger.info(
      `getOrderByNumber("${order.orderNumber}"): ${byNumber ? "✓ Found" : "✗ Not found"}`,
    );

    if (byNumber) {
      logger.info(`  - Order ID: ${byNumber.id}`);
      logger.info(`  - Customer: ${byNumber.customerName}`);
      logger.info(`  - DDT Number: ${byNumber.ddtNumber || "N/A"}`);
      logger.info(`  - Tracking: ${byNumber.trackingNumber || "N/A"}`);
    }
  }

  logger.info("\n=== Test Complete ✓ ===");
  process.exit(0);
}

testGetOrderByNumber().catch((error) => {
  logger.error("Test failed", { error });
  process.exit(1);
});

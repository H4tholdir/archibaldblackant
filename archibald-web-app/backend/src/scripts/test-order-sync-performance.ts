/**
 * Test script to measure order sync performance
 *
 * Purpose: Measure how long it takes to sync orders and identify bottlenecks
 *
 * Run: npx tsx src/scripts/test-order-sync-performance.ts
 */

import { OrderHistoryService } from "../order-history-service";
import { logger } from "../logger";

async function testOrderSyncPerformance() {
  console.log("=".repeat(80));
  console.log("ORDER SYNC PERFORMANCE TEST");
  console.log("=".repeat(80));
  console.log();

  const orderService = new OrderHistoryService();
  const testUserId = "test-user-sync-performance";

  console.log(`Test User ID: ${testUserId}`);
  console.log(`Start Time: ${new Date().toISOString()}`);
  console.log();

  const startTime = Date.now();

  try {
    console.log("Starting order sync...");
    console.log("-".repeat(80));

    await orderService.syncFromArchibald(testUserId);

    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    const durationMinutes = durationSeconds / 60;

    console.log();
    console.log("=".repeat(80));
    console.log("SYNC COMPLETED SUCCESSFULLY");
    console.log("=".repeat(80));
    console.log(`End Time: ${new Date().toISOString()}`);
    console.log(`Duration: ${durationSeconds.toFixed(2)}s (${durationMinutes.toFixed(2)} minutes)`);
    console.log();

    // Get stats from DB
    const orders = orderService.orderDb.getOrdersByUser(testUserId, {
      limit: 9999,
      offset: 0,
    });

    console.log("SYNC STATISTICS:");
    console.log(`  Total Orders: ${orders.length}`);
    console.log(`  Avg Time per Order: ${(durationSeconds / orders.length).toFixed(2)}s`);
    console.log();

    // Group by status
    const statusCounts: Record<string, number> = {};
    for (const order of orders) {
      const status = order.salesStatus || "Unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    console.log("ORDERS BY STATUS:");
    for (const [status, count] of Object.entries(statusCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${status}: ${count}`);
    }
    console.log();

    // Count orders with DDT data
    const ordersWithDDT = orders.filter((o) => o.ddtNumber).length;
    console.log("DDT COVERAGE:");
    console.log(`  Orders with DDT: ${ordersWithDDT} (${((ordersWithDDT / orders.length) * 100).toFixed(1)}%)`);
    console.log();

    // Performance assessment
    console.log("PERFORMANCE ASSESSMENT:");
    if (durationMinutes < 2) {
      console.log("  ✅ EXCELLENT - Sync completed in under 2 minutes");
    } else if (durationMinutes < 5) {
      console.log("  ⚠️  ACCEPTABLE - Sync completed in 2-5 minutes");
    } else if (durationMinutes < 10) {
      console.log("  ⚠️  SLOW - Sync took 5-10 minutes (may cause timeouts)");
    } else {
      console.log("  ❌ TOO SLOW - Sync took over 10 minutes (WILL cause timeouts)");
    }
    console.log();

    process.exit(0);
  } catch (error) {
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;

    console.error();
    console.error("=".repeat(80));
    console.error("SYNC FAILED");
    console.error("=".repeat(80));
    console.error(`Error after ${durationSeconds.toFixed(2)}s`);
    console.error(error);
    console.error();

    process.exit(1);
  }
}

// Run test
testOrderSyncPerformance();

/**
 * Test script for DDT PDF download
 *
 * Usage: npx tsx src/test-ddt-download.ts <userId> <orderId>
 * Example: npx tsx src/test-ddt-download.ts 1 ORD/26000553
 */

import { DDTScraperService } from './ddt-scraper-service';
import { OrderDatabase } from './order-db';
import { logger } from './logger';

async function testDDTDownload() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx tsx src/test-ddt-download.ts <userId> <orderId>');
    console.error('Example: npx tsx src/test-ddt-download.ts 1 ORD/26000553');
    process.exit(1);
  }

  const userId = args[0];
  const orderId = args[1];

  console.log('\n=== DDT Download Test ===');
  console.log(`User ID: ${userId}`);
  console.log(`Order ID: ${orderId}`);
  console.log('========================\n');

  try {
    // Step 1: Find order in database
    console.log('Step 1: Looking up order in database...');
    const orderDb = OrderDatabase.getInstance();

    let order = orderDb.getOrderById(userId, orderId);
    if (!order) {
      console.log('  Order not found by ID, trying orderNumber...');
      const allOrders = orderDb.getOrdersByUser(userId);
      order = allOrders.find(o => o.orderNumber === orderId) || null;
    }

    if (!order) {
      console.error(`❌ Order not found: ${orderId}`);
      process.exit(1);
    }

    console.log('✅ Order found:');
    console.log(`  - ID: ${order.id}`);
    console.log(`  - Order Number: ${order.orderNumber}`);
    console.log(`  - DDT Number: ${order.ddtNumber || 'N/A'}`);
    console.log(`  - Tracking Number: ${order.trackingNumber || 'N/A'}`);
    console.log(`  - Customer: ${order.customerName}`);

    // Step 2: Validate order has DDT and tracking
    console.log('\nStep 2: Validating order data...');
    if (!order.ddtNumber) {
      console.error('❌ Order has no DDT number');
      process.exit(1);
    }
    console.log('✅ DDT number present');

    if (!order.trackingNumber) {
      console.error('❌ Order has no tracking number (required for PDF generation)');
      process.exit(1);
    }
    console.log('✅ Tracking number present');

    // Step 3: Attempt DDT PDF download
    console.log('\nStep 3: Attempting DDT PDF download...');
    console.log('(This may take 15-30 seconds...)\n');

    const ddtScraperService = new DDTScraperService();
    const pdfBuffer = await ddtScraperService.downloadDDTPDF(userId, order);

    console.log(`\n✅ SUCCESS! Downloaded PDF (${pdfBuffer.length} bytes)`);

    // Save PDF to file for inspection
    const fs = await import('node:fs/promises');
    const filename = `ddt-${order.ddtNumber.replace(/\//g, '-')}-test.pdf`;
    await fs.writeFile(filename, pdfBuffer);
    console.log(`📄 PDF saved to: ${filename}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testDDTDownload().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

import { PDFParserOrdersService } from "../pdf-parser-orders-service";
import { OrderDatabaseNew } from "../order-db-new";
import { logger } from "../logger";

async function testOrderSyncE2E() {
  logger.info("=== Orders Sync E2E Test ===");

  try {
    // Step 1: Parse PDF
    logger.info("[Step 1] Parsing Ordini.pdf...");
    const parserService = PDFParserOrdersService.getInstance();
    const parsedOrders = await parserService.parseOrdersPDF("Ordini.pdf");
    logger.info(`✓ Parsed ${parsedOrders.length} orders`);

    // Step 2: Save to orders-new.db
    logger.info("[Step 2] Saving to orders-new.db...");
    const orderDb = OrderDatabaseNew.getInstance();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const order of parsedOrders) {
      const result = orderDb.upsertOrder("test-user", {
        id: order.id,
        orderNumber: order.order_number,
        customerProfileId: order.customer_profile_id,
        customerName: order.customer_name,
        deliveryName: order.delivery_name,
        deliveryAddress: order.delivery_address,
        creationDate: order.creation_date,
        deliveryDate: order.delivery_date,
        remainingSalesFinancial: order.remaining_sales_financial,
        customerReference: order.customer_reference,
        salesStatus: order.sales_status,
        orderType: order.order_type,
        documentStatus: order.document_status,
        salesOrigin: order.sales_origin,
        transferStatus: order.transfer_status,
        transferDate: order.transfer_date,
        completionDate: order.completion_date,
        discountPercent: order.discount_percent,
        grossAmount: order.gross_amount,
        totalAmount: order.total_amount,
      });

      if (result === "inserted") inserted++;
      else if (result === "updated") updated++;
      else skipped++;
    }

    logger.info(
      `✓ Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`,
    );

    // Step 3: Verify delta detection (re-sync should skip all)
    logger.info("[Step 3] Re-syncing to verify delta detection...");
    let skippedOnResync = 0;

    for (const order of parsedOrders) {
      const result = orderDb.upsertOrder("test-user", {
        id: order.id,
        orderNumber: order.order_number,
        customerProfileId: order.customer_profile_id,
        customerName: order.customer_name,
        deliveryName: order.delivery_name,
        deliveryAddress: order.delivery_address,
        creationDate: order.creation_date,
        deliveryDate: order.delivery_date,
        remainingSalesFinancial: order.remaining_sales_financial,
        customerReference: order.customer_reference,
        salesStatus: order.sales_status,
        orderType: order.order_type,
        documentStatus: order.document_status,
        salesOrigin: order.sales_origin,
        transferStatus: order.transfer_status,
        transferDate: order.transfer_date,
        completionDate: order.completion_date,
        discountPercent: order.discount_percent,
        grossAmount: order.gross_amount,
        totalAmount: order.total_amount,
      });

      if (result === "skipped") skippedOnResync++;
    }

    logger.info(
      `✓ Skipped on re-sync: ${skippedOnResync}/${parsedOrders.length}`,
    );

    // Step 4: Stats
    logger.info("[Step 4] Database stats...");
    const totalCount = orderDb.getTotalCount();
    const lastSync = orderDb.getLastSyncTime();
    logger.info(`✓ Total orders: ${totalCount}`);
    logger.info(`✓ Last sync: ${lastSync?.toISOString()}`);

    logger.info("=== E2E Test Complete ✓ ===");
    process.exit(0);
  } catch (error) {
    logger.error("❌ E2E Test failed", { error });
    process.exit(1);
  }
}

testOrderSyncE2E();

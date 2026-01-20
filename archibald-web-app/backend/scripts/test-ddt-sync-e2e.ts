import { PDFParserDDTService } from "../src/pdf-parser-ddt-service";
import { DDTDatabase } from "../src/ddt-db";
import { logger } from "../src/logger";

async function testDDTSyncE2E() {
  logger.info("=== DDT Sync E2E Test ===");

  try {
    const parserService = PDFParserDDTService.getInstance();
    const parsedDDTs = await parserService.parseDDTPDF(
      "Documenti di trasporto.pdf",
    );
    logger.info(`✓ Parsed ${parsedDDTs.length} DDTs`);

    const ddtDb = DDTDatabase.getInstance();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const ddt of parsedDDTs) {
      const result = ddtDb.upsertDDT({
        id: ddt.id,
        ddtNumber: ddt.ddt_number,
        deliveryDate: ddt.delivery_date,
        orderNumber: ddt.order_number,
        customerAccount: ddt.customer_account,
        salesName: ddt.sales_name,
        deliveryName: ddt.delivery_name,
        trackingNumber: ddt.tracking_number,
        deliveryTerms: ddt.delivery_terms,
        deliveryMethod: ddt.delivery_method,
        deliveryCity: ddt.delivery_city,
      });

      if (result === "inserted") inserted++;
      else if (result === "updated") updated++;
      else skipped++;
    }

    logger.info(
      `✓ Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`,
    );

    const coverage = ddtDb.getTrackingCoverage();
    logger.info(
      `✓ Tracking coverage: ${coverage.withTracking}/${coverage.total} (${coverage.percentage}%)`,
    );

    logger.info("=== DDT E2E Test Complete ✓ ===");
    process.exit(0);
  } catch (error) {
    logger.error("❌ DDT E2E Test failed", { error });
    process.exit(1);
  }
}

testDDTSyncE2E();

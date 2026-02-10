/**
 * Test script for Excel VAT import
 */

import path from "path";
import { ExcelVatImporter } from "./excel-vat-importer";
import { logger } from "./logger";

async function testExcelImport() {
  logger.info("🧪 Testing Excel VAT import...");

  const excelPath = path.join(__dirname, "../../../Listino_2026_vendita.xlsx");

  const importer = new ExcelVatImporter();

  try {
    const result = await importer.importFromExcel(excelPath, "test-user", true);

    logger.info("\n📊 Import Result:");
    logger.info(`   Success: ${result.success}`);
    logger.info(`   Import ID: ${result.importId}`);
    logger.info(`   Total rows: ${result.totalRows}`);
    logger.info(`   Matched: ${result.matchedRows}`);
    logger.info(`   Unmatched: ${result.unmatchedRows}`);
    logger.info(`   VAT updated: ${result.vatUpdatedCount}`);
    logger.info(`   VAT propagated to siblings: ${result.vatPropagatedCount}`);
    logger.info(`   Price updated: ${result.priceUpdatedCount}`);

    if (result.unmatchedProducts.length > 0) {
      logger.info(`\n⚠️  First 10 unmatched products:`);
      result.unmatchedProducts.slice(0, 10).forEach((p, idx) => {
        logger.info(
          `   ${idx + 1}. ID: ${p.excelId}, Codice: ${p.excelCodiceArticolo}`,
        );
        logger.info(`      Descrizione: ${p.excelDescrizione}`);
        logger.info(`      Reason: ${p.reason}`);
      });
    }

    // Show products without VAT
    logger.info("\n📋 Products without VAT (first 10):");
    const productsWithoutVat = importer.getProductsWithoutVat(10);
    productsWithoutVat.forEach((p: any) => {
      logger.info(`   ${p.id} - ${p.name} (price: ${p.price || "N/A"})`);
    });

    // Show import history
    logger.info("\n📜 Import history:");
    const history = importer.getImportHistory(5);
    history.forEach((h: any) => {
      logger.info(
        `   ${h.filename} - ${new Date(h.uploadedAt * 1000).toISOString()}`,
      );
      logger.info(
        `      Status: ${h.status}, Matched: ${h.matchedRows}/${h.totalRows}`,
      );
    });

    logger.info("\n✅ Test completed!");
  } catch (error) {
    logger.error("❌ Test failed:", error);
    throw error;
  } finally {
    importer.close();
  }
}

if (require.main === module) {
  testExcelImport()
    .then(() => {
      logger.info("\n✅ All tests passed!");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}

export { testExcelImport };

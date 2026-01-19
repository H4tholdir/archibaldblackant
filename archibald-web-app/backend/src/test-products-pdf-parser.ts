import { PDFParserProductsService } from "./pdf-parser-products-service";
import { logger } from "./logger";

async function testProductsPDFParser() {
  logger.info("=== Products PDF Parser Test ===");

  const service = PDFParserProductsService.getInstance();

  // 1. Health check
  logger.info("Running health check...");
  const health = await service.healthCheck();
  if (!health.healthy) {
    logger.error("Health check failed", health);
    process.exit(1);
  }
  logger.info("✓ Health check passed", health);

  // 2. Parse PDF
  const pdfPath = process.env.PRODUCTS_PDF_PATH || "/tmp/articoli-test.pdf";
  logger.info(`Parsing PDF: ${pdfPath}`);

  const startTime = Date.now();
  const products = await service.parsePDF(pdfPath);
  const duration = Date.now() - startTime;

  logger.info(`✓ Parsed ${products.length} products in ${duration}ms`);

  // 3. Validate results
  if (products.length < 4000 || products.length > 5000) {
    logger.warn(
      `Product count unexpected: ${products.length} (expected ~4,540)`,
    );
  }

  // 4. Sample product
  const sample = products[0];
  logger.info("Sample product:", sample);

  // 5. Field coverage check
  const fields = Object.keys(sample);
  logger.info(`Fields per product: ${fields.length}`);

  // 6. Verify all expected fields are present
  const expectedFields = [
    "id_articolo",
    "nome_articolo",
    "gruppo_articolo",
    "contenuto_imballaggio",
    "nome_ricerca",
    "unita_prezzo",
    "id_gruppo_prodotti",
    "descrizione_gruppo_articolo",
    "qta_minima",
    "qta_multipli",
    "qta_massima",
    "figura",
    "id_blocco_articolo",
    "pacco_gamba",
    "grandezza",
    "id_configurazione",
    "creato_da",
    "data_creata",
    "dataareaid",
    "qta_predefinita",
    "visualizza_numero_prodotto",
    "sconto_assoluto_totale",
    "id_prodotto",
    "sconto_linea",
    "modificato_da",
    "datetime_modificato",
    "articolo_ordinabile",
    "purch_price",
    "pcs_id_configurazione_standard",
    "qta_standard",
    "fermato",
    "id_unita",
  ];

  const missingFields = expectedFields.filter((field) => !(field in sample));
  if (missingFields.length > 0) {
    logger.warn(`Missing fields in sample: ${missingFields.join(", ")}`);
  } else {
    logger.info("✓ All expected fields present");
  }

  // 7. Check for non-null values
  const nonNullFields = Object.entries(sample).filter(
    ([key, value]) => value !== null && value !== undefined,
  );
  logger.info(
    `Non-null fields in sample: ${nonNullFields.length}/${fields.length}`,
  );

  // 8. Performance check
  const targetDuration = 18000; // 18 seconds
  if (duration > targetDuration) {
    logger.warn(
      `⚠ Performance warning: ${duration}ms > ${targetDuration}ms target`,
    );
  } else {
    logger.info(`✓ Performance OK: ${duration}ms < ${targetDuration}ms target`);
  }

  logger.info("=== Test Complete ===");
}

testProductsPDFParser().catch((error) => {
  logger.error("Test failed", { error });
  process.exit(1);
});

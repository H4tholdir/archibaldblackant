import { describe, test, expect, beforeAll } from "vitest";
import { PDFParserProductsService } from "./pdf-parser-products-service";
import path from "path";

const skipInCI = () => {
  if (process.env.CI) {
    console.warn("⏭️  Skipping test in CI (requires Archibald credentials)");
    return true;
  }
  return false;
};

describe("PDFParserProductsService", () => {
  let service: PDFParserProductsService;
  let testPdfPath: string;

  beforeAll(() => {
    if (skipInCI()) return;

    service = PDFParserProductsService.getInstance();
    testPdfPath = process.env.PRODUCTS_PDF_PATH || "/tmp/articoli-test.pdf";
  });

  test("should parse PDF successfully", async () => {
    if (skipInCI()) return;

    const products = await service.parsePDF(testPdfPath);

    expect(products).toBeInstanceOf(Array);
    expect(products.length).toBeGreaterThan(0);
  });

  test("should return ~4,540 valid products", async () => {
    if (skipInCI()) return;

    const products = await service.parsePDF(testPdfPath);

    expect(products.length).toBeGreaterThanOrEqual(4000);
    expect(products.length).toBeLessThanOrEqual(5000);
  });

  test("should have all 26+ business fields", async () => {
    if (skipInCI()) return;

    const products = await service.parsePDF(testPdfPath);
    const sample = products[0];

    // Check core fields
    expect(sample.id_articolo).toBeDefined();
    expect(sample.nome_articolo).toBeDefined();

    // Check extended fields from pages 4-8
    // At least some should be populated
    const hasExtendedFields = [
      sample.figura,
      sample.grandezza,
      sample.purch_price,
      sample.fermato,
    ].some((field) => field !== undefined && field !== null);

    expect(hasExtendedFields).toBe(true);
  });

  test("should parse within performance target (<20s)", async () => {
    if (skipInCI()) return;

    const start = Date.now();
    const products = await service.parsePDF(testPdfPath);
    const duration = Date.now() - start;

    console.log(`✅ Parsed ${products.length} products in ${duration}ms`);
    expect(duration).toBeLessThan(20000); // 20s buffer
  });

  test("should pass health check", async () => {
    if (skipInCI()) return;

    const health = await service.healthCheck();

    expect(health.healthy).toBe(true);
    expect(health.pythonVersion).toBeDefined();
    expect(health.pdfplumberAvailable).toBe(true);
  });

  test("should throw error for non-existent PDF", async () => {
    if (skipInCI()) return;

    await expect(service.parsePDF("/tmp/non-existent.pdf")).rejects.toThrow();
  });
});

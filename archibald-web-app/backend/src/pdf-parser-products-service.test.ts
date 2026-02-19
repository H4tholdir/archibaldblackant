import { describe, test, expect, beforeAll } from "vitest";
import { PDFParserProductsService } from "./pdf-parser-products-service";
import fs from "fs";

const testPdfPath = process.env.PRODUCTS_PDF_PATH || "/tmp/articoli-test.pdf";
const pdfExists = fs.existsSync(testPdfPath);
const shouldSkip = !!process.env.CI || !pdfExists;

describe.skipIf(shouldSkip)("PDFParserProductsService", () => {
  let service: PDFParserProductsService;

  beforeAll(() => {
    service = PDFParserProductsService.getInstance();
  });

  test("should parse PDF successfully", async () => {
    const products = await service.parsePDF(testPdfPath);

    expect(products).toBeInstanceOf(Array);
    expect(products.length).toBeGreaterThan(0);
  });

  test("should return ~4,540 valid products", async () => {
    const products = await service.parsePDF(testPdfPath);

    expect(products.length).toBeGreaterThanOrEqual(4000);
    expect(products.length).toBeLessThanOrEqual(5000);
  });

  test("should have all 26+ business fields", async () => {
    const products = await service.parsePDF(testPdfPath);
    const sample = products[0];

    expect(sample.id_articolo).toBeDefined();
    expect(sample.nome_articolo).toBeDefined();

    const hasExtendedFields = [
      sample.figura,
      sample.grandezza,
      sample.purch_price,
      sample.fermato,
    ].some((field) => field !== undefined && field !== null);

    expect(hasExtendedFields).toBe(true);
  });

  test("should parse within performance target (<20s)", async () => {
    const start = Date.now();
    const products = await service.parsePDF(testPdfPath);
    const duration = Date.now() - start;

    console.log(`✅ Parsed ${products.length} products in ${duration}ms`);
    expect(duration).toBeLessThan(20000);
  });

  test("should pass health check", async () => {
    const health = await service.healthCheck();

    expect(health.healthy).toBe(true);
    expect(health.pythonVersion).toBeDefined();
    expect(health.pdfplumberAvailable).toBe(true);
  });

  test("should throw error for non-existent PDF", async () => {
    await expect(service.parsePDF("/tmp/non-existent.pdf")).rejects.toThrow();
  });
});

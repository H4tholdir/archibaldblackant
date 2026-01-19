import { describe, it, expect, beforeAll } from "vitest";
import { pdfParserService, PDFParseResult } from "./pdf-parser-service";
import * as path from "path";
import * as fs from "fs";

describe("PDFParserService", () => {
  const testPDFPath = path.resolve(__dirname, "../../../Clienti.pdf");

  beforeAll(() => {
    // Verify test PDF exists
    if (!fs.existsSync(testPDFPath)) {
      throw new Error(`Test PDF not found: ${testPDFPath}`);
    }
  });

  it("should parse PDF successfully", async () => {
    const result: PDFParseResult = await pdfParserService.parsePDF(
      testPDFPath,
    );

    expect(result).toBeDefined();
    expect(result.total_customers).toBeGreaterThan(0);
    expect(result.customers).toBeInstanceOf(Array);
  });

  it("should return ~1,515 valid customers (garbage filtered)", async () => {
    const result = await pdfParserService.parsePDF(testPDFPath);

    // Allow ±10% variance (1,363 to 1,666)
    expect(result.total_customers).toBeGreaterThan(1363);
    expect(result.total_customers).toBeLessThan(1666);
  });

  it("should have all 27 business fields", async () => {
    const result = await pdfParserService.parsePDF(testPDFPath);
    const firstCustomer = result.customers[0];

    // Required fields
    expect(firstCustomer.customer_profile).toBeDefined();
    expect(firstCustomer.name).toBeDefined();

    // Pages 0-3 fields (basic info)
    expect(firstCustomer).toHaveProperty("vat_number");
    expect(firstCustomer).toHaveProperty("pec");
    expect(firstCustomer).toHaveProperty("sdi");
    expect(firstCustomer).toHaveProperty("fiscal_code");
    expect(firstCustomer).toHaveProperty("phone");
    expect(firstCustomer).toHaveProperty("street");
    expect(firstCustomer).toHaveProperty("postal_code");
    expect(firstCustomer).toHaveProperty("city");

    // Pages 4-7 fields (analytics & accounts) - NEW
    expect(firstCustomer).toHaveProperty("actual_order_count");
    expect(firstCustomer).toHaveProperty("customer_type");
    expect(firstCustomer).toHaveProperty("previous_order_count_1");
    expect(firstCustomer).toHaveProperty("previous_sales_1");
    expect(firstCustomer).toHaveProperty("previous_order_count_2");
    expect(firstCustomer).toHaveProperty("previous_sales_2");
    expect(firstCustomer).toHaveProperty("external_account_number");
    expect(firstCustomer).toHaveProperty("our_account_number");
  });

  it("should parse within performance target (< 12s)", async () => {
    const startTime = Date.now();
    const result = await pdfParserService.parsePDF(testPDFPath);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(12000); // 12s max
    console.log(
      `✅ Parsed ${result.total_customers} customers in ${duration}ms`,
    );
  });

  it("should pass health check", async () => {
    const isHealthy = await pdfParserService.healthCheck();
    expect(isHealthy).toBe(true);
  });

  it("should throw error for non-existent PDF", async () => {
    await expect(
      pdfParserService.parsePDF("/tmp/nonexistent.pdf"),
    ).rejects.toThrow();
  });
});

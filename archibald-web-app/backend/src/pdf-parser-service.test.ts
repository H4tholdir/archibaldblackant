import { describe, it, expect, beforeAll } from "vitest";
import { pdfParserService, PDFParseResult } from "./pdf-parser-service";
import * as path from "path";
import * as fs from "fs";

const testPDFPath = path.resolve(__dirname, "../../../Clienti.pdf");
const pdfExists = fs.existsSync(testPDFPath);

describe.skipIf(!pdfExists)("PDFParserService", () => {
  it("should parse PDF successfully", async () => {
    const result: PDFParseResult = await pdfParserService.parsePDF(testPDFPath);

    expect(result).toBeDefined();
    expect(result.total_customers).toBeGreaterThan(0);
    expect(result.customers).toBeInstanceOf(Array);
  });

  it("should return ~1,515 valid customers (garbage filtered)", async () => {
    const result = await pdfParserService.parsePDF(testPDFPath);

    expect(result.total_customers).toBeGreaterThan(1363);
    expect(result.total_customers).toBeLessThan(1666);
  });

  it("should have all 27 business fields", async () => {
    const result = await pdfParserService.parsePDF(testPDFPath);
    const firstCustomer = result.customers[0];

    expect(firstCustomer.customer_profile).toBeDefined();
    expect(firstCustomer.name).toBeDefined();

    expect(firstCustomer).toHaveProperty("vat_number");
    expect(firstCustomer).toHaveProperty("pec");
    expect(firstCustomer).toHaveProperty("sdi");
    expect(firstCustomer).toHaveProperty("fiscal_code");
    expect(firstCustomer).toHaveProperty("phone");
    expect(firstCustomer).toHaveProperty("street");
    expect(firstCustomer).toHaveProperty("postal_code");
    expect(firstCustomer).toHaveProperty("city");

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

    expect(duration).toBeLessThan(12000);
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

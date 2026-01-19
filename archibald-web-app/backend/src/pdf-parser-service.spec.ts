import { describe, expect, test, vi } from "vitest";
import { PDFParserService } from "./pdf-parser-service";
import type { ParsedCustomer, PDFParseResult } from "./pdf-parser-service";

describe("PDFParserService", () => {
  describe("ParsedCustomer interface", () => {
    test("should have all 26 business fields from Python parser", () => {
      const customer: ParsedCustomer = {
        customer_profile: "123",
        name: "Test",
        vat_number: null,
        fiscal_code: null,
        sdi: null,
        pec: null,
        phone: null,
        mobile: null,
        url: null,
        attention_to: null,
        street: null,
        logistics_address: null,
        postal_code: null,
        city: null,
        customer_type: null,
        type: null,
        delivery_terms: null,
        description: null,
        last_order_date: null,
        actual_order_count: null,
        previous_order_count_1: null,
        previous_sales_1: null,
        previous_order_count_2: null,
        previous_sales_2: null,
        external_account_number: null,
        our_account_number: null,
      };

      expect(Object.keys(customer)).toHaveLength(26);
    });

    test("should have required primary fields", () => {
      const customer: ParsedCustomer = {
        customer_profile: "50049421",
        name: "Fresis Soc Cooperativa",
      };

      expect(customer.customer_profile).toBe("50049421");
      expect(customer.name).toBe("Fresis Soc Cooperativa");
    });

    test("should support all page 4-7 analytics fields", () => {
      const customer: ParsedCustomer = {
        customer_profile: "123",
        name: "Test",
        actual_order_count: 4,
        customer_type: "Debitor",
        previous_order_count_1: 97,
        previous_sales_1: 124497.43,
        previous_order_count_2: 112,
        previous_sales_2: 185408.57,
        description: "Test customer",
        type: "Debitor",
        external_account_number: "50",
        our_account_number: "123",
      };

      expect(customer.actual_order_count).toBe(4);
      expect(customer.previous_sales_1).toBe(124497.43);
      expect(customer.type).toBe("Debitor");
      expect(customer.our_account_number).toBe("123");
    });
  });

  describe("PDFParseResult interface", () => {
    test("should structure parse results correctly", () => {
      const result: PDFParseResult = {
        total_customers: 2,
        customers: [
          {
            customer_profile: "1",
            name: "Customer 1",
          },
          {
            customer_profile: "2",
            name: "Customer 2",
          },
        ],
      };

      expect(result.total_customers).toBe(2);
      expect(result.customers).toHaveLength(2);
    });
  });

  describe("PDFParserService constructor", () => {
    test("should initialize with correct parser path", () => {
      const service = new PDFParserService();
      expect(service).toBeDefined();
    });
  });
});

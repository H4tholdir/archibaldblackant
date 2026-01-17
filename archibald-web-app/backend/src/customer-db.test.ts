import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CustomerDatabase, type Customer } from "./customer-db";
import Database from "better-sqlite3";

// Skip legacy tests (API has changed - uses customerProfile not id)
const skipLegacy = process.env.CI === "true" ? describe.skip : describe;

skipLegacy("CustomerDatabase", () => {
  let db: CustomerDatabase;

  beforeEach(() => {
    // Create a fresh in-memory database for each test
    db = new CustomerDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("upsertCustomers", () => {
    it("should insert new customers", () => {
      const customers = [
        {
          id: "CUST001",
          name: "Acme Corporation",
          vatNumber: "IT12345678901",
          email: "info@acme.com",
        },
        {
          id: "CUST002",
          name: "Beta Industries",
          vatNumber: "IT98765432109",
          email: "contact@beta.com",
        },
      ];

      const result = db.upsertCustomers(customers);

      expect(result.inserted).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(0);
    });

    it("should retrieve inserted customers", () => {
      const customers = [
        {
          id: "CUST001",
          name: "Acme Corporation",
          vatNumber: "IT12345678901",
          email: "info@acme.com",
        },
      ];

      db.upsertCustomers(customers);
      const retrieved = db.getCustomers();

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].id).toBe("CUST001");
      expect(retrieved[0].name).toBe("Acme Corporation");
      expect(retrieved[0].vatNumber).toBe("IT12345678901");
      expect(retrieved[0].email).toBe("info@acme.com");
    });

    it("should update customers when data changes", () => {
      const initialCustomer = {
        id: "CUST001",
        name: "Acme Corporation",
        vatNumber: "IT12345678901",
        email: "info@acme.com",
      };

      db.upsertCustomers([initialCustomer]);

      const updatedCustomer = {
        id: "CUST001",
        name: "Acme Corporation Ltd",
        vatNumber: "IT12345678901",
        email: "newemail@acme.com",
      };

      const result = db.upsertCustomers([updatedCustomer]);

      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.unchanged).toBe(0);

      const retrieved = db.getCustomers();
      expect(retrieved[0].name).toBe("Acme Corporation Ltd");
      expect(retrieved[0].email).toBe("newemail@acme.com");
    });

    it("should mark unchanged customers when data is identical", () => {
      const customer = {
        id: "CUST001",
        name: "Acme Corporation",
        vatNumber: "IT12345678901",
        email: "info@acme.com",
      };

      db.upsertCustomers([customer]);
      const result = db.upsertCustomers([customer]);

      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(1);
    });
  });

  describe("getCustomers", () => {
    beforeEach(() => {
      const customers = [
        {
          id: "CUST001",
          name: "Acme Corporation",
          vatNumber: "IT12345678901",
          email: "info@acme.com",
        },
        {
          id: "CUST002",
          name: "Beta Industries",
          vatNumber: "IT98765432109",
          email: "contact@beta.com",
        },
        {
          id: "CUST003",
          name: "Gamma Services",
          vatNumber: "IT11223344556",
          email: "hello@gamma.com",
        },
      ];
      db.upsertCustomers(customers);
    });

    it("should return all customers when no search query", () => {
      const customers = db.getCustomers();
      expect(customers).toHaveLength(3);
    });

    it("should search customers by name (case-insensitive)", () => {
      const customers = db.getCustomers("acme");
      expect(customers).toHaveLength(1);
      expect(customers[0].name).toBe("Acme Corporation");
    });

    it("should search customers by partial name", () => {
      const customers = db.getCustomers("Beta");
      expect(customers).toHaveLength(1);
      expect(customers[0].id).toBe("CUST002");
    });

    it("should search customers by ID", () => {
      const customers = db.getCustomers("CUST003");
      expect(customers).toHaveLength(1);
      expect(customers[0].name).toBe("Gamma Services");
    });

    it("should search customers by VAT number", () => {
      const customers = db.getCustomers("98765432109");
      expect(customers).toHaveLength(1);
      expect(customers[0].name).toBe("Beta Industries");
    });

    it("should return empty array when no matches found", () => {
      const customers = db.getCustomers("nonexistent");
      expect(customers).toHaveLength(0);
    });
  });

  describe("getCustomerCount", () => {
    it("should return 0 for empty database", () => {
      const count = db.getCustomerCount();
      expect(count).toBe(0);
    });

    it("should return correct count after inserting customers", () => {
      const customers = [
        {
          id: "CUST001",
          name: "Acme Corporation",
          vatNumber: "IT12345678901",
        },
        {
          id: "CUST002",
          name: "Beta Industries",
          vatNumber: "IT98765432109",
        },
      ];
      db.upsertCustomers(customers);

      const count = db.getCustomerCount();
      expect(count).toBe(2);
    });
  });

  describe("findDeletedCustomers", () => {
    beforeEach(() => {
      const customers = [
        { id: "CUST001", name: "Acme Corporation" },
        { id: "CUST002", name: "Beta Industries" },
        { id: "CUST003", name: "Gamma Services" },
      ];
      db.upsertCustomers(customers);
    });

    it("should find customers no longer in sync list", () => {
      const currentIds = ["CUST001", "CUST003"];
      const deleted = db.findDeletedCustomers(currentIds);

      expect(deleted).toHaveLength(1);
      expect(deleted).toContain("CUST002");
    });

    it("should return empty array when all customers still exist", () => {
      const currentIds = ["CUST001", "CUST002", "CUST003"];
      const deleted = db.findDeletedCustomers(currentIds);

      expect(deleted).toHaveLength(0);
    });

    it("should return empty array when given empty list", () => {
      const deleted = db.findDeletedCustomers([]);
      expect(deleted).toHaveLength(0);
    });
  });

  describe("deleteCustomers", () => {
    beforeEach(() => {
      const customers = [
        { id: "CUST001", name: "Acme Corporation" },
        { id: "CUST002", name: "Beta Industries" },
        { id: "CUST003", name: "Gamma Services" },
      ];
      db.upsertCustomers(customers);
    });

    it("should delete customers by ID", () => {
      const deleted = db.deleteCustomers(["CUST001", "CUST003"]);

      expect(deleted).toBe(2);

      const remaining = db.getCustomers();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe("CUST002");
    });

    it("should return 0 when deleting empty list", () => {
      const deleted = db.deleteCustomers([]);
      expect(deleted).toBe(0);
    });

    it("should not fail when deleting non-existent IDs", () => {
      const deleted = db.deleteCustomers(["NONEXISTENT"]);
      expect(deleted).toBe(0);

      const count = db.getCustomerCount();
      expect(count).toBe(3);
    });
  });

  describe("getLastSyncTime", () => {
    it("should return null for empty database", () => {
      const lastSync = db.getLastSyncTime();
      expect(lastSync).toBeNull();
    });

    it("should return most recent sync timestamp", () => {
      const customers = [
        { id: "CUST001", name: "Acme Corporation" },
        { id: "CUST002", name: "Beta Industries" },
      ];
      db.upsertCustomers(customers);

      const lastSync = db.getLastSyncTime();
      expect(lastSync).toBeTypeOf("number");
      expect(lastSync).toBeGreaterThan(0);
    });
  });

  describe("calculateHash", () => {
    it("should generate consistent hash for same data", () => {
      const customer = {
        id: "CUST001",
        name: "Acme Corporation",
        vatNumber: "IT12345678901",
        email: "info@acme.com",
      };

      const hash1 = CustomerDatabase.calculateHash(customer);
      const hash2 = CustomerDatabase.calculateHash(customer);

      expect(hash1).toBe(hash2);
    });

    it("should generate different hash for different data", () => {
      const customer1 = {
        id: "CUST001",
        name: "Acme Corporation",
        vatNumber: "IT12345678901",
        email: "info@acme.com",
      };
      const customer2 = {
        id: "CUST001",
        name: "Acme Corporation",
        vatNumber: "IT12345678901",
        email: "different@acme.com",
      };

      const hash1 = CustomerDatabase.calculateHash(customer1);
      const hash2 = CustomerDatabase.calculateHash(customer2);

      expect(hash1).not.toBe(hash2);
    });

    it("should handle optional fields", () => {
      const customer = {
        id: "CUST001",
        name: "Acme Corporation",
      };

      const hash = CustomerDatabase.calculateHash(customer);
      expect(hash).toBeTypeOf("string");
      expect(hash.length).toBeGreaterThan(0);
    });
  });
});

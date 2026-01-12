import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProductDatabase, type Product } from "./product-db";

describe("ProductDatabase", () => {
  let db: ProductDatabase;

  beforeEach(() => {
    // Create a fresh in-memory database for each test
    db = new ProductDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("upsertProducts", () => {
    it("should insert new products", () => {
      const products = [
        {
          id: "ART001",
          name: "Dental Implant System",
          description: "Complete implant kit",
          groupCode: "IMPL",
          searchName: "dentalimplant",
          priceUnit: "PCS",
          minQty: 1,
          multipleQty: 1,
          maxQty: 100,
          price: 299.99,
        },
        {
          id: "ART002",
          name: "Surgical Instruments Set",
          description: "Professional surgical tools",
          groupCode: "SURG",
          searchName: "surgicalset",
          priceUnit: "SET",
          minQty: 1,
          multipleQty: 1,
          maxQty: 50,
          price: 599.99,
        },
      ];

      const result = db.upsertProducts(products);

      expect(result.inserted).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(0);
    });

    it("should retrieve inserted products", () => {
      const products = [
        {
          id: "ART001",
          name: "Dental Implant System",
          description: "Complete implant kit",
          groupCode: "IMPL",
          price: 299.99,
        },
      ];

      db.upsertProducts(products);
      const retrieved = db.getProducts();

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].id).toBe("ART001");
      expect(retrieved[0].name).toBe("Dental Implant System");
      expect(retrieved[0].description).toBe("Complete implant kit");
      expect(retrieved[0].groupCode).toBe("IMPL");
      expect(retrieved[0].price).toBe(299.99);
    });

    it("should update products when data changes", () => {
      const initialProduct = {
        id: "ART001",
        name: "Dental Implant System",
        description: "Complete implant kit",
        price: 299.99,
      };

      db.upsertProducts([initialProduct]);

      const updatedProduct = {
        id: "ART001",
        name: "Dental Implant System Pro",
        description: "Enhanced implant kit with accessories",
        price: 349.99,
      };

      const result = db.upsertProducts([updatedProduct]);

      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.unchanged).toBe(0);

      const retrieved = db.getProducts();
      expect(retrieved[0].name).toBe("Dental Implant System Pro");
      expect(retrieved[0].description).toBe(
        "Enhanced implant kit with accessories",
      );
      expect(retrieved[0].price).toBe(349.99);
    });

    it("should mark unchanged products when data is identical", () => {
      const product = {
        id: "ART001",
        name: "Dental Implant System",
        description: "Complete implant kit",
        price: 299.99,
      };

      db.upsertProducts([product]);
      const result = db.upsertProducts([product]);

      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(1);
    });
  });

  describe("getProducts", () => {
    beforeEach(() => {
      const products = [
        {
          id: "ART001",
          name: "Dental Implant System",
          description: "Complete implant kit",
          groupCode: "IMPL",
          searchName: "dentalimplant",
          price: 299.99,
        },
        {
          id: "ART002",
          name: "Surgical Instruments Set",
          description: "Professional surgical tools",
          groupCode: "SURG",
          searchName: "surgicalset",
          price: 599.99,
        },
        {
          id: "ART003",
          name: "Anesthesia Kit",
          description: "Local anesthesia supplies",
          groupCode: "ANES",
          searchName: "anesthesiakit",
          price: 149.99,
        },
      ];
      db.upsertProducts(products);
    });

    it("should return all products when no search query", () => {
      const products = db.getProducts();
      expect(products).toHaveLength(3);
    });

    it("should search products by name", () => {
      const products = db.getProducts("Dental");
      expect(products).toHaveLength(1);
      expect(products[0].name).toBe("Dental Implant System");
    });

    it("should search products by article code (ID)", () => {
      const products = db.getProducts("ART002");
      expect(products).toHaveLength(1);
      expect(products[0].name).toBe("Surgical Instruments Set");
    });

    it("should search products by search name", () => {
      const products = db.getProducts("anesthesia");
      expect(products).toHaveLength(1);
      expect(products[0].id).toBe("ART003");
    });

    it("should search products by description", () => {
      const products = db.getProducts("surgical");
      expect(products).toHaveLength(1);
      expect(products[0].id).toBe("ART002");
    });

    it("should handle search with special characters (dots, spaces)", () => {
      const productsWithSpecialChars = [
        {
          id: "ART.001.X",
          name: "Product With Dots",
          description: "Test product",
          searchName: "product.with.dots",
          price: 100.0,
        },
      ];
      db.upsertProducts(productsWithSpecialChars);

      // Search without dots should find product with dots
      const products = db.getProducts("ART001X");
      expect(products).toHaveLength(1);
      expect(products[0].id).toBe("ART.001.X");
    });

    it("should return empty array when no matches found", () => {
      const products = db.getProducts("nonexistent");
      expect(products).toHaveLength(0);
    });
  });

  describe("getProductCount", () => {
    it("should return 0 for empty database", () => {
      const count = db.getProductCount();
      expect(count).toBe(0);
    });

    it("should return correct count after inserting products", () => {
      const products = [
        { id: "ART001", name: "Product 1", price: 100.0 },
        { id: "ART002", name: "Product 2", price: 200.0 },
        { id: "ART003", name: "Product 3", price: 300.0 },
      ];
      db.upsertProducts(products);

      const count = db.getProductCount();
      expect(count).toBe(3);
    });
  });

  describe("findDeletedProducts", () => {
    beforeEach(() => {
      const products = [
        { id: "ART001", name: "Product 1", price: 100.0 },
        { id: "ART002", name: "Product 2", price: 200.0 },
        { id: "ART003", name: "Product 3", price: 300.0 },
      ];
      db.upsertProducts(products);
    });

    it("should find products no longer in sync list", () => {
      const currentIds = ["ART001", "ART003"];
      const deleted = db.findDeletedProducts(currentIds);

      expect(deleted).toHaveLength(1);
      expect(deleted).toContain("ART002");
    });

    it("should return empty array when all products still exist", () => {
      const currentIds = ["ART001", "ART002", "ART003"];
      const deleted = db.findDeletedProducts(currentIds);

      expect(deleted).toHaveLength(0);
    });

    it("should return empty array when given empty list", () => {
      const deleted = db.findDeletedProducts([]);
      expect(deleted).toHaveLength(0);
    });
  });

  describe("deleteProducts", () => {
    beforeEach(() => {
      const products = [
        { id: "ART001", name: "Product 1", price: 100.0 },
        { id: "ART002", name: "Product 2", price: 200.0 },
        { id: "ART003", name: "Product 3", price: 300.0 },
      ];
      db.upsertProducts(products);
    });

    it("should delete products by ID", () => {
      const deleted = db.deleteProducts(["ART001", "ART003"]);

      expect(deleted).toBe(2);

      const remaining = db.getProducts();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe("ART002");
    });

    it("should return 0 when deleting empty list", () => {
      const deleted = db.deleteProducts([]);
      expect(deleted).toBe(0);
    });

    it("should not fail when deleting non-existent IDs", () => {
      const deleted = db.deleteProducts(["NONEXISTENT"]);
      expect(deleted).toBe(0);

      const count = db.getProductCount();
      expect(count).toBe(3);
    });
  });

  describe("getLastSyncTime", () => {
    it("should return null for empty database", () => {
      const lastSync = db.getLastSyncTime();
      expect(lastSync).toBeNull();
    });

    it("should return most recent sync timestamp", () => {
      const products = [
        { id: "ART001", name: "Product 1", price: 100.0 },
        { id: "ART002", name: "Product 2", price: 200.0 },
      ];
      db.upsertProducts(products);

      const lastSync = db.getLastSyncTime();
      expect(lastSync).toBeTypeOf("number");
      expect(lastSync).toBeGreaterThan(0);
    });
  });

  describe("calculateHash", () => {
    it("should generate consistent hash for same data", () => {
      const product = {
        id: "ART001",
        name: "Dental Implant System",
        description: "Complete implant kit",
        groupCode: "IMPL",
        price: 299.99,
      };

      const hash1 = ProductDatabase.calculateHash(product);
      const hash2 = ProductDatabase.calculateHash(product);

      expect(hash1).toBe(hash2);
    });

    it("should generate different hash for different data", () => {
      const product1 = {
        id: "ART001",
        name: "Dental Implant System",
        description: "Complete implant kit",
        price: 299.99,
      };
      const product2 = {
        id: "ART001",
        name: "Dental Implant System",
        description: "Complete implant kit",
        price: 349.99,
      };

      const hash1 = ProductDatabase.calculateHash(product1);
      const hash2 = ProductDatabase.calculateHash(product2);

      expect(hash1).not.toBe(hash2);
    });

    it("should handle optional fields", () => {
      const product = {
        id: "ART001",
        name: "Basic Product",
      };

      const hash = ProductDatabase.calculateHash(product);
      expect(hash).toBeTypeOf("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should include all fields in hash calculation", () => {
      const minimalProduct = {
        id: "ART001",
        name: "Product",
      };
      const fullProduct = {
        id: "ART001",
        name: "Product",
        description: "Description",
        groupCode: "GRP",
        searchName: "search",
        priceUnit: "PCS",
        productGroupId: "PGRP",
        productGroupDescription: "Product Group",
        packageContent: "10 units",
        minQty: 1,
        multipleQty: 10,
        maxQty: 100,
        price: 99.99,
      };

      const hash1 = ProductDatabase.calculateHash(minimalProduct);
      const hash2 = ProductDatabase.calculateHash(fullProduct);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("getProductVariants", () => {
    const multiPackageArticle = "H129FSQ.104.023";
    const singlePackageArticle = "TD1272.314";
    const nonExistentArticle = "NONEXISTENT999";

    beforeEach(() => {
      const products = [
        {
          id: "016869K2",
          name: multiPackageArticle,
          description: "5-piece package",
          packageContent: "5",
          minQty: 5,
          multipleQty: 5,
          maxQty: 500,
          price: 100.0,
        },
        {
          id: "016869K3",
          name: multiPackageArticle,
          description: "1-piece package",
          packageContent: "1",
          minQty: 1,
          multipleQty: 1,
          maxQty: 100,
          price: 25.0,
        },
        {
          id: "TD1272314",
          name: singlePackageArticle,
          description: "Single package only",
          packageContent: "1",
          minQty: 1,
          multipleQty: 1,
          maxQty: 100,
          price: 50.0,
        },
      ];
      db.upsertProducts(products);
    });

    it("should return all variants for multi-package article", () => {
      const variants = db.getProductVariants(multiPackageArticle);

      expect(variants).toHaveLength(2);
      expect(variants[0].id).toBe("016869K2"); // Highest multipleQty first
      expect(variants[0].multipleQty).toBe(5);
      expect(variants[1].id).toBe("016869K3");
      expect(variants[1].multipleQty).toBe(1);
    });

    it("should return single variant for single-package article", () => {
      const variants = db.getProductVariants(singlePackageArticle);

      expect(variants).toHaveLength(1);
      expect(variants[0].id).toBe("TD1272314");
      expect(variants[0].packageContent).toBe("1");
    });

    it("should return empty array for non-existent article", () => {
      const variants = db.getProductVariants(nonExistentArticle);

      expect(variants).toHaveLength(0);
    });

    it("should order variants by multipleQty DESC", () => {
      const variants = db.getProductVariants(multiPackageArticle);

      expect(variants[0].multipleQty).toBeGreaterThanOrEqual(
        variants[1].multipleQty!,
      );
    });
  });

  describe("selectPackageVariant", () => {
    const multiPackageArticle = "H129FSQ.104.023";
    const singlePackageArticle = "TD1272.314";
    const nonExistentArticle = "NONEXISTENT999";
    const highestMultiple = 5;
    const lowestMultiple = 1;

    beforeEach(() => {
      const products = [
        {
          id: "016869K2",
          name: multiPackageArticle,
          description: "5-piece package",
          packageContent: "5",
          minQty: 5,
          multipleQty: highestMultiple,
          maxQty: 500,
          price: 100.0,
        },
        {
          id: "016869K3",
          name: multiPackageArticle,
          description: "1-piece package",
          packageContent: "1",
          minQty: 1,
          multipleQty: lowestMultiple,
          maxQty: 100,
          price: 25.0,
        },
        {
          id: "TD1272314",
          name: singlePackageArticle,
          description: "Single package only",
          packageContent: "1",
          minQty: 1,
          multipleQty: 1,
          maxQty: 100,
          price: 50.0,
        },
      ];
      db.upsertProducts(products);
    });

    it("should select highest package when quantity >= highest multiple", () => {
      const quantity = 10;
      const variant = db.selectPackageVariant(multiPackageArticle, quantity);

      expect(variant).not.toBeNull();
      expect(variant!.id).toBe("016869K2"); // 5-piece package
      expect(variant!.multipleQty).toBe(highestMultiple);
    });

    it("should select lowest package when quantity < highest multiple", () => {
      const quantity = 3;
      const variant = db.selectPackageVariant(multiPackageArticle, quantity);

      expect(variant).not.toBeNull();
      expect(variant!.id).toBe("016869K3"); // 1-piece package
      expect(variant!.multipleQty).toBe(lowestMultiple);
    });

    it("should select only variant when single package", () => {
      const quantity = 5;
      const variant = db.selectPackageVariant(singlePackageArticle, quantity);

      expect(variant).not.toBeNull();
      expect(variant!.id).toBe("TD1272314");
    });

    it("should return null when article not found", () => {
      const quantity = 5;
      const variant = db.selectPackageVariant(nonExistentArticle, quantity);

      expect(variant).toBeNull();
    });

    it("should select highest package when quantity equals highest multiple", () => {
      const quantity = highestMultiple; // Exactly at threshold
      const variant = db.selectPackageVariant(multiPackageArticle, quantity);

      expect(variant).not.toBeNull();
      expect(variant!.id).toBe("016869K2"); // 5-piece package (>= rule)
    });

    it("should select lowest package when quantity = 1", () => {
      const quantity = 1;
      const variant = db.selectPackageVariant(multiPackageArticle, quantity);

      expect(variant).not.toBeNull();
      expect(variant!.id).toBe("016869K3"); // 1-piece package
    });
  });

  describe("selectPackageVariant validation", () => {
    const validArticle = "H129FSQ.104.023";
    const validQuantity = 5;

    beforeEach(() => {
      const products = [
        {
          id: "016869K2",
          name: validArticle,
          packageContent: "5",
          minQty: 5,
          multipleQty: 5,
          maxQty: 500,
          price: 100.0,
        },
      ];
      db.upsertProducts(products);
    });

    it("should throw error for empty article name", () => {
      expect(() => db.selectPackageVariant("", validQuantity)).toThrow(
        "Article name is required",
      );
    });

    it("should throw error for whitespace-only article name", () => {
      expect(() => db.selectPackageVariant("   ", validQuantity)).toThrow(
        "Article name is required",
      );
    });

    it("should throw error for negative quantity", () => {
      expect(() => db.selectPackageVariant(validArticle, -5)).toThrow(
        "Quantity must be a positive number",
      );
    });

    it("should throw error for zero quantity", () => {
      expect(() => db.selectPackageVariant(validArticle, 0)).toThrow(
        "Quantity must be a positive number",
      );
    });

    it("should throw error for non-finite quantity", () => {
      expect(() => db.selectPackageVariant(validArticle, Infinity)).toThrow(
        "Quantity must be a positive number",
      );
    });
  });
});

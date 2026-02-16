import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { ProductDatabase } from "./product-db";
import { runMigration002 } from "./migrations/002-price-vat-audit";
import { unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function createTempDb(): { db: ProductDatabase; path: string } {
  const dbPath = join(tmpdir(), `test-products-vat-${Date.now()}.db`);
  const db = new ProductDatabase(dbPath);
  db.close();
  runMigration002(dbPath);
  const reopened = new ProductDatabase(dbPath);
  return { db: reopened, path: dbPath };
}

describe("getProductsWithoutVatCount", () => {
  let db: ProductDatabase;
  let dbPath: string;

  beforeEach(() => {
    const tmp = createTempDb();
    db = tmp.db;
    dbPath = tmp.path;
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(dbPath);
    } catch {}
  });

  test("returns 0 when no products exist", () => {
    expect(db.getProductsWithoutVatCount()).toBe(0);
  });

  test("returns count of products with null VAT", () => {
    db.upsertProducts([
      { id: "A1", name: "Product A", price: 10 } as any,
      { id: "A2", name: "Product B", price: 20 } as any,
    ]);

    db.updateProductVat("A1", 22);

    expect(db.getProductsWithoutVatCount()).toBe(1);
  });

  test("returns 0 when all products have VAT", () => {
    db.upsertProducts([
      { id: "A1", name: "Product A", price: 10 } as any,
    ]);

    db.updateProductVat("A1", 10);

    expect(db.getProductsWithoutVatCount()).toBe(0);
  });
});

describe("getProductsWithoutVat", () => {
  let db: ProductDatabase;
  let dbPath: string;

  beforeEach(() => {
    const tmp = createTempDb();
    db = tmp.db;
    dbPath = tmp.path;
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(dbPath);
    } catch {}
  });

  test("returns empty array when no products without VAT", () => {
    expect(db.getProductsWithoutVat()).toEqual([]);
  });

  test("returns only products with null VAT", () => {
    db.upsertProducts([
      { id: "A1", name: "Product A", price: 10 } as any,
      { id: "A2", name: "Product B", price: 20 } as any,
    ]);

    db.updateProductVat("A1", 22);

    const result = db.getProductsWithoutVat();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("A2");
  });

  test("respects limit parameter", () => {
    db.upsertProducts([
      { id: "A1", name: "Alpha", price: 10 } as any,
      { id: "A2", name: "Beta", price: 20 } as any,
      { id: "A3", name: "Gamma", price: 30 } as any,
    ]);

    const result = db.getProductsWithoutVat(2);
    expect(result).toHaveLength(2);
  });
});

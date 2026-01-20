import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { OrderDatabaseNew } from "../order-db-new";
import fs from "fs";
import Database from "better-sqlite3";

describe("OrderDatabaseNew", () => {
  const testDbPath = `/tmp/test-orders-new-${Date.now()}.db`;
  let db: OrderDatabaseNew;
  let rawDb: Database.Database;

  beforeAll(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
      fs.unlinkSync(`${testDbPath}-shm`);
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
      fs.unlinkSync(`${testDbPath}-wal`);
    }

    db = OrderDatabaseNew.getInstance(testDbPath);
    rawDb = new Database(testDbPath);
  });

  beforeEach(() => {
    // Clear all data between tests
    rawDb.exec("DELETE FROM orders");
  });

  afterAll(() => {
    rawDb.close();
    db.close();

    // Clean up test database files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
      fs.unlinkSync(`${testDbPath}-shm`);
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
      fs.unlinkSync(`${testDbPath}-wal`);
    }
  });

  test("upsertOrder inserts new order", () => {
    const result = db.upsertOrder("user1", {
      id: "70.962",
      orderNumber: "ORD/26000887",
      customerProfileId: "1002241",
      customerName: "Carrazza Giovanni",
      deliveryName: "Carrazza Giovanni",
      deliveryAddress: "Via Mezzacapo, 121 84036 Sala Consilina Sa",
      creationDate: "2026-01-20T12:04:22",
      deliveryDate: "2026-01-21",
      remainingSalesFinancial: null,
      customerReference: null,
      salesStatus: "Ordine aperto",
      orderType: "Ordine di vendita",
      documentStatus: "Nessuno",
      salesOrigin: "Agent",
      transferStatus: "Trasferito",
      transferDate: "2026-01-20",
      completionDate: "2026-01-20",
      discountPercent: "21,49 %",
      grossAmount: "105,60 €",
      totalAmount: "82,91 €",
    });

    expect(result).toBe("inserted");
  });

  test("upsertOrder skips unchanged order", () => {
    const orderData = {
      id: "70.962",
      orderNumber: "ORD/26000887",
      customerProfileId: "1002241",
      customerName: "Carrazza Giovanni",
      deliveryName: "Carrazza Giovanni",
      deliveryAddress: "Via Mezzacapo, 121",
      creationDate: "2026-01-20T12:04:22",
      deliveryDate: "2026-01-21",
      remainingSalesFinancial: null,
      customerReference: null,
      salesStatus: "Ordine aperto",
      orderType: "Ordine di vendita",
      documentStatus: "Nessuno",
      salesOrigin: "Agent",
      transferStatus: "Trasferito",
      transferDate: "2026-01-20",
      completionDate: "2026-01-20",
      discountPercent: "21,49 %",
      grossAmount: "105,60 €",
      totalAmount: "82,91 €",
    };

    db.upsertOrder("user1", orderData);
    const result = db.upsertOrder("user1", orderData);

    expect(result).toBe("skipped");
  });

  test("upsertOrder updates changed order", () => {
    const orderData = {
      id: "70.962",
      orderNumber: "ORD/26000887",
      customerProfileId: "1002241",
      customerName: "Carrazza Giovanni",
      deliveryName: "Carrazza Giovanni",
      deliveryAddress: "Via Mezzacapo, 121",
      creationDate: "2026-01-20T12:04:22",
      deliveryDate: "2026-01-21",
      remainingSalesFinancial: null,
      customerReference: null,
      salesStatus: "Ordine aperto",
      orderType: "Ordine di vendita",
      documentStatus: "Nessuno",
      salesOrigin: "Agent",
      transferStatus: "Trasferito",
      transferDate: "2026-01-20",
      completionDate: "2026-01-20",
      discountPercent: "21,49 %",
      grossAmount: "105,60 €",
      totalAmount: "82,91 €",
    };

    db.upsertOrder("user1", orderData);

    // Change status
    orderData.salesStatus = "Consegnato";
    const result = db.upsertOrder("user1", orderData);

    expect(result).toBe("updated");
  });

  test("getTotalCount returns correct count", () => {
    db.upsertOrder("user1", {
      id: "70.962",
      orderNumber: "ORD/26000887",
      customerProfileId: "1002241",
      customerName: "Carrazza Giovanni",
      deliveryName: "Carrazza Giovanni",
      deliveryAddress: "Via Mezzacapo, 121",
      creationDate: "2026-01-20T12:04:22",
      deliveryDate: "2026-01-21",
      remainingSalesFinancial: null,
      customerReference: null,
      salesStatus: "Ordine aperto",
      orderType: "Ordine di vendita",
      documentStatus: "Nessuno",
      salesOrigin: "Agent",
      transferStatus: "Trasferito",
      transferDate: "2026-01-20",
      completionDate: "2026-01-20",
      discountPercent: "21,49 %",
      grossAmount: "105,60 €",
      totalAmount: "82,91 €",
    });

    db.upsertOrder("user1", {
      id: "70.963",
      orderNumber: "ORD/26000888",
      customerProfileId: "1002242",
      customerName: "Test Customer",
      deliveryName: "Test Customer",
      deliveryAddress: "Test Address",
      creationDate: "2026-01-20T12:04:22",
      deliveryDate: null,
      remainingSalesFinancial: null,
      customerReference: null,
      salesStatus: "Ordine aperto",
      orderType: "Ordine di vendita",
      documentStatus: "Nessuno",
      salesOrigin: "Agent",
      transferStatus: "Trasferito",
      transferDate: "2026-01-20",
      completionDate: null,
      discountPercent: null,
      grossAmount: null,
      totalAmount: null,
    });

    const count = db.getTotalCount();
    expect(count).toBe(2);
  });

  test("getOrdersByUser filters by userId", () => {
    db.upsertOrder("user1", {
      id: "70.962",
      orderNumber: "ORD/26000887",
      customerProfileId: "1002241",
      customerName: "Carrazza Giovanni",
      deliveryName: "Carrazza Giovanni",
      deliveryAddress: "Via Mezzacapo, 121",
      creationDate: "2026-01-20T12:04:22",
      deliveryDate: "2026-01-21",
      remainingSalesFinancial: null,
      customerReference: null,
      salesStatus: "Ordine aperto",
      orderType: "Ordine di vendita",
      documentStatus: "Nessuno",
      salesOrigin: "Agent",
      transferStatus: "Trasferito",
      transferDate: "2026-01-20",
      completionDate: "2026-01-20",
      discountPercent: "21,49 %",
      grossAmount: "105,60 €",
      totalAmount: "82,91 €",
    });

    db.upsertOrder("user2", {
      id: "70.963",
      orderNumber: "ORD/26000888",
      customerProfileId: "1002242",
      customerName: "Test Customer",
      deliveryName: "Test Customer",
      deliveryAddress: "Test Address",
      creationDate: "2026-01-20T12:04:22",
      deliveryDate: null,
      remainingSalesFinancial: null,
      customerReference: null,
      salesStatus: "Ordine aperto",
      orderType: "Ordine di vendita",
      documentStatus: "Nessuno",
      salesOrigin: "Agent",
      transferStatus: "Trasferito",
      transferDate: "2026-01-20",
      completionDate: null,
      discountPercent: null,
      grossAmount: null,
      totalAmount: null,
    });

    const user1Orders = db.getOrdersByUser("user1");
    expect(user1Orders).toHaveLength(1);
    expect(user1Orders[0].orderNumber).toBe("ORD/26000887");
  });
});

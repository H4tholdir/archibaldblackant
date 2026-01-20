import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { PriceDatabase } from "../price-db";
import { PriceHistoryDatabase } from "../price-history-db";
import fs from "fs";

describe("PriceDatabase", () => {
  let db: PriceDatabase;
  const testDbPath = "/tmp/test-prices.db";

  beforeEach(() => {
    // Clean up test DB if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = PriceDatabase.getInstance(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test("upsertPrice inserts new price", () => {
    const result = db.upsertPrice({
      productId: "TEST001",
      productName: "Test Product",
      unitPrice: 10.5,
      itemSelection: "K2",
      packagingDescription: "5 colli",
      currency: "EUR",
      priceValidFrom: null,
      priceValidTo: null,
      priceUnit: null,
      accountDescription: null,
      accountCode: null,
      priceQtyFrom: null,
      priceQtyTo: null,
      lastModified: null,
      dataAreaId: null,
      lastSync: Math.floor(Date.now() / 1000),
    });

    expect(result).toBe("inserted");
  });

  test("upsertPrice skips unchanged price", () => {
    const priceData = {
      productId: "TEST001",
      productName: "Test Product",
      unitPrice: 10.5,
      itemSelection: "K2",
      packagingDescription: "5 colli",
      currency: "EUR",
      priceValidFrom: null,
      priceValidTo: null,
      priceUnit: null,
      accountDescription: null,
      accountCode: null,
      priceQtyFrom: null,
      priceQtyTo: null,
      lastModified: null,
      dataAreaId: null,
      lastSync: Math.floor(Date.now() / 1000),
    };

    db.upsertPrice(priceData);
    const result = db.upsertPrice(priceData);

    expect(result).toBe("skipped");
  });

  test("upsertPrice updates changed price", () => {
    const priceData = {
      productId: "TEST001",
      productName: "Test Product",
      unitPrice: 10.5,
      itemSelection: "K2",
      packagingDescription: "5 colli",
      currency: "EUR",
      priceValidFrom: null,
      priceValidTo: null,
      priceUnit: null,
      accountDescription: null,
      accountCode: null,
      priceQtyFrom: null,
      priceQtyTo: null,
      lastModified: null,
      dataAreaId: null,
      lastSync: Math.floor(Date.now() / 1000),
    };

    db.upsertPrice(priceData);

    // Change price
    priceData.unitPrice = 12.0;
    const result = db.upsertPrice(priceData);

    expect(result).toBe("updated");
  });

  test("getTotalCount returns correct count", () => {
    db.upsertPrice({
      productId: "TEST001",
      productName: "Test Product 1",
      unitPrice: 10.0,
      itemSelection: null,
      packagingDescription: null,
      currency: null,
      priceValidFrom: null,
      priceValidTo: null,
      priceUnit: null,
      accountDescription: null,
      accountCode: null,
      priceQtyFrom: null,
      priceQtyTo: null,
      lastModified: null,
      dataAreaId: null,
      lastSync: Math.floor(Date.now() / 1000),
    });

    db.upsertPrice({
      productId: "TEST002",
      productName: "Test Product 2",
      unitPrice: 20.0,
      itemSelection: null,
      packagingDescription: null,
      currency: null,
      priceValidFrom: null,
      priceValidTo: null,
      priceUnit: null,
      accountDescription: null,
      accountCode: null,
      priceQtyFrom: null,
      priceQtyTo: null,
      lastModified: null,
      dataAreaId: null,
      lastSync: Math.floor(Date.now() / 1000),
    });

    expect(db.getTotalCount()).toBe(2);
  });
});

describe("PriceHistoryDatabase", () => {
  let db: PriceHistoryDatabase;
  const testDbPath = "/tmp/test-price-history.db";

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    // Run migration first
    require("../migrations/003-price-history").migrate003PriceHistory(
      testDbPath,
    );
    db = PriceHistoryDatabase.getInstance(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test("recordPriceChange logs new price", () => {
    db.recordPriceChange({
      productId: "TEST001",
      productName: "Test Product",
      newPrice: 10.0,
      source: "pdf-sync",
    });

    const history = db.getProductHistory("TEST001");
    expect(history).toHaveLength(1);
    expect(history[0].changeType).toBe("new");
    expect(history[0].percentageChange).toBe(0);
  });

  test("recordPriceChange calculates percentage correctly", () => {
    db.recordPriceChange({
      productId: "TEST001",
      productName: "Test Product",
      oldPrice: 10.0,
      newPrice: 12.0,
      source: "pdf-sync",
    });

    const history = db.getProductHistory("TEST001");
    expect(history[0].changeType).toBe("increase");
    expect(history[0].percentageChange).toBe(20); // (12-10)/10 * 100 = 20%
  });

  test("getRecentStats returns correct statistics", () => {
    // Add increases
    db.recordPriceChange({
      productId: "TEST001",
      productName: "Test Product 1",
      oldPrice: 10.0,
      newPrice: 12.0,
      source: "pdf-sync",
    });

    // Add decrease
    db.recordPriceChange({
      productId: "TEST002",
      productName: "Test Product 2",
      oldPrice: 20.0,
      newPrice: 18.0,
      source: "pdf-sync",
    });

    const stats = db.getRecentStats(30);
    expect(stats.totalChanges).toBe(2);
    expect(stats.increases).toBe(1);
    expect(stats.decreases).toBe(1);
    expect(stats.avgIncrease).toBe(20);
    expect(stats.avgDecrease).toBe(-10);
  });
});

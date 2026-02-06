import { describe, test, expect } from "vitest";
import { mergeFresisPendingOrders } from "./order-merge";
import type { PendingOrder, PendingOrderItem } from "../db/schema";
import { FRESIS_CUSTOMER_PROFILE, FRESIS_DEFAULT_DISCOUNT } from "./fresis-constants";

function makeItem(overrides: Partial<PendingOrderItem> = {}): PendingOrderItem {
  return {
    articleCode: "ART001",
    quantity: 1,
    price: 10,
    vat: 22,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<PendingOrder> = {}): PendingOrder {
  return {
    id: crypto.randomUUID(),
    customerId: FRESIS_CUSTOMER_PROFILE,
    customerName: "Fresis Soc Cooperativa",
    items: [makeItem()],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    deviceId: "test-device",
    needsSync: true,
    ...overrides,
  };
}

describe("mergeFresisPendingOrders", () => {
  test("throws on empty array", () => {
    expect(() => mergeFresisPendingOrders([])).toThrow(
      "Cannot merge an empty array of orders",
    );
  });

  test("merges a single order preserving items", () => {
    const order = makeOrder({
      items: [makeItem({ articleCode: "A1", quantity: 5, price: 20 })],
    });
    const result = mergeFresisPendingOrders([order]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      articleCode: "A1",
      quantity: 5,
      price: 20,
      discount: 0,
    });
  });

  test("sums quantities for same articleCode+articleId", () => {
    const order1 = makeOrder({
      items: [makeItem({ articleCode: "A1", articleId: "V1", quantity: 3 })],
    });
    const order2 = makeOrder({
      items: [makeItem({ articleCode: "A1", articleId: "V1", quantity: 7 })],
    });

    const result = mergeFresisPendingOrders([order1, order2]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(10);
  });

  test("keeps separate items for different articleCode", () => {
    const order = makeOrder({
      items: [
        makeItem({ articleCode: "A1", quantity: 2 }),
        makeItem({ articleCode: "A2", quantity: 3 }),
      ],
    });

    const result = mergeFresisPendingOrders([order]);

    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.articleCode).sort()).toEqual(["A1", "A2"]);
  });

  test("keeps separate items for same articleCode but different articleId", () => {
    const order = makeOrder({
      items: [
        makeItem({ articleCode: "A1", articleId: "V1", quantity: 2 }),
        makeItem({ articleCode: "A1", articleId: "V2", quantity: 3 }),
      ],
    });

    const result = mergeFresisPendingOrders([order]);

    expect(result.items).toHaveLength(2);
  });

  test("removes all item-level discounts", () => {
    const order = makeOrder({
      items: [makeItem({ discount: 15 })],
    });

    const result = mergeFresisPendingOrders([order]);

    expect(result.items[0].discount).toBe(0);
  });

  test("uses default discount of 63%", () => {
    const result = mergeFresisPendingOrders([makeOrder()]);

    expect(result.discountPercent).toBe(FRESIS_DEFAULT_DISCOUNT);
  });

  test("uses custom discount when provided", () => {
    const result = mergeFresisPendingOrders([makeOrder()], 50);

    expect(result.discountPercent).toBe(50);
  });

  test("result has Fresis customerId and customerName", () => {
    const result = mergeFresisPendingOrders([makeOrder()]);

    expect(result.customerId).toBe(FRESIS_CUSTOMER_PROFILE);
    expect(result.customerName).toBe("Fresis Soc Cooperativa");
  });

  test("result has pending status and needsSync true", () => {
    const result = mergeFresisPendingOrders([makeOrder()]);

    expect(result.status).toBe("pending");
    expect(result.needsSync).toBe(true);
  });

  test("result has a new unique id", () => {
    const order = makeOrder();
    const result = mergeFresisPendingOrders([order]);

    expect(result.id).not.toBe(order.id);
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("sums warehouseQuantity across orders", () => {
    const order1 = makeOrder({
      items: [makeItem({ articleCode: "A1", quantity: 5, warehouseQuantity: 2 })],
    });
    const order2 = makeOrder({
      items: [makeItem({ articleCode: "A1", quantity: 3, warehouseQuantity: 1 })],
    });

    const result = mergeFresisPendingOrders([order1, order2]);

    expect(result.items[0].warehouseQuantity).toBe(3);
  });

  test("warehouseQuantity is undefined when all are zero", () => {
    const order = makeOrder({
      items: [makeItem({ articleCode: "A1", warehouseQuantity: undefined })],
    });

    const result = mergeFresisPendingOrders([order]);

    expect(result.items[0].warehouseQuantity).toBeUndefined();
  });

  test("preserves price from first occurrence", () => {
    const order1 = makeOrder({
      items: [makeItem({ articleCode: "A1", price: 15 })],
    });
    const order2 = makeOrder({
      items: [makeItem({ articleCode: "A1", price: 20 })],
    });

    const result = mergeFresisPendingOrders([order1, order2]);

    expect(result.items[0].price).toBe(15);
  });
});

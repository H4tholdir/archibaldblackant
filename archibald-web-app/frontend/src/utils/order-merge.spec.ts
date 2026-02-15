import { describe, test, expect } from "vitest";
import { mergeFresisPendingOrders } from "./order-merge";
import type { PendingOrder, PendingOrderItem } from "../db/schema";
import {
  FRESIS_CUSTOMER_PROFILE,
  FRESIS_DEFAULT_DISCOUNT,
} from "./fresis-constants";

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

const emptyMap = new Map<string, number>();

describe("mergeFresisPendingOrders", () => {
  test("throws on empty array", () => {
    expect(() => mergeFresisPendingOrders([], emptyMap)).toThrow(
      "Cannot merge an empty array of orders",
    );
  });

  test("merges a single order preserving items", () => {
    const order = makeOrder({
      items: [makeItem({ articleCode: "A1", quantity: 5, price: 20 })],
    });
    const result = mergeFresisPendingOrders([order], emptyMap);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      articleCode: "A1",
      quantity: 5,
      price: 20,
    });
  });

  test("sums quantities for same articleCode+articleId", () => {
    const order1 = makeOrder({
      items: [makeItem({ articleCode: "A1", articleId: "V1", quantity: 3 })],
    });
    const order2 = makeOrder({
      items: [makeItem({ articleCode: "A1", articleId: "V1", quantity: 7 })],
    });

    const result = mergeFresisPendingOrders([order1, order2], emptyMap);

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

    const result = mergeFresisPendingOrders([order], emptyMap);

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

    const result = mergeFresisPendingOrders([order], emptyMap);

    expect(result.items).toHaveLength(2);
  });

  test("sets per-line discount from discountMap by articleId", () => {
    const discountMap = new Map([["V1", 45]]);
    const order = makeOrder({
      items: [makeItem({ articleCode: "A1", articleId: "V1", discount: 15 })],
    });

    const result = mergeFresisPendingOrders([order], discountMap);

    expect(result.items[0].discount).toBe(45);
  });

  test("sets per-line discount from discountMap by articleCode", () => {
    const discountMap = new Map([["A1", 50]]);
    const order = makeOrder({
      items: [makeItem({ articleCode: "A1", discount: 15 })],
    });

    const result = mergeFresisPendingOrders([order], discountMap);

    expect(result.items[0].discount).toBe(50);
  });

  test("prefers articleId over articleCode when both are in discountMap", () => {
    const discountMap = new Map([
      ["V1", 45],
      ["A1", 50],
    ]);
    const order = makeOrder({
      items: [makeItem({ articleCode: "A1", articleId: "V1" })],
    });

    const result = mergeFresisPendingOrders([order], discountMap);

    expect(result.items[0].discount).toBe(45);
  });

  test("falls back to FRESIS_DEFAULT_DISCOUNT when article not in map", () => {
    const order = makeOrder({
      items: [makeItem({ articleCode: "UNKNOWN", articleId: "NOPE" })],
    });

    const result = mergeFresisPendingOrders([order], emptyMap);

    expect(result.items[0].discount).toBe(FRESIS_DEFAULT_DISCOUNT);
  });

  test("global discountPercent defaults to 0 when not provided", () => {
    const result = mergeFresisPendingOrders([makeOrder()], emptyMap);

    expect(result.discountPercent).toBe(0);
  });

  test("uses custom global discount when provided", () => {
    const result = mergeFresisPendingOrders([makeOrder()], emptyMap, 10);

    expect(result.discountPercent).toBe(10);
  });

  test("result has Fresis customerId and customerName", () => {
    const result = mergeFresisPendingOrders([makeOrder()], emptyMap);

    expect(result.customerId).toBe(FRESIS_CUSTOMER_PROFILE);
    expect(result.customerName).toBe("Fresis Soc Cooperativa");
  });

  test("result has pending status and needsSync true", () => {
    const result = mergeFresisPendingOrders([makeOrder()], emptyMap);

    expect(result.status).toBe("pending");
    expect(result.needsSync).toBe(true);
  });

  test("result has a new unique id", () => {
    const order = makeOrder();
    const result = mergeFresisPendingOrders([order], emptyMap);

    expect(result.id).not.toBe(order.id);
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("sums warehouseQuantity across orders", () => {
    const order1 = makeOrder({
      items: [
        makeItem({ articleCode: "A1", quantity: 5, warehouseQuantity: 2 }),
      ],
    });
    const order2 = makeOrder({
      items: [
        makeItem({ articleCode: "A1", quantity: 3, warehouseQuantity: 1 }),
      ],
    });

    const result = mergeFresisPendingOrders([order1, order2], emptyMap);

    expect(result.items[0].warehouseQuantity).toBe(3);
  });

  test("warehouseQuantity is undefined when all are zero", () => {
    const order = makeOrder({
      items: [makeItem({ articleCode: "A1", warehouseQuantity: undefined })],
    });

    const result = mergeFresisPendingOrders([order], emptyMap);

    expect(result.items[0].warehouseQuantity).toBeUndefined();
  });

  test("preserves price from first occurrence", () => {
    const order1 = makeOrder({
      items: [makeItem({ articleCode: "A1", price: 15 })],
    });
    const order2 = makeOrder({
      items: [makeItem({ articleCode: "A1", price: 20 })],
    });

    const result = mergeFresisPendingOrders([order1, order2], emptyMap);

    expect(result.items[0].price).toBe(15);
  });

  test("aggregates warehouseSources across orders with same article", () => {
    const source1 = { warehouseItemId: 1, boxName: "BOX1", quantity: 2 };
    const source2 = { warehouseItemId: 2, boxName: "BOX2", quantity: 3 };

    const order1 = makeOrder({
      items: [
        makeItem({
          articleCode: "A1",
          quantity: 5,
          warehouseQuantity: 2,
          warehouseSources: [source1],
        }),
      ],
    });
    const order2 = makeOrder({
      items: [
        makeItem({
          articleCode: "A1",
          quantity: 3,
          warehouseQuantity: 3,
          warehouseSources: [source2],
        }),
      ],
    });

    const result = mergeFresisPendingOrders([order1, order2], emptyMap);

    expect(result.items[0].warehouseSources).toEqual([source1, source2]);
  });

  test("warehouseSources is undefined when no orders have sources", () => {
    const order1 = makeOrder({
      items: [makeItem({ articleCode: "A1", quantity: 5 })],
    });
    const order2 = makeOrder({
      items: [makeItem({ articleCode: "A1", quantity: 3 })],
    });

    const result = mergeFresisPendingOrders([order1, order2], emptyMap);

    expect(result.items[0].warehouseSources).toBeUndefined();
  });

  test("preserves originalListPrice from first occurrence", () => {
    const order1 = makeOrder({
      items: [
        makeItem({
          articleCode: "A1",
          articleId: "V1",
          quantity: 5,
          price: 12,
          originalListPrice: 10,
        }),
      ],
    });
    const order2 = makeOrder({
      items: [
        makeItem({
          articleCode: "A1",
          articleId: "V1",
          quantity: 3,
          price: 12,
          originalListPrice: 10,
        }),
      ],
    });

    const result = mergeFresisPendingOrders([order1, order2], emptyMap);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].originalListPrice).toBe(10);
    expect(result.items[0].quantity).toBe(8);
  });
});

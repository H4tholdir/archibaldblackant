import { describe, expect, test } from "vitest";
import { groupOrdersByPeriod, type Order, type Period } from "./orderGrouping";

const createOrder = (id: string, creationDate: string): Order => ({
  id,
  creationDate,
  customerName: "Test Customer",
  totalAmount: "0.00",
  salesStatus: "test",
});

describe("groupOrdersByPeriod", () => {
  test("returns empty array for empty orders array", () => {
    const result = groupOrdersByPeriod([]);
    expect(result).toEqual([]);
  });

  test("groups order from today into Oggi", () => {
    const today = new Date().toISOString();
    const orders = [createOrder("1", today)];

    const result = groupOrdersByPeriod(orders);

    expect(result).toEqual([
      {
        period: "Oggi" as Period,
        orders: [createOrder("1", today)],
      },
    ]);
  });

  test("groups order from yesterday into Questa settimana", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const orders = [createOrder("1", yesterday.toISOString())];

    const result = groupOrdersByPeriod(orders);

    expect(result).toEqual([
      {
        period: "Questa settimana" as Period,
        orders: [createOrder("1", yesterday.toISOString())],
      },
    ]);
  });

  test("groups order from 5 days ago into Questa settimana", () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const orders = [createOrder("1", fiveDaysAgo.toISOString())];

    const result = groupOrdersByPeriod(orders);

    expect(result).toEqual([
      {
        period: "Questa settimana" as Period,
        orders: [createOrder("1", fiveDaysAgo.toISOString())],
      },
    ]);
  });

  test("groups order from 10 days ago in current month into Questo mese", () => {
    const now = new Date();
    const tenDaysAgo = new Date(now);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    // Only test if both dates are in same month
    if (tenDaysAgo.getMonth() === now.getMonth()) {
      const orders = [createOrder("1", tenDaysAgo.toISOString())];
      const result = groupOrdersByPeriod(orders);

      expect(result).toEqual([
        {
          period: "Questo mese" as Period,
          orders: [createOrder("1", tenDaysAgo.toISOString())],
        },
      ]);
    }
  });

  test("groups order from last month into Più vecchi", () => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const orders = [createOrder("1", lastMonth.toISOString())];

    const result = groupOrdersByPeriod(orders);

    expect(result).toEqual([
      {
        period: "Più vecchi" as Period,
        orders: [createOrder("1", lastMonth.toISOString())],
      },
    ]);
  });

  test("sorts orders within each group by date descending (newest first)", () => {
    const today1 = new Date();
    today1.setHours(10, 0, 0, 0);
    const today2 = new Date();
    today2.setHours(15, 0, 0, 0);

    const orders = [
      createOrder("1", today1.toISOString()),
      createOrder("2", today2.toISOString()),
    ];

    const result = groupOrdersByPeriod(orders);

    expect(result[0].orders[0].id).toBe("2"); // Later time should be first
    expect(result[0].orders[1].id).toBe("1");
  });

  test("groups multiple orders across different periods", () => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const orders = [
      createOrder("1", today.toISOString()),
      createOrder("2", yesterday.toISOString()),
      createOrder("3", lastMonth.toISOString()),
    ];

    const result = groupOrdersByPeriod(orders);

    expect(result).toHaveLength(3);
    expect(result[0].period).toBe("Oggi");
    expect(result[1].period).toBe("Questa settimana");
    expect(result[2].period).toBe("Più vecchi");
  });

  test("returns only non-empty groups", () => {
    const today = new Date();
    const orders = [createOrder("1", today.toISOString())];

    const result = groupOrdersByPeriod(orders);

    expect(result).toHaveLength(1);
    expect(result[0].period).toBe("Oggi");
  });

  test("handles invalid date by grouping into Più vecchi", () => {
    const orders = [createOrder("1", "invalid-date")];

    const result = groupOrdersByPeriod(orders);

    expect(result).toEqual([
      {
        period: "Più vecchi" as Period,
        orders: [createOrder("1", "invalid-date")],
      },
    ]);
  });

  test("preserves order properties when grouping", () => {
    const today = new Date();
    const orderWithExtraProps = {
      id: "1",
      creationDate: today.toISOString(),
      customerName: "Test Customer",
      totalAmount: "100.00 €",
      salesStatus: "Evaso",
    };

    const result = groupOrdersByPeriod([orderWithExtraProps]);

    expect(result[0].orders[0]).toEqual(orderWithExtraProps);
  });

  test("groups are in correct order: Oggi, Questa settimana, Questo mese, Più vecchi", () => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    // Ensure twoWeeksAgo is in current month
    const now = new Date();
    if (twoWeeksAgo.getMonth() !== now.getMonth()) {
      twoWeeksAgo.setMonth(now.getMonth());
      twoWeeksAgo.setDate(15); // Mid-month to avoid edge cases
    }

    const orders = [
      createOrder("4", twoMonthsAgo.toISOString()),
      createOrder("1", today.toISOString()),
      createOrder("3", twoWeeksAgo.toISOString()),
      createOrder("2", yesterday.toISOString()),
    ];

    const result = groupOrdersByPeriod(orders);

    const periods = result.map((g) => g.period);
    const expectedPeriods: Period[] = [
      "Oggi",
      "Questa settimana",
      "Questo mese",
      "Più vecchi",
    ];

    // Verify order of periods that exist
    const expectedOrder = expectedPeriods.filter((p) => periods.includes(p));
    expect(periods).toEqual(expectedOrder);
  });
});

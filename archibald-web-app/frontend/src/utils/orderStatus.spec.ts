import { describe, expect, test } from "vitest";
import type { Order } from "../types/order";
import {
  getOrderStatus,
  getAllStatusStyles,
  getStatusStyleByCategory,
  type OrderStatusCategory,
} from "./orderStatus";

describe("getOrderStatus", () => {
  describe("invoiced status", () => {
    test("returns invoiced when order has invoice number and FATTURA document state", () => {
      const order: Partial<Order> = {
        id: "test-order-1",
        customerName: "Test Customer",
        date: "2026-01-15",
        total: "1000.00",
        status: "FATTURATO",
        invoiceNumber: "FAT/2026/001",
        documentState: "FATTURA",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("invoiced");
      expect(result.label).toBe("Fatturato");
      expect(result.borderColor).toBe("#4527A0");
      expect(result.backgroundColor).toBe("#D1C4E9");
    });

    test("returns invoiced for legacy orders with only invoice number", () => {
      const order: Partial<Order> = {
        id: "legacy-order",
        customerName: "Legacy Customer",
        date: "2025-12-01",
        total: "500.00",
        status: "Completato",
        invoiceNumber: "FAT/2025/999",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("invoiced");
    });
  });

  describe("delivered status", () => {
    test("returns delivered when order has delivery completed date", () => {
      const order = {
        id: "delivered-order",
        customerName: "Delivered Customer",
        date: "2026-01-20",
        total: "750.00",
        status: "CONSEGNATO",
        orderType: "ORDINE DI VENDITA",
        tracking: {
          trackingNumber: "123456789",
          trackingUrl: "https://fedex.com/track/123456789",
          trackingCourier: "FedEx",
        },
        deliveryCompletedDate: "2026-01-25T14:30:00Z",
      } as Order;

      const result = getOrderStatus(order);

      expect(result.category).toBe("delivered");
      expect(result.label).toBe("Consegnato");
      expect(result.borderColor).toBe("#00695C");
      expect(result.backgroundColor).toBe("#B2DFDB");
    });
  });

  describe("in-transit status", () => {
    test("returns in-transit when order has tracking and is recently shipped", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const order: Partial<Order> = {
        id: "transit-order",
        customerName: "Transit Customer",
        date: yesterday.toISOString().slice(0, 10),
        total: "900.00",
        status: "CONSEGNATO",
        orderType: "ORDINE DI VENDITA",
        state: "TRASFERITO",
        tracking: {
          trackingNumber: "987654321",
          trackingUrl: "https://fedex.com/track/987654321",
          trackingCourier: "FedEx",
        },
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("in-transit");
      expect(result.label).toBe("In transito");
      expect(result.borderColor).toBe("#1565C0");
      expect(result.backgroundColor).toBe("#BBDEFB");
    });

    test("returns in-transit when tracking is in DDT field (recent)", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const order: Partial<Order> = {
        id: "transit-order-ddt",
        customerName: "Transit DDT Customer",
        date: yesterday.toISOString().slice(0, 10),
        total: "600.00",
        status: "CONSEGNATO",
        ddt: {
          trackingNumber: "FEDEX123",
          trackingUrl: "https://fedex.com/track/FEDEX123",
          trackingCourier: "FedEx",
        },
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("in-transit");
    });

    test("returns in-transit for recent orders with tracking only", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const order: Partial<Order> = {
        id: "recent-tracking",
        customerName: "Recent Tracking",
        date: yesterday.toISOString().slice(0, 10),
        total: "400.00",
        status: "Spedito",
        tracking: {
          trackingNumber: "LEG999",
        },
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("in-transit");
    });

    test("returns delivered for old orders with tracking (3+ days)", () => {
      const order: Partial<Order> = {
        id: "old-tracking",
        customerName: "Old Tracking",
        date: "2025-11-15",
        total: "400.00",
        status: "Spedito",
        tracking: {
          trackingNumber: "LEG999",
        },
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("delivered");
    });
  });

  describe("blocked status", () => {
    test("returns blocked when order has TRANSFER ERROR state", () => {
      const order: Partial<Order> = {
        id: "blocked-order",
        customerName: "Blocked Customer",
        date: "2026-01-18",
        total: "1200.00",
        status: "ORDINE APERTO",
        state: "TRANSFER ERROR",
        orderType: "GIORNALE",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("blocked");
      expect(result.label).toBe("Richiede intervento");
      expect(result.borderColor).toBe("#C62828");
      expect(result.backgroundColor).toBe("#FFCDD2");
    });
  });

  describe("pending-approval status", () => {
    test("returns pending-approval when order is waiting for approval", () => {
      const order: Partial<Order> = {
        id: "pending-order",
        customerName: "Pending Customer",
        date: "2026-01-28",
        total: "850.00",
        status: "ORDINE APERTO",
        state: "IN ATTESA DI APPROVAZIONE",
        orderType: "GIORNALE",
        documentState: "NESSUNO",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("pending-approval");
      expect(result.label).toBe("In attesa approvazione");
      expect(result.borderColor).toBe("#F57F17");
      expect(result.backgroundColor).toBe("#FFF9C4");
    });
  });

  describe("in-processing status", () => {
    test("returns in-processing for transferred ORD/ order without tracking", () => {
      const order: Partial<Order> = {
        id: "processing-order",
        customerName: "Processing Customer",
        date: "2026-02-12",
        total: "899.01",
        status: "Ordine aperto",
        orderNumber: "ORD/26002615",
        orderType: "Ordine di vendita",
        transferStatus: "Trasferito",
        documentState: "Nessuno",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("in-processing");
      expect(result.label).toBe("In lavorazione");
      expect(result.borderColor).toBe("#0277BD");
      expect(result.backgroundColor).toBe("#B3E5FC");
    });

    test("does not return in-processing for PENDING orders", () => {
      const order: Partial<Order> = {
        id: "pending-local",
        customerName: "Pending Local",
        date: "2026-02-12",
        total: "100.00",
        status: "Ordine aperto",
        orderNumber: "PENDING-72.938",
        transferStatus: "Modifica",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("on-archibald");
    });
  });

  describe("on-archibald status", () => {
    test("returns on-archibald when order is created locally", () => {
      const order: Partial<Order> = {
        id: "local-order",
        customerName: "Local Customer",
        date: "2026-01-30",
        total: "650.00",
        status: "ORDINE APERTO",
        state: "MODIFICA",
        orderType: "GIORNALE",
        documentState: "NESSUNO",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("on-archibald");
      expect(result.label).toBe("Su Archibald");
      expect(result.borderColor).toBe("#546E7A");
      expect(result.backgroundColor).toBe("#ECEFF1");
    });

    test("returns on-archibald as fallback for unknown states", () => {
      const order: Partial<Order> = {
        id: "unknown-order",
        customerName: "Unknown Customer",
        date: "2026-01-01",
        total: "100.00",
        status: "Unknown Status",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("on-archibald");
    });
  });

  describe("priority order", () => {
    test("invoiced takes priority over delivered", () => {
      const order: Partial<Order> = {
        id: "priority-test-1",
        customerName: "Priority Customer",
        date: "2026-01-15",
        total: "1000.00",
        status: "CONSEGNATO",
        invoiceNumber: "FAT/2026/100",
        documentState: "FATTURA",
        tracking: { trackingNumber: "TRACK123" },
        deliveryCompletedDate: "2026-01-20T10:00:00Z",
      } as any;

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("invoiced");
    });

    test("delivered takes priority over in-transit", () => {
      const order: Partial<Order> = {
        id: "priority-test-2",
        customerName: "Priority Customer 2",
        date: "2026-01-16",
        total: "800.00",
        status: "CONSEGNATO",
        tracking: { trackingNumber: "TRACK456" },
        deliveryCompletedDate: "2026-01-22T15:30:00Z",
      } as any;

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("delivered");
    });

    test("blocked takes priority over pending-approval", () => {
      const order: Partial<Order> = {
        id: "priority-test-3",
        customerName: "Priority Customer 3",
        date: "2026-01-17",
        total: "700.00",
        status: "ORDINE APERTO",
        state: "TRANSFER ERROR",
        orderType: "GIORNALE",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("blocked");
    });

    test("in-processing takes priority over on-archibald for ORD/ orders", () => {
      const order: Partial<Order> = {
        id: "priority-test-4",
        customerName: "Priority Customer 4",
        date: "2026-02-12",
        total: "500.00",
        status: "Ordine aperto",
        orderNumber: "ORD/26002613",
        transferStatus: "Trasferito",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("in-processing");
    });
  });
});

describe("getAllStatusStyles", () => {
  test("returns all 9 status styles", () => {
    const allStyles = getAllStatusStyles();

    expect(allStyles).toHaveLength(9);

    const categories = allStyles.map((s) => s.category);
    expect(categories).toContain("on-archibald");
    expect(categories).toContain("pending-approval");
    expect(categories).toContain("in-processing");
    expect(categories).toContain("blocked");
    expect(categories).toContain("in-transit");
    expect(categories).toContain("delivered");
    expect(categories).toContain("invoiced");
    expect(categories).toContain("overdue");
    expect(categories).toContain("paid");
  });

  test("each status has required fields", () => {
    const allStyles = getAllStatusStyles();

    allStyles.forEach((style) => {
      expect(style.category).toBeDefined();
      expect(style.label).toBeDefined();
      expect(style.description).toBeDefined();
      expect(style.borderColor).toMatch(/^#[0-9A-F]{6}$/i);
      expect(style.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });
});

describe("getStatusStyleByCategory", () => {
  test("returns correct style for each category", () => {
    const categories: OrderStatusCategory[] = [
      "on-archibald",
      "pending-approval",
      "in-processing",
      "blocked",
      "in-transit",
      "delivered",
      "invoiced",
      "overdue",
      "paid",
    ];

    categories.forEach((category) => {
      const style = getStatusStyleByCategory(category);
      expect(style.category).toBe(category);
      expect(style.label).toBeDefined();
      expect(style.borderColor).toBeDefined();
      expect(style.backgroundColor).toBeDefined();
    });
  });

  test("invoiced returns deep purple colors", () => {
    const style = getStatusStyleByCategory("invoiced");

    expect(style.borderColor).toBe("#4527A0");
    expect(style.backgroundColor).toBe("#D1C4E9");
  });

  test("blocked returns red colors", () => {
    const style = getStatusStyleByCategory("blocked");

    expect(style.borderColor).toBe("#C62828");
    expect(style.backgroundColor).toBe("#FFCDD2");
  });

  test("in-processing returns light blue colors", () => {
    const style = getStatusStyleByCategory("in-processing");

    expect(style.borderColor).toBe("#0277BD");
    expect(style.backgroundColor).toBe("#B3E5FC");
  });
});

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
    test("returns invoiced when order has invoice number and FATTURA document status", () => {
      const order: Partial<Order> = {
        id: "test-order-1",
        customerName: "Test Customer",
        creationDate: "2026-01-15",
        totalAmount: "1000.00",
        salesStatus: "FATTURATO",
        invoiceNumber: "FAT/2026/001",
        documentStatus: "FATTURA",
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
        creationDate: "2025-12-01",
        totalAmount: "500.00",
        salesStatus: "Completato",
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
        creationDate: "2026-01-20",
        totalAmount: "750.00",
        salesStatus: "CONSEGNATO",
        orderType: "ORDINE DI VENDITA",
        trackingNumber: "123456789",
        trackingUrl: "https://fedex.com/track/123456789",
        trackingCourier: "FedEx",
        deliveryCompletedDate: "2026-01-25T14:30:00Z",
      } as Order;

      const result = getOrderStatus(order);

      expect(result.category).toBe("delivered");
      expect(result.label).toBe("Consegnato");
      expect(result.borderColor).toBe("#0277BD");
      expect(result.backgroundColor).toBe("#B3E5FC");
    });
  });

  describe("in-transit status", () => {
    test("returns in-transit when order has tracking and is recently shipped", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const order: Partial<Order> = {
        id: "transit-order",
        customerName: "Transit Customer",
        creationDate: yesterday.toISOString().slice(0, 10),
        totalAmount: "900.00",
        salesStatus: "CONSEGNATO",
        orderType: "ORDINE DI VENDITA",
        currentState: "TRASFERITO",
        trackingNumber: "987654321",
        trackingUrl: "https://fedex.com/track/987654321",
        trackingCourier: "FedEx",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("in-transit");
      expect(result.label).toBe("In transito");
      expect(result.borderColor).toBe("#1565C0");
      expect(result.backgroundColor).toBe("#BBDEFB");
    });

    test("returns in-transit when tracking is in DDT fields (recent)", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const order: Partial<Order> = {
        id: "transit-order-ddt",
        customerName: "Transit DDT Customer",
        creationDate: yesterday.toISOString().slice(0, 10),
        totalAmount: "600.00",
        salesStatus: "CONSEGNATO",
        trackingNumber: "FEDEX123",
        trackingUrl: "https://fedex.com/track/FEDEX123",
        trackingCourier: "FedEx",
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
        creationDate: yesterday.toISOString().slice(0, 10),
        totalAmount: "400.00",
        salesStatus: "Spedito",
        trackingNumber: "LEG999",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("in-transit");
    });

    test("returns delivered for old orders with tracking (3+ days)", () => {
      const order: Partial<Order> = {
        id: "old-tracking",
        customerName: "Old Tracking",
        creationDate: "2025-11-15",
        totalAmount: "400.00",
        salesStatus: "Spedito",
        trackingNumber: "LEG999",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("delivered");
    });
  });

  describe("blocked status", () => {
    test("returns blocked when order has TRANSFER ERROR currentState", () => {
      const order: Partial<Order> = {
        id: "blocked-order",
        customerName: "Blocked Customer",
        creationDate: "2026-01-18",
        totalAmount: "1200.00",
        salesStatus: "ORDINE APERTO",
        currentState: "TRANSFER ERROR",
        orderType: "GIORNALE",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("blocked");
      expect(result.label).toBe("Richiede intervento");
      expect(result.borderColor).toBe("#C62828");
      expect(result.backgroundColor).toBe("#FFCDD2");
    });

    test("returns blocked when transferStatus is TRANSFER ERROR", () => {
      const order: Partial<Order> = {
        id: "blocked-transfer",
        customerName: "Blocked Transfer Customer",
        creationDate: "2026-01-18",
        totalAmount: "1200.00",
        salesStatus: "ORDINE APERTO",
        transferStatus: "Transfer Error",
        orderType: "GIORNALE",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("blocked");
    });

    test("returns blocked when transferStatus is Transfer_error (underscore from Archibald)", () => {
      const order: Partial<Order> = {
        id: "blocked-underscore",
        customerName: "Blocked Underscore Customer",
        creationDate: "2026-02-16",
        totalAmount: "435.65",
        salesStatus: "ORDINE APERTO",
        transferStatus: "Transfer_error",
        orderType: "GIORNALE",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("blocked");
      expect(result.label).toBe("Richiede intervento");
    });
  });

  describe("pending-approval status", () => {
    test("returns pending-approval when order has currentState IN ATTESA DI APPROVAZIONE", () => {
      const order: Partial<Order> = {
        id: "pending-order",
        customerName: "Pending Customer",
        creationDate: "2026-01-28",
        totalAmount: "850.00",
        salesStatus: "ORDINE APERTO",
        currentState: "IN ATTESA DI APPROVAZIONE",
        orderType: "GIORNALE",
        documentStatus: "NESSUNO",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("pending-approval");
      expect(result.label).toBe("In attesa approvazione");
      expect(result.borderColor).toBe("#F57F17");
      expect(result.backgroundColor).toBe("#FFF9C4");
    });

    test("returns pending-approval when transferStatus is In attesa di approvazione", () => {
      const order: Partial<Order> = {
        id: "pending-transfer",
        customerName: "Pending Transfer Customer",
        creationDate: "2026-02-13",
        totalAmount: "622.97",
        salesStatus: "ORDINE APERTO",
        orderNumber: "PENDING-73.039",
        transferStatus: "In attesa di approvazione",
        orderType: "GIORNALE",
        documentStatus: "NESSUNO",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("pending-approval");
      expect(result.label).toBe("In attesa approvazione");
      expect(result.backgroundColor).toBe("#FFF9C4");
    });
  });

  describe("in-processing status", () => {
    test("returns in-processing for transferred ORD/ order without tracking", () => {
      const order: Partial<Order> = {
        id: "processing-order",
        customerName: "Processing Customer",
        creationDate: "2026-02-12",
        totalAmount: "899.01",
        salesStatus: "Ordine aperto",
        orderNumber: "ORD/26002615",
        orderType: "Ordine di vendita",
        transferStatus: "Trasferito",
        documentStatus: "Nessuno",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("in-processing");
      expect(result.label).toBe("In lavorazione");
      expect(result.borderColor).toBe("#5D4037");
      expect(result.backgroundColor).toBe("#D7CCC8");
    });

    test("returns in-processing when transferStatus is Completato", () => {
      const order: Partial<Order> = {
        id: "completato-order",
        customerName: "Fresis Soc Cooperativa",
        creationDate: "2026-02-16",
        totalAmount: "747.76",
        salesStatus: "Ordine aperto",
        orderNumber: "PENDING-48.435",
        transferStatus: "Completato",
        orderType: "Giornale",
        documentStatus: "Nessuno",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("in-processing");
      expect(result.label).toBe("In lavorazione");
    });

    test("does not return in-processing for PENDING orders", () => {
      const order: Partial<Order> = {
        id: "pending-local",
        customerName: "Pending Local",
        creationDate: "2026-02-12",
        totalAmount: "100.00",
        salesStatus: "Ordine aperto",
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
        creationDate: "2026-01-30",
        totalAmount: "650.00",
        salesStatus: "ORDINE APERTO",
        currentState: "MODIFICA",
        orderType: "GIORNALE",
        documentStatus: "NESSUNO",
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
        creationDate: "2026-01-01",
        totalAmount: "100.00",
        salesStatus: "Unknown Status",
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
        creationDate: "2026-01-15",
        totalAmount: "1000.00",
        salesStatus: "CONSEGNATO",
        invoiceNumber: "FAT/2026/100",
        documentStatus: "FATTURA",
        trackingNumber: "TRACK123",
        deliveryCompletedDate: "2026-01-20T10:00:00Z",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("invoiced");
    });

    test("delivered takes priority over in-transit", () => {
      const order: Partial<Order> = {
        id: "priority-test-2",
        customerName: "Priority Customer 2",
        creationDate: "2026-01-16",
        totalAmount: "800.00",
        salesStatus: "CONSEGNATO",
        trackingNumber: "TRACK456",
        deliveryCompletedDate: "2026-01-22T15:30:00Z",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("delivered");
    });

    test("blocked takes priority over pending-approval", () => {
      const order: Partial<Order> = {
        id: "priority-test-3",
        customerName: "Priority Customer 3",
        creationDate: "2026-01-17",
        totalAmount: "700.00",
        salesStatus: "ORDINE APERTO",
        currentState: "TRANSFER ERROR",
        orderType: "GIORNALE",
      };

      const result = getOrderStatus(order as Order);

      expect(result.category).toBe("blocked");
    });

    test("in-processing takes priority over on-archibald for ORD/ orders", () => {
      const order: Partial<Order> = {
        id: "priority-test-4",
        customerName: "Priority Customer 4",
        creationDate: "2026-02-12",
        totalAmount: "500.00",
        salesStatus: "Ordine aperto",
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

  test("in-processing returns brown colors", () => {
    const style = getStatusStyleByCategory("in-processing");

    expect(style.borderColor).toBe("#5D4037");
    expect(style.backgroundColor).toBe("#D7CCC8");
  });
});

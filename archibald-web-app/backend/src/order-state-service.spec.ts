import { describe, test, expect } from "vitest";
import { OrderStateService } from "./order-state-service";
import type { StoredOrder } from "./order-db";

describe("OrderStateService", () => {
  const service = new OrderStateService();

  // Helper to create test order
  const createTestOrder = (overrides: Partial<StoredOrder>): StoredOrder => ({
    id: "ORD/26000552",
    userId: "test-user",
    orderNumber: "70.614",
    customerProfileId: "1002209",
    customerName: "Test Customer",
    deliveryName: "Test Delivery",
    deliveryAddress: "Via Test 123",
    creationDate: "2026-01-01T00:00:00Z",
    deliveryDate: "2026-01-15T00:00:00Z",
    status: "Ordine aperto",
    customerReference: null,
    lastScraped: "2026-01-15T00:00:00Z",
    lastUpdated: "2026-01-15T00:00:00Z",
    isOpen: true,
    detailJson: null,
    sentToMilanoAt: null,
    currentState: "creato",
    ddtNumber: null,
    trackingNumber: null,
    trackingUrl: null,
    trackingCourier: null,
    ...overrides,
  });

  describe("detectOrderState", () => {
    test("detects 'creato' state when no archibaldOrderId", async () => {
      const order = createTestOrder({});

      const result = await service.detectOrderState(order);

      expect(result.state).toBe("creato");
      expect(result.confidence).toBe("high");
      expect(result.source).toBe("database");
    });

    test("detects 'piazzato' state when has archibaldOrderId but no sentToMilanoAt", async () => {
      const order = createTestOrder({
        sentToMilanoAt: null,
      });
      // Simulate archibaldOrderId (not in StoredOrder interface but checked at runtime)
      (order as any).archibaldOrderId = "ARC123";

      const result = await service.detectOrderState(order);

      expect(result.state).toBe("piazzato");
      expect(result.confidence).toBe("high");
      expect(result.source).toBe("database");
    });

    test("detects 'inviato_milano' state when sent to Milano but no progression", async () => {
      const order = createTestOrder({
        sentToMilanoAt: "2026-01-10T00:00:00Z",
        currentState: "inviato_milano",
        status: "Unknown status", // Non-matching status to test fallback
      });
      (order as any).archibaldOrderId = "ARC123";

      const result = await service.detectOrderState(order);

      expect(result.state).toBe("inviato_milano");
      expect(result.confidence).toBe("low");
      expect(result.source).toBe("database");
    });

    test("detects 'spedito' state when has DDT but delivery date in future", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const order = createTestOrder({
        sentToMilanoAt: "2026-01-10T00:00:00Z",
        ddtNumber: "DDT/26000515",
        trackingNumber: "445291888246",
        trackingCourier: "fedex",
        deliveryDate: futureDate.toISOString(),
      });
      (order as any).archibaldOrderId = "ARC123";

      const result = await service.detectOrderState(order);

      expect(result.state).toBe("spedito");
      expect(result.confidence).toBe("high");
      expect(result.source).toBe("database");
      expect(result.notes).toContain("DDT/26000515");
    });

    test("detects 'consegnato' state when delivery date has passed", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);

      const order = createTestOrder({
        sentToMilanoAt: "2026-01-01T00:00:00Z",
        ddtNumber: "DDT/26000515",
        deliveryDate: pastDate.toISOString(),
      });
      (order as any).archibaldOrderId = "ARC123";

      const result = await service.detectOrderState(order);

      expect(result.state).toBe("consegnato");
      expect(result.confidence).toBe("high");
      expect(result.source).toBe("database");
    });

    test("detects 'ordine_aperto' from Archibald status", async () => {
      const order = createTestOrder({
        sentToMilanoAt: "2026-01-10T00:00:00Z",
        status: "Ordine aperto",
      });
      (order as any).archibaldOrderId = "ARC123";

      const result = await service.detectOrderState(order);

      expect(result.state).toBe("ordine_aperto");
      expect(result.confidence).toBe("high");
      expect(result.source).toBe("archibald");
    });

    test("detects 'consegnato' from Archibald status", async () => {
      const order = createTestOrder({
        sentToMilanoAt: "2026-01-10T00:00:00Z",
        status: "Consegnato",
      });
      (order as any).archibaldOrderId = "ARC123";

      const result = await service.detectOrderState(order);

      expect(result.state).toBe("consegnato");
      expect(result.confidence).toBe("high");
      expect(result.source).toBe("archibald");
    });

    test("detects 'fatturato' from Archibald status", async () => {
      const order = createTestOrder({
        sentToMilanoAt: "2026-01-10T00:00:00Z",
        status: "Fatturato",
      });
      (order as any).archibaldOrderId = "ARC123";

      const result = await service.detectOrderState(order);

      expect(result.state).toBe("fatturato");
      expect(result.confidence).toBe("high");
      expect(result.source).toBe("archibald");
    });

    test("falls back to current state when state unclear", async () => {
      const order = createTestOrder({
        sentToMilanoAt: "2026-01-10T00:00:00Z",
        currentState: "trasferito",
        status: "Unknown status",
      });
      (order as any).archibaldOrderId = "ARC123";

      const result = await service.detectOrderState(order);

      expect(result.state).toBe("trasferito");
      expect(result.confidence).toBe("low");
      expect(result.source).toBe("database");
    });
  });

  describe("hasStateProgressed", () => {
    test("returns true when state progresses linearly", () => {
      expect(service.hasStateProgressed("creato", "piazzato")).toBe(true);
      expect(service.hasStateProgressed("piazzato", "inviato_milano")).toBe(
        true,
      );
      expect(service.hasStateProgressed("inviato_milano", "trasferito")).toBe(
        true,
      );
      expect(service.hasStateProgressed("ordine_aperto", "spedito")).toBe(true);
      expect(service.hasStateProgressed("spedito", "consegnato")).toBe(true);
      expect(service.hasStateProgressed("consegnato", "fatturato")).toBe(true);
    });

    test("returns false when state does not progress", () => {
      expect(service.hasStateProgressed("spedito", "creato")).toBe(false);
      expect(service.hasStateProgressed("consegnato", "piazzato")).toBe(false);
      expect(service.hasStateProgressed("fatturato", "ordine_aperto")).toBe(
        false,
      );
    });

    test("returns false when state is the same", () => {
      expect(service.hasStateProgressed("creato", "creato")).toBe(false);
      expect(service.hasStateProgressed("spedito", "spedito")).toBe(false);
    });

    test("handles branching states (modifica, transfer_error)", () => {
      expect(service.hasStateProgressed("inviato_milano", "modifica")).toBe(
        true,
      );
      expect(
        service.hasStateProgressed("inviato_milano", "transfer_error"),
      ).toBe(true);
      expect(service.hasStateProgressed("modifica", "modifica")).toBe(false);
    });
  });

  describe("getStateLabel", () => {
    test("returns Italian labels for all states", () => {
      expect(service.getStateLabel("creato")).toBe("Creato");
      expect(service.getStateLabel("piazzato")).toBe("Piazzato su Archibald");
      expect(service.getStateLabel("inviato_milano")).toBe("Inviato a Milano");
      expect(service.getStateLabel("modifica")).toBe("In modifica");
      expect(service.getStateLabel("trasferito")).toBe("Trasferito");
      expect(service.getStateLabel("transfer_error")).toBe(
        "Errore trasferimento",
      );
      expect(service.getStateLabel("ordine_aperto")).toBe("Ordine aperto");
      expect(service.getStateLabel("spedito")).toBe("Spedito");
      expect(service.getStateLabel("consegnato")).toBe("Consegnato");
      expect(service.getStateLabel("fatturato")).toBe("Fatturato");
    });
  });
});

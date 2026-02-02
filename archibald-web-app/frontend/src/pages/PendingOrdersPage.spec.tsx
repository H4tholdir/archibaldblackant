import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PendingOrdersPage } from "./PendingOrdersPage";
import { orderService } from "../services/orders.service";
import type { PendingOrder } from "../db/schema";

// Mock orderService
vi.mock("../services/orders.service", () => ({
  orderService: {
    getPendingOrders: vi.fn(),
    updatePendingOrderStatus: vi.fn(),
  },
}));

// Mock fetch for bot submission
global.fetch = vi.fn();

const mockOrders: PendingOrder[] = [
  {
    id: "order-uuid-001",
    customerId: "c1",
    customerName: "Cliente 1",
    items: [
      {
        articleCode: "ART001",
        productName: "Prodotto 1",
        quantity: 5,
        price: 10,
        vat: 22,
      },
    ],
    createdAt: "2026-01-20T10:00:00Z",
    updatedAt: "2026-01-20T10:00:00Z",
    status: "pending",
    retryCount: 0,
    deviceId: "test-device-001",
    needsSync: false,
  },
  {
    id: "order-uuid-002",
    customerId: "c2",
    customerName: "Cliente 2",
    items: [
      {
        articleCode: "ART002",
        productName: "Prodotto 2",
        quantity: 2,
        price: 50,
        vat: 22,
      },
    ],
    createdAt: "2026-01-21T14:00:00Z",
    updatedAt: "2026-01-21T14:00:00Z",
    status: "pending",
    retryCount: 0,
    deviceId: "test-device-001",
    needsSync: false,
  },
  {
    id: "order-uuid-003",
    customerId: "c3",
    customerName: "Cliente 3",
    items: [
      {
        articleCode: "ART003",
        productName: "Prodotto 3",
        quantity: 1,
        price: 100,
        vat: 22,
      },
    ],
    createdAt: "2026-01-22T09:00:00Z",
    updatedAt: "2026-01-22T09:00:00Z",
    status: "error",
    errorMessage: "Network timeout",
    retryCount: 1,
    deviceId: "test-device-001",
    needsSync: false,
  },
];

describe("PendingOrdersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders empty state when no pending orders", async () => {
    vi.mocked(orderService.getPendingOrders).mockResolvedValue([]);

    render(<PendingOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Nessun ordine in attesa/i)).toBeInTheDocument();
    });
  });

  test("displays list of pending orders with details", async () => {
    vi.mocked(orderService.getPendingOrders).mockResolvedValue(mockOrders);

    render(<PendingOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText("Cliente 1")).toBeInTheDocument();
      expect(screen.getByText("Cliente 2")).toBeInTheDocument();
      expect(screen.getByText("Cliente 3")).toBeInTheDocument();
      expect(screen.getByText(/Ordini in Attesa \(3\)/i)).toBeInTheDocument();
    });
  });

  test("shows order items and totals", async () => {
    vi.mocked(orderService.getPendingOrders).mockResolvedValue([mockOrders[0]]);

    render(<PendingOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText("Prodotto 1")).toBeInTheDocument();
      expect(screen.getByText(/Quantità: 5/i)).toBeInTheDocument();
      expect(screen.getByText("€50.00")).toBeInTheDocument();
    });
  });

  test("shows status badges correctly", async () => {
    vi.mocked(orderService.getPendingOrders).mockResolvedValue(mockOrders);

    render(<PendingOrdersPage />);

    await waitFor(() => {
      const pendingBadges = screen.getAllByText("In Attesa");
      expect(pendingBadges).toHaveLength(2);
      expect(screen.getByText("Errore")).toBeInTheDocument();
    });
  });

  test("shows error message for failed orders", async () => {
    vi.mocked(orderService.getPendingOrders).mockResolvedValue([mockOrders[2]]);

    render(<PendingOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Network timeout/i)).toBeInTheDocument();
    });
  });

  test("checkbox for each order allows selection", async () => {
    vi.mocked(orderService.getPendingOrders).mockResolvedValue(mockOrders);

    render(<PendingOrdersPage />);

    await waitFor(() => {
      const checkboxes = screen.getAllByRole("checkbox");
      // Should have 4 checkboxes: 1 "Select All" + 3 orders
      expect(checkboxes).toHaveLength(4);
    });

    const orderCheckboxes = screen.getAllByRole("checkbox").slice(1); // Skip "Select All"
    fireEvent.click(orderCheckboxes[0]);

    await waitFor(() => {
      expect(
        screen.getByText(/Invia Ordini Selezionati \(1\)/i),
      ).toBeInTheDocument();
    });
  });

  test('"Select All" checkbox selects all orders', async () => {
    vi.mocked(orderService.getPendingOrders).mockResolvedValue(mockOrders);

    render(<PendingOrdersPage />);

    await waitFor(() => {
      const selectAllCheckbox = screen.getAllByRole("checkbox")[0];
      fireEvent.click(selectAllCheckbox);
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Invia Ordini Selezionati \(3\)/i),
      ).toBeInTheDocument();
    });
  });

  test('"Invia Ordini Selezionati" button disabled when no selection', async () => {
    vi.mocked(orderService.getPendingOrders).mockResolvedValue(mockOrders);

    render(<PendingOrdersPage />);

    await waitFor(() => {
      const submitButton = screen.getByRole("button", {
        name: /Invia Ordini Selezionati/i,
      });
      expect(submitButton).toBeDisabled();
    });
  });

  test("submits selected orders to bot API", async () => {
    vi.mocked(orderService.getPendingOrders).mockResolvedValue(mockOrders);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ jobIds: ["job-123", "job-456"] }),
    } as Response);

    render(<PendingOrdersPage />);

    await waitFor(() => {
      const orderCheckboxes = screen.getAllByRole("checkbox").slice(1);
      fireEvent.click(orderCheckboxes[0]);
      fireEvent.click(orderCheckboxes[1]);
    });

    const submitButton = screen.getByRole("button", {
      name: /Invia Ordini Selezionati \(2\)/i,
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/bot/submit-orders",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      const callArgs = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.orders).toHaveLength(2);
      expect(body.orders[0].customerId).toBe("c1");
      expect(body.orders[1].customerId).toBe("c2");
    });

    await waitFor(() => {
      expect(orderService.updatePendingOrderStatus).toHaveBeenCalledWith(
        "order-uuid-001",
        "syncing",
      );
      expect(orderService.updatePendingOrderStatus).toHaveBeenCalledWith(
        "order-uuid-002",
        "syncing",
      );
    });
  });
});

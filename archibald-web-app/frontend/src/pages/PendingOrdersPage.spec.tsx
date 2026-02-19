// @ts-nocheck
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PendingOrdersPage } from "./PendingOrdersPage";
import { orderService } from "../services/orders.service";
import type { PendingOrder } from "../types/pending-order";

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// Mock db/schema to prevent heavy Dexie initialization
vi.mock("../db/schema", () => ({
  db: {
    pendingOrders: { update: vi.fn(), add: vi.fn(), delete: vi.fn() },
    customers: { get: vi.fn() },
    fresisHistory: { bulkAdd: vi.fn() },
    cacheMetadata: { put: vi.fn() },
  },
}));

// Mock usePendingSync hook — module-level vars so tests can set data before render
let mockPendingOrders: PendingOrder[] = [];
let mockIsSyncing = false;
const mockRefetch = vi.fn();
vi.mock("../hooks/usePendingSync", () => ({
  usePendingSync: () => ({
    pendingOrders: mockPendingOrders,
    isSyncing: mockIsSyncing,
    staleJobIds: new Set<string>(),
    refetch: mockRefetch,
  }),
}));

vi.mock("../services/orders.service", () => ({
  orderService: {
    updatePendingOrderStatus: vi.fn(),
    deletePendingOrder: vi.fn(),
  },
}));

const mockSavePendingOrder = vi.fn().mockResolvedValue({ id: "test", action: "updated", serverUpdatedAt: Date.now() });
const mockDeletePendingOrder = vi.fn().mockResolvedValue(undefined);
vi.mock("../api/pending-orders", () => ({
  savePendingOrder: (...args: any[]) => mockSavePendingOrder(...args),
  deletePendingOrder: (...args: any[]) => mockDeletePendingOrder(...args),
  getPendingOrders: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/toast.service", () => ({
  toastService: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../services/pdf-export.service", () => ({
  pdfExportService: {
    downloadOrderPDF: vi.fn(),
    printOrderPDF: vi.fn(),
    getOrderPDFBlob: vi.fn(),
    getOrderPDFFileName: vi.fn(),
  },
}));

vi.mock("../services/share.service", () => ({
  shareService: {
    shareViaWhatsApp: vi.fn(),
    sendEmail: vi.fn(),
    uploadToDropbox: vi.fn(),
  },
}));

vi.mock("../services/fresis-discount.service", () => ({
  fresisDiscountService: { getAllDiscounts: vi.fn().mockResolvedValue([]) },
}));

vi.mock("../services/fresis-history.service", () => ({
  fresisHistoryService: { archiveOrders: vi.fn() },
}));

vi.mock("../services/warehouse-order-integration", () => ({
  transferWarehouseReservations: vi.fn(),
}));

vi.mock("../utils/order-calculations", () => ({
  calculateShippingCosts: vi.fn().mockReturnValue({ cost: 0, tax: 0 }),
}));

vi.mock("../utils/fresis-constants", () => ({
  isFresis: vi.fn().mockReturnValue(false),
}));

vi.mock("../utils/order-merge", () => ({
  mergeFresisPendingOrders: vi.fn(),
}));

vi.mock("../components/EmailShareDialog", () => ({
  EmailShareDialog: () => null,
}));

vi.mock("../components/JobProgressBar", () => ({
  JobProgressBar: () => null,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const testOrders: PendingOrder[] = [
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
    mockPendingOrders = [];
    mockIsSyncing = false;
  });

  test("renders empty state when no pending orders", () => {
    mockPendingOrders = [];

    render(<PendingOrdersPage />);

    expect(
      screen.getByText(/Nessun ordine in attesa/i),
    ).toBeInTheDocument();
  });

  test("displays list of pending orders with customer names", () => {
    mockPendingOrders = testOrders;

    render(<PendingOrdersPage />);

    expect(screen.getByText("Cliente 1")).toBeInTheDocument();
    expect(screen.getByText("Cliente 2")).toBeInTheDocument();
    expect(screen.getByText("Cliente 3")).toBeInTheDocument();
    expect(
      screen.getByText(/Ordini in Attesa \(3\)/i),
    ).toBeInTheDocument();
  });

  test("shows order items after expanding detail section", () => {
    mockPendingOrders = [testOrders[0]];

    render(<PendingOrdersPage />);

    // Items are collapsed by default — expand by clicking the header
    const expandButton = screen.getByText(/Dettaglio Articoli/i);
    fireEvent.click(expandButton);

    expect(screen.getByText("Prodotto 1")).toBeInTheDocument();
  });

  test("shows status badges correctly", () => {
    mockPendingOrders = testOrders;

    render(<PendingOrdersPage />);

    const pendingBadges = screen.getAllByText("In Attesa");
    expect(pendingBadges).toHaveLength(2);
    expect(screen.getByText("Errore")).toBeInTheDocument();
  });

  test("shows error message for failed orders", () => {
    mockPendingOrders = [testOrders[2]];

    render(<PendingOrdersPage />);

    expect(
      screen.getByText(/Network timeout/i),
    ).toBeInTheDocument();
  });

  test("checkbox for each order allows selection", () => {
    mockPendingOrders = testOrders;

    render(<PendingOrdersPage />);

    const checkboxes = screen.getAllByRole("checkbox");
    // 1 "Seleziona Tutti" + 3 order checkboxes
    expect(checkboxes).toHaveLength(4);

    const orderCheckboxes = checkboxes.slice(1);
    fireEvent.click(orderCheckboxes[0]);

    expect(
      screen.getByText(/Invia Ordini Selezionati \(1\)/i),
    ).toBeInTheDocument();
  });

  test('"Select All" checkbox selects all orders', () => {
    mockPendingOrders = testOrders;

    render(<PendingOrdersPage />);

    const selectAllCheckbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(selectAllCheckbox);

    expect(
      screen.getByText(/Invia Ordini Selezionati \(3\)/i),
    ).toBeInTheDocument();
  });

  test('"Invia Ordini Selezionati" button disabled when no selection', () => {
    mockPendingOrders = testOrders;

    render(<PendingOrdersPage />);

    const submitButton = screen.getByRole("button", {
      name: /Invia Ordini Selezionati/i,
    });
    expect(submitButton).toBeDisabled();
  });

  test("submits selected orders to bot API", async () => {
    mockPendingOrders = testOrders;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jobIds: ["job-123", "job-456"] }),
    } as Response);
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("test-jwt-token");

    render(<PendingOrdersPage />);

    const orderCheckboxes = screen.getAllByRole("checkbox").slice(1);
    fireEvent.click(orderCheckboxes[0]);
    fireEvent.click(orderCheckboxes[1]);

    const submitButton = screen.getByRole("button", {
      name: /Invia Ordini Selezionati \(2\)/i,
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/bot/submit-orders",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    await waitFor(() => {
      expect(mockSavePendingOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "order-uuid-001",
          status: "syncing",
        }),
      );
      expect(mockSavePendingOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "order-uuid-002",
          status: "syncing",
        }),
      );
    });
  });
});

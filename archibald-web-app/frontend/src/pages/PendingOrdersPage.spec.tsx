// @ts-nocheck
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PendingOrdersPage } from "./PendingOrdersPage";
import type { PendingOrder } from "../types/pending-order";
import { isFresis } from "../utils/fresis-constants";
import { getFresisDiscounts } from "../api/fresis-discounts";
import { archiveOrders } from "../api/fresis-history";

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// Mock usePendingSync hook — module-level vars so tests can set data before render
let mockPendingOrders: PendingOrder[] = [];
let mockIsSyncing = false;
const mockRefetch = vi.fn();
vi.mock('../hooks/useVatValidation', () => ({
  useVatValidation: () => ({
    validate: vi.fn().mockResolvedValue(undefined),
    status: 'idle' as const,
    errorMessage: null,
    reset: vi.fn(),
  }),
}));

vi.mock("../hooks/usePendingSync", () => ({
  usePendingSync: () => ({
    pendingOrders: mockPendingOrders,
    isSyncing: mockIsSyncing,
    staleJobIds: new Set<string>(),
    refetch: mockRefetch,
    trackJobs: vi.fn(),
    jobTracking: new Map(),
  }),
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

vi.mock("../api/fresis-discounts", () => ({
  getFresisDiscounts: vi.fn().mockResolvedValue([]),
}));

vi.mock("../api/fresis-history", () => ({
  archiveOrders: vi.fn().mockResolvedValue([]),
  reassignMergedOrderId: vi.fn().mockResolvedValue(0),
}));

vi.mock("../api/warehouse", () => ({
  batchTransfer: vi.fn().mockResolvedValue({ transferred: 0 }),
}));

vi.mock("../api/customers", () => ({
  getCustomers: vi.fn().mockResolvedValue([]),
}));

vi.mock("../utils/format-currency", () => ({
  formatCurrency: vi.fn((v: number) => `${v.toFixed(2)}`),
}));

vi.mock("../utils/order-calculations", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    calculateShippingCosts: vi.fn().mockReturnValue({ cost: 0, tax: 0 }),
  };
});

vi.mock("../utils/fresis-constants", () => ({
  isFresis: vi.fn().mockReturnValue(false),
}));

vi.mock("../utils/order-merge", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    mergeFresisPendingOrders: vi.fn(),
  };
});

vi.mock("../components/EmailShareDialog", () => ({
  EmailShareDialog: () => null,
}));

vi.mock("../components/JobProgressBar", () => ({
  JobProgressBar: () => null,
}));

vi.mock("../contexts/OperationTrackingContext", () => ({
  useOperationTracking: () => ({
    activeOperations: [],
    trackOperation: vi.fn(),
    dismissOperation: vi.fn(),
  }),
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
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { customers: [] } }),
    });
  });

  afterEach(async () => {
    // Drain async state updates (getCustomers, getFresisDiscounts) to avoid act() warnings.
    await act(async () => {});
  });

  test("renders empty state when no pending orders", async () => {
    mockPendingOrders = [];

    render(<PendingOrdersPage />);
    await act(async () => {});

    expect(
      screen.getByText(/Nessun ordine in attesa/i),
    ).toBeInTheDocument();
  });

  test("displays list of pending orders with customer names", async () => {
    mockPendingOrders = testOrders;

    render(<PendingOrdersPage />);
    await act(async () => {});

    expect(screen.getByText("Cliente 1")).toBeInTheDocument();
    expect(screen.getByText("Cliente 2")).toBeInTheDocument();
    expect(screen.getByText("Cliente 3")).toBeInTheDocument();
    expect(
      screen.getByText(/Ordini in Attesa \(3\)/i),
    ).toBeInTheDocument();
  });

  test("shows order items after expanding detail section", async () => {
    mockPendingOrders = [testOrders[0]];

    render(<PendingOrdersPage />);
    await act(async () => {});

    // Items are collapsed by default — expand by clicking the header
    const expandButton = screen.getByText(/Dettaglio Articoli/i);
    fireEvent.click(expandButton);

    expect(screen.getByText("Prodotto 1")).toBeInTheDocument();
  });

  test("shows status badges correctly", async () => {
    mockPendingOrders = testOrders;

    render(<PendingOrdersPage />);
    await act(async () => {});

    const pendingBadges = screen.getAllByText("In Attesa");
    expect(pendingBadges).toHaveLength(2);
    expect(screen.getByText("Errore")).toBeInTheDocument();
  });

  test("shows error message for failed orders", async () => {
    mockPendingOrders = [testOrders[2]];

    render(<PendingOrdersPage />);
    await act(async () => {});

    const errorMessages = screen.getAllByText(/Network timeout/i);
    expect(errorMessages.length).toBeGreaterThanOrEqual(1);
  });

  test("checkbox for each order allows selection", async () => {
    mockPendingOrders = testOrders;

    render(<PendingOrdersPage />);
    await act(async () => {});

    const checkboxes = screen.getAllByRole("checkbox");
    // 1 "Seleziona Tutti" + 3 order checkboxes
    expect(checkboxes).toHaveLength(4);

    const orderCheckboxes = checkboxes.slice(1);
    fireEvent.click(orderCheckboxes[0]);

    expect(screen.getByRole("button", { name: /^Invia \(1\)$/i })).toBeInTheDocument();
  });

  test('"Select All" checkbox selects all orders', async () => {
    mockPendingOrders = testOrders;

    render(<PendingOrdersPage />);
    await act(async () => {});

    const selectAllCheckbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(selectAllCheckbox);

    expect(screen.getByRole("button", { name: /^Invia \(3\)$/i })).toBeInTheDocument();
  });

  test('submit button not rendered when no orders selected', async () => {
    mockPendingOrders = testOrders;

    render(<PendingOrdersPage />);
    await act(async () => {});

    expect(screen.queryByRole("button", { name: /^Invia \(/i })).toBeNull();
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

    const submitButton = screen.getByRole("button", { name: /^Invia \(2\)$/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/operations/enqueue",
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

  test("passes deliveryAddressId in bulk submit enqueueOperation payload", async () => {
    const deliveryAddressId = 42;
    const orderWithAddress: PendingOrder = {
      ...testOrders[0],
      id: "order-uuid-addr-001",
      deliveryAddressId,
    };
    mockPendingOrders = [orderWithAddress];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: "job-addr-001" }),
    } as Response);
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("test-jwt-token");

    render(<PendingOrdersPage />);

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    const submitButton = screen.getByRole("button", { name: /^Invia \(1\)$/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      const enqueueCalls = mockFetch.mock.calls.filter(
        (call: unknown[]) => call[0] === "/api/operations/enqueue",
      );
      expect(enqueueCalls).toHaveLength(1);
      const body = JSON.parse(enqueueCalls[0][1].body);
      expect(body.data.deliveryAddressId).toBe(deliveryAddressId);
    });
  });

  test("passes deliveryAddressId in retry enqueueOperation payload", async () => {
    const deliveryAddressId = 99;
    const errorOrderWithAddress: PendingOrder = {
      ...testOrders[2],
      id: "order-uuid-addr-retry",
      deliveryAddressId,
    };
    mockPendingOrders = [errorOrderWithAddress];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: "job-retry-addr-001" }),
    } as Response);
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("test-jwt-token");

    render(<PendingOrdersPage />);

    const retryButton = screen.getByText(/Riprova Ordine/i);
    fireEvent.click(retryButton);

    await waitFor(() => {
      const enqueueCalls = mockFetch.mock.calls.filter(
        (call: unknown[]) => call[0] === "/api/operations/enqueue",
      );
      expect(enqueueCalls).toHaveLength(1);
      const body = JSON.parse(enqueueCalls[0][1].body);
      expect(body.data.deliveryAddressId).toBe(deliveryAddressId);
    });
  });

  test("applies Fresis dealer discounts when submitting a sub-client order", async () => {
    const fresisOrder: PendingOrder = {
      id: "fresis-order-001",
      customerId: "55.261",
      customerName: "Fresis Soc Cooperativa",
      subClientCodice: "12345",
      subClientName: "Bar Roma",
      items: [
        {
          articleCode: "ART100",
          articleId: "V100",
          productName: "Prodotto Test",
          quantity: 10,
          price: 8,
          vat: 22,
          discount: 15,
          originalListPrice: 10,
        },
      ],
      discountPercent: 5,
      targetTotalWithVAT: 100,
      createdAt: "2026-03-05T10:00:00Z",
      updatedAt: "2026-03-05T10:00:00Z",
      status: "pending",
      retryCount: 0,
      deviceId: "test-device-001",
      needsSync: false,
    };

    mockPendingOrders = [fresisOrder];
    vi.mocked(isFresis).mockImplementation((c) => c?.id === "55.261");
    vi.mocked(getFresisDiscounts).mockResolvedValue([
      { id: "V100", articleCode: "ART100", discountPercent: 45, kpPriceUnit: 0 },
    ]);
    vi.mocked(archiveOrders).mockResolvedValue([]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: "job-fresis-001" }),
    } as Response);
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("test-jwt-token");

    render(<PendingOrdersPage />);

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    const submitButton = screen.getByRole("button", { name: /^Invia \(1\)$/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(archiveOrders).toHaveBeenCalledWith([fresisOrder]);
    });

    await waitFor(() => {
      const fetchCalls = mockFetch.mock.calls;
      const enqueueCalls = fetchCalls.filter(
        (call: unknown[]) => call[0] === "/api/operations/enqueue",
      );
      expect(enqueueCalls).toHaveLength(1);

      const body = JSON.parse(enqueueCalls[0][1].body);
      expect(body.data.items[0].price).toBe(10);
      expect(body.data.items[0].discount).toBe(45);
      expect(body.data.discountPercent).toBeUndefined();
      expect(body.data.targetTotalWithVAT).toBeUndefined();
    });
  });

  test("renders delivery address when deliveryAddressResolved is set", async () => {
    const via = "Via Francesco Petrarca 10";
    const citta = "Napoli";
    const tipo = "ALT";
    const orderWithAddress: PendingOrder = {
      ...testOrders[0],
      id: "order-uuid-addr-render-001",
      deliveryAddressResolved: {
        via,
        cap: "80125",
        citta,
        tipo,
        nome: "Sede secondaria",
      },
    };
    mockPendingOrders = [orderWithAddress];

    render(<PendingOrdersPage />);
    await act(async () => {});

    expect(screen.getByText(/📍\s+Via Francesco Petrarca 10\s*—\s*Napoli\s*\(ALT\)/)).toBeInTheDocument();
  });

  test("does not render address line when deliveryAddressResolved is null", async () => {
    const orderWithNullAddress: PendingOrder = {
      ...testOrders[0],
      id: "order-uuid-addr-render-002",
      deliveryAddressResolved: null,
    };
    mockPendingOrders = [orderWithNullAddress];

    render(<PendingOrdersPage />);
    await act(async () => {});

    expect(screen.queryByText(/📍/)).not.toBeInTheDocument();
  });
});

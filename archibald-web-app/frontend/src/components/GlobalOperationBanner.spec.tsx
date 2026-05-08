import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { GlobalOperationBanner } from "./GlobalOperationBanner";
import type { TrackedOperation, OperationTrackingValue } from "../contexts/OperationTrackingContext";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

let mockContextValue: OperationTrackingValue;

vi.mock("../contexts/OperationTrackingContext", () => ({
  useOperationTracking: () => mockContextValue,
}));

vi.mock("../contexts/DownloadQueueContext", () => ({
  useDownloadQueue: () => ({ pendingCount: 0 }),
}));

vi.mock("./QueueDrawer", () => ({
  QueueDrawer: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="queue-drawer" /> : null,
}));

function makeOperation(overrides: Partial<TrackedOperation> = {}): TrackedOperation {
  return {
    orderId: "order-1",
    jobId: "job-1",
    customerName: "Mario Rossi",
    status: "active",
    progress: 50,
    label: "Inserimento righe",
    startedAt: Date.now(),
    isBackground: false,
    ...overrides,
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("GlobalOperationBanner", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockContextValue = {
      activeOperations: [],
      userOperations: [],
      backgroundOperations: [],
      trackOperation: vi.fn(),
      dismissOperation: vi.fn(),
      cancelOperation: vi.fn(),
    };
  });

  test("returns null when no operations", () => {
    const { container } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
    expect(container.innerHTML).toBe("");
  });

  test("shows customer name and label for single active operation", () => {
    mockContextValue.userOperations = [makeOperation()];

    const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
    const banner = getByTestId("global-operation-banner");

    expect(banner.textContent).toContain("Mario Rossi");
    expect(banner.textContent).toContain("Inserimento righe");
    expect(getByTestId("banner-spinner")).toBeTruthy();
  });

  test("shows green background with checkmark for completed operation", () => {
    mockContextValue.userOperations = [
      makeOperation({ status: "completed", progress: 100, label: "Ordine completato" }),
    ];

    const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
    const banner = getByTestId("global-operation-banner");

    expect(banner.textContent).toContain("Mario Rossi");
    expect(banner.textContent).toContain("Ordine completato");
    expect(banner.style.background).toMatch(/d1fae5|rgb\(209,\s*250,\s*229\)/);
    expect(banner.style.color).toMatch(/#065f46|rgb\(6,\s*95,\s*70\)/);
  });

  test("shows red background with error for failed operation", () => {
    mockContextValue.userOperations = [
      makeOperation({ status: "failed", error: "Login scaduto" }),
    ];

    const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
    const banner = getByTestId("global-operation-banner");

    expect(banner.textContent).toContain("Errore: Login scaduto");
    expect(banner.style.background).toMatch(/#fee2e2|rgb\(254,\s*226,\s*226\)/);
    expect(banner.style.color).toMatch(/#991b1b|rgb\(153,\s*27,\s*27\)/);
  });

  test("close button on failed operation calls dismissOperation", () => {
    mockContextValue.userOperations = [
      makeOperation({ status: "failed", error: "Login scaduto" }),
    ];

    const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
    const closeBtn = getByTestId("banner-close-btn");

    fireEvent.click(closeBtn);

    expect(mockContextValue.dismissOperation).toHaveBeenCalledWith("job-1");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("shows primary active op when mixed operations", () => {
    mockContextValue.userOperations = [
      makeOperation({ orderId: "o-1", jobId: "j-1", status: "active", progress: 40, label: "Elaborazione", customerName: "Mario Rossi" }),
      makeOperation({ orderId: "o-2", jobId: "j-2", status: "completed", progress: 100 }),
      makeOperation({ orderId: "o-3", jobId: "j-3", status: "queued", progress: 0 }),
    ];

    const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
    const banner = getByTestId("global-operation-banner");

    expect(banner.textContent).toContain("Mario Rossi");
    expect(banner.textContent).toContain("Elaborazione");
    expect(banner.textContent).toContain("+1 in coda");
  });

  test("shows active op as primary with queue badge when active+queued mix", () => {
    mockContextValue.userOperations = [
      makeOperation({ orderId: "o-1", jobId: "j-1", status: "active", progress: 45, label: "Inserimento righe", customerName: "Mario Rossi" }),
      makeOperation({ orderId: "o-2", jobId: "j-2", status: "queued", progress: 0, label: "In coda...", customerName: "Luigi Bianchi" }),
      makeOperation({ orderId: "o-3", jobId: "j-3", status: "queued", progress: 0, label: "In coda...", customerName: "Anna Verdi" }),
    ];

    const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
    const banner = getByTestId("global-operation-banner");

    expect(banner.textContent).toContain("Mario Rossi");
    expect(banner.textContent).toContain("Inserimento righe");
    expect(banner.textContent).toContain("+2 in coda");
    expect(getByTestId("banner-spinner")).toBeInTheDocument();
    expect(banner.textContent).not.toContain("ordini in elaborazione");
  });

  test("shows first queued op as primary when all ops are queued", () => {
    mockContextValue.userOperations = [
      makeOperation({ orderId: "o-1", jobId: "j-1", status: "queued", progress: 0, label: "In coda...", customerName: "Mario Rossi" }),
      makeOperation({ orderId: "o-2", jobId: "j-2", status: "queued", progress: 0, label: "In coda...", customerName: "Luigi Bianchi" }),
    ];

    const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
    const banner = getByTestId("global-operation-banner");

    expect(banner.textContent).toContain("Mario Rossi");
    expect(banner.textContent).toContain("+1 in coda");
    expect(banner.textContent).not.toContain("ordini in elaborazione");
  });

  test("shows primary active op without queue badge when no queued ops in multi-op", () => {
    mockContextValue.userOperations = [
      makeOperation({ orderId: "o-1", jobId: "j-1", status: "active", progress: 60, label: "Salvataggio" }),
      makeOperation({ orderId: "o-2", jobId: "j-2", status: "completed", progress: 100, label: "Completato" }),
    ];

    const { getByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
    const banner = getByTestId("global-operation-banner");

    expect(banner.textContent).toContain("Salvataggio");
    expect(banner.textContent).not.toContain("in coda");
  });

  test("clicking banner opens the QueueDrawer", () => {
    mockContextValue.userOperations = [makeOperation()];

    const { getByTestId, queryByTestId } = render(<GlobalOperationBanner />, { wrapper: Wrapper });
    expect(queryByTestId("queue-drawer")).toBeNull();

    fireEvent.click(getByTestId("global-operation-banner"));

    expect(getByTestId("queue-drawer")).toBeTruthy();
  });
});

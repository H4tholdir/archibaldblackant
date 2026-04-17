import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  OperationTrackingProvider,
  useOperationTracking,
} from "./OperationTrackingContext";

type WsCallback = (payload: unknown) => void;

let wsSubscriptions: Map<string, Set<WsCallback>>;

function mockSubscribe(eventType: string, callback: WsCallback): () => void {
  if (!wsSubscriptions.has(eventType)) {
    wsSubscriptions.set(eventType, new Set());
  }
  wsSubscriptions.get(eventType)!.add(callback);
  return () => {
    wsSubscriptions.get(eventType)?.delete(callback);
  };
}

function emitWsEvent(eventType: string, payload: unknown) {
  const handlers = wsSubscriptions.get(eventType);
  if (handlers) {
    handlers.forEach((h) => h(payload));
  }
}

vi.mock("./WebSocketContext", () => ({
  useWebSocketContext: () => ({
    state: "connected" as const,
    send: vi.fn(),
    subscribe: mockSubscribe,
    unsubscribe: vi.fn(),
  }),
}));

vi.mock("../api/pending-orders", () => ({
  getPendingOrders: vi.fn().mockResolvedValue([]),
}));

vi.mock("../api/operations", () => ({
  getJobStatus: vi.fn().mockResolvedValue({
    success: true,
    job: {
      jobId: "job-1",
      type: "submit-order",
      userId: "user-1",
      state: "active",
      progress: 50,
      result: null,
      failedReason: undefined,
    },
  }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  return <OperationTrackingProvider>{children}</OperationTrackingProvider>;
}

describe("OperationTrackingContext", () => {
  beforeEach(() => {
    wsSubscriptions = new Map();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("trackOperation adds entry with queued status", async () => {
    const { result } = renderHook(() => useOperationTracking(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.trackOperation("order-1", "job-1", "Mario Rossi");
    });

    expect(result.current.activeOperations).toEqual([
      expect.objectContaining({
        orderId: "order-1",
        jobId: "job-1",
        customerName: "Mario Rossi",
        status: "queued",
        progress: 0,
      }),
    ]);
  });

  test("trackOperation uses initialLabel when provided", async () => {
    const { result } = renderHook(() => useOperationTracking(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.trackOperation("order-1", "job-1", "Mario Rossi", "Eliminazione ordine...");
    });

    expect(result.current.activeOperations).toEqual([
      expect.objectContaining({
        orderId: "order-1",
        jobId: "job-1",
        customerName: "Mario Rossi",
        status: "queued",
        progress: 0,
        label: "Eliminazione ordine...",
      }),
    ]);
  });

  test("trackOperation defaults label to 'In coda...' without initialLabel", async () => {
    const { result } = renderHook(() => useOperationTracking(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.trackOperation("order-1", "job-1", "Mario Rossi");
    });

    expect(result.current.activeOperations).toEqual([
      expect.objectContaining({
        label: "In coda...",
      }),
    ]);
  });

  test("JOB_STARTED event updates status to active", async () => {
    const { result } = renderHook(() => useOperationTracking(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.trackOperation("order-1", "job-1", "Mario Rossi");
    });

    act(() => {
      emitWsEvent("JOB_STARTED", { jobId: "job-1" });
    });

    expect(result.current.activeOperations[0].status).toBe("active");
  });

  test("JOB_PROGRESS event updates progress and label", async () => {
    const { result } = renderHook(() => useOperationTracking(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.trackOperation("order-1", "job-1", "Mario Rossi");
    });

    act(() => {
      emitWsEvent("JOB_PROGRESS", {
        jobId: "job-1",
        progress: 60,
        label: "Inserimento righe",
      });
    });

    expect(result.current.activeOperations[0]).toEqual(
      expect.objectContaining({
        status: "active",
        progress: 60,
        label: "Inserimento righe",
      }),
    );
  });

  test("JOB_COMPLETED event sets completed status and schedules auto-dismiss", async () => {
    const { result } = renderHook(() => useOperationTracking(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.trackOperation("order-1", "job-1", "Mario Rossi");
    });

    act(() => {
      emitWsEvent("JOB_COMPLETED", { jobId: "job-1", result: {} });
    });

    expect(result.current.activeOperations[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        progress: 100,
        label: "Ordine completato",
      }),
    );

    // After 10s the operation should be auto-dismissed
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(result.current.activeOperations).toEqual([]);
  });

  test("JOB_FAILED event sets failed status with error", async () => {
    const { result } = renderHook(() => useOperationTracking(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.trackOperation("order-1", "job-1", "Mario Rossi");
    });

    act(() => {
      emitWsEvent("JOB_FAILED", {
        jobId: "job-1",
        error: "Login scaduto",
      });
    });

    expect(result.current.activeOperations[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        error: "Login scaduto",
      }),
    );

    // Failed operations should NOT auto-dismiss even after 10s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(result.current.activeOperations).toHaveLength(1);
  });

  test("dismissOperation removes entry immediately", async () => {
    const { result } = renderHook(() => useOperationTracking(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.trackOperation("order-1", "job-1", "Mario Rossi");
    });

    act(() => {
      result.current.dismissOperation("order-1");
    });

    expect(result.current.activeOperations).toEqual([]);
  });

  describe("recovery on mount", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test("recovers processing orders on mount", async () => {
      vi.useRealTimers();

      const { getPendingOrders } = await import("../api/pending-orders");
      const { getJobStatus } = await import("../api/operations");

      (getPendingOrders as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "order-99",
          customerId: "cust-1",
          customerName: "Luigi Verdi",
          items: [],
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          status: "syncing",
          retryCount: 0,
          deviceId: "dev-1",
          needsSync: false,
          jobId: "job-99",
          jobStatus: "processing",
          jobStartedAt: "2026-01-01T00:00:00Z",
        },
      ]);

      (getJobStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        job: {
          jobId: "job-99",
          type: "submit-order",
          userId: "user-1",
          state: "active",
          progress: 30,
          result: null,
          failedReason: undefined,
        },
      });

      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await waitFor(() => {
        expect(result.current.activeOperations).toEqual([
          expect.objectContaining({
            orderId: "order-99",
            jobId: "job-99",
            customerName: "Luigi Verdi",
            status: "active",
            progress: 30,
          }),
        ]);
      });
      expect(getJobStatus).toHaveBeenCalledWith("job-99");

      vi.useFakeTimers();
    });

    test("recovers queued orders on mount", async () => {
      vi.useRealTimers();

      const { getPendingOrders } = await import("../api/pending-orders");
      const { getJobStatus } = await import("../api/operations");

      (getPendingOrders as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "order-q1",
          customerId: "cust-2",
          customerName: "Anna Bianchi",
          items: [],
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          status: "syncing",
          retryCount: 0,
          deviceId: "dev-1",
          needsSync: false,
          jobId: "job-q1",
          jobStatus: "queued",
          jobStartedAt: null,
        },
      ]);

      (getJobStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        job: {
          jobId: "job-q1",
          type: "submit-order",
          userId: "user-1",
          state: "waiting",
          progress: 0,
          result: null,
          failedReason: undefined,
        },
      });

      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await waitFor(() => {
        expect(result.current.activeOperations).toEqual([
          expect.objectContaining({
            orderId: "order-q1",
            jobId: "job-q1",
            customerName: "Anna Bianchi",
            status: "queued",
            progress: 0,
          }),
        ]);
      });
      expect(getJobStatus).toHaveBeenCalledWith("job-q1");

      vi.useFakeTimers();
    });

    test("recovers started orders on mount", async () => {
      vi.useRealTimers();

      const { getPendingOrders } = await import("../api/pending-orders");
      const { getJobStatus } = await import("../api/operations");

      (getPendingOrders as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "order-s1",
          customerId: "cust-3",
          customerName: "Carlo Neri",
          items: [],
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          status: "syncing",
          retryCount: 0,
          deviceId: "dev-1",
          needsSync: false,
          jobId: "job-s1",
          jobStatus: "started",
          jobStartedAt: "2026-01-01T00:01:00Z",
        },
      ]);

      (getJobStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        job: {
          jobId: "job-s1",
          type: "submit-order",
          userId: "user-1",
          state: "active",
          progress: 10,
          result: null,
          failedReason: undefined,
        },
      });

      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await waitFor(() => {
        expect(result.current.activeOperations).toEqual([
          expect.objectContaining({
            orderId: "order-s1",
            jobId: "job-s1",
            customerName: "Carlo Neri",
            status: "active",
            progress: 10,
          }),
        ]);
      });
      expect(getJobStatus).toHaveBeenCalledWith("job-s1");

      vi.useFakeTimers();
    });

    test("ignores idle orders and does not call getJobStatus for completed/failed", async () => {
      vi.useRealTimers();

      const { getPendingOrders } = await import("../api/pending-orders");
      const { getJobStatus } = await import("../api/operations");

      (getPendingOrders as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "order-idle",
          customerId: "cust-4",
          customerName: "Davide Russo",
          items: [],
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          status: "pending",
          retryCount: 0,
          deviceId: "dev-1",
          needsSync: false,
          jobId: undefined,
          jobStatus: "idle",
          jobStartedAt: null,
        },
        {
          id: "order-done",
          customerId: "cust-5",
          customerName: "Elena Greco",
          items: [],
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          status: "completed",
          retryCount: 0,
          deviceId: "dev-1",
          needsSync: false,
          jobId: "job-done",
          jobStatus: "completed",
          jobStartedAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "order-fail",
          customerId: "cust-6",
          customerName: "Fabio Serra",
          items: [],
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          status: "failed",
          retryCount: 2,
          deviceId: "dev-1",
          needsSync: false,
          jobId: "job-fail",
          jobStatus: "failed",
          jobStartedAt: "2026-01-01T00:00:00Z",
        },
      ]);

      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      // Wait a tick to allow the async recover() to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(result.current.activeOperations).toEqual([]);
      expect(getJobStatus).not.toHaveBeenCalled();

      vi.useFakeTimers();
    });
  });

  test("WS events for unknown jobId are ignored", async () => {
    const { result } = renderHook(() => useOperationTracking(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.trackOperation("order-1", "job-1", "Mario Rossi");
    });

    act(() => {
      emitWsEvent("JOB_PROGRESS", {
        jobId: "unknown-job",
        progress: 99,
        label: "Something",
      });
    });

    expect(result.current.activeOperations[0]).toEqual(
      expect.objectContaining({
        jobId: "job-1",
        progress: 0,
      }),
    );
  });

  test("useOperationTracking throws when used outside provider", () => {
    expect(() => {
      renderHook(() => useOperationTracking());
    }).toThrow("useOperationTracking must be used within OperationTrackingProvider");
  });

  describe("reconnect reconciliation", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test("aggiorna op queued→completed quando WS si riconnette e job è completed", async () => {
      vi.useRealTimers();

      const { getJobStatus } = await import("../api/operations");

      (getJobStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        job: {
          jobId: "job-active",
          type: "submit-order",
          userId: "u1",
          state: "completed",
          progress: 100,
          result: null,
          failedReason: undefined,
        },
      });

      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      // Wait for mount recovery to finish (no pending orders)
      await new Promise((r) => setTimeout(r, 50));

      act(() => {
        result.current.trackOperation("order-1", "job-active", "Mario Rossi", "In corso...", "Completato");
      });

      await waitFor(() =>
        expect(result.current.activeOperations.find((o) => o.orderId === "order-1")?.status).toBe("queued"),
      );

      // Simula reconnect WS
      act(() => {
        emitWsEvent("WS_RECONNECTED", {});
      });

      await waitFor(() =>
        expect(result.current.activeOperations.find((o) => o.orderId === "order-1")?.status).toBe("completed"),
      );

      expect(getJobStatus).toHaveBeenCalledWith("job-active");

      vi.useFakeTimers();
    });

    test("aggiorna op queued→failed quando WS si riconnette e job è failed", async () => {
      vi.useRealTimers();

      const { getJobStatus } = await import("../api/operations");

      (getJobStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        job: {
          jobId: "job-q",
          type: "submit-order",
          userId: "u1",
          state: "failed",
          progress: 0,
          result: null,
          failedReason: "Login scaduto",
        },
      });

      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await new Promise((r) => setTimeout(r, 50));

      act(() => {
        result.current.trackOperation("order-2", "job-q", "Luigi Verdi", "In coda...", "Completato");
      });

      await waitFor(() =>
        expect(result.current.activeOperations.find((o) => o.orderId === "order-2")?.status).toBe("queued"),
      );

      act(() => {
        emitWsEvent("WS_RECONNECTED", {});
      });

      await waitFor(() =>
        expect(result.current.activeOperations.find((o) => o.orderId === "order-2")?.status).toBe("failed"),
      );

      expect(result.current.activeOperations.find((o) => o.orderId === "order-2")?.error).toBe("Login scaduto");

      vi.useFakeTimers();
    });

    test("non chiama getJobStatus per op già completed o failed al reconnect", async () => {
      vi.useRealTimers();

      const { getJobStatus } = await import("../api/operations");

      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await new Promise((r) => setTimeout(r, 50));

      act(() => {
        result.current.trackOperation("order-3", "job-done", "Anna Bianchi", "In corso...", "Completato");
      });

      // Manually set to completed via WS event
      act(() => {
        emitWsEvent("JOB_COMPLETED", { jobId: "job-done" });
      });

      await waitFor(() =>
        expect(result.current.activeOperations.find((o) => o.orderId === "order-3")?.status).toBe("completed"),
      );

      const callsBeforeReconnect = (getJobStatus as ReturnType<typeof vi.fn>).mock.calls.length;

      act(() => {
        emitWsEvent("WS_RECONNECTED", {});
      });

      // Allow any async calls to settle
      await new Promise((r) => setTimeout(r, 50));

      expect((getJobStatus as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBeforeReconnect);

      vi.useFakeTimers();
    });
  });
});

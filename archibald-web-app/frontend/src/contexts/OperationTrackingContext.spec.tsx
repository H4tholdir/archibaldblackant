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

  test("recovery fetches processing pending orders on mount", async () => {
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

    vi.useFakeTimers();
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
});

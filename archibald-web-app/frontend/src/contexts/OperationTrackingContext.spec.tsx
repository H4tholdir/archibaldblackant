import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  OperationTrackingProvider,
  useOperationTracking,
  BACKGROUND_OP_TYPES,
  ERP_WRITE_TYPES,
  isBackgroundOperation,
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

vi.mock("../api/operations", async (importActual) => {
  const actual = await importActual<typeof import("../api/operations")>();
  return {
    ...actual,
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
    getActiveJobs: vi.fn().mockResolvedValue({ success: true, jobs: [] }),
  };
});

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
      result.current.dismissOperation("job-1");
    });

    expect(result.current.activeOperations).toEqual([]);
  });

  describe("recovery on mount", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test("recupera job attivi al mount tramite getActiveJobs", async () => {
      vi.useRealTimers();

      const { getActiveJobs } = await import("../api/operations");

      (getActiveJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        jobs: [
          {
            jobId: "job-99",
            type: "submit-order",
            userId: "user-1",
            entityId: "order-99",
            entityName: "Luigi Verdi",
            startedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      });

      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      // BullMQ eliminato: nessuna chiamata getJobStatus — progress sempre 0 al recovery,
      // gli eventi WS aggiorneranno il resto.
      await waitFor(() => {
        expect(result.current.activeOperations).toEqual([
          expect.objectContaining({
            orderId: "order-99",
            jobId: "job-99",
            customerName: "Luigi Verdi",
            status: "active",
            progress: 0,
          }),
        ]);
      });

      vi.useFakeTimers();
    });

    test("restituisce operazioni vuote se getActiveJobs risponde con array vuoto", async () => {
      vi.useRealTimers();

      const { getActiveJobs } = await import("../api/operations");
      const { getJobStatus } = await import("../api/operations");

      (getActiveJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        jobs: [],
      });

      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(result.current.activeOperations).toEqual([]);
      expect(getJobStatus).not.toHaveBeenCalled();

      vi.useFakeTimers();
    });
  });

  test("JOB_REQUEUED event aggiorna il jobId tracciato al nuovo job", async () => {
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
      emitWsEvent("JOB_REQUEUED", { originalJobId: "job-1", newJobId: "job-2" });
    });

    expect(result.current.activeOperations).toEqual([
      expect.objectContaining({
        orderId: "order-1",
        jobId: "job-2",
        customerName: "Mario Rossi",
        status: "queued",
        label: "In attesa...",
      }),
    ]);
  });

  test("JOB_REQUEUED → JOB_COMPLETED sul nuovo jobId completa correttamente l'operazione", async () => {
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
      emitWsEvent("JOB_REQUEUED", { originalJobId: "job-1", newJobId: "job-2" });
    });

    act(() => {
      emitWsEvent("JOB_COMPLETED", { jobId: "job-2", result: {} });
    });

    expect(result.current.activeOperations[0]).toEqual(
      expect.objectContaining({
        jobId: "job-2",
        status: "completed",
        progress: 100,
      }),
    );
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

  describe("isBackgroundOperation", () => {
    test("returns false for undefined", () => {
      expect(isBackgroundOperation(undefined)).toBe(false);
    });

    test("returns true for every BACKGROUND_OP_TYPES member", () => {
      for (const type of BACKGROUND_OP_TYPES) {
        expect(isBackgroundOperation(type)).toBe(true);
      }
    });

    test("returns false for non-background operation type", () => {
      expect(isBackgroundOperation("submit-order")).toBe(false);
    });

    test("returns false for unknown type", () => {
      expect(isBackgroundOperation("unknown-op")).toBe(false);
    });
  });

  describe("isBackground classification", () => {
    test("trackOperation con operationType sync-prices produce isBackground true", async () => {
      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.trackOperation("sync-1", "job-sync", "Sistema", "Sync prezzi...", undefined, undefined, "sync-prices");
      });

      expect(result.current.activeOperations[0]).toEqual(
        expect.objectContaining({ isBackground: true }),
      );
    });

    test("trackOperation con operationType submit-order produce isBackground false", async () => {
      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.trackOperation("order-1", "job-1", "Mario Rossi", undefined, undefined, undefined, "submit-order");
      });

      expect(result.current.activeOperations[0]).toEqual(
        expect.objectContaining({ isBackground: false }),
      );
    });

    test("userOperations filtra solo operazioni non-background", async () => {
      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.trackOperation("order-1", "job-user", "Mario Rossi", undefined, undefined, undefined, "submit-order");
        result.current.trackOperation("sync-1", "job-bg", "Sistema", undefined, undefined, undefined, "sync-prices");
      });

      expect(result.current.userOperations).toEqual([
        expect.objectContaining({ jobId: "job-user" }),
      ]);
    });

    test("backgroundOperations filtra solo operazioni background", async () => {
      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.trackOperation("order-1", "job-user", "Mario Rossi", undefined, undefined, undefined, "submit-order");
        result.current.trackOperation("sync-1", "job-bg", "Sistema", undefined, undefined, undefined, "sync-prices");
      });

      expect(result.current.backgroundOperations).toEqual([
        expect.objectContaining({ jobId: "job-bg" }),
      ]);
    });
  });

  describe("reconnect reconciliation", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.useRealTimers();
    });
    afterEach(() => {
      vi.useFakeTimers();
    });

    test("WS_RECONNECTED non chiama getJobStatus e non modifica status delle op in corso", async () => {
      const { getJobStatus } = await import("../api/operations");

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

      const callsBefore = (getJobStatus as ReturnType<typeof vi.fn>).mock.calls.length;

      // BullMQ eliminato: WS_RECONNECTED è no-op, non chiama getJobStatus
      act(() => {
        emitWsEvent("WS_RECONNECTED", {});
      });

      await new Promise((r) => setTimeout(r, 50));

      expect((getJobStatus as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
      // status invariato — gli eventi WS successivi aggiorneranno
      expect(result.current.activeOperations.find((o) => o.orderId === "order-1")?.status).toBe("queued");
    });

    test("WS_RECONNECTED non altera op in stato queued (BullMQ eliminato)", async () => {
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

      await new Promise((r) => setTimeout(r, 50));

      // Status invariato: gli aggiornamenti arrivano tramite JOB_COMPLETED/JOB_FAILED WS
      expect(result.current.activeOperations.find((o) => o.orderId === "order-2")?.status).toBe("queued");
    });

    test("non chiama getJobStatus per op già completed o failed al reconnect", async () => {
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
    });
  });

  describe('priority from JOB_STARTED', () => {
    test('JOB_STARTED con priority memorizza il valore nella TrackedOperation', async () => {
      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.trackOperation('order-1', 'job-1', 'Mario Rossi', undefined, undefined, undefined, 'submit-order');
      });

      act(() => {
        emitWsEvent('JOB_STARTED', { jobId: 'job-1', priority: 10 });
      });

      expect(result.current.activeOperations[0]).toEqual(
        expect.objectContaining({ priority: 10, status: 'active' }),
      );
    });

    test('JOB_STARTED senza priority non aggiunge il campo priority', async () => {
      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.trackOperation('order-1', 'job-1', 'Mario Rossi', undefined, undefined, undefined, 'submit-order');
      });

      act(() => {
        emitWsEvent('JOB_STARTED', { jobId: 'job-1' });
      });

      expect(result.current.activeOperations[0].priority).toBeUndefined();
    });
  });

  describe('hasPressure', () => {
    test('è false quando non ci sono operazioni attive', async () => {
      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.hasPressure).toBe(false);
    });

    test('è true quando un ERP_WRITE_TYPES op è queued', async () => {
      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.trackOperation('order-1', 'job-1', 'Mario Rossi', undefined, undefined, undefined, 'submit-order');
      });

      // status starts as queued — hasPressure must be true immediately
      expect(result.current.hasPressure).toBe(true);
    });

    test('è true quando un ERP_WRITE_TYPES op diventa active', async () => {
      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.trackOperation('order-1', 'job-1', 'Mario Rossi', undefined, undefined, undefined, 'edit-order');
      });

      act(() => {
        emitWsEvent('JOB_STARTED', { jobId: 'job-1' });
      });

      expect(result.current.hasPressure).toBe(true);
    });

    test('è false quando solo operazioni background sono attive', async () => {
      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.trackOperation('sync-1', 'job-bg', 'Sistema', undefined, undefined, undefined, 'sync-prices');
      });

      expect(result.current.hasPressure).toBe(false);
    });

    test('è false quando ERP write op è completed', async () => {
      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.trackOperation('order-1', 'job-1', 'Mario Rossi', undefined, undefined, undefined, 'submit-order');
      });

      act(() => {
        emitWsEvent('JOB_COMPLETED', { jobId: 'job-1', result: {} });
      });

      expect(result.current.hasPressure).toBe(false);
    });

    test('ERP_WRITE_TYPES include tutti i tipi attesi', () => {
      const expectedTypes = [
        'submit-order', 'edit-order', 'delete-order', 'send-to-verona',
        'batch-send-to-verona', 'batch-delete-orders', 'create-customer', 'update-customer',
      ];
      for (const type of expectedTypes) {
        expect(ERP_WRITE_TYPES.has(type)).toBe(true);
      }
    });
  });

  describe('cancelOperation', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
      global.fetch = mockFetch;
    });

    test('rimuove operazione dal context su fetch ok', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: OperationTrackingProvider,
      });

      act(() => {
        result.current.trackOperation('order-1', 'job-abc', 'Bianchi Srl', 'In coda', undefined, '/orders', 'submit-order');
      });

      expect(result.current.userOperations).toHaveLength(1);

      await act(async () => {
        await result.current.cancelOperation('job-abc');
      });

      expect(result.current.userOperations).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalledWith('/api/agent-queue/job-abc/cancel', expect.objectContaining({ method: 'POST' }));
    });

    test('non rimuove operazione se fetch fallisce', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 409 });

      const { result } = renderHook(() => useOperationTracking(), {
        wrapper: OperationTrackingProvider,
      });

      act(() => {
        result.current.trackOperation('order-1', 'job-abc', 'Bianchi Srl', 'In coda', undefined, '/orders', 'submit-order');
      });

      await act(async () => {
        await result.current.cancelOperation('job-abc').catch(() => {});
      });

      expect(result.current.userOperations).toHaveLength(1);
    });
  });
});

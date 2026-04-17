import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useWebSocketContext } from "./WebSocketContext";
import { getPendingOrders } from "../api/pending-orders";
import { getJobStatus } from "../api/operations";

type TrackedOperation = {
  orderId: string;
  jobId: string;
  customerName: string;
  status: "queued" | "active" | "completed" | "failed";
  progress: number;
  label: string;
  completedLabel?: string;
  navigateTo?: string;
  error?: string;
  startedAt: number;
  dismissedAt?: number;
};

type OperationTrackingValue = {
  activeOperations: TrackedOperation[];
  trackOperation: (orderId: string, jobId: string, displayName: string, initialLabel?: string, completedLabel?: string, navigateTo?: string) => void;
  dismissOperation: (orderId: string) => void;
};

const OperationTrackingContext = createContext<OperationTrackingValue | null>(null);

type OperationTrackingProviderProps = {
  children: ReactNode;
};

function OperationTrackingProvider({ children }: OperationTrackingProviderProps) {
  const { subscribe } = useWebSocketContext();
  const [operations, setOperations] = useState<TrackedOperation[]>([]);
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const operationsRef = useRef<TrackedOperation[]>([]);

  const scheduleDismiss = useCallback((orderId: string) => {
    const existing = dismissTimersRef.current.get(orderId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      setOperations((prev) => prev.filter((op) => op.orderId !== orderId));
      dismissTimersRef.current.delete(orderId);
    }, 5_000);

    dismissTimersRef.current.set(orderId, timer);

    setOperations((prev) =>
      prev.map((op) =>
        op.orderId === orderId ? { ...op, dismissedAt: Date.now() + 5_000 } : op,
      ),
    );
  }, []);

  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);

  useEffect(() => {
    let cancelled = false;

    async function recover() {
      try {
        const pendingOrders = await getPendingOrders();
        const inFlight = pendingOrders.filter(
          (o) => o.status === "processing" && o.jobId,
        );

        if (cancelled || inFlight.length === 0) return;

        const recovered: TrackedOperation[] = [];

        for (const order of inFlight) {
          try {
            const { job } = await getJobStatus(order.jobId!);
            if (cancelled) return;

            const status = job.state === "completed"
              ? "completed" as const
              : job.state === "failed"
                ? "failed" as const
                : job.state === "active"
                  ? "active" as const
                  : "queued" as const;

            recovered.push({
              orderId: order.id,
              jobId: order.jobId!,
              customerName: order.customerName,
              status,
              progress: status === "completed" ? 100 : (job.progress ?? 0),
              label: status === "completed"
                ? "Ordine completato"
                : status === "failed"
                  ? "Errore"
                  : "Recupero in corso...",
              error: job.failedReason,
              startedAt: order.jobStartedAt
                ? new Date(order.jobStartedAt).getTime()
                : Date.now(),
            });
          } catch {
            // Skip orders whose job status can't be fetched
          }
        }

        if (!cancelled && recovered.length > 0) {
          setOperations(recovered);
          for (const op of recovered) {
            if (op.status === "completed") {
              scheduleDismiss(op.orderId);
            }
          }
        }
      } catch {
        // Recovery failed silently — user can still track new operations
      }
    }

    recover();

    return () => {
      cancelled = true;
    };
  }, [scheduleDismiss]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      subscribe("JOB_STARTED", (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const jobId = p.jobId as string | undefined;
        if (!jobId) return;

        setOperations((prev) =>
          prev.map((op) =>
            op.jobId === jobId ? { ...op, status: "active" as const } : op,
          ),
        );
      }),
    );

    unsubs.push(
      subscribe("JOB_PROGRESS", (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const jobId = p.jobId as string | undefined;
        if (!jobId) return;

        const progress = (p.progress as number) ?? 0;
        const label = (p.label as string) ?? "";

        setOperations((prev) =>
          prev.map((op) =>
            op.jobId === jobId
              ? { ...op, status: "active" as const, progress, label }
              : op,
          ),
        );
      }),
    );

    unsubs.push(
      subscribe("JOB_COMPLETED", (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const jobId = p.jobId as string | undefined;
        if (!jobId) return;

        setOperations((prev) => {
          const updated = prev.map((op) =>
            op.jobId === jobId
              ? {
                  ...op,
                  status: "completed" as const,
                  progress: 100,
                  label: op.completedLabel ?? "Ordine completato",
                }
              : op,
          );
          return updated;
        });

        // Find orderId for this jobId to schedule dismiss
        setOperations((prev) => {
          const op = prev.find((o) => o.jobId === jobId);
          if (op) scheduleDismiss(op.orderId);
          return prev;
        });
      }),
    );

    unsubs.push(
      subscribe("JOB_FAILED", (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const jobId = p.jobId as string | undefined;
        if (!jobId) return;

        const error = (p.error as string) ?? "Errore sconosciuto";

        setOperations((prev) =>
          prev.map((op) =>
            op.jobId === jobId
              ? { ...op, status: "failed" as const, error }
              : op,
          ),
        );
      }),
    );

    unsubs.push(
      subscribe("WS_RECONNECTED", () => {
        const snapshot = operationsRef.current.filter(
          (op) => op.status === "active" || op.status === "queued",
        );

        for (const op of snapshot) {
          getJobStatus(op.jobId)
            .then(({ job }) => {
              const newStatus =
                job.state === "completed"
                  ? ("completed" as const)
                  : job.state === "failed"
                    ? ("failed" as const)
                    : job.state === "active"
                      ? ("active" as const)
                      : ("queued" as const);

              setOperations((prev) =>
                prev.map((o) =>
                  o.jobId === op.jobId
                    ? {
                        ...o,
                        status: newStatus,
                        progress:
                          newStatus === "completed" ? 100 : (job.progress ?? o.progress),
                        error: newStatus === "failed" ? job.failedReason : undefined,
                      }
                    : o,
                ),
              );

              if (newStatus === "completed") {
                scheduleDismiss(op.orderId);
              }
            })
            .catch(() => {
              // Job non trovato o errore transitorio — il prossimo evento WS aggiornerà
            });
        }
      }),
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [subscribe, scheduleDismiss]);

  useEffect(() => {
    return () => {
      for (const timer of dismissTimersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const trackOperation = useCallback(
    (orderId: string, jobId: string, displayName: string, initialLabel?: string, completedLabel?: string, navigateTo?: string) => {
      const label = initialLabel || "In coda...";
      const pendingDismiss = dismissTimersRef.current.get(orderId);
      if (pendingDismiss) {
        clearTimeout(pendingDismiss);
        dismissTimersRef.current.delete(orderId);
      }
      setOperations((prev) => {
        const existing = prev.find((op) => op.orderId === orderId);
        if (existing) {
          return prev.map((op) =>
            op.orderId === orderId
              ? { ...op, jobId, customerName: displayName, status: "queued" as const, progress: 0, label, completedLabel, navigateTo }
              : op,
          );
        }
        return [
          ...prev,
          {
            orderId,
            jobId,
            customerName: displayName,
            status: "queued" as const,
            progress: 0,
            label,
            completedLabel,
            navigateTo,
            startedAt: Date.now(),
          },
        ];
      });
    },
    [],
  );

  const dismissOperation = useCallback((orderId: string) => {
    const timer = dismissTimersRef.current.get(orderId);
    if (timer) {
      clearTimeout(timer);
      dismissTimersRef.current.delete(orderId);
    }
    setOperations((prev) => prev.filter((op) => op.orderId !== orderId));
  }, []);

  const value: OperationTrackingValue = {
    activeOperations: operations,
    trackOperation,
    dismissOperation,
  };

  return (
    <OperationTrackingContext.Provider value={value}>
      {children}
    </OperationTrackingContext.Provider>
  );
}

function useOperationTracking(): OperationTrackingValue {
  const context = useContext(OperationTrackingContext);
  if (!context) {
    throw new Error(
      "useOperationTracking must be used within OperationTrackingProvider",
    );
  }
  return context;
}

export {
  OperationTrackingProvider,
  useOperationTracking,
  type TrackedOperation,
  type OperationTrackingValue,
};

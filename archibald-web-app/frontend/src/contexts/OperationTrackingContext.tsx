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
import { getActiveJobs, getJobStatus } from "../api/operations";

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
  dismissOperation: (jobId: string) => void;
};

const OperationTrackingContext = createContext<OperationTrackingValue | null>(null);

type OperationTrackingProviderProps = {
  children: ReactNode;
};

function deriveNavigateTo(type: string, entityId: string): string | undefined {
  if (type === 'update-customer' || type === 'read-vat-status') return `/customers/${entityId}`;
  if (type === 'create-customer') return '/customers';
  if (type === 'submit-order') return '/pending-orders';
  if (['send-to-verona', 'delete-order', 'edit-order', 'batch-delete-orders',
       'batch-send-to-verona', 'download-ddt-pdf', 'download-invoice-pdf'].includes(type)) return '/orders';
  return undefined;
}

function OperationTrackingProvider({ children }: OperationTrackingProviderProps) {
  const { subscribe } = useWebSocketContext();
  const [operations, setOperations] = useState<TrackedOperation[]>([]);
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const operationsRef = useRef<TrackedOperation[]>([]);

  // Keyed by jobId (not orderId) so each job gets its own dismiss timer.
  const scheduleDismiss = useCallback((jobId: string) => {
    const existing = dismissTimersRef.current.get(jobId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      setOperations((prev) => prev.filter((op) => op.jobId !== jobId));
      dismissTimersRef.current.delete(jobId);
    }, 5_000);

    dismissTimersRef.current.set(jobId, timer);

    setOperations((prev) =>
      prev.map((op) =>
        op.jobId === jobId ? { ...op, dismissedAt: Date.now() + 5_000 } : op,
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
        const { jobs } = await getActiveJobs();

        if (cancelled || jobs.length === 0) return;

        const recovered: TrackedOperation[] = [];

        for (const activeJob of jobs) {
          try {
            const { job } = await getJobStatus(activeJob.jobId);
            if (cancelled) return;

            const status = job.state === "completed"
              ? "completed" as const
              : job.state === "failed"
                ? "failed" as const
                : job.state === "active"
                  ? "active" as const
                  : "queued" as const;

            recovered.push({
              orderId: activeJob.entityId,
              jobId: activeJob.jobId,
              customerName: activeJob.entityName,
              status,
              progress: status === "completed" ? 100 : (job.progress ?? 0),
              label: status === "completed"
                ? "Operazione completata"
                : status === "failed"
                  ? "Errore"
                  : "Recupero in corso...",
              error: job.failedReason,
              startedAt: new Date(activeJob.startedAt).getTime(),
              navigateTo: deriveNavigateTo(activeJob.type, activeJob.entityId),
            });
          } catch {
            // Skip jobs il cui status non è recuperabile
          }
        }

        if (!cancelled && recovered.length > 0) {
          setOperations(recovered);
          for (const op of recovered) {
            if (op.status === "completed") {
              scheduleDismiss(op.jobId);
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

        const type = p.type as string | undefined;
        const result = p.result as Record<string, unknown> | undefined;
        const completedOrderId = type === 'submit-order'
          ? (result?.orderId as string | undefined)
          : undefined;

        setOperations((prev) =>
          prev.map((op) =>
            op.jobId === jobId
              ? {
                  ...op,
                  status: "completed" as const,
                  progress: 100,
                  label: op.completedLabel ?? "Ordine completato",
                  ...(completedOrderId ? { navigateTo: `/orders/${completedOrderId}` } : {}),
                }
              : op,
          ),
        );

        scheduleDismiss(jobId);
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

    // Fix #2: quando il backend requeue un job (lock occupato), aggiorna il jobId
    // tracciato nel frontend per non perdere il riferimento all'operazione.
    unsubs.push(
      subscribe("JOB_REQUEUED", (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const originalJobId = p.originalJobId as string | undefined;
        const newJobId = p.newJobId as string | undefined;
        if (!originalJobId || !newJobId) return;

        // Trasferisci il dismiss timer al nuovo jobId se esiste
        const timer = dismissTimersRef.current.get(originalJobId);
        if (timer) {
          clearTimeout(timer);
          dismissTimersRef.current.delete(originalJobId);
        }

        setOperations((prev) =>
          prev.map((op) =>
            op.jobId === originalJobId
              ? { ...op, jobId: newJobId, status: "queued" as const, label: "In attesa..." }
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
                scheduleDismiss(op.jobId);
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

  // Fix #3: jobId come chiave primaria di deduplicazione.
  // - Stesso jobId → aggiorna display info.
  // - Stesso orderId + entry completed/failed → sostituisce (retry).
  // - Altrimenti → nuova entry (operazioni parallele sullo stesso ordine sono supportate).
  const trackOperation = useCallback(
    (orderId: string, jobId: string, displayName: string, initialLabel?: string, completedLabel?: string, navigateTo?: string) => {
      const label = initialLabel || "In coda...";

      // Cancella eventuale timer di dismiss per questo jobId
      const pendingDismiss = dismissTimersRef.current.get(jobId);
      if (pendingDismiss) {
        clearTimeout(pendingDismiss);
        dismissTimersRef.current.delete(jobId);
      }

      // Cancella l'eventuale timer di dismiss di una entry completed/failed con lo stesso orderId
      // (scenario retry: l'utente ri-invia un ordine già completato o fallito)
      const existingCompleted = operationsRef.current.find(
        (op) => op.orderId === orderId && (op.status === "failed" || op.status === "completed"),
      );
      if (existingCompleted && existingCompleted.jobId !== jobId) {
        const oldTimer = dismissTimersRef.current.get(existingCompleted.jobId);
        if (oldTimer) {
          clearTimeout(oldTimer);
          dismissTimersRef.current.delete(existingCompleted.jobId);
        }
      }

      setOperations((prev) => {
        // 1. Stesso jobId già tracciato → aggiorna solo i metadati display
        const byJobId = prev.find((op) => op.jobId === jobId);
        if (byJobId) {
          return prev.map((op) =>
            op.jobId === jobId
              ? { ...op, orderId, customerName: displayName, label, completedLabel, navigateTo }
              : op,
          );
        }

        // 2. Stesso orderId, entry terminata → sostituisce (retry)
        const byOrderId = prev.find((op) => op.orderId === orderId);
        if (byOrderId && (byOrderId.status === "failed" || byOrderId.status === "completed")) {
          return prev.map((op) =>
            op.orderId === orderId
              ? { ...op, jobId, customerName: displayName, status: "queued" as const, progress: 0, label, completedLabel, navigateTo, dismissedAt: undefined }
              : op,
          );
        }

        // 3. Nuova entry (orderId nuovo, o stessa entità ma operazione parallela)
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

  const dismissOperation = useCallback((jobId: string) => {
    const timer = dismissTimersRef.current.get(jobId);
    if (timer) {
      clearTimeout(timer);
      dismissTimersRef.current.delete(jobId);
    }
    setOperations((prev) => prev.filter((op) => op.jobId !== jobId));
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

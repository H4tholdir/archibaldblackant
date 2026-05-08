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
import { cancelTaskApi, getActiveJobs, getJobStatus } from "../api/operations";

export const BACKGROUND_OP_TYPES = new Set<string>([
  'sync-customers',
  'sync-orders',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
  'sync-customer-addresses',
  'sync-order-articles',
]);

export function isBackgroundOperation(operationType: string | undefined): boolean {
  return BACKGROUND_OP_TYPES.has(operationType ?? '');
}

type TrackedOperation = {
  orderId: string;
  jobId: string;
  customerName: string;
  status: "queued" | "active" | "completed" | "failed" | "cancelled";
  progress: number;
  label: string;
  completedLabel?: string;
  navigateTo?: string;
  operationType?: string;
  error?: string;
  startedAt: number;
  dismissedAt?: number;
  isBackground: boolean;
};

type OperationTrackingValue = {
  activeOperations: TrackedOperation[];
  userOperations: TrackedOperation[];
  backgroundOperations: TrackedOperation[];
  trackOperation: (orderId: string, jobId: string, displayName: string, initialLabel?: string, completedLabel?: string, navigateTo?: string, operationType?: string) => void;
  dismissOperation: (jobId: string) => void;
  cancelOperation: (jobId: string) => Promise<void>;
};

const OperationTrackingContext = createContext<OperationTrackingValue | null>(null);

type OperationTrackingProviderProps = {
  children: ReactNode;
};

function getRecoveryLabels(type: string, status: string): { label: string; completedLabel: string } {
  const completedByType: Record<string, string> = {
    'submit-order': 'Ordine inviato',
    'delete-order': 'Ordine eliminato',
    'edit-order': 'Modifica completata',
    'send-to-verona': 'Inviato a Verona',
    'batch-send-to-verona': 'Inviato a Verona',
    'batch-delete-orders': 'Ordini eliminati',
    'create-customer': 'Cliente creato',
    'update-customer': 'Aggiornamento completato',
    'read-vat-status': 'P.IVA validata',
    'download-ddt-pdf': 'Download completato',
    'download-invoice-pdf': 'Download completato',
    'sync-order-articles': 'Sync completato',
  };
  const inProgressByType: Record<string, string> = {
    'submit-order': 'Invio ordine...',
    'delete-order': 'Eliminazione ordine...',
    'edit-order': 'Modifica ordine...',
    'send-to-verona': 'Invio a Verona...',
    'batch-send-to-verona': 'Invio a Verona...',
    'batch-delete-orders': 'Eliminazione batch...',
    'create-customer': 'Creazione in corso...',
    'update-customer': 'Aggiornamento in corso...',
    'read-vat-status': 'Verifica P.IVA...',
    'download-ddt-pdf': 'Download DDT...',
    'download-invoice-pdf': 'Download fattura...',
    'sync-order-articles': 'Sync articoli...',
  };
  const completedLabel = completedByType[type] ?? 'Operazione completata';
  const inProgressLabel = inProgressByType[type] ?? 'In corso...';
  if (status === 'completed') return { label: completedLabel, completedLabel };
  if (status === 'failed') return { label: 'Errore', completedLabel };
  return { label: inProgressLabel, completedLabel };
}

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
          if (cancelled) return;
          // Tenta di arricchire con stato BullMQ (legacy ops).
          // Per task Conductor il jobId è un intero — BullMQ restituisce 404 → fallback ad active.
          let status: TrackedOperation["status"] = "active";
          let progress = 0;
          let error: string | undefined;
          try {
            const { job } = await getJobStatus(activeJob.jobId);
            if (cancelled) return;
            status = job.state === "completed" ? "completed"
              : job.state === "failed" ? "failed"
              : job.state === "active" ? "active"
              : "queued";
            progress = status === "completed" ? 100 : (job.progress ?? 0);
            error = job.failedReason;
          } catch {
            // Conductor task: nessun job BullMQ — mostra come active con progress 0
          }
          const { label: recoveryLabel, completedLabel: recoveryCompletedLabel } = getRecoveryLabels(activeJob.type, status);
          recovered.push({
            orderId: activeJob.entityId,
            jobId: activeJob.jobId,
            customerName: activeJob.entityName,
            status,
            progress,
            label: recoveryLabel,
            completedLabel: recoveryCompletedLabel,
            operationType: activeJob.type,
            error,
            startedAt: new Date(activeJob.startedAt).getTime(),
            navigateTo: deriveNavigateTo(activeJob.type, activeJob.entityId),
            isBackground: isBackgroundOperation(activeJob.type),
          });
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

    // Crea entry per un job non tracciato localmente (secondo dispositivo).
    // Usa entityName/entityId dal payload JOB_STARTED se disponibili, altrimenti
    // chiama getActiveJobs come fallback per recuperare i dettagli.
    const addUnknownJob = (
      jobId: string,
      entityName: string,
      entityId: string,
      type: string,
      initialProgress = 0,
      initialLabel = '',
    ) => {
      if (operationsRef.current.some(op => op.jobId === jobId)) return;
      const { label, completedLabel } = getRecoveryLabels(type, 'active');
      setOperations(prev => {
        if (prev.some(op => op.jobId === jobId)) return prev;
        return [
          ...prev,
          {
            orderId: entityId || jobId,
            jobId,
            customerName: entityName,
            status: 'active' as const,
            progress: initialProgress,
            label: initialLabel || label,
            completedLabel,
            operationType: type,
            startedAt: Date.now(),
            navigateTo: deriveNavigateTo(type, entityId || jobId),
            isBackground: isBackgroundOperation(type),
          },
        ];
      });
    };

    const lazyRecoverIfUnknown = (jobId: string) => {
      if (operationsRef.current.some(op => op.jobId === jobId)) return;
      getActiveJobs()
        .then(({ jobs }) => {
          for (const activeJob of jobs) {
            if (operationsRef.current.some(op => op.jobId === activeJob.jobId)) continue;
            addUnknownJob(activeJob.jobId, activeJob.entityName, activeJob.entityId, activeJob.type);
          }
        })
        .catch(() => {});
    };

    unsubs.push(
      subscribe("JOB_STARTED", (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const jobId = (p.jobId ?? p.taskId) as string | undefined;
        if (!jobId) return;

        const entityName = (p.entityName as string | undefined) ?? '';
        const entityId = (p.entityId as string | undefined) ?? '';
        const type = (p.type as string | undefined) ?? '';

        // Se il job non è tracciato (secondo dispositivo), crealo direttamente dai dati JOB_STARTED
        // o tramite lazy recovery se entityName non è disponibile
        if (!operationsRef.current.some(op => op.jobId === jobId)) {
          if (entityName) {
            addUnknownJob(jobId, entityName, entityId, type);
          } else {
            lazyRecoverIfUnknown(jobId);
          }
        }

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

        // JOB_PROGRESS può arrivare prima che JOB_STARTED sia stato processato
        // (race WS) — stessa lazy recovery
        if (!operationsRef.current.some(op => op.jobId === jobId)) {
          lazyRecoverIfUnknown(jobId);
        }

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
        const jobId = (p.jobId ?? p.taskId) as string | undefined;
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
        const jobId = (p.jobId ?? p.taskId) as string | undefined;
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

    // Conductor: task entrata in coda
    unsubs.push(
      subscribe("JOB_QUEUED", (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const taskId = p.taskId as string | undefined;
        const type = p.type as string | undefined;
        const customerName = (p.customerName as string | undefined) ?? '';
        if (!taskId) return;

        // Evita duplicati se già presente
        if (operationsRef.current.some(op => op.jobId === taskId)) return;

        setOperations(prev => [
          ...prev,
          {
            orderId: taskId,
            jobId: taskId,
            customerName,
            status: 'queued' as const,
            progress: 0,
            label: 'In attesa',
            startedAt: Date.now(),
            navigateTo: deriveNavigateTo(type ?? '', taskId),
            isBackground: isBackgroundOperation(type),
          },
        ]);
      }),
    );

    // Conductor: circuit breaker aperto — mostra notifica
    unsubs.push(
      subscribe("CIRCUIT_OPEN", (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const circuitJobId = `circuit-${p.userId ?? 'unknown'}`;

        // Aggiungi o aggiorna voce speciale per circuit breaker
        setOperations(prev => {
          const existing = prev.find(op => op.jobId === circuitJobId);
          if (existing) {
            return prev.map(op =>
              op.jobId === circuitJobId
                ? { ...op, status: 'failed' as const, error: 'ERP non raggiungibile', label: 'ERP non raggiungibile' }
                : op,
            );
          }
          return [
            ...prev,
            {
              orderId: circuitJobId,
              jobId: circuitJobId,
              customerName: '',
              status: 'failed' as const,
              progress: 0,
              label: 'ERP non raggiungibile',
              error: 'ERP non raggiungibile · riprova tra qualche minuto',
              startedAt: Date.now(),
              isBackground: false,
            },
          ];
        });
        scheduleDismiss(circuitJobId);
      }),
    );

    // Conductor: retry di un task
    unsubs.push(
      subscribe("JOB_RETRYING", (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const jobId = (p.taskId ?? p.jobId) as string | undefined;
        if (!jobId) return;

        setOperations((prev) =>
          prev.map((op) =>
            op.jobId === jobId
              ? { ...op, status: 'queued' as const, label: 'In attesa (nuovo tentativo)', error: undefined }
              : op,
          ),
        );
      }),
    );

    // Conductor: task cancellata dall'utente via /api/agent-queue/:id/cancel
    unsubs.push(
      subscribe("JOB_CANCELLED", (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const jobId = (p.taskId ?? p.jobId) as string | undefined;
        if (!jobId) return;

        setOperations((prev) =>
          prev.map((op) =>
            op.jobId === jobId
              ? { ...op, status: 'cancelled' as const, label: 'Annullato', error: undefined }
              : op,
          ),
        );
        scheduleDismiss(jobId);
      }),
    );

    // Conductor: aggiornamento progress
    unsubs.push(
      subscribe("OPERATION_PROGRESS", (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const jobId = (p.taskId ?? p.jobId) as string | undefined;
        if (!jobId) return;

        const progress = (p.progress as number) ?? 0;
        const label = (p.label as string) ?? '';

        setOperations((prev) =>
          prev.map((op) =>
            op.jobId === jobId
              ? { ...op, status: 'active' as const, progress, ...(label ? { label } : {}) }
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
    (orderId: string, jobId: string, displayName: string, initialLabel?: string, completedLabel?: string, navigateTo?: string, operationType?: string) => {
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
              ? { ...op, orderId, customerName: displayName, label, completedLabel, navigateTo, operationType: operationType ?? op.operationType }
              : op,
          );
        }

        // 2. Stesso orderId, entry terminata → sostituisce (retry)
        const byOrderId = prev.find((op) => op.orderId === orderId);
        if (byOrderId && (byOrderId.status === "failed" || byOrderId.status === "completed")) {
          return prev.map((op) =>
            op.orderId === orderId
              ? { ...op, jobId, customerName: displayName, status: "queued" as const, progress: 0, label, completedLabel, navigateTo, operationType: operationType ?? op.operationType, dismissedAt: undefined }
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
            operationType,
            startedAt: Date.now(),
            isBackground: isBackgroundOperation(operationType),
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

  const cancelOperation = useCallback(async (jobId: string): Promise<void> => {
    await cancelTaskApi(jobId);
    setOperations(prev => prev.filter(op => op.jobId !== jobId));
  }, []);

  const userOperations = operations.filter(op => !op.isBackground);
  const backgroundOperations = operations.filter(op => op.isBackground);

  const value: OperationTrackingValue = {
    activeOperations: operations,
    userOperations,
    backgroundOperations,
    trackOperation,
    dismissOperation,
    cancelOperation,
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
  getRecoveryLabels,
  type TrackedOperation,
  type OperationTrackingValue,
};

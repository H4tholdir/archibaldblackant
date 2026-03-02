import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { getPendingOrders } from "../api/pending-orders";
import type { PendingOrder } from "../types/pending-order";
import { getJobStatus } from "../api/operations";

export type JobTrackingEntry = {
  orderId: string;
  jobId: string;
  status: "queued" | "active" | "completed" | "failed";
  progress?: number;
  label?: string;
  error?: string;
  startedAt: number;
};

export interface UsePendingSyncReturn {
  pendingOrders: PendingOrder[];
  isConnected: boolean;
  isSyncing: boolean;
  staleJobIds: Set<string>;
  refetch: () => Promise<void>;
  trackJobs: (entries: Array<{ orderId: string; jobId: string }>) => void;
  jobTracking: Map<string, JobTrackingEntry>;
}

const WS_EVENTS_PENDING = [
  "PENDING_CREATED",
  "PENDING_UPDATED",
  "PENDING_DELETED",
  "PENDING_SUBMITTED",
  "JOB_STARTED",
  "JOB_PROGRESS",
  "JOB_COMPLETED",
  "JOB_FAILED",
] as const;

export function usePendingSync(): UsePendingSyncReturn {
  const { state, subscribe } = useWebSocketContext();
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [staleJobIds, setStaleJobIds] = useState<Set<string>>(new Set());
  const [jobTracking, setJobTracking] = useState<Map<string, JobTrackingEntry>>(new Map());

  const fetchPendingOrders = useCallback(async () => {
    try {
      setIsSyncing(true);
      const orders = await getPendingOrders();

      orders.sort((a, b) => {
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        return bTime - aTime;
      });

      setPendingOrders(orders);
    } catch (error) {
      console.error("[usePendingSync] Error fetching pending orders:", error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    await fetchPendingOrders();
  }, [fetchPendingOrders]);

  const trackJobs = useCallback((entries: Array<{ orderId: string; jobId: string }>) => {
    setJobTracking((prev) => {
      const next = new Map(prev);
      for (const entry of entries) {
        next.set(entry.orderId, {
          orderId: entry.orderId,
          jobId: entry.jobId,
          status: "queued",
          startedAt: Date.now(),
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    fetchPendingOrders();

    const unsubscribers = WS_EVENTS_PENDING.map((eventType) =>
      subscribe(eventType, (payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        if (eventType === "JOB_STARTED" && p.type === "submit-order") {
          const jobId = p.jobId as string;
          setJobTracking((prev) => {
            const next = new Map(prev);
            for (const [orderId, entry] of next) {
              if (entry.jobId === jobId) {
                next.set(orderId, { ...entry, status: "active" });
              }
            }
            return next;
          });
          return; // No refetch — tracking is local, avoid re-render
        } else if (eventType === "JOB_PROGRESS" && p.type === "submit-order") {
          const jobId = p.jobId as string;
          const progress = (p.progress as number) ?? 0;
          const label = p.label as string | undefined;
          setJobTracking((prev) => {
            const next = new Map(prev);
            for (const [orderId, entry] of next) {
              if (entry.jobId === jobId) {
                next.set(orderId, { ...entry, status: "active", progress, label });
              }
            }
            return next;
          });
          return; // No refetch — progress comes from local tracking, not server
        } else if (eventType === "JOB_COMPLETED" && p.type === "submit-order") {
          const jobId = p.jobId as string;
          setJobTracking((prev) => {
            const next = new Map(prev);
            for (const [orderId, entry] of next) {
              if (entry.jobId === jobId) {
                next.set(orderId, { ...entry, status: "completed", progress: 100, label: "Ordine completato" });
              }
            }
            return next;
          });
          setTimeout(() => fetchPendingOrders(), 4000);
          return;
        } else if (eventType === "JOB_FAILED" && p.type === "submit-order") {
          const jobId = p.jobId as string;
          const error = p.error as string | undefined;
          setJobTracking((prev) => {
            const next = new Map(prev);
            for (const [orderId, entry] of next) {
              if (entry.jobId === jobId) {
                next.set(orderId, { ...entry, status: "failed", error: error ?? "Errore sconosciuto" });
              }
            }
            return next;
          });
          fetchPendingOrders(); // Refetch to get persisted error from server
          return;
        }
        fetchPendingOrders();
      }),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [subscribe, fetchPendingOrders]);

  const jobTrackingRef = useRef(jobTracking);
  jobTrackingRef.current = jobTracking;

  useEffect(() => {
    const interval = setInterval(async () => {
      const tracking = jobTrackingRef.current;
      const newStaleIds = new Set<string>();

      for (const [orderId, entry] of tracking) {
        if (entry.status === "completed" || entry.status === "failed") continue;

        const elapsed = Date.now() - entry.startedAt;
        if (elapsed < 45_000) continue;

        newStaleIds.add(orderId);

        try {
          const result = await getJobStatus(entry.jobId);
          const jobState = result.job.state;
          if (jobState === "failed" || jobState === "completed") {
            newStaleIds.delete(orderId);
            setJobTracking((prev) => {
              const next = new Map(prev);
              next.set(orderId, {
                ...entry,
                status: jobState === "failed" ? "failed" : "completed",
                error: jobState === "failed" ? (result.job.failedReason ?? "Errore sconosciuto") : undefined,
              });
              return next;
            });
            fetchPendingOrders();
          }
        } catch {
          // Backend unreachable - keep as stale
        }
      }

      setStaleJobIds(newStaleIds);
    }, 15_000);

    return () => clearInterval(interval);
  }, [fetchPendingOrders]);

  const trackingStatusMap: Record<string, PendingOrder["jobStatus"]> = {
    queued: "started",
    active: "processing",
    completed: "completed",
    failed: "failed",
  };

  const enrichedOrders = useMemo(
    () =>
      pendingOrders.map((order) => {
        const tracking = jobTracking.get(order.id!);
        if (!tracking) return order;
        return {
          ...order,
          jobId: tracking.jobId,
          jobStatus: trackingStatusMap[tracking.status] ?? order.jobStatus,
          jobProgress: tracking.progress ?? order.jobProgress,
          jobOperation: tracking.label ?? order.jobOperation,
          jobError: tracking.error ?? order.jobError,
        };
      }),
    [pendingOrders, jobTracking],
  );

  return {
    pendingOrders: enrichedOrders,
    isConnected: state === "connected",
    isSyncing,
    staleJobIds,
    refetch,
    trackJobs,
    jobTracking,
  };
}

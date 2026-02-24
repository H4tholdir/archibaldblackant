import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { getPendingOrders } from "../api/pending-orders";
import type { PendingOrder } from "../types/pending-order";
import { getJobStatus } from "../api/operations";

export type JobTrackingEntry = {
  orderId: string;
  jobId: string;
  status: "queued" | "active" | "completed" | "failed";
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
        if (eventType === "JOB_COMPLETED" && p.type === "submit-order") {
          const jobId = p.jobId as string;
          setJobTracking((prev) => {
            const next = new Map(prev);
            for (const [orderId, entry] of next) {
              if (entry.jobId === jobId) {
                next.set(orderId, { ...entry, status: "completed" });
              }
            }
            return next;
          });
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

  return {
    pendingOrders,
    isConnected: state === "connected",
    isSyncing,
    staleJobIds,
    refetch,
    trackJobs,
    jobTracking,
  };
}

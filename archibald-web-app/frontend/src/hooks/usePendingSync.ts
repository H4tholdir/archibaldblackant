import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { getPendingOrders } from "../api/pending-orders";
import type { PendingOrder } from "../types/pending-order";
import { fetchWithRetry } from "../utils/fetch-with-retry";

export interface UsePendingSyncReturn {
  pendingOrders: PendingOrder[];
  isConnected: boolean;
  isSyncing: boolean;
  staleJobIds: Set<string>;
  refetch: () => Promise<void>;
}

function isJobStale(order: PendingOrder): boolean {
  const now = Date.now();

  if (order.jobStatus === "started" && order.jobStartedAt) {
    const startedAt = new Date(order.jobStartedAt).getTime();
    return now - startedAt > 45_000;
  }

  if (order.jobStatus === "processing") {
    const updatedAt = new Date(order.updatedAt).getTime();
    return now - updatedAt > 120_000;
  }

  return false;
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
  "ORDER_NUMBERS_RESOLVED",
] as const;

export function usePendingSync(): UsePendingSyncReturn {
  const { state, subscribe } = useWebSocketContext();
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [staleJobIds, setStaleJobIds] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    fetchPendingOrders();

    const unsubscribers = WS_EVENTS_PENDING.map((eventType) =>
      subscribe(eventType, () => {
        fetchPendingOrders();
      }),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [subscribe, fetchPendingOrders]);

  const pendingOrdersRef = useRef(pendingOrders);
  pendingOrdersRef.current = pendingOrders;

  useEffect(() => {
    const interval = setInterval(async () => {
      const orders = pendingOrdersRef.current;
      const newStaleIds = new Set<string>();

      for (const order of orders) {
        if (!isJobStale(order) || !order.jobId) continue;

        newStaleIds.add(order.id);

        try {
          const response = await fetchWithRetry(
            `/api/orders/status/${order.jobId}`,
          );
          if (!response.ok) continue;

          const data = await response.json();
          if (!data.success) continue;

          const jobState = data.data?.status;
          if (
            jobState === "failed" ||
            jobState === "completed" ||
            jobState === "not_found"
          ) {
            newStaleIds.delete(order.id);
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
  };
}

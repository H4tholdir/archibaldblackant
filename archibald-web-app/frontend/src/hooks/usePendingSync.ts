/**
 * usePendingSync Hook
 *
 * React hook for real-time pending order synchronization via WebSocket.
 * Provides pending order list updates, connection state, and automatic subscription management.
 *
 * Phase 32: Real-time pending sync via WebSocket
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { PendingRealtimeService } from "../services/pending-realtime.service";
import { db } from "../db/schema";
import type { PendingOrder } from "../db/schema";
import { fetchWithRetry } from "../utils/fetch-with-retry";

export interface UsePendingSyncReturn {
  pendingOrders: PendingOrder[];
  isConnected: boolean;
  isSyncing: boolean;
  staleJobIds: Set<string>;
  refetch: () => Promise<void>;
}

/**
 * Hook for real-time pending order synchronization
 *
 * Usage:
 * ```tsx
 * const { pendingOrders, isConnected, isSyncing, refetch } = usePendingSync();
 * ```
 */
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

export function usePendingSync(): UsePendingSyncReturn {
  const { state, subscribe } = useWebSocketContext();
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [staleJobIds, setStaleJobIds] = useState<Set<string>>(new Set());

  const pendingRealtimeService = PendingRealtimeService.getInstance();

  /**
   * Load pending orders from IndexedDB
   */
  const loadPendingOrders = useCallback(async () => {
    try {
      setIsSyncing(true);
      const orders = await db.pendingOrders.toArray();

      // Sort by updatedAt descending (newest first)
      orders.sort((a, b) => {
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        return bTime - aTime;
      });

      setPendingOrders(orders);
    } catch (error) {
      console.error("[usePendingSync] Error loading pending orders:", error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const pullFromServer = useCallback(async () => {
    try {
      const response = await fetchWithRetry("/api/sync/pending-orders");
      if (!response.ok) return;

      const data = await response.json();
      if (!data.success || !Array.isArray(data.orders)) return;

      const serverIds = new Set<string>();

      for (const serverOrder of data.orders) {
        serverIds.add(serverOrder.id);

        const localOrder = await db.pendingOrders.get(serverOrder.id);

        if (localOrder?.needsSync) continue;

        if (
          !localOrder ||
          serverOrder.updatedAt > (localOrder.serverUpdatedAt || 0)
        ) {
          await db.pendingOrders.put({
            id: serverOrder.id,
            customerId: serverOrder.customerId,
            customerName: serverOrder.customerName,
            items: serverOrder.items,
            discountPercent: serverOrder.discountPercent,
            targetTotalWithVAT: serverOrder.targetTotalWithVAT,
            shippingCost: serverOrder.shippingCost || 0,
            shippingTax: serverOrder.shippingTax || 0,
            createdAt: new Date(serverOrder.createdAt).toISOString(),
            updatedAt: new Date(serverOrder.updatedAt).toISOString(),
            status: serverOrder.status,
            errorMessage: serverOrder.errorMessage,
            retryCount: serverOrder.retryCount || 0,
            deviceId: serverOrder.deviceId,
            subClientCodice: serverOrder.subClientCodice || undefined,
            subClientName: serverOrder.subClientName || undefined,
            subClientData: serverOrder.subClientData || undefined,
            needsSync: false,
            serverUpdatedAt: serverOrder.updatedAt,
          } as PendingOrder);
        }
      }

      const localOrders = await db.pendingOrders.toArray();
      for (const localOrder of localOrders) {
        if (localOrder.needsSync) continue;
        if (!serverIds.has(localOrder.id)) {
          await db.pendingOrders.delete(localOrder.id);
        }
      }

      await loadPendingOrders();
    } catch (error) {
      console.error("[usePendingSync] Pull from server failed:", error);
    }
  }, [loadPendingOrders]);

  /**
   * Refetch pending orders from IndexedDB (manual refresh)
   */
  const refetch = useCallback(async () => {
    await loadPendingOrders();
  }, [loadPendingOrders]);

  /**
   * Initialize WebSocket subscriptions and load initial data
   */
  useEffect(() => {
    // Load initial pending orders from IndexedDB, then sync from server
    loadPendingOrders().then(() => pullFromServer());

    // Initialize WebSocket subscriptions
    const unsubscribers =
      pendingRealtimeService.initializeSubscriptions(subscribe);

    // Subscribe to pending order updates (triggers UI refresh)
    const unsubscribeUpdate = pendingRealtimeService.onUpdate(() => {
      loadPendingOrders();
    });

    // Cleanup on unmount
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribeUpdate();
    };
  }, [subscribe, loadPendingOrders, pullFromServer, pendingRealtimeService]);

  // Watchdog: check for stale jobs and poll backend for real status
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
          if (jobState === "failed" || jobState === "completed") {
            await db.pendingOrders.update(order.id, {
              jobStatus: jobState,
              jobError: data.data?.error,
              jobOperation:
                jobState === "failed"
                  ? "Errore durante elaborazione"
                  : "Completato",
              status: jobState === "failed" ? "error" : order.status,
              errorMessage: data.data?.error,
              updatedAt: new Date().toISOString(),
            });
            newStaleIds.delete(order.id);
            loadPendingOrders();
          }
        } catch {
          // Backend unreachable — keep as stale
        }
      }

      setStaleJobIds(newStaleIds);
    }, 15_000);

    return () => clearInterval(interval);
  }, [loadPendingOrders]);

  return {
    pendingOrders,
    isConnected: state === "connected",
    isSyncing,
    staleJobIds,
    refetch,
  };
}

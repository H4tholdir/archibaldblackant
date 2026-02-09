/**
 * usePendingSync Hook
 *
 * React hook for real-time pending order synchronization via WebSocket.
 * Provides pending order list updates, connection state, and automatic subscription management.
 *
 * Phase 32: Real-time pending sync via WebSocket
 */

import { useState, useEffect, useCallback } from "react";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { PendingRealtimeService } from "../services/pending-realtime.service";
import { db } from "../db/schema";
import type { PendingOrder } from "../db/schema";
import { fetchWithRetry } from "../utils/fetch-with-retry";

export interface UsePendingSyncReturn {
  pendingOrders: PendingOrder[];
  isConnected: boolean;
  isSyncing: boolean;
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
export function usePendingSync(): UsePendingSyncReturn {
  const { state, subscribe } = useWebSocketContext();
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

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
            createdAt: new Date(serverOrder.createdAt).toISOString(),
            updatedAt: new Date(serverOrder.updatedAt).toISOString(),
            status: serverOrder.status,
            errorMessage: serverOrder.errorMessage,
            retryCount: serverOrder.retryCount || 0,
            deviceId: serverOrder.deviceId,
            needsSync: false,
            serverUpdatedAt: serverOrder.updatedAt,
          });
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

  return {
    pendingOrders,
    isConnected: state === "connected",
    isSyncing,
    refetch,
  };
}

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
    // Load initial pending orders from IndexedDB
    loadPendingOrders();

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
  }, [subscribe, loadPendingOrders, pendingRealtimeService]);

  return {
    pendingOrders,
    isConnected: state === "connected",
    isSyncing,
    refetch,
  };
}

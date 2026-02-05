/**
 * useDraftSync Hook
 *
 * React hook for real-time draft order synchronization via WebSocket.
 * Provides draft list updates, connection state, and automatic subscription management.
 *
 * Phase 31: Real-time draft sync via WebSocket
 */

import { useState, useEffect, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { DraftRealtimeService } from "../services/draft-realtime.service";
import { db } from "../db/schema";
import type { DraftOrder } from "../db/schema";

export interface UseDraftSyncReturn {
  drafts: DraftOrder[];
  isConnected: boolean;
  isSyncing: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook for real-time draft order synchronization
 *
 * Usage:
 * ```tsx
 * const { drafts, isConnected, isSyncing, refetch } = useDraftSync();
 * ```
 */
export function useDraftSync(): UseDraftSyncReturn {
  const { state, subscribe } = useWebSocket();
  const [drafts, setDrafts] = useState<DraftOrder[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const draftRealtimeService = DraftRealtimeService.getInstance();

  /**
   * Load drafts from IndexedDB
   */
  const loadDrafts = useCallback(async () => {
    try {
      setIsSyncing(true);
      const allDrafts = await db.draftOrders.toArray();

      // Filter out deleted drafts (tombstones)
      const activeDrafts = allDrafts.filter((draft) => !draft.deleted);

      // Sort by updatedAt descending (newest first)
      activeDrafts.sort((a, b) => {
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        return bTime - aTime;
      });

      setDrafts(activeDrafts);
    } catch (error) {
      console.error("[useDraftSync] Error loading drafts:", error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  /**
   * Refetch drafts from IndexedDB (manual refresh)
   */
  const refetch = useCallback(async () => {
    await loadDrafts();
  }, [loadDrafts]);

  /**
   * Initialize WebSocket subscriptions and load initial data
   */
  useEffect(() => {
    // Load initial drafts from IndexedDB
    loadDrafts();

    // Initialize WebSocket subscriptions
    const unsubscribers =
      draftRealtimeService.initializeSubscriptions(subscribe);

    // Subscribe to draft updates (triggers UI refresh)
    const unsubscribeUpdate = draftRealtimeService.onUpdate(() => {
      loadDrafts();
    });

    // Cleanup on unmount
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribeUpdate();
    };
  }, [subscribe, loadDrafts, draftRealtimeService]);

  return {
    drafts,
    isConnected: state === "connected",
    isSyncing,
    refetch,
  };
}

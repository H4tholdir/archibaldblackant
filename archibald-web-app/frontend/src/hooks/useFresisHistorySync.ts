import { useState, useEffect, useCallback } from "react";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { FresisHistoryRealtimeService } from "../services/fresis-history-realtime.service";
import { fresisHistoryService } from "../services/fresis-history.service";
import type { FresisHistoryOrder } from "../db/schema";

export interface UseFresisHistorySyncReturn {
  historyOrders: FresisHistoryOrder[];
  isConnected: boolean;
  isSyncing: boolean;
  refetch: () => Promise<void>;
}

export function useFresisHistorySync(): UseFresisHistorySyncReturn {
  const { state, subscribe } = useWebSocketContext();
  const [historyOrders, setHistoryOrders] = useState<FresisHistoryOrder[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const realtimeService = FresisHistoryRealtimeService.getInstance();

  const loadOrders = useCallback(async () => {
    try {
      setIsSyncing(true);
      const orders = await fresisHistoryService.getAllHistoryOrders();
      setHistoryOrders(orders);
    } catch (error) {
      console.error(
        "[useFresisHistorySync] Error loading history orders:",
        error,
      );
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    await loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    loadOrders();

    fresisHistoryService
      .fullSync()
      .then(() => fresisHistoryService.syncOrderLifecycles())
      .then(() => loadOrders());

    const unsubscribers = realtimeService.initializeSubscriptions(subscribe);

    const unsubscribeUpdate = realtimeService.onUpdate(() => {
      loadOrders();
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribeUpdate();
    };
  }, [subscribe, loadOrders, realtimeService]);

  return {
    historyOrders,
    isConnected: state === "connected",
    isSyncing,
    refetch,
  };
}

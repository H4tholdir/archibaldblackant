import { useState, useEffect, useCallback } from "react";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { FresisHistoryRealtimeService } from "../services/fresis-history-realtime.service";
import { getFresisHistory } from "../api/fresis-history";
import type { FresisHistoryOrder } from "../types/fresis";

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
      const orders = await getFresisHistory();
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

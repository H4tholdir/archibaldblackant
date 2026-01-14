import { useEffect } from "react";
import { useNetworkStatus } from "./useNetworkStatus";
import { pendingOrdersService } from "../services/pending-orders-service";

export function useAutomaticSync(jwt: string | null) {
  const { isOnline } = useNetworkStatus();

  useEffect(() => {
    if (isOnline && jwt) {
      // Trigger sync when network comes back online
      console.log("[AutoSync] Network online, syncing pending orders...");

      pendingOrdersService.syncPendingOrders(jwt).then((result) => {
        if (result.success > 0) {
          console.log("[AutoSync] Synced", result.success, "orders");
        }
        if (result.failed > 0) {
          console.warn("[AutoSync] Failed", result.failed, "orders");
        }
      });
    }
  }, [isOnline, jwt]); // Trigger on network status change
}

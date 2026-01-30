import { useEffect, useRef } from "react";
import { useNetworkStatus } from "./useNetworkStatus";
import { pendingOrdersService } from "../services/pending-orders-service";

export function useAutomaticSync(jwt: string | null) {
  const { isOnline } = useNetworkStatus();
  const wasOffline = useRef(false);

  useEffect(() => {
    // Only sync when network comes back online (offline → online transition)
    // Do NOT sync on initial mount or login
    if (isOnline && jwt) {
      if (wasOffline.current) {
        // Network returned online after being offline
        console.log("[AutoSync] Network reconnected, syncing pending orders...");

        pendingOrdersService.syncPendingOrders(jwt).then((result) => {
          if (result.success > 0) {
            console.log("[AutoSync] Synced", result.success, "orders");
          }
          if (result.failed > 0) {
            console.warn("[AutoSync] Failed", result.failed, "orders");
          }
        });

        wasOffline.current = false;
      }
    } else if (!isOnline) {
      // Mark as offline
      wasOffline.current = true;
    }
  }, [isOnline, jwt]);
}

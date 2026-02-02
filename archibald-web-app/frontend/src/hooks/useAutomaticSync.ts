import { useEffect, useRef } from "react";
import { useNetworkStatus } from "./useNetworkStatus";
import { unifiedSyncService } from "../services/unified-sync-service";

export function useAutomaticSync(jwt: string | null) {
  const { isOnline } = useNetworkStatus();
  const wasOffline = useRef(false);

  useEffect(() => {
    // Only sync when network comes back online (offline → online transition)
    // Do NOT sync on initial mount or login
    if (isOnline && jwt) {
      if (wasOffline.current) {
        // Network returned online after being offline
        console.log(
          "[AutoSync] Network reconnected, syncing all data (orders, drafts, warehouse)...",
        );

        unifiedSyncService
          .syncAll()
          .then(() => {
            console.log("[AutoSync] Full sync completed");
          })
          .catch((error) => {
            console.error("[AutoSync] Sync failed:", error);
          });

        wasOffline.current = false;
      }
    } else if (!isOnline) {
      // Mark as offline
      wasOffline.current = true;
    }
  }, [isOnline, jwt]);
}

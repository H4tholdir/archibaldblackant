import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { unifiedSyncService } from "../services/unified-sync-service";
import { fetchWithRetry } from "../utils/fetch-with-retry";

/**
 * Hook to check if admin is currently working on agent's account
 * Polls every 10s and accelerates sync when admin is active
 */
export function useAdminSessionCheck() {
  const [adminActive, setAdminActive] = useState(false);
  const [adminName, setAdminName] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    // Only for agents (not for admin users)
    if (!user || user.role === "admin") {
      return;
    }

    const checkAdminSession = async () => {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) return;

      try {
        const response = await fetchWithRetry("/api/admin/session/check", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (data.success) {
          setAdminActive(data.active);
          setAdminName(data.adminName || "");

          // Accelerate sync when admin is active
          if (data.active) {
            unifiedSyncService.startPeriodicSync(10000); // 10s
          } else {
            unifiedSyncService.startPeriodicSync(30000); // 30s
          }
        }
      } catch (error) {
        console.error("Admin session check error:", error);
      }
    };

    // Initial check
    checkAdminSession();

    // Poll every 10s
    const interval = setInterval(checkAdminSession, 10000);

    return () => clearInterval(interval);
  }, [user]);

  return { adminActive, adminName };
}

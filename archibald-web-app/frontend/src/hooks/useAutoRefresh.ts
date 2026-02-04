import { useEffect, useRef } from "react";

interface UseAutoRefreshOptions {
  enabled: boolean; // Se false, no refresh
  intervalMs: number; // Intervallo in ms (es: 60000 = 1 minuto)
  onRefresh: () => void | Promise<void>; // Callback da chiamare
  visibilityCheck?: boolean; // Default: true
}

/**
 * Hook per auto-refresh periodico con visibility check
 * Refresh solo quando tab è visibile + refresh immediato al ritorno
 */
export function useAutoRefresh({
  enabled,
  intervalMs,
  onRefresh,
  visibilityCheck = true,
}: UseAutoRefreshOptions): void {
  const lastRefreshRef = useRef<number>(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const doRefresh = async () => {
      // Check visibility if enabled
      if (visibilityCheck && document.hidden) {
        return;
      }

      // Avoid rapid triggers (debounce 5s)
      const now = Date.now();
      if (now - lastRefreshRef.current < 5000) {
        return;
      }

      lastRefreshRef.current = now;
      await onRefresh();
    };

    // Setup interval
    intervalRef.current = setInterval(doRefresh, intervalMs);

    // Visibility change handler - refresh when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        doRefresh();
      }
    };

    if (visibilityCheck) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (visibilityCheck) {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      }
    };
  }, [enabled, intervalMs, onRefresh, visibilityCheck]);
}

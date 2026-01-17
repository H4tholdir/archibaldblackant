import { useState, useCallback, useRef } from "react";

interface CustomerSyncProgress {
  isRunning: boolean;
  status: "idle" | "syncing" | "completed" | "error";
  message: string;
  customersProcessed: number;
  currentPage: number;
  totalPages: number;
  error?: string | null;
}

export function useCustomerSync() {
  const [progress, setProgress] = useState<CustomerSyncProgress>({
    isRunning: false,
    status: "idle",
    message: "",
    customersProcessed: 0,
    currentPage: 0,
    totalPages: 0,
    error: null,
  });

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const pollSyncStatus = useCallback(
    async (token: string): Promise<boolean> => {
      try {
        const response = await fetch("/api/customers/sync-status", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error("Failed to get sync status");
        }

        const syncData = data.data;

        setProgress({
          isRunning: syncData.status === "syncing",
          status: syncData.status,
          message: syncData.message,
          customersProcessed: syncData.customersProcessed || 0,
          currentPage: syncData.currentPage || 0,
          totalPages: syncData.totalPages || 0,
          error: syncData.error || null,
        });

        // Return true if sync is completed or errored (stop polling)
        return syncData.status === "completed" || syncData.status === "error";
      } catch (err) {
        console.error("Error polling sync status:", err);
        // Don't stop polling on network errors, just log them
        return false;
      }
    },
    [],
  );

  const startSync = useCallback(
    async (token: string) => {
      setProgress({
        isRunning: true,
        status: "syncing",
        message: "Avvio sincronizzazione...",
        customersProcessed: 0,
        currentPage: 0,
        totalPages: 0,
        error: null,
      });

      try {
        // Start the sync on the backend
        const response = await fetch("/api/customers/sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Sessione scaduta. Effettua il login.");
          }
          throw new Error(`Errore ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error("Errore nell'avvio della sincronizzazione");
        }

        // Start polling for sync status
        return new Promise<{ success: boolean; error?: string }>((resolve) => {
          let lastError: string | null = null;

          pollingIntervalRef.current = setInterval(async () => {
            const isComplete = await pollSyncStatus(token);

            // Update lastError from progress state via another status check
            const statusCheck = await fetch("/api/customers/sync-status", {
              headers: { Authorization: `Bearer ${token}` },
            });

            if (statusCheck.ok) {
              const statusData = await statusCheck.json();
              if (statusData.success && statusData.data.error) {
                lastError = statusData.data.error;
              }
            }

            if (isComplete) {
              stopPolling();
              resolve(
                lastError
                  ? { success: false, error: lastError }
                  : { success: true },
              );
            }
          }, 2000); // Poll every 2 seconds
        });
      } catch (err) {
        console.error("Sync error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Errore nella sincronizzazione";

        setProgress({
          isRunning: false,
          status: "error",
          message: errorMessage,
          customersProcessed: 0,
          currentPage: 0,
          totalPages: 0,
          error: errorMessage,
        });

        stopPolling();
        return { success: false, error: errorMessage };
      }
    },
    [pollSyncStatus, stopPolling],
  );

  const reset = useCallback(() => {
    stopPolling();
    setProgress({
      isRunning: false,
      status: "idle",
      message: "",
      customersProcessed: 0,
      currentPage: 0,
      totalPages: 0,
      error: null,
    });
  }, [stopPolling]);

  return {
    progress,
    startSync,
    reset,
  };
}

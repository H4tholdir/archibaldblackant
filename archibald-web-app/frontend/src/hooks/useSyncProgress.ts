import { useState, useCallback } from "react";
import { fetchWithRetry } from "../utils/fetch-with-retry";

interface SyncProgress {
  isRunning: boolean;
  phase: string;
  message: string;
  progress: number;
  ordersProcessed?: number;
  totalOrders?: number;
  error?: string | null;
}

export function useSyncProgress() {
  const [progress, setProgress] = useState<SyncProgress>({
    isRunning: false,
    phase: "idle",
    message: "",
    progress: 0,
    error: null,
  });

  const startSync = useCallback(
    async (
      type: "sync" | "reset",
      token: string,
      onCompleted?: () => void | Promise<void>,
    ) => {
      setProgress({
        isRunning: true,
        phase: "starting",
        message: "Avvio sincronizzazione...",
        progress: 0,
        error: null,
      });

      try {
        // Start sync (non-blocking endpoint)
        const endpoint =
          type === "reset"
            ? "/api/orders/reset-and-sync"
            : "/api/orders/force-sync";

        const syncResponse = await fetchWithRetry(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!syncResponse.ok) {
          if (syncResponse.status === 401) {
            throw new Error("Sessione scaduta. Effettua il login.");
          }
          throw new Error(
            `Errore ${syncResponse.status}: ${syncResponse.statusText}`,
          );
        }

        const syncData = await syncResponse.json();

        if (!syncData.success) {
          throw new Error(syncData.message || "Errore avvio sincronizzazione");
        }

        // Listen to SSE for real-time progress
        const eventSource = new EventSource(
          `/api/sync/progress?token=${token}`,
        );

        return new Promise((resolve, reject) => {
          eventSource.onmessage = (event) => {
            const progressData = JSON.parse(event.data);

            // Only handle order sync events
            if (progressData.syncType !== "orders") return;

            // Update progress state
            setProgress({
              isRunning: progressData.status === "running",
              phase:
                progressData.status === "completed" ? "completed" : "scraping",
              message:
                progressData.message ||
                `Sincronizzazione in corso... ${progressData.percentage}%`,
              progress: progressData.percentage,
              ordersProcessed: progressData.itemsProcessed,
              totalOrders: progressData.itemsProcessed,
              error: progressData.error || null,
            });

            // Handle completion
            if (progressData.status === "completed") {
              eventSource.close();

              // Call completion callback
              if (onCompleted) {
                Promise.resolve(onCompleted()).catch((err) => {
                  console.error("Error in onCompleted callback:", err);
                });
              }

              resolve({
                success: true,
                data: { syncedCount: progressData.itemsProcessed },
              });
            }

            // Handle error
            if (progressData.status === "error") {
              eventSource.close();
              reject(
                new Error(
                  progressData.error || "Errore durante la sincronizzazione",
                ),
              );
            }
          };

          eventSource.onerror = (error) => {
            console.error("SSE error:", error);
            eventSource.close();
            reject(new Error("Errore di connessione al server"));
          };
        });
      } catch (err) {
        console.error("Sync error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Errore nella sincronizzazione";

        setProgress({
          isRunning: false,
          phase: "error",
          message: errorMessage,
          progress: 0,
          error: errorMessage,
        });

        return { success: false, error: errorMessage };
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setProgress({
      isRunning: false,
      phase: "idle",
      message: "",
      progress: 0,
      error: null,
    });
  }, []);

  return {
    progress,
    startSync,
    reset,
  };
}

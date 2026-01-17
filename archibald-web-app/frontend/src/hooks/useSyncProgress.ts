import { useState, useCallback } from "react";

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
    async (type: "sync" | "reset", token: string) => {
      setProgress({
        isRunning: true,
        phase: "starting",
        message: "Avvio sincronizzazione...",
        progress: 0,
        error: null,
      });

      try {
        // Phase 1: Starting
        setProgress((prev) => ({
          ...prev,
          phase: "connecting",
          message: "Connessione ad Archibald...",
          progress: 10,
        }));

        await new Promise((resolve) => setTimeout(resolve, 500));

        // Phase 2: Execute sync
        const endpoint =
          type === "reset" ? "/api/orders/reset-and-sync" : "/api/orders/force-sync";

        setProgress((prev) => ({
          ...prev,
          phase: "scraping",
          message:
            type === "reset"
              ? "Reset database in corso..."
              : "Lettura ordini da Archibald...",
          progress: 20,
        }));

        const syncResponse = await fetch(endpoint, {
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
          throw new Error(
            syncData.message || "Errore nella sincronizzazione degli ordini",
          );
        }

        setProgress((prev) => ({
          ...prev,
          phase: "processing",
          message: `Elaborazione completata: ${syncData.data?.syncedCount || 0} ordini`,
          progress: 60,
          ordersProcessed: syncData.data?.syncedCount,
          totalOrders: syncData.data?.syncedCount,
        }));

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Phase 3: Sync states
        setProgress((prev) => ({
          ...prev,
          phase: "syncing-states",
          message: "Sincronizzazione stati ordini...",
          progress: 75,
        }));

        const stateResponse = await fetch("/api/orders/sync-states?forceRefresh=true", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // State sync is best-effort, don't fail if it errors
        if (stateResponse.ok) {
          const stateData = await stateResponse.json();
          console.log("State sync result:", stateData);
        }

        setProgress((prev) => ({
          ...prev,
          phase: "finalizing",
          message: "Completamento sincronizzazione...",
          progress: 90,
        }));

        await new Promise((resolve) => setTimeout(resolve, 500));

        // Phase 4: Complete
        setProgress({
          isRunning: false,
          phase: "completed",
          message: `Sincronizzazione completata con successo! ${syncData.data?.syncedCount || 0} ordini sincronizzati.`,
          progress: 100,
          ordersProcessed: syncData.data?.syncedCount,
          totalOrders: syncData.data?.syncedCount,
          error: null,
        });

        return { success: true, data: syncData.data };
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

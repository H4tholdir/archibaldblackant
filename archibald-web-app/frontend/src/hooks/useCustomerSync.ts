import { useState, useCallback } from "react";
import { fetchWithRetry } from "../utils/fetch-with-retry";

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

  const startSync = useCallback(async (token: string) => {
    setProgress({
      isRunning: true,
      status: "syncing",
      message: "Sincronizzazione in corso...",
      customersProcessed: 0,
      currentPage: 0,
      totalPages: 0,
      error: null,
    });

    try {
      // API now returns results synchronously after completion
      const response = await fetchWithRetry("/api/customers/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Sessione scaduta. Effettua il login.");
        }
        if (response.status === 409) {
          throw new Error("Sincronizzazione già in corso.");
        }
        throw new Error(`Errore ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Errore nella sincronizzazione");
      }

      // Sync completed successfully
      const successMessage = `Completato: ${data.newCustomers || 0} nuovi, ${data.updatedCustomers || 0} modificati`;

      setProgress({
        isRunning: false,
        status: "completed",
        message: successMessage,
        customersProcessed: data.customersProcessed || 0,
        currentPage: 0,
        totalPages: 0,
        error: null,
      });

      return { success: true };
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

      return { success: false, error: errorMessage };
    }
  }, []);

  const reset = useCallback(() => {
    setProgress({
      isRunning: false,
      status: "idle",
      message: "",
      customersProcessed: 0,
      currentPage: 0,
      totalPages: 0,
      error: null,
    });
  }, []);

  return {
    progress,
    startSync,
    reset,
  };
}

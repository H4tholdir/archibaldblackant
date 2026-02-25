import { useState } from "react";
import { toastService } from "../services/toast.service";
import { enqueueOperation, type OperationType } from "../api/operations";

export function CacheRefreshButton() {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (!localStorage.getItem("archibald_jwt")) {
      toastService.warning("Devi effettuare il login per aggiornare i dati");
      return;
    }

    setRefreshing(true);

    try {
      const syncTypes: OperationType[] = [
        "sync-customers", "sync-orders", "sync-ddt",
        "sync-invoices", "sync-products", "sync-prices",
      ];
      await Promise.all(syncTypes.map((type) => enqueueOperation(type, {})));

      setTimeout(() => {
        setRefreshing(false);
      }, 2000);
    } catch (error: any) {
      console.error("Manual sync failed:", error);
      toastService.error(`Errore: ${error.message}`);
      setRefreshing(false);
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      className="cache-refresh-btn"
      style={{
        padding: "8px 16px",
        borderRadius: "4px",
        border: "1px solid #4caf50",
        backgroundColor: refreshing ? "#e0e0e0" : "#fff",
        color: "#4caf50",
        cursor: refreshing ? "not-allowed" : "pointer",
        fontWeight: 600,
      }}
    >
      {refreshing ? "⏳ Avviando..." : "🔄 Aggiorna dati"}
    </button>
  );
}

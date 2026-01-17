import { useState } from "react";

export function CacheRefreshButton() {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    const jwt = localStorage.getItem("archibald_jwt");
    if (!jwt) {
      alert("Devi effettuare il login per aggiornare i dati");
      return;
    }

    setRefreshing(true);

    try {
      // Trigger manual sync for all types (priority order)
      const response = await fetch("/api/sync/all", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Sync failed");
      }

      // Progress will be shown via UnifiedSyncProgress component (SSE)
      // Auto-hide button loading state after 2 seconds
      setTimeout(() => {
        setRefreshing(false);
      }, 2000);
    } catch (error: any) {
      console.error("Manual sync failed:", error);
      alert(`Errore: ${error.message}`);
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

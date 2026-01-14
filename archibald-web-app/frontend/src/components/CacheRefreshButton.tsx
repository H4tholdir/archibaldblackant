import { useState } from "react";
import { cachePopulationService } from "../services/cache-population";

export function CacheRefreshButton() {
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleRefresh() {
    const jwt = localStorage.getItem("archibald_jwt");
    if (!jwt) {
      alert("Devi effettuare il login per aggiornare i dati");
      return;
    }

    setRefreshing(true);

    const result = await cachePopulationService.populateCache(jwt, (prog) =>
      setProgress(prog.percentage),
    );

    setRefreshing(false);

    if (result.success) {
      alert(
        `Dati aggiornati: ${result.recordCounts?.customers} clienti, ${result.recordCounts?.products} prodotti`,
      );
    } else {
      alert(`Errore: ${result.error}`);
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
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
      {refreshing ? `Aggiornamento... ${progress}%` : "🔄 Aggiorna dati"}
    </button>
  );
}

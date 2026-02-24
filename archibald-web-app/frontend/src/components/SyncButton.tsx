import { useState } from "react";
import "../styles/SyncButton.css";
import { enqueueOperation, pollJobUntilDone, type OperationType } from "../api/operations";
import { fetchWithRetry } from "../utils/fetch-with-retry";

export default function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "checking" | "syncing" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const handleQuickSync = async () => {
    try {
      setSyncing(true);
      setStatus("checking");
      setMessage("Verifica...");

      const checkResponse = await fetchWithRetry("/api/sync/quick-check");
      if (!checkResponse.ok) throw new Error("Quick-check failed");
      const checkData = await checkResponse.json();

      if (!checkData.success || !checkData.data?.needsSync) {
        setStatus("success");
        setMessage("Già sincronizzato");
        setSyncing(false);
        setTimeout(() => {
          setStatus("idle");
          setMessage("");
        }, 3000);
        return;
      }

      setStatus("syncing");
      setMessage("Avvio sync...");

      const syncTypes: OperationType[] = [
        "sync-customers", "sync-orders", "sync-ddt",
        "sync-invoices", "sync-products", "sync-prices",
      ];

      const enqueueResults = await Promise.all(
        syncTypes.map((type) => enqueueOperation(type, {})),
      );

      setMessage("Sync in corso...");

      const jobIds = enqueueResults.map((r) => r.jobId);
      const results = await Promise.allSettled(
        jobIds.map((jobId) => pollJobUntilDone(jobId)),
      );

      const allFulfilled = results.every((r) => r.status === "fulfilled");

      if (allFulfilled) {
        setStatus("success");
        setMessage("Sincronizzazione completata");
      } else {
        setStatus("error");
        setMessage("Errore sincronizzazione");
      }

      setSyncing(false);

      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 5000);
    } catch (error) {
      console.error("Errore sync:", error);
      setStatus("error");
      setMessage("Errore");
      setSyncing(false);

      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 5000);
    }
  };

  return (
    <div className="sync-button-inline">
      <button
        className={`sync-btn ${status}`}
        onClick={handleQuickSync}
        disabled={syncing}
        title="Sincronizza clienti, prodotti e prezzi"
      >
        {status === "idle" && "🔄"}
        {status === "checking" && "🔍"}
        {status === "syncing" && "⏳"}
        {status === "success" && "✓"}
        {status === "error" && "✗"}
      </button>
      {message && <span className="sync-status-text">{message}</span>}
    </div>
  );
}

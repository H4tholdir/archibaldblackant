import { useState, useEffect, useRef } from "react";
import "../styles/SyncButton.css";
import { enqueueOperation, type OperationType } from "../api/operations";
import { fetchWithRetry } from "../utils/fetch-with-retry";

interface SyncProgress {
  status: "idle" | "syncing" | "completed" | "error";
  currentPage: number;
  totalPages: number;
  customersProcessed?: number;
  productsProcessed?: number;
  pricesProcessed?: number;
  message: string;
  error?: string;
}

export default function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "checking" | "syncing" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connetti al WebSocket per ricevere aggiornamenti sync
    const connectWebSocket = () => {
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/sync`);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("✅ SyncButton WebSocket connesso");
        };

        ws.onmessage = (event) => {
          try {
            const data: SyncProgress = JSON.parse(event.data);

            // Update progress based on sync status
            if (data.status === "syncing") {
              setStatus("syncing");
              const percentage =
                data.totalPages > 0
                  ? Math.round((data.currentPage / data.totalPages) * 100)
                  : 0;

              if (data.customersProcessed !== undefined) {
                setMessage(`Clienti: ${percentage}%`);
              } else if (data.productsProcessed !== undefined) {
                setMessage(`Prodotti: ${percentage}%`);
              } else if (data.pricesProcessed !== undefined) {
                setMessage(`Prezzi: ${percentage}%`);
              }
            } else if (data.status === "completed") {
              setStatus("success");
              setMessage("✓ Sincronizzazione completata");

              // Reset dopo 5 secondi
              setTimeout(() => {
                if (!syncing) {
                  setStatus("idle");
                  setMessage("");
                }
              }, 5000);
            } else if (data.status === "error") {
              setStatus("error");
              setMessage("✗ Errore sincronizzazione");
              setSyncing(false);

              setTimeout(() => {
                setStatus("idle");
                setMessage("");
              }, 5000);
            }
          } catch (error) {
            console.error("Errore parsing WebSocket message:", error);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
          console.log("🔌 SyncButton WebSocket disconnesso");
          wsRef.current = null;
          // Riconnetti dopo 5 secondi
          setTimeout(connectWebSocket, 5000);
        };
      } catch (error) {
        console.error("Errore connessione WebSocket:", error);
        setTimeout(connectWebSocket, 5000);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [syncing]);

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
      await Promise.all(syncTypes.map((type) => enqueueOperation(type, {})));

      setMessage("Sync in corso...");
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

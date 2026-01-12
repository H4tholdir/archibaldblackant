import { useState, useEffect, useRef } from "react";
import "../styles/SyncButton.css";

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
        const ws = new WebSocket("ws://localhost:3000/ws/sync");
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
      setMessage("Controllo...");

      // Quick check se serve sync
      const checkResponse = await fetch("/api/sync/quick-check");
      const checkData = await checkResponse.json();

      if (!checkData.success) {
        throw new Error(checkData.error || "Errore controllo sync");
      }

      if (checkData.data.needsSync) {
        // Avvia sync completo (clienti + prodotti + prezzi)
        setStatus("syncing");
        setMessage("Avvio sync...");

        const syncResponse = await fetch("/api/sync/full", { method: "POST" });
        const syncData = await syncResponse.json();

        if (!syncData.success) {
          throw new Error(syncData.error || "Errore sync");
        }

        // Il progresso sarà mostrato via WebSocket
        setMessage("Sync in corso (clienti, prodotti, prezzi)...");
      } else {
        // Già sincronizzato
        setStatus("success");
        setMessage(`✓ Sync OK`);
        setSyncing(false);

        setTimeout(() => {
          setStatus("idle");
          setMessage("");
        }, 3000);
      }
    } catch (error) {
      console.error("Errore sync:", error);
      setStatus("error");
      setMessage("✗ Errore");
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

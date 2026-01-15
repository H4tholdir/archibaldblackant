import { useState, useEffect, useRef } from "react";
import "../styles/SyncBars.css";

interface SyncProgress {
  status: "idle" | "syncing" | "completed" | "error";
  currentPage: number;
  totalPages: number;
  itemsProcessed: number;
  message: string;
  error?: string;
}

interface SyncState {
  customers: SyncProgress;
  products: SyncProgress;
  prices: SyncProgress;
  activeSyncType: "customers" | "products" | "prices" | null;
}

export default function SyncBars() {
  const [syncState, setSyncState] = useState<SyncState>({
    customers: {
      status: "idle",
      currentPage: 0,
      totalPages: 0,
      itemsProcessed: 0,
      message: "Pronto",
    },
    products: {
      status: "idle",
      currentPage: 0,
      totalPages: 0,
      itemsProcessed: 0,
      message: "Pronto",
    },
    prices: {
      status: "idle",
      currentPage: 0,
      totalPages: 0,
      itemsProcessed: 0,
      message: "Pronto",
    },
    activeSyncType: null,
  });

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connetti al WebSocket per ricevere aggiornamenti sync
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket("ws://localhost:3000/ws/sync");
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("✅ SyncBars WebSocket connesso");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Determina il tipo di sync dal messaggio
            let syncType: "customers" | "products" | "prices" | null = null;
            if (data.customersProcessed !== undefined) {
              syncType = "customers";
            } else if (data.productsProcessed !== undefined) {
              syncType = "products";
            } else if (data.pricesProcessed !== undefined) {
              syncType = "prices";
            }

            if (!syncType) {
              console.log("WebSocket message without sync type:", data);
              return;
            }

            const progress: SyncProgress = {
              status: data.status || "idle",
              currentPage: data.currentPage || 0,
              totalPages: data.totalPages || 0,
              itemsProcessed:
                data.customersProcessed ||
                data.productsProcessed ||
                data.pricesProcessed ||
                0,
              message: data.message || "",
              error: data.error,
            };

            setSyncState((prev) => {
              // Determina activeSyncType: solo se questo sync è "syncing"
              let newActiveSyncType = prev.activeSyncType;

              if (data.status === "syncing") {
                // Se sta sincronizzando, imposta come attivo
                newActiveSyncType = syncType;
              } else if (
                prev.activeSyncType === syncType &&
                (data.status === "completed" ||
                  data.status === "error" ||
                  data.status === "idle")
              ) {
                // Se questo sync era attivo ma ora è completato/errore/idle, resetta
                newActiveSyncType = null;
              }

              return {
                ...prev,
                [syncType]: progress,
                activeSyncType: newActiveSyncType,
              };
            });
          } catch (error) {
            console.error("Errore parsing WebSocket message:", error);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
          console.log("🔌 SyncBars WebSocket disconnesso");
          wsRef.current = null;
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
  }, []);

  const handleSync = async (type: "customers" | "products" | "prices") => {
    // Previeni sync multipli in parallelo
    if (syncState.activeSyncType) {
      alert(
        `Sincronizzazione ${syncState.activeSyncType === "customers" ? "clienti" : syncState.activeSyncType === "products" ? "prodotti" : "prezzi"} in corso. Attendi il completamento.`,
      );
      return;
    }

    try {
      // Get JWT token for admin authentication
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) {
        alert("Autenticazione richiesta. Effettua il login.");
        return;
      }

      const endpoint = `/api/sync/${type}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Errore avvio sincronizzazione");
      }

      // Il progresso sarà mostrato via WebSocket
      setSyncState((prev) => ({
        ...prev,
        activeSyncType: type,
      }));
    } catch (error) {
      console.error(`Errore sync ${type}:`, error);
      alert(
        `Errore avvio sincronizzazione ${type === "customers" ? "clienti" : type === "products" ? "prodotti" : "prezzi"}`,
      );
    }
  };

  const calculateProgress = (progress: SyncProgress): number => {
    if (progress.totalPages === 0) return 0;
    return Math.round((progress.currentPage / progress.totalPages) * 100);
  };

  const getStatusClass = (progress: SyncProgress): string => {
    if (progress.status === "error") return "error";
    if (progress.status === "completed") return "completed";
    if (progress.status === "syncing") return "syncing";
    return "idle";
  };

  return (
    <div className="sync-bars-container">
      {/* Barra Clienti - Verde */}
      <div
        className={`sync-bar customers ${getStatusClass(syncState.customers)} ${syncState.activeSyncType === "customers" ? "active" : ""} ${syncState.activeSyncType && syncState.activeSyncType !== "customers" ? "disabled" : ""}`}
        onClick={() => handleSync("customers")}
        title="Sincronizza clienti"
      >
        <div className="sync-bar-background">
          <div
            className="sync-bar-fill"
            style={{ width: `${calculateProgress(syncState.customers)}%` }}
          />
        </div>
        <div className="sync-bar-content">
          <span className="sync-bar-label">Clienti</span>
          <span className="sync-bar-info">
            {syncState.customers.status === "syncing"
              ? `${calculateProgress(syncState.customers)}% - ${syncState.customers.itemsProcessed} items`
              : syncState.customers.status === "completed"
                ? `✓ ${syncState.customers.itemsProcessed} clienti`
                : syncState.customers.status === "error"
                  ? "✗ Errore"
                  : "Clicca per avviare"}
          </span>
        </div>
      </div>

      {/* Barra Prodotti - Gialla */}
      <div
        className={`sync-bar products ${getStatusClass(syncState.products)} ${syncState.activeSyncType === "products" ? "active" : ""} ${syncState.activeSyncType && syncState.activeSyncType !== "products" ? "disabled" : ""}`}
        onClick={() => handleSync("products")}
        title="Sincronizza prodotti"
      >
        <div className="sync-bar-background">
          <div
            className="sync-bar-fill"
            style={{ width: `${calculateProgress(syncState.products)}%` }}
          />
        </div>
        <div className="sync-bar-content">
          <span className="sync-bar-label">Prodotti</span>
          <span className="sync-bar-info">
            {syncState.products.status === "syncing"
              ? `${calculateProgress(syncState.products)}% - ${syncState.products.itemsProcessed} items`
              : syncState.products.status === "completed"
                ? `✓ ${syncState.products.itemsProcessed} prodotti`
                : syncState.products.status === "error"
                  ? "✗ Errore"
                  : "Clicca per avviare"}
          </span>
        </div>
      </div>

      {/* Barra Prezzi - Rossa */}
      <div
        className={`sync-bar prices ${getStatusClass(syncState.prices)} ${syncState.activeSyncType === "prices" ? "active" : ""} ${syncState.activeSyncType && syncState.activeSyncType !== "prices" ? "disabled" : ""}`}
        onClick={() => handleSync("prices")}
        title="Sincronizza prezzi"
      >
        <div className="sync-bar-background">
          <div
            className="sync-bar-fill"
            style={{ width: `${calculateProgress(syncState.prices)}%` }}
          />
        </div>
        <div className="sync-bar-content">
          <span className="sync-bar-label">Prezzi</span>
          <span className="sync-bar-info">
            {syncState.prices.status === "syncing"
              ? `${calculateProgress(syncState.prices)}% - ${syncState.prices.itemsProcessed} items`
              : syncState.prices.status === "completed"
                ? `✓ ${syncState.prices.itemsProcessed} prezzi`
                : syncState.prices.status === "error"
                  ? "✗ Errore"
                  : "Clicca per avviare"}
          </span>
        </div>
      </div>
    </div>
  );
}

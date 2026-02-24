import { useState } from "react";
import "../styles/SyncBars.css";
import {
  enqueueOperation,
  pollJobUntilDone,
  type OperationType,
} from "../api/operations";

type SyncType = "customers" | "products" | "prices";

interface SyncProgress {
  status: "idle" | "syncing" | "completed" | "error";
  progressPercent: number;
  itemsProcessed: number;
  message: string;
  error?: string;
}

interface SyncState {
  customers: SyncProgress;
  products: SyncProgress;
  prices: SyncProgress;
  activeSyncType: SyncType | null;
}

const RESULT_KEYS: Record<SyncType, string> = {
  customers: "customersProcessed",
  products: "productsProcessed",
  prices: "pricesProcessed",
};

const LABELS: Record<SyncType, string> = {
  customers: "clienti",
  products: "prodotti",
  prices: "prezzi",
};

const DEFAULT_PROGRESS: SyncProgress = {
  status: "idle",
  progressPercent: 0,
  itemsProcessed: 0,
  message: "Pronto",
};

export default function SyncBars() {
  const [syncState, setSyncState] = useState<SyncState>({
    customers: { ...DEFAULT_PROGRESS },
    products: { ...DEFAULT_PROGRESS },
    prices: { ...DEFAULT_PROGRESS },
    activeSyncType: null,
  });

  const handleSync = async (type: SyncType) => {
    if (syncState.activeSyncType) {
      alert(
        `Sincronizzazione ${LABELS[syncState.activeSyncType]} in corso. Attendi il completamento.`,
      );
      return;
    }

    if (!localStorage.getItem("archibald_jwt")) {
      alert("Autenticazione richiesta. Effettua il login.");
      return;
    }

    try {
      const { jobId } = await enqueueOperation(
        `sync-${type}` as OperationType,
        {},
      );

      setSyncState((prev) => ({
        ...prev,
        activeSyncType: type,
        [type]: {
          status: "syncing" as const,
          progressPercent: 0,
          itemsProcessed: 0,
          message: "Avvio sincronizzazione...",
        },
      }));

      const result = await pollJobUntilDone(jobId, {
        onProgress: (progress) => {
          setSyncState((prev) => ({
            ...prev,
            [type]: {
              ...prev[type],
              status: "syncing" as const,
              progressPercent: progress,
              message: `Sincronizzazione ${LABELS[type]}...`,
            },
          }));
        },
      });

      const count = (result[RESULT_KEYS[type]] as number) ?? 0;

      setSyncState((prev) => ({
        ...prev,
        activeSyncType: null,
        [type]: {
          status: "completed" as const,
          progressPercent: 100,
          itemsProcessed: count,
          message: `Completato: ${count} ${LABELS[type]}`,
        },
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";

      setSyncState((prev) => ({
        ...prev,
        activeSyncType: null,
        [type]: {
          status: "error" as const,
          progressPercent: 0,
          itemsProcessed: 0,
          message: "Errore",
          error: errorMessage,
        },
      }));
    }
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
            style={{ width: `${syncState.customers.progressPercent}%` }}
          />
        </div>
        <div className="sync-bar-content">
          <span className="sync-bar-label">Clienti</span>
          <span className="sync-bar-info">
            {syncState.customers.status === "syncing"
              ? `${syncState.customers.progressPercent}% - ${syncState.customers.message}`
              : syncState.customers.status === "completed"
                ? `\u2713 ${syncState.customers.itemsProcessed} clienti`
                : syncState.customers.status === "error"
                  ? "\u2717 Errore"
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
            style={{ width: `${syncState.products.progressPercent}%` }}
          />
        </div>
        <div className="sync-bar-content">
          <span className="sync-bar-label">Prodotti</span>
          <span className="sync-bar-info">
            {syncState.products.status === "syncing"
              ? `${syncState.products.progressPercent}% - ${syncState.products.message}`
              : syncState.products.status === "completed"
                ? `\u2713 ${syncState.products.itemsProcessed} prodotti`
                : syncState.products.status === "error"
                  ? "\u2717 Errore"
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
            style={{ width: `${syncState.prices.progressPercent}%` }}
          />
        </div>
        <div className="sync-bar-content">
          <span className="sync-bar-label">Prezzi</span>
          <span className="sync-bar-info">
            {syncState.prices.status === "syncing"
              ? `${syncState.prices.progressPercent}% - ${syncState.prices.message}`
              : syncState.prices.status === "completed"
                ? `\u2713 ${syncState.prices.itemsProcessed} prezzi`
                : syncState.prices.status === "error"
                  ? "\u2717 Errore"
                  : "Clicca per avviare"}
          </span>
        </div>
      </div>
    </div>
  );
}

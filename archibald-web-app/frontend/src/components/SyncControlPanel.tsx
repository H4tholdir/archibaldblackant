import { useState, useEffect, useCallback } from "react";
import { fresisHistoryService } from "../services/fresis-history.service";

type SyncType =
  | "customers"
  | "products"
  | "prices"
  | "orders"
  | "ddt"
  | "invoices";

interface SyncStatus {
  type: SyncType;
  isRunning: boolean;
  lastRunTime: string | null;
  queuePosition: number | null;
}

interface OrchestratorStatus {
  currentSync: SyncType | null;
  queue: Array<{ type: SyncType; priority: number; requestedAt: string }>;
  statuses: Record<SyncType, SyncStatus>;
  smartCustomerSyncActive: boolean;
  sessionCount: number;
  safetyTimeoutActive: boolean;
}

interface SyncSection {
  type: SyncType;
  label: string;
  icon: string;
  priority: number;
}

const syncSections: SyncSection[] = [
  { type: "orders", label: "Ordini", icon: "📦", priority: 6 },
  { type: "customers", label: "Clienti", icon: "👥", priority: 5 },
  { type: "ddt", label: "DDT", icon: "🚚", priority: 4 },
  { type: "invoices", label: "Fatture", icon: "📄", priority: 3 },
  { type: "products", label: "Prodotti", icon: "🏷️", priority: 2 },
  { type: "prices", label: "Prezzi", icon: "💰", priority: 1 },
];

export default function SyncControlPanel() {
  const [status, setStatus] = useState<OrchestratorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<SyncType, boolean>>({
    customers: false,
    products: false,
    prices: false,
    orders: false,
    ddt: false,
    invoices: false,
  });
  const [syncingAll, setSyncingAll] = useState(false);
  const [deletingDb, setDeletingDb] = useState<Record<SyncType, boolean>>({
    customers: false,
    products: false,
    prices: false,
    orders: false,
    ddt: false,
    invoices: false,
  });
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean | null>(null);
  const [fresisLifecycleSyncing, setFresisLifecycleSyncing] = useState(false);
  const [fresisLastSync, setFresisLastSync] = useState<string | null>(null);

  const fetchFresisLastSync = useCallback(async () => {
    const lastSync = await fresisHistoryService.getLastSyncTime();
    setFresisLastSync(lastSync);
  }, []);

  const handleFresisLifecycleSync = async () => {
    setFresisLifecycleSyncing(true);
    try {
      await fresisHistoryService.syncOrderLifecycles();
      await fetchFresisLastSync();
    } catch (error) {
      console.error("Fresis lifecycle sync failed:", error);
      alert("Errore durante sync stati Fresis");
    } finally {
      setFresisLifecycleSyncing(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchStatus();
    fetchAutoSyncStatus();
    fetchFresisLastSync();

    // Poll every 5s during active syncs
    const interval = setInterval(() => {
      fetchStatus();
      fetchAutoSyncStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) return;

      const response = await fetch("/api/sync/status", {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const data = await response.json();
      if (data.success) {
        setStatus(data.status);

        // Update syncing states based on orchestrator status
        const newSyncing: Record<SyncType, boolean> = {
          customers: false,
          products: false,
          prices: false,
          orders: false,
          ddt: false,
          invoices: false,
        };

        if (data.status.currentSync) {
          newSyncing[data.status.currentSync as SyncType] = true;
        }

        setSyncing(newSyncing);
      }
    } catch (error) {
      console.error("Error fetching sync status:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAutoSyncStatus = async () => {
    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) return;

      const response = await fetch("/api/sync/auto-sync/status", {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const data = await response.json();
      if (data.success) {
        setAutoSyncEnabled(data.isRunning);
      }
    } catch (error) {
      console.error("Failed to fetch auto-sync status:", error);
    }
  };

  const toggleAutoSync = async () => {
    const jwt = localStorage.getItem("archibald_jwt");
    if (!jwt) {
      alert("Devi effettuare il login");
      return;
    }

    const endpoint = autoSyncEnabled ? "stop" : "start";
    try {
      const response = await fetch(`/api/sync/auto-sync/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const data = await response.json();
      if (data.success) {
        setAutoSyncEnabled(!autoSyncEnabled);
      } else {
        alert(`Errore: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to toggle auto-sync:", error);
      alert("Errore durante il cambio dello stato auto-sync");
    }
  };

  const handleSyncIndividual = async (type: SyncType) => {
    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) {
        alert("Devi effettuare il login");
        return;
      }

      setSyncing((prev) => ({ ...prev, [type]: true }));

      const response = await fetch(`/api/sync/${type}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const data = await response.json();

      if (!data.success) {
        alert(`Errore sync ${type}: ${data.error}`);
      } else {
        // Refresh status immediately
        fetchStatus();
      }
    } catch (error) {
      console.error(`Error syncing ${type}:`, error);
      alert(`Errore durante sync ${type}`);
    }
  };

  const handleSyncAll = async () => {
    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) {
        alert("Devi effettuare il login");
        return;
      }

      setSyncingAll(true);

      const response = await fetch("/api/sync/all", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const data = await response.json();

      if (!data.success) {
        alert(`Errore sync all: ${data.error}`);
      } else {
        // Refresh status immediately
        fetchStatus();
      }
    } catch (error) {
      console.error("Error syncing all:", error);
      alert("Errore durante sync generale");
    } finally {
      setSyncingAll(false);
    }
  };

  const handleDeleteDb = async (type: SyncType) => {
    const confirmDelete = window.confirm(
      `⚠️ ATTENZIONE: Stai per cancellare il database ${type}.\n\n` +
        `Tutti i dati verranno eliminati e dovrai rifare una sync completa.\n\n` +
        `Sei sicuro di voler procedere?`,
    );

    if (!confirmDelete) return;

    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) {
        alert("Devi effettuare il login");
        return;
      }

      setDeletingDb((prev) => ({ ...prev, [type]: true }));

      const response = await fetch(`/api/sync/${type}/clear-db`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const data = await response.json();

      if (!data.success) {
        alert(`Errore cancellazione DB ${type}: ${data.error}`);
      } else {
        alert(
          `✅ Database ${type} cancellato con successo!\n\nEsegui ora una sync completa.`,
        );
        fetchStatus();
      }
    } catch (error) {
      console.error(`Error deleting ${type} database:`, error);
      alert(`Errore durante cancellazione DB ${type}`);
    } finally {
      setDeletingDb((prev) => ({ ...prev, [type]: false }));
    }
  };

  const getStatusBadge = (syncType: SyncType) => {
    if (!status) return { bg: "#9e9e9e", color: "#fff", text: "N/A" };

    const syncStatus = status.statuses[syncType];

    if (syncStatus.isRunning) {
      return { bg: "#ff9800", color: "#fff", text: "Running" };
    }

    if (syncStatus.queuePosition !== null) {
      return {
        bg: "#2196f3",
        color: "#fff",
        text: `Queue #${syncStatus.queuePosition}`,
      };
    }

    if (syncStatus.lastRunTime) {
      return { bg: "#4caf50", color: "#fff", text: "Idle" };
    }

    return { bg: "#9e9e9e", color: "#fff", text: "Never run" };
  };

  const getHealthIndicator = (syncType: SyncType) => {
    if (!status) return "🟢";

    const syncStatus = status.statuses[syncType];

    if (syncStatus.isRunning) {
      return "🟡"; // Running
    }

    if (syncStatus.lastRunTime) {
      const lastRun = new Date(syncStatus.lastRunTime);
      const now = new Date();
      const hoursSinceLastRun =
        (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

      // Health thresholds based on sync type priority
      const thresholds: Record<SyncType, number> = {
        orders: 1, // 1 hour
        customers: 2, // 2 hours
        ddt: 3, // 3 hours
        invoices: 3, // 3 hours
        prices: 4, // 4 hours
        products: 8, // 8 hours
      };

      if (hoursSinceLastRun > thresholds[syncType]) {
        return "🔴"; // Degraded (too long since last sync)
      }

      return "🟢"; // Healthy
    }

    return "⚪"; // Never run
  };

  const formatLastSync = (lastRunTime: string | null) => {
    if (!lastRunTime) return "Mai sincronizzato";

    const date = new Date(lastRunTime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return "Appena ora";
    if (diffMins < 60) return `${diffMins} min fa`;
    if (diffHours < 24) return `${diffHours}h fa`;

    return date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Caricamento stato sync...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div
        style={{
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h2
            style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: 600 }}
          >
            🔄 Sync Control Panel
          </h2>
          <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>
            Gestione centralizzata sincronizzazioni Archibald ERP
          </p>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncingAll || status?.currentSync !== null}
          style={{
            padding: "12px 24px",
            fontSize: "16px",
            fontWeight: 600,
            backgroundColor:
              syncingAll || status?.currentSync !== null
                ? "#9e9e9e"
                : "#2196f3",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor:
              syncingAll || status?.currentSync !== null
                ? "not-allowed"
                : "pointer",
            transition: "all 0.2s",
          }}
        >
          {syncingAll ? "⏳ Sync in corso..." : "🔄 Sync All"}
        </button>
      </div>

      <div
        style={{
          padding: "16px",
          backgroundColor: autoSyncEnabled ? "#e8f5e9" : "#fff3e0",
          borderRadius: "8px",
          marginBottom: "20px",
          border: `2px solid ${autoSyncEnabled ? "#4caf50" : "#ff9800"}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
              🤖 Sync Automatico{" "}
              {autoSyncEnabled ? "(Attivo)" : "(Disattivato)"}
            </h3>
            <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "#666" }}>
              {autoSyncEnabled
                ? "I sync vengono eseguiti automaticamente in background con intervalli configurati"
                : "Attiva il sync automatico per eseguire sync in background senza intervento manuale"}
            </p>
          </div>
          <button
            onClick={toggleAutoSync}
            disabled={autoSyncEnabled === null}
            style={{
              padding: "10px 20px",
              backgroundColor: autoSyncEnabled ? "#f44336" : "#4caf50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: autoSyncEnabled === null ? "not-allowed" : "pointer",
              fontWeight: 600,
              opacity: autoSyncEnabled === null ? 0.6 : 1,
            }}
          >
            {autoSyncEnabled ? "⏸️ Disattiva" : "▶️ Attiva"}
          </button>
        </div>
      </div>

      {status?.smartCustomerSyncActive && (
        <div
          style={{
            marginBottom: "20px",
            padding: "12px 16px",
            backgroundColor: "#e3f2fd",
            border: "1px solid #2196f3",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "20px" }}>⚡</span>
          <div>
            <strong>Smart Customer Sync attivo</strong>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#666" }}>
              Altri sync in pausa. Sessioni attive: {status.sessionCount}
              {status.safetyTimeoutActive && " | Timeout sicurezza: 10 min"}
            </p>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
          gap: "20px",
        }}
      >
        {syncSections.map((section) => {
          const syncStatus = status?.statuses[section.type];
          const statusBadge = getStatusBadge(section.type);
          const healthIndicator = getHealthIndicator(section.type);

          return (
            <div
              key={section.type}
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "20px",
                backgroundColor: "#fff",
                boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <span style={{ fontSize: "28px" }}>{section.icon}</span>
                <div style={{ flex: 1 }}>
                  <h3
                    style={{
                      margin: "0 0 4px 0",
                      fontSize: "18px",
                      fontWeight: 600,
                    }}
                  >
                    {section.label}
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        backgroundColor: statusBadge.bg,
                        color: statusBadge.color,
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      {statusBadge.text}
                    </span>
                    <span title="Health indicator">{healthIndicator}</span>
                  </div>
                </div>
              </div>

              <div
                style={{ display: "flex", gap: "8px", marginBottom: "16px" }}
              >
                <button
                  onClick={() => handleSyncIndividual(section.type)}
                  disabled={
                    syncing[section.type] || status?.currentSync !== null
                  }
                  style={{
                    flex: 1,
                    padding: "10px",
                    fontSize: "14px",
                    fontWeight: 600,
                    backgroundColor:
                      syncing[section.type] || status?.currentSync !== null
                        ? "#9e9e9e"
                        : "#4caf50",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor:
                      syncing[section.type] || status?.currentSync !== null
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {syncing[section.type]
                    ? "⏳ Syncing..."
                    : "▶️ Avvia Full Sync"}
                </button>
                <button
                  onClick={() => handleDeleteDb(section.type)}
                  disabled={
                    deletingDb[section.type] ||
                    syncing[section.type] ||
                    status?.currentSync !== null
                  }
                  title="Cancella database e ricrea da zero"
                  style={{
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: 600,
                    backgroundColor:
                      deletingDb[section.type] ||
                      syncing[section.type] ||
                      status?.currentSync !== null
                        ? "#9e9e9e"
                        : "#f44336",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor:
                      deletingDb[section.type] ||
                      syncing[section.type] ||
                      status?.currentSync !== null
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {deletingDb[section.type] ? "⏳" : "🗑️"}
                </button>
              </div>

              <div style={{ fontSize: "12px", color: "#666" }}>
                <div style={{ marginBottom: "4px" }}>
                  <strong>Ultima sync:</strong>{" "}
                  {formatLastSync(syncStatus?.lastRunTime || null)}
                </div>
                <div>
                  <strong>Priorità:</strong> {section.priority}/6
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Frontend Sync Section */}
      <div
        style={{
          marginTop: "24px",
          padding: "16px",
          backgroundColor: "#fffbeb",
          border: "2px solid #f59e0b",
          borderRadius: "8px",
        }}
      >
        <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: 600 }}>
          Sync Frontend
        </h3>
        <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#666" }}>
          Sync eseguiti direttamente dal browser (IndexedDB)
        </p>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "16px",
            backgroundColor: "#fff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "28px" }}>{"🔄"}</span>
            <div>
              <h4
                style={{
                  margin: "0 0 4px 0",
                  fontSize: "16px",
                  fontWeight: 600,
                }}
              >
                Stati Fresis (Lifecycle)
              </h4>
              <div style={{ fontSize: "12px", color: "#666" }}>
                <strong>Ultimo sync:</strong> {formatLastSync(fresisLastSync)}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Auto: ogni 30 min + eventi online/visibility
              </div>
            </div>
          </div>
          <button
            onClick={handleFresisLifecycleSync}
            disabled={fresisLifecycleSyncing}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              backgroundColor: fresisLifecycleSyncing ? "#9e9e9e" : "#f59e0b",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: fresisLifecycleSyncing ? "not-allowed" : "pointer",
            }}
          >
            {fresisLifecycleSyncing
              ? "Aggiornamento..."
              : "Aggiorna Stati Fresis"}
          </button>
        </div>
      </div>

      {status && status.queue.length > 0 && (
        <div
          style={{
            marginTop: "24px",
            padding: "16px",
            backgroundColor: "#fff3e0",
            border: "1px solid #ff9800",
            borderRadius: "8px",
          }}
        >
          <h3
            style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: 600 }}
          >
            📋 Coda Sync ({status.queue.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {status.queue.map((item, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  backgroundColor: "#fff",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              >
                <span>
                  <strong>#{index + 1}</strong> {item.type}
                </span>
                <span style={{ color: "#666" }}>
                  Priorità: {item.priority} | Richiesto:{" "}
                  {new Date(item.requestedAt).toLocaleTimeString("it-IT")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { enqueueOperation, type OperationType } from "../api/operations";
import { fetchWithRetry } from "../utils/fetch-with-retry";

type SyncType =
  | "customers"
  | "products"
  | "prices"
  | "orders"
  | "ddt"
  | "invoices";

type QueueStats = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
};

type ActiveJob = {
  userId: string;
  jobId: string;
  type: string;
};

type DashboardState = {
  queue: QueueStats;
  activeJobs: ActiveJob[];
  scheduler: { running: boolean; intervals: { agentSyncMs: number; sharedSyncMs: number } };
};

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
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
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

  useEffect(() => {
    fetchStatus();
    fetchAutoSyncStatus();

    const interval = setInterval(() => {
      fetchStatus();
      fetchAutoSyncStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetchWithRetry("/api/sync/monitoring/status");
      const data = await response.json();
      if (data.success) {
        setDashboard(data);

        const newSyncing: Record<SyncType, boolean> = {
          customers: false, products: false, prices: false,
          orders: false, ddt: false, invoices: false,
        };

        for (const job of (data.activeJobs || [])) {
          const syncType = job.type.replace('sync-', '') as SyncType;
          if (syncType in newSyncing) {
            newSyncing[syncType] = true;
          }
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
      const response = await fetchWithRetry("/api/sync/auto-sync/status");
      const data = await response.json();
      if (data.success) {
        setAutoSyncEnabled(data.running);
      }
    } catch (error) {
      console.error("Failed to fetch auto-sync status:", error);
    }
  };

  const toggleAutoSync = async () => {
    const endpoint = autoSyncEnabled ? "stop" : "start";
    try {
      const response = await fetchWithRetry(`/api/sync/auto-sync/${endpoint}`, {
        method: "POST",
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
      setSyncing((prev) => ({ ...prev, [type]: true }));
      await enqueueOperation(`sync-${type}` as OperationType, {});
      fetchStatus();
    } catch (error) {
      console.error(`Error syncing ${type}:`, error);
      alert(`Errore durante sync ${type}`);
    }
  };

  const handleSyncAll = async () => {
    try {
      setSyncingAll(true);

      const syncTypes: SyncType[] = ["customers", "orders", "ddt", "invoices", "products", "prices"];
      await Promise.all(
        syncTypes.map((type) => enqueueOperation(`sync-${type}` as OperationType, {})),
      );

      fetchStatus();
    } catch (error) {
      console.error("Error syncing all:", error);
      alert("Errore durante sync generale");
    } finally {
      setSyncingAll(false);
    }
  };

  const handleDeleteDb = async (type: SyncType) => {
    const confirmDelete = window.confirm(
      `ATTENZIONE: Stai per cancellare il database ${type}.\n\n` +
        `Tutti i dati verranno eliminati e dovrai rifare una sync completa.\n\n` +
        `Sei sicuro di voler procedere?`,
    );

    if (!confirmDelete) return;

    try {
      setDeletingDb((prev) => ({ ...prev, [type]: true }));

      const response = await fetchWithRetry(`/api/sync/${type}/clear-db`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!data.success) {
        alert(`Errore cancellazione DB ${type}: ${data.error}`);
      } else {
        alert(
          `Database ${type} cancellato con successo!\n\nEsegui ora una sync completa.`,
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

  const isSyncActive = (syncType: SyncType) => {
    if (!dashboard) return false;
    return dashboard.activeJobs.some((j) => j.type === `sync-${syncType}`);
  };

  const hasAnyActiveSync = () => {
    if (!dashboard) return false;
    return dashboard.activeJobs.some((j) => j.type.startsWith('sync-'));
  };

  const getStatusBadge = (syncType: SyncType) => {
    if (!dashboard) return { bg: "#9e9e9e", color: "#fff", text: "N/A" };

    if (isSyncActive(syncType)) {
      return { bg: "#ff9800", color: "#fff", text: "Running" };
    }

    if (dashboard.queue.waiting > 0) {
      return { bg: "#2196f3", color: "#fff", text: "In coda" };
    }

    return { bg: "#4caf50", color: "#fff", text: "Idle" };
  };

  const getHealthIndicator = (syncType: SyncType) => {
    if (!dashboard) return "";

    if (isSyncActive(syncType)) {
      return ""; // Running
    }

    return ""; // Idle
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
          disabled={syncingAll || hasAnyActiveSync()}
          style={{
            padding: "12px 24px",
            fontSize: "16px",
            fontWeight: 600,
            backgroundColor:
              syncingAll || hasAnyActiveSync()
                ? "#9e9e9e"
                : "#2196f3",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor:
              syncingAll || hasAnyActiveSync()
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
          gap: "20px",
        }}
      >
        {syncSections.map((section) => {
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
                    syncing[section.type] || hasAnyActiveSync()
                  }
                  style={{
                    flex: 1,
                    padding: "10px",
                    fontSize: "14px",
                    fontWeight: 600,
                    backgroundColor:
                      syncing[section.type] || hasAnyActiveSync()
                        ? "#9e9e9e"
                        : "#4caf50",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor:
                      syncing[section.type] || hasAnyActiveSync()
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
                    hasAnyActiveSync()
                  }
                  title="Cancella database e ricrea da zero"
                  style={{
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: 600,
                    backgroundColor:
                      deletingDb[section.type] ||
                      syncing[section.type] ||
                      hasAnyActiveSync()
                        ? "#9e9e9e"
                        : "#f44336",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor:
                      deletingDb[section.type] ||
                      syncing[section.type] ||
                      hasAnyActiveSync()
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {deletingDb[section.type] ? "⏳" : "🗑️"}
                </button>
              </div>

              <div style={{ fontSize: "12px", color: "#666" }}>
                <div>
                  <strong>Priorità:</strong> {section.priority}/6
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {dashboard && (dashboard.queue.waiting > 0 || dashboard.activeJobs.length > 0) && (
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
            Coda Operazioni (attivi: {dashboard.activeJobs.length}, in attesa: {dashboard.queue.waiting})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {dashboard.activeJobs.map((job) => (
              <div
                key={job.jobId}
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
                  <strong>{job.type}</strong>
                </span>
                <span style={{ color: "#666" }}>
                  User: {job.userId} | Job: {job.jobId}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

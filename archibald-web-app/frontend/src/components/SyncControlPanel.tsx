import { useState, useEffect, useCallback, useRef } from "react";
import { enqueueOperation, type OperationType } from "../api/operations";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { useWebSocketContext } from "../contexts/WebSocketContext";

type SyncType =
  | "customers"
  | "products"
  | "prices"
  | "orders"
  | "ddt"
  | "invoices"
  | "order-articles";

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
  scheduler: { running: boolean; intervals: { agentSyncMs: number; sharedSyncMs: number }; sessionCount: number };
};

interface SyncSection {
  type: SyncType;
  label: string;
  icon: string;
  priority: number;
}

const syncSections: SyncSection[] = [
  { type: "orders", label: "Ordini", icon: "📦", priority: 7 },
  { type: "customers", label: "Clienti", icon: "👥", priority: 6 },
  { type: "ddt", label: "DDT", icon: "🚚", priority: 5 },
  { type: "invoices", label: "Fatture", icon: "📄", priority: 4 },
  { type: "products", label: "Prodotti", icon: "🏷️", priority: 3 },
  { type: "prices", label: "Prezzi", icon: "💰", priority: 2 },
  { type: "order-articles", label: "Articoli Ordini", icon: "📋", priority: 1 },
];

const ALL_SYNC_TYPES: SyncType[] = ["customers", "orders", "ddt", "invoices", "products", "prices", "order-articles"];

function formatLastSync(iso: string | null, isLoading: boolean): string {
  if (isLoading) return "...";
  if (!iso) return "Mai";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Ora";
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h fa`;
  return d.toLocaleDateString("it-IT");
}

function getHealthColor(iso: string | null, isLoading: boolean): string {
  if (isLoading) return "#9e9e9e";
  if (!iso) return "#f44336";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 1) return "#4caf50";
  if (diffH < 6) return "#ff9800";
  return "#f44336";
}

export default function SyncControlPanel() {
  const { subscribe, state: wsState } = useWebSocketContext();

  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSyncTimes, setLastSyncTimes] = useState<Record<string, string | null>>({});
  const [lastSyncTimesLoaded, setLastSyncTimesLoaded] = useState(false);
  const [syncing, setSyncing] = useState<Record<SyncType, boolean>>({
    customers: false, products: false, prices: false,
    orders: false, ddt: false, invoices: false,
    "order-articles": false,
  });
  const [syncingAll, setSyncingAll] = useState(false);
  const [enqueuedTypes, setEnqueuedTypes] = useState<Set<SyncType>>(new Set());
  const [deletingDb, setDeletingDb] = useState<Record<SyncType, boolean>>({
    customers: false, products: false, prices: false,
    orders: false, ddt: false, invoices: false,
    "order-articles": false,
  });
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean | null>(null);
  const [togglingAutoSync, setTogglingAutoSync] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const consecutiveErrorsRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    try {
      const [statusResponse, syncHistoryRes] = await Promise.all([
        fetchWithRetry("/api/sync/monitoring/status"),
        fetchWithRetry("/api/sync/monitoring/sync-history").catch(() => null),
      ]);
      const data = await statusResponse.json();
      if (data.success) {
        setDashboard(data);

        const activeTypes = new Set<string>();
        for (const job of (data.activeJobs || [])) {
          const syncType = job.type.replace('sync-', '');
          activeTypes.add(syncType);
        }

        setSyncing((prev) => {
          const next = { ...prev };
          for (const t of ALL_SYNC_TYPES) {
            next[t] = activeTypes.has(t);
          }
          return next;
        });

        setEnqueuedTypes((prev) => {
          const next = new Set(prev);
          for (const t of activeTypes) {
            next.delete(t as SyncType);
          }
          return next;
        });
      }

      const syncHistory = syncHistoryRes ? await syncHistoryRes.json().catch(() => null) : null;
      if (syncHistory?.success && syncHistory.types) {
        const newTimes: Record<string, string | null> = {};
        for (const [syncType, typeData] of Object.entries(syncHistory.types)) {
          const type = syncType.replace('sync-', '');
          newTimes[type] = (typeData as { lastRunTime: string | null }).lastRunTime;
        }
        setLastSyncTimes(newTimes);
        setLastSyncTimesLoaded(true);
      }

      consecutiveErrorsRef.current = 0;
      setFetchError(false);
    } catch (error) {
      console.error("Error fetching sync status:", error);
      consecutiveErrorsRef.current++;
      if (consecutiveErrorsRef.current >= 3) {
        setFetchError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAutoSyncStatus = useCallback(async () => {
    try {
      const response = await fetchWithRetry("/api/sync/auto-sync/status");
      const data = await response.json();
      if (data.success) {
        setAutoSyncEnabled(data.running);
      }
    } catch (error) {
      console.error("Failed to fetch auto-sync status:", error);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchAutoSyncStatus();
  }, [fetchStatus, fetchAutoSyncStatus]);

  useEffect(() => {
    const pollMs = wsState === "connected" ? 30000 : 5000;
    const interval = setInterval(() => {
      fetchStatus();
      fetchAutoSyncStatus();
    }, pollMs);
    return () => clearInterval(interval);
  }, [wsState, fetchStatus, fetchAutoSyncStatus]);

  useEffect(() => {
    const unsubs = [
      subscribe("JOB_STARTED", () => { fetchStatus(); }),
      subscribe("JOB_COMPLETED", () => { fetchStatus(); }),
      subscribe("JOB_FAILED", () => { fetchStatus(); }),
    ];
    return () => { unsubs.forEach((u) => u()); };
  }, [subscribe, fetchStatus]);

  const toggleAutoSync = async () => {
    const wasEnabled = autoSyncEnabled;
    const endpoint = wasEnabled ? "stop" : "start";
    setTogglingAutoSync(true);
    setAutoSyncEnabled(!wasEnabled);
    try {
      const response = await fetchWithRetry(`/api/sync/auto-sync/${endpoint}`, {
        method: "POST",
      });
      const data = await response.json();
      if (!data.success) {
        setAutoSyncEnabled(wasEnabled);
        alert(`Errore: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to toggle auto-sync:", error);
      setAutoSyncEnabled(wasEnabled);
      alert("Errore durante il cambio dello stato auto-sync");
    } finally {
      setTogglingAutoSync(false);
    }
  };

  const handleSyncIndividual = async (type: SyncType) => {
    setSyncing((prev) => ({ ...prev, [type]: true }));
    setEnqueuedTypes((prev) => new Set(prev).add(type));
    try {
      await enqueueOperation(`sync-${type}` as OperationType, {});
      fetchStatus();
    } catch (error) {
      console.error(`Error syncing ${type}:`, error);
      setSyncing((prev) => ({ ...prev, [type]: false }));
      setEnqueuedTypes((prev) => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
      alert(`Errore durante sync ${type}`);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setEnqueuedTypes(new Set(ALL_SYNC_TYPES));
    try {
      const results = await Promise.allSettled(
        ALL_SYNC_TYPES.map((type) => enqueueOperation(`sync-${type}` as OperationType, {})),
      );

      const failedTypes = new Set<SyncType>();
      results.forEach((r, i) => {
        if (r.status === "rejected") failedTypes.add(ALL_SYNC_TYPES[i]);
      });

      if (failedTypes.size > 0) {
        setEnqueuedTypes((prev) => {
          const next = new Set(prev);
          for (const t of failedTypes) next.delete(t);
          return next;
        });
        alert(`${failedTypes.size} sync su ${ALL_SYNC_TYPES.length} non sono stati avviati.`);
      }

      fetchStatus();
    } catch (error) {
      console.error("Error syncing all:", error);
      setEnqueuedTypes(new Set());
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

  const isAnySyncBusy = () => {
    if (syncingAll) return true;
    if (!dashboard) return false;
    return dashboard.activeJobs.some((j) => j.type.startsWith('sync-'));
  };

  const getStatusBadge = (syncType: SyncType) => {
    if (!dashboard) return { bg: "#9e9e9e", color: "#fff", text: "N/A" };

    if (isSyncActive(syncType)) {
      return { bg: "#ff9800", color: "#fff", text: "Running" };
    }

    if (syncing[syncType] || enqueuedTypes.has(syncType)) {
      return { bg: "#2196f3", color: "#fff", text: "In coda" };
    }

    return { bg: "#4caf50", color: "#fff", text: "Idle" };
  };

  const getHealthIndicator = (syncType: SyncType) => {
    if (!dashboard) return { color: "#9e9e9e", label: "" };

    if (isSyncActive(syncType)) {
      return { color: "#ff9800", label: "In esecuzione" };
    }

    const lastSync = lastSyncTimes[syncType] ?? null;
    const color = getHealthColor(lastSync, !lastSyncTimesLoaded);
    return { color, label: formatLastSync(lastSync, !lastSyncTimesLoaded) };
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
      {fetchError && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            backgroundColor: "#ffebee",
            border: "1px solid #f44336",
            borderRadius: "8px",
            fontSize: "14px",
            color: "#c62828",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Errore di connessione al server. I dati visualizzati potrebbero non essere aggiornati.</span>
          <button
            onClick={() => { consecutiveErrorsRef.current = 0; setFetchError(false); fetchStatus(); }}
            style={{
              padding: "6px 12px",
              backgroundColor: "#f44336",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Riprova
          </button>
        </div>
      )}

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
          disabled={syncingAll || isAnySyncBusy()}
          style={{
            padding: "12px 24px",
            fontSize: "16px",
            fontWeight: 600,
            backgroundColor:
              syncingAll || isAnySyncBusy()
                ? "#9e9e9e"
                : "#2196f3",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor:
              syncingAll || isAnySyncBusy()
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
              {autoSyncEnabled === null ? "" : autoSyncEnabled ? "(Attivo)" : "(Disattivato)"}
            </h3>
            <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "#666" }}>
              {autoSyncEnabled
                ? "I sync vengono eseguiti automaticamente in background con intervalli configurati"
                : "Attiva il sync automatico per eseguire sync in background senza intervento manuale"}
            </p>
          </div>
          <button
            onClick={toggleAutoSync}
            disabled={autoSyncEnabled === null || togglingAutoSync}
            style={{
              padding: "10px 20px",
              backgroundColor: autoSyncEnabled ? "#f44336" : "#4caf50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: autoSyncEnabled === null || togglingAutoSync ? "not-allowed" : "pointer",
              fontWeight: 600,
              opacity: autoSyncEnabled === null || togglingAutoSync ? 0.6 : 1,
            }}
          >
            {autoSyncEnabled ? "⏸️ Disattiva" : "▶️ Attiva"}
          </button>
        </div>
      </div>

      {dashboard && dashboard.scheduler.sessionCount > 0 && (
        <div
          style={{
            margin: "0 0 20px 0",
            padding: "12px 16px",
            background: "#fff3cd",
            border: "1px solid #ffc107",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        >
          <strong>Smart Customer Sync attivo</strong>
          <br />
          Sessioni interattive: {dashboard.scheduler.sessionCount}
          <br />
          <small>Il sync automatico riprende alla chiusura delle sessioni</small>
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
          const statusBadge = getStatusBadge(section.type);
          const healthIndicator = getHealthIndicator(section.type);
          const isBusy = syncing[section.type] || syncingAll || isAnySyncBusy();

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
                    <span
                      title={healthIndicator.label}
                      style={{
                        display: "inline-block",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: healthIndicator.color,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{ display: "flex", gap: "8px", marginBottom: "16px" }}
              >
                <button
                  onClick={() => handleSyncIndividual(section.type)}
                  disabled={isBusy}
                  style={{
                    flex: 1,
                    padding: "10px",
                    fontSize: "14px",
                    fontWeight: 600,
                    backgroundColor: isBusy ? "#9e9e9e" : "#4caf50",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: isBusy ? "not-allowed" : "pointer",
                  }}
                >
                  {syncing[section.type]
                    ? "⏳ Syncing..."
                    : enqueuedTypes.has(section.type)
                      ? "⏳ In coda..."
                      : "▶️ Avvia Full Sync"}
                </button>
                <button
                  onClick={() => handleDeleteDb(section.type)}
                  disabled={deletingDb[section.type] || isBusy}
                  title="Cancella database e ricrea da zero"
                  style={{
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: 600,
                    backgroundColor:
                      deletingDb[section.type] || isBusy
                        ? "#9e9e9e"
                        : "#f44336",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor:
                      deletingDb[section.type] || isBusy
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {deletingDb[section.type] ? "⏳" : "🗑️"}
                </button>
              </div>

              <div style={{ fontSize: "12px", color: "#666" }}>
                <div>
                  <strong>Priorità:</strong> {section.priority}/7
                </div>
                <div>
                  <strong>Ultima sync:</strong> {formatLastSync(lastSyncTimes[section.type] ?? null, !lastSyncTimesLoaded)}
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
                key={`${job.userId}-${job.jobId}`}
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

import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocketContext } from "../contexts/WebSocketContext";

type SyncType =
  | "sync-customers"
  | "sync-orders"
  | "sync-ddt"
  | "sync-invoices"
  | "sync-products"
  | "sync-prices"
  | "sync-order-articles"
  | "sync-tracking";

type HistoryEntry = {
  timestamp: string | null;
  duration: number;
  success: boolean;
  error: string | null;
};

type SyncTypeStats = {
  lastRunTime: string | null;
  lastDuration: number | null;
  lastSuccess: boolean | null;
  lastError: string | null;
  health: "healthy" | "degraded" | "idle";
  totalCompleted: number;
  totalFailed: number;
  consecutiveFailures: number;
  history: HistoryEntry[];
};

type QueueStats = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  prioritized: number;
};

type ActiveJob = { userId: string; jobId: string; type: string };

type MonitoringData = {
  queue: QueueStats;
  activeJobs: ActiveJob[];
  scheduler: {
    running: boolean;
    intervals: { agentSyncMs: number; sharedSyncMs: number };
    sessionCount: number;
  };
};

type SyncHistoryData = {
  types: Record<SyncType, SyncTypeStats>;
};

const SYNC_SECTIONS: { type: SyncType; label: string; icon: string }[] = [
  { type: "sync-orders", label: "Ordini", icon: "📦" },
  { type: "sync-customers", label: "Clienti", icon: "👥" },
  { type: "sync-products", label: "Prodotti", icon: "🏷️" },
  { type: "sync-prices", label: "Prezzi", icon: "💰" },
  { type: "sync-ddt", label: "DDT", icon: "🚚" },
  { type: "sync-invoices", label: "Fatture", icon: "📄" },
  { type: "sync-order-articles" as SyncType, label: "Articoli Ordini", icon: "📋" },
  { type: "sync-tracking", label: "Tracking FedEx", icon: "📍" },
];

function getHealthBadge(health: "healthy" | "degraded" | "idle") {
  switch (health) {
    case "healthy":
      return { color: "#4caf50", bg: "#e8f5e9", label: "HEALTHY" };
    case "degraded":
      return { color: "#f44336", bg: "#ffebee", label: "DEGRADED" };
    case "idle":
      return { color: "#ff9800", bg: "#fff3e0", label: "IDLE" };
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "Mai";
  return new Date(iso).toLocaleString("it-IT", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function authHeaders(): HeadersInit {
  const jwt = localStorage.getItem("archibald_jwt");
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

export default function SyncMonitoringDashboard() {
  const { subscribe, state: wsState } = useWebSocketContext();

  const [monitoring, setMonitoring] = useState<MonitoringData | null>(null);
  const [history, setHistory] = useState<SyncHistoryData | null>(null);
  const [toggling, setToggling] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [expandedError, setExpandedError] = useState<{
    type: string;
    error: string;
    timestamp: string;
  } | null>(null);
  const consecutiveErrorsRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/monitoring/status", {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setMonitoring({
          queue: data.queue,
          activeJobs: data.activeJobs,
          scheduler: data.scheduler,
        });
        consecutiveErrorsRef.current = 0;
        setFetchError(false);
      }
    } catch {
      consecutiveErrorsRef.current++;
      if (consecutiveErrorsRef.current >= 3) setFetchError(true);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/monitoring/sync-history", {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setHistory({ types: data.types });
      }
    } catch {
      /* history polling — status errors already tracked */
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchHistory();
  }, [fetchStatus, fetchHistory]);

  useEffect(() => {
    const statusMs = wsState === "connected" ? 30000 : 5000;
    const historyMs = wsState === "connected" ? 60000 : 10000;
    const statusTimer = setInterval(fetchStatus, statusMs);
    const historyTimer = setInterval(fetchHistory, historyMs);
    return () => {
      clearInterval(statusTimer);
      clearInterval(historyTimer);
    };
  }, [wsState, fetchStatus, fetchHistory]);

  useEffect(() => {
    const unsubs = [
      subscribe("JOB_STARTED", () => { fetchStatus(); }),
      subscribe("JOB_COMPLETED", () => { fetchStatus(); fetchHistory(); }),
      subscribe("JOB_FAILED", () => { fetchStatus(); fetchHistory(); }),
    ];
    return () => { unsubs.forEach((u) => u()); };
  }, [subscribe, fetchStatus, fetchHistory]);

  const toggleScheduler = async () => {
    if (!monitoring) return;
    setToggling(true);
    try {
      const action = monitoring.scheduler.running ? "stop" : "start";
      const res = await fetch(`/api/sync/auto-sync/${action}`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch {
      alert("Errore durante il cambio dello stato scheduler");
    } finally {
      setToggling(false);
    }
  };

  if (!monitoring) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
        Loading monitoring data...
      </div>
    );
  }

  const { queue, activeJobs, scheduler } = monitoring;

  return (
    <div>
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
          }}
        >
          Errore di connessione — i dati potrebbero non essere aggiornati.
        </div>
      )}

      {/* 1. Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
          paddingBottom: "12px",
          borderBottom: "2px solid #eee",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
            Sync Monitoring
          </h3>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: "12px",
              fontSize: "13px",
              fontWeight: 600,
              color: scheduler.running ? "#2e7d32" : "#c62828",
              backgroundColor: scheduler.running ? "#e8f5e9" : "#ffebee",
            }}
          >
            Scheduler: {scheduler.running ? "Running" : "Stopped"}
          </span>
          <span style={{ fontSize: "13px", color: "#666" }}>
            {scheduler.sessionCount} session{scheduler.sessionCount !== 1 && "i"}{" "}
            attiv{scheduler.sessionCount === 1 ? "a" : "e"}
          </span>
        </div>
        <button
          onClick={toggleScheduler}
          disabled={toggling}
          style={{
            padding: "8px 20px",
            backgroundColor: scheduler.running ? "#c62828" : "#2e7d32",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: toggling ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "13px",
          }}
        >
          {toggling
            ? "..."
            : scheduler.running
              ? "Stop Scheduler"
              : "Start Scheduler"}
        </button>
      </div>

      {/* 2. Queue Overview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        {(
          [
            { label: "Waiting", value: queue.waiting, color: "#ff9800" },
            { label: "Active", value: queue.active, color: "#2196f3" },
            { label: "Completed", value: queue.completed, color: "#4caf50" },
            { label: "Failed", value: queue.failed, color: "#f44336" },
          ] as const
        ).map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              padding: "16px",
              borderRadius: "8px",
              backgroundColor: "white",
              border: `2px solid ${color}20`,
              textAlign: "center",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{ fontSize: "28px", fontWeight: 700, color }}
            >
              {value}
            </div>
            <div style={{ fontSize: "13px", color: "#666", marginTop: "4px" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Sync Types Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {SYNC_SECTIONS.map((section) => {
          const stats = history?.types[section.type];
          const badge = getHealthBadge(stats?.health ?? "idle");

          return (
            <div
              key={section.type}
              style={{
                border: `2px solid ${badge.color}30`,
                borderRadius: "8px",
                padding: "16px",
                backgroundColor: "white",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              {/* Card header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "12px",
                  paddingBottom: "10px",
                  borderBottom: "1px solid #eee",
                }}
              >
                <span style={{ fontSize: "28px" }}>{section.icon}</span>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
                    {section.label}
                  </h4>
                  {stats && (
                    <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                      {stats.totalCompleted} ok / {stats.totalFailed} fail
                      {stats.consecutiveFailures > 0 &&
                        ` (${stats.consecutiveFailures} consecutive fail)`}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: "10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: badge.color,
                    backgroundColor: badge.bg,
                  }}
                >
                  {badge.label}
                </span>
              </div>

              {/* Status line */}
              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  fontSize: "13px",
                  color: "#555",
                  marginBottom: "10px",
                }}
              >
                <span>
                  <strong>Last:</strong> {formatTime(stats?.lastRunTime ?? null)}
                </span>
                <span>
                  <strong>Durata:</strong>{" "}
                  {formatDuration(stats?.lastDuration ?? null)}
                </span>
                {stats?.lastSuccess === false && stats.lastError && (
                  <span
                    style={{ color: "#c62828", cursor: "pointer", textDecoration: "underline" }}
                    onClick={() =>
                      setExpandedError({
                        type: section.label,
                        error: stats.lastError!,
                        timestamp: stats.lastRunTime ?? "",
                      })
                    }
                  >
                    Errore
                  </span>
                )}
              </div>

              {/* Mini history table */}
              {stats && stats.history.length > 0 ? (
                <div
                  style={{
                    maxHeight: "180px",
                    overflow: "auto",
                    border: "1px solid #eee",
                    borderRadius: "4px",
                  }}
                >
                  <table
                    style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}
                  >
                    <thead>
                      <tr style={{ backgroundColor: "#f9f9f9" }}>
                        <th style={{ padding: "6px 8px", textAlign: "left" }}>
                          Ora
                        </th>
                        <th style={{ padding: "6px 8px", textAlign: "center" }}>
                          Durata
                        </th>
                        <th style={{ padding: "6px 8px", textAlign: "center" }}>
                          Esito
                        </th>
                        <th style={{ padding: "6px 8px", textAlign: "left" }}>
                          Errore
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.history.slice(0, 5).map((entry, i) => (
                        <tr
                          key={i}
                          style={{
                            borderTop: "1px solid #f0f0f0",
                            backgroundColor: i % 2 === 0 ? "white" : "#fafafa",
                          }}
                        >
                          <td style={{ padding: "5px 8px" }}>
                            {formatTime(entry.timestamp)}
                          </td>
                          <td
                            style={{ padding: "5px 8px", textAlign: "center" }}
                          >
                            {formatDuration(entry.duration)}
                          </td>
                          <td
                            style={{
                              padding: "5px 8px",
                              textAlign: "center",
                              fontSize: "14px",
                            }}
                          >
                            {entry.success ? "✅" : "❌"}
                          </td>
                          <td
                            style={{
                              padding: "5px 8px",
                              color: "#999",
                              maxWidth: "180px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {entry.error ? (
                              <span
                                style={{ cursor: "pointer", color: "#c62828" }}
                                onClick={() =>
                                  setExpandedError({
                                    type: section.label,
                                    error: entry.error!,
                                    timestamp: entry.timestamp ?? "",
                                  })
                                }
                              >
                                {entry.error.slice(0, 40)}
                                {entry.error.length > 40 ? "..." : ""}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div
                  style={{
                    padding: "10px",
                    textAlign: "center",
                    color: "#bbb",
                    fontSize: "12px",
                  }}
                >
                  Nessuna history
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 4. Active Jobs */}
      <div
        style={{
          marginBottom: "24px",
          padding: "16px",
          backgroundColor: "white",
          borderRadius: "8px",
          border: "1px solid #e0e0e0",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <h4 style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 600 }}>
          Active Jobs ({activeJobs.length})
        </h4>
        {activeJobs.length === 0 ? (
          <div style={{ color: "#999", fontSize: "13px" }}>
            Nessun job attivo
          </div>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid #eee" }}>
                <th style={{ padding: "8px", textAlign: "left" }}>Tipo</th>
                <th style={{ padding: "8px", textAlign: "left" }}>User ID</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Job ID</th>
              </tr>
            </thead>
            <tbody>
              {activeJobs.map((job) => (
                <tr
                  key={`${job.userId}-${job.jobId}`}
                  style={{ borderBottom: "1px solid #f0f0f0" }}
                >
                  <td style={{ padding: "8px" }}>{job.type}</td>
                  <td style={{ padding: "8px", fontFamily: "monospace" }}>
                    {job.userId}
                  </td>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: "12px" }}>
                    {job.jobId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 5. Scheduler Config */}
      <div
        style={{
          padding: "16px",
          backgroundColor: "white",
          borderRadius: "8px",
          border: "1px solid #e0e0e0",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <h4 style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 600 }}>
          Scheduler Config
        </h4>
        <div style={{ display: "flex", gap: "24px", fontSize: "13px" }}>
          <div>
            <strong>Agent Sync:</strong>{" "}
            {Math.round(scheduler.intervals.agentSyncMs / 60000)} min
          </div>
          <div>
            <strong>Shared Sync:</strong>{" "}
            {Math.round(scheduler.intervals.sharedSyncMs / 60000)} min
          </div>
        </div>
      </div>

      {/* Error Modal */}
      {expandedError && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setExpandedError(null)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              width: "80vw",
              maxWidth: "700px",
              maxHeight: "70vh",
              overflow: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px", color: "#c62828" }}>
              Errore — {expandedError.type}
            </h3>
            <p style={{ fontSize: "13px", color: "#666", margin: "0 0 16px" }}>
              {formatTime(expandedError.timestamp)}
            </p>
            <pre
              style={{
                padding: "12px",
                backgroundColor: "#ffebee",
                border: "1px solid #f44336",
                borderRadius: "4px",
                fontFamily: "monospace",
                fontSize: "12px",
                color: "#c62828",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: "300px",
                overflow: "auto",
              }}
            >
              {expandedError.error}
            </pre>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "16px",
              }}
            >
              <button
                onClick={() => setExpandedError(null)}
                style={{
                  padding: "8px 20px",
                  backgroundColor: "#2196f3",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

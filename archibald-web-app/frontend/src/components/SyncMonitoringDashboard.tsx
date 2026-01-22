import { useState, useEffect } from "react";
import ErrorDetailsModal from "./ErrorDetailsModal";

type SyncType =
  | "customers"
  | "products"
  | "prices"
  | "orders"
  | "ddt"
  | "invoices";

interface HistoryEntry {
  timestamp: string;
  duration: number;
  success: boolean;
  error: string | null;
}

interface SyncTypeData {
  isRunning: boolean;
  lastRunTime: string | null;
  queuePosition: number | null;
  history: HistoryEntry[];
  health: "healthy" | "unhealthy" | "idle";
}

interface MonitoringStatus {
  currentSync: SyncType | null;
  types: Record<SyncType, SyncTypeData>;
}

const syncSections = [
  { type: "orders" as SyncType, label: "Ordini", icon: "📦", priority: 6 },
  {
    type: "customers" as SyncType,
    label: "Clienti",
    icon: "👥",
    priority: 5,
  },
  { type: "products" as SyncType, label: "Prodotti", icon: "🏷️", priority: 2 },
  { type: "prices" as SyncType, label: "Prezzi", icon: "💰", priority: 1 },
  { type: "ddt" as SyncType, label: "DDT", icon: "🚚", priority: 4 },
  { type: "invoices" as SyncType, label: "Fatture", icon: "📄", priority: 3 },
];

export default function SyncMonitoringDashboard() {
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [intervals, setIntervals] = useState<Record<SyncType, number> | null>(
    null
  );
  const [historyLimit, setHistoryLimit] = useState(20);
  const [selectedError, setSelectedError] = useState<{
    type: SyncType;
    error: string;
    timestamp: string;
  } | null>(null);
  const [savingInterval, setSavingInterval] = useState<
    Record<SyncType, boolean>
  >({
    customers: false,
    products: false,
    prices: false,
    orders: false,
    ddt: false,
    invoices: false,
  });
  const [editedIntervals, setEditedIntervals] = useState<
    Partial<Record<SyncType, number>>
  >({});

  useEffect(() => {
    fetchStatus();
    fetchIntervals();

    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [historyLimit]);

  const fetchStatus = async () => {
    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) return;

      const response = await fetch(
        `/api/sync/monitoring/status?limit=${historyLimit}`,
        {
          headers: { Authorization: `Bearer ${jwt}` },
        }
      );

      const data = await response.json();
      if (data.success) {
        setStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch monitoring status:", error);
    }
  };

  const fetchIntervals = async () => {
    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) return;

      const response = await fetch("/api/sync/intervals", {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const data = await response.json();
      if (data.success) {
        setIntervals(data.intervals);
      }
    } catch (error) {
      console.error("Failed to fetch intervals:", error);
    }
  };

  const saveInterval = async (type: SyncType) => {
    const newInterval = editedIntervals[type];
    if (!newInterval || newInterval < 5 || newInterval > 1440) {
      alert("Interval must be between 5 and 1440 minutes");
      return;
    }

    setSavingInterval((prev) => ({ ...prev, [type]: true }));

    try {
      const jwt = localStorage.getItem("archibald_jwt");
      const response = await fetch(`/api/sync/intervals/${type}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ intervalMinutes: newInterval }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`✅ Interval updated to ${newInterval} minutes`);
        fetchIntervals();
        setEditedIntervals((prev) => {
          const copy = { ...prev };
          delete copy[type];
          return copy;
        });
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to save interval:", error);
      alert("Failed to save interval");
    } finally {
      setSavingInterval((prev) => ({ ...prev, [type]: false }));
    }
  };

  const getHealthColor = (health: "healthy" | "unhealthy" | "idle") => {
    switch (health) {
      case "healthy":
        return "#4caf50";
      case "unhealthy":
        return "#f44336";
      case "idle":
        return "#ff9800";
    }
  };

  const getHealthIcon = (health: "healthy" | "unhealthy" | "idle") => {
    switch (health) {
      case "healthy":
        return "🟢";
      case "unhealthy":
        return "🔴";
      case "idle":
        return "🟡";
    }
  };

  if (!status || !intervals) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
        Loading monitoring data...
      </div>
    );
  }

  return (
    <div>
      {/* History Limit Selector */}
      <div
        style={{
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <label
          htmlFor="historyLimit"
          style={{ fontSize: "14px", fontWeight: 600, color: "#333" }}
        >
          History entries:
        </label>
        <select
          id="historyLimit"
          value={historyLimit}
          onChange={(e) => setHistoryLimit(Number(e.target.value))}
          style={{
            padding: "6px 12px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      {/* Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))",
          gap: "20px",
        }}
      >
        {syncSections.map((section) => {
          const typeData = status.types[section.type];
          const interval = intervals[section.type];
          const isRunning =
            status.currentSync === section.type && typeData.isRunning;
          const healthColor = getHealthColor(typeData.health);
          const healthIcon = getHealthIcon(typeData.health);
          const editedInterval = editedIntervals[section.type];
          const hasChanges =
            editedInterval !== undefined && editedInterval !== interval;

          return (
            <div
              key={section.type}
              style={{
                border: `2px solid ${isRunning ? "#2196f3" : healthColor}`,
                borderRadius: "8px",
                padding: "20px",
                backgroundColor: "white",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "16px",
                  borderBottom: "2px solid #eee",
                  paddingBottom: "12px",
                }}
              >
                <span style={{ fontSize: "32px" }}>{section.icon}</span>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
                    {section.label}
                  </h3>
                  <div
                    style={{
                      marginTop: "4px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span style={{ fontSize: "18px" }}>{healthIcon}</span>
                    <span
                      style={{
                        fontSize: "14px",
                        color: healthColor,
                        fontWeight: 600,
                      }}
                    >
                      {typeData.health.toUpperCase()}
                    </span>
                    {isRunning && (
                      <span
                        style={{
                          fontSize: "14px",
                          color: "#2196f3",
                          fontWeight: 600,
                        }}
                      >
                        🔵 RUNNING
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Section */}
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#666",
                    marginBottom: "4px",
                  }}
                >
                  <strong>Last run:</strong>{" "}
                  {typeData.lastRunTime
                    ? new Date(typeData.lastRunTime).toLocaleString("it-IT")
                    : "Never"}
                </div>
                {typeData.history.length > 0 && (
                  <div style={{ fontSize: "13px", color: "#666" }}>
                    <strong>Duration:</strong>{" "}
                    {Math.round(typeData.history[0].duration / 1000)}s
                  </div>
                )}
              </div>

              {/* Interval Config Section */}
              <div
                style={{
                  marginBottom: "16px",
                  padding: "12px",
                  backgroundColor: "#f5f5f5",
                  borderRadius: "4px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    marginBottom: "8px",
                    color: "#333",
                  }}
                >
                  Sync Interval
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={editedInterval !== undefined ? editedInterval : interval}
                    onChange={(e) =>
                      setEditedIntervals((prev) => ({
                        ...prev,
                        [section.type]: Number(e.target.value),
                      }))
                    }
                    style={{
                      flex: 1,
                      padding: "6px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      fontSize: "14px",
                    }}
                  />
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      fontSize: "14px",
                      color: "#666",
                    }}
                  >
                    min
                  </span>
                  <button
                    onClick={() => saveInterval(section.type)}
                    disabled={
                      !hasChanges || savingInterval[section.type]
                    }
                    style={{
                      padding: "6px 16px",
                      backgroundColor: hasChanges ? "#2196f3" : "#ccc",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: hasChanges ? "pointer" : "not-allowed",
                      fontWeight: 600,
                      fontSize: "13px",
                    }}
                  >
                    {savingInterval[section.type] ? "Saving..." : "Save"}
                  </button>
                </div>
                {!hasChanges && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      marginTop: "4px",
                    }}
                  >
                    Current interval: {interval} minutes
                  </div>
                )}
              </div>

              {/* History Table */}
              <div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    marginBottom: "8px",
                    color: "#333",
                  }}
                >
                  Recent History ({typeData.history.length} entries)
                </div>
                {typeData.history.length === 0 ? (
                  <div
                    style={{
                      padding: "12px",
                      textAlign: "center",
                      color: "#999",
                      fontSize: "13px",
                    }}
                  >
                    No history available
                  </div>
                ) : (
                  <div
                    style={{
                      maxHeight: "300px",
                      overflow: "auto",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr
                          style={{
                            backgroundColor: "#f5f5f5",
                            borderBottom: "2px solid #ddd",
                          }}
                        >
                          <th
                            style={{
                              padding: "8px",
                              textAlign: "left",
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "#333",
                            }}
                          >
                            Time
                          </th>
                          <th
                            style={{
                              padding: "8px",
                              textAlign: "center",
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "#333",
                            }}
                          >
                            Duration
                          </th>
                          <th
                            style={{
                              padding: "8px",
                              textAlign: "center",
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "#333",
                            }}
                          >
                            Status
                          </th>
                          <th
                            style={{
                              padding: "8px",
                              textAlign: "left",
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "#333",
                            }}
                          >
                            Error
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {typeData.history.map((entry, idx) => (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: "1px solid #eee",
                              backgroundColor:
                                idx % 2 === 0 ? "white" : "#fafafa",
                            }}
                          >
                            <td
                              style={{
                                padding: "8px",
                                fontSize: "12px",
                                color: "#333",
                              }}
                            >
                              {new Date(entry.timestamp).toLocaleString(
                                "it-IT",
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </td>
                            <td
                              style={{
                                padding: "8px",
                                fontSize: "12px",
                                color: "#666",
                                textAlign: "center",
                              }}
                            >
                              {Math.round(entry.duration / 1000)}s
                            </td>
                            <td
                              style={{
                                padding: "8px",
                                textAlign: "center",
                                fontSize: "16px",
                              }}
                            >
                              {entry.success ? "✅" : "❌"}
                            </td>
                            <td
                              style={{
                                padding: "8px",
                                fontSize: "12px",
                                color: "#666",
                              }}
                            >
                              {entry.error ? (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                  }}
                                >
                                  <span
                                    style={{
                                      flex: 1,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {entry.error.slice(0, 50)}
                                    {entry.error.length > 50 ? "..." : ""}
                                  </span>
                                  <button
                                    onClick={() =>
                                      setSelectedError({
                                        type: section.type,
                                        error: entry.error!,
                                        timestamp: entry.timestamp,
                                      })
                                    }
                                    style={{
                                      padding: "4px 8px",
                                      backgroundColor: "#2196f3",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      cursor: "pointer",
                                      fontSize: "11px",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    👁️ View
                                  </button>
                                </div>
                              ) : (
                                <span style={{ color: "#999" }}>-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error Details Modal */}
      <ErrorDetailsModal
        error={selectedError}
        onClose={() => setSelectedError(null)}
      />
    </div>
  );
}

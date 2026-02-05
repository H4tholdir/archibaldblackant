import { useState, useEffect } from "react";
import type { WebSocketHealthResponse } from "../types/websocket";

export default function WebSocketMonitor() {
  const [health, setHealth] = useState<WebSocketHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth();

    const interval = setInterval(() => {
      fetchHealth();
    }, 5000); // 5-second polling (consistent with Phase 25)

    return () => clearInterval(interval);
  }, []);

  const fetchHealth = async () => {
    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/websocket/health", {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: WebSocketHealthResponse = await response.json();
      setHealth(data);
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch WebSocket health:", err);
      setError(err instanceof Error ? err.message : "Network error");
      setLoading(false);
    }
  };

  const formatUptime = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getStatusColor = (status: "healthy" | "idle" | "offline"): string => {
    switch (status) {
      case "healthy":
        return "#4caf50"; // Green
      case "idle":
        return "#ff9800"; // Orange
      case "offline":
        return "#f44336"; // Red
    }
  };

  const getStatusIcon = (status: "healthy" | "idle" | "offline"): string => {
    switch (status) {
      case "healthy":
        return "🟢";
      case "idle":
        return "🟡";
      case "offline":
        return "🔴";
    }
  };

  const getLatencyColor = (latency: number): string => {
    return latency <= 100 ? "#4caf50" : "#ff9800"; // Green if ≤100ms, Orange if >100ms
  };

  if (loading && !health) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
        Loading WebSocket health...
      </div>
    );
  }

  if (error && !health) {
    return (
      <div
        style={{
          padding: "20px",
          backgroundColor: "#ffebee",
          border: "1px solid #f44336",
          borderRadius: "8px",
          color: "#c62828",
        }}
      >
        <strong>Error:</strong> {error}
      </div>
    );
  }

  if (!health) return null;

  const statusColor = getStatusColor(health.status);
  const statusIcon = getStatusIcon(health.status);
  const latencyColor = getLatencyColor(health.stats.averageLatency);

  return (
    <div>
      <h2
        style={{
          fontSize: "24px",
          fontWeight: 600,
          marginBottom: "20px",
          color: "#333",
        }}
      >
        WebSocket Real-Time Sync
      </h2>

      {/* Main Card */}
      <div
        style={{
          border: `2px solid ${statusColor}`,
          borderRadius: "8px",
          padding: "24px",
          backgroundColor: "white",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        }}
      >
        {/* Header with Status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px",
            borderBottom: "2px solid #eee",
            paddingBottom: "16px",
          }}
        >
          <span style={{ fontSize: "32px" }}>{statusIcon}</span>
          <div>
            <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
              Server Status
            </h3>
            <div
              style={{
                marginTop: "4px",
                display: "inline-block",
                padding: "4px 12px",
                backgroundColor: statusColor,
                color: "white",
                borderRadius: "12px",
                fontSize: "13px",
                fontWeight: 600,
                textTransform: "capitalize",
              }}
            >
              {health.status}
            </div>
          </div>
        </div>

        {/* Stats Grid - 6 metrics in 2 rows */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          {/* Connessioni Attive */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "#e3f2fd",
              borderRadius: "8px",
              border: "1px solid #2196f3",
            }}
          >
            <div
              style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}
            >
              Connessioni Attive
            </div>
            <div
              style={{ fontSize: "28px", fontWeight: "bold", color: "#2196f3" }}
            >
              {health.stats.totalConnections}
            </div>
          </div>

          {/* Utenti Connessi */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "#e8f5e9",
              borderRadius: "8px",
              border: "1px solid #4caf50",
            }}
          >
            <div
              style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}
            >
              Utenti Connessi
            </div>
            <div
              style={{ fontSize: "28px", fontWeight: "bold", color: "#4caf50" }}
            >
              {health.stats.activeUsers}
            </div>
          </div>

          {/* Uptime */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "#f5f5f5",
              borderRadius: "8px",
              border: "1px solid #9e9e9e",
            }}
          >
            <div
              style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}
            >
              Uptime
            </div>
            <div
              style={{ fontSize: "28px", fontWeight: "bold", color: "#666" }}
            >
              {formatUptime(health.stats.uptime)}
            </div>
          </div>

          {/* Latency Media */}
          <div
            style={{
              padding: "16px",
              backgroundColor:
                latencyColor === "#4caf50" ? "#e8f5e9" : "#fff3e0",
              borderRadius: "8px",
              border: `1px solid ${latencyColor}`,
            }}
          >
            <div
              style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}
            >
              Latency Media
            </div>
            <div
              style={{
                fontSize: "28px",
                fontWeight: "bold",
                color: latencyColor,
              }}
            >
              {health.stats.averageLatency.toFixed(1)}
              <span style={{ fontSize: "14px", marginLeft: "4px" }}>ms</span>
            </div>
          </div>

          {/* Messaggi Inviati */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "#f3e5f5",
              borderRadius: "8px",
              border: "1px solid #9c27b0",
            }}
          >
            <div
              style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}
            >
              Messaggi Inviati
            </div>
            <div
              style={{ fontSize: "28px", fontWeight: "bold", color: "#9c27b0" }}
            >
              {health.stats.messagesSent.toLocaleString()}
            </div>
          </div>

          {/* Riconnessioni */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "#fff8e1",
              borderRadius: "8px",
              border: "1px solid #ffc107",
            }}
          >
            <div
              style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}
            >
              Riconnessioni
            </div>
            <div
              style={{ fontSize: "28px", fontWeight: "bold", color: "#f57c00" }}
            >
              {health.stats.reconnectionCount}
            </div>
          </div>
        </div>

        {/* Connessioni per Utente */}
        {Object.keys(health.stats.connectionsPerUser).length > 0 && (
          <div>
            <h4
              style={{
                fontSize: "16px",
                fontWeight: 600,
                marginBottom: "12px",
                color: "#333",
              }}
            >
              Connessioni per Utente
            </h4>
            <div
              style={{
                maxHeight: "200px",
                overflowY: "auto",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f5f5f5" }}>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#666",
                        borderBottom: "2px solid #ddd",
                      }}
                    >
                      User ID
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#666",
                        borderBottom: "2px solid #ddd",
                      }}
                    >
                      Connessioni
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(health.stats.connectionsPerUser).map(
                    ([userId, count]) => (
                      <tr
                        key={userId}
                        style={{ borderBottom: "1px solid #eee" }}
                      >
                        <td
                          style={{
                            padding: "8px 12px",
                            fontSize: "13px",
                            color: "#333",
                          }}
                        >
                          {userId}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            fontSize: "13px",
                            color: "#333",
                            textAlign: "right",
                            fontWeight: 600,
                          }}
                        >
                          {count}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Last Updated */}
        <div
          style={{
            marginTop: "16px",
            fontSize: "12px",
            color: "#999",
            textAlign: "right",
          }}
        >
          Auto-aggiornamento ogni 5 secondi
        </div>
      </div>
    </div>
  );
}

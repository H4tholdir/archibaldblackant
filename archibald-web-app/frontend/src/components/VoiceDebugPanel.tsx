import { useState } from "react";

export interface VoiceDebugLog {
  timestamp: number;
  step: string;
  data: any;
  level: "info" | "success" | "warning" | "error";
}

interface VoiceDebugPanelProps {
  logs: VoiceDebugLog[];
  onClear: () => void;
  onExport: () => void;
}

export function VoiceDebugPanel({
  logs,
  onClear,
  onExport,
}: VoiceDebugPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const filteredLogs =
    filter === "all" ? logs : logs.filter((log) => log.level === filter);

  const getLevelColor = (level: string) => {
    switch (level) {
      case "success":
        return "#10b981";
      case "warning":
        return "#f59e0b";
      case "error":
        return "#ef4444";
      default:
        return "#3b82f6";
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${date.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}.${ms}`;
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        right: 0,
        width: isMinimized ? "300px" : "500px",
        height: isMinimized ? "40px" : "400px",
        backgroundColor: "#1f2937",
        color: "#f9fafb",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        borderTopLeftRadius: "8px",
        boxShadow: "0 -4px 6px -1px rgba(0, 0, 0, 0.1)",
        transition: "all 0.3s ease",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          backgroundColor: "#111827",
          borderTopLeftRadius: "8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>🔍</span>
          <strong>Voice Debug Console</strong>
          <span
            style={{
              fontSize: "0.75rem",
              color: "#9ca3af",
              fontWeight: "normal",
            }}
          >
            ({logs.length} logs)
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(!isMinimized);
          }}
          style={{
            background: "none",
            border: "none",
            color: "#9ca3af",
            cursor: "pointer",
            fontSize: "1.2rem",
          }}
        >
          {isMinimized ? "▲" : "▼"}
        </button>
      </div>

      {!isMinimized && (
        <>
          {/* Controls */}
          <div
            style={{
              padding: "8px 12px",
              backgroundColor: "#374151",
              display: "flex",
              gap: "8px",
              alignItems: "center",
              borderBottom: "1px solid #4b5563",
            }}
          >
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                padding: "4px 8px",
                backgroundColor: "#1f2937",
                color: "#f9fafb",
                border: "1px solid #4b5563",
                borderRadius: "4px",
                fontSize: "0.875rem",
              }}
            >
              <option value="all">All</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>

            <button
              onClick={onClear}
              style={{
                padding: "4px 12px",
                backgroundColor: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Clear
            </button>

            <button
              onClick={onExport}
              style={{
                padding: "4px 12px",
                backgroundColor: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Export JSON
            </button>
          </div>

          {/* Logs */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px",
              fontSize: "0.75rem",
              fontFamily: "monospace",
            }}
          >
            {filteredLogs.length === 0 ? (
              <div
                style={{
                  color: "#9ca3af",
                  textAlign: "center",
                  padding: "20px",
                }}
              >
                No logs yet. Start using voice input to see debug info.
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: "8px",
                    padding: "8px",
                    backgroundColor: "#374151",
                    borderRadius: "4px",
                    borderLeft: `3px solid ${getLevelColor(log.level)}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ color: getLevelColor(log.level) }}>
                      [{log.level.toUpperCase()}]
                    </span>
                    <span style={{ color: "#9ca3af" }}>
                      {formatTime(log.timestamp)}
                    </span>
                  </div>
                  <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                    {log.step}
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      color: "#d1d5db",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Hook per usare il debug logging
export function useVoiceDebugLogger() {
  const [logs, setLogs] = useState<VoiceDebugLog[]>([]);

  const log = (
    step: string,
    data: any,
    level: "info" | "success" | "warning" | "error" = "info",
  ) => {
    const newLog: VoiceDebugLog = {
      timestamp: Date.now(),
      step,
      data,
      level,
    };
    setLogs((prev) => [...prev, newLog]);
    console.log(`[VOICE DEBUG] ${step}`, data);
  };

  const clear = () => {
    setLogs([]);
    console.log("[VOICE DEBUG] Logs cleared");
  };

  const exportLogs = () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `voice-debug-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    console.log("[VOICE DEBUG] Logs exported");
  };

  return { logs, log, clear, exportLogs };
}

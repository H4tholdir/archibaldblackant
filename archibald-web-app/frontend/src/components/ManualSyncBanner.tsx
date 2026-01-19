import React from "react";

export type SyncStatus = "idle" | "syncing" | "success" | "error";

export interface ManualSyncBannerProps {
  status: SyncStatus;
  message?: string;
  progress?: { current: number; total: number };
  onClose?: () => void;
}

/**
 * Banner for displaying manual sync status (in-progress, success, error)
 * Used for manual sync button trigger (not automatic background sync)
 */
export const ManualSyncBanner: React.FC<ManualSyncBannerProps> = ({
  status,
  message,
  progress,
  onClose,
}) => {
  if (status === "idle") {
    return null;
  }

  // Color coding
  const backgroundColor =
    status === "syncing"
      ? "#ff9800" // Yellow (in progress)
      : status === "success"
        ? "#4caf50" // Green (success)
        : "#f44336"; // Red (error)

  const icon =
    status === "syncing" ? "⏳" : status === "success" ? "✅" : "❌";

  const displayMessage =
    message ||
    (status === "syncing"
      ? "Aggiornamento in corso..."
      : status === "success"
        ? "Aggiornamento completato"
        : "Errore durante aggiornamento");

  return (
    <div
      style={{
        position: "fixed",
        top: "64px", // Below header
        left: 0,
        right: 0,
        backgroundColor,
        color: "white",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 1000,
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "14px",
        fontWeight: 500,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "18px" }}>{icon}</span>
        <span>{displayMessage}</span>
        {progress && progress.total > 0 && (
          <span style={{ opacity: 0.9 }}>
            ({progress.current} / {progress.total})
          </span>
        )}
      </div>

      {status !== "syncing" && onClose && (
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "white",
            cursor: "pointer",
            fontSize: "18px",
            padding: "4px 8px",
          }}
          aria-label="Chiudi"
        >
          ×
        </button>
      )}
    </div>
  );
};

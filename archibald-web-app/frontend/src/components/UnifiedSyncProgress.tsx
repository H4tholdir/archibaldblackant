import { useEffect, useState } from "react";
import "./UnifiedSyncProgress.css";

export interface SyncProgress {
  syncType: "customers" | "orders" | "products" | "prices";
  mode: "full" | "delta" | "manual" | "forced";
  status: "running" | "completed" | "error";
  currentPage?: number;
  totalPages?: number;
  itemsProcessed: number;
  itemsChanged: number;
  percentage: number;
  startedAt: number;
  estimatedCompletion?: number;
  error?: string;
}

interface UnifiedSyncProgressProps {
  /**
   * Mode:
   * - "banner": Full-width banner at top (for manual user-triggered sync)
   * - "badge": Small badge at bottom-right (for automatic background sync)
   */
  mode?: "banner" | "badge";

  /**
   * Show progress for specific sync type only (optional filter)
   */
  filterType?: "customers" | "orders" | "products" | "prices";
}

const SYNC_TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  customers: { icon: "👥", label: "Clienti" },
  orders: { icon: "📦", label: "Ordini" },
  products: { icon: "📦", label: "Articoli" },
  prices: { icon: "💰", label: "Prezzi" },
};

const SYNC_MODE_LABELS: Record<string, string> = {
  full: "Completa",
  delta: "Incrementale",
  manual: "Manuale",
  forced: "Forzata",
};

export function UnifiedSyncProgress({
  mode = "banner",
  filterType,
}: UnifiedSyncProgressProps) {
  const [activeSync, setActiveSync] = useState<SyncProgress | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number>(0);

  useEffect(() => {
    // Get JWT from localStorage for SSE authentication
    const jwt = localStorage.getItem("archibald_jwt");
    if (!jwt) {
      console.warn("[SyncProgress] No JWT found, cannot connect to SSE");
      return;
    }

    // Connect to SSE for real-time progress (pass JWT as query param)
    const eventSource = new EventSource(`/api/sync/progress?token=${jwt}`);

    eventSource.onmessage = (event) => {
      const progress: SyncProgress = JSON.parse(event.data);

      // Skip if connected message
      if ("connected" in progress) return;

      // Filter by type if specified
      if (filterType && progress.syncType !== filterType) return;

      // Show progress
      setActiveSync(progress);
      setIsVisible(true);

      // Auto-hide after completion (3 seconds)
      if (progress.status === "completed") {
        setTimeout(() => {
          setIsVisible(false);
          setActiveSync(null);
        }, 3000);
      }
    };

    eventSource.onerror = (error) => {
      console.error("[SyncProgress] SSE connection error:", error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [filterType]);

  if (!isVisible || !activeSync) return null;

  // Don't show if user dismissed recently (< 10 seconds ago)
  if (dismissedAt > 0 && Date.now() - dismissedAt < 10000) return null;

  const syncInfo = SYNC_TYPE_LABELS[activeSync.syncType];
  const modeLabel = SYNC_MODE_LABELS[activeSync.mode];

  // Calculate ETA
  const elapsed = Date.now() - activeSync.startedAt;
  const eta =
    activeSync.percentage > 0
      ? (elapsed / activeSync.percentage) * (100 - activeSync.percentage)
      : null;

  const formatEta = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setDismissedAt(Date.now());
  };

  // BANNER MODE (manual sync - full UI)
  if (mode === "banner") {
    return (
      <div
        className={`unified-sync-progress banner ${activeSync.status === "error" ? "error" : ""}`}
      >
        <div className="sync-header">
          <div className="sync-title">
            <span className="sync-icon">{syncInfo.icon}</span>
            <div>
              <strong>Sincronizzazione {syncInfo.label}</strong>
              <span className="sync-mode">{modeLabel}</span>
            </div>
          </div>
          <button className="dismiss-btn" onClick={handleDismiss}>
            ×
          </button>
        </div>

        {activeSync.status === "error" ? (
          <div className="error-message">
            ❌ Errore: {activeSync.error || "Sync fallita"}
          </div>
        ) : (
          <>
            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{ width: `${activeSync.percentage}%` }}
              />
            </div>

            <div className="sync-details">
              <span className="percentage">{activeSync.percentage}%</span>
              {activeSync.totalPages && (
                <span className="pages">
                  Pagina {activeSync.currentPage}/{activeSync.totalPages}
                </span>
              )}
              <span className="items">
                {activeSync.itemsProcessed.toLocaleString()} elementi
              </span>
              {eta && activeSync.status === "running" && (
                <span className="eta">ETA: {formatEta(eta)}</span>
              )}
              {activeSync.status === "completed" && (
                <span className="completed">✅ Completata</span>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // BADGE MODE (automatic sync - minimal UI)
  return (
    <div
      className={`unified-sync-progress badge ${activeSync.status === "error" ? "error" : ""}`}
    >
      <div className="badge-content">
        <span className="sync-icon">{syncInfo.icon}</span>
        {activeSync.status === "running" && (
          <div className="badge-progress">
            <div className="badge-spinner" />
            <span className="badge-percentage">{activeSync.percentage}%</span>
          </div>
        )}
        {activeSync.status === "completed" && (
          <span className="badge-completed">✓</span>
        )}
        {activeSync.status === "error" && (
          <span className="badge-error">⚠</span>
        )}
      </div>
      {activeSync.status !== "running" && (
        <div className="badge-label">
          {activeSync.status === "completed"
            ? `${syncInfo.label} aggiornati`
            : "Errore sync"}
        </div>
      )}
    </div>
  );
}

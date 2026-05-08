import type { CSSProperties } from "react";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  useOperationTracking,
  type TrackedOperation,
} from "../contexts/OperationTrackingContext";
import { useDownloadQueue } from "../contexts/DownloadQueueContext";
import { QueueDrawer } from './QueueDrawer';

const BANNER_HEIGHT_CSS = 'calc(60px + env(safe-area-inset-bottom, 0px))';

const ANIMATION_STYLES = `
@keyframes gob-slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes gob-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes gob-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes gob-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
`;

const APP_MAIN_SPACER = `.app-main { padding-bottom: 60px !important; }`;

const WRAP_STYLE: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 1100,
  boxShadow: "0 -3px 16px rgba(0,0,0,0.3)",
  animation: "gob-slide-up 0.3s ease-out",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const USER_STRIPE_ACTIVE: CSSProperties = {
  background: "linear-gradient(135deg, #0984e3, #6c5ce7)",
  padding: "10px 16px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  cursor: "pointer",
  color: "#fff",
  fontSize: "13px",
};

const USER_STRIPE_COMPLETED: CSSProperties = {
  ...USER_STRIPE_ACTIVE,
  background: "#d1fae5",
  color: "#065f46",
};

const USER_STRIPE_FAILED: CSSProperties = {
  ...USER_STRIPE_ACTIVE,
  background: "#fee2e2",
  color: "#991b1b",
};

const BG_STRIPE_STYLE: CSSProperties = {
  background: "#1e272e",
  padding: "5px 16px",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  cursor: "pointer",
  borderTop: "1px solid rgba(0,0,0,0.3)",
};

const SPINNER_STYLE: CSSProperties = {
  display: "inline-block",
  width: "14px",
  height: "14px",
  border: "2px solid rgba(255,255,255,0.3)",
  borderTopColor: "#fff",
  borderRadius: "50%",
  animation: "gob-spin 0.8s linear infinite",
  flexShrink: 0,
};

const PROGRESS_TRACK_STYLE: CSSProperties = {
  width: "160px",
  flexShrink: 0,
  height: "10px",
  background: "rgba(255,255,255,0.2)",
  borderRadius: "5px",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.25)",
};

const progressFillStyle = (progress: number): CSSProperties => ({
  height: "100%",
  width: `${progress}%`,
  borderRadius: "3px",
  background: "linear-gradient(90deg, rgba(255,255,255,0.8), rgba(255,255,255,1))",
  backgroundSize: "200% 100%",
  animation: progress < 100 ? "gob-shimmer 1.5s linear infinite" : "none",
  transition: "width 0.3s ease",
});

const LABEL_STYLE: CSSProperties = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const CHEVRON_STYLE: CSSProperties = { fontSize: "16px", opacity: 0.7, flexShrink: 0 };

const QUEUE_BADGE_STYLE: CSSProperties = {
  background: "rgba(255,255,255,0.22)",
  border: "1px solid rgba(255,255,255,0.35)",
  padding: "2px 9px",
  borderRadius: "12px",
  fontSize: "11px",
  fontWeight: 700,
  flexShrink: 0,
  letterSpacing: "0.2px",
};

function UserStripe({
  op,
  extraBadgeCount,
  isExpanded,
  onClick,
  onDismiss,
}: {
  op: TrackedOperation;
  extraBadgeCount: number;
  isExpanded: boolean;
  onClick: () => void;
  onDismiss: (jobId: string) => void;
}) {
  if (op.status === "failed") {
    return (
      <div style={USER_STRIPE_FAILED} onClick={onClick} data-testid="global-operation-banner">
        <span style={{ flexShrink: 0 }}>✕</span>
        <span style={LABEL_STYLE}>{op.customerName} — Errore: {op.error}</span>
        <button
          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "16px", padding: "2px 6px", flexShrink: 0 }}
          onClick={(e) => { e.stopPropagation(); onDismiss(op.jobId); }}
          aria-label="Chiudi"
          data-testid="banner-close-btn"
        >✕</button>
      </div>
    );
  }

  if (op.status === "completed") {
    return (
      <div style={USER_STRIPE_COMPLETED} onClick={onClick} data-testid="global-operation-banner">
        <span style={{ flexShrink: 0 }}>✓</span>
        <span style={LABEL_STYLE}>{op.customerName} — {op.completedLabel ?? op.label}</span>
        <span style={{ ...CHEVRON_STYLE, color: "#065f46" }}>{isExpanded ? "▲" : "▸"}</span>
      </div>
    );
  }

  return (
    <div style={USER_STRIPE_ACTIVE} onClick={onClick} data-testid="global-operation-banner">
      {op.status === 'active'
        ? <span style={SPINNER_STYLE} data-testid="banner-spinner" />
        : <span style={{ fontSize: "14px", flexShrink: 0 }} data-testid="banner-queued-icon">⏳</span>
      }
      <span style={LABEL_STYLE}>{op.customerName} — {op.label}</span>
      {op.status === "active" && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <div style={PROGRESS_TRACK_STYLE}>
            <div style={progressFillStyle(op.progress)} />
          </div>
          <span style={{ fontSize: "12px", fontWeight: 700, minWidth: "36px", textAlign: "right", opacity: 0.95 }}>
            {op.progress}%
          </span>
        </div>
      )}
      {extraBadgeCount > 0 && <span style={QUEUE_BADGE_STYLE}>+{extraBadgeCount} in coda</span>}
      <span style={{ ...CHEVRON_STYLE, opacity: 1 }}>{isExpanded ? "▲" : "▸"}</span>
    </div>
  );
}

function BgStripe({ bgOps, isExpanded, onClick }: { bgOps: TrackedOperation[]; isExpanded: boolean; onClick: () => void }) {
  const label = bgOps
    .map(op => op.label || op.operationType || 'sync')
    .join(', ');
  return (
    <div style={BG_STRIPE_STYLE} onClick={onClick}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a3e635", flexShrink: 0, animation: "gob-pulse 2s ease-in-out infinite" }} />
      <span style={{ flex: 1, fontSize: "11px", color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>{isExpanded ? "▲" : "›"}</span>
    </div>
  );
}

function GlobalOperationBanner() {
  const { userOperations, backgroundOperations, dismissOperation, cancelOperation } = useOperationTracking();
  const { pendingCount } = useDownloadQueue();
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  const bannerVisible = userOperations.length > 0 || backgroundOperations.length > 0 || pendingCount > 0;

  useEffect(() => {
    if (bannerVisible) {
      document.documentElement.style.setProperty('--banner-height', BANNER_HEIGHT_CSS);
    } else {
      document.documentElement.style.removeProperty('--banner-height');
    }
    return () => { document.documentElement.style.removeProperty('--banner-height'); };
  }, [bannerVisible]);

  useEffect(() => {
    if (!bannerVisible) setIsExpanded(false);
  }, [bannerVisible]);

  const handleToggle = useCallback(() => setIsExpanded(prev => !prev), []);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
    setIsExpanded(false);
  }, [navigate]);

  if (!bannerVisible) return null;

  // Primary user operation: prefer active, then queued, then first available
  const primaryUserOp = userOperations.find(o => o.status === "active")
    ?? userOperations.find(o => o.status === "queued")
    ?? userOperations[0];

  const extraBadgeCount = primaryUserOp
    ? userOperations.filter(o => o.jobId !== primaryUserOp.jobId && (o.status === "queued" || o.status === "active")).length + pendingCount
    : pendingCount;

  return (
    <>
      <style>{ANIMATION_STYLES}</style>
      <style>{APP_MAIN_SPACER}</style>

      {isExpanded && (
        <QueueDrawer
          isOpen={isExpanded}
          userOperations={userOperations}
          bgOperations={backgroundOperations}
          onClose={() => setIsExpanded(false)}
          onCancel={cancelOperation}
          onNavigate={handleNavigate}
        />
      )}

      <div style={WRAP_STYLE}>
        {/* User stripe — renders when there are user ops or pending downloads */}
        {(primaryUserOp || pendingCount > 0) && (
          primaryUserOp
            ? <UserStripe
                op={primaryUserOp}
                extraBadgeCount={extraBadgeCount}
                isExpanded={isExpanded}
                onClick={handleToggle}
                onDismiss={dismissOperation}
              />
            : (
              <div style={USER_STRIPE_ACTIVE} onClick={handleToggle} data-testid="global-operation-banner">
                <span style={SPINNER_STYLE} data-testid="banner-spinner" />
                <span style={LABEL_STYLE}>Preparazione download...</span>
                <span style={QUEUE_BADGE_STYLE}>{pendingCount} in coda</span>
              </div>
            )
        )}

        {/* Background sync stripe — renders only when there are active bg syncs */}
        {backgroundOperations.length > 0 && (
          <BgStripe bgOps={backgroundOperations} isExpanded={isExpanded} onClick={handleToggle} />
        )}
      </div>
    </>
  );
}

export { GlobalOperationBanner };

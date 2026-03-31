import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  useOperationTracking,
  type TrackedOperation,
} from "../contexts/OperationTrackingContext";

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
`;

const bannerBaseStyle: CSSProperties = {
  padding: "12px 16px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  cursor: "pointer",
  fontSize: "13px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  animation: "gob-slide-up 0.3s ease-out",
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 1100,
  boxShadow: "0 -3px 16px rgba(0,0,0,0.3)",
};

const activeBannerStyle: CSSProperties = {
  ...bannerBaseStyle,
  background: "linear-gradient(135deg, #0984e3, #6c5ce7)",
  color: "#fff",
};

const completedBannerStyle: CSSProperties = {
  ...bannerBaseStyle,
  background: "#d1fae5",
  color: "#065f46",
};

const failedBannerStyle: CSSProperties = {
  ...bannerBaseStyle,
  background: "#fee2e2",
  color: "#991b1b",
};

const progressBarContainerStyle: CSSProperties = {
  width: "160px",
  flexShrink: 0,
  height: "10px",
  background: "rgba(255,255,255,0.2)",
  borderRadius: "5px",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.25)",
};

const progressBarFillStyle = (progress: number): CSSProperties => ({
  height: "100%",
  width: `${progress}%`,
  borderRadius: "3px",
  background: "linear-gradient(90deg, rgba(255,255,255,0.8), rgba(255,255,255,1))",
  backgroundSize: "200% 100%",
  animation: progress < 100 ? "gob-shimmer 1.5s linear infinite" : "none",
  transition: "width 0.3s ease",
});

const spinnerStyle: CSSProperties = {
  display: "inline-block",
  width: "14px",
  height: "14px",
  border: "2px solid rgba(255,255,255,0.3)",
  borderTopColor: "#fff",
  borderRadius: "50%",
  animation: "gob-spin 0.8s linear infinite",
  flexShrink: 0,
};

const chevronStyle: CSSProperties = {
  fontSize: "16px",
  opacity: 0.7,
  flexShrink: 0,
};

const closeBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  fontSize: "16px",
  padding: "2px 6px",
  borderRadius: "4px",
  flexShrink: 0,
};

const labelStyle: CSSProperties = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};

function summarizeOperations(ops: TrackedOperation[]) {
  const completed = ops.filter((o) => o.status === "completed").length;
  const failed = ops.filter((o) => o.status === "failed").length;
  const inProgress = ops.filter((o) => o.status === "active" || o.status === "queued").length;
  const totalProgress = ops.reduce((sum, o) => sum + o.progress, 0);
  const avgProgress = ops.length > 0 ? Math.round(totalProgress / ops.length) : 0;

  const parts: string[] = [];
  if (completed > 0) parts.push(`${completed} completat${completed === 1 ? "o" : "i"}`);
  if (inProgress > 0) parts.push(`${inProgress} in corso`);
  if (failed > 0) parts.push(`${failed} fallito${failed === 1 ? "" : "i"}`);

  return {
    text: `${ops.length} ordini in elaborazione (${parts.join(", ")})`,
    avgProgress,
    hasActive: inProgress > 0,
    hasFailed: failed > 0,
  };
}

function GlobalOperationBanner() {
  const { activeOperations, dismissOperation } = useOperationTracking();
  const navigate = useNavigate();

  if (activeOperations.length === 0) {
    return null;
  }

  const handleClick = () => {
    navigate("/pending-orders");
  };

  if (activeOperations.length === 1) {
    const op = activeOperations[0];

    if (op.status === "failed") {
      return (
        <>
          <style>{ANIMATION_STYLES}</style>
          <div
            style={failedBannerStyle}
            onClick={handleClick}
            data-testid="global-operation-banner"
          >
            <span style={{ flexShrink: 0 }}>&#10005;</span>
            <span style={labelStyle}>
              {op.customerName} — Errore: {op.error}
            </span>
            <button
              style={closeBtnStyle}
              onClick={(e) => {
                e.stopPropagation();
                dismissOperation(op.orderId);
              }}
              aria-label="Chiudi"
              data-testid="banner-close-btn"
            >
              &#10005;
            </button>
          </div>
        </>
      );
    }

    if (op.status === "completed") {
      return (
        <>
          <style>{ANIMATION_STYLES}</style>
          <div
            style={completedBannerStyle}
            onClick={handleClick}
            data-testid="global-operation-banner"
          >
            <span style={{ flexShrink: 0 }}>&#10003;</span>
            <span style={labelStyle}>
              {op.customerName} — Ordine completato
            </span>
            <span style={chevronStyle}>&#8250;</span>
          </div>
        </>
      );
    }

    return (
      <>
        <style>{ANIMATION_STYLES}</style>
        <div
          style={activeBannerStyle}
          onClick={handleClick}
          data-testid="global-operation-banner"
        >
          <span style={spinnerStyle} data-testid="banner-spinner" />
          <span style={labelStyle}>
            {op.customerName} — {op.label}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            <div style={progressBarContainerStyle}>
              <div style={progressBarFillStyle(op.progress)} />
            </div>
            <span style={{ fontSize: "12px", fontWeight: 700, minWidth: "36px", textAlign: "right", opacity: 0.95 }}>
              {op.progress}%
            </span>
          </div>
          <span style={chevronStyle}>&#8250;</span>
        </div>
      </>
    );
  }

  const summary = summarizeOperations(activeOperations);

  const style = summary.hasFailed && !summary.hasActive
    ? failedBannerStyle
    : activeBannerStyle;

  return (
    <>
      <style>{ANIMATION_STYLES}</style>
      <div
        style={style}
        onClick={handleClick}
        data-testid="global-operation-banner"
      >
        {summary.hasActive ? (
          <span style={spinnerStyle} data-testid="banner-spinner" />
        ) : (
          <span style={{ flexShrink: 0 }}>&#9201;</span>
        )}
        <span style={labelStyle}>{summary.text}</span>
        {summary.hasActive && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            <div style={progressBarContainerStyle}>
              <div style={progressBarFillStyle(summary.avgProgress)} />
            </div>
            <span style={{ fontSize: "12px", fontWeight: 700, minWidth: "36px", textAlign: "right", opacity: 0.95 }}>
              {summary.avgProgress}%
            </span>
          </div>
        )}
        <span style={chevronStyle}>&#8250;</span>
      </div>
    </>
  );
}

export { GlobalOperationBanner, summarizeOperations };

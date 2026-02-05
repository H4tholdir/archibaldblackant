import type { CSSProperties } from "react";

interface JobProgressBarProps {
  progress: number;
  operation: string;
  status: "idle" | "started" | "processing" | "completed" | "failed";
  error?: string;
}

export function JobProgressBar({
  progress,
  operation,
  status,
  error,
}: JobProgressBarProps) {
  const getColors = () => {
    switch (status) {
      case "completed":
        return { bg: "#d1fae5", bar: "#10b981", text: "#065f46" };
      case "failed":
        return { bg: "#fee2e2", bar: "#ef4444", text: "#991b1b" };
      default:
        return { bg: "#dbeafe", bar: "#3b82f6", text: "#1e40af" };
    }
  };

  const colors = getColors();

  const containerStyle: CSSProperties = {
    width: "100%",
    marginTop: "0.75rem",
    marginBottom: "0.75rem",
  };

  const backgroundStyle: CSSProperties = {
    width: "100%",
    height: "32px",
    backgroundColor: colors.bg,
    borderRadius: "8px",
    overflow: "hidden",
    position: "relative",
    border: `1px solid ${colors.bar}`,
  };

  const barStyle: CSSProperties = {
    height: "100%",
    width: `${progress}%`,
    backgroundColor: colors.bar,
    transition: "width 0.3s ease, background-color 0.3s ease",
    position: "absolute",
    left: 0,
    top: 0,
  };

  const shimmerStyle: CSSProperties =
    status === "processing"
      ? {
          position: "absolute",
          top: 0,
          left: "-100%",
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
          animation: "shimmer 2s infinite",
        }
      : {};

  const labelStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "0.875rem",
    fontWeight: "600",
    color: colors.text,
    zIndex: 10,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "90%",
  };

  return (
    <div style={containerStyle}>
      <style>
        {`@keyframes shimmer { 0% { left: -100%; } 100% { left: 100%; } }`}
      </style>
      <div style={backgroundStyle}>
        <div style={barStyle}>
          {status === "processing" && <div style={shimmerStyle} />}
        </div>
        <div style={labelStyle}>
          {operation} ({progress}%)
        </div>
      </div>
      {error && (
        <div
          style={{
            marginTop: "0.5rem",
            fontSize: "0.8125rem",
            color: "#991b1b",
          }}
        >
          Errore: {error}
        </div>
      )}
    </div>
  );
}

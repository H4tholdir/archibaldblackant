import { useEffect } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  message: ToastMessage;
  onClose: (id: string) => void;
}

function Toast({ message, onClose }: ToastProps) {
  useEffect(() => {
    const duration = message.duration || 4000;
    const timer = setTimeout(() => {
      onClose(message.id);
    }, duration);

    return () => clearTimeout(timer);
  }, [message.id, message.duration, onClose]);

  const colors = {
    success: {
      bg: "#10b981",
      border: "#059669",
      icon: "✓",
    },
    error: {
      bg: "#ef4444",
      border: "#dc2626",
      icon: "✕",
    },
    info: {
      bg: "#3b82f6",
      border: "#2563eb",
      icon: "ℹ",
    },
    warning: {
      bg: "#f59e0b",
      border: "#d97706",
      icon: "⚠",
    },
  };

  const style = colors[message.type];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "1rem 1.25rem",
        backgroundColor: style.bg,
        color: "white",
        borderRadius: "8px",
        border: `2px solid ${style.border}`,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        minWidth: "300px",
        maxWidth: "500px",
        animation: "slideIn 0.3s ease-out",
        marginBottom: "0.5rem",
      }}
    >
      <div
        style={{
          fontSize: "1.25rem",
          fontWeight: "bold",
          flexShrink: 0,
        }}
      >
        {style.icon}
      </div>
      <div style={{ flex: 1, fontSize: "0.95rem" }}>{message.message}</div>
      <button
        onClick={() => onClose(message.id)}
        style={{
          background: "rgba(255, 255, 255, 0.2)",
          border: "none",
          color: "white",
          borderRadius: "4px",
          padding: "0.25rem 0.5rem",
          cursor: "pointer",
          fontSize: "0.875rem",
          fontWeight: "600",
        }}
        title="Chiudi"
      >
        ✕
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <>
      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
      <div
        style={{
          position: "fixed",
          top: "1rem",
          right: "1rem",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        }}
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} message={toast} onClose={onClose} />
        ))}
      </div>
    </>
  );
}

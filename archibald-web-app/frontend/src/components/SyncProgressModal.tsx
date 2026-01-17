interface SyncProgressModalProps {
  isOpen: boolean;
  type: "sync" | "reset";
  progress: {
    isRunning: boolean;
    phase: string;
    message: string;
    progress: number;
    ordersProcessed?: number;
    totalOrders?: number;
    error?: string | null;
  };
  onClose: () => void;
}

export function SyncProgressModal({
  isOpen,
  type,
  progress,
  onClose,
}: SyncProgressModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        // Close on backdrop click only if not in progress
        if (e.target === e.currentTarget && progress.progress === 100) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "16px",
          padding: "32px",
          maxWidth: "500px",
          width: "90%",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "24px", textAlign: "center" }}>
          <div
            style={{
              fontSize: "48px",
              marginBottom: "16px",
              animation: progress.error ? "shake 0.5s" : "pulse 2s infinite",
            }}
          >
            {progress.error ? "⚠️" : "⏳"}
          </div>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: progress.error ? "#f44336" : "#333",
              marginBottom: "8px",
            }}
          >
            {progress.error
              ? "Errore Sincronizzazione"
              : type === "reset"
                ? "Reset e Sincronizzazione"
                : "Sincronizzazione Ordini"}
          </h2>
        </div>

        {/* Error message */}
        {progress.error && (
          <div
            style={{
              backgroundColor: "#ffebee",
              border: "2px solid #f44336",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "24px",
            }}
          >
            <p
              style={{
                fontSize: "14px",
                color: "#c62828",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {progress.error}
            </p>
          </div>
        )}

        {/* Progress section */}
        {!progress.error && (
          <>
            {/* Status message */}
            <div style={{ marginBottom: "16px", textAlign: "center" }}>
              <p
                style={{
                  fontSize: "16px",
                  color: "#666",
                  marginBottom: "8px",
                }}
              >
                {progress.message}
              </p>
              {progress.ordersProcessed !== undefined &&
                progress.totalOrders !== undefined && (
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#999",
                      margin: 0,
                    }}
                  >
                    {progress.ordersProcessed} / {progress.totalOrders} ordini
                  </p>
                )}
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "#e0e0e0",
                borderRadius: "4px",
                overflow: "hidden",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  width: `${progress.progress}%`,
                  height: "100%",
                  backgroundColor: "#1976d2",
                  borderRadius: "4px",
                  transition: "width 0.5s ease-in-out",
                }}
              />
            </div>

            {/* Progress percentage */}
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <p
                style={{
                  fontSize: "14px",
                  color: "#999",
                  margin: 0,
                }}
              >
                {progress.progress}% completato
              </p>
            </div>

            {/* Info message */}
            <div
              style={{
                backgroundColor: "#e3f2fd",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "24px",
              }}
            >
              <p
                style={{
                  fontSize: "13px",
                  color: "#1976d2",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                💡 <strong>Suggerimento:</strong> Questa operazione può
                richiedere alcuni minuti a seconda del numero di ordini da
                sincronizzare. Non chiudere la finestra.
              </p>
            </div>
          </>
        )}

        {/* Close button (only shown on error or completion) */}
        {(progress.error || progress.progress === 100) && (
          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "16px",
              fontWeight: 600,
              backgroundColor: progress.error ? "#f44336" : "#4caf50",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = progress.error
                ? "#d32f2f"
                : "#43a047";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = progress.error
                ? "#f44336"
                : "#4caf50";
            }}
          >
            {progress.error ? "Chiudi" : "✓ Completato"}
          </button>
        )}

        {/* Animations */}
        <style>
          {`
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.1); opacity: 0.8; }
            }
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
              20%, 40%, 60%, 80% { transform: translateX(5px); }
            }
          `}
        </style>
      </div>
    </div>
  );
}

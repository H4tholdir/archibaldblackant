interface CustomerSyncModalProps {
  isOpen: boolean;
  progress: {
    isRunning: boolean;
    status: "idle" | "syncing" | "completed" | "error";
    message: string;
    customersProcessed: number;
    currentPage: number;
    totalPages: number;
    error?: string | null;
  };
  onClose: () => void;
}

export function CustomerSyncModal({
  isOpen,
  progress,
  onClose,
}: CustomerSyncModalProps) {
  if (!isOpen) return null;

  const getProgressPercentage = (): number => {
    if (progress.status === "completed") return 100;
    if (progress.status === "error") return 0;
    if (progress.totalPages === 0) return 10;
    return Math.round((progress.currentPage / progress.totalPages) * 100);
  };

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
        // Close on backdrop click only if completed or error
        if (
          e.target === e.currentTarget &&
          (progress.status === "completed" || progress.status === "error")
        ) {
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
              animation:
                progress.error || progress.status === "error"
                  ? "shake 0.5s"
                  : progress.status === "completed"
                    ? "none"
                    : "pulse 2s infinite",
            }}
          >
            {progress.error || progress.status === "error"
              ? "⚠️"
              : progress.status === "completed"
                ? "✅"
                : "⏳"}
          </div>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color:
                progress.error || progress.status === "error"
                  ? "#f44336"
                  : progress.status === "completed"
                    ? "#4caf50"
                    : "#333",
              marginBottom: "8px",
            }}
          >
            {progress.error || progress.status === "error"
              ? "Errore Sincronizzazione"
              : progress.status === "completed"
                ? "Sincronizzazione Completata"
                : "Sincronizzazione Clienti"}
          </h2>
        </div>

        {/* Error message */}
        {(progress.error || progress.status === "error") && (
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
              {progress.error ||
                "Errore sconosciuto durante la sincronizzazione"}
            </p>
          </div>
        )}

        {/* Progress section */}
        {progress.status !== "error" && !progress.error && (
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
                {progress.message || "Sincronizzazione in corso..."}
              </p>
              {progress.customersProcessed > 0 && (
                <p
                  style={{
                    fontSize: "14px",
                    color: "#999",
                    margin: 0,
                  }}
                >
                  {progress.customersProcessed} clienti elaborati
                  {progress.totalPages > 0 &&
                    ` (pagina ${progress.currentPage} di ${progress.totalPages})`}
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
                  width: `${getProgressPercentage()}%`,
                  height: "100%",
                  backgroundColor:
                    progress.status === "completed" ? "#4caf50" : "#1976d2",
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
                {getProgressPercentage()}% completato
              </p>
            </div>

            {/* Info message - only show during sync */}
            {progress.status === "syncing" && (
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
                  💡 <strong>Suggerimento:</strong> La sincronizzazione dei
                  clienti può richiedere alcuni minuti. Non chiudere la
                  finestra.
                </p>
              </div>
            )}

            {/* Success message */}
            {progress.status === "completed" && (
              <div
                style={{
                  backgroundColor: "#e8f5e9",
                  borderRadius: "8px",
                  padding: "12px",
                  marginBottom: "24px",
                }}
              >
                <p
                  style={{
                    fontSize: "13px",
                    color: "#2e7d32",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  ✅ Sincronizzazione completata con successo!{" "}
                  {progress.customersProcessed > 0 &&
                    `${progress.customersProcessed} clienti sincronizzati.`}
                </p>
              </div>
            )}
          </>
        )}

        {/* Close button (only shown on error or completion) */}
        {(progress.error ||
          progress.status === "error" ||
          progress.status === "completed") && (
          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "16px",
              fontWeight: 600,
              backgroundColor:
                progress.error || progress.status === "error"
                  ? "#f44336"
                  : "#4caf50",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                progress.error || progress.status === "error"
                  ? "#d32f2f"
                  : "#43a047";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                progress.error || progress.status === "error"
                  ? "#f44336"
                  : "#4caf50";
            }}
          >
            {progress.error || progress.status === "error"
              ? "Chiudi"
              : "✓ Completato"}
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

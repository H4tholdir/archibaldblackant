interface ErrorDetailsModalProps {
  error: {
    type: string;
    error: string;
    timestamp: string;
  } | null;
  onClose: () => void;
}

export default function ErrorDetailsModal({
  error,
  onClose,
}: ErrorDetailsModalProps) {
  if (!error) return null;

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
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "24px",
          width: "80vw",
          maxWidth: "900px",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            marginBottom: "20px",
            borderBottom: "2px solid #eee",
            paddingBottom: "16px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: 600,
              color: "#333",
            }}
          >
            ❌ Sync Error Details
          </h2>
          <p style={{ margin: "8px 0 0 0", fontSize: "14px", color: "#666" }}>
            <strong>Type:</strong> {error.type} | <strong>Time:</strong>{" "}
            {new Date(error.timestamp).toLocaleString("it-IT")}
          </p>
        </div>

        {/* Error Message */}
        <div style={{ marginBottom: "20px" }}>
          <h3
            style={{
              margin: "0 0 8px 0",
              fontSize: "16px",
              fontWeight: 600,
              color: "#d32f2f",
            }}
          >
            Error Message
          </h3>
          <div
            style={{
              padding: "12px",
              backgroundColor: "#ffebee",
              border: "1px solid #f44336",
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: "13px",
              color: "#c62828",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error.error}
          </div>
        </div>

        {/* Stack Trace */}
        <div style={{ marginBottom: "20px" }}>
          <h3
            style={{
              margin: "0 0 8px 0",
              fontSize: "16px",
              fontWeight: 600,
              color: "#333",
            }}
          >
            Stack Trace
          </h3>
          <div
            style={{
              padding: "12px",
              backgroundColor: "#f5f5f5",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: "12px",
              color: "#333",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "300px",
              overflow: "auto",
            }}
          >
            {error.error.includes("\n")
              ? error.error
              : "Stack trace not available"}
          </div>
        </div>

        {/* Close Button */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 24px",
              backgroundColor: "#2196f3",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

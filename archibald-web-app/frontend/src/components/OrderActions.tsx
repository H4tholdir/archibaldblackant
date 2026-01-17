export interface OrderActionsProps {
  orderId: string;
  currentState: string;
  archibaldOrderId?: string;
  onSendToMilano: () => void;
  onEdit: () => void;
}

export function OrderActions({
  orderId: _orderId,
  currentState,
  archibaldOrderId: _archibaldOrderId,
  onSendToMilano,
  onEdit,
}: OrderActionsProps) {
  // Determine which buttons to show based on current state
  const showSendToMilano = currentState === "piazzato";
  const showEdit = currentState === "creato";
  const showNotModifiable = !showSendToMilano && !showEdit;

  return (
    <div
      style={{
        marginTop: "16px",
        paddingTop: "16px",
        borderTop: "1px solid #e0e0e0",
      }}
    >
      <div
        style={{
          fontSize: "14px",
          fontWeight: 600,
          marginBottom: "12px",
          color: "#333",
        }}
      >
        Azioni
      </div>

      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        {/* Send to Milano Button - only for "piazzato" state */}
        {showSendToMilano && (
          <>
            <button
              onClick={onSendToMilano}
              style={{
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: "#ffc107",
                color: "#333",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#ffb300";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 4px 8px rgba(0, 0, 0, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#ffc107";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 2px 4px rgba(0, 0, 0, 0.1)";
              }}
            >
              <span>⚠️</span>
              <span>Invia a Milano</span>
            </button>
            {/* Info message for piazzato orders */}
            <div
              style={{
                padding: "8px 12px",
                fontSize: "12px",
                fontWeight: 500,
                backgroundColor: "#fff3cd",
                color: "#856404",
                border: "1px solid #ffeaa7",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>ℹ️</span>
              <span>Modificabile solo su Archibald</span>
            </div>
          </>
        )}

        {/* Buttons for "creato" state (draft orders) */}
        {showEdit && (
          <>
            <button
              onClick={onSendToMilano}
              style={{
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: "#4caf50",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#388e3c";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 4px 8px rgba(0, 0, 0, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#4caf50";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 2px 4px rgba(0, 0, 0, 0.1)";
              }}
            >
              <span>🚀</span>
              <span>Invia ad Archibald</span>
            </button>
            <button
              onClick={onEdit}
              style={{
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#1565c0";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 4px 8px rgba(0, 0, 0, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#1976d2";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 2px 4px rgba(0, 0, 0, 0.1)";
              }}
            >
              <span>✏️</span>
              <span>Modifica</span>
            </button>
          </>
        )}

        {/* Not Modifiable Message - for all other states */}
        {showNotModifiable && (
          <div
            style={{
              padding: "12px 20px",
              fontSize: "14px",
              fontWeight: 600,
              backgroundColor: "#f5f5f5",
              color: "#999",
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>🔒</span>
            <span>Ordine non modificabile</span>
          </div>
        )}
      </div>
    </div>
  );
}

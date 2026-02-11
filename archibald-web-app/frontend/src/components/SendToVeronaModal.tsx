export interface SendToVeronaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  orderId: string;
  customerName: string;
  isLoading: boolean;
}

export function SendToVeronaModal({
  isOpen,
  onClose,
  onConfirm,
  orderId,
  customerName,
  isLoading,
}: SendToVeronaModalProps) {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isLoading) {
      onClose();
    }
  };

  const handleConfirm = () => {
    if (!isLoading) {
      onConfirm();
    }
  };

  const handleCancel = () => {
    if (!isLoading) {
      onClose();
    }
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
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          maxWidth: "500px",
          width: "100%",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
          animation: "modalSlideIn 0.3s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "24px 24px 16px 24px",
            borderBottom: "1px solid #e0e0e0",
          }}
        >
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#333",
              margin: 0,
            }}
          >
            Invia Ordine a Verona
          </h2>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "24px" }}>
          {/* Order Summary */}
          <div
            style={{
              backgroundColor: "#f5f5f5",
              padding: "16px",
              borderRadius: "8px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                color: "#666",
                marginBottom: "8px",
              }}
            >
              <strong>Cliente:</strong> {customerName}
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "#666",
              }}
            >
              <strong>ID Ordine:</strong> {orderId}
            </div>
          </div>

          {/* Warning Box */}
          <div
            style={{
              backgroundColor: "#ffebee",
              border: "2px solid #f44336",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div
                style={{
                  fontSize: "24px",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ⚠️
              </div>
              <div>
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "#d32f2f",
                    marginBottom: "8px",
                  }}
                >
                  Attenzione
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#c62828",
                    lineHeight: 1.5,
                    marginBottom: "8px",
                  }}
                >
                  Dopo l'invio, l'ordine{" "}
                  <strong>NON potrà più essere modificato</strong>.
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#c62828",
                    lineHeight: 1.5,
                    fontWeight: 600,
                  }}
                >
                  Questa azione è irreversibile.
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
            }}
          >
            {/* Cancel Button */}
            <button
              onClick={handleCancel}
              disabled={isLoading}
              style={{
                padding: "12px 24px",
                fontSize: "16px",
                fontWeight: 600,
                backgroundColor: "#fff",
                color: "#666",
                border: "2px solid #ddd",
                borderRadius: "8px",
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.5 : 1,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = "#f5f5f5";
                  e.currentTarget.style.borderColor = "#999";
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = "#fff";
                  e.currentTarget.style.borderColor = "#ddd";
                }
              }}
            >
              Annulla
            </button>

            {/* Confirm Button */}
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              style={{
                padding: "12px 24px",
                fontSize: "16px",
                fontWeight: 600,
                backgroundColor: isLoading ? "#e57373" : "#f44336",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.7 : 1,
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = "#d32f2f";
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = "#f44336";
                }
              }}
            >
              {isLoading && (
                <span
                  style={{
                    display: "inline-block",
                    width: "16px",
                    height: "16px",
                    border: "2px solid #fff",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              )}
              <span>
                {isLoading ? "Invio in corso..." : "Conferma e Invia"}
              </span>
            </button>
          </div>
        </div>

        {/* CSS Animations */}
        <style>
          {`
            @keyframes modalSlideIn {
              from {
                opacity: 0;
                transform: translateY(-20px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }

            @keyframes spin {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(360deg);
              }
            }
          `}
        </style>
      </div>
    </div>
  );
}

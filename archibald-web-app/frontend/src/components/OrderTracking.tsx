export interface OrderTrackingProps {
  ddtNumber?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  trackingCourier?: string;
}

function getCourierColor(courier?: string): string {
  if (!courier) return "#9e9e9e"; // Gray
  const courierLower = courier.toLowerCase();
  if (courierLower.includes("fedex")) return "#4d148c"; // FedEx purple
  if (courierLower.includes("ups")) return "#351c15"; // UPS brown
  if (courierLower.includes("dhl")) return "#d40511"; // DHL red
  return "#9e9e9e"; // Gray default
}

function getCourierIcon(courier?: string): string {
  if (!courier) return "📦";
  const courierLower = courier.toLowerCase();
  if (courierLower.includes("fedex")) return "📦";
  if (courierLower.includes("ups")) return "📦";
  if (courierLower.includes("dhl")) return "📦";
  return "📦";
}

export function OrderTracking({
  ddtNumber,
  trackingNumber,
  trackingUrl,
  trackingCourier,
}: OrderTrackingProps) {
  // If no tracking data at all, show fallback message
  if (!ddtNumber && !trackingNumber) {
    return (
      <div
        style={{
          padding: "16px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          border: "1px solid #e0e0e0",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "14px", color: "#999" }}>
          📦 Tracciamento non ancora disponibile
        </div>
      </div>
    );
  }

  const courierColor = getCourierColor(trackingCourier);
  const courierIcon = getCourierIcon(trackingCourier);

  return (
    <div
      style={{
        padding: "16px",
        backgroundColor: "#f5f5f5",
        borderRadius: "8px",
        border: "1px solid #e0e0e0",
      }}
    >
      {/* DDT Number */}
      {ddtNumber && (
        <div style={{ marginBottom: trackingNumber ? "12px" : "0" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#666",
              marginBottom: "4px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            DDT
          </div>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "#333",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>📦</span>
            <span>{ddtNumber}</span>
          </div>
        </div>
      )}

      {/* Tracking Number */}
      {trackingNumber && (
        <div>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#666",
              marginBottom: "4px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Tracking
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "#333",
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "16px" }}>{courierIcon}</span>
            <div>
              {trackingCourier && (
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: courierColor,
                    marginBottom: "2px",
                  }}
                >
                  {trackingCourier}
                </div>
              )}
              <div style={{ fontSize: "14px", fontWeight: 600 }}>
                {trackingNumber}
              </div>
            </div>
          </div>

          {/* Tracking Link */}
          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                padding: "8px 16px",
                backgroundColor: "#1976d2",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
                borderRadius: "6px",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#1565c0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#1976d2";
              }}
            >
              🔗 Traccia spedizione
            </a>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, type ReactNode } from "react";

export interface OrderItem {
  articleCode: string;
  productName?: string;
  description: string;
  quantity: number;
  price: number;
  discount?: number;
}

export interface StatusUpdate {
  status: string;
  timestamp: string;
  note?: string;
}

export interface Order {
  id: string;
  date: string;
  customerName: string;
  total: string;
  status: string;
  tracking?: {
    courier: string;
    trackingNumber: string;
  };
  ddt?: {
    ddtNumber: string;
    hasTracking: boolean;
  };
  invoice?: {
    invoiceNumber: string;
    invoiceDate: string;
    invoiceAmount: number;
  };
  documents?: Array<{
    type: string;
    name: string;
    url: string;
  }>;
  items?: OrderItem[];
  statusTimeline?: StatusUpdate[];
  customerNotes?: string;
}

interface OrderCardProps {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
  onDocumentsClick?: (orderId: string) => void;
  timelineComponent?: ReactNode;
  token?: string;
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const months = [
      "gen",
      "feb",
      "mar",
      "apr",
      "mag",
      "giu",
      "lug",
      "ago",
      "set",
      "ott",
      "nov",
      "dic",
    ];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateString;
  }
}

function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();
  if (statusLower.includes("evaso")) return "#4caf50"; // Green
  if (statusLower.includes("spedito")) return "#9c27b0"; // Purple
  if (statusLower.includes("lavorazione")) return "#2196f3"; // Blue
  return "#9e9e9e"; // Gray default
}

function StatusBadge({ status }: { status: string }) {
  const backgroundColor = getStatusColor(status);

  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: "16px",
        backgroundColor,
        color: "#fff",
        fontSize: "12px",
        fontWeight: 600,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

function TrackingBadge() {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: "16px",
        backgroundColor: "#e3f2fd",
        color: "#1976d2",
        fontSize: "12px",
        fontWeight: 600,
        border: "1px solid #bbdefb",
      }}
    >
      📦 Tracking disponibile
    </span>
  );
}

function DDTBadge() {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: "16px",
        backgroundColor: "#e8f5e9",
        color: "#2e7d32",
        fontSize: "12px",
        fontWeight: 600,
        border: "1px solid #a5d6a7",
      }}
    >
      📄 DDT disponibile
    </span>
  );
}

function OrderItems({ items }: { items: OrderItem[] }) {
  return (
    <div style={{ marginTop: "16px" }}>
      <div
        style={{
          fontSize: "14px",
          fontWeight: 600,
          marginBottom: "12px",
          color: "#333",
        }}
      >
        Articoli
      </div>
      <div
        style={{
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          padding: "12px",
        }}
      >
        {items.map((item, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: "8px",
              marginBottom: "8px",
              borderBottom:
                index < items.length - 1 ? "1px solid #e0e0e0" : "none",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#333" }}>
                {item.articleCode}
              </div>
              {item.productName && (
                <div
                  style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}
                >
                  {item.productName}
                </div>
              )}
              {item.description && (
                <div
                  style={{ fontSize: "12px", color: "#999", marginTop: "2px" }}
                >
                  {item.description}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right", marginLeft: "16px" }}>
              <div style={{ fontSize: "14px", color: "#333" }}>
                {item.quantity} x {item.price.toFixed(2)} €
              </div>
              {item.discount !== undefined && item.discount > 0 && (
                <div style={{ fontSize: "12px", color: "#f44336" }}>
                  -{item.discount}%
                </div>
              )}
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#333",
                  marginTop: "4px",
                }}
              >
                {(
                  (item.price * item.quantity * (100 - (item.discount || 0))) /
                  100
                ).toFixed(2)}{" "}
                €
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentsList({
  documents,
}: {
  documents: Array<{ type: string; name: string; url: string }>;
}) {
  return (
    <div style={{ marginTop: "16px" }}>
      <div
        style={{
          fontSize: "14px",
          fontWeight: 600,
          marginBottom: "12px",
          color: "#333",
        }}
      >
        Documenti
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {documents.map((doc, index) => (
          <a
            key={index}
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px",
              backgroundColor: "#f5f5f5",
              borderRadius: "8px",
              textDecoration: "none",
              color: "#1976d2",
              fontSize: "14px",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#e3f2fd";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#f5f5f5";
            }}
          >
            <span style={{ marginRight: "8px" }}>📄</span>
            <div>
              <div style={{ fontWeight: 600 }}>{doc.name}</div>
              <div style={{ fontSize: "12px", color: "#666" }}>{doc.type}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function DDTSection({ order, token }: { order: Order; token?: string }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order.ddt) {
    return null;
  }

  const handleDownloadDDT = async () => {
    if (!token) {
      setError("Token di autenticazione mancante");
      return;
    }

    if (!order.ddt.hasTracking) {
      setError(
        "Tracking non disponibile: il PDF DDT non può essere generato senza un codice di tracciamento attivo",
      );
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${order.id}/ddt/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Errore durante il download");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ddt-${order.ddt.ddtNumber.replace(/\//g, "-")}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Errore sconosciuto";
      setError(errorMessage);
      console.error("DDT download error:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div style={{ marginTop: "16px" }}>
      <div
        style={{
          fontSize: "14px",
          fontWeight: 600,
          marginBottom: "8px",
          color: "#333",
        }}
      >
        Documento di Trasporto (DDT)
      </div>
      <div
        style={{
          padding: "12px",
          backgroundColor: "#e8f5e9",
          borderRadius: "8px",
          border: "1px solid #a5d6a7",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            color: "#333",
            marginBottom: "12px",
          }}
        >
          <strong>Numero DDT:</strong> {order.ddt.ddtNumber}
        </div>
        <button
          onClick={handleDownloadDDT}
          disabled={isDownloading || !order.ddt.hasTracking}
          style={{
            padding: "8px 16px",
            backgroundColor:
              isDownloading || !order.ddt.hasTracking ? "#ccc" : "#4caf50",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 600,
            cursor:
              isDownloading || !order.ddt.hasTracking
                ? "not-allowed"
                : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "100%",
            justifyContent: "center",
          }}
        >
          {isDownloading ? (
            <>
              <span>⏳</span>
              <span>Download in corso...</span>
            </>
          ) : !order.ddt.hasTracking ? (
            <>
              <span>🔒</span>
              <span>Download disponibile dopo attivazione tracking</span>
            </>
          ) : (
            <>
              <span>📄</span>
              <span>Scarica DDT</span>
            </>
          )}
        </button>
        {error && (
          <div
            style={{
              marginTop: "8px",
              padding: "8px",
              backgroundColor: "#ffebee",
              borderRadius: "4px",
              fontSize: "12px",
              color: "#c62828",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceSection({ order, token }: { order: Order; token?: string }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order.invoice) {
    return (
      <div style={{ marginTop: "16px" }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "8px",
            color: "#333",
          }}
        >
          Fattura
        </div>
        <div
          style={{
            padding: "12px",
            backgroundColor: "#f5f5f5",
            borderRadius: "8px",
            fontSize: "14px",
            color: "#666",
          }}
        >
          Fattura non ancora disponibile
        </div>
      </div>
    );
  }

  const handleDownloadInvoice = async () => {
    if (!token) {
      setError("Token di autenticazione mancante");
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${order.id}/invoice/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Errore durante il download");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${order.invoice.invoiceNumber.replace(/\//g, "-")}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Errore sconosciuto";
      setError(errorMessage);
      console.error("Invoice download error:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  return (
    <div style={{ marginTop: "16px" }}>
      <div
        style={{
          fontSize: "14px",
          fontWeight: 600,
          marginBottom: "8px",
          color: "#333",
        }}
      >
        Fattura
      </div>
      <div
        style={{
          padding: "12px",
          backgroundColor: "#e8f5e9",
          borderRadius: "8px",
          border: "1px solid #a5d6a7",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            color: "#333",
            marginBottom: "4px",
          }}
        >
          <strong>Numero:</strong> {order.invoice.invoiceNumber}
        </div>
        <div
          style={{
            fontSize: "14px",
            color: "#333",
            marginBottom: "4px",
          }}
        >
          <strong>Data:</strong> {formatDate(order.invoice.invoiceDate)}
        </div>
        <div
          style={{
            fontSize: "14px",
            color: "#333",
            marginBottom: "12px",
          }}
        >
          <strong>Importo:</strong>{" "}
          {formatCurrency(order.invoice.invoiceAmount)}
        </div>
        <button
          onClick={handleDownloadInvoice}
          disabled={isDownloading}
          style={{
            padding: "8px 16px",
            backgroundColor: isDownloading ? "#ccc" : "#4caf50",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: isDownloading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "100%",
            justifyContent: "center",
          }}
        >
          {isDownloading ? (
            <>
              <span>⏳</span>
              <span>Download in corso...</span>
            </>
          ) : (
            <>
              <span>📄</span>
              <span>Scarica fattura</span>
            </>
          )}
        </button>
        {error && (
          <div
            style={{
              marginTop: "8px",
              padding: "8px",
              backgroundColor: "#ffebee",
              borderRadius: "4px",
              fontSize: "12px",
              color: "#c62828",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export function OrderCard({
  order,
  expanded,
  onToggle,
  onDocumentsClick,
  timelineComponent,
  token,
}: OrderCardProps) {
  const handleCardClick = () => {
    onToggle();
  };

  const handleDocumentsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDocumentsClick) {
      onDocumentsClick(order.id);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        cursor: "pointer",
        transition: "box-shadow 0.2s, transform 0.2s",
        marginBottom: "12px",
      }}
      onClick={handleCardClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Collapsed view - always visible */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#333",
              marginBottom: "4px",
            }}
          >
            {order.customerName}
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "#666",
              marginBottom: "8px",
            }}
          >
            {formatDate(order.date)}
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <StatusBadge status={order.status} />
            {order.tracking && <TrackingBadge />}
            {order.ddt && <DDTBadge />}
          </div>
        </div>
        <div style={{ textAlign: "right", marginLeft: "16px" }}>
          <div
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "#333",
              marginBottom: "8px",
            }}
          >
            {order.total}
          </div>
          <button
            onClick={handleDocumentsClick}
            style={{
              padding: "6px 12px",
              backgroundColor: "transparent",
              color: "#1976d2",
              border: "1px solid #1976d2",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background-color 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#1976d2";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "#1976d2";
            }}
          >
            Vedi documenti
          </button>
        </div>
      </div>

      {/* Expand/collapse icon */}
      <div
        style={{
          marginTop: "12px",
          textAlign: "center",
          fontSize: "20px",
          color: "#999",
        }}
      >
        {expanded ? "▲" : "▼"}
      </div>

      {/* Expanded view */}
      {expanded && (
        <div
          style={{
            marginTop: "16px",
            paddingTop: "16px",
            borderTop: "1px solid #e0e0e0",
          }}
        >
          {/* Customer info */}
          {order.customerNotes && (
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: "#333",
                }}
              >
                Note Cliente
              </div>
              <div
                style={{
                  fontSize: "14px",
                  color: "#666",
                  padding: "12px",
                  backgroundColor: "#f5f5f5",
                  borderRadius: "8px",
                }}
              >
                {order.customerNotes}
              </div>
            </div>
          )}

          {/* Items list */}
          {order.items && order.items.length > 0 && (
            <OrderItems items={order.items} />
          )}

          {/* Timeline */}
          {timelineComponent && (
            <div style={{ marginTop: "16px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "12px",
                  color: "#333",
                }}
              >
                Storico Stati
              </div>
              {timelineComponent}
            </div>
          )}

          {/* Tracking details */}
          {order.tracking && (
            <div style={{ marginTop: "16px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: "#333",
                }}
              >
                Tracking Spedizione
              </div>
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#e3f2fd",
                  borderRadius: "8px",
                  border: "1px solid #bbdefb",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#333",
                    marginBottom: "4px",
                  }}
                >
                  <strong>Corriere:</strong> {order.tracking.courier}
                </div>
                <div style={{ fontSize: "14px", color: "#333" }}>
                  <strong>Tracking:</strong> {order.tracking.trackingNumber}
                </div>
              </div>
            </div>
          )}

          {/* DDT details */}
          <DDTSection order={order} token={token} />

          {/* Invoice details */}
          <InvoiceSection order={order} token={token} />

          {/* Documents */}
          {order.documents && order.documents.length > 0 && (
            <DocumentsList documents={order.documents} />
          )}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import type {
  Order,
  OrderItem,
  StatusUpdate,
  DocumentInfo,
} from "../types/order";

interface OrderCardProps {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDate(dateString: string | undefined): string {
  if (!dateString) return "N/A";
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

function formatDateTime(dateString: string | undefined): string {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return dateString;
  }
}

function getStatusColor(status: string | undefined): string {
  if (!status) return "#9e9e9e";
  const statusLower = status.toLowerCase();
  if (statusLower.includes("evaso")) return "#4caf50"; // Green
  if (statusLower.includes("spedito")) return "#9c27b0"; // Purple
  if (statusLower.includes("lavorazione")) return "#2196f3"; // Blue
  if (statusLower.includes("confermato")) return "#ff9800"; // Orange
  return "#9e9e9e"; // Gray default
}

function getDocumentStateColor(state: string | undefined): string {
  if (!state) return "#9e9e9e";
  const stateLower = state.toLowerCase();
  if (stateLower.includes("completo")) return "#4caf50"; // Green
  if (stateLower.includes("parziale")) return "#ff9800"; // Orange
  if (stateLower.includes("mancante")) return "#f44336"; // Red
  return "#9e9e9e"; // Gray default
}

function getCourierLogo(courier: string | undefined): string {
  if (!courier) return "📦";
  const courierLower = courier.toLowerCase();
  if (courierLower.includes("ups")) return "📦"; // UPS brown
  if (courierLower.includes("fedex")) return "📦"; // FedEx purple
  if (courierLower.includes("dhl")) return "📦"; // DHL yellow
  if (courierLower.includes("tnt")) return "📦"; // TNT orange
  if (courierLower.includes("bartolini")) return "📦"; // Bartolini
  if (courierLower.includes("sda")) return "📦"; // SDA
  return "📦";
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// ============================================================================
// BADGE COMPONENTS
// ============================================================================

function StatusBadge({
  status,
  state,
  lastUpdatedAt,
}: {
  status: string;
  state?: string;
  lastUpdatedAt?: string;
}) {
  const backgroundColor = getStatusColor(status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: "16px",
        backgroundColor,
        color: "#fff",
        fontSize: "12px",
        fontWeight: 600,
        textTransform: "capitalize",
        cursor: state || lastUpdatedAt ? "help" : "default",
      }}
      title={`${state || ""}\n${lastUpdatedAt ? `Aggiornato: ${formatDateTime(lastUpdatedAt)}` : ""}`}
    >
      {status}
    </span>
  );
}

function OrderTypeBadge({ orderType }: { orderType?: string }) {
  if (!orderType) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: "16px",
        backgroundColor: "#e8eaf6",
        color: "#3f51b5",
        fontSize: "12px",
        fontWeight: 600,
        border: "1px solid #c5cae9",
      }}
    >
      📋 {orderType}
    </span>
  );
}

function DocumentStateBadge({ documentState }: { documentState?: string }) {
  if (!documentState) return null;

  const backgroundColor = getDocumentStateColor(documentState);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: "16px",
        backgroundColor,
        color: "#fff",
        fontSize: "12px",
        fontWeight: 600,
      }}
    >
      📄 {documentState}
    </span>
  );
}

function TransferBadge({ transferred }: { transferred?: boolean }) {
  if (!transferred) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: "16px",
        backgroundColor: "#e8f5e9",
        color: "#2e7d32",
        fontSize: "12px",
        fontWeight: 600,
        border: "1px solid #a5d6a7",
      }}
    >
      ✓ Trasferito
    </span>
  );
}

function TrackingBadge({
  trackingNumber,
  trackingUrl,
  trackingCourier,
}: {
  trackingNumber?: string;
  trackingUrl?: string;
  trackingCourier?: string;
}) {
  if (!trackingNumber) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (trackingUrl) {
      window.open(trackingUrl, "_blank");
    }
  };

  return (
    <span
      onClick={handleClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "6px 12px",
        borderRadius: "16px",
        backgroundColor: "#e3f2fd",
        color: "#1976d2",
        fontSize: "12px",
        fontWeight: 600,
        border: "1px solid #bbdefb",
        cursor: trackingUrl ? "pointer" : "default",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        if (trackingUrl) {
          e.currentTarget.style.backgroundColor = "#bbdefb";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "#e3f2fd";
      }}
      title={trackingUrl ? "Clicca per tracciare" : trackingNumber}
    >
      {getCourierLogo(trackingCourier)} {trackingNumber.substring(0, 15)}
      {trackingNumber.length > 15 && "..."}
    </span>
  );
}

function OriginBadge({ salesOrigin }: { salesOrigin?: string }) {
  if (!salesOrigin) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: "16px",
        backgroundColor: "#fff3e0",
        color: "#e65100",
        fontSize: "12px",
        fontWeight: 600,
        border: "1px solid #ffe0b2",
      }}
    >
      🌍 {salesOrigin}
    </span>
  );
}

function DeliveryMethodBadge({ deliveryMethod }: { deliveryMethod?: string }) {
  if (!deliveryMethod) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: "16px",
        backgroundColor: "#f3e5f5",
        color: "#6a1b9a",
        fontSize: "12px",
        fontWeight: 600,
        border: "1px solid #e1bee7",
      }}
    >
      🚚 {deliveryMethod}
    </span>
  );
}

function LocationBadge({
  deliveryCity,
  shippingAddress,
}: {
  deliveryCity?: string;
  shippingAddress?: string;
}) {
  if (!deliveryCity && !shippingAddress) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: "16px",
        backgroundColor: "#fce4ec",
        color: "#c2185b",
        fontSize: "12px",
        fontWeight: 600,
        border: "1px solid #f8bbd0",
        cursor: shippingAddress ? "help" : "default",
      }}
      title={shippingAddress || undefined}
    >
      📍 {deliveryCity || "N/A"}
    </span>
  );
}

// ============================================================================
// TAB CONTENT COMPONENTS
// ============================================================================

function TabPanoramica({ order }: { order: Order }) {
  return (
    <div style={{ padding: "16px" }}>
      {/* Informazioni Ordine */}
      <div style={{ marginBottom: "24px" }}>
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "#333",
          }}
        >
          Informazioni Ordine
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "12px",
          }}
        >
          <InfoField label="Numero Ordine" value={order.orderNumber} copyable />
          <InfoField label="ID Interno" value={order.id} small />
          <InfoField
            label="Data Ordine"
            value={formatDate(order.orderDate || order.date)}
          />
          <InfoField
            label="Data Consegna"
            value={formatDate(order.deliveryDate)}
          />
          <InfoField label="Tipo Ordine" value={order.orderType} />
          <InfoField label="Stato" value={order.status} />
          <InfoField label="Stato Dettagliato" value={order.state} />
          <InfoField label="Stato Documento" value={order.documentState} />
        </div>
      </div>

      {/* Cliente e Agente */}
      <div style={{ marginBottom: "24px" }}>
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "#333",
          }}
        >
          Cliente e Agente
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "12px",
          }}
        >
          <InfoField label="Cliente" value={order.customerName} bold />
          <InfoField
            label="ID Profilo Cliente"
            value={order.customerProfileId}
            small
          />
          <InfoField label="Agente" value={order.agentPersonName} />
          <InfoField
            label="Responsabile Vendite"
            value={order.salesResponsible}
          />
        </div>
      </div>

      {/* Consegna */}
      <div style={{ marginBottom: "24px" }}>
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "#333",
          }}
        >
          Consegna
        </h3>
        <InfoField
          label="Indirizzo Consegna"
          value={order.deliveryAddress}
          multiline
        />
        <InfoField
          label="Indirizzo Spedizione"
          value={order.shippingAddress}
          multiline
        />
        <InfoField label="Termini Consegna" value={order.deliveryTerms} />
      </div>

      {/* Badge Completi */}
      <div style={{ marginTop: "16px" }}>
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "#333",
          }}
        >
          Badge
        </h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <StatusBadge
            status={order.status}
            state={order.state}
            lastUpdatedAt={order.lastUpdatedAt}
          />
          <OrderTypeBadge orderType={order.orderType} />
          <DocumentStateBadge documentState={order.documentState} />
          <TransferBadge transferred={order.transferredToAccountingOffice} />
          <TrackingBadge
            trackingNumber={
              order.tracking?.trackingNumber || order.ddt?.trackingNumber
            }
            trackingUrl={order.tracking?.trackingUrl || order.ddt?.trackingUrl}
            trackingCourier={
              order.tracking?.trackingCourier || order.ddt?.trackingCourier
            }
          />
          <OriginBadge salesOrigin={order.salesOrigin} />
          <DeliveryMethodBadge deliveryMethod={order.ddt?.deliveryMethod} />
          <LocationBadge
            deliveryCity={order.ddt?.deliveryCity}
            shippingAddress={order.shippingAddress}
          />
        </div>
      </div>
    </div>
  );
}

function TabArticoli({ items }: { items?: OrderItem[] }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ padding: "16px", textAlign: "center", color: "#999" }}>
        Nessun articolo disponibile
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={tableHeaderStyle}>Codice Articolo</th>
              <th style={tableHeaderStyle}>Descrizione</th>
              <th style={tableHeaderStyle}>Quantità</th>
              <th style={tableHeaderStyle}>Prezzo Unitario</th>
              <th style={tableHeaderStyle}>Sconto</th>
              <th style={tableHeaderStyle}>Totale Riga</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const lineTotal =
                (item.price * item.quantity * (100 - (item.discount || 0))) /
                100;
              return (
                <tr key={index} style={{ borderBottom: "1px solid #e0e0e0" }}>
                  <td style={tableCellStyle}>
                    <div style={{ fontWeight: 600 }}>{item.articleCode}</div>
                    {item.productName && (
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        {item.productName}
                      </div>
                    )}
                  </td>
                  <td style={tableCellStyle}>{item.description}</td>
                  <td style={tableCellStyle}>{item.quantity}</td>
                  <td style={tableCellStyle}>€ {item.price.toFixed(2)}</td>
                  <td style={tableCellStyle}>
                    {item.discount ? `${item.discount}%` : "-"}
                  </td>
                  <td style={{ ...tableCellStyle, fontWeight: 600 }}>
                    € {lineTotal.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabLogistica({ order }: { order: Order }) {
  const ddt = order.ddt;
  const tracking = order.tracking || {
    trackingNumber: ddt?.trackingNumber,
    trackingUrl: ddt?.trackingUrl,
    trackingCourier: ddt?.trackingCourier,
  };

  return (
    <div style={{ padding: "16px" }}>
      {/* Documento Trasporto (DDT) */}
      {ddt && (
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#333",
            }}
          >
            Documento di Trasporto (DDT)
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "12px",
            }}
          >
            <InfoField label="Numero DDT" value={ddt.ddtNumber} bold copyable />
            <InfoField label="ID DDT" value={ddt.ddtId} small />
            <InfoField
              label="Data Consegna DDT"
              value={formatDate(ddt.ddtDeliveryDate)}
            />
            <InfoField label="ID Ordine Vendita" value={ddt.orderId} />
          </div>
        </div>
      )}

      {/* Informazioni Cliente (da DDT) */}
      {ddt && (
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#333",
            }}
          >
            Informazioni Cliente
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "12px",
            }}
          >
            <InfoField label="Conto Cliente" value={ddt.customerAccountId} />
            <InfoField label="Nome Vendite" value={ddt.salesName} />
            <InfoField label="Nome Consegna" value={ddt.deliveryName} bold />
          </div>
        </div>
      )}

      {/* Tracking */}
      {tracking.trackingNumber && (
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#333",
            }}
          >
            Tracking Spedizione
          </h3>
          <div
            style={{
              padding: "16px",
              backgroundColor: "#e3f2fd",
              borderRadius: "8px",
              border: "1px solid #bbdefb",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <span style={{ fontSize: "32px" }}>
                {getCourierLogo(tracking.trackingCourier)}
              </span>
              <div>
                <div
                  style={{ fontSize: "14px", fontWeight: 600, color: "#333" }}
                >
                  {tracking.trackingCourier?.toUpperCase() || "Corriere"}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#666",
                    fontFamily: "monospace",
                  }}
                >
                  {tracking.trackingNumber}
                  <button
                    onClick={() =>
                      copyToClipboard(tracking.trackingNumber || "")
                    }
                    style={{
                      marginLeft: "8px",
                      padding: "2px 8px",
                      fontSize: "12px",
                      border: "none",
                      backgroundColor: "#1976d2",
                      color: "#fff",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Copia
                  </button>
                </div>
              </div>
            </div>
            {tracking.trackingUrl && (
              <button
                onClick={() => window.open(tracking.trackingUrl, "_blank")}
                style={{
                  width: "100%",
                  padding: "12px",
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#1565c0";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#1976d2";
                }}
              >
                🔗 Traccia Spedizione
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dettagli Consegna */}
      {ddt && (
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#333",
            }}
          >
            Dettagli Consegna
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "12px",
            }}
          >
            <InfoField label="Termini Consegna" value={ddt.deliveryTerms} />
            <InfoField label="Modalità Consegna" value={ddt.deliveryMethod} />
            <InfoField label="Città Consegna" value={ddt.deliveryCity} />
          </div>
        </div>
      )}

      {!ddt && !tracking.trackingNumber && (
        <div style={{ padding: "16px", textAlign: "center", color: "#999" }}>
          Nessuna informazione di logistica disponibile
        </div>
      )}
    </div>
  );
}

function TabFinanziario({ order }: { order: Order }) {
  return (
    <div style={{ padding: "16px" }}>
      {/* Totali */}
      <div style={{ marginBottom: "24px" }}>
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "#333",
          }}
        >
          Totali
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "12px",
          }}
        >
          <div
            style={{
              gridColumn: "1 / -1",
              padding: "16px",
              backgroundColor: "#f5f5f5",
              borderRadius: "8px",
            }}
          >
            <div
              style={{ fontSize: "14px", color: "#666", marginBottom: "4px" }}
            >
              Totale Ordine
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#333" }}>
              {order.total}
            </div>
          </div>
          <InfoField label="Sconto Riga" value={order.lineDiscount} />
          <InfoField label="Sconto Finale" value={order.endDiscount} />
        </div>
      </div>

      {/* Trasferimenti */}
      <div style={{ marginBottom: "24px" }}>
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "#333",
          }}
        >
          Trasferimenti
        </h3>
        <div
          style={{
            padding: "12px",
            backgroundColor: order.transferredToAccountingOffice
              ? "#e8f5e9"
              : "#ffebee",
            borderRadius: "8px",
            border: `1px solid ${order.transferredToAccountingOffice ? "#a5d6a7" : "#ffcdd2"}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>
              {order.transferredToAccountingOffice ? "✓" : "✗"}
            </span>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#333" }}>
                Trasferito a Contabilità
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                {order.transferredToAccountingOffice ? "Sì" : "No"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabStorico({ order }: { order: Order }) {
  const timeline = order.stateTimeline || order.statusTimeline || [];
  const documents = order.documents || [];

  return (
    <div style={{ padding: "16px" }}>
      {/* Timeline Stati */}
      {timeline.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#333",
            }}
          >
            Timeline Stati
          </h3>
          <div style={{ position: "relative", paddingLeft: "24px" }}>
            {/* Vertical line */}
            <div
              style={{
                position: "absolute",
                left: "8px",
                top: "0",
                bottom: "0",
                width: "2px",
                backgroundColor: "#e0e0e0",
              }}
            />
            {timeline.map((update, index) => (
              <div
                key={index}
                style={{ position: "relative", marginBottom: "16px" }}
              >
                {/* Dot */}
                <div
                  style={{
                    position: "absolute",
                    left: "-20px",
                    top: "4px",
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    backgroundColor: "#1976d2",
                    border: "2px solid #fff",
                  }}
                />
                <div
                  style={{
                    padding: "12px",
                    backgroundColor: "#f5f5f5",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#333",
                      }}
                    >
                      {update.status}
                    </span>
                    <span style={{ fontSize: "12px", color: "#666" }}>
                      {formatDateTime(update.timestamp)}
                    </span>
                  </div>
                  {update.user && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#666",
                        marginBottom: "4px",
                      }}
                    >
                      👤 {update.user}
                    </div>
                  )}
                  {update.note && (
                    <div style={{ fontSize: "12px", color: "#999" }}>
                      {update.note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documenti Allegati */}
      {documents.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#333",
            }}
          >
            Documenti Allegati
          </h3>
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
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#e3f2fd";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#f5f5f5";
                }}
              >
                <span style={{ marginRight: "12px", fontSize: "24px" }}>
                  📄
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>
                    {doc.filename || doc.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    {doc.type}
                    {doc.uploadedAt && ` • ${formatDateTime(doc.uploadedAt)}`}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Note Ordine */}
      {(order.notes || order.customerNotes) && (
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#333",
            }}
          >
            Note
          </h3>
          <div
            style={{
              padding: "12px",
              backgroundColor: "#fff9c4",
              borderRadius: "8px",
              border: "1px solid #fff59d",
              fontSize: "14px",
              color: "#333",
              whiteSpace: "pre-wrap",
            }}
          >
            {order.notes || order.customerNotes}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div style={{ marginBottom: "24px" }}>
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "#333",
          }}
        >
          Metadata
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "12px",
          }}
        >
          <InfoField label="Bot User ID" value={order.botUserId} small />
          <InfoField label="Job ID" value={order.jobId} small />
          <InfoField
            label="Creato il"
            value={formatDateTime(order.createdAt)}
          />
          <InfoField
            label="Aggiornato il"
            value={formatDateTime(order.lastUpdatedAt)}
          />
        </div>
      </div>

      {timeline.length === 0 && documents.length === 0 && !order.notes && (
        <div style={{ padding: "16px", textAlign: "center", color: "#999" }}>
          Nessuno storico disponibile
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function InfoField({
  label,
  value,
  bold,
  small,
  copyable,
  multiline,
}: {
  label: string;
  value?: string;
  bold?: boolean;
  small?: boolean;
  copyable?: boolean;
  multiline?: boolean;
}) {
  if (!value) return null;

  return (
    <div style={{ marginBottom: multiline ? "12px" : "0" }}>
      <div style={{ fontSize: "12px", color: "#999", marginBottom: "4px" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: small ? "12px" : "14px",
          fontWeight: bold ? 600 : 400,
          color: small ? "#666" : "#333",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          whiteSpace: multiline ? "pre-wrap" : "nowrap",
          overflow: multiline ? "visible" : "hidden",
          textOverflow: multiline ? "clip" : "ellipsis",
        }}
      >
        {value}
        {copyable && (
          <button
            onClick={() => copyToClipboard(value)}
            style={{
              padding: "2px 8px",
              fontSize: "12px",
              border: "none",
              backgroundColor: "#e0e0e0",
              color: "#333",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            📋
          </button>
        )}
      </div>
    </div>
  );
}

const tableHeaderStyle: React.CSSProperties = {
  padding: "12px",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 600,
  color: "#666",
  borderBottom: "2px solid #e0e0e0",
};

const tableCellStyle: React.CSSProperties = {
  padding: "12px",
  fontSize: "14px",
  color: "#333",
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OrderCardNew({ order, expanded, onToggle }: OrderCardProps) {
  const [activeTab, setActiveTab] = useState<
    "panoramica" | "articoli" | "logistica" | "finanziario" | "storico"
  >("panoramica");

  // DEBUG: Log order data to check ddt and tracking
  if (order.orderNumber === "ORD/26000387") {
    console.log("[OrderCardNew] Order ORD/26000387 data:", {
      orderNumber: order.orderNumber,
      ddt: order.ddt,
      tracking: order.tracking,
      fullOrder: order,
    });
  }

  const tabs = [
    { id: "panoramica" as const, label: "Panoramica", icon: "📊" },
    { id: "articoli" as const, label: "Articoli", icon: "📦" },
    { id: "logistica" as const, label: "Logistica", icon: "🚚" },
    { id: "finanziario" as const, label: "Finanziario", icon: "💰" },
    { id: "storico" as const, label: "Storico", icon: "📜" },
  ];

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        marginBottom: "12px",
        overflow: "hidden",
        transition: "box-shadow 0.2s",
      }}
    >
      {/* ===== COLLAPSED STATE ===== */}
      <div
        onClick={onToggle}
        style={{
          padding: "16px",
          cursor: "pointer",
          transition: "background-color 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#fafafa";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#fff";
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          {/* Left: Customer Name + Date */}
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
              style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}
            >
              {formatDate(order.orderDate || order.date)}
            </div>

            {/* Badges */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <StatusBadge
                status={order.status}
                state={order.state}
                lastUpdatedAt={order.lastUpdatedAt}
              />
              <OrderTypeBadge orderType={order.orderType} />
              <DocumentStateBadge documentState={order.documentState} />
              <TransferBadge
                transferred={order.transferredToAccountingOffice}
              />
              <TrackingBadge
                trackingNumber={
                  order.tracking?.trackingNumber || order.ddt?.trackingNumber
                }
                trackingUrl={
                  order.tracking?.trackingUrl || order.ddt?.trackingUrl
                }
                trackingCourier={
                  order.tracking?.trackingCourier || order.ddt?.trackingCourier
                }
              />
              <OriginBadge salesOrigin={order.salesOrigin} />
              <DeliveryMethodBadge deliveryMethod={order.ddt?.deliveryMethod} />
              <LocationBadge
                deliveryCity={order.ddt?.deliveryCity}
                shippingAddress={order.shippingAddress}
              />
            </div>
          </div>

          {/* Right: Total */}
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
      </div>

      {/* ===== EXPANDED STATE ===== */}
      {expanded && (
        <div style={{ borderTop: "1px solid #e0e0e0" }}>
          {/* Tab Navigation */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #e0e0e0",
              backgroundColor: "#f5f5f5",
              overflowX: "auto",
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab(tab.id);
                }}
                style={{
                  flex: "1 0 auto",
                  padding: "12px 16px",
                  border: "none",
                  backgroundColor:
                    activeTab === tab.id ? "#fff" : "transparent",
                  borderBottom:
                    activeTab === tab.id
                      ? "2px solid #1976d2"
                      : "2px solid transparent",
                  color: activeTab === tab.id ? "#1976d2" : "#666",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.backgroundColor = "#eeeeee";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ minHeight: "300px" }}>
            {activeTab === "panoramica" && <TabPanoramica order={order} />}
            {activeTab === "articoli" && <TabArticoli items={order.items} />}
            {activeTab === "logistica" && <TabLogistica order={order} />}
            {activeTab === "finanziario" && <TabFinanziario order={order} />}
            {activeTab === "storico" && <TabStorico order={order} />}
          </div>
        </div>
      )}
    </div>
  );
}

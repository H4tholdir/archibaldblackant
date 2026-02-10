// @ts-nocheck - Contains legacy code with articleCode
import { useState, useEffect } from "react";
import type { Order, OrderItem } from "../types/order";
import { OrderActions } from "./OrderActions";
import { getOrderStatus } from "../utils/orderStatus";
import { fetchWithRetry } from "../utils/fetch-with-retry";

interface OrderCardProps {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
  onSendToMilano?: (orderId: string, customerName: string) => void;
  onEdit?: (orderId: string) => void;
  token?: string;
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

function TabPanoramica({ order, token }: { order: Order; token?: string }) {
  const [stateHistory, setStateHistory] = useState<
    Array<{
      id: number;
      orderId: string;
      oldState: string | null;
      newState: string;
      actor: string;
      notes: string | null;
      confidence: string | null;
      source: string | null;
      timestamp: string;
      createdAt: string;
    }>
  >([]);

  useEffect(() => {
    if (!token || !order.id) return;

    const loadHistory = async () => {
      try {
        const response = await fetchWithRetry(
          `/api/orders/${order.id}/state-history`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) return;
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          setStateHistory(data.data);
        }
      } catch {
        // Fail silently
      }
    };

    loadHistory();
  }, [order.id, token]);

  const infoRows: Array<{ label: string; value: string | undefined }> = [
    { label: "Numero Ordine", value: order.orderNumber },
    { label: "ID Interno", value: order.id },
    { label: "Data Ordine", value: formatDate(order.orderDate || order.date) },
    { label: "Data Consegna", value: formatDate(order.deliveryDate) },
    { label: "Tipo Ordine", value: order.orderType },
    { label: "Stato", value: order.status },
    { label: "Stato Dettagliato", value: order.state },
    { label: "Stato Documento", value: order.documentState },
    { label: "ID Profilo Cliente", value: order.customerProfileId },
    { label: "Indirizzo Consegna", value: order.deliveryAddress },
    { label: "Indirizzo Spedizione", value: order.shippingAddress },
    { label: "Termini Consegna", value: order.deliveryTerms },
  ];

  return (
    <div style={{ padding: "16px" }}>
      {/* Informazioni Ordine - Tabella compatta */}
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
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "14px",
          }}
        >
          <tbody>
            {infoRows
              .filter((row) => row.value && row.value !== "N/A")
              .map((row) => (
                <tr
                  key={row.label}
                  style={{ borderBottom: "1px solid #f0f0f0" }}
                >
                  <td
                    style={{
                      padding: "8px 12px",
                      color: "#666",
                      fontWeight: 500,
                      width: "180px",
                      verticalAlign: "top",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.label}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      color: "#333",
                      fontWeight: row.label === "Numero Ordine" ? 600 : 400,
                      whiteSpace: row.label.includes("Indirizzo")
                        ? "pre-wrap"
                        : "normal",
                    }}
                  >
                    {row.value}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Badge Completi */}
      <div style={{ marginBottom: "24px" }}>
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

      {/* Cronologia */}
      {stateHistory.length > 0 && (
        <div>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#333",
            }}
          >
            Cronologia
          </h3>
          <div style={{ position: "relative", paddingLeft: "24px" }}>
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
            {stateHistory.map((entry) => {
              const isCreation = !entry.oldState;
              const isComplete =
                entry.newState.toLowerCase().includes("evaso") ||
                entry.newState.toLowerCase().includes("fatturato");
              const dotColor = isCreation
                ? "#2196f3"
                : isComplete
                  ? "#4caf50"
                  : "#ff9800";

              return (
                <div
                  key={entry.id}
                  style={{ position: "relative", marginBottom: "16px" }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: "-20px",
                      top: "4px",
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: dotColor,
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
                        {entry.newState}
                      </span>
                      <span style={{ fontSize: "12px", color: "#666" }}>
                        {formatDateTime(entry.timestamp)}
                      </span>
                    </div>
                    {entry.oldState && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#666",
                          marginBottom: "4px",
                        }}
                      >
                        {entry.oldState} → {entry.newState}
                      </div>
                    )}
                    {entry.actor && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#888",
                          marginBottom: entry.notes ? "4px" : "0",
                        }}
                      >
                        {entry.actor}
                      </div>
                    )}
                    {entry.notes && (
                      <div style={{ fontSize: "12px", color: "#999" }}>
                        {entry.notes}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stateHistory.length === 0 && token && (
        <div
          style={{
            padding: "16px",
            textAlign: "center",
            color: "#999",
            fontSize: "14px",
          }}
        >
          Nessuna cronologia disponibile
        </div>
      )}
    </div>
  );
}

function TabArticoli({
  items,
  orderId,
  archibaldOrderId,
  token,
  onTotalsUpdate,
}: {
  items?: OrderItem[];
  orderId: string;
  archibaldOrderId?: string;
  token?: string;
  onTotalsUpdate?: (totals: {
    totalVatAmount?: number;
    totalWithVat?: number;
  }) => void;
}) {
  const [articles, setArticles] = useState(items || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load existing articles from database on mount
  useEffect(() => {
    const loadArticles = async () => {
      if (!token || !orderId) return;

      try {
        const response = await fetchWithRetry(
          `/api/orders/${orderId}/articles`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!response.ok) return;

        const data = await response.json();
        if (data.success && data.data.articles.length > 0) {
          setArticles(data.data.articles);

          // Update totals in parent component
          if (
            onTotalsUpdate &&
            data.data.totalVatAmount &&
            data.data.totalWithVat
          ) {
            onTotalsUpdate({
              totalVatAmount: data.data.totalVatAmount,
              totalWithVat: data.data.totalWithVat,
            });
          }
        }
      } catch (err) {
        // Silently fail - user can manually sync if needed
        console.log("No existing articles found");
      }
    };

    loadArticles();
  }, [orderId, token, onTotalsUpdate]);

  const handleSyncArticles = async () => {
    if (!token) {
      setError("Token di autenticazione mancante");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithRetry(
        `/api/orders/${orderId}/sync-articles`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Errore durante la sincronizzazione",
        );
      }

      const result = await response.json();
      setArticles(result.data.articles);
      const totalVat = result.data.totalVatAmount ?? 0;
      setSuccess(
        `✅ Sincronizzati ${result.data.articles.length} articoli. Totale IVA: €${totalVat.toFixed(2)}`,
      );

      // Update totals in parent component
      if (
        onTotalsUpdate &&
        result.data.totalVatAmount &&
        result.data.totalWithVat
      ) {
        onTotalsUpdate({
          totalVatAmount: result.data.totalVatAmount,
          totalWithVat: result.data.totalWithVat,
        });
      }

      // Hide success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Errore sconosciuto";
      setError(errorMessage);
      console.error("Sync articles error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (articles.length === 0) {
    return (
      <div style={{ padding: "16px" }}>
        <div
          style={{
            padding: "16px",
            textAlign: "center",
            color: "#999",
            marginBottom: "16px",
          }}
        >
          Nessun articolo disponibile
        </div>
        {token && (
          <div style={{ textAlign: "center" }}>
            <button
              onClick={handleSyncArticles}
              disabled={loading || !archibaldOrderId}
              title={
                !archibaldOrderId
                  ? "Sincronizza prima l'ordine con Archibald"
                  : "Aggiorna gli articoli da Archibald"
              }
              style={{
                padding: "12px 24px",
                backgroundColor:
                  loading || !archibaldOrderId ? "#ccc" : "#2196f3",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor:
                  loading || !archibaldOrderId ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              {loading ? "⏳ Sincronizzazione..." : "🔄 Aggiorna Articoli"}
            </button>
            {error && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  backgroundColor: "#ffebee",
                  color: "#c62828",
                  borderRadius: "4px",
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      {/* Sync Button */}
      {token && (
        <div style={{ marginBottom: "16px", textAlign: "right" }}>
          <button
            onClick={handleSyncArticles}
            disabled={loading}
            style={{
              padding: "10px 20px",
              backgroundColor: loading ? "#ccc" : "#2196f3",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {loading ? "⏳ Sincronizzazione..." : "🔄 Aggiorna Articoli"}
          </button>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            backgroundColor: "#e8f5e9",
            color: "#2e7d32",
            borderRadius: "4px",
            fontWeight: 500,
          }}
        >
          {success}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            backgroundColor: "#ffebee",
            color: "#c62828",
            borderRadius: "4px",
          }}
        >
          {error}
        </div>
      )}

      {/* Articles Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={tableHeaderStyle}>Codice Articolo</th>
              <th style={tableHeaderStyle}>Descrizione</th>
              <th style={tableHeaderStyle}>Quantità</th>
              <th style={tableHeaderStyle}>Prezzo Unitario</th>
              <th style={tableHeaderStyle}>Sconto</th>
              <th style={tableHeaderStyle}>Imponibile</th>
              <th style={tableHeaderStyle}>IVA %</th>
              <th style={tableHeaderStyle}>IVA €</th>
              <th style={tableHeaderStyle}>Totale + IVA</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((item, index) => {
              // Backend returns: unitPrice, discountPercent, lineAmount, articleDescription, vatPercent, vatAmount, lineTotalWithVat
              const unitPrice = (item as any).unitPrice ?? item.price ?? 0;
              const discount =
                (item as any).discountPercent ?? item.discount ?? 0;
              const description =
                (item as any).articleDescription ?? item.description ?? "";
              const lineAmount =
                (item as any).lineAmount ??
                (unitPrice * item.quantity * (100 - discount)) / 100;
              const vatPercent = (item as any).vatPercent ?? 0;
              const vatAmount = (item as any).vatAmount ?? 0;
              const lineTotalWithVat =
                (item as any).lineTotalWithVat ?? lineAmount;

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
                  <td style={tableCellStyle}>{description}</td>
                  <td style={tableCellStyle}>{item.quantity}</td>
                  <td style={tableCellStyle}>€ {unitPrice.toFixed(2)}</td>
                  <td style={tableCellStyle}>
                    {discount > 0 ? `${discount}%` : "-"}
                  </td>
                  <td style={tableCellStyle}>€ {lineAmount.toFixed(2)}</td>
                  <td style={tableCellStyle}>{vatPercent}%</td>
                  <td style={tableCellStyle}>€ {vatAmount.toFixed(2)}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 600 }}>
                    € {lineTotalWithVat.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals Section */}
      {articles.length > 0 &&
        (() => {
          const subtotalBeforeDiscount = articles.reduce((sum, item) => {
            const unitPrice = (item as any).unitPrice ?? item.price ?? 0;
            const quantity = item.quantity ?? 0;
            return sum + unitPrice * quantity;
          }, 0);
          const totalImponibile = articles.reduce(
            (sum, item) => sum + ((item as any).lineAmount ?? 0),
            0,
          );
          const totalDiscountAmount = subtotalBeforeDiscount - totalImponibile;

          // Check if all articles have the same discount (global discount)
          const uniqueDiscounts = new Set(
            articles.map((item) => (item as any).discountPercent ?? 0),
          );
          const hasUniformDiscount =
            uniqueDiscounts.size === 1 && Array.from(uniqueDiscounts)[0] > 0;
          const globalDiscountPercent = hasUniformDiscount
            ? Array.from(uniqueDiscounts)[0]
            : null;

          return (
            <div
              style={{
                marginTop: "24px",
                paddingTop: "16px",
                borderTop: "2px solid #e0e0e0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: "8px",
                }}
              >
                {totalDiscountAmount > 0.01 && (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        width: "300px",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>Subtotale:</span>
                      <span style={{ fontWeight: 600 }}>
                        € {subtotalBeforeDiscount.toFixed(2)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        width: "300px",
                      }}
                    >
                      <span style={{ fontWeight: 500, color: "#d32f2f" }}>
                        Sconto
                        {globalDiscountPercent
                          ? ` (${globalDiscountPercent}%)`
                          : ""}
                        :
                      </span>
                      <span style={{ fontWeight: 600, color: "#d32f2f" }}>
                        - € {totalDiscountAmount.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "300px",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>Totale Imponibile:</span>
                  <span style={{ fontWeight: 600 }}>
                    € {totalImponibile.toFixed(2)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "300px",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>Totale IVA:</span>
                  <span style={{ fontWeight: 600 }}>
                    €{" "}
                    {articles
                      .reduce(
                        (sum, item) => sum + ((item as any).vatAmount ?? 0),
                        0,
                      )
                      .toFixed(2)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "300px",
                    paddingTop: "8px",
                    borderTop: "1px solid #e0e0e0",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: "18px" }}>
                    TOTALE:
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "18px",
                      color: "#2e7d32",
                    }}
                  >
                    €{" "}
                    {articles
                      .reduce(
                        (sum, item) =>
                          sum + ((item as any).lineTotalWithVat ?? 0),
                        0,
                      )
                      .toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

function TabLogistica({ order, token }: { order: Order; token?: string }) {
  const [ddtProgress, setDdtProgress] = useState<{
    active: boolean;
    percent: number;
    stage: string;
  }>({ active: false, percent: 0, stage: "" });
  const [ddtError, setDdtError] = useState<string | null>(null);

  const ddt = order.ddt;
  const tracking = order.tracking || {
    trackingNumber: ddt?.trackingNumber,
    trackingUrl: ddt?.trackingUrl,
    trackingCourier: ddt?.trackingCourier,
  };

  const handleDownloadDDT = () => {
    if (!token) {
      setDdtError("Token di autenticazione mancante");
      return;
    }

    if (!ddt?.trackingNumber) {
      setDdtError(
        "Tracking non disponibile: il PDF DDT non può essere generato senza un codice di tracciamento attivo",
      );
      return;
    }

    setDdtProgress({ active: true, percent: 0, stage: "Avvio..." });
    setDdtError(null);

    downloadPdfWithProgress(
      order.orderNumber || order.id,
      "ddt",
      token,
      (stage, percent) => setDdtProgress({ active: true, percent, stage }),
      () =>
        setTimeout(
          () => setDdtProgress({ active: false, percent: 0, stage: "" }),
          1500,
        ),
      (error) => {
        setDdtError(error);
        setDdtProgress({ active: false, percent: 0, stage: "" });
      },
    );
  };

  const hasDestinatario =
    ddt?.ddtDeliveryName ||
    ddt?.deliveryAddress ||
    ddt?.deliveryCity ||
    ddt?.attentionTo;

  const hasDettagliSpedizione =
    ddt?.deliveryTerms || ddt?.deliveryMethod || order.deliveryCompletedDate;

  return (
    <div style={{ padding: "16px" }}>
      {/* 1. Tracking Spedizione (in cima - azione più frequente) */}
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

      {/* 2. Destinatario (dove va?) */}
      {ddt && hasDestinatario && (
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#333",
            }}
          >
            Destinatario
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "12px",
            }}
          >
            <InfoField label="Nome Consegna" value={ddt.ddtDeliveryName} bold />
            {ddt.attentionTo && (
              <InfoField label="All'attenzione di" value={ddt.attentionTo} />
            )}
            {ddt.deliveryAddress && (
              <div style={{ gridColumn: "1 / -1" }}>
                <InfoField
                  label="Indirizzo Consegna"
                  value={ddt.deliveryAddress}
                />
              </div>
            )}
            {ddt.deliveryCity && (
              <InfoField label="Città Consegna" value={ddt.deliveryCity} />
            )}
          </div>
        </div>
      )}

      {/* 3. Documento di Trasporto (riferimenti documentali) */}
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
            Documento di Trasporto
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "12px",
            }}
          >
            {ddt.ddtCustomerAccount && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: "10px 12px",
                  backgroundColor: "#e3f2fd",
                  borderRadius: "6px",
                  border: "1px solid #bbdefb",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#1565c0",
                    marginBottom: "2px",
                    fontWeight: 600,
                  }}
                >
                  Conto Ordine
                </div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "#0d47a1",
                    fontFamily: "monospace",
                  }}
                >
                  {ddt.ddtCustomerAccount}
                </div>
              </div>
            )}
            <InfoField label="Numero DDT" value={ddt.ddtNumber} bold />
            <InfoField
              label="Data Consegna"
              value={formatDate(ddt.ddtDeliveryDate)}
            />
            <InfoField label="ID Ordine Vendita" value={ddt.orderId} />
            <InfoField label="ID DDT" value={ddt.ddtId} small />
            <InfoField label="Nome Vendite" value={ddt.ddtSalesName} />
            {ddt.ddtTotal && (
              <InfoField label="Totale DDT" value={ddt.ddtTotal} />
            )}
            {ddt.customerReference && (
              <InfoField
                label="Riferimento Cliente"
                value={ddt.customerReference}
              />
            )}
            {ddt.description && (
              <InfoField label="Descrizione" value={ddt.description} />
            )}
          </div>

          {/* DDT PDF Download Button */}
          <div style={{ marginTop: "16px" }}>
            <button
              onClick={handleDownloadDDT}
              disabled={ddtProgress.active || !ddt.trackingNumber}
              style={{
                width: "100%",
                padding: "12px",
                backgroundColor:
                  ddtProgress.active || !ddt.trackingNumber
                    ? "#ccc"
                    : "#4caf50",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor:
                  ddtProgress.active || !ddt.trackingNumber
                    ? "not-allowed"
                    : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!ddtProgress.active && ddt.trackingNumber) {
                  e.currentTarget.style.backgroundColor = "#388e3c";
                }
              }}
              onMouseLeave={(e) => {
                if (!ddtProgress.active && ddt.trackingNumber) {
                  e.currentTarget.style.backgroundColor = "#4caf50";
                }
              }}
            >
              {ddtProgress.active ? (
                <>
                  <span>⏳</span>
                  <span>{ddtProgress.stage || "Download in corso..."}</span>
                </>
              ) : !ddt.trackingNumber ? (
                <>
                  <span>🔒</span>
                  <span>Download disponibile dopo attivazione tracking</span>
                </>
              ) : (
                <>
                  <span>📄</span>
                  <span>Scarica PDF DDT</span>
                </>
              )}
            </button>
            {ddtProgress.active && (
              <ProgressBar
                percent={ddtProgress.percent}
                stage={ddtProgress.stage}
                color="#4caf50"
              />
            )}
            {ddtError && (
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
                {ddtError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Dettagli Spedizione */}
      {ddt && hasDettagliSpedizione && (
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#333",
            }}
          >
            Dettagli Spedizione
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "12px",
            }}
          >
            {ddt.deliveryMethod && (
              <InfoField label="Modalità Consegna" value={ddt.deliveryMethod} />
            )}
            {ddt.deliveryTerms && (
              <InfoField label="Termini Consegna" value={ddt.deliveryTerms} />
            )}
            {order.deliveryCompletedDate && (
              <InfoField
                label="Consegna Completata"
                value={formatDate(order.deliveryCompletedDate)}
              />
            )}
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

function TabFinanziario({ order, token }: { order: Order; token?: string }) {
  const [invoiceProgress, setInvoiceProgress] = useState<{
    active: boolean;
    percent: number;
    stage: string;
  }>({ active: false, percent: 0, stage: "" });
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const handleDownloadInvoice = () => {
    if (!token) {
      setInvoiceError("Token di autenticazione mancante");
      return;
    }

    if (!order.invoiceNumber) {
      setInvoiceError("Nessuna fattura disponibile per questo ordine");
      return;
    }

    setInvoiceProgress({ active: true, percent: 0, stage: "Avvio..." });
    setInvoiceError(null);

    downloadPdfWithProgress(
      order.orderNumber || order.id,
      "invoice",
      token,
      (stage, percent) => setInvoiceProgress({ active: true, percent, stage }),
      () =>
        setTimeout(
          () => setInvoiceProgress({ active: false, percent: 0, stage: "" }),
          1500,
        ),
      (error) => {
        setInvoiceError(error);
        setInvoiceProgress({ active: false, percent: 0, stage: "" });
      },
    );
  };

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
            {(order as any).totalWithVat &&
              parseFloat((order as any).totalWithVat) > 0 && (
                <div
                  style={{
                    fontSize: "16px",
                    color: "#2e7d32",
                    fontWeight: 600,
                    marginTop: "4px",
                  }}
                >
                  € {parseFloat((order as any).totalWithVat).toFixed(2)} (con
                  IVA)
                </div>
              )}
            {(!(order as any).totalWithVat ||
              parseFloat((order as any).totalWithVat) === 0) && (
              <div
                style={{
                  fontSize: "12px",
                  color: "#999",
                  marginTop: "4px",
                  fontStyle: "italic",
                }}
              >
                Sincronizza articoli per vedere totale con IVA
              </div>
            )}
          </div>
          {order.discountPercent &&
            order.discountPercent !== "0,00 %" &&
            order.discountPercent !== "0%" && (
              <InfoField
                label="Sconto Globale Ordine"
                value={order.discountPercent}
              />
            )}
          {order.lineDiscount && (
            <InfoField label="Sconto Riga Fattura" value={order.lineDiscount} />
          )}
          {order.endDiscount && (
            <InfoField
              label="Sconto Finale Fattura"
              value={order.endDiscount}
            />
          )}
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

      {/* Fattura */}
      <div style={{ marginBottom: "24px" }}>
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "#333",
          }}
        >
          Fattura
        </h3>

        {/* Dettagli Fattura */}
        {order.invoiceNumber && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <InfoField
              label="Numero Fattura"
              value={order.invoiceNumber}
              bold
            />
            <InfoField
              label="Data Fattura"
              value={formatDate(order.invoiceDate)}
            />
            <InfoField
              label="Importo Fattura"
              value={
                order.invoiceAmount ? `€${order.invoiceAmount}` : undefined
              }
            />
            <InfoField
              label="Conto Cliente"
              value={order.invoiceCustomerAccount}
            />
            <InfoField
              label="Nome Fatturazione"
              value={order.invoiceBillingName}
            />
            <InfoField
              label="Quantità"
              value={order.invoiceQuantity?.toString()}
            />
            <InfoField
              label="Importo Residuo"
              value={
                order.invoiceRemainingAmount
                  ? `€${order.invoiceRemainingAmount}`
                  : undefined
              }
            />
            <InfoField
              label="Importo Fiscale"
              value={
                order.invoiceTaxAmount
                  ? `€${order.invoiceTaxAmount}`
                  : undefined
              }
            />
            <InfoField
              label="Sconto Linea"
              value={
                order.invoiceLineDiscount
                  ? `€${order.invoiceLineDiscount}`
                  : undefined
              }
            />
            <InfoField
              label="Sconto Totale"
              value={
                order.invoiceTotalDiscount
                  ? `€${order.invoiceTotalDiscount}`
                  : undefined
              }
            />
            <InfoField
              label="Scadenza"
              value={formatDate(order.invoiceDueDate)}
            />
            <InfoField
              label="Ordine Acquisto"
              value={order.invoicePurchaseOrder}
            />
            <InfoField
              label="Stato"
              value={order.invoiceClosed ? "Chiusa" : "Aperta"}
            />
          </div>
        )}

        {/* Stato Pagamento */}
        {order.invoiceNumber &&
          (order.invoiceDaysPastDue ||
            order.invoiceSettledAmount ||
            order.invoiceLastPaymentId ||
            order.invoiceLastSettlementDate ||
            order.invoiceClosedDate) && (
            <div style={{ marginTop: "16px", marginBottom: "16px" }}>
              <h4
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: "#555",
                }}
              >
                Stato Pagamento
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "12px",
                }}
              >
                {order.invoiceDaysPastDue && (
                  <div
                    style={{
                      padding: "8px 12px",
                      backgroundColor:
                        parseInt(order.invoiceDaysPastDue) > 0
                          ? "#ffebee"
                          : "#f5f5f5",
                      borderRadius: "6px",
                      border: `1px solid ${parseInt(order.invoiceDaysPastDue) > 0 ? "#ffcdd2" : "#e0e0e0"}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#888",
                        marginBottom: "2px",
                      }}
                    >
                      Giorni oltre scadenza
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color:
                          parseInt(order.invoiceDaysPastDue) > 0
                            ? "#c62828"
                            : "#333",
                      }}
                    >
                      {order.invoiceDaysPastDue}
                    </div>
                  </div>
                )}
                {order.invoiceSettledAmount && (
                  <InfoField
                    label="Importo liquidato"
                    value={`€${order.invoiceSettledAmount}`}
                  />
                )}
                {order.invoiceLastPaymentId && (
                  <InfoField
                    label="Ultimo pagamento"
                    value={order.invoiceLastPaymentId}
                  />
                )}
                {order.invoiceLastSettlementDate && (
                  <InfoField
                    label="Data liquidazione"
                    value={formatDate(order.invoiceLastSettlementDate)}
                  />
                )}
                {order.invoiceClosedDate &&
                  order.invoiceClosedDate.toLowerCase() !== "no" && (
                    <InfoField
                      label="Data chiusura"
                      value={formatDate(order.invoiceClosedDate)}
                    />
                  )}
              </div>
            </div>
          )}

        <button
          onClick={handleDownloadInvoice}
          disabled={invoiceProgress.active || !order.invoiceNumber}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor:
              invoiceProgress.active || !order.invoiceNumber
                ? "#ccc"
                : "#4caf50",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
            cursor:
              invoiceProgress.active || !order.invoiceNumber
                ? "not-allowed"
                : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!invoiceProgress.active && order.invoiceNumber) {
              e.currentTarget.style.backgroundColor = "#388e3c";
            }
          }}
          onMouseLeave={(e) => {
            if (!invoiceProgress.active && order.invoiceNumber) {
              e.currentTarget.style.backgroundColor = "#4caf50";
            }
          }}
        >
          {invoiceProgress.active ? (
            <>
              <span>⏳</span>
              <span>{invoiceProgress.stage || "Download in corso..."}</span>
            </>
          ) : !order.invoiceNumber ? (
            <>
              <span>📄</span>
              <span>Nessuna fattura disponibile</span>
            </>
          ) : (
            <>
              <span>📄</span>
              <span>Scarica Fattura {order.invoiceNumber}</span>
            </>
          )}
        </button>
        {invoiceProgress.active && (
          <ProgressBar
            percent={invoiceProgress.percent}
            stage={invoiceProgress.stage}
            color="#4caf50"
          />
        )}
        {invoiceError && (
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
            {invoiceError}
          </div>
        )}
      </div>
    </div>
  );
}

function TabCronologia() {
  return (
    <div style={{ padding: "16px" }}>
      <h3
        style={{
          fontSize: "16px",
          fontWeight: 600,
          marginBottom: "12px",
          color: "#333",
        }}
      >
        Ordini Collegati
      </h3>
      <div
        style={{
          padding: "24px",
          textAlign: "center",
          color: "#999",
          fontSize: "14px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
        }}
      >
        Funzionalita' in fase di sviluppo. Qui verranno mostrati gli ordini
        collegati dallo storico Fresis e altre connessioni.
      </div>
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
// PDF DOWNLOAD WITH SSE PROGRESS
// ============================================================================

function downloadPdfWithProgress(
  orderId: string,
  type: "invoice" | "ddt",
  token: string,
  onProgress: (stage: string, percent: number) => void,
  onComplete: () => void,
  onError: (error: string) => void,
): () => void {
  const encodedId = encodeURIComponent(orderId);
  const url = `/api/orders/${encodedId}/pdf-download?type=${type}&token=${encodeURIComponent(token)}`;

  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "progress") {
        onProgress(data.stage, data.percent);
      } else if (data.type === "complete") {
        onProgress("Download completato!", 100);
        const byteCharacters = atob(data.pdf);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = data.filename;
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        eventSource.close();
        onComplete();
      } else if (data.type === "error") {
        eventSource.close();
        onError(data.error);
      }
    } catch {
      eventSource.close();
      onError("Errore durante il parsing della risposta");
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    onError("Connessione persa durante il download");
  };

  return () => eventSource.close();
}

function ProgressBar({
  percent,
  stage,
  color,
}: {
  percent: number;
  stage: string;
  color: string;
}) {
  return (
    <div style={{ width: "100%", marginTop: "6px" }}>
      <div
        style={{
          width: "100%",
          height: "6px",
          backgroundColor: "#e0e0e0",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: "3px",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <div
        style={{
          fontSize: "10px",
          color: "#666",
          marginTop: "2px",
          textAlign: "center",
        }}
      >
        {stage}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OrderCardNew({
  order,
  expanded,
  onToggle,
  onSendToMilano,
  onEdit,
  token,
}: OrderCardProps) {
  const [activeTab, setActiveTab] = useState<
    "panoramica" | "articoli" | "logistica" | "finanziario" | "storico"
  >("panoramica");

  const [ddtQuickProgress, setDdtQuickProgress] = useState<{
    active: boolean;
    percent: number;
    stage: string;
  }>({ active: false, percent: 0, stage: "" });
  const [invoiceQuickProgress, setInvoiceQuickProgress] = useState<{
    active: boolean;
    percent: number;
    stage: string;
  }>({ active: false, percent: 0, stage: "" });

  // Articles totals state (updated when articles are loaded/synced)
  // Initialize from order prop if available
  const [articlesTotals, setArticlesTotals] = useState<{
    totalVatAmount?: number;
    totalWithVat?: number;
  }>(() => {
    const totalVatAmount = order.totalVatAmount
      ? parseFloat(order.totalVatAmount)
      : undefined;
    const totalWithVat = order.totalWithVat
      ? parseFloat(order.totalWithVat)
      : undefined;
    return { totalVatAmount, totalWithVat };
  });

  // Detect draft orders (created locally but not yet placed on Archibald)
  const isCreato =
    order.state?.toLowerCase() === "creato" ||
    order.status.toLowerCase() === "bozza";

  // Detect order state: "piazzato" orders don't have ORD/ number yet (but only if not a draft)
  const isPiazzato =
    !isCreato && (!order.orderNumber || order.orderNumber.trim() === "");

  const tabs = [
    { id: "panoramica" as const, label: "Panoramica", icon: "📊" },
    { id: "articoli" as const, label: "Articoli", icon: "📦" },
    { id: "logistica" as const, label: "Logistica", icon: "🚚" },
    { id: "finanziario" as const, label: "Finanziario", icon: "💰" },
    { id: "storico" as const, label: "Ordini Collegati", icon: "🔗" },
  ];

  // Get order status styling (border + background colors)
  const orderStatusStyle = getOrderStatus(order);

  return (
    <div
      style={{
        backgroundColor: orderStatusStyle.backgroundColor,
        borderLeft: `4px solid ${orderStatusStyle.borderColor}`,
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
          backgroundColor: orderStatusStyle.backgroundColor,
        }}
        onMouseEnter={(e) => {
          // Darken background slightly on hover
          e.currentTarget.style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          {/* Left: Customer Name + Order Info + Status Badge */}
          <div style={{ flex: 1 }}>
            {/* Customer Name (Bold) + Status Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "4px",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#333",
                }}
              >
                {order.customerName}
              </div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 10px",
                  borderRadius: "12px",
                  backgroundColor: orderStatusStyle.borderColor,
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                {orderStatusStyle.label}
              </span>
            </div>

            {/* Order Number + Date */}
            <div
              style={{
                fontSize: "14px",
                color: "#666",
                marginBottom: "8px",
              }}
            >
              {order.orderNumber ? (
                <>
                  <span style={{ fontWeight: 600 }}>{order.orderNumber}</span>
                  {" • "}
                </>
              ) : null}
              {formatDate(order.orderDate || order.date)}
            </div>

            {/* Total Amount */}
            <div style={{ marginBottom: "8px" }}>
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#333",
                }}
              >
                {order.total}
              </span>
              {(() => {
                const totalWithVat =
                  articlesTotals.totalWithVat ??
                  (order.totalWithVat
                    ? parseFloat(order.totalWithVat)
                    : undefined);

                if (totalWithVat && totalWithVat > 0) {
                  return (
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#1a7f37",
                        marginTop: "2px",
                      }}
                    >
                      € {totalWithVat.toFixed(2)} (IVA incl.)
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Action Buttons */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Tracking Button */}
              {(order.tracking?.trackingUrl || order.ddt?.trackingUrl) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const url =
                      order.tracking?.trackingUrl || order.ddt?.trackingUrl;
                    if (url) window.open(url, "_blank");
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    backgroundColor: "#fff",
                    color: "#1976d2",
                    border: "1px solid #1976d2",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#1976d2";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#fff";
                    e.currentTarget.style.color = "#1976d2";
                  }}
                >
                  🚚 Tracking
                </button>
              )}

              {/* DDT Download Button */}
              {order.ddt?.ddtNumber && order.ddt?.trackingNumber && (
                <div
                  style={{
                    display: "inline-flex",
                    flexDirection: "column",
                    minWidth: ddtQuickProgress.active ? "160px" : undefined,
                  }}
                >
                  <button
                    disabled={ddtQuickProgress.active}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (ddtQuickProgress.active || !token) return;
                      setDdtQuickProgress({
                        active: true,
                        percent: 0,
                        stage: "Avvio...",
                      });
                      downloadPdfWithProgress(
                        order.orderNumber || order.id,
                        "ddt",
                        token,
                        (stage, percent) =>
                          setDdtQuickProgress({ active: true, percent, stage }),
                        () =>
                          setTimeout(
                            () =>
                              setDdtQuickProgress({
                                active: false,
                                percent: 0,
                                stage: "",
                              }),
                            1500,
                          ),
                        (error) => {
                          console.error("DDT download error:", error);
                          setDdtQuickProgress({
                            active: false,
                            percent: 0,
                            stage: "",
                          });
                        },
                      );
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: ddtQuickProgress.active
                        ? "#e8f5e9"
                        : "#fff",
                      color: ddtQuickProgress.active ? "#81c784" : "#388e3c",
                      border: `1px solid ${ddtQuickProgress.active ? "#81c784" : "#388e3c"}`,
                      borderRadius: "6px",
                      cursor: ddtQuickProgress.active ? "wait" : "pointer",
                      transition: "all 0.2s",
                      opacity: ddtQuickProgress.active ? 0.85 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!ddtQuickProgress.active) {
                        e.currentTarget.style.backgroundColor = "#388e3c";
                        e.currentTarget.style.color = "#fff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!ddtQuickProgress.active) {
                        e.currentTarget.style.backgroundColor = "#fff";
                        e.currentTarget.style.color = "#388e3c";
                      }
                    }}
                  >
                    {ddtQuickProgress.active ? "⏳ DDT..." : "📄 DDT"}
                  </button>
                  {ddtQuickProgress.active && (
                    <ProgressBar
                      percent={ddtQuickProgress.percent}
                      stage={ddtQuickProgress.stage}
                      color="#388e3c"
                    />
                  )}
                </div>
              )}

              {/* Invoice Download Button */}
              {order.invoiceNumber && (
                <div
                  style={{
                    display: "inline-flex",
                    flexDirection: "column",
                    minWidth: invoiceQuickProgress.active ? "160px" : undefined,
                  }}
                >
                  <button
                    disabled={invoiceQuickProgress.active}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (invoiceQuickProgress.active || !token) return;
                      setInvoiceQuickProgress({
                        active: true,
                        percent: 0,
                        stage: "Avvio...",
                      });
                      downloadPdfWithProgress(
                        order.orderNumber || order.id,
                        "invoice",
                        token,
                        (stage, percent) =>
                          setInvoiceQuickProgress({
                            active: true,
                            percent,
                            stage,
                          }),
                        () =>
                          setTimeout(
                            () =>
                              setInvoiceQuickProgress({
                                active: false,
                                percent: 0,
                                stage: "",
                              }),
                            1500,
                          ),
                        (error) => {
                          console.error("Invoice download error:", error);
                          setInvoiceQuickProgress({
                            active: false,
                            percent: 0,
                            stage: "",
                          });
                        },
                      );
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: invoiceQuickProgress.active
                        ? "#f3e5f5"
                        : "#fff",
                      color: invoiceQuickProgress.active
                        ? "#ba68c8"
                        : "#7b1fa2",
                      border: `1px solid ${invoiceQuickProgress.active ? "#ba68c8" : "#7b1fa2"}`,
                      borderRadius: "6px",
                      cursor: invoiceQuickProgress.active ? "wait" : "pointer",
                      transition: "all 0.2s",
                      opacity: invoiceQuickProgress.active ? 0.85 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!invoiceQuickProgress.active) {
                        e.currentTarget.style.backgroundColor = "#7b1fa2";
                        e.currentTarget.style.color = "#fff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!invoiceQuickProgress.active) {
                        e.currentTarget.style.backgroundColor = "#fff";
                        e.currentTarget.style.color = "#7b1fa2";
                      }
                    }}
                  >
                    {invoiceQuickProgress.active
                      ? "⏳ Fattura..."
                      : "📑 Fattura"}
                  </button>
                  {invoiceQuickProgress.active && (
                    <ProgressBar
                      percent={invoiceQuickProgress.percent}
                      stage={invoiceQuickProgress.stage}
                      color="#7b1fa2"
                    />
                  )}
                </div>
              )}
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
            {activeTab === "panoramica" && (
              <TabPanoramica order={order} token={token} />
            )}
            {activeTab === "articoli" && (
              <TabArticoli
                items={order.items}
                orderId={order.id}
                archibaldOrderId={order.id}
                token={token}
                onTotalsUpdate={setArticlesTotals}
              />
            )}
            {activeTab === "logistica" && (
              <TabLogistica order={order} token={token} />
            )}
            {activeTab === "finanziario" && (
              <TabFinanziario order={order} token={token} />
            )}
            {activeTab === "storico" && <TabCronologia />}
          </div>

          {/* Order Actions - Always visible regardless of tab */}
          {(onSendToMilano || onEdit) && (
            <div style={{ padding: "0 16px 16px 16px" }}>
              <OrderActions
                orderId={order.id}
                currentState={
                  isPiazzato
                    ? "piazzato"
                    : order.state?.toLowerCase() || order.status.toLowerCase()
                }
                archibaldOrderId={order.orderNumber}
                onSendToMilano={() =>
                  onSendToMilano?.(order.id, order.customerName)
                }
                onEdit={() => onEdit?.(order.id)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

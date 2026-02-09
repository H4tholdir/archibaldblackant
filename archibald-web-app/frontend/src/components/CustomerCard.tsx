import { useState, useRef } from "react";
import type { Customer } from "../types/customer";

interface CustomerCardProps {
  customer: Customer;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (customerId: string) => void;
  onRetry: (customerProfile: string) => void;
  photoUrl?: string | null;
  onPhotoUpload?: (customerProfile: string, file: File) => void;
  onPhotoDelete?: (customerProfile: string) => void;
}

export function CustomerCard({
  customer,
  expanded,
  onToggle,
  onEdit,
  onRetry,
  photoUrl,
  onPhotoUpload,
  onPhotoDelete,
}: CustomerCardProps) {
  const [swipeX, setSwipeX] = useState(0);
  const touchStartX = useRef(0);
  const hasSwipeAction =
    customer.botStatus === "failed" || customer.botStatus === "pending";

  const formatDate = (timestamp: number | string | null): string => {
    if (!timestamp) return "N/A";

    // Handle DD/MM/YYYY format
    if (typeof timestamp === "string" && timestamp.includes("/")) {
      return timestamp;
    }

    // Handle Unix timestamp
    const date = new Date(
      typeof timestamp === "number" ? timestamp * 1000 : timestamp,
    );
    return date.toLocaleDateString("it-IT");
  };

  const formatCurrency = (amount: number | null): string => {
    if (amount === null || amount === 0) return "\u20AC 0,00";
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!hasSwipeAction) return;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!hasSwipeAction) return;
    const diff = touchStartX.current - e.touches[0].clientX;
    if (diff > 0) {
      setSwipeX(Math.min(diff, 120));
    } else {
      setSwipeX(0);
    }
  };

  const handleTouchEnd = () => {
    if (!hasSwipeAction) return;
    if (swipeX < 80) {
      setSwipeX(0);
    }
  };

  const botStatusBadge = () => {
    if (!customer.botStatus || customer.botStatus === "placed") return null;

    if (customer.botStatus === "pending") {
      return (
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            fontSize: "11px",
            fontWeight: 700,
            backgroundColor: "#ff9800",
            color: "#fff",
            borderRadius: "12px",
            marginLeft: "8px",
          }}
        >
          In attesa
        </span>
      );
    }

    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          fontSize: "11px",
          fontWeight: 700,
          backgroundColor: "#f44336",
          color: "#fff",
          borderRadius: "12px",
          marginLeft: "8px",
        }}
      >
        Errore Archibald
      </span>
    );
  };

  return (
    <div
      style={{ position: "relative", overflow: "hidden", borderRadius: "12px" }}
    >
      {/* Swipe reveal background */}
      {hasSwipeAction && swipeX >= 80 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "120px",
            backgroundColor: "#f44336",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
            borderRadius: "0 12px 12px 0",
          }}
        >
          <button
            onClick={() => {
              setSwipeX(0);
              onRetry(customer.customerProfile);
            }}
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 700,
              backgroundColor: "transparent",
              color: "#fff",
              border: "2px solid #fff",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Riprova
          </button>
        </div>
      )}

      {/* Main card */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
          transition: swipeX === 0 ? "transform 0.3s ease" : "none",
          transform: `translateX(-${swipeX}px)`,
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Card Header */}
        <div
          onClick={onToggle}
          style={{
            padding: "20px",
            cursor: "pointer",
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#f5f5f5";
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
              marginBottom: "12px",
            }}
          >
            {/* Customer info */}
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  minWidth: "40px",
                  borderRadius: "50%",
                  backgroundColor: photoUrl ? "transparent" : "#bdbdbd",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#fff",
                  overflow: "hidden",
                }}
              >
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={customer.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  customer.name.charAt(0).toUpperCase()
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: "4px",
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {customer.name}
                  {botStatusBadge()}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#666",
                    display: "flex",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  {customer.customerProfile && (
                    <span>
                      <strong>Profilo:</strong> {customer.customerProfile}
                    </span>
                  )}
                  {customer.city && (
                    <span>
                      <strong>Città:</strong> {customer.city}
                    </span>
                  )}
                  {customer.vatNumber && (
                    <span>
                      <strong>P.IVA:</strong> {customer.vatNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Expand icon */}
            <div
              style={{
                fontSize: "24px",
                color: "#1976d2",
                transition: "transform 0.3s",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              ▼
            </div>
          </div>

          {/* Quick stats */}
          <div
            style={{
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
              fontSize: "13px",
              color: "#666",
            }}
          >
            {customer.lastOrderDate && (
              <div>
                <strong>Ultimo ordine:</strong>{" "}
                {formatDate(customer.lastOrderDate)}
              </div>
            )}
            {customer.actualOrderCount > 0 && (
              <div>
                <strong>Ordini:</strong> {customer.actualOrderCount}
              </div>
            )}
            {customer.phone && (
              <div>
                <strong>Tel:</strong> {customer.phone}
              </div>
            )}
          </div>
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div
            style={{
              borderTop: "1px solid #e0e0e0",
              padding: "20px",
              backgroundColor: "#fafafa",
            }}
          >
            {/* Photo Section */}
            <div
              style={{
                marginBottom: "20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "120px",
                  height: "120px",
                  borderRadius: "50%",
                  backgroundColor: photoUrl ? "transparent" : "#e0e0e0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "48px",
                  fontWeight: 700,
                  color: "#9e9e9e",
                  overflow: "hidden",
                  border: "3px solid #e0e0e0",
                }}
              >
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={customer.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  customer.name.charAt(0).toUpperCase()
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <label
                  style={{
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: 600,
                    backgroundColor: "#1976d2",
                    color: "#fff",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  Scatta foto
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && onPhotoUpload) {
                        onPhotoUpload(customer.customerProfile, file);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                <label
                  style={{
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: 600,
                    backgroundColor: "#fff",
                    color: "#1976d2",
                    border: "1px solid #1976d2",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  Scegli dalla galleria
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && onPhotoUpload) {
                        onPhotoUpload(customer.customerProfile, file);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                {photoUrl && onPhotoDelete && (
                  <button
                    onClick={() => onPhotoDelete(customer.customerProfile)}
                    style={{
                      padding: "8px 16px",
                      fontSize: "13px",
                      fontWeight: 600,
                      backgroundColor: "#fff",
                      color: "#f44336",
                      border: "1px solid #f44336",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    Rimuovi foto
                  </button>
                )}
              </div>
            </div>

            {/* Fiscal Data */}
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                Dati Fiscali
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                <div>
                  <strong style={{ color: "#666" }}>Partita IVA:</strong>{" "}
                  {customer.vatNumber || "N/A"}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>Codice Fiscale:</strong>{" "}
                  {customer.fiscalCode || "N/A"}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>SDI:</strong>{" "}
                  {customer.sdi || "N/A"}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>PEC:</strong>{" "}
                  {customer.pec || "N/A"}
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                Contatti
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                <div>
                  <strong style={{ color: "#666" }}>Telefono:</strong>{" "}
                  {customer.phone || "N/A"}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>Cellulare:</strong>{" "}
                  {customer.mobile || "N/A"}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>URL:</strong>{" "}
                  {customer.url ? (
                    <a
                      href={customer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#1976d2" }}
                    >
                      {customer.url}
                    </a>
                  ) : (
                    "N/A"
                  )}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>All'attenzione di:</strong>{" "}
                  {customer.attentionTo || "N/A"}
                </div>
              </div>
            </div>

            {/* Address */}
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                Indirizzo
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                <div>
                  <strong style={{ color: "#666" }}>Via:</strong>{" "}
                  {customer.street || "N/A"}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>CAP:</strong>{" "}
                  {customer.postalCode || "N/A"}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>Città:</strong>{" "}
                  {customer.city || "N/A"}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>
                    Indirizzo logistica:
                  </strong>{" "}
                  {customer.logisticsAddress || "N/A"}
                </div>
              </div>
              {(customer.street || customer.city) && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([customer.street, customer.postalCode, customer.city].filter(Boolean).join(", "))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    marginTop: "12px",
                    padding: "8px 16px",
                    fontSize: "14px",
                    fontWeight: 600,
                    backgroundColor: "#1976d2",
                    color: "#fff",
                    borderRadius: "8px",
                    textDecoration: "none",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#1565c0";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#1976d2";
                  }}
                >
                  Indicazioni stradali
                </a>
              )}
            </div>

            {/* Business Info */}
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                Info Commerciali
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                <div>
                  <strong style={{ color: "#666" }}>Tipo cliente:</strong>{" "}
                  {customer.customerType || "N/A"}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>Tipo:</strong>{" "}
                  {customer.type || "N/A"}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>
                    Termini di consegna:
                  </strong>{" "}
                  {customer.deliveryTerms || "N/A"}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>Descrizione:</strong>{" "}
                  {customer.description || "N/A"}
                </div>
              </div>
            </div>

            {/* Order History */}
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                Ordini
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                <div>
                  <strong style={{ color: "#666" }}>Data ultimo ordine:</strong>{" "}
                  {formatDate(customer.lastOrderDate)}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>Ordini totali:</strong>{" "}
                  {customer.actualOrderCount}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>Ordini precedenti:</strong>{" "}
                  {customer.previousOrderCount1}
                </div>
                <div>
                  <strong style={{ color: "#666" }}>Vendite precedenti:</strong>{" "}
                  {formatCurrency(customer.previousSales1)}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                paddingTop: "12px",
                borderTop: "1px solid #e0e0e0",
              }}
            >
              <button
                onClick={() => onEdit(customer.customerProfile)}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
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
                Modifica
              </button>
              {hasSwipeAction && (
                <button
                  onClick={() => onRetry(customer.customerProfile)}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
                    fontWeight: 600,
                    backgroundColor: "#ff9800",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#f57c00";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#ff9800";
                  }}
                >
                  Riprova sync
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

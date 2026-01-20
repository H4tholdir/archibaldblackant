import type { Customer } from "../types/customer";

interface CustomerCardProps {
  customer: Customer;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (customerId: string) => void;
}

export function CustomerCard({
  customer,
  expanded,
  onToggle,
  onEdit,
}: CustomerCardProps) {
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
    if (amount === null || amount === 0) return "€ 0,00";
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        overflow: "hidden",
        transition: "all 0.3s",
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
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "4px",
              }}
            >
              {customer.name}
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
              <strong>Ultimo ordine:</strong> {formatDate(customer.lastOrderDate)}
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
              📄 Dati Fiscali
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
              📞 Contatti
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
              📍 Indirizzo
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
                <strong style={{ color: "#666" }}>Indirizzo logistica:</strong>{" "}
                {customer.logisticsAddress || "N/A"}
              </div>
            </div>
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
              💼 Info Commerciali
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
                <strong style={{ color: "#666" }}>Termini di consegna:</strong>{" "}
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
              📊 Ordini
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
              ✏️ Modifica
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

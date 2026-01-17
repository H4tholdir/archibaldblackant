import type { Product } from "../api/products";

interface ProductCardProps {
  product: Product;
  expanded: boolean;
  onToggle: () => void;
}

export function ProductCard({ product, expanded, onToggle }: ProductCardProps) {
  const formatCurrency = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined || amount === 0)
      return "€ 0,00";
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  const formatDate = (timestamp: number | null | undefined): string => {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("it-IT");
  };

  // Get product image URL or placeholder
  const imageUrl = product.imageLocalPath
    ? `/api/${product.imageLocalPath}`
    : "https://via.placeholder.com/150?text=No+Image";

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
            gap: "16px",
          }}
        >
          {/* Product Image */}
          <div
            style={{
              width: "80px",
              height: "80px",
              flexShrink: 0,
              borderRadius: "8px",
              overflow: "hidden",
              backgroundColor: "#f5f5f5",
            }}
          >
            <img
              src={imageUrl}
              alt={product.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              onError={(e) => {
                e.currentTarget.src =
                  "https://via.placeholder.com/150?text=No+Image";
              }}
            />
          </div>

          {/* Product info */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "4px",
              }}
            >
              {product.name}
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "#666",
                marginBottom: "8px",
              }}
            >
              {product.description || "Nessuna descrizione"}
            </div>
            <div
              style={{
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
                fontSize: "13px",
                color: "#666",
              }}
            >
              {product.groupCode && (
                <span>
                  <strong>Gruppo:</strong> {product.groupCode}
                </span>
              )}
              {product.price !== undefined && product.price !== null && (
                <span>
                  <strong>Prezzo:</strong> {formatCurrency(product.price)}
                </span>
              )}
              {product.packageContent && (
                <span>
                  <strong>Confezione:</strong> {product.packageContent}
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
              flexShrink: 0,
            }}
          >
            ▼
          </div>
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
          {/* Product Group Info */}
          {(product.productGroupId || product.productGroupDescription) && (
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                📦 Gruppo Prodotto
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                {product.productGroupId && (
                  <div>
                    <strong style={{ color: "#666" }}>ID Gruppo:</strong>{" "}
                    {product.productGroupId}
                  </div>
                )}
                {product.productGroupDescription && (
                  <div>
                    <strong style={{ color: "#666" }}>Descrizione:</strong>{" "}
                    {product.productGroupDescription}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Package Information */}
          {(product.packageContent ||
            product.minQty ||
            product.multipleQty ||
            product.maxQty) && (
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                📦 Informazioni Confezione
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                {product.packageContent && (
                  <div>
                    <strong style={{ color: "#666" }}>Contenuto:</strong>{" "}
                    {product.packageContent}
                  </div>
                )}
                {product.minQty !== undefined && product.minQty !== null && (
                  <div>
                    <strong style={{ color: "#666" }}>Qtà minima:</strong>{" "}
                    {product.minQty}
                  </div>
                )}
                {product.multipleQty !== undefined &&
                  product.multipleQty !== null && (
                    <div>
                      <strong style={{ color: "#666" }}>Multiplo:</strong>{" "}
                      {product.multipleQty}
                    </div>
                  )}
                {product.maxQty !== undefined && product.maxQty !== null && (
                  <div>
                    <strong style={{ color: "#666" }}>Qtà massima:</strong>{" "}
                    {product.maxQty}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Price Information */}
          <div style={{ marginBottom: "20px" }}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "12px",
              }}
            >
              💰 Prezzi e IVA
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
                <strong style={{ color: "#666" }}>Prezzo:</strong>{" "}
                {formatCurrency(product.price)}{" "}
                {product.priceCurrency && product.priceCurrency !== "EUR" && (
                  <span style={{ color: "#999" }}>
                    ({product.priceCurrency})
                  </span>
                )}
                {product.priceSource && (
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: "12px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      backgroundColor:
                        product.priceSource === "excel" ? "#e3f2fd" : "#fff3e0",
                      color:
                        product.priceSource === "excel" ? "#1976d2" : "#f57c00",
                    }}
                  >
                    {product.priceSource === "excel" ? "Excel" : "Archibald"}
                  </span>
                )}
              </div>
              {product.vat !== undefined && product.vat !== null && (
                <div>
                  <strong style={{ color: "#666" }}>IVA:</strong> {product.vat}%{" "}
                  {product.vatSource && (
                    <span
                      style={{
                        marginLeft: "8px",
                        fontSize: "12px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: "#e8f5e9",
                        color: "#2e7d32",
                      }}
                    >
                      {product.vatSource}
                    </span>
                  )}
                </div>
              )}
              {product.priceUnit && (
                <div>
                  <strong style={{ color: "#666" }}>Unità:</strong>{" "}
                  {product.priceUnit}
                </div>
              )}
              {product.accountDescription && (
                <div>
                  <strong style={{ color: "#666" }}>Account:</strong>{" "}
                  {product.accountDescription}
                  {product.accountCode && (
                    <span style={{ color: "#999", marginLeft: "4px" }}>
                      ({product.accountCode})
                    </span>
                  )}
                </div>
              )}
              {product.priceValidFrom && product.priceValidTo && (
                <div>
                  <strong style={{ color: "#666" }}>Validità:</strong>{" "}
                  {product.priceValidFrom} → {product.priceValidTo}
                </div>
              )}
              {product.priceQtyFrom && product.priceQtyTo && (
                <div>
                  <strong style={{ color: "#666" }}>Range quantità:</strong>{" "}
                  {product.priceQtyFrom} - {product.priceQtyTo}
                </div>
              )}
            </div>
          </div>

          {/* Additional Info */}
          <div style={{ marginBottom: "20px" }}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "12px",
              }}
            >
              📋 Informazioni Aggiuntive
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
                <strong style={{ color: "#666" }}>Codice:</strong> {product.id}
              </div>
              {product.searchName && (
                <div>
                  <strong style={{ color: "#666" }}>Nome ricerca:</strong>{" "}
                  {product.searchName}
                </div>
              )}
              {product.imageDownloadedAt && (
                <div>
                  <strong style={{ color: "#666" }}>Immagine scaricata:</strong>{" "}
                  {formatDate(product.imageDownloadedAt)}
                </div>
              )}
            </div>
          </div>

          {/* Full Image Preview */}
          {product.imageLocalPath && (
            <div style={{ marginTop: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                🖼️ Immagine Prodotto
              </h3>
              <div
                style={{
                  maxWidth: "400px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  backgroundColor: "#f5f5f5",
                }}
              >
                <img
                  src={imageUrl}
                  alt={product.name}
                  style={{
                    width: "100%",
                    height: "auto",
                  }}
                  onError={(e) => {
                    e.currentTarget.src =
                      "https://via.placeholder.com/400?text=Immagine+Non+Disponibile";
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

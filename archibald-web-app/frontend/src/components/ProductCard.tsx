import type { Product } from "../api/products";

interface ProductCardProps {
  product: Product;
  expanded: boolean;
  onToggle: () => void;
  showVariantBadge?: boolean; // Optional badge showing variant count
  variantCount?: number; // Number of variants for this product
}

export function ProductCard({
  product,
  expanded,
  onToggle,
  showVariantBadge = false,
  variantCount = 1,
}: ProductCardProps) {
  // Utility functions
  const formatCurrency = (amount: number | string | null | undefined): string => {
    if (amount === null || amount === undefined) return "€ 0,00";

    // If already a formatted string (e.g., "32,46 €"), return as-is
    if (typeof amount === "string") {
      // If it's a formatted price string, return it
      if (amount.includes("€") || amount.includes(",")) {
        return amount;
      }
      // Try to parse it as a number
      const parsed = parseFloat(amount.replace(",", "."));
      if (isNaN(parsed)) return "€ 0,00";
      amount = parsed;
    }

    if (amount === 0) return "€ 0,00";

    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  const formatDate = (timestamp: number | null | undefined): string => {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatDateString = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "N/A";
    // Handle various date formats from Archibald
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr; // Return original if invalid
      return date.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Price badge logic
  const getPriceBadge = () => {
    if (product.price === null || product.price === undefined) {
      return {
        text: "⚠️ Prezzo non disponibile",
        bgColor: "#ffebee",
        color: "#c62828",
      };
    }
    if (product.priceSource === "default") {
      return {
        text: "⚠️ Prezzo stimato",
        bgColor: "#fff3e0",
        color: "#f57c00",
      };
    }
    return null;
  };

  const priceBadge = getPriceBadge();

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
              {/* Variant badge */}
              {showVariantBadge && variantCount > 1 && (
                <span
                  style={{
                    marginLeft: "8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "4px 8px",
                    borderRadius: "12px",
                    backgroundColor: "#e3f2fd",
                    color: "#1976d2",
                  }}
                >
                  {variantCount} confezioni
                </span>
              )}
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
              <span>
                <strong>Codice:</strong> {product.id}
              </span>
              {product.groupCode && (
                <span>
                  <strong>Gruppo:</strong> {product.groupCode}
                </span>
              )}
              {/* Show key characteristics in header */}
              {product.figure && (
                <span>
                  <strong>Figura:</strong> {product.figure}
                </span>
              )}
              {product.size && (
                <span>
                  <strong>Grandezza:</strong> {product.size}
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
          {/* SECTION 1: Identificazione */}
          {(product.id ||
            product.searchName ||
            product.displayProductNumber ||
            product.productId) && (
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                🔍 Identificazione
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
                  <strong style={{ color: "#666" }}>ID Articolo:</strong>{" "}
                  {product.id}
                </div>
                {product.searchName && (
                  <div>
                    <strong style={{ color: "#666" }}>Nome ricerca:</strong>{" "}
                    {product.searchName}
                  </div>
                )}
                {product.displayProductNumber && (
                  <div>
                    <strong style={{ color: "#666" }}>Numero prodotto:</strong>{" "}
                    {product.displayProductNumber}
                  </div>
                )}
                {product.productId && product.productId !== product.id && (
                  <div>
                    <strong style={{ color: "#666" }}>ID Prodotto:</strong>{" "}
                    {product.productId}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: Caratteristiche */}
          {(product.figure ||
            product.size ||
            product.packageContent ||
            product.groupCode ||
            product.productGroupId ||
            product.productGroupDescription ||
            product.bulkArticleId ||
            product.legPackage ||
            product.configurationId ||
            product.pcsStandardConfigurationId) && (
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                📐 Caratteristiche
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                {product.figure && (
                  <div>
                    <strong style={{ color: "#666" }}>⭐ Figura:</strong>{" "}
                    <span style={{ fontWeight: 600, color: "#1976d2" }}>
                      {product.figure}
                    </span>
                  </div>
                )}
                {product.size && (
                  <div>
                    <strong style={{ color: "#666" }}>⭐ Grandezza:</strong>{" "}
                    <span style={{ fontWeight: 600, color: "#1976d2" }}>
                      {product.size}
                    </span>
                  </div>
                )}
                {product.packageContent && (
                  <div>
                    <strong style={{ color: "#666" }}>
                      ⭐ Contenuto imballaggio:
                    </strong>{" "}
                    <span style={{ fontWeight: 600, color: "#1976d2" }}>
                      {product.packageContent}
                    </span>
                  </div>
                )}
                {product.groupCode && (
                  <div>
                    <strong style={{ color: "#666" }}>Gruppo articolo:</strong>{" "}
                    {product.groupCode}
                  </div>
                )}
                {product.productGroupDescription && (
                  <div>
                    <strong style={{ color: "#666" }}>
                      Descrizione gruppo:
                    </strong>{" "}
                    {product.productGroupDescription}
                  </div>
                )}
                {product.productGroupId && (
                  <div>
                    <strong style={{ color: "#666" }}>ID gruppo prodotti:</strong>{" "}
                    {product.productGroupId}
                  </div>
                )}
                {product.bulkArticleId && (
                  <div>
                    <strong style={{ color: "#666" }}>ID blocco articolo:</strong>{" "}
                    {product.bulkArticleId}
                  </div>
                )}
                {product.legPackage && (
                  <div>
                    <strong style={{ color: "#666" }}>Pacco gamba:</strong>{" "}
                    {product.legPackage}
                  </div>
                )}
                {product.configurationId && (
                  <div>
                    <strong style={{ color: "#666" }}>ID configurazione:</strong>{" "}
                    {product.configurationId}
                  </div>
                )}
                {product.pcsStandardConfigurationId && (
                  <div>
                    <strong style={{ color: "#666" }}>
                      PCS ID configurazione:
                    </strong>{" "}
                    {product.pcsStandardConfigurationId}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 3: Quantità */}
          {(product.minQty !== undefined ||
            product.multipleQty !== undefined ||
            product.maxQty !== undefined ||
            product.standardQty ||
            product.defaultQty ||
            product.unitId) && (
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                📊 Quantità
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                {product.minQty !== undefined && product.minQty !== null && (
                  <div>
                    <strong style={{ color: "#666" }}>Qtà minima:</strong>{" "}
                    {product.minQty}
                  </div>
                )}
                {product.multipleQty !== undefined &&
                  product.multipleQty !== null && (
                    <div>
                      <strong style={{ color: "#666" }}>Qtà in multipli:</strong>{" "}
                      {product.multipleQty}
                    </div>
                  )}
                {product.maxQty !== undefined && product.maxQty !== null && (
                  <div>
                    <strong style={{ color: "#666" }}>Qtà massima:</strong>{" "}
                    {product.maxQty}
                  </div>
                )}
                {product.standardQty && (
                  <div>
                    <strong style={{ color: "#666" }}>⭐ Qtà standard:</strong>{" "}
                    <span style={{ fontWeight: 600, color: "#1976d2" }}>
                      {product.standardQty}
                    </span>
                  </div>
                )}
                {product.defaultQty && (
                  <div>
                    <strong style={{ color: "#666" }}>⭐ Qtà predefinita:</strong>{" "}
                    <span style={{ fontWeight: 600, color: "#1976d2" }}>
                      {product.defaultQty}
                    </span>
                  </div>
                )}
                {product.unitId && (
                  <div>
                    <strong style={{ color: "#666" }}>Unità:</strong>{" "}
                    {product.unitId}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 4: Pricing & Sconti */}
          <div style={{ marginBottom: "20px" }}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "12px",
              }}
            >
              💰 Prezzi e Sconti
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
                  <span style={{ color: "#999" }}>({product.priceCurrency})</span>
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
                {priceBadge && (
                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: "12px",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      backgroundColor: priceBadge.bgColor,
                      color: priceBadge.color,
                      display: "inline-block",
                    }}
                  >
                    {priceBadge.text}
                  </div>
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
                  <strong style={{ color: "#666" }}>Unità prezzo:</strong>{" "}
                  {product.priceUnit}
                </div>
              )}
              {product.lineDiscount && (
                <div>
                  <strong style={{ color: "#666" }}>⭐ Sconto linea:</strong>{" "}
                  <span style={{ fontWeight: 600, color: "#1976d2" }}>
                    {product.lineDiscount}
                  </span>
                </div>
              )}
              {product.totalAbsoluteDiscount && (
                <div>
                  <strong style={{ color: "#666" }}>
                    ⭐ Sconto assoluto totale:
                  </strong>{" "}
                  <span style={{ fontWeight: 600, color: "#1976d2" }}>
                    {product.totalAbsoluteDiscount}
                  </span>
                </div>
              )}
              {product.purchPrice && (
                <div>
                  <strong style={{ color: "#666" }}>Prezzo acquisto:</strong>{" "}
                  {product.purchPrice}
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
                  <strong style={{ color: "#666" }}>Validità prezzo:</strong>{" "}
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

          {/* SECTION 5: Metadati */}
          {(product.createdBy ||
            product.createdDate ||
            product.modifiedBy ||
            product.modifiedDatetime ||
            product.dataAreaId ||
            product.orderableArticle ||
            product.stopped) && (
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                🏷️ Metadati
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                {product.createdBy && (
                  <div>
                    <strong style={{ color: "#666" }}>Creato da:</strong>{" "}
                    {product.createdBy}
                  </div>
                )}
                {product.createdDate && (
                  <div>
                    <strong style={{ color: "#666" }}>Data creazione:</strong>{" "}
                    {formatDateString(product.createdDate)}
                  </div>
                )}
                {product.modifiedBy && (
                  <div>
                    <strong style={{ color: "#666" }}>Modificato da:</strong>{" "}
                    {product.modifiedBy}
                  </div>
                )}
                {product.modifiedDatetime && (
                  <div>
                    <strong style={{ color: "#666" }}>Data modifica:</strong>{" "}
                    {formatDateString(product.modifiedDatetime)}
                  </div>
                )}
                {product.dataAreaId && (
                  <div>
                    <strong style={{ color: "#666" }}>DataAreaId:</strong>{" "}
                    {product.dataAreaId}
                  </div>
                )}
                {product.orderableArticle && (
                  <div>
                    <strong style={{ color: "#666" }}>Articolo ordinabile:</strong>{" "}
                    <span
                      style={{
                        color:
                          product.orderableArticle.toLowerCase() === "yes" ||
                          product.orderableArticle === "1"
                            ? "#2e7d32"
                            : "#c62828",
                        fontWeight: 600,
                      }}
                    >
                      {product.orderableArticle === "1"
                        ? "Sì"
                        : product.orderableArticle}
                    </span>
                  </div>
                )}
                {product.stopped && (
                  <div>
                    <strong style={{ color: "#666" }}>Fermato:</strong>{" "}
                    <span
                      style={{
                        color:
                          product.stopped.toLowerCase() === "yes" ||
                          product.stopped === "1"
                            ? "#c62828"
                            : "#2e7d32",
                        fontWeight: 600,
                      }}
                    >
                      {product.stopped === "1" ? "Sì" : product.stopped}
                    </span>
                  </div>
                )}
                {product.lastSync && (
                  <div>
                    <strong style={{ color: "#666" }}>Ultimo sync:</strong>{" "}
                    {formatDate(product.lastSync)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

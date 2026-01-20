import type { Product } from "../api/products";

interface VariantSelectorProps {
  variants: Product[];
  selectedVariantId: string;
  onVariantChange: (variantId: string) => void;
}

export function VariantSelector({
  variants,
  selectedVariantId,
  onVariantChange,
}: VariantSelectorProps) {
  if (variants.length <= 1) {
    // No need for selector if only one variant
    return null;
  }

  // Sort variants by numeric value in packageContent (descending)
  const sortedVariants = [...variants].sort((a, b) => {
    const extractNumber = (pkg: string | undefined): number => {
      if (!pkg) return 0;
      const match = pkg.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };
    return extractNumber(b.packageContent) - extractNumber(a.packageContent);
  });

  const formatCurrency = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined || amount === 0)
      return "€ 0,00";
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  return (
    <div style={{ marginBottom: "20px" }}>
      <h3
        style={{
          fontSize: "16px",
          fontWeight: 700,
          color: "#333",
          marginBottom: "12px",
        }}
      >
        📦 Seleziona Confezione
      </h3>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {sortedVariants.map((variant) => {
          const isSelected = variant.id === selectedVariantId;
          return (
            <label
              key={variant.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                padding: "16px",
                borderRadius: "8px",
                border: isSelected ? "2px solid #1976d2" : "2px solid #e0e0e0",
                backgroundColor: isSelected ? "#e3f2fd" : "#fff",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = "#f5f5f5";
                  e.currentTarget.style.borderColor = "#bdbdbd";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = "#fff";
                  e.currentTarget.style.borderColor = "#e0e0e0";
                }
              }}
            >
              {/* Radio button */}
              <input
                type="radio"
                name="variant-selector"
                value={variant.id}
                checked={isSelected}
                onChange={() => onVariantChange(variant.id)}
                style={{
                  marginRight: "12px",
                  marginTop: "4px",
                  width: "18px",
                  height: "18px",
                  cursor: "pointer",
                  accentColor: "#1976d2",
                }}
              />

              {/* Variant details */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: isSelected ? "#1976d2" : "#333",
                    marginBottom: "6px",
                  }}
                >
                  {variant.packageContent || "Standard"}
                </div>

                <div
                  style={{
                    fontSize: "13px",
                    color: "#666",
                    marginBottom: "8px",
                  }}
                >
                  <strong>Codice:</strong> {variant.id}
                </div>

                {/* Quantity rules */}
                <div
                  style={{
                    display: "flex",
                    gap: "16px",
                    flexWrap: "wrap",
                    fontSize: "13px",
                    color: "#666",
                  }}
                >
                  {variant.minQty !== undefined && variant.minQty !== null && (
                    <span>
                      <strong>Min:</strong> {variant.minQty}
                    </span>
                  )}
                  {variant.multipleQty !== undefined &&
                    variant.multipleQty !== null && (
                      <span>
                        <strong>Multipli:</strong> {variant.multipleQty}
                      </span>
                    )}
                  {variant.maxQty !== undefined && variant.maxQty !== null && (
                    <span>
                      <strong>Max:</strong> {variant.maxQty}
                    </span>
                  )}
                </div>

                {/* Price (if available) */}
                {variant.price !== undefined && variant.price !== null && (
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: isSelected ? "#1976d2" : "#333",
                    }}
                  >
                    {formatCurrency(variant.price)}
                    {variant.vat !== undefined && variant.vat !== null && (
                      <span
                        style={{
                          marginLeft: "8px",
                          fontSize: "12px",
                          fontWeight: 400,
                          color: "#666",
                        }}
                      >
                        (IVA {variant.vat}%)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {/* Helper text */}
      <div
        style={{
          marginTop: "12px",
          fontSize: "12px",
          color: "#999",
          fontStyle: "italic",
        }}
      >
        💡 Seleziona la confezione appropriata in base alla quantità desiderata
      </div>
    </div>
  );
}

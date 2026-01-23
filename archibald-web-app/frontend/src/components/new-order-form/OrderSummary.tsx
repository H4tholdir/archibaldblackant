interface OrderSummaryProps {
  itemsSubtotal: number;
  globalDiscount: number;
  subtotalAfterGlobalDiscount: number;
  vat: number;
  total: number;
}

export function OrderSummary({
  itemsSubtotal,
  globalDiscount,
  subtotalAfterGlobalDiscount,
  vat,
  total,
}: OrderSummaryProps) {
  const formatCurrency = (amount: number) => {
    return `€${amount.toFixed(2)}`;
  };

  return (
    <div
      style={{
        padding: "1.5rem",
        backgroundColor: "#f9fafb",
        borderRadius: "8px",
        border: "1px solid #e5e7eb",
      }}
    >
      <h3
        style={{
          fontSize: "1.125rem",
          fontWeight: "600",
          marginBottom: "1rem",
        }}
      >
        Riepilogo Ordine
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {/* Items Subtotal */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#6b7280" }}>Subtotale Articoli</span>
          <span style={{ fontWeight: "500" }}>
            {formatCurrency(itemsSubtotal)}
          </span>
        </div>

        {/* Global Discount */}
        {globalDiscount > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ color: "#6b7280" }}>Sconto Globale</span>
            <span style={{ fontWeight: "500", color: "#dc2626" }}>
              -{formatCurrency(globalDiscount)}
            </span>
          </div>
        )}

        {/* Subtotal After Global Discount */}
        {globalDiscount > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: "0.75rem",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <span style={{ color: "#6b7280" }}>Subtotale (dopo sconto)</span>
            <span style={{ fontWeight: "500" }}>
              {formatCurrency(subtotalAfterGlobalDiscount)}
            </span>
          </div>
        )}

        {/* VAT */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#6b7280" }}>IVA (22%)</span>
          <span style={{ fontWeight: "500" }}>{formatCurrency(vat)}</span>
        </div>

        {/* Total */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "0.75rem",
            borderTop: "2px solid #374151",
            marginTop: "0.5rem",
          }}
        >
          <span style={{ fontSize: "1.125rem", fontWeight: "600" }}>
            Totale
          </span>
          <span style={{ fontSize: "1.25rem", fontWeight: "700" }}>
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

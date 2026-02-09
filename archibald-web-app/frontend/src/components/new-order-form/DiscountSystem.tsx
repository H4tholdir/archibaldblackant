import { useState } from "react";

interface DiscountSystemProps {
  orderSubtotal: number;
  discountType?: "percentage" | "amount";
  discountValue?: number;
  reverseMode?: boolean;
  calculatedDiscountPercent?: number;
  calculatedDiscountAmount?: number;
  onChange: (discount: {
    discountType: "percentage" | "amount";
    discountValue: number;
  }) => void;
  onReverseCalculate: (targetTotal: number) => void;
}

export function DiscountSystem({
  orderSubtotal: _orderSubtotal,
  discountType: _discountType = "percentage",
  discountValue = 0,
  reverseMode = false,
  calculatedDiscountPercent,
  calculatedDiscountAmount,
  onChange,
  onReverseCalculate,
}: DiscountSystemProps) {
  const [targetTotal, setTargetTotal] = useState<number>(0);

  const handleTargetTotalChange = (value: number) => {
    setTargetTotal(value);
    onReverseCalculate(value);
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
        Sconto Globale
      </h3>

      {!reverseMode ? (
        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="discount-value"
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: "500",
            }}
          >
            Sconto Globale (%)
          </label>
          <input
            id="discount-value"
            type="number"
            value={discountValue}
            onChange={(e) =>
              onChange({
                discountType: "percentage",
                discountValue:
                  parseFloat(e.target.value.replace(",", ".")) || 0,
              })
            }
            placeholder="0-100"
            style={{
              width: "100%",
              padding: "0.5rem",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              backgroundColor: "white",
            }}
          />
        </div>
      ) : (
        <>
          <div style={{ marginBottom: "1rem" }}>
            <label
              htmlFor="target-total"
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
              }}
            >
              Totale Desiderato (con IVA)
            </label>
            <input
              id="target-total"
              type="number"
              value={targetTotal}
              onChange={(e) =>
                handleTargetTotalChange(
                  parseFloat(e.target.value.replace(",", ".")) || 0,
                )
              }
              placeholder="0,00"
              style={{
                width: "100%",
                padding: "0.5rem",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                backgroundColor: "white",
              }}
            />
          </div>

          {calculatedDiscountPercent !== undefined &&
            calculatedDiscountAmount !== undefined && (
              <div
                style={{
                  padding: "1rem",
                  backgroundColor: "#dbeafe",
                  borderRadius: "4px",
                  fontSize: "0.875rem",
                }}
              >
                <div style={{ fontWeight: "600", marginBottom: "0.25rem" }}>
                  Sconto calcolato: {calculatedDiscountPercent.toFixed(2)}% ( €
                  {calculatedDiscountAmount.toFixed(2)})
                </div>
                <div style={{ color: "#6b7280" }}>
                  Questo sconto globale porterà il totale al valore desiderato
                </div>
              </div>
            )}
        </>
      )}
    </div>
  );
}

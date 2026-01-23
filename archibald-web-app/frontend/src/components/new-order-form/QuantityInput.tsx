import { useState, useEffect } from "react";
import type { ProductVariant } from "../../db/schema";

interface QuantityInputProps {
  productId: string;
  variant: ProductVariant | null;
  value: number;
  onChange: (quantity: number, isValid: boolean) => void;
  disabled?: boolean;
}

export function QuantityInput({
  productId,
  variant,
  value,
  onChange,
  disabled = false,
}: QuantityInputProps) {
  const [inputValue, setInputValue] = useState(value.toString());
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const validateQuantity = (qty: number): string | null => {
    if (!variant) {
      return null; // No variant selected yet
    }

    if (qty < variant.minQty) {
      return `Quantità minima: ${variant.minQty}`;
    }

    if (qty > variant.maxQty) {
      return `Quantità massima: ${variant.maxQty}`;
    }

    if (variant.multipleQty > 1 && qty % variant.multipleQty !== 0) {
      return `Quantità deve essere multiplo di ${variant.multipleQty}`;
    }

    return null; // Valid
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setInputValue(rawValue);

    const numValue = parseInt(rawValue, 10);

    if (isNaN(numValue) || numValue <= 0) {
      setValidationError("Quantità non valida");
      onChange(0, false);
      return;
    }

    const error = validateQuantity(numValue);
    setValidationError(error);
    onChange(numValue, error === null);
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: "0.5rem" }}>
        <label
          htmlFor={`quantity-${productId}`}
          style={{
            display: "block",
            marginBottom: "0.25rem",
            fontWeight: "500",
            fontSize: "0.875rem",
          }}
        >
          Quantità
        </label>
        <input
          id={`quantity-${productId}`}
          type="number"
          value={inputValue}
          onChange={handleChange}
          disabled={disabled}
          min={variant?.minQty || 1}
          max={variant?.maxQty || undefined}
          step={variant?.multipleQty || 1}
          aria-label="Quantità"
          aria-invalid={validationError !== null}
          aria-describedby={
            validationError ? `quantity-error-${productId}` : undefined
          }
          style={{
            width: "100%",
            padding: "0.5rem",
            fontSize: "1rem",
            border: validationError ? "1px solid #dc2626" : "1px solid #ccc",
            borderRadius: "4px",
            outline: "none",
          }}
        />
      </div>

      {/* Variant Constraints Info */}
      {variant && (
        <div
          style={{
            padding: "0.5rem",
            backgroundColor: "#f3f4f6",
            borderRadius: "4px",
            fontSize: "0.875rem",
            color: "#4b5563",
            marginBottom: "0.5rem",
          }}
        >
          <div>
            <strong>Confezione:</strong> {variant.packageContent}
          </div>
          <div>
            <strong>Range:</strong> {variant.minQty} - {variant.maxQty} unità
          </div>
          {variant.multipleQty > 1 && (
            <div>
              <strong>Multiplo:</strong> {variant.multipleQty}
            </div>
          )}
        </div>
      )}

      {/* Validation Error */}
      {validationError && (
        <div
          id={`quantity-error-${productId}`}
          role="alert"
          style={{
            padding: "0.5rem",
            backgroundColor: "#fee2e2",
            border: "1px solid #dc2626",
            borderRadius: "4px",
            fontSize: "0.875rem",
            color: "#991b1b",
          }}
        >
          {validationError}
        </div>
      )}
    </div>
  );
}

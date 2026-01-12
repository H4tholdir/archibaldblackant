import type React from "react";
import type { Product } from "../api/products";

interface PackageInfoProps {
  variants: Product[];
  selectedVariant: Product | null;
  quantity: number;
}

/**
 * PackageInfo displays all available package variants for a product
 * and highlights which variant will be selected based on quantity.
 *
 * Selection logic:
 * - If quantity >= highest multipleQty → select highest package
 * - Else → select lowest package
 */
export function PackageInfo({
  variants,
  selectedVariant,
  quantity,
}: PackageInfoProps): React.ReactElement {
  if (variants.length === 0) {
    return <></>;
  }

  // Show package info only if there are multiple variants
  if (variants.length === 1) {
    const variant = variants[0];
    return (
      <div className="package-info-single">
        <p className="package-label">Confezione:</p>
        <p className="package-content">
          {variant.packageContent || "Non specificato"}
        </p>
        {variant.minQty && (
          <p className="package-rules">Min: {variant.minQty} colli</p>
        )}
      </div>
    );
  }

  return (
    <div className="package-info">
      <p className="package-label">
        Confezioni disponibili (quantità: {quantity}):
      </p>
      <ul className="package-list">
        {variants.map((variant) => {
          const isSelected = selectedVariant?.variantId === variant.variantId;
          return (
            <li
              key={variant.variantId}
              className={isSelected ? "package-item selected" : "package-item"}
            >
              <span className="package-content">
                {variant.packageContent || "Non specificato"}
              </span>
              <span className="package-rules">
                {variant.minQty && `Min: ${variant.minQty}`}
                {variant.multipleQty &&
                  ` | Multipli di: ${variant.multipleQty}`}
                {variant.maxQty && ` | Max: ${variant.maxQty}`}
              </span>
              {isSelected && <span className="selected-badge">✓ Selezionato</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

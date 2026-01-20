import { useState, useEffect } from "react";
import { ProductCard } from "./ProductCard";
import { VariantSelector } from "./VariantSelector";
import { getProductVariants, type Product } from "../api/products";

interface ProductDetailModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

export function ProductDetailModal({
  product,
  isOpen,
  onClose,
}: ProductDetailModalProps) {
  const [variants, setVariants] = useState<Product[]>([product]);
  const [selectedVariantId, setSelectedVariantId] = useState(product.id);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch variants when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchVariants = async () => {
      setLoadingVariants(true);
      setError(null);

      try {
        const token = localStorage.getItem("archibald_jwt");
        if (!token) {
          throw new Error("Non autenticato");
        }

        const response = await getProductVariants(token, product.name);
        if (response.success) {
          setVariants(response.data.variants);
          // Keep current product as selected if it exists in variants
          const currentExists = response.data.variants.some(
            (v) => v.id === product.id,
          );
          if (!currentExists && response.data.variants.length > 0) {
            // Default to first variant if current not found
            setSelectedVariantId(response.data.variants[0].id);
          }
        }
      } catch (err) {
        console.error("Error fetching variants:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Errore nel caricamento delle varianti",
        );
        // Keep single product as fallback
        setVariants([product]);
      } finally {
        setLoadingVariants(false);
      }
    };

    fetchVariants();
  }, [isOpen, product]);

  // Keyboard navigation and body scroll prevention
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    // Prevent body scroll when modal open
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Get currently selected variant
  const selectedVariant =
    variants.find((v) => v.id === selectedVariantId) || variants[0] || product;

  if (!isOpen) return null;

  return (
    <>
      {/* Modal Overlay */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          overflowY: "auto",
        }}
        onClick={onClose}
      >
        {/* Modal Content */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "12px",
            maxWidth: "900px",
            width: "100%",
            maxHeight: "90vh",
            overflowY: "auto",
            position: "relative",
          }}
          onClick={(e) => e.stopPropagation()} // Prevent close on content click
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              position: "sticky",
              top: "16px",
              right: "16px",
              float: "right",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              border: "none",
              backgroundColor: "#f5f5f5",
              color: "#666",
              fontSize: "24px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#e0e0e0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#f5f5f5";
            }}
            aria-label="Chiudi"
          >
            ×
          </button>

          {/* Modal Body */}
          <div style={{ padding: "24px", clear: "both" }}>
            <h2
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "20px",
              }}
            >
              {product.name}
            </h2>

            {/* Error Message */}
            {error && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#ffebee",
                  color: "#c62828",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  fontSize: "14px",
                }}
              >
                ⚠️ {error}
              </div>
            )}

            {/* Loading State */}
            {loadingVariants && (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "#999",
                }}
              >
                <div
                  style={{
                    fontSize: "16px",
                    marginBottom: "12px",
                  }}
                >
                  Caricamento varianti...
                </div>
              </div>
            )}

            {/* Variant Selector */}
            {!loadingVariants && variants.length > 1 && (
              <VariantSelector
                variants={variants}
                selectedVariantId={selectedVariantId}
                onVariantChange={setSelectedVariantId}
              />
            )}

            {/* Product Card (always expanded) */}
            {!loadingVariants && (
              <ProductCard
                product={selectedVariant}
                expanded={true}
                onToggle={() => {}} // No-op since always expanded in modal
                showVariantBadge={false} // Don't show badge in modal
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

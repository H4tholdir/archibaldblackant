import { useState, useEffect, useCallback } from "react";
import { ProductCard } from "../components/ProductCard";
import { ProductDetailModal } from "../components/ProductDetailModal";
import { getProducts, getProductsWithoutVatCount, type Product } from "../api/products";
import { PriceVariationsModal } from "../components/PriceVariationsModal";
import { ProductVariationsModal } from "../components/ProductVariationsModal";
import { useKeyboardScroll } from "../hooks/useKeyboardScroll";

interface ProductFilters {
  search: string;
}

export function ArticoliList() {
  const { scrollFieldIntoView, keyboardPaddingStyle } = useKeyboardScroll();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filters, setFilters] = useState<ProductFilters>({
    search: "",
  });
  const [hasSearched, setHasSearched] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [returnedCount, setReturnedCount] = useState(0);
  const [limited, setLimited] = useState(false);
  const [variantCounts, setVariantCounts] = useState<Record<string, number>>(
    {},
  );
  const [showPriceVariationsModal, setShowPriceVariationsModal] =
    useState(false);
  const [showProductVariationsModal, setShowProductVariationsModal] =
    useState(false);
  const [noVatCount, setNoVatCount] = useState(0);
  const [vatFilterActive, setVatFilterActive] = useState(false);

  // Load no-vat count on mount
  useEffect(() => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;
    getProductsWithoutVatCount(token)
      .then((result) => setNoVatCount(result.count))
      .catch(() => {});
  }, []);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters.search]);

  // Fetch products when search changes (not on mount)
  const fetchProducts = useCallback(async () => {
    if (!debouncedSearch && !vatFilterActive) {
      setProducts([]);
      setTotalCount(0);
      setReturnedCount(0);
      setLimited(false);
      setVariantCounts({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato. Effettua il login.");
        setLoading(false);
        return;
      }

      const response = await getProducts(
        token,
        vatFilterActive ? undefined : debouncedSearch,
        200,
        !vatFilterActive,
        vatFilterActive ? "missing" : undefined,
      );

      if (!response.success) {
        throw new Error("Errore nel caricamento dei prodotti");
      }

      const filteredProducts = response.data.products;

      setProducts(filteredProducts);
      setTotalCount(response.data.totalCount);
      setReturnedCount(response.data.returnedCount);
      setLimited(response.data.limited);

      const counts: Record<string, number> = {};
      filteredProducts.forEach((p) => {
        if (p.name) {
          counts[p.name] = (counts[p.name] || 0) + 1;
        }
      });
      setVariantCounts(counts);
    } catch (err) {
      console.error("Error fetching products:", err);
      if (err instanceof Error && err.message.includes("401")) {
        setError("Sessione scaduta. Effettua il login.");
        localStorage.removeItem("archibald_jwt");
      } else {
        setError(
          err instanceof Error ? err.message : "Errore di rete. Riprova.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, vatFilterActive]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleCardClick = (product: Product) => {
    setModalProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalProduct(null);
  };

  const handleClearFilters = () => {
    setFilters({ search: "" });
    setVatFilterActive(false);
    setHasSearched(false);
  };

  const handleToggleVatFilter = () => {
    const next = !vatFilterActive;
    setVatFilterActive(next);
    if (next) {
      setFilters({ search: "" });
    }
  };

  const hasActiveFilters = filters.search || vatFilterActive;

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "24px",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
        ...keyboardPaddingStyle,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "#333",
            marginBottom: "8px",
          }}
        >
          📦 Articoli
        </h1>
        <p style={{ fontSize: "16px", color: "#666" }}>
          Catalogo articoli con prezzi, IVA e informazioni complete
        </p>
        {!loading && totalCount > 0 && (
          <div
            style={{
              fontSize: "14px",
              color: "#999",
              marginTop: "8px",
            }}
          >
            {totalCount.toLocaleString("it-IT")} articoli totali nel database
            {limited && (
              <span style={{ color: "#ff9800", marginLeft: "8px" }}>
                (visualizzati primi {returnedCount})
              </span>
            )}
          </div>
        )}
      </div>

      {/* No-VAT Banner */}
      {noVatCount > 0 && !vatFilterActive && (
        <div
          onClick={handleToggleVatFilter}
          style={{
            backgroundColor: "#fff3e0",
            border: "1px solid #ff9800",
            borderRadius: "12px",
            padding: "12px 20px",
            marginBottom: "16px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#ffe0b2";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#fff3e0";
          }}
        >
          <span style={{ fontSize: "20px" }}>⚠️</span>
          <span style={{ fontSize: "14px", color: "#e65100", fontWeight: 600 }}>
            {noVatCount} articol{noVatCount !== 1 ? "i" : "o"} senza IVA nel database. Clicca per visualizzarl{noVatCount !== 1 ? "i" : "o"}.
          </span>
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          {/* Search */}
          <div>
            <label
              htmlFor="product-search"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "8px",
              }}
            >
              Cerca prodotto
            </label>
            <input
              id="product-search"
              type="text"
              placeholder="Nome, codice, descrizione..."
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "14px",
                border: "1px solid #ddd",
                borderRadius: "8px",
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#1976d2";
                scrollFieldIntoView(e.target as HTMLElement);
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#ddd";
              }}
            />
          </div>

        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "12px" }}>
          {/* Clear filters button */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 600,
                border: "1px solid #f44336",
                borderRadius: "8px",
                backgroundColor: "#fff",
                color: "#f44336",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f44336";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#fff";
                e.currentTarget.style.color = "#f44336";
              }}
            >
              ✕ Cancella filtri
            </button>
          )}

          {/* Price Variations button */}
          <button
            onClick={() => setShowPriceVariationsModal(true)}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              border: "1px solid #ff9800",
              borderRadius: "8px",
              backgroundColor: "#fff",
              color: "#ff9800",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#ff9800";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#fff";
              e.currentTarget.style.color = "#ff9800";
            }}
          >
            Variazione Prezzi
          </button>

          {/* Product Variations button */}
          <button
            onClick={() => setShowProductVariationsModal(true)}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              border: "1px solid #7b1fa2",
              borderRadius: "8px",
              backgroundColor: "#fff",
              color: "#7b1fa2",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#7b1fa2";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#fff";
              e.currentTarget.style.color = "#7b1fa2";
            }}
          >
            Variazioni Prodotti
          </button>

          {/* No-VAT filter button */}
          {noVatCount > 0 && (
            <button
              onClick={handleToggleVatFilter}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 600,
                border: `1px solid ${vatFilterActive ? "#fff" : "#e65100"}`,
                borderRadius: "8px",
                backgroundColor: vatFilterActive ? "#e65100" : "#fff",
                color: vatFilterActive ? "#fff" : "#e65100",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!vatFilterActive) {
                  e.currentTarget.style.backgroundColor = "#e65100";
                  e.currentTarget.style.color = "#fff";
                }
              }}
              onMouseLeave={(e) => {
                if (!vatFilterActive) {
                  e.currentTarget.style.backgroundColor = "#fff";
                  e.currentTarget.style.color = "#e65100";
                }
              }}
            >
              Senza IVA ({noVatCount})
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              marginBottom: "16px",
              animation: "spin 1s linear infinite",
            }}
          >
            ⏳
          </div>
          <p style={{ fontSize: "16px", color: "#666" }}>
            Caricamento prodotti...
          </p>
          <style>
            {`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}
          </style>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            border: "2px solid #f44336",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              textAlign: "center",
              marginBottom: "16px",
            }}
          >
            ⚠️
          </div>
          <p
            style={{
              fontSize: "16px",
              color: "#f44336",
              textAlign: "center",
              marginBottom: "16px",
            }}
          >
            {error}
          </p>
          <div style={{ textAlign: "center" }}>
            <button
              onClick={fetchProducts}
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
              Riprova
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && products.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>
            {hasSearched ? "📦" : "🔍"}
          </div>
          <p
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#333",
              marginBottom: "8px",
            }}
          >
            {hasSearched
              ? "Nessun prodotto trovato"
              : "Cerca un prodotto"}
          </p>
          <p style={{ fontSize: "14px", color: "#666" }}>
            {hasSearched
              ? "Prova a modificare i filtri di ricerca"
              : "Usa il campo di ricerca per trovare articoli per nome, codice o descrizione"}
          </p>
        </div>
      )}

      {/* Product list */}
      {!loading && !error && products.length > 0 && (
        <div>
          <div
            style={{
              marginBottom: "12px",
              fontSize: "14px",
              color: "#666",
              paddingLeft: "4px",
            }}
          >
            {products.length} prodott{products.length !== 1 ? "i" : "o"} trovat
            {products.length !== 1 ? "i" : "o"}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
              gap: "16px",
            }}
          >
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                expanded={false}
                onToggle={() => handleCardClick(product)}
                showVariantBadge={true}
                variantCount={variantCounts[product.name] || 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {modalProduct && (
        <ProductDetailModal
          product={modalProduct}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}

      {/* Price Variations Modal */}
      <PriceVariationsModal
        isOpen={showPriceVariationsModal}
        onClose={() => setShowPriceVariationsModal(false)}
      />

      {/* Product Variations Modal */}
      <ProductVariationsModal
        isOpen={showProductVariationsModal}
        onClose={() => setShowProductVariationsModal(false)}
      />
    </div>
  );
}

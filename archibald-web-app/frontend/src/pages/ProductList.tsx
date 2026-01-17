import { useState, useEffect, useCallback } from "react";
import { ProductCard } from "../components/ProductCard";
import { getProducts, type Product } from "../api/products";

interface ProductFilters {
  search: string;
  groupCode: string;
}

export function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(
    null,
  );
  const [filters, setFilters] = useState<ProductFilters>({
    search: "",
    groupCode: "",
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [returnedCount, setReturnedCount] = useState(0);
  const [limited, setLimited] = useState(false);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters.search]);

  // Fetch products on mount and when filters change
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato. Effettua il login.");
        setLoading(false);
        return;
      }

      const response = await getProducts(token, debouncedSearch, 200);

      if (!response.success) {
        throw new Error("Errore nel caricamento dei prodotti");
      }

      // Filter by groupCode if needed (client-side filtering)
      let filteredProducts = response.data.products;
      if (filters.groupCode) {
        filteredProducts = filteredProducts.filter(
          (p) => p.groupCode === filters.groupCode,
        );
      }

      setProducts(filteredProducts);
      setTotalCount(response.data.totalCount);
      setReturnedCount(response.data.returnedCount);
      setLimited(response.data.limited);
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
  }, [debouncedSearch, filters.groupCode]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleToggle = (productId: string) => {
    if (expandedProductId === productId) {
      setExpandedProductId(null);
    } else {
      setExpandedProductId(productId);
    }
  };

  const handleClearFilters = () => {
    setFilters({
      search: "",
      groupCode: "",
    });
  };

  const hasActiveFilters = filters.search || filters.groupCode;

  // Extract unique group codes for filter dropdown
  const uniqueGroupCodes = Array.from(
    new Set(products.map((p) => p.groupCode).filter(Boolean)),
  ).sort();

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "24px",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
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
          📦 Prodotti
        </h1>
        <p style={{ fontSize: "16px", color: "#666" }}>
          Catalogo prodotti con immagini e informazioni complete
        </p>
        {!loading && totalCount > 0 && (
          <div
            style={{
              fontSize: "14px",
              color: "#999",
              marginTop: "8px",
            }}
          >
            {totalCount.toLocaleString("it-IT")} prodotti totali nel database
            {limited && (
              <span style={{ color: "#ff9800", marginLeft: "8px" }}>
                (visualizzati primi {returnedCount})
              </span>
            )}
          </div>
        )}
      </div>

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
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#ddd";
              }}
            />
          </div>

          {/* Group Code Filter */}
          {uniqueGroupCodes.length > 0 && (
            <div>
              <label
                htmlFor="group-filter"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#333",
                  marginBottom: "8px",
                }}
              >
                Filtra per gruppo
              </label>
              <select
                id="group-filter"
                value={filters.groupCode}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, groupCode: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#1976d2";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#ddd";
                }}
              >
                <option value="">Tutti i gruppi</option>
                {uniqueGroupCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          )}
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
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>📦</div>
          <p
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#333",
              marginBottom: "8px",
            }}
          >
            Nessun prodotto trovato
          </p>
          <p style={{ fontSize: "14px", color: "#666" }}>
            {hasActiveFilters
              ? "Prova a modificare i filtri di ricerca"
              : "Nessun prodotto nel database"}
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
            {products.map((product) => {
              const isExpanded = expandedProductId === product.id;

              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  expanded={isExpanded}
                  onToggle={() => handleToggle(product.id)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

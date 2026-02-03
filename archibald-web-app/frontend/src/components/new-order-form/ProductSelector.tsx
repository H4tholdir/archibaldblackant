import { useState, useEffect, useRef, useCallback } from "react";
import { productService } from "../../services/products.service";
import type { Product } from "../../db/schema";

interface ProductSelectorProps {
  onSelect: (product: Product) => void;
  placeholder?: string;
  disabled?: boolean;
  searchFn?: (query: string) => Promise<Product[]>; // For testing
}

export function ProductSelector({
  onSelect,
  placeholder = "Cerca prodotto per nome o codice articolo...",
  disabled = false,
  searchFn = productService.searchProducts.bind(productService),
}: ProductSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Debounced search
  useEffect(() => {
    // Don't search if product is already selected
    if (selectedProduct) {
      return;
    }

    if (searchQuery.length === 0) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer (300ms debounce)
    debounceTimerRef.current = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const products = await searchFn(searchQuery);
        setResults(products);
        setShowDropdown(products.length > 0);
      } catch (err) {
        setError("Errore durante la ricerca");
        console.error("[ProductSelector] Search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, searchFn, selectedProduct]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown || results.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : prev,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < results.length) {
            handleSelect(results[highlightedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setShowDropdown(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [showDropdown, results, highlightedIndex],
  );

  const handleSelect = (product: Product) => {
    setSelectedProduct(product);
    setSearchQuery(product.name);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    setResults([]);
    onSelect(product);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);

    // If user modifies after selection, clear selection
    if (selectedProduct && newValue !== selectedProduct.name) {
      setSelectedProduct(null);
    }
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Input Field */}
      <div style={{ marginBottom: "0.5rem" }}>
        <label
          htmlFor="product-search"
          style={{
            display: "block",
            marginBottom: "0.25rem",
            fontWeight: "500",
            fontSize: "0.875rem",
          }}
        >
          Prodotto
        </label>
        <input
          ref={inputRef}
          id="product-search"
          name="product-search-field"
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="new-password"
          data-form-type="other"
          aria-label="Cerca prodotto"
          aria-autocomplete="list"
          aria-controls="product-dropdown"
          aria-expanded={showDropdown}
          style={{
            width: "100%",
            padding: "0.5rem",
            fontSize: "1rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            outline: "none",
            ...(selectedProduct && {
              borderColor: "#22c55e",
              backgroundColor: "#f0fdf4",
            }),
          }}
        />
      </div>

      {/* Loading Indicator */}
      {loading && (
        <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
          Ricerca in corso...
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{ fontSize: "0.875rem", color: "#dc2626" }}>{error}</div>
      )}

      {/* Selected Product Confirmation */}
      {selectedProduct && !showDropdown && (
        <div
          style={{
            padding: "0.5rem",
            backgroundColor: "#f0fdf4",
            border: "1px solid #22c55e",
            borderRadius: "4px",
            fontSize: "0.875rem",
            color: "#15803d",
          }}
        >
          ✅ Prodotto selezionato: <strong>{selectedProduct.name}</strong>
          {selectedProduct.article && (
            <span style={{ marginLeft: "0.5rem", color: "#6b7280" }}>
              ({selectedProduct.article})
            </span>
          )}
        </div>
      )}

      {/* Dropdown Results */}
      {showDropdown && results.length > 0 && (
        <div
          ref={dropdownRef}
          id="product-dropdown"
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            maxHeight: "300px",
            overflowY: "auto",
            backgroundColor: "white",
            border: "1px solid #ccc",
            borderRadius: "4px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            zIndex: 1000,
          }}
        >
          {results.map((product, index) => (
            <div
              key={product.id}
              role="option"
              aria-selected={index === highlightedIndex}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleSelect(product);
              }}
              style={{
                padding: "0.75rem",
                cursor: "pointer",
                backgroundColor:
                  index === highlightedIndex ? "#f3f4f6" : "white",
                borderBottom:
                  index < results.length - 1 ? "1px solid #e5e7eb" : "none",
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div style={{ fontWeight: "500" }}>{product.name}</div>
              {product.article && (
                <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                  Codice: {product.article}
                </div>
              )}
              {product.description && (
                <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                  {product.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

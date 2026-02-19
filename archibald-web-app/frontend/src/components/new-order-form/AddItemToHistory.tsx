import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  productService,
  type PackagingResult,
} from "../../services/products.service";
import { formatCurrency } from "../../utils/format-currency";
import { priceService } from "../../services/prices.service";
import type { Product } from "../../types/product";
import type { PendingOrderItem } from "../../types/pending-order";
import {
  WarehouseMatchAccordion,
  type SelectedWarehouseMatch,
} from "../WarehouseMatchAccordion";
import { normalizeVatRate } from "../../utils/vat-utils";
import { toastService } from "../../services/toast.service";

interface AddItemToHistoryProps {
  onAdd: (items: PendingOrderItem[]) => void;
  onCancel: () => void;
  existingItems: PendingOrderItem[];
}

export function AddItemToHistory({
  onAdd,
  onCancel,
  existingItems,
}: AddItemToHistoryProps) {
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchingProduct, setSearchingProduct] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const [quantity, setQuantity] = useState("");
  const [packagingPreview, setPackagingPreview] =
    useState<PackagingResult | null>(null);
  const [calculatingPackaging, setCalculatingPackaging] = useState(false);

  const [warehouseSelection, setWarehouseSelection] = useState<
    SelectedWarehouseMatch[]
  >([]);

  interface VariantInfo {
    variantId: string;
    productId: string;
    packageContent: string;
    price: number | null;
    vat: number;
  }
  const [productVariants, setProductVariants] = useState<VariantInfo[]>([]);

  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const excludedWarehouseItemIds = useMemo(
    () =>
      existingItems
        .filter((item) => item.warehouseSources)
        .flatMap((item) =>
          item.warehouseSources!.map((s) => s.warehouseItemId),
        ),
    [existingItems],
  );

  const warehouseQty = useMemo(
    () => warehouseSelection.reduce((sum, sel) => sum + sel.quantity, 0),
    [warehouseSelection],
  );

  // Product search with debounce
  useEffect(() => {
    if (selectedProduct) return;
    if (productSearch.length < 2) {
      setProductResults([]);
      return;
    }

    setSearchingProduct(true);
    const timer = setTimeout(async () => {
      try {
        const results = await productService.searchProducts(productSearch, 50);
        // Deduplicate by name, max 10
        const seen = new Set<string>();
        const deduped: Product[] = [];
        for (const r of results) {
          if (!seen.has(r.name)) {
            seen.add(r.name);
            deduped.push(r);
          }
          if (deduped.length >= 10) break;
        }
        setProductResults(deduped);
        setHighlightedIndex(-1);
      } catch {
        setProductResults([]);
      } finally {
        setSearchingProduct(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [productSearch, selectedProduct]);

  // Load variants when product selected
  useEffect(() => {
    if (!selectedProduct) {
      setProductVariants([]);
      return;
    }

    const loadVariants = async () => {
      const productName = selectedProduct.name;
      const allProductsWithDetails = await productService.searchProducts(productName, 100);
      const allProducts = allProductsWithDetails.filter(p => p.name === productName);

      const variants: VariantInfo[] = [];
      for (const p of allProducts) {
        const priceData = await priceService.getPriceAndVat(p.id);
        variants.push({
          variantId: p.id,
          productId: p.id,
          packageContent: p.packageContent || "",
          price: priceData?.price ?? null,
          vat: normalizeVatRate(priceData?.vat) ?? 0,
        });
      }
      setProductVariants(variants);
    };

    loadVariants();
  }, [selectedProduct]);

  // Calculate packaging when quantity changes
  useEffect(() => {
    if (!selectedProduct || !quantity) {
      setPackagingPreview(null);
      return;
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setPackagingPreview(null);
      return;
    }

    setCalculatingPackaging(true);
    const productName = selectedProduct.name || selectedProduct.article;

    productService
      .calculateOptimalPackaging(productName, qty)
      .then((result) => {
        setPackagingPreview(result);
      })
      .catch(() => {
        setPackagingPreview(null);
      })
      .finally(() => {
        setCalculatingPackaging(false);
      });
  }, [selectedProduct, quantity]);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setProductSearch(product.name);
    setProductResults([]);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (productResults.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < productResults.length - 1 ? prev + 1 : prev,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case "Enter":
          e.preventDefault();
          if (
            highlightedIndex >= 0 &&
            highlightedIndex < productResults.length
          ) {
            handleSelectProduct(productResults[highlightedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setProductResults([]);
          setHighlightedIndex(-1);
          break;
      }
    },
    [productResults, highlightedIndex],
  );

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setProductResults([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAdd = async () => {
    setError(null);

    if (!selectedProduct) {
      setError("Seleziona un prodotto");
      return;
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setError("Inserisci una quantita' valida");
      return;
    }

    const requestedQty = qty;
    const qtyToOrder = Math.max(0, requestedQty - warehouseQty);
    const isFullyFromWarehouse = qtyToOrder === 0;
    const isPartiallyFromWarehouse = warehouseQty > 0 && qtyToOrder > 0;

    let residualPackaging: PackagingResult | null = null;
    if (isPartiallyFromWarehouse) {
      const productName = selectedProduct.name || selectedProduct.article;
      residualPackaging = await productService.calculateOptimalPackaging(
        productName,
        qtyToOrder,
      );
    }

    if (
      !isFullyFromWarehouse &&
      !isPartiallyFromWarehouse &&
      (!packagingPreview || !packagingPreview.success)
    ) {
      setError(
        packagingPreview?.error ||
          "Impossibile calcolare il confezionamento per questa quantita'",
      );
      return;
    }

    const warehouseSources =
      warehouseQty > 0
        ? warehouseSelection.map((sel) => ({
            warehouseItemId: sel.warehouseItemId,
            boxName: sel.boxName,
            quantity: sel.quantity,
          }))
        : undefined;

    const newItems: PendingOrderItem[] = [];

    const createWarehouseOnly =
      isFullyFromWarehouse ||
      (isPartiallyFromWarehouse && !residualPackaging?.success);

    if (createWarehouseOnly) {
      const articleCode = selectedProduct.name || selectedProduct.article;
      const productWithDetails = await productService.getProductById(articleCode);
      const variants = productWithDetails?.variants ?? [];

      if (!variants || variants.length === 0) {
        setError(`Nessuna variante disponibile per ${articleCode}`);
        return;
      }

      const smallestVariant = variants.reduce((min, curr) =>
        curr.minQty < min.minQty ? curr : min,
      );

      const variantCode = smallestVariant.variantId;
      const price = await priceService.getPriceByArticleId(variantCode);
      if (!price) {
        setError(`Prezzo non disponibile per ${variantCode}`);
        return;
      }

      const variantProduct = await productService.getProductById(variantCode);
      const rawVatRate = normalizeVatRate(variantProduct?.vat);
      if (rawVatRate === null) {
        toastService.warning(
          `IVA non impostata per ${articleCode}. Vai in Articoli per impostarla. Usato 0%.`,
        );
      }
      const vatRate = rawVatRate ?? 0;

      newItems.push({
        articleCode: variantCode,
        articleId: variantCode,
        productName: articleCode,
        description: selectedProduct.description || "",
        quantity: warehouseQty,
        price,
        vat: vatRate,
        warehouseQuantity: warehouseQty,
        warehouseSources,
      });
    } else if (isPartiallyFromWarehouse && residualPackaging?.success) {
      const breakdown = residualPackaging.breakdown!;
      for (let i = 0; i < breakdown.length; i++) {
        const pkg = breakdown[i];
        const variantArticleCode = pkg.variant.variantId;
        const price =
          await priceService.getPriceByArticleId(variantArticleCode);
        if (!price) {
          setError(`Prezzo non disponibile per ${variantArticleCode}`);
          return;
        }
        const variantProduct = await productService.getProductById(variantArticleCode);
        const rawVatRate = normalizeVatRate(variantProduct?.vat);
        if (rawVatRate === null && i === 0) {
          toastService.warning(
            `IVA non impostata per ${selectedProduct.name}. Vai in Articoli per impostarla. Usato 0%.`,
          );
        }
        const vatRate = rawVatRate ?? 0;

        newItems.push({
          articleCode: variantArticleCode,
          articleId: variantArticleCode,
          productName: selectedProduct.name,
          description: selectedProduct.description || "",
          quantity: pkg.totalPieces,
          price,
          vat: vatRate,
          warehouseQuantity: i === 0 ? warehouseQty : undefined,
          warehouseSources: i === 0 ? warehouseSources : undefined,
        });
      }
    } else {
      const breakdown = packagingPreview!.breakdown!;
      let vatWarningShown = false;
      for (const pkg of breakdown) {
        const variantArticleCode = pkg.variant.variantId;
        const price =
          await priceService.getPriceByArticleId(variantArticleCode);
        if (!price) {
          setError(`Prezzo non disponibile per ${variantArticleCode}`);
          return;
        }
        const variantProduct = await productService.getProductById(variantArticleCode);
        const rawVatRate = normalizeVatRate(variantProduct?.vat);
        if (rawVatRate === null && !vatWarningShown) {
          toastService.warning(
            `IVA non impostata per ${selectedProduct.name}. Vai in Articoli per impostarla. Usato 0%.`,
          );
          vatWarningShown = true;
        }
        const vatRate = rawVatRate ?? 0;

        newItems.push({
          articleCode: variantArticleCode,
          articleId: variantArticleCode,
          productName: selectedProduct.name,
          description: selectedProduct.description || "",
          quantity: pkg.totalPieces,
          price,
          vat: vatRate,
        });
      }
    }

    onAdd(newItems);
  };

  return (
    <div
      style={{
        padding: "0.75rem",
        background: "#f0fdf4",
        border: "1px solid #86efac",
        borderRadius: "6px",
        marginTop: "0.5rem",
      }}
    >
      <div
        style={{
          fontWeight: "600",
          marginBottom: "0.5rem",
          fontSize: "0.9rem",
        }}
      >
        Aggiungi articolo
      </div>

      {/* Product search */}
      <div style={{ position: "relative", marginBottom: "0.5rem" }}>
        <input
          ref={searchInputRef}
          type="text"
          value={productSearch}
          onChange={(e) => {
            setProductSearch(e.target.value);
            if (selectedProduct) {
              setSelectedProduct(null);
              setQuantity("");
              setPackagingPreview(null);
              setWarehouseSelection([]);
              setProductVariants([]);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Cerca prodotto..."
          autoComplete="off"
          style={{
            width: "100%",
            padding: "0.5rem",
            fontSize: "0.9rem",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            outline: "none",
          }}
        />
        {searchingProduct && (
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            Ricerca...
          </div>
        )}
        {productResults.length > 0 && (
          <div
            ref={dropdownRef}
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              maxHeight: "200px",
              overflowY: "auto",
              backgroundColor: "white",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              zIndex: 1000,
            }}
          >
            {productResults.map((product, idx) => (
              <div
                key={product.id}
                onClick={() => handleSelectProduct(product)}
                style={{
                  padding: "0.5rem",
                  cursor: "pointer",
                  backgroundColor:
                    idx === highlightedIndex ? "#bfdbfe" : "white",
                  borderBottom: "1px solid #e5e7eb",
                  fontSize: "0.85rem",
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                <div style={{ fontWeight: "500" }}>{product.name}</div>
                {product.description && (
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                    {product.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variants preview */}
      {selectedProduct && productVariants.length > 0 && (
        <div
          style={{
            marginBottom: "0.5rem",
            fontSize: "0.75rem",
            color: "#374151",
          }}
        >
          <strong>Varianti:</strong>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.25rem",
              marginTop: "0.25rem",
            }}
          >
            {productVariants.map((v) => (
              <span
                key={v.variantId}
                style={{
                  padding: "0.15rem 0.4rem",
                  background: "#e5e7eb",
                  borderRadius: "4px",
                  fontSize: "0.7rem",
                }}
              >
                {v.packageContent || v.variantId}
                {v.price !== null ? ` - ${formatCurrency(v.price)}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quantity input */}
      {selectedProduct && (
        <div style={{ marginBottom: "0.5rem" }}>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Quantita'..."
            min={1}
            style={{
              width: "100%",
              padding: "0.5rem",
              fontSize: "0.9rem",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              outline: "none",
            }}
          />
        </div>
      )}

      {/* Packaging preview */}
      {calculatingPackaging && (
        <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
          Calcolo confezionamento...
        </div>
      )}
      {packagingPreview &&
        packagingPreview.success &&
        packagingPreview.breakdown && (
          <div
            style={{
              marginBottom: "0.5rem",
              fontSize: "0.75rem",
              padding: "0.4rem",
              background: "#dbeafe",
              borderRadius: "4px",
            }}
          >
            <strong>Confezionamento:</strong>{" "}
            {packagingPreview.breakdown
              .map(
                (pkg) =>
                  `${pkg.packageCount}x ${pkg.packageSize}pz (${pkg.variant.variantId})`,
              )
              .join(" + ")}
          </div>
        )}
      {packagingPreview && !packagingPreview.success && (
        <div
          style={{
            marginBottom: "0.5rem",
            fontSize: "0.75rem",
            color: "#dc2626",
          }}
        >
          {packagingPreview.error}
        </div>
      )}

      {/* Warehouse accordion */}
      {selectedProduct && quantity && parseInt(quantity, 10) > 0 && (
        <div style={{ marginBottom: "0.5rem" }}>
          <WarehouseMatchAccordion
            articleCode={selectedProduct.name || selectedProduct.article}
            description={selectedProduct.description}
            requestedQuantity={parseInt(quantity, 10)}
            onSelect={setWarehouseSelection}
            excludeWarehouseItemIds={excludedWarehouseItemIds}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            fontSize: "0.8rem",
            color: "#dc2626",
            marginBottom: "0.5rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          onClick={handleAdd}
          style={{
            padding: "0.4rem 1rem",
            background: "#16a34a",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: "500",
          }}
        >
          Aggiungi
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "0.4rem 1rem",
            background: "#e5e7eb",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          Annulla
        </button>
      </div>
    </div>
  );
}

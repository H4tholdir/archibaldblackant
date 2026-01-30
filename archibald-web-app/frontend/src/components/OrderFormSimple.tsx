import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { customerService } from "../services/customers.service";
import {
  productService,
  type PackagingResult,
} from "../services/products.service";
import { priceService } from "../services/prices.service";
import { orderService } from "../services/orders.service";
import { cachePopulationService } from "../services/cache-population";
import { toastService } from "../services/toast.service";
import { db } from "../db/schema";
import type {
  Customer,
  Product,
  DraftOrder,
  PendingOrderItem,
} from "../db/schema";
import {
  WarehouseMatchAccordion,
  type SelectedWarehouseMatch,
} from "./WarehouseMatchAccordion";
import { releaseWarehouseReservations } from "../services/warehouse-order-integration";

interface OrderItem {
  id: string;
  productId: string; // ID della variante specifica (usato per recuperare prezzo e VAT)
  article: string; // Codice variante (stesso valore di productId)
  productName: string; // Nome articolo (raggruppamento, es: "H129FSQ.104.023")
  description?: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // Aliquota IVA (0, 4, 5, 10, 22, etc.)
  discount: number; // Sconto in euro
  subtotal: number; // Prezzo * quantità - sconto
  vat: number; // Importo IVA calcolato
  total: number; // Subtotal + IVA
  // Warehouse integration (Phase 4)
  warehouseQuantity?: number; // How many from warehouse
  warehouseSources?: Array<{
    warehouseItemId: number;
    boxName: string;
    quantity: number;
  }>;
  // 🔧 FIX #3: Group key to track variants of same product (for warehouse data preservation)
  productGroupKey?: string; // Used to group variants, preserve warehouse data when deleting rows
}

/**
 * Normalize VAT rate to valid Italian VAT values
 * Valid rates: 0, 4, 5, 10, 22 (most common)
 * Falls back to 22% (ordinary rate) if invalid or undefined
 */
function normalizeVatRate(vat: number | null | undefined): number {
  // If null or undefined, use ordinary rate
  if (vat === null || vat === undefined) {
    return 22;
  }

  // Valid Italian VAT rates (expanded list)
  const validRates = [0, 4, 5, 10, 22];

  // If exact match, use it
  if (validRates.includes(vat)) {
    return vat;
  }

  // If close to a valid rate (within 0.5%), round to nearest valid rate
  // This handles floating point precision issues
  for (const validRate of validRates) {
    if (Math.abs(vat - validRate) < 0.5) {
      console.warn(
        `[OrderForm] VAT rate ${vat} rounded to ${validRate} (close match)`,
      );
      return validRate;
    }
  }

  // Unknown VAT rate - log warning and use ordinary rate
  console.warn(`[OrderForm] Unknown VAT rate ${vat}, using ordinary rate 22%`);
  return 22;
}

export default function OrderFormSimple() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Responsive design: detect mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Step 1: Customer selection
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [searchingCustomer, setSearchingCustomer] = useState(false);

  // Step 2: Product entry with intelligent variant selection
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchingProduct, setSearchingProduct] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [itemDiscount, setItemDiscount] = useState("0");

  // Packaging preview state
  const [packagingPreview, setPackagingPreview] =
    useState<PackagingResult | null>(null);
  const [calculatingPackaging, setCalculatingPackaging] = useState(false);

  // Warehouse selection state (Phase 4)
  const [warehouseSelection, setWarehouseSelection] = useState<
    SelectedWarehouseMatch[]
  >([]);

  // Product details preview state
  interface ProductVariantInfo {
    variantId: string;
    productId: string;
    packageContent: string;
    price: number | null;
    vat: number;
  }
  const [productVariants, setProductVariants] = useState<ProductVariantInfo[]>(
    [],
  );

  // Step 3: Order items
  const [items, setItems] = useState<OrderItem[]>([]);
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState("0");
  const [targetTotal, setTargetTotal] = useState("");

  // 🔧 FIX #2: Memoize excluded warehouse item IDs to prevent re-renders
  const excludedWarehouseItemIds = useMemo(
    () =>
      items
        .filter((item) => item.warehouseSources)
        .flatMap((item) =>
          item.warehouseSources!.map((s) => s.warehouseItemId),
        ),
    [items],
  );

  // Calculate total quantity selected from warehouse
  const warehouseSelectedQty = useMemo(
    () => warehouseSelection.reduce((sum, sel) => sum + sel.quantity, 0),
    [warehouseSelection],
  );

  // 🔧 FIX #1: Track if quantity change comes from warehouse selection
  const isWarehouseUpdateRef = useRef(false);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [cacheSyncing, setCacheSyncing] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);

  // Auto-save draft state
  const [hasDraft, setHasDraft] = useState(false);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);

  // Track original order items for warehouse restoration if user exits without saving
  const [originalOrderItems, setOriginalOrderItems] = useState<
    PendingOrderItem[]
  >([]);
  const [orderSavedSuccessfully, setOrderSavedSuccessfully] = useState(false);

  // === LOAD ORDER FOR EDITING ===
  // Check if we're editing an existing order
  useEffect(() => {
    const loadOrderForEditing = async () => {
      const orderIdParam = searchParams.get("editOrderId");
      if (!orderIdParam) return;

      const orderId = parseInt(orderIdParam, 10);
      if (isNaN(orderId)) return;

      setLoadingOrder(true);
      setEditingOrderId(orderId);

      try {
        const order = await orderService.getPendingOrderById(orderId);
        if (!order) {
          toastService.error("Ordine non trovato");
          navigate("/pending-orders");
          return;
        }

        // Save original order items for potential restoration
        setOriginalOrderItems(order.items);

        // Release warehouse reservations when starting edit
        // This ensures a clean slate - items will be re-reserved when order is saved
        console.log(
          "[OrderForm] Releasing warehouse reservations for editing",
          {
            orderId,
          },
        );
        try {
          await releaseWarehouseReservations(orderId);
          console.log(
            "[OrderForm] ✅ Warehouse reservations released for editing",
          );
        } catch (warehouseError) {
          console.error(
            "[OrderForm] Failed to release warehouse reservations",
            warehouseError,
          );
          // Continue anyway - this is not critical for loading the order
        }

        // Load customer
        const customer = await customerService.getCustomerById(
          order.customerId,
        );
        if (customer) {
          setSelectedCustomer(customer);
          setCustomerSearch(customer.name);
        }

        // Convert order items to OrderItem format
        const loadedItems: OrderItem[] = await Promise.all(
          order.items.map(async (item) => {
            const vatRate = normalizeVatRate(item.vat);
            const subtotal = item.price * item.quantity - (item.discount || 0);
            const vatAmount = subtotal * (vatRate / 100);

            // Prefer explicit variant ID, fallback to legacy articleCode
            let productId = item.articleId || item.articleCode;

            // If articleCode is actually a product name, resolve a variant ID
            if (item.productName && productId === item.productName) {
              const product = await db.products
                .where("name")
                .equals(item.productName)
                .first();
              if (product) {
                productId = product.id;
              }
            }

            return {
              id: crypto.randomUUID(),
              productId,
              article: productId,
              productName: item.productName || item.articleCode,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.price,
              vatRate,
              discount: item.discount || 0,
              subtotal,
              vat: vatAmount,
              total: subtotal + vatAmount,
              // Phase 4: Preserve warehouse data when loading order for editing
              warehouseQuantity: item.warehouseQuantity,
              warehouseSources: item.warehouseSources,
              // productGroupKey will be assigned below if multiple variants exist
            };
          }),
        );

        // 🔧 FIX #3: Assign productGroupKey to items with same productName
        // This enables warehouse data preservation when editing loaded orders
        const productGroups = new Map<string, OrderItem[]>();
        for (const item of loadedItems) {
          const key = item.productName;
          if (!productGroups.has(key)) {
            productGroups.set(key, []);
          }
          productGroups.get(key)!.push(item);
        }

        // Assign group keys only to groups with multiple items
        for (const [productName, groupItems] of productGroups.entries()) {
          if (groupItems.length > 1) {
            const groupKey = `${productName}-loaded-${Date.now()}`;
            for (const item of groupItems) {
              item.productGroupKey = groupKey;
            }
          }
        }

        setItems(loadedItems);

        // Calculate and set global discount if needed
        // For now, we don't have global discount stored in the order
        // so we leave it at 0
      } catch (error) {
        console.error("[OrderForm] Failed to load order:", error);
        toastService.error("Errore durante il caricamento dell'ordine");
        navigate("/pending-orders");
      } finally {
        setLoadingOrder(false);
      }
    };

    loadOrderForEditing();
  }, [searchParams, navigate]);

  // === CLEANUP: RESTORE WAREHOUSE RESERVATIONS IF USER EXITS WITHOUT SAVING ===
  useEffect(() => {
    // Cleanup function that runs when component unmounts
    return () => {
      // Only restore if:
      // 1. We were editing an order (not creating new)
      // 2. Order was NOT saved successfully
      // 3. We have original items to restore
      if (
        editingOrderId &&
        !orderSavedSuccessfully &&
        originalOrderItems.length > 0
      ) {
        console.log(
          "[OrderForm] User exited without saving - restoring warehouse reservations",
          { orderId: editingOrderId },
        );

        // Restore reservations asynchronously (fire and forget)
        // We can't await here because cleanup is synchronous
        (async () => {
          try {
            const { reserveWarehouseItems } =
              await import("../services/warehouse-order-integration");
            await reserveWarehouseItems(editingOrderId, originalOrderItems);
            console.log(
              "[OrderForm] ✅ Warehouse reservations restored after exit without save",
            );
          } catch (error) {
            console.error(
              "[OrderForm] Failed to restore warehouse reservations",
              error,
            );
            // Can't show toast here as component is unmounted
          }
        })();
      }
    };
  }, [editingOrderId, orderSavedSuccessfully, originalOrderItems]);

  // === AUTO-SYNC VARIANTS ON MOUNT ===
  // Check if variants are populated, if not trigger cache refresh
  useEffect(() => {
    const checkAndSyncVariants = async () => {
      try {
        // Check if productVariants table has data
        const variantCount = await db.productVariants.count();
        console.log("[OrderForm] Variant count in cache:", variantCount);

        if (variantCount === 0) {
          console.log(
            "[OrderForm] No variants in cache, triggering automatic sync...",
          );
          setCacheSyncing(true);

          // Get auth token from localStorage
          const token = localStorage.getItem("archibald_jwt");
          if (!token) {
            console.error("[OrderForm] No auth token found");
            return;
          }

          // Trigger cache population
          const result = await cachePopulationService.populateCache(token);

          if (result.success) {
            console.log(
              "[OrderForm] Cache sync completed:",
              result.recordCounts,
            );
          } else {
            console.error("[OrderForm] Cache sync failed:", result.error);
          }
        }
      } catch (error) {
        console.error("[OrderForm] Error checking variants:", error);
      } finally {
        setCacheSyncing(false);
      }
    };

    checkAndSyncVariants();
  }, []); // Run once on mount

  // === CUSTOMER SEARCH ===
  const handleCustomerSearch = async (query: string) => {
    setCustomerSearch(query);
    if (query.length < 2) {
      setCustomerResults([]);
      return;
    }

    setSearchingCustomer(true);
    try {
      const results = await customerService.searchCustomers(query);
      setCustomerResults(results.slice(0, 10));
    } catch (error) {
      console.error("Customer search failed:", error);
    } finally {
      setSearchingCustomer(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setCustomerResults([]);
  };

  // === PRODUCT SEARCH (GROUPED BY NAME) ===
  const handleProductSearch = async (query: string) => {
    setProductSearch(query);
    if (query.length < 2) {
      setProductResults([]);
      return;
    }

    setSearchingProduct(true);
    try {
      const results = await productService.searchProducts(query);

      // Group products by name (show only one per unique name)
      const groupedByName = new Map<string, Product>();
      results.forEach((product) => {
        if (!groupedByName.has(product.name)) {
          groupedByName.set(product.name, product);
        }
      });

      const uniqueProducts = Array.from(groupedByName.values()).slice(0, 10);
      setProductResults(uniqueProducts);
    } catch (error) {
      console.error("Product search failed:", error);
    } finally {
      setSearchingProduct(false);
    }
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setProductSearch(product.name);
    setProductResults([]);
    // Reset quantity and preview when product changes
    setQuantity("");
    setPackagingPreview(null);
    // Reset product variants
    setProductVariants([]);
    // Reset warehouse selection
    setWarehouseSelection([]);
  };

  // === LOAD PRODUCT DETAILS ===
  // Load all variants with their prices and VAT when product is selected
  useEffect(() => {
    const loadProductDetails = async () => {
      if (!selectedProduct) {
        setProductVariants([]);
        return;
      }

      try {
        // Find all products (variants) with the same name
        const allVariants = await db.products
          .where("name")
          .equals(selectedProduct.name)
          .toArray();

        console.log(
          `[OrderForm] Found ${allVariants.length} variants for: ${selectedProduct.name}`,
        );

        // Load price and VAT for each variant
        const variantsWithDetails: ProductVariantInfo[] = [];

        for (const variant of allVariants) {
          const priceAndVat = await priceService.getPriceAndVat(variant.id);
          const price = priceAndVat?.price || null;
          const vat = normalizeVatRate(priceAndVat?.vat);

          variantsWithDetails.push({
            variantId: variant.id,
            productId: selectedProduct.name, // Product name is the grouping key
            packageContent: variant.packageContent || "N/A",
            price: price,
            vat: vat,
          });

          console.log(
            `[OrderForm] Variant ${variant.id}: package=${variant.packageContent}, price=${price === null ? "NOT FOUND" : `€${price}`}, vat=${vat}%`,
          );
        }

        // Log warning if no prices found
        const noPricesCount = variantsWithDetails.filter(
          (v) => v.price === null,
        ).length;
        if (noPricesCount > 0) {
          console.warn(
            `[OrderForm] ${noPricesCount}/${variantsWithDetails.length} variants have no price. Cache may need sync.`,
          );
        }

        setProductVariants(variantsWithDetails);

        // Update selectedProduct to first variant with a price (for backward compatibility)
        const firstWithPrice = allVariants.find(
          (v) =>
            variantsWithDetails.find((d) => d.variantId === v.id)?.price !==
            null,
        );
        if (firstWithPrice && firstWithPrice.id !== selectedProduct.id) {
          console.log(
            `[OrderForm] Switching to variant ${firstWithPrice.id} (has price)`,
          );
          setSelectedProduct(firstWithPrice);
        }
      } catch (error) {
        console.error("[OrderForm] Failed to load product details:", error);
        setProductVariants([]);
      }
    };

    loadProductDetails();
  }, [selectedProduct?.name]); // Only depend on name, not the whole object

  // === INTELLIGENT PACKAGING CALCULATION ===
  // Calculate optimal packaging whenever quantity changes
  useEffect(() => {
    const calculatePackaging = async () => {
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
      try {
        // Use the base product ID (without variant suffix) for packaging calculation
        // The productService will find all variants for this product name
        const result = await productService.calculateOptimalPackaging(
          selectedProduct.name, // Use name to find all variants
          qty,
        );

        setPackagingPreview(result);
      } catch (error) {
        console.error("Packaging calculation failed:", error);
        setPackagingPreview({
          success: false,
          error: "Errore nel calcolo del confezionamento",
        });
      } finally {
        setCalculatingPackaging(false);
      }
    };

    calculatePackaging();
  }, [selectedProduct, quantity]);

  // === CHECK FOR EXISTING DRAFT ON MOUNT ===
  useEffect(() => {
    const checkForDraft = async () => {
      // Don't check for draft if we're editing an existing order
      if (editingOrderId) return;

      try {
        const drafts = await orderService.getDraftOrders();
        if (drafts.length > 0) {
          const latestDraft = drafts[0]; // getDraftOrders returns sorted by updatedAt DESC
          setHasDraft(true);
          setDraftId(latestDraft.id!);
        }
      } catch (error) {
        console.error("[OrderForm] Failed to check for drafts:", error);
      }
    };

    checkForDraft();
  }, [editingOrderId]);

  // === AUTO-SAVE DRAFT EVERY 30 SECONDS ===
  useEffect(() => {
    // Don't auto-save if:
    // - Editing an existing order (not a new draft)
    // - No customer selected
    // Note: We now save even if items.length === 0 to preserve customer selection
    if (editingOrderId || !selectedCustomer) {
      return;
    }

    const autoSaveInterval = setInterval(async () => {
      try {
        const now = new Date().toISOString();

        // Convert OrderItems to DraftOrderItems (simpler format)
        const draftItems = items.map((item) => ({
          productId: item.productId, // Variant ID (used for price/VAT lookup)
          productName: item.productName,
          article: item.article,
          variantId: item.article, // Variant ID (same as productId)
          quantity: item.quantity,
          packageContent: item.description || "",
        }));

        const draft: Omit<DraftOrder, "id"> = {
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          items: draftItems,
          createdAt: draftId ? (undefined as any) : now, // Keep original createdAt if updating
          updatedAt: now,
        };

        if (draftId) {
          // Update existing draft
          await db.draftOrders.update(draftId, {
            ...draft,
            updatedAt: now,
          });
        } else {
          // Create new draft
          const id = await orderService.saveDraftOrder(draft);
          setDraftId(id);
        }

        setLastAutoSave(new Date());
        console.log(
          "[OrderForm] Draft auto-saved at",
          new Date().toLocaleTimeString(),
        );
      } catch (error) {
        console.error("[OrderForm] Auto-save failed:", error);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [selectedCustomer, items, draftId, editingOrderId]);

  // === RECOVER DRAFT ===
  const handleRecoverDraft = async () => {
    if (!draftId) return;

    try {
      const draft = await db.draftOrders.get(draftId);
      if (!draft) {
        toastService.error("Bozza non trovata");
        setHasDraft(false);
        setDraftId(null);
        return;
      }

      // Load customer
      const customer = await customerService.getCustomerById(draft.customerId);
      if (customer) {
        setSelectedCustomer(customer);
        setCustomerSearch(customer.name);
      }

      // Convert DraftOrderItems back to OrderItems
      const recoveredItems: OrderItem[] = [];
      for (const draftItem of draft.items) {
        // Get variant-specific product and price
        // draftItem.article contains the variant ID
        const variantId = draftItem.article;

        // Get product to retrieve VAT
        const product = await db.products.get(variantId);
        // Get price by articleId (variantId) - this is price per piece
        const unitPrice = await priceService.getPriceByArticleId(variantId);

        if (product && unitPrice !== null) {
          // Get VAT from product (most accurate source)
          const vatRate = normalizeVatRate(product.vat);

          const subtotal = unitPrice * draftItem.quantity;
          const vat = subtotal * (vatRate / 100);

          recoveredItems.push({
            id: crypto.randomUUID(),
            productId: variantId, // Use variant ID
            article: draftItem.article,
            productName: draftItem.productName,
            description: draftItem.packageContent,
            quantity: draftItem.quantity,
            unitPrice,
            vatRate,
            discount: 0,
            subtotal,
            vat,
            total: subtotal + vat,
          });
        } else {
          console.warn(
            `[OrderForm] Product or price not found for variant ${variantId} during draft recovery`,
            { product, unitPrice },
          );
        }
      }

      setItems(recoveredItems);
      setHasDraft(false);

      toastService.success("Bozza recuperata con successo!");
    } catch (error) {
      console.error("[OrderForm] Failed to recover draft:", error);
      toastService.error("Errore durante il recupero della bozza");
    }
  };

  // === DISCARD DRAFT ===
  const handleDiscardDraft = async () => {
    if (!draftId) return;

    try {
      await orderService.deleteDraftOrder(draftId);
      setHasDraft(false);
      setDraftId(null);
      toastService.success("Bozza eliminata");
    } catch (error) {
      console.error("[OrderForm] Failed to discard draft:", error);
      toastService.error("Errore durante l'eliminazione della bozza");
    }
  };

  // === ADD ITEM (WITH MULTIPLE LINES FOR VARIANTS) ===
  const handleAddItem = async () => {
    if (!selectedProduct) {
      toastService.warning("Seleziona un prodotto");
      return;
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      toastService.warning("Inserisci una quantità valida");
      return;
    }

    // Check if quantity is fully covered by warehouse
    const requestedQty = parseInt(quantity, 10);
    const warehouseQty = warehouseSelection.reduce(
      (sum, sel) => sum + sel.quantity,
      0,
    );
    const isFullyFromWarehouse = warehouseQty >= requestedQty;

    // If not fully from warehouse, validate packaging
    if (!isFullyFromWarehouse) {
      if (!packagingPreview || !packagingPreview.success) {
        toastService.error(
          packagingPreview?.error ||
            "Impossibile calcolare il confezionamento per questa quantità",
        );
        return;
      }

      // Get breakdown of variants from packaging calculation
      const breakdown = packagingPreview.breakdown;
      if (!breakdown || breakdown.length === 0) {
        toastService.error("Nessuna combinazione di varianti disponibile");
        return;
      }
    }

    // Get discount (will be applied to total, not per line)
    const disc = parseFloat(itemDiscount) || 0;

    const warehouseSources =
      warehouseQty > 0
        ? warehouseSelection.map((sel) => ({
            warehouseItemId: sel.warehouseItemId,
            boxName: sel.boxName,
            quantity: sel.quantity,
          }))
        : undefined;

    // Create one order item per packaging variant
    // IMPORTANT: Each variant can have different price and VAT
    const newItems: OrderItem[] = [];

    // If fully from warehouse, create a single order item without variants
    if (isFullyFromWarehouse) {
      // Find the smallest variant to use for pricing
      // (since we're not ordering, we just need a valid variant for price/VAT)
      // Use product name (e.g. "9486.900.260") as productId to query variants
      const productName = selectedProduct.name || selectedProduct.article;
      const variants = await db.productVariants
        .where("productId")
        .equals(productName)
        .toArray();

      if (!variants || variants.length === 0) {
        toastService.error(
          `Nessuna variante disponibile per ${productName}`,
        );
        return;
      }

      // Use the smallest variant (lowest minQty)
      const smallestVariant = variants.reduce((min, curr) =>
        curr.minQty < min.minQty ? curr : min,
      );

      const variantCode = smallestVariant.variantId;
      const price = await priceService.getPriceByArticleId(variantCode);

      if (!price) {
        toastService.error(`Prezzo non disponibile per ${variantCode}`);
        return;
      }

      // Get VAT rate
      const variantProduct = await db.products.get(variantCode);
      const vatRate = normalizeVatRate(variantProduct?.vat);

      const lineSubtotal = price * requestedQty - disc;
      const lineVat = lineSubtotal * (vatRate / 100);
      const lineTotal = lineSubtotal + lineVat;

      newItems.push({
        id: crypto.randomUUID(),
        productId: variantCode,
        article: variantCode,
        productName: selectedProduct.name,
        description: selectedProduct.description || "",
        quantity: requestedQty,
        unitPrice: price,
        vatRate,
        discount: disc,
        subtotal: lineSubtotal,
        vat: lineVat,
        total: lineTotal,
        warehouseQuantity: warehouseQty,
        warehouseSources,
        productGroupKey: undefined,
      });
    } else {
      // Normal order with packaging breakdown
      const breakdown = packagingPreview!.breakdown!;
      const discountPerLine = disc / breakdown.length; // Split discount across lines

      // 🔧 FIX #3: Generate group key to track variants of same product
      // Used to preserve warehouse data when deleting rows
      const productGroupKey =
        breakdown.length > 1
          ? `${selectedProduct.name}-${Date.now()}`
          : undefined;

      for (let i = 0; i < breakdown.length; i++) {
        const pkg = breakdown[i];
        const variantArticleCode = pkg.variant.variantId;

        // DEBUG: Log variant details to understand the "0" issue
        console.log("[OrderForm] Adding variant:", {
          variantId: pkg.variant.variantId,
          productId: pkg.variant.productId,
          packageContent: pkg.variant.packageContent,
          fullVariant: pkg.variant,
        });

        // Get price and VAT for THIS SPECIFIC variant
        const price = await priceService.getPriceByArticleId(variantArticleCode);

        if (!price) {
          toastService.error(
            `Prezzo non disponibile per la variante ${variantArticleCode}`,
          );
          return;
        }

        // Get VAT rate for THIS SPECIFIC variant
        const variantProduct = await db.products.get(variantArticleCode);
        const vatRate = normalizeVatRate(variantProduct?.vat);

        const lineSubtotal = price * pkg.totalPieces - discountPerLine;
        const lineVat = lineSubtotal * (vatRate / 100);
        const lineTotal = lineSubtotal + lineVat;

        newItems.push({
          id: crypto.randomUUID(),
          productId: variantArticleCode, // Use variant ID as productId
          article: variantArticleCode,
          productName: selectedProduct.name,
          description: selectedProduct.description || "",
          quantity: pkg.totalPieces,
          unitPrice: price,
          vatRate,
          discount: discountPerLine,
          subtotal: lineSubtotal,
          vat: lineVat,
          total: lineTotal,
          // 🔧 FIX #3: Add warehouse data only to first line (warehouse items apply to total quantity, not per variant)
          warehouseQuantity: i === 0 ? warehouseQty : undefined,
          warehouseSources: i === 0 ? warehouseSources : undefined,
          // 🔧 FIX #3: Add group key to all variants of same product
          productGroupKey,
        });
      }
    }

    // Add all lines to items list
    setItems([...items, ...newItems]);

    // Reset form
    setSelectedProduct(null);
    setProductSearch("");
    setQuantity("");
    setItemDiscount("0");
    setPackagingPreview(null);
    setWarehouseSelection([]);
  };

  // === EDIT / DELETE ITEM ===
  const handleDeleteItem = (id: string) => {
    // 🔧 FIX #3: Preserve warehouse data when deleting a row
    const itemToDelete = items.find((item) => item.id === id);

    if (
      itemToDelete?.productGroupKey &&
      itemToDelete.warehouseSources &&
      itemToDelete.warehouseSources.length > 0
    ) {
      // This row has warehouse data and belongs to a group
      // Find other rows in the same group
      const groupSiblings = items.filter(
        (item) =>
          item.productGroupKey === itemToDelete.productGroupKey &&
          item.id !== id,
      );

      if (groupSiblings.length > 0) {
        // Transfer warehouse data to first remaining sibling
        const firstSibling = groupSiblings[0];
        const updatedItems = items
          .filter((item) => item.id !== id)
          .map((item) => {
            if (item.id === firstSibling.id) {
              return {
                ...item,
                warehouseQuantity: itemToDelete.warehouseQuantity,
                warehouseSources: itemToDelete.warehouseSources,
              };
            }
            return item;
          });

        setItems(updatedItems);
        console.log("[OrderForm] 🔧 Warehouse data preserved on sibling row", {
          deletedId: id,
          transferredTo: firstSibling.id,
          warehouseSources: itemToDelete.warehouseSources,
        });
        return;
      }
    }

    // No warehouse data or no siblings to transfer to - just delete
    setItems(items.filter((item) => item.id !== id));
  };

  const handleEditItem = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    setEditingItemId(id);
    setSelectedProduct({
      id: item.article,
      name: item.productName,
      description: item.description,
      article: item.article,
    } as Product);
    setProductSearch(item.productName);
    setQuantity(item.quantity.toString());
    setItemDiscount(item.discount.toString());

    // 🔧 FIX #3: Preserve warehouse data when editing a row (same logic as delete)
    if (
      item.productGroupKey &&
      item.warehouseSources &&
      item.warehouseSources.length > 0
    ) {
      const groupSiblings = items.filter(
        (i) => i.productGroupKey === item.productGroupKey && i.id !== id,
      );

      if (groupSiblings.length > 0) {
        const firstSibling = groupSiblings[0];
        const updatedItems = items
          .filter((i) => i.id !== id)
          .map((i) => {
            if (i.id === firstSibling.id) {
              return {
                ...i,
                warehouseQuantity: item.warehouseQuantity,
                warehouseSources: item.warehouseSources,
              };
            }
            return i;
          });

        setItems(updatedItems);
        console.log(
          "[OrderForm] 🔧 Warehouse data preserved on sibling (edit)",
          {
            editedId: id,
            transferredTo: firstSibling.id,
          },
        );
        return;
      }
    }

    // Remove from list (no warehouse data to preserve or no siblings)
    setItems(items.filter((i) => i.id !== id));
  };

  // === CALCULATIONS ===
  const calculateTotals = () => {
    const itemsSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const itemsVAT = items.reduce((sum, item) => sum + item.vat, 0);
    const itemsTotal = items.reduce((sum, item) => sum + item.total, 0);

    // Calculate discount as percentage of subtotal
    const discountPercent = parseFloat(globalDiscountPercent) || 0;
    const globalDiscAmount = (itemsSubtotal * discountPercent) / 100;
    const finalSubtotal = itemsSubtotal - globalDiscAmount;

    // Calculate VAT proportionally based on each item's VAT rate
    const finalVAT = items.reduce((sum, item) => {
      const itemSubtotalAfterDiscount =
        item.subtotal * (1 - discountPercent / 100);
      return sum + itemSubtotalAfterDiscount * (item.vatRate / 100);
    }, 0);

    const finalTotal = finalSubtotal + finalVAT;

    return {
      itemsSubtotal,
      itemsVAT,
      itemsTotal,
      globalDiscPercent: discountPercent,
      globalDiscAmount,
      finalSubtotal,
      finalVAT,
      finalTotal,
    };
  };

  const calculateGlobalDiscountForTarget = () => {
    if (!targetTotal) return;

    const target = parseFloat(targetTotal);
    if (isNaN(target) || target <= 0) return;

    const itemsSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

    // With mixed VAT rates, we need to solve iteratively
    // Target = FinalSubtotal + FinalVAT
    // FinalSubtotal = ItemsSubtotal * (1 - DiscountPercent / 100)
    // FinalVAT = sum of (ItemSubtotal * (1 - DiscountPercent / 100) * (ItemVatRate / 100))
    //
    // Use binary search to find the discount percentage
    let low = 0;
    let high = 100;
    let bestDiscount = 0;

    for (let iteration = 0; iteration < 100; iteration++) {
      const mid = (low + high) / 2;
      const testSubtotal = itemsSubtotal * (1 - mid / 100);
      const testVAT = items.reduce((sum, item) => {
        const itemSubtotalAfterDiscount = item.subtotal * (1 - mid / 100);
        return sum + itemSubtotalAfterDiscount * (item.vatRate / 100);
      }, 0);
      const testTotal = testSubtotal + testVAT;

      if (Math.abs(testTotal - target) < 0.001) {
        bestDiscount = mid;
        break;
      }

      if (testTotal > target) {
        low = mid; // Need more discount
      } else {
        high = mid; // Need less discount
      }

      bestDiscount = mid;
    }

    if (bestDiscount < 0 || bestDiscount > 100) {
      toastService.error(
        "Impossibile raggiungere il totale target con uno sconto valido",
      );
      return;
    }

    setGlobalDiscountPercent(bestDiscount.toFixed(4));
    setTargetTotal("");
  };

  // === SUBMIT ===
  const handleSubmit = async () => {
    if (!selectedCustomer) {
      toastService.warning("Seleziona un cliente");
      return;
    }

    if (items.length === 0) {
      toastService.warning("Aggiungi almeno un articolo");
      return;
    }

    setSubmitting(true);

    try {
      const totals = calculateTotals();

      // If editing, delete old order first
      if (editingOrderId) {
        await orderService.deletePendingOrder(editingOrderId);
      }

      // 🔧 FIX #5: Check if order is completely fulfilled from warehouse
      const orderItems = items.map((item) => ({
        articleCode: item.productName || item.article,
        articleId: item.productId,
        productName: item.productName,
        description: item.description,
        quantity: item.quantity,
        price: item.unitPrice,
        vat: item.vatRate,
        discount: item.discount,
        // Phase 4: Warehouse integration
        warehouseQuantity: item.warehouseQuantity,
        warehouseSources: item.warehouseSources,
      }));

      const isWarehouseOnly = orderItems.every((item) => {
        const totalQty = item.quantity;
        const warehouseQty = item.warehouseQuantity || 0;
        return warehouseQty > 0 && warehouseQty === totalQty;
      });

      // Save new/updated order (status will be determined by service)
      await orderService.savePendingOrder({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        items: orderItems,
        discountPercent: parseFloat(globalDiscountPercent) || undefined,
        targetTotalWithVAT: totals.finalTotal,
        createdAt: new Date().toISOString(),
        status: "pending" as const, // Will be overridden by service if warehouse-only
        retryCount: 0,
      });

      // Delete draft if it exists (order is now finalized)
      if (draftId) {
        await orderService.deleteDraftOrder(draftId);
        setDraftId(null);
      }

      // 🔧 FIX #5: Show specific message for warehouse-only orders
      if (isWarehouseOnly) {
        toastService.success(
          "🏪 Ordine completato dal magazzino! Nessun invio ad Archibald necessario.",
        );
      } else {
        toastService.success(
          editingOrderId ? "Ordine aggiornato!" : "Ordine salvato nella coda!",
        );
      }

      // Mark order as saved successfully (prevents warehouse restoration on cleanup)
      setOrderSavedSuccessfully(true);

      navigate("/pending-orders");
    } catch (error) {
      console.error("Failed to save order:", error);

      // 🔧 FIX #2: Show specific error message for warehouse conflicts
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";

      if (
        errorMessage.includes("riservato") ||
        errorMessage.includes("venduto") ||
        errorMessage.includes("insufficiente")
      ) {
        // Warehouse-specific error
        toastService.error(`Magazzino: ${errorMessage}`);
      } else {
        // Generic error
        toastService.error("Errore durante il salvataggio dell'ordine");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totals = calculateTotals();

  return (
    <div
      style={{
        maxWidth: isMobile ? "100%" : "1000px",
        margin: "0 auto",
        padding: isMobile ? "1rem" : "2rem",
        fontFamily: "system-ui",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", margin: 0 }}>
          {editingOrderId ? "Modifica Ordine" : "Nuovo Ordine"}
        </h1>
        {lastAutoSave && !editingOrderId && (
          <div
            style={{
              fontSize: "0.75rem",
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>💾</span>
            <span>
              Salvato automaticamente alle{" "}
              {lastAutoSave.toLocaleTimeString("it-IT")}
            </span>
          </div>
        )}
      </div>

      {/* LOADING ORDER BANNER */}
      {loadingOrder && (
        <div
          style={{
            padding: isMobile ? "0.75rem" : "1rem",
            background: "#dbeafe",
            borderRadius: isMobile ? "6px" : "4px",
            marginBottom: isMobile ? "0.75rem" : "1rem",
            border: "2px solid #3b82f6",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ fontSize: isMobile ? "1.25rem" : "1.5rem" }}>⏳</span>
          <div>
            <strong
              style={{
                color: "#1e40af",
                display: "block",
                fontSize: isMobile ? "0.875rem" : "1rem",
              }}
            >
              Caricamento ordine in corso...
            </strong>
          </div>
        </div>
      )}

      {/* AUTO-SYNC BANNER */}
      {cacheSyncing && (
        <div
          style={{
            padding: isMobile ? "0.75rem" : "1rem",
            background: "#fef3c7",
            borderRadius: isMobile ? "6px" : "4px",
            marginBottom: isMobile ? "0.75rem" : "1rem",
            border: "2px solid #f59e0b",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ fontSize: isMobile ? "1.25rem" : "1.5rem" }}>⏳</span>
          <div>
            <strong
              style={{
                color: "#92400e",
                display: "block",
                fontSize: isMobile ? "0.875rem" : "1rem",
              }}
            >
              Sincronizzazione cache in corso...
            </strong>
            <span
              style={{
                color: "#92400e",
                fontSize: isMobile ? "0.75rem" : "0.875rem",
              }}
            >
              Popolamento delle varianti di prodotto e dei prezzi dal server
            </span>
          </div>
        </div>
      )}

      {/* DRAFT RECOVERY BANNER */}
      {hasDraft && !loadingOrder && (
        <div
          style={{
            padding: isMobile ? "1rem" : "1.25rem",
            background: "#d1fae5",
            borderRadius: "8px",
            marginBottom: isMobile ? "0.75rem" : "1rem",
            border: "2px solid #10b981",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            gap: isMobile ? "1rem" : "0",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: isMobile ? "0.75rem" : "1rem",
            }}
          >
            <span style={{ fontSize: isMobile ? "1.5rem" : "2rem" }}>💾</span>
            <div>
              <strong
                style={{
                  color: "#065f46",
                  display: "block",
                  fontSize: isMobile ? "1rem" : "1.125rem",
                }}
              >
                Bozza ordine disponibile
              </strong>
              <span
                style={{
                  color: "#047857",
                  fontSize: isMobile ? "0.75rem" : "0.875rem",
                }}
              >
                È stata trovata una bozza salvata. Vuoi continuare da dove avevi
                interrotto?
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              flexDirection: isMobile ? "column" : "row",
            }}
          >
            <button
              onClick={handleRecoverDraft}
              style={{
                padding: isMobile ? "0.875rem 1.25rem" : "0.75rem 1.25rem",
                background: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: isMobile ? "1rem" : "0.875rem",
                minHeight: isMobile ? "48px" : "auto",
              }}
            >
              Continua
            </button>
            <button
              onClick={handleDiscardDraft}
              style={{
                padding: isMobile ? "0.875rem 1.25rem" : "0.75rem 1.25rem",
                background: "white",
                color: "#065f46",
                border: "2px solid #10b981",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: isMobile ? "1rem" : "0.875rem",
                minHeight: isMobile ? "48px" : "auto",
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: SELECT CUSTOMER */}
      <div
        style={{
          marginBottom: isMobile ? "1rem" : "2rem",
          padding: isMobile ? "1rem" : "1.5rem",
          background: "#f9fafb",
          borderRadius: "8px",
        }}
      >
        <h2
          style={{
            fontSize: isMobile ? "1.125rem" : "1.25rem",
            marginBottom: "1rem",
          }}
        >
          1. Seleziona Cliente
        </h2>

        {!selectedCustomer ? (
          <>
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => handleCustomerSearch(e.target.value)}
              placeholder="Cerca cliente per nome..."
              style={{
                width: "100%",
                padding: isMobile ? "0.875rem" : "0.75rem",
                fontSize: isMobile ? "16px" : "1rem",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                marginBottom: "0.5rem",
              }}
            />

            {searchingCustomer && (
              <p style={{ color: "#6b7280" }}>Ricerca...</p>
            )}

            {customerResults.length > 0 && (
              <div
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  maxHeight: isMobile ? "300px" : "200px",
                  overflowY: "auto",
                  background: "white",
                }}
              >
                {customerResults.map((customer) => (
                  <div
                    key={customer.id}
                    onClick={() => handleSelectCustomer(customer)}
                    style={{
                      padding: isMobile ? "1rem" : "0.75rem",
                      cursor: "pointer",
                      borderBottom: "1px solid #f3f4f6",
                      minHeight: isMobile ? "48px" : "auto",
                      display: "flex",
                      alignItems: "center",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f9fafb")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "white")
                    }
                  >
                    <div>
                      <strong
                        style={{ fontSize: isMobile ? "1rem" : "0.875rem" }}
                      >
                        {customer.name}
                      </strong>
                      {customer.code && (
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            color: "#6b7280",
                            fontSize: isMobile ? "0.875rem" : "0.75rem",
                          }}
                        >
                          ({customer.code})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              background: "#d1fae5",
              padding: "1rem",
              borderRadius: "4px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong style={{ color: "#065f46" }}>
                ✓ Cliente selezionato:
              </strong>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "1.125rem" }}>
                {selectedCustomer.name}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedCustomer(null);
                setCustomerSearch("");
              }}
              style={{
                padding: isMobile ? "0.75rem 1rem" : "0.5rem 1rem",
                background: "white",
                border: "1px solid #065f46",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#065f46",
                fontWeight: "500",
                minHeight: isMobile ? "44px" : "auto",
              }}
            >
              Cambia
            </button>
          </div>
        )}
      </div>

      {/* STEP 2: ADD PRODUCTS WITH INTELLIGENT VARIANT SELECTION */}
      {selectedCustomer && (
        <div
          style={{
            marginBottom: isMobile ? "1rem" : "2rem",
            padding: isMobile ? "1rem" : "1.5rem",
            background: "#f9fafb",
            borderRadius: "8px",
          }}
        >
          <h2
            style={{
              fontSize: isMobile ? "1.125rem" : "1.25rem",
              marginBottom: "1rem",
            }}
          >
            2. Aggiungi Articoli
          </h2>

          {/* Product search */}
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
                fontSize: isMobile ? "0.875rem" : "1rem",
              }}
            >
              Nome Articolo
            </label>
            <input
              type="text"
              value={productSearch}
              onChange={(e) => handleProductSearch(e.target.value)}
              placeholder="Cerca articolo..."
              style={{
                width: "100%",
                padding: isMobile ? "0.875rem" : "0.75rem",
                fontSize: isMobile ? "16px" : "1rem",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
              }}
            />

            {searchingProduct && (
              <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>
                Ricerca...
              </p>
            )}

            {productResults.length > 0 && (
              <div
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  maxHeight: isMobile ? "300px" : "200px",
                  overflowY: "auto",
                  background: "white",
                  marginTop: "0.5rem",
                }}
              >
                {productResults.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => handleSelectProduct(product)}
                    style={{
                      padding: isMobile ? "1rem" : "0.75rem",
                      cursor: "pointer",
                      borderBottom: "1px solid #f3f4f6",
                      minHeight: isMobile ? "48px" : "auto",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f9fafb")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "white")
                    }
                  >
                    <strong
                      style={{ fontSize: isMobile ? "1rem" : "0.875rem" }}
                    >
                      {product.name}
                    </strong>
                    {product.description && (
                      <p
                        style={{
                          margin: "0.25rem 0 0 0",
                          fontSize: isMobile ? "0.875rem" : "0.75rem",
                          color: "#6b7280",
                        }}
                      >
                        {product.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedProduct && (
            <>
              <div
                style={{
                  padding: "1.25rem",
                  background: "#dbeafe",
                  border: "2px solid #3b82f6",
                  borderRadius: "8px",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "1rem",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "1.125rem", color: "#1e40af" }}>
                      Prodotto selezionato:
                    </strong>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "1rem" }}>
                      {selectedProduct.name}
                    </p>
                  </div>
                </div>

                {/* Variants Information Table */}
                {productVariants.length > 0 ? (
                  <div
                    style={{
                      padding: isMobile ? "0.75rem" : "1rem",
                      background: "#eff6ff",
                      borderRadius: "6px",
                      overflowX: "auto",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        fontSize: isMobile ? "0.75rem" : "0.875rem",
                        fontWeight: "600",
                        color: "#1e40af",
                        marginBottom: "0.75rem",
                      }}
                    >
                      Varianti disponibili:{" "}
                      {isMobile && (
                        <span
                          style={{ fontWeight: "normal", fontSize: "0.7rem" }}
                        >
                          (scorri →)
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        overflowX: "auto",
                        WebkitOverflowScrolling: "touch",
                      }}
                    >
                      <table
                        style={{
                          width: "100%",
                          minWidth: isMobile ? "500px" : "auto",
                          borderCollapse: "collapse",
                          fontSize: isMobile ? "0.75rem" : "0.875rem",
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              borderBottom: "2px solid #3b82f6",
                            }}
                          >
                            <th
                              style={{
                                textAlign: "left",
                                padding: isMobile ? "0.375rem" : "0.5rem",
                                color: "#1e40af",
                                fontWeight: "600",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Codice Variante
                            </th>
                            <th
                              style={{
                                textAlign: "center",
                                padding: isMobile ? "0.375rem" : "0.5rem",
                                color: "#1e40af",
                                fontWeight: "600",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Confezionamento
                            </th>
                            <th
                              style={{
                                textAlign: "right",
                                padding: isMobile ? "0.375rem" : "0.5rem",
                                color: "#1e40af",
                                fontWeight: "600",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Prezzo
                            </th>
                            <th
                              style={{
                                textAlign: "right",
                                padding: isMobile ? "0.375rem" : "0.5rem",
                                color: "#1e40af",
                                fontWeight: "600",
                                whiteSpace: "nowrap",
                              }}
                            >
                              IVA
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {productVariants.map((variant, index) => (
                            <tr
                              key={variant.variantId}
                              style={{
                                borderBottom:
                                  index < productVariants.length - 1
                                    ? "1px solid #bfdbfe"
                                    : "none",
                              }}
                            >
                              <td
                                style={{
                                  padding: isMobile ? "0.375rem" : "0.5rem",
                                  fontFamily: "monospace",
                                  fontSize: isMobile ? "0.7rem" : "0.875rem",
                                }}
                              >
                                {variant.variantId}
                              </td>
                              <td
                                style={{
                                  padding: isMobile ? "0.375rem" : "0.5rem",
                                  textAlign: "center",
                                }}
                              >
                                {variant.packageContent}
                              </td>
                              <td
                                style={{
                                  padding: isMobile ? "0.375rem" : "0.5rem",
                                  textAlign: "right",
                                  fontWeight: "600",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {variant.price !== null
                                  ? `€${variant.price.toFixed(2)}`
                                  : "N/D"}
                              </td>
                              <td
                                style={{
                                  padding: isMobile ? "0.375rem" : "0.5rem",
                                  textAlign: "right",
                                  color: "#059669",
                                  fontWeight: "600",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {variant.vat}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: isMobile ? "0.75rem" : "1rem",
                      background: "#eff6ff",
                      borderRadius: "6px",
                      textAlign: "center",
                      color: "#6b7280",
                      fontSize: isMobile ? "0.875rem" : "1rem",
                    }}
                  >
                    Caricamento varianti...
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "0.5rem",
                      fontWeight: "500",
                      fontSize: isMobile ? "0.875rem" : "1rem",
                    }}
                  >
                    Quantità (pezzi)
                  </label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Es: 7"
                    min="1"
                    style={{
                      width: "100%",
                      padding: isMobile ? "0.875rem" : "0.75rem",
                      fontSize: isMobile ? "16px" : "1rem",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "0.5rem",
                      fontWeight: "500",
                      fontSize: isMobile ? "0.875rem" : "1rem",
                    }}
                  >
                    Sconto su Riga (€)
                  </label>
                  <input
                    type="number"
                    value={itemDiscount}
                    onChange={(e) => setItemDiscount(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    style={{
                      width: "100%",
                      padding: isMobile ? "0.875rem" : "0.75rem",
                      fontSize: isMobile ? "16px" : "1rem",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                    }}
                  />
                </div>
              </div>

              {/* INTELLIGENT PACKAGING PREVIEW */}
              {calculatingPackaging && (
                <div
                  style={{
                    padding: "1rem",
                    background: "#fef3c7",
                    borderRadius: "4px",
                    marginBottom: "1rem",
                  }}
                >
                  <p style={{ margin: 0, color: "#92400e" }}>
                    ⏳ Calcolo confezionamento ottimale...
                  </p>
                </div>
              )}

              {packagingPreview && !calculatingPackaging && (
                <div
                  style={{
                    padding: isMobile ? "0.75rem" : "1rem",
                    background: packagingPreview.success
                      ? "#d1fae5"
                      : "#fee2e2",
                    borderRadius: isMobile ? "6px" : "4px",
                    marginBottom: isMobile ? "0.75rem" : "1rem",
                    border: `2px solid ${packagingPreview.success ? "#065f46" : "#dc2626"}`,
                  }}
                >
                  {packagingPreview.success ? (
                    <>
                      <strong
                        style={{
                          color: "#065f46",
                          display: "block",
                          marginBottom: "0.5rem",
                        }}
                      >
                        ✓ Confezionamento calcolato per{" "}
                        {packagingPreview.quantity} pezzi:
                      </strong>
                      <ul
                        style={{
                          margin: "0.5rem 0",
                          paddingLeft: "1.5rem",
                          color: "#065f46",
                        }}
                      >
                        {packagingPreview.breakdown?.map((item, idx) => (
                          <li key={idx}>
                            <strong>{item.packageCount}</strong> conf. da{" "}
                            <strong>{item.packageSize}</strong>{" "}
                            {item.packageSize === 1 ? "pezzo" : "pezzi"} ={" "}
                            {item.totalPieces} pz
                          </li>
                        ))}
                      </ul>
                      <p
                        style={{
                          margin: "0.5rem 0 0 0",
                          fontSize: "0.875rem",
                          color: "#047857",
                        }}
                      >
                        Totale: {packagingPreview.totalPackages} confezioni ={" "}
                        {packagingPreview.quantity} pezzi
                      </p>
                    </>
                  ) : warehouseSelectedQty >= parseInt(quantity, 10) ? (
                    // Quantity fully covered by warehouse - no order needed
                    <div
                      style={{
                        color: "#047857",
                        fontSize: "0.875rem",
                      }}
                    >
                      ✓ Quantità completamente coperta dal magazzino. Non è
                      necessario ordinare.
                    </div>
                  ) : (
                    <>
                      <strong
                        style={{
                          color: "#dc2626",
                          display: "block",
                          marginBottom: "0.5rem",
                        }}
                      >
                        ⚠ {packagingPreview.error}
                      </strong>
                      {packagingPreview.suggestedQuantity && (
                        <button
                          onClick={() =>
                            setQuantity(
                              packagingPreview.suggestedQuantity!.toString(),
                            )
                          }
                          style={{
                            padding: isMobile ? "0.75rem 1rem" : "0.5rem 1rem",
                            background: "#dc2626",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: isMobile ? "0.875rem" : "0.875rem",
                            marginTop: "0.5rem",
                            minHeight: isMobile ? "44px" : "auto",
                          }}
                        >
                          Usa quantità suggerita (
                          {packagingPreview.suggestedQuantity} pz)
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* WAREHOUSE MATCHING (PHASE 4) */}
              {selectedProduct && quantity && parseInt(quantity, 10) > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <WarehouseMatchAccordion
                    articleCode={selectedProduct.article}
                    description={selectedProduct.description}
                    requestedQuantity={parseInt(quantity, 10)}
                    onSelect={setWarehouseSelection}
                    excludeWarehouseItemIds={excludedWarehouseItemIds}
                    onTotalQuantityChange={(totalQty) => {
                      // 🔧 FIX #1: Auto-update quantity when warehouse has less than requested
                      const requestedQty = parseInt(quantity, 10);
                      if (
                        totalQty > 0 &&
                        totalQty < requestedQty &&
                        !isWarehouseUpdateRef.current
                      ) {
                        // Set flag to prevent loop
                        isWarehouseUpdateRef.current = true;
                        setQuantity(totalQty.toString());
                        // Reset flag after update
                        setTimeout(() => {
                          isWarehouseUpdateRef.current = false;
                        }, 100);
                      }
                    }}
                  />
                </div>
              )}

              <button
                onClick={handleAddItem}
                disabled={
                  !packagingPreview?.success &&
                  warehouseSelectedQty < parseInt(quantity, 10)
                }
                style={{
                  padding: isMobile ? "1rem 1.5rem" : "0.75rem 1.5rem",
                  background:
                    packagingPreview?.success ||
                    warehouseSelectedQty >= parseInt(quantity, 10)
                      ? "#22c55e"
                      : "#d1d5db",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: isMobile ? "1rem" : "1rem",
                  fontWeight: "600",
                  cursor:
                    packagingPreview?.success ||
                    warehouseSelectedQty >= parseInt(quantity, 10)
                      ? "pointer"
                      : "not-allowed",
                  width: "100%",
                  minHeight: isMobile ? "48px" : "auto",
                }}
              >
                {editingItemId ? "Aggiorna Articolo" : "Aggiungi all'Ordine"}
              </button>
            </>
          )}
        </div>
      )}

      {/* STEP 3: ORDER ITEMS LIST */}
      {items.length > 0 && (
        <div
          style={{
            marginBottom: isMobile ? "1rem" : "2rem",
            padding: isMobile ? "1rem" : "1.5rem",
            background: "#f9fafb",
            borderRadius: "8px",
          }}
        >
          <h2
            style={{
              fontSize: isMobile ? "1.125rem" : "1.25rem",
              marginBottom: "1rem",
            }}
          >
            3. Riepilogo Articoli ({items.length})
          </h2>

          {/* Desktop: Table view */}
          {!isMobile && (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                background: "white",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f3f4f6",
                    borderBottom: "2px solid #e5e7eb",
                  }}
                >
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "left",
                      fontWeight: "600",
                    }}
                  >
                    Articolo
                  </th>
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "center",
                      fontWeight: "600",
                    }}
                  >
                    Qtà
                  </th>
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "right",
                      fontWeight: "600",
                    }}
                  >
                    Prezzo
                  </th>
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "right",
                      fontWeight: "600",
                    }}
                  >
                    Sconto
                  </th>
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "right",
                      fontWeight: "600",
                    }}
                  >
                    Subtotale
                  </th>
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "right",
                      fontWeight: "600",
                    }}
                  >
                    IVA
                  </th>
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "right",
                      fontWeight: "600",
                    }}
                  >
                    Totale
                  </th>
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "center",
                      fontWeight: "600",
                    }}
                  >
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: "1px solid #f3f4f6" }}
                  >
                    <td style={{ padding: "0.75rem" }}>
                      <strong>{item.productName}</strong>
                      {item.description && (
                        <p
                          style={{
                            margin: "0.25rem 0 0 0",
                            fontSize: "0.875rem",
                            color: "#6b7280",
                          }}
                        >
                          {item.description}
                        </p>
                      )}
                      <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                        {item.article}
                      </span>
                      {item.warehouseQuantity && item.warehouseQuantity > 0 && (
                        <div
                          style={{
                            marginTop: "0.5rem",
                            display: "inline-block",
                            padding: "0.25rem 0.5rem",
                            background: "#d1fae5",
                            border: "1px solid #10b981",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            color: "#065f46",
                          }}
                        >
                          🏪 {item.warehouseQuantity} pz da magazzino
                          {item.warehouseSources &&
                            ` (${item.warehouseSources.map((s) => s.boxName).join(", ")})`}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "center" }}>
                      {item.quantity}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right" }}>
                      €{item.unitPrice.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem",
                        textAlign: "right",
                        color: item.discount > 0 ? "#dc2626" : "#9ca3af",
                      }}
                    >
                      {item.discount > 0
                        ? `-€${item.discount.toFixed(2)}`
                        : "—"}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right" }}>
                      €{item.subtotal.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem",
                        textAlign: "right",
                        color: "#6b7280",
                      }}
                    >
                      <div>
                        <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                          ({item.vatRate}%)
                        </span>
                        <br />€{item.vat.toFixed(2)}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "0.75rem",
                        textAlign: "right",
                        fontWeight: "600",
                      }}
                    >
                      €{item.total.toFixed(2)}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "center" }}>
                      <button
                        onClick={() => handleEditItem(item.id)}
                        style={{
                          padding: "0.25rem 0.5rem",
                          background: "#3b82f6",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          marginRight: "0.25rem",
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        style={{
                          padding: "0.25rem 0.5rem",
                          background: "#dc2626",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Mobile: Card view */}
          {isMobile && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: "white",
                    borderRadius: "8px",
                    padding: "1rem",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                  }}
                >
                  {/* Product Name */}
                  <div style={{ marginBottom: "0.75rem" }}>
                    <strong style={{ fontSize: "1.125rem", display: "block" }}>
                      {item.productName}
                    </strong>
                    {item.description && (
                      <p
                        style={{
                          margin: "0.25rem 0",
                          fontSize: "0.875rem",
                          color: "#6b7280",
                        }}
                      >
                        {item.description}
                      </p>
                    )}
                    <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                      {item.article}
                    </span>
                  </div>

                  {/* Warehouse badge */}
                  {item.warehouseQuantity && item.warehouseQuantity > 0 && (
                    <div
                      style={{
                        marginBottom: "0.75rem",
                        display: "inline-block",
                        padding: "0.5rem",
                        background: "#d1fae5",
                        border: "1px solid #10b981",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        color: "#065f46",
                      }}
                    >
                      🏪 {item.warehouseQuantity} pz da magazzino
                      {item.warehouseSources &&
                        ` (${item.warehouseSources.map((s) => s.boxName).join(", ")})`}
                    </div>
                  )}

                  {/* Details grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.5rem",
                      marginBottom: "0.75rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    <div>
                      <span style={{ color: "#6b7280" }}>Quantità:</span>
                      <strong style={{ marginLeft: "0.25rem" }}>
                        {item.quantity}
                      </strong>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ color: "#6b7280" }}>Prezzo:</span>
                      <strong style={{ marginLeft: "0.25rem" }}>
                        €{item.unitPrice.toFixed(2)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: "#6b7280" }}>Sconto:</span>
                      <strong
                        style={{
                          marginLeft: "0.25rem",
                          color: item.discount > 0 ? "#dc2626" : "#9ca3af",
                        }}
                      >
                        {item.discount > 0
                          ? `-€${item.discount.toFixed(2)}`
                          : "—"}
                      </strong>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ color: "#6b7280" }}>Subtotale:</span>
                      <strong style={{ marginLeft: "0.25rem" }}>
                        €{item.subtotal.toFixed(2)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: "#6b7280" }}>
                        IVA ({item.vatRate}%):
                      </span>
                      <strong style={{ marginLeft: "0.25rem" }}>
                        €{item.vat.toFixed(2)}
                      </strong>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ color: "#6b7280", fontWeight: "600" }}>
                        Totale:
                      </span>
                      <strong
                        style={{
                          marginLeft: "0.25rem",
                          fontSize: "1.125rem",
                          color: "#3b82f6",
                        }}
                      >
                        €{item.total.toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      onClick={() => handleEditItem(item.id)}
                      style={{
                        flex: 1,
                        padding: "0.75rem",
                        background: "#3b82f6",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: "600",
                        fontSize: "0.875rem",
                        minHeight: "44px",
                      }}
                    >
                      ✏️ Modifica
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      style={{
                        flex: 1,
                        padding: "0.75rem",
                        background: "#dc2626",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: "600",
                        fontSize: "0.875rem",
                        minHeight: "44px",
                      }}
                    >
                      🗑️ Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Global Discount & Target Total */}
          <div
            style={{
              marginTop: "1.5rem",
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: "1rem",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: "500",
                  fontSize: isMobile ? "0.875rem" : "1rem",
                }}
              >
                Sconto Globale (%)
              </label>
              <input
                type="number"
                value={globalDiscountPercent}
                onChange={(e) => setGlobalDiscountPercent(e.target.value)}
                placeholder="0.00"
                min="0"
                max="100"
                step="0.01"
                style={{
                  width: "100%",
                  padding: isMobile ? "0.875rem" : "0.75rem",
                  fontSize: isMobile ? "16px" : "1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: "500",
                  fontSize: isMobile ? "0.875rem" : "1rem",
                }}
              >
                O inserisci totale desiderato (con IVA)
              </label>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexDirection: isMobile ? "column" : "row",
                }}
              >
                <input
                  type="number"
                  value={targetTotal}
                  onChange={(e) => setTargetTotal(e.target.value)}
                  placeholder="Es: 1000.00"
                  min="0"
                  step="0.01"
                  style={{
                    flex: 1,
                    padding: isMobile ? "0.875rem" : "0.75rem",
                    fontSize: isMobile ? "16px" : "1rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                  }}
                />
                <button
                  onClick={calculateGlobalDiscountForTarget}
                  disabled={!targetTotal}
                  style={{
                    padding: isMobile ? "0.875rem 1rem" : "0.75rem 1rem",
                    background: targetTotal ? "#8b5cf6" : "#d1d5db",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: targetTotal ? "pointer" : "not-allowed",
                    fontWeight: "600",
                    fontSize: isMobile ? "16px" : "1rem",
                    minHeight: isMobile ? "48px" : "auto",
                  }}
                >
                  Calcola
                </button>
              </div>
            </div>
          </div>

          {/* Totals Summary */}
          <div
            style={{
              marginTop: "1.5rem",
              padding: isMobile ? "1rem" : "1.5rem",
              background: "white",
              borderRadius: "8px",
              border: "2px solid #3b82f6",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5rem",
                fontSize: isMobile ? "0.875rem" : "1rem",
              }}
            >
              <span>Subtotale articoli:</span>
              <strong>€{totals.itemsSubtotal.toFixed(2)}</strong>
            </div>
            {totals.globalDiscAmount > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                  color: "#dc2626",
                  fontSize: isMobile ? "0.875rem" : "1rem",
                }}
              >
                <span>Sconto globale ({totals.globalDiscPercent}%):</span>
                <strong>-€{totals.globalDiscAmount.toFixed(2)}</strong>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5rem",
                paddingTop: "0.5rem",
                borderTop: "1px solid #e5e7eb",
                fontSize: isMobile ? "0.875rem" : "1rem",
              }}
            >
              <span>Subtotale (senza IVA):</span>
              <strong>€{totals.finalSubtotal.toFixed(2)}</strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5rem",
                color: "#6b7280",
                fontSize: isMobile ? "0.875rem" : "1rem",
              }}
            >
              <span>IVA:</span>
              <strong>€{totals.finalVAT.toFixed(2)}</strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingTop: "0.5rem",
                borderTop: "2px solid #3b82f6",
                fontSize: isMobile ? "1.125rem" : "1.25rem",
              }}
            >
              <span style={{ fontWeight: "600" }}>TOTALE (con IVA):</span>
              <strong style={{ color: "#3b82f6" }}>
                €{totals.finalTotal.toFixed(2)}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* SUBMIT BUTTON */}
      {items.length > 0 && (
        <div style={{ textAlign: isMobile ? "center" : "right" }}>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: isMobile ? "1rem 2rem" : "1rem 2rem",
              background: submitting ? "#d1d5db" : "#22c55e",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: isMobile ? "1.125rem" : "1.125rem",
              fontWeight: "600",
              cursor: submitting ? "not-allowed" : "pointer",
              width: isMobile ? "100%" : "auto",
              minHeight: isMobile ? "52px" : "auto",
            }}
          >
            {submitting ? "Salvataggio..." : "Salva in Coda Ordini"}
          </button>
        </div>
      )}
    </div>
  );
}

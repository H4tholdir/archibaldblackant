import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import { getDeviceId } from "../utils/device-id";
import { unifiedSyncService } from "../services/unified-sync-service";
import { useDraftSync } from "../hooks/useDraftSync";
import { calculateShippingCosts } from "../utils/order-calculations";
import type { SubClient } from "../db/schema";
import { SubClientSelector } from "./new-order-form/SubClientSelector";
import { isFresis } from "../utils/fresis-constants";

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

  // 🔧 FIX: Use useDraftSync hook to get real-time draft updates via WebSocket
  const { drafts: draftOrders, refetch: refetchDrafts } = useDraftSync();

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

  // Step 1b: Sub-client selection (Fresis only)
  const [selectedSubClient, setSelectedSubClient] =
    useState<SubClient | null>(null);

  // Step 2: Product entry with intelligent variant selection
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchingProduct, setSearchingProduct] = useState(false);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(-1);
  const [quantity, setQuantity] = useState("");
  const [itemDiscount, setItemDiscount] = useState("");

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
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState("");
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

  // 🔧 FIX #1: Memoize callback to prevent re-render loops in WarehouseMatchAccordion
  const handleTotalQuantityChange = useCallback(
    (totalQty: number) => {
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
    },
    [quantity],
  );

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [cacheSyncing, setCacheSyncing] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOriginDraftId, setEditingOriginDraftId] = useState<
    string | null
  >(null);
  const [loadingOrder, setLoadingOrder] = useState(false);

  // Auto-save draft state
  const [hasDraft, setHasDraft] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);

  // Track original order items for warehouse restoration if user exits without saving
  const [originalOrderItems, setOriginalOrderItems] = useState<
    PendingOrderItem[]
  >([]);

  // 🔧 CRITICAL FIX: Use ref instead of state to avoid race condition with navigate()
  // setState is async, so navigate() could unmount component before flag is set,
  // causing unmount handler to call saveDraft() and recreate the just-deleted draft
  const orderSavedSuccessfullyRef = useRef(false);

  // 🔧 FIX: Prevent concurrent draft saves that create duplicates
  const savingDraftRef = useRef(false);

  // 🔧 FIX: Prevent draft recreation after user explicitly deletes it
  const draftDeletedRef = useRef(false);

  // Refs for focus management
  const productSearchInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const productDropdownItemsRef = useRef<(HTMLDivElement | null)[]>([]);

  // === LOAD ORDER FOR EDITING ===
  // Check if we're editing an existing order
  useEffect(() => {
    const loadOrderForEditing = async () => {
      const orderIdParam = searchParams.get("editOrderId");
      if (!orderIdParam) return;

      const orderId = orderIdParam;

      setLoadingOrder(true);
      setEditingOrderId(orderId);

      try {
        const order = await orderService.getPendingOrderById(orderId);
        if (!order) {
          toastService.error("Ordine non trovato");
          navigate("/pending-orders");
          return;
        }

        // 🔧 FIX: Preserve originDraftId when editing to maintain draft→pending link
        // This ensures cascade deletion still works if order is re-saved
        if (order.originDraftId) {
          setEditingOriginDraftId(order.originDraftId);
          console.log("[OrderForm] Preserved originDraftId for editing:", {
            orderId,
            originDraftId: order.originDraftId,
          });
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

        // Restore sub-client from order
        if (order.subClientData) {
          setSelectedSubClient(order.subClientData);
        } else {
          setSelectedSubClient(null);
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
        !orderSavedSuccessfullyRef.current &&
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
  }, [editingOrderId, originalOrderItems]);

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
      setHighlightedProductIndex(-1);
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
      setHighlightedProductIndex(-1);
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
    setHighlightedProductIndex(-1);
    // Reset quantity and preview when product changes
    setQuantity("");
    setPackagingPreview(null);
    // Reset product variants
    setProductVariants([]);
    // Reset warehouse selection
    setWarehouseSelection([]);

    // Focus on quantity field after product selection
    setTimeout(() => {
      quantityInputRef.current?.focus();
    }, 0);
  };

  // Handle keyboard navigation in product dropdown
  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (productResults.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedProductIndex((prev) =>
          prev < productResults.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedProductIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (
          highlightedProductIndex >= 0 &&
          highlightedProductIndex < productResults.length
        ) {
          handleSelectProduct(productResults[highlightedProductIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setProductResults([]);
        setHighlightedProductIndex(-1);
        break;
    }
  };

  // Scroll highlighted item into view in product dropdown
  useEffect(() => {
    if (
      highlightedProductIndex >= 0 &&
      productDropdownItemsRef.current[highlightedProductIndex]
    ) {
      productDropdownItemsRef.current[highlightedProductIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [highlightedProductIndex]);

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

  // === SAVE DRAFT FUNCTION (SHARED) ===
  const saveDraft = useCallback(async () => {
    console.log("[OrderForm] saveDraft called", {
      editingOrderId,
      hasCustomer: !!selectedCustomer,
      itemsCount: items.length,
      draftId,
      orderSavedSuccessfully: orderSavedSuccessfullyRef.current,
      alreadySaving: savingDraftRef.current,
    });

    // 🔧 FIX: Prevent concurrent draft saves (causes duplicates)
    if (savingDraftRef.current) {
      console.log("[OrderForm] Draft save already in progress, skipping");
      return;
    }

    // Don't save if editing existing order, no customer selected, no items, order was just finalized, or draft was explicitly deleted
    if (
      editingOrderId ||
      !selectedCustomer ||
      items.length === 0 ||
      orderSavedSuccessfullyRef.current ||
      draftDeletedRef.current
    ) {
      console.log("[OrderForm] Draft save skipped", {
        reason: editingOrderId
          ? "editing order"
          : !selectedCustomer
            ? "no customer"
            : items.length === 0
              ? "no items"
              : orderSavedSuccessfullyRef.current
                ? "order finalized"
                : "draft deleted",
      });
      return;
    }

    // Set lock
    savingDraftRef.current = true;

    try {
      const now = new Date().toISOString();

      // Convert OrderItems to DraftOrderItems
      const draftItems = items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        article: item.article,
        variantId: item.article,
        quantity: item.quantity,
        packageContent: item.description || "",
      }));

      if (draftId) {
        // Update existing draft
        console.log("[OrderForm] Updating existing draft:", draftId);
        await db.draftOrders.update(draftId, {
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          items: draftItems,
          updatedAt: now,
          needsSync: true,
          subClientCodice: selectedSubClient?.codice,
          subClientName: selectedSubClient?.ragioneSociale,
          subClientData: selectedSubClient ?? undefined,
        });
        console.log("[OrderForm] ✅ Draft updated");
      } else {
        // 🔧 CRITICAL FIX: Check if draft already exists for this customer before creating a new one
        // This prevents duplicate draft creation on remounts
        const existingDrafts = await db.draftOrders
          .where("customerId")
          .equals(selectedCustomer.id)
          .toArray();

        if (existingDrafts.length > 0) {
          // Use existing draft instead of creating a new one
          const existingDraft = existingDrafts[0];
          console.log(
            "[OrderForm] Found existing draft for customer, reusing it:",
            existingDraft.id,
          );
          setDraftId(existingDraft.id!);

          // Update it with current data
          await db.draftOrders.update(existingDraft.id!, {
            items: draftItems,
            updatedAt: now,
            needsSync: true,
            subClientCodice: selectedSubClient?.codice,
            subClientName: selectedSubClient?.ragioneSociale,
            subClientData: selectedSubClient ?? undefined,
          });
          console.log("[OrderForm] ✅ Existing draft updated");
        } else {
          // Create new draft
          console.log("[OrderForm] Creating new draft");
          const draft: Omit<DraftOrder, "id"> = {
            customerId: selectedCustomer.id,
            customerName: selectedCustomer.name,
            items: draftItems,
            createdAt: now,
            updatedAt: now,
            deviceId: getDeviceId(),
            needsSync: true,
            subClientCodice: selectedSubClient?.codice,
            subClientName: selectedSubClient?.ragioneSociale,
            subClientData: selectedSubClient ?? undefined,
          };
          const id = await orderService.saveDraftOrder(draft);
          setDraftId(id);
          console.log("[OrderForm] ✅ Draft created:", id);
        }
      }

      // Trigger sync
      if (navigator.onLine) {
        unifiedSyncService.syncAll().catch((error) => {
          console.error("[OrderForm] Draft sync failed:", error);
        });
      }

      setLastAutoSave(new Date());
      console.log(
        "[OrderForm] Draft saved at",
        new Date().toLocaleTimeString(),
      );
    } catch (error) {
      console.error("[OrderForm] ❌ Draft save failed:", error);
    } finally {
      // Release lock
      savingDraftRef.current = false;
    }
  }, [editingOrderId, selectedCustomer, items, draftId]);

  // === CHECK FOR EXISTING DRAFT - REAL-TIME UPDATES ===
  // React to draftOrders changes from useDraftSync hook (real-time WebSocket updates)
  useEffect(() => {
    // Don't check for draft if we're editing an existing order
    if (editingOrderId) {
      setHasDraft(false);
      setDraftId(null);
      return;
    }

    // 🔧 FIX: Use draftOrders from useDraftSync hook for real-time updates
    // This automatically updates when drafts are created/deleted on other devices
    console.log("[OrderForm] Checking drafts from real-time hook:", {
      draftCount: draftOrders.length,
      currentCustomerId: selectedCustomer?.id,
      currentDraftId: draftId,
    });

    if (draftOrders.length > 0) {
      // 🔧 CRITICAL FIX: Don't overwrite draftId if user is already working on an order
      // This prevents switching to a different draft when WebSocket receives updates
      if (selectedCustomer && draftId) {
        // User is actively working - verify current draft still exists
        const currentDraftExists = draftOrders.some(
          (d) => d.id === draftId && d.customerId === selectedCustomer.id,
        );

        if (currentDraftExists) {
          // Current draft is valid, keep it
          console.log("[OrderForm] ✅ Current draft still valid, keeping it:", {
            draftId,
            customerId: selectedCustomer.id,
          });
          setHasDraft(true);
          return;
        } else {
          // Current draft was deleted or is for different customer
          console.log(
            "[OrderForm] ⚠️ Current draft no longer valid, resetting:",
            { draftId },
          );
          setDraftId(null);
        }
      }

      // No customer selected or no current draft - show banner for latest draft
      const latestDraft = draftOrders[0]; // useDraftSync returns sorted by updatedAt DESC
      console.log("[OrderForm] ✅ Found latest draft:", {
        draftId: latestDraft.id,
        customerId: latestDraft.customerId,
      });
      setHasDraft(true);
      setDraftId(latestDraft.id!);
    } else {
      // 🔧 CRITICAL FIX: Don't reset draftId if user is actively working
      // This prevents race condition where draftOrders hasn't loaded yet but user already created draft
      if (selectedCustomer && draftId) {
        console.log(
          "[OrderForm] ⚠️ draftOrders empty but user is working, keeping current draftId:",
          { draftId, customerId: selectedCustomer.id },
        );
        // Keep current draftId - it was just created and might not be in draftOrders yet
        return;
      }

      console.log("[OrderForm] No drafts available and no active work");
      setHasDraft(false);
      setDraftId(null);
    }
  }, [editingOrderId, draftOrders, selectedCustomer, draftId]);

  // === RESET draftDeletedRef WHEN CUSTOMER CHANGES ===
  // Allow creating new drafts when user starts working on a different customer
  useEffect(() => {
    if (selectedCustomer && draftDeletedRef.current) {
      console.log(
        "[OrderForm] Customer changed, resetting draftDeletedRef to allow new drafts",
      );
      draftDeletedRef.current = false;
    }
  }, [selectedCustomer?.id]);

  // === AUTO-SAVE DRAFT ON EVERY OPERATION ===
  // Save immediately when customer or items change
  useEffect(() => {
    if (
      editingOrderId ||
      !selectedCustomer ||
      orderSavedSuccessfullyRef.current
    ) {
      return;
    }

    console.log("[OrderForm] Operation detected - auto-saving draft", {
      customer: selectedCustomer.name,
      itemsCount: items.length,
    });

    // 🔧 FIX: Debounce auto-save to reduce battery/performance impact on mobile
    const timeoutId = setTimeout(() => {
      saveDraft();
    }, 2000); // 2s debounce (increased from 500ms)

    return () => clearTimeout(timeoutId);
  }, [selectedCustomer, items, editingOrderId, saveDraft]);

  // === SAVE DRAFT ON TAB CLOSE / PAGE UNLOAD / COMPONENT UNMOUNT ===
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log("[OrderForm] beforeunload triggered");
      // 🔧 FIX: Don't save draft if order was just finalized
      if (
        selectedCustomer &&
        !editingOrderId &&
        !orderSavedSuccessfullyRef.current
      ) {
        saveDraft();
      }
    };

    const handleVisibilityChange = () => {
      console.log("[OrderForm] visibilitychange, hidden:", document.hidden);
      // 🔧 FIX: Don't save draft if order was just finalized
      if (
        document.hidden &&
        selectedCustomer &&
        !editingOrderId &&
        !orderSavedSuccessfullyRef.current
      ) {
        saveDraft();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Save draft on component unmount (when user navigates away)
    return () => {
      console.log("[OrderForm] Component unmounting");
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("visibilitychange", handleVisibilityChange);

      // 🔧 CRITICAL FIX: Don't save draft if order was just finalized or deleted
      // Using refs instead of state ensures synchronous check - no race condition with navigate()
      if (
        selectedCustomer &&
        !editingOrderId &&
        !orderSavedSuccessfullyRef.current &&
        !draftDeletedRef.current
      ) {
        saveDraft();
      }
    };
  }, [selectedCustomer, editingOrderId, saveDraft]);

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

      // Restore sub-client from draft
      if (draft.subClientData) {
        setSelectedSubClient(draft.subClientData);
      } else {
        setSelectedSubClient(null);
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
      setDraftId(null); // 🔧 Clear draftId before deleting drafts

      // 🔧 CRITICAL FIX: Delete ALL drafts for this customer (including current one)
      // This prevents banner from reappearing and auto-save from creating duplicates
      const customerDrafts = draftOrders.filter(
        (d) => d.customerId === draft.customerId,
      );

      if (customerDrafts.length > 0) {
        console.log(
          `[OrderForm] Deleting ${customerDrafts.length} drafts for customer ${draft.customerId}`,
        );
        await Promise.all(
          customerDrafts.map((d) => orderService.deleteDraftOrder(d.id!)),
        );

        // 🔧 CRITICAL: Set flag to prevent auto-save from recreating draft immediately
        draftDeletedRef.current = true;
        console.log(
          "[OrderForm] Set draftDeletedRef to prevent auto-save recreation",
        );

        // Force refetch to update draftOrders
        await refetchDrafts();
        console.log("[OrderForm] All customer drafts deleted and refetched");
      }

      toastService.success("Bozza recuperata con successo!");
    } catch (error) {
      console.error("[OrderForm] Failed to recover draft:", error);
      toastService.error("Errore durante il recupero della bozza");
    }
  };

  // === DISCARD DRAFT ===
  const handleDiscardDraft = async () => {
    try {
      // 🔧 FIX: Delete ALL drafts, not just the current one
      // This prevents having to click "Annulla" multiple times when there are duplicate drafts
      console.log("[OrderForm] Deleting all drafts", {
        draftCount: draftOrders.length,
      });

      // Delete all drafts in parallel
      await Promise.all(
        draftOrders.map((draft) => orderService.deleteDraftOrder(draft.id!)),
      );

      // 🔧 CRITICAL FIX: Force immediate refetch to update draftOrders
      // This prevents banner from reappearing due to stale draftOrders state
      console.log("[OrderForm] Forcing refetch after draft deletion");
      await refetchDrafts();
      console.log("[OrderForm] Refetch completed");

      setHasDraft(false);
      setDraftId(null);
      // 🔧 FIX: Prevent unmount handler from recreating draft after explicit delete
      draftDeletedRef.current = true;

      const count = draftOrders.length;
      toastService.success(
        count === 1 ? "Bozza eliminata" : `${count} bozze eliminate`,
      );
    } catch (error) {
      console.error("[OrderForm] Failed to discard drafts:", error);
      toastService.error("Errore durante l'eliminazione delle bozze");
    }
  };

  // === RESET FORM (RICOMINCIA DA CAPO) ===
  const handleResetForm = async () => {
    try {
      // 🔧 CRITICAL FIX: Delete ALL drafts from IndexedDB before resetting
      // This prevents drafts from reappearing on other devices
      if (selectedCustomer) {
        const customerDrafts = draftOrders.filter(
          (d) => d.customerId === selectedCustomer.id,
        );

        if (customerDrafts.length > 0) {
          console.log(
            `[OrderForm] Deleting ${customerDrafts.length} drafts during form reset`,
          );
          await Promise.all(
            customerDrafts.map((d) => orderService.deleteDraftOrder(d.id!)),
          );
          await refetchDrafts();
          console.log("[OrderForm] Drafts deleted and refetched");
        }
      }

      // Reset customer
      setCustomerSearch("");
      setCustomerResults([]);
      setSelectedCustomer(null);
      setSearchingCustomer(false);

      // Reset product
      setProductSearch("");
      setProductResults([]);
      setSelectedProduct(null);
      setSearchingProduct(false);
      setHighlightedProductIndex(-1);
      setQuantity("");
      setItemDiscount("");
      setPackagingPreview(null);
      setCalculatingPackaging(false);
      setWarehouseSelection([]);
      setProductVariants([]);

      // Reset items
      setItems([]);
      setGlobalDiscountPercent("");
      setTargetTotal("");

      // Reset draft state
      setHasDraft(false);
      setDraftId(null);
      setLastAutoSave(null);

      // 🔧 CRITICAL: Reset flag to allow creating new drafts
      draftDeletedRef.current = false;
      console.log(
        "[OrderForm] Reset draftDeletedRef to allow new draft creation",
      );

      toastService.success("Ordine resettato");
    } catch (error) {
      console.error("[OrderForm] Failed to reset form:", error);
      toastService.error("Errore durante il reset del form");
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
    const qtyToOrder = Math.max(0, requestedQty - warehouseQty);
    const isFullyFromWarehouse = qtyToOrder === 0;
    const isPartiallyFromWarehouse = warehouseQty > 0 && qtyToOrder > 0;

    // 🔧 FIX #3: If partially from warehouse, validate packaging for RESIDUAL quantity
    let residualPackaging: PackagingResult | null = null;
    if (isPartiallyFromWarehouse) {
      // Recalculate packaging for the quantity that needs to be ordered
      try {
        const productName = selectedProduct.name || selectedProduct.article;
        residualPackaging = await productService.calculateOptimalPackaging(
          productName,
          qtyToOrder,
        );

        if (!residualPackaging.success) {
          // Residual quantity doesn't meet packaging constraints
          toastService.warning(
            `⚠️ Quantità residua (${qtyToOrder}pz) non valida per l'ordine. ` +
              `${residualPackaging.error} ` +
              `Verranno inseriti solo i ${warehouseQty}pz dal magazzino. ` +
              `Mancano ${qtyToOrder}pz rispetto ai ${requestedQty}pz richiesti.`,
          );
          // Continue with warehouse-only items (no Archibald order)
          // Set qtyToOrder to 0 to skip Archibald ordering
        } else {
          // Residual quantity is valid
          toastService.info(
            `📦 Ordine diviso: ${warehouseQty}pz dal magazzino + ${qtyToOrder}pz ordinati`,
          );
        }
      } catch (error) {
        console.error("Failed to calculate residual packaging:", error);
        toastService.error("Errore nel calcolo del confezionamento residuo");
        return;
      }
    }

    // If not fully from warehouse and not partially, validate original packaging
    if (!isFullyFromWarehouse && !isPartiallyFromWarehouse) {
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

    // 🔧 FIX #3: Determine if we should create warehouse-only item (no Archibald order)
    const createWarehouseOnly =
      isFullyFromWarehouse ||
      (isPartiallyFromWarehouse && !residualPackaging?.success);

    // If fully from warehouse OR partially but residual is invalid, create warehouse-only item
    if (createWarehouseOnly) {
      // 🔧 FIX #2: If warehouse items have different article codes, use the warehouse code
      // Check if all warehouse selections have the same article code
      const warehouseArticleCodes = new Set(
        warehouseSelection.map((sel) => sel.articleCode),
      );
      const searchedArticleCode =
        selectedProduct.name || selectedProduct.article;

      // If warehouse has different article code(s), use the first warehouse code
      // (e.g., searched for 305.104.050 but warehouse has 305.204.050)
      const shouldUseWarehouseCode =
        warehouseArticleCodes.size > 0 &&
        !warehouseArticleCodes.has(searchedArticleCode);

      const finalArticleCode = shouldUseWarehouseCode
        ? warehouseSelection[0].articleCode
        : searchedArticleCode;

      // Find the smallest variant to use for pricing
      // (since we're not ordering, we just need a valid variant for price/VAT)
      const variants = await db.productVariants
        .where("productId")
        .equals(finalArticleCode)
        .toArray();

      if (!variants || variants.length === 0) {
        toastService.error(
          `Nessuna variante disponibile per ${finalArticleCode}`,
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

      // 🔧 FIX #4: Always use warehouseQty for warehouse-only items (not requestedQty)
      // The user may have selected more/less items from warehouse than initially requested
      const finalQty = warehouseQty;

      const lineSubtotal = price * finalQty - disc;
      const lineVat = lineSubtotal * (vatRate / 100);
      const lineTotal = lineSubtotal + lineVat;

      // 🔧 FIX #2: Use warehouse article code if substituting
      newItems.push({
        id: crypto.randomUUID(),
        productId: variantCode,
        article: variantCode,
        productName: finalArticleCode, // Use warehouse code if different
        description: shouldUseWarehouseCode
          ? `${selectedProduct.description || ""} (sostituito con ${finalArticleCode})`
          : selectedProduct.description || "",
        quantity: finalQty,
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
    } else if (isPartiallyFromWarehouse && residualPackaging?.success) {
      // 🔧 FIX #3: Partially from warehouse WITH valid residual packaging
      // Create order items for residual quantity + attach warehouse metadata
      const breakdown = residualPackaging.breakdown!;
      const discountPerLine = disc / breakdown.length; // Split discount across lines

      // 🔧 FIX #3: Generate group key to track variants of same product
      const productGroupKey =
        breakdown.length > 1
          ? `${selectedProduct.name}-${Date.now()}`
          : undefined;

      for (let i = 0; i < breakdown.length; i++) {
        const pkg = breakdown[i];
        const variantArticleCode = pkg.variant.variantId;

        const price =
          await priceService.getPriceByArticleId(variantArticleCode);
        if (!price) {
          toastService.error(
            `Prezzo non disponibile per ${variantArticleCode}`,
          );
          return;
        }

        // Get VAT rate
        const variantProduct = await db.products.get(variantArticleCode);
        const vatRate = normalizeVatRate(variantProduct?.vat);

        const lineSubtotal = price * pkg.totalPieces - discountPerLine;
        const lineVat = lineSubtotal * (vatRate / 100);
        const lineTotal = lineSubtotal + lineVat;

        newItems.push({
          id: crypto.randomUUID(),
          productId: variantArticleCode,
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
          // 🔧 FIX #3: Add warehouse data only to first line
          warehouseQuantity: i === 0 ? warehouseQty : undefined,
          warehouseSources: i === 0 ? warehouseSources : undefined,
          productGroupKey,
        });
      }
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
        const price =
          await priceService.getPriceByArticleId(variantArticleCode);

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
    setItemDiscount("");
    setPackagingPreview(null);
    setWarehouseSelection([]);

    // Focus back on product search field
    setTimeout(() => {
      productSearchInputRef.current?.focus();
    }, 0);
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

    // Calculate shipping costs based on imponibile AFTER discount
    const shippingCosts = calculateShippingCosts(finalSubtotal);
    const shippingCost = shippingCosts.cost;
    const shippingTax = shippingCosts.tax;

    // Calculate VAT proportionally based on each item's VAT rate + shipping tax
    const itemsVATAfterDiscount = items.reduce((sum, item) => {
      const itemSubtotalAfterDiscount =
        item.subtotal * (1 - discountPercent / 100);
      return sum + itemSubtotalAfterDiscount * (item.vatRate / 100);
    }, 0);
    const finalVAT = itemsVATAfterDiscount + shippingTax;

    // Total includes items + shipping cost + total VAT
    const finalTotal = finalSubtotal + shippingCost + finalVAT;

    return {
      itemsSubtotal,
      itemsVAT,
      itemsTotal,
      globalDiscPercent: discountPercent,
      globalDiscAmount,
      finalSubtotal,
      shippingCost,
      shippingTax,
      finalVAT,
      finalTotal,
    };
  };

  const calculateGlobalDiscountForTarget = () => {
    if (!targetTotal) return;

    const target = parseFloat(targetTotal);
    if (isNaN(target) || target <= 0) return;

    const itemsSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

    // With mixed VAT rates AND shipping costs, we need to solve iteratively
    // Target = FinalSubtotal + ShippingCost + FinalVAT (includes shipping tax)
    // FinalSubtotal = ItemsSubtotal * (1 - DiscountPercent / 100)
    // ShippingCost depends on FinalSubtotal (if < 200€)
    // FinalVAT = ItemsVAT + ShippingTax
    //
    // Use binary search to find the discount percentage
    let low = 0;
    let high = 100;
    let bestDiscount = 0;

    for (let iteration = 0; iteration < 100; iteration++) {
      const mid = (low + high) / 2;
      const testSubtotal = itemsSubtotal * (1 - mid / 100);

      // Calculate shipping based on subtotal after discount
      const testShipping = calculateShippingCosts(testSubtotal);

      // Calculate VAT including shipping tax
      const testItemsVAT = items.reduce((sum, item) => {
        const itemSubtotalAfterDiscount = item.subtotal * (1 - mid / 100);
        return sum + itemSubtotalAfterDiscount * (item.vatRate / 100);
      }, 0);
      const testTotalVAT = testItemsVAT + testShipping.tax;

      // Total includes items + shipping cost + total VAT
      const testTotal = testSubtotal + testShipping.cost + testTotalVAT;

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

    // 🔧 FIX: Limit order size to prevent payload/storage issues
    const MAX_ITEMS_PER_ORDER = 100;
    if (items.length > MAX_ITEMS_PER_ORDER) {
      toastService.error(
        `Ordine troppo grande: massimo ${MAX_ITEMS_PER_ORDER} articoli consentiti`,
      );
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

      // 🔧 FIX: Preserve originDraftId from editing or current draft
      // When editing: use editingOriginDraftId (preserved from loaded order)
      // When creating from draft: use draftId
      const originDraftId = editingOriginDraftId || draftId;

      // 🔧 FIX: Delete ALL drafts for this customer to cleanup duplicates/orphans
      // This prevents draft banner from appearing after order submission
      try {
        console.log(
          "[OrderForm] Deleting ALL drafts for customer:",
          selectedCustomer.id,
        );
        await orderService.deleteAllDraftsForCustomer(selectedCustomer.id);
        setDraftId(null);
        setHasDraft(false);
        console.log("[OrderForm] ✅ All customer drafts deleted");
      } catch (deleteError) {
        console.warn(
          "[OrderForm] ⚠️ Failed to delete all customer drafts:",
          deleteError,
        );
        // Non-critical, continue with order submission
      }

      // Save new/updated order (status will be determined by service)
      // 🔧 FIX: Pass originDraftId for server-side cascade deletion
      await orderService.savePendingOrder({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        items: orderItems,
        discountPercent: parseFloat(globalDiscountPercent) || undefined,
        targetTotalWithVAT: totals.finalTotal,
        originDraftId: originDraftId || undefined,
        subClientCodice: selectedSubClient?.codice,
        subClientName: selectedSubClient?.ragioneSociale,
        subClientData: selectedSubClient ?? undefined,
      });

      // 🔧 FIX: If created from draft, wait for sync to complete BEFORE showing success
      // This ensures draft is deleted on server before other devices sync
      if (originDraftId && navigator.onLine) {
        console.log(
          "[OrderForm] ⏳ Waiting for sync to complete (draft conversion)...",
        );
        try {
          await unifiedSyncService.syncAll();
          console.log(
            "[OrderForm] ✅ Sync completed - draft deleted on server",
          );
        } catch (syncError) {
          console.warn(
            "[OrderForm] ⚠️ Sync failed after pending creation:",
            syncError,
          );
          // Don't block user - server will cleanup eventually
        }
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

      // 🔧 CRITICAL FIX: Use ref instead of setState to prevent race condition
      // Must be synchronous before navigate() to prevent unmount handler from calling saveDraft()
      orderSavedSuccessfullyRef.current = true;

      // Reset editing state
      setEditingOriginDraftId(null);

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
              name="customer-search-field"
              value={customerSearch}
              onChange={(e) => handleCustomerSearch(e.target.value)}
              placeholder="Cerca cliente per nome..."
              autoComplete="new-password"
              data-form-type="other"
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
                setSelectedSubClient(null);
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

        {/* Sub-client selector for Fresis */}
        {selectedCustomer && isFresis(selectedCustomer) && (
          <div style={{ marginTop: "0.75rem" }}>
            <SubClientSelector
              onSelect={(sc) => setSelectedSubClient(sc)}
              onClear={() => setSelectedSubClient(null)}
              selectedSubClient={selectedSubClient}
            />
          </div>
        )}
      </div>

      {/* STEP 2: ADD PRODUCTS WITH INTELLIGENT VARIANT SELECTION */}
      {selectedCustomer && (!isFresis(selectedCustomer) || selectedSubClient) && (
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
              ref={productSearchInputRef}
              type="text"
              name="product-search-field"
              value={productSearch}
              onChange={(e) => handleProductSearch(e.target.value)}
              onKeyDown={handleProductKeyDown}
              placeholder="Cerca articolo..."
              autoComplete="new-password"
              data-form-type="other"
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
                {productResults.map((product, index) => (
                  <div
                    key={product.id}
                    ref={(el) => {
                      productDropdownItemsRef.current[index] = el;
                    }}
                    onClick={() => handleSelectProduct(product)}
                    onMouseEnter={() => setHighlightedProductIndex(index)}
                    style={{
                      padding: isMobile ? "1rem" : "0.75rem",
                      cursor: "pointer",
                      borderBottom: "1px solid #f3f4f6",
                      minHeight: isMobile ? "48px" : "auto",
                      background:
                        index === highlightedProductIndex ? "#f3f4f6" : "white",
                    }}
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
                    ref={quantityInputRef}
                    type="text"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddItem();
                      }
                    }}
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
                    type="text"
                    inputMode="decimal"
                    value={itemDiscount}
                    onChange={(e) => setItemDiscount(e.target.value)}
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
                    onTotalQuantityChange={handleTotalQuantityChange}
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
                type="text"
                inputMode="decimal"
                value={globalDiscountPercent}
                onChange={(e) => setGlobalDiscountPercent(e.target.value)}
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
                Inserisci totale desiderato (con IVA)
              </label>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexDirection: isMobile ? "column" : "row",
                }}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  value={targetTotal}
                  onChange={(e) => setTargetTotal(e.target.value)}
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
            {totals.shippingCost > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                  color: "#f59e0b",
                  fontSize: isMobile ? "0.875rem" : "1rem",
                }}
              >
                <span>
                  Spese di trasporto K3
                  <span style={{ fontSize: "0.75rem", marginLeft: "0.25rem" }}>
                    (€{totals.shippingCost.toFixed(2)} + IVA)
                  </span>
                </span>
                <strong>
                  €{(totals.shippingCost + totals.shippingTax).toFixed(2)}
                </strong>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5rem",
                color: "#6b7280",
                fontSize: isMobile ? "0.875rem" : "1rem",
              }}
            >
              <span>IVA Totale:</span>
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
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "center",
            alignItems: "center",
            gap: "1rem",
            width: "100%",
          }}
        >
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
              flex: isMobile ? "0" : "1",
              maxWidth: isMobile ? "100%" : "600px",
              minHeight: isMobile ? "52px" : "auto",
            }}
          >
            {submitting ? "Salvataggio..." : "Salva in ordini in attesa"}
          </button>

          <button
            onClick={handleResetForm}
            disabled={submitting}
            style={{
              padding: isMobile ? "1rem 2rem" : "1rem 2rem",
              background: submitting ? "#d1d5db" : "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: isMobile ? "1rem" : "1rem",
              fontWeight: "600",
              cursor: submitting ? "not-allowed" : "pointer",
              width: isMobile ? "100%" : "auto",
              minHeight: isMobile ? "52px" : "auto",
            }}
          >
            🗑️ Cancella bozza
          </button>
        </div>
      )}
    </div>
  );
}

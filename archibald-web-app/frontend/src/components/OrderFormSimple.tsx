import { useState, useEffect } from "react";
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
import type { Customer, Product, DraftOrder } from "../db/schema";

interface OrderItem {
  id: string;
  productId: string; // ID della variante specifica (usato per recuperare prezzo e VAT)
  article: string; // Codice variante (stesso valore di productId)
  productName: string; // Nome articolo (raggruppamento, es: "H129FSQ.104.023")
  description?: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // Aliquota IVA (4, 10, 22, etc.)
  discount: number; // Sconto in euro
  subtotal: number; // Prezzo * quantità - sconto
  vat: number; // Importo IVA calcolato
  total: number; // Subtotal + IVA
}

export default function OrderFormSimple() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
            const vatRate = item.vat || 22; // Default to 22% if not stored
            const subtotal = item.price * item.quantity - (item.discount || 0);
            const vatAmount = subtotal * (vatRate / 100);

            // Try to find variant by article code or product name
            let productId = item.articleCode; // Use article code (variant ID)
            if (item.productName && !productId) {
              // Fallback: if no article code, get first variant for this product name
              const products = await db.products
                .where("name")
                .equals(item.productName)
                .first();
              if (products) {
                productId = products.id; // Variant ID
              }
            }

            return {
              id: crypto.randomUUID(),
              productId,
              article: item.articleCode,
              productName: item.productName || item.articleCode,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.price,
              vatRate,
              discount: item.discount || 0,
              subtotal,
              vat: vatAmount,
              total: subtotal + vatAmount,
            };
          }),
        );

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
          const vat = priceAndVat?.vat || 22;

          variantsWithDetails.push({
            variantId: variant.id,
            productId: selectedProduct.name, // Product name is the grouping key
            packageContent: variant.packageContent || "N/A",
            price: price,
            vat: vat,
          });

          console.log(
            `[OrderForm] Variant ${variant.id}: package=${variant.packageContent}, price=${price === null ? 'NOT FOUND' : `€${price}`}, vat=${vat}%`,
          );
        }

        // Log warning if no prices found
        const noPricesCount = variantsWithDetails.filter(v => v.price === null).length;
        if (noPricesCount > 0) {
          console.warn(
            `[OrderForm] ${noPricesCount}/${variantsWithDetails.length} variants have no price. Cache may need sync.`
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
    // - No items added
    if (editingOrderId || !selectedCustomer || items.length === 0) {
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
        const product = await db.products.get(variantId);
        const price = await priceService.getPriceByArticleId(variantId);

        if (product && price) {
          const vatRate = product.vat || 22;
          const subtotal = price * draftItem.quantity;
          const vat = subtotal * (vatRate / 100);

          recoveredItems.push({
            id: crypto.randomUUID(),
            productId: variantId, // Use variant ID
            article: draftItem.article,
            productName: draftItem.productName,
            description: draftItem.packageContent,
            quantity: draftItem.quantity,
            unitPrice: price,
            vatRate,
            discount: 0,
            subtotal,
            vat,
            total: subtotal + vat,
          });
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

    // Get discount (will be applied to total, not per line)
    const disc = parseFloat(itemDiscount) || 0;
    const discountPerLine = disc / breakdown.length; // Split discount across lines

    // Create one order item per packaging variant
    // IMPORTANT: Each variant can have different price and VAT
    const newItems: OrderItem[] = [];

    for (const pkg of breakdown) {
      const variantArticleCode = pkg.variant.variantId;

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
      const vatRate = variantProduct?.vat || 22;

      const lineSubtotal = price * pkg.packageCount - discountPerLine;
      const lineVat = lineSubtotal * (vatRate / 100);
      const lineTotal = lineSubtotal + lineVat;

      newItems.push({
        id: crypto.randomUUID(),
        productId: variantArticleCode, // Use variant ID as productId
        article: variantArticleCode,
        productName: selectedProduct.name,
        description: `${pkg.packageSize} ${pkg.packageSize === 1 ? "pezzo" : "pezzi"} x ${pkg.packageCount}`,
        quantity: pkg.packageCount,
        unitPrice: price,
        vatRate,
        discount: discountPerLine,
        subtotal: lineSubtotal,
        vat: lineVat,
        total: lineTotal,
      });
    }

    // Add all lines to items list
    setItems([...items, ...newItems]);

    // Reset form
    setSelectedProduct(null);
    setProductSearch("");
    setQuantity("");
    setItemDiscount("0");
    setPackagingPreview(null);
  };

  // === EDIT / DELETE ITEM ===
  const handleDeleteItem = (id: string) => {
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

    // Remove from list
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

    for (let iteration = 0; iteration < 50; iteration++) {
      const mid = (low + high) / 2;
      const testSubtotal = itemsSubtotal * (1 - mid / 100);
      const testVAT = items.reduce((sum, item) => {
        const itemSubtotalAfterDiscount = item.subtotal * (1 - mid / 100);
        return sum + itemSubtotalAfterDiscount * (item.vatRate / 100);
      }, 0);
      const testTotal = testSubtotal + testVAT;

      if (Math.abs(testTotal - target) < 0.01) {
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

    setGlobalDiscountPercent(bestDiscount.toFixed(2));
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

      // Save new/updated order
      await orderService.savePendingOrder({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        items: items.map((item) => ({
          articleCode: item.article,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          price: item.unitPrice,
          vat: item.vatRate,
          discount: item.discount,
        })),
        discountPercent: undefined,
        targetTotalWithVAT: totals.finalTotal,
        createdAt: new Date().toISOString(),
        status: "pending" as const,
        retryCount: 0,
      });

      // Delete draft if it exists (order is now finalized)
      if (draftId) {
        await orderService.deleteDraftOrder(draftId);
        setDraftId(null);
      }

      toastService.success(
        editingOrderId ? "Ordine aggiornato!" : "Ordine salvato nella coda!",
      );
      navigate("/pending-orders");
    } catch (error) {
      console.error("Failed to save order:", error);
      toastService.error("Errore durante il salvataggio");
    } finally {
      setSubmitting(false);
    }
  };

  const totals = calculateTotals();

  return (
    <div
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "2rem",
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
            padding: "1rem",
            background: "#dbeafe",
            borderRadius: "4px",
            marginBottom: "1rem",
            border: "2px solid #3b82f6",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ fontSize: "1.5rem" }}>⏳</span>
          <div>
            <strong style={{ color: "#1e40af", display: "block" }}>
              Caricamento ordine in corso...
            </strong>
          </div>
        </div>
      )}

      {/* AUTO-SYNC BANNER */}
      {cacheSyncing && (
        <div
          style={{
            padding: "1rem",
            background: "#fef3c7",
            borderRadius: "4px",
            marginBottom: "1rem",
            border: "2px solid #f59e0b",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ fontSize: "1.5rem" }}>⏳</span>
          <div>
            <strong style={{ color: "#92400e", display: "block" }}>
              Sincronizzazione cache in corso...
            </strong>
            <span style={{ color: "#92400e", fontSize: "0.875rem" }}>
              Popolamento delle varianti di prodotto e dei prezzi dal server
            </span>
          </div>
        </div>
      )}

      {/* DRAFT RECOVERY BANNER */}
      {hasDraft && !loadingOrder && (
        <div
          style={{
            padding: "1.25rem",
            background: "#d1fae5",
            borderRadius: "8px",
            marginBottom: "1rem",
            border: "2px solid #10b981",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ fontSize: "2rem" }}>💾</span>
            <div>
              <strong
                style={{
                  color: "#065f46",
                  display: "block",
                  fontSize: "1.125rem",
                }}
              >
                Bozza ordine disponibile
              </strong>
              <span style={{ color: "#047857", fontSize: "0.875rem" }}>
                È stata trovata una bozza salvata. Vuoi continuare da dove avevi
                interrotto?
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleRecoverDraft}
              style={{
                padding: "0.75rem 1.25rem",
                background: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "0.875rem",
              }}
            >
              Continua
            </button>
            <button
              onClick={handleDiscardDraft}
              style={{
                padding: "0.75rem 1.25rem",
                background: "white",
                color: "#065f46",
                border: "2px solid #10b981",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "0.875rem",
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
          marginBottom: "2rem",
          padding: "1.5rem",
          background: "#f9fafb",
          borderRadius: "8px",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>
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
                padding: "0.75rem",
                fontSize: "1rem",
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
                  maxHeight: "200px",
                  overflowY: "auto",
                  background: "white",
                }}
              >
                {customerResults.map((customer) => (
                  <div
                    key={customer.id}
                    onClick={() => handleSelectCustomer(customer)}
                    style={{
                      padding: "0.75rem",
                      cursor: "pointer",
                      borderBottom: "1px solid #f3f4f6",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f9fafb")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "white")
                    }
                  >
                    <strong>{customer.name}</strong>
                    {customer.code && (
                      <span style={{ marginLeft: "0.5rem", color: "#6b7280" }}>
                        ({customer.code})
                      </span>
                    )}
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
                padding: "0.5rem 1rem",
                background: "white",
                border: "1px solid #065f46",
                borderRadius: "4px",
                cursor: "pointer",
                color: "#065f46",
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
            marginBottom: "2rem",
            padding: "1.5rem",
            background: "#f9fafb",
            borderRadius: "8px",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>
            2. Aggiungi Articoli
          </h2>

          {/* Product search */}
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
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
                padding: "0.75rem",
                fontSize: "1rem",
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
                  maxHeight: "200px",
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
                      padding: "0.75rem",
                      cursor: "pointer",
                      borderBottom: "1px solid #f3f4f6",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f9fafb")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "white")
                    }
                  >
                    <strong>{product.name}</strong>
                    {product.description && (
                      <p
                        style={{
                          margin: "0.25rem 0 0 0",
                          fontSize: "0.875rem",
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
                      padding: "1rem",
                      background: "#eff6ff",
                      borderRadius: "6px",
                      overflowX: "auto",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: "600",
                        color: "#1e40af",
                        marginBottom: "0.75rem",
                      }}
                    >
                      Varianti disponibili:
                    </div>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.875rem",
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
                              padding: "0.5rem",
                              color: "#1e40af",
                              fontWeight: "600",
                            }}
                          >
                            Codice Variante
                          </th>
                          <th
                            style={{
                              textAlign: "center",
                              padding: "0.5rem",
                              color: "#1e40af",
                              fontWeight: "600",
                            }}
                          >
                            Confezionamento
                          </th>
                          <th
                            style={{
                              textAlign: "right",
                              padding: "0.5rem",
                              color: "#1e40af",
                              fontWeight: "600",
                            }}
                          >
                            Prezzo
                          </th>
                          <th
                            style={{
                              textAlign: "right",
                              padding: "0.5rem",
                              color: "#1e40af",
                              fontWeight: "600",
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
                                padding: "0.5rem",
                                fontFamily: "monospace",
                              }}
                            >
                              {variant.variantId}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem",
                                textAlign: "center",
                              }}
                            >
                              {variant.packageContent}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem",
                                textAlign: "right",
                                fontWeight: "600",
                              }}
                            >
                              {variant.price !== null
                                ? `€${variant.price.toFixed(2)}`
                                : "N/D"}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem",
                                textAlign: "right",
                                color: "#059669",
                                fontWeight: "600",
                              }}
                            >
                              {variant.vat}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "1rem",
                      background: "#eff6ff",
                      borderRadius: "6px",
                      textAlign: "center",
                      color: "#6b7280",
                    }}
                  >
                    Caricamento varianti...
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
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
                      padding: "0.75rem",
                      fontSize: "1rem",
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
                      padding: "0.75rem",
                      fontSize: "1rem",
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
                    padding: "1rem",
                    background: packagingPreview.success
                      ? "#d1fae5"
                      : "#fee2e2",
                    borderRadius: "4px",
                    marginBottom: "1rem",
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
                            padding: "0.5rem 1rem",
                            background: "#dc2626",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.875rem",
                            marginTop: "0.5rem",
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

              <button
                onClick={handleAddItem}
                disabled={!packagingPreview?.success}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: packagingPreview?.success ? "#22c55e" : "#d1d5db",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: packagingPreview?.success ? "pointer" : "not-allowed",
                  width: "100%",
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
            marginBottom: "2rem",
            padding: "1.5rem",
            background: "#f9fafb",
            borderRadius: "8px",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>
            3. Riepilogo Articoli ({items.length})
          </h2>

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
                <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
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
                    {item.discount > 0 ? `-€${item.discount.toFixed(2)}` : "—"}
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

          {/* Global Discount & Target Total */}
          <div
            style={{
              marginTop: "1.5rem",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: "500",
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
                  padding: "0.75rem",
                  fontSize: "1rem",
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
                }}
              >
                O inserisci totale desiderato (con IVA)
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="number"
                  value={targetTotal}
                  onChange={(e) => setTargetTotal(e.target.value)}
                  placeholder="Es: 1000.00"
                  min="0"
                  step="0.01"
                  style={{
                    flex: 1,
                    padding: "0.75rem",
                    fontSize: "1rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                  }}
                />
                <button
                  onClick={calculateGlobalDiscountForTarget}
                  disabled={!targetTotal}
                  style={{
                    padding: "0.75rem 1rem",
                    background: targetTotal ? "#8b5cf6" : "#d1d5db",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: targetTotal ? "pointer" : "not-allowed",
                    fontWeight: "600",
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
              padding: "1.5rem",
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
                fontSize: "1.25rem",
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
        <div style={{ textAlign: "right" }}>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: "1rem 2rem",
              background: submitting ? "#d1d5db" : "#22c55e",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "1.125rem",
              fontWeight: "600",
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Salvataggio..." : "Salva in Coda Ordini"}
          </button>
        </div>
      )}
    </div>
  );
}

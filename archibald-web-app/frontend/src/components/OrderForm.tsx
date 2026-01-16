import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useVoiceInput } from "../hooks/useVoiceInput";
import {
  parseVoiceOrder,
  getVoiceSuggestions,
  validateCustomerName,
  validateArticleCode,
  detectVoiceCommand,
} from "../utils/orderParser";
import type { OrderItem } from "../types/order";
import type {
  ParsedOrderWithConfidence,
  CustomerValidationResult,
  ArticleValidationResult,
} from "../utils/orderParser";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { TranscriptDisplay } from "./TranscriptDisplay";
import { ValidationStatus } from "./ValidationStatus";
import { SmartSuggestions } from "./SmartSuggestions";
import { CustomerSuggestions } from "./CustomerSuggestions";
import { VoicePopulatedBadge } from "./VoicePopulatedBadge";
import { VoiceDebugPanel, useVoiceDebugLogger } from "./VoiceDebugPanel";
import { cacheService } from "../services/cache-service";
import { draftService } from "../services/draft-service";
import { saveDraftOrder } from "../services/draftOrderStorage";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { StaleCacheWarning } from "./StaleCacheWarning";
import type { DraftOrderItem } from "../db/schema";

interface Customer {
  id: string;
  name: string;
  vatNumber?: string;
  email?: string;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  groupCode?: string;
  price?: number;
  packageContent?: string;
}

interface OrderFormProps {
  token: string;
  onOrderCreated: (jobId: string) => void;
  isAdmin?: boolean;
}

export default function OrderForm({
  token,
  onOrderCreated,
  isAdmin = false,
}: OrderFormProps) {
  // Navigation
  const navigate = useNavigate();

  // Network status
  const { isOffline } = useNetworkStatus();

  // Debug logger
  const {
    logs,
    log: debugLog,
    clear: clearLogs,
    exportLogs,
  } = useVoiceDebugLogger();

  const [loading, setLoading] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");

  // Customer autocomplete state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Product autocomplete state
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const productInputRef = useRef<HTMLInputElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // Form per nuovo articolo
  const [newItem, setNewItem] = useState<OrderItem>({
    articleCode: "",
    productName: "",
    description: "",
    quantity: 1,
    price: 0,
    discount: 0,
  });

  // Package constraints for selected product
  const [packageConstraints, setPackageConstraints] = useState<{
    minQty: number;
    multipleQty: number;
    maxQty?: number;
  } | null>(null);

  // Voice input state
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceSuggestions, setVoiceSuggestions] = useState<string[]>([]);
  const [parsedOrder, setParsedOrder] = useState<ParsedOrderWithConfidence>({
    items: [],
  });
  const [validationStatus] = useState<
    "idle" | "validating" | "success" | "error"
  >("idle");
  const [isFinalTranscript, setIsFinalTranscript] = useState(false);
  const [customerValidation, setCustomerValidation] =
    useState<CustomerValidationResult | null>(null);
  const [customerManuallySelected, setCustomerManuallySelected] =
    useState(false);
  const [articleValidation, setArticleValidation] =
    useState<ArticleValidationResult | null>(null);
  const [articleManuallySelected, setArticleManuallySelected] = useState(false);

  // Voice-populated fields tracking
  const [voicePopulatedFields, setVoicePopulatedFields] = useState<{
    customer: boolean;
    article: boolean;
    quantity: boolean;
  }>({ customer: false, article: false, quantity: false });

  // Draft items and confirmation modal
  const [draftItems, setDraftItems] = useState<OrderItem[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showStaleWarning, setShowStaleWarning] = useState(false);

  // Pricing calculation state
  const [targetTotalWithVAT, setTargetTotalWithVAT] = useState<string>("");
  const [calculatedDiscount, setCalculatedDiscount] = useState<number>(0);
  const [pricingError, setPricingError] = useState<string>("");

  // Multi-item voice input
  const [showMultiItemModal, setShowMultiItemModal] = useState(false);
  const [multiItemSummary, setMultiItemSummary] = useState<
    ParsedOrderWithConfidence["items"]
  >([]);

  // Onboarding hints
  const [showVoiceHint, setShowVoiceHint] = useState(() => {
    if (typeof window === "undefined") return false;
    const count = parseInt(
      localStorage.getItem("voiceModalOpenCount") || "0",
      10,
    );
    return count < 3; // Show hint for first 3 uses
  });

  // Cache freshness tracking
  const [cacheAge, setCacheAge] = useState<number | null>(null);
  const [cacheStale, setCacheStale] = useState(false);

  // Voice input hook
  const {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    error: voiceError,
  } = useVoiceInput({
    lang: "it-IT",
    continuous: true,
    interimResults: true,
    onResult: async (finalTranscript) => {
      debugLog(
        "📝 Raw Transcript Received",
        {
          transcript: finalTranscript,
          length: finalTranscript.length,
        },
        "info",
      );

      // Parse transcript
      const parsed = parseVoiceOrder(finalTranscript);

      debugLog(
        "🔍 Transcript Parsed",
        {
          customerName: parsed.customerName,
          customerId: parsed.customerId,
          itemsCount: parsed.items.length,
          items: parsed.items.map((item) => ({
            articleCode: item.articleCode,
            quantity: item.quantity,
          })),
        },
        "info",
      );

      // Validate customer name if present (async fuzzy matching)
      // Skip validation if user manually selected a customer from suggestions
      let customerConfidence = parsed.customerName ? 0.5 : undefined;
      if (parsed.customerName && !customerManuallySelected) {
        debugLog(
          "🔎 Validating Customer",
          {
            inputName: parsed.customerName,
            manuallySelected: customerManuallySelected,
          },
          "info",
        );

        const validation = await validateCustomerName(parsed.customerName);
        setCustomerValidation(validation);
        customerConfidence = validation.confidence;

        debugLog(
          "✅ Customer Validation Result",
          {
            matchType: validation.matchType,
            confidence: validation.confidence,
            foundCustomer: validation.customer?.name,
            suggestionsCount: validation.suggestions.length,
          },
          validation.confidence >= 0.7 ? "success" : "warning",
        );

        // If exact/phonetic match found, use the correct name from database
        if (validation.customer && validation.confidence >= 0.7) {
          parsed.customerName = validation.customer.name;
          parsed.customerId = validation.customer.id;

          debugLog(
            "🎯 Customer Auto-Selected",
            {
              originalName: parsed.customerName,
              correctedName: validation.customer.name,
              customerId: validation.customer.id,
            },
            "success",
          );
        }
      }

      // Validate article code if present (async fuzzy matching)
      // Skip validation if user manually selected an article from suggestions
      let articleConfidence = 0; // default to 0 - will be set by validation
      if (
        parsed.items.length > 0 &&
        parsed.items[0].articleCode &&
        !articleManuallySelected
      ) {
        debugLog(
          "🔎 Validating Article",
          {
            inputCode: parsed.items[0].articleCode,
            manuallySelected: articleManuallySelected,
          },
          "info",
        );

        const validation = await validateArticleCode(
          parsed.items[0].articleCode,
        );
        setArticleValidation(validation);
        articleConfidence = validation.confidence;

        debugLog(
          "✅ Article Validation Result",
          {
            matchType: validation.matchType,
            confidence: validation.confidence,
            foundProduct: validation.product?.name,
            suggestionsCount: validation.suggestions?.length || 0,
          },
          validation.confidence >= 0.7 ? "success" : "warning",
        );

        // If exact/normalized match found, use the correct code from database
        if (validation.product && validation.confidence >= 0.7) {
          parsed.items[0].articleCode = validation.product.name;

          debugLog(
            "🎯 Article Auto-Selected",
            {
              originalCode: parsed.items[0].articleCode,
              correctedCode: validation.product.name,
              productId: validation.product.id,
            },
            "success",
          );
        }
      }

      // Add confidence scores (customer and article use validation results)
      const parsedWithConfidence: ParsedOrderWithConfidence = {
        ...parsed,
        customerNameConfidence: customerConfidence,
        customerIdConfidence: parsed.customerId ? 0.9 : undefined,
        items: parsed.items.map((item) => ({
          ...item,
          articleCodeConfidence: articleConfidence,
          quantityConfidence: 0.95,
        })),
      };

      setParsedOrder(parsedWithConfidence);
      setIsFinalTranscript(true); // onResult is called only for final transcripts

      // Update suggestions based on what's missing
      setVoiceSuggestions(getVoiceSuggestions(finalTranscript));

      // Auto-apply if high confidence (≥70%)
      // Apply if either customer or article has good confidence
      const hasHighConfidenceCustomer =
        parsed.customerName && customerConfidence && customerConfidence >= 0.7;
      const hasHighConfidenceArticle =
        parsed.items.length > 0 &&
        parsed.items[0].articleCode &&
        articleConfidence >= 0.7;

      debugLog(
        "🤔 Auto-Apply Decision",
        {
          hasHighConfidenceCustomer,
          hasHighConfidenceArticle,
          customerName: parsed.customerName,
          customerConfidence,
          articleCode: parsed.items[0]?.articleCode,
          articleConfidence,
          threshold: 0.7,
        },
        hasHighConfidenceCustomer || hasHighConfidenceArticle
          ? "success"
          : "warning",
      );

      if (hasHighConfidenceCustomer || hasHighConfidenceArticle) {
        debugLog(
          "⏰ Auto-Apply Scheduled",
          {
            delay: "1.5s",
            reason: hasHighConfidenceCustomer
              ? "High confidence customer"
              : "High confidence article",
          },
          "info",
        );

        // Capture parsedWithConfidence in closure to avoid state race conditions
        const dataToApply = parsedWithConfidence;
        // Wait a moment to show the validation result, then auto-apply
        setTimeout(() => {
          debugLog(
            "⚡ Auto-Apply Triggered",
            {
              customerName: dataToApply.customerName,
              customerId: dataToApply.customerId,
              itemsCount: dataToApply.items.length,
            },
            "success",
          );

          // Apply the captured data directly instead of reading from state
          applyVoiceData(dataToApply);
        }, 1500);
      } else {
        debugLog(
          "⏸️ Auto-Apply Skipped",
          {
            reason: "Confidence below threshold (70%)",
            customerConfidence,
            articleConfidence,
          },
          "warning",
        );
      }
    },
  });

  // Voice command detection - watch for keywords to control modal
  useEffect(() => {
    if (!transcript || !showVoiceModal) return;

    const command = detectVoiceCommand(transcript);

    if (command === "close") {
      debugLog(
        "🔴 Voice Command: Close",
        {
          transcript,
          action: "Closing modal",
        },
        "info",
      );
      handleVoiceCancel();
    } else if (command === "retry") {
      debugLog(
        "🔄 Voice Command: Retry",
        {
          transcript,
          action: "Clearing transcript",
        },
        "info",
      );
      handleVoiceClear();
    } else if (command === "apply") {
      // Only apply if we have something to apply
      if (parsedOrder.customerName || parsedOrder.items.length > 0) {
        debugLog(
          "✅ Voice Command: Apply",
          {
            transcript,
            action: "Applying voice data",
          },
          "info",
        );
        handleVoiceApply();
      }
    }
  }, [transcript, showVoiceModal]);

  // Check cache freshness on mount
  useEffect(() => {
    async function checkCache() {
      const age = await cacheService.getCacheAge();
      const stale = await cacheService.isCacheStale();
      setCacheAge(age);
      setCacheStale(stale);
    }
    checkCache();
  }, []);

  // Restore draft on mount
  useEffect(() => {
    async function restoreDraft() {
      const draft = await draftService.getDraft();
      if (draft && draft.items.length > 0) {
        // Populate form with draft data
        setCustomerId(draft.customerId);
        setCustomerName(draft.customerName);
        setCustomerSearch(draft.customerName);

        // Convert DraftOrderItem[] to OrderItem[]
        const orderItems: OrderItem[] = draft.items.map((item) => ({
          articleCode: item.article,
          productName: item.productName,
          description: "",
          quantity: item.quantity,
          price: 0, // Will be populated by backend
          discount: 0,
        }));

        setDraftItems(orderItems);
        console.log("[Draft] Restored from", new Date(draft.updatedAt));
      }
    }
    restoreDraft();
  }, []);

  // Auto-save draft with debounce
  useEffect(() => {
    // Only auto-save if we have a customer and items
    if (!customerId || !customerName || draftItems.length === 0) {
      return;
    }

    // Debounce: save after 1 second of inactivity
    const timeoutId = setTimeout(() => {
      // Convert OrderItem[] to DraftOrderItem[]
      const draftOrderItems: DraftOrderItem[] = draftItems.map((item) => ({
        productId: item.articleCode, // Use articleCode as productId
        productName: item.productName,
        article: item.articleCode,
        variantId: "", // Not used in current flow
        quantity: item.quantity,
        packageContent: "",
      }));

      draftService.saveDraft(customerId, customerName, draftOrderItems);
      console.log("[Draft] Auto-saved");
    }, 1000);

    // Cleanup: clear timeout if dependencies change
    return () => clearTimeout(timeoutId);
  }, [customerId, customerName, draftItems]);

  // Fetch customers from cache on mount
  useEffect(() => {
    let isMounted = true;

    const loadCustomersFromCache = async () => {
      if (customersLoaded) return; // Already loaded

      setLoadingCustomers(true);
      try {
        // Load all customers from cache (fast - IndexedDB)
        const cachedCustomers = await cacheService.searchCustomers("", 10000); // Large limit to get all

        if (!isMounted) return;

        if (cachedCustomers.length > 0) {
          setCustomers(cachedCustomers);
          setCustomersLoaded(true);
        } else {
          // Fallback to API if cache is empty
          const response = await fetch("/api/customers");
          const data = await response.json();

          if (!isMounted) return;

          if (data.success) {
            setCustomers(data.data);
            setCustomersLoaded(true);
          } else {
            console.error("Errore dal server:", data.error);
          }
        }
      } catch (error) {
        if (!isMounted) return;
        console.error("Errore caricamento clienti:", error);
      } finally {
        if (isMounted) {
          setLoadingCustomers(false);
        }
      }
    };

    loadCustomersFromCache();

    return () => {
      isMounted = false;
    };
  }, [customersLoaded]);

  // Don't fetch products on mount - wait for user to type
  // This prevents loading 4000+ products at startup

  // Filter customers based on search - memoize to avoid recalculation
  const filteredCustomers = customers.filter((customer) => {
    if (!customerSearch) return true; // Show all if empty
    const searchLower = customerSearch.toLowerCase();
    return (
      customer.name.toLowerCase().includes(searchLower) ||
      customer.id.toLowerCase().includes(searchLower)
    );
  });

  // Filter products based on search
  const filteredProducts = products.filter((product) => {
    if (!productSearch) return true; // Show all if empty
    const searchLower = productSearch.toLowerCase();
    return (
      product.name.toLowerCase().includes(searchLower) ||
      product.id.toLowerCase().includes(searchLower) ||
      (product.description &&
        product.description.toLowerCase().includes(searchLower))
    );
  });

  // Customer selection handler
  const handleCustomerSelect = (customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
  };

  // Customer search handler - simplified
  const handleCustomerSearchChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setCustomerSearch(e.target.value);
    setCustomerName(""); // Clear selection when typing
    setCustomerId(""); // Clear ID when typing
    // Clear voice-populated indicator on manual edit
    setVoicePopulatedFields((prev) => ({ ...prev, customer: false }));
  };

  // Product selection handler
  const handleProductSelect = (product: Product) => {
    // Parse packageContent to get the package size (minimum order quantity)
    let packageSize = 1;
    if (product.packageContent) {
      const parsed = parseInt(product.packageContent);
      if (!isNaN(parsed) && parsed > 0) {
        packageSize = parsed;
      }
    }

    // Set package constraints based on product metadata
    // This will be used to validate and constrain quantity input
    setPackageConstraints({
      minQty: packageSize, // Min quantity = package size
      multipleQty: packageSize, // Must order in multiples of package size
      maxQty: undefined, // No max by default
    });

    setNewItem({
      ...newItem,
      articleCode: product.name, // Usa il nome invece dell'ID
      productName: product.name,
      description: product.description || "",
      quantity: packageSize, // Start with minimum package size
      price: product.price || 0, // Auto-compila il prezzo dal database
    });
    setProductSearch(product.name);
    setShowProductDropdown(false);
  };

  // Product search handler with cache service
  const handleProductSearchChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const searchValue = e.target.value;
    setProductSearch(searchValue);
    setNewItem({ ...newItem, articleCode: "", productName: "" }); // Clear selection when typing
    // Clear voice-populated indicator on manual edit
    setVoicePopulatedFields((prev) => ({
      ...prev,
      article: false,
      quantity: false,
    }));

    // If user types at least 2 characters, search from cache
    if (searchValue.length >= 2) {
      setLoadingProducts(true);
      setShowProductDropdown(false); // Hide while loading
      try {
        // Search from cache (< 100ms performance)
        const cachedProducts = await cacheService.searchProducts(
          searchValue,
          50,
        );

        // Map ProductWithDetails to Product interface for display
        const mappedProducts = cachedProducts.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          groupCode: undefined,
          price: p.price,
          packageContent: p.variants[0]?.packageContent,
        }));

        setProducts(mappedProducts);
        setShowProductDropdown(true);
      } catch (error) {
        console.error("Errore ricerca prodotti:", error);
      } finally {
        setLoadingProducts(false);
        // Mantieni focus sull'input dopo il caricamento - CRITICAL FIX
        // Use requestAnimationFrame to ensure DOM is updated before refocusing
        requestAnimationFrame(() => {
          if (
            productInputRef.current &&
            document.activeElement !== productInputRef.current
          ) {
            productInputRef.current.focus();
          }
        });
      }
    } else {
      // Clear products when less than 2 characters
      setProducts([]);
      setShowProductDropdown(false);
    }
  };

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const clickedInsideCustomerInput = customerInputRef.current?.contains(
        event.target as Node,
      );
      const clickedInsideCustomerDropdown =
        customerDropdownRef.current?.contains(event.target as Node);
      const clickedInsideProductInput = productInputRef.current?.contains(
        event.target as Node,
      );
      const clickedInsideProductDropdown = productDropdownRef.current?.contains(
        event.target as Node,
      );

      if (!clickedInsideCustomerInput && !clickedInsideCustomerDropdown) {
        setShowCustomerDropdown(false);
      }

      if (!clickedInsideProductInput && !clickedInsideProductDropdown) {
        setShowProductDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddItem = () => {
    if (!newItem.articleCode || newItem.quantity <= 0) {
      alert("Inserisci nome prodotto e quantità");
      return;
    }

    // Validate package constraints before adding
    if (packageConstraints) {
      const multiple = packageConstraints.multipleQty;

      // Check if quantity is a valid multiple
      if (newItem.quantity % multiple !== 0) {
        alert(
          `La quantità deve essere un multiplo di ${multiple}. ` +
            `Quantità suggerite: ${Math.floor(newItem.quantity / multiple) * multiple}, ` +
            `${Math.ceil(newItem.quantity / multiple) * multiple}`,
        );
        return;
      }

      // Check minimum quantity
      if (newItem.quantity < packageConstraints.minQty) {
        alert(`La quantità minima è ${packageConstraints.minQty}`);
        return;
      }

      // Check maximum quantity
      if (
        packageConstraints.maxQty &&
        newItem.quantity > packageConstraints.maxQty
      ) {
        alert(`La quantità massima è ${packageConstraints.maxQty}`);
        return;
      }
    }

    // Add to draft instead of direct submission
    setDraftItems((prev) => [...prev, { ...newItem }]);

    // Clear form for next item
    setNewItem({
      articleCode: "",
      productName: "",
      description: "",
      quantity: 1,
      price: 0,
      discount: 0,
    });
    setProductSearch(""); // Reset product search
    setPackageConstraints(null); // Reset constraints for next item

    // Clear voice-populated indicators after adding item
    setVoicePopulatedFields({
      customer: false,
      article: false,
      quantity: false,
    });
  };

  const handleRemoveDraftItem = (index: number) => {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Calcola prezzi ordine con IVA, spedizione e sconto
   */
  const calculatePricing = () => {
    const VAT_RATE = 0.22; // 22%
    const SHIPPING_COST_BASE = 15.45; // €15.45
    const SHIPPING_THRESHOLD = 200; // Gratis se subtotale > €200

    // Subtotale articoli (senza IVA, senza sconto)
    const subtotalItems = draftItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    // Calcola spese spedizione
    const shippingBase =
      subtotalItems > SHIPPING_THRESHOLD ? 0 : SHIPPING_COST_BASE;
    const shippingWithVAT = shippingBase * (1 + VAT_RATE);

    // Se non c'è target, nessuno sconto
    if (!targetTotalWithVAT || targetTotalWithVAT.trim() === "") {
      const totalWithVAT = subtotalItems * (1 + VAT_RATE) + shippingWithVAT;
      return {
        subtotalItems,
        shippingBase,
        shippingWithVAT,
        discountPercent: 0,
        subtotalAfterDiscount: subtotalItems,
        totalWithVAT,
        error: null,
      };
    }

    // Parse target totale desiderato
    const targetTotal = parseFloat(targetTotalWithVAT);
    if (isNaN(targetTotal) || targetTotal <= 0) {
      return {
        subtotalItems,
        shippingBase,
        shippingWithVAT,
        discountPercent: 0,
        subtotalAfterDiscount: subtotalItems,
        totalWithVAT: subtotalItems * (1 + VAT_RATE) + shippingWithVAT,
        error: "Inserisci un totale valido (> 0)",
      };
    }

    // Calcola sconto necessario per raggiungere il target
    // Formula: targetTotal = (subtotalItems * (1 - discount/100)) * (1 + VAT) + shippingWithVAT
    // Risolviamo per discount:
    // targetTotal - shippingWithVAT = (subtotalItems * (1 - discount/100)) * (1 + VAT)
    // (targetTotal - shippingWithVAT) / (1 + VAT) = subtotalItems * (1 - discount/100)
    // discount = 100 * (1 - ((targetTotal - shippingWithVAT) / (1 + VAT)) / subtotalItems)

    const subtotalAfterVATAndShipping = targetTotal - shippingWithVAT;
    if (subtotalAfterVATAndShipping <= 0) {
      return {
        subtotalItems,
        shippingBase,
        shippingWithVAT,
        discountPercent: 0,
        subtotalAfterDiscount: subtotalItems,
        totalWithVAT: subtotalItems * (1 + VAT_RATE) + shippingWithVAT,
        error: `Il totale desiderato è troppo basso. Minimo: €${shippingWithVAT.toFixed(2)} (solo spedizione)`,
      };
    }

    const subtotalAfterDiscount = subtotalAfterVATAndShipping / (1 + VAT_RATE);
    const discountPercent = 100 * (1 - subtotalAfterDiscount / subtotalItems);

    // Validazione: sconto deve essere tra 0% e 100%
    if (discountPercent < 0) {
      const maxTotal = subtotalItems * (1 + VAT_RATE) + shippingWithVAT;
      return {
        subtotalItems,
        shippingBase,
        shippingWithVAT,
        discountPercent: 0,
        subtotalAfterDiscount: subtotalItems,
        totalWithVAT: maxTotal,
        error: `Il totale desiderato (€${targetTotal.toFixed(2)}) supera il totale massimo (€${maxTotal.toFixed(2)}). Non è necessario uno sconto.`,
      };
    }

    if (discountPercent > 100) {
      return {
        subtotalItems,
        shippingBase,
        shippingWithVAT,
        discountPercent: 0,
        subtotalAfterDiscount: subtotalItems,
        totalWithVAT: subtotalItems * (1 + VAT_RATE) + shippingWithVAT,
        error: `Il totale desiderato (€${targetTotal.toFixed(2)}) è troppo basso. Minimo possibile: €${shippingWithVAT.toFixed(2)}`,
      };
    }

    return {
      subtotalItems,
      shippingBase,
      shippingWithVAT,
      discountPercent,
      subtotalAfterDiscount,
      totalWithVAT: targetTotal,
      error: null,
    };
  };

  // Ricalcola pricing quando cambia target o items
  useEffect(() => {
    const pricing = calculatePricing();
    setCalculatedDiscount(pricing.discountPercent);
    setPricingError(pricing.error || "");
  }, [targetTotalWithVAT, draftItems]);

  const handleConfirmOrder = async () => {
    // Valida pricing prima di inviare
    if (pricingError) {
      alert(pricingError);
      return;
    }

    // Check if cache is stale (> 3 days) before proceeding
    const isStale = await cacheService.isCacheStale();
    if (isStale) {
      setShowStaleWarning(true);
      return; // Wait for user confirmation
    }

    // Proceed with order submission
    await submitOrder();
  };

  const submitOrder = async () => {
    setLoading(true);
    try {
      console.log("[OrderForm] Saving draft order to localStorage...");

      // Save draft to localStorage (new flow: always save as draft)
      const draft = saveDraftOrder({
        customerId,
        customerName,
        items: draftItems.map((item) => ({
          articleCode: item.articleCode,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
        })),
        discountPercent:
          calculatedDiscount > 0 ? calculatedDiscount : undefined,
        targetTotalWithVAT: targetTotalWithVAT
          ? parseFloat(targetTotalWithVAT)
          : undefined,
      });

      console.log("[OrderForm] Draft saved with ID:", draft.id);

      // Clear old draft from IndexedDB (legacy system)
      await draftService.clearDraft();

      // Clear form
      setDraftItems([]);
      setShowConfirmModal(false);
      setCustomerId("");
      setCustomerName("");
      setCustomerSearch("");
      setTargetTotalWithVAT("");

      // Show success message
      alert(
        `✅ Bozza salvata!\n\nPuoi visualizzarla nella sezione "Bozze" e inviarla ad Archibald quando sei pronto.`,
      );

      // Navigate to drafts page
      navigate("/drafts");
    } catch (error) {
      console.error("[OrderForm] Error saving draft:", error);
      alert(`Errore durante il salvataggio della bozza: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyAllItems = () => {
    // Add all items to draft
    const validItems = multiItemSummary.filter(
      (item) =>
        item.articleCode &&
        item.articleCodeConfidence &&
        item.articleCodeConfidence > 0.5,
    );

    validItems.forEach((item) => {
      const draftItem: OrderItem = {
        articleCode: item.articleCode,
        productName: item.productName || "",
        description: item.description || "",
        quantity: item.quantity || 1,
        price: item.price || 0,
        discount: item.discount || 0,
      };
      setDraftItems((prev) => [...prev, draftItem]);
    });

    // Close multi-item modal
    setShowMultiItemModal(false);
    setMultiItemSummary([]);
  };

  const handleApplySelectedItem = (index: number) => {
    const item = multiItemSummary[index];
    if (!item) return;

    // Populate form with selected item
    populateFormWithItem(item);

    // Close multi-item modal
    setShowMultiItemModal(false);
    setMultiItemSummary([]);
  };

  const handleVoiceStart = () => {
    setShowVoiceModal(true);
    resetTranscript();
    setVoiceSuggestions(getVoiceSuggestions(""));
    startListening();

    // Track voice modal opens for onboarding hints
    if (typeof window !== "undefined") {
      const count = parseInt(
        localStorage.getItem("voiceModalOpenCount") || "0",
        10,
      );
      localStorage.setItem("voiceModalOpenCount", String(count + 1));
      if (count + 1 >= 3) {
        setShowVoiceHint(false);
      }
    }
  };

  const handleVoiceStop = () => {
    stopListening();
  };

  // Helper to populate form with a single item
  const populateFormWithItem = (
    item: ParsedOrderWithConfidence["items"][0],
  ) => {
    // Pre-fill article code if confident
    if (
      item.articleCode &&
      item.articleCodeConfidence &&
      item.articleCodeConfidence > 0.5
    ) {
      setProductSearch(item.articleCode);
      // Trigger product autocomplete search
    }

    // Pre-fill quantity if available
    if (item.quantity) {
      setNewItem((prev) => ({ ...prev, quantity: item.quantity }));
    }

    // Mark fields as voice-populated
    setVoicePopulatedFields((prev) => ({
      ...prev,
      article: !!(
        item.articleCode &&
        item.articleCodeConfidence &&
        item.articleCodeConfidence > 0.5
      ),
      quantity: !!item.quantity,
    }));
  };

  // Helper function to apply voice data (can be called with explicit data or from state)
  const applyVoiceData = (data?: ParsedOrderWithConfidence) => {
    const dataToUse = data || parsedOrder;

    debugLog(
      "📋 Apply Voice Data",
      {
        source: data ? "closure" : "state",
        customerName: dataToUse.customerName,
        customerId: dataToUse.customerId,
        customerConfidence: dataToUse.customerNameConfidence,
        itemsCount: dataToUse.items.length,
      },
      "info",
    );

    // Pre-fill customer field
    if (
      dataToUse.customerName &&
      dataToUse.customerNameConfidence &&
      dataToUse.customerNameConfidence > 0.5
    ) {
      debugLog(
        "✅ Customer Applied to Form",
        {
          name: dataToUse.customerName,
          id: dataToUse.customerId,
          confidence: dataToUse.customerNameConfidence,
        },
        "success",
      );

      setCustomerSearch(dataToUse.customerName);
      if (dataToUse.customerId) {
        setCustomerId(dataToUse.customerId);
        setCustomerName(dataToUse.customerName);
      }
      setVoicePopulatedFields((prev) => ({ ...prev, customer: true }));
    } else {
      debugLog(
        "❌ Customer NOT Applied",
        {
          reason: !dataToUse.customerName
            ? "No customer name"
            : "Confidence too low",
          confidence: dataToUse.customerNameConfidence,
          threshold: 0.5,
        },
        "error",
      );
    }

    // Handle multiple items
    if (dataToUse.items.length > 1) {
      debugLog(
        "📦 Multiple Items Detected",
        {
          count: dataToUse.items.length,
          items: dataToUse.items.map((i) => ({
            code: i.articleCode,
            qty: i.quantity,
            confidence: i.articleCodeConfidence,
          })),
        },
        "info",
      );

      // Show multi-item summary modal
      setMultiItemSummary(dataToUse.items);
      setShowMultiItemModal(true);
    } else if (dataToUse.items.length === 1) {
      // Single item - add directly to draft items
      const item = dataToUse.items[0];

      // Only add if we have article code with good confidence
      if (
        item.articleCode &&
        item.articleCodeConfidence &&
        item.articleCodeConfidence > 0.5
      ) {
        debugLog(
          "✅ Article Added to Draft",
          {
            code: item.articleCode,
            quantity: item.quantity || 1,
            confidence: item.articleCodeConfidence,
          },
          "success",
        );

        const newDraftItem: OrderItem = {
          articleCode: item.articleCode,
          description: item.articleCode, // Will be populated by bot
          quantity: item.quantity || 1,
          price: 0, // Will be set by backend
          discount: 0,
        };

        setDraftItems((prev) => [...prev, newDraftItem]);
      } else {
        debugLog(
          "⚠️ Low Confidence Article",
          {
            code: item.articleCode,
            confidence: item.articleCodeConfidence,
            action: "Populate form for manual review",
          },
          "warning",
        );

        // Low confidence - populate form for manual review
        populateFormWithItem(item);
      }
    } else {
      debugLog(
        "ℹ️ No Items in Voice Input",
        {
          customerOnly: !!dataToUse.customerName,
        },
        "info",
      );
    }

    // Always clear state for next input (keep modal open for continuous dictation)
    debugLog(
      "🧹 Modal State Reset",
      {
        action: "Clear transcript and validations for next input",
      },
      "info",
    );

    resetTranscript();
    setParsedOrder({ items: [] });
    setArticleValidation(null);
    setArticleManuallySelected(false);
    setCustomerValidation(null);
    setCustomerManuallySelected(false);
    setIsFinalTranscript(false);
    setVoiceSuggestions([]);
  };

  const handleVoiceApply = () => {
    applyVoiceData();
  };

  const handleVoiceClear = () => {
    resetTranscript();
    setParsedOrder({ items: [] });
    setVoiceSuggestions(getVoiceSuggestions(""));
    setIsFinalTranscript(false);
    setCustomerValidation(null);
    setCustomerManuallySelected(false);
    setArticleValidation(null);
    setArticleManuallySelected(false);
    // Keep modal open for re-recording
  };

  const handleVoiceCancel = () => {
    setShowVoiceModal(false);
    resetTranscript();
    stopListening();
    setCustomerValidation(null);
    setCustomerManuallySelected(false);
    setArticleValidation(null);
    setArticleManuallySelected(false);
  };

  // Handle manual edit of voice-populated fields
  const handleEditField = (field: "customer" | "article" | "quantity") => {
    // Clear voice-populated indicator
    setVoicePopulatedFields((prev) => ({ ...prev, [field]: false }));

    // Focus the appropriate input
    if (field === "customer" && customerInputRef.current) {
      customerInputRef.current.focus();
    } else if (field === "article" && productInputRef.current) {
      productInputRef.current.focus();
    }
    // Note: quantity input focus is handled inline since we don't have a ref for it
  };

  // Check if we have at least one high-confidence entity for "Review & Apply" button
  const hasHighConfidenceEntity =
    (parsedOrder.customerNameConfidence &&
      parsedOrder.customerNameConfidence > 0.5) ||
    (parsedOrder.items.length > 0 &&
      parsedOrder.items[0].articleCodeConfidence &&
      parsedOrder.items[0].articleCodeConfidence > 0.5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Form submission is now handled by the confirmation modal
    // This prevents accidental submission via Enter key
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Cache Freshness Indicator */}
      {cacheAge !== null && (
        <div
          style={{
            fontSize: "12px",
            color: cacheStale ? "#f57c00" : "#666",
            marginBottom: "8px",
            padding: "8px 12px",
            backgroundColor: cacheStale ? "#fff3e0" : "#f5f5f5",
            borderRadius: "4px",
            border: `1px solid ${cacheStale ? "#ffb74d" : "#e0e0e0"}`,
          }}
        >
          {cacheStale ? "⚠️" : "ℹ️"} Dati aggiornati {Math.round(cacheAge)} ore
          fa
          {cacheStale && " (aggiornamento consigliato)"}
        </div>
      )}

      {/* Voice Input Modal */}
      {showVoiceModal && (
        <div className="voice-modal-overlay" onClick={handleVoiceCancel}>
          <div className="voice-modal" onClick={(e) => e.stopPropagation()}>
            <div className="voice-modal-header">
              <h2>🎤 Dettatura Ordine</h2>
              <button
                type="button"
                className="voice-close"
                onClick={handleVoiceCancel}
              >
                ×
              </button>
            </div>

            <div className="voice-modal-body">
              {/* First-use hint */}
              {showVoiceHint && (
                <div className="onboarding-hint">
                  💡 <strong>Tip:</strong> Speak clearly, then review the
                  populated fields before confirming
                </div>
              )}

              {/* Listening indicator */}
              <div
                className={`voice-indicator ${isListening ? "listening" : ""}`}
              >
                <div className="voice-pulse" />
                <div className="voice-status">
                  {isListening ? "🎙️ In ascolto..." : "⏸️ In pausa"}
                </div>
              </div>

              {/* Confidence Meter */}
              {transcript && (
                <ConfidenceMeter
                  confidence={
                    parsedOrder.items.length > 0
                      ? (parsedOrder.customerNameConfidence || 0.5) * 0.4 +
                        (parsedOrder.items[0].articleCodeConfidence || 0.5) *
                          0.4 +
                        (parsedOrder.items[0].quantityConfidence || 0.5) * 0.2
                      : parsedOrder.customerNameConfidence || 0.5
                  }
                  label="Confidenza riconoscimento"
                />
              )}

              {/* Transcript with Entity Highlighting */}
              {transcript ? (
                <TranscriptDisplay
                  transcript={transcript}
                  parsedOrder={parsedOrder}
                  isFinal={isFinalTranscript}
                />
              ) : (
                <div className="voice-transcript">Inizia a parlare...</div>
              )}

              {/* Validation Status */}
              <ValidationStatus
                status={validationStatus}
                message={
                  validationStatus === "validating"
                    ? "Validazione in corso..."
                    : validationStatus === "success"
                      ? "Dati validi"
                      : validationStatus === "error"
                        ? "Errore di validazione"
                        : undefined
                }
              />

              {/* Error */}
              {voiceError && <div className="voice-error">⚠️ {voiceError}</div>}

              {/* Customer Validation Results */}
              {customerValidation &&
                customerValidation.suggestions.length > 0 && (
                  <SmartSuggestions
                    validationResult={{
                      matchType: "fuzzy",
                      confidence: customerValidation.confidence,
                      suggestions: customerValidation.suggestions.map((s) => ({
                        code: s.name,
                        confidence: s.confidence * 100,
                        reason: "fuzzy_match",
                        packageInfo: s.vatNumber
                          ? `P.IVA: ${s.vatNumber}`
                          : undefined,
                      })),
                      error:
                        customerValidation.matchType === "not_found"
                          ? customerValidation.error
                          : "Cliente simile a:",
                    }}
                    suggestions={[]}
                    priority="high"
                    onSuggestionClick={(customerName) => {
                      const customer = customerValidation.suggestions.find(
                        (s) => s.name === customerName,
                      );
                      if (customer) {
                        setParsedOrder((prev) => ({
                          ...prev,
                          customerName: customer.name,
                          customerId: customer.id,
                        }));
                        setCustomerManuallySelected(true);
                      }
                    }}
                  />
                )}

              {/* Article Validation Results */}
              {articleValidation && (
                <SmartSuggestions
                  validationResult={articleValidation}
                  suggestions={[]}
                  priority="high"
                  onSuggestionClick={(articleCode) => {
                    setParsedOrder((prev) => ({
                      ...prev,
                      items: prev.items.map((item, idx) =>
                        idx === 0
                          ? {
                              ...item,
                              articleCode,
                            }
                          : item,
                      ),
                    }));
                    setArticleManuallySelected(true);
                  }}
                />
              )}

              {/* Smart Suggestions */}
              {voiceSuggestions.length > 0 && (
                <SmartSuggestions
                  suggestions={voiceSuggestions}
                  priority={voiceSuggestions.length > 2 ? "high" : "low"}
                />
              )}

              {/* Workflow Guide */}
              <div
                className="voice-workflow-guide"
                style={{
                  marginBottom: "1rem",
                  padding: "1rem",
                  backgroundColor: "#f9fafb",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                }}
              >
                <strong>📋 Come Funziona (Step-by-Step)</strong>
                <ol
                  style={{
                    marginTop: "0.5rem",
                    marginLeft: "1.25rem",
                    fontSize: "0.875rem",
                    lineHeight: "1.75",
                  }}
                >
                  <li>
                    <strong>Tap microfono</strong> → Modal si apre, ascolto
                    inizia
                  </li>
                  <li>
                    <strong>Dettare ordine</strong> → Parla chiaramente:
                    cliente, articoli, quantità
                  </li>
                  <li>
                    <strong>Attendere feedback</strong> → Sistema mostra
                    riconoscimento in tempo reale
                  </li>
                  <li>
                    <strong>Verificare bozza</strong> → Controlla cliente e
                    articoli riconosciuti
                  </li>
                  <li>
                    <strong>Correggere se necessario</strong> → Usa comandi o
                    tap per modifiche
                  </li>
                  <li>
                    <strong>Confermare</strong> → Tap "Conferma" quando tutto è
                    corretto
                  </li>
                </ol>

                <div style={{ marginTop: "1rem" }}>
                  <strong>🎤 Comandi Vocali Disponibili</strong>
                  <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <strong>"conferma ordine"</strong> → Conferma la bozza e
                      procede con l'invio
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#6b7280",
                          marginLeft: "1rem",
                        }}
                      >
                        • Quando: dopo aver verificato che tutto è corretto
                        <br />• Risultato: modal si chiude, ordine viene
                        processato
                      </div>
                    </div>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <strong>"annulla"</strong> → Cancella la bozza corrente e
                      ricomincia
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#6b7280",
                          marginLeft: "1rem",
                        }}
                      >
                        • Quando: se vuoi ripartire da zero
                        <br />• Risultato: bozza svuotata, pronto per nuovo
                        dettato
                      </div>
                    </div>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <strong>"riprova"</strong> → Cancella e riavvia il
                      riconoscimento
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#6b7280",
                          marginLeft: "1rem",
                        }}
                      >
                        • Quando: se il sistema ha capito male
                        <br />• Risultato: modal resta aperto, può ridettare
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "1rem",
                    paddingTop: "0.75rem",
                    borderTop: "1px solid #e5e7eb",
                  }}
                >
                  <strong>💡 Consigli</strong>
                  <ul
                    style={{
                      marginTop: "0.25rem",
                      marginLeft: "1.25rem",
                      fontSize: "0.875rem",
                      lineHeight: "1.75",
                    }}
                  >
                    <li>Parlare in ambiente silenzioso</li>
                    <li>Scandire bene i numeri degli articoli</li>
                    <li>Fare pause tra "virgola" e prossimo articolo</li>
                    <li>Verificare sempre prima di confermare</li>
                  </ul>
                </div>
              </div>

              {/* Error Recovery Instructions */}
              <div
                className="voice-error-recovery"
                style={{
                  marginBottom: "1rem",
                  padding: "1rem",
                  backgroundColor: "#fef3c7",
                  borderRadius: "0.5rem",
                  border: "1px solid #fbbf24",
                }}
              >
                <strong>🔧 Cosa Fare Se...</strong>

                <div style={{ marginTop: "0.75rem", fontSize: "0.875rem" }}>
                  <div style={{ marginBottom: "0.75rem" }}>
                    <strong style={{ color: "#d97706" }}>
                      Cliente sbagliato riconosciuto:
                    </strong>
                    <ol
                      style={{
                        marginTop: "0.25rem",
                        marginLeft: "1.25rem",
                        lineHeight: "1.5",
                      }}
                    >
                      <li>Usa comando "riprova"</li>
                      <li>Ri-detta nome cliente più lentamente</li>
                      <li>
                        Oppure: tap su campo cliente per editare manualmente
                      </li>
                    </ol>
                  </div>

                  <div style={{ marginBottom: "0.75rem" }}>
                    <strong style={{ color: "#d97706" }}>
                      Articolo sbagliato o mancante:
                    </strong>
                    <ol
                      style={{
                        marginTop: "0.25rem",
                        marginLeft: "1.25rem",
                        lineHeight: "1.5",
                      }}
                    >
                      <li>
                        Tap sulla riga dell'articolo per modificare codice
                      </li>
                      <li>Oppure: usa "annulla" e ri-detta ordine completo</li>
                      <li>
                        Ricorda: usa "punto" per separatori e "novecento" per
                        900
                      </li>
                    </ol>
                  </div>

                  <div style={{ marginBottom: "0.75rem" }}>
                    <strong style={{ color: "#d97706" }}>
                      Quantità errata:
                    </strong>
                    <ol
                      style={{
                        marginTop: "0.25rem",
                        marginLeft: "1.25rem",
                        lineHeight: "1.5",
                      }}
                    >
                      <li>Tap sul campo quantità per correggere</li>
                      <li>
                        Non serve ri-dettare tutto, modifica solo il valore
                      </li>
                    </ol>
                  </div>

                  <div style={{ marginBottom: "0.75rem" }}>
                    <strong style={{ color: "#d97706" }}>
                      Riconoscimento non parte:
                    </strong>
                    <ol
                      style={{
                        marginTop: "0.25rem",
                        marginLeft: "1.25rem",
                        lineHeight: "1.5",
                      }}
                    >
                      <li>Controlla permessi microfono nel browser</li>
                      <li>Tap di nuovo sull'icona microfono</li>
                      <li>Verifica che browser supporti Web Speech API</li>
                    </ol>
                  </div>

                  <div>
                    <strong style={{ color: "#d97706" }}>
                      Sistema non capisce:
                    </strong>
                    <ul
                      style={{
                        marginTop: "0.25rem",
                        marginLeft: "1.25rem",
                        lineHeight: "1.5",
                      }}
                    >
                      <li>Parla più lentamente</li>
                      <li>Scandisci digit-by-digit per articoli</li>
                      <li>Evita rumori di fondo</li>
                      <li>Usa "riprova" per nuovo tentativo</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Examples with Real Article Formats */}
              <div className="voice-example">
                <strong>📝 Esempi Pratici:</strong>

                <div style={{ marginTop: "0.75rem" }}>
                  <div style={{ marginBottom: "0.75rem" }}>
                    <strong>Esempio 1: Ordine Singolo</strong>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "#6b7280",
                        marginTop: "0.25rem",
                      }}
                    >
                      "Cliente Mario Rossi, articolo ti di uno due sette due
                      punto tre uno quattro quantità due"
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#10b981",
                        marginTop: "0.25rem",
                      }}
                    >
                      → Cliente: Mario Rossi | Articolo: TD1272.314 | Quantità:
                      2
                    </div>
                  </div>

                  <div style={{ marginBottom: "0.75rem" }}>
                    <strong>Esempio 2: Articolo con Lettere e Numeri</strong>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "#6b7280",
                        marginTop: "0.25rem",
                      }}
                    >
                      "Cliente ACME S.P.A., articolo acca uno due nove effe esse
                      cu punto uno zero quattro punto zero due tre quantità
                      cinque"
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#10b981",
                        marginTop: "0.25rem",
                      }}
                    >
                      → Cliente: ACME S.P.A. | Articolo: H129FSQ.104.023 |
                      Quantità: 5
                    </div>
                  </div>

                  <div style={{ marginBottom: "0.5rem" }}>
                    <strong>
                      Esempio 3: Articolo con Spazi (senza "punto")
                    </strong>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "#6b7280",
                        marginTop: "0.25rem",
                      }}
                    >
                      "articolo acca sette uno uno zero quattro zero due tre
                      quantità quindici"
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#10b981",
                        marginTop: "0.25rem",
                      }}
                    >
                      → Articolo: H71 104 023 | Quantità: 15
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "#9ca3af",
                    marginTop: "0.75rem",
                    paddingTop: "0.75rem",
                    borderTop: "1px solid #e5e7eb",
                  }}
                >
                  💡 <strong>Nota:</strong> "punto" = separatore (.) | Lettere e
                  numeri pronunciati separatamente | Gli spazi vengono
                  riconosciuti automaticamente
                </div>
              </div>

              {/* Voice Commands Legend */}
              <div className="voice-commands-legend">
                <strong>📢 Comandi Vocali:</strong>
                <div className="voice-commands-grid">
                  <div className="voice-command-group">
                    <span className="command-label">✓ Applica:</span>
                    <span className="command-keywords">
                      applica, conferma, vai, invia
                    </span>
                  </div>
                  <div className="voice-command-group">
                    <span className="command-label">🔄 Riprova:</span>
                    <span className="command-keywords">
                      riprova, ripeti, ricomincia, di nuovo
                    </span>
                  </div>
                  <div className="voice-command-group">
                    <span className="command-label">✕ Chiudi:</span>
                    <span className="command-keywords">
                      basta, finito, chiudi, annulla, esci, stop
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recognition Summary */}
            {transcript && isFinalTranscript && (
              <div className="voice-summary">
                {parsedOrder.customerName && (
                  <span className="voice-summary-item">
                    ✓ Cliente: {parsedOrder.customerName} (
                    {Math.round(
                      (parsedOrder.customerNameConfidence || 0) * 100,
                    )}
                    %)
                  </span>
                )}
                {parsedOrder.items.length > 0 && (
                  <>
                    {parsedOrder.items[0].articleCode && (
                      <span className="voice-summary-item">
                        ✓ Articolo: {parsedOrder.items[0].articleCode} (
                        {Math.round(
                          (parsedOrder.items[0].articleCodeConfidence || 0) *
                            100,
                        )}
                        %)
                      </span>
                    )}
                    {parsedOrder.items[0].quantity && (
                      <span className="voice-summary-item">
                        ✓ Quantità: {parsedOrder.items[0].quantity}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Customer Suggestions (fuzzy matching) */}
            {customerValidation && (
              <CustomerSuggestions
                validationResult={customerValidation}
                onSuggestionClick={(customerId, customerName) => {
                  // Apply selected suggestion to form
                  setCustomerId(customerId);
                  setCustomerName(customerName);
                  setCustomerSearch(customerName);
                  setVoicePopulatedFields((prev) => ({
                    ...prev,
                    customer: true,
                  }));
                  // Update parsed order with selected customer
                  setParsedOrder((prev) => ({
                    ...prev,
                    customerId,
                    customerName,
                    customerNameConfidence: 1.0, // User confirmed, so confidence is 100%
                  }));
                  // Clear validation to hide suggestions
                  setCustomerValidation(null);
                  // Mark customer as manually selected to prevent re-validation
                  setCustomerManuallySelected(true);
                }}
              />
            )}

            {/* Article Suggestions (fuzzy matching) */}
            {articleValidation && (
              <SmartSuggestions
                validationResult={articleValidation}
                suggestions={[]}
                priority="high"
                onSuggestionClick={(articleCode) => {
                  // Apply selected suggestion to form
                  setNewItem((prev) => ({ ...prev, articleCode }));
                  setProductSearch(articleCode);
                  setVoicePopulatedFields((prev) => ({
                    ...prev,
                    article: true,
                  }));
                  // Update parsed order with selected article
                  setParsedOrder((prev) => ({
                    ...prev,
                    items: prev.items.map((item, idx) =>
                      idx === 0
                        ? {
                            ...item,
                            articleCode,
                            articleCodeConfidence: 1.0, // User confirmed
                          }
                        : item,
                    ),
                  }));
                  // Clear validation to hide suggestions
                  setArticleValidation(null);
                  // Mark article as manually selected to prevent re-validation
                  setArticleManuallySelected(true);
                }}
              />
            )}

            <div className="voice-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={isListening ? handleVoiceStop : startListening}
              >
                {isListening ? "⏸️ Pausa" : "▶️ Riprendi"}
              </button>
              {transcript && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleVoiceClear}
                  >
                    🔄 Clear & Retry
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleVoiceApply}
                    disabled={!hasHighConfidenceEntity}
                  >
                    ✓ Review & Apply
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Voice Input Button */}
      {isSupported && (
        <button
          type="button"
          className="btn btn-voice"
          onClick={handleVoiceStart}
          disabled={loading}
          title="🎤 Voice Input: Speak your order, then review and confirm"
        >
          🎤 Dettatura Completa Ordine
        </button>
      )}

      <div className="card">
        <h2 className="card-title">👤 Cliente</h2>

        <div className="form-group">
          <label className="form-label">
            Cerca Cliente
            {voicePopulatedFields.customer && (
              <VoicePopulatedBadge
                confidence={parsedOrder.customerNameConfidence}
                onEdit={() => handleEditField("customer")}
              />
            )}
          </label>
          <div className="autocomplete-container">
            <input
              ref={customerInputRef}
              type="text"
              className="form-input"
              value={customerSearch}
              onChange={handleCustomerSearchChange}
              onFocus={() => {
                if (customers.length > 0) {
                  setShowCustomerDropdown(true);
                }
              }}
              onClick={() => {
                if (customers.length > 0) {
                  setShowCustomerDropdown(true);
                }
              }}
              placeholder={
                loadingCustomers
                  ? "Caricamento clienti..."
                  : "Cerca per nome o codice"
              }
              disabled={loadingCustomers}
              autoComplete="off"
            />

            {showCustomerDropdown &&
              customers.length > 0 &&
              filteredCustomers.length > 0 && (
                <div
                  className="autocomplete-dropdown"
                  ref={customerDropdownRef}
                >
                  {filteredCustomers.slice(0, 10).map((customer) => (
                    <div
                      key={customer.id}
                      className="autocomplete-item"
                      onClick={() => handleCustomerSelect(customer)}
                    >
                      <div className="autocomplete-item-name">
                        {customer.name}
                      </div>
                      <div className="autocomplete-item-id">
                        ID: {customer.id}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        {customerId && (
          <div className="customer-selected">
            ✅ Cliente selezionato: <strong>{customerName}</strong> (ID:{" "}
            {customerId})
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">📦 Nuovo Articolo</h2>

        <div className="form-group">
          <label className="form-label">
            Nome Articolo
            {voicePopulatedFields.article && (
              <VoicePopulatedBadge
                confidence={parsedOrder.items[0]?.articleCodeConfidence}
                onEdit={() => handleEditField("article")}
              />
            )}
          </label>
          <div className="autocomplete-container">
            <input
              ref={productInputRef}
              type="text"
              className="form-input"
              value={productSearch}
              onChange={handleProductSearchChange}
              placeholder={
                loadingProducts
                  ? "Caricamento..."
                  : "Digita per cercare prodotto (min 2 caratteri)"
              }
              disabled={loadingProducts}
              autoComplete="off"
            />

            {showProductDropdown && filteredProducts.length > 0 && (
              <div className="autocomplete-dropdown" ref={productDropdownRef}>
                {filteredProducts.slice(0, 10).map((product) => (
                  <div
                    key={product.id}
                    className="autocomplete-item"
                    onClick={() => handleProductSelect(product)}
                  >
                    <div className="autocomplete-item-name">
                      {product.name}
                      {product.price && product.price > 0 && (
                        <span className="product-price-badge">
                          €{product.price.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="autocomplete-item-id">
                      ID: {product.id}
                      {product.packageContent && (
                        <span className="package-badge">
                          📦 {product.packageContent} colli
                        </span>
                      )}
                      {product.description &&
                        ` - ${product.description.substring(0, 50)}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {newItem.articleCode && (
          <div className="customer-selected">
            ✅ Prodotto selezionato: <strong>{newItem.productName}</strong> (ID:{" "}
            {newItem.articleCode})
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Descrizione (opzionale)</label>
          <input
            type="text"
            className="form-input"
            value={newItem.description}
            onChange={(e) =>
              setNewItem({ ...newItem, description: e.target.value })
            }
            placeholder="Descrizione aggiuntiva"
          />
        </div>

        <div className="form-group">
          <label className="form-label">
            Quantità
            {voicePopulatedFields.quantity && (
              <VoicePopulatedBadge
                confidence={parsedOrder.items[0]?.quantityConfidence}
                onEdit={() => handleEditField("quantity")}
              />
            )}
          </label>
          <input
            type="number"
            className="form-input"
            value={newItem.quantity}
            onChange={(e) => {
              let qty = parseInt(e.target.value) || 0;

              // Enforce constraints client-side
              if (packageConstraints) {
                // Round to nearest valid multiple
                const multiple = packageConstraints.multipleQty;
                qty = Math.round(qty / multiple) * multiple;

                // Enforce minimum
                if (qty < packageConstraints.minQty) {
                  qty = packageConstraints.minQty;
                }

                // Enforce maximum
                if (
                  packageConstraints.maxQty &&
                  qty > packageConstraints.maxQty
                ) {
                  qty = packageConstraints.maxQty;
                }
              }

              setNewItem({
                ...newItem,
                quantity: qty,
              });

              // Clear voice-populated indicator on manual edit
              setVoicePopulatedFields((prev) => ({ ...prev, quantity: false }));
            }}
            onBlur={(e) => {
              // Re-validate on blur to ensure constraints are met
              let qty = parseInt(e.target.value) || 0;

              if (packageConstraints) {
                if (qty < packageConstraints.minQty) {
                  qty = packageConstraints.minQty;
                }

                const multiple = packageConstraints.multipleQty;
                qty = Math.round(qty / multiple) * multiple;

                if (
                  packageConstraints.maxQty &&
                  qty > packageConstraints.maxQty
                ) {
                  qty = packageConstraints.maxQty;
                }

                setNewItem({
                  ...newItem,
                  quantity: qty,
                });
              }
            }}
            min={packageConstraints?.minQty || 1}
            step={packageConstraints?.multipleQty || 1}
            max={packageConstraints?.maxQty}
          />
          {packageConstraints && (
            <div className="package-hint">
              📦 Confezione da {packageConstraints.multipleQty} colli
              {packageConstraints.minQty > 1 &&
                ` • Minimo: ${packageConstraints.minQty}`}
              {packageConstraints.maxQty &&
                ` • Massimo: ${packageConstraints.maxQty}`}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Prezzo Unitario (€)</label>
          <input
            type="number"
            className="form-input"
            value={newItem.price}
            onChange={(e) =>
              setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0 })
            }
            min="0"
            step="0.01"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Sconto (%)</label>
          <input
            type="number"
            className="form-input"
            value={newItem.discount}
            onChange={(e) =>
              setNewItem({
                ...newItem,
                discount: parseFloat(e.target.value) || 0,
              })
            }
            min="0"
            max="100"
            step="0.1"
            placeholder="es. 10 per 10%"
          />
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleAddItem}
        >
          ➕ Aggiungi Articolo
        </button>
      </div>

      {/* Draft Items Section */}
      {draftItems.length > 0 && (
        <div className="card">
          <h2 className="card-title">
            📋 Items to Order ({draftItems.length})
          </h2>
          <div className="onboarding-hint" style={{ marginBottom: "1rem" }}>
            💡 Review your items before creating the order
          </div>
          <div className="items-list">
            {draftItems.map((item, index) => (
              <div key={index} className="item-card">
                <div className="item-header">
                  <span className="item-code">
                    {item.productName || item.articleCode}
                  </span>
                  <button
                    type="button"
                    className="item-remove"
                    onClick={() => handleRemoveDraftItem(index)}
                  >
                    ×
                  </button>
                </div>
                <div className="item-details">
                  {item.productName && <div>Codice: {item.articleCode}</div>}
                  {item.description && <div>{item.description}</div>}
                  <div>
                    Quantità: {item.quantity} • €{item.price.toFixed(2)}
                    {item.discount &&
                      item.discount > 0 &&
                      ` • Sconto: ${item.discount}%`}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowConfirmModal(true)}
            style={{ marginTop: "1rem" }}
          >
            🚀 Create Order ({draftItems.length} items)
          </button>
        </div>
      )}

      {/* Multi-Item Selection Modal */}
      {showMultiItemModal && (
        <div
          className="voice-modal-overlay"
          onClick={() => setShowMultiItemModal(false)}
        >
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Multiple Items Detected</h2>
            <div className="confirm-modal-body">
              <p style={{ marginBottom: "1rem", color: "#6b7280" }}>
                Voice input contains {multiItemSummary.length} items. Select
                which items to apply:
              </p>
              <div className="multi-item-list">
                {multiItemSummary.map((item, index) => (
                  <div key={index} className="multi-item-card">
                    <div className="multi-item-info">
                      <div className="multi-item-code">
                        {item.articleCode || "Unknown"}
                      </div>
                      <div className="multi-item-details">
                        Quantity: {item.quantity || 1}
                        {item.articleCodeConfidence && (
                          <span className="multi-item-confidence">
                            {" "}
                            • {Math.round(item.articleCodeConfidence * 100)}%
                            confidence
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleApplySelectedItem(index)}
                    >
                      Apply
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="confirm-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowMultiItemModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApplyAllItems}
              >
                ✓ Apply All Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="voice-modal-overlay"
          onClick={() => setShowConfirmModal(false)}
        >
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Salva Bozza</h2>
            <div className="onboarding-hint" style={{ marginBottom: "1rem" }}>
              💡 La bozza verrà salvata localmente. Potrai inviarla ad Archibald
              dalla sezione "Bozze"
            </div>
            <div className="confirm-modal-body">
              <div className="confirm-section">
                <strong>Customer:</strong> {customerName || "Not specified"}
              </div>
              <div className="confirm-section">
                <strong>Items ({draftItems.length}):</strong>
                <div className="confirm-items-list">
                  {draftItems.map((item, i) => (
                    <div key={i} className="confirm-item">
                      <span className="confirm-item-name">
                        {item.productName || item.articleCode}
                      </span>
                      <span className="confirm-item-qty">
                        Qty: {item.quantity}
                      </span>
                      <span className="confirm-item-price">
                        €{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {draftItems.length > 0 &&
                (() => {
                  const pricing = calculatePricing();
                  return (
                    <>
                      <div className="confirm-pricing">
                        <div className="pricing-row">
                          <span>Subtotale (senza IVA):</span>
                          <span>€{pricing.subtotalItems.toFixed(2)}</span>
                        </div>
                        {pricing.discountPercent > 0 && (
                          <div className="pricing-row pricing-discount">
                            <span>
                              Sconto ({pricing.discountPercent.toFixed(2)}%):
                            </span>
                            <span>
                              -€
                              {(
                                pricing.subtotalItems -
                                pricing.subtotalAfterDiscount
                              ).toFixed(2)}
                            </span>
                          </div>
                        )}
                        {pricing.discountPercent > 0 && (
                          <div className="pricing-row">
                            <span>Subtotale dopo sconto:</span>
                            <span>
                              €{pricing.subtotalAfterDiscount.toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="pricing-row">
                          <span>IVA (22%):</span>
                          <span>
                            €{(pricing.subtotalAfterDiscount * 0.22).toFixed(2)}
                          </span>
                        </div>
                        <div className="pricing-row">
                          <span>
                            Spedizione{" "}
                            {pricing.shippingBase === 0 && (
                              <span
                                style={{ color: "#10b981", fontWeight: "bold" }}
                              >
                                (GRATIS)
                              </span>
                            )}
                            :
                          </span>
                          <span>
                            {pricing.shippingBase === 0 ? (
                              <>€0.00</>
                            ) : (
                              <>€{pricing.shippingWithVAT.toFixed(2)}</>
                            )}
                          </span>
                        </div>
                        <div className="pricing-row pricing-total">
                          <strong>Totale con IVA:</strong>
                          <strong>€{pricing.totalWithVAT.toFixed(2)}</strong>
                        </div>
                      </div>

                      <div className="pricing-target-section">
                        <div className="form-group">
                          <label className="form-label">
                            💰 Totale desiderato (con IVA) - <em>Opzionale</em>
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="form-input"
                            placeholder="es. 25.00"
                            value={targetTotalWithVAT}
                            onChange={(e) =>
                              setTargetTotalWithVAT(e.target.value)
                            }
                            disabled={loading}
                          />
                          <small
                            style={{
                              color: "#6b7280",
                              display: "block",
                              marginTop: "0.25rem",
                            }}
                          >
                            Inserisci il prezzo finale desiderato. Calcoleremo
                            lo sconto necessario.
                          </small>
                          {pricingError && (
                            <div
                              style={{
                                color: "#dc2626",
                                backgroundColor: "#fef2f2",
                                padding: "0.5rem",
                                borderRadius: "4px",
                                marginTop: "0.5rem",
                                fontSize: "0.875rem",
                              }}
                            >
                              ⚠️ {pricingError}
                            </div>
                          )}
                          {!pricingError && pricing.discountPercent > 0 && (
                            <div
                              style={{
                                color: "#10b981",
                                backgroundColor: "#f0fdf4",
                                padding: "0.5rem",
                                borderRadius: "4px",
                                marginTop: "0.5rem",
                                fontSize: "0.875rem",
                              }}
                            >
                              ✓ Sconto calcolato:{" "}
                              <strong>
                                {pricing.discountPercent.toFixed(2)}%
                              </strong>{" "}
                              (verrà applicato automaticamente in Archibald)
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
            </div>
            <div className="confirm-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowConfirmModal(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmOrder}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Salvataggio...
                  </>
                ) : (
                  <>✓ Salva Bozza</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stale Cache Warning */}
      {showStaleWarning && (
        <StaleCacheWarning
          onConfirm={async () => {
            setShowStaleWarning(false);
            await submitOrder(); // User confirmed, proceed anyway
          }}
          onCancel={() => {
            setShowStaleWarning(false);
            // User cancelled, do nothing
          }}
        />
      )}

      {/* Voice Debug Panel - Only for admin users */}
      {isAdmin && (
        <VoiceDebugPanel
          logs={logs}
          onClear={clearLogs}
          onExport={exportLogs}
        />
      )}
    </form>
  );
}

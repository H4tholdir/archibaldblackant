import { useState, useEffect, useRef } from "react";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { parseVoiceOrder, getVoiceSuggestions } from "../utils/orderParser";
import type { OrderItem } from "../types/order";
import type { ParsedOrderWithConfidence } from "../utils/orderParser";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { TranscriptDisplay } from "./TranscriptDisplay";
import { ValidationStatus } from "./ValidationStatus";
import { SmartSuggestions } from "./SmartSuggestions";
import { VoicePopulatedBadge } from "./VoicePopulatedBadge";

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
  onOrderCreated: (jobId: string) => void;
}

export default function OrderForm({ onOrderCreated }: OrderFormProps) {
  const [loading, setLoading] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);

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

  // Voice-populated fields tracking
  const [voicePopulatedFields, setVoicePopulatedFields] = useState<{
    customer: boolean;
    article: boolean;
    quantity: boolean;
  }>({ customer: false, article: false, quantity: false });

  // Draft items and confirmation modal
  const [draftItems, setDraftItems] = useState<OrderItem[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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
    onResult: (finalTranscript) => {
      // Parse transcript
      const parsed = parseVoiceOrder(finalTranscript);

      // Add mock confidence scores (in real implementation, these would come from voice recognition)
      const parsedWithConfidence: ParsedOrderWithConfidence = {
        ...parsed,
        customerNameConfidence: parsed.customerName ? 0.9 : undefined,
        customerIdConfidence: parsed.customerId ? 0.9 : undefined,
        items: parsed.items.map((item) => ({
          ...item,
          articleCodeConfidence: 0.85,
          quantityConfidence: 0.95,
        })),
      };

      setParsedOrder(parsedWithConfidence);
      setIsFinalTranscript(true); // onResult is called only for final transcripts

      // Update suggestions based on what's missing
      setVoiceSuggestions(getVoiceSuggestions(finalTranscript));
    },
  });

  // Fetch customers on mount - run only once
  useEffect(() => {
    let isMounted = true;

    const fetchCustomers = async () => {
      if (customersLoaded) return; // Already loaded

      setLoadingCustomers(true);
      try {
        const response = await fetch("/api/customers");
        const data = await response.json();

        if (!isMounted) return;

        if (data.success) {
          setCustomers(data.data);
          setCustomersLoaded(true);
        } else {
          console.error("Errore dal server:", data.error);
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

    fetchCustomers();

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

  // Product search handler with dynamic fetch
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

    // If user types at least 2 characters, fetch matching products
    if (searchValue.length >= 2) {
      setLoadingProducts(true);
      setShowProductDropdown(false); // Hide while loading
      try {
        const response = await fetch(
          `/api/products?search=${encodeURIComponent(searchValue)}&limit=50`,
        );
        const data = await response.json();

        if (data.success) {
          setProducts(data.data.products);
          setShowProductDropdown(true);
          // Mantieni focus sull'input dopo il caricamento
          setTimeout(() => {
            if (productInputRef.current) {
              productInputRef.current.focus();
            }
          }, 0);
        }
      } catch (error) {
        console.error("Errore ricerca prodotti:", error);
      } finally {
        setLoadingProducts(false);
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

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleRemoveDraftItem = (index: number) => {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirmOrder = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId,
          customerName,
          items: draftItems,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onOrderCreated(data.data.jobId);
        // Clear draft items and close modal
        setDraftItems([]);
        setShowConfirmModal(false);
      } else {
        alert(`Errore: ${data.error}`);
      }
    } catch (error) {
      alert(`Errore di rete: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceStart = () => {
    setShowVoiceModal(true);
    resetTranscript();
    setVoiceSuggestions(getVoiceSuggestions(""));
    startListening();
  };

  const handleVoiceStop = () => {
    stopListening();
  };

  const handleVoiceApply = () => {
    // Pre-fill customer field
    if (
      parsedOrder.customerName &&
      parsedOrder.customerNameConfidence &&
      parsedOrder.customerNameConfidence > 0.5
    ) {
      setCustomerSearch(parsedOrder.customerName);
      // Trigger autocomplete search by setting the search value
      // The customer ID will be set when user selects from dropdown or we auto-select if exact match
    }

    // Pre-fill article fields for first item
    if (parsedOrder.items.length > 0) {
      const item = parsedOrder.items[0]; // Start with first item

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
    }

    // Mark fields as voice-populated (for visual indicator)
    setVoicePopulatedFields({
      customer:
        !!parsedOrder.customerName &&
        (parsedOrder.customerNameConfidence || 0) > 0.5,
      article:
        parsedOrder.items.length > 0 &&
        !!parsedOrder.items[0].articleCode &&
        (parsedOrder.items[0].articleCodeConfidence || 0) > 0.5,
      quantity: parsedOrder.items.length > 0 && !!parsedOrder.items[0].quantity,
    });

    // KEEP MODAL OPEN for user review
    // User will close modal manually or click "Review & Apply" again
  };

  const handleVoiceClear = () => {
    resetTranscript();
    setParsedOrder({ items: [] });
    setVoiceSuggestions(getVoiceSuggestions(""));
    setIsFinalTranscript(false);
    // Keep modal open for re-recording
  };

  const handleVoiceCancel = () => {
    setShowVoiceModal(false);
    resetTranscript();
    stopListening();
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

              {/* Smart Suggestions */}
              {voiceSuggestions.length > 0 && (
                <SmartSuggestions
                  suggestions={voiceSuggestions}
                  priority={voiceSuggestions.length > 2 ? "high" : "low"}
                />
              )}

              {/* Example */}
              <div className="voice-example">
                <strong>Esempio:</strong>
                <br />
                "Cliente Mario Rossi, articolo SF1000 quantità 5, articolo
                TD1272 punto 314 quantità 2"
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
                    <div className="autocomplete-item-name">{product.name}</div>
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

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="voice-modal-overlay"
          onClick={() => setShowConfirmModal(false)}
        >
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm Order</h2>
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
              {draftItems.length > 0 && (
                <div className="confirm-total">
                  <strong>Total:</strong> €
                  {draftItems
                    .reduce((sum, item) => sum + item.price * item.quantity, 0)
                    .toFixed(2)}
                </div>
              )}
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
                    Submitting...
                  </>
                ) : (
                  <>✓ Confirm & Submit</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

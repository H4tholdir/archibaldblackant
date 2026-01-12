import { useState, useEffect, useRef } from "react";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { parseVoiceOrder, getVoiceSuggestions } from "../utils/orderParser";
import type { OrderItem } from "../types/order";
import { getProductVariants, type Product as ApiProduct } from "../api/products";
import { PackageInfo } from "./PackageInfo";

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

  // Package variants state
  const [packageVariants, setPackageVariants] = useState<ApiProduct[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<ApiProduct | null>(
    null,
  );

  // Voice input state
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceSuggestions, setVoiceSuggestions] = useState<string[]>([]);

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
      // Update suggestions as user speaks
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

  // Fetch package variants when articleCode changes
  useEffect(() => {
    let isMounted = true;

    const fetchVariants = async () => {
      if (!newItem.articleCode) {
        setPackageVariants([]);
        setSelectedVariant(null);
        return;
      }

      try {
        const variants = await getProductVariants(newItem.articleCode);
        if (isMounted) {
          setPackageVariants(variants);
        }
      } catch (error) {
        console.error("Errore caricamento varianti:", error);
        if (isMounted) {
          setPackageVariants([]);
          setSelectedVariant(null);
        }
      }
    };

    fetchVariants();

    return () => {
      isMounted = false;
    };
  }, [newItem.articleCode]);

  // Helper function to select package variant based on quantity
  // Logic mirrors backend logic in product-db.ts:selectPackageVariant
  // - If quantity >= highest package multipleQty → select highest package
  // - Else → select lowest package that can satisfy the quantity
  const selectPackageVariant = (
    variants: ApiProduct[],
    quantity: number,
  ): ApiProduct | null => {
    if (variants.length === 0) return null;
    if (variants.length === 1) return variants[0];

    // Variants are already ordered by multipleQty DESC (highest first)
    const highestPackage = variants[0];
    const highestMultiple = highestPackage.multipleQty || 0;

    // If user wants quantity >= highest package size, use highest package
    if (quantity >= highestMultiple) {
      return highestPackage;
    }

    // Otherwise, find the smallest package that can satisfy the quantity
    // Iterate from smallest to largest (reverse order)
    for (let i = variants.length - 1; i >= 0; i--) {
      const variant = variants[i];
      const packageSize = variant.multipleQty || 0;

      // If this package size can satisfy the quantity, use it
      if (quantity >= packageSize) {
        return variant;
      }
    }

    // Fallback: use smallest package if quantity is less than all package sizes
    return variants[variants.length - 1];
  };

  // Update selected variant when quantity or variants change
  useEffect(() => {
    const selected = selectPackageVariant(packageVariants, newItem.quantity);
    setSelectedVariant(selected);
  }, [packageVariants, newItem.quantity]);

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
  };

  // Product selection handler
  const handleProductSelect = (product: Product) => {
    // Parse packageContent to get quantity (es. "1", "100", etc.)
    let autoQuantity = 1;
    if (product.packageContent) {
      const parsed = parseInt(product.packageContent);
      if (!isNaN(parsed) && parsed > 0) {
        autoQuantity = parsed;
      }
    }

    setNewItem({
      ...newItem,
      articleCode: product.name, // Usa il nome invece dell'ID
      productName: product.name,
      description: product.description || "",
      quantity: autoQuantity, // Auto-compila con CONTENUTO DELL'IMBALLAGGIO
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

    setItems([...items, { ...newItem }]);
    setNewItem({
      articleCode: "",
      productName: "",
      description: "",
      quantity: 1,
      price: 0,
      discount: 0,
    });
    setProductSearch(""); // Reset product search
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
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
    const parsed = parseVoiceOrder(transcript);

    // Apply parsed data to form
    if (parsed.customerId) setCustomerId(parsed.customerId);
    if (parsed.customerName) setCustomerName(parsed.customerName);
    if (parsed.items.length > 0) {
      setItems([...items, ...parsed.items]);
    }

    // Close modal and reset
    setShowVoiceModal(false);
    resetTranscript();
    stopListening();
  };

  const handleVoiceCancel = () => {
    setShowVoiceModal(false);
    resetTranscript();
    stopListening();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      alert("Aggiungi almeno un articolo");
      return;
    }

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
          items,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onOrderCreated(data.data.jobId);
      } else {
        alert(`Errore: ${data.error}`);
      }
    } catch (error) {
      alert(`Errore di rete: ${error}`);
    } finally {
      setLoading(false);
    }
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

              {/* Transcript */}
              <div className="voice-transcript">
                {transcript || "Inizia a parlare..."}
              </div>

              {/* Error */}
              {voiceError && <div className="voice-error">⚠️ {voiceError}</div>}

              {/* Suggestions */}
              {voiceSuggestions.length > 0 && (
                <div className="voice-suggestions">
                  <div className="voice-suggestions-title">
                    💡 Suggerimenti:
                  </div>
                  {voiceSuggestions.map((suggestion, i) => (
                    <div key={i} className="voice-suggestion">
                      • {suggestion}
                    </div>
                  ))}
                </div>
              )}

              {/* Example */}
              <div className="voice-example">
                <strong>Esempio:</strong>
                <br />
                "Cliente Mario Rossi, articolo SF1000 quantità 5, articolo
                TD1272 punto 314 quantità 2"
              </div>
            </div>

            <div className="voice-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={isListening ? handleVoiceStop : startListening}
              >
                {isListening ? "⏸️ Pausa" : "▶️ Riprendi"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleVoiceApply}
                disabled={!transcript}
              >
                ✅ Applica
              </button>
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
          <label className="form-label">Cerca Cliente</label>
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
          <label className="form-label">Nome Articolo</label>
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
          <label className="form-label">Quantità</label>
          <input
            type="number"
            className="form-input"
            value={newItem.quantity}
            onChange={(e) =>
              setNewItem({
                ...newItem,
                quantity: parseInt(e.target.value) || 0,
              })
            }
            min="1"
          />
        </div>

        {/* Package Info - shows available variants and which will be selected */}
        {newItem.articleCode && (
          <PackageInfo
            variants={packageVariants}
            selectedVariant={selectedVariant}
            quantity={newItem.quantity}
          />
        )}

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

      {items.length > 0 && (
        <div className="card">
          <h2 className="card-title">📋 Articoli ({items.length})</h2>
          <div className="items-list">
            {items.map((item, index) => (
              <div key={index} className="item-card">
                <div className="item-header">
                  <span className="item-code">
                    {item.productName || item.articleCode}
                  </span>
                  <button
                    type="button"
                    className="item-remove"
                    onClick={() => handleRemoveItem(index)}
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
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={loading || items.length === 0}
      >
        {loading ? (
          <>
            <span className="spinner" />
            Invio ordine...
          </>
        ) : (
          <>🚀 Crea Ordine</>
        )}
      </button>
    </form>
  );
}

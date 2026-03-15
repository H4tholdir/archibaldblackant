import { useState, useEffect, useRef, useCallback } from "react";
import { customerService } from "../../services/customers.service";
import { useKeyboardScroll } from "../../hooks/useKeyboardScroll";
import type { Customer } from "../../types/local-customer";

interface CustomerSelectorProps {
  onSelect: (customer: Customer) => void;
  placeholder?: string;
  disabled?: boolean;
  searchFn?: (query: string) => Promise<Customer[]>; // For testing
}

export function CustomerSelector({
  onSelect,
  placeholder = "Cerca cliente per nome...",
  disabled = false,
  searchFn = customerService.searchCustomers.bind(customerService),
}: CustomerSelectorProps) {
  const { scrollFieldIntoView } = useKeyboardScroll();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [hiddenCustomers, setHiddenCustomers] = useState<Customer[] | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [hidingProfile, setHidingProfile] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Debounced search
  useEffect(() => {
    if (selectedCustomer) return;
    if (searchQuery.length === 0) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const customers = await searchFn(searchQuery);
        setResults(customers);
        setShowDropdown(customers.length > 0);
      } catch (err) {
        setError("Errore durante la ricerca");
        console.error("[CustomerSelector] Search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [searchQuery, searchFn, selectedCustomer]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current && !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
        setShowHidden(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown || results.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) => prev < results.length - 1 ? prev + 1 : prev);
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => prev > 0 ? prev - 1 : 0);
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < results.length) handleSelect(results[highlightedIndex]);
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

  const handleSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSearchQuery(customer.name);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    setResults([]);
    setShowHidden(false);
    onSelect(customer);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);
    if (selectedCustomer && newValue !== selectedCustomer.name) setSelectedCustomer(null);
  };

  const handleHide = async (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    e.preventDefault();
    setHidingProfile(customer.id);
    try {
      await customerService.setCustomerHidden(customer.id, true);
      setResults((prev) => prev.filter((c) => c.id !== customer.id));
      setHiddenCustomers((prev) => prev ? [customer, ...prev] : [customer]);
    } catch {
      // silently ignore
    } finally {
      setHidingProfile(null);
    }
  };

  const handleRestore = async (customer: Customer) => {
    setHidingProfile(customer.id);
    try {
      await customerService.setCustomerHidden(customer.id, false);
      setHiddenCustomers((prev) => prev ? prev.filter((c) => c.id !== customer.id) : []);
    } catch {
      // silently ignore
    } finally {
      setHidingProfile(null);
    }
  };

  const handleToggleHidden = async () => {
    if (!showHidden) {
      if (hiddenCustomers === null) {
        const list = await customerService.getHiddenCustomers();
        setHiddenCustomers(list);
      }
      setShowHidden(true);
    } else {
      setShowHidden(false);
    }
  };

  const hasHidden = hiddenCustomers === null || hiddenCustomers.length > 0;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Input Field */}
      <div style={{ marginBottom: "0.5rem" }}>
        <label
          htmlFor="customer-search"
          style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.875rem" }}
        >
          Cliente
        </label>
        <input
          ref={inputRef}
          id="customer-search"
          name="customer-search-field"
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="new-password"
          data-form-type="other"
          aria-label="Cerca cliente"
          aria-autocomplete="list"
          aria-controls="customer-dropdown"
          aria-expanded={showDropdown}
          style={{
            width: "100%",
            padding: "0.5rem",
            fontSize: "1rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            outline: "none",
            ...(selectedCustomer && { borderColor: "#22c55e", backgroundColor: "#f0fdf4" }),
          }}
        />
      </div>

      {loading && <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Ricerca in corso...</div>}
      {error && <div style={{ fontSize: "0.875rem", color: "#dc2626" }}>{error}</div>}

      {/* Selected Customer Confirmation */}
      {selectedCustomer && !showDropdown && (
        <div style={{
          padding: "0.5rem", backgroundColor: "#f0fdf4",
          border: "1px solid #22c55e", borderRadius: "4px",
          fontSize: "0.875rem", color: "#15803d",
        }}>
          ✅ Cliente selezionato: <strong>{selectedCustomer.name}</strong>
        </div>
      )}

      {/* Dropdown Results */}
      {showDropdown && results.length > 0 && (
        <div
          ref={dropdownRef}
          id="customer-dropdown"
          role="listbox"
          style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            backgroundColor: "white", border: "1px solid #ccc",
            borderRadius: "4px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            zIndex: 1000, overflow: "hidden",
          }}
        >
          <div style={{ maxHeight: "260px", overflowY: "auto" }}>
            {results.map((customer, index) => (
              <div
                key={customer.id}
                role="option"
                aria-selected={index === highlightedIndex}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleSelect(customer); }}
                onMouseEnter={() => { setHighlightedIndex(index); setHoveredIndex(index); }}
                onMouseLeave={() => setHoveredIndex(-1)}
                style={{
                  padding: "0.75rem",
                  cursor: "pointer",
                  backgroundColor: index === highlightedIndex ? "#bfdbfe" : "white",
                  borderBottom: index < results.length - 1 ? "1px solid #e5e7eb" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customer.name}</div>
                  <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Codice: {customer.code}</div>
                </div>
                {hoveredIndex === index && (
                  <button
                    onClick={(e) => handleHide(e, customer)}
                    disabled={hidingProfile === customer.id}
                    title="Nascondi cliente"
                    style={{
                      padding: "2px 8px", fontSize: "11px", borderRadius: "4px",
                      border: "1px solid #fca5a5", backgroundColor: "#fff1f2",
                      color: "#dc2626", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                    }}
                  >
                    Nascondi
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Footer: mostra nascosti */}
          {hasHidden && (
            <div
              onClick={handleToggleHidden}
              style={{
                padding: "6px 12px", borderTop: "1px solid #e5e7eb",
                fontSize: "12px", color: "#6b7280", cursor: "pointer",
                backgroundColor: "#f9fafb", textAlign: "center",
              }}
            >
              {showHidden ? "▲ Nascondi nascosti" : `👁 Mostra nascosti${hiddenCustomers ? ` (${hiddenCustomers.length})` : ""}`}
            </div>
          )}

          {/* Hidden customers list */}
          {showHidden && hiddenCustomers && hiddenCustomers.length > 0 && (
            <div style={{ borderTop: "1px solid #e5e7eb", maxHeight: "160px", overflowY: "auto", backgroundColor: "#fafafa" }}>
              {hiddenCustomers.map((customer) => (
                <div
                  key={customer.id}
                  style={{
                    padding: "0.5rem 0.75rem", display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: "0.5rem",
                    borderBottom: "1px solid #f3f4f6", opacity: 0.7,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: "500", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customer.name}</div>
                    <div style={{ fontSize: "11px", color: "#9ca3af" }}>{customer.code}</div>
                  </div>
                  <button
                    onClick={() => handleRestore(customer)}
                    disabled={hidingProfile === customer.id}
                    style={{
                      padding: "2px 8px", fontSize: "11px", borderRadius: "4px",
                      border: "1px solid #86efac", backgroundColor: "#f0fdf4",
                      color: "#16a34a", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                    }}
                  >
                    Ripristina
                  </button>
                </div>
              ))}
            </div>
          )}
          {showHidden && hiddenCustomers?.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: "12px", color: "#9ca3af", backgroundColor: "#fafafa", textAlign: "center" }}>
              Nessun cliente nascosto
            </div>
          )}
        </div>
      )}
    </div>
  );
}

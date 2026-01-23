import { useState, useEffect, useRef, useCallback } from 'react';
import { customerService } from '../../services/customers.service';
import type { Customer } from '../../db/schema';

interface CustomerSelectorProps {
  onSelect: (customer: Customer) => void;
  placeholder?: string;
  disabled?: boolean;
  searchFn?: (query: string) => Promise<Customer[]>; // For testing
}

export function CustomerSelector({
  onSelect,
  placeholder = 'Cerca cliente per nome...',
  disabled = false,
  searchFn = customerService.searchCustomers.bind(customerService),
}: CustomerSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Debounced search
  useEffect(() => {
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
        const customers = await searchFn(searchQuery);
        setResults(customers);
        setShowDropdown(customers.length > 0);
      } catch (err) {
        setError('Errore durante la ricerca');
        console.error('[CustomerSelector] Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, searchFn]);

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

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown || results.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < results.length) {
            handleSelect(results[highlightedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowDropdown(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [showDropdown, results, highlightedIndex]
  );

  const handleSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSearchQuery(customer.name);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    onSelect(customer);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Input Field */}
      <div style={{ marginBottom: '0.5rem' }}>
        <label
          htmlFor="customer-search"
          style={{
            display: 'block',
            marginBottom: '0.25rem',
            fontWeight: '500',
            fontSize: '0.875rem',
          }}
        >
          Cliente
        </label>
        <input
          ref={inputRef}
          id="customer-search"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Cerca cliente"
          aria-autocomplete="list"
          aria-controls="customer-dropdown"
          aria-expanded={showDropdown}
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '1rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            outline: 'none',
            ...(selectedCustomer && {
              borderColor: '#22c55e',
              backgroundColor: '#f0fdf4',
            }),
          }}
        />
      </div>

      {/* Loading Indicator */}
      {loading && (
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Ricerca in corso...
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>
      )}

      {/* Selected Customer Confirmation */}
      {selectedCustomer && !showDropdown && (
        <div
          style={{
            padding: '0.5rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #22c55e',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#15803d',
          }}
        >
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
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: '300px',
            overflowY: 'auto',
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
          }}
        >
          {results.map((customer, index) => (
            <div
              key={customer.id}
              role="option"
              aria-selected={index === highlightedIndex}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleSelect(customer);
              }}
              style={{
                padding: '0.75rem',
                cursor: 'pointer',
                backgroundColor:
                  index === highlightedIndex ? '#f3f4f6' : 'white',
                borderBottom:
                  index < results.length - 1 ? '1px solid #e5e7eb' : 'none',
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div style={{ fontWeight: '500' }}>{customer.name}</div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Codice: {customer.code}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { subClientService } from "../../services/subclient.service";
import type { SubClient } from "../../db/schema";

interface SubClientSelectorProps {
  onSelect: (subClient: SubClient) => void;
  onClear: () => void;
  selectedSubClient: SubClient | null;
  disabled?: boolean;
}

export function SubClientSelector({
  onSelect,
  onClear,
  selectedSubClient,
  disabled = false,
}: SubClientSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SubClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (selectedSubClient) return;

    if (searchQuery.length === 0) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const subClients = await subClientService.searchSubClients(searchQuery);
        setResults(subClients);
        setShowDropdown(subClients.length > 0);
      } catch (err) {
        console.error("[SubClientSelector] Search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, selectedSubClient]);

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

  const handleSelect = (subClient: SubClient) => {
    setSearchQuery(subClient.ragioneSociale);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    setResults([]);
    onSelect(subClient);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  if (selectedSubClient) {
    return (
      <div
        style={{
          background: "#fef3c7",
          padding: "1rem",
          borderRadius: "4px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          border: "1px solid #f59e0b",
        }}
      >
        <div>
          <strong style={{ color: "#92400e" }}>Sotto-cliente:</strong>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "1rem" }}>
            {selectedSubClient.ragioneSociale}
          </p>
          <p
            style={{
              margin: "0.125rem 0 0 0",
              fontSize: "0.75rem",
              color: "#78350f",
            }}
          >
            Cod: {selectedSubClient.codice}
            {selectedSubClient.supplRagioneSociale &&
              ` - ${selectedSubClient.supplRagioneSociale}`}
          </p>
        </div>
        <button
          onClick={() => {
            setSearchQuery("");
            onClear();
          }}
          disabled={disabled}
          style={{
            padding: "0.5rem 1rem",
            background: "white",
            border: "1px solid #92400e",
            borderRadius: "6px",
            cursor: disabled ? "not-allowed" : "pointer",
            color: "#92400e",
            fontWeight: "500",
          }}
        >
          Cambia
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div style={{ marginBottom: "0.5rem" }}>
        <label
          htmlFor="subclient-search"
          style={{
            display: "block",
            marginBottom: "0.25rem",
            fontWeight: "500",
            fontSize: "0.875rem",
            color: "#92400e",
          }}
        >
          Sotto-Cliente Fresis
        </label>
        <input
          ref={inputRef}
          id="subclient-search"
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Cerca sotto-cliente per codice o nome..."
          disabled={disabled}
          autoComplete="off"
          style={{
            width: "100%",
            padding: "0.5rem",
            fontSize: "1rem",
            border: "1px solid #f59e0b",
            borderRadius: "4px",
            outline: "none",
            backgroundColor: "#fffbeb",
          }}
        />
      </div>

      {loading && (
        <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
          Ricerca sotto-clienti...
        </div>
      )}

      {showDropdown && results.length > 0 && (
        <div
          ref={dropdownRef}
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            maxHeight: "300px",
            overflowY: "auto",
            backgroundColor: "white",
            border: "1px solid #f59e0b",
            borderRadius: "4px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            zIndex: 1000,
          }}
        >
          {results.map((sc, index) => (
            <div
              key={sc.codice}
              role="option"
              aria-selected={index === highlightedIndex}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleSelect(sc);
              }}
              style={{
                padding: "0.75rem",
                cursor: "pointer",
                backgroundColor:
                  index === highlightedIndex ? "#fef3c7" : "white",
                borderBottom:
                  index < results.length - 1 ? "1px solid #e5e7eb" : "none",
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div style={{ fontWeight: "500" }}>{sc.ragioneSociale}</div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                Cod: {sc.codice}
                {sc.supplRagioneSociale && ` - ${sc.supplRagioneSociale}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { subClientService } from "../../services/subclient.service";
import { useKeyboardScroll } from "../../hooks/useKeyboardScroll";
import type { SubClient } from "../../db/schema";

interface SubClientSelectorProps {
  onSelect: (subClient: SubClient) => void;
  onClear: () => void;
  selectedSubClient: SubClient | null;
  disabled?: boolean;
  externalInputRef?: React.RefObject<HTMLInputElement | null>;
  onAfterSelect?: () => void;
}

export function SubClientSelector({
  onSelect,
  onClear,
  selectedSubClient,
  disabled = false,
  externalInputRef,
  onAfterSelect,
}: SubClientSelectorProps) {
  const { scrollFieldIntoView } = useKeyboardScroll();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SubClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const [swipeX, setSwipeX] = useState<Record<string, number>>({});
  const touchStartX = useRef(0);
  const swipingCodice = useRef<string | null>(null);
  const [confirmDeleteSubClient, setConfirmDeleteSubClient] =
    useState<SubClient | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const setInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current =
        el;
      if (externalInputRef && "current" in externalInputRef) {
        (
          externalInputRef as React.MutableRefObject<HTMLInputElement | null>
        ).current = el;
      }
    },
    [externalInputRef],
  );

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
    if (onAfterSelect) {
      setTimeout(() => onAfterSelect(), 100);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleTouchStart = (codice: string, e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    swipingCodice.current = codice;
  };

  const handleTouchMove = (codice: string, e: React.TouchEvent) => {
    if (swipingCodice.current !== codice) return;
    const diff = touchStartX.current - e.touches[0].clientX;
    const clamped = Math.max(0, Math.min(diff, 120));
    setSwipeX((prev) => ({ ...prev, [codice]: clamped }));
  };

  const handleTouchEnd = (sc: SubClient) => {
    const codice = sc.codice;
    if (swipingCodice.current !== codice) return;
    const currentX = swipeX[codice] ?? 0;
    if (currentX >= 80) {
      setConfirmDeleteSubClient(sc);
    }
    setSwipeX((prev) => ({ ...prev, [codice]: 0 }));
    swipingCodice.current = null;
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteSubClient) return;
    const codice = confirmDeleteSubClient.codice;
    try {
      await subClientService.deleteSubClient(codice);
      setResults((prev) => prev.filter((sc) => sc.codice !== codice));
    } catch (err) {
      console.error("[SubClientSelector] Delete failed:", err);
    } finally {
      setConfirmDeleteSubClient(null);
    }
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
          ref={setInputRef}
          id="subclient-search"
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
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
          {results.map((sc, index) => {
            const currentSwipeX = swipeX[sc.codice] ?? 0;
            return (
              <div
                key={sc.codice}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  borderBottom:
                    index < results.length - 1
                      ? "1px solid #e5e7eb"
                      : "none",
                }}
              >
                {currentSwipeX >= 80 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      bottom: 0,
                      width: "120px",
                      backgroundColor: "#f44336",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "14px",
                      zIndex: 1,
                    }}
                  >
                    Elimina
                  </div>
                )}
                <div
                  role="option"
                  aria-selected={index === highlightedIndex}
                  onTouchStart={(e) => handleTouchStart(sc.codice, e)}
                  onTouchMove={(e) => handleTouchMove(sc.codice, e)}
                  onTouchEnd={() => handleTouchEnd(sc)}
                  onClick={(e) => {
                    if (currentSwipeX > 0) return;
                    e.stopPropagation();
                    e.preventDefault();
                    handleSelect(sc);
                  }}
                  style={{
                    padding: "0.75rem",
                    cursor: "pointer",
                    backgroundColor:
                      index === highlightedIndex ? "#fde68a" : "white",
                    position: "relative",
                    zIndex: 2,
                    transition:
                      currentSwipeX === 0 ? "transform 0.3s ease" : "none",
                    transform: `translateX(-${currentSwipeX}px)`,
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <div style={{ fontWeight: "500" }}>{sc.ragioneSociale}</div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                    Cod: {sc.codice}
                    {sc.supplRagioneSociale &&
                      ` - ${sc.supplRagioneSociale}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmDeleteSubClient && (
        <div
          onClick={() => setConfirmDeleteSubClient(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "1.5rem",
              maxWidth: "360px",
              width: "90%",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
            }}
          >
            <h3
              style={{
                margin: "0 0 1rem 0",
                fontSize: "1.125rem",
                color: "#92400e",
              }}
            >
              Eliminare sotto-cliente?
            </h3>
            <p style={{ margin: "0 0 0.5rem 0", fontWeight: 500 }}>
              {confirmDeleteSubClient.ragioneSociale}
            </p>
            <p
              style={{
                margin: "0 0 0.25rem 0",
                fontSize: "0.875rem",
                color: "#6b7280",
              }}
            >
              Codice: {confirmDeleteSubClient.codice}
            </p>
            {confirmDeleteSubClient.supplRagioneSociale && (
              <p
                style={{
                  margin: "0 0 1rem 0",
                  fontSize: "0.875rem",
                  color: "#6b7280",
                }}
              >
                {confirmDeleteSubClient.supplRagioneSociale}
              </p>
            )}
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                marginTop: "1.25rem",
              }}
            >
              <button
                onClick={() => setConfirmDeleteSubClient(null)}
                style={{
                  flex: 1,
                  padding: "0.625rem",
                  fontSize: "1rem",
                  fontWeight: 600,
                  backgroundColor: "white",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmDelete}
                style={{
                  flex: 1,
                  padding: "0.625rem",
                  fontSize: "1rem",
                  fontWeight: 600,
                  backgroundColor: "#f44336",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

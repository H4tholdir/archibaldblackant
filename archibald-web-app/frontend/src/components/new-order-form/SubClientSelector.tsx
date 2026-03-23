import { useState, useEffect, useRef, useCallback } from "react";
import { searchSubClients, setSubClientHidden, getHiddenSubClients } from "../../api/subclients";
import { useKeyboardScroll } from "../../hooks/useKeyboardScroll";
import type { SubClient } from "../../types/sub-client";

type SubClientThemeColors = {
  background: string;
  border: string;
  labelColor: string;
  textColor: string;
};

interface SubClientSelectorProps {
  onSelect: (subClient: SubClient) => void;
  onClear: () => void;
  selectedSubClient: SubClient | null;
  disabled?: boolean;
  externalInputRef?: React.RefObject<HTMLInputElement | null>;
  onAfterSelect?: () => void;
  themeColors?: SubClientThemeColors;
}

const NEUTRAL_THEME: SubClientThemeColors = {
  background: '#f9fafb',
  border: '#e5e7eb',
  labelColor: '#374151',
  textColor: '#6b7280',
};

export function SubClientSelector({
  onSelect,
  onClear,
  selectedSubClient,
  disabled = false,
  externalInputRef,
  onAfterSelect,
  themeColors,
}: SubClientSelectorProps) {
  const colors = themeColors ?? NEUTRAL_THEME;
  const { scrollFieldIntoView } = useKeyboardScroll();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SubClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const [confirmHideSubClient, setConfirmHideSubClient] = useState<SubClient | null>(null);
  const [hidingCodice, setHidingCodice] = useState<string | null>(null);

  const [hiddenSubclients, setHiddenSubclients] = useState<SubClient[] | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [restoringCodice, setRestoringCodice] = useState<string | null>(null);

  const [hoveredCodice, setHoveredCodice] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const setInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
      if (externalInputRef && "current" in externalInputRef) {
        (externalInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
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

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const subClients = await searchSubClients(searchQuery);
        setResults(subClients);
        setShowDropdown(subClients.length > 0);
      } catch (err) {
        console.error("[SubClientSelector] Search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [searchQuery, selectedSubClient]);

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
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
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

  const handleSelect = (subClient: SubClient) => {
    setSearchQuery(subClient.ragioneSociale);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    setResults([]);
    onSelect(subClient);
    if (onAfterSelect) setTimeout(() => onAfterSelect(), 100);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleConfirmHide = async () => {
    if (!confirmHideSubClient) return;
    const sc = confirmHideSubClient;
    setHidingCodice(sc.codice);
    try {
      await setSubClientHidden(sc.codice, true);
      setResults((prev) => prev.filter((c) => c.codice !== sc.codice));
      setHiddenSubclients((prev) => prev ? [sc, ...prev] : [sc]);
    } catch (err) {
      console.error("[SubClientSelector] Hide failed:", err);
    } finally {
      setConfirmHideSubClient(null);
      setHidingCodice(null);
    }
  };

  const handleRestore = async (sc: SubClient) => {
    setRestoringCodice(sc.codice);
    try {
      await setSubClientHidden(sc.codice, false);
      setHiddenSubclients((prev) => prev ? prev.filter((c) => c.codice !== sc.codice) : []);
    } catch (err) {
      console.error("[SubClientSelector] Restore failed:", err);
    } finally {
      setRestoringCodice(null);
    }
  };

  const handleToggleHidden = async () => {
    if (!showHidden) {
      if (hiddenSubclients === null) {
        const list = await getHiddenSubClients();
        setHiddenSubclients(list);
      }
      setShowHidden(true);
    } else {
      setShowHidden(false);
    }
  };

  if (selectedSubClient) {
    return (
      <div
        style={{
          background: colors.background,
          padding: "1rem",
          borderRadius: "4px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          border: `1px solid ${colors.border}`,
          transition: "background 0.4s, border-color 0.4s",
        }}
      >
        <div>
          <strong style={{ color: colors.labelColor }}>Sotto-cliente:</strong>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "1rem" }}>
            {selectedSubClient.ragioneSociale}
          </p>
          <p style={{ margin: "0.125rem 0 0 0", fontSize: "0.75rem", color: colors.textColor }}>
            Cod: {selectedSubClient.codice}
            {selectedSubClient.supplRagioneSociale && ` - ${selectedSubClient.supplRagioneSociale}`}
          </p>
        </div>
        <button
          onClick={() => { setSearchQuery(""); onClear(); }}
          disabled={disabled}
          style={{
            padding: "0.5rem 1rem",
            background: "white",
            border: `1px solid ${colors.labelColor}`,
            borderRadius: "6px",
            cursor: disabled ? "not-allowed" : "pointer",
            color: colors.labelColor,
            fontWeight: "500",
            transition: "border-color 0.4s, color 0.4s",
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
          style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.875rem", color: "#92400e" }}
        >
          Sotto-Cliente Fresis
        </label>
        <input
          ref={setInputRef}
          id="subclient-search"
          type="search"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
          placeholder="Cerca sotto-cliente per codice o nome..."
          disabled={disabled}
          autoComplete="new-password"
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

      {loading && <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Ricerca sotto-clienti...</div>}

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
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleSelect(sc); }}
              onMouseEnter={() => { setHighlightedIndex(index); setHoveredCodice(sc.codice); }}
              onMouseLeave={() => setHoveredCodice(null)}
              style={{
                padding: "0.75rem",
                cursor: "pointer",
                backgroundColor: index === highlightedIndex ? "#fde68a" : "white",
                borderBottom: index < results.length - 1 ? "1px solid #e5e7eb" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: "0.875rem" }}>{sc.ragioneSociale}</strong>
                  <span style={{ marginLeft: "0.5rem", color: "#6b7280", fontSize: "0.75rem", flexShrink: 0 }}>
                    {sc.codice}
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.125rem" }}>
                  {sc.supplRagioneSociale && (
                    <span style={{ fontWeight: "600", color: "#374151" }}>{sc.supplRagioneSociale}</span>
                  )}
                  {(sc.indirizzo || sc.cap || sc.localita) && (
                    <span style={{ marginLeft: sc.supplRagioneSociale ? "0.75rem" : 0 }}>
                      {[sc.indirizzo, sc.cap, sc.localita && `${sc.localita}${sc.prov ? ` (${sc.prov})` : ""}`]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  )}
                  {sc.partitaIva && (
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem", color: "#9ca3af" }}>
                      P.IVA: {sc.partitaIva}
                    </span>
                  )}
                </div>
              </div>
              {hoveredCodice === sc.codice && (
                <button
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setConfirmHideSubClient(sc); }}
                  disabled={hidingCodice === sc.codice}
                  style={{
                    flexShrink: 0,
                    padding: "2px 8px",
                    background: "#fef3c7",
                    color: "#92400e",
                    border: "1px solid #fde68a",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    lineHeight: 1,
                  }}
                >
                  Nascondi
                </button>
              )}
            </div>
          ))}

          {/* Footer: mostra nascosti */}
          {(hiddenSubclients === null || hiddenSubclients.length > 0) && (
            <div
              onClick={handleToggleHidden}
              style={{
                padding: "6px 12px",
                borderTop: "1px solid #fde68a",
                fontSize: "12px",
                color: "#92400e",
                cursor: "pointer",
                backgroundColor: "#fffbeb",
                textAlign: "center",
              }}
            >
              {showHidden ? "▲ Nascondi nascosti" : `👁 Mostra nascosti${hiddenSubclients ? ` (${hiddenSubclients.length})` : ""}`}
            </div>
          )}

          {/* Hidden subclients list */}
          {showHidden && hiddenSubclients && hiddenSubclients.length > 0 && (
            <div style={{ borderTop: "1px solid #fde68a", maxHeight: "160px", overflowY: "auto", backgroundColor: "#fffbeb" }}>
              {hiddenSubclients.map((hsc) => (
                <div
                  key={hsc.codice}
                  style={{
                    padding: "0.5rem 0.75rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    borderBottom: "1px solid #fef3c7",
                    opacity: 0.7,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: "500", color: "#78350f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {hsc.ragioneSociale}
                    </div>
                    <div style={{ fontSize: "11px", color: "#92400e" }}>{hsc.codice}</div>
                  </div>
                  <button
                    onClick={() => handleRestore(hsc)}
                    disabled={restoringCodice === hsc.codice}
                    style={{
                      padding: "2px 8px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "1px solid #86efac",
                      backgroundColor: "#f0fdf4",
                      color: "#16a34a",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    Ripristina
                  </button>
                </div>
              ))}
            </div>
          )}
          {showHidden && hiddenSubclients?.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: "12px", color: "#9ca3af", backgroundColor: "#fffbeb", textAlign: "center" }}>
              Nessun sotto-cliente nascosto
            </div>
          )}
        </div>
      )}

      {confirmHideSubClient && (
        <div
          onClick={() => setConfirmHideSubClient(null)}
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
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
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", color: "#92400e" }}>
              Nascondere sotto-cliente?
            </h3>
            <p style={{ margin: "0 0 0.5rem 0", fontWeight: 500 }}>
              {confirmHideSubClient.ragioneSociale}
            </p>
            <p style={{ margin: "0 0 0.25rem 0", fontSize: "0.875rem", color: "#6b7280" }}>
              Codice: {confirmHideSubClient.codice}
            </p>
            {confirmHideSubClient.supplRagioneSociale && (
              <p style={{ margin: "0 0 1rem 0", fontSize: "0.875rem", color: "#6b7280" }}>
                {confirmHideSubClient.supplRagioneSociale}
              </p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button
                onClick={() => setConfirmHideSubClient(null)}
                style={{
                  flex: 1, padding: "0.625rem", fontSize: "1rem", fontWeight: 600,
                  backgroundColor: "white", color: "#374151",
                  border: "1px solid #d1d5db", borderRadius: "8px", cursor: "pointer",
                }}
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmHide}
                disabled={hidingCodice !== null}
                style={{
                  flex: 1, padding: "0.625rem", fontSize: "1rem", fontWeight: 600,
                  backgroundColor: "#f59e0b", color: "white",
                  border: "none", borderRadius: "8px", cursor: "pointer",
                }}
              >
                Nascondi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

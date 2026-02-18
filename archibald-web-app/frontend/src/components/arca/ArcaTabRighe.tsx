import React, { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import type { ArcaRiga } from "../../types/arca-data";
import type { Product } from "../../db/schema";
import { productService } from "../../services/products.service";
import { ArcaInput } from "./ArcaInput";
import {
  ARCA_FONT,
  arcaNavyHeader,
  arcaRowStyle,
  arcaGridCell,
  ARCA_COLORS,
  formatArcaCurrency,
} from "./arcaStyles";

const COPIED_FT_KEY = "arca_copied_ft_righe";

type ArcaTabRigheProps = {
  righe: ArcaRiga[];
  onRigaChange?: (index: number, riga: ArcaRiga) => void;
  onRemoveRiga?: (index: number) => void;
  onAddRiga?: () => void;
  onPasteRighe?: (righe: ArcaRiga[]) => void;
  revenueValue?: number | null;
  revenuePercent?: string | null;
  commissionRate?: number;
};

const RIGHE_COLUMNS = [
  { label: "N\u00B0", width: 28 },
  { label: "Codice", width: 110 },
  { label: "Descrizione Articolo", width: 200 },
  { label: "Qtà", width: 40 },
  { label: "Sconto", width: 45 },
  { label: "Prezzo Tot.", width: 80 },
  { label: "IVA", width: 32 },
];

const RIGHE_ROW_HEIGHT = 32;
const RIGHE_HEADER_HEIGHT = 34;
const RIGHE_CELL_PADDING = "4px 6px";
const RIGHE_FONT_SIZE = "11px";

const EMPTY_VISUAL_ROWS = 3;

function stripCode(desc: string, code: string): string {
  if (!code || !desc.startsWith(code)) return desc;
  return desc.slice(code.length).trimStart();
}

function buildDescription(code: string, text: string): string {
  if (!code) return text;
  return code + "   " + text;
}

function righeHeaderStyle(width: number, isLast: boolean): CSSProperties {
  return {
    ...arcaNavyHeader,
    width,
    height: RIGHE_HEADER_HEIGHT,
    padding: RIGHE_CELL_PADDING,
    fontSize: RIGHE_FONT_SIZE,
    boxSizing: "border-box",
    borderRight: isLast ? "none" : arcaNavyHeader.borderRight,
  };
}

function righeCellStyle(width: number, align?: "left" | "right" | "center", isLast?: boolean): CSSProperties {
  return {
    ...arcaGridCell(width, align),
    padding: RIGHE_CELL_PADDING,
    fontSize: RIGHE_FONT_SIZE,
    height: RIGHE_ROW_HEIGHT,
    lineHeight: `${RIGHE_ROW_HEIGHT - 8}px`,
    borderRight: isLast ? "none" : `1px solid ${ARCA_COLORS.gridBorderColLight}`,
  };
}

export function ArcaTabRighe({
  righe,
  onRigaChange,
  onRemoveRiga,
  onAddRiga,
  onPasteRighe,
  revenueValue,
  revenuePercent,
  commissionRate,
}: ArcaTabRigheProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    righe.length > 0 ? 0 : null,
  );
  const selectedRiga = selectedIndex !== null ? righe[selectedIndex] : null;

  const [copiedRiga, setCopiedRiga] = useState<ArcaRiga | null>(null);
  const [ftCopied, setFtCopied] = useState(() => localStorage.getItem(COPIED_FT_KEY) !== null);

  // Product search state
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [highlightedProductIdx, setHighlightedProductIdx] = useState(-1);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for cursor flow: Articolo → Quantità → % Sconto → new row → Articolo
  const quantityRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef<"quantity" | "article" | null>(null);
  const prevRigheLengthRef = useRef(righe.length);

  const provvPercent = commissionRate != null
    ? (commissionRate * 100).toFixed(0)
    : "18";

  useEffect(() => {
    if (productQuery.length < 2) {
      setProductResults([]);
      setShowProductDropdown(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await productService.searchProducts(productQuery, 20);
      setProductResults(results);
      setShowProductDropdown(results.length > 0);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [productQuery]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node) &&
          productInputRef.current && !productInputRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Detect new row added → select it and focus article input
  useEffect(() => {
    if (righe.length > prevRigheLengthRef.current && pendingFocusRef.current === "article") {
      const newIdx = righe.length - 1;
      setSelectedIndex(newIdx);
      setTimeout(() => {
        productInputRef.current?.focus();
        pendingFocusRef.current = null;
      }, 0);
    }
    prevRigheLengthRef.current = righe.length;
  }, [righe.length]);

  // Handle pending focus on quantity after product selection
  useEffect(() => {
    if (pendingFocusRef.current === "quantity") {
      setTimeout(() => {
        quantityRef.current?.focus();
        quantityRef.current?.select();
        pendingFocusRef.current = null;
      }, 0);
    }
  });

  const handleSelectProduct = useCallback((product: Product) => {
    if (selectedIndex == null || !onRigaChange || !selectedRiga) return;
    const articleCode = product.article || product.name || "";
    onRigaChange(selectedIndex, {
      ...selectedRiga,
      CODICEARTI: articleCode,
      DESCRIZION: product.description || product.name,
      ALIIVA: product.vat != null ? String(product.vat) : selectedRiga.ALIIVA,
      PREZZOUN: product.price ?? selectedRiga.PREZZOUN,
    });
    setProductQuery("");
    setShowProductDropdown(false);
    setHighlightedProductIdx(-1);
    setProductResults([]);
    pendingFocusRef.current = "quantity";
  }, [selectedIndex, selectedRiga, onRigaChange]);

  const handleProductKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showProductDropdown || productResults.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedProductIdx(prev => prev < productResults.length - 1 ? prev + 1 : prev);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedProductIdx(prev => prev > 0 ? prev - 1 : 0);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedProductIdx >= 0 && highlightedProductIdx < productResults.length) {
          handleSelectProduct(productResults[highlightedProductIdx]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowProductDropdown(false);
        setHighlightedProductIdx(-1);
        break;
    }
  }, [showProductDropdown, productResults, highlightedProductIdx, handleSelectProduct]);

  const handleQuantityKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      discountRef.current?.focus();
      discountRef.current?.select();
    }
  }, []);

  const handleDiscountKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      pendingFocusRef.current = "article";
      onAddRiga?.();
    }
  }, [onAddRiga]);

  const handleCopyRiga = () => {
    if (selectedRiga) {
      setCopiedRiga(JSON.parse(JSON.stringify(selectedRiga)) as ArcaRiga);
    }
  };

  const handlePasteRiga = () => {
    if (copiedRiga && selectedIndex !== null && onRigaChange) {
      onRigaChange(selectedIndex, {
        ...copiedRiga,
        NUMERORIGA: righe[selectedIndex].NUMERORIGA,
        ID: righe[selectedIndex].ID,
        ID_TESTA: righe[selectedIndex].ID_TESTA,
      });
      setCopiedRiga(null);
    }
  };

  const handleCopyFT = () => {
    localStorage.setItem(COPIED_FT_KEY, JSON.stringify(righe));
    setFtCopied(true);
  };

  const handlePasteFT = () => {
    const data = localStorage.getItem(COPIED_FT_KEY);
    if (data && onPasteRighe) {
      onPasteRighe(JSON.parse(data) as ArcaRiga[]);
      localStorage.removeItem(COPIED_FT_KEY);
      setFtCopied(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {/* Griglia righe */}
      <div style={{ border: `1px solid ${ARCA_COLORS.shapeBorder}`, maxHeight: "350px", overflowY: "auto", overflowX: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 1, minWidth: "fit-content" }}>
          {RIGHE_COLUMNS.map((col, colIdx) => (
            <div
              key={col.label || `col-${colIdx}`}
              style={righeHeaderStyle(col.width, colIdx === RIGHE_COLUMNS.length - 1)}
            >
              {col.label}
            </div>
          ))}
        </div>
        {/* Real rows */}
        {righe.map((riga, idx) => (
          <div
            key={riga.NUMERORIGA}
            onClick={() => setSelectedIndex(idx)}
            style={{
              ...arcaRowStyle(idx, idx === selectedIndex),
              display: "flex",
              alignItems: "center",
              height: RIGHE_ROW_HEIGHT,
              cursor: "pointer",
              minWidth: "fit-content",
              fontSize: RIGHE_FONT_SIZE,
            }}
          >
            <div style={righeCellStyle(28, "center")}>{riga.NUMERORIGA}</div>
            <div style={righeCellStyle(110)}>{riga.CODICEARTI}</div>
            <div style={righeCellStyle(200)}>{stripCode(riga.DESCRIZION, riga.CODICEARTI)}</div>
            <div style={righeCellStyle(40, "right")}>{riga.QUANTITA || ""}</div>
            <div style={righeCellStyle(45)}>{riga.SCONTI}</div>
            <div style={righeCellStyle(80, "right")}>
              {formatArcaCurrency(riga.PREZZOTOT)}
            </div>
            <div style={righeCellStyle(32, "center", true)}>
              {riga.ALIIVA}
            </div>
          </div>
        ))}
        {/* Empty visual rows */}
        {Array.from({ length: EMPTY_VISUAL_ROWS }, (_, i) => (
          <div
            key={`empty-${i}`}
            style={{
              ...arcaRowStyle(righe.length + i, false),
              display: "flex",
              alignItems: "center",
              height: RIGHE_ROW_HEIGHT,
              cursor: "default",
              minWidth: "fit-content",
              fontSize: RIGHE_FONT_SIZE,
            }}
          >
            <div style={righeCellStyle(28, "center")} />
            <div style={righeCellStyle(110)} />
            <div style={righeCellStyle(200)} />
            <div style={righeCellStyle(40, "right")} />
            <div style={righeCellStyle(45)} />
            <div style={righeCellStyle(80, "right")} />
            <div style={righeCellStyle(32, "center", true)} />
          </div>
        ))}
        {righe.length === 0 && (
          <div style={{ ...ARCA_FONT, padding: "8px", color: "#666" }}>
            Nessuna riga
          </div>
        )}
      </div>

      {/* Dettaglio riga selezionata */}
      {selectedRiga && (
        <div
          style={{
            border: `1px solid ${ARCA_COLORS.shapeBorder}`,
            padding: "4px 6px",
            backgroundColor: ARCA_COLORS.windowBg,
          }}
        >
          {/* Row 1: Articolo (with search), Descrizione */}
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1px", position: "relative" }}>
              <span style={{ ...ARCA_FONT, fontSize: "10px", padding: "0 1px" }}>Articolo</span>
              <input
                ref={productInputRef}
                type="text"
                value={productQuery || selectedRiga.CODICEARTI}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  setHighlightedProductIdx(-1);
                }}
                onFocus={() => {
                  setProductQuery(selectedRiga.CODICEARTI);
                }}
                onKeyDown={handleProductKeyDown}
                autoComplete="off"
                style={{
                  ...ARCA_FONT,
                  width: "120px",
                  height: "16px",
                  lineHeight: "14px",
                  borderWidth: "2px",
                  borderStyle: "solid",
                  borderColor: "#808080 #FFFFFF #FFFFFF #808080",
                  backgroundColor: "#FFFFFF",
                  padding: "1px 3px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {showProductDropdown && productResults.length > 0 && (
                <div
                  ref={productDropdownRef}
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    width: "350px",
                    maxHeight: "200px",
                    overflowY: "auto",
                    backgroundColor: "#fff",
                    border: "1px solid #ccc",
                    boxShadow: "0 4px 8px rgba(0,0,0,0.15)",
                    zIndex: 1000,
                  }}
                >
                  {productResults.map((product, pIdx) => (
                    <div
                      key={product.id}
                      onClick={() => handleSelectProduct(product)}
                      onMouseEnter={() => setHighlightedProductIdx(pIdx)}
                      style={{
                        ...ARCA_FONT,
                        padding: "3px 6px",
                        cursor: "pointer",
                        backgroundColor: pIdx === highlightedProductIdx ? "#E3F2FD" : "#fff",
                        borderBottom: pIdx < productResults.length - 1 ? "1px solid #eee" : "none",
                      }}
                    >
                      <div style={{ fontWeight: "bold" }}>{product.article || product.name}</div>
                      <div style={{ fontSize: "7pt", color: "#666" }}>{product.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <ArcaInput
              labelAbove
              label="Descrizione articolo"
              value={stripCode(selectedRiga.DESCRIZION, selectedRiga.CODICEARTI)}
              width="350px"
              readOnly={false}
              onChange={selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, {
                  ...selectedRiga,
                  DESCRIZION: buildDescription(selectedRiga.CODICEARTI, v),
                });
              } : undefined}
            />
          </div>
          {/* Row 2: Quantità, Prezzo Unitario, % Sconto, % Provvigioni, Totale */}
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "2px" }}>
            <ArcaInput
              labelAbove
              label="Quantità"
              value={selectedRiga.QUANTITA === 0 ? "" : String(selectedRiga.QUANTITA)}
              width="88px"
              align="right"
              readOnly={false}
              type="text"
              inputRef={quantityRef}
              onKeyDown={handleQuantityKeyDown}
              onChange={selectedIndex !== null ? (v) => {
                const parsed = parseFloat(v);
                onRigaChange?.(selectedIndex, { ...selectedRiga, QUANTITA: isNaN(parsed) ? 0 : parsed });
              } : undefined}
            />
            <ArcaInput
              labelAbove
              label="Prezzo Unitario"
              value={String(selectedRiga.PREZZOUN)}
              width="89px"
              align="right"
              readOnly={false}
              type="text"
              onChange={selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, PREZZOUN: parseFloat(v) || 0 });
              } : undefined}
            />
            <ArcaInput
              labelAbove
              label="% Sconto"
              value={selectedRiga.SCONTI}
              width="58px"
              align="right"
              readOnly={false}
              inputRef={discountRef}
              onKeyDown={handleDiscountKeyDown}
              onChange={selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, SCONTI: v });
              } : undefined}
            />
            <ArcaInput
              labelAbove
              label="% Provvigioni"
              value={provvPercent}
              width="67px"
              align="right"
            />
            <ArcaInput
              labelAbove
              label="Totale"
              value={formatArcaCurrency(selectedRiga.PREZZOTOT * (1 + parseFloat(selectedRiga.ALIIVA || "0") / 100))}
              width="96px"
              align="right"
              style={{ color: "#FF0000", fontWeight: "bold" }}
            />
          </div>
          {/* Row 3: Revenue box + U.M. + IVA */}
          <div style={{ display: "flex", gap: "4px", alignItems: "flex-end" }}>
            <div
              style={{
                minWidth: "160px",
                flex: 1,
                border: `1px solid ${ARCA_COLORS.shapeBorder}`,
                backgroundColor: revenueValue != null ? (revenueValue >= 0 ? "#E8F5E9" : "#FFEBEE") : "#F5F5F5",
                padding: "4px 8px",
                ...ARCA_FONT,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              {revenueValue != null ? (
                <>
                  <div style={{ fontWeight: "bold", fontSize: "9pt" }}>
                    RICAVO {"\u20AC"} {formatArcaCurrency(revenueValue)}
                    {revenuePercent && <span style={{ fontSize: "8pt" }}> ({revenuePercent}%)</span>}
                  </div>
                  <div style={{ fontSize: "7pt", color: "#666", marginTop: "2px" }}>
                    totImponibile FT - costoFresis
                  </div>
                </>
              ) : (
                <div style={{ color: "#999", fontStyle: "italic" }}>N/D</div>
              )}
            </div>
            <ArcaInput labelAbove label="U.M." value={selectedRiga.UNMISURA} width="30px" />
            <ArcaInput labelAbove label="IVA" value={selectedRiga.ALIIVA} width="30px" />
          </div>
        </div>
      )}

      {/* Button row: all on same line */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        <button onClick={() => onAddRiga?.()} style={addBtnStyle}>
          + Aggiungi riga
        </button>
        {selectedIndex !== null && (
          <button onClick={() => onRemoveRiga?.(selectedIndex)} style={deleteBtnStyle}>
            Elimina riga
          </button>
        )}
        {selectedRiga && (
          <button onClick={copiedRiga ? handlePasteRiga : handleCopyRiga} style={compactBtnStyle}>
            {copiedRiga ? "Incolla riga" : "Copia riga"}
          </button>
        )}
        <button onClick={ftCopied ? handlePasteFT : handleCopyFT} style={compactBtnStyle}>
          {ftCopied ? "Incolla FT" : "Copia FT"}
        </button>
      </div>
    </div>
  );
}

const addBtnStyle: React.CSSProperties = {
  ...ARCA_FONT,
  padding: "3px 8px",
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: "2px",
  cursor: "pointer",
};

const deleteBtnStyle: React.CSSProperties = {
  ...ARCA_FONT,
  padding: "3px 8px",
  backgroundColor: "#c62828",
  color: "#fff",
  border: "none",
  borderRadius: "2px",
  cursor: "pointer",
};

const compactBtnStyle: React.CSSProperties = {
  ...ARCA_FONT,
  padding: "3px 8px",
  border: "1px outset #D4D0C8",
  backgroundColor: "#D4D0C8",
  cursor: "pointer",
};

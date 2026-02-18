import React, { useState } from "react";
import type { ArcaRiga } from "../../types/arca-data";
import { ArcaInput } from "./ArcaInput";
import {
  ARCA_FONT,
  ARCA_GRID,
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
};

const RIGHE_COLUMNS = [
  { label: "N\u00B0", width: 24 },
  { label: "", width: 16 },
  { label: "Codice", width: 100 },
  { label: "Descrizione Articolo", width: 280 },
  { label: "Quantit\u00E0", width: 80 },
  { label: "Prezzo Totale", width: 105 },
];

const EMPTY_VISUAL_ROWS = 5;

function stripCode(desc: string, code: string): string {
  if (!code || !desc.startsWith(code)) return desc;
  return desc.slice(code.length).trimStart();
}

function buildDescription(code: string, text: string): string {
  if (!code) return text;
  return code + "   " + text;
}

export function ArcaTabRighe({
  righe,
  onRigaChange,
  onRemoveRiga,
  onAddRiga,
  onPasteRighe,
  revenueValue,
  revenuePercent,
}: ArcaTabRigheProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    righe.length > 0 ? 0 : null,
  );
  const selectedRiga = selectedIndex !== null ? righe[selectedIndex] : null;

  const [copiedRiga, setCopiedRiga] = useState<ArcaRiga | null>(null);
  const [ftCopied, setFtCopied] = useState(() => localStorage.getItem(COPIED_FT_KEY) !== null);

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
      <div style={{ border: `1px solid ${ARCA_COLORS.shapeBorder}`, maxHeight: "350px", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 1 }}>
          {RIGHE_COLUMNS.map((col, colIdx) => (
            <div
              key={col.label || `col-${colIdx}`}
              style={{
                ...arcaNavyHeader,
                width: col.width,
                boxSizing: "border-box",
                borderRight: colIdx === RIGHE_COLUMNS.length - 1 ? "none" : arcaNavyHeader.borderRight,
              }}
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
              height: ARCA_GRID.righeRowHeight,
              cursor: "pointer",
            }}
          >
            <div style={arcaGridCell(24, "center")}>{riga.NUMERORIGA}</div>
            <div style={arcaGridCell(16, "center")}>{riga.ESPLDISTIN}</div>
            <div style={arcaGridCell(100)}>{riga.CODICEARTI}</div>
            <div style={arcaGridCell(280)}>{stripCode(riga.DESCRIZION, riga.CODICEARTI)}</div>
            <div style={arcaGridCell(80, "right")}>{riga.QUANTITA}</div>
            <div style={{ ...arcaGridCell(105, "right"), borderRight: "none" }}>
              {formatArcaCurrency(riga.PREZZOTOT)}
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
              height: ARCA_GRID.righeRowHeight,
              cursor: "default",
            }}
          >
            <div style={arcaGridCell(24, "center")}></div>
            <div style={arcaGridCell(16, "center")} />
            <div style={arcaGridCell(100)} />
            <div style={arcaGridCell(280)} />
            <div style={arcaGridCell(80, "right")} />
            <div style={{ ...arcaGridCell(105, "right"), borderRight: "none" }} />
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
          {/* Row 1: Articolo, Descrizione */}
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput labelAbove label="Articolo" value={selectedRiga.CODICEARTI} width="120px" />
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
              label="Quantit\u00E0"
              value={String(selectedRiga.QUANTITA)}
              width="88px"
              align="right"
              readOnly={false}
              type="number"
              onChange={selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, QUANTITA: parseFloat(v) || 0 });
              } : undefined}
            />
            <ArcaInput
              labelAbove
              label="Prezzo Unitario"
              value={String(selectedRiga.PREZZOUN)}
              width="89px"
              align="right"
              readOnly={false}
              type="number"
              onChange={selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, PREZZOUN: parseFloat(v) || 0 });
              } : undefined}
            />
            <ArcaInput
              labelAbove
              label="% Sconto"
              value={selectedRiga.SCONTI}
              width="58px"
              readOnly={false}
              onChange={selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, SCONTI: v });
              } : undefined}
            />
            <ArcaInput labelAbove label="% Provvigioni" value={selectedRiga.PROVV} width="67px" />
            <ArcaInput
              labelAbove
              label="Totale"
              value={formatArcaCurrency(selectedRiga.PREZZOTOT)}
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
                    prezzoCliente - costoFresis
                  </div>
                </>
              ) : (
                <div style={{ color: "#999", fontStyle: "italic" }}>N/D</div>
              )}
            </div>
            <ArcaInput labelAbove label="U.M." value={selectedRiga.UNMISURA} width="30px" />
            <ArcaInput
              labelAbove
              label="IVA"
              value={selectedRiga.ALIIVA}
              width="30px"
              readOnly={false}
              onChange={selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, ALIIVA: v });
              } : undefined}
            />
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

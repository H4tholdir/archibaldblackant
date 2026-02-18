import { useState } from "react";
import type { ArcaRiga } from "../../types/arca-data";
import { ArcaInput } from "./ArcaInput";
import {
  ARCA_FONT,
  ARCA_GRID,
  arcaNavyHeader,
  arcaRowStyle,
  arcaGridCell,
  arcaLabel,
  ARCA_COLORS,
  formatArcaCurrency,
} from "./arcaStyles";

type ArcaTabRigheProps = {
  righe: ArcaRiga[];
  editing?: boolean;
  onRigaChange?: (index: number, riga: ArcaRiga) => void;
  onRemoveRiga?: (index: number) => void;
  onAddRiga?: () => void;
};

const RIGHE_COLUMNS = [
  { label: "N\u00B0", width: 21 },
  { label: "", width: 13 },
  { label: "Codice", width: 100 },
  { label: "Descrizione Articolo", width: 228 },
  { label: "Quantit\u00E0", width: 70 },
  { label: "Residuo", width: 68 },
  { label: "Prezzo Totale", width: 88 },
  { label: "N", width: 17 },
];

export function ArcaTabRighe({ righe, editing, onRigaChange, onRemoveRiga, onAddRiga }: ArcaTabRigheProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    righe.length > 0 ? 0 : null,
  );
  const selectedRiga = selectedIndex !== null ? righe[selectedIndex] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {/* Griglia righe */}
      <div style={{ border: `1px solid ${ARCA_COLORS.shapeBorder}`, maxHeight: "350px", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 1 }}>
          {RIGHE_COLUMNS.map((col, colIdx) => (
            <div
              key={col.label}
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
        {/* Rows */}
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
            <div style={arcaGridCell(21, "center")}>{riga.NUMERORIGA}</div>
            <div style={arcaGridCell(13, "center")}>{riga.ESPLDISTIN}</div>
            <div style={arcaGridCell(100)}>{riga.CODICEARTI}</div>
            <div style={arcaGridCell(228)}>{riga.DESCRIZION}</div>
            <div style={arcaGridCell(70, "right")}>{riga.QUANTITA}</div>
            <div style={arcaGridCell(68, "right")}>{riga.QUANTITARE}</div>
            <div style={arcaGridCell(88, "right")}>
              {formatArcaCurrency(riga.PREZZOTOT)}
            </div>
            <div style={{ ...arcaGridCell(17, "center"), borderRight: "none" }}>{riga.NOTE ? "X" : ""}</div>
          </div>
        ))}
        {righe.length === 0 && (
          <div style={{ ...ARCA_FONT, padding: "8px", color: "#666" }}>
            Nessuna riga
          </div>
        )}
      </div>

      {/* Dettaglio riga selezionata (2 righe, label sopra i campi come Arca) */}
      {selectedRiga && (
        <div
          style={{
            border: `1px solid ${ARCA_COLORS.shapeBorder}`,
            padding: "4px 6px",
            backgroundColor: ARCA_COLORS.windowBg,
          }}
        >
          {/* Riga 1: Articolo, Descrizione, Data Con., U.M., Fatt conv. (Top=204) */}
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput labelAbove label="Articolo" value={selectedRiga.CODICEARTI} width="120px"
              style={{ fontFamily: "'Courier New', monospace" }}
              labelStyle={{ backgroundColor: "#00FFFF" }} />
            <ArcaInput
              labelAbove
              label="Descrizione articolo"
              value={selectedRiga.DESCRIZION}
              width="279px"
              readOnly={!editing}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, DESCRIZION: v });
              } : undefined}
            />
            <ArcaInput labelAbove label="Data Con." value={selectedRiga.DATACONSEG ?? ""} width="62px" />
            <ArcaInput labelAbove label="U.M." value={selectedRiga.UNMISURA} width="30px" />
            <ArcaInput labelAbove label="Fattore conv." value={String(selectedRiga.FATT)} width="71px" align="right" />
          </div>
          {/* Riga 2: Quantità, Prezzo Unitario, % Sconto, % Provvigioni, Totale, IVA, C.S., Omaggio (Top=244) */}
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <ArcaInput
              labelAbove
              label="Quantità"
              value={String(selectedRiga.QUANTITA)}
              width="88px"
              align="right"
              readOnly={!editing}
              type={editing ? "number" : "text"}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, QUANTITA: parseFloat(v) || 0 });
              } : undefined}
            />
            <ArcaInput labelAbove label="Q.tà Resid." value={String(selectedRiga.QUANTITARE)} width="88px" align="right" />
            <ArcaInput
              labelAbove
              label="Prezzo Unitario"
              value={editing ? String(selectedRiga.PREZZOUN) : formatArcaCurrency(selectedRiga.PREZZOUN)}
              width="89px"
              align="right"
              readOnly={!editing}
              type={editing ? "number" : "text"}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, PREZZOUN: parseFloat(v) || 0 });
              } : undefined}
            />
            <ArcaInput
              labelAbove
              label="% Sconto"
              value={selectedRiga.SCONTI}
              width="58px"
              readOnly={!editing}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, SCONTI: v });
              } : undefined}
            />
            <ArcaInput labelAbove label="% Provvigioni" value={selectedRiga.PROVV} width="67px" />
            <ArcaInput labelAbove label="Totale" value={formatArcaCurrency(selectedRiga.PREZZOTOT)} width="96px" align="right" style={{ color: "#FF0000", fontWeight: "bold" }} />
            <ArcaInput
              labelAbove
              label="IVA"
              value={selectedRiga.ALIIVA}
              width="30px"
              readOnly={!editing}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, ALIIVA: v });
              } : undefined}
            />
            <ArcaInput labelAbove label="C. S." value={selectedRiga.CONTOSCARI} width="30px" />
            {/* Omaggio: checkbox come Arca */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <span style={{ ...arcaLabel, fontSize: "10px", padding: "0 1px" }}>Omaggio</span>
              <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                <label style={{ ...ARCA_FONT, fontSize: "10px", display: "flex", alignItems: "center", gap: "2px" }}>
                  <input type="checkbox" checked={selectedRiga.OMMERCE} readOnly={!editing}
                    onChange={editing && selectedIndex !== null ? (e) => {
                      onRigaChange?.(selectedIndex, { ...selectedRiga, OMMERCE: e.target.checked });
                    } : undefined}
                  />
                  Merce
                </label>
                <label style={{ ...ARCA_FONT, fontSize: "10px", display: "flex", alignItems: "center", gap: "2px" }}>
                  <input type="checkbox" checked={selectedRiga.OMIVA} readOnly={!editing}
                    onChange={editing && selectedIndex !== null ? (e) => {
                      onRigaChange?.(selectedIndex, { ...selectedRiga, OMIVA: e.target.checked });
                    } : undefined}
                  />
                  Iva
                </label>
              </div>
            </div>
          </div>
          {editing && selectedIndex !== null && (
            <div style={{ marginTop: "6px", display: "flex", gap: "6px" }}>
              <button
                onClick={() => onRemoveRiga?.(selectedIndex)}
                style={{
                  ...ARCA_FONT,
                  padding: "3px 10px",
                  backgroundColor: "#c62828",
                  color: "#fff",
                  border: "none",
                  borderRadius: "2px",
                  cursor: "pointer",
                }}
              >
                Rimuovi riga
              </button>
            </div>
          )}
        </div>
      )}
      {editing && (
        <button
          onClick={() => onAddRiga?.()}
          style={{
            ...ARCA_FONT,
            padding: "4px 12px",
            backgroundColor: "#1976d2",
            color: "#fff",
            border: "none",
            borderRadius: "2px",
            cursor: "pointer",
            marginTop: "4px",
          }}
        >
          + Aggiungi riga
        </button>
      )}
    </div>
  );
}

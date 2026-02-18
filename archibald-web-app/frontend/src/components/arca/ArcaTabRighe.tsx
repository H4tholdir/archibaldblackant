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
  { label: "N.", width: 30 },
  { label: "Codice", width: 120 },
  { label: "Descrizione", width: 220 },
  { label: "Q.ta'", width: 60 },
  { label: "Residuo", width: 60 },
  { label: "Prezzo Tot.", width: 100 },
  { label: "N", width: 30 },
];

export function ArcaTabRighe({ righe, editing, onRigaChange, onRemoveRiga, onAddRiga }: ArcaTabRigheProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    righe.length > 0 ? 0 : null,
  );
  const selectedRiga = selectedIndex !== null ? righe[selectedIndex] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {/* Griglia righe */}
      <div style={{ border: `1px solid ${ARCA_COLORS.borderDark}`, maxHeight: "200px", overflowY: "auto" }}>
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
            <div style={arcaGridCell(30, "right")}>{riga.NUMERORIGA}</div>
            <div style={arcaGridCell(120)}>{riga.CODICEARTI}</div>
            <div style={arcaGridCell(220)}>{riga.DESCRIZION}</div>
            <div style={arcaGridCell(60, "right")}>{riga.QUANTITA}</div>
            <div style={arcaGridCell(60, "right")}>{riga.QUANTITARE}</div>
            <div style={arcaGridCell(100, "right")}>
              {formatArcaCurrency(riga.PREZZOTOT)}
            </div>
            <div style={{ ...arcaGridCell(30, "center"), borderRight: "none" }}>{riga.FATT}</div>
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
            border: `1px solid ${ARCA_COLORS.borderDark}`,
            padding: "4px 6px",
            backgroundColor: ARCA_COLORS.windowBg,
          }}
        >
          {/* Riga 1: Articolo, Descrizione articolo, Data Con., U.M., Fattore conv. */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
            <ArcaInput labelAbove label="Articolo" value={selectedRiga.CODICEARTI} width="100px" />
            <ArcaInput
              labelAbove
              label="Descrizione articolo"
              value={selectedRiga.DESCRIZION}
              width="280px"
              readOnly={!editing}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, DESCRIZION: v });
              } : undefined}
            />
            <ArcaInput labelAbove label="Data Con." value={selectedRiga.DATACONSEG ?? ""} width="80px" />
            <ArcaInput labelAbove label="U.M." value={selectedRiga.UNMISURA} width="25px" />
            <ArcaInput labelAbove label="Fattore conv." value={String(selectedRiga.FATT)} width="70px" align="right" />
          </div>
          {/* Riga 2: Quantità, Quantità Residua, Prezzo Unitario, % Sconto, % Provvigioni, Totale, IVA, C.S., Omaggio */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <ArcaInput
              labelAbove
              label="Quantità"
              value={String(selectedRiga.QUANTITA)}
              width="50px"
              align="right"
              readOnly={!editing}
              type={editing ? "number" : "text"}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, QUANTITA: parseFloat(v) || 0 });
              } : undefined}
            />
            <ArcaInput labelAbove label="Quantità Residua" value={String(selectedRiga.QUANTITARE)} width="50px" align="right" />
            <ArcaInput
              labelAbove
              label="Prezzo Unitario"
              value={editing ? String(selectedRiga.PREZZOUN) : formatArcaCurrency(selectedRiga.PREZZOUN)}
              width="70px"
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
              width="50px"
              readOnly={!editing}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, SCONTI: v });
              } : undefined}
            />
            <ArcaInput labelAbove label="% Provvigioni" value={selectedRiga.PROVV} width="60px" />
            <ArcaInput labelAbove label="Totale" value={formatArcaCurrency(selectedRiga.PREZZOTOT)} width="60px" align="right" highlight />
            <ArcaInput
              labelAbove
              label="IVA"
              value={selectedRiga.ALIIVA}
              width="25px"
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

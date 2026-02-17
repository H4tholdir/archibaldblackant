import { useState } from "react";
import type { ArcaRiga } from "../../types/arca-data";
import { ArcaInput } from "./ArcaInput";
import {
  ARCA_FONT,
  arcaNavyHeader,
  arcaRowStyle,
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
          {RIGHE_COLUMNS.map((col) => (
            <div
              key={col.label}
              style={{
                ...arcaNavyHeader,
                width: col.width,
                boxSizing: "border-box",
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
              cursor: "pointer",
            }}
          >
            <div style={{ width: 30, textAlign: "right" }}>{riga.NUMERORIGA}</div>
            <div style={{ width: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
              {riga.CODICEARTI}
            </div>
            <div style={{ width: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
              {riga.DESCRIZION}
            </div>
            <div style={{ width: 60, textAlign: "right" }}>{riga.QUANTITA}</div>
            <div style={{ width: 60, textAlign: "right" }}>{riga.QUANTITARE}</div>
            <div style={{ width: 100, textAlign: "right" }}>
              {formatArcaCurrency(riga.PREZZOTOT)}
            </div>
            <div style={{ width: 30, textAlign: "center" }}>{riga.FATT}</div>
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
            border: `1px solid ${ARCA_COLORS.borderDark}`,
            padding: "6px 8px",
            backgroundColor: "#FAFAF5",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
            <ArcaInput label="Articolo" value={selectedRiga.CODICEARTI} width="120px" />
            <ArcaInput
              label="Descrizione"
              value={selectedRiga.DESCRIZION}
              width="220px"
              readOnly={!editing}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, DESCRIZION: v });
              } : undefined}
            />
            <ArcaInput label="Data Con." value={selectedRiga.DATACONSEG ?? ""} width="90px" />
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
            <ArcaInput label="U.M." value={selectedRiga.UNMISURA} width="30px" />
            <ArcaInput label="Fatt. conv." value={String(selectedRiga.FATT)} width="40px" />
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
            <ArcaInput
              label="Q.ta'"
              value={String(selectedRiga.QUANTITA)}
              width="60px"
              align="right"
              readOnly={!editing}
              type={editing ? "number" : "text"}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, QUANTITA: parseFloat(v) || 0 });
              } : undefined}
            />
            <ArcaInput label="Q.ta' Resid." value={String(selectedRiga.QUANTITARE)} width="60px" align="right" />
            <ArcaInput
              label="Prezzo Un."
              value={editing ? String(selectedRiga.PREZZOUN) : formatArcaCurrency(selectedRiga.PREZZOUN)}
              width="80px"
              align="right"
              readOnly={!editing}
              type={editing ? "number" : "text"}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, PREZZOUN: parseFloat(v) || 0 });
              } : undefined}
            />
            <ArcaInput
              label="% Sconto"
              value={selectedRiga.SCONTI}
              width="60px"
              readOnly={!editing}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, SCONTI: v });
              } : undefined}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <ArcaInput label="Totale" value={formatArcaCurrency(selectedRiga.PREZZOTOT)} width="90px" align="right" highlight />
            <ArcaInput
              label="IVA"
              value={selectedRiga.ALIIVA}
              width="30px"
              readOnly={!editing}
              onChange={editing && selectedIndex !== null ? (v) => {
                onRigaChange?.(selectedIndex, { ...selectedRiga, ALIIVA: v });
              } : undefined}
            />
            <ArcaInput label="C.S." value={selectedRiga.CONTOSCARI} width="60px" />
            <ArcaInput label="Om. Merce" value={selectedRiga.OMMERCE ? "Si" : ""} width="30px" />
            <ArcaInput label="Om. IVA" value={selectedRiga.OMIVA ? "Si" : ""} width="30px" />
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

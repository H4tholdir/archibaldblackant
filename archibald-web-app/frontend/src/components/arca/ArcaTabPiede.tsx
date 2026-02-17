import type { ArcaTestata } from "../../types/arca-data";
import { ArcaInput } from "./ArcaInput";
import { ARCA_COLORS, ARCA_FONT, formatArcaCurrency } from "./arcaStyles";

type ArcaTabPiedeProps = {
  testata: ArcaTestata;
  editing?: boolean;
  onFieldChange?: (field: keyof ArcaTestata, value: number | string) => void;
};

export function ArcaTabPiede({ testata, editing, onFieldChange }: ArcaTabPiedeProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Sezione spedizione */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ArcaInput label="Spedizione" value={testata.SPEDIZIONE} width="100px" />
        <ArcaInput label="Aspetto" value={testata.ASPBENI} width="100px" />
        <ArcaInput label="Causale Tr." value={testata.TRCAUSALE} width="100px" />
        <ArcaInput label="Porto" value={testata.PORTO} width="80px" />
      </div>

      {/* Sezione fisico */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ArcaInput label="Colli" value={testata.COLLI} width="60px" />
        <ArcaInput label="Volume" value={String(testata.VOLUME)} width="60px" align="right" />
        <ArcaInput label="Peso Lordo" value={String(testata.PESOLORDO)} width="70px" align="right" />
        <ArcaInput label="Peso Netto" value={String(testata.PESONETTO)} width="70px" align="right" />
      </div>

      {/* Sezione vettori */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ArcaInput label="Vettore 1" value={testata.VETTORE1} width="100px" />
        <ArcaInput label="Data" value={testata.V1DATA ?? ""} width="80px" />
        <ArcaInput label="Ora" value={testata.V1ORA} width="50px" />
      </div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ArcaInput label="Vettore 2" value={testata.VETTORE2} width="100px" />
        <ArcaInput label="Data" value={testata.V2DATA ?? ""} width="80px" />
        <ArcaInput label="Ora" value={testata.V2ORA} width="50px" />
      </div>

      {/* Tabella spese 3x4 */}
      <div
        style={{
          border: `1px solid ${ARCA_COLORS.borderDark}`,
          marginTop: "4px",
        }}
      >
        <table
          style={{
            ...ARCA_FONT,
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: ARCA_COLORS.headerBg, color: ARCA_COLORS.headerText }}>
              <th style={{ padding: "3px 6px", textAlign: "left" }}>Tipo</th>
              <th style={{ padding: "3px 6px", textAlign: "right" }}>Importo</th>
              <th style={{ padding: "3px 6px", textAlign: "center" }}>IVA %</th>
              <th style={{ padding: "3px 6px", textAlign: "left" }}>C. Scarico</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ backgroundColor: ARCA_COLORS.rowEven }}>
              <td style={{ padding: "3px 6px" }}>Trasporto</td>
              <td style={{ padding: "3px 6px", textAlign: "right" }}>
                {editing ? (
                  <input
                    type="number"
                    value={testata.SPESETR}
                    onChange={(e) => onFieldChange?.("SPESETR", parseFloat(e.target.value) || 0)}
                    style={{ ...ARCA_FONT, width: "70px", textAlign: "right" }}
                  />
                ) : formatArcaCurrency(testata.SPESETR)}
              </td>
              <td style={{ padding: "3px 6px", textAlign: "center" }}>
                {testata.SPESETRIVA}
              </td>
              <td style={{ padding: "3px 6px" }}>{testata.SPESETRCP}</td>
            </tr>
            <tr style={{ backgroundColor: ARCA_COLORS.rowOdd }}>
              <td style={{ padding: "3px 6px" }}>Imballo</td>
              <td style={{ padding: "3px 6px", textAlign: "right" }}>
                {editing ? (
                  <input
                    type="number"
                    value={testata.SPESEIM}
                    onChange={(e) => onFieldChange?.("SPESEIM", parseFloat(e.target.value) || 0)}
                    style={{ ...ARCA_FONT, width: "70px", textAlign: "right" }}
                  />
                ) : formatArcaCurrency(testata.SPESEIM)}
              </td>
              <td style={{ padding: "3px 6px", textAlign: "center" }}>
                {testata.SPESEIMIVA}
              </td>
              <td style={{ padding: "3px 6px" }}>{testata.SPESEIMCP}</td>
            </tr>
            <tr style={{ backgroundColor: ARCA_COLORS.rowEven }}>
              <td style={{ padding: "3px 6px" }}>Varie</td>
              <td style={{ padding: "3px 6px", textAlign: "right" }}>
                {editing ? (
                  <input
                    type="number"
                    value={testata.SPESEVA}
                    onChange={(e) => onFieldChange?.("SPESEVA", parseFloat(e.target.value) || 0)}
                    style={{ ...ARCA_FONT, width: "70px", textAlign: "right" }}
                  />
                ) : formatArcaCurrency(testata.SPESEVA)}
              </td>
              <td style={{ padding: "3px 6px", textAlign: "center" }}>
                {testata.SPESEVAIVA}
              </td>
              <td style={{ padding: "3px 6px" }}>{testata.SPESEVACP}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Sezione agenti/provvigioni */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ArcaInput label="% Provv. 1" value={String(testata.PERCPROVV)} width="50px" align="right" />
        <ArcaInput label="Imp. Provv. 1" value={formatArcaCurrency(testata.IMPPROVV)} width="70px" align="right" />
        <ArcaInput label="% Provv. 2" value={String(testata.PERCPROVV2)} width="50px" align="right" />
        <ArcaInput label="Imp. Provv. 2" value={formatArcaCurrency(testata.IMPPROVV2)} width="70px" align="right" />
      </div>

      {/* Acconto, Abbuono */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ArcaInput
          label="Acconto"
          value={editing ? String(testata.ACCONTO) : formatArcaCurrency(testata.ACCONTO)}
          width="80px"
          align="right"
          readOnly={!editing}
          type={editing ? "number" : "text"}
          onChange={editing ? (v) => onFieldChange?.("ACCONTO", parseFloat(v) || 0) : undefined}
        />
        <ArcaInput
          label="Abbuono"
          value={editing ? String(testata.ABBUONO) : formatArcaCurrency(testata.ABBUONO)}
          width="80px"
          align="right"
          readOnly={!editing}
          type={editing ? "number" : "text"}
          onChange={editing ? (v) => onFieldChange?.("ABBUONO", parseFloat(v) || 0) : undefined}
        />
      </div>

      {/* Note */}
      {(testata.NOTE || editing) && (
        <div style={{ marginTop: "4px" }}>
          <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "2px" }}>Note</div>
          <textarea
            readOnly={!editing}
            value={testata.NOTE}
            onChange={editing ? (e) => onFieldChange?.("NOTE", e.target.value) : undefined}
            style={{
              ...ARCA_FONT,
              width: "100%",
              minHeight: "60px",
              border: "2px inset #808080",
              backgroundColor: editing ? "#FFFFFF" : "#F0F0F0",
              padding: "4px",
              boxSizing: "border-box",
              resize: "vertical",
            }}
          />
        </div>
      )}
    </div>
  );
}

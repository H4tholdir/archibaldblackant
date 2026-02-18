import type { ArcaTestata } from "../../types/arca-data";
import { ArcaInput } from "./ArcaInput";
import {
  ARCA_COLORS,
  ARCA_FONT,
  arcaEtchedBorder,
  arcaSectionLabel,
  arcaExpenseDesc,
  formatArcaCurrency,
  formatArcaDate,
} from "./arcaStyles";

type ArcaTabPiedeProps = {
  testata: ArcaTestata;
  editing?: boolean;
  onFieldChange?: (field: keyof ArcaTestata, value: number | string) => void;
};

const EXPENSE_DESCRIPTIONS: Record<string, string> = {
  Trasporto: "Spese di trasporto",
  Imballo: "Spese di imballo",
  Varie: "Spese varie",
};

const thStyle = {
  padding: "3px 6px",
  textAlign: "left" as const,
  borderBottom: `1px solid ${ARCA_COLORS.gridBorderSilver}`,
};

const tdStyle = {
  padding: "3px 6px",
  borderBottom: `1px solid ${ARCA_COLORS.gridBorderSilver}`,
};

export function ArcaTabPiede({ testata, editing, onFieldChange }: ArcaTabPiedeProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {/* Riga superiore: Spedizione/Aspetto/Trasporto/Porto + Colli/Volume/Peso */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {/* Sezione Spedizione */}
        <div style={{ ...arcaEtchedBorder, flex: 1, minWidth: "320px" }}>
          <span style={arcaSectionLabel}>Trasporto</span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
            <ArcaInput label="Spedizione" value={testata.SPEDIZIONE} width="100px" />
            <ArcaInput label="Aspetto" value={testata.ASPBENI} width="100px" />
            <ArcaInput label="Causale Tr." value={testata.TRCAUSALE} width="100px" />
            <ArcaInput label="Porto" value={testata.PORTO} width="80px" />
          </div>
        </div>

        {/* Sezione Colli/Volume/Peso */}
        <div style={{ ...arcaEtchedBorder, minWidth: "200px" }}>
          <span style={arcaSectionLabel}>Fisico</span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
            <ArcaInput label="Colli" value={testata.COLLI} width="50px" />
            <ArcaInput label="Volume" value={String(testata.VOLUME)} width="55px" align="right" />
            <ArcaInput label="Peso L." value={String(testata.PESOLORDO)} width="60px" align="right" />
            <ArcaInput label="Peso N." value={String(testata.PESONETTO)} width="60px" align="right" />
          </div>
        </div>
      </div>

      {/* Riga vettori + Data/Num Doc Trasporto */}
      <div style={{ ...arcaEtchedBorder }}>
        <span style={arcaSectionLabel}>Vettori</span>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px", marginBottom: "4px" }}>
          <ArcaInput label="Vettore 1" value={testata.VETTORE1} width="100px" />
          <ArcaInput label="Data" value={testata.V1DATA ?? ""} width="80px" />
          <ArcaInput label="Ora" value={testata.V1ORA} width="50px" />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
          <ArcaInput label="Vettore 2" value={testata.VETTORE2} width="100px" />
          <ArcaInput label="Data" value={testata.V2DATA ?? ""} width="80px" />
          <ArcaInput label="Ora" value={testata.V2ORA} width="50px" />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <ArcaInput label="Data Tr." value={formatArcaDate(testata.TRDATA)} width="80px" />
          <ArcaInput label="Ora Tr." value={testata.TRORA} width="50px" />
        </div>
      </div>

      {/* Riga centrale: Tabella Spese (sinistra) + Agenti/Importi (destra) */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {/* Tabella spese */}
        <div style={{ ...arcaEtchedBorder, flex: 1, minWidth: "350px" }}>
          <span style={arcaSectionLabel}>Spese</span>
          <table
            style={{
              ...ARCA_FONT,
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "4px",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: ARCA_COLORS.headerBg, color: ARCA_COLORS.headerText }}>
                <th style={{ ...thStyle, width: "70px" }}>Tipo</th>
                <th style={{ ...thStyle, textAlign: "right", width: "80px" }}>Importo</th>
                <th style={{ ...thStyle, textAlign: "center", width: "40px" }}>%</th>
                <th style={{ ...thStyle, textAlign: "center", width: "50px" }}>IVA</th>
                <th style={{ ...thStyle, width: "60px" }}>C.P.</th>
                <th style={{ ...thStyle }}>Descrizione</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ backgroundColor: ARCA_COLORS.rowEven }}>
                <td style={tdStyle}>Trasporto</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {editing ? (
                    <input
                      type="number"
                      value={testata.SPESETR}
                      onChange={(e) => onFieldChange?.("SPESETR", parseFloat(e.target.value) || 0)}
                      style={{ ...ARCA_FONT, width: "70px", textAlign: "right" }}
                    />
                  ) : formatArcaCurrency(testata.SPESETR)}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESETRPER}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESETRIVA}</td>
                <td style={tdStyle}>{testata.SPESETRCP}</td>
                <td style={{ ...tdStyle, ...arcaExpenseDesc }}>{EXPENSE_DESCRIPTIONS["Trasporto"]}</td>
              </tr>
              <tr style={{ backgroundColor: ARCA_COLORS.rowOdd }}>
                <td style={tdStyle}>Imballo</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {editing ? (
                    <input
                      type="number"
                      value={testata.SPESEIM}
                      onChange={(e) => onFieldChange?.("SPESEIM", parseFloat(e.target.value) || 0)}
                      style={{ ...ARCA_FONT, width: "70px", textAlign: "right" }}
                    />
                  ) : formatArcaCurrency(testata.SPESEIM)}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}></td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESEIMIVA}</td>
                <td style={tdStyle}>{testata.SPESEIMCP}</td>
                <td style={{ ...tdStyle, ...arcaExpenseDesc }}>{EXPENSE_DESCRIPTIONS["Imballo"]}</td>
              </tr>
              <tr style={{ backgroundColor: ARCA_COLORS.rowEven }}>
                <td style={tdStyle}>Varie</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {editing ? (
                    <input
                      type="number"
                      value={testata.SPESEVA}
                      onChange={(e) => onFieldChange?.("SPESEVA", parseFloat(e.target.value) || 0)}
                      style={{ ...ARCA_FONT, width: "70px", textAlign: "right" }}
                    />
                  ) : formatArcaCurrency(testata.SPESEVA)}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}></td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESEVAIVA}</td>
                <td style={tdStyle}>{testata.SPESEVACP}</td>
                <td style={{ ...tdStyle, ...arcaExpenseDesc }}>{EXPENSE_DESCRIPTIONS["Varie"]}</td>
              </tr>
            </tbody>
          </table>
          {/* Incasso */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
            <ArcaInput label="Inc. Eff." value={formatArcaCurrency(testata.SPESEINEFF)} width="70px" align="right" />
            <ArcaInput label="Inc. Doc." value={formatArcaCurrency(testata.SPESEINDOC)} width="70px" align="right" />
            <ArcaInput label="IVA" value={testata.SPESEINIVA} width="40px" />
            <ArcaInput label="C.P." value={testata.SPESEINCP} width="40px" />
          </div>
        </div>

        {/* Agenti / Importi */}
        <div style={{ ...arcaEtchedBorder, minWidth: "200px" }}>
          <span style={arcaSectionLabel}>Agenti / Importi</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
            <ArcaInput label="Agente 1" value={testata.AGENTE} width="80px" />
            <ArcaInput label="% Provv. 1" value={String(testata.PERCPROVV)} width="50px" align="right" />
            <ArcaInput label="Imp. Provv. 1" value={formatArcaCurrency(testata.IMPPROVV)} width="70px" align="right" />
            <ArcaInput label="Agente 2" value={testata.AGENTE2} width="80px" />
            <ArcaInput label="% Provv. 2" value={String(testata.PERCPROVV2)} width="50px" align="right" />
            <ArcaInput label="Imp. Provv. 2" value={formatArcaCurrency(testata.IMPPROVV2)} width="70px" align="right" />
            <div style={{ borderTop: `1px solid ${ARCA_COLORS.borderLight}`, marginTop: "4px", paddingTop: "4px" }}>
              <ArcaInput label="Rit. Cond." value={String(testata.RITCOND)} width="60px" align="right" />
            </div>
            <ArcaInput
              label="Acconto"
              value={editing ? String(testata.ACCONTO) : formatArcaCurrency(testata.ACCONTO)}
              width="70px"
              align="right"
              readOnly={!editing}
              type={editing ? "number" : "text"}
              onChange={editing ? (v) => onFieldChange?.("ACCONTO", parseFloat(v) || 0) : undefined}
            />
            <ArcaInput
              label="Abbuono"
              value={editing ? String(testata.ABBUONO) : formatArcaCurrency(testata.ABBUONO)}
              width="70px"
              align="right"
              readOnly={!editing}
              type={editing ? "number" : "text"}
              onChange={editing ? (v) => onFieldChange?.("ABBUONO", parseFloat(v) || 0) : undefined}
            />
          </div>
        </div>
      </div>

      {/* Note */}
      <div style={{ ...arcaEtchedBorder }}>
        <span style={arcaSectionLabel}>Note</span>
        <textarea
          readOnly={!editing}
          value={testata.NOTE}
          onChange={editing ? (e) => onFieldChange?.("NOTE", e.target.value) : undefined}
          style={{
            ...ARCA_FONT,
            width: "100%",
            minHeight: "60px",
            marginTop: "4px",
            border: "2px inset #808080",
            backgroundColor: editing ? "#FFFFFF" : "#F0F0F0",
            padding: "4px",
            boxSizing: "border-box",
            resize: "vertical",
          }}
        />
      </div>
    </div>
  );
}

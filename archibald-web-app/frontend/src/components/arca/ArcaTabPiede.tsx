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

const tdStyle = {
  padding: "1px 3px",
  borderBottom: `1px solid ${ARCA_COLORS.gridBorderSilver}`,
  ...ARCA_FONT,
};

export function ArcaTabPiede({ testata, editing, onFieldChange }: ArcaTabPiedeProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {/* Riga superiore: Spedizione/Aspetto/Trasporto/Porto + Colli/Volume/Peso */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        <div style={{ ...arcaEtchedBorder, flex: 1, minWidth: "240px" }}>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput label="Spedizione" value={testata.SPEDIZIONE} width="60px" />
            <ArcaInput label="Aspetto" value={testata.ASPBENI} width="60px" />
          </div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            <ArcaInput label="Trasporto" value={testata.TRCAUSALE} width="30px" />
            <ArcaInput label="Porto" value={testata.PORTO} width="30px" />
          </div>
        </div>
        <div style={{ ...arcaEtchedBorder, minWidth: "160px" }}>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput label="Colli" value={testata.COLLI} width="50px" />
            <ArcaInput label="Volume" value={formatArcaCurrency(testata.VOLUME)} width="50px" align="right" />
          </div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            <ArcaInput label="Peso Lordo" value={formatArcaCurrency(testata.PESOLORDO)} width="50px" align="right" />
            <ArcaInput label="Peso Netto" value={formatArcaCurrency(testata.PESONETTO)} width="50px" align="right" />
          </div>
        </div>
      </div>

      {/* Vettori + Data/Ora/Agenti */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        <div style={{ ...arcaEtchedBorder, flex: 1, minWidth: "260px" }}>
          <span style={arcaSectionLabel}>Descrizione Vettore</span>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px", marginBottom: "2px" }}>
            <ArcaInput label="n. 1" value={testata.VETTORE1} width="30px" />
            <ArcaInput label="Data Ritiro" value={formatArcaDate(testata.V1DATA)} width="80px" />
            <ArcaInput label="Ora Ritiro" value={testata.V1ORA} width="45px" />
          </div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput label="n. 2" value={testata.VETTORE2} width="30px" />
            <ArcaInput value={formatArcaDate(testata.V2DATA)} width="80px" />
            <ArcaInput value={testata.V2ORA} width="45px" />
          </div>
          <ArcaInput label="Num. Doc." value={`${testata.NUMERODOC}/`} width="55px" />
        </div>
        <div style={{ ...arcaEtchedBorder, minWidth: "150px" }}>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput label="Data" value={formatArcaDate(testata.TRDATA)} width="80px" />
            <ArcaInput label="Ora" value={testata.TRORA} width="45px" />
          </div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput label="Ag. 1" value={testata.AGENTE} width="40px" />
            <ArcaInput label="Ag. 2" value={testata.AGENTE2} width="40px" />
          </div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            <ArcaInput label="% Provv." value={String(testata.PERCPROVV)} width="45px" align="right" />
            <ArcaInput value={String(testata.PERCPROVV2)} width="45px" align="right" />
          </div>
        </div>
      </div>

      {/* Spese + Rit/Acconto/Abbuono */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "300px" }}>
          <table style={{ ...ARCA_FONT, width: "100%", borderCollapse: "collapse", border: `1px solid ${ARCA_COLORS.borderDark}` }}>
            <tbody>
              <tr style={{ backgroundColor: ARCA_COLORS.windowBg }}>
                <td style={{ ...tdStyle, width: "60px" }}></td>
                <td style={{ ...tdStyle, width: "25px", textAlign: "center", fontWeight: "bold" }}>%</td>
                <td style={{ ...tdStyle, width: "50px", textAlign: "right", fontWeight: "bold" }}>Importo</td>
                <td style={{ ...tdStyle, width: "25px", textAlign: "center", fontWeight: "bold" }}>IVA</td>
                <td style={{ ...tdStyle, width: "40px", fontWeight: "bold" }}>Conto Scarico</td>
                <td style={tdStyle}></td>
              </tr>
              <tr style={{ backgroundColor: ARCA_COLORS.rowEven }}>
                <td style={tdStyle}>Trasporto</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESETRPER}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {editing ? (
                    <input type="number" value={testata.SPESETR}
                      onChange={(e) => onFieldChange?.("SPESETR", parseFloat(e.target.value) || 0)}
                      style={{ ...ARCA_FONT, width: "45px", textAlign: "right", height: "14px" }} />
                  ) : formatArcaCurrency(testata.SPESETR)}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESETRIVA}</td>
                <td style={tdStyle}>{testata.SPESETRCP}</td>
                <td style={{ ...tdStyle, ...arcaExpenseDesc }}>Spese di trasporto</td>
              </tr>
              <tr style={{ backgroundColor: ARCA_COLORS.rowOdd }}>
                <td style={tdStyle}>Imballo</td>
                <td style={{ ...tdStyle, textAlign: "center" }}></td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {editing ? (
                    <input type="number" value={testata.SPESEIM}
                      onChange={(e) => onFieldChange?.("SPESEIM", parseFloat(e.target.value) || 0)}
                      style={{ ...ARCA_FONT, width: "45px", textAlign: "right", height: "14px" }} />
                  ) : formatArcaCurrency(testata.SPESEIM)}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESEIMIVA}</td>
                <td style={tdStyle}>{testata.SPESEIMCP}</td>
                <td style={{ ...tdStyle, ...arcaExpenseDesc }}>Spese generali</td>
              </tr>
              <tr style={{ backgroundColor: ARCA_COLORS.rowEven }}>
                <td style={tdStyle}>Varie</td>
                <td style={{ ...tdStyle, textAlign: "center" }}></td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {editing ? (
                    <input type="number" value={testata.SPESEVA}
                      onChange={(e) => onFieldChange?.("SPESEVA", parseFloat(e.target.value) || 0)}
                      style={{ ...ARCA_FONT, width: "45px", textAlign: "right", height: "14px" }} />
                  ) : formatArcaCurrency(testata.SPESEVA)}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESEVAIVA}</td>
                <td style={tdStyle}>{testata.SPESEVACP}</td>
                <td style={{ ...tdStyle, ...arcaExpenseDesc }}>Spese generali</td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "2px" }}>
            <span style={{ ...ARCA_FONT, padding: "1px 0" }}>Incasso:</span>
            <ArcaInput label="Eff." value={formatArcaCurrency(testata.SPESEINEFF)} width="45px" align="right" />
            <ArcaInput label="Doc." value={formatArcaCurrency(testata.SPESEINDOC)} width="45px" align="right" />
            <ArcaInput value={testata.SPESEINIVA} width="22px" />
            <ArcaInput value={testata.SPESEINCP} width="22px" />
          </div>
        </div>
        <div style={{ minWidth: "140px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <ArcaInput label="Rit.Condom." value={formatArcaCurrency(testata.RITCOND)} width="50px" align="right" />
            <ArcaInput label="Acconto" value={editing ? String(testata.ACCONTO) : formatArcaCurrency(testata.ACCONTO)}
              width="50px" align="right" readOnly={!editing} type={editing ? "number" : "text"}
              onChange={editing ? (v) => onFieldChange?.("ACCONTO", parseFloat(v) || 0) : undefined} />
            <ArcaInput label="Abbuono" value={editing ? String(testata.ABBUONO) : formatArcaCurrency(testata.ABBUONO)}
              width="50px" align="right" readOnly={!editing} type={editing ? "number" : "text"}
              onChange={editing ? (v) => onFieldChange?.("ABBUONO", parseFloat(v) || 0) : undefined} />
          </div>
        </div>
      </div>

      {/* Note */}
      <div style={{ display: "flex", gap: "4px", alignItems: "flex-start" }}>
        <span style={{ ...ARCA_FONT, fontWeight: "bold", padding: "1px 0", flexShrink: 0 }}>Note</span>
        <textarea readOnly={!editing} value={testata.NOTE}
          onChange={editing ? (e) => onFieldChange?.("NOTE", e.target.value) : undefined}
          style={{ ...ARCA_FONT, flex: 1, minHeight: "45px", border: "2px inset #808080",
            backgroundColor: editing ? "#FFFFFF" : "#F0F0F0", padding: "2px 4px", boxSizing: "border-box", resize: "vertical" }} />
      </div>
    </div>
  );
}

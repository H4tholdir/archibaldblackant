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
  borderBottom: `1px solid ${ARCA_COLORS.shapeBorder}`,
  ...ARCA_FONT,
};

export function ArcaTabPiede({ testata, editing, onFieldChange }: ArcaTabPiedeProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {/* Sezione 1: Trasporto e Spedizione */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Trasporto e Spedizione</span>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px", marginTop: "4px" }}>
          <ArcaInput label="Spedizione" value={testata.SPEDIZIONE} width="140px" />
          <ArcaInput label="Aspetto" value={testata.ASPBENI} width="140px" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
          <ArcaInput label="Trasporto" value={testata.TRCAUSALE} width="140px" />
          <ArcaInput label="Porto" value={testata.PORTO} width="140px" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
          <ArcaInput label="Colli" value={testata.COLLI} width="40px" />
          <ArcaInput label="Volume" value={formatArcaCurrency(testata.VOLUME)} width="60px" align="right" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
          <ArcaInput label="Peso Lordo" value={formatArcaCurrency(testata.PESOLORDO)} width="60px" align="right" />
          <ArcaInput label="Peso Netto" value={formatArcaCurrency(testata.PESONETTO)} width="60px" align="right" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
          <ArcaInput label="Vettore 1" value={testata.VETTORE1} width="36px" />
          <ArcaInput label="Data Rit." value={formatArcaDate(testata.V1DATA)} width="62px" />
          <ArcaInput label="Ora" value={testata.V1ORA} width="40px" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
          <ArcaInput label="Vettore 2" value={testata.VETTORE2} width="36px" />
          <ArcaInput value={formatArcaDate(testata.V2DATA)} width="62px" />
          <ArcaInput value={testata.V2ORA} width="40px" />
        </div>
      </div>

      {/* Layout 2 colonne: Spese (sinistra) + Agenti/Importi (destra) */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {/* Colonna sinistra: Spese */}
        <div style={{ ...arcaEtchedBorder, flex: 1, minWidth: "300px", marginTop: "8px" }}>
          <span style={arcaSectionLabel}>Spese</span>
          <table style={{ ...ARCA_FONT, width: "100%", borderCollapse: "collapse", marginTop: "4px" }}>
            <tbody>
              <tr style={{ backgroundColor: ARCA_COLORS.windowBg }}>
                <td style={{ ...tdStyle, width: "55px" }}></td>
                <td style={{ ...tdStyle, width: "25px", textAlign: "center", fontWeight: "bold" }}>%</td>
                <td style={{ ...tdStyle, width: "81px", textAlign: "right", fontWeight: "bold" }}>Importo</td>
                <td style={{ ...tdStyle, width: "25px", textAlign: "center", fontWeight: "bold" }}>IVA</td>
                <td style={{ ...tdStyle, width: "35px", fontWeight: "bold" }}>C.S.</td>
                <td style={tdStyle}></td>
              </tr>
              <tr style={{ backgroundColor: ARCA_COLORS.rowEven }}>
                <td style={tdStyle}>Trasporto</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESETRPER}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {editing ? (
                    <input type="number" value={testata.SPESETR}
                      onChange={(e) => onFieldChange?.("SPESETR", parseFloat(e.target.value) || 0)}
                      style={{ ...ARCA_FONT, width: "70px", textAlign: "right", height: "15px", border: "1px solid #808080" }} />
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
                      style={{ ...ARCA_FONT, width: "70px", textAlign: "right", height: "15px", border: "1px solid #808080" }} />
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
                      style={{ ...ARCA_FONT, width: "70px", textAlign: "right", height: "15px", border: "1px solid #808080" }} />
                  ) : formatArcaCurrency(testata.SPESEVA)}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESEVAIVA}</td>
                <td style={tdStyle}>{testata.SPESEVACP}</td>
                <td style={{ ...tdStyle, ...arcaExpenseDesc }}>Spese generali</td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginTop: "2px" }}>
            <span style={{ ...ARCA_FONT, padding: "1px 0" }}>Incasso:</span>
            <ArcaInput label="Eff." value={formatArcaCurrency(testata.SPESEINEFF)} width="60px" align="right" />
            <ArcaInput label="Doc." value={formatArcaCurrency(testata.SPESEINDOC)} width="50px" align="right" />
            <ArcaInput value={testata.SPESEINIVA} width="22px" />
            <ArcaInput value={testata.SPESEINCP} width="22px" />
          </div>
        </div>

        {/* Colonna destra: Agenti/Importi */}
        <div style={{ ...arcaEtchedBorder, minWidth: "160px", marginTop: "8px" }}>
          <span style={arcaSectionLabel}>Agenti / Importi</span>
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px", marginTop: "4px" }}>
            <ArcaInput label="Data" value={formatArcaDate(testata.TRDATA)} width="62px" />
            <ArcaInput label="Ora" value={testata.TRORA} width="40px" />
          </div>
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput label="Ag. 1" value={testata.AGENTE} width="36px" />
            <ArcaInput label="Ag. 2" value={testata.AGENTE2} width="36px" />
          </div>
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "4px" }}>
            <ArcaInput label="% Provv." value={String(testata.PERCPROVV)} width="47px" align="right" />
            <ArcaInput value={String(testata.PERCPROVV2)} width="47px" align="right" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", borderTop: "1px solid #D4D0C8", paddingTop: "4px" }}>
            <ArcaInput label="Rit.Condom." value={formatArcaCurrency(testata.RITCOND)} width="80px" align="right" />
            <ArcaInput label="Acconto" value={editing ? String(testata.ACCONTO) : formatArcaCurrency(testata.ACCONTO)}
              width="80px" align="right" readOnly={!editing} type={editing ? "number" : "text"}
              onChange={editing ? (v) => onFieldChange?.("ACCONTO", parseFloat(v) || 0) : undefined} />
            <ArcaInput label="Abbuono" value={editing ? String(testata.ABBUONO) : formatArcaCurrency(testata.ABBUONO)}
              width="80px" align="right" readOnly={!editing} type={editing ? "number" : "text"}
              onChange={editing ? (v) => onFieldChange?.("ABBUONO", parseFloat(v) || 0) : undefined} />
          </div>
        </div>
      </div>

      {/* Sezione: Note */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Note</span>
        <textarea readOnly={!editing} value={testata.NOTE}
          onChange={editing ? (e) => onFieldChange?.("NOTE", e.target.value) : undefined}
          style={{ ...ARCA_FONT, width: "100%", minHeight: "40px", border: "2px inset #808080",
            backgroundColor: editing ? "#FFFFFF" : "#F0F0F0", padding: "1px 3px", boxSizing: "border-box", resize: "vertical", marginTop: "4px" }} />
      </div>
    </div>
  );
}

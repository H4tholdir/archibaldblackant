import type { ArcaTestata } from "../../types/arca-data";
import {
  ARCA_COLORS,
  ARCA_FONT,
  arcaEtchedBorder,
  arcaSectionLabel,
  arcaExpenseDesc,
  formatArcaCurrency,
} from "./arcaStyles";

type ArcaTabPiedeProps = {
  testata: ArcaTestata;
  editing?: boolean;
  onFieldChange?: (field: keyof ArcaTestata, value: number | string) => void;
};

const SPEDIZIONE_FISSA = 15.45;

const tdStyle = {
  padding: "1px 3px",
  borderBottom: `1px solid ${ARCA_COLORS.shapeBorder}`,
  ...ARCA_FONT,
};

export function ArcaTabPiede({ testata, editing, onFieldChange }: ArcaTabPiedeProps) {
  const trasportoChecked = testata.SPESETR > 0;

  const handleTrasportoToggle = () => {
    if (!editing || !onFieldChange) return;
    if (trasportoChecked) {
      onFieldChange("SPESETR", 0);
    } else {
      onFieldChange("SPESETR", SPEDIZIONE_FISSA);
      onFieldChange("SPESETRIVA", "22");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {/* Spese */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Spese</span>
        <table style={{ ...ARCA_FONT, width: "100%", borderCollapse: "collapse", marginTop: "4px" }}>
          <tbody>
            <tr style={{ backgroundColor: ARCA_COLORS.windowBg }}>
              <td style={{ ...tdStyle, width: "90px" }}></td>
              <td style={{ ...tdStyle, width: "81px", textAlign: "right", fontWeight: "bold" }}>Importo</td>
              <td style={{ ...tdStyle, width: "30px", textAlign: "center", fontWeight: "bold" }}>IVA</td>
              <td style={tdStyle}></td>
            </tr>
            <tr style={{ backgroundColor: ARCA_COLORS.rowEven }}>
              <td style={tdStyle}>
                {editing ? (
                  <label style={{ display: "flex", alignItems: "center", gap: "3px", cursor: "pointer" }}>
                    <input type="checkbox" checked={trasportoChecked} onChange={handleTrasportoToggle} />
                    Trasporto
                  </label>
                ) : "Trasporto"}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {formatArcaCurrency(testata.SPESETR)}
              </td>
              <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESETRIVA}</td>
              <td style={{ ...tdStyle, ...arcaExpenseDesc }}>Spese di trasporto</td>
            </tr>
            <tr style={{ backgroundColor: ARCA_COLORS.rowOdd }}>
              <td style={tdStyle}>Imballo</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {editing ? (
                  <input type="text" inputMode="decimal" value={testata.SPESEIM}
                    onChange={(e) => onFieldChange?.("SPESEIM", parseFloat(e.target.value) || 0)}
                    style={{ ...ARCA_FONT, width: "70px", textAlign: "right", height: "15px", border: "1px solid #808080" }} />
                ) : formatArcaCurrency(testata.SPESEIM)}
              </td>
              <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESEIMIVA}</td>
              <td style={{ ...tdStyle, ...arcaExpenseDesc }}>Spese generali</td>
            </tr>
            <tr style={{ backgroundColor: ARCA_COLORS.rowEven }}>
              <td style={tdStyle}>Varie</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {editing ? (
                  <input type="text" inputMode="decimal" value={testata.SPESEVA}
                    onChange={(e) => onFieldChange?.("SPESEVA", parseFloat(e.target.value) || 0)}
                    style={{ ...ARCA_FONT, width: "70px", textAlign: "right", height: "15px", border: "1px solid #808080" }} />
                ) : formatArcaCurrency(testata.SPESEVA)}
              </td>
              <td style={{ ...tdStyle, textAlign: "center" }}>{testata.SPESEVAIVA}</td>
              <td style={{ ...tdStyle, ...arcaExpenseDesc }}>Spese generali</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Note */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Note</span>
        <textarea readOnly={!editing} value={testata.NOTE}
          onChange={editing ? (e) => onFieldChange?.("NOTE", e.target.value) : undefined}
          style={{ ...ARCA_FONT, width: "100%", minHeight: "120px", border: "2px inset #808080",
            backgroundColor: editing ? "#FFFFFF" : "#F0F0F0", padding: "4px 6px", boxSizing: "border-box", resize: "vertical", marginTop: "4px" }} />
      </div>
    </div>
  );
}

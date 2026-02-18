import type { ArcaTestata, ArcaRiga } from "../../types/arca-data";
import type { FresisHistoryOrder } from "../../db/schema";
import {
  ARCA_COLORS,
  ARCA_FONT,
  arcaEtchedBorder,
  arcaSectionLabel,
  formatArcaCurrency,
} from "./arcaStyles";

type ArcaTabRiepilogoProps = {
  testata: ArcaTestata;
  righe: ArcaRiga[];
  order: FresisHistoryOrder;
};

type IvaGroup = {
  aliquota: string;
  imponibile: number;
  iva: number;
  totale: number;
};

function groupByIva(righe: ArcaRiga[]): IvaGroup[] {
  const map = new Map<string, { imponibile: number; iva: number }>();
  for (const riga of righe) {
    const ali = riga.ALIIVA || "0";
    const prev = map.get(ali) ?? { imponibile: 0, iva: 0 };
    const ivaRate = parseFloat(ali) / 100;
    prev.imponibile += riga.PREZZOTOT;
    prev.iva += riga.PREZZOTOT * ivaRate;
    map.set(ali, prev);
  }
  return Array.from(map.entries())
    .map(([aliquota, { imponibile, iva }]) => ({
      aliquota: `${aliquota}%`,
      imponibile,
      iva,
      totale: imponibile + iva,
    }))
    .sort((a, b) => parseFloat(b.aliquota) - parseFloat(a.aliquota));
}

const tdStyle: React.CSSProperties = {
  padding: "2px 6px",
  borderBottom: `1px solid ${ARCA_COLORS.shapeBorder}`,
  ...ARCA_FONT,
};

const thStyle: React.CSSProperties = {
  ...tdStyle,
  fontWeight: "bold",
  backgroundColor: ARCA_COLORS.windowBg,
};

export function ArcaTabRiepilogo({ testata, righe, order }: ArcaTabRiepilogoProps) {
  const ivaGroups = groupByIva(righe);
  const ivaTotal = ivaGroups.reduce((s, g) => ({ imponibile: s.imponibile + g.imponibile, iva: s.iva + g.iva, totale: s.totale + g.totale }), { imponibile: 0, iva: 0, totale: 0 });

  const hasRevenueData = order.source !== "arca_import" && order.items.length > 0 && order.items.some(i => i.originalListPrice != null);
  const totPagare = testata.TOTDOC - testata.ACCONTO;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {/* Riepilogo IVA */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Riepilogo IVA</span>
        <table style={{ ...ARCA_FONT, width: "100%", borderCollapse: "collapse", marginTop: "4px" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "center", width: "80px" }}>Aliquota</th>
              <th style={{ ...thStyle, textAlign: "right", width: "120px" }}>Imponibile</th>
              <th style={{ ...thStyle, textAlign: "right", width: "100px" }}>IVA</th>
              <th style={{ ...thStyle, textAlign: "right", width: "120px" }}>Totale</th>
            </tr>
          </thead>
          <tbody>
            {ivaGroups.map((g) => (
              <tr key={g.aliquota}>
                <td style={{ ...tdStyle, textAlign: "center" }}>{g.aliquota}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{formatArcaCurrency(g.imponibile)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{formatArcaCurrency(g.iva)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{formatArcaCurrency(g.totale)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: "bold" }}>
              <td style={{ ...tdStyle, textAlign: "center" }}>TOTALE</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{formatArcaCurrency(ivaTotal.imponibile)}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{formatArcaCurrency(ivaTotal.iva)}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{formatArcaCurrency(ivaTotal.totale)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Totali Documento */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Totali Documento</span>
        <div style={{ ...ARCA_FONT, marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <TotalRow label="Merce Lordo" value={testata.TOTMERCE} field="TOTMERCE" />
          <TotalRow label="- Sconto" value={testata.TOTSCONTO} field="TOTSCONTO" />
          <TotalRow label="= Merce Netto" value={testata.TOTNETTO} field="TOTNETTO" bold />
          <TotalRow label="+ Spese Trasporto" value={testata.SPESETR} field="SPESETR" />
          <TotalRow label="+ Spese Imballo" value={testata.SPESEIM} field="SPESEIM" />
          <TotalRow label="+ Spese Varie" value={testata.SPESEVA} field="SPESEVA" />
          <TotalRow label="= Imponibile" value={testata.TOTIMP} field="TOTIMP" bold />
          <TotalRow label="+ IVA" value={testata.TOTIVA} field="TOTIVA" />
          <div style={{ borderBottom: "2px double #000", margin: "2px 0" }} />
          <TotalRow label="= TOT. DOCUMENTO" value={testata.TOTDOC} field="TOTDOC" bold highlight />
          <TotalRow label="- Acconto" value={testata.ACCONTO} field="ACCONTO" />
          <TotalRow label="= TOT. A PAGARE" value={totPagare} bold highlight />
        </div>
      </div>

      {/* Ricavo */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Ricavo (campo PWA)</span>
        {hasRevenueData ? (
          <div style={{ marginTop: "4px" }}>
            <div style={{ ...ARCA_FONT, display: "flex", flexDirection: "column", gap: "2px", marginBottom: "6px" }}>
              <TotalRow label="Prezzo Cliente (fatturato)" value={testata.TOTMERCE} />
              <TotalRow label="- Costo Fresis (listino)" value={-(order.items.reduce((s, i) => s + (i.originalListPrice ?? i.price) * i.quantity * (1 - (i.discount ?? 0) / 100), 0))} />
              <div style={{ borderBottom: "1px solid #000", margin: "1px 0" }} />
              <TotalRow label="= RICAVO NETTO" value={order.revenue ?? 0} bold highlight />
              {testata.TOTMERCE > 0 && order.revenue != null && (
                <div style={{ ...ARCA_FONT, paddingLeft: "12px", color: "#666" }}>
                  Margine: {((order.revenue / testata.TOTMERCE) * 100).toFixed(1)}%
                </div>
              )}
            </div>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "2px" }}>Dettaglio per riga:</div>
            <table style={{ ...ARCA_FONT, width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left" }}>Articolo</th>
                  <th style={{ ...thStyle, textAlign: "right", width: "40px" }}>Qta</th>
                  <th style={{ ...thStyle, textAlign: "right", width: "70px" }}>Pr.Cli.</th>
                  <th style={{ ...thStyle, textAlign: "right", width: "70px" }}>Costo Fr</th>
                  <th style={{ ...thStyle, textAlign: "right", width: "70px" }}>Ricavo</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, idx) => {
                  const discountFactor = 1 - (item.discount ?? 0) / 100;
                  const clientTotal = item.price * item.quantity * discountFactor;
                  const costTotal = (item.originalListPrice ?? item.price) * item.quantity * discountFactor;
                  const rowRevenue = clientTotal - costTotal;
                  return (
                    <tr key={idx}>
                      <td style={tdStyle}>{item.articleCode}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{item.quantity}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatArcaCurrency(clientTotal)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatArcaCurrency(costTotal)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: rowRevenue >= 0 ? "#006600" : "#CC0000", fontWeight: "bold" }}>
                        {formatArcaCurrency(rowRevenue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ ...ARCA_FONT, marginTop: "4px", color: "#666", fontStyle: "italic" }}>
            N/D - dati di costo non disponibili
          </div>
        )}
      </div>
    </div>
  );
}

function TotalRow({ label, value, field, bold, highlight }: {
  label: string;
  value: number;
  field?: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 4px", fontWeight: bold ? "bold" : "normal" }}>
      <span>{label}</span>
      <span style={{ color: highlight ? "#800000" : undefined }}>
        {"\u20AC"} {formatArcaCurrency(value)}
        {field && <span style={{ color: "#999", fontSize: "7pt", marginLeft: "4px" }}>({field})</span>}
      </span>
    </div>
  );
}

import type { ArcaTestata, ArcaRiga } from "../../types/arca-data";
import {
  ARCA_COLORS,
  ARCA_FONT,
  arcaEtchedBorder,
  arcaSectionLabel,
  formatArcaCurrency,
} from "./arcaStyles";

type OrderItem = {
  articleCode: string;
  quantity: number;
};

type ArcaTabRiepilogoProps = {
  testata: ArcaTestata;
  righe: ArcaRiga[];
  revenueData: { value: number; percent: string | null } | null;
  rowRevenues: Record<number, number>;
  commissionRate?: number;
  orderItems?: OrderItem[];
};

type IvaGroup = {
  aliquota: string;
  imponibile: number;
  iva: number;
  totale: number;
};

function groupByIva(
  righe: ArcaRiga[],
  scontif: number,
  spese: {
    spesetr: number;
    speseim: number;
    speseva: number;
    spesetriva: string;
    speseimiva: string;
    spesevaiva: string;
  },
): IvaGroup[] {
  const map = new Map<string, { imponibile: number; iva: number }>();

  for (const riga of righe) {
    const ali = riga.ALIIVA || "0";
    const prev = map.get(ali) ?? { imponibile: 0, iva: 0 };
    const nettoRiga = riga.PREZZOTOT * scontif;
    const ivaRate = parseFloat(ali) / 100;
    prev.imponibile += nettoRiga;
    prev.iva += nettoRiga * ivaRate;
    map.set(ali, prev);
  }

  const addSpesa = (importo: number, aliStr: string) => {
    if (importo <= 0) return;
    const ali = aliStr || "0";
    const prev = map.get(ali) ?? { imponibile: 0, iva: 0 };
    const ivaRate = parseFloat(ali) / 100;
    prev.imponibile += importo;
    prev.iva += importo * ivaRate;
    map.set(ali, prev);
  };

  addSpesa(spese.spesetr, spese.spesetriva);
  addSpesa(spese.speseim, spese.speseimiva);
  addSpesa(spese.speseva, spese.spesevaiva);

  return Array.from(map.entries())
    .map(([aliquota, { imponibile, iva }]) => ({
      aliquota: `${aliquota}%`,
      imponibile: Math.round(imponibile * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      totale: Math.round((imponibile + iva) * 100) / 100,
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

export function ArcaTabRiepilogo({
  testata,
  righe,
  revenueData,
  rowRevenues,
  commissionRate,
  orderItems,
}: ArcaTabRiepilogoProps) {
  const ivaGroups = groupByIva(righe, testata.SCONTIF, {
    spesetr: testata.SPESETR,
    speseim: testata.SPESEIM,
    speseva: testata.SPESEVA,
    spesetriva: testata.SPESETRIVA,
    speseimiva: testata.SPESEIMIVA,
    spesevaiva: testata.SPESEVAIVA,
  });
  const ivaTotal = ivaGroups.reduce(
    (s, g) => ({
      imponibile: s.imponibile + g.imponibile,
      iva: s.iva + g.iva,
      totale: s.totale + g.totale,
    }),
    { imponibile: 0, iva: 0, totale: 0 },
  );

  const totPagare = testata.TOTDOC - testata.ACCONTO;
  const provvRate = commissionRate ?? 0.18;

  const orderArticleCodes = new Set(orderItems?.map(i => i.articleCode) ?? []);
  const hasOrderItems = orderArticleCodes.size > 0;

  let matchedImponibile = 0;
  let unmatchedCount = 0;
  for (const riga of righe) {
    if (!riga.CODICEARTI) continue;
    const nettoRiga = riga.PREZZOTOT * testata.SCONTIF;
    if (orderArticleCodes.has(riga.CODICEARTI)) {
      matchedImponibile += nettoRiga;
    } else {
      unmatchedCount++;
    }
  }
  matchedImponibile = Math.round(matchedImponibile * 100) / 100;
  const provvAmount = Math.round(matchedImponibile * provvRate * 100) / 100;

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

      {/* Provvigioni */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Provvigioni (campo PWA)</span>
        {hasOrderItems ? (
          <div style={{ ...ARCA_FONT, marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <TotalRow label="Imponibile articoli in ordine madre" value={matchedImponibile} />
            <TotalRow label={`\u00D7 Aliquota provvigioni (${(provvRate * 100).toFixed(0)}%)`} value={provvRate} />
            <div style={{ borderBottom: "1px solid #000", margin: "1px 0" }} />
            <TotalRow label="= PROVVIGIONI" value={provvAmount} bold highlight />
            {unmatchedCount > 0 && (
              <div style={{ ...ARCA_FONT, paddingLeft: "12px", color: "#999", fontSize: "7pt", marginTop: "2px" }}>
                {unmatchedCount} articol{unmatchedCount === 1 ? "o" : "i"} non in ordine madre (no provvigioni)
              </div>
            )}
          </div>
        ) : (
          <div style={{ ...ARCA_FONT, marginTop: "4px", color: "#666", fontStyle: "italic" }}>
            N/D - nessun ordine madre collegato
          </div>
        )}
      </div>

      {/* Ricavo */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Ricavo (campo PWA)</span>
        {revenueData ? (
          <div style={{ marginTop: "4px" }}>
            <div style={{ ...ARCA_FONT, display: "flex", flexDirection: "column", gap: "2px", marginBottom: "6px" }}>
              <TotalRow label="Merce Netto (fatturato)" value={testata.TOTNETTO} />
              <TotalRow label="- Costo Fresis (listino scontato)" value={-(testata.TOTNETTO - revenueData.value)} />
              <div style={{ borderBottom: "1px solid #000", margin: "1px 0" }} />
              <TotalRow label="= RICAVO NETTO" value={revenueData.value} bold highlight />
              {revenueData.percent && (
                <div style={{ ...ARCA_FONT, paddingLeft: "12px", color: "#666" }}>
                  Margine: {revenueData.percent}%
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
                  <th style={{ ...thStyle, textAlign: "right", width: "70px" }}>Costo Fr.</th>
                  <th style={{ ...thStyle, textAlign: "right", width: "70px" }}>Ricavo</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((riga, idx) => {
                  const rev = rowRevenues[idx];
                  if (rev == null || !riga.CODICEARTI) return null;
                  const costoFr = riga.PREZZOTOT - rev;
                  return (
                    <tr key={idx}>
                      <td style={tdStyle}>{riga.CODICEARTI}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{riga.QUANTITA}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatArcaCurrency(riga.PREZZOTOT)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatArcaCurrency(costoFr)}</td>
                      <td style={{
                        ...tdStyle,
                        textAlign: "right",
                        color: rev >= 0 ? "#006600" : "#CC0000",
                        fontWeight: "bold",
                      }}>
                        {formatArcaCurrency(rev)}
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

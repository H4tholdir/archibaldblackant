import { useState, useEffect, useMemo } from "react";
import type { FresisHistoryOrder } from "../../types/fresis";
import type { ArcaData } from "../../types/arca-data";
import { parseLinkedIds, getSiblings } from "../../api/fresis-history";
import {
  ARCA_FONT,
  ARCA_COLORS,
  arcaEtchedBorder,
  arcaSectionLabel,
  formatArcaCurrency,
  formatArcaDate,
  parseArcaDataFromOrder,
} from "./arcaStyles";

type ParentOrderArticle = {
  articleCode: string;
  quantity: number;
  lineAmount: number;
};

type ArcaTabOrdineMadreProps = {
  order: FresisHistoryOrder;
  onLink?: (orderId: string) => void;
  onNavigateToOrder?: (archibaldOrderId: string) => void;
  parentOrderArticles?: ParentOrderArticle[] | null;
};

const STATE_LABELS: Record<string, string> = {
  piazzato: "Piazzato",
  ordine_aperto: "Ordine Aperto",
  modifica: "Modifica",
  inviato_milano: "Inviato Milano",
  trasferito: "Trasferito",
  spedito: "Spedito",
  consegnato: "Consegnato",
  fatturato: "Fatturato",
  pagamento_scaduto: "Pagamento Scaduto",
  pagato: "Pagato",
  transfer_error: "Errore Trasferimento",
};

const STATE_ORDER = [
  "piazzato",
  "ordine_aperto",
  "inviato_milano",
  "trasferito",
  "spedito",
  "consegnato",
  "fatturato",
  "pagato",
];

const tdStyle: React.CSSProperties = {
  padding: "2px 6px",
  borderBottom: `1px solid ${ARCA_COLORS.shapeBorder}`,
  ...ARCA_FONT,
};

const linkBtnStyle: React.CSSProperties = {
  ...ARCA_FONT,
  padding: "3px 10px",
  border: "1px outset #D4D0C8",
  backgroundColor: "#D4D0C8",
  cursor: "pointer",
  fontWeight: "bold",
};

type ArticleMatch = {
  articleCode: string;
  orderQty: number;
  matchedQty: number;
  ftSources: string[];
};

function buildArticleMatching(
  parentArticles: ParentOrderArticle[],
  siblings: FresisHistoryOrder[],
  currentOrderId: string,
): ArticleMatch[] {
  const coverage = new Map<string, { matched: number; ftSources: string[] }>();

  for (const sib of siblings) {
    const arcaData = parseArcaDataFromOrder(sib.arcaData) as ArcaData | null;
    if (!arcaData) continue;
    const ftLabel = sib.id === currentOrderId
      ? "Questa"
      : (sib.invoiceNumber ?? sib.id.slice(0, 8));

    for (const riga of arcaData.righe) {
      if (!riga.CODICEARTI) continue;
      const prev = coverage.get(riga.CODICEARTI) ?? { matched: 0, ftSources: [] };
      prev.matched += riga.QUANTITA;
      if (!prev.ftSources.includes(ftLabel)) prev.ftSources.push(ftLabel);
      coverage.set(riga.CODICEARTI, prev);
    }
  }

  return parentArticles.map(art => {
    const cov = coverage.get(art.articleCode);
    return {
      articleCode: art.articleCode,
      orderQty: art.quantity,
      matchedQty: cov?.matched ?? 0,
      ftSources: cov?.ftSources ?? [],
    };
  });
}

export function ArcaTabOrdineMadre({ order, onLink, onNavigateToOrder, parentOrderArticles }: ArcaTabOrdineMadreProps) {
  const [siblings, setSiblings] = useState<FresisHistoryOrder[]>([]);
  const [loadingSiblings, setLoadingSiblings] = useState(false);

  const hasLinkedOrder = !!order.archibaldOrderId;
  const linkedIds = parseLinkedIds(order.archibaldOrderId);
  const linkedNumbers = parseLinkedIds(order.archibaldOrderNumber);

  useEffect(() => {
    if (!order.archibaldOrderId) return;
    setLoadingSiblings(true);
    getSiblings([order.archibaldOrderId])
      .then(setSiblings)
      .catch(() => setSiblings([]))
      .finally(() => setLoadingSiblings(false));
  }, [order.archibaldOrderId]);

  const articleMatching = useMemo(
    () => parentOrderArticles && parentOrderArticles.length > 0
      ? buildArticleMatching(parentOrderArticles, siblings, order.id)
      : [],
    [parentOrderArticles, siblings, order.id],
  );
  const matchedCount = articleMatching.filter(a => a.matchedQty >= a.orderQty).length;
  const totalArticles = articleMatching.length;

  if (!hasLinkedOrder) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px", gap: "12px" }}>
        <div style={{ ...ARCA_FONT, fontSize: "10pt", color: "#666" }}>
          Nessun ordine madre collegato a questa FT.
        </div>
        {onLink && (
          <button onClick={() => onLink(order.id)} style={{ ...linkBtnStyle, backgroundColor: "#1976d2", color: "#fff" }}>
            Collega ordine madre
          </button>
        )}
      </div>
    );
  }

  const currentStateIndex = STATE_ORDER.indexOf(order.currentState ?? "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {/* Collegamento Ordine Madre */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Collegamento Ordine Madre</span>
        <div style={{ ...ARCA_FONT, marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <div><strong>Ordine:</strong> {linkedNumbers.join(", ") || linkedIds.join(", ")}</div>
          <div><strong>Cliente:</strong> {order.parentCustomerName ?? order.subClientName}</div>
          <div><strong>Creato:</strong> {formatArcaDate(order.createdAt)}</div>
          <div><strong>Articoli ord. madre:</strong> {parentOrderArticles?.length ?? "..."}</div>
        </div>
        {onNavigateToOrder && linkedIds[0] && (
          <button
            onClick={() => onNavigateToOrder(linkedIds[0])}
            style={{ ...linkBtnStyle, marginTop: "6px" }}
          >
            Vai all'ordine madre
          </button>
        )}
      </div>

      {/* Timeline Stato */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Timeline Stato Ordine Madre</span>
        <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "1px" }}>
          {STATE_ORDER.map((state, idx) => {
            const isCompleted = currentStateIndex >= idx;
            const isCurrent = order.currentState === state;
            const icon = isCompleted ? (isCurrent ? "\uD83D\uDD04" : "\u2705") : "\u25CB";
            return (
              <div
                key={state}
                style={{
                  ...ARCA_FONT,
                  padding: "2px 4px",
                  display: "flex",
                  gap: "6px",
                  alignItems: "center",
                  backgroundColor: isCurrent ? "#E3F2FD" : "transparent",
                  fontWeight: isCurrent ? "bold" : "normal",
                  color: isCompleted ? "#000" : "#999",
                }}
              >
                <span style={{ width: "16px", textAlign: "center" }}>{icon}</span>
                <span style={{ flex: 1 }}>{STATE_LABELS[state] ?? state}</span>
                {isCurrent && order.stateUpdatedAt && (
                  <span style={{ color: "#666", fontSize: "7pt" }}>{formatArcaDate(order.stateUpdatedAt)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* DDT & Tracking */}
      {(order.ddtNumber || order.trackingNumber) && (
        <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
          <span style={arcaSectionLabel}>DDT & Tracking</span>
          <div style={{ ...ARCA_FONT, marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {order.ddtNumber && <div><strong>DDT:</strong> {order.ddtNumber}</div>}
            {order.ddtDeliveryDate && <div><strong>Data prev.:</strong> {formatArcaDate(order.ddtDeliveryDate)}</div>}
            {order.trackingCourier && <div><strong>Corriere:</strong> {order.trackingCourier}</div>}
            {order.trackingNumber && (
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <strong>Tracking:</strong> {order.trackingNumber}
                {order.trackingUrl && (
                  <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer"
                    style={{ ...ARCA_FONT, color: ARCA_COLORS.linkBlue }}>
                    Apri tracking
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FT Sorelle */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>FT Sorelle (stesso ordine madre)</span>
        {loadingSiblings ? (
          <div style={{ ...ARCA_FONT, marginTop: "4px", color: "#666" }}>Caricamento...</div>
        ) : siblings.length > 0 ? (
          <div style={{ marginTop: "4px" }}>
            <table style={{ ...ARCA_FONT, width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...tdStyle, fontWeight: "bold", backgroundColor: ARCA_COLORS.windowBg, textAlign: "left" }}>FT</th>
                  <th style={{ ...tdStyle, fontWeight: "bold", backgroundColor: ARCA_COLORS.windowBg, textAlign: "left" }}>Sub-cliente</th>
                  <th style={{ ...tdStyle, fontWeight: "bold", backgroundColor: ARCA_COLORS.windowBg, textAlign: "right", width: "80px" }}>Totale</th>
                  <th style={{ ...tdStyle, fontWeight: "bold", backgroundColor: ARCA_COLORS.windowBg, textAlign: "center", width: "70px" }}>Stato</th>
                </tr>
              </thead>
              <tbody>
                {siblings.map((sib) => {
                  const isThis = sib.id === order.id;
                  return (
                    <tr key={sib.id} style={{ backgroundColor: isThis ? "#E3F2FD" : undefined }}>
                      <td style={tdStyle}>
                        {isThis && "\u25B6 "}
                        {isThis ? "Questa" : (sib.invoiceNumber ?? sib.id.slice(0, 8))}
                      </td>
                      <td style={tdStyle}>{sib.subClientName}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatArcaCurrency(sib.targetTotalWithVAT)}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>{sib.currentState ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ ...ARCA_FONT, marginTop: "4px", color: "#666", fontStyle: "italic" }}>
            Nessuna FT sorella trovata
          </div>
        )}
      </div>

      {/* Matching Articoli */}
      {totalArticles > 0 ? (
        <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
          <span style={arcaSectionLabel}>
            Matching Articoli ({matchedCount}/{totalArticles})
          </span>
          <table style={{ ...ARCA_FONT, width: "100%", borderCollapse: "collapse", marginTop: "4px" }}>
            <thead>
              <tr>
                <th style={{ ...tdStyle, fontWeight: "bold", backgroundColor: ARCA_COLORS.windowBg, textAlign: "left" }}>Articolo</th>
                <th style={{ ...tdStyle, fontWeight: "bold", backgroundColor: ARCA_COLORS.windowBg, textAlign: "right", width: "40px" }}>Ord.</th>
                <th style={{ ...tdStyle, fontWeight: "bold", backgroundColor: ARCA_COLORS.windowBg, textAlign: "right", width: "40px" }}>FT</th>
                <th style={{ ...tdStyle, fontWeight: "bold", backgroundColor: ARCA_COLORS.windowBg, textAlign: "left" }}>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {articleMatching.map((a) => {
                const isFullMatch = a.matchedQty >= a.orderQty;
                const isPartial = a.matchedQty > 0 && a.matchedQty < a.orderQty;
                const bgColor = isFullMatch ? "#E8F5E9" : isPartial ? "#FFF8E1" : "#FFEBEE";
                const textColor = isFullMatch ? "#2e7d32" : isPartial ? "#F57F17" : "#c62828";
                return (
                  <tr key={a.articleCode} style={{ backgroundColor: bgColor }}>
                    <td style={{ ...tdStyle, color: textColor }}>{a.articleCode}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{a.orderQty}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: "bold", color: textColor }}>
                      {a.matchedQty || "\u2014"}
                    </td>
                    <td style={{ ...tdStyle, color: "#666", fontSize: "7pt" }}>
                      {a.ftSources.length > 0 ? a.ftSources.join(", ") : "\u2014"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {matchedCount < totalArticles && (
            <div style={{ ...ARCA_FONT, padding: "4px", color: "#c62828", fontSize: "7pt" }}>
              {totalArticles - matchedCount} articol{totalArticles - matchedCount === 1 ? "o" : "i"} mancant{totalArticles - matchedCount === 1 ? "e" : "i"} nelle FT sorelle
            </div>
          )}
          {matchedCount === totalArticles && (
            <div style={{ ...ARCA_FONT, padding: "4px", color: "#2e7d32", fontSize: "7pt" }}>
              Tutti gli articoli dell'ordine madre sono coperti dalle FT
            </div>
          )}
        </div>
      ) : parentOrderArticles === null ? (
        <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
          <span style={arcaSectionLabel}>Matching Articoli</span>
          <div style={{ ...ARCA_FONT, marginTop: "4px", color: "#666", fontStyle: "italic" }}>
            Caricamento articoli ordine madre...
          </div>
        </div>
      ) : parentOrderArticles && parentOrderArticles.length === 0 ? (
        <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
          <span style={arcaSectionLabel}>Matching Articoli</span>
          <div style={{ ...ARCA_FONT, marginTop: "4px", color: "#666", fontStyle: "italic" }}>
            Articoli ordine madre non ancora sincronizzati
          </div>
        </div>
      ) : null}
    </div>
  );
}

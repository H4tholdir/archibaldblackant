import { useState, useEffect } from "react";
import type { FresisHistoryOrder } from "../../db/schema";
import { parseLinkedIds } from "../../services/fresis-history.service";
import { fetchSiblingFTs } from "../../services/fresis-history.service";
import {
  ARCA_FONT,
  ARCA_COLORS,
  arcaEtchedBorder,
  arcaSectionLabel,
  formatArcaCurrency,
  formatArcaDate,
} from "./arcaStyles";

type ArcaTabOrdineMadreProps = {
  order: FresisHistoryOrder;
  onLink?: (orderId: string) => void;
  onNavigateToOrder?: (archibaldOrderId: string) => void;
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

export function ArcaTabOrdineMadre({ order, onLink, onNavigateToOrder }: ArcaTabOrdineMadreProps) {
  const [siblings, setSiblings] = useState<FresisHistoryOrder[]>([]);
  const [loadingSiblings, setLoadingSiblings] = useState(false);

  const hasLinkedOrder = !!order.archibaldOrderId;
  const linkedIds = parseLinkedIds(order.archibaldOrderId);
  const linkedNumbers = parseLinkedIds(order.archibaldOrderNumber);

  useEffect(() => {
    if (!order.archibaldOrderId) return;
    setLoadingSiblings(true);
    fetchSiblingFTs(order.archibaldOrderId)
      .then(setSiblings)
      .catch(() => setSiblings([]))
      .finally(() => setLoadingSiblings(false));
  }, [order.archibaldOrderId]);

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
          <div><strong>Cliente:</strong> {order.customerName}</div>
          <div><strong>Creato:</strong> {formatArcaDate(order.createdAt)}</div>
          <div><strong>Articoli:</strong> {order.items.length}</div>
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
            {(() => {
              const totalOrderMadre = siblings.reduce((s, sib) => s + (sib.targetTotalWithVAT ?? 0), 0);
              const totalRevenue = siblings.reduce((s, sib) => s + (sib.revenue ?? 0), 0);
              return (
                <div style={{ ...ARCA_FONT, padding: "4px", fontWeight: "bold", borderTop: `1px solid ${ARCA_COLORS.shapeBorder}` }}>
                  Totale ordine madre: {"\u20AC"} {formatArcaCurrency(totalOrderMadre)}
                  {totalRevenue !== 0 && (
                    <span style={{ marginLeft: "12px", color: totalRevenue >= 0 ? "#006600" : "#CC0000" }}>
                      Ricavo: {"\u20AC"} {formatArcaCurrency(totalRevenue)}
                      {totalOrderMadre > 0 && ` (${((totalRevenue / totalOrderMadre) * 100).toFixed(1)}%)`}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <div style={{ ...ARCA_FONT, marginTop: "4px", color: "#666", fontStyle: "italic" }}>
            Nessuna FT sorella trovata
          </div>
        )}
      </div>
    </div>
  );
}

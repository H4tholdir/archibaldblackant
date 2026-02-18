import { useState, useMemo, useCallback } from "react";
import type { FresisHistoryOrder } from "../../db/schema";
import type { ArcaData, ArcaRiga, ArcaTestata } from "../../types/arca-data";
import { ArcaInput } from "./ArcaInput";
import { ArcaTabBar } from "./ArcaTabBar";
import { ArcaTabTesta } from "./ArcaTabTesta";
import { ArcaTabRighe } from "./ArcaTabRighe";
import { ArcaTabPiede } from "./ArcaTabPiede";
import { ArcaTabRiepilogo } from "./ArcaTabRiepilogo";
import { ArcaTabOrdineMadre } from "./ArcaTabOrdineMadre";
import { parseLinkedIds } from "../../services/fresis-history.service";
import {
  ARCA_FONT,
  ARCA_COLORS,
  arcaComeConvenuto,
  arcaTransparentField,
  formatArcaCurrency,
  formatArcaDecimal,
  formatArcaDate,
  parseArcaDataFromOrder,
} from "./arcaStyles";
import {
  calculateArcaTotals,
  calculateRowTotal,
  cascadeDiscountToFactor,
} from "../../utils/arca-totals";

type ArcaDocumentDetailProps = {
  order: FresisHistoryOrder;
  onClose: () => void;
  onLink?: (orderId: string) => void;
  onUnlink?: (orderId: string) => void;
  onDelete?: (orderId: string) => void;
  onSave?: (orderId: string, arcaData: ArcaData) => void;
  onDownloadPDF?: (order: FresisHistoryOrder) => void;
  onNavigateToOrder?: (archibaldOrderId: string) => void;
};

const TAB_NAMES = ["Testa", "Righe", "Piede", "Riepilogo", "Ordine Madre"];

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function recalcTotals(data: ArcaData): ArcaData {
  const t = data.testata;
  const totals = calculateArcaTotals(
    data.righe,
    t.SCONTIF,
    {
      spesetr: t.SPESETR,
      speseim: t.SPESEIM,
      speseva: t.SPESEVA,
      spesetriva: t.SPESETRIVA,
      speseimiva: t.SPESEIMIVA,
      spesevaiva: t.SPESEVAIVA,
    },
    t.ACCONTO,
    t.ABBUONO,
  );
  return {
    ...data,
    testata: {
      ...t,
      TOTMERCE: totals.totmerce,
      TOTSCONTO: totals.totsconto,
      TOTNETTO: totals.totnetto,
      TOTIMP: totals.totimp,
      TOTIVA: totals.totiva,
      TOTDOC: totals.totdoc,
      TOTESEN: totals.totesen,
    },
  };
}

function makeBlankRiga(data: ArcaData): ArcaRiga {
  const t = data.testata;
  const maxRow = data.righe.reduce((m, r) => Math.max(m, r.NUMERORIGA), 0);
  return {
    ID: 0,
    ID_TESTA: t.ID,
    ESERCIZIO: t.ESERCIZIO,
    TIPODOC: t.TIPODOC,
    NUMERODOC: t.NUMERODOC,
    DATADOC: t.DATADOC,
    CODICECF: t.CODICECF,
    MAGPARTENZ: t.MAGPARTENZ,
    MAGARRIVO: t.MAGARRIVO,
    AGENTE: t.AGENTE,
    AGENTE2: t.AGENTE2,
    VALUTA: t.VALUTA,
    CAMBIO: t.CAMBIO,
    CODICEARTI: "",
    NUMERORIGA: maxRow + 1,
    ESPLDISTIN: "",
    UNMISURA: "PZ",
    QUANTITA: 1,
    QUANTITARE: 0,
    SCONTI: "",
    PREZZOUN: 0,
    PREZZOTOT: 0,
    ALIIVA: "22",
    CONTOSCARI: "",
    OMIVA: false,
    OMMERCE: false,
    PROVV: "",
    PROVV2: "",
    DATACONSEG: null,
    DESCRIZION: "",
    TIPORIGAD: "",
    RESTOSCORP: 0,
    RESTOSCUNI: 0,
    CODCAUMAG: "",
    ZONA: t.ZONA,
    SETTORE: t.SETTORE,
    GRUPPO: "",
    CLASSE: "",
    RIFFROMT: 0,
    RIFFROMR: 0,
    PREZZOTOTM: 0,
    NOTE: "",
    COMMESSA: "",
    TIMESTAMP: null,
    USERNAME: "",
    FATT: 0,
    LOTTO: "",
    MATRICOLA: "",
    EUROCAMBIO: 0,
    U_PESON: 0,
    U_PESOL: 0,
    U_COLLI: 0,
    U_GIA: 0,
    U_MAGP: "",
    U_MAGA: "",
  };
}

export function ArcaDocumentDetail({
  order,
  onClose,
  onLink,
  onUnlink,
  onDelete,
  onSave,
  onDownloadPDF,
  onNavigateToOrder,
}: ArcaDocumentDetailProps) {
  const [activeTab, setActiveTab] = useState(1);
  const arcaData = useMemo(() => parseArcaDataFromOrder(order.arcaData), [order]);

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<ArcaData | null>(null);

  const startEditing = useCallback(() => {
    if (!arcaData) return;
    setEditData(deepClone(arcaData));
    setEditing(true);
  }, [arcaData]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditData(null);
  }, []);

  const saveEditing = useCallback(() => {
    if (!editData) return;
    onSave?.(order.id, editData);
    setEditing(false);
    setEditData(null);
  }, [editData, order.id, onSave]);

  const handleRigaChange = useCallback((index: number, riga: ArcaRiga) => {
    setEditData((prev) => {
      if (!prev) return prev;
      const newRighe = [...prev.righe];
      const newTotal = calculateRowTotal(riga.PREZZOUN, riga.QUANTITA, riga.SCONTI);
      newRighe[index] = { ...riga, PREZZOTOT: newTotal };
      return recalcTotals({ ...prev, righe: newRighe });
    });
  }, []);

  const handleRemoveRiga = useCallback((index: number) => {
    setEditData((prev) => {
      if (!prev) return prev;
      const newRighe = prev.righe.filter((_, i) => i !== index);
      return recalcTotals({ ...prev, righe: newRighe });
    });
  }, []);

  const handleAddRiga = useCallback(() => {
    setEditData((prev) => {
      if (!prev) return prev;
      const newRiga = makeBlankRiga(prev);
      return recalcTotals({ ...prev, righe: [...prev.righe, newRiga] });
    });
  }, []);

  const handleTestaFieldChange = useCallback((field: keyof ArcaTestata, value: number | string) => {
    setEditData((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, testata: { ...prev.testata, [field]: value } };
      if (field === "SCONTI") {
        updated.testata.SCONTIF = cascadeDiscountToFactor(String(value));
      }
      return recalcTotals(updated);
    });
  }, []);

  const handleNavigateToOrder = useCallback(() => {
    if (!order.archibaldOrderId || !onNavigateToOrder) return;
    const firstId = parseLinkedIds(order.archibaldOrderId)[0];
    if (firstId) onNavigateToOrder(firstId);
  }, [order.archibaldOrderId, onNavigateToOrder]);

  if (!arcaData) {
    return renderNoArcaData(order, onClose, onLink, onUnlink, onDelete);
  }

  const currentData = editing && editData ? editData : arcaData;
  const t = currentData.testata;
  const pagDesc = t.PAG === "0001" ? "COME CONVENUTO" : t.PAG;

  const revenueValue = order.revenue;
  const revenuePercent = t.TOTMERCE > 0 && revenueValue != null ? ((revenueValue / t.TOTMERCE) * 100).toFixed(1) : null;

  return (
    <div style={{ ...ARCA_FONT, maxWidth: "680px" }}>
      {/* BARRA AZIONI */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px", alignItems: "center", backgroundColor: ARCA_COLORS.windowBg, borderBottom: `1px solid ${ARCA_COLORS.borderDark}` }}>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {editing ? (
            <>
              <button onClick={saveEditing} style={{ ...actionBtnStyle, backgroundColor: "#2e7d32", color: "#fff" }}>
                Salva
              </button>
              <button onClick={cancelEditing} style={actionBtnStyle}>
                Annulla
              </button>
            </>
          ) : (
            <>
              {onDownloadPDF && (
                <button onClick={() => onDownloadPDF(order)} style={actionBtnStyle}>
                  Esporta PDF
                </button>
              )}
              {onLink && (
                <button onClick={() => onLink(order.id)} style={actionBtnStyle}>
                  {order.archibaldOrderId ? "Mod. collegamento" : "Collega ordine"}
                </button>
              )}
              {order.archibaldOrderId && onUnlink && (
                <button onClick={() => onUnlink(order.id)} style={{ ...actionBtnStyle, color: "#c62828" }}>
                  Scollega
                </button>
              )}
            </>
          )}
        </div>
        <button onClick={onClose} style={closeButtonStyle}>
          X
        </button>
      </div>

      {/* ZONA 1: BANNER ORDINE MADRE */}
      {renderBanner(order, onLink, handleNavigateToOrder)}

      {/* ZONA 2: HEADER DOCUMENTO */}
      <div
        style={{
          border: `1px solid ${ARCA_COLORS.shapeBorder}`,
          backgroundColor: ARCA_COLORS.windowBg,
          padding: "2px 4px",
          marginBottom: "1px",
        }}
      >
        {/* Riga 1: Doc tipo, Numero, Data, Cliente */}
        <div style={{ display: "flex", gap: "1px", alignItems: "center", marginBottom: "1px" }}>
          <ArcaInput label="Documento" value={t.TIPODOC} width="30px" specialReadOnly />
          <ArcaInput value={`${t.NUMERODOC}/`} width="128px" style={{ fontFamily: "'Courier New', monospace", color: "#FF0000", fontSize: "9pt" }} />
          <ArcaInput label="Data" value={formatArcaDate(t.DATADOC)} width="62px" />
          <ArcaInput label="Cliente" value={t.CODICECF} width="50px" />
        </div>

        {/* Riga 2: Valuta, Cambio, Sc. Cassa, Merce */}
        <div style={{ display: "flex", gap: "1px", alignItems: "center", marginBottom: "1px" }}>
          <ArcaInput label="Valuta" value={t.VALUTA} width="41px" />
          <ArcaInput value={formatArcaDecimal(t.CAMBIO)} width="83px" align="right" />
          <ArcaInput
            label="Sconto cassa"
            value={t.SCONTOCASS || ""}
            width="62px"
            readOnly={!editing}
            onChange={editing ? (v) => handleTestaFieldChange("SCONTOCASS", v) : undefined}
          />
          <ArcaInput label="Merce" value={formatArcaCurrency(t.TOTMERCE)} width="87px" align="right" style={{ ...arcaTransparentField, color: "#800000" }} />
        </div>

        {/* Riga 3: Cod. Pag., COME CONVENUTO, Sconto merce, Tot. Doc. */}
        <div style={{ display: "flex", gap: "1px", alignItems: "center" }}>
          <ArcaInput
            label="Cod. Pag."
            value={t.PAG}
            width="40px"
            readOnly={!editing}
            onChange={editing ? (v) => handleTestaFieldChange("PAG", v) : undefined}
          />
          {t.PAG === "0001" && <span style={arcaComeConvenuto}>{pagDesc}</span>}
          <ArcaInput
            label="Sconto merce"
            value={t.SCONTI || ""}
            width="62px"
            readOnly={!editing}
            onChange={editing ? (v) => handleTestaFieldChange("SCONTI", v) : undefined}
          />
          <ArcaInput
            label="Tot. Doc."
            value={formatArcaCurrency(t.TOTDOC)}
            width="87px"
            align="right"
            style={{ ...arcaTransparentField, color: "#800000" }}
          />
        </div>

        {/* Box info cliente + Box ricavo (affiancati) */}
        <div style={{ display: "flex", gap: "4px", marginTop: "2px" }}>
          {/* Box info cliente */}
          <div
            style={{
              flex: 1,
              minHeight: "50px",
              border: `1px solid ${ARCA_COLORS.shapeBorder}`,
              backgroundColor: "#D4D0C8",
              padding: "2px 4px",
              ...ARCA_FONT,
              fontWeight: "bold",
              overflow: "hidden",
            }}
          >
            <div>{order.subClientName}</div>
            {order.subClientData?.supplRagioneSociale && (
              <div>{order.subClientData.supplRagioneSociale}</div>
            )}
            {order.subClientData?.indirizzo && (
              <div>{order.subClientData.indirizzo}</div>
            )}
            {(order.subClientData?.cap || order.subClientData?.localita || order.subClientData?.prov) && (
              <div>
                {order.subClientData.cap ? `(${order.subClientData.cap})` : ""}
                {order.subClientData.localita ? ` ${order.subClientData.localita}` : ""}
                {order.subClientData.prov ? ` ${order.subClientData.prov}` : ""}
              </div>
            )}
          </div>

          {/* Box ricavo */}
          <div
            style={{
              minWidth: "160px",
              border: `1px solid ${ARCA_COLORS.shapeBorder}`,
              backgroundColor: revenueValue != null ? (revenueValue >= 0 ? "#E8F5E9" : "#FFEBEE") : "#F5F5F5",
              padding: "4px 8px",
              ...ARCA_FONT,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            {revenueValue != null ? (
              <>
                <div style={{ fontWeight: "bold", fontSize: "9pt" }}>
                  RICAVO {"\u20AC"} {formatArcaCurrency(revenueValue)}
                  {revenuePercent && <span style={{ fontSize: "8pt" }}> ({revenuePercent}%)</span>}
                </div>
                <div style={{ fontSize: "7pt", color: "#666", marginTop: "2px" }}>
                  prezzoCliente - costoFresis
                </div>
              </>
            ) : (
              <div style={{ color: "#999", fontStyle: "italic" }}>N/D</div>
            )}
          </div>
        </div>
      </div>

      {/* Riepilogo totali rapido */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          padding: "1px 4px",
          backgroundColor: ARCA_COLORS.windowBg,
          border: `1px solid ${ARCA_COLORS.shapeBorder}`,
          marginBottom: "1px",
          flexWrap: "wrap",
        }}
      >
        <span style={ARCA_FONT}>Netto: <strong>{formatArcaCurrency(t.TOTNETTO)}</strong></span>
        <span style={ARCA_FONT}>Imponib.: <strong>{formatArcaCurrency(t.TOTIMP)}</strong></span>
        <span style={ARCA_FONT}>IVA: <strong>{formatArcaCurrency(t.TOTIVA)}</strong></span>
        <span style={ARCA_FONT}>Spese: <strong>{formatArcaCurrency(t.SPESETR + t.SPESEIM + t.SPESEVA)}</strong></span>
      </div>

      {/* ZONA 3+4: TAB BAR + CONTENUTO */}
      <ArcaTabBar tabs={TAB_NAMES} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 0 && (
          <ArcaTabTesta
            testata={t}
            destinazione={currentData.destinazione_diversa}
          />
        )}
        {activeTab === 1 && (
          <ArcaTabRighe
            righe={currentData.righe}
            editing={editing}
            onRigaChange={handleRigaChange}
            onRemoveRiga={handleRemoveRiga}
            onAddRiga={handleAddRiga}
            onEditDocument={!editing && onSave ? startEditing : undefined}
            onDeleteDocument={!editing && onDelete ? () => onDelete(order.id) : undefined}
          />
        )}
        {activeTab === 2 && (
          <ArcaTabPiede
            testata={t}
            editing={editing}
            onFieldChange={handleTestaFieldChange}
          />
        )}
        {activeTab === 3 && (
          <ArcaTabRiepilogo
            testata={t}
            righe={currentData.righe}
            order={order}
          />
        )}
        {activeTab === 4 && (
          <ArcaTabOrdineMadre
            order={order}
            onLink={onLink}
            onNavigateToOrder={onNavigateToOrder}
          />
        )}
      </ArcaTabBar>
    </div>
  );
}

function renderBanner(
  order: FresisHistoryOrder,
  onLink?: (orderId: string) => void,
  onNavigateToOrder?: () => void,
) {
  const isLinked = !!order.archibaldOrderId;
  const isArcaImport = order.source === "arca_import";

  if (isLinked) {
    // Variante A: collegata a ordine madre
    const linkedNumbers = parseLinkedIds(order.archibaldOrderNumber);
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 8px",
          backgroundColor: "#E8F5E9",
          border: "1px solid #4CAF50",
          margin: "2px 0",
          flexWrap: "wrap",
          ...ARCA_FONT,
        }}
      >
        <span style={{ fontWeight: "bold" }}>
          {"\uD83D\uDD17"} {linkedNumbers.join(", ") || order.archibaldOrderId}
        </span>
        {order.currentState && (
          <span style={{ padding: "1px 6px", backgroundColor: "#C8E6C9", borderRadius: "8px", fontSize: "7pt" }}>
            {"\u25CF"} {order.currentState}
          </span>
        )}
        <span style={{ flex: 1 }}>{order.customerName}</span>
        {order.stateUpdatedAt && (
          <span style={{ color: "#666", fontSize: "7pt" }}>Agg: {formatArcaDate(order.stateUpdatedAt)}</span>
        )}
        {onNavigateToOrder && (
          <button onClick={onNavigateToOrder} style={{ ...ARCA_FONT, background: "none", border: "none", color: "#2E7D32", cursor: "pointer", fontWeight: "bold" }}>
            Vai all'ordine
          </button>
        )}
      </div>
    );
  }

  if (isArcaImport) {
    // Variante C: importata da Arca
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 8px",
          backgroundColor: "#E3F2FD",
          border: "1px solid #1976d2",
          margin: "2px 0",
          flexWrap: "wrap",
          ...ARCA_FONT,
        }}
      >
        <span style={{ fontWeight: "bold" }}>{"\uD83D\uDCE5"} Importata da Arca</span>
        {order.invoiceNumber && <span>{order.invoiceNumber}</span>}
        <span style={{ flex: 1, color: "#666" }}>Nessun ordine madre (import diretto)</span>
        {onLink && (
          <button onClick={() => onLink(order.id)} style={{ ...ARCA_FONT, background: "none", border: "none", color: "#1976d2", cursor: "pointer", fontWeight: "bold" }}>
            Collega ordine madre
          </button>
        )}
      </div>
    );
  }

  // Variante B: non collegata
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 8px",
        backgroundColor: "#FFF3E0",
        border: "1px solid #E65100",
        margin: "2px 0",
        flexWrap: "wrap",
        ...ARCA_FONT,
      }}
    >
      <span style={{ fontWeight: "bold" }}>{"\u26A0\uFE0F"} Nessun ordine madre collegato</span>
      <span style={{ flex: 1 }} />
      {onLink && (
        <button onClick={() => onLink(order.id)} style={{ ...ARCA_FONT, background: "none", border: "none", color: "#E65100", cursor: "pointer", fontWeight: "bold" }}>
          Collega ordine madre
        </button>
      )}
    </div>
  );
}

function renderNoArcaData(
  order: FresisHistoryOrder,
  onClose: () => void,
  onLink?: (orderId: string) => void,
  onUnlink?: (orderId: string) => void,
  onDelete?: (orderId: string) => void,
) {
  return (
    <div style={{ ...ARCA_FONT, padding: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <strong>Dettaglio ordine (senza dati Arca)</strong>
        <button onClick={onClose} style={closeButtonStyle}>
          X
        </button>
      </div>
      <div style={{ padding: "8px", backgroundColor: "#FFFFF0", border: "1px solid #D4D0C8" }}>
        <p>
          <strong>Sub-cliente:</strong> {order.subClientName} ({order.subClientCodice})
        </p>
        <p>
          <strong>Data:</strong> {formatArcaDate(order.createdAt)}
        </p>
        <p>
          <strong>Articoli:</strong> {order.items.length}
        </p>
        {order.notes && (
          <p>
            <strong>Note:</strong> {order.notes}
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: "4px", marginTop: "6px", flexWrap: "wrap" }}>
        {!order.archibaldOrderId && onLink && (
          <button onClick={() => onLink(order.id)} style={actionBtnStyle}>Collega ordine</button>
        )}
        {order.archibaldOrderId && onUnlink && (
          <button onClick={() => onUnlink(order.id)} style={{ ...actionBtnStyle, color: "#c62828" }}>Scollega</button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(order.id)} style={{ ...actionBtnStyle, color: "#c62828" }}>Elimina</button>
        )}
      </div>
    </div>
  );
}

const closeButtonStyle: React.CSSProperties = {
  ...ARCA_FONT,
  padding: "2px 8px",
  border: "1px outset #D4D0C8",
  backgroundColor: "#D4D0C8",
  cursor: "pointer",
  fontWeight: "bold",
};

const actionBtnStyle: React.CSSProperties = {
  ...ARCA_FONT,
  padding: "3px 10px",
  border: "1px outset #D4D0C8",
  backgroundColor: "#D4D0C8",
  cursor: "pointer",
  fontWeight: "bold",
};

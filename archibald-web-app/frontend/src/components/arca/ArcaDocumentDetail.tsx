import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { FresisHistoryOrder } from "../../db/schema";
import { db } from "../../db/schema";
import type { ArcaData, ArcaRiga, ArcaTestata } from "../../types/arca-data";
import { ArcaInput } from "./ArcaInput";
import { ArcaTabBar } from "./ArcaTabBar";
import { ArcaTabTesta } from "./ArcaTabTesta";
import { ArcaTabRighe } from "./ArcaTabRighe";
import { ArcaTabPiede } from "./ArcaTabPiede";
import { ArcaTabRiepilogo } from "./ArcaTabRiepilogo";
import { ArcaTabOrdineMadre } from "./ArcaTabOrdineMadre";
import { parseLinkedIds } from "../../services/fresis-history.service";
import { fresisDiscountService } from "../../services/fresis-discount.service";
import {
  ARCA_FONT,
  ARCA_COLORS,
  arcaLabel,
  arcaSunkenInput,
  arcaReadOnlySpecialInput,
  arcaTransparentField,
  formatArcaCurrency,
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
  commissionRate?: number;
};

const TAB_NAMES = ["Testa", "Righe", "Piede", "Riepilogo", "Ordine Madre"];
const LABEL_W = "70px";

type HistoryState = {
  entries: ArcaData[];
  index: number;
};

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
    QUANTITA: 0,
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
  commissionRate,
}: ArcaDocumentDetailProps) {
  const [activeTab, setActiveTab] = useState(1);
  const arcaData = useMemo(() => parseArcaDataFromOrder(order.arcaData), [order]);

  // --- Undo/redo history ---
  const [histState, setHistState] = useState<HistoryState>({ entries: [], index: -1 });
  const lastInitRef = useRef<string | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!arcaData || order.id === lastInitRef.current) return;
    lastInitRef.current = order.id;
    setHistState({ entries: [deepClone(arcaData)], index: 0 });
  }, [order.id, arcaData]);

  const currentData = useMemo(() => {
    if (histState.index >= 0 && histState.index < histState.entries.length) {
      return histState.entries[histState.index];
    }
    return arcaData;
  }, [histState.index, histState.entries, arcaData]);

  const canUndo = histState.index > 0;
  const canRedo = histState.index < histState.entries.length - 1;

  const undo = useCallback(() => {
    setHistState(prev => ({ ...prev, index: Math.max(0, prev.index - 1) }));
  }, []);

  const redo = useCallback(() => {
    setHistState(prev => ({ ...prev, index: Math.min(prev.entries.length - 1, prev.index + 1) }));
  }, []);

  const pushData = useCallback((updater: (current: ArcaData) => ArcaData) => {
    setHistState(prev => {
      const data = prev.entries[prev.index];
      if (!data) return prev;
      const newData = updater(data);
      return {
        entries: [...prev.entries.slice(0, prev.index + 1), newData],
        index: prev.index + 1,
      };
    });
  }, []);

  // --- Auto-save ---
  const currentDataRef = useRef(currentData);
  currentDataRef.current = currentData;
  const histIndexRef = useRef(histState.index);
  histIndexRef.current = histState.index;

  useEffect(() => {
    if (histState.index <= 0 || !currentData) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      onSaveRef.current?.(order.id, currentData);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    }, 1500);
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    };
  }, [histState.index, currentData, order.id]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (autoSaveRef.current) {
        clearTimeout(autoSaveRef.current);
        autoSaveRef.current = null;
      }
      if (histIndexRef.current > 0 && currentDataRef.current) {
        onSaveRef.current?.(order.id, currentDataRef.current);
      }
    };
  }, [order.id]);

  // --- Change handlers ---
  const handleRigaChange = useCallback((index: number, riga: ArcaRiga) => {
    pushData(data => {
      const newRighe = [...data.righe];
      const newTotal = calculateRowTotal(riga.PREZZOUN, riga.QUANTITA, riga.SCONTI);
      newRighe[index] = { ...riga, PREZZOTOT: newTotal };
      return recalcTotals({ ...data, righe: newRighe });
    });
  }, [pushData]);

  const handleRemoveRiga = useCallback((index: number) => {
    pushData(data => {
      const newRighe = data.righe.filter((_, i) => i !== index);
      return recalcTotals({ ...data, righe: newRighe });
    });
  }, [pushData]);

  const handleAddRiga = useCallback(() => {
    pushData(data => {
      const newRiga = makeBlankRiga(data);
      return recalcTotals({ ...data, righe: [...data.righe, newRiga] });
    });
  }, [pushData]);

  const handleTestaFieldChange = useCallback((field: keyof ArcaTestata, value: number | string) => {
    pushData(data => {
      const updated = { ...data, testata: { ...data.testata, [field]: value } };
      if (field === "SCONTI") {
        updated.testata.SCONTIF = cascadeDiscountToFactor(String(value));
      }
      return recalcTotals(updated);
    });
  }, [pushData]);

  const handlePasteRighe = useCallback((pastedRighe: ArcaRiga[]) => {
    pushData(data => {
      const maxRow = data.righe.reduce((m, r) => Math.max(m, r.NUMERORIGA), 0);
      const adjusted = pastedRighe.map((r, i) => ({
        ...r,
        ID_TESTA: data.testata.ID,
        ESERCIZIO: data.testata.ESERCIZIO,
        TIPODOC: data.testata.TIPODOC,
        NUMERODOC: data.testata.NUMERODOC,
        DATADOC: data.testata.DATADOC,
        CODICECF: data.testata.CODICECF,
        MAGPARTENZ: data.testata.MAGPARTENZ,
        MAGARRIVO: data.testata.MAGARRIVO,
        NUMERORIGA: maxRow + i + 1,
      }));
      return recalcTotals({ ...data, righe: [...data.righe, ...adjusted] });
    });
  }, [pushData]);

  const handleNavigateToOrder = useCallback(() => {
    if (!order.archibaldOrderId || !onNavigateToOrder) return;
    const firstId = parseLinkedIds(order.archibaldOrderId)[0];
    if (firstId) onNavigateToOrder(firstId);
  }, [order.archibaldOrderId, onNavigateToOrder]);

  // Flush pending auto-save before closing
  const handleClose = useCallback(() => {
    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
      autoSaveRef.current = null;
      if (histIndexRef.current > 0 && currentDataRef.current) {
        onSaveRef.current?.(order.id, currentDataRef.current);
      }
    }
    onClose();
  }, [order.id, onClose]);

  // --- Revenue calculation: listPrice × qty × (1 - fresisDiscount%) ---
  const [revenueData, setRevenueData] = useState<{ value: number; percent: string | null } | null>(null);

  useEffect(() => {
    if (!currentData || currentData.righe.length === 0) {
      setRevenueData(null);
      return;
    }

    let cancelled = false;

    const compute = async () => {
      const righe = currentData.righe;
      const totNetto = currentData.testata.TOTNETTO;
      let totalFresisCost = 0;

      for (const riga of righe) {
        if (!riga.CODICEARTI || riga.QUANTITA === 0) continue;

        const product = await db.products
          .where("article")
          .equals(riga.CODICEARTI)
          .first();

        const listPrice = product?.price ?? 0;
        if (listPrice === 0) continue;

        const discountPercent = await fresisDiscountService.getDiscountForArticle(
          product?.id ?? "",
          riga.CODICEARTI,
        );

        totalFresisCost += listPrice * riga.QUANTITA * (1 - discountPercent / 100);
      }

      if (cancelled) return;

      const value = totNetto - totalFresisCost;
      const percent = totNetto > 0 ? ((value / totNetto) * 100).toFixed(1) : null;
      setRevenueData({ value, percent });
    };

    compute();
    return () => { cancelled = true; };
  }, [currentData]);

  if (!arcaData || !currentData) {
    return renderNoArcaData(order, handleClose, onLink, onUnlink, onDelete);
  }

  const t = currentData.testata;
  const revenueValue = revenueData?.value ?? null;
  const revenuePercent = revenueData?.percent ?? null;

  return (
    <div style={{ ...ARCA_FONT, maxWidth: "680px" }}>
      {/* BARRA AZIONI */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px", alignItems: "center", backgroundColor: ARCA_COLORS.windowBg, borderBottom: `1px solid ${ARCA_COLORS.borderDark}` }}>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={undo} disabled={!canUndo} style={{ ...actionBtnStyle, opacity: canUndo ? 1 : 0.35, padding: "3px 8px" }} title="Annulla operazione">
            {"\u2190"}
          </button>
          <button onClick={redo} disabled={!canRedo} style={{ ...actionBtnStyle, opacity: canRedo ? 1 : 0.35, padding: "3px 8px" }} title="Rifai operazione">
            {"\u2192"}
          </button>
          {showSaved && (
            <span style={{ ...ARCA_FONT, color: "#2e7d32", fontSize: "7pt" }}>Salvato</span>
          )}
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
          {onDelete && (
            <button onClick={() => onDelete(order.id)} style={{ ...actionBtnStyle, color: "#c62828" }}>
              Elimina FT
            </button>
          )}
        </div>
        <button onClick={handleClose} style={closeButtonStyle}>
          X
        </button>
      </div>

      {/* ZONA 1: BANNER ORDINE MADRE */}
      {renderBanner(order, onLink, handleNavigateToOrder)}

      {/* ZONA 2: HEADER DOCUMENTO — 2 colonne */}
      <div
        style={{
          border: `1px solid ${ARCA_COLORS.shapeBorder}`,
          backgroundColor: ARCA_COLORS.windowBg,
          padding: "4px 6px",
          marginBottom: "1px",
        }}
      >
        <div style={{ display: "flex", gap: "6px" }}>
          {/* Left: Fields stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", flexShrink: 0 }}>
            {/* Documento (2 inputs) */}
            <div style={{ display: "flex", alignItems: "center", gap: "1px" }}>
              <span style={{ ...arcaLabel, width: LABEL_W, flexShrink: 0 }}>Documento</span>
              <input
                type="text"
                value={t.TIPODOC}
                readOnly
                style={{ ...arcaReadOnlySpecialInput, width: "30px", height: "16px", lineHeight: "14px" }}
              />
              <input
                type="text"
                value={`${t.NUMERODOC}/`}
                readOnly
                style={{ ...arcaSunkenInput, width: "90px", height: "16px", lineHeight: "14px", color: "#FF0000" }}
              />
            </div>
            <ArcaInput label="Data" value={formatArcaDate(t.DATADOC)} width="120px" labelWidth={LABEL_W} />
            <ArcaInput label="Cliente" value={t.CODICECF} width="120px" labelWidth={LABEL_W} />
            <ArcaInput
              label="Sconto Tot"
              value={t.SCONTI || ""}
              width="120px"
              labelWidth={LABEL_W}
              readOnly={false}
              onChange={(v) => handleTestaFieldChange("SCONTI", v)}
            />
            <ArcaInput
              label="Impon."
              value={formatArcaCurrency(t.TOTIMP)}
              width="120px"
              labelWidth={LABEL_W}
              align="right"
              style={{ ...arcaTransparentField, color: "#800000" }}
            />
            <ArcaInput
              label="Tot. Doc."
              value={formatArcaCurrency(t.TOTDOC)}
              width="120px"
              labelWidth={LABEL_W}
              align="right"
              style={{ ...arcaTransparentField, color: "#800000" }}
            />
          </div>

          {/* Right: Client box */}
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
        </div>
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
            onRigaChange={handleRigaChange}
            onRemoveRiga={handleRemoveRiga}
            onAddRiga={handleAddRiga}
            onPasteRighe={handlePasteRighe}
            revenueValue={revenueValue}
            revenuePercent={revenuePercent}
            commissionRate={commissionRate}
          />
        )}
        {activeTab === 2 && (
          <ArcaTabPiede
            testata={t}
            editing={true}
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
  backgroundColor: "#c62828",
  color: "#FFFFFF",
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

import { useState, useMemo, useCallback } from "react";
import type { FresisHistoryOrder } from "../../db/schema";
import type { ArcaData, ArcaRiga, ArcaTestata } from "../../types/arca-data";
import { ArcaInput } from "./ArcaInput";
import { ArcaTabBar } from "./ArcaTabBar";
import { ArcaTabTesta } from "./ArcaTabTesta";
import { ArcaTabRighe } from "./ArcaTabRighe";
import { ArcaTabPiede } from "./ArcaTabPiede";
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
};

const TAB_NAMES = ["Testa", "Righe", "Piede"];

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

  if (!arcaData) {
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
            <button onClick={() => onLink(order.id)} style={editBtnStyle}>Collega ordine</button>
          )}
          {order.archibaldOrderId && onUnlink && (
            <button onClick={() => onUnlink(order.id)} style={{ ...editBtnStyle, color: "#c62828" }}>Scollega</button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(order.id)} style={{ ...editBtnStyle, color: "#c62828" }}>Elimina</button>
          )}
        </div>
      </div>
    );
  }

  const currentData = editing && editData ? editData : arcaData;
  const t = currentData.testata;
  const pagDesc = t.PAG === "0001" ? "COME CONVENUTO" : t.PAG;

  return (
    <div style={{ ...ARCA_FONT, maxWidth: "632px" }}>
      {/* Top bar: all actions + Close */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {!editing && onSave && (
            <button onClick={startEditing} style={editBtnStyle}>
              Modifica
            </button>
          )}
          {editing && (
            <>
              <button onClick={saveEditing} style={{ ...editBtnStyle, backgroundColor: "#2e7d32", color: "#fff" }}>
                Salva
              </button>
              <button onClick={cancelEditing} style={editBtnStyle}>
                Annulla
              </button>
            </>
          )}
          {!editing && !order.archibaldOrderId && onLink && (
            <button onClick={() => onLink(order.id)} style={editBtnStyle}>
              Collega ordine
            </button>
          )}
          {!editing && order.archibaldOrderId && onUnlink && (
            <button onClick={() => onUnlink(order.id)} style={{ ...editBtnStyle, color: "#c62828" }}>
              Scollega
            </button>
          )}
          {!editing && onDelete && (
            <button onClick={() => onDelete(order.id)} style={{ ...editBtnStyle, color: "#c62828" }}>
              Elimina
            </button>
          )}
        </div>
        <button onClick={onClose} style={closeButtonStyle}>
          X
        </button>
      </div>

      {/* Header fisso (3 righe) + pannello info cliente */}
      <div
        style={{
          border: `1px solid ${ARCA_COLORS.shapeBorder}`,
          backgroundColor: ARCA_COLORS.windowBg,
          padding: "2px 4px",
          marginBottom: "1px",
          display: "flex",
          gap: "2px",
        }}
      >
        {/* Sinistra: campi documento */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Riga 1: Doc tipo, Numero, Data, Cliente (Top=2) */}
          <div style={{ display: "flex", gap: "1px", alignItems: "center", marginBottom: "1px" }}>
            <ArcaInput label="Documento" value={t.TIPODOC} width="30px" specialReadOnly />
            <ArcaInput value={`${t.NUMERODOC}/`} width="128px" style={{ fontFamily: "'Courier New', monospace", color: "#FF0000", fontSize: "9pt" }} />
            <ArcaInput label="Data Docum." value={formatArcaDate(t.DATADOC)} width="62px" />
            <ArcaInput label="Cliente / Fornit." value={t.CODICECF} width="50px" />
          </div>

          {/* Riga 2: Valuta, Cambio, Sc. Cassa, Merce (Top=25) */}
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

          {/* Riga 3: Cod. Pag., COME CONVENUTO, Sconto merce, Tot. Doc. (Top≈48) */}
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
        </div>

        {/* Destra: pannello info cliente (Edtanagrafe: W=176, H=67) */}
        <div
          style={{
            width: "176px",
            minHeight: "67px",
            border: `1px solid ${ARCA_COLORS.shapeBorder}`,
            backgroundColor: ARCA_COLORS.fieldBg,
            padding: "2px 4px",
            ...ARCA_FONT,
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "2px" }}>
            {order.subClientName}
          </div>
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
        {order.revenue != null && (
          <span
            style={{
              ...ARCA_FONT,
              color: order.revenue >= 0 ? "#006600" : "#CC0000",
              fontWeight: "bold",
            }}
          >
            Ricavo: {formatArcaCurrency(order.revenue)}
          </span>
        )}
      </div>

      {/* Tab bar */}
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
          />
        )}
        {activeTab === 2 && (
          <ArcaTabPiede
            testata={t}
            editing={editing}
            onFieldChange={handleTestaFieldChange}
          />
        )}
      </ArcaTabBar>

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

const editBtnStyle: React.CSSProperties = {
  ...ARCA_FONT,
  padding: "3px 10px",
  border: "1px outset #D4D0C8",
  backgroundColor: "#D4D0C8",
  cursor: "pointer",
  fontWeight: "bold",
};


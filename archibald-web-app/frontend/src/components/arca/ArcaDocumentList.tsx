import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { List } from "react-window";
import type { FresisHistoryOrder } from "../../types/fresis";
import type { SubClient } from "../../types/sub-client";
import type { ArcaData } from "../../types/arca-data";
import {
  ARCA_FONT,
  ARCA_GRID,
  arcaHeaderRow,
  arcaRowStyle,
  arcaGridCell,
  ARCA_COLORS,
  formatArcaCurrency,
  formatArcaDate,
} from "./arcaStyles";

type SortField =
  | "numerodoc"
  | "datadoc"
  | "codicecf"
  | "cliente"
  | "supragsoc"
  | "totale"
  | "stato"
  | "revenue";
type SortDir = "asc" | "desc";

type ArcaDocumentListProps = {
  orders: FresisHistoryOrder[];
  selectedId: string | null;
  onSelect: (order: FresisHistoryOrder) => void;
  onDoubleClick: (order: FresisHistoryOrder) => void;
  height?: number;
  onScrollNearEnd?: () => void;
};

type ParsedOrder = {
  order: FresisHistoryOrder;
  ftNumber: string;
  datadoc: string;
  codicecf: string;
  cliente: string;
  supragsoc: string;
  totale: number;
  revenue: number | undefined;
  stato: string;
};

function parseOrder(order: FresisHistoryOrder): ParsedOrder {
  let arcaData: ArcaData | null = null;
  if (order.arcaData) {
    if (typeof order.arcaData === 'object') {
      arcaData = order.arcaData as unknown as ArcaData;
    } else {
      try {
        arcaData = JSON.parse(order.arcaData) as ArcaData;
      } catch {
        /* ignore */
      }
    }
  }

  const testata = arcaData?.testata;

  let subClientData: SubClient | null = null;
  if (order.subClientData) {
    if (typeof order.subClientData === "object") {
      subClientData = order.subClientData;
    } else {
      try {
        subClientData = JSON.parse(order.subClientData as unknown as string) as SubClient;
      } catch {
        /* ignore */
      }
    }
  }

  return {
    order,
    ftNumber: testata
      ? `${testata.TIPODOC} ${testata.NUMERODOC}/${testata.ESERCIZIO}`
      : (order.invoiceNumber ?? ""),
    datadoc: testata?.DATADOC ?? order.createdAt,
    codicecf: order.subClientCodice || testata?.CODICECF || "",
    cliente: order.subClientName || order.subClientCodice,
    supragsoc: subClientData?.supplRagioneSociale ?? "",
    totale: testata?.TOTDOC ?? order.targetTotalWithVAT ?? 0,
    revenue: order.revenue,
    stato:
      order.source === "app"
        ? "generato_pwa"
        : (order.currentState ?? (order.source === "arca_import" ? "importato_arca" : "")),
  };
}

function compareParsed(
  a: ParsedOrder,
  b: ParsedOrder,
  field: SortField,
  dir: SortDir,
): number {
  let cmp = 0;
  switch (field) {
    case "numerodoc":
      cmp = a.ftNumber.localeCompare(b.ftNumber);
      break;
    case "datadoc":
      cmp = (a.datadoc || "").localeCompare(b.datadoc || "");
      break;
    case "codicecf":
      cmp = a.codicecf.localeCompare(b.codicecf);
      break;
    case "cliente":
      cmp = a.cliente.localeCompare(b.cliente);
      break;
    case "supragsoc":
      cmp = a.supragsoc.localeCompare(b.supragsoc);
      break;
    case "totale":
      cmp = a.totale - b.totale;
      break;
    case "stato":
      cmp = a.stato.localeCompare(b.stato);
      break;
    case "revenue":
      cmp = (a.revenue ?? 0) - (b.revenue ?? 0);
      break;
  }
  return dir === "asc" ? cmp : -cmp;
}

const COLUMNS = [
  { field: "numerodoc" as SortField, label: "N. Doc.", width: 170 },
  { field: "datadoc" as SortField, label: "Data", width: 110 },
  { field: "codicecf" as SortField, label: "Cod. Cl.", width: 90 },
  { field: "cliente" as SortField, label: "Cliente", width: 200 },
  { field: "supragsoc" as SortField, label: "Suppl. Rag. Soc.", width: 160 },
  { field: "totale" as SortField, label: "Tot. Doc.", width: 110 },
  { field: "stato" as SortField, label: "Stato", width: 140 },
  { field: "revenue" as SortField, label: "Ricavo", width: 110 },
];

const ROW_HEIGHT = ARCA_GRID.elencoRowHeight;
const HEADER_HEIGHT = ARCA_GRID.elencoHeaderHeight;

const STATE_LABELS: Record<string, string> = {
  piazzato: "Su Archibald",
  inviato_milano: "Attesa approv.",
  ordine_aperto: "In lavorazione",
  trasferito: "In lavorazione",
  transfer_error: "Intervento",
  modifica: "Intervento",
  spedito: "In transito",
  consegnato: "Consegnato",
  fatturato: "Fatturato",
  pagamento_scaduto: "Pag. scaduto",
  pagato: "Pagato",
  importato_arca: "Import Arca",
  creato_pwa: "Creato in PWA",
  generato_pwa: "Generato da PWA",
  cancellato_in_arca: "Cancellato",
};

type CustomRowProps = {
  sorted: ParsedOrder[];
  selectedId: string | null;
  onSelect: (order: FresisHistoryOrder) => void;
  onDoubleClick: (order: FresisHistoryOrder) => void;
};

function ArcaRow({
  index,
  style: rowStyle,
  sorted,
  selectedId,
  onSelect,
  onDoubleClick,
}: {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: object;
} & CustomRowProps) {
  const item = sorted[index];
  const isSelected = item.order.id === selectedId;
  const rowBaseStyle = arcaRowStyle(index, isSelected);
  const isCancelled = item.order.currentState === 'cancellato_in_arca';

  const lastColIdx = COLUMNS.length - 1;

  return (
    <div
      style={{
        ...rowStyle,
        ...rowBaseStyle,
        display: "flex",
        alignItems: "center",
        textDecoration: isCancelled ? 'line-through' : 'none',
        opacity: isCancelled ? 0.5 : 1,
        pointerEvents: isCancelled ? 'none' : 'auto',
      }}
      onClick={() => onSelect(item.order)}
      onDoubleClick={() => onDoubleClick(item.order)}
    >
      <div style={arcaGridCell(COLUMNS[0].width)}>
        {isCancelled && (
          <span style={{
            display: 'inline-block',
            fontSize: 9,
            color: '#cc0000',
            fontWeight: 600,
            textDecoration: 'none',
            marginRight: 4,
          }}>
            ANNULLATO
          </span>
        )}
        {item.ftNumber}
      </div>
      <div style={arcaGridCell(COLUMNS[1].width)}>
        {formatArcaDate(item.datadoc)}
      </div>
      <div style={arcaGridCell(COLUMNS[2].width)}>
        {item.codicecf}
      </div>
      <div style={arcaGridCell(COLUMNS[3].width)}>
        {item.cliente}
      </div>
      <div style={arcaGridCell(COLUMNS[4].width)}>
        {item.supragsoc}
      </div>
      <div style={arcaGridCell(COLUMNS[5].width, "right")}>
        {formatArcaCurrency(item.totale)}
      </div>
      <div style={arcaGridCell(COLUMNS[6].width)}>
        {STATE_LABELS[item.stato] ?? item.stato}
      </div>
      <div
        style={{
          ...arcaGridCell(COLUMNS[lastColIdx].width, "right"),
          borderRight: "none",
          color:
            item.revenue != null
              ? item.revenue >= 0
                ? "#006600"
                : "#CC0000"
              : "#999",
          fontWeight: item.revenue != null ? "bold" : "normal",
        }}
      >
        {item.revenue != null ? formatArcaCurrency(item.revenue) : "-"}
      </div>
    </div>
  );
}

export function ArcaDocumentList({
  orders,
  selectedId,
  onSelect,
  onDoubleClick,
  height = 500,
  onScrollNearEnd,
}: ArcaDocumentListProps) {
  const [sortField, setSortField] = useState<SortField>("datadoc");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => orders.map(parseOrder), [orders]);

  const sorted = useMemo(() => {
    const copy = [...parsed];
    copy.sort((a, b) => compareParsed(a, b, sortField, sortDir));
    return copy;
  }, [parsed, sortField, sortDir]);

  const handleHeaderClick = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField],
  );

  const rowProps: CustomRowProps = useMemo(
    () => ({ sorted, selectedId, onSelect, onDoubleClick }),
    [sorted, selectedId, onSelect, onDoubleClick],
  );

  useEffect(() => {
    if (!onScrollNearEnd) return;
    const container = containerRef.current;
    if (!container) return;

    const scrollEl = container.querySelector('[style*="overflow"]') as HTMLElement;
    if (!scrollEl) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      if (scrollHeight - scrollTop - clientHeight < 200) {
        onScrollNearEnd();
      }
    };

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [onScrollNearEnd, sorted.length]);

  return (
    <div
      ref={containerRef}
      style={{
        ...ARCA_FONT,
        border: `1px solid ${ARCA_COLORS.shapeBorder}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          height: HEADER_HEIGHT,
          alignItems: "center",
        }}
      >
        {COLUMNS.map((col, colIdx) => (
          <div
            key={col.field}
            onClick={() => handleHeaderClick(col.field)}
            style={{
              ...arcaHeaderRow,
              width: col.width,
              display: "flex",
              alignItems: "center",
              gap: "4px",
              height: "100%",
              boxSizing: "border-box",
              borderRight: colIdx === COLUMNS.length - 1 ? "none" : arcaHeaderRow.borderRight,
            }}
          >
            {col.label}
            {sortField === col.field && (
              <span style={{ fontSize: "9px", color: "#FFFFFF" }}>
                {sortDir === "asc" ? "\u25B2" : "\u25BC"}
              </span>
            )}
          </div>
        ))}
      </div>
      {/* Virtualized rows */}
      <List<CustomRowProps>
        rowCount={sorted.length}
        rowHeight={ROW_HEIGHT}
        rowComponent={ArcaRow}
        rowProps={rowProps}
        overscanCount={10}
        style={{ height: height - HEADER_HEIGHT }}
      />
    </div>
  );
}

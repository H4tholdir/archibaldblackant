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
  | "revenue"
  | "recency";
type SortDir = "asc" | "desc";

type ArcaDocumentListProps = {
  orders: FresisHistoryOrder[];
  selectedId: string | null;
  onSelect: (order: FresisHistoryOrder) => void;
  onDoubleClick: (order: FresisHistoryOrder) => void;
  height?: number;
  onScrollNearEnd?: () => void;
  docTypeFilter: 'all' | 'ft_only' | 'kt_only';
};

export type ParsedOrder = {
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

export function extractDocNum(ftNumber: string): number {
  const match = ftNumber.match(/(\d+)\//);
  return match ? parseInt(match[1], 10) : 0;
}

export function filterByDocType<T extends { ftNumber: string }>(
  items: T[],
  filter: 'all' | 'ft_only' | 'kt_only',
): T[] {
  if (filter === 'all') return items;
  return items.filter(item => {
    const isKt = item.ftNumber.startsWith('KT ');
    return filter === 'kt_only' ? isKt : !isKt;
  });
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
    case "recency": {
      const dateCmp = (a.datadoc || "").localeCompare(b.datadoc || "");
      if (dateCmp !== 0) { cmp = dateCmp; break; }
      cmp = extractDocNum(a.ftNumber) - extractDocNum(b.ftNumber);
      break;
    }
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

export function getCellText(row: ParsedOrder, colIdx: number): string {
  switch (colIdx) {
    case 0: return row.ftNumber;
    case 1: return formatArcaDate(row.datadoc);
    case 2: return row.codicecf;
    case 3: return row.cliente;
    case 4: return row.supragsoc;
    case 5: return formatArcaCurrency(row.totale);
    case 6: return STATE_LABELS[row.stato] ?? row.stato;
    case 7: return row.revenue != null ? formatArcaCurrency(row.revenue) : "-";
    default: return "";
  }
}

type CustomRowProps = {
  sorted: ParsedOrder[];
  selectedId: string | null;
  onSelect: (order: FresisHistoryOrder) => void;
  onDoubleClick: (order: FresisHistoryOrder) => void;
  colWidths: number[];
};

function ArcaRow({
  index,
  style: rowStyle,
  sorted,
  selectedId,
  onSelect,
  onDoubleClick,
  colWidths,
}: {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: object;
} & CustomRowProps) {
  const item = sorted[index];
  const isSelected = item.order.id === selectedId;
  const rowBaseStyle = arcaRowStyle(index, isSelected);
  const isCancelled = item.order.currentState === 'cancellato_in_arca';
  const rowTotalWidth = colWidths.reduce((sum, w) => sum + w, 0);

  const lastColIdx = COLUMNS.length - 1;

  return (
    <div
      style={{
        ...rowStyle,
        ...rowBaseStyle,
        width: rowTotalWidth,
        display: "flex",
        alignItems: "center",
        textDecoration: isCancelled ? 'line-through' : 'none',
        opacity: isCancelled ? 0.5 : 1,
        pointerEvents: isCancelled ? 'none' : 'auto',
      }}
      onClick={() => onSelect(item.order)}
      onDoubleClick={() => onDoubleClick(item.order)}
    >
      <div style={arcaGridCell(colWidths[0])}>
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
      <div style={arcaGridCell(colWidths[1])}>
        {formatArcaDate(item.datadoc)}
      </div>
      <div style={arcaGridCell(colWidths[2])}>
        {item.codicecf}
      </div>
      <div style={arcaGridCell(colWidths[3])}>
        {item.cliente}
      </div>
      <div style={arcaGridCell(colWidths[4])}>
        {item.supragsoc}
      </div>
      <div style={arcaGridCell(colWidths[5], "right")}>
        {formatArcaCurrency(item.totale)}
      </div>
      <div style={arcaGridCell(colWidths[6])}>
        {STATE_LABELS[item.stato] ?? item.stato}
      </div>
      <div
        style={{
          ...arcaGridCell(colWidths[lastColIdx], "right"),
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
  docTypeFilter,
}: ArcaDocumentListProps) {
  const [sortField, setSortField] = useState<SortField>("recency");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const saveWidths = useCallback((widths: number[]) => {
    localStorage.setItem('fresis-history-col-widths', JSON.stringify(widths));
  }, []);

  const [colWidths, setColWidths] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('fresis-history-col-widths');
      if (saved) {
        const w = JSON.parse(saved) as number[];
        if (Array.isArray(w) && w.length === COLUMNS.length) return w;
      }
    } catch { /* ignore */ }
    return COLUMNS.map(c => c.width);
  });

  const totalWidth = useMemo(
    () => colWidths.reduce((sum, w) => sum + w, 0),
    [colWidths],
  );

  const parsed = useMemo(() => orders.map(parseOrder), [orders]);

  const filtered = useMemo(
    () => filterByDocType(parsed, docTypeFilter),
    [parsed, docTypeFilter],
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => compareParsed(a, b, sortField, sortDir));
    return copy;
  }, [filtered, sortField, sortDir]);

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

  const startResize = useCallback((e: React.MouseEvent, colIdx: number) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[colIdx];
    let latestWidths: number[] = colWidths;

    const onMouseMove = (ev: MouseEvent) => {
      const newW = Math.max(40, startWidth + ev.clientX - startX);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setColWidths(prev => {
          const next = [...prev];
          next[colIdx] = newW;
          latestWidths = next;
          return next;
        });
      });
    };

    const cleanup = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', cleanup);
      window.removeEventListener('blur', cleanup);
      saveWidths(latestWidths);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', cleanup);
    window.addEventListener('blur', cleanup);
  }, [colWidths, saveWidths]);

  const autoFit = useCallback((colIdx: number) => {
    const headerLen = COLUMNS[colIdx].label.length;
    const maxLen = filtered.reduce((max, row) => {
      return Math.max(max, getCellText(row, colIdx).length);
    }, headerLen);
    const newW = Math.max(40, maxLen * 8 + 24);
    const next = [...colWidths];
    next[colIdx] = newW;
    saveWidths(next);
    setColWidths(next);
  }, [filtered, saveWidths, colWidths]);

  const rowProps: CustomRowProps = useMemo(
    () => ({ sorted, selectedId, onSelect, onDoubleClick, colWidths }),
    [sorted, selectedId, onSelect, onDoubleClick, colWidths],
  );

  useEffect(() => {
    if (!onScrollNearEnd) return;
    const container = containerRef.current;
    if (!container) return;

    const allScrollEls = container.querySelectorAll('[style*="overflow"]');
    const scrollEl = allScrollEls[allScrollEls.length - 1] as HTMLElement | undefined;
    if (!scrollEl) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      if (scrollHeight - scrollTop - clientHeight < 200) {
        onScrollNearEnd();
      }
    };

    // Proactive check: se il contenuto non riempie il viewport, carica subito altro
    if (scrollEl.scrollHeight - scrollEl.clientHeight < 200) {
      onScrollNearEnd();
    }

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [onScrollNearEnd, sorted.length]);

  return (
    <div
      ref={containerRef}
      style={{
        ...ARCA_FONT,
        border: `1px solid ${ARCA_COLORS.shapeBorder}`,
        overflowX: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          height: HEADER_HEIGHT,
          alignItems: "center",
          width: totalWidth,
        }}
      >
        {COLUMNS.map((col, colIdx) => (
          <div
            key={col.field}
            onClick={() => handleHeaderClick(col.field)}
            style={{
              ...arcaHeaderRow,
              width: colWidths[colIdx],
              position: 'relative',
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
            <div
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 0, width: 5,
                cursor: 'col-resize',
                background: 'rgba(255,255,255,0.15)',
              }}
              onMouseDown={(e) => { e.stopPropagation(); startResize(e, colIdx); }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => { e.stopPropagation(); autoFit(colIdx); }}
            />
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
        style={{ height: height - HEADER_HEIGHT, width: totalWidth, overflowX: 'hidden' }}
      />
    </div>
  );
}

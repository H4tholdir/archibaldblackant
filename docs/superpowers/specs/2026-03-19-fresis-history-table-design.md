# Spec: Fresis History Table — 3 Feature

**Data:** 2026-03-19
**Pagina:** `/fresis-history` → `FresisHistoryPage.tsx` + `ArcaDocumentList.tsx`

---

## Contesto

La pagina Storico Fresis mostra una tabella di documenti FT/KT con virtualizzazione `react-window`. Sono richieste 3 migliorie indipendenti: filtro per tipo documento, ordinamento default più intelligente, colonne ridimensionabili stile Excel.

---

## Feature 1 — Filtro tipo documento (KT / FT / Tutti)

### Stato (in FresisHistoryPage)
```ts
const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'ft_only' | 'kt_only'>('all');
```

### UI (in FresisHistoryPage — filter bar)
Terza riga nella filter bar, sotto i chip temporali, con etichetta `"Tipo doc:"`.
3 chip selezionabili renderizzati da `FresisHistoryPage`:

```tsx
<div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
  <span style={{ fontSize: "9px", fontWeight: 700, color: "#555", textTransform: "uppercase" }}>
    Tipo doc:
  </span>
  {(
    [
      { id: 'all', label: 'Tutti' },
      { id: 'ft_only', label: 'Solo FT' },
      { id: 'kt_only', label: 'Solo KT' },
    ] as const
  ).map(({ id, label }) => {
    const isActive = docTypeFilter === id;
    const isKt = id === 'kt_only';
    return (
      <button
        key={id}
        onClick={() => setDocTypeFilter(id)}
        style={{
          padding: "3px 10px",
          fontSize: "11px",
          fontWeight: isActive ? 700 : 400,
          border: isActive
            ? `1px solid ${isKt ? '#ff9800' : '#1976d2'}`
            : "1px solid #ddd",
          borderRadius: "12px",
          backgroundColor: isActive
            ? (isKt ? '#FFF3E0' : '#E3F2FD')
            : "#fff",
          color: isActive
            ? (isKt ? '#e65100' : '#1976d2')
            : "#666",
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  })}
</div>
```

### Prop passata a ArcaDocumentList
```ts
// Aggiornamento di ArcaDocumentListProps:
type ArcaDocumentListProps = {
  orders: FresisHistoryOrder[];
  selectedId: string | null;
  onSelect: (order: FresisHistoryOrder) => void;
  onDoubleClick: (order: FresisHistoryOrder) => void;
  height?: number;
  onScrollNearEnd?: () => void;
  docTypeFilter: 'all' | 'ft_only' | 'kt_only';  // aggiunto
};
```

### hasActiveFilters + handleClearFilters (in FresisHistoryPage)
```ts
const hasActiveFilters =
  selectedSubClient !== null ||
  activeTimePreset !== null ||
  globalSearch !== "" ||
  docTypeFilter !== 'all';   // aggiunto

// handleClearFilters aggiunge:
setDocTypeFilter('all');
```

### Logica filtro (in ArcaDocumentList)
Memo intermedio `filtered` tra `parsed` e `sorted`:

```ts
const filtered = useMemo(() => {
  if (docTypeFilter === 'all') return parsed;
  return parsed.filter(item => {
    const isKt = item.ftNumber.startsWith('KT ');
    return docTypeFilter === 'kt_only' ? isKt : !isKt;
  });
}, [parsed, docTypeFilter]);

const sorted = useMemo(() => {
  const copy = [...filtered];
  copy.sort((a, b) => compareParsed(a, b, sortField, sortDir));
  return copy;
}, [filtered, sortField, sortDir]);
```

**Nota KT detection:** `ftNumber` ha formato `"KT 348/2026"` (con spazio). `startsWith('KT ')` è affidabile. Per i documenti senza arcaData, `order.invoiceNumber` segue lo stesso formato — se non lo segue, il documento ricade in "FT" (comportamento accettabile).

---

## Feature 2 — Ordinamento default combinato (data + numero documento)

### Aggiornamento tipo SortField
```ts
type SortField =
  | "numerodoc" | "datadoc" | "codicecf" | "cliente"
  | "supragsoc" | "totale" | "stato" | "revenue"
  | "recency";   // aggiunto
```

### Helper (aggiungere prima di compareParsed)
```ts
function extractDocNum(ftNumber: string): number {
  // Estrae il numero dal formato "KT 348/2026" o "FT 336/2026" → 348, 336
  const match = ftNumber.match(/(\d+)\//);
  return match ? parseInt(match[1], 10) : 0;
}
```

### Aggiornamento completo di compareParsed
```ts
function compareParsed(a: ParsedOrder, b: ParsedOrder, field: SortField, dir: SortDir): number {
  let cmp = 0;
  switch (field) {
    case "numerodoc": cmp = a.ftNumber.localeCompare(b.ftNumber); break;
    case "datadoc":   cmp = (a.datadoc || "").localeCompare(b.datadoc || ""); break;
    case "codicecf":  cmp = a.codicecf.localeCompare(b.codicecf); break;
    case "cliente":   cmp = a.cliente.localeCompare(b.cliente); break;
    case "supragsoc": cmp = a.supragsoc.localeCompare(b.supragsoc); break;
    case "totale":    cmp = a.totale - b.totale; break;
    case "stato":     cmp = a.stato.localeCompare(b.stato); break;
    case "revenue":   cmp = (a.revenue ?? 0) - (b.revenue ?? 0); break;
    case "recency": {
      const dateCmp = (a.datadoc || "").localeCompare(b.datadoc || "");
      if (dateCmp !== 0) { cmp = dateCmp; break; }
      cmp = extractDocNum(a.ftNumber) - extractDocNum(b.ftNumber);
      break;
    }
  }
  return dir === "asc" ? cmp : -cmp;
}
```

### Default state
```ts
const [sortField, setSortField] = useState<SortField>("recency");
const [sortDir, setSortDir] = useState<SortDir>("desc");
```

### UX
- `"recency"` non ha una colonna nell'header → al caricamento iniziale nessun header mostra la freccia attiva. Comportamento intenzionale.
- Al primo click su qualsiasi colonna, `handleHeaderClick` cambia `sortField` a quella colonna con `sortDir = "asc"` (comportamento esistente invariato). Non esiste un percorso UI per tornare a `"recency"`.

---

## Feature 3 — Colonne ridimensionabili (drag + double-click auto-fit)

### saveWidths (helper locale)
```ts
const saveWidths = useCallback((widths: number[]) => {
  localStorage.setItem('fresis-history-col-widths', JSON.stringify(widths));
}, []);
```

### Stato (lazy init da localStorage)
```ts
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
```

### totalWidth
```ts
const totalWidth = useMemo(() => colWidths.reduce((sum, w) => sum + w, 0), [colWidths]);
```

### Header cells — markup completo con resize handle
Ogni header cell usa `colWidths[colIdx]` (non `col.width`) e include il resize handle con `onMouseDown` e `onDoubleClick`:

```tsx
<div
  key={col.field}
  onClick={() => handleHeaderClick(col.field)}
  style={{
    ...arcaHeaderRow,
    width: colWidths[colIdx],        // colWidths, non col.width
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
      {sortDir === "asc" ? "▲" : "▼"}
    </span>
  )}
  {/* Resize handle */}
  <div
    style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: 5,
      cursor: 'col-resize',
      background: 'rgba(255,255,255,0.15)',
    }}
    onMouseDown={(e) => { e.stopPropagation(); startResize(e, colIdx); }}
    onDoubleClick={(e) => { e.stopPropagation(); autoFit(colIdx); }}
  />
</div>
```

### Drag logic (rAF throttle + blur guard)
```ts
const rafRef = useRef<number | null>(null);

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
```

### getCellText e auto-fit
```ts
function getCellText(row: ParsedOrder, colIdx: number): string {
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

const autoFit = useCallback((colIdx: number) => {
  const headerLen = COLUMNS[colIdx].label.length;
  const maxLen = filtered.reduce((max, row) => {
    return Math.max(max, getCellText(row, colIdx).length);
  }, headerLen);
  // Euristica: 8px/char + 24px padding. Approssimato ma adeguato per Arial 14px.
  const newW = Math.max(40, maxLen * 8 + 24);
  setColWidths(prev => {
    const next = [...prev];
    next[colIdx] = newW;
    saveWidths(next);
    return next;
  });
}, [filtered, saveWidths]);
```

### CustomRowProps + rowProps
```ts
type CustomRowProps = {
  sorted: ParsedOrder[];
  selectedId: string | null;
  onSelect: (order: FresisHistoryOrder) => void;
  onDoubleClick: (order: FresisHistoryOrder) => void;
  colWidths: number[];   // aggiunto
};

const rowProps: CustomRowProps = useMemo(
  () => ({ sorted, selectedId, onSelect, onDoubleClick, colWidths }),
  [sorted, selectedId, onSelect, onDoubleClick, colWidths],
);
```
Tutte le 8 celle di `ArcaRow` usano `colWidths[i]` invece di `COLUMNS[i].width`.

### Layout con horizontal scroll — fix al selector onScrollNearEnd
Il container outer riceve `overflowX: 'auto'`. Per evitare la regressione sul `onScrollNearEnd` (che usa `querySelector('[style*="overflow"]')`), il selector viene aggiornato a prendere **l'ultimo** elemento corrispondente (il più profondo = inner scroll di react-window):

```tsx
// Container outer
<div
  ref={containerRef}
  style={{
    ...ARCA_FONT,
    border: `1px solid ${ARCA_COLORS.shapeBorder}`,
    overflowX: 'auto',
  }}
>
  {/* Header a larghezza totale */}
  <div style={{ display: "flex", height: HEADER_HEIGHT, width: totalWidth }}>
    {/* ... header cells ... */}
  </div>
  {/* List a larghezza totale */}
  <List<CustomRowProps>
    rowCount={sorted.length}
    rowHeight={ROW_HEIGHT}
    rowComponent={ArcaRow}
    rowProps={rowProps}
    overscanCount={10}
    style={{ height: height - HEADER_HEIGHT, width: totalWidth }}
  />
</div>
```

**Fix al scroll detection in `useEffect` (riga ~298 nel codice originale):**
```ts
// Prima (fragile):
const scrollEl = container.querySelector('[style*="overflow"]') as HTMLElement;

// Dopo (robusto — prende l'ultimo = react-window inner scroller):
const allScrollEls = container.querySelectorAll('[style*="overflow"]');
const scrollEl = allScrollEls[allScrollEls.length - 1] as HTMLElement | undefined;
```
L'outer div con `overflowX: 'auto'` è il primo match; il div interno di react-window con `overflow: auto` (vertical) è l'ultimo. `querySelectorAll` restituisce elementi in document order → `[length-1]` è sempre il più profondo.

### Touch/mobile
Fuori scope. Il drag resize è mouse-only.

---

## File coinvolti

| File | Modifiche |
|------|-----------|
| `ArcaDocumentList.tsx` | `ArcaDocumentListProps.docTypeFilter`, `filtered` memo, `SortField` + `extractDocNum` + `compareParsed` aggiornati, default sort `"recency"`, `colWidths` state + `saveWidths` + `totalWidth`, header cells con `colWidths[i]` + handle JSX, `startResize` (rAF + blur), `getCellText` + `autoFit`, `CustomRowProps.colWidths` + `rowProps`, layout con `totalWidth` + `overflowX`, fix `querySelectorAll` |
| `FresisHistoryPage.tsx` | `docTypeFilter` state, UI chip "Tipo doc:" (3 button), `hasActiveFilters` + `handleClearFilters` aggiornati, prop `docTypeFilter` passata ad `ArcaDocumentList` |
| `arcaStyles.ts` | Nessuna modifica |

---

## Vincoli e scelte

- **Nessuna nuova dipendenza**
- **Virtualizzazione mantenuta**
- **rAF throttle durante drag** — ~60 re-render/sec, ~15 righe visibili → performance adeguata
- **Auto-fit euristico** — 8px/char + 24px padding, intenzionalmente approssimato
- **Min-width colonna:** 40px
- **LocalStorage key:** `'fresis-history-col-widths'`
- **Persistenza a mouseup** — nessun write localStorage durante il drag
- **Scroll detection fix** — `querySelectorAll[last]` per robustezza con overflowX esterno
- **Touch/mobile:** fuori scope

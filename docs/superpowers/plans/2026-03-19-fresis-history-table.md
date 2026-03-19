# Fresis History Table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere al componente Storico Fresis un filtro FT/KT, un ordinamento default intelligente per data+numero, e colonne ridimensionabili stile Excel con persistenza localStorage.

**Architecture:** Tre modifiche indipendenti su due file: `ArcaDocumentList.tsx` (logica filtro, sort, resize colonne) e `FresisHistoryPage.tsx` (stato docTypeFilter, UI chip). Le funzioni pure `extractDocNum` e `getCellText` vengono esportate per essere unit-testabili. Nessuna nuova dipendenza.

**Tech Stack:** React 19, TypeScript strict, Vitest + jsdom, inline styles, react-window (virtualizzazione liste).

---

## File Structure

| File | Azione | Responsabilità |
|------|--------|----------------|
| `archibald-web-app/frontend/src/components/arca/ArcaDocumentList.tsx` | Modifica | Logica filtro docTypeFilter, sort "recency", resize colonne |
| `archibald-web-app/frontend/src/components/arca/ArcaDocumentList.spec.ts` | Crea | Unit test per extractDocNum e getCellText |
| `archibald-web-app/frontend/src/pages/FresisHistoryPage.tsx` | Modifica | Stato docTypeFilter, UI chip "Tipo doc:", aggiornamento clear/active |

---

## Task 1: Feature 2 — Sort "recency" (data + numero documento)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/arca/ArcaDocumentList.tsx`
- Create: `archibald-web-app/frontend/src/components/arca/ArcaDocumentList.spec.ts`

- [ ] **Step 1.1: Crea il file di test con test failing per extractDocNum**

Crea `archibald-web-app/frontend/src/components/arca/ArcaDocumentList.spec.ts`:

```ts
import { describe, expect, test } from "vitest";
import { extractDocNum } from "./ArcaDocumentList";

describe("extractDocNum", () => {
  test("estrae il numero da formato KT xxx/yyyy", () => {
    expect(extractDocNum("KT 348/2026")).toBe(348);
  });

  test("estrae il numero da formato FT xxx/yyyy", () => {
    expect(extractDocNum("FT 336/2026")).toBe(336);
  });

  test("gestisce numeri a più cifre", () => {
    expect(extractDocNum("FT 1234/2026")).toBe(1234);
  });

  test("ritorna 0 se non c'è slash (fallback invoiceNumber senza formato standard)", () => {
    expect(extractDocNum("nessuno")).toBe(0);
  });

  test("ritorna 0 per stringa vuota", () => {
    expect(extractDocNum("")).toBe(0);
  });
});
```

- [ ] **Step 1.2: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --run ArcaDocumentList.spec
```
Expected: FAIL con "extractDocNum is not exported" o simile.

- [ ] **Step 1.3: Aggiorna ArcaDocumentList.tsx**

In `ArcaDocumentList.tsx`, apporta le seguenti modifiche:

**a) Aggiorna il tipo `SortField` (linea 17-26):**
```ts
type SortField =
  | "numerodoc"
  | "datadoc"
  | "codicecf"
  | "cliente"
  | "supragsoc"
  | "totale"
  | "stato"
  | "revenue"
  | "recency";  // aggiunto
```

**b) Aggiungi ed esporta `extractDocNum` subito sopra `compareParsed`:**
```ts
export function extractDocNum(ftNumber: string): number {
  const match = ftNumber.match(/(\d+)\//);
  return match ? parseInt(match[1], 10) : 0;
}
```

**c) Aggiungi il `case "recency"` nella funzione `compareParsed` (dopo `case "revenue"`):**
```ts
case "recency": {
  const dateCmp = (a.datadoc || "").localeCompare(b.datadoc || "");
  if (dateCmp !== 0) { cmp = dateCmp; break; }
  cmp = extractDocNum(a.ftNumber) - extractDocNum(b.ftNumber);
  break;
}
```

**d) Cambia il default sort state (linea 264-265):**
```ts
// Prima:
const [sortField, setSortField] = useState<SortField>("datadoc");
const [sortDir, setSortDir] = useState<SortDir>("desc");

// Dopo:
const [sortField, setSortField] = useState<SortField>("recency");
const [sortDir, setSortDir] = useState<SortDir>("desc");
```

- [ ] **Step 1.4: Verifica che i test passino**

```bash
npm test --prefix archibald-web-app/frontend -- --run ArcaDocumentList.spec
```
Expected: PASS (5 test).

- [ ] **Step 1.5: Type check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: no errors.

- [ ] **Step 1.6: Commit**

```bash
git add archibald-web-app/frontend/src/components/arca/ArcaDocumentList.tsx \
        archibald-web-app/frontend/src/components/arca/ArcaDocumentList.spec.ts
git commit -m "feat(fresis-history): add recency sort (date+docnum) as default"
```

---

## Task 2: Feature 1 — Filtro tipo documento (Tutti / Solo FT / Solo KT)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/arca/ArcaDocumentList.tsx`
- Modify: `archibald-web-app/frontend/src/pages/FresisHistoryPage.tsx`
- Modify: `archibald-web-app/frontend/src/components/arca/ArcaDocumentList.spec.ts`

### Sottotask 2A — Aggiorna ArcaDocumentList

- [ ] **Step 2.1: Aggiungi test failing per la logica filtro**

Aggiungi al file `ArcaDocumentList.spec.ts` (sotto i test esistenti):

```ts
import { filterByDocType } from "./ArcaDocumentList";

describe("filterByDocType", () => {
  const ktItem = { ftNumber: "KT 348/2026" } as { ftNumber: string };
  const ftItem = { ftNumber: "FT 336/2026" } as { ftNumber: string };
  const items = [ktItem, ftItem];

  test("'all' non filtra nulla", () => {
    expect(filterByDocType(items, "all")).toEqual(items);
  });

  test("'kt_only' restituisce solo KT", () => {
    expect(filterByDocType(items, "kt_only")).toEqual([ktItem]);
  });

  test("'ft_only' restituisce solo FT", () => {
    expect(filterByDocType(items, "ft_only")).toEqual([ftItem]);
  });
});
```

- [ ] **Step 2.2: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --run ArcaDocumentList.spec
```
Expected: FAIL (filterByDocType not found).

- [ ] **Step 2.3: Aggiorna ArcaDocumentList.tsx — aggiunta prop + filtro**

**a) Aggiorna `ArcaDocumentListProps` (aggiungi la prop):**
```ts
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

**b) Aggiungi ed esporta `filterByDocType` vicino a `extractDocNum`:**
```ts
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
```

**c) Aggiungi il parametro `docTypeFilter` alla funzione componente:**
```ts
export function ArcaDocumentList({
  orders,
  selectedId,
  onSelect,
  onDoubleClick,
  height = 500,
  onScrollNearEnd,
  docTypeFilter,   // aggiunto
}: ArcaDocumentListProps) {
```

**d) Aggiungi il `useMemo` `filtered` tra `parsed` e `sorted` (dopo `const parsed = ...`):**
```ts
const filtered = useMemo(
  () => filterByDocType(parsed, docTypeFilter),
  [parsed, docTypeFilter],
);
```

**e) Aggiorna `sorted` per usare `filtered` invece di `parsed`:**
```ts
// Prima:
const sorted = useMemo(() => {
  const copy = [...parsed];
  copy.sort((a, b) => compareParsed(a, b, sortField, sortDir));
  return copy;
}, [parsed, sortField, sortDir]);

// Dopo:
const sorted = useMemo(() => {
  const copy = [...filtered];
  copy.sort((a, b) => compareParsed(a, b, sortField, sortDir));
  return copy;
}, [filtered, sortField, sortDir]);
```

**f) Aggiorna `autoFit` (che arriverà in Task 3) per usare `filtered` — ignorabile ora, sarà corretto nel Task 3.**

- [ ] **Step 2.4: Verifica che i test passino**

```bash
npm test --prefix archibald-web-app/frontend -- --run ArcaDocumentList.spec
```
Expected: PASS (8 test totali).

### Sottotask 2B — Aggiorna FresisHistoryPage

- [ ] **Step 2.5: Aggiungi stato e UI in FresisHistoryPage.tsx**

**a) Aggiungi lo stato** (dopo gli altri stati di filtro, es. vicino a `globalSearch`):
```ts
const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'ft_only' | 'kt_only'>('all');
```

**b) Aggiorna `hasActiveFilters`** (linea ~338):
```ts
const hasActiveFilters =
  selectedSubClient !== null ||
  activeTimePreset !== null ||
  globalSearch !== "" ||
  docTypeFilter !== 'all';   // aggiunto
```

**c) Aggiungi `setDocTypeFilter('all')` in `handleClearFilters`** (dopo le righe esistenti):
```ts
const handleClearFilters = () => {
  handleClearSubClient();
  setAllOrders([]);
  setActiveTimePreset(null);
  const range = getDateRangeForPreset("thisMonth")!;
  setDateFrom(range.from);
  setDateTo(range.to);
  setGlobalSearch("");
  setCanLoadMore(true);
  setDocTypeFilter('all');   // aggiunto
};
```

**d) Aggiungi la riga UI "Tipo doc:" nella filter bar** — inserisci subito dopo il div "Row 2: Time presets" (che contiene i chip "Oggi", "Questa sett.", ecc., e il pulsante "Azzera filtri"):

```tsx
{/* Row 3: Tipo documento */}
<div style={{ display: "flex", gap: "4px", alignItems: "center", marginTop: "4px" }}>
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

**e) Passa la prop `docTypeFilter` ad `ArcaDocumentList`** (linea ~781):
```tsx
<ArcaDocumentList
  orders={filteredOrders}
  selectedId={selectedOrder?.id ?? null}
  onSelect={handleSelectInList}
  onDoubleClick={handleDoubleClickInList}
  height={listHeight}
  onScrollNearEnd={canLoadMore ? loadMoreMonths : undefined}
  docTypeFilter={docTypeFilter}   // aggiunto
/>
```

- [ ] **Step 2.6: Type check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: no errors.

- [ ] **Step 2.7: Commit**

```bash
git add archibald-web-app/frontend/src/components/arca/ArcaDocumentList.tsx \
        archibald-web-app/frontend/src/components/arca/ArcaDocumentList.spec.ts \
        archibald-web-app/frontend/src/pages/FresisHistoryPage.tsx
git commit -m "feat(fresis-history): add KT/FT/Tutti doc type filter"
```

---

## Task 3: Feature 3 — Colonne ridimensionabili

**Files:**
- Modify: `archibald-web-app/frontend/src/components/arca/ArcaDocumentList.tsx`
- Modify: `archibald-web-app/frontend/src/components/arca/ArcaDocumentList.spec.ts`

### Sottotask 3A — getCellText e unit test

- [ ] **Step 3.1: Aggiungi test failing per getCellText**

Aggiungi ad `ArcaDocumentList.spec.ts`:

```ts
import { getCellText } from "./ArcaDocumentList";
import type { ParsedOrder } from "./ArcaDocumentList";

// Factory per ParsedOrder minimale
function makeParsedOrder(overrides: Partial<ParsedOrder> = {}): ParsedOrder {
  return {
    order: {} as never,
    ftNumber: "FT 100/2026",
    datadoc: "2026-03-19",
    codicecf: "C00001",
    cliente: "CLIENTE TEST",
    supragsoc: "",
    totale: 1234.56,
    revenue: 100,
    stato: "fatturato",
    ...overrides,
  };
}

describe("getCellText", () => {
  test("colonna 0 → ftNumber", () => {
    const row = makeParsedOrder({ ftNumber: "KT 348/2026" });
    expect(getCellText(row, 0)).toBe("KT 348/2026");
  });

  test("colonna 1 → data formattata it-IT", () => {
    const row = makeParsedOrder({ datadoc: "2026-03-19" });
    expect(getCellText(row, 1)).toBe("19/03/2026");
  });

  test("colonna 2 → codicecf", () => {
    const row = makeParsedOrder({ codicecf: "C00292" });
    expect(getCellText(row, 2)).toBe("C00292");
  });

  test("colonna 5 → totale formattato", () => {
    const row = makeParsedOrder({ totale: 1234.56 });
    expect(getCellText(row, 5)).toBe("1.234,56");
  });

  test("colonna 7 → revenue formattato, o '-' se null", () => {
    expect(getCellText(makeParsedOrder({ revenue: 80 }), 7)).toBe("80,00");
    expect(getCellText(makeParsedOrder({ revenue: undefined }), 7)).toBe("-");
  });

  test("colonna fuori range → stringa vuota", () => {
    expect(getCellText(makeParsedOrder(), 99)).toBe("");
  });
});
```

> **Nota:** `ParsedOrder` deve essere esportato da `ArcaDocumentList.tsx` per questo test.

- [ ] **Step 3.2: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --run ArcaDocumentList.spec
```
Expected: FAIL (getCellText, ParsedOrder not exported).

### Sottotask 3B — Implementa getCellText e colWidths

- [ ] **Step 3.3: Esporta `ParsedOrder` e aggiungi `getCellText` + `colWidths` state in ArcaDocumentList.tsx**

**a) Esporta il tipo `ParsedOrder`** (cambia `type ParsedOrder` in `export type ParsedOrder`).

**b) Aggiungi ed esporta `getCellText`** (funzione pura, inserirla prima di `ArcaRow`):
```ts
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
```

**c) Aggiungi `saveWidths` useCallback** (dentro la funzione componente, prima degli altri state):
```ts
const saveWidths = useCallback((widths: number[]) => {
  localStorage.setItem('fresis-history-col-widths', JSON.stringify(widths));
}, []);
```

**d) Aggiungi `colWidths` state con lazy init da localStorage** (dopo `saveWidths`):
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

**e) Aggiungi `totalWidth` useMemo** (dopo `colWidths`):
```ts
const totalWidth = useMemo(
  () => colWidths.reduce((sum, w) => sum + w, 0),
  [colWidths],
);
```

**f) Aggiungi `rafRef`** (vicino a `containerRef`):
```ts
const rafRef = useRef<number | null>(null);
```

- [ ] **Step 3.4: Verifica che i test passino**

```bash
npm test --prefix archibald-web-app/frontend -- --run ArcaDocumentList.spec
```
Expected: PASS (tutti i test inclusi i nuovi di getCellText).

### Sottotask 3C — startResize, autoFit, e header cells

- [ ] **Step 3.5: Aggiungi startResize e autoFit** (dopo `handleHeaderClick`):

```ts
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
  setColWidths(prev => {
    const next = [...prev];
    next[colIdx] = newW;
    saveWidths(next);
    return next;
  });
}, [filtered, saveWidths]);
```

- [ ] **Step 3.6: Aggiorna `rowProps` — aggiungi `colWidths` a `CustomRowProps`**

**a) Aggiorna il tipo:**
```ts
type CustomRowProps = {
  sorted: ParsedOrder[];
  selectedId: string | null;
  onSelect: (order: FresisHistoryOrder) => void;
  onDoubleClick: (order: FresisHistoryOrder) => void;
  colWidths: number[];   // aggiunto
};
```

**b) Aggiorna `rowProps` useMemo:**
```ts
const rowProps: CustomRowProps = useMemo(
  () => ({ sorted, selectedId, onSelect, onDoubleClick, colWidths }),
  [sorted, selectedId, onSelect, onDoubleClick, colWidths],
);
```

**c) Aggiorna la firma di `ArcaRow`** per ricevere `colWidths`:
```ts
function ArcaRow({
  index,
  style: rowStyle,
  sorted,
  selectedId,
  onSelect,
  onDoubleClick,
  colWidths,            // aggiunto
}: {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: object;
} & CustomRowProps) {
```

**d) Aggiorna le 8 celle di `ArcaRow`** sostituendo ogni `COLUMNS[N].width` con `colWidths[N]`:
- `arcaGridCell(COLUMNS[0].width)` → `arcaGridCell(colWidths[0])`
- `arcaGridCell(COLUMNS[1].width)` → `arcaGridCell(colWidths[1])`
- `arcaGridCell(COLUMNS[2].width)` → `arcaGridCell(colWidths[2])`
- `arcaGridCell(COLUMNS[3].width)` → `arcaGridCell(colWidths[3])`
- `arcaGridCell(COLUMNS[4].width)` → `arcaGridCell(colWidths[4])`
- `arcaGridCell(COLUMNS[5].width, "right")` → `arcaGridCell(colWidths[5], "right")`
- `arcaGridCell(COLUMNS[6].width)` → `arcaGridCell(colWidths[6])`
- `arcaGridCell(COLUMNS[lastColIdx].width, "right")` → `arcaGridCell(colWidths[lastColIdx], "right")`

### Sottotask 3D — Layout e header con resize handles

- [ ] **Step 3.7: Aggiorna il JSX del componente — container, header, List**

**a) Container outer** — aggiungi `overflowX: 'auto'`:
```tsx
<div
  ref={containerRef}
  style={{
    ...ARCA_FONT,
    border: `1px solid ${ARCA_COLORS.shapeBorder}`,
    overflowX: 'auto',   // aggiunto
  }}
>
```

**b) Header div** — aggiungi `width: totalWidth`:
```tsx
<div
  style={{
    display: "flex",
    height: HEADER_HEIGHT,
    alignItems: "center",
    width: totalWidth,   // aggiunto
  }}
>
```

**c) Ogni header cell** — sostituisci l'intero contenuto del `COLUMNS.map(...)` con la versione che usa `colWidths[colIdx]`, `position: 'relative'`, e include il resize handle:

```tsx
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
      onDoubleClick={(e) => { e.stopPropagation(); autoFit(colIdx); }}
    />
  </div>
))}
```

**d) `<List>` component** — aggiungi `width: totalWidth` allo `style`:
```tsx
<List<CustomRowProps>
  rowCount={sorted.length}
  rowHeight={ROW_HEIGHT}
  rowComponent={ArcaRow}
  rowProps={rowProps}
  overscanCount={10}
  style={{ height: height - HEADER_HEIGHT, width: totalWidth }}
/>
```

- [ ] **Step 3.8: Fix scroll detection per onScrollNearEnd**

Nel `useEffect` che gestisce `onScrollNearEnd` (linea ~293), aggiorna il selector:

```ts
// Prima (riga ~298):
const scrollEl = container.querySelector('[style*="overflow"]') as HTMLElement;
if (!scrollEl) return;

// Dopo:
const allScrollEls = container.querySelectorAll('[style*="overflow"]');
const scrollEl = allScrollEls[allScrollEls.length - 1] as HTMLElement | undefined;
if (!scrollEl) return;
```

- [ ] **Step 3.9: Type check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: no errors.

- [ ] **Step 3.10: Esegui tutti i test**

```bash
npm test --prefix archibald-web-app/frontend -- --run ArcaDocumentList.spec
```
Expected: PASS (tutti i test).

- [ ] **Step 3.11: Esegui l'intera suite frontend**

```bash
npm test --prefix archibald-web-app/frontend
```
Expected: no regressioni.

- [ ] **Step 3.12: Commit**

```bash
git add archibald-web-app/frontend/src/components/arca/ArcaDocumentList.tsx \
        archibald-web-app/frontend/src/components/arca/ArcaDocumentList.spec.ts
git commit -m "feat(fresis-history): resizable columns with drag, auto-fit, localStorage"
```

---

## Verifica finale

- [ ] Apri `https://localhost:5173/fresis-history` (o l'equivalente dev server)
- [ ] Verifica che i documenti siano ordinati per data + numero decrescente al caricamento
- [ ] Verifica che i chip "Tutti / Solo FT / Solo KT" filtrino correttamente
- [ ] Verifica che "Azzera filtri" resetti anche il chip doc type
- [ ] Trascina il bordo di una colonna e verifica il resize in tempo reale
- [ ] Doppio click sul bordo → colonna si adatta al contenuto
- [ ] Ricarica la pagina → le larghezze sono persistite
- [ ] Allarga una colonna molto → appare scroll orizzontale

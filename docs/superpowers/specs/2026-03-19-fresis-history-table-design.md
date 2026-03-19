# Spec: Fresis History Table — 3 Feature

**Data:** 2026-03-19
**Pagina:** `/fresis-history` → `FresisHistoryPage.tsx` + `ArcaDocumentList.tsx`

---

## Contesto

La pagina Storico Fresis mostra una tabella di documenti FT/KT con virtualizzazione `react-window`. Sono richieste 3 migliorie indipendenti: filtro per tipo documento, ordinamento default più intelligente, colonne ridimensionabili stile Excel.

---

## Feature 1 — Filtro tipo documento (KT / FT / Tutti)

### Stato
- `docTypeFilter: 'all' | 'ft_only' | 'kt_only'` in `FresisHistoryPage`
- Inizializzato a `'all'`

### UI
- Terza riga nella filter bar (sotto i chip temporali), con etichetta `"Tipo doc:"`
- 3 chip selezionabili: **Tutti** / **Solo FT** / **Solo KT**
- Stile chip identico ai preset temporali esistenti (bordo `#1976d2`, sfondo `#E3F2FD` se attivo)
- "Solo KT" usa variante arancio (`border: #ff9800`, `color: #e65100`, `background: #FFF3E0`) per distinguerlo visivamente

### Logica filtro
- Il valore `docTypeFilter` viene passato come prop a `ArcaDocumentList`
- Applicato nel `useMemo` di `parsed` (dopo `parseOrder`), verificando `item.ftNumber.startsWith('KT')`
- `'all'` → nessun filtro aggiuntivo
- `'ft_only'` → `!item.ftNumber.startsWith('KT')`
- `'kt_only'` → `item.ftNumber.startsWith('KT')`

### Reset filtri
- `handleClearFilters` in `FresisHistoryPage` resetta anche `docTypeFilter` a `'all'`

---

## Feature 2 — Ordinamento default combinato (data + numero documento)

### Problema attuale
Il sort di default è `("datadoc", "desc")`. Con più documenti nella stessa data (es. 10 doc tutti del 19/03), l'ordine relativo tra di essi è arbitrario.

### Soluzione
Aggiungere il sort field `"recency"` che combina:
1. **Primary:** `datadoc` DESC (ISO string, confronto lessicografico funziona)
2. **Secondary (tiebreaker):** numero documento estratto numericamente DESC

### Estrazione numero documento
```ts
function extractDocNum(ftNumber: string): number {
  const match = ftNumber.match(/(\d+)\//);
  return match ? parseInt(match[1], 10) : 0;
}
```
Esempi: `"KT 353/2026"` → `353`, `"FT 336/2026"` → `336`.

### Comparatore
```ts
case "recency": {
  const dateCmp = (a.datadoc || "").localeCompare(b.datadoc || "");
  if (dateCmp !== 0) { cmp = dateCmp; break; }
  cmp = extractDocNum(a.ftNumber) - extractDocNum(b.ftNumber);
  break;
}
```

### Default
`useState<SortField>("recency")` e `useState<SortDir>("desc")` in `ArcaDocumentList`.

---

## Feature 3 — Colonne ridimensionabili (drag + double-click auto-fit)

### Stato
```ts
const [colWidths, setColWidths] = useState<number[]>(() => {
  const saved = localStorage.getItem('fresis-history-col-widths');
  if (saved) {
    try {
      const w = JSON.parse(saved) as number[];
      if (w.length === COLUMNS.length) return w;
    } catch { /* ignore */ }
  }
  return COLUMNS.map(c => c.width);
});
```
Inizializzato lazy da localStorage, fallback ai default di `COLUMNS`.

### Persistenza
```ts
useEffect(() => {
  localStorage.setItem('fresis-history-col-widths', JSON.stringify(colWidths));
}, [colWidths]);
```

### Resize handle
- `<div>` di 5px di larghezza, `position: absolute; right: 0; top: 0; bottom: 0`
- `cursor: 'col-resize'`
- Background semitrasparente `rgba(255,255,255,0.15)` (visibile solo sull'header blu)
- Ogni header cell ha `position: 'relative'`
- Il click sul handle chiama `e.stopPropagation()` per non triggerare il sort

### Logica drag
```ts
const startResize = useCallback((e: React.MouseEvent, colIdx: number) => {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = colWidths[colIdx];
  const onMouseMove = (ev: MouseEvent) => {
    setColWidths(prev => {
      const next = [...prev];
      next[colIdx] = Math.max(40, startWidth + ev.clientX - startX);
      return next;
    });
  };
  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}, [colWidths]);
```

### Auto-fit (doppio click)
```ts
const autoFit = useCallback((colIdx: number) => {
  const headerLen = COLUMNS[colIdx].label.length;
  const maxLen = parsed.reduce((max, row) => {
    return Math.max(max, getCellText(row, colIdx).length);
  }, headerLen);
  setColWidths(prev => {
    const next = [...prev];
    next[colIdx] = Math.max(40, maxLen * 8 + 24);
    return next;
  });
}, [parsed]);
```
`getCellText(row, colIdx)` mappa indice colonna → campo stringa del `ParsedOrder`.

### Propagazione larghezze alle righe
- `colWidths` aggiunto a `CustomRowProps` e passato via `rowProps`
- In `ArcaRow`: `arcaGridCell(colWidths[i])` al posto di `arcaGridCell(COLUMNS[i].width)`

### Allineamento header/data
Header e righe leggono lo stesso `colWidths` dallo stato React → sempre sincronizzati per costruzione.

---

## File coinvolti

| File | Modifiche |
|------|-----------|
| `frontend/src/components/arca/ArcaDocumentList.tsx` | colWidths state + localStorage, resize handles + logica, auto-fit, sort "recency", docTypeFilter prop |
| `frontend/src/pages/FresisHistoryPage.tsx` | docTypeFilter state, UI chip "Tipo doc:", reset filtri |
| `frontend/src/components/arca/arcaStyles.ts` | Nessuna modifica |

---

## Vincoli e scelte

- **Nessuna nuova dipendenza** — tutto con React hooks + DOM events
- **Virtualizzazione mantenuta** — react-window non viene rimosso
- **Auto-fit euristico** — 8px/char + 24px padding. Sufficiente per contenuto tabulare numerico/testo. Non misura DOM reale (che richiederebbe layout pass su tutti i dati).
- **Min-width colonna:** 40px (evita collasso accidentale)
- **LocalStorage key:** `'fresis-history-col-widths'` (array JSON di `COLUMNS.length` numeri)

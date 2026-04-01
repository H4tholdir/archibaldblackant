# Storico Ultimo Acquisto per Articolo — Design Spec

**Data:** 2026-04-01  
**Stato:** Approvato  

---

## Obiettivo

Nella pagina di creazione/modifica ordine, ogni riga articolo del Riepilogo Articoli espone un pulsante ⏱. Premendolo compare, subito sotto la riga corrente, una riga identica per struttura ma con sfondo viola, che mostra i valori dell'ultimo acquisto effettuato da quel cliente per quell'articolo specifico.

**Use case principale:** l'agente vuole sapere, mentre sta costruendo l'ordine, l'ultima volta in cui il cliente ha acquistato un dato articolo — listino, sconto applicato, quantità, totale ivato.

---

## Fonte Dati

`OrderFormSimple` carica già `getCustomerFullHistory()` all'avvio, che restituisce tutti gli ordini del cliente incluso il multilink (ERP IDs + subclienti Fresis). Questa struttura contiene anche gli articoli di ogni ordine.

**Nessuna nuova chiamata API.** I dati sono già in memoria.

Per trovare l'ultimo acquisto di un articolo:
1. Filtrare `fullHistory.orders` per quelli che contengono `articleCode` cercato
2. Scartare NC (già esclusi da `getCustomerFullHistory` tramite `totalAmount NOT LIKE '-%'`)
3. Ordinare per `orderDate` DESC, prendere il primo match

### Modifica backend (minore)

`CustomerFullHistoryArticle` manca del campo `lineAmount` (subtotale = `qty × price × (1 − disc%)`). Il campo `line_amount` è già presente in `agents.order_articles`. Occorre:

1. Aggiungere `lineAmount: number` a `CustomerFullHistoryArticle` in `frontend/src/api/customer-full-history.ts`
2. Aggiungere `oa.line_amount AS "lineAmount"` al SELECT in `customer-full-history.repository.ts`

---

## Componenti e File Modificati

| File | Modifica |
|------|----------|
| `frontend/src/api/customer-full-history.ts` | Aggiungere `lineAmount: number` a `CustomerFullHistoryArticle` |
| `frontend/src/utils/find-last-purchase.ts` | **Nuovo file** — utility `findLastPurchase` |
| `frontend/src/components/OrderFormSimple.tsx` | Aggiungere state toggle + render riga storico |
| `backend/src/db/repositories/customer-full-history.repository.ts` | Aggiungere `line_amount` al SELECT |

---

## Utility: `findLastPurchase`

**File:** `frontend/src/utils/find-last-purchase.ts`

```typescript
import type { CustomerFullHistoryOrder, CustomerFullHistoryArticle } from '../api/customer-full-history';

export type LastPurchaseResult = {
  article: CustomerFullHistoryArticle;
  orderDate: string;
  orderNumber: string;
};

export function findLastPurchase(
  orders: CustomerFullHistoryOrder[],
  articleCode: string
): LastPurchaseResult | null {
  // orders è già ordinato per data DESC da getCustomerFullHistory
  // NC già escluse dalla query backend
  for (const order of orders) {
    const article = order.articles.find(a => a.articleCode === articleCode);
    if (article) {
      return { article, orderDate: order.orderDate, orderNumber: order.orderNumber };
    }
  }
  return null;
}
```

---

## State in `OrderFormSimple`

```typescript
const [openHistoryIds, setOpenHistoryIds] = useState<Set<string>>(new Set());

const toggleHistory = useCallback((itemId: string) => {
  setOpenHistoryIds(prev => {
    const next = new Set(prev);
    next.has(itemId) ? next.delete(itemId) : next.add(itemId);
    return next;
  });
}, []);
```

`itemId` = campo `id` dell'`OrderItem` (UUID già esistente).

---

## Rendering della Riga Storico

Nel render degli articoli del Riepilogo, dopo ogni `<tr>` di articolo:

```tsx
{openHistoryIds.has(item.id) && (() => {
  const last = findLastPurchase(fullHistory?.orders ?? [], item.article);
  if (!last) return null;
  const vatAmount = last.article.lineTotalWithVat - last.article.lineAmount;
  return (
    <tr style={{ background: '#7c6ff7', borderBottom: '3px solid #5a50d4' }}>
      <td>
        <strong style={{ color: '#fff' }}>{last.article.articleCode}</strong>
        <span style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,.65)' }}>
          ◆ Ultimo acquisto · {formatDate(last.orderDate)}
        </span>
      </td>
      <td style={{ textAlign: 'center', color: '#fff', fontWeight: 600 }}>
        {last.article.quantity}
      </td>
      <td style={{ textAlign: 'right', color: '#fff', fontWeight: 600 }}>
        {formatCurrency(last.article.unitPrice)}
      </td>
      <td style={{ textAlign: 'right', color: '#ffe0a0', fontWeight: 700 }}>
        {last.article.discountPercent.toFixed(2)}%
      </td>
      <td style={{ textAlign: 'right', color: '#fff', fontWeight: 600 }}>
        {formatCurrency(last.article.lineAmount)}
      </td>
      <td style={{ textAlign: 'right' }}>
        <span style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,.55)' }}>
          ({last.article.vatPercent}%)
        </span>
        <span style={{ color: '#fff' }}>{formatCurrency(vatAmount)}</span>
      </td>
      <td style={{ textAlign: 'right', color: '#fff', fontWeight: 700 }}>
        {formatCurrency(last.article.lineTotalWithVat)}
      </td>
      <td style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,.7)', fontWeight: 700 }}>
        storico
      </td>
    </tr>
  );
})()}
```

---

## Pulsante ⏱ nella colonna Azioni

Aggiunto accanto al pulsante elimina nella colonna Azioni di ogni riga:

```tsx
const hasHistory = fullHistory != null &&
  findLastPurchase(fullHistory.orders, item.article) != null;

<button
  onClick={() => hasHistory && toggleHistory(item.id)}
  disabled={!hasHistory}
  title={hasHistory ? 'Mostra/nascondi storico ultimo acquisto' : 'Nessuno storico per questo articolo'}
  style={{
    background: openHistoryIds.has(item.id) ? '#7c6ff7' : '#ede8ff',
    border: '1px solid',
    borderColor: openHistoryIds.has(item.id) ? '#7c6ff7' : '#c8bbf8',
    color: openHistoryIds.has(item.id) ? '#fff' : (hasHistory ? '#7c6ff7' : '#ccc'),
    borderRadius: 6,
    width: 32, height: 32,
    cursor: hasHistory ? 'pointer' : 'default',
    fontSize: 13,
  }}
>
  ⏱
</button>
```

**Nota:** `findLastPurchase` viene chiamata sia per determinare `hasHistory` che per il render della riga. Per evitare doppia computazione, il risultato va memoizzato per articolo (es. `useMemo` su una Map `articleCode → LastPurchaseResult | null`).

---

## Memoizzazione

```typescript
const lastPurchaseByArticle = useMemo(() => {
  if (!fullHistory) return new Map<string, LastPurchaseResult | null>();
  return new Map(
    orderItems.map(item => [
      item.id,
      findLastPurchase(fullHistory.orders, item.article)
    ])
  );
}, [fullHistory, orderItems]);
```

Dipendenza da `fullHistory` e `orderItems` — si ricalcola solo quando cambia uno dei due.

---

## Edge Cases

| Caso | Comportamento |
|------|---------------|
| Nessuno storico per l'articolo | Pulsante ⏱ disabilitato (grigio, `cursor: default`) |
| `fullHistory` non ancora caricato | Pulsante ⏱ disabilitato finché il fetch non completa |
| Articolo rimosso dall'ordine | `openHistoryIds` conserva l'ID ma la riga non esiste più — nessun problema, Set ignorato |
| Stesso articolo aggiunto due volte | Ogni `OrderItem` ha `id` UUID distinto → toggle indipendente per riga |
| NC nell'ultimo ordine | Già escluse dal backend in `getCustomerFullHistory` |

---

## Testing

### Unit test: `findLastPurchase` (`find-last-purchase.spec.ts`)

- Trova il match più recente tra più ordini con lo stesso articolo
- Ritorna `null` se nessun ordine contiene l'articolo
- Rispetta l'ordinamento per data (il primo nell'array è il più recente)
- Gestisce array vuoto

### Nessun test di rendering separato richiesto
La logica di rendering è diretta e coperta dal tipo TypeScript. I casi edge sono nella utility testata sopra.

---

## Localizzazione del codice

- `OrderFormSimple.tsx` — componente principale del form ordine
- `customer-full-history.repository.ts` — query backend storico
- `customer-full-history.ts` (frontend) — tipo `CustomerFullHistoryArticle`
- Utility nuova: `frontend/src/utils/find-last-purchase.ts`

# Storico Ultimo Acquisto per Articolo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere al Riepilogo Articoli dell'ordine un pulsante ⏱ per ogni riga che, al tap, mostra subito sotto una riga viola identica per struttura con i valori dell'ultimo acquisto del cliente per quell'articolo.

**Architecture:** `getCustomerFullHistory` viene chiamato in modo lazy al primo click su ⏱ e il risultato è cachato nello state del componente. La utility `findLastPurchase` filtra il cache per trovare l'ordine più recente contenente un dato codice articolo. La riga storica è un `<tr>` aggiuntivo reso con `React.Fragment` dopo la riga normale.

**Tech Stack:** React 19, TypeScript strict, Vitest, inline styles, `formatCurrency` utility già presente.

---

## File Map

| File | Operazione | Responsabilità |
|------|-----------|----------------|
| `archibald-web-app/backend/src/types/full-history.ts` | Modifica | Aggiunge `lineAmount` a `FullHistoryArticle` |
| `archibald-web-app/backend/src/db/repositories/customer-full-history.repository.ts` | Modifica | Aggiunge `line_amount` al SELECT SQL e alle funzioni di mapping |
| `archibald-web-app/frontend/src/api/customer-full-history.ts` | Modifica | Aggiunge `lineAmount` a `CustomerFullHistoryArticle` |
| `archibald-web-app/frontend/src/utils/find-last-purchase.ts` | Crea | Utility `findLastPurchase` |
| `archibald-web-app/frontend/src/utils/find-last-purchase.spec.ts` | Crea | Unit test per `findLastPurchase` |
| `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` | Modifica | State, callback, rendering pulsante e riga storico |

---

## Task 1: Aggiungere `lineAmount` al tipo backend `FullHistoryArticle`

**Files:**
- Modifica: `archibald-web-app/backend/src/types/full-history.ts`

- [ ] **Step 1: Aggiungere il campo `lineAmount` al tipo**

In `archibald-web-app/backend/src/types/full-history.ts`, aggiungere `lineAmount: number;` tra `vatPercent` e `lineTotalWithVat`:

```typescript
export type FullHistoryArticle = {
  articleCode: string;
  articleDescription: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  lineAmount: number;
  lineTotalWithVat: number;
};
```

- [ ] **Step 2: Verificare il build del backend (atteso: errori TS sul repository che usa il tipo)**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | head -30
```

Atteso: errori su `customer-full-history.repository.ts` perché `FullHistoryArticle` richiede ora `lineAmount`.

---

## Task 2: Aggiornare la query e i mapper nel repository backend

**Files:**
- Modifica: `archibald-web-app/backend/src/db/repositories/customer-full-history.repository.ts`

- [ ] **Step 1: Aggiungere `line_amount` a `OrderArticleRow`**

Nel tipo `OrderArticleRow` (riga ~14-28 del file), aggiungere `line_amount` dopo `line_total_with_vat`:

```typescript
type OrderArticleRow = {
  order_id: string;
  order_number: string;
  order_date: string;
  customer_profile_id: string | null;
  customer_city: string | null;
  customer_rag_sociale: string | null;
  article_code: string;
  article_description: string | null;
  quantity: number;
  unit_price: number | null;
  discount_percent: number | null;
  vat_percent: number | null;
  line_total_with_vat: number | null;
  line_amount: number | null;
};
```

- [ ] **Step 2: Aggiungere `a.line_amount` al SELECT SQL**

Nella query SQL (riga ~163-176), aggiungere `a.line_amount` dopo `a.line_total_with_vat`:

```sql
             a.line_total_with_vat,
             a.line_amount
```

La sezione SELECT completa diventa:
```sql
          `SELECT
             o.id AS order_id,
             o.order_number,
             o.creation_date AS order_date,
             c2.erp_id AS customer_profile_id,
             c2.city AS customer_city,
             c2.name AS customer_rag_sociale,
             a.article_code,
             a.article_description,
             a.quantity,
             a.unit_price,
             a.discount_percent,
             a.vat_percent,
             a.line_total_with_vat,
             a.line_amount
           FROM agents.order_records o
```

- [ ] **Step 3: Aggiornare `mapOrderArticleRows` per includere `lineAmount`**

Nella funzione `mapOrderArticleRows` (riga ~70-79), aggiungere `lineAmount` alla costruzione di `FullHistoryArticle`:

```typescript
    const article: FullHistoryArticle = {
      articleCode: row.article_code,
      articleDescription: row.article_description ?? '',
      quantity: row.quantity,
      unitPrice: row.unit_price ?? 0,
      discountPercent: row.discount_percent ?? 0,
      vatPercent: row.vat_percent || 22,
      lineAmount: row.line_amount ?? 0,
      lineTotalWithVat,
    };
```

- [ ] **Step 4: Aggiornare `mapFresisRows` per calcolare `lineAmount`**

Nella funzione `mapFresisRows` (riga ~104-118), aggiungere il calcolo di `lineAmount` prima di `lineTotalWithVat` e aggiungerlo al return:

```typescript
    const articles: FullHistoryArticle[] = rawItems.map((item) => {
      const disc = item.discount ?? 0;
      const lineRaw = item.quantity * item.price * (1 - disc / 100) * (1 + item.vat / 100);
      const lineTotalWithVat = Math.round(lineRaw * globalFactor * 100) / 100;
      const lineAmount = Math.round(item.quantity * item.price * (1 - disc / 100) * globalFactor * 100) / 100;
      return {
        articleCode: item.articleCode,
        articleDescription: item.description ?? item.productName ?? '',
        quantity: item.quantity,
        unitPrice: item.price,
        discountPercent: disc,
        vatPercent: item.vat,
        lineAmount,
        lineTotalWithVat,
      };
    });
```

- [ ] **Step 5: Verificare che il build passi**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: build completato senza errori.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/types/full-history.ts \
        archibald-web-app/backend/src/db/repositories/customer-full-history.repository.ts
git commit -m "feat(history): add lineAmount field to FullHistoryArticle"
```

---

## Task 3: Aggiungere `lineAmount` al tipo frontend

**Files:**
- Modifica: `archibald-web-app/frontend/src/api/customer-full-history.ts`

- [ ] **Step 1: Aggiungere `lineAmount` a `CustomerFullHistoryArticle`**

```typescript
export type CustomerFullHistoryArticle = {
  articleCode: string;
  articleDescription: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  lineAmount: number;
  lineTotalWithVat: number;
};
```

- [ ] **Step 2: Verificare il type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | head -20
```

Atteso: nessun errore nuovo.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/api/customer-full-history.ts
git commit -m "feat(history): add lineAmount to CustomerFullHistoryArticle"
```

---

## Task 4: Scrivere il test fallente per `findLastPurchase` (TDD)

**Files:**
- Crea: `archibald-web-app/frontend/src/utils/find-last-purchase.spec.ts`

- [ ] **Step 1: Creare il file di test**

```typescript
import { describe, expect, test } from 'vitest';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
import { findLastPurchase } from './find-last-purchase';

const makeOrder = (
  orderId: string,
  orderDate: string,
  articleCode: string,
  overrides: Partial<{
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    vatPercent: number;
    lineAmount: number;
    lineTotalWithVat: number;
  }> = {},
): CustomerFullHistoryOrder => ({
  source: 'orders',
  orderId,
  orderNumber: orderId,
  orderDate,
  totalAmount: 100,
  orderDiscountPercent: 0,
  articles: [{
    articleCode,
    articleDescription: 'Test Article',
    quantity:         overrides.quantity         ?? 1,
    unitPrice:        overrides.unitPrice        ?? 100,
    discountPercent:  overrides.discountPercent  ?? 0,
    vatPercent:       overrides.vatPercent       ?? 22,
    lineAmount:       overrides.lineAmount       ?? 100,
    lineTotalWithVat: overrides.lineTotalWithVat ?? 122,
  }],
});

describe('findLastPurchase', () => {
  test('returns null for empty orders array', () => {
    expect(findLastPurchase([], 'ART-001')).toBeNull();
  });

  test('returns null when article not found in any order', () => {
    const orders = [makeOrder('o1', '2026-01-01', 'ART-999')];
    expect(findLastPurchase(orders, 'ART-001')).toBeNull();
  });

  test('returns article data and order metadata for a matching order', () => {
    const orders = [
      makeOrder('o1', '2026-01-01', 'ART-001', {
        unitPrice: 87.21,
        discountPercent: 29.51,
        lineAmount: 61.48,
        lineTotalWithVat: 75.01,
      }),
    ];
    expect(findLastPurchase(orders, 'ART-001')).toEqual({
      article: {
        articleCode: 'ART-001',
        articleDescription: 'Test Article',
        quantity: 1,
        unitPrice: 87.21,
        discountPercent: 29.51,
        vatPercent: 22,
        lineAmount: 61.48,
        lineTotalWithVat: 75.01,
      },
      orderDate: '2026-01-01',
      orderNumber: 'o1',
    });
  });

  test('returns the first match (most recent, array sorted DESC by caller)', () => {
    const newerOrder = makeOrder('new', '2026-03-01', 'ART-001', { unitPrice: 87.21 });
    const olderOrder = makeOrder('old', '2025-06-01', 'ART-001', { unitPrice: 80.00 });
    const result = findLastPurchase([newerOrder, olderOrder], 'ART-001');
    expect(result?.article.unitPrice).toBe(87.21);
    expect(result?.orderNumber).toBe('new');
  });

  test('skips orders that do not contain the article and finds the correct one', () => {
    const withoutArt = makeOrder('o1', '2026-01-01', 'ART-999');
    const withArt    = makeOrder('o2', '2025-12-01', 'ART-001', { unitPrice: 42 });
    expect(findLastPurchase([withoutArt, withArt], 'ART-001')).toMatchObject({
      orderNumber: 'o2',
      article: expect.objectContaining({ unitPrice: 42 }),
    });
  });

  test('returns null when all orders have only NC (negative totalAmount) — already excluded by caller', () => {
    // NC are filtered out by getCustomerFullHistory before reaching findLastPurchase.
    // This test verifies empty array behavior (the NC filtering is the caller's responsibility).
    expect(findLastPurchase([], 'ART-001')).toBeNull();
  });
});
```

- [ ] **Step 2: Verificare che il test fallisca per il motivo atteso**

```bash
npm test --prefix archibald-web-app/frontend -- --run src/utils/find-last-purchase.spec.ts 2>&1 | tail -15
```

Atteso: FAIL con "Cannot find module './find-last-purchase'"

---

## Task 5: Implementare `findLastPurchase`

**Files:**
- Crea: `archibald-web-app/frontend/src/utils/find-last-purchase.ts`

- [ ] **Step 1: Creare la utility**

```typescript
import type { CustomerFullHistoryOrder, CustomerFullHistoryArticle } from '../api/customer-full-history';

export type LastPurchaseResult = {
  article: CustomerFullHistoryArticle;
  orderDate: string;
  orderNumber: string;
};

export function findLastPurchase(
  orders: CustomerFullHistoryOrder[],
  articleCode: string,
): LastPurchaseResult | null {
  for (const order of orders) {
    const article = order.articles.find(a => a.articleCode === articleCode);
    if (article) {
      return { article, orderDate: order.orderDate, orderNumber: order.orderNumber };
    }
  }
  return null;
}
```

- [ ] **Step 2: Eseguire i test**

```bash
npm test --prefix archibald-web-app/frontend -- --run src/utils/find-last-purchase.spec.ts
```

Atteso: 5 tests PASS (la suite completa).

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/utils/find-last-purchase.ts \
        archibald-web-app/frontend/src/utils/find-last-purchase.spec.ts
git commit -m "feat(history): add findLastPurchase utility"
```

---

## Task 6: Aggiungere state, cache e callback a `OrderFormSimple`

**Files:**
- Modifica: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

- [ ] **Step 1: Aggiungere `Fragment` all'import React (riga 1)**

```typescript
import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
```

- [ ] **Step 2: Aggiungere i nuovi import dopo la riga 22**

Dopo la riga `import { aggregateTopSold } from '../utils/aggregate-top-sold';`, aggiungere:

```typescript
import { findLastPurchase } from '../utils/find-last-purchase';
import type { LastPurchaseResult } from '../utils/find-last-purchase';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
```

- [ ] **Step 3: Aggiungere i tre nuovi state dopo la riga `const [topSoldItems, setTopSoldItems]` (~riga 315)**

```typescript
const [customerHistoryCache, setCustomerHistoryCache] = useState<CustomerFullHistoryOrder[] | null>(null);
const [openHistoryIds, setOpenHistoryIds] = useState<Set<string>>(new Set());
const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null);
```

- [ ] **Step 4: Aggiungere useEffect per pulire cache al cambio cliente**

Dopo il blocco degli useEffect esistenti per il reset del cliente (cercare `setSelectedCustomerFull(null)` alla riga ~1145), aggiungere:

```typescript
useEffect(() => {
  setCustomerHistoryCache(null);
  setOpenHistoryIds(new Set());
}, [selectedCustomer]);
```

- [ ] **Step 5: Aggiungere `lastPurchaseByArticle` useMemo**

Dopo gli useMemo esistenti (cercare la fine dei blocchi `useMemo` presenti), aggiungere:

```typescript
const lastPurchaseByArticle = useMemo((): Map<string, LastPurchaseResult | null> => {
  if (!customerHistoryCache) return new Map();
  return new Map(items.map(item => [item.id, findLastPurchase(customerHistoryCache, item.article)]));
}, [customerHistoryCache, items]);
```

- [ ] **Step 6: Aggiungere `toggleHistoryRow` callback**

Dopo il callback `aggregateAndShowTopSold` (~riga 890), aggiungere:

```typescript
const toggleHistoryRow = useCallback(async (itemId: string) => {
  if (openHistoryIds.has(itemId)) {
    setOpenHistoryIds(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    return;
  }
  if (!customerHistoryCache) {
    setLoadingHistoryId(itemId);
    try {
      const profileIds = historyCustomerProfileIds.length > 0
        ? historyCustomerProfileIds
        : (selectedCustomer ? [selectedCustomer.id] : []);
      const orders = await getCustomerFullHistory({
        customerErpIds: profileIds,
        subClientCodices: historySubClientCodices,
      });
      setCustomerHistoryCache(orders);
    } finally {
      setLoadingHistoryId(null);
    }
  }
  setOpenHistoryIds(prev => new Set([...prev, itemId]));
}, [openHistoryIds, customerHistoryCache, historyCustomerProfileIds, historySubClientCodices, selectedCustomer]);
```


- [ ] **Step 7: Verificare il type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep -E "error|Error" | head -20
```

Atteso: nessun errore.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(history): add history cache state and toggleHistoryRow to OrderFormSimple"
```

---

## Task 7: Renderizzare il pulsante ⏱ e la riga storico nella tabella desktop

**Files:**
- Modifica: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` (righe 3887–4115)

- [ ] **Step 1: Cambiare `items.map` da arrow implicita a block body con Fragment**

Trovare la riga 3887: `{items.map((item) => (` e sostituire con:

```tsx
{items.map((item) => {
  const historyLast = lastPurchaseByArticle.get(item.id) ?? null;
  const historyAvailable = customerHistoryCache !== null ? historyLast !== null : true;
  const isHistoryOpen = openHistoryIds.has(item.id);
  const isHistoryLoading = loadingHistoryId === item.id;
  const historyVatAmount = historyLast
    ? historyLast.article.lineTotalWithVat - historyLast.article.lineAmount
    : 0;
  const historyDateStr = historyLast
    ? new Date(historyLast.orderDate).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  return (
    <Fragment key={item.id}>
```

Trovare la riga 4114-4115: `  </tr>\n  ))}` e sostituire con:

```tsx
      </tr>
      {isHistoryOpen && historyLast && (
        <tr style={{ background: '#7c6ff7', borderBottom: '3px solid #5a50d4' }}>
          <td style={{ padding: '0.75rem' }}>
            <strong style={{ color: '#fff', display: 'block' }}>{historyLast.article.articleCode}</strong>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,.65)' }}>
              ◆ Ultimo acquisto · {historyDateStr}
            </span>
          </td>
          <td style={{ padding: '0.75rem', textAlign: 'center', color: '#fff', fontWeight: 600 }}>
            {historyLast.article.quantity}
          </td>
          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#fff', fontWeight: 600 }}>
            {formatCurrency(historyLast.article.unitPrice)}
          </td>
          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#ffe0a0', fontWeight: 700 }}>
            {historyLast.article.discountPercent > 0
              ? `${historyLast.article.discountPercent}%`
              : '—'}
          </td>
          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#fff', fontWeight: 600 }}>
            {formatCurrency(historyLast.article.lineAmount)}
          </td>
          <td style={{ padding: '0.75rem', textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,.55)' }}>
              ({historyLast.article.vatPercent}%)
            </span>
            <span style={{ color: '#fff' }}>{formatCurrency(historyVatAmount)}</span>
          </td>
          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#fff', fontWeight: 700 }}>
            {formatCurrency(historyLast.article.lineTotalWithVat)}
          </td>
          <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            storico
          </td>
        </tr>
      )}
    </Fragment>
  );
})}
```

- [ ] **Step 2: Aggiungere il pulsante ⏱ nella cella Azioni**

Trovare la cella Azioni (riga ~4083): `<td style={{ padding: "0.75rem", textAlign: "center" }}>` e aggiungere il pulsante ⏱ prima del pulsante elimina:

```tsx
<td style={{ padding: "0.75rem", textAlign: "center" }}>
  {!canEditItems && (
    <button
      onClick={() => handleEditItem(item.id)}
      style={{
        padding: "0.25rem 0.5rem",
        background: "#3b82f6",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        marginRight: "0.25rem",
      }}
    >
      ✏️
    </button>
  )}
  <button
    onClick={() => { void toggleHistoryRow(item.id); }}
    disabled={isHistoryLoading || (customerHistoryCache !== null && !historyAvailable)}
    title={
      isHistoryLoading ? 'Caricamento storico...' :
      customerHistoryCache !== null && !historyAvailable ? 'Nessuno storico per questo articolo' :
      isHistoryOpen ? 'Nascondi storico' : 'Mostra ultimo acquisto'
    }
    style={{
      padding: '0.25rem 0.5rem',
      background: isHistoryOpen ? '#7c6ff7' : '#ede8ff',
      color: isHistoryOpen ? '#fff' : (customerHistoryCache !== null && !historyAvailable ? '#ccc' : '#7c6ff7'),
      border: '1px solid',
      borderColor: isHistoryOpen ? '#7c6ff7' : '#c8bbf8',
      borderRadius: '4px',
      cursor: (isHistoryLoading || (customerHistoryCache !== null && !historyAvailable)) ? 'default' : 'pointer',
      marginRight: '0.25rem',
      fontSize: '0.875rem',
      opacity: isHistoryLoading ? 0.6 : 1,
    }}
  >
    {isHistoryLoading ? '⏳' : '⏱'}
  </button>
  <button
    onClick={() => handleDeleteItem(item.id)}
    style={{
      padding: "0.25rem 0.5rem",
      background: "#dc2626",
      color: "white",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
    }}
  >
    🗑️
  </button>
</td>
```

- [ ] **Step 3: Verificare type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep -E "error TS" | head -20
```

Atteso: nessun errore.

- [ ] **Step 4: Eseguire la test suite frontend completa**

```bash
npm test --prefix archibald-web-app/frontend -- --run
```

Atteso: tutti i test passano inclusi i 5 nuovi di `find-last-purchase.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(history): render storico-ultimo-acquisto row in order riepilogo"
```

---

## Task 8: Verifica finale e pulizia

- [ ] **Step 1: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: build OK.

- [ ] **Step 2: Type-check e test frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend && npm test --prefix archibald-web-app/frontend -- --run
```

Atteso: type-check OK + tutti i test passano.

- [ ] **Step 3: Test E2E manuale**

Aprire l'app in locale, creare un ordine per un cliente con storico:
1. Aggiungere un articolo che il cliente ha già acquistato in passato
2. Cliccare ⏱ → verificare che appaia la riga viola con i valori dell'ultimo acquisto
3. Cliccare di nuovo ⏱ → verificare che la riga scompaia
4. Aggiungere un articolo mai acquistato dal cliente → verificare che ⏱ sia disabilitato (grigio) dopo il primo caricamento del cache

- [ ] **Step 4: Commit finale**

```bash
git add -p  # verificare non ci siano file non intenzionali
git commit -m "feat(order): storico ultimo acquisto per articolo nel riepilogo"
```

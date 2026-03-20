# Top-Sold Multimatching Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificare il comportamento di "I più venduti" con quello dello "Storico Ordini" in modo che usi la stessa MatchingManagerModal, lo stesso endpoint `getCustomerFullHistory`, e mostri il pulsante "Modifica collegamenti".

**Architecture:** Si aggiunge lo stato `pendingMatchingAction` a `OrderFormSimple` per smistare il comportamento post-matching. La funzione di aggregazione articoli viene estratta come funzione pura in `utils/aggregate-top-sold.ts` per renderla testabile. Le callback duplicate nella MatchingManagerModal vengono unificate in `dispatchMatchingResult`.

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library, inline styles.

---

## File Map

| File | Azione | Responsabilità |
|---|---|---|
| `src/utils/aggregate-top-sold.ts` | **Crea** | Funzione pura: `CustomerFullHistoryOrder[]` → array ordinato per quantità |
| `src/utils/aggregate-top-sold.spec.ts` | **Crea** | Unit test della funzione di aggregazione |
| `src/components/OrderFormSimple.tsx` | **Modifica** | Nuovo stato, nuove funzioni, JSX aggiornato |
| `src/components/OrderFormSimple.topsold.spec.tsx` | **Crea** | Integration test del flusso più venduti |

---

### Task 1: Funzione pura `aggregateTopSold` con unit test (TDD)

**Files:**
- Create: `archibald-web-app/frontend/src/utils/aggregate-top-sold.ts`
- Test: `archibald-web-app/frontend/src/utils/aggregate-top-sold.spec.ts`

- [ ] **Step 1.1 — Crea il file di test con i casi**

Crea `archibald-web-app/frontend/src/utils/aggregate-top-sold.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
import { aggregateTopSold } from './aggregate-top-sold';

const makeOrder = (articles: Array<{ articleCode: string; articleDescription: string; quantity: number }>): CustomerFullHistoryOrder => ({
  source: 'orders',
  orderId: 'o1',
  orderNumber: '001',
  orderDate: '2026-01-01',
  totalAmount: 0,
  orderDiscountPercent: 0,
  articles: articles.map(a => ({
    ...a,
    unitPrice: 0,
    discountPercent: 0,
    vatPercent: 22,
    lineTotalWithVat: 0,
  })),
});

describe('aggregateTopSold', () => {
  test('returns empty array for empty orders', () => {
    expect(aggregateTopSold([])).toEqual([]);
  });

  test('returns empty array for orders with no articles', () => {
    expect(aggregateTopSold([makeOrder([])])).toEqual([]);
  });

  test('aggregates quantity for same articleCode across multiple orders', () => {
    const orders = [
      makeOrder([{ articleCode: 'A001', articleDescription: 'Articolo A', quantity: 3 }]),
      makeOrder([{ articleCode: 'A001', articleDescription: 'Articolo A', quantity: 5 }]),
    ];
    expect(aggregateTopSold(orders)).toEqual([
      { articleCode: 'A001', productName: 'Articolo A', totalQuantity: 8 },
    ]);
  });

  test('aggregates quantity for same articleCode across multiple clients in same order', () => {
    const order = makeOrder([
      { articleCode: 'B002', articleDescription: 'Articolo B', quantity: 2 },
      { articleCode: 'B002', articleDescription: 'Articolo B', quantity: 4 },
    ]);
    expect(aggregateTopSold([order])).toEqual([
      { articleCode: 'B002', productName: 'Articolo B', totalQuantity: 6 },
    ]);
  });

  test('sorts by totalQuantity descending', () => {
    const orders = [
      makeOrder([
        { articleCode: 'LOW', articleDescription: 'Poco', quantity: 1 },
        { articleCode: 'HIGH', articleDescription: 'Molto', quantity: 10 },
        { articleCode: 'MID', articleDescription: 'Medio', quantity: 5 },
      ]),
    ];
    const result = aggregateTopSold(orders);
    expect(result.map(r => r.articleCode)).toEqual(['HIGH', 'MID', 'LOW']);
  });

  test('article present in only one client is not lost', () => {
    const orders = [
      makeOrder([{ articleCode: 'SOLO', articleDescription: 'Solo', quantity: 7 }]),
      makeOrder([{ articleCode: 'OTHER', articleDescription: 'Other', quantity: 2 }]),
    ];
    const codes = aggregateTopSold(orders).map(r => r.articleCode);
    expect(codes).toContain('SOLO');
    expect(codes).toContain('OTHER');
  });

  test('no overlap: each article appears once with its own quantity', () => {
    const orders = [
      makeOrder([
        { articleCode: 'X1', articleDescription: 'X1', quantity: 3 },
        { articleCode: 'X2', articleDescription: 'X2', quantity: 3 },
      ]),
    ];
    expect(aggregateTopSold(orders)).toEqual([
      { articleCode: 'X1', productName: 'X1', totalQuantity: 3 },
      { articleCode: 'X2', productName: 'X2', totalQuantity: 3 },
    ]);
  });

  test('collision on productName: uses first description found', () => {
    const orders = [
      makeOrder([{ articleCode: 'DUP', articleDescription: 'Prima descrizione', quantity: 1 }]),
      makeOrder([{ articleCode: 'DUP', articleDescription: 'Seconda descrizione', quantity: 1 }]),
    ];
    const result = aggregateTopSold(orders);
    expect(result).toHaveLength(1);
    expect(result[0].productName).toBe('Prima descrizione');
  });
});
```

- [ ] **Step 1.2 — Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/frontend -- aggregate-top-sold
```
Atteso: FAIL — `Cannot find module './aggregate-top-sold'`

- [ ] **Step 1.3 — Crea l'implementazione**

Crea `archibald-web-app/frontend/src/utils/aggregate-top-sold.ts`:

```typescript
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';

export type TopSoldItem = {
  articleCode: string;
  productName: string;
  totalQuantity: number;
};

export function aggregateTopSold(orders: CustomerFullHistoryOrder[]): TopSoldItem[] {
  const map = new Map<string, TopSoldItem>();
  for (const order of orders) {
    for (const article of order.articles) {
      const existing = map.get(article.articleCode);
      if (existing) {
        existing.totalQuantity += article.quantity;
      } else {
        map.set(article.articleCode, {
          articleCode: article.articleCode,
          productName: article.articleDescription,
          totalQuantity: article.quantity,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
}
```

- [ ] **Step 1.4 — Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/frontend -- aggregate-top-sold
```
Atteso: PASS — tutti i test verdi

- [ ] **Step 1.5 — Commit**

```bash
git add archibald-web-app/frontend/src/utils/aggregate-top-sold.ts archibald-web-app/frontend/src/utils/aggregate-top-sold.spec.ts
git commit -m "feat(order): extract aggregateTopSold pure function with unit tests"
```

---

### Task 2: Stato e funzioni in OrderFormSimple

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

**Contesto:** Le righe chiave sono:
- Stato top sold: righe 295–304
- Stato history modals: righe 306–311
- `loadTopSoldItems`: righe 840–877
- `handleHistorySearchClick`: righe 890–898
- MatchingManagerModal JSX: righe 5275–5336

- [ ] **Step 2.1 — Aggiungi import di `aggregateTopSold` e `getCustomerFullHistory`**

Cerca la riga dove `loadOrderHistory` / `getFresisHistory` vengono importati e verifica che `getCustomerFullHistory` sia già importato. Se non è importato, aggiungilo.

Cerca nel file:
```
import.*getCustomerFullHistory
```

Se non presente, aggiungi vicino agli altri import API:
```typescript
import { getCustomerFullHistory } from '../api/customer-full-history';
```

Poi aggiungi l'import della nuova utility vicino agli altri import di utils:
```typescript
import { aggregateTopSold } from '../utils/aggregate-top-sold';
import type { TopSoldItem } from '../utils/aggregate-top-sold';
```

- [ ] **Step 2.2 — Aggiorna il tipo di `topSoldItems` e aggiungi `pendingMatchingAction`**

Trova il blocco di stato (righe 295–311):
```typescript
  // Fresis history: top sold items modal
  const [showTopSoldModal, setShowTopSoldModal] = useState(false);
  const [topSoldItems, setTopSoldItems] = useState<
    Array<{
      articleCode: string;
      productName: string;
      description?: string;
      totalQuantity: number;
    }>
  >([]);

  // Customer history modals
  const [showCustomerHistoryModal, setShowCustomerHistoryModal] = useState(false);
  const [showMatchingManagerModal, setShowMatchingManagerModal] = useState(false);
  const [matchingForceShow, setMatchingForceShow] = useState(false);
  const [historyCustomerProfileIds, setHistoryCustomerProfileIds] = useState<string[]>([]);
  const [historySubClientCodices, setHistorySubClientCodices] = useState<string[]>([]);
```

Sostituisci con:
```typescript
  // Fresis history: top sold items modal
  const [showTopSoldModal, setShowTopSoldModal] = useState(false);
  const [topSoldItems, setTopSoldItems] = useState<TopSoldItem[]>([]);

  // Customer history modals
  const [showCustomerHistoryModal, setShowCustomerHistoryModal] = useState(false);
  const [showMatchingManagerModal, setShowMatchingManagerModal] = useState(false);
  const [matchingForceShow, setMatchingForceShow] = useState(false);
  const [historyCustomerProfileIds, setHistoryCustomerProfileIds] = useState<string[]>([]);
  const [historySubClientCodices, setHistorySubClientCodices] = useState<string[]>([]);
  const [pendingMatchingAction, setPendingMatchingAction] = useState<'history' | 'topSold' | null>(null);
```

- [ ] **Step 2.3 — Sostituisci `loadTopSoldItems`**

Trova la funzione attuale (righe 840–877):
```typescript
  const loadTopSoldItems = async () => {
    if (!selectedCustomer) return;

    const allOrders = await loadOrderHistory();

    const aggregated = new Map<
      string,
      {
        articleCode: string;
        productName: string;
        description?: string;
        totalQuantity: number;
      }
    >();

    for (const order of allOrders) {
      for (const item of order.items) {
        const key = item.productName || item.articleCode;
        const existing = aggregated.get(key);
        if (existing) {
          existing.totalQuantity += item.quantity;
        } else {
          aggregated.set(key, {
            articleCode: item.articleCode,
            productName: item.productName || item.articleCode,
            description: item.description,
            totalQuantity: item.quantity,
          });
        }
      }
    }

    const sorted = Array.from(aggregated.values()).sort(
      (a, b) => b.totalQuantity - a.totalQuantity,
    );
    setTopSoldItems(sorted);
    setShowTopSoldModal(true);
  };
```

Sostituisci con:
```typescript
  const loadTopSoldItems = () => {
    if (!selectedCustomer) return;
    if (isFresis(selectedCustomer) && !selectedSubClient) return;
    setPendingMatchingAction('topSold');
    setShowMatchingManagerModal(true);
  };
```

- [ ] **Step 2.4 — Aggiorna `handleHistorySearchClick`**

Trova la funzione (righe 890–898):
```typescript
  const handleHistorySearchClick = useCallback(() => {
    if (!selectedCustomer) return;
    if (isFresis(selectedCustomer) && !selectedSubClient) {
      // Fresis senza sottocliente selezionato: apri direttamente storico
      setShowCustomerHistoryModal(true);
      return;
    }
    setShowMatchingManagerModal(true);
  }, [selectedCustomer, selectedSubClient]);
```

Sostituisci con:
```typescript
  const handleHistorySearchClick = useCallback(() => {
    if (!selectedCustomer) return;
    if (isFresis(selectedCustomer) && !selectedSubClient) {
      setShowCustomerHistoryModal(true);
      return;
    }
    setPendingMatchingAction('history');
    setShowMatchingManagerModal(true);
  }, [selectedCustomer, selectedSubClient]);
```

- [ ] **Step 2.5 — Aggiungi `aggregateAndShowTopSold` e `dispatchMatchingResult` dopo `handleHistorySearchClick`**

Aggiungi subito dopo `handleHistorySearchClick` (dopo la riga `}, [selectedCustomer, selectedSubClient]);`):

```typescript
  const aggregateAndShowTopSold = useCallback(async (profileIds: string[], subClientCodices: string[]) => {
    const orders = await getCustomerFullHistory({ customerProfileIds: profileIds, subClientCodices });
    const sorted = aggregateTopSold(orders);
    setTopSoldItems(sorted);
    setShowTopSoldModal(true);
  }, []);

  const dispatchMatchingResult = useCallback((ids: { customerProfileIds: string[]; subClientCodices: string[] } | undefined) => {
    let profileIds = historyCustomerProfileIds;
    let subClientCodices = historySubClientCodices;
    if (ids) {
      profileIds = ids.customerProfileIds;
      subClientCodices = isFresis(selectedCustomer) && selectedSubClient
        ? [selectedSubClient.codice, ...ids.subClientCodices]
        : ids.subClientCodices;
      setHistoryCustomerProfileIds(profileIds);
      setHistorySubClientCodices(subClientCodices);
    } else if (isFresis(selectedCustomer) && selectedSubClient) {
      // ids===undefined significa skip senza matches: per Fresis subclient, garantisci
      // almeno il codice del sotto-cliente corrente anche se gli array sono vuoti
      // (caso: prima apertura con skip=true e nessun matching salvato)
      if (!subClientCodices.includes(selectedSubClient.codice)) {
        subClientCodices = [selectedSubClient.codice, ...subClientCodices];
        setHistorySubClientCodices(subClientCodices);
      }
    }
    setMatchingForceShow(false);
    setShowMatchingManagerModal(false);
    if (pendingMatchingAction === 'history') {
      setShowCustomerHistoryModal(true);
    } else if (pendingMatchingAction === 'topSold') {
      void aggregateAndShowTopSold(profileIds, subClientCodices);
    }
    setPendingMatchingAction(null);
  }, [historyCustomerProfileIds, historySubClientCodices, pendingMatchingAction, selectedCustomer, selectedSubClient, aggregateAndShowTopSold]);
```

- [ ] **Step 2.6 — Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: 0 errori. Se ci sono errori di tipo su `selectedCustomer` in `dispatchMatchingResult`, aggiungi il guard `if (!selectedCustomer) return` prima dei setters.

- [ ] **Step 2.7 — Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(order): add pendingMatchingAction state and dispatchMatchingResult"
```

---

### Task 3: Aggiorna il JSX della MatchingManagerModal

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` (righe 5275–5336)

- [ ] **Step 3.1 — Sostituisci le callback del blocco Fresis subclient**

Trova il primo blocco `<MatchingManagerModal` (mode="subclient", righe 5280–5304):
```typescript
                onConfirm={(ids) => {
                  setHistoryCustomerProfileIds(ids.customerProfileIds);
                  setHistorySubClientCodices([selectedSubClient.codice, ...ids.subClientCodices]);
                  setMatchingForceShow(false);
                  setShowMatchingManagerModal(false);
                  setShowCustomerHistoryModal(true);
                }}
                onSkip={(matches) => {
                  if (matches) {
                    setHistoryCustomerProfileIds(matches.customerProfileIds);
                    setHistorySubClientCodices([selectedSubClient.codice, ...matches.subClientCodices]);
                  } else {
                    setHistorySubClientCodices([selectedSubClient.codice]);
                  }
                  setMatchingForceShow(false);
                  setShowMatchingManagerModal(false);
                  setShowCustomerHistoryModal(true);
                }}
                onClose={() => { setMatchingForceShow(false); setShowMatchingManagerModal(false); }}
```

Sostituisci con:
```typescript
                onConfirm={(ids) => dispatchMatchingResult(ids)}
                onSkip={(matches) => dispatchMatchingResult(matches)}
                onClose={() => { setMatchingForceShow(false); setShowMatchingManagerModal(false); setPendingMatchingAction(null); }}
```

- [ ] **Step 3.2 — Sostituisci le callback del blocco cliente diretto**

Trova il secondo blocco `<MatchingManagerModal` (mode="customer", righe 5309–5331):
```typescript
                onConfirm={(ids) => {
                  setHistoryCustomerProfileIds(ids.customerProfileIds);
                  setHistorySubClientCodices(ids.subClientCodices);
                  setMatchingForceShow(false);
                  setShowMatchingManagerModal(false);
                  setShowCustomerHistoryModal(true);
                }}
                onSkip={(matches) => {
                  if (matches) {
                    setHistoryCustomerProfileIds(matches.customerProfileIds);
                    setHistorySubClientCodices(matches.subClientCodices);
                  }
                  setMatchingForceShow(false);
                  setShowMatchingManagerModal(false);
                  setShowCustomerHistoryModal(true);
                }}
                onClose={() => { setMatchingForceShow(false); setShowMatchingManagerModal(false); }}
```

Sostituisci con:
```typescript
                onConfirm={(ids) => dispatchMatchingResult(ids)}
                onSkip={(matches) => dispatchMatchingResult(matches)}
                onClose={() => { setMatchingForceShow(false); setShowMatchingManagerModal(false); setPendingMatchingAction(null); }}
```

- [ ] **Step 3.3 — Type-check e test esistenti**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```
Atteso: 0 errori TypeScript, tutti i test esistenti passano.

- [ ] **Step 3.4 — Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "refactor(order): unify MatchingManagerModal callbacks via dispatchMatchingResult"
```

---

### Task 4: Aggiorna la modale "I più venduti" (JSX)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` (area righe 5079–5200)

- [ ] **Step 4.1 — Aggiungi pulsante "Modifica collegamenti" nell'header**

Trova l'header della modale (righe 5079–5105):
```typescript
            <div
              style={{
                padding: "1rem",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.125rem" }}>
                I più venduti — {selectedSubClient?.ragioneSociale}
              </h3>
              <button
                onClick={() => setShowTopSoldModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  padding: "0.25rem",
                  lineHeight: 1,
                  color: "#6b7280",
                }}
              >
                ✕
              </button>
            </div>
```

Sostituisci con:
```typescript
            <div
              style={{
                padding: "1rem",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.125rem", flex: 1 }}>
                I più venduti — {selectedSubClient?.ragioneSociale}
              </h3>
              <button
                onClick={() => {
                  setShowTopSoldModal(false);
                  setMatchingForceShow(true);
                  setPendingMatchingAction('topSold');
                  setShowMatchingManagerModal(true);
                }}
                style={{
                  background: "rgba(0,0,0,0.06)",
                  border: "none",
                  padding: "4px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  color: "#374151",
                }}
              >
                ✎ Modifica collegamenti
              </button>
              <button
                onClick={() => setShowTopSoldModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  padding: "0.25rem",
                  lineHeight: 1,
                  color: "#6b7280",
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
```

- [ ] **Step 4.2 — Aggiorna la cella "Descrizione" nella tabella**

La colonna Descrizione attualmente mostra `item.description`, ma il nuovo tipo `TopSoldItem` non ha `description`. Trova la cella (circa riga 5186–5188):
```typescript
                        <td style={{ padding: "0.5rem", color: "#374151" }}>
                          {item.description || "—"}
                        </td>
```

Sostituisci con:
```typescript
                        <td style={{ padding: "0.5rem", color: "#374151" }}>
                          {item.productName || "—"}
                        </td>
```

- [ ] **Step 4.3 — Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: 0 errori.

- [ ] **Step 4.4 — Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(order): add 'Modifica collegamenti' button to top-sold modal"
```

---

### Task 5: Integration test del flusso

**Files:**
- Create: `archibald-web-app/frontend/src/components/OrderFormSimple.topsold.spec.tsx`

Il test usa gli stessi mock del file `.completeness.spec.tsx`. La logica della MatchingManagerModal dipende da `getMatchesForCustomer` / `getMatchesForSubClient` — per simulare `skip=false` basta che la modale si mostri; per `skip=true` basta mockare il risultato con `skipModal: true`.

- [ ] **Step 5.1 — Crea il file di test**

Crea `archibald-web-app/frontend/src/components/OrderFormSimple.topsold.spec.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// --- mock API e servizi ---
vi.mock('../services/customers.service', () => ({
  customerService: {
    syncCustomers: vi.fn().mockResolvedValue(undefined),
    searchCustomers: vi.fn().mockResolvedValue([]),
    getHiddenCustomers: vi.fn().mockResolvedValue([]),
    setCustomerHidden: vi.fn().mockResolvedValue(undefined),
    getCustomerById: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../services/products.service', () => ({
  productService: { searchProducts: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../services/prices.service', () => ({
  priceService: { getPriceForProduct: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../services/orders.service', () => ({
  orderService: {
    getPendingOrders: vi.fn().mockResolvedValue([]),
    savePendingOrder: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../services/toast.service', () => ({
  toastService: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../api/warehouse', () => ({
  batchRelease: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../api/fresis-history', () => ({
  getFresisHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('../api/orders-history', () => ({
  getOrderHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('../api/fresis-discounts', () => ({
  getDiscountForArticle: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/customer-completeness', () => ({
  checkCustomerCompleteness: vi.fn().mockReturnValue({ ok: true, missing: [] }),
}));
vi.mock('../contexts/WebSocketContext', () => ({
  useWebSocketContext: vi.fn().mockReturnValue({ subscribe: vi.fn().mockReturnValue(() => {}) }),
}));
vi.mock('../api/customer-full-history', () => ({
  getCustomerFullHistory: vi.fn(),
}));
vi.mock('../services/sub-client-matches.service', () => ({
  getMatchesForCustomer: vi.fn(),
  getMatchesForSubClient: vi.fn(),
  addCustomerMatch: vi.fn().mockResolvedValue(undefined),
  removeCustomerMatch: vi.fn().mockResolvedValue(undefined),
  addSubClientMatch: vi.fn().mockResolvedValue(undefined),
  removeSubClientMatch: vi.fn().mockResolvedValue(undefined),
  upsertSkipModal: vi.fn().mockResolvedValue(undefined),
}));

import OrderFormSimple from './OrderFormSimple';
import { getCustomerFullHistory } from '../api/customer-full-history';
import { getMatchesForCustomer } from '../services/sub-client-matches.service';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';

const DIRECT_CUSTOMER_SEARCH = {
  id: 'CUST-001',
  name: 'Indelli Enrico',
  city: 'Salerno',
  customerType: null,
  isHidden: false,
};

const DIRECT_CUSTOMER_FULL = {
  customerProfile: 'CUST-001',
  internalId: null,
  name: 'Indelli Enrico',
  vatNumber: '12345678901',
  fiscalCode: null,
  sdi: null,
  pec: null,
  email: null,
  phone: null,
  mobile: null,
  url: null,
  attentionTo: null,
  street: null,
  logisticsAddress: null,
  postalCode: null,
  city: 'Salerno',
  customerType: null,
  type: null,
  deliveryTerms: null,
  description: null,
  lastOrderDate: null,
  actualOrderCount: 0,
  actualSales: 0,
  previousOrderCount1: 0,
  previousSales1: 0,
  previousOrderCount2: 0,
  previousSales2: 0,
  externalAccountNumber: null,
  ourAccountNumber: null,
  hash: 'abc',
  lastSync: 0,
  createdAt: 0,
  updatedAt: 0,
  botStatus: null,
  photoUrl: null,
  vatValidatedAt: null,
};

const HISTORY_ORDERS: CustomerFullHistoryOrder[] = [
  {
    source: 'orders',
    orderId: 'o1',
    orderNumber: '001',
    orderDate: '2026-01-01',
    totalAmount: 100,
    orderDiscountPercent: 0,
    customerProfileId: 'CUST-001',
    articles: [
      { articleCode: 'A001', articleDescription: 'Serei DIA', quantity: 5, unitPrice: 10, discountPercent: 0, vatPercent: 22, lineTotalWithVat: 61 },
      { articleCode: 'B002', articleDescription: 'Cemento', quantity: 2, unitPrice: 5, discountPercent: 0, vatPercent: 22, lineTotalWithVat: 12.2 },
    ],
  },
];

const MATCHES_NO_SKIP = {
  customerProfileIds: ['CUST-001'],
  subClientCodices: [],
  skipModal: false,
};

const MATCHES_SKIP = {
  customerProfileIds: ['CUST-001'],
  subClientCodices: [],
  skipModal: true,
};

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <OrderFormSimple />
    </MemoryRouter>,
  );
}

async function selectDirectCustomer() {
  const { customerService } = await import('../services/customers.service');
  vi.mocked(customerService.searchCustomers).mockResolvedValue([DIRECT_CUSTOMER_SEARCH] as any);
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: DIRECT_CUSTOMER_FULL }),
  });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();

  const searchInput = screen.getByPlaceholderText(/cerca cliente/i);
  await userEvent.type(searchInput, 'Indelli');
  await waitFor(() => expect(screen.getByText('Indelli Enrico')).toBeTruthy());
  await userEvent.click(screen.getByText('Indelli Enrico'));
  await waitFor(() => expect(screen.getByText(/Cliente selezionato/i)).toBeTruthy());
}

describe('OrderFormSimple — I più venduti con multimatching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCustomerFullHistory).mockResolvedValue(HISTORY_ORDERS);
  });

  test('click "I più venduti" apre MatchingManagerModal quando skip=false', async () => {
    vi.mocked(getMatchesForCustomer).mockResolvedValue(MATCHES_NO_SKIP);
    renderWithRouter();
    await selectDirectCustomer();

    const btn = screen.getByRole('button', { name: /più venduti/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/collegamenti/i)).toBeTruthy();
    });
  });

  test('dopo conferma matching, modale più venduti mostra articoli aggregati da getCustomerFullHistory', async () => {
    vi.mocked(getMatchesForCustomer).mockResolvedValue(MATCHES_NO_SKIP);
    renderWithRouter();
    await selectDirectCustomer();

    await userEvent.click(screen.getByRole('button', { name: /più venduti/i }));

    await waitFor(() => expect(screen.getByText(/collegamenti/i)).toBeTruthy());

    // Nota: verifica il testo esatto del pulsante conferma nella MatchingManagerModal
    // prima di implementare. Se il label differisce, aggiorna il selettore di conseguenza.
    const confirmBtn = screen.getByRole('button', { name: /conferma/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(getCustomerFullHistory).toHaveBeenCalledWith(
        expect.objectContaining({ customerProfileIds: expect.any(Array) })
      );
      expect(screen.getByText('A001')).toBeTruthy();
      expect(screen.getByText('B002')).toBeTruthy();
    });
  });

  test('click "I più venduti" con skip=true bypassa MatchingManagerModal', async () => {
    vi.mocked(getMatchesForCustomer).mockResolvedValue(MATCHES_SKIP);
    renderWithRouter();
    await selectDirectCustomer();

    await userEvent.click(screen.getByRole('button', { name: /più venduti/i }));

    await waitFor(() => {
      expect(getCustomerFullHistory).toHaveBeenCalled();
      expect(screen.getByText('A001')).toBeTruthy();
    });
  });

  test('pulsante "Modifica collegamenti" è presente nella modale più venduti', async () => {
    vi.mocked(getMatchesForCustomer).mockResolvedValue(MATCHES_SKIP);
    renderWithRouter();
    await selectDirectCustomer();

    await userEvent.click(screen.getByRole('button', { name: /più venduti/i }));
    await waitFor(() => expect(screen.getByText('A001')).toBeTruthy());

    expect(screen.getByRole('button', { name: /modifica collegamenti/i })).toBeTruthy();
  });

  test('click "Modifica collegamenti" riapre MatchingManagerModal forzatamente', async () => {
    vi.mocked(getMatchesForCustomer).mockResolvedValue(MATCHES_SKIP);
    renderWithRouter();
    await selectDirectCustomer();

    await userEvent.click(screen.getByRole('button', { name: /più venduti/i }));
    await waitFor(() => expect(screen.getByText('A001')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: /modifica collegamenti/i }));

    await waitFor(() => {
      expect(screen.getByText(/collegamenti/i)).toBeTruthy();
      expect(screen.queryByText('A001')).toBeNull();
    });
  });
});
```

- [ ] **Step 5.2 — Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/frontend -- topsold
```
Atteso: PASS — tutti e 5 i test verdi.

Se falliscono per mock mancanti, controlla i moduli importati da `OrderFormSimple` e aggiungi i mock necessari seguendo il pattern di `OrderFormSimple.completeness.spec.tsx`.

- [ ] **Step 5.3 — Esegui tutti i test**

```bash
npm test --prefix archibald-web-app/frontend
```
Atteso: tutti i test passano, nessuna regressione.

- [ ] **Step 5.4 — Type-check finale**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: 0 errori.

- [ ] **Step 5.5 — Commit finale**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.topsold.spec.tsx
git commit -m "test(order): add integration tests for top-sold multimatching flow"
```

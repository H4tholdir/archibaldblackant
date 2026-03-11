# Cerca nello Storico — Storico Completo Cliente — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il vecchio modal di ricerca storico con un'esperienza completa che mostra tutti gli ordini del cliente (da storico ordini + storico Fresis), con possibilità di inserire singoli articoli o copiare ordini interi nell'ordine in costruzione.

**Architecture:** Un nuovo endpoint backend `GET /api/history/customer-full-history` fonde in parallelo le query su `order_records+order_articles` e `fresis_history`, restituendo una lista ordinata per data. Il frontend presenta un `CustomerHistoryModal` con tutti gli ordini espansi; prima di aprirlo verifica il matching bidirezionale cliente↔sottocliente e lo risolve obbligatoriamente tramite `CustomerPickerModal` (da esportare da SubclientsTab) o il nuovo `SubClientPickerModal`. Tutte le deps dei router sono pre-bound (closure su pool) seguendo il pattern esistente del codebase.

**Tech Stack:** TypeScript strict, React 19, Express, PostgreSQL (`pg` pool), Vitest + supertest, inline styles frontend.

**Spec:** `docs/superpowers/specs/2026-03-11-cerca-nello-storico-design.md`

---

## File Structure

### Backend (nuovo/modificato)
| File | Azione | Responsabilità |
|------|--------|---------------|
| `backend/src/types/full-history.ts` | Crea | Tipi `FullHistoryOrder`, `FullHistoryArticle` |
| `backend/src/db/repositories/customer-full-history.repository.ts` | Crea | Query fusione ordini + Fresis |
| `backend/src/db/repositories/customer-full-history.repository.spec.ts` | Crea | Test integrazione repository |
| `backend/src/routes/customer-full-history.ts` | Crea | Router `GET /api/history/customer-full-history` |
| `backend/src/routes/customer-full-history.spec.ts` | Crea | Test integrazione router |
| `backend/src/routes/subclients.ts` | Modifica | Aggiunge `GET /api/subclients/by-customer/:profileId` |
| `backend/src/server.ts` | Modifica | Wiring nuovo router |

### Frontend (nuovo/modificato)
| File | Azione | Responsabilità |
|------|--------|---------------|
| `frontend/src/api/customer-full-history.ts` | Crea | Client HTTP per il nuovo endpoint |
| `frontend/src/services/subclients.service.ts` | Modifica | Aggiunge `getSubclientByMatchedCustomer` |
| `frontend/src/components/SubclientsTab.tsx` | Modifica | Esporta `CustomerPickerModal` |
| `frontend/src/components/SubClientPickerModal.tsx` | Crea | Picker sottoclienti Fresis (reverse matching) |
| `frontend/src/components/CustomerHistoryModal.tsx` | Crea | Modal storico completo |
| `frontend/src/components/OrderFormSimple.tsx` | Modifica | Sostituisce vecchio flow storico |

---

## Chunk 1: Backend — Tipi, Repository ed Endpoint

### Task 1: Tipi condivisi backend

**Files:**
- Crea: `archibald-web-app/backend/src/types/full-history.ts`

- [ ] **Step 1: Crea il file dei tipi**

```typescript
// archibald-web-app/backend/src/types/full-history.ts

export type FullHistoryArticle = {
  articleCode: string;
  articleDescription: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  lineTotalWithVat: number;
};

export type FullHistoryOrder = {
  source: 'orders' | 'fresis';
  orderId: string;
  orderNumber: string;
  orderDate: string;
  totalAmount: number;
  articles: FullHistoryArticle[];
};
```

- [ ] **Step 2: Commit**

```bash
git add archibald-web-app/backend/src/types/full-history.ts
git commit -m "feat(history): add FullHistoryOrder and FullHistoryArticle types"
```

---

### Task 2: Repository customer-full-history — test prima

**Files:**
- Crea: `archibald-web-app/backend/src/db/repositories/customer-full-history.repository.spec.ts`
- Crea: `archibald-web-app/backend/src/db/repositories/customer-full-history.repository.ts`

- [ ] **Step 1: Scrivi il test di integrazione**

```typescript
// archibald-web-app/backend/src/db/repositories/customer-full-history.repository.spec.ts
import { describe, it, expect, vi, type Mock } from 'vitest';
import { getCustomerFullHistory } from './customer-full-history.repository';
import type { DbPool } from '../pool';
import type { FullHistoryOrder } from '../../types/full-history';

function makePool(queryFn: Mock): DbPool {
  return { query: queryFn } as unknown as DbPool;
}

const ORDER_ROW = {
  order_id: 'ord-1',
  order_number: 'FT 247',
  order_date: '2024-02-23T00:00:00.000Z',
  article_code: '661.314.420',
  article_description: 'ABRASIVO ARKANSAS',
  quantity: 10,
  unit_price: 7.29,
  discount_percent: 50,
  vat_percent: 22,
  line_total_with_vat: 44.47,
};

const FRESIS_ROW = {
  id: 'fh-1',
  archibald_order_number: 'KT-2024-081',
  created_at: '2024-07-15T00:00:00.000Z',
  items: JSON.stringify([
    {
      articleCode: 'SFM7.000.1',
      description: 'PUNTA SONICA',
      quantity: 2,
      price: 149.18,
      discount: 0,
      vat: 22,
    },
  ]),
};

describe('getCustomerFullHistory', () => {
  it('returns empty array when no params provided', async () => {
    const query = vi.fn();
    const pool = makePool(query);
    const result = await getCustomerFullHistory(pool, 'user-1', {});
    expect(result).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns orders from order_records when customerProfileId provided', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [ORDER_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = makePool(query);

    const result = await getCustomerFullHistory(pool, 'user-1', {
      customerProfileId: 'C10181',
    });

    const expected: FullHistoryOrder[] = [
      {
        source: 'orders',
        orderId: 'ord-1',
        orderNumber: 'FT 247',
        orderDate: '2024-02-23T00:00:00.000Z',
        totalAmount: 44.47,
        articles: [
          {
            articleCode: '661.314.420',
            articleDescription: 'ABRASIVO ARKANSAS',
            quantity: 10,
            unitPrice: 7.29,
            discountPercent: 50,
            vatPercent: 22,
            lineTotalWithVat: 44.47,
          },
        ],
      },
    ];
    expect(result).toEqual(expected);
  });

  it('returns fresis orders when subClientCodice provided', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [FRESIS_ROW] });
    const pool = makePool(query);

    const result = await getCustomerFullHistory(pool, 'user-1', {
      subClientCodice: 'C00042',
    });

    // lineTotalWithVat = 2 * 149.18 * (1 - 0/100) * (1 + 22/100) = 363.80
    expect(result).toEqual([
      {
        source: 'fresis',
        orderId: 'fh-1',
        orderNumber: 'KT-2024-081',
        orderDate: '2024-07-15T00:00:00.000Z',
        totalAmount: 363.8,
        articles: [
          {
            articleCode: 'SFM7.000.1',
            articleDescription: 'PUNTA SONICA',
            quantity: 2,
            unitPrice: 149.18,
            discountPercent: 0,
            vatPercent: 22,
            lineTotalWithVat: 363.8,
          },
        ],
      },
    ]);
  });

  it('merges and sorts by date descending when both params provided', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [ORDER_ROW] })  // order: 2024-02-23
      .mockResolvedValueOnce({ rows: [FRESIS_ROW] }); // fresis: 2024-07-15
    const pool = makePool(query);

    const result = await getCustomerFullHistory(pool, 'user-1', {
      customerProfileId: 'C10181',
      subClientCodice: 'C00042',
    });

    expect(result[0].source).toBe('fresis');   // più recente
    expect(result[1].source).toBe('orders');   // più vecchio
  });

  it('SQL query contains articles_synced_at IS NOT NULL filter', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = makePool(query);

    await getCustomerFullHistory(pool, 'user-1', { customerProfileId: 'C10181' });

    const sql: string = query.mock.calls[0][0];
    expect(sql).toContain('articles_synced_at IS NOT NULL');
  });

  it('SQL query contains NOT EXISTS to exclude NC orders', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = makePool(query);

    await getCustomerFullHistory(pool, 'user-1', { customerProfileId: 'C10181' });

    const sql: string = query.mock.calls[0][0];
    expect(sql).toContain('NOT EXISTS');
  });
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- customer-full-history.repository
```

Output atteso: FAIL — `getCustomerFullHistory` non trovata.

- [ ] **Step 3: Implementa il repository**

```typescript
// archibald-web-app/backend/src/db/repositories/customer-full-history.repository.ts
import type { DbPool } from '../pool';
import type { FullHistoryArticle, FullHistoryOrder } from '../../types/full-history';

type PendingOrderItemRaw = {
  articleCode: string;
  productName?: string;
  description?: string;
  quantity: number;
  price: number;
  vat: number;
  discount?: number;
};

type OrderArticleRow = {
  order_id: string;
  order_number: string;
  order_date: string;
  article_code: string;
  article_description: string | null;
  quantity: number;
  unit_price: number | null;
  discount_percent: number | null;
  vat_percent: number | null;
  line_total_with_vat: number | null;
};

type FresisHistoryRow = {
  id: string;
  archibald_order_number: string | null;
  created_at: string;
  items: unknown;
};

type HistoryParams = {
  customerProfileId?: string;
  subClientCodice?: string;
};

function mapOrderArticleRows(rows: OrderArticleRow[]): FullHistoryOrder[] {
  const ordersMap = new Map<string, FullHistoryOrder>();

  for (const row of rows) {
    if (!ordersMap.has(row.order_id)) {
      ordersMap.set(row.order_id, {
        source: 'orders',
        orderId: row.order_id,
        orderNumber: row.order_number,
        orderDate: row.order_date,
        totalAmount: 0,
        articles: [],
      });
    }
    const order = ordersMap.get(row.order_id)!;
    const lineTotalWithVat = row.line_total_with_vat ?? 0;
    const article: FullHistoryArticle = {
      articleCode: row.article_code,
      articleDescription: row.article_description ?? '',
      quantity: row.quantity,
      unitPrice: row.unit_price ?? 0,
      discountPercent: row.discount_percent ?? 0,
      vatPercent: row.vat_percent ?? 22,
      lineTotalWithVat,
    };
    order.articles.push(article);
    order.totalAmount = Math.round((order.totalAmount + lineTotalWithVat) * 100) / 100;
  }

  return Array.from(ordersMap.values());
}

function mapFresisRows(rows: FresisHistoryRow[]): FullHistoryOrder[] {
  return rows.map((row) => {
    const rawItems = Array.isArray(row.items)
      ? (row.items as PendingOrderItemRaw[])
      : (JSON.parse(row.items as string) as PendingOrderItemRaw[]);

    const articles: FullHistoryArticle[] = rawItems.map((item) => {
      const disc = item.discount ?? 0;
      const lineTotalWithVat =
        Math.round(item.quantity * item.price * (1 - disc / 100) * (1 + item.vat / 100) * 100) / 100;
      return {
        articleCode: item.articleCode,
        articleDescription: item.description ?? item.productName ?? '',
        quantity: item.quantity,
        unitPrice: item.price,
        discountPercent: disc,
        vatPercent: item.vat,
        lineTotalWithVat,
      };
    });

    const totalAmount = Math.round(articles.reduce((s, a) => s + a.lineTotalWithVat, 0) * 100) / 100;

    return {
      source: 'fresis' as const,
      orderId: row.id,
      orderNumber: row.archibald_order_number ?? row.id,
      orderDate: row.created_at,
      totalAmount,
      articles,
    };
  });
}

async function getCustomerFullHistory(
  pool: DbPool,
  userId: string,
  params: HistoryParams,
): Promise<FullHistoryOrder[]> {
  const { customerProfileId, subClientCodice } = params;
  if (!customerProfileId && !subClientCodice) return [];

  const [ordersResult, fresisResult] = await Promise.all([
    customerProfileId
      ? pool.query<OrderArticleRow>(
          `SELECT
             o.id AS order_id,
             o.order_number,
             o.order_date,
             a.article_code,
             a.article_description,
             a.quantity,
             a.unit_price,
             a.discount_percent,
             a.vat_percent,
             a.line_total_with_vat
           FROM agents.order_records o
           JOIN agents.order_articles a ON a.order_id = o.id AND a.user_id = o.user_id
           WHERE o.user_id = $1
             AND o.customer_profile_id = $2
             AND o.articles_synced_at IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM agents.order_records nc
               WHERE nc.user_id = o.user_id
                 AND nc.customer_profile_id = o.customer_profile_id
                 AND nc.gross_amount = -o.gross_amount
             )
           ORDER BY o.order_date DESC, a.article_code ASC`,
          [userId, customerProfileId],
        )
      : Promise.resolve({ rows: [] as OrderArticleRow[] }),

    subClientCodice
      ? pool.query<FresisHistoryRow>(
          `SELECT id, archibald_order_number, created_at, items
           FROM agents.fresis_history
           WHERE user_id = $1
             AND REGEXP_REPLACE(sub_client_codice, '^[Cc]0*', '') =
                 REGEXP_REPLACE($2, '^[Cc]0*', '')
           ORDER BY created_at DESC`,
          [userId, subClientCodice],
        )
      : Promise.resolve({ rows: [] as FresisHistoryRow[] }),
  ]);

  const orderOrders = mapOrderArticleRows(ordersResult.rows);
  const fresisOrders = mapFresisRows(fresisResult.rows);

  return [...orderOrders, ...fresisOrders].sort(
    (a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime(),
  );
}

export { getCustomerFullHistory };
```

- [ ] **Step 4: Esegui i test per verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- customer-full-history.repository
```

Output atteso: PASS — tutti i test green.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/customer-full-history.repository.ts \
        archibald-web-app/backend/src/db/repositories/customer-full-history.repository.spec.ts
git commit -m "feat(history): add customer-full-history repository with tests"
```

---

### Task 3: Route subclients — esponi by-customer

Il repository `getSubclientByCustomerProfile` esiste già in `subclients.ts` ed è esportato (riga 366). Manca il route e il wiring.

**Files:**
- Modifica: `archibald-web-app/backend/src/routes/subclients.ts`
- Modifica: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Aggiungi la dep al tipo `SubclientsRouterDeps`**

Apri `archibald-web-app/backend/src/routes/subclients.ts`. Trova il tipo `SubclientsRouterDeps` e aggiungi il campo:

```typescript
getSubclientByCustomerProfile: (profileId: string) => Promise<Subclient | null>;
```

- [ ] **Step 2: Aggiungi il route handler nella factory function**

Dentro `createSubclientsRouter`, prima del `return router`, aggiungi:

```typescript
router.get('/by-customer/:profileId', async (req, res) => {
  try {
    const subclient = await deps.getSubclientByCustomerProfile(req.params.profileId);
    res.json({ subclient: subclient ?? null });
  } catch {
    res.status(500).json({ error: 'Errore nel recupero del sottocliente' });
  }
});
```

- [ ] **Step 3: Aggiorna il wiring in `server.ts`**

Apri `archibald-web-app/backend/src/server.ts`. Verifica che `getSubclientByCustomerProfile` sia già importato dalla riga degli import di `subclients` repository. Se non lo è, aggiungilo:

```typescript
// Nella riga import dei subclients repository, aggiungi getSubclientByCustomerProfile:
import {
  // ...altri già presenti...
  getSubclientByCustomerProfile,
} from './db/repositories/subclients';
```

Poi trova il blocco `createSubclientsRouter({...})` (circa riga 819) e aggiungi:

```typescript
getSubclientByCustomerProfile: (profileId) =>
  getSubclientByCustomerProfile(pool, profileId),
```

- [ ] **Step 4: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Output atteso: nessun errore TypeScript.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/subclients.ts \
        archibald-web-app/backend/src/server.ts
git commit -m "feat(subclients): expose GET /api/subclients/by-customer/:profileId"
```

---

### Task 4: Router customer-full-history

Il router segue il pattern del codebase: le deps ricevono funzioni già pre-bound con `pool`, non `pool` direttamente.

**Files:**
- Crea: `archibald-web-app/backend/src/routes/customer-full-history.ts`
- Crea: `archibald-web-app/backend/src/routes/customer-full-history.spec.ts`
- Modifica: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Scrivi il test del router**

```typescript
// archibald-web-app/backend/src/routes/customer-full-history.spec.ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCustomerFullHistoryRouter } from './customer-full-history';
import type { FullHistoryOrder } from '../types/full-history';

const MOCK_ORDERS: FullHistoryOrder[] = [
  {
    source: 'orders',
    orderId: 'ord-1',
    orderNumber: 'FT 247',
    orderDate: '2024-02-23T00:00:00.000Z',
    totalAmount: 44.47,
    articles: [],
  },
];

function buildApp(getHistory = vi.fn().mockResolvedValue(MOCK_ORDERS)) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).user = { id: 'user-1' };
    next();
  });
  app.use('/api/history', createCustomerFullHistoryRouter({ getCustomerFullHistory: getHistory }));
  return { app, getHistory };
}

describe('GET /api/history/customer-full-history', () => {
  it('returns 400 when no params provided', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/history/customer-full-history');
    expect(res.status).toBe(400);
  });

  it('returns orders when customerProfileId provided', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get('/api/history/customer-full-history')
      .query({ customerProfileId: 'C10181' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ orders: MOCK_ORDERS });
  });

  it('passes userId from req.user to handler', async () => {
    const { app, getHistory } = buildApp();
    await request(app)
      .get('/api/history/customer-full-history')
      .query({ customerProfileId: 'C10181' });

    expect(getHistory).toHaveBeenCalledWith(
      'user-1',
      { customerProfileId: 'C10181', subClientCodice: undefined },
    );
  });

  it('accepts both params together', async () => {
    const { app, getHistory } = buildApp();
    await request(app)
      .get('/api/history/customer-full-history')
      .query({ customerProfileId: 'C10181', subClientCodice: 'C00042' });

    expect(getHistory).toHaveBeenCalledWith(
      'user-1',
      { customerProfileId: 'C10181', subClientCodice: 'C00042' },
    );
  });

  it('returns 500 on error', async () => {
    const { app } = buildApp(vi.fn().mockRejectedValue(new Error('DB error')));
    const res = await request(app)
      .get('/api/history/customer-full-history')
      .query({ customerProfileId: 'C10181' });
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- customer-full-history.spec
```

Output atteso: FAIL — `createCustomerFullHistoryRouter` non trovata.

- [ ] **Step 3: Implementa il router**

Le deps ricevono `getCustomerFullHistory` già pre-bound con `pool` (come da pattern codebase).

```typescript
// archibald-web-app/backend/src/routes/customer-full-history.ts
import { Router } from 'express';
import type { FullHistoryOrder } from '../types/full-history';

type CustomerFullHistoryRouterDeps = {
  getCustomerFullHistory: (
    userId: string,
    params: { customerProfileId?: string; subClientCodice?: string },
  ) => Promise<FullHistoryOrder[]>;
};

function createCustomerFullHistoryRouter(deps: CustomerFullHistoryRouterDeps) {
  const router = Router();

  router.get('/customer-full-history', async (req, res) => {
    const { customerProfileId, subClientCodice } = req.query as Record<string, string | undefined>;

    if (!customerProfileId && !subClientCodice) {
      res.status(400).json({ error: 'Almeno uno tra customerProfileId e subClientCodice è richiesto' });
      return;
    }

    try {
      const userId = (req.user as { id: string }).id;
      const orders = await deps.getCustomerFullHistory(userId, { customerProfileId, subClientCodice });
      res.json({ orders });
    } catch {
      res.status(500).json({ error: 'Errore nel recupero dello storico' });
    }
  });

  return router;
}

export { createCustomerFullHistoryRouter, type CustomerFullHistoryRouterDeps };
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- customer-full-history.spec
```

Output atteso: PASS — tutti i test green.

- [ ] **Step 5: Wiring in `server.ts`**

Aggiungi l'import del router e del repository:
```typescript
import { createCustomerFullHistoryRouter } from './routes/customer-full-history';
import { getCustomerFullHistory } from './db/repositories/customer-full-history.repository';
```

Aggiungi il mount (vicino agli altri `app.use` per ordini):
```typescript
app.use(
  '/api/history',
  authenticateJWT,
  createCustomerFullHistoryRouter({
    getCustomerFullHistory: (userId, params) => getCustomerFullHistory(pool, userId, params),
  }),
);
```

- [ ] **Step 6: Build e test completi**

```bash
npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend
```

Output atteso: build OK, tutti i test passano.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/routes/customer-full-history.ts \
        archibald-web-app/backend/src/routes/customer-full-history.spec.ts \
        archibald-web-app/backend/src/server.ts
git commit -m "feat(history): add GET /api/history/customer-full-history endpoint"
```

---

## Chunk 2: Frontend — API client e componenti

### Task 5: API client frontend

**Files:**
- Crea: `archibald-web-app/frontend/src/api/customer-full-history.ts`
- Modifica: `archibald-web-app/frontend/src/services/subclients.service.ts`

- [ ] **Step 1: Crea il client API**

Il pattern reale del codebase usa `fetchWithRetry` da `'../utils/fetch-with-retry'` e `API_BASE = ""` (stringa vuota, URL relative). Vedi `frontend/src/api/orders-history.ts` come riferimento.

```typescript
// archibald-web-app/frontend/src/api/customer-full-history.ts
import { fetchWithRetry } from '../utils/fetch-with-retry';

export type CustomerFullHistoryArticle = {
  articleCode: string;
  articleDescription: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  lineTotalWithVat: number;
};

export type CustomerFullHistoryOrder = {
  source: 'orders' | 'fresis';
  orderId: string;
  orderNumber: string;
  orderDate: string;
  totalAmount: number;
  articles: CustomerFullHistoryArticle[];
};

export async function getCustomerFullHistory(params: {
  customerProfileId?: string;
  subClientCodice?: string;
}): Promise<CustomerFullHistoryOrder[]> {
  const query = new URLSearchParams();
  if (params.customerProfileId) query.set('customerProfileId', params.customerProfileId);
  if (params.subClientCodice) query.set('subClientCodice', params.subClientCodice);

  const res = await fetchWithRetry(`/api/history/customer-full-history?${query.toString()}`);
  if (!res.ok) throw new Error(`Errore storico: ${res.status}`);
  const data = await res.json() as { orders: CustomerFullHistoryOrder[] };
  return data.orders;
}
```

- [ ] **Step 2: Aggiungi `getSubclientByMatchedCustomer` in `subclients.service.ts`**

Apri `archibald-web-app/frontend/src/services/subclients.service.ts`. Aggiungi dopo le funzioni esistenti e prima delle exports:

```typescript
async function getSubclientByMatchedCustomer(customerProfileId: string): Promise<Subclient | null> {
  const res = await fetchWithRetry(`/api/subclients/by-customer/${encodeURIComponent(customerProfileId)}`);
  if (!res.ok) throw new Error(`Errore: ${res.status}`);
  const data = await res.json() as { subclient: Subclient | null };
  return data.subclient;
}
```

Aggiungila alle exports in fondo al file:
```typescript
export {
  // ...existing exports...
  getSubclientByMatchedCustomer,
  // ...
};
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Output atteso: nessun errore TypeScript.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/api/customer-full-history.ts \
        archibald-web-app/frontend/src/services/subclients.service.ts
git commit -m "feat(history): add frontend API client and getSubclientByMatchedCustomer"
```

---

### Task 6: Esporta CustomerPickerModal da SubclientsTab

`CustomerPickerModal` è attualmente una funzione privata in `SubclientsTab.tsx`. Va esportata per poterla usare in `OrderFormSimple`.

**Files:**
- Modifica: `archibald-web-app/frontend/src/components/SubclientsTab.tsx`

- [ ] **Step 1: Aggiungi `export` alla dichiarazione di `CustomerPickerModal`**

Trova in `SubclientsTab.tsx` la riga:
```typescript
function CustomerPickerModal({
```

Cambiala in:
```typescript
export function CustomerPickerModal({
```

- [ ] **Step 2: Type-check per verificare che l'export non rompa nulla**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Output atteso: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/SubclientsTab.tsx
git commit -m "feat(history): export CustomerPickerModal from SubclientsTab"
```

---

### Task 7: SubClientPickerModal

Picker per il caso reverse matching: cliente diretto Archibald → collega a un sottocliente Fresis.

**Files:**
- Crea: `archibald-web-app/frontend/src/components/SubClientPickerModal.tsx`

Il tipo `Subclient` usato è quello di `subclients.service.ts` (che include `matchedCustomerProfileId` e `matchConfidence`). Tutti i servizi vengono importati da `'../services/subclients.service'`.

- [ ] **Step 1: Crea il componente**

```tsx
// archibald-web-app/frontend/src/components/SubClientPickerModal.tsx
import { useState, useEffect, useCallback } from 'react';
import { getSubclients, setSubclientMatch, type Subclient } from '../services/subclients.service';

type Props = {
  customerProfileId: string;
  customerName: string;
  onMatched: (subClient: Subclient) => void;
  onClose: () => void;
};

export function SubClientPickerModal({ customerProfileId, customerName, onMatched, onClose }: Props) {
  const [subclients, setSubclientsList] = useState<Subclient[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSubclients()
      .then(setSubclientsList)
      .catch(() => setError('Errore nel caricamento sottoclienti'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = subclients.filter(
    (s) =>
      s.ragioneSociale.toLowerCase().includes(query.toLowerCase()) ||
      s.codice.toLowerCase().includes(query.toLowerCase()),
  );

  const handleSelect = useCallback(
    async (sub: Subclient) => {
      setSaving(true);
      setError(null);
      try {
        await setSubclientMatch(sub.codice, customerProfileId);
        onMatched({ ...sub, matchedCustomerProfileId: customerProfileId, matchConfidence: 'manual' });
      } catch {
        setError('Errore nel salvataggio del collegamento');
        setSaving(false);
      }
    },
    [customerProfileId, onMatched],
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,23,42,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 10, width: '100%', maxWidth: 520,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          background: '#1e293b', color: 'white', padding: '14px 18px',
          borderRadius: '10px 10px 0 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Collega a un sottocliente Fresis</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Cliente: {customerName}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
            width: 30, height: 30, borderRadius: 6, cursor: 'pointer', fontSize: 15,
          }}>✕</button>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <input
            type="text"
            placeholder="Cerca sottocliente per nome o codice..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: '8px 12px',
              border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Caricamento...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Nessun sottocliente trovato
            </div>
          )}
          {filtered.map((sub) => (
            <button
              key={sub.codice}
              onClick={() => handleSelect(sub)}
              disabled={saving}
              style={{
                display: 'flex', width: '100%', textAlign: 'left',
                padding: '10px 16px', border: 'none', borderBottom: '1px solid #f1f5f9',
                background: 'white', cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                  {sub.ragioneSociale}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {sub.codice}
                  {sub.matchedCustomerProfileId && (
                    <span style={{ marginLeft: 8, color: '#ef4444' }}>⚠ già collegato</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {error && (
          <div style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Output atteso: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/SubClientPickerModal.tsx
git commit -m "feat(history): add SubClientPickerModal for reverse customer-subclient matching"
```

---

### Task 8: CustomerHistoryModal

**Files:**
- Crea: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx`

Note critiche prima di implementare:
- `priceService.getPriceAndVat(articleCode)` — il metodo prende un `articleId` che corrisponde all'`articleCode` dallo storico (sono lo stesso valore nel catalogo Archibald).
- Conflitto singolo articolo: si mostra **solo se** l'ordine contiene già un articolo con lo stesso `articleCode`.
- Logica replace: rimuove l'articolo con lo stesso `articleCode` prima di aggiungere il nuovo.

- [ ] **Step 1: Crea il componente**

```tsx
// archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
import { getCustomerFullHistory } from '../api/customer-full-history';
import type { PendingOrderItem } from '../types/pending-order';
import { priceService } from '../services/prices.service';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  customerProfileId: string | null;
  subClientCodice: string | null;
  isFresisClient: boolean;
  currentOrderItems: PendingOrderItem[];
  onAddArticle: (item: PendingOrderItem, replace: boolean) => void;
  onAddOrder: (items: PendingOrderItem[], replace: boolean) => void;
};

type PendingAction =
  | { type: 'single'; item: PendingOrderItem; existingCode: string }
  | { type: 'order'; items: PendingOrderItem[]; skipped: string[] };

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CustomerHistoryModal({
  isOpen, onClose, customerName, customerProfileId, subClientCodice,
  isFresisClient, currentOrderItems, onAddArticle, onAddOrder,
}: Props) {
  const [orders, setOrders] = useState<CustomerFullHistoryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [skippedDialog, setSkippedDialog] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    getCustomerFullHistory({
      customerProfileId: customerProfileId ?? undefined,
      subClientCodice: subClientCodice ?? undefined,
    })
      .then(setOrders)
      .catch(() => setError('Errore nel caricamento dello storico'))
      .finally(() => setLoading(false));
  }, [isOpen, customerProfileId, subClientCodice]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return orders;
    return orders
      .map((order) => {
        if (order.orderNumber.toLowerCase().includes(q)) return order;
        const matched = order.articles.filter(
          (a) =>
            a.articleCode.toLowerCase().includes(q) ||
            a.articleDescription.toLowerCase().includes(q),
        );
        return matched.length > 0 ? { ...order, articles: matched } : null;
      })
      .filter((o): o is CustomerFullHistoryOrder => o !== null);
  }, [orders, searchQuery]);

  const buildPendingItem = useCallback(
    async (a: CustomerFullHistoryOrder['articles'][number]): Promise<PendingOrderItem & { _priceWarning?: boolean }> => {
      if (isFresisClient) {
        return {
          articleCode: a.articleCode,
          productName: a.articleDescription,
          description: a.articleDescription,
          quantity: a.quantity,
          price: a.unitPrice,
          vat: a.vatPercent,
          discount: a.discountPercent,
        };
      }

      // Cliente diretto: recupera prezzo di listino attuale e calcola lo sconto
      const priceInfo = await priceService.getPriceAndVat(a.articleCode);
      const currentListPrice = priceInfo?.price ?? a.unitPrice;
      const lineAmountNoVat = a.lineTotalWithVat / (1 + a.vatPercent / 100);
      const calculatedDiscount =
        currentListPrice > 0
          ? (1 - lineAmountNoVat / (a.quantity * currentListPrice)) * 100
          : -1;
      const isValid = calculatedDiscount >= 0 && calculatedDiscount <= 100;

      return {
        articleCode: a.articleCode,
        productName: a.articleDescription,
        description: a.articleDescription,
        quantity: a.quantity,
        price: currentListPrice,
        vat: priceInfo?.vat ?? a.vatPercent,
        discount: isValid ? Math.round(calculatedDiscount * 100) / 100 : 0,
        _priceWarning: !isValid,
      } as PendingOrderItem & { _priceWarning?: boolean };
    },
    [isFresisClient],
  );

  const handleAddSingle = useCallback(
    async (article: CustomerFullHistoryOrder['articles'][number]) => {
      const item = await buildPendingItem(article);
      // Mostra dialog SOLO se questo stesso codice è già nell'ordine
      const alreadyPresent = currentOrderItems.some((i) => i.articleCode === article.articleCode);
      if (alreadyPresent) {
        setPendingAction({ type: 'single', item, existingCode: article.articleCode });
        return;
      }
      onAddArticle(item, false);
    },
    [buildPendingItem, currentOrderItems, onAddArticle],
  );

  const handleCopyOrder = useCallback(
    async (order: CustomerFullHistoryOrder) => {
      const validItems: PendingOrderItem[] = [];
      const skipped: string[] = [];

      for (const a of order.articles) {
        const priceInfo = isFresisClient
          ? { price: a.unitPrice, vat: a.vatPercent }
          : await priceService.getPriceAndVat(a.articleCode);

        if (!priceInfo) {
          skipped.push(`${a.articleCode} — ${a.articleDescription}`);
          continue;
        }
        validItems.push(await buildPendingItem(a));
      }

      const action: PendingAction = { type: 'order', items: validItems, skipped };
      if (currentOrderItems.length > 0) {
        setPendingAction(action);
        return;
      }
      onAddOrder(validItems, false);
      if (skipped.length > 0) setSkippedDialog(skipped);
    },
    [buildPendingItem, currentOrderItems.length, isFresisClient, onAddOrder],
  );

  const handleConflictChoice = useCallback(
    (replace: boolean) => {
      if (!pendingAction) return;
      if (pendingAction.type === 'single') {
        onAddArticle(pendingAction.item, replace);
      } else {
        onAddOrder(pendingAction.items, replace);
        if (pendingAction.skipped.length > 0) setSkippedDialog(pendingAction.skipped);
      }
      setPendingAction(null);
    },
    [onAddArticle, onAddOrder, pendingAction],
  );

  if (!isOpen) return null;

  const ordersCount = orders.filter((o) => o.source === 'orders').length;
  const fresisCount = orders.filter((o) => o.source === 'fresis').length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(15,23,42,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 12, width: '100%', maxWidth: 1100,
        height: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.4)', overflow: 'hidden',
      }}>
        {/* HEADER */}
        <div style={{
          background: '#1e293b', color: 'white', padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>📋 Storico Ordini — {customerName}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
              Storico ordini + Storico Fresis · Ordinati per data ↓
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
            width: 32, height: 32, borderRadius: 6, cursor: 'pointer', fontSize: 16, flexShrink: 0,
          }}>✕</button>
        </div>

        {/* FILTER BAR */}
        <div style={{
          padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <input
            type="text"
            placeholder="🔍  Cerca articolo, codice, numero ordine..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1, minWidth: 0, padding: '8px 12px',
              border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
            }}
          />
          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#e0e7ff', color: '#4338ca', whiteSpace: 'nowrap' }}>
            Ordini: {ordersCount}
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#ede9fe', color: '#6d28d9', whiteSpace: 'nowrap' }}>
            Fresis: {fresisCount}
          </span>
          <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
            {orders.length} ordini · {orders.reduce((s, o) => s + o.articles.length, 0)} articoli
          </span>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Caricamento storico...</div>}
          {error && <div style={{ textAlign: 'center', padding: 40, color: '#dc2626' }}>{error}</div>}
          {!loading && !error && filteredOrders.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              onAddArticle={(article) => handleAddSingle(article)}
              onCopyOrder={() => handleCopyOrder(order)}
            />
          ))}
          {!loading && !error && filteredOrders.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Nessun ordine trovato</div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12,
        }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Hover su una riga → <strong>+ Aggiungi</strong> per inserire · <strong>⊕ Copia tutto l'ordine</strong> per copiare l'ordine
          </span>
          <button onClick={onClose} style={{
            background: '#f1f5f9', color: '#475569', border: 'none',
            padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Chiudi</button>
        </div>
      </div>

      {pendingAction && (
        <ConflictDialog
          existingCount={currentOrderItems.length}
          isOrderCopy={pendingAction.type === 'order'}
          onAppend={() => handleConflictChoice(false)}
          onReplace={() => handleConflictChoice(true)}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {skippedDialog.length > 0 && (
        <SkippedDialog skipped={skippedDialog} onClose={() => setSkippedDialog([])} />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

type OrderCardProps = {
  order: CustomerFullHistoryOrder;
  onAddArticle: (article: CustomerFullHistoryOrder['articles'][number]) => void;
  onCopyOrder: () => void;
};

function OrderCard({ order, onAddArticle, onCopyOrder }: OrderCardProps) {
  const isFresis = order.source === 'fresis';
  const accent = isFresis ? '#8b5cf6' : '#3b82f6';
  const totalAmount = order.articles.reduce((s, a) => s + a.lineTotalWithVat, 0);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderLeft: `4px solid ${accent}`, borderRadius: 8, width: '100%' }}>
      <div style={{
        background: '#f8fafc', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid #e2e8f0', borderRadius: '8px 8px 0 0', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{order.orderNumber}</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>{new Date(order.orderDate).toLocaleDateString('it-IT')}</span>
        <span style={{
          padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
          background: isFresis ? '#ede9fe' : '#dbeafe',
          color: isFresis ? '#7c3aed' : '#1d4ed8',
        }}>{isFresis ? 'Storico Fresis' : 'Storico ordini'}</span>
        <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: '#059669' }}>€ {formatEur(totalAmount)}</span>
        <button onClick={onCopyOrder} style={{
          background: '#1e293b', color: 'white', border: 'none',
          padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>⊕ Copia tutto l'ordine</button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '13%' }} /><col style={{ width: '30%' }} />
          <col style={{ width: '7%' }} /><col style={{ width: '11%' }} />
          <col style={{ width: '9%' }} /><col style={{ width: '7%' }} />
          <col style={{ width: '11%' }} /><col style={{ width: '12%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {['Codice', 'Descrizione', 'Qtà', 'Prezzo unit.', 'Sconto', 'IVA', 'Tot. + IVA', ''].map((h, i) => (
              <th key={i} style={{
                padding: '7px 8px', textAlign: i >= 2 && i <= 6 ? 'right' : 'left',
                fontSize: 10, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                borderBottom: '1px solid #e2e8f0',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.articles.map((article, idx) => (
            <ArticleRow key={idx} article={article} onAdd={() => onAddArticle(article)} />
          ))}
        </tbody>
      </table>

      <div style={{
        background: '#f8fafc', borderTop: '2px solid #e2e8f0',
        padding: '10px 14px', display: 'flex', alignItems: 'center',
        justifyContent: 'flex-end', gap: 16, flexWrap: 'wrap', borderRadius: '0 0 8px 8px',
      }}>
        <FooterItem label="N. articoli" value={String(order.articles.length)} />
        <Divider />
        <FooterItem label="Imponibile" value={`€ ${formatEur(order.articles.reduce((s, a) => s + a.lineTotalWithVat / (1 + a.vatPercent / 100), 0))}`} />
        <Divider />
        <FooterItem label="IVA" value={`€ ${formatEur(order.articles.reduce((s, a) => s + (a.lineTotalWithVat - a.lineTotalWithVat / (1 + a.vatPercent / 100)), 0))}`} />
        <Divider />
        <FooterItem label="Totale documento" value={`€ ${formatEur(totalAmount)}`} green />
      </div>
    </div>
  );
}

function ArticleRow({ article, onAdd }: {
  article: CustomerFullHistoryOrder['articles'][number];
  onAdd: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: '1px solid #f1f5f9', background: hovered ? '#eff6ff' : 'white' }}
    >
      <td style={{ padding: '8px 8px', overflow: 'hidden' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#6366f1', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {article.articleCode}
        </span>
      </td>
      <td style={{ padding: '8px 8px', overflow: 'hidden' }}>
        <span style={{ fontSize: 12, color: '#1e293b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {article.articleDescription}
        </span>
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{article.quantity}</td>
      <td style={{ padding: '8px 8px', textAlign: 'right' }}>{formatEur(article.unitPrice)}</td>
      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
        <span style={{ background: '#fef9c3', color: '#854d0e', padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>{article.discountPercent}%</span>
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
        <span style={{ background: '#f0fdf4', color: '#166534', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>{article.vatPercent}%</span>
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700 }}>{formatEur(article.lineTotalWithVat)}</td>
      <td style={{ padding: '8px 8px' }}>
        <button onClick={onAdd} style={{
          opacity: hovered ? 1 : 0, background: '#6366f1', color: 'white',
          border: 'none', padding: '4px 8px', borderRadius: 4, fontSize: 10,
          fontWeight: 600, cursor: 'pointer', width: '100%', whiteSpace: 'nowrap',
        }}>+ Aggiungi</button>
      </td>
    </tr>
  );
}

function FooterItem({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
      <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontWeight: 700, color: green ? '#059669' : '#1e293b', fontSize: green ? 15 : 13 }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 30, background: '#e2e8f0' }} />;
}

function ConflictDialog({ existingCount, isOrderCopy, onAppend, onReplace, onCancel }: {
  existingCount: number;
  isOrderCopy: boolean;
  onAppend: () => void;
  onReplace: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 10, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Ordine non vuoto</div>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 20 }}>
          Hai già <strong>{existingCount}</strong> {existingCount === 1 ? 'articolo' : 'articoli'} nell'ordine.{' '}
          {isOrderCopy
            ? "Vuoi aggiungere gli articoli in coda o sovrascrivere tutto l'ordine?"
            : 'Questo articolo è già presente. Vuoi aggiungerlo in coda o sostituire quello esistente?'}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Annulla</button>
          <button onClick={onReplace} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sovrascrivi</button>
          <button onClick={onAppend} style={{ background: '#6366f1', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Aggiungi in coda</button>
        </div>
      </div>
    </div>
  );
}

function SkippedDialog({ skipped, onClose }: { skipped: string[]; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 10, padding: 24, maxWidth: 480, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>⚠ Articoli non trovati nel catalogo</div>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>
          I seguenti articoli non sono stati copiati perché non trovati nel catalogo attuale:
        </p>
        <ul style={{ fontSize: 12, color: '#64748b', paddingLeft: 18, marginBottom: 20 }}>
          {skipped.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#6366f1', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Capito</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Output atteso: nessun errore TypeScript.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx
git commit -m "feat(history): add CustomerHistoryModal with article and order copy logic"
```

---

## Chunk 3: Integrazione in OrderFormSimple e verifica finale

### Task 9: Modifica OrderFormSimple

**Files:**
- Modifica: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

- [ ] **Step 1: Identifica i blocchi da rimuovere**

```bash
grep -n "showHistorySearchModal\|historySearchQuery\|historySearchResults\|searchInHistory\|selectArticleFromHistory\|handleHistorySearchChange" \
  archibald-web-app/frontend/src/components/OrderFormSimple.tsx
```

Annota i numeri di riga di:
- Le 3 dichiarazioni `useState` (`showHistorySearchModal`, `historySearchQuery`, `historySearchResults`)
- Le funzioni `searchInHistory`, `handleHistorySearchChange`, `selectArticleFromHistory`
- Il blocco JSX `{showHistorySearchModal && ...}`
- Il bottone con `onClick={() => setShowHistorySearchModal(true)}`

- [ ] **Step 2: Aggiungi imports necessari**

In cima a `OrderFormSimple.tsx`, vicino agli altri import di componenti, aggiungi:

```typescript
import { CustomerHistoryModal } from './CustomerHistoryModal';
import { SubClientPickerModal } from './SubClientPickerModal';
import { CustomerPickerModal } from './SubclientsTab';
import {
  setSubclientMatch,
  getSubclientByMatchedCustomer,
} from '../services/subclients.service';
```

- [ ] **Step 3: Sostituisci i 3 state obsoleti con i nuovi**

Rimuovi le 3 dichiarazioni `useState` (`showHistorySearchModal`, `historySearchQuery`, `historySearchResults`). Aggiungi al loro posto:

```typescript
const [showCustomerHistoryModal, setShowCustomerHistoryModal] = useState(false);
const [showSubClientPickerModal, setShowSubClientPickerModal] = useState(false);
const [showCustomerPickerForHistory, setShowCustomerPickerForHistory] = useState(false);
```

- [ ] **Step 4: Rimuovi le funzioni obsolete**

Rimuovi: `searchInHistory`, `handleHistorySearchChange`, `selectArticleFromHistory`.

Verifica prima che nessun'altra parte del file le usi:
```bash
grep -n "searchInHistory\|selectArticleFromHistory\|handleHistorySearchChange" \
  archibald-web-app/frontend/src/components/OrderFormSimple.tsx
```

Se compaiono solo nelle definizioni (non in altri `onClick` o JSX), puoi rimuoverle.

- [ ] **Step 5: Aggiungi `handleHistorySearchClick`**

Aggiungi questa funzione dopo gli altri handler:

```typescript
const handleHistorySearchClick = useCallback(async () => {
  if (!selectedCustomer) return;

  if (isFresis(selectedCustomer) && selectedSubClient) {
    if (!selectedSubClient.matchedCustomerProfileId) {
      setShowCustomerPickerForHistory(true);
      return;
    }
  } else if (!isFresis(selectedCustomer)) {
    try {
      const linked = await getSubclientByMatchedCustomer(selectedCustomer.id);
      if (!linked) {
        setShowSubClientPickerModal(true);
        return;
      }
    } catch {
      // Se la query fallisce, apri comunque il modal storico con i dati disponibili
    }
  }

  setShowCustomerHistoryModal(true);
}, [selectedCustomer, selectedSubClient]);
```

- [ ] **Step 6: Aggiorna il bottone "Cerca nello Storico"**

Trova il bottone con `onClick={() => setShowHistorySearchModal(true)}` e cambialo in:

```tsx
<button onClick={handleHistorySearchClick}>
  Cerca nello Storico
</button>
```

- [ ] **Step 7: Rimuovi il vecchio modal JSX e aggiungi i nuovi**

Rimuovi il blocco `{showHistorySearchModal && <div>...</div>}`.

Aggiungi in fondo al JSX del componente (prima della chiusura del tag root), vicino agli altri modal:

```tsx
{/* Modal storico completo */}
{showCustomerHistoryModal && selectedCustomer && (
  <CustomerHistoryModal
    isOpen={showCustomerHistoryModal}
    onClose={() => setShowCustomerHistoryModal(false)}
    customerName={selectedCustomer.name}
    customerProfileId={isFresis(selectedCustomer) ? null : selectedCustomer.id}
    subClientCodice={selectedSubClient?.codice ?? null}
    isFresisClient={isFresis(selectedCustomer)}
    currentOrderItems={items.map((i) => ({
      articleCode: i.article,           // <-- verifica il campo esatto in OrderItem
      productName: i.productName,
      description: i.description,
      quantity: i.quantity,
      price: i.unitPrice,
      vat: i.vatRate ?? i.vat,          // <-- verifica il campo esatto: vatRate o vat
      discount: i.discount ?? 0,
      originalListPrice: i.originalListPrice,
    }))}
    onAddArticle={(newItem, replace) => {
      setItems((prev) => {
        const filtered = replace
          ? prev.filter((existing) => existing.article !== newItem.articleCode)
          : prev;
        return [...filtered, {
          id: crypto.randomUUID(),
          productId: newItem.articleCode,
          article: newItem.articleCode,
          productName: newItem.productName ?? newItem.articleCode,
          description: newItem.description ?? '',
          quantity: newItem.quantity,
          unitPrice: newItem.price,
          vatRate: newItem.vat,        // <-- verifica campo esatto
          discount: newItem.discount ?? 0,
          subtotal: newItem.quantity * newItem.price * (1 - (newItem.discount ?? 0) / 100),
          vat: newItem.quantity * newItem.price * (1 - (newItem.discount ?? 0) / 100) * (newItem.vat / 100),
          total: newItem.quantity * newItem.price * (1 - (newItem.discount ?? 0) / 100) * (1 + newItem.vat / 100),
          originalListPrice: newItem.price,
        }];
      });
    }}
    onAddOrder={(newItems, replace) => {
      const mapped = newItems.map((newItem) => ({
        id: crypto.randomUUID(),
        productId: newItem.articleCode,
        article: newItem.articleCode,
        productName: newItem.productName ?? newItem.articleCode,
        description: newItem.description ?? '',
        quantity: newItem.quantity,
        unitPrice: newItem.price,
        vatRate: newItem.vat,
        discount: newItem.discount ?? 0,
        subtotal: newItem.quantity * newItem.price * (1 - (newItem.discount ?? 0) / 100),
        vat: newItem.quantity * newItem.price * (1 - (newItem.discount ?? 0) / 100) * (newItem.vat / 100),
        total: newItem.quantity * newItem.price * (1 - (newItem.discount ?? 0) / 100) * (1 + newItem.vat / 100),
        originalListPrice: newItem.price,
      }));
      setItems(replace ? mapped : (prev) => [...prev, ...mapped]);
    }}
  />
)}

{/* CustomerPickerModal — Fresis: collega sottocliente a cliente Archibald */}
{showCustomerPickerForHistory && selectedSubClient && (
  <CustomerPickerModal
    onSelect={async (profileId) => {
      await setSubclientMatch(selectedSubClient.codice, profileId);
      setSelectedSubClient((prev) =>
        prev ? { ...prev, matchedCustomerProfileId: profileId, matchConfidence: 'manual' } : prev,
      );
      setShowCustomerPickerForHistory(false);
      setShowCustomerHistoryModal(true);
    }}
    onClose={() => setShowCustomerPickerForHistory(false)}
  />
)}

{/* SubClientPickerModal — cliente diretto: collega a sottocliente Fresis */}
{showSubClientPickerModal && selectedCustomer && !isFresis(selectedCustomer) && (
  <SubClientPickerModal
    customerProfileId={selectedCustomer.id}
    customerName={selectedCustomer.name}
    onMatched={() => {
      setShowSubClientPickerModal(false);
      setShowCustomerHistoryModal(true);
    }}
    onClose={() => setShowSubClientPickerModal(false)}
  />
)}
```

> **Nota mapping `OrderItem`:** I campi interni di `OrderItem` in `OrderFormSimple` potrebbero usare nomi leggermente diversi da quanto mostrato (es. `vatRate` vs `vat`, `article` vs `articleCode`). Leggi i campi effettivi dell'oggetto `items` nelle righe intorno alla funzione `handleAddItem` prima di applicare il mapping. Adatta i nomi di campo di conseguenza — il type-check al passo successivo segnala ogni discrepanza.

- [ ] **Step 8: Type-check — risolvi tutti gli errori**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Risolvi ogni errore TypeScript. Tipici errori attesi:
- Campi `OrderItem` con nome diverso → aggiusta il mapping
- `setSelectedSubClient` non callable se è `Dispatch<SetStateAction<SubClient | null>>` → usa la forma funzionale corretta
- `CustomerPickerModal` props diverse → allinea in base alla firma reale

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(history): integrate CustomerHistoryModal into OrderFormSimple with matching flow"
```

---

### Task 10: Verifica finale

- [ ] **Step 1: Test backend completi**

```bash
npm test --prefix archibald-web-app/backend
```

Output atteso: tutti i test passano.

- [ ] **Step 2: Test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Output atteso: tutti i test passano. I test pre-esistenti `customers.service.spec.ts` e `products.service.spec.ts` potrebbero avere problemi di fetch mocking pre-esistenti — ignorali se erano già fallenti prima di questa feature.

- [ ] **Step 3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 4: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 5: Commit di chiusura**

```bash
git add archibald-web-app/backend/src/types/full-history.ts \
        archibald-web-app/backend/src/db/repositories/customer-full-history.repository.ts \
        archibald-web-app/backend/src/db/repositories/customer-full-history.repository.spec.ts \
        archibald-web-app/backend/src/routes/customer-full-history.ts \
        archibald-web-app/backend/src/routes/customer-full-history.spec.ts \
        archibald-web-app/frontend/src/api/customer-full-history.ts \
        archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx \
        archibald-web-app/frontend/src/components/SubClientPickerModal.tsx \
        archibald-web-app/frontend/src/components/SubclientsTab.tsx \
        archibald-web-app/frontend/src/services/subclients.service.ts
git commit -m "feat(history): complete cerca-nello-storico full customer history feature"
```

---

## Riepilogo feature completata

| Elemento | Tipo | Responsabilità |
|----------|------|---------------|
| `GET /api/history/customer-full-history` | Endpoint | Fonde ordini standard + Fresis, ordinati per data |
| `GET /api/subclients/by-customer/:profileId` | Endpoint | Trova sottocliente già matchato a un cliente diretto |
| `customer-full-history.repository.ts` | Backend | Query parallele orders + fresis con mapping |
| `CustomerHistoryModal.tsx` | Frontend | Modal con ordini espansi, articoli, copy logic |
| `SubClientPickerModal.tsx` | Frontend | Picker per reverse matching diretto → subclient |
| `CustomerPickerModal` (export) | Frontend | Già esistente, ora esportato per uso in OrderFormSimple |
| `OrderFormSimple.tsx` | Frontend | Bottone "Cerca nello Storico" con flow matching obbligatorio |

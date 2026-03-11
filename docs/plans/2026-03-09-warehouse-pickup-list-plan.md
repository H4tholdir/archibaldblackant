# Warehouse Pickup List + Restyling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aggiungere il tab "Articoli da prendere" in Gestione Magazzino e allineare lo stile visivo della pagina con il resto della PWA.

**Architecture:** Backend — nuova repository function + endpoint REST. Frontend — fix WarehouseUpload, nuovo componente WarehousePickupList, refactor WarehouseManagementView con tab navigation e restyling.

**Tech Stack:** TypeScript strict, Express, PostgreSQL (pg pool), React 19, Vitest, Supertest, inline styles (nessun CSS framework)

---

## Task 1: Backend — repository function `getWarehousePickupsByDate`

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/orders.ts`
- Test: `archibald-web-app/backend/src/db/repositories/orders.spec.ts`

### Step 1: Scrivi il test failing

Aggiungi in fondo a `orders.spec.ts` (prima della chiusura del file):

```typescript
describe('getWarehousePickupsByDate', () => {
  const userId = 'user-1';
  const date = '2026-03-09';

  test('returns orders with warehouse articles for the given date', async () => {
    const pool = createMockPool(async (text, params) => {
      if (String(text).includes('warehouse_quantity')) {
        return {
          rows: [
            {
              order_id: 'ord-1',
              order_number: 'ORD/2026/00142',
              customer_name: 'Rossi Mario',
              creation_date: '2026-03-09T08:45:00Z',
              article_id: 10,
              article_code: 'H379.104.014',
              article_description: 'Rubinetto 3/4"',
              warehouse_quantity: 3,
              warehouse_sources_json: '[{"boxName":"BOX-A1","quantity":3}]',
            },
          ],
          rowCount: 1,
        } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const result = await getWarehousePickupsByDate(pool, userId, date);

    expect(result).toEqual([
      {
        orderId: 'ord-1',
        orderNumber: 'ORD/2026/00142',
        customerName: 'Rossi Mario',
        creationDate: '2026-03-09T08:45:00Z',
        articles: [
          {
            id: 10,
            articleCode: 'H379.104.014',
            articleDescription: 'Rubinetto 3/4"',
            warehouseQuantity: 3,
            warehouseSources: [{ boxName: 'BOX-A1', quantity: 3 }],
          },
        ],
      },
    ]);
  });

  test('returns empty array when no warehouse articles for the date', async () => {
    const pool = createMockPool(async () => ({ rows: [], rowCount: 0 } as any));
    const result = await getWarehousePickupsByDate(pool, userId, date);
    expect(result).toEqual([]);
  });

  test('groups multiple articles under the same order', async () => {
    const pool = createMockPool(async (text) => {
      if (String(text).includes('warehouse_quantity')) {
        return {
          rows: [
            {
              order_id: 'ord-1', order_number: 'ORD/2026/00142',
              customer_name: 'Rossi', creation_date: '2026-03-09T08:45:00Z',
              article_id: 10, article_code: 'ART-A', article_description: 'Desc A',
              warehouse_quantity: 2, warehouse_sources_json: null,
            },
            {
              order_id: 'ord-1', order_number: 'ORD/2026/00142',
              customer_name: 'Rossi', creation_date: '2026-03-09T08:45:00Z',
              article_id: 11, article_code: 'ART-B', article_description: 'Desc B',
              warehouse_quantity: 5, warehouse_sources_json: null,
            },
          ],
          rowCount: 2,
        } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const result = await getWarehousePickupsByDate(pool, userId, date);

    expect(result).toEqual([
      {
        orderId: 'ord-1',
        orderNumber: 'ORD/2026/00142',
        customerName: 'Rossi',
        creationDate: '2026-03-09T08:45:00Z',
        articles: [
          { id: 10, articleCode: 'ART-A', articleDescription: 'Desc A', warehouseQuantity: 2, warehouseSources: [] },
          { id: 11, articleCode: 'ART-B', articleDescription: 'Desc B', warehouseQuantity: 5, warehouseSources: [] },
        ],
      },
    ]);
  });
});
```

### Step 2: Verifica che il test fallisca

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose orders.spec
```

Atteso: FAIL con "getWarehousePickupsByDate is not a function"

### Step 3: Implementa la funzione in `orders.ts`

Aggiungi i tipi e la funzione **prima** del blocco `export { ... }`:

```typescript
type WarehousePickupArticle = {
  id: number;
  articleCode: string;
  articleDescription: string | null;
  warehouseQuantity: number;
  warehouseSources: Array<{ boxName: string; quantity: number }>;
};

type WarehousePickupOrder = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  creationDate: string;
  articles: WarehousePickupArticle[];
};

type WarehousePickupRow = {
  order_id: string;
  order_number: string;
  customer_name: string;
  creation_date: string;
  article_id: number;
  article_code: string;
  article_description: string | null;
  warehouse_quantity: number;
  warehouse_sources_json: string | null;
};

async function getWarehousePickupsByDate(
  pool: DbPool,
  userId: string,
  date: string,
): Promise<WarehousePickupOrder[]> {
  const { rows } = await pool.query<WarehousePickupRow>(
    `SELECT
       o.id AS order_id,
       o.order_number,
       o.customer_name,
       o.creation_date,
       a.id AS article_id,
       a.article_code,
       a.article_description,
       a.warehouse_quantity,
       a.warehouse_sources_json
     FROM agents.order_records o
     JOIN agents.order_articles a
       ON a.order_id = o.id AND a.user_id = o.user_id
     WHERE o.user_id = $1
       AND DATE(o.creation_date) = $2::date
       AND a.warehouse_quantity > 0
     ORDER BY o.creation_date ASC, o.order_number ASC, a.id ASC`,
    [userId, date],
  );

  const ordersMap = new Map<string, WarehousePickupOrder>();
  for (const row of rows) {
    let order = ordersMap.get(row.order_id);
    if (!order) {
      order = {
        orderId: row.order_id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        creationDate: row.creation_date,
        articles: [],
      };
      ordersMap.set(row.order_id, order);
    }
    let sources: Array<{ boxName: string; quantity: number }> = [];
    if (row.warehouse_sources_json) {
      try {
        const parsed = JSON.parse(row.warehouse_sources_json);
        sources = Array.isArray(parsed) ? parsed : [];
      } catch {
        sources = [];
      }
    }
    order.articles.push({
      id: row.article_id,
      articleCode: row.article_code,
      articleDescription: row.article_description,
      warehouseQuantity: row.warehouse_quantity,
      warehouseSources: sources,
    });
  }

  return Array.from(ordersMap.values());
}
```

Aggiungilo anche al blocco `export { ... }` e ai tipi esportati:

```typescript
// Nel blocco export esistente, aggiungi:
  getWarehousePickupsByDate,
  type WarehousePickupArticle,
  type WarehousePickupOrder,
```

### Step 4: Verifica che i test passino

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose orders.spec
```

Atteso: PASS tutti e 3 i test nuovi

### Step 5: Build backend

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: 0 errori TypeScript

### Step 6: Commit

```bash
git add archibald-web-app/backend/src/db/repositories/orders.ts \
        archibald-web-app/backend/src/db/repositories/orders.spec.ts
git commit -m "feat(backend): add getWarehousePickupsByDate repository function"
```

---

## Task 2: Backend — route `GET /api/orders/warehouse-pickups`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/orders.ts`
- Modify: `archibald-web-app/backend/src/server.ts`
- Test: `archibald-web-app/backend/src/routes/orders.spec.ts`

### Step 1: Scrivi il test failing

Apri `routes/orders.spec.ts`. Aggiungi import del tipo:

```typescript
import type { WarehousePickupOrder } from '../db/repositories/orders';
```

Aggiungi il mock nella sezione `deps` del `beforeEach` esistente. Prima cerca dove è definito `deps` (circa linea 158-180) e aggiungi la proprietà:

```typescript
getWarehousePickupsByDate: vi.fn<[string, string], Promise<WarehousePickupOrder[]>>()
  .mockResolvedValue([]),
```

Aggiungi poi un nuovo describe alla fine del file:

```typescript
describe('GET /api/orders/warehouse-pickups', () => {
  const mockPickup: WarehousePickupOrder = {
    orderId: 'ord-1',
    orderNumber: 'ORD/2026/00142',
    customerName: 'Rossi Mario',
    creationDate: '2026-03-09T08:45:00Z',
    articles: [
      {
        id: 10,
        articleCode: 'H379.104.014',
        articleDescription: 'Rubinetto 3/4"',
        warehouseQuantity: 3,
        warehouseSources: [{ boxName: 'BOX-A1', quantity: 3 }],
      },
    ],
  };

  test('returns 400 when date query param is missing', async () => {
    const res = await request(app).get('/api/orders/warehouse-pickups');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Parametro date obbligatorio (YYYY-MM-DD)' });
  });

  test('returns 400 when date format is invalid', async () => {
    const res = await request(app).get('/api/orders/warehouse-pickups?date=not-a-date');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Formato data non valido. Usa YYYY-MM-DD' });
  });

  test('returns pickup orders for valid date', async () => {
    vi.mocked(deps.getWarehousePickupsByDate!).mockResolvedValue([mockPickup]);

    const res = await request(app).get('/api/orders/warehouse-pickups?date=2026-03-09');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [mockPickup] });
  });

  test('returns empty array when no pickups for the date', async () => {
    vi.mocked(deps.getWarehousePickupsByDate!).mockResolvedValue([]);

    const res = await request(app).get('/api/orders/warehouse-pickups?date=2026-03-09');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });
});
```

### Step 2: Verifica che i test falliscano

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose routes/orders.spec
```

Atteso: FAIL — route non esiste ancora

### Step 3: Aggiungi la dipendenza e la route in `routes/orders.ts`

**In `OrdersRouterDeps`** (circa linea 44), aggiungi la proprietà opzionale:

```typescript
getWarehousePickupsByDate?: (userId: string, date: string) => Promise<WarehousePickupOrder[]>;
```

Aggiungi anche l'import del tipo in cima al file:

```typescript
import type { ..., WarehousePickupOrder } from '../db/repositories/orders';
```

**In `createOrdersRouter`**, nella destrutturazione di `deps` (circa linea 48):

```typescript
const {
  queue, getOrdersByUser, countOrders, getOrderById, getOrderArticles,
  getStateHistory, getLastSalesForArticle, getOrderNumbersByIds,
  getOrderHistoryByCustomer, getVerificationSnapshot,
  getWarehousePickupsByDate,  // ← aggiungi qui
} = deps;
```

**Aggiungi la route** prima di `return router;`:

```typescript
router.get('/warehouse-pickups', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ success: false, error: 'Parametro date obbligatorio (YYYY-MM-DD)' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'Formato data non valido. Usa YYYY-MM-DD' });
    }

    const pickups = await getWarehousePickupsByDate!(userId, date);
    res.json({ success: true, data: pickups });
  } catch (error) {
    logger.error('Error fetching warehouse pickups', { error });
    res.status(500).json({ success: false, error: 'Errore nel recupero prelievi magazzino' });
  }
});
```

> **Nota:** La route `/warehouse-pickups` deve essere registrata PRIMA di `/:orderId` altrimenti Express interpreterebbe "warehouse-pickups" come orderId.

### Step 4: Wira in `server.ts`

Nel blocco `createOrdersRouter({...})` (linea ~474), aggiungi:

```typescript
getWarehousePickupsByDate: (userId, date) =>
  ordersRepo.getWarehousePickupsByDate(pool, userId, date),
```

### Step 5: Verifica test e build

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose routes/orders.spec
npm run build --prefix archibald-web-app/backend
```

Atteso: tutti i test PASS, build 0 errori

### Step 6: Commit

```bash
git add archibald-web-app/backend/src/routes/orders.ts \
        archibald-web-app/backend/src/routes/orders.spec.ts \
        archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): add GET /api/orders/warehouse-pickups endpoint"
```

---

## Task 3: Frontend — fix `WarehouseUpload.tsx`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/WarehouseUpload.tsx`

### Step 1: Rimuovi il titolo duplicato (linea 77)

Cambia:

```tsx
<div className="warehouse-upload-header">
  <h3>📦 Gestione Magazzino</h3>
  <button
```

In:

```tsx
<div className="warehouse-upload-header">
  <span style={{ fontWeight: 600, fontSize: "15px", color: "#555" }}>
    📤 Carica inventario Excel
  </span>
  <button
```

### Step 2: Fix Invalid Date (linea 174)

Cambia:

```tsx
{new Date(metadata.uploadedAt).toLocaleString("it-IT")}
```

In:

```tsx
{(() => {
  const d = new Date(metadata.uploadedAt);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("it-IT");
})()}
```

### Step 3: Type-check

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: 0 errori

### Step 4: Commit

```bash
git add archibald-web-app/frontend/src/components/WarehouseUpload.tsx
git commit -m "fix(frontend): remove duplicate title and fix Invalid Date in WarehouseUpload"
```

---

## Task 4: Frontend — API client per warehouse pickups

**Files:**
- Create: `archibald-web-app/frontend/src/api/warehouse-pickups.ts`

### Step 1: Crea il file

```typescript
import { fetchWithRetry } from "../utils/fetch-with-retry";

const API_BASE = "";

export type WarehousePickupArticle = {
  id: number;
  articleCode: string;
  articleDescription: string | null;
  warehouseQuantity: number;
  warehouseSources: Array<{ boxName: string; quantity: number }>;
};

export type WarehousePickupOrder = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  creationDate: string;
  articles: WarehousePickupArticle[];
};

export async function getWarehousePickups(date: string): Promise<WarehousePickupOrder[]> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/orders/warehouse-pickups?date=${encodeURIComponent(date)}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data as WarehousePickupOrder[];
}
```

### Step 2: Type-check

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: 0 errori

### Step 3: Commit

```bash
git add archibald-web-app/frontend/src/api/warehouse-pickups.ts
git commit -m "feat(frontend): add warehouse-pickups API client"
```

---

## Task 5: Frontend — componente `WarehousePickupList`

**Files:**
- Create: `archibald-web-app/frontend/src/components/WarehousePickupList.tsx`

### Step 1: Crea il componente

```tsx
import { useState, useEffect } from "react";
import type { WarehousePickupOrder } from "../api/warehouse-pickups";
import { getWarehousePickups } from "../api/warehouse-pickups";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " +
      d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export function WarehousePickupList() {
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [orders, setOrders] = useState<WarehousePickupOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setCheckedIds(new Set());
    loadPickups();
  }, [selectedDate]);

  const loadPickups = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWarehousePickups(selectedDate);
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  };

  const toggleChecked = (id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalArticles = orders.reduce((sum, o) => sum + o.articles.length, 0);
  const totalPieces = orders.reduce(
    (sum, o) => sum + o.articles.reduce((s, a) => s + a.warehouseQuantity, 0),
    0,
  );

  const handlePrint = () => window.print();

  return (
    <div style={{ padding: "20px" }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <label style={{ fontWeight: 600, color: "#444", fontSize: "14px" }}>
            Data:
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "6px",
              fontSize: "14px",
            }}
          />
          <button
            onClick={() => setSelectedDate(todayISO())}
            style={{
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 600,
              border: "1px solid #1565c0",
              borderRadius: "6px",
              background: "#e3f2fd",
              color: "#1565c0",
              cursor: "pointer",
            }}
          >
            Oggi
          </button>
        </div>
        <button
          onClick={handlePrint}
          style={{
            padding: "10px 18px",
            fontSize: "14px",
            fontWeight: 600,
            border: "none",
            borderRadius: "6px",
            background: "#d32f2f",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          🖨️ Stampa / PDF
        </button>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
          Caricamento...
        </div>
      )}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "#fdecea",
            border: "1px solid #f5c6cb",
            borderRadius: "6px",
            color: "#c62828",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      )}

      {/* Summary bar */}
      {!loading && !error && orders.length > 0 && (
        <div
          style={{
            background: "#f3f4ff",
            border: "1px solid #c5cae9",
            borderRadius: "8px",
            padding: "10px 16px",
            marginBottom: "16px",
            fontSize: "13px",
            color: "#3949ab",
            display: "flex",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <span>
            <strong>{orders.length}</strong> ordini
          </span>
          <span>
            <strong>{totalArticles}</strong> articoli da prelevare
          </span>
          <span>
            <strong>{totalPieces}</strong> pezzi totali
          </span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && orders.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 20px",
            color: "#aaa",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "10px" }}>📭</div>
          <p style={{ fontSize: "15px" }}>
            Nessun articolo da prelevare per questa data.
          </p>
        </div>
      )}

      {/* Order cards */}
      {orders.map((order) => (
        <div
          key={order.orderId}
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            marginBottom: "14px",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {/* Card header */}
          <div
            style={{
              background: "#f5f5f5",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid #e0e0e0",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div>
              <span
                style={{ fontSize: "15px", fontWeight: 700, color: "#1565c0" }}
              >
                {order.orderNumber}
              </span>
              <span style={{ margin: "0 8px", color: "#bbb" }}>·</span>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#333" }}>
                {order.customerName}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "12px", color: "#888" }}>
                {formatDate(order.creationDate)}
              </span>
              <span
                style={{
                  background: "#e8f5e9",
                  color: "#2e7d32",
                  padding: "3px 10px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                {order.articles.length} art.
              </span>
            </div>
          </div>

          {/* Articles table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={{ width: "36px", padding: "8px 12px" }}></th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Codice</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Descrizione</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Scatolo</th>
                <th style={{ textAlign: "center", padding: "8px 12px", color: "#666", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Pezzi</th>
              </tr>
            </thead>
            <tbody>
              {order.articles.map((article) => {
                const isChecked = checkedIds.has(article.id);
                const boxName = article.warehouseSources[0]?.boxName ?? "—";
                return (
                  <tr
                    key={article.id}
                    style={{
                      borderBottom: "1px solid #f0f0f0",
                      background: isChecked ? "#f1f8e9" : undefined,
                      opacity: isChecked ? 0.7 : 1,
                    }}
                  >
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleChecked(article.id)}
                        style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#4caf50" }}
                      />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "12px",
                          color: isChecked ? "#aaa" : "#1565c0",
                          fontWeight: 600,
                          textDecoration: isChecked ? "line-through" : undefined,
                        }}
                      >
                        {article.articleCode}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: isChecked ? "#aaa" : "#333", textDecoration: isChecked ? "line-through" : undefined }}>
                      {article.articleDescription ?? "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          background: "#fff3e0",
                          color: "#e65100",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        {boxName}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span
                        style={{
                          background: "#e3f2fd",
                          color: "#0d47a1",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          fontSize: "13px",
                          fontWeight: 700,
                          display: "inline-block",
                          minWidth: "36px",
                          textAlign: "center",
                        }}
                      >
                        {article.warehouseQuantity}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Print styles */}
      <style>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
```

### Step 2: Type-check

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: 0 errori

### Step 3: Commit

```bash
git add archibald-web-app/frontend/src/components/WarehousePickupList.tsx
git commit -m "feat(frontend): add WarehousePickupList component"
```

---

## Task 6: Frontend — restyling `WarehouseManagementView` + tab navigation

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/WarehouseManagementView.tsx`

### Step 1: Sostituisci il file completo

```tsx
import { useState } from "react";
import { WarehouseUpload } from "../components/WarehouseUpload";
import { WarehouseInventoryView } from "../components/WarehouseInventoryView";
import { WarehousePickupList } from "../components/WarehousePickupList";
import { AddItemManuallyModal } from "../components/AddItemManuallyModal";
import { BoxManagementModal } from "../components/BoxManagementModal";
import { clearAllWarehouseData } from "../api/warehouse";
import { toastService } from "../services/toast.service";

type ActiveTab = "magazzino" | "pickup";

export default function WarehouseManagementView() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("magazzino");
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showBoxManagementModal, setShowBoxManagementModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [clearing, setClearing] = useState(false);

  const handleRefresh = () => setRefreshKey((prev) => prev + 1);

  const handleClearWarehouse = async () => {
    const confirmed = window.confirm(
      "⚠️ ATTENZIONE!\n\n" +
        "Questa operazione cancellerà TUTTI i dati del magazzino:\n" +
        "• Tutti gli articoli\n" +
        "• Tutti gli scatoli\n" +
        "• Metadati di caricamento\n\n" +
        "I dati verranno rimossi sia dal browser che dal server.\n\n" +
        "Questa operazione NON può essere annullata.\n\n" +
        "Vuoi procedere?",
    );
    if (!confirmed) return;

    const doubleConfirmed = window.confirm(
      "Sei assolutamente sicuro?\n\n" +
        "Dopo questa operazione dovrai ricaricare il file Excel del magazzino.\n\n" +
        "Clicca OK per confermare la cancellazione definitiva.",
    );
    if (!doubleConfirmed) return;

    setClearing(true);
    try {
      await clearAllWarehouseData();
      toastService.success("🗑️ Magazzino completamente svuotato. Ricarica il file Excel.");
      handleRefresh();
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      toastService.error(
        error instanceof Error ? error.message : "Errore durante cancellazione",
      );
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
        padding: "20px",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Page header */}
        <div style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "1.8rem", color: "#1a1a2e", margin: "0 0 6px 0" }}>
            📦 Gestione Magazzino
          </h1>
          <p style={{ color: "#666", margin: 0, fontSize: "14px" }}>
            Carica e gestisci l'inventario del magazzino.
          </p>
        </div>

        {/* Action buttons card — solo nel tab Magazzino */}
        {activeTab === "magazzino" && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              padding: "14px 16px",
              marginBottom: "16px",
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => setShowAddItemModal(true)}
              style={{
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 600,
                border: "none",
                borderRadius: "6px",
                backgroundColor: "#4caf50",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              ➕ Aggiungi Articolo Manuale
            </button>
            <button
              onClick={() => setShowBoxManagementModal(true)}
              style={{
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 600,
                border: "1px solid #ccc",
                borderRadius: "6px",
                backgroundColor: "#fff",
                color: "#333",
                cursor: "pointer",
              }}
            >
              📦 Gestione Scatoli
            </button>
            <button
              onClick={handleClearWarehouse}
              disabled={clearing}
              style={{
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 600,
                border: "none",
                borderRadius: "6px",
                backgroundColor: clearing ? "#ccc" : "#d32f2f",
                color: "#fff",
                cursor: clearing ? "not-allowed" : "pointer",
                opacity: clearing ? 0.6 : 1,
              }}
            >
              {clearing ? "Cancellazione..." : "🗑️ Pulisci Magazzino"}
            </button>
          </div>
        )}

        {/* Tab navigation */}
        <div style={{ display: "flex", gap: 0, marginBottom: 0 }}>
          {(["magazzino", "pickup"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "11px 22px",
                fontSize: "14px",
                fontWeight: 600,
                border: "none",
                borderRadius: "8px 8px 0 0",
                cursor: "pointer",
                background: activeTab === tab ? "#fff" : "rgba(255,255,255,0.35)",
                color: activeTab === tab ? "#1a1a2e" : "#555",
                boxShadow: activeTab === tab ? "0 -1px 0 #e0e0e0" : undefined,
              }}
            >
              {tab === "magazzino" ? "📦 Magazzino" : "🛒 Articoli da prendere"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "0 8px 8px 8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          {activeTab === "magazzino" ? (
            <>
              <WarehouseUpload />
              <WarehouseInventoryView key={refreshKey} />
            </>
          ) : (
            <WarehousePickupList />
          )}
        </div>
      </div>

      {/* Modals */}
      <AddItemManuallyModal
        isOpen={showAddItemModal}
        onClose={() => setShowAddItemModal(false)}
        onSuccess={handleRefresh}
      />
      <BoxManagementModal
        isOpen={showBoxManagementModal}
        onClose={() => setShowBoxManagementModal(false)}
      />

      <style>{`
        @media (max-width: 768px) {
          h1 { font-size: 1.4rem !important; }
        }
      `}</style>
    </div>
  );
}
```

### Step 2: Type-check e test frontend

```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```

Atteso: 0 errori TypeScript, test esistenti PASS

### Step 3: Commit

```bash
git add archibald-web-app/frontend/src/pages/WarehouseManagementView.tsx
git commit -m "feat(frontend): add tabs and restyling to WarehouseManagementView"
```

---

## Task 7: Verifica finale e deploy

### Step 1: Esegui tutti i test

```bash
npm test --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/frontend
```

Atteso: tutti PASS

### Step 2: Build completo

```bash
npm run build --prefix archibald-web-app/backend
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: 0 errori

### Step 3: Push

```bash
git push origin master
```

Il CI/CD su GitHub Actions farà build + deploy automatico su formicanera.com.

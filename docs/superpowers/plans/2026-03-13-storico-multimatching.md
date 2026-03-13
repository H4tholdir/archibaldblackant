# Storico Multimatching — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere multimatching N:M allo storico ordini, modale matching unificata, animazioni di feedback e colonne prezzi listino.

**Architecture:** Nuove tabelle DB `sub_client_customer_matches` e `sub_client_sub_client_matches` + `sub_client_history_prefs`. Nuovo repository e router backend. `CustomerHistoryModal` aggiornato con array di ID, colonne listino, animazioni. Nuovo `MatchingManagerModal` riutilizzabile. `OrderFormSimple` aggiornato con il nuovo flusso di matching.

**Tech Stack:** PostgreSQL, Express + TypeScript, React 19, Vitest, Supertest, inline styles.

---

## Chunk 1: Backend

### Task 1: Migration 023

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/023-multimatching.sql`

- [ ] **Step 1: Scrivi la migration**

```sql
-- 023-multimatching.sql

-- N:M sottocliente ↔ cliente Archibald (condiviso tra utenti)
CREATE TABLE IF NOT EXISTS shared.sub_client_customer_matches (
  sub_client_codice   TEXT        NOT NULL,
  customer_profile_id TEXT        NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sub_client_codice, customer_profile_id)
);

-- N:M sottocliente ↔ sottocliente (coppia canonica: codice_a < codice_b)
CREATE TABLE IF NOT EXISTS shared.sub_client_sub_client_matches (
  sub_client_codice_a TEXT        NOT NULL,
  sub_client_codice_b TEXT        NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sub_client_codice_a, sub_client_codice_b),
  CHECK (sub_client_codice_a < sub_client_codice_b)
);

-- Preferenza per-utente: salta modale matching
CREATE TABLE IF NOT EXISTS shared.sub_client_history_prefs (
  user_id             INTEGER NOT NULL,
  entity_type         TEXT    NOT NULL CHECK (entity_type IN ('subclient', 'customer')),
  entity_id           TEXT    NOT NULL,
  skip_matching_modal BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, entity_type, entity_id)
);

-- Migrazione dati: copia 1:1 esistenti nella nuova tabella N:M
INSERT INTO shared.sub_client_customer_matches (sub_client_codice, customer_profile_id)
SELECT codice, matched_customer_profile_id
FROM shared.sub_clients
WHERE matched_customer_profile_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Applica la migration su DB locale**

```bash
npm run migrate --prefix archibald-web-app/backend
```
Expected: migration `023-multimatching` eseguita senza errori.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/023-multimatching.sql
git commit -m "feat(db): add multimatching tables and migrate existing 1:1 matches"
```

---

### Task 2: Repository sub-client-matches

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/sub-client-matches.repository.ts`
- Create: `archibald-web-app/backend/src/db/repositories/sub-client-matches.repository.spec.ts`

- [ ] **Step 1: Scrivi il test (failing)**

```typescript
// sub-client-matches.repository.spec.ts
import { describe, it, expect, vi } from 'vitest';
import type { DbPool } from '../pool';

function makePool(rows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as DbPool;
}

const repo = await import('./sub-client-matches.repository');

describe('getMatchesForSubClient', () => {
  it('returns empty arrays and skipModal=false when no rows', async () => {
    const pool = makePool([]);
    const result = await repo.getMatchesForSubClient(pool, 1, 'C00001');
    expect(result).toEqual({ customerProfileIds: [], subClientCodices: [], skipModal: false });
  });

  it('returns customerProfileIds from sub_client_customer_matches', async () => {
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ customer_profile_id: 'P001' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    } as unknown as DbPool;
    const result = await repo.getMatchesForSubClient(pool, 1, 'C00001');
    expect(result.customerProfileIds).toEqual(['P001']);
  });

  it('returns subClientCodices from sub_client_sub_client_matches', async () => {
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })                                    // customerMatches
      .mockResolvedValueOnce({ rows: [{ other_codice: 'C00099' }] })          // subClientMatches
      .mockResolvedValueOnce({ rows: [] })                                    // pref
    } as unknown as DbPool;
    const result = await repo.getMatchesForSubClient(pool, 1, 'C00001');
    expect(result.subClientCodices).toEqual(['C00099']);
  });
});

describe('addCustomerMatch / removeCustomerMatch', () => {
  it('addCustomerMatch calls INSERT with correct params', async () => {
    const pool = makePool();
    await repo.addCustomerMatch(pool, 'C00001', 'P001');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shared.sub_client_customer_matches'),
      ['C00001', 'P001'],
    );
  });

  it('removeCustomerMatch calls DELETE with correct params', async () => {
    const pool = makePool();
    await repo.removeCustomerMatch(pool, 'C00001', 'P001');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM shared.sub_client_customer_matches'),
      ['C00001', 'P001'],
    );
  });
});

describe('addSubClientMatch / removeSubClientMatch — canonical ordering', () => {
  it('addSubClientMatch stores codiceA < codiceB regardless of input order', async () => {
    const pool = makePool();
    await repo.addSubClientMatch(pool, 'C00002', 'C00001');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shared.sub_client_sub_client_matches'),
      ['C00001', 'C00002'],
    );
  });

  it('addSubClientMatch with already-sorted input stores same order', async () => {
    const pool = makePool();
    await repo.addSubClientMatch(pool, 'C00001', 'C00002');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shared.sub_client_sub_client_matches'),
      ['C00001', 'C00002'],
    );
  });

  it('removeSubClientMatch uses canonical order regardless of input', async () => {
    const pool = makePool();
    await repo.removeSubClientMatch(pool, 'C00005', 'C00003');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM shared.sub_client_sub_client_matches'),
      ['C00003', 'C00005'],
    );
  });

  it('removeSubClientMatch with reversed input produces same canonical params', async () => {
    const pool1 = makePool();
    const pool2 = makePool();
    await repo.removeSubClientMatch(pool1, 'C00003', 'C00005');
    await repo.removeSubClientMatch(pool2, 'C00005', 'C00003');
    const call1 = (pool1.query as ReturnType<typeof vi.fn>).mock.calls[0];
    const call2 = (pool2.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call1[1]).toEqual(call2[1]);
  });
});

describe('upsertSkipModal', () => {
  it('calls UPSERT with correct params', async () => {
    const pool = makePool();
    await repo.upsertSkipModal(pool, 7, 'subclient', 'C00001', true);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT'),
      [7, 'subclient', 'C00001', true],
    );
  });

  it('second call with skip=false overrides first call (idempotency)', async () => {
    const calls: unknown[][] = [];
    const pool = { query: vi.fn((...args: unknown[]) => { calls.push(args); return Promise.resolve({ rows: [] }); }) } as unknown as DbPool;
    await repo.upsertSkipModal(pool, 7, 'subclient', 'C00001', true);
    await repo.upsertSkipModal(pool, 7, 'subclient', 'C00001', false);
    expect(calls).toHaveLength(2);
    expect((calls[1] as unknown[][])[1]).toEqual([7, 'subclient', 'C00001', false]);
  });
});
```

- [ ] **Step 2: Verifica fallimento**

```bash
npm test --prefix archibald-web-app/backend -- sub-client-matches.repository
```
Expected: FAIL (modulo non trovato).

- [ ] **Step 3: Implementa il repository**

```typescript
// sub-client-matches.repository.ts
import type { DbPool } from '../pool.js';

type MatchResult = {
  customerProfileIds: string[];
  subClientCodices: string[];
  skipModal: boolean;
};

async function getMatchesForSubClient(pool: DbPool, userId: number, codice: string): Promise<MatchResult> {
  const [custRows, subRows, prefRow] = await Promise.all([
    pool.query<{ customer_profile_id: string }>(
      `SELECT customer_profile_id FROM shared.sub_client_customer_matches WHERE sub_client_codice = $1`,
      [codice],
    ),
    pool.query<{ other_codice: string }>(
      `SELECT
         CASE WHEN sub_client_codice_a = $1 THEN sub_client_codice_b ELSE sub_client_codice_a END AS other_codice
       FROM shared.sub_client_sub_client_matches
       WHERE sub_client_codice_a = $1 OR sub_client_codice_b = $1`,
      [codice],
    ),
    pool.query<{ skip_matching_modal: boolean }>(
      `SELECT skip_matching_modal FROM shared.sub_client_history_prefs
       WHERE user_id = $1 AND entity_type = 'subclient' AND entity_id = $2`,
      [userId, codice],
    ),
  ]);

  return {
    customerProfileIds: custRows.rows.map((r) => r.customer_profile_id),
    subClientCodices: subRows.rows.map((r) => r.other_codice),
    skipModal: prefRow.rows[0]?.skip_matching_modal ?? false,
  };
}

async function getMatchesForCustomer(pool: DbPool, userId: number, customerProfileId: string): Promise<MatchResult> {
  const [subRows, prefRow] = await Promise.all([
    pool.query<{ sub_client_codice: string }>(
      `SELECT sub_client_codice FROM shared.sub_client_customer_matches WHERE customer_profile_id = $1`,
      [customerProfileId],
    ),
    pool.query<{ skip_matching_modal: boolean }>(
      `SELECT skip_matching_modal FROM shared.sub_client_history_prefs
       WHERE user_id = $1 AND entity_type = 'customer' AND entity_id = $2`,
      [userId, customerProfileId],
    ),
  ]);

  return {
    customerProfileIds: [customerProfileId],
    subClientCodices: subRows.rows.map((r) => r.sub_client_codice),
    skipModal: prefRow.rows[0]?.skip_matching_modal ?? false,
  };
}

async function addCustomerMatch(pool: DbPool, codice: string, customerProfileId: string): Promise<void> {
  await pool.query(
    `INSERT INTO shared.sub_client_customer_matches (sub_client_codice, customer_profile_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [codice, customerProfileId],
  );
}

async function removeCustomerMatch(pool: DbPool, codice: string, customerProfileId: string): Promise<void> {
  await pool.query(
    `DELETE FROM shared.sub_client_customer_matches WHERE sub_client_codice = $1 AND customer_profile_id = $2`,
    [codice, customerProfileId],
  );
}

function canonicalize(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function addSubClientMatch(pool: DbPool, codiceA: string, codiceB: string): Promise<void> {
  const [a, b] = canonicalize(codiceA, codiceB);
  await pool.query(
    `INSERT INTO shared.sub_client_sub_client_matches (sub_client_codice_a, sub_client_codice_b)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [a, b],
  );
}

async function removeSubClientMatch(pool: DbPool, codiceA: string, codiceB: string): Promise<void> {
  const [a, b] = canonicalize(codiceA, codiceB);
  await pool.query(
    `DELETE FROM shared.sub_client_sub_client_matches WHERE sub_client_codice_a = $1 AND sub_client_codice_b = $2`,
    [a, b],
  );
}

async function upsertSkipModal(
  pool: DbPool,
  userId: number,
  entityType: 'subclient' | 'customer',
  entityId: string,
  skip: boolean,
): Promise<void> {
  await pool.query(
    `INSERT INTO shared.sub_client_history_prefs (user_id, entity_type, entity_id, skip_matching_modal)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, entity_type, entity_id) DO UPDATE SET skip_matching_modal = EXCLUDED.skip_matching_modal`,
    [userId, entityType, entityId, skip],
  );
}

export {
  getMatchesForSubClient, getMatchesForCustomer,
  addCustomerMatch, removeCustomerMatch,
  addSubClientMatch, removeSubClientMatch,
  upsertSkipModal,
  type MatchResult,
};
```

- [ ] **Step 4: Verifica test passano**

```bash
npm test --prefix archibald-web-app/backend -- sub-client-matches.repository
```
Expected: tutti PASS.

- [ ] **Step 5: Build check**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: zero errori TypeScript.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/sub-client-matches.repository.ts \
        archibald-web-app/backend/src/db/repositories/sub-client-matches.repository.spec.ts
git commit -m "feat(backend): add sub-client-matches repository with N:M CRUD and canonical ordering"
```

---

### Task 3: Aggiorna customer-full-history repository

**Files:**
- Modify: `archibald-web-app/backend/src/types/full-history.ts`
- Modify: `archibald-web-app/backend/src/db/repositories/customer-full-history.repository.ts`

- [ ] **Step 1: Aggiorna `FullHistoryOrder` nel tipo condiviso**

In `archibald-web-app/backend/src/types/full-history.ts` aggiungi i campi opzionali:

```typescript
export type FullHistoryOrder = {
  source: 'orders' | 'fresis';
  orderId: string;
  orderNumber: string;
  orderDate: string;
  totalAmount: number;
  orderDiscountPercent: number;
  customerProfileId?: string;
  customerCity?: string;
  customerRagioneSociale?: string;
  articles: FullHistoryArticle[];
};
```

- [ ] **Step 2: Aggiorna `HistoryParams` e le query nel repository**

Sostituisci il contenuto del file `customer-full-history.repository.ts`.

La nuova `HistoryParams`:
```typescript
type HistoryParams = {
  customerProfileIds?: string[];
  customerName?: string;
  subClientCodices?: string[];
};
```

La nuova `OrderArticleRow` aggiunge campi customer:
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
};
```

`mapOrderArticleRows` aggiorna la creazione dell'ordine:
```typescript
ordersMap.set(row.order_id, {
  source: 'orders',
  orderId: row.order_id,
  orderNumber: row.order_number,
  orderDate: row.order_date,
  totalAmount: 0,
  orderDiscountPercent: 0,
  customerProfileId: row.customer_profile_id ?? undefined,
  customerCity: row.customer_city ?? undefined,
  customerRagioneSociale: row.customer_rag_sociale ?? undefined,
  articles: [],
});
```

La nuova `getCustomerFullHistory`:
```typescript
async function getCustomerFullHistory(
  pool: DbPool,
  userId: string,
  params: HistoryParams,
): Promise<FullHistoryOrder[]> {
  const {
    customerProfileIds = [],
    customerName,
    subClientCodices = [],
  } = params;

  const hasCustomerIds = customerProfileIds.length > 0;
  const hasCustomerName = !!(customerName?.trim());
  const hasSubClients = subClientCodices.length > 0;

  if (!hasCustomerIds && !hasCustomerName && !hasSubClients) return [];

  const hasCustomerSearch = hasCustomerIds || hasCustomerName;

  const [ordersResult, fresisResult] = await Promise.all([
    hasCustomerSearch
      ? pool.query<OrderArticleRow>(
          `SELECT
             o.id AS order_id,
             o.order_number,
             o.creation_date AS order_date,
             c2.customer_profile AS customer_profile_id,
             c2.city AS customer_city,
             c2.name AS customer_rag_sociale,
             a.article_code,
             a.article_description,
             a.quantity,
             a.unit_price,
             a.discount_percent,
             a.vat_percent,
             a.line_total_with_vat
           FROM agents.order_records o
           JOIN agents.order_articles a ON a.order_id = o.id AND a.user_id = o.user_id
           LEFT JOIN agents.customers c2 ON c2.user_id = o.user_id AND c2.internal_id = o.customer_profile_id
           WHERE o.user_id = $1
             AND (
               ($2::text[] != '{}' AND o.customer_profile_id IN (
                 SELECT c.internal_id FROM agents.customers c
                 WHERE c.user_id = $1 AND c.customer_profile = ANY($2::text[]) AND c.internal_id IS NOT NULL
               ))
               OR ($3 != '' AND LOWER(o.customer_name) = LOWER($3))
             )
             AND o.articles_synced_at IS NOT NULL
             AND o.gross_amount NOT LIKE '-%'
             AND NOT EXISTS (
               SELECT 1 FROM agents.order_records cn
               WHERE cn.user_id = o.user_id
                 AND cn.customer_name = o.customer_name
                 AND cn.gross_amount LIKE '-%'
                 AND ABS(
                   CASE WHEN cn.gross_amount ~ '^-?[0-9.,]+ ?€?$'
                     THEN CAST(REPLACE(REPLACE(REPLACE(cn.gross_amount, '.', ''), ',', '.'), ' €', '') AS NUMERIC)
                     ELSE 0 END
                   + CASE WHEN o.gross_amount ~ '^-?[0-9.,]+ ?€?$'
                     THEN CAST(REPLACE(REPLACE(REPLACE(o.gross_amount, '.', ''), ',', '.'), ' €', '') AS NUMERIC)
                     ELSE 0 END
                 ) < 1.0
                 AND cn.creation_date >= o.creation_date
             )
           ORDER BY o.creation_date DESC, a.article_code ASC`,
          [userId, customerProfileIds, customerName ?? ''],
        )
      : Promise.resolve({ rows: [] as OrderArticleRow[] }),

    hasSubClients
      ? pool.query<FresisHistoryRow>(
          `SELECT id, archibald_order_id, archibald_order_number, invoice_number,
              discount_percent, target_total_with_vat, created_at, items
           FROM agents.fresis_history
           WHERE user_id = $1
             AND sub_client_codice = ANY($2::text[])
             AND (archibald_order_number IS NULL OR archibald_order_number NOT LIKE 'KT %')
           ORDER BY created_at DESC`,
          [userId, subClientCodices],
        )
      : Promise.resolve({ rows: [] as FresisHistoryRow[] }),
  ]);

  const orderOrders = mapOrderArticleRows(ordersResult.rows);
  const fresisOrders = mapFresisRows(fresisResult.rows);

  return [...orderOrders, ...fresisOrders].sort(
    (a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime(),
  );
}
```

- [ ] **Step 3: Build check**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: zero errori.

- [ ] **Step 4: Crea i test del repository `customer-full-history`**

Crea `archibald-web-app/backend/src/db/repositories/customer-full-history.repository.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { DbPool } from '../pool';

function makePool(ordersRows: unknown[] = [], fresisRows: unknown[] = []) {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: ordersRows })
      .mockResolvedValueOnce({ rows: fresisRows }),
  } as unknown as DbPool;
}

const { getCustomerFullHistory } = await import('./customer-full-history.repository');

describe('getCustomerFullHistory', () => {
  it('returns [] when all params are empty', async () => {
    const pool = { query: vi.fn() } as unknown as DbPool;
    const result = await getCustomerFullHistory(pool, 'user-1', {});
    expect(result).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns [] for empty subClientCodices array without error', async () => {
    const pool = makePool([], []);
    const result = await getCustomerFullHistory(pool, 'user-1', { subClientCodices: [] });
    expect(result).toEqual([]);
  });

  it('aggregates orders from multiple customerProfileIds', async () => {
    const twoOrderRows = [
      {
        order_id: 'ord-1', order_number: 'FT 100', order_date: '2024-01-01',
        customer_profile_id: 'C001', customer_city: 'Roma', customer_rag_sociale: 'Mario Srl',
        article_code: 'ART001', article_description: 'Desc', quantity: 2,
        unit_price: 10, discount_percent: 0, vat_percent: 22, line_total_with_vat: 24.4,
      },
      {
        order_id: 'ord-2', order_number: 'FT 200', order_date: '2024-01-02',
        customer_profile_id: 'C002', customer_city: 'Milano', customer_rag_sociale: 'Luigi Srl',
        article_code: 'ART002', article_description: 'Desc2', quantity: 1,
        unit_price: 5, discount_percent: 0, vat_percent: 22, line_total_with_vat: 6.1,
      },
    ];
    const pool = makePool(twoOrderRows, []);
    const result = await getCustomerFullHistory(pool, 'user-1', { customerProfileIds: ['C001', 'C002'] });
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.orderId)).toEqual(expect.arrayContaining(['ord-1', 'ord-2']));
  });

  it('populates customerCity from JOIN result', async () => {
    const rows = [{
      order_id: 'ord-1', order_number: 'FT 100', order_date: '2024-01-01',
      customer_profile_id: 'C001', customer_city: 'Napoli', customer_rag_sociale: 'Test Srl',
      article_code: 'ART001', article_description: 'Test', quantity: 1,
      unit_price: 10, discount_percent: 0, vat_percent: 22, line_total_with_vat: 12.2,
    }];
    const pool = makePool(rows, []);
    const result = await getCustomerFullHistory(pool, 'user-1', { customerProfileIds: ['C001'] });
    expect(result[0].customerCity).toBe('Napoli');
    expect(result[0].customerRagioneSociale).toBe('Test Srl');
  });
});
```

- [ ] **Step 5: Verifica test passano**

```bash
npm test --prefix archibald-web-app/backend -- customer-full-history.repository
```
Expected: tutti PASS.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/types/full-history.ts \
        archibald-web-app/backend/src/db/repositories/customer-full-history.repository.ts \
        archibald-web-app/backend/src/db/repositories/customer-full-history.repository.spec.ts
git commit -m "feat(backend): update customer-full-history repository for N:M multi-ID queries"
```

---

### Task 4: Router sub-client-matches

**Files:**
- Create: `archibald-web-app/backend/src/routes/sub-client-matches.ts`
- Create: `archibald-web-app/backend/src/routes/sub-client-matches.spec.ts`

- [ ] **Step 1: Scrivi il test**

```typescript
// sub-client-matches.spec.ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSubClientMatchesRouter } from './sub-client-matches';
import type { SubClientMatchesRouterDeps } from './sub-client-matches';

const MOCK_RESULT = { customerProfileIds: ['P001'], subClientCodices: [], skipModal: false };

function buildApp(overrides: Partial<SubClientMatchesRouterDeps> = {}) {
  const deps: SubClientMatchesRouterDeps = {
    getMatchesForSubClient: vi.fn().mockResolvedValue(MOCK_RESULT),
    getMatchesForCustomer: vi.fn().mockResolvedValue(MOCK_RESULT),
    addCustomerMatch: vi.fn().mockResolvedValue(undefined),
    removeCustomerMatch: vi.fn().mockResolvedValue(undefined),
    addSubClientMatch: vi.fn().mockResolvedValue(undefined),
    removeSubClientMatch: vi.fn().mockResolvedValue(undefined),
    upsertSkipModal: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).user = { userId: 'user-1' };
    next();
  });
  app.use('/api/sub-client-matches', createSubClientMatchesRouter(deps));
  return { app, deps };
}

describe('GET /api/sub-client-matches', () => {
  it('returns 400 without codice param', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/sub-client-matches');
    expect(res.status).toBe(400);
  });

  it('returns match result for subclient', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/sub-client-matches').query({ codice: 'C00001' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(MOCK_RESULT);
  });
});

describe('POST /api/sub-client-matches/customer', () => {
  it('calls addCustomerMatch and returns 200', async () => {
    const { app, deps } = buildApp();
    const res = await request(app)
      .post('/api/sub-client-matches/customer')
      .send({ codice: 'C00001', customerProfileId: 'P001' });
    expect(res.status).toBe(200);
    expect(deps.addCustomerMatch).toHaveBeenCalledWith('C00001', 'P001');
  });
});

describe('DELETE /api/sub-client-matches/subclient', () => {
  it('calls removeSubClientMatch with params as-received (canonical ordering is repo responsibility)', async () => {
    const { app, deps } = buildApp();
    const res = await request(app)
      .delete('/api/sub-client-matches/subclient')
      .query({ codiceA: 'C00002', codiceB: 'C00001' });
    expect(res.status).toBe(200);
    expect(deps.removeSubClientMatch).toHaveBeenCalledWith('C00002', 'C00001');
  });

  it('returns 400 without both codice params', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .delete('/api/sub-client-matches/subclient')
      .query({ codiceA: 'C00001' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/sub-client-matches/skip-modal', () => {
  it('calls upsertSkipModal with userId from session', async () => {
    const { app, deps } = buildApp();
    const res = await request(app)
      .patch('/api/sub-client-matches/skip-modal')
      .send({ entityType: 'subclient', entityId: 'C00001', skip: true });
    expect(res.status).toBe(200);
    expect(deps.upsertSkipModal).toHaveBeenCalledWith('user-1', 'subclient', 'C00001', true);
  });
});
```

- [ ] **Step 2: Verifica fallimento**

```bash
npm test --prefix archibald-web-app/backend -- sub-client-matches.spec
```
Expected: FAIL (modulo non trovato).

- [ ] **Step 3: Implementa il router**

```typescript
// sub-client-matches.ts
import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import { logger } from '../logger';
import type { MatchResult } from '../db/repositories/sub-client-matches.repository';

type SubClientMatchesRouterDeps = {
  getMatchesForSubClient: (userId: string, codice: string) => Promise<MatchResult>;
  getMatchesForCustomer: (userId: string, profileId: string) => Promise<MatchResult>;
  addCustomerMatch: (codice: string, customerProfileId: string) => Promise<void>;
  removeCustomerMatch: (codice: string, customerProfileId: string) => Promise<void>;
  addSubClientMatch: (codiceA: string, codiceB: string) => Promise<void>;
  removeSubClientMatch: (codiceA: string, codiceB: string) => Promise<void>;
  upsertSkipModal: (userId: string, entityType: 'subclient' | 'customer', entityId: string, skip: boolean) => Promise<void>;
};

const customerMatchBody = z.object({
  codice: z.string().min(1),
  customerProfileId: z.string().min(1),
});

const subClientMatchBody = z.object({
  codiceA: z.string().min(1),
  codiceB: z.string().min(1),
});

const skipModalBody = z.object({
  entityType: z.enum(['subclient', 'customer']),
  entityId: z.string().min(1),
  skip: z.boolean(),
});

function createSubClientMatchesRouter(deps: SubClientMatchesRouterDeps) {
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    const { codice } = req.query as Record<string, string | undefined>;
    if (!codice) {
      res.status(400).json({ error: 'codice richiesto' });
      return;
    }
    try {
      const result = await deps.getMatchesForSubClient(req.user!.userId, codice);
      res.json(result);
    } catch (err) {
      logger.error('Error getting matches for subclient', { error: err });
      res.status(500).json({ error: 'Errore recupero match' });
    }
  });

  router.get('/by-customer', async (req: AuthRequest, res) => {
    const { profileId } = req.query as Record<string, string | undefined>;
    if (!profileId) {
      res.status(400).json({ error: 'profileId richiesto' });
      return;
    }
    try {
      const result = await deps.getMatchesForCustomer(req.user!.userId, profileId);
      res.json(result);
    } catch (err) {
      logger.error('Error getting matches for customer', { error: err });
      res.status(500).json({ error: 'Errore recupero match' });
    }
  });

  router.post('/customer', async (req: AuthRequest, res) => {
    const parsed = customerMatchBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    try {
      await deps.addCustomerMatch(parsed.data.codice, parsed.data.customerProfileId);
      res.json({ success: true });
    } catch (err) {
      logger.error('Error adding customer match', { error: err });
      res.status(500).json({ error: 'Errore aggiunta match' });
    }
  });

  router.delete('/customer', async (req: AuthRequest, res) => {
    const { codice, customerProfileId } = req.query as Record<string, string | undefined>;
    if (!codice || !customerProfileId) { res.status(400).json({ error: 'codice e customerProfileId richiesti' }); return; }
    try {
      await deps.removeCustomerMatch(codice, customerProfileId);
      res.json({ success: true });
    } catch (err) {
      logger.error('Error removing customer match', { error: err });
      res.status(500).json({ error: 'Errore rimozione match' });
    }
  });

  router.post('/subclient', async (req: AuthRequest, res) => {
    const parsed = subClientMatchBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    try {
      await deps.addSubClientMatch(parsed.data.codiceA, parsed.data.codiceB);
      res.json({ success: true });
    } catch (err) {
      logger.error('Error adding subclient match', { error: err });
      res.status(500).json({ error: 'Errore aggiunta match' });
    }
  });

  router.delete('/subclient', async (req: AuthRequest, res) => {
    const { codiceA, codiceB } = req.query as Record<string, string | undefined>;
    if (!codiceA || !codiceB) { res.status(400).json({ error: 'codiceA e codiceB richiesti' }); return; }
    try {
      await deps.removeSubClientMatch(codiceA, codiceB);
      res.json({ success: true });
    } catch (err) {
      logger.error('Error removing subclient match', { error: err });
      res.status(500).json({ error: 'Errore rimozione match' });
    }
  });

  router.patch('/skip-modal', async (req: AuthRequest, res) => {
    const parsed = skipModalBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    try {
      await deps.upsertSkipModal(req.user!.userId, parsed.data.entityType, parsed.data.entityId, parsed.data.skip);
      res.json({ success: true });
    } catch (err) {
      logger.error('Error upserting skip modal pref', { error: err });
      res.status(500).json({ error: 'Errore salvataggio preferenza' });
    }
  });

  return router;
}

export { createSubClientMatchesRouter, type SubClientMatchesRouterDeps };
```

- [ ] **Step 4: Verifica test passano**

```bash
npm test --prefix archibald-web-app/backend -- sub-client-matches.spec
```
Expected: tutti PASS.

- [ ] **Step 5: Build check**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/routes/sub-client-matches.ts \
        archibald-web-app/backend/src/routes/sub-client-matches.spec.ts
git commit -m "feat(backend): add sub-client-matches router with CRUD and skip-modal endpoints"
```

---

### Task 5: Aggiorna router customer-full-history + monta nuovo router in server.ts

**Files:**
- Modify: `archibald-web-app/backend/src/routes/customer-full-history.ts`
- Modify: `archibald-web-app/backend/src/routes/customer-full-history.spec.ts`
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Aggiorna il router per accettare array**

Sostituisci il contenuto di `customer-full-history.ts`:

```typescript
import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { FullHistoryOrder } from '../types/full-history';
import { logger } from '../logger';

type CustomerFullHistoryRouterDeps = {
  getCustomerFullHistory: (
    userId: string,
    params: {
      customerProfileIds?: string[];
      customerName?: string;
      subClientCodices?: string[];
    },
  ) => Promise<FullHistoryOrder[]>;
};

function createCustomerFullHistoryRouter(deps: CustomerFullHistoryRouterDeps) {
  const router = Router();

  router.get('/customer-full-history', async (req: AuthRequest, res) => {
    const query = req.query as Record<string, string | string[] | undefined>;

    // Express parses repeated params as arrays: ?customerProfileIds[]=X&customerProfileIds[]=Y
    const customerProfileIds = normalizeArray(query['customerProfileIds[]'] ?? query['customerProfileIds']);
    const subClientCodices = normalizeArray(query['subClientCodices[]'] ?? query['subClientCodices']);
    const customerName = typeof query['customerName'] === 'string' ? query['customerName'] : undefined;

    if (customerProfileIds.length === 0 && !customerName && subClientCodices.length === 0) {
      res.status(400).json({ error: 'Almeno uno tra customerProfileIds, customerName e subClientCodices è richiesto' });
      return;
    }

    try {
      const userId = req.user!.userId;
      const orders = await deps.getCustomerFullHistory(userId, { customerProfileIds, customerName, subClientCodices });
      res.json({ orders });
    } catch (err) {
      logger.error('Error fetching customer full history', { error: err instanceof Error ? err.message : err });
      res.status(500).json({ error: 'Errore nel recupero dello storico' });
    }
  });

  return router;
}

function normalizeArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val.filter(Boolean) : [val];
}

export { createCustomerFullHistoryRouter, type CustomerFullHistoryRouterDeps };
```

- [ ] **Step 2: Aggiorna i test del router**

Sostituisci il contenuto di `customer-full-history.spec.ts`:

```typescript
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
    orderDiscountPercent: 0,
    articles: [],
  },
];

function buildApp(getHistory = vi.fn().mockResolvedValue(MOCK_ORDERS)) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).user = { userId: 'user-1' };
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

  it('returns orders for single customerProfileIds[]', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get('/api/history/customer-full-history')
      .query({ 'customerProfileIds[]': 'C10181' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ orders: MOCK_ORDERS });
  });

  it('passes customerProfileIds array to handler', async () => {
    const { app, getHistory } = buildApp();
    await request(app)
      .get('/api/history/customer-full-history')
      .query({ 'customerProfileIds[]': ['C10181', 'C10182'] });
    expect(getHistory).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ customerProfileIds: ['C10181', 'C10182'] }),
    );
  });

  it('returns 400 when only empty arrays provided', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/history/customer-full-history');
    expect(res.status).toBe(400);
  });

  it('returns 500 on error', async () => {
    const { app } = buildApp(vi.fn().mockRejectedValue(new Error('DB error')));
    const res = await request(app)
      .get('/api/history/customer-full-history')
      .query({ 'customerProfileIds[]': 'C10181' });
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 3: Verifica test passano**

```bash
npm test --prefix archibald-web-app/backend -- customer-full-history
```
Expected: tutti PASS.

- [ ] **Step 4: Monta il nuovo router in `server.ts`**

In `server.ts`, aggiungi dopo gli import esistenti:
```typescript
import { createSubClientMatchesRouter } from './routes/sub-client-matches';
import * as subClientMatchesRepo from './db/repositories/sub-client-matches.repository';
```

Aggiungi dopo la riga `app.use('/api/history', ...)` (riga ~840):
```typescript
  app.use('/api/sub-client-matches', authenticateJWT, createSubClientMatchesRouter({
    getMatchesForSubClient: (userId, codice) => subClientMatchesRepo.getMatchesForSubClient(pool, parseInt(userId, 10), codice),
    getMatchesForCustomer: (userId, profileId) => subClientMatchesRepo.getMatchesForCustomer(pool, parseInt(userId, 10), profileId),
    addCustomerMatch: (codice, customerProfileId) => subClientMatchesRepo.addCustomerMatch(pool, codice, customerProfileId),
    removeCustomerMatch: (codice, customerProfileId) => subClientMatchesRepo.removeCustomerMatch(pool, codice, customerProfileId),
    addSubClientMatch: (codiceA, codiceB) => subClientMatchesRepo.addSubClientMatch(pool, codiceA, codiceB),
    removeSubClientMatch: (codiceA, codiceB) => subClientMatchesRepo.removeSubClientMatch(pool, codiceA, codiceB),
    upsertSkipModal: (userId, entityType, entityId, skip) => subClientMatchesRepo.upsertSkipModal(pool, parseInt(userId, 10), entityType, entityId, skip),
  }));
```

Nota: `userId` in `server.ts` è stringa (da JWT). Il repository prende `number`. Usare `parseInt(userId, 10)` nel wrapper — coerente con il pattern esistente per le tabelle `shared.*` che usano `user_id INTEGER`.

- [ ] **Step 5: Build finale backend**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: zero errori.

- [ ] **Step 6: Tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend
```
Expected: tutti PASS, nessuna regressione.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/routes/customer-full-history.ts \
        archibald-web-app/backend/src/routes/customer-full-history.spec.ts \
        archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): update customer-full-history router for array params; mount sub-client-matches router"
```

---

## Chunk 2: Frontend

### Task 6: Servizio frontend sub-client-matches

**Files:**
- Create: `archibald-web-app/frontend/src/services/sub-client-matches.service.ts`

- [ ] **Step 1: Crea il servizio**

```typescript
// sub-client-matches.service.ts
import { fetchWithRetry } from '../utils/fetch-with-retry';

type MatchResult = {
  customerProfileIds: string[];
  subClientCodices: string[];
  skipModal: boolean;
};

async function getMatchesForSubClient(codice: string): Promise<MatchResult> {
  const res = await fetchWithRetry(`/api/sub-client-matches?codice=${encodeURIComponent(codice)}`);
  if (!res.ok) throw new Error(`Errore match: ${res.status}`);
  return res.json() as Promise<MatchResult>;
}

async function getMatchesForCustomer(profileId: string): Promise<MatchResult> {
  const res = await fetchWithRetry(`/api/sub-client-matches/by-customer?profileId=${encodeURIComponent(profileId)}`);
  if (!res.ok) throw new Error(`Errore match: ${res.status}`);
  return res.json() as Promise<MatchResult>;
}

async function addCustomerMatch(codice: string, customerProfileId: string): Promise<void> {
  const res = await fetchWithRetry('/api/sub-client-matches/customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codice, customerProfileId }),
  });
  if (!res.ok) throw new Error(`Errore aggiunta match: ${res.status}`);
}

async function removeCustomerMatch(codice: string, customerProfileId: string): Promise<void> {
  const res = await fetchWithRetry(
    `/api/sub-client-matches/customer?codice=${encodeURIComponent(codice)}&customerProfileId=${encodeURIComponent(customerProfileId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Errore rimozione match: ${res.status}`);
}

async function addSubClientMatch(codiceA: string, codiceB: string): Promise<void> {
  const res = await fetchWithRetry('/api/sub-client-matches/subclient', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codiceA, codiceB }),
  });
  if (!res.ok) throw new Error(`Errore aggiunta match: ${res.status}`);
}

async function removeSubClientMatch(codiceA: string, codiceB: string): Promise<void> {
  const res = await fetchWithRetry(
    `/api/sub-client-matches/subclient?codiceA=${encodeURIComponent(codiceA)}&codiceB=${encodeURIComponent(codiceB)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Errore rimozione match: ${res.status}`);
}

async function upsertSkipModal(
  entityType: 'subclient' | 'customer',
  entityId: string,
  skip: boolean,
): Promise<void> {
  const res = await fetchWithRetry('/api/sub-client-matches/skip-modal', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, entityId, skip }),
  });
  if (!res.ok) throw new Error(`Errore salvataggio preferenza: ${res.status}`);
}

export {
  getMatchesForSubClient, getMatchesForCustomer,
  addCustomerMatch, removeCustomerMatch,
  addSubClientMatch, removeSubClientMatch,
  upsertSkipModal,
  type MatchResult,
};
```

- [ ] **Step 2: Aggiorna il frontend API `customer-full-history.ts`**

Sostituisci il contenuto di `archibald-web-app/frontend/src/api/customer-full-history.ts`:

```typescript
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
  orderDiscountPercent: number;
  customerProfileId?: string;
  customerCity?: string;
  customerRagioneSociale?: string;
  articles: CustomerFullHistoryArticle[];
};

export async function getCustomerFullHistory(params: {
  customerProfileIds?: string[];
  customerName?: string;
  subClientCodices?: string[];
}): Promise<CustomerFullHistoryOrder[]> {
  const query = new URLSearchParams();
  if (params.customerName) query.set('customerName', params.customerName);
  for (const id of params.customerProfileIds ?? []) {
    query.append('customerProfileIds[]', id);
  }
  for (const c of params.subClientCodices ?? []) {
    query.append('subClientCodices[]', c);
  }

  const res = await fetchWithRetry(`/api/history/customer-full-history?${query.toString()}`);
  if (!res.ok) throw new Error(`Errore storico: ${res.status}`);
  const data = await res.json() as { orders: CustomerFullHistoryOrder[] };
  return data.orders;
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: zero errori.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/services/sub-client-matches.service.ts \
        archibald-web-app/frontend/src/api/customer-full-history.ts
git commit -m "feat(frontend): add sub-client-matches service; update customer-full-history API for arrays"
```

---

### Task 7: MatchingManagerModal

**Files:**
- Create: `archibald-web-app/frontend/src/components/MatchingManagerModal.tsx`

- [ ] **Step 1: Crea il componente**

Il componente gestisce il matching N:M. All'apertura carica i match esistenti, accumula le modifiche in stato locale e le persiste solo al "Conferma".

```typescript
// MatchingManagerModal.tsx
import { useState, useEffect, useCallback } from 'react';
import { getMatchesForSubClient, getMatchesForCustomer, addCustomerMatch, removeCustomerMatch, addSubClientMatch, removeSubClientMatch, upsertSkipModal } from '../services/sub-client-matches.service';
import { getSubclients } from '../services/subclients.service';
import { customerService } from '../services/customers.service';
import type { Customer } from '../types/local-customer';
import type { Subclient } from '../services/subclients.service';

type Props =
  | {
      mode: 'subclient';
      subClientCodice: string;
      entityName: string;
      onConfirm: (ids: { customerProfileIds: string[]; subClientCodices: string[] }) => void;
      onSkip: () => void;
      onClose: () => void;
    }
  | {
      mode: 'customer';
      customerProfileId: string;
      entityName: string;
      onConfirm: (ids: { customerProfileIds: string[]; subClientCodices: string[] }) => void;
      onSkip: () => void;
      onClose: () => void;
    };

type MatchState = {
  customerProfileIds: string[];
  subClientCodices: string[];
};

export function MatchingManagerModal(props: Props) {
  const { mode, entityName, onConfirm, onSkip, onClose } = props;

  const [initialMatch, setInitialMatch] = useState<MatchState>({ customerProfileIds: [], subClientCodices: [] });
  const [currentMatch, setCurrentMatch] = useState<MatchState>({ customerProfileIds: [], subClientCodices: [] });
  const [skipModal, setSkipModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [customerQuery, setCustomerQuery] = useState('');
  const [subclientQuery, setSubclientQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [subclientResults, setSubclientResults] = useState<Subclient[]>([]);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showSubclientSearch, setShowSubclientSearch] = useState(false);
  // Names of already-matched customer IDs, resolved at load time for chip labels
  const [resolvedCustomerNames, setResolvedCustomerNames] = useState<Map<string, string>>(new Map());

  const entityId = mode === 'subclient' ? props.subClientCodice : props.customerProfileId;

  useEffect(() => {
    const load = async () => {
      try {
        const result = mode === 'subclient'
          ? await getMatchesForSubClient(entityId)
          : await getMatchesForCustomer(entityId);
        const state = { customerProfileIds: result.customerProfileIds, subClientCodices: result.subClientCodices };
        setInitialMatch(state);
        setCurrentMatch(state);
        setSkipModal(result.skipModal);

        // Resolve names for already-matched customer IDs so chips show "ID · name"
        if (state.customerProfileIds.length > 0) {
          const nameMap = new Map<string, string>();
          await Promise.all(
            state.customerProfileIds.map(async (id) => {
              try {
                const results = await customerService.searchCustomers(id);
                const match = results.find((c) => c.id === id);
                if (match) nameMap.set(id, match.name);
              } catch { /* non critico: chip mostra solo ID */ }
            })
          );
          setResolvedCustomerNames(nameMap);
        }
      } catch {
        setError('Errore nel caricamento dei match');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [mode, entityId]);

  useEffect(() => {
    if (!customerQuery.trim()) { setCustomerResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await customerService.searchCustomers(customerQuery);
        setCustomerResults(res.slice(0, 8));
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  useEffect(() => {
    if (!subclientQuery.trim()) { setSubclientResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const all = await getSubclients(subclientQuery);
        setSubclientResults(all.slice(0, 8));
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [subclientQuery]);

  const addCustomer = useCallback((profileId: string) => {
    if (currentMatch.customerProfileIds.includes(profileId)) return;
    setCurrentMatch((prev) => ({ ...prev, customerProfileIds: [...prev.customerProfileIds, profileId] }));
    setCustomerQuery('');
    setShowCustomerSearch(false);
  }, [currentMatch.customerProfileIds]);

  const removeCustomer = useCallback((profileId: string) => {
    setCurrentMatch((prev) => ({ ...prev, customerProfileIds: prev.customerProfileIds.filter((id) => id !== profileId) }));
  }, []);

  const addSubclient = useCallback((codice: string) => {
    if (currentMatch.subClientCodices.includes(codice)) return;
    setCurrentMatch((prev) => ({ ...prev, subClientCodices: [...prev.subClientCodices, codice] }));
    setSubclientQuery('');
    setShowSubclientSearch(false);
  }, [currentMatch.subClientCodices]);

  const removeSubclient = useCallback((codice: string) => {
    setCurrentMatch((prev) => ({ ...prev, subClientCodices: prev.subClientCodices.filter((c) => c !== codice) }));
  }, []);

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const addedCustomers = currentMatch.customerProfileIds.filter((id) => !initialMatch.customerProfileIds.includes(id));
      const removedCustomers = initialMatch.customerProfileIds.filter((id) => !currentMatch.customerProfileIds.includes(id));
      const addedSubs = currentMatch.subClientCodices.filter((c) => !initialMatch.subClientCodices.includes(c));
      const removedSubs = initialMatch.subClientCodices.filter((c) => !currentMatch.subClientCodices.includes(c));

      const ops: Promise<void>[] = [];

      if (mode === 'subclient') {
        const codice = (props as { mode: 'subclient'; subClientCodice: string }).subClientCodice;
        for (const id of addedCustomers) ops.push(addCustomerMatch(codice, id));
        for (const id of removedCustomers) ops.push(removeCustomerMatch(codice, id));
        for (const c of addedSubs) ops.push(addSubClientMatch(codice, c));
        for (const c of removedSubs) ops.push(removeSubClientMatch(codice, c));
      } else {
        const profileId = (props as { mode: 'customer'; customerProfileId: string }).customerProfileId;
        for (const c of addedSubs) ops.push(addCustomerMatch(c, profileId));
        for (const c of removedSubs) ops.push(removeCustomerMatch(c, profileId));
        // mode=customer non gestisce subclient-subclient match
      }

      if (skipModal) ops.push(upsertSkipModal(mode, entityId, true));

      await Promise.all(ops);
      onConfirm({ customerProfileIds: currentMatch.customerProfileIds, subClientCodices: currentMatch.subClientCodices });
    } catch {
      setError('Errore nel salvataggio dei match. Riprova.');
      setSaving(false);
    }
  }, [currentMatch, initialMatch, mode, entityId, skipModal, onConfirm, props]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ background: '#1e293b', color: 'white', padding: '14px 18px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Collega a storico</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{entityName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 30, height: 30, borderRadius: 6, cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Caricamento...</div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Clienti Archibald — solo per mode='subclient' (un sottocliente → N clienti Archibald).
                Per mode='customer' la relazione inversa è gestita tramite subClientCodices. */}
            {mode === 'subclient' && (
              <Section
                title="Clienti Archibald collegati"
                chips={currentMatch.customerProfileIds.map((id) => {
                  const fromSearch = customerResults.find((c) => c.id === id);
                  const name = fromSearch?.name ?? resolvedCustomerNames.get(id);
                  return { id, label: name ? `${id} · ${name}` : id };
                })}
                onRemoveChip={removeCustomer}
                searchValue={customerQuery}
                onSearchChange={setCustomerQuery}
                showSearch={showCustomerSearch}
                onToggleSearch={() => setShowCustomerSearch((v) => !v)}
                searchPlaceholder="Cerca cliente Archibald..."
                searchResults={customerResults.map((c) => ({ id: c.id, label: `${c.id} · ${c.name}` }))}
                onSelectResult={(id) => addCustomer(id)}
              />
            )}

            {/* Sottoclienti Fresis — per entrambi i mode */}
            <Section
              title="Sottoclienti Fresis collegati"
              chips={currentMatch.subClientCodices.map((c) => {
                const match = subclientResults.find((s) => s.codice === c);
                return { id: c, label: match ? `${c} · ${match.ragioneSociale}` : c };
              })}
              onRemoveChip={removeSubclient}
              searchValue={subclientQuery}
              onSearchChange={setSubclientQuery}
              showSearch={showSubclientSearch}
              onToggleSearch={() => setShowSubclientSearch((v) => !v)}
              searchPlaceholder="Cerca sottocliente..."
              searchResults={subclientResults.map((s) => ({ id: s.codice, label: `${s.codice} · ${s.ragioneSociale}` }))}
              onSelectResult={(id) => addSubclient(id)}
            />
          </div>
        )}

        {error && <div style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', fontSize: 12 }}>{error}</div>}

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={skipModal}
              onChange={(e) => setSkipModal(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Non mostrare più per questo cliente
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onSkip}
              style={{ flex: 1, background: '#f1f5f9', color: '#475569', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              Salta — apri storico senza salvare
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || loading}
              style={{
                flex: 2, background: saving ? '#86efac' : '#059669', color: 'white', border: 'none',
                padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Salvataggio...' : '✓ Conferma e apri storico'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type SearchResult = { id: string; label: string };

function Section(props: {
  title: string;
  chips: SearchResult[];
  onRemoveChip: (id: string) => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  showSearch: boolean;
  onToggleSearch: () => void;
  searchPlaceholder: string;
  searchResults: SearchResult[];
  onSelectResult: (id: string) => void;
}) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{props.title}</span>
        <button onClick={props.onToggleSearch} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {props.showSearch ? '✕ Chiudi' : '+ Aggiungi'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 28 }}>
        {props.chips.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>Nessuno</span>}
        {props.chips.map((chip) => (
          <span key={chip.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e0e7ff', color: '#3730a3', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
            {chip.label}
            <button onClick={() => props.onRemoveChip(chip.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 12, lineHeight: 1, padding: 0 }}>✕</button>
          </span>
        ))}
      </div>
      {props.showSearch && (
        <div style={{ marginTop: 8, position: 'relative' }}>
          <input
            type="text"
            autoFocus
            placeholder={props.searchPlaceholder}
            value={props.searchValue}
            onChange={(e) => props.onSearchChange(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12 }}
          />
          {props.searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 180, overflowY: 'auto' }}>
              {props.searchResults.map((r) => (
                <button key={r.id} onClick={() => props.onSelectResult(r.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: 'white', cursor: 'pointer', fontSize: 12 }}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: zero errori.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/MatchingManagerModal.tsx
git commit -m "feat(frontend): add MatchingManagerModal for N:M matching with chips, search, skip-modal"
```

---

### Task 8: OrderItemsList — prop newItemIds

**Files:**
- Modify: `archibald-web-app/frontend/src/components/new-order-form/OrderItemsList.tsx`

- [ ] **Step 1: Scrivi il test**

Crea/aggiorna `archibald-web-app/frontend/src/components/new-order-form/OrderItemsList.spec.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderItemsList } from './OrderItemsList';
import type { OrderItem } from '../../types/order';

const BASE_ITEM: OrderItem = {
  id: 'item-1',
  productId: 'P001',
  article: 'P001',
  productName: 'Test',
  description: '',
  variantId: '',
  quantity: 1,
  packageContent: '',
  unitPrice: 10,
  subtotal: 10,
  discount: 0,
  subtotalAfterDiscount: 10,
  vat: 2.2,
  total: 12.2,
};

describe('OrderItemsList', () => {
  it('renders without newItemIds prop', () => {
    render(<OrderItemsList items={[BASE_ITEM]} onEditItem={() => {}} onDeleteItem={() => {}} />);
    expect(screen.getByText('Test')).toBeTruthy();
  });

  it('applies slide-in animation class to items in newItemIds', () => {
    const { container } = render(
      <OrderItemsList
        items={[BASE_ITEM]}
        onEditItem={() => {}}
        onDeleteItem={() => {}}
        newItemIds={new Set(['item-1'])}
      />,
    );
    const newRow = container.querySelector('[data-new-item="true"]');
    expect(newRow).not.toBeNull();
  });

  it('does not mark items not in newItemIds', () => {
    const { container } = render(
      <OrderItemsList
        items={[BASE_ITEM]}
        onEditItem={() => {}}
        onDeleteItem={() => {}}
        newItemIds={new Set(['item-99'])}
      />,
    );
    const newRow = container.querySelector('[data-new-item="true"]');
    expect(newRow).toBeNull();
  });
});
```

- [ ] **Step 2: Verifica fallimento**

```bash
npm test --prefix archibald-web-app/frontend -- OrderItemsList
```
Expected: FAIL (prop `newItemIds` non esiste).

- [ ] **Step 3: Aggiungi prop `newItemIds` a `OrderItemsList`**

In `OrderItemsList.tsx`, modifica:
```typescript
interface OrderItemsListProps {
  items: OrderItem[];
  onEditItem: (itemId: string, updates: Partial<OrderItem>) => void;
  onDeleteItem: (itemId: string) => void;
  newItemIds?: Set<string>;  // NUOVO
}
```

Aggiorna la firma del componente per accettare il nuovo prop. Per ogni riga dell'item nella render, aggiungi `data-new-item` e styling condizionale:

```typescript
// All'interno della map delle righe item, dove viene renderizzata la riga:
const isNew = newItemIds?.has(item.id) ?? false;

// Sulla riga/container:
style={{
  // stili esistenti...
  background: isNew ? '#f0fdf4' : /* colore esistente */,
  borderLeft: isNew ? '3px solid #059669' : /* border esistente */,
  transition: 'background 2s ease, border-left 2s ease',
}}
data-new-item={isNew ? 'true' : undefined}
```

- [ ] **Step 4: Verifica test passano**

```bash
npm test --prefix archibald-web-app/frontend -- OrderItemsList
```
Expected: tutti PASS.

- [ ] **Step 5: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/new-order-form/OrderItemsList.tsx \
        archibald-web-app/frontend/src/components/new-order-form/OrderItemsList.spec.tsx
git commit -m "feat(frontend): add newItemIds prop to OrderItemsList for slide-in animation"
```

---

### Task 9: CustomerHistoryModal — aggiornamento completo

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx`

Questo è il task più esteso. Introduce: array props, colonne listino, animazioni, counter header.

- [ ] **Step 1: Aggiorna Props**

```typescript
type Props = {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  customerProfileIds: string[];    // era: customerProfileId: string | null
  subClientCodices: string[];      // era: subClientCodice: string | null
  isFresisClient: boolean;
  currentOrderItems: PendingOrderItem[];
  onAddArticle: (item: PendingOrderItem, replace: boolean) => void;
  onAddOrder: (items: PendingOrderItem[], replace: boolean) => void;
};
```

- [ ] **Step 2: Aggiorna `useEffect` per usare i nuovi prop**

```typescript
useEffect(() => {
  if (!isOpen) return;
  setLoading(true);
  setError(null);
  getCustomerFullHistory({
    customerProfileIds: customerProfileIds.length > 0 ? customerProfileIds : undefined,
    customerName: customerName || undefined,
    subClientCodices: subClientCodices.length > 0 ? subClientCodices : undefined,
  })
    .then(setOrders)
    .catch(() => setError('Errore nel caricamento dello storico'))
    .finally(() => setLoading(false));
}, [isOpen, customerProfileIds, customerName, subClientCodices]);
// NOTA: customerProfileIds e subClientCodices sono array — React compara per referenza.
// Se il chiamante non memoizza gli array, questo useEffect si rieseguirà ad ogni render.
// Soluzione consigliata: usa JSON.stringify come dep, oppure assicurati che il chiamante
// memoizzi gli array con useMemo prima di passarli a CustomerHistoryModal.
```

- [ ] **Step 3: Aggiungi stato per listino prices e animazioni**

```typescript
// Listino prices: Map<articleCode, { price: number; vat: number } | null>
const [listinoPrices, setListinoPrices] = useState<Map<string, { price: number; vat: number } | null>>(new Map());
// Contatore articoli aggiunti
const [addedCount, setAddedCount] = useState(0);
// Badge counter per riga: Map<articleCode, count>
const [articleBadges, setArticleBadges] = useState<Map<string, number>>(new Map());
// Flash rows
const [flashingArticles, setFlashingArticles] = useState<Set<string>>(new Set());
// Copy order overlay
const [copyingOrderId, setCopyingOrderId] = useState<string | null>(null);
const [copiedOrderIds, setCopiedOrderIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 4: Carica i prezzi listino all'apertura**

```typescript
useEffect(() => {
  if (!isOpen || orders.length === 0) return;
  const codes = Array.from(new Set(orders.flatMap((o) => o.articles.map((a) => a.articleCode))));
  const priceMap = new Map<string, { price: number; vat: number } | null>();
  Promise.all(
    codes.map(async (code) => {
      const info = await priceService.getPriceAndVat(code).catch(() => null);
      priceMap.set(code, info ?? null);
    }),
  ).then(() => setListinoPrices(new Map(priceMap)));
}, [isOpen, orders]);
```

- [ ] **Step 5: Aggiorna `handleAddSingle` con animazioni**

```typescript
const handleAddSingle = useCallback(
  async (article: CustomerFullHistoryOrder['articles'][number], orderDiscountPercent: number) => {
    const item = await buildPendingItem(article, orderDiscountPercent);
    const alreadyPresent = currentOrderItems.some((i) => i.articleCode === article.articleCode);
    if (alreadyPresent) {
      setPendingAction({ type: 'single', item, existingCode: article.articleCode });
      return;
    }
    onAddArticle(item, false);
    // Animazioni
    setAddedCount((c) => c + 1);
    setArticleBadges((prev) => {
      const m = new Map(prev);
      m.set(article.articleCode, (m.get(article.articleCode) ?? 0) + 1);
      return m;
    });
    setFlashingArticles((prev) => new Set([...prev, article.articleCode]));
    setTimeout(() => {
      setFlashingArticles((prev) => { const s = new Set(prev); s.delete(article.articleCode); return s; });
    }, 1200);
  },
  [buildPendingItem, currentOrderItems, onAddArticle],
);
```

- [ ] **Step 6: Aggiorna `handleCopyOrder` con animazioni**

```typescript
const handleCopyOrder = useCallback(
  async (order: CustomerFullHistoryOrder) => {
    setCopyingOrderId(order.orderId);
    const validItems: PendingOrderItem[] = [];
    const skipped: string[] = [];

    for (const a of order.articles) {
      const priceInfo = isFresisClient
        ? { price: a.unitPrice, vat: a.vatPercent }
        : await priceService.getPriceAndVat(a.articleCode);
      if (!priceInfo) { skipped.push(`${a.articleCode} — ${a.articleDescription}`); continue; }
      validItems.push(await buildPendingItem(a, order.orderDiscountPercent));
    }

    const action: PendingAction = { type: 'order', items: validItems, skipped };
    if (currentOrderItems.length > 0) {
      setCopyingOrderId(null);
      setPendingAction(action);
      return;
    }

    onAddOrder(validItems, false);
    if (skipped.length > 0) setSkippedDialog(skipped);

    // Animazioni copia ordine
    setAddedCount((c) => c + validItems.length);
    for (const item of validItems) {
      setArticleBadges((prev) => {
        const m = new Map(prev);
        m.set(item.articleCode, (m.get(item.articleCode) ?? 0) + 1);
        return m;
      });
    }
    setCopiedOrderIds((prev) => new Set([...prev, order.orderId]));
    setTimeout(() => {
      setCopyingOrderId(null);
      setCopiedOrderIds((prev) => { const s = new Set(prev); s.delete(order.orderId); return s; });
    }, 1300);
  },
  [buildPendingItem, currentOrderItems.length, isFresisClient, onAddOrder],
);
```

- [ ] **Step 7: Aggiungi counter nell'header e keyframes animazioni**

Nell'header del modale, accanto al pulsante chiudi, aggiungi:
```tsx
{addedCount > 0 && (
  <div id="cart-counter" style={{
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'rgba(5,150,105,0.25)', borderRadius: 20,
    padding: '4px 12px', fontSize: 12, color: '#6ee7b7', fontWeight: 700,
    animation: 'counterBump 0.3s ease',
  }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
    {addedCount} articol{addedCount === 1 ? 'o' : 'i'} nell'ordine
  </div>
)}
```

Prima del `return` del componente, aggiungi i keyframes con un tag `<style>`:
```tsx
<style>{`
  @keyframes artFlash { 0%,100% { background: inherit; } 30% { background: #dcfce7; } }
  @keyframes badgePop { 0% { transform: scale(0.6); opacity: 0; } 80% { transform: scale(1.2); } 100% { transform: scale(1); opacity: 1; } }
  @keyframes badgeBump { 0%,100% { transform: scale(1); } 50% { transform: scale(1.3); } }
  @keyframes counterBump { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
  @keyframes checkPop { 0% { transform: scale(0) rotate(-20deg); opacity: 0; } 80% { transform: scale(1.1) rotate(5deg); } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
`}</style>
```

- [ ] **Step 8: Aggiorna `ArticleRow` per colonne listino e animazioni badge**

`ArticleRow` riceve nuovi props: `listinoInfo`, `badgeCount`, `isFlashing`.

La tabella nell'`OrderCard` aggiorna `colgroup` e `thead` per le due nuove colonne, e passa i nuovi prop ad `ArticleRow`.

Colonna listino unit. (dopo P.unit. storico):
```tsx
<th style={{ padding: '7px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', background: '#f5f3ff', borderBottom: '1px solid #e2e8f0' }}>
  Listino unit.
</th>
```

Colonna tot. listino+IVA (dopo Tot.+IVA storico):
```tsx
<th style={{ padding: '7px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', background: '#f5f3ff', borderBottom: '1px solid #e2e8f0' }}>
  Tot. listino+IVA
</th>
```

Cella listino unit. nella riga:
```tsx
const listinoUnit = listinoInfo ? listinoInfo.price : null;
const listinoTot = listinoInfo && article.vatPercent !== undefined
  ? Math.round(article.quantity * listinoInfo.price * (1 + article.vatPercent / 100) * 100) / 100
  : null;

const delta = listinoUnit !== null
  ? Math.round((listinoUnit / article.unitPrice - 1) * 10000) / 100
  : null;

// Cella P.unit. listino:
<td style={{ padding: '8px 8px', textAlign: 'right', background: '#fafaff' }}>
  {listinoUnit !== null ? (
    <>
      <span style={{ fontWeight: 700, color: '#6366f1' }}>{formatEur(listinoUnit)}</span>
      {delta !== null && Math.abs(delta) > 0.1 && (
        <span style={{ display: 'block', fontSize: 8, fontWeight: 600, color: delta > 0 ? '#dc2626' : '#059669' }}>
          {delta > 0 ? `▲ +${delta}%` : `▼ −${Math.abs(delta)}%`}
        </span>
      )}
      {delta !== null && Math.abs(delta) <= 0.1 && (
        <span style={{ display: 'block', fontSize: 8, color: '#94a3b8' }}>= invariato</span>
      )}
    </>
  ) : <span style={{ color: '#94a3b8' }}>—</span>}
</td>

// Cella tot. listino+IVA:
<td style={{ padding: '8px 8px', textAlign: 'right', background: '#fafaff', fontWeight: 700, color: '#6366f1' }}>
  {listinoTot !== null ? formatEur(listinoTot) : <span style={{ color: '#94a3b8' }}>—</span>}
</td>
```

Il pulsante "+ Aggiungi" mostra badge contatore:
```tsx
<button onClick={onAdd} style={{ /* stili esistenti */ }}>
  {badgeCount > 0 ? (
    <>
      Aggiunto
      <span style={{
        marginLeft: 4, background: '#4ade80', color: '#14532d',
        borderRadius: 10, padding: '0 5px', fontSize: 9, fontWeight: 700,
        animation: badgeCount === 1 ? 'badgePop 0.3s ease' : 'badgeBump 0.2s ease',
      }}>
        ✓ ×{badgeCount}
      </span>
    </>
  ) : '+ Aggiungi'}
</button>
```

- [ ] **Step 9: Aggiungi overlay checkmark sull'OrderCard durante la copia**

In `OrderCard`, aggiungi overlay quando `isCopying || isCopied`:
```tsx
{(isCopying || isCopied) && (
  <div style={{
    position: 'absolute', inset: 0, background: 'rgba(5,150,105,0.15)', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
  }}>
    <div style={{ animation: 'checkPop 0.4s ease', fontSize: 48, color: '#059669' }}>✓</div>
  </div>
)}
```

Nota: `OrderCard` deve avere `position: 'relative'`.

- [ ] **Step 10: Aggiungi riga secondaria customer info nell'OrderCard**

Nell'header della card, dopo `{order.orderNumber}`, aggiungi:
```tsx
{(order.customerProfileId || order.customerCity || order.customerRagioneSociale) && (
  <div style={{ width: '100%', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
    Cliente: {[order.customerProfileId, order.customerRagioneSociale, order.customerCity].filter(Boolean).join(' · ')}
  </div>
)}
```

- [ ] **Step 11: Type-check e test frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```
Expected: zero errori TypeScript, tutti i test passano.

- [ ] **Step 12: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx
git commit -m "feat(frontend): update CustomerHistoryModal — array props, listino columns, animations, order counter"
```

---

### Task 10: OrderFormSimple — nuovo flusso matching

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

- [ ] **Step 1: Aggiungi import e stato**

Aggiungi agli import:
```typescript
import { MatchingManagerModal } from './MatchingManagerModal';
import { getMatchesForSubClient, getMatchesForCustomer } from '../services/sub-client-matches.service';
```

Rimuovi i vecchi stati di matching e aggiungi:
```typescript
// Sostituisce: historyMatchedProfileId, historyMatchedSubClientCodice,
//              showCustomerPickerForHistory, showSubClientPickerModal
const [showMatchingManagerModal, setShowMatchingManagerModal] = useState(false);
const [historyCustomerProfileIds, setHistoryCustomerProfileIds] = useState<string[]>([]);
const [historySubClientCodices, setHistorySubClientCodices] = useState<string[]>([]);

// Animazione nuove righe
const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: Riscrivi `handleHistorySearchClick`**

```typescript
const handleHistorySearchClick = useCallback(async () => {
  if (!selectedCustomer) return;

  try {
    let result: { customerProfileIds: string[]; subClientCodices: string[]; skipModal: boolean };

    if (isFresis(selectedCustomer) && selectedSubClient) {
      result = await getMatchesForSubClient(selectedSubClient.codice);
    } else if (!isFresis(selectedCustomer)) {
      result = await getMatchesForCustomer(selectedCustomer.id);
    } else {
      // Fresis senza sottocliente selezionato: apri direttamente
      setShowCustomerHistoryModal(true);
      return;
    }

    setHistoryCustomerProfileIds(result.customerProfileIds);
    setHistorySubClientCodices(result.subClientCodices);

    if (result.skipModal) {
      setShowCustomerHistoryModal(true);
    } else {
      setShowMatchingManagerModal(true);
    }
  } catch {
    // Se la chiamata fallisce, apri lo storico con i dati disponibili
    setShowCustomerHistoryModal(true);
  }
}, [selectedCustomer, selectedSubClient]);
```

- [ ] **Step 3: Aggiungi helper per aggiungere righe con animazione**

`addItemsWithAnimation` gestisce SOLO l'animazione — NON chiama `setItems` (farlo causerebbe double-add perché i callback `onAddArticle`/`onAddOrder` già chiamano `setItems`). Wrappato in `useCallback` per stabilità di referenza.

```typescript
const addItemsWithAnimation = useCallback((newItems: OrderItem[]) => {
  const ids = new Set(newItems.map((i) => i.id));
  setRecentlyAddedIds((prev) => new Set([...prev, ...ids]));
  for (const id of ids) {
    setTimeout(() => {
      setRecentlyAddedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }, 2500);
  }
}, []);
```

Verifica che `onAddArticle` e `onAddOrder` chiamino `setItems` nel proprio callback inline, e poi chiamino `addItemsWithAnimation` solo per il tracking dell'animazione (non per aggiornare lo stato degli items).

- [ ] **Step 4: Aggiorna il call site di `CustomerHistoryModal` (righe 4999–5060)**

Sostituisci le props del `CustomerHistoryModal`:
```tsx
{showCustomerHistoryModal && selectedCustomer && (
  <CustomerHistoryModal
    isOpen={showCustomerHistoryModal}
    onClose={() => setShowCustomerHistoryModal(false)}
    customerName={isFresis(selectedCustomer) ? (selectedSubClient?.ragioneSociale ?? selectedCustomer.name) : selectedCustomer.name}
    customerProfileIds={historyCustomerProfileIds}
    subClientCodices={historySubClientCodices}
    isFresisClient={isFresis(selectedCustomer)}
    currentOrderItems={items.map((i) => ({
      articleCode: i.article,
      productName: i.productName,
      description: i.description ?? '',
      quantity: i.quantity,
      price: i.unitPrice,
      vat: i.vatRate,
      discount: i.discount,
    }))}
    onAddArticle={(newItem, replace) => {
      const newId = crypto.randomUUID();
      const mapped = {
        id: newId,
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
      };
      setItems((prev) => {
        const filtered = replace ? prev.filter((e) => e.article !== newItem.articleCode) : prev;
        return [...filtered, mapped];
      });
      addItemsWithAnimation([mapped]);
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
      if (replace) {
        setItems(mapped);
        addItemsWithAnimation(mapped);
      } else {
        setItems((prev) => [...prev, ...mapped]);
        addItemsWithAnimation(mapped);
      }
    }}
  />
)}
```

- [ ] **Step 5: Sostituisci `CustomerPickerModal` e `SubClientPickerModal` con `MatchingManagerModal`**

Rimuovi i blocchi JSX di `CustomerPickerModal` (righe 5063–5073) e `SubClientPickerModal` (righe 5076–5088).

Aggiungi in loro posto:
```tsx
{showMatchingManagerModal && selectedCustomer && (
  (() => {
    if (isFresis(selectedCustomer) && selectedSubClient) {
      return (
        <MatchingManagerModal
          mode="subclient"
          subClientCodice={selectedSubClient.codice}
          entityName={selectedSubClient.ragioneSociale ?? selectedSubClient.codice}
          onConfirm={(ids) => {
            setHistoryCustomerProfileIds(ids.customerProfileIds);
            setHistorySubClientCodices(ids.subClientCodices);
            setShowMatchingManagerModal(false);
            setShowCustomerHistoryModal(true);
          }}
          onSkip={() => {
            setShowMatchingManagerModal(false);
            setShowCustomerHistoryModal(true);
          }}
          onClose={() => setShowMatchingManagerModal(false)}
        />
      );
    }
    if (!isFresis(selectedCustomer)) {
      return (
        <MatchingManagerModal
          mode="customer"
          customerProfileId={selectedCustomer.id}
          entityName={selectedCustomer.name}
          onConfirm={(ids) => {
            setHistoryCustomerProfileIds(ids.customerProfileIds);
            setHistorySubClientCodices(ids.subClientCodices);
            setShowMatchingManagerModal(false);
            setShowCustomerHistoryModal(true);
          }}
          onSkip={() => {
            setShowMatchingManagerModal(false);
            setShowCustomerHistoryModal(true);
          }}
          onClose={() => setShowMatchingManagerModal(false)}
        />
      );
    }
    return null;
  })()
)}
```

- [ ] **Step 6: Passa `newItemIds` a `OrderItemsList`**

Trova il punto in `OrderFormSimple.tsx` dove è renderizzato `<OrderItemsList .../>` e aggiungi:
```tsx
<OrderItemsList
  items={items}
  onEditItem={...}
  onDeleteItem={...}
  newItemIds={recentlyAddedIds}
/>
```

- [ ] **Step 7: Rimuovi stati e import obsoleti**

Rimuovi:
- Stato `historyMatchedProfileId`, `historyMatchedSubClientCodice`
- Stato `showCustomerPickerForHistory`, `showSubClientPickerModal`
- Import di `SubClientPickerModal`
- Import di `CustomerPickerModal` da `SubclientsTab`
- Import di `fetchSubclients` e `getSubclientByMatchedCustomer` se non più usati

- [ ] **Step 8: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: zero errori.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(frontend): update OrderFormSimple — new N:M matching flow, slide-in animation tracking"
```

---

### Task 11: SubclientsTab — usa MatchingManagerModal

**Files:**
- Modify: `archibald-web-app/frontend/src/components/SubclientsTab.tsx`

- [ ] **Step 1: Sostituisci CustomerPickerModal con MatchingManagerModal e rimuovi "Scollega"**

In `SubclientsTab.tsx`:
1. Rimuovi import `customerService` e il blocco `CustomerPickerModal` (se definito inline)
2. Rimuovi il pulsante "Scollega" (legacy) e il suo handler `clearSubclientMatch` (o equivalente). Il collegamento/scollegamento avviene ora dentro `MatchingManagerModal` tramite `removeCustomerMatch`.
3. Aggiungi import: `import { MatchingManagerModal } from './MatchingManagerModal';`
3. Aggiungi stato: `const [matchingCodice, setMatchingCodice] = useState<string | null>(null);`
4. Rimuovi stato `linkingCodice` e `handleLink` (o aggiornali per usare MatchingManagerModal)
5. Sostituisci il pulsante "Collega" per aprire `MatchingManagerModal`:

```tsx
// Per ogni sottocliente nella lista:
<button onClick={() => setMatchingCodice(sub.codice)} style={{ /* stili esistenti */ }}>
  Collega / Gestisci match
</button>
```

6. Aggiungi la modale:
```tsx
{matchingCodice && (
  <MatchingManagerModal
    mode="subclient"
    subClientCodice={matchingCodice}
    entityName={subclients.find((s) => s.codice === matchingCodice)?.ragioneSociale ?? matchingCodice}
    onConfirm={() => {
      setMatchingCodice(null);
      // Ricarica sottoclienti per aggiornare badge
      getSubclients().then(setSubclientsList).catch(() => {});
    }}
    onSkip={() => setMatchingCodice(null)}
    onClose={() => setMatchingCodice(null)}
  />
)}
```

7. Aggiorna il badge matching per ogni sottocliente per mostrare i match N:M (opzionale ma consigliato: usa `matchedCustomerProfileId` esistente come indicatore).

- [ ] **Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/SubclientsTab.tsx
git commit -m "feat(frontend): update SubclientsTab to use MatchingManagerModal for N:M matching"
```

---

### Task 12: Test CustomerHistoryModal

**Files:**
- Create: `archibald-web-app/frontend/src/components/CustomerHistoryModal.spec.tsx`

- [ ] **Step 1: Scrivi i test**

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerHistoryModal } from './CustomerHistoryModal';
import { priceService } from '../services/prices.service';

const ARTICLE = {
  articleCode: 'H129FSQ.104',
  productName: 'Rosa rossa',
  unitPrice: 2.40,
  quantity: 10,
  vatPercent: 22,
  discount: 15,
};

const ORDER = {
  orderId: 'ord-1',
  orderNumber: '1001',
  orderDate: '2026-01-01',
  totalAmount: 20.40,
  orderDiscountPercent: 0,
  source: 'orders' as const,
  articles: [ARTICLE],
};

vi.mock('../api/customer-full-history', () => ({
  getCustomerFullHistory: vi.fn(),
}));
vi.mock('../services/prices.service', () => ({
  priceService: { getPriceAndVat: vi.fn() },
}));

import { getCustomerFullHistory } from '../api/customer-full-history';

const mockGetHistory = vi.mocked(getCustomerFullHistory);
const mockGetPriceAndVat = vi.mocked(priceService.getPriceAndVat);

describe('CustomerHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHistory.mockResolvedValue([ORDER]);
    // Di default: nessun prezzo listino disponibile
    mockGetPriceAndVat.mockResolvedValue(null);
  });

  it('incrementa il badge ×N ogni volta che si aggiunge un articolo', async () => {
    const onAddArticle = vi.fn();
    render(
      <CustomerHistoryModal
        isOpen
        onClose={vi.fn()}
        customerName="Test"
        customerProfileIds={['CP001']}
        subClientCodices={[]}
        isFresisClient={false}
        currentOrderItems={[]}
        onAddArticle={onAddArticle}
        onAddOrder={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.queryByText('Caricamento')).not.toBeInTheDocument());
    const btn = screen.getByRole('button', { name: /aggiungi/i });
    fireEvent.click(btn);
    expect(screen.getByText(/✓.*1/)).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByText(/✓.*2/)).toBeInTheDocument();
  });

  it('mostra — nelle colonne listino quando il prezzo listino è null', async () => {
    // getPriceAndVat ritorna null → nessun prezzo listino
    mockGetPriceAndVat.mockResolvedValue(null);
    render(
      <CustomerHistoryModal
        isOpen
        onClose={vi.fn()}
        customerName="Test"
        customerProfileIds={['CP001']}
        subClientCodices={[]}
        isFresisClient={false}
        currentOrderItems={[]}
        onAddArticle={vi.fn()}
        onAddOrder={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.queryByText('Caricamento')).not.toBeInTheDocument());
    await waitFor(() => {
      const dashCells = screen.getAllByText('—');
      expect(dashCells.length).toBeGreaterThanOrEqual(2); // listino unit. e tot. listino
    });
  });

  it('mostra colonne listino in viola con delta quando il prezzo è aumentato', async () => {
    // ARTICLE.unitPrice = 2.40; listino = 2.80 → +16.67%
    mockGetPriceAndVat.mockResolvedValue({ price: 2.80, vat: 22 });
    render(
      <CustomerHistoryModal
        isOpen
        onClose={vi.fn()}
        customerName="Test"
        customerProfileIds={['CP001']}
        subClientCodices={[]}
        isFresisClient={false}
        currentOrderItems={[]}
        onAddArticle={vi.fn()}
        onAddOrder={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.queryByText('Caricamento')).not.toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getByText('2,80')).toBeInTheDocument();
      expect(screen.getByText(/▲/)).toBeInTheDocument();
    });
  });

  it('usa il prezzo listino (non storico) nel buildPendingItem per clienti non-Fresis', async () => {
    // Per clienti non-Fresis, buildPendingItem usa priceService.getPriceAndVat
    mockGetPriceAndVat.mockResolvedValue({ price: 2.80, vat: 22 });
    const onAddArticle = vi.fn();
    render(
      <CustomerHistoryModal
        isOpen
        onClose={vi.fn()}
        customerName="Test"
        customerProfileIds={['CP001']}
        subClientCodices={[]}
        isFresisClient={false}
        currentOrderItems={[]}
        onAddArticle={onAddArticle}
        onAddOrder={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.queryByText('Caricamento')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /aggiungi/i }));
    await waitFor(() => {
      expect(onAddArticle).toHaveBeenCalledWith(
        expect.objectContaining({ price: 2.80 }),
        false
      );
    });
  });
});
```

- [ ] **Step 2: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerHistoryModal
```
Expected: tutti e 4 PASS.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerHistoryModal.spec.tsx
git commit -m "test(frontend): add CustomerHistoryModal tests — badge, listino columns, buildPendingItem"
```

---

### Task 13: Test MatchingManagerModal

**Files:**
- Create: `archibald-web-app/frontend/src/components/MatchingManagerModal.spec.tsx`

- [ ] **Step 1: Scrivi i test**

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchingManagerModal } from './MatchingManagerModal';

vi.mock('../services/sub-client-matches.service', () => ({
  getMatchesForSubClient: vi.fn(),
  getMatchesForCustomer: vi.fn(),
  addCustomerMatch: vi.fn(),
  removeCustomerMatch: vi.fn(),
  addSubClientMatch: vi.fn(),
  removeSubClientMatch: vi.fn(),
  upsertSkipModal: vi.fn(),
}));
vi.mock('../services/customers.service', () => ({
  customerService: { searchCustomers: vi.fn().mockResolvedValue([]) },
}));

import * as svc from '../services/sub-client-matches.service';
const mockGet = vi.mocked(svc.getMatchesForSubClient);
const mockUpsertSkip = vi.mocked(svc.upsertSkipModal);

const BASE_MATCHES = {
  customerProfileIds: [],
  subClientCodices: [],
  skipModal: false,
};

describe('MatchingManagerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(BASE_MATCHES);
  });

  it('onSkip non chiama nessuna API', async () => {
    const onSkip = vi.fn();
    render(
      <MatchingManagerModal
        mode="subclient"
        subClientCodice="C00001"
        entityName="Subclient A"
        onConfirm={vi.fn()}
        onSkip={onSkip}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.queryByText('Caricamento')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /salta/i }));
    expect(onSkip).toHaveBeenCalled();
    expect(svc.addCustomerMatch).not.toHaveBeenCalled();
    expect(svc.removeCustomerMatch).not.toHaveBeenCalled();
    expect(svc.addSubClientMatch).not.toHaveBeenCalled();
    expect(svc.removeSubClientMatch).not.toHaveBeenCalled();
  });

  it('onConfirm chiama remove solo per le differenze rispetto ai match iniziali', async () => {
    mockGet.mockResolvedValue({
      customerProfileIds: ['CP001'],
      subClientCodices: [],
      skipModal: false,
    });
    const onConfirm = vi.fn();
    render(
      <MatchingManagerModal
        mode="subclient"
        subClientCodice="C00001"
        entityName="Subclient A"
        onConfirm={onConfirm}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.queryByText('Caricamento')).not.toBeInTheDocument());
    // CP001 era già presente — rimuoviamo cliccando il pulsante ✕ nel chip
    // Il chip ha label "CP001" e un bottone ✕; cerchiamo il ✕ vicino a CP001
    const chipRemoveBtn = screen.getByRole('button', { name: '✕' });
    fireEvent.click(chipRemoveBtn);
    fireEvent.click(screen.getByRole('button', { name: /conferma/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(svc.removeCustomerMatch).toHaveBeenCalledWith('C00001', 'CP001');
    expect(svc.addCustomerMatch).not.toHaveBeenCalled();
  });

  it('checkbox "non chiedere più" chiama upsertSkipModal con skip=true al conferma', async () => {
    render(
      <MatchingManagerModal
        mode="subclient"
        subClientCodice="C00001"
        entityName="Subclient A"
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.queryByText('Caricamento')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /conferma/i }));
    await waitFor(() => expect(mockUpsertSkip).toHaveBeenCalled());
    expect(mockUpsertSkip).toHaveBeenCalledWith('subclient', 'C00001', true);
  });
});
```

- [ ] **Step 2: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose MatchingManagerModal
```
Expected: tutti e 3 PASS.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/MatchingManagerModal.spec.tsx
git commit -m "test(frontend): add MatchingManagerModal tests — onSkip no-API, diff-only confirm, skip-modal checkbox"
```

---

### Task 14: Verifica finale

- [ ] **Step 1: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: zero errori.

- [ ] **Step 2: Test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```
Expected: tutti PASS.

- [ ] **Step 3: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: zero errori.

- [ ] **Step 4: Test backend**

```bash
npm test --prefix archibald-web-app/backend
```
Expected: tutti PASS, nessuna regressione.

- [ ] **Step 5: Commit finale (se ci sono file non ancora committati)**

```bash
git status
# Committa eventuali residui
```

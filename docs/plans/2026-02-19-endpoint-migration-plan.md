# Endpoint Migration Plan - Complete Route Coverage

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate ALL 62 missing frontend-called endpoints from the old monolithic `index.ts` to the new modular route architecture with PostgreSQL, dependency injection, and Zod validation.

**Architecture:** Extract business logic from old `index.ts` (master branch), adapt to new patterns (DbPool with withTransaction, DI via deps, Zod schemas, AuthRequest, logger). Each endpoint group becomes a route file or extends an existing one.

**Tech Stack:** TypeScript, Express, PostgreSQL (pg), Zod, Vitest, BullMQ (for queue-proxied operations)

**Source of truth:** `git show master:archibald-web-app/backend/src/index.ts` for business logic extraction.

---

## Phase 1: User Settings (4 endpoints) — Priority: CRITICAL

User profile targets and privacy settings. Used by Dashboard, ProfilePage, AppRouter.

### Task 1.1: Add user settings endpoints to existing routes

**Files:**
- Create: `backend/src/routes/users.ts`
- Create: `backend/src/routes/users.spec.ts`
- Modify: `backend/src/server.ts` (mount at `/api/users`)

**Endpoints:**
1. `GET /api/users/me/target` — Read user's monthly/yearly targets (index.ts:1313-1334)
2. `PUT /api/users/me/target` — Update user's targets (index.ts:1335-1451)
3. `GET /api/users/me/privacy` — Read privacy mode setting (index.ts:1452-1473)
4. `POST /api/users/me/privacy` — Toggle privacy mode (index.ts:1474-1505)

**Source logic:**
- `GET target`: Query `users` table for target fields (`monthly_target`, `yearly_target`, `currency`, `commission_rate`, `bonus_amount`, etc.)
- `PUT target`: Update same fields. Complex: includes commission calculations, bonus intervals, extra budget settings.
- `GET privacy`: Query `user_privacy_settings` table by userId
- `POST privacy`: Upsert into `user_privacy_settings`

**DB tables used:** `agents.users`, `agents.user_privacy_settings`

**Step-by-step:**
1. Read old index.ts lines 1313-1505 from master
2. Write failing tests for all 4 endpoints
3. Implement `createUsersRouter` with deps pattern
4. Wire in server.ts at `/api/users`
5. Run tests, verify build

---

## Phase 2: Dashboard & Widget (6 endpoints) — Priority: CRITICAL

Dashboard homepage data. Used by Dashboard.tsx, WidgetOrderConfigModal.tsx.

### Task 2.1: Create widget/dashboard route

**Files:**
- Create: `backend/src/routes/widget.ts`
- Create: `backend/src/routes/widget.spec.ts`
- Modify: `backend/src/server.ts`

**Endpoints:**
1. `GET /api/widget/dashboard-data` — Main dashboard aggregation (index.ts:1506-1647)
2. `GET /api/metrics/budget` — Budget metrics (index.ts:1648-1695)
3. `GET /api/metrics/orders` — Order metrics (index.ts:1696-1904)
4. `GET /api/widget/orders/:year/:month` — Monthly order breakdown (index.ts:1905-1994)
5. `POST /api/widget/orders/exclusions` — Set order exclusions (index.ts:1995-2039)
6. `GET /api/widget/orders/exclusions` — Get exclusions list (index.ts:2040-2061)

**Source logic:**
- Dashboard-data: Complex aggregation across `order_records`, `fresis_history`, `widget_order_exclusions`. Calculates monthly/yearly revenue, commission projections, bonus thresholds.
- Metrics: Revenue calculations with temporal comparisons, uses `temporal-comparisons.ts` and `widget-calculations.ts`
- Exclusions: CRUD on `agents.widget_order_exclusions`

**DB tables used:** `agents.order_records`, `agents.fresis_history`, `agents.widget_order_exclusions`, `agents.users`

**Dependencies:** `temporal-comparisons.ts`, `widget-calculations.ts` (existing files, need to adapt from SQLite to PostgreSQL)

**Step-by-step:**
1. Read old index.ts lines 1506-2061 from master
2. Read `temporal-comparisons.ts` and `widget-calculations.ts` to understand dependencies
3. Adapt helper functions from SQLite `Database` parameter to `DbPool`
4. Write failing tests
5. Implement routes
6. Wire in server.ts at `/api/widget` and `/api/metrics`

---

## Phase 3: Customer Operations (10 endpoints) — Priority: CRITICAL

Customer creation, update, status, retry, interactive sessions, photo upload. Core customer management flow.

### Task 3.1: Extend customers route with missing endpoints

**Files:**
- Modify: `backend/src/routes/customers.ts`
- Modify: `backend/src/routes/customers.spec.ts`
- Modify: `backend/src/server.ts` (add new deps)

**Endpoints:**
1. `POST /api/customers/sync` — Trigger customer sync (index.ts:2193) → PROXY to operations queue `enqueue('sync-customers')`
2. `POST /api/customers` (create) — Create customer via bot (index.ts:2850) → PROXY to operations queue `enqueue('create-customer')`
3. `PUT /api/customers/:customerProfile` — Update customer via bot (index.ts:2976) → PROXY to operations queue `enqueue('update-customer')`
4. `GET /api/customers/:customerProfile/status` — Check bot status (index.ts:3101-3131)
5. `POST /api/customers/:customerProfile/retry` — Retry failed customer op (index.ts:3132-3269) → PROXY to operations queue

### Task 3.2: Customer interactive session endpoints

**Files:**
- Create: `backend/src/routes/customer-interactive.ts`
- Create: `backend/src/routes/customer-interactive.spec.ts`
- Modify: `backend/src/server.ts`

**Endpoints:**
6. `POST /api/customers/interactive/start` — Start interactive customer creation session (index.ts:3270-3395)
7. `POST /api/customers/interactive/:sessionId/vat` — Validate VAT in session (index.ts:3396-3497)
8. `POST /api/customers/interactive/:sessionId/heartbeat` — Keep session alive (index.ts:3498-3518)
9. `POST /api/customers/interactive/:sessionId/save` — Save customer from session (index.ts:3519-3697)
10. `DELETE /api/customers/interactive/:sessionId` — Close session (index.ts:3698-3760)

**Source logic:**
- Interactive sessions use BrowserPool contexts directly for real-time Archibald interaction
- Session state managed in-memory (Map)
- Heartbeat keeps browser context alive
- Save extracts form data from Archibald page and commits

**Dependencies:** BrowserPool, ArchibaldBot (for VAT lookup, form filling)

---

## Phase 4: Products & Prices (12 endpoints) — Priority: HIGH

Product search, variations tracking, price import/history. Used by product catalog, price management, admin.

### Task 4.1: Extend products route

**Files:**
- Modify: `backend/src/routes/products.ts`
- Modify: `backend/src/routes/products.spec.ts`

**Endpoints:**
1. `GET /api/products/search` — Search products (index.ts:4032-4067) — different from GET /products?search=
2. `GET /api/products/zero-price-count` — Count products without price (index.ts:3874-3892)
3. `GET /api/products/no-vat-count` — Count products without VAT (index.ts:3893-3911)
4. `GET /api/products/:productId/changes` — Product change history (index.ts:4330-4367)
5. `GET /api/products/variations/recent/:days?` — Recent price/product variations (index.ts:4454-4482)
6. `GET /api/products/variations/product/:productId` — Variation history for product (index.ts:4483-4512)
7. `POST /api/products/sync` — Trigger product sync (index.ts:5435) → PROXY to operations queue

### Task 4.2: Create prices route

**Files:**
- Create: `backend/src/routes/prices.ts`
- Create: `backend/src/routes/prices.spec.ts`
- Modify: `backend/src/server.ts`

**Endpoints:**
8. `POST /api/prices/import-excel` — Import Excel price list (index.ts:5121) — uses multer for file upload, xlsx parsing
9. `GET /api/prices/imports` — Import history (index.ts:5142)
10. `GET /api/prices/:productId/history` — Price history for product (index.ts:5135)
11. `GET /api/prices/history/:productId` — Alias of above (index.ts:5221)
12. `GET /api/prices/history/recent/:days?` — Recent price changes (index.ts:5244)

**Dependencies:** `xlsx` package (already installed), multer for file upload, `shared.prices`, `shared.price_history` tables

---

## Phase 5: Orders Extended (7 endpoints) — Priority: HIGH

Order operations that proxy to the queue, PDF download, status checks.

### Task 5.1: Extend orders route

**Files:**
- Modify: `backend/src/routes/orders.ts`
- Modify: `backend/src/routes/orders.spec.ts`

**Endpoints:**
1. `GET /api/orders/last-sales/:articleCode` — Last sales for article (index.ts:5515-5537)
2. `GET /api/orders/status/:jobId` — Job status check (index.ts:5538-5561) → PROXY to `/api/operations/:jobId/status`
3. `POST /api/orders/force-sync` — Force order sync (index.ts:6095-6231) → PROXY to operations queue
4. `POST /api/orders/reset-and-sync` — Reset and sync orders (index.ts:6232-6371) → PROXY to operations queue
5. `POST /api/orders/:orderId/send-to-milano` — Send order to Verona (index.ts:6372) → PROXY to operations queue `enqueue('send-to-verona')`
6. `GET /api/orders/:orderId/pdf-download` — Download order PDF (index.ts:7063-7234) — Puppeteer PDF generation
7. `POST /api/orders/:orderId/sync-articles` — Sync order articles (index.ts:7415) → PROXY to operations queue `enqueue('sync-order-articles')`

**Note:** Many of these are PROXY endpoints that simply enqueue operations. The actual logic runs in the unified queue handlers.

---

## Phase 6: Sync Extended (4 endpoints) — Priority: HIGH

Sync interval management and clear-db functionality.

### Task 6.1: Extend sync-status route

**Files:**
- Modify: `backend/src/routes/sync-status.ts`
- Modify: `backend/src/routes/sync-status.spec.ts`

**Endpoints:**
1. `GET /api/sync/intervals` — Get sync intervals (index.ts:4922-4943)
2. `POST /api/sync/intervals/:type` — Set sync interval (index.ts:4944-5023)
3. `DELETE /api/sync/:type/clear-db` — Clear DB for sync type (index.ts:2550-2623)
4. `GET /api/sync/status` — Overall sync status (index.ts:2340-2367)

---

## Phase 7: Admin Extended (7 endpoints) — Priority: MEDIUM

Admin job management, session check, subclients import.

### Task 7.1: Extend admin route

**Files:**
- Modify: `backend/src/routes/admin.ts`
- Modify: `backend/src/routes/admin.spec.ts`

**Endpoints:**
1. `GET /api/admin/jobs` — List BullMQ jobs (index.ts:5615-5646)
2. `POST /api/admin/jobs/retry/:jobId` — Retry job (index.ts:5647-5683) → Uses operations queue
3. `POST /api/admin/jobs/cancel/:jobId` — Cancel job (index.ts:5684-5719) → Uses operations queue
4. `POST /api/admin/jobs/cleanup` — Clean old jobs (index.ts:5720-5748)
5. `GET /api/admin/jobs/retention` — Get retention settings (index.ts:5749-5765)
6. `GET /api/admin/session/check` — Check impersonation session (old admin-routes.ts:216)
7. `POST /api/admin/subclients/import` — Import subclients from file (index.ts:5024-5057)

---

## Phase 8: Subclients (3 endpoints) — Priority: MEDIUM

Subclient CRUD. Used by subclient management page.

### Task 8.1: Create subclients route

**Files:**
- Create: `backend/src/routes/subclients.ts`
- Create: `backend/src/routes/subclients.spec.ts`
- Modify: `backend/src/server.ts`

**Endpoints:**
1. `GET /api/subclients` — List subclients for user (index.ts:5058-5075)
2. `GET /api/subclients/:codice` — Get subclient by code (index.ts:5076-5095)
3. `DELETE /api/subclients/:codice` — Delete subclient (index.ts:5096-5120)

**DB:** Subclients are stored in `agents.fresis_history` (sub_client_codice field) — query distinct subclients from fresis data.

---

## Phase 9: Fresis History Extended (4 endpoints) — Priority: MEDIUM

Search, export, import ARCA, next FT number.

### Task 9.1: Extend fresis-history route

**Files:**
- Modify: `backend/src/routes/fresis-history.ts`
- Modify: `backend/src/routes/fresis-history.spec.ts`

**Endpoints:**
1. `GET /api/fresis-history/search-orders` — Search orders for fresis linking (old fresis-history-routes.ts)
2. `GET /api/fresis-history/export-arca` — Export ArcA file (old fresis-history-routes.ts) — uses `arca-import-service.ts`
3. `POST /api/fresis-history/import-arca` — Import ArcA file (old fresis-history-routes.ts) — uses multer + `arca-import-service.ts`
4. `GET /api/fresis-history/next-ft-number` — Get next FT number (old fresis-history-routes.ts) — counter from `ft-counter.ts`

**Dependencies:** `arca-import-service.ts`, `ft-counter.ts` (existing, need PostgreSQL adaptation)

---

## Phase 10: Frontend Path Updates (5 path changes) — Priority: MEDIUM

Update frontend to use new paths where they changed.

### Task 10.1: Fix fresis-discounts path

**Files:**
- Modify: `frontend/src/api/fresis-discounts.ts`

**Changes:**
1. `/api/fresis-discounts` → `/api/fresis-history/discounts`
2. `/api/fresis-discounts/upload` → `/api/fresis-history/discounts` (POST)

### Task 10.2: Fix fresis-history upload path

**Files:**
- Modify: Frontend component that calls `/api/fresis-history/upload`

**Changes:**
1. `/api/fresis-history/upload` → `/api/fresis-history` (POST)

---

## Phase 11: Warehouse Upload & Validate (2 endpoints) — Priority: MEDIUM

File upload and article code validation.

### Task 11.1: Add warehouse upload and validate

**Files:**
- Modify: `backend/src/routes/warehouse.ts`
- Modify: `backend/src/server.ts` (add multer middleware)

**Endpoints:**
1. `POST /api/warehouse/upload` — Upload warehouse Excel file (old warehouse-routes.ts) — uses multer + xlsx parsing
2. `GET /api/warehouse/items/validate` — Validate article code against products DB (old warehouse-routes.ts)

**Dependencies:** multer (already installed), xlsx (already installed)

---

## Phase 12: WebSocket & Health (1 endpoint) — Priority: LOW

### Task 12.1: Add websocket health endpoint

**Files:**
- Modify: `backend/src/server.ts`

**Endpoint:**
1. `GET /api/websocket/health` — WebSocket connection stats (index.ts:527-557)

---

## Execution Guidelines

### For each phase:
1. **Read source:** `git show master:archibald-web-app/backend/src/index.ts` for the relevant line ranges
2. **Write failing tests first** (TDD per CLAUDE.md C-1)
3. **Implement minimal code** to make tests pass
4. **Use `pool.withTransaction()`** for any multi-step DB operations
5. **Use Zod** for request validation
6. **Use dependency injection** (deps pattern, no singletons)
7. **Run `npm run build`** and **`npm test`** after each task
8. **Commit** after each successful task

### Queue proxy pattern:
Many old endpoints directly called bot/sync functions. In the new architecture, these should proxy to the unified operations queue:
```typescript
router.post('/force-sync', async (req: AuthRequest, res) => {
  const jobId = await queue.enqueue('sync-orders', req.user!.userId, {});
  res.json({ success: true, jobId });
});
```

### Helper function adaptation:
Files like `temporal-comparisons.ts`, `widget-calculations.ts`, `ft-counter.ts`, `arca-import-service.ts` currently accept SQLite `Database` instances. They need to be adapted to accept `DbPool` (PostgreSQL). Pattern:
```typescript
// Old: function calculate(db: Database, userId: string)
// New: function calculate(pool: DbPool, userId: string)
```

---

## Summary

| Phase | Endpoints | Priority | Estimated Complexity |
|-------|-----------|----------|---------------------|
| 1. User Settings | 4 | CRITICAL | Low |
| 2. Dashboard & Widget | 6 | CRITICAL | High (complex aggregations) |
| 3. Customer Operations | 10 | CRITICAL | High (interactive sessions) |
| 4. Products & Prices | 12 | HIGH | Medium-High (Excel import) |
| 5. Orders Extended | 7 | HIGH | Medium (mostly queue proxies) |
| 6. Sync Extended | 4 | HIGH | Low |
| 7. Admin Extended | 7 | MEDIUM | Low-Medium |
| 8. Subclients | 3 | MEDIUM | Low |
| 9. Fresis Extended | 4 | MEDIUM | Medium (ArcA import) |
| 10. Frontend Paths | 5 | MEDIUM | Low |
| 11. Warehouse Upload | 2 | MEDIUM | Medium (file upload) |
| 12. WebSocket Health | 1 | LOW | Low |
| **TOTAL** | **62** | | |

---

## Parallel Sessions Strategy

Le 12 fasi possono essere raggruppate in **4 sessioni parallele** in base alle dipendenze:

### Sessione A — User Settings + Dashboard (Phase 1 + 2)
```
Leggi il piano di migrazione in docs/plans/2026-02-19-endpoint-migration-plan.md.
Esegui Phase 1 (User Settings) e Phase 2 (Dashboard & Widget).
Per ogni endpoint, leggi il codice sorgente dal vecchio monolite:
  git show master:archibald-web-app/backend/src/index.ts | sed -n 'LINEp'
Adatta al nuovo pattern: DbPool, DI via deps, Zod, pool.withTransaction(), AuthRequest.
Adatta temporal-comparisons.ts e widget-calculations.ts da SQLite (Database) a PostgreSQL (DbPool).
TDD: test first, implement, verify build+test, commit.
```

### Sessione B — Customer Operations (Phase 3)
```
Leggi il piano di migrazione in docs/plans/2026-02-19-endpoint-migration-plan.md.
Esegui Phase 3 (Customer Operations): 10 endpoint.
Task 3.1: Estendi routes/customers.ts con sync proxy, create/update proxy, status, retry.
Task 3.2: Crea routes/customer-interactive.ts per le sessioni interattive (start, vat, heartbeat, save, close).
Le sessioni interattive usano BrowserPool direttamente - mantieni la logica originale ma adattala al pattern DI.
Per ogni endpoint, leggi: git show master:archibald-web-app/backend/src/index.ts | sed -n 'START,ENDp'
TDD: test first, implement, verify build+test, commit.
```

### Sessione C — Products, Prices, Orders (Phase 4 + 5 + 6)
```
Leggi il piano di migrazione in docs/plans/2026-02-19-endpoint-migration-plan.md.
Esegui Phase 4 (Products & Prices), Phase 5 (Orders Extended), Phase 6 (Sync Extended).
Phase 4: Estendi routes/products.ts + crea routes/prices.ts (12 endpoint).
Phase 5: Estendi routes/orders.ts (7 endpoint, molti sono proxy alla unified queue).
Phase 6: Estendi routes/sync-status.ts (4 endpoint).
Per i proxy alla queue usa: queue.enqueue('operation-type', userId, data).
Per l'import Excel usa multer + xlsx (già installati).
TDD: test first, implement, verify build+test, commit.
```

### Sessione D — Admin, Subclients, Fresis, Warehouse, Frontend (Phase 7-12)
```
Leggi il piano di migrazione in docs/plans/2026-02-19-endpoint-migration-plan.md.
Esegui Phase 7 (Admin Extended), Phase 8 (Subclients), Phase 9 (Fresis Extended),
Phase 10 (Frontend Paths), Phase 11 (Warehouse Upload), Phase 12 (WebSocket Health).
Phase 7: Estendi routes/admin.ts (7 endpoint).
Phase 8: Crea routes/subclients.ts (3 endpoint).
Phase 9: Estendi routes/fresis-history.ts (4 endpoint). Adatta arca-import-service.ts e ft-counter.ts.
Phase 10: Aggiorna path frontend per fresis-discounts e fresis-history upload.
Phase 11: Aggiungi upload e validate a routes/warehouse.ts.
Phase 12: Aggiungi websocket health a server.ts.
TDD: test first, implement, verify build+test, commit.
```

### Ordine di esecuzione consigliato

```
Sessione A ─┐
Sessione B ─┤── possono partire in parallelo (nessuna dipendenza tra loro)
Sessione C ─┤
Sessione D ─┘

Dopo tutte e 4: sessione FINALE di verifica con agenti specializzati
```

### Sessione FINALE — Verifica completa
```
Leggi docs/plans/2026-02-19-endpoint-migration-plan.md.
Verifica che TUTTI i 62 endpoint siano implementati.
Lancia agenti specializzati per:
1. Build + test completo (backend + frontend)
2. Endpoint consistency check (frontend vs backend)
3. SQL schema vs code audit
4. Security review (auth checks su tutti gli endpoint)
5. Legacy/orphan scan finale
Tutto deve passare con ZERO issue.
```

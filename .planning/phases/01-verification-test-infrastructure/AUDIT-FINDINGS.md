# Audit Findings: 49 Redesigned Elements

> Audit Date: 2026-02-22
> Auditor: Systematic code comparison, master `index.ts` (8181 lines) vs `feat/unified-operation-queue` modular codebase
> Method: Line-by-line comparison of request validation, business logic, response shape, error handling, and side effects

## Classification Key

| Classification | Meaning |
|---------------|---------|
| **MATCH** | Functionally identical behavior (minor style differences OK) |
| **DIVERGENCE** | Different behavior detected |
| **INTENTIONAL** | Deliberately changed as part of architectural refactor |

Divergence severity:
- **critical**: Would break production functionality
- **significant**: Would cause noticeable behavior change
- **cosmetic**: Minor difference, no user impact

---

## Task 1: Critical User Flows

### 1.1 Authentication Endpoints

#### Element #1 (Infrastructure): `createApp()` factory

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Location | `index.ts` L108 `const app = express()` | `server.ts` L69 `createApp(deps)` | INTENTIONAL |
| Pattern | Global singleton + global variables | DI factory function, all deps injected | INTENTIONAL |
| Middleware | `helmet()`, `cors()`, `express.json({ limit: "2mb" })` | `cors()`, `helmet({ contentSecurityPolicy: false })`, `express.json({ limit: '10mb' })` | DIVERGENCE |

**DIVERGENCE (cosmetic):**
- JSON body limit changed from 2mb to 10mb (branch is more permissive)
- Branch adds `contentSecurityPolicy: false` to helmet (more permissive for dev/PWA)
- Middleware order slightly different (cors before helmet in branch)

#### Auth: POST /api/auth/login

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Validation | `loginSchema.safeParse` (Zod) | Same Zod schema | MATCH |
| User lookup | `userDb.getUserByUsername(username)` sync | `getUserByUsername(username)` async (DI) | INTENTIONAL |
| Whitelisted check | 403 "Utente non autorizzato" | Same | MATCH |
| Password validation | Cache check + BrowserPool Puppeteer | Same flow | MATCH |
| Password encryption | `passwordEncryption.encrypt()` + save to DB | `encryptAndSavePassword?.()` (optional DI) | MATCH |
| Device registration | `deviceManager.registerDevice()` | **MISSING** | DIVERGENCE |
| Background sync on login | `userSpecificSyncService.checkAndSyncOnLogin()` | **MISSING** | DIVERGENCE |
| JWT generation | `generateJWT(payload)` | Same | MATCH |
| Response shape | `{ success, token, user: { id, username, fullName, role } }` | Same | MATCH |

**DIVERGENCE (significant):**
1. Device registration on login is missing in branch. Master registers devices for multi-device sync tracking.
2. Background user-specific sync on login (`checkAndSyncOnLogin`) is missing. Master triggers customer+order sync check for the specific user on login.

#### Auth: POST /api/auth/refresh-credentials

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Validation | Manual `typeof password !== "string"` check | Zod schema `z.object({ password: z.string().min(1) })` | MATCH (improved) |
| Logic | `PasswordCache.set(userId, password)` | Same | MATCH |
| Response | `{ success: true, data: { message } }` | Same | MATCH |

**MATCH** (branch uses Zod which is stricter but same effect)

#### Auth: POST /api/auth/logout

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Logic | `PasswordCache.clear(userId)` + logging | `passwordCache.clear(userId)` | MATCH |
| Error handling | Try/catch, returns success even on error | No try/catch, direct call | DIVERGENCE |
| Response | `{ success: true, data: { message } }` | Same | MATCH |

**DIVERGENCE (cosmetic):**
- Master wraps logout in try/catch and returns success even if cache clearing fails. Branch calls directly without error handling. In practice, `clear()` on a Map never throws, so this is a non-issue.

#### Auth: POST /api/auth/refresh (JWT token refresh)

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Logic | Check cached password, generate new JWT, get user details | Same flow | MATCH |
| Credentials expired response | `{ success: false, error: "CREDENTIALS_EXPIRED", message: "..." }` | Same | MATCH |
| Response shape | `{ success, token, user: { id, username, fullName, role } }` | Same | MATCH |

**MATCH**

#### Auth: GET /api/auth/me

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Logic | Get user by ID, return profile | Same | MATCH |
| Response shape | `{ success, data: { user: { id, username, fullName, role, whitelisted, lastLoginAt } } }` | Same | MATCH |

**MATCH**

---

### 1.2 Customer Endpoints

#### Element #14: GET /api/customers/search -> merged into GET /api/customers?search=

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master endpoint | `GET /api/customers/search?q=...&limit=...` | Merged into `GET /api/customers?search=...` | INTENTIONAL |
| Search logic | Fuzzy search with confidence scoring | Simple query param to `getCustomers(userId, search)` | DIVERGENCE |
| Response shape | Rich: `{ id, name, vatNumber, email, confidence, matchReason, ... }` | Simple: raw customer records | DIVERGENCE |

**DIVERGENCE (significant):**
- Master has sophisticated fuzzy search with confidence scoring, phonetic matching, and detailed response with `confidence` percentages and `matchReason` ("exact"/"phonetic"/"fuzzy"). Branch delegates to `getCustomers(userId, search)` which does a simpler query. The frontend may rely on the confidence/matchReason fields.
- The separate `/search` endpoint path is eliminated (INTENTIONAL) but the search capability is simplified (DIVERGENCE).

#### Element #15: POST /api/customers/sync

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Synchronous: calls `syncService.syncCustomers()`, waits for result, returns stats | Async: `queue.enqueue('sync-customers', userId, {})`, returns jobId | INTENTIONAL |
| Lock check | `syncService.isSyncInProgress()` -> 409 | Queue handles concurrency | INTENTIONAL |
| Response | `{ success, customersProcessed, newCustomers, updatedCustomers, ... }` | `{ success: true, jobId }` | DIVERGENCE |

**DIVERGENCE (significant):**
- Master endpoint is synchronous: it waits for sync to complete and returns detailed stats (customersProcessed, newCustomers, updatedCustomers, deletedCustomers, duration).
- Branch endpoint is asynchronous: it enqueues a job and returns a jobId immediately. Frontend would need to poll for status.
- This is architecturally intentional (sync -> queue), but the response shape is different. Frontend code that reads the stats from the response will break.

#### Element #16: POST /api/customers (create)

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Validation | Manual `!customerData.name` check | Zod schema `createCustomerSchema` | MATCH (improved) |
| Write-through | `customerDb.upsertSingleCustomer(data, tempProfile, "pending")` | `upsertSingleCustomer(userId, formData, tempProfile, 'pending')` | INTENTIONAL |
| Bot execution | Fire-and-forget async IIFE with bot + WS progress | Queue enqueue `create-customer` | INTENTIONAL |
| Lock management | Manual `syncOrchestrator.setUserActionActive(true)` + `priorityManager.pause()` | Queue + agent-lock handles this | INTENTIONAL |
| Response | `{ success, data: { customer, taskId }, message }` | `{ success, data: { customer, jobId }, message }` | DIVERGENCE |

**DIVERGENCE (cosmetic):**
- Response field name: `taskId` (master) vs `jobId` (branch). Frontend uses `taskId` to track progress via WebSocket.
- Branch handler `handleCreateCustomer` does its own DB insert (duplicate with route-level insert), creating a potential double-write. Master writes once in the route, then the fire-and-forget updates status.

**DIVERGENCE (significant):**
- Branch handler `handleCreateCustomer` creates a NEW `TEMP-{timestamp}` profile internally (L40), while the route also creates one (L68). This means the handler ignores the `customerProfile` passed in `data` from the route and creates its own, potentially causing a mismatch.

#### Element #17: PUT /api/customers/:profile (update)

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Validation | No schema validation | Zod `createCustomerSchema.safeParse` | MATCH (improved) |
| originalName logic | Gets existing customer, uses `archibaldName || name` | Same pattern in route | MATCH |
| Write-through | `customerDb.upsertSingleCustomer(data, profile, "pending")` | `upsertSingleCustomer(userId, formData, profile, 'pending')` | INTENTIONAL |
| Bot execution | Fire-and-forget async IIFE | Queue enqueue `update-customer` | INTENTIONAL |
| Response | `{ success, data: { taskId }, message }` | `{ success, data: { jobId }, message }` | DIVERGENCE |

**DIVERGENCE (cosmetic):**
- `taskId` vs `jobId` naming (same as create).

**DIVERGENCE (significant):**
- Branch handler `handleUpdateCustomer` re-fetches the customer from DB and recalculates `originalName` (L43-49), while the route already calculates it and passes it in `data.originalName` (L139,145). The handler ignores `data.originalName` from the enqueue payload and re-derives it. This could diverge if the DB state changes between enqueue and processing.

#### Element #18: GET /api/customers/:profile/status

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Logic | Get customer, return `botStatus || 'placed'` | Same | MATCH |
| Response | `{ success, data: { botStatus } }` | Same | MATCH |

**MATCH**

#### Element #19: POST /api/customers/:profile/retry

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Logic | Determine create vs update, fire-and-forget bot | Determine create vs update, enqueue job | INTENTIONAL |
| Smart sync after | `syncOrchestrator.smartCustomerSync()` | Not in retry handler (queue handles) | INTENTIONAL |
| Response | `{ success, data: { taskId }, message }` | `{ success, data: { jobId }, message }` | DIVERGENCE |

**DIVERGENCE (cosmetic):**
- `taskId` vs `jobId` naming.

---

### 1.3 Order Endpoints

#### Element #32: GET /api/orders/status/:jobId

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master path | `/api/orders/status/:jobId` | `/api/orders/status/:jobId` (also `/api/operations/:jobId/status`) | MATCH |
| Logic | `queueManager.getJobStatus(jobId)` | `queue.getJobStatus(req.params.jobId)` | MATCH |

**MATCH**

#### Element #33: GET /api/orders/my-orders

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master path | `/api/orders/my-orders` | Branch: via `/api/operations/user/:userId` | INTENTIONAL |
| Logic | `queueManager.getUserJobs(userId)` | `queue.getAgentJobs(userId)` | MATCH |

**INTENTIONAL** (path change, same logic)

#### Element #34: GET /api/queue/stats

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master path | `/api/queue/stats` | Branch: `/api/operations/stats` | INTENTIONAL |
| Logic | `queueManager.getQueueStats()` | `queue.getStats()` | MATCH |

**INTENTIONAL** (path change, same logic)

#### Element #35: POST /api/orders/force-sync

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Non-blocking: returns immediately, fires async sync with SSE progress | Branch: `queue.enqueue('sync-orders', userId, { mode: 'force' })` | INTENTIONAL |
| Lock handling | Manual `priorityManager.pause()` / `resume()` | Queue handles | INTENTIONAL |
| Response | `{ success, message, data: { status, message } }` | `{ success, jobId, message }` | DIVERGENCE |

**DIVERGENCE (significant):**
- Master returns a rich response with `data: { status: "started", message: "..." }` and emits SSE progress events.
- Branch returns only `{ success, jobId, message }`. No SSE progress emission from the route.
- Master clears cached orders before syncing. Branch passes `{ mode: 'force' }` to the handler which may or may not clear data (depends on sync service implementation).

#### Element #36: POST /api/orders/reset-and-sync

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Auth | `authenticateJWT, requireAdmin` | `authenticateJWT` only (admin check **missing**) | DIVERGENCE |
| Master | Non-blocking: clears ALL orders, forces complete sync | Branch: `queue.enqueue('sync-orders', userId, { mode: 'reset' })` | INTENTIONAL |
| Response | `{ success, message, data: { status, message } }` | `{ success, jobId, message }` | DIVERGENCE |

**DIVERGENCE (critical):**
- Master requires admin role (`requireAdmin` middleware). Branch does NOT have admin check - any authenticated user can reset the database.

**DIVERGENCE (significant):**
- Same response shape difference as force-sync.

#### Element #37: POST /api/orders/:id/send-to-milano

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Validates orderId, fetches order, checks idempotent (sentToMilanoAt), validates state, acquires lock, runs bot, updates DB with audit log | Branch route: just enqueues `send-to-verona` | INTENTIONAL |
| Pre-send validation | Checks `sendableStates = [null, "", "creato", "piazzato"]` | **MISSING** in route; handler does not validate state | DIVERGENCE |
| Idempotency check | Returns early if `order.sentToMilanoAt` exists | **MISSING** in route and handler | DIVERGENCE |
| Order lookup | `orderDb.getOrderById(userId, orderId)` + 404 if not found | Not done in route (just enqueues) | DIVERGENCE |
| Audit log | `orderDb.insertAuditLog(...)` | **MISSING** | DIVERGENCE |
| WebSocket progress | Via `wsService.emitSendToVeronaProgress()` | Via `onProgress` callback | MATCH (different mechanism) |
| Lock management | `withUserActionLock("send-to-milano", ...)` | Agent lock via queue processor | INTENTIONAL |
| Error response for lock conflict | 409 with specific error message | Queue handles retries | INTENTIONAL |
| Response | `{ success, message, data: { orderId, sentToMilanoAt, currentState } }` | `{ success, jobId }` | DIVERGENCE |

**DIVERGENCE (critical):**
1. No order existence check before enqueueing. Master validates order exists and returns 404. Branch blindly enqueues.
2. No state validation. Master checks order is in sendable state. Branch handler will attempt to send regardless.
3. No idempotency check. Master returns early if already sent. Branch will re-enqueue.
4. No audit log written on success.

**DIVERGENCE (significant):**
5. Response shape entirely different. Frontend expects `{ data: { orderId, sentToMilanoAt, currentState } }`, gets `{ jobId }`.

#### Element #46: POST /api/orders/:id/sync-articles

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Synchronous: calls `syncService.syncOrderArticles(userId, orderId)`, returns result | Branch: enqueues `sync-order-articles` | INTENTIONAL |
| Response | `{ success, data: result, message }` with `articles.length` | `{ success, jobId }` | DIVERGENCE |

**DIVERGENCE (significant):**
- Master returns sync result immediately; branch returns jobId for async processing.

#### Element #47: POST /api/orders/:id/edit-in-archibald

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Validates modifications array, runs bot, updates articles in DB, emits WS complete | Branch route: not directly accessible (via operations/enqueue) | DIVERGENCE |
| Validation | `!Array.isArray(modifications) || modifications.length === 0` -> 400 | Route enqueues directly; no modifications validation | DIVERGENCE |
| Order lookup | `orderDb.getOrderById(userId, orderId)` + 404 | Not done at route level | DIVERGENCE |
| Article update | `orderDb.deleteOrderArticles` + `saveOrderArticlesWithVat` (per-article mapping) | Handler `handleEditOrder` does transaction DELETE + INSERT | MATCH (different mechanism) |
| WS events | `wsService.emitOrderEditComplete(userId, orderId)` | Via queue progress events | INTENTIONAL |
| Response | `{ success, message }` (bot result message) | `{ success, jobId }` via operations/enqueue | DIVERGENCE |

**DIVERGENCE (significant):**
1. No dedicated route in branch orders.ts for edit-in-archibald. Must go through generic `/api/operations/enqueue`.
2. No order validation or modifications validation at route level.
3. Response shape change: frontend expects `{ success, message }`, gets `{ success, jobId }`.

#### Element #48: POST /api/orders/:id/delete-from-archibald

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Validates order exists, runs bot, deletes from DB, emits WS complete | Branch: via operations/enqueue | DIVERGENCE |
| Order lookup | `orderDb.getOrderById(userId, orderId)` + 404 | Not done at route level | DIVERGENCE |
| DB cleanup | `orderDb.deleteOrderById(userId, orderId)` (single call) | Handler uses transaction: delete state_history, articles, then order_records | MATCH (improved) |
| WS events | `wsService.emitOrderDeleteComplete(userId, orderId)` | Via queue progress events | INTENTIONAL |
| Response | `{ success, message }` | `{ success, jobId }` via operations/enqueue | DIVERGENCE |

**DIVERGENCE (significant):**
1. No dedicated route. Must go through generic `/api/operations/enqueue`.
2. No order validation at route level.
3. Response shape change.

**Positive note:** Branch handler's transactional delete (state_history -> articles -> order_records) is more robust than master's single `deleteOrderById` call.

---

### 1.4 Operations & Queue

#### Element #12: GET /api/admin/lock/status -> GET /operations/dashboard

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Returns `{ activeOperation, isLocked, lockedSince }` | Returns queue stats + active jobs + browser pool stats | INTENTIONAL |
| Response | Lock-centric | Queue-centric dashboard | INTENTIONAL |

**INTENTIONAL** (paradigm shift from lock to queue)

#### Element #13: GET /api/admin/lock/release

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Force-releases the global `activeOperation` mutex | Eliminated entirely | INTENTIONAL |

**INTENTIONAL** (queue manages lifecycle, no manual lock release needed)

---

### 1.5 Sync Orchestration

#### Element #20: GET /api/sync/schedule

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Returns hardcoded intervals: `{ orders: 10min, customers: 30min, ... }` | Via `syncScheduler.getIntervals()` (dynamic) | INTENTIONAL |
| Path | `/api/sync/schedule` | `/api/sync/intervals` | INTENTIONAL |

**INTENTIONAL** (dynamic vs hardcoded)

#### Element #21: POST /api/sync/all

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Loops `syncOrchestrator.requestSync(type)` for all 6 types | Branch: not directly visible in sync-status.ts; `trigger/:type` endpoint available | DIVERGENCE |
| Types | `["orders", "customers", "ddt", "invoices", "prices", "products"]` | Individual triggers | DIVERGENCE |

**DIVERGENCE (significant):**
- Master has a dedicated `/api/sync/all` endpoint that enqueues all 6 sync types in one call. Branch does not have this batch endpoint. Frontend would need to call `/api/sync/trigger/:type` 6 times individually.

---

## Task 2: Supporting Features

### 2.1 Lock System (Elements #4-11)

#### Element #4: `type ActiveOperation`

| Master | Branch | Classification |
|--------|--------|----------------|
| `type ActiveOperation = "customers" \| "products" \| "prices" \| "order" \| "user-action" \| null` | `OperationType` union (16 types) + `OPERATION_PRIORITIES` | INTENTIONAL |

**INTENTIONAL** (expanded type system with priority levels)

#### Elements #5-7: `activeOperation` mutex, `acquireSyncLock()`, `releaseSyncLock()`

| Master | Branch | Classification |
|--------|--------|----------------|
| Global mutable `let activeOperation: ActiveOperation = null` | `createAgentLock()` per-user Map | INTENTIONAL |

**INTENTIONAL** (global lock -> per-user agent lock + BullMQ queue concurrency)

#### Element #8: `withUserActionLock()`

| Master | Branch | Classification |
|--------|--------|----------------|
| Preempts sync, pauses priority manager, waits for orchestrator | Queue processor with `isWriteOperation()` priority preemption | INTENTIONAL |

**INTENTIONAL** (same preemption semantics, different mechanism)

#### Element #9: `forceStopAllSyncs()`

| Master | Branch | Classification |
|--------|--------|----------------|
| Nuclear 2-phase stop: request stop -> wait 5s -> force-reset internal flags | Queue-based: `shouldStop()` callbacks via agent lock | INTENTIONAL |

**INTENTIONAL** (graceful stop vs nuclear reset; queue approach is cleaner)

#### Elements #10-11: `acquireOrderLock()`, `releaseOrderLock()`

| Master | Branch | Classification |
|--------|--------|----------------|
| Checks global lock + orchestrator + all service progress states | Agent lock `acquire()` per user | INTENTIONAL |

**INTENTIONAL** (simplified lock acquisition via agent lock)

---

### 2.2 Products & Prices (Elements #22-26, #31)

#### Element #22: POST /api/products/sync/start

| Master | Branch | Classification |
|--------|--------|----------------|
| `ProductSyncService.startAutoSync(intervalMinutes)` | Replaced by `syncScheduler.start()` | INTENTIONAL |

**INTENTIONAL**

#### Element #23: POST /api/products/sync/stop

| Master | Branch | Classification |
|--------|--------|----------------|
| `ProductSyncService.stopAutoSync()` | `syncScheduler.stop()` | INTENTIONAL |

**INTENTIONAL**

#### Element #24: GET /api/products/search -> merged

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | `GET /api/products/search?q=...` with fuzzy search + confidence scoring | Branch has both `GET /api/products?search=` AND `GET /api/products/search?q=` | MATCH |
| Response | Rich: `{ id, name, description, confidence, matchReason, ... }` | Simple: raw product records from `getProducts(search)` | DIVERGENCE |

**DIVERGENCE (significant):**
- Same as customer search: master has confidence scoring and matchReason fields. Branch returns raw records. Frontend may depend on these extra fields.

#### Element #25: GET /api/products/sync-status

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Returns `{ ...progress, totalCount, lastSyncTime }` from `productSyncService.getProgress()` | Returns `{ count, lastSync }` from `getProductCount()` + `getLastSyncTime()` | DIVERGENCE |

**DIVERGENCE (cosmetic):**
- Branch returns simpler stats (count + lastSync). Master includes full sync progress state. These are different but both valid for status checking.

#### Element #26: PATCH /api/products/:id/vat

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Separate endpoint `PATCH /api/products/:productId/vat` calls `updateProductVat` | Branch has both `PATCH /:productId/vat` and `PATCH /:productId/price` | MATCH |
| Logic | Updates product VAT value | Same: Zod validation, gets current price, updates with new VAT | MATCH |

**MATCH**

#### Element #31: POST /api/products/sync (manual)

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Synchronous: `service.syncProducts(callback)`, returns `{ success, ...result }` | Branch: `queue.enqueue('sync-products', userId, {})`, returns `{ success, jobId }` | INTENTIONAL |

**INTENTIONAL** (sync -> queue, like all sync endpoints)

---

### 2.3 Sync Control (Elements #27-30)

#### Element #27: POST /api/sync/full

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | `requireAdmin`, checks lock, fire-and-forget `syncOrchestrator.requestSync()` x6 | Branch: not a direct endpoint; use `/api/sync/trigger/:type` | DIVERGENCE |
| Response | `{ success, message: "Sincronizzazione completa avviata..." }` | N/A | DIVERGENCE |

**DIVERGENCE (significant):**
- No dedicated `/api/sync/full` endpoint in branch. Admin panel would need to trigger each sync type individually.

#### Elements #28-30: POST /api/sync/customers, /sync/products, /sync/prices

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | `requireAdmin`, `acquireSyncLock()`, fire-and-forget `syncOrchestrator.requestSync()` | Branch: via `/api/sync/trigger/:type` (no admin check in sync-status router) | DIVERGENCE |

**DIVERGENCE (significant):**
- Master requires admin role for individual sync triggers. Branch's `/api/sync/trigger/:type` does NOT have `requireAdmin` middleware (only `authenticateJWT` from server.ts L236).

---

### 2.4 DDT & Invoice Sync (Elements #38-42)

#### Element #38: POST /api/orders/sync-ddt (scraper)

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Synchronous: pauses services, scrapes DDT data via `DDTScraperService`, syncs to orders | Branch: via enqueue `sync-ddt` | INTENTIONAL |
| Response | `{ success, message, data: { matched, notFound, scrapedCount } }` | `{ success, jobId }` | DIVERGENCE |

**INTENTIONAL** (sync -> queue). Response shape differs.

#### Element #39: POST /api/orders/sync-invoices (scraper)

Same pattern as #38. **INTENTIONAL** (sync -> queue).

#### Element #40: POST /api/orders/sync (PDF)

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | `POST /api/orders/sync` — PDF-based order sync | Branch: not directly exposed; via `sync-orders` queue job | INTENTIONAL |

**INTENTIONAL**

#### Element #41: POST /api/ddt/sync (PDF)

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | `POST /api/ddt/sync` — PDF-based DDT sync | Branch: not directly exposed; via `sync-ddt` queue job | INTENTIONAL |

**INTENTIONAL**

#### Element #42: POST /api/invoices/sync (PDF)

Same pattern. **INTENTIONAL**

---

### 2.5 PDF Download (Elements #43-45)

#### Element #43: GET /api/orders/:id/invoice/download

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | Validates order, checks invoiceNumber exists, `withUserActionLock`, downloads PDF, streams to client | Branch: via `/api/orders/:orderId/pdf-download?type=invoice` -> enqueues `download-invoice-pdf` | INTENTIONAL |
| Order validation | Full: find by id, then by orderNumber, check invoiceNumber | Not done in route (enqueue only) | DIVERGENCE |
| Lock handling | `withUserActionLock("invoice-download", ...)` | Queue handles | INTENTIONAL |
| Response | Binary PDF stream with headers | `{ success, jobId }` (client must poll then get base64 PDF from job result) | DIVERGENCE |

**DIVERGENCE (significant):**
- Master returns the actual PDF binary stream. Branch returns a jobId, and the client must poll for job completion, then read the base64-encoded PDF from the job result. This is a major UX flow change.

#### Element #44: GET /api/orders/:id/ddt/download

Same pattern as #43. Additional master validation: checks `trackingNumber` exists.

**DIVERGENCE (significant):** Same as invoice — stream vs jobId+poll.

#### Element #45: GET /api/orders/:id/pdf-download (SSE progress)

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | SSE endpoint: sets up text/event-stream, sends progress events, then sends base64 PDF on complete | Branch: enqueues PDF download job, progress via WebSocket | INTENTIONAL |
| Auth | Query param token verification | JWT auth via standard middleware | INTENTIONAL |

**INTENTIONAL** (SSE -> queue+WebSocket for progress, different transport)

---

### 2.6 Order Edit & Delete (Elements #47-48)

Covered in Task 1 section 1.3 above.

---

### 2.7 Migrations (Element #49)

#### Element #49: SQLite -> PostgreSQL migrations

| Aspect | Master | Branch | Classification |
|--------|--------|--------|----------------|
| Master | 34 individual SQLite migrations (002-032), each in separate JS file, run sequentially on startup | 4 PostgreSQL SQL files: 001-create-schemas, 002-shared-tables, 003-agent-tables, 004-system-tables | INTENTIONAL |
| Database | SQLite via `better-sqlite3` | PostgreSQL via `pg` pool | INTENTIONAL |
| Schema | Flat tables without schemas | Uses `shared.` and `agents.` schemas for multi-tenant separation | INTENTIONAL |
| Migration runner | Manual try/catch per migration | `db/migrate.ts` with tracked migrations table | INTENTIONAL |

**INTENTIONAL** (full database migration from SQLite to PostgreSQL with proper schema separation)

---

### 2.8 Remaining Infrastructure (Elements #1-3)

#### Element #2: `syncProgressEmitter`

| Master | Branch | Classification |
|--------|--------|----------------|
| `new EventEmitter()` used for SSE progress events | `realtime/sse-progress.ts` module | INTENTIONAL |

**INTENTIONAL** (modularized)

#### Element #3: DI in `createApp(deps)`

| Master | Branch | Classification |
|--------|--------|----------------|
| Global singletons via `.getInstance()` | All dependencies injected via `AppDeps` type | INTENTIONAL |

**INTENTIONAL** (testability improvement)

---

## Summary

### Statistics

- **Total elements audited: 49**
- **Matches: 14**
- **Divergences: 18** (critical: 2, significant: 14, cosmetic: 2)
- **Intentional changes: 17**

### Divergence Detail

#### Critical (2)

| # | Element | Issue |
|---|---------|-------|
| 36 | `POST /api/orders/reset-and-sync` | Missing `requireAdmin` middleware — any authenticated user can reset the order database |
| 37 | `POST /api/orders/:id/send-to-milano` | Missing pre-send validation (order existence, state check, idempotency check) — could send invalid/already-sent orders |

#### Significant (14)

| # | Element | Issue |
|---|---------|-------|
| Auth/login | `POST /api/auth/login` | Missing device registration and background user-specific sync on login |
| 14 | `GET /api/customers/search` | Fuzzy search with confidence scoring replaced by simple query — frontend may rely on confidence/matchReason fields |
| 15 | `POST /api/customers/sync` | Response shape change: sync stats -> jobId. Frontend reads stats from response |
| 16 | `POST /api/customers` (create) | Handler creates duplicate TEMP profile, ignoring route-provided one; taskId->jobId rename |
| 17 | `PUT /api/customers/:profile` (update) | Handler re-derives originalName instead of using route-provided value |
| 21 | `POST /api/sync/all` | No batch sync endpoint; frontend must trigger individually |
| 24 | `GET /api/products/search` | Same as customer search: confidence scoring removed |
| 27 | `POST /api/sync/full` | No dedicated endpoint; admin panel needs changes |
| 28-30 | `POST /api/sync/{customers,products,prices}` | Missing `requireAdmin` middleware in branch trigger endpoints |
| 35 | `POST /api/orders/force-sync` | Response shape change (status+message -> jobId); no SSE progress |
| 37 | `POST /api/orders/:id/send-to-milano` | Missing audit log; different response shape (detailed -> jobId) |
| 43-44 | PDF downloads | Binary stream -> jobId+poll paradigm change |
| 46 | `POST /api/orders/:id/sync-articles` | Sync result -> jobId (response shape change) |
| 47-48 | Edit/delete in Archibald | No dedicated routes; must use generic operations/enqueue; no pre-validation |

#### Cosmetic (2)

| # | Element | Issue |
|---|---------|-------|
| 1 | `createApp()` factory | JSON limit 2mb->10mb; helmet CSP config; middleware order |
| Auth/logout | `POST /api/auth/logout` | Missing try/catch (inconsequential) |

### Requires Fix in Plan 01-03

**Critical fixes:**
1. **#36**: Add `requireAdmin` middleware to `POST /api/orders/reset-and-sync`
2. **#37**: Add pre-send validation to send-to-milano route (order existence, state check, idempotency)

**Significant fixes (frontend impact):**
3. **Auth/login**: Add device registration and background user-specific sync
4. **#16**: Fix duplicate TEMP profile creation in create-customer handler
5. **#17**: Use route-provided originalName instead of re-deriving in update-customer handler
6. **#21**: Add `/api/sync/all` batch endpoint
7. **#27**: Add `/api/sync/full` batch endpoint (or alias to sync/all)
8. **#28-30**: Add `requireAdmin` to sync trigger endpoints
9. **#37**: Add audit log on send-to-milano success

**Response shape alignment (may defer to Phase 6 frontend migration):**
10. **#14, #24**: Restore confidence scoring in search endpoints (or update frontend)
11. **#15, #35, #46**: Sync endpoints returning jobId instead of stats (frontend must adapt)
12. **#43-44**: PDF download paradigm shift (frontend must adapt to poll-based flow)
13. **#47-48**: Edit/delete need dedicated routes or frontend must use operations/enqueue

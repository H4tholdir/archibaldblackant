# Production State: Archibald Black Ant PWA

**Document created:** 2026-02-21
**Milestone:** Archibald Stabilization (complete)
**Phases executed:** 10/10 (33 plans total)

---

## Overview

The Archibald Black Ant PWA underwent a comprehensive 10-phase stabilization milestone to fix all bugs identified from a deep code review (23 bugs, 10 orphan files), implement all actively-used stubs, and add a complete automated test suite. The work spanned cleanup, operation queue fixes, browser pool hardening, sync scheduler, WebSocket events, data integrity, missing features, unit/integration tests, E2E tests, and final verification.

**Current deployment:** Production VPS at `formicanera.com` (Hetzner, 91.98.136.198)
**Domain:** formicanera.com with SSL (Let's Encrypt, valid until 2026-04-17)
**Status:** All 7 Docker containers running and healthy, all tests passing

---

## Architecture

| Layer | Technology | Details |
|-------|-----------|---------|
| Frontend | React 19 PWA (Vite + TypeScript) | 13 pages, offline-capable, mobile-first |
| Backend | Express + Puppeteer + BullMQ | Headless Chrome automation against Archibald ERP |
| Database | PostgreSQL 16 | 3 schemas (shared, agents, system), 10 migrations |
| Queue | BullMQ + Redis 7 | 15 operation types, per-user concurrency, native deduplication |
| Real-time | WebSocket server | Multi-device sync, 9+ event types, standardized message format |
| Proxy | Nginx | SSL termination, rate limiting, reverse proxy |
| Monitoring | Prometheus + Grafana | Metrics collection (port 9090), visualization (port 3001) |
| Deploy | Docker Compose | 7 containers on Hetzner VPS |

---

## What Was Accomplished (by Phase)

### Phase 1: Cleanup & Dead Code Removal
- Removed 19 orphan frontend files, 35 root clutter files, 28 orphan .planning files
- Fixed naming inconsistency `sentToMilanoAt` to `sentToVeronaAt` (code + DB migration 005)
- Renamed `.test.ts` to `.spec.ts` for consistency
- Cleaned dead exports, legacy localStorage keys
- Updated .gitignore with artifact patterns

### Phase 2: Operation Queue Core Fixes
- Wired AbortSignal through entire handler stack for responsive preemption
- Fixed preemption race condition (wait for actual stop, not fixed 2s timeout)
- Added handler timeout via `Promise.race` against abort rejection
- Replaced broken timestamp-based idempotencyKey with BullMQ native deduplication
- Added `shouldStop()` check every 10 records in all 6 sync service DB loops

### Phase 3: Browser Pool & Concurrency
- Fixed browser pool eviction to protect in-use contexts
- Worker concurrency set to 10 with exponential backoff (2s-30s) on lock contention
- Created `bot_results` table for compensating transactions (check-save-clear pattern)
- Protected 4 handlers (submit-order, send-to-verona, create-customer, delete-order) from post-bot DB failure duplicates

### Phase 4: Sync Scheduler & Auto-Sync
- Created sync settings persistence layer (migration 007, repository CRUD)
- Refactored scheduler to per-type intervals with async agent registry
- Bootstrap auto-start from DB-stored intervals
- Protected customer sync from parser failures (count validation gate)
- Warning monitoring API for admin visibility

### Phase 5: WebSocket & Real-time Events
- Emitted PENDING_CREATED/UPDATED/DELETED/SUBMITTED from pending-orders routes
- Emitted JOB_STARTED/PROGRESS/COMPLETED/FAILED from operation-processor
- Extended OperationHandler with optional `onEmit` callback for domain-specific events
- submit-order emits PENDING_SUBMITTED and ORDER_NUMBERS_RESOLVED after transaction
- Standardized all events to `{ type, payload, timestamp }` format

### Phase 6: Data Integrity & Hardening
- Fixed IVA data flow (products.service.ts shape mismatch), removed dead VAT calculation code
- Standardized all hashing to SHA-256 (eliminated MD5 from price-sync, order-sync, orders repo)
- Added parseInt validation with isNaN on all route query params
- Installed express-rate-limit with 3 tiers (global 500/min, strict 20/min, auth 15/15min)
- Replaced in-memory PDF Map with filesystem store (TTL cleanup, 2h max age)

### Phase 7: Missing Feature Implementation
- Wired all 13 actively-used stubs to real implementations (zero stubs deferred)
- Group A: createCustomerBot, exportArca, importArca, getNextFtNumber
- Group B: subclients CRUD + Excel import (migration 009)
- Group C: warehouse importExcel, prices importExcel, clearSyncData, validateArticle
- Fixed query param and response shape mismatches for frontend-backend alignment

### Phase 8: Unit & Integration Tests
- Unit tests for operation processor (preemption, shouldStop, timeout, lock acquire/release)
- Unit tests for agent lock (acquire, release, setStopCallback, preemptable detection)
- Unit tests for sync handlers (shouldStop interruption, progress callbacks, error handling)
- Integration tests for WebSocket events (emit + receive)
- Integration tests for 4 sync services against real PostgreSQL
- Created test DB infrastructure (setupTestDb, truncateAllTables, destroyTestDb)

### Phase 9: E2E Tests & VPS Validation
- Setup Playwright for remote VPS testing
- E2E login flow (login, PIN setup, unlock, target wizard, logout)
- E2E order flow (create, modify, delete, send to Verona)
- E2E multi-device sync (dual browser contexts, WebSocket real-time)
- Fixed dual rate limiting issue (Nginx + Express)
- Created auth-guard and rate-limit E2E helpers

### Phase 10: Final Review & Stabilization
- Fixed 7 failing auth.spec.ts tests (now use real JWT tokens)
- Full verification: all type checks pass, all 1324 unit tests pass, all 35 E2E tests pass
- Infrastructure audit: all 7 Docker containers healthy, PostgreSQL/Redis responding, SSL valid, no errors in logs

---

## Test Coverage

### Backend Unit Tests: 921 tests (68 files)

| Area | Files | Coverage |
|------|-------|----------|
| Routes | admin, auth, customers, fresis-history, operations, orders, pending-orders, prices, products, share, sse-progress, subclients, sync-status, users, warehouse, widget, customer-interactive | HTTP handlers, request validation, response shapes |
| Operations | operation-processor, operation-queue, operation-types, agent-lock, bot-result-store | Preemption, deduplication, lock management, recovery |
| Handlers | submit-order, send-to-verona, create-customer, delete-order, edit-order, update-customer, download-ddt-pdf, download-invoice-pdf, sync-customers, sync-orders, sync-order-articles, sync-prices, sync-products | Bot interaction, DB transactions, event emission |
| Sync Services | customer-sync, order-sync, ddt-sync, invoice-sync, product-sync, price-sync | Hash comparison, shouldStop, DB upsert/delete |
| Infrastructure | browser-pool, config, migrate, pool, pdf-store, sync-scheduler, sync-settings, websocket-server, interactive-session-manager | Connection pooling, migration, scheduling |
| Parsers | pdf-parser-service, pdf-parser-products-service, parse-indirizzo-iva, subclient-parser, arca-export-service, arca-import-service | PDF parsing, Excel parsing, data export |
| Utilities | cycle-size-warning, ft-counter, variant-selection, server, widget-calculations | Business logic, calculations |

### Backend Integration Tests: 22 tests (5 files)

| File | Tests | Coverage |
|------|-------|----------|
| customer-sync.integration.spec.ts | 5 | Insert, hash-unchanged skip, hash-changed update, deletion, shouldStop |
| order-sync.integration.spec.ts | 4 | Insert, hash-match skip, stale delete with cascade, hash-based update |
| product-sync.integration.spec.ts | 4 | Insert, always-update behavior, modified upsert, no deletion |
| price-sync.integration.spec.ts | 4 | Insert, hash-unchanged skip, composite key update, multi-price |
| websocket-server.integration.spec.ts | 5 | WebSocket event emit + receive |

*Note: Integration tests require a running PostgreSQL instance (archibald_test DB) and are excluded from the standard unit test run.*

### Frontend Unit Tests: 403 tests (30 files)

| Area | Files | Coverage |
|------|-------|----------|
| Components | CustomerSelector, DiscountSystem, EntityBadge, HighlightText, OrderItemsList, OrderSummary, OrderTimeline, OrderTracking, PendingOrdersPage, ProductSelector, QuantityInput, SendToVeronaModal | React component rendering, user interactions |
| Services | customers.service, operations, orders.service, prices.service, products.service | API layer, data transformation |
| Business Logic | arca-document-generator, arca-totals, format-currency, fresis-constants, fresisHistoryFilters, order-calculations, order-merge, orderGrouping, orderStatus, revenue-calculation, vat-utils, warehouse-matching | Calculations, formatting, filtering |
| Security | credential-store | Encrypted credential storage |

### E2E Tests (Playwright): 35 tests (7 test files + 1 setup)

| File | Tests | Coverage |
|------|-------|----------|
| auth.setup.ts | 1 | Authentication state setup |
| login-flow.spec.ts | 3 | Login, PIN setup, unlock |
| navigation.spec.ts | 11 | Page navigation, route access |
| data-pages.spec.ts | 5 | Data display pages |
| order-flow.spec.ts | 3 | Create, modify, delete orders |
| pending-realtime.spec.ts | 5 | Real-time pending order updates |
| multi-device-sync.spec.ts | 3 | Multi-device WebSocket sync |
| pwa-orientation.spec.ts | 4 | PWA orientation and display |

### Test Totals

| Category | Tests | Files |
|----------|-------|-------|
| Backend unit | 921 | 68 |
| Backend integration | 22 | 5 |
| Frontend unit | 403 | 30 |
| E2E (Playwright) | 35 | 8 |
| **Total** | **1381** | **111** |

---

## Services & Endpoints

### API Endpoint Groups

| Route | Auth | Description |
|-------|------|-------------|
| `GET /api/health` | No | Health check (registered before rate limiting) |
| `GET /api/websocket/health` | JWT + Admin | WebSocket server statistics |
| `/api/auth/*` | Mixed | Login, logout, refresh token, refresh credentials, user info |
| `/api/customers/*` | JWT | Customer CRUD, photos, bot status, sync |
| `/api/customers/interactive/*` | JWT | Interactive customer creation via bot sessions |
| `/api/products/*` | JWT | Product search, variants, price updates, changes |
| `/api/prices/*` | JWT | Price lookup, history, Excel import |
| `/api/orders/*` | JWT | Order list, details, articles, state history, sales history |
| `/api/pending-orders/*` | JWT | Pending order CRUD with WebSocket broadcast |
| `/api/warehouse/*` | JWT | Box management, items, barcode scanning, Excel import, validation |
| `/api/fresis-history/*` | JWT | Fresis history, discounts, Arca export/import, FT numbering |
| `/api/sync/*` | JWT | Sync status, scheduler control, interval config, clear data, SSE progress |
| `/api/admin/*` | JWT + Admin | User management, targets, job management, subclient import |
| `/api/widget/*` | JWT | Dashboard data, order period data, exclusions |
| `/api/metrics/*` | JWT | Budget metrics, order metrics |
| `/api/users/*` | JWT | User target settings, privacy settings |
| `/api/subclients/*` | JWT | Subclient search, lookup, delete |
| `/api/share/*` | Mixed | PDF upload/download, email, Dropbox share |
| `/api/operations/*` | JWT | Operation queue management, stats |

### WebSocket

| Endpoint | Protocol | Description |
|----------|----------|-------------|
| `/ws/` | WebSocket | Multi-device real-time sync |

### WebSocket Event Types

- `PENDING_CREATED` - New pending order created
- `PENDING_UPDATED` - Pending order modified
- `PENDING_DELETED` - Pending order deleted
- `PENDING_SUBMITTED` - Pending order submitted to Archibald
- `JOB_STARTED` - Operation job started processing
- `JOB_PROGRESS` - Operation job progress update
- `JOB_COMPLETED` - Operation job completed
- `JOB_FAILED` - Operation job failed
- `ORDER_NUMBERS_RESOLVED` - Order numbers assigned after submission

---

## Infrastructure Configuration

### Rate Limiting

| Layer | Scope | Limit |
|-------|-------|-------|
| Nginx | API routes | 30 req/s (burst=50) |
| Nginx | Login | 5 req/min (burst=3) |
| Express | Global `/api` | 500 req/60s (configurable via `RATE_LIMIT_GLOBAL_MAX`) |
| Express | Operations/Sync/PDF | 20 req/60s |
| Express | Auth login | 15 req/15min |

### SSL

- Provider: Let's Encrypt (auto-renewal)
- Current certificate: Valid 2026-01-17 to 2026-04-17
- DH parameters: Custom dhparam.pem for enhanced SSL

### Docker Services (7 containers)

| Container | Image | Purpose |
|-----------|-------|---------|
| archibald-backend | Custom (Node.js + Puppeteer) | Express API server + headless Chrome |
| archibald-frontend | Custom (React PWA + Nginx) | Static PWA serving |
| archibald-nginx | nginx:alpine | Reverse proxy, SSL termination, rate limiting |
| archibald-postgres | postgres:16-alpine | Primary database (3 schemas, 10 migrations) |
| archibald-redis | redis:7-alpine | BullMQ job queue, AOF persistence |
| archibald-prometheus | prom/prometheus:latest | Metrics collection (30-day retention) |
| archibald-grafana | grafana/grafana:latest | Metrics visualization dashboards |

### Database

- PostgreSQL 16 with 3 schemas: `shared` (products, prices), `agents` (per-user data), `system` (config, sync settings)
- 10 migrations (001-create-schemas through 010-product-sync-columns)
- Parameterized queries throughout (no SQL injection)
- Connection pooling via `pg` Pool

### Automated Maintenance

- Daily Docker cleanup (image/cache pruning)
- Disk monitoring (55% used, 33G available of 75G)
- PDF store TTL cleanup (2h max age, 30min interval)
- Redis AOF persistence for job queue durability

---

## Known Limitations

| Item | Severity | Status |
|------|----------|--------|
| ~50 unused type exports (from Knip report) | Cosmetic | Deferred (no runtime impact) |
| Frontend `fetchWithRetry` does not handle 429 responses | Low | Mitigated by E2E auth-guard pattern; Nginx + Express rate limits prevent most 429s |
| Backend integration tests require local PostgreSQL | Dev workflow | Expected; tests designed for CI or test DB environments |
| SSE progress endpoint (`onJobEvent`) returns no-op | Low | WebSocket provides real-time progress; SSE is vestigial |
| Docker disk usage accumulates | Low | Automated daily cleanup in place; 64% of images reclaimable |
| SSL certificate renewal needs monitoring | Low | Auto-renewed by Let's Encrypt; expires 2026-04-17 |
| Product sync has no hash-based deduplication | Low | Always UPDATEs existing products; functional but slightly less efficient |

---

## Monitoring

| Tool | URL/Port | Purpose |
|------|----------|---------|
| Health endpoint | `GET /api/health` | Basic liveness check (`{"status":"ok"}`) |
| WebSocket health | `GET /api/websocket/health` | Connection stats (admin only) |
| Prometheus | Port 9090 | Metrics collection, 30-day retention |
| Grafana | Port 3001 | Metrics visualization dashboards |
| Docker logs | `docker logs archibald-backend` | Application logging |
| Sync monitoring | `GET /api/sync/monitoring` | Sync status, warnings, history |

---

## Execution Summary

| Metric | Value |
|--------|-------|
| Total phases | 10 |
| Total plans executed | 33 |
| Total execution time | ~177 min |
| Average plan duration | 5.5 min |
| Total tests | 1381 (921 backend unit + 22 backend integration + 403 frontend unit + 35 E2E) |
| Total test files | 111 |
| Bugs fixed | 23+ (original 23 + regressions found during testing) |
| Stubs eliminated | 13/13 |
| Orphan files removed | 82+ |
| Database migrations added | 6 (005-010) |

---

*Milestone: Archibald Stabilization - Complete*
*Date: 2026-02-21*

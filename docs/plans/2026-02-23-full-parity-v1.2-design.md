# v1.2 Full Parity Design — Closing All 25 Gaps

**Date:** 2026-02-23
**Status:** Approved
**Scope:** Fix all remaining gaps between master and feat/unified-operation-queue branch

## Problem

The branch `feat/unified-operation-queue` successfully migrated the architecture (PostgreSQL, modular routes, operation queue, DI pattern, 1720 tests passing), but 25 functional gaps remain where master has working functionality and the branch has stubs, missing endpoints, or removed infrastructure.

## Gap Inventory

### A. Stubs in server.ts (13)

| # | Component | Current Stub | Required Implementation |
|---|-----------|-------------|------------------------|
| 1 | Subclients | `getAllSubclients → []` | PostgreSQL repository query |
| 2 | Subclients | `searchSubclients → []` | Search by nome/codice/ragione_sociale |
| 3 | Subclients | `getSubclientByCodice → null` | Lookup by primary key |
| 4 | Subclients | `deleteSubclient → false` | Delete from DB |
| 5 | Admin | `importSubclients → {imported:0}` | Parse Excel, bulk upsert |
| 6 | Prices | `getImportHistory → []` | Query excel_vat_imports table |
| 7 | Prices | `importExcel → "Not implemented"` | Match products, update VAT/prices |
| 8 | Admin | `createAdminSession → 0` | Create impersonation session |
| 9 | Admin | `closeAdminSession → {}` | Cleanup session |
| 10 | Fresis | `exportArca → empty Buffer` | Generate ZIP with Arca documents |
| 11 | Fresis | `importArca → {imported:0}` | Parse ZIP, import records |
| 12 | Fresis | `getNextFtNumber → 1` | Query max FT number + 1 |
| 13 | SSE | `onJobEvent → () => {}` | Register real-time event callback |

### B. Frontend Endpoints Without Backend (3)

| # | Endpoint | Issue |
|---|----------|-------|
| 14 | `POST /api/fresis-history/reassign-merged` | Not implemented |
| 15 | `PUT /api/fresis-history/:id` | Not implemented |
| 16 | `POST /api/fresis-history/archive` | Partially implemented |

### C. Missing Infrastructure (4)

| # | Gap | Impact |
|---|-----|--------|
| 17 | No bootstrap entry point | App cannot start in production |
| 18 | No migration runner on startup | DB not initialized |
| 19 | No graceful shutdown | Jobs lost on restart |
| 20 | No background service init | No auto-sync |

### D. Sync System (3)

| # | Gap | Master Had |
|---|-----|-----------|
| 21 | No sync checkpoint/resume | Page-level resume with 1h/24h thresholds |
| 22 | No retry with backoff | 3 attempts with exponential backoff |
| 23 | No delta sync endpoints | `/api/cache/delta`, `/api/cache/version` |

### E. Minor Features (2)

| # | Gap |
|---|-----|
| 24 | No fresis discount bulk upload |
| 25 | No slowdown optimizer |

## Solution: 6 Phases, 11 Plans

### Phase 11: Bootstrap & Production Entry Point
Create `main.ts` that instantiates all dependencies, calls `createApp()`, starts HTTP server, runs migrations, initializes background services, handles graceful shutdown.

**Plans:**
- 11-01: main.ts entry point (pool, queue, browserPool, scheduler, createApp, listen, shutdown)
- 11-02: Migration runner on startup + background services init (sync scheduler, session cleanup, auto-sync)

**Gaps covered:** 17, 18, 19, 20

### Phase 12: Subclient System
Port master's subclient-db.ts (15 fields, bulk upsert, search) and subclient-excel-importer.ts (code normalization, header mapping) to PostgreSQL repository pattern.

**Plans:**
- 12-01: Subclient PostgreSQL repository + wire stubs in server.ts
- 12-02: Subclient Excel importer (normalizeSubClientCode, header mapping, bulk upsert/delete)

**Gaps covered:** 1, 2, 3, 4, 5

### Phase 13: Fresis History Completion
Implement remaining fresis functionality: Arca export/import, FT numbering, missing endpoints, discount bulk upload.

**Plans:**
- 13-01: getNextFtNumber + exportArca + importArca implementations
- 13-02: Missing endpoints (reassign-merged, PUT /:id, archive) + discount bulk upload

**Gaps covered:** 10, 11, 12, 14, 15, 16, 24

### Phase 14: Price/VAT Excel Import
Port master's ExcelVatImporter with product matching (ID + Codice Articolo fallback), VAT propagation to sibling variants, audit logging, import history.

**Plans:**
- 14-01: Excel VAT importer + import history tracking

**Gaps covered:** 6, 7

### Phase 15: Admin Session & SSE
Implement admin impersonation sessions and SSE job event real-time callbacks.

**Plans:**
- 15-01: createAdminSession/closeAdminSession + onJobEvent SSE wiring

**Gaps covered:** 8, 9, 13

### Phase 16: Sync Enhancements
Restore sync system features: checkpoint/resume, retry, delta sync, optimizer, smart variants.

**Plans:**
- 16-01: Sync checkpoint repository with page-level resume (1h/24h thresholds)
- 16-02: Product sync retry + delta sync endpoints
- 16-03: Slowdown optimizer + smart sync variants

**Gaps covered:** 21, 22, 23, 25

## Dependencies

```
Phase 11 (Bootstrap) ← MUST BE FIRST (everything depends on it)
Phase 12-15 ← Independent, any order
Phase 16 ← After Phase 11 (needs running sync scheduler)
```

## Success Criteria

- All 13 stubs in server.ts replaced with real implementations
- All 3 frontend endpoints have working backend handlers
- App starts in production with `node dist/server.js`
- Graceful shutdown drains jobs and closes connections
- Migrations run automatically on startup
- Background sync services auto-start
- All existing tests still pass (1720 baseline)
- New tests for every new implementation

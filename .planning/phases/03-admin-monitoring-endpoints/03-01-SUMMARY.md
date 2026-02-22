---
phase: 03-admin-monitoring-endpoints
plan: 01
subsystem: api
tags: [sync, quick-check, frequency, intervals, admin]
---

# 03-01 SUMMARY: Quick-Check & Sync Frequency Endpoints

## Completed: 2026-02-23
## Duration: ~8min
## Commit: 1582235 (feat/unified-operation-queue)

## What Was Done

### Task 1: Implement GET /sync/quick-check and POST /sync/frequency

**Files changed:**
- `archibald-web-app/backend/src/routes/sync-status.ts` — Added `createQuickCheckRouter` (public, no auth) and `POST /frequency` (requireAdmin)
- `archibald-web-app/backend/src/server.ts` — Wired quick-check router on public `/api/sync` path, separate from authenticated sync routes
- `archibald-web-app/backend/src/db/repositories/customers.ts` — Added `getGlobalCustomerCount` and `getGlobalCustomerLastSyncTime` (userId-agnostic queries)

**Key decisions:**
- Quick-check is mounted as a separate router (`createQuickCheckRouter`) on `/api/sync` WITHOUT `authenticateJWT`, since it's called on app startup before login
- The authenticated `createSyncStatusRouter` is mounted on the same `/api/sync` prefix but WITH `authenticateJWT`
- Created global (non-user-scoped) customer count/lastSync queries because the PostgreSQL branch has user-scoped customer data, but quick-check needs system-wide totals
- Product queries are already global (shared.products table), so no new product repo functions needed

**Endpoints added:**
1. `GET /api/sync/quick-check` — No auth. Returns `needsSync`, `needsInitialSync`, per-type breakdown (customers/products count, lastSync, needsSync). Uses 1-hour staleness threshold.
2. `POST /api/sync/frequency` — requireAdmin. Body: `{ intervalMinutes: 5-1440 }`. Restarts sync scheduler with new interval.

**Existing endpoints hardened:**
3. `GET /api/sync/intervals` — Added `requireAdmin` guard (was previously unprotected)
4. `POST /api/sync/intervals/:type` — Added `requireAdmin` guard (was previously unprotected)

### Task 2: Tests

**File:** `archibald-web-app/backend/src/routes/sync-status.spec.ts`

**Tests added (19 new, 47 total in file):**
- Quick-check: needsSync=false when recent, needsInitialSync=true when counts=0, needsSync=true when stale, null lastSync handling, ISO string formatting, no auth required, 501 when unconfigured, 500 on DB error
- Frequency: valid interval 200, non-admin 403, below minimum 400, above maximum 400, missing body 400, boundary values (5, 60, 720, 1440)
- Intervals: added requireAdmin 403 tests for GET and POST

**Build results:**
- TypeScript: Clean (0 errors)
- Tests: 815 passed, 12 skipped, 1 pre-existing failure (pending-orders unrelated)

## Deviations

- Plan mentioned adding frequency to admin.ts or sync-status.ts. Added to sync-status.ts since it's sync-related and the router already has the syncScheduler dependency.
- Plan mentioned verifying intervals have requireAdmin. They did NOT have it — so we added it (this was a security fix).
- Quick-check needed global customer queries (not user-scoped) due to PostgreSQL multi-tenant schema. Added `getGlobalCustomerCount` and `getGlobalCustomerLastSyncTime` to customers repo.

# Phase 13 Plan 02: Missing Endpoints (PUT, reassign-merged, archive) Summary

**Implemented 3 missing fresis-history endpoints closing gaps #14, #15, #16 from v1.2 audit.**

## Timing

- Start: 2026-02-23T21:24:18Z
- End: 2026-02-23T21:29:09Z
- Duration: ~5 min

## Accomplishments

- Added `updateRecord` repository function with camelCase-to-snake_case field mapping, whitelist validation, and user isolation
- Added `reassignMerged` repository function for bulk merged_into_order_id reassignment
- Added PUT /:id route handler for partial record update
- Added POST /reassign-merged route handler for merged order ID reassignment
- Added POST /archive route handler for creating fresis history records from pending orders
- Updated FresisHistoryRouterDeps type with updateRecord and reassignMerged
- Wired new deps in server.ts
- Verified frontend API compatibility (all 3 endpoints match frontend contracts)

## Files Created/Modified

- `archibald-web-app/backend/src/db/repositories/fresis-history.ts` - Added updateRecord, reassignMerged, CAMEL_TO_SNAKE mapping
- `archibald-web-app/backend/src/db/repositories/fresis-history.spec.ts` - 12 new repository tests
- `archibald-web-app/backend/src/routes/fresis-history.ts` - 3 new route handlers + updated deps type
- `archibald-web-app/backend/src/routes/fresis-history.spec.ts` - 9 new route tests
- `archibald-web-app/backend/src/server.ts` - Wired updateRecord and reassignMerged deps

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 2175fc4 | feat(13-02): add updateRecord and reassignMerged repository functions |
| 2 | 1418365 | feat(13-02): add PUT /:id, POST /reassign-merged, POST /archive endpoints |

## Decisions Made

- updateRecord uses a CAMEL_TO_SNAKE whitelist map to prevent SQL injection and only allows known columns
- JSONB columns (items, sub_client_data, arca_data) are JSON.stringified before update
- updateRecord returns null early (without querying) when no valid fields are provided
- Route order: POST /reassign-merged and POST /archive placed BEFORE parameterized /:id routes to prevent Express route shadowing
- POST /archive reuses existing upsertRecords dep (no new repository function needed)
- POST /archive fetches records back via getById after upsert to return full records to frontend

## Issues Encountered

- None significant. One test needed adjustment: when updateRecord receives only forbidden fields (id, userId), it returns null without querying, so the test was updated to verify this behavior.

## Verification

- Backend tests: 1358 passed, 12 skipped, 0 failures (71 test files)
- Backend build: tsc passes clean
- Frontend type-check: tsc --noEmit passes clean

## Next Step

Phase 13 (Fresis Completion) complete. All gaps #10-16 and #24 closed. Ready for Phase 14 (Price/VAT Excel Import).

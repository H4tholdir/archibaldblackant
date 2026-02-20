# 07-01 Summary: Wire Group A Stubs to Existing Services

**Completed:** 2026-02-20
**Status:** Done

## Tasks Completed

### Task 1: Wire createCustomerBot factory to createApp
- **Commit:** db93894
- **Files modified:** `archibald-web-app/backend/src/main.ts`
- **Change:** Added `createCustomerBot: createBot as (userId: string) => any` to the `createApp()` call
- **Effect:** The `if (deps.createCustomerBot)` guard in server.ts now activates, enabling all interactive customer routes (`/api/customers/interactive/*`)

### Task 2: Wire Arca export, import, and FT number stubs to real services
- **Commit:** 8ec0931
- **Files modified:** `archibald-web-app/backend/src/server.ts`
- **Files created:** `archibald-web-app/backend/src/db/migrations/008-ft-counter.sql`
- **Changes:**
  - **exportArca**: Queries fresis_history rows with arca_data, calls `exportToArcaDbf()` to generate DBF files, ZIPs them via `streamExportAsZip()`, returns `{ zipBuffer, stats }`
  - **importArca**: Calls `parseArcaExport()` to parse uploaded DBF files, maps records to `FresisHistoryInput`, upserts via `fresisHistoryRepo.upsertRecords()`
  - **getNextFtNumber**: PostgreSQL UPSERT into `agents.ft_counter` table with atomic increment, returns progressive number
  - **Migration 008**: Creates `agents.ft_counter` table with `(esercizio, user_id)` primary key

## Deviations from Plan

1. **FT counter migration added (Rule 2 - missing critical):** The plan said to wire ft-counter.ts but that file uses better-sqlite3 (legacy). Since the project is PostgreSQL-only in production, a new migration (008-ft-counter.sql) was created and the UPSERT query was written directly using the PostgreSQL pool instead of importing from ft-counter.ts.

2. **Direct SQL for export query:** Instead of modifying the fresis-history repository to export `getArcaExport`, the export lambda queries raw rows directly from PostgreSQL with `::text` casts for JSONB columns. This avoids modifying the repository and keeps the type alignment with `FresisHistoryRow` from arca-import-service.

## Verification Results

- `npm run build --prefix archibald-web-app/backend`: PASS
- `npm test --prefix archibald-web-app/backend`: PASS (838 passed, 12 skipped, 63 files passed)
- createCustomerBot factory passed to createApp: YES
- Interactive customer routes activated: YES (server.ts line 165 guard now passes)
- exportArca stub replaced: YES (real DBF export via arca-export-service)
- importArca stub replaced: YES (real DBF import via arca-import-service)
- getNextFtNumber stub replaced: YES (PostgreSQL UPSERT counter)
- No new TypeScript errors: CONFIRMED

## Success Criteria

- [x] 4 Group A stubs eliminated (createCustomerBot, exportArca, importArca, getNextFtNumber)
- [x] Customer interactive routes enabled end-to-end
- [x] Arca export produces real DBF files in ZIP format
- [x] FT numbering uses PostgreSQL persistence (not hardcoded 1)
- [x] All existing tests pass
- [x] TypeScript compiles cleanly

# Phase 7: Missing Feature Implementation - Research

**Researched:** 2026-02-20
**Domain:** Internal codebase wiring + subclient data layer
**Confidence:** HIGH

<research_summary>
## Summary

Phase 7 is primarily a **wiring phase**, not a building-from-scratch phase. Comprehensive codebase analysis reveals that most "missing features" already have full implementations that are simply not connected to their API endpoints.

**Key finding:** Of 11 stub endpoints, ~8 have backend implementations ready. The server.ts stubs return empty data instead of calling actual services. The only genuinely new work is the subclient data layer (table + repository + Excel parser).

**Primary recommendation:** Wire existing services to API endpoints in server.ts/main.ts. Build subclient storage layer following existing repository patterns. Use xlsx library (already installed) with warehouse-parser.ts as reference for Excel parsing.
</research_summary>

<standard_stack>
## Standard Stack

### Already Installed (no new dependencies needed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| xlsx | 0.18.5 | Excel parsing | Used by warehouse-parser.ts |
| dbffile | 1.12.0 | DBF file read/write | Used by arca-export/import |
| archiver | 7.0.1 | ZIP creation | Used by arca-export |
| pg | (project dep) | PostgreSQL | Used by all repositories |
| multer | (project dep) | File upload | Used by admin routes |

### No New Libraries Required
All required libraries are already installed. Phase 7 uses existing tools exclusively.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| xlsx | exceljs | exceljs is streaming-capable but xlsx already established in codebase |
| Manual SQL | Knex/Prisma | Project uses raw pg consistently, no ORM needed |
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Pattern 1: Dependency Injection via server.ts
**What:** All route handlers receive dependencies via factory functions. Stubs are injected in server.ts when real implementations aren't wired.
**Current problem:** server.ts injects stub lambdas instead of real service methods.
**Fix pattern:**
```
// BEFORE (stub):
exportArca: async (_userId) => ({ zipBuffer: Buffer.from(''), stats: {...} })

// AFTER (wired):
exportArca: async (userId) => arcaExportService.exportToArcaDbf(pool, userId)
```

### Pattern 2: Handler Registration in main.ts
**What:** Operation handlers registered as map of type→handler in main.ts, passed to processor.
**Current problem:** createCustomerBot factory not passed to createApp.
**Fix pattern:**
```
// main.ts: pass bot factory to createApp
const app = createApp({
  ...existingDeps,
  createCustomerBot: (userId) => new ArchibaldBot(userId, botDeps),
});
```

### Pattern 3: Repository Layer for DB Access
**What:** Each data entity has a repository in `src/db/repositories/` with typed CRUD functions that accept a DbPool.
**For subclients:** Create `subclients.ts` repository following existing patterns (e.g., `pending-orders.ts`, `fresis-history.ts`).

### Pattern 4: Excel Parsing (established in warehouse-parser.ts)
**What:** Buffer → XLSX.read() → iterate sheets → extract rows → validate → return typed result.
**For subclients:** Same pattern but mapping Excel columns to SubClient fields.

### Anti-Patterns to Avoid
- **Don't create a new migration runner** — use existing numbered migration pattern (next: 008-subclients.sql)
- **Don't duplicate types** — SubClient type already defined in frontend, backend route has Subclient type
- **Don't add new dependencies** — everything needed is already installed
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Arca DBF export | Custom DBF writer | Existing arca-export-service.ts | Already complete with 4 DBF files + ZIP |
| Arca DBF import | Custom parser | Existing arca-import-service.ts | Already handles all field mappings |
| FT numbering | Custom counter | Existing ft-counter.ts | Already has UPSERT + PostgreSQL persistence |
| Excel parsing | Custom file reader | xlsx library (installed) | warehouse-parser.ts as reference pattern |
| Customer bot | New bot class | Existing ArchibaldBot methods | createCustomer, navigateToNewCustomerForm, submitVatAndReadAutofill, completeCustomerCreation all implemented |

**Key insight:** The overwhelming pattern in Phase 7 is "wire, don't build." Almost everything is implemented but disconnected.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Building What Already Exists
**What goes wrong:** Reimplementing arca export or FT numbering from scratch
**Why it happens:** Not checking if backend services already exist before planning
**How to avoid:** Check these files first: arca-export-service.ts, arca-import-service.ts, ft-counter.ts, archibald-bot.ts
**Warning signs:** Creating new files for functionality that already has a service file

### Pitfall 2: SubClient Type Mismatch Frontend/Backend
**What goes wrong:** Frontend SubClient has 15 fields, backend route Subclient has 7 fields
**Why it happens:** Two different type definitions with different levels of detail
**How to avoid:** Decide which is canonical. Frontend type (sub-client.ts) is richer. Backend route type should match or subset it consistently. Excel import should populate all available fields.
**Warning signs:** Frontend shows "undefined" for fields backend doesn't return

### Pitfall 3: Missing Subclient Table
**What goes wrong:** Subclients stored in fresis_history as JSON but no dedicated table for Excel-imported subclients
**Why it happens:** Currently subclients come embedded in Arca imports, not as standalone entities
**How to avoid:** Create dedicated `agents.subclients` table with migration 008. Repository provides CRUD. Excel import populates this table.
**Warning signs:** Trying to query subclients from fresis_history instead of a proper table

### Pitfall 4: Excel Column Name Sensitivity
**What goes wrong:** Excel columns don't match expected names (case, spaces, accents)
**Why it happens:** User-uploaded Excel files have inconsistent formatting
**How to avoid:** Normalize column headers (trim, lowercase) before matching. warehouse-parser.ts already handles this pattern.
**Warning signs:** Import returns 0 imported with no errors

### Pitfall 5: Forgetting to Wire Both Paths for Customer Creation
**What goes wrong:** Only wiring queue-based creation, forgetting interactive session routes
**Why it happens:** createApp has optional createCustomerBot dep, easy to miss
**How to avoid:** Wire bot factory in main.ts createApp call AND in handler registration
**Warning signs:** Queue-based creation works but interactive session returns 404
</common_pitfalls>

<codebase_audit>
## Codebase Audit: All 11 Stubs

### Group A: Wire Only (implementation exists, just connect)

| # | Stub | Location | Real Implementation | Action |
|---|------|----------|-------------------|--------|
| 1 | exportArca | server.ts:275 | arca-export-service.ts:exportToArcaDbf() | Wire in server.ts |
| 2 | importArca | server.ts:276 | arca-import-service.ts | Wire in server.ts |
| 3 | getNextFtNumber | server.ts:277 | ft-counter.ts:getNextFtNumber() | Wire in server.ts |
| 4 | createCustomerBot | main.ts (not passed) | archibald-bot.ts (all methods exist) | Pass factory to createApp |

### Group B: Partial Implementation (some code exists, needs completion)

| # | Stub | Location | What Exists | What's Missing |
|---|------|----------|------------|----------------|
| 5 | getAllSubclients | server.ts:386 | Route in subclients.ts | Table + repository + wire |
| 6 | searchSubclients | server.ts:387 | Route in subclients.ts | Table + repository + wire |
| 7 | getSubclientByCodice | server.ts:388 | Route in subclients.ts | Table + repository + wire |
| 8 | deleteSubclient | server.ts:389 | Route in subclients.ts | Table + repository + wire |
| 9 | importSubclients | server.ts:361 | Admin route in admin.ts | Excel parser + table + wire |

### Group C: Lower Priority (optional deps, may not be actively used)

| # | Stub | Location | Notes |
|---|------|----------|-------|
| 10 | warehouse importExcel | server.ts:259 | Returns 501 only if dep not provided |
| 11 | prices importExcel | server.ts:211 | Returns stub result with 0 matches |
| 12 | sync clearSyncData | sync-status.ts:245 | Returns 501 only if dep not provided |
| 13 | warehouse validateArticle | warehouse.ts:377 | Returns 501 only if dep not provided |
</codebase_audit>

<code_examples>
## Code Examples

### Wiring Pattern (server.ts)
```typescript
// Source: existing pattern in server.ts for other routes
// BEFORE:
exportArca: async (_userId) => ({
  zipBuffer: Buffer.from(''),
  stats: { totalDocuments: 0, totalRows: 0, totalClients: 0, totalDestinations: 0 }
})

// AFTER:
exportArca: async (userId) => {
  const service = createArcaExportService(pool);
  return service.exportToArcaDbf(userId);
}
```

### Excel Parsing Pattern (from warehouse-parser.ts)
```typescript
// Source: warehouse-parser.ts (already in codebase)
const workbook = XLSX.read(buffer, { type: "buffer" });
for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  // Map rows to typed objects
}
```

### Repository Pattern (from existing repos)
```typescript
// Source: pending-orders.ts, fresis-history.ts patterns
export function createSubclientsRepository(pool: DbPool) {
  return {
    getAll: async (): Promise<Subclient[]> => {
      const { rows } = await pool.query('SELECT ... FROM agents.subclients ORDER BY nome');
      return rows.map(mapRow);
    },
    search: async (query: string): Promise<Subclient[]> => {
      const { rows } = await pool.query(
        'SELECT ... FROM agents.subclients WHERE nome ILIKE $1 OR codice ILIKE $1',
        [`%${query}%`]
      );
      return rows.map(mapRow);
    },
    // ...
  };
}
```

### Migration Pattern (from existing migrations)
```sql
-- Source: 003-agent-tables.sql pattern
CREATE TABLE IF NOT EXISTS agents.subclients (
  codice TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  -- ... fields matching SubClient type
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
</code_examples>

<sota_updates>
## State of the Art

No SOTA updates relevant — Phase 7 uses exclusively internal codebase patterns and already-installed libraries. No external ecosystem changes affect this work.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A | N/A | N/A | All tools already current |

**Key point:** This phase is entirely internal wiring. No new patterns or libraries needed.
</sota_updates>

<open_questions>
## Open Questions

1. **Excel column names for subclient import**
   - What we know: SubClient has 15 fields (codice, ragioneSociale, indirizzo, etc.)
   - What's unclear: Exact column names in the admin-uploaded Excel file
   - Recommendation: During implementation, add flexible column mapping (normalize headers). Check if there's a sample Excel file or ask user.

2. **Scope of "altri stub usati" in plan 07-03**
   - What we know: Group C stubs (warehouse importExcel, prices importExcel, sync clearSyncData, warehouse validate) exist
   - What's unclear: Which of these are "actively used by frontend" vs optional
   - Recommendation: Check frontend for actual API calls to these endpoints. If frontend calls them, implement. If not, defer.

3. **Subclient codice normalization**
   - What we know: arca-import-service.ts has `normalizeSubClientCode()` that handles "1376" → "C01376" etc.
   - What's unclear: Should Excel import use same normalization?
   - Recommendation: Reuse normalizeSubClientCode for consistency with Arca import data.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Codebase analysis: arca-export-service.ts — complete DBF export with 4 files
- Codebase analysis: arca-import-service.ts — complete DBF import with field mapping
- Codebase analysis: ft-counter.ts — complete FT numbering with PostgreSQL UPSERT
- Codebase analysis: archibald-bot.ts — createCustomer, navigateToNewCustomerForm, submitVatAndReadAutofill, completeCustomerCreation all implemented
- Codebase analysis: server.ts — 11 stub implementations identified
- Codebase analysis: warehouse-parser.ts — Excel parsing pattern with xlsx library
- Codebase analysis: subclients.ts route — API contract defined
- Codebase analysis: frontend/src/types/sub-client.ts — SubClient type with 15 fields
- Codebase analysis: frontend/src/api/subclients.ts — Frontend API calls defined
- Codebase analysis: frontend/src/components/new-order-form/SubClientSelector.tsx — UI ready
- Codebase analysis: 003-agent-tables.sql — subclient columns in related tables, no dedicated table

### Secondary (MEDIUM confidence)
- None needed — all findings from direct codebase analysis

### Tertiary (LOW confidence)
- None
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Express routes, PostgreSQL, xlsx, Puppeteer bot
- Ecosystem: Internal codebase only (no external libraries needed)
- Patterns: Dependency injection, repository, Excel parsing, handler registration
- Pitfalls: Type mismatches, missing table, column name sensitivity

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — following existing codebase patterns exactly
- Pitfalls: HIGH — identified from actual codebase analysis
- Code examples: HIGH — extracted from actual project files

**Research date:** 2026-02-20
**Valid until:** 2026-03-22 (30 days — stable internal patterns)
</metadata>

---

*Phase: 07-missing-features*
*Research completed: 2026-02-20*
*Ready for planning: yes*

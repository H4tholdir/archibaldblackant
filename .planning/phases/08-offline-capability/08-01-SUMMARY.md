# Phase 8 Plan 01: IndexedDB Schema Design & Dexie Setup Summary

**IndexedDB foundation established with Dexie.js wrapper and comprehensive schema for offline-first data caching.**

## Accomplishments

- Dexie.js 4.2.1 installed and configured for TypeScript-first development
- 7-table schema designed matching backend SQLite models (customers, products, productVariants, prices, draftOrders, pendingOrders, cacheMetadata)
- Compound indexes on name/article fields for <100ms search performance requirement
- Database singleton with lifecycle hooks (ready, blocked, versionchange)
- Storage quota monitoring utilities with MB-precision calculations
- Graceful error handling with Italian user-friendly messages (quota exceeded, version errors)
- Non-blocking app integration - IndexedDB failure doesn't prevent app render
- Auto-increment IDs for local-only data (drafts and pending orders)

## Files Created/Modified

- `archibald-web-app/frontend/package.json` - Added dexie@4.2.1 dependency
- `archibald-web-app/frontend/package-lock.json` - Dependency lock file updated
- `archibald-web-app/frontend/src/db/schema.ts` - Database schema with ArchibaldDatabase class and 7 table definitions (203 lines)
- `archibald-web-app/frontend/src/db/database.ts` - Utility functions: initializeDatabase(), quota checking, cache freshness, lifecycle hooks (166 lines)
- `archibald-web-app/frontend/src/main.tsx` - Database initialization before ReactDOM render

## Commits

1. **d565114** - `chore(08-01): install Dexie.js and research IndexedDB patterns`
   - Installed dexie@4.2.1 via npm
   - Verified installation and browser compatibility

2. **c86c590** - `feat(08-01): create IndexedDB schema with 7 tables`
   - Defined Customer, Product, ProductVariant, Price, DraftOrder, PendingOrder, CacheMetadata interfaces
   - ArchibaldDatabase class with version 1 schema
   - Compound indexes for fast search (name, article, hash fields)
   - Storage target: ~6MB (5,000 customers, 4,500 products)

3. **64f269a** - `feat(08-01): add database initialization and error handling`
   - initializeDatabase() with quota/version error handling
   - Lifecycle hooks: ready (log counts), blocked (warn multiple tabs), versionchange (close and reload)
   - Integration in main.tsx with graceful degradation
   - Storage quota logging to console

## Decisions Made

- **Dexie.js chosen** over raw IndexedDB API for TypeScript DX, automatic schema versioning, and query optimizations (~100k weekly downloads, well-maintained)
- **Compound indexes** on name/article fields to achieve <100ms search performance target
- **Auto-increment IDs** for local-only data (draftOrders, pendingOrders) - simpler than UUIDs for offline-first features
- **Graceful degradation** pattern - app renders even if IndexedDB unavailable (handles quota exceeded, version conflicts)
- **Storage quota monitoring** to proactively warn users before hitting disk limits
- **Italian error messages** for user-facing feedback (banking app consistency)
- **Lifecycle hooks** for observability: ready (log counts), blocked (multi-tab conflicts), versionchange (schema migration)

## Storage Design

**Target Capacity**: ~6 MB total
- Customers: ~5,000 records (~2 MB)
- Products: ~4,500 records (~2 MB)
- Product Variants: ~9,000 records (~1 MB)
- Prices: ~4,500 records (~500 KB)
- Draft Orders: Variable (~100 KB typical)
- Pending Orders: Variable (~100 KB typical)
- Cache Metadata: 3 records (~1 KB)

**IndexedDB Quota**: Typically 50% of available disk space (~100+ GB on modern devices), far exceeding our 6 MB requirement.

## Performance Targets

- **Search latency**: <100ms from IndexedDB cache (compound indexes on name/article)
- **Initial sync**: 2-3 minutes acceptable (first-run only, ~6 MB download)
- **Quota monitoring**: Proactive warnings before hitting storage limits

## Technical Approach

**Schema Design**:
- Primary keys: String IDs for customers/products (match backend), auto-increment for local data
- Indexes: Compound indexes for search (`name, code, city` for customers; `name, article` for products)
- Multi-value indexes: `*hash` for change detection (Dexie.js multi-entry syntax)
- Foreign keys: Implicit via productId/articleId fields (no DB-level constraints)

**Error Handling**:
- QuotaExceededError: Italian message "Spazio di archiviazione insufficiente"
- VersionError: Italian message "Errore di versione database"
- Generic errors: Fallback message with graceful degradation

**Integration Pattern**:
- Initialize in main.tsx before ReactDOM render
- Non-blocking: App renders even if IndexedDB fails
- Console logging for debugging and monitoring
- Lifecycle hooks provide observability

## Issues Encountered

None. All tasks executed successfully without blockers.

## Verification Checklist

- [x] npm list dexie shows dexie@4.2.1 installed
- [x] TypeScript compilation succeeds (no errors in schema.ts or database.ts)
- [x] App integration in main.tsx (non-blocking initialization)
- [x] Lifecycle hooks configured (ready, blocked, versionchange)
- [x] Error handling covers quota exceeded and version conflicts
- [x] Storage quota monitoring with MB-precision calculations
- [x] All 3 tasks committed individually (3 commits)

## Next Step

Ready for **08-02-PLAN.md** (Cache Population from Backend):
- Create backend API endpoint for full data export (customers, products, variants, prices)
- Implement frontend cache population service with progress tracking
- Add sync metadata tracking (lastSynced, recordCount, version)
- Enable <100ms search from local IndexedDB cache

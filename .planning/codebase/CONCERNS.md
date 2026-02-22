# Codebase Concerns

**Analysis Date:** 2026-02-22

## Tech Debt

**Monolithic backend entry point:**
- Issue: `archibald-web-app/backend/src/index.ts` is 8,181 lines with ~402 route definitions
- Why: Organic growth through 36 phases without extraction
- Impact: Hard to maintain, test, and navigate; merge conflicts likely
- Fix approach: Extract route groups to `routes/*.ts` files (partially done for some routes)

**Monolithic bot file:**
- Issue: `archibald-web-app/backend/src/archibald-bot.ts` is 12,148 lines
- Why: All Puppeteer automation logic accumulated in single class
- Impact: Difficult to debug, test, and understand; mixes concerns (browser automation, DB operations, session caching, profiling)
- Fix approach: Split into domain-specific bot modules (order-bot, sync-bot, etc.)

**Oversized frontend components:**
- Issue: `OrderFormSimple.tsx` (5,815 lines), `OrderCardNew.tsx` (4,278 lines), `CustomerCreateModal.tsx` (2,284 lines)
- Why: Feature accumulation without decomposition
- Impact: Poor readability, hard to test, slow IDE performance
- Fix approach: Phase 28.2 rewrite in progress (4/6 plans complete) with component decomposition

**Incomplete Phase 28.2 OrderForm rewrite:**
- Issue: New OrderForm architecture (Plan 28.2-06: Integration & Testing) not yet executed
- Why: Milestone v3.0 WebSocket work took priority
- Impact: Old monolithic OrderForm still in production; new components built but not wired together
- Fix approach: Execute remaining plan 28.2-06

## Known Bugs

**Phase 28.1 bugs (paused, superseded by 28.2):**
- Symptoms: Customer selection broken, product filtering returns no results, white screen crash
- Trigger: Using old OrderForm to create orders
- Workaround: Phase 28.2 rewrite addresses root causes
- Root cause: IndexedDB empty (no code populated it from API), race conditions in state management

## Security Considerations

**Missing authentication on admin sync endpoint:**
- Risk: `/api/admin/sync/frequency` endpoint lacks JWT auth - `backend/src/index.ts`
- Current mitigation: None (TODO comment references Phase 26)
- Recommendations: Add `authenticateJWT` + `requireAdmin` middleware

**Commented-out admin check on sync schedule:**
- Risk: `/api/sync/schedule` has commented-out admin role check - `backend/src/index.ts`
- Current mitigation: None
- Recommendations: Uncomment and enforce admin check

**Unauthenticated PDF share endpoint:**
- Risk: `GET /api/share/pdf/:id` serves PDFs without auth - `backend/src/routes/share-routes.ts`
- Current mitigation: UUID-based URLs (security through obscurity)
- Recommendations: Add token-based access or expiry validation

**JWT secret fallback:**
- Risk: `backend/src/auth-utils.ts` falls back to `"dev-secret-key-change-in-production"` if JWT_SECRET unset
- Current mitigation: Production likely has env var set
- Recommendations: Fail fast if JWT_SECRET is missing in production

**localStorage JWT storage:**
- Risk: XSS vulnerability could expose JWT tokens stored in localStorage
- Files: `frontend/src/main.tsx`, `frontend/src/utils/fetch-with-retry.ts`
- Current mitigation: Helmet security headers on backend
- Recommendations: Consider httpOnly cookies for token storage

## Performance Bottlenecks

**No significant runtime bottlenecks detected.** Recent optimizations (Phase 27) reduced order creation from ~82s to ~47s. WebSocket real-time sync (Phase 29-36) replaced polling.

**PDF parsing duration:**
- Problem: Price PDF parsing takes ~60s (14,928 pages)
- Files: `backend/src/pdf-parser-prices-service.ts`
- Cause: Large PDF with 3-page cycles
- Improvement path: Acceptable for background sync; could parallelize parsing

## Fragile Areas

**Archibald ERP scraping:**
- Why fragile: Puppeteer automation depends on Archibald UI structure (DevExpress XAF)
- Common failures: UI layout changes break selectors, session timeouts
- Files: `backend/src/archibald-bot.ts`
- Safe modification: Document selectors in `.planning/archibald-ui-selectors.md`, test with screenshots
- Test coverage: Manual verification scripts only

**Sync orchestration:**
- Why fragile: Mutex coordination between 6 sync types with priority management
- Common failures: Deadlocks if sync hangs, resource contention with bot operations
- Files: `backend/src/sync-orchestrator.ts`
- Safe modification: Test sync interactions carefully
- Test coverage: Limited automated testing

## Dependencies at Risk

**better-sqlite3:**
- Risk: CLAUDE.md mentions migration to PostgreSQL via `pg` pool (D-1 rule)
- Impact: Current codebase uses SQLite exclusively
- Migration plan: Gradual migration; CLAUDE.md already references PostgreSQL as target

## Test Coverage Gaps

**Backend routes (index.ts):**
- What's not tested: Most of the 402 route handlers in `index.ts` lack automated tests
- Risk: Regressions on API changes go undetected
- Priority: Medium
- Difficulty: Routes tightly coupled to database and services

**Sync orchestration flow:**
- What's not tested: End-to-end sync coordination between services
- Risk: Race conditions or deadlocks under concurrent sync
- Priority: Medium
- Difficulty: Requires mock Archibald server or complex test fixtures

**Admin endpoints:**
- What's not tested: User management, impersonation, sync frequency changes
- Risk: Authorization bypass or data corruption
- Priority: High
- Difficulty: Needs JWT setup and role fixtures

## Missing Critical Features

**Whitelist system:**
- Problem: User whitelist not implemented (`TODO_FUTURE_FEATURE` in `frontend/src/hooks/useAuth.ts`)
- Current workaround: All registered users have access
- Blocks: Per-user access control
- Implementation complexity: Low

**Sync progress UI:**
- Problem: Multiple `TODO: Add live sync progress bar here` in `frontend/src/AppRouter.tsx`
- Current workaround: Users check admin page for sync status
- Blocks: Real-time feedback during sync
- Implementation complexity: Low (WebSocket infrastructure exists)

---

*Concerns audit: 2026-02-22*
*Update as issues are fixed or new ones discovered*

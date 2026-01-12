# Codebase Concerns

**Analysis Date:** 2026-01-11

## Security Considerations

**CRITICAL: Hardcoded Credentials in Version Control**
- Risk: Production credentials committed to `backend/.env` file
  - Username: `[REDACTED-USERNAME]`
  - Password: `[REDACTED-PASSWORD]`
  - ERP URL: `https://4.231.124.90/Archibald`
- File: `backend/.env` (should never be committed)
- Current mitigation: None - anyone with repo access has full ERP authentication
- Recommendations:
  - **IMMEDIATE: Rotate credentials** in Archibald ERP system
  - Add `.env` to `.gitignore` if not already present
  - Remove `.env` from git history (`git filter-branch` or BFG Repo-Cleaner)
  - Use environment variables in production (Docker secrets, cloud provider config)
  - Document required variables in `.env.example` only (no values)

**Hardcoded IP Address and URLs Throughout Codebase**
- Risk: Changes to Archibald server URL require code changes and redeployment
- Files:
  - `backend/src/customer-sync-service.ts` (lines 165, 172)
  - `backend/src/product-sync-service.ts` (lines 165, 172)
  - `backend/src/price-sync-service.ts` (lines 169, 177)
  - `backend/src/browser-pool.ts` (lines 80, 153, 246)
  - `backend/src/queue-manager.ts` (line 193)
- Current mitigation: URL in config.ts but not consistently used
- Recommendations: Centralize all URLs in `backend/src/config.ts` and reference from there

## Tech Debt

**Undefined Variable: activeSyncType**
- Issue: Variable `activeSyncType` referenced but never declared
- Files: `backend/src/index.ts` (lines 403, 406, 477, 515, 553)
- Code:
  ```typescript
  if (activeSyncType) {  // <- undefined variable
    return res.status(409).json({
      error: `Sincronizzazione ${activeSyncType} già in corso...`
    });
  }
  ```
- Why: Variable name mismatch - `activeOperation` declared (line 35) but `activeSyncType` used
- Impact: Runtime error when sync endpoints are called (409 conflict response fails)
- Fix approach: Replace all instances of `activeSyncType` with `activeOperation`

**Dead Code Path in product-sync-service.ts**
- Issue: Early return makes all code below unreachable
- File: `backend/src/product-sync-service.ts` (lines 245-249)
- Code:
  ```typescript
  const ensureAllProductsFilter = async () => {
    logger.info('Verifica selezione filtro prodotti (skipped - no filter needed)...');
    return; // Skip filter check for products page
    try {  // <- THIS CODE IS UNREACHABLE
      // ... rest of filter code
    }
  ```
- Why: Filter check intentionally disabled but code not removed
- Impact: Dead code confuses maintainers, increases bundle size
- Fix approach: Remove unreachable try block or remove early return

**Debug console.log() Statements in Production Code**
- Issue: Numerous `console.log()` for debugging instead of logger
- Files:
  - `backend/src/archibald-bot.ts` (lines 333, 344, 356, 376, 382, 551, 570, 583, 676, 812, 816, 1051-1110, 2197-2239)
  - `backend/src/customer-sync-service.ts` (lines 295, 309, 368, 374, 381)
  - `backend/src/product-sync-service.ts` (lines 296, 310, 366, 372, 379)
- Why: Quick debugging during development
- Impact: Inconsistent logging, difficult to control log levels, noise in stdout
- Fix approach: Replace all `console.log()` with `logger.debug()` or `logger.info()`

**Use of `any` Type (Loss of Type Safety)**
- Issue: TypeScript strict mode bypassed with `any` annotations
- Files:
  - `backend/src/product-sync-service.ts` (line 285: `const debugInfo: any[] = [];`)
  - `backend/src/customer-sync-service.ts` (line 284: `const debugInfo: any[] = [];`)
  - `backend/src/archibald-bot.ts` (lines 1168, 1603, 1810, 2030: multiple `any` in sort functions)
  - `backend/src/index.ts` (line 132: `(progress: any)`)
- Why: Quick workaround during development
- Impact: Loss of type safety, potential runtime errors
- Fix approach: Define proper TypeScript interfaces for debug info and progress objects

## Known Bugs

**Missing Error Handling in WebSocket Broadcast**
- Symptoms: Silent failures when WebSocket client disconnects
- Trigger: Client closes connection during broadcast
- File: `backend/src/index.ts` (lines 128-133)
- Code:
  ```typescript
  ws.send(JSON.stringify(syncService.getProgress()));
  ws.send(JSON.stringify(productSyncService.getProgress()));
  ```
- Workaround: None - failures are silent
- Root cause: No try-catch or readyState check before sending
- Fix: Wrap sends with try-catch or check `ws.readyState === WebSocket.OPEN`

**Potential Null Pointer in Browser Operations**
- Symptoms: "Cannot read property of null" errors during sync
- Trigger: Frame detaches mid-operation in Puppeteer
- File: `backend/src/price-sync-service.ts` (lines 246-375)
- Code: Accesses `bot.page!` with non-null assertion but checks `if (!bot.page)` earlier
- Workaround: Retry sync from checkpoint
- Root cause: Async operations between null check and usage
- Fix: Add null checks before every `bot.page!` access in async loops

## Performance Bottlenecks

**Polling Loop in Browser Pool Acquire**
- Problem: Busy-wait polling wastes CPU cycles
- File: `backend/src/browser-pool.ts` (lines 199-213)
- Measurement: 100ms polling interval
- Code:
  ```typescript
  const checkInterval = setInterval(() => {
    if (this.pool.length > 0) {
      clearInterval(checkInterval);
      const bot = this.pool.pop()!;
      // ...
    }
  }, 100);
  ```
- Cause: No event-driven approach for browser availability
- Improvement path: Replace with EventEmitter-based approach or Promise-based queue

**N+1 Query Pattern in Price Sync**
- Problem: Individual UPDATE statements in loop
- File: `backend/src/price-sync-service.ts` (lines 402-422)
- Measurement: One statement per price entry
- Cause: Prepared statement executed in loop instead of batch UPDATE
- Improvement path: Use batch UPDATE with IN clause or CASE statements

## Fragile Areas

**Browser Pool Management**
- File: `backend/src/browser-pool.ts`
- Why fragile: Complex state management with pre-auth, timeouts, cleanup
- Common failures: Zombie browsers, authentication expiry, pool exhaustion
- Safe modification: Add integration tests before changing pool logic
- Test coverage: No tests (only manual scripts)

**WebSocket Connection Handling**
- File: `backend/src/index.ts` (WebSocket server setup)
- Why fragile: No error recovery, no heartbeat, manual reconnection on client
- Common failures: Connection drops go unnoticed, memory leaks from unclosed connections
- Safe modification: Add connection lifecycle management (heartbeat, cleanup)
- Test coverage: No WebSocket tests

**Synchronization Lock Management**
- File: `backend/src/index.ts` (activeOperation flag)
- Why fragile: Global lock with manual acquire/release, no timeout enforcement
- Common failures: Deadlocks if release() not called, race conditions
- Safe modification: Use proper mutex library (async-mutex) with timeout
- Test coverage: No concurrency tests

## Scaling Limits

**SQLite Database**
- Current capacity: Single-writer limit, no replication
- Limit: ~10k customers, ~5k products before write contention
- Symptoms at limit: Lock timeouts, slow queries
- Scaling path: Migrate to PostgreSQL or multi-reader SQLite (WAL mode)

**Redis Job Queue**
- Current capacity: Single Redis instance, no clustering
- Limit: Memory-bound (default ~100MB without config)
- Symptoms at limit: Job processing stops, memory errors
- Scaling path: Configure Redis maxmemory, add Redis Sentinel for HA

**Puppeteer Browser Pool**
- Current capacity: Max 3 concurrent browsers
- Limit: ~3 concurrent orders per server instance
- Symptoms at limit: Orders wait for available browser (polling delay)
- Scaling path: Increase max pool size or distribute across multiple servers

## Dependencies at Risk

**better-sqlite3 (Native Module)**
- Risk: Requires native compilation, platform-specific binaries
- Impact: Deployment complexity, Docker build issues on ARM
- Migration plan: Consider PostgreSQL or pure-JS SQLite (sql.js)

**puppeteer (Large Dependency)**
- Risk: 300MB+ Chromium download, frequent breaking changes
- Impact: Slow npm install, compatibility issues with OS updates
- Migration plan: Use puppeteer-core with system Chrome, or playwright (lighter)

## Missing Critical Features

**Order Creation Failure Recovery**
- Problem: No retry mechanism or user notification when order fails
- Current workaround: Users manually check order status and retry
- Blocks: Poor UX, lost orders on transient failures
- Implementation complexity: Medium (add BullMQ retry config + failure webhook)

**Sync Conflict Resolution**
- Problem: No handling for concurrent sync/order operations (global lock blocks orders)
- Current workaround: Orders wait up to 60s for sync to complete
- Blocks: Poor response time during sync windows
- Implementation complexity: High (need read/write lock separation)

**Audit Trail**
- Problem: No record of who created which order, when, from where
- Current workaround: Check Archibald ERP logs manually
- Blocks: Debugging, accountability, compliance
- Implementation complexity: Low (add audit_log table with user/timestamp)

## Test Coverage Gaps

**No Unit Tests**
- What's not tested: All services, database operations, bot automation, queue management
- Risk: Refactoring is extremely risky, regressions go undetected
- Priority: CRITICAL
- Difficulty to test: Medium (requires mocking Puppeteer, Redis, SQLite)
- Action: Convert manual test scripts to automated Vitest tests

**No Integration Tests**
- What's not tested: End-to-end sync flow, order creation flow, API endpoints
- Risk: Breaking changes to service interactions go unnoticed
- Priority: HIGH
- Difficulty to test: Medium (requires test containers for Redis, fixtures for ERP)
- Action: Add integration test suite with Docker Compose for dependencies

**No E2E Tests**
- What's not tested: Frontend → Backend → ERP full user journeys
- Risk: UI changes break workflows, browser automation failures
- Priority: MEDIUM
- Difficulty to test: High (requires running Playwright against real ERP or mock)
- Action: Add Playwright E2E tests for critical paths

## Deployment Concerns

**No Containerization**
- Problem: No Docker setup for reproducible environments
- Impact: Deployment complexity, environment drift
- Fix approach: Create Dockerfile and docker-compose.yml

**No Health Checks**
- Problem: No `/health` endpoint or liveness probe
- Impact: Cannot detect if service is degraded (Redis down, ERP unreachable)
- Fix approach: Add comprehensive health check endpoint

**No Graceful Shutdown**
- Problem: Shutdown kills in-progress sync operations
- File: `backend/src/index.ts` (lines 954-974)
- Impact: Corrupted checkpoints, lost sync progress
- Fix approach: Wait for activeOperation to complete before shutdown

---

*Concerns audit: 2026-01-11*
*Update as issues are fixed or new ones discovered*

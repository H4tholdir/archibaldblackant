# Testing Patterns

**Analysis Date:** 2026-01-11

## Test Framework

**Runner:**
- Vitest 1.2.1 - Configured in `backend/package.json`
- Config: No `vitest.config.ts` found (uses defaults)

**Assertion Library:**
- Vitest built-in expect (not yet used)

**Run Commands:**
```bash
npm test                              # Run all tests (no tests present)
npm run test:login                    # Manual integration test - ERP login
npm run test:order                    # Manual integration test - Order creation
npm run test:queue                    # Manual integration test - Job queue
```

## Test File Organization

**Location:**
- Expected: `*.test.ts` alongside source files (Vitest convention)
- **Actual: NO UNIT TESTS PRESENT**

**Naming:**
- Expected pattern: `module-name.test.ts`
- No test files found in `backend/src/` or `frontend/src/`

**Structure:**
- No test directory structure exists
- Manual test scripts in `backend/src/scripts/` instead of automated tests

## Test Structure

**Suite Organization:**
- Not applicable - no tests written yet

**Patterns:**
- Vitest conventions would apply (describe/it/expect)
- No actual test structure to document

## Mocking

**Framework:**
- Vitest vi mocking available but not used

**Patterns:**
- Not applicable - no tests present

## Fixtures and Factories

**Test Data:**
- No test fixtures or factories present
- Manual test scripts use hardcoded data inline

**Location:**
- No `tests/fixtures/` or factory patterns found

## Coverage

**Requirements:**
- No coverage target defined
- No coverage tracking configured

**Configuration:**
- Vitest coverage available via `--coverage` flag but not configured

**View Coverage:**
- Not applicable - no tests to measure

## Test Types

**Unit Tests:**
- Status: NOT IMPLEMENTED
- No `*.test.ts` or `*.spec.ts` files in source code

**Integration Tests:**
- Status: MANUAL SCRIPTS ONLY
- Location: `backend/src/scripts/`
- Scripts:
  - `test-login.ts` - Tests Puppeteer authentication to Archibald ERP
  - `test-create-order.ts` - Tests end-to-end order creation flow
  - `test-queue.ts` - Tests BullMQ job queue functionality
- Execution: Via `npm run test:login`, `npm run test:order`, `npm run test:queue`
- Pattern: Standalone scripts with manual verification

**E2E Tests:**
- Status: NOT IMPLEMENTED
- No E2E testing framework configured

## Common Patterns

**Manual Test Scripts:**
```typescript
// Example from test-login.ts
import { ArchibaldBot } from '../archibald-bot';
import { logger } from '../logger';

async function testLogin() {
  logger.info('=== TEST LOGIN ARCHIBALD ===');
  const bot = new ArchibaldBot();

  try {
    logger.info('1. Inizializzazione browser...');
    await bot.initialize();

    logger.info('2. Tentativo login...');
    await bot.login();

    logger.info('✅ LOGIN RIUSCITO!');
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch (error) {
    logger.error('❌ TEST FALLITO', { error });
    process.exit(1);
  } finally {
    await bot.close();
  }
}

testLogin();
```

**Pattern:**
- Import target service/class
- Create instance
- Execute operations with logging
- Check results manually (visual inspection)
- Exit with status code

## Test Coverage Gaps

**Critical Gaps:**

**Services without tests:**
- `backend/src/customer-sync-service.ts` - No unit tests for sync logic
- `backend/src/product-sync-service.ts` - No unit tests for pagination
- `backend/src/price-sync-service.ts` - No validation tests
- `backend/src/queue-manager.ts` - No job queue tests (only manual script)
- `backend/src/browser-pool.ts` - No pool management tests
- `backend/src/archibald-bot.ts` - No automation tests (only manual login test)
- `backend/src/customer-db.ts` - No database operation tests
- `backend/src/product-db.ts` - No database operation tests

**Frontend without tests:**
- No component tests for `OrderForm.tsx`, `OrderStatus.tsx`, etc.
- No hook tests for `useVoiceInput.ts`
- No utility tests for `orderParser.ts`

**Why no tests:**
- Vitest configured but never utilized
- Development focused on rapid prototyping
- Manual testing via scripts deemed sufficient initially
- Integration complexity (Puppeteer, Redis, SQLite) makes unit testing challenging

**Risk:**
- Refactoring is risky without safety net
- Regressions can go undetected
- Core synchronization logic untested
- No verification of edge cases

**Priority:**
- High: Queue processing, sync logic, database operations
- Medium: Browser automation, API endpoints
- Low: Utilities, logging, configuration

## Recommendations

**Immediate Actions:**
1. Convert manual test scripts to automated Vitest integration tests
2. Add unit tests for critical services (QueueManager, CustomerSyncService)
3. Mock Puppeteer for bot tests (use puppeteer-mock or similar)
4. Add property-based tests for parser logic (use fast-check)

**Testing Strategy:**
- Unit tests: Pure functions (parseVoiceOrder, config loaders)
- Integration tests: Services with database/Redis (use test containers)
- Contract tests: API endpoints (use supertest)
- E2E tests: Full order flow (use Playwright)

---

*Testing analysis: 2026-01-11*
*Update when test patterns are established*

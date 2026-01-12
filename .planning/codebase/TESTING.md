# Testing Patterns

**Analysis Date:** 2026-01-11
**Updated:** 2026-01-12 after Vitest setup

## Test Framework

**Runner:**
- Vitest 1.2.1 - Configured in `backend/package.json`
- Config: `backend/vitest.config.ts` with globals enabled, node environment, v8 coverage
- Coverage: @vitest/coverage-v8@1.2.1 for coverage reporting

**Assertion Library:**
- Vitest built-in expect with globals enabled (no imports needed)

**Run Commands:**
```bash
npm test                              # Run all tests once (vitest run)
npm run test:watch                    # Run tests in watch mode
npm run test:coverage                 # Run tests with coverage report (text + html)
npm run test:login                    # Manual integration test - ERP login
npm run test:order                    # Manual integration test - Order creation
npm run test:queue                    # Manual integration test - Job queue
```

## Test File Organization

**Location:**
- `*.test.ts` files alongside source files (Vitest convention)
- Example: `src/config.test.ts` tests `src/config.ts`

**Naming:**
- Pattern: `module-name.test.ts`
- First test: `backend/src/config.test.ts`

**Structure:**
- Test files colocated with source code
- Manual test scripts remain in `backend/src/scripts/` for integration testing

## Test Structure

**Suite Organization:**
- Use `describe(className/functionName)` for grouping tests
- Use `it('should behavior')` for individual test cases
- Example structure:
```typescript
describe('config', () => {
  it('should load config object', () => {
    expect(config).toBeDefined();
  });
});
```

**Conventions:**
- Test file must import from vitest: `import { describe, it, expect } from 'vitest'`
- Or rely on globals (enabled in vitest.config.ts)
- Group related tests under descriptive `describe` blocks
- Write clear, behavioral test descriptions
- Mock external dependencies (Puppeteer, Redis, SQLite) when testing units

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
- No specific coverage target defined yet

**Configuration:**
- Vitest coverage configured with v8 provider
- Reporters: text (console) and html (coverage/index.html)
- Run: `npm run test:coverage`

**View Coverage:**
- Console: Automatically displayed after `npm run test:coverage`
- HTML: Open `coverage/index.html` in browser after running coverage

## Test Types

**Unit Tests:**
- Status: FRAMEWORK READY, FIRST TEST IMPLEMENTED
- First test: `backend/src/config.test.ts` - smoke test for config loading
- Pattern: `*.test.ts` files alongside source code

**Integration Tests:**
- Status: MANUAL SCRIPTS (automated tests to be added)
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

**Status:** Testing framework now ready for use

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
- Development focused on rapid prototyping
- Manual testing via scripts deemed sufficient initially
- Integration complexity (Puppeteer, Redis, SQLite) makes unit testing challenging
- Framework now configured and ready for test development

**Risk:**
- Refactoring is risky without safety net
- Regressions can go undetected
- Core synchronization logic untested
- No verification of edge cases

**Priority:**
- High: Queue processing, sync logic, database operations
- Medium: Browser automation, API endpoints
- Low: Utilities, logging, configuration (config.ts now has smoke test)

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

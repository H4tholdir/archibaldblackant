# Testing Patterns

**Analysis Date:** 2026-02-22

## Test Framework

**Runner:**
- Vitest 4.0.17 (frontend) / 1.2.1 (backend)
- Frontend config: `archibald-web-app/frontend/vitest.config.ts` (jsdom environment)
- Backend config: `archibald-web-app/backend/vitest.config.ts` (node environment)

**Assertion Library:**
- Vitest built-in expect
- @testing-library/jest-dom matchers (frontend)

**Run Commands:**
```bash
npm test --prefix archibald-web-app/frontend      # Frontend tests
npm test --prefix archibald-web-app/backend        # Backend tests
npm run type-check --prefix archibald-web-app/frontend  # Frontend type-check
npm run build --prefix archibald-web-app/backend   # Backend type-check
npx playwright test --prefix archibald-web-app/frontend  # E2E tests
```

## Test File Organization

**Location:**
- `*.spec.ts` / `*.spec.tsx` co-located alongside source files
- No separate `tests/` directory (co-location pattern)

**Naming:**
- Unit tests: `{source-name}.spec.ts`
- Component tests: `{ComponentName}.spec.tsx`
- E2E tests: `e2e/{feature}.spec.ts`

**Structure:**
```
frontend/src/
  utils/
    format-currency.ts
    format-currency.spec.ts
  services/
    orders.service.ts
    orders.service.spec.ts
  components/
    EntityBadge.tsx
    EntityBadge.spec.tsx

backend/src/
  cycle-size-warning.ts
  cycle-size-warning.spec.ts
  price-matching-service.ts
  price-matching-service.spec.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, test, expect, beforeEach, vi } from "vitest";

describe("functionName", () => {
  test("specific behavior description", () => {
    // arrange
    const input = createTestInput();
    // act
    const result = functionName(input);
    // assert
    expect(result).toEqual(expectedOutput);
  });

  test.each([
    { input: value1, expected: result1 },
    { input: value2, expected: result2 },
  ])("parameterized test with $input", ({ input, expected }) => {
    expect(functionName(input)).toBe(expected);
  });
});
```

**Patterns:**
- `describe` blocks match function/class name
- `beforeEach` for per-test setup
- `vi.clearAllMocks()` in beforeEach for isolation
- Parameterized tests with `test.each` for multiple inputs
- Strong assertions: `toBe`, `toEqual` (not weak comparisons)

## Mocking

**Framework:**
- Vitest built-in mocking (vi)
- `vi.mock()` at top of test file for module mocking

**Patterns:**
```typescript
vi.mock("../utils/fetch-with-retry", () => ({
  fetchWithRetry: vi.fn(),
}));

const mockFetchWithRetry = vi.mocked(fetchWithRetry);
mockFetchWithRetry.mockResolvedValue({ ok: true, json: () => Promise.resolve(data) });
```

**What to Mock:**
- External API calls (fetchWithRetry)
- File system operations
- Browser APIs (IndexedDB via fake-indexeddb)
- Time (vi.useFakeTimers)

**What NOT to Mock:**
- Pure functions and utilities
- Internal business logic
- TypeScript types

## Fixtures and Factories

**Test Data:**
```typescript
// Factory functions inline in test files
function createTestOrder(overrides?: Partial<OrderData>): OrderData {
  return {
    customerId: "test-id",
    customerName: "Test Customer",
    items: [],
    ...overrides,
  };
}
```

**Location:**
- Factory functions: inline in test file
- Shared fixtures: `backend/src/test-fixtures/`
- Frontend test setup: `frontend/src/test/setup.ts` (polyfills for Web Crypto, IndexedDB)

## Coverage

**Requirements:**
- No enforced coverage target
- Focus on critical paths: calculations, services, parsers
- Type-check must pass (CI gate per CLAUDE.md G-1)

**Configuration:**
- Provider: v8
- Reporters: text, html
- Commands: `npm run test:coverage` (both workspaces)

## Test Types

**Unit Tests:**
- Pure function testing with parameterized inputs
- Service logic with mocked dependencies
- Component rendering with Testing Library
- Examples: `format-currency.spec.ts`, `price-matching-service.spec.ts`

**Integration Tests:**
- Backend: Real SQLite databases in tests
- Frontend: Service tests with mocked API responses
- 30-second timeout for backend integration tests

**Property-Based Tests:**
- fast-check library for invariant testing
- Example: `revenue-calculation.spec.ts`
```typescript
import fc from "fast-check";
fc.assert(
  fc.property(fc.float(), fc.float(), (a, b) =>
    // test invariant
  )
);
```

**E2E Tests:**
- Playwright with multi-device testing
- Location: `archibald-web-app/frontend/e2e/`
- Features: Login flows, WebSocket sync, PWA orientation
- Helpers: `e2e/helpers/multi-device.ts`

## Common Patterns

**Async Testing:**
```typescript
test("handles async operation", async () => {
  const result = await asyncFunction();
  expect(result).toBe("expected");
});
```

**Error Testing:**
```typescript
test("throws on invalid input", () => {
  expect(() => functionCall()).toThrow("error message");
});

test("rejects on failure", async () => {
  await expect(asyncCall()).rejects.toThrow("error");
});
```

**Component Testing:**
```typescript
import { render, screen } from "@testing-library/react";

test("renders expected content", () => {
  render(<Component prop="value" />);
  expect(screen.getByText("text")).toBeInTheDocument();
});
```

---

*Testing analysis: 2026-02-22*
*Update when test patterns change*

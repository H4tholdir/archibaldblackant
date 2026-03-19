# Customer Completeness Check — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a non-blocking warning when a selected customer is missing P.IVA validation, PEC/SDI, street, or postal code, and block order submission in the backend if the data is still incomplete at that time.

**Architecture:** A pure-function utility `checkCustomerCompleteness` is shared by `OrderFormSimple` (banner + edit modal trigger) and `PendingOrdersPage` (incomplete badge per order card). The backend mirrors this logic in `isCustomerComplete` and enforces the check in `handleSubmitOrder` before any bot work begins. `OrderFormSimple` currently holds `selectedCustomer` as `local-customer.Customer` (lean type); since that type lacks `vatValidatedAt`, `pec`, `sdi`, and `postalCode`, after a customer is selected the component must also hold a parallel `selectedCustomerFull: Customer | null` (rich type from `types/customer.ts`) fetched via the `/api/customers` endpoint, and pass that to `checkCustomerCompleteness`.

**Tech Stack:** Vitest, TypeScript, React 19, Express

---

## Chunk 1: Backend and Frontend Pure Logic

### Task 1: Frontend utility `customer-completeness.ts`

**Files:**
- Create: `archibald-web-app/frontend/src/utils/customer-completeness.ts`
- Test: `archibald-web-app/frontend/src/utils/customer-completeness.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// archibald-web-app/frontend/src/utils/customer-completeness.spec.ts
import { describe, expect, test } from 'vitest';
import { checkCustomerCompleteness } from './customer-completeness';
import type { Customer } from '../types/customer';

const BASE_COMPLETE: Customer = {
  customerProfile: 'CUST-001',
  internalId: '123',
  name: 'Rossi Mario',
  vatNumber: '12345678901',
  fiscalCode: null,
  sdi: 'ABCDEFG',
  pec: 'mario@pec.it',
  email: null,
  phone: null,
  mobile: null,
  url: null,
  attentionTo: null,
  street: 'Via Roma 1',
  logisticsAddress: null,
  postalCode: '80100',
  city: 'Napoli',
  customerType: null,
  type: null,
  deliveryTerms: null,
  description: null,
  lastOrderDate: null,
  actualOrderCount: 0,
  actualSales: 0,
  previousOrderCount1: 0,
  previousSales1: 0,
  previousOrderCount2: 0,
  previousSales2: 0,
  externalAccountNumber: null,
  ourAccountNumber: null,
  hash: 'abc',
  lastSync: 0,
  createdAt: 0,
  updatedAt: 0,
  botStatus: null,
  photoUrl: null,
  vatValidatedAt: '2026-01-01T00:00:00Z',
};

describe('checkCustomerCompleteness', () => {
  test('all fields present → ok with empty missing list', () => {
    expect(checkCustomerCompleteness(BASE_COMPLETE)).toEqual({ ok: true, missing: [] });
  });

  test('vatValidatedAt null → missing includes P.IVA non validata', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, vatValidatedAt: null });
    expect(result).toEqual({ ok: false, missing: ['P.IVA non validata'] });
  });

  test('vatValidatedAt empty string → missing includes P.IVA non validata (truthy check)', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, vatValidatedAt: '' });
    expect(result).toEqual({ ok: false, missing: ['P.IVA non validata'] });
  });

  test('pec present without sdi → ok', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, sdi: null });
    expect(result).toEqual({ ok: true, missing: [] });
  });

  test('sdi present without pec → ok', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, pec: null });
    expect(result).toEqual({ ok: true, missing: [] });
  });

  test('neither pec nor sdi → missing includes PEC o SDI mancante', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, pec: null, sdi: null });
    expect(result).toEqual({ ok: false, missing: ['PEC o SDI mancante'] });
  });

  test('pec empty string and sdi null → missing includes PEC o SDI mancante (truthy check)', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, pec: '', sdi: null });
    expect(result).toEqual({ ok: false, missing: ['PEC o SDI mancante'] });
  });

  test('street null → missing includes Indirizzo mancante', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, street: null });
    expect(result).toEqual({ ok: false, missing: ['Indirizzo mancante'] });
  });

  test('street empty string → missing includes Indirizzo mancante (truthy check)', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, street: '' });
    expect(result).toEqual({ ok: false, missing: ['Indirizzo mancante'] });
  });

  test('postalCode null → missing includes CAP mancante', () => {
    const result = checkCustomerCompleteness({ ...BASE_COMPLETE, postalCode: null });
    expect(result).toEqual({ ok: false, missing: ['CAP mancante'] });
  });

  test('multiple fields missing → all labels listed in order', () => {
    const result = checkCustomerCompleteness({
      ...BASE_COMPLETE,
      vatValidatedAt: null,
      pec: null,
      sdi: null,
      street: null,
      postalCode: null,
    });
    expect(result).toEqual({
      ok: false,
      missing: ['P.IVA non validata', 'PEC o SDI mancante', 'Indirizzo mancante', 'CAP mancante'],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/frontend -- customer-completeness`

Expected: FAIL with "Cannot find module './customer-completeness'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// archibald-web-app/frontend/src/utils/customer-completeness.ts
import type { Customer } from '../types/customer';

type CompletenessResult = {
  ok: boolean;
  missing: string[];
};

function checkCustomerCompleteness(customer: Customer): CompletenessResult {
  const missing: string[] = [];
  if (!customer.vatValidatedAt)        missing.push('P.IVA non validata');
  if (!customer.pec && !customer.sdi)  missing.push('PEC o SDI mancante');
  if (!customer.street)                missing.push('Indirizzo mancante');
  if (!customer.postalCode)            missing.push('CAP mancante');
  return { ok: missing.length === 0, missing };
}

export { checkCustomerCompleteness, type CompletenessResult };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/frontend -- customer-completeness`

Expected: PASS — 11 tests passing

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/utils/customer-completeness.ts archibald-web-app/frontend/src/utils/customer-completeness.spec.ts
git commit -m "feat(frontend): add checkCustomerCompleteness pure utility"
```

---

### Task 2: Backend utility `customer-completeness-backend.ts`

**Files:**
- Create: `archibald-web-app/backend/src/utils/customer-completeness-backend.ts`
- Test: `archibald-web-app/backend/src/utils/customer-completeness-backend.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// archibald-web-app/backend/src/utils/customer-completeness-backend.spec.ts
import { describe, expect, test } from 'vitest';
import { isCustomerComplete } from './customer-completeness-backend';

type CustomerCompleteness = {
  vat_validated_at: string | null;
  pec: string | null;
  sdi: string | null;
  street: string | null;
  postal_code: string | null;
};

const BASE_COMPLETE: CustomerCompleteness = {
  vat_validated_at: '2026-01-01T00:00:00Z',
  pec: 'mario@pec.it',
  sdi: 'ABCDEFG',
  street: 'Via Roma 1',
  postal_code: '80100',
};

describe('isCustomerComplete', () => {
  test('all fields present → true', () => {
    expect(isCustomerComplete(BASE_COMPLETE)).toBe(true);
  });

  test('vat_validated_at null → false', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, vat_validated_at: null })).toBe(false);
  });

  test('vat_validated_at empty string → false (truthy check)', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, vat_validated_at: '' })).toBe(false);
  });

  test('pec present without sdi → true', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, sdi: null })).toBe(true);
  });

  test('sdi present without pec → true', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, pec: null })).toBe(true);
  });

  test('neither pec nor sdi → false', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, pec: null, sdi: null })).toBe(false);
  });

  test('pec empty string and sdi null → false (truthy check)', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, pec: '', sdi: null })).toBe(false);
  });

  test('street null → false', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, street: null })).toBe(false);
  });

  test('street empty string → false (truthy check)', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, street: '' })).toBe(false);
  });

  test('postal_code null → false', () => {
    expect(isCustomerComplete({ ...BASE_COMPLETE, postal_code: null })).toBe(false);
  });

  test('multiple fields missing → false', () => {
    expect(isCustomerComplete({
      vat_validated_at: null,
      pec: null,
      sdi: null,
      street: null,
      postal_code: null,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- customer-completeness-backend`

Expected: FAIL with "Cannot find module './customer-completeness-backend'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// archibald-web-app/backend/src/utils/customer-completeness-backend.ts

type CustomerCompletenessInput = {
  vat_validated_at: string | null;
  pec: string | null;
  sdi: string | null;
  street: string | null;
  postal_code: string | null;
};

function isCustomerComplete(customer: CustomerCompletenessInput): boolean {
  if (!customer.vat_validated_at)            return false;
  if (!customer.pec && !customer.sdi)        return false;
  if (!customer.street)                      return false;
  if (!customer.postal_code)                 return false;
  return true;
}

export { isCustomerComplete, type CustomerCompletenessInput };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- customer-completeness-backend`

Expected: PASS — 11 tests passing

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/utils/customer-completeness-backend.ts archibald-web-app/backend/src/utils/customer-completeness-backend.spec.ts
git commit -m "feat(backend): add isCustomerComplete pure utility"
```

---

## Chunk 2: Backend Enforcement

### Task 3: Backend `submit-order.ts` — completeness guard

**Context:**
- `handleSubmitOrder` currently queries `agents.customers` only for `internal_id` (when `customerInternalId` is absent).
- The new guard must run **before** any bot work: before `bot.setProgressCallback`, before the cleanup query.
- Spec says: if customer not found → `return { success: false, error: 'Cliente non trovato' }`. Note the handler signature returns `Promise<{ orderId: string; verificationStatus?: string }>`, but these early-return objects are different shapes. Looking at how the operation processor handles errors, the correct approach is to match the spec: return the object with `success: false, error: ...` cast as the return type — the caller `createSubmitOrderHandler` does `return result as unknown as Record<string, unknown>` so any shape works.
- If incomplete → throw `new Error(...)` so the operation is marked failed with the message.

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts`

- [ ] **Step 1: Write the failing test** (add to existing `submit-order.spec.ts`)

In the existing `submit-order.spec.ts`, add the following test cases. The `createMockPool` helper in that file already returns `{ rows: [] }` for unrecognised queries. We need a new pool factory that controls the completeness query response.

```typescript
// Add at the end of the existing describe('handleSubmitOrder', () => { ... }) block
// in archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts

function createMockPoolWithCustomer(
  customerRow: Record<string, string | null> | null,
  catalogPrices: Record<string, number> = {},
): DbPool {
  const query = vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
    if (typeof sql === 'string' && sql.includes('vat_validated_at') && sql.includes('agents.customers')) {
      return Promise.resolve({
        rows: customerRow ? [customerRow] : [],
        rowCount: customerRow ? 1 : 0,
      });
    }
    if (typeof sql === 'string' && sql.includes('RETURNING id')) {
      return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
    }
    if (typeof sql === 'string' && sql.includes('shared.prices') && Array.isArray(params?.[0])) {
      const requestedCodes = params![0] as string[];
      const rows = requestedCodes
        .filter((code) => catalogPrices[code] !== undefined)
        .map((code) => ({ product_id: code, unit_price: String(catalogPrices[code]) }));
      return Promise.resolve({ rows, rowCount: rows.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  return {
    query,
    withTransaction: vi.fn(async (fn) => fn({ query })),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

describe('handleSubmitOrder — completeness guard', () => {
  const INCOMPLETE_CUSTOMER = {
    vat_validated_at: null,
    pec: null,
    sdi: null,
    street: 'Via Roma 1',
    postal_code: '80100',
  };

  const COMPLETE_CUSTOMER = {
    vat_validated_at: '2026-01-01T00:00:00Z',
    pec: 'mario@pec.it',
    sdi: null,
    street: 'Via Roma 1',
    postal_code: '80100',
  };

  test('returns success:false when customer not found in DB', async () => {
    const pool = createMockPoolWithCustomer(null);
    const bot = createMockBot();
    const onProgress = vi.fn();

    const result = await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress) as unknown as Record<string, unknown>;

    expect(result).toEqual({ success: false, error: 'Cliente non trovato' });
    expect(bot.createOrder).not.toHaveBeenCalled();
  });

  test('throws Error when customer data is incomplete', async () => {
    const pool = createMockPoolWithCustomer(INCOMPLETE_CUSTOMER);
    const bot = createMockBot();
    const onProgress = vi.fn();

    await expect(
      handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress),
    ).rejects.toThrow('Dati cliente incompleti. Aggiorna la scheda cliente prima di inviare l\'ordine.');
    expect(bot.createOrder).not.toHaveBeenCalled();
  });

  test('proceeds normally when customer data is complete', async () => {
    const pool = createMockPoolWithCustomer(COMPLETE_CUSTOMER);
    const bot = createMockBot('ORD-COMPLETE');
    const onProgress = vi.fn();

    const result = await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

    expect(result.orderId).toBe('ORD-COMPLETE');
    expect(bot.createOrder).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- submit-order`

Expected: FAIL — "customer not found" test fails because handler currently proceeds even when customer is not found; "throws Error" test fails for same reason.

- [ ] **Step 3: Write minimal implementation**

Modify `archibald-web-app/backend/src/operations/handlers/submit-order.ts`.

Add the import at the top of the file (after existing imports):

```typescript
import { isCustomerComplete } from '../../utils/customer-completeness-backend';
```

Then add the guard as the **very first action** inside `handleSubmitOrder`, before the `bot.setProgressCallback` call:

```typescript
async function handleSubmitOrder(
  pool: DbPool,
  bot: SubmitOrderBot,
  data: SubmitOrderData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  inlineSyncDeps?: InlineSyncDeps,
  broadcastVerification?: BroadcastVerificationFn,
): Promise<{ orderId: string; verificationStatus?: string }> {
  // Completeness guard: verify customer has all required fields before any bot work
  const { rows: [completenessRow] } = await pool.query<{
    vat_validated_at: string | null;
    pec: string | null;
    sdi: string | null;
    street: string | null;
    postal_code: string | null;
  }>(
    `SELECT vat_validated_at, pec, sdi, street, postal_code
     FROM agents.customers
     WHERE customer_profile = $1 AND user_id = $2`,
    [data.customerId, userId],
  );

  if (!completenessRow) {
    return { success: false, error: 'Cliente non trovato' } as unknown as { orderId: string };
  }

  if (!isCustomerComplete(completenessRow)) {
    throw new Error('Dati cliente incompleti. Aggiorna la scheda cliente prima di inviare l\'ordine.');
  }

  bot.setProgressCallback(async (category, metadata) => {
  // ... rest of existing function body unchanged ...
```

**Exact edit:** In `archibald-web-app/backend/src/operations/handlers/submit-order.ts`, find this exact line at the start of `handleSubmitOrder`:

```typescript
  bot.setProgressCallback(async (category, metadata) => {
```

Insert the following block **immediately before** that line (i.e., as the very first statement in the function body):

```typescript
  // Completeness guard: verify customer has all required fields before any bot work
  const { rows: [completenessRow] } = await pool.query<{
    vat_validated_at: string | null;
    pec: string | null;
    sdi: string | null;
    street: string | null;
    postal_code: string | null;
  }>(
    `SELECT vat_validated_at, pec, sdi, street, postal_code
     FROM agents.customers
     WHERE customer_profile = $1 AND user_id = $2`,
    [data.customerId, userId],
  );

  if (!completenessRow) {
    return { success: false, error: 'Cliente non trovato' } as unknown as { orderId: string; verificationStatus?: string };
  }

  if (!isCustomerComplete(completenessRow)) {
    throw new Error('Dati cliente incompleti. Aggiorna la scheda cliente prima di inviare l\'ordine.');
  }

```

Everything else in the function body (starting from `bot.setProgressCallback(...)`) remains exactly as is.

Also note: the existing tests in the `describe('handleSubmitOrder', () => {...})` block use `createMockPool()` which returns `{ rows: [] }` for the completeness query — this means `completenessRow` would be `undefined` and those tests would now return `{ success: false, error: 'Cliente non trovato' }` instead of proceeding. You must update `createMockPool` to return a complete customer row for the completeness query:

```typescript
function createMockPool(catalogPrices: Record<string, number> = {}): DbPool {
  const query = vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
    if (typeof sql === 'string' && sql.includes('vat_validated_at') && sql.includes('agents.customers')) {
      return Promise.resolve({
        rows: [{
          vat_validated_at: '2026-01-01T00:00:00Z',
          pec: 'test@pec.it',
          sdi: null,
          street: 'Via Test 1',
          postal_code: '80100',
        }],
        rowCount: 1,
      });
    }
    if (typeof sql === 'string' && sql.includes('RETURNING id')) {
      return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
    }
    if (typeof sql === 'string' && sql.includes('shared.prices') && Array.isArray(params?.[0])) {
      const requestedCodes = params![0] as string[];
      const rows = requestedCodes
        .filter((code) => catalogPrices[code] !== undefined)
        .map((code) => ({ product_id: code, unit_price: String(catalogPrices[code]) }));
      return Promise.resolve({ rows, rowCount: rows.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  return {
    query,
    withTransaction: vi.fn(async (fn) => fn({ query })),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- submit-order`

Expected: PASS — all existing tests still pass, plus 3 new completeness guard tests pass.

- [ ] **Step 5: Run backend build to verify TypeScript**

Run: `npm run build --prefix archibald-web-app/backend`

Expected: success, 0 errors

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts
git commit -m "feat(backend): enforce customer completeness guard in submit-order handler"
```

---

## Chunk 3: Frontend UI

### Task 4: Frontend `OrderFormSimple.tsx` — warning banner

**Context:**
- `OrderFormSimple` imports `Customer` from `../types/local-customer` (lean type: no `vatValidatedAt`, `pec`, `sdi`, `postalCode`).
- `checkCustomerCompleteness` requires `Customer` from `../types/customer` (rich type with those fields).
- Solution: after `handleSelectCustomer` sets `selectedCustomer` (lean type), we also fetch the full customer from the API using `customerService.searchCustomers(customer.id, 1)` and find the match — but `customerService.searchCustomers` also returns the lean type. Instead, use `fetch('/api/customers?search=...')` directly to get the full rich type. The cleanest approach given the existing code is to add a `selectedCustomerFull: RichCustomer | null` state and populate it by calling `/api/customers?search={customerProfile}&limit=1` and parsing the raw response into the `Customer` type from `types/customer.ts`.
- `CustomerCreateModal` props: `{ isOpen: boolean; onClose: () => void; onSaved: () => void; editCustomer?: Customer | null }` where `Customer` is from `../types/customer.ts`. There is no `isEditMode` prop; edit mode is determined by `!!editCustomer`.

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`
- Test: `archibald-web-app/frontend/src/components/OrderFormSimple.completeness.spec.tsx` (new focused test file)

- [ ] **Step 1: Write the failing test**

```typescript
// archibald-web-app/frontend/src/components/OrderFormSimple.completeness.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Mock all heavy dependencies that OrderFormSimple uses
vi.mock('../services/customers.service', () => ({
  customerService: {
    syncCustomers: vi.fn().mockResolvedValue(undefined),
    searchCustomers: vi.fn().mockResolvedValue([]),
    getHiddenCustomers: vi.fn().mockResolvedValue([]),
    setCustomerHidden: vi.fn().mockResolvedValue(undefined),
    getCustomerById: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../services/products.service', () => ({
  productService: {
    searchProducts: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../services/prices.service', () => ({
  priceService: {
    getPriceForProduct: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../services/orders.service', () => ({
  orderService: {
    getPendingOrders: vi.fn().mockResolvedValue([]),
    savePendingOrder: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../services/toast.service', () => ({
  toastService: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('../api/warehouse', () => ({
  batchRelease: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../api/fresis-history', () => ({
  getFresisHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('../api/orders-history', () => ({
  getOrderHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('../api/fresis-discounts', () => ({
  getDiscountForArticle: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/customer-completeness', () => ({
  checkCustomerCompleteness: vi.fn().mockReturnValue({ ok: false, missing: ['P.IVA non validata', 'PEC o SDI mancante'] }),
}));

// Mock global fetch for the rich customer lookup
const INCOMPLETE_RICH_CUSTOMER = {
  customerProfile: 'CUST-001',
  internalId: null,
  name: 'Rossi Mario',
  vatNumber: '12345678901',
  fiscalCode: null,
  sdi: null,
  pec: null,
  email: null,
  phone: null,
  mobile: null,
  url: null,
  attentionTo: null,
  street: null,
  logisticsAddress: null,
  postalCode: null,
  city: null,
  customerType: null,
  type: null,
  deliveryTerms: null,
  description: null,
  lastOrderDate: null,
  actualOrderCount: 0,
  actualSales: 0,
  previousOrderCount1: 0,
  previousSales1: 0,
  previousOrderCount2: 0,
  previousSales2: 0,
  externalAccountNumber: null,
  ourAccountNumber: null,
  hash: 'abc',
  lastSync: 0,
  createdAt: 0,
  updatedAt: 0,
  botStatus: null,
  photoUrl: null,
  vatValidatedAt: null,
};

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({
    data: { customers: [INCOMPLETE_RICH_CUSTOMER] },
  }),
});

import OrderFormSimple from './OrderFormSimple';

describe('OrderFormSimple — completeness banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: { customers: [INCOMPLETE_RICH_CUSTOMER] },
      }),
    });
  });

  test('renders without error', () => {
    render(
      <MemoryRouter>
        <OrderFormSimple />
      </MemoryRouter>,
    );
    expect(screen.getByText(/nuovo ordine/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/frontend -- OrderFormSimple.completeness`

Expected: FAIL — import of `checkCustomerCompleteness` in the component fails or `getByText(/nuovo ordine/i)` not found (the component hasn't been modified yet with the import).

- [ ] **Step 3: Write minimal implementation**

Modify `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` with these changes:

**a) Add imports at the top** (after existing imports):

```typescript
import { checkCustomerCompleteness, type CompletenessResult } from '../utils/customer-completeness';
import type { Customer as RichCustomer } from '../types/customer';
import { CustomerCreateModal } from './CustomerCreateModal';
```

**b) Add state variables** after the existing `const [restoringCustomerId, setRestoringCustomerId] = useState<string | null>(null);` line:

```typescript
  // Customer completeness check
  const [selectedCustomerFull, setSelectedCustomerFull] = useState<RichCustomer | null>(null);
  const [customerCompleteness, setCustomerCompleteness] = useState<CompletenessResult | null>(null);
  const [editCustomerForCompleteness, setEditCustomerForCompleteness] = useState<RichCustomer | null>(null);
```

**c) Modify `handleSelectCustomer`** to also fetch the rich customer and run the completeness check:

Replace the existing `handleSelectCustomer` function:

```typescript
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setCustomerResults([]);
    setHighlightedCustomerIndex(-1);
    setTimeout(() => {
      if (isFresis(customer)) {
        subClientInputRef.current?.focus();
      } else {
        productSearchInputRef.current?.focus();
      }
    }, 100);
    // Fetch rich customer for completeness check
    fetch(`/api/customers?search=${encodeURIComponent(customer.id)}&limit=1`)
      .then((res) => res.json())
      .then((data) => {
        const richCustomers: RichCustomer[] = data.data?.customers ?? [];
        const rich = richCustomers.find((c) => c.customerProfile === customer.id) ?? richCustomers[0] ?? null;
        setSelectedCustomerFull(rich);
        if (rich) {
          setCustomerCompleteness(checkCustomerCompleteness(rich));
        } else {
          setCustomerCompleteness(null);
        }
      })
      .catch(() => {
        setSelectedCustomerFull(null);
        setCustomerCompleteness(null);
      });
  };
```

**d) Clear completeness state when customer is deselected.** Find the block that calls `setSelectedCustomer(null)` and `setCustomerSearch("")` in the "reset order" / "deselect customer" logic. There are two places:

1. In the reset-all handler (around line 1083-1088 in original), after `setSelectedCustomer(null)`:

```typescript
    setSelectedCustomerFull(null);
    setCustomerCompleteness(null);
```

2. In the "X" button that clears the customer (around line 3114-3117 in original), after `setSelectedCustomer(null)`:

```typescript
                setSelectedCustomerFull(null);
                setCustomerCompleteness(null);
```

**e) Add `handleCompletionModalClose` handler** before the `return (` statement:

```typescript
  const handleCompletionModalClose = () => {
    setEditCustomerForCompleteness(null);
    if (!selectedCustomer) return;
    fetch(`/api/customers?search=${encodeURIComponent(selectedCustomer.id)}&limit=1`)
      .then((res) => res.json())
      .then((data) => {
        const richCustomers: RichCustomer[] = data.data?.customers ?? [];
        const rich = richCustomers.find((c) => c.customerProfile === selectedCustomer.id) ?? richCustomers[0] ?? null;
        setSelectedCustomerFull(rich);
        if (rich) {
          setCustomerCompleteness(checkCustomerCompleteness(rich));
        } else {
          setCustomerCompleteness(null);
        }
      })
      .catch(() => {});
  };
```

**f) Add the completeness banner in JSX**, immediately after the customer selector section (the section that shows the selected customer name and "X" button). Find the `{selectedCustomer && (` block that shows the selected customer chip, and add the banner right after it closes. In practice, insert the following JSX right after the customer selection `<div>` that contains the customer name and the clear ("×") button:

```tsx
            {customerCompleteness && !customerCompleteness.ok && (
              <div
                style={{
                  background: '#fff3cd',
                  border: '1px solid #ffc107',
                  color: '#856404',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  marginTop: '8px',
                  fontSize: '0.875rem',
                }}
              >
                ⚠ Dati cliente incompleti: {customerCompleteness.missing.join(', ')}
                <button
                  onClick={() => setEditCustomerForCompleteness(selectedCustomerFull)}
                  style={{
                    marginLeft: '12px',
                    background: 'none',
                    border: '1px solid #856404',
                    color: '#856404',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Aggiorna scheda →
                </button>
              </div>
            )}
```

**g) Add the edit modal**, at the bottom of the component's JSX (before the final closing `</div>`), alongside the other modals:

```tsx
      {editCustomerForCompleteness && (
        <CustomerCreateModal
          isOpen={true}
          onClose={handleCompletionModalClose}
          onSaved={handleCompletionModalClose}
          editCustomer={editCustomerForCompleteness}
        />
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/frontend -- OrderFormSimple.completeness`

Expected: PASS — 1 test passing

- [ ] **Step 5: Run frontend type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx archibald-web-app/frontend/src/components/OrderFormSimple.completeness.spec.tsx
git commit -m "feat(frontend): add customer completeness warning banner in OrderFormSimple"
```

---

### Task 5: Frontend `PendingOrdersPage.tsx` — incomplete badge

**Context:**
- `PendingOrdersPage` already imports `getCustomers` from `../api/customers`. The `Customer` type from `../api/customers` is slightly different from `../types/customer.ts` (it lacks `vatValidatedAt`, `actualSales`, `previousSales1`, `previousSales2`). However, `../types/customer.ts` has `vatValidatedAt` and is the authoritative type for completeness.
- The page currently calls `getCustomers` from `../api/customers` only inside `getOrderContactInfo` (a one-off helper for email/WhatsApp). There is no global customer map maintained by the page.
- To show badges, we need to know the full rich customer for each order. The approach: add a `useEffect` that fetches all customers once on mount using `fetch('/api/customers?limit=500')` and builds a `Map<customerProfile, RichCustomer>`. Then in the order render loop, look up each order's `customerId` in that map and call `checkCustomerCompleteness`.

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

- [ ] **Step 1: Write the failing test**

This is a UI smoke test. Add it as a new file:

```typescript
// archibald-web-app/frontend/src/pages/PendingOrdersPage.completeness.spec.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../hooks/usePendingSync', () => ({
  usePendingSync: () => ({
    pendingOrders: [
      {
        id: 'order-1',
        customerId: 'CUST-001',
        customerName: 'Rossi Mario',
        items: [],
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        jobStatus: 'idle',
        jobProgress: 0,
      },
    ],
    isSyncing: false,
    staleJobIds: new Set(),
    refetch: vi.fn(),
    trackJobs: vi.fn(),
  }),
}));

vi.mock('../api/operations', () => ({
  enqueueOperation: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
}));

vi.mock('../api/pending-orders', () => ({
  savePendingOrder: vi.fn().mockResolvedValue(undefined),
  deletePendingOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/warehouse', () => ({
  batchTransfer: vi.fn().mockResolvedValue(undefined),
  batchRelease: vi.fn().mockResolvedValue(undefined),
  batchMarkSold: vi.fn().mockResolvedValue(undefined),
  batchReturnSold: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/fresis-discounts', () => ({
  getFresisDiscounts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../api/fresis-history', () => ({
  archiveOrders: vi.fn().mockResolvedValue(undefined),
  reassignMergedOrderId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/toast.service', () => ({
  toastService: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../services/pdf-export.service', () => ({
  pdfExportService: {
    downloadOrderPDF: vi.fn(),
    printOrderPDF: vi.fn(),
    getOrderPDFBlob: vi.fn().mockReturnValue(new Blob()),
    getOrderPDFFileName: vi.fn().mockReturnValue('order.pdf'),
  },
}));

vi.mock('../services/share.service', () => ({
  shareService: {
    shareViaWhatsApp: vi.fn().mockResolvedValue(undefined),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    uploadToDropbox: vi.fn().mockResolvedValue({ path: '/order.pdf' }),
  },
}));

vi.mock('../contexts/OperationTrackingContext', () => ({
  useOperationTracking: () => ({
    trackOperation: vi.fn(),
  }),
}));

vi.mock('../utils/customer-completeness', () => ({
  checkCustomerCompleteness: vi.fn().mockReturnValue({ ok: false, missing: ['P.IVA non validata'] }),
}));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({
    data: {
      customers: [{
        customerProfile: 'CUST-001',
        internalId: null,
        name: 'Rossi Mario',
        vatNumber: null,
        fiscalCode: null,
        sdi: null,
        pec: null,
        email: null,
        phone: null,
        mobile: null,
        url: null,
        attentionTo: null,
        street: null,
        logisticsAddress: null,
        postalCode: null,
        city: null,
        customerType: null,
        type: null,
        deliveryTerms: null,
        description: null,
        lastOrderDate: null,
        actualOrderCount: 0,
        actualSales: 0,
        previousOrderCount1: 0,
        previousSales1: 0,
        previousOrderCount2: 0,
        previousSales2: 0,
        externalAccountNumber: null,
        ourAccountNumber: null,
        hash: 'abc',
        lastSync: 0,
        createdAt: 0,
        updatedAt: 0,
        botStatus: null,
        photoUrl: null,
        vatValidatedAt: null,
      }],
    },
  }),
});

import { PendingOrdersPage } from './PendingOrdersPage';

describe('PendingOrdersPage — completeness badge', () => {
  test('renders page without error when orders are present', () => {
    render(
      <MemoryRouter>
        <PendingOrdersPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Ordini in Attesa (1)')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/frontend -- PendingOrdersPage.completeness`

Expected: FAIL — `checkCustomerCompleteness` mock is not used by the component yet (the component hasn't been modified to import it).

- [ ] **Step 3: Write minimal implementation**

Modify `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx` with these changes:

**a) Add imports** at the top, after existing imports:

```typescript
import { checkCustomerCompleteness } from '../utils/customer-completeness';
import type { Customer as RichCustomer } from '../types/customer';
```

**b) Add state for the customer map**, in the state section (after `const [isMobile, setIsMobile] = useState(...)` block):

```typescript
  const [customersMap, setCustomersMap] = useState<Map<string, RichCustomer>>(new Map());
```

**c) Add useEffect to fetch all customers once on mount**, after the `isMobile` resize effect:

```typescript
  useEffect(() => {
    fetch('/api/customers?limit=500')
      .then((res) => res.json())
      .then((data) => {
        const customers: RichCustomer[] = data.data?.customers ?? [];
        const map = new Map<string, RichCustomer>();
        for (const c of customers) {
          map.set(c.customerProfile, c);
        }
        setCustomersMap(map);
      })
      .catch(() => {});
  }, []);
```

**d) Add the incomplete badge in the order card JSX.** In the order render loop (`orders.map((order) => { ... })`), find the section that shows the customer name:

```tsx
                    <div
                      style={{
                        fontWeight: "600",
                        fontSize: isMobile ? "1.0625rem" : "1.125rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      {order.customerName}
                    </div>
```

Insert the incomplete badge immediately after that `<div>` (before the `{order.subClientCodice && (` block):

```tsx
                    {(() => {
                      const richCustomer = customersMap.get(order.customerId);
                      if (!richCustomer) return null;
                      const completeness = checkCustomerCompleteness(richCustomer);
                      if (completeness.ok) return null;
                      return (
                        <span
                          style={{
                            background: '#fff3cd',
                            color: '#856404',
                            border: '1px solid #ffc107',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '12px',
                            display: 'inline-block',
                            marginBottom: '0.25rem',
                          }}
                        >
                          ⚠ Cliente incompleto
                        </span>
                      );
                    })()}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/frontend -- PendingOrdersPage.completeness`

Expected: PASS — 1 test passing

- [ ] **Step 5: Run frontend type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx archibald-web-app/frontend/src/pages/PendingOrdersPage.completeness.spec.tsx
git commit -m "feat(frontend): add incomplete customer badge in PendingOrdersPage"
```

---

## Chunk 4: Final Verification

### Task 6: Final type-check and full test run

- [ ] **Step 1: Run frontend type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`

Expected: 0 errors

- [ ] **Step 2: Run backend build**

Run: `npm run build --prefix archibald-web-app/backend`

Expected: success, 0 errors

- [ ] **Step 3: Run all frontend tests**

Run: `npm test --prefix archibald-web-app/frontend`

Expected: all pass (no regressions)

- [ ] **Step 4: Run all backend tests**

Run: `npm test --prefix archibald-web-app/backend`

Expected: all pass (no regressions)

---

## Test Commands Summary

- Frontend tests: `npm test --prefix archibald-web-app/frontend`
- Backend tests: `npm test --prefix archibald-web-app/backend`
- Frontend type-check: `npm run type-check --prefix archibald-web-app/frontend`
- Backend build: `npm run build --prefix archibald-web-app/backend`
- Run specific test (frontend): `npm test --prefix archibald-web-app/frontend -- customer-completeness`
- Run specific test (backend): `npm test --prefix archibald-web-app/backend -- customer-completeness-backend`
- Run specific test (submit-order): `npm test --prefix archibald-web-app/backend -- submit-order`

---

## File Map

| File | Action |
|------|--------|
| `archibald-web-app/frontend/src/utils/customer-completeness.ts` | Create |
| `archibald-web-app/frontend/src/utils/customer-completeness.spec.ts` | Create |
| `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` | Modify |
| `archibald-web-app/frontend/src/components/OrderFormSimple.completeness.spec.tsx` | Create |
| `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx` | Modify |
| `archibald-web-app/frontend/src/pages/PendingOrdersPage.completeness.spec.tsx` | Create |
| `archibald-web-app/backend/src/utils/customer-completeness-backend.ts` | Create |
| `archibald-web-app/backend/src/utils/customer-completeness-backend.spec.ts` | Create |
| `archibald-web-app/backend/src/operations/handlers/submit-order.ts` | Modify |
| `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts` | Modify |

# Multi-Address Fixes & Improvements — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 code issues discovered during E2E testing of the multi-address feature on production (formicanera.com, 2026-03-17), plus one operator DB step.

**Architecture:** Four independent frontend/backend fixes; each task produces working, tested, committed code. Implementation order: Issue 5 → Issue 2 → Issue 3 → Issue 4 → Issue 1 (DB reset, operator-only).

**Tech Stack:** React 19 + TypeScript (frontend), Express + TypeScript + PostgreSQL (backend), Puppeteer (bot), Vitest + Testing Library (tests).

---

## Chunk 1: Issue 5 — Completeness Check in Order Form

### Task 1: Fix `fetchAndSetCustomerCompleteness` to use direct customer endpoint

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` (lines 712–729)
- Modify (tests): `archibald-web-app/frontend/src/components/OrderFormSimple.completeness.spec.tsx`

**Context:**
The component imports TWO `Customer` types:
- `Customer` from `../types/local-customer` — has `id`, `name`, `code` etc. (no completeness fields). This is the type returned by search and received by `handleSelectCustomer`.
- `Customer as RichCustomer` from `../types/customer` — has `vatValidatedAt`, `pec`, `sdi`, `street`, `postalCode`. This is what `checkCustomerCompleteness` requires.

`fetchAndSetCustomerCompleteness(customer.id)` is called from `handleSelectCustomer` where
`customer.id` is the profile code (e.g. `'55.227'`). The function currently calls
`GET /api/customers?search=${customerProfile}&limit=1` but the search endpoint does NOT
index by profile code — it returns empty, so `customerCompleteness` is never set, and the
inline banner (lines 3195–3220: `{customerCompleteness && !customerCompleteness.ok && ...}`)
never appears.

Fix: replace the broken search URL with `GET /api/customers/${customerProfile}` (the direct
endpoint at `backend/src/routes/customers.ts` line 255), which returns a `RichCustomer` directly.
The fixed function fetches the `RichCustomer`, calls `checkCustomerCompleteness(rich)`, and
sets both `setSelectedCustomerFull(rich)` and `setCustomerCompleteness(result)`.

`checkCustomerCompleteness` returns `CompletenessResult = { ok: boolean; missing: string[] }`.
The state setter is `setCustomerCompleteness(result)` where `customerCompleteness` is
`CompletenessResult | null`.

**Note on response shape:** Read `backend/src/routes/customers.ts` line 255 to confirm
the endpoint returns the customer object directly (`res.json(customer)`) rather than wrapped
(`res.json({ data: customer })`). Adjust the fetch `.then` callback accordingly.

- [ ] **Step 1: Read the existing completeness spec file**

  ```bash
  cat archibald-web-app/frontend/src/components/OrderFormSimple.completeness.spec.tsx
  ```

  Understand what's already tested and how the component is rendered in tests.

- [ ] **Step 2: Write a failing test — completeness banner appears after customer select**

  In `OrderFormSimple.completeness.spec.tsx`, add a test that:
  1. Mocks `fetch('/api/customers/55.227')` to return a `RichCustomer` with `vatValidatedAt: null`
  2. Triggers customer selection (simulate selecting a customer with `id = '55.227'`)
  3. Asserts that the banner text is visible in the DOM

  Key assertion:
  ```typescript
  await screen.findByText(/P\.IVA non validata/i); // waits for the async fetch to settle
  ```

  Also assert the fetch was called with the DIRECT endpoint, not the search endpoint:
  ```typescript
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/customers/55.227'),
    expect.any(Object),
  );
  expect(global.fetch).not.toHaveBeenCalledWith(
    expect.stringContaining('/api/customers?search='),
    expect.anything(),
  );
  ```

  **Adapt heavily to the existing test setup pattern in the file.**

- [ ] **Step 3: Run test to confirm it fails**

  ```bash
  npm test --prefix archibald-web-app/frontend -- --reporter=verbose OrderFormSimple.completeness
  ```

  Expected: new test FAIL.

- [ ] **Step 4: Fix `fetchAndSetCustomerCompleteness` to use the direct endpoint**

  Replace lines 712–729:
  ```typescript
  const fetchAndSetCustomerCompleteness = (customerProfile: string) => {
    const jwt = localStorage.getItem('archibald_jwt') ?? '';
    fetch(`/api/customers/${encodeURIComponent(customerProfile)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then((rich: RichCustomer) => {
        setSelectedCustomerFull(rich);
        setCustomerCompleteness(checkCustomerCompleteness(rich));
      })
      .catch(() => {
        setSelectedCustomerFull(null);
        setCustomerCompleteness(null);
      });
  };
  ```

  **Verify the response shape** of `GET /api/customers/:customerProfile` by reading
  `backend/src/routes/customers.ts` line 255. If the response is wrapped (e.g.
  `{ customer: ... }` or `{ data: ... }`), adjust the `.then` to destructure accordingly.

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  npm test --prefix archibald-web-app/frontend -- --reporter=verbose OrderFormSimple.completeness
  ```

  Expected: all tests PASS.

- [ ] **Step 6: Run type-check**

  ```bash
  npm run type-check --prefix archibald-web-app/frontend
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx \
          archibald-web-app/frontend/src/components/OrderFormSimple.completeness.spec.tsx
  git commit -m "fix(order-form): fetch completeness via direct customer endpoint, not search"
  ```

---

## Chunk 2: Issue 2 — Delivery Address in Pending Orders

### Task 2: Add delivery address resolution to pending orders backend

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/pending-orders.ts`
- Create (tests): `archibald-web-app/backend/src/db/repositories/pending-orders.spec.ts`

**Context:**
`getPendingOrders` runs `SELECT * FROM agents.pending_orders WHERE user_id = $1`.
Needs a `LEFT JOIN agents.customer_addresses` to resolve delivery address inline.

`mapRowToPendingOrder` is already exported (line 218 of the file). The test imports it directly.

New fields to add to `PendingOrderRow`:
```
addr_via: string | null
addr_cap: string | null
addr_citta: string | null
addr_tipo: string | null
addr_nome: string | null
```

New **optional** field in `PendingOrder` (the `?` is required to not break existing code):
```typescript
deliveryAddressResolved?: {
  via: string | null;
  cap: string | null;
  citta: string | null;
  tipo: string;
  nome: string | null;
} | null;
```

The `created_at` and `updated_at` fields in `PendingOrderRow` are stored as numeric
milliseconds (`number`) — not strings or Date objects. Use `number` in test fixtures.

The JOIN query:
```sql
SELECT
  po.*,
  ca.via   AS addr_via,
  ca.cap   AS addr_cap,
  ca.citta AS addr_citta,
  ca.tipo  AS addr_tipo,
  ca.nome  AS addr_nome
FROM agents.pending_orders po
LEFT JOIN agents.customer_addresses ca
  ON ca.id = po.delivery_address_id
 AND ca.user_id = po.user_id
WHERE po.user_id = $1
ORDER BY po.updated_at DESC
```

- [ ] **Step 1: Write failing unit test for `mapRowToPendingOrder`**

  Create `archibald-web-app/backend/src/db/repositories/pending-orders.spec.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { mapRowToPendingOrder } from './pending-orders';
  import type { PendingOrderRow } from './pending-orders';

  const baseRow: PendingOrderRow = {
    id: 'ord-1',
    user_id: 'u1',
    customer_id: 'CUST-01',
    customer_name: 'Test',
    items_json: [],
    status: 'pending',
    discount_percent: null,
    target_total_with_vat: null,
    retry_count: 0,
    error_message: null,
    created_at: 1000,
    updated_at: 1000,
    device_id: 'dev-1',
    origin_draft_id: null,
    synced_to_archibald: false,
    shipping_cost: 0,
    shipping_tax: 0,
    sub_client_codice: null,
    sub_client_name: null,
    sub_client_data_json: null,
    archibald_order_id: null,
    no_shipping: false,
    notes: null,
    job_id: null,
    job_started_at: null,
    delivery_address_id: null,
    addr_via: null,
    addr_cap: null,
    addr_citta: null,
    addr_tipo: null,
    addr_nome: null,
  };

  describe('mapRowToPendingOrder', () => {
    it('sets deliveryAddressResolved when address fields are joined', () => {
      const row: PendingOrderRow = {
        ...baseRow,
        delivery_address_id: 42,
        addr_via: 'Via Francesco Petrarca, 26',
        addr_cap: '83055',
        addr_citta: 'Lioni',
        addr_tipo: 'Indir. cons. alt.',
        addr_nome: null,
      };

      const result = mapRowToPendingOrder(row);

      expect(result.deliveryAddressResolved).toEqual({
        via: 'Via Francesco Petrarca, 26',
        cap: '83055',
        citta: 'Lioni',
        tipo: 'Indir. cons. alt.',
        nome: null,
      });
    });

    it('sets deliveryAddressResolved to null when no address is joined', () => {
      const result = mapRowToPendingOrder({ ...baseRow, delivery_address_id: null });

      expect(result.deliveryAddressResolved).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  npm test --prefix archibald-web-app/backend -- --reporter=verbose pending-orders.spec
  ```

  Expected: FAIL — `PendingOrderRow` missing `addr_*` fields, `deliveryAddressResolved` not mapped.

- [ ] **Step 3: Add addr_* to `PendingOrderRow`, add optional `deliveryAddressResolved` to `PendingOrder`, update mapper, update query**

  **Add to `PendingOrderRow`** (after `delivery_address_id`):
  ```typescript
  addr_via: string | null;
  addr_cap: string | null;
  addr_citta: string | null;
  addr_tipo: string | null;
  addr_nome: string | null;
  ```

  **Add to `PendingOrder`** (after `deliveryAddressId`):
  ```typescript
  deliveryAddressResolved?: {
    via: string | null;
    cap: string | null;
    citta: string | null;
    tipo: string;
    nome: string | null;
  } | null;
  ```

  **Update `mapRowToPendingOrder`** — add after `deliveryAddressId` mapping:
  ```typescript
  deliveryAddressResolved: row.addr_tipo
    ? {
        via: row.addr_via,
        cap: row.addr_cap,
        citta: row.addr_citta,
        tipo: row.addr_tipo,
        nome: row.addr_nome,
      }
    : null,
  ```

  **Update `getPendingOrders`** query:
  ```typescript
  async function getPendingOrders(pool: DbPool, userId: string): Promise<PendingOrder[]> {
    const { rows } = await pool.query<PendingOrderRow>(
      `SELECT
        po.*,
        ca.via   AS addr_via,
        ca.cap   AS addr_cap,
        ca.citta AS addr_citta,
        ca.tipo  AS addr_tipo,
        ca.nome  AS addr_nome
      FROM agents.pending_orders po
      LEFT JOIN agents.customer_addresses ca
        ON ca.id = po.delivery_address_id
       AND ca.user_id = po.user_id
      WHERE po.user_id = $1
      ORDER BY po.updated_at DESC`,
      [userId],
    );
    return rows.map(mapRowToPendingOrder);
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  npm test --prefix archibald-web-app/backend -- --reporter=verbose pending-orders.spec
  ```

  Expected: PASS.

- [ ] **Step 5: Run build**

  ```bash
  npm run build --prefix archibald-web-app/backend
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add archibald-web-app/backend/src/db/repositories/pending-orders.ts \
          archibald-web-app/backend/src/db/repositories/pending-orders.spec.ts
  git commit -m "feat(pending-orders): resolve delivery address via LEFT JOIN in getPendingOrders"
  ```

### Task 3: Add `deliveryAddressResolved` to frontend type + render + test

**Files:**
- Modify: `archibald-web-app/frontend/src/types/pending-order.ts`
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`
- Create (tests): `archibald-web-app/frontend/src/pages/PendingOrdersPage.spec.tsx` (or modify existing if it exists)

**Context:**
The backend now returns `deliveryAddressResolved`. The frontend type and render need to match.
Render target — below the customer name in each pending order card:
```
📍 Via Francesco Petrarca, 26 — Lioni (Indir. cons. alt.)
```

- [ ] **Step 1: Check if `PendingOrdersPage.spec.tsx` exists**

  ```bash
  ls archibald-web-app/frontend/src/pages/PendingOrdersPage*.spec* 2>/dev/null
  ```

- [ ] **Step 2: Add `deliveryAddressResolved?` to frontend `PendingOrder` interface**

  In `archibald-web-app/frontend/src/types/pending-order.ts`, add to `PendingOrder`:

  ```typescript
  deliveryAddressResolved?: {
    via: string | null;
    cap: string | null;
    citta: string | null;
    tipo: string;
    nome: string | null;
  } | null;
  ```

- [ ] **Step 3: Write a failing render test**

  Create (or add to) `PendingOrdersPage.spec.tsx`:

  ```typescript
  import { render, screen } from '@testing-library/react';
  import { describe, it, expect, vi } from 'vitest';
  // Import PendingOrdersPage and its dependencies — adapt to existing test patterns

  describe('PendingOrdersPage', () => {
    it('renders delivery address line when deliveryAddressResolved is set', () => {
      const orderWithAddress = {
        id: 'ord-1',
        customerName: 'Indelli Enrico',
        deliveryAddressResolved: {
          via: 'Via Francesco Petrarca, 26',
          cap: '83055',
          citta: 'Lioni',
          tipo: 'Indir. cons. alt.',
          nome: null,
        },
        // ... other required PendingOrder fields with reasonable defaults
      };

      // Render the component with orderWithAddress in the order list
      // Adapt setup to the component's prop/hook pattern

      expect(screen.getByText(/Via Francesco Petrarca, 26/)).toBeInTheDocument();
      expect(screen.getByText(/Lioni/)).toBeInTheDocument();
      expect(screen.getByText(/Indir\. cons\. alt\./)).toBeInTheDocument();
    });

    it('does not render address line when deliveryAddressResolved is null', () => {
      const orderWithoutAddress = {
        id: 'ord-2',
        customerName: 'Altro Cliente',
        deliveryAddressResolved: null,
        // ... other required fields
      };

      // render ...

      expect(screen.queryByText('📍')).not.toBeInTheDocument();
    });
  });
  ```

  **Adapt heavily to the actual component API.** If `PendingOrdersPage` fetches data
  itself via a hook, mock the hook. Look at other page test files for the pattern.

- [ ] **Step 4: Run test to confirm it fails**

  ```bash
  npm test --prefix archibald-web-app/frontend -- --reporter=verbose PendingOrdersPage
  ```

  Expected: FAIL.

- [ ] **Step 5: Find where `customerName` is rendered in PendingOrdersPage.tsx**

  Read `PendingOrdersPage.tsx` and find the JSX element rendering each order's customer name.

- [ ] **Step 6: Add the delivery address render below the customer name**

  After the customer name element:

  ```tsx
  {order.deliveryAddressResolved && (
    <div style={{ fontSize: '0.78rem', color: '#666', marginTop: 2 }}>
      {'📍 '}
      {[order.deliveryAddressResolved.via, order.deliveryAddressResolved.citta]
        .filter(Boolean)
        .join(' — ')}
      {order.deliveryAddressResolved.tipo && ` (${order.deliveryAddressResolved.tipo})`}
    </div>
  )}
  ```

- [ ] **Step 7: Run tests to confirm they pass**

  ```bash
  npm test --prefix archibald-web-app/frontend -- --reporter=verbose PendingOrdersPage
  ```

  Expected: PASS.

- [ ] **Step 8: Run type-check**

  ```bash
  npm run type-check --prefix archibald-web-app/frontend
  ```

  Expected: no errors.

- [ ] **Step 9: Commit**

  ```bash
  git add archibald-web-app/frontend/src/types/pending-order.ts \
          archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx \
          archibald-web-app/frontend/src/pages/PendingOrdersPage.spec.tsx
  git commit -m "feat(pending-orders): display resolved delivery address in pending order card"
  ```

---

## Chunk 3: Issue 3 — Fix `selectDeliveryAddress` in Bot

### Task 4: Rewrite `selectDeliveryAddress` to use DevExpress grid lookup pattern

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts` (line 3007, `selectDeliveryAddress` private method)
- Create (tests): `archibald-web-app/backend/src/bot/archibald-bot-delivery-address.spec.ts`

**Context:**
The current method (line 3007) uses `page.evaluate()` to find `.dxeListBoxItem` elements
— these don't exist. The field is a DevExpress grid lookup popup with:
- Outer container: `[id*="SELEZIONARE_L_INDIRIZZO"]`
- Popup opens on click of the container
- A grid with rows matching `.dxgvDataRow`

The method signature is `private async selectDeliveryAddress(address: CustomerAddress)` where
`CustomerAddress` is imported from `'../db/repositories/customer-addresses'` and has
`via: string | null` (not optional — use `null` for missing, not `undefined`).

**New algorithm:**
```
0. If address.via is null/empty: logger.warn, return early (no selection possible)
1. Click the field container [id*="SELEZIONARE_L_INDIRIZZO"] to open popup
2. waitForDevExpressIdle (popup opening)
3. Type address.via into popup (page.keyboard.type)
4. waitForDevExpressIdle (grid filter)
5. Count .dxgvDataRow rows — if 0: logger.warn with via+cap+citta, return
6. page.evaluate: click first .dxgvDataRow
7. waitForDevExpressIdle({ label: 'delivery-address-select' })
```

This means `waitForDevExpressIdle` is called **twice** in the "no rows found" path (steps 2 and 4),
and **three times** in the "success" path (steps 2, 4, 7).

Reference existing patterns by reading `selectFromDevExpressLookup` and `selectCustomer`
private methods in `archibald-bot.ts` before writing the implementation.

- [ ] **Step 1: Read `selectFromDevExpressLookup` and `selectCustomer` in the bot file**

  Read `archibald-bot.ts` around lines 2900–3005 to understand:
  - How the outer container is found with `this.page.$(...)`
  - How typing is done with `page.keyboard.type(...)`
  - How rows are found and clicked via `page.evaluate`

- [ ] **Step 2: Write failing unit tests**

  Create `archibald-web-app/backend/src/bot/archibald-bot-delivery-address.spec.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import type { CustomerAddress } from '../db/repositories/customer-addresses';

  const makePageMock = () => ({
    evaluate: vi.fn().mockResolvedValue(null),
    $: vi.fn().mockResolvedValue(null),
    click: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(null),
    keyboard: {
      type: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    },
    waitForFunction: vi.fn().mockResolvedValue(undefined),
  });

  import { ArchibaldBot } from './archibald-bot';

  function makeBot(pageMock: ReturnType<typeof makePageMock>): ArchibaldBot {
    const bot = new ArchibaldBot({
      archibald: { url: 'http://test', username: 'u', password: 'p' },
    } as any);
    (bot as any).page = pageMock;
    (bot as any).waitForDevExpressIdle = vi.fn().mockResolvedValue(undefined);
    return bot;
  }

  // Minimal CustomerAddress fixture — only fields used by selectDeliveryAddress
  const addressLioni: CustomerAddress = {
    id: 1, userId: 'u1', customerProfile: '55.227',
    tipo: 'Indir. cons. alt.',
    nome: null,
    via: 'Via Francesco Petrarca, 26',
    cap: '83055',
    citta: 'Lioni',
    contea: null, stato: null, idRegione: null, contra: null,
  };

  const addressNullVia: CustomerAddress = {
    ...addressLioni,
    via: null,
  };

  const addressEmptyVia: CustomerAddress = {
    ...addressLioni,
    via: '',
  };

  describe('selectDeliveryAddress', () => {
    let page: ReturnType<typeof makePageMock>;
    let bot: ArchibaldBot;

    beforeEach(() => {
      page = makePageMock();
      bot = makeBot(page);
    });

    it('returns early when via is null — no click, no idle wait', async () => {
      await (bot as any).selectDeliveryAddress(addressNullVia);

      expect(page.$.mock.calls.length).toBe(0);
      expect((bot as any).waitForDevExpressIdle).not.toHaveBeenCalled();
    });

    it('returns early when via is empty string — no click, no idle wait', async () => {
      await (bot as any).selectDeliveryAddress(addressEmptyVia);

      expect(page.$.mock.calls.length).toBe(0);
      expect((bot as any).waitForDevExpressIdle).not.toHaveBeenCalled();
    });

    it('returns gracefully when field container not found', async () => {
      page.$.mockResolvedValueOnce(null); // field not found

      await expect((bot as any).selectDeliveryAddress(addressLioni)).resolves.toBeUndefined();
    });

    it('types via in keyboard after clicking field container', async () => {
      const fieldEl = { click: vi.fn().mockResolvedValue(undefined) };
      page.$.mockResolvedValueOnce(fieldEl);
      page.evaluate.mockResolvedValueOnce(1); // rowCount = 1
      page.evaluate.mockResolvedValueOnce(true); // click first row

      await (bot as any).selectDeliveryAddress(addressLioni);

      expect(fieldEl.click).toHaveBeenCalled();
      expect(page.keyboard.type).toHaveBeenCalledWith('Via Francesco Petrarca, 26');
    });

    it('calls waitForDevExpressIdle twice then returns when no rows found', async () => {
      const fieldEl = { click: vi.fn().mockResolvedValue(undefined) };
      page.$.mockResolvedValueOnce(fieldEl);
      page.evaluate.mockResolvedValueOnce(0); // rowCount = 0

      await (bot as any).selectDeliveryAddress(addressLioni);

      // idle called twice: once after popup open, once after typing
      expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(2);
    });

    it('calls waitForDevExpressIdle three times when row is found and clicked', async () => {
      const fieldEl = { click: vi.fn().mockResolvedValue(undefined) };
      page.$.mockResolvedValueOnce(fieldEl);
      page.evaluate.mockResolvedValueOnce(1);    // rowCount = 1
      page.evaluate.mockResolvedValueOnce(true); // click first row

      await (bot as any).selectDeliveryAddress(addressLioni);

      // idle called three times: popup open, after typing, after row click
      expect((bot as any).waitForDevExpressIdle).toHaveBeenCalledTimes(3);
      expect((bot as any).waitForDevExpressIdle).toHaveBeenLastCalledWith(
        expect.objectContaining({ label: 'delivery-address-select' }),
      );
    });
  });
  ```

- [ ] **Step 3: Run tests to confirm they fail**

  ```bash
  npm test --prefix archibald-web-app/backend -- --reporter=verbose archibald-bot-delivery-address.spec
  ```

  Expected: FAIL.

- [ ] **Step 4: Rewrite `selectDeliveryAddress` in `archibald-bot.ts`**

  Replace the body of `selectDeliveryAddress` (lines 3007–3035) with the new implementation.
  Reference the `selectFromDevExpressLookup` pattern for the exact Puppeteer idioms.

  The new implementation (adapt selector details based on what you read in Step 1):

  ```typescript
  private async selectDeliveryAddress(address: CustomerAddress): Promise<void> {
    if (!this.page) return;
    const via = address.via?.trim() ?? '';
    if (!via) {
      logger.warn('selectDeliveryAddress: via is empty, skipping');
      return;
    }

    const fieldContainer = await this.page.$('[id*="SELEZIONARE_L_INDIRIZZO"]');
    if (!fieldContainer) {
      logger.warn('selectDeliveryAddress: field container not found');
      return;
    }

    await fieldContainer.click();
    await this.waitForDevExpressIdle({ label: 'delivery-address-open' });

    await this.page.keyboard.type(via);
    await this.waitForDevExpressIdle({ label: 'delivery-address-search' });

    const rowCount = await this.page.evaluate(
      () => document.querySelectorAll('.dxgvDataRow').length,
    );

    if (rowCount === 0) {
      logger.warn('selectDeliveryAddress: no rows found after search', {
        via,
        cap: address.cap,
        citta: address.citta,
      });
      return;
    }

    await this.page.evaluate(() => {
      const row = document.querySelector('.dxgvDataRow') as HTMLElement | null;
      row?.click();
    });

    await this.waitForDevExpressIdle({ label: 'delivery-address-select' });
  }
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  npm test --prefix archibald-web-app/backend -- --reporter=verbose archibald-bot-delivery-address.spec
  ```

  Expected: PASS.

- [ ] **Step 6: Run full backend test suite**

  ```bash
  npm test --prefix archibald-web-app/backend
  ```

  Expected: all passing.

- [ ] **Step 7: Run build**

  ```bash
  npm run build --prefix archibald-web-app/backend
  ```

  Expected: no errors.

- [ ] **Step 8: Commit**

  ```bash
  git add archibald-web-app/backend/src/bot/archibald-bot.ts \
          archibald-web-app/backend/src/bot/archibald-bot-delivery-address.spec.ts
  git commit -m "fix(bot): rewrite selectDeliveryAddress to use DevExpress grid lookup popup pattern"
  ```

### Task 5: Create E2E diagnostic test for delivery address selection

**Files:**
- Create: `archibald-web-app/backend/src/bot/archibald-bot-delivery-address.e2e.spec.ts`

**Context:**
Integration test using the real Archibald ERP bot. Skipped in CI via
`describe.skipIf(!process.env.ARCHIBALD_URL)`. Run manually with `vitest --reporter=verbose`.

The spec names the test file `archibald-bot-delivery-address.spec.ts` but since we
already use that name for the unit tests in Task 4, the E2E test gets `.e2e.spec.ts`.

- [ ] **Step 1: Create the E2E spec file**

  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import { ArchibaldBot } from './archibald-bot';

  const ARCHIBALD_URL = process.env.ARCHIBALD_URL;
  const ARCHIBALD_USERNAME = process.env.ARCHIBALD_USERNAME;
  const ARCHIBALD_PASSWORD = process.env.ARCHIBALD_PASSWORD;
  const VIA_TO_SEARCH = 'Via Francesco Petrarca';

  describe.skipIf(!ARCHIBALD_URL)('selectDeliveryAddress — E2E diagnostic', () => {
    let bot: ArchibaldBot;

    beforeAll(async () => {
      bot = new ArchibaldBot({
        archibald: {
          url: ARCHIBALD_URL!,
          username: ARCHIBALD_USERNAME!,
          password: ARCHIBALD_PASSWORD!,
        },
      } as any);
      await (bot as any).launchBrowser();
      await (bot as any).login();
    }, 60_000);

    afterAll(async () => {
      await (bot as any).closeBrowser?.();
    });

    it('finds SELEZIONARE_L_INDIRIZZO field after selecting Indelli Enrico (55.227)', async () => {
      const page = (bot as any).page;
      await page.goto(`${ARCHIBALD_URL}/Archibald/SALESTABLE_EditForm_Agent/`);
      await (bot as any).waitForDevExpressReady?.();
      await (bot as any).selectCustomer('55.227');
      await (bot as any).waitForDevExpressIdle({ label: 'after-customer-select' });

      const fieldInfo = await page.evaluate(() => {
        const field = document.querySelector('[id*="SELEZIONARE_L_INDIRIZZO"]');
        if (!field) return { found: false, fieldId: '', rowCount: 0, rowTexts: [] as string[] };
        const rows = Array.from(document.querySelectorAll('.dxgvDataRow'));
        return {
          found: true,
          fieldId: field.id,
          rowCount: rows.length,
          rowTexts: rows.map((r) => (r.textContent ?? '').trim()),
        };
      });

      console.log('SELEZIONARE_L_INDIRIZZO dump:', JSON.stringify(fieldInfo, null, 2));
      expect(fieldInfo.found).toBe(true);
    }, 120_000);

    it('filters to exactly 1 row when typing Via Francesco Petrarca', async () => {
      const page = (bot as any).page;
      const fieldContainer = await page.$('[id*="SELEZIONARE_L_INDIRIZZO"]');
      expect(fieldContainer).not.toBeNull();

      await fieldContainer!.click();
      await (bot as any).waitForDevExpressIdle({ label: 'field-open' });
      await page.keyboard.type(VIA_TO_SEARCH);
      await (bot as any).waitForDevExpressIdle({ label: 'search-typed' });

      const rowCount = await page.evaluate(
        () => document.querySelectorAll('.dxgvDataRow').length,
      );
      console.log('Row count after typing:', rowCount);
      expect(rowCount).toBe(1);
    }, 60_000);

    it('updates field value after clicking the first row', async () => {
      const page = (bot as any).page;
      await page.evaluate(() => {
        const row = document.querySelector('.dxgvDataRow') as HTMLElement | null;
        row?.click();
      });
      await (bot as any).waitForDevExpressIdle({ label: 'row-clicked' });

      const fieldValue = await page.evaluate(() => {
        const input = document.querySelector('[id*="SELEZIONARE_L_INDIRIZZO"] input') as HTMLInputElement | null;
        return input?.value ?? '';
      });
      console.log('Field value after selection:', fieldValue);
      expect(fieldValue).toContain('Petrarca');
    }, 30_000);
  });
  ```

- [ ] **Step 2: Run build to confirm it compiles**

  ```bash
  npm run build --prefix archibald-web-app/backend
  ```

  Expected: no errors.

- [ ] **Step 3: Confirm it is skipped in CI (no env var)**

  ```bash
  npm test --prefix archibald-web-app/backend -- --reporter=verbose archibald-bot-delivery-address.e2e
  ```

  Expected: 3 tests skipped.

- [ ] **Step 4: Commit**

  ```bash
  git add archibald-web-app/backend/src/bot/archibald-bot-delivery-address.e2e.spec.ts
  git commit -m "test(bot): add E2E diagnostic test for selectDeliveryAddress (skipped in CI)"
  ```

---

## Chunk 4: Issue 4 — Admin Page Sync for Customer Addresses

### Task 6: Add `'customer-addresses'` to SyncControlPanel, SyncMonitoringDashboard, operations.ts

**Files:**
- Modify: `archibald-web-app/frontend/src/api/operations.ts`
- Modify: `archibald-web-app/frontend/src/components/SyncControlPanel.tsx`
- Modify: `archibald-web-app/frontend/src/components/SyncMonitoringDashboard.tsx`

**Context:**
`backend/src/operations/operation-types.ts` already has `'sync-customer-addresses'`
in `OPERATION_TYPES` (line 19), `OPERATION_PRIORITIES` (line 42), and `SCHEDULED_SYNCS`
(line 63) — **no change needed there**. Verify before starting:
```bash
grep 'sync-customer-addresses' archibald-web-app/backend/src/operations/operation-types.ts
```
Expected: 3 matches.

`handleSyncIndividual` uses `` `sync-${type}` as OperationType `` — so the `SyncType` value
**must be `'customer-addresses'`** (produces `'sync-customer-addresses'`).

`SyncMonitoringDashboard` uses the full `"sync-customer-addresses"` string directly.

8 coordinated changes are required. The `setSyncing` loop in `fetchStatus` (SyncControlPanel
lines 120–126) already iterates `ALL_SYNC_TYPES`:
```typescript
setSyncing((prev) => {
  const next = { ...prev };
  for (const t of ALL_SYNC_TYPES) {
    next[t] = activeTypes.has(t);
  }
  return next;
});
```
So adding `"customer-addresses"` to `ALL_SYNC_TYPES` (Change 5) covers the WebSocket reset
path automatically — no separate WebSocket handler change is needed.

The `SyncSection` interface already has `priority: number` (SyncControlPanel line 38), so
the `priority` field in the new `syncSections` entry is valid.

For the icon: use `"🏠"` (not `"📍"` which is already used by Tracking FedEx).

- [ ] **Step 1: Add `'sync-customer-addresses'` to `OperationType` in `operations.ts`**

  The current `OperationType` in `archibald-web-app/frontend/src/api/operations.ts` ends at
  `'sync-prices'`. Add `'sync-customer-addresses'` as a new member (append after `'sync-prices'`):

  ```typescript
  type OperationType =
    | 'submit-order'
    | 'create-customer'
    | 'update-customer'
    | 'send-to-verona'
    | 'edit-order'
    | 'delete-order'
    | 'download-ddt-pdf'
    | 'download-invoice-pdf'
    | 'sync-order-articles'
    | 'sync-customers'
    | 'sync-orders'
    | 'sync-ddt'
    | 'sync-invoices'
    | 'sync-products'
    | 'sync-prices'
    | 'sync-customer-addresses';
  ```

  **Note:** `'sync-tracking'` is used in `SyncControlPanel` with an `as OperationType` cast
  (a pre-existing gap). Do NOT add it here — it is out of scope for this task.

- [ ] **Step 2: Make 5 changes to `SyncControlPanel.tsx`**

  **Change 1 — Extend `SyncType` union** (add `| "customer-addresses"` to the existing type):
  ```typescript
  type SyncType =
    | "customers"
    | "products"
    | "prices"
    | "orders"
    | "ddt"
    | "invoices"
    | "order-articles"
    | "customer-addresses"
    | "tracking";
  ```

  **Change 2 — Add to `syncSections` array** (after `"order-articles"` entry, before `"tracking"`):
  ```typescript
  { type: "customer-addresses", label: "Indirizzi Clienti", icon: "🏠", priority: 1 },
  ```

  **Change 3 — Add `"customer-addresses": false` to `syncing` initial state**:
  ```typescript
  const [syncing, setSyncing] = useState<Record<SyncType, boolean>>({
    customers: false, products: false, prices: false,
    orders: false, ddt: false, invoices: false,
    "order-articles": false, "customer-addresses": false, tracking: false,
  });
  ```

  **Change 4 — Add `"customer-addresses": false` to `deletingDb` initial state**:
  ```typescript
  const [deletingDb, setDeletingDb] = useState<Record<SyncType, boolean>>({
    customers: false, products: false, prices: false,
    orders: false, ddt: false, invoices: false,
    "order-articles": false, "customer-addresses": false, tracking: false,
  });
  ```

  **Change 5 — Add `"customer-addresses"` to `ALL_SYNC_TYPES`**:
  ```typescript
  const ALL_SYNC_TYPES: SyncType[] = [
    "customers", "orders", "ddt", "invoices",
    "products", "prices", "order-articles", "customer-addresses", "tracking",
  ];
  ```

  Changes 6–8 from the spec are covered automatically:
  - WebSocket reset: `fetchStatus` iterates `ALL_SYNC_TYPES` (Change 5 covers this)
  - `handleSyncIndividual`: `` `sync-${type}` `` → `'sync-customer-addresses'` ✓
  - `handleSyncAll`: maps over `ALL_SYNC_TYPES` ✓

- [ ] **Step 3: Make 2 changes to `SyncMonitoringDashboard.tsx`**

  **Change 1 — Add `"sync-customer-addresses"` to `SyncType` union**:
  ```typescript
  type SyncType =
    | "sync-customers"
    | "sync-orders"
    | "sync-ddt"
    | "sync-invoices"
    | "sync-products"
    | "sync-prices"
    | "sync-order-articles"
    | "sync-customer-addresses"
    | "sync-tracking";
  ```

  **Change 2 — Add to `SYNC_SECTIONS` array** (after `"sync-order-articles"`, before `"sync-tracking"`):
  ```typescript
  { type: "sync-customer-addresses" as SyncType, label: "Indirizzi Clienti", icon: "🏠" },
  ```

- [ ] **Step 4: Run type-check**

  ```bash
  npm run type-check --prefix archibald-web-app/frontend
  ```

  Expected: no errors.

- [ ] **Step 5: Run frontend tests**

  ```bash
  npm test --prefix archibald-web-app/frontend
  ```

  Expected: no regressions.

- [ ] **Step 6: Commit**

  ```bash
  git add archibald-web-app/frontend/src/api/operations.ts \
          archibald-web-app/frontend/src/components/SyncControlPanel.tsx \
          archibald-web-app/frontend/src/components/SyncMonitoringDashboard.tsx
  git commit -m "feat(admin): add sync-customer-addresses to SyncControlPanel and SyncMonitoringDashboard"
  ```

---

## Chunk 5: Issue 1 — DB Reset (Operator Step, No Code)

### Task 7: DB reset for Indelli Enrico (operator-executed, no code change)

**No code change required.** One-time production DB reset.

**Context:**
Test data was manually inserted into `agents.customer_addresses` for Indelli Enrico (55.227)
during E2E setup, and `setAddressesSyncedAt` was called (setting `addresses_synced_at IS NOT NULL`).
The scheduler skips customers where this field is NOT null — so the real sync from Archibald ERP
never ran. PWA shows 2 addresses; ERP has 3.

**SQL to run on production VPS:**
```sql
UPDATE agents.customers
SET addresses_synced_at = NULL
WHERE customer_profile = '55.227'
  AND user_id = 'bbed531f-97a5-4250-865e-39ec149cd048';
```

**SSH command:**
```bash
# Save SSH key first (from VPS-ACCESS-CREDENTIALS.md):
# ssh-keygen and chmod 600 /tmp/archibald_vps ...

ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"UPDATE agents.customers SET addresses_synced_at = NULL \
     WHERE customer_profile = '55.227' \
     AND user_id = 'bbed531f-97a5-4250-865e-39ec149cd048';\""
```

**Verification (after next scheduler cycle, ≤10 min):**
```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT count(*) FROM agents.customer_addresses \
     WHERE user_id = 'bbed531f-97a5-4250-865e-39ec149cd048' \
     AND customer_profile = '55.227';\""
```

Expected: `count = 3`.

- [ ] **Step 1: Run the DB reset SQL on production VPS**
- [ ] **Step 2: Wait for next scheduler cycle (≤10 min)**
- [ ] **Step 3: Verify address count = 3** (run verification query)
- [ ] **Step 4: Open PWA and confirm Indelli Enrico shows 3 delivery addresses in order form**

---

## Final Verification

After all code tasks (Tasks 1–6) are committed:

- [ ] `npm test --prefix archibald-web-app/backend` — all passing
- [ ] `npm test --prefix archibald-web-app/frontend` — all passing
- [ ] `npm run type-check --prefix archibald-web-app/frontend` — no errors
- [ ] `npm run build --prefix archibald-web-app/backend` — no errors

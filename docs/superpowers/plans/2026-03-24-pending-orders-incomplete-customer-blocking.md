# Pending Orders — Incomplete Customer Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block selection/submission of pending orders with incomplete customer data, improve the "Cliente incompleto" badge with actionable details, and show a user-friendly message for the `INVENTTABLE field not focused` bot error.

**Architecture:** All changes are confined to `PendingOrdersPage.tsx`. New state (`editCustomerForCompleteness`, `validatingCustomerProfile`) and a `refreshCustomer` helper enable inline customer editing via `CustomerCreateModal` and VAT validation via the existing `useVatValidation` hook. Error display is transformed purely at render time — no backend changes.

**Tech Stack:** React 19, TypeScript strict, inline styles, Vitest + Testing Library, `useVatValidation` hook, `CustomerCreateModal` component.

---

## File Map

| File | Role |
|---|---|
| `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx` | Only file modified — all logic lives here |
| `archibald-web-app/frontend/src/pages/PendingOrdersPage.completeness.spec.tsx` | Existing test file — extend with new cases |

**Do NOT touch:**
- `customer-completeness.ts` — already correct
- `useVatValidation.ts` — already correct
- `CustomerCreateModal.tsx` — already accepts `editCustomer` prop
- Any backend file

---

## Task 1: Add new state and `refreshCustomer` helper

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

### Context

`PendingOrdersPage.tsx` currently imports `checkCustomerCompleteness` and `getCustomers` but does not import `useVatValidation` or `CustomerCreateModal`. The existing state block ends around line 80.

The `refreshCustomer` function must call `GET /api/customers/:profile` directly (same pattern as `fetchAndSetCustomerCompleteness` in `OrderFormSimple.tsx` line 667) because `getCustomers` returns the full list and has no single-customer variant.

- [ ] **Step 1: Add imports**

In `PendingOrdersPage.tsx`, add these two imports near the top, after the existing imports:

```ts
import { useVatValidation } from '../hooks/useVatValidation';
import { CustomerCreateModal } from '../components/CustomerCreateModal';
```

- [ ] **Step 2: Add state after the existing `customersMap` state (around line 77)**

```ts
const [editCustomerForCompleteness, setEditCustomerForCompleteness] =
  useState<RichCustomer | null>(null);
const [validatingCustomerProfile, setValidatingCustomerProfile] =
  useState<string | null>(null);
```

- [ ] **Step 3: Add `useVatValidation` hook call after the new state**

```ts
const {
  validate: validateVat,
  status: vatValidationStatus,
  reset: resetVatValidation,
} = useVatValidation();
```

- [ ] **Step 4: Add `refreshCustomer` useCallback after `useVatValidation`**

```ts
const refreshCustomer = useCallback(async (customerProfile: string) => {
  const token = localStorage.getItem('archibald_jwt') ?? '';
  const res = await fetch(`/api/customers/${encodeURIComponent(customerProfile)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const updated: RichCustomer = await res.json();
  setCustomersMap((prev) => new Map(prev).set(customerProfile, updated));
}, []);
```

- [ ] **Step 5: Add `useEffect` for VAT validation done — insert after `refreshCustomer`**

```ts
useEffect(() => {
  if (vatValidationStatus === 'done' && validatingCustomerProfile) {
    refreshCustomer(validatingCustomerProfile);
    setValidatingCustomerProfile(null);
    resetVatValidation();
  }
}, [vatValidationStatus, validatingCustomerProfile, refreshCustomer, resetVatValidation]);
```

- [ ] **Step 6: Add `handleCompletenessModalClose` — insert near the other handlers (around line 250)**

```ts
const handleCompletenessModalClose = () => {
  const profile = editCustomerForCompleteness?.customerProfile;
  setEditCustomerForCompleteness(null);
  if (profile) refreshCustomer(profile);
};
```

- [ ] **Step 7: Run type-check to verify no errors**

```bash
npm run build --prefix archibald-web-app/backend
npm run type-check --prefix archibald-web-app/frontend
```

Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "feat(pending-orders): add state and helpers for customer completeness modal"
```

---

## Task 2: Add `completableOrders` derived value and fix `handleSelectAll`

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

### Context

`selectableOrders` (line 118) filters out `completed-warehouse` orders. We need a new derived value `completableOrders` that further excludes orders where the customer is incomplete (and not ghost-only). This drives both `handleSelectAll` and the header checkbox `checked` state.

- [ ] **Step 1: Add `completableOrders` derived value after `selectableOrders` (around line 121)**

```ts
const completableOrders = selectableOrders.filter((o) => {
  const c = customersMap.get(o.customerId);
  if (!c) return true; // map not yet loaded: don't block
  const isGhostOnly = o.items.every((i) => i.isGhostArticle);
  return checkCustomerCompleteness(c).ok || isGhostOnly;
});
```

- [ ] **Step 2: Update `handleSelectAll` to use `completableOrders`**

Find the current `handleSelectAll` (around line 122):

```ts
const handleSelectAll = () => {
  if (selectedOrderIds.size === selectableOrders.length) {
    setSelectedOrderIds(new Set());
  } else {
    setSelectedOrderIds(new Set(selectableOrders.map((o) => o.id)));
  }
};
```

Replace with:

```ts
const handleSelectAll = () => {
  if (selectedOrderIds.size === completableOrders.length && completableOrders.length > 0) {
    setSelectedOrderIds(new Set());
  } else {
    setSelectedOrderIds(new Set(completableOrders.map((o) => o.id)));
  }
};
```

- [ ] **Step 3: Update the header checkbox `checked` prop**

Find the header checkbox (the one with `onChange={() => handleSelectAll()}`). Update its `checked` attribute:

```tsx
checked={selectedOrderIds.size === completableOrders.length && completableOrders.length > 0}
```

- [ ] **Step 4: Run type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "feat(pending-orders): derive completableOrders and fix select-all for incomplete customers"
```

---

## Task 3: Disable checkbox for incomplete customers

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

### Context

The per-order checkbox is at line ~1140. Each order card already calls `checkCustomerCompleteness` for the badge (around line 1164). The `checkboxDisabled` flag reuses this check. Ghost-only orders (all items have `isGhostArticle === true`) are exempt, consistent with the backend bypass in `submit-order.ts`.

- [ ] **Step 1: Compute `checkboxDisabled` inside the order loop**

Inside the `orders.map(...)` render loop, just before the checkbox JSX (around line 1140), compute:

```ts
const richCustomer = customersMap.get(order.customerId);
const isGhostOnly = order.items.length > 0 && order.items.every((i) => i.isGhostArticle);
const checkboxDisabled =
  !!richCustomer && !checkCustomerCompleteness(richCustomer).ok && !isGhostOnly;
```

Note: `richCustomer` is already computed just below for the badge (line ~1165). Move that computation up to this point and reuse it for both the checkbox and the badge.

- [ ] **Step 2: Apply `disabled` and visual styles to the checkbox**

Find the `<input type="checkbox" ...>` for order selection (line ~1140). Add:

```tsx
<input
  autoComplete="off"
  type="checkbox"
  checked={selectedOrderIds.has(order.id!)}
  disabled={checkboxDisabled}
  onChange={() => !checkboxDisabled && handleSelectOrder(order.id!)}
  style={{
    width: isMobile ? "1.375rem" : "1.25rem",
    height: isMobile ? "1.375rem" : "1.25rem",
    cursor: checkboxDisabled ? "not-allowed" : "pointer",
    opacity: checkboxDisabled ? 0.45 : 1,
    marginTop: "0.125rem",
    minWidth: "22px",
    minHeight: "22px",
  }}
/>
```

- [ ] **Step 3: Guard `handleSubmitOrders` against incomplete customers**

Inside `handleSubmitOrders` (around line 152), after `const selectedOrders = orders.filter(...)`, add:

```ts
const incompleteOrders = selectedOrders.filter((o) => {
  const c = customersMap.get(o.customerId);
  if (!c) return false;
  const isGhostOnly = o.items.every((i) => i.isGhostArticle);
  return !checkCustomerCompleteness(c).ok && !isGhostOnly;
});
if (incompleteOrders.length > 0) {
  console.warn('[PendingOrdersPage] Filtered out incomplete customers before submit:', incompleteOrders.map((o) => o.customerId));
}
const filteredOrders = selectedOrders.filter((o) => !incompleteOrders.includes(o));
if (filteredOrders.length === 0) return;
```

Then replace all subsequent uses of `selectedOrders` in `handleSubmitOrders` with `filteredOrders`.

- [ ] **Step 4: Run type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "feat(pending-orders): disable checkbox for orders with incomplete customer"
```

---

## Task 4: Improve the "Cliente incompleto" badge

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

### Context

The current badge is at lines 1164–1184. It shows `⚠ Cliente incompleto`. We replace it with:
- Text listing `completeness.missing`
- "Valida ora →" if only P.IVA missing and `vatNumber` is non-null
- "Completa scheda →" otherwise

The badge block already has `richCustomer` computed in Task 3.

- [ ] **Step 1: Replace the badge block**

Find and replace the entire badge IIFE block (lines 1164–1185):

```tsx
{/* --- OLD block to remove ---
{(() => {
  const richCustomer = customersMap.get(order.customerId);
  if (!richCustomer) return null;
  const completeness = checkCustomerCompleteness(richCustomer);
  if (completeness.ok) return null;
  return (
    <span style={{ ... }}>⚠ Cliente incompleto</span>
  );
})()}
*/}
```

Replace with (use `richCustomer` and `checkboxDisabled` already computed above):

```tsx
{richCustomer && (() => {
  const completeness = checkCustomerCompleteness(richCustomer);
  if (completeness.ok) return null;
  const onlyVatMissing =
    completeness.missing.length === 1 &&
    completeness.missing[0] === 'P.IVA non validata';
  const canValidateVat = onlyVatMissing && !!richCustomer.vatNumber;
  const isValidatingThis = validatingCustomerProfile === order.customerId;
  return (
    <div
      style={{
        background: '#fff3cd',
        color: '#856404',
        border: '1px solid #ffc107',
        borderRadius: '4px',
        padding: '4px 8px',
        fontSize: '12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '0.25rem',
        flexWrap: 'wrap',
      }}
    >
      <span>⚠ {completeness.missing.join(', ')}</span>
      {canValidateVat ? (
        <button
          onClick={() => {
            if (validatingCustomerProfile !== null) return;
            setValidatingCustomerProfile(order.customerId);
            validateVat(richCustomer.customerProfile, richCustomer.vatNumber!);
          }}
          disabled={validatingCustomerProfile !== null}
          style={{
            marginLeft: '4px',
            background: 'none',
            border: '1px solid #856404',
            color: '#856404',
            borderRadius: '4px',
            padding: '2px 8px',
            cursor: validatingCustomerProfile !== null ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            opacity: validatingCustomerProfile !== null ? 0.6 : 1,
          }}
        >
          {isValidatingThis ? 'Validazione in corso…' : 'Valida ora →'}
        </button>
      ) : (
        <button
          onClick={() => setEditCustomerForCompleteness(richCustomer)}
          style={{
            marginLeft: '4px',
            background: 'none',
            border: '1px solid #856404',
            color: '#856404',
            borderRadius: '4px',
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Completa scheda →
        </button>
      )}
    </div>
  );
})()}
```

- [ ] **Step 2: Run type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "feat(pending-orders): improve incomplete-customer badge with missing fields and action buttons"
```

---

## Task 5: Add `CustomerCreateModal` to page render

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

### Context

The page's JSX ends with the closing `</div>` of the root container (around line 1600). Add the modal just before that closing tag, same pattern as `OrderFormSimple.tsx` lines 6329–6336.

- [ ] **Step 1: Add `CustomerCreateModal` at the bottom of the render tree**

Just before the last `</div>` closing the root container:

```tsx
{editCustomerForCompleteness && (
  <CustomerCreateModal
    isOpen={true}
    onClose={handleCompletenessModalClose}
    onSaved={handleCompletenessModalClose}
    editCustomer={editCustomerForCompleteness}
  />
)}
```

- [ ] **Step 2: Run type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "feat(pending-orders): add CustomerCreateModal for inline customer profile completion"
```

---

## Task 6: Human-friendly INVENTTABLE error message

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

### Context

There are two places where `order.errorMessage` is rendered:

1. **`isJobFailed` block** (around line 1356–1374): inside the `JobProgressBar` section, the error from `order.jobError` is passed to `JobProgressBar`. The "Riprova Ordine" button follows.
2. **`isPersistedError` block** (around line 1378–1410): shows `Errore: {order.errorMessage || "Errore sconosciuto"}` followed by "Riprova Ordine".

We only need to handle the INVENTTABLE case in the `isPersistedError` block, because that is where `order.errorMessage` from the backend is displayed as text. The `isJobFailed` path uses `order.jobError` passed to `<JobProgressBar>` — check whether `order.jobError` can also contain the INVENTTABLE message.

Actually inspect both: `order.jobError` in the `JobProgressBar` case and `order.errorMessage` in the `isPersistedError` case. Both may contain the INVENTTABLE string. We need to add the friendly UI in both.

- [ ] **Step 1: Add helper to detect INVENTTABLE error**

Near the top of the render return, just before the first `return (`, add a helper inside the component body (or as a module-level pure function). Since we need it in two places, define a helper:

```ts
function isInventtableError(msg: string | undefined | null): boolean {
  return !!msg?.includes('INVENTTABLE field not focused');
}
```

Place it **outside** the component (module level) to avoid re-creation on every render.

- [ ] **Step 2: Update the `isPersistedError` block**

Find (around line 1378):

```tsx
{isPersistedError && (
  <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
    <div style={{ ... }}>
      Errore: {order.errorMessage || "Errore sconosciuto"}
    </div>
    <button onClick={() => handleRetryOrder(order.id!)} ...>
      🔄 Riprova Ordine
    </button>
  </div>
)}
```

Replace the inner content with:

```tsx
{isPersistedError && (
  <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
    <div
      style={{
        padding: "0.75rem 1rem",
        backgroundColor: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: "6px",
        color: "#991b1b",
        fontSize: isMobile ? "0.8125rem" : "0.875rem",
      }}
    >
      {isInventtableError(order.errorMessage) ? (
        <>
          <p style={{ margin: '0 0 0.5rem 0' }}>
            La scheda anagrafica del cliente <strong>{order.customerName}</strong> non è
            completa in Archibald ERP e non è stato possibile inserire gli articoli.
            Aggiorna i dati del cliente e reinvia l&apos;ordine.
          </p>
          {customersMap.get(order.customerId) && (
            <button
              onClick={() =>
                setEditCustomerForCompleteness(customersMap.get(order.customerId)!)
              }
              style={{
                background: 'none',
                border: '1px solid #991b1b',
                color: '#991b1b',
                borderRadius: '4px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Completa scheda →
            </button>
          )}
        </>
      ) : (
        <>Errore: {order.errorMessage || 'Errore sconosciuto'}</>
      )}
    </div>
    <button
      onClick={() => handleRetryOrder(order.id!)}
      style={{
        padding: "0.75rem 1.25rem",
        backgroundColor: "#f59e0b",
        color: "white",
        border: "none",
        borderRadius: "6px",
        fontSize: "0.9375rem",
        fontWeight: "600",
        cursor: "pointer",
        marginTop: "0.75rem",
        width: isMobile ? "100%" : "auto",
      }}
    >
      🔄 Riprova Ordine
    </button>
  </div>
)}
```

- [ ] **Step 3: Update the `isJobFailed` block similarly**

Find the `isJobFailed` section (around line 1356). The `JobProgressBar` already receives `error={isJobFailed ? order.jobError : undefined}` and renders it internally. After the `JobProgressBar`, add the INVENTTABLE-specific block only when `isInventtableError(order.jobError)`:

```tsx
{isJobFailed && isInventtableError(order.jobError) && (
  <div
    style={{
      marginTop: '0.75rem',
      padding: '0.75rem 1rem',
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '6px',
      color: '#991b1b',
      fontSize: isMobile ? '0.8125rem' : '0.875rem',
    }}
  >
    <p style={{ margin: '0 0 0.5rem 0' }}>
      La scheda anagrafica del cliente <strong>{order.customerName}</strong> non è
      completa in Archibald ERP e non è stato possibile inserire gli articoli.
      Aggiorna i dati del cliente e reinvia l&apos;ordine.
    </p>
    {customersMap.get(order.customerId) && (
      <button
        onClick={() =>
          setEditCustomerForCompleteness(customersMap.get(order.customerId)!)
        }
        style={{
          background: 'none',
          border: '1px solid #991b1b',
          color: '#991b1b',
          borderRadius: '4px',
          padding: '4px 10px',
          cursor: 'pointer',
          fontSize: '0.875rem',
        }}
      >
        Completa scheda →
      </button>
    )}
  </div>
)}
```

- [ ] **Step 4: Run type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "feat(pending-orders): show user-friendly message for INVENTTABLE bot error"
```

---

## Task 7: Update tests

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.completeness.spec.tsx`

### Context

The existing spec file has two tests. One of them asserts `screen.getByText('⚠ Cliente incompleto')` — this text no longer exists after Task 4. We need to update that test and add new ones covering:
1. Badge shows missing fields text.
2. "Valida ora →" shown when only P.IVA missing and `vatNumber` present.
3. "Completa scheda →" shown when other fields missing.
4. Checkbox is disabled for incomplete customer.

The mock setup in the file already has `checkCustomerCompleteness` mocked to return `{ ok: false, missing: ['P.IVA non validata'] }` and `mockCustomer` with `vatNumber: null`.

- [ ] **Step 1: Update the existing failing test**

The test `'shows incomplete badge when checkCustomerCompleteness returns ok: false'` currently expects `⚠ Cliente incompleto`. Update it to expect the missing field text:

```ts
test('shows missing fields in badge when customer is incomplete', async () => {
  render(
    <MemoryRouter>
      <PendingOrdersPage />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.getByText(/P\.IVA non validata/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Add test — "Valida ora" shown when only P.IVA missing and vatNumber present**

Add `mockCustomerWithVat` at the top of the test file:

```ts
const mockCustomerWithVat = { ...mockCustomer, vatNumber: '12345678901' };
```

Add test:

```ts
test('shows "Valida ora" button when only VAT missing and vatNumber is present', async () => {
  vi.mocked(getCustomers).mockResolvedValue({
    success: true,
    data: { customers: [mockCustomerWithVat as never], total: 1 },
  });

  render(
    <MemoryRouter>
      <PendingOrdersPage />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByText('Valida ora →')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Add test — "Completa scheda" shown when other fields missing**

```ts
test('shows "Completa scheda" button when non-VAT fields are missing', async () => {
  vi.mocked(checkCustomerCompleteness).mockReturnValue({
    ok: false,
    missing: ['PEC o SDI mancante', 'Indirizzo mancante'],
  });

  render(
    <MemoryRouter>
      <PendingOrdersPage />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByText('Completa scheda →')).toBeTruthy();
  });
});
```

Note: import `checkCustomerCompleteness` mock reference at top if not already imported:

```ts
import { checkCustomerCompleteness } from '../utils/customer-completeness';
```

- [ ] **Step 4: Add test — checkbox is disabled when customer is incomplete**

```ts
test('disables order checkbox when customer is incomplete and order is not ghost-only', async () => {
  render(
    <MemoryRouter>
      <PendingOrdersPage />
    </MemoryRouter>,
  );

  await waitFor(() => {
    // Wait for customers to load and badge to appear
    screen.getByText(/P\.IVA non validata/);
  });

  const checkboxes = screen.getAllByRole('checkbox');
  // The first checkbox is "Seleziona Tutti", second is the order checkbox
  const orderCheckbox = checkboxes[1];
  expect(orderCheckbox).toHaveProperty('disabled', true);
});
```

- [ ] **Step 5: Run tests**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose PendingOrdersPage.completeness
```

Expected: all tests pass.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
npm test --prefix archibald-web-app/frontend
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.completeness.spec.tsx
git commit -m "test(pending-orders): update and extend completeness badge tests"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: no errors.

- [ ] **Step 2: Run all frontend tests**

```bash
npm test --prefix archibald-web-app/frontend
```

Expected: all tests pass.

- [ ] **Step 3: Manual smoke test checklist**

With the dev server running:

1. Open `/pending-orders` with an order whose customer has P.IVA non validata but `vatNumber` present → badge shows "P.IVA non validata" + "Valida ora →", checkbox is disabled.
2. Open `/pending-orders` with an order whose customer has PEC/SDI missing → badge shows "PEC o SDI mancante" + "Completa scheda →", checkbox is disabled.
3. Click "Completa scheda →" → `CustomerCreateModal` opens with customer data pre-filled.
4. Close modal → badge refreshes if data was updated.
5. Open `/pending-orders` with an order in `error` status whose `errorMessage` contains "INVENTTABLE field not focused" → user-friendly message is shown, not raw technical error.
6. Ghost-only order with incomplete customer → checkbox is enabled.
7. "Seleziona Tutti" → only selects orders with complete customers.

# Customer Completeness Check — Implementation Design

## Goal

When a user selects a customer in `OrderFormSimple` to create a new order, the system checks whether the customer has all essential data. If data is missing, a non-blocking warning banner is shown. The user can still save a pending order, but:
1. A visual indicator on the pending order in `PendingOrdersPage` signals that the customer data is incomplete
2. The `submit-order` backend handler rejects the job if customer data is still incomplete at submission time

## Architecture

Three units involved:

- `src/utils/customer-completeness.ts` — pure function, shared between frontend components
- `OrderFormSimple.tsx` — warning banner when customer is selected
- `PendingOrdersPage.tsx` — visual indicator per order; submit guard uses backend error
- `submit-order.ts` (backend) — enforce completeness before bot execution

No new tables needed. All data is already on `agents.customers`.

---

## Data Model

The check uses only fields already returned by the existing customer API (type `Customer` from `frontend/src/types/customer.ts`):

| Field on `Customer` | Check | Note |
|---------------------|-------|------|
| `vatValidatedAt` | truthy | `null` or empty string → fail |
| `pec` OR `sdi` | at least one truthy | both null/empty → fail |
| `street` | truthy | null or empty string → fail |
| `postalCode` | truthy | null or empty string → fail |

**Important:** the check uses truthy (`!!value`) not `!= null`, because `mapBackendCustomer` in `customers.service.ts` currently maps missing address fields to `""` (empty string) rather than `null`. Both `null` and `""` must be treated as missing.

`name` is always required at creation, so it is not checked.

---

## `customer-completeness.ts`

```typescript
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

`Customer` from `frontend/src/types/customer.ts` already contains `vatValidatedAt`, `pec`, `sdi`, `street`, `postalCode`. `OrderFormSimple` currently uses a leaner `local-customer` type internally — the `checkCustomerCompleteness` function must receive a `Customer` (rich type). The customer object returned by `customerService.getCustomers()` already uses this type; it is the same object stored in `selectedCustomer` state (which is typed as `Customer | null` in `OrderFormSimple`).

---

## OrderFormSimple Changes

### On customer selection

```typescript
const completeness = checkCustomerCompleteness(customer);
setCustomerCompleteness(completeness);
```

Re-runs every time `selectedCustomer` changes.

WebSocket-driven re-check (e.g. when `vat_validated_at` is updated by a background job) is **out of scope** for this spec. Only user-initiated customer-selection and post-modal-close re-check are covered.

### Banner

Rendered immediately below the customer selector when `!customerCompleteness.ok`:

```
⚠ Dati cliente incompleti: [lista campi mancanti separati da virgola]
  [Aggiorna scheda →]
```

- Style: orange background `#fff3cd`, border `#ffc107`, text `#856404`
- Non-blocking: user can still add items and save as pending
- "Aggiorna scheda →" button: sets `editCustomerForCompleteness = selectedCustomer` state, which renders `<CustomerCreateModal isEditMode editCustomer={editCustomerForCompleteness} onClose={handleCompletionModalClose} />`
- `handleCompletionModalClose`: re-fetches the customer via `customerService.getCustomerByProfile(selectedCustomer.customerProfile)`, updates `selectedCustomer` state, re-runs `checkCustomerCompleteness`

### No block on save-as-pending

The "Salva ordine" button in `OrderFormSimple` is **not** disabled by completeness. The user can always save a pending order regardless.

---

## PendingOrdersPage Changes

Each pending order already has a `customerProfile` reference. When rendering the orders list, the page fetches customer objects (already done today for display). For each order where `checkCustomerCompleteness(customer).ok === false`, show a small orange badge "⚠ Cliente incompleto" on the order card.

The "Invia ad Archibald" button for that order is **not** disabled in the UI (UX: don't block — let the backend reject with a clear error). The badge alone is sufficient to inform the user.

---

## Backend — submit-order handler

In `src/operations/handlers/submit-order.ts`, before any bot work:

```typescript
const customer = await getCustomerByProfile(pool, userId, data.customerProfile);
if (!customer) {
  return { success: false, error: 'Cliente non trovato' };
}
if (!isCustomerComplete(customer)) {
  return {
    success: false,
    error: 'Dati cliente incompleti. Aggiorna la scheda cliente prima di inviare l\'ordine.',
  };
}
```

`isCustomerComplete` is a pure function in `src/utils/customer-completeness-backend.ts` (mirrors the frontend logic, same truthy checks on `vat_validated_at`, `pec || sdi`, `street`, `postal_code`). Kept separate from the frontend utility to avoid mixing frontend/backend concerns.

This is the enforcement gate. The frontend banner is informational only.

---

## Files

| File | Action |
|------|--------|
| `frontend/src/utils/customer-completeness.ts` | Create |
| `frontend/src/utils/customer-completeness.spec.ts` | Create |
| `frontend/src/components/OrderFormSimple.tsx` | Modify: banner + re-fetch after edit |
| `frontend/src/pages/PendingOrdersPage.tsx` | Modify: incomplete badge per order |
| `backend/src/utils/customer-completeness-backend.ts` | Create |
| `backend/src/utils/customer-completeness-backend.spec.ts` | Create |
| `backend/src/operations/handlers/submit-order.ts` | Modify: completeness guard |
| `backend/src/operations/handlers/submit-order.spec.ts` | Modify |

---

## Testing

**Frontend `customer-completeness.ts`** (Vitest, pure function):
- All fields present → `{ ok: true, missing: [] }`
- `vatValidatedAt = null` → missing includes 'P.IVA non validata'
- `vatValidatedAt = ""` → missing includes 'P.IVA non validata' (truthy check)
- `pec` only → ok (no sdi required)
- `sdi` only → ok
- neither pec nor sdi → missing includes 'PEC o SDI mancante'
- `street = null` → missing
- `street = ""` → missing
- `postalCode = null` → missing
- Multiple missing → all listed

**Backend `customer-completeness-backend.ts`**: same cases, different field names (`vat_validated_at`, `pec`, `sdi`, `street`, `postal_code`).

**`submit-order.ts` integration**: mock `getCustomerByProfile` returning incomplete customer → handler returns error without calling bot.

**`OrderFormSimple.tsx`** (Vitest + Testing Library, focused render with mocked `customerService`): banner appears when incomplete customer selected; banner disappears after mock edit re-fetch returns complete customer.

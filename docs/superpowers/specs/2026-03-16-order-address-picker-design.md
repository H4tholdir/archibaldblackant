# Order Address Picker (Fase 4) — Implementation Design

## Goal

When creating a new order in `OrderFormSimple`, if the selected customer has two or more delivery addresses (tipo `Consegna` or `Indir. cons. alt.`), show a dropdown picker so the user can choose the delivery address. The selected address ID is passed through the order submission flow, and the bot selects the correct address from the "SELEZIONARE L'INDIRIZZO" dropdown in Archibald.

## Dependencies

Requires **Spec B** (Multi-Address Data Layer) to be deployed:
- `agents.customer_addresses` table populated by sync
- `GET /api/customers/:profile/addresses` endpoint available (defined in Spec B, `backend/src/routes/customer-addresses.ts`)
- `frontend/src/services/customer-addresses.ts` service created (Spec B)

---

## Architecture

```
OrderFormSimple
  └─ customer selected
       └─ GET /api/customers/:profile/addresses   (Spec B endpoint)
            └─ filter tipo IN ('Consegna', 'Indir. cons. alt.')
                 └─ count ≥ 2 → show picker
                      └─ selectedDeliveryAddressId: number | null
                           └─ submit-order payload: { deliveryAddressId }
                                └─ bot: select from "SELEZIONARE L'INDIRIZZO" dropdown
```

---

## 1. Frontend — `OrderFormSimple`

### Load delivery addresses on customer selection

When `handleSelectCustomer(customer)` is called (already exists), also fetch:

```typescript
const addresses = await getCustomerAddresses(customer.customerProfile);
const deliveryAddresses = addresses.filter(
  a => a.tipo === 'Consegna' || a.tipo === 'Indir. cons. alt.'
);
setDeliveryAddresses(deliveryAddresses);
setSelectedDeliveryAddressId(
  deliveryAddresses.length === 1 ? deliveryAddresses[0].id : null
);
```

If exactly one delivery address → auto-select it (no picker shown).
If zero → no picker, no auto-select.
If two or more → show picker.

### Picker UI

Rendered below the customer selector, only when `deliveryAddresses.length >= 2`:

```
Indirizzo di consegna: [dropdown]
  ○ Via Francesco Petrarca, 26 — 83047 Lioni  (Indir. cons. alt.)
  ○ Corso Garibaldi, 164 — 84122 Salerno       (Consegna)
  ○ Strada Comunale Isca, 8 — 84020 Oliveto Citra (Indir. cons. alt.)
```

Format per option: `Via, CAP Città (Tipo)`

The picker is required if shown — user must select before submitting.

### Submit guard

If `deliveryAddresses.length >= 2 && selectedDeliveryAddressId === null`:
- "Invia ad Archibald" button disabled
- Tooltip: "Seleziona un indirizzo di consegna"

---

## 2. `SubmitOrderData` — add `deliveryAddressId` and `deliveryAddress`

In `backend/src/operations/handlers/submit-order.ts`:

```typescript
type SubmitOrderData = {
  // ... existing fields ...
  deliveryAddressId?: number;
  deliveryAddress?: CustomerAddress | null;  // resolved from DB, not sent by client
};
```

`deliveryAddressId` comes in the job payload from the frontend. `deliveryAddress` is resolved inside the handler and set on the data object before calling the bot:

```typescript
if (data.deliveryAddressId) {
  data.deliveryAddress = await getAddressById(pool, userId, data.deliveryAddressId) ?? null;
}
```

The bot's `createOrder(orderData: SubmitOrderData)` already takes `SubmitOrderData`, so adding `deliveryAddress` to the type is sufficient — no change to `SubmitOrderBot` interface is needed.

`CustomerAddress` is imported from `backend/src/db/repositories/customer-addresses.ts` (defined in Spec B).

---

## 3. Bot — `createOrder` changes

In `archibald-bot.ts`, `createOrder(orderData)` method. Note: the actual bot method is `createOrder`, not `submitOrder`.

After the bot selects the customer in Archibald's order form, it checks for the "SELEZIONARE L'INDIRIZZO" dropdown. This dropdown only appears when the customer has multiple delivery addresses configured in Archibald.

**Type change required:** `ArchibaldBot.createOrder` currently takes `orderData: OrderData` (from `z.infer<typeof createOrderSchema>`). To access `orderData.deliveryAddress` inside the method body, the parameter type must be updated to `SubmitOrderData` (imported from `../operations/handlers/submit-order`). `SubmitOrderData` will gain `deliveryAddress?: CustomerAddress | null` via Section 2 of this spec. `SubmitOrderData` is a structural superset of `OrderData` (has all its fields plus extras), so `ArchibaldBot` continues to satisfy the `SubmitOrderBot` interface. Remove the existing `import type { OrderData } from "../types"` in `archibald-bot.ts` if unused after this change; add `import type { SubmitOrderData } from '../operations/handlers/submit-order'`.

### New logic

```typescript
if (orderData.deliveryAddress) {
  await this.selectDeliveryAddress(orderData.deliveryAddress);
}
```

### New method: `selectDeliveryAddress(address: CustomerAddress)`

```typescript
private async selectDeliveryAddress(address: CustomerAddress): Promise<void>
```

**Two handled cases:**

**Case 1 — Dropdown absent:** The "SELEZIONARE L'INDIRIZZO" dropdown is not present on the page (customer has no alt addresses configured in Archibald, or the address is pre-filled automatically).

```typescript
const dropdown = await page.waitForSelector('[id*="SELEZIONARE_L_INDIRIZZO"], [title*="SELEZIONARE"]', {
  timeout: 3000
}).catch(() => null);

if (!dropdown) {
  // Silent no-op: dropdown not shown means only one address — proceed
  return;
}
```

**Case 2 — Dropdown present but no matching option:** The dropdown exists but none of the listed options match the address.

1. Open the DevExpress dropdown
2. Search for the option matching `address.via` (case-insensitive, trimmed)
3. If found: select it, `waitForDevExpressIdle`
4. If **not found**: log warning and proceed without selecting

```typescript
// Match strategy: compare option text against address.via (most distinctive field)
const optionFound = await trySelectDropdownOption(dropdown, address.via ?? '');
if (!optionFound) {
  logger.warn('selectDeliveryAddress: no matching option found', {
    via: address.via,
    cap: address.cap,
  });
  // Proceed without selecting — do not throw
}
```

The order must not fail because of an address mismatch. Archibald may have slightly different via text than what's in the DB. Logging the warning is sufficient for debugging.

---

## 4. Order persistence — full `deliveryAddressId` chain

### Migration 028

```sql
ALTER TABLE agents.pending_orders
  ADD COLUMN delivery_address_id INTEGER DEFAULT NULL
  REFERENCES agents.customer_addresses(id) ON DELETE SET NULL;
```

(`agents.` prefix required; `ON DELETE SET NULL` so deleting the address doesn't delete the order.)

**Ordering requirement:** Migration 028 references `agents.customer_addresses(id)` which is created by migration 027 (Spec B). Migration runner applies files in filename/numeric order — 027 must be applied before 028. Since Spec B is a prerequisite of this spec, the deployment must apply Spec B (including its migration) before Spec D.

### `PendingOrderInput` (backend repository)

In `backend/src/db/repositories/pending-orders.ts`, add to **all three** types:

```typescript
// PendingOrderRow (raw pg row type):
delivery_address_id: number | null;

// PendingOrderInput (write type):
deliveryAddressId?: number | null;

// PendingOrder (read type):
deliveryAddressId: number | null;
```

The `upsertPendingOrder` uses a single `INSERT ... ON CONFLICT DO UPDATE` pattern. Both the INSERT column list AND the `ON CONFLICT DO UPDATE SET` clause must include `delivery_address_id = EXCLUDED.delivery_address_id`, otherwise an existing pending order's address selection will be silently lost on conflict.

`mapRowToPendingOrder` must map `row.delivery_address_id` → `deliveryAddressId`.

**`getAddressById` scoping**: `agents.customer_addresses` has a `user_id` column (confirmed in Spec B DDL: `user_id TEXT NOT NULL`). The query filters by both `id` AND `user_id` for security — an agent cannot access another agent's addresses.

### Frontend — pending order save

In `OrderFormSimple`, when saving a pending order, include `deliveryAddressId: selectedDeliveryAddressId` in the request payload to `savePendingOrder`.

**`frontend/src/api/pending-orders.ts`** — the `savePendingOrder` function serializes the request body. Add `deliveryAddressId` to the request body here (this is separate from `OrderFormSimple`'s call site). Also, `mapBackendOrder` (in the same file) maps raw backend JSON to the frontend `PendingOrder` type — add `deliveryAddressId: raw.deliveryAddressId ?? null` to the mapping.

In the frontend pending order type (`frontend/src/types/pending-order.ts` or equivalent), add `deliveryAddressId?: number | null`.

The `pending-orders` route (`backend/src/routes/pending-orders.ts`) saves pending orders; the `pendingOrderSchema` Zod object must accept `deliveryAddressId: z.number().optional().nullable()`.

### `PendingOrdersPage.tsx` — enqueue with `deliveryAddressId`

`PendingOrdersPage.tsx` has **two** `enqueueOperation('submit-order', ...)` call sites that must both be updated:
1. The bulk-submit path (user clicks "Invia ad Archibald" on a single order)
2. The `handleRetryOrder` path (retry of a previously failed order)

Both must include `deliveryAddressId: pendingOrder.deliveryAddressId` in the payload.

### Full retry flow

When a pending order is retried:
1. `submit-order` handler receives `deliveryAddressId` from the stored payload
2. Loads the address via `getAddressById(pool, userId, deliveryAddressId)`
3. Sets `data.deliveryAddress` and passes to bot

---

## Files

| File | Action |
|------|--------|
| `backend/src/db/migrations/028-pending-order-delivery-address.sql` | Create |
| `backend/src/db/repositories/customer-addresses.ts` | Modify: add `getAddressById` (if not already in Spec B) |
| `backend/src/db/repositories/pending-orders.ts` | Modify: add `deliveryAddressId` to `PendingOrderInput`, `PendingOrder`, upsert queries, `mapRowToPendingOrder` |
| `backend/src/routes/pending-orders.ts` | Modify: add `deliveryAddressId` to `pendingOrderSchema` |
| `backend/src/operations/handlers/submit-order.ts` | Modify: add `deliveryAddressId`+`deliveryAddress` to `SubmitOrderData`, load address, pass to bot |
| `backend/src/operations/handlers/submit-order.spec.ts` | Modify |
| `backend/src/bot/archibald-bot.ts` | Modify: change `createOrder` param from `OrderData` to `SubmitOrderData`; add `selectDeliveryAddress()` |
| `frontend/src/components/OrderFormSimple.tsx` | Modify: load addresses, show picker, include `deliveryAddressId` in save-pending call |
| `frontend/src/api/pending-orders.ts` | Modify: add `deliveryAddressId` to `savePendingOrder` body and `mapBackendOrder` mapping |
| `frontend/src/pages/PendingOrdersPage.tsx` | Modify: pass `deliveryAddressId` in BOTH `enqueueOperation('submit-order', ...)` call sites (submit + retry) |
| `frontend/src/types/pending-order.ts` (or equivalent) | Modify: add `deliveryAddressId?: number \| null` |

---

## Testing

**`selectDeliveryAddress`**: mock page with DevExpress dropdown — verify correct option selected by `via` match; verify silent no-op when dropdown not present; verify `logger.warn` + no throw when dropdown present but no matching option.

**`submit-order` handler**: when `deliveryAddressId` provided, verify address loaded from DB and passed to bot; when absent, bot called without address.

**`OrderFormSimple`**: picker appears when ≥2 delivery addresses; auto-selects when exactly 1; absent when 0; submit disabled until selection made.

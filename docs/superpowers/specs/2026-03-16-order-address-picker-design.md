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

## 2. `SubmitOrderData` — add `deliveryAddressId`

In `backend/src/operations/handlers/submit-order.ts`:

```typescript
type SubmitOrderData = {
  // ... existing fields ...
  deliveryAddressId?: number;
};
```

In the handler, when `deliveryAddressId` is present, load the address from DB using `getAddressById` (defined in Spec B repository):

```typescript
let deliveryAddress: CustomerAddress | null = null;
if (data.deliveryAddressId) {
  deliveryAddress = await getAddressById(pool, userId, data.deliveryAddressId);
}
```

Pass `deliveryAddress` to the bot.

---

## 3. Bot — `submitOrder` changes

In `archibald-bot.ts`, `submitOrder(orderData)` method.

After the bot selects the customer in Archibald's order form, it checks for the "SELEZIONARE L'INDIRIZZO" dropdown. This dropdown only appears when the customer has multiple delivery addresses configured in Archibald.

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

## 4. Order persistence — `agents.pending_orders` table

Migration 028 adds `delivery_address_id` to the `agents.pending_orders` table (separate file from migration 027):

```sql
ALTER TABLE agents.pending_orders
  ADD COLUMN delivery_address_id INTEGER DEFAULT NULL
  REFERENCES agents.customer_addresses(id) ON DELETE SET NULL;
```

Note:
- Schema prefix `agents.` is required.
- `ON DELETE SET NULL` — if the referenced address is deleted, the column becomes NULL (order is not deleted).
- `DEFAULT NULL` — existing pending orders are not affected.

When the order is saved as pending, store `deliveryAddressId`. When the order is submitted (retried), the handler reads `deliveryAddressId` from the pending order row.

---

## Files

| File | Action |
|------|--------|
| `backend/src/db/migrations/028-pending-order-delivery-address.sql` | Create |
| `backend/src/db/repositories/customer-addresses.ts` | Modify: add `getAddressById` (if not already in Spec B) |
| `backend/src/operations/handlers/submit-order.ts` | Modify: add `deliveryAddressId`, load address, pass to bot |
| `backend/src/operations/handlers/submit-order.spec.ts` | Modify |
| `backend/src/bot/archibald-bot.ts` | Modify: add `selectDeliveryAddress()` |
| `frontend/src/components/OrderFormSimple.tsx` | Modify: load addresses, show picker, pass to submit |

---

## Testing

**`selectDeliveryAddress`**: mock page with DevExpress dropdown — verify correct option selected by `via` match; verify silent no-op when dropdown not present; verify `logger.warn` + no throw when dropdown present but no matching option.

**`submit-order` handler**: when `deliveryAddressId` provided, verify address loaded from DB and passed to bot; when absent, bot called without address.

**`OrderFormSimple`**: picker appears when ≥2 delivery addresses; auto-selects when exactly 1; absent when 0; submit disabled until selection made.

# Multi-Address — Bot Support for Create/Edit (Fase 3) — Implementation Design

## Goal

Extend the Archibald bot and the create/edit customer handlers so that when a customer is created or updated, all `addresses[]` from `CustomerFormData` / `UpdateCustomerData` are written to the "Indirizzo alt." tab in Archibald ERP.

## Dependencies

Requires Spec B (Multi-Address Data Layer) to be fully deployed:
- `agents.customer_addresses` table exists
- `CustomerFormData.addresses[]` replaces the old `deliveryStreet/deliveryPostalCode` fields
- `UpdateCustomerData.addresses[]` field added

---

## Architecture

```
CustomerCreateModal
  └─ addresses: AddressEntry[]
       └─ POST /api/customers/interactive/:sessionId/save
            └─ bot.createCustomer(formData)   ← writes addresses to Archibald
            └─ bot.updateCustomer(...)         ← replaces addresses in Archibald
```

---

## Shared Type — `AddressEntry`

`AddressEntry` is defined in `backend/src/types.ts` alongside `CustomerFormData` (which already lives there). It mirrors `frontend/src/types/customer-form-data.ts`:

```typescript
type AddressEntry = {
  tipo: string;
  nome?: string;
  via?: string;
  cap?: string;
  citta?: string;
  contea?: string;
  stato?: string;
  idRegione?: string;
  contra?: string;
};
```

---

## 1. Bot — New Method: `writeAltAddresses(addresses: AddressEntry[])`

In `archibald-bot.ts`, new private method called from both `createCustomer` and `updateCustomer`.

### Strategy: full replace

The bot:
1. Opens the "Indirizzo alt." tab (`this.openCustomerTab("Indirizzo alt")`)
2. Deletes all existing rows (see below)
3. Inserts each address from the `addresses[]` array

This is the simplest correct strategy. Diffing existing vs. new rows is fragile with DevExpress grids.

### Delete all existing rows

The DevExpress grid on the "Indirizzo alt." tab uses a standard XAF List Editor. Deletion strategy:

```typescript
// 1. Count rows currently in the grid
const rowCount = await page.evaluate(() => {
  // DevExpress grid rows are rendered as <tr> elements inside the grid container.
  // The selector targets data rows (not header rows).
  const rows = document.querySelectorAll('.dxgvDataRow');
  return rows.length;
});

// 2. If no rows, skip delete step
if (rowCount === 0) return;

// 3. Select all rows via the header checkbox (if present) or row-by-row
// XAF List Editors typically show a "Select All" checkbox in the column header.
// If available:
const selectAllCheckbox = await page.$('[id*="SelectAll"], .dxgvSelectAllCheckBox');
if (selectAllCheckbox) {
  await selectAllCheckbox.click();
  await waitForDevExpressIdle();
}

// 4. Click the Delete toolbar button
// The XAF toolbar Delete button has an identifiable id pattern
await page.click('[id*="btnDelete"], [title="Delete"]');

// 5. Handle confirmation dialog (XAF shows a confirm dialog: "Are you sure you want to delete...?")
await page.waitForSelector('.dxpc-content', { timeout: 3000 }).catch(() => null);
const okButton = await page.$('button[id*="Btn_Yes"], button[id*="btnOK"], .dxpc-button:first-child');
if (okButton) {
  await okButton.click();
  await waitForDevExpressIdle();
}
```

**Important caveats:**
- The exact CSS selectors for the "Indirizzo alt." grid may differ from the above. The implementer must **inspect the actual DOM** of the Archibald ERP "Indirizzo alt." tab to discover the real selectors before coding. Use `page.evaluate(() => document.body.innerHTML)` in a dev/test session to capture the DOM.
- If the grid has **pagination** (DevExpress virtual or page-by-page), rows beyond the first page will not be captured by the select-all approach. In this case, repeat the delete cycle until `rowCount === 0`.
- If no select-all checkbox exists, fall back to **row-by-row deletion**: click each row's checkbox, then Delete, repeat until no rows remain.
- If the Delete button is not found or the confirmation dialog doesn't appear, log a warning and proceed (don't throw — the insert step will still run and the old rows will coexist; this is a degraded state, not a fatal error).

### Insert one address

For each `AddressEntry`:
1. Click the "Nuovo" (New) button in the grid toolbar
2. A new empty row appears in edit mode
3. Fill TIPO via DevExpress dropdown combo: Ufficio | Fattura | Consegna | Indir. cons. alt.
4. Fill VIA via `typeDevExpressField`
5. Fill CAP (INDIRIZZO LOGISTICO CODICE POSTALE) via `typeDevExpressField`
6. Fill CITTÀ via `typeDevExpressField`
7. Fill NOME (optional) if present
8. Press Tab to commit the row (or click the Save row button if present)
9. `waitForDevExpressIdle`

If `via`, `cap`, `citta` are all empty/null, skip insertion of that entry (it produces an empty row).

### Signature

```typescript
private async writeAltAddresses(addresses: AddressEntry[]): Promise<void>
```

Called with empty array → only deletes existing rows (clears the tab).

---

## 2. Bot — `createCustomer` and `completeCustomerCreation` changes

In `archibald-bot.ts`, **both** customer creation methods have a delivery address block that must be replaced:

### `createCustomer(formData: CustomerFormData)`

After filling all main fields, replace the old `if (customerData.deliveryStreet && ...) { await this.fillDeliveryAddress(...) }` block with:

```typescript
await this.writeAltAddresses(formData.addresses ?? []);
```

### `completeCustomerCreation(formData: CustomerFormData)`

This method is the interactive-session path (called from `customer-interactive.ts` save route). It has its own separate `fillDeliveryAddress` call. Replace that block with the same call:

```typescript
await this.writeAltAddresses(formData.addresses ?? []);
```

The old `fillDeliveryAddress` private method remains in the file (other non-customer flows may use it), but is no longer called from these two methods.

---

## 3. Bot — `updateCustomer` changes

In `updateCustomer(customerProfile, customerData, originalName)`:

Replace existing block:
```typescript
// OLD: if (customerData.deliveryStreet && customerData.deliveryPostalCode) { ... }
```

With:
```typescript
await this.writeAltAddresses(customerData.addresses ?? []);
```

---

## 4. `UpdateCustomerData` — replace delivery fields with `addresses[]`

In `backend/src/operations/handlers/update-customer.ts`:

Remove from `UpdateCustomerData`:
- `deliveryStreet?: string`
- `deliveryPostalCode?: string`
- `deliveryPostalCodeCity?: string`
- `deliveryPostalCodeCountry?: string`

Add:
```typescript
type UpdateCustomerData = {
  // ... existing fields (delivery fields removed) ...
  addresses?: AddressEntry[];
};
```

In `handleUpdateCustomer`, after the main UPDATE query and `bot.updateCustomer` call, upsert addresses into DB:

```typescript
await upsertAddressesForCustomer(pool, userId, data.customerProfile, data.addresses ?? []);
```

This keeps DB in sync with what was written to Archibald in the same operation.

---

## 5. `CustomerFormData` — already updated in Spec B

`addresses: AddressEntry[]` is already part of `CustomerFormData` after Spec B. No further changes needed here.

---

## 6. `customer-interactive.ts` — save route

In the `/:sessionId/save` route, `formData.addresses` is already included in the payload (it's part of `CustomerFormData`). The bot receives it via `completeCustomerCreation(formData)` which calls `createCustomer(formData)`.

After `completeCustomerCreation(formData)` returns the `customerProfile` string, and after `upsertSingleCustomer` persists the customer, also call:

```typescript
// customerProfile is the return value of completeCustomerCreation(formData)
await deps.upsertAddressesForCustomer(userId, customerProfile, formData.addresses ?? []);
```

Note: `deps.upsertAddressesForCustomer` is a dependency-injected function (added to `CustomerInteractiveRouterDeps` in Spec B). Do NOT access `pool` directly — use the deps wrapper.

---

## Files

| File | Action |
|------|--------|
| `backend/src/bot/archibald-bot.ts` | Modify: add `writeAltAddresses()`, update `createCustomer`, update `updateCustomer` |
| `backend/src/operations/handlers/update-customer.ts` | Modify: add `addresses?` to `UpdateCustomerData`, call `upsertAddressesForCustomer` |
| `backend/src/operations/handlers/update-customer.spec.ts` | Modify: add tests for addresses |
| `backend/src/routes/customer-interactive.ts` | Modify: add `upsertAddressesForCustomer` call in save route |

---

## Testing

**`writeAltAddresses`**: mock page, verify correct calls to `openCustomerTab`; verify delete interactions run before inserts; verify each `AddressEntry` field is typed; verify empty-array call only deletes.

**`updateCustomer` handler**: verify `upsertAddressesForCustomer` is called with the correct addresses when `UpdateCustomerData.addresses` is provided; verify empty array clears existing addresses.

**`createCustomer` path**: verify `writeAltAddresses` is called with the addresses from `CustomerFormData`.

**`customer-interactive.ts` save route**: verify `upsertAddressesForCustomer` is called after successful bot creation.

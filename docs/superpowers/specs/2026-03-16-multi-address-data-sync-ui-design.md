# Multi-Address — Data Layer, Sync & UI (Fase 2) — Implementation Design

## Goal

Store multiple alternative addresses per customer in a new `agents.customer_addresses` table. Sync them from Archibald automatically (same scheduler pattern as `sync-order-articles`). Expose them via CRUD API. Show and manage them in `CustomerCreateModal` (create and edit wizard) and in the `/customers` customer profile page.

## Dependencies

None. This spec is self-contained and is prerequisite for Spec C (bot write) and Spec D (order picker).

## Architecture Overview

```
Archibald ERP
  └─ bot.readAltAddresses()          ← new bot method (DOM scrape)
       └─ sync-customer-addresses    ← new BullMQ operation
            └─ customer_addresses    ← new DB table
                 ├─ CRUD API         ← new Express router
                 ├─ CustomerCreateModal (wizard step)
                 └─ /customers page (read-only display)
```

---

## 1. Database — Migration 027

Two changes only. **No migration of old delivery columns** — `delivery_street`, `delivery_postal_code`, etc. never existed as columns on `agents.customers` (they were frontend-only job-payload fields in `CustomerFormData`/`UpdateCustomerData`).

### New table `agents.customer_addresses`

```sql
CREATE TABLE agents.customer_addresses (
  id               SERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL,
  customer_profile TEXT NOT NULL,
  tipo             TEXT NOT NULL,   -- Ufficio | Fattura | Consegna | Indir. cons. alt.
  nome             TEXT,
  via              TEXT,
  cap              TEXT,
  citta            TEXT,
  contea           TEXT,
  stato            TEXT,
  id_regione       TEXT,
  contra           TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (customer_profile, user_id)
    REFERENCES agents.customers(customer_profile, user_id)
    ON DELETE CASCADE
  -- Note: PK on agents.customers is (customer_profile, user_id) in that order
);

CREATE INDEX ON agents.customer_addresses (user_id, customer_profile);
```

### Add `addresses_synced_at` to `agents.customers`

```sql
ALTER TABLE agents.customers
  ADD COLUMN addresses_synced_at TIMESTAMPTZ DEFAULT NULL;
```

---

## 2. Backend — Repository

File: `backend/src/db/repositories/customer-addresses.ts`

```typescript
type CustomerAddress = {
  id: number;
  userId: string;
  customerProfile: string;
  tipo: string;
  nome: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  contea: string | null;
  stato: string | null;
  idRegione: string | null;
  contra: string | null;
};

// getAddressesByCustomer(pool, userId, customerProfile): Promise<CustomerAddress[]>
// upsertAddressesForCustomer(pool, userId, customerProfile, addresses: Omit<CustomerAddress, 'id'|'userId'|'customerProfile'>[]): Promise<void>
//   → DELETE existing rows, INSERT new ones (full replace per customer, in a transaction)
//   → Idempotent: calling with the same data produces the same DB state
// getAddressById(pool, userId, id): Promise<CustomerAddress | null>
```

`upsertAddressesForCustomer` does a full replace (DELETE + INSERT) within a transaction. This is idempotent — calling with the same data produces the same DB state, which is safe for retries and scheduler re-runs.

---

## 3. Backend — CRUD API

File: `backend/src/routes/customer-addresses.ts`

Router mounted at `/api/customers/:customerProfile/addresses`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List addresses for customer |
| POST | `/` | Add one address |
| PUT | `/:id` | Update one address |
| DELETE | `/:id` | Delete one address |

All endpoints require auth (`req.user.userId`). GET is used by the order picker and the `/customers` profile page.

---

## 4. Sync — `sync-customer-addresses` Operation

### `AltAddress` type

`AltAddress` is defined in `backend/src/db/repositories/customer-addresses.ts` (the repository that owns this data):

```typescript
type AltAddress = {
  tipo: string;
  nome: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  contea: string | null;
  stato: string | null;
  idRegione: string | null;
  contra: string | null;
};
```

It is the `Omit<CustomerAddress, 'id'|'userId'|'customerProfile'>` shape — the same fields without the identity columns. It is exported from `customer-addresses.ts` and imported by `archibald-bot.ts`, `customer-interactive.ts`, and `sync-customer-addresses.ts`.

### Bot method: `readAltAddresses()`

In `archibald-bot.ts`, new method called after `navigateToEditCustomerForm`:

```typescript
async readAltAddresses(): Promise<AltAddress[]>
```

1. Calls `this.openCustomerTab("Indirizzo alt")`
2. Reads all visible rows from the DevExpress grid via `page.evaluate()`
3. Maps columns: TIPO, NOME, VIA, INDIRIZZO LOGISTICO CODICE POSTALE, CITTÀ, CONTEA, STATO, ID REGIONE, CONTRA
4. Returns array (empty if tab has no rows)
5. Does NOT navigate away — leaves bot on the same page

### Handler: `backend/src/operations/handlers/sync-customer-addresses.ts`

```typescript
// Input: { customerProfile: string, customerName: string }
// 1. bot.initialize()
// 2. bot.navigateToEditCustomerForm(customerName)
// 3. addresses = await bot.readAltAddresses()
// 4. upsertAddressesForCustomer(pool, userId, customerProfile, addresses)
// 5. UPDATE agents.customers SET addresses_synced_at = NOW()
//    WHERE customer_profile = $1 AND user_id = $2
// 6. await bot.close()
```

### operation-types.ts changes

`'sync-customer-addresses'` must be added to:
- `OPERATION_TYPES` array (append after `'sync-tracking'`)
- `OPERATION_PRIORITIES`: add `'sync-customer-addresses': 18` (no renumbering needed — appended after existing 17)
- `SCHEDULED_SYNCS` set (read-only ERP operation, same category as `sync-order-articles`)

Note: `sync-customer-addresses` is **not** added to `WRITE_OPERATIONS`. The operation reads from Archibald ERP (opens the customer edit form in read-only mode and scrapes the address tab). It does not modify ERP data. This is the same pattern as `sync-order-articles`, which also uses a bot browser session but is read-only. Both belong in `SCHEDULED_SYNCS` only.

### Scheduler integration

In `sync-scheduler.ts`, add a 4th optional parameter (note: this does NOT mirror `GetOrdersNeedingArticleSyncFn` which returns `Promise<string[]>` — it returns an array of objects instead):

```typescript
type GetCustomersNeedingAddressSyncFn = (
  userId: string,
  limit: number
) => Promise<Array<{ customer_profile: string; name: string }>>;
// Note: pg returns snake_case column names. The repository function returns
// { customer_profile, name } (raw SQL columns). The scheduler maps these
// when calling enqueue: { customerProfile: c.customer_profile, customerName: c.name }

function createSyncScheduler(
  enqueue: EnqueueFn,
  getActiveAgentIds: () => string[],
  getOrdersNeedingArticleSync?: GetOrdersNeedingArticleSyncFn,
  getCustomersNeedingAddressSync?: GetCustomersNeedingAddressSyncFn,
)
```

Inside the `agentSyncMs` interval, after the article sync timeout block:

```typescript
const ADDRESS_SYNC_BATCH_LIMIT = 10;
const ADDRESS_SYNC_DELAY_MS = 2 * 60 * 1000; // 2 min (after article sync)

if (getCustomersNeedingAddressSync) {
  pendingTimeouts.push(setTimeout(() => {
    getCustomersNeedingAddressSync(agentUserId, ADDRESS_SYNC_BATCH_LIMIT)
      .then((customers) => {
        for (const c of customers) {
          enqueue('sync-customer-addresses', agentUserId, {
            customerProfile: c.customer_profile,  // pg returns snake_case
            customerName: c.name,
          });
        }
      })
      .catch((error) => {
        logger.error('Failed to fetch customers needing address sync', { userId: agentUserId, error });
      });
  }, ADDRESS_SYNC_DELAY_MS));
}
```

`getCustomersNeedingAddressSync` query (in `customer-addresses.ts` repository):
```sql
SELECT customer_profile, name FROM agents.customers
WHERE user_id = $1
  AND addresses_synced_at IS NULL
ORDER BY last_sync DESC
LIMIT $2
```

### Reset on customer data change

In `customer-sync.ts`, in the UPDATE branch (hash changed), the existing UPDATE query is extended inline:

```sql
-- existing SET clause gains:
addresses_synced_at = NULL
```

This is not a new query — the existing UPDATE already sets other fields; add `addresses_synced_at = NULL` to the same SET clause. No new function needed.

This ensures that when Archibald customer data changes, addresses are re-read on the next sync cycle.

### On-demand refresh during start-edit

In `customer-interactive.ts`, `start-edit` route, after `bot.readEditFormFieldValues()`:

```typescript
const altAddresses = await bot.readAltAddresses();
await deps.upsertAddressesForCustomer(userId, customer.customerProfile, altAddresses);
await deps.setAddressesSyncedAt(userId, customer.customerProfile);
```

This is **inline in the route handler**, not queued. The bot is already open (we are in an interactive session), so this adds no extra browser startup cost. The addresses are fresh by the time the edit modal opens.

**Required interface changes:**

`CustomerBotLike` (in `customer-interactive.ts`) must gain:
```typescript
readAltAddresses: () => Promise<AltAddress[]>;
```

`CustomerInteractiveRouterDeps` must gain two new dependency functions:
```typescript
upsertAddressesForCustomer: (userId: string, customerProfile: string, addresses: AltAddress[]) => Promise<void>;
setAddressesSyncedAt: (userId: string, customerProfile: string) => Promise<void>;
```

Both are injected in `server.ts` where `createCustomerInteractiveRouter` is called, wrapped as closures over `pool`:

```typescript
// In server.ts, when calling createCustomerInteractiveRouter:
upsertAddressesForCustomer: (userId, customerProfile, addresses) =>
  upsertAddressesForCustomerRepo(pool, userId, customerProfile, addresses),
setAddressesSyncedAt: (userId, customerProfile) =>
  pool.query(
    'UPDATE agents.customers SET addresses_synced_at = NOW() WHERE customer_profile = $1 AND user_id = $2',
    [customerProfile, userId]
  ).then(() => undefined),
```

**`saveSchema` update:**

The existing `saveSchema` in `customer-interactive.ts` validates the delivery fields as optional. Remove **only** the delivery-specific fields (`deliveryStreet`, `deliveryPostalCode`, `deliveryPostalCodeCity`, `deliveryPostalCodeCountry`) — do **NOT** remove `postalCodeCity` and `postalCodeCountry`, which are used for main address disambiguation and must stay.

Add:
```typescript
addresses: z.array(z.object({
  tipo: z.string(),
  nome: z.string().optional(),
  via: z.string().optional(),
  cap: z.string().optional(),
  citta: z.string().optional(),
  contea: z.string().optional(),
  stato: z.string().optional(),
  idRegione: z.string().optional(),
  contra: z.string().optional(),
})).optional().default([]),
```

---

## 5. Frontend — CustomerCreateModal

### Wizard step change

The existing step sequence is:

```
...fields... → address-question → delivery-field (loop) → summary
```

Replace `address-question` + `delivery-field` steps with a new `addresses` step:

```
...fields... → addresses → summary
```

### `addresses` step UI

- Header: "Indirizzi alternativi"
- List of address cards already added (empty in create mode; pre-populated from `GET /api/customers/:profile/addresses` in edit mode)
- Each card shows: `[Tipo] Via, CAP Città` with Edit / Delete buttons
- "+ Aggiungi indirizzo" button → inline mini-form:
  - Tipo: dropdown (Ufficio | Fattura | Consegna | Indir. cons. alt.)
  - Via, CAP, Città (required core fields)
  - Nome (optional)
  - Confirm / Cancel
- "Avanti" button proceeds to summary regardless (addresses are optional)

### `CustomerFormData` change

File: `frontend/src/types/customer-form-data.ts`

Remove:
```typescript
deliveryStreet?: string;
deliveryPostalCode?: string;
deliveryPostalCodeCity?: string;
deliveryPostalCodeCountry?: string;
```

Add:
```typescript
addresses: AddressEntry[];

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

`AddressEntry` is exported from `frontend/src/types/customer-form-data.ts` and re-used wherever needed.

**`GetCustomersNeedingAddressSyncFn` export:** Add `GetCustomersNeedingAddressSyncFn` to the existing named export list in `sync-scheduler.ts` (e.g., `export { createSyncScheduler, ..., type GetCustomersNeedingAddressSyncFn }`) so `main.ts` can import and use it for the lambda type annotation.

**`addresses: AddressEntry[]` initialization:** In every place where a full `CustomerFormData` object is constructed (e.g., default initial state in `CustomerCreateModal`), add `addresses: []`. This is required because `addresses` is a non-optional field. Current construction sites to update: `CustomerCreateModal.tsx` initial state object.

---

**Consumers of `deliveryStreet` that must be updated (all `deliveryStreet` references removed):**
- `frontend/src/components/CustomerCreateModal.tsx` — removes `address-question` / `delivery-field` steps, adds `addresses` step
- `frontend/src/services/customers.service.ts` — contains inline delivery field types in multiple type shapes; update to remove delivery fields
- `frontend/src/utils/vat-diff.spec.ts` — contains hardcoded `deliveryStreet: ''` in baseline objects; update to remove these fields
- `backend/src/types.ts` — defines `CustomerFormData` with delivery fields; remove `deliveryStreet`, `deliveryPostalCode`, `deliveryPostalCodeCity`, `deliveryPostalCodeCountry`
- `backend/src/routes/customer-interactive.ts` — `saveSchema` has `deliveryStreet`, `deliveryPostalCode`, `deliveryPostalCodeCity`, `deliveryPostalCodeCountry` as optional fields; remove only these four (keep `postalCodeCity` and `postalCodeCountry`)
- `backend/src/operations/handlers/create-customer.ts` — `CustomerFormData` usage must drop delivery fields; bot now writes via `writeAltAddresses` (Spec C)
- `backend/src/bot/archibald-bot.ts` — `createCustomer` no longer reads `deliveryStreet`; replaced by `writeAltAddresses` (Spec C)
- `backend/src/operations/handlers/update-customer.ts` — `UpdateCustomerData` has delivery fields; remove `deliveryStreet`, `deliveryPostalCode`, `deliveryPostalCodeCity`, `deliveryPostalCodeCountry` and add `addresses?: AddressEntry[]` (this change is part of **Spec C**, not Spec B — listed here for cross-spec awareness)

In edit mode, the `addresses` step is pre-populated by calling `GET /api/customers/:profile/addresses` when the modal opens (alongside the existing `start-edit` bot session).

**`frontend/src/services/customer-addresses.ts`** — new file with these exported functions:

```typescript
import type { CustomerAddress } from '../types/customer';

async function getCustomerAddresses(customerProfile: string): Promise<CustomerAddress[]>
// GET /api/customers/:customerProfile/addresses

async function addCustomerAddress(customerProfile: string, address: AddressEntry): Promise<CustomerAddress>
// POST /api/customers/:customerProfile/addresses

async function updateCustomerAddress(customerProfile: string, id: number, address: AddressEntry): Promise<CustomerAddress>
// PUT /api/customers/:customerProfile/addresses/:id

async function deleteCustomerAddress(customerProfile: string, id: number): Promise<void>
// DELETE /api/customers/:customerProfile/addresses/:id
```

`CustomerAddress` frontend type lives in a new file **`frontend/src/types/customer-address.ts`** (not in the existing `customer.ts` to avoid growing that file):

```typescript
type CustomerAddress = {
  id: number;
  customerProfile: string;
  tipo: string;
  nome: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  contea: string | null;
  stato: string | null;
  idRegione: string | null;
  contra: string | null;
};

export type { CustomerAddress };
```

The `customer-addresses.ts` service imports: `import type { CustomerAddress } from '../types/customer-address';`

### Summary step

Shows list of added addresses (tipo + via + città) as read-only rows.

---

## 6. Frontend — `/customers` Page

In the customer profile card/detail view, add a read-only "Indirizzi alternativi" section:

- Calls `GET /api/customers/:profile/addresses`
- Displays a table: Tipo | Via | CAP | Città
- Empty state: "Nessun indirizzo alternativo registrato"
- No edit controls here (editing done via CustomerCreateModal)

---

## Files

| File | Action |
|------|--------|
| `backend/src/db/migrations/027-customer-addresses.sql` | Create |
| `backend/src/db/repositories/customer-addresses.ts` | Create |
| `backend/src/db/repositories/customer-addresses.spec.ts` | Create |
| `backend/src/routes/customer-addresses.ts` | Create |
| `backend/src/routes/customer-addresses.spec.ts` | Create |
| `backend/src/operations/handlers/sync-customer-addresses.ts` | Create |
| `backend/src/operations/handlers/sync-customer-addresses.spec.ts` | Create |
| `backend/src/operations/handlers/index.ts` | Modify (register handler) |
| `backend/src/operations/operation-types.ts` | Modify (add `sync-customer-addresses` to array, priorities, SCHEDULED_SYNCS) |
| `backend/src/sync/sync-scheduler.ts` | Modify (add 4th param `getCustomersNeedingAddressSync`, address sync timeout block) |
| `backend/src/sync/sync-scheduler.spec.ts` | Modify |
| `backend/src/sync/services/customer-sync.ts` | Modify (add `addresses_synced_at = NULL` to existing UPDATE query) |
| `backend/src/bot/archibald-bot.ts` | Modify (add `readAltAddresses`) |
| `backend/src/routes/customer-interactive.ts` | Modify (inline on-demand refresh in `start-edit`; remove delivery fields from `saveSchema`) |
| `backend/src/server.ts` | Modify (mount `customer-addresses` router at `/api/customers/:customerProfile/addresses`) |
| `backend/src/main.ts` | Modify (wire `getCustomersNeedingAddressSync` as 4th param to `createSyncScheduler`) |
| `backend/src/types.ts` | Modify (remove delivery fields from `CustomerFormData`) |
| `backend/src/operations/handlers/create-customer.ts` | Modify (remove `deliveryStreet`/`deliveryPostalCode` from usage) |
| `frontend/src/types/customer-form-data.ts` | Modify (replace delivery fields with `addresses: AddressEntry[]`) |
| `frontend/src/services/customers.service.ts` | Modify (remove inline delivery field type definitions) |
| `frontend/src/utils/vat-diff.spec.ts` | Modify (remove hardcoded delivery fields from test baseline objects) |
| `frontend/src/components/CustomerCreateModal.tsx` | Modify (remove address-question/delivery-field steps, add `addresses` step) |
| `frontend/src/pages/CustomerList.tsx` (or equivalent customers page) | Modify (add addresses section) |
| `frontend/src/types/customer-address.ts` | Create (`CustomerAddress` frontend type) |
| `frontend/src/services/customer-addresses.ts` | Create (API calls) |

---

## Testing

**Repository:** `upsertAddressesForCustomer` replaces all rows; `getAddressesByCustomer` returns correct subset by `userId`; empty-array upsert clears all rows.

**Sync handler:** mock bot returns addresses → verify upsert called + `addresses_synced_at` set.

**Scheduler:** verify `sync-customer-addresses` is enqueued after delay when customers have `NULL addresses_synced_at`; verify no-op when `getCustomersNeedingAddressSync` not provided.

**API routes:** GET returns addresses for correct user; POST/PUT/DELETE validate ownership.

**Frontend:** `addresses` step shows pre-populated addresses in edit mode; add/delete works correctly; empty state shows when no addresses.

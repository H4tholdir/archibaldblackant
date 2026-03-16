# VAT Lookup in Edit Mode — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere il VAT lookup interattivo al flow di modifica cliente, con step diff che permette all'utente di scegliere campo per campo quali valori Archibald applicare.

**Architecture:** La sessione interattiva esistente (WebSocket + Puppeteer) viene estesa con un endpoint `start-edit` che naviga il bot alla edit form del cliente via lista. Il frontend aggiunge nuovi step al modal (`vat-edit-check`, `vat-diff-review`) e logica di routing basata su `vatValidatedAt`. Tutto il nuovo codice puro (diff logic, step routing) vive in utility file testabili indipendentemente dal modal da 2290 righe.

**Tech Stack:** TypeScript strict, React 19, Vitest, Express, Zod, Puppeteer, PostgreSQL (pg pool), WebSocket

**Spec:** `docs/superpowers/specs/2026-03-16-vat-lookup-edit-mode-design.md`

---

## Chunk 1: Foundation — DB + Tipi + Utility Pure

---

### Task 1: Migration 026 — vat_validated_at

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/026-vat-validated-at.sql`

- [ ] **Step 1: Crea il file migration**

```sql
-- 026: traccia quando la P.IVA di un cliente è stata validata tramite Archibald
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS vat_validated_at TIMESTAMPTZ;
```

- [ ] **Step 2: Verifica che la migration giri senza errori (dev locale)**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: build passa senza errori.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/026-vat-validated-at.sql
git commit -m "feat(db): add vat_validated_at to agents.customers"
```

---

### Task 2: Backend — CustomerRow, Customer type, mapRowToCustomer, updateVatValidatedAt

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/customers.ts`

- [ ] **Step 1: Aggiungi `vat_validated_at` a `CustomerRow` (riga ~42 dopo `archibald_name`)**

Trova il blocco `type CustomerRow` (riga 4) e aggiungi il campo:

```typescript
  archibald_name: string | null;
  photo: string | null;
  vat_validated_at: string | null;   // ← aggiungi questa riga
};
```

- [ ] **Step 2: Aggiungi `vatValidatedAt` al tipo `Customer` del repo (riga ~80 dopo `archibaldName`)**

```typescript
  archibaldName: string | null;
  vatValidatedAt: string | null;   // ← aggiungi questa riga
```

- [ ] **Step 3: Aggiorna `mapRowToCustomer` per includere il nuovo campo**

Trova la funzione `mapRowToCustomer` (cerca `function mapRowToCustomer`) e aggiungi dopo `archibaldName`:

```typescript
  archibaldName: row.archibald_name,
  vatValidatedAt: row.vat_validated_at,   // ← aggiungi questa riga (string | null, come tutti gli altri)
```

- [ ] **Step 3b: Aggiorna `COLUMNS_WITHOUT_PHOTO` per includere il nuovo campo**

Trova la costante `COLUMNS_WITHOUT_PHOTO` (riga ~136) — è la stringa SQL usata dalla maggior parte delle query di lettura clienti. Senza questo step, `vat_validated_at` sarà sempre `undefined` nelle query che non usano `SELECT *`.

La costante termina con `last_sync, created_at, updated_at, bot_status, archibald_name`. Aggiungi `vat_validated_at` alla fine:

```typescript
const COLUMNS_WITHOUT_PHOTO = `
  customer_profile, user_id, internal_id, name,
  vat_number, fiscal_code, sdi, pec,
  phone, mobile, email, url, attention_to,
  street, logistics_address, postal_code, city,
  customer_type, type, delivery_terms, description,
  last_order_date, actual_order_count, actual_sales,
  previous_order_count_1, previous_sales_1, previous_order_count_2, previous_sales_2,
  external_account_number, our_account_number,
  hash, last_sync, created_at, updated_at, bot_status, archibald_name,
  vat_validated_at
`;
```

- [ ] **Step 4: Aggiungi la funzione `updateVatValidatedAt`**

Aggiungi questa funzione nella sezione exports del file (vicino ad `updateCustomerBotStatus`):

```typescript
async function updateVatValidatedAt(
  pool: DbPool,
  userId: string,
  customerProfile: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers
     SET vat_validated_at = NOW()
     WHERE customer_profile = $1 AND user_id = $2`,
    [customerProfile, userId],
  );
}
```

- [ ] **Step 5: Esporta la funzione**

Trova il blocco `export {` in fondo al file e aggiungi:

```typescript
export {
  // ...funzioni esistenti...
  updateVatValidatedAt,
};
```

- [ ] **Step 6: Verifica build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: `dist/` generato, zero errori TypeScript.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/customers.ts
git commit -m "feat(backend): add vatValidatedAt to Customer type and repo"
```

---

### Task 3: Frontend — Estrai tipi condivisi, aggiorna Customer

**Files:**
- Create: `archibald-web-app/frontend/src/types/customer-form-data.ts`
- Create: `archibald-web-app/frontend/src/types/vat-lookup-result.ts`
- Modify: `archibald-web-app/frontend/src/types/customer.ts`
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx:13-50`

- [ ] **Step 1: Crea `customer-form-data.ts`**

Questo tipo esiste già inline in `CustomerCreateModal.tsx` (righe 31–50). Lo estrai in un file condiviso.

```typescript
// archibald-web-app/frontend/src/types/customer-form-data.ts
export type CustomerFormData = {
  name: string;
  deliveryMode: string;
  vatNumber: string;
  paymentTerms: string;
  pec: string;
  sdi: string;
  street: string;
  postalCode: string;
  phone: string;
  mobile: string;
  email: string;
  url: string;
  deliveryStreet: string;
  deliveryPostalCode: string;
  postalCodeCity: string;
  postalCodeCountry: string;
  deliveryPostalCodeCity: string;
  deliveryPostalCodeCountry: string;
};
```

- [ ] **Step 2: Crea `vat-lookup-result.ts`**

Questo tipo esiste inline in `CustomerCreateModal.tsx` (righe 13–29).

```typescript
// archibald-web-app/frontend/src/types/vat-lookup-result.ts
export type VatAddressInfo = {
  companyName: string;
  street: string;
  postalCode: string;
  city: string;
  vatStatus: string;
  internalId: string;
};

export type VatLookupResult = {
  lastVatCheck: string;
  vatValidated: string;
  vatAddress: string;
  parsed: VatAddressInfo;
  pec: string;
  sdi: string;
};
```

- [ ] **Step 3: Aggiorna `frontend/src/types/customer.ts`**

Il tipo in questo file è dichiarato come `interface Customer` (non `type`). Apri il file e:
1. Correggi `internalId: string` → `internalId: string | null`
2. Aggiungi `vatValidatedAt: string | null` come ultimo campo prima della chiusura `}`

```typescript
export interface Customer {
  customerProfile: string;
  internalId: string | null;      // era: string — correggi in string | null
  // ...tutti i campi esistenti invariati...
  botStatus?: "pending" | "placed" | "failed" | null;
  photoUrl?: string | null;
  vatValidatedAt: string | null;  // ← nuovo — aggiungi come ultimo campo
}
```

- [ ] **Step 4: Rimuovi inline types da `CustomerCreateModal.tsx`**

**Righe da rimuovere: 13–50** (NON la riga 11 che contiene `ProcessingState` — quella rimane locale).
- Riga 11: `type ProcessingState = ...` — **mantieni**
- Righe 13–29: `VatAddressInfo`, `VatLookupResult` — **rimuovi**
- Righe 31–50: `interface CustomerFormData` — **rimuovi**

Aggiungi gli import dai nuovi file **dopo** la riga 11 (dopo `ProcessingState`):

```typescript
import type { CustomerFormData } from "../types/customer-form-data";
import type { VatLookupResult } from "../types/vat-lookup-result";
```

- [ ] **Step 5: Verifica type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: zero errori TypeScript.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/types/
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "refactor(frontend): extract CustomerFormData and VatLookupResult to shared types"
```

---

### Task 4: Utility pura `determineVatEditStep` — TDD

**Dipendenza:** Task 3 deve essere completato prima — il tipo `Customer` frontend deve già avere `vatValidatedAt: string | null`.

**Files:**
- Create: `archibald-web-app/frontend/src/utils/vat-edit-step.ts`
- Create: `archibald-web-app/frontend/src/utils/vat-edit-step.spec.ts`

- [ ] **Step 1: Scrivi il test (TDD — prima il test)**

```typescript
// archibald-web-app/frontend/src/utils/vat-edit-step.spec.ts
import { describe, expect, test } from 'vitest';
import { determineVatEditStep } from './vat-edit-step';
import type { Customer } from '../types/customer';

const base: Customer = {
  customerProfile: 'TEST-001',
  internalId: '55.123',
  name: 'Test Cliente',
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
  hash: 'abc123',
  lastSync: 0,
  createdAt: 0,
  updatedAt: 0,
  botStatus: null,
  vatValidatedAt: null,
};

describe('determineVatEditStep', () => {
  test('vatNumber null → force-vat-input', () => {
    expect(determineVatEditStep({ ...base, vatNumber: null, vatValidatedAt: null }))
      .toBe('force-vat-input');
  });

  test('vatNumber vuoto → force-vat-input', () => {
    expect(determineVatEditStep({ ...base, vatNumber: '', vatValidatedAt: null }))
      .toBe('force-vat-input');
  });

  test('vatNumber presente, mai validata → auto-validate', () => {
    expect(determineVatEditStep({ ...base, vatNumber: '12345678901', vatValidatedAt: null }))
      .toBe('auto-validate');
  });

  test('vatNumber presente, già validata → show-validated-check', () => {
    expect(determineVatEditStep({ ...base, vatNumber: '12345678901', vatValidatedAt: '2026-01-13T09:02:21Z' }))
      .toBe('show-validated-check');
  });

  test('vatValidatedAt presente ma vatNumber null → force-vat-input (inconsistenza)', () => {
    expect(determineVatEditStep({ ...base, vatNumber: null, vatValidatedAt: '2026-01-13T09:02:21Z' }))
      .toBe('force-vat-input');
  });

  test('vatValidatedAt presente ma vatNumber vuoto → force-vat-input (inconsistenza)', () => {
    expect(determineVatEditStep({ ...base, vatNumber: '', vatValidatedAt: '2026-01-13T09:02:21Z' }))
      .toBe('force-vat-input');
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/frontend -- src/utils/vat-edit-step.spec.ts
```

Expected: FAIL — `Cannot find module './vat-edit-step'`

- [ ] **Step 3: Implementa la funzione**

```typescript
// archibald-web-app/frontend/src/utils/vat-edit-step.ts
import type { Customer } from '../types/customer';

export type VatEditStepDecision =
  | 'force-vat-input'       // → step { kind: "vat-input" }
  | 'auto-validate'         // → step { kind: "vat-processing" } + auto-submit su READY
  | 'show-validated-check'; // → step { kind: "vat-edit-check" }

export function determineVatEditStep(customer: Customer): VatEditStepDecision {
  const hasVat = !!customer.vatNumber && customer.vatNumber.trim().length > 0;

  if (!hasVat) return 'force-vat-input';
  if (!customer.vatValidatedAt) return 'auto-validate';
  return 'show-validated-check';
}
```

- [ ] **Step 4: Esegui i test — devono passare**

```bash
npm test --prefix archibald-web-app/frontend -- src/utils/vat-edit-step.spec.ts
```

Expected: 6/6 PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/utils/vat-edit-step.ts \
        archibald-web-app/frontend/src/utils/vat-edit-step.spec.ts
git commit -m "feat(frontend): add determineVatEditStep utility with tests"
```

---

### Task 5: Utility pura `buildVatDiff` — TDD

**Files:**
- Create: `archibald-web-app/frontend/src/utils/vat-diff.ts`
- Create: `archibald-web-app/frontend/src/utils/vat-diff.spec.ts`

- [ ] **Step 1: Scrivi i test**

```typescript
// archibald-web-app/frontend/src/utils/vat-diff.spec.ts
import { describe, expect, test } from 'vitest';
import { buildVatDiff } from './vat-diff';
import type { CustomerFormData } from '../types/customer-form-data';
import type { VatLookupResult } from '../types/vat-lookup-result';

const baseForm: CustomerFormData = {
  name: 'Rossi Mario',
  deliveryMode: 'FedEx',
  vatNumber: '01806980650',
  paymentTerms: '206',
  pec: 'mario@pec.it',
  sdi: 'ABC1234',
  street: 'Via Roma 1',
  postalCode: '80100',
  phone: '+39123',
  mobile: '+39456',
  email: 'mario@email.it',
  url: '',
  deliveryStreet: '',
  deliveryPostalCode: '',
  postalCodeCity: 'Napoli',
  postalCodeCountry: 'IT',
  deliveryPostalCodeCity: '',
  deliveryPostalCodeCountry: '',
};

const baseVatResult: VatLookupResult = {
  lastVatCheck: '13/01/2026',
  vatValidated: 'Sì',
  vatAddress: 'Via Roma 1, 80100 Napoli',
  parsed: {
    companyName: 'Rossi Mario',
    street: 'Via Roma 1',
    postalCode: '80100',
    city: 'Napoli',
    vatStatus: 'Sì',
    internalId: '55.123',
  },
  pec: 'mario@pec.it',
  sdi: 'ABC1234',
};

describe('buildVatDiff', () => {
  test('campo identico → preSelected true', () => {
    const diff = buildVatDiff(baseForm, baseVatResult);
    const name = diff.find(d => d.key === 'name')!;
    expect(name).toEqual({
      key: 'name',
      label: 'Nome',
      current: 'Rossi Mario',
      archibald: 'Rossi Mario',
      preSelected: true,
    });
  });

  test('campo diverso → preSelected false', () => {
    const form = { ...baseForm, street: 'Via Vecchia 99' };
    const diff = buildVatDiff(form, baseVatResult);
    const street = diff.find(d => d.key === 'street')!;
    expect(street.preSelected).toBe(false);
    expect(street.current).toBe('Via Vecchia 99');
    expect(street.archibald).toBe('Via Roma 1');
  });

  test('campo vuoto nel current → preSelected true', () => {
    const form = { ...baseForm, pec: '' };
    const diff = buildVatDiff(form, baseVatResult);
    const pec = diff.find(d => d.key === 'pec')!;
    expect(pec.preSelected).toBe(true);
  });

  test('tutti campi diversi → nessuno preSelected', () => {
    // Tutti e 6 i campi del diff (name, street, postalCode, postalCodeCity, pec, sdi) diversi
    const form = {
      ...baseForm,
      name: 'Altro Nome',
      street: 'Via X 99',
      postalCode: '10100',
      postalCodeCity: 'Torino',
      pec: 'x@pec.it',
      sdi: 'ZZZ9999',
    };
    const vatResult = {
      ...baseVatResult,
      parsed: { ...baseVatResult.parsed, companyName: 'Diverso', street: 'Via Y', postalCode: '00100', city: 'Roma' },
      pec: 'y@pec.it',
      sdi: 'WWW1111',
    };
    const diff = buildVatDiff(form, vatResult);
    // Nessun campo deve essere pre-selezionato perché tutti sono diversi e non vuoti
    expect(diff.every(d => !d.preSelected)).toBe(true);
  });

  test('campo archibald null/undefined → archibald stringa vuota', () => {
    const vatResult = {
      ...baseVatResult,
      parsed: { ...baseVatResult.parsed, companyName: undefined as unknown as string },
    };
    const diff = buildVatDiff(baseForm, vatResult);
    const name = diff.find(d => d.key === 'name')!;
    expect(name.archibald).toBe('');
  });

  test('ritorna esattamente i 6 campi: name, street, postalCode, postalCodeCity, pec, sdi', () => {
    const diff = buildVatDiff(baseForm, baseVatResult);
    expect(diff.map(d => d.key)).toEqual(['name', 'street', 'postalCode', 'postalCodeCity', 'pec', 'sdi']);
  });
});
```

- [ ] **Step 2: Esegui i test — devono fallire**

```bash
npm test --prefix archibald-web-app/frontend -- src/utils/vat-diff.spec.ts
```

Expected: FAIL — `Cannot find module './vat-diff'`

- [ ] **Step 3: Implementa `buildVatDiff`**

```typescript
// archibald-web-app/frontend/src/utils/vat-diff.ts
import type { CustomerFormData } from '../types/customer-form-data';
import type { VatLookupResult } from '../types/vat-lookup-result';

export type VatDiffField = {
  key: keyof CustomerFormData;
  label: string;
  current: string;
  archibald: string;
  preSelected: boolean;
};

type DiffFieldDef = {
  key: keyof CustomerFormData;
  label: string;
  archibaldValue: (r: VatLookupResult) => string;
};

const DIFF_FIELDS: DiffFieldDef[] = [
  { key: 'name',           label: 'Nome',    archibaldValue: r => r.parsed?.companyName  ?? '' },
  { key: 'street',         label: 'Via',     archibaldValue: r => r.parsed?.street       ?? '' },
  { key: 'postalCode',     label: 'CAP',     archibaldValue: r => r.parsed?.postalCode   ?? '' },
  { key: 'postalCodeCity', label: 'Città',   archibaldValue: r => r.parsed?.city         ?? '' },
  { key: 'pec',            label: 'PEC',     archibaldValue: r => r.pec                  ?? '' },
  { key: 'sdi',            label: 'SDI',     archibaldValue: r => r.sdi                  ?? '' },
];

export function buildVatDiff(
  current: CustomerFormData,
  vatResult: VatLookupResult,
): VatDiffField[] {
  return DIFF_FIELDS.map(({ key, label, archibaldValue }) => {
    const currentVal = (current[key] as string) ?? '';
    const archibaldVal = archibaldValue(vatResult);
    return {
      key,
      label,
      current: currentVal,
      archibald: archibaldVal,
      preSelected: currentVal.trim() === '' || currentVal === archibaldVal,
    };
  });
}
```

- [ ] **Step 4: Esegui i test — devono passare**

```bash
npm test --prefix archibald-web-app/frontend -- src/utils/vat-diff.spec.ts
```

Expected: 6/6 PASS

- [ ] **Step 5: Verifica type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: zero errori.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/utils/vat-diff.ts \
        archibald-web-app/frontend/src/utils/vat-diff.spec.ts
git commit -m "feat(frontend): add buildVatDiff utility with tests"
```

---

## Chunk 2: Backend — Bot + Endpoint + Handler

---

### Task 6: Bot — `navigateToEditCustomerForm`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`

**Contesto:** Il metodo `updateCustomer` (riga ~12031) ha una funzione interna `searchAndFindCustomer` (riga ~12065). La si estrae in metodo privato e si aggiunge `navigateToEditCustomerForm`.

- [ ] **Step 1: Estrai `searchAndOpenCustomer` da `updateCustomer`**

Dentro il metodo `updateCustomer`, la funzione `searchAndFindCustomer` (righe ~12065–12200) viene usata per trovare il cliente nella lista e aprirlo. Estraila in un metodo privato della classe:

```typescript
private async searchAndOpenCustomer(nameToSearch: string): Promise<void> {
  // Sposta qui il corpo di searchAndFindCustomer + la logica che segue
  // (navigazione lista, ricerca, click sulla riga)
  // Se cliente non trovato: throw new Error(`Cliente non trovato: ${nameToSearch}`)
}
```

Poi in `updateCustomer`, sostituisci la logica duplicata con:
```typescript
await this.searchAndOpenCustomer(searchName);
```

- [ ] **Step 2: Aggiungi `navigateToEditCustomerForm`**

Aggiungi dopo `navigateToNewCustomerForm`:

```typescript
async navigateToEditCustomerForm(name: string): Promise<void> {
  if (!this.page) throw new Error("Browser page is null");

  logger.info("navigateToEditCustomerForm: navigating via list", { name });

  await this.page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  if (this.page.url().includes("Login.aspx")) {
    throw new Error("Sessione scaduta: reindirizzato al login");
  }

  await this.waitForDevExpressReady({ timeout: 10000 });
  await this.searchAndOpenCustomer(name);

  // Clicca il pulsante Edit / Modifica se non già in edit mode
  const isEditMode = this.page.url().includes("mode=Edit");
  if (!isEditMode) {
    await this.page.evaluate(() => {
      const editBtn = Array.from(document.querySelectorAll('a, button'))
        .find(el => /modifica|edit/i.test(el.textContent || ''));
      (editBtn as HTMLElement)?.click();
    });
    await this.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
  }

  await this.waitForDevExpressReady({ timeout: 10000 });
  logger.info("navigateToEditCustomerForm: edit form loaded", { name });
}
```

- [ ] **Step 3: Verifica build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: zero errori TypeScript.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): add navigateToEditCustomerForm, extract searchAndOpenCustomer"
```

---

### Task 7: `customer-interactive.ts` — Endpoint `start-edit` + write `vat_validated_at`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.ts`

- [ ] **Step 1: Estendi `CustomerBotLike`**

Aggiungi il metodo dopo l'ultimo metodo esistente:

```typescript
type CustomerBotLike = BotLike & {
  initialize: () => Promise<void>;
  navigateToNewCustomerForm: () => Promise<void>;
  navigateToEditCustomerForm: (name: string) => Promise<void>;   // ← nuovo
  submitVatAndReadAutofill: (vatNumber: string) => Promise<VatLookupResult>;
  completeCustomerCreation: (formData: CustomerFormData) => Promise<string>;
  createCustomer: (formData: CustomerFormData) => Promise<string>;
  setProgressCallback: (cb: (category: string, metadata?: unknown) => Promise<void>) => void;
};
```

- [ ] **Step 2: Estendi `CustomerInteractiveRouterDeps`**

```typescript
type CustomerInteractiveRouterDeps = {
  sessionManager: InteractiveSessionManager;
  createBot: (userId: string) => CustomerBotLike;
  broadcast: BroadcastFn;
  upsertSingleCustomer: (userId: string, formData: CustomerFormInput, customerProfile: string, botStatus: string) => Promise<Customer>;
  updateCustomerBotStatus: (userId: string, customerProfile: string, status: string) => Promise<void>;
  updateVatValidatedAt: (userId: string, customerProfile: string) => Promise<void>;   // ← nuovo
  getCustomerByProfile: (userId: string, customerProfile: string) => Promise<Customer | undefined>;   // ← nuovo (ritorna undefined se non trovato, come il repo)
  pauseSyncs: () => Promise<void>;
  resumeSyncs: () => void;
  smartCustomerSync?: () => Promise<void>;
  getCustomerProgressMilestone?: (category: string) => ProgressMilestone;
};
```

- [ ] **Step 3: Aggiorna destructuring in `createCustomerInteractiveRouter`**

```typescript
const {
  sessionManager, createBot, broadcast,
  upsertSingleCustomer, updateCustomerBotStatus,
  updateVatValidatedAt, getCustomerByProfile,   // ← aggiungi
  pauseSyncs, resumeSyncs,
  smartCustomerSync, getCustomerProgressMilestone,
} = deps;
```

- [ ] **Step 4: Aggiungi lo schema Zod per `start-edit`**

Dopo `saveSchema`:

```typescript
const startEditSchema = z.object({
  customerProfile: z.string().min(1, 'customerProfile obbligatorio'),
});
```

- [ ] **Step 5: Aggiungi endpoint `POST /start-edit`**

Aggiungi subito dopo il handler `router.post('/start', ...)` (prima di `/start/:sessionId/vat`):

```typescript
router.post('/start-edit', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const parsed = startEditSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
    }

    const customer = await getCustomerByProfile(userId, parsed.data.customerProfile);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Cliente non trovato' });
    }

    // Cancella sessione precedente se esiste
    const existing = sessionManager.getActiveSessionForUser(userId);
    if (existing) {
      const hadSyncsPaused = sessionManager.isSyncsPaused(existing.sessionId);
      await sessionManager.removeBot(existing.sessionId);
      sessionManager.destroySession(existing.sessionId);
      if (hadSyncsPaused) resumeSyncs();
    }

    const sessionId = sessionManager.createSession(userId);

    res.json({
      success: true,
      data: { sessionId },
      message: 'Sessione modifica cliente avviata',
    });

    (async () => {
      let bot: CustomerBotLike | null = null;
      try {
        sessionManager.updateState(sessionId, 'starting');
        await pauseSyncs();
        sessionManager.markSyncsPaused(sessionId, true);   // usa markSyncsPaused come il resto del codebase

        bot = createBot(userId);
        await bot.initialize();
        sessionManager.setBot(sessionId, bot);   // sincrono, no await

        await bot.navigateToEditCustomerForm(customer.name);

        sessionManager.updateState(sessionId, 'ready');
        broadcast(userId, {
          type: 'CUSTOMER_INTERACTIVE_READY',
          payload: { sessionId },
          timestamp: now(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Errore avvio sessione modifica';
        logger.error('start-edit session failed', { error: err, userId });
        sessionManager.updateState(sessionId, 'failed');
        broadcast(userId, {
          type: 'CUSTOMER_INTERACTIVE_FAILED',
          payload: { sessionId, error: message },
          timestamp: now(),
        });
        if (bot) await sessionManager.removeBot(sessionId);
        resumeSyncs();
      }
    })();
  } catch (error) {
    logger.error('Error starting edit session', { error });
    res.status(500).json({ success: false, error: 'Errore interno del server' });
  }
});
```

- [ ] **Step 6: Scrivi `vat_validated_at` nel percorso interactive CREATE (endpoint `/save`)**

Nella funzione `/save` (handler `router.post('/:sessionId/save', ...)`), cerca la variabile `customerProfileId` (riga ~325) — è il profilo finale assegnato da Archibald dopo `completeCustomerCreation`. Trova il punto dove viene chiamato `updateCustomerBotStatus(userId, customerProfileId, 'placed')` e aggiungi subito dopo:

```typescript
await updateCustomerBotStatus(userId, customerProfileId, 'placed');
await updateVatValidatedAt(userId, customerProfileId);   // ← aggiungi questa riga
```

**Nota:** usa `customerProfileId` (il profilo reale finale), NON `tempProfile` (il profilo temporaneo TEMP-*).

- [ ] **Step 7: Scrivi integration test**

```typescript
// archibald-web-app/backend/src/routes/customer-interactive-start-edit.spec.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createCustomerInteractiveRouter } from './customer-interactive';
import type { CustomerInteractiveRouterDeps } from './customer-interactive';

function makeDeps(overrides: Partial<CustomerInteractiveRouterDeps> = {}): CustomerInteractiveRouterDeps {
  return {
    sessionManager: {
      getActiveSessionForUser: vi.fn().mockReturnValue(null),
      createSession: vi.fn().mockReturnValue('session-123'),
      updateState: vi.fn(),
      destroySession: vi.fn(),
      isSyncsPaused: vi.fn().mockReturnValue(false),
      markSyncsPaused: vi.fn(),   // usa markSyncsPaused, non setSyncsPaused
      removeBot: vi.fn().mockResolvedValue(undefined),
      setBot: vi.fn(),   // sincrono nel codebase reale
      getBot: vi.fn(),
      getSession: vi.fn(),
    } as any,
    createBot: vi.fn().mockReturnValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      navigateToEditCustomerForm: vi.fn().mockResolvedValue(undefined),
      setProgressCallback: vi.fn(),
    }),
    broadcast: vi.fn(),
    upsertSingleCustomer: vi.fn(),
    updateCustomerBotStatus: vi.fn().mockResolvedValue(undefined),
    updateVatValidatedAt: vi.fn().mockResolvedValue(undefined),
    getCustomerByProfile: vi.fn().mockResolvedValue({
      customerProfile: 'TEST-001',
      name: 'Test Cliente',
      internalId: '55.123',
    }),
    pauseSyncs: vi.fn().mockResolvedValue(undefined),
    resumeSyncs: vi.fn(),
    ...overrides,
  };
}

function makeApp(deps: CustomerInteractiveRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = { userId: 'user-1' }; next(); });
  app.use('/api/customers/interactive', createCustomerInteractiveRouter(deps));
  return app;
}

describe('POST /api/customers/interactive/start-edit', () => {
  test('cliente esistente → restituisce sessionId 200', async () => {
    const app = makeApp(makeDeps());
    const res = await request(app)
      .post('/api/customers/interactive/start-edit')
      .send({ customerProfile: 'TEST-001' });
    expect(res.status).toBe(200);
    expect(res.body.data.sessionId).toBe('session-123');
  });

  test('cliente non trovato → 404', async () => {
    const app = makeApp(makeDeps({
      getCustomerByProfile: vi.fn().mockResolvedValue(null),
    }));
    const res = await request(app)
      .post('/api/customers/interactive/start-edit')
      .send({ customerProfile: 'NON-ESISTE' });
    expect(res.status).toBe(404);
  });

  test('body senza customerProfile → 400', async () => {
    const app = makeApp(makeDeps());
    const res = await request(app)
      .post('/api/customers/interactive/start-edit')
      .send({});
    expect(res.status).toBe(400);
  });

  test('customerProfile stringa vuota → 400', async () => {
    const app = makeApp(makeDeps());
    const res = await request(app)
      .post('/api/customers/interactive/start-edit')
      .send({ customerProfile: '' });
    expect(res.status).toBe(400);
  });

  test('sessione precedente viene cancellata', async () => {
    const existingSession = { sessionId: 'old-session' };
    const deps = makeDeps({
      sessionManager: {
        getActiveSessionForUser: vi.fn().mockReturnValue(existingSession),
        createSession: vi.fn().mockReturnValue('new-session'),
        updateState: vi.fn(),
        destroySession: vi.fn(),
        isSyncsPaused: vi.fn().mockReturnValue(false),
        markSyncsPaused: vi.fn(),   // usa markSyncsPaused, non setSyncsPaused
        removeBot: vi.fn().mockResolvedValue(undefined),
        setBot: vi.fn(),   // sincrono
        getBot: vi.fn(),
        getSession: vi.fn(),
      } as any,
    });
    const app = makeApp(deps);
    await request(app)
      .post('/api/customers/interactive/start-edit')
      .send({ customerProfile: 'TEST-001' });
    expect(deps.sessionManager.destroySession).toHaveBeenCalledWith('old-session');
  });
});
```

- [ ] **Step 8: Esegui i test — devono passare**

```bash
npm test --prefix archibald-web-app/backend -- src/routes/customer-interactive-start-edit.spec.ts
```

Expected: 5/5 PASS

- [ ] **Step 9: Verifica build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: zero errori.

- [ ] **Step 10: Commit**

```bash
git add archibald-web-app/backend/src/routes/customer-interactive.ts \
        archibald-web-app/backend/src/routes/customer-interactive-start-edit.spec.ts
git commit -m "feat(backend): add start-edit interactive endpoint with tests"
```

---

### Task 8: `update-customer.ts` — `vatWasValidated` + scrivi `vat_validated_at`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/update-customer.ts`

- [ ] **Step 1: Aggiungi `vatWasValidated` al tipo `UpdateCustomerData`**

```typescript
type UpdateCustomerData = {
  customerProfile: string;
  originalName?: string;
  name: string;
  // ...campi esistenti invariati...
  vatWasValidated?: boolean;   // ← nuovo campo opzionale
};
```

- [ ] **Step 2: Aggiungi import di `updateVatValidatedAt` in cima al file**

```typescript
import { updateVatValidatedAt } from '../../db/repositories/customers';
```

- [ ] **Step 3: Scrivi `vat_validated_at` se `vatWasValidated` è true**

Dopo la riga in cui il bot completa l'aggiornamento con successo (cerca `await bot.updateCustomer(`) e dopo la query di UPDATE esistente, aggiungi:

```typescript
if (data.vatWasValidated) {
  await updateVatValidatedAt(pool, userId, data.customerProfile);
}
```

(Riusa la funzione dal repository — non duplicare la SQL inline.)

- [ ] **Step 3: Verifica build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: zero errori.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/update-customer.ts
git commit -m "feat(backend): write vat_validated_at in update-customer when vatWasValidated"
```

---

### Task 9: `server.ts` — Wire nuove dipendenze

**Files:**
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Non serve un nuovo import separato**

In `server.ts` il repository è già importato come `import * as customersRepo from './db/repositories/customers'` (namespace import). Le nuove funzioni `updateVatValidatedAt` e `getCustomerByProfile` sono già esposte tramite questo namespace — non serve aggiungere nessun import.

- [ ] **Step 2: Passa le nuove dipendenze al router**

Trova il blocco `createCustomerInteractiveRouter({` (riga ~401) e aggiungi i due nuovi campi, usando il pattern `customersRepo.*` già in uso nel file:

```typescript
app.use('/api/customers/interactive', authenticateJWT, createCustomerInteractiveRouter({
  sessionManager,
  createBot: deps.createCustomerBot,
  broadcast: broadcastFn,
  upsertSingleCustomer: (userId, formData, profile, status) =>
    customersRepo.upsertSingleCustomer(pool, userId, formData, profile, status),
  updateCustomerBotStatus: (userId, profile, status) =>
    customersRepo.updateCustomerBotStatus(pool, userId, profile, status),
  updateVatValidatedAt: (userId, profile) =>              // ← nuovo
    customersRepo.updateVatValidatedAt(pool, userId, profile),
  getCustomerByProfile: (userId, profile) =>               // ← nuovo
    customersRepo.getCustomerByProfile(pool, userId, profile),
  pauseSyncs: async () => { syncScheduler.stop(); },
  resumeSyncs: () => { if (!syncScheduler.isRunning()) syncScheduler.start(syncScheduler.getIntervals()); },
  // ...resto invariato...
}));
```

- [ ] **Step 3: Verifica build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: zero errori TypeScript.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): wire updateVatValidatedAt and getCustomerByProfile in server"
```

---

## Chunk 3: Frontend — Modal + Service/API

---

### Task 10: Service e API — `startEditInteractiveSession`

**Files:**
- Modify: `archibald-web-app/frontend/src/services/customers.service.ts`

- [ ] **Step 1: Individua dove sono le chiamate interactive esistenti**

Cerca nel file `customerService` i metodi `startInteractiveSession`, `submitVatNumber`, `saveInteractiveCustomer`. Si trovano nella classe o come funzioni standalone.

- [ ] **Step 2: Aggiungi `startEditInteractiveSession`**

Aggiungi il metodo subito dopo `startInteractiveSession` — segui lo stesso identico pattern (no Authorization header, no token: il routing è gestito da cookie/sessione del browser come per tutti gli altri metodi del service):

```typescript
async startEditInteractiveSession(customerProfile: string): Promise<{ sessionId: string }> {
  const response = await fetchWithRetry('/api/customers/interactive/start-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerProfile }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return { sessionId: data.data?.sessionId || '' };
}
```

- [ ] **Step 3: Verifica type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: zero errori.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/services/customers.service.ts
git commit -m "feat(frontend): add startEditInteractiveSession to customer service"
```

---

### Task 11: CustomerCreateModal — Nuovi step types e logica edit mode

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

**Nota:** Questo file è 2290 righe. Ogni modifica è chirurgica — usa Grep per trovare le righe esatte prima di ogni edit.

- [ ] **Step 1: Aggiungi i nuovi tipi di step**

Trova il blocco `type StepType` (cerca `kind: "vat-input"`) e aggiungi:

```typescript
| { kind: "vat-edit-check" }
| { kind: "vat-diff-review" }
```

- [ ] **Step 2: Aggiungi gli import delle utility e dei tipi**

In cima al file, negli import esistenti:

```typescript
import { determineVatEditStep } from "../utils/vat-edit-step";
import { buildVatDiff } from "../utils/vat-diff";
import type { VatEditStepDecision } from "../utils/vat-edit-step";
import type { VatDiffField } from "../utils/vat-diff";
```

- [ ] **Step 3: Aggiungi stato `autoSubmitVatOnReady` e `vatWasValidated`**

Trova il blocco degli `useState` (righe ~227–235) e aggiungi:

```typescript
const [autoSubmitVatOnReady, setAutoSubmitVatOnReady] = useState<string | null>(null);
const [vatWasValidated, setVatWasValidated] = useState(false);
const [vatDiffFields, setVatDiffFields] = useState<VatDiffField[]>([]);
```

- [ ] **Step 4: Modifica il blocco `useEffect` che gestisce l'apertura del modal in edit mode**

Trova il blocco `useEffect` che controlla `if (!editCustomer)` per avviare la sessione interattiva (riga ~333). Sostituiscilo con:

```typescript
useEffect(() => {
  if (!isOpen) return;

  if (!isEditMode) {
    // Comportamento esistente: avvia sessione interattiva per creazione
    customerService.startInteractiveSession().then(({ sessionId }) => {
      setInteractiveSessionId(sessionId);
    });
    setCurrentStep({ kind: "vat-input" });
    return;
  }

  // Edit mode: routing basato su vatValidatedAt
  const decision: VatEditStepDecision = determineVatEditStep(editCustomer!);

  if (decision === 'force-vat-input') {
    customerService.startEditInteractiveSession(editCustomer!.customerProfile)
      .then(({ sessionId }) => setInteractiveSessionId(sessionId));
    setCurrentStep({ kind: "vat-input" });
  } else if (decision === 'auto-validate') {
    setAutoSubmitVatOnReady(editCustomer!.vatNumber || '');
    setCurrentStep({ kind: "vat-processing" });
    customerService.startEditInteractiveSession(editCustomer!.customerProfile)
      .then(({ sessionId }) => setInteractiveSessionId(sessionId));
    // ⚠️ auto-submit avviene su CUSTOMER_INTERACTIVE_READY (vedi handler WebSocket)
  } else {
    // show-validated-check
    setCurrentStep({ kind: "vat-edit-check" });
  }
}, [isOpen]);
```

- [ ] **Step 5: Correggi il handler WebSocket `CUSTOMER_INTERACTIVE_READY` — auto-submit**

Trova il handler `CUSTOMER_INTERACTIVE_READY` (cerca `setBotReady(true)`). L'evento ha un `payload` con `sessionId`. Usa `payload.sessionId` invece di `interactiveSessionId` dallo stato React per evitare race condition (lo stato potrebbe non essere ancora aggiornato quando arriva l'evento WebSocket):

```typescript
setBotReady(true);
// Auto-submit VAT se siamo in edit mode con P.IVA pre-impostata
if (autoSubmitVatOnReady) {
  const vatToSubmit = autoSubmitVatOnReady;
  const sessionIdFromEvent = (payload as { sessionId: string }).sessionId;
  setAutoSubmitVatOnReady(null);
  setCurrentStep({ kind: "vat-processing" });
  customerService.submitVatNumber(sessionIdFromEvent, vatToSubmit).catch((err) => {
    setCurrentStep({ kind: "vat-input" });
    setVatError(err.message || 'Errore validazione P.IVA');
  });
}
```

- [ ] **Step 6: Correggi il handler WebSocket `CUSTOMER_VAT_RESULT` — gestione diff in edit mode**

Trova il handler `CUSTOMER_VAT_RESULT` (riga ~461). Dopo aver settato il `vatResult`, aggiungere il branch per edit mode:

```typescript
// Dopo: setVatResult(result);
if (isEditMode) {
  // In edit mode: mostra diff invece di passare direttamente ai campi
  setVatDiffFields(buildVatDiff(formData, result));
  setVatDiffSelections({});   // reset selezioni per evitare stato residuo da sessioni precedenti
  setCurrentStep({ kind: "vat-diff-review" });
} else {
  // Comportamento create esistente: autocompila e vai a vat-review
  setFormData(prev => ({
    ...prev,
    vatNumber: earlyVatInputRef.current.trim() || prev.vatNumber,
    name: result.parsed?.companyName || prev.name,
    street: result.parsed?.street || prev.street,
    postalCode: result.parsed?.postalCode || prev.postalCode,
    postalCodeCity: result.parsed?.city || prev.postalCodeCity,
    pec: result.pec || prev.pec,
    sdi: result.sdi || prev.sdi,
  }));
  setCurrentStep({ kind: "vat-review" });
}
```

- [ ] **Step 7: Estendi il tipo di `updateCustomer` per accettare `vatWasValidated`**

In `archibald-web-app/frontend/src/services/customers.service.ts`, il metodo `updateCustomer` accetta un `formData` con tipo inline. Aggiungi `vatWasValidated?: boolean` ai campi del tipo:

```typescript
async updateCustomer(
  customerProfile: string,
  formData: {
    name: string;
    vatNumber?: string;
    pec?: string;
    sdi?: string;
    street?: string;
    postalCode?: string;
    phone?: string;
    email?: string;
    deliveryMode?: string;
    paymentTerms?: string;
    deliveryStreet?: string;
    deliveryPostalCode?: string;
    postalCodeCity?: string;
    postalCodeCountry?: string;
    deliveryPostalCodeCity?: string;
    deliveryPostalCodeCountry?: string;
    vatWasValidated?: boolean;   // ← nuovo
  },
): Promise<{ taskId: string | null }>
```

- [ ] **Step 8: Aggiorna `handleSave` per passare `vatWasValidated` nel payload**

Trova il blocco `if (isEditMode)` dentro `handleSave` (riga ~854):

```typescript
const payload = changedFields.size > 0
  ? { ...dataToSend, changedFields: Array.from(changedFields), vatWasValidated }
  : { ...dataToSend, vatWasValidated };
const result = await customerService.updateCustomer(
  editCustomer!.customerProfile,
  payload,
);
```

- [ ] **Step 8: Verifica type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: zero errori.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "feat(frontend): add edit mode VAT step routing and auto-submit logic"
```

---

### Task 12: CustomerCreateModal — UI step `vat-edit-check`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

- [ ] **Step 1: Aggiungi il render dello step `vat-edit-check`**

Trova la funzione `renderCurrentStep` (o il blocco switch/if che renderizza gli step). Aggiungi un branch per `kind === "vat-edit-check"`:

```tsx
if (currentStep.kind === "vat-edit-check") {
  const validatedDate = editCustomer?.vatValidatedAt
    ? new Date(editCustomer.vatValidatedAt).toLocaleDateString('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '16px', color: '#1a1a1a' }}>
        ✓ P.IVA già validata il <strong>{validatedDate}</strong>
      </div>
      <div style={{ color: '#666', fontSize: '14px' }}>
        Vuoi riconvalidare per aggiornare i dati da Archibald?
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <button
          onClick={() => {
            setAutoSubmitVatOnReady(editCustomer!.vatNumber || '');
            setCurrentStep({ kind: "vat-processing" });
            customerService.startEditInteractiveSession(editCustomer!.customerProfile)
              .then(({ sessionId }) => setInteractiveSessionId(sessionId))
              .catch((err) => {
                setCurrentStep({ kind: "vat-edit-check" });
                setVatError(err.message || 'Errore avvio sessione');
              });
          }}
          style={{ padding: '10px 20px', background: '#2563eb', color: '#fff',
                   border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
        >
          Riconvalida
        </button>
        <button
          onClick={() => setCurrentStep({ kind: "field", index: 0 })}
          style={{ padding: '10px 20px', background: '#f3f4f6', color: '#374151',
                   border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
        >
          Salta
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica type-check e che il frontend buildi**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: zero errori.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "feat(frontend): add vat-edit-check step UI"
```

---

### Task 13: CustomerCreateModal — UI step `vat-diff-review`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

- [ ] **Step 1: Aggiungi stato per le selezioni del diff**

```typescript
const [vatDiffSelections, setVatDiffSelections] = useState<Record<string, boolean>>({});
```

- [ ] **Step 2: Aggiungi render dello step `vat-diff-review`**

```tsx
if (currentStep.kind === "vat-diff-review") {
  // Inizializza selezioni se vuote
  const selections = vatDiffSelections;

  const handleToggle = (key: string) => {
    setVatDiffSelections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApply = () => {
    // Applica i campi selezionati
    const updates: Partial<CustomerFormData> = {};
    vatDiffFields.forEach(field => {
      const isSelected = selections[field.key] !== undefined
        ? selections[field.key]
        : field.preSelected;
      if (isSelected) {
        updates[field.key] = field.archibald as any;
      }
    });
    setFormData(prev => ({ ...prev, ...updates }));
    setVatWasValidated(true);
    setCurrentStep({ kind: "field", index: 0 });
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>
        Confronto dati P.IVA
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
            <th style={{ textAlign: 'left', padding: '8px', color: '#6b7280', fontWeight: 500 }}>Campo</th>
            <th style={{ textAlign: 'left', padding: '8px', color: '#6b7280', fontWeight: 500 }}>Valore attuale</th>
            <th style={{ textAlign: 'left', padding: '8px', color: '#6b7280', fontWeight: 500 }}>Archibald</th>
            <th style={{ textAlign: 'center', padding: '8px', color: '#6b7280', fontWeight: 500 }}>Usa Archibald</th>
          </tr>
        </thead>
        <tbody>
          {vatDiffFields.map(field => {
            const checked = selections[field.key] !== undefined
              ? selections[field.key]
              : field.preSelected;
            const isDiff = field.current !== field.archibald;
            return (
              <tr key={field.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 8px', fontWeight: 500, color: '#374151' }}>{field.label}</td>
                <td style={{ padding: '10px 8px', color: isDiff ? '#dc2626' : '#374151' }}>
                  {field.current || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>vuoto</span>}
                </td>
                <td style={{ padding: '10px 8px', color: isDiff ? '#059669' : '#374151' }}>
                  {field.archibald || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>vuoto</span>}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggle(field.key)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        onClick={handleApply}
        style={{ alignSelf: 'flex-end', padding: '10px 24px', background: '#2563eb',
                 color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer',
                 fontSize: '14px', fontWeight: 500 }}
      >
        Applica selezione →
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verifica type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: zero errori.

- [ ] **Step 4: Esegui tutti i test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Expected: tutti i test passano (nessuna regressione).

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "feat(frontend): add vat-diff-review step UI with field selection"
```

---

### Task 14: Allineamento errori/warning — Create vs Edit

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

- [ ] **Step 1: Verifica e allinea auto-prepend `+39` al telefono**

Cerca nel modal la riga che prepend `+39` (es. `phone: "+39"`). Verifica che sia nel `defaultFormData` (già pre-compilato per tutti i casi) e non condizionato a `!isEditMode`. Se è condizionato, rimuovi la condizione.

In edit mode, il campo telefono viene pre-compilato da `customerToFormData(customer)` con il valore esistente, che potrebbe non avere `+39`. Nella funzione `customerToFormData`, assicurati che il telefono venga normalizzato:

```typescript
function customerToFormData(customer: Customer): CustomerFormData {
  return {
    // ...
    phone: customer.phone || '+39',   // fallback a +39 se vuoto
    // ...
  };
}
```

- [ ] **Step 2: Verifica e allinea CAP disambiguation**

Cerca `postalCodeCity` e `disambiguation` nel modal (o la funzione che fa il lookup CAP). Verifica se il lookup è wrappato in `if (!isEditMode)`. Se sì, rimuovi la guardia — il lookup deve funzionare identicamente in edit mode.

- [ ] **Step 3: Verifica warning nome obbligatorio**

Cerca il punto dove viene validato `formData.name === ''` (o simile) e mostrato il warning. Verifica che la logica non sia inside `if (!isEditMode)`. Se sì, allinea.

- [ ] **Step 4: Esegui tutti i test**

```bash
npm test --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/backend
```

Expected: tutti i test passano senza regressioni.

- [ ] **Step 5: Commit per ogni fix trovato**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "fix(frontend): align create/edit modal validation and phone normalization"
```

---

## UAT Checklist (dopo tutti i task)

Prima di dichiarare la Fase 1 completata, verificare manualmente i 5 scenari su ambiente locale:

- [ ] **UAT 1 — P.IVA vuota:** Apri modifica di un cliente senza P.IVA → viene mostrato input P.IVA obbligatorio → inserisci una P.IVA valida → validazione parte → step diff mostrato → applica → prosegui modifica → salva → vat_validated_at scritto in DB
- [ ] **UAT 2 — P.IVA presente, mai validata:** Apri modifica di un cliente con P.IVA ma `vatValidatedAt=null` → modal apre su `vat-processing` → bot naviga edit form → auto-submit → diff mostrato → seleziona campi → applica → prosegui → salva
- [ ] **UAT 3 — P.IVA già validata → Salta:** Apri modifica cliente con `vatValidatedAt` presente → mostra step "già validata" con data → click Salta → passa direttamente al form
- [ ] **UAT 4 — P.IVA già validata → Riconvalida:** Stesso cliente → click Riconvalida → bot ri-naviga → diff mostrato → applica
- [ ] **UAT 5 — Validazione fallisce:** Inserisci P.IVA inesistente → Archibald restituisce errore → errore inline mostrato → retry senza chiudere modal

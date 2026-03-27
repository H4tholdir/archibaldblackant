# Update Customer — Piano A: Backend Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estendere il bot `updateCustomer` con i 4 campi mancanti, aggiungere snapshot post-salvataggio garantito, la funzione `isCustomerComplete` per blocco ordini, e la route per il lazy enrichment della validazione IVA.

**Architecture:** Il bot `updateCustomer` scrive i 4 campi ERP mancanti (sector, fiscalCode, attentionTo, notes) e delega poi a `buildCustomerSnapshot()` (già implementato nel bot per createCustomer) per leggere i dati effettivamente committati su ERP. L'handler persiste lo snapshot in DB con `bot_status='snapshot'`. La funzione pura `isCustomerComplete` viene usata sia dal backend (blocco route ordini) sia esposta al frontend. Il lazy VAT enrichment usa BullMQ low-priority, deduplicato per customerProfile.

**Tech Stack:** TypeScript strict, Express, BullMQ, `pg` pool, Puppeteer (bot). Test: Vitest + supertest. Tutti i test con `npm test --prefix archibald-web-app/backend`.

---

## Mappa file

| File | Azione | Responsabilità |
|---|---|---|
| `backend/src/types.ts` | Modifica | Aggiungere `CustomerSnapshot` (shared) e 4 nuovi campi a `CustomerFormData` |
| `backend/src/operations/handlers/create-customer.ts` | Modifica | Importare `CustomerSnapshot` da `types.ts` invece di ridefinirlo localmente |
| `backend/src/operations/handlers/update-customer.ts` | Modifica | Aggiungere 4 campi a `UpdateCustomerData`, `buildCustomerSnapshot` all'interfaccia bot, logica snapshot in handler |
| `backend/src/operations/handlers/update-customer.spec.ts` | Crea | Unit test handler (mock bot + pool) |
| `backend/src/bot/archibald-bot.ts` | Modifica | Aggiungere scrittura 4 campi in `updateCustomer` |
| `backend/src/db/repositories/customers.ts` | Modifica | Aggiungere `isCustomerComplete`, `getIncompleteCustomersCount`, export |
| `backend/src/db/repositories/customers.spec.ts` | Crea | Unit test `isCustomerComplete` |
| `backend/src/routes/customers.ts` | Modifica | Aggiungere `isCustomerComplete` a deps, route `GET /:customerProfile/vat-status` |
| `backend/src/operations/handlers/read-vat-status.ts` | Crea | Handler BullMQ per lazy VAT enrichment |
| `backend/src/routes/orders.ts` | Modifica | Verifica `isCustomerComplete` prima di submit ordine |
| `backend/src/main.ts` | Modifica | Forwardare `buildCustomerSnapshot` nel wrapper bot per update-customer |

---

## Task 1: `CustomerSnapshot` in `types.ts` + 4 campi a `CustomerFormData`

**Files:**
- Modify: `archibald-web-app/backend/src/types.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/create-customer.ts`

- [ ] **Step 1.1: Leggere l'attuale `types.ts` per capire la struttura esistente**

```bash
grep -n "CustomerFormData\|CustomerSnapshot\|export type\|export interface" archibald-web-app/backend/src/types.ts | head -60
```

- [ ] **Step 1.2: Aggiungere `CustomerSnapshot` e i 4 campi a `CustomerFormData` in `types.ts`**

Trovare la definizione di `CustomerFormData` in `types.ts` e aggiungere i 4 campi mancanti:

```typescript
// In CustomerFormData, aggiungere accanto agli altri campi opzionali:
sector?: string;
fiscalCode?: string;
attentionTo?: string;
notes?: string;
```

Aggiungere subito dopo (o nel blocco degli export di types):

```typescript
export type CustomerSnapshot = {
  internalId: string | null;
  name: string | null;
  nameAlias: string | null;
  vatNumber: string | null;
  vatValidated: string | null;
  fiscalCode: string | null;
  pec: string | null;
  sdi: string | null;
  notes: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  url: string | null;
  attentionTo: string | null;
  deliveryMode: string | null;
  paymentTerms: string | null;
  sector: string | null;
  priceGroup: string | null;
  lineDiscount: string | null;
} | null;
```

- [ ] **Step 1.3: Rimuovere la definizione locale di `CustomerSnapshot` da `create-customer.ts` e importarla da `types.ts`**

In `archibald-web-app/backend/src/operations/handlers/create-customer.ts`, rimuovere le righe 32–58 (la definizione locale di `CustomerSnapshot`) e aggiungere in cima:

```typescript
import type { CustomerSnapshot } from '../../types';
```

- [ ] **Step 1.4: Verificare che il build TypeScript passi**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Atteso: nessun errore di tipo.

- [ ] **Step 1.5: Commit**

```bash
git add archibald-web-app/backend/src/types.ts \
        archibald-web-app/backend/src/operations/handlers/create-customer.ts
git commit -m "refactor(types): move CustomerSnapshot to types.ts, add 4 fields to CustomerFormData"
```

---

## Task 2: `isCustomerComplete` nel repository customers

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/customers.ts`
- Create: `archibald-web-app/backend/src/db/repositories/customers.spec.ts` (o aggiungere se esiste)

- [ ] **Step 2.1: Verificare se esiste già un file spec per il repository**

```bash
ls archibald-web-app/backend/src/db/repositories/customers.spec.ts 2>/dev/null && echo "esiste" || echo "non esiste"
```

- [ ] **Step 2.2: Scrivere il test per `isCustomerComplete`**

Creare (o aggiungere a) `archibald-web-app/backend/src/db/repositories/customers.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { isCustomerComplete } from './customers';
import type { Customer } from './customers';

const base: Customer = {
  customerProfile: '55.100',
  name: 'Test S.r.l.',
  vatNumber: 'IT12345678901',
  vatValidatedAt: '2026-01-01T00:00:00Z',
  pec: 'test@pec.it',
  sdi: null,
  street: 'Via Roma 1',
  postalCode: '80100',
  city: 'Napoli',
  // altri campi richiesti dal tipo Customer (nullable)
  internalId: null, fiscalCode: null, mobile: null, phone: null,
  email: null, url: null, attentionTo: null, deliveryTerms: null,
  lastOrderDate: null, botStatus: 'placed', archibaldName: null,
  photo: null, sector: null, priceGroup: null, lineDiscount: null,
  paymentTerms: null, notes: null, nameAlias: null, county: null,
  state: null, country: null, sdi: null, hash: '', lastSync: 0,
  createdAt: null, updatedAt: null, userId: 'u1',
  actualOrderCount: null, actualSales: null,
  previousOrderCount1: null, previousSales1: null,
  previousOrderCount2: null, previousSales2: null,
  externalAccountNumber: null, ourAccountNumber: null,
  customerType: null, type: null, description: null, logisticsAddress: null,
  vatValidatedAt: '2026-01-01T00:00:00Z',
};

describe('isCustomerComplete', () => {
  test('returns true when all mandatory fields are present (pec path)', () => {
    expect(isCustomerComplete(base)).toBe(true);
  });

  test('returns true when sdi is provided instead of pec', () => {
    expect(isCustomerComplete({ ...base, pec: null, sdi: 'AAABBB1' })).toBe(true);
  });

  test('returns false when name is missing', () => {
    expect(isCustomerComplete({ ...base, name: '' })).toBe(false);
  });

  test('returns false when vatNumber is missing', () => {
    expect(isCustomerComplete({ ...base, vatNumber: null })).toBe(false);
  });

  test('returns false when vatValidatedAt is null', () => {
    expect(isCustomerComplete({ ...base, vatValidatedAt: null })).toBe(false);
  });

  test('returns false when both pec and sdi are missing', () => {
    expect(isCustomerComplete({ ...base, pec: null, sdi: null })).toBe(false);
  });

  test('returns false when street is missing', () => {
    expect(isCustomerComplete({ ...base, street: null })).toBe(false);
  });

  test('returns false when postalCode is missing', () => {
    expect(isCustomerComplete({ ...base, postalCode: null })).toBe(false);
  });

  test('returns false when city is missing', () => {
    expect(isCustomerComplete({ ...base, city: null })).toBe(false);
  });
});
```

**Nota:** se `Customer` ha nomi di campo diversi da quelli usati sopra (es. `vat_validated_at` invece di `vatValidatedAt`), adattare ai nomi reali del tipo dopo averlo letto.

- [ ] **Step 2.3: Eseguire il test per verificare che fallisca (isCustomerComplete non esiste ancora)**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/db/repositories/customers.spec.ts 2>&1 | tail -20
```

Atteso: FAIL — "isCustomerComplete is not a function" o simile.

- [ ] **Step 2.4: Implementare `isCustomerComplete` in `customers.ts`**

Aggiungere prima del blocco `export` in `archibald-web-app/backend/src/db/repositories/customers.ts`:

```typescript
function isCustomerComplete(customer: Customer): boolean {
  return !!(
    customer.name &&
    customer.vatNumber &&
    customer.vatValidatedAt &&
    (customer.pec || customer.sdi) &&
    customer.street &&
    customer.postalCode &&
    customer.city
  );
}

async function getIncompleteCustomersCount(pool: DbPool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM agents.customers
     WHERE user_id = $1
       AND (
         name IS NULL OR name = '' OR
         vat_number IS NULL OR
         vat_validated_at IS NULL OR
         (pec IS NULL AND sdi IS NULL) OR
         street IS NULL OR
         postal_code IS NULL OR
         city IS NULL
       )`,
    [userId],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}
```

Aggiungere al blocco `export { ... }`:

```typescript
isCustomerComplete,
getIncompleteCustomersCount,
```

- [ ] **Step 2.5: Eseguire il test per verificare che passi**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/db/repositories/customers.spec.ts 2>&1 | tail -20
```

Atteso: tutti i test PASS.

- [ ] **Step 2.6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/customers.ts \
        archibald-web-app/backend/src/db/repositories/customers.spec.ts
git commit -m "feat(customers): add isCustomerComplete + getIncompleteCustomersCount"
```

---

## Task 3: Estendere `UpdateCustomerData` e `UpdateCustomerBot` + snapshot nell'handler

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/update-customer.ts`
- Create: `archibald-web-app/backend/src/operations/handlers/update-customer.spec.ts`

- [ ] **Step 3.1: Scrivere i test per `handleUpdateCustomer` con snapshot**

Creare `archibald-web-app/backend/src/operations/handlers/update-customer.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { handleUpdateCustomer } from './update-customer';
import type { UpdateCustomerBot, UpdateCustomerData } from './update-customer';
import type { CustomerSnapshot } from '../../types';

const makePool = (rows: unknown[] = [{ name: 'Mario Rossi S.r.l.', archibald_name: 'Mario Rossi S.r.l.' }]) => ({
  query: vi.fn().mockResolvedValue({ rows, rowCount: 1 }),
});

const snapshot: CustomerSnapshot = {
  internalId: '123', name: 'Mario Rossi S.r.l.', nameAlias: null,
  vatNumber: 'IT08246131216', vatValidated: 'Sì', fiscalCode: null,
  pec: 'mario@pec.it', sdi: null, notes: null,
  street: 'Via Roma 12', postalCode: '80100', city: 'Napoli',
  county: 'NA', state: null, country: 'Italy',
  phone: '081 1234567', mobile: null, email: 'info@rossi.it', url: null,
  attentionTo: null, deliveryMode: 'Standard', paymentTerms: '30gg DFFM',
  sector: 'Florovivaismo', priceGroup: 'DETTAGLIO (consigliato)', lineDiscount: 'N/A',
};

const makeBot = (snap: CustomerSnapshot = snapshot): UpdateCustomerBot => ({
  updateCustomer: vi.fn().mockResolvedValue(undefined),
  buildCustomerSnapshot: vi.fn().mockResolvedValue(snap),
  setProgressCallback: vi.fn(),
});

const baseData: UpdateCustomerData = {
  customerProfile: '55.261',
  name: 'Mario Rossi S.r.l.',
  vatNumber: 'IT08246131216',
  pec: 'mario@pec.it',
  sector: 'Florovivaismo',
  fiscalCode: null,
  attentionTo: null,
  notes: null,
};

describe('handleUpdateCustomer', () => {
  test('calls bot.updateCustomer with correct data', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleUpdateCustomer(pool as never, bot, baseData, 'user1', vi.fn());
    expect(bot.updateCustomer).toHaveBeenCalledWith('55.261', baseData, 'Mario Rossi S.r.l.');
  });

  test('calls buildCustomerSnapshot after bot update', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleUpdateCustomer(pool as never, bot, baseData, 'user1', vi.fn());
    expect(bot.buildCustomerSnapshot).toHaveBeenCalledWith('55.261');
  });

  test('sets bot_status to snapshot after successful bot update', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleUpdateCustomer(pool as never, bot, baseData, 'user1', vi.fn());
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const finalUpdateCall = calls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('bot_status') && (c[1] as unknown[])?.includes('snapshot'),
    );
    expect(finalUpdateCall).toBeDefined();
  });

  test('persists snapshot fields (sector, fiscalCode, notes) to DB', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleUpdateCustomer(pool as never, bot, baseData, 'user1', vi.fn());
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const snapshotUpdateCall = calls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('sector'),
    );
    expect(snapshotUpdateCall).toBeDefined();
  });

  test('handles buildCustomerSnapshot failure gracefully (does not throw)', async () => {
    const pool = makePool();
    const bot = makeBot();
    (bot.buildCustomerSnapshot as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ERP error'));
    await expect(
      handleUpdateCustomer(pool as never, bot, baseData, 'user1', vi.fn()),
    ).resolves.toEqual({ success: true });
  });

  test('updates vatValidatedAt when vatWasValidated is true', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleUpdateCustomer(
      pool as never, bot,
      { ...baseData, vatWasValidated: true },
      'user1', vi.fn(),
    );
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const vatCall = calls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('vat_validated_at'),
    );
    expect(vatCall).toBeDefined();
  });
});
```

- [ ] **Step 3.2: Eseguire i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/operations/handlers/update-customer.spec.ts 2>&1 | tail -30
```

Atteso: FAIL — buildCustomerSnapshot non esiste nell'interfaccia, bot_status non è 'snapshot'.

- [ ] **Step 3.3: Riscrivere `update-customer.ts` con i nuovi campi e la logica snapshot**

Sostituire il contenuto di `archibald-web-app/backend/src/operations/handlers/update-customer.ts`:

```typescript
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { CustomerSnapshot } from '../../types';
import { updateVatValidatedAt } from '../../db/repositories/customers';
import type { AddressEntry } from '../../types';
import { upsertAddressesForCustomer } from '../../db/repositories/customer-addresses';
import { logger } from '../../logger';

type UpdateCustomerData = {
  customerProfile: string;
  originalName?: string;
  name: string;
  vatNumber?: string;
  pec?: string;
  sdi?: string;
  street?: string;
  postalCode?: string;
  postalCodeCity?: string;
  postalCodeCountry?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  url?: string;
  deliveryMode?: string;
  paymentTerms?: string;
  lineDiscount?: string;
  fiscalCode?: string | null;
  sector?: string | null;
  attentionTo?: string | null;
  notes?: string | null;
  vatWasValidated?: boolean;
  addresses?: AddressEntry[];
};

type UpdateCustomerBot = {
  updateCustomer: (customerProfile: string, customerData: UpdateCustomerData, originalName: string) => Promise<void>;
  buildCustomerSnapshot: (customerProfile: string) => Promise<CustomerSnapshot>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleUpdateCustomer(
  pool: DbPool,
  bot: UpdateCustomerBot,
  data: UpdateCustomerData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ success: boolean }> {
  onProgress(5, 'Recupero dati cliente');

  let originalName = data.originalName;

  if (!originalName) {
    const { rows: [existing] } = await pool.query<{ name: string; archibald_name: string | null }>(
      `SELECT name, archibald_name FROM agents.customers
       WHERE customer_profile = $1 AND user_id = $2`,
      [data.customerProfile, userId],
    );
    originalName = existing?.archibald_name ?? existing?.name ?? data.name;
  }

  onProgress(10, 'Aggiornamento locale');

  await pool.query(
    `UPDATE agents.customers SET
      name = $1, vat_number = $2, pec = $3, sdi = $4,
      street = $5, postal_code = $6, phone = $7, mobile = $8,
      email = $9, url = $10, delivery_terms = $11,
      sector = COALESCE($12, sector),
      fiscal_code = COALESCE($13, fiscal_code),
      attention_to = COALESCE($14, attention_to),
      notes = COALESCE($15, notes),
      bot_status = 'pending', archibald_name = $16, last_sync = $17, updated_at = NOW()
    WHERE customer_profile = $18 AND user_id = $19`,
    [
      data.name, data.vatNumber ?? null, data.pec ?? null, data.sdi ?? null,
      data.street ?? null, data.postalCode ?? null, data.phone ?? null, data.mobile ?? null,
      data.email ?? null, data.url ?? null, data.deliveryMode ?? null,
      data.sector ?? null, data.fiscalCode ?? null,
      data.attentionTo ?? null, data.notes ?? null,
      originalName, Date.now(),
      data.customerProfile, userId,
    ],
  );

  const BOT_PROGRESS_LABELS: Record<string, { progress: number; label: string }> = {
    'customer.navigation':  { progress: 25, label: 'Navigazione al form cliente' },
    'customer.search':      { progress: 35, label: 'Ricerca cliente' },
    'customer.edit_loaded': { progress: 45, label: 'Form cliente caricato' },
    'customer.field':       { progress: 60, label: 'Compilazione campi' },
    'customer.save':        { progress: 70, label: 'Salvataggio su Archibald' },
    'customer.complete':    { progress: 75, label: 'Cliente aggiornato su Archibald' },
  };

  bot.setProgressCallback(async (category) => {
    const milestone = BOT_PROGRESS_LABELS[category];
    if (milestone) onProgress(milestone.progress, milestone.label);
  });

  onProgress(20, 'Aggiornamento su Archibald');
  await bot.updateCustomer(data.customerProfile, data, originalName);

  const addressesForUpsert = (data.addresses ?? []).map((a) => ({
    tipo: a.tipo, nome: a.nome ?? null, via: a.via ?? null,
    cap: a.cap ?? null, citta: a.citta ?? null, contea: a.contea ?? null,
    stato: a.stato ?? null, idRegione: a.idRegione ?? null, contra: a.contra ?? null,
  }));
  await upsertAddressesForCustomer(pool, userId, data.customerProfile, addressesForUpsert);

  if (data.vatWasValidated) {
    await updateVatValidatedAt(pool, userId, data.customerProfile);
  }

  onProgress(78, 'Lettura snapshot da Archibald');

  let snapshot: CustomerSnapshot = null;
  try {
    snapshot = await bot.buildCustomerSnapshot(data.customerProfile);
  } catch (err) {
    logger.warn('handleUpdateCustomer: snapshot fallito, procedo senza', { error: String(err) });
  }

  onProgress(88, 'Aggiornamento stato');

  await pool.query(
    `UPDATE agents.customers SET
      bot_status = 'snapshot',
      archibald_name = $1,
      name_alias   = COALESCE($2, name_alias),
      city         = COALESCE($3, city),
      county       = COALESCE($4, county),
      state        = COALESCE($5, state),
      country      = COALESCE($6, country),
      price_group  = COALESCE($7, price_group),
      line_discount= COALESCE($8, line_discount),
      postal_code  = COALESCE($9, postal_code),
      fiscal_code  = COALESCE($10, fiscal_code),
      sector       = COALESCE($11, sector),
      payment_terms= COALESCE($12, payment_terms),
      attention_to = COALESCE($13, attention_to),
      notes        = COALESCE($14, notes),
      vat_validated_at = CASE
        WHEN $15 = 'Sì' THEN COALESCE(vat_validated_at, NOW())
        ELSE vat_validated_at
      END,
      updated_at = NOW()
     WHERE customer_profile = $16 AND user_id = $17`,
    [
      data.name,
      snapshot?.nameAlias ?? null,
      snapshot?.city ?? null,
      snapshot?.county ?? null,
      snapshot?.state ?? null,
      snapshot?.country ?? null,
      snapshot?.priceGroup ?? null,
      snapshot?.lineDiscount ?? null,
      snapshot?.postalCode ?? null,
      snapshot?.fiscalCode ?? null,
      snapshot?.sector ?? null,
      snapshot?.paymentTerms ?? null,
      snapshot?.attentionTo ?? null,
      snapshot?.notes ?? null,
      snapshot?.vatValidated ?? null,
      data.customerProfile, userId,
    ],
  );

  onProgress(100, 'Aggiornamento completato');
  return { success: true };
}

function createUpdateCustomerHandler(
  pool: DbPool,
  createBot: (userId: string) => UpdateCustomerBot,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as UpdateCustomerData;
    const result = await handleUpdateCustomer(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleUpdateCustomer,
  createUpdateCustomerHandler,
  type UpdateCustomerData,
  type UpdateCustomerBot,
};
```

- [ ] **Step 3.4: Eseguire i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose src/operations/handlers/update-customer.spec.ts 2>&1 | tail -30
```

Atteso: tutti i test PASS.

- [ ] **Step 3.5: Verificare build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Atteso: nessun errore.

- [ ] **Step 3.6: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/update-customer.ts \
        archibald-web-app/backend/src/operations/handlers/update-customer.spec.ts
git commit -m "feat(update-customer): add 4 fields, snapshot post-save, bot_status=snapshot"
```

---

## Task 4: Bot — scrivere i 4 nuovi campi in `updateCustomer`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts` (righe ~12846–12965)

- [ ] **Step 4.1: Localizzare il punto di inserimento nel bot**

```bash
grep -n "customerData.lineDiscount\|customer.field\|updateCustomerName\|customerData.deliveryMode" archibald-web-app/backend/src/bot/archibald-bot.ts | head -20
```

I 4 nuovi campi vanno inseriti **dopo** `updateCustomerName` e **prima** di `deliveryMode`, seguendo l'ordine certificato nel memory `erp-customer-form-fields.md`: prima i campi text semplici, poi i dropdown.

- [ ] **Step 4.2: Aggiungere i 4 campi al metodo `updateCustomer` del bot**

Nel metodo `updateCustomer` di `archibald-bot.ts`, dopo il blocco `updateCustomerName` (riga ~12848) e prima del blocco `deliveryMode` (riga ~12850), inserire:

```typescript
    if (customerData.attentionTo !== undefined) {
      await this.typeDevExpressField(
        /xaf_dviBRASCRMATTENTIONTO_Edit_I$/,
        customerData.attentionTo ?? '',
      );
    }

    if (customerData.fiscalCode !== undefined) {
      await this.typeDevExpressField(
        /xaf_dviFISCALCODE_Edit_I$/,
        customerData.fiscalCode ?? '',
      );
    }

    if (customerData.notes !== undefined) {
      await this.typeDevExpressField(
        /xaf_dviCUSTINFO_Edit_I$/,
        customerData.notes ?? '',
      );
    }
```

Il campo `sector` usa un dropdown — inserirlo **dopo** `deliveryMode` nello stesso blocco dropdown:

```typescript
    if (customerData.sector !== undefined && customerData.sector !== null) {
      await this.setDevExpressComboBox(
        /xaf_dviBUSINESSSECTORID_Edit_dropdown_DD_I$/,
        customerData.sector,
      );
    }
```

- [ ] **Step 4.3: Verificare build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Atteso: nessun errore di tipo.

- [ ] **Step 4.4: Verificare che `buildCustomerSnapshot` sia accessibile nell'interfaccia `UpdateCustomerBot`**

Il metodo `buildCustomerSnapshot` esiste già nel bot (usato da `createCustomer`). Verificare che sia pubblico (non `private`):

```bash
grep -n "buildCustomerSnapshot" archibald-web-app/backend/src/bot/archibald-bot.ts | head -5
```

Se il metodo è `private`, rimuovere il modificatore `private`. Se è già pubblico, nessuna modifica necessaria.

- [ ] **Step 4.5: Verificare che il wrapper in `main.ts` forwardi `buildCustomerSnapshot`**

```bash
grep -n "updateCustomer\|buildCustomerSnapshot\|createUpdateCustomer" archibald-web-app/backend/src/main.ts | head -20
```

Se nel wrapper del bot per `update-customer` non è presente `buildCustomerSnapshot`, aggiungerlo:

```typescript
// Nel createBot per update-customer, accertarsi che il wrapper esponga:
buildCustomerSnapshot: (customerProfile: string) => bot.buildCustomerSnapshot(customerProfile),
```

- [ ] **Step 4.6: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(bot): updateCustomer writes sector, fiscalCode, attentionTo, notes"
```

---

## Task 5: Blocco ordine — verifica `isCustomerComplete` nelle route

**Files:**
- Modify: `archibald-web-app/backend/src/routes/orders.ts`
- Modify: `archibald-web-app/backend/src/routes/customers.ts` (aggiungere `isCustomerComplete` + `getIncompleteCustomersCount` a deps)

- [ ] **Step 5.1: Leggere la route di submit ordine in `orders.ts`**

```bash
grep -n "submit-order\|enqueue\|queue\|submit\|place" archibald-web-app/backend/src/routes/orders.ts | head -30
```

Individuare la route che enqueue il job `submit-order` (o similare).

- [ ] **Step 5.2: Aggiungere `isCustomerComplete` e `getCustomerByProfile` alle dipendenze del router ordini**

In `archibald-web-app/backend/src/routes/orders.ts`, aggiungere al tipo `OrdersRouterDeps`:

```typescript
type OrdersRouterDeps = {
  // ... campi esistenti ...
  getCustomerByProfile?: (userId: string, customerProfile: string) => Promise<import('../db/repositories/customers').Customer | undefined>;
  isCustomerComplete?: (customer: import('../db/repositories/customers').Customer) => boolean;
};
```

- [ ] **Step 5.3: Aggiungere la verifica prima del submit ordine**

Nella route che gestisce il submit dell'ordine (trovata al Step 5.1), aggiungere prima dell'enqueue:

```typescript
// Blocco ordine se scheda cliente incompleta
if (deps.getCustomerByProfile && deps.isCustomerComplete) {
  const customerProfile = req.body.customerProfile as string | undefined;
  if (customerProfile) {
    const customer = await deps.getCustomerByProfile(req.user!.userId, customerProfile);
    if (customer && !deps.isCustomerComplete(customer)) {
      const missingFields: string[] = [];
      if (!customer.name) missingFields.push('name');
      if (!customer.vatNumber) missingFields.push('vatNumber');
      if (!customer.vatValidatedAt) missingFields.push('vatValidatedAt');
      if (!customer.pec && !customer.sdi) missingFields.push('pec_or_sdi');
      if (!customer.street) missingFields.push('street');
      if (!customer.postalCode) missingFields.push('postalCode');
      if (!customer.city) missingFields.push('city');
      return res.status(400).json({
        error: 'customer_incomplete',
        message: 'Scheda cliente incompleta — completare i campi obbligatori prima di piazzare l\'ordine',
        missingFields,
        customerProfile,
      });
    }
  }
}
```

**Nota:** il campo `city` nel tipo `Customer` potrebbe chiamarsi `postalCodeCity` — verificare dopo aver letto il tipo e adattare.

- [ ] **Step 5.4: Aggiungere `getIncompleteCustomersCount` alle route clienti**

In `archibald-web-app/backend/src/routes/customers.ts`, aggiungere al tipo `CustomersRouterDeps`:

```typescript
getIncompleteCustomersCount?: (userId: string) => Promise<number>;
```

Aggiungere la route `GET /stats` (o aggiungere `incompleteCount` a una route stats esistente):

```typescript
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [total, incomplete] = await Promise.all([
      deps.getCustomerCount(userId),
      deps.getIncompleteCustomersCount?.(userId) ?? Promise.resolve(0),
    ]);
    res.json({ total, incomplete });
  } catch (err) {
    logger.error('GET /customers/stats error', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 5.5: Verificare build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

- [ ] **Step 5.6: Commit**

```bash
git add archibald-web-app/backend/src/routes/orders.ts \
        archibald-web-app/backend/src/routes/customers.ts
git commit -m "feat(orders): block submit if customer is incomplete, add /customers/stats endpoint"
```

---

## Task 6: VAT Lazy Enrichment — handler e route

**Files:**
- Create: `archibald-web-app/backend/src/operations/handlers/read-vat-status.ts`
- Modify: `archibald-web-app/backend/src/routes/customers.ts`
- Modify: `archibald-web-app/backend/src/operations/operation-types.ts` (aggiungere tipo)

- [ ] **Step 6.1: Verificare i tipi operazione esistenti**

```bash
grep -n "submit-order\|update-customer\|create-customer" archibald-web-app/backend/src/operations/operation-types.ts
```

- [ ] **Step 6.2: Aggiungere `'read-vat-status'` ai tipi operazione**

In `archibald-web-app/backend/src/operations/operation-types.ts`, aggiungere `'read-vat-status'` all'union type `OperationType`.

- [ ] **Step 6.3: Creare l'handler `read-vat-status.ts`**

Creare `archibald-web-app/backend/src/operations/handlers/read-vat-status.ts`:

```typescript
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { updateVatValidatedAt } from '../../db/repositories/customers';
import { logger } from '../../logger';

type ReadVatStatusData = {
  customerProfile: string;
};

type ReadVatStatusBot = {
  readCustomerVatStatus: (customerProfile: string) => Promise<{ vatValidated: string; lastChecked: string } | null>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleReadVatStatus(
  pool: DbPool,
  bot: ReadVatStatusBot,
  data: ReadVatStatusData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ vatValidated: string | null }> {
  onProgress(10, 'Lettura stato IVA da Archibald');

  bot.setProgressCallback(async () => {});

  let vatValidated: string | null = null;
  try {
    const result = await bot.readCustomerVatStatus(data.customerProfile);
    vatValidated = result?.vatValidated ?? null;

    if (vatValidated === 'Sì' || vatValidated === 'Si') {
      await updateVatValidatedAt(pool, userId, data.customerProfile);
      logger.info('readVatStatus: IVA validata persistita', { customerProfile: data.customerProfile });
    }
  } catch (err) {
    logger.warn('readVatStatus: lettura fallita', { error: String(err), customerProfile: data.customerProfile });
  }

  onProgress(100, 'Stato IVA aggiornato');
  return { vatValidated };
}

function createReadVatStatusHandler(
  pool: DbPool,
  createBot: (userId: string) => ReadVatStatusBot,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as ReadVatStatusData;
    const result = await handleReadVatStatus(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleReadVatStatus, createReadVatStatusHandler, type ReadVatStatusData, type ReadVatStatusBot };
```

- [ ] **Step 6.4: Implementare `readCustomerVatStatus` nel bot (`archibald-bot.ts`)**

Aggiungere il metodo pubblico `readCustomerVatStatus` in `archibald-bot.ts` nello stesso blocco degli altri metodi customer. Il pattern segue `buildCustomerSnapshot`: naviga alla scheda, legge i campi, chiude senza modificare nulla.

```typescript
async readCustomerVatStatus(
  customerProfile: string,
): Promise<{ vatValidated: string; lastChecked: string } | null> {
  if (!this.page) throw new Error('Browser page is null');

  await this.page.goto(
    `${config.archibald.url}/CUSTTABLE_ListView_Agent/`,
    { waitUntil: 'networkidle2', timeout: 60000 },
  );
  await this.waitForDevExpressReady({ timeout: 10000 });
  await this.searchAndOpenCustomer(customerProfile);

  const g = (sel: string) =>
    this.page!.evaluate(
      (s: string) => (document.querySelector(s) as HTMLInputElement | null)?.value ?? '',
      sel,
    );

  const vatValidated  = await g('[id*="VATVALIEDE"][id$="_I"]');
  const lastChecked   = await g('[id*="VATLASTCHECKEDDATE"][id$="_I"]');

  await this.page.keyboard.press('Escape');
  await this.wait(500);

  return { vatValidated, lastChecked };
}
```

**Nota:** il customerProfile code è cercabile direttamente via `searchAndOpenCustomer`. Se la ricerca per profile non funziona, fare fallback con nome da DB (come in `updateCustomer`).

- [ ] **Step 6.5: Aggiungere la route `POST /:customerProfile/vat-status` in `customers.ts`**

In `archibald-web-app/backend/src/routes/customers.ts`, aggiungere al tipo `CustomersRouterDeps`:

```typescript
enqueueReadVatStatus?: (userId: string, customerProfile: string) => Promise<string>;
```

Aggiungere la route (inserire prima di route con parametri `:customerProfile` per evitare conflitti):

```typescript
router.post('/:customerProfile/vat-status', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { customerProfile } = req.params;

    if (!deps.enqueueReadVatStatus) {
      return res.status(503).json({ error: 'VAT status enrichment not available' });
    }

    const jobId = await deps.enqueueReadVatStatus(userId, customerProfile);
    res.json({ jobId, message: 'VAT status read queued' });
  } catch (err) {
    logger.error('POST /customers/:customerProfile/vat-status error', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Nota:** usiamo `POST` perché l'operazione ha effetti collaterali (enqueue di un job). Non `GET`.

- [ ] **Step 6.6: Registrare il nuovo handler in `main.ts`**

In `archibald-web-app/backend/src/main.ts`:
1. Importare `createReadVatStatusHandler`
2. Registrare il handler per il tipo `'read-vat-status'`
3. Passare `enqueueReadVatStatus` alle deps del router clienti

```bash
grep -n "createUpdateCustomerHandler\|operation-types\|operationProcessor" archibald-web-app/backend/src/main.ts | head -20
```

Seguire lo stesso pattern degli altri handler (create-customer, update-customer).

- [ ] **Step 6.7: Verificare build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

- [ ] **Step 6.8: Eseguire tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -30
```

Atteso: tutti i test esistenti PASS + nuovi test PASS.

- [ ] **Step 6.9: Commit finale**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts \
        archibald-web-app/backend/src/operations/handlers/read-vat-status.ts \
        archibald-web-app/backend/src/operations/operation-types.ts \
        archibald-web-app/backend/src/routes/customers.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(vat): lazy enrichment — bot readCustomerVatStatus + BullMQ handler + route"
```

---

## Verifica finale Piano A

- [ ] **Build TypeScript completo**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -10
```

Atteso: `✓ Build completed` senza errori.

- [ ] **Test suite completa**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -20
```

Atteso: tutti i test PASS.

- [ ] **Tag Piano A completato**

```bash
git tag backend-update-customer-foundation
```

---

## Note per i Piani successivi

**Piano B (Quick Fix Component)** può iniziare dopo il Task 5 (blocco ordine backend completato), perché dipende dalla risposta `400 customer_incomplete` con `missingFields`.

**Piano C (Frontend Pages)** dipende dal Piano A completo — le sezioni inline usano le route `/customers/:customerProfile` e lo snapshot post-save.

Il metodo `readCustomerVatStatus` è implementato nel bot al Step 6.4. Non aprire la scheda in modifica — solo navigare alla lista, aprire la scheda in sola lettura, leggere i campi, premere Escape.

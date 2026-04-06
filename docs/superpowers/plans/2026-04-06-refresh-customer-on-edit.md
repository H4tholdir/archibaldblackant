# Refresh Cliente da ERP all'Ingresso in Edit Mode — Piano di Implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando l'agente clicca "Modifica" su un cliente, il sistema legge i dati freschi dall'ERP (se i dati sono > 30 min vecchi) mostrando un modale bloccante, poi apre il form con dati aggiornati.

**Architecture:** Nuova operation `refresh-customer` nel queue BullMQ. Il bot naviga alla `CUSTTABLE_DetailView` in Edit mode, legge tutti i campi con selettori certificati, fa upsert in DB aggiornando `erp_detail_read_at`. Il frontend sostituisce il click diretto `enterEditMode` con `handleEnterEditMode` che fa il check di stale e mostra un overlay con progress SSE.

**Tech Stack:** Node.js/TypeScript (backend), Puppeteer (bot), PostgreSQL (DB), React 19 + Vitest + Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-04-06-refresh-customer-on-edit-design.md`

---

## File Map

| File | Azione | Responsabilità |
|---|---|---|
| `backend/src/db/migrations/053-erp-detail-read-at.sql` | Create | Aggiunge colonna `erp_detail_read_at` |
| `backend/src/db/repositories/customers.ts` | Modify | Tipi + `setErpDetailReadAt` + `mapRowToCustomer` + `COLUMNS_WITHOUT_PHOTO` |
| `backend/src/db/repositories/customers.spec.ts` | Modify | Test per `setErpDetailReadAt` |
| `backend/src/bot/archibald-bot.ts` | Modify | Aggiunge `readCustomerFields()` |
| `backend/src/operations/operation-types.ts` | Modify | Aggiunge `'refresh-customer'` |
| `backend/src/operations/handlers/refresh-customer.ts` | Create | Handler operazione |
| `backend/src/operations/handlers/refresh-customer.spec.ts` | Create | Unit test handler |
| `backend/src/operations/handlers/index.ts` | Modify | Esporta il nuovo handler |
| `backend/src/main.ts` | Modify | Registra handler con DI |
| `backend/src/operations/handlers/update-customer.ts` | Modify | Aggiunge `setErpDetailReadAt` post-save |
| `backend/src/operations/handlers/update-customer.spec.ts` | Modify | Test `setErpDetailReadAt` chiamato |
| `frontend/src/types/customer.ts` | Modify | Aggiunge `erpDetailReadAt` |
| `frontend/src/api/operations.ts` | Modify | Aggiunge `'refresh-customer'` a `OperationType` |
| `frontend/src/pages/CustomerProfilePage.tsx` | Modify | `handleEnterEditMode` + stati refresh + overlay |
| `frontend/src/pages/CustomerProfilePage.spec.tsx` | Modify | Test stale/fresh/fallback |

---

## Task 1: Migration SQL

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/053-erp-detail-read-at.sql`

> **Nota:** Verificare che il file `052-*.sql` non sia stato creato nel frattempo (riservato a Customer Photos). Se esiste già, usare 054.

- [ ] **Step 1: Crea il file migration**

```sql
-- archibald-web-app/backend/src/db/migrations/053-erp-detail-read-at.sql
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS erp_detail_read_at TIMESTAMPTZ;
```

- [ ] **Step 2: Esegui la migration sul DB locale**

```bash
npm run migrate --prefix archibald-web-app/backend
```

Output atteso: `Running migration: 053-erp-detail-read-at.sql` seguito da `Migration complete`.

- [ ] **Step 3: Verifica la colonna**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 "docker compose -f /home/deploy/archibald-app/docker-compose.yml exec -T postgres psql -U archibald -d archibald -c '\d agents.customers'" 2>/dev/null | grep erp_detail
```

Per il DB locale (non prod), verifica con:
```bash
psql $DATABASE_URL -c '\d agents.customers' | grep erp_detail
```

Output atteso: `erp_detail_read_at | timestamp with time zone |`

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/053-erp-detail-read-at.sql
git commit -m "feat(db): aggiunge colonna erp_detail_read_at a agents.customers"
```

---

## Task 2: Backend DB — Tipi e `setErpDetailReadAt`

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/customers.ts`
- Modify: `archibald-web-app/backend/src/db/repositories/customers.spec.ts`

- [ ] **Step 1: Scrivi il test fallente per `setErpDetailReadAt`**

In `customers.spec.ts`, aggiungi nella describe suite esistente (trova il punto dove sono i test delle funzioni UPDATE):

```typescript
describe('setErpDetailReadAt', () => {
  test('esegue UPDATE su erp_detail_read_at per il cliente corretto', async () => {
    const pool = makePool();
    await setErpDetailReadAt(pool as never, 'u1', '57348');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string, unknown[]]>;
    const call = calls.find(([sql]) => sql.includes('erp_detail_read_at'));
    expect(call).toBeDefined();
    expect(call![1]).toEqual([expect.any(String), '57348', 'u1']);
  });
});
```

Importa `setErpDetailReadAt` nel file (non esiste ancora — il test DEVE fallire):
```typescript
import { setErpDetailReadAt } from './customers';
```

- [ ] **Step 2: Esegui il test — verifica che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customers.spec
```

Output atteso: `FAIL ... setErpDetailReadAt ... setErpDetailReadAt is not a function`

- [ ] **Step 3: Aggiungi `erp_detail_read_at` a `CustomerRow` (riga ~52)**

In `customers.ts`, nella definizione di `CustomerRow`, aggiungi dopo `agent_notes`:

```typescript
  agent_notes: string | null;
  erp_detail_read_at: string | null;  // ← aggiungi
};
```

- [ ] **Step 4: Aggiungi `erpDetailReadAt` a `Customer` (riga ~103)**

Nella definizione di `Customer`, aggiungi dopo `agentNotes`:

```typescript
  agentNotes: string | null;
  erpDetailReadAt: string | null;  // ← aggiungi
};
```

- [ ] **Step 5: Aggiungi la colonna a `COLUMNS_WITHOUT_PHOTO` (riga ~178)**

```typescript
const COLUMNS_WITHOUT_PHOTO = `
  erp_id, user_id, account_num, name,
  vat_number, fiscal_code, sdi, pec,
  phone, mobile, email, url, attention_to,
  street, logistics_address, postal_code, city,
  customer_type, type, delivery_terms, description,
  last_order_date, actual_order_count, actual_sales,
  previous_order_count_1, previous_sales_1,
  previous_order_count_2, previous_sales_2,
  external_account_number, our_account_number,
  hash, last_sync, created_at, updated_at, bot_status, archibald_name, vat_validated_at,
  sector, price_group, line_discount, payment_terms, notes, name_alias, county, state, country, agent_notes,
  erp_detail_read_at
`;
```

- [ ] **Step 6: Aggiorna `mapRowToCustomer` (riga ~230)**

Aggiungi dopo `agentNotes: row.agent_notes,`:

```typescript
    agentNotes: row.agent_notes,
    erpDetailReadAt: row.erp_detail_read_at ?? null,  // ← aggiungi
```

- [ ] **Step 7: Aggiungi la funzione `setErpDetailReadAt` (vicino a `updateVatValidatedAt`)**

Aggiungi dopo `updateVatValidatedAt`:

```typescript
async function setErpDetailReadAt(
  pool: DbPool,
  userId: string,
  erpId: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET erp_detail_read_at = NOW(), updated_at = NOW()
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );
}
```

Aggiungi `setErpDetailReadAt` agli export in fondo al file.

- [ ] **Step 8: Esegui il test — verifica che passi**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customers.spec
```

Output atteso: `PASS ... setErpDetailReadAt ... esegue UPDATE su erp_detail_read_at`

- [ ] **Step 9: Verifica il build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep -E "error|warning" | head -20
```

Output atteso: nessun errore.

- [ ] **Step 10: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/customers.ts \
        archibald-web-app/backend/src/db/repositories/customers.spec.ts
git commit -m "feat(db): aggiunge erp_detail_read_at al tipo Customer e setErpDetailReadAt"
```

---

## Task 3: Bot — `readCustomerFields()`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`

> Questo metodo usa Puppeteer e non è unit-testabile in isolamento. Il test è E2E manuale (vedere Step 4). Segui le istruzioni della Bibbia ERP (`memory/erp-customer-form-fields.md`) per qualsiasi dubbio sui selettori.

- [ ] **Step 1: Aggiungi il metodo `readCustomerFields()` nel bot**

Aggiungi dopo `navigateToCustomerByErpId` (riga ~13890):

```typescript
  async readCustomerFields(): Promise<import('../db/repositories/customers').CustomerFormInput> {
    if (!this.page) throw new Error('Browser page is null');

    // Estrai erpId dall'URL corrente (siamo in ?mode=View dopo navigateToCustomerByErpId)
    const currentUrl = this.page.url();
    const erpIdMatch = currentUrl.match(/CUSTTABLE_DetailView\/([^/?]+)/);
    if (!erpIdMatch) throw new Error(`readCustomerFields: erpId non trovato nell'URL: ${currentUrl}`);
    const erpId = erpIdMatch[1];

    logger.info('readCustomerFields: navigazione a Edit mode', { erpId });
    await this.page.goto(
      `${config.archibald.url}/CUSTTABLE_DetailView/${erpId}/?mode=Edit`,
      { waitUntil: 'networkidle2', timeout: 60000 },
    );
    if (this.page.url().includes('Login.aspx')) {
      throw new Error('readCustomerFields: sessione scaduta');
    }
    await this.waitForDevExpressReady({ timeout: 10000 });

    const readInput = async (idFragment: string): Promise<string | null> =>
      this.page!.evaluate(
        (frag: string) =>
          (document.querySelector(`[id*="${frag}"]`) as HTMLInputElement | null)?.value?.trim() ?? null,
        idFragment,
      );

    const name = await readInput('dviNAME_Edit_I');
    if (!name) throw new Error('readCustomerFields: campo NAME vuoto nella DetailView ERP');

    const notes = await this.page.evaluate(
      () =>
        (document.querySelector('textarea[id*="xaf_dviCUSTINFO"]') as HTMLTextAreaElement | null)
          ?.value?.trim() ?? null,
    );

    const fields = {
      name,
      nameAlias:    (await readInput('dviNAMEALIAS_Edit_I'))                       ?? undefined,
      vatNumber:    (await readInput('dviVATNUM_Edit_I'))                           ?? undefined,
      fiscalCode:   (await readInput('dviFISCALCODE_Edit_I'))                       ?? undefined,
      pec:          (await readInput('dviLEGALEMAIL_Edit_I'))                      ?? undefined,
      sdi:          (await readInput('dviLEGALAUTHORITY_Edit_I'))                  ?? undefined,
      street:       (await readInput('dviSTREET_Edit_I'))                          ?? undefined,
      postalCode:   (await readInput('dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_I')) ?? undefined,
      phone:        (await readInput('dviPHONE_Edit_I'))                           ?? undefined,
      mobile:       (await readInput('dviCELLULARPHONE_Edit_I'))                  ?? undefined,
      email:        (await readInput('dviEMAIL_Edit_I'))                           ?? undefined,
      url:          (await readInput('dviURL_Edit_I'))                             ?? undefined,
      deliveryMode: (await readInput('dviDLVMODE_Edit_dropdown_DD_I'))             ?? undefined,
      paymentTerms: (await readInput('dviPAYMTERMID_Edit_find_Edit_I'))            ?? undefined,
      sector:       (await readInput('dviBUSINESSSECTORID_Edit_dropdown_DD_I'))    ?? undefined,
      attentionTo:  (await readInput('dviBRASCRMATTENTIONTO_Edit_I'))              ?? undefined,
      notes:        notes ?? undefined,
      county:       (await readInput('dviCOUNTY_Edit_I'))                          ?? undefined,
      state:        (await readInput('dviSTATE_Edit_I'))                           ?? undefined,
      country:      (await readInput('dviCOUNTRYREGIONID_Edit_I'))                 ?? undefined,
      lineDiscount: (await readInput('dviLINEDISC_Edit_dropdown_DD_I'))            ?? undefined,
    };

    logger.info('readCustomerFields: campi letti', { erpId, fieldCount: Object.keys(fields).length });
    return fields;
  }
```

- [ ] **Step 2: Verifica il build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep -E "error" | head -10
```

Output atteso: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): aggiunge readCustomerFields() per lettura campi da DetailView ERP"
```

- [ ] **Step 4: (manuale, facoltativo) Test E2E locale**

Usa il file diagnostico `diag-arca-matching.mjs` come template per un rapido test del nuovo metodo. Verifica che per il cliente 57.348 (Dr. Marco Cirmeni) i campi `name`, `email`, `phone`, `vatNumber` corrispondano a quelli visibili nell'ERP. Se qualche selettore non funziona (campo restituisce `null`), consulta `memory/erp-customer-form-fields.md` per il corretto pattern `id*=` e correggi in `readCustomerFields()`.

---

## Task 4: Operation Type — `refresh-customer`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/operation-types.ts`

- [ ] **Step 1: Scrivi il test fallente**

In `operation-types.spec.ts` (se esiste) o in un nuovo file `operations/operation-types.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { OPERATION_TYPES, OPERATION_PRIORITIES, isWriteOperation, isScheduledSync } from './operation-types';

describe('refresh-customer operation type', () => {
  test('è incluso in OPERATION_TYPES', () => {
    expect(OPERATION_TYPES).toContain('refresh-customer');
  });

  test('ha una priorità definita', () => {
    expect(OPERATION_PRIORITIES['refresh-customer']).toBe(4);
  });

  test('non è una write operation', () => {
    expect(isWriteOperation('refresh-customer')).toBe(false);
  });

  test('non è uno scheduled sync', () => {
    expect(isScheduledSync('refresh-customer')).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui il test — verifica che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose operation-types
```

Output atteso: `FAIL ... refresh-customer ... is not a valid operation type`

- [ ] **Step 3: Aggiungi `'refresh-customer'` a `OPERATION_TYPES`**

In `operation-types.ts`, aggiungi dopo `'read-vat-status'`:

```typescript
const OPERATION_TYPES = [
  'submit-order',
  'create-customer',
  'update-customer',
  'read-vat-status',
  'refresh-customer',      // ← aggiungi
  'send-to-verona',
  ...
] as const;
```

- [ ] **Step 4: Aggiungi la priorità a `OPERATION_PRIORITIES`**

```typescript
const OPERATION_PRIORITIES: Record<OperationType, number> = {
  'submit-order': 1,
  'create-customer': 2,
  'update-customer': 3,
  'read-vat-status': 4,
  'refresh-customer': 4,   // ← aggiungi
  'send-to-verona': 5,
  ...
};
```

- [ ] **Step 5: Esegui il test — verifica che passi**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose operation-types
```

Output atteso: tutti i test `refresh-customer operation type` passano.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/operation-types.ts \
        archibald-web-app/backend/src/operations/operation-types.spec.ts
git commit -m "feat(ops): aggiunge tipo operazione refresh-customer con priorità 4"
```

---

## Task 5: Handler — `refresh-customer.ts`

**Files:**
- Create: `archibald-web-app/backend/src/operations/handlers/refresh-customer.ts`
- Create: `archibald-web-app/backend/src/operations/handlers/refresh-customer.spec.ts`

- [ ] **Step 1: Scrivi i test fallenti**

Crea `refresh-customer.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { handleRefreshCustomer } from './refresh-customer';
import type { RefreshCustomerBot, RefreshCustomerData } from './refresh-customer';
import type { CustomerFormInput } from '../../db/repositories/customers';

const makePool = () => ({ query: vi.fn().mockResolvedValue({ rows: [{ erp_id: '57348', user_id: 'u1', name: 'Test', hash: 'h', last_sync: 1, erp_detail_read_at: null, ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`col${i}`, null])) }], rowCount: 1 }) });

const mockFields: CustomerFormInput = {
  name: 'Dr. Marco Cirmeni',
  email: 'info@cirmeni.it',
  phone: '+393914079157',
  vatNumber: '05101170651',
};

const makeBot = (fields: CustomerFormInput = mockFields): RefreshCustomerBot => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  navigateToCustomerByErpId: vi.fn().mockResolvedValue(undefined),
  readCustomerFields: vi.fn().mockResolvedValue(fields),
  close: vi.fn().mockResolvedValue(undefined),
});

const data: RefreshCustomerData = { erpId: '57348' };

describe('handleRefreshCustomer', () => {
  test('chiama navigateToCustomerByErpId con erpId corretto', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleRefreshCustomer(pool as never, bot, data, 'u1', vi.fn());
    expect(bot.navigateToCustomerByErpId).toHaveBeenCalledWith('57348');
  });

  test('chiama readCustomerFields dopo la navigazione', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleRefreshCustomer(pool as never, bot, data, 'u1', vi.fn());
    expect(bot.readCustomerFields).toHaveBeenCalled();
  });

  test('esegue upsert su DB (pool.query con INSERT/ON CONFLICT)', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleRefreshCustomer(pool as never, bot, data, 'u1', vi.fn());
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string]>;
    const upsertCall = calls.find(([sql]) => sql.includes('ON CONFLICT'));
    expect(upsertCall).toBeDefined();
  });

  test('chiama setErpDetailReadAt (UPDATE erp_detail_read_at)', async () => {
    const pool = makePool();
    const bot = makeBot();
    await handleRefreshCustomer(pool as never, bot, data, 'u1', vi.fn());
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string]>;
    const readAtCall = calls.find(([sql]) => sql.includes('erp_detail_read_at'));
    expect(readAtCall).toBeDefined();
  });

  test('chiama bot.close() nel finally anche se readCustomerFields lancia', async () => {
    const pool = makePool();
    const bot = makeBot();
    (bot.readCustomerFields as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bot error'));
    await expect(handleRefreshCustomer(pool as never, bot, data, 'u1', vi.fn())).rejects.toThrow('bot error');
    expect(bot.close).toHaveBeenCalled();
  });

  test('emette progress a 20, 60, 90 e 100', async () => {
    const pool = makePool();
    const bot = makeBot();
    const onProgress = vi.fn();
    await handleRefreshCustomer(pool as never, bot, data, 'u1', onProgress);
    expect(onProgress).toHaveBeenCalledWith(20, 'Navigazione al cliente');
    expect(onProgress).toHaveBeenCalledWith(60, 'Lettura dati dal form');
    expect(onProgress).toHaveBeenCalledWith(90, 'Aggiornamento database');
    expect(onProgress).toHaveBeenCalledWith(100, 'Completato');
  });
});
```

- [ ] **Step 2: Esegui il test — verifica che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose refresh-customer.spec
```

Output atteso: `FAIL ... Cannot find module './refresh-customer'`

- [ ] **Step 3: Crea l'handler `refresh-customer.ts`**

```typescript
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { CustomerFormInput } from '../../db/repositories/customers';
import { upsertSingleCustomer, setErpDetailReadAt } from '../../db/repositories/customers';
import { logger } from '../../logger';

type RefreshCustomerData = {
  erpId: string;
};

type RefreshCustomerBot = {
  initialize: () => Promise<void>;
  navigateToCustomerByErpId: (erpId: string) => Promise<void>;
  readCustomerFields: () => Promise<CustomerFormInput>;
  close: () => Promise<void>;
};

async function handleRefreshCustomer(
  pool: DbPool,
  bot: RefreshCustomerBot,
  data: RefreshCustomerData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ erpId: string }> {
  const { erpId } = data;

  await bot.initialize();
  try {
    onProgress(20, 'Navigazione al cliente');
    await bot.navigateToCustomerByErpId(erpId);

    onProgress(60, 'Lettura dati dal form');
    const fields = await bot.readCustomerFields();

    onProgress(90, 'Aggiornamento database');
    await upsertSingleCustomer(pool, userId, fields, erpId, 'synced');
    await setErpDetailReadAt(pool, userId, erpId);

    onProgress(100, 'Completato');
    logger.info('handleRefreshCustomer: completato', { erpId, userId });
    return { erpId };
  } finally {
    await bot.close();
  }
}

function createRefreshCustomerHandler(
  pool: DbPool,
  createBot: (userId: string) => RefreshCustomerBot,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as RefreshCustomerData;
    const result = await handleRefreshCustomer(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleRefreshCustomer,
  createRefreshCustomerHandler,
  type RefreshCustomerData,
  type RefreshCustomerBot,
};
```

- [ ] **Step 4: Esegui i test — verifica che passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose refresh-customer.spec
```

Output atteso: tutti i 6 test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/refresh-customer.ts \
        archibald-web-app/backend/src/operations/handlers/refresh-customer.spec.ts
git commit -m "feat(ops): aggiunge handler refresh-customer con unit test"
```

---

## Task 6: Registrazione Handler — `index.ts` e `main.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/index.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiungi export in `index.ts`**

Aggiungi dopo la riga di `read-vat-status`:

```typescript
export { createReadVatStatusHandler, type ReadVatStatusBot } from './read-vat-status';
export { createRefreshCustomerHandler, type RefreshCustomerBot } from './refresh-customer';  // ← aggiungi
```

- [ ] **Step 2: Registra il handler in `main.ts`**

In `main.ts`, trova il blocco con `'read-vat-status'` e aggiungi immediatamente dopo:

```typescript
'read-vat-status': createReadVatStatusHandler(pool, (userId) => {
  // ... (codice esistente)
}),
'refresh-customer': createRefreshCustomerHandler(pool, (userId) => {
  const bot = createBotForUser(userId);
  let initialized = false;
  const ensureInit = async () => {
    if (!initialized) { await bot.initialize(); initialized = true; }
  };
  return {
    initialize: async () => { await ensureInit(); },
    navigateToCustomerByErpId: async (erpId) => { await ensureInit(); return bot.navigateToCustomerByErpId(erpId); },
    readCustomerFields: async () => { await ensureInit(); return bot.readCustomerFields(); },
    close: async () => bot.close(),
  };
}),
```

Aggiungi `createRefreshCustomerHandler` all'import da `./operations/handlers`:

```typescript
import {
  // ... import esistenti ...
  createRefreshCustomerHandler,
} from './operations/handlers';
```

- [ ] **Step 3: Verifica il build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep -E "error" | head -10
```

Output atteso: nessun errore.

- [ ] **Step 4: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -10
```

Output atteso: tutti i test passano (o stessa quantità di fallimenti di prima).

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/index.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(ops): registra handler refresh-customer in main.ts"
```

---

## Task 7: `update-customer` — Aggiunge `setErpDetailReadAt` post-save

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/update-customer.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/update-customer.spec.ts`

- [ ] **Step 1: Scrivi il test fallente**

In `update-customer.spec.ts`, individua dove viene testato `handleUpdateCustomer` con successo. Aggiungi:

```typescript
test('chiama setErpDetailReadAt dopo save riuscito', async () => {
  const pool = makePool();
  const bot = makeSuccessBot();
  await handleUpdateCustomer(pool as never, bot, { erpId: '57348', diff: { phone: '+39123' } }, 'u1', vi.fn());
  const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string]>;
  const readAtCall = calls.find(([sql]) => sql.includes('erp_detail_read_at'));
  expect(readAtCall).toBeDefined();
});
```

> Adatta `makeSuccessBot()` al nome del costruttore del bot mock già presente nel file spec.

- [ ] **Step 2: Esegui il test — verifica che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose update-customer.spec
```

Output atteso: `FAIL ... chiama setErpDetailReadAt ... Expected call not found`

- [ ] **Step 3: Aggiungi `setErpDetailReadAt` all'import in `update-customer.ts`**

```typescript
import { updateVatValidatedAt, updateAgentNotes, setErpDetailReadAt } from '../../db/repositories/customers';
```

- [ ] **Step 4: Chiama `setErpDetailReadAt` alla fine del save riuscito**

In `handleUpdateCustomer`, subito prima di `onProgress(100, 'Aggiornamento completato')`:

```typescript
  if (agentNotes !== undefined) {
    await updateAgentNotes(pool, userId, erpId, agentNotes ?? null);
  }

  if (diff.vatNumber !== undefined) {
    await updateVatValidatedAt(pool, userId, erpId);
  }

  await setErpDetailReadAt(pool, userId, erpId);  // ← aggiungi

  onProgress(88, 'Aggiornamento stato');
  onProgress(100, 'Aggiornamento completato');
  return { success: true };
```

- [ ] **Step 5: Esegui i test — verifica che passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose update-customer.spec
```

Output atteso: tutti i test passano incluso il nuovo.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/update-customer.ts \
        archibald-web-app/backend/src/operations/handlers/update-customer.spec.ts
git commit -m "feat(ops): update-customer aggiorna erp_detail_read_at dopo save"
```

---

## Task 8: Frontend — Tipi

**Files:**
- Modify: `archibald-web-app/frontend/src/types/customer.ts`
- Modify: `archibald-web-app/frontend/src/api/operations.ts`

- [ ] **Step 1: Aggiungi `erpDetailReadAt` al tipo `Customer` frontend**

In `frontend/src/types/customer.ts`, aggiungi dopo `agentNotes`:

```typescript
  agentNotes?: string | null;
  erpDetailReadAt?: string | null;  // ← aggiungi
```

- [ ] **Step 2: Aggiungi `'refresh-customer'` alla union `OperationType`**

In `frontend/src/api/operations.ts`, aggiungi all'unione:

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
  | 'sync-customer-addresses'
  | 'read-vat-status'
  | 'refresh-customer';  // ← aggiungi
```

- [ ] **Step 3: Verifica il type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep -E "error" | head -10
```

Output atteso: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/types/customer.ts \
        archibald-web-app/frontend/src/api/operations.ts
git commit -m "feat(frontend): aggiunge erpDetailReadAt a Customer e refresh-customer a OperationType"
```

---

## Task 9: Frontend — `CustomerProfilePage` — `handleEnterEditMode` e Overlay

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx`

- [ ] **Step 1: Scrivi i test fallenti**

In `CustomerProfilePage.spec.tsx`, aggiungi dopo i test esistenti:

```typescript
const STALE_CUSTOMER = { ...mockCustomer, erpDetailReadAt: null };
const FRESH_CUSTOMER = { ...mockCustomer, erpDetailReadAt: new Date().toISOString() };

function renderWithCustomer(customer: typeof mockCustomer) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: customer }),
  }));
  vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('fake-jwt') });
  return render(
    <MemoryRouter initialEntries={[`/customers/${customer.erpId}`]}>
      <Routes>
        <Route path="/customers/:erpId" element={<CustomerProfilePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('handleEnterEditMode — stale data', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('con erpDetailReadAt = null mostra overlay e chiama enqueueOperation', async () => {
    renderWithCustomer(STALE_CUSTOMER);
    await waitFor(() => expect(screen.getByText('Rossi Mario')).toBeInTheDocument());

    const modifyBtn = getModifyButton();
    fireEvent.click(modifyBtn);

    await waitFor(() =>
      expect(enqueueOperation).toHaveBeenCalledWith('refresh-customer', { erpId: 'A001' }),
    );
    expect(screen.getByText('Lettura dati ERP…')).toBeInTheDocument();
  });

  test('con erpDetailReadAt < 30 min non chiama enqueueOperation ed entra in editMode', async () => {
    renderWithCustomer(FRESH_CUSTOMER);
    await waitFor(() => expect(screen.getByText('Rossi Mario')).toBeInTheDocument());

    const modifyBtn = getModifyButton();
    fireEvent.click(modifyBtn);

    await waitFor(() => expect(screen.getByText('💾 Salva')).toBeInTheDocument());
    expect(enqueueOperation).not.toHaveBeenCalledWith('refresh-customer', expect.anything());
  });

  test('se refresh fallisce entra in editMode comunque', async () => {
    const { pollJobUntilDone } = await import('../api/operations');
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('bot error'));

    renderWithCustomer(STALE_CUSTOMER);
    await waitFor(() => expect(screen.getByText('Rossi Mario')).toBeInTheDocument());

    fireEvent.click(getModifyButton());

    await waitFor(() => expect(screen.getByText('💾 Salva')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Esegui i test — verifica che falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage.spec
```

Output atteso: `FAIL ... handleEnterEditMode ... enqueueOperation ... not been called`

- [ ] **Step 3: Aggiungi stati `refreshing` in `CustomerProfilePage.tsx`**

Dopo i flag `saving`, `saveProgress`, `saveLabel` (riga ~63-65), aggiungi:

```typescript
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [refreshLabel, setRefreshLabel] = useState('');
```

- [ ] **Step 4: Aggiungi `handleEnterEditMode` dopo `enterEditMode`**

Dopo la funzione `enterEditMode` (riga ~165):

```typescript
  async function handleEnterEditMode() {
    if (!customer) return;
    const STALE_THRESHOLD_MS = 30 * 60 * 1000;
    const isStale =
      !customer.erpDetailReadAt ||
      Date.now() - new Date(customer.erpDetailReadAt).getTime() > STALE_THRESHOLD_MS;

    if (!isStale) {
      enterEditMode();
      return;
    }

    setRefreshing(true);
    try {
      const { jobId } = await enqueueOperation('refresh-customer', { erpId });
      await pollJobUntilDone(jobId, {
        onProgress: (p, label) => {
          setRefreshProgress(p);
          if (label) setRefreshLabel(label);
        },
      });
      const fresh = await fetchCustomer(erpId);
      setCustomer(fresh);
      enterEditMode();
    } catch {
      toastService.error('Impossibile leggere dati ERP — procedo con dati locali');
      enterEditMode();
    } finally {
      setRefreshing(false);
      setRefreshProgress(0);
      setRefreshLabel('');
    }
  }
```

- [ ] **Step 5: Sostituisci `onClick={enterEditMode}` con `handleEnterEditMode`**

Trova il bottone "✎ Modifica" (riga ~426):

```typescript
          {!editMode ? (
            <button
              onClick={() => { void handleEnterEditMode(); }}   // ← cambia da onClick={enterEditMode}
              disabled={refreshing}
              style={{ background: refreshing ? '#94a3b8' : '#eff6ff', color: refreshing ? '#fff' : '#2563eb', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '6px 14px', fontWeight: 700, cursor: refreshing ? 'not-allowed' : 'pointer', fontSize: 12 }}
            >
              ✎ Modifica
            </button>
```

- [ ] **Step 6: Aggiungi l'overlay modale bloccante nel JSX**

Subito prima del `</div>` finale della pagina (o dentro il return, dopo il topbar), aggiungi:

```typescript
        {refreshing && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              background: '#fff', borderRadius: '14px', padding: '24px 28px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)', minWidth: '240px', textAlign: 'center',
            }}>
              <div style={{
                width: '40px', height: '40px', margin: '0 auto 12px',
                borderRadius: '50%', border: '3px solid #dbeafe', borderTop: '3px solid #2563eb',
              }} />
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                Lettura dati ERP…
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '14px', minHeight: '16px' }}>
                {refreshLabel || 'Connessione al server ERP'}
              </div>
              <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${refreshProgress}%`,
                  background: 'linear-gradient(90deg,#2563eb,#60a5fa)',
                  borderRadius: '3px',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 7: Aggiungi `pollJobUntilDone` all'import esistente di `api/operations`**

Verifica che `pollJobUntilDone` sia già importato (riga ~13):

```typescript
import { enqueueOperation, pollJobUntilDone } from '../api/operations';
```

Se manca `pollJobUntilDone`, aggiungilo.

- [ ] **Step 8: Esegui i test — verifica che passino**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerProfilePage.spec
```

Output atteso: tutti i test passano inclusi i 3 nuovi.

- [ ] **Step 9: Verifica il type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep -E "error" | head -10
```

Output atteso: nessun errore.

- [ ] **Step 10: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx \
        archibald-web-app/frontend/src/pages/CustomerProfilePage.spec.tsx
git commit -m "feat(ui): aggiunge refresh ERP all'ingresso in edit mode cliente

- handleEnterEditMode con check stale 30min
- overlay bloccante con progress bar
- fallback graceful se bot fallisce"
```

---

## Checklist finale

- [ ] `npm test --prefix archibald-web-app/backend` — tutti i test passano
- [ ] `npm test --prefix archibald-web-app/frontend` — tutti i test passano
- [ ] `npm run build --prefix archibald-web-app/backend` — nessun errore TypeScript
- [ ] `npm run type-check --prefix archibald-web-app/frontend` — nessun errore TypeScript

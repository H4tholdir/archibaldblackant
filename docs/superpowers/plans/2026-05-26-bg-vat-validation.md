# Background VAT Validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validare automaticamente le P.IVA clienti in background così l'utente non deve cliccare "Valida ora" manualmente prima di ogni ordine.

**Architecture:** Pipeline a due fasi: Phase 1 (`read-vat-status`, lettura read-only ERP ListView ~5s) catena in Phase 2 (`bg-validate-vat`, bot apre form edit ~30s) solo se Phase 1 fallisce. Tre trigger: creazione ordine in attesa (P25), sweep AdaptiveScheduler (P500), post-sync-customers (P500). Dedup via `enqueueWithDedup` (built-in) + throttle DB `vat_last_bg_check_at`.

**Tech Stack:** TypeScript, Express, PostgreSQL (`pg` pool), Puppeteer (archibald-bot.ts), WebSocket (ws-server), `enqueueWithDedup` da `db/repositories/agent-queue.ts`.

**Spec:** `docs/superpowers/specs/2026-05-26-bg-vat-validation-design.md`

---

## File Map

| File | Azione |
|---|---|
| `backend/src/db/migrations/027-vat-bg-check.sql` | Crea |
| `backend/src/db/repositories/customers.ts` | Modifica — CustomerRow, SELECT list, mapRowToCustomer, 3 nuove funzioni |
| `backend/src/operations/handlers/bg-validate-vat.ts` | Crea |
| `backend/src/operations/handlers/bg-validate-vat.spec.ts` | Crea |
| `backend/src/operations/handlers/read-vat-status.ts` | Modifica — chain Phase 2, updateVatLastBgCheckAt |
| `backend/src/operations/enqueue-vat-bg-validation.ts` | Crea |
| `backend/src/operations/enqueue-vat-bg-validation.spec.ts` | Crea |
| `backend/src/operations/queue-router.ts` | Modifica — aggiunge `bg-validate-vat` |
| `backend/src/bot/archibald-bot.ts` | Modifica — aggiunge `openCustomerAndValidateVat` |
| `backend/src/sync/adaptive-scheduler.ts` | Modifica — sweep VAT in schedulerTick |
| `backend/src/routes/pending-orders.ts` | Modifica — Trigger A |
| `backend/src/main.ts` | Modifica — wire handler + Trigger A dep + Trigger C |
| `frontend/src/api/operations.ts` | Modifica — aggiunge `bg-validate-vat` |
| `frontend/src/types/customer.ts` | Modifica — vatInvalid, vatLastBgCheckAt |
| `frontend/src/utils/customer-completeness.ts` | Modifica — stato vatInvalid |
| `frontend/src/utils/customer-completeness.spec.ts` | Modifica — nuovi test |
| `frontend/src/pages/PendingOrdersPage.tsx` | Modifica — badge + WS events |
| `frontend/src/components/OrderFormSimple.tsx` | Modifica — badge + WS events |

---

## Task 1: DB Migration

**Files:**
- Crea: `archibald-web-app/backend/src/db/migrations/027-vat-bg-check.sql`

- [ ] **Step 1: Crea il file migration**

```sql
-- 027-vat-bg-check.sql
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS vat_last_bg_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vat_invalid            BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: Applica la migration in locale**

```bash
npm run migrate --prefix archibald-web-app/backend
```

Expected: output indica migration 027 eseguita senza errori.

- [ ] **Step 3: Verifica colonne presenti**

```bash
npm run migrate --prefix archibald-web-app/backend
```

Il secondo run deve essere idempotente (IF NOT EXISTS) — zero errori.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/027-vat-bg-check.sql
git commit -m "feat(db): migration 027 — colonne vat_last_bg_check_at e vat_invalid"
```

---

## Task 2: DB Repository — Nuove funzioni e tipo aggiornato

**Files:**
- Modifica: `archibald-web-app/backend/src/db/repositories/customers.ts`

- [ ] **Step 1: Aggiunge campi a `CustomerRow` (riga ~42)**

Aggiungi dopo `vat_validated_at: string | null;`:

```typescript
vat_last_bg_check_at: string | null;
vat_invalid: boolean;
```

- [ ] **Step 2: Aggiunge colonne alla SELECT list (riga ~225)**

Modifica la riga:
```typescript
  geo_address, geo_latitude, geo_longitude, altre_info_synced_at
```
in:
```typescript
  geo_address, geo_latitude, geo_longitude, altre_info_synced_at,
  vat_last_bg_check_at, vat_invalid
```

- [ ] **Step 3: Aggiorna `mapRowToCustomer` per mappare i nuovi campi**

Dopo `vatValidatedAt: row.vat_validated_at,` aggiungi:

```typescript
vatLastBgCheckAt: row.vat_last_bg_check_at,
vatInvalid: row.vat_invalid,
```

- [ ] **Step 4: Scrivi test fallente per `updateVatLastBgCheckAt`**

Crea (o aggiungi a un file spec esistente per customers) `customers-vat-bg.spec.ts` nella stessa directory:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { updateVatLastBgCheckAt, setVatInvalid, getCustomersNeedingVatValidation } from './customers';
import type { DbPool } from '../pool';

function mockPool(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as DbPool;
}

describe('updateVatLastBgCheckAt', () => {
  it('esegue UPDATE con erpId e userId corretti', async () => {
    const pool = mockPool();
    await updateVatLastBgCheckAt(pool, 'user-1', 'erp-42');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SET vat_last_bg_check_at = NOW()'),
      ['erp-42', 'user-1'],
    );
  });
});

describe('setVatInvalid', () => {
  it('imposta vat_invalid = true per erpId/userId', async () => {
    const pool = mockPool();
    await setVatInvalid(pool, 'user-1', 'erp-42');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SET vat_invalid = TRUE'),
      ['erp-42', 'user-1'],
    );
  });
});

describe('getCustomersNeedingVatValidation', () => {
  it('restituisce erpId e vatNumber per clienti non validati', async () => {
    const pool = mockPool([{ erp_id: 'erp-1', vat_number: 'IT12345678901' }]);
    const result = await getCustomersNeedingVatValidation(pool, 'user-1');
    expect(result).toEqual([{ erpId: 'erp-1', vatNumber: 'IT12345678901' }]);
  });

  it('restituisce array vuoto se nessun cliente candidato', async () => {
    const pool = mockPool([]);
    const result = await getCustomersNeedingVatValidation(pool, 'user-1');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 5: Esegui il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customers-vat-bg
```

Expected: 3 test falliscono con "is not a function".

- [ ] **Step 6: Implementa le 3 nuove funzioni**

Aggiungi dopo `updateVatValidatedAt` (riga ~777):

```typescript
async function updateVatLastBgCheckAt(
  pool: DbPool,
  userId: string,
  erpId: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers
     SET vat_last_bg_check_at = NOW()
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );
}

async function setVatInvalid(
  pool: DbPool,
  userId: string,
  erpId: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers
     SET vat_invalid = TRUE, vat_last_bg_check_at = NOW()
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );
}

async function getCustomersNeedingVatValidation(
  pool: DbPool,
  userId: string,
): Promise<Array<{ erpId: string; vatNumber: string }>> {
  const { rows } = await pool.query<{ erp_id: string; vat_number: string }>(
    `SELECT erp_id, vat_number
     FROM agents.customers
     WHERE user_id = $1
       AND vat_number IS NOT NULL
       AND vat_number <> ''
       AND vat_validated_at IS NULL
       AND vat_invalid = FALSE
       AND (
         vat_last_bg_check_at IS NULL
         OR vat_last_bg_check_at < NOW() - INTERVAL '2 hours'
       )`,
    [userId],
  );
  return rows.map(r => ({ erpId: r.erp_id, vatNumber: r.vat_number }));
}
```

Aggiungi le 3 funzioni alla lista exports in fondo al file (cerca il blocco `export {`):

```typescript
updateVatLastBgCheckAt,
setVatInvalid,
getCustomersNeedingVatValidation,
```

- [ ] **Step 7: Esegui i test per verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customers-vat-bg
```

Expected: 4 test PASS.

- [ ] **Step 8: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/customers.ts \
        archibald-web-app/backend/src/db/repositories/customers-vat-bg.spec.ts
git commit -m "feat(customers): funzioni BG VAT — updateVatLastBgCheckAt, setVatInvalid, getCustomersNeedingVatValidation"
```

---

## Task 3: Frontend — Tipo Customer + Customer Completeness

**Files:**
- Modifica: `archibald-web-app/frontend/src/types/customer.ts`
- Modifica: `archibald-web-app/frontend/src/utils/customer-completeness.ts`
- Modifica: `archibald-web-app/frontend/src/utils/customer-completeness.spec.ts`

- [ ] **Step 1: Aggiunge campi a `Customer` interface**

In `frontend/src/types/customer.ts`, dopo `vatValidatedAt: string | null;` (riga ~37):

```typescript
vatInvalid: boolean;
vatLastBgCheckAt: string | null;
```

- [ ] **Step 2: Scrivi test fallenti per customer-completeness con vatInvalid**

Apri `frontend/src/utils/customer-completeness.spec.ts` e aggiungi:

```typescript
describe('vatInvalid flag', () => {
  it('restituisce campo "P.IVA non valida" se vatInvalid = true', () => {
    const result = checkCustomerCompleteness({
      name: 'Cliente Test',
      vatNumber: 'IT12345678901',
      vatValidatedAt: null,
      vatInvalid: true,
      pec: 'test@pec.it',
      sdi: null,
      street: 'Via Roma 1',
      postalCode: '00100',
      city: 'Roma',
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('P.IVA non valida');
  });

  it('non mostra "Valida ora" quando vatInvalid = true', () => {
    const result = checkCustomerCompleteness({
      name: 'Cliente Test',
      vatNumber: 'IT12345678901',
      vatValidatedAt: null,
      vatInvalid: true,
      pec: 'test@pec.it',
      sdi: null,
      street: 'Via Roma 1',
      postalCode: '00100',
      city: 'Roma',
    });
    expect(result.onlyVatMissing).toBe(false);
  });
});
```

- [ ] **Step 3: Esegui test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose customer-completeness
```

Expected: 2 nuovi test falliscono.

- [ ] **Step 4: Aggiorna `customer-completeness.ts` per gestire `vatInvalid`**

Apri `frontend/src/utils/customer-completeness.ts`. Trova il tipo input (probabilmente `CompletenessInput` o simile) e aggiungi `vatInvalid?: boolean`.

Trova il check che produce "P.IVA non validata" (dove controlla `vatNumber && !vatValidatedAt`) e aggiorna la logica:

```typescript
if (vatInvalid) {
  missing.push('P.IVA non valida');
  // non è un caso "onlyVatMissing" — richiede intervento umano
} else if (vatNumber && !vatValidatedAt) {
  missing.push('P.IVA non validata');
  onlyVatMissing = true; // solo questo campo blocca
}
```

- [ ] **Step 5: Esegui test per verificare che passino**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose customer-completeness
```

Expected: tutti PASS.

- [ ] **Step 6: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/types/customer.ts \
        archibald-web-app/frontend/src/utils/customer-completeness.ts \
        archibald-web-app/frontend/src/utils/customer-completeness.spec.ts
git commit -m "feat(frontend): vatInvalid nel tipo Customer e customer-completeness"
```

---

## Task 4: Frontend — Badge UI + WebSocket Events

**Files:**
- Modifica: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`
- Modifica: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

- [ ] **Step 1: Aggiorna PendingOrdersPage — badge "P.IVA non valida"**

In `PendingOrdersPage.tsx`, cerca il banner/badge "⚠ P.IVA non validata" (cerca `P.IVA non validata` o `onlyVatMissing`). Aggiungi il caso `vatInvalid` prima del check esistente:

```tsx
{richCustomer?.vatInvalid && (
  <span style={{
    background: '#FEE2E2',
    color: '#DC2626',
    border: '1px solid #FECACA',
    borderRadius: 6,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 600,
    marginRight: 6,
  }}>
    ✕ P.IVA non valida
  </span>
)}
{!richCustomer?.vatInvalid && richCustomer?.vatNumber && !richCustomer?.vatValidatedAt && (
  // ...qui il codice esistente con il bottone "Valida ora" già presente
)}
```

- [ ] **Step 2: Aggiungi listener WebSocket `VAT_BG_VALIDATED` in PendingOrdersPage**

Cerca il blocco dove sono gestiti gli eventi WebSocket (cerca `useEffect` con `wsMessages` o `lastMessage`). Aggiungi i due casi:

```typescript
if (msg.type === 'VAT_BG_VALIDATED') {
  const { erpId } = msg.payload as { erpId: string };
  // refetch del cliente per aggiornare vatValidatedAt
  void fetchRichCustomer(erpId);
}
if (msg.type === 'VAT_BG_INVALID') {
  const { erpId } = msg.payload as { erpId: string };
  // refetch del cliente per aggiornare vatInvalid
  void fetchRichCustomer(erpId);
}
```

Dove `fetchRichCustomer` è la funzione già esistente che fa `GET /api/customers/:erpId` e aggiorna lo stato locale. Se non esiste con quel nome, usa la funzione equivalente già presente nella pagina.

- [ ] **Step 3: Aggiorna OrderFormSimple — stesso pattern**

In `OrderFormSimple.tsx`, cerca il punto dove viene renderizzato il badge "P.IVA non validata" (riga ~3165). Applica lo stesso pattern di Task 4 Step 1: mostra badge rosso "✕ P.IVA non valida" se `vatInvalid`, nascondi "Valida ora".

Aggiungi listener WS `VAT_BG_VALIDATED` / `VAT_BG_INVALID` nello stesso useEffect dove vengono gestiti gli altri eventi WS della pagina (refetch del cliente selezionato).

- [ ] **Step 4: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx \
        archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(frontend): badge P.IVA non valida + WS events VAT_BG_VALIDATED/INVALID"
```

---

## Task 5: Bot — `openCustomerAndValidateVat`

**Files:**
- Modifica: `archibald-web-app/backend/src/bot/archibald-bot.ts`

- [ ] **Step 1: Individua i metodi necessari nel bot**

Prima di modificare, cerca nel file i metodi rilevanti:

```bash
grep -n "navigateToEditCustomerById\|cancelCustomer\|navigateToCust\|searchAndOpenCustomer" \
  archibald-web-app/backend/src/bot/archibald-bot.ts | head -20
```

Prendi nota del nome esatto del metodo che naviga al form di modifica cliente (`navigateToEditCustomerById` o equivalente) e di come navigare via dopo (es. `navigateToCustTableListView` o `page.goBack()`).

- [ ] **Step 2: Aggiungi il metodo `openCustomerAndValidateVat`**

Aggiungi il nuovo metodo nella classe `ArchibaldBot`, vicino agli altri metodi VAT (cerca `submitVatAndReadAutofill` per il punto di inserimento, riga ~15027):

```typescript
async openCustomerAndValidateVat(
  erpId: string,
  vatNumber: string,
): Promise<VatLookupResult | null> {
  try {
    // Apre la scheda cliente in modalità modifica
    await this.navigateToEditCustomerById(erpId);
    // Sottomette la P.IVA e legge il risultato dall'autofill ERP
    const result = await this.submitVatAndReadAutofill(vatNumber);
    return result;
  } finally {
    // Naviga via senza salvare — il check P.IVA è già registrato internamente dall'ERP
    try {
      await this.navigateToCustTableListView();  // usa il metodo corretto trovato al Step 1
    } catch {
      // ignora errori di navigazione post-validazione
    }
  }
}
```

> **Nota implementativa:** Se `navigateToCustTableListView` non esiste, usa il metodo equivalente trovato al Step 1 (es. `page.goBack()`, `navigateToCustomerList()`, o naviga all'URL del list view direttamente). L'obiettivo è uscire dal form senza salvare.

- [ ] **Step 3: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): openCustomerAndValidateVat — valida P.IVA in background"
```

---

## Task 6: Handler `bg-validate-vat`

**Files:**
- Crea: `archibald-web-app/backend/src/operations/handlers/bg-validate-vat.ts`
- Crea: `archibald-web-app/backend/src/operations/handlers/bg-validate-vat.spec.ts`

- [ ] **Step 1: Scrivi il test fallente**

```typescript
// bg-validate-vat.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { handleBgValidateVat } from './bg-validate-vat';
import type { DbPool } from '../../db/pool';

function makePool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as DbPool;
}
function makeBot(vatValidated: string | null) {
  return {
    openCustomerAndValidateVat: vi.fn().mockResolvedValue(
      vatValidated !== null ? { vatValidated, lastVatCheck: '', vatAddress: '', parsed: {}, pec: '', sdi: '' } : null,
    ),
    setProgressCallback: vi.fn(),
  };
}
const onProgress = vi.fn();

describe('handleBgValidateVat', () => {
  it('aggiorna vat_validated_at e chiama broadcast VAT_BG_VALIDATED quando ERP dice Sì', async () => {
    const pool = makePool();
    const bot = makeBot('Sì');
    const broadcast = vi.fn();
    const result = await handleBgValidateVat(pool, bot, { erpId: 'erp-1', vatNumber: 'IT123' }, 'user-1', onProgress, broadcast);
    expect(result.vatValidated).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SET vat_validated_at'), expect.any(Array));
    expect(broadcast).toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'VAT_BG_VALIDATED' }));
  });

  it('imposta vat_invalid e chiama broadcast VAT_BG_INVALID quando ERP risponde No', async () => {
    const pool = makePool();
    const bot = makeBot('No');
    const broadcast = vi.fn();
    await handleBgValidateVat(pool, bot, { erpId: 'erp-1', vatNumber: 'IT123' }, 'user-1', onProgress, broadcast);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SET vat_invalid = TRUE'), expect.any(Array));
    expect(broadcast).toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'VAT_BG_INVALID' }));
  });

  it('non imposta vat_invalid se bot restituisce null (timeout)', async () => {
    const pool = makePool();
    const bot = makeBot(null);
    const broadcast = vi.fn();
    await handleBgValidateVat(pool, bot, { erpId: 'erp-1', vatNumber: 'IT123' }, 'user-1', onProgress, broadcast);
    const invalidCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .find(([sql]: [string]) => sql.includes('vat_invalid = TRUE'));
    expect(invalidCall).toBeUndefined();
    expect(broadcast).not.toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'VAT_BG_INVALID' }));
  });
});
```

- [ ] **Step 2: Esegui test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose bg-validate-vat
```

Expected: 3 test falliscono con "Cannot find module".

- [ ] **Step 3: Implementa l'handler**

```typescript
// bg-validate-vat.ts
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { VatLookupResult } from '../../types';
import {
  updateVatValidatedAt,
  updateVatLastBgCheckAt,
  setVatInvalid,
} from '../../db/repositories/customers';
import { logger } from '../../logger';

type BgValidateVatData = {
  erpId: string;
  vatNumber: string;
};

type BroadcastFn = (userId: string, event: { type: string; payload: Record<string, unknown> }) => void;

type BgValidateVatBot = {
  openCustomerAndValidateVat: (erpId: string, vatNumber: string) => Promise<VatLookupResult | null>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleBgValidateVat(
  pool: DbPool,
  bot: BgValidateVatBot,
  data: BgValidateVatData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  broadcast?: BroadcastFn,
): Promise<{ vatValidated: boolean }> {
  onProgress(10, 'Apertura scheda cliente ERP');
  bot.setProgressCallback(async () => {});

  let result: VatLookupResult | null = null;
  try {
    result = await bot.openCustomerAndValidateVat(data.erpId, data.vatNumber);
  } catch (err) {
    logger.warn('bgValidateVat: errore bot', { error: String(err), erpId: data.erpId });
    await updateVatLastBgCheckAt(pool, userId, data.erpId);
    onProgress(100, 'Errore — riproverà al prossimo sweep');
    return { vatValidated: false };
  }

  onProgress(80, 'Lettura risultato P.IVA');
  await updateVatLastBgCheckAt(pool, userId, data.erpId);

  if (result?.vatValidated === 'Sì' || result?.vatValidated === 'Si') {
    await updateVatValidatedAt(pool, userId, data.erpId);
    broadcast?.(userId, { type: 'VAT_BG_VALIDATED', payload: { erpId: data.erpId } });
    logger.info('bgValidateVat: P.IVA validata', { erpId: data.erpId, userId });
    onProgress(100, 'P.IVA validata ✓');
    return { vatValidated: true };
  }

  if (result !== null) {
    await setVatInvalid(pool, userId, data.erpId);
    broadcast?.(userId, {
      type: 'VAT_BG_INVALID',
      payload: { erpId: data.erpId, vatNumber: data.vatNumber },
    });
    logger.warn('bgValidateVat: P.IVA non valida', { erpId: data.erpId, vatNumber: data.vatNumber });
  } else {
    logger.warn('bgValidateVat: bot timeout/null — skip vat_invalid', { erpId: data.erpId });
  }

  onProgress(100, 'Validazione completata');
  return { vatValidated: false };
}

function createBgValidateVatHandler(
  pool: DbPool,
  createBot: (userId: string) => BgValidateVatBot,
  broadcast?: BroadcastFn,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as BgValidateVatData;
    const result = await handleBgValidateVat(pool, bot, typedData, userId, onProgress, broadcast);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleBgValidateVat,
  createBgValidateVatHandler,
  type BgValidateVatData,
  type BgValidateVatBot,
  type BroadcastFn as VatBgBroadcastFn,
};
```

- [ ] **Step 4: Esegui test per verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose bg-validate-vat
```

Expected: 3 test PASS.

- [ ] **Step 5: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/bg-validate-vat.ts \
        archibald-web-app/backend/src/operations/handlers/bg-validate-vat.spec.ts
git commit -m "feat(operations): handler bg-validate-vat — Phase 2 validazione P.IVA in background"
```

---

## Task 7: Registra `bg-validate-vat` + Wire in `main.ts`

**Files:**
- Modifica: `archibald-web-app/backend/src/operations/queue-router.ts`
- Modifica: `archibald-web-app/frontend/src/api/operations.ts`
- Modifica: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiunge `bg-validate-vat` a `queue-router.ts`**

In `queue-router.ts`, trova `const CONDUCTOR_OPERATION_TYPES` (o il Set/array equivalente che include `'read-vat-status'`) e aggiungi:

```typescript
'bg-validate-vat',
```

- [ ] **Step 2: Aggiunge `bg-validate-vat` a `frontend/src/api/operations.ts`**

Trova il tipo `OperationType` (dove compare `| 'read-vat-status'`) e aggiungi:

```typescript
| 'bg-validate-vat'
```

Trova il Set `CONDUCTOR_OPERATIONS` (dove compare `'read-vat-status'`) e aggiungi:

```typescript
'bg-validate-vat',
```

- [ ] **Step 3: Aggiunge import e wire in `main.ts`**

In `main.ts`, aggiungi l'import vicino all'import di `createReadVatStatusHandler` (riga ~45):

```typescript
import { createBgValidateVatHandler } from './operations/handlers/bg-validate-vat';
```

Nel blocco `handlers:` del Conductor (vicino alla riga ~1335 dove c'è `'read-vat-status'`), aggiungi:

```typescript
'bg-validate-vat': makeConductorAdaptHandler(createBgValidateVatHandler(pool, (userId) => {
  const bot = createBotForUser(userId);
  let initialized = false;
  const ensureInit = async () => {
    if (!initialized) { await bot.initialize(); initialized = true; }
  };
  return {
    openCustomerAndValidateVat: async (erpId, vatNumber) => {
      await ensureInit();
      return bot.openCustomerAndValidateVat(erpId, vatNumber);
    },
    setProgressCallback: (cb) => bot.setProgressCallback(cb),
  };
}, (userId, event) => wsServer.broadcast(userId, { ...event, timestamp: new Date().toISOString() }))),
```

- [ ] **Step 4: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori.

- [ ] **Step 5: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/queue-router.ts \
        archibald-web-app/frontend/src/api/operations.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(operations): registra bg-validate-vat in Conductor + CONDUCTOR_OPERATIONS"
```

---

## Task 8: Estende `read-vat-status` per catena Phase 1→2

**Files:**
- Modifica: `archibald-web-app/backend/src/operations/handlers/read-vat-status.ts`
- Modifica: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiorna `ReadVatStatusData` e la firma di `handleReadVatStatus`**

In `read-vat-status.ts`:

```typescript
// Aggiorna il tipo data per portare vatNumber opzionale verso Phase 2
type ReadVatStatusData = {
  erpId: string;
  vatNumber?: string;  // presente quando trigger proviene da BG (necessario per Phase 2)
};

type EnqueueNextFn = (
  taskType: string,
  userId: string,
  payload: Record<string, unknown>,
  priority: number,
) => Promise<void>;
```

Aggiorna la firma di `handleReadVatStatus` per aggiungere `updateLastCheck` e `enqueueNext` opzionali:

```typescript
async function handleReadVatStatus(
  pool: DbPool,
  bot: ReadVatStatusBot,
  data: ReadVatStatusData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  enqueueNext?: EnqueueNextFn,
): Promise<{ vatValidated: string | null }> {
  onProgress(10, 'Lettura stato IVA da Archibald');
  bot.setProgressCallback(async () => {});

  let vatValidated: string | null = null;
  try {
    const result = await bot.readCustomerVatStatus(data.erpId);
    vatValidated = result?.vatValidated ?? null;

    if (vatValidated === 'Sì' || vatValidated === 'Si') {
      await updateVatValidatedAt(pool, userId, data.erpId);
      await updateVatLastBgCheckAt(pool, userId, data.erpId);
      logger.info('readVatStatus: IVA già validata in ERP — persistita', { erpId: data.erpId });
    } else if (data.vatNumber && enqueueNext) {
      // Phase 1 non ha trovato validazione → catena Phase 2
      await updateVatLastBgCheckAt(pool, userId, data.erpId);
      await enqueueNext('bg-validate-vat', userId, {
        erpId: data.erpId,
        vatNumber: data.vatNumber,
      }, 500);
      logger.info('readVatStatus: catena bg-validate-vat', { erpId: data.erpId });
    }
  } catch (err) {
    logger.warn('readVatStatus: lettura fallita', { error: String(err), erpId: data.erpId });
  }

  onProgress(100, 'Stato IVA aggiornato');
  return { vatValidated };
}
```

Aggiorna `createReadVatStatusHandler` per passare `enqueueNext`:

```typescript
function createReadVatStatusHandler(
  pool: DbPool,
  createBot: (userId: string) => ReadVatStatusBot,
  enqueueNext?: EnqueueNextFn,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as ReadVatStatusData;
    const result = await handleReadVatStatus(pool, bot, typedData, userId, onProgress, enqueueNext);
    return result as unknown as Record<string, unknown>;
  };
}
```

Aggiungi import `updateVatLastBgCheckAt` all'inizio del file.

- [ ] **Step 2: Aggiorna il wire di `read-vat-status` in `main.ts`**

Trova l'entry `'read-vat-status'` (riga ~1335) e aggiorna passando `enqueueNext`:

```typescript
'read-vat-status': makeConductorAdaptHandler(createReadVatStatusHandler(pool, (userId) => {
  const bot = createBotForUser(userId);
  let initialized = false;
  const ensureInit = async () => {
    if (!initialized) { await bot.initialize(); initialized = true; }
  };
  return {
    readCustomerVatStatus: async (erpId) => { await ensureInit(); return bot.readCustomerVatStatus(erpId); },
    setProgressCallback: (cb) => bot.setProgressCallback(cb),
  };
}, async (taskType, userId, payload, priority) => {
  await enqueueWithDedup(pool, {
    userId,
    taskType: taskType as TaskType,
    payload,
    priority,
    requiresBrowser: true,
  });
})),
```

Aggiungi import `enqueueWithDedup` e `TaskType` in main.ts se non già presenti:

```typescript
import { enqueueWithDedup } from './db/repositories/agent-queue';
import type { TaskType } from './conductor/types';
```

- [ ] **Step 3: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/read-vat-status.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(read-vat-status): chain Phase 2 bg-validate-vat + updateVatLastBgCheckAt"
```

---

## Task 9: Helper `enqueueVatBgValidationIfNeeded`

**Files:**
- Crea: `archibald-web-app/backend/src/operations/enqueue-vat-bg-validation.ts`
- Crea: `archibald-web-app/backend/src/operations/enqueue-vat-bg-validation.spec.ts`

- [ ] **Step 1: Scrivi test fallenti**

```typescript
// enqueue-vat-bg-validation.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { enqueueVatBgValidationIfNeeded } from './enqueue-vat-bg-validation';
import type { DbPool } from '../db/pool';

function makePool(customer: Record<string, unknown> | null) {
  return {
    query: vi.fn().mockResolvedValue({
      rows: customer ? [customer] : [],
    }),
  } as unknown as DbPool;
}

describe('enqueueVatBgValidationIfNeeded', () => {
  it('enqueue read-vat-status se cliente ha vat_number non validato', async () => {
    const pool = makePool({
      vat_number: 'IT12345678901',
      vat_validated_at: null,
      vat_invalid: false,
      vat_last_bg_check_at: null,
    });
    const enqueue = vi.fn().mockResolvedValue(null);
    const result = await enqueueVatBgValidationIfNeeded(pool, 'user-1', 'erp-42', enqueue, 25);
    expect(result).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(pool, expect.objectContaining({
      taskType: 'read-vat-status',
      userId: 'user-1',
      payload: expect.objectContaining({ erpId: 'erp-42', vatNumber: 'IT12345678901' }),
      priority: 25,
    }));
  });

  it('non enqueue se vat_validated_at è già valorizzato', async () => {
    const pool = makePool({
      vat_number: 'IT12345678901',
      vat_validated_at: '2026-01-01',
      vat_invalid: false,
      vat_last_bg_check_at: null,
    });
    const enqueue = vi.fn();
    const result = await enqueueVatBgValidationIfNeeded(pool, 'user-1', 'erp-42', enqueue, 25);
    expect(result).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('non enqueue se vat_invalid = true', async () => {
    const pool = makePool({
      vat_number: 'IT12345678901',
      vat_validated_at: null,
      vat_invalid: true,
      vat_last_bg_check_at: null,
    });
    const enqueue = vi.fn();
    const result = await enqueueVatBgValidationIfNeeded(pool, 'user-1', 'erp-42', enqueue, 25);
    expect(result).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('non enqueue se controllato meno di 30 min fa', async () => {
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const pool = makePool({
      vat_number: 'IT12345678901',
      vat_validated_at: null,
      vat_invalid: false,
      vat_last_bg_check_at: recent,
    });
    const enqueue = vi.fn();
    const result = await enqueueVatBgValidationIfNeeded(pool, 'user-1', 'erp-42', enqueue, 25);
    expect(result).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Esegui test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose enqueue-vat-bg-validation
```

Expected: 4 test falliscono.

- [ ] **Step 3: Implementa l'helper**

```typescript
// enqueue-vat-bg-validation.ts
import type { DbPool } from '../db/pool';
import type { EnqueueWithDedupParams } from '../db/repositories/agent-queue';
import type { TaskType } from '../conductor/types';

type EnqueueFn = (pool: DbPool, params: EnqueueWithDedupParams) => Promise<bigint | null>;

const THROTTLE_MS = 30 * 60 * 1000; // 30 minuti

async function enqueueVatBgValidationIfNeeded(
  pool: DbPool,
  userId: string,
  erpId: string,
  enqueue: EnqueueFn,
  priority: number = 25,
): Promise<boolean> {
  const { rows } = await pool.query<{
    vat_number: string | null;
    vat_validated_at: string | null;
    vat_invalid: boolean;
    vat_last_bg_check_at: string | null;
  }>(
    `SELECT vat_number, vat_validated_at, vat_invalid, vat_last_bg_check_at
     FROM agents.customers
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );

  const customer = rows[0];
  if (!customer) return false;
  if (!customer.vat_number) return false;
  if (customer.vat_validated_at) return false;
  if (customer.vat_invalid) return false;

  if (customer.vat_last_bg_check_at) {
    const checkedAt = new Date(customer.vat_last_bg_check_at).getTime();
    if (Date.now() - checkedAt < THROTTLE_MS) return false;
  }

  await enqueue(pool, {
    userId,
    taskType: 'read-vat-status' as TaskType,
    payload: { erpId, vatNumber: customer.vat_number },
    priority,
    requiresBrowser: true,
  });

  return true;
}

export { enqueueVatBgValidationIfNeeded };
```

- [ ] **Step 4: Esegui test per verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose enqueue-vat-bg-validation
```

Expected: 4 test PASS.

- [ ] **Step 5: Build**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/enqueue-vat-bg-validation.ts \
        archibald-web-app/backend/src/operations/enqueue-vat-bg-validation.spec.ts
git commit -m "feat(operations): helper enqueueVatBgValidationIfNeeded con throttle 30 min"
```

---

## Task 10: Trigger A — Creazione Ordine in Attesa

**Files:**
- Modifica: `archibald-web-app/backend/src/routes/pending-orders.ts`
- Modifica: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiunge dep `enqueueVatBgValidation` a `PendingOrdersRouterDeps`**

In `pending-orders.ts`, aggiungi al tipo `PendingOrdersRouterDeps`:

```typescript
enqueueVatBgValidation?: (userId: string, erpId: string) => Promise<boolean>;
```

Aggiungi alla destrutturazione nella factory:

```typescript
const { getPendingOrders, upsertPendingOrder, deletePendingOrder,
        lockPendingOrder, cancelPendingOrderTask, broadcast, audit,
        enqueueVatBgValidation } = deps;
```

- [ ] **Step 2: Inietta il trigger nel loop di creazione**

Sostituisci il loop `for (const result of results)` con una versione che traccia l'ordine corrispondente:

```typescript
for (let i = 0; i < results.length; i++) {
  const result = results[i];
  const order = parsed.data.orders[i];
  const eventType = result.action === 'created' ? 'PENDING_CREATED' : 'PENDING_UPDATED';
  broadcast(userId, {
    type: eventType,
    payload: { orderId: result.id },
    timestamp: new Date().toISOString(),
  });
  if (result.action === 'created') {
    void audit({
      actorId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'order.created',
      targetType: 'order',
      targetId: result.id,
      ipAddress: req.ip,
    });
    if (enqueueVatBgValidation && order.customerId) {
      void enqueueVatBgValidation(userId, order.customerId).catch(err =>
        logger.warn('[PendingOrders] enqueueVatBgValidation failed', { error: String(err) }),
      );
    }
  }
}
```

- [ ] **Step 3: Wire dep in `main.ts`**

Cerca dove viene chiamato `createPendingOrdersRouter(...)` in `main.ts` e aggiungi la dep:

```typescript
enqueueVatBgValidation: async (userId, erpId) => {
  const { enqueueVatBgValidationIfNeeded } = await import('./operations/enqueue-vat-bg-validation');
  const { enqueueWithDedup } = await import('./db/repositories/agent-queue');
  return enqueueVatBgValidationIfNeeded(pool, userId, erpId, enqueueWithDedup, 25);
},
```

> **Nota:** Se preferisci evitare l'import dinamico, aggiungi gli import statici in cima al file.

- [ ] **Step 4: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/pending-orders.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(pending-orders): Trigger A — enqueue VAT validation BG alla creazione ordine"
```

---

## Task 11: Trigger B — Sweep AdaptiveScheduler

**Files:**
- Modifica: `archibald-web-app/backend/src/sync/adaptive-scheduler.ts`

- [ ] **Step 1: Aggiunge `getCustomersNeedingVatValidation` alle deps**

In `adaptive-scheduler.ts`, aggiungi al tipo `AdaptiveSchedulerDeps`:

```typescript
getCustomersNeedingVatValidation?: (pool: DbPool, userId: string) => Promise<Array<{ erpId: string; vatNumber: string }>>;
```

- [ ] **Step 2: Aggiungi il sweep VAT in `schedulerTick`**

Alla fine della funzione `schedulerTick`, prima del `return`, aggiungi:

```typescript
// Sweep VAT BG — per ogni agente attivo/idle, enqueue read-vat-status per clienti non validati
if (deps.getCustomersNeedingVatValidation) {
  for (const { userId } of allAgents) {
    try {
      const candidates = await deps.getCustomersNeedingVatValidation(pool, userId);
      for (const { erpId, vatNumber } of candidates) {
        await enqueueWithDedup(pool, {
          userId,
          taskType: 'read-vat-status' as TaskType,
          payload: { erpId, vatNumber },
          priority: 500,
          requiresBrowser: true,
        });
      }
      if (candidates.length > 0) {
        logger.info('[AdaptiveScheduler] VAT sweep', { userId, count: candidates.length });
      }
    } catch (err) {
      logger.warn('[AdaptiveScheduler] VAT sweep error', { userId, error: String(err) });
    }
  }
}
```

Aggiungi gli import necessari in `adaptive-scheduler.ts`:

```typescript
import { enqueueWithDedup } from '../db/repositories/agent-queue';
import type { TaskType } from '../conductor/types';
```

- [ ] **Step 3: Wire dep in `main.ts`**

Cerca `createAdaptiveScheduler({` (riga ~1575) e aggiungi:

```typescript
getCustomersNeedingVatValidation: getCustomersNeedingVatValidation,
```

Aggiungi import in main.ts:

```typescript
import { getCustomersNeedingVatValidation } from './db/repositories/customers';
```

- [ ] **Step 4: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/adaptive-scheduler.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(scheduler): Trigger B — sweep VAT BG in AdaptiveScheduler"
```

---

## Task 12: Trigger C — Post sync-customers

**Files:**
- Modifica: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiungi enqueue post-sync-customers**

In `main.ts`, individua il blocco che chiama `handleSyncCustomersViaHtml` (riga ~868). Dopo `const result = await handleSyncCustomersViaHtml(...)` (prima del `return result` o del log successivo), aggiungi:

```typescript
// Trigger C: dopo ogni sync clienti, enqueue VAT validation per clienti non validati
try {
  const vatCandidates = await getCustomersNeedingVatValidation(pool, userId);
  for (const { erpId, vatNumber } of vatCandidates) {
    await enqueueWithDedup(pool, {
      userId,
      taskType: 'read-vat-status' as TaskType,
      payload: { erpId, vatNumber },
      priority: 500,
      requiresBrowser: true,
    });
  }
  if (vatCandidates.length > 0) {
    logger.info('[SyncCustomers] Enqueued VAT BG for unvalidated customers', {
      userId,
      count: vatCandidates.length,
    });
  }
} catch (err) {
  logger.warn('[SyncCustomers] Trigger C VAT enqueue failed', { error: String(err) });
}
```

`getCustomersNeedingVatValidation` è già importato dal Task 11.

- [ ] **Step 2: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/main.ts
git commit -m "feat(sync-customers): Trigger C — enqueue VAT BG dopo sync clienti"
```

---

## Task 13: Integrazione finale — Test + Build completo

- [ ] **Step 1: Test backend completi**

```bash
npm test --prefix archibald-web-app/backend
```

Expected: tutti i test passano (inclusi i 3224 esistenti + nuovi).

- [ ] **Step 2: Test frontend completi**

```bash
npm test --prefix archibald-web-app/frontend
```

Expected: tutti i test passano.

- [ ] **Step 3: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori TypeScript.

- [ ] **Step 4: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori TypeScript.

- [ ] **Step 5: Commit finale (se ci sono file non ancora committati)**

```bash
git status
# commit eventuali file residui
git commit -m "feat(vat-bg): integrazione finale — build e test passanti"
```

---

## Self-Review

**Spec coverage:**

| Requisito spec | Task |
|---|---|
| Migration `vat_last_bg_check_at`, `vat_invalid` | Task 1 |
| `updateVatLastBgCheckAt`, `setVatInvalid`, `getCustomersNeedingVatValidation` | Task 2 |
| Frontend tipo Customer + completeness vatInvalid | Task 3 |
| Badge rosso "P.IVA non valida" + WS events | Task 4 |
| Bot `openCustomerAndValidateVat` | Task 5 |
| Handler `bg-validate-vat` + CONDUCTOR_OPERATIONS | Task 6 + 7 |
| Phase 1→2 chain in `read-vat-status` | Task 8 |
| Helper `enqueueVatBgValidationIfNeeded` | Task 9 |
| Trigger A (creazione ordine) | Task 10 |
| Trigger B (AdaptiveScheduler sweep) | Task 11 |
| Trigger C (post-sync-customers) | Task 12 |
| Reset `vat_invalid` quando utente corregge P.IVA | **GAP** — da aggiungere in `update-customer` handler: se `vat_number` cambia, `SET vat_invalid = FALSE, vat_validated_at = NULL` |

**Gap identificato:** Il reset di `vat_invalid` quando l'utente modifica il numero P.IVA nel profilo cliente non è coperto dal piano. Va aggiunto nell'handler `update-customer` come passo aggiuntivo nel Task 7 (o in un Task separato se il team preferisce):

Nel handler `update-customer`, dopo aver aggiornato il campo `vat_number`, se il valore è cambiato:
```sql
UPDATE agents.customers
SET vat_invalid = FALSE, vat_validated_at = NULL, vat_last_bg_check_at = NULL
WHERE erp_id = $1 AND user_id = $2
```

# Edit Order v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere alla modalità di modifica ordine il checkbox "spese di trasporto", la verifica post-modifica sincrona con banner discrepanze, il refresh immediato dei totali nella scheda PWA, e correggere il bug di propagazione sconto.

**Architecture:** Il backend riceve `noShipping` nel payload di modifica, costruisce il testo formattato completo (`buildOrderNotesText`) da una utility condivisa, lo salva in `order_records.notes` e lo invia al bot ERP. Il frontend legge `order.notes` e lo parsa per rilevare lo stato del checkbox. Dopo ogni modifica, il backend esegue inline sync + verifica articoli e aggiorna immediatamente i totali in `order_records`.

**Tech Stack:** TypeScript strict, React 19 hooks, PostgreSQL (`pg` pool), Vitest, BullMQ, Puppeteer (bot ERP). Tutti i test con `vitest`. Backend: `npm run build --prefix archibald-web-app/backend`. Frontend: `npm run type-check --prefix archibald-web-app/frontend`.

---

## File Structure

| File | Tipo | Responsabilità |
|------|------|----------------|
| `backend/src/utils/order-notes.ts` | Nuovo | Utility condivisa: `buildOrderNotesText` estratta da `archibald-bot.ts` |
| `backend/src/utils/order-notes.spec.ts` | Nuovo | Unit test per `buildOrderNotesText` |
| `frontend/src/utils/parse-order-notes.ts` | Nuovo | Utility parsing: `parseOrderNotesForEdit` |
| `frontend/src/utils/parse-order-notes.spec.ts` | Nuovo | Unit test per il parsing |
| `backend/src/bot/archibald-bot.ts` | Modifica | Import da `order-notes.ts`; 4° param `noShipping`; fix discount |
| `backend/src/operations/handlers/edit-order.ts` | Modifica | `noShipping` in `EditOrderData`/`EditOrderBot`; totali refresh; inline sync |
| `backend/src/operations/handlers/edit-order.spec.ts` | Modifica | Test per noShipping, totali refresh, verifica |
| `backend/src/operations/handlers/submit-order.ts` | Modifica | Salva testo formattato in `notes` (import da `order-notes.ts`) |
| `backend/src/main.ts` | Modifica | Wrapper noShipping; `inlineSyncDeps` a `createEditOrderHandler` |
| `frontend/src/components/OrderCardNew.tsx` | Modifica | Prop `initialNoShipping`; state; UI checkbox; banner verifica; call site |

---

## Task 1: Estrai `buildOrderNotesText` in utility condivisa

**Files:**
- Create: `archibald-web-app/backend/src/utils/order-notes.ts`
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts:52-57`

- [ ] **Step 1: Scrivi i test che falliscono per `buildOrderNotesText`**

```ts
// archibald-web-app/backend/src/utils/order-notes.spec.ts
import { describe, expect, test } from 'vitest';
import { buildOrderNotesText } from './order-notes';

const MARKER = 'NO SPESE DI SPEDIZIONE';

describe('buildOrderNotesText', () => {
  test('noShipping=true + notes → marker then notes', () => {
    expect(buildOrderNotesText(true, 'consegna urgente')).toBe(`${MARKER}\nconsegna urgente`);
  });

  test('noShipping=true + no notes → marker only', () => {
    expect(buildOrderNotesText(true, undefined)).toBe(MARKER);
  });

  test('noShipping=false + notes → notes only', () => {
    expect(buildOrderNotesText(false, 'solo note')).toBe('solo note');
  });

  test('noShipping=undefined + notes → notes only', () => {
    expect(buildOrderNotesText(undefined, 'testo')).toBe('testo');
  });

  test('noShipping=false + empty notes → empty string', () => {
    expect(buildOrderNotesText(false, '')).toBe('');
  });

  test('noShipping=undefined + undefined notes → empty string', () => {
    expect(buildOrderNotesText(undefined, undefined)).toBe('');
  });
});
```

Esegui per verificare che falliscano (file non esiste ancora):
```bash
npm test --prefix archibald-web-app/backend -- order-notes --reporter=verbose 2>&1 | tail -10
```

- [ ] **Step 2: Crea `order-notes.ts` con la funzione**

```ts
// archibald-web-app/backend/src/utils/order-notes.ts
export const NO_SHIPPING_MARKER = 'NO SPESE DI SPEDIZIONE';

export function buildOrderNotesText(noShipping?: boolean, notes?: string): string {
  const parts: string[] = [];
  if (noShipping) parts.push(NO_SHIPPING_MARKER);
  if (notes?.trim()) parts.push(notes.trim());
  return parts.join('\n');
}
```

Verifica che i test passino:
```bash
npm test --prefix archibald-web-app/backend -- order-notes --reporter=verbose 2>&1 | tail -10
```

- [ ] **Step 3: In `archibald-bot.ts`, sostituisci la definizione locale con l'import**

Trova la riga 52 dove `buildOrderNotesText` è definita (blocco `export function buildOrderNotesText...`). Rimuovi quelle 5 righe e aggiungi in cima al file, tra gli altri import:

```ts
import { buildOrderNotesText } from '../utils/order-notes';
```

- [ ] **Step 4: Verifica che il build backend non abbia errori**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: nessun errore TypeScript.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/utils/order-notes.ts \
        archibald-web-app/backend/src/utils/order-notes.spec.ts \
        archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "refactor(backend): extract buildOrderNotesText to shared order-notes utility with tests"
```

---

## Task 2: Backend — `noShipping` in `EditOrderData`, `EditOrderBot`, `handleEditOrder`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/edit-order.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/edit-order.spec.ts`

- [ ] **Step 1: Verifica il setup del test esistente**

Prima di scrivere i nuovi test, apri `edit-order.spec.ts` e verifica che il `beforeEach`/`beforeAll` esistente inserisca una riga reale in `agents.order_records` con `testOrderId` e `testUserId`. I test di integrazione per `notes` usano `pool.query('SELECT notes ... WHERE id = $1 AND user_id = $2')` e richiedono che la riga esista nel DB. Se il setup non inserisce la riga, i test crasheranno invece di fallire in modo pulito — aggiusta il setup prima di continuare.

- [ ] **Step 2: Scrivi i test che falliscono**

Nel file `edit-order.spec.ts`, aggiungi questi test alla suite esistente (dopo i test già presenti):

```ts
// Nella describe suite principale — aggiungi prima di ogni altro test noShipping

describe('noShipping propagation', () => {
  test('passes noShipping=true to bot as 4th argument', async () => {
    const botCalls: Array<{ id: string; mods: unknown; notes: unknown; noShipping: unknown }> = [];
    const mockBot = {
      editOrderInArchibald: async (id: string, mods: unknown, notes: unknown, noShipping: unknown) => {
        botCalls.push({ id, mods, notes, noShipping });
        return { success: true, message: 'ok' };
      },
      setProgressCallback: () => {},
    };
    await handleEditOrder(pool, mockBot as never, {
      orderId: testOrderId,
      modifications: [],
      notes: 'consegna',
      noShipping: true,
    }, testUserId, () => {});
    expect(botCalls[0].noShipping).toEqual(true);
  });

  test('noShipping=undefined when not provided', async () => {
    const botCalls: Array<{ noShipping: unknown }> = [];
    const mockBot = {
      editOrderInArchibald: async (_id: string, _mods: unknown, _notes: unknown, noShipping: unknown) => {
        botCalls.push({ noShipping });
        return { success: true, message: 'ok' };
      },
      setProgressCallback: () => {},
    };
    await handleEditOrder(pool, mockBot as never, {
      orderId: testOrderId,
      modifications: [],
    }, testUserId, () => {});
    expect(botCalls[0].noShipping).toBeUndefined();
  });

  test('stores buildOrderNotesText result in order_records.notes when noShipping=true', async () => {
    const mockBot = {
      editOrderInArchibald: async () => ({ success: true, message: 'ok' }),
      setProgressCallback: () => {},
    };
    await handleEditOrder(pool, mockBot as never, {
      orderId: testOrderId,
      modifications: [],
      notes: 'consegna',
      noShipping: true,
    }, testUserId, () => {});
    const row = await pool.query(
      'SELECT notes FROM agents.order_records WHERE id = $1 AND user_id = $2',
      [testOrderId, testUserId],
    );
    expect(row.rows[0].notes).toEqual('NO SPESE DI SPEDIZIONE\nconsegna');
  });

  test('stores plain notes in order_records.notes when noShipping not set', async () => {
    const mockBot = {
      editOrderInArchibald: async () => ({ success: true, message: 'ok' }),
      setProgressCallback: () => {},
    };
    await handleEditOrder(pool, mockBot as never, {
      orderId: testOrderId,
      modifications: [],
      notes: 'solo testo',
    }, testUserId, () => {});
    const row = await pool.query(
      'SELECT notes FROM agents.order_records WHERE id = $1 AND user_id = $2',
      [testOrderId, testUserId],
    );
    expect(row.rows[0].notes).toEqual('solo testo');
  });
});
```

- [ ] **Step 3: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose 2>&1 | grep -A5 'noShipping propagation'
```
Expected: 4 test failing.

- [ ] **Step 4: Aggiungi import in `edit-order.ts`**

All'inizio del file `edit-order.ts` aggiungi:

```ts
import { buildOrderNotesText } from '../../utils/order-notes';
```

- [ ] **Step 5: Aggiorna `EditOrderData`**

Cambia il tipo (riga ~19):

```ts
type EditOrderData = {
  orderId: string;
  modifications: Array<Record<string, unknown>>;
  updatedItems?: EditOrderArticle[];
  notes?: string;
  noShipping?: boolean;
};
```

- [ ] **Step 6: Aggiorna `EditOrderBot` (4° parametro)**

Cambia il tipo (riga ~24):

```ts
type EditOrderBot = {
  editOrderInArchibald: (
    orderId: string,
    modifications: Array<Record<string, unknown>>,
    notes?: string,
    noShipping?: boolean,
  ) => Promise<{ success: boolean; message: string }>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};
```

- [ ] **Step 7: Aggiorna `handleEditOrder` — chiamata bot**

Riga ~73, cambia la chiamata al bot da:
```ts
const result = await bot.editOrderInArchibald(data.orderId, data.modifications, data.notes);
```
a:
```ts
const result = await bot.editOrderInArchibald(data.orderId, data.modifications, data.notes, data.noShipping);
```

- [ ] **Step 8: Aggiorna `handleEditOrder` — salvataggio notes in DB**

Riga ~136, trova il blocco:
```ts
if (data.notes !== undefined) {
  await pool.query(
    'UPDATE agents.order_records SET notes = $1 WHERE id = $2 AND user_id = $3',
    [data.notes, data.orderId, userId],
  );
}
```

Sostituiscilo con:
```ts
if (data.notes !== undefined || data.noShipping !== undefined) {
  const notesText = buildOrderNotesText(data.noShipping, data.notes) || null;
  await pool.query(
    'UPDATE agents.order_records SET notes = $1 WHERE id = $2 AND user_id = $3',
    [notesText, data.orderId, userId],
  );
}
```

- [ ] **Step 9: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose 2>&1 | grep -E '(PASS|FAIL|noShipping)'
```
Expected: 4 nuovi test passano, nessun test rotto.

- [ ] **Step 10: Build check**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: nessun errore.

- [ ] **Step 11: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/edit-order.ts \
        archibald-web-app/backend/src/operations/handlers/edit-order.spec.ts
git commit -m "feat(edit-order): add noShipping field to EditOrderData and propagate to bot"
```

---

## Task 3: Backend — `archibald-bot.ts` 4° parametro noShipping

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`

- [ ] **Step 1: Aggiorna firma `editOrderInArchibald`**

Riga ~7270, trova la firma:
```ts
async editOrderInArchibald(
  archibaldOrderId: string,
  modifications: Array<...>,
  notes?: string,
): Promise<{ success: boolean; message: string }>
```

Aggiungi il 4° parametro subito dopo `notes`:
```ts
  notes?: string,
  noShipping?: boolean,
```

- [ ] **Step 2: Aggiorna il blocco `if (notes !== undefined)` dentro il corpo del metodo**

Riga ~8075, trova:
```ts
if (notes !== undefined) {
  const notesText = buildOrderNotesText(undefined, notes);
  await this.fillOrderNotes(notesText);
}
```

Sostituiscilo con:
```ts
if (notes !== undefined || noShipping !== undefined) {
  const notesText = buildOrderNotesText(noShipping, notes);
  await this.fillOrderNotes(notesText);
}
```

- [ ] **Step 3: Build check**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): add noShipping param to editOrderInArchibald"
```

---

## Task 4: Backend — `main.ts` wrapper noShipping + `inlineSyncDeps` a edit handler

**Files:**
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Aggiorna il wrapper bot per passare `noShipping`**

Riga ~524, trova:
```ts
editOrderInArchibald: async (id, data, notes) => { await ensureInit(); return bot!.editOrderInArchibald(id, data as never, notes); },
```

Sostituiscilo con:
```ts
editOrderInArchibald: async (id, data, notes, noShipping) => { await ensureInit(); return bot!.editOrderInArchibald(id, data as never, notes, noShipping); },
```

**Nota**: la chiamata a `createEditOrderHandler` in `main.ts` NON viene modificata in questo task. Il wiring di `inlineSyncDeps` è completato integralmente nel Task 10 Step 5, che include il commit di `main.ts`. Non committare `main.ts` in questo task.

- [ ] **Step 2: Build check**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/main.ts
git commit -m "feat(backend): forward noShipping through edit-order bot wrapper in main.ts"
```

---

## Task 5: Backend — `submit-order.ts` salva testo formattato completo

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

In `submit-order.spec.ts`, trova la suite principale e aggiungi:

```ts
describe('notes storage with noShipping', () => {
  test('stores full formatted notes when noShipping=true', async () => {
    // Submit un ordine con noShipping=true e note
    // poi leggi la riga order_records e verifica notes
    const result = await handleSubmitOrder(pool, mockBot as never, {
      // usa i campi minimi necessari per il tuo testOrderPayload
      ...testOrderPayload,
      notes: 'consegna',
      noShipping: true,
    }, testUserId, () => {});
    const row = await pool.query(
      'SELECT notes FROM agents.order_records WHERE archibald_order_id = $1 AND user_id = $2',
      [result.archibaldOrderId, testUserId],
    );
    expect(row.rows[0].notes).toBe('NO SPESE DI SPEDIZIONE\nconsegna');
  });

  test('stores only notes when noShipping not set', async () => {
    const result = await handleSubmitOrder(pool, mockBot as never, {
      ...testOrderPayload,
      notes: 'solo testo',
    }, testUserId, () => {});
    const row = await pool.query(
      'SELECT notes FROM agents.order_records WHERE archibald_order_id = $1 AND user_id = $2',
      [result.archibaldOrderId, testUserId],
    );
    expect(row.rows[0].notes).toBe('solo testo');
  });
});
```

**Nota**: adatta `testOrderPayload`, `mockBot`, `handleSubmitOrder` al pattern già usato nella suite esistente di `submit-order.spec.ts`. L'obiettivo è verificare che il campo `notes` in `order_records` contenga il testo formattato.

Verifica che falliscano:
```bash
npm test --prefix archibald-web-app/backend -- submit-order --reporter=verbose 2>&1 | grep -A3 'notes storage'
```

- [ ] **Step 2: Aggiungi import**

In cima al file `submit-order.ts`, tra gli import esistenti, aggiungi:
```ts
import { buildOrderNotesText } from '../../utils/order-notes';
```

- [ ] **Step 3: Aggiorna il campo `notes` nell'INSERT di `order_records`**

Riga ~318, trova l'array di valori dell'INSERT. L'ultimo elemento è `data.notes ?? null`. Sostituiscilo con:
```ts
buildOrderNotesText(data.noShipping, data.notes) || null,
```

- [ ] **Step 4: Build check e test**

```bash
npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```
Expected: build pulito, tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts \
        archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts
git commit -m "fix(submit-order): store full formatted notes text including noShipping marker"
```

---

## Task 6: Frontend — utility `parseOrderNotesForEdit` con TDD

**Files:**
- Create: `archibald-web-app/frontend/src/utils/parse-order-notes.ts`
- Create: `archibald-web-app/frontend/src/utils/parse-order-notes.spec.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
// archibald-web-app/frontend/src/utils/parse-order-notes.spec.ts
import { describe, expect, test } from 'vitest';
import { parseOrderNotesForEdit } from './parse-order-notes';

const MARKER = 'NO SPESE DI SPEDIZIONE';

describe('parseOrderNotesForEdit', () => {
  test('detects marker on first line and extracts clean notes', () => {
    expect(parseOrderNotesForEdit(`${MARKER}\nconsegna urgente`)).toEqual({
      noShipping: true,
      notes: 'consegna urgente',
    });
  });

  test('detects marker alone (no notes)', () => {
    expect(parseOrderNotesForEdit(MARKER)).toEqual({
      noShipping: true,
      notes: '',
    });
  });

  test('no marker → noShipping false, notes preserved', () => {
    expect(parseOrderNotesForEdit('consegna urgente')).toEqual({
      noShipping: false,
      notes: 'consegna urgente',
    });
  });

  test('null input → empty result', () => {
    expect(parseOrderNotesForEdit(null)).toEqual({ noShipping: false, notes: '' });
  });

  test('undefined input → empty result', () => {
    expect(parseOrderNotesForEdit(undefined)).toEqual({ noShipping: false, notes: '' });
  });

  test('empty string → empty result', () => {
    expect(parseOrderNotesForEdit('')).toEqual({ noShipping: false, notes: '' });
  });

  test('marker in second line is NOT treated as flag', () => {
    expect(parseOrderNotesForEdit(`prima riga\n${MARKER}`)).toEqual({
      noShipping: false,
      notes: `prima riga\n${MARKER}`,
    });
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- parse-order-notes --reporter=verbose 2>&1 | tail -20
```
Expected: 7 failing (file non esiste ancora).

- [ ] **Step 3: Implementa `parse-order-notes.ts`**

```ts
// archibald-web-app/frontend/src/utils/parse-order-notes.ts
export const NO_SHIPPING_MARKER = 'NO SPESE DI SPEDIZIONE';

export function parseOrderNotesForEdit(fullText?: string | null): { noShipping: boolean; notes: string } {
  const text = fullText ?? '';
  if (!text.startsWith(NO_SHIPPING_MARKER)) {
    return { noShipping: false, notes: text };
  }
  const afterMarker = text.slice(NO_SHIPPING_MARKER.length);
  const notes = afterMarker.startsWith('\n') ? afterMarker.slice(1).trim() : afterMarker.trim();
  return { noShipping: true, notes };
}
```

- [ ] **Step 4: Verifica che i test passino**

```bash
npm test --prefix archibald-web-app/frontend -- parse-order-notes --reporter=verbose 2>&1 | tail -20
```
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/utils/parse-order-notes.ts \
        archibald-web-app/frontend/src/utils/parse-order-notes.spec.ts
git commit -m "feat(frontend): add parseOrderNotesForEdit utility with tests"
```

---

## Task 7: Frontend — `initialNoShipping` prop + `editNoShipping` state + `editTotals`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`

Questo task è il più lungo. Opera tutto dentro `OrderCardNew.tsx`.

- [ ] **Step 1: Aggiungi import**

In cima al file, cerca gli import da `../utils/`. Aggiungi:
```ts
import { parseOrderNotesForEdit } from '../utils/parse-order-notes';
```

- [ ] **Step 2: Aggiungi `initialNoShipping` ai props di `TabArticoli`**

Nella definizione del props type di `TabArticoli` (righe ~660-680), dove già ci sono `initialNotes` e `initialDiscountPercent`, aggiungi:
```ts
  initialNoShipping?: boolean;
```

- [ ] **Step 3: Aggiungi `editNoShipping` state nella funzione `TabArticoli`**

Vicino agli altri state di edit mode (cerca `const [editNotes, setEditNotes]`), aggiungi:
```ts
const [editNoShipping, setEditNoShipping] = useState(false);
```

- [ ] **Step 4: Seed `editNoShipping` nel `useEffect` esistente su `editing`**

Trova il `useEffect` che già fa `setEditNotes(initialNotes ?? '')` e `setGlobalEditDiscount(...)`. Aggiungi dentro:
```ts
setEditNoShipping(initialNoShipping ?? false);
```

- [ ] **Step 5: Aggiungi auto-reset `editNoShipping` quando subtotale supera soglia**

Cerca `SHIPPING_THRESHOLD` nell'import (già importato da `order-calculations.ts`). Aggiungi un nuovo `useEffect` dopo quello appena modificato:
```ts
useEffect(() => {
  if (editNoShipping && editTotals.itemsSubtotal >= SHIPPING_THRESHOLD) {
    setEditNoShipping(false);
  }
}, [editNoShipping, editTotals.itemsSubtotal]);
```

**Nota**: `editTotals.itemsSubtotal` deve essere la somma dei `lineAmount` degli articoli, **senza** includere le spese di spedizione. Questo è importante perché `editNoShipping` modifica le spese ma non il subtotale articoli — la dipendenza non è circolare. Assicurati che il `useMemo` calcoli `itemsSubtotal` come `editItems.reduce((s, i) => s + i.lineAmount, 0)` separato dal costo spedizione.

- [ ] **Step 6: Aggiorna `editTotals` useMemo per usare `editNoShipping`**

Trova il `useMemo` che calcola `editTotals` (cerca `itemsSubtotal`, `shippingCost`). Modifica il calcolo shipping per rispettare `editNoShipping`:

Cambia la riga che fa `const shipping = calculateShippingCosts(itemsSubtotal)` in:
```ts
const shipping = editNoShipping ? { cost: 0, taxAmount: 0 } : calculateShippingCosts(itemsSubtotal);
```

Aggiungi `editNoShipping` alle dipendenze del `useMemo`:
```ts
}, [editItems, editNoShipping]);
```

- [ ] **Step 7: Aggiungi `noShipping` al payload in `handleConfirmEdit` (o `handleSaveClick`)**

Cerca `enqueueOperation('edit-order'` nell'handler di salvataggio. Aggiungi `noShipping` al payload:
```ts
noShipping: editNoShipping || undefined,
```

- [ ] **Step 8: Aggiorna il call site `<TabArticoli>`**

Riga ~5235, trova `<TabArticoli`. La riga con `initialNotes` attualmente è:
```tsx
initialNotes={order.notes ?? undefined}
```

Sostituisci l'intera sezione `initialNotes` con le due righe usando `parseOrderNotesForEdit`:
```tsx
// Aggiungi PRIMA del render <TabArticoli> (o all'inizio della funzione se ordine è disponibile):
// const { noShipping: orderNoShipping, notes: orderNotes } = parseOrderNotesForEdit(order.notes);
// Poi nel JSX:
initialNotes={parseOrderNotesForEdit(order.notes).notes}
initialNoShipping={parseOrderNotesForEdit(order.notes).noShipping}
```

Nota: per evitare doppia computazione, calcola `parseOrderNotesForEdit(order.notes)` una volta all'esterno del JSX e destruttura.

- [ ] **Step 9: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: nessun errore.

- [ ] **Step 10: Test frontend**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```
Expected: tutti i test passano.

- [ ] **Step 11: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(frontend): add initialNoShipping prop and editNoShipping state to TabArticoli"
```

---

## Task 8: Frontend — checkbox UI "Spese di trasporto" nel box riepilogo

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`

- [ ] **Step 1: Trova il box riepilogo in `TabArticoli`**

Cerca nel file `style={{ border: '2px solid #3b82f6'` — questo è il box riepilogo totali in edit mode. Troverai il blocco con `Subtotale articoli`, `Imponibile`, `Spese di trasporto`, `IVA Totale`, `TOTALE`.

- [ ] **Step 2: Leggi la riga "Spese di trasporto" in `OrderFormSimple.tsx` e confronta**

Leggi `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` righe 4911-4949 per vedere il pattern originale della riga spese. Il JSX che implementerai di seguito deve essere **identico** al pattern di `OrderFormSimple.tsx`. Se ci sono differenze tra il snippet qui sotto e quello che trovi nel file (es. `OrderFormSimple.tsx` è stato aggiornato nel frattempo), usa il file come fonte di verità e adatta il JSX di conseguenza.

- [ ] **Step 3: Aggiorna la riga "Spese di trasporto K3"**

La riga attuale mostra le spese come testo arancione non interattivo. Sostituiscila con il pattern identico a `OrderFormSimple.tsx`:

La logica da implementare:
```tsx
{(() => {
  const rawShipping = calculateShippingCosts(editTotals.itemsSubtotal);
  const showShippingRow = rawShipping.cost > 0 || editNoShipping;
  if (!showShippingRow) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      color: editNoShipping ? '#9ca3af' : '#f59e0b', fontSize: '0.875rem', marginTop: '0.25rem' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={editNoShipping}
          onChange={(e) => setEditNoShipping(e.target.checked)}
          style={{ accentColor: '#f59e0b', width: '16px', height: '16px', cursor: 'pointer' }}
        />
        <span style={{ textDecoration: editNoShipping ? 'line-through' : 'none' }}>
          Spese di trasporto K3
        </span>
        {!editNoShipping && rawShipping.cost > 0 && (
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            ({formatCurrency(rawShipping.cost)} + IVA)
          </span>
        )}
      </label>
      <strong style={{ textDecoration: editNoShipping ? 'line-through' : 'none' }}>
        {editNoShipping ? formatCurrency(0) : formatCurrency(editTotals.shippingCost + editTotals.shippingTax)}
      </strong>
    </div>
  );
})()}
```

- [ ] **Step 4: Type-check e test**

```bash
npm run type-check --prefix archibald-web-app/frontend && npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(frontend): add noShipping checkbox to edit mode totals summary"
```

---

## Task 9: Backend — refresh immediato totali in `edit-order.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/edit-order.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/edit-order.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Nel file `edit-order.spec.ts`, aggiungi dentro la suite principale:

```ts
describe('totals refresh', () => {
  test('updates gross_amount and total_with_vat in order_records after article update', async () => {
    const mockBot = {
      editOrderInArchibald: async () => ({ success: true, message: 'ok' }),
      setProgressCallback: () => {},
    };
    await handleEditOrder(pool, mockBot as never, {
      orderId: testOrderId,
      modifications: [],
      updatedItems: [
        {
          articleCode: 'ART001',
          quantity: 2,
          unitPrice: 10,
          discountPercent: 0,
          lineAmount: 20,
          vatPercent: 22,
          vatAmount: 4.4,
          lineTotalWithVat: 24.4,
        },
      ],
    }, testUserId, () => {});

    const row = await pool.query(
      'SELECT gross_amount, total_vat_amount, total_with_vat FROM agents.order_records WHERE id = $1 AND user_id = $2',
      [testOrderId, testUserId],
    );
    expect(Number(row.rows[0].gross_amount)).toBeCloseTo(20, 1);
    expect(Number(row.rows[0].total_vat_amount)).toBeCloseTo(4.4, 1);
    expect(Number(row.rows[0].total_with_vat)).toBeCloseTo(24.4, 1);
  });
});
```

- [ ] **Step 2: Verifica che il test fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose 2>&1 | grep -A3 'totals refresh'
```

- [ ] **Step 3: Aggiungi UPDATE totali dentro la transazione in `handleEditOrder`**

Trova il blocco `pool.withTransaction(async (tx) => {...})` in `handleEditOrder`. All'interno della transazione, DOPO l'UPDATE di `article_search_text`, aggiungi:

```ts
// Nota: $1 = data.orderId usato sia come order_articles.order_id (FK → order_records.id)
// sia come order_records.id nella WHERE clause — stesso valore, schema confermato.
await tx.query(
  `UPDATE agents.order_records
   SET gross_amount = (SELECT COALESCE(SUM(line_amount), 0) FROM agents.order_articles WHERE order_id = $1 AND user_id = $2),
       total_vat_amount = (SELECT COALESCE(SUM(vat_amount), 0) FROM agents.order_articles WHERE order_id = $1 AND user_id = $2),
       total_with_vat = (SELECT COALESCE(SUM(line_total_with_vat), 0) FROM agents.order_articles WHERE order_id = $1 AND user_id = $2)
   WHERE id = $1 AND user_id = $2`,
  [data.orderId, userId],
);
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```
Expected: tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/edit-order.ts \
        archibald-web-app/backend/src/operations/handlers/edit-order.spec.ts
git commit -m "feat(edit-order): refresh gross_amount and totals in order_records after article update"
```

---

## Task 10: Backend — verifica post-modifica sincrona in `edit-order.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/edit-order.ts`
- Modify: `archibald-web-app/backend/src/main.ts`

Questo task richiede di seguire il pattern di `submit-order.ts`. Prima di scrivere codice, **leggi** `submit-order.ts` righe 1-20 (import verification) e righe 430-500 (flusso inline sync) per capire:
1. Come `broadcastVerification` è iniettato
2. Come `saveOrderVerificationSnapshot` è chiamato
3. Qual è il tipo esatto atteso da `verifyOrderArticles` per il primo argomento (da leggere in `verification/verify-order-articles.ts`)

- [ ] **Step 1: Scrivi il test che fallisce per la verifica post-modifica**

In `edit-order.spec.ts`, aggiungi nella suite principale:

```ts
describe('post-edit verification', () => {
  test('calls updateVerificationStatus when inlineSyncDeps and updatedItems are present', async () => {
    const verificationStatusUpdates: string[] = [];

    // Mock inlineSyncDeps — simula performInlineOrderSync che restituisce articoli
    const mockInlineSyncDeps = {
      // i campi esatti dipendono da InlineSyncDeps — adattare guardando il tipo
      pool,
      downloadOrderArticlesPDF: async () => Buffer.from(''),
      parsePdf: async () => [{ articleCode: 'ART001', quantity: 2, unitPrice: 10, lineAmount: 20, vatPercent: 22, vatAmount: 4.4 }],
      getProductVat: async () => 22,
      cleanupFile: async () => {},
    };

    // Mock updateVerificationStatus tramite spy — oppure usa pool reale e verifica DB
    // Se il repository è importato direttamente, considera di verificare la colonna
    // verification_status in order_records dopo la chiamata

    const mockBot = {
      editOrderInArchibald: async () => ({ success: true, message: 'ok' }),
      setProgressCallback: () => {},
    };

    const result = await handleEditOrder(pool, mockBot as never, {
      orderId: testOrderId,
      modifications: [],
      updatedItems: [{ articleCode: 'ART001', quantity: 2, unitPrice: 10, discountPercent: 0, lineAmount: 20, vatPercent: 22, vatAmount: 4.4, lineTotalWithVat: 24.4 }],
    }, testUserId, () => {}, mockInlineSyncDeps as never);

    expect(result.verificationStatus).toBeDefined();
  });
});
```

**Nota**: Il mock di `inlineSyncDeps` usa la firma reale di `InlineSyncDeps` (già letta):
```ts
// Firma reale da verification/inline-order-sync.ts:
// type InlineSyncDeps = {
//   pool: DbPool;
//   downloadOrderArticlesPDF: (archibaldOrderId: string) => Promise<string>;  // path file, non Buffer
//   parsePdf: (pdfPath: string) => Promise<ParsedArticle[]>;
//   getProductVat: (articleCode: string) => Promise<number | null>;
//   cleanupFile: (filePath: string) => Promise<void>;
// };
```
Adatta il mock al costruttore di `InlineSyncDeps` sopra. Il cast `as never` va rimosso una volta tipato correttamente.

Verifica che il test fallisca (la funzione non ha ancora `inlineSyncDeps` come parametro):
```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose 2>&1 | grep -A5 'post-edit verification'
```

- [ ] **Step 3: Aggiungi import in `edit-order.ts`**

```ts
import type { InlineSyncDeps } from '../../verification/inline-order-sync';
import { performInlineOrderSync } from '../../verification/inline-order-sync';
import type { SnapshotArticle, VerificationResult } from '../../verification/verify-order-articles';
import { verifyOrderArticles } from '../../verification/verify-order-articles';
import { updateVerificationStatus } from '../../db/repositories/order-verification';
import { logger } from '../../logger';
```

- [ ] **Step 4: Aggiorna `createEditOrderHandler` — aggiungi `inlineSyncDeps` e `broadcast`**

Il pattern è identico a `createSubmitOrderHandler` (4 parametri). Aggiunge:
- 3°: `inlineSyncDeps?: Omit<InlineSyncDeps, 'pool'>` (pool è già disponibile nel closure)
- 4°: `broadcast?: (userId: string, event: Record<string, unknown>) => void`

```ts
function createEditOrderHandler(
  pool: DbPool,
  createBot: (userId: string) => EditOrderBot,
  inlineSyncDeps?: Omit<InlineSyncDeps, 'pool'>,
  broadcast?: (userId: string, event: Record<string, unknown>) => void,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as EditOrderData;
    const fullDeps: InlineSyncDeps | undefined = inlineSyncDeps ? { pool, ...inlineSyncDeps } : undefined;
    const result = await handleEditOrder(pool, bot, typedData, userId, onProgress, fullDeps, broadcast);
    return result as unknown as Record<string, unknown>;
  };
}
```

- [ ] **Step 5: Aggiungi `inlineSyncDeps` e `broadcast` come parametri di `handleEditOrder`**

```ts
async function handleEditOrder(
  pool: DbPool,
  bot: EditOrderBot,
  data: EditOrderData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  inlineSyncDeps?: InlineSyncDeps,
  broadcast?: (userId: string, event: Record<string, unknown>) => void,
): Promise<{ success: boolean; message: string; verificationStatus?: string }>
```

- [ ] **Step 6: Sostituisci `onProgress(100, ...)` con il blocco di verifica**

**IMPORTANTE**: La riga `onProgress(100, 'Modifica completata')` che già esiste nel codice va **RIMOSSA** da dove si trova attualmente. Il blocco di verifica che inserisci di seguito include la chiamata `onProgress(100, ...)` alla fine, che sarà l'unica. Non lasciare la chiamata originale altrimenti `100` viene emesso due volte.

Inserisci il blocco al posto della riga `onProgress(100, ...)` rimossa (prima del `return`):

```ts
let verificationStatus: string | undefined;

if (data.updatedItems && data.updatedItems.length > 0 && inlineSyncDeps) {
  try {
    onProgress(85, 'Verifica modifica su Archibald...');
    const syncedArticles = await performInlineOrderSync(
      inlineSyncDeps,
      data.orderId,
      userId,
      onProgress,
    );

    if (syncedArticles) {
      // Firma reale: verifyOrderArticles(snapshotItems: readonly SnapshotArticle[], syncedArticles: readonly SyncedArticle[])
      // Mappa updatedItems a SnapshotArticle[] — leggere il tipo esatto da verify-order-articles.ts
      const expectedItems: SnapshotArticle[] = data.updatedItems.map(item => ({
        articleCode: item.articleCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent ?? 0,
        lineAmount: item.lineAmount ?? 0,
      }));

      const verificationResult: VerificationResult = verifyOrderArticles(expectedItems, syncedArticles);
      verificationStatus = verificationResult.status;

      await updateVerificationStatus(
        pool,
        data.orderId,
        userId,
        verificationResult.status,
        verificationResult.mismatches.length > 0 ? JSON.stringify(verificationResult.mismatches) : null,
      );

      // Emetti evento WebSocket VERIFICATION_RESULT — stesso pattern di submit-order.ts
      if (broadcast) {
        broadcast(userId, {
          type: 'VERIFICATION_RESULT',
          orderId: data.orderId,
          status: verificationResult.status,
          mismatches: verificationResult.mismatches,
        });
      }

      logger.info('[editOrder] Verification complete', {
        orderId: data.orderId,
        status: verificationResult.status,
        mismatches: verificationResult.mismatches.length,
      });
    }
  } catch (err) {
    logger.warn('[editOrder] Inline verification failed, skipping', {
      orderId: data.orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    onProgress(95, 'Verifica posticipata');
  }
}

onProgress(100, 'Modifica completata');
return { success: true, message: result.message, verificationStatus };
```

**VINCOLO**: Il codice usa `SnapshotArticle` e `VerificationResult` importati da `verify-order-articles.ts` (già nell'import Step 3). Se i campi di `SnapshotArticle` differiscono da quelli mappati sopra, leggi il tipo e adatta il mapping. Il diff finale non deve contenere `as never`.

- [ ] **Step 7: Aggiorna `main.ts` per passare `inlineSyncDeps` e `broadcastEvent`**

In `main.ts`, l'oggetto `inlineSyncDeps` usato per `createSubmitOrderHandler` è costruito inline (3° parametro, senza `pool`). Estrai quell'oggetto in una variabile condivisa `sharedInlineSyncDeps` e passa sia `sharedInlineSyncDeps` che `broadcastEvent` a `createEditOrderHandler`:

Prima:
```ts
'submit-order': createSubmitOrderHandler(pool, botFactory, { downloadOrderArticlesPDF: ..., parsePdf: ..., getProductVat: ..., cleanupFile }, broadcastEvent),
// ...
'edit-order': createEditOrderHandler(pool, editBotFactory),
```

Dopo (estrarre prima i deps comuni, poi usarli in entrambe le chiamate):
```ts
const sharedInlineSyncDeps = {
  downloadOrderArticlesPDF: async (archibaldOrderId: string) => { /* copia dall'inline esistente */ },
  parsePdf: async (pdfPath: string) => { /* copia dall'inline esistente */ },
  getProductVat: async (articleCode: string) => { /* copia dall'inline esistente */ },
  cleanupFile,
};

'submit-order': createSubmitOrderHandler(pool, submitBotFactory, sharedInlineSyncDeps, broadcastEvent),
// ...
'edit-order': createEditOrderHandler(pool, editBotFactory, sharedInlineSyncDeps, broadcastEvent),
```

**Nota**: se `broadcastEvent` non è già un identificatore nel file ma è costruito inline nella chiamata a `createSubmitOrderHandler`, estrarlo in variabile prima di usarlo in entrambe le chiamate.

- [ ] **Step 7: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose 2>&1 | grep -A5 'post-edit verification'
```
Expected: il test aggiunto in Step 1 passa.

- [ ] **Step 8: Build check**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: nessun errore. Se ci sono errori di tipo su `verifyOrderArticles`, leggi la firma e correggi il mapping. Il codice finale **non deve contenere `as never`** su quella riga.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/edit-order.ts \
        archibald-web-app/backend/src/operations/handlers/edit-order.spec.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(edit-order): add synchronous post-edit verification with inline sync"
```

---

## Task 11: Frontend — banner VERIFICATION_RESULT in `OrderCardNew.tsx`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`

Prima di scrivere codice, cerca in `OrderCardNew.tsx` o in `OrderHistory.tsx` come viene già gestito l'evento `VERIFICATION_RESULT` (o `verificationResult`) dal WebSocket per i nuovi ordini. Usa lo stesso pattern.

- [ ] **Step 1: Aggiungi state per il banner**

Dentro `TabArticoli`, aggiungi:
```ts
const [verificationBanner, setVerificationBanner] = useState<{
  status: 'verified' | 'mismatch_detected';
  mismatches?: Array<{ articleCode: string; expected: unknown; actual: unknown }>;
} | null>(null);
```

- [ ] **Step 2: Sottoscrivi all'evento WebSocket `VERIFICATION_RESULT`**

Vicino agli altri `useEffect` con `subscribe`, aggiungi (dentro `TabArticoli` o nel componente padre `OrderCardNew` che ha accesso all'orderId):

```ts
useEffect(() => {
  if (!editing) return;
  const unsubscribe = subscribe('VERIFICATION_RESULT', (payload: unknown) => {
    const p = payload as { orderId: string; status: string; mismatches?: unknown[] };
    if (p.orderId === orderId) {
      setVerificationBanner({
        status: p.status as 'verified' | 'mismatch_detected',
        mismatches: p.mismatches as never,
      });
    }
  });
  return () => { unsubscribe(); };
}, [editing, orderId, subscribe]);
```

- [ ] **Step 3: Reset banner all'uscita dalla edit mode**

Nel `useEffect` su `editing` che fa reset degli state, aggiungi:
```ts
setVerificationBanner(null);
```

- [ ] **Step 4: Renderizza il banner**

Dopo il box riepilogo totali (dopo il `div` con `border: '2px solid #3b82f6'`), aggiungi:

```tsx
{verificationBanner && (
  <div style={{
    marginTop: '0.75rem',
    padding: '0.75rem',
    borderRadius: '0.375rem',
    backgroundColor: verificationBanner.status === 'verified' ? '#d1fae5' : '#fef3c7',
    border: `1px solid ${verificationBanner.status === 'verified' ? '#6ee7b7' : '#fcd34d'}`,
    fontSize: '0.875rem',
  }}>
    {verificationBanner.status === 'verified' ? (
      <span style={{ color: '#065f46' }}>✅ Modifica confermata da Archibald ERP</span>
    ) : (
      <div>
        <div style={{ color: '#92400e', fontWeight: 600, marginBottom: '0.25rem' }}>
          ⚠️ Discrepanze rilevate su Archibald:
        </div>
        {verificationBanner.mismatches?.map((m: never, i: number) => {
          const mismatch = m as { articleCode: string; field: string; expected: unknown; actual: unknown };
          return (
            <div key={i} style={{ color: '#78350f', fontSize: '0.8125rem' }}>
              {mismatch.articleCode}: {mismatch.field} atteso {String(mismatch.expected)} → trovato {String(mismatch.actual)}
            </div>
          );
        })}
      </div>
    )}
  </div>
)}
```

**Nota**: il formato esatto del payload `mismatches` va verificato guardando il tipo `ArticleMismatch` in `verification/verify-order-articles.ts`. Adattare il rendering di conseguenza.

- [ ] **Step 5: Type-check e test**

```bash
npm run type-check --prefix archibald-web-app/frontend && npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(frontend): show VERIFICATION_RESULT banner after edit order in TabArticoli"
```

---

## Task 12: Bot — fix discount condition + logging

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/edit-order.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

In `edit-order.spec.ts`, aggiungi nella suite principale:

```ts
describe('discount propagation', () => {
  test('passes discount=0 to bot modifications (does not skip zero discount)', async () => {
    const botCalls: Array<{ mods: unknown }> = [];
    const mockBot = {
      editOrderInArchibald: async (_id: string, mods: unknown) => {
        botCalls.push({ mods });
        return { success: true, message: 'ok' };
      },
      setProgressCallback: () => {},
    };
    await handleEditOrder(pool, mockBot as never, {
      orderId: testOrderId,
      modifications: [{ type: 'update', rowIndex: 0, discount: 0 }],
    }, testUserId, () => {});
    const mods = botCalls[0].mods as Array<{ discount?: number }>;
    expect(mods[0].discount).toEqual(0);
  });
});
```

**Nota**: questo test NON è un test TDD che fallirà prima del fix — il bug è nel bot (non nel handler) e non è testabile senza browser reale. Il test è un **regression guard**: verifica che `discount=0` arrivi intatto all'interfaccia del bot, prevenendo future regressioni nel handler. Eseguilo aspettandoti che passi già. Procedi immediatamente allo Step 2 — il fix bot in Step 2 è il lavoro reale.

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose 2>&1 | grep -A3 'discount propagation'
```
Expected: passa già (il handler non ha il bug — ce l'ha il bot).

- [ ] **Step 2: Trova e correggi la condizione discount**

Cerca nel file `mod.discount !== undefined && mod.discount > 0`. Appariranno 2 occorrenze (una per `type: "update"` e una per `type: "add"`). In entrambe, rimuovi `&& mod.discount > 0`:

Prima:
```ts
if (mod.discount !== undefined && mod.discount > 0) {
  await this.setEditRowDiscount(mod.discount);
}
```

Dopo:
```ts
if (mod.discount !== undefined) {
  logger.info('[editOrder] Applying discount to row', { rowIndex: mod.rowIndex, discount: mod.discount });
  await this.setEditRowDiscount(mod.discount);
  logger.info('[editOrder] Discount applied', { rowIndex: mod.rowIndex });
}
```

Ripeti per entrambe le occorrenze.

- [ ] **Step 3: Build check**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 4: Test backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```
Expected: tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts \
        archibald-web-app/backend/src/operations/handlers/edit-order.spec.ts
git commit -m "fix(bot): apply discount even when value is 0; add logging for discount propagation"
```

---

## Task 13: Verifica finale + test completi

- [ ] **Step 1: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: nessun errore.

- [ ] **Step 2: Test backend completi**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -10
```
Expected: tutti i test passano (0 failing).

- [ ] **Step 3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: nessun errore.

- [ ] **Step 4: Test frontend completi**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -10
```
Expected: tutti i test passano (0 failing).

- [ ] **Step 5: E2E obbligatorio (dopo deploy)**

Come da regola `feedback_e2e_before_deploy.md`:
1. Modifica ordine con `noShipping=true` + note → verifica su Archibald ERP che il campo NOTE contenga `"NO SPESE DI SPEDIZIONE\n..."`
2. Modifica ordine con sconto 63% su riga → verifica che Archibald applichi lo sconto (`lineAmount` ridotto)
3. Modifica ordine con sconto 0% su riga che aveva sconto → verifica che Archibald azzeri lo sconto
4. Verifica che il banner verde "Modifica confermata" appaia dopo un'edit corretta
5. Verifica che i totali nella scheda PWA si aggiornino senza aspettare il sync di background

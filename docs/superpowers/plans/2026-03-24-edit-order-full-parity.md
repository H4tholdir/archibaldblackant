# Edit Order Full Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La modalità di modifica ordine in `OrderCardNew.tsx` deve avere la stessa UX del form di creazione (`OrderFormSimple.tsx`): icona cestino, sconto globale, note, riepilogo totali con dialogs imponibile/totale.

**Architecture:** DB migration → backend data layer → utility frontend → handler backend → bot → componente frontend in più task incrementali. Ogni task è compilabile e testabile in isolamento.

**Tech Stack:** React 19 + TypeScript (strict), Vitest, Express, PostgreSQL (`pg`), Puppeteer. Comandi: `npm run type-check --prefix archibald-web-app/frontend` / `npm run build --prefix archibald-web-app/backend` / `npm test --prefix archibald-web-app/frontend` / `npm test --prefix archibald-web-app/backend`.

**Spec:** `docs/superpowers/specs/2026-03-24-edit-order-full-parity-design.md`

---

## File Map

| File | Azione |
|------|--------|
| `backend/src/db/migrations/031-order-records-notes.sql` | CREATE |
| `backend/src/db/repositories/orders.ts` | MODIFY – aggiunge `notes` a `OrderRow` + `mapRowToOrder` |
| `backend/src/operations/handlers/submit-order.ts` | MODIFY – aggiunge `notes` all'INSERT |
| `frontend/src/utils/parse-order-discount.ts` | CREATE |
| `frontend/src/utils/parse-order-discount.spec.ts` | CREATE |
| `backend/src/operations/handlers/edit-order.ts` | MODIFY – aggiunge `notes` a tipi e handler |
| `backend/src/operations/handlers/edit-order.spec.ts` | MODIFY – aggiunge test notes |
| `backend/src/bot/archibald-bot.ts` | MODIFY – aggiunge `notes?` a `editOrderInArchibald` |
| `frontend/src/components/OrderCardNew.tsx` | MODIFY – 5 task separati (vedi Task 7–11) |

---

## Task 1: DB Migration – aggiunta colonna `notes` a `order_records`

**Files:**
- Create: `backend/src/db/migrations/031-order-records-notes.sql`

- [ ] **Step 1.1: Creare il file di migrazione**

```sql
-- 031-order-records-notes.sql
-- Add notes field to order_records for edit-mode pre-population
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS notes TEXT;
```

- [ ] **Step 1.2: Verificare che la migrazione sia l'ultima in ordine alfabetico**

```bash
ls archibald-web-app/backend/src/db/migrations/*.sql | sort | tail -5
```
Expected: `031-order-records-notes.sql` appare come ultima.

- [ ] **Step 1.3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/031-order-records-notes.sql
git commit -m "feat(db): add notes column to order_records"
```

---

## Task 2: Backend repository – `OrderRow` + `mapRowToOrder`

**Files:**
- Modify: `backend/src/db/repositories/orders.ts`

- [ ] **Step 2.1: Aggiungere `notes` a `OrderRow`**

Nel tipo `OrderRow` (attorno a riga 90), aggiungere dopo `delivery_signed_by: string | null;`:

```ts
  notes: string | null;
```

- [ ] **Step 2.2: Aggiungere `notes` a `mapRowToOrder`**

Nella funzione `mapRowToOrder` (attorno a riga 390), aggiungere dopo `shippingTax: row.shipping_tax,`:

```ts
    notes: row.notes ?? undefined,
```

- [ ] **Step 2.3: Verificare build backend**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: nessun errore TypeScript.

- [ ] **Step 2.4: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/orders.ts
git commit -m "feat(db): map notes field from order_records to Order type"
```

---

## Task 3: Backend – persistere `notes` nell'INSERT di `submit-order.ts`

**Files:**
- Modify: `backend/src/operations/handlers/submit-order.ts` (attorno a riga 277)

> Nota: `data.notes?: string` è già nel tipo di input del handler (riga ~43). Aggiungere solo alla query SQL.

- [ ] **Step 3.1: Aggiungere `notes` all'INSERT**

Nella query INSERT (riga ~277), aggiungere `notes` alla lista colonne **e** ai valori:

Prima (parte finale della lista colonne):
```sql
..., articles_synced_at
) VALUES ($1, ..., $25)
ON CONFLICT (id, user_id) DO UPDATE SET
  order_number = EXCLUDED.order_number,
  gross_amount = EXCLUDED.gross_amount,
  total_amount = EXCLUDED.total_amount,
  last_sync = EXCLUDED.last_sync
```

Dopo:
```sql
..., articles_synced_at, notes
) VALUES ($1, ..., $25, $26)
ON CONFLICT (id, user_id) DO UPDATE SET
  order_number = EXCLUDED.order_number,
  gross_amount = EXCLUDED.gross_amount,
  total_amount = EXCLUDED.total_amount,
  last_sync = EXCLUDED.last_sync,
  notes = EXCLUDED.notes
```

Nell'array dei valori (dopo il valore di `articles_synced_at`), aggiungere:
```ts
data.notes ?? null,
```

- [ ] **Step 3.2: Verificare build backend**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: nessun errore TypeScript.

- [ ] **Step 3.3: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts
git commit -m "feat(orders): persist notes to order_records on order submission"
```

---

## Task 4: Frontend utility – `parseOrderDiscountPercent`

**Files:**
- Create: `frontend/src/utils/parse-order-discount.ts`
- Create: `frontend/src/utils/parse-order-discount.spec.ts`

- [ ] **Step 4.1: Scrivere i test (TDD – prima dei test)**

```ts
// frontend/src/utils/parse-order-discount.spec.ts
import { describe, expect, test } from 'vitest';
import { parseOrderDiscountPercent } from './parse-order-discount';

describe('parseOrderDiscountPercent', () => {
  test('parses Italian locale format "17,98 %"', () => {
    expect(parseOrderDiscountPercent('17,98 %')).toBe(17.98);
  });

  test('parses dot-separated format "17.98"', () => {
    expect(parseOrderDiscountPercent('17.98')).toBe(17.98);
  });

  test('returns 0 for "0,00 %"', () => {
    expect(parseOrderDiscountPercent('0,00 %')).toBe(0);
  });

  test('returns 0 for "0%"', () => {
    expect(parseOrderDiscountPercent('0%')).toBe(0);
  });

  test('returns 0 for null', () => {
    expect(parseOrderDiscountPercent(null)).toBe(0);
  });

  test('returns 0 for undefined', () => {
    expect(parseOrderDiscountPercent(undefined)).toBe(0);
  });

  test('returns 0 for empty string', () => {
    expect(parseOrderDiscountPercent('')).toBe(0);
  });

  test('returns 0 for non-numeric string', () => {
    expect(parseOrderDiscountPercent('N/A')).toBe(0);
  });

  test('parses whole number "20 %"', () => {
    expect(parseOrderDiscountPercent('20 %')).toBe(20);
  });
});
```

- [ ] **Step 4.2: Eseguire i test – verificare che falliscano**

```bash
npm test --prefix archibald-web-app/frontend -- parse-order-discount
```
Expected: FAIL (file non esiste ancora).

- [ ] **Step 4.3: Implementare l'utility**

```ts
// frontend/src/utils/parse-order-discount.ts
export function parseOrderDiscountPercent(raw?: string | null): number {
  if (!raw) return 0;
  const cleaned = raw.replace('%', '').replace(',', '.').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}
```

- [ ] **Step 4.4: Eseguire i test – verificare che passino**

```bash
npm test --prefix archibald-web-app/frontend -- parse-order-discount
```
Expected: 9 tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add archibald-web-app/frontend/src/utils/parse-order-discount.ts \
        archibald-web-app/frontend/src/utils/parse-order-discount.spec.ts
git commit -m "feat(frontend): add parseOrderDiscountPercent utility"
```

---

## Task 5: Backend – `edit-order.ts` aggiunta campo `notes`

**Files:**
- Modify: `backend/src/operations/handlers/edit-order.ts`
- Modify: `backend/src/operations/handlers/edit-order.spec.ts`

- [ ] **Step 5.1: Scrivere i test per `notes` (TDD)**

Aggiungere a `edit-order.spec.ts` dopo i test esistenti:

```ts
  test('passes notes to bot when data.notes is defined', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const dataWithNotes: EditOrderData = { ...sampleData, notes: 'Urgente' };

    await handleEditOrder(pool, bot, dataWithNotes, 'user-1', vi.fn());

    expect(bot.editOrderInArchibald).toHaveBeenCalledWith(
      'ORD-001',
      sampleData.modifications,
      'Urgente',
    );
  });

  test('does not pass notes to bot when data.notes is undefined', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.editOrderInArchibald).toHaveBeenCalledWith(
      'ORD-001',
      sampleData.modifications,
      undefined,
    );
  });

  test('updates order_records.notes in DB when data.notes is defined', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const dataWithNotes: EditOrderData = { ...sampleData, notes: 'Test note' };

    await handleEditOrder(pool, bot, dataWithNotes, 'user-1', vi.fn());

    const notesCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) =>
        typeof c[0] === 'string' &&
        (c[0] as string).includes('UPDATE agents.order_records') &&
        (c[0] as string).includes('notes'),
      );
    expect(notesCalls).toHaveLength(1);
    expect(notesCalls[0][1]).toEqual(['Test note', 'ORD-001', 'user-1']);
  });

  test('does not update notes in DB when data.notes is undefined', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleEditOrder(pool, bot, sampleData, 'user-1', vi.fn());

    const notesCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) =>
        typeof c[0] === 'string' &&
        (c[0] as string).includes('UPDATE agents.order_records') &&
        (c[0] as string).includes('notes'),
      );
    expect(notesCalls).toHaveLength(0);
  });
```

- [ ] **Step 5.2: Eseguire i test – verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- edit-order
```
Expected: i 4 nuovi test FAIL, i test esistenti PASS.

- [ ] **Step 5.3: Aggiornare `EditOrderData` e `EditOrderBot`**

In `edit-order.ts`, modificare i tipi:

```ts
type EditOrderData = {
  orderId: string;
  modifications: Array<Record<string, unknown>>;
  updatedItems?: EditOrderArticle[];
  notes?: string;
};

type EditOrderBot = {
  editOrderInArchibald: (
    orderId: string,
    modifications: Array<Record<string, unknown>>,
    notes?: string,
  ) => Promise<{ success: boolean; message: string }>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};
```

- [ ] **Step 5.4: Aggiornare `handleEditOrder` per passare notes al bot e al DB**

Modificare la chiamata al bot (riga ~68):
```ts
const result = await bot.editOrderInArchibald(data.orderId, data.modifications, data.notes);
```

Aggiungere il salvataggio notes al DB **dopo** la transazione articoli (dopo il blocco `if (data.updatedItems && data.updatedItems.length > 0)`):

```ts
  if (data.notes !== undefined) {
    await pool.query(
      'UPDATE agents.order_records SET notes = $1 WHERE id = $2 AND user_id = $3',
      [data.notes, data.orderId, userId],
    );
  }
```

- [ ] **Step 5.5: Aggiornare il test esistente della firma bot**

Il test esistente a riga ~47 ora si aspetta 3 argomenti:
```ts
expect(bot.editOrderInArchibald).toHaveBeenCalledWith(
  'ORD-001',
  sampleData.modifications,
  undefined,  // notes non fornite → undefined
);
```

- [ ] **Step 5.6: Eseguire tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend -- edit-order
```
Expected: tutti i test PASS.

- [ ] **Step 5.7: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: nessun errore.

- [ ] **Step 5.8: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/edit-order.ts \
        archibald-web-app/backend/src/operations/handlers/edit-order.spec.ts
git commit -m "feat(edit-order): add notes field - pass to bot and persist to DB"
```

---

## Task 6: Bot – aggiunta `notes` a `editOrderInArchibald`

**Files:**
- Modify: `backend/src/bot/archibald-bot.ts`

> ⚠️ **E2E test obbligatorio pre-deploy** per questo task (vedere spec per procedura).

- [ ] **Step 6.1: Aggiornare la firma del metodo `editOrderInArchibald`**

Trovare la firma del metodo a riga ~7342. Aggiungere il terzo parametro:

```ts
async editOrderInArchibald(
  archibaldOrderId: string,
  modifications: Array<
    | { type: "update"; rowIndex: number; articleCode: string; quantity: number; discount?: number; productName?: string; articleChanged?: boolean; }
    | { type: "add"; articleCode: string; quantity: number; discount?: number; productName?: string; }
    | { type: "delete"; rowIndex: number }
  >,
  notes?: string,   // ← aggiunto
): Promise<{ success: boolean; message: string }>
```

- [ ] **Step 6.2: Aggiungere chiamata `fillOrderNotes` prima di `emitProgress("edit.save")`**

Trovare il commento `// Step 6: Save and close` (attorno a riga 8146). Inserire **prima** di `await this.emitProgress("edit.save")`:

```ts
// Fill notes if provided (notes = "" clears existing ERP notes intentionally)
if (notes !== undefined) {
  const notesText = buildOrderNotesText(undefined, notes);
  await this.fillOrderNotes(notesText);
}
```

- [ ] **Step 6.3: Build backend (TypeScript check)**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: nessun errore TypeScript.

- [ ] **Step 6.4: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): pass notes to editOrderInArchibald and fill in ERP"
```

> **Nota:** E2E test in produzione richiesto prima del deploy. Vedere spec §E2E.

---

## Task 7: Frontend – props, trash icon, sconto globale, note

**Files:**
- Modify: `frontend/src/components/OrderCardNew.tsx`

> `OrderCardNew.tsx` è un file grande (~4600 righe). Operare con Edit tool su sezioni specifiche. Ogni step include la riga di riferimento approssimativa.

- [ ] **Step 7.1: Aggiungere import mancanti**

Trovare i primi import del file (riga ~1). Aggiungere dopo gli import esistenti se non già presenti:

```ts
import { calculateShippingCosts } from '../utils/order-calculations';
import { parseOrderDiscountPercent } from '../utils/parse-order-discount';
```

- [ ] **Step 7.2: Aggiungere nuovi props a `TabArticoli`**

Trovare la definizione props di `TabArticoli` (riga ~652). Aggiungere i nuovi campi:

```ts
function TabArticoli({
  orderId,
  archibaldOrderId,
  token,
  onTotalsUpdate,
  searchQuery = "",
  editing = false,
  onEditDone,
  editProgress,
  onEditProgress,
  customerName,
  initialNotes,           // ← nuovo
  initialDiscountPercent, // ← nuovo
}: {
  orderId: string;
  archibaldOrderId?: string;
  token?: string;
  onTotalsUpdate?: (totals: { totalVatAmount?: number; totalWithVat?: number }) => void;
  searchQuery?: string;
  editing?: boolean;
  onEditDone?: () => void;
  editProgress?: { progress: number; operation: string } | null;
  onEditProgress?: (p: { progress: number; operation: string } | null) => void;
  customerName?: string;
  initialNotes?: string;
  initialDiscountPercent?: number;
})
```

- [ ] **Step 7.3: Aggiungere nuovi state dopo i state esistenti di edit mode (riga ~695)**

Subito dopo `const [syncingArticles, setSyncingArticles] = useState(false);`:

```ts
  // Edit mode extras
  const [editNotes, setEditNotes] = useState('');
  const [globalEditDiscount, setGlobalEditDiscount] = useState('');

  // Imponibile dialog
  const [showImponibileDialog, setShowImponibileDialog] = useState(false);
  const [imponibileTarget, setImponibileTarget] = useState('');
  const [imponibileSelectedItems, setImponibileSelectedItems] = useState<Set<number>>(new Set());

  // Totale dialog
  const [showTotaleDialog, setShowTotaleDialog] = useState(false);
  const [totaleTarget, setTotaleTarget] = useState('');
  const [totaleSelectedItems, setTotaleSelectedItems] = useState<Set<number>>(new Set());

  // Maggiorazione (target > current total)
  const [showMarkupPanel, setShowMarkupPanel] = useState(false);
  const [markupAmount, setMarkupAmount] = useState(0);
  const [markupArticleSelection, setMarkupArticleSelection] = useState<Set<number>>(new Set());
```

- [ ] **Step 7.4: Aggiungere `useEffect` per seed state all'entrata in edit mode**

Trovare il `useEffect` esistente che inizializza `editItems` quando `editing` cambia (riga ~760 circa). Aggiungere seed dei nuovi state nello stesso effect o subito dopo:

```ts
  useEffect(() => {
    if (editing) {
      setEditNotes(initialNotes ?? '');
      setGlobalEditDiscount(
        initialDiscountPercent && initialDiscountPercent > 0
          ? String(initialDiscountPercent)
          : '',
      );
    }
  }, [editing, initialNotes, initialDiscountPercent]);
```

- [ ] **Step 7.5: Sostituire icona ✕ con 🗑️ nel pulsante rimozione riga**

Trovare il pulsante di rimozione articolo (riga ~1907):

Vecchio:
```tsx
>
  {"✕"}
</button>
```

Nuovo:
```tsx
>
  {"🗑️"}
</button>
```

- [ ] **Step 7.6: Aggiungere handler per sconto globale**

Trovare `const handleCancelEdit = () => {` (riga ~1263). Aggiungere prima di essa:

```ts
  const handleGlobalDiscountChange = (val: string) => {
    if (val === '' || /^\d*[.,]?\d{0,2}$/.test(val)) {
      setGlobalEditDiscount(val);
      const disc = parseFloat(val.replace(',', '.')) || 0;
      setEditItems((prev) => prev.map((item) => recalcLineAmounts({ ...item, discountPercent: disc })));
    }
  };
```

- [ ] **Step 7.7: Aggiungere sezione sconto globale + note sotto la tabella articoli (dopo "+ Aggiungi articolo")**

Trovare il blocco "+ Aggiungi articolo" che termina attorno a riga 1949:

```tsx
        </div>
      </div>
    );  // ← questo è il return del rendering edit mode
  }
```

**Prima** dell'ultimo `</div>` + `);` del return di edit mode, aggiungere:

```tsx
        {/* Sconto globale */}
        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px' }}>
            Sconto su tutte le righe (%)
          </label>
          <input
            autoComplete="off"
            type="text"
            inputMode="decimal"
            value={globalEditDiscount}
            onChange={(e) => handleGlobalDiscountChange(e.target.value)}
            style={{ width: '160px', padding: '6px 8px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '4px' }}
          />
        </div>

        {/* Note ordine */}
        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px' }}>
            Note
          </label>
          <textarea
            autoComplete="off"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Note per l'ordine..."
            maxLength={500}
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              fontFamily: 'system-ui',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>
```

- [ ] **Step 7.8: Aggiornare il sito di chiamata `<TabArticoli>` in `OrderCardNew` (riga ~4667)**

Aggiungere i due nuovi prop:

```tsx
<TabArticoli
  orderId={order.id}
  archibaldOrderId={order.id}
  token={token}
  onTotalsUpdate={setArticlesTotals}
  searchQuery={searchQuery}
  editing={editing}
  onEditDone={onEditDone}
  editProgress={editProgress}
  onEditProgress={setEditProgress}
  customerName={order.customerName}
  initialNotes={order.notes ?? undefined}
  initialDiscountPercent={parseOrderDiscountPercent(order.discountPercent)}
/>
```

- [ ] **Step 7.9: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: nessun errore.

- [ ] **Step 7.10: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx \
        archibald-web-app/frontend/src/utils/parse-order-discount.ts \
        archibald-web-app/frontend/src/utils/parse-order-discount.spec.ts
git commit -m "feat(edit-order): add props, trash icon, global discount, notes field"
```

---

## Task 8: Frontend – `editTotals` e riepilogo totali

**Files:**
- Modify: `frontend/src/components/OrderCardNew.tsx`

- [ ] **Step 8.1: Aggiungere `useMemo` per `editTotals`**

Dopo i nuovi state aggiunti nel Task 7 (vicino a riga ~720), aggiungere:

```ts
  const editTotals = useMemo(() => {
    const itemsSubtotal = editItems.reduce((s, i) => s + i.lineAmount, 0);
    const shipping = calculateShippingCosts(itemsSubtotal);
    const vatFromItems = editItems.reduce((s, i) => s + i.vatAmount, 0);
    const finalVAT = Math.round((vatFromItems + shipping.tax) * 100) / 100;
    const finalTotal = Math.round((itemsSubtotal + shipping.cost + finalVAT) * 100) / 100;
    return { itemsSubtotal, shippingCost: shipping.cost, shippingTax: shipping.tax, finalVAT, finalTotal };
  }, [editItems]);
```

> `useMemo` è già importato da react in questo file (verificare; se no, aggiungerlo).

- [ ] **Step 8.2: Aggiungere riepilogo totali dopo la sezione Note (Task 7)**

Dopo il blocco Note, prima della chiusura `</div></div>` del return edit mode:

```tsx
        {/* Riepilogo totali */}
        <div
          style={{
            marginTop: '20px',
            padding: '16px',
            background: 'white',
            borderRadius: '8px',
            border: '2px solid #3b82f6',
          }}
        >
          {/* Subtotale articoli */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span>Subtotale articoli:</span>
            <strong>{formatCurrency(editTotals.itemsSubtotal)}</strong>
          </div>

          {/* Imponibile – cliccabile */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '8px',
              paddingTop: '8px',
              borderTop: '1px solid #e5e7eb',
              fontSize: '13px',
              cursor: editItems.length > 0 ? 'pointer' : 'default',
              ...(editItems.length > 0 ? { background: '#f0f9ff', borderRadius: '4px', padding: '8px 4px', margin: '-4px 0 8px 0' } : {}),
            }}
            onClick={() => {
              if (editItems.length === 0) return;
              setImponibileTarget(editTotals.itemsSubtotal.toFixed(2));
              setImponibileSelectedItems(new Set(editItems.map((_, i) => i)));
              setShowImponibileDialog(true);
            }}
          >
            <span>Imponibile:{editItems.length > 0 ? ' (clicca per modificare)' : ''}</span>
            <strong>{formatCurrency(editTotals.itemsSubtotal)}</strong>
          </div>

          {/* Spese trasporto (se imponibile < soglia) */}
          {editTotals.shippingCost > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#f59e0b' }}>
              <span>
                Spese di trasporto K3{' '}
                <span style={{ fontSize: '11px' }}>({formatCurrency(editTotals.shippingCost)} + IVA)</span>
              </span>
              <strong>{formatCurrency(editTotals.shippingCost + editTotals.shippingTax)}</strong>
            </div>
          )}

          {/* IVA totale */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#6b7280' }}>
            <span>IVA Totale:</span>
            <strong>{formatCurrency(editTotals.finalVAT)}</strong>
          </div>

          {/* Totale con IVA – cliccabile */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '2px solid #3b82f6',
              fontSize: '15px',
              cursor: editItems.length > 0 ? 'pointer' : 'default',
              ...(editItems.length > 0 ? { background: '#eff6ff', borderRadius: '4px', padding: '8px 4px' } : {}),
            }}
            onClick={() => {
              if (editItems.length === 0) return;
              setTotaleTarget(editTotals.finalTotal.toFixed(2));
              setTotaleSelectedItems(new Set(editItems.map((_, i) => i)));
              setShowTotaleDialog(true);
            }}
          >
            <span style={{ fontWeight: 600 }}>
              TOTALE (con IVA):{editItems.length > 0 ? ' (clicca)' : ''}
            </span>
            <strong style={{ color: '#3b82f6' }}>{formatCurrency(editTotals.finalTotal)}</strong>
          </div>
        </div>
```

- [ ] **Step 8.3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: nessun errore.

- [ ] **Step 8.4: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(edit-order): add editTotals memo and totals summary box"
```

---

## Task 9: Frontend – Imponibile dialog

**Files:**
- Modify: `frontend/src/components/OrderCardNew.tsx`

- [ ] **Step 9.1: Aggiungere handler `handleImponibileViaSconto`**

Trovare `const handleCancelEdit = () => {` (riga ~1263). Aggiungere prima:

```ts
  const handleImponibileViaSconto = () => {
    const target = parseFloat(imponibileTarget.replace(',', '.'));
    if (isNaN(target) || target < 0 || imponibileSelectedItems.size === 0) return;

    const selectedSubtotal = editItems
      .filter((_, i) => imponibileSelectedItems.has(i))
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const unselectedSubtotal = editItems
      .filter((_, i) => !imponibileSelectedItems.has(i))
      .reduce((sum, item) => sum + item.lineAmount, 0);

    const targetForSelected = target - unselectedSubtotal;
    if (targetForSelected < 0 || selectedSubtotal === 0) {
      setError("Impossibile raggiungere l'imponibile target");
      setShowImponibileDialog(false);
      return;
    }

    const scontoNecessario = (1 - targetForSelected / selectedSubtotal) * 100;
    if (scontoNecessario < 0 || scontoNecessario >= 100) {
      setError("Sconto necessario fuori range (0-100%)");
      setShowImponibileDialog(false);
      return;
    }

    const computeImponibile = (disc: number) =>
      editItems.reduce((sum, item, i) => {
        if (!imponibileSelectedItems.has(i)) return sum + item.lineAmount;
        return sum + Math.round(item.unitPrice * item.quantity * (1 - disc / 100) * 100) / 100;
      }, 0);

    let newDiscount = Math.floor(scontoNecessario * 100) / 100;
    while (computeImponibile(newDiscount) < target && newDiscount > 0) {
      newDiscount = Math.round((newDiscount - 0.01) * 100) / 100;
    }
    const stepped = Math.round((newDiscount + 0.01) * 100) / 100;
    if (computeImponibile(stepped) >= target) {
      newDiscount = stepped;
    }

    let updatedItems = editItems.map((item, i) =>
      imponibileSelectedItems.has(i)
        ? recalcLineAmounts({ ...item, discountPercent: newDiscount })
        : item,
    );

    // Correzione centesimi residui sull'ultimo articolo selezionato
    const actualImponibile = updatedItems.reduce((s, i) => s + i.lineAmount, 0);
    const residualCents = Math.round((actualImponibile - target) * 100);
    if (residualCents > 0 && residualCents <= 10) {
      const indices = Array.from(imponibileSelectedItems);
      const lastIdx = indices[indices.length - 1];
      const lastItem = editItems[lastIdx];
      let lo = newDiscount;
      let hi = Math.min(newDiscount + 5, 100);
      let bestDisc = newDiscount;
      for (let iter = 0; iter < 80; iter++) {
        const mid = Math.round(((lo + hi) / 2) * 100) / 100;
        const testItems = updatedItems.map((it, i) =>
          i === lastIdx ? recalcLineAmounts({ ...lastItem, discountPercent: mid }) : it,
        );
        const testImp = testItems.reduce((s, i) => s + i.lineAmount, 0);
        if (testImp === target) { bestDisc = mid; break; }
        if (testImp > target) lo = mid;
        else hi = mid;
        if (testImp >= target && mid > bestDisc) bestDisc = mid;
      }
      if (bestDisc > newDiscount) {
        updatedItems = updatedItems.map((it, i) =>
          i === lastIdx ? recalcLineAmounts({ ...lastItem, discountPercent: bestDisc }) : it,
        );
      }
    }

    setEditItems(updatedItems);
    setShowImponibileDialog(false);
  };
```

- [ ] **Step 9.2: Aggiungere la modale Imponibile dialog nel render**

Trovare il blocco della confirm modal (attorno a riga 1380 – `{confirmModal && ...}`). Aggiungere subito **dopo** quella modale:

```tsx
      {/* Imponibile dialog */}
      {showImponibileDialog && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}
          onClick={() => setShowImponibileDialog(false)}
        >
          <div
            style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', maxWidth: '480px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Modifica Imponibile</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Nuovo imponibile target</label>
              <input
                autoComplete="off"
                autoFocus
                type="text"
                inputMode="decimal"
                value={imponibileTarget}
                onChange={(e) => setImponibileTarget(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                <input
                  autoComplete="off"
                  type="checkbox"
                  checked={imponibileSelectedItems.size === editItems.length}
                  onChange={(e) =>
                    setImponibileSelectedItems(
                      e.target.checked ? new Set(editItems.map((_, i) => i)) : new Set(),
                    )
                  }
                />
                Seleziona tutti
              </label>
              {editItems.map((item, idx) => (
                <label
                  key={idx}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', padding: '4px', borderBottom: '1px solid #f3f4f6', background: imponibileSelectedItems.has(idx) ? '#eff6ff' : 'transparent' }}
                >
                  <input
                    autoComplete="off"
                    type="checkbox"
                    checked={imponibileSelectedItems.has(idx)}
                    onChange={(e) => {
                      const next = new Set(imponibileSelectedItems);
                      if (e.target.checked) next.add(idx); else next.delete(idx);
                      setImponibileSelectedItems(next);
                    }}
                  />
                  {item.articleCode} – {formatCurrency(item.lineAmount)}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleImponibileViaSconto}
                disabled={imponibileSelectedItems.size === 0}
                style={{ flex: 1, padding: '10px', background: imponibileSelectedItems.size > 0 ? '#8b5cf6' : '#d1d5db', color: 'white', border: 'none', borderRadius: '6px', cursor: imponibileSelectedItems.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: '13px' }}
              >
                Via sconto
              </button>
              <button
                onClick={() => setShowImponibileDialog(false)}
                style={{ padding: '10px 16px', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 9.3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: nessun errore.

- [ ] **Step 9.4: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(edit-order): add imponibile dialog with via-sconto logic"
```

---

## Task 10: Frontend – Totale dialog + Maggiorazione panel

**Files:**
- Modify: `frontend/src/components/OrderCardNew.tsx`

- [ ] **Step 10.1: Aggiungere handler `handleTotaleCalcola`**

Aggiungere dopo `handleImponibileViaSconto` (prima di `handleCancelEdit`):

```ts
  const handleTotaleCalcola = () => {
    const target = parseFloat(totaleTarget.replace(',', '.'));
    if (isNaN(target) || target <= 0 || totaleSelectedItems.size === 0) return;

    if (target > editTotals.finalTotal) {
      // Target > current: check max achievable (no discount on selected)
      const unselSub = editItems.filter((_, i) => !totaleSelectedItems.has(i)).reduce((s, it) => s + it.lineAmount, 0);
      const unselVAT = editItems.filter((_, i) => !totaleSelectedItems.has(i)).reduce((s, it) => s + it.vatAmount, 0);
      const selItems = editItems.filter((_, i) => totaleSelectedItems.has(i));
      let maxSub = unselSub + selItems.reduce((s, it) => s + Math.round(it.unitPrice * it.quantity * 100) / 100, 0);
      let maxVAT = unselVAT + selItems.reduce((s, it) => s + Math.round(it.unitPrice * it.quantity * (it.vatPercent / 100) * 100) / 100, 0);
      const maxShipping = calculateShippingCosts(maxSub);
      const maxTotal = Math.round((maxSub + maxShipping.cost + maxVAT + maxShipping.tax) * 100) / 100;

      if (target > maxTotal) {
        const diff = target - editTotals.finalTotal;
        setMarkupAmount(diff);
        setMarkupArticleSelection(new Set(totaleSelectedItems));
        setShowMarkupPanel(true);
        setShowTotaleDialog(false);
        return;
      }
    }

    // Binary search for per-item discount
    const selItems = editItems.filter((_, i) => totaleSelectedItems.has(i));
    const unselSub = editItems.filter((_, i) => !totaleSelectedItems.has(i)).reduce((s, it) => s + it.lineAmount, 0);
    const unselVAT = editItems.filter((_, i) => !totaleSelectedItems.has(i)).reduce((s, it) => s + it.vatAmount, 0);
    const shipping = calculateShippingCosts(editTotals.itemsSubtotal);
    const fixedPortion = unselSub + unselVAT + shipping.cost + shipping.tax;
    const targetForSelected = target - fixedPortion;
    if (targetForSelected <= 0) {
      setError('Impossibile raggiungere il totale target con gli articoli selezionati');
      setShowTotaleDialog(false);
      return;
    }

    const computeDiscountedTotal = (disc: number) => {
      let testSub = 0; let testVAT = 0;
      for (const it of selItems) {
        const itemSub = Math.round(it.unitPrice * it.quantity * (1 - disc / 100) * 100) / 100;
        testSub += itemSub;
        testVAT += Math.round(itemSub * (it.vatPercent / 100) * 100) / 100;
      }
      return Math.round((testSub + testVAT + fixedPortion) * 100) / 100;
    };

    let low = 0; let high = 100; let bestDiscount = 0;
    for (let iter = 0; iter < 100; iter++) {
      const mid = (low + high) / 2;
      const testTotal = computeDiscountedTotal(mid);
      if (Math.abs(testTotal - target) < 0.005) { bestDiscount = mid; break; }
      if (testTotal > target) low = mid; else high = mid;
      bestDiscount = mid;
    }

    let finalDiscount = Math.floor(bestDiscount * 100) / 100;
    while (computeDiscountedTotal(finalDiscount) < target && finalDiscount > 0) {
      finalDiscount = Math.round((finalDiscount - 0.01) * 100) / 100;
    }
    const stepped = Math.round((finalDiscount + 0.01) * 100) / 100;
    if (computeDiscountedTotal(stepped) >= target) finalDiscount = stepped;

    setEditItems(prev =>
      prev.map((item, i) =>
        totaleSelectedItems.has(i)
          ? recalcLineAmounts({ ...item, discountPercent: finalDiscount })
          : item,
      ),
    );
    setShowTotaleDialog(false);
  };

  const handleApplyMarkup = () => {
    if (markupArticleSelection.size === 0) return;
    const targetTotal = editTotals.finalTotal + markupAmount;
    const selItems = editItems.filter((_, i) => markupArticleSelection.has(i));
    const selSub = selItems.reduce((s, it) => s + it.lineAmount, 0);
    const selVAT = selItems.reduce((s, it) => s + it.vatAmount, 0);
    const avgVatRate = selSub > 0 ? selVAT / selSub : 0.22;
    const netMarkup = markupAmount / (1 + avgVatRate);

    let updatedItems = editItems.map((item, i) => {
      if (!markupArticleSelection.has(i)) return item;
      const weight = selSub > 0 ? item.lineAmount / selSub : 1 / selItems.length;
      const itemMarkup = netMarkup * weight;
      const newUnitPrice = item.quantity > 0 ? item.unitPrice + itemMarkup / item.quantity : item.unitPrice;
      const roundedPrice = Math.round(newUnitPrice * 100) / 100;
      return recalcLineAmounts({ ...item, unitPrice: roundedPrice });
    });

    const computeTotal = (items: typeof editItems) => {
      const sub = items.reduce((s, i) => s + i.lineAmount, 0);
      const sh = calculateShippingCosts(sub);
      const vat = items.reduce((s, i) => s + i.vatAmount, 0);
      return Math.round((sub + sh.cost + vat + sh.tax) * 100) / 100;
    };

    let actualTotal = computeTotal(updatedItems);
    if (actualTotal < targetTotal) {
      const sorted = updatedItems.map((it, idx) => ({ it, idx }))
        .filter(({ idx }) => markupArticleSelection.has(idx))
        .sort((a, b) => a.it.quantity - b.it.quantity);
      for (const { idx } of sorted) {
        if (actualTotal >= targetTotal) break;
        const item = updatedItems[idx];
        updatedItems = updatedItems.map((it, i) =>
          i === idx ? recalcLineAmounts({ ...item, unitPrice: Math.round((item.unitPrice + 0.01) * 100) / 100 }) : it,
        );
        actualTotal = computeTotal(updatedItems);
      }
    }

    setEditItems(updatedItems);
    setShowMarkupPanel(false);
  };
```

- [ ] **Step 10.2: Aggiungere il Totale dialog + Maggiorazione panel nel render**

Subito dopo il blocco Imponibile dialog (Task 9), aggiungere:

```tsx
      {/* Totale dialog */}
      {showTotaleDialog && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}
          onClick={() => setShowTotaleDialog(false)}
        >
          <div
            style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', maxWidth: '480px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Modifica Totale (con IVA)</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Nuovo totale target (con IVA)</label>
              <input
                autoComplete="off"
                autoFocus
                type="text"
                inputMode="decimal"
                value={totaleTarget}
                onChange={(e) => setTotaleTarget(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                <input
                  autoComplete="off"
                  type="checkbox"
                  checked={totaleSelectedItems.size === editItems.length}
                  onChange={(e) =>
                    setTotaleSelectedItems(
                      e.target.checked ? new Set(editItems.map((_, i) => i)) : new Set(),
                    )
                  }
                />
                Seleziona tutti
              </label>
              {editItems.map((item, idx) => (
                <label
                  key={idx}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', padding: '4px', borderBottom: '1px solid #f3f4f6', background: totaleSelectedItems.has(idx) ? '#eff6ff' : 'transparent' }}
                >
                  <input
                    autoComplete="off"
                    type="checkbox"
                    checked={totaleSelectedItems.has(idx)}
                    onChange={(e) => {
                      const next = new Set(totaleSelectedItems);
                      if (e.target.checked) next.add(idx); else next.delete(idx);
                      setTotaleSelectedItems(next);
                    }}
                  />
                  {item.articleCode} – {formatCurrency(item.lineTotalWithVat)}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleTotaleCalcola}
                disabled={totaleSelectedItems.size === 0}
                style={{ flex: 1, padding: '10px', background: totaleSelectedItems.size > 0 ? '#3b82f6' : '#d1d5db', color: 'white', border: 'none', borderRadius: '6px', cursor: totaleSelectedItems.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: '13px' }}
              >
                Calcola
              </button>
              <button
                onClick={() => setShowTotaleDialog(false)}
                style={{ padding: '10px 16px', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maggiorazione panel */}
      {showMarkupPanel && (
        <div style={{ marginTop: '16px', padding: '16px', background: '#fffbeb', borderRadius: '8px', border: '2px solid #f59e0b' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#92400e' }}>
            Maggiorazione: +{formatCurrency(markupAmount)}
          </h4>
          <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#78350f' }}>
            Il totale desiderato è superiore al massimo. Seleziona gli articoli su cui distribuire la maggiorazione:
          </p>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#92400e' }}>
              <input
                autoComplete="off"
                type="checkbox"
                checked={markupArticleSelection.size === editItems.length}
                onChange={(e) =>
                  setMarkupArticleSelection(
                    e.target.checked ? new Set(editItems.map((_, i) => i)) : new Set(),
                  )
                }
              />
              Tutti gli articoli
            </label>
            {editItems.map((item, idx) => (
              <label
                key={idx}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', padding: '3px 4px', borderBottom: '1px solid #fef3c7', background: markupArticleSelection.has(idx) ? '#fef9c3' : 'transparent' }}
              >
                <input
                  autoComplete="off"
                  type="checkbox"
                  checked={markupArticleSelection.has(idx)}
                  onChange={(e) => {
                    const next = new Set(markupArticleSelection);
                    if (e.target.checked) next.add(idx); else next.delete(idx);
                    setMarkupArticleSelection(next);
                  }}
                />
                {item.articleCode} – {formatCurrency(item.unitPrice)}/pz
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleApplyMarkup}
              disabled={markupArticleSelection.size === 0}
              style={{ flex: 1, padding: '10px', background: markupArticleSelection.size > 0 ? '#f59e0b' : '#d1d5db', color: 'white', border: 'none', borderRadius: '6px', cursor: markupArticleSelection.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: '13px' }}
            >
              Applica Maggiorazione
            </button>
            <button
              onClick={() => setShowMarkupPanel(false)}
              style={{ padding: '10px 16px', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 10.3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: nessun errore.

- [ ] **Step 10.4: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(edit-order): add totale dialog and maggiorazione panel"
```

---

## Task 11: Frontend – aggiungere `notes` al payload di `handleConfirmEdit`

**Files:**
- Modify: `frontend/src/components/OrderCardNew.tsx`

> Il payload viene inviato in `handleConfirmEdit` (riga ~1228), non in `handleSaveClick`.

- [ ] **Step 11.1: Aggiungere `notes` al payload `enqueueOperation`**

Trovare il blocco `enqueueOperation('edit-order', {` (riga ~1228). Aggiungere il campo notes:

Prima:
```ts
      const result = await enqueueOperation('edit-order', {
        orderId,
        modifications,
        updatedItems: editItems,
      });
```

Dopo:
```ts
      const result = await enqueueOperation('edit-order', {
        orderId,
        modifications,
        updatedItems: editItems,
        notes: editNotes,  // sempre inviato (anche "" per cancellare)
      });
```

- [ ] **Step 11.2: Type-check frontend completo**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: nessun errore.

- [ ] **Step 11.3: Eseguire test frontend completi**

```bash
npm test --prefix archibald-web-app/frontend
```
Expected: tutti i test PASS.

- [ ] **Step 11.4: Commit finale**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(edit-order): send notes in edit payload to backend"
```

---

## Riepilogo verifica post-implementazione

- [ ] `npm run build --prefix archibald-web-app/backend` → nessun errore
- [ ] `npm run type-check --prefix archibald-web-app/frontend` → nessun errore
- [ ] `npm test --prefix archibald-web-app/backend` → tutti i test PASS
- [ ] `npm test --prefix archibald-web-app/frontend` → tutti i test PASS
- [ ] ⚠️ E2E test in produzione post-deploy per Task 6 (bot notes)

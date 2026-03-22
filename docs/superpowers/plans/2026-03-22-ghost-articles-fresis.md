# Ghost Articles nelle FT Fresis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere l'inserimento di articoli non presenti in `shared.products` negli ordini FT Fresis con sottocliente, trattandoli come articoli warehouse (non inviati al bot Archibald, salvati solo nello storico FT).

**Architecture:** Si aggiunge il flag `isGhostArticle` al tipo `PendingOrderItem` e `SubmitOrderItem`. Nel submit-order handler, gli articoli ghost ricevono `warehouse_quantity = quantity` (meccanismo esistente per saltarli nel bot) e `is_ghost = true` in DB. Una nuova modale consente all'utente di inserire questi articoli cercando nello storico FT o manualmente. Una nuova funzione di repository aggrega lo storico JSONB per suggerire articoli già visti nelle FT passate.

**Tech Stack:** TypeScript strict, Express, PostgreSQL, React 19, Vitest, supertest

**Spec:** `docs/superpowers/specs/2026-03-22-ghost-articles-fresis-design.md`

---

## File Structure

```
BACKEND — NEW
archibald-web-app/backend/src/
  db/migrations/030-ghost-articles.sql          ← colonna is_ghost su order_articles

BACKEND — MODIFIED
  db/repositories/orders.ts                      ← fix getOrdersNeedingArticleSync
  db/repositories/fresis-history.ts              ← nuova getGhostArticleSuggestions
  routes/fresis-history.ts                       ← nuovo GET /ghost-articles, arca filter
  server.ts                                      ← wire-up getGhostArticleSuggestions
  operations/handlers/submit-order.ts            ← ghost-only path, is_ghost nel INSERT
  operations/handlers/send-to-verona.ts          ← guard ghost + arca filter ordini misti

FRONTEND — MODIFIED
  src/types/pending-order.ts                     ← isGhostArticle, ghostArticleSource
  src/api/fresis-history.ts                      ← metodo getGhostArticles
  src/utils/orderStatus.ts                       ← isNotSentToVerona guard ghost-
  src/components/OrderFormSimple.tsx             ← trigger "Inserisci come non catalogato"

FRONTEND — NEW
  src/components/GhostArticleModal.tsx           ← modale Tab 1 (storico) + Tab 2 (manuale)
```

---

## Task 1: Migrazione DB — colonna `is_ghost`

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/030-ghost-articles.sql`

- [ ] **Step 1: Crea il file di migrazione**

```sql
-- 030-ghost-articles.sql
ALTER TABLE agents.order_articles
  ADD COLUMN IF NOT EXISTS is_ghost BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: Avvia l'app backend per applicare la migrazione**

Il migration runner viene eseguito automaticamente all'avvio del backend. In alternativa:

```bash
cd archibald-web-app/backend && npm run build && node -e "
const { createPool } = require('./dist/db/pool');
const { runMigrations, loadMigrationFiles } = require('./dist/db/migrate');
const path = require('path');
const pool = createPool();
loadMigrationFiles(path.join(__dirname, 'src/db/migrations'))
  .then(m => runMigrations(pool, m))
  .then(r => { console.log(r); pool.end(); });
"
```

Expected: `{ applied: ['030-ghost-articles.sql'], skipped: [...] }`

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/030-ghost-articles.sql
git commit -m "feat(db): add is_ghost column to order_articles"
```

---

## Task 2: Fix `getOrdersNeedingArticleSync`

Senza questo fix, gli ordini ghost-only (e warehouse-only preesistenti) vengono riaccodati dallo scheduler ogni giorno/settimana anche se non hanno articoli su Archibald ERP.

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/orders.ts`
- Test: `archibald-web-app/backend/src/db/repositories/orders.spec.ts`

- [ ] **Step 1: Scrivi il test che verifica che ordini Warehouse siano esclusi**

Nel file `orders.spec.ts`, aggiungi un test nel describe esistente per `getOrdersNeedingArticleSync` (o creane uno nuovo). Cerca nel file il modo in cui è mockato il pool — il pattern è `mockPool.query.mockResolvedValueOnce(...)`.

```typescript
describe('getOrdersNeedingArticleSync', () => {
  it('excludes orders with order_type Warehouse', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    await getOrdersNeedingArticleSync(mockPool, 'user1', 10);
    const sql: string = mockPool.query.mock.calls[0][0];
    expect(sql).toContain("order_type != 'Warehouse'");
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose orders.spec
```

Expected: FAIL — il test controlla una condizione non ancora presente nella query.

- [ ] **Step 3: Trova la query e modificala**

Apri `orders.ts` e cerca `getOrdersNeedingArticleSync`. La query ha questo pattern (righe ~1170-1192):

```sql
SELECT id FROM agents.order_records
 WHERE user_id = $1
   AND order_number NOT LIKE 'NC/%'
   AND (
     articles_synced_at IS NULL
     OR (current_state NOT IN (...) AND articles_synced_at::timestamptz < NOW() - INTERVAL '1 day')
     OR articles_synced_at::timestamptz < NOW() - INTERVAL '7 days'
   )
```

Aggiungi `AND order_type != 'Warehouse'` come condizione esterna, **prima** della clausola `AND (...)`:

```sql
SELECT id FROM agents.order_records
 WHERE user_id = $1
   AND order_number NOT LIKE 'NC/%'
   AND order_type != 'Warehouse'
   AND (
     articles_synced_at IS NULL
     OR (current_state NOT IN (...) AND articles_synced_at::timestamptz < NOW() - INTERVAL '1 day')
     OR articles_synced_at::timestamptz < NOW() - INTERVAL '7 days'
   )
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose orders.spec
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/orders.ts archibald-web-app/backend/src/db/repositories/orders.spec.ts
git commit -m "fix(sync): exclude Warehouse orders from article sync scheduler"
```

---

## Task 3: Repository — `getGhostArticleSuggestions`

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/fresis-history.ts`
- Test: `archibald-web-app/backend/src/db/repositories/fresis-history.spec.ts`

- [ ] **Step 1: Aggiungi il tipo di ritorno al repository**

In `fresis-history.ts`, aggiungi il tipo prima della funzione:

```typescript
export type GhostArticleSuggestion = {
  articleCode: string;
  description: string;
  price: number;
  discount: number;
  vat: number;
  occurrences: number;
};
```

- [ ] **Step 2: Scrivi il test**

In `fresis-history.spec.ts`, aggiungi in fondo:

```typescript
describe('getGhostArticleSuggestions', () => {
  it('returns ghost article suggestions from FT history excluding shared.products codes', async () => {
    const ghostCode = 'GHOST001';
    const catalogCode = 'CATALOG001';
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            article_code: ghostCode,
            description: 'Articolo fantasma',
            price: 10.5,
            discount: 0,
            vat: 22,
            occurrences: 3,
          },
        ],
      });

    const result = await getGhostArticleSuggestions(mockPool, 'user1');

    expect(result).toEqual([
      {
        articleCode: ghostCode,
        description: 'Articolo fantasma',
        price: 10.5,
        discount: 0,
        vat: 22,
        occurrences: 3,
      },
    ]);
    const sql: string = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('shared.products');
    expect(sql).toContain('jsonb_array_elements');
  });
});
```

- [ ] **Step 3: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose fresis-history.spec
```

Expected: FAIL — funzione non definita.

- [ ] **Step 4: Implementa la funzione**

In `fresis-history.ts`, aggiungi la funzione e aggiungila agli export:

```typescript
export async function getGhostArticleSuggestions(
  pool: DbPool,
  userId: string,
): Promise<GhostArticleSuggestion[]> {
  const result = await pool.query<{
    article_code: string;
    description: string;
    price: number;
    discount: number;
    vat: number;
    occurrences: number;
  }>(
    `
    WITH ranked_items AS (
      SELECT
        item->>'articleCode' AS article_code,
        item->>'description' AS description,
        (item->>'price')::float AS price,
        COALESCE((item->>'discount')::float, 0) AS discount,
        COALESCE((item->>'vat')::int, 0) AS vat,
        fh.created_at,
        COUNT(*) OVER (PARTITION BY item->>'articleCode') AS occurrences,
        ROW_NUMBER() OVER (
          PARTITION BY item->>'articleCode'
          ORDER BY fh.created_at DESC
        ) AS rn
      FROM agents.fresis_history fh,
           jsonb_array_elements(fh.items) AS item
      WHERE fh.user_id = $1
        AND (item->>'articleCode') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM shared.products p
          WHERE p.id = item->>'articleCode'
        )
    )
    SELECT
      article_code,
      description,
      price,
      discount,
      vat,
      occurrences::int
    FROM ranked_items
    WHERE rn = 1
    ORDER BY occurrences DESC, article_code
    `,
    [userId],
  );
  return result.rows.map((row) => ({
    articleCode: row.article_code,
    description: row.description ?? '',
    price: row.price ?? 0,
    discount: row.discount ?? 0,
    vat: row.vat ?? 0,
    occurrences: row.occurrences,
  }));
}
```

- [ ] **Step 5: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose fresis-history.spec
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/fresis-history.ts archibald-web-app/backend/src/db/repositories/fresis-history.spec.ts
git commit -m "feat(fresis): add getGhostArticleSuggestions repository function"
```

---

## Task 4: Endpoint `GET /api/fresis-history/ghost-articles`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/fresis-history.ts`
- Modify: `archibald-web-app/backend/src/server.ts`
- Test: `archibald-web-app/backend/src/routes/fresis-history.spec.ts`

- [ ] **Step 1: Scrivi il test di integrazione**

In `fresis-history.spec.ts`, aggiungi il test nell'area degli altri test GET. Segui il pattern esistente per mockare le deps:

```typescript
describe('GET /ghost-articles', () => {
  it('returns ghost article suggestions for authenticated user', async () => {
    const suggestions = [
      { articleCode: 'GHOST001', description: 'Test', price: 10, discount: 0, vat: 22, occurrences: 2 },
    ];
    mockDeps.getGhostArticleSuggestions.mockResolvedValueOnce(suggestions);

    const res = await request(app)
      .get('/ghost-articles')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, suggestions });
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose routes/fresis-history.spec
```

Expected: FAIL — 404 Not Found.

- [ ] **Step 3: Aggiungi `getGhostArticleSuggestions` a `FresisHistoryRouterDeps`**

In `fresis-history.ts` (backend/src/routes/), aggiungi al tipo `FresisHistoryRouterDeps`:

```typescript
getGhostArticleSuggestions: (userId: string) => Promise<GhostArticleSuggestion[]>;
```

Assicurati di importare `GhostArticleSuggestion` da `../../db/repositories/fresis-history`.

- [ ] **Step 4: Aggiungi il route PRIMA del route `/:id`**

Trova il route `router.get('/:id', ...)` (riga ~347) e aggiungi questo SOPRA:

```typescript
router.get('/ghost-articles', async (req: AuthRequest, res) => {
  try {
    const suggestions = await getGhostArticleSuggestions(req.user!.userId);
    res.json({ success: true, suggestions });
  } catch (error) {
    logger.error('Error fetching ghost article suggestions', { error });
    res.status(500).json({ success: false, error: 'Errore nel recupero articoli non catalogati' });
  }
});
```

Nota: `getGhostArticleSuggestions` è destrutturato dai deps nella funzione `createFresisHistoryRouter`.

- [ ] **Step 5: Wire-up in `server.ts`**

Trova il blocco `createFresisHistoryRouter({...})` (righe ~568-615) e aggiungi:

```typescript
getGhostArticleSuggestions: (userId) => fresisHistoryRepo.getGhostArticleSuggestions(pool, userId),
```

- [ ] **Step 6: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose routes/fresis-history.spec
```

Expected: PASS

- [ ] **Step 7: Verifica build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: compilazione senza errori.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/routes/fresis-history.ts archibald-web-app/backend/src/server.ts archibald-web-app/backend/src/routes/fresis-history.spec.ts
git commit -m "feat(api): add GET /fresis-history/ghost-articles endpoint"
```

---

## Task 5: Guard e filtro ArcaPro in `send-to-verona.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/send-to-verona.ts`
- Test: `archibald-web-app/backend/src/operations/handlers/send-to-verona.spec.ts` (se esiste, altrimenti crea)

- [ ] **Step 1: Scrivi i test**

Cerca il file di test esistente per send-to-verona. Se non esiste, crealo. Aggiungi:

```typescript
describe('handleSendToVerona', () => {
  it('returns early for ghost- orders without calling bot', async () => {
    const mockBot = { sendOrderToVerona: vi.fn(), setProgressCallback: vi.fn() };
    const result = await handleSendToVerona(
      { orderId: 'ghost-1742659200000' },
      mockBot as any,
      mockPool,
    );
    expect(result.success).toBe(false);
    expect(mockBot.sendOrderToVerona).not.toHaveBeenCalled();
  });

  it('filters ghost items from arca_data generation for mixed orders', async () => {
    // Verifica che generateArcaData NON riceva items con isGhostArticle=true
    // Adatta mockDeps/mockPool al pattern esistente nel file di test
    const mockGenerateArcaData = vi.fn().mockReturnValue(Buffer.from(''));
    // ... setup ordine misto con 1 item normale + 1 ghost ...
    // ... chiama handleSendToVerona con ordine misto ...
    // Verifica che generateArcaData sia stata chiamata solo con item normali:
    const callArgs = mockGenerateArcaData.mock.calls[0];
    const itemsPassedToArcaData: Array<{ isGhostArticle?: boolean }> = callArgs[0].items;
    expect(itemsPassedToArcaData.every((i) => !i.isGhostArticle)).toBe(true);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose send-to-verona.spec
```

- [ ] **Step 3: Aggiungi il guard ghost all'inizio del handler**

In `send-to-verona.ts`, aggiungi come **prima istruzione** dentro `handleSendToVerona`, prima di `bot.setProgressCallback`:

```typescript
if (data.orderId.startsWith('ghost-')) {
  return { success: false, message: 'Ordine ghost: nessun ordine Archibald da inviare', sentToMilanoAt: '' };
}
```

- [ ] **Step 4: Aggiungi il filtro ghost items per `generateArcaData`**

Nel punto dove `row.items` viene passato a `generateArcaData`, aggiungi il cast e il filtro:

```typescript
type GenerateItemWithGhost = GenerateInput['items'][number] & { isGhostArticle?: boolean };
const exportItems = (row.items as GenerateItemWithGhost[])
  .filter((i) => !i.isGhostArticle) as GenerateInput['items'];
// Poi usa exportItems al posto di row.items nella chiamata a generateArcaData
```

- [ ] **Step 5: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose send-to-verona.spec
```

Expected: PASS

- [ ] **Step 6: Verifica build**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/send-to-verona.ts
git commit -m "fix(send-to-verona): guard ghost orders and filter ghost items from arca export"
```

---

## Task 6: Filtro ArcaPro nel path `generateFtNow` di `fresis-history.ts` route

**Files:**
- Modify: `archibald-web-app/backend/src/routes/fresis-history.ts`

- [ ] **Step 1: Trova il blocco `generateFtNow` (righe ~312-334)**

Cerca `generateFtNow` in `fresis-history.ts` (routes). Troverai qualcosa del tipo:

```typescript
if (generateFtNow) {
  // ...
  const input: GenerateInput = {
    // ...
    items: (record.items as GenerateInput['items']),
    // ...
  };
  const arcaData = generateArcaData(input, ftNumber, esercizio);
```

- [ ] **Step 2: Aggiungi import tipo e filtro**

Aggiungi in cima alla funzione/blocco, **prima** di costruire `input`:

```typescript
type GenerateItemWithGhost = GenerateInput['items'][number] & { isGhostArticle?: boolean };
const exportItems = (record.items as GenerateItemWithGhost[])
  .filter((i) => !i.isGhostArticle) as GenerateInput['items'];
```

Poi usa `exportItems` nella costruzione di `input`:

```typescript
const input: GenerateInput = {
  // ...
  items: exportItems,  // invece di: (record.items as GenerateInput['items'])
  // ...
};
```

- [ ] **Step 3: Verifica build**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: compilazione senza errori.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/routes/fresis-history.ts
git commit -m "fix(fresis): filter ghost items from arca export in generateFtNow path"
```

---

## Task 7: Handler `submit-order.ts` — ghost-only path

Questo è il task più complesso. Aggiunge `isGhostArticle` al tipo `SubmitOrderItem`, implementa il path ghost-only che bypassa il bot, e aggiunge `is_ghost` all'INSERT su `order_articles`.

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts`
- Test: `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts`

- [ ] **Step 1: Aggiungi `isGhostArticle` a `SubmitOrderItem` (righe 18-30)**

```typescript
type SubmitOrderItem = {
  articleCode: string;
  productName?: string;
  description?: string;
  quantity: number;
  price: number;
  discount?: number;
  vat?: number;
  articleId?: string;
  packageContent?: number;
  warehouseQuantity?: number;
  warehouseSources?: Array<{ warehouseItemId: number; boxName: string; quantity: number }>;
  isGhostArticle?: boolean;  // ← AGGIUNTO
};
```

- [ ] **Step 2: Scrivi i test per il ghost-only path**

In `submit-order.spec.ts`, aggiungi (adatta al pattern mockPool/mockBot esistente):

```typescript
describe('ghost-only orders', () => {
  it('does not call bot.createOrder when all items are ghost', async () => {
    const ghostItems = [
      {
        articleCode: 'GHOST001',
        description: 'Articolo fantasma',
        quantity: 2,
        price: 10,
        discount: 0,
        vat: 22,
        isGhostArticle: true,
        warehouseQuantity: 2,
        warehouseSources: [],
      },
    ];
    // Setup mockPool per rispondere alle query (customer query, insert order_records, ecc.)
    // Il pattern esatto dipende da come è strutturato il test file esistente

    const result = await handleSubmitOrder(
      { items: ghostItems, customerId: '55261', pendingOrderId: 'pending-1' },
      mockBot,
      mockPool,
    );

    expect(mockBot.createOrder).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('saves ghost items with is_ghost=true and warehouse_quantity=quantity', async () => {
    // Verifica che il INSERT su order_articles includa is_ghost=true per articoli ghost
    // e warehouse_quantity = quantity totale
    const ghostItem = {
      articleCode: 'GHOST001',
      quantity: 3,
      price: 5,
      vat: 22,
      isGhostArticle: true,
      warehouseQuantity: 3,
      warehouseSources: [],
    };
    // ... setup mocks ...
    await handleSubmitOrder({ items: [ghostItem], ... }, mockBot, mockPool);

    // Trova la chiamata INSERT su order_articles
    const insertCall = mockPool.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_articles')
    );
    expect(insertCall).toBeDefined();
    // I parametri dell'INSERT devono includere is_ghost=true
    const params = insertCall![1] as unknown[];
    // is_ghost è il 15° parametro per ogni item (indice 14 nel flat array)
    expect(params[14]).toBe(true);
  });
});
```

- [ ] **Step 3: Esegui i test per verificare che falliscono**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose submit-order.spec
```

- [ ] **Step 4: Aggiungi il rilevamento `isGhostOnly` all'inizio di `handleSubmitOrder`**

All'inizio della funzione, dopo che `items` è disponibile (prima di qualsiasi altra operazione):

```typescript
const isGhostOnly = items.length > 0 && items.every((i) => i.isGhostArticle);
```

- [ ] **Step 5: Aggiorna `isWarehouseOnly` per includere ghost**

Trova dove viene definito `isWarehouseOnly` (riga ~268) e aggiorna:

```typescript
const isWarehouseOnly = orderId.startsWith('warehouse-') || orderId.startsWith('ghost-');
```

- [ ] **Step 6: Implementa il path ghost-only**

Dopo la customer query (ma prima del check `isCustomerComplete`), aggiungi il branch per ghost-only. La sequenza da implementare:

```typescript
// Dopo la query cliente (che esegui sempre per effectiveCustomerName):
if (isGhostOnly) {
  // 1. Salta isCustomerComplete check
  // 2. Genera orderId sintetico
  const orderId = `ghost-${Date.now()}`;
  const isWarehouseOnly = true; // ghost-only è sempre warehouse-only

  // 3. Salta pre-retry cleanup, setProgressCallback, enrichment, bot.createOrder
  // 4. Vai direttamente al salvataggio in DB con questo orderId
  // (La logica di salvataggio è condivisa con il path normale che segue)
}
```

Il modo più pulito è fare un early-branch: se `isGhostOnly`, generate l'orderId sintetico e poi vai direttamente alla sezione di INSERT (saltando tutto il blocco bot). Guarda il codice esistente per capire come è strutturato — molto probabilmente userai un `if/else` o un `goto` con label (non disponibile in TS) — quindi il pattern migliore è estrarre la logica di salvataggio in una variabile o usare un flag:

```typescript
let orderId: string;
if (isGhostOnly) {
  // salta bot, genera ID sintetico
  orderId = `ghost-${Date.now()}`;
} else {
  // path normale: pre-retry cleanup, bot.setProgressCallback, bot.createOrder, ecc.
  // ... codice esistente ...
  orderId = await bot.createOrder(...);
}

const isWarehouseOnly = orderId.startsWith('warehouse-') || orderId.startsWith('ghost-');
```

- [ ] **Step 7: Aggiungi `is_ghost` all'INSERT su `order_articles`**

Trova la query INSERT (righe ~348-355) con le 14 colonne. Modifica per aggiungere la 15ª:

```sql
INSERT INTO agents.order_articles (
  order_id, user_id, article_code, article_description, quantity,
  unit_price, discount_percent, line_amount, warehouse_quantity, warehouse_sources_json, created_at,
  vat_percent, vat_amount, line_total_with_vat, is_ghost
) VALUES ${articlePlaceholders.join(', ')}
```

Per ogni item, aggiungi il 15° parametro: `!!item.isGhostArticle`.

Per gli articoli ghost, assicurati anche che:
- `warehouse_quantity = item.quantity` (non `item.warehouseQuantity ?? 0`)
- `warehouse_sources_json = '[]'`

- [ ] **Step 8: Aggiungi `articles_synced_at = NOW()` per ghost-only nell'INSERT `order_records`**

Nel blocco `isWarehouseOnly`, trova dove viene costruito l'INSERT su `order_records` e assicurati che includa `articles_synced_at = NOW()` quando l'ordine è ghost-only. Il path `isWarehouseOnly` già gestisce la maggior parte di questo — verifica che `articles_synced_at` sia incluso.

- [ ] **Step 9: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose submit-order.spec
```

Expected: PASS

- [ ] **Step 10: Verifica build**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 11: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts
git commit -m "feat(submit-order): implement ghost-only path, add is_ghost to order_articles INSERT"
```

---

## Task 8: Frontend — tipi

**Files:**
- Modify: `archibald-web-app/frontend/src/types/pending-order.ts`

- [ ] **Step 1: Aggiungi i campi a `PendingOrderItem`**

Il tipo attuale (righe ~16-32) è un'interface. Aggiungi:

```typescript
export interface PendingOrderItem {
  articleCode: string;
  articleId?: string;
  productName?: string;
  description?: string;
  quantity: number;
  price: number;
  vat: number;
  discount?: number;
  originalListPrice?: number;
  warehouseQuantity?: number;
  warehouseSources?: Array<{
    warehouseItemId: number;
    boxName: string;
    quantity: number;
  }>;
  isGhostArticle?: boolean;           // ← AGGIUNTO: articolo non in shared.products
  ghostArticleSource?: 'history' | 'manual';  // ← AGGIUNTO: solo in-memory frontend
}
```

- [ ] **Step 2: Verifica type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/types/pending-order.ts
git commit -m "feat(types): add isGhostArticle and ghostArticleSource to PendingOrderItem"
```

---

## Task 9: Frontend — API `getGhostArticles`

**Files:**
- Modify: `archibald-web-app/frontend/src/api/fresis-history.ts`

- [ ] **Step 1: Aggiungi il tipo e la funzione API**

In `fresis-history.ts`, aggiungi il tipo e la funzione in fondo al file:

```typescript
export type GhostArticleSuggestion = {
  articleCode: string;
  description: string;
  price: number;
  discount: number;
  vat: number;
  occurrences: number;
};

export async function getGhostArticles(): Promise<GhostArticleSuggestion[]> {
  const response = await fetchWithRetry(`${API_BASE}/api/fresis-history/ghost-articles`);
  if (!response.ok) {
    throw new Error(`Error fetching ghost articles: ${response.status}`);
  }
  const data = await response.json();
  return data.suggestions as GhostArticleSuggestion[];
}
```

- [ ] **Step 2: Verifica type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/api/fresis-history.ts
git commit -m "feat(api): add getGhostArticles frontend API method"
```

---

## Task 10: Frontend — fix `isNotSentToVerona`

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/orderStatus.ts`

- [ ] **Step 1: Aggiorna la funzione**

La funzione attuale (righe ~179-181):

```typescript
export function isNotSentToVerona(order: Order): boolean {
  return order.transferStatus?.toLowerCase() === "modifica";
}
```

Aggiungi il guard esplicito per ghost orders:

```typescript
export function isNotSentToVerona(order: Order): boolean {
  if (order.id?.startsWith('ghost-')) return false;
  return order.transferStatus?.toLowerCase() === "modifica";
}
```

- [ ] **Step 2: Verifica type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/utils/orderStatus.ts
git commit -m "fix(orders): disable send-to-verona for ghost orders"
```

---

## Task 11: Frontend — componente `GhostArticleModal`

**Files:**
- Create: `archibald-web-app/frontend/src/components/GhostArticleModal.tsx`

- [ ] **Step 1: Crea il componente**

Il componente riceve una callback `onConfirm(item: PendingOrderItem)` e `onClose`. Ha due tab: storico FT e inserimento manuale.

```tsx
import { useState, useEffect } from 'react';
import type { PendingOrderItem } from '../types/pending-order';
import { getGhostArticles, type GhostArticleSuggestion } from '../api/fresis-history';

type GhostArticleModalProps = {
  onConfirm: (item: PendingOrderItem) => void;
  onClose: () => void;
};

export function GhostArticleModal({ onConfirm, onClose }: GhostArticleModalProps) {
  const [activeTab, setActiveTab] = useState<'history' | 'manual'>('history');
  const [suggestions, setSuggestions] = useState<GhostArticleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state (usato da entrambi i tab)
  const [articleCode, setArticleCode] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [vat, setVat] = useState<number | ''>('');
  const [vatError, setVatError] = useState('');
  const [codeWarning, setCodeWarning] = useState('');

  useEffect(() => {
    setLoading(true);
    getGhostArticles()
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, []);

  function selectSuggestion(s: GhostArticleSuggestion) {
    setArticleCode(s.articleCode);
    setDescription(s.description);
    setPrice(s.price);
    setDiscount(s.discount);
    setVat(s.vat);
    setQuantity(1);
    setVatError('');
  }

  function handleConfirm() {
    const vatNum = typeof vat === 'number' ? vat : parseInt(String(vat), 10);
    if (!articleCode.trim()) return;
    if (!Number.isInteger(vatNum) || vatNum < 0) {
      setVatError('IVA obbligatoria (es. 4, 10, 22)');
      return;
    }
    const item: PendingOrderItem = {
      articleCode: articleCode.trim(),
      description: description.trim(),
      quantity,
      price,
      discount,
      vat: vatNum,
      isGhostArticle: true,
      ghostArticleSource: activeTab,
      warehouseQuantity: quantity,
      warehouseSources: [],
    };
    onConfirm(item);
  }

  const tabStyle = (tab: 'history' | 'manual') => ({
    padding: '0.5rem 1rem',
    cursor: 'pointer' as const,
    borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
    fontWeight: activeTab === tab ? 600 : 400,
    color: activeTab === tab ? '#3b82f6' : '#6b7280',
    background: 'none',
    border: 'none',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: '#fff', borderRadius: '0.75rem', padding: '1.5rem',
        width: '90%', maxWidth: '560px', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', gap: '1rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Articolo non catalogato</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          <button style={tabStyle('history')} onClick={() => setActiveTab('history')}>Dallo storico FT</button>
          <button style={tabStyle('manual')} onClick={() => setActiveTab('manual')}>Inserimento manuale</button>
        </div>

        {/* Tab 1 — Storico */}
        {activeTab === 'history' && (
          <div style={{ overflowY: 'auto', maxHeight: '200px', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
            {loading && <p style={{ padding: '0.75rem', color: '#6b7280' }}>Caricamento...</p>}
            {!loading && suggestions.length === 0 && (
              <p style={{ padding: '0.75rem', color: '#6b7280' }}>Nessun articolo non catalogato trovato nello storico.</p>
            )}
            {suggestions.map((s) => (
              <div
                key={s.articleCode}
                onClick={() => selectSuggestion(s)}
                style={{
                  padding: '0.625rem 0.75rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  background: articleCode === s.articleCode ? '#eff6ff' : 'transparent',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.articleCode}</span>
                {' — '}
                <span style={{ color: '#374151', fontSize: '0.875rem' }}>{s.description}</span>
                <span style={{ float: 'right', color: '#6b7280', fontSize: '0.75rem' }}>×{s.occurrences}</span>
              </div>
            ))}
          </div>
        )}

        {/* Form condiviso */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Codice articolo *
              <input
                value={articleCode}
                onChange={(e) => setArticleCode(e.target.value)}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Quantità
              <input
                type="number" min={1} value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            Descrizione
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Prezzo
              <input
                type="number" min={0} step={0.01} value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Sconto %
              <input
                type="number" min={0} max={100} value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              IVA % *
              <input
                type="number" min={0} value={vat}
                onChange={(e) => { setVat(parseInt(e.target.value) || ''); setVatError(''); }}
                style={{
                  padding: '0.375rem 0.5rem',
                  border: `1px solid ${vatError ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '0.375rem',
                }}
              />
              {vatError && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{vatError}</span>}
            </label>
          </div>
        </div>

        {/* Bottoni */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            onClick={onClose}
            style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer', background: '#fff' }}
          >
            Annulla
          </button>
          <button
            onClick={handleConfirm}
            disabled={!articleCode.trim() || vat === ''}
            style={{
              padding: '0.5rem 1rem', border: 'none', borderRadius: '0.375rem',
              cursor: 'pointer', background: '#3b82f6', color: '#fff', fontWeight: 600,
            }}
          >
            Inserisci articolo
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/GhostArticleModal.tsx
git commit -m "feat(ui): add GhostArticleModal component for uncatalogued articles"
```

---

## Task 12: Trigger in `OrderFormSimple.tsx`

Il trigger "Inserisci come articolo non catalogato" deve comparire quando:
1. L'utente ha digitato una ricerca (`productSearch.length > 0`)
2. La ricerca è completata (`!searchingProduct`)
3. Non ci sono risultati (`productResults.length === 0`)
4. L'ordine è una FT Fresis con sottocliente selezionato

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

- [ ] **Step 1: Aggiungi lo stato per la modale ghost**

Cerca dove sono dichiarati gli altri `useState` (righe ~100-200). Aggiungi:

```typescript
const [showGhostModal, setShowGhostModal] = useState(false);
```

- [ ] **Step 2: Importa la modale**

In cima al file, aggiungi:

```typescript
import { GhostArticleModal } from './GhostArticleModal';
```

- [ ] **Step 3: Aggiungi il trigger sotto la lista risultati vuota**

Trova il blocco che gestisce la lista risultati (righe ~3395-3444). Aggiungi **dopo** il `{productResults.length > 0 && ...}`:

```tsx
{/* Trigger articolo non catalogato — solo per FT Fresis con sottocliente */}
{productResults.length === 0 && !searchingProduct && productSearch.length > 0 && isFresisWithSubClient && (
  <div
    onClick={() => setShowGhostModal(true)}
    style={{
      marginTop: '0.5rem',
      padding: '0.625rem 0.75rem',
      border: '1px dashed #d1d5db',
      borderRadius: '0.5rem',
      cursor: 'pointer',
      color: '#6b7280',
      fontSize: '0.875rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
    }}
  >
    <span>+</span>
    <span>Inserisci come articolo non catalogato</span>
  </div>
)}
```

**Come trovare la variabile corretta:** In `OrderFormSimple.tsx`, cerca `subClientCodice` o `isFresis` — il componente ha già logica per determinare se un ordine è Fresis con sottocliente. Cerca pattern tipo `subClientCodice && isFresisOrder` o `!!props.subClientCodice`. Usa quella condizione al posto di `isFresisWithSubClient`.

- [ ] **Step 4: Aggiungi la modale e il callback**

Trova dove vengono renderizzate le altre modali (fine del componente o nelle sezioni condizionali). Aggiungi:

```tsx
{showGhostModal && (
  <GhostArticleModal
    onClose={() => setShowGhostModal(false)}
    onConfirm={(item) => {
      // Usa la stessa funzione usata per aggiungere articoli normali
      // Cerca nel componente: addItem, handleAddItem, addItemsWithAnimation o simile
      // Cerca in OrderFormSimple.tsx la funzione usata per aggiungere un articolo
      // cercando "addItem", "handleAddProduct", "onAddItem" o il callback passato
      // quando l'utente seleziona un prodotto dalla lista risultati (righe ~3406-3442).
      // Usa la stessa funzione/callback usata lì.
      addItemToOrder(item);  // ← sostituisci con il nome corretto trovato nel componente
      setShowGhostModal(false);
      setProductSearch('');
    }}
  />
)}
```

- [ ] **Step 5: Verifica type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(order-form): add ghost article trigger and modal for uncatalogued articles"
```

---

## Task 13: Verifica serializzazione `isGhostArticle` nel payload `/archive`

**Files:**
- Verify: `archibald-web-app/frontend/src/api/fresis-history.ts`
- Verify/Modify: componente che chiama `archiveOrders` (probabilmente `PendingOrdersPage.tsx`)

- [ ] **Step 1: Leggi la funzione `archiveOrders` (righe ~247-282)**

Verifica che il payload `JSON.stringify({ orders, ... })` serializzi gli items as-is senza mapping esplicito che escluderebbe `isGhostArticle`.

- [ ] **Step 2: Controlla dove gli items vengono costruiti**

Cerca nei punti di chiamata di `archiveOrders` (righe ~174, ~482, ~538 in `PendingOrdersPage.tsx`) come vengono costruiti gli items. Verifica che non ci sia un mapping esplicito che omette `isGhostArticle`.

Se gli items vengono passati direttamente come `order.items` o tramite spread `{ ...order }`, `isGhostArticle` sarà incluso automaticamente nel JSON. In quel caso, nessuna modifica necessaria.

Se invece esiste un mapping esplicito dei campi, aggiungi `isGhostArticle: item.isGhostArticle` al mapping.

- [ ] **Step 3: Verifica type-check finale**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 4: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend
```

Expected: tutti i test passano.

- [ ] **Step 5: Esegui tutti i test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Expected: tutti i test passano.

- [ ] **Step 6: Commit finale se ci sono modifiche**

```bash
git add -p  # seleziona solo file modificati in questo task
git commit -m "fix(archive): ensure isGhostArticle is serialized in FT archive payload"
```

---

## Task 14: Verifica finale e build

- [ ] **Step 1: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: nessun errore TypeScript.

- [ ] **Step 2: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: nessun errore TypeScript.

- [ ] **Step 3: Test backend completi**

```bash
npm test --prefix archibald-web-app/backend
```

- [ ] **Step 4: Test frontend completi**

```bash
npm test --prefix archibald-web-app/frontend
```

- [ ] **Step 5: Commit di chiusura se necessario**

Se rimangono modifiche non committate:

```bash
git add archibald-web-app/
git commit -m "chore: finalize ghost articles feature"
```

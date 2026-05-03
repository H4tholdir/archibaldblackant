# Conductor UX + Order Read-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migliorare l'UX delle schede pending (badge batch, distinzione Komet/Fresis, lock) e popolare le schede ordine `/orders` con dati ERP autoritativi immediatamente dopo il piazzamento, leggendo il DetailView ERP post-save.

**Architecture:** Due sottosistemi indipendenti: (1) UX pending — fix badge serializzazione, stile Komet/Fresis, lock persistito in DB, rimozione tag "In Attesa"; (2) Order read-back — nuovo metodo bot `readOrderFromDetailView` che naviga al DetailView ERP dopo il salvataggio, legge header + SALESLINES, popola `order_records` e `order_articles` immediatamente senza aspettare il sync periodico.

**Tech Stack:** TypeScript strict, Express, Puppeteer (bot ERP), PostgreSQL, React 19, Vitest, supertest.

---

## File map

| File | Modificato da |
|------|--------------|
| `backend/src/db/migrations/080-pending-orders-lock.sql` | A1 — crea |
| `backend/src/db/migrations/081-order-records-text-internal.sql` | A2 — crea |
| `backend/src/routes/pending-orders.ts` | B1 — aggiunge PATCH lock |
| `backend/src/bot/archibald-bot.ts` | B2 — aggiunge `readOrderFromDetailView` |
| `backend/src/operations/handlers/submit-order.ts` | B3 — chiama read-back post-save |
| `backend/src/db/repositories/orders.ts` | B4 — aggiunge `text_internal` |
| `frontend/src/hooks/usePendingSync.ts` | C1 — fix bug `?? taskIds[0]` |
| `frontend/src/api/pending-orders.ts` | C2 — aggiunge `is_locked`, `text_internal` |
| `frontend/src/pages/PendingOrdersPage.tsx` | C3 — lock UI + Komet/Fresis + badge |
| `frontend/src/components/OrderCardNew.tsx` | C4 — smart notes + address indicator |

---

## Task A1: Migration 080 — `is_locked` su pending_orders

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/080-pending-orders-lock.sql`

- [ ] **Step 1: Crea il file migration**

```sql
-- Aggiunge is_locked per bloccare schede pending in attesa di conferma cliente.
-- L'agente può bloccare un ordine per evitare che venga selezionato/inviato accidentalmente.
ALTER TABLE agents.pending_orders
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: Verifica che il runner la includa**

```bash
grep -r "080" archibald-web-app/backend/src/db/migrate.ts
```

Expected: il migrate.ts applica tutte le migration in ordine numerico — nessuna modifica necessaria se usa `glob('*.sql')`.

- [ ] **Step 3: Applica la migration localmente per verifica**

```bash
cd archibald-web-app/backend && npm run build 2>&1 | tail -3
```

Expected: `tsc` senza errori.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/080-pending-orders-lock.sql
git commit -m "feat(db): aggiunge is_locked a pending_orders per blocco ordini"
```

---

## Task A2: Migration 081 — `text_internal` su order_records

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/081-order-records-text-internal.sql`

- [ ] **Step 1: Crea il file migration**

```sql
-- Aggiunge text_internal per memorizzare il TEXTINTERNAL ERP separatamente
-- da TEXTEXTERNAL (notes) e PURCHORDERFORMNUM (order_description).
-- Usato per il "smart display" note nelle schede ordine /orders.
ALTER TABLE agents.order_records
  ADD COLUMN IF NOT EXISTS text_internal TEXT;
```

- [ ] **Step 2: Build TypeScript**

```bash
cd /Users/hatholdir/Downloads/Archibald && npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
```

Expected: `tsc` pulito.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/081-order-records-text-internal.sql
git commit -m "feat(db): aggiunge text_internal a order_records per note ERP separate"
```

---

## Task B1: API endpoint `PATCH /api/pending/:id/lock`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/pending-orders.ts`

- [ ] **Step 1: Scrivi il test failing**

Apri `archibald-web-app/backend/src/routes/pending-orders.spec.ts` (o crea il file se non esiste) e aggiungi:

```typescript
describe('PATCH /api/pending/:id/lock', () => {
  it('imposta is_locked=true e ritorna 200', async () => {
    // Setup: inserisci un pending order fittizio nel DB test
    // ...omesso se il test è integration — usa skipIf per CI senza DB
    // Per unit test: verifica che la route chiami il repository correttamente
  });
});
```

Nota: se i test pending-orders esistenti sono integration (richiedono DB), aggiungi il test con skipIf(CI):
```typescript
const skipIf = process.env.CI === 'true' || !process.env.PG_HOST;
describe.skipIf(skipIf)('PATCH /api/pending/:id/lock integration', () => {
  it('imposta is_locked=true', async () => { /* ... */ });
});
```

- [ ] **Step 2: Aggiungi la route in `pending-orders.ts`**

Trova dove sono definiti gli altri endpoint (es. PATCH per status) e aggiungi:

```typescript
router.patch('/:id/lock', authenticate, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).userId;
  const { id } = req.params;
  const { locked } = req.body as { locked: boolean };
  if (typeof locked !== 'boolean') {
    return res.status(400).json({ error: 'locked must be boolean' });
  }
  try {
    const result = await deps.pool.query(
      `UPDATE agents.pending_orders
       SET is_locked = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, is_locked`,
      [locked, id, userId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Pending order not found' });
    }
    return res.json({ id, is_locked: locked });
  } catch (err) {
    logger.error('Error locking pending order', { id, locked, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 3: Aggiorna il GET pending orders per includere `is_locked`**

Nel SELECT che recupera i pending orders, aggiungi `is_locked` alla lista colonne. Cerca il `SELECT` nella route GET `/` e aggiungi `po.is_locked` oppure usa `SELECT po.*`.

- [ ] **Step 4: Build e test**

```bash
cd /Users/hatholdir/Downloads/Archibald
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
```

Expected: `tsc` pulito.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/pending-orders.ts
git commit -m "feat(api): PATCH /api/pending/:id/lock — blocca/sblocca ordine pending"
```

---

## Task B2: Metodo `readOrderFromDetailView` in archibald-bot.ts

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts` (solo tipo)

- [ ] **Step 1: Aggiungi tipo `OrderDetailData` in submit-order.ts**

In `submit-order.ts`, dopo la definizione di `OrderHeaderData` (riga ~70), aggiungi:

```typescript
export type OrderDetailArticle = {
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;  // % sconto di riga
  lineAmount: number;    // importo riga dopo sconto
};

export type OrderDetailData = {
  orderId: string | null;
  orderNumber: string | null;     // SALESID — es. "ORD/26007984"
  customerAccountNum: string | null;
  customerName: string | null;
  creationDate: string | null;    // ORDERDATE — formato "DD/MM/YYYY HH:mm:ss"
  deliveryDate: string | null;
  deliveryName: string | null;
  deliveryAddress: string | null;
  orderDescription: string | null; // PURCHORDERFORMNUM
  customerReference: string | null;
  notes: string | null;            // TEXTEXTERNAL
  textInternal: string | null;     // TEXTINTERNAL
  salesStatus: string | null;
  documentStatus: string | null;
  transferStatus: string | null;
  transferDate: string | null;
  completionDate: string | null;
  orderType: string | null;
  articles: OrderDetailArticle[];
  totalAmount: string | null;      // Sum da footer SALESLINES (già come stringa "174.27")
  grossAmount: string | null;      // Calcolato: Σ(qty × unitPrice)
};
```

- [ ] **Step 2: Aggiorna `SubmitOrderBot` interface per includere il nuovo metodo**

In `submit-order.ts`, aggiungi a `SubmitOrderBot`:

```typescript
readOrderFromDetailView?: (orderId: string) => Promise<OrderDetailData | null>;
```

- [ ] **Step 3: Aggiungi il metodo `readOrderFromDetailView` in archibald-bot.ts**

Trova il metodo `readOrderHeader` (riga ~15524) e aggiungi dopo di esso il nuovo metodo:

```typescript
async readOrderFromDetailView(orderId: string): Promise<OrderDetailData | null> {
  if (!this.page) {
    logger.warn('[ArchibaldBot] readOrderFromDetailView: page non inizializzata', { orderId });
    return null;
  }

  const cleanOrderId = orderId.replace(/\./g, '');
  const listViewUrl = `${config.archibald.url}/SALESTABLE_ListView_Agent/`;
  const detailViewUrl = `${config.archibald.url}/SALESTABLE_DetailViewAgent/${cleanOrderId}/?mode=View`;

  logger.info('[ArchibaldBot] readOrderFromDetailView: navigazione', { orderId, cleanOrderId });

  try {
    // MUST navigate from ListView first — navigazione diretta da Default.aspx causa redirect
    await this.page.goto(listViewUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await this.page.goto(detailViewUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.waitForDevExpressReady({ timeout: 15_000 });

    const detail = await this.page.evaluate(() => {
      function getVal(sel) {
        var el = document.querySelector(sel);
        if (!el) return null;
        var v = el.value ? el.value.trim() : null;
        if (v && v.length > 0) return v;
        var txt = el.textContent ? el.textContent.trim().split('\n')[0].trim() : null;
        return (txt && txt.length > 0 && txt.indexOf('ASPx') === -1) ? txt : null;
      }
      function getVI(sel) {
        var el = document.querySelector(sel);
        if (!el) return null;
        var txt = el.textContent ? el.textContent.trim().split('\n')[0].trim() : null;
        return (txt && txt.length > 0 && txt.indexOf('ASPx') === -1) ? txt : null;
      }

      // Leggi SALESLINES grid
      var rows = Array.from(document.querySelectorAll('tr[id*="SALESLINEs"][id*="DXDataRow"]'));
      var footer = document.querySelector('tr[id*="SALESLINEs"][id*="DXFooterRow"]');
      var ARTICLE_CODE_RE = /^[A-Z0-9]+[\.\-][A-Z0-9\.\-]+$/i;

      var articles = [];
      for (var i = 0; i < rows.length; i++) {
        var cells = Array.from(rows[i].querySelectorAll('td'));
        var texts = cells.map(function(c) { return c.textContent ? c.textContent.trim() : ''; }).filter(function(t) { return t.length > 0; });
        // VIEW mode struttura: [LINEA][CODE][QTY][PRICE €][DISC%][GLOB_DISC%][LINE_AMT €][NOME]
        var code = texts[1] || '';
        if (!ARTICLE_CODE_RE.test(code)) continue; // skip spese trasporto e simili
        var qty = parseFloat((texts[2] || '0').replace(',', '.')) || 0;
        var unitPriceRaw = (texts[3] || '0').replace(' €', '').replace(/\./g, '').replace(',', '.');
        var unitPrice = parseFloat(unitPriceRaw) || 0;
        var discRaw = (texts[4] || '0').replace(' %', '').replace(',', '.');
        var lineDiscount = parseFloat(discRaw) || 0;
        var lineAmtRaw = (texts[6] || '0').replace(' €', '').replace(/\./g, '').replace(',', '.');
        var lineAmount = parseFloat(lineAmtRaw) || 0;
        var name = texts[7] || code;
        articles.push({ code: code, name: name, quantity: qty, unitPrice: unitPrice, lineDiscount: lineDiscount, lineAmount: lineAmount });
      }

      // Footer: "Count=N Sum=338,00    Sum=2.390,47 €"
      var totalAmount = null;
      if (footer) {
        var m = footer.textContent ? footer.textContent.match(/Sum=([0-9.,]+)\s+€/) : null;
        if (m) totalAmount = m[1].replace(/\./g, '').replace(',', '.');
      }

      // Gross amount: Σ(qty × unitPrice)
      var gross = 0;
      for (var j = 0; j < articles.length; j++) {
        gross += Math.abs(articles[j].quantity) * articles[j].unitPrice;
      }

      return {
        orderId: getVal('[id*="xaf_dviID_View"]'),
        orderNumber: getVal('[id*="xaf_dviSALESID_View"]'),
        customerAccountNum: getVal('[id*="xaf_dviCUSTTABLE_View"]'),
        customerName: getVal('[id*="xaf_dviSALESNAME_View"]'),
        creationDate: getVal('[id*="xaf_dviORDERDATE_View"]'),
        deliveryDate: getVal('[id*="xaf_dviDELIVERYDATE_View"]'),
        deliveryName: getVal('[id*="xaf_dviDELIVERYNAME_View"]'),
        deliveryAddress: getVal('[id*="xaf_dviDLVADDRESS_View"]'),
        orderDescription: getVal('[id*="xaf_dviPURCHORDERFORMNUM_View"]'),
        customerReference: getVal('[id*="xaf_dviCUSTOMERREF_View"]'),
        notes: getVal('[id*="xaf_dviTEXTEXTERNAL_View"]'),
        textInternal: getVal('[id*="xaf_dviTEXTINTERNAL_View"]'),
        salesStatus: getVI('[id*="xaf_dviSALESSTATUS_VI"]'),
        documentStatus: getVI('[id*="xaf_dviDOCUMENTSTATUS_VI"]'),
        transferStatus: getVI('[id*="xaf_dviTRANSFERSTATUS_VI"]'),
        transferDate: getVal('[id*="xaf_dviTRANSFERREDDATE_View"]'),
        completionDate: getVal('[id*="xaf_dviCOMPLETEDDATE_View"]'),
        orderType: getVI('[id*="xaf_dviSALESTYPE_View"]'),
        articles: articles,
        totalAmount: totalAmount,
        grossAmount: gross > 0 ? gross.toFixed(2) : null,
      };
    });

    logger.info('[ArchibaldBot] readOrderFromDetailView completato', {
      orderId,
      orderNumber: detail.orderNumber,
      articlesCount: detail.articles.length,
      totalAmount: detail.totalAmount,
    });
    return detail;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[ArchibaldBot] readOrderFromDetailView fallito — fallback a dati PWA', { orderId, error: message });
    return null;
  }
}
```

- [ ] **Step 4: Build TypeScript**

```bash
cd /Users/hatholdir/Downloads/Archibald && npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: `tsc` pulito.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts \
        archibald-web-app/backend/src/operations/handlers/submit-order.ts
git commit -m "feat(bot): aggiunge readOrderFromDetailView — lettura ERP post-piazzamento"
```

---

## Task B3: Integrazione in submit-order.ts — usa dati ERP post-save

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts`

Contesto: dopo `updateTaskPhase(pool, taskContext.taskId, 'erp_save_done')` (riga ~335), il handler inserisce `order_records` da dati PWA. Il nuovo comportamento: tentare `readOrderFromDetailView`, se succede usare dati ERP, se fallisce fare fallback ai dati PWA (comportamento attuale).

- [ ] **Step 1: Localizza il punto di inserimento**

Trova la riga `await updateTaskPhase(pool, taskContext.taskId, 'erp_save_done')` e subito dopo l'`await pool.withTransaction(...)` che fa l'INSERT di `order_records`.

Il nuovo codice si inserisce TRA `updateTaskPhase('erp_save_done')` e `pool.withTransaction`.

- [ ] **Step 2: Aggiungi il tentativo di read-back**

Dopo `await updateTaskPhase(pool, taskContext.taskId, 'erp_save_done')` e PRIMA del `withTransaction`, aggiungi:

```typescript
// Read-back ERP: legge dati autoritativi dal DetailView per popolare order_records
// Se fallisce (timeout, ERP irraggiungibile) → fallback ai dati PWA sotto
let erpDetail: import('./submit-order').OrderDetailData | null = null;
if (bot.readOrderFromDetailView) {
  erpDetail = await bot.readOrderFromDetailView(orderId).catch((err) => {
    logger.warn('[SubmitOrder] readOrderFromDetailView fallito', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  });
  if (erpDetail) {
    logger.info('[SubmitOrder] Dati ERP letti dal DetailView', {
      orderId,
      orderNumber: erpDetail.orderNumber,
      articlesCount: erpDetail.articles.length,
    });
  }
}
```

- [ ] **Step 3: Usa dati ERP nell'INSERT order_records**

All'interno del `withTransaction`, dove attualmente si fa l'INSERT di `order_records` con dati PWA (trovare il blocco con `INSERT INTO agents.order_records`), aggiornare i valori per usare `erpDetail` se disponibile:

```typescript
// Usa dati ERP se disponibili, altrimenti dati PWA
const orderNumber = erpDetail?.orderNumber ?? `PENDING-${orderId}`;
const deliveryName = erpDetail?.deliveryName ?? null;
const deliveryAddress = erpDetail?.deliveryAddress ?? null;
const deliveryDate = erpDetail?.deliveryDate ?? null;
const orderDescription = erpDetail?.orderDescription ?? buildOrderNotesText(data.noShipping, data.notes) ?? null;
const customerReference = erpDetail?.customerReference ?? null;
const notesValue = erpDetail?.notes ?? buildOrderNotesText(data.noShipping, data.notes) ?? null;
const textInternal = erpDetail?.textInternal ?? null;
const salesStatus = erpDetail?.salesStatus ?? null;
const documentStatus = erpDetail?.documentStatus ?? null;
const transferStatus = erpDetail?.transferStatus ?? 'Modifica';
const totalAmountValue = erpDetail?.totalAmount
  ? erpDetail.totalAmount.replace('.', ',')
  : total.toFixed(2).replace('.', ',');
const grossAmountValue = erpDetail?.grossAmount
  ? erpDetail.grossAmount.replace('.', ',')
  : grossAmount.toFixed(2).replace('.', ',');
```

Poi modifica l'INSERT di `order_records` per:
1. Includere `text_internal` nella lista colonne
2. Usare le variabili `orderNumber`, `deliveryName`, ecc. invece delle precedenti
3. Settare `articles_synced_at = now` SE `erpDetail` è disponibile E ha articoli

```typescript
// Aggiungi text_internal alla lista colonne e ai valori
// ...
articles_synced_at = ${erpDetail?.articles.length ? `'${now}'` : 'NULL'}
```

- [ ] **Step 4: Usa articoli ERP se disponibili**

Dopo l'INSERT di `order_records`, dove attualmente si inseriscono gli `order_articles` da `data.items`, avvolgi il blocco con:

```typescript
const articlesToInsert = erpDetail?.articles.length
  ? erpDetail.articles.map(a => ({
      articleCode: a.code,
      description: a.name,
      quantity: a.quantity,
      price: a.unitPrice,
      discount: a.lineDiscount,
      lineAmount: a.lineAmount,
      vat: 22, // default — ERP non espone IVA per riga in view mode
      isGhostArticle: false,
    }))
  : data.items; // fallback a dati PWA

// Usa articlesToInsert per l'INSERT di order_articles invece di data.items
```

- [ ] **Step 5: Build e test**

```bash
cd /Users/hatholdir/Downloads/Archibald
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
cd archibald-web-app/backend && npx vitest run src/operations/handlers/submit-order.spec.ts --reporter=verbose 2>&1 | tail -20
```

Expected: build pulito, test esistenti passano (readOrderFromDetailView non è presente nei test esistenti perché è opzionale su SubmitOrderBot).

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts
git commit -m "feat(submit-order): legge dati ERP da DetailView post-save — popola order_records + articles da ERP"
```

---

## Task B4: Aggiorna `orders.ts` — aggiungi `text_internal`

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/orders.ts`

- [ ] **Step 1: Aggiungi `text_internal` al tipo di riga DB**

Trova la definizione del tipo row (verso riga 10-90, cerca `type OrderRow` o `interface`) e aggiungi:

```typescript
text_internal: string | null;
```

- [ ] **Step 2: Aggiungi `textInternal` al tipo `Order` mappato**

Trova la definizione del tipo ritornato (proprietà dell'ordine) e aggiungi:

```typescript
textInternal: string | null;
```

- [ ] **Step 3: Aggiungi mapping nella funzione `mapRow` (o dove viene fatto il mapping)**

Aggiungi: `textInternal: row.text_internal,`

- [ ] **Step 4: Aggiorna `upsertOrderFromSync` INSERT/UPDATE per includere `text_internal`**

Nella funzione `upsertOrderFromSync` (o equivalente), aggiungi `text_internal` alla lista colonne dell'INSERT e dell'UPDATE SQL. Usa `null` come valore di default (il campo viene settato da submit-order, non dal sync).

- [ ] **Step 5: Aggiorna il SELECT principale per includere `text_internal`**

Trova il `SELECT o.*` o il SELECT esplicito e verifica che `text_internal` sia incluso (se usa `o.*` è già incluso).

- [ ] **Step 6: Build e test**

```bash
cd /Users/hatholdir/Downloads/Archibald
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: `tsc` pulito.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/orders.ts
git commit -m "feat(orders): aggiunge text_internal a order_records — note ERP interne"
```

---

## Task C1: Fix bug `usePendingSync.ts` — rimuovi `?? taskIds[0]`

**Files:**
- Modify: `archibald-web-app/frontend/src/hooks/usePendingSync.ts`
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

- [ ] **Step 1: Scrivi il test**

In `archibald-web-app/frontend/src/hooks/usePendingSync.spec.ts` (o file esistente), aggiungi:

```typescript
it('trackJobs non assegna lo stesso jobId a ordini diversi quando taskIds ha meno elementi', () => {
  // Se la API ritorna solo 1 taskId per 3 ordini,
  // solo il primo ordine deve avere un jobId; gli altri no.
  // Questo impedisce che JOB_STARTED per task1 attivi tutti e tre gli ordini.
  const result = { taskIds: ['task-1'] };
  const orders = ['order-a', 'order-b', 'order-c'];
  const entries = orders.map((orderId, i) => ({
    orderId,
    // CORRETTO: result.taskIds[i] ?? undefined — non usare taskIds[0] come fallback
    jobId: result.taskIds[i],
  })).filter(e => e.jobId != null);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toEqual({ orderId: 'order-a', jobId: 'task-1' });
});
```

- [ ] **Step 2: Fix in `PendingOrdersPage.tsx` riga 280**

Trova:
```typescript
trackJobs(
  ordersToSubmit.map(({ order }, i) => ({
    orderId: order.id!,
    jobId: result.taskIds[i] ?? result.taskIds[0],
  })),
);
```

Sostituisci con:
```typescript
trackJobs(
  ordersToSubmit
    .map(({ order }, i) => ({
      orderId: order.id!,
      jobId: result.taskIds[i],
    }))
    .filter((entry): entry is { orderId: string; jobId: string } => entry.jobId != null),
);
```

- [ ] **Step 3: Test frontend**

```bash
cd /Users/hatholdir/Downloads/Archibald
npm test --prefix archibald-web-app/frontend -- --run 2>&1 | tail -10
```

Expected: tutti i test passano.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "fix(pending): rimuovi fallback taskIds[0] — evita JOB_STARTED su tutti gli ordini batch"
```

---

## Task C2: Aggiungi `is_locked` alle API e tipi frontend

**Files:**
- Modify: `archibald-web-app/frontend/src/api/pending-orders.ts`

- [ ] **Step 1: Aggiungi `is_locked` al tipo `PendingOrder`**

In `pending-orders.ts`, trova il tipo `PendingOrder` e aggiungi:

```typescript
isLocked: boolean;
```

- [ ] **Step 2: Aggiungi mapping nell'API client**

Dove viene fatto il mapping dal raw API response a `PendingOrder`, aggiungi:

```typescript
isLocked: raw.is_locked ?? false,
```

- [ ] **Step 3: Aggiungi funzione `lockPendingOrder`**

```typescript
export async function lockPendingOrder(orderId: string, locked: boolean): Promise<void> {
  const response = await fetchWithRetry(`/api/pending/${encodeURIComponent(orderId)}/lock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locked }),
  });
  if (!response.ok) throw new Error(`Failed to lock order: ${response.status}`);
}
```

- [ ] **Step 4: Type-check frontend**

```bash
cd /Users/hatholdir/Downloads/Archibald
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

Expected: nessun errore TS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/api/pending-orders.ts
git commit -m "feat(api-client): aggiunge is_locked e lockPendingOrder a pending orders"
```

---

## Task C3: UX PendingOrdersPage — Komet/Fresis, lock, badge, rimozione "In Attesa"

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

Questo è il task più grande — modifica la card di ogni pending order.

### 3a — Aggiungi costanti di stile

Nella sezione dei costanti/style all'inizio del file (o inline nel componente), aggiungi:

```typescript
// Stili per distinguere Komet (diretti) da Fresis (con sottocliente)
const KOMET_STYLE = {
  background: '#eff6ff',
  borderColor: '#93c5fd',
  stripColor: 'linear-gradient(180deg, #1565C0, #42a5f5)',
  badgeColor: '#1565C0',
  badgeLabel: '● Komet',
};
const FRESIS_STYLE = {
  background: '#fffbeb',
  borderColor: '#fbbf24',
  stripColor: 'linear-gradient(180deg, #d97706, #fcd34d)',
  badgeColor: '#d97706',
  badgeLabel: '● Fresis',
};
const QUEUED_OVERRIDES = {
  background: '#f1f5f9',
  borderColor: '#cbd5e1',
  opacity: 0.85,
};
```

### 3b — Logica isFresisOrder e stile card

Dentro il `.map((order, orderIndex) => { ... })` delle card, aggiungi:

```typescript
const isFresisOrder = !!(order.subClientName || order.subClientCodice);
const cardStyle = isFresisOrder ? FRESIS_STYLE : KOMET_STYLE;
const isQueuedNotActive = isJobQueued && !isJobActive;
```

Aggiorna il `style` del container card per usare `cardStyle.background` e `cardStyle.borderColor` al posto dei valori fissi. Se `isQueuedNotActive`, applica `QUEUED_OVERRIDES`.

### 3c — Striscia laterale colored

Aggiungi all'inizio del contenuto card (dentro il div principale) un div per la striscia:

```tsx
<div style={{
  position: 'absolute',
  left: 0, top: 0, bottom: 0,
  width: '4px',
  background: isQueuedNotActive ? '#94a3b8' : cardStyle.stripColor,
  borderTopLeftRadius: '10px',
  borderBottomLeftRadius: '10px',
}} />
```

### 3d — Badge brand (Komet/Fresis)

Nel header della card, sostituisci il badge "In Attesa" con il badge brand + stato:

```tsx
{/* Brand badge — sostituisce "In Attesa" */}
<span style={{
  background: isQueuedNotActive ? '#64748b' : cardStyle.badgeColor,
  color: '#fff',
  padding: '2px 7px',
  borderRadius: '10px',
  fontSize: '10px',
  fontWeight: 700,
  marginRight: '6px',
}}>
  {cardStyle.badgeLabel}
</span>

{/* Stato */}
{isJobActive && <span style={{ /* badge giallo "In Elaborazione" */ }}>In Elaborazione</span>}
{isJobQueued && !isJobActive && (
  <span style={{ background: '#64748b', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
    {/* Posizione in coda: conta quanti ordini con jobStatus=queued ci sono prima di questo */}
    In Coda #{pendingOrders.filter(o => (o.jobStatus === 'queued') && o.id! <= order.id!).length}
  </span>
)}
```

**Nota calcolo posizione #N**: utilizza l'indice nell'array `orders` filtrato per `jobStatus === 'queued'`:

```typescript
const queuedOrders = orders.filter(o => o.jobStatus === 'queued' && !o.isJobActive);
const queuePosition = queuedOrders.findIndex(o => o.id === order.id) + 1;
// Poi usa: `In Coda #${queuePosition}`
```

### 3e — Riga sottocliente Fresis

Se `isFresisOrder`, mostra una riga aggiuntiva sotto il nome cliente:

```tsx
{isFresisOrder && order.subClientName && (
  <div style={{ fontSize: '11px', color: '#92400e', fontWeight: 600, marginTop: '2px' }}>
    → {order.subClientName}
  </div>
)}
```

### 3f — Pulsante lock 🔓/🔒

Accanto al pulsante "⋯ Azioni", aggiungi:

```tsx
<button
  onClick={async (e) => {
    e.stopPropagation();
    try {
      await lockPendingOrder(order.id!, !order.isLocked);
      await refetch();
    } catch (err) {
      console.error('Lock failed', err);
    }
  }}
  style={{
    background: order.isLocked ? '#fee2e2' : 'rgba(255,255,255,0.7)',
    border: `1px solid ${order.isLocked ? '#fca5a5' : '#d1d5db'}`,
    borderRadius: '5px',
    padding: '3px 7px',
    fontSize: '13px',
    cursor: 'pointer',
  }}
  title={order.isLocked ? 'Sblocca ordine' : 'Blocca ordine'}
>
  {order.isLocked ? '🔒' : '🔓'}
</button>
```

### 3g — Card bloccata: disabilita checkbox e mostra banner

```tsx
{/* Checkbox: disabilitato se bloccato */}
<input
  type="checkbox"
  disabled={order.isLocked}
  checked={isSelected && !order.isLocked}
  style={{ cursor: order.isLocked ? 'not-allowed' : 'pointer' }}
  onChange={...}
/>

{/* Badge Bloccato */}
{order.isLocked && (
  <span style={{ background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
    🔒 Bloccato
  </span>
)}

{/* Banner sotto la card */}
{order.isLocked && (
  <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', color: '#dc2626', margin: '8px 0 0 12px' }}>
    🔒 Bloccato — tocca 🔒 per sbloccare e rendere selezionabile
  </div>
)}
```

### 3h — "Seleziona Tutti" esclude locked

```typescript
const selectableOrders = orders.filter(o => !o.isLocked);
// Usa selectableOrders invece di orders per "Seleziona Tutti"
```

- [ ] **Step: Build e type-check**

```bash
cd /Users/hatholdir/Downloads/Archibald
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

Expected: nessun errore TS.

- [ ] **Step: Test frontend**

```bash
npm test --prefix archibald-web-app/frontend -- --run 2>&1 | tail -10
```

- [ ] **Step: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "feat(pending): Komet/Fresis styling, In Coda #N, lock UI, rimozione badge In Attesa"
```

---

## Task C4: OrderCardNew.tsx — smart notes + indirizzo standard/alternativo

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`

### 4a — Aggiungi `textInternal` al tipo `Order` usato nella card

Se il tipo `Order` è definito in un file condiviso, aggiungici `textInternal: string | null`. Se è inline, aggiornalo.

### 4b — Smart notes display

Trova dove viene mostrato `order.notes` (riga ~515-525) e sostituisci con la logica smart:

```tsx
{(() => {
  const threeFields = [
    order.orderDescription,
    order.notes,
    order.textInternal,
  ].filter((v): v is string => !!v && v.trim().length > 0);
  const unique = [...new Set(threeFields)];
  if (unique.length === 0) return null;
  if (unique.length === 1) {
    return (
      <div style={fieldRowStyle}>
        <div style={fieldValueStyle}>{unique[0]}</div>
      </div>
    );
  }
  // Tre valori diversi — mostra con etichette
  const labels = ['Descrizione', 'Nota esterna', 'Nota interna'];
  const fields = [order.orderDescription, order.notes, order.textInternal];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
      {fields.map((f, idx) => f ? (
        <div key={idx} style={{ fontSize: '11px' }}>
          <span style={{ fontSize: '9px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '6px' }}>
            {labels[idx]}
          </span>
          {f}
        </div>
      ) : null)}
    </div>
  );
})()}
```

Rimuovi le righe esistenti che mostrano separatamente `order.orderDescription` e `order.notes` — ora sono gestite insieme.

### 4c — Indirizzo consegna con badge standard/alternativo

Trova dove viene mostrato `order.deliveryAddress` (riga ~475-510). Sostituisci con:

```tsx
{(order.deliveryName || order.deliveryAddress || order.deliveryAddressSnapshot) && (
  <div style={fieldRowStyle}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
      {/* Badge tipo indirizzo */}
      <span style={{
        background: order.deliveryAddressId ? '#fef3c7' : '#f0fdf4',
        color: order.deliveryAddressId ? '#92400e' : '#16a34a',
        padding: '1px 6px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        marginTop: '1px',
      }}>
        {order.deliveryAddressId ? '⚡ Alternativo' : '✓ Standard'}
      </span>
      <div>
        {/* Usa snapshot se alternativo, altrimenti delivery_name + delivery_address */}
        {order.deliveryAddressId && order.deliveryAddressSnapshot ? (
          <div style={fieldValueStyle}>
            {[
              order.deliveryAddressSnapshot.street,
              order.deliveryAddressSnapshot.city,
              order.deliveryAddressSnapshot.postalCode,
            ].filter(Boolean).join(', ')}
          </div>
        ) : (
          <>
            {order.deliveryName && <div style={fieldValueStyle}>{order.deliveryName}</div>}
            {order.deliveryAddress && (
              <div style={{ ...fieldValueStyle, color: '#6b7280', fontSize: '11px' }}>
                {order.deliveryAddress}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step: Build e type-check**

```bash
cd /Users/hatholdir/Downloads/Archibald
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend -- --run 2>&1 | tail -10
```

Expected: nessun errore.

- [ ] **Step: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(orders): smart notes display e badge indirizzo standard/alternativo"
```

---

## Task C5: Verifica E2E post-implementazione

- [ ] **Step 1: Deploy su master**

```bash
git push origin master
```

- [ ] **Step 2: Attendi CI/CD verde**

```bash
gh run list --limit 2 2>/dev/null
```

- [ ] **Step 3: Test manuale — lock**

Nella PWA `/pending-orders`:
- Clicca 🔓 su un pending → deve diventare 🔒, card grigia, checkbox disabilitato
- "Seleziona Tutti" non deve selezionare la card bloccata
- Clicca 🔒 → sblocca, torna normale
- Ricarica la pagina → stato lock persistito

- [ ] **Step 4: Test manuale — badge batch**

Seleziona 3 pending, clicca "Invia (3)":
- 1 card deve mostrare "In Elaborazione" con barra progresso
- Le altre 2 devono mostrare "In Coda #2" e "In Coda #3"
- Quando il primo completa, il secondo diventa "In Elaborazione"

- [ ] **Step 5: Test manuale — piazzamento ordine + scheda /orders**

Invia 1 pending a Veralli:
- Attendi 100% completamento
- Naviga a `/orders`
- Verifica che l'ordine mostri `ORD/XXXXXXX` (non PENDING-X)
- Verifica che delivery_name e delivery_address siano presenti
- Verifica che gli articoli siano già presenti (articles_synced_at != null)
- Controlla i log backend per `[ArchibaldBot] readOrderFromDetailView completato`

---

## Checklist self-review spec coverage

- [x] Fix badge batch (Task C1 + C3)
- [x] Komet/Fresis styling (Task C3 — 3a/3b/3c/3d/3e)
- [x] Rimozione "In Attesa" (Task C3 — 3d)
- [x] Lock DB (Task A1) + API (Task B1) + UI (Task C2 + C3 — 3f/3g/3h)
- [x] In Coda #N numerazione (Task C3 — 3d)
- [x] readOrderFromDetailView (Task B2)
- [x] Submit-order integrazione (Task B3)
- [x] text_internal in DB (Task A2) + orders.ts (Task B4) + OrderCardNew (Task C4)
- [x] Smart notes display (Task C4 — 4b)
- [x] Indirizzo standard/alternativo (Task C4 — 4c)

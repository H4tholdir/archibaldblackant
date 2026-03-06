# No Shipping Costs & Order Notes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "no shipping" checkbox and a "notes" textarea to order creation, persist both fields through the full pipeline, and have the bot write them into 3 Archibald ERP fields before saving.

**Architecture:** Two new optional fields (`noShipping: boolean`, `notes: string`) flow from the frontend order form → API → DB → submit-order job → bot. The bot fills DESCRIZIONE, TESTO ORDINE ESTERNO, and TESTO ORDINE INTERNO on the Panoramica tab before clicking "Salva e chiudi". A DevExpress dump script helps identify the correct field IDs.

**Tech Stack:** React 19 (frontend), Express + PostgreSQL (backend), Puppeteer (bot), Zod (validation), Vitest (tests).

---

## Task 1: Add `noShipping` and `notes` to PendingOrder type (Frontend)

**Files:**
- Modify: `archibald-web-app/frontend/src/types/pending-order.ts:34-64`

**Step 1: Add fields to PendingOrder interface**

Add after line 43 (`revenue?: number;`):

```typescript
  noShipping?: boolean;
  notes?: string;
```

**Step 2: Commit**

```bash
git add archibald-web-app/frontend/src/types/pending-order.ts
git commit -m "feat(types): add noShipping and notes to PendingOrder"
```

---

## Task 2: Add `noShipping` and `notes` to frontend API layer

**Files:**
- Modify: `archibald-web-app/frontend/src/api/pending-orders.ts:26-68` (mapBackendOrder)
- Modify: `archibald-web-app/frontend/src/api/pending-orders.ts:81-119` (savePendingOrder)

**Step 1: Add fields to mapBackendOrder**

After line 47 (`revenue: raw.revenue as number | undefined,`), add:

```typescript
    noShipping: raw.noShipping as boolean | undefined,
    notes: raw.notes as string | undefined,
```

**Step 2: Add fields to savePendingOrder payload**

After line 99 (`shippingTax: order.shippingTax ?? 0,`), add:

```typescript
          noShipping: order.noShipping ?? false,
          notes: order.notes ?? null,
```

**Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/api/pending-orders.ts
git commit -m "feat(api): pass noShipping and notes in pending orders API"
```

---

## Task 3: Add DB migration for `no_shipping` and `notes` columns

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/011-pending-order-notes.sql`

**Step 1: Create migration file**

```sql
-- Add no_shipping flag and notes field to pending_orders
ALTER TABLE agents.pending_orders ADD COLUMN IF NOT EXISTS no_shipping BOOLEAN DEFAULT false;
ALTER TABLE agents.pending_orders ADD COLUMN IF NOT EXISTS notes TEXT;
```

**Step 2: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/011-pending-order-notes.sql
git commit -m "feat(db): add no_shipping and notes columns to pending_orders"
```

---

## Task 4: Add `noShipping` and `notes` to backend pending-orders repository

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/pending-orders.ts`

**Step 1: Add fields to PendingOrderRow type (line 3-25)**

After line 24 (`archibald_order_id: string | null;`), add:

```typescript
  no_shipping: boolean;
  notes: string | null;
```

**Step 2: Add fields to PendingOrder type (line 27-49)**

After line 48 (`archibaldOrderId: string | null;`), add:

```typescript
  noShipping: boolean;
  notes: string | null;
```

**Step 3: Add fields to PendingOrderInput type (line 51-67)**

After line 66 (`idempotencyKey?: string | null;`), add:

```typescript
  noShipping?: boolean;
  notes?: string | null;
```

**Step 4: Add fields to mapRowToPendingOrder (line 75-99)**

After line 97 (`archibaldOrderId: row.archibald_order_id,`), add:

```typescript
    noShipping: row.no_shipping,
    notes: row.notes,
```

**Step 5: Add fields to upsertPendingOrder INSERT query (line 123-155)**

Update the INSERT column list (line 124-128) to include `no_shipping, notes`:

```sql
INSERT INTO agents.pending_orders (
  id, user_id, customer_id, customer_name, items_json, status,
  discount_percent, target_total_with_vat, device_id, origin_draft_id,
  shipping_cost, shipping_tax, sub_client_codice, sub_client_name,
  sub_client_data_json, no_shipping, notes, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
ON CONFLICT (id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  customer_name = EXCLUDED.customer_name,
  items_json = EXCLUDED.items_json,
  status = EXCLUDED.status,
  discount_percent = EXCLUDED.discount_percent,
  target_total_with_vat = EXCLUDED.target_total_with_vat,
  device_id = EXCLUDED.device_id,
  shipping_cost = EXCLUDED.shipping_cost,
  shipping_tax = EXCLUDED.shipping_tax,
  sub_client_codice = EXCLUDED.sub_client_codice,
  sub_client_name = EXCLUDED.sub_client_name,
  sub_client_data_json = EXCLUDED.sub_client_data_json,
  no_shipping = EXCLUDED.no_shipping,
  notes = EXCLUDED.notes,
  updated_at = EXCLUDED.updated_at,
  origin_draft_id = EXCLUDED.origin_draft_id
```

Update the VALUES array (line 145-154) to include the new params at positions $16 and $17 (shifting `now, now` to $18, $19):

```typescript
[
  order.id, userId, order.customerId, order.customerName,
  JSON.stringify(order.itemsJson), order.status ?? 'pending',
  order.discountPercent ?? null, order.targetTotalWithVat ?? null,
  order.deviceId, order.originDraftId ?? null,
  order.shippingCost ?? 0, order.shippingTax ?? 0,
  order.subClientCodice ?? null, order.subClientName ?? null,
  order.subClientDataJson ? JSON.stringify(order.subClientDataJson) : null,
  order.noShipping ?? false, order.notes ?? null,
  now, now,
]
```

**Step 6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/pending-orders.ts
git commit -m "feat(repo): persist noShipping and notes in pending_orders"
```

---

## Task 5: Add `noShipping` and `notes` to backend route validation

**Files:**
- Modify: `archibald-web-app/backend/src/routes/pending-orders.ts:17-33`

**Step 1: Add fields to pendingOrderSchema**

After line 28 (`shippingTax: z.number().optional(),`), add:

```typescript
  noShipping: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
```

**Step 2: Commit**

```bash
git add archibald-web-app/backend/src/routes/pending-orders.ts
git commit -m "feat(routes): validate noShipping and notes in pending orders schema"
```

---

## Task 6: Add `noShipping` and `notes` to SubmitOrderData and pass to bot

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts:28-35`
- Modify: `archibald-web-app/backend/src/schemas.ts:25-31`

**Step 1: Add fields to SubmitOrderData type (line 28-35)**

After line 34 (`targetTotalWithVAT?: number;`), add:

```typescript
  noShipping?: boolean;
  notes?: string;
```

**Step 2: Add fields to createOrderSchema (line 25-31)**

After line 30 (`targetTotalWithVAT: z.number().positive().optional(),`), add:

```typescript
  noShipping: z.boolean().optional(),
  notes: z.string().max(500).optional(),
```

**Step 3: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts archibald-web-app/backend/src/schemas.ts
git commit -m "feat(submit-order): add noShipping and notes to SubmitOrderData"
```

---

## Task 7: Pass `noShipping` and `notes` when dispatching submit-order jobs (Frontend)

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx:155-172` (handleSubmitSelected)
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx:237-254` (handleRetryOrder)

**Step 1: Add noShipping and notes to handleSubmitSelected enqueue call**

After line 171 (`targetTotalWithVAT: isFresisSubclient ? undefined : order.targetTotalWithVAT,`), add:

```typescript
            noShipping: order.noShipping,
            notes: order.notes,
```

**Step 2: Add noShipping and notes to handleRetryOrder enqueue call**

After line 253 (`targetTotalWithVAT: order.targetTotalWithVAT,`), add:

```typescript
        noShipping: order.noShipping,
        notes: order.notes,
```

**Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "feat(pending-orders): pass noShipping and notes to submit-order job"
```

---

## Task 8: Add checkbox and notes to OrderFormSimple

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

**Step 1: Add state variables**

Near other state declarations (around line 264), add:

```typescript
const [noShipping, setNoShipping] = useState(false);
const [orderNotes, setOrderNotes] = useState("");
```

**Step 2: Update calculateTotals to respect noShipping**

Modify `calculateTotals` (line 2495-2522). Replace lines 2502-2504:

```typescript
    const shippingCosts = noShipping ? { cost: 0, tax: 0, total: 0 } : calculateShippingCosts(finalSubtotal);
    const shippingCost = shippingCosts.cost;
    const shippingTax = shippingCosts.tax;
```

**Step 3: Update handleSubmit to pass noShipping and notes**

In `handleSubmit` (line 2665-2675), add to the `savePendingOrder` call object after `subClientData`:

```typescript
        noShipping: noShipping || undefined,
        notes: orderNotes.trim() || undefined,
```

**Step 4: Restore noShipping and notes when loading order for editing**

In the `loadOrderForEditing` effect (around line 585, after `setItems(loadedItems);`), add:

```typescript
        // Restore noShipping and notes
        if (order.noShipping) setNoShipping(true);
        if (order.notes) setOrderNotes(order.notes);
```

**Step 5: Add checkbox next to shipping costs display**

Replace the shipping costs display block (lines 4628-4648) with:

```tsx
{(() => {
  const hasShipping = !noShipping && totals.shippingCost > 0;
  const showShippingRow = totals.shippingCost > 0 || noShipping;
  if (!showShippingRow) return null;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "0.5rem",
        color: noShipping ? "#9ca3af" : "#f59e0b",
        fontSize: isMobile ? "0.875rem" : "1rem",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={noShipping}
            onChange={(e) => setNoShipping(e.target.checked)}
            style={{ accentColor: "#f59e0b", width: "16px", height: "16px", cursor: "pointer" }}
          />
          <span style={{ textDecoration: noShipping ? "line-through" : "none" }}>
            Spese di trasporto K3
          </span>
        </label>
        {!noShipping && (
          <span style={{ fontSize: "0.75rem" }}>
            ({formatCurrency(totals.shippingCost)} + IVA)
          </span>
        )}
      </span>
      <strong style={{ textDecoration: noShipping ? "line-through" : "none" }}>
        {noShipping ? formatCurrency(0) : formatCurrency(totals.shippingCost + totals.shippingTax)}
      </strong>
    </div>
  );
})()}
```

**Step 6: Add notes textarea below Sconto Globale**

After the "Sconto Globale (%)" section and before the totals summary `<div>` (before line 4573), add:

```tsx
{/* Note ordine */}
<div style={{ marginTop: "1rem" }}>
  <label style={{ fontWeight: "500", fontSize: isMobile ? "0.875rem" : "1rem" }}>
    Note
  </label>
  <textarea
    value={orderNotes}
    onChange={(e) => setOrderNotes(e.target.value)}
    placeholder="Note per l'ordine..."
    maxLength={500}
    rows={3}
    style={{
      width: "100%",
      padding: "0.75rem",
      border: "1px solid #d1d5db",
      borderRadius: "8px",
      fontSize: isMobile ? "0.875rem" : "1rem",
      fontFamily: "system-ui",
      resize: "vertical",
      marginTop: "0.5rem",
      boxSizing: "border-box",
    }}
  />
</div>
```

**Step 7: Reset noShipping and notes in handleResetForm**

Find `handleResetForm` function and add:

```typescript
setNoShipping(false);
setOrderNotes("");
```

**Step 8: Run type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

**Step 9: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(order-form): add no-shipping checkbox and notes textarea"
```

---

## Task 9: Display noShipping and notes in PendingOrdersPage card

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

**Step 1: Update shipping display in card totals (lines 1746-1776)**

Replace the shipping costs block with logic that respects `noShipping`:

```tsx
{/* Shipping Costs */}
{(() => {
  if (order.noShipping) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
          fontSize: isMobile ? "0.8125rem" : "0.875rem",
          color: "#9ca3af",
        }}
      >
        <span style={{ textDecoration: "line-through" }}>
          Spese di trasporto K3
        </span>
        <span style={{ fontWeight: "500", textDecoration: "line-through" }}>
          {formatCurrency(0)}
        </span>
      </div>
    );
  }
  if (shippingCost > 0) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
          fontSize: isMobile ? "0.8125rem" : "0.875rem",
        }}
      >
        <span style={{ color: "#f59e0b" }}>
          Spese di trasporto K3
          <span style={{ fontSize: "0.75rem", marginLeft: "0.25rem" }}>
            ({formatCurrency(shippingCost)} + IVA)
          </span>
        </span>
        <span style={{ fontWeight: "500", color: "#f59e0b" }}>
          {formatCurrency(shippingCost + shippingTax)}
        </span>
      </div>
    );
  }
  return null;
})()}
```

**Step 2: Update shipping cost calculation in the totals IIFE (lines 1656-1676)**

Replace lines 1656-1660:

```typescript
const shippingCosts = order.noShipping
  ? { cost: 0, tax: 0, total: 0 }
  : calculateShippingCosts(subtotalAfterGlobalDiscount);
const shippingCost = shippingCosts.cost;
const shippingTax = shippingCosts.tax;
```

**Step 3: Add notes display after totals section**

After the order totals `</div>` (around line 1816), before the error message section, add:

```tsx
{order.notes && (
  <div
    style={{
      padding: isMobile ? "0.625rem" : "0.75rem",
      backgroundColor: "#fffbeb",
      borderTop: "1px solid #fbbf24",
      fontSize: isMobile ? "0.8125rem" : "0.875rem",
    }}
  >
    <span style={{ fontWeight: "600", color: "#92400e" }}>Note: </span>
    <span style={{ color: "#78350f" }}>{order.notes}</span>
  </div>
)}
```

**Step 4: Run type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

**Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "feat(pending-orders): display noShipping and notes in order cards"
```

---

## Task 10: Create DevExpress field dump script

**Files:**
- Create: `archibald-web-app/backend/scripts/dump-order-fields.ts`

**Step 1: Write the dump script**

```typescript
/**
 * Dump all DevExpress input controls on the order detail page.
 * Usage: npx tsx scripts/dump-order-fields.ts
 *
 * Requires a running Archibald bot session. Opens an existing order
 * and dumps all input/textarea/select elements with their IDs and labels.
 */
import { ArchibaldBot } from '../src/bot/archibald-bot';

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error('Usage: npx tsx scripts/dump-order-fields.ts <orderId>');
    process.exit(1);
  }

  const bot = new ArchibaldBot();
  await bot.initialize();

  // Navigate to order detail
  const url = `https://4.231.124.90/Archibald/SALESTABLE_DetailViewAgent/${orderId}/?mode=Edit`;
  await bot.page!.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Dump all inputs, textareas, and selects
  const fields = await bot.page!.evaluate(() => {
    const results: Array<{
      tag: string;
      id: string;
      name: string;
      type: string;
      value: string;
      label: string;
      nearbyText: string;
      rect: { x: number; y: number; w: number; h: number };
    }> = [];

    const elements = document.querySelectorAll('input, textarea, select, [class*="dxeEditArea"]');
    elements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.offsetParent === null) return; // skip hidden

      const rect = htmlEl.getBoundingClientRect();

      // Find nearby label text
      let label = '';
      const parentTd = htmlEl.closest('td');
      if (parentTd) {
        const prevTd = parentTd.previousElementSibling;
        if (prevTd) label = prevTd.textContent?.trim() || '';
      }
      if (!label) {
        const parent = htmlEl.parentElement;
        if (parent) {
          const prevSibling = parent.previousElementSibling;
          if (prevSibling) label = prevSibling.textContent?.trim() || '';
        }
      }

      // Get nearby text for context
      const container = htmlEl.closest('[id]');
      const nearbyText = container
        ? container.textContent?.substring(0, 100)?.trim() || ''
        : '';

      results.push({
        tag: el.tagName.toLowerCase(),
        id: htmlEl.id || '',
        name: (el as HTMLInputElement).name || '',
        type: (el as HTMLInputElement).type || '',
        value: (el as HTMLInputElement).value?.substring(0, 50) || '',
        label,
        nearbyText: nearbyText.substring(0, 100),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
      });
    });

    return results;
  });

  console.log(`\n=== Found ${fields.length} fields ===\n`);

  // Group by section (approximate by Y position)
  const sorted = fields.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);

  for (const field of sorted) {
    console.log([
      `[${field.tag}${field.type ? ':' + field.type : ''}]`,
      `id="${field.id}"`,
      field.name ? `name="${field.name}"` : '',
      `value="${field.value}"`,
      field.label ? `label="${field.label}"` : '',
      `pos=(${field.rect.x},${field.rect.y})`,
    ].filter(Boolean).join('  '));
  }

  // Also look specifically for "DESCRIZIONE", "TESTO ORDINE"
  console.log('\n=== Searching for target fields ===\n');
  const targetFields = await bot.page!.evaluate(() => {
    const targets: Array<{ text: string; nearestInput: string; inputId: string }> = [];
    const allText = document.querySelectorAll('td, span, label, div');
    allText.forEach((el) => {
      const text = el.textContent?.trim() || '';
      if (
        text.includes('DESCRIZIONE') ||
        text.includes('TESTO ORDINE') ||
        text.includes('Dettagli di vendita 02') ||
        text.includes('Dettagli di vendita 04')
      ) {
        // Find nearest input
        const parent = el.closest('tr, td, div');
        const input = parent?.querySelector('input, textarea');
        targets.push({
          text: text.substring(0, 80),
          nearestInput: input ? input.tagName : 'none',
          inputId: input ? (input as HTMLElement).id : '',
        });
      }
    });
    return targets;
  });

  for (const t of targetFields) {
    console.log(`"${t.text}" → ${t.nearestInput} id="${t.inputId}"`);
  }

  await bot.close();
}

main().catch(console.error);
```

**Step 2: Commit**

```bash
git add archibald-web-app/backend/scripts/dump-order-fields.ts
git commit -m "feat(scripts): add DevExpress field dump script for order detail page"
```

---

## Task 11: Add bot method to fill order notes in Archibald ERP

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`

**Step 1: Add helper method `buildOrderNotesText`**

Add as a standalone function near the top of the file (after imports):

```typescript
function buildOrderNotesText(noShipping?: boolean, notes?: string): string {
  const parts: string[] = [];
  if (noShipping) parts.push('NO SPESE DI SPEDIZIONE');
  if (notes?.trim()) parts.push(notes.trim());
  return parts.join('\n');
}
```

**Step 2: Add progress map entry**

In the `BOT_PROGRESS_MAP` in `submit-order.ts` (line 61-70), add after `'form.submit.start'`:

```typescript
'form.notes': { progress: 51, label: 'Inserimento note ordine' },
```

**Step 3: Add `fillOrderNotes` method to ArchibaldBot class**

Add before the `createOrder` method. This method:
1. Clicks the "Panoramica" tab (it should already be visible on order creation page)
2. Finds and fills the DESCRIZIONE field (Dettagli di vendita 02)
3. Finds and fills TESTO ORDINE ESTERNO and TESTO ORDINE INTERNO (Dettagli di vendita 04)

```typescript
private async fillOrderNotes(notesText: string): Promise<void> {
  if (!this.page) throw new Error('Browser non inizializzato');

  logger.info('Filling order notes fields', { notesText });

  // The order form should be on "Panoramica" tab after article entry
  // Click "Panoramica" tab to ensure we're on the right view
  await this.runOp('order.notes.navigate', async () => {
    const clicked = await this.clickElementByText('Panoramica', {
      exact: true,
      selectors: ['a', 'span', 'div', 'li'],
    });
    if (clicked) {
      await this.wait(this.getSlowdown('click_panoramica') || 1000);
    }
  }, 'form.notes');

  // Fill DESCRIZIONE (Dettagli di vendita 02)
  await this.runOp('order.notes.descrizione', async () => {
    await this.fillDevExpressFieldByLabel('DESCRIZIONE', notesText);
  }, 'form.notes');

  // Fill TESTO ORDINE ESTERNO (Dettagli di vendita 04)
  await this.runOp('order.notes.testo_esterno', async () => {
    await this.fillDevExpressFieldByLabel('TESTO ORDINE ESTERNO', notesText);
  }, 'form.notes');

  // Fill TESTO ORDINE INTERNO (Dettagli di vendita 04)
  await this.runOp('order.notes.testo_interno', async () => {
    await this.fillDevExpressFieldByLabel('TESTO ORDINE INTERNO', notesText);
  }, 'form.notes');

  logger.info('Order notes fields filled successfully');
}

private async fillDevExpressFieldByLabel(labelText: string, value: string): Promise<void> {
  if (!this.page) throw new Error('Browser non inizializzato');

  // Strategy 1: Find label text, then find the nearby input
  const filled = await this.page.evaluate((args) => {
    const { labelText, value } = args;
    const allElements = Array.from(document.querySelectorAll('td, span, label, div'));

    for (const el of allElements) {
      const text = el.textContent?.trim().toUpperCase() || '';
      if (!text.includes(labelText.toUpperCase())) continue;

      // Look for input in the same row or adjacent cell
      const row = el.closest('tr');
      if (row) {
        const inputs = row.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), textarea');
        for (const input of inputs) {
          const htmlInput = input as HTMLInputElement;
          if (htmlInput.offsetParent !== null) {
            htmlInput.focus();
            htmlInput.value = value;
            htmlInput.dispatchEvent(new Event('input', { bubbles: true }));
            htmlInput.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
      }

      // Fallback: look in parent/sibling
      const parent = el.parentElement;
      if (parent) {
        const nextSibling = el.nextElementSibling;
        const input = nextSibling?.querySelector('input, textarea') ||
                      parent.querySelector('input:not([type="hidden"]):not([type="checkbox"]), textarea');
        if (input) {
          const htmlInput = input as HTMLInputElement;
          htmlInput.focus();
          htmlInput.value = value;
          htmlInput.dispatchEvent(new Event('input', { bubbles: true }));
          htmlInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
    }
    return false;
  }, { labelText, value });

  if (!filled) {
    logger.warn(`Could not find field with label "${labelText}", trying ID-based approach`);

    // Strategy 2: Try common DevExpress ID patterns
    const possibleIds = await this.page.evaluate((label) => {
      const ids: string[] = [];
      const allInputs = document.querySelectorAll('input, textarea');
      allInputs.forEach((el) => {
        const id = (el as HTMLElement).id.toUpperCase();
        const normalizedLabel = label.toUpperCase().replace(/\s+/g, '');
        if (id.includes(normalizedLabel) || id.includes(label.toUpperCase().replace(/\s+/g, '_'))) {
          ids.push((el as HTMLElement).id);
        }
      });
      return ids;
    }, labelText);

    if (possibleIds.length > 0) {
      await this.page.evaluate((args) => {
        const el = document.getElementById(args.id) as HTMLInputElement;
        if (el) {
          el.focus();
          el.value = args.value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, { id: possibleIds[0], value });
    } else {
      throw new Error(`Field "${labelText}" not found on page`);
    }
  }

  await this.wait(500);
}
```

**Step 4: Call fillOrderNotes in createOrder before save**

In `createOrder` method, add a new step between the N/A discount workaround (step 9.7, line ~6053) and the "STEP 10: Save and close" (line 6055):

```typescript
    // STEP 9.8: Fill order notes (no shipping + notes)
    const notesText = buildOrderNotesText(orderData.noShipping, orderData.notes);
    if (notesText) {
      await this.emitProgress('form.notes');
      await this.fillOrderNotes(notesText);
    }
```

**Step 5: Update OrderData type to include noShipping and notes**

In `archibald-web-app/backend/src/schemas.ts`, the `createOrderSchema` already gets the new fields from Task 6. Verify the `OrderData` type (inferred from schema) will automatically include them.

**Step 6: Run build**

```bash
npm run build --prefix archibald-web-app/backend
```

**Step 7: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): fill DESCRIZIONE and TESTO ORDINE fields with no-shipping flag and notes"
```

---

## Task 12: Run full type-check and tests

**Step 1: Frontend type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

**Step 2: Backend build**

```bash
npm run build --prefix archibald-web-app/backend
```

**Step 3: Frontend tests**

```bash
npm test --prefix archibald-web-app/frontend
```

**Step 4: Backend tests**

```bash
npm test --prefix archibald-web-app/backend
```

**Step 5: Fix any issues found**

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(no-shipping-notes): complete no-shipping checkbox and order notes feature"
```

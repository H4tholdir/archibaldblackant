# No Shipping Costs & Order Notes

## Overview

Add two new fields to order creation:
1. **Checkbox "No spese di spedizione"** next to shipping costs line in article summary
2. **Notes field** (textarea) in article summary step

Both values are saved in pending orders, displayed in pending order cards, and sent to Archibald ERP via the bot.

## Bot Behavior

Before saving/closing the order in Archibald, the bot fills 3 fields:
- **Dettagli di vendita 02** > DESCRIZIONE
- **Dettagli di vendita 04** > TESTO ORDINE ESTERNO
- **Dettagli di vendita 04** > TESTO ORDINE INTERNO

Content format:
- No shipping only: `NO SPESE DI SPEDIZIONE`
- Notes only: `{notes}`
- Both: `NO SPESE DI SPEDIZIONE\n{notes}`
- Neither: skip step entirely

## Changes

### Types

**PendingOrder** (`frontend/src/types/pending-order.ts`):
```typescript
noShipping?: boolean;
notes?: string;
```

**SubmitOrderData** (`backend/src/operations/handlers/submit-order.ts`):
```typescript
noShipping?: boolean;
notes?: string;
```

### Frontend

**OrderFormSimple.tsx** - Article summary step:
- Checkbox inline next to "Spese di trasporto K3" line
- When checked: visually zero out shipping in totals
- Textarea "Note" below "Sconto Globale (%)" with placeholder
- Both values passed through `handleSubmit()` → `savePendingOrder()`

**PendingOrdersPage.tsx** - Order card:
- "No spedizione" indicator in expanded summary
- Notes displayed in expanded detail section

**API layer** (`api/pending-orders.ts`):
- Add `noShipping` and `notes` to save/update payloads

### Backend

**Pending orders routes/repository**:
- Accept and persist `noShipping` and `notes` fields

**submit-order.ts handler**:
- Pass `noShipping` and `notes` to bot

**archibald-bot.ts**:
- New method `fillOrderNotes(page, noShipping, notes)` called before "Salva e chiudi"
- Navigate to "Panoramica" tab (Dettagli di vendita sections)
- Fill DESCRIZIONE, TESTO ORDINE ESTERNO, TESTO ORDINE INTERNO
- Use DevExpress dump script to identify field IDs

### DevExpress Dump Script

Standalone script to read all DevExpress controls on the order detail page and identify the correct IDs for the 3 target fields.

## Edge Cases

- Edit order: restore noShipping and notes values in form
- Fresis orders: noShipping and notes apply same way
- Merged orders: each sub-order can have its own notes

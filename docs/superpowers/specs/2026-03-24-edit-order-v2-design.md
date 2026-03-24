# Design: Edit Order v2 – noShipping, Verifica Post-Modifica, Refresh Totali, Fix Sconto

**Data**: 2026-03-24
**Scope**: `archibald-web-app/frontend` + `archibald-web-app/backend`

## Obiettivo

Estendere la modalità di modifica ordine (`TabArticoli` in `OrderCardNew.tsx`) con quattro miglioramenti:

1. **Checkbox "Spese di trasporto"** — rispecchia esattamente la logica di `OrderFormSimple.tsx`, con rilevamento automatico dello stato precedente dalle note formattate
2. **Verifica post-modifica sincrona** — dopo il salvataggio su Archibald ERP, il backend scarica e confronta gli articoli registrati con quelli inviati; mostra discrepanze all'utente
3. **Aggiornamento immediato totali** — dopo la modifica, `order_records` viene aggiornato con i nuovi totali calcolati dagli articoli; la scheda PWA si aggiorna via WebSocket senza aspettare il sync di background
4. **Fix propagazione sconto** — correzione condizione nel bot (sconto=0 non applicato) + logging per debugging

---

## Cambio semantica: `order_records.notes`

**Stato attuale (sbagliato)**: `order_records.notes` contiene solo il testo grezzo dell'utente (es. `"consegna urgente"`). Il marker `"NO SPESE DI SPEDIZIONE"` esiste solo su Archibald ERP e viene perso al ricaricamento.

**Stato corretto**: `order_records.notes` contiene il testo formattato completo inviato ad Archibald ERP (es. `"NO SPESE DI SPEDIZIONE\nconsegna urgente"`). Questo è il testo prodotto da `buildOrderNotesText(noShipping, rawNotes)`.

**Impatto**:
- `submit-order.ts`: cambia INSERT da `data.notes ?? null` a `buildOrderNotesText(data.noShipping, data.notes) || null`
- `edit-order.ts`: cambia UPDATE da `data.notes` a `buildOrderNotesText(data.noShipping, data.notes) || null`
- I record esistenti nel DB hanno `notes = NULL` o testo grezzo — compatibili: il parsing riconosce l'assenza del marker e imposta `noShipping = false`

---

## Sezione 1 – Checkbox "Spese di trasporto" in edit mode

### Nuova utility `parse-order-notes.ts`

**File**: `frontend/src/utils/parse-order-notes.ts`

Funzione `parseOrderNotesForEdit(fullText?: string | null): { noShipping: boolean; notes: string }`:
- Controlla se `fullText` contiene il marker `"NO SPESE DI SPEDIZIONE"`
- Se presente: `noShipping = true`, rimuove la riga del marker (con eventuale `\n`) dal testo, restituisce il testo rimanente trimmato
- Se assente: `noShipping = false`, restituisce il testo com'è (o stringa vuota)

Unit test collocati in `parse-order-notes.spec.ts` (stesso livello):
- marker presente + note → estrae entrambi
- solo marker senza note → `notes: ""`
- solo note senza marker → `noShipping: false`, notes invariate
- testo null/undefined → `{ noShipping: false, notes: "" }`
- marker in mezzo al testo (non inizio) → `noShipping: false` (marker vale solo come prima riga)

### Chiamata site in `OrderCardNew.tsx`

Prima di renderizzare `<TabArticoli>`, viene chiamato `parseOrderNotesForEdit(order.notes)`. Il risultato produce due valori: `initialNotes` (testo puro, senza marker) e `initialNoShipping` (bool), passati come prop separati a `TabArticoli`.

### Nuovi props `TabArticoli`

Aggiunta ai prop esistenti:
```
initialNotes?: string           // testo puro (già presente)
initialNoShipping?: boolean     // nuovo — rilevato dal parsing
initialDiscountPercent?: number // già presente
```

### Nuovi state in `TabArticoli`

```
editNoShipping: boolean  // inizialmente false
```

Seed nel `useEffect` su `editing`:
```
if (editing) {
  setEditNoShipping(initialNoShipping ?? false)
  setEditNotes(initialNotes ?? "")
  setGlobalEditDiscount(...)
}
```

Auto-reset: effect separato su `[editNoShipping, editTotals.itemsSubtotal]`:
- Se `editNoShipping && editTotals.itemsSubtotal >= SHIPPING_THRESHOLD` → `setEditNoShipping(false)`

### Calcolo `editTotals`

Il `useMemo` esistente viene modificato: il calcolo shipping usa `editNoShipping`:
- `editNoShipping = true` → `shippingCost = 0`, `shippingTax = 0`
- `editNoShipping = false` → `calculateShippingCosts(itemsSubtotal)` come prima

### UI checkbox nel box riepilogo

La riga "Spese di trasporto K3" nel box riepilogo è **identica a `OrderFormSimple.tsx`**:
- Visibile se: `rawShipping.cost > 0` (subtotale < soglia) OPPURE `editNoShipping = true`
- Colore amber se spese attive, grigio se spuntato (`editNoShipping = true`)
- Testo con `line-through` se spuntato
- Importo: `0€` se spuntato, altrimenti costo+IVA
- Il checkbox è cliccabile, aggiorna `editNoShipping`

### Payload `handleConfirmEdit`

```
noShipping: editNoShipping || undefined
notes: editNotes.trim()  // invariato
```

### Backend `EditOrderData` e bot

`EditOrderData` aggiunge `noShipping?: boolean`.

`EditOrderBot.editOrderInArchibald` aggiunge 4° parametro `noShipping?: boolean`.

In `handleEditOrder`: guard diventa `if (data.notes !== undefined || data.noShipping !== undefined)`. Costruisce `buildOrderNotesText(data.noShipping, data.notes)`, lo usa per:
1. Chiamata bot: `fillOrderNotes(notesText)`
2. Aggiornamento DB: `UPDATE order_records SET notes = $1 ...` con il testo formattato

`archibald-bot.ts`: aggiunta 4° parametro `noShipping?: boolean` a `editOrderInArchibald`. Chiama `buildOrderNotesText(noShipping, notes)`.

`main.ts` wrapper: aggiornato per passare `noShipping` come 4° argomento.

---

## Sezione 2 – Verifica post-modifica sincrona

### Principio

Stesso meccanismo di `submit-order.ts` (`performInlineOrderSync` + `verifyOrderArticles`). Viene eseguito all'interno della stessa operazione `edit-order`, dopo il salvataggio su Archibald ERP e dopo l'aggiornamento di `order_articles` nel DB.

### Prerequisiti architetturali

`performInlineOrderSync` e `verifyOrderArticles` devono essere esportate da `submit-order.ts` (o estratte in un modulo condiviso `inline-sync.ts`). `createEditOrderHandler` riceve un parametro opzionale `inlineSyncDeps?` dello stesso tipo usato in `submit-order`.

`main.ts` passa `inlineSyncDeps` a `createEditOrderHandler` (stessa istanza già passata a `createSubmitOrderHandler`).

### Flusso in `handleEditOrder`

Dopo il blocco di aggiornamento `order_articles` (già esistente):

1. Se `data.updatedItems` è presente E `inlineSyncDeps` è disponibile:
2. `onProgress(85, 'Verifica modifica su Archibald...')`
3. Scarica articoli da Archibald via inline sync
4. Confronta con `data.updatedItems` come "snapshot atteso"
   - Metrica primaria: `lineAmount` per riga (presente nel PDF)
   - Non confrontare `discountPercent` direttamente (il PDF Archibald non lo include per riga)
5. Aggiorna `order_records.verification_status` (`"verified"` o `"mismatch_detected"`)
6. Emette evento WebSocket con risultato e dettaglio discrepanze

### Visualizzazione in `OrderCardNew.tsx`

Listener WebSocket per `VERIFICATION_RESULT` (già gestito per i nuovi ordini). Quando l'`orderId` coincide con l'ordine appena modificato, mostra banner:
- ✅ Verde: "Modifica confermata da Archibald ERP"
- ⚠️ Ambra: "Discrepanze rilevate:" + lista righe con atteso/trovato

Il banner compare sotto il pannello di modifica o come notifica inline sulla card.

---

## Sezione 3 – Aggiornamento immediato totali in `order_records`

### Backend `edit-order.ts`

Dopo l'INSERT degli articoli aggiornati in `order_articles`, viene eseguita una query che somma i nuovi valori e aggiorna `order_records`:

- `gross_amount` = somma di tutti i `line_amount`
- `total_vat_amount` = somma di tutti i `vat_amount`
- `total_with_vat` = somma di tutti i `line_total_with_vat`

La query è atomica rispetto alla transazione già esistente che gestisce `order_articles`.

### Frontend

Nessun cambiamento: `ORDER_EDIT_COMPLETE` WebSocket → `fetchOrders({ background: true })` già presente in `OrderHistory.tsx`. Con i totali aggiornati in DB, il reload mostra i valori corretti immediatamente.

---

## Sezione 4 – Fix propagazione sconto

### Problemi identificati

**Problema 1 – condizione nel bot**: `setEditRowDiscount` viene chiamato solo se `mod.discount !== undefined && mod.discount > 0`. La condizione `> 0` impedisce di azzerare uno sconto esistente su Archibald (discount=0 viene ignorato silenziosamente).

**Problema 2 – nessun logging**: non è possibile verificare dai log di produzione se `setEditRowDiscount` viene effettivamente chiamato e con quale valore.

### Fix

Condizione corretta: `mod.discount !== undefined` (senza il `> 0`). Se lo sconto è 0, viene comunque impostato il campo MANUALDISCOUNT a 0, azzerando lo sconto esistente.

Aggiunta di log informativi prima e dopo la chiamata a `setEditRowDiscount`: valore inviato, valore letto dopo applicazione, esito (successo/retry/errore).

### Verifica

Dopo il fix, eseguire test E2E con ordine contenente sconto 63%:
1. Modificare lo sconto a 0% → verificare che Archibald mostri 0%
2. Modificare lo sconto da 0% a 63% → verificare che Archibald mostri 63%
3. La verifica post-modifica (Sezione 2) fornirà conferma automatica

---

## File da modificare

| File | Tipo |
|------|------|
| `frontend/src/utils/parse-order-notes.ts` | Nuovo — utility parsing |
| `frontend/src/utils/parse-order-notes.spec.ts` | Nuovo — unit test |
| `frontend/src/components/OrderCardNew.tsx` | Modifica — noShipping checkbox, verifica banner, call site |
| `backend/src/operations/handlers/edit-order.ts` | Modifica — noShipping, inlineSyncDeps, totali refresh |
| `backend/src/operations/handlers/submit-order.ts` | Modifica — salva testo formattato completo in notes |
| `backend/src/bot/archibald-bot.ts` | Modifica — 4° parametro noShipping, fix discount condition, logging |
| `backend/src/main.ts` | Modifica — noShipping wrapper, inlineSyncDeps a edit handler |
| `backend/src/operations/handlers/edit-order.spec.ts` | Modifica — nuovi test per noShipping e totali refresh |

---

## Vincoli e limiti accettati

- **noShipping non retroattivo per ordini senza notes**: ordini esistenti con `notes = NULL` partono con `noShipping = false`. Comportamento corretto: non possiamo dedurre lo stato precedente.
- **discountPercent non nel PDF**: la verifica post-modifica confronta `lineAmount` (che riflette lo sconto applicato) e non `discountPercent` direttamente.
- **inlineSyncDeps opzionale**: se non disponibile (test o contesto senza sync), la verifica viene saltata silenziosamente (stessa logica di submit-order).
- **Regola E2E pre-deploy**: obbligatoria dopo modifiche a `archibald-bot.ts` (`feedback_e2e_before_deploy.md`).

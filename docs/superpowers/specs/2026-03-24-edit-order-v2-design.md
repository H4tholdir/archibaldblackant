# Design: Edit Order v2 – noShipping, Verifica Post-Modifica, Refresh Totali, Fix Sconto

**Data**: 2026-03-24
**Scope**: `archibald-web-app/frontend` + `archibald-web-app/backend`

## Prerequisiti

- Migrazione `031-order-records-notes.sql` già applicata (colonna `notes TEXT` in `order_records`)

---

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

**`buildOrderNotesText` come utility condivisa**

Attualmente `buildOrderNotesText` è definita in `archibald-bot.ts`. Per poterla usare anche in `submit-order.ts` (handler backend, non bot), va estratta in `backend/src/utils/order-notes.ts` ed esportata da lì. `archibald-bot.ts` e `submit-order.ts` la importano entrambi da quel modulo.

**Impatto DB**:
- `submit-order.ts`: cambia INSERT da `data.notes ?? null` a `buildOrderNotesText(data.noShipping, data.notes) || null`
- `edit-order.ts`: cambia UPDATE da `data.notes` a `buildOrderNotesText(data.noShipping, data.notes) || null`
- I record esistenti con `notes = NULL` o testo grezzo sono compatibili: il parsing riconosce l'assenza del marker e imposta `noShipping = false`

**Limite accettato**: se un utente ha scritto manualmente il testo `"NO SPESE DI SPEDIZIONE"` come nota libera (caso estremo), il parsing lo interpreterebbe erroneamente come flag attivo. Non viene aggiunta protezione per questo edge case.

---

## Sezione 1 – Checkbox "Spese di trasporto" in edit mode

### Nuova utility `parse-order-notes.ts`

**File**: `frontend/src/utils/parse-order-notes.ts`

Funzione `parseOrderNotesForEdit(fullText?: string | null): { noShipping: boolean; notes: string }`:
- Controlla se `fullText` **inizia con** il marker `"NO SPESE DI SPEDIZIONE"` (prima riga)
- Se presente: `noShipping = true`, rimuove la riga del marker (con eventuale `\n`) dal testo, restituisce il testo rimanente trimmato
- Se assente o marker non in prima posizione: `noShipping = false`, restituisce il testo com'è (o stringa vuota)

Unit test collocati in `parse-order-notes.spec.ts` (stesso livello):
- marker in prima riga + note → `{ noShipping: true, notes: "consegna urgente" }`
- solo marker senza note → `{ noShipping: true, notes: "" }`
- solo note senza marker → `{ noShipping: false, notes: "consegna urgente" }`
- testo null/undefined → `{ noShipping: false, notes: "" }`
- marker in mezzo al testo (non prima riga) → `noShipping: false`, notes invariate

### Chiamata site in `OrderCardNew.tsx`

`OrderCardNew.tsx` contiene un'unica occorrenza del rendering di `<TabArticoli ...>` (cerca `<TabArticoli` nel file). In quel sito, prima del render, viene chiamato `parseOrderNotesForEdit(order.notes)`. Il risultato produce due valori: `initialNotes` (testo puro, senza marker) e `initialNoShipping` (bool), passati come prop separati a `TabArticoli`.

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

Seed nel `useEffect` su `editing` (già esistente per `editNotes` e `globalEditDiscount`):
```
setEditNoShipping(initialNoShipping ?? false)
```

Auto-reset: effect separato su `[editNoShipping, editTotals.itemsSubtotal]`:
- Se `editNoShipping && editTotals.itemsSubtotal >= SHIPPING_THRESHOLD` → `setEditNoShipping(false)`

### Calcolo `editTotals`

Il `useMemo` esistente viene modificato: il calcolo shipping dipende da `editNoShipping`:
- `editNoShipping = true` → `shippingCost = 0`, `shippingTax = 0`
- `editNoShipping = false` → `calculateShippingCosts(itemsSubtotal)` come prima

`editNoShipping` va aggiunto alle dipendenze del `useMemo`.

### UI checkbox nel box riepilogo

La riga "Spese di trasporto K3" nel box riepilogo è **identica a `OrderFormSimple.tsx`**:
- Visibile se: `rawShipping.cost > 0` (subtotale < soglia) OPPURE `editNoShipping = true`
- Colore amber (`#f59e0b`) se spese attive, grigio (`#9ca3af`) se spuntato
- Testo con `line-through` se spuntato
- Importo: `0€` se spuntato, altrimenti costo+IVA
- Il checkbox è cliccabile, aggiorna `editNoShipping`
- Subfrase `(15,45€ + IVA)` visibile solo se `!editNoShipping && rawShipping.cost > 0`

### Payload `handleConfirmEdit`

```
noShipping: editNoShipping || undefined
notes: editNotes.trim()  // invariato
```

### Backend — `EditOrderData`, handler, bot

**`EditOrderData`** (in `edit-order.ts`): aggiunge `noShipping?: boolean`.

**`handleEditOrder`**: la guard per le note diventa `if (data.notes !== undefined || data.noShipping !== undefined)`. Costruisce `notesText = buildOrderNotesText(data.noShipping, data.notes)` (importato da `backend/src/utils/order-notes.ts`), lo usa per:
1. Chiamata bot: 4° argomento `noShipping` (vedi sotto)
2. Aggiornamento DB: `UPDATE order_records SET notes = $1` con `notesText || null`

**`archibald-bot.ts`** — firma `editOrderInArchibald` aggiorna da 3 a 4 parametri:
```
editOrderInArchibald(archibaldOrderId, modifications, notes?, noShipping?)
```
Internamente: `buildOrderNotesText(noShipping, notes)` sostituisce `buildOrderNotesText(undefined, notes)`. Guard: `if (notes !== undefined || noShipping !== undefined)`.

**`EditOrderBot` interface** (in `edit-order.ts`): aggiorna la firma del metodo con il 4° parametro `noShipping?: boolean`.

**`main.ts` wrapper** (riga 524): aggiorna lambda da `(id, data, notes)` a `(id, data, notes, noShipping)` con passthrough al bot reale.

---

## Sezione 2 – Verifica post-modifica sincrona

### Moduli già esistenti

`performInlineOrderSync` è esportata da `backend/src/verification/inline-order-sync.ts`.
`verifyOrderArticles` è esportata da `backend/src/verification/verify-order-articles.ts`.
`InlineSyncDeps` è re-esportata da `submit-order.ts` tramite `export type { InlineSyncDeps } from '../../verification/inline-order-sync'`.

`edit-order.ts` importa direttamente da quei moduli `verification/`, senza passare per `submit-order.ts`.

### Signature `createEditOrderHandler`

Aggiunge 3° parametro opzionale:
```
createEditOrderHandler(pool, botFactory, inlineSyncDeps?: InlineSyncDeps)
```

`main.ts` passa la stessa istanza `inlineSyncDeps` già presente per `createSubmitOrderHandler`.

### Flusso in `handleEditOrder`

Dopo il blocco di aggiornamento `order_articles` (già esistente), se `data.updatedItems` è presente E `inlineSyncDeps` è disponibile:

1. `onProgress(85, 'Verifica modifica su Archibald...')`
2. Scarica articoli da Archibald via `performInlineOrderSync(inlineSyncDeps, data.orderId, userId, onProgress)`
   - **Note**: `performInlineOrderSync` internamente chiama `saveArticlesToDb` che sovrascrive `order_articles` con i valori reali letti da Archibald ERP e aggiorna anche i totali in `order_records`. Questo è **intenzionale**: al termine della verifica, `order_articles` e `order_records` riflettono lo stato reale di Archibald (fonte di verità), non solo i valori attesi inviati dalla PWA. L'aggiornamento totali della Sezione 3 viene quindi eseguito anche qui — non è un conflitto ma una ridondanza accettata utile nei casi senza `inlineSyncDeps`.
   - **ID da passare**: `data.orderId` è il DB id dell'ordine. Se `performInlineOrderSync` richiede internamente `archibald_order_id`, lo recupera autonomamente da `order_records` (come già avviene in `submit-order.ts`). L'implementatore verifica la firma di `performInlineOrderSync` per confermare quale ID si aspetta.
3. Confronta gli articoli scaricati con `data.updatedItems` come snapshot atteso
   - Metrica primaria: `lineAmount` per riga (presente nel PDF Archibald)
   - `discountPercent` non confrontato direttamente: il PDF non lo include per riga
4. Aggiorna `order_records.verification_status` (`"verified"` o `"mismatch_detected"`)
5. Emette evento WebSocket con risultato e dettaglio discrepanze

Se `inlineSyncDeps` non disponibile o sync fallisce: `onProgress(95, 'Verifica posticipata')`, continua senza bloccare.

### Visualizzazione in `OrderCardNew.tsx`

Listener WebSocket per `VERIFICATION_RESULT` (già gestito per i nuovi ordini). Quando `orderId` coincide con l'ordine appena modificato, mostra banner:
- ✅ Verde: "Modifica confermata da Archibald ERP"
- ⚠️ Ambra: "Discrepanze rilevate:" + lista righe con atteso/trovato (es. `H129FSQ.104.023: atteso 60,05€ → trovato 162,30€`)

---

## Sezione 3 – Aggiornamento immediato totali in `order_records`

### Backend `edit-order.ts`

Dopo l'INSERT degli articoli in `order_articles`, all'interno della stessa transazione, aggiorna `order_records` con i totali ricalcolati:

- `gross_amount` = somma di tutti i `line_amount`
- `total_vat_amount` = somma di tutti i `vat_amount`
- `total_with_vat` = somma di tutti i `line_total_with_vat`

Una singola query UPDATE con subquery aggregate su `order_articles` è sufficiente.

### Frontend

Nessun cambiamento: `ORDER_EDIT_COMPLETE` WebSocket → `fetchOrders({ background: true })` già presente in `OrderHistory.tsx`. Con i totali aggiornati in DB, il reload mostra i valori corretti immediatamente.

---

## Sezione 4 – Fix propagazione sconto

### Problemi identificati

**Problema 1 – condizione nel bot**: `setEditRowDiscount` viene chiamato solo se `mod.discount !== undefined && mod.discount > 0`. La condizione `> 0` impedisce di azzerare uno sconto esistente su Archibald (discount=0 viene ignorato silenziosamente).

**Problema 2 – nessun logging**: non è possibile verificare dai log di produzione se `setEditRowDiscount` viene effettivamente chiamato e con quale valore.

### Fix

Condizione corretta nel bot: `mod.discount !== undefined` (rimossa la parte `&& mod.discount > 0`). Se lo sconto è 0, viene comunque impostato il campo MANUALDISCOUNT a 0, azzerando lo sconto esistente su Archibald.

Aggiunta di `logger.info` prima e dopo la chiamata a `setEditRowDiscount`: valore inviato, esito dopo applicazione (successo/retry/errore).

### Verifica post-fix

Eseguire test E2E obbligatorio (regola `feedback_e2e_before_deploy.md`):
1. Modificare articolo con sconto corrente 63% → impostare a 0% → verificare su Archibald
2. Modificare articolo con sconto 0% → impostare a 63% → verificare su Archibald
3. La verifica post-modifica (Sezione 2) fornisce conferma automatica tramite confronto `lineAmount`

---

## File da modificare

| File | Tipo |
|------|------|
| `backend/src/utils/order-notes.ts` | Nuovo — estrae `buildOrderNotesText` da archibald-bot.ts |
| `frontend/src/utils/parse-order-notes.ts` | Nuovo — utility parsing note formattate |
| `frontend/src/utils/parse-order-notes.spec.ts` | Nuovo — unit test |
| `frontend/src/components/OrderCardNew.tsx` | Modifica — noShipping checkbox, verifica banner, call site |
| `backend/src/operations/handlers/edit-order.ts` | Modifica — noShipping, inlineSyncDeps, totali refresh |
| `backend/src/operations/handlers/submit-order.ts` | Modifica — importa da order-notes.ts, salva testo formattato |
| `backend/src/bot/archibald-bot.ts` | Modifica — importa da order-notes.ts, 4° param noShipping, fix discount, logging |
| `backend/src/main.ts` | Modifica — noShipping nel wrapper, inlineSyncDeps a createEditOrderHandler |
| `backend/src/operations/handlers/edit-order.spec.ts` | Modifica — test noShipping, totali refresh |

---

## Vincoli e limiti accettati

- **noShipping non retroattivo per ordini senza notes**: ordini con `notes = NULL` partono con `noShipping = false`. Corretto.
- **Marker manualmente scritto**: se un utente ha scritto `"NO SPESE DI SPEDIZIONE"` come prima riga di una nota libera, viene erroneamente riconosciuto come flag. Limite accettato.
- **discountPercent non nel PDF Archibald**: la verifica post-modifica confronta `lineAmount` come proxy dello sconto applicato.
- **inlineSyncDeps opzionale**: verifica saltata silenziosamente se non disponibile.
- **Regola E2E pre-deploy**: obbligatoria per ogni deploy con modifiche a `archibald-bot.ts`.

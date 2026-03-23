# Design: Edit Order – Full Parity con New Order Form

**Data**: 2026-03-24
**Scope**: `archibald-web-app/frontend` + `archibald-web-app/backend`

## Obiettivo

La modalità di modifica di un ordine esistente (tab Articoli in `OrderCardNew.tsx`) deve
comportarsi esattamente come il form di creazione (`OrderFormSimple.tsx`), aggiungendo
le feature oggi mancanti:

1. Icona cestino (🗑️) al posto della ✕ per rimuovere un articolo
2. Campo "Sconto su tutte le righe (%)"
3. Campo "Note" pre-popolato con le note esistenti dell'ordine
4. Riepilogo totali con Imponibile cliccabile (dialog via sconto)
5. Riepilogo totali con TOTALE (con IVA) cliccabile (dialog con logica Maggiorazione)
6. Note inviate al bot Archibald durante il salvataggio della modifica

---

## Approccio scelto

**Full parity in un unico blocco**: frontend + backend + bot. Il cambiamento bot
è contenuto (aggiunta di `notes?` a `editOrderInArchibald` + chiamata `fillOrderNotes`
prima del salvataggio finale).

---

## Sezione 1 – Frontend (`OrderCardNew.tsx` → `TabArticoli`)

### Nuovi props

```ts
initialNotes?: string          // order.notes (testo grezzo già salvato nel DB)
initialDiscountPercent?: number // parsato da order.discountPercent (es. "17,98 %" → 17.98)
```

Passati da `OrderCardNew` quando renderizza `<TabArticoli>`:

```tsx
<TabArticoli
  ...
  initialNotes={order.notes}
  initialDiscountPercent={parseOrderDiscountPercent(order.discountPercent)}
/>
```

`parseOrderDiscountPercent` è una piccola utility che:
- rimuove il simbolo `%` e gli spazi
- sostituisce la virgola con il punto
- restituisce `parseFloat(...)` oppure `0` se non valido

### Nuovi state

```ts
const [editNotes, setEditNotes] = useState("")
const [globalEditDiscount, setGlobalEditDiscount] = useState("")

// Imponibile dialog
const [showImponibileDialog, setShowImponibileDialog] = useState(false)
const [imponibileTarget, setImponibileTarget] = useState("")
const [imponibileSelectedItems, setImponibileSelectedItems] = useState<Set<string>>(new Set())

// Totale dialog
const [showTotaleDialog, setShowTotaleDialog] = useState(false)
const [totaleTarget, setTotaleTarget] = useState("")
const [totaleSelectedItems, setTotaleSelectedItems] = useState<Set<string>>(new Set())

// Maggiorazione (target > totale corrente)
const [showMarkupPanel, setShowMarkupPanel] = useState(false)
const [markupAmount, setMarkupAmount] = useState(0)
const [markupArticleSelection, setMarkupArticleSelection] = useState<Set<string>>(new Set())
```

**Inizializzazione al momento di entrare in edit mode** (useEffect su `editing`):
```ts
useEffect(() => {
  if (editing) {
    setEditNotes(initialNotes ?? "")
    setGlobalEditDiscount(
      initialDiscountPercent && initialDiscountPercent > 0
        ? String(initialDiscountPercent)
        : ""
    )
  }
}, [editing])
```

### Modifica alla tabella

- Il pulsante di rimozione riga sostituisce il testo `✕` con `🗑️` (stessa emoji usata in `OrderItemsList.tsx`)

### Layout della sezione edit (sotto la tabella articoli)

```
[ tabella articoli + "Aggiungi articolo" ]

Sconto su tutte le righe (%)
[ input numerico ]

Note
[ textarea, pre-popolata con initialNotes ]

┌─────────────────────────────────────────┐  ← bordo blu (#3b82f6)
│ Subtotale articoli:          XXX €      │
│ Imponibile: (clicca per mod.)  XXX €    │  ← cliccabile → imponibile dialog
│ ☐ Spese trasporto K3 (X€+IVA) XXX €    │  ← se imponibile < soglia
│ IVA Totale:                  XXX €      │
│ TOTALE (con IVA): (clicca)   XXX €      │  ← cliccabile → totale dialog
└─────────────────────────────────────────┘
```

### Calcolo `editTotals` (useMemo su `editItems`)

```ts
const editTotals = useMemo(() => {
  const itemsSubtotal = editItems.reduce((s, i) => s + i.lineAmount, 0)
  const shipping = calculateShippingCosts(itemsSubtotal)
  const finalVAT = editItems.reduce((s, i) => s + i.vatAmount, 0)
    + shipping.taxAmount
  const finalTotal = itemsSubtotal + shipping.cost + finalVAT
  return { itemsSubtotal, shippingCost: shipping.cost, shippingTax: shipping.taxAmount, finalVAT, finalTotal }
}, [editItems])
```

### Sconto su tutte le righe

Al cambio del campo, sovrascrive `discountPercent` di ogni `editItem` con il nuovo valore
e ricalcola via `recalcLineAmounts` (già esistente nel file):

```ts
const disc = parseFloat(val.replace(",", ".")) || 0
setEditItems(prev => prev.map(item =>
  recalcLineAmounts({ ...item, discountPercent: disc })
))
```

### Imponibile dialog (solo "Via sconto")

Logica identica a `handleImponibileViaSconto` in `OrderFormSimple.tsx`:
- Seleziona subset di righe su cui agire
- Calcola lo sconto necessario per raggiungere il target imponibile
- Applica con correzione centesimi sull'ultima riga selezionata
- Prezzi non modificabili in edit mode → bottone "Via prezzo" assente

### Totale dialog

Logica identica a `handleTotaleCalcola` in `OrderFormSimple.tsx`:
- Se target < totale corrente: calcola imponibile netto corrispondente e applica sconto
- Se target > totale corrente: mostra pannello "Maggiorazione", distribuisce aumento
  proporzionalmente sulle righe selezionate (logica `handleApplyMarkup`)

### Payload `handleSaveClick`

```ts
const result = await enqueueOperation('edit-order', {
  orderId,
  modifications,
  updatedItems: editItems,
  notes: editNotes.trim() !== "" ? editNotes.trim() : "",
  // "" cancella le note esistenti; undefined non le tocca
  // qui usiamo sempre il valore corrente del campo
})
```

---

## Sezione 2 – Backend (`edit-order.ts`)

### Tipo `EditOrderData` aggiornato

```ts
type EditOrderData = {
  orderId: string
  modifications: Array<Record<string, unknown>>
  updatedItems?: EditOrderArticle[]
  notes?: string   // undefined = non toccare; "" = cancella; testo = aggiorna
}
```

### Interfaccia bot `EditOrderBot` aggiornata

```ts
type EditOrderBot = {
  editOrderInArchibald(
    orderId: string,
    modifications: ...,
    notes?: string
  ): Promise<{ success: boolean; message: string }>
  setProgressCallback: ...
}
```

### Logica `handleEditOrder` aggiornata

1. Chiama `bot.editOrderInArchibald(data.orderId, data.modifications, data.notes)`
2. **Se** `data.notes !== undefined`, dopo la transazione degli articoli:
   ```sql
   UPDATE agents.order_records
   SET notes = $1
   WHERE id = $2 AND user_id = $3
   ```

---

## Sezione 3 – Bot (`archibald-bot.ts`)

### Firma `editOrderInArchibald` aggiornata

```ts
async editOrderInArchibald(
  archibaldOrderId: string,
  modifications: [...],
  notes?: string
): Promise<{ success: boolean; message: string }>
```

### Nuovo step "fill notes" prima di "Salva e chiudi"

Posizione: dopo tutti gli update/add/delete di righe (riga ~8145), prima di
`await this.emitProgress("edit.save")`:

```ts
if (notes !== undefined) {
  const notesText = buildOrderNotesText(undefined, notes)
  await this.fillOrderNotes(notesText)
  // fillOrderNotes naviga alla tab Panoramica e scrive i campi note
  // L'ordine è già aperto in edit mode → nessun problema di navigazione
}
```

`buildOrderNotesText` è già importato/definito nello stesso file.

---

## Testing

### Unit tests da aggiungere / aggiornare

- `parseOrderDiscountPercent` – unit test in `*.spec.ts` collocato vicino all'utility
- `editTotals` memoization – verificare subtotale, IVA, totale con casi: 0 articoli,
  sconto 0%, sconto parziale
- `handleImponibileViaSconto` (logic copy) – test già esistenti in `DiscountSystem.spec.tsx`
  da verificare che coprono il caso edit mode

### Integration test

- `edit-order.ts` handler: aggiungere test che verifica che `notes` venga passato al bot
  e salvato in DB quando `data.notes !== undefined`
- Verificare che `notes === undefined` non aggiorna il campo DB (preservazione)

### E2E (obbligatorio pre-deploy per modifiche bot)

Secondo la regola `feedback_e2e_before_deploy.md`:
- Eseguire test E2E in produzione dopo le modifiche a `archibald-bot.ts`
- Verificare: modifica ordine con note → riaprire ordine su Archibald → confermare che le
  note siano presenti
- Verificare: modifica ordine senza note (`notes = undefined`) → note esistenti invariate

---

## File da modificare

| File | Tipo modifica |
|------|--------------|
| `frontend/src/components/OrderCardNew.tsx` | Aggiunta feature (state, UI, logica) |
| `frontend/src/utils/parse-order-discount.ts` | Nuovo file utility (piccola funzione) |
| `backend/src/operations/handlers/edit-order.ts` | Aggiunta campo `notes` |
| `backend/src/bot/archibald-bot.ts` | Aggiunta parametro `notes` a `editOrderInArchibald` |
| `frontend/src/utils/parse-order-discount.spec.ts` | Nuovi unit test |
| `backend/src/operations/handlers/edit-order.spec.ts` | Aggiornamento test integration |

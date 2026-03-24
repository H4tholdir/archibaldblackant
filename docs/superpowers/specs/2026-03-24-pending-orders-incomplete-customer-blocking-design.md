# Design: Blocco ordini cliente incompleto + gestione errore INVENTTABLE

**Data:** 2026-03-24
**File modificati:** `frontend/src/pages/PendingOrdersPage.tsx`

---

## Contesto

Nella pagina "Ordini in Attesa" (`/pending-orders`), un ordine associato a un cliente con dati incompleti (P.IVA non validata, PEC/SDI mancante, indirizzo mancante, CAP mancante) mostra un badge generico "⚠ Cliente incompleto". Attualmente:

1. Il checkbox rimane selezionabile → l'utente può tentare l'invio → il backend restituisce un errore "Dati cliente incompleti".
2. Il badge non indica cosa manca né offre un'azione diretta per correggere il problema.
3. L'errore `INVENTTABLE field not focused` (edge case bot ERP) viene mostrato come testo tecnico grezzo.

---

## Obiettivi

1. **Bloccare** la selezione/invio di ordini con cliente incompleto.
2. **Mostrare** nel badge i campi mancanti e un'azione per correggerli (stesso pattern di `OrderFormSimple.tsx`).
3. **Umanizzare** il messaggio di errore `INVENTTABLE field not focused` con testo esplicativo + pulsante per completare la scheda.

---

## Modifiche — `PendingOrdersPage.tsx` (solo file toccato)

### 1. Stato aggiuntivo

```ts
const [editCustomerForCompleteness, setEditCustomerForCompleteness] =
  useState<RichCustomer | null>(null);
// Profilo del cliente in corso di validazione VAT (stringa = customerProfile)
const [validatingCustomerProfile, setValidatingCustomerProfile] =
  useState<string | null>(null);
```

Unica istanza di `useVatValidation` per tutta la pagina:

```ts
const { validate: validateVat, status: vatValidationStatus, reset: resetVatValidation } =
  useVatValidation();
```

Quando `vatValidationStatus` transisce a `'done'`, un `useEffect` aggiorna la entry di `validatingCustomerProfile` in `customersMap` richiamando il singolo endpoint per-cliente (vedi sezione 4), poi azzera `validatingCustomerProfile` e resetta il hook.

```ts
useEffect(() => {
  if (vatValidationStatus === 'done' && validatingCustomerProfile) {
    refreshCustomer(validatingCustomerProfile);
    setValidatingCustomerProfile(null);
    resetVatValidation();
  }
}, [vatValidationStatus, validatingCustomerProfile]);
```

Un singolo `validatingCustomerProfile` è sufficiente perché il pulsante "Valida ora" è disabilitato fintanto che `validatingCustomerProfile !== null`, impedendo invocazioni concorrenti.

### 2. Badge "Cliente incompleto" migliorato

Al posto di `⚠ Cliente incompleto` statico:

- Mostra `completeness.missing.join(', ')` (es. "P.IVA non validata, PEC o SDI mancante").
- Se solo P.IVA mancante (`completeness.missing.length === 1 && completeness.missing[0] === 'P.IVA non validata'`) **e `richCustomer.vatNumber` è non-null** → pulsante **"Valida ora →"** con spinner se `validatingCustomerProfile === order.customerId`. Il click chiama `validateVat(richCustomer.customerProfile, richCustomer.vatNumber)`. Se `richCustomer.vatNumber` è null, ricade nel caso "Completa scheda" (manca il numero IVA da validare).
- Altrimenti → pulsante **"Completa scheda →"** (imposta `editCustomerForCompleteness = richCustomer`).

Il pulsante "Valida ora" è disabilitato quando `validatingCustomerProfile !== null` (un'altra validazione è già in corso).

### 3. Blocco checkbox

Il checkbox è disabilitato (`disabled`, `cursor: 'not-allowed'`, `opacity: 0.45`) quando `!completeness.ok` **e l'ordine non è ghost-only** (vedi sezione 5 — edge case).

```ts
const isCustomerIncomplete = !!richCustomer && !checkCustomerCompleteness(richCustomer).ok;
const isGhostOnly = order.items.length > 0 && order.items.every(i => i.isGhostArticle);
const checkboxDisabled = isCustomerIncomplete && !isGhostOnly;
```

- `handleSelectOrder`: ignora silenziosamente l'ordine se `checkboxDisabled`.
- `handleSelectAll` e il pulsante "Seleziona Tutti" usano un nuovo valore derivato `completableOrders`:

```ts
const completableOrders = selectableOrders.filter((o) => {
  const c = customersMap.get(o.customerId);
  if (!c) return true; // mappa non ancora caricata: non bloccare
  const isGhostOnly = o.items.every(i => i.isGhostArticle);
  return checkCustomerCompleteness(c).ok || isGhostOnly;
});
```

Il `checked` del header checkbox è `selectedOrderIds.size === completableOrders.length && completableOrders.length > 0`.

`handleSubmitOrders`: guard finale che filtra silenziosamente gli ordini con cliente incompleto e logga `console.warn`. Non mostra errori separati perché la UI ne impedisce già la selezione.

### 4. Refresh per-cliente dopo completamento

`refreshCustomer(customerProfile: string)` chiama `GET /api/customers/:profile` direttamente (stesso pattern di `fetchAndSetCustomerCompleteness` in `OrderFormSimple.tsx`) e aggiorna solo la entry corrispondente in `customersMap`:

```ts
const refreshCustomer = useCallback(async (customerProfile: string) => {
  const token = localStorage.getItem('archibald_jwt') ?? '';
  const res = await fetch(`/api/customers/${encodeURIComponent(customerProfile)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const updated: RichCustomer = await res.json();
  setCustomersMap((prev) => new Map(prev).set(customerProfile, updated));
}, []);
```

Viene chiamata sia dal `useEffect` su `vatValidationStatus === 'done'` (sezione 1) sia da `handleCompletenessModalClose` (sezione 6).

### 5. Esenzione ordini ghost-only

Gli ordini in cui **tutti** gli articoli hanno `isGhostArticle === true` vengono inviati al backend senza il check `isCustomerComplete` (coerente con `submit-order.ts` riga 183). Anche nel frontend il checkbox rimane abilitato per questi ordini indipendentemente dalla completeness del cliente.

### 6. CustomerCreateModal

```tsx
const handleCompletenessModalClose = () => {
  const profile = editCustomerForCompleteness?.customerProfile;
  setEditCustomerForCompleteness(null);
  if (profile) refreshCustomer(profile);
};

{editCustomerForCompleteness && (
  <CustomerCreateModal
    isOpen={true}
    onClose={handleCompletenessModalClose}
    onSaved={handleCompletenessModalClose}
    editCustomer={editCustomerForCompleteness}
  />
)}
```

### 7. Errore INVENTTABLE — display frontend

Quando `order.errorMessage?.includes('INVENTTABLE field not focused')`, nei due punti di rendering dell'errore (`isJobFailed` nella progress bar e `order.status === 'error'` nel riquadro errore), sostituire il testo raw con:

> "La scheda anagrafica del cliente **[order.customerName]** non è completa in Archibald ERP e non è stato possibile inserire gli articoli. Aggiorna i dati del cliente e reinvia l'ordine."

Seguito da un pulsante **"Completa scheda →"** visibile solo se `customersMap.get(order.customerId)` è disponibile, che imposta `editCustomerForCompleteness = customersMap.get(order.customerId)`.

Il pulsante "🔄 Riprova Ordine" rimane visibile sotto per reinviare dopo la correzione.

> **Nota terminologia**: `order.customerId` (campo di `PendingOrder`) e `customerProfile` (campo di `RichCustomer`) si riferiscono allo stesso valore. `customersMap` è indicizzata per `customerProfile`. Le due espressioni `customersMap.get(order.customerId)` e `customersMap.get(customer.customerProfile)` sono equivalenti.

---

## Casi limite

| Scenario | Comportamento |
|---|---|
| `customersMap` non ancora caricato | Badge non mostrato, checkbox abilitato (stesso comportamento attuale) |
| Cliente con solo P.IVA mancante | "Valida ora →" con spinner; disabilitato se altra validazione in corso |
| VAT validation fallisce | Toast errore (gestito da `useVatValidation`), badge rimane, `validatingCustomerProfile` azzerato |
| INVENTTABLE error ma cliente non in `customersMap` | Testo esplicativo mostrato, pulsante "Completa scheda" nascosto |
| Ordine ghost-only (tutti gli articoli `isGhostArticle`) | Checkbox abilitato anche se cliente incompleto (coerente col guard backend) |
| Ordine in stato "completed-warehouse" | Non ha checkbox, non impattato |
| Secondo click "Valida ora" mentre validazione in corso | Pulsante disabilitato, ignorato |

---

## Nessuna modifica backend

Il check `isCustomerComplete` in `submit-order.ts` già blocca l'invio lato server. Il frontend ora blocca prima dell'invio. L'errore INVENTTABLE viene trasformato solo a livello display.

# CustomerCreateModal — Bug Fixes + Responsive (Piano D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correggere i 4 bug identificati nel wizard di creazione cliente, aggiungere il supporto responsive per mobile/tablet/desktop, ripulire il vecchio codice in PendingOrdersPage, e assicurarsi che i due entry point (CustomerList e OrderFormSimple) funzionino correttamente.

**Architecture:** Tutti i fix sono chirurgici sui file esistenti. Non si crea nessuna nuova pagina — `CustomerCreateModal` rimane un modal wizard. Il responsive viene gestito con viewport detection (`window.innerWidth`) all'interno del modal. Il bot session start viene spostato da "all'apertura del modal" a "quando l'utente clicca Verifica P.IVA". La race condition VAT viene risolta con un guard nel handler WebSocket.

**Tech Stack:** React 19, TypeScript strict, inline styles esclusivamente, Vitest + Testing Library. Test: `npm test --prefix archibald-web-app/frontend`.

---

## Mappa file

| File | Azione | Problema risolto |
|---|---|---|
| `frontend/src/pages/PendingOrdersPage.tsx` | Modifica | Bug 1 — rimuove editCustomerForCompleteness + CustomerCreateModal, usa CustomerQuickFix |
| `frontend/src/components/CustomerCreateModal.tsx` | Modifica | Bug 2 (VAT race), Bug 4 (bot lazy start), Responsive |
| `frontend/src/pages/CustomerList.tsx` | Modifica | Bug 3 — "Nuovo Cliente" apre modal invece di navigare a /customers/new |

---

## Task 1: Fix Bug 1 — Rimuovere CustomerCreateModal da PendingOrdersPage

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

Il problema: 3 bottoni chiamano `setEditCustomerForCompleteness(richCustomer)` che apre `CustomerCreateModal` come wizard CREATE per un cliente esistente. Il `CustomerQuickFix` è già presente e gestisce correttamente il completamento.

- [ ] **Step 1.1: Trovare il contesto dei 3 pulsanti**

```bash
grep -n "setEditCustomerForCompleteness\|handleCompletenessModalClose\|editCustomerForCompleteness\|CustomerCreateModal" archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx | head -20
```

- [ ] **Step 1.2: Rimuovere lo stato `editCustomerForCompleteness` e la funzione `handleCompletenessModalClose`**

Rimuovere le righe:
```typescript
// Da rimuovere (riga ~86):
const [editCustomerForCompleteness, setEditCustomerForCompleteness] =
  useState<RichCustomer | null>(null);

// Da rimuovere (righe ~335-339):
const handleCompletenessModalClose = () => {
  const profile = editCustomerForCompleteness?.customerProfile;
  setEditCustomerForCompleteness(null);
  if (profile) refreshCustomer(profile);
};
```

- [ ] **Step 1.3: Sostituire i 3 pulsanti "Completa scheda →"**

Ogni pulsante che chiama `setEditCustomerForCompleteness(richCustomer)` va sostituito con `setQuickFixCustomer`. Il `setQuickFixCustomer` richiede `{ customerProfile, customerName, missingFields }`.

**Pulsante riga ~1367** (contesto: cliente con solo VAT non validata):
```tsx
// Prima:
onClick={() => setEditCustomerForCompleteness(richCustomer)}

// Dopo:
onClick={() => {
  const c = checkCustomerCompleteness(richCustomer);
  setQuickFixCustomer({
    customerProfile: richCustomer.customerProfile,
    customerName: richCustomer.name,
    missingFields: c.missingFields,
  });
}}
```

**Pulsante riga ~1576** (contesto: ordine con cliente incompleto):
```tsx
// Prima:
onClick={() => setEditCustomerForCompleteness(customersMap.get(order.customerId)!)}

// Dopo:
onClick={() => {
  const c = customersMap.get(order.customerId);
  if (!c) return;
  const completeness = checkCustomerCompleteness(c);
  setQuickFixCustomer({
    customerProfile: c.customerProfile,
    customerName: c.name,
    missingFields: completeness.missingFields,
  });
}}
```

**Pulsante riga ~1638** (stesso pattern del 1576 — applicare la stessa modifica):
```tsx
// Prima:
onClick={() => setEditCustomerForCompleteness(customersMap.get(order.customerId)!)}

// Dopo: (identico al pulsante riga ~1576)
onClick={() => {
  const c = customersMap.get(order.customerId);
  if (!c) return;
  const completeness = checkCustomerCompleteness(c);
  setQuickFixCustomer({
    customerProfile: c.customerProfile,
    customerName: c.name,
    missingFields: completeness.missingFields,
  });
}}
```

- [ ] **Step 1.4: Rimuovere il blocco CustomerCreateModal dal JSX**

Trovare e rimuovere completamente il blocco:
```tsx
{editCustomerForCompleteness && (
  <CustomerCreateModal
    isOpen={true}
    onClose={handleCompletenessModalClose}
    onSaved={handleCompletenessModalClose}
  />
)}
```

- [ ] **Step 1.5: Rimuovere l'import di CustomerCreateModal**

```typescript
// Rimuovere questa riga:
import { CustomerCreateModal } from '../components/CustomerCreateModal';
```

- [ ] **Step 1.6: Verificare che `checkCustomerCompleteness` sia già importata**

```bash
grep -n "import.*checkCustomerCompleteness\|checkCustomerCompleteness" archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx | head -5
```
Se non è importata, aggiungere:
```typescript
import { checkCustomerCompleteness } from '../utils/customer-completeness';
```

- [ ] **Step 1.7: Type-check e test**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -8
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 1.8: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "fix(pending-orders): rimuove CustomerCreateModal obsoleto, usa CustomerQuickFix"
```

---

## Task 2: Fix Bug 2 — Guard race condition VAT in CustomerCreateModal

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

Il problema: `CUSTOMER_VAT_RESULT` handler chiama `setCurrentStep({ kind: "vat-review" })` incondizionatamente. Se il bot risponde in ritardo mentre l'utente è già in step-indirizzo o cap-disambiguation, il wizard viene resettato.

- [ ] **Step 2.1: Leggere il handler CUSTOMER_VAT_RESULT esatto**

```bash
sed -n '390,415p' archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
```

- [ ] **Step 2.2: Aggiungere il guard al CUSTOMER_VAT_RESULT handler**

Trovare il blocco:
```typescript
subscribe("CUSTOMER_VAT_RESULT", (payload: any) => {
  if (payload.sessionId !== interactiveSessionIdRef.current) return;
  const result = payload.vatResult as VatLookupResult;
  setVatResult(result);

  setCurrentStep({ kind: "vat-review" });
  setFormData((prev) => ({
    ...
  }));
}),
```

Sostituire `setCurrentStep({ kind: "vat-review" })` e il `setFormData` con la versione guardata:

```typescript
subscribe("CUSTOMER_VAT_RESULT", (payload: any) => {
  if (payload.sessionId !== interactiveSessionIdRef.current) return;
  const result = payload.vatResult as VatLookupResult;
  setVatResult(result);

  // Guard: aggiorna lo step SOLO se siamo ancora nel flusso VAT.
  // Una risposta VAT ritardata non deve resettare il wizard se l'utente
  // ha già avanzato oltre (es. cap-disambiguation → step-indirizzo → etc.)
  setCurrentStep((prev) => {
    if (prev.kind !== 'vat-input' && prev.kind !== 'vat-processing') return prev;
    return { kind: 'vat-review' };
  });

  // Popola formData solo se siamo ancora nel flusso VAT
  setFormData((prev) => {
    // Se non siamo più in un VAT step, ignora i dati del bot
    // (currentStep è già avanzato — prev qui è il formData, non lo step)
    return {
      ...prev,
      vatNumber: earlyVatInputRef.current.trim() || prev.vatNumber,
      name: vatCompanyName(result) || prev.name,
      street: result.parsed?.street || prev.street,
      postalCode: result.parsed?.postalCode || prev.postalCode,
      postalCodeCity: result.parsed?.city || prev.postalCodeCity,
      pec: result.pec || prev.pec,
      sdi: result.sdi || prev.sdi,
    };
  });
}),
```

**Nota:** Il `setFormData` viene eseguito sempre (vogliamo che i dati VAT siano disponibili anche se li utilizziamo dopo), ma `setCurrentStep` è il guard critico che impedisce il reset visivo.

- [ ] **Step 2.3: Type-check e test**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 2.4: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "fix(create-customer): guard CUSTOMER_VAT_RESULT race condition dopo cap-disambiguation"
```

---

## Task 3: Fix Bug 3 — CustomerList apre modal invece di navigare

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerList.tsx`

Il problema: `navigate('/customers/new')` naviga a una route inesistente. La route `/customers/:customerProfile` matcha "new" come customerProfile → `CustomerDetailPage` cerca il cliente "new" → errore 404.

- [ ] **Step 3.1: Aggiungere import di CustomerCreateModal**

In cima a `CustomerList.tsx`, aggiungere dopo gli import esistenti:
```typescript
import { CustomerCreateModal } from '../components/CustomerCreateModal';
```

- [ ] **Step 3.2: Aggiungere stato per la modal**

Nel corpo di `CustomerList()`, dopo gli stati esistenti, aggiungere:
```typescript
const [createModalOpen, setCreateModalOpen] = useState(false);
```

- [ ] **Step 3.3: Modificare il pulsante "Nuovo Cliente"**

Trovare la riga ~414 con `navigate('/customers/new')` e sostituire con:
```tsx
<button
  onClick={() => setCreateModalOpen(true)}
  style={{
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 600,
    border: "1px solid #4caf50",
    borderRadius: "8px",
    backgroundColor: "#4caf50",
    color: "#fff",
    cursor: "pointer",
    transition: "all 0.2s",
  }}
  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#43a047"; }}
  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#4caf50"; }}
>
  + Nuovo Cliente
</button>
```

- [ ] **Step 3.4: Aggiungere CustomerCreateModal al JSX**

Alla fine del return, prima della `</div>` di chiusura principale, aggiungere:
```tsx
<CustomerCreateModal
  isOpen={createModalOpen}
  onClose={() => setCreateModalOpen(false)}
  onSaved={() => {
    setCreateModalOpen(false);
    void fetchCustomers();
  }}
/>
```

- [ ] **Step 3.5: Rimuovere `navigate` se non usato altrove in CustomerList**

Verificare:
```bash
grep -n "navigate(" archibald-web-app/frontend/src/pages/CustomerList.tsx | head -10
```
`navigate` è ancora usato per `handleNavigate` (naviga alla scheda cliente) — NON rimuovere l'import.

- [ ] **Step 3.6: Type-check e test**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 3.7: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerList.tsx
git commit -m "fix(customer-list): Nuovo Cliente apre modal wizard invece di navigare a /customers/new"
```

---

## Task 4: Fix Bug 4 — Bot VAT lazy start (sessione on-demand)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

Il problema: `startInteractiveSession()` viene chiamato immediatamente all'apertura del modal (riga ~268). Se il bot è occupato, l'utente vede "Bot in avvio..." e il bottone "Verifica" è disabilitato anche se potrebbe già inserire la P.IVA. La sessione dovrebbe partire solo quando l'utente vuole davvero verificare.

- [ ] **Step 4.1: Rimuovere l'auto-start della sessione all'apertura del modal**

Nel `useEffect` che gestisce `isOpen` (righe ~258-285), rimuovere il blocco `startInteractiveSession`:

```typescript
// Rimuovere questo blocco:
if (contextMode !== "order") customerService
  .startInteractiveSession()
  .then(({ sessionId }) => {
    setInteractiveSessionId(sessionId);
  })
  .catch((err) => {
    console.error(
      "[CustomerCreateModal] Failed to start interactive session:",
      err,
    );
    setCurrentStep({ kind: "field", fieldIndex: 0 });
  });
```

**Il resto del useEffect** (reset form, setCurrentStep vat-input, cancella sessione al chiusura) rimane invariato.

- [ ] **Step 4.2: Aggiornare `handleSubmitVat` per avviare la sessione on-demand**

Sostituire la funzione `handleSubmitVat` esistente (riga 674):

```typescript
const handleSubmitVat = async () => {
  const vat = earlyVatInput.trim();
  if (!vat) return;

  setVatError(null);
  setCurrentStep({ kind: "vat-processing" });

  try {
    // Se la sessione non è ancora avviata, avviarla ora
    let sessionId = interactiveSessionId;
    if (!sessionId && contextMode !== "order") {
      const { sessionId: newId } = await customerService.startInteractiveSession();
      setInteractiveSessionId(newId);
      sessionId = newId;
    }

    if (sessionId) {
      await customerService.submitVatNumber(sessionId, vat);
    } else {
      // contextMode === "order": nessuna sessione interattiva, salta VAT
      setCurrentStep({ kind: "step-anagrafica" });
    }
  } catch (err) {
    setVatError(
      err instanceof Error ? err.message : "Errore avvio verifica P.IVA. Riprova.",
    );
    setCurrentStep({ kind: "vat-input" });
  }
};
```

**Nota:** La funzione diventa `async`. Cercare tutti i punti in cui viene chiamata e aggiungere `void`:
```bash
grep -n "handleSubmitVat" archibald-web-app/frontend/src/components/CustomerCreateModal.tsx | head -10
```
Per ogni chiamata come `handleSubmitVat()` in onKeyDown o simili, trasformare in `void handleSubmitVat()`. Il JSX con `onClick={handleSubmitVat}` è già corretto — React gestisce natively le promise nei click handler.

- [ ] **Step 4.3: Aggiornare il pulsante "Verifica" — rimuovere dipendenza da `botReady`**

Trovare il rendering del pulsante "Verifica" (intorno riga 1002):
```typescript
// Prima:
disabled={earlyVatInput.trim().length === 0 || !botReady}

// Dopo:
disabled={earlyVatInput.trim().length === 0}
```

- [ ] **Step 4.4: Rimuovere/nascondere il banner "Bot in avvio…"**

Nel rendering `vat-input`, trovare il banner `{!botReady && (...)}` e rimuoverlo o sostituirlo con niente. L'utente non deve più vedere "Bot in avvio..." — il bot parte in background quando clicca Verifica.

```typescript
// Rimuovere completamente il blocco:
{!botReady && (
  <div style={{ background: "#e3f2fd" }}>
    <spinner /> Bot in avvio...
  </div>
)}
{botReady && (
  <div style={{ background: "#e8f5e9" }}>Bot pronto</div>
)}
```

- [ ] **Step 4.5: Type-check e test**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -8
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 4.6: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "fix(create-customer): bot session avviata on-demand su Verifica P.IVA, non all'apertura"
```

---

## Task 5: Responsive CustomerCreateModal

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

Il modal attuale ha `maxWidth: 500px; width: 90%` senza nessuna logica responsive. Su mobile (< 640px) il modal è scomodo — deve essere full screen. Su desktop (> 1024px) può essere più largo con step labels.

- [ ] **Step 5.1: Aggiungere variabili viewport nel componente**

Nel corpo di `CustomerCreateModal`, aggiungere dopo le variabili di step (le `const is...`):

```typescript
const isMobile  = window.innerWidth < 640;
const isDesktop = window.innerWidth >= 1024;
```

- [ ] **Step 5.2: Aggiornare il container overlay per mobile full-screen**

Trovare il `div` esterno con `position: "fixed", backgroundColor: "rgba(0,0,0,0.5)"` (riga ~779) e aggiornare lo style:

```tsx
<div
  style={{
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: isMobile ? "white" : "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: isMobile ? "flex-start" : "center",
    justifyContent: "center",
    zIndex: 10000,
    backdropFilter: isMobile ? "none" : "blur(4px)",
    overflowY: isMobile ? "auto" : "visible",
    ...(!isMobile ? modalOverlayKeyboardStyle : {}),
  }}
>
```

- [ ] **Step 5.3: Aggiornare il div interno (la "carta" del modal)**

Trovare il `div` interno con `backgroundColor: "#fff", borderRadius: "16px"` (riga ~790) e aggiornare:

```tsx
<div
  style={{
    backgroundColor: "#fff",
    borderRadius: isMobile ? "0" : "16px",
    padding: isMobile ? "16px" : "32px",
    maxWidth: isMobile ? "100%" : (isDesktop ? "580px" : "500px"),
    width: isMobile ? "100%" : "90%",
    minHeight: isMobile ? "100vh" : "auto",
    maxHeight: isMobile ? "none" : "90vh",
    overflowY: isMobile ? "visible" : "auto",
    boxShadow: isMobile ? "none" : "0 20px 60px rgba(0,0,0,0.3)",
    ...(!isMobile ? keyboardPaddingStyle : {}),
  }}
>
```

- [ ] **Step 5.4: Aggiornare il progress bar degli step per mostrare label su desktop**

Trovare il rendering del progress bar (cercare `currentStepNumber` nel JSX o il div con i cerchi numerati degli step) e aggiornarlo per mostrare le label su desktop:

```bash
grep -n "currentStepNumber\|stepNumber\|progress.*step\|step.*progress\|Passo.*di\|step-indicator" archibald-web-app/frontend/src/components/CustomerCreateModal.tsx | head -15
```

Dopo aver trovato il blocco step indicator, aggiungere le label testuali sui puntini solo quando `isDesktop`:

Il pattern attuale dei dot mostra solo numeri. Su desktop aggiungere sotto ogni dot una label:
```tsx
{/* Nel rendering di ogni step dot, su isDesktop aggiungere: */}
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
  <div style={{ /* stile del dot */ }}>{stepNumber}</div>
  {isDesktop && (
    <div style={{ fontSize: '8px', color: isActiveStep ? '#2563eb' : '#94a3b8', whiteSpace: 'nowrap' }}>
      {stepLabelMap[step.kind] ?? ''}
    </div>
  )}
</div>
```

Il `stepLabelMap` da definire prima del return:
```typescript
const stepLabelMap: Record<string, string> = {
  'vat-input':         'P.IVA',
  'vat-processing':    'P.IVA',
  'vat-review':        'P.IVA',
  'step-anagrafica':   'Anagrafica',
  'step-indirizzo':    'Indirizzo',
  'step-contatti':     'Contatti',
  'step-commerciale':  'Commerciale',
  'addresses':         'Indirizzi',
  'summary':           'Riepilogo',
};
```

- [ ] **Step 5.5: Griglia campi — 2 colonne su tablet, 3 colonne su desktop per gli step multi-campo**

Trovare i rendering degli step `step-anagrafica`, `step-indirizzo`, `step-contatti`, `step-commerciale` e aggiungere grid responsive dove i campi vengono mostrati:

Per ogni sezione multi-campo (es. step-commerciale con 4+ campi), aggiungere il container:
```tsx
<div style={{
  display: 'grid',
  gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : (isMobile ? '1fr' : 'repeat(2, 1fr)'),
  gap: '12px',
}}>
  {/* campi esistenti */}
</div>
```

**Nota:** I field step `{ kind: "field" }` (che mostrano un campo alla volta) rimangono a colonna singola — sono già corretti. La griglia multi-colonna si applica solo agli step compositi (step-anagrafica, step-contatti, ecc.).

- [ ] **Step 5.6: Aggiungere handle pill su mobile**

Su mobile, aggiungere una pill handle in cima al modal per indicare che è dismissibile:
```tsx
{isMobile && (
  <div style={{ width: '32px', height: '3px', background: '#d1d5db', borderRadius: '2px', margin: '0 auto 16px' }} />
)}
```

Inserire come primo figlio del div interno (prima del close button).

- [ ] **Step 5.7: Type-check e test**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -8
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 5.8: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "feat(create-customer): responsive wizard — full screen mobile, modal tablet/desktop con label step"
```

---

## Task 6: Audit globale — verifica consistenza creazione e modifica cliente

**Files:** tutti i file frontend rilevanti (lettura + eventuali fix minori)

- [ ] **Step 6.1: Trovare tutti i posti in cui CustomerCreateModal è ancora usato**

```bash
grep -rn "CustomerCreateModal\|createCustomerOpen\|setCreateCustomerOpen\|CustomerCreateModal.*isOpen" archibald-web-app/frontend/src/ --include="*.tsx" | grep -v ".spec." | grep -v "CustomerCreateModal.tsx"
```

Atteso dopo i fix: solo 3 file la usano:
1. `CustomerList.tsx` — per "Nuovo Cliente" ✓ (appena fixato)
2. `OrderFormSimple.tsx` — per "Crea cliente" quando non trovato ✓ (già corretto, contextMode="order")
3. Nessun altro

Se ci sono altri file non attesi, verificarli e correggerli.

- [ ] **Step 6.2: Trovare tutti i posti in cui CustomerQuickFix è usato**

```bash
grep -rn "CustomerQuickFix\|CustomerQuickFix.*isOpen\|quickFixCustomer\|setQuickFixCustomer" archibald-web-app/frontend/src/ --include="*.tsx" | grep -v ".spec." | grep -v "CustomerQuickFix.tsx"
```

Atteso: 2 file la usano:
1. `PendingOrdersPage.tsx` — per completamento cliente durante ordini ✓ (appena fixato)
2. `OrderFormSimple.tsx` — per editCustomerForCompleteness ✓ (già presente)

- [ ] **Step 6.3: Verificare che NON esistano riferimenti a `isEditMode` o `editCustomer` in CustomerCreateModal**

```bash
grep -n "isEditMode\|editCustomer\|startEditInteractiveSession\|determineVatEditStep" archibald-web-app/frontend/src/components/CustomerCreateModal.tsx | head -10
```

Atteso: 0 risultati.

- [ ] **Step 6.4: Verificare che OrderFormSimple non abbia CustomerCreateModal con `editCustomer`**

```bash
grep -n "editCustomer\|CustomerCreateModal" archibald-web-app/frontend/src/components/OrderFormSimple.tsx | head -10
```

Atteso:
- `CustomerCreateModal` presente senza `editCustomer` prop ✓
- `CustomerQuickFix` presente per il completamento ✓

- [ ] **Step 6.5: Verificare che PendingOrdersPage non abbia più CustomerCreateModal**

```bash
grep -n "CustomerCreateModal\|editCustomerForCompleteness" archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx | head -10
```

Atteso: 0 risultati.

- [ ] **Step 6.6: Verificare che la route /customers/new non sia referenziata in AppRouter**

```bash
grep -n "customers/new\|customers.*new" archibald-web-app/frontend/src/AppRouter.tsx
```

Atteso: 0 risultati (non c'è e non deve esserci — CustomerList apre modal direttamente).

- [ ] **Step 6.7: Test suite completa finale**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend 2>&1 | tail -6
```

Atteso: 0 errori TypeScript, 774+ test PASS.

- [ ] **Step 6.8: Commit audit**

```bash
git add -A
git commit -m "audit(customer): verifica globale create/update — nessun refuso trovato" 2>/dev/null || echo "Nessun file da committare — audit pulito"
```

---

## Verifica finale Piano D

- [ ] **Conferma entry points**
  1. CustomerList → "+ Nuovo Cliente" → CustomerCreateModal si apre ✓
  2. OrderFormSimple → "Crea cliente" (quando search non trova) → CustomerCreateModal si apre con contextMode="order" ✓

- [ ] **Conferma no overlap**
  - PendingOrders: solo CustomerQuickFix per incompleti ✓
  - Nessun CustomerCreateModal che si apre per clienti esistenti ✓

- [ ] **Conferma responsive**
  - Mobile (< 640px): full screen, handle pill, 1 colonna ✓
  - Tablet (641-1024px): modal 500px, overlay, 2 colonne ✓
  - Desktop (≥ 1024px): modal 580px, step con label, 3 colonne ✓

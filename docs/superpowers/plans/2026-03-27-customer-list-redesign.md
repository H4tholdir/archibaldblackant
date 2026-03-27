# CustomerList Redesign + Cleanup — Piano C2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiornare la pagina Clienti per navigare alla nuova `CustomerDetailPage`, aggiungere quick actions 📞💬 visibili sulle card, filtro "Incompleti", griglia responsive a 2 colonne su tablet, e rimuovere il branch `isEditMode` da `CustomerCreateModal`.

**Architecture:** `CustomerList` sostituisce il modal di edit con `useNavigate('/customers/:profile')`. `CustomerCard` acquisisce quick actions 📞💬 inline e badge completezza via `checkCustomerCompleteness`. `CustomerCreateModal` perde il prop `editCustomer` e tutto il codice `isEditMode` — diventa solo per la creazione.

**Tech Stack:** React 19, TypeScript strict, React Router v6 `useNavigate`, `checkCustomerCompleteness` (già in codebase), inline styles. Test: `npm test --prefix archibald-web-app/frontend`.

---

## Mappa file

| File | Azione | Responsabilità |
|---|---|---|
| `frontend/src/components/CustomerCard.tsx` | Modifica | Aggiungere quick actions 📞💬 visibili nella header della card + badge completezza |
| `frontend/src/pages/CustomerList.tsx` | Modifica | Navigate a detail page, rimuovere modal state, aggiungere filtro incompleti, griglia 2-col |
| `frontend/src/components/CustomerCreateModal.tsx` | Modifica | Rimuovere prop `editCustomer`, rimuovere tutto il codice `isEditMode` |

---

## Task 1: `CustomerCard.tsx` — quick actions + badge completezza

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCard.tsx`

La card attualmente mostra "Modifica" solo quando espansa (riga 876-897). Aggiungiamo:
1. Due bottoni 📞💬 visibili nella header della card (collassata o espansa)
2. Badge `⚠ Incompleta` basato su `checkCustomerCompleteness`

- [ ] **Step 1.1: Leggere la struttura della card header per trovare il punto di inserimento**

```bash
sed -n '55,180p' archibald-web-app/frontend/src/components/CustomerCard.tsx
```

Cercare dove è renderizzata la parte alta della card (nome cliente, foto, ecc.) per capire dove inserire i bottoni rapidi.

- [ ] **Step 1.2: Aggiungere import**

In cima a `CustomerCard.tsx`, aggiungere tra gli import esistenti:
```typescript
import { checkCustomerCompleteness } from '../utils/customer-completeness';
```

- [ ] **Step 1.3: Aggiungere `onNavigate` a `CustomerCardProps`**

Nell'interfaccia `CustomerCardProps`, aggiungere:
```typescript
onNavigate?: (customerProfile: string) => void;
```

E nel destructuring della funzione:
```typescript
onNavigate,
```

- [ ] **Step 1.4: Calcolare la completezza e preparare i dati per quick actions**

All'inizio del corpo del componente, dopo le variabili di stato esistenti, aggiungere:
```typescript
const completeness = checkCustomerCompleteness(customer);
const phone = customer.mobile || customer.phone;
```

- [ ] **Step 1.5: Trovare la header della card nel JSX e aggiungere badge + quick actions**

Leggere la zona JSX dove viene mostrato il nome del cliente e aggiungere:

a) **Badge incompletezza** vicino al nome (quando `!completeness.ok`):
```tsx
{!completeness.ok && (
  <span style={{
    fontSize: '10px', fontWeight: 700, color: '#dc2626',
    background: '#fee2e2', padding: '2px 7px', borderRadius: '10px',
    marginLeft: '6px',
  }}>
    ⚠ Incompleta
  </span>
)}
```

b) **Quick actions 📞💬** nell'area destra della header (accanto al toggle espandi):
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
  {phone && (
    <button
      data-testid="card-call"
      onClick={() => { window.location.href = `tel:${phone}`; }}
      title={phone}
      style={{
        padding: '5px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0',
        borderRadius: '6px', fontSize: '14px', cursor: 'pointer', lineHeight: 1,
      }}
    >
      📞
    </button>
  )}
  {(customer.mobile || customer.phone) && (
    <button
      data-testid="card-whatsapp"
      onClick={() => {
        const n = (customer.mobile || customer.phone)!.replace(/\D/g, '');
        window.open(`https://wa.me/${n}`, '_blank');
      }}
      title="WhatsApp"
      style={{
        padding: '5px 8px', background: '#f0fdf4', border: '1px solid #86efac',
        borderRadius: '6px', fontSize: '14px', cursor: 'pointer', lineHeight: 1,
      }}
    >
      💬
    </button>
  )}
</div>
```

**Nota:** i bottoni devono avere `onClick={(e) => e.stopPropagation()}` sul container per non aprire/chiudere la card quando vengono cliccati.

- [ ] **Step 1.6: Aggiornare il bottone "Modifica" per usare `onNavigate`**

Il bottone "Modifica" a riga 876-897 chiama `onEdit`. Aggiornarlo in modo che, se `onNavigate` è fornito, lo usi; altrimenti continui a usare `onEdit` (backward compat):

```tsx
<button
  onClick={() => onNavigate
    ? onNavigate(customer.customerProfile)
    : onEdit(customer.customerProfile)
  }
  style={{ /* stile invariato */ }}
>
  Scheda cliente
</button>
```

Cambiare anche il testo da "Modifica" a "Scheda cliente" per riflettere il nuovo comportamento.

- [ ] **Step 1.7: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

- [ ] **Step 1.8: Suite test**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -6
```

Atteso: 774+ test PASS.

- [ ] **Step 1.9: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCard.tsx
git commit -m "feat(customer-card): add quick actions 📞💬, incompleteness badge, onNavigate prop"
```

---

## Task 2: `CustomerList.tsx` — navigate, filtro incompleti, griglia responsive

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerList.tsx`

- [ ] **Step 2.1: Leggere le righe 80-140 per capire la fetch dei customers**

```bash
sed -n '80,145p' archibald-web-app/frontend/src/pages/CustomerList.tsx
```

- [ ] **Step 2.2: Aggiungere `useNavigate` agli import**

In cima al file, aggiungere `useNavigate` all'import da react-router-dom:
```typescript
import { useNavigate, useSearchParams } from "react-router-dom";
```

- [ ] **Step 2.3: Aggiungere `checkCustomerCompleteness` agli import**

```typescript
import { checkCustomerCompleteness } from '../utils/customer-completeness';
```

- [ ] **Step 2.4: Aggiungere stati necessari e navigate nel corpo del componente**

Dentro `CustomerList()`, aggiungere:

```typescript
const navigate = useNavigate();
const [incompleteOnly, setIncompleteOnly] = useState(false);
const [incompleteCount, setIncompleteCount] = useState<number | null>(null);
```

- [ ] **Step 2.5: Aggiungere fetch del conteggio incompleti all'avvio**

Aggiungere un `useEffect` separato per caricare il count:

```typescript
useEffect(() => {
  const jwt = localStorage.getItem('archibald_jwt') ?? '';
  fetch('/api/customers/stats', { headers: { Authorization: `Bearer ${jwt}` } })
    .then((r) => r.ok ? r.json() : null)
    .then((body: { total: number; incomplete: number } | null) => {
      if (body) setIncompleteCount(body.incomplete);
    })
    .catch(() => {});
}, []);
```

- [ ] **Step 2.6: Modificare `fetchCustomers` per supportare `incompleteOnly`**

Nella funzione `fetchCustomers`, aggiornare la condizione iniziale: quando `incompleteOnly` è `true`, procedere con la fetch anche senza filtri di ricerca. Aggiungere `incompleteOnly` alle dipendenze dell'`useEffect` che chiama `fetchCustomers`.

La fetch quando `incompleteOnly` = true carica tutti i clienti (limit=500, nessun filtro di search) e la filterazione avviene client-side al Step 2.7.

Modifiche alla funzione `fetchCustomers`:

**1. Cambiare la condizione di guard all'inizio:**
```typescript
// Prima (riga ~60):
if (!debouncedSearch && !filters.city && !filters.customerType) {

// Dopo:
if (!incompleteOnly && !debouncedSearch && !filters.city && !filters.customerType) {
```

**2. Quando `incompleteOnly` è true, usare limit=500 e nessun filtro:**
```typescript
// Nei params della fetch, aggiungere:
if (incompleteOnly) {
  params.set('limit', '500');
  // non aggiungere search, city, type
} else {
  if (debouncedSearch) params.append('search', debouncedSearch);
  if (filters.city) params.append('city', filters.city);
  if (filters.customerType) params.append('type', filters.customerType);
  params.append('limit', '100');
}
```

**3. Aggiungere `incompleteOnly` alle dipendenze:**
```typescript
}, [debouncedSearch, filters.city, filters.customerType, incompleteOnly]);
```

**4. L'`useEffect` che chiama `fetchCustomers` deve includere `incompleteOnly`:**
```typescript
useEffect(() => {
  void fetchCustomers();
}, [fetchCustomers]); // fetchCustomers già include incompleteOnly come dep
```

- [ ] **Step 2.7: Applicare filtro completezza client-side**

Dopo aver caricato i customers, calcolare `displayedCustomers`:

```typescript
const displayedCustomers = incompleteOnly
  ? customers.filter((c) => !checkCustomerCompleteness(c).ok)
  : customers;
```

Usare `displayedCustomers` nel `.map()` invece di `customers`.

- [ ] **Step 2.8: Aggiungere il chip "Incompleti" nella sezione filtri**

Nel JSX dei filtri, aggiungere dopo la barra di ricerca:

```tsx
<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
  <button
    onClick={() => setIncompleteOnly(!incompleteOnly)}
    style={{
      padding: '5px 12px', borderRadius: '14px', fontSize: '12px',
      fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
      background: incompleteOnly ? '#fff5f5' : 'white',
      borderColor: incompleteOnly ? '#fca5a5' : '#d1d5db',
      color: incompleteOnly ? '#dc2626' : '#64748b',
    }}
  >
    ⚠ Incompleti{incompleteCount !== null ? ` (${incompleteCount})` : ''}
  </button>
</div>
```

- [ ] **Step 2.9: Sostituire `handleEdit` con navigazione**

Sostituire la funzione `handleEdit` (riga 228-234) con:

```typescript
const handleNavigate = (customerProfile: string) => {
  navigate(`/customers/${encodeURIComponent(customerProfile)}`);
};
```

- [ ] **Step 2.10: Aggiungere griglia 2-colonne su tablet**

Il container delle card (che ora usa un `<div>` con `.map()` alla riga ~526) va aggiornato con:

```typescript
const isTablet = window.innerWidth >= 641;
```

E il container:
```tsx
<div style={{
  display: 'grid',
  gridTemplateColumns: isTablet ? 'repeat(2, 1fr)' : '1fr',
  gap: '16px',
}}>
  {displayedCustomers.map((customer) => (
    // ... CustomerCard
  ))}
</div>
```

- [ ] **Step 2.11: Aggiornare `CustomerCard` con `onNavigate` e rimuovere modal state**

a) Passare `onNavigate={handleNavigate}` alla `CustomerCard`

b) Rimuovere gli stati `modalOpen`, `editingCustomer`

c) Rimuovere l'import di `CustomerCreateModal`

d) Rimuovere il blocco `<CustomerCreateModal ...>` righe 550-559

e) Rimuovere lo stato `editingCustomer` e `modalOpen` dalla riga 43-44

f) Il prop `onEdit` nella CustomerCard può restare (backward compat) ma passare una no-op: `onEdit={() => {}}` — oppure rimuovere `onEdit` se non è più usato altrove. Verificare con:
```bash
grep -rn "onEdit" archibald-web-app/frontend/src/ --include="*.tsx" | grep -v "spec\|CustomerCard.tsx"
```

- [ ] **Step 2.12: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

- [ ] **Step 2.13: Suite test**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -6
```

- [ ] **Step 2.14: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerList.tsx
git commit -m "feat(customer-list): navigate to detail, incomplete filter, 2-col tablet grid"
```

---

## Task 3: `CustomerCreateModal.tsx` — rimuovere `isEditMode`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

La modal ha 2804 righe. Questo task rimuove il branch `isEditMode` in modo chirurgico.

- [ ] **Step 3.1: Localizzare tutto il codice isEditMode**

```bash
grep -n "isEditMode\|editCustomer" archibald-web-app/frontend/src/components/CustomerCreateModal.tsx | head -50
```

- [ ] **Step 3.2: Rimuovere `editCustomer` dall'interfaccia props**

Trovare l'interfaccia delle props (di solito nelle prime 30 righe) e rimuovere:
```typescript
editCustomer?: Customer | null;
```

E rimuovere `editCustomer` dal destructuring dei props.

- [ ] **Step 3.3: Rimuovere la variabile `isEditMode`**

Trovare e rimuovere la riga:
```typescript
const isEditMode = !!editCustomer;
```

- [ ] **Step 3.4: Rimuovere i blocchi `if (isEditMode)` e le ternarie `isEditMode ? ... : ...`**

Questo è il passo più complesso. Strategia:
- Per ogni `if (isEditMode) { ... }` → rimuovere tutto il blocco
- Per ogni `isEditMode ? editValue : createValue` → sostituire con `createValue`
- Per ogni `!isEditMode ? createValue : editValue` → sostituire con `createValue`
- Per ogni `{isEditMode && <element />}` → rimuovere l'elemento condizionale
- Per ogni `{!isEditMode && <element />}` → rimuovere la condizione, tenere solo l'elemento

Usare grep per trovare tutti i punti:
```bash
grep -n "isEditMode" archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
```

Trattare ogni occorrenza individualmente.

- [ ] **Step 3.5: Rimuovere imports/funzioni usate solo in edit mode**

Dopo la rimozione del codice, verificare se rimangono import o funzioni inutilizzati:

```bash
grep -n "startEditInteractiveSession\|determineVatEditStep\|vat-edit-check\|customerToFormData" archibald-web-app/frontend/src/components/CustomerCreateModal.tsx | head -20
```

Se queste funzioni/import non sono più usati nel codice risultante, rimuoverli.

- [ ] **Step 3.6: Aggiornare i siti di utilizzo della modal**

Verificare che nessuno stia ancora passando `editCustomer` alla modal:
```bash
grep -rn "editCustomer\|CustomerCreateModal" archibald-web-app/frontend/src/ --include="*.tsx" | grep -v "spec\|CustomerCreateModal.tsx"
```

Se rimane qualche utilizzo con `editCustomer={...}`, rimuovere quella prop.

- [ ] **Step 3.7: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Se ci sono errori, correggerli prima di procedere.

- [ ] **Step 3.8: Suite test completa**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -6
```

Atteso: tutti i test PASS. Se alcuni test usano `editCustomer` prop, aggiornarli rimuovendo quella prop.

- [ ] **Step 3.9: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "refactor(create-customer-modal): remove isEditMode branch — edit handled by CustomerDetailPage"
```

---

## Verifica finale Piano C2

- [ ] **Type-check completo**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Suite test completa**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -6
```

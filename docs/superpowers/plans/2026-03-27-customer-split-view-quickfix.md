# CustomerList Split View + QuickFix in OrderFormSimple (Piano C4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare la split view desktop nella lista clienti (lista sinistra 38% + scheda destra 62%) e integrare `CustomerQuickFix` in `OrderFormSimple` per gestire i clienti incompleti durante la creazione ordine.

**Architecture:** `CustomerDetailPage` viene refactored per accettare un prop opzionale `customerProfileOverride` che bypassa `useParams` — questo permette di usarlo embedded in split view senza cambio di route. `CustomerList` su desktop (> 1024px) renderizza un layout a due pannelli: lista a sinistra, `CustomerDetailPage` embedded a destra. `OrderFormSimple` sostituisce il `CustomerCreateModal` in edit mode (ora rimosso) con `CustomerQuickFix` che usa i `missingFields` già calcolati da `checkCustomerCompleteness`.

**Tech Stack:** React 19, TypeScript strict, React Router v6 `useParams`/`useNavigate`, inline styles, Vitest + Testing Library. Test: `npm test --prefix archibald-web-app/frontend`.

---

## Mappa file

| File | Azione | Responsabilità |
|---|---|---|
| `frontend/src/pages/CustomerDetailPage.tsx` | Modifica | Accetta `customerProfileOverride` prop + espone interfaccia per uso embedded |
| `frontend/src/pages/CustomerList.tsx` | Modifica | Split view desktop: lista sinistra + CustomerDetailPage destra |
| `frontend/src/components/OrderFormSimple.tsx` | Modifica | Sostituisce CustomerCreateModal edit (rimosso) con CustomerQuickFix |

---

## Task 1: CustomerDetailPage — accettare `customerProfileOverride` prop

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx`

Questo task refactora la pagina per funzionare sia come route standalone che come componente embedded.

- [ ] **Step 1.1: Leggere l'interfaccia attuale del componente**

```bash
head -15 archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx
grep -n "useParams\|customerProfile\|CustomerDetailPage" archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx | head -10
```

- [ ] **Step 1.2: Aggiungere props interface e modificare la firma**

Trovare la dichiarazione della funzione (es. `export function CustomerDetailPage()`) e aggiungere un'interfaccia props + parametro:

```typescript
interface CustomerDetailPageProps {
  customerProfileOverride?: string;
  embedded?: boolean; // true = nessuna topbar, nessun back button
}

export function CustomerDetailPage({
  customerProfileOverride,
  embedded = false,
}: CustomerDetailPageProps = {}) {
  const params = useParams<{ customerProfile: string }>();
  const customerProfile = customerProfileOverride ?? params.customerProfile;
  // ... resto invariato
```

- [ ] **Step 1.3: Nascondere topbar e back button quando `embedded = true`**

Trovare il blocco della topbar (il `div` con `background: '#1e293b'`) e condizionarlo:

```tsx
{!embedded && (
  <div style={{ background: '#1e293b', /* ... */ }}>
    <button onClick={() => navigate('/customers')}>← Clienti</button>
    {/* ... */}
  </div>
)}
```

- [ ] **Step 1.4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 1.5: Suite test**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 1.6: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerDetailPage.tsx
git commit -m "refactor(detail-page): accept customerProfileOverride + embedded prop for split view"
```

---

## Task 2: CustomerList — split view desktop

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerList.tsx`

Su desktop (> 1024px): layout a due colonne. Click su una card non naviga — seleziona il cliente e mostra la sua scheda nel pannello destro. Su mobile/tablet (< 1024px): comportamento invariato (naviga).

- [ ] **Step 2.1: Leggere la struttura JSX attuale del CustomerList**

```bash
sed -n '240,280p' archibald-web-app/frontend/src/pages/CustomerList.tsx
grep -n "handleNavigate\|navigate\|isTablet\|grid\|display.*flex" archibald-web-app/frontend/src/pages/CustomerList.tsx | head -20
```

- [ ] **Step 2.2: Aggiungere import CustomerDetailPage**

In cima a `CustomerList.tsx`, aggiungere:

```typescript
import { CustomerDetailPage } from './CustomerDetailPage';
```

- [ ] **Step 2.3: Aggiungere stato per il cliente selezionato in split view**

Nel corpo del componente, aggiungere:

```typescript
const isDesktop = window.innerWidth > 1024;
const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
```

- [ ] **Step 2.4: Modificare `handleNavigate` per split view vs navigate**

Sostituire la funzione `handleNavigate`:

```typescript
const handleNavigate = (customerProfile: string) => {
  if (isDesktop) {
    setSelectedProfile(customerProfile);
  } else {
    navigate(`/customers/${encodeURIComponent(customerProfile)}`);
  }
};
```

- [ ] **Step 2.5: Aggiornare il layout JSX per split view desktop**

Il contenitore principale del `return` va aggiornato. Trovare il `<div>` che wrappa tutto il contenuto e modificarlo per split view su desktop.

La struttura finale del return:

```tsx
return (
  <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
    {/* Pannello lista (sinistra) */}
    <div style={{
      width: isDesktop && selectedProfile ? '38%' : '100%',
      flexShrink: 0,
      overflowY: 'auto',
      borderRight: isDesktop && selectedProfile ? '1px solid #e5e7eb' : 'none',
      padding: '16px',
      background: '#f5f5f5',
      transition: 'width 0.2s ease',
      ...keyboardPaddingStyle,
    }}>
      {/* Tutto il contenuto attuale della lista: header, filtri, search, cards */}
      {/* ... */}
    </div>

    {/* Pannello dettaglio (destra) — solo desktop con cliente selezionato */}
    {isDesktop && selectedProfile && (
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {/* X per chiudere il pannello */}
        <button
          onClick={() => setSelectedProfile(null)}
          style={{
            position: 'absolute', top: '12px', right: '14px', zIndex: 10,
            background: 'rgba(15,23,42,0.6)', color: 'white', border: 'none',
            borderRadius: '50%', width: '26px', height: '26px', fontSize: '14px',
            cursor: 'pointer', lineHeight: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✕
        </button>
        <CustomerDetailPage
          customerProfileOverride={selectedProfile}
          embedded
        />
      </div>
    )}
  </div>
);
```

**NOTA implementativa:** Il contenuto del pannello lista (tutto ciò che c'era nel return originale) va spostato dentro il `<div>` del pannello sinistro. Il `maxWidth: 1200px` e `margin: 0 auto` del wrapper originale vanno rimossi — la larghezza è ora gestita dalla griglia.

- [ ] **Step 2.6: Evidenziare la card selezionata**

Nella mappa delle CustomerCard, aggiungere un highlighting per la card selezionata. Trovare il `<div>` wrapper di ogni card nel map e aggiungere:

```tsx
<div
  key={customer.customerProfile}
  style={{
    outline: isDesktop && selectedProfile === customer.customerProfile
      ? '2px solid #2563eb'
      : 'none',
    borderRadius: '8px',
  }}
>
  <CustomerCard ... />
</div>
```

- [ ] **Step 2.7: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

- [ ] **Step 2.8: Suite test**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Step 2.9: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerList.tsx
git commit -m "feat(customer-list): desktop split view — lista sinistra 38% + scheda destra 62%"
```

---

## Task 3: OrderFormSimple — CustomerQuickFix per cliente incompleto

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

`OrderFormSimple` usa ancora `CustomerCreateModal` in edit mode per i clienti incompleti (righe ~6350-6359). Dopo il cleanup di Piano C2, la `CustomerCreateModal` non ha più il prop `editCustomer` — questo codice è ora broken. Va sostituito con `CustomerQuickFix`.

- [ ] **Step 3.1: Trovare il codice del cliente incompleto in OrderFormSimple**

```bash
grep -n "editCustomerForCompleteness\|CustomerCreateModal\|CustomerQuickFix\|customerCompleteness\|handleCompletionModalClose\|handleCompletionModal" archibald-web-app/frontend/src/components/OrderFormSimple.tsx | head -25
```

- [ ] **Step 3.2: Leggere il contesto intorno alla riga trovata**

```bash
sed -n '6340,6380p' archibald-web-app/frontend/src/components/OrderFormSimple.tsx
```

- [ ] **Step 3.3: Aggiungere import CustomerQuickFix**

Trovare gli import in cima al file e aggiungere:

```typescript
import { CustomerQuickFix } from './CustomerQuickFix';
```

- [ ] **Step 3.4: Capire il tipo di `customerCompleteness`**

```bash
grep -n "customerCompleteness\|CompletenessResult\|setCustomerCompleteness" archibald-web-app/frontend/src/components/OrderFormSimple.tsx | head -10
```

`customerCompleteness` è di tipo `CompletenessResult | null` con campo `missingFields: MissingFieldKey[]`.

- [ ] **Step 3.5: Sostituire il blocco CustomerCreateModal con CustomerQuickFix**

Trovare il blocco:
```typescript
{editCustomerForCompleteness && (
  <CustomerCreateModal
    isOpen={true}
    onClose={handleCompletionModalClose}
    onSaved={handleCompletionModalClose}
    editCustomer={editCustomerForCompleteness}
  />
)}
```

E sostituirlo con:
```typescript
{editCustomerForCompleteness && (
  <CustomerQuickFix
    customerProfile={editCustomerForCompleteness.customerProfile}
    customerName={editCustomerForCompleteness.name}
    missingFields={customerCompleteness?.missingFields ?? []}
    onSaved={() => {
      handleCompletionModalClose();
      // Ri-carica i dati del cliente per aggiornare il badge completezza
      fetchAndSetCustomerCompleteness(editCustomerForCompleteness.customerProfile);
    }}
    onDismiss={handleCompletionModalClose}
  />
)}
```

**NOTA:** Verificare che `editCustomerForCompleteness` abbia il campo `customerProfile`. Se è di tipo `RichCustomer` (da `src/types/customer.ts`), il campo si chiama `customerProfile`. Verificare con:
```bash
grep -n "editCustomerForCompleteness.*RichCustomer\|RichCustomer.*editCustomer\|setEditCustomerForCompleteness" archibald-web-app/frontend/src/components/OrderFormSimple.tsx | head -5
```

- [ ] **Step 3.6: Verificare che non ci siano altri usi di `CustomerCreateModal` con `editCustomer` in OrderFormSimple**

```bash
grep -n "editCustomer\|CustomerCreateModal" archibald-web-app/frontend/src/components/OrderFormSimple.tsx | head -20
```

Se ci sono altri blocchi `CustomerCreateModal` con `editCustomer`, rimuovere quella prop o sostituire con `CustomerQuickFix` dove appropriato.

- [ ] **Step 3.7: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Se ci sono errori, correggerli. Common issues:
- `editCustomerForCompleteness.customerProfile` potrebbe chiamarsi `id` (se è di tipo local-customer) → usare il campo corretto
- `fetchAndSetCustomerCompleteness` potrebbe accettare `id` o `customerProfile` → verificare

- [ ] **Step 3.8: Suite test completa**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -6
```

Atteso: tutti i test PASS.

- [ ] **Step 3.9: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(order-form): sostituisce CustomerCreateModal edit con CustomerQuickFix per clienti incompleti"
```

---

## Verifica finale Piano C4

- [ ] **Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

- [ ] **Test frontend completi**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -6
```

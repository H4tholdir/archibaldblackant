# Spec: VAT Lookup in Edit Mode (Fase 1)

**Data:** 2026-03-16
**Stato:** Approvato
**Scope:** Fase 1 del progetto multi-indirizzo cliente

---

## Contesto

Nella modifica di un cliente (`CustomerCreateModal` in edit mode), il VAT lookup interattivo viene oggi saltato completamente (`if (!editCustomer)` impedisce l'avvio della sessione interattiva). Questo causa due problemi:

1. Clienti con P.IVA vuota non vengono mai validati né auto-compilati.
2. Clienti con P.IVA già presente non hanno mai ricevuto l'autofill dei campi (nome, indirizzo, PEC, SDI) tramite Archibald.

Questa fase aggiunge il VAT lookup al flow di modifica, con un'interfaccia diff che permette all'utente di scegliere campo per campo quali valori Archibald applicare.

---

## DB — Migration 026

```sql
-- backend/src/db/migrations/026-vat-validated-at.sql
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS vat_validated_at TIMESTAMPTZ;
```

Questo campo determina il comportamento iniziale del modal in edit mode:

| Scenario | vat_validated_at | vat_number | Comportamento |
|----------|-----------------|------------|---------------|
| P.IVA mai inserita | NULL | vuoto/null | Step `vat-input` obbligatorio |
| P.IVA presente, mai validata | NULL | presente | Auto-start sessione → attende `CUSTOMER_INTERACTIVE_READY` → auto-submit VAT |
| P.IVA già validata in precedenza | NOT NULL | presente | Step `vat-edit-check`: opzione Riconvalida / Salta |
| Inconsistenza (validatedAt presente ma vatNumber vuoto/null) | NOT NULL | vuoto/null | Trattare come `vat-input` obbligatorio |

Il campo `vat_validated_at` viene aggiornato a `NOW()` chiamando `updateVatValidatedAt(pool, userId, customerProfile)` in due percorsi (vedi sezione Backend).

---

## Tipi Condivisi — Aggiornamenti

### `frontend/src/types/customer.ts`

Aggiungere/correggere:

```typescript
vatValidatedAt: string | null;   // nuovo — ISO timestamp o null
internalId: string | null;       // correzione: era string, diventa string | null
```

### `frontend/src/types/customer-form-data.ts` (nuovo file)

`CustomerFormData` e `VatLookupResult`/`VatAddressInfo` sono attualmente dichiarate inline in `CustomerCreateModal.tsx` (righe 13–50) e non esportate. Devono essere estratte per poter essere usate dalla utility `buildVatDiff` senza dipendenza circolare.

```typescript
// frontend/src/types/customer-form-data.ts
export type CustomerFormData = {
  name: string;
  deliveryMode: string;
  vatNumber: string;
  paymentTerms: string;
  pec: string;
  sdi: string;
  street: string;
  postalCode: string;
  phone: string;
  mobile: string;
  email: string;
  url: string;
  deliveryStreet: string;
  deliveryPostalCode: string;
  postalCodeCity: string;
  postalCodeCountry: string;
  deliveryPostalCodeCity: string;
  deliveryPostalCodeCountry: string;
};
```

```typescript
// frontend/src/types/vat-lookup-result.ts
export type VatAddressInfo = {
  companyName: string;
  street: string;
  postalCode: string;
  city: string;
  vatStatus: string;
  internalId: string;
};

export type VatLookupResult = {
  lastVatCheck: string;
  vatValidated: string;
  vatAddress: string;
  parsed: VatAddressInfo;
  pec: string;
  sdi: string;
};
```

**Azione richiesta su `CustomerCreateModal.tsx`:** rimuovere le dichiarazioni inline di `CustomerFormData`, `VatAddressInfo`, `VatLookupResult` (righe 13–50) e importarle dai nuovi file condivisi.

---

## Bot — Nuovo Metodo

### `navigateToEditCustomerForm(name: string): Promise<void>`

**Navigazione via lista** (stessa strategia di `updateCustomer` — non via URL diretta `CUSTTABLE_DetailView`):

> Il metodo `updateCustomer` esistente naviga sempre via `CUSTTABLE_ListView_Agent/` + ricerca per nome. Lo stesso pattern è corretto e provato. Non si usa l'ID diretto perché il comportamento del browser su URL dirette non è verificato nell'ERP.

```typescript
async navigateToEditCustomerForm(name: string): Promise<void> {
  // 1. Naviga a CUSTTABLE_ListView_Agent/
  // 2. Cerca il cliente per nome (riusa la logica searchAndFindCustomer già in updateCustomer)
  // 3. Clicca sulla riga trovata → apre il dettaglio
  // 4. Clicca sul pulsante Edit (o naviga a /?mode=Edit)
  // 5. Attende che il form di modifica sia caricato e interattivo
  // Se cliente non trovato: lancia CustomerNotFoundError
}
```

**Nota implementativa:** la logica `searchAndFindCustomer` dentro `updateCustomer` (riga 12065) può essere estratta in un metodo privato `searchAndOpenCustomer(name)` condiviso tra `updateCustomer` e il nuovo `navigateToEditCustomerForm`.

Il metodo `submitVatAndReadAutofill(vatNumber)` viene riusato invariato — il campo P.IVA in Archibald si comporta allo stesso modo in create e in edit.

---

## Backend — Nuovo Endpoint

### `POST /api/customers/interactive/start-edit`

**Body (validato con Zod):**
```typescript
const startEditSchema = z.object({
  customerProfile: z.string().min(1, 'customerProfile obbligatorio'),
});
```

**Response:** `{ sessionId: string }`
**Auth:** Bearer token (agente loggato)

**Flow:**
1. Valida body con `startEditSchema`
2. Recupera cliente da DB tramite `deps.getCustomerByProfile(userId, customerProfile)` — 404 se non trovato
3. Cancella eventuale sessione interattiva precedente
4. Crea nuova sessione (`sessionManager.createSession(userId)`)
5. Fire-and-forget:
   - Pausa sincronizzazioni
   - Inizializza bot
   - Chiama `bot.navigateToEditCustomerForm(customer.name)`
   - Setta stato sessione a `'ready'`
   - Broadcast `CUSTOMER_INTERACTIVE_READY`
6. Ritorna `{ sessionId }` immediatamente

### `CustomerBotLike` — estensione

```typescript
type CustomerBotLike = {
  // ...metodi esistenti invariati...
  navigateToEditCustomerForm: (name: string) => Promise<void>;
};
```

### `CustomerInteractiveRouterDeps` — estensione

```typescript
type CustomerInteractiveRouterDeps = {
  // ...campi esistenti invariati...
  getCustomerByProfile: (userId: string, customerProfile: string) => Promise<Customer>;
};
```

Il chiamante (es. `server.ts` o il file che monta il router) deve passare la funzione `getCustomerByProfile` dal repository customers.

### Scrittura `vat_validated_at` in DB

**Funzione repository (nuova):**
```typescript
// backend/src/db/repositories/customers.ts
async function updateVatValidatedAt(
  pool: DbPool,
  userId: string,
  customerProfile: string,
): Promise<void>
// UPDATE agents.customers SET vat_validated_at = NOW() WHERE customer_profile = $1 AND user_id = $2
```

**Percorso 1 — Interactive session (create):**
In `customer-interactive.ts`, nell'handler `POST /api/customers/interactive/:sessionId/save`, nel blocco fire-and-forget, **dopo** la chiamata a `updateCustomerBotStatus(userId, finalProfile, 'placed')`, aggiungere:
```typescript
await deps.updateVatValidatedAt(userId, finalProfile);
```
Di conseguenza `CustomerInteractiveRouterDeps` deve includere anche `updateVatValidatedAt`.

**Percorso 2 — Edit mode:**
In `backend/src/operations/handlers/update-customer.ts`, se il payload del job include `vatWasValidated: true`, chiamare `updateVatValidatedAt(pool, userId, customerProfile)` dopo che il bot ha completato con successo.

Il campo `vatWasValidated?: boolean` viene aggiunto al tipo `UpdateCustomerJobData`.

**Endpoint riusati invariati:**
- `POST /api/customers/interactive/:sessionId/vat`
- WebSocket events: `CUSTOMER_INTERACTIVE_READY`, `CUSTOMER_VAT_RESULT`, `CUSTOMER_INTERACTIVE_FAILED`

---

## Frontend — CustomerCreateModal

### Nuovi tipi di step

```typescript
| { kind: "vat-edit-check" }   // VAT già validata: mostra stato + scelta Riconvalida/Salta
| { kind: "vat-diff-review" }  // Dopo validazione: tabella diff
```

### `determineVatEditStep` — valori e mapping agli step del modal

```typescript
// frontend/src/utils/vat-edit-step.ts
export type VatEditStepDecision =
  | 'force-vat-input'       // → setCurrentStep({ kind: "vat-input" })
  | 'auto-validate'         // → setCurrentStep({ kind: "vat-processing" }), poi auto-submit su READY
  | 'show-validated-check'; // → setCurrentStep({ kind: "vat-edit-check" })

export function determineVatEditStep(customer: Customer): VatEditStepDecision
```

Il nome `VatEditStepDecision` e i suoi valori mappano esplicitamente ai `kind` del modal.

### Logica apertura modal in edit mode

```typescript
if (isEditMode) {
  const decision = determineVatEditStep(editCustomer);
  if (decision === 'force-vat-input') {
    setCurrentStep({ kind: "vat-input" });
    startEditInteractiveSession(editCustomer.customerProfile);
  } else if (decision === 'auto-validate') {
    setAutoSubmitVatOnReady(editCustomer.vatNumber); // flag + valore
    setCurrentStep({ kind: "vat-processing" });
    startEditInteractiveSession(editCustomer.customerProfile);
    // ⚠️ l'auto-submit NON avviene qui — avviene sul CUSTOMER_INTERACTIVE_READY
  } else {
    setCurrentStep({ kind: "vat-edit-check" });
  }
}
```

**Correzione race condition — auto-submit nel handler WebSocket `CUSTOMER_INTERACTIVE_READY`:**

```typescript
// Nel handler dell'evento CUSTOMER_INTERACTIVE_READY
setBotReady(true);
if (autoSubmitVatOnReady) {
  submitVat(autoSubmitVatOnReady);    // invia VAT solo quando bot è pronto
  setAutoSubmitVatOnReady(null);
}
```

### Step `vat-edit-check`

- Testo: "P.IVA già validata il [data formattata da vatValidatedAt]"
- **[Riconvalida]** → `startEditInteractiveSession(editCustomer.customerProfile)`, setta `autoSubmitVatOnReady(editCustomer.vatNumber)`, step → `{ kind: "vat-processing" }`
- **[Salta]** → step → primo campo del form (salta a `{ kind: "field", index: 0 }`)

### Step `vat-diff-review`

Mostrato dopo aver ricevuto `CUSTOMER_VAT_RESULT` in edit mode.

Tabella comparativa per i campi: Nome, Via, CAP, Città, PEC, SDI.

| Campo | Valore attuale | Archibald | Usa Archibald |
|-------|---------------|-----------|---------------|
| Nome | Indelli Enrico | Indelli Enrico | ☑ |
| Via | Corso Garibaldi | Via Petrarca 26 | ☐ |
| PEC | — | studio@... | ☑ |

**Regola pre-selezione checkbox:**
- ☑ se valore attuale è vuoto o identico ad Archibald
- ☐ se valore attuale è diverso (l'utente sceglie consapevolmente)

**[Applica selezione]:**
- Applica i campi selezionati nel `formData`
- Setta flag `vatWasValidated = true` (per il payload job)
- Avanza al primo campo del form

### Funzione pura `buildVatDiff`

```typescript
// frontend/src/utils/vat-diff.ts
import type { CustomerFormData } from '../types/customer-form-data';
import type { VatLookupResult } from '../types/vat-lookup-result';

export type VatDiffField = {
  key: keyof CustomerFormData;
  label: string;
  current: string;
  archibald: string;
  preSelected: boolean;
};

export function buildVatDiff(
  current: CustomerFormData,
  vatResult: VatLookupResult,
): VatDiffField[]
// Campi inclusi nel diff: name, street, postalCode, postalCodeCity, pec, sdi
```

---

## Errori/Warning — Allineamento Create vs Edit

Durante l'implementazione, verificare e allineare:

| Comportamento | Create | Edit | Azione |
|--------------|--------|------|--------|
| Nome obbligatorio (warning inline) | ✓ | ? | Verificare |
| Auto-prepend `+39` al telefono | ✓ | ? | Allineare |
| CAP disambiguation (lookup città) | ✓ | ? | Allineare |
| Check P.IVA duplicata | ✓ | Non necessario | OK |

---

## Testing

### Unit test

**`vat-diff.spec.ts`:**
- Campo vuoto nel current → `preSelected: true`
- Campo identico → `preSelected: true`
- Campo diverso → `preSelected: false`
- Tutti i campi diversi → nessuno pre-selezionato
- `vatResult.parsed` con campi null/undefined → `archibald: ""`

**`vat-edit-step.spec.ts`:**
- `vatValidatedAt=null, vatNumber=""` → `'force-vat-input'`
- `vatValidatedAt=null, vatNumber=null` → `'force-vat-input'`
- `vatValidatedAt=null, vatNumber="12345"` → `'auto-validate'`
- `vatValidatedAt="2026-01-13", vatNumber="12345"` → `'show-validated-check'`
- `vatValidatedAt="2026-01-13", vatNumber=""` → `'force-vat-input'` (inconsistenza)
- `vatValidatedAt="2026-01-13", vatNumber=null` → `'force-vat-input'` (inconsistenza)

### Integration test (backend)

**`start-edit-interactive.spec.ts`:**
- `POST /api/customers/interactive/start-edit` con cliente esistente → `{ sessionId }` 200
- Cliente non trovato → 404
- Body senza `customerProfile` → 400 (Zod)
- Body con `customerProfile=""` → 400 (Zod min(1))
- Sessione precedente cancellata prima di crearne una nuova

### UAT obbligatoria (5 scenari)

1. **P.IVA vuota** — input obbligatorio → bot naviga edit form cliente → validazione → diff mostrato → applica → prosegui modifica
2. **P.IVA presente, mai validata** — modal apre → `vat-processing` automatico → bot pronto → auto-submit VAT → diff mostrato → selezione campi → prosegui
3. **P.IVA già validata → Salta** — step "già validata" → click Salta → prosegui direttamente al form
4. **P.IVA già validata → Riconvalida** — click Riconvalida → validazione → diff mostrato → applica → prosegui
5. **Validazione fallisce** — errore inline → retry possibile senza chiudere il modal

---

## File da creare/modificare

| File | Operazione | Note |
|------|-----------|------|
| `backend/src/db/migrations/026-vat-validated-at.sql` | Crea | `IF NOT EXISTS` |
| `backend/src/bot/archibald-bot.ts` | Modifica | Aggiungi `navigateToEditCustomerForm(name)`; estrai `searchAndOpenCustomer` da `updateCustomer` |
| `backend/src/routes/customer-interactive.ts` | Modifica | Aggiungi endpoint `start-edit`; estendi `CustomerBotLike` e `CustomerInteractiveRouterDeps` |
| `backend/src/db/repositories/customers.ts` | Modifica | Aggiungi `updateVatValidatedAt()` |
| `backend/src/operations/handlers/update-customer.ts` | Modifica | Scrivi `vat_validated_at` se `vatWasValidated=true` nel payload |
| `backend/src/server.ts` (o equivalente) | Modifica | Passa `getCustomerByProfile` e `updateVatValidatedAt` a `createCustomerInteractiveRouter` |
| `frontend/src/types/customer.ts` | Modifica | Aggiungi `vatValidatedAt: string \| null`; correggi `internalId: string \| null` |
| `frontend/src/types/customer-form-data.ts` | Crea | Estrai `CustomerFormData` da `CustomerCreateModal.tsx` |
| `frontend/src/types/vat-lookup-result.ts` | Crea | Estrai `VatLookupResult` e `VatAddressInfo` da `CustomerCreateModal.tsx` |
| `frontend/src/utils/vat-diff.ts` | Crea | Funzione pura `buildVatDiff` |
| `frontend/src/utils/vat-diff.spec.ts` | Crea | |
| `frontend/src/utils/vat-edit-step.ts` | Crea | Funzione pura `determineVatEditStep` |
| `frontend/src/utils/vat-edit-step.spec.ts` | Crea | |
| `frontend/src/components/CustomerCreateModal.tsx` | Modifica | Rimuovi inline types; nuovi step; logica edit mode VAT; step diff-review |
| `frontend/src/api/customers.ts` | Modifica | Aggiungi chiamata `startEditInteractiveSession()` |
| `frontend/src/services/customers.service.ts` | Modifica | Aggiungi metodo per `start-edit` |

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

## DB — Migration 011

```sql
ALTER TABLE agents.customers ADD COLUMN vat_validated_at TIMESTAMPTZ;
```

Questo campo determina il comportamento iniziale del modal in edit mode:

| Scenario | vat_validated_at | vat_number | Comportamento |
|----------|-----------------|------------|---------------|
| P.IVA mai inserita | NULL | vuoto | Step `vat-input` obbligatorio |
| P.IVA presente, mai validata | NULL | presente | Avvia sessione automaticamente → `vat-processing` |
| P.IVA già validata in precedenza | NOT NULL | presente | Step `vat-edit-check` con opzione Riconvalida / Salta |

Il campo `vat_validated_at` viene aggiornato a `NOW()` ogni volta che `submitVatAndReadAutofill` completa con successo.

---

## Bot — Nuovo Metodo

### `navigateToEditCustomerForm(internalId: string): Promise<void>`

- Naviga a `CUSTTABLE_DetailView/${internalId.replace('.', '')}/?mode=Edit`
- Attende che il form di modifica sia caricato e interattivo
- Fallback se `internalId` è null: ricerca cliente per nome tramite `navigateToCustomerByName(name)`

Il metodo `submitVatAndReadAutofill(vatNumber)` viene riusato invariato — il campo P.IVA in Archibald si comporta allo stesso modo in create e in edit.

---

## Backend — Nuovo Endpoint

### `POST /api/customers/interactive/start-edit`

**Body:** `{ customerProfile: string }`
**Auth:** Bearer token (agente loggato)

**Flow:**
1. Recupera `internal_id` del cliente da DB (`getCustomerByProfile`)
2. Cancella eventuale sessione interattiva precedente
3. Crea nuova sessione (`sessionManager.createSession`)
4. Fire-and-forget:
   - Pausa sincronizzazioni
   - Inizializza bot
   - Chiama `bot.navigateToEditCustomerForm(internalId)`
   - Setta stato sessione a `'ready'`
   - Broadcast `CUSTOMER_INTERACTIVE_READY`
5. Ritorna `{ sessionId }` immediatamente

**Endpoint riusati invariati:**
- `POST /api/customers/interactive/:sessionId/vat` — submit VAT e lettura autofill
- WebSocket events: `CUSTOMER_INTERACTIVE_READY`, `CUSTOMER_VAT_RESULT`, `CUSTOMER_INTERACTIVE_FAILED`

---

## Frontend — CustomerCreateModal

### Nuovi tipi di step

```typescript
| { kind: "vat-edit-check" }   // VAT già validata: mostra stato + scelta
| { kind: "vat-diff-review" }  // Dopo validazione: tabella diff
```

### Logica apertura modal in edit mode

```typescript
// Sostituisce il blocco if (!editCustomer) che oggi salta tutto
if (isEditMode) {
  if (!editCustomer.vatValidatedAt && !editCustomer.vatNumber) {
    // P.IVA vuota → input obbligatorio
    setCurrentStep({ kind: "vat-input" });
    startEditInteractiveSession();
  } else if (!editCustomer.vatValidatedAt && editCustomer.vatNumber) {
    // P.IVA presente ma mai validata → avvia automaticamente
    setCurrentStep({ kind: "vat-processing" });
    startEditInteractiveSession();
    submitVat(editCustomer.vatNumber);
  } else {
    // P.IVA già validata → mostra check con opzione
    setCurrentStep({ kind: "vat-edit-check" });
  }
}
```

### Step `vat-edit-check`

Mostra:
- "P.IVA già validata il [data]"
- Pulsante **[Riconvalida]** → avvia sessione edit + `vat-processing`
- Pulsante **[Salta]** → passa direttamente al primo campo del form

### Step `vat-diff-review`

Tabella comparativa con i campi: Nome, Via, CAP, Città, PEC, SDI.

Per ogni campo:
| Campo | Valore attuale | Archibald | Usa Archibald |
|-------|---------------|-----------|---------------|
| Nome | ... | ... | ☑/☐ |

**Regola pre-selezione checkbox:**
- ☑ pre-spuntata se il valore attuale è **vuoto** o **identico** ad Archibald
- ☐ deselezionata se il valore attuale è **diverso** da Archibald (l'utente deve scegliere consapevolmente)

Pulsante **[Applica selezione]** → applica i campi selezionati nel `formData` e avanza al form.

### Funzione di supporto (pura, testabile)

```typescript
type VatDiffField = {
  key: keyof CustomerFormData;
  label: string;
  current: string;
  archibald: string;
  preSelected: boolean;
};

function buildVatDiff(
  current: CustomerFormData,
  vatResult: VatLookupResult,
): VatDiffField[]
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

Ogni difformità trovata viene corretta come fix puntuale.

---

## Testing

### Unit test (`*.spec.ts` collocati con il sorgente)

**`buildVatDiff.spec.ts`:**
- Campo vuoto → preSelected: true
- Campo identico → preSelected: true
- Campo diverso → preSelected: false
- Tutti i campi diversi → nessuno pre-selezionato

**`determineVatEditStep.spec.ts`:**
- `vatValidatedAt=null, vatNumber=""` → `"vat-input"`
- `vatValidatedAt=null, vatNumber="12345"` → `"vat-processing"`
- `vatValidatedAt=<date>, vatNumber="12345"` → `"vat-edit-check"`

### Integration test

**`start-edit-interactive.spec.ts`:**
- `POST /api/customers/interactive/start-edit` con cliente esistente → `{ sessionId }` + bot navigato
- Cliente con `internal_id=null` → fallback per nome funziona
- Sessione precedente viene cancellata prima di crearne una nuova

### UAT obbligatoria (4 scenari)

1. **P.IVA vuota** — input obbligatorio → validazione → autofill campi vuoti → prosegui modifica
2. **P.IVA presente, mai validata** — validazione automatica → diff mostrato → selezione campi → prosegui
3. **P.IVA già validata** — step "già validata" → Salta funziona → Riconvalida funziona → diff mostrato
4. **Validazione fallisce** — errore inline nello step VAT → retry possibile

---

## File da creare/modificare

| File | Operazione |
|------|-----------|
| `backend/src/db/migrations/011-vat-validated-at.sql` | Crea |
| `backend/src/bot/archibald-bot.ts` | Aggiungi `navigateToEditCustomerForm()` |
| `backend/src/routes/customer-interactive.ts` | Aggiungi endpoint `start-edit` |
| `backend/src/db/repositories/customers.ts` | Aggiorna `upsertSingleCustomer` per scrivere `vat_validated_at` |
| `frontend/src/components/CustomerCreateModal.tsx` | Aggiungi step + logica edit mode |
| `frontend/src/utils/vat-diff.ts` | Crea (funzione pura `buildVatDiff`) |
| `frontend/src/utils/vat-diff.spec.ts` | Crea |
| `frontend/src/utils/vat-edit-step.ts` | Crea (funzione pura `determineVatEditStep`) |
| `frontend/src/utils/vat-edit-step.spec.ts` | Crea |

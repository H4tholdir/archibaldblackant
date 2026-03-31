# Create Customer — Redesign completo

**Data:** 2026-04-01  
**Status:** Approvata, pronta per implementazione

---

## 1. Contesto e motivazione

Il flusso di creazione cliente è stato oggetto di due refactoring parziali e sovrapposti che hanno lasciato il codice in uno stato instabile:

- `CustomerCreateModal.tsx` contiene **due sistemi di navigazione coesistenti**: il vecchio `field`-by-field (12 campi in `FIELDS_BEFORE_ADDRESS_QUESTION`) e il nuovo group-step (`step-anagrafica`, `step-indirizzo`, ecc.). Entrambi condividono `goForward/goBack`, si sovrappongono nel routing e si rompono a vicenda.
- Il pulsante "Modifica" nel riepilogo reindirizza al vecchio sistema legacy invece che ai group step.
- Il `saveSchema` backend è incompleto: 7 campi compilati dall'utente vengono silenziosamente scartati prima di arrivare al bot ERP.
- La validazione P.IVA blocca l'intera UI per 20-28 secondi.

Questo documento descrive il redesign completo che risolve tutti i problemi e introduce l'architettura ibrida D+C (registry esterna per feedback immediato + bot ERP in background).

---

## 2. Bug inventory — problemi da risolvere

| # | File | Problema |
|---|---|---|
| B1 | `CustomerCreateModal.tsx` | Dual step system: `field`+`cap-disambiguation` (legacy) + `step-*` (nuovo) coesistono |
| B2 | `CustomerCreateModal.tsx` | `handleEditFields()` imposta `{ kind: "field", fieldIndex: 0 }` → sistema legacy invece di `step-anagrafica` |
| B3 | `CustomerCreateModal.tsx` | `goBack()` da `cap-disambiguation` va a `{ kind: "field", fieldIndex }` (legacy) non a `step-indirizzo` |
| B4 | `CustomerCreateModal.tsx` | Summary: usa `FIELDS_BEFORE_ADDRESS_QUESTION.map()` → mancano `fiscalCode`, `sector`, `attentionTo`, `notes` |
| B5 | `CustomerCreateModal.tsx` | `totalSteps = 14` invece di 7; header mostra "Passo X di 14" errato |
| B6 | `CustomerCreateModal.tsx` | `vat-processing` blocca l'UI per 20-28s aspettando l'ERP |
| B7 | `CustomerCreateModal.tsx` | `earlyVatInput` è un duplicato di `formData.vatNumber` (due sorgenti per lo stesso dato) |
| B8 | `CustomerCreateModal.tsx` | Polling fallback secondario (`setInterval` su `getCustomerBotStatus`) conflittuale con WebSocket |
| B9 | `customer-interactive.ts` | `saveSchema` Zod manca: `fiscalCode`, `sector`, `attentionTo`, `notes`, `county`, `state`, `country` → il bot non li riceve e non li compila su ERP |
| B10 | `customers.service.ts` | `saveInteractiveCustomer()` tipo mancante dei campi: `mobile`, `url`, `fiscalCode`, `sector`, `attentionTo`, `notes`, `county`, `state`, `country`, `addresses` |
| B11 | `CustomerCreateModal.tsx` | Heartbeat ogni 120s troppo raro (TTL = 10 min); dovrebbe essere ogni 45s |
| B12 | `CustomerCreateModal.tsx` | `contextMode="order"`: click "Verifica" salta bot e VAT → nessun feedback all'utente su validità P.IVA |

---

## 3. Architettura target

### 3.1 Flow complessivo

```
[Utente apre modal — standalone]
        │
        ▼
   Step VAT
   utente digita P.IVA → click "Verifica"
        │
        ├─► [~500ms] POST /api/customers/vat-check (VIES EU registry, stateless)
        │       → risposta immediata: { valid, name?, rawAddress? }
        │       → frontend auto-fill: formData.name = name, formData.vatNumber = vat
        │       → avanza a step-anagrafica (no blocco UI)
        │
        └─► [background, silenzioso] POST /api/customers/interactive/begin { vatNumber }
                → sessionId restituito immediatamente
                → bot: login → naviga form → digita P.IVA → aspetta ERP async
                → WebSocket CUSTOMER_VAT_RESULT: auto-fill onda 2
                   (fiscalCode, pec, sdi, street, postalCode, city, vatStatus)
                → WebSocket CUSTOMER_INTERACTIVE_FAILED: setta erpValidated=false silenzioso

   Step Anagrafica → Indirizzo → Contatti → Commerciale → Indirizzi Alt. → Riepilogo
   (utente compila; bot valida P.IVA nell'ERP in background)
        │
        ▼
   Step Riepilogo → click "Crea Cliente"
        ├─► Se erpValidated === true: bot riempie campi rimanenti + salva (~30s)
        └─► Se erpValidated === false: banner "Connessione al gestionale..." (aspetta CUSTOMER_INTERACTIVE_READY)
                poi: bot riempie + salva
```

### 3.2 contextMode="order" (da OrderFormSimple)

- `vat-check` (external registry) viene chiamato ugualmente per feedback immediato.
- **Nessun** `interactive/begin` — niente sessione bot durante la compilazione.
- `formData.vatNumber` viene comunque salvato.
- Su save: usa `customerService.createCustomer()` → BullMQ → bot fresco → valida P.IVA + riempie tutto + salva.
- L'utente vede un normale spinner di avanzamento senza differenza rispetto ad oggi.

---

## 4. Step wizard — struttura pulita

```typescript
type WizardStep =
  | { kind: 'vat' }
  | { kind: 'anagrafica' }
  | { kind: 'indirizzo' }
  | { kind: 'contatti' }
  | { kind: 'commerciale' }
  | { kind: 'indirizzi-alt' }
  | { kind: 'riepilogo' };
```

**Sequenza:** `vat` → `anagrafica` → `indirizzo` → `contatti` → `commerciale` → `indirizzi-alt` → `riepilogo`

`currentStepNumber`: 0–6. `totalSteps = 7`. Header mostra "Passo X di 7".

### Step 0 — VAT

- Input P.IVA (maxLength 11).
- Pulsante "Verifica": spinner inline sul bottone (non blocca step), chiama `vat-check` + lancia `interactive/begin` in background.
- Pulsante "Salta": avanza ad `anagrafica` senza validazione (nessuna sessione bot avviata; in standalone mode il bot partirà comunque al save tramite fallback fresh-bot).
- `formData.vatNumber` aggiornato immediatamente all'input.
- Errore inline se `vat-check` risponde `valid: false`.
- Se registry non raggiungibile: avanza ugualmente con banner "Dati fiscali non disponibili".

### Step 1 — Anagrafica

Campi mostrati:
- Nome / Ragione sociale * (pre-compilato da VIES se disponibile)
- Codice Fiscale (pre-compilato da `CUSTOMER_VAT_RESULT` quando arriva; editabile)
- Settore (combo: N/A, concessionari, Lab. Odontotecnico, Studio Dentistico)

Nota: `CUSTOMER_VAT_RESULT` WebSocket può arrivare mentre l'utente è qui o in step successivi — aggiorna silenziosamente i campi corrispondenti se sono ancora vuoti (non sovrascrive modifiche utente).

### Step 2 — Indirizzo

Campi:
- Via e civico
- CAP (maxLength 5) + **disambiguation inline**: se il CAP ha N>1 città, mostra una lista dropdown sotto il campo; la selezione auto-compila `postalCodeCity`, `postalCodeCountry`, `county`, `state`. Non è uno step separato.
- Città preview (read-only, derivata dal CAP)
- Provincia/Regione preview (read-only)

### Step 3 — Contatti

Campi in colonna: Telefono, Cellulare, Email, Sito web, PEC, SDI.
SDI: sempre uppercase. Se PEC compilata e SDI vuoto → pre-compila SDI con "0000000" (comportamento invariato).

### Step 4 — Commerciale

Campi:
- All'attenzione di (maxLength 50)
- Modalità di consegna (select, default: FedEx)
- Termini di pagamento (select con ricerca, default: 206)
- Note / Memo (textarea, maxLength 4000)

### Step 5 — Indirizzi alternativi

- Lista indirizzi aggiunti (vuota all'inizio).
- Form inline per aggiungere: Tipo (Ufficio | Fattura | Consegna | Indir. cons. alt.), Nome, Via, CAP (con stessa disambiguation inline dello Step 2), Città.
- Pulsante "+ Aggiungi indirizzo" / "Conferma" / "Annulla" per ogni voce.
- Pulsante "Elimina" per rimuovere un indirizzo dalla lista.
- Lo step è saltabile: avanza con "Avanti" senza aggiungere nulla.

### Step 6 — Riepilogo

- Tabella riassuntiva organizzata per sezione (Fiscale, Anagrafica, Indirizzo, Contatti, Commerciale, Indirizzi alt.).
- Se `erpValidated === false` e `contextMode !== "order"`: banner giallo "Connessione al gestionale in corso..." + spinner piccolo.
- Pulsante "Crea Cliente" (verde): 
  - Se `erpValidated === false`: rimane visibile ma mostra spinner; al click aspetta `CUSTOMER_INTERACTIVE_READY` (con timeout 60s) prima di chiamare `/:sessionId/save`.
  - Se `erpValidated === true`: chiama `/:sessionId/save` immediatamente.
- Pulsante "Indietro": torna a `indirizzi-alt`.
- Pulsante "Annulla" (non "Elimina"): chiude modal e cancella sessione.

---

## 5. Stato bot session — state machine aggiornata

Aggiunto stato `erpValidating` per distinguere "bot pronto sul form" da "VAT ancora in validazione":

```
idle
  └─► starting          ← POST /interactive/begin (login + naviga)
        └─► erpValidating  ← bot digita P.IVA, aspetta callback ERP async
              └─► ready     ← CUSTOMER_VAT_RESULT emesso, bot sul form
                    └─► saving
                          └─► completed

(qualsiasi stato) → failed
```

`InteractiveSessionState` nel backend aggiunge `"erp_validating"` alla union esistente.

Frontend tiene traccia con:
```typescript
const [erpValidated, setErpValidated] = useState(false);
// true = CUSTOMER_VAT_RESULT ricevuto senza errori
// false = in attesa o fallito (usa fallback al save)
```

---

## 6. Nuovi endpoint backend

### 6.1 `POST /api/customers/vat-check`

Montato in `customers.ts` router (non nell'interactive router — è stateless).

**Input:**
```typescript
{ vatNumber: string }  // solo cifre, 11 caratteri
```

**Validazione:** formato P.IVA italiana (11 digit) prima della chiamata esterna.

**Comportamento:** chiama VIES EU REST API:
```
GET https://ec.europa.eu/taxation_customs/vies/rest-api/ms/IT/vat/{vatNumber}
```
Risposta VIES: `{ valid: boolean, name?: string, address?: string }`

**Output:**
```typescript
{
  valid: boolean;
  name?: string;      // ragione sociale (vuota se VIES non la conosce)
  rawAddress?: string; // indirizzo grezzo stringa (non strutturato)
}
```

**Fallback:** se VIES non raggiungibile (timeout 5s) → risponde `{ valid: true, name: undefined }` con header `X-Vat-Check-Source: fallback`. Il frontend mostra banner "Dati fiscali non disponibili".

**Non fa:** non avvia sessione bot, non tocca DB.

### 6.2 `POST /api/customers/interactive/begin`

Aggiunto a `customer-interactive.ts`.

**Input:**
```typescript
{ vatNumber: string }
```

**Output immediato:**
```typescript
{ sessionId: string }
```

**Background (fire-and-forget):**
1. Cancella eventuale sessione attiva per l'utente (come `start`)
2. Crea sessione → stato `starting`
3. Pausa sync
4. Avvia bot → login → naviga a nuovo form cliente
5. Stato → `erp_validating`
6. Chiama `bot.submitVatAndReadAutofill(vatNumber)`
7. Broadcast `CUSTOMER_VAT_RESULT` con risultato
8. Stato → `ready`

In caso di errore in qualsiasi fase:
- Broadcast `CUSTOMER_INTERACTIVE_FAILED`
- Stato → `failed`
- Frontend setta `erpValidated = false`; al save usa fallback fresh-bot

Questo endpoint **rimpiazza** l'uso combinato di `POST /start` + `POST /:sessionId/vat` nel flow di creazione. Gli endpoint `start` e `start-edit` restano per retro-compatibilità con il flow di modifica.

---

## 7. Fix backend — saveSchema

In `customer-interactive.ts`, `saveSchema` aggiunge i 7 campi mancanti:

```typescript
const saveSchema = z.object({
  // campi già presenti
  name: z.string().min(1),
  vatNumber: z.string().optional(),
  pec: z.string().optional(),
  sdi: z.string().optional(),
  street: z.string().optional(),
  postalCode: z.string().optional(),
  postalCodeCity: z.string().optional(),
  postalCodeCountry: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().optional(),
  url: z.string().optional(),
  deliveryMode: z.string().optional(),
  paymentTerms: z.string().optional(),
  lineDiscount: z.string().optional(),
  addresses: z.array(...).optional().default([]),
  // NUOVI: prima mancanti, portavano a bot che non compilava questi campi
  fiscalCode: z.string().optional(),
  sector: z.string().optional(),
  attentionTo: z.string().optional(),
  notes: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});
```

---

## 8. Fix frontend — customers.service.ts

`saveInteractiveCustomer()` accetta `CustomerFormData` direttamente (non un sottoinsieme):

```typescript
async saveInteractiveCustomer(
  sessionId: string,
  formData: CustomerFormData,  // tipo completo, non il sottoinsieme parziale
): Promise<{ customer: Customer | null; taskId: string | null }>
```

---

## 9. Autofill — logica a due ondate

### Onda 1 (da `vat-check`, immediata, ~500ms)
Aggiorna `formData` solo se il campo è vuoto:
```typescript
if (!formData.name && name) setFormData(f => ({ ...f, name, vatNumber: vat }));
```

### Onda 2 (da `CUSTOMER_VAT_RESULT` WebSocket, background)
Aggiorna solo i campi ancora vuoti — non sovrascrive mai quanto l'utente ha già digitato:
```typescript
subscribe("CUSTOMER_VAT_RESULT", (payload) => {
  const r = payload.vatResult as VatLookupResult;
  setErpValidated(true);
  setFormData(prev => ({
    ...prev,
    fiscalCode:      prev.fiscalCode      || r.parsed.internalId || '',
    pec:             prev.pec             || r.pec               || '',
    sdi:             prev.sdi             || r.sdi               || '',
    street:          prev.street          || r.parsed.street     || '',
    postalCode:      prev.postalCode      || r.parsed.postalCode || '',
    postalCodeCity:  prev.postalCodeCity  || r.parsed.city       || '',
  }));
});
```

Il nome da `CUSTOMER_VAT_RESULT` NON sovrascrive quello da VIES (VIES arriva prima e l'utente potrebbe averlo già modificato).

---

## 10. Cosa viene eliminato

### Dal frontend `CustomerCreateModal.tsx`

| Cosa | Motivo |
|---|---|
| `FIELDS_BEFORE_ADDRESS_QUESTION` array | Sostituito da group steps |
| `totalFieldsBefore`, `totalSteps` calcolati da quel array | Sostituiti da `totalSteps = 7` |
| Step kinds: `vat-input`, `vat-processing`, `vat-review`, `field`, `cap-disambiguation`, `summary` | Sostituiti da 7 tipi puliti |
| `earlyVatInput` / `earlyVatInputRef` stati | `formData.vatNumber` è l'unica sorgente |
| UI block `isVatProcessing` (spinner bloccante) | Sostituito da spinner inline sul bottone |
| UI block `isVatReview` (schermata risultato ERP) | Sostituito da autofill silenzioso onda 2 |
| UI block `isFieldStep`, `isPaymentTermsStep` (field-by-field) | ~300 righe eliminate |
| UI block `isCapDisambiguation` (step separato) | Sostituito da dropdown inline in Step Indirizzo |
| `handleKeyDown` globale per field-by-field navigation | Rimosso; ogni step gestisce Enter localmente |
| `handleCapDisambiguationSelect` | Rimosso |
| `handleFieldChange` | Rimosso; ogni step ha il proprio onChange |
| `pollingProfileRef` + `setInterval` fallback polling | Rimosso; WebSocket è sufficiente |
| `handleEditFields()` che andava a `{ kind: "field", fieldIndex: 0 }` | Sostituito da "Indietro" standard |
| `isVatInput`, `isVatProcessing`, `isVatReview`, `isFieldStep`, `isFirstStep`, `isInteractiveStep`, `isCapDisambiguation`, `isSummary`, `isStepAnagrafica`, `isStepIndirizzo`, `isStepContatti`, `isStepCommerciale`, `isAddressesStep` booleani derivati | Tutti rimossi; ogni step renderizza in uno switch pulito |

### Dal frontend `customers.service.ts`

- Tipo parziale in `saveInteractiveCustomer()` → sostituito con `CustomerFormData` completo.

### Dal backend `customer-interactive.ts`

- Nessuna route eliminata. Solo `saveSchema` esteso.

---

## 11. Cosa rimane invariato

- `interactive-session-manager.ts` — nessuna modifica (aggiunge solo `"erp_validating"` a `InteractiveSessionState`)
- Route esistenti: `/start`, `/start-edit`, `/:sessionId/heartbeat`, `/:sessionId/save`, `DELETE /:sessionId`
- `completeCustomerCreation()` nel bot — nessuna modifica
- `create-customer.ts` handler (BullMQ, usato da `contextMode="order"` e fallback)
- `CustomerSidebar.tsx`, `CustomerQuickFix.tsx`, `CustomerInlineSection.tsx`
- `customers.service.ts` — solo la firma di `saveInteractiveCustomer` cambia

---

## 12. Heartbeat

Ridotto da 120s a **45s** per rispettare meglio il TTL di 10 minuti:
```typescript
setInterval(() => customerService.heartbeat(sessionId), 45_000);
```

---

## 13. Gestione errori — tabella completa

| Scenario | Risposta frontend |
|---|---|
| `vat-check`: VIES non raggiungibile (timeout 5s) | Banner "Dati fiscali non disponibili — compilare manualmente"; avanza ugualmente |
| `vat-check`: P.IVA formato errato | Errore inline sul campo; non avanza |
| `vat-check`: P.IVA valida ma non trovata nel registro | Banner "Nessuna azienda trovata"; avanza senza autofill |
| `vat-check`: risponde `valid: false` | Errore inline "P.IVA non valida"; non avanza |
| `interactive/begin`: errore avvio bot (CUSTOMER_INTERACTIVE_FAILED) | `erpValidated = false` silenzioso; al save usa fallback fresh-bot |
| Sessione scaduta (>10 min) durante compilazione | Fallback automatico a bot fresco in `/:sessionId/save` (già implementato) |
| `erpValidated === false` al click "Crea Cliente" | Banner + spinner, attesa CUSTOMER_INTERACTIVE_READY (max 60s) poi salva |
| Timeout 60s aspettando CUSTOMER_INTERACTIVE_READY | Chiama `/:sessionId/save` con `sessionId` comunque; il backend usa il fallback fresh-bot |
| Bot fallisce durante `completeCustomerCreation` (JOB_FAILED) | Errore visibile "Impossibile creare il cliente su Archibald" + pulsante "Riprova" |
| Timeout totale ERP durante save (>2 min) | Errore "Archibald non risponde" + pulsante "Riprova" |

---

## 14. Piano di test

### Unit test (vitest)
- `vat-check` route: risposta VIES valida, VIES timeout, P.IVA formato errato
- `saveSchema` Zod: verifica che tutti i 22 campi passino correttamente al handler
- Autofill onda 2: i campi non-vuoti non vengono sovrascritti

### Integration test (supertest)
- `POST /api/customers/vat-check`: stub VIES, verifica output
- `POST /api/customers/interactive/begin`: verifica sessionId restituito + sequenza stati
- `POST /api/customers/interactive/:sessionId/save`: verifica che fiscalCode/sector/attentionTo/notes raggiungano il bot

### E2E (prima del deploy, sul VPS)
- Flow completo: P.IVA valida → autofill → compilazione → "Crea Cliente" → verifica snapshot su ERP
- Flow P.IVA saltata: skip VAT → compila → salva → verifica creazione ERP (usa fallback fresh-bot)
- Flow `contextMode="order"`: crea cliente da OrderFormSimple → verifica BullMQ path

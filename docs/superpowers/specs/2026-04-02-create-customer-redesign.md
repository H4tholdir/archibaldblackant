# Create Customer — Redesign Completo

**Data:** 2026-04-02  
**Stato:** Approvato, pronto per implementazione  
**Scope:** Flusso completo di creazione cliente — bot ERP, backend route, frontend wizard, DB layer

---

## 1. Problema attuale

### 1.1 Due percorsi paralleli divergenti

Il flusso di creazione cliente ha oggi due percorsi architetturalmente separati e inconsistenti:

**Percorso A — Interattivo** (`/interactive/begin` → `/interactive/:id/save`)  
Avviato dalla `CustomerList`. Bot si avvia durante la compilazione del form, digita VAT in parallelo con l'utente, invia autofill via WebSocket. Usato quando `contextMode="standalone"`.

**Percorso B — Non-interattivo** (`POST /api/customers` → BullMQ `create-customer`)  
Usato da `OrderFormSimple` (`contextMode="order"`) o come fallback. Bot avviato al momento del salvataggio su un form fresco. Nessun autofill ERP.

### 1.2 Bug critici identificati

| # | Componente | Descrizione | Impatto |
|---|---|---|---|
| 1 | `customer-interactive.ts:473` | `erp_id` mai aggiornato da `TEMP-xxx` a ID reale nel percorso A | Cliente fantasma nel DB |
| 2 | `archibald-bot.ts:14513` | `completeCustomerCreation` ri-scrive VATNUM (già validato) → secondo callback 20-28s → sovrascrive CAP | CAP sbagliato nel DB |
| 3 | `customer-interactive.ts:467` | Fallback fresh-bot scarta l'ID reale restituito da `createCustomer` | `erp_id` rimane TEMP |
| 4 | `archibald-bot.ts` | `createCustomer` e `completeCustomerCreation` divergono: STREET re-write, deliveryMode re-set, NAMEALIAS regex — fix applicati solo a uno | Inconsistenza, race condition nel percorso B |
| 5 | `customer-interactive.ts:386` | `formInput` nel `/save` manca di: `paymentTerms`, `sector`, `fiscalCode`, `attentionTo`, `notes`, `county`, `state`, `country` | Colonne NULL nel record ottimistico |
| 6 | `CustomerCreateModal.tsx:315` | `pendingSave` non si sblocca immediatamente su `CUSTOMER_INTERACTIVE_FAILED` — aspetta 60s | UX degradata |

### 1.3 Mancanza di verifica integrità

Nessun meccanismo confronta "dati inviati dalla PWA" vs "dati effettivamente salvati nell'ERP". Divergenze (callback XHR che sovrascrivono campi, normalizzazioni ERP) non vengono rilevate né loggate.

---

## 2. Decisioni di design

### 2.1 Percorso unico unificato

Il Percorso B (non-interattivo, BullMQ `create-customer`) viene **eliminato** dal flusso standard.  
Esiste un solo percorso: il Percorso A interattivo, corretto e unificato.

### 2.2 P.IVA obbligatoria e validazione bloccante

- Nessun cliente può essere creato senza P.IVA
- Nessun cliente può essere creato con P.IVA non validata dall'ERP
- Il wizard è bloccato allo step 1 fino a risposta ERP (ok, duplicato, o errore)
- `contextMode="order"` viene eliminato — l'entry point da `OrderFormSimple` apre lo stesso wizard completo

### 2.3 Sessione bot senza timeout

- Il bot rimane vivo per tutta la durata della compilazione del form
- Nessun timeout server sulla sessione
- L'utente ha tutto il tempo necessario
- Il bot verifica lo stato del form all'avvio del salvataggio (stale check) e recupera automaticamente se necessario
- **Implementazione**: in `InteractiveSessionManager`, rimuovere qualsiasi `setTimeout` / TTL che distrugge sessioni automaticamente. La sessione viene distrutta solo esplicitamente (completamento, annullamento, errore).

### 2.4 Read-back con confronto (opzione B)

Dopo il salvataggio, il bot rilegge tutti i campi dall'ERP e confronta con i dati inviati dalla PWA. Le divergenze vengono loggate. Il DB viene popolato con i valori **reali dell'ERP** (non con quelli della PWA).

### 2.5 Certificazione prima dell'implementazione

Prima di scrivere codice, script diagnostici Puppeteer certificano su ERP reale: ogni selettore, ogni callback XHR, ogni timing, ogni comportamento di lookup e dropdown. I risultati alimentano la spec implementativa del bot.

---

## 3. Architettura del flusso unificato

```
FASE 1 — VAT CHECK (bloccante, ~30-45s)
────────────────────────────────────────
Frontend: step "vat" — spinner bloccante, nessun avanzamento possibile
Backend POST /interactive/begin:
  → Bot avviato
  → navigateToNewCustomerForm()
  → submitVatAndReadAutofill(vatNumber)
     ├─ Digita VATNUM nel form ERP
     └─ Aspetta callback ERP (20-28s)

WS risposta:
  CUSTOMER_VAT_RESULT    → autofill → sblocca step 2
  CUSTOMER_VAT_DUPLICATE → errore su step 1, sessione distrutta
  CUSTOMER_INTERACTIVE_FAILED → errore su step 1, messaggio esplicito
  timeout 60s            → errore su step 1

FASE 2 — COMPILAZIONE FORM (tempo libero, nessun limite)
──────────────────────────────────────────────────────────
Bot: vivo, nessun timeout
Frontend: heartbeat ogni 45s (solo keep-alive)
Campi pre-popolati da autofill ERP
Utente: step 2-6, tutto il tempo necessario

FASE 3 — SAVE + READBACK (bot)
───────────────────────────────
Frontend: clic "Crea Cliente" → POST /interactive/:id/save
Backend:
  1. INSERT ottimistico DB (tutti i campi, erp_id=TEMP)
  2. Risposta HTTP { taskId } immediata
  3. ASYNC:
     a. STALE CHECK:
        isOnNewCustomerForm()?
          sì → completeCustomerCreation(formData, isVatOnForm=true)
          no → navigateToNewCustomerForm()
               submitVatAndReadAutofill(vatNumber)
               completeCustomerCreation(formData, isVatOnForm=true)

     b. buildSnapshotWithDiff(erpId, formData)
        → snapshot = tutti i campi letti dall'ERP
        → divergences = confronto sent vs actual

     c. UPDATE DB:
        erp_id     = erpId reale        [TEMP → ID reale]
        bot_status = 'snapshot'
        [tutti i campi dal snapshot]
        WHERE erp_id = tempProfile AND user_id = userId

     d. upsertAddressesForCustomer(userId, erpId, addresses)
     e. updateVatValidatedAt(userId, erpId)
     f. smartCustomerSync() — fire-and-forget
     g. WS: JOB_COMPLETED { erpId, divergences? }

FASE 4 — CONSOLIDAMENTO (automatico)
──────────────────────────────────────
Prima sync clienti → sovrascrive con dati sync ERP completi
bot_status: 'snapshot' → null
```

---

## 4. Piano di certificazione diagnostica

**Obbligatorio prima dell'implementazione del bot.** Ogni gruppo produce un file JSON con i findings certificati. I valori trovati (selettori, timing, colonne) rimpiazzano le assunzioni correnti.

Output directory: `archibald-web-app/backend/scripts/diag/create-customer/`

### D1 — XHR Callbacks (mappa completa)

Per ogni campo scrivibile del Tab Principale: registra listener CDP Network prima della scrittura, scrivi campo + Tab, aspetta settle, registra campi DOM modificati.

Campi da sondare: `NAME`, `NAMEALIAS`, `FISCALCODE`, `VATNUM`, `STREET`, `LEGALEMAIL`, `LEGALAUTHORITY`, `PHONE`, `CELLULARPHONE`, `EMAIL`, `URL`, `BRASCRMATTENTIONTO`, `CUSTINFO`, e post-lookup: `PAYMTERMID`, `CAP`.

Output per ogni campo:
```json
{
  "field": "FISCALCODE",
  "xhrFired": true,
  "affectedFields": [{"id": "dviNAMEALIAS_Edit_I", "before": "Rossi Mario", "after": "RSSMRA80A01H703X"}],
  "settleMs": 280
}
```

### D2 — Lookup CAP

**Scenario A:** CAP singola città — apertura iframe, struttura righe (indici colonne), auto-fill CITY/COUNTY/STATE/COUNTRY, timing settle post-OK  
**Scenario B:** CAP multi-città — struttura griglia, logica selezione per city hint  
**Scenario C:** CAP non trovato — comportamento dialog  
**Scenario D:** Tab Principale vs Alt Address — differenze nel meccanismo  
**Scenario E:** Switch tab e ritorno — i campi auto-fill persistono?

### D3 — Lookup PAYMTERMID

Struttura iframe (differenze vs CAP), campo search, pulsante ricerca (B0 vs B1), struttura righe (ID | DESCRIZIONE), comportamento paginazione, termine non trovato.

### D4 — Dropdown (DLVMODE, BUSINESSSECTORID, PRICEGROUP, LINEDISC)

Per ogni dropdown: lista opzioni esatte (case-sensitive, testo completo), meccanismo `setDevExpressComboBox`, verifica reset da callback XHR, persistenza dopo switch tab.

### D5 — Alt Addresses CRUD completo

**CREATE:** ID bottone "New" nella griglia, IDs campi inline (`_editnew_N_` pattern), CAP lookup in riga (stesso iframe?), auto-fill in alt address, `UpdateEdit()` timing  
**READ:** struttura colonne DOM, indici, metodo lettura `textContent` vs `innerText`  
**UPDATE:** `StartEditRow(N)`, IDs campi in edit mode, `UpdateEdit()` conferma  
**DELETE:** click prima cella, `window.confirm` nativo (handler globale `page.on`), timing post-delete  
**Edge cases:** griglia vuota, più di 3 righe

### D6 — Save flow

**Scenario A:** save senza warning — selettore bottone stabile, URL post-save, timing redirect  
**Scenario B:** save con warning P.IVA non validata — checkbox ErrorInfo, meccanismo click, re-click save  
**Scenario C:** errore validazione campo obbligatorio — struttura errore, form rimane in edit?  
**Scenario D:** "Ignore warnings" — quando appare, testo esatto IT/EN

### D7 — Stato form dopo VAT validation

Dopo `submitVatAndReadAutofill`: quali campi sono stati auto-fill dall'ERP? VATNUM ancora nel campo? Switch "Prezzi e sconti" → "Principale": VATNUM persiste? `ASPx._pendingCallbacks === 0` dopo switch?

---

## 5. Bot method — interfacce

```typescript
// Invariato (fase 1)
async navigateToNewCustomerForm(): Promise<void>
async submitVatAndReadAutofill(vatNumber: string): Promise<VatLookupResult>

// Nuovo (sostituisce createCustomer + completeCustomerCreation)
// Scrive tutti i campi sul form ERP e salva. Restituisce solo l'ID ERP.
// Il readback (snapshot + diff) è responsabilità del chiamante via buildSnapshotWithDiff.
async completeCustomerCreation(
  customerData: CustomerFormData,
  isVatOnForm: boolean,
  // true  = form aperto con VAT già digitato da submitVatAndReadAutofill
  // false = form stale → recovery automatico interno
): Promise<string>  // ritorna erpId reale

// Nuovo (sostituisce buildCustomerSnapshot + aggiunge diff)
async buildSnapshotWithDiff(
  erpId: string,
  formData: CustomerFormData,
): Promise<{ snapshot: CustomerSnapshot; divergences: FieldDivergence[] }>

type FieldDivergence = {
  field: string;
  sent: string | null;   // valore inviato dalla PWA
  actual: string | null; // valore letto dall'ERP dopo save
};
```

### 5.1 Struttura interna di `completeCustomerCreation`

```
1. STALE CHECK
   isOnNewCustomerForm() → URL contiene "CUSTTABLE_DetailView" + "NewObject=true"
   Se stale:
     navigateToNewCustomerForm()
     submitVatAndReadAutofill(customerData.vatNumber)
     isVatOnForm = true

2. FIELD PIPELINE
   [ordine e selettori certificati da D1-D7]
   Ogni campo: write → waitSettle → verifica critica dove necessario

   Struttura fissa dell'ordine:
     Tab "Prezzi e sconti":
       LINEDISC
     Tab "Principale" — Lookup:
       PAYMTERMID (se presente)
       CAP (se presente) + verifica auto-fill CITY/COUNTY
     Tab "Principale" — Combo:
       DLVMODE (se presente)
       BUSINESSSECTORID (se presente)
     Tab "Principale" — Testo:
       NAME
       FISCALCODE (se presente) → waitXhrSettle → verifica NAMEALIAS sovrascritto
       NAMEALIAS → override esplicito
       LEGALEMAIL (se presente)
       LEGALAUTHORITY (se presente)
       STREET (se presente)
       PHONE (se presente)
       CELLULARPHONE (se presente)
       EMAIL (se presente)
       URL (fallback "nd.it" se assente)
       BRASCRMATTENTIONTO (se presente)
       CUSTINFO (se presente)
     Re-write vulnerabili a race condition XHR:
       STREET (seconda scrittura)
       DLVMODE (re-set post-callback)
       NAMEALIAS (re-set finale)
     VATNUM: solo se isVatOnForm=false
       typeDevExpressField + waitForDevExpressIdle(30s)
   Tab "Indirizzo alt.":
       writeAltAddresses(addresses ?? [])

3. SAVE
   saveAndCloseCustomer()

4. GET ERP ID
   getCustomerProfileId()
   Strategy 1: URL regex /CUSTTABLE_DetailView\/(\d+)\//
   Strategy 2: DOM field dviID_Edit_I
   Strategy 3: ListView search per nome (fallback)

5. RETURN { erpId }
```

### 5.2 `buildSnapshotWithDiff` — logica confronto

```
CAMPI CONFRONTATI: name, nameAlias, vatNumber, fiscalCode, pec, sdi,
  street, postalCode, city, county, state, country, phone, mobile,
  email, url, attentionTo, notes, deliveryMode, paymentTerms, sector,
  priceGroup, lineDiscount

NORMALIZZAZIONE prima del confronto:
  - trim() su entrambi i valori
  - toLowerCase() per confronto case-insensitive
  - postalCode: "N/A" == "" == null (ERP usa "N/A" per campo vuoto)
  - url: "nd.it" == "" == null (fallback tecnico, non dato utente)

DIVERGENZA loggata se: normalizzato(sent) ≠ normalizzato(actual)
DB popolato sempre con: actual (fonte ERP, non PWA)
```

---

## 6. Backend route `/interactive/:id/save` — spec completa

```typescript
// Validazione
session = getSession(sessionId, userId)
if (!session) → 404
if (session.state !== 'ready' && session.state !== 'vat_complete') → 409

// INSERT ottimistico — TUTTI i campi
tempProfile = session.erpId ?? `TEMP-${Date.now()}`
formInput = {
  name, vatNumber, pec, sdi, street, postalCode,
  phone, mobile, email, url, deliveryMode,
  fiscalCode, attentionTo, paymentTerms, sector,  // ← oggi mancanti
  notes, county, state, country,                   // ← oggi mancanti
}
upsertSingleCustomer(userId, formInput, tempProfile, 'pending')

// Risposta immediata
res.json({ success: true, data: { taskId }, message: '...' })

// ASYNC fire-and-forget
bot = existingBot (dalla sessione)
isVatOnForm = true

const erpId = await bot.completeCustomerCreation(customerData, isVatOnForm)
// erpId = ID reale ERP (es. "57.400")

const { snapshot, divergences } = await bot.buildSnapshotWithDiff(erpId, customerData)

// UPDATE DB: TEMP → reale, tutti i campi dal snapshot
await pool.query(`
  UPDATE agents.customers SET
    erp_id        = $1,
    bot_status    = 'snapshot',
    name_alias    = $2,
    city          = $3,
    county        = $4,
    state         = $5,
    country       = $6,
    price_group   = $7,
    line_discount = $8,
    postal_code   = COALESCE($9,  postal_code),
    fiscal_code   = COALESCE($10, fiscal_code),
    sector        = COALESCE($11, sector),
    payment_terms = COALESCE($12, payment_terms),
    attention_to  = COALESCE($13, attention_to),
    notes         = COALESCE($14, notes),
    archibald_name = COALESCE($15, archibald_name),
    updated_at    = NOW()
  WHERE erp_id = $16 AND user_id = $17
`, [
  erpId,                              // $1  erp_id reale
  snapshot?.nameAlias    ?? null,     // $2
  snapshot?.city         ?? null,     // $3
  snapshot?.county       ?? null,     // $4
  snapshot?.state        ?? null,     // $5
  snapshot?.country      ?? null,     // $6
  snapshot?.priceGroup   ?? 'DETTAGLIO (consigliato)', // $7
  snapshot?.lineDiscount ?? 'N/A',    // $8
  snapshot?.postalCode   ?? null,     // $9  COALESCE
  snapshot?.fiscalCode   ?? null,     // $10 COALESCE
  snapshot?.sector       ?? null,     // $11 COALESCE
  snapshot?.paymentTerms ?? null,     // $12 COALESCE
  snapshot?.attentionTo  ?? null,     // $13 COALESCE
  snapshot?.notes        ?? null,     // $14 COALESCE
  snapshot?.name         ?? null,     // $15 archibald_name COALESCE
  tempProfile,                        // $16 WHERE erp_id
  userId,                             // $17 WHERE user_id
])

upsertAddressesForCustomer(userId, result.erpId, addresses)
setAddressesSyncedAt(userId, result.erpId)
updateVatValidatedAt(userId, result.erpId)

if (result.divergences.length > 0) {
  logger.warn('create-customer: ERP divergences', { divergences: result.divergences })
}

smartCustomerSync()

broadcast(userId, 'JOB_COMPLETED', {
  jobId: taskId,
  result: {
    erpId: result.erpId,
    divergences: result.divergences.length > 0 ? result.divergences : undefined,
  }
})
```

**ERROR path:**
```typescript
updateCustomerBotStatus(userId, tempProfile, 'failed')
sessionManager.setError(sessionId, error.message)
await sessionManager.removeBot(sessionId)
resumeSyncs()
broadcast(userId, 'JOB_FAILED', { jobId: taskId, error: error.message })
```

---

## 7. Frontend `CustomerCreateModal` — cambiamenti

### 7.1 Rimosso
- Prop `contextMode` e tutta la logica `contextMode === "order"`
- State `pendingSave` + entrambi i relativi `useEffect`
- Logica navigazione avanti durante VAT check
- `handleSave` check `!erpValidated && interactiveSessionId`
- `erpValidated` state (non serve più — il wizard avanza solo dopo VAT ok)

### 7.2 Step 1 — "vat" (bloccante)

```
Rendering:
  → Input P.IVA + bottone "Verifica P.IVA"
  → Se vatChecking=true: overlay spinner sull'intero modal
    "Verifica in corso... (~30 secondi)"
  → Nessun bottone "Avanti", nessuna navigazione possibile

Handler "Verifica":
  → setVatChecking(true)
  → beginInteractiveSession(vatNumber) → ottieni sessionId
  → WS gestisce le uscite:

  CUSTOMER_VAT_RESULT:
    → setFormData(prev => ({ ...prev, autofill da vatResult }))
    → setVatChecking(false)
    → setCurrentStep('anagrafica')

  CUSTOMER_VAT_DUPLICATE:
    → setVatChecking(false)
    → setVatError(`Cliente già esistente nell'ERP (ID: ${erpId})`)
    → rimane su step 'vat'

  CUSTOMER_INTERACTIVE_FAILED:
    → setVatChecking(false)
    → setVatError('Impossibile connettersi all\'ERP. Riprova.')
    → rimane su step 'vat'
    → setInteractiveSessionId(null)

  timeout 60s (safety):
    → setVatChecking(false)
    → setVatError('Timeout: nessuna risposta dall\'ERP. Riprova.')
    → rimane su step 'vat'
```

### 7.3 Step 7 — "riepilogo"

```
Dopo JOB_COMPLETED:
  → se divergences presenti:
    banner informativo (non bloccante):
    "⚠ N campi modificati dall'ERP rispetto a quanto inserito"
    [lista campo: inviato → salvato]
  → dopo 2s: onSaved() + onClose()
```

### 7.4 `performSave` semplificata

```typescript
const performSave = async () => {
  setSaving(true)
  setError(null)
  setBotError(null)
  try {
    const result = await customerService.saveInteractiveCustomer(
      interactiveSessionId!,
      { ...formData, addresses: localAddresses }
    )
    if (result.taskId) {
      setTaskId(result.taskId)
      setProcessingState('processing')
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Errore durante il salvataggio')
  } finally {
    setSaving(false)
  }
}
```

### 7.5 Entry point `OrderFormSimple`

Invariato nel comportamento: mostra "+ Crea cliente" quando ricerca = 0 risultati.  
Cambia solo: non passa più `contextMode="order"` al modal.

---

## 8. Cosa viene eliminato

| File | Elemento eliminato |
|---|---|
| `archibald-bot.ts` | metodo `createCustomer` (rimpiazzato da `completeCustomerCreation` unificato) |
| `backend/src/operations/handlers/create-customer.ts` | intero file (handler BullMQ non più usato per create standard) |
| `backend/src/routes/customers.ts` | route `POST /api/customers` per create (o mantenuta solo come stub) |
| `CustomerCreateModal.tsx` | prop `contextMode`, state `pendingSave`, logica avanzamento parallelo |
| `customers.service.ts` | funzione `createCustomer` (sostituita da `saveInteractiveCustomer`) |

**Nota:** il handler BullMQ `create-customer` e la route `POST /api/customers` possono essere mantenuti temporaneamente come fallback di emergenza (non esposti in UI), ma non fanno parte del flusso standard.

---

## 9. Sequenza di implementazione

### Fase 0 — Diagnostica (prerequisito obbligatorio)
Eseguire script D1-D7 su ERP reale. Documentare findings in `archibald-web-app/backend/scripts/diag/create-customer/`. Aggiornare spec se findings contraddicono assunzioni.

### Fase 1 — Bot unificato
Sulla base dei findings diagnostici: implementare `completeCustomerCreation` unificato + `buildSnapshotWithDiff`. Scrivere test unitari per `diffSnapshot`.

### Fase 2 — Backend route
Aggiornare `/interactive/:id/save`: formInput completo, UPDATE erp_id, chiamata a `completeCustomerCreation`, readback + diff, log divergenze.

### Fase 3 — Frontend
Aggiornare `CustomerCreateModal`: step VAT bloccante, rimozione `contextMode`, `pendingSave`, banner divergenze. Aggiornare `OrderFormSimple`.

### Fase 4 — Cleanup
Eliminare `createCustomer` bot, handler BullMQ, route non-interattiva. Aggiornare test.

### Fase 5 — Verifica E2E
Test E2E completo su ERP reale: creazione cliente con dati reali, verifica DB, verifica autofill, verifica divergences. Seguire `feedback_e2e_before_deploy.md`.

---

## 10. Test coverage

### Unit test
- `diffSnapshot(snapshot, formData)` — casi: nessuna divergenza, divergenza singola, normalizzazione case/trim, campi speciali (postalCode "N/A", url "nd.it")
- Validazione schema Zod in `/save` — tutti i campi presenti

### Integration test
- `/interactive/begin` → `/interactive/:id/save` — verifica erp_id aggiornato da TEMP a reale
- `/save` con sessione scaduta → 409
- `/save` con bot stale → recovery e completamento
- DB dopo save: tutti i campi snapshot presenti, nessun NULL inatteso

### E2E (su ERP reale, post-deploy)
- Creazione completa con P.IVA valida → verifica tutti i campi in ERP
- Tentativo con P.IVA duplicata → CUSTOMER_VAT_DUPLICATE
- Tentativo con ERP non raggiungibile → CUSTOMER_INTERACTIVE_FAILED
- Form compilato lentamente (5+ min) → sessione ancora viva
- Bot stale recovery → creazione completata correttamente

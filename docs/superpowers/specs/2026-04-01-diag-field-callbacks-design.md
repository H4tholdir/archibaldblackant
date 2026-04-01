# Spec: diag-field-callbacks.mjs

**Data**: 2026-04-01  
**Obiettivo**: Script Puppeteer standalone che (1) sonda i callback XHR di ogni campo nel form nuovo cliente ERP e (2) corregge il cliente Claudio Palmese (erp_id 57396) con i dati corretti.

---

## Contesto

### Bug identificati nella creazione cliente

Durante la creazione di "Dr. Claudio Palmese" (P.IVA 05432401213, erp_id 57.396) sono stati
osservati i seguenti problemi nel bot `createCustomer`:

1. **NOME DI RICERCA = "PLMCLD76T10A390T"** — il callback XHR del campo FISCALCODE sovrascrive
   NAMEALIAS con il valore del codice fiscale, annullando l'auto-fill iniziale da NAME.
2. **CAP = 62013 invece di 80038** — il callback VATNUM (validazione P.IVA, 20-28s asincrono)
   sovrascrive LOGISTICSADDRESSZIPCODE con l'indirizzo del registro IVA, ignorando il CAP inserito
   dall'utente.
3. **CODICE FISCALE vuoto in ERP** — mismatch "actual: """ dopo Tab su FISCALCODE; il retry non
   è certificato come sufficiente.
4. **customerProfileId = "UNKNOWN"** — già fixato: estrazione dall'URL post-save + fallback per nome.

### Osservazione chiave (2026-04-01, DevTools Network)

Ogni campo che triggerà un server callback genera una richiesta XHR verso
`CUSTTABLE_DetailView/?NewObject=true` (per form nuovo) o `CUSTTABLE_DetailView/{id}/`
(per form edit). Le risorse statiche (DXR.axd, DXX.axd gif/png/svg) vengono sempre caricate
ma NON sono callback — sono icone UI.

La strategia di attesa corretta è:
```
waitReady = nessun XHR pendente verso CUSTTABLE_DetailView/ per 400ms consecutivi
            AND ASPx._pendingCallbacks === 0
```

---

## Scopo dello script

### Phase 1 — Field Probe (form nuovo, senza salvataggio)

Sondare i 4 campi con callback server noti o sospetti, nell'ordine che massimizza
l'osservabilità degli effetti a cascata:

| # | Campo | ID Pattern | Valore test | Ipotesi da verificare |
|---|---|---|---|---|
| 1 | NAME | `dviNAME_Edit_I` | "Dr. Test Palmese" | Conferma NAMEALIAS auto-fill via XHR |
| 2 | FISCALCODE | `dviFISCALCODE_Edit_I` | "PLMCLD76T10A390T" | Sovrascrittura NAMEALIAS con CF? XHR? |
| 3 | CAP (popup) | `dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0` | "80038" → "Pomigliano d'Arco" | Auto-fill CITY/COUNTY/STATE/COUNTRY |
| 4 | VATNUM | `dviVATNUM_Edit_I` | "13890640967" | Sovrascrittura CAP con indirizzo IVA? Timing? |

VATNUM viene **ultimo** così possiamo osservare se sovrascrive il CAP già impostato al passo 3.

Per ogni campo:
1. Snapshot DOM di tutti gli input `xaf_dvi*` (id + value)
2. Fill campo + Tab (keyboard events autentici via `page.type`)
3. `waitForXhrSettle` (descritto sotto)
4. Snapshot DOM post-settle
5. Calcolo diff: quali field_id hanno cambiato value?
6. Log strutturato: `{ field, xhrCount, settleMs, changedFields: {id: {before, after}} }`

**Fine Phase 1**: naviga via con `page.goto(CUSTTABLE_ListView)` — NON salvare.

### Phase 2 — Fix Palmese (update erp_id 57396)

Correggere il cliente Dr. Claudio Palmese con i dati esatti forniti dall'utente:

| Campo | Valore corretto | Ordine scrittura |
|---|---|---|
| CAP | "80038" (Pomigliano d'Arco, NA, Campania, IT) | 1° — prima di FISCALCODE per evitare race |
| FISCALCODE | "PLMCLD76T10A390T" | 2° — poi attendi settle callback |
| NAMEALIAS | "Dr. Claudio Palmese" | 3° — esplicito, sovrascrive callback FISCALCODE |
| SDI | "C3UCNRB" | 4° — campo semplice, nessun callback atteso |

**VATNUM non viene re-inserito** — la P.IVA è già validata nell'ERP, re-inserirla
triggerherebbe di nuovo il callback che sovrascrive CAP.

Flusso Phase 2:
1. Naviga `CUSTTABLE_DetailView/57396/?mode=Edit` (accesso diretto in edit mode)
2. Attendi form pronto (waitForDevExpressReady)
3. Scrivi CAP tramite popup iframe (pattern esistente `selectFromDevExpressLookup`)
4. Attendi settle CAP callback
5. Scrivi FISCALCODE + attendi settle
6. Scrivi NAMEALIAS esplicito + attendi settle
7. Scrivi SDI
8. Salva (`saveAndCloseCustomer` pattern: cerca "Salvare" / "Save" button)
9. Verifica post-save: naviga view mode, legge NAMEALIAS, FISCALCODE, CAP, SDI dal DOM
10. Stampa risultato: OK / FAIL per ogni campo

---

## Funzione `waitForXhrSettle`

```javascript
/**
 * Attende che non ci siano XHR pendenti verso il form endpoint
 * per almeno quietMs consecutivi, o finché maxWaitMs non scade.
 *
 * Usa CDP Network.requestWillBeSent / Network.loadingFinished per tracking preciso.
 * Fallback: ASPx._pendingCallbacks === 0 come indicatore secondario.
 */
async function waitForXhrSettle(page, cdpSession, {
  formUrlPattern = 'CUSTTABLE_DetailView',
  quietMs = 400,
  maxWaitMs = 35000
} = {}) { ... }
```

Implementazione:
- `cdpSession.on('Network.requestWillBeSent', ...)` → incrementa counter XHR pendenti
- `cdpSession.on('Network.loadingFinished', ...)` + `Network.loadingFailed` → decrementa
- Poll ogni 100ms: `pendingXhr === 0 AND pendingCallbacks === 0`
- Se quiet per `quietMs` ms → settled ✓
- Se `maxWaitMs` scade → log warning e procedi

---

## Output

### Console
```
[PROBE] NAME
  → XHR: 1 (settle: 180ms)
  → CHANGED: NAMEALIAS "" → "Dr. Test Palmese"

[PROBE] FISCALCODE
  → XHR: 1 (settle: 310ms)
  → CHANGED: NAMEALIAS "Dr. Test Palmese" → "PLMCLD76T10A390T"  ← BUG confermato

[PROBE] CAP
  → XHR: 1 (settle: 220ms)
  → CHANGED: CITY "" → "Pomigliano d'Arco", COUNTY "" → "NA", ...

[PROBE] VATNUM
  → XHR: 3 (settle: 24800ms)
  → CHANGED: LOGISTICSADDRESSZIPCODE "80038" → "62013"  ← BUG confermato

[FIX PALMESE]
  CAP → 80038: OK (CITY=Pomigliano d'Arco)
  FISCALCODE → PLMCLD76T10A390T: OK
  NAMEALIAS → Dr. Claudio Palmese: OK
  SDI → C3UCNRB: OK
  SAVE: OK
  VERIFY: NAMEALIAS=Dr. Claudio Palmese ✓ | FISCALCODE=PLMCLD76T10A390T ✓ | CAP=80038 ✓ | SDI=C3UCNRB ✓
```

### File JSON
`archibald-web-app/backend/logs/diag-field-callbacks-2026-04-01.json`

```json
{
  "timestamp": "2026-04-01T21:30:00Z",
  "erpUrl": "https://4.231.124.90/Archibald",
  "phase1": {
    "NAME": { "xhrCount": 1, "settleMs": 180, "changedFields": {...} },
    "FISCALCODE": { "xhrCount": 1, "settleMs": 310, "changedFields": {...} },
    "CAP": { "xhrCount": 1, "settleMs": 220, "changedFields": {...} },
    "VATNUM": { "xhrCount": 3, "settleMs": 24800, "changedFields": {...} }
  },
  "phase2Palmese": {
    "success": true,
    "fieldsVerified": { "NAMEALIAS": true, "FISCALCODE": true, "CAP": true, "SDI": true }
  }
}
```

---

## Configurazione tecnica

| Parametro | Valore |
|---|---|
| File | `archibald-web-app/backend/scripts/diag-field-callbacks.mjs` |
| Runtime | `node diag-field-callbacks.mjs` (dalla dir backend) |
| ERP URL | `https://4.231.124.90/Archibald` |
| Credenziali | `ikiA0930` / `Fresis26@` |
| headless | `false` — Chrome visibile sul Mac |
| slowMo | `60ms` — stabilità DevExpress |
| SSL | `ignoreHTTPSErrors: true` |
| CDP | `page.target().createCDPSession()` + `Network.enable` |
| Puppeteer | già in `devDependencies` del backend |

---

## Pre-condizioni

1. Puppeteer installato in `archibald-web-app/backend` (già presente)
2. ERP raggiungibile su `4.231.124.90` dalla rete locale
3. Cliente 57396 (Palmese) esistente nell'ERP
4. Record `UNKNOWN` eliminato dal DB prima di eseguire lo script

---

## Limiti e rischi

- **Phase 1 non salva**: se il browser crasha durante VATNUM probe (35s), il form rimane aperto.
  L'ERP lo chiuderà automaticamente per timeout sessione.
- **Phase 2 modifica dati reali**: eseguire solo dopo aver confermato lo stato attuale del cliente
  con lo screenshot dell'ERP.
- **VATNUM probe usa P.IVA reale** (13890640967): la validazione chiama il registro imprese
  italiano. Non ci sono side-effect lato ERP dalla sola digitazione senza salvataggio.

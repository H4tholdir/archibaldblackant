# Update Customer — Redesign Completo v2

**Data:** 2026-04-04  
**Stato:** Approvato, pronto per implementazione  
**Estende:** `2026-03-27-update-customer-redesign.md` (sostituisce le sezioni Bot e UX)  
**Scope:** Bot chirurgico, edit-mode inline, validazione IVA two-track, CRUD indirizzi, sistema reminder, widget dashboard

---

## 1. Obiettivi

1. **Bot chirurgico**: `updateCustomerSurgical` scrive solo i campi effettivamente modificati, naviga direttamente per erpId (no ricerca per nome), corregge tutti i bug certificati.
2. **Edit-mode inline**: pulsante FAB "✏ Modifica" nella `CustomerProfilePage`, progress bar inline nell'hero durante il save, `GlobalOperationBanner` come fallback se l'utente naviga via.
3. **VAT two-track**: se P.IVA già validata → skip; se mancante o non validata → step obbligatorio di validazione via mini-sessione bot prima di poter salvare altri campi.
4. **Address CRUD completo**: add/edit/delete accumulati in stato locale; inviati all'ERP in un unico bot pass al momento del salvataggio principale.
5. **Sistema Reminder CRM-grade**: gestione reminder per ricontatto cliente con tipo, priorità, ricorrenza, snooze, note di completamento.
6. **Dashboard widget**: `RemindersWidgetNew` in posizione #2 nella Dashboard (dopo HeroStatus, prima di BonusRoadmap).
7. **CustomerProfilePage redesign**: avatar grande, indicatore completezza, layout per viewport, quick actions corrette, bug fixes.
8. **Bug fixes certificati**: ricerca autocomplete, route "Ordine", `PhotoCropModal`, bottone "+ Nuovo Cliente".

---

## 2. CustomerProfilePage — Redesign

### 2.1 Hero Section

La hero section diventa molto più visiva e informativa.

**Avatar e foto:**
- Dimensione: 96px mobile, 120px tablet, 140px desktop (era 60px)
- Cerchio con bordo sfumato `#3b82f6` → `#8b5cf6`
- Foto cliente caricabile (click su avatar apre `PhotoCropModal`)
- Fallback: iniziali primelettera ragione sociale (2 char), sfondo gradiente blu-viola
- `PhotoCropModal`: restore completo crop/scale/rotate — il cerchio di crop è trascinabile, la pinch-to-zoom è abilitata su touch, il pulsante "Ritaglia e salva" genera un blob 256×256 che viene uploadato

**Indicatore completezza scheda:**
- Barra circolare (progress ring SVG) accanto all'avatar: 0–100%
- Verde se 100%, arancione se 50–99%, rosso se <50%
- Hover/tap mostra tooltip: "Campi mancanti: PEC, SDI"
- Calcolato su: name, vatNumber, vatValidatedAt, pec|sdi, street, postalCode, postalCodeCity (7 campi obbligatori)

**Quick actions (pulsanti sempre visibili sotto avatar):**
| Azione | Logica | Viewport |
|---|---|---|
| 📋 Ordine | Route `/order?customerId={erpId}` (FIX: era `/orders` senza parametri) | tutti |
| 📞 Chiama | `tel:{phone}` — disabilitato se assente | tutti |
| ✉ Email | `mailto:{email}` | tutti |
| 📍 Maps | `https://maps.google.com/?saddr=Current+Location&daddr={address}` con calcolo distanza via Geolocation API | tutti |

**Indicatore reminder attivo:**
- Se esiste un reminder attivo per questo cliente, mostra badge 🔔 arancione vicino al nome
- Click/tap → scroll alla sezione Promemoria nella scheda

### 2.2 Layout per viewport

**Mobile (< 640px):**
- Hero in colonna: avatar centrato (96px) + nome + badge completezza in fila + quick actions in griglia 2×2
- Sezioni in colonna singola
- Storico inline: lista verticale ultimi 10 ordini
- Sezione Promemoria: accordeon sotto Commerciale

**Tablet (641–1024px):**
- Hero: avatar 120px a sinistra, nome + badge a destra, quick actions in riga orizzontale
- Sezioni in griglia 2 colonne
- Storico inline: tabella 3 colonne (data, numero, importo)

**Desktop (> 1024px):**
- Hero: avatar 140px + info + quick actions inline
- Sezioni in griglia fino a 3 colonne
- Storico inline: tabella completa 5 colonne (data, numero, importo, stato, link)
- Sidebar degli ordini recentissimi visibile al lato

### 2.3 Sezione Storico inline

La sezione Storico nel profilo cliente mostra gli ultimi 20 ordini direttamente nella scheda, senza navigare altrove.

Colonne visibili:
- Data (formato gg/mm/aaaa)
- Numero ordine (link → `/orders/:orderId`)
- Importo totale (formattato in euro)
- Stato badge (colori: verde = consegnato, blu = in corso, giallo = sospeso, rosso = annullato)

Mobile: lista compatta 3 colonne (data, numero, importo). Desktop: tabella completa.

Filtri inline sopra la lista: "Ultimi 3 mesi" · "Quest'anno" · "Tutti"

### 2.4 Search autocomplete fix (CustomerList)

**Bug**: nella barra di ricerca di `CustomerList`, focus sull'input apre l'autofill nativo del browser che copre i risultati.

**Fix**: aggiungere `autoComplete="off"` + `spellCheck={false}` + `data-form-type="other"` all'input di ricerca. Questi attributi disabilitano il suggerimento nativo in tutti i browser principali.

### 2.5 Bottone "+ Nuovo Cliente" prominente

Attualmente il bottone è poco visibile nella `CustomerList`.

**Fix**: bottone grande, sempre visibile, in posizione fissa in basso a destra su mobile/tablet (FAB tondo 56px, sfondo `#2563eb`, icona ＋ bianca, testo "Nuovo cliente" su desktop). Su desktop: bottone `+ Nuovo Cliente` in topbar a destra, sfondo blu pieno, testo bianco in bold.

---

## 3. Edit Mode UX

### 3.1 Attivazione

- Pulsante FAB "✏ Modifica" in basso a destra nella `CustomerProfilePage` (sfondo `#1d4ed8`, 48px)
- Alternativa: pulsante "Modifica" nell'header della scheda (desktop)
- Quando edit mode è attivo: tutti i campi diventano input editabili, sfondo sezione cambia a `#eff6ff`, FAB mostra "💾 Salva"

### 3.2 Gestione P.IVA — due track

**Track A — P.IVA già validata** (`vat_validated_at IS NOT NULL`):
- Campo VATNUM appare in sola lettura, badge verde "✓ Validata" con data
- Non è possibile modificare la P.IVA in edit mode standard (solo lettura)
- Pulsante "Ristabilisci validazione →" visibile ma secondario (apre flow separato)
- Il bot NON ri-scrive VATNUM → nessun callback ERP → nessuna sovrascrittura CAP

**Track B — P.IVA mancante o non validata** (`vat_validated_at IS NULL`):
- In cima alla scheda (edit mode attivo) appare banner prominente:
  ```
  ⚠ P.IVA non validata
  Devi validarla prima di poter salvare. [Valida ora →]
  ```
  Colori: sfondo `#fef3c7`, bordo `#fbbf24`, testo `#92400e`
- Il pulsante "💾 Salva" è disabilitato finché la validazione non è completata
- Click "Valida ora →" avvia la mini-sessione bot di validazione (§3.3)
- Dopo validazione riuscita: banner diventa verde "✓ P.IVA validata — [data]", Salva si abilita

### 3.3 Mini-sessione bot VAT validation (Track B)

Quando l'utente clicca "Valida ora →":

1. Frontend chiama `POST /api/customers/interactive/start-edit` con `{ customerProfile, vatNumber }`
2. Backend avvia bot interattivo:
   - Naviga alla scheda cliente in ERP (`CUSTTABLE_DetailView/{erpId}/?mode=Edit`)
   - Chiama `submitVatAndReadAutofill(vatNumber)` — attende callback ERP (20–28s)
   - Invia risultato via WebSocket: `CUSTOMER_VAT_RESULT` o `CUSTOMER_INTERACTIVE_FAILED`
3. Frontend mostra spinner inline "Verifica P.IVA in corso... (~30s)" dentro il banner
4. Su `CUSTOMER_VAT_RESULT`:
   - Aggiorna badge P.IVA → "✓ Validata"
   - Pre-popola campi vuoti (stesso pattern di `CustomerCreateModal`): pec, sdi, street, postalCode, postalCodeCity, name←companyName
   - Banner diventa verde
   - Il bot lascia il form ERP in modalità Edit (pronto per `updateCustomerSurgical`)
5. Su `CUSTOMER_INTERACTIVE_FAILED`:
   - Banner torna a stato errore: "✗ Validazione fallita — [messaggio]"
   - L'utente può riprovare

**Nota**: la mini-sessione non ha timeout server (come da spec create-customer). Il bot rimane vivo finché l'utente non salva o annulla.

### 3.4 Salvataggio e progress

**Quando l'utente clicca "💾 Salva":**

1. Frontend calcola il diff: `changedFields = Object.entries(editedValues).filter(([k,v]) => v !== originalValues[k])`
2. Se `changedFields.length === 0` → mostra toast "Nessuna modifica" e chiude edit mode
3. Se ci sono modifiche agli indirizzi → includere l'intero array degli indirizzi nel payload
4. Chiama `POST /api/operations` con `{ type: 'update-customer', payload: { erpId, diff: changedFields, addresses } }`
5. Chiama `trackOperation(operationId)` → avvia tracking WebSocket
6. **Progress bar inline nell'hero**: appare sotto il nome del cliente durante il salvataggio
   - Colore blu `#2563eb`, animata
   - Messaggio: "Aggiornamento in corso..."
   - Scompare a operazione completata (toast verde "✓ Salvato")
7. **GlobalOperationBanner come fallback**: se l'utente naviga via dalla scheda durante il salvataggio, il banner persiste fino al completamento
8. Se errore → toast rosso "✗ Errore durante il salvataggio" + edit mode rimane aperto

**Progress milestones BullMQ:**

| % | Milestone |
|---|---|
| 5 | Job avviato, connessione bot |
| 15 | Navigazione ERP alla scheda cliente |
| 25 | Form in modalità edit aperto |
| 35 | Scrittura campi anagrafica |
| 50 | Scrittura campi fiscali/contatti |
| 65 | Scrittura VATNUM (solo Track B) / scrittura indirizzi alt. |
| 78 | Save ERP completato |
| 88 | Readback snapshot + persist DB |
| 100 | Completato |

### 3.5 Annullamento edit mode

- Pulsante "✕ Annulla" ripristina tutti i valori originali senza chiamate al server
- Se una mini-sessione VAT è attiva → `DELETE /api/customers/interactive/{sessionId}` per distruggerla
- Backdrop click NON chiude edit mode (invariante per la PWA)

---

## 4. Bot — `updateCustomerSurgical`

### 4.1 Navigazione

**Attuale (bug)**: cerca il cliente per nome nella ListView (3 fallback, fragile)  
**Nuovo**: naviga direttamente all'URL `CUSTTABLE_DetailView/{erpId}/?mode=Edit`

```typescript
async navigateToEditCustomerById(erpId: string): Promise<void> {
  const url = `${ERP_BASE_URL}/CUSTTABLE_DetailView/${erpId}/?mode=Edit`
  await this.page.goto(url, { waitUntil: 'networkidle2' })
  await this.waitForDevExpressIdle()
}
```

### 4.2 Logica diff-based

`updateCustomerSurgical(erpId: string, diff: CustomerDiff, addresses?: AltAddress[]): Promise<CustomerSnapshot>`

```typescript
type CustomerDiff = Partial<{
  name: string
  nameAlias: string
  fiscalCode: string
  vatNumber: string          // solo Track B, se non ancora validato
  pec: string
  sdi: string
  street: string
  postalCode: string
  postalCodeCity: string
  county: string
  state: string
  country: string
  phone: string
  mobile: string
  email: string
  url: string
  deliveryMode: string
  paymentTerms: string
  sector: string
  priceGroup: string
  lineDiscount: string
  attentionTo: string
  notes: string
}>
```

Solo i campi presenti nel diff vengono scritti. I campi assenti vengono ignorati (nessun tab, nessun click).

### 4.3 Bug fixes certificati

**Bug 1 — VATNUM ri-scritto in update**  
Causa: `updateCustomer` scriveva sempre VATNUM → callback ERP 20–28s → sovrascriveva CAP.  
Fix: VATNUM viene scritto **solo** se `diff.vatNumber` è definito (Track B). Se già validato → mai scritto.

**Bug 2 — FISCALCODE sovrascrive NAMEALIAS**  
Causa: callback XHR dopo FISCALCODE imposta NAMEALIAS = fiscalCode.  
Fix: dopo scrittura FISCALCODE + `waitXhrSettle()`, ri-scrivere esplicitamente NAMEALIAS con il valore desiderato.

```typescript
if (diff.fiscalCode) {
  await this.injectFieldsViaNativeSetter({ FISCALCODE: diff.fiscalCode })
  await this.waitXhrSettle()
  // Re-write NAMEALIAS se presente nel diff, altrimenti preserva il valore letto pre-edit
  await this.injectFieldsViaNativeSetter({ NAMEALIAS: diff.nameAlias ?? originalNameAlias })
}
```

**Bug 3 — SDI usa typeDevExpressField**  
Causa: LEGALAUTHORITY (SDI) si comporta diversamente da un campo testo standard.  
Fix: usare `injectFieldsViaNativeSetter` con il setter React nativo.

**Bug 4 — NOTES usa selector sbagliato**  
Causa: CUSTINFO è una `<textarea>`, non un `<input>`.  
Fix:
```typescript
const notesEl = await this.page.$('textarea[id*="xaf_dviCUSTINFO"]')
await notesEl!.click({ clickCount: 3 }) // seleziona tutto
await this.page.keyboard.down('Control')
await this.page.keyboard.press('KeyA')
await this.page.keyboard.up('Control')
await this.page.keyboard.press('Delete')
await this.page.keyboard.type(diff.notes, { delay: 10 })
```

**Bug 5 — Navigazione per nome fragile**  
Fix: navigazione diretta per erpId (§4.1) — eliminato completamente il codice di ricerca per nome.

### 4.4 Ordine di scrittura certificato

Ordine invariante per evitare conflitti con lookup iframe e callback XHR:

```
1. Tab "Prezzi e sconti":
   → lineDiscount (se nel diff)
   → priceGroup (se nel diff)

2. Tab "Principale" — Lookup (iframe):
   → paymentTerms (se nel diff)
   → postalCode (se nel diff) + attesa auto-fill CITY/COUNTY/STATE/COUNTRY

3. Tab "Principale" — Combo:
   → deliveryMode (se nel diff)
   → sector (se nel diff)

4. Tab "Principale" — Testo (ordine fisso):
   → name (se nel diff)
   → fiscalCode (se nel diff) → waitXhrSettle → re-write NAMEALIAS
   → nameAlias (se nel diff, o re-write post-FISCALCODE)
   → pec (se nel diff)
   → sdi via injectFieldsViaNativeSetter (se nel diff)
   → street (se nel diff)
   → phone, mobile, email, url (se nel diff)
   → attentionTo (se nel diff)
   → notes via textarea selector (se nel diff)

5. Re-write vulnerabili a race condition:
   → street (seconda scrittura se FISCALCODE presente)
   → nameAlias (re-set finale sempre)

6. VATNUM (solo Track B):
   → injectFieldsViaNativeSetter(VATNUM)
   → waitForDevExpressIdle(30s) — attesa callback ERP

7. Tab "Indirizzo alt.":
   → writeAltAddresses(addresses) — solo se addresses array è presente nel payload

8. Save:
   → saveAndCloseCustomer()

9. Snapshot:
   → buildCustomerSnapshot()
```

### 4.5 Snapshot post-update

Identico al pattern create: dopo `saveAndCloseCustomer()`, il bot riapre la scheda in sola lettura e legge tutti i campi via `buildCustomerSnapshot()`. Restituisce `CustomerSnapshot` completo.

`bot_status = 'snapshot'` nel DB dopo ogni update riuscito.

---

## 5. Backend — Handler `update-customer`

### 5.1 BullMQ handler aggiornato

File: `archibald-web-app/backend/src/operations/handlers/update-customer.ts`

```typescript
async function handleUpdateCustomer(job: Job<UpdateCustomerPayload>) {
  const { erpId, diff, addresses, userId } = job.data

  await job.updateProgress(5)

  const bot = await browserPool.acquire(userId)
  try {
    await job.updateProgress(15)
    
    // Navigazione diretta per erpId
    await bot.navigateToEditCustomerById(erpId)
    await job.updateProgress(25)

    // Form in edit mode (già aperto dall'URL con ?mode=Edit)
    await job.updateProgress(35)

    // Scrittura campi (solo quelli nel diff)
    const snapshot = await bot.updateCustomerSurgical(erpId, diff, addresses)
    await job.updateProgress(78)

    // Persist snapshot in DB
    await upsertCustomerSnapshot(userId, erpId, snapshot)
    await updateVatValidatedAt(userId, erpId)
    await job.updateProgress(88)

    // Sync clienti fire-and-forget
    smartCustomerSync(userId)

    await job.updateProgress(100)
    return { erpId, snapshot }
  } finally {
    await browserPool.release(bot)
  }
}
```

### 5.2 Payload tipo

```typescript
type UpdateCustomerPayload = {
  userId: number
  erpId: string
  diff: CustomerDiff          // campi modificati
  addresses?: AltAddress[]    // presente solo se indirizzi modificati
}
```

### 5.3 Route API

Nessuna nuova route. Il frontend usa `POST /api/operations` con `type: 'update-customer'` (già esistente).

**Nuova route per mini-sessione VAT (Track B):**
- `POST /api/customers/interactive/start-edit` — già esistente, da verificare che accetti anche `vatNumber` nel body per la riscrittura
- `DELETE /api/customers/interactive/:sessionId` — già esistente per cleanup

---

## 6. Address CRUD Inline

### 6.1 Stato locale nel frontend

Gli indirizzi alternativi sono gestiti in stato locale durante l'edit mode. Le modifiche non vengono inviate al DB né all'ERP finché l'utente non clicca "Salva".

```typescript
type LocalAddressState = {
  items: AltAddress[]
  isDirty: boolean  // true se ci sono modifiche rispetto all'originale
}
```

Operazioni supportate:
- **Aggiungi**: mostra form inline vuoto in fondo alla lista
- **Modifica**: click su indirizzo esistente → campi diventano editabili inline
- **Elimina**: click icona cestino → conferma inline (no `window.confirm` — invariante PWA)

### 6.2 Invio all'ERP

Se `localAddressState.isDirty === true` al momento del salvataggio:
- L'array completo degli indirizzi aggiornato viene incluso nel payload `update-customer`
- Il bot chiama `writeAltAddresses(addresses)` — full-replace (comportamento esistente)
- Gli indirizzi sono scritti in un unico bot pass, dopo tutti gli altri campi

### 6.3 UI della sezione indirizzi

**Sezione "Indirizzi Alternativi"** visibile sempre nella scheda cliente (non solo in edit mode).

Struttura per ogni indirizzo:
- Riga con: via · CAP · città · tipo · azioni (✎ / ✕)
- In view mode: sola lettura, link Google Maps sull'indirizzo
- In edit mode: campi editabili inline + bottone "Aggiungi indirizzo +"

Stato "dirty" segnalato da un badge arancione "● modificato" nella header della sezione.

---

## 7. Sistema Reminder

### 7.1 Schema DB — `agents.customer_reminders`

Nuova tabella, **migrazione 011** (o il numero sequente):

```sql
CREATE TABLE agents.customer_reminders (
  id                SERIAL PRIMARY KEY,
  user_id           INT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  customer_profile  VARCHAR(50) NOT NULL,
  title             VARCHAR(255) NOT NULL,
  note              TEXT,
  reminder_type     VARCHAR(30) NOT NULL DEFAULT 'ricontatto',
  -- valori: ricontatto | proposta | scadenza | followup | altro
  priority          VARCHAR(10) NOT NULL DEFAULT 'media',
  -- valori: alta | media | bassa
  due_at            TIMESTAMP WITH TIME ZONE NOT NULL,
  recurrence_type   VARCHAR(20) NOT NULL DEFAULT 'none',
  -- valori: none | weekly | monthly | annually
  recurrence_until  TIMESTAMP WITH TIME ZONE,
  snoozed_until     TIMESTAMP WITH TIME ZONE,
  completed_at      TIMESTAMP WITH TIME ZONE,
  completion_note   TEXT,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_reminders_user_due
  ON agents.customer_reminders(user_id, due_at)
  WHERE completed_at IS NULL;

CREATE INDEX idx_customer_reminders_customer
  ON agents.customer_reminders(user_id, customer_profile)
  WHERE completed_at IS NULL;
```

### 7.2 Logica "attivo"

Un reminder è **attivo** se:
- `completed_at IS NULL`
- `snoozed_until IS NULL OR snoozed_until < NOW()`

Un reminder è **scaduto** se:
- Attivo + `due_at < NOW()`

Un reminder è **di oggi** se:
- Attivo + `due_at::date = CURRENT_DATE`

### 7.3 API endpoints

| Metodo | Route | Descrizione |
|---|---|---|
| `GET` | `/api/reminders/today` | Oggi + scaduti attivi per l'agente loggato |
| `GET` | `/api/customers/:customerProfile/reminders` | Tutti i reminder per un cliente (inclusi completati) |
| `POST` | `/api/customers/:customerProfile/reminders` | Crea nuovo reminder |
| `PATCH` | `/api/reminders/:id` | Modifica (snooze, completa, edit campi) |
| `DELETE` | `/api/reminders/:id` | Elimina reminder |

**`GET /api/reminders/today` — response shape:**
```typescript
type TodayRemindersResponse = {
  overdue: ReminderWithCustomer[]   // scaduti (due_at < oggi)
  today: ReminderWithCustomer[]     // in scadenza oggi
  total_active: number              // conteggio totale attivi (inclusi futuri)
}

type ReminderWithCustomer = {
  id: number
  customer_profile: string
  customer_name: string
  title: string
  note: string | null
  reminder_type: string
  priority: string
  due_at: string  // ISO
  recurrence_type: string
  snoozed_until: string | null
}
```

**`PATCH /api/reminders/:id` — body accetta:**
```typescript
type PatchReminderBody = Partial<{
  title: string
  note: string
  reminder_type: string
  priority: string
  due_at: string
  recurrence_type: string
  recurrence_until: string
  snoozed_until: string   // per snooze: NOW() + delta
  completed_at: string    // per completamento: NOW()
  completion_note: string
}>
```

### 7.4 Notifiche scheduler

Il scheduler giornaliero (già esistente in `src/sync/sync-scheduler.ts`) aggiunge un job quotidiano:

```typescript
// Ogni giorno alle 08:00 per ogni agente attivo
async function checkCustomerReminders(userId: number) {
  const dueReminders = await getRemindersOverdueOrToday(userId)
  for (const r of dueReminders) {
    await createNotification(userId, {
      type: 'customer_reminder',
      title: `🔔 ${r.title}`,
      body: `Cliente: ${r.customer_name}`,
      data: { customerProfile: r.customer_profile, reminderId: r.id },
      action_url: `/customers/${r.customer_profile}`,
    })
  }
}
```

La notifica usa il tipo `customer_reminder` nel sistema notifiche esistente (già supportato dalla `notifications-system.md`). Click sulla notifica → `/customers/{customerProfile}` con scroll automatico alla sezione Promemoria.

### 7.5 Ricorrenza

Quando un reminder ricorrente viene completato, lo scheduler (o il PATCH handler) genera automaticamente il prossimo reminder:

```typescript
function computeNextDueAt(current: Date, recurrenceType: string): Date | null {
  switch (recurrenceType) {
    case 'weekly':   return addDays(current, 7)
    case 'monthly':  return addMonths(current, 1)
    case 'annually': return addYears(current, 1)
    default:         return null
  }
}
```

Se `recurrence_until` è definito e `nextDueAt > recurrence_until` → nessun nuovo reminder generato.

---

## 8. Sezione Promemoria nella CustomerProfilePage

### 8.1 Layout sezione

Posizione: subito sotto la sezione "Commerciale" nella scheda cliente.

**Stato vuoto:**
```
🔔 Promemoria
[+ Aggiungi promemoria]
  Nessun promemoria attivo
```

**Con reminder attivi:**
```
🔔 Promemoria                              [+ Aggiungi]
┌─────────────────────────────────────────────────────┐
│ 🔴 ALTA  [ricontatto]  Proporre rinnovo contratto   │
│ 📅 Tra 2 giorni (9 apr 2026)           ✎  ✓ Fatto │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│ 🟡 MEDIA [followup]    Verifica disponibilità        │
│ 📅 Tra 1 settimana     ⏰ Posponi ▾   ✓ Fatto       │
└─────────────────────────────────────────────────────┘
```

Reminder scaduti: sfondo `#fff1f2`, bordo sinistro `#ef4444`, testo data in rosso "Scaduto 3 giorni fa".

### 8.2 Quick action 🔔 nella hero

Nell'area quick actions della hero section, il pulsante 🔔 "Allerta":
- **Inattivo** (nessun reminder): sfondo `#1e293b`, icona grigia
- **Attivo** (reminder presente): sfondo `#7f1d1d`, badge rosso con "Xgg" (giorni al prossimo reminder)
- Click → scroll a sezione Promemoria (non apre sheet separato)

### 8.3 Form aggiungi/modifica reminder

Inline nella sezione, non bottom sheet separato. Appare sopra la lista reminder quando "Aggiungi" è cliccato.

Campi:
- **Titolo** (text, obbligatorio) — placeholder "Es. Proporre rinnovo contratto"
- **Tipo** (select): Ricontatto · Proposta · Scadenza · Followup · Altro
- **Data** (date picker): pill rapide "Domani" · "3 giorni" · "1 settimana" · "1 mese" · "📅 Scegli data..."
- **Priorità** (radio): Alta 🔴 · Media 🟡 · Bassa 🟢
- **Nota** (textarea, opzionale) — max 500 char
- **Ricorrenza** (select, opzionale): Nessuna · Settimanale · Mensile · Annuale
- **Ripeti fino al** (date, visibile solo se ricorrenza ≠ nessuna)

Azioni: [Salva] (blu) · [Annulla] (ghost)

---

## 9. Dashboard — RemindersWidgetNew

### 9.1 Posizione

**Ordine widget in Dashboard:**
1. `HeroStatusWidgetNew`
2. `RemindersWidgetNew` ← **nuovo, posizione #2**
3. `BonusRoadmapWidgetNew`
4. `OrdersSummaryWidgetNew`
5. `AlertsWidgetNew`

### 9.2 Struttura widget

```
┌─────────────────────────────────────────────────────────────┐
│ 🔔 Promemoria di oggi        [3 scaduti] [8 totali attivi] │
│ ─────────────────────────────────────────────────────────── │
│ [Oggi e scaduti (5)] [Questa settimana] [Tutti i clienti]  │
│ ─────────────────────────────────────────────────────────── │
│ ● ED  Elba Dental SRL         [ricontatto] 🔴 Scaduto 3gg  │
│       Proporre rinnovo contratto         ✓ Fatto | ⏰ Pospo… │
│                                                  Apri → │
│ ─────────────────────────────────────────────────────────── │
│ ● MV  Mario Verdi              [proposta]  🟡 Oggi         │
│       Verifica disponibilità articoli    ✓ Fatto | ⏰ Pospo… │
│                                                  Apri → │
│ ─────────────────────────────────────────────────────────── │
│              12 promemoria attivi totali                    │
│              [Gestisci tutti i promemoria →]               │
└─────────────────────────────────────────────────────────────┘
```

**Header:**
- Titolo "🔔 Promemoria di oggi"
- Badge rosso pill "3 scaduti" (visibile solo se >0 scaduti)
- Badge grigio pill "8 totali attivi"

**Tab filtro:**
- "Oggi e scaduti (N)" — default
- "Questa settimana"
- "Tutti i clienti"

**Riga reminder:**
- Avatar cliente: cerchio 32px con gradiente + iniziali
- Nome cliente (link → `/customers/{customerProfile}`)
- Badge tipo: ricontatto · proposta · scadenza · followup · altro
- Badge priorità: 🔴 alta · 🟡 media · 🟢 bassa
- Data: "Scaduto Ngg fa" (rosso) · "Oggi" (arancione) · "Tra N giorni" (grigio)
- Nota preview (troncata 60 char)
- Azioni: [✓ Fatto] · [⏰ Posponi ▾] (dropdown: +1gg / +3gg / +1 sett / 📅 Data…) · [Apri scheda →]

**Footer:**
- "N promemoria attivi totali"
- Link "Gestisci tutti i promemoria →" (per ora → `/customers` con filtro promemoria aperti — futura pagina dedicata)

### 9.3 Mobile

Su mobile il widget mantiene la stessa struttura ma le azioni per ogni reminder sono in colonna verticale (non inline):
```
Elba Dental SRL  [ricontatto] 🔴 Scaduto 3gg
Proporre rinnovo contratto
[✓ Fatto]  [⏰ Posponi]  [Apri →]
```

### 9.4 Data source

`GET /api/reminders/today` — risposta include `overdue[]` e `today[]`. Il widget mostra prima gli overdue (ordinati per data desc), poi i today (ordinati per priorità: alta prima).

---

## 10. Componenti Frontend da creare / modificare

| Componente | Azione | Note |
|---|---|---|
| `CustomerProfilePage.tsx` | Modifica | Hero redesign, avatar grande, completeness ring, quick actions corrette, edit mode, progress inline |
| `PhotoCropModal.tsx` | Modifica | Restore crop/scale/rotate — cerchio trascinabile, pinch-to-zoom |
| `CustomerRemindersSection.tsx` | Nuovo | Sezione Promemoria nella scheda cliente |
| `ReminderForm.tsx` | Nuovo | Form aggiungi/modifica reminder (inline) |
| `RemindersWidgetNew.tsx` | Nuovo | Widget Dashboard — oggi + scaduti |
| `CustomerList.tsx` | Modifica | Fix autocomplete search, bottone "+ Nuovo Cliente" prominente FAB |
| `Dashboard.tsx` | Modifica | Inserisci `RemindersWidgetNew` in posizione #2 |

---

## 11. Modifiche Backend

| File | Azione | Note |
|---|---|---|
| `archibald-bot.ts` | Modifica | Aggiungere `navigateToEditCustomerById`, `updateCustomerSurgical`; fix bug 1-5 |
| `update-customer.ts` | Modifica | Aggiornare handler BullMQ: progress milestones, chiamata a `updateCustomerSurgical`, snapshot post-update |
| `customer-interactive.ts` | Verifica | Confermare che `start-edit` accetti `vatNumber` nel body per Track B |
| `customer-reminders.ts` | Nuovo | Repository: CRUD reminder + `getRemindersOverdueOrToday` |
| `reminders.ts` (routes) | Nuovo | Routes REST reminder (today, CRUD per cliente, patch, delete) |
| `sync-scheduler.ts` | Modifica | Job giornaliero `checkCustomerReminders` alle 08:00 |
| `migrations/045-customer-reminders.sql` | Nuovo | Tabella `agents.customer_reminders` con indici |

---

## 12. Migrazioni DB

**Migrazione 045** (file: `045-customer-reminders.sql`, successiva alla 044 in prod):

```sql
CREATE TABLE IF NOT EXISTS agents.customer_reminders (
  id                SERIAL PRIMARY KEY,
  user_id           INT NOT NULL,
  customer_profile  VARCHAR(50) NOT NULL,
  title             VARCHAR(255) NOT NULL,
  note              TEXT,
  reminder_type     VARCHAR(30) NOT NULL DEFAULT 'ricontatto',
  priority          VARCHAR(10) NOT NULL DEFAULT 'media',
  due_at            TIMESTAMP WITH TIME ZONE NOT NULL,
  recurrence_type   VARCHAR(20) NOT NULL DEFAULT 'none',
  recurrence_until  TIMESTAMP WITH TIME ZONE,
  snoozed_until     TIMESTAMP WITH TIME ZONE,
  completed_at      TIMESTAMP WITH TIME ZONE,
  completion_note   TEXT,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_reminders_user_due
  ON agents.customer_reminders(user_id, due_at)
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_reminders_customer
  ON agents.customer_reminders(user_id, customer_profile)
  WHERE completed_at IS NULL;
```

Nessuna altra migrazione necessaria: tutti i campi cliente esistono già dalla migrazione `037-customer-extended-fields.sql`.

---

## 13. Test Coverage

### Unit test

- `computeNextDueAt(date, recurrenceType)` — tutti i tipi di ricorrenza, edge case `recurrence_until`
- `buildCustomerDiff(original, edited)` — nessuna modifica, modifica singola, modifica multipla, campi undefined
- `isReminderActive(reminder)` — tutti i casi (completato, snoozed, attivo, scaduto)

### Integration test

- `POST /api/customers/:customerProfile/reminders` → crea reminder, verifica DB
- `PATCH /api/reminders/:id` con `snoozed_until` → reminder non appare in `getRemindersOverdueOrToday`
- `PATCH /api/reminders/:id` con `completed_at` → genera prossimo reminder se ricorrente
- `GET /api/reminders/today` → risposta include solo attivi + non snoozed
- `POST /api/operations` (update-customer) con diff vuoto → no job enqueued (frontend previene, backend verifica)

### E2E (su ERP reale, post-deploy)

- Edit mode Track A (IVA validata): modifica nome → save → verifica ERP + DB, VATNUM non ri-scritto
- Edit mode Track B (IVA mancante): click "Valida ora →" → spinner → autofill → save → verifica ERP + DB
- Modifica indirizzi: aggiungi + elimina → save → verifica `writeAltAddresses` in ERP
- Reminder: crea, snooze, completa → verifica DB + notifica scheduler

---

## 14. Invarianti del Design (vincolanti)

1. **Bot non cerca per nome**: `updateCustomerSurgical` naviga sempre direttamente per `erpId`. La ricerca per nome è eliminata.
2. **VATNUM mai ri-scritto se già validato**: nessuna eccezione. Il campo è read-only in edit mode Track A.
3. **Diff-based**: il bot non tocca campi non presenti nel diff. Nessuna scrittura di campi invariati.
4. **Snapshot garantito**: ogni update bot termina con `buildCustomerSnapshot()` + persist in DB.
5. **No `window.confirm`**: tutti i dialoghi di conferma nella PWA usano inline confirm state o styled modal.
6. **Backdrop click non chiude edit mode**: coerente con tutti gli altri modal/edit della PWA.
7. **Dati reali nei mockup companion**: i file HTML in `.superpowers/brainstorm/92051-1775263372/content/` sono la spec visiva vincolante. L'implementazione deve riprodurli identicamente.
8. **Responsive**: ogni componente ha comportamento esplicito per `< 640px`, `641–1024px`, `> 1024px`.
9. **Reminder non bloccante**: il sistema reminder è un layer CRM opzionale, non interferisce con il flusso ordini.

---

## 15. File Mockup Companion (riferimento visivo vincolante)

Tutti i file sono in `.superpowers/brainstorm/92051-1775263372/content/`:

| File | Contenuto |
|---|---|
| `update-save-flow.html` | 3 opzioni per save UX — **opzione B approvata** |
| `vat-status-edit.html` | 3 opzioni per VAT in edit mode — **opzione A approvata** |
| `addresses-crud.html` | 3 opzioni per address CRUD+sync — **opzione A approvata** |
| `design-frontend-ux.html` | Design completo edit mode: stato VAT mancante vs validato + saving |
| `profile-redesign.html` | CustomerProfilePage redesign — mobile + desktop + annotazioni |
| `customer-reminder.html` | 3 opzioni placement reminder (A+C fusion approvata) |
| `reminder-system.html` | Sistema reminder completo: lista + form aggiungi/modifica |
| `dashboard-reminders-widget.html` | `RemindersWidgetNew` nel contesto Dashboard — desktop + mobile |

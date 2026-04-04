# Update Customer — Redesign Completo v2

**Data:** 2026-04-04  
**Stato:** Approvato, pronto per implementazione  
**Sostituisce:** `2026-03-27-update-customer-redesign.md` — layout a tab, sidebar e bot precedente sono completamente rimpiazzati da questo documento  
**Scope:** Bot chirurgico, edit-mode inline, validazione IVA two-track, CRUD indirizzi, sistema reminder, widget dashboard

---

## 1. Obiettivi

1. **Bot chirurgico**: `updateCustomerSurgical` scrive solo i campi effettivamente modificati, naviga direttamente per `erpId` (no ricerca per nome), corregge tutti i bug certificati.
2. **Edit-mode inline**: FAB "✏ Modifica" nella `CustomerProfilePage`, progress bar inline nell'hero durante il save, `GlobalOperationBanner` come fallback se l'utente naviga via.
3. **VAT two-track**: se P.IVA già validata → skip; se mancante o non validata → step obbligatorio di validazione via mini-sessione bot prima di poter salvare altri campi.
4. **Address CRUD completo**: add/edit/delete accumulati in stato locale; inviati all'ERP in un unico bot pass al momento del salvataggio principale.
5. **Sistema Reminder CRM-grade**: gestione reminder per ricontatto cliente con tipo, priorità, ricorrenza, snooze, canale notifica, note di completamento.
6. **Dashboard widget**: `RemindersWidgetNew` in posizione #2 nella Dashboard (dopo HeroStatus, prima di BonusRoadmap).
7. **CustomerProfilePage redesign**: avatar grande, completeness indicator CSS, layout per viewport, quick actions corrette (7 totali), storico con KPI + chart, bug fixes.
8. **Bug fixes certificati**: ricerca autocomplete, route "Ordine", `PhotoCropModal` crop/scale/rotate, bottone "+ Nuovo Cliente".

---

## 2. CustomerProfilePage — Redesign

### 2.1 Sostituzione layout tab

Il vecchio spec (2026-03-27) usava un layout a tab (Dati · Ordini · Note interne · Indirizzi alt.) con sidebar fissa. Questo layout è **completamente sostituito** dal seguente design a sezioni scrollabili:

- **Mobile e Tablet**: pagina scrollabile con section-cards (nessuna sidebar, nessun tab)
- **Desktop**: sidebar stretta fissa (160px) con avatar + azioni + completeness bar + main area con section-cards scrollabili

Le sezioni nella main area (tutte sempre visibili, non a tab):
1. Contatti
2. Indirizzo principale
3. Anagrafica (ragione sociale, alias, attenzione, settore, CF)
4. Dati Fiscali (P.IVA, PEC, SDI, validazione)
5. Commerciale (listino, sconto, pagamento, gruppo prezzo)
6. Note (CUSTINFO, textarea ERP)
7. **Note interne agente** (note private, non sincronizzate con ERP, colonna `agent_notes TEXT` in `agents.customers`)
8. Indirizzi alternativi
9. Storico ordini (inline)
10. Promemoria

### 2.2 Hero Section

**Avatar:**

| Viewport | Dimensione | Forma |
|---|---|---|
| Mobile | **130px** | circolare (`border-radius: 50%`) |
| Tablet | **130px** | circolare |
| Desktop (sidebar) | **120px** | arrotondato (`border-radius: 20px`) |

Gradiente sfondo: `linear-gradient(135deg, #3b82f6, #8b5cf6)`. Fallback: prime 2 iniziali, peso 800, colore bianco.  
Bottone 📷 in basso a destra dell'avatar (24–28px, sfondo bianco, bordo `#1e293b`): apre file picker O fotocamera → `PhotoCropModal` con crop/scale/rotate completi (da ripristinare).

**Completeness indicator (NON SVG ring — CSS border + banner):**

- **Anello CSS attorno all'avatar**: `border: 3px dashed #f59e0b` se incompleto · `border: 3px solid #22c55e` se completo (desktop: `border-radius: 24px` per coerenza con forma arrotondata)
- **Badge numerico sull'avatar** (top-right assoluto): sfondo `#f59e0b`, testo bianco, es. "3 mancanti"
- **Banner lineare giallo sotto l'hero** (mobile/tablet): `background: #fffbeb`, progress bar con percentuale + freccia "Completa →"
- **Desktop (sidebar)**: barra lineare orizzontale (`height: 4px`, `background: #22c55e`) + testo "Profilo 70% — 3 mancanti"
- **Ogni sezione-card**: badge `✓` verde o `⚠` giallo nell'header · campo mancante: pallino arancione `●` inline

Calcolato su: `name, vatNumber, vatValidatedAt, pec|sdi, street, postalCode, postalCodeCity` (7 campi obbligatori), basato su `customer-completeness.ts` già esistente.

**Quick stats nell'hero (tutti i viewport, sotto il nome):**

3 valori calcolati dagli ordini già in memoria (zero nuove API):
- N° ordini totali
- Fatturato anno corrente
- Data ultimo ordine

**Quick actions (7 pulsanti, tutti i viewport):**

| # | Azione | Logica | Note |
|---|---|---|---|
| 1 | 📋 Nuovo ordine | `/order?customerId={erpId}` | FIX: era `/orders` senza parametri |
| 2 | 📞 Chiama | `tel:{phone}` | Disabilitato se assente |
| 3 | 💬 WhatsApp | `https://wa.me/{mobile}` | Disabilitato se assente |
| 4 | ✉ Email | `mailto:{email}` | Disabilitato se assente |
| 5 | 📍 Indicazioni | `https://maps.google.com/?daddr={VIA},{CITTÀ}&travelmode=driving` | Google Maps usa GPS utente come partenza automaticamente |
| 6 | 🔔 Allerta | Apre form **"Nuovo promemoria"** direttamente | Sfondo `#7f1d1d` se reminder attivi, con badge COUNT |
| 7 | 📊 Analisi | Espande vista storico avanzata con mini chart mensile | Sfondo `#1e3a5f` |

**Indicatore reminder nell'hero (accanto al nome):**

- 🔔 badge con **COUNT totale reminder attivi**
- Testo sotto: `"⏰ N urgente · scade oggi"` se ci sono scaduti o urgenti
- Click → scroll alla sezione Promemoria

### 2.3 Layout per viewport

**Mobile (< 640px):**
- Hero in colonna: avatar 130px centrato + nome + quick stats in riga (3 valori) + banner completezza + quick actions in griglia flex-wrap
- Main area: sezioni scrollabili in colonna singola (field layout: **label a sinistra, valore a destra** — non grid)
- Campi vuoti: "—" grigio chiaro (`#e2e8f0`)

**Tablet (641–1024px):**
- Hero: simile a mobile, quick actions più spaziose
- Main area: sezioni in griglia 2 colonne

**Desktop (> 1024px):**
- Sidebar fissa 160px: avatar 120px arrotondato + nome + completeness bar lineare + 6 action buttons verticali
- Main area: section-cards in griglia 2 colonne, layout label/value come desktop card

### 2.4 Sezione Storico ordini (inline)

**Intestazione card**: "Storico ordini" + conteggio totale a destra  

**KPI stats** (presenti su tutti i viewport, dentro la card):
- Fatturato anno corrente
- Media per ordine
- Ultimo ordine (data)

**Mini bar chart mensile** (solo desktop): barre SVG/div mensili, altezza proporzionale al fatturato, ultimi 8 mesi, barre blu `#1d4ed8` (con attività) / grigie `#334155` (senza), label mesi sotto

**Filtri chip** (tutti i viewport): **Tutto** · Quest'anno · 3 mesi · Mese ← ordine esatto dal mockup

**Lista ordini**: indicatore colore (pallino blu = recente, grigio = vecchio) + numero ordine (link) + data + importo allineato a destra + freccia `›`

### 2.5 Search autocomplete fix (CustomerList)

Fix barra di ricerca in `CustomerList.tsx`:

```tsx
<input
  autoComplete="off"
  autoCorrect="off"    // ← aggiunto rispetto alla spec precedente
  spellCheck={false}
  data-form-type="other"
  ...
/>
```

### 2.6 Bottone "+ Nuovo Cliente" prominente

- **Mobile/Tablet**: FAB tondo 56px in basso a destra, sfondo `#2563eb`, icona `＋` bianca
- **Desktop**: bottone `+ Nuovo Cliente` in topbar a destra, sfondo blu pieno, testo bianco bold

---

## 3. Edit Mode UX

### 3.1 Attivazione

- Pulsante "✎ Modifica" in topbar a destra della pagina (visibile su tutti i viewport)
- Quando edit mode è attivo: campi diventano input editabili, sfondo sezione cambia a `#eff6ff`, il pulsante diventa "💾 Salva"

### 3.2 Gestione P.IVA — due track

**Track A — P.IVA già validata** (`vat_validated_at IS NOT NULL`):
- Campo VATNUM in sola lettura, badge verde "✓ Validata" con data
- Non modificabile in edit mode standard
- Il bot **NON** ri-scrive VATNUM → nessun callback ERP → nessuna sovrascrittura CAP

**Track B — P.IVA mancante o non validata** (`vat_validated_at IS NULL`):
- In cima alla pagina (edit mode attivo) appare banner prominente:
  ```
  ⚠ P.IVA non validata
  Devi validarla prima di poter salvare. [Valida ora →]
  ```
  Colori: sfondo `#fef3c7`, bordo `#fbbf24`, testo `#92400e`
- Pulsante "💾 Salva" disabilitato finché validazione non completata
- Click "Valida ora →" avvia mini-sessione bot (§3.3)
- Dopo validazione: banner diventa verde "✓ P.IVA validata", Salva si abilita

### 3.3 Mini-sessione bot VAT validation (Track B)

1. Frontend → `POST /api/customers/interactive/start-edit` con `{ customerProfile, vatNumber }`
2. Backend avvia bot: naviga a `CUSTTABLE_DetailView/{erpId}/?mode=Edit`, chiama `submitVatAndReadAutofill(vatNumber)`, attende callback ERP (20–28s)
3. Frontend mostra spinner inline "Verifica P.IVA in corso... (~30s)" nel banner
4. Su `CUSTOMER_VAT_RESULT`: badge P.IVA → verde; pre-popola campi vuoti (pec, sdi, street, postalCode, postalCodeCity, name←companyName); bot lascia il form ERP in Edit pronto per `updateCustomerSurgical`
5. Su `CUSTOMER_INTERACTIVE_FAILED`: banner → "✗ Validazione fallita — [messaggio]", riprova possibile

Mini-sessione senza timeout server (invariante dal spec create-customer).

### 3.4 Salvataggio e progress

**Flusso al click "💾 Salva":**

1. Frontend calcola `diff = changedFields` (confronto editedValues vs originalValues)
2. Se `diff` vuoto → toast "Nessuna modifica", chiude edit mode
3. Se indirizzi modificati → include array completo nel payload
4. `POST /api/operations` con `{ type: 'update-customer', payload: { erpId, diff, addresses } }`
5. `trackOperation(operationId)` → avvia tracking WebSocket
6. **Progress bar inline nell'hero**: barra blu `#2563eb` sotto il nome, messaggio "Aggiornamento in corso..."
7. **GlobalOperationBanner come fallback**: se l'utente naviga via, il banner persiste fino al completamento
8. Completato → toast verde "✓ Salvato", edit mode si chiude
9. Errore → toast rosso "✗ Errore durante il salvataggio", edit mode rimane aperto

**Progress milestones BullMQ:**

| % | Milestone |
|---|---|
| 5 | Job avviato, connessione bot |
| 15 | Navigazione ERP alla scheda cliente |
| 25 | Form in modalità edit aperto |
| 35 | Scrittura campi anagrafica |
| 50 | Scrittura campi fiscali/contatti |
| 65 | Scrittura VATNUM (solo Track B) / indirizzi alt. |
| 78 | Save ERP completato |
| 88 | Readback snapshot + persist DB |
| 100 | Completato |

### 3.5 Annullamento edit mode

- Pulsante "✕ Annulla": ripristina valori originali, nessuna chiamata server
- Se mini-sessione VAT attiva → `DELETE /api/customers/interactive/{sessionId}`
- Backdrop click NON chiude (invariante PWA)

---

## 4. Bot — `updateCustomerSurgical`

### 4.1 Navigazione diretta

```typescript
async navigateToEditCustomerById(erpId: string): Promise<void> {
  const url = `${ERP_BASE_URL}/CUSTTABLE_DetailView/${erpId}/?mode=Edit`
  await this.page.goto(url, { waitUntil: 'networkidle2' })
  await this.waitForDevExpressIdle()
}
```

Eliminato completamente il vecchio codice di ricerca per nome (3 fallback fragili).

### 4.2 Tipo diff

```typescript
type CustomerDiff = Partial<{
  name: string
  nameAlias: string
  fiscalCode: string
  vatNumber: string       // solo Track B
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
  agentNotes: string      // Note interne — solo DB, non ERP
}>
```

`agentNotes` viene scritto **solo in DB** (colonna `agent_notes` in `agents.customers`), mai inviato al bot ERP.

Solo i campi presenti nel diff vengono scritti. I campi assenti vengono ignorati.

### 4.3 Bug fixes certificati

**Bug 1 — VATNUM ri-scritto in update**  
Fix: VATNUM scritto **solo** se `diff.vatNumber` è definito (Track B). Se già validato → mai scritto.

**Bug 2 — FISCALCODE sovrascrive NAMEALIAS**  
Fix:
```typescript
if (diff.fiscalCode) {
  await this.injectFieldsViaNativeSetter({ FISCALCODE: diff.fiscalCode })
  await this.waitXhrSettle()
  await this.injectFieldsViaNativeSetter({ NAMEALIAS: diff.nameAlias ?? originalNameAlias })
}
```

**Bug 3 — SDI usa typeDevExpressField**  
Fix: `injectFieldsViaNativeSetter` per LEGALAUTHORITY.

**Bug 4 — NOTES usa selector sbagliato**  
Fix:
```typescript
const notesEl = await this.page.$('textarea[id*="xaf_dviCUSTINFO"]')
await notesEl!.click({ clickCount: 3 })
await this.page.keyboard.down('Control')
await this.page.keyboard.press('KeyA')
await this.page.keyboard.up('Control')
await this.page.keyboard.press('Delete')
await this.page.keyboard.type(diff.notes, { delay: 10 })
```

**Bug 5 — Navigazione per nome fragile**  
Fix: navigazione diretta per erpId (§4.1).

### 4.4 Ordine di scrittura certificato

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
   → waitForDevExpressIdle(30s)

7. Tab "Indirizzo alt.":
   → writeAltAddresses(addresses) — solo se addresses presente nel payload

8. Save:
   → saveAndCloseCustomer()

9. Snapshot:
   → buildCustomerSnapshot()
```

### 4.5 Snapshot post-update

Dopo `saveAndCloseCustomer()`: riapre la scheda in sola lettura, legge tutti i campi via `buildCustomerSnapshot()`. Restituisce `CustomerSnapshot` completo. `bot_status = 'snapshot'` nel DB.

---

## 5. Backend — Handler `update-customer`

### 5.1 BullMQ handler

File: `archibald-web-app/backend/src/operations/handlers/update-customer.ts`

```typescript
async function handleUpdateCustomer(job: Job<UpdateCustomerPayload>) {
  const { erpId, diff, addresses, userId } = job.data

  await job.updateProgress(5)
  const bot = await browserPool.acquire(userId)
  try {
    await job.updateProgress(15)
    await bot.navigateToEditCustomerById(erpId)
    await job.updateProgress(25)
    await job.updateProgress(35)

    const snapshot = await bot.updateCustomerSurgical(erpId, diff, addresses)
    await job.updateProgress(78)

    // Persist snapshot + agent notes (solo DB)
    await upsertCustomerSnapshot(userId, erpId, snapshot)
    if (diff.agentNotes !== undefined) {
      await updateAgentNotes(userId, erpId, diff.agentNotes)
    }
    await updateVatValidatedAt(userId, erpId)
    await job.updateProgress(88)

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
  diff: CustomerDiff
  addresses?: AltAddress[]
}
```

---

## 6. Address CRUD Inline

### 6.1 Stato locale

```typescript
type LocalAddressState = {
  items: AltAddress[]
  isDirty: boolean
}
```

Operazioni: **Aggiungi** (form inline in fondo), **Modifica** (click → campi inline editabili), **Elimina** (conferma inline — no `window.confirm`)

### 6.2 Invio all'ERP

Se `isDirty === true` al salvataggio: array completo incluso nel payload → bot chiama `writeAltAddresses(addresses)` (full-replace, comportamento esistente), dopo tutti gli altri campi.

### 6.3 UI

Sezione "Indirizzi alternativi" sempre visibile. In view mode: link Google Maps su ogni riga. In edit mode: campi inline + "Aggiungi indirizzo +". Badge arancione "● modificato" nell'header se dirty.

---

## 7. Sistema Reminder

### 7.1 Schema DB — `agents.customer_reminders`

**Migrazione 045** (`045-customer-reminders.sql`, successiva alla 044 in prod):

```sql
CREATE TABLE IF NOT EXISTS agents.customer_reminders (
  id               SERIAL PRIMARY KEY,
  user_id          INT NOT NULL,
  customer_erp_id  VARCHAR(50) NOT NULL,
  type             VARCHAR(30) NOT NULL DEFAULT 'commercial_contact',
  -- valori: commercial_contact | offer_followup | payment
  --         contract_renewal | anniversary | custom
  priority         VARCHAR(10) NOT NULL DEFAULT 'normal',
  -- valori: urgent | normal | low
  due_at           TIMESTAMPTZ NOT NULL,
  recurrence_days  INT NULL,
  -- null = una volta sola; intero = ogni N giorni (es. 7=sett, 30=mese)
  note             TEXT,
  notify_via       VARCHAR(10) NOT NULL DEFAULT 'app',
  -- valori: app | email
  status           VARCHAR(10) NOT NULL DEFAULT 'active',
  -- valori: active | snoozed | done | cancelled
  snoozed_until    TIMESTAMPTZ NULL,
  completed_at     TIMESTAMPTZ NULL,
  completion_note  TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (user_id, customer_erp_id)
    REFERENCES agents.customers(user_id, erp_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_reminders_user_due
  ON agents.customer_reminders(user_id, due_at)
  WHERE status IN ('active', 'snoozed');

CREATE INDEX IF NOT EXISTS idx_customer_reminders_customer
  ON agents.customer_reminders(user_id, customer_erp_id)
  WHERE status IN ('active', 'snoozed');
```

**Tipi con colori UI:**

| Valore DB | Label UI | Colore |
|---|---|---|
| `commercial_contact` | 📞 Ricontatto commerciale | `#fee2e2` / `#dc2626` |
| `offer_followup` | 🔥 Follow-up offerta | `#fef9c3` / `#92400e` |
| `payment` | 💰 Pagamento | `#f0fdf4` / `#15803d` |
| `contract_renewal` | 🔄 Rinnovo contratto | `#eff6ff` / `#1d4ed8` |
| `anniversary` | 🎂 Ricorrenza | `#fdf4ff` / `#7e22ce` |
| `custom` | 📋 Personalizzato | `#f1f5f9` / `#64748b` |

**Priorità con colori UI:**

| Valore DB | Label UI | Badge bg | Badge text |
|---|---|---|---|
| `urgent` | 🔥 Urgente | `#fee2e2` | `#dc2626` |
| `normal` | ● Normale | `#eff6ff` | `#2563eb` |
| `low` | ↓ Bassa | `#f8fafc` | `#94a3b8` |

### 7.2 Logica stati

- **Attivo**: `status = 'active'` e (`snoozed_until IS NULL OR snoozed_until < NOW()`)
- **Snoozed**: `status = 'snoozed'` e `snoozed_until >= NOW()`
- **Scaduto**: attivo + `due_at < NOW()`
- **Di oggi**: attivo + `due_at::date = CURRENT_DATE`

### 7.3 Comportamenti

**Snooze**: `PATCH /api/reminders/:id` con `{ snoozed_until: NOW() + delta, status: 'snoozed' }`. Scheduler ri-attiva automaticamente impostando `status = 'active'` al raggiungimento di `snoozed_until`.

**Completamento con nota**: `PATCH /api/reminders/:id` con `{ status: 'done', completed_at: NOW(), completion_note: '...' }`. Se `recurrence_days IS NOT NULL` → backend crea automaticamente nuovo reminder con `due_at = completed_at + recurrence_days`.

**Ricorrenza auto**: `computeNextDueAt(completedAt, recurrenceDays)` → `new Date(completedAt.getTime() + recurrenceDays * 86400000)`.

### 7.4 API endpoints

| Metodo | Route | Descrizione |
|---|---|---|
| `GET` | `/api/reminders/today` | Scaduti + di oggi (status active/snoozed scaduto) per l'agente |
| `GET` | `/api/customers/:customerProfile/reminders` | Tutti i reminder per un cliente |
| `POST` | `/api/customers/:customerProfile/reminders` | Crea nuovo reminder |
| `PATCH` | `/api/reminders/:id` | Modifica, snooze, completa |
| `DELETE` | `/api/reminders/:id` | Elimina |

**`GET /api/reminders/today`:**
```typescript
type TodayRemindersResponse = {
  overdue: ReminderWithCustomer[]   // due_at < oggi, status active
  today: ReminderWithCustomer[]     // due_at = oggi, status active
  total_active: number
  completed_today: number           // completati oggi (per footer widget)
}

type ReminderWithCustomer = {
  id: number
  customer_erp_id: string
  customer_name: string
  type: string
  priority: string
  due_at: string  // ISO
  recurrence_days: number | null
  note: string | null
  notify_via: string
  status: string
  snoozed_until: string | null
}
```

**`PATCH /api/reminders/:id`:**
```typescript
type PatchReminderBody = Partial<{
  type: string
  priority: string
  due_at: string
  recurrence_days: number | null
  note: string
  notify_via: string
  status: string
  snoozed_until: string
  completed_at: string
  completion_note: string
}>
```

### 7.5 Scheduler notifiche

Job giornaliero alle **08:00** in `src/sync/sync-scheduler.ts`:

```typescript
async function checkCustomerReminders(userId: number) {
  const due = await getRemindersOverdueOrToday(userId)
  for (const r of due) {
    await createNotification(userId, {
      type: 'customer_reminder',
      title: `🔔 ${r.type_label}: ${r.customer_name}`,
      body: r.note ?? 'Promemoria in scadenza',
      data: { customerErpId: r.customer_erp_id, reminderId: r.id },
      action_url: `/customers/${r.customer_erp_id}`,
    })
  }
}
```

Click notifica → `/customers/{customerErpId}` con scroll automatico alla sezione Promemoria.

---

## 8. Sezione Promemoria nella CustomerProfilePage

### 8.1 Posizione e layout

Posizione: decima sezione scrollabile, dopo Storico ordini.

**Header card:**
```
🔔 Promemoria                              [+ Nuovo]
```

**Filtri tab nella card:**
- **Attivi (N)** (default) — mostra `status IN ('active', 'snoozed')`, scaduti in rosso sempre in cima
- **Completati** — mostra `status = 'done'`, ultimi 30 giorni
- **Tutti** — tutti gli stati

**Ordinamento attivi:** urgenti prima (`priority = 'urgent'`), poi `due_at ASC`.

**Struttura riga reminder:**
```
● [tipo-dot]  🔥 Follow-up offerta      [Urgente]
              ⚠ Scaduto oggi — 4 apr 2026
              "Richiamare per risposta preventivo..."
              [✓ Fatto] [⏰ +3gg] [✎] [✕]
```

- Reminder scaduti: sfondo `#fff5f5`, testo data rosso
- Reminder `done`: opacità 0.5

**Azioni per reminder:**
- `[✓ Fatto]` → apre textarea inline per `completion_note` → salva con `status: 'done'`
- `[⏰ Posponi]` → mostra opzioni: `+3gg` / `+1 sett` (inline, no dropdown separato su mobile)
- `[✎]` → espande form di modifica inline
- `[✕]` → confirm inline (no `window.confirm`) → delete

**Stato vuoto:**
```
🔔 Promemoria
Nessun promemoria attivo
[+ Aggiungi il primo promemoria]
```

### 8.2 Quick action 🔔 Allerta nell'hero

- **Inattivo** (nessun reminder): icona grigia, sfondo `#1e293b`
- **Attivo** (N reminder): sfondo `#7f1d1d`, badge rosso COUNT totale attivi
- **Click** → apre form "Nuovo promemoria" direttamente (NON scroll alla sezione)
- **Testo sotto icona**: "Allerta"

**Bell nell'hero (accanto al nome):**
- Badge rosso `🔔 N` con count reminder attivi totali
- Riga sotto nome: `"⏰ N urgente · scade oggi"` se ci sono reminder urgenti o scaduti
- Click → scroll alla sezione Promemoria

### 8.3 Form aggiungi/modifica reminder

Form inline nella card (appare sopra la lista quando "+ Nuovo" è cliccato). **Non** bottom sheet separato.

**Campi (nell'ordine del mockup):**

1. **Tipo di contatto** (select): 6 opzioni con emoji (vedi §7.1)

2. **Priorità** (3 pulsanti radio inline):
   - `🔥 Urgente` (bordo + bg rosso se selezionato)
   - `● Normale` (bordo + bg blu se selezionato)
   - `↓ Bassa` (grigio)

3. **Quando** (date chips + date input):
   - Chips rapide: **Domani · 3 giorni · 1 settimana · 2 settimane · 1 mese · 3 mesi · 📅 Data…**
   - Input date nativo sotto i chip (visibile sempre, sincronizzato con chip)

4. **Ripetizione** (select): Una volta sola · Ogni settimana · Ogni 2 settimane · Ogni mese · Ogni 3 mesi · Ogni 6 mesi · Ogni anno

5. **Notifica via** (2 pulsanti): `📱 App` (default) · `📧 Email`

6. **Nota per il ricontatto** (textarea): placeholder "Es: proporre preventivo trattamento X..."

7. **Segna come completato** (solo in modalità edit di reminder esistente):
   - Box verde `#f0fdf4` con textarea per `completion_note`

**Azioni:** `[Salva promemoria]` (blu `#0ea5e9`) · `[Annulla]` (ghost)

---

## 9. Dashboard — RemindersWidgetNew

### 9.1 Posizione

**Ordine widget in Dashboard:**
1. `HeroStatusWidgetNew`
2. **`RemindersWidgetNew`** ← nuovo, posizione #2
3. `BonusRoadmapWidgetNew`
4. `OrdersSummaryWidgetNew`
5. `AlertsWidgetNew`

### 9.2 Struttura widget (desktop)

```
┌────────────────────────────────────────────────────────────────┐
│ 🔔  Promemoria di oggi            [2 urgenti] [+3 in scadenza] │
│     Sabato 4 aprile 2026 — 5 promemoria richiedono attenzione  │
│                                                    + Nuovo →   │
│ ─────────────────────────────────────────────────────────────── │
│ [Oggi e scaduti (5)]  [Questa settimana]  [Tutti i clienti]    │
│ ─────────────────────────────────────────────────────────────── │
│ [FS]  Farmacia Sorrentino  [🔥 Follow-up offerta] [Urgente]    │
│       ⚠ Scaduto ieri — 3 apr 2026                              │
│       "Richiamare per risposta al preventivo protesi..."        │
│                    [✓ Fatto] [⏰ Posponi ▾] [Apri scheda →]   │
│ ─────────────────────────────────────────────────────────────── │
│ [OD]  Odont. Dr. Salvatore [🔥 Follow-up offerta] [Urgente]    │
│       ⚠ Scade oggi — 4 apr 2026                                │
│       "Confermare disponibilità nuova linea ceramiche"          │
│                    [✓ Fatto] [⏰ Posponi ▾] [Apri scheda →]   │
│ ─────────────────────────────────────────────────────────────── │
│  12 promemoria attivi · 2 completati oggi    Gestisci tutti → │
└────────────────────────────────────────────────────────────────┘
```

**Header:**
- Titolo "Promemoria di oggi"
- Badge rosso pill: `"N urgenti"` (visibile solo se > 0 urgenti)
- Badge grigio pill: `"+N in scadenza"` (non "totali attivi" — indica oggi + scaduti)
- Sottotitolo: `"[giorno della settimana] [data] — N promemoria richiedono attenzione"`
- Link `"+ Nuovo →"` in alto a destra

**Tab filtro:**
- `"Oggi e scaduti (N)"` (default)
- `"Questa settimana"`
- `"Tutti i clienti"`

**Riga reminder:**
- Avatar: **38px arrotondato** (`border-radius: 10px`), gradiente colorato con iniziali 2 char
- Nome cliente: link cliccabile → `/customers/{customerErpId}`
- Badge tipo: colori da §7.1
- Badge priorità: colori da §7.1
- Data: `"⚠ Scaduto ieri"` · `"⚠ Scade oggi"` (rosso) · `"Oggi"` (arancione) · `"Tra N giorni"` (grigio)
- Nota preview: troncata con `text-overflow: ellipsis`, `max-width: 340px`
- Azioni desktop (colonna verticale a destra):
  - `[✓ Fatto]` (verde)
  - `[⏰ Posponi ▾]` con dropdown hover: "+1 giorno" · "+3 giorni" · "+1 settimana" · "Data personalizzata…"
  - `[Apri scheda →]` (blu)

**Riga hoverable**: `background: #f8fafc` on hover; riga scaduta: `background: #fff5f5`, `border-left: 3px solid #ef4444`

**Footer:**
- `"N promemoria attivi · N completati oggi"`
- Link `"Gestisci tutti i promemoria →"` (→ `/customers` con filtro promemoria attivi per ora)

### 9.3 Mobile

```css
.mobile-wrap .rem-actions {
  flex-direction: row;
  width: 100%;
}
.mobile-wrap .r-btn {
  flex: 1;
  text-align: center;
}
```

**Azioni in riga orizzontale** (NON colonna verticale), larghezza equa tra i 3 bottoni.

Header semplificato: "Promemoria" (più corto), sottotitolo compatto "4 apr 2026 · 5 da gestire".

### 9.4 Data source

`GET /api/reminders/today` → `overdue[]` + `today[]`. Widget mostra prima overdue (ordinati per `due_at DESC`, più vecchi prima), poi today (ordinati per priorità: `urgent` → `normal` → `low`).

---

## 10. Componenti Frontend da creare / modificare

| Componente | Azione | Note |
|---|---|---|
| `CustomerProfilePage.tsx` | Modifica | Hero redesign completo (avatar, completeness CSS, quick stats, 7 quick actions, sezioni scrollabili), edit mode inline, progress bar, Note interne |
| `PhotoCropModal.tsx` | Modifica | Restore completo crop/scale/rotate — cerchio trascinabile, pinch-to-zoom touch |
| `CustomerRemindersSection.tsx` | Nuovo | Sezione Promemoria: lista con filtri tab, form inline, azioni |
| `ReminderForm.tsx` | Nuovo | Form aggiungi/modifica reminder con tutti i campi del mockup |
| `RemindersWidgetNew.tsx` | Nuovo | Widget Dashboard — today + overdue, desktop + mobile |
| `CustomerList.tsx` | Modifica | Autocomplete fix (`autoComplete + autoCorrect + spellCheck`), FAB "+ Nuovo Cliente" |
| `Dashboard.tsx` | Modifica | Inserisci `RemindersWidgetNew` in posizione #2 |

---

## 11. Modifiche Backend

| File | Azione | Note |
|---|---|---|
| `archibald-bot.ts` | Modifica | `navigateToEditCustomerById`, `updateCustomerSurgical`; fix bug 1-5 |
| `update-customer.ts` | Modifica | Progress milestones, `updateCustomerSurgical`, snapshot post-update, `agentNotes` DB-only |
| `customer-interactive.ts` | Verifica | Confermare che `start-edit` gestisca Track B (vatNumber nel body) |
| `customer-reminders.ts` | Nuovo | Repository CRUD + `getRemindersOverdueOrToday` + auto-ricorrenza |
| `reminders.ts` (routes) | Nuovo | Routes REST: today, CRUD per cliente, PATCH (snooze/done/edit), DELETE |
| `sync-scheduler.ts` | Modifica | Job giornaliero `checkCustomerReminders` alle 08:00 per ogni agente attivo |
| `migrations/045-customer-reminders.sql` | Nuovo | Tabella `agents.customer_reminders` + indici |

---

## 12. Test Coverage

### Unit test

- `computeNextDueAt(completedAt, recurrenceDays)` — tutti i casi, edge: `recurrenceDays = null`
- `buildCustomerDiff(original, edited)` — diff vuoto, singolo, multiplo
- `isReminderEffectivelyActive(reminder)` — tutti gli stati, snooze scaduto vs attivo
- `diffSnapshot(snapshot, formData)` — normalizzazione, casi speciali

### Integration test

- `POST /api/customers/:customerProfile/reminders` → crea, verifica DB
- `PATCH /api/reminders/:id` con `status: 'snoozed'` → non appare in `getRemindersOverdueOrToday`
- `PATCH /api/reminders/:id` con `status: 'done'` + `recurrence_days: 7` → genera prossimo reminder
- `GET /api/reminders/today` → risposta include solo status active non snoozed
- `POST /api/operations` (update-customer) con diff vuoto → no job enqueued

### E2E (su ERP reale, post-deploy)

- Track A (IVA validata): modifica nome → save → VATNUM non ri-scritto, ERP + DB corretti
- Track B (IVA mancante): "Valida ora →" → autofill → save → ERP + DB corretti
- Modifica indirizzi: aggiungi + elimina → save → `writeAltAddresses` corretto in ERP
- Reminder: crea → snooze → completa con nota → verifica ricorrenza auto

---

## 13. Invarianti del Design (vincolanti)

1. **Bot non cerca per nome**: sempre navigazione diretta per `erpId`. Codice di ricerca per nome eliminato.
2. **VATNUM mai ri-scritto se già validato**: nessuna eccezione.
3. **Diff-based**: il bot non tocca campi non presenti nel diff.
4. **Snapshot garantito**: ogni update bot termina con `buildCustomerSnapshot()` + persist in DB.
5. **`agentNotes` mai inviato all'ERP**: solo DB.
6. **No `window.confirm`**: sempre inline confirm state o styled modal.
7. **Backdrop click non chiude edit mode**.
8. **Mobile actions widget in riga** (`flex-direction: row`), non colonna.
9. **Responsive**: comportamento esplicito per `< 640px`, `641–1024px`, `> 1024px`.
10. **Dati reali nei mockup companion**: i file HTML in `.superpowers/brainstorm/92051-1775263372/content/` sono la spec visiva vincolante. L'implementazione deve riprodurli identicamente.

---

## 14. File Mockup Companion (riferimento visivo vincolante)

Tutti i file sono in `.superpowers/brainstorm/92051-1775263372/content/`:

| File | Contenuto | Sezioni spec |
|---|---|---|
| `update-save-flow.html` | 3 opzioni save UX — **opzione B approvata** | §3 |
| `vat-status-edit.html` | 3 opzioni VAT in edit mode — **opzione A approvata** | §3.2 |
| `addresses-crud.html` | 3 opzioni CRUD indirizzi — **opzione A approvata** | §6 |
| `design-frontend-ux.html` | Design completo edit mode: VAT mancante vs validato + saving | §3 |
| `profile-redesign.html` | CustomerProfilePage — mobile + desktop + annotazioni | §2 |
| `customer-reminder.html` | 3 opzioni placement reminder (A+C fusion approvata) | §8 |
| `reminder-system.html` | Sistema reminder: lista + form + schema DB + comportamenti | §7, §8 |
| `dashboard-reminders-widget.html` | RemindersWidgetNew — desktop + mobile | §9 |

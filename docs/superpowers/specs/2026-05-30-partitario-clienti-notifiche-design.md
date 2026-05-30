# Partitario Clienti + Sistema Notifiche Economiche
**Design spec — 30 maggio 2026**
**Stato: APPROVATO — pronto per pianificazione**

---

## Indice

1. [Panoramica e scopo](#1-panoramica-e-scopo)
2. [Architettura di sistema](#2-architettura-di-sistema)
3. [Modello dati (DB)](#3-modello-dati-db)
4. [Partitario UI](#4-partitario-ui)
5. [Notification Settings UI](#5-notification-settings-ui)
6. [Template messaggi + PWA/Agenda](#6-template-messaggi--pwaagenda)
7. [Sync contatti bidirezionale](#7-sync-contatti-bidirezionale)
8. [Profilo agente per notifiche](#8-profilo-agente-per-notifiche)
9. [Mockup di riferimento (binding)](#9-mockup-di-riferimento-binding)
10. [Decisioni locked](#10-decisioni-locked)
11. [Gap e vincoli operativi](#11-gap-e-vincoli-operativi)

---

## 1. Panoramica e scopo

### Problema

L'agente commerciale Komet Dental deve rispondere in tempo reale a domande dei clienti su:
- "Quanto devo ancora saldare a Komet?"
- "Ho qualche fattura scaduta?"
- "Puoi mandarmi le ultime fatture da saldare?"
- "Mi sembra di aver saldato tutto — verifica"

Oggi l'agente deve accedere all'ERP manualmente, che è lento e non mobile-friendly. Inoltre non esiste nessun sistema automatico che avvisi i clienti delle scadenze o gestisca i solleciti.

### Soluzione

Due sottosistemi integrati:

1. **Partitario Clienti** — vista lettura della situazione finanziaria per-cliente, aggregata dai dati ERP già sincronizzati in DB. Tre punti di accesso: tab nella CustomerProfilePage, badge nella lista clienti, widget nella Dashboard.

2. **Sistema Notifiche Economiche** — notification-service autonomo che invia email automatiche e prepara messaggi WhatsApp semi-automatici per: nuove fatture, pre-scadenza, escalation scaduto (profilo configurabile per-cliente), estratto conto periodico. Integrato con Agenda PWA e push notifications.

### Perimetro ERP

Questo sistema usa **esclusivamente dati ERP** (`order_invoices`, `order_records`, `customers`). La contabilità Arca (specifica per utente Formicola Biagio) è fuori perimetro e affrontata separatamente.

### Verifica dati produzione (30/05/2026)

- **`order_invoices`**: 397 record · `due_date`, `remaining_amount`, `settled_amount`, `days_past_due`: 100% popolati · `invoice_closed`: 43% (mai TRUE — usare `remaining_amount = '0'` come indicatore di pagamento)
- **Fatture aperte reali**: 170 record con `invoice_closed = false`, `remaining_amount > 0` — dati accurati
- **Clienti con email**: 128/1348 (9.5%) · **con mobile**: 34/1348 (2.5%)
- **`update-customer` bot**: già scrive `email`, `mobile`, `phone` nell'ERP via `xaf_dviEMAIL_Edit_I` e `xaf_dviCELLULARPHONE_Edit_I`

---

## 2. Architettura di sistema

### Container Docker (5 totali)

| Container | Tipo | Ruolo |
|---|---|---|
| `frontend` | esistente | React 19 PWA — nuove pagine partitario, widget dashboard, badge lista |
| `backend` | esistente | Express + TypeScript — nuove route `/api/ledger`, `/api/notification-settings`, `/api/pending-whatsapp`, `/api/notification-profile` |
| `postgres` | condiviso | Fonte di verità — +7 nuove tabelle (5 notifiche + 2 sync) |
| `redis` | esistente | Invariato |
| `notification-service` | **NUOVO** | Node 20 + TypeScript standalone — polling tick ogni ora, nodemailer SMTP, scrittura pending WA in DB |

### Flusso dati notifiche (6 step)

```
1. ERP sync → backend scrapa fattura → upsert order_invoices
   (invoice_remaining_amount, invoice_due_date, invoice_days_past_due aggiornati)

2. notification-service tick (ogni ora):
   - legge fatture aperte con notifiche abilitate
   - confronta con invoice_notification_log per dedup
   - determina cliente/step che necessitano del prossimo invio

3. Gate sync-freshness:
   se sync_freshness.last_completed_at['sync-invoices'] > 6h → SKIP
   (evita contattare clienti che hanno già pagato con dati obsoleti)

4a. EMAIL: nodemailer invia
    FROM: noreply@formicanera.com
    Reply-To: users.notification_reply_to_email ({{agente_email}})
    Sender-Name: {{agente_nome}} | Komet Dental
    → scrive record in invoice_notification_log

4b. WHATSAPP: scrive record in invoice_notification_pending_wa
    stato: pending → il messaggio appare nella PWA come azione da completare

5. Auto-stop: ogni tick controlla invoice_remaining_amount = '0'
   → cancella step pending per quella fattura
   → scrive event_type = 'auto_cancelled_paid' nel log
   → crea nota in agents.appointments

6. Agenda integration: ogni invio confermato
   → INSERT in agents.appointments (source = 'notification_service')
```

### Email tecnica (sender identity)

- **FROM**: `noreply@formicanera.com` (SMTP esistente configurato in `config.ts`)
- **Reply-To**: `users.notification_reply_to_email` — campo validato nel profilo agente
- **Display name**: `{{agente_nome}} | Komet Dental`
- Nessuna configurazione SMTP per-agente richiesta

---

## 3. Modello dati (DB)

### Nuove migrazioni (8 totali)

#### 093 — customers_blocked_status

```sql
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS blocked_status TEXT;
  -- NULL = libero | 'Completo' = bloccato tutto | 'Fattura' = solo fatturazione

CREATE INDEX idx_customers_blocked
  ON agents.customers (user_id, blocked_status)
  WHERE blocked_status IS NOT NULL;
```

Sincronizzato da ERP: campo "BLOCCATO" nel tab Principale del CUSTTABLE DetailView.

#### 094 — customers_contact_write_pending

```sql
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS contact_write_pending_at TIMESTAMPTZ;
  -- NULL = confermato ERP | timestamp = in attesa write-back
  -- Invariante: down-sync salta email/mobile/phone se pending_at IS NOT NULL
```

#### 095 — users_notification_profile

```sql
ALTER TABLE agents.users
  ADD COLUMN notification_display_name TEXT,
  ADD COLUMN notification_reply_to_email TEXT,  -- validata, obbligatoria per invio
  ADD COLUMN notification_phone TEXT,
  ADD COLUMN notification_title TEXT;
```

#### 096 — notification_profiles

```sql
CREATE TABLE agents.notification_profiles (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT,  -- NULL = globale (pre-built), NOT NULL = custom agente
  name        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  steps       JSONB NOT NULL,
  -- steps: [{days_after_due: int, tone: 'cordiale'|'formale'|'urgente',
  --          channels: ['email'|'whatsapp']}]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed profili default
INSERT INTO agents.notification_profiles (user_id, name, is_default, steps) VALUES
(NULL, 'Gentile', true, '[
  {"days_after_due": 15, "tone": "cordiale",  "channels": ["email","whatsapp"]},
  {"days_after_due": 45, "tone": "formale",   "channels": ["email","whatsapp"]},
  {"days_after_due": 90, "tone": "urgente",   "channels": ["email"]}
]'),
(NULL, 'Standard', false, '[
  {"days_after_due": 1,  "tone": "cordiale",  "channels": ["email","whatsapp"]},
  {"days_after_due": 7,  "tone": "formale",   "channels": ["email","whatsapp"]},
  {"days_after_due": 20, "tone": "formale",   "channels": ["email"]},
  {"days_after_due": 30, "tone": "urgente",   "channels": ["email"]}
]'),
(NULL, 'Aggressivo', false, '[
  {"days_after_due": 0,  "tone": "cordiale",  "channels": ["whatsapp"]},
  {"days_after_due": 3,  "tone": "formale",   "channels": ["email","whatsapp"]},
  {"days_after_due": 7,  "tone": "urgente",   "channels": ["email","whatsapp"]},
  {"days_after_due": 15, "tone": "urgente",   "channels": ["email"]}
]');
```

#### 097 — invoice_notification_settings

```sql
CREATE TABLE agents.invoice_notification_settings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  customer_erp_id        TEXT NOT NULL,
  enabled                BOOLEAN NOT NULL DEFAULT false,
  profile_id             INTEGER REFERENCES agents.notification_profiles(id),
  override_steps         JSONB,        -- NULL = usa profilo; NOT NULL = passi custom
  email_override         TEXT,         -- NULL = usa customers.email (COALESCE)
  whatsapp_override      TEXT,         -- NULL = usa customers.mobile (COALESCE)
  notify_new_invoice     BOOLEAN NOT NULL DEFAULT true,
  notify_pre_due         BOOLEAN NOT NULL DEFAULT true,
  pre_due_days           INTEGER NOT NULL DEFAULT 7,
  periodic_statement_enabled BOOLEAN NOT NULL DEFAULT false,
  periodic_statement_days    INTEGER NOT NULL DEFAULT 30,
  periodic_statement_content JSONB,
  -- {"open_invoices": true, "total_due": true, "credit_notes": true, "history": false}
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, customer_erp_id)
);
```

**COALESCE resolution (query effettiva):**
```sql
COALESCE(ns.email_override, c.email)    AS effective_email
COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp
```

#### 098 — invoice_notification_log

```sql
CREATE TABLE agents.invoice_notification_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  customer_erp_id   TEXT NOT NULL,
  invoice_number    TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  -- 'new_invoice' | 'pre_due' | 'overdue_step'
  -- | 'auto_cancelled_paid' | 'wa_confirmed_sent' | 'wa_dismissed'
  -- NON include 'periodic_statement' — vedi notification_periodic_log
  channel           TEXT NOT NULL,  -- 'email' | 'whatsapp'
  step_index        INTEGER NOT NULL,
  -- sentinel: -1=new_invoice, -2=pre_due, >=0=overdue step dell'invoice specifica
  -- Ogni invoice è loggata al SUO step_index (non al tono del messaggio consolidato)
  -- Es: invio con A@step0 + B@step1 → log A con step_index=0, B con step_index=1
  tone              TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_past_due     INTEGER,
  message_preview   TEXT,
  UNIQUE (user_id, invoice_number, step_index, channel)
  -- step_index è NOT NULL → UNIQUE funziona correttamente (no problema NULL SQL)
);
```

#### 099 — invoice_notification_pending_wa

```sql
CREATE TABLE agents.invoice_notification_pending_wa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  customer_erp_id TEXT NOT NULL,
  phone_to        TEXT NOT NULL,
  message_text    TEXT NOT NULL,
  tone            TEXT NOT NULL,
  step_index      INTEGER,
  invoice_numbers TEXT[] NOT NULL,    -- fatture incluse nel messaggio consolidato
  total_amount    NUMERIC,
  status          TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'opened_by_agent' | 'confirmed_sent' | 'dismissed'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  dismissed_at    TIMESTAMPTZ
);

CREATE INDEX idx_pending_wa_user_status
  ON agents.invoice_notification_pending_wa (user_id, status)
  WHERE status IN ('pending', 'opened_by_agent');
```

#### 100 — notification_periodic_log

Il periodic statement è **per-cliente**, non per-fattura. Grana separata rispetto a `invoice_notification_log`.

```sql
CREATE TABLE agents.notification_periodic_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  customer_erp_id TEXT NOT NULL,
  channel         TEXT NOT NULL,  -- 'email'
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_bucket   DATE NOT NULL,
  -- = DATE_TRUNC('month', sent_at)::date oppure data invio
  -- Dedup: non inviare più di una volta per (user, customer, period_bucket)
  message_preview TEXT,
  UNIQUE (user_id, customer_erp_id, period_bucket, channel)
  -- Previene invii multipli nello stesso periodo per lo stesso cliente
);
```

#### 101 — notification_message_templates

```sql
CREATE TABLE agents.notification_message_templates (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT,           -- NULL = sistema; NOT NULL = override agente
  event_type    TEXT NOT NULL,  -- 'new_invoice' | 'pre_due' | 'overdue' | 'periodic'
  tone          TEXT NOT NULL,  -- 'cordiale' | 'formale' | 'urgente'
  channel       TEXT NOT NULL,  -- 'email' | 'whatsapp'
  subject_tmpl  TEXT,           -- solo email
  body_tmpl     TEXT NOT NULL,
  UNIQUE (user_id, event_type, tone, channel)
);
```

**Variabili template disponibili:**
```
{{cliente_nome}}         agents.customers.name
{{lista_fatture}}        tabella/lista fatture rilevanti (HTML per email, plain text per WA)
{{n_fatture}}            count fatture nel messaggio
{{totale_scaduto}}       sum remaining_amount scadute
{{totale_da_saldare}}    sum remaining_amount tutte aperte
{{scadenza_min}}         data scadenza più vicina
{{agente_nome}}          users.notification_display_name
{{agente_email}}         users.notification_reply_to_email
{{agente_telefono}}      users.notification_phone
{{agente_titolo}}        users.notification_title
```

---

## 4. Partitario UI

### Punti di accesso (tutti e tre — approvati)

| Punto | Dove | Cosa mostra |
|---|---|---|
| Tab `💰 Partitario` | CustomerProfilePage | Partitario completo per singolo cliente |
| Badge + filtro | CustomerList | Badge "€X scaduto" e 💀 blocco sull'avatar + filtri rapidi |
| Widget Dashboard | Dashboard.tsx | Esposizione aggregata, clienti bloccati, WA pending |

### Semantica KPI (LOCKED — non alterare in implementazione)

| KPI | Definizione | Query |
|---|---|---|
| **Da saldare (lordo)** | Somma `remaining_amount` su fatture positive aperte | `SUM(remaining_amount) WHERE remaining_amount NOT IN ('0','') AND CAST(invoice_amount AS NUMERIC) > 0` |
| **Scaduto** | Somma `remaining_amount` dove `due_date < oggi` | + filtro `due_date::date < CURRENT_DATE` |
| **Incassato (aperte)** | Somma `settled_amount` su fatture ancora aperte | `SUM(settled_amount) WHERE remaining_amount NOT IN ('0','')` |
| **Note di credito aperte** | Somma `ABS(remaining_amount)` su fatture NC | `WHERE CAST(invoice_amount AS NUMERIC) < 0 AND remaining_amount NOT IN ('0','')` |

**Predicato fattura aperta (LOCKED — D6):** `remaining_amount NOT IN ('0', '')` — NON `invoice_closed = false`.
Verificato su produzione 30/05/2026: 0 fatture con `closed IS NULL AND remaining > 0` — i 227 closed=NULL sono tutti saldati. Il predicato `remaining_amount` è comunque preferito perché D6 certifica che `invoice_closed` non è affidabile (mai TRUE).

Le NC **non** vengono sottratte automaticamente da "Da saldare". Una riga "Esposizione netta indicativa" mostra il calcolo ma non lo impone.

### Fattura "pagata" — indicatore corretto

```
remaining_amount = '0'   →  pagata
invoice_closed = true    →  NON usare (mai TRUE in produzione)
invoice_closed = false   →  aperta (170 record)
invoice_closed = NULL    →  pagata (227 record storici)
```

### Badge cliente bloccato

Fonte: `customers.blocked_status` (sincronizzato dall'ERP).

| Valore ERP | `blocked_status` DB | Display |
|---|---|---|
| vuoto/NULL | NULL | nessun badge |
| "Completo" | `'Completo'` | 💀 BLOCCATO (rosso) |
| "Fattura" | `'Fattura'` | ⚠ Limitato (arancio) |

**Order card bloccata**: banner rosso con "💀 CLIENTE BLOCCATO — Ordine in attesa" + link "Vedi partitario →" + button "💬 WA".

### Mockup binding

Riferimento: `notification-settings-ui-v3.html` (profili), `partitario-ui-v2.html` (partitario), `section4-templates-pwa.html` (template).

---

## 5. Notification Settings UI

### Tab `🔔 Notifiche` nella CustomerProfilePage

Tre stati:

**1. Disabilitato / contatti mancanti** — toggle OFF + warning + CTA "Aggiungi email / WhatsApp"

**2. Profilo rapido attivo** — toggle ON + pill profilo selezionato + riepilogo trigger con canali + estratto conto + gate sync-freshness visibile + invii recenti

**3. Modalità Personalizzato** — configurazione avanzata per-trigger con step editor, preview messaggio consolidato, estratto conto config

### Profili di default (seed in migration 096)

| Profilo | Default | Step escalation |
|---|---|---|
| 🌿 **Gentile** | ✅ sì | +15gg Cordiale · +45gg Formale · +90gg Urgente |
| ⚡ **Standard** | no | +1gg · +7gg · +20gg · +30gg |
| 🔥 **Aggressivo** | no | Stesso giorno · +3gg · +7gg · +15gg |

Pre-scadenza: tutti i profili avvisano 7 giorni prima (configurabile). Nuova fattura: tutti i profili inviano email automatica al rilevamento.

### Granularità messaggi (LOCKED)

**Un solo messaggio consolidato per cliente per tick**, anche se N fatture hanno superato una soglia.

- Il tono usato è quello del livello più severo tra le fatture presenti
- `invoice_notification_log` registra per-fattura per dedup/audit
- Il messaggio usa `{{lista_fatture}}` (tabella/lista) non `{{fattura_numero}}` singolo

### Estratto conto periodico

Trigger separato, configurabile per-cliente:
- Intervallo: ogni N giorni (default 30)
- Contenuto selezionabile: fatture aperte + importi, totale da saldare + scaduto, NC disponibili, storico 3 mesi (opzionale)
- Canale: email automatica

### Gate sync-freshness (anti-spam su dati obsoleti)

```
IF sync_freshness.last_completed_at['sync-invoices'] IS NULL
   OR NOW() - last_completed_at > INTERVAL '6 hours'
THEN skip_all_sends = true  -- log 'skipped_stale_data'
```

---

## 6. Template messaggi + PWA/Agenda

### Struttura email (HTML)

- **FROM**: `noreply@formicanera.com`
- **Reply-To**: `{{agente_email}}`
- **Subject (Cordiale)**: "Promemoria pagamento — {{n_fatture}} fatture · €{{totale_scaduto}}"
- **Subject (Formale)**: "Sollecito pagamento — {{n_fatture}} fatture · €{{totale_scaduto}}"
- **Subject (Urgente)**: "⚠ Sollecito urgente — {{n_fatture}} fatture insolute · €{{totale_scaduto}} · oltre 90 giorni"
- **Body**: tabella fatture (numero · importo · scaduta il · giorni) + totale + IBAN + firma agente
- **Footer**: "Inviato automaticamente da Formicanera.com per conto di {{agente_nome}}"

### Struttura WA (plain text)

```
Gentile {{cliente_nome}},

[corpo tono-dipendente]

{{lista_fatture}}  ← formato:
📄 CF1/26000175 — €1.092,51 (+90gg)
📄 CF1/26001415 — €2.185,06 (+59gg)

💰 Totale: *€{{totale_scaduto}}*

{{firma_wa}}
```

### Stati WhatsApp (LOCKED)

```
pending → opened_by_agent → confirmed_sent
                          → dismissed
```

- `confirmed_sent`: crea nota agenda + chiude timer se relevant
- `dismissed`: log evento, step non ri-attiva, nessuna nota agenda
- `wa.me/?text=<encoded>` con testo pre-compilato modificabile dall'agente prima dell'invio

### Timer pagamento (per-fattura, non per-cliente)

Ogni fattura ha il proprio timer:
- Start: primo invio sollecito su quella fattura
- Stop: `invoice_remaining_amount = '0'` rilevato dal sync-invoices
- Metrica: "giorni dal primo sollecito a remaining = 0"
- Agenda: nota auto-generata a start e a stop ("pagamento rilevato · 12 giorni")

### Agenda integration

Ogni invio (email o WA confirmed_sent) genera:
```sql
INSERT INTO agents.appointments (
  user_id, customer_erp_id, source, title, body, created_at
) VALUES (
  $userId, $customerErpId, 'notification_service',
  'Notifica economica — {{tono}} inviata',
  '{{lista_fatture}} · Totale: €{{totale}} · Canale: {{channel}}',
  NOW()
)
```

### PWA push notification

Aggregata giornaliera (non per-cliente):
- Clienti bloccati + fatture urgenti del giorno
- Badge "N messaggi WA pronti" sulla home

---

## 7. Sync contatti bidirezionale

### Single source of truth

`agents.customers.email` e `agents.customers.mobile` sono la fonte unica.

`invoice_notification_settings` ha solo campi override:
```sql
email_override    TEXT  -- NULL = usa customers.email
whatsapp_override TEXT  -- NULL = usa customers.mobile
```

Query effettiva sempre:
```sql
COALESCE(ns.email_override, c.email)     AS effective_email
COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp
```

### Flusso bidirezionale

**A → B (CustomerProfilePage → ERP):**
1. Agente modifica email/mobile in CustomerProfilePage
2. Update `customers.email/mobile` + set `contact_write_pending_at = NOW()`
3. Accoda operazione `update-customer` (handler già esistente, già scrive email/mobile/phone nell'ERP)
4. Bot esegue → ERP aggiornato → `contact_write_pending_at = NULL`

**B → A (Tab Notifiche → ERP):**
1. Agente configura email_override/whatsapp_override nel tab Notifiche
2. Aggiorna ANCHE `customers.email/mobile` (non solo l'override)
3. Stessa pipeline: `contact_write_pending_at = NOW()` → accoda `update-customer`

### Protezione anti-clobber (LOCKED)

**Invariante**: se `contact_write_pending_at IS NOT NULL`, il `sync-customers` down-sync NON sovrascrive `email`, `mobile`, `phone` per quel cliente.

Implementazione nel `sync-customers` handler:
```typescript
if (customer.contact_write_pending_at !== null) {
  // skip email/mobile/phone — pending write-back to ERP
  delete erpData.email;
  delete erpData.mobile;
  delete erpData.phone;
}
```

Timeout: se `contact_write_pending_at > 24h` → alert agente + retry manuale.

### UI stato contatto

| Stato | `contact_write_pending_at` | Badge campo |
|---|---|---|
| Confermato ERP | NULL | 🟢 "Sincronizzato ERP" |
| In attesa | timestamp | 🟡 "In attesa sync ERP..." |
| Fallito (>24h) | > NOW() - 24h | 🔴 "Sync fallita — riprova" |

### Sync email dall'ERP

Il `sync-customers` handler deve leggere anche `E-MAIL` e `CELLULARPHONE` dalla CUSTTABLE ListView (già presenti nel DOM) e popolare `customers.email` / `customers.mobile` — solo se `contact_write_pending_at IS NULL`.

---

## 8. Profilo agente per notifiche

### Campi (migration 095)

| Campo DB | Variabile template | Obbligatorio | Note |
|---|---|---|---|
| `notification_display_name` | `{{agente_nome}}` | no (fallback: users.username) | Nome visualizzato in email/WA |
| `notification_reply_to_email` | `{{agente_email}}` | **SÌ** | Indirizzo Reply-To email clienti · validato formato email |
| `notification_phone` | `{{agente_telefono}}` | no | In firma email + WA |
| `notification_title` | `{{agente_titolo}}` | no | Seconda riga firma |

### Guard di invio

```typescript
function canSendNotifications(user: AgentUser): boolean {
  return !!(
    user.notification_reply_to_email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.notification_reply_to_email)
  );
}
// false → blocca TUTTI gli invii email automatici
// WA semi-automatico: non bloccato (il FROM è il telefono dell'agente)
```

### UI

Tab "📬 Profilo notifiche" nella ProfilePage esistente. Se profilo incompleto:
- Banner rosso "Notifiche bloccate — configura email di risposta"
- Il tab 🔔 Notifiche per i clienti mostra lo stesso warning

### Nota `{{agente_email}}`

L'email di login ERP (`ikiA0930`) NON è un indirizzo email. `notification_reply_to_email` è un campo separato che l'agente deve configurare esplicitamente. Non derivare mai dall'username ERP.

---

## 9. Mockup di riferimento (binding)

I seguenti file HTML nel progetto sono il contratto 1:1 per l'implementazione. Il codice DEVE rispettarli pixel-per-pixel.

| File | Sezione | Contenuto |
|---|---|---|
| `.superpowers/brainstorm/.../architecture.html` | §2 | Architettura container + flusso dati |
| `.superpowers/brainstorm/.../partitario-ui-v2.html` | §4 | Tab Partitario (Fresis), lista clienti badge, widget dashboard |
| `.superpowers/brainstorm/.../notification-settings-ui-v3.html` | §5 | Profilo Gentile v3, modalità Personalizzato, stato disabilitato |
| `.superpowers/brainstorm/.../section4-templates-pwa.html` | §6 | Email Urgente Maco, WA stati, Agenda, Push, contatti 9.5% |
| `.superpowers/brainstorm/.../section5-6-contacts-profile.html` | §7+8 | Sync bidirezionale, profilo agente completo/incompleto |

---

## 10. Decisioni locked

Le seguenti decisioni sono state esplicitamente prese durante il brainstorming e NON possono essere alterate senza una nuova sessione di design con approvazione.

| # | Decisione | Rationale |
|---|---|---|
| D1 | Notification-service = container Docker separato | Isolamento: crash non tocca ERP sync |
| D2 | Email FROM sistema + Reply-To agente | Zero config SMTP per-agente, cliente risponde direttamente |
| D3 | WhatsApp = semi-automatico (wa.me) | No provider API, zero costi, agente mantiene controllo |
| D4 | Granularità: 1 messaggio per cliente per tick | Evita email flooding su clienti con N fatture aperte |
| D5 | Tono del messaggio = più severo tra le fatture presenti | Regola unica, implementabile in una query SQL |
| D6 | Auto-stop escalation = `remaining_amount = '0'` | `invoice_closed` non è mai TRUE in produzione |
| D7 | Single source contatti = `customers.email/mobile` | Evita drift tra CustomerProfilePage e tab Notifiche |
| D8 | Override notifiche = COALESCE, non colonne duplicate | Un'unica fonte di verità con override opzionale |
| D9 | Anti-clobber via `contact_write_pending_at` | Stessa shape delle pending orders — pattern consolidato |
| D10 | `{{agente_email}}` = `notification_reply_to_email` separato | Login ERP (ikiA0930) non è email — campo esplicitamente validato |
| D11 | Profilo Gentile default: +15/+45/+90 giorni | Rimosso +3gg (troppo aggressivo per profilo "gentile") |
| D12 | Timer pagamento = per-fattura | Per-cliente è ambiguo con pagamenti parziali |
| D13 | WA stati: pending→opened→confirmed/dismissed | dismissed blocca re-invio dello step, confirmed genera nota agenda |

---

## 11. Gap e vincoli operativi

### Contatti clienti (9.5% email, 2.5% mobile)

- **Breve termine**: agente configura manualmente email/mobile per clienti prioritari (con scaduti)
- **Medio termine**: `sync-customers` legge `E-MAIL` e `CELLULARPHONE` dalla ListView ERP
- **UI helper**: filtro "Clienti senza email" nella lista clienti per completamento bulk

### Sincronizzazione email dall'ERP

Il `sync-customers` handler deve essere esteso per leggere i campi email e mobile durante il scraping della CUSTTABLE ListView. Questi campi sono già presenti nell'autopsia ERP ma non erano prioritari in precedenza.

### Soglia "cliente bloccato" per ordini

Il banner 💀 sull'order card si attiva quando `customers.blocked_status IS NOT NULL`. Non esiste una soglia automatica basata sul saldo — è il flag ERP che comanda (DOGMA: ERP è fonte di verità).

### Relay VPN e write-back contatti

Le operazioni `update-customer` passano attraverso il relay Mac → ERP. Se la VPN è down (`sync_paused_users`), il write-back dei contatti è bloccato e `contact_write_pending_at` rimane settato. Il circuit breaker esistente gestisce i retry.

### Consiglio legale (flag informativo)

L'invio automatico di solleciti formali (tono "Urgente", "messa in mora") da parte di un agente commerciale potrebbe richiedere verifica dei termini contrattuali Komet. Questo non blocca l'implementazione tecnica ma va segnalato a Francesco per valutazione business prima del go-live.

---

*Spec generata: 30 maggio 2026*
*Progetto: Formicanera — Archibald PWA*
*Versione: 1.0 — APPROVATA*

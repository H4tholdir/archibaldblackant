# Reminders Redesign — Design Spec
**Data**: 2026-04-26  
**Stato**: Approvato

---

## Obiettivo

Tre miglioramenti al sistema promemoria esistente:

1. **Tipi di contatto dinamici** — CRUD completo (add/rename/delete) invece di enum hardcoded
2. **Data odierna** — permettere promemoria per oggi (chip "Oggi" + default a oggi)
3. **Vista agenda** — widget dashboard con strip settimanale + nuova pagina `/agenda` con mini-calendario

---

## Decisioni di Design

| Decisione | Scelta |
|---|---|
| Widget dashboard | Strip settimanale (7 chip giorno con dot colorati) |
| Pagina agenda | Mini-cal mensile + KPI box + lista cronologica scorrevole |
| Accesso gestione tipi | Icona ⚙ nel form accanto al select → panel inline |
| Tipi sistema | Eliminabili come tutti gli altri (soft-delete) |
| Navigazione agenda | Voce navbar "📅 Agenda" + widget header clickable |

---

## 1. DB — Migration 071

### Nuova tabella `agents.reminder_types`

```sql
CREATE TABLE agents.reminder_types (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '📋',
  color_bg   TEXT NOT NULL DEFAULT '#f1f5f9',
  color_text TEXT NOT NULL DEFAULT '#64748b',
  sort_order INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_reminder_types_user ON agents.reminder_types(user_id) WHERE deleted_at IS NULL;
```

### Seed tipi di default per ogni utente esistente

```sql
INSERT INTO agents.reminder_types (user_id, label, emoji, color_bg, color_text, sort_order)
SELECT u.id, t.label, t.emoji, t.color_bg, t.color_text, t.sort_order
FROM agents.users u
CROSS JOIN (VALUES
  ('Ricontatto commerciale', '📞', '#fee2e2', '#dc2626', 1),
  ('Follow-up offerta',      '🔥', '#fef9c3', '#92400e', 2),
  ('Pagamento',              '💰', '#f0fdf4', '#15803d', 3),
  ('Rinnovo contratto',      '🔄', '#eff6ff', '#1d4ed8', 4),
  ('Ricorrenza',             '🎂', '#fdf4ff', '#7e22ce', 5),
  ('Personalizzato',         '📋', '#f1f5f9', '#64748b', 6)
) AS t(label, emoji, color_bg, color_text, sort_order);
```

### Modifica `agents.customer_reminders`

```sql
-- Aggiunge colonna FK
ALTER TABLE agents.customer_reminders
  ADD COLUMN type_id INT REFERENCES agents.reminder_types(id);

-- Backfill: mappa i valori stringa esistenti al tipo corrispondente per utente
UPDATE agents.customer_reminders cr
SET type_id = rt.id
FROM agents.reminder_types rt
WHERE rt.user_id = cr.user_id
  AND rt.deleted_at IS NULL
  AND (
    (cr.type = 'commercial_contact' AND rt.emoji = '📞') OR
    (cr.type = 'offer_followup'     AND rt.emoji = '🔥') OR
    (cr.type = 'payment'            AND rt.emoji = '💰') OR
    (cr.type = 'contract_renewal'   AND rt.emoji = '🔄') OR
    (cr.type = 'anniversary'        AND rt.emoji = '🎂') OR
    (cr.type = 'custom'             AND rt.emoji = '📋')
  );

-- Rendi NOT NULL dopo backfill
ALTER TABLE agents.customer_reminders ALTER COLUMN type_id SET NOT NULL;

-- Rimuovi vecchia colonna type (con CHECK constraint)
ALTER TABLE agents.customer_reminders DROP COLUMN type;
```

**Regola soft-delete tipi**: quando `deleted_at IS NOT NULL`, il tipo scompare dai form di creazione/modifica. I promemoria esistenti con quel `type_id` continuano a mostrare label/emoji/colori del tipo (JOIN sempre su tutti i tipi inclusi soft-deleted). Il frontend mostra badge grigio "Tipo eliminato" se `deleted_at IS NOT NULL`.

---

## 2. Backend

### Repository `customer-reminders.ts`

Tutte le query che restituiscono reminder aggiungono JOIN su `reminder_types`:

```sql
SELECT cr.*, rt.label AS type_label, rt.emoji AS type_emoji,
       rt.color_bg AS type_color_bg, rt.color_text AS type_color_text,
       rt.deleted_at AS type_deleted_at
FROM agents.customer_reminders cr
JOIN agents.reminder_types rt ON rt.id = cr.type_id
WHERE cr.user_id = $1 ...
```

Il tipo `Reminder` aggiunge i campi derivati: `typeLabel`, `typeEmoji`, `typeColorBg`, `typeColorText`, `typeDeletedAt`.

### Nuovo repository `reminder-types.ts`

```ts
listReminderTypes(pool: DbPool, userId: string): Promise<ReminderType[]>
createReminderType(pool: DbPool, userId: string, input: CreateReminderTypeInput): Promise<ReminderType>
updateReminderType(pool: DbPool, id: number, userId: string, input: UpdateReminderTypeInput): Promise<ReminderType>
deleteReminderType(pool: DbPool, id: number, userId: string): Promise<void>  // soft-delete
```

### Nuove route `/api/reminders/types`

```
GET    /api/reminders/types          → lista tipi utente (inclusi soft-deleted per backward compat)
POST   /api/reminders/types          → crea tipo
PATCH  /api/reminders/types/:id      → rinomina/recolora
DELETE /api/reminders/types/:id      → soft-delete (deleted_at = NOW())
```

Registrate **prima** delle route `/api/reminders/:id` per evitare conflitti di routing.

### `createReminder` / `patchReminder`

Input `type` diventa `type_id: number` invece di stringa enum. Il router valida che `type_id` appartenga all'utente corrente.

---

## 3. Frontend

### 3.1 `reminders.service.ts`

Rimozione di `REMINDER_TYPE_LABELS`, `REMINDER_TYPE_COLORS` come costanti statiche — rimangono solo come fallback per render di tipi orfani.

Aggiunta:

Il vecchio `ReminderType` (string union enum) viene rinominato `ReminderTypeKey` e mantenuto solo come fallback interno. Il nuovo tipo entità DB si chiama `ReminderTypeRecord`:

```ts
// Vecchio tipo string enum → rinominato, solo per fallback interni
export type ReminderTypeKey = 'commercial_contact' | 'offer_followup' | 'payment'
  | 'contract_renewal' | 'anniversary' | 'custom';

// Nuovo tipo entità DB
export type ReminderTypeRecord = {
  id: number;
  label: string;
  emoji: string;
  colorBg: string;
  colorText: string;
  sortOrder: number;
  deletedAt: string | null;
};

export async function listReminderTypes(): Promise<ReminderTypeRecord[]>
export async function createReminderType(input: CreateReminderTypeInput): Promise<ReminderTypeRecord>
export async function updateReminderType(id: number, input: UpdateReminderTypeInput): Promise<ReminderTypeRecord>
export async function deleteReminderType(id: number): Promise<void>
```

`computeDueDateFromChip` aggiunge `'Oggi': 0` nella mappa.

`Reminder` type: campi `type` (stringa) rimpiazzati da `typeId: number`, `typeLabel: string`, `typeEmoji: string`, `typeColorBg: string`, `typeColorText: string`, `typeDeletedAt: string | null`.

`CreateReminderInput`: campo `type: ReminderTypeKey` diventa `type_id: number`. `CustomerRemindersSection` passa `type_id` dal tipo selezionato nel form.

### 3.2 `ReminderForm.tsx`

- Carica i tipi via `listReminderTypes()` al mount (con `useEffect`)
- Mostra select popolato dinamicamente dai tipi attivi (`deletedAt === null`)
- Icona ⚙ accanto al select → toggle `showTypeManager` state
- Se reminder in edit ha `typeDeletedAt !== null`: seleziona forzatamente il primo tipo attivo, mostra banner "Tipo precedente eliminato — scegli un tipo"
- Chip **"Oggi"** aggiunto come primo chip (days=0)
- Default `dueAt`: oggi anziché domani (`new Date().toISOString().split('T')[0]`)
- Rimuove `min` attribute dall'`<input type="date">` (permettere date passate non ha senso UX, ma oggi sì)

### 3.3 Nuovo componente `ReminderTypeManager.tsx`

Panel inline mostrato sotto il select quando `showTypeManager=true`:

```
┌─────────────────────────────────────┐
│ ⚙ Gestisci tipi          [+ Aggiungi] │
├─────────────────────────────────────┤
│ 📞 Ricontatto commerciale    [✎] [✕] │
│ 🔥 Follow-up offerta         [✎] [✕] │
│ 💰 Pagamento                 [✎] [✕] │
│ ...                                 │
├─────────────────────────────────────┤
│ [form nuovo/modifica tipo inline]   │
└─────────────────────────────────────┘
```

- Edit inline: input label + selezione emoji + palette colore (7 preset)
- **Selezione emoji**: 8 quick-pick (📞🔥💰🔄🎂📋🎯🤝) + campo testo libero (max 2 char — accetta qualsiasi emoji digitata/incollata). Su mobile il campo apre la tastiera emoji di sistema. Quick-pick e campo libero si escludono a vicenda: selezionare un quick-pick pulisce il campo libero e viceversa.
- Delete: confirm inline con warning se il tipo ha promemoria attivi (conteggio da `usages` nel payload DELETE response)
- Drag-to-reorder: **fuori scope** — sort_order impostato dall'ordine di creazione

`ReminderTypeManager` è un componente separato che riceve `types`, `onTypesChange` come props → `ReminderForm` rimane il proprietario dello stato tipi.

### 3.4 `RemindersWidgetNew.tsx` — Redesign completo

**Layout:**
```
┌─────────────────────────────────────┐
│ 🔔 Promemoria [2 scaduti]  → Agenda │  ← header clickable naviga /agenda
├─────────────────────────────────────┤
│  L   M   M   G   V   S   D         │  ← strip 7 giorni (dom corrente + 6)
│ 21  22  23  24  25 [26] 27         │  ← oggi selezionato di default
│      ●       ●       ●●            │  ← dot colorati per tipo
├─────────────────────────────────────┤
│ [⚠ Scaduti (2)] visibili sempre    │  ← sezione scaduti sempre in cima
│                                     │
│ 📅 26 apr — 2 promemoria            │  ← data selezionata
│ ● 📞 Studio Bianchi                 │
│   Domani · [✓] [✎] [✕] [⏰+3gg]    │
│ ● 🔥 Rossi Dental                   │
│   Oggi · [✓] [✎] [✕] [⏰+3gg]      │
├─────────────────────────────────────┤
│ ✓ 3 completati oggi                 │
└─────────────────────────────────────┘
```

Stato locale: `selectedDay: string` (ISO date, default oggi).  
La strip mostra i 7 giorni della **settimana corrente lun-dom** (es. se oggi è giovedì 26, la strip mostra lun 23 – dom 29). Navigazione settimana con frecce ‹ › opzionale in v2.  
I dot sono calcolati da `upcomingReminders` caricati all'avvio (endpoint da aggiungere: `GET /api/reminders/upcoming?days=14`). Per la pagina Agenda usa `days=31`.  
Edit inline: toggle `editingId` → mostra `ReminderForm` con `initial` pre-compilato.  
Delete: toggle `deletingId` → confirm inline (no `window.confirm`).

### 3.5 Nuova `AgendaPage.tsx`

Route: `/agenda`

**Layout (mobile-first):**
```
┌─────────────────────────────────────┐
│ 📅 Agenda              [+ Promemoria]│
├─────────────────────────────────────┤
│ [2 Scaduti] [3 Oggi] [11 Prossimi] │  ← KPI row, clickable (filtra lista)
├─────────────────────────────────────┤
│      ‹  Aprile 2026  ›              │
│  L   M   M   G   V   S   D        │
│ ...griglia mensile compatta...      │  ← dot per giorni con reminder
│ [26] selezionato → agenda filtra   │
├─────────────────────────────────────┤
│ ⚠ Scaduti (2)                       │
│  ● 📞 Bonfanti Lab · 3 apr          │
│    [✓ Fatto] [✎] [✕] [⏰+3gg]      │
│                                     │
│ 📅 Oggi — 26 apr (2)                │
│  ● 🔥 Studio Bianchi                │
│    "verifica offerta turbina"       │
│    [✓ Fatto] [✎] [✕] [⏰+3gg]      │
│                                     │
│ 📅 Domani — 27 apr (1)              │
│  ● 💰 Rossi Dental                  │
│    [✓ Fatto] [✎] [✕] [⏰+3gg]      │
└─────────────────────────────────────┘
```

Desktop (≥768px): mini-cal sulla sinistra (colonna fissa 280px) + agenda lista sulla destra.  
Tablet/mobile: stacked (cal sopra, lista sotto), cal collassabile con chevron.

Click su cliente → naviga `/customers/:erpId`.  
Click su KPI "Scaduti" → scroll/filtro lista a sezione scaduti.  
Edit inline: stesso pattern di `RemindersWidgetNew` (toggle `editingId`).

### 3.6 Navbar

`DashboardNav.tsx`: aggiunta voce **"📅 Agenda"** che naviga a `/agenda`.  
`AppRouter.tsx`: nuova route `<Route path="/agenda" element={<AgendaPage />} />`.

---

## 4. Servizio API aggiuntivo

### `GET /api/reminders/upcoming?days=N`

Restituisce tutti i reminder `status IN ('active','snoozed')` con `due_at` nei prossimi N giorni, più tutti gli scaduti. Include JOIN su `reminder_types`. Usato da widget e pagina agenda per popolare i dot del calendario.

Response shape:
```ts
type UpcomingReminders = {
  overdue: ReminderWithCustomer[];
  byDate: Record<string, ReminderWithCustomer[]>; // chiave: 'YYYY-MM-DD'
  totalActive: number;
  completedToday: number;
};
```

---

## 5. Test

### Unit test (`.spec.ts` collocati)

- `reminder-types.ts` repository: CRUD + soft-delete + listing (inclusi soft-deleted)
- `reminders.service.ts`: `computeDueDateFromChip` con chip 'Oggi' (days=0)
- `ReminderTypeManager.tsx`: render lista tipi, add, edit, delete confirm

### Integration test

- `GET /api/reminders/types` → lista corretta per utente
- `POST /api/reminders/types` → crea tipo e appare nel GET
- `DELETE /api/reminders/types/:id` → soft-delete, tipo non appare nei nuovi form
- `GET /api/reminders/upcoming` → risposta corretta per utente con reminder in vari stati

### G-1 / G-2 gates

```bash
npm run type-check --prefix archibald-web-app/frontend
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/backend
```

---

## 6. Sequenza di implementazione

1. **Migration 071** — tabella `reminder_types`, seed, backfill `type_id`, drop `type`
2. **Backend** — repository `reminder-types.ts` + route `/reminders/types` + update repository `customer-reminders.ts` (JOIN) + route `/reminders/upcoming`
3. **`reminders.service.ts`** — nuovi tipi TS, nuove funzioni API, `computeDueDateFromChip` con 'Oggi'
4. **`ReminderTypeManager.tsx`** — nuovo componente
5. **`ReminderForm.tsx`** — integrazione tipo manager + chip Oggi + default oggi
6. **`RemindersWidgetNew.tsx`** — redesign strip settimanale + azioni inline
7. **`AgendaPage.tsx`** — nuova pagina
8. **Navbar + Router** — voce Agenda + route `/agenda`
9. **Test** — unit + integration per tutti i nuovi moduli

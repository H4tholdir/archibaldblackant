# Agenda Appuntamenti — Design Spec
_Data: 2026-04-27_

## 1. Obiettivo

Estendere il sistema agenda di Formicanera con tre funzionalità integrate:

1. **Appuntamenti veri** (start/end time, cliente opzionale, tipo gestibile) con sync Google/Apple Calendar via ICS.
2. **Promemoria automatici batch** per clienti dormienti da 3 mesi, con ricorrenza settimanale e auto-cancellazione al nuovo ordine.
3. **Redesign UI/UX** di AgendaPage, widget dashboard e nuova sezione "Agenda cliente" nella scheda cliente.

---

## 2. Decisioni di design approvate

| Decisione | Scelta |
|-----------|--------|
| Libreria calendario UI | **Schedule-X** (MIT, @schedule-x/react + @schedule-x/calendar + @schedule-x/events-service + @schedule-x/theme-default) |
| ICS export immediato | **ical-generator** npm (MIT) |
| ICS import | **node-ical** npm (MIT) |
| Sync calendar esterno Phase 1 | Subscription URL `GET /api/agenda/feed.ics?token=<ics_token>` — Google/Apple Calendar auto-refresh 8-24h, zero OAuth2 |
| Sync calendar esterno Phase 2 | Google Calendar OAuth2 via `googleapis` — deferred |
| Storage appuntamenti | Tabella separata `agents.appointments` (non estendere `customer_reminders`) |
| Tipi appuntamento | Tabella `agents.appointment_types` — tipi sistema (rinominabili, non eliminabili) + custom per-agente |
| Promemoria dormienti | Colonna `source TEXT` su `customer_reminders` (NULL=manuale, 'auto'=batch) |
| Token ICS | Colonna `ics_token TEXT` su `agents.users` |
| Layout AgendaPage | Option A: mini-cal + Schedule-X time grid day/week/month, vista agenda cronologica, pannello laterale desktop |
| Widget dashboard | KPI 4-valori + strip 7gg con dot colorati per tipo + lista mista appuntamenti+promemoria |
| Agenda cliente | Sezione unificata nella scheda cliente — lista mista cronologica (non tab separati) |

---

## 3. Schema DB — Migration 072

### 3.1 Nuova tabella `agents.appointment_types`

```sql
CREATE TABLE agents.appointment_types (
  id          SERIAL PRIMARY KEY,
  -- user_id NULL = tipo di sistema condiviso tra tutti gli agenti
  -- user_id NOT NULL = tipo custom di quel singolo agente
  user_id     INTEGER REFERENCES agents.users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '📋',
  color_hex   TEXT NOT NULL DEFAULT '#64748b',
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT system_types_have_null_user CHECK (
    (is_system = true AND user_id IS NULL) OR
    (is_system = false AND user_id IS NOT NULL)
  )
);

-- Seed tipi di sistema: user_id = NULL, is_system = true
INSERT INTO agents.appointment_types (user_id, label, emoji, color_hex, is_system, sort_order) VALUES
  (NULL, 'Visita cliente',  '🏢', '#2563eb', true, 1),
  (NULL, 'Chiamata',        '📞', '#10b981', true, 2),
  (NULL, 'Video call',      '🎥', '#8b5cf6', true, 3),
  (NULL, 'Riunione',        '🤝', '#f59e0b', true, 4),
  (NULL, 'Trasferta',       '✈️', '#ef4444', true, 5),
  (NULL, 'Altro',           '📋', '#64748b', true, 6);
```

> **Nota**: I tipi di sistema (`is_system = true`, `user_id = NULL`) sono condivisi tra tutti gli agenti — non eliminabili, solo rinominabili/riordinabili. I tipi custom (`is_system = false`, `user_id = <id agente>`) sono per-agente e soft-deletable. Il CHECK constraint garantisce la coerenza.

### 3.2 Nuova tabella `agents.appointments`

```sql
CREATE TABLE agents.appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          INTEGER NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  start_at         TIMESTAMPTZ NOT NULL,
  end_at           TIMESTAMPTZ NOT NULL,
  all_day          BOOLEAN NOT NULL DEFAULT FALSE,
  customer_erp_id  TEXT,              -- NULL = appuntamento generico
  location         TEXT,
  type_id          INTEGER REFERENCES agents.appointment_types(id),
  notes            TEXT,
  ics_uid          TEXT UNIQUE,       -- UID stabile per ICS export/import
  google_event_id  TEXT,             -- Phase 2: Google Calendar OAuth2
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ        -- soft delete
);

CREATE INDEX ON agents.appointments (user_id, start_at) WHERE deleted_at IS NULL;
CREATE INDEX ON agents.appointments (customer_erp_id) WHERE customer_erp_id IS NOT NULL AND deleted_at IS NULL;
```

**Constraint**: `end_at > start_at` (CHECK). Se `all_day = true`, start/end vengono normalizzati a mezzanotte UTC.

### 3.3 Colonna `source` su `customer_reminders`

```sql
ALTER TABLE agents.customer_reminders
  ADD COLUMN source TEXT DEFAULT NULL;
-- NULL = creato manualmente dall'agente
-- 'auto' = generato dallo scheduler batch clienti dormienti
```

### 3.4 Colonna `ics_token` su `agents.users`

```sql
ALTER TABLE agents.users
  ADD COLUMN ics_token TEXT UNIQUE
    DEFAULT encode(gen_random_bytes(32), 'hex');
```

Il token è statico per default e ruotabile dall'agente (invalidando il vecchio URL di abbonamento).

---

## 4. Backend — Rotte e logica

### 4.1 Router `appointments` (`src/routes/appointments-router.ts`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET` | `/api/appointments` | Lista appuntamenti dell'agente autenticato. Query: `from`, `to` (date ISO), `customerId` |
| `POST` | `/api/appointments` | Crea appuntamento. Genera `ics_uid = uuid()` al momento della creazione |
| `PATCH` | `/api/appointments/:id` | Aggiorna campi. Aggiorna `updated_at` |
| `DELETE` | `/api/appointments/:id` | Soft delete (`deleted_at = NOW()`) |

### 4.2 Router `appointment-types` (`src/routes/appointment-types-router.ts`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET` | `/api/appointment-types` | Lista tipi: sistema + custom dell'agente autenticato |
| `POST` | `/api/appointment-types` | Crea tipo custom |
| `PATCH` | `/api/appointment-types/:id` | Aggiorna label/emoji/color/sort_order. Tipi sistema: solo label/emoji/sort_order |
| `DELETE` | `/api/appointment-types/:id` | Soft delete. Rifiuta con 403 se `is_system = true` |

### 4.3 Router `agenda-ics` (`src/routes/agenda-ics-router.ts`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET` | `/api/agenda/feed.ics` | Feed ICS subscription. Auth: query param `token=<ics_token>`. Restituisce tutti gli appuntamenti futuri + 30 giorni passati |
| `GET` | `/api/agenda/export.ics` | Export ICS one-shot. Auth: JWT session cookie. Restituisce file .ics scaricabile |

Implementazione ICS con **ical-generator**:
```ts
import ical from 'ical-generator';

function buildIcs(appointments: Appointment[]): string {
  const cal = ical({ name: 'Agenda Formicanera' });
  for (const appt of appointments) {
    cal.createEvent({
      uid: appt.ics_uid,
      start: appt.start_at,
      end: appt.end_at,
      summary: appt.title,
      location: appt.location ?? undefined,
      description: appt.notes ?? undefined,
    });
  }
  return cal.toString();
}
```

### 4.4 Repository `appointments` (`src/db/repositories/appointments.ts`)

Funzioni (tutte accettano `DbPool` come primo parametro):

- `createAppointment(pool, userId, data)` → `Appointment`
- `listAppointments(pool, userId, opts: { from, to, customerId? })` → `Appointment[]`
- `getAppointment(pool, userId, id)` → `Appointment | null`
- `updateAppointment(pool, userId, id, patch)` → `Appointment`
- `softDeleteAppointment(pool, userId, id)` → `void`

### 4.5 Repository `appointment-types` (`src/db/repositories/appointment-types.ts`)

- `listAppointmentTypes(pool, userId)` → `WHERE (user_id IS NULL OR user_id = $userId) AND deleted_at IS NULL ORDER BY sort_order` — restituisce tipi sistema + custom dell'utente, ordinati
- `createAppointmentType(pool, userId, data)` → `AppointmentType`
- `updateAppointmentType(pool, userId, id, patch)` → `AppointmentType`
- `softDeleteAppointmentType(pool, userId, id)` → `void` (lancia errore se is_system)

### 4.6 Scheduler — `checkDormantCustomers()` in `notification-scheduler.ts`

Nuova funzione aggiunta allo scheduler esistente, eseguita ogni 24h insieme alle altre:

```
checkDormantCustomers(pool):
  Per ogni agente attivo:
    Trova clienti con last_order_date < NOW() - 3 mesi
    Per ciascun cliente:
      Se NON esiste già un customer_reminder attivo (status != 'done')
         con type label 'Ricontatto commerciale' E source = 'auto':
        INSERT customer_reminders con:
          type_id = id di 'Ricontatto commerciale'
          due_at  = CURRENT_DATE
          recurrence_days = 7
          source  = 'auto'
          note    = 'Cliente inattivo da N mesi (generato automaticamente)'
```

### 4.7 Auto-cancellazione promemoria dormienti al nuovo ordine

In `sync-orders` handler, quando viene inserito/aggiornato un ordine per un cliente:

```
Se order.order_date è recente (< 7 giorni):
  UPDATE customer_reminders
  SET status = 'done', done_at = NOW()
  WHERE customer_erp_id = $customer_erp_id
    AND source = 'auto'
    AND status != 'done'
    AND user_id = $user_id
```

Il ciclo si azzera: dopo 3 nuovi mesi di inattività, `checkDormantCustomers` creerà un nuovo promemoria.

---

## 5. Frontend — Componenti

### 5.1 Tipi TypeScript condivisi (`src/types/agenda.ts`)

```ts
type AppointmentId = Brand<string, 'AppointmentId'>;
type AppointmentTypeId = Brand<number, 'AppointmentTypeId'>;

type AppointmentType = {
  id: AppointmentTypeId;
  label: string;
  emoji: string;
  colorHex: string;
  isSystem: boolean;
  sortOrder: number;
};

type Appointment = {
  id: AppointmentId;
  title: string;
  startAt: string;  // ISO
  endAt: string;
  allDay: boolean;
  customerErpId: string | null;
  customerName: string | null;  // join
  location: string | null;
  typeId: AppointmentTypeId | null;
  typeName: string | null;     // join
  typeEmoji: string | null;
  typeColorHex: string | null;
  notes: string | null;
  icsUid: string;
};

// Tipo unificato per lista mista agenda
type AgendaItem =
  | { kind: 'appointment'; data: Appointment }
  | { kind: 'reminder';    data: ReminderWithCustomer };
```

### 5.2 Servizi API frontend

- `src/api/appointments.ts` — CRUD appuntamenti + ICS export
- `src/api/appointment-types.ts` — CRUD tipi appuntamento

### 5.3 Hook `useAgenda` (`src/hooks/useAgenda.ts`)

Fetch parallelo di appuntamenti + promemoria per un range date, ritorna array `AgendaItem[]` ordinato per data/ora. Usato da AgendaPage, widget e sezione cliente.

```ts
function useAgenda(opts: { from: string; to: string; customerId?: string }):
  { items: AgendaItem[]; loading: boolean; refetch: () => void }
```

### 5.4 Componenti nuovi / modificati

| Componente | File | Descrizione |
|------------|------|-------------|
| `AgendaPage` | `src/pages/AgendaPage.tsx` | Rewrite completo con Schedule-X. Mini-cal + Schedule-X time grid. Vista mobile: agenda list cronologica. FAB per nuovo appuntamento/promemoria |
| `AgendaWidgetNew` | `src/components/AgendaWidgetNew.tsx` | Sostituisce `RemindersWidgetNew`. KPI 4-valori + strip 7gg + lista mista. Righe appuntamento (sfondo `#eff6ff` + border-left blu) vs promemoria (bianco + dot colorato) |
| `AppointmentForm` | `src/components/AppointmentForm.tsx` | Form create/edit. Desktop: modale. Mobile: bottom sheet. Stessa logica, layout condizionale via `isMobile` |
| `AppointmentTypeManager` | `src/components/AppointmentTypeManager.tsx` | Gestione tipi. Lista sistema (solo rinomina) + custom (CRUD). Form inline aggiunta. Accessibile da link nel form appuntamento e da impostazioni agenda |
| `AgendaClienteSection` | `src/components/AgendaClienteSection.tsx` | Sezione "Agenda cliente" nella scheda cliente. Lista mista cronologica con filtri pill client-side (Tutti/Appuntamenti/Promemoria/Scaduti). Sezioni temporali Passato/Oggi/Prossimi auto-generate |
| `AgendaMixedList` | `src/components/AgendaMixedList.tsx` | Componente condiviso per lista mista. Usato da AgendaWidgetNew, AgendaClienteSection, AgendaPage (vista agenda) |

### 5.5 Schedule-X — integrazione

```tsx
import { useCalendarApp } from '@schedule-x/react';
import { createCalendar } from '@schedule-x/calendar';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import '@schedule-x/theme-default/dist/index.css';

// Custom event renderer per preservare inline styles della PWA
const customEventComponent = ({ calendarEvent }) => (
  <div style={{ background: calendarEvent._colorHex, borderRadius: 6, padding: '2px 6px', fontSize: 12 }}>
    {calendarEvent._emoji} {calendarEvent.title}
  </div>
);
```

Gli appuntamenti vengono convertiti in formato Schedule-X (`{ id, title, start, end, ... }`) e passati all'events service. I promemoria (all-day) appaiono nella banda "all-day" in cima al time grid.

---

## 6. UX — Layout approvato

### Widget Dashboard (`AgendaWidgetNew`)
- **Header**: "📅 Agenda" + link "Apri agenda →"
- **KPI row**: 4 tile con bordo-top colorato — Scaduti (rosso) / Oggi (blu) / Appuntamenti (verde) / Settimana (viola)
- **Strip 7gg**: giorno breve + numero + dot colorati (uno per tipo item). Oggi = cerchio blu pieno
- **Lista eventi**: sezioni cromatiche SCADUTO (sfondo rosso tenue) / OGGI (sfondo blu tenue) / PROSSIMI (grigio)
  - Appuntamenti: sfondo `#eff6ff`, border-left 4px blu, colonna orario fissa sinistra
  - Promemoria: sfondo bianco, dot colorato per tipo
  - Badge 🤖 per promemoria automatici, ✓ inline per segnare fatto
- **Footer**: "+ Promemoria" (verde) | "+ Appuntamento" (blu)

### AgendaPage (Schedule-X)
- **Mobile**: mini-cal mensile compatta + lista agenda cronologica sotto. FAB blu (+) per nuovo appuntamento/promemoria
- **Tablet**: mini-cal sinistra + vista week Schedule-X destra
- **Desktop**: sidebar sinistra (mini-cal + filtri) + Schedule-X al centro (week/month/day) + pannello dettaglio destra al click su evento

### AgendaClienteSection (scheda cliente)
- Posizione: dopo la sezione "Storico ordini" e prima di "Promemoria" (che viene fusa qui)
- Header con "+ Promemoria" e "+ Appuntamento"
- Filtri pill: Tutti / 📌 Appuntamenti / 🔔 Promemoria / ⚠ Scaduti
- Sezioni auto: Passato (collassabile) / Oggi / Prossimi
- Appuntamenti passati completati: opacità 60%, testo barrato
- Stessa distinzione cromatica del widget

### Form appuntamento
- **Desktop**: modale centrata, max-width 480px. Campi: Titolo, toggle Tutto il giorno, Data/ora range, Cliente (pill opzionale), Luogo, Tipo (chip row con link gestione tipi), Note, nota sync. Footer: Annulla / Salva+.ics / Salva
- **Mobile**: bottom sheet slide-up. Stessi campi del desktop. Tipo in griglia 3-col (tutti e 6 i tipi). Footer: [Annulla | Salva+.ics] + [Salva full width]

---

## 7. ICS Sync — Architettura 3 fasi

### Fase 1 (implementata in questo sprint)
- Export `.ics` scaricabile: `GET /api/agenda/export.ics` (autenticato via sessione)
- Subscription URL: `GET /api/agenda/feed.ics?token=<ics_token>` — l'agente copia l'URL in Google/Apple Calendar

### Fase 2 (sprint successivo)
- Endpoint rotazione token ICS: `POST /api/agenda/rotate-ics-token`
- Import da file `.ics` uploadato: `POST /api/agenda/import-ics` (parsing con node-ical, supporto RRULE)

### Fase 3 (backlog)
- Google Calendar OAuth2 via `googleapis` — sync bidirezionale in tempo reale
- Apple Calendar via CalDAV — da valutare

---

## 8. Test

### Unit test (`*.spec.ts`)
- `buildIcs()` — verifica che i campi ICS siano corretti per appuntamenti all-day e con orario
- `checkDormantCustomers()` — logica di dedup (non crea promemoria se già esiste uno attivo con source='auto')
- `normalizeToAgendaItems()` — ordinamento cronologico lista mista

### Integration test
- `POST /api/appointments` + `GET /api/appointments` — round trip
- `GET /api/agenda/feed.ics?token=...` — risposta Content-Type `text/calendar`, UID presente
- `DELETE /api/appointment-types/:id` con tipo sistema → 403

---

## 9. Dipendenze npm da aggiungere

**Backend:**
```
ical-generator   # ICS export
node-ical        # ICS import (Fase 2)
```

**Frontend:**
```
@schedule-x/react
@schedule-x/calendar
@schedule-x/events-service
@schedule-x/theme-default
```

---

## 10. Migration sequence

- **Migration 072** (`072-agenda-appointments.sql`): tutto il contenuto della sezione 3 in un singolo file transazionale.
- **Non** modificare migration 071 (già in prod con `reminder_types`).

---

## 11. Migrazione componenti esistenti

| Componente esistente | Azione |
|---------------------|--------|
| `RemindersWidgetNew.tsx` | Sostituito da `AgendaWidgetNew.tsx`. Il vecchio file viene rimosso e i riferimenti in `Dashboard.tsx` aggiornati |
| Sezione "Promemoria" in `CustomerProfilePage.tsx` | Sostituita dalla nuova sezione "Agenda cliente" (`AgendaClienteSection`). La sezione promemoria standalone non esiste più nella scheda cliente |
| `AgendaPage.tsx` (versione attuale) | Rewrite completo. La logica di reminder fetch esistente viene assorbita in `useAgenda` |

---

## 12. Out of scope (questo sprint)

- Google Calendar OAuth2 (Fase 3)
- CalDAV Apple Calendar
- Notifiche push per appuntamenti imminenti
- Condivisione appuntamenti tra agenti
- Recurring appointments (solo promemoria hanno recurrence_days)

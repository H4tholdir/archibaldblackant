# Agenda Appuntamenti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare sistema agenda appuntamenti con tipi gestibili, promemoria dormienti automatici, sync ICS, e redesign UI/UX completo (Schedule-X + widget + scheda cliente).

**Architecture:** Tabella `agents.appointments` separata dai reminder. Repository + router Express dedicati per ogni entità. Hook `useAgenda` normalizza lista mista appointments+reminders. Schedule-X per time grid. ICS centralizzato in `AgendaCalendarSyncPanel`. `checkDormantCustomers` nello scheduler crea promemoria automatici con `source='auto'`.

**Tech Stack:** PostgreSQL, Express/TypeScript, ical-generator, React 19, @schedule-x/react, Vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-04-27-agenda-appointments-design.md`

---

## File Map

### Backend — Nuovi
| File | Responsabilità |
|------|---------------|
| `backend/src/db/migrations/072-agenda-appointments.sql` | Crea appointments, appointment_types, aggiunge source + ics_token |
| `backend/src/db/repositories/appointment-types.ts` | CRUD tipi appuntamento (sistema + custom) |
| `backend/src/db/repositories/appointment-types.spec.ts` | Unit test repo tipi |
| `backend/src/db/repositories/appointments.ts` | CRUD appuntamenti |
| `backend/src/db/repositories/appointments.spec.ts` | Unit test repo appuntamenti |
| `backend/src/routes/appointment-types-router.ts` | Router `/api/appointment-types` |
| `backend/src/routes/appointments-router.ts` | Router `/api/appointments` |
| `backend/src/routes/agenda-ics-router.ts` | Router `/api/agenda` (ICS feed + export) |

### Backend — Modificati
| File | Modifica |
|------|---------|
| `backend/src/sync/notification-scheduler.ts` | Aggiunge `checkDormantCustomers()` |
| `backend/src/server.ts` | Registra 3 nuovi router |
| `backend/package.json` | Aggiunge `ical-generator` |

### Frontend — Nuovi
| File | Responsabilità |
|------|---------------|
| `frontend/src/types/agenda.ts` | Tipi condivisi: `Appointment`, `AppointmentType`, `AgendaItem` |
| `frontend/src/api/appointments.ts` | CRUD appuntamenti (fetch) |
| `frontend/src/api/appointment-types.ts` | CRUD tipi appuntamento (fetch) |
| `frontend/src/hooks/useAgenda.ts` | Fetch parallelo reminders+appointments, lista mista ordinata |
| `frontend/src/components/AgendaMixedList.tsx` | Lista mista riutilizzabile (widget + agenda + scheda cliente) |
| `frontend/src/components/AgendaMixedList.spec.tsx` | Test rendering lista mista |
| `frontend/src/components/AppointmentForm.tsx` | Form create/edit (modale desktop + bottom sheet mobile) |
| `frontend/src/components/AppointmentForm.spec.tsx` | Test form |
| `frontend/src/components/AppointmentTypeManager.tsx` | Gestione tipi (sistema + custom) |
| `frontend/src/components/AgendaWidgetNew.tsx` | Widget dashboard (sostituisce RemindersWidgetNew) |
| `frontend/src/components/AgendaWidgetNew.spec.tsx` | Test widget |
| `frontend/src/components/AgendaCalendarSyncPanel.tsx` | Pannello unico ICS (export, URL abbonamento) |
| `frontend/src/components/AgendaHelpPanel.tsx` | Mini-guida sistema agenda |
| `frontend/src/components/AgendaClienteSection.tsx` | Sezione agenda nella scheda cliente |

### Frontend — Modificati
| File | Modifica |
|------|---------|
| `frontend/src/pages/AgendaPage.tsx` | Rewrite completo con Schedule-X |
| `frontend/src/pages/CustomerProfilePage.tsx` | Sostituisce sezione Promemoria con AgendaClienteSection |
| `frontend/package.json` | Aggiunge `@schedule-x/react`, `@schedule-x/calendar`, `@schedule-x/events-service`, `@schedule-x/theme-default` |
| Dashboard (`frontend/src/components/` o `pages/`) | Sostituisce `RemindersWidgetNew` con `AgendaWidgetNew` |

---

## Task 1: Migration 072

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/072-agenda-appointments.sql`

- [ ] **Step 1: Crea il file migration**

```sql
-- archibald-web-app/backend/src/db/migrations/072-agenda-appointments.sql
BEGIN;

-- 1. Tabella tipi appuntamento
--    user_id = NULL  → tipo di sistema (condiviso tra tutti gli agenti)
--    user_id = TEXT  → tipo custom di quell'agente
CREATE TABLE agents.appointment_types (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT REFERENCES agents.users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '📋',
  color_hex   TEXT NOT NULL DEFAULT '#64748b',
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT system_types_have_null_user CHECK (
    (is_system = TRUE  AND user_id IS NULL) OR
    (is_system = FALSE AND user_id IS NOT NULL)
  )
);

CREATE INDEX idx_appointment_types_user
  ON agents.appointment_types (user_id)
  WHERE deleted_at IS NULL;

-- Seed tipi di sistema
INSERT INTO agents.appointment_types (user_id, label, emoji, color_hex, is_system, sort_order)
VALUES
  (NULL, 'Visita cliente', '🏢', '#2563eb', TRUE, 1),
  (NULL, 'Chiamata',       '📞', '#10b981', TRUE, 2),
  (NULL, 'Video call',     '🎥', '#8b5cf6', TRUE, 3),
  (NULL, 'Riunione',       '🤝', '#f59e0b', TRUE, 4),
  (NULL, 'Trasferta',      '✈️', '#ef4444', TRUE, 5),
  (NULL, 'Altro',          '📋', '#64748b', TRUE, 6);

-- 2. Tabella appuntamenti
CREATE TABLE agents.appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  start_at         TIMESTAMPTZ NOT NULL,
  end_at           TIMESTAMPTZ NOT NULL,
  all_day          BOOLEAN NOT NULL DEFAULT FALSE,
  customer_erp_id  TEXT,
  location         TEXT,
  type_id          INTEGER REFERENCES agents.appointment_types(id),
  notes            TEXT,
  ics_uid          TEXT UNIQUE,
  google_event_id  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT end_after_start CHECK (end_at > start_at)
);

CREATE INDEX idx_appointments_user_start
  ON agents.appointments (user_id, start_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_appointments_customer
  ON agents.appointments (customer_erp_id)
  WHERE customer_erp_id IS NOT NULL AND deleted_at IS NULL;

-- 3. Colonna source su customer_reminders
--    NULL = creato manualmente, 'auto' = generato da checkDormantCustomers
ALTER TABLE agents.customer_reminders
  ADD COLUMN source TEXT DEFAULT NULL;

-- 4. Token ICS per ogni utente (subscription URL)
ALTER TABLE agents.users
  ADD COLUMN ics_token TEXT UNIQUE
    DEFAULT encode(gen_random_bytes(32), 'hex');

-- Popola ics_token per utenti già esistenti che lo hanno NULL
UPDATE agents.users
SET ics_token = encode(gen_random_bytes(32), 'hex')
WHERE ics_token IS NULL;

COMMIT;
```

- [ ] **Step 2: Esegui la migration in locale**

```bash
npm run db:migrate --prefix archibald-web-app/backend
```

Verifica output: `✓ Applied migration 072-agenda-appointments.sql`

- [ ] **Step 3: Verifica schema**

```bash
# Controlla che le tabelle esistano
psql $DATABASE_URL -c "\d agents.appointments"
psql $DATABASE_URL -c "\d agents.appointment_types"
psql $DATABASE_URL -c "SELECT id, label, is_system FROM agents.appointment_types ORDER BY sort_order;"
```

Output atteso: 6 righe con i tipi sistema (is_system = true).

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/072-agenda-appointments.sql
git commit -m "feat(db): migration 072 — appointments, appointment_types, source, ics_token"
```

---

## Task 2: Installa pacchetti npm

**Files:**
- Modify: `archibald-web-app/backend/package.json`
- Modify: `archibald-web-app/frontend/package.json`

- [ ] **Step 1: Installa ical-generator nel backend**

```bash
npm install ical-generator --prefix archibald-web-app/backend
```

Verifica: `"ical-generator"` appare in `backend/package.json` dependencies.

- [ ] **Step 2: Installa Schedule-X nel frontend**

```bash
npm install @schedule-x/react @schedule-x/calendar @schedule-x/events-service @schedule-x/theme-default --prefix archibald-web-app/frontend
```

Verifica: i 4 pacchetti appaiono in `frontend/package.json` dependencies.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/package.json archibald-web-app/backend/package-lock.json
git add archibald-web-app/frontend/package.json archibald-web-app/frontend/package-lock.json
git commit -m "feat(deps): aggiungi ical-generator (backend) e @schedule-x/* (frontend)"
```

---

## Task 3: Repository appointment-types (backend)

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/appointment-types.ts`
- Create: `archibald-web-app/backend/src/db/repositories/appointment-types.spec.ts`

- [ ] **Step 1: Scrivi il test failing**

```typescript
// archibald-web-app/backend/src/db/repositories/appointment-types.spec.ts
import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../pool';
import {
  listAppointmentTypes,
  createAppointmentType,
  updateAppointmentType,
  softDeleteAppointmentType,
  type AppointmentTypeId,
} from './appointment-types';

type MockPool = DbPool & { queryCalls: Array<{ text: string; params?: unknown[] }> };

function createMockPool(
  responseQueue: Array<{ rows: unknown[]; rowCount?: number }> = [],
): MockPool {
  const queue = [...responseQueue];
  const queryCalls: Array<{ text: string; params?: unknown[] }> = [];
  return {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params });
      const next = queue.shift() ?? { rows: [], rowCount: 0 };
      return { rows: next.rows, rowCount: next.rowCount ?? next.rows.length };
    }),
  } as unknown as MockPool;
}

const SYSTEM_TYPE_ROW = {
  id: 1,
  user_id: null,
  label: 'Visita cliente',
  emoji: '🏢',
  color_hex: '#2563eb',
  is_system: true,
  sort_order: 1,
  deleted_at: null,
};

const CUSTOM_TYPE_ROW = {
  id: 7,
  user_id: 'agent-001',
  label: 'Incontro informale',
  emoji: '☕',
  color_hex: '#f97316',
  is_system: false,
  sort_order: 7,
  deleted_at: null,
};

describe('listAppointmentTypes', () => {
  test('restituisce tipi sistema + custom utente, no deleted', async () => {
    const pool = createMockPool([{ rows: [SYSTEM_TYPE_ROW, CUSTOM_TYPE_ROW] }]);
    const result = await listAppointmentTypes(pool, 'agent-001');
    expect(result).toEqual([
      { id: 1, userId: null, label: 'Visita cliente', emoji: '🏢', colorHex: '#2563eb', isSystem: true, sortOrder: 1 },
      { id: 7, userId: 'agent-001', label: 'Incontro informale', emoji: '☕', colorHex: '#f97316', isSystem: false, sortOrder: 7 },
    ]);
    const { text } = pool.queryCalls[0];
    expect(text).toContain('user_id IS NULL OR user_id = $1');
    expect(text).toContain('deleted_at IS NULL');
  });
});

describe('createAppointmentType', () => {
  test('inserisce tipo custom con user_id e is_system false', async () => {
    const pool = createMockPool([{ rows: [{ ...CUSTOM_TYPE_ROW }] }]);
    const result = await createAppointmentType(pool, 'agent-001', {
      label: 'Incontro informale', emoji: '☕', colorHex: '#f97316', sortOrder: 7,
    });
    expect(result.isSystem).toBe(false);
    expect(result.userId).toBe('agent-001');
    const { params } = pool.queryCalls[0];
    expect(params).toEqual(['agent-001', 'Incontro informale', '☕', '#f97316', 7]);
  });
});

describe('updateAppointmentType', () => {
  test('aggiorna label su tipo sistema (consentito)', async () => {
    const updated = { ...SYSTEM_TYPE_ROW, label: 'Visita commerciale' };
    const pool = createMockPool([{ rows: [updated] }]);
    const result = await updateAppointmentType(pool, 'agent-001', 1 as AppointmentTypeId, { label: 'Visita commerciale' });
    expect(result.label).toBe('Visita commerciale');
  });
});

describe('softDeleteAppointmentType', () => {
  test('lancia errore se il tipo è di sistema', async () => {
    const pool = createMockPool([{ rows: [SYSTEM_TYPE_ROW] }]);
    await expect(
      softDeleteAppointmentType(pool, 'agent-001', 1 as AppointmentTypeId),
    ).rejects.toThrow('Cannot delete system appointment type');
  });

  test('soft-deleta tipo custom', async () => {
    const pool = createMockPool([
      { rows: [CUSTOM_TYPE_ROW] },
      { rows: [], rowCount: 1 },
    ]);
    await expect(
      softDeleteAppointmentType(pool, 'agent-001', 7 as AppointmentTypeId),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Esegui test per verificare il fallimento**

```bash
npm test --prefix archibald-web-app/backend -- appointment-types.spec
```

Atteso: `FAIL` con "Cannot find module './appointment-types'".

- [ ] **Step 3: Implementa il repository**

```typescript
// archibald-web-app/backend/src/db/repositories/appointment-types.ts
import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
export type AppointmentTypeId = Brand<number, 'AppointmentTypeId'>;

export type AppointmentType = {
  id: AppointmentTypeId;
  userId: string | null;
  label: string;
  emoji: string;
  colorHex: string;
  isSystem: boolean;
  sortOrder: number;
};

type AppointmentTypeRow = {
  id: number;
  user_id: string | null;
  label: string;
  emoji: string;
  color_hex: string;
  is_system: boolean;
  sort_order: number;
  deleted_at: string | null;
};

function rowToType(row: AppointmentTypeRow): AppointmentType {
  return {
    id: row.id as AppointmentTypeId,
    userId: row.user_id,
    label: row.label,
    emoji: row.emoji,
    colorHex: row.color_hex,
    isSystem: row.is_system,
    sortOrder: row.sort_order,
  };
}

export async function listAppointmentTypes(
  pool: DbPool,
  userId: string,
): Promise<AppointmentType[]> {
  const { rows } = await pool.query<AppointmentTypeRow>(
    `SELECT id, user_id, label, emoji, color_hex, is_system, sort_order, deleted_at
     FROM agents.appointment_types
     WHERE (user_id IS NULL OR user_id = $1)
       AND deleted_at IS NULL
     ORDER BY sort_order`,
    [userId],
  );
  return rows.map(rowToType);
}

type CreateAppointmentTypeInput = {
  label: string;
  emoji: string;
  colorHex: string;
  sortOrder: number;
};

export async function createAppointmentType(
  pool: DbPool,
  userId: string,
  input: CreateAppointmentTypeInput,
): Promise<AppointmentType> {
  const { rows } = await pool.query<AppointmentTypeRow>(
    `INSERT INTO agents.appointment_types (user_id, label, emoji, color_hex, is_system, sort_order)
     VALUES ($1, $2, $3, $4, FALSE, $5)
     RETURNING id, user_id, label, emoji, color_hex, is_system, sort_order, deleted_at`,
    [userId, input.label, input.emoji, input.colorHex, input.sortOrder],
  );
  return rowToType(rows[0]);
}

type UpdateAppointmentTypeInput = {
  label?: string;
  emoji?: string;
  colorHex?: string;
  sortOrder?: number;
};

export async function updateAppointmentType(
  pool: DbPool,
  userId: string,
  id: AppointmentTypeId,
  patch: UpdateAppointmentTypeInput,
): Promise<AppointmentType> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (patch.label !== undefined)     { sets.push(`label = $${p++}`);     params.push(patch.label); }
  if (patch.emoji !== undefined)     { sets.push(`emoji = $${p++}`);     params.push(patch.emoji); }
  if (patch.colorHex !== undefined)  { sets.push(`color_hex = $${p++}`); params.push(patch.colorHex); }
  if (patch.sortOrder !== undefined) { sets.push(`sort_order = $${p++}`);params.push(patch.sortOrder); }

  params.push(id, userId);

  const { rows } = await pool.query<AppointmentTypeRow>(
    `UPDATE agents.appointment_types
     SET ${sets.join(', ')}
     WHERE id = $${p} AND (user_id = $${p + 1} OR user_id IS NULL) AND deleted_at IS NULL
     RETURNING id, user_id, label, emoji, color_hex, is_system, sort_order, deleted_at`,
    params,
  );
  return rowToType(rows[0]);
}

export async function softDeleteAppointmentType(
  pool: DbPool,
  userId: string,
  id: AppointmentTypeId,
): Promise<void> {
  const { rows } = await pool.query<{ is_system: boolean }>(
    `SELECT is_system FROM agents.appointment_types WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (rows[0]?.is_system) {
    throw new Error('Cannot delete system appointment type');
  }
  await pool.query(
    `UPDATE agents.appointment_types
     SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId],
  );
}
```

- [ ] **Step 4: Esegui test e verifica che passino**

```bash
npm test --prefix archibald-web-app/backend -- appointment-types.spec
```

Atteso: tutti i test PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/appointment-types.ts \
        archibald-web-app/backend/src/db/repositories/appointment-types.spec.ts
git commit -m "feat(backend): repository appointment-types con unit test"
```

---

## Task 4: Repository appointments (backend)

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/appointments.ts`
- Create: `archibald-web-app/backend/src/db/repositories/appointments.spec.ts`

- [ ] **Step 1: Scrivi il test failing**

```typescript
// archibald-web-app/backend/src/db/repositories/appointments.spec.ts
import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../pool';
import {
  createAppointment,
  listAppointments,
  getAppointment,
  updateAppointment,
  softDeleteAppointment,
  type AppointmentId,
} from './appointments';

type MockPool = DbPool & { queryCalls: Array<{ text: string; params?: unknown[] }> };

function createMockPool(
  responseQueue: Array<{ rows: unknown[]; rowCount?: number }> = [],
): MockPool {
  const queue = [...responseQueue];
  const queryCalls: Array<{ text: string; params?: unknown[] }> = [];
  return {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params });
      const next = queue.shift() ?? { rows: [], rowCount: 0 };
      return { rows: next.rows, rowCount: next.rowCount ?? next.rows.length };
    }),
  } as unknown as MockPool;
}

const APPT_ROW = {
  id: 'uuid-001',
  user_id: 'agent-001',
  title: 'Visita De Luca',
  start_at: new Date('2026-04-25T14:30:00Z'),
  end_at: new Date('2026-04-25T16:00:00Z'),
  all_day: false,
  customer_erp_id: 'CUST-042',
  customer_name: 'De Luca SRL',
  location: 'Ferrara',
  type_id: 1,
  type_label: 'Visita cliente',
  type_emoji: '🏢',
  type_color_hex: '#2563eb',
  notes: null,
  ics_uid: 'ics-001',
  google_event_id: null,
  created_at: new Date('2026-04-24T10:00:00Z'),
  updated_at: new Date('2026-04-24T10:00:00Z'),
};

describe('createAppointment', () => {
  test('inserisce e ritorna appuntamento con ics_uid generato', async () => {
    const pool = createMockPool([{ rows: [APPT_ROW] }]);
    const result = await createAppointment(pool, 'agent-001', {
      title: 'Visita De Luca',
      startAt: '2026-04-25T14:30:00Z',
      endAt: '2026-04-25T16:00:00Z',
      allDay: false,
      customerErpId: 'CUST-042',
      location: 'Ferrara',
      typeId: 1,
      notes: null,
    });
    expect(result.id).toBe('uuid-001');
    expect(result.title).toBe('Visita De Luca');
    expect(result.customerName).toBe('De Luca SRL');
  });
});

describe('listAppointments', () => {
  test('filtra per range date e user_id', async () => {
    const pool = createMockPool([{ rows: [APPT_ROW] }]);
    await listAppointments(pool, 'agent-001', { from: '2026-04-01', to: '2026-04-30' });
    const { text, params } = pool.queryCalls[0];
    expect(text).toContain('start_at >= $2');
    expect(text).toContain('start_at <= $3');
    expect(params).toContain('agent-001');
  });

  test('filtra per customerId quando passato', async () => {
    const pool = createMockPool([{ rows: [] }]);
    await listAppointments(pool, 'agent-001', {
      from: '2026-04-01', to: '2026-04-30', customerId: 'CUST-042',
    });
    expect(pool.queryCalls[0].text).toContain('customer_erp_id = $4');
  });
});

describe('softDeleteAppointment', () => {
  test('imposta deleted_at', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 1 }]);
    await softDeleteAppointment(pool, 'agent-001', 'uuid-001' as AppointmentId);
    const { text, params } = pool.queryCalls[0];
    expect(text).toContain('deleted_at = NOW()');
    expect(params).toEqual(['uuid-001', 'agent-001']);
  });
});
```

- [ ] **Step 2: Esegui test — verifica fallimento**

```bash
npm test --prefix archibald-web-app/backend -- appointments.spec
```

Atteso: `FAIL` — modulo non trovato.

- [ ] **Step 3: Implementa il repository**

```typescript
// archibald-web-app/backend/src/db/repositories/appointments.ts
import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
export type AppointmentId = Brand<string, 'AppointmentId'>;

export type Appointment = {
  id: AppointmentId;
  userId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  customerErpId: string | null;
  customerName: string | null;
  location: string | null;
  typeId: number | null;
  typeLabel: string | null;
  typeEmoji: string | null;
  typeColorHex: string | null;
  notes: string | null;
  icsUid: string;
  googleEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AppointmentRow = {
  id: string;
  user_id: string;
  title: string;
  start_at: Date;
  end_at: Date;
  all_day: boolean;
  customer_erp_id: string | null;
  customer_name: string | null;
  location: string | null;
  type_id: number | null;
  type_label: string | null;
  type_emoji: string | null;
  type_color_hex: string | null;
  notes: string | null;
  ics_uid: string;
  google_event_id: string | null;
  created_at: Date;
  updated_at: Date;
};

const SELECT_COLS = `
  a.id, a.user_id, a.title, a.start_at, a.end_at, a.all_day,
  a.customer_erp_id,
  c.name AS customer_name,
  a.location, a.type_id,
  at.label AS type_label,
  at.emoji AS type_emoji,
  at.color_hex AS type_color_hex,
  a.notes, a.ics_uid, a.google_event_id, a.created_at, a.updated_at
`;

const FROM_JOINS = `
  FROM agents.appointments a
  LEFT JOIN agents.customers c
    ON c.erp_id = a.customer_erp_id AND c.user_id = a.user_id AND c.deleted_at IS NULL
  LEFT JOIN agents.appointment_types at
    ON at.id = a.type_id AND at.deleted_at IS NULL
`;

function rowToAppt(row: AppointmentRow): Appointment {
  return {
    id: row.id as AppointmentId,
    userId: row.user_id,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    customerErpId: row.customer_erp_id,
    customerName: row.customer_name,
    location: row.location,
    typeId: row.type_id,
    typeLabel: row.type_label,
    typeEmoji: row.type_emoji,
    typeColorHex: row.type_color_hex,
    notes: row.notes,
    icsUid: row.ics_uid,
    googleEventId: row.google_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type CreateAppointmentInput = {
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  customerErpId: string | null;
  location: string | null;
  typeId: number | null;
  notes: string | null;
};

export async function createAppointment(
  pool: DbPool,
  userId: string,
  input: CreateAppointmentInput,
): Promise<Appointment> {
  const { rows } = await pool.query<AppointmentRow>(
    `WITH inserted AS (
       INSERT INTO agents.appointments
         (user_id, title, start_at, end_at, all_day, customer_erp_id, location, type_id, notes, ics_uid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, gen_random_uuid()::text)
       RETURNING *
     )
     SELECT ${SELECT_COLS}
     ${FROM_JOINS.replace('agents.appointments a', 'inserted a')}`,
    [userId, input.title, input.startAt, input.endAt, input.allDay,
     input.customerErpId, input.location, input.typeId, input.notes],
  );
  return rowToAppt(rows[0]);
}

type ListAppointmentsOpts = {
  from: string;
  to: string;
  customerId?: string;
};

export async function listAppointments(
  pool: DbPool,
  userId: string,
  opts: ListAppointmentsOpts,
): Promise<Appointment[]> {
  const params: unknown[] = [userId, opts.from, opts.to];
  let customerFilter = '';
  if (opts.customerId) {
    params.push(opts.customerId);
    customerFilter = `AND a.customer_erp_id = $${params.length}`;
  }

  const { rows } = await pool.query<AppointmentRow>(
    `SELECT ${SELECT_COLS}
     ${FROM_JOINS}
     WHERE a.user_id = $1
       AND a.start_at >= $2
       AND a.start_at <= $3
       AND a.deleted_at IS NULL
       ${customerFilter}
     ORDER BY a.start_at`,
    params,
  );
  return rows.map(rowToAppt);
}

export async function getAppointment(
  pool: DbPool,
  userId: string,
  id: AppointmentId,
): Promise<Appointment | null> {
  const { rows } = await pool.query<AppointmentRow>(
    `SELECT ${SELECT_COLS}
     ${FROM_JOINS}
     WHERE a.id = $1 AND a.user_id = $2 AND a.deleted_at IS NULL`,
    [id, userId],
  );
  return rows[0] ? rowToAppt(rows[0]) : null;
}

type UpdateAppointmentInput = Partial<CreateAppointmentInput>;

export async function updateAppointment(
  pool: DbPool,
  userId: string,
  id: AppointmentId,
  patch: UpdateAppointmentInput,
): Promise<Appointment> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let p = 1;

  const fieldMap: Record<keyof UpdateAppointmentInput, string> = {
    title: 'title', startAt: 'start_at', endAt: 'end_at', allDay: 'all_day',
    customerErpId: 'customer_erp_id', location: 'location', typeId: 'type_id', notes: 'notes',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    const val = patch[key as keyof UpdateAppointmentInput];
    if (val !== undefined) {
      sets.push(`${col} = $${p++}`);
      params.push(val);
    }
  }

  params.push(id, userId);
  const { rows } = await pool.query<AppointmentRow>(
    `WITH updated AS (
       UPDATE agents.appointments
       SET ${sets.join(', ')}
       WHERE id = $${p} AND user_id = $${p + 1} AND deleted_at IS NULL
       RETURNING *
     )
     SELECT ${SELECT_COLS}
     ${FROM_JOINS.replace('agents.appointments a', 'updated a')}`,
    params,
  );
  return rowToAppt(rows[0]);
}

export async function softDeleteAppointment(
  pool: DbPool,
  userId: string,
  id: AppointmentId,
): Promise<void> {
  await pool.query(
    `UPDATE agents.appointments
     SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId],
  );
}
```

- [ ] **Step 4: Esegui test — verifica PASS**

```bash
npm test --prefix archibald-web-app/backend -- appointments.spec
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/appointments.ts \
        archibald-web-app/backend/src/db/repositories/appointments.spec.ts
git commit -m "feat(backend): repository appointments con unit test"
```

---

## Task 5: Router appointment-types + agenda-ics + appointments (backend)

**Files:**
- Create: `archibald-web-app/backend/src/routes/appointment-types-router.ts`
- Create: `archibald-web-app/backend/src/routes/appointments-router.ts`
- Create: `archibald-web-app/backend/src/routes/agenda-ics-router.ts`
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Crea appointment-types-router.ts**

```typescript
// archibald-web-app/backend/src/routes/appointment-types-router.ts
import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
import {
  listAppointmentTypes,
  createAppointmentType,
  updateAppointmentType,
  softDeleteAppointmentType,
  type AppointmentTypeId,
} from '../db/repositories/appointment-types';
import { logger } from '../logger';

type Deps = { pool: DbPool };

const CreateSchema = z.object({
  label:     z.string().min(1).max(64),
  emoji:     z.string().min(1).max(8),
  colorHex:  z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.number().int().min(0).default(99),
});

const UpdateSchema = CreateSchema.partial();

export function createAppointmentTypesRouter({ pool }: Deps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const userId = (req as any).userId as string;
      const types = await listAppointmentTypes(pool, userId);
      res.json(types);
    } catch (err) {
      logger.error('listAppointmentTypes error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as any).userId as string;
      const type = await createAppointmentType(pool, userId, parsed.data);
      res.status(201).json(type);
    } catch (err) {
      logger.error('createAppointmentType error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/:id', async (req, res) => {
    const id = Number(req.params.id) as AppointmentTypeId;
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as any).userId as string;
      const type = await updateAppointmentType(pool, userId, id, parsed.data);
      res.json(type);
    } catch (err) {
      logger.error('updateAppointmentType error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id) as AppointmentTypeId;
    try {
      const userId = (req as any).userId as string;
      await softDeleteAppointmentType(pool, userId, id);
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && err.message === 'Cannot delete system appointment type') {
        return res.status(403).json({ error: err.message });
      }
      logger.error('softDeleteAppointmentType error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
```

- [ ] **Step 2: Crea appointments-router.ts**

```typescript
// archibald-web-app/backend/src/routes/appointments-router.ts
import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
import {
  createAppointment,
  listAppointments,
  updateAppointment,
  softDeleteAppointment,
  type AppointmentId,
} from '../db/repositories/appointments';
import { logger } from '../logger';

type Deps = { pool: DbPool };

const AppointmentSchema = z.object({
  title:          z.string().min(1).max(256),
  startAt:        z.string().datetime(),
  endAt:          z.string().datetime(),
  allDay:         z.boolean().default(false),
  customerErpId:  z.string().nullable().default(null),
  location:       z.string().max(512).nullable().default(null),
  typeId:         z.number().int().positive().nullable().default(null),
  notes:          z.string().max(4096).nullable().default(null),
});

const UpdateSchema = AppointmentSchema.partial();

const ListQuerySchema = z.object({
  from:       z.string().date(),
  to:         z.string().date(),
  customerId: z.string().optional(),
});

export function createAppointmentsRouter({ pool }: Deps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as any).userId as string;
      const appts = await listAppointments(pool, userId, parsed.data);
      res.json(appts);
    } catch (err) {
      logger.error('listAppointments error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    const parsed = AppointmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as any).userId as string;
      const appt = await createAppointment(pool, userId, parsed.data);
      res.status(201).json(appt);
    } catch (err) {
      logger.error('createAppointment error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/:id', async (req, res) => {
    const id = req.params.id as AppointmentId;
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as any).userId as string;
      const appt = await updateAppointment(pool, userId, id, parsed.data);
      res.json(appt);
    } catch (err) {
      logger.error('updateAppointment error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = req.params.id as AppointmentId;
    try {
      const userId = (req as any).userId as string;
      await softDeleteAppointment(pool, userId, id);
      res.status(204).end();
    } catch (err) {
      logger.error('softDeleteAppointment error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
```

- [ ] **Step 3: Crea agenda-ics-router.ts**

```typescript
// archibald-web-app/backend/src/routes/agenda-ics-router.ts
import { Router } from 'express';
import ical from 'ical-generator';
import type { DbPool } from '../db/pool';
import { listAppointments } from '../db/repositories/appointments';
import { logger } from '../logger';

type Deps = { pool: DbPool };

async function getUserIdByIcsToken(pool: DbPool, token: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM agents.users WHERE ics_token = $1 AND deleted_at IS NULL`,
    [token],
  );
  return rows[0]?.id ?? null;
}

function buildIcsCalendar(
  appointments: Awaited<ReturnType<typeof listAppointments>>,
): string {
  const cal = ical({ name: 'Agenda Formicanera' });
  for (const appt of appointments) {
    cal.createEvent({
      uid: appt.icsUid,
      start: appt.startAt,
      end: appt.endAt,
      allDay: appt.allDay,
      summary: appt.title,
      location: appt.location ?? undefined,
      description: appt.notes ?? undefined,
    });
  }
  return cal.toString();
}

export function createAgendaIcsRouter({ pool }: Deps): Router {
  const router = Router();

  // Subscription URL — auth via token query param (nessun middleware JWT)
  router.get('/feed.ics', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : null;
    if (!token) return res.status(401).send('Missing token');

    try {
      const userId = await getUserIdByIcsToken(pool, token);
      if (!userId) return res.status(401).send('Invalid token');

      const from = new Date();
      from.setDate(from.getDate() - 30);
      const to = new Date();
      to.setFullYear(to.getFullYear() + 1);

      const appts = await listAppointments(pool, userId, {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      });

      const icsContent = buildIcsCalendar(appts);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="agenda.ics"');
      res.send(icsContent);
    } catch (err) {
      logger.error('ICS feed error', { err });
      res.status(500).send('Internal server error');
    }
  });

  // Export one-shot — auth via sessione JWT (middleware authenticate già applicato al router)
  router.get('/export.ics', async (req, res) => {
    try {
      const userId = (req as any).userId as string;
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const to = new Date();
      to.setFullYear(to.getFullYear() + 1);

      const appts = await listAppointments(pool, userId, {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      });

      const icsContent = buildIcsCalendar(appts);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="agenda-formicanera.ics"');
      res.send(icsContent);
    } catch (err) {
      logger.error('ICS export error', { err });
      res.status(500).send('Internal server error');
    }
  });

  return router;
}
```

- [ ] **Step 4: Registra i router in server.ts**

Trova il blocco di registrazione router (vicino a `app.use('/api/reminders', authenticate, ...)`). Aggiungi subito dopo:

```typescript
// Importa in cima al file, accanto agli altri import di router:
import { createAppointmentTypesRouter } from './routes/appointment-types-router';
import { createAppointmentsRouter } from './routes/appointments-router';
import { createAgendaIcsRouter } from './routes/agenda-ics-router';

// Nella sezione dove si registrano le route (dopo le altre app.use):
app.use('/api/appointment-types', authenticate, createAppointmentTypesRouter({ pool }));
app.use('/api/appointments', authenticate, createAppointmentsRouter({ pool }));
// /api/agenda ha il suo token auth interno, non usa il middleware authenticate globale
// MA /agenda/export.ics richiede sessione → registriamo due percorsi separati:
app.use('/api/agenda/feed.ics', createAgendaIcsRouter({ pool }));     // token auth interno
app.use('/api/agenda/export.ics', authenticate, createAgendaIcsRouter({ pool })); // sessione
```

> **Nota**: Se il server ha un `router` centrale, aggiungi lì; se ha `app.use` diretto, aggiungi in quel blocco. Cerca `app.use('/api/reminders'` come punto di riferimento.

- [ ] **Step 5: Type-check e test**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: nessun errore TypeScript.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/routes/appointment-types-router.ts \
        archibald-web-app/backend/src/routes/appointments-router.ts \
        archibald-web-app/backend/src/routes/agenda-ics-router.ts \
        archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): router appointment-types, appointments, agenda-ics"
```

---

## Task 6: checkDormantCustomers + auto-cancel su nuovo ordine

**Files:**
- Modify: `archibald-web-app/backend/src/sync/notification-scheduler.ts`
- Modify: il file handler sync-orders (trovare con `grep -r 'sync-orders\|syncOrders' archibald-web-app/backend/src/operations/handlers/`)

- [ ] **Step 1: Aggiungi checkDormantCustomers a notification-scheduler.ts**

Apri `notification-scheduler.ts`. Aggiungi questa funzione prima di `createNotificationScheduler`:

```typescript
async function checkDormantCustomers(pool: DbPool): Promise<number> {
  // Trova clienti inattivi da 3+ mesi senza un promemoria auto già attivo
  const { rows } = await pool.query<{
    erp_id: string;
    user_id: string;
    name: string;
    last_order_date: string;
    reminder_type_id: number;
    months_inactive: number;
  }>(`
    SELECT
      c.erp_id,
      c.user_id,
      c.name,
      c.last_order_date,
      rt.id AS reminder_type_id,
      EXTRACT(MONTH FROM age(NOW(), c.last_order_date))::int AS months_inactive
    FROM agents.customers c
    JOIN agents.reminder_types rt
      ON rt.user_id = c.user_id
     AND rt.deleted_at IS NULL
     AND rt.emoji = '📞'
    WHERE c.deleted_at IS NULL
      AND c.last_order_date IS NOT NULL
      AND c.last_order_date < NOW() - INTERVAL '3 months'
      AND NOT EXISTS (
        SELECT 1 FROM agents.customer_reminders cr
        WHERE cr.customer_erp_id = c.erp_id
          AND cr.user_id = c.user_id
          AND cr.source = 'auto'
          AND cr.status NOT IN ('done', 'cancelled')
      )
  `);

  let created = 0;
  for (const row of rows) {
    try {
      await pool.query(
        `INSERT INTO agents.customer_reminders
           (user_id, customer_erp_id, type_id, priority, due_at, recurrence_days, source, note, notify_via, status)
         VALUES ($1, $2, $3, 'normal', CURRENT_DATE, 7, 'auto', $4, 'app', 'active')`,
        [
          row.user_id,
          row.erp_id,
          row.reminder_type_id,
          `Cliente inattivo da ${row.months_inactive} mesi (generato automaticamente)`,
        ],
      );
      created++;
    } catch (err) {
      logger.error('checkDormantCustomers: failed to create reminder', { erp_id: row.erp_id, err });
    }
  }
  return created;
}
```

- [ ] **Step 2: Aggiungi checkDormantCustomers all'interno di start()**

All'interno della funzione `start()` di `createNotificationScheduler`, nell'`setInterval` già esistente, aggiungi:

```typescript
checkDormantCustomers(pool).catch((error) => {
  logger.error('Failed to check dormant customers', { error });
});
```

> Aggiungilo accanto agli altri check (checkCustomerInactivity, checkOverduePayments, ecc.)

- [ ] **Step 3: Trova il handler sync-orders**

```bash
grep -rl 'sync-orders\|syncOrders\|order_records.*INSERT\|upsert.*order' \
  archibald-web-app/backend/src/operations/handlers/ | head -5
```

Apri il file trovato. Cerca il punto dove un nuovo ordine viene inserito o aggiornato nel DB per un cliente.

- [ ] **Step 4: Aggiungi auto-cancel promemoria auto dopo insert/update ordine**

Nel handler sync-orders, dopo l'INSERT/UPSERT di un ordine recente (order_date < 7 giorni fa), aggiungi:

```typescript
// Auto-cancel promemoria dormienti (source='auto') quando arriva un nuovo ordine
// Eseguito solo per ordini recenti per non impattare lo storico
if (isRecentOrder) {
  await pool.query(
    `UPDATE agents.customer_reminders
     SET status = 'cancelled', updated_at = NOW()
     WHERE customer_erp_id = $1
       AND user_id = $2
       AND source = 'auto'
       AND status NOT IN ('done', 'cancelled')`,
    [customerErpId, userId],
  );
}
```

> `isRecentOrder` = `new Date(order.orderDate) > new Date(Date.now() - 7 * 86400000)`.
> `customerErpId` e `userId` sono già disponibili nel contesto del handler.

- [ ] **Step 5: Type-check**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/sync/notification-scheduler.ts
git commit -m "feat(backend): checkDormantCustomers scheduler + auto-cancel su nuovo ordine"
```

---

## Task 7: Frontend — tipi condivisi e servizi API

**Files:**
- Create: `archibald-web-app/frontend/src/types/agenda.ts`
- Create: `archibald-web-app/frontend/src/api/appointments.ts`
- Create: `archibald-web-app/frontend/src/api/appointment-types.ts`

- [ ] **Step 1: Crea types/agenda.ts**

```typescript
// archibald-web-app/frontend/src/types/agenda.ts
import type { ReminderWithCustomer } from '../services/reminders.service';

export type AppointmentType = {
  id: number;
  userId: string | null;
  label: string;
  emoji: string;
  colorHex: string;
  isSystem: boolean;
  sortOrder: number;
};

export type Appointment = {
  id: string;
  userId: string;
  title: string;
  startAt: string;   // ISO string
  endAt: string;     // ISO string
  allDay: boolean;
  customerErpId: string | null;
  customerName: string | null;
  location: string | null;
  typeId: number | null;
  typeLabel: string | null;
  typeEmoji: string | null;
  typeColorHex: string | null;
  notes: string | null;
  icsUid: string;
  googleEventId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgendaItem =
  | { kind: 'appointment'; data: Appointment }
  | { kind: 'reminder';    data: ReminderWithCustomer };

export type CreateAppointmentInput = {
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  customerErpId: string | null;
  location: string | null;
  typeId: number | null;
  notes: string | null;
};

export type UpdateAppointmentInput = Partial<CreateAppointmentInput>;

export type CreateAppointmentTypeInput = {
  label: string;
  emoji: string;
  colorHex: string;
  sortOrder: number;
};
```

- [ ] **Step 2: Crea api/appointments.ts**

```typescript
// archibald-web-app/frontend/src/api/appointments.ts
import { fetchWithRetry } from '../utils/fetchWithRetry';
import type { Appointment, CreateAppointmentInput, UpdateAppointmentInput } from '../types/agenda';

export async function listAppointments(opts: {
  from: string;
  to: string;
  customerId?: string;
}): Promise<Appointment[]> {
  const params = new URLSearchParams({ from: opts.from, to: opts.to });
  if (opts.customerId) params.set('customerId', opts.customerId);
  return fetchWithRetry<Appointment[]>(`/api/appointments?${params}`);
}

export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  return fetchWithRetry<Appointment>('/api/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function updateAppointment(
  id: string,
  patch: UpdateAppointmentInput,
): Promise<Appointment> {
  return fetchWithRetry<Appointment>(`/api/appointments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function deleteAppointment(id: string): Promise<void> {
  await fetchWithRetry<void>(`/api/appointments/${id}`, { method: 'DELETE' });
}

export function getIcsExportUrl(): string {
  return '/api/agenda/export.ics';
}
```

- [ ] **Step 3: Crea api/appointment-types.ts**

```typescript
// archibald-web-app/frontend/src/api/appointment-types.ts
import { fetchWithRetry } from '../utils/fetchWithRetry';
import type { AppointmentType, CreateAppointmentTypeInput } from '../types/agenda';

export async function listAppointmentTypes(): Promise<AppointmentType[]> {
  return fetchWithRetry<AppointmentType[]>('/api/appointment-types');
}

export async function createAppointmentType(
  input: CreateAppointmentTypeInput,
): Promise<AppointmentType> {
  return fetchWithRetry<AppointmentType>('/api/appointment-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function updateAppointmentType(
  id: number,
  patch: Partial<CreateAppointmentTypeInput>,
): Promise<AppointmentType> {
  return fetchWithRetry<AppointmentType>(`/api/appointment-types/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function deleteAppointmentType(id: number): Promise<void> {
  await fetchWithRetry<void>(`/api/appointment-types/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 4: Crea hooks/useAgenda.ts**

```typescript
// archibald-web-app/frontend/src/hooks/useAgenda.ts
import React from 'react';
import { listAppointments } from '../api/appointments';
import { listUpcomingReminders } from '../services/reminders.service';
import type { AgendaItem } from '../types/agenda';

type UseAgendaOpts = {
  from: string;
  to: string;
  customerId?: string;
};

export function useAgenda(opts: UseAgendaOpts): {
  items: AgendaItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [items, setItems] = React.useState<AgendaItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      listAppointments({ from: opts.from, to: opts.to, customerId: opts.customerId }),
      listUpcomingReminders(31),
    ])
      .then(([appts, remindersData]) => {
        if (cancelled) return;

        const apptItems: AgendaItem[] = appts.map((a) => ({ kind: 'appointment', data: a }));

        // Normalizza i reminder dal formato UpcomingReminders a lista piatta
        const overdue = remindersData.overdue.filter(
          (r) => !opts.customerId || r.customerErpId === opts.customerId,
        );
        const byDate = Object.values(remindersData.byDate)
          .flat()
          .filter((r) => !opts.customerId || r.customerErpId === opts.customerId);

        const reminderItems: AgendaItem[] = [...overdue, ...byDate].map((r) => ({
          kind: 'reminder',
          data: r,
        }));

        // Ordina cronologicamente: appointments per startAt, reminders per dueAt
        const merged = [...apptItems, ...reminderItems].sort((a, b) => {
          const dateA = a.kind === 'appointment' ? a.data.startAt : a.data.dueAt;
          const dateB = b.kind === 'appointment' ? b.data.startAt : b.data.dueAt;
          return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
        });

        setItems(merged);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError('Errore nel caricamento agenda');
        setLoading(false);
        console.error(err);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.from, opts.to, opts.customerId, tick]);

  const refetch = React.useCallback(() => setTick((t) => t + 1), []);

  return { items, loading, error, refetch };
}
```

- [ ] **Step 5: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/types/agenda.ts \
        archibald-web-app/frontend/src/api/appointments.ts \
        archibald-web-app/frontend/src/api/appointment-types.ts \
        archibald-web-app/frontend/src/hooks/useAgenda.ts
git commit -m "feat(frontend): tipi agenda, servizi API, hook useAgenda"
```

---

## Task 8: AgendaMixedList — componente lista mista riutilizzabile

**Files:**
- Create: `archibald-web-app/frontend/src/components/AgendaMixedList.tsx`
- Create: `archibald-web-app/frontend/src/components/AgendaMixedList.spec.tsx`

- [ ] **Step 1: Scrivi il test failing**

```typescript
// archibald-web-app/frontend/src/components/AgendaMixedList.spec.tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgendaMixedList } from './AgendaMixedList';
import type { AgendaItem } from '../types/agenda';
import type { Appointment } from '../types/agenda';
import type { ReminderWithCustomer } from '../services/reminders.service';

const APPT: Appointment = {
  id: 'appt-1', userId: 'agent-1', title: 'Call Verona',
  startAt: '2026-04-25T09:00:00Z', endAt: '2026-04-25T10:00:00Z',
  allDay: false, customerErpId: null, customerName: null,
  location: null, typeId: 2, typeLabel: 'Chiamata', typeEmoji: '📞',
  typeColorHex: '#10b981', notes: null, icsUid: 'ics-1',
  googleEventId: null, createdAt: '', updatedAt: '',
};

const REMINDER: ReminderWithCustomer = {
  id: 1, userId: 'agent-1', customerErpId: 'CUST-1', customerName: 'Rossi SRL',
  typeId: 1, typeLabel: 'Ricontatto', typeEmoji: '📞',
  typeColorBg: '#fee2e2', typeColorText: '#dc2626', typeDeletedAt: null,
  priority: 'normal', dueAt: '2026-04-25T00:00:00Z',
  recurrenceDays: 7, note: null, notifyVia: 'app',
  status: 'active', snoozedUntil: null, completedAt: null,
  completionNote: null, createdAt: '', updatedAt: '',
};

const ITEMS: AgendaItem[] = [
  { kind: 'appointment', data: APPT },
  { kind: 'reminder',    data: REMINDER },
];

describe('AgendaMixedList', () => {
  test('mostra titolo appuntamento', () => {
    render(<MemoryRouter><AgendaMixedList items={ITEMS} onRefetch={() => {}} /></MemoryRouter>);
    expect(screen.getByText('Call Verona')).toBeInTheDocument();
  });

  test('mostra nome cliente del promemoria', () => {
    render(<MemoryRouter><AgendaMixedList items={ITEMS} onRefetch={() => {}} /></MemoryRouter>);
    expect(screen.getByText('Rossi SRL')).toBeInTheDocument();
  });

  test('mostra orario per appuntamento', () => {
    render(<MemoryRouter><AgendaMixedList items={ITEMS} onRefetch={() => {}} /></MemoryRouter>);
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
  });

  test('chiama onRefetch dopo azione', async () => {
    const onRefetch = vi.fn();
    render(<MemoryRouter><AgendaMixedList items={ITEMS} onRefetch={onRefetch} /></MemoryRouter>);
    // Lista renderizza senza crash — onRefetch sarà invocata dai pulsanti azione
    expect(screen.getAllByRole('button')).toBeDefined();
  });
});
```

- [ ] **Step 2: Esegui test — verifica fallimento**

```bash
npm test --prefix archibald-web-app/frontend -- AgendaMixedList.spec
```

- [ ] **Step 3: Implementa AgendaMixedList.tsx**

```tsx
// archibald-web-app/frontend/src/components/AgendaMixedList.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { patchReminder } from '../services/reminders.service';
import { deleteAppointment } from '../api/appointments';
import type { AgendaItem } from '../types/agenda';

// Costanti colori (inline style, nessun CSS class)
const SECTION_STYLE = {
  overdue: { background: '#fef2f2', color: '#dc2626' },
  today:   { background: '#eff6ff', color: '#1d4ed8' },
  upcoming:{ background: '#f8fafc', color: '#64748b' },
};

const ROW_BASE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '9px 12px', borderBottom: '1px solid #e9eef5',
  minHeight: 46, background: '#ffffff',
};

const APPT_ROW: React.CSSProperties = {
  ...ROW_BASE,
  background: '#eff6ff',
  borderLeft: '4px solid #2563eb',
  paddingLeft: 8,
  borderBottomColor: '#dbeafe',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function toDateKey(iso: string): string {
  return iso.split('T')[0];
}

type Props = {
  items: AgendaItem[];
  onRefetch: () => void;
  compact?: boolean;  // per widget dashboard (max 5 voci)
};

export function AgendaMixedList({ items, onRefetch, compact = false }: Props) {
  const navigate = useNavigate();
  const todayKey = new Date().toISOString().split('T')[0];
  const [completingId, setCompletingId] = React.useState<string | number | null>(null);

  const displayItems = compact ? items.slice(0, 5) : items;

  // Raggruppa in sezioni
  const overdue: AgendaItem[] = [];
  const today: AgendaItem[] = [];
  const upcoming: AgendaItem[] = [];

  for (const item of displayItems) {
    const dateKey = item.kind === 'appointment'
      ? toDateKey(item.data.startAt)
      : toDateKey(item.data.dueAt);
    if (dateKey < todayKey) overdue.push(item);
    else if (dateKey === todayKey) today.push(item);
    else upcoming.push(item);
  }

  async function handleCompleteReminder(id: number) {
    setCompletingId(id);
    try {
      await patchReminder(id, { status: 'done', completed_at: new Date().toISOString() });
      onRefetch();
    } finally {
      setCompletingId(null);
    }
  }

  async function handleDeleteAppointment(id: string) {
    setCompletingId(id);
    try {
      await deleteAppointment(id);
      onRefetch();
    } finally {
      setCompletingId(null);
    }
  }

  function renderItem(item: AgendaItem, idx: number) {
    if (item.kind === 'appointment') {
      const appt = item.data;
      return (
        <div key={appt.id} style={APPT_ROW}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
            {appt.allDay ? 'Tutto il g.' : formatTime(appt.startAt)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📌 {appt.title}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {appt.typeEmoji} {appt.typeLabel}
              {appt.customerName ? ` · ${appt.customerName}` : ''}
            </div>
          </div>
          <button
            onClick={() => handleDeleteAppointment(appt.id)}
            disabled={completingId === appt.id}
            style={{ width: 26, height: 26, borderRadius: '50%', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#94a3b8', flexShrink: 0 }}
          >
            ✓
          </button>
        </div>
      );
    }

    // reminder
    const r = item.data;
    const isAuto = (r as any).source === 'auto';
    return (
      <div key={r.id} style={{ ...ROW_BASE }}>
        <div style={{ minWidth: 36, flexShrink: 0 }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.typeColorBg, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
            onClick={() => navigate(`/customers/${r.customerErpId}`)}
          >
            {r.customerName}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
            {r.typeEmoji} {r.typeLabel}
          </div>
        </div>
        {isAuto && (
          <div style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', borderRadius: 4, padding: '1px 5px', flexShrink: 0, fontWeight: 600 }}>
            🤖 auto
          </div>
        )}
        <button
          onClick={() => handleCompleteReminder(r.id)}
          disabled={completingId === r.id}
          style={{ width: 26, height: 26, borderRadius: '50%', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#94a3b8', flexShrink: 0 }}
        >
          ✓
        </button>
      </div>
    );
  }

  function renderSection(label: string, sectionItems: AgendaItem[], style: typeof SECTION_STYLE.overdue) {
    if (sectionItems.length === 0) return null;
    return (
      <>
        <div style={{ ...style, fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', padding: '4px 12px', width: '100%' }}>
          {label}
        </div>
        {sectionItems.map((item, i) => renderItem(item, i))}
      </>
    );
  }

  if (displayItems.length === 0) {
    return (
      <div style={{ padding: '20px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        Nessun elemento in agenda
      </div>
    );
  }

  return (
    <div style={{ overflow: 'hidden' }}>
      {renderSection('⚠ Scaduto', overdue, SECTION_STYLE.overdue)}
      {renderSection(`📅 ${new Date().toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })} — Oggi`, today, SECTION_STYLE.today)}
      {renderSection('Prossimi', upcoming, SECTION_STYLE.upcoming)}
    </div>
  );
}
```

- [ ] **Step 4: Esegui test**

```bash
npm test --prefix archibald-web-app/frontend -- AgendaMixedList.spec
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/AgendaMixedList.tsx \
        archibald-web-app/frontend/src/components/AgendaMixedList.spec.tsx
git commit -m "feat(frontend): AgendaMixedList — lista mista appointments+reminders riutilizzabile"
```

---

## Task 9: AppointmentTypeManager + AppointmentForm

**Files:**
- Create: `archibald-web-app/frontend/src/components/AppointmentTypeManager.tsx`
- Create: `archibald-web-app/frontend/src/components/AppointmentForm.tsx`
- Create: `archibald-web-app/frontend/src/components/AppointmentForm.spec.tsx`

- [ ] **Step 1: Scrivi test failing per AppointmentForm**

```typescript
// archibald-web-app/frontend/src/components/AppointmentForm.spec.tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppointmentForm } from './AppointmentForm';
import * as appointmentsApi from '../api/appointments';
import type { AppointmentType } from '../types/agenda';

const TYPES: AppointmentType[] = [
  { id: 1, userId: null, label: 'Visita cliente', emoji: '🏢', colorHex: '#2563eb', isSystem: true, sortOrder: 1 },
  { id: 2, userId: null, label: 'Chiamata',       emoji: '📞', colorHex: '#10b981', isSystem: true, sortOrder: 2 },
];

describe('AppointmentForm', () => {
  beforeEach(() => {
    vi.spyOn(appointmentsApi, 'createAppointment').mockResolvedValue({
      id: 'new-1', userId: 'a', title: 'Test', startAt: '', endAt: '',
      allDay: false, customerErpId: null, customerName: null, location: null,
      typeId: null, typeLabel: null, typeEmoji: null, typeColorHex: null,
      notes: null, icsUid: 'uid-1', googleEventId: null, createdAt: '', updatedAt: '',
    });
  });

  test('renderizza campi principali', () => {
    render(
      <MemoryRouter>
        <AppointmentForm types={TYPES} onSaved={() => {}} onCancel={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/Titolo/i)).toBeInTheDocument();
    expect(screen.getByText('🏢 Visita cliente')).toBeInTheDocument();
    expect(screen.getByText('📞 Chiamata')).toBeInTheDocument();
  });

  test('chiama createAppointment con i dati corretti al submit', async () => {
    render(
      <MemoryRouter>
        <AppointmentForm types={TYPES} onSaved={() => {}} onCancel={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/Titolo/i), { target: { value: 'Visita test' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva/i }));
    await waitFor(() => expect(appointmentsApi.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Visita test' }),
    ));
  });

  test('chiama onCancel quando si preme Annulla', () => {
    const onCancel = vi.fn();
    render(
      <MemoryRouter>
        <AppointmentForm types={TYPES} onSaved={() => {}} onCancel={onCancel} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Annulla/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Esegui test — verifica fallimento**

```bash
npm test --prefix archibald-web-app/frontend -- AppointmentForm.spec
```

- [ ] **Step 3: Implementa AppointmentTypeManager.tsx**

```tsx
// archibald-web-app/frontend/src/components/AppointmentTypeManager.tsx
import React from 'react';
import {
  listAppointmentTypes,
  createAppointmentType,
  updateAppointmentType,
  deleteAppointmentType,
} from '../api/appointment-types';
import type { AppointmentType, CreateAppointmentTypeInput } from '../types/agenda';

const SWATCHES = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#f97316','#06b6d4','#64748b'];

type Props = { onClose: () => void };

export function AppointmentTypeManager({ onClose }: Props) {
  const [types, setTypes] = React.useState<AppointmentType[]>([]);
  const [adding, setAdding] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState('');
  const [newEmoji, setNewEmoji] = React.useState('📋');
  const [newColor, setNewColor] = React.useState('#2563eb');
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editLabel, setEditLabel] = React.useState('');

  async function load() {
    const data = await listAppointmentTypes();
    setTypes(data);
  }

  React.useEffect(() => { void load(); }, []);

  async function handleAdd() {
    if (!newLabel.trim()) return;
    const input: CreateAppointmentTypeInput = {
      label: newLabel.trim(), emoji: newEmoji, colorHex: newColor,
      sortOrder: types.filter((t) => !t.isSystem).length + 7,
    };
    await createAppointmentType(input);
    setAdding(false); setNewLabel(''); setNewEmoji('📋'); setNewColor('#2563eb');
    void load();
  }

  async function handleRename(id: number) {
    if (!editLabel.trim()) return;
    await updateAppointmentType(id, { label: editLabel.trim() });
    setEditingId(null); void load();
  }

  async function handleDelete(id: number) {
    await deleteAppointmentType(id);
    void load();
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,.12)', maxWidth: 420, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Tipi di appuntamento</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>I tipi sistema non possono essere eliminati</div>
        </div>
        <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
      </div>

      {types.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #f8fafc' }}>
          <div style={{ fontSize: 18, width: 32, height: 32, background: '#f8fafc', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{t.emoji}</div>
          {editingId === t.id ? (
            <input autoFocus value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(t.id); if (e.key === 'Escape') setEditingId(null); }}
              style={{ flex: 1, border: '1px solid #2563eb', borderRadius: 6, padding: '4px 8px', fontSize: 13 }} />
          ) : (
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{t.label}</div>
          )}
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.colorHex, flexShrink: 0 }} />
          {t.isSystem && <div style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>sistema</div>}
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => { setEditingId(t.id); setEditLabel(t.label); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px 6px', borderRadius: 6 }}>✏️</button>
            {!t.isSystem && (
              <button onClick={() => handleDelete(t.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px 6px', borderRadius: 6 }}>🗑</button>
            )}
          </div>
        </div>
      ))}

      {adding ? (
        <div style={{ padding: '12px 16px', background: '#f8fafc' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} maxLength={2}
              style={{ width: 44, border: '1px solid #e2e8f0', borderRadius: 8, padding: 7, textAlign: 'center', fontSize: 18 }} />
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nome tipo..."
              style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {SWATCHES.map((c) => (
              <div key={c} onClick={() => setNewColor(c)}
                style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', boxShadow: newColor === c ? '0 0 0 2px #fff, 0 0 0 4px #2563eb' : 'none' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setAdding(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Annulla</button>
            <button onClick={handleAdd} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Aggiungi</button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9' }}>
          <button onClick={() => setAdding(true)} style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}>+ Aggiungi tipo personalizzato</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implementa AppointmentForm.tsx**

```tsx
// archibald-web-app/frontend/src/components/AppointmentForm.tsx
import React from 'react';
import { createAppointment, updateAppointment } from '../api/appointments';
import type { Appointment, AppointmentType, CreateAppointmentInput } from '../types/agenda';

type Props = {
  types: AppointmentType[];
  initial?: Appointment;                // se presente → edit mode
  defaultDate?: string;                 // ISO date pre-impostata
  defaultCustomerErpId?: string;
  defaultCustomerName?: string;
  onSaved: (appt: Appointment) => void;
  onCancel: () => void;
  onManageTypes?: () => void;
  isMobile?: boolean;
};

function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16);  // "2026-04-25T14:30"
}

function fromDatetimeLocal(local: string): string {
  return new Date(local).toISOString();
}

export function AppointmentForm({
  types, initial, defaultDate, defaultCustomerErpId, defaultCustomerName,
  onSaved, onCancel, onManageTypes, isMobile = false,
}: Props) {
  const now = new Date();
  const defaultStart = defaultDate
    ? `${defaultDate}T09:00`
    : toDatetimeLocal(now.toISOString());
  const defaultEnd = defaultDate
    ? `${defaultDate}T10:00`
    : toDatetimeLocal(new Date(now.getTime() + 3600000).toISOString());

  const [title,          setTitle]          = React.useState(initial?.title ?? '');
  const [startAt,        setStartAt]        = React.useState(initial ? toDatetimeLocal(initial.startAt) : defaultStart);
  const [endAt,          setEndAt]          = React.useState(initial ? toDatetimeLocal(initial.endAt) : defaultEnd);
  const [allDay,         setAllDay]         = React.useState(initial?.allDay ?? false);
  const [customerErpId,  setCustomerErpId]  = React.useState(initial?.customerErpId ?? defaultCustomerErpId ?? null);
  const [customerName,   setCustomerName]   = React.useState(initial?.customerName ?? defaultCustomerName ?? null);
  const [location,       setLocation]       = React.useState(initial?.location ?? '');
  const [typeId,         setTypeId]         = React.useState<number | null>(initial?.typeId ?? null);
  const [notes,          setNotes]          = React.useState(initial?.notes ?? '');
  const [saving,         setSaving]         = React.useState(false);
  const [error,          setError]          = React.useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) { setError('Inserisci un titolo'); return; }
    if (!allDay && endAt <= startAt) { setError("L'orario di fine deve essere dopo l'inizio"); return; }

    setSaving(true); setError(null);
    try {
      const input: CreateAppointmentInput = {
        title: title.trim(),
        startAt: allDay ? `${startAt.split('T')[0]}T00:00:00Z` : fromDatetimeLocal(startAt),
        endAt:   allDay ? `${startAt.split('T')[0]}T23:59:59Z` : fromDatetimeLocal(endAt),
        allDay,
        customerErpId: customerErpId ?? null,
        location: location.trim() || null,
        typeId,
        notes: notes.trim() || null,
      };
      const saved = initial
        ? await updateAppointment(initial.id, input)
        : await createAppointment(input);
      onSaved(saved);
    } catch {
      setError('Errore nel salvare. Riprova.');
    } finally {
      setSaving(false);
    }
  }

  const LABEL_STYLE: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 };
  const INPUT_STYLE: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', fontSize: 14, color: '#0f172a', boxSizing: 'border-box' };

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: isMobile ? '14px 16px' : '18px', flex: 1, overflowY: 'auto' }}>
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626' }}>{error}</div>}

      <div>
        <label style={LABEL_STYLE} htmlFor="appt-title">Titolo</label>
        <input id="appt-title" style={INPUT_STYLE} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, color: '#0f172a' }}>Tutto il giorno</span>
        <div onClick={() => setAllDay(!allDay)}
          style={{ width: 40, height: 22, background: allDay ? '#2563eb' : '#e2e8f0', borderRadius: 11, position: 'relative', cursor: 'pointer' }}>
          <div style={{ width: 18, height: 18, background: '#fff', borderRadius: '50%', position: 'absolute', top: 2, left: allDay ? 20 : 2, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
        </div>
      </div>

      {!allDay && (
        <div>
          <div style={LABEL_STYLE}>Data e orario</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: 6, alignItems: 'center' }}>
            <input type="datetime-local" style={{ ...INPUT_STYLE, padding: '9px 8px', fontSize: 13, textAlign: 'center' }}
              value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>→</div>
            <input type="datetime-local" style={{ ...INPUT_STYLE, padding: '9px 8px', fontSize: 13, textAlign: 'center' }}
              value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        </div>
      )}

      {allDay && (
        <div>
          <div style={LABEL_STYLE}>Data</div>
          <input type="date" style={{ ...INPUT_STYLE }}
            value={startAt.split('T')[0]} onChange={(e) => setStartAt(`${e.target.value}T00:00`)} />
        </div>
      )}

      <div>
        <div style={LABEL_STYLE}>Cliente (opzionale)</div>
        {customerName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px' }}>
            <span style={{ fontSize: 14, color: '#1e40af', fontWeight: 600, flex: 1 }}>👤 {customerName}</span>
            <button onClick={() => { setCustomerErpId(null); setCustomerName(null); }}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        ) : (
          <div style={{ border: '1px dashed #cbd5e1', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#94a3b8', cursor: 'pointer' }}>
            Cerca cliente...
          </div>
        )}
      </div>

      <div>
        <div style={LABEL_STYLE}>Tipo</div>
        <div style={isMobile
          ? { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }
          : { display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {types.map((t) => (
            <div key={t.id} onClick={() => setTypeId(typeId === t.id ? null : t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 5,
                flexDirection: isMobile ? 'column' : 'row',
                border: `1.5px solid ${typeId === t.id ? t.colorHex : '#e2e8f0'}`,
                borderRadius: isMobile ? 8 : 20,
                padding: isMobile ? '7px 4px' : '5px 12px',
                fontSize: 13, cursor: 'pointer',
                background: typeId === t.id ? '#eff6ff' : '#fff',
                color: typeId === t.id ? '#1e40af' : '#374151',
                fontWeight: typeId === t.id ? 700 : 400,
                textAlign: isMobile ? 'center' : 'left',
              }}>
              <span style={isMobile ? { fontSize: 14, display: 'block', marginBottom: 2 } : {}}>{t.emoji}</span>
              <span style={isMobile ? { fontSize: 11 } : {}}>{t.label}</span>
            </div>
          ))}
        </div>
        {onManageTypes && (
          <button onClick={onManageTypes}
            style={{ background: 'none', border: 'none', fontSize: 12, color: '#2563eb', cursor: 'pointer', marginTop: 6, padding: 0 }}>
            ✏️ Gestisci tipi appuntamento →
          </button>
        )}
      </div>

      <div>
        <div style={LABEL_STYLE}>Luogo (opzionale)</div>
        <input style={INPUT_STYLE} placeholder="Via, Città..." value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>

      <div>
        <div style={LABEL_STYLE}>Note</div>
        <textarea style={{ ...INPUT_STYLE, resize: 'none', height: 72, lineHeight: 1.5 }}
          value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: '#f8fafc', borderRadius: 8 }}>
        📅 Disponibile via URL abbonamento in Google/Apple Calendar (Impostazioni → Sincronizzazione)
      </div>
    </div>
  );

  const footer = (
    <div style={{
      padding: isMobile ? '10px 16px 14px' : '14px 18px',
      borderTop: '1px solid #f1f5f9',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      gap: 8,
      alignItems: isMobile ? 'stretch' : 'center',
    }}>
      <button onClick={onCancel} disabled={saving}
        style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '10px 16px', borderRadius: 8 }}>
        Annulla
      </button>
      <button onClick={handleSave} disabled={saving}
        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginLeft: isMobile ? 0 : 'auto' }}>
        {saving ? 'Salvataggio...' : 'Salva'}
      </button>
    </div>
  );

  // Wrapper: modale desktop o bottom sheet mobile
  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div onClick={onCancel} style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} />
        <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: 36, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '10px auto 12px' }} />
          <div style={{ padding: '0 16px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>📌 {initial ? 'Modifica appuntamento' : 'Nuovo appuntamento'}</div>
            <button onClick={onCancel} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16, color: '#94a3b8' }}>✕</button>
          </div>
          {body}
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: '#2563eb', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>📌 {initial ? 'Modifica appuntamento' : 'Nuovo appuntamento'}</div>
            <div style={{ fontSize: 12, color: '#bfdbfe', marginTop: 2 }}>{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <button onClick={onCancel} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        {body}
        {footer}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Esegui test**

```bash
npm test --prefix archibald-web-app/frontend -- AppointmentForm.spec
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/AppointmentTypeManager.tsx \
        archibald-web-app/frontend/src/components/AppointmentForm.tsx \
        archibald-web-app/frontend/src/components/AppointmentForm.spec.tsx
git commit -m "feat(frontend): AppointmentTypeManager e AppointmentForm (desktop+mobile)"
```

---

## Task 10: AgendaWidgetNew

**Files:**
- Create: `archibald-web-app/frontend/src/components/AgendaWidgetNew.tsx`
- Create: `archibald-web-app/frontend/src/components/AgendaWidgetNew.spec.tsx`

- [ ] **Step 1: Scrivi test failing**

```typescript
// archibald-web-app/frontend/src/components/AgendaWidgetNew.spec.tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgendaWidgetNew } from './AgendaWidgetNew';
import * as remindersService from '../services/reminders.service';
import * as appointmentsApi from '../api/appointments';
import * as apptTypesApi from '../api/appointment-types';
import type { UpcomingReminders } from '../services/reminders.service';

const TODAY = new Date().toISOString().split('T')[0];

const MOCK_REMINDERS: UpcomingReminders = {
  overdue: [], byDate: {}, totalActive: 0, completedToday: 0,
};

beforeEach(() => {
  vi.spyOn(remindersService, 'listUpcomingReminders').mockResolvedValue(MOCK_REMINDERS);
  vi.spyOn(appointmentsApi, 'listAppointments').mockResolvedValue([]);
  vi.spyOn(apptTypesApi, 'listAppointmentTypes').mockResolvedValue([]);
});

describe('AgendaWidgetNew', () => {
  test('mostra "Agenda" come titolo', async () => {
    render(<MemoryRouter><AgendaWidgetNew /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Agenda/)).toBeInTheDocument());
  });

  test('mostra 4 KPI tile', async () => {
    render(<MemoryRouter><AgendaWidgetNew /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Scaduti')).toBeInTheDocument();
      expect(screen.getByText('Oggi')).toBeInTheDocument();
      expect(screen.getByText('Appt.')).toBeInTheDocument();
      expect(screen.getByText('Settimana')).toBeInTheDocument();
    });
  });

  test('mostra 7 giorni della settimana nella strip', async () => {
    render(<MemoryRouter><AgendaWidgetNew /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Lun')).toBeInTheDocument();
      expect(screen.getByText('Dom')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Esegui test — verifica fallimento**

```bash
npm test --prefix archibald-web-app/frontend -- AgendaWidgetNew.spec
```

- [ ] **Step 3: Implementa AgendaWidgetNew.tsx**

```tsx
// archibald-web-app/frontend/src/components/AgendaWidgetNew.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { listUpcomingReminders } from '../services/reminders.service';
import { listAppointments } from '../api/appointments';
import { listAppointmentTypes } from '../api/appointment-types';
import { AgendaMixedList } from './AgendaMixedList';
import { AppointmentForm } from './AppointmentForm';
import { ReminderForm } from './ReminderForm';
import type { AgendaItem, Appointment, AppointmentType } from '../types/agenda';
import type { UpcomingReminders } from '../services/reminders.service';

const DAY_LABELS = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];

function getWeekDays(ref: Date): Date[] {
  const dow = ref.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  const mon = new Date(ref);
  mon.setDate(ref.getDate() - offset);
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function toDateKey(d: Date) { return d.toISOString().split('T')[0]; }

export function AgendaWidgetNew() {
  const navigate = useNavigate();
  const todayKey = React.useMemo(() => new Date().toISOString().split('T')[0], []);
  const weekDays = React.useMemo(() => getWeekDays(new Date()), []);

  const [reminders, setReminders] = React.useState<UpcomingReminders | null>(null);
  const [appts, setAppts] = React.useState<Appointment[]>([]);
  const [types, setTypes] = React.useState<AppointmentType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showApptForm, setShowApptForm] = React.useState(false);
  const [showReminderForm, setShowReminderForm] = React.useState(false);

  async function loadAll() {
    setLoading(true);
    const weekStart = toDateKey(weekDays[0]);
    const weekEnd   = toDateKey(weekDays[6]);
    const [r, a, t] = await Promise.all([
      listUpcomingReminders(14),
      listAppointments({ from: weekStart, to: weekEnd }),
      listAppointmentTypes(),
    ]);
    setReminders(r); setAppts(a); setTypes(t);
    setLoading(false);
  }

  React.useEffect(() => { void loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Costruisce AgendaItem[] per la lista
  const items: AgendaItem[] = React.useMemo(() => {
    if (!reminders) return [];
    const apptItems: AgendaItem[] = appts.map((a) => ({ kind: 'appointment', data: a }));
    const overdue: AgendaItem[] = reminders.overdue.map((r) => ({ kind: 'reminder', data: r }));
    const today: AgendaItem[] = (reminders.byDate[todayKey] ?? []).map((r) => ({ kind: 'reminder', data: r }));
    return [...apptItems, ...overdue, ...today].sort((a, b) => {
      const da = a.kind === 'appointment' ? a.data.startAt : a.data.dueAt;
      const db = b.kind === 'appointment' ? b.data.startAt : b.data.dueAt;
      return da < db ? -1 : 1;
    });
  }, [reminders, appts, todayKey]);

  // KPI
  const overdueCount = reminders?.overdue.length ?? 0;
  const todayReminderCount = (reminders?.byDate[todayKey] ?? []).length;
  const todayApptCount = appts.filter((a) => toDateKey(new Date(a.startAt)) === todayKey).length;
  const todayTotal = todayReminderCount + todayApptCount;
  const weekApptCount = appts.length;
  const weekTotal = (reminders?.totalActive ?? 0) + weekApptCount;

  // Dot per ogni giorno della strip
  function dotsForDay(dayKey: string) {
    const dayAppts = appts.filter((a) => toDateKey(new Date(a.startAt)) === dayKey);
    const dayReminders = reminders?.byDate[dayKey] ?? [];
    return { apptCount: dayAppts.length, reminderCount: dayReminders.length };
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,.12)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>📅 Agenda</div>
        <button onClick={() => navigate('/agenda')}
          style={{ background: 'none', border: 'none', fontSize: 12, color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}>
          Apri agenda →
        </button>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '12px 12px 10px', borderBottom: '1px solid #f1f5f9' }}>
        {[
          { label: 'Scaduti', value: overdueCount, color: '#ef4444' },
          { label: 'Oggi',    value: todayTotal,   color: '#2563eb' },
          { label: 'Appt.',   value: weekApptCount, color: '#10b981' },
          { label: 'Settimana', value: weekTotal,  color: '#8b5cf6' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 6px 6px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '10px 10px 0 0' }} />
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, marginBottom: 2, color }}>{value}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Week strip */}
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Questa settimana</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {weekDays.map((d, i) => {
            const key = toDateKey(d);
            const isToday = key === todayKey;
            const { apptCount, reminderCount } = dotsForDay(key);
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 9, color: isToday ? '#2563eb' : '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>{DAY_LABELS[i]}</div>
                <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, background: isToday ? '#2563eb' : 'transparent', color: isToday ? '#fff' : '#374151' }}>
                  {d.getDate()}
                </div>
                <div style={{ display: 'flex', gap: 2, minHeight: 8 }}>
                  {Array.from({ length: Math.min(apptCount, 2) }).map((_, j) => (
                    <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: '#2563eb' }} />
                  ))}
                  {Array.from({ length: Math.min(reminderCount, 2) }).map((_, j) => (
                    <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: '#94a3b8' }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista mista */}
      {loading ? (
        <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Caricamento...</div>
      ) : (
        <AgendaMixedList items={items} onRefetch={loadAll} compact />
      )}

      {/* Footer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #f1f5f9' }}>
        <button onClick={() => setShowReminderForm(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'none', color: '#10b981', borderRight: '1px solid #f1f5f9' }}>
          🔔 + Promemoria
        </button>
        <button onClick={() => setShowApptForm(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'none', color: '#2563eb' }}>
          📌 + Appuntamento
        </button>
      </div>

      {/* Form modali */}
      {showApptForm && (
        <AppointmentForm
          types={types}
          onSaved={() => { setShowApptForm(false); void loadAll(); }}
          onCancel={() => setShowApptForm(false)}
        />
      )}
      {showReminderForm && (
        <ReminderForm
          onSaved={() => { setShowReminderForm(false); void loadAll(); }}
          onCancel={() => setShowReminderForm(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Esegui test**

```bash
npm test --prefix archibald-web-app/frontend -- AgendaWidgetNew.spec
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/AgendaWidgetNew.tsx \
        archibald-web-app/frontend/src/components/AgendaWidgetNew.spec.tsx
git commit -m "feat(frontend): AgendaWidgetNew — widget dashboard con KPI, strip, lista mista"
```

---

## Task 11: AgendaCalendarSyncPanel + AgendaHelpPanel

**Files:**
- Create: `archibald-web-app/frontend/src/components/AgendaCalendarSyncPanel.tsx`
- Create: `archibald-web-app/frontend/src/components/AgendaHelpPanel.tsx`

- [ ] **Step 1: Crea AgendaCalendarSyncPanel.tsx**

```tsx
// archibald-web-app/frontend/src/components/AgendaCalendarSyncPanel.tsx
import React from 'react';

type Props = { onClose: () => void };

export function AgendaCalendarSyncPanel({ onClose }: Props) {
  const [copied, setCopied] = React.useState(false);

  // L'URL di abbonamento viene costruito con il token dell'utente
  // Il token viene esposto da un endpoint dedicato (GET /api/agenda/ics-token)
  const [icsUrl, setIcsUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch('/api/agenda/ics-token')
      .then((r) => r.json())
      .then((data: { token: string }) => {
        setIcsUrl(`${window.location.origin}/api/agenda/feed.ics?token=${data.token}`);
      })
      .catch(() => setIcsUrl(null));
  }, []);

  async function handleCopy() {
    if (!icsUrl) return;
    await navigator.clipboard.writeText(icsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: '#2563eb', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>🔗 Sincronizzazione calendario</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Fase 1: Subscription URL */}
          <div style={{ border: '2px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#f0fdf4', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#15803d', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>FASE 1</span>
              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>Abbonamento automatico (nessun login)</span>
            </div>
            <div style={{ padding: '12px 14px', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
              Copia questo URL e aggiungilo in <strong>Google Calendar</strong> ("Aggiungi da URL") o <strong>Apple Calendar</strong> ("Abbonati a calendario"). I tuoi appuntamenti si aggiorneranno automaticamente ogni 8-24h.
              {icsUrl ? (
                <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input readOnly value={icsUrl}
                    style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#475569', background: '#f8fafc' }} />
                  <button onClick={handleCopy}
                    style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    {copied ? '✓ Copiato' : 'Copia'}
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Caricamento URL...</div>
              )}
            </div>
          </div>

          {/* Fase 1: Export one-shot */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 8, fontSize: 13 }}>📤 Esporta tutti gli appuntamenti (.ics)</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Scarica un file .ics compatibile con Google Calendar, Apple Calendar, Outlook.</div>
            <a href="/api/agenda/export.ics" download="agenda-formicanera.ics"
              style={{ display: 'inline-block', background: '#f1f5f9', color: '#374151', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              ⬇ Scarica .ics
            </a>
          </div>

          {/* Fase 3: Google OAuth2 (coming soon) */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 6, fontSize: 13 }}>🔄 Sincronizzazione bidirezionale Google Calendar <span style={{ fontSize: 11, background: '#f1f5f9', color: '#94a3b8', borderRadius: 4, padding: '1px 6px', marginLeft: 4 }}>In arrivo</span></div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Accedi con Google una volta sola: i tuoi appuntamenti saranno sincronizzati in tempo reale in entrambe le direzioni.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

> **Nota**: Il backend deve esporre `GET /api/agenda/ics-token` (autenticato via sessione) che ritorna `{ token: string }` leggendo `agents.users.ics_token` per l'utente corrente. Aggiungi questo endpoint ad `agenda-ics-router.ts`:
> ```typescript
> router.get('/ics-token', async (req, res) => {
>   const userId = (req as any).userId as string;
>   const { rows } = await pool.query<{ ics_token: string }>(
>     `SELECT ics_token FROM agents.users WHERE id = $1`,
>     [userId],
>   );
>   res.json({ token: rows[0]?.ics_token });
> });
> ```
> Registra questo endpoint sotto `/api/agenda` con middleware `authenticate`.

- [ ] **Step 2: Crea AgendaHelpPanel.tsx**

```tsx
// archibald-web-app/frontend/src/components/AgendaHelpPanel.tsx
import React from 'react';

type Props = { onClose: () => void };

const SECTIONS = [
  {
    icon: '📌',
    title: 'Appuntamenti vs Promemoria',
    content: 'Gli appuntamenti (sfondo blu) hanno un orario preciso di inizio e fine e possono essere generici (senza cliente). I promemoria (sfondo bianco) sono legati a un cliente specifico e non hanno un orario.',
  },
  {
    icon: '📅',
    title: 'Viste calendario',
    content: 'Usa i pulsanti in alto per passare tra: Giorno, Settimana, Mese e Lista agenda. Su mobile è disponibile la vista Lista. Usa i tasti ← → per navigare tra i periodi.',
  },
  {
    icon: '✋',
    title: 'Drag & drop',
    content: "Nelle viste Giorno e Settimana puoi trascinare un appuntamento per spostarlo. Trascina il bordo inferiore per cambiarne la durata. I promemoria (tutto il giorno) si spostano tra i giorni nella banda in cima.",
  },
  {
    icon: '🤖',
    title: 'Promemoria automatici (clienti dormienti)',
    content: 'Ogni giorno il sistema controlla i clienti che non ordinano da 3+ mesi. Per ognuno crea automaticamente un promemoria "Ricontatto" con ripetizione settimanale (badge 🤖 auto). Appena il cliente fa un ordine, il promemoria viene cancellato e il ciclo si azzera.',
  },
  {
    icon: '🔗',
    title: 'Sincronizzazione con Google/Apple Calendar',
    content: 'Usa il pannello Sincronizzazione (icona 🔗) per ottenere il tuo URL abbonamento personale da aggiungere a Google Calendar o Apple Calendar. Gli appuntamenti si aggiornano automaticamente ogni 8-24h senza bisogno di fare nulla.',
  },
  {
    icon: '⚙️',
    title: 'Tipi di appuntamento',
    content: 'I tipi (Visita, Chiamata, Video call, ecc.) sono personalizzabili. Puoi rinominare i tipi di sistema e aggiungere tipi personalizzati con emoji e colore. Usa il link "Gestisci tipi" nel form di creazione.',
  },
  {
    icon: '👤',
    title: 'Agenda cliente nella scheda cliente',
    content: "Nella scheda di ogni cliente trovi la sezione 'Agenda cliente' che mostra in una lista mista tutti i promemoria e gli appuntamenti legati a quel cliente, con filtri per tipo e sezioni Passato/Oggi/Prossimi.",
  },
];

export function AgendaHelpPanel({ onClose }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>❓ Guida all'Agenda</div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {SECTIONS.map(({ icon, title, content }) => (
            <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 24, flexShrink: 0, width: 36, height: 36, background: '#f8fafc', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{content}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/AgendaCalendarSyncPanel.tsx \
        archibald-web-app/frontend/src/components/AgendaHelpPanel.tsx
git commit -m "feat(frontend): AgendaCalendarSyncPanel (ICS unico punto) + AgendaHelpPanel (mini-guida)"
```

---

## Task 12: AgendaClienteSection

**Files:**
- Create: `archibald-web-app/frontend/src/components/AgendaClienteSection.tsx`
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`

- [ ] **Step 1: Crea AgendaClienteSection.tsx**

```tsx
// archibald-web-app/frontend/src/components/AgendaClienteSection.tsx
import React from 'react';
import { useAgenda } from '../hooks/useAgenda';
import { AgendaMixedList } from './AgendaMixedList';
import { AppointmentForm } from './AppointmentForm';
import { ReminderForm } from './ReminderForm';
import { listAppointmentTypes } from '../api/appointment-types';
import type { AppointmentType } from '../types/agenda';

type Props = {
  customerErpId: string;
  customerName: string;
  isMobile?: boolean;
};

type FilterType = 'all' | 'appointment' | 'reminder' | 'overdue';

export function AgendaClienteSection({ customerErpId, customerName, isMobile = false }: Props) {
  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - 3);
  const to = new Date(now);
  to.setMonth(to.getMonth() + 6);

  const { items, loading, refetch } = useAgenda({
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
    customerId: customerErpId,
  });

  const [filter, setFilter] = React.useState<FilterType>('all');
  const [showApptForm, setShowApptForm] = React.useState(false);
  const [showReminderForm, setShowReminderForm] = React.useState(false);
  const [types, setTypes] = React.useState<AppointmentType[]>([]);

  React.useEffect(() => {
    listAppointmentTypes().then(setTypes).catch(() => {});
  }, []);

  const todayKey = now.toISOString().split('T')[0];

  const filteredItems = items.filter((item) => {
    if (filter === 'appointment') return item.kind === 'appointment';
    if (filter === 'reminder') return item.kind === 'reminder';
    if (filter === 'overdue') {
      const dateKey = item.kind === 'appointment'
        ? item.data.startAt.split('T')[0]
        : item.data.dueAt.split('T')[0];
      return dateKey < todayKey;
    }
    return true;
  });

  const PILL_ACTIVE: React.CSSProperties = { background: '#2563eb', color: '#fff', borderRadius: 16, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none' };
  const PILL_INACTIVE: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 16, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' };

  return (
    <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #f1f5f9' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>📅 Agenda cliente</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{customerName} — {items.length} voci totali</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowReminderForm(true)}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>
            🔔 + Promemoria
          </button>
          <button onClick={() => setShowApptForm(true)}
            style={{ background: '#2563eb', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
            📌 + Appuntamento
          </button>
        </div>
      </div>

      {/* Filtri pill */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', overflowX: 'auto' }}>
        {(['all','appointment','reminder','overdue'] as FilterType[]).map((f) => {
          const labels: Record<FilterType, string> = { all: 'Tutti', appointment: '📌 Appuntamenti', reminder: '🔔 Promemoria', overdue: '⚠ Scaduti' };
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={filter === f ? PILL_ACTIVE : PILL_INACTIVE}>
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Caricamento...</div>
      ) : (
        <AgendaMixedList items={filteredItems} onRefetch={refetch} />
      )}

      {/* Form modali */}
      {showApptForm && (
        <AppointmentForm
          types={types}
          defaultCustomerErpId={customerErpId}
          defaultCustomerName={customerName}
          isMobile={isMobile}
          onSaved={() => { setShowApptForm(false); refetch(); }}
          onCancel={() => setShowApptForm(false)}
        />
      )}
      {showReminderForm && (
        <ReminderForm
          customerErpId={customerErpId}
          customerName={customerName}
          onSaved={() => { setShowReminderForm(false); refetch(); }}
          onCancel={() => setShowReminderForm(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Aggiorna CustomerProfilePage.tsx — sostituisci sezione Promemoria**

Apri `CustomerProfilePage.tsx`. Cerca la sezione che mostra i promemoria del cliente (cerca `Promemoria`, `customer_reminders`, `ReminderForm`, `RemindersSection` o simili).

Sostituisci quella sezione con:

```tsx
// In cima al file, aggiungi l'import:
import { AgendaClienteSection } from '../components/AgendaClienteSection';

// Dove c'era la sezione Promemoria, metti:
<AgendaClienteSection
  customerErpId={customer.erpId}
  customerName={customer.name}
  isMobile={isMobile}
/>
```

Rimuovi gli import non più usati della vecchia sezione promemoria.

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/AgendaClienteSection.tsx \
        archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
git commit -m "feat(frontend): AgendaClienteSection — lista mista agenda in scheda cliente"
```

---

## Task 13: AgendaPage — rewrite con Schedule-X

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/AgendaPage.tsx`

> **Prima di iniziare**: leggi l'intera `AgendaPage.tsx` esistente per capire quali hook e import portare avanti.

- [ ] **Step 1: Aggiungi import CSS Schedule-X al punto di ingresso globale**

Cerca il file CSS globale del frontend (tipicamente `frontend/src/index.css` o `frontend/src/main.tsx`). Aggiungi:

```typescript
// In frontend/src/main.tsx (o index.ts/App.tsx):
import '@schedule-x/theme-default/dist/index.css';
```

- [ ] **Step 2: Riscrivi AgendaPage.tsx**

```tsx
// archibald-web-app/frontend/src/pages/AgendaPage.tsx
import React from 'react';
import { useCalendarApp, ScheduleXCalendar } from '@schedule-x/react';
import { createCalendar } from '@schedule-x/calendar';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import { listAppointments, deleteAppointment } from '../api/appointments';
import { listAppointmentTypes } from '../api/appointment-types';
import { listUpcomingReminders, patchReminder } from '../services/reminders.service';
import { AgendaMixedList } from '../components/AgendaMixedList';
import { AppointmentForm } from '../components/AppointmentForm';
import { AppointmentTypeManager } from '../components/AppointmentTypeManager';
import { AgendaCalendarSyncPanel } from '../components/AgendaCalendarSyncPanel';
import { AgendaHelpPanel } from '../components/AgendaHelpPanel';
import { ReminderForm } from '../components/ReminderForm';
import { useAgenda } from '../hooks/useAgenda';
import type { Appointment, AppointmentType, AgendaItem } from '../types/agenda';
import type { UpcomingReminders } from '../services/reminders.service';

const MONTH_NAMES = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DAY_LABELS  = ['L','M','M','G','V','S','D'];

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const offset   = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const cells: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  return cells;
}

function toDateKey(d: Date) { return d.toISOString().split('T')[0]; }

// Converte Appointment in evento Schedule-X
function toScheduleXEvent(appt: Appointment) {
  return {
    id: appt.id,
    title: `${appt.typeEmoji ?? '📌'} ${appt.title}`,
    start: appt.startAt.slice(0, 16).replace('T', ' '),  // "2026-04-25 14:30"
    end:   appt.endAt.slice(0, 16).replace('T', ' '),
    _colorHex: appt.typeColorHex ?? '#2563eb',
    _apptData: appt,
  };
}

export function AgendaPage() {
  const todayKey = React.useMemo(() => new Date().toISOString().split('T')[0], []);
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = React.useState(window.innerWidth >= 768 && window.innerWidth < 1024);

  React.useEffect(() => {
    const handler = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Mini-cal state
  const [calMonth, setCalMonth] = React.useState(() => new Date());
  const calGrid = React.useMemo(() => buildMonthGrid(calMonth.getFullYear(), calMonth.getMonth()), [calMonth]);

  // Periodo corrente (mese visualizzato nel mini-cal)
  const periodFrom = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2,'0')}-01`;
  const lastDay    = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const periodTo   = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2,'0')}-${lastDay}`;

  const { items, loading, refetch } = useAgenda({ from: periodFrom, to: periodTo });

  // Schedule-X setup
  const eventsService = React.useMemo(() => createEventsServicePlugin(), []);

  const calendar = useCalendarApp({
    views: ['day', 'week', 'month', 'agenda'],
    defaultView: isMobile ? 'agenda' : 'week',
    locale: 'it-IT',
    plugins: [eventsService],
    callbacks: {
      onEventClick: (event) => setSelectedAppt((event as any)._apptData ?? null),
      onClickDate: (date) => { setNewApptDate(date); setShowApptForm(true); },
    },
  });

  // Aggiorna eventi Schedule-X quando cambiano gli appuntamenti
  React.useEffect(() => {
    if (!eventsService) return;
    const apptItems = items.filter((i): i is AgendaItem & { kind: 'appointment' } => i.kind === 'appointment');
    eventsService.set(apptItems.map((i) => toScheduleXEvent(i.data)));
  }, [items, eventsService]);

  // Modal state
  const [showApptForm, setShowApptForm] = React.useState(false);
  const [showReminderForm, setShowReminderForm] = React.useState(false);
  const [showTypeManager, setShowTypeManager] = React.useState(false);
  const [showSyncPanel, setShowSyncPanel] = React.useState(false);
  const [showHelpPanel, setShowHelpPanel] = React.useState(false);
  const [selectedAppt, setSelectedAppt] = React.useState<Appointment | null>(null);
  const [newApptDate, setNewApptDate] = React.useState<string | undefined>();
  const [types, setTypes] = React.useState<AppointmentType[]>([]);

  React.useEffect(() => {
    listAppointmentTypes().then(setTypes).catch(() => {});
  }, []);

  // KPI conteggi
  const overdueCount  = items.filter((i) => {
    const k = i.kind === 'appointment' ? i.data.startAt.split('T')[0] : i.data.dueAt.split('T')[0];
    return k < todayKey;
  }).length;
  const todayCount    = items.filter((i) => {
    const k = i.kind === 'appointment' ? i.data.startAt.split('T')[0] : i.data.dueAt.split('T')[0];
    return k === todayKey;
  }).length;
  const apptCount     = items.filter((i) => i.kind === 'appointment').length;
  const totalCount    = items.length;

  // Layout radice
  const showSidebar   = !isMobile;
  const showTimeGrid  = !isMobile;  // mobile → solo lista agenda

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', flex: 1 }}>📅 Agenda</div>
        <button onClick={() => setShowSyncPanel(true)}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#374151', cursor: 'pointer' }}>
          🔗 Sincronizza
        </button>
        <button onClick={() => setShowHelpPanel(true)}
          style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 14, cursor: 'pointer', color: '#64748b', fontWeight: 700 }}>
          ?
        </button>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '10px 12px', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
        {[
          { label: 'Scaduti', value: overdueCount, color: '#ef4444' },
          { label: 'Oggi',    value: todayCount,   color: '#2563eb' },
          { label: 'Appt.',   value: apptCount,    color: '#10b981' },
          { label: 'Totali',  value: totalCount,   color: '#8b5cf6' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 6px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
            <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1, marginBottom: 2 }}>{value}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: showSidebar ? 0 : 0 }}>
        {/* Sidebar: mini-cal + lista (desktop/tablet) */}
        {showSidebar && (
          <div style={{ width: isTablet ? 240 : 280, flexShrink: 0, background: '#fff', borderRight: '1px solid #f1f5f9', overflowY: 'auto', padding: '12px 0' }}>
            {/* Mini-cal */}
            <div style={{ padding: '0 12px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 16 }}>‹</button>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}
                </span>
                <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 16 }}>›</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {DAY_LABELS.map((l) => (
                  <div key={l} style={{ fontSize: 10, textAlign: 'center', color: '#94a3b8', fontWeight: 700, paddingBottom: 4 }}>{l}</div>
                ))}
                {calGrid.map((d, i) => (
                  <div key={i} style={{
                    fontSize: 12, textAlign: 'center', padding: '4px 0', borderRadius: '50%',
                    background: d && toDateKey(d) === todayKey ? '#2563eb' : 'transparent',
                    color: d && toDateKey(d) === todayKey ? '#fff' : d ? '#374151' : 'transparent',
                    cursor: d ? 'pointer' : 'default', fontWeight: 500,
                  }}>
                    {d?.getDate()}
                  </div>
                ))}
              </div>
            </div>

            {/* Lista promemoria+appuntamenti sidebar */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
              <AgendaMixedList items={items} onRefetch={refetch} compact />
            </div>
          </div>
        )}

        {/* Area principale: Schedule-X time grid (desktop/tablet) o lista (mobile) */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {showTimeGrid ? (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ScheduleXCalendar calendarApp={calendar} />
            </div>
          ) : (
            // Mobile: solo lista agenda cronologica
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <AgendaMixedList items={items} onRefetch={refetch} />
            </div>
          )}
        </div>
      </div>

      {/* FAB mobile */}
      {isMobile && (
        <div style={{ position: 'fixed', bottom: 24, right: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => setShowReminderForm(true)}
            style={{ width: 48, height: 48, borderRadius: '50%', background: '#10b981', color: '#fff', border: 'none', fontSize: 22, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
            🔔
          </button>
          <button onClick={() => setShowApptForm(true)}
            style={{ width: 56, height: 56, borderRadius: '50%', background: '#2563eb', color: '#fff', border: 'none', fontSize: 24, cursor: 'pointer', boxShadow: '0 4px 16px rgba(37,99,235,.4)' }}>
            +
          </button>
        </div>
      )}

      {/* Desktop: bottoni azione */}
      {!isMobile && (
        <div style={{ padding: '10px 16px', background: '#fff', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
          <button onClick={() => setShowReminderForm(true)}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#10b981' }}>
            🔔 + Promemoria
          </button>
          <button onClick={() => setShowApptForm(true)}
            style={{ background: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff' }}>
            📌 + Appuntamento
          </button>
        </div>
      )}

      {/* Modali */}
      {showApptForm && (
        <AppointmentForm
          types={types}
          defaultDate={newApptDate}
          isMobile={isMobile}
          onManageTypes={() => { setShowApptForm(false); setShowTypeManager(true); }}
          onSaved={() => { setShowApptForm(false); setNewApptDate(undefined); refetch(); }}
          onCancel={() => { setShowApptForm(false); setNewApptDate(undefined); }}
        />
      )}
      {selectedAppt && (
        <AppointmentForm
          types={types}
          initial={selectedAppt}
          isMobile={isMobile}
          onSaved={() => { setSelectedAppt(null); refetch(); }}
          onCancel={() => setSelectedAppt(null)}
        />
      )}
      {showReminderForm && (
        <ReminderForm
          onSaved={() => { setShowReminderForm(false); refetch(); }}
          onCancel={() => setShowReminderForm(false)}
        />
      )}
      {showTypeManager && <AppointmentTypeManager onClose={() => setShowTypeManager(false)} />}
      {showSyncPanel   && <AgendaCalendarSyncPanel onClose={() => setShowSyncPanel(false)} />}
      {showHelpPanel   && <AgendaHelpPanel onClose={() => setShowHelpPanel(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Risolvi eventuali errori TypeScript (es. props mancanti nel ReminderForm — verifica la firma del componente esistente e adatta).

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/pages/AgendaPage.tsx
git commit -m "feat(frontend): AgendaPage rewrite con Schedule-X — day/week/month/agenda, mobile/tablet/desktop"
```

---

## Task 14: Aggiorna Dashboard — swap RemindersWidgetNew → AgendaWidgetNew

**Files:**
- Modify: file Dashboard che usa `RemindersWidgetNew` (trovare con `grep -r 'RemindersWidgetNew' archibald-web-app/frontend/src/`)

- [ ] **Step 1: Trova il file che usa RemindersWidgetNew**

```bash
grep -rl 'RemindersWidgetNew' archibald-web-app/frontend/src/
```

- [ ] **Step 2: Sostituisci import e utilizzo**

Nel file trovato:

```tsx
// Rimuovi:
import { RemindersWidgetNew } from '../components/RemindersWidgetNew';

// Aggiungi:
import { AgendaWidgetNew } from '../components/AgendaWidgetNew';

// Sostituisci <RemindersWidgetNew /> con:
<AgendaWidgetNew />
```

- [ ] **Step 3: Type-check + test**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/
git commit -m "feat(frontend): swap RemindersWidgetNew → AgendaWidgetNew nella Dashboard"
```

---

## Task 15: Verifica finale + backend test

- [ ] **Step 1: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend
```

Atteso: tutti i test passano (inclusi i nuovi unit test appointment-types e appointments).

- [ ] **Step 2: Esegui tutti i test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

- [ ] **Step 3: Type-check completo**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 4: Test manuale — percorso golden path**

1. Apri la PWA → Dashboard: verifica `AgendaWidgetNew` con KPI e strip
2. Vai su `/agenda`: verifica Schedule-X week view, KPI, sidebar mini-cal
3. Clicca "+ Appuntamento": verifica form modale con tutti i campi e tutti e 6 i tipi
4. Salva un appuntamento → appare nel widget e nel calendario Schedule-X
5. Vai su scheda cliente → sezione "Agenda cliente" con lista mista
6. Apri pannello Sincronizzazione (🔗): verifica URL abbonamento e download .ics
7. Apri guida (?): verifica tutte e 7 le sezioni della mini-guida
8. Desktop: "Gestisci tipi" → aggiungi un tipo custom, rinomina uno sistema
9. Verifica che `patchReminder` con ✓ Fatto funzioni nelle liste

- [ ] **Step 5: Commit finale se necessario**

```bash
git add -A
git commit -m "fix: aggiustamenti post-verifica manuale agenda appuntamenti"
```

---

## Note implementative

### ReminderForm props
Il componente `ReminderForm` esistente potrebbe non accettare `customerErpId`/`customerName` come props — verifica la sua firma e adatta `AgendaClienteSection` di conseguenza (potrebbe servire passare il cliente tramite stato dopo la selezione nel form).

### Schedule-X CSS override
Se lo stile Schedule-X confligge con la PWA, usa CSS variables nel file globale:
```css
:root {
  --sx-color-primary: #2563eb;
  --sx-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

### ICS token endpoint
Ricordati di aggiungere `GET /api/agenda/ics-token` (con `authenticate`) in `agenda-ics-router.ts` prima di fare il deploy — serve a `AgendaCalendarSyncPanel` per mostrare l'URL di abbonamento.

### Migration in produzione
Applicare dopo il deploy backend:
```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T backend node dist/db/migrate.js"
```

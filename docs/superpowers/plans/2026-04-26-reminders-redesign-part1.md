# Reminders Redesign — Implementation Plan (Part 1: DB + Backend + Service)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare i tipi di promemoria da enum hardcoded a entità DB CRUD, aggiungere chip "Oggi", e preparare il backend per widget agenda e pagina /agenda.

**Architecture:** Migration 071 crea `agents.reminder_types`, backfilla `type_id` in `customer_reminders`, e rimuove la colonna `type`. Tutti i repository e route backend vengono aggiornati. Il service frontend espone le nuove API e i nuovi tipi TS.

**Tech Stack:** PostgreSQL (pg pool), Express, Zod, TypeScript strict, Vitest.

**Parte 2:** `docs/superpowers/plans/2026-04-26-reminders-redesign-part2.md` (componenti UI).

---

## File Map (Part 1)

| Azione | File |
|---|---|
| Create | `archibald-web-app/backend/src/db/migrations/071-reminder-types.sql` |
| Create | `archibald-web-app/backend/src/db/repositories/reminder-types.ts` |
| Create | `archibald-web-app/backend/src/db/repositories/reminder-types.spec.ts` |
| Modify | `archibald-web-app/backend/src/db/repositories/customer-reminders.ts` |
| Modify | `archibald-web-app/backend/src/db/repositories/customer-reminders.spec.ts` |
| Modify | `archibald-web-app/backend/src/routes/reminders.ts` |
| Modify | `archibald-web-app/backend/src/routes/customer-reminders.ts` |
| Modify | `archibald-web-app/frontend/src/services/reminders.service.ts` |
| Create | `archibald-web-app/frontend/src/services/reminders.service.spec.ts` |

---

## Task 1: Migration 071 — tabella reminder_types

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/071-reminder-types.sql`

- [ ] **Step 1: Scrivere la migration**

```sql
-- 071-reminder-types.sql
BEGIN;

CREATE TABLE agents.reminder_types (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '📋',
  color_bg   TEXT NOT NULL DEFAULT '#f1f5f9',
  color_text TEXT NOT NULL DEFAULT '#64748b',
  sort_order INT  NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_reminder_types_user
  ON agents.reminder_types(user_id)
  WHERE deleted_at IS NULL;

-- Seed 6 tipi default per ogni utente esistente
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

-- Aggiunge FK type_id
ALTER TABLE agents.customer_reminders
  ADD COLUMN type_id INT REFERENCES agents.reminder_types(id);

-- Backfill: mappa i valori stringa ai nuovi ID
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
ALTER TABLE agents.customer_reminders
  ALTER COLUMN type_id SET NOT NULL;

-- Rimuovi vecchia colonna type (con CHECK constraint)
ALTER TABLE agents.customer_reminders DROP COLUMN type;

COMMIT;
```

- [ ] **Step 2: Applicare su DB locale**

```bash
psql $DATABASE_URL -f archibald-web-app/backend/src/db/migrations/071-reminder-types.sql
```

Oppure via runner:
```bash
PG_HOST=localhost PG_PORT=5432 PG_DATABASE=archibald \
  npm run db:migrate --prefix archibald-web-app/backend
```

Atteso: `CREATE TABLE`, `CREATE INDEX`, `INSERT X`, `UPDATE X`, `ALTER TABLE` × 3.

- [ ] **Step 3: Verificare su DB locale**

```bash
psql $DATABASE_URL -c "
SELECT u.username, COUNT(rt.id) AS type_count
FROM agents.users u
JOIN agents.reminder_types rt ON rt.user_id = u.id
GROUP BY u.username;
"
```
Atteso: 6 righe per ogni agente.

```bash
psql $DATABASE_URL -c "
SELECT COUNT(*) AS senza_type_id
FROM agents.customer_reminders
WHERE type_id IS NULL;
"
```
Atteso: 0.

- [ ] **Step 4: Commit migration**

```bash
git add archibald-web-app/backend/src/db/migrations/071-reminder-types.sql
git commit -m "feat(db): migration 071 — reminder_types table with seed and backfill"
```

---

## Task 2: Backend repository `reminder-types.ts`

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/reminder-types.ts`
- Create: `archibald-web-app/backend/src/db/repositories/reminder-types.spec.ts`

- [ ] **Step 1: Scrivere il test (failing)**

Crea `archibald-web-app/backend/src/db/repositories/reminder-types.spec.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../pool';
import {
  listReminderTypes,
  createReminderType,
  updateReminderType,
  deleteReminderType,
} from './reminder-types';

const USER_ID = 'agent-001';

function makeTypeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: USER_ID,
    label: 'Ricontatto commerciale',
    emoji: '📞',
    color_bg: '#fee2e2',
    color_text: '#dc2626',
    sort_order: 1,
    deleted_at: null,
    ...overrides,
  };
}

function makePool(rows: unknown[]): DbPool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as DbPool;
}

describe('listReminderTypes', () => {
  test('mappa le colonne snake_case in camelCase', async () => {
    const pool = makePool([makeTypeRow()]);
    const result = await listReminderTypes(pool, USER_ID);
    expect(result).toEqual([{
      id: 1,
      userId: USER_ID,
      label: 'Ricontatto commerciale',
      emoji: '📞',
      colorBg: '#fee2e2',
      colorText: '#dc2626',
      sortOrder: 1,
      deletedAt: null,
    }]);
  });

  test('restituisce array vuoto se nessun tipo', async () => {
    const pool = makePool([]);
    expect(await listReminderTypes(pool, USER_ID)).toEqual([]);
  });
});

describe('createReminderType', () => {
  test('restituisce il record mappato', async () => {
    const pool = makePool([makeTypeRow({ id: 7, label: 'Visita', emoji: '🎯', sort_order: 7 })]);
    const result = await createReminderType(pool, USER_ID, {
      label: 'Visita', emoji: '🎯', colorBg: '#fff7ed', colorText: '#c2410c',
    });
    expect(result).toMatchObject({ id: 7, label: 'Visita', emoji: '🎯', sortOrder: 7 });
  });
});

describe('updateReminderType', () => {
  test('lancia errore se tipo non trovato', async () => {
    const pool = makePool([]);
    await expect(
      updateReminderType(pool, 99, USER_ID, { label: 'X' })
    ).rejects.toThrow('Reminder type not found');
  });

  test('restituisce il record aggiornato', async () => {
    const pool = makePool([makeTypeRow({ label: 'Aggiornato' })]);
    const result = await updateReminderType(pool, 1, USER_ID, { label: 'Aggiornato' });
    expect(result).toMatchObject({ label: 'Aggiornato' });
  });
});

describe('deleteReminderType', () => {
  test('restituisce il conteggio di usages attivi', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })
        .mockResolvedValueOnce({ rows: [] }),
    } as unknown as DbPool;
    expect(await deleteReminderType(pool, 1, USER_ID)).toEqual({ usages: 3 });
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Eseguire il test — verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- reminder-types.spec
```
Atteso: `Cannot find module './reminder-types'`.

- [ ] **Step 3: Implementare `reminder-types.ts`**

Crea `archibald-web-app/backend/src/db/repositories/reminder-types.ts`:

```ts
import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
type ReminderTypeId = Brand<number, 'ReminderTypeId'>;

type ReminderTypeRecord = {
  id: ReminderTypeId;
  userId: string;
  label: string;
  emoji: string;
  colorBg: string;
  colorText: string;
  sortOrder: number;
  deletedAt: Date | null;
};

type CreateReminderTypeInput = {
  label: string;
  emoji: string;
  colorBg: string;
  colorText: string;
};

type UpdateReminderTypeInput = Partial<CreateReminderTypeInput>;

type ReminderTypeRow = {
  id: number;
  user_id: string;
  label: string;
  emoji: string;
  color_bg: string;
  color_text: string;
  sort_order: number;
  deleted_at: Date | null;
};

function mapTypeRow(row: ReminderTypeRow): ReminderTypeRecord {
  return {
    id: row.id as ReminderTypeId,
    userId: row.user_id,
    label: row.label,
    emoji: row.emoji,
    colorBg: row.color_bg,
    colorText: row.color_text,
    sortOrder: row.sort_order,
    deletedAt: row.deleted_at,
  };
}

async function listReminderTypes(pool: DbPool, userId: string): Promise<ReminderTypeRecord[]> {
  const { rows } = await pool.query<ReminderTypeRow>(
    `SELECT * FROM agents.reminder_types
     WHERE user_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [userId],
  );
  return rows.map(mapTypeRow);
}

async function createReminderType(
  pool: DbPool,
  userId: string,
  input: CreateReminderTypeInput,
): Promise<ReminderTypeRecord> {
  const { rows } = await pool.query<ReminderTypeRow>(
    `INSERT INTO agents.reminder_types (user_id, label, emoji, color_bg, color_text, sort_order)
     SELECT $1, $2, $3, $4, $5, COALESCE(MAX(sort_order), 0) + 1
     FROM agents.reminder_types WHERE user_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [userId, input.label, input.emoji, input.colorBg, input.colorText],
  );
  return mapTypeRow(rows[0]);
}

async function updateReminderType(
  pool: DbPool,
  id: number,
  userId: string,
  input: UpdateReminderTypeInput,
): Promise<ReminderTypeRecord> {
  const { rows } = await pool.query<ReminderTypeRow>(
    `UPDATE agents.reminder_types
     SET label      = COALESCE($3, label),
         emoji      = COALESCE($4, emoji),
         color_bg   = COALESCE($5, color_bg),
         color_text = COALESCE($6, color_text)
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [id, userId, input.label ?? null, input.emoji ?? null, input.colorBg ?? null, input.colorText ?? null],
  );
  if (rows.length === 0) throw new Error('Reminder type not found');
  return mapTypeRow(rows[0]);
}

async function deleteReminderType(
  pool: DbPool,
  id: number,
  userId: string,
): Promise<{ usages: number }> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM agents.customer_reminders
     WHERE type_id = $1 AND user_id = $2 AND status IN ('active', 'snoozed')`,
    [id, userId],
  );
  await pool.query(
    `UPDATE agents.reminder_types SET deleted_at = NOW() WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return { usages: rows[0].count };
}

export {
  listReminderTypes,
  createReminderType,
  updateReminderType,
  deleteReminderType,
  type ReminderTypeId,
  type ReminderTypeRecord,
  type CreateReminderTypeInput,
  type UpdateReminderTypeInput,
};
```

- [ ] **Step 4: Eseguire il test — verificare che passi**

```bash
npm test --prefix archibald-web-app/backend -- reminder-types.spec
```
Atteso: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/reminder-types.ts \
        archibald-web-app/backend/src/db/repositories/reminder-types.spec.ts
git commit -m "feat(backend): repository reminder-types CRUD con soft-delete"
```

---

## Task 3: Aggiornare `customer-reminders.ts` (repository backend)

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/customer-reminders.ts`
- Modify: `archibald-web-app/backend/src/db/repositories/customer-reminders.spec.ts`

La modifica rimuove `ReminderType` string union, aggiunge `typeId`/`typeLabel`/`typeEmoji`/`typeColorBg`/`typeColorText`/`typeDeletedAt` a `Reminder`, aggiorna tutte le query con JOIN su `reminder_types`, e usa CTE per `createReminder`/`patchReminder` (RETURNING non supporta JOIN diretto).

- [ ] **Step 1: Aggiornare il test — `makeReminderRow` con campi tipo**

Nel file `customer-reminders.spec.ts`, sostituisci `makeReminderRow`:

```ts
function makeReminderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_REMINDER_ID,
    user_id: TEST_USER_ID,
    customer_erp_id: TEST_CUSTOMER_ERP_ID,
    type_id: 1,
    type_label: 'Ricontatto commerciale',
    type_emoji: '📞',
    type_color_bg: '#fee2e2',
    type_color_text: '#dc2626',
    type_deleted_at: null,
    priority: 'normal',
    due_at: BASE_DATE,
    recurrence_days: null,
    note: null,
    notify_via: 'app',
    status: 'active',
    snoozed_until: null,
    completed_at: null,
    completion_note: null,
    created_at: BASE_DATE,
    updated_at: BASE_DATE,
    ...overrides,
  };
}
```

E aggiorna i test esistenti per `createReminder` (ora accetta `typeId` invece di `type`):

```ts
describe('createReminder', () => {
  test('inserisce con typeId e restituisce Reminder mappato', async () => {
    const pool = makePool([makeReminderRow({ type_id: 3, type_label: 'Pagamento', type_emoji: '💰' })]);
    const result = await createReminder(pool, TEST_USER_ID, TEST_CUSTOMER_ERP_ID, {
      typeId: 3,
      dueAt: BASE_DATE,
    });
    expect(result).toMatchObject({
      typeId: 3,
      typeLabel: 'Pagamento',
      typeEmoji: '💰',
      typeColorBg: '#fee2e2',
    });
  });
});

describe('mapRow (via listCustomerReminders)', () => {
  test('mappa type fields da JOIN', async () => {
    const pool = makePool([makeReminderRow()]);
    const result = await listCustomerReminders(pool, TEST_USER_ID, TEST_CUSTOMER_ERP_ID, 'active');
    expect(result[0]).toMatchObject({
      typeId: 1,
      typeLabel: 'Ricontatto commerciale',
      typeEmoji: '📞',
      typeColorBg: '#fee2e2',
      typeColorText: '#dc2626',
      typeDeletedAt: null,
    });
  });
});
```

- [ ] **Step 2: Eseguire il test — verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- customer-reminders.spec
```
Atteso: type errors / test failures per i nuovi campi.

- [ ] **Step 3: Riscrivere `customer-reminders.ts`**

Sostituisci il file completo con:

```ts
import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
type ReminderId = Brand<number, 'ReminderId'>;

type ReminderStatus   = 'active' | 'snoozed' | 'done' | 'cancelled';
type ReminderPriority = 'urgent' | 'normal' | 'low';
type ReminderNotifyVia = 'app' | 'email';
type ReminderFilter    = 'active' | 'done' | 'all';

type Reminder = {
  id: ReminderId;
  userId: string;
  customerErpId: string;
  typeId: number;
  typeLabel: string;
  typeEmoji: string;
  typeColorBg: string;
  typeColorText: string;
  typeDeletedAt: Date | null;
  priority: ReminderPriority;
  dueAt: Date;
  recurrenceDays: number | null;
  note: string | null;
  notifyVia: ReminderNotifyVia;
  status: ReminderStatus;
  snoozedUntil: Date | null;
  completedAt: Date | null;
  completionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ReminderWithCustomer = Reminder & { customerName: string };

type TodayRemindersResult = {
  overdue: ReminderWithCustomer[];
  today: ReminderWithCustomer[];
  totalActive: number;
  completedToday: number;
};

type UpcomingRemindersResult = {
  overdue: ReminderWithCustomer[];
  byDate: Record<string, ReminderWithCustomer[]>;
  totalActive: number;
  completedToday: number;
};

type CreateReminderParams = {
  typeId: number;
  priority?: ReminderPriority;
  dueAt: Date;
  recurrenceDays?: number | null;
  note?: string | null;
  notifyVia?: ReminderNotifyVia;
};

type PatchReminderParams = {
  typeId?: number;
  priority?: ReminderPriority;
  dueAt?: Date;
  recurrenceDays?: number | null;
  note?: string | null;
  notifyVia?: ReminderNotifyVia;
  status?: ReminderStatus;
  snoozedUntil?: Date | null;
  completionNote?: string | null;
};

type ReminderRow = {
  id: number;
  user_id: string;
  customer_erp_id: string;
  type_id: number;
  type_label: string;
  type_emoji: string;
  type_color_bg: string;
  type_color_text: string;
  type_deleted_at: Date | null;
  priority: string;
  due_at: Date;
  recurrence_days: number | null;
  note: string | null;
  notify_via: string;
  status: string;
  snoozed_until: Date | null;
  completed_at: Date | null;
  completion_note: string | null;
  created_at: Date;
  updated_at: Date;
};

type ReminderWithCustomerRow = ReminderRow & { customer_name: string };

const TYPE_JOIN = `
  JOIN agents.reminder_types rt ON rt.id = cr.type_id`;

const TYPE_FIELDS = `
  rt.label AS type_label, rt.emoji AS type_emoji,
  rt.color_bg AS type_color_bg, rt.color_text AS type_color_text,
  rt.deleted_at AS type_deleted_at`;

function mapRow(row: ReminderRow): Reminder {
  return {
    id: row.id as ReminderId,
    userId: row.user_id,
    customerErpId: row.customer_erp_id,
    typeId: row.type_id,
    typeLabel: row.type_label,
    typeEmoji: row.type_emoji,
    typeColorBg: row.type_color_bg,
    typeColorText: row.type_color_text,
    typeDeletedAt: row.type_deleted_at,
    priority: row.priority as ReminderPriority,
    dueAt: row.due_at,
    recurrenceDays: row.recurrence_days,
    note: row.note,
    notifyVia: row.notify_via as ReminderNotifyVia,
    status: row.status as ReminderStatus,
    snoozedUntil: row.snoozed_until,
    completedAt: row.completed_at,
    completionNote: row.completion_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowWithCustomer(row: ReminderWithCustomerRow): ReminderWithCustomer {
  return { ...mapRow(row), customerName: row.customer_name };
}

function computeNextDueAt(completedAt: Date, recurrenceDays: number | null): Date | null {
  if (recurrenceDays === null) return null;
  const next = new Date(completedAt);
  next.setDate(next.getDate() + recurrenceDays);
  return next;
}

function isReminderEffectivelyActive(
  reminder: { status: string; snoozed_until: string | Date | null },
): boolean {
  if (reminder.status === 'snoozed' && reminder.snoozed_until !== null) {
    const until =
      typeof reminder.snoozed_until === 'string'
        ? new Date(reminder.snoozed_until)
        : reminder.snoozed_until;
    return until < new Date();
  }
  return reminder.status === 'active';
}

async function createReminder(
  pool: DbPool,
  userId: string,
  customerErpId: string,
  params: CreateReminderParams,
): Promise<Reminder> {
  const { rows } = await pool.query<ReminderRow>(
    `WITH ins AS (
       INSERT INTO agents.customer_reminders
         (user_id, customer_erp_id, type_id, priority, due_at, recurrence_days, note, notify_via)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *
     )
     SELECT ins.*, ${TYPE_FIELDS}
     FROM ins ${TYPE_JOIN.replace('cr.type_id', 'ins.type_id')}`,
    [
      userId, customerErpId,
      params.typeId,
      params.priority ?? 'normal',
      params.dueAt,
      params.recurrenceDays ?? null,
      params.note ?? null,
      params.notifyVia ?? 'app',
    ],
  );
  return mapRow(rows[0]);
}

async function listCustomerReminders(
  pool: DbPool,
  userId: string,
  customerErpId: string,
  filter: ReminderFilter,
): Promise<Reminder[]> {
  const whereClause =
    filter === 'active'
      ? `AND cr.status IN ('active', 'snoozed')`
      : filter === 'done'
        ? `AND cr.status = 'done' AND cr.completed_at > NOW() - INTERVAL '30 days'`
        : '';
  const orderClause =
    filter === 'active'
      ? `ORDER BY (cr.priority = 'urgent') DESC, cr.due_at ASC`
      : `ORDER BY cr.due_at DESC`;

  const { rows } = await pool.query<ReminderRow>(
    `SELECT cr.*, ${TYPE_FIELDS}
     FROM agents.customer_reminders cr ${TYPE_JOIN}
     WHERE cr.user_id = $1 AND cr.customer_erp_id = $2
     ${whereClause}
     ${orderClause}`,
    [userId, customerErpId],
  );
  return rows.map(mapRow);
}

async function patchReminder(
  pool: DbPool,
  userId: string,
  id: ReminderId,
  params: PatchReminderParams,
): Promise<Reminder> {
  const completedAt = params.status === 'done' ? 'NOW()' : 'cr.completed_at';
  const updateRecurrence = 'recurrenceDays' in params;
  const { rows } = await pool.query<ReminderRow>(
    `WITH upd AS (
       UPDATE agents.customer_reminders cr
       SET
         type_id         = COALESCE($3::int,       cr.type_id),
         priority        = COALESCE($4::varchar,    cr.priority),
         due_at          = COALESCE($5::timestamptz,cr.due_at),
         recurrence_days = CASE WHEN $6::boolean THEN $7::int ELSE cr.recurrence_days END,
         note            = COALESCE($8::text,       cr.note),
         notify_via      = COALESCE($9::varchar,    cr.notify_via),
         status          = COALESCE($10::varchar,   cr.status),
         snoozed_until   = COALESCE($11::timestamptz, cr.snoozed_until),
         completion_note = COALESCE($12::text,      cr.completion_note),
         completed_at    = ${completedAt},
         updated_at      = NOW()
       WHERE cr.id = $1 AND cr.user_id = $2
       RETURNING *
     )
     SELECT upd.*, ${TYPE_FIELDS.replace(/cr\./g, 'upd.')}
     FROM upd
     JOIN agents.reminder_types rt ON rt.id = upd.type_id`,
    [
      id, userId,
      params.typeId ?? null,
      params.priority ?? null,
      params.dueAt ?? null,
      updateRecurrence,
      params.recurrenceDays ?? null,
      params.note !== undefined ? params.note : null,
      params.notifyVia ?? null,
      params.status ?? null,
      params.snoozedUntil ?? null,
      params.completionNote !== undefined ? params.completionNote : null,
    ],
  );

  const updated = rows[0];

  if (params.status === 'done' && updated.recurrence_days !== null) {
    const nextDueAt = computeNextDueAt(
      updated.completed_at ?? new Date(),
      updated.recurrence_days,
    );
    if (nextDueAt !== null) {
      await createReminder(pool, updated.user_id, updated.customer_erp_id, {
        typeId: updated.type_id,
        priority: updated.priority as ReminderPriority,
        dueAt: nextDueAt,
        recurrenceDays: updated.recurrence_days,
        note: updated.note,
        notifyVia: updated.notify_via as ReminderNotifyVia,
      });
    }
  }

  return mapRow(updated);
}

async function deleteReminder(pool: DbPool, userId: string, id: ReminderId): Promise<void> {
  await pool.query(
    `DELETE FROM agents.customer_reminders WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
}

async function getRemindersOverdueOrToday(
  pool: DbPool,
  userId: string,
): Promise<ReminderWithCustomer[]> {
  const { rows } = await pool.query<ReminderWithCustomerRow>(
    `SELECT cr.*, ${TYPE_FIELDS}, c.name AS customer_name
     FROM agents.customer_reminders cr ${TYPE_JOIN}
     JOIN agents.customers c
       ON c.user_id = cr.user_id AND c.erp_id = cr.customer_erp_id AND c.deleted_at IS NULL
     WHERE cr.user_id = $1
       AND cr.due_at::date <= CURRENT_DATE
       AND cr.status IN ('active', 'snoozed')
       AND (cr.snoozed_until IS NULL OR cr.snoozed_until < NOW())
     ORDER BY (cr.priority = 'urgent') DESC, cr.due_at ASC`,
    [userId],
  );
  return rows.map(mapRowWithCustomer);
}

async function getTodayReminders(pool: DbPool, userId: string): Promise<TodayRemindersResult> {
  const customerJoin = `
    JOIN agents.customers c
      ON c.user_id = cr.user_id AND c.erp_id = cr.customer_erp_id AND c.deleted_at IS NULL`;

  const [overdueRes, todayRes, totalRes, doneRes] = await Promise.all([
    pool.query<ReminderWithCustomerRow>(
      `SELECT cr.*, ${TYPE_FIELDS}, c.name AS customer_name
       FROM agents.customer_reminders cr ${TYPE_JOIN} ${customerJoin}
       WHERE cr.user_id = $1
         AND cr.due_at::date < CURRENT_DATE
         AND cr.status IN ('active', 'snoozed')
         AND (cr.snoozed_until IS NULL OR cr.snoozed_until < NOW())
       ORDER BY (cr.priority = 'urgent') DESC, cr.due_at ASC`,
      [userId],
    ),
    pool.query<ReminderWithCustomerRow>(
      `SELECT cr.*, ${TYPE_FIELDS}, c.name AS customer_name
       FROM agents.customer_reminders cr ${TYPE_JOIN} ${customerJoin}
       WHERE cr.user_id = $1
         AND cr.due_at::date = CURRENT_DATE
         AND cr.status IN ('active', 'snoozed')
         AND (cr.snoozed_until IS NULL OR cr.snoozed_until < NOW())
       ORDER BY (cr.priority = 'urgent') DESC, cr.due_at ASC`,
      [userId],
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM agents.customer_reminders
       WHERE user_id = $1 AND status IN ('active', 'snoozed')`,
      [userId],
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM agents.customer_reminders
       WHERE user_id = $1 AND status = 'done' AND completed_at::date = CURRENT_DATE`,
      [userId],
    ),
  ]);

  return {
    overdue: overdueRes.rows.map(mapRowWithCustomer),
    today: todayRes.rows.map(mapRowWithCustomer),
    totalActive: totalRes.rows[0].count,
    completedToday: doneRes.rows[0].count,
  };
}

async function getUpcomingReminders(
  pool: DbPool,
  userId: string,
  days: number,
): Promise<UpcomingRemindersResult> {
  const customerJoin = `
    JOIN agents.customers c
      ON c.user_id = cr.user_id AND c.erp_id = cr.customer_erp_id AND c.deleted_at IS NULL`;

  const [overdueRes, upcomingRes, totalRes, doneRes] = await Promise.all([
    pool.query<ReminderWithCustomerRow>(
      `SELECT cr.*, ${TYPE_FIELDS}, c.name AS customer_name
       FROM agents.customer_reminders cr ${TYPE_JOIN} ${customerJoin}
       WHERE cr.user_id = $1
         AND cr.due_at::date < CURRENT_DATE
         AND cr.status IN ('active', 'snoozed')
         AND (cr.snoozed_until IS NULL OR cr.snoozed_until < NOW())
       ORDER BY cr.due_at ASC`,
      [userId],
    ),
    pool.query<ReminderWithCustomerRow>(
      `SELECT cr.*, ${TYPE_FIELDS}, c.name AS customer_name
       FROM agents.customer_reminders cr ${TYPE_JOIN} ${customerJoin}
       WHERE cr.user_id = $1
         AND cr.due_at::date >= CURRENT_DATE
         AND cr.due_at::date <= CURRENT_DATE + ($2 * INTERVAL '1 day')
         AND cr.status IN ('active', 'snoozed')
         AND (cr.snoozed_until IS NULL OR cr.snoozed_until < NOW())
       ORDER BY cr.due_at ASC`,
      [userId, days],
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM agents.customer_reminders
       WHERE user_id = $1 AND status IN ('active', 'snoozed')`,
      [userId],
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM agents.customer_reminders
       WHERE user_id = $1 AND status = 'done' AND completed_at::date = CURRENT_DATE`,
      [userId],
    ),
  ]);

  const byDate: Record<string, ReminderWithCustomer[]> = {};
  for (const row of upcomingRes.rows) {
    const key = row.due_at.toISOString().split('T')[0];
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(mapRowWithCustomer(row));
  }

  return {
    overdue: overdueRes.rows.map(mapRowWithCustomer),
    byDate,
    totalActive: totalRes.rows[0].count,
    completedToday: doneRes.rows[0].count,
  };
}

export {
  computeNextDueAt,
  isReminderEffectivelyActive,
  createReminder,
  listCustomerReminders,
  patchReminder,
  deleteReminder,
  getRemindersOverdueOrToday,
  getTodayReminders,
  getUpcomingReminders,
  type ReminderId,
  type Reminder,
  type ReminderWithCustomer,
  type TodayRemindersResult,
  type UpcomingRemindersResult,
  type CreateReminderParams,
  type PatchReminderParams,
  type ReminderFilter,
  type ReminderStatus,
  type ReminderPriority,
  type ReminderNotifyVia,
};
```

**Nota sul TYPE_JOIN/TYPE_FIELDS**: i template string contengono `cr.` come alias tabella. Nelle CTE usiamo `ins.` e `upd.` rispettivamente — i `.replace()` gestiscono questa differenza. In alternativa scrivi i JOIN espliciti in quei due metodi senza usare la costante.

- [ ] **Step 4: Eseguire i test — verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- customer-reminders.spec
```
Atteso: tutti i test esistenti + i nuovi PASS.

- [ ] **Step 5: Build check backend**

```bash
npm run build --prefix archibald-web-app/backend
```
Atteso: 0 errori TypeScript.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/customer-reminders.ts \
        archibald-web-app/backend/src/db/repositories/customer-reminders.spec.ts
git commit -m "feat(backend): customer-reminders usa type_id FK con JOIN reminder_types"
```

---

## Task 4: Aggiornare le route backend

**Files:**
- Modify: `archibald-web-app/backend/src/routes/reminders.ts`
- Modify: `archibald-web-app/backend/src/routes/customer-reminders.ts`

- [ ] **Step 1: Aggiornare `reminders.ts` — aggiungere route tipi + upcoming**

Sostituisci il file completo:

```ts
import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import {
  getTodayReminders,
  patchReminder,
  deleteReminder,
  getUpcomingReminders,
} from '../db/repositories/customer-reminders';
import type { ReminderId } from '../db/repositories/customer-reminders';
import {
  listReminderTypes,
  createReminderType,
  updateReminderType,
  deleteReminderType,
} from '../db/repositories/reminder-types';
import { logger } from '../logger';

type RemindersRouterDeps = { pool: DbPool };

const PatchSchema = z.object({
  type_id: z.number().int().positive().optional(),
  priority: z.enum(['urgent', 'normal', 'low']).optional(),
  due_at: z.string().datetime().optional(),
  recurrence_days: z.number().int().positive().nullable().optional(),
  note: z.string().optional(),
  notify_via: z.enum(['app', 'email']).optional(),
  status: z.enum(['active', 'snoozed', 'done', 'cancelled']).optional(),
  snoozed_until: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().optional(),
  completion_note: z.string().optional(),
});

const CreateTypeSchema = z.object({
  label: z.string().min(1).max(50),
  emoji: z.string().min(1).max(8),
  colorBg: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  colorText: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const UpdateTypeSchema = CreateTypeSchema.partial();

function createRemindersRouter({ pool }: RemindersRouterDeps): Router {
  const router = Router();

  // ── Reminder types CRUD (registrate PRIMA di /:id) ──────────────────────

  router.get('/types', async (req: AuthRequest, res) => {
    try {
      const types = await listReminderTypes(pool, req.user!.userId);
      res.json(types);
    } catch (error) {
      logger.error('Error fetching reminder types', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero tipi promemoria' });
    }
  });

  router.post('/types', async (req: AuthRequest, res) => {
    try {
      const parsed = CreateTypeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.format() });
      const type = await createReminderType(pool, req.user!.userId, parsed.data);
      res.status(201).json(type);
    } catch (error) {
      logger.error('Error creating reminder type', { error });
      res.status(500).json({ success: false, error: 'Errore nella creazione tipo promemoria' });
    }
  });

  router.patch('/types/:id', async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid type id' });
      const parsed = UpdateTypeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.format() });
      const type = await updateReminderType(pool, id, req.user!.userId, parsed.data);
      res.json(type);
    } catch (error) {
      logger.error('Error updating reminder type', { error });
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ success: false, error: 'Tipo non trovato' });
      }
      res.status(500).json({ success: false, error: 'Errore nella modifica tipo promemoria' });
    }
  });

  router.delete('/types/:id', async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid type id' });
      const result = await deleteReminderType(pool, id, req.user!.userId);
      res.json(result);
    } catch (error) {
      logger.error('Error deleting reminder type', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione tipo promemoria' });
    }
  });

  // ── Today / Upcoming ────────────────────────────────────────────────────

  router.get('/today', async (req: AuthRequest, res) => {
    try {
      const result = await getTodayReminders(pool, req.user!.userId);
      res.json(result);
    } catch (error) {
      logger.error('Error fetching today reminders', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero promemoria di oggi' });
    }
  });

  router.get('/upcoming', async (req: AuthRequest, res) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
      const result = await getUpcomingReminders(pool, req.user!.userId, days);
      res.json(result);
    } catch (error) {
      logger.error('Error fetching upcoming reminders', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero promemoria futuri' });
    }
  });

  // ── Reminder PATCH / DELETE ──────────────────────────────────────────────

  router.patch('/:id', async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid reminder id' });
      const parsed = PatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.format() });
      const body = parsed.data;
      const updated = await patchReminder(pool, req.user!.userId, id as ReminderId, {
        typeId: body.type_id,
        priority: body.priority,
        dueAt: body.due_at !== undefined ? new Date(body.due_at) : undefined,
        recurrenceDays: body.recurrence_days,
        note: body.note,
        notifyVia: body.notify_via,
        status: body.status,
        snoozedUntil:
          body.snoozed_until !== undefined && body.snoozed_until !== null
            ? new Date(body.snoozed_until)
            : body.snoozed_until,
        completionNote: body.completion_note,
      });
      res.json(updated);
    } catch (error) {
      logger.error('Error patching reminder', { error });
      res.status(500).json({ success: false, error: 'Errore nella modifica del promemoria' });
    }
  });

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid reminder id' });
      await deleteReminder(pool, req.user!.userId, id as ReminderId);
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error deleting reminder', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione del promemoria' });
    }
  });

  return router;
}

export { createRemindersRouter };
```

- [ ] **Step 2: Aggiornare `customer-reminders.ts` (route)**

In `archibald-web-app/backend/src/routes/customer-reminders.ts`, sostituisci `CreateSchema` e il handler POST:

```ts
const CreateSchema = z.object({
  type_id: z.number().int().positive(),
  priority: z.enum(['urgent', 'normal', 'low']),
  due_at: z.string().datetime(),
  recurrence_days: z.number().int().positive().nullable(),
  note: z.string().nullable(),
  notify_via: z.enum(['app', 'email']),
});
```

Nel handler `router.post('/')`, sostituisci la chiamata a `createReminder`:

```ts
const reminder = await createReminder(pool, userId, customerProfile, {
  typeId: body.type_id,
  priority: body.priority as 'urgent' | 'normal',
  dueAt: new Date(body.due_at),
  recurrenceDays: body.recurrence_days,
  note: body.note,
  notifyVia: body.notify_via as 'app' | 'email',
});
```

Rimuovi anche l'import `ReminderType` che non esiste più:

```ts
// Rimuovi questa riga:
// import type { ReminderFilter } from '../db/repositories/customer-reminders';
// Tieni solo:
import type { ReminderFilter } from '../db/repositories/customer-reminders';
// (ReminderType non è più esportato)
```

- [ ] **Step 3: Build check backend**

```bash
npm run build --prefix archibald-web-app/backend
```
Atteso: 0 errori.

- [ ] **Step 4: Test backend**

```bash
npm test --prefix archibald-web-app/backend
```
Atteso: tutti i test PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/reminders.ts \
        archibald-web-app/backend/src/routes/customer-reminders.ts
git commit -m "feat(backend): route /reminders/types CRUD + /upcoming + patch type_id"
```

---

## Task 5: Frontend `reminders.service.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/services/reminders.service.ts`
- Create: `archibald-web-app/frontend/src/services/reminders.service.spec.ts`

- [ ] **Step 1: Scrivere il test (failing)**

Crea `archibald-web-app/frontend/src/services/reminders.service.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { computeDueDateFromChip } from './reminders.service';

describe('computeDueDateFromChip', () => {
  test("'Oggi' restituisce la data odierna (days=0)", () => {
    const today = new Date().toISOString().split('T')[0];
    expect(computeDueDateFromChip('Oggi').split('T')[0]).toBe(today);
  });

  test("'Domani' restituisce la data di domani", () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
    expect(computeDueDateFromChip('Domani').split('T')[0]).toBe(tomorrow);
  });

  test("'3 giorni' restituisce tra 3 giorni", () => {
    const in3 = new Date(Date.now() + 3 * 86_400_000).toISOString().split('T')[0];
    expect(computeDueDateFromChip('3 giorni').split('T')[0]).toBe(in3);
  });

  test("chip sconosciuto lancia errore", () => {
    expect(() => computeDueDateFromChip('Dopodomani')).toThrow('Unknown chip: Dopodomani');
  });
});
```

- [ ] **Step 2: Eseguire — verificare che 'Oggi' fallisca**

```bash
npm test --prefix archibald-web-app/frontend -- reminders.service.spec
```
Atteso: test 'Oggi' FAIL (throw: `Unknown chip: Oggi`).

- [ ] **Step 3: Riscrivere `reminders.service.ts`**

Sostituisci il file completo:

```ts
import { fetchWithRetry } from '../utils/fetch-with-retry';

// ── Tipi ──────────────────────────────────────────────────────────────────

export type ReminderTypeKey =
  | 'commercial_contact' | 'offer_followup' | 'payment'
  | 'contract_renewal' | 'anniversary' | 'custom';

export type ReminderTypeRecord = {
  id: number;
  label: string;
  emoji: string;
  colorBg: string;
  colorText: string;
  sortOrder: number;
  deletedAt: string | null;
};

export type CreateReminderTypeInput = {
  label: string;
  emoji: string;
  colorBg: string;
  colorText: string;
};

export type UpdateReminderTypeInput = Partial<CreateReminderTypeInput>;

export type ReminderPriority = 'urgent' | 'normal' | 'low';
export type ReminderStatus = 'active' | 'snoozed' | 'done' | 'cancelled';
export type NotifyVia = 'app' | 'email';

export type Reminder = {
  id: number;
  userId: string;
  customerErpId: string;
  typeId: number;
  typeLabel: string;
  typeEmoji: string;
  typeColorBg: string;
  typeColorText: string;
  typeDeletedAt: string | null;
  priority: ReminderPriority;
  dueAt: string;
  recurrenceDays: number | null;
  note: string | null;
  notifyVia: NotifyVia;
  status: ReminderStatus;
  snoozedUntil: string | null;
  completedAt: string | null;
  completionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReminderWithCustomer = Reminder & { customerName: string };

export type TodayReminders = {
  overdue: ReminderWithCustomer[];
  today: ReminderWithCustomer[];
  totalActive: number;
  completedToday: number;
};

export type UpcomingReminders = {
  overdue: ReminderWithCustomer[];
  byDate: Record<string, ReminderWithCustomer[]>;
  totalActive: number;
  completedToday: number;
};

export type CreateReminderInput = {
  type_id: number;
  priority: ReminderPriority;
  due_at: string;
  recurrence_days: number | null;
  note: string | null;
  notify_via: NotifyVia;
};

export type PatchReminderInput = Partial<{
  type_id: number;
  priority: ReminderPriority;
  due_at: string;
  recurrence_days: number | null;
  note: string;
  notify_via: NotifyVia;
  status: ReminderStatus;
  snoozed_until: string | null;
  completed_at: string;
  completion_note: string;
}>;

// ── Costanti (fallback per tipi orfani / priorità) ────────────────────────

export const REMINDER_PRIORITY_COLORS: Record<ReminderPriority, { bg: string; text: string }> = {
  urgent: { bg: '#fee2e2', text: '#dc2626' },
  normal: { bg: '#eff6ff', text: '#2563eb' },
  low:    { bg: '#f8fafc', text: '#94a3b8' },
};

export const REMINDER_PRIORITY_LABELS: Record<ReminderPriority, string> = {
  urgent: '🔥 Urgente',
  normal: '● Normale',
  low:    '↓ Bassa',
};

export const RECURRENCE_OPTIONS: { label: string; days: number | null }[] = [
  { label: 'Una volta sola',  days: null },
  { label: 'Ogni settimana', days: 7 },
  { label: 'Ogni 2 settimane', days: 14 },
  { label: 'Ogni mese',      days: 30 },
  { label: 'Ogni 3 mesi',    days: 90 },
  { label: 'Ogni 6 mesi',    days: 180 },
  { label: 'Ogni anno',      days: 365 },
];

// ── Funzioni pure ─────────────────────────────────────────────────────────

export function computeDueDateFromChip(chip: string): string {
  const map: Record<string, number> = {
    'Oggi': 0, 'Domani': 1, '3 giorni': 3, '1 settimana': 7,
    '2 settimane': 14, '1 mese': 30, '3 mesi': 90,
  };
  const days = map[chip];
  if (days === undefined) throw new Error(`Unknown chip: ${chip}`);
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function formatDueAt(dueAt: string): { label: string; urgent: boolean } {
  const due = new Date(dueAt);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / 86_400_000);

  if (diffDays < -1) return { label: `⚠ Scaduto ${Math.abs(diffDays)} giorni fa`, urgent: true };
  if (diffDays === -1) return { label: '⚠ Scaduto ieri', urgent: true };
  if (diffDays === 0) return { label: '⚠ Scade oggi', urgent: true };
  if (diffDays === 1) return { label: 'Domani', urgent: false };
  return { label: `Tra ${diffDays} giorni`, urgent: false };
}

// ── API: reminder types ───────────────────────────────────────────────────

export async function listReminderTypes(): Promise<ReminderTypeRecord[]> {
  const res = await fetchWithRetry('/api/reminders/types');
  return res.json() as Promise<ReminderTypeRecord[]>;
}

export async function createReminderType(
  input: CreateReminderTypeInput,
): Promise<ReminderTypeRecord> {
  const res = await fetchWithRetry('/api/reminders/types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<ReminderTypeRecord>;
}

export async function updateReminderType(
  id: number,
  input: UpdateReminderTypeInput,
): Promise<ReminderTypeRecord> {
  const res = await fetchWithRetry(`/api/reminders/types/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<ReminderTypeRecord>;
}

export async function deleteReminderType(id: number): Promise<{ usages: number }> {
  const res = await fetchWithRetry(`/api/reminders/types/${id}`, { method: 'DELETE' });
  return res.json() as Promise<{ usages: number }>;
}

// ── API: reminders ────────────────────────────────────────────────────────

export async function getTodayReminders(): Promise<TodayReminders> {
  const res = await fetchWithRetry('/api/reminders/today');
  return res.json() as Promise<TodayReminders>;
}

export async function listUpcomingReminders(days: number): Promise<UpcomingReminders> {
  const res = await fetchWithRetry(`/api/reminders/upcoming?days=${days}`);
  return res.json() as Promise<UpcomingReminders>;
}

export async function listCustomerReminders(
  customerProfile: string,
  filter: 'active' | 'done' | 'all' = 'active',
): Promise<Reminder[]> {
  const res = await fetchWithRetry(
    `/api/customers/${customerProfile}/reminders?filter=${filter}`,
  );
  return res.json() as Promise<Reminder[]>;
}

export async function createReminder(
  customerProfile: string,
  input: CreateReminderInput,
): Promise<Reminder> {
  const res = await fetchWithRetry(`/api/customers/${customerProfile}/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<Reminder>;
}

export async function patchReminder(
  id: number,
  input: PatchReminderInput,
): Promise<Reminder> {
  const res = await fetchWithRetry(`/api/reminders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<Reminder>;
}

export async function deleteReminder(id: number): Promise<void> {
  await fetchWithRetry(`/api/reminders/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 4: Eseguire il test — verificare che passi**

```bash
npm test --prefix archibald-web-app/frontend -- reminders.service.spec
```
Atteso: 4 tests PASS.

- [ ] **Step 5: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Ci saranno errori in `ReminderForm.tsx`, `CustomerRemindersSection.tsx`, `RemindersWidgetNew.tsx` che usano `r.type` e i vecchi campi — è normale e previsto. Vengono risolti nella Parte 2.

- [ ] **Step 6: Build backend (test totale)**

```bash
npm test --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/frontend -- reminders.service.spec
```

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/services/reminders.service.ts \
        archibald-web-app/frontend/src/services/reminders.service.spec.ts
git commit -m "feat(frontend): reminders.service — ReminderTypeRecord, type_id, chip Oggi, listUpcoming"
```

---

## Gate Part 1 — Verifica finale backend

```bash
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend
```

Atteso: 0 errori TypeScript, tutti i test PASS.

**Continua con:** `docs/superpowers/plans/2026-04-26-reminders-redesign-part2.md`

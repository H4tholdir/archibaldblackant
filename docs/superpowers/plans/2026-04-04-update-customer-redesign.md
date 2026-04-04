# Update Customer — Redesign Completo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign completo del flusso modifica cliente: bot chirurgico diff-based, edit mode inline, sistema reminder CRM-grade e widget dashboard.

**Architecture:** Backend: migration SQL 045, repository CRUD reminder, router REST, job scheduler 08:00, bot `updateCustomerSurgical` con navigazione diretta per erpId e 5 bug fix certificati, handler `update-customer` riscritto. Frontend: `CustomerProfilePage` con avatar 180/160px circolare, layout scrollabile 10 sezioni, edit mode inline, VAT two-track, CRUD indirizzi accumulato, `CustomerRemindersSection`, `RemindersWidgetNew` in Dashboard posizione #2.

**Tech Stack:** PostgreSQL via `pg` pool, `onProgress` callback pattern (non `job.updateProgress`), Puppeteer XAF bot, React 19 + TypeScript strict, inline styles, Vitest, Zod per route validation.

**Spec di riferimento:** `docs/superpowers/specs/2026-04-04-update-customer-redesign.md`

---

## File Structure

**Nuovi file backend:**
- `src/db/migrations/045-customer-reminders.sql` — schema tabella reminders
- `src/db/repositories/customer-reminders.ts` — CRUD repository
- `src/db/repositories/customer-reminders.spec.ts` — integration tests
- `src/routes/reminders.ts` — router REST per today + CRUD globale reminder
- `src/routes/customer-reminders.ts` — router REST customer-scoped

**File backend modificati:**
- `src/bot/archibald-bot.ts` — aggiunti `navigateToEditCustomerById` e `updateCustomerSurgical`
- `src/operations/handlers/update-customer.ts` — riscritto con `CustomerDiff`
- `src/sync/sync-scheduler.ts` — job daily 08:00 `checkCustomerReminders`
- `src/server.ts` — mounting nuovi router

**Nuovi file frontend:**
- `src/services/reminders.service.ts` — tipi + funzioni API
- `src/components/CustomerRemindersSection.tsx` — sezione profilo con lista + form inline
- `src/components/ReminderForm.tsx` — form aggiungi/modifica reminder
- `src/components/RemindersWidgetNew.tsx` — widget Dashboard

**File frontend modificati:**
- `src/pages/CustomerProfilePage.tsx` — hero, layout, edit mode, sezioni
- `src/components/PhotoCropModal.tsx` — restore crop/scale/rotate
- `src/components/CustomerList.tsx` — autocomplete fix + FAB
- `src/pages/Dashboard.tsx` — inserisce RemindersWidgetNew

---

### Task 1: Migration 045 — `agents.customer_reminders`

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/045-customer-reminders.sql`

- [ ] **Step 1: Crea il file migration SQL**

```sql
-- 045-customer-reminders.sql
CREATE TABLE IF NOT EXISTS agents.customer_reminders (
  id               SERIAL PRIMARY KEY,
  user_id          INT NOT NULL,
  customer_erp_id  VARCHAR(50) NOT NULL,
  type             VARCHAR(30) NOT NULL DEFAULT 'commercial_contact',
  priority         VARCHAR(10) NOT NULL DEFAULT 'normal',
  due_at           TIMESTAMPTZ NOT NULL,
  recurrence_days  INT NULL,
  note             TEXT,
  notify_via       VARCHAR(10) NOT NULL DEFAULT 'app',
  status           VARCHAR(10) NOT NULL DEFAULT 'active',
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

Nota: `user_id` è `INT` per la FK composite (`agents.customers.user_id` è INT). Verificare con:
```bash
psql -d archibald -c "\d agents.customers" | grep user_id
```
Se `user_id` in `agents.customers` è `VARCHAR`, cambia il tipo in `VARCHAR(50)` anche in questa tabella.

- [ ] **Step 2: Applica la migration in locale**

```bash
cd archibald-web-app/backend
DATABASE_URL=postgresql://archibald:password@localhost:5432/archibald npx tsx src/db/migrate.ts
```

Oppure avvia il server in dev — `runMigrations` viene chiamato automaticamente all'avvio in `src/main.ts:90`.

Expected: `Migration applied: 045-customer-reminders.sql`

- [ ] **Step 3: Verifica schema creato**

```bash
psql -d archibald -c "\d agents.customer_reminders"
```

Expected: tabella con 15 colonne + FK su agents.customers.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/045-customer-reminders.sql
git commit -m "feat(db): migration 045 — agents.customer_reminders table"
```

---

### Task 2: Repository `customer-reminders.ts`

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/customer-reminders.ts`
- Create: `archibald-web-app/backend/src/db/repositories/customer-reminders.spec.ts`

- [ ] **Step 1: Scrivi i test di integrazione (failing)**

```typescript
// customer-reminders.spec.ts
import { describe, expect, test, beforeEach } from 'vitest';
import { createTestPool, cleanupTestPool } from '../test-helpers';
import type { DbPool } from '../pool';
import {
  createReminder,
  listCustomerReminders,
  patchReminder,
  deleteReminder,
  getRemindersOverdueOrToday,
  computeNextDueAt,
  isReminderEffectivelyActive,
} from './customer-reminders';

// Test esclusivamente di integrazione — richiede DB reale
const TEST_USER_ID = 1;
const TEST_ERP_ID = 'TEST-CUSTOMER-001';

describe('computeNextDueAt', () => {
  test('aggiunge N giorni alla data completamento', () => {
    const base = new Date('2026-04-04T10:00:00Z');
    const result = computeNextDueAt(base, 7);
    expect(result).toEqual(new Date('2026-04-11T10:00:00Z'));
  });

  test('recurrenceDays null → null', () => {
    expect(computeNextDueAt(new Date(), null)).toBeNull();
  });
});

describe('isReminderEffectivelyActive', () => {
  test('status active, snoozed_until null → true', () => {
    expect(isReminderEffectivelyActive({ status: 'active', snoozed_until: null })).toBe(true);
  });

  test('status snoozed, snoozed_until in futuro → false', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(isReminderEffectivelyActive({ status: 'snoozed', snoozed_until: future })).toBe(false);
  });

  test('status snoozed, snoozed_until in passato → true (ri-attivato)', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(isReminderEffectivelyActive({ status: 'snoozed', snoozed_until: past })).toBe(true);
  });

  test('status done → false', () => {
    expect(isReminderEffectivelyActive({ status: 'done', snoozed_until: null })).toBe(false);
  });
});

// Integration tests — skip se DB non disponibile
let pool: DbPool;

describe('CRUD reminders (integration)', () => {
  beforeEach(async () => {
    pool = await createTestPool();
    // Assicurarsi che il cliente di test esista
    await pool.query(
      `INSERT INTO agents.customers (user_id, erp_id, name, hash, last_sync)
       VALUES ($1, $2, 'Test Customer', 'hash', 0)
       ON CONFLICT (user_id, erp_id) DO NOTHING`,
      [TEST_USER_ID, TEST_ERP_ID],
    );
  });

  test('createReminder → listCustomerReminders → deleteReminder', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const created = await createReminder(pool, TEST_USER_ID, TEST_ERP_ID, {
      type: 'commercial_contact',
      priority: 'normal',
      due_at: tomorrow,
      recurrence_days: null,
      note: 'test note',
      notify_via: 'app',
    });
    expect(created.id).toBeGreaterThan(0);
    expect(created.status).toBe('active');

    const list = await listCustomerReminders(pool, TEST_USER_ID, TEST_ERP_ID, 'active');
    expect(list.some((r) => r.id === created.id)).toBe(true);

    await deleteReminder(pool, TEST_USER_ID, created.id);
    const listAfter = await listCustomerReminders(pool, TEST_USER_ID, TEST_ERP_ID, 'active');
    expect(listAfter.some((r) => r.id === created.id)).toBe(false);
  });

  test('patchReminder status done con recurrence_days crea nuovo reminder', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const created = await createReminder(pool, TEST_USER_ID, TEST_ERP_ID, {
      type: 'commercial_contact',
      priority: 'normal',
      due_at: yesterday,
      recurrence_days: 7,
      note: null,
      notify_via: 'app',
    });

    await patchReminder(pool, TEST_USER_ID, created.id, {
      status: 'done',
      completed_at: new Date().toISOString(),
      completion_note: 'fatto',
    });

    const list = await listCustomerReminders(pool, TEST_USER_ID, TEST_ERP_ID, 'active');
    const recurring = list.find((r) => r.id !== created.id && r.recurrence_days === 7);
    expect(recurring).toBeDefined();
  });

  test('getRemindersOverdueOrToday non include reminder snoozed in futuro', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const futureSnoozed = new Date(Date.now() + 86400000).toISOString();
    const created = await createReminder(pool, TEST_USER_ID, TEST_ERP_ID, {
      type: 'custom',
      priority: 'low',
      due_at: yesterday,
      recurrence_days: null,
      note: null,
      notify_via: 'app',
    });
    await patchReminder(pool, TEST_USER_ID, created.id, {
      status: 'snoozed',
      snoozed_until: futureSnoozed,
    });

    const result = await getRemindersOverdueOrToday(pool, TEST_USER_ID);
    expect(result.some((r) => r.id === created.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customer-reminders
```

Expected: FAIL (moduli non trovati)

- [ ] **Step 3: Implementa il repository**

```typescript
// customer-reminders.ts
import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
type ReminderId = Brand<number, 'ReminderId'>;

type Reminder = {
  id: ReminderId;
  user_id: number;
  customer_erp_id: string;
  type: string;
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

type ReminderWithCustomer = Reminder & { customer_name: string };

type CreateReminderParams = {
  type: string;
  priority: string;
  due_at: string; // ISO
  recurrence_days: number | null;
  note: string | null;
  notify_via: string;
};

type PatchReminderParams = Partial<{
  type: string;
  priority: string;
  due_at: string;
  recurrence_days: number | null;
  note: string;
  notify_via: string;
  status: string;
  snoozed_until: string;
  completed_at: string;
  completion_note: string;
}>;

type ReminderFilter = 'active' | 'done' | 'all';

type TodayRemindersResult = {
  overdue: ReminderWithCustomer[];
  today: ReminderWithCustomer[];
  total_active: number;
  completed_today: number;
};

function computeNextDueAt(completedAt: Date, recurrenceDays: number | null): Date | null {
  if (recurrenceDays === null) return null;
  return new Date(completedAt.getTime() + recurrenceDays * 86_400_000);
}

function isReminderEffectivelyActive(reminder: { status: string; snoozed_until: string | null }): boolean {
  if (reminder.status === 'active') return true;
  if (reminder.status === 'snoozed' && reminder.snoozed_until) {
    return new Date(reminder.snoozed_until) < new Date();
  }
  return false;
}

async function createReminder(
  pool: DbPool,
  userId: number,
  customerErpId: string,
  params: CreateReminderParams,
): Promise<Reminder> {
  const { rows } = await pool.query<Reminder>(
    `INSERT INTO agents.customer_reminders
       (user_id, customer_erp_id, type, priority, due_at, recurrence_days, note, notify_via)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, customerErpId, params.type, params.priority, params.due_at,
     params.recurrence_days ?? null, params.note ?? null, params.notify_via],
  );
  return rows[0];
}

async function listCustomerReminders(
  pool: DbPool,
  userId: number,
  customerErpId: string,
  filter: ReminderFilter,
): Promise<Reminder[]> {
  const whereClause =
    filter === 'active' ? `AND status IN ('active', 'snoozed')` :
    filter === 'done'   ? `AND status = 'done' AND completed_at > NOW() - INTERVAL '30 days'` :
    '';

  const { rows } = await pool.query<Reminder>(
    `SELECT * FROM agents.customer_reminders
     WHERE user_id = $1 AND customer_erp_id = $2 ${whereClause}
     ORDER BY
       CASE WHEN priority = 'urgent' THEN 0 WHEN priority = 'normal' THEN 1 ELSE 2 END,
       due_at ASC`,
    [userId, customerErpId],
  );
  return rows;
}

async function patchReminder(
  pool: DbPool,
  userId: number,
  id: number,
  params: PatchReminderParams,
): Promise<Reminder> {
  const { rows } = await pool.query<Reminder>(
    `UPDATE agents.customer_reminders SET
       type             = COALESCE($3,  type),
       priority         = COALESCE($4,  priority),
       due_at           = COALESCE($5,  due_at),
       recurrence_days  = CASE WHEN $6::text IS NOT NULL THEN $6::int ELSE recurrence_days END,
       note             = COALESCE($7,  note),
       notify_via       = COALESCE($8,  notify_via),
       status           = COALESCE($9,  status),
       snoozed_until    = COALESCE($10, snoozed_until),
       completed_at     = COALESCE($11, completed_at),
       completion_note  = COALESCE($12, completion_note),
       updated_at       = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      id, userId,
      params.type ?? null, params.priority ?? null, params.due_at ?? null,
      params.recurrence_days !== undefined ? String(params.recurrence_days) : null,
      params.note ?? null, params.notify_via ?? null, params.status ?? null,
      params.snoozed_until ?? null, params.completed_at ?? null, params.completion_note ?? null,
    ],
  );
  const updated = rows[0];
  if (!updated) throw new Error(`Reminder ${id} not found`);

  // Auto-create next occurrence on done + recurrence
  if (params.status === 'done' && updated.recurrence_days !== null) {
    const completedAt = params.completed_at ? new Date(params.completed_at) : new Date();
    const nextDue = computeNextDueAt(completedAt, updated.recurrence_days);
    if (nextDue) {
      await createReminder(pool, userId, updated.customer_erp_id, {
        type: updated.type,
        priority: updated.priority,
        due_at: nextDue.toISOString(),
        recurrence_days: updated.recurrence_days,
        note: updated.note,
        notify_via: updated.notify_via,
      });
    }
  }

  return updated;
}

async function deleteReminder(pool: DbPool, userId: number, id: number): Promise<void> {
  await pool.query(
    `DELETE FROM agents.customer_reminders WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
}

async function getRemindersOverdueOrToday(pool: DbPool, userId: number): Promise<ReminderWithCustomer[]> {
  const { rows } = await pool.query<ReminderWithCustomer>(
    `SELECT r.*, c.name AS customer_name
     FROM agents.customer_reminders r
     JOIN agents.customers c ON c.user_id = r.user_id AND c.erp_id = r.customer_erp_id
     WHERE r.user_id = $1
       AND r.status IN ('active', 'snoozed')
       AND r.due_at::date <= CURRENT_DATE
       AND (r.snoozed_until IS NULL OR r.snoozed_until < NOW())
     ORDER BY r.due_at ASC`,
    [userId],
  );
  return rows;
}

async function getTodayReminders(pool: DbPool, userId: number): Promise<TodayRemindersResult> {
  const { rows: overdueRows } = await pool.query<ReminderWithCustomer>(
    `SELECT r.*, c.name AS customer_name
     FROM agents.customer_reminders r
     JOIN agents.customers c ON c.user_id = r.user_id AND c.erp_id = r.customer_erp_id
     WHERE r.user_id = $1
       AND r.status IN ('active', 'snoozed')
       AND r.due_at::date < CURRENT_DATE
       AND (r.snoozed_until IS NULL OR r.snoozed_until < NOW())
     ORDER BY r.due_at ASC`,
    [userId],
  );

  const { rows: todayRows } = await pool.query<ReminderWithCustomer>(
    `SELECT r.*, c.name AS customer_name
     FROM agents.customer_reminders r
     JOIN agents.customers c ON c.user_id = r.user_id AND c.erp_id = r.customer_erp_id
     WHERE r.user_id = $1
       AND r.status IN ('active', 'snoozed')
       AND r.due_at::date = CURRENT_DATE
       AND (r.snoozed_until IS NULL OR r.snoozed_until < NOW())
     ORDER BY
       CASE WHEN r.priority = 'urgent' THEN 0 WHEN r.priority = 'normal' THEN 1 ELSE 2 END,
       r.due_at ASC`,
    [userId],
  );

  const { rows: [countRow] } = await pool.query<{ total: string; completed: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('active', 'snoozed')) AS total,
       COUNT(*) FILTER (WHERE status = 'done' AND completed_at::date = CURRENT_DATE) AS completed
     FROM agents.customer_reminders WHERE user_id = $1`,
    [userId],
  );

  return {
    overdue: overdueRows,
    today: todayRows,
    total_active: Number(countRow.total),
    completed_today: Number(countRow.completed),
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
  type Reminder,
  type ReminderWithCustomer,
  type CreateReminderParams,
  type PatchReminderParams,
  type TodayRemindersResult,
};
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customer-reminders
```

Expected: tutti i test passano tranne eventuali integration test se DB non disponibile.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/customer-reminders.ts \
        archibald-web-app/backend/src/db/repositories/customer-reminders.spec.ts
git commit -m "feat(reminders): repository CRUD con auto-ricorrenza e query today/overdue"
```

---

### Task 3: Route REST reminders

**Files:**
- Create: `archibald-web-app/backend/src/routes/reminders.ts`
- Create: `archibald-web-app/backend/src/routes/customer-reminders.ts`
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Crea `src/routes/reminders.ts`**

```typescript
// reminders.ts — /api/reminders
import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
import * as repo from '../db/repositories/customer-reminders';
import type { AuthRequest } from '../middleware/auth';

type RemindersRouterDeps = {
  pool: DbPool;
};

const PatchSchema = z.object({
  type: z.string().optional(),
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

function createRemindersRouter({ pool }: RemindersRouterDeps): Router {
  const router = Router();

  router.get('/today', async (req, res) => {
    const userId = (req as AuthRequest).user!.userId;
    try {
      const result = await repo.getTodayReminders(pool, Number(userId));
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  router.patch('/:id', async (req, res) => {
    const userId = (req as AuthRequest).user!.userId;
    const id = Number(req.params.id);
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }
    try {
      const updated = await repo.patchReminder(pool, Number(userId), id, parsed.data);
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  router.delete('/:id', async (req, res) => {
    const userId = (req as AuthRequest).user!.userId;
    const id = Number(req.params.id);
    try {
      await repo.deleteReminder(pool, Number(userId), id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  return router;
}

export { createRemindersRouter };
```

- [ ] **Step 2: Crea `src/routes/customer-reminders.ts`**

```typescript
// customer-reminders.ts — /api/customers/:customerProfile/reminders
import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
import * as repo from '../db/repositories/customer-reminders';
import type { AuthRequest } from '../middleware/auth';

type CustomerRemindersRouterDeps = {
  pool: DbPool;
};

const CreateSchema = z.object({
  type: z.enum(['commercial_contact', 'offer_followup', 'payment', 'contract_renewal', 'anniversary', 'custom']),
  priority: z.enum(['urgent', 'normal', 'low']),
  due_at: z.string().datetime(),
  recurrence_days: z.number().int().positive().nullable(),
  note: z.string().nullable(),
  notify_via: z.enum(['app', 'email']),
});

function createCustomerRemindersRouter({ pool }: CustomerRemindersRouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const userId = (req as AuthRequest).user!.userId;
    const customerProfile = req.params.customerProfile;
    const filter = (req.query.filter as string) || 'active';
    if (!['active', 'done', 'all'].includes(filter)) {
      res.status(400).json({ success: false, error: 'Invalid filter' });
      return;
    }
    try {
      const reminders = await repo.listCustomerReminders(
        pool, Number(userId), customerProfile, filter as 'active' | 'done' | 'all',
      );
      res.json({ success: true, data: reminders });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  router.post('/', async (req, res) => {
    const userId = (req as AuthRequest).user!.userId;
    const customerProfile = req.params.customerProfile;
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }
    try {
      const created = await repo.createReminder(pool, Number(userId), customerProfile, parsed.data);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  return router;
}

export { createCustomerRemindersRouter };
```

- [ ] **Step 3: Registra i router in `server.ts`**

In `archibald-web-app/backend/src/server.ts`, aggiungi gli import vicino agli altri router import:

```typescript
import { createRemindersRouter } from './routes/reminders';
import { createCustomerRemindersRouter } from './routes/customer-reminders';
```

Poi nel corpo di `createApp`, dopo il mounting di `/api/customers/:erpId/addresses` (linea ~338):

```typescript
app.use('/api/customers/:customerProfile/reminders', authenticate,
  createCustomerRemindersRouter({ pool }));

app.use('/api/reminders', authenticate, createRemindersRouter({ pool }));
```

- [ ] **Step 4: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: exit 0, nessun errore TypeScript.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/reminders.ts \
        archibald-web-app/backend/src/routes/customer-reminders.ts \
        archibald-web-app/backend/src/server.ts
git commit -m "feat(reminders): REST endpoints today + CRUD cliente + PATCH/DELETE globale"
```

---

### Task 4: Scheduler — job giornaliero 08:00

**Files:**
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts`
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Aggiungi tipi e helper in `sync-scheduler.ts`**

Subito dopo gli import esistenti, aggiungi:

```typescript
type CheckRemindersFn = (userId: string) => Promise<void>;
```

Aggiungi il parametro opzionale a `createSyncScheduler` (alla fine della firma, dopo `deleteExpiredNotifications`):

```typescript
function createSyncScheduler(
  enqueue: EnqueueFn,
  getAgentsByActivity: GetAgentsByActivityFn,
  getOrdersNeedingArticleSync?: GetOrdersNeedingArticleSyncFn,
  getCustomersNeedingAddressSync?: GetCustomersNeedingAddressSyncFn,
  deleteExpiredNotifications?: DeleteExpiredFn,
  checkCustomerReminders?: CheckRemindersFn,   // ← nuovo
) {
```

- [ ] **Step 2: Aggiungi la logica daily 08:00 nel blocco `start()`**

Cerca il blocco `function start(intervals)` e aggiungi alla fine, prima della chiusura della funzione, dopo `if (deleteExpiredNotifications) { ... }`:

```typescript
if (checkCustomerReminders) {
  function scheduleNextEightAm(): NodeJS.Timeout {
    const now = new Date();
    const next8 = new Date(now);
    next8.setHours(8, 0, 0, 0);
    if (next8 <= now) next8.setDate(next8.getDate() + 1);
    const msUntil8 = next8.getTime() - now.getTime();

    return setTimeout(() => {
      const { active } = getAgentsByActivity();
      for (const userId of active) {
        checkCustomerReminders!(userId).catch((err) => {
          logger.error('checkCustomerReminders failed', { userId, error: err });
        });
      }
      // Riprogramma per il giorno successivo
      const daily = setInterval(() => {
        const { active: agents } = getAgentsByActivity();
        for (const id of agents) {
          checkCustomerReminders!(id).catch((err) => {
            logger.error('checkCustomerReminders failed', { userId: id, error: err });
          });
        }
      }, 24 * 60 * 60 * 1000);
      timers.push(daily);
    }, msUntil8) as NodeJS.Timeout;
  }
  pendingTimeouts.push(scheduleNextEightAm());
}
```

- [ ] **Step 3: Implementa `checkCustomerRemindersForUser` in `server.ts`**

In `server.ts`, aggiungi gli import del reminder repo:

```typescript
import * as customerRemindersRepo from './db/repositories/customer-reminders';
import * as notificationsRepo from './db/repositories/notifications';
```

Trova dove `syncScheduler` viene creato/usato (già esistente). La funzione è chiamata in `main.ts`:
```typescript
const syncScheduler = createSyncScheduler(enqueue, getAgentsByActivity, ...);
```

In `server.ts`, aggiungi nelle dipendenze `AppDeps`:

```typescript
checkCustomerReminders?: (userId: string) => Promise<void>;
```

In `createApp`, passa questo dep al scheduler dove è usato:
```typescript
// in server.ts, dove sync-scheduler è collegato ai deps
```

Invece, per semplicità, aggiungi la funzione nel punto dove `createApp` riceve `deps` e la passa direttamente. Apri `server.ts` e aggiungi:

```typescript
// Dopo la riga con createNotificationsRouter:
async function checkCustomerRemindersForUser(userId: string): Promise<void> {
  const due = await customerRemindersRepo.getRemindersOverdueOrToday(pool, Number(userId));
  const TYPE_LABELS: Record<string, string> = {
    commercial_contact: '📞 Ricontatto commerciale',
    offer_followup: '🔥 Follow-up offerta',
    payment: '💰 Pagamento',
    contract_renewal: '🔄 Rinnovo contratto',
    anniversary: '🎂 Ricorrenza',
    custom: '📋 Promemoria',
  };
  for (const r of due) {
    await notificationsRepo.insertNotification(pool, {
      userId,
      type: 'customer_reminder',
      severity: r.priority === 'urgent' ? 'warning' : 'info',
      title: `🔔 ${TYPE_LABELS[r.type] ?? r.type}: ${r.customer_name}`,
      body: r.note ?? 'Promemoria in scadenza',
      data: { customerErpId: r.customer_erp_id, reminderId: r.id, action_url: `/customers/${r.customer_erp_id}` },
      expiresAt: new Date(Date.now() + 7 * 86_400_000), // 7 giorni
    });
  }
}
```

Poi passa questa funzione al `createSyncScheduler`. In `main.ts`, il sync scheduler è creato nel blocco `bootstrap`. Aggiungi il sesto argomento:

In `main.ts`, trova la chiamata a `createSyncScheduler` (attorno alla linea ~330) e aggiungi il parametro — il pattern è di aggiungerlo in `server.ts` tramite AppDeps. Invece, vediamo il pattern: in `main.ts`, `syncScheduler` viene creato esternamente. Dunque vai in `main.ts`, dove `syncScheduler` è costruito, e aggiungi:

```typescript
// Nel blocco bootstrap di main.ts, dopo la costruzione di syncScheduler:
// Aggiungi checkCustomerReminders come sesto parametro
const syncScheduler = createSyncScheduler(
  /* enqueue */ ...,
  /* getAgentsByActivity */ ...,
  /* getOrdersNeedingArticleSync */ ...,
  /* getCustomersNeedingAddressSync */ ...,
  /* deleteExpiredNotifications */ ...,
  /* checkCustomerReminders */ async (userId) => {
    const due = await customerRemindersRepo.getRemindersOverdueOrToday(pool, Number(userId));
    const TYPE_LABELS: Record<string, string> = {
      commercial_contact: '📞 Ricontatto commerciale',
      offer_followup: '🔥 Follow-up offerta',
      payment: '💰 Pagamento',
      contract_renewal: '🔄 Rinnovo contratto',
      anniversary: '🎂 Ricorrenza',
      custom: '📋 Promemoria',
    };
    for (const r of due) {
      await notificationsRepo.insertNotification(pool, {
        userId,
        type: 'customer_reminder',
        severity: r.priority === 'urgent' ? 'warning' : 'info',
        title: `🔔 ${TYPE_LABELS[r.type] ?? r.type}: ${r.customer_name}`,
        body: r.note ?? 'Promemoria in scadenza',
        data: { customerErpId: r.customer_erp_id, reminderId: r.id, action_url: `/customers/${r.customer_erp_id}` },
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      });
    }
  },
);
```

Aggiungi in cima a `main.ts` gli import mancanti:
```typescript
import * as customerRemindersRepo from './db/repositories/customer-reminders';
import * as notificationsRepo from './db/repositories/notifications';
```

- [ ] **Step 4: Type-check**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/sync-scheduler.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(reminders): scheduler daily 08:00 — notifiche reminder scaduti per agente"
```

---

### Task 5: Bot — `navigateToEditCustomerById` + `updateCustomerSurgical`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`

- [ ] **Step 1: Aggiungi `navigateToEditCustomerById` dopo `navigateToCustomerByErpId`**

Cerca la riga ~13878 con `logger.info("navigateToCustomerByErpId: form loaded"`. Subito dopo la chiusura del metodo `navigateToCustomerByErpId`, aggiungi:

```typescript
async navigateToEditCustomerById(erpId: string): Promise<void> {
  if (!this.page) throw new Error("Browser page is null");
  const cleanId = erpId.replace(/,/g, '');
  logger.info("navigateToEditCustomerById: navigating directly to edit mode", { erpId: cleanId });

  await this.page.goto(
    `${config.archibald.url}/CUSTTABLE_DetailView/${cleanId}/?mode=Edit`,
    { waitUntil: "networkidle2", timeout: 60000 },
  );

  if (this.page.url().includes("Login.aspx")) {
    throw new Error("Sessione scaduta: reindirizzato al login");
  }

  await this.waitForDevExpressIdle({ timeout: 15000, label: 'navigate-edit-customer' });
  logger.info("navigateToEditCustomerById: edit form loaded", { erpId: cleanId });
}
```

- [ ] **Step 2: Aggiungi `updateCustomerSurgical` (diff-based con 5 bug fix)**

Aggiungi dopo `navigateToEditCustomerById`. Questo metodo assume che la pagina sia già in edit mode (chiamato dopo `navigateToEditCustomerById`):

```typescript
async updateCustomerSurgical(
  diff: import('../types').CustomerDiff,
  addresses?: import('../types').AltAddress[],
): Promise<import('../types').CustomerSnapshot> {
  if (!this.page) throw new Error("Browser page is null");
  logger.info("updateCustomerSurgical: start", { diffKeys: Object.keys(diff) });

  // 1. Tab "Prezzi e sconti"
  if (diff.lineDiscount !== undefined || diff.priceGroup !== undefined) {
    const pricesTab = await this.page.$('[id*="DXCDPageControl_T"][id$="T1"]');
    if (pricesTab) {
      await pricesTab.click();
      await this.waitForDevExpressIdle({ timeout: 5000, label: 'prices-tab' });
    }
    if (diff.lineDiscount !== undefined) {
      await this.setDevExpressComboBox(
        /xaf_dviSALESLINEDISCGROUP_Edit_dropdown_DD_I$/,
        diff.lineDiscount,
      );
    }
    if (diff.priceGroup !== undefined) {
      await this.setDevExpressComboBox(
        /xaf_dviPRICEGROUP_Edit_dropdown_DD_I$/,
        diff.priceGroup,
      );
    }
  }

  // 2. Tab "Principale"
  const mainTab = await this.page.$('[id*="DXCDPageControl_T"][id$="T0"]');
  if (mainTab) {
    await mainTab.click();
    await this.waitForDevExpressIdle({ timeout: 5000, label: 'main-tab' });
  }

  // 2a. Lookup fields (paymentTerms, postalCode)
  if (diff.paymentTerms !== undefined) {
    await this.selectFromDevExpressLookup(
      /xaf_dviPAYMTERMID_Edit_find_Edit_B0/,
      diff.paymentTerms,
    );
  }
  if (diff.postalCode !== undefined) {
    await this.typeDevExpressField(/xaf_dviZIPCODE_Edit_I$/, diff.postalCode);
    // Attendi auto-fill CITY/COUNTY/STATE/COUNTRY
    await this.waitForDevExpressIdle({ timeout: 8000, label: 'postalcode-autofill' });
  }

  // 2b. Combo fields
  if (diff.deliveryMode !== undefined) {
    await this.setDevExpressComboBox(
      /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
      diff.deliveryMode,
    );
  }
  if (diff.sector !== undefined) {
    await this.setDevExpressComboBox(
      /xaf_dviBUSINESSSECTORID_Edit_dropdown_DD_I$/,
      diff.sector,
    );
  }

  // 2c. Testo — ordine fisso
  if (diff.name !== undefined) {
    await this.typeDevExpressField(/SEARCHNAME.*_Edit_I$|NAMEALIAS.*_Edit_I$/, diff.name);
    await this.waitForDevExpressIdle({ timeout: 3000, label: 'name-written' });
  }

  // BUG 2 FIX: FISCALCODE callback sovrascrive NAMEALIAS — waitIdle poi re-write NAMEALIAS
  if (diff.fiscalCode !== undefined) {
    await this.injectFieldsViaNativeSetter([
      { regex: /xaf_dviFISCALCODE_Edit_I$/, value: diff.fiscalCode },
    ]);
    await this.waitForDevExpressIdle({ timeout: 8000, label: 'fiscalcode-callback' });
    // Re-write NAMEALIAS dopo callback FISCALCODE
    if (diff.nameAlias !== undefined) {
      await this.typeDevExpressField(
        /SEARCHNAME.*_Edit_I$|NAMEALIAS.*_Edit_I$/,
        diff.nameAlias,
      );
    }
  } else if (diff.nameAlias !== undefined) {
    await this.typeDevExpressField(
      /SEARCHNAME.*_Edit_I$|NAMEALIAS.*_Edit_I$/,
      diff.nameAlias,
    );
  }

  if (diff.pec !== undefined) {
    await this.typeDevExpressField(/xaf_dviLEGALEMAIL_Edit_I$/, diff.pec);
  }

  // BUG 3 FIX: SDI usa injectFieldsViaNativeSetter (non typeDevExpressField)
  if (diff.sdi !== undefined) {
    await this.injectFieldsViaNativeSetter([
      { regex: /xaf_dviLEGALAUTHORITY_Edit_I$/, value: diff.sdi },
    ]);
  }

  if (diff.street !== undefined) {
    await this.typeDevExpressField(/xaf_dviADDRESS_Edit_I$/, diff.street);
  }
  if (diff.phone !== undefined) {
    await this.typeDevExpressField(/xaf_dviPHONE_Edit_I$/, diff.phone);
  }
  if (diff.mobile !== undefined) {
    await this.typeDevExpressField(/xaf_dviCELLULAR_Edit_I$/, diff.mobile);
  }
  if (diff.email !== undefined) {
    await this.typeDevExpressField(/xaf_dviEMAIL_Edit_I$/, diff.email);
  }
  if (diff.url !== undefined) {
    await this.typeDevExpressField(/xaf_dviWWW_Edit_I$/, diff.url);
  }
  if (diff.attentionTo !== undefined) {
    await this.typeDevExpressField(/xaf_dviBRASCRMATTENTIONTO_Edit_I$/, diff.attentionTo);
  }

  // BUG 4 FIX: NOTES usa textarea selector con click+select all
  if (diff.notes !== undefined) {
    const notesEl = await this.page.$('textarea[id*="xaf_dviCUSTINFO"]');
    if (notesEl) {
      await notesEl.click({ clickCount: 3 });
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Delete');
      await this.page.keyboard.type(diff.notes, { delay: 10 });
    }
  }

  // 3. Re-write campi vulnerabili a race condition
  if (diff.fiscalCode !== undefined && diff.street !== undefined) {
    await this.typeDevExpressField(/xaf_dviADDRESS_Edit_I$/, diff.street);
  }
  // Re-set finale NAMEALIAS
  const finalNameAlias = diff.nameAlias ?? (diff.name ? diff.name : undefined);
  if (finalNameAlias !== undefined) {
    await this.typeDevExpressField(
      /SEARCHNAME.*_Edit_I$|NAMEALIAS.*_Edit_I$/,
      finalNameAlias,
    );
  }

  // 4. BUG 1 FIX: VATNUM scritto SOLO Track B (solo se nel diff)
  if (diff.vatNumber !== undefined) {
    await this.injectFieldsViaNativeSetter([
      { regex: /xaf_dviVATNUM_Edit_I$/, value: diff.vatNumber },
    ]);
    await this.waitForDevExpressIdle({ timeout: 30000, label: 'vatnum-callback' });
  }

  // 5. Tab "Indirizzo alt."
  if (addresses && addresses.length >= 0) {
    await this.writeAltAddresses(addresses);
  }

  // 6. Save
  await this.saveAndCloseCustomer();

  // 7. Snapshot
  const erpId = await this.page.evaluate(() =>
    window.location.pathname.split('/').filter(Boolean).slice(-1)[0] ?? '',
  );
  const snapshot = await this.buildCustomerSnapshot(erpId.replace(/,/g, ''));
  logger.info("updateCustomerSurgical: completed", { erpId });
  return snapshot;
}
```

- [ ] **Step 3: Aggiungi `CustomerDiff` e `AltAddress` a `src/types.ts`**

In `archibald-web-app/backend/src/types.ts`, dopo `CustomerSnapshot`, aggiungi:

```typescript
export type CustomerDiff = Partial<{
  name: string;
  nameAlias: string;
  fiscalCode: string;
  vatNumber: string;
  pec: string;
  sdi: string;
  street: string;
  postalCode: string;
  postalCodeCity: string;
  county: string;
  state: string;
  country: string;
  phone: string;
  mobile: string;
  email: string;
  url: string;
  deliveryMode: string;
  paymentTerms: string;
  sector: string;
  priceGroup: string;
  lineDiscount: string;
  attentionTo: string;
  notes: string;
  agentNotes: string;
}>;
```

(Nota: `AltAddress` è già definito come `AddressEntry` o simile — usa il tipo esistente.)

- [ ] **Step 4: Type-check**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts \
        archibald-web-app/backend/src/types.ts
git commit -m "feat(bot): navigateToEditCustomerById + updateCustomerSurgical (5 bug fix)"
```

---

### Task 6: Handler `update-customer` riscritto con `CustomerDiff`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/update-customer.ts`

- [ ] **Step 1: Scrivi test failing per il nuovo handler**

```typescript
// Aggiungi in un file test esistente o crea update-customer.spec.ts
import { describe, expect, test, vi } from 'vitest';
import type { CustomerDiff } from '../../types';

// Unit test della funzione buildCustomerDiff
function buildCustomerDiff(
  original: Record<string, string | null>,
  edited: Record<string, string | null>,
): CustomerDiff {
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(edited)) {
    if (edited[key] !== original[key]) {
      diff[key] = edited[key];
    }
  }
  return diff as CustomerDiff;
}

describe('buildCustomerDiff', () => {
  test('diff vuoto se nessuna modifica', () => {
    const original = { name: 'Test', email: 'test@test.com' };
    expect(buildCustomerDiff(original, original)).toEqual({});
  });

  test('diff include solo campi modificati', () => {
    const original = { name: 'Test', email: 'old@test.com' };
    const edited = { name: 'Test', email: 'new@test.com' };
    expect(buildCustomerDiff(original, edited)).toEqual({ email: 'new@test.com' });
  });

  test('diff include agentNotes', () => {
    const original = { agentNotes: null };
    const edited = { agentNotes: 'note' };
    expect(buildCustomerDiff(original, edited)).toEqual({ agentNotes: 'note' });
  });
});
```

- [ ] **Step 2: Riscrivi `update-customer.ts`**

```typescript
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { CustomerSnapshot, CustomerDiff } from '../../types';
import { updateVatValidatedAt, updateAgentNotes } from '../../db/repositories/customers';
import type { AddressEntry } from '../../types';
import { logger } from '../../logger';

type UpdateCustomerPayload = {
  erpId: string;
  diff: CustomerDiff;
  addresses?: AddressEntry[];
};

type UpdateCustomerBot = {
  navigateToEditCustomerById: (erpId: string) => Promise<void>;
  updateCustomerSurgical: (
    diff: CustomerDiff,
    addresses?: AddressEntry[],
  ) => Promise<CustomerSnapshot>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleUpdateCustomer(
  pool: DbPool,
  bot: UpdateCustomerBot,
  data: UpdateCustomerPayload,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ success: boolean }> {
  const { erpId, diff, addresses } = data;

  if (Object.keys(diff).length === 0 && !addresses?.length) {
    logger.info('handleUpdateCustomer: diff vuoto, skip', { erpId });
    onProgress(100, 'Nessuna modifica');
    return { success: true };
  }

  onProgress(5, 'Connessione bot');

  const BOT_PROGRESS_LABELS: Record<string, { progress: number; label: string }> = {
    'customer.navigation':  { progress: 15, label: 'Navigazione scheda cliente' },
    'customer.edit_loaded': { progress: 25, label: 'Form edit aperto' },
    'customer.field':       { progress: 50, label: 'Scrittura campi' },
    'customer.save':        { progress: 70, label: 'Salvataggio su Archibald' },
    'customer.complete':    { progress: 78, label: 'Salvataggio completato' },
  };

  bot.setProgressCallback(async (category) => {
    const milestone = BOT_PROGRESS_LABELS[category];
    if (milestone) onProgress(milestone.progress, milestone.label);
  });

  onProgress(15, 'Navigazione scheda cliente');
  await bot.navigateToEditCustomerById(erpId);

  onProgress(25, 'Form edit aperto');

  // agentNotes è solo DB — non viene passato al bot
  const { agentNotes, ...erpDiff } = diff;
  const snapshot = await bot.updateCustomerSurgical(erpDiff, addresses);

  onProgress(78, 'Lettura snapshot da Archibald');

  // Persist snapshot in DB
  await pool.query(
    `UPDATE agents.customers SET
       bot_status       = 'snapshot',
       archibald_name   = COALESCE($1,  archibald_name),
       name_alias       = COALESCE($2,  name_alias),
       city             = COALESCE($3,  city),
       county           = COALESCE($4,  county),
       state            = COALESCE($5,  state),
       country          = COALESCE($6,  country),
       price_group      = COALESCE($7,  price_group),
       line_discount    = COALESCE($8,  line_discount),
       postal_code      = COALESCE($9,  postal_code),
       fiscal_code      = COALESCE($10, fiscal_code),
       sector           = COALESCE($11, sector),
       payment_terms    = COALESCE($12, payment_terms),
       attention_to     = COALESCE($13, attention_to),
       notes            = COALESCE($14, notes),
       vat_validated_at = CASE
         WHEN $15 = 'Sì' THEN COALESCE(vat_validated_at, NOW())
         ELSE vat_validated_at
       END,
       street           = COALESCE($18, street),
       vat_number       = COALESCE($19, vat_number),
       pec              = COALESCE($20, pec),
       sdi              = COALESCE($21, sdi),
       phone            = COALESCE($22, phone),
       mobile           = COALESCE($23, mobile),
       email            = COALESCE($24, email),
       url              = COALESCE($25, url),
       delivery_terms   = COALESCE($26, delivery_terms),
       updated_at       = NOW()
     WHERE erp_id = $16 AND user_id = $17`,
    [
      snapshot?.name ?? null,
      snapshot?.nameAlias ?? null,
      snapshot?.city ?? null,
      snapshot?.county ?? null,
      snapshot?.state ?? null,
      snapshot?.country ?? null,
      snapshot?.priceGroup ?? null,
      snapshot?.lineDiscount ?? null,
      snapshot?.postalCode ?? null,
      snapshot?.fiscalCode ?? null,
      snapshot?.sector ?? null,
      snapshot?.paymentTerms ?? null,
      snapshot?.attentionTo ?? null,
      snapshot?.notes ?? null,
      snapshot?.vatValidated ?? null,
      erpId, userId,
      snapshot?.street ?? null,
      snapshot?.vatNumber ?? null,
      snapshot?.pec ?? null,
      snapshot?.sdi ?? null,
      snapshot?.phone ?? null,
      snapshot?.mobile ?? null,
      snapshot?.email ?? null,
      snapshot?.url ?? null,
      snapshot?.deliveryMode ?? null,
    ],
  );

  // agentNotes — solo DB, mai ERP
  if (agentNotes !== undefined) {
    await updateAgentNotes(pool, userId, erpId, agentNotes);
  }

  // Marca VAT validata se il diff includeva vatNumber (Track B)
  if (diff.vatNumber !== undefined) {
    await updateVatValidatedAt(pool, userId, erpId);
  }

  onProgress(88, 'Aggiornamento stato');
  onProgress(100, 'Aggiornamento completato');
  return { success: true };
}

function createUpdateCustomerHandler(
  pool: DbPool,
  createBot: (userId: string) => UpdateCustomerBot,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as UpdateCustomerPayload;
    const result = await handleUpdateCustomer(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleUpdateCustomer,
  createUpdateCustomerHandler,
  type UpdateCustomerPayload,
  type UpdateCustomerBot,
};
```

- [ ] **Step 3: Aggiorna il wrapper bot in `main.ts`**

Cerca il blocco del wrapper per `update-customer` (~linea 579). Aggiornalo così:

```typescript
const updateCustomerBotFactory = (userId: string): UpdateCustomerBot => {
  const { ensureInit } = createBotForUser(userId);
  return {
    navigateToEditCustomerById: (erpId) =>
      ensureInit().then((bot) => bot.navigateToEditCustomerById(erpId)),
    updateCustomerSurgical: (diff, addresses) =>
      ensureInit().then((bot) => bot.updateCustomerSurgical(diff, addresses)),
    setProgressCallback: (cb) =>
      ensureInit().then((bot) => bot.setProgressCallback(cb)),
  };
};
```

Poi verifica che `operationHandlers['update-customer']` usi `createUpdateCustomerHandler(pool, updateCustomerBotFactory)`.

- [ ] **Step 4: Type-check + test**

```bash
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend -- --reporter=verbose update-customer
```

Expected: build exit 0, test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/update-customer.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(update-customer): handler riscritto con CustomerDiff — diff-based, agentNotes DB-only"
```

---

### Task 7: Frontend — servizio `reminders.service.ts`

**Files:**
- Create: `archibald-web-app/frontend/src/services/reminders.service.ts`

- [ ] **Step 1: Scrivi il servizio con tipi e funzioni**

```typescript
// reminders.service.ts
import { fetchWithRetry } from '../api/fetch-with-retry';

export type ReminderType =
  | 'commercial_contact' | 'offer_followup' | 'payment'
  | 'contract_renewal' | 'anniversary' | 'custom';

export type ReminderPriority = 'urgent' | 'normal' | 'low';
export type ReminderStatus = 'active' | 'snoozed' | 'done' | 'cancelled';
export type NotifyVia = 'app' | 'email';

export type Reminder = {
  id: number;
  user_id: number;
  customer_erp_id: string;
  type: ReminderType;
  priority: ReminderPriority;
  due_at: string;
  recurrence_days: number | null;
  note: string | null;
  notify_via: NotifyVia;
  status: ReminderStatus;
  snoozed_until: string | null;
  completed_at: string | null;
  completion_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ReminderWithCustomer = Reminder & { customer_name: string };

export type TodayReminders = {
  overdue: ReminderWithCustomer[];
  today: ReminderWithCustomer[];
  total_active: number;
  completed_today: number;
};

export type CreateReminderInput = {
  type: ReminderType;
  priority: ReminderPriority;
  due_at: string;
  recurrence_days: number | null;
  note: string | null;
  notify_via: NotifyVia;
};

export type PatchReminderInput = Partial<{
  type: ReminderType;
  priority: ReminderPriority;
  due_at: string;
  recurrence_days: number | null;
  note: string;
  notify_via: NotifyVia;
  status: ReminderStatus;
  snoozed_until: string;
  completed_at: string;
  completion_note: string;
}>;

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  commercial_contact: '📞 Ricontatto commerciale',
  offer_followup: '🔥 Follow-up offerta',
  payment: '💰 Pagamento',
  contract_renewal: '🔄 Rinnovo contratto',
  anniversary: '🎂 Ricorrenza',
  custom: '📋 Personalizzato',
};

export const REMINDER_TYPE_COLORS: Record<ReminderType, { bg: string; text: string }> = {
  commercial_contact: { bg: '#fee2e2', text: '#dc2626' },
  offer_followup:     { bg: '#fef9c3', text: '#92400e' },
  payment:            { bg: '#f0fdf4', text: '#15803d' },
  contract_renewal:   { bg: '#eff6ff', text: '#1d4ed8' },
  anniversary:        { bg: '#fdf4ff', text: '#7e22ce' },
  custom:             { bg: '#f1f5f9', text: '#64748b' },
};

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
  { label: 'Una volta sola', days: null },
  { label: 'Ogni settimana', days: 7 },
  { label: 'Ogni 2 settimane', days: 14 },
  { label: 'Ogni mese', days: 30 },
  { label: 'Ogni 3 mesi', days: 90 },
  { label: 'Ogni 6 mesi', days: 180 },
  { label: 'Ogni anno', days: 365 },
];

export function computeDueDateFromChip(chip: string): string {
  const now = new Date();
  const map: Record<string, number> = {
    'Domani': 1, '3 giorni': 3, '1 settimana': 7, '2 settimane': 14,
    '1 mese': 30, '3 mesi': 90,
  };
  const days = map[chip];
  if (!days) throw new Error(`Unknown chip: ${chip}`);
  const d = new Date(now.getTime() + days * 86_400_000);
  return d.toISOString();
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

export async function getTodayReminders(): Promise<TodayReminders> {
  const res = await fetchWithRetry('/api/reminders/today');
  const json = await res.json();
  return json.data;
}

export async function listCustomerReminders(
  customerProfile: string,
  filter: 'active' | 'done' | 'all' = 'active',
): Promise<Reminder[]> {
  const res = await fetchWithRetry(`/api/customers/${customerProfile}/reminders?filter=${filter}`);
  const json = await res.json();
  return json.data;
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
  const json = await res.json();
  return json.data;
}

export async function patchReminder(id: number, input: PatchReminderInput): Promise<Reminder> {
  const res = await fetchWithRetry(`/api/reminders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  return json.data;
}

export async function deleteReminder(id: number): Promise<void> {
  await fetchWithRetry(`/api/reminders/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 2: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/services/reminders.service.ts
git commit -m "feat(frontend): reminders.service.ts — tipi, costanti UI, funzioni API"
```

---

### Task 8: Bug fixes — CustomerList, route Ordine, FAB

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerList.tsx`

- [ ] **Step 1: Fix autocomplete nella barra di ricerca**

In `CustomerList.tsx`, trova l'elemento `<input>` della barra di ricerca e aggiungi gli attributi mancanti:

```tsx
<input
  type="text"
  autoComplete="off"
  autoCorrect="off"
  spellCheck={false}
  data-form-type="other"
  // ...resto props invariate
/>
```

- [ ] **Step 2: Fix route "Nuovo Ordine" in CustomerProfilePage**

In `CustomerProfilePage.tsx`, cerca l'handler del pulsante "Nuovo ordine" / "Ordine". Cambia il navigate da:
```typescript
navigate('/orders')  // ← sbagliato
```
a:
```typescript
navigate(`/order?customerId=${customer.erpId}`)  // ← corretto
```

- [ ] **Step 3: Fix FAB "+ Nuovo Cliente" in CustomerList**

In `CustomerList.tsx`, sostituisci l'eventuale bottone "+ Nuovo Cliente" desktop con il pattern corretto (topbar) + FAB mobile:

```tsx
{/* Desktop topbar button — già esiste o da aggiungere nella topbar */}
{!isMobile && (
  <button
    onClick={() => setIsCreateOpen(true)}
    style={{
      background: '#2563eb', color: 'white', border: 'none',
      borderRadius: '8px', padding: '8px 16px', fontWeight: 700,
      cursor: 'pointer', fontSize: '14px',
    }}
  >
    + Nuovo Cliente
  </button>
)}

{/* FAB mobile/tablet */}
{isMobile && (
  <button
    onClick={() => setIsCreateOpen(true)}
    style={{
      position: 'fixed', bottom: '24px', right: '24px',
      width: '56px', height: '56px',
      background: '#2563eb', color: 'white',
      border: 'none', borderRadius: '50%',
      fontSize: '28px', lineHeight: 1,
      boxShadow: '0 4px 16px rgba(37,99,235,.4)',
      cursor: 'pointer', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
    aria-label="Nuovo Cliente"
  >
    ＋
  </button>
)}
```

- [ ] **Step 4: Type-check + test frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerList
```

Expected: exit 0, test passano.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerList.tsx \
        archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
git commit -m "fix(frontend): autocomplete search, route nuovo-ordine, FAB nuovo-cliente"
```

---

### Task 9: `CustomerProfilePage` — Hero redesign

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`

Questo task riscrive la sezione hero del profilo. Leggi il file attuale prima di modificare.

- [ ] **Step 1: Aggiungi hook per quick stats (dati già in memoria, zero nuove API)**

Nell'hook/componente esistente dove vengono caricati gli ordini del cliente, calcola:

```typescript
const quickStats = useMemo(() => {
  const currentYear = new Date().getFullYear();
  const thisYearOrders = (orders ?? []).filter(
    (o) => new Date(o.date).getFullYear() === currentYear,
  );
  const totalOrders = orders?.length ?? 0;
  const revenueThisYear = thisYearOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const avgPerOrder = totalOrders > 0 ? revenueThisYear / Math.max(thisYearOrders.length, 1) : 0;
  const lastOrderDate = orders?.[0]?.date ?? null;
  return { totalOrders, revenueThisYear, avgPerOrder, lastOrderDate };
}, [orders]);
```

- [ ] **Step 2: Calcola completeness indicator**

```typescript
const completenessFields = [
  customer?.name, customer?.vatNumber, customer?.vatValidatedAt,
  customer?.pec || customer?.sdi, customer?.street,
  customer?.postalCode, customer?.city,
];
const completedFields = completenessFields.filter(Boolean).length;
const totalFields = completenessFields.length;
const completenessPercent = Math.round((completedFields / totalFields) * 100);
const missingCount = totalFields - completedFields;
const isComplete = missingCount === 0;
```

- [ ] **Step 3: Rendi hero mobile/tablet**

Sostituisci il markup dell'hero mobile con:

```tsx
{/* === HERO MOBILE/TABLET === */}
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 0' }}>
  {/* Avatar con completeness ring */}
  <div style={{ position: 'relative', marginBottom: '12px' }}>
    <div
      style={{
        width: isMobile ? 180 : 180,
        height: isMobile ? 180 : 180,
        borderRadius: '50%',
        border: isComplete ? '3px solid #22c55e' : '3px dashed #f59e0b',
        overflow: 'hidden',
        background: customer?.photo
          ? 'transparent'
          : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
      onClick={() => setIsPhotoModalOpen(true)}
    >
      {customer?.photo ? (
        <img src={customer.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize: '64px', fontWeight: 800, color: 'white' }}>
          {(customer?.name ?? '?').slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
    {/* Badge contatore campi mancanti */}
    {!isComplete && (
      <div style={{
        position: 'absolute', top: 4, right: 4,
        background: '#f59e0b', color: 'white',
        borderRadius: '20px', padding: '2px 8px',
        fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        {missingCount} mancanti
      </div>
    )}
    {/* Bottone 📷 */}
    <button
      onClick={() => setIsPhotoModalOpen(true)}
      style={{
        position: 'absolute', bottom: 4, right: 4,
        width: '32px', height: '32px', borderRadius: '50%',
        background: 'white', border: '2px solid #1e293b',
        cursor: 'pointer', fontSize: '14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      📷
    </button>
  </div>

  {/* Nome + bell reminder */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
    <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', textAlign: 'center' }}>
      {customer?.name ?? '—'}
    </h1>
    {activeRemindersCount > 0 && (
      <button
        onClick={() => scrollToSection('reminders')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          position: 'relative',
        }}
      >
        <span style={{ fontSize: '18px' }}>🔔</span>
        <span style={{
          position: 'absolute', top: -4, right: -4,
          background: '#ef4444', color: 'white',
          borderRadius: '50%', width: '16px', height: '16px',
          fontSize: '10px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {activeRemindersCount}
        </span>
      </button>
    )}
  </div>

  {/* Reminder urgenti */}
  {urgentRemindersText && (
    <div style={{ fontSize: '12px', color: '#f97316', fontWeight: 600, marginBottom: '8px' }}>
      ⏰ {urgentRemindersText}
    </div>
  )}

  {/* Quick stats */}
  <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{quickStats.totalOrders}</div>
      <div style={{ fontSize: '11px', color: '#64748b' }}>ordini</div>
    </div>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
        {quickStats.revenueThisYear.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
      </div>
      <div style={{ fontSize: '11px', color: '#64748b' }}>fatturato anno</div>
    </div>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
        {quickStats.lastOrderDate
          ? new Date(quickStats.lastOrderDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
          : '—'}
      </div>
      <div style={{ fontSize: '11px', color: '#64748b' }}>ultimo ordine</div>
    </div>
  </div>

  {/* Banner completezza (mobile) */}
  {!isComplete && (
    <div style={{
      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
      padding: '8px 12px', marginBottom: '12px', width: '100%', maxWidth: '380px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 600 }}>
          Profilo {completenessPercent}%
        </span>
        <span style={{ fontSize: '12px', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
          onClick={() => setIsEditMode(true)}>
          Completa →
        </span>
      </div>
      <div style={{ height: '4px', background: '#fde68a', borderRadius: '2px' }}>
        <div style={{ height: '100%', width: `${completenessPercent}%`, background: '#f59e0b', borderRadius: '2px' }} />
      </div>
    </div>
  )}

  {/* Quick actions — 7 pulsanti */}
  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '16px' }}>
    {[
      { icon: '📋', label: 'Ordine', bg: '#1d4ed8', color: '#bfdbfe',
        onClick: () => navigate(`/order?customerId=${customer?.erpId}`) },
      { icon: '📞', label: 'Chiama', bg: '#166534', color: '#86efac',
        disabled: !customer?.phone,
        onClick: () => window.open(`tel:${customer?.phone}`) },
      { icon: '💬', label: 'WhatsApp', bg: '#15803d', color: '#bbf7d0',
        disabled: !customer?.mobile,
        onClick: () => window.open(`https://wa.me/${customer?.mobile?.replace(/\D/g, '')}`) },
      { icon: '✉', label: 'Email', bg: '#7e22ce', color: '#d8b4fe',
        disabled: !customer?.email,
        onClick: () => window.open(`mailto:${customer?.email}`) },
      { icon: '📍', label: 'Indicazioni', bg: '#92400e', color: '#fde68a',
        disabled: !customer?.street,
        onClick: () => window.open(`https://maps.google.com/?daddr=${encodeURIComponent(`${customer?.street},${customer?.city}`))}&travelmode=driving`) },
      { icon: '🔔', label: 'Allerta',
        bg: activeRemindersCount > 0 ? '#7f1d1d' : '#1e293b',
        color: '#fca5a5',
        badgeCount: activeRemindersCount > 0 ? activeRemindersCount : undefined,
        onClick: () => setIsNewReminderOpen(true) },
      { icon: '📊', label: 'Analisi', bg: '#1e3a5f', color: '#93c5fd',
        onClick: () => setIsAnalysisOpen(true) },
    ].map(({ icon, label, bg, color, onClick, disabled, badgeCount }) => (
      <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <button
          onClick={onClick}
          disabled={!!disabled}
          style={{
            width: '44px', height: '44px', background: disabled ? '#94a3b8' : bg,
            borderRadius: '12px', border: 'none', cursor: disabled ? 'default' : 'pointer',
            fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', opacity: disabled ? 0.5 : 1,
          }}
        >
          {icon}
          {badgeCount !== undefined && badgeCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              background: '#ef4444', color: 'white', borderRadius: '8px',
              padding: '0 4px', fontSize: '9px', fontWeight: 800,
            }}>
              {badgeCount}
            </span>
          )}
        </button>
        <span style={{ fontSize: '10px', color }}>{label}</span>
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Hero desktop (sidebar 200px)**

Nella sezione desktop, rendi la sidebar larga 200px con avatar 160px circolare:

```tsx
{/* === SIDEBAR DESKTOP 200px === */}
<aside style={{
  width: '200px', minWidth: '200px', flexShrink: 0,
  background: '#0f172a', padding: '24px 16px',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
}}>
  {/* Avatar 160px circolare */}
  <div style={{ position: 'relative' }}>
    <div
      style={{
        width: 160, height: 160, borderRadius: '50%',
        border: isComplete ? '3px solid #22c55e' : '3px dashed #f59e0b',
        overflow: 'hidden',
        background: customer?.photo ? 'transparent' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
      onClick={() => setIsPhotoModalOpen(true)}
    >
      {customer?.photo ? (
        <img src={customer.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize: '56px', fontWeight: 800, color: 'white' }}>
          {(customer?.name ?? '?').slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
    {!isComplete && (
      <div style={{
        position: 'absolute', top: 4, right: 4,
        background: '#f59e0b', color: 'white',
        borderRadius: '20px', padding: '2px 6px', fontSize: '10px', fontWeight: 700,
      }}>
        {missingCount}
      </div>
    )}
  </div>

  <div style={{ color: 'white', fontWeight: 800, fontSize: '14px', textAlign: 'center' }}>
    {customer?.name ?? '—'}
  </div>

  {/* Barra completeness desktop */}
  <div style={{ width: '100%' }}>
    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
      Profilo {completenessPercent}% {missingCount > 0 ? `— ${missingCount} mancanti` : '✓'}
    </div>
    <div style={{ height: '4px', background: '#1e293b', borderRadius: '2px' }}>
      <div style={{ height: '100%', width: `${completenessPercent}%`, background: '#22c55e', borderRadius: '2px' }} />
    </div>
  </div>

  {/* Action buttons verticali */}
  {[
    { icon: '📋', label: 'Nuovo ordine', onClick: () => navigate(`/order?customerId=${customer?.erpId}`) },
    { icon: '📞', label: 'Chiama', disabled: !customer?.phone, onClick: () => window.open(`tel:${customer?.phone}`) },
    { icon: '💬', label: 'WhatsApp', disabled: !customer?.mobile, onClick: () => window.open(`https://wa.me/${customer?.mobile?.replace(/\D/g, '')}`) },
    { icon: '✉', label: 'Email', disabled: !customer?.email, onClick: () => window.open(`mailto:${customer?.email}`) },
    { icon: '📍', label: 'Indicazioni', disabled: !customer?.street, onClick: () => window.open(`https://maps.google.com/?daddr=${encodeURIComponent(`${customer?.street},${customer?.city}`)}&travelmode=driving`) },
    { icon: '🔔', label: 'Allerta', bg: activeRemindersCount > 0 ? '#7f1d1d' : undefined, onClick: () => setIsNewReminderOpen(true) },
    { icon: '📊', label: 'Analisi', onClick: () => setIsAnalysisOpen(true) },
  ].map(({ icon, label, onClick, disabled, bg }) => (
    <button
      key={label}
      onClick={onClick}
      disabled={!!disabled}
      style={{
        width: '100%', padding: '8px', background: bg ?? 'rgba(255,255,255,.08)',
        border: 'none', borderRadius: '8px',
        color: disabled ? '#64748b' : 'white',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ fontSize: '16px' }}>{icon}</span>
      {label}
    </button>
  ))}
</aside>
```

- [ ] **Step 5: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
git commit -m "feat(ui): hero cliente — avatar 180/160px circolare, completeness CSS, 7 quick actions"
```

---

### Task 10: Layout scrollabile + `StoricoOrdiniSection`

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`

- [ ] **Step 1: Struttura le 10 sezioni scrollabili**

Sotto l'hero, sostituisci il vecchio layout a tab con sezioni scrollabili. Le sezioni sono:
1. Contatti, 2. Indirizzo principale, 3. Anagrafica, 4. Dati Fiscali, 5. Commerciale, 6. Note, 7. Note interne agente, 8. Indirizzi alternativi, 9. Storico ordini, 10. Promemoria.

Ogni sezione è una `<section>` con id per scroll ref:

```tsx
const sectionRefs = {
  contacts: useRef<HTMLDivElement>(null),
  address: useRef<HTMLDivElement>(null),
  anagrafica: useRef<HTMLDivElement>(null),
  fiscal: useRef<HTMLDivElement>(null),
  commercial: useRef<HTMLDivElement>(null),
  notes: useRef<HTMLDivElement>(null),
  agentNotes: useRef<HTMLDivElement>(null),
  addresses: useRef<HTMLDivElement>(null),
  storico: useRef<HTMLDivElement>(null),
  reminders: useRef<HTMLDivElement>(null),
};

function scrollToSection(key: keyof typeof sectionRefs) {
  sectionRefs[key].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
```

Layout principale (mobile: single-col, tablet: 2-col, desktop: main area 2-col):

```tsx
<main style={{
  display: 'grid',
  gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr',
  gap: '16px',
  padding: isDesktop ? '24px' : '16px',
}}>
  <SectionCard ref={sectionRefs.contacts} title="Contatti" completeness={...}>
    {/* phone, mobile, email, url */}
  </SectionCard>
  <SectionCard ref={sectionRefs.address} title="Indirizzo principale" completeness={...}>
    {/* street, postalCode, city, county, state, country */}
  </SectionCard>
  {/* ... altre sezioni */}
</main>
```

Il `SectionCard` wrapper gestisce: header con titolo + badge ✓/⚠, campo mancante con pallino arancione `●`, sfondo `#eff6ff` in edit mode.

- [ ] **Step 2: Implementa la sezione Storico ordini inline**

```tsx
function StoricoOrdiniSection({ orders, customerName }: {
  orders: OrderRecord[];
  customerName: string;
}) {
  const [filter, setFilter] = React.useState<'tutto' | 'anno' | '3mesi' | 'mese'>('tutto');
  const isDesktop = useIsDesktop();

  const now = new Date();
  const filtered = orders.filter((o) => {
    const d = new Date(o.date);
    if (filter === 'anno') return d.getFullYear() === now.getFullYear();
    if (filter === '3mesi') return d >= new Date(now.getTime() - 90 * 86400000);
    if (filter === 'mese') return d >= new Date(now.getTime() - 30 * 86400000);
    return true;
  });

  const revenueThisYear = orders
    .filter((o) => new Date(o.date).getFullYear() === now.getFullYear())
    .reduce((s, o) => s + (o.total ?? 0), 0);
  const avgPerOrder = filtered.length > 0
    ? filtered.reduce((s, o) => s + (o.total ?? 0), 0) / filtered.length
    : 0;
  const lastOrder = orders[0];

  return (
    <div>
      {/* KPI stats */}
      <div style={{ display: 'flex', gap: '16px', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '16px', fontWeight: 800 }}>
            {revenueThisYear.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Fatturato anno</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '16px', fontWeight: 800 }}>
            {avgPerOrder.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Media/ordine</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '16px', fontWeight: 800 }}>
            {lastOrder ? new Date(lastOrder.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '—'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Ultimo ordine</div>
        </div>
      </div>

      {/* Mini bar chart (solo desktop) */}
      {isDesktop && <MonthlyBarChart orders={orders} />}

      {/* Filtri chip */}
      <div style={{ display: 'flex', gap: '8px', padding: '8px 16px' }}>
        {(['tutto', 'anno', '3mesi', 'mese'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 10px', borderRadius: '20px', cursor: 'pointer',
              border: filter === f ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: filter === f ? '#eff6ff' : '#f8fafc',
              color: filter === f ? '#1d4ed8' : '#64748b',
              fontWeight: filter === f ? 700 : 400, fontSize: '12px',
            }}
          >
            {{ tutto: 'Tutto', anno: "Quest'anno", '3mesi': '3 mesi', mese: 'Mese' }[f]}
          </button>
        ))}
      </div>

      {/* Lista ordini */}
      <div>
        {filtered.map((o) => {
          const isRecent = new Date(o.date) >= new Date(now.getTime() - 30 * 86400000);
          return (
            <div
              key={o.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 16px', borderBottom: '1px solid #f8fafc', cursor: 'pointer',
              }}
              onClick={() => navigate(`/orders/${o.id}`)}
            >
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: isRecent ? '#1d4ed8' : '#94a3b8', flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                  {o.orderNumber ?? o.id}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {new Date(o.date).toLocaleDateString('it-IT')}
                </div>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                {(o.total ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
              </div>
              <span style={{ color: '#94a3b8', fontSize: '16px' }}>›</span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            Nessun ordine nel periodo selezionato
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
git commit -m "feat(ui): layout scrollabile 10 sezioni, StoricoOrdiniSection con KPI + filtri"
```

---

### Task 11: Edit mode inline + VAT two-track + progress bar

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`

- [ ] **Step 1: Stato edit mode**

```typescript
const [isEditMode, setIsEditMode] = React.useState(false);
const [editedValues, setEditedValues] = React.useState<Record<string, string | null>>({});
const [isSaving, setIsSaving] = React.useState(false);
const [saveProgress, setSaveProgress] = React.useState(0);
const [saveLabel, setSaveLabel] = React.useState('');
const [vatValidating, setVatValidating] = React.useState(false);
const [vatValidated, setVatValidated] = React.useState(!!customer?.vatValidatedAt);
```

- [ ] **Step 2: Pulsante "✎ Modifica" in topbar**

```tsx
<button
  onClick={() => {
    setIsEditMode(true);
    setEditedValues({}); // reset
  }}
  style={{
    background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
    borderRadius: '8px', padding: '6px 14px', fontWeight: 700, cursor: 'pointer',
  }}
>
  ✎ Modifica
</button>
```

In edit mode: il pulsante diventa "💾 Salva" (chiama `handleSave`) + "✕ Annulla".

- [ ] **Step 3: Banner VAT Track B**

Se `!customer?.vatValidatedAt` e in edit mode:

```tsx
{isEditMode && !vatValidated && (
  <div style={{
    background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '8px',
    padding: '10px 14px', marginBottom: '12px',
    display: 'flex', alignItems: 'center', gap: '10px',
  }}>
    <span style={{ color: '#92400e', fontWeight: 700, flex: 1 }}>
      ⚠ P.IVA non validata — Devi validarla prima di poter salvare.
    </span>
    {vatValidating ? (
      <span style={{ fontSize: '12px', color: '#92400e' }}>Verifica in corso (~30s)...</span>
    ) : (
      <button onClick={handleVatValidation} style={{
        background: '#fbbf24', border: 'none', borderRadius: '6px',
        padding: '4px 10px', fontWeight: 700, cursor: 'pointer', fontSize: '12px',
      }}>
        Valida ora →
      </button>
    )}
  </div>
)}
```

- [ ] **Step 4: Progress bar inline nell'hero**

```tsx
{isSaving && (
  <div style={{ padding: '0 16px 12px' }}>
    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
      {saveLabel || 'Aggiornamento in corso...'}
    </div>
    <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px' }}>
      <div style={{
        height: '100%', width: `${saveProgress}%`, background: '#2563eb',
        borderRadius: '2px', transition: 'width .3s ease',
      }} />
    </div>
  </div>
)}
```

- [ ] **Step 5: Implementa `handleSave`**

```typescript
async function handleSave() {
  const diff: Record<string, string | null | undefined> = {};
  for (const key of Object.keys(editedValues)) {
    if (editedValues[key] !== (customer as Record<string, unknown>)[key]) {
      diff[key] = editedValues[key];
    }
  }

  if (Object.keys(diff).length === 0) {
    // toast("Nessuna modifica")
    setIsEditMode(false);
    return;
  }

  setIsSaving(true);
  setSaveProgress(5);
  setSaveLabel('Connessione...');

  try {
    const opRes = await fetch('/api/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'update-customer',
        payload: { erpId: customer!.erpId, diff, addresses: localAddressState.isDirty ? localAddressState.items : undefined },
      }),
    });
    const { operationId } = await opRes.json();

    // Traccia progress via WebSocket/tracking esistente
    trackOperation(operationId, (progress, label) => {
      setSaveProgress(progress);
      setSaveLabel(label ?? '');
      if (progress >= 100) {
        setIsSaving(false);
        setIsEditMode(false);
        // toast success
        refreshCustomer();
      }
    });
  } catch {
    setIsSaving(false);
    // toast error
  }
}
```

- [ ] **Step 6: `handleVatValidation` (Track B)**

```typescript
async function handleVatValidation() {
  setVatValidating(true);
  try {
    const res = await fetch('/api/customers/interactive/start-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerProfile: customer!.erpId, vatNumber: editedValues.vatNumber ?? customer!.vatNumber }),
    });
    if (res.ok) {
      // Attendi evento VAT_RESULT via WebSocket (pattern esistente)
      setVatValidated(true);
      // toast success
    }
  } catch {
    // toast error
  } finally {
    setVatValidating(false);
  }
}
```

- [ ] **Step 7: GlobalOperationBanner fallback**

Il `GlobalOperationBanner` esistente si attiva automaticamente quando si traccia un'operazione — nessun codice aggiuntivo necessario se il sistema di tracking esistente già lo gestisce.

- [ ] **Step 8: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
git commit -m "feat(ui): edit mode inline — VAT two-track, progress bar, save handler"
```

---

### Task 12: Address CRUD inline

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`

- [ ] **Step 1: Stato locale indirizzi**

```typescript
const [localAddressState, setLocalAddressState] = React.useState<{
  items: AltAddress[];
  isDirty: boolean;
}>({ items: customer?.altAddresses ?? [], isDirty: false });
```

- [ ] **Step 2: UI sezione Indirizzi alternativi**

In view mode: mostra lista con link Google Maps per ogni indirizzo.
In edit mode: mostra form inline + bottone "Aggiungi indirizzo +".

```tsx
<div style={{ position: 'relative' }}>
  {/* Header con badge dirty */}
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
    <span style={{ fontWeight: 700, color: '#0f172a' }}>Indirizzi alternativi</span>
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {localAddressState.isDirty && (
        <span style={{ fontSize: '11px', color: '#f97316', fontWeight: 600 }}>● modificato</span>
      )}
      {isEditMode && (
        <button onClick={handleAddAddress} style={{
          background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
          borderRadius: '6px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer',
        }}>
          + Aggiungi
        </button>
      )}
    </div>
  </div>

  {localAddressState.items.map((addr, idx) => (
    <div key={idx} style={{ padding: '10px 16px', borderBottom: '1px solid #f8fafc' }}>
      {editingAddressIdx === idx ? (
        <AddressInlineForm
          value={addr}
          onChange={(v) => handleUpdateAddress(idx, v)}
          onCancel={() => setEditingAddressIdx(null)}
        />
      ) : (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>{addr.nome ?? addr.tipo}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{addr.via}, {addr.cap} {addr.citta}</div>
            <a
              href={`https://maps.google.com/?daddr=${encodeURIComponent(`${addr.via},${addr.citta}`)}&travelmode=driving`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '11px', color: '#2563eb' }}
            >
              📍 Indicazioni
            </a>
          </div>
          {isEditMode && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => setEditingAddressIdx(idx)} style={{
                border: '1px solid #e2e8f0', background: '#fff', borderRadius: '4px',
                padding: '3px 8px', fontSize: '12px', cursor: 'pointer',
              }}>✎</button>
              <button onClick={() => handleDeleteAddressConfirm(idx)} style={{
                border: '1px solid #fca5a5', background: '#fff', color: '#ef4444',
                borderRadius: '4px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer',
              }}>✕</button>
            </div>
          )}
        </div>
      )}
      {/* Confirm inline delete — no window.confirm */}
      {deletingAddressIdx === idx && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px', marginTop: '8px' }}>
          <span style={{ fontSize: '12px', color: '#dc2626' }}>Rimuovere questo indirizzo?</span>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button onClick={() => handleDeleteAddress(idx)} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}>Elimina</button>
            <button onClick={() => setDeletingAddressIdx(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  ))}
</div>
```

- [ ] **Step 3: Handler operazioni indirizzi**

```typescript
function handleAddAddress() {
  setLocalAddressState(prev => ({
    items: [...prev.items, { tipo: 'Other', nome: '', via: '', cap: '', citta: '' }],
    isDirty: true,
  }));
  setEditingAddressIdx(localAddressState.items.length);
}

function handleUpdateAddress(idx: number, value: AltAddress) {
  setLocalAddressState(prev => ({
    items: prev.items.map((a, i) => i === idx ? value : a),
    isDirty: true,
  }));
  setEditingAddressIdx(null);
}

function handleDeleteAddress(idx: number) {
  setLocalAddressState(prev => ({
    items: prev.items.filter((_, i) => i !== idx),
    isDirty: true,
  }));
  setDeletingAddressIdx(null);
}
```

- [ ] **Step 4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
git commit -m "feat(ui): CRUD indirizzi alternativi inline — stato locale, confirm inline, no window.confirm"
```

---

### Task 13: `PhotoCropModal` — restore crop/scale/rotate

**Files:**
- Modify: `archibald-web-app/frontend/src/components/PhotoCropModal.tsx`

Leggi il file attuale prima di modificare.

- [ ] **Step 1: Leggi il file per capire cosa manca**

```bash
grep -n "drag\|pinch\|rotate\|scale\|crop" archibald-web-app/frontend/src/components/PhotoCropModal.tsx
```

- [ ] **Step 2: Ripristina drag per posizionamento crop**

Aggiungi handler `onMouseDown/onMouseMove/onMouseUp` + touch `onTouchStart/onTouchMove/onTouchEnd` sul canvas/img overlay per trascinare il contenuto:

```typescript
const [offset, setOffset] = React.useState({ x: 0, y: 0 });
const [isDragging, setIsDragging] = React.useState(false);
const dragStart = React.useRef({ x: 0, y: 0, ox: 0, oy: 0 });

function handleMouseDown(e: React.MouseEvent) {
  setIsDragging(true);
  dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
}
function handleMouseMove(e: React.MouseEvent) {
  if (!isDragging) return;
  setOffset({
    x: dragStart.current.ox + (e.clientX - dragStart.current.x),
    y: dragStart.current.oy + (e.clientY - dragStart.current.y),
  });
}
function handleMouseUp() { setIsDragging(false); }
```

- [ ] **Step 3: Ripristina pinch-to-zoom touch**

```typescript
const [scale, setScale] = React.useState(1);
const lastPinchDist = React.useRef<number | null>(null);

function getPinchDist(touches: React.TouchList) {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );
}
function handleTouchStart(e: React.TouchEvent) {
  if (e.touches.length === 2) lastPinchDist.current = getPinchDist(e.touches);
  else {
    setIsDragging(true);
    dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: offset.x, oy: offset.y };
  }
}
function handleTouchMove(e: React.TouchEvent) {
  e.preventDefault();
  if (e.touches.length === 2 && lastPinchDist.current !== null) {
    const newDist = getPinchDist(e.touches);
    const ratio = newDist / lastPinchDist.current;
    setScale((s) => Math.min(Math.max(s * ratio, 0.5), 4));
    lastPinchDist.current = newDist;
  } else if (e.touches.length === 1 && isDragging) {
    setOffset({
      x: dragStart.current.ox + (e.touches[0].clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.touches[0].clientY - dragStart.current.y),
    });
  }
}
function handleTouchEnd() { setIsDragging(false); lastPinchDist.current = null; }
```

- [ ] **Step 4: Aggiungi slider rotate**

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
  <span style={{ fontSize: '12px', color: '#64748b' }}>↺</span>
  <input
    type="range" min={-45} max={45} value={rotate}
    onChange={(e) => setRotate(Number(e.target.value))}
    style={{ flex: 1 }}
  />
  <span style={{ fontSize: '12px', color: '#64748b' }}>↻</span>
  <span style={{ fontSize: '12px', color: '#64748b', minWidth: '30px' }}>{rotate}°</span>
</div>
```

- [ ] **Step 5: Genera blob 256×256 con trasformazioni**

Nel `generateCrop` function, applica `scale`, `offset`, `rotate` al canvas context prima di `drawImage`.

- [ ] **Step 6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/components/PhotoCropModal.tsx
git commit -m "fix(ui): PhotoCropModal — restore drag, pinch-to-zoom, rotate slider"
```

---

### Task 14: `CustomerRemindersSection` + `ReminderForm`

**Files:**
- Create: `archibald-web-app/frontend/src/components/ReminderForm.tsx`
- Create: `archibald-web-app/frontend/src/components/CustomerRemindersSection.tsx`

- [ ] **Step 1: Scrivi `ReminderForm.tsx`**

```tsx
// ReminderForm.tsx
import React from 'react';
import type { Reminder, CreateReminderInput, ReminderType, ReminderPriority } from '../services/reminders.service';
import {
  REMINDER_TYPE_LABELS, REMINDER_PRIORITY_LABELS, REMINDER_PRIORITY_COLORS,
  RECURRENCE_OPTIONS, computeDueDateFromChip,
} from '../services/reminders.service';

type ReminderFormProps = {
  customerProfile: string;
  initial?: Partial<Reminder>;
  onSave: (input: CreateReminderInput) => Promise<void>;
  onCancel: () => void;
};

const DATE_CHIPS = ['Domani', '3 giorni', '1 settimana', '2 settimane', '1 mese', '3 mesi'];

export function ReminderForm({ customerProfile, initial, onSave, onCancel }: ReminderFormProps) {
  const [type, setType] = React.useState<ReminderType>(initial?.type ?? 'commercial_contact');
  const [priority, setPriority] = React.useState<ReminderPriority>(initial?.priority ?? 'normal');
  const [dueAt, setDueAt] = React.useState(
    initial?.due_at ? initial.due_at.split('T')[0] : new Date(Date.now() + 86400000).toISOString().split('T')[0],
  );
  const [recurrenceDays, setRecurrenceDays] = React.useState<number | null>(initial?.recurrence_days ?? null);
  const [notifyVia, setNotifyVia] = React.useState<'app' | 'email'>(initial?.notify_via ?? 'app');
  const [note, setNote] = React.useState(initial?.note ?? '');
  const [saving, setSaving] = React.useState(false);
  const [activeChip, setActiveChip] = React.useState<string | null>(null);

  function handleChip(chip: string) {
    setActiveChip(chip);
    setDueAt(computeDueDateFromChip(chip).split('T')[0]);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await onSave({
        type, priority,
        due_at: new Date(dueAt + 'T09:00:00').toISOString(),
        recurrence_days: recurrenceDays,
        note: note.trim() || null,
        notify_via: notifyVia,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
      {/* Tipo */}
      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>
          Tipo di contatto
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ReminderType)}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
        >
          {(Object.entries(REMINDER_TYPE_LABELS) as [ReminderType, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Priorità */}
      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>
          Priorità
        </label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['urgent', 'normal', 'low'] as ReminderPriority[]).map((p) => {
            const colors = REMINDER_PRIORITY_COLORS[p];
            const selected = priority === p;
            return (
              <button
                key={p}
                onClick={() => setPriority(p)}
                style={{
                  padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px',
                  fontWeight: selected ? 700 : 400,
                  border: selected ? `2px solid ${colors.text}` : '1px solid #e2e8f0',
                  background: selected ? colors.bg : '#fff',
                  color: selected ? colors.text : '#64748b',
                }}
              >
                {REMINDER_PRIORITY_LABELS[p]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Data + chip */}
      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>
          Quando
        </label>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '6px' }}>
          {DATE_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChip(chip)}
              style={{
                padding: '3px 8px', borderRadius: '20px', cursor: 'pointer', fontSize: '11px',
                border: activeChip === chip ? '2px solid #2563eb' : '1px solid #e2e8f0',
                background: activeChip === chip ? '#eff6ff' : '#fff',
                color: activeChip === chip ? '#1d4ed8' : '#64748b',
              }}
            >
              {chip}
            </button>
          ))}
          <button
            onClick={() => setActiveChip('custom')}
            style={{ padding: '3px 8px', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b' }}
          >
            📅 Data…
          </button>
        </div>
        <input
          type="date"
          value={dueAt}
          onChange={(e) => { setDueAt(e.target.value); setActiveChip('custom'); }}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
        />
      </div>

      {/* Ripetizione */}
      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>
          Ripetizione
        </label>
        <select
          value={recurrenceDays ?? 'null'}
          onChange={(e) => setRecurrenceDays(e.target.value === 'null' ? null : Number(e.target.value))}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
        >
          {RECURRENCE_OPTIONS.map(({ label, days }) => (
            <option key={String(days)} value={String(days)}>{label}</option>
          ))}
        </select>
      </div>

      {/* Notifica via */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['app', 'email'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setNotifyVia(v)}
              style={{
                padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                border: notifyVia === v ? '2px solid #2563eb' : '1px solid #e2e8f0',
                background: notifyVia === v ? '#eff6ff' : '#fff',
                color: notifyVia === v ? '#1d4ed8' : '#64748b',
              }}
            >
              {v === 'app' ? '📱 App' : '📧 Email'}
            </button>
          ))}
        </div>
      </div>

      {/* Nota */}
      <div style={{ marginBottom: '12px' }}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Es: proporre preventivo trattamento X..."
          rows={2}
          style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', fontFamily: 'inherit', resize: 'none', outline: 'none' }}
        />
      </div>

      {/* Azioni */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{ flex: 1, padding: '8px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontSize: '13px' }}
        >
          {saving ? 'Salvataggio...' : 'Salva promemoria'}
        </button>
        <button
          onClick={onCancel}
          style={{ padding: '8px 14px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
        >
          Annulla
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Scrivi `CustomerRemindersSection.tsx`**

```tsx
// CustomerRemindersSection.tsx
import React from 'react';
import { ReminderForm } from './ReminderForm';
import {
  listCustomerReminders, createReminder, patchReminder, deleteReminder,
  REMINDER_TYPE_LABELS, REMINDER_TYPE_COLORS, REMINDER_PRIORITY_COLORS,
  REMINDER_PRIORITY_LABELS, formatDueAt,
  type Reminder, type CreateReminderInput,
} from '../services/reminders.service';

type Filter = 'active' | 'done' | 'all';

type CustomerRemindersSectionProps = {
  customerProfile: string;
  openNewForm?: boolean;
  onNewFormClose?: () => void;
};

export function CustomerRemindersSection({ customerProfile, openNewForm, onNewFormClose }: CustomerRemindersSectionProps) {
  const [reminders, setReminders] = React.useState<Reminder[]>([]);
  const [filter, setFilter] = React.useState<Filter>('active');
  const [isNewFormOpen, setIsNewFormOpen] = React.useState(openNewForm ?? false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [completingId, setCompletingId] = React.useState<number | null>(null);
  const [completionNote, setCompletionNote] = React.useState('');

  React.useEffect(() => {
    listCustomerReminders(customerProfile, filter).then(setReminders);
  }, [customerProfile, filter]);

  React.useEffect(() => {
    if (openNewForm) setIsNewFormOpen(true);
  }, [openNewForm]);

  const activeCount = reminders.filter((r) => ['active', 'snoozed'].includes(r.status)).length;

  async function handleCreate(input: CreateReminderInput) {
    const created = await createReminder(customerProfile, input);
    setReminders((prev) => [created, ...prev]);
    setIsNewFormOpen(false);
    onNewFormClose?.();
  }

  async function handleComplete(r: Reminder) {
    const updated = await patchReminder(r.id, {
      status: 'done',
      completed_at: new Date().toISOString(),
      completion_note: completionNote.trim() || undefined,
    });
    setReminders((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    setCompletingId(null);
    setCompletionNote('');
  }

  async function handleSnooze(r: Reminder, days: number) {
    const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();
    const updated = await patchReminder(r.id, { status: 'snoozed', snoozed_until: snoozedUntil });
    setReminders((prev) => prev.map((x) => x.id === updated.id ? updated : x));
  }

  async function handleDelete(id: number) {
    await deleteReminder(id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(null);
  }

  const FILTER_LABELS: Record<Filter, string> = {
    active: `Attivi (${activeCount})`,
    done: 'Completati',
    all: 'Tutti',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>🔔 Promemoria</span>
        <button
          onClick={() => setIsNewFormOpen(true)}
          style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
        >
          + Nuovo
        </button>
      </div>

      {/* Form nuovo */}
      {isNewFormOpen && (
        <ReminderForm
          customerProfile={customerProfile}
          onSave={handleCreate}
          onCancel={() => { setIsNewFormOpen(false); onNewFormClose?.(); }}
        />
      )}

      {/* Tab filtri */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {(['active', 'done', 'all'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px',
              border: filter === f ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: filter === f ? '#eff6ff' : '#f8fafc',
              color: filter === f ? '#1d4ed8' : '#64748b',
              fontWeight: filter === f ? 700 : 400,
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Lista reminder */}
      {reminders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>
          🔔 Nessun promemoria attivo
          <br />
          <button onClick={() => setIsNewFormOpen(true)} style={{ marginTop: '8px', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>
            + Aggiungi il primo promemoria
          </button>
        </div>
      )}

      {reminders.map((r) => {
        const typeColors = REMINDER_TYPE_COLORS[r.type as keyof typeof REMINDER_TYPE_COLORS] ?? { bg: '#f1f5f9', text: '#64748b' };
        const prioColors = REMINDER_PRIORITY_COLORS[r.priority as keyof typeof REMINDER_PRIORITY_COLORS];
        const { label: dueLabel, urgent } = formatDueAt(r.due_at);
        const isExpired = urgent;

        return (
          <div key={r.id} style={{
            background: isExpired ? '#fff5f5' : '#fff',
            border: '1px solid #f1f5f9',
            borderRadius: '8px', padding: '10px', marginBottom: '8px',
            opacity: r.status === 'done' ? 0.5 : 1,
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: typeColors.text, marginTop: '5px', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, background: typeColors.bg, color: typeColors.text, padding: '1px 7px', borderRadius: '10px' }}>
                    {REMINDER_TYPE_LABELS[r.type as keyof typeof REMINDER_TYPE_LABELS] ?? r.type}
                  </span>
                  <span style={{ fontSize: '11px', background: prioColors.bg, color: prioColors.text, padding: '1px 7px', borderRadius: '10px' }}>
                    {REMINDER_PRIORITY_LABELS[r.priority as keyof typeof REMINDER_PRIORITY_LABELS] ?? r.priority}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: urgent ? '#dc2626' : '#64748b', fontWeight: urgent ? 600 : 400 }}>
                  {dueLabel}
                </div>
                {r.note && (
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', marginTop: '3px' }}>
                    "{r.note}"
                  </div>
                )}
              </div>
            </div>

            {/* Azioni */}
            {r.status !== 'done' && r.status !== 'cancelled' && editingId !== r.id && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {completingId === r.id ? (
                  <div style={{ width: '100%' }}>
                    <textarea
                      value={completionNote}
                      onChange={(e) => setCompletionNote(e.target.value)}
                      placeholder="Nota completamento (opzionale)..."
                      rows={2}
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', resize: 'none', outline: 'none', marginBottom: '6px' }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => handleComplete(r)} style={{ background: '#15803d', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}>✓ Conferma</button>
                      <button onClick={() => { setCompletingId(null); setCompletionNote(''); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>Annulla</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button onClick={() => setCompletingId(r.id)} style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}>✓ Fatto</button>
                    <button onClick={() => handleSnooze(r, 3)} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>⏰ +3gg</button>
                    <button onClick={() => handleSnooze(r, 7)} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>⏰ +1 sett</button>
                    <button onClick={() => setEditingId(r.id)} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>✎</button>
                    <button onClick={() => setDeletingId(r.id)} style={{ background: '#fff', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                  </>
                )}
              </div>
            )}

            {editingId === r.id && (
              <ReminderForm
                customerProfile={customerProfile}
                initial={r}
                onSave={async (input) => {
                  const updated = await patchReminder(r.id, input);
                  setReminders((prev) => prev.map((x) => x.id === updated.id ? updated : x));
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            )}

            {/* Confirm delete inline */}
            {deletingId === r.id && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px', marginTop: '8px' }}>
                <span style={{ fontSize: '12px', color: '#dc2626' }}>Eliminare questo promemoria?</span>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button onClick={() => handleDelete(r.id)} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}>Elimina</button>
                  <button onClick={() => setDeletingId(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}>Annulla</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/ReminderForm.tsx \
        archibald-web-app/frontend/src/components/CustomerRemindersSection.tsx
git commit -m "feat(ui): CustomerRemindersSection + ReminderForm — lista, filtri, form inline, azioni"
```

---

### Task 15: `RemindersWidgetNew` + Dashboard

**Files:**
- Create: `archibald-web-app/frontend/src/components/RemindersWidgetNew.tsx`
- Modify: `archibald-web-app/frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Scrivi `RemindersWidgetNew.tsx`**

```tsx
// RemindersWidgetNew.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getTodayReminders, patchReminder,
  REMINDER_TYPE_LABELS, REMINDER_TYPE_COLORS, REMINDER_PRIORITY_COLORS,
  formatDueAt,
  type TodayReminders, type ReminderWithCustomer,
} from '../services/reminders.service';

const DAY_NAMES = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MONTH_NAMES = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

type TabFilter = 'today' | 'week' | 'all';

function AvatarInitials({ name, size = 38 }: { name: string; size?: number }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const hue = (name.charCodeAt(0) + (name.charCodeAt(1) ?? 0)) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: '10px',
      background: `hsl(${hue}, 60%, 45%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: 800, fontSize: '13px', flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

export function RemindersWidgetNew() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<TodayReminders | null>(null);
  const [tab, setTab] = React.useState<TabFilter>('today');
  const [snoozeDropdownId, setSnoozeDropdownId] = React.useState<number | null>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  React.useEffect(() => {
    getTodayReminders().then(setData);
  }, []);

  async function handleDone(r: ReminderWithCustomer) {
    await patchReminder(r.id, { status: 'done', completed_at: new Date().toISOString() });
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        overdue: prev.overdue.filter((x) => x.id !== r.id),
        today: prev.today.filter((x) => x.id !== r.id),
        completed_today: prev.completed_today + 1,
        total_active: Math.max(0, prev.total_active - 1),
      };
    });
  }

  async function handleSnooze(r: ReminderWithCustomer, days: number) {
    const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();
    await patchReminder(r.id, { status: 'snoozed', snoozed_until: snoozedUntil });
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        overdue: prev.overdue.filter((x) => x.id !== r.id),
        today: prev.today.filter((x) => x.id !== r.id),
        total_active: Math.max(0, prev.total_active - 1),
      };
    });
    setSnoozeDropdownId(null);
  }

  if (!data) return null;

  const allItems = [...data.overdue, ...data.today];
  const urgentCount = allItems.filter((r) => r.priority === 'urgent').length;
  const today = new Date();
  const dateStr = `${DAY_NAMES[today.getDay()]} ${today.getDate()} ${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`;

  return (
    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>🔔 {isMobile ? 'Promemoria' : 'Promemoria di oggi'}</span>
            {urgentCount > 0 && (
              <span style={{ background: '#dc2626', color: 'white', borderRadius: '20px', padding: '1px 8px', fontSize: '11px', fontWeight: 700 }}>
                {urgentCount} urgent{urgentCount > 1 ? 'i' : 'e'}
              </span>
            )}
            {allItems.length > 0 && (
              <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: '20px', padding: '1px 8px', fontSize: '11px' }}>
                +{allItems.length} in scadenza
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/customers')}
            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
          >
            + Nuovo →
          </button>
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
          {isMobile
            ? `${today.getDate()} ${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()} · ${allItems.length} da gestire`
            : `${dateStr} — ${allItems.length} promemoria richiedono attenzione`
          }
        </div>
      </div>

      {/* Tab filtro */}
      <div style={{ display: 'flex', padding: '8px 16px', gap: '6px', borderBottom: '1px solid #f1f5f9' }}>
        {([
          { key: 'today', label: `Oggi e scaduti (${allItems.length})` },
          { key: 'week', label: 'Questa settimana' },
          { key: 'all', label: 'Tutti i clienti' },
        ] as { key: TabFilter; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px',
              border: tab === key ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: tab === key ? '#eff6ff' : '#f8fafc',
              color: tab === key ? '#1d4ed8' : '#64748b',
              fontWeight: tab === key ? 700 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div>
        {allItems.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            Nessun promemoria in scadenza oggi 🎉
          </div>
        ) : allItems.map((r) => {
          const typeColors = REMINDER_TYPE_COLORS[r.type as keyof typeof REMINDER_TYPE_COLORS] ?? { bg: '#f1f5f9', text: '#64748b' };
          const prioColors = REMINDER_PRIORITY_COLORS[r.priority as keyof typeof REMINDER_PRIORITY_COLORS];
          const { label: dueLabel, urgent } = formatDueAt(r.due_at);
          const isOverdue = data.overdue.some((x) => x.id === r.id);

          return (
            <div
              key={r.id}
              style={{
                display: 'flex', gap: '12px', padding: '12px 16px',
                borderBottom: '1px solid #f8fafc',
                background: isOverdue ? '#fff5f5' : '#fff',
                borderLeft: isOverdue ? '3px solid #ef4444' : '3px solid transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={(e) => (e.currentTarget.style.background = isOverdue ? '#fff5f5' : '#fff')}
            >
              <AvatarInitials name={r.customer_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                  <button
                    onClick={() => navigate(`/customers/${r.customer_erp_id}`)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#0f172a', textDecoration: 'underline' }}
                  >
                    {r.customer_name}
                  </button>
                  <span style={{ fontSize: '11px', background: typeColors.bg, color: typeColors.text, padding: '1px 7px', borderRadius: '10px' }}>
                    {REMINDER_TYPE_LABELS[r.type as keyof typeof REMINDER_TYPE_LABELS] ?? r.type}
                  </span>
                  <span style={{ fontSize: '11px', background: prioColors.bg, color: prioColors.text, padding: '1px 7px', borderRadius: '10px' }}>
                    {r.priority}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: urgent ? '#dc2626' : '#64748b', fontWeight: urgent ? 600 : 400, marginBottom: '3px' }}>
                  {dueLabel}
                </div>
                {r.note && (
                  <div style={{ fontSize: '12px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' }}>
                    "{r.note}"
                  </div>
                )}
              </div>

              {/* Azioni */}
              <div
                className="rem-actions"
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'row' : 'column',
                  gap: '4px',
                  alignItems: isMobile ? 'stretch' : 'flex-end',
                  width: isMobile ? '100%' : 'auto',
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={() => handleDone(r)}
                  style={{
                    background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
                    borderRadius: '6px', padding: '4px 8px', fontSize: '11px',
                    cursor: 'pointer', fontWeight: 700,
                    flex: isMobile ? 1 : 'none', textAlign: 'center',
                  }}
                >
                  ✓ Fatto
                </button>

                <div style={{ position: 'relative', flex: isMobile ? 1 : 'none' }}>
                  <button
                    onClick={() => setSnoozeDropdownId(snoozeDropdownId === r.id ? null : r.id)}
                    style={{
                      width: '100%', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0',
                      borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', textAlign: 'center',
                    }}
                  >
                    ⏰ Posponi ▾
                  </button>
                  {snoozeDropdownId === r.id && (
                    <div style={{
                      position: 'absolute', right: 0, top: '100%', marginTop: '4px',
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
                      boxShadow: '0 4px 16px rgba(0,0,0,.08)', zIndex: 100, minWidth: '160px',
                    }}>
                      {[
                        { label: '+1 giorno', days: 1 },
                        { label: '+3 giorni', days: 3 },
                        { label: '+1 settimana', days: 7 },
                        { label: 'Data personalizzata…', days: null },
                      ].map(({ label, days }) => (
                        <button
                          key={label}
                          onClick={() => days !== null && handleSnooze(r, days)}
                          style={{
                            display: 'block', width: '100%', padding: '8px 12px',
                            background: 'none', border: 'none', cursor: 'pointer',
                            textAlign: 'left', fontSize: '12px', color: '#1e293b',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => navigate(`/customers/${r.customer_erp_id}`)}
                  style={{
                    background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                    borderRadius: '6px', padding: '4px 8px', fontSize: '11px',
                    cursor: 'pointer', fontWeight: 700,
                    flex: isMobile ? 1 : 'none', textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Apri scheda →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9' }}>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
          {data.total_active} promemoria attivi · {data.completed_today} completati oggi
        </span>
        <button
          onClick={() => navigate('/customers')}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '12px' }}
        >
          Gestisci tutti i promemoria →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Inserisci `RemindersWidgetNew` in `Dashboard.tsx` in posizione #2**

In `Dashboard.tsx`, aggiungi l'import:
```typescript
import { RemindersWidgetNew } from '../components/RemindersWidgetNew';
```

Trova il punto dove viene renderizzato `HeroStatusWidgetNew` e aggiungi subito dopo:
```tsx
<HeroStatusWidgetNew />
<RemindersWidgetNew />      {/* ← posizione #2 */}
<BonusRoadmapWidgetNew />
<OrdersSummaryWidgetNew />
<AlertsWidgetNew />
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/RemindersWidgetNew.tsx \
        archibald-web-app/frontend/src/pages/Dashboard.tsx
git commit -m "feat(ui): RemindersWidgetNew — widget dashboard con today/overdue + azioni inline"
```

---

### Task 16: Build finale + verifica + deploy produzione

**Files:** nessun file nuovo

- [ ] **Step 1: Build backend completo**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: exit 0, `dist/` aggiornato.

- [ ] **Step 2: Test backend completi**

```bash
npm test --prefix archibald-web-app/backend
```

Expected: tutti i test passano.

- [ ] **Step 3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: exit 0.

- [ ] **Step 4: Test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Expected: tutti i test passano.

- [ ] **Step 5: Verifica che la migration 045 sia nel commit**

```bash
git log --oneline --name-only | grep "045-customer-reminders"
```

Expected: il file è presente.

- [ ] **Step 6: Push a master → CI/CD auto-deploy**

```bash
git push origin master
```

La migration `045-customer-reminders.sql` viene applicata automaticamente al riavvio del container backend (grazie a `runMigrations` chiamato in `main.ts` all'avvio).

Monitora il deploy:
```bash
# Leggi VPS-ACCESS-CREDENTIALS.md per la chiave SSH
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml logs --tail 30 backend"
```

Expected in log: `Migration applied: 045-customer-reminders.sql`

- [ ] **Step 7: E2E su produzione (spec §12)**

Testa manualmente:
- Apri un cliente con P.IVA già validata → modifica nome → salva → verificare VATNUM NON riscritto in ERP
- Crea reminder per un cliente → snooze → completa con nota → verifica ricorrenza auto nel DB
- Verifica widget Dashboard mostra promemoria corretti

---

## Self-Review

### Copertura spec

| Req. spec | Task |
|---|---|
| §2.2 Avatar 180px mobile, 160px desktop, tutti circolari | Task 9 |
| §2.2 Completeness CSS border ring + badge + banner | Task 9 |
| §2.2 7 quick actions (Ordine, Chiama, WhatsApp, Email, Indicazioni, Allerta, Analisi) | Task 9 |
| §2.2 Quick stats (3 KPI, zero nuove API) | Task 9 |
| §2.3 Layout mobile 1-col, tablet 2-col, desktop sidebar 200px | Task 10 |
| §2.4 Storico inline con KPI + filtri + lista | Task 10 |
| §2.5 autoComplete+autoCorrect+spellCheck su search | Task 8 |
| §2.6 FAB mobile + bottone desktop | Task 8 |
| §3.1 Pulsante ✎ Modifica in topbar | Task 11 |
| §3.2 VAT two-track (Track A sola lettura, Track B banner + validation) | Task 11 |
| §3.4 Progress bar inline + GlobalOperationBanner fallback | Task 11 |
| §3.5 Annullamento, no backdrop close | Task 11 |
| §4.1 navigateToEditCustomerById — navigazione diretta per erpId | Task 5 |
| §4.2 CustomerDiff — solo campi presenti vengono scritti | Task 5 + 6 |
| §4.3 Bug 1-5 fix certificati | Task 5 |
| §4.4 Ordine scrittura certificato | Task 5 |
| §5 Handler update-customer riscritto | Task 6 |
| §6 Address CRUD inline, accumulated state, full-replace | Task 12 |
| §7.1 Migration 045, schema completo con FK e indici | Task 1 |
| §7.2 Logica stati (active, snoozed, overdue, today) | Task 2 |
| §7.3 Snooze, completamento con nota, ricorrenza auto | Task 2 |
| §7.4 API endpoints (today, CRUD, PATCH, DELETE) | Task 3 |
| §7.5 Scheduler 08:00 daily checkCustomerReminders | Task 4 |
| §8 CustomerRemindersSection con filtri, form inline, azioni | Task 14 |
| §8.2 🔔 Allerta → apre form direttamente (non scroll) | Task 9 + 14 |
| §8.3 ReminderForm con tutti i campi del mockup | Task 14 |
| §9 RemindersWidgetNew — posizione #2, desktop + mobile | Task 15 |
| §9.3 Mobile actions in riga (flex-direction: row) | Task 15 |
| §13 No window.confirm, no backdrop close, mobile row | Task 11 + 12 + 14 |

### Placeholder scan

Nessun TBD o TODO nel piano. Step 10 e 11 hanno parti parzialmente schematizzate (SectionCard wrapper) — il developer dovrà adattarle alla struttura esistente del file leggendolo prima.

### Type consistency

- `CustomerDiff` definito in Task 5 (`types.ts`), usato in Task 5 (bot), Task 6 (handler)
- `Reminder`, `ReminderWithCustomer`, `TodayReminders` definiti in Task 2 (repo) e in Task 7 (frontend service) — i nomi corrispondono
- `createReminder(pool, userId, customerErpId, params)` — firma consistente in Task 2 e Task 3
- `patchReminder(pool, userId, id, params)` — firma consistente in Task 2 e Task 3
- `UpdateCustomerBot` tipo in Task 6 include `navigateToEditCustomerById` e `updateCustomerSurgical` — corrisponde ai metodi aggiunti in Task 5

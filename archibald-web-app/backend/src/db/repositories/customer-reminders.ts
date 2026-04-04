import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
type ReminderId = Brand<number, 'ReminderId'>;

type ReminderStatus = 'active' | 'snoozed' | 'done' | 'cancelled';
type ReminderPriority = 'urgent' | 'normal' | 'low';
type ReminderType = 'commercial_contact' | 'offer_followup' | 'payment' | 'contract_renewal' | 'anniversary' | 'custom';
type ReminderNotifyVia = 'app' | 'email';
type ReminderFilter = 'active' | 'done' | 'all';

type Reminder = {
  id: ReminderId;
  userId: string;
  customerErpId: string;
  type: ReminderType;
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

type ReminderWithCustomer = Reminder & {
  customerName: string;
};

type TodayRemindersResult = {
  overdue: ReminderWithCustomer[];
  today: ReminderWithCustomer[];
  totalActive: number;
  completedToday: number;
};

type CreateReminderParams = {
  type?: ReminderType;
  priority?: ReminderPriority;
  dueAt: Date;
  recurrenceDays?: number | null;
  note?: string | null;
  notifyVia?: ReminderNotifyVia;
};

type PatchReminderParams = {
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

type ReminderWithCustomerRow = ReminderRow & {
  customer_name: string;
};

function mapRow(row: ReminderRow): Reminder {
  return {
    id: row.id as ReminderId,
    userId: row.user_id,
    customerErpId: row.customer_erp_id,
    type: row.type as ReminderType,
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
  return {
    ...mapRow(row),
    customerName: row.customer_name,
  };
}

function computeNextDueAt(completedAt: Date, recurrenceDays: number | null): Date | null {
  if (recurrenceDays === null) return null;
  const next = new Date(completedAt);
  next.setDate(next.getDate() + recurrenceDays);
  return next;
}

function isReminderEffectivelyActive(reminder: { status: string; snoozed_until: string | Date | null }): boolean {
  if (reminder.status === 'snoozed' && reminder.snoozed_until !== null) {
    const until = typeof reminder.snoozed_until === 'string' ? new Date(reminder.snoozed_until) : reminder.snoozed_until;
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
    `INSERT INTO agents.customer_reminders
       (user_id, customer_erp_id, type, priority, due_at, recurrence_days, note, notify_via)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      userId,
      customerErpId,
      params.type ?? 'commercial_contact',
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
      ? `AND status IN ('active', 'snoozed')`
      : filter === 'done'
        ? `AND status = 'done' AND completed_at > NOW() - INTERVAL '30 days'`
        : '';

  const orderClause =
    filter === 'active'
      ? `ORDER BY (priority = 'urgent') DESC, due_at ASC`
      : `ORDER BY due_at DESC`;

  const { rows } = await pool.query<ReminderRow>(
    `SELECT * FROM agents.customer_reminders
     WHERE user_id = $1 AND customer_erp_id = $2
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
  const completedAt = params.status === 'done' ? 'NOW()' : 'completed_at';
  const updateRecurrence = 'recurrenceDays' in params;
  const recurrenceValue = params.recurrenceDays ?? null;
  const { rows } = await pool.query<ReminderRow>(
    `UPDATE agents.customer_reminders
     SET
       priority        = COALESCE($3::varchar, priority),
       due_at          = COALESCE($4::timestamptz, due_at),
       recurrence_days = CASE WHEN $5::boolean THEN $6::int ELSE recurrence_days END,
       note            = COALESCE($7::text, note),
       notify_via      = COALESCE($8::varchar, notify_via),
       status          = COALESCE($9::varchar, status),
       snoozed_until   = COALESCE($10::timestamptz, snoozed_until),
       completion_note = COALESCE($11::text, completion_note),
       completed_at    = ${completedAt},
       updated_at      = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      id,
      userId,
      params.priority ?? null,
      params.dueAt ?? null,
      updateRecurrence,
      recurrenceValue,
      params.note !== undefined ? params.note : null,
      params.notifyVia ?? null,
      params.status ?? null,
      params.snoozedUntil ?? null,
      params.completionNote !== undefined ? params.completionNote : null,
    ],
  );

  const updated = rows[0];

  if (params.status === 'done' && updated.recurrence_days !== null) {
    const nextDueAt = computeNextDueAt(updated.completed_at ?? new Date(), updated.recurrence_days);
    if (nextDueAt !== null) {
      await createReminder(pool, updated.user_id, updated.customer_erp_id, {
        type: updated.type as ReminderType,
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

async function getRemindersOverdueOrToday(pool: DbPool, userId: string): Promise<ReminderWithCustomer[]> {
  const { rows } = await pool.query<ReminderWithCustomerRow>(
    `SELECT r.*, c.name AS customer_name
     FROM agents.customer_reminders r
     JOIN agents.customers c
       ON c.user_id = r.user_id AND c.erp_id = r.customer_erp_id
     WHERE r.user_id = $1
       AND r.due_at::date <= CURRENT_DATE
       AND r.status IN ('active', 'snoozed')
       AND (r.snoozed_until IS NULL OR r.snoozed_until < NOW())
     ORDER BY (r.priority = 'urgent') DESC, r.due_at ASC`,
    [userId],
  );
  return rows.map(mapRowWithCustomer);
}

async function getTodayReminders(pool: DbPool, userId: string): Promise<TodayRemindersResult> {
  const [overdueResult, todayResult, totalActiveResult, completedTodayResult] = await Promise.all([
    pool.query<ReminderWithCustomerRow>(
      `SELECT r.*, c.name AS customer_name
       FROM agents.customer_reminders r
       JOIN agents.customers c
         ON c.user_id = r.user_id AND c.erp_id = r.customer_erp_id
       WHERE r.user_id = $1
         AND r.due_at::date < CURRENT_DATE
         AND r.status IN ('active', 'snoozed')
         AND (r.snoozed_until IS NULL OR r.snoozed_until < NOW())
       ORDER BY (r.priority = 'urgent') DESC, r.due_at ASC`,
      [userId],
    ),
    pool.query<ReminderWithCustomerRow>(
      `SELECT r.*, c.name AS customer_name
       FROM agents.customer_reminders r
       JOIN agents.customers c
         ON c.user_id = r.user_id AND c.erp_id = r.customer_erp_id
       WHERE r.user_id = $1
         AND r.due_at::date = CURRENT_DATE
         AND r.status IN ('active', 'snoozed')
         AND (r.snoozed_until IS NULL OR r.snoozed_until < NOW())
       ORDER BY (r.priority = 'urgent') DESC, r.due_at ASC`,
      [userId],
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM agents.customer_reminders
       WHERE user_id = $1 AND status IN ('active', 'snoozed')`,
      [userId],
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM agents.customer_reminders
       WHERE user_id = $1
         AND status = 'done'
         AND completed_at::date = CURRENT_DATE`,
      [userId],
    ),
  ]);

  return {
    overdue: overdueResult.rows.map(mapRowWithCustomer),
    today: todayResult.rows.map(mapRowWithCustomer),
    totalActive: totalActiveResult.rows[0].count,
    completedToday: completedTodayResult.rows[0].count,
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
  type ReminderId,
  type Reminder,
  type ReminderWithCustomer,
  type TodayRemindersResult,
  type CreateReminderParams,
  type PatchReminderParams,
  type ReminderFilter,
  type ReminderStatus,
  type ReminderPriority,
  type ReminderType,
  type ReminderNotifyVia,
};

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
  source: string | null;
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
  source: string | null;
  created_at: Date;
  updated_at: Date;
};

type ReminderWithCustomerRow = ReminderRow & { customer_name: string };

const TYPE_JOIN = `JOIN agents.reminder_types rt ON rt.id = cr.type_id`;

const TYPE_FIELDS = `rt.label AS type_label, rt.emoji AS type_emoji,
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
    source: row.source,
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
     FROM ins
     JOIN agents.reminder_types rt ON rt.id = ins.type_id`,
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
     FROM agents.customer_reminders cr
     ${TYPE_JOIN}
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
  const completedAtExpr = params.status === 'done' ? 'NOW()' : 'cr.completed_at';
  const updateRecurrence = 'recurrenceDays' in params;
  const { rows } = await pool.query<ReminderRow>(
    `WITH upd AS (
       UPDATE agents.customer_reminders cr
       SET
         type_id         = COALESCE($3::int,        cr.type_id),
         priority        = COALESCE($4::varchar,     cr.priority),
         due_at          = COALESCE($5::timestamptz, cr.due_at),
         recurrence_days = CASE WHEN $6::boolean THEN $7::int        ELSE cr.recurrence_days END,
         note            = CASE WHEN $8::boolean THEN $9::text        ELSE cr.note END,
         notify_via      = COALESCE($10::varchar,    cr.notify_via),
         status          = COALESCE($11::varchar,    cr.status),
         snoozed_until   = CASE WHEN $12::boolean THEN $13::timestamptz ELSE cr.snoozed_until END,
         completion_note = COALESCE($14::text,       cr.completion_note),
         completed_at    = ${completedAtExpr},
         updated_at      = NOW()
       WHERE cr.id = $1 AND cr.user_id = $2
       RETURNING *
     )
     SELECT upd.*, ${TYPE_FIELDS}
     FROM upd
     JOIN agents.reminder_types rt ON rt.id = upd.type_id`,
    [
      id, userId,                              // $1, $2
      params.typeId ?? null,                   // $3
      params.priority ?? null,                 // $4
      params.dueAt ?? null,                    // $5
      updateRecurrence,                        // $6 (boolean flag)
      params.recurrenceDays ?? null,           // $7
      'note' in params,                        // $8 (boolean flag)
      params.note ?? null,                     // $9
      params.notifyVia ?? null,                // $10
      params.status ?? null,                   // $11
      'snoozedUntil' in params,               // $12 (boolean flag)
      params.snoozedUntil ?? null,             // $13
      params.completionNote !== undefined ? params.completionNote : null, // $14
    ],
  );

  if (!rows[0]) throw new Error(`Reminder ${String(id)} not found or access denied`);

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
  const result = await pool.query(
    `DELETE FROM agents.customer_reminders WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((result.rowCount ?? 0) === 0) throw new Error(`Reminder ${String(id)} not found or access denied`);
}

async function getRemindersOverdueOrToday(
  pool: DbPool,
  userId: string,
): Promise<ReminderWithCustomer[]> {
  const { rows } = await pool.query<ReminderWithCustomerRow>(
    `SELECT cr.*, ${TYPE_FIELDS}, c.name AS customer_name
     FROM agents.customer_reminders cr
     ${TYPE_JOIN}
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
  const customerJoin = `JOIN agents.customers c
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
  const customerJoin = `JOIN agents.customers c
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
    const key = new Date(row.due_at).toISOString().split('T')[0];
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

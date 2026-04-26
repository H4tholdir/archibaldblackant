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

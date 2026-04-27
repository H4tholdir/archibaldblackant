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
     WHERE id = $${p} AND user_id = $${p + 1} AND deleted_at IS NULL
     RETURNING id, user_id, label, emoji, color_hex, is_system, sort_order, deleted_at`,
    params,
  );
  if (rows.length === 0) throw new Error('Appointment type not found');
  return rowToType(rows[0]);
}

export async function softDeleteAppointmentType(
  pool: DbPool,
  userId: string,
  id: AppointmentTypeId,
): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE agents.appointment_types
     SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_system = FALSE AND deleted_at IS NULL`,
    [id, userId],
  );
  if ((rowCount ?? 0) === 0) {
    const { rows } = await pool.query<{ is_system: boolean }>(
      `SELECT is_system FROM agents.appointment_types WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (rows[0]?.is_system) {
      throw new Error('Cannot delete system appointment type');
    }
  }
}

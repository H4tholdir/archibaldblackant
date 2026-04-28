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
  if (!rows[0]) throw new Error('Failed to create appointment');
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

  if (sets.length === 1) throw new Error('No fields to update');
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
  if (rows.length === 0) throw new Error('Appointment not found');
  return rowToAppt(rows[0]);
}

export async function softDeleteAppointment(
  pool: DbPool,
  userId: string,
  id: AppointmentId,
): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE agents.appointments
     SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId],
  );
  if ((rowCount ?? 0) === 0) throw new Error('Appointment not found');
}

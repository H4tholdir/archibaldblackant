import type { DbPool } from '../pool';

type OrderNote = {
  id: number;
  orderId: string;
  text: string;
  checked: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
};

type OrderNoteRow = {
  id: number;
  user_id: string;
  order_id: string;
  text: string;
  checked: boolean;
  position: number;
  created_at: number;
  updated_at: number;
};

type NoteSummaryRow = {
  order_id: string;
  total: string;
  checked: string;
};

type NotePreviewRow = {
  order_id: string;
  text: string;
  checked: boolean;
};

function mapRowToNote(row: OrderNoteRow): OrderNote {
  return {
    id: row.id,
    orderId: row.order_id,
    text: row.text,
    checked: row.checked,
    position: row.position,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function getNotes(pool: DbPool, userId: string, orderId: string): Promise<OrderNote[]> {
  const { rows } = await pool.query<OrderNoteRow>(
    `SELECT id, user_id, order_id, text, checked, position, created_at, updated_at
     FROM agents.order_notes
     WHERE user_id = $1 AND order_id = $2
     ORDER BY checked ASC, position ASC`,
    [userId, orderId],
  );
  return rows.map(mapRowToNote);
}

async function getNotesSummary(
  pool: DbPool,
  userId: string,
  orderIds: string[],
): Promise<Map<string, { total: number; checked: number }>> {
  if (orderIds.length === 0) return new Map();

  const { rows } = await pool.query<NoteSummaryRow>(
    `SELECT order_id,
            COUNT(*)::TEXT AS total,
            COUNT(*) FILTER (WHERE checked = true)::TEXT AS checked
     FROM agents.order_notes
     WHERE user_id = $1 AND order_id = ANY($2)
     GROUP BY order_id`,
    [userId, orderIds],
  );

  const result = new Map<string, { total: number; checked: number }>();
  for (const row of rows) {
    result.set(row.order_id, {
      total: parseInt(row.total, 10),
      checked: parseInt(row.checked, 10),
    });
  }
  return result;
}

async function getNotesPreviews(
  pool: DbPool,
  userId: string,
  orderIds: string[],
): Promise<Map<string, Array<{ text: string; checked: boolean }>>> {
  if (orderIds.length === 0) return new Map();

  const { rows } = await pool.query<NotePreviewRow>(
    `SELECT order_id, text, checked
     FROM (
       SELECT order_id, text, checked, position,
              ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY checked ASC, position ASC) AS rn
       FROM agents.order_notes
       WHERE user_id = $1 AND order_id = ANY($2)
     ) sub
     WHERE rn <= 3`,
    [userId, orderIds],
  );

  const map = new Map<string, Array<{ text: string; checked: boolean }>>();
  for (const r of rows) {
    if (!map.has(r.order_id)) map.set(r.order_id, []);
    map.get(r.order_id)!.push({ text: r.text, checked: r.checked });
  }
  return map;
}

async function createNote(
  pool: DbPool,
  userId: string,
  orderId: string,
  text: string,
): Promise<OrderNote> {
  const { rows: [row] } = await pool.query<OrderNoteRow>(
    `INSERT INTO agents.order_notes (user_id, order_id, text, position)
     VALUES ($1, $2, $3, COALESCE(
       (SELECT MAX(position) + 1 FROM agents.order_notes WHERE user_id = $1 AND order_id = $2),
       0
     ))
     RETURNING id, user_id, order_id, text, checked, position, created_at, updated_at`,
    [userId, orderId, text],
  );
  return mapRowToNote(row);
}

async function updateNote(
  pool: DbPool,
  userId: string,
  noteId: number,
  updates: { text?: string; checked?: boolean },
): Promise<OrderNote | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.text !== undefined) {
    setClauses.push(`text = $${paramIndex++}`);
    params.push(updates.text);
  }
  if (updates.checked !== undefined) {
    setClauses.push(`checked = $${paramIndex++}`);
    params.push(updates.checked);
  }

  if (setClauses.length === 0) return null;

  setClauses.push(`updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`);

  params.push(userId, noteId);

  const { rows } = await pool.query<OrderNoteRow>(
    `UPDATE agents.order_notes
     SET ${setClauses.join(', ')}
     WHERE user_id = $${paramIndex++} AND id = $${paramIndex}
     RETURNING id, user_id, order_id, text, checked, position, created_at, updated_at`,
    params,
  );

  return rows.length > 0 ? mapRowToNote(rows[0]) : null;
}

async function deleteNote(pool: DbPool, userId: string, noteId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.order_notes WHERE user_id = $1 AND id = $2`,
    [userId, noteId],
  );
  return (rowCount ?? 0) > 0;
}

export {
  getNotes,
  getNotesSummary,
  getNotesPreviews,
  createNote,
  updateNote,
  deleteNote,
  mapRowToNote,
  type OrderNote,
  type OrderNoteRow,
  type NoteSummaryRow,
  type NotePreviewRow,
};

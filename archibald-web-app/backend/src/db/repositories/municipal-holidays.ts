import type { DbPool } from '../pool';

export type HolidayCheckResult = {
  isHoliday: boolean;
  confidence?: string;
  name?: string;
  isOverride?: boolean;
};

export async function isHolidayForCity(
  pool: DbPool, userId: string, city: string, month: number, day: number,
): Promise<HolidayCheckResult> {
  // Controlla prima override utente, poi tabella sistema
  const { rows } = await pool.query(
    `SELECT comune, holiday_name, confidence, TRUE AS is_override
     FROM agents.municipal_holiday_overrides
     WHERE user_id = $1
       AND UPPER(TRIM(comune)) = UPPER(TRIM($2))
       AND date_month = $3 AND date_day = $4
       AND is_closed = TRUE
     UNION ALL
     SELECT comune, holiday_name, confidence, FALSE AS is_override
     FROM system.italian_municipal_holidays
     WHERE UPPER(TRIM(comune)) = UPPER(TRIM($2))
       AND date_month = $3 AND date_day = $4
     ORDER BY is_override DESC
     LIMIT 1`,
    [userId, city, month, day],
  );

  if (!rows[0]) return { isHoliday: false };
  return {
    isHoliday: true,
    confidence: rows[0].confidence,
    name: rows[0].holiday_name,
    isOverride: rows[0].is_override,
  };
}

export async function listHolidaysForDate(
  pool: DbPool, userId: string, month: number, day: number,
): Promise<Array<{ comune: string; provincia: string | null; name: string; confidence: string }>> {
  const { rows } = await pool.query(
    `SELECT UPPER(TRIM(h.comune)) AS comune, h.provincia, h.holiday_name AS name, h.confidence
     FROM system.italian_municipal_holidays h
     WHERE h.date_month = $1 AND h.date_day = $2
     UNION ALL
     SELECT UPPER(TRIM(o.comune)) AS comune, o.provincia, o.holiday_name AS name, 'manual' AS confidence
     FROM agents.municipal_holiday_overrides o
     WHERE o.user_id = $3
       AND o.date_month = $1 AND o.date_day = $2
       AND o.is_closed = TRUE`,
    [month, day, userId],
  );
  return rows as Array<{ comune: string; provincia: string | null; name: string; confidence: string }>;
}

// ── Override agente ────────────────────────────────────────────────────

export type HolidayOverrideInput = {
  userId:       string;
  comune:       string;
  provincia?:   string | null;
  dateMonth:    number;
  dateDay:      number;
  holidayName?: string | null;
  isClosed:     boolean;
  note?:        string | null;
};

export type HolidayOverride = {
  id:          number;
  userId:      string;
  comune:      string;
  provincia:   string | null;
  dateMonth:   number;
  dateDay:     number;
  holidayName: string | null;
  isClosed:    boolean;
  note:        string | null;
  createdAt:   string;
};

export async function createOverride(
  pool: DbPool,
  input: HolidayOverrideInput,
): Promise<HolidayOverride> {
  const { rows } = await pool.query(
    `INSERT INTO agents.municipal_holiday_overrides
       (user_id, comune, provincia, date_month, date_day, holiday_name, is_closed, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [input.userId, input.comune, input.provincia ?? null, input.dateMonth, input.dateDay,
     input.holidayName ?? null, input.isClosed, input.note ?? null],
  );
  const r = rows[0];
  return {
    id: r.id, userId: r.user_id, comune: r.comune,
    provincia: r.provincia, dateMonth: r.date_month, dateDay: r.date_day,
    holidayName: r.holiday_name, isClosed: r.is_closed, note: r.note,
    createdAt: r.created_at.toISOString(),
  };
}

export async function deleteOverride(
  pool: DbPool, userId: string, id: number,
): Promise<void> {
  const { rowCount } = await pool.query(
    'DELETE FROM agents.municipal_holiday_overrides WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  if ((rowCount ?? 0) === 0) throw new Error('Override not found');
}

export async function listOverrides(
  pool: DbPool, userId: string,
): Promise<HolidayOverride[]> {
  const { rows } = await pool.query(
    `SELECT * FROM agents.municipal_holiday_overrides
     WHERE user_id = $1 ORDER BY date_month, date_day, comune`,
    [userId],
  );
  return rows.map(r => ({
    id: r.id, userId: r.user_id, comune: r.comune,
    provincia: r.provincia, dateMonth: r.date_month, dateDay: r.date_day,
    holidayName: r.holiday_name, isClosed: r.is_closed, note: r.note,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function listSystemHolidays(
  pool: DbPool,
): Promise<Array<{ id: number; comune: string; provincia: string; dateMonth: number; dateDay: number; holidayName: string; confidence: string }>> {
  const { rows } = await pool.query(
    `SELECT id, comune, provincia, date_month AS "dateMonth", date_day AS "dateDay",
            holiday_name AS "holidayName", confidence
     FROM system.italian_municipal_holidays
     ORDER BY date_month, date_day, comune`,
  );
  return rows as any;
}

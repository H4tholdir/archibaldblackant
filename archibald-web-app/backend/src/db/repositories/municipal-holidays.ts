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

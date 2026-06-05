import type { DbPool } from '../pool';
import type { CustomerSourceType } from './visit-planning-types';

export type CustomerVisitPreferencesInput = {
  userId:               string;
  sourceType:           CustomerSourceType;
  sourceId:             string;
  typicalVisitMinutes:  number;
  preferredDays:        number[];
  avoidDays:            number[];
  preferredTimeStart:   string | null;
  preferredTimeEnd:     string | null;
  requiresAppointment:  boolean;
  notes:                string | null;
};

export type CustomerVisitPreferences = CustomerVisitPreferencesInput;

export async function getPreferences(
  pool: DbPool,
  userId: string,
  sourceType: CustomerSourceType,
  sourceId: string,
): Promise<CustomerVisitPreferences | null> {
  const { rows } = await pool.query(
    `SELECT * FROM agents.customer_visit_preferences
     WHERE user_id = $1 AND source_type = $2 AND source_id = $3`,
    [userId, sourceType, sourceId],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    userId:               r.user_id,
    sourceType:           r.source_type,
    sourceId:             r.source_id,
    typicalVisitMinutes:  r.typical_visit_minutes,
    preferredDays:        r.preferred_days ?? [],
    avoidDays:            r.avoid_days ?? [],
    preferredTimeStart:   r.preferred_time_start,
    preferredTimeEnd:     r.preferred_time_end,
    requiresAppointment:  r.requires_appointment,
    notes:                r.notes,
  };
}

export async function upsertPreferences(
  pool: DbPool,
  input: CustomerVisitPreferencesInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.customer_visit_preferences
       (user_id, source_type, source_id, typical_visit_minutes,
        preferred_days, avoid_days, preferred_time_start, preferred_time_end,
        requires_appointment, notes, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (user_id, source_type, source_id) DO UPDATE SET
       typical_visit_minutes  = EXCLUDED.typical_visit_minutes,
       preferred_days         = EXCLUDED.preferred_days,
       avoid_days             = EXCLUDED.avoid_days,
       preferred_time_start   = EXCLUDED.preferred_time_start,
       preferred_time_end     = EXCLUDED.preferred_time_end,
       requires_appointment   = EXCLUDED.requires_appointment,
       notes                  = EXCLUDED.notes,
       updated_at             = NOW()`,
    [input.userId, input.sourceType, input.sourceId,
     input.typicalVisitMinutes, input.preferredDays, input.avoidDays,
     input.preferredTimeStart, input.preferredTimeEnd,
     input.requiresAppointment, input.notes],
  );
}

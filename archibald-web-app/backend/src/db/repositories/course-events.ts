import type { DbPool } from '../pool';

export type CourseEvent = {
  id:                 number;
  title:              string;
  instructor:         string | null;
  city:               string;
  provincia:          string | null;
  eventDate:          string; // YYYY-MM-DD
  costEur:            number | null;
  productCategories:  string[];
  thresholdEur:       number | null;
  notes:              string | null;
  isActive:           boolean;
};

export type CreateCourseEventInput = {
  title:              string;
  instructor?:        string | null;
  city:               string;
  provincia?:         string | null;
  eventDate:          string;
  costEur?:           number | null;
  productCategories:  string[];
  thresholdEur?:      number | null;
  notes?:             string | null;
  isActive:           boolean;
};

function rowToEvent(r: Record<string, unknown>): CourseEvent {
  return {
    id:                r.id as number,
    title:             r.title as string,
    instructor:        r.instructor as string | null,
    city:              r.city as string,
    provincia:         r.provincia as string | null,
    eventDate:         typeof r.event_date === 'string'
                         ? r.event_date
                         : (r.event_date as Date).toISOString().slice(0, 10),
    costEur:           r.cost_eur != null ? parseFloat(r.cost_eur as string) : null,
    productCategories: (r.product_categories as string[]) ?? [],
    thresholdEur:      r.threshold_eur != null ? parseFloat(r.threshold_eur as string) : null,
    notes:             r.notes as string | null,
    isActive:          r.is_active as boolean,
  };
}

export async function listUpcomingCourseEventsForCity(
  pool: DbPool,
  city: string,
  daysAhead: number,
): Promise<CourseEvent[]> {
  const { rows } = await pool.query(
    `SELECT * FROM system.course_events
     WHERE is_active = TRUE
       AND UPPER(TRIM(city)) = UPPER(TRIM($1))
       AND event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $2::integer
     ORDER BY event_date`,
    [city, daysAhead],
  );
  return rows.map(rowToEvent);
}

export async function listAllCourseEvents(pool: DbPool): Promise<CourseEvent[]> {
  const { rows } = await pool.query(
    `SELECT * FROM system.course_events ORDER BY event_date DESC LIMIT 200`,
  );
  return rows.map(rowToEvent);
}

export async function createCourseEvent(
  pool: DbPool,
  input: CreateCourseEventInput,
): Promise<CourseEvent> {
  const { rows } = await pool.query(
    `INSERT INTO system.course_events
       (title, instructor, city, provincia, event_date, cost_eur,
        product_categories, threshold_eur, notes, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      input.title, input.instructor ?? null, input.city, input.provincia ?? null,
      input.eventDate, input.costEur ?? null,
      input.productCategories, input.thresholdEur ?? null,
      input.notes ?? null, input.isActive,
    ],
  );
  if (!rows[0]) throw new Error('Failed to create course event');
  return rowToEvent(rows[0]);
}

export async function deleteCourseEvent(pool: DbPool, id: number): Promise<void> {
  const { rowCount } = await pool.query(
    'DELETE FROM system.course_events WHERE id = $1',
    [id],
  );
  if ((rowCount ?? 0) === 0) throw new Error('Course event not found');
}

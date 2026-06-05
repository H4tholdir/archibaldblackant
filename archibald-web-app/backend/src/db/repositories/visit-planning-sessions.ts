import type { DbPool } from '../pool';
import type {
  VisitPlanningSession, VisitPlanningSessionId, VisitPlanningStopId,
  VisitHorizon, VisitMode, VisitStatus,
} from './visit-planning-types';

type SessionRow = {
  id: string; user_id: string; title: string;
  horizon: string; mode: string; status: string;
  start_date: string; end_date: string;
  start_location_label: string | null; start_lat: string | null; start_lng: string | null;
  end_location_label: string | null;   end_lat:   string | null; end_lng:   string | null;
  constraints_json: Record<string, unknown>; metrics_json: Record<string, unknown>;
  navigation_started_at: Date | null; active_stop_id: string | null;
  generated_at: Date | null; created_at: Date; updated_at: Date;
};

function toSession(r: SessionRow): VisitPlanningSession {
  return {
    id:                  r.id as VisitPlanningSessionId,
    userId:              r.user_id,
    title:               r.title,
    horizon:             r.horizon as VisitHorizon,
    mode:                r.mode as VisitMode,
    status:              r.status as VisitStatus,
    startDate:           typeof r.start_date === 'string' ? r.start_date : (r.start_date as unknown as Date).toISOString().slice(0, 10),
    endDate:             typeof r.end_date === 'string' ? r.end_date : (r.end_date as unknown as Date).toISOString().slice(0, 10),
    startLocationLabel:  r.start_location_label,
    startLat:            r.start_lat != null ? parseFloat(r.start_lat) : null,
    startLng:            r.start_lng != null ? parseFloat(r.start_lng) : null,
    endLocationLabel:    r.end_location_label,
    endLat:              r.end_lat != null ? parseFloat(r.end_lat) : null,
    endLng:              r.end_lng != null ? parseFloat(r.end_lng) : null,
    constraintsJson:     r.constraints_json ?? {},
    metricsJson:         r.metrics_json ?? {},
    navigationStartedAt: r.navigation_started_at?.toISOString() ?? null,
    activeStopId:        r.active_stop_id as VisitPlanningStopId | null,
    generatedAt:         r.generated_at?.toISOString() ?? null,
    createdAt:           r.created_at.toISOString(),
    updatedAt:           r.updated_at.toISOString(),
  };
}

export type CreateSessionInput = {
  title: string; horizon: VisitHorizon; mode: VisitMode;
  startDate: string; endDate: string;
  startLocationLabel: string | null; startLat: number | null; startLng: number | null;
  endLocationLabel: string | null;   endLat:   number | null; endLng:   number | null;
  constraintsJson: Record<string, unknown>;
};

export async function createSession(
  pool: DbPool, userId: string, input: CreateSessionInput,
): Promise<VisitPlanningSession> {
  const { rows } = await pool.query<SessionRow>(
    `INSERT INTO agents.visit_planning_sessions
       (user_id,title,horizon,mode,start_date,end_date,
        start_location_label,start_lat,start_lng,
        end_location_label,end_lat,end_lng,constraints_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [userId, input.title, input.horizon, input.mode,
     input.startDate, input.endDate,
     input.startLocationLabel, input.startLat, input.startLng,
     input.endLocationLabel, input.endLat, input.endLng,
     JSON.stringify(input.constraintsJson)],
  );
  if (!rows[0]) throw new Error('Failed to create session');
  return toSession(rows[0]);
}

export type ListSessionsOpts = { from: string; to: string; status?: VisitStatus; horizon?: VisitHorizon };

export async function listSessions(
  pool: DbPool, userId: string, opts: ListSessionsOpts,
): Promise<VisitPlanningSession[]> {
  const params: unknown[] = [userId, opts.from, opts.to];
  const extra: string[] = [];
  if (opts.status)  { params.push(opts.status);  extra.push(`AND status = $${params.length}`); }
  if (opts.horizon) { params.push(opts.horizon); extra.push(`AND horizon = $${params.length}`); }

  const { rows } = await pool.query<SessionRow>(
    `SELECT * FROM agents.visit_planning_sessions
     WHERE user_id = $1
       AND start_date >= $2 AND start_date <= $3
       AND deleted_at IS NULL
       ${extra.join(' ')}
     ORDER BY start_date DESC`,
    params,
  );
  return rows.map(toSession);
}

export async function getSession(
  pool: DbPool, userId: string, id: VisitPlanningSessionId,
): Promise<VisitPlanningSession | null> {
  const { rows } = await pool.query<SessionRow>(
    `SELECT * FROM agents.visit_planning_sessions
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId],
  );
  return rows[0] ? toSession(rows[0]) : null;
}

export type UpdateSessionInput = Partial<{
  title: string; mode: VisitMode; status: VisitStatus;
  startLocationLabel: string | null; startLat: number | null; startLng: number | null;
  endLocationLabel: string | null;   endLat:   number | null; endLng:   number | null;
  constraintsJson: Record<string, unknown>; metricsJson: Record<string, unknown>;
  navigationStartedAt: string | null; activeStopId: string | null; generatedAt: string | null;
}>;

const SESSION_FIELD_MAP: Record<string, string> = {
  title: 'title', mode: 'mode', status: 'status',
  startLocationLabel: 'start_location_label', startLat: 'start_lat', startLng: 'start_lng',
  endLocationLabel: 'end_location_label', endLat: 'end_lat', endLng: 'end_lng',
  constraintsJson: 'constraints_json', metricsJson: 'metrics_json',
  navigationStartedAt: 'navigation_started_at', activeStopId: 'active_stop_id',
  generatedAt: 'generated_at',
};

export async function updateSession(
  pool: DbPool, userId: string, id: VisitPlanningSessionId, patch: UpdateSessionInput,
): Promise<VisitPlanningSession> {
  const sets = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let p = 1;

  for (const [key, col] of Object.entries(SESSION_FIELD_MAP)) {
    if ((patch as Record<string, unknown>)[key] !== undefined) {
      const val = (patch as Record<string, unknown>)[key];
      sets.push(`${col} = $${p++}`);
      params.push(typeof val === 'object' && val !== null && !Array.isArray(val) ? JSON.stringify(val) : val);
    }
  }

  if (sets.length === 1) throw new Error('No fields to update');
  params.push(id, userId);

  const { rows } = await pool.query<SessionRow>(
    `UPDATE agents.visit_planning_sessions
     SET ${sets.join(', ')}
     WHERE id = $${p} AND user_id = $${p + 1} AND deleted_at IS NULL
     RETURNING *`,
    params,
  );
  if (!rows[0]) throw new Error('Session not found');
  return toSession(rows[0]);
}

export async function softDeleteSession(
  pool: DbPool, userId: string, id: VisitPlanningSessionId,
): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE agents.visit_planning_sessions
     SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId],
  );
  if ((rowCount ?? 0) === 0) throw new Error('Session not found');
}

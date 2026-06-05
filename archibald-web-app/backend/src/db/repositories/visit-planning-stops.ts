import type { DbPool } from '../pool';
import type {
  VisitPlanningStop, VisitPlanningStopId, VisitPlanningSessionId,
  StopStatus, CustomerSourceType,
} from './visit-planning-types';

type StopRow = {
  id: string; session_id: string; user_id: string;
  source_type: string; source_id: string; display_name: string;
  appointment_id: string | null; stop_date: string | Date; sequence: number | null;
  status: string; locked: boolean;
  estimated_arrival: Date | null; estimated_departure: Date | null;
  visit_minutes: number; travel_minutes_from_previous: number | null;
  distance_km_from_previous: string | null;
  score_total: string | null; score_breakdown_json: Record<string, number>;
  recommendation_reasons: string[]; alerts: string[];
  manual_note: string | null; skip_reason: string | null;
  visited_at: Date | null; created_at: Date; updated_at: Date;
};

function toStop(r: StopRow): VisitPlanningStop {
  return {
    id: r.id as VisitPlanningStopId,
    sessionId: r.session_id as VisitPlanningSessionId,
    userId: r.user_id,
    sourceType: r.source_type as CustomerSourceType,
    sourceId: r.source_id,
    displayName: r.display_name,
    appointmentId: r.appointment_id,
    stopDate: typeof r.stop_date === 'string' ? r.stop_date : (r.stop_date as Date).toISOString().slice(0, 10),
    sequence: r.sequence,
    status: r.status as StopStatus,
    locked: r.locked,
    estimatedArrival: r.estimated_arrival?.toISOString() ?? null,
    estimatedDeparture: r.estimated_departure?.toISOString() ?? null,
    visitMinutes: r.visit_minutes,
    travelMinutesFromPrevious: r.travel_minutes_from_previous,
    distanceKmFromPrevious: r.distance_km_from_previous != null ? parseFloat(r.distance_km_from_previous) : null,
    scoreTotal: r.score_total != null ? parseFloat(r.score_total) : null,
    scoreBreakdownJson: r.score_breakdown_json ?? {},
    recommendationReasons: r.recommendation_reasons ?? [],
    alerts: r.alerts ?? [],
    manualNote: r.manual_note,
    skipReason: r.skip_reason,
    visitedAt: r.visited_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export type CreateStopInput = {
  sourceType: CustomerSourceType; sourceId: string; displayName: string;
  stopDate: string; status: StopStatus; visitMinutes: number;
  sequence?: number; locked?: boolean;
  scoreTotal?: number; scoreBreakdownJson?: Record<string, number>;
  recommendationReasons?: string[]; alerts?: string[];
};

export async function createStop(
  pool: DbPool, sessionId: VisitPlanningSessionId, userId: string, input: CreateStopInput,
): Promise<VisitPlanningStop> {
  const { rows } = await pool.query<StopRow>(
    `INSERT INTO agents.visit_planning_stops
       (session_id,user_id,source_type,source_id,display_name,stop_date,
        status,visit_minutes,sequence,locked,
        score_total,score_breakdown_json,recommendation_reasons,alerts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [sessionId, userId, input.sourceType, input.sourceId, input.displayName,
     input.stopDate, input.status, input.visitMinutes,
     input.sequence ?? null, input.locked ?? false,
     input.scoreTotal ?? null,
     JSON.stringify(input.scoreBreakdownJson ?? {}),
     input.recommendationReasons ?? [],
     input.alerts ?? []],
  );
  if (!rows[0]) throw new Error('Failed to create stop');
  return toStop(rows[0]);
}

export async function listStops(
  pool: DbPool, userId: string, sessionId: VisitPlanningSessionId,
): Promise<VisitPlanningStop[]> {
  const { rows } = await pool.query<StopRow>(
    `SELECT * FROM agents.visit_planning_stops
     WHERE session_id = $1 AND user_id = $2
     ORDER BY COALESCE(sequence, 9999), created_at`,
    [sessionId, userId],
  );
  return rows.map(toStop);
}

export type UpdateStopInput = Partial<{
  status: StopStatus; locked: boolean; sequence: number;
  estimatedArrival: string | null; estimatedDeparture: string | null;
  visitMinutes: number; manualNote: string | null; skipReason: string | null;
  appointmentId: string | null;
  travelMinutesFromPrevious: number | null; distanceKmFromPrevious: number | null;
  scoreTotal: number | null; scoreBreakdownJson: Record<string, number>;
  recommendationReasons: string[]; alerts: string[];
}>;

const STOP_FIELD_MAP: Record<string, string> = {
  status: 'status', locked: 'locked', sequence: 'sequence',
  estimatedArrival: 'estimated_arrival', estimatedDeparture: 'estimated_departure',
  visitMinutes: 'visit_minutes', manualNote: 'manual_note', skipReason: 'skip_reason',
  appointmentId: 'appointment_id',
  travelMinutesFromPrevious: 'travel_minutes_from_previous',
  distanceKmFromPrevious: 'distance_km_from_previous',
  scoreTotal: 'score_total', scoreBreakdownJson: 'score_breakdown_json',
  recommendationReasons: 'recommendation_reasons', alerts: 'alerts',
};

export async function updateStop(
  pool: DbPool, userId: string, id: VisitPlanningStopId, patch: UpdateStopInput,
): Promise<VisitPlanningStop> {
  const sets = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let p = 1;

  for (const [key, col] of Object.entries(STOP_FIELD_MAP)) {
    if ((patch as Record<string, unknown>)[key] !== undefined) {
      const val = (patch as Record<string, unknown>)[key];
      sets.push(`${col} = $${p++}`);
      params.push(key === 'scoreBreakdownJson' ? JSON.stringify(val) : val);
    }
  }

  if (sets.length === 1) throw new Error('No fields to update');
  params.push(id, userId);

  const { rows } = await pool.query<StopRow>(
    `UPDATE agents.visit_planning_stops
     SET ${sets.join(', ')}
     WHERE id = $${p} AND user_id = $${p + 1}
     RETURNING *`,
    params,
  );
  if (!rows[0]) throw new Error('Stop not found');
  return toStop(rows[0]);
}

export async function deleteStop(
  pool: DbPool, userId: string, id: VisitPlanningStopId,
): Promise<void> {
  // Soft delete: imposta status='removed', non cancella fisicamente
  await updateStop(pool, userId, id, { status: 'removed' });
}

export async function markVisited(
  pool: DbPool, userId: string, id: VisitPlanningStopId,
): Promise<VisitPlanningStop> {
  const { rows } = await pool.query<StopRow>(
    `UPDATE agents.visit_planning_stops
     SET status = 'visited', visited_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, userId],
  );
  if (!rows[0]) throw new Error('Stop not found');
  return toStop(rows[0]);
}

export async function reorderStops(
  pool: DbPool, userId: string, sessionId: VisitPlanningSessionId,
  order: Array<{ id: VisitPlanningStopId; sequence: number }>,
): Promise<void> {
  for (const { id, sequence } of order) {
    await pool.query(
      `UPDATE agents.visit_planning_stops
       SET sequence = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND session_id = $4`,
      [sequence, id, userId, sessionId],
    );
  }
}

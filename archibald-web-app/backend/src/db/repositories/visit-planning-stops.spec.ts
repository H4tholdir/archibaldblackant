import { describe, test, expect, vi } from 'vitest';
import {
  createStop, listStops, updateStop, deleteStop,
  reorderStops, markVisited,
} from './visit-planning-stops';
import type { VisitPlanningStopId, VisitPlanningSessionId } from './visit-planning-types';

const SESSION_ID = 'sess-uuid-1' as VisitPlanningSessionId;
const STOP_ID    = 'stop-uuid-1' as VisitPlanningStopId;
const USER_ID    = 'user-test-1';
const NOW        = new Date('2026-06-06T08:00:00Z');

function makeStopRow(o: Record<string, unknown> = {}) {
  return {
    id: STOP_ID, session_id: SESSION_ID, user_id: USER_ID,
    source_type: 'archibald', source_id: '55.374',
    display_name: 'Dr. Rossi', appointment_id: null,
    stop_date: '2026-06-06', sequence: 1,
    status: 'suggested', locked: false,
    estimated_arrival: null, estimated_departure: null,
    visit_minutes: 30, travel_minutes_from_previous: null,
    distance_km_from_previous: null,
    score_total: null, score_breakdown_json: {},
    recommendation_reasons: [], alerts: [],
    manual_note: null, skip_reason: null, visited_at: null,
    created_at: NOW, updated_at: NOW,
    ...o,
  };
}

function makePool(row = makeStopRow()) {
  return { query: vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 }) } as any;
}

describe('createStop', () => {
  test('crea tappa e restituisce oggetto mappato', async () => {
    const pool = makePool();
    const result = await createStop(pool, SESSION_ID, USER_ID, {
      sourceType: 'archibald', sourceId: '55.374',
      displayName: 'Dr. Rossi', stopDate: '2026-06-06',
      status: 'suggested', visitMinutes: 30,
    });
    expect(result).toMatchObject({
      sessionId: SESSION_ID, userId: USER_ID,
      sourceType: 'archibald', sourceId: '55.374',
      status: 'suggested',
    });
  });
});

describe('listStops', () => {
  test('restituisce le tappe della sessione ordinate per sequence', async () => {
    const pool = makePool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [makeStopRow({ sequence: 1 }), makeStopRow({ id: 'stop-2' as VisitPlanningStopId, sequence: 2 })],
      rowCount: 2,
    });
    const stops = await listStops(pool, USER_ID, SESSION_ID);
    expect(stops).toHaveLength(2);
    expect(stops[0].sequence).toBe(1);
  });
});

describe('updateStop', () => {
  test('aggiorna status a confirmed', async () => {
    const pool = makePool(makeStopRow({ status: 'confirmed' }));
    const result = await updateStop(pool, USER_ID, STOP_ID, { status: 'confirmed' });
    expect(result.status).toBe('confirmed');
  });

  test('lancia errore se nessun campo', async () => {
    const pool = makePool();
    await expect(updateStop(pool, USER_ID, STOP_ID, {})).rejects.toThrow('No fields');
  });
});

describe('markVisited', () => {
  test('imposta status=visited e visited_at', async () => {
    const visitedAt = new Date();
    const pool = makePool(makeStopRow({ status: 'visited', visited_at: visitedAt }));
    const result = await markVisited(pool, USER_ID, STOP_ID);
    expect(result.status).toBe('visited');
    expect(result.visitedAt).not.toBeNull();
  });
});

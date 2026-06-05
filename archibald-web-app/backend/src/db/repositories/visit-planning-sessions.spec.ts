import { describe, test, expect, vi } from 'vitest';
import {
  createSession,
  listSessions,
  getSession,
  updateSession,
  softDeleteSession,
} from './visit-planning-sessions';
import type { VisitPlanningSession, VisitPlanningSessionId } from './visit-planning-types';

const SESSION_ID = 'session-uuid-1' as VisitPlanningSessionId;
const USER_ID    = 'user-test-1';
const NOW        = new Date('2026-06-05T10:00:00Z');

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    title: 'Giro Napoli',
    horizon: 'day',
    mode: 'balanced',
    status: 'draft',
    start_date: '2026-06-06',
    end_date: '2026-06-06',
    start_location_label: null,
    start_lat: null,
    start_lng: null,
    end_location_label: null,
    end_lat: null,
    end_lng: null,
    constraints_json: {},
    metrics_json: {},
    navigation_started_at: null,
    active_stop_id: null,
    generated_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makePool(row = makeSessionRow()) {
  return {
    query: vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 }),
  } as any;
}

describe('createSession', () => {
  test('inserisce sessione e restituisce oggetto mappato', async () => {
    const pool = makePool();
    const result = await createSession(pool, USER_ID, {
      title: 'Giro Napoli',
      horizon: 'day',
      mode: 'balanced',
      startDate: '2026-06-06',
      endDate: '2026-06-06',
      startLocationLabel: null,
      startLat: null,
      startLng: null,
      endLocationLabel: null,
      endLat: null,
      endLng: null,
      constraintsJson: {},
    });

    expect(result).toMatchObject<Partial<VisitPlanningSession>>({
      id: SESSION_ID,
      userId: USER_ID,
      title: 'Giro Napoli',
      horizon: 'day',
      mode: 'balanced',
      status: 'draft',
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

describe('listSessions', () => {
  test('restituisce array di sessioni per utente e range date', async () => {
    const pool = makePool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [makeSessionRow(), makeSessionRow({ id: 'session-uuid-2' as VisitPlanningSessionId })],
      rowCount: 2,
    });

    const results = await listSessions(pool, USER_ID, {
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ userId: USER_ID });
  });
});

describe('getSession', () => {
  test('restituisce null se non trovata', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as any;
    const result = await getSession(pool, USER_ID, SESSION_ID);
    expect(result).toBeNull();
  });

  test('restituisce la sessione se trovata', async () => {
    const pool = makePool();
    const result = await getSession(pool, USER_ID, SESSION_ID);
    expect(result?.id).toBe(SESSION_ID);
  });
});

describe('updateSession', () => {
  test('lancia errore se nessun campo da aggiornare', async () => {
    const pool = makePool();
    await expect(updateSession(pool, USER_ID, SESSION_ID, {})).rejects.toThrow('No fields');
  });

  test('aggiorna status e restituisce sessione aggiornata', async () => {
    const pool = makePool(makeSessionRow({ status: 'planned' }));
    const result = await updateSession(pool, USER_ID, SESSION_ID, { status: 'planned' });
    expect(result.status).toBe('planned');
  });
});

describe('softDeleteSession', () => {
  test('lancia errore se sessione non trovata', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) } as any;
    await expect(softDeleteSession(pool, USER_ID, SESSION_ID)).rejects.toThrow('not found');
  });

  test('completa senza errore se trovata', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) } as any;
    await expect(softDeleteSession(pool, USER_ID, SESSION_ID)).resolves.toBeUndefined();
  });
});

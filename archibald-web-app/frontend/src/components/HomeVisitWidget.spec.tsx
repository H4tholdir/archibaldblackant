import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeVisitWidget } from './HomeVisitWidget';
import type { VisitPlanningSession, VisitPlanningStop } from '../types/visit-planning';

vi.mock('../services/visit-planning.service', () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  listStops:    vi.fn().mockResolvedValue([]),
}));

function makeSession(overrides: Partial<VisitPlanningSession> = {}): VisitPlanningSession {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: 'sess-1', userId: 'user-1', title: 'Giro Napoli',
    horizon: 'day', mode: 'balanced', status: 'planned',
    startDate: today, endDate: today,
    startLocationLabel: null, startLat: null, startLng: null,
    endLocationLabel: null, endLat: null, endLng: null,
    constraintsJson: {}, metricsJson: {},
    navigationStartedAt: null, activeStopId: null, generatedAt: null,
    createdAt: today, updatedAt: today,
    ...overrides,
  };
}

describe('HomeVisitWidget', () => {
  test('mostra messaggio "nessun giro oggi" se nessuna sessione', () => {
    render(
      <MemoryRouter>
        <HomeVisitWidget todaySession={null} stops={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText(/nessun giro/i)).toBeInTheDocument();
  });

  test('mostra il titolo della sessione di oggi', () => {
    const session = makeSession();
    render(
      <MemoryRouter>
        <HomeVisitWidget todaySession={session} stops={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText('Giro Napoli')).toBeInTheDocument();
  });

  test('mostra il numero di tappe', () => {
    const session = makeSession();
    const stops: VisitPlanningStop[] = [
      {
        id: 's1', sessionId: 'sess-1', userId: 'u1', sourceType: 'archibald', sourceId: '55.374',
        displayName: 'Dr. Rossi', appointmentId: null, stopDate: session.startDate, sequence: 1,
        status: 'confirmed', locked: false, estimatedArrival: null, estimatedDeparture: null,
        visitMinutes: 30, travelMinutesFromPrevious: null, distanceKmFromPrevious: null,
        scoreTotal: null, scoreBreakdownJson: {}, recommendationReasons: [], alerts: [],
        manualNote: null, skipReason: null, visitedAt: null,
        createdAt: '', updatedAt: '',
      },
    ];
    render(
      <MemoryRouter>
        <HomeVisitWidget todaySession={session} stops={stops} />
      </MemoryRouter>
    );
    expect(screen.getByText(/1 tappa/i)).toBeInTheDocument();
  });
});

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VisitStopCard } from './VisitStopCard';
import type { VisitPlanningStop } from '../../types/visit-planning';

function makeStop(overrides: Partial<VisitPlanningStop> = {}): VisitPlanningStop {
  return {
    id: 'stop-1', sessionId: 'sess-1', userId: 'user-1',
    sourceType: 'archibald', sourceId: '55.374',
    displayName: 'Dr. Rossi Mario',
    appointmentId: null, stopDate: '2026-06-06', sequence: 1,
    status: 'suggested', locked: false,
    estimatedArrival: '2026-06-06T09:00:00Z',
    estimatedDeparture: null, visitMinutes: 30,
    travelMinutesFromPrevious: null, distanceKmFromPrevious: null,
    scoreTotal: 0.82, scoreBreakdownJson: {},
    recommendationReasons: ['Ultimo ordine 47 giorni fa', 'Alta probabilità riordino'],
    alerts: [],
    manualNote: null, skipReason: null, visitedAt: null,
    createdAt: '2026-06-05T10:00:00Z', updatedAt: '2026-06-05T10:00:00Z',
    ...overrides,
  };
}

describe('VisitStopCard', () => {
  test('mostra il nome del cliente', () => {
    render(<VisitStopCard stop={makeStop()} onStatusChange={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('Dr. Rossi Mario')).toBeInTheDocument();
  });

  test('mostra badge sorgente archibald', () => {
    render(<VisitStopCard stop={makeStop()} onStatusChange={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  test('mostra badge sorgente fresis per arca', () => {
    render(<VisitStopCard stop={makeStop({ sourceType: 'arca', sourceId: 'C00602' })} onStatusChange={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('F')).toBeInTheDocument();
  });

  test('mostra orario stimato se estimatedArrival valorizzato', () => {
    render(<VisitStopCard stop={makeStop()} onStatusChange={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
  });

  test('chiama onNavigate al click del pulsante naviga', () => {
    const onNavigate = vi.fn();
    render(<VisitStopCard stop={makeStop()} onStatusChange={vi.fn()} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTitle('Naviga'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  test('mostra alert visibile se alerts non vuoto', () => {
    const stop = makeStop({ alerts: ['⚠️ Cliente chiuso per patronale'] });
    render(<VisitStopCard stop={stop} onStatusChange={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText(/chiuso per patronale/i)).toBeInTheDocument();
  });
});

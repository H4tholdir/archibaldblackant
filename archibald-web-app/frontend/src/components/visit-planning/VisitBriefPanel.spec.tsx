import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisitBriefPanel } from './VisitBriefPanel';
import type { VisitBrief } from '../../types/visit-planning';

function makeBrief(overrides: Partial<VisitBrief> = {}): VisitBrief {
  return {
    sourceType: 'archibald', sourceId: '55.374',
    displayName: 'Dr. Rossi Mario',
    street: 'Via Roma 1', postalCode: '80100', city: 'Napoli',
    phone: '081123456', email: null, lat: null, lng: null,
    geoQuality: 'unknown', isDistributor: false,
    matchedSources: [{ type: 'archibald', id: '55.374', name: 'Dr. Rossi' }],
    lastOrders: [
      { docRef: 'FT 854/2026', date: '2026-06-02', amountImponibile: 172.13, source: 'fresis', items: [{ code: '94003SC', description: 'Gommino DIA', qty: 1 }] },
    ],
    reorderCycleDays: 28,
    daysSinceLastOrder: 3,
    reorderProbability: 'high',
    suggestedCategories: ['Endodonzia', 'Ortodonzia'],
    activePromotions: [{ id: 'promo-1', name: 'Promo Giugno', tagline: 'Sconto 15%', validTo: '2026-06-30' }],
    openReminders: [],
    ...overrides,
  };
}

describe('VisitBriefPanel', () => {
  test("mostra il nome del cliente nell'header", () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    expect(screen.getByText('Dr. Rossi Mario')).toBeInTheDocument();
  });

  test('sezione "Da proporre oggi" è in cima e visibile', () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    expect(screen.getByText(/Da proporre oggi/i)).toBeInTheDocument();
    expect(screen.getByText(/Endodonzia/)).toBeInTheDocument();
  });

  test('mostra la promozione attiva', () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    expect(screen.getByText(/Promo Giugno/)).toBeInTheDocument();
  });

  test('mostra ultimo ordine FT', () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    expect(screen.getByText(/FT 854\/2026/)).toBeInTheDocument();
  });

  test('mostra badge sorgente archibald [A]', () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    expect(screen.getByText('[A]')).toBeInTheDocument();
  });

  test('mostra pulsante chiama se phone valorizzato', () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    const callBtn = screen.getByTitle('Chiama');
    expect(callBtn).toBeInTheDocument();
  });
});

import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { FedExReportSection } from './FedExReportSection';
import { updateClaimStatus } from '../../services/fedex-report.service';

vi.mock('../../services/fedex-report.service', () => ({
  getTrackingStats: vi.fn().mockResolvedValue({
    totalWithTracking: 50, delivered: 42, exceptionActive: 4, held: 2, returning: 1,
    byCode: [{ code: 'DEX08', description: 'Recipient not in', count: 3 }],
    claimsSummary: { open: 2, submitted: 1, resolved: 0 },
  }),
  getTrackingExceptions: vi.fn().mockResolvedValue([
    { id: 1, orderNumber: 'ORD-001', trackingNumber: 'FX001', exceptionType: 'exception',
      exceptionCode: 'DEX08', exceptionDescription: 'Recipient not in',
      occurredAt: '2026-03-25T10:00:00', resolvedAt: null, resolution: null,
      claimStatus: null, claimSubmittedAt: null, notes: null, userId: 'u1', createdAt: '2026-03-25T10:00:00' },
  ]),
  updateClaimStatus: vi.fn(),
  downloadClaimPdf: vi.fn(),
  exportExceptionsCsv: vi.fn(),
}));

describe('FedExReportSection', () => {
  test('mostra i contatori statistiche', async () => {
    render(<FedExReportSection />);
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();  // delivered
      expect(screen.getByText('4')).toBeInTheDocument();   // exceptionActive
    });
  });

  test('mostra una riga per ogni eccezione', async () => {
    render(<FedExReportSection />);
    await waitFor(() => {
      expect(screen.getByText('ORD-001')).toBeInTheDocument();
      expect(screen.getByText('FX001')).toBeInTheDocument();
    });
  });

  test('chiama updateClaimStatus al click su Apri reclamo', async () => {
    render(<FedExReportSection />);
    await waitFor(() => expect(screen.getByText('Apri reclamo')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Apri reclamo'));
    await waitFor(() => expect(vi.mocked(updateClaimStatus)).toHaveBeenCalledWith(1, 'open'));
  });
});

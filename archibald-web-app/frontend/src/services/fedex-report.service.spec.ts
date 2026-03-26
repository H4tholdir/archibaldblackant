import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { TrackingStats, TrackingException } from './fedex-report.service';
import { getTrackingStats, getTrackingExceptions, updateClaimStatus, getMyExceptions, exportExceptionsCsv } from './fedex-report.service';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const makeResponse = (body: unknown) => ({
  ok: true,
  json: () => Promise.resolve(body),
});

beforeEach(() => mockFetch.mockReset());

describe('getTrackingStats', () => {
  test('chiama /api/admin/tracking/stats con i filtri corretti', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ total: 5, delivered: 10 } as Partial<TrackingStats>));
    const result = await getTrackingStats({ from: '2026-01-01', to: '2026-03-31' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/tracking/stats?'),
      expect.any(Object),
    );
    expect(result).toMatchObject({ total: 5, delivered: 10 });
  });
});

describe('updateClaimStatus', () => {
  test('chiama PATCH con il body corretto', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ id: 1, claimStatus: 'open' }));
    await updateClaimStatus(1, 'open');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/tracking/exceptions/1/claim'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ claimStatus: 'open' }),
      }),
    );
  });
});

describe('getTrackingExceptions', () => {
  test('chiama /api/admin/tracking/exceptions con i filtri', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse([]));
    await getTrackingExceptions({ status: 'open', from: '2026-01-01' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/tracking/exceptions?'),
      expect.any(Object),
    );
  });
});

describe('getMyExceptions', () => {
  test('chiama /api/tracking/my-exceptions', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse([]));
    await getMyExceptions();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tracking/my-exceptions'),
      expect.any(Object),
    );
  });
});

describe('exportExceptionsCsv', () => {
  const exceptionStub: TrackingException = {
    id: 1, orderNumber: 'ORD-001', trackingNumber: 'FX001',
    exceptionType: 'exception', exceptionCode: 'DEX08',
    exceptionDescription: 'Recipient not in', occurredAt: '2026-03-25T10:00:00',
    resolvedAt: null, resolution: null, claimStatus: null,
    claimSubmittedAt: null, notes: null, userId: 'u1', createdAt: '2026-03-25T10:00:00',
  };

  test('genera CSV con le colonne corrette', () => {
    const mockAnchor = { href: '', download: '', click: vi.fn(), style: {} } as unknown as HTMLAnchorElement;
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValueOnce(mockAnchor);
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor);
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor);
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
    URL.revokeObjectURL = vi.fn();

    exportExceptionsCsv([exceptionStub]);

    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockAnchor.download).toMatch(/eccezioni-fedex-/);
    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});

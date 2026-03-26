import { describe, expect, test, vi, beforeEach } from 'vitest';
import { getTrackingStats, updateClaimStatus } from './fedex-report.service';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const makeResponse = (body: unknown) => ({
  ok: true,
  json: () => Promise.resolve(body),
});

beforeEach(() => mockFetch.mockReset());

describe('getTrackingStats', () => {
  test('chiama /api/admin/tracking/stats con i filtri corretti', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ total: 5 }));
    const result = await getTrackingStats({ from: '2026-01-01', to: '2026-03-31' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/tracking/stats?'),
      expect.any(Object),
    );
    expect(result).toMatchObject({ total: 5 });
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

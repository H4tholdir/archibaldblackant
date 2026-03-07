import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { FedExTrackingResult } from './fedex-tracking-scraper';
import { mapTrackingStatus, syncTracking, type TrackingSyncDeps } from './tracking-sync';

function makeMockPool(
  mockOrders: Array<{ order_number: string; tracking_number: string }>,
): { pool: DbPool; queries: Array<{ text: string; values: unknown[] }> } {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pool = {
    query: async (text: string, values?: unknown[]) => {
      queries.push({ text, values: values ?? [] });
      if (text.includes('tracking_number IS NOT NULL')) {
        return { rows: mockOrders, rowCount: mockOrders.length };
      }
      return { rows: [], rowCount: 0 };
    },
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
  return { pool, queries };
}

function makeResult(
  trackingNumber: string,
  overrides: Partial<FedExTrackingResult> = {},
): FedExTrackingResult {
  return {
    trackingNumber,
    success: true,
    keyStatus: 'In transit',
    keyStatusCD: 'IT',
    statusBarCD: 'OW',
    lastScanStatus: 'In transit',
    lastScanDateTime: '2026-03-06T10:00:00',
    lastScanLocation: 'Milan, IT',
    origin: 'Verona, IT',
    destination: 'Naples, IT',
    serviceDesc: 'FedEx International Priority',
    scanEvents: [],
    ...overrides,
  };
}

function makeDeps(
  mockOrders: Array<{ order_number: string; tracking_number: string }>,
  scrapeFn: TrackingSyncDeps['scrapeFedEx'],
): { deps: TrackingSyncDeps; queries: Array<{ text: string; values: unknown[] }> } {
  const { pool, queries } = makeMockPool(mockOrders);
  return {
    deps: { pool, scrapeFedEx: scrapeFn },
    queries,
  };
}

describe('mapTrackingStatus', () => {
  test('DL statusBarCD returns delivered', () => {
    expect(mapTrackingStatus('DL', 'DL')).toBe('delivered');
  });

  test('DE statusBarCD returns exception', () => {
    expect(mapTrackingStatus('DE', 'DE')).toBe('exception');
  });

  test('OD keyStatusCD with non-DL/DE statusBarCD returns out_for_delivery', () => {
    expect(mapTrackingStatus('IT', 'OD')).toBe('out_for_delivery');
  });

  test('OW statusBarCD returns in_transit', () => {
    expect(mapTrackingStatus('OW', 'IT')).toBe('in_transit');
  });

  test('unknown codes return pending', () => {
    expect(mapTrackingStatus('XX', 'YY')).toBe('pending');
  });

  test('DL takes priority over OD keyStatusCD', () => {
    expect(mapTrackingStatus('DL', 'OD')).toBe('delivered');
  });

  test('DE takes priority over OD keyStatusCD', () => {
    expect(mapTrackingStatus('DE', 'OD')).toBe('exception');
  });
});

describe('syncTracking', () => {
  const noProgress = vi.fn();
  const neverStop = () => false;

  test('all successful in-transit updates both orders', async () => {
    const mockOrders = [
      { order_number: 'ORD/001', tracking_number: 'TRK111' },
      { order_number: 'ORD/002', tracking_number: 'TRK222' },
    ];
    const scrapeFn = vi.fn<TrackingSyncDeps['scrapeFedEx']>().mockResolvedValue([
      makeResult('TRK111'),
      makeResult('TRK222'),
    ]);
    const { deps, queries } = makeDeps(mockOrders, scrapeFn);

    const result = await syncTracking(deps, 'user-1', noProgress, neverStop);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      trackingProcessed: 2,
      trackingUpdated: 2,
      trackingFailed: 0,
      newDeliveries: 0,
    }));
    const updateQueries = queries.filter((q) => q.text.includes('tracking_status ='));
    expect(updateQueries).toHaveLength(2);
  });

  test('mix of success and failure', async () => {
    const mockOrders = [
      { order_number: 'ORD/001', tracking_number: 'TRK111' },
      { order_number: 'ORD/002', tracking_number: 'TRK222' },
    ];
    const scrapeFn = vi.fn<TrackingSyncDeps['scrapeFedEx']>().mockResolvedValue([
      makeResult('TRK111'),
      { trackingNumber: 'TRK222', success: false, error: 'Timeout' },
    ]);
    const { deps, queries } = makeDeps(mockOrders, scrapeFn);

    const result = await syncTracking(deps, 'user-1', noProgress, neverStop);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      trackingUpdated: 1,
      trackingFailed: 1,
    }));
    const incrementQueries = queries.filter((q) => q.text.includes('tracking_sync_failures, 0) + 1'));
    expect(incrementQueries).toHaveLength(1);
  });

  test('delivery detected increments newDeliveries', async () => {
    const mockOrders = [
      { order_number: 'ORD/001', tracking_number: 'TRK111' },
    ];
    const scrapeFn = vi.fn<TrackingSyncDeps['scrapeFedEx']>().mockResolvedValue([
      makeResult('TRK111', {
        statusBarCD: 'DL',
        keyStatusCD: 'DL',
        actualDelivery: '2026-03-06',
        receivedByName: 'Mario Rossi',
      }),
    ]);
    const { deps } = makeDeps(mockOrders, scrapeFn);

    const result = await syncTracking(deps, 'user-1', noProgress, neverStop);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      trackingUpdated: 1,
      newDeliveries: 1,
    }));
  });

  test('no orders returns early with zero counts', async () => {
    const scrapeFn = vi.fn<TrackingSyncDeps['scrapeFedEx']>();
    const { deps } = makeDeps([], scrapeFn);

    const result = await syncTracking(deps, 'user-1', noProgress, neverStop);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      trackingProcessed: 0,
      trackingUpdated: 0,
      trackingFailed: 0,
      newDeliveries: 0,
    }));
    expect(scrapeFn).not.toHaveBeenCalled();
  });

  test('suspension triggered when >50% failures', async () => {
    const mockOrders = [
      { order_number: 'ORD/001', tracking_number: 'TRK111' },
      { order_number: 'ORD/002', tracking_number: 'TRK222' },
      { order_number: 'ORD/003', tracking_number: 'TRK333' },
    ];
    const scrapeFn = vi.fn<TrackingSyncDeps['scrapeFedEx']>().mockResolvedValue([
      { trackingNumber: 'TRK111', success: false, error: 'fail' },
      { trackingNumber: 'TRK222', success: false, error: 'fail' },
      makeResult('TRK333'),
    ]);
    const { deps } = makeDeps(mockOrders, scrapeFn);

    const result = await syncTracking(deps, 'user-1', noProgress, neverStop);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      trackingUpdated: 1,
      trackingFailed: 2,
      suspended: true,
    }));
  });

  test('shouldStop at start returns error', async () => {
    const scrapeFn = vi.fn<TrackingSyncDeps['scrapeFedEx']>();
    const { deps } = makeDeps([], scrapeFn);

    const result = await syncTracking(deps, 'user-1', noProgress, () => true);

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('stop'),
    }));
  });
});

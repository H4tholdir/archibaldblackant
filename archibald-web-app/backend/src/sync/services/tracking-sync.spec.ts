import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { FedExTrackingResult } from './fedex-api-tracker';
import { mapTrackingStatus } from './tracking-sync';

vi.mock('./fedex-api-tracker', () => ({
  trackViaFedExApi: vi.fn(),
}));

import { trackViaFedExApi } from './fedex-api-tracker';
import { syncTracking } from './tracking-sync';

const mockTrackViaFedExApi = vi.mocked(trackViaFedExApi);

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
    lastScanDateTime: '2026-03-06 10:00:00',
    lastScanLocation: 'Milan, IT',
    origin: 'Verona, IT',
    destination: 'Naples, IT',
    serviceDesc: 'FedEx International Priority',
    scanEvents: [],
    ...overrides,
  };
}

describe('mapTrackingStatus', () => {
  const cases: Array<[string, string, string]> = [
    ['DL', 'DL', 'delivered'],
    ['RS', 'IT', 'returning'],
    ['RP', 'IT', 'returning'],
    ['IT', 'RS', 'returning'],
    ['HL', 'IT', 'held'],
    ['HP', 'IT', 'held'],
    ['IT', 'HL', 'held'],
    ['CA', 'IT', 'canceled'],
    ['DE', 'IT', 'exception'],
    ['IT', 'DE', 'exception'],
    ['IT', 'DF', 'exception'],
    ['SE', 'IT', 'exception'],
    ['DY', 'IT', 'exception'],
    ['DD', 'IT', 'exception'],
    ['CD', 'IT', 'exception'],
    ['OD', 'OD', 'out_for_delivery'],
    ['IT', 'OD', 'out_for_delivery'],
    ['IT', 'IT', 'in_transit'],
    ['PU', 'PU', 'in_transit'],
    ['OW', 'IT', 'in_transit'],
    ['AR', 'IT', 'in_transit'],
    ['DP', 'IT', 'in_transit'],
    ['AF', 'IT', 'in_transit'],
    ['FD', 'IT', 'in_transit'],
    ['XX', 'YY', 'pending'],
  ];

  test.each(cases)('statusBarCD=%s keyStatusCD=%s → %s', (bar, key, expected) => {
    expect(mapTrackingStatus(bar, key)).toBe(expected);
  });
});

describe('syncTracking', () => {
  const noProgress = vi.fn();
  const neverStop = () => false;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('all successful in-transit updates both orders', async () => {
    const mockOrders = [
      { order_number: 'ORD/001', tracking_number: 'TRK111' },
      { order_number: 'ORD/002', tracking_number: 'TRK222' },
    ];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK111'),
      makeResult('TRK222'),
    ]);
    const { pool, queries } = makeMockPool(mockOrders);

    const result = await syncTracking(pool, 'user-1', noProgress, neverStop);

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
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK111'),
      { trackingNumber: 'TRK222', success: false, error: 'Not found' },
    ]);
    const { pool, queries } = makeMockPool(mockOrders);

    const result = await syncTracking(pool, 'user-1', noProgress, neverStop);

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
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK111', {
        statusBarCD: 'DL',
        keyStatusCD: 'DL',
        actualDelivery: '2026-03-06',
        receivedByName: 'Mario Rossi',
      }),
    ]);
    const { pool } = makeMockPool(mockOrders);

    const result = await syncTracking(pool, 'user-1', noProgress, neverStop);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      trackingUpdated: 1,
      newDeliveries: 1,
    }));
  });

  test('no orders returns early with zero counts', async () => {
    const { pool } = makeMockPool([]);

    const result = await syncTracking(pool, 'user-1', noProgress, neverStop);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      trackingProcessed: 0,
      trackingUpdated: 0,
      trackingFailed: 0,
      newDeliveries: 0,
    }));
    expect(mockTrackViaFedExApi).not.toHaveBeenCalled();
  });

  test('shouldStop at start returns error', async () => {
    const { pool } = makeMockPool([]);

    const result = await syncTracking(pool, 'user-1', noProgress, () => true);

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('stop'),
    }));
  });

  test('calls onTrackingEvent with "delivered" when status is delivered', async () => {
    const mockOrders = [{ order_number: 'ORD/001', tracking_number: 'TRK111' }];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK111', { statusBarCD: 'DL', keyStatusCD: 'DL', actualDelivery: '2026-03-26 12:00:00' }),
    ]);
    const { pool } = makeMockPool(mockOrders);
    const onTrackingEvent = vi.fn().mockResolvedValue(undefined);

    await syncTracking(pool, 'user-1', vi.fn(), () => false, onTrackingEvent);

    expect(onTrackingEvent).toHaveBeenCalledOnce();
    expect(onTrackingEvent).toHaveBeenCalledWith('delivered', 'ORD/001');
  });

  test('calls onTrackingEvent with "exception" when status is exception', async () => {
    const mockOrders = [{ order_number: 'ORD/002', tracking_number: 'TRK222' }];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK222', { statusBarCD: 'DE', keyStatusCD: 'DE' }),
    ]);
    const { pool } = makeMockPool(mockOrders);
    const onTrackingEvent = vi.fn().mockResolvedValue(undefined);

    await syncTracking(pool, 'user-1', vi.fn(), () => false, onTrackingEvent);

    expect(onTrackingEvent).toHaveBeenCalledOnce();
    expect(onTrackingEvent).toHaveBeenCalledWith('exception', 'ORD/002');
  });

  test('does not call onTrackingEvent for in_transit status', async () => {
    const mockOrders = [{ order_number: 'ORD/003', tracking_number: 'TRK333' }];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK333', { statusBarCD: 'OW', keyStatusCD: 'IT' }),
    ]);
    const { pool } = makeMockPool(mockOrders);
    const onTrackingEvent = vi.fn().mockResolvedValue(undefined);

    await syncTracking(pool, 'user-1', vi.fn(), () => false, onTrackingEvent);

    expect(onTrackingEvent).not.toHaveBeenCalled();
  });

  test('does not throw when onTrackingEvent is not defined', async () => {
    const mockOrders = [{ order_number: 'ORD/004', tracking_number: 'TRK444' }];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK444', { statusBarCD: 'DL', keyStatusCD: 'DL', actualDelivery: '2026-03-26 12:00:00' }),
    ]);
    const { pool } = makeMockPool(mockOrders);

    await expect(
      syncTracking(pool, 'user-1', vi.fn(), () => false),
    ).resolves.toMatchObject({ success: true });
  });
});

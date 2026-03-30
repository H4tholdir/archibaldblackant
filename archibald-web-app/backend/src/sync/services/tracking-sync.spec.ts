import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { FedExTrackingResult } from './fedex-api-tracker';
import { mapTrackingStatus, normalizeForFedEx } from './tracking-sync';

vi.mock('./fedex-api-tracker', () => ({
  trackViaFedExApi: vi.fn(),
}));

import { trackViaFedExApi } from './fedex-api-tracker';
import { syncTracking } from './tracking-sync';

const mockTrackViaFedExApi = vi.mocked(trackViaFedExApi);

function makeMockPool(
  mockDdts: Array<{ id: string; order_id: string; order_number: string; tracking_number: string }>,
  insertRowCount = 1,
): { pool: DbPool; queries: Array<{ text: string; values: unknown[] }> } {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pool = {
    query: async (text: string, values?: unknown[]) => {
      queries.push({ text, values: values ?? [] });
      if (text.includes('od.tracking_number IS NOT NULL')) {
        return { rows: mockDdts, rowCount: mockDdts.length };
      }
      if (text.includes('COUNT(delivery_confirmed_at)')) {
        return { rows: [{ total: '1', delivered: '0' }], rowCount: 1 };
      }
      if (text.trim().toUpperCase().startsWith('INSERT')) {
        return { rows: [], rowCount: insertRowCount };
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

describe('normalizeForFedEx', () => {
  test.each([
    ['fedex 445291886931', '445291886931'],
    ['FedEx 445291886931', '445291886931'],
    ['FEDEX 445291886931', '445291886931'],
    ['fedex  445291886931', '445291886931'],
    ['445291886931', '445291886931'],
    ['TRK111', 'TRK111'],
  ])('normalizes %s → %s', (raw, expected) => {
    expect(normalizeForFedEx(raw)).toBe(expected);
  });

  test.each([
    ['Ups 1Z4V26Y86872784611'],
    ['ups 1Z4V26Y86872784611'],
    ['dhl 1234567890'],
    ['DHL 1234567890'],
    ['gls 12345'],
    ['tnt 99999'],
    [''],
    ['   '],
    ['fedex '],
  ])('returns null for non-FedEx or empty: %s', (raw) => {
    expect(normalizeForFedEx(raw)).toBeNull();
  });
});

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
    const mockDdts = [
      { id: 'ddt-1', order_id: 'ord-1', order_number: 'ORD/001', tracking_number: 'TRK111' },
      { id: 'ddt-2', order_id: 'ord-2', order_number: 'ORD/002', tracking_number: 'TRK222' },
    ];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK111'),
      makeResult('TRK222'),
    ]);
    const { pool, queries } = makeMockPool(mockDdts);

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
    const mockDdts = [
      { id: 'ddt-1', order_id: 'ord-1', order_number: 'ORD/001', tracking_number: 'TRK111' },
      { id: 'ddt-2', order_id: 'ord-2', order_number: 'ORD/002', tracking_number: 'TRK222' },
    ];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK111'),
      { trackingNumber: 'TRK222', success: false, error: 'Not found' },
    ]);
    const { pool, queries } = makeMockPool(mockDdts);

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
    const mockDdts = [
      { id: 'ddt-1', order_id: 'ord-1', order_number: 'ORD/001', tracking_number: 'TRK111' },
    ];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK111', {
        statusBarCD: 'DL',
        keyStatusCD: 'DL',
        actualDelivery: '2026-03-06',
        receivedByName: 'Mario Rossi',
      }),
    ]);
    const { pool } = makeMockPool(mockDdts);

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
    const mockDdts = [{ id: 'ddt-1', order_id: 'ord-1', order_number: 'ORD/001', tracking_number: 'TRK111' }];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK111', { statusBarCD: 'DL', keyStatusCD: 'DL', actualDelivery: '2026-03-26 12:00:00' }),
    ]);
    const { pool } = makeMockPool(mockDdts);
    const onTrackingEvent = vi.fn().mockResolvedValue(undefined);

    await syncTracking(pool, 'user-1', vi.fn(), () => false, onTrackingEvent);

    expect(onTrackingEvent).toHaveBeenCalledOnce();
    expect(onTrackingEvent).toHaveBeenCalledWith('delivered', 'ORD/001');
  });

  test('calls onTrackingEvent with "exception" when status is exception and is new', async () => {
    const mockDdts = [{ id: 'ddt-2', order_id: 'ord-2', order_number: 'ORD/002', tracking_number: 'TRK222' }];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK222', {
        statusBarCD: 'DE', keyStatusCD: 'DE',
        scanEvents: [{ statusCD: 'DE', exception: true, exceptionCode: '08',
          exceptionDescription: 'Recipient not in', date: '2026-03-26', time: '10:00:00', status: 'Delivery exception' }],
      }),
    ]);
    const { pool } = makeMockPool(mockDdts, 1);
    const onTrackingEvent = vi.fn().mockResolvedValue(undefined);

    await syncTracking(pool, 'user-1', vi.fn(), () => false, onTrackingEvent);

    expect(onTrackingEvent).toHaveBeenCalledOnce();
    expect(onTrackingEvent).toHaveBeenCalledWith('exception', 'ORD/002');
  });

  test('does not call onTrackingEvent for duplicate exception (ON CONFLICT DO NOTHING)', async () => {
    const mockDdts = [{ id: 'ddt-dedup', order_id: 'ord-dedup', order_number: 'ORD/DEDUP', tracking_number: 'TRK_DEDUP' }];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK_DEDUP', {
        statusBarCD: 'DE', keyStatusCD: 'DE',
        scanEvents: [{ statusCD: 'DE', exception: true, exceptionCode: '08',
          exceptionDescription: 'Recipient not in', date: '2026-03-26', time: '10:00:00', status: 'Delivery exception' }],
      }),
    ]);
    // insertRowCount = 0 simula ON CONFLICT DO NOTHING (nessuna riga inserita)
    const { pool } = makeMockPool(mockDdts, 0);
    const onTrackingEvent = vi.fn().mockResolvedValue(undefined);

    await syncTracking(pool, 'user-1', vi.fn(), () => false, onTrackingEvent);

    expect(onTrackingEvent).not.toHaveBeenCalled();
  });

  test('does not call onTrackingEvent for in_transit status', async () => {
    const mockDdts = [{ id: 'ddt-3', order_id: 'ord-3', order_number: 'ORD/003', tracking_number: 'TRK333' }];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK333', { statusBarCD: 'OW', keyStatusCD: 'IT' }),
    ]);
    const { pool } = makeMockPool(mockDdts);
    const onTrackingEvent = vi.fn().mockResolvedValue(undefined);

    await syncTracking(pool, 'user-1', vi.fn(), () => false, onTrackingEvent);

    expect(onTrackingEvent).not.toHaveBeenCalled();
  });

  test('does not throw when onTrackingEvent is not defined', async () => {
    const mockDdts = [{ id: 'ddt-4', order_id: 'ord-4', order_number: 'ORD/004', tracking_number: 'TRK444' }];
    mockTrackViaFedExApi.mockResolvedValue([
      makeResult('TRK444', { statusBarCD: 'DL', keyStatusCD: 'DL', actualDelivery: '2026-03-26 12:00:00' }),
    ]);
    const { pool } = makeMockPool(mockDdts);

    await expect(
      syncTracking(pool, 'user-1', vi.fn(), () => false),
    ).resolves.toMatchObject({ success: true });
  });

  test('strips "fedex " prefix before calling FedEx API', async () => {
    const rawNumber = 'fedex 445291886931';
    const bareNumber = '445291886931';
    const mockDdts = [
      { id: 'ddt-fx', order_id: 'ord-fx', order_number: 'ORD/FX', tracking_number: rawNumber },
    ];
    mockTrackViaFedExApi.mockResolvedValue([makeResult(bareNumber)]);
    const { pool } = makeMockPool(mockDdts);

    const result = await syncTracking(pool, 'user-1', vi.fn(), () => false);

    expect(mockTrackViaFedExApi).toHaveBeenCalledWith(
      [bareNumber],
      expect.any(Function),
    );
    expect(result).toMatchObject({ success: true, trackingProcessed: 1, trackingUpdated: 1 });
  });

  test('skips UPS numbers without incrementing failures', async () => {
    const mockDdts = [
      { id: 'ddt-ups', order_id: 'ord-ups', order_number: 'ORD/UPS', tracking_number: 'Ups 1Z4V26Y86872784611' },
    ];
    const { pool, queries } = makeMockPool(mockDdts);

    const result = await syncTracking(pool, 'user-1', vi.fn(), () => false);

    expect(mockTrackViaFedExApi).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, trackingProcessed: 0, trackingFailed: 0 });
    const failureIncrements = queries.filter((q) => q.text.includes('tracking_sync_failures, 0) + 1'));
    expect(failureIncrements).toHaveLength(0);
  });

  test('mixes FedEx and UPS: only FedEx tracked, UPS skipped without failure', async () => {
    const mockDdts = [
      { id: 'ddt-fx2', order_id: 'ord-fx2', order_number: 'ORD/FX2', tracking_number: 'fedex 123456789' },
      { id: 'ddt-ups2', order_id: 'ord-ups2', order_number: 'ORD/UPS2', tracking_number: 'Ups 1ZABC123' },
    ];
    mockTrackViaFedExApi.mockResolvedValue([makeResult('123456789')]);
    const { pool, queries } = makeMockPool(mockDdts);

    const result = await syncTracking(pool, 'user-1', vi.fn(), () => false);

    expect(mockTrackViaFedExApi).toHaveBeenCalledWith(['123456789'], expect.any(Function));
    expect(result).toMatchObject({ success: true, trackingProcessed: 1, trackingUpdated: 1, trackingFailed: 0 });
    const failureIncrements = queries.filter((q) => q.text.includes('tracking_sync_failures, 0) + 1'));
    expect(failureIncrements).toHaveLength(0);
  });
});

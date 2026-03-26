import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import {
  logTrackingException,
  resolveOpenExceptions,
  getExceptionsByUser,
  getExceptionStats,
  updateClaimStatus,
  getExceptionById,
} from './tracking-exceptions';

const USER_ID = 'user-test-001';
const ORDER_NUMBER = 'ORD-TEST-001';
const TRACKING_NUMBER = 'FX999TEST001';
const OCCURRED_AT = '2026-03-25T10:14:00';

const sampleRow = {
  id: 1,
  user_id: USER_ID,
  order_number: ORDER_NUMBER,
  tracking_number: TRACKING_NUMBER,
  exception_code: 'DEX08',
  exception_description: 'Recipient not in',
  exception_type: 'exception',
  occurred_at: new Date(OCCURRED_AT),
  resolved_at: null,
  resolution: null,
  claim_status: null,
  claim_submitted_at: null,
  notes: null,
  created_at: new Date('2026-03-25T10:15:00'),
};

function createMockPool(rows: unknown[] = [], rowCount = 0): DbPool & { queryCalls: Array<{ text: string; params?: unknown[] }> } {
  const queryCalls: Array<{ text: string; params?: unknown[] }> = [];
  return {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params });
      return { rows, rowCount } as any;
    }),
    withTransaction: vi.fn(),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

describe('logTrackingException', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('inserts with correct parameters', async () => {
    const pool = createMockPool();
    await logTrackingException(pool, {
      userId: USER_ID,
      orderNumber: ORDER_NUMBER,
      trackingNumber: TRACKING_NUMBER,
      exceptionCode: 'DEX08',
      exceptionDescription: 'Recipient not in',
      exceptionType: 'exception',
      occurredAt: OCCURRED_AT,
    });
    expect(pool.queryCalls[0].params).toEqual([
      USER_ID, ORDER_NUMBER, TRACKING_NUMBER,
      'DEX08', 'Recipient not in', 'exception', OCCURRED_AT,
    ]);
  });

  test('uses ON CONFLICT DO NOTHING for idempotency', async () => {
    const pool = createMockPool();
    await logTrackingException(pool, {
      userId: USER_ID,
      orderNumber: ORDER_NUMBER,
      trackingNumber: TRACKING_NUMBER,
      exceptionCode: 'DEX08',
      exceptionDescription: 'Recipient not in',
      exceptionType: 'exception',
      occurredAt: OCCURRED_AT,
    });
    expect(pool.queryCalls[0].text).toContain('ON CONFLICT');
    expect(pool.queryCalls[0].text).toContain('DO NOTHING');
  });

  test('coerces empty exceptionCode to null', async () => {
    const pool = createMockPool();
    await logTrackingException(pool, {
      userId: USER_ID,
      orderNumber: ORDER_NUMBER,
      trackingNumber: TRACKING_NUMBER,
      exceptionCode: '',
      exceptionDescription: 'Unknown',
      exceptionType: 'held',
      occurredAt: OCCURRED_AT,
    });
    expect(pool.queryCalls[0].params?.[3]).toBeNull();
  });
});

describe('resolveOpenExceptions', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('updates resolved_at and resolution for the given order', async () => {
    const pool = createMockPool();
    await resolveOpenExceptions(pool, ORDER_NUMBER, 'delivered');
    expect(pool.queryCalls[0].params).toEqual([ORDER_NUMBER, 'delivered']);
  });

  test('restricts update to unresolved rows only', async () => {
    const pool = createMockPool();
    await resolveOpenExceptions(pool, ORDER_NUMBER, 'returned');
    expect(pool.queryCalls[0].text).toContain('resolved_at IS NULL');
  });
});

describe('getExceptionsByUser', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('maps DB row to TrackingException type', async () => {
    const pool = createMockPool([sampleRow]);
    const results = await getExceptionsByUser(pool, USER_ID, { status: 'all' });
    expect(results).toEqual([{
      id: 1,
      userId: USER_ID,
      orderNumber: ORDER_NUMBER,
      trackingNumber: TRACKING_NUMBER,
      exceptionCode: 'DEX08',
      exceptionDescription: 'Recipient not in',
      exceptionType: 'exception',
      occurredAt: new Date(OCCURRED_AT),
      resolvedAt: null,
      resolution: null,
      claimStatus: null,
      claimSubmittedAt: null,
      notes: null,
      createdAt: new Date('2026-03-25T10:15:00'),
    }]);
  });

  test('status=open adds resolved_at IS NULL clause', async () => {
    const pool = createMockPool([]);
    await getExceptionsByUser(pool, USER_ID, { status: 'open' });
    expect(pool.queryCalls[0].text).toContain('resolved_at IS NULL');
  });

  test('status=closed adds resolved_at IS NOT NULL clause', async () => {
    const pool = createMockPool([]);
    await getExceptionsByUser(pool, USER_ID, { status: 'closed' });
    expect(pool.queryCalls[0].text).toContain('resolved_at IS NOT NULL');
  });

  test('status=all does not add resolved_at clause', async () => {
    const pool = createMockPool([]);
    await getExceptionsByUser(pool, USER_ID, { status: 'all' });
    expect(pool.queryCalls[0].text).not.toContain('resolved_at');
  });

  test('undefined userId omits user_id filter', async () => {
    const pool = createMockPool([]);
    await getExceptionsByUser(pool, undefined, { status: 'all' });
    expect(pool.queryCalls[0].text).not.toContain('user_id');
    expect(pool.queryCalls[0].params).toEqual([]);
  });

  test('from/to filters are appended as bound parameters', async () => {
    const from = '2026-03-01';
    const to = '2026-03-31';
    const pool = createMockPool([]);
    await getExceptionsByUser(pool, USER_ID, { status: 'all', from, to });
    expect(pool.queryCalls[0].params).toEqual([USER_ID, from, to]);
  });
});

describe('getExceptionStats', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('executes three queries in parallel and returns aggregated stats', async () => {
    const totalsRow = { total: 5, exception_active: 2, held: 1, returning: 0 };
    const byCodeRow = { code: 'DEX08', description: 'Recipient not in', count: 3 };
    const claimsRow = { open: 1, submitted: 0, resolved: 0 };

    let callIndex = 0;
    const pool = {
      queryCalls: [] as Array<{ text: string; params?: unknown[] }>,
      query: vi.fn(async (text: string, params?: unknown[]) => {
        const results = [
          { rows: [totalsRow] },
          { rows: [byCodeRow] },
          { rows: [claimsRow] },
        ];
        return results[callIndex++] as any;
      }),
      withTransaction: vi.fn(),
      end: vi.fn(async () => {}),
      getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
    };

    const stats = await getExceptionStats(pool, { userId: USER_ID });
    expect(stats).toEqual({
      total: 5,
      exceptionActive: 2,
      held: 1,
      returning: 0,
      byCode: [byCodeRow],
      claimsSummary: claimsRow,
    });
  });

  test('userId filter is bound as first parameter in all three queries', async () => {
    const totalsRow = { total: 0, exception_active: 0, held: 0, returning: 0 };
    const claimsRow = { open: 0, submitted: 0, resolved: 0 };
    let callIndex = 0;
    const pool = {
      queryCalls: [] as Array<{ text: string; params?: unknown[] }>,
      query: vi.fn(async (text: string, params?: unknown[]) => {
        pool.queryCalls.push({ text, params });
        const results = [
          { rows: [totalsRow] },
          { rows: [] },
          { rows: [claimsRow] },
        ];
        return results[callIndex++] as any;
      }),
      withTransaction: vi.fn(),
      end: vi.fn(async () => {}),
      getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
    };

    await getExceptionStats(pool, { userId: USER_ID });
    expect(pool.queryCalls).toHaveLength(3);
    pool.queryCalls.forEach(call => {
      expect(call.params?.[0]).toEqual(USER_ID);
    });
  });
});

describe('updateClaimStatus', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('passes claimStatus, id, and userId as bound parameters', async () => {
    const pool = createMockPool();
    await updateClaimStatus(pool, 42, 'open', USER_ID);
    expect(pool.queryCalls[0].params).toEqual(['open', 42, USER_ID]);
  });

  test('sets claim_submitted_at conditionally for submitted status', async () => {
    const pool = createMockPool();
    await updateClaimStatus(pool, 42, 'submitted', USER_ID);
    expect(pool.queryCalls[0].text).toContain("WHEN $1 = 'submitted'");
  });
});

describe('getExceptionById', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('returns mapped TrackingException when row found', async () => {
    const pool = createMockPool([sampleRow]);
    const result = await getExceptionById(pool, 1);
    expect(result).toEqual({
      id: 1,
      userId: USER_ID,
      orderNumber: ORDER_NUMBER,
      trackingNumber: TRACKING_NUMBER,
      exceptionCode: 'DEX08',
      exceptionDescription: 'Recipient not in',
      exceptionType: 'exception',
      occurredAt: new Date(OCCURRED_AT),
      resolvedAt: null,
      resolution: null,
      claimStatus: null,
      claimSubmittedAt: null,
      notes: null,
      createdAt: new Date('2026-03-25T10:15:00'),
    });
  });

  test('returns null when no row found', async () => {
    const pool = createMockPool([]);
    const result = await getExceptionById(pool, 999);
    expect(result).toBeNull();
  });

  test('queries by id as bound parameter', async () => {
    const pool = createMockPool([]);
    await getExceptionById(pool, 7);
    expect(pool.queryCalls[0].params).toEqual([7]);
  });
});

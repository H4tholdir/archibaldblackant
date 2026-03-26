import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import {
  getUnreadCount,
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  deleteExpired,
  insertNotification,
  type NotificationId,
} from './notifications';

const TEST_USER_ID = 'user-abc-123';

function createMockPool(rows: unknown[] = [], rowCount = 0): DbPool & { queryCalls: Array<{ text: string; params?: unknown[] }> } {
  const queryCalls: Array<{ text: string; params?: unknown[] }> = [];
  return {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params });
      return { rows, rowCount } as any;
    }),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

const CREATED_AT = new Date('2026-03-26T10:00:00Z');
const EXPIRES_AT = new Date('2026-04-02T10:00:00Z');

const sampleRow = {
  id: 1,
  user_id: TEST_USER_ID,
  type: 'erp_customer_deleted',
  severity: 'error',
  title: 'Cliente eliminato',
  body: 'Il cliente Rossi è stato eliminato da ERP',
  data: { deletedProfiles: [] },
  read_at: null,
  created_at: CREATED_AT,
  expires_at: EXPIRES_AT,
};

describe('getUnreadCount', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('returns count from DB', async () => {
    const pool = createMockPool([{ count: 3 }]);
    const count = await getUnreadCount(pool, TEST_USER_ID);
    expect(count).toEqual(3);
  });

  test('returns 0 when no rows', async () => {
    const pool = createMockPool([{ count: 0 }]);
    const count = await getUnreadCount(pool, TEST_USER_ID);
    expect(count).toEqual(0);
  });
});

describe('getNotifications', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('queries with filter=unread adds read_at IS NULL', async () => {
    const pool = createMockPool([sampleRow]);
    await getNotifications(pool, TEST_USER_ID, 'unread', 20, 0);
    expect(pool.queryCalls[0].text).toContain('read_at IS NULL');
  });

  test('queries with filter=read adds read_at IS NOT NULL', async () => {
    const pool = createMockPool([sampleRow]);
    await getNotifications(pool, TEST_USER_ID, 'read', 20, 0);
    expect(pool.queryCalls[0].text).toContain('read_at IS NOT NULL');
  });

  test('maps row to Notification type', async () => {
    const pool = createMockPool([sampleRow]);
    const results = await getNotifications(pool, TEST_USER_ID, 'all', 20, 0);
    expect(results).toEqual([{
      id: 1,
      userId: TEST_USER_ID,
      type: 'erp_customer_deleted',
      severity: 'error',
      title: 'Cliente eliminato',
      body: 'Il cliente Rossi è stato eliminato da ERP',
      data: { deletedProfiles: [] },
      readAt: null,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    }]);
  });

  test('filter=all does not add read_at clause', async () => {
    const pool = createMockPool([sampleRow]);
    await getNotifications(pool, TEST_USER_ID, 'all', 20, 0);
    expect(pool.queryCalls[0].text).not.toContain('read_at');
  });
});

describe('markRead', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('updates read_at for correct user and id', async () => {
    const pool = createMockPool();
    await markRead(pool, TEST_USER_ID, 1 as NotificationId);
    expect(pool.queryCalls[0].params).toEqual([1, TEST_USER_ID]);
  });
});

describe('markAllRead', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('updates all unread for user', async () => {
    const pool = createMockPool();
    await markAllRead(pool, TEST_USER_ID);
    expect(pool.queryCalls[0].params).toEqual([TEST_USER_ID]);
  });
});

describe('deleteNotification', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('deletes for correct user and id', async () => {
    const pool = createMockPool();
    await deleteNotification(pool, TEST_USER_ID, 1 as NotificationId);
    expect(pool.queryCalls[0].params).toEqual([1, TEST_USER_ID]);
  });
});

describe('deleteExpired', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('returns count of deleted rows', async () => {
    const pool = createMockPool([], 5);
    const deleted = await deleteExpired(pool);
    expect(deleted).toEqual(5);
  });

  test('returns 0 when rowCount is null', async () => {
    const pool = createMockPool([], 0);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: null });
    const result = await deleteExpired(pool);
    expect(result).toEqual(0);
  });
});

describe('insertNotification', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('inserts and returns mapped notification', async () => {
    const pool = createMockPool([sampleRow]);
    const result = await insertNotification(pool, {
      userId: TEST_USER_ID,
      type: 'erp_customer_deleted',
      severity: 'error',
      title: 'Cliente eliminato',
      body: 'Il cliente Rossi è stato eliminato da ERP',
      data: { deletedProfiles: [] },
      expiresAt: EXPIRES_AT,
    });
    expect(result).toEqual({
      id: 1,
      userId: TEST_USER_ID,
      type: 'erp_customer_deleted',
      severity: 'error',
      title: 'Cliente eliminato',
      body: 'Il cliente Rossi è stato eliminato da ERP',
      data: { deletedProfiles: [] },
      readAt: null,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    });
  });

  test('passes expiresAt as bound parameter $7', async () => {
    const pool = createMockPool([sampleRow]);
    await insertNotification(pool, {
      userId: TEST_USER_ID,
      type: 'erp_customer_deleted',
      severity: 'error',
      title: 'Cliente eliminato',
      body: 'Il cliente Rossi è stato eliminato da ERP',
      expiresAt: EXPIRES_AT,
    });
    expect(pool.queryCalls[0].params?.[6]).toEqual(EXPIRES_AT);
    expect(pool.queryCalls[0].text).toContain('$7');
  });
});

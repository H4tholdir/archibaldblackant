import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import {
  computeNextDueAt,
  isReminderEffectivelyActive,
  createReminder,
  listCustomerReminders,
  patchReminder,
  deleteReminder,
  getRemindersOverdueOrToday,
  getTodayReminders,
  type ReminderId,
} from './customer-reminders';

const TEST_USER_ID = 'agent-xyz-001';
const TEST_CUSTOMER_ERP_ID = 'CUST-001';
const TEST_REMINDER_ID = 42 as ReminderId;

const BASE_DATE = new Date('2026-04-10T09:00:00Z');

function makeReminderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_REMINDER_ID,
    user_id: TEST_USER_ID,
    customer_erp_id: TEST_CUSTOMER_ERP_ID,
    type: 'commercial_contact',
    priority: 'normal',
    due_at: BASE_DATE,
    recurrence_days: null,
    note: null,
    notify_via: 'app',
    status: 'active',
    snoozed_until: null,
    completed_at: null,
    completion_note: null,
    created_at: BASE_DATE,
    updated_at: BASE_DATE,
    ...overrides,
  };
}

function makeReminderWithCustomerRow(overrides: Record<string, unknown> = {}) {
  return {
    ...makeReminderRow(overrides),
    customer_name: 'Rossi SRL',
    ...overrides,
  };
}

type MockPool = DbPool & { queryCalls: Array<{ text: string; params?: unknown[] }> };

/**
 * Creates a mock pool where each call consumes the next response from the queue.
 * If the queue is exhausted, returns { rows: [], rowCount: 0 }.
 */
function createMockPool(responseQueue: Array<{ rows: unknown[]; rowCount?: number }> = []): MockPool {
  const queue = [...responseQueue];
  const queryCalls: Array<{ text: string; params?: unknown[] }> = [];
  const pool: MockPool = {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params });
      const next = queue.shift() ?? { rows: [], rowCount: 0 };
      return { rows: next.rows, rowCount: next.rowCount ?? 0 } as any;
    }),
    withTransaction: vi.fn(),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
  return pool;
}

// ---------------------------------------------------------------------------
// Pure functions (no DB)
// ---------------------------------------------------------------------------

describe('computeNextDueAt', () => {
  test('returns null when recurrenceDays is null', () => {
    expect(computeNextDueAt(BASE_DATE, null)).toBeNull();
  });

  test('adds recurrenceDays to completedAt', () => {
    const recurrenceDays = 7;
    const result = computeNextDueAt(BASE_DATE, recurrenceDays);
    const expected = new Date(BASE_DATE);
    expected.setDate(expected.getDate() + recurrenceDays);
    expect(result).toEqual(expected);
  });

  test('adds 30 days correctly spanning month boundary', () => {
    const completedAt = new Date('2026-01-15T12:00:00Z');
    const result = computeNextDueAt(completedAt, 30);
    const expected = new Date('2026-02-14T12:00:00Z');
    expect(result).toEqual(expected);
  });

  test('returns a different Date object than the input', () => {
    const completedAt = new Date('2026-04-01T00:00:00Z');
    const result = computeNextDueAt(completedAt, 1);
    expect(result).not.toBe(completedAt);
  });
});

describe('isReminderEffectivelyActive', () => {
  test('returns true for status=active with no snooze', () => {
    expect(isReminderEffectivelyActive({ status: 'active', snoozed_until: null })).toBe(true);
  });

  test('returns false for status=done', () => {
    expect(isReminderEffectivelyActive({ status: 'done', snoozed_until: null })).toBe(false);
  });

  test('returns false for status=snoozed with snoozed_until in the future', () => {
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    expect(isReminderEffectivelyActive({ status: 'snoozed', snoozed_until: futureDate })).toBe(false);
  });

  test('returns true for status=snoozed with snoozed_until in the past', () => {
    const pastDate = new Date(Date.now() - 3_600_000).toISOString();
    expect(isReminderEffectivelyActive({ status: 'snoozed', snoozed_until: pastDate })).toBe(true);
  });

  test('returns false for status=snoozed with snoozed_until=null', () => {
    expect(isReminderEffectivelyActive({ status: 'snoozed', snoozed_until: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createReminder
// ---------------------------------------------------------------------------

describe('createReminder', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('inserts with explicit params and returns mapped Reminder', async () => {
    const row = makeReminderRow({ note: 'Chiama cliente', recurrence_days: 14 });
    const pool = createMockPool([{ rows: [row] }]);
    const result = await createReminder(pool, TEST_USER_ID, TEST_CUSTOMER_ERP_ID, {
      dueAt: BASE_DATE,
      note: 'Chiama cliente',
      recurrenceDays: 14,
    });
    expect(result).toEqual({
      id: TEST_REMINDER_ID,
      userId: TEST_USER_ID,
      customerErpId: TEST_CUSTOMER_ERP_ID,
      type: 'commercial_contact',
      priority: 'normal',
      dueAt: BASE_DATE,
      recurrenceDays: 14,
      note: 'Chiama cliente',
      notifyVia: 'app',
      status: 'active',
      snoozedUntil: null,
      completedAt: null,
      completionNote: null,
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
    });
  });

  test('uses default type=commercial_contact and priority=normal when not provided', async () => {
    const pool = createMockPool([{ rows: [makeReminderRow()] }]);
    await createReminder(pool, TEST_USER_ID, TEST_CUSTOMER_ERP_ID, { dueAt: BASE_DATE });
    const params = pool.queryCalls[0].params as unknown[];
    expect(params[2]).toEqual('commercial_contact');
    expect(params[3]).toEqual('normal');
  });

  test('passes userId and customerErpId as first two bound parameters', async () => {
    const pool = createMockPool([{ rows: [makeReminderRow()] }]);
    await createReminder(pool, TEST_USER_ID, TEST_CUSTOMER_ERP_ID, { dueAt: BASE_DATE });
    const params = pool.queryCalls[0].params as unknown[];
    expect(params[0]).toEqual(TEST_USER_ID);
    expect(params[1]).toEqual(TEST_CUSTOMER_ERP_ID);
  });
});

// ---------------------------------------------------------------------------
// listCustomerReminders
// ---------------------------------------------------------------------------

describe('listCustomerReminders', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('filter=active includes status IN active,snoozed clause', async () => {
    const pool = createMockPool([{ rows: [makeReminderRow()] }]);
    await listCustomerReminders(pool, TEST_USER_ID, TEST_CUSTOMER_ERP_ID, 'active');
    expect(pool.queryCalls[0].text).toContain("status IN ('active', 'snoozed')");
  });

  test('filter=done includes status=done and 30-day window clause', async () => {
    const pool = createMockPool([{ rows: [makeReminderRow({ status: 'done' })] }]);
    await listCustomerReminders(pool, TEST_USER_ID, TEST_CUSTOMER_ERP_ID, 'done');
    expect(pool.queryCalls[0].text).toContain("status = 'done'");
    expect(pool.queryCalls[0].text).toContain('30 days');
  });

  test('filter=all does not add status clause', async () => {
    const pool = createMockPool([{ rows: [makeReminderRow()] }]);
    await listCustomerReminders(pool, TEST_USER_ID, TEST_CUSTOMER_ERP_ID, 'all');
    expect(pool.queryCalls[0].text).not.toContain('status');
  });

  test('filter=active orders by urgent priority first', async () => {
    const pool = createMockPool([{ rows: [] }]);
    await listCustomerReminders(pool, TEST_USER_ID, TEST_CUSTOMER_ERP_ID, 'active');
    expect(pool.queryCalls[0].text).toContain('urgent');
  });

  test('passes userId and customerErpId as bound parameters', async () => {
    const pool = createMockPool([{ rows: [] }]);
    await listCustomerReminders(pool, TEST_USER_ID, TEST_CUSTOMER_ERP_ID, 'all');
    expect(pool.queryCalls[0].params).toEqual([TEST_USER_ID, TEST_CUSTOMER_ERP_ID]);
  });

  test('maps rows to Reminder array', async () => {
    const row = makeReminderRow();
    const pool = createMockPool([{ rows: [row] }]);
    const results = await listCustomerReminders(pool, TEST_USER_ID, TEST_CUSTOMER_ERP_ID, 'all');
    expect(results).toHaveLength(1);
    expect(results[0].id).toEqual(TEST_REMINDER_ID);
    expect(results[0].userId).toEqual(TEST_USER_ID);
  });
});

// ---------------------------------------------------------------------------
// patchReminder
// ---------------------------------------------------------------------------

describe('patchReminder', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('returns mapped Reminder after update', async () => {
    const updatedRow = makeReminderRow({ priority: 'urgent' });
    const pool = createMockPool([{ rows: [updatedRow] }]);
    const result = await patchReminder(pool, TEST_USER_ID, TEST_REMINDER_ID, { priority: 'urgent' });
    expect(result.priority).toEqual('urgent');
  });

  test('passes id and userId as first two bound parameters', async () => {
    const pool = createMockPool([{ rows: [makeReminderRow()] }]);
    await patchReminder(pool, TEST_USER_ID, TEST_REMINDER_ID, { priority: 'urgent' });
    const params = pool.queryCalls[0].params as unknown[];
    expect(params[0]).toEqual(TEST_REMINDER_ID);
    expect(params[1]).toEqual(TEST_USER_ID);
  });

  test('when status=done and recurrence_days=7, creates a new reminder', async () => {
    const completedAt = new Date('2026-04-10T10:00:00Z');
    const updatedRow = makeReminderRow({
      status: 'done',
      recurrence_days: 7,
      completed_at: completedAt,
    });
    const newRow = makeReminderRow({ id: 99, due_at: new Date('2026-04-17T10:00:00Z') });
    // Queue: first call returns updatedRow (UPDATE), second call returns newRow (INSERT)
    const pool = createMockPool([
      { rows: [updatedRow] },
      { rows: [newRow] },
    ]);

    await patchReminder(pool, TEST_USER_ID, TEST_REMINDER_ID, { status: 'done' });

    expect(pool.queryCalls).toHaveLength(2);
    expect(pool.queryCalls[1].text).toContain('INSERT INTO agents.customer_reminders');
  });

  test('when status=done and recurrence_days=null, does NOT create a new reminder', async () => {
    const completedAt = new Date('2026-04-10T10:00:00Z');
    const updatedRow = makeReminderRow({
      status: 'done',
      recurrence_days: null,
      completed_at: completedAt,
    });
    const pool = createMockPool([{ rows: [updatedRow] }]);

    await patchReminder(pool, TEST_USER_ID, TEST_REMINDER_ID, { status: 'done' });

    expect(pool.queryCalls).toHaveLength(1);
  });

  test('when status is not done, does NOT create a new reminder', async () => {
    const pool = createMockPool([{ rows: [makeReminderRow({ recurrence_days: 7 })] }]);
    await patchReminder(pool, TEST_USER_ID, TEST_REMINDER_ID, { priority: 'urgent' });
    expect(pool.queryCalls).toHaveLength(1);
  });

  test('passes updateRecurrence=false and recurrenceValue=null when recurrenceDays not provided', async () => {
    const pool = createMockPool([{ rows: [makeReminderRow()] }]);
    await patchReminder(pool, TEST_USER_ID, TEST_REMINDER_ID, { priority: 'normal' });
    const params = pool.queryCalls[0].params as unknown[];
    // $5 = updateRecurrence flag (false = do not update), $6 = recurrenceValue
    expect(params[4]).toBe(false);
    expect(params[5]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteReminder
// ---------------------------------------------------------------------------

describe('deleteReminder', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('deletes for correct id and userId', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 1 }]);
    await deleteReminder(pool, TEST_USER_ID, TEST_REMINDER_ID);
    expect(pool.queryCalls[0].params).toEqual([TEST_REMINDER_ID, TEST_USER_ID]);
  });
});

// ---------------------------------------------------------------------------
// getRemindersOverdueOrToday
// ---------------------------------------------------------------------------

describe('getRemindersOverdueOrToday', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('queries with due_at::date <= CURRENT_DATE and active/snoozed status', async () => {
    const pool = createMockPool([{ rows: [makeReminderWithCustomerRow()] }]);
    await getRemindersOverdueOrToday(pool, TEST_USER_ID);
    expect(pool.queryCalls[0].text).toContain('due_at::date <= CURRENT_DATE');
    expect(pool.queryCalls[0].text).toContain("status IN ('active', 'snoozed')");
  });

  test('filters out snoozed reminders where snoozed_until is in the future', async () => {
    const pool = createMockPool([{ rows: [] }]);
    await getRemindersOverdueOrToday(pool, TEST_USER_ID);
    expect(pool.queryCalls[0].text).toContain('snoozed_until < NOW()');
  });

  test('joins on agents.customers and returns customerName', async () => {
    const row = makeReminderWithCustomerRow({ customer_name: 'Bianchi SpA' });
    const pool = createMockPool([{ rows: [row] }]);
    const results = await getRemindersOverdueOrToday(pool, TEST_USER_ID);
    expect(results[0].customerName).toEqual('Bianchi SpA');
  });

  test('passes userId as only bound parameter', async () => {
    const pool = createMockPool([{ rows: [] }]);
    await getRemindersOverdueOrToday(pool, TEST_USER_ID);
    expect(pool.queryCalls[0].params).toEqual([TEST_USER_ID]);
  });
});

// ---------------------------------------------------------------------------
// getTodayReminders
// ---------------------------------------------------------------------------

describe('getTodayReminders', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('issues 4 separate queries', async () => {
    const pool = createMockPool([
      { rows: [] },
      { rows: [] },
      { rows: [{ count: 5 }] },
      { rows: [{ count: 2 }] },
    ]);

    await getTodayReminders(pool, TEST_USER_ID);
    expect(pool.queryCalls).toHaveLength(4);
  });

  test('overdue query uses due_at::date < CURRENT_DATE', async () => {
    const pool = createMockPool([
      { rows: [] },
      { rows: [] },
      { rows: [{ count: 0 }] },
      { rows: [{ count: 0 }] },
    ]);

    await getTodayReminders(pool, TEST_USER_ID);
    const overdueQuery = pool.queryCalls.find(c => c.text.includes('< CURRENT_DATE'));
    expect(overdueQuery).toBeDefined();
  });

  test('today query uses due_at::date = CURRENT_DATE', async () => {
    const pool = createMockPool([
      { rows: [] },
      { rows: [] },
      { rows: [{ count: 0 }] },
      { rows: [{ count: 0 }] },
    ]);

    await getTodayReminders(pool, TEST_USER_ID);
    const todayQuery = pool.queryCalls.find(c => c.text.includes('= CURRENT_DATE'));
    expect(todayQuery).toBeDefined();
  });

  test('returns totalActive and completedToday from count queries', async () => {
    const overdueRow = makeReminderWithCustomerRow();
    const todayRow = makeReminderWithCustomerRow({ id: 99 });
    const pool = createMockPool([
      { rows: [overdueRow] },
      { rows: [todayRow] },
      { rows: [{ count: 7 }] },
      { rows: [{ count: 3 }] },
    ]);

    const result = await getTodayReminders(pool, TEST_USER_ID);

    expect(result.totalActive).toEqual(7);
    expect(result.completedToday).toEqual(3);
    expect(result.overdue).toHaveLength(1);
    expect(result.today).toHaveLength(1);
  });
});

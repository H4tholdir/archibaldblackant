import { describe, expect, test, vi } from 'vitest';
import { checkCustomerInactivity, checkOverduePayments } from './notification-scheduler';
import type { NotificationServiceDeps } from '../services/notification-service';
import type { DbPool } from '../db/pool';

function makePool(rows: unknown[]): DbPool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as DbPool;
}

function makeDeps(pool: DbPool): NotificationServiceDeps {
  return {
    pool,
    getAllUsers: vi.fn(),
    insertNotification: vi.fn().mockResolvedValue({ id: 1, type: 'test', severity: 'info', title: '', body: '', data: null, createdAt: new Date(), expiresAt: new Date(), readAt: null }),
    broadcast: vi.fn(),
  };
}

describe('checkCustomerInactivity', () => {
  test('creates a warning notification for each inactive customer returned by the query', async () => {
    const customer = { customer_profile: 'CP001', user_id: 'U1', name: 'Mario Rossi', last_order_date: '2025-06-01' };
    const pool = makePool([customer]);
    const deps = makeDeps(pool);

    const count = await checkCustomerInactivity(pool, deps);

    expect(count).toBe(1);
    expect(deps.insertNotification).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        userId: 'U1',
        type: 'customer_inactive',
        severity: 'warning',
        data: expect.objectContaining({ customerProfile: 'CP001', customerName: 'Mario Rossi' }),
      }),
    );
    expect(deps.broadcast).toHaveBeenCalledWith('U1', expect.objectContaining({ type: 'NOTIFICATION_NEW' }));
  });

  test('creates one notification per inactive customer', async () => {
    const customers = [
      { customer_profile: 'CP001', user_id: 'U1', name: 'Mario Rossi', last_order_date: '2025-06-01' },
      { customer_profile: 'CP002', user_id: 'U2', name: 'Luigi Bianchi', last_order_date: '2025-05-15' },
    ];
    const pool = makePool(customers);
    const deps = makeDeps(pool);

    const count = await checkCustomerInactivity(pool, deps);

    expect(count).toBe(2);
    expect(deps.insertNotification).toHaveBeenCalledTimes(2);
  });

  test('returns 0 and sends no notifications when no inactive customers are found', async () => {
    const pool = makePool([]);
    const deps = makeDeps(pool);

    const count = await checkCustomerInactivity(pool, deps);

    expect(count).toBe(0);
    expect(deps.insertNotification).not.toHaveBeenCalled();
  });
});

describe('checkOverduePayments', () => {
  test('creates an error notification for each overdue order returned by the query', async () => {
    const order = {
      id: 'ORD001',
      user_id: 'U1',
      order_number: '26000752',
      customer_name: 'Dragonetti Lab',
      invoice_due_date: '2026-01-23',
      invoice_remaining_amount: '149.88',
      days_past_due: 62,
    };
    const pool = makePool([order]);
    const deps = makeDeps(pool);

    const count = await checkOverduePayments(pool, deps);

    expect(count).toBe(1);
    expect(deps.insertNotification).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        userId: 'U1',
        type: 'order_expiring',
        severity: 'error',
        data: expect.objectContaining({ orderId: 'ORD001', orderNumber: '26000752', daysPastDue: 62 }),
      }),
    );
    expect(deps.broadcast).toHaveBeenCalledWith('U1', expect.objectContaining({ type: 'NOTIFICATION_NEW' }));
  });

  test('creates one notification per overdue order', async () => {
    const orders = [
      { id: 'ORD001', user_id: 'U1', order_number: '26000886', customer_name: 'Salerno Giuseppe', invoice_due_date: '2026-02-28', invoice_remaining_amount: '160.01', days_past_due: 26 },
      { id: 'ORD002', user_id: 'U1', order_number: '26000879', customer_name: 'Studio Sorriso', invoice_due_date: '2026-02-28', invoice_remaining_amount: '500.00', days_past_due: 26 },
    ];
    const pool = makePool(orders);
    const deps = makeDeps(pool);

    const count = await checkOverduePayments(pool, deps);

    expect(count).toBe(2);
    expect(deps.insertNotification).toHaveBeenCalledTimes(2);
  });

  test('returns 0 and sends no notifications when no overdue orders are found', async () => {
    const pool = makePool([]);
    const deps = makeDeps(pool);

    const count = await checkOverduePayments(pool, deps);

    expect(count).toBe(0);
    expect(deps.insertNotification).not.toHaveBeenCalled();
  });
});

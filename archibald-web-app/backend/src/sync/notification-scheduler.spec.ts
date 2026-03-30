import { describe, expect, test, vi } from 'vitest';
import { checkCustomerInactivity, checkOverduePayments, checkBudgetMilestones, checkMissingOrderDocuments } from './notification-scheduler';
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
    const customer = { erp_id: 'CP001', user_id: 'U1', name: 'Mario Rossi', last_order_date: '2025-06-01' };
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
        data: expect.objectContaining({ erpId: 'CP001', customerName: 'Mario Rossi' }),
      }),
    );
    expect(deps.broadcast).toHaveBeenCalledWith('U1', expect.objectContaining({ type: 'NOTIFICATION_NEW' }));
  });

  test('creates one notification per inactive customer', async () => {
    const customers = [
      { erp_id: 'CP001', user_id: 'U1', name: 'Mario Rossi', last_order_date: '2025-06-01' },
      { erp_id: 'CP002', user_id: 'U2', name: 'Luigi Bianchi', last_order_date: '2025-05-15' },
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

describe('checkBudgetMilestones', () => {
  test('calls createNotification when currentBudget >= budget_threshold', async () => {
    const condition = { id: 1, user_id: 'U1', title: 'Obiettivo Primavera', reward_amount: 500, budget_threshold: 10000 };
    const budgetRow = { current_budget: 12000 };
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [condition] })
        .mockResolvedValueOnce({ rows: [budgetRow] }),
    } as unknown as DbPool;
    const deps = makeDeps(pool);
    const markAchieved = vi.fn().mockResolvedValue(null);

    const count = await checkBudgetMilestones(pool, deps, markAchieved);

    expect(count).toBe(1);
    expect(markAchieved).toHaveBeenCalledWith(pool, 1, 'U1');
    expect(deps.insertNotification).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        userId: 'U1',
        type: 'budget_milestone',
        severity: 'success',
        data: expect.objectContaining({ conditionId: 1, conditionTitle: 'Obiettivo Primavera', rewardAmount: 500 }),
      }),
    );
    expect(deps.broadcast).toHaveBeenCalledWith('U1', expect.objectContaining({ type: 'NOTIFICATION_NEW' }));
  });

  test('does NOT call createNotification when currentBudget < budget_threshold', async () => {
    const condition = { id: 2, user_id: 'U2', title: 'Obiettivo Estate', reward_amount: 300, budget_threshold: 20000 };
    const budgetRow = { current_budget: 5000 };
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [condition] })
        .mockResolvedValueOnce({ rows: [budgetRow] }),
    } as unknown as DbPool;
    const deps = makeDeps(pool);
    const markAchieved = vi.fn().mockResolvedValue(null);

    const count = await checkBudgetMilestones(pool, deps, markAchieved);

    expect(count).toBe(0);
    expect(markAchieved).not.toHaveBeenCalled();
    expect(deps.insertNotification).not.toHaveBeenCalled();
  });

  test('does NOT call anything when no unachieved budget conditions exist', async () => {
    const pool = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }),
    } as unknown as DbPool;
    const deps = makeDeps(pool);
    const markAchieved = vi.fn().mockResolvedValue(null);

    const count = await checkBudgetMilestones(pool, deps, markAchieved);

    expect(count).toBe(0);
    expect(markAchieved).not.toHaveBeenCalled();
    expect(deps.insertNotification).not.toHaveBeenCalled();
  });
});

describe('checkMissingOrderDocuments', () => {
  test('creates a "Spedizione senza DDT" warning when only DDT is missing', async () => {
    const row = {
      id: 'ORD001', user_id: 'U1', order_number: 'ORD/26004189',
      customer_name: 'An.Di. S.A.S.', current_state: 'spedito',
      missing_ddt: true, missing_invoice: false,
    };
    const pool = makePool([row]);
    const deps = makeDeps(pool);

    const count = await checkMissingOrderDocuments(pool, deps);

    expect(count).toBe(1);
    expect(deps.insertNotification).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        userId: 'U1',
        type: 'order_documents_missing',
        severity: 'warning',
        title: 'Spedizione senza DDT',
        data: expect.objectContaining({ orderId: 'ORD001', orderNumber: 'ORD/26004189', missing: ['ddt'] }),
      }),
    );
    expect(deps.broadcast).toHaveBeenCalledWith('U1', expect.objectContaining({ type: 'NOTIFICATION_NEW' }));
  });

  test('creates a "Fattura mancante" warning when only invoice is missing', async () => {
    const row = {
      id: 'ORD002', user_id: 'U1', order_number: 'ORD/26000412',
      customer_name: 'Gino Ambrosio', current_state: 'fatturato',
      missing_ddt: false, missing_invoice: true,
    };
    const pool = makePool([row]);
    const deps = makeDeps(pool);

    const count = await checkMissingOrderDocuments(pool, deps);

    expect(count).toBe(1);
    expect(deps.insertNotification).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        userId: 'U1',
        type: 'order_documents_missing',
        severity: 'warning',
        title: 'Fattura mancante',
        data: expect.objectContaining({ orderId: 'ORD002', missing: ['invoice'] }),
      }),
    );
  });

  test('creates a "DDT e fattura mancanti" warning when both are missing', async () => {
    const row = {
      id: 'ORD003', user_id: 'U2', order_number: 'ORD/26003001',
      customer_name: 'Studio Medico', current_state: 'fatturato',
      missing_ddt: true, missing_invoice: true,
    };
    const pool = makePool([row]);
    const deps = makeDeps(pool);

    const count = await checkMissingOrderDocuments(pool, deps);

    expect(count).toBe(1);
    expect(deps.insertNotification).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        title: 'DDT e fattura mancanti',
        data: expect.objectContaining({ missing: ['ddt', 'invoice'] }),
      }),
    );
  });

  test('creates one notification per anomalous order', async () => {
    const rows = [
      { id: 'ORD001', user_id: 'U1', order_number: 'ORD/26001001', customer_name: 'Cliente A', current_state: 'spedito', missing_ddt: true, missing_invoice: false },
      { id: 'ORD002', user_id: 'U1', order_number: 'ORD/26001002', customer_name: 'Cliente B', current_state: 'fatturato', missing_ddt: false, missing_invoice: true },
    ];
    const pool = makePool(rows);
    const deps = makeDeps(pool);

    const count = await checkMissingOrderDocuments(pool, deps);

    expect(count).toBe(2);
    expect(deps.insertNotification).toHaveBeenCalledTimes(2);
  });

  test('returns 0 and sends no notifications when no anomalous orders are found', async () => {
    const pool = makePool([]);
    const deps = makeDeps(pool);

    const count = await checkMissingOrderDocuments(pool, deps);

    expect(count).toBe(0);
    expect(deps.insertNotification).not.toHaveBeenCalled();
  });
});

import { describe, expect, test, vi } from 'vitest';
import { updateJobTracking, mapRowToPendingOrder } from './pending-orders';
import type { PendingOrderRow } from './pending-orders';

function createMockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn(),
  };
}

describe('mapRowToPendingOrder', () => {
  test('maps job_id and job_started_at from row to camelCase', () => {
    const row: PendingOrderRow = {
      id: 'po-1',
      user_id: 'user-1',
      customer_id: 'cust-1',
      customer_name: 'Test Customer',
      items_json: [],
      status: 'processing',
      discount_percent: null,
      target_total_with_vat: null,
      retry_count: 0,
      error_message: null,
      created_at: 1000,
      updated_at: 2000,
      device_id: 'dev-1',
      origin_draft_id: null,
      synced_to_archibald: false,
      shipping_cost: 0,
      shipping_tax: 0,
      sub_client_codice: null,
      sub_client_name: null,
      sub_client_data_json: null,
      archibald_order_id: null,
      no_shipping: false,
      notes: null,
      job_id: 'job-abc',
      job_started_at: '2026-03-10T10:00:00Z',
    };

    const result = mapRowToPendingOrder(row);

    expect(result.jobId).toBe('job-abc');
    expect(result.jobStartedAt).toBe('2026-03-10T10:00:00Z');
  });

  test('maps null job tracking fields', () => {
    const row: PendingOrderRow = {
      id: 'po-2',
      user_id: 'user-1',
      customer_id: 'cust-1',
      customer_name: 'Test Customer',
      items_json: [],
      status: 'pending',
      discount_percent: null,
      target_total_with_vat: null,
      retry_count: 0,
      error_message: null,
      created_at: 1000,
      updated_at: 2000,
      device_id: 'dev-1',
      origin_draft_id: null,
      synced_to_archibald: false,
      shipping_cost: 0,
      shipping_tax: 0,
      sub_client_codice: null,
      sub_client_name: null,
      sub_client_data_json: null,
      archibald_order_id: null,
      no_shipping: false,
      notes: null,
      job_id: null,
      job_started_at: null,
    };

    const result = mapRowToPendingOrder(row);

    expect(result.jobId).toBeNull();
    expect(result.jobStartedAt).toBeNull();
  });
});

describe('updateJobTracking', () => {
  test('executes UPDATE with correct SQL and parameters', async () => {
    const mockPool = createMockPool();
    const pendingOrderId = 'po-123';
    const jobId = 'job-456';
    const beforeCall = Date.now();

    await updateJobTracking(mockPool, pendingOrderId, jobId);

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain('UPDATE agents.pending_orders');
    expect(sql).toContain("status = 'processing'");
    expect(sql).toContain('job_id = $1');
    expect(sql).toContain('job_started_at = NOW()');
    expect(sql).toContain('WHERE id = $3');
    expect(params[0]).toBe(jobId);
    expect(params[1]).toBeGreaterThanOrEqual(beforeCall);
    expect(params[1]).toBeLessThanOrEqual(Date.now());
    expect(params[2]).toBe(pendingOrderId);
  });
});

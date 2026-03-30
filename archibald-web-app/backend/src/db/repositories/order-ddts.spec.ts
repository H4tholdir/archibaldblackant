import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../pool';
import {
  upsertOrderDdt,
  repositionOrderDdts,
  getDdtsForOrder,
  getDdtsNeedingTracking,
  updateDdtTracking,
  incrementDdtTrackingFailures,
  computeAndUpdateOrderDeliveryState,
  type OrderDdtInput,
} from './order-ddts';

function createMockPool(queryResults: Array<{ rows: unknown[]; rowCount?: number }> = []): DbPool {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;
      return Promise.resolve(result);
    }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const baseDdtInput: OrderDdtInput = {
  orderId: 'ord-1',
  userId: 'user-1',
  ddtNumber: 'DDT/26001',
  ddtId: '12345',
  ddtDeliveryDate: '3/28/2026',
  ddtCustomerAccount: 'CUST001',
  ddtSalesName: 'Test Sales',
  ddtDeliveryName: 'Test Delivery',
  deliveryTerms: 'FOB',
  deliveryMethod: 'Ground',
  deliveryCity: 'Naples',
  attentionTo: 'Mario',
  ddtDeliveryAddress: 'Via Roma 1',
  ddtQuantity: '10',
  ddtCustomerReference: 'REF001',
  ddtDescription: 'Test shipment',
  trackingNumber: '445291890750',
  trackingUrl: null,
  trackingCourier: 'FEDEX',
};

describe('upsertOrderDdt', () => {
  test('returns "inserted" when xmax = 0 (new row)', async () => {
    const pool = createMockPool([{ rows: [{ is_insert: true }], rowCount: 1 }]);
    const result = await upsertOrderDdt(pool, baseDdtInput);
    expect(result).toBe('inserted');
    expect(pool.query).toHaveBeenCalledOnce();
  });

  test('returns "updated" when xmax != 0 (existing row)', async () => {
    const pool = createMockPool([{ rows: [{ is_insert: false }], rowCount: 1 }]);
    const result = await upsertOrderDdt(pool, baseDdtInput);
    expect(result).toBe('updated');
  });
});

describe('repositionOrderDdts', () => {
  test('executes reposition query with userId', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 3 }]);
    await repositionOrderDdts(pool, 'user-1');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ROW_NUMBER()'),
      ['user-1'],
    );
  });

  test('strips dot thousand-separators from ddt_id before bigint cast', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 3 }]);
    await repositionOrderDdts(pool, 'user-1');
    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain("REPLACE(ddt_id, '.', '')");
  });
});

describe('getDdtsForOrder', () => {
  test('returns DDTs sorted by position', async () => {
    const mockRows = [
      { id: 'ddt-1', order_id: 'ord-1', user_id: 'user-1', position: 0, ddt_number: 'DDT/001', ddt_id: '100',
        ddt_delivery_date: null, ddt_customer_account: null, ddt_sales_name: null, ddt_delivery_name: null,
        delivery_terms: null, delivery_method: null, delivery_city: null, attention_to: null,
        ddt_delivery_address: null, ddt_quantity: null, ddt_customer_reference: null, ddt_description: null,
        tracking_number: null, tracking_url: null, tracking_courier: null, tracking_status: null,
        tracking_key_status_cd: null, tracking_status_bar_cd: null, tracking_estimated_delivery: null,
        tracking_last_location: null, tracking_last_event: null, tracking_last_event_at: null,
        tracking_origin: null, tracking_destination: null, tracking_service_desc: null,
        tracking_last_synced_at: null, tracking_sync_failures: null, tracking_events: null,
        tracking_delay_reason: null, tracking_delivery_attempts: null, tracking_attempted_delivery_at: null,
        delivery_confirmed_at: null, delivery_signed_by: null },
      { id: 'ddt-2', order_id: 'ord-1', user_id: 'user-1', position: 1, ddt_number: 'DDT/002', ddt_id: '200',
        ddt_delivery_date: null, ddt_customer_account: null, ddt_sales_name: null, ddt_delivery_name: null,
        delivery_terms: null, delivery_method: null, delivery_city: null, attention_to: null,
        ddt_delivery_address: null, ddt_quantity: null, ddt_customer_reference: null, ddt_description: null,
        tracking_number: null, tracking_url: null, tracking_courier: null, tracking_status: null,
        tracking_key_status_cd: null, tracking_status_bar_cd: null, tracking_estimated_delivery: null,
        tracking_last_location: null, tracking_last_event: null, tracking_last_event_at: null,
        tracking_origin: null, tracking_destination: null, tracking_service_desc: null,
        tracking_last_synced_at: null, tracking_sync_failures: null, tracking_events: null,
        tracking_delay_reason: null, tracking_delivery_attempts: null, tracking_attempted_delivery_at: null,
        delivery_confirmed_at: null, delivery_signed_by: null },
    ];
    const pool = createMockPool([{ rows: mockRows }]);
    const result = await getDdtsForOrder(pool, 'user-1', 'ord-1');
    expect(result).toHaveLength(2);
    expect(result[0].ddtNumber).toBe('DDT/001');
    expect(result[1].ddtNumber).toBe('DDT/002');
  });
});

describe('getDdtsNeedingTracking', () => {
  test('returns DDTs with tracking_number set and not yet delivered', async () => {
    const mockRows = [
      { id: 'ddt-1', order_id: 'ord-1', order_number: 'ORD/001', tracking_number: 'TRK111' },
    ];
    const pool = createMockPool([{ rows: mockRows }]);
    const result = await getDdtsNeedingTracking(pool, 'user-1');
    expect(result).toEqual([{
      ddtId: 'ddt-1',
      orderId: 'ord-1',
      orderNumber: 'ORD/001',
      trackingNumber: 'TRK111',
    }]);
  });
});

describe('updateDdtTracking', () => {
  test('updates tracking fields on the DDT row', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 1 }]);
    await updateDdtTracking(pool, 'ddt-1', {
      trackingStatus: 'in_transit',
      trackingKeyStatusCd: 'IT',
      trackingStatusBarCd: 'OW',
      trackingEstimatedDelivery: '2026-03-30',
      trackingLastLocation: 'Milan, IT',
      trackingLastEvent: 'In transit',
      trackingLastEventAt: '2026-03-29 10:00',
      trackingOrigin: 'Verona, IT',
      trackingDestination: 'Naples, IT',
      trackingServiceDesc: 'FedEx Priority',
      deliveryConfirmedAt: null,
      deliverySignedBy: null,
      trackingEvents: [],
      trackingSyncFailures: 0,
      trackingDelayReason: null,
      trackingDeliveryAttempts: null,
      trackingAttemptedDeliveryAt: null,
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('tracking_status'),
      expect.arrayContaining(['ddt-1', 'in_transit']),
    );
  });
});

describe('incrementDdtTrackingFailures', () => {
  test('increments failure counter on DDT', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 1 }]);
    await incrementDdtTrackingFailures(pool, 'ddt-1');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('tracking_sync_failures'),
      ['ddt-1'],
    );
  });
});

describe('computeAndUpdateOrderDeliveryState', () => {
  test('sets consegnato when all DDTs delivered', async () => {
    const pool = createMockPool([
      { rows: [{ total: '2', delivered: '2' }] },
      { rows: [], rowCount: 1 },
    ]);
    await computeAndUpdateOrderDeliveryState(pool, 'ord-1');
    expect(pool.query).toHaveBeenCalledTimes(2);
    const updateCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(updateCall[1]).toContain('consegnato');
  });

  test('sets parzialmente_consegnato when some DDTs delivered', async () => {
    const pool = createMockPool([
      { rows: [{ total: '3', delivered: '1' }] },
      { rows: [], rowCount: 1 },
    ]);
    await computeAndUpdateOrderDeliveryState(pool, 'ord-1');
    const updateCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(updateCall[1]).toContain('parzialmente_consegnato');
  });

  test('does nothing when no DDTs exist', async () => {
    const pool = createMockPool([{ rows: [{ total: '0', delivered: '0' }] }]);
    await computeAndUpdateOrderDeliveryState(pool, 'ord-1');
    expect(pool.query).toHaveBeenCalledOnce();
  });

  test('does nothing when zero delivered', async () => {
    const pool = createMockPool([{ rows: [{ total: '2', delivered: '0' }] }]);
    await computeAndUpdateOrderDeliveryState(pool, 'ord-1');
    expect(pool.query).toHaveBeenCalledOnce();
  });
});

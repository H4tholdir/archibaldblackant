import { describe, it, expect, vi } from 'vitest';
import type { DbPool } from '../pool';
import type { FullHistoryOrder } from '../../types/full-history';

function makePool(ordersRows: unknown[] = [], fresisRows: unknown[] = []) {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: ordersRows })
      .mockResolvedValueOnce({ rows: fresisRows }),
  } as unknown as DbPool;
}

const { getCustomerFullHistory } = await import('./customer-full-history.repository');

const ORDER_ROW = {
  order_id: 'ord-1',
  order_number: 'FT 247',
  order_date: '2024-02-23T00:00:00.000Z',
  customer_profile_id: 'C10181',
  customer_city: 'Roma',
  customer_rag_sociale: 'Mario Srl',
  article_code: '661.314.420',
  article_description: 'ABRASIVO ARKANSAS',
  quantity: 10,
  unit_price: 7.29,
  discount_percent: 50,
  vat_percent: 22,
  line_total_with_vat: 44.47,
};

const FRESIS_ROW = {
  id: 'fh-1',
  archibald_order_id: null,
  archibald_order_number: 'KT-2024-081',
  invoice_number: null,
  discount_percent: null,
  target_total_with_vat: null,
  created_at: '2024-07-15T00:00:00.000Z',
  items: JSON.stringify([
    {
      articleCode: 'SFM7.000.1',
      description: 'PUNTA SONICA',
      quantity: 2,
      price: 149.18,
      discount: 0,
      vat: 22,
    },
  ]),
};

describe('getCustomerFullHistory', () => {
  it('returns [] when all params are empty', async () => {
    const pool = { query: vi.fn() } as unknown as DbPool;
    const result = await getCustomerFullHistory(pool, 'user-1', {});
    expect(result).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns [] for empty subClientCodices array without error', async () => {
    const pool = makePool([], []);
    const result = await getCustomerFullHistory(pool, 'user-1', { subClientCodices: [] });
    expect(result).toEqual([]);
  });

  it('returns orders from order_records when customerErpIds provided', async () => {
    const pool = makePool([ORDER_ROW], []);

    const result = await getCustomerFullHistory(pool, 'user-1', {
      customerErpIds: ['C10181'],
    });

    const expected: FullHistoryOrder[] = [
      {
        source: 'orders',
        orderId: 'ord-1',
        orderNumber: 'FT 247',
        orderDate: '2024-02-23T00:00:00.000Z',
        totalAmount: 44.47,
        orderDiscountPercent: 0,
        customerErpId: 'C10181',
        customerCity: 'Roma',
        customerRagioneSociale: 'Mario Srl',
        articles: [
          {
            articleCode: '661.314.420',
            articleDescription: 'ABRASIVO ARKANSAS',
            quantity: 10,
            unitPrice: 7.29,
            discountPercent: 50,
            vatPercent: 22,
            lineTotalWithVat: 44.47,
          },
        ],
      },
    ];
    expect(result).toEqual(expected);
  });

  it('returns fresis orders when subClientCodices provided', async () => {
    // When only subClientCodices is given, hasCustomerSearch=false so the orders
    // branch never calls pool.query. The fresis branch is the only pool.query call.
    const pool = {
      query: vi.fn().mockResolvedValueOnce({ rows: [FRESIS_ROW] }),
    } as unknown as DbPool;

    const result = await getCustomerFullHistory(pool, 'user-1', {
      subClientCodices: ['C00042'],
    });

    // lineTotalWithVat = round2(2 * 149.18 * (1 - 0/100) * (1 + 22/100))
    //                  = round2(363.9992) = 364
    expect(result).toEqual([
      {
        source: 'fresis',
        orderId: 'fh-1',
        orderNumber: 'KT-2024-081',
        orderDate: '2024-07-15T00:00:00.000Z',
        totalAmount: 364,
        orderDiscountPercent: 0,
        articles: [
          {
            articleCode: 'SFM7.000.1',
            articleDescription: 'PUNTA SONICA',
            quantity: 2,
            unitPrice: 149.18,
            discountPercent: 0,
            vatPercent: 22,
            lineTotalWithVat: 364,
          },
        ],
      },
    ]);
  });

  it('merges and sorts by date descending when both params provided', async () => {
    const pool = makePool([ORDER_ROW], [FRESIS_ROW]);

    const result = await getCustomerFullHistory(pool, 'user-1', {
      customerErpIds: ['C10181'],
      subClientCodices: ['C00042'],
    });

    expect(result[0].source).toBe('fresis');  // più recente: 2024-07-15
    expect(result[1].source).toBe('orders');  // più vecchio: 2024-02-23
  });

  it('aggregates orders from multiple customerErpIds', async () => {
    const twoOrderRows = [
      {
        order_id: 'ord-1', order_number: 'FT 100', order_date: '2024-01-01',
        customer_profile_id: 'C001', customer_city: 'Roma', customer_rag_sociale: 'Mario Srl',
        article_code: 'ART001', article_description: 'Desc', quantity: 2,
        unit_price: 10, discount_percent: 0, vat_percent: 22, line_total_with_vat: 24.4,
      },
      {
        order_id: 'ord-2', order_number: 'FT 200', order_date: '2024-01-02',
        customer_profile_id: 'C002', customer_city: 'Milano', customer_rag_sociale: 'Luigi Srl',
        article_code: 'ART002', article_description: 'Desc2', quantity: 1,
        unit_price: 5, discount_percent: 0, vat_percent: 22, line_total_with_vat: 6.1,
      },
    ];
    const pool = makePool(twoOrderRows, []);
    const result = await getCustomerFullHistory(pool, 'user-1', { customerErpIds: ['C001', 'C002'] });
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.orderId)).toEqual(expect.arrayContaining(['ord-1', 'ord-2']));
  });

  it('populates customerCity from JOIN result', async () => {
    const rows = [{
      order_id: 'ord-1', order_number: 'FT 100', order_date: '2024-01-01',
      customer_profile_id: 'C001', customer_city: 'Napoli', customer_rag_sociale: 'Test Srl',
      article_code: 'ART001', article_description: 'Test', quantity: 1,
      unit_price: 10, discount_percent: 0, vat_percent: 22, line_total_with_vat: 12.2,
    }];
    const pool = makePool(rows, []);
    const result = await getCustomerFullHistory(pool, 'user-1', { customerErpIds: ['C001'] });
    expect(result[0].customerCity).toBe('Napoli');
    expect(result[0].customerRagioneSociale).toBe('Test Srl');
  });

  it('SQL query contains articles_synced_at IS NOT NULL filter', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as DbPool;

    await getCustomerFullHistory(pool, 'user-1', { customerErpIds: ['C10181'] });

    const sql: string = query.mock.calls[0][0];
    expect(sql).toContain('articles_synced_at IS NOT NULL');
  });

  it('SQL query contains NOT EXISTS to exclude NC orders', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as DbPool;

    await getCustomerFullHistory(pool, 'user-1', { customerErpIds: ['C10181'] });

    const sql: string = query.mock.calls[0][0];
    expect(sql).toContain('NOT EXISTS');
  });
});

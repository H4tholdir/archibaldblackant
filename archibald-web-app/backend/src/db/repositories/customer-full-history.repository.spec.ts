import { describe, it, expect, vi, type Mock } from 'vitest';
import { getCustomerFullHistory } from './customer-full-history.repository';
import type { DbPool } from '../pool';
import type { FullHistoryOrder } from '../../types/full-history';

function makePool(queryFn: Mock): DbPool {
  return { query: queryFn } as unknown as DbPool;
}

const ORDER_ROW = {
  order_id: 'ord-1',
  order_number: 'FT 247',
  order_date: '2024-02-23T00:00:00.000Z',
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
  it('returns empty array when no params provided', async () => {
    const query = vi.fn();
    const pool = makePool(query);
    const result = await getCustomerFullHistory(pool, 'user-1', {});
    expect(result).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns orders from order_records when customerProfileId provided', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [ORDER_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = makePool(query);

    const result = await getCustomerFullHistory(pool, 'user-1', {
      customerProfileId: 'C10181',
    });

    const expected: FullHistoryOrder[] = [
      {
        source: 'orders',
        orderId: 'ord-1',
        orderNumber: 'FT 247',
        orderDate: '2024-02-23T00:00:00.000Z',
        totalAmount: 44.47,
        orderDiscountPercent: 0,
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

  it('returns fresis orders when subClientCodice provided', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [FRESIS_ROW] });
    const pool = makePool(query);

    const result = await getCustomerFullHistory(pool, 'user-1', {
      subClientCodice: 'C00042',
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
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [ORDER_ROW] })  // order: 2024-02-23
      .mockResolvedValueOnce({ rows: [FRESIS_ROW] }); // fresis: 2024-07-15
    const pool = makePool(query);

    const result = await getCustomerFullHistory(pool, 'user-1', {
      customerProfileId: 'C10181',
      subClientCodice: 'C00042',
    });

    expect(result[0].source).toBe('fresis');   // più recente
    expect(result[1].source).toBe('orders');   // più vecchio
  });

  it('SQL query contains articles_synced_at IS NOT NULL filter', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = makePool(query);

    await getCustomerFullHistory(pool, 'user-1', { customerProfileId: 'C10181' });

    const sql: string = query.mock.calls[0][0];
    expect(sql).toContain('articles_synced_at IS NOT NULL');
  });

  it('SQL query contains NOT EXISTS to exclude NC orders', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = makePool(query);

    await getCustomerFullHistory(pool, 'user-1', { customerProfileId: 'C10181' });

    const sql: string = query.mock.calls[0][0];
    expect(sql).toContain('NOT EXISTS');
  });
});

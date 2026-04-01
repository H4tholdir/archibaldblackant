import { describe, expect, test } from 'vitest';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
import { aggregateTopSold } from './aggregate-top-sold';

const makeOrder = (articles: Array<{ articleCode: string; articleDescription: string; quantity: number }>): CustomerFullHistoryOrder => ({
  source: 'orders',
  orderId: 'o1',
  orderNumber: '001',
  orderDate: '2026-01-01',
  totalAmount: 0,
  orderDiscountPercent: 0,
  articles: articles.map(a => ({
    ...a,
    unitPrice: 0,
    discountPercent: 0,
    vatPercent: 22,
    lineAmount: 0,
    lineTotalWithVat: 0,
  })),
});

describe('aggregateTopSold', () => {
  test('returns empty array for empty orders', () => {
    expect(aggregateTopSold([])).toEqual([]);
  });

  test('returns empty array for orders with no articles', () => {
    expect(aggregateTopSold([makeOrder([])])).toEqual([]);
  });

  test('aggregates quantity for same articleCode across multiple orders', () => {
    const orders = [
      makeOrder([{ articleCode: 'A001', articleDescription: 'Articolo A', quantity: 3 }]),
      makeOrder([{ articleCode: 'A001', articleDescription: 'Articolo A', quantity: 5 }]),
    ];
    expect(aggregateTopSold(orders)).toEqual([
      { articleCode: 'A001', productName: 'Articolo A', totalQuantity: 8 },
    ]);
  });

  test('aggregates quantity for same articleCode across multiple clients in same order', () => {
    const order = makeOrder([
      { articleCode: 'B002', articleDescription: 'Articolo B', quantity: 2 },
      { articleCode: 'B002', articleDescription: 'Articolo B', quantity: 4 },
    ]);
    expect(aggregateTopSold([order])).toEqual([
      { articleCode: 'B002', productName: 'Articolo B', totalQuantity: 6 },
    ]);
  });

  test('sorts by totalQuantity descending', () => {
    const orders = [
      makeOrder([
        { articleCode: 'LOW', articleDescription: 'Poco', quantity: 1 },
        { articleCode: 'HIGH', articleDescription: 'Molto', quantity: 10 },
        { articleCode: 'MID', articleDescription: 'Medio', quantity: 5 },
      ]),
    ];
    const result = aggregateTopSold(orders);
    expect(result.map(r => r.articleCode)).toEqual(['HIGH', 'MID', 'LOW']);
  });

  test('article present in only one client is not lost', () => {
    const orders = [
      makeOrder([{ articleCode: 'SOLO', articleDescription: 'Solo', quantity: 7 }]),
      makeOrder([{ articleCode: 'OTHER', articleDescription: 'Other', quantity: 2 }]),
    ];
    const codes = aggregateTopSold(orders).map(r => r.articleCode);
    expect(codes).toContain('SOLO');
    expect(codes).toContain('OTHER');
  });

  test('no overlap: each article appears once with its own quantity', () => {
    const orders = [
      makeOrder([
        { articleCode: 'X1', articleDescription: 'X1', quantity: 3 },
        { articleCode: 'X2', articleDescription: 'X2', quantity: 3 },
      ]),
    ];
    const result = aggregateTopSold(orders);
    const byCode = [...result].sort((a, b) => a.articleCode.localeCompare(b.articleCode));
    expect(byCode).toEqual([
      { articleCode: 'X1', productName: 'X1', totalQuantity: 3 },
      { articleCode: 'X2', productName: 'X2', totalQuantity: 3 },
    ]);
  });

  test('collision on productName: uses first description found', () => {
    const orders = [
      makeOrder([{ articleCode: 'DUP', articleDescription: 'Prima descrizione', quantity: 1 }]),
      makeOrder([{ articleCode: 'DUP', articleDescription: 'Seconda descrizione', quantity: 1 }]),
    ];
    expect(aggregateTopSold(orders)).toEqual([
      { articleCode: 'DUP', productName: 'Prima descrizione', totalQuantity: 2 },
    ]);
  });
});

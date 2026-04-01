import { describe, expect, test } from 'vitest';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
import { findLastPurchase } from './find-last-purchase';

const makeOrder = (
  orderId: string,
  orderDate: string,
  articleCode: string,
  overrides: Partial<{
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    vatPercent: number;
    lineAmount: number;
    lineTotalWithVat: number;
  }> = {},
): CustomerFullHistoryOrder => ({
  source: 'orders',
  orderId,
  orderNumber: orderId,
  orderDate,
  totalAmount: 100,
  orderDiscountPercent: 0,
  articles: [{
    articleCode,
    articleDescription: 'Test Article',
    quantity:         overrides.quantity         ?? 1,
    unitPrice:        overrides.unitPrice        ?? 100,
    discountPercent:  overrides.discountPercent  ?? 0,
    vatPercent:       overrides.vatPercent       ?? 22,
    lineAmount:       overrides.lineAmount       ?? 100,
    lineTotalWithVat: overrides.lineTotalWithVat ?? 122,
  }],
});

describe('findLastPurchase', () => {
  test('returns null for empty orders array', () => {
    expect(findLastPurchase([], 'ART-001')).toBeNull();
  });

  test('returns null when article not found in any order', () => {
    const orders = [makeOrder('o1', '2026-01-01', 'ART-999')];
    expect(findLastPurchase(orders, 'ART-001')).toBeNull();
  });

  test('returns article data and order metadata for a matching order', () => {
    const orders = [
      makeOrder('o1', '2026-01-01', 'ART-001', {
        unitPrice: 87.21,
        discountPercent: 29.51,
        lineAmount: 61.48,
        lineTotalWithVat: 75.01,
      }),
    ];
    expect(findLastPurchase(orders, 'ART-001')).toEqual({
      article: {
        articleCode: 'ART-001',
        articleDescription: 'Test Article',
        quantity: 1,
        unitPrice: 87.21,
        discountPercent: 29.51,
        vatPercent: 22,
        lineAmount: 61.48,
        lineTotalWithVat: 75.01,
      },
      orderDate: '2026-01-01',
      orderNumber: 'o1',
    });
  });

  test('returns the first match (most recent, array sorted DESC by caller)', () => {
    const newerOrder = makeOrder('new', '2026-03-01', 'ART-001', { unitPrice: 87.21 });
    const olderOrder = makeOrder('old', '2025-06-01', 'ART-001', { unitPrice: 80.00 });
    const result = findLastPurchase([newerOrder, olderOrder], 'ART-001');
    expect(result?.article.unitPrice).toBe(87.21);
    expect(result?.orderNumber).toBe('new');
  });

  test('skips orders that do not contain the article and finds the correct one', () => {
    const withoutArt = makeOrder('o1', '2026-01-01', 'ART-999');
    const withArt    = makeOrder('o2', '2025-12-01', 'ART-001', { unitPrice: 42 });
    expect(findLastPurchase([withoutArt, withArt], 'ART-001')).toMatchObject({
      orderNumber: 'o2',
      article: expect.objectContaining({ unitPrice: 42 }),
    });
  });

  test('returns null when all orders have only NC (negative totalAmount) — already excluded by caller', () => {
    expect(findLastPurchase([], 'ART-001')).toBeNull();
  });
});

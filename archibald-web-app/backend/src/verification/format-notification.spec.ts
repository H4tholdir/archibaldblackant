import { describe, expect, test } from 'vitest';
import type { VerificationStatus } from '../db/repositories/order-verification';
import type { ArticleMismatch, MismatchType } from './verify-order-articles';
import { formatVerificationNotification } from './format-notification';

function makeMismatch(overrides: Partial<ArticleMismatch> & { type: MismatchType }): ArticleMismatch {
  return {
    snapshotArticleCode: 'ART-001',
    syncedArticleCode: 'ART-001',
    field: null,
    expected: null,
    found: null,
    ...overrides,
  };
}

describe('formatVerificationNotification', () => {
  const nullStatuses: VerificationStatus[] = ['verified', 'auto_corrected', 'pending_verification'];

  test.each(nullStatuses)('returns null for status "%s"', (status) => {
    const result = formatVerificationNotification(status, []);
    expect(result).toBeNull();
  });

  test('returns notification with severity "warning" for mismatch_detected', () => {
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'missing', snapshotArticleCode: 'ART-100', syncedArticleCode: null }),
    ];
    const result = formatVerificationNotification('mismatch_detected', mismatches);
    expect(result).toEqual({
      status: 'mismatch_detected',
      summary: '1 discrepanza rilevata nell\'ordine',
      severity: 'warning',
      items: [
        {
          articleCode: 'ART-100',
          message: 'Articolo mancante nell\'ordine Archibald',
          type: 'missing',
          expected: null,
          found: null,
        },
      ],
    });
  });

  test('returns notification with severity "error" for correction_failed', () => {
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'quantity_diff', field: 'quantity', expected: 5, found: 3 }),
    ];
    const result = formatVerificationNotification('correction_failed', mismatches);
    expect(result).toEqual({
      status: 'correction_failed',
      summary: '1 discrepanza rilevata nell\'ordine',
      severity: 'error',
      items: [
        {
          articleCode: 'ART-001',
          message: 'Quantità diversa: atteso 5, trovato 3',
          type: 'quantity_diff',
          expected: 5,
          found: 3,
        },
      ],
    });
  });

  test('formats missing article mismatch', () => {
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'missing', snapshotArticleCode: 'ART-200', syncedArticleCode: null }),
    ];
    const result = formatVerificationNotification('mismatch_detected', mismatches);
    expect(result!.items[0]).toEqual({
      articleCode: 'ART-200',
      message: 'Articolo mancante nell\'ordine Archibald',
      type: 'missing',
      expected: null,
      found: null,
    });
  });

  test('formats extra article mismatch', () => {
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'extra', snapshotArticleCode: null, syncedArticleCode: 'ART-300' }),
    ];
    const result = formatVerificationNotification('mismatch_detected', mismatches);
    expect(result!.items[0]).toEqual({
      articleCode: 'ART-300',
      message: 'Articolo extra non previsto nell\'ordine',
      type: 'extra',
      expected: null,
      found: null,
    });
  });

  test('formats quantity_diff mismatch', () => {
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'quantity_diff', field: 'quantity', expected: 10, found: 7 }),
    ];
    const result = formatVerificationNotification('mismatch_detected', mismatches);
    expect(result!.items[0]).toEqual({
      articleCode: 'ART-001',
      message: 'Quantità diversa: atteso 10, trovato 7',
      type: 'quantity_diff',
      expected: 10,
      found: 7,
    });
  });

  test('formats price_diff mismatch with 2 decimal currency', () => {
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'price_diff', field: 'unitPrice', expected: 12.50, found: 15.00 }),
    ];
    const result = formatVerificationNotification('mismatch_detected', mismatches);
    expect(result!.items[0]).toEqual({
      articleCode: 'ART-001',
      message: 'Prezzo unitario diverso: atteso 12.50 €, trovato 15.00 €',
      type: 'price_diff',
      expected: 12.50,
      found: 15.00,
    });
  });

  test('formats discount_diff mismatch with percentage', () => {
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'discount_diff', field: 'discountPercent', expected: 20, found: 15 }),
    ];
    const result = formatVerificationNotification('mismatch_detected', mismatches);
    expect(result!.items[0]).toEqual({
      articleCode: 'ART-001',
      message: 'Sconto diverso: atteso 20%, trovato 15%',
      type: 'discount_diff',
      expected: 20,
      found: 15,
    });
  });

  test('formats amount_diff mismatch with 2 decimal currency', () => {
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'amount_diff', field: 'lineAmount', expected: 100.25, found: 98.50 }),
    ];
    const result = formatVerificationNotification('mismatch_detected', mismatches);
    expect(result!.items[0]).toEqual({
      articleCode: 'ART-001',
      message: 'Importo diverso: atteso 100.25 €, trovato 98.50 €',
      type: 'amount_diff',
      expected: 100.25,
      found: 98.50,
    });
  });

  test('handles multiple mismatches on same article as separate items', () => {
    const articleCode = 'ART-500';
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'quantity_diff', snapshotArticleCode: articleCode, syncedArticleCode: articleCode, field: 'quantity', expected: 5, found: 3 }),
      makeMismatch({ type: 'price_diff', snapshotArticleCode: articleCode, syncedArticleCode: articleCode, field: 'unitPrice', expected: 10.00, found: 12.00 }),
    ];
    const result = formatVerificationNotification('mismatch_detected', mismatches);
    expect(result!.items).toEqual([
      {
        articleCode: 'ART-500',
        message: 'Quantità diversa: atteso 5, trovato 3',
        type: 'quantity_diff',
        expected: 5,
        found: 3,
      },
      {
        articleCode: 'ART-500',
        message: 'Prezzo unitario diverso: atteso 10.00 €, trovato 12.00 €',
        type: 'price_diff',
        expected: 10.00,
        found: 12.00,
      },
    ]);
  });

  test('uses plural summary for multiple mismatches', () => {
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'missing', snapshotArticleCode: 'ART-A', syncedArticleCode: null }),
      makeMismatch({ type: 'extra', snapshotArticleCode: null, syncedArticleCode: 'ART-B' }),
      makeMismatch({ type: 'quantity_diff', field: 'quantity', expected: 2, found: 4 }),
    ];
    const result = formatVerificationNotification('correction_failed', mismatches);
    expect(result!.summary).toEqual('3 discrepanze rilevate nell\'ordine');
    expect(result!.items).toHaveLength(3);
  });

  test('returns notification with empty items for mismatch_detected with no mismatches', () => {
    const result = formatVerificationNotification('mismatch_detected', []);
    expect(result).toEqual({
      status: 'mismatch_detected',
      summary: 'Discrepanze rilevate',
      severity: 'warning',
      items: [],
    });
  });

  test('returns notification with empty items for correction_failed with no mismatches', () => {
    const result = formatVerificationNotification('correction_failed', []);
    expect(result).toEqual({
      status: 'correction_failed',
      summary: 'Discrepanze rilevate',
      severity: 'error',
      items: [],
    });
  });

  test('handles mixed mismatches in correction_failed', () => {
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'missing', snapshotArticleCode: 'ART-X', syncedArticleCode: null }),
      makeMismatch({ type: 'discount_diff', snapshotArticleCode: 'ART-Y', syncedArticleCode: 'ART-Y', field: 'discountPercent', expected: 30, found: 25 }),
      makeMismatch({ type: 'amount_diff', snapshotArticleCode: 'ART-Z', syncedArticleCode: 'ART-Z', field: 'lineAmount', expected: 50.00, found: 47.50 }),
    ];
    const result = formatVerificationNotification('correction_failed', mismatches);
    expect(result).toEqual({
      status: 'correction_failed',
      summary: '3 discrepanze rilevate nell\'ordine',
      severity: 'error',
      items: [
        {
          articleCode: 'ART-X',
          message: 'Articolo mancante nell\'ordine Archibald',
          type: 'missing',
          expected: null,
          found: null,
        },
        {
          articleCode: 'ART-Y',
          message: 'Sconto diverso: atteso 30%, trovato 25%',
          type: 'discount_diff',
          expected: 30,
          found: 25,
        },
        {
          articleCode: 'ART-Z',
          message: 'Importo diverso: atteso 50.00 €, trovato 47.50 €',
          type: 'amount_diff',
          expected: 50.00,
          found: 47.50,
        },
      ],
    });
  });
});

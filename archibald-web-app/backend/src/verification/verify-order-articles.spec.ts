import { describe, expect, test } from 'vitest';
import {
  verifyOrderArticles,
  type SnapshotArticle,
  type SyncedArticle,
} from './verify-order-articles';

function makeSnapshotArticle(overrides: Partial<SnapshotArticle> = {}): SnapshotArticle {
  return {
    articleCode: 'ART-001',
    quantity: 10,
    unitPrice: 5.0,
    lineDiscountPercent: null,
    expectedLineAmount: 50.0,
    ...overrides,
  };
}

function makeSyncedArticle(overrides: Partial<SyncedArticle> = {}): SyncedArticle {
  return {
    articleCode: 'ART-001',
    quantity: 10,
    unitPrice: 5.0,
    discountPercent: 0,
    lineAmount: 50.0,
    ...overrides,
  };
}

describe('verifyOrderArticles', () => {
  test('1 - matching order returns verified with empty mismatches', () => {
    const snapshot = [makeSnapshotArticle()];
    const synced = [makeSyncedArticle()];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('2 - article in snapshot but not in sync returns missing mismatch', () => {
    const snapshot = [makeSnapshotArticle({ articleCode: 'ART-001' })];
    const synced: SyncedArticle[] = [];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'mismatch_detected',
      mismatches: [
        {
          type: 'missing',
          snapshotArticleCode: 'ART-001',
          syncedArticleCode: null,
          field: null,
          expected: null,
          found: null,
        },
      ],
    });
  });

  test('3 - article in sync but not in snapshot returns extra mismatch', () => {
    const snapshot: SnapshotArticle[] = [];
    const synced = [makeSyncedArticle({ articleCode: 'EXTRA-01' })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'mismatch_detected',
      mismatches: [
        {
          type: 'extra',
          snapshotArticleCode: null,
          syncedArticleCode: 'EXTRA-01',
          field: null,
          expected: null,
          found: null,
        },
      ],
    });
  });

  test('4 - different quantity returns quantity_diff mismatch', () => {
    const snapshot = [makeSnapshotArticle({ quantity: 10 })];
    const synced = [makeSyncedArticle({ quantity: 8 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'mismatch_detected',
      mismatches: [
        {
          type: 'quantity_diff',
          snapshotArticleCode: 'ART-001',
          syncedArticleCode: 'ART-001',
          field: 'quantity',
          expected: 10,
          found: 8,
        },
      ],
    });
  });

  test('5 - different unit price returns price_diff mismatch', () => {
    const snapshot = [makeSnapshotArticle({ unitPrice: 5.0, expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ unitPrice: 6.0, lineAmount: 50.0 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'mismatch_detected',
      mismatches: [
        {
          type: 'price_diff',
          snapshotArticleCode: 'ART-001',
          syncedArticleCode: 'ART-001',
          field: 'unitPrice',
          expected: 5.0,
          found: 6.0,
        },
      ],
    });
  });

  test('6 - different line discount returns discount_diff mismatch', () => {
    const snapshot = [makeSnapshotArticle({ lineDiscountPercent: 10, expectedLineAmount: 45.0 })];
    const synced = [makeSyncedArticle({ discountPercent: 15, lineAmount: 45.0 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'mismatch_detected',
      mismatches: [
        {
          type: 'discount_diff',
          snapshotArticleCode: 'ART-001',
          syncedArticleCode: 'ART-001',
          field: 'discountPercent',
          expected: 10,
          found: 15,
        },
      ],
    });
  });

  test('7 - different line amount returns amount_diff mismatch', () => {
    const snapshot = [makeSnapshotArticle({ expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ lineAmount: 48.0 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'mismatch_detected',
      mismatches: [
        {
          type: 'amount_diff',
          snapshotArticleCode: 'ART-001',
          syncedArticleCode: 'ART-001',
          field: 'lineAmount',
          expected: 50.0,
          found: 48.0,
        },
      ],
    });
  });

  test('8 - amount difference within tolerance (<=0.02) is verified', () => {
    const snapshot = [makeSnapshotArticle({ expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ lineAmount: 50.02 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('9 - amount difference exceeding tolerance (>0.02) is mismatch', () => {
    const snapshot = [makeSnapshotArticle({ expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ lineAmount: 50.03 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'mismatch_detected',
      mismatches: [
        {
          type: 'amount_diff',
          snapshotArticleCode: 'ART-001',
          syncedArticleCode: 'ART-001',
          field: 'lineAmount',
          expected: 50.0,
          found: 50.03,
        },
      ],
    });
  });

  test('10 - duplicate article codes are compared by positional order', () => {
    const snapshot = [
      makeSnapshotArticle({ articleCode: 'DUP-01', quantity: 5, expectedLineAmount: 25.0 }),
      makeSnapshotArticle({ articleCode: 'DUP-01', quantity: 10, expectedLineAmount: 50.0 }),
    ];
    const synced = [
      makeSyncedArticle({ articleCode: 'DUP-01', quantity: 5, lineAmount: 25.0 }),
      makeSyncedArticle({ articleCode: 'DUP-01', quantity: 10, lineAmount: 50.0 }),
    ];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('10b - duplicate article codes with mismatched quantities detected by position', () => {
    const snapshot = [
      makeSnapshotArticle({ articleCode: 'DUP-01', quantity: 5, expectedLineAmount: 25.0 }),
      makeSnapshotArticle({ articleCode: 'DUP-01', quantity: 10, expectedLineAmount: 50.0 }),
    ];
    const synced = [
      makeSyncedArticle({ articleCode: 'DUP-01', quantity: 5, lineAmount: 25.0 }),
      makeSyncedArticle({ articleCode: 'DUP-01', quantity: 7, lineAmount: 50.0 }),
    ];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'mismatch_detected',
      mismatches: [
        {
          type: 'quantity_diff',
          snapshotArticleCode: 'DUP-01',
          syncedArticleCode: 'DUP-01',
          field: 'quantity',
          expected: 10,
          found: 7,
        },
      ],
    });
  });

  test('11 - case-insensitive article code matching', () => {
    const snapshot = [makeSnapshotArticle({ articleCode: 'BCS1.000.000' })];
    const synced = [makeSyncedArticle({ articleCode: 'bcs1.000.000' })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('12 - empty order (0 snapshot, 0 synced) returns verified', () => {
    const result = verifyOrderArticles([], []);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('13 - multiple mismatches in same order are all detected', () => {
    const snapshot = [
      makeSnapshotArticle({ articleCode: 'A', quantity: 10, unitPrice: 5.0, expectedLineAmount: 50.0 }),
      makeSnapshotArticle({ articleCode: 'B', quantity: 3, unitPrice: 20.0, expectedLineAmount: 60.0 }),
      makeSnapshotArticle({ articleCode: 'C', quantity: 1, unitPrice: 100.0, expectedLineAmount: 100.0 }),
    ];
    const synced = [
      makeSyncedArticle({ articleCode: 'A', quantity: 8, unitPrice: 5.0, lineAmount: 50.0 }),
      makeSyncedArticle({ articleCode: 'B', quantity: 3, unitPrice: 25.0, lineAmount: 60.0 }),
    ];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result.status).toBe('mismatch_detected');
    expect(result.mismatches).toEqual(
      expect.arrayContaining([
        {
          type: 'quantity_diff',
          snapshotArticleCode: 'A',
          syncedArticleCode: 'A',
          field: 'quantity',
          expected: 10,
          found: 8,
        },
        {
          type: 'price_diff',
          snapshotArticleCode: 'B',
          syncedArticleCode: 'B',
          field: 'unitPrice',
          expected: 20.0,
          found: 25.0,
        },
        {
          type: 'missing',
          snapshotArticleCode: 'C',
          syncedArticleCode: null,
          field: null,
          expected: null,
          found: null,
        },
      ]),
    );
    expect(result.mismatches).toHaveLength(3);
  });

  test('custom tolerance overrides default', () => {
    const snapshot = [makeSnapshotArticle({ expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ lineAmount: 50.10 })];

    const resultDefault = verifyOrderArticles(snapshot, synced);
    expect(resultDefault.status).toBe('mismatch_detected');

    const resultCustom = verifyOrderArticles(snapshot, synced, { amountTolerance: 0.15 });
    expect(resultCustom).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('articles are matched across different ordering by sorting on code', () => {
    const snapshot = [
      makeSnapshotArticle({ articleCode: 'ZZZ', quantity: 1, expectedLineAmount: 10.0 }),
      makeSnapshotArticle({ articleCode: 'AAA', quantity: 2, expectedLineAmount: 20.0 }),
    ];
    const synced = [
      makeSyncedArticle({ articleCode: 'AAA', quantity: 2, lineAmount: 20.0 }),
      makeSyncedArticle({ articleCode: 'ZZZ', quantity: 1, lineAmount: 10.0 }),
    ];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('discount difference within tolerance (<=0.02) is verified', () => {
    const snapshot = [makeSnapshotArticle({ lineDiscountPercent: 34.85, expectedLineAmount: 28.93 })];
    const synced = [makeSyncedArticle({ discountPercent: 34.84, lineAmount: 28.93 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('discount difference exceeding tolerance (>0.02) is mismatch', () => {
    const snapshot = [makeSnapshotArticle({ lineDiscountPercent: 34.85, expectedLineAmount: 28.93 })];
    const synced = [makeSyncedArticle({ discountPercent: 34.82, lineAmount: 28.93 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'mismatch_detected',
      mismatches: [
        {
          type: 'discount_diff',
          snapshotArticleCode: 'ART-001',
          syncedArticleCode: 'ART-001',
          field: 'discountPercent',
          expected: 34.85,
          found: 34.82,
        },
      ],
    });
  });

  test('custom discount tolerance overrides default', () => {
    const snapshot = [makeSnapshotArticle({ lineDiscountPercent: 10, expectedLineAmount: 45.0 })];
    const synced = [makeSyncedArticle({ discountPercent: 9.9, lineAmount: 45.0 })];

    const resultDefault = verifyOrderArticles(snapshot, synced);
    expect(resultDefault.status).toBe('mismatch_detected');

    const resultCustom = verifyOrderArticles(snapshot, synced, { discountTolerance: 0.15 });
    expect(resultCustom).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('snapshot null discount treated as 0 for comparison', () => {
    const snapshot = [makeSnapshotArticle({ lineDiscountPercent: null })];
    const synced = [makeSyncedArticle({ discountPercent: 0 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });
});

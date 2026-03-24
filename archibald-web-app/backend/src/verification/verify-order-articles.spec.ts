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

  test('5 - different unit price alone does NOT trigger mismatch (bot never sets prices)', () => {
    // Archibald auto-fills unit price from its price list; shared.prices can be stale.
    // A pure price diff with matching amounts should be ignored.
    const snapshot = [makeSnapshotArticle({ unitPrice: 5.0, expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ unitPrice: 6.0, lineAmount: 50.0 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({ status: 'verified', mismatches: [] });
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

  test('7 - amount difference exceeding 10% threshold returns amount_diff mismatch', () => {
    // tolerance = max(0.05, 50.0 * 0.10) = 5.0; diff = 10.0 > 5.0 → mismatch
    const snapshot = [makeSnapshotArticle({ expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ lineAmount: 40.0 })];

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
          found: 40.0,
        },
      ],
    });
  });

  test('8 - amount difference within 10% tolerance is verified', () => {
    // tolerance = max(0.05, 50.0 * 0.10) = 5.0; diff = 3.0 < 5.0 → verified
    const snapshot = [makeSnapshotArticle({ expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ lineAmount: 47.0 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('9 - minimum floor tolerance (0.05€) applies for very small amounts', () => {
    // tolerance = max(0.05, 0.10 * 0.10) = max(0.05, 0.01) = 0.05; diff = 0.08 > 0.05 → mismatch
    const snapshot = [makeSnapshotArticle({ expectedLineAmount: 0.10 })];
    const synced = [makeSyncedArticle({ lineAmount: 0.02 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'mismatch_detected',
      mismatches: [
        {
          type: 'amount_diff',
          snapshotArticleCode: 'ART-001',
          syncedArticleCode: 'ART-001',
          field: 'lineAmount',
          expected: 0.10,
          found: 0.02,
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
        // Article B: unitPrice differs (20→25) but amounts match (60.0) → no mismatch (price not compared)
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
    expect(result.mismatches).toHaveLength(2);
  });

  test('custom amountTolerancePct overrides default', () => {
    // Default 10% on 50.0 = 5.0 tolerance; diff = 20.0 (50→30) > 5.0 → mismatch by default
    const snapshot = [makeSnapshotArticle({ expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ lineAmount: 30.0 })];

    const resultDefault = verifyOrderArticles(snapshot, synced);
    expect(resultDefault.status).toBe('mismatch_detected');

    // Custom 50% tolerance: 50.0 * 0.50 = 25.0; diff = 20.0 < 25.0 → verified
    const resultCustom = verifyOrderArticles(snapshot, synced, { amountTolerancePct: 0.50 });
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

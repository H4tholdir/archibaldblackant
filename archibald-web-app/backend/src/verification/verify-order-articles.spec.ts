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
    // If Archibald updated the price to 6.0 and computed lineAmount consistently (60.0),
    // the recomputed check passes and no mismatch fires.
    const snapshot = [makeSnapshotArticle({ unitPrice: 5.0, expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ unitPrice: 6.0, lineAmount: 60.0 })];

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

  test('7 - amount inconsistency: Archibald line total does not match qty × syncedPrice × (1-discount)', () => {
    // recomputedExpected = round2(10 × 5.0 × 1.0) = 50.0; found 40.0 → |10.0| > 0.05 → mismatch
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

  test('8 - amount diff within 0.05€ flat tolerance is verified', () => {
    // recomputedExpected = round2(10 × 5.0 × 1.0) = 50.0; found 50.03 → |0.03| < 0.05 → verified
    const snapshot = [makeSnapshotArticle({ expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ lineAmount: 50.03 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('9 - amount diff exceeding 0.05€ flat tolerance is mismatch', () => {
    // recomputedExpected = round2(10 × 5.0 × 1.0) = 50.0; found 50.07 → |0.07| > 0.05 → mismatch
    const snapshot = [makeSnapshotArticle({ expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ lineAmount: 50.07 })];

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
          found: 50.07,
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
      // Article B: unitPrice differs (20→25), lineAmount=75.0 is consistent with syncedPrice → no amount_diff
      makeSyncedArticle({ articleCode: 'B', quantity: 3, unitPrice: 25.0, lineAmount: 75.0 }),
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

  test('custom amountToleranceMin overrides default', () => {
    // recomputed=50.0; found=50.10; diff=0.10 > 0.05 (default) → mismatch
    const snapshot = [makeSnapshotArticle({ expectedLineAmount: 50.0 })];
    const synced = [makeSyncedArticle({ lineAmount: 50.10 })];

    const resultDefault = verifyOrderArticles(snapshot, synced);
    expect(resultDefault.status).toBe('mismatch_detected');

    // Custom 0.20€ tolerance: diff=0.10 < 0.20 → verified
    const resultCustom = verifyOrderArticles(snapshot, synced, { amountToleranceMin: 0.20 });
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
      // lineAmounts consistent with qty × unitPrice(5.0): AAA=2×5=10, ZZZ=1×5=5
      makeSyncedArticle({ articleCode: 'AAA', quantity: 2, lineAmount: 10.0 }),
      makeSyncedArticle({ articleCode: 'ZZZ', quantity: 1, lineAmount: 5.0 }),
    ];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('discount difference within tolerance (<=0.02) is verified', () => {
    // qty=10, unitPrice=5.0, discount ~34.84-34.85% → lineAmount ≈ 32.58 (consistent with synced price)
    const snapshot = [makeSnapshotArticle({ lineDiscountPercent: 34.85, expectedLineAmount: 32.57 })];
    const synced = [makeSyncedArticle({ discountPercent: 34.84, lineAmount: 32.58 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({
      status: 'verified',
      mismatches: [],
    });
  });

  test('discount difference exceeding tolerance (>0.02) is mismatch', () => {
    // qty=10, unitPrice=5.0 → recomputed=round2(50×0.6515)=32.57; synced lineAmount=32.59 → diff=0.02 ≤ 0.05 → no amount_diff
    const snapshot = [makeSnapshotArticle({ lineDiscountPercent: 34.85, expectedLineAmount: 32.57 })];
    const synced = [makeSyncedArticle({ discountPercent: 34.82, lineAmount: 32.59 })];

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

  test('snapshot unit price is ignored — amount check uses synced unit price (Fresis subclient scenario)', () => {
    // Fresis: snapshot stores subclient price (221.31), Archibald auto-fills list price (298.51).
    // Same qty (1) and discount (63%) → recomputed = round2(1 × 298.51 × 0.37) = 110.45 = lineAmount → verified.
    const snapshot = [makeSnapshotArticle({
      articleCode: 'LD1500B',
      quantity: 1,
      unitPrice: 221.31,
      lineDiscountPercent: 63,
      expectedLineAmount: 81.88,
    })];
    const synced = [makeSyncedArticle({
      articleCode: 'LD1500B',
      quantity: 1,
      unitPrice: 298.51,
      discountPercent: 63,
      lineAmount: 110.45,
    })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({ status: 'verified', mismatches: [] });
  });

  test('amount check is skipped when synced unit price is zero', () => {
    // PDF mal parsato o articolo senza prezzo: nessun amount_diff se unitPrice=0
    const snapshot = [makeSnapshotArticle({ quantity: 10, unitPrice: 5.0 })];
    const synced = [makeSyncedArticle({ unitPrice: 0, lineAmount: 0 })];

    const result = verifyOrderArticles(snapshot, synced);

    expect(result).toEqual({ status: 'verified', mismatches: [] });
  });
});

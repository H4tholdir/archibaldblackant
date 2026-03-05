import { describe, expect, test } from 'vitest';
import type { ArticleMismatch } from './verify-order-articles';
import type { SnapshotArticle, SyncedArticle } from './verify-order-articles';
import { buildCorrections } from './build-corrections';
import type { CorrectionPlan, Modification } from './build-corrections';

function makeSnapshotArticle(overrides: Partial<SnapshotArticle> & { articleCode: string }): SnapshotArticle {
  return {
    quantity: 1,
    unitPrice: 10,
    lineDiscountPercent: null,
    expectedLineAmount: 10,
    ...overrides,
  };
}

function makeSyncedArticle(overrides: Partial<SyncedArticle> & { articleCode: string }): SyncedArticle {
  return {
    quantity: 1,
    unitPrice: 10,
    discountPercent: 0,
    lineAmount: 10,
    ...overrides,
  };
}

function makeMismatch(overrides: Partial<ArticleMismatch> & { type: ArticleMismatch['type'] }): ArticleMismatch {
  return {
    snapshotArticleCode: null,
    syncedArticleCode: null,
    field: null,
    expected: null,
    found: null,
    ...overrides,
  };
}

describe('buildCorrections', () => {
  test('no mismatches returns empty modifications and canCorrect true', () => {
    const snapshotItems = [makeSnapshotArticle({ articleCode: 'ART001', quantity: 5, unitPrice: 10, expectedLineAmount: 50 })];
    const syncedArticles = [makeSyncedArticle({ articleCode: 'ART001', quantity: 5, unitPrice: 10, lineAmount: 50 })];

    const result = buildCorrections([], snapshotItems, syncedArticles);

    expect(result).toEqual({
      modifications: [],
      updatedItems: expect.any(Array),
      canCorrect: true,
      uncorrectableReasons: [],
    });
  });

  test('missing article produces add modification from snapshot data', () => {
    const snapshotItems = [
      makeSnapshotArticle({ articleCode: 'ART001', quantity: 3, unitPrice: 15, lineDiscountPercent: 10, expectedLineAmount: 40.5 }),
    ];
    const syncedArticles: SyncedArticle[] = [];
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'missing', snapshotArticleCode: 'ART001' }),
    ];

    const result = buildCorrections(mismatches, snapshotItems, syncedArticles);

    expect(result.canCorrect).toBe(true);
    expect(result.modifications).toEqual([
      { type: 'add', articleCode: 'ART001', quantity: 3, discount: 10 },
    ]);
  });

  test('extra article produces delete modification at correct rowIndex', () => {
    const snapshotItems: SnapshotArticle[] = [];
    const syncedArticles = [
      makeSyncedArticle({ articleCode: 'ART001' }),
      makeSyncedArticle({ articleCode: 'ART002' }),
      makeSyncedArticle({ articleCode: 'ART003' }),
    ];
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'extra', syncedArticleCode: 'ART002' }),
    ];

    const result = buildCorrections(mismatches, snapshotItems, syncedArticles);

    expect(result.canCorrect).toBe(true);
    expect(result.modifications).toEqual([
      { type: 'delete', rowIndex: 1 },
    ]);
  });

  test('quantity_diff produces update modification with expected quantity', () => {
    const snapshotItems = [
      makeSnapshotArticle({ articleCode: 'ART001', quantity: 10, unitPrice: 5, expectedLineAmount: 50 }),
    ];
    const syncedArticles = [
      makeSyncedArticle({ articleCode: 'ART001', quantity: 7, unitPrice: 5, lineAmount: 35 }),
    ];
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'quantity_diff', snapshotArticleCode: 'ART001', syncedArticleCode: 'ART001', field: 'quantity', expected: 10, found: 7 }),
    ];

    const result = buildCorrections(mismatches, snapshotItems, syncedArticles);

    expect(result.canCorrect).toBe(true);
    expect(result.modifications).toEqual([
      { type: 'update', rowIndex: 0, articleCode: 'ART001', quantity: 10 },
    ]);
  });

  test('discount_diff produces update modification with expected discount and current quantity', () => {
    const snapshotItems = [
      makeSnapshotArticle({ articleCode: 'ART001', quantity: 5, unitPrice: 20, lineDiscountPercent: 15, expectedLineAmount: 85 }),
    ];
    const syncedArticles = [
      makeSyncedArticle({ articleCode: 'ART001', quantity: 5, unitPrice: 20, discountPercent: 10, lineAmount: 90 }),
    ];
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'discount_diff', snapshotArticleCode: 'ART001', syncedArticleCode: 'ART001', field: 'discountPercent', expected: 15, found: 10 }),
    ];

    const result = buildCorrections(mismatches, snapshotItems, syncedArticles);

    expect(result.canCorrect).toBe(true);
    expect(result.modifications).toEqual([
      { type: 'update', rowIndex: 0, articleCode: 'ART001', quantity: 5, discount: 15 },
    ]);
  });

  test('price_diff sets canCorrect false with reason', () => {
    const snapshotItems = [
      makeSnapshotArticle({ articleCode: 'ART001', quantity: 1, unitPrice: 25, expectedLineAmount: 25 }),
    ];
    const syncedArticles = [
      makeSyncedArticle({ articleCode: 'ART001', quantity: 1, unitPrice: 20, lineAmount: 20 }),
    ];
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'price_diff', snapshotArticleCode: 'ART001', syncedArticleCode: 'ART001', field: 'unitPrice', expected: 25, found: 20 }),
    ];

    const result = buildCorrections(mismatches, snapshotItems, syncedArticles);

    expect(result.canCorrect).toBe(false);
    expect(result.uncorrectableReasons.length).toBeGreaterThan(0);
    expect(result.uncorrectableReasons[0]).toContain('ART001');
  });

  test('isolated amount_diff sets canCorrect false with reason', () => {
    const snapshotItems = [
      makeSnapshotArticle({ articleCode: 'ART001', quantity: 2, unitPrice: 10, expectedLineAmount: 20 }),
    ];
    const syncedArticles = [
      makeSyncedArticle({ articleCode: 'ART001', quantity: 2, unitPrice: 10, lineAmount: 18.5 }),
    ];
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'amount_diff', snapshotArticleCode: 'ART001', syncedArticleCode: 'ART001', field: 'lineAmount', expected: 20, found: 18.5 }),
    ];

    const result = buildCorrections(mismatches, snapshotItems, syncedArticles);

    expect(result.canCorrect).toBe(false);
    expect(result.uncorrectableReasons.length).toBeGreaterThan(0);
    expect(result.uncorrectableReasons[0]).toContain('ART001');
  });

  test('multiple mismatches on same article (qty + discount) merge into single update', () => {
    const snapshotItems = [
      makeSnapshotArticle({ articleCode: 'ART001', quantity: 8, unitPrice: 10, lineDiscountPercent: 20, expectedLineAmount: 64 }),
    ];
    const syncedArticles = [
      makeSyncedArticle({ articleCode: 'ART001', quantity: 5, unitPrice: 10, discountPercent: 10, lineAmount: 45 }),
    ];
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'quantity_diff', snapshotArticleCode: 'ART001', syncedArticleCode: 'ART001', field: 'quantity', expected: 8, found: 5 }),
      makeMismatch({ type: 'discount_diff', snapshotArticleCode: 'ART001', syncedArticleCode: 'ART001', field: 'discountPercent', expected: 20, found: 10 }),
    ];

    const result = buildCorrections(mismatches, snapshotItems, syncedArticles);

    expect(result.canCorrect).toBe(true);
    expect(result.modifications).toEqual([
      { type: 'update', rowIndex: 0, articleCode: 'ART001', quantity: 8, discount: 20 },
    ]);
  });

  test('mixed mismatch types are ordered: updates first, adds second, deletes last', () => {
    const snapshotItems = [
      makeSnapshotArticle({ articleCode: 'ART001', quantity: 3, unitPrice: 10, expectedLineAmount: 30 }),
      makeSnapshotArticle({ articleCode: 'ART003', quantity: 2, unitPrice: 5, lineDiscountPercent: 0, expectedLineAmount: 10 }),
    ];
    const syncedArticles = [
      makeSyncedArticle({ articleCode: 'ART001', quantity: 1, unitPrice: 10, lineAmount: 10 }),
      makeSyncedArticle({ articleCode: 'ART002', quantity: 4, unitPrice: 8, lineAmount: 32 }),
    ];
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'quantity_diff', snapshotArticleCode: 'ART001', syncedArticleCode: 'ART001', field: 'quantity', expected: 3, found: 1 }),
      makeMismatch({ type: 'extra', syncedArticleCode: 'ART002' }),
      makeMismatch({ type: 'missing', snapshotArticleCode: 'ART003' }),
    ];

    const result = buildCorrections(mismatches, snapshotItems, syncedArticles);

    expect(result.canCorrect).toBe(true);
    expect(result.modifications).toEqual([
      { type: 'update', rowIndex: 0, articleCode: 'ART001', quantity: 3 },
      { type: 'add', articleCode: 'ART003', quantity: 2, discount: 0 },
      { type: 'delete', rowIndex: 1 },
    ]);
  });

  test('multiple deletes are ordered by descending rowIndex', () => {
    const snapshotItems: SnapshotArticle[] = [];
    const syncedArticles = [
      makeSyncedArticle({ articleCode: 'ART001' }),
      makeSyncedArticle({ articleCode: 'ART002' }),
      makeSyncedArticle({ articleCode: 'ART003' }),
      makeSyncedArticle({ articleCode: 'ART004' }),
    ];
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'extra', syncedArticleCode: 'ART002' }),
      makeMismatch({ type: 'extra', syncedArticleCode: 'ART004' }),
    ];

    const result = buildCorrections(mismatches, snapshotItems, syncedArticles);

    expect(result.modifications).toEqual([
      { type: 'delete', rowIndex: 3 },
      { type: 'delete', rowIndex: 1 },
    ]);
  });

  test('updatedItems are rebuilt from snapshot items in EditOrderArticle format', () => {
    const snapshotItems = [
      makeSnapshotArticle({ articleCode: 'ART001', quantity: 5, unitPrice: 20, lineDiscountPercent: 10, expectedLineAmount: 90 }),
      makeSnapshotArticle({ articleCode: 'ART002', quantity: 3, unitPrice: 15, lineDiscountPercent: null, expectedLineAmount: 45 }),
    ];
    const syncedArticles = [
      makeSyncedArticle({ articleCode: 'ART001', quantity: 5, unitPrice: 20, discountPercent: 10, lineAmount: 90 }),
      makeSyncedArticle({ articleCode: 'ART002', quantity: 3, unitPrice: 15, discountPercent: 0, lineAmount: 45 }),
    ];

    const result = buildCorrections([], snapshotItems, syncedArticles);

    expect(result.updatedItems).toEqual([
      { articleCode: 'ART001', quantity: 5, unitPrice: 20, discountPercent: 10, lineAmount: 90 },
      { articleCode: 'ART002', quantity: 3, unitPrice: 15, discountPercent: 0, lineAmount: 45 },
    ]);
  });

  test('amount_diff alongside quantity_diff is correctable (quantity fix resolves amount)', () => {
    const snapshotItems = [
      makeSnapshotArticle({ articleCode: 'ART001', quantity: 10, unitPrice: 5, expectedLineAmount: 50 }),
    ];
    const syncedArticles = [
      makeSyncedArticle({ articleCode: 'ART001', quantity: 7, unitPrice: 5, lineAmount: 35 }),
    ];
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'quantity_diff', snapshotArticleCode: 'ART001', syncedArticleCode: 'ART001', field: 'quantity', expected: 10, found: 7 }),
      makeMismatch({ type: 'amount_diff', snapshotArticleCode: 'ART001', syncedArticleCode: 'ART001', field: 'lineAmount', expected: 50, found: 35 }),
    ];

    const result = buildCorrections(mismatches, snapshotItems, syncedArticles);

    expect(result.canCorrect).toBe(true);
    expect(result.modifications).toEqual([
      { type: 'update', rowIndex: 0, articleCode: 'ART001', quantity: 10 },
    ]);
  });

  test('missing article with null lineDiscountPercent uses 0 as discount', () => {
    const snapshotItems = [
      makeSnapshotArticle({ articleCode: 'ART001', quantity: 2, unitPrice: 30, lineDiscountPercent: null, expectedLineAmount: 60 }),
    ];
    const syncedArticles: SyncedArticle[] = [];
    const mismatches: ArticleMismatch[] = [
      makeMismatch({ type: 'missing', snapshotArticleCode: 'ART001' }),
    ];

    const result = buildCorrections(mismatches, snapshotItems, syncedArticles);

    expect(result.modifications).toEqual([
      { type: 'add', articleCode: 'ART001', quantity: 2, discount: 0 },
    ]);
  });
});

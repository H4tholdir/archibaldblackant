import { describe, expect, test, vi } from 'vitest';
import { performAutoCorrection } from './auto-correction';
import type { AutoCorrectionDeps } from './auto-correction';
import type { ArticleMismatch, SnapshotArticle, SyncedArticle } from './verify-order-articles';

function makeDeps(overrides: Partial<AutoCorrectionDeps> = {}): AutoCorrectionDeps {
  return {
    pool: {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      withTransaction: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn(),
    },
    editOrderInArchibald: vi.fn().mockResolvedValue({ success: true, message: 'OK' }),
    inlineSyncDeps: {
      pool: {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        withTransaction: vi.fn(),
        end: vi.fn(),
        getStats: vi.fn(),
      },
      downloadOrderArticlesPDF: vi.fn().mockResolvedValue('/tmp/test.pdf'),
      parsePdf: vi.fn().mockResolvedValue([]),
      getProductVat: vi.fn().mockResolvedValue(0),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

const orderId = 'ORD-001';
const userId = 'user-1';

const snapshotItems: SnapshotArticle[] = [
  { articleCode: 'ART-01', quantity: 10, unitPrice: 5.0, lineDiscountPercent: null, expectedLineAmount: 50.0 },
];

const syncedArticles: SyncedArticle[] = [
  { articleCode: 'ART-01', quantity: 8, unitPrice: 5.0, discountPercent: 0, lineAmount: 40.0 },
];

const mismatches: ArticleMismatch[] = [
  { type: 'quantity_diff', snapshotArticleCode: 'ART-01', syncedArticleCode: 'ART-01', field: 'quantity', expected: 10, found: 8 },
];

describe('performAutoCorrection', () => {
  test('returns correction_failed when buildCorrections says canCorrect is false', async () => {
    const priceMismatches: ArticleMismatch[] = [
      { type: 'price_diff', snapshotArticleCode: 'ART-01', syncedArticleCode: 'ART-01', field: 'unitPrice', expected: 5, found: 6 },
    ];

    const deps = makeDeps();
    const onProgress = vi.fn();

    const result = await performAutoCorrection(
      deps, orderId, userId, priceMismatches, snapshotItems, syncedArticles, onProgress,
    );

    expect(result.status).toBe('correction_failed');
    expect(deps.editOrderInArchibald).not.toHaveBeenCalled();
  });

  test('returns correction_failed when bot edit fails', async () => {
    const deps = makeDeps({
      editOrderInArchibald: vi.fn().mockResolvedValue({ success: false, message: 'Bot error' }),
    });
    const onProgress = vi.fn();

    const result = await performAutoCorrection(
      deps, orderId, userId, mismatches, snapshotItems, syncedArticles, onProgress,
    );

    expect(result.status).toBe('correction_failed');
    expect(result.details).toContain('Bot error');
  });

  test('returns correction_failed when bot edit throws', async () => {
    const deps = makeDeps({
      editOrderInArchibald: vi.fn().mockRejectedValue(new Error('Network timeout')),
    });
    const onProgress = vi.fn();

    const result = await performAutoCorrection(
      deps, orderId, userId, mismatches, snapshotItems, syncedArticles, onProgress,
    );

    expect(result.status).toBe('correction_failed');
    expect(result.details).toContain('Network timeout');
  });

  test('returns correction_failed when re-sync returns null', async () => {
    const deps = makeDeps();
    deps.inlineSyncDeps.downloadOrderArticlesPDF = vi.fn().mockRejectedValue(new Error('PDF unavailable'));
    const onProgress = vi.fn();

    const result = await performAutoCorrection(
      deps, orderId, userId, mismatches, snapshotItems, syncedArticles, onProgress,
    );

    expect(result.status).toBe('correction_failed');
    expect(result.details).toContain('Re-sync');
  });

  test('returns auto_corrected when re-verify finds no mismatches', async () => {
    const correctedSynced = [
      { articleCode: 'ART-01', quantity: 10, unitPrice: 5.0, discountPercent: 0, lineAmount: 50.0 },
    ];

    const deps = makeDeps();
    deps.inlineSyncDeps.parsePdf = vi.fn().mockResolvedValue(correctedSynced);

    deps.pool.query = vi.fn().mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('order_verification_snapshots') && sql.includes('SELECT')) {
        return Promise.resolve({
          rows: [{
            id: 1, order_id: orderId, user_id: userId,
            global_discount_percent: null, expected_gross_amount: 50.0,
            expected_total_amount: 50.0, verification_status: 'mismatch_detected',
            verified_at: null, verification_notes: null, created_at: '2026-01-01',
          }],
          rowCount: 1,
        });
      }
      if (typeof sql === 'string' && sql.includes('order_verification_snapshot_items') && sql.includes('SELECT')) {
        return Promise.resolve({
          rows: [{
            id: 1, snapshot_id: 1, article_code: 'ART-01',
            article_description: null, quantity: 10, unit_price: 5.0,
            line_discount_percent: null, expected_line_amount: 50.0,
            created_at: '2026-01-01',
          }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const onProgress = vi.fn();

    const result = await performAutoCorrection(
      deps, orderId, userId, mismatches, snapshotItems, syncedArticles, onProgress,
    );

    expect(result.status).toBe('auto_corrected');
    expect(deps.editOrderInArchibald).toHaveBeenCalled();
  });

  test('returns correction_failed when re-verify still finds mismatches', async () => {
    const stillWrongSynced = [
      { articleCode: 'ART-01', quantity: 9, unitPrice: 5.0, discountPercent: 0, lineAmount: 45.0 },
    ];

    const deps = makeDeps();
    deps.inlineSyncDeps.parsePdf = vi.fn().mockResolvedValue(stillWrongSynced);

    deps.pool.query = vi.fn().mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('order_verification_snapshots') && sql.includes('SELECT')) {
        return Promise.resolve({
          rows: [{
            id: 1, order_id: orderId, user_id: userId,
            global_discount_percent: null, expected_gross_amount: 50.0,
            expected_total_amount: 50.0, verification_status: 'mismatch_detected',
            verified_at: null, verification_notes: null, created_at: '2026-01-01',
          }],
          rowCount: 1,
        });
      }
      if (typeof sql === 'string' && sql.includes('order_verification_snapshot_items') && sql.includes('SELECT')) {
        return Promise.resolve({
          rows: [{
            id: 1, snapshot_id: 1, article_code: 'ART-01',
            article_description: null, quantity: 10, unit_price: 5.0,
            line_discount_percent: null, expected_line_amount: 50.0,
            created_at: '2026-01-01',
          }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const onProgress = vi.fn();

    const result = await performAutoCorrection(
      deps, orderId, userId, mismatches, snapshotItems, syncedArticles, onProgress,
    );

    expect(result.status).toBe('correction_failed');
    expect(result.details).toContain('Re-verify');
  });

  test('reports progress at each step', async () => {
    const correctedSynced = [
      { articleCode: 'ART-01', quantity: 10, unitPrice: 5.0, discountPercent: 0, lineAmount: 50.0 },
    ];

    const deps = makeDeps();
    deps.inlineSyncDeps.parsePdf = vi.fn().mockResolvedValue(correctedSynced);

    deps.pool.query = vi.fn().mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('order_verification_snapshots') && sql.includes('SELECT')) {
        return Promise.resolve({
          rows: [{
            id: 1, order_id: orderId, user_id: userId,
            global_discount_percent: null, expected_gross_amount: 50.0,
            expected_total_amount: 50.0, verification_status: 'mismatch_detected',
            verified_at: null, verification_notes: null, created_at: '2026-01-01',
          }],
          rowCount: 1,
        });
      }
      if (typeof sql === 'string' && sql.includes('order_verification_snapshot_items') && sql.includes('SELECT')) {
        return Promise.resolve({
          rows: [{
            id: 1, snapshot_id: 1, article_code: 'ART-01',
            article_description: null, quantity: 10, unit_price: 5.0,
            line_discount_percent: null, expected_line_amount: 50.0,
            created_at: '2026-01-01',
          }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const onProgress = vi.fn();

    await performAutoCorrection(
      deps, orderId, userId, mismatches, snapshotItems, syncedArticles, onProgress,
    );

    const progressValues = onProgress.mock.calls.map((c: unknown[]) => c[0] as number);
    expect(progressValues).toEqual(expect.arrayContaining([90, 91, 94, 97]));
  });

  test('never throws even when unexpected error occurs', async () => {
    const deps = makeDeps();
    deps.editOrderInArchibald = vi.fn().mockImplementation(() => { throw new TypeError('unexpected'); });
    const onProgress = vi.fn();

    const result = await performAutoCorrection(
      deps, orderId, userId, mismatches, snapshotItems, syncedArticles, onProgress,
    );

    expect(result.status).toBe('correction_failed');
  });
});

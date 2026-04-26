import { describe, expect, test, vi } from 'vitest';
import { handleSyncOrderArticles, type SyncOrderArticlesBot, type SyncOrderArticlesData, type SyncOrderArticlesDeps } from './sync-order-articles';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  const queryFn = vi.fn()
    .mockResolvedValueOnce({ rows: [{ id: 'ORD-001', archibald_order_id: '71723' }], rowCount: 1 })
    .mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    query: queryFn,
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(): SyncOrderArticlesBot {
  return {
    downloadOrderArticlesPDF: vi.fn().mockResolvedValue('/tmp/articles.pdf'),
    setProgressCallback: vi.fn(),
  };
}

function createMockDeps(pool: DbPool, bot: SyncOrderArticlesBot): SyncOrderArticlesDeps {
  return {
    pool,
    bot,
    parsePdf: vi.fn().mockResolvedValue([
      { articleCode: 'ART-01', description: 'Widget', quantity: 10, unitPrice: 5.0, discountPercent: 0, lineAmount: 50.0 },
      { articleCode: 'ART-02', description: 'Gadget', quantity: 5, unitPrice: 20.0, discountPercent: 10, lineAmount: 90.0 },
    ]),
    getProductVat: vi.fn().mockResolvedValue(22),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

const sampleData: SyncOrderArticlesData = {
  orderId: 'ORD-001',
};

describe('handleSyncOrderArticles', () => {
  test('fetches order to get archibald_order_id', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    const firstCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall[0]).toContain('SELECT');
    expect(firstCall[1]).toContain('ORD-001');
  });

  test('calls bot.downloadOrderArticlesPDF with archibald order id', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    expect(bot.downloadOrderArticlesPDF).toHaveBeenCalledWith('71723');
  });

  test('parses downloaded PDF', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    expect(deps.parsePdf).toHaveBeenCalledWith('/tmp/articles.pdf');
  });

  test('enriches articles with VAT from product database', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    expect(deps.getProductVat).toHaveBeenCalledWith('ART-01');
    expect(deps.getProductVat).toHaveBeenCalledWith('ART-02');
  });

  test('deletes old articles and saves new ones', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    const queries = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string);
    expect(queries.some(q => q.includes('DELETE FROM agents.order_articles'))).toBe(true);
    expect(queries.some(q => q.includes('INSERT INTO agents.order_articles'))).toBe(true);
  });

  test('updates order totals with VAT amounts', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    const updateCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE agents.order_records') && (c[0] as string).includes('total_vat_amount'));
    expect(updateCalls).toHaveLength(1);
  });

  test('does not write total_amount and stores gross_amount, total_vat_amount, total_with_vat correctly', async () => {
    // ART-01: lineAmount=50, VAT=22% → vatAmount=11, lineTotalWithVat=61
    // ART-02: lineAmount=90, VAT=22% → vatAmount=19.8, lineTotalWithVat=109.8
    // grossAmount=140, totalVatAmount=30.8, totalWithVat=170.8
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    const updateCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('SET gross_amount'),
    );
    expect(updateCall).toBeDefined();
    const sql = updateCall![0] as string;
    const params = updateCall![1] as unknown[];
    // total_amount must not be written by this handler
    expect(sql).not.toContain('total_amount');
    // $1=gross_amount (Italian format), $2=total_vat_amount, $3=total_with_vat
    expect(params[0]).toBe('140,00'); // gross_amount in Italian format
    expect(params[1]).toBe('30.8');   // total_vat_amount
    expect(params[2]).toBe('170.8');  // total_with_vat
  });

  test('returns articles count and totals', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);

    const result = await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    expect(result.articlesCount).toBe(2);
    expect(typeof result.totalVatAmount).toBe('number');
    expect(typeof result.totalWithVat).toBe('number');
  });

  test('cleans up PDF file after sync', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    expect(deps.cleanupFile).toHaveBeenCalledWith('/tmp/articles.pdf');
  });

  test('cleans up PDF file even on error', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Parse failed'));

    await expect(
      handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn()),
    ).rejects.toThrow('Parse failed');

    expect(deps.cleanupFile).toHaveBeenCalledWith('/tmp/articles.pdf');
  });

  test('uses snapshot discount when snapshot exists', async () => {
    const queryFn = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'ORD-001', archibald_order_id: '71723' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          { article_code: 'ART-01', line_discount_percent: 34.85 },
          { article_code: 'ART-02', line_discount_percent: 15.62 },
        ],
        rowCount: 2,
      })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const pool: DbPool = {
      query: queryFn,
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    };

    const bot = createMockBot();
    const deps: SyncOrderArticlesDeps = {
      pool,
      bot,
      parsePdf: vi.fn().mockResolvedValue([
        { articleCode: 'ART-01', description: 'Widget', quantity: 5, unitPrice: 8.88, discountPercent: 34.84, lineAmount: 28.93 },
        { articleCode: 'ART-02', description: 'Gadget', quantity: 1, unitPrice: 25.97, discountPercent: 15.63, lineAmount: 21.91 },
      ]),
      getProductVat: vi.fn().mockResolvedValue(22),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
    };

    await handleSyncOrderArticles(deps, { orderId: 'ORD-001' }, 'user-1', vi.fn());

    const insertCall = queryFn.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.order_articles'),
    );
    expect(insertCall).toBeDefined();
    const insertValues = insertCall![1] as unknown[];
    // discount_percent is at index 6 (0-based) for first article, and 6+12=18 for second
    expect(insertValues[6]).toBe(34.85);
    expect(insertValues[18]).toBe(15.62);
  });

  test('applies 22% VAT for "Spese di trasporto K3" not found in product database', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps: SyncOrderArticlesDeps = {
      pool,
      bot,
      parsePdf: vi.fn().mockResolvedValue([
        { articleCode: 'Spese di trasporto K3', description: null, quantity: 1, unitPrice: 15.45, discountPercent: 0, lineAmount: 15.45 },
      ]),
      getProductVat: vi.fn().mockResolvedValue(null),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
    };

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    const insertCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.order_articles'),
    );
    expect(insertCall).toBeDefined();
    const insertValues = insertCall![1] as unknown[];
    // vat_percent is at index 8: order_id, user_id, article_code, description, quantity, unit_price, discount_percent, line_amount, vat_percent
    expect(insertValues[8]).toBe(22);
  });

  test('applies 0% VAT for unknown non-shipping article not found in product database', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps: SyncOrderArticlesDeps = {
      pool,
      bot,
      parsePdf: vi.fn().mockResolvedValue([
        { articleCode: 'ARTICOLO-SCONOSCIUTO', description: 'Articolo non in catalogo', quantity: 1, unitPrice: 50, discountPercent: 0, lineAmount: 50 },
      ]),
      getProductVat: vi.fn().mockResolvedValue(null),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
    };

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    const insertCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.order_articles'),
    );
    expect(insertCall).toBeDefined();
    const insertValues = insertCall![1] as unknown[];
    expect(insertValues[8]).toBe(0);
  });

  test('uses explicit 0% VAT when product is found with vat=0', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps: SyncOrderArticlesDeps = {
      pool,
      bot,
      parsePdf: vi.fn().mockResolvedValue([
        { articleCode: 'ART-EXEMPTED', description: 'Articolo esente IVA', quantity: 1, unitPrice: 100, discountPercent: 0, lineAmount: 100 },
      ]),
      getProductVat: vi.fn().mockResolvedValue(0),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
    };

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    const insertCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.order_articles'),
    );
    expect(insertCall).toBeDefined();
    const insertValues = insertCall![1] as unknown[];
    expect(insertValues[8]).toBe(0);
  });

  test('reports progress at key milestones', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);
    const onProgress = vi.fn();

    await handleSyncOrderArticles(deps, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  test('clears verification snapshot after successful sync', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    const clearCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        (c[0] as string).includes('UPDATE agents.order_verification_snapshots') &&
        (c[0] as string).includes("verification_status = 'verified'"),
    );
    expect(clearCalls).toHaveLength(1);
    expect(clearCalls[0][1]).toEqual(['ORD-001', 'user-1']);
  });

  test('preserves existing DB data when PDF returns 0 articles', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    expect(result).toEqual({ articlesCount: 0, totalVatAmount: 0, totalWithVat: 0 });

    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;

    const deleteCalls = allCalls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM agents.order_articles'),
    );
    expect(deleteCalls).toHaveLength(0);

    const totalUpdateCalls = allCalls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('total_with_vat'),
    );
    expect(totalUpdateCalls).toHaveLength(0);
  });

  test('only updates articles_synced_at when PDF returns 0 articles', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await handleSyncOrderArticles(deps, sampleData, 'user-1', vi.fn());

    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const syncAtCalls = allCalls.filter(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        (c[0] as string).includes('articles_synced_at') &&
        (c[0] as string).includes('last_sync') &&
        !(c[0] as string).includes('total_with_vat'),
    );
    expect(syncAtCalls).toHaveLength(1);
    expect(syncAtCalls[0][1][2]).toBe('ORD-001');
    expect(syncAtCalls[0][1][3]).toBe('user-1');
  });
});

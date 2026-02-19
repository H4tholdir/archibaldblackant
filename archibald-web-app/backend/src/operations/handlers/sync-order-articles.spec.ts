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
    getProductVat: vi.fn().mockReturnValue(22),
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

  test('reports progress at key milestones', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const deps = createMockDeps(pool, bot);
    const onProgress = vi.fn();

    await handleSyncOrderArticles(deps, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });
});

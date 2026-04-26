import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { logger } from '../../logger';

type ParsedArticle = {
  articleCode: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineAmount: number;
};

type SyncOrderArticlesData = {
  orderId: string;
};

type SyncOrderArticlesBot = {
  downloadOrderArticlesPDF: (archibaldOrderId: string) => Promise<string>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

type SyncOrderArticlesDeps = {
  pool: DbPool;
  bot: SyncOrderArticlesBot;
  parsePdf: (pdfPath: string) => Promise<ParsedArticle[]>;
  getProductVat: (articleCode: string) => number | null | Promise<number | null>;
  cleanupFile: (filePath: string) => Promise<void>;
  broadcast?: (userId: string, event: Record<string, unknown>) => void;
};

type SyncOrderArticlesResult = {
  articlesCount: number;
  totalVatAmount: number;
  totalWithVat: number;
};

async function handleSyncOrderArticles(
  deps: SyncOrderArticlesDeps,
  data: SyncOrderArticlesData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<SyncOrderArticlesResult> {
  const { pool, bot, parsePdf, getProductVat, cleanupFile, broadcast } = deps;

  onProgress(5, 'Recupero ordine');

  const { rows: [order] } = await pool.query<{ id: string; archibald_order_id: string | null }>(
    'SELECT id, archibald_order_id FROM agents.order_records WHERE id = $1 AND user_id = $2',
    [data.orderId, userId],
  );

  if (!order) {
    logger.warn('[sync-order-articles] Order not found, skipping', { orderId: data.orderId, userId });
    return { articlesCount: 0, totalVatAmount: 0, totalWithVat: 0 };
  }

  const archibaldOrderId = order.archibald_order_id ?? order.id;

  // Load snapshot discounts to replace reverse-engineered PDF values
  const { rows: snapshotRows } = await pool.query<{ article_code: string; line_discount_percent: number | null }>(
    `SELECT si.article_code, si.line_discount_percent
     FROM agents.order_verification_snapshot_items si
     JOIN agents.order_verification_snapshots s ON s.id = si.snapshot_id
     WHERE s.order_id = $1 AND s.user_id = $2`,
    [data.orderId, userId],
  );
  const snapshotDiscountMap = new Map<string, number>();
  for (const row of snapshotRows) {
    if (row.line_discount_percent !== null) {
      snapshotDiscountMap.set(row.article_code, row.line_discount_percent);
    }
  }

  onProgress(10, 'Download PDF articoli');
  const pdfPath = await bot.downloadOrderArticlesPDF(archibaldOrderId);

  try {
    onProgress(30, 'Lettura PDF');
    const parsedArticles = await parsePdf(pdfPath);

    onProgress(50, 'Arricchimento con IVA');
    const enrichedArticles = await Promise.all(
      parsedArticles.map(async (article) => {
        const rawVat = await getProductVat(article.articleCode);
        const vatPercent = rawVat ?? (/^spese di trasporto/i.test(article.articleCode) ? 22 : 0);
        const vatAmount = parseFloat((article.lineAmount * vatPercent / 100).toFixed(2));
        const lineTotalWithVat = parseFloat((article.lineAmount + vatAmount).toFixed(2));

        // Use original discount from snapshot if available (PDF reverse-engineering is imprecise)
        const discountPercent = snapshotDiscountMap.get(article.articleCode) ?? article.discountPercent;

        return {
          ...article,
          discountPercent,
          vatPercent,
          vatAmount,
          lineTotalWithVat,
        };
      }),
    );

    const grossAmount = parseFloat(
      enrichedArticles.reduce((sum, a) => sum + a.lineAmount, 0).toFixed(2),
    );
    const totalVatAmount = parseFloat(
      enrichedArticles.reduce((sum, a) => sum + a.vatAmount, 0).toFixed(2),
    );
    const totalWithVat = parseFloat(
      enrichedArticles.reduce((sum, a) => sum + a.lineTotalWithVat, 0).toFixed(2),
    );

    onProgress(70, 'Salvataggio articoli');

    // PDF returned no articles: transient ERP issue — preserve existing DB data
    if (enrichedArticles.length === 0) {
      logger.warn('[sync-order-articles] PDF returned 0 articles, preserving existing data', { orderId: data.orderId });
      await pool.query(
        `UPDATE agents.order_records SET articles_synced_at = $1, last_sync = $2 WHERE id = $3 AND user_id = $4`,
        [new Date().toISOString(), Math.floor(Date.now() / 1000), data.orderId, userId],
      );
      onProgress(100, 'Sincronizzazione articoli completata (0 articoli)');
      return { articlesCount: 0, totalVatAmount: 0, totalWithVat: 0 };
    }

    await pool.query(
      'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
      [data.orderId, userId],
    );

    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < enrichedArticles.length; i++) {
      const base = i * 12;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`,
      );
      const a = enrichedArticles[i];
      values.push(
        data.orderId, userId, a.articleCode, a.description,
        a.quantity, a.unitPrice, a.discountPercent, a.lineAmount,
        a.vatPercent, a.vatAmount, a.lineTotalWithVat,
        new Date().toISOString(),
      );
    }

    await pool.query(
      `INSERT INTO agents.order_articles (
        order_id, user_id, article_code, article_description, quantity,
        unit_price, discount_percent, line_amount, vat_percent, vat_amount,
        line_total_with_vat, created_at
      ) VALUES ${placeholders.join(', ')}`,
      values,
    );

    onProgress(90, 'Aggiornamento totali ordine');

    const articleSearchText = enrichedArticles
      .map(a => `${a.articleCode} ${a.description ?? ''}`.trim())
      .join(' | ');

    await pool.query(
      `UPDATE agents.order_records
       SET gross_amount = $1, total_vat_amount = $2, total_with_vat = $3,
           articles_synced_at = $4, last_sync = $5, article_search_text = $6
       WHERE id = $7 AND user_id = $8`,
      [grossAmount.toFixed(2).replace('.', ','), totalVatAmount.toString(), totalWithVat.toString(), new Date().toISOString(), Math.floor(Date.now() / 1000), articleSearchText, data.orderId, userId],
    );

    const { rows: [existingSnapshot] } = await pool.query<{ verification_status: string }>(
      `SELECT verification_status FROM agents.order_verification_snapshots WHERE order_id = $1 AND user_id = $2`,
      [data.orderId, userId],
    );
    const wasMismatch = existingSnapshot?.verification_status === 'mismatch_detected';

    await pool.query(
      `UPDATE agents.order_verification_snapshots
       SET verification_status = 'verified', verified_at = NOW(), verification_notes = NULL
       WHERE order_id = $1 AND user_id = $2`,
      [data.orderId, userId],
    );

    if (wasMismatch && broadcast) {
      broadcast(userId, {
        event: 'VERIFICATION_RESULT',
        orderId: data.orderId,
        status: 'verified',
        notification: null,
      });
    }

    onProgress(100, 'Sincronizzazione articoli completata');

    return { articlesCount: enrichedArticles.length, totalVatAmount, totalWithVat };
  } finally {
    await cleanupFile(pdfPath);
  }
}

function createSyncOrderArticlesHandler(deps: Omit<SyncOrderArticlesDeps, 'bot'>, createBot: (userId: string) => SyncOrderArticlesBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as SyncOrderArticlesData;
    const result = await handleSyncOrderArticles({ ...deps, bot }, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleSyncOrderArticles,
  createSyncOrderArticlesHandler,
  type SyncOrderArticlesData,
  type SyncOrderArticlesBot,
  type SyncOrderArticlesDeps,
  type SyncOrderArticlesResult,
  type ParsedArticle,
};

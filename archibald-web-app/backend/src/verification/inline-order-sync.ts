import type { DbPool } from '../db/pool';
import { logger } from '../logger';

type ParsedArticle = {
  articleCode: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineAmount: number;
};

type InlineSyncDeps = {
  pool: DbPool;
  downloadOrderArticlesPDF: (archibaldOrderId: string) => Promise<string>;
  parsePdf: (pdfPath: string) => Promise<ParsedArticle[]>;
  getProductVat: (articleCode: string) => Promise<number | null>;
  cleanupFile: (filePath: string) => Promise<void>;
};

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000];

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadWithRetry(
  downloadFn: (orderId: string) => Promise<string>,
  orderId: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await downloadFn(orderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('[InlineSync] PDF download failed', {
        orderId,
        attempt: attempt + 1,
        maxAttempts: RETRY_DELAYS_MS.length,
        error: message,
      });

      if (attempt < RETRY_DELAYS_MS.length - 1) {
        await delay(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  logger.warn('[InlineSync] All download attempts exhausted, falling back to scheduler', {
    orderId,
  });
  return null;
}

async function saveArticlesToDb(
  pool: DbPool,
  orderId: string,
  userId: string,
  enrichedArticles: Array<ParsedArticle & { vatPercent: number; vatAmount: number; lineTotalWithVat: number }>,
): Promise<void> {
  await pool.query(
    'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
    [orderId, userId],
  );

  if (enrichedArticles.length > 0) {
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < enrichedArticles.length; i++) {
      const base = i * 12;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`,
      );
      const a = enrichedArticles[i];
      values.push(
        orderId, userId, a.articleCode, a.description,
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
  }

  const totalVatAmount = parseFloat(
    enrichedArticles.reduce((sum, a) => sum + a.vatAmount, 0).toFixed(2),
  );
  const totalWithVat = parseFloat(
    enrichedArticles.reduce((sum, a) => sum + a.lineTotalWithVat, 0).toFixed(2),
  );
  const articleSearchText = enrichedArticles
    .map(a => `${a.articleCode} ${a.description ?? ''}`.trim())
    .join(' | ');

  await pool.query(
    `UPDATE agents.order_records
     SET total_vat_amount = $1, total_with_vat = $2, articles_synced_at = $3,
         last_sync = $4, article_search_text = $5
     WHERE id = $6 AND user_id = $7`,
    [
      totalVatAmount.toString(),
      totalWithVat.toString(),
      new Date().toISOString(),
      Math.floor(Date.now() / 1000),
      articleSearchText,
      orderId,
      userId,
    ],
  );
}

async function loadSnapshotDiscounts(
  pool: DbPool,
  orderId: string,
  userId: string,
): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ article_code: string; line_discount_percent: number | null }>(
    `SELECT si.article_code, si.line_discount_percent
     FROM agents.order_verification_snapshot_items si
     JOIN agents.order_verification_snapshots s ON s.id = si.snapshot_id
     WHERE s.order_id = $1 AND s.user_id = $2`,
    [orderId, userId],
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.line_discount_percent !== null) {
      map.set(row.article_code, row.line_discount_percent);
    }
  }
  return map;
}

async function performInlineOrderSync(
  deps: InlineSyncDeps,
  orderId: string,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<ParsedArticle[] | null> {
  const { pool, downloadOrderArticlesPDF, parsePdf, getProductVat, cleanupFile } = deps;

  onProgress(72, 'Sincronizzazione articoli...');

  // Wait for Archibald to finalize price recalculations after the N/A workaround saves
  await delay(5000);

  const pdfPath = await downloadWithRetry(downloadOrderArticlesPDF, orderId);
  if (!pdfPath) {
    return null;
  }

  try {
    onProgress(78, 'Analisi articoli...');
    const parsedArticles = await parsePdf(pdfPath);

    // Load snapshot discounts to replace reverse-engineered PDF values
    // (PDF may be captured before Archibald finishes recalculating after N/A workaround)
    const snapshotDiscountMap = await loadSnapshotDiscounts(pool, orderId, userId);

    const enrichedArticles = await Promise.all(
      parsedArticles.map(async (article) => {
        const rawVat = await getProductVat(article.articleCode);
        const vatPercent = rawVat ?? (/^spese di trasporto/i.test(article.articleCode) ? 22 : 0);
        const vatAmount = parseFloat((article.lineAmount * vatPercent / 100).toFixed(2));
        const lineTotalWithVat = parseFloat((article.lineAmount + vatAmount).toFixed(2));

        const discountPercent = snapshotDiscountMap.get(article.articleCode) ?? article.discountPercent;

        return { ...article, discountPercent, vatPercent, vatAmount, lineTotalWithVat };
      }),
    );

    await saveArticlesToDb(pool, orderId, userId, enrichedArticles);

    onProgress(84, 'Articoli sincronizzati');

    // Return articles with snapshot discount override for verification
    return parsedArticles.map(a => ({
      ...a,
      discountPercent: snapshotDiscountMap.get(a.articleCode) ?? a.discountPercent,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('[InlineSync] Sync failed after PDF download', {
      orderId,
      error: message,
    });
    return null;
  } finally {
    await cleanupFile(pdfPath);
  }
}

export { performInlineOrderSync, type InlineSyncDeps, type ParsedArticle };

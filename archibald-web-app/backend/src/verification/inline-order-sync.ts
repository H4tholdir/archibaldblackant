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
  type WarehouseSnapshot = {
    article_code: string;
    article_description: string | null;
    quantity: string;
    unit_price: string;
    discount_percent: string | null;
    line_amount: string;
    warehouse_quantity: string;
    warehouse_sources_json: unknown;
    vat_percent: string | null;
    vat_amount: string | null;
    line_total_with_vat: string | null;
    is_ghost: boolean;
  };

  const { rows: warehouseSnapshot } = await pool.query<WarehouseSnapshot>(
    `SELECT article_code, article_description, quantity, unit_price, discount_percent,
            line_amount, warehouse_quantity, warehouse_sources_json, vat_percent, vat_amount,
            line_total_with_vat, is_ghost
     FROM agents.order_articles
     WHERE order_id = $1 AND user_id = $2 AND warehouse_quantity > 0`,
    [orderId, userId],
  );

  const erpArticleCodes = new Set(enrichedArticles.map(a => a.articleCode));

  type WarehouseInfo = { quantity: number; sourcesJson: unknown };
  const warehouseInfoMap = new Map<string, WarehouseInfo>(
    warehouseSnapshot.map(r => [r.article_code, {
      quantity: parseFloat(r.warehouse_quantity),
      sourcesJson: r.warehouse_sources_json,
    }]),
  );

  const warehouseOnlyRows = warehouseSnapshot.filter(r => !erpArticleCodes.has(r.article_code));

  await pool.query(
    'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
    [orderId, userId],
  );

  const now = new Date().toISOString();

  if (enrichedArticles.length > 0) {
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < enrichedArticles.length; i++) {
      const base = i * 15;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15})`,
      );
      const a = enrichedArticles[i];
      const whInfo = warehouseInfoMap.get(a.articleCode);
      values.push(
        orderId, userId, a.articleCode, a.description,
        a.quantity, a.unitPrice, a.discountPercent, a.lineAmount,
        whInfo?.quantity ?? 0, whInfo?.sourcesJson ?? null,
        now, a.vatPercent, a.vatAmount, a.lineTotalWithVat, false,
      );
    }

    await pool.query(
      `INSERT INTO agents.order_articles (
        order_id, user_id, article_code, article_description, quantity,
        unit_price, discount_percent, line_amount, warehouse_quantity, warehouse_sources_json,
        created_at, vat_percent, vat_amount, line_total_with_vat, is_ghost
      ) VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  if (warehouseOnlyRows.length > 0) {
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < warehouseOnlyRows.length; i++) {
      const base = i * 15;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15})`,
      );
      const r = warehouseOnlyRows[i];
      values.push(
        orderId, userId, r.article_code, r.article_description,
        parseFloat(r.quantity), parseFloat(r.unit_price),
        r.discount_percent !== null ? parseFloat(r.discount_percent) : null,
        parseFloat(r.line_amount),
        parseFloat(r.warehouse_quantity), r.warehouse_sources_json,
        now,
        r.vat_percent !== null ? parseFloat(r.vat_percent) : 0,
        r.vat_amount !== null ? parseFloat(r.vat_amount) : 0,
        r.line_total_with_vat !== null ? parseFloat(r.line_total_with_vat) : parseFloat(r.line_amount),
        r.is_ghost,
      );
    }

    await pool.query(
      `INSERT INTO agents.order_articles (
        order_id, user_id, article_code, article_description, quantity,
        unit_price, discount_percent, line_amount, warehouse_quantity, warehouse_sources_json,
        created_at, vat_percent, vat_amount, line_total_with_vat, is_ghost
      ) VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  const allArticles = [
    ...enrichedArticles.map(a => ({ articleCode: a.articleCode, description: a.description })),
    ...warehouseOnlyRows.map(r => ({ articleCode: r.article_code, description: r.article_description })),
  ];

  const grossAmount = parseFloat(
    enrichedArticles.reduce((sum, a) => sum + a.lineAmount, 0).toFixed(2),
  );
  const totalVatAmount = parseFloat(
    enrichedArticles.reduce((sum, a) => sum + a.vatAmount, 0).toFixed(2),
  );
  const totalWithVat = parseFloat(
    enrichedArticles.reduce((sum, a) => sum + a.lineTotalWithVat, 0).toFixed(2),
  );
  const articleSearchText = allArticles
    .map(a => `${a.articleCode} ${a.description ?? ''}`.trim())
    .join(' | ');

  await pool.query(
    `UPDATE agents.order_records
     SET gross_amount = $1, total_vat_amount = $2, total_with_vat = $3,
         articles_synced_at = $4, last_sync = $5, article_search_text = $6
     WHERE id = $7 AND user_id = $8`,
    [
      grossAmount.toFixed(2).replace('.', ','),
      totalVatAmount.toString(),
      totalWithVat.toString(),
      now,
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

export { performInlineOrderSync, saveArticlesToDb, type InlineSyncDeps, type ParsedArticle };

import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { buildOrderNotesText } from '../../utils/order-notes';
import type { InlineSyncDeps } from '../../verification/inline-order-sync';
import { performInlineOrderSync } from '../../verification/inline-order-sync';
import type { SnapshotArticle, VerificationResult } from '../../verification/verify-order-articles';
import { verifyOrderArticles } from '../../verification/verify-order-articles';
import { formatVerificationNotification } from '../../verification/format-notification';
import { logger } from '../../logger';

type EditOrderArticle = {
  articleCode: string;
  articleDescription?: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  lineAmount?: number;
  vatPercent?: number;
  vatAmount?: number;
  lineTotalWithVat?: number;
};

type EditOrderData = {
  orderId: string;
  modifications: Array<Record<string, unknown>>;
  updatedItems?: EditOrderArticle[];
  notes?: string;
  noShipping?: boolean;
};

type EditOrderBot = {
  editOrderInArchibald: (
    orderId: string,
    modifications: Array<Record<string, unknown>>,
    notes?: string,
    noShipping?: boolean,
  ) => Promise<{ success: boolean; message: string }>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

const BOT_PROGRESS_MAP: Record<string, { progress: number; label: string }> = {
  'edit.navigation': { progress: 10, label: 'Apertura sezione ordini' },
  'edit.filter': { progress: 15, label: 'Impostazione filtro' },
  'edit.search': { progress: 25, label: 'Ricerca ordine' },
  'edit.open': { progress: 35, label: 'Apertura ordine' },
  'edit.save': { progress: 80, label: 'Salvataggio ordine' },
  'edit.complete': { progress: 85, label: 'Ordine modificato' },
};

function calculateEditModifyProgress(current: number, total: number): number {
  const start = 40;
  const end = 75;
  if (total <= 1) return start;
  return Math.round(start + ((current - 1) / (total - 1)) * (end - start));
}

async function handleEditOrder(
  pool: DbPool,
  bot: EditOrderBot,
  data: EditOrderData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  inlineSyncDeps?: InlineSyncDeps,
  broadcast?: (userId: string, event: Record<string, unknown>) => void,
): Promise<{ success: boolean; message: string; verificationStatus?: string }> {
  bot.setProgressCallback(async (category, metadata) => {
    if (category === 'edit.modify' && metadata) {
      const current = metadata.current as number;
      const total = metadata.total as number;
      const progress = calculateEditModifyProgress(current, total);
      onProgress(progress, `Modifica articolo ${current} di ${total}`);
    } else {
      const mapped = BOT_PROGRESS_MAP[category];
      if (mapped) {
        onProgress(mapped.progress, mapped.label);
      }
    }
  });

  onProgress(5, 'Modifica ordine su Archibald');
  const result = await bot.editOrderInArchibald(data.orderId, data.modifications, data.notes, data.noShipping);

  if (!result.success) {
    throw new Error(result.message);
  }

  if (data.updatedItems && data.updatedItems.length > 0) {
    onProgress(90, 'Aggiornamento articoli nel database');

    const itemsToUpdate = data.updatedItems;
    await pool.withTransaction(async (tx) => {
      await tx.query(
        'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
        [data.orderId, userId],
      );

      const values: unknown[] = [];
      const placeholders: string[] = [];

      const editNow = new Date().toISOString();
      for (let i = 0; i < itemsToUpdate.length; i++) {
        const base = i * 12;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`,
        );
        const item = itemsToUpdate[i];
        values.push(
          data.orderId,
          userId,
          item.articleCode,
          item.articleDescription ?? item.productName ?? null,
          item.quantity,
          item.unitPrice,
          item.discountPercent ?? 0,
          item.lineAmount ?? 0,
          item.vatPercent ?? 0,
          item.vatAmount ?? 0,
          item.lineTotalWithVat ?? 0,
          editNow,
        );
      }

      await tx.query(
        `INSERT INTO agents.order_articles (
          order_id, user_id, article_code, article_description, quantity,
          unit_price, discount_percent, line_amount, vat_percent, vat_amount,
          line_total_with_vat, created_at
        ) VALUES ${placeholders.join(', ')}`,
        values,
      );

      const articleSearchText = itemsToUpdate
        .map(item => `${item.articleCode} ${item.articleDescription ?? item.productName ?? ''}`.trim())
        .join(' | ');

      await tx.query(
        'UPDATE agents.order_records SET article_search_text = $1 WHERE id = $2 AND user_id = $3',
        [articleSearchText, data.orderId, userId],
      );

      await tx.query(
        `UPDATE agents.order_records
         SET gross_amount = (SELECT COALESCE(SUM(line_amount), 0) FROM agents.order_articles WHERE order_id = $1 AND user_id = $2),
             total_vat_amount = (SELECT COALESCE(SUM(vat_amount), 0) FROM agents.order_articles WHERE order_id = $1 AND user_id = $2),
             total_with_vat = (SELECT COALESCE(SUM(line_total_with_vat), 0) FROM agents.order_articles WHERE order_id = $1 AND user_id = $2)
         WHERE id = $1 AND user_id = $2`,
        [data.orderId, userId],
      );
    });
  }

  if (data.notes !== undefined || data.noShipping !== undefined) {
    const notesText = buildOrderNotesText(data.noShipping, data.notes) || null;
    await pool.query(
      'UPDATE agents.order_records SET notes = $1 WHERE id = $2 AND user_id = $3',
      [notesText, data.orderId, userId],
    );
  }

  let verificationStatus: string | undefined;

  if (data.updatedItems && data.updatedItems.length > 0 && inlineSyncDeps) {
    try {
      onProgress(85, 'Verifica modifica su Archibald...');
      const verifyOnProgress = (p: number, l?: string) => onProgress(Math.max(85, p), l);
      const syncedArticles = await performInlineOrderSync(
        inlineSyncDeps,
        data.orderId,
        userId,
        verifyOnProgress,
      );

      if (syncedArticles) {
        const expectedItems: SnapshotArticle[] = data.updatedItems.map(item => ({
          articleCode: item.articleCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineDiscountPercent: item.discountPercent ?? 0,
          expectedLineAmount: item.lineAmount ?? 0,
        }));

        const verificationResult: VerificationResult = verifyOrderArticles(expectedItems, syncedArticles);
        verificationStatus = verificationResult.status;

        const verificationNotes = verificationResult.mismatches.length > 0 ? JSON.stringify(verificationResult.mismatches) : null;
        await pool.query(
          `INSERT INTO agents.order_verification_snapshots (order_id, user_id, expected_gross_amount, expected_total_amount, verification_status, verified_at, verification_notes)
           VALUES ($1, $2, 0, 0, $3, NOW(), $4)
           ON CONFLICT (order_id, user_id) DO UPDATE SET
             verification_status = EXCLUDED.verification_status,
             verified_at = NOW(),
             verification_notes = EXCLUDED.verification_notes`,
          [data.orderId, userId, verificationResult.status, verificationNotes],
        );

        if (broadcast) {
          const notification = formatVerificationNotification(verificationResult.status, verificationResult.mismatches);
          broadcast(userId, {
            event: 'VERIFICATION_RESULT',
            orderId: data.orderId,
            status: verificationResult.status,
            notification,
          });
        }

        logger.info('[editOrder] Verification complete', {
          orderId: data.orderId,
          status: verificationResult.status,
          mismatches: verificationResult.mismatches.length,
        });
      }
    } catch (err) {
      logger.warn('[editOrder] Inline verification failed, skipping', {
        orderId: data.orderId,
        error: err instanceof Error ? err.message : String(err),
      });
      onProgress(95, 'Verifica posticipata');
    }
  }

  onProgress(100, 'Modifica completata');

  if (broadcast) {
    broadcast(userId, { event: 'ORDER_EDIT_COMPLETE', orderId: data.orderId });
  }

  return { success: true, message: result.message, verificationStatus };
}

function createEditOrderHandler(
  pool: DbPool,
  createBot: (userId: string) => EditOrderBot,
  inlineSyncDeps?: Omit<InlineSyncDeps, 'pool'>,
  broadcast?: (userId: string, event: Record<string, unknown>) => void,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as EditOrderData;
    const fullDeps: InlineSyncDeps | undefined = inlineSyncDeps ? { pool, ...inlineSyncDeps } : undefined;
    const result = await handleEditOrder(pool, bot, typedData, userId, onProgress, fullDeps, broadcast);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleEditOrder, createEditOrderHandler, calculateEditModifyProgress, type EditOrderData, type EditOrderBot, type EditOrderArticle };

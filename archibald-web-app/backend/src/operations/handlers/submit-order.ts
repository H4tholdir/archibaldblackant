import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { InlineSyncDeps } from '../../verification/inline-order-sync';
import type { AutoCorrectionDeps } from '../../verification/auto-correction';
import { saveOrderVerificationSnapshot, getOrderVerificationSnapshot, updateVerificationStatus } from '../../db/repositories/order-verification';
import type { VerificationStatus } from '../../db/repositories/order-verification';
import { performInlineOrderSync } from '../../verification/inline-order-sync';
import { verifyOrderArticles } from '../../verification/verify-order-articles';
import type { ArticleMismatch } from '../../verification/verify-order-articles';
import { performAutoCorrection } from '../../verification/auto-correction';
import { formatVerificationNotification } from '../../verification/format-notification';
import type { VerificationNotification } from '../../verification/format-notification';
import { batchTransfer } from '../../db/repositories/warehouse';
import { logger } from '../../logger';

type SubmitOrderItem = {
  articleCode: string;
  productName?: string;
  description?: string;
  quantity: number;
  price: number;
  discount?: number;
  vat?: number;
  warehouseQuantity?: number;
  warehouseSources?: Array<{ warehouseItemId: number; boxName: string; quantity: number }>;
};

type SubmitOrderData = {
  pendingOrderId: string;
  customerId: string;
  customerName: string;
  items: SubmitOrderItem[];
  discountPercent?: number;
  targetTotalWithVAT?: number;
};

type SubmitOrderBot = {
  createOrder: (orderData: SubmitOrderData) => Promise<string>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

function calculateAmounts(
  items: SubmitOrderItem[],
  discountPercent?: number,
): { grossAmount: number; total: number } {
  const grossAmount = items.reduce((sum, item) => {
    const lineAmount = item.price * item.quantity * (1 - (item.discount || 0) / 100);
    return sum + lineAmount;
  }, 0);

  const total = discountPercent
    ? grossAmount * (1 - discountPercent / 100)
    : grossAmount;

  return { grossAmount, total };
}

const BOT_PROGRESS_MAP: Record<string, { progress: number; label: string }> = {
  'navigation.ordini': { progress: 7, label: 'Apertura sezione ordini' },
  'form.nuovo': { progress: 11, label: 'Apertura nuovo ordine' },
  'form.customer': { progress: 18, label: 'Inserimento cliente' },
  'form.articles.start': { progress: 21, label: 'Inizio inserimento articoli' },
  'form.articles.complete': { progress: 46, label: 'Articoli inseriti' },
  'form.discount': { progress: 49, label: 'Applicazione sconto globale' },
  'form.submit.start': { progress: 53, label: 'Salvataggio ordine in corso' },
  'form.submit.complete': { progress: 56, label: 'Ordine salvato' },
};

function calculateArticleProgress(current: number, total: number): number {
  const start = 21;
  const end = 46;
  return Math.round(start + (end - start) * (current / total));
}

function formatLabel(template: string, metadata?: Record<string, unknown>): string {
  if (!metadata) return template;
  let result = template;
  for (const [key, value] of Object.entries(metadata)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
}

type BroadcastVerificationFn = (orderId: string, notification: VerificationNotification) => void;

function emitVerificationNotification(
  broadcastVerification: BroadcastVerificationFn | undefined,
  orderId: string,
  status: VerificationStatus,
  mismatches: ArticleMismatch[],
): void {
  if (!broadcastVerification) {
    logger.warn('[SubmitOrder] broadcastVerification not available', { orderId });
    return;
  }
  try {
    const notification = formatVerificationNotification(status, mismatches);
    if (notification) {
      logger.info('[SubmitOrder] Emitting VERIFICATION_RESULT', {
        orderId, status, itemCount: notification.items.length,
      });
      broadcastVerification(orderId, notification);
    }
  } catch (error) {
    logger.warn('[SubmitOrder] Failed to emit verification notification', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleSubmitOrder(
  pool: DbPool,
  bot: SubmitOrderBot,
  data: SubmitOrderData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  inlineSyncDeps?: InlineSyncDeps,
  autoCorrectionDeps?: AutoCorrectionDeps,
  broadcastVerification?: BroadcastVerificationFn,
): Promise<{ orderId: string; verificationStatus?: string }> {
  bot.setProgressCallback(async (category, metadata) => {
    if (category === 'form.articles.progress' && metadata) {
      const current = metadata.currentArticle as number;
      const total = metadata.totalArticles as number;
      if (current && total) {
        const progress = calculateArticleProgress(current, total);
        const label = formatLabel('Inserimento articolo {currentArticle} di {totalArticles}', metadata);
        onProgress(progress, label);
        return;
      }
    }
    const mapped = BOT_PROGRESS_MAP[category];
    if (mapped) {
      onProgress(mapped.progress, mapped.label);
    }
  });

  onProgress(4, 'Creazione ordine su Archibald');
  const orderId = await bot.createOrder(data);

  onProgress(60, 'Salvataggio nel database');

  const { grossAmount, total } = calculateAmounts(data.items, data.discountPercent);

  const isWarehouseOnly = orderId.startsWith('warehouse-');
  const now = new Date().toISOString();

  await pool.withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO agents.order_records (
        id, user_id, order_number, customer_profile_id, customer_name,
        delivery_name, delivery_address, creation_date, delivery_date,
        remaining_sales_financial, customer_reference, sales_status,
        order_type, document_status, sales_origin, transfer_status,
        transfer_date, completion_date, discount_percent, gross_amount,
        total_amount, hash, last_sync, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      ON CONFLICT (id, user_id) DO UPDATE SET
        order_number = EXCLUDED.order_number,
        gross_amount = EXCLUDED.gross_amount,
        total_amount = EXCLUDED.total_amount,
        last_sync = EXCLUDED.last_sync`,
      [
        orderId,
        userId,
        isWarehouseOnly ? orderId : `PENDING-${orderId}`,
        data.customerId,
        data.customerName,
        null, // deliveryName
        null, // deliveryAddress
        now,  // creationDate
        null, // deliveryDate
        null, // remainingSalesFinancial
        null, // customerReference
        isWarehouseOnly ? 'WAREHOUSE_FULFILLED' : null,
        isWarehouseOnly ? 'Warehouse' : 'Giornale',
        null, // documentState
        isWarehouseOnly ? 'PWA' : 'Agent',
        isWarehouseOnly ? null : 'Modifica',
        null, // transferDate
        null, // completionDate
        data.discountPercent?.toString() ?? null,
        grossAmount.toFixed(2),
        total.toFixed(2),
        '', // hash
        Math.floor(Date.now() / 1000),
        now,
      ],
    );

    onProgress(63, 'Salvataggio articoli');

    const articleValues: unknown[] = [];
    const articlePlaceholders: string[] = [];

    for (let i = 0; i < data.items.length; i++) {
      const base = i * 14;
      articlePlaceholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14})`,
      );
      const item = data.items[i];
      const lineAmount = item.price * item.quantity * (1 - (item.discount || 0) / 100);
      const vatPercent = item.vat ?? 0;
      const vatAmount = lineAmount * vatPercent / 100;
      const lineTotalWithVat = lineAmount + vatAmount;
      articleValues.push(
        orderId,
        userId,
        item.articleCode,
        item.description ?? item.productName ?? null,
        item.quantity,
        item.price,
        item.discount ?? null,
        lineAmount,
        item.warehouseQuantity ?? 0,
        item.warehouseSources ? JSON.stringify(item.warehouseSources) : null,
        now,
        vatPercent,
        vatAmount,
        lineTotalWithVat,
      );
    }

    if (articlePlaceholders.length > 0) {
      await tx.query(
        `INSERT INTO agents.order_articles (
          order_id, user_id, article_code, article_description, quantity,
          unit_price, discount_percent, line_amount, warehouse_quantity, warehouse_sources_json, created_at,
          vat_percent, vat_amount, line_total_with_vat
        ) VALUES ${articlePlaceholders.join(', ')}`,
        articleValues,
      );

      const articleSearchText = data.items
        .map(item => `${item.articleCode} ${item.description ?? item.productName ?? ''}`.trim())
        .join(' | ');

      await tx.query(
        'UPDATE agents.order_records SET article_search_text = $1 WHERE id = $2 AND user_id = $3',
        [articleSearchText, orderId, userId],
      );
    }

    if (!isWarehouseOnly) {
      const kometItems = data.items.filter(item => {
        const whQty = item.warehouseQuantity ?? 0;
        return whQty === 0 || whQty < item.quantity;
      }).map(item => {
        const whQty = item.warehouseQuantity ?? 0;
        const kometQty = whQty > 0 ? item.quantity - whQty : item.quantity;
        return { ...item, quantity: kometQty };
      });

      const { grossAmount: kometGross, total: kometTotal } = calculateAmounts(kometItems, data.discountPercent);

      await saveOrderVerificationSnapshot(tx, orderId, userId, {
        globalDiscountPercent: data.discountPercent,
        expectedGrossAmount: kometGross,
        expectedTotalAmount: kometTotal,
        items: kometItems.map(item => ({
          articleCode: item.articleCode,
          articleDescription: item.description ?? item.productName ?? null,
          quantity: item.quantity,
          unitPrice: item.price,
          lineDiscountPercent: item.discount ?? null,
          expectedLineAmount: item.price * item.quantity * (1 - (item.discount || 0) / 100),
        })),
      });
    }

    onProgress(67, 'Aggiornamento storico');

    await tx.query(
      `UPDATE agents.fresis_history
       SET archibald_order_id = $1, current_state = 'piazzato', state_updated_at = $2, updated_at = $2
       WHERE user_id = $3 AND merged_into_order_id = $4 AND archibald_order_id IS NULL`,
      [orderId, now, userId, data.pendingOrderId],
    );

  });

  if (!isWarehouseOnly) {
    try {
      const transferred = await batchTransfer(pool, userId, [`pending-${data.pendingOrderId}`], orderId);
      logger.info('[SubmitOrder] Warehouse reservations transferred to Archibald order', {
        orderId, pendingOrderId: data.pendingOrderId, transferred,
      });
    } catch (error) {
      logger.warn('[SubmitOrder] Failed to transfer warehouse reservations', {
        orderId, pendingOrderId: data.pendingOrderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let verificationStatus: string | undefined;
  let verificationPassed = true;

  if (!isWarehouseOnly && inlineSyncDeps) {
    try {
      onProgress(70, 'Sincronizzazione articoli da Archibald...');
      const syncedArticles = await performInlineOrderSync(
        inlineSyncDeps, orderId, userId, onProgress,
      );

      if (syncedArticles) {
        onProgress(87, 'Verifica ordine in corso...');
        const snapshot = await getOrderVerificationSnapshot(inlineSyncDeps.pool, orderId, userId);
        if (snapshot) {
          const result = verifyOrderArticles(snapshot.items, syncedArticles);

          await updateVerificationStatus(
            inlineSyncDeps.pool, orderId, userId,
            result.status,
            result.mismatches.length > 0 ? JSON.stringify(result.mismatches) : null,
          );

          verificationStatus = result.status;

          if (result.status === 'mismatch_detected' && autoCorrectionDeps) {
            const correctionResult = await performAutoCorrection(
              autoCorrectionDeps,
              orderId, userId,
              result.mismatches,
              snapshot.items,
              syncedArticles,
              onProgress,
            );

            verificationStatus = correctionResult.status;

            if (correctionResult.status === 'auto_corrected') {
              await updateVerificationStatus(
                inlineSyncDeps.pool, orderId, userId,
                correctionResult.status,
                correctionResult.details,
              );
              onProgress(99, 'Ordine corretto e verificato');
            } else {
              const parsedDetails = correctionResult.details ? JSON.parse(correctionResult.details) : null;
              const failedMismatches = Array.isArray(parsedDetails?.remainingMismatches)
                ? parsedDetails.remainingMismatches
                : result.mismatches;
              await updateVerificationStatus(
                inlineSyncDeps.pool, orderId, userId,
                correctionResult.status,
                JSON.stringify(failedMismatches),
              );
              verificationPassed = false;
              onProgress(99, 'Correzione non riuscita - intervento necessario');
              emitVerificationNotification(
                broadcastVerification, orderId,
                correctionResult.status as VerificationStatus,
                failedMismatches,
              );
            }
          } else {
            onProgress(95, result.status === 'verified'
              ? 'Ordine verificato correttamente'
              : 'Discrepanze rilevate nell\'ordine');
            if (result.status === 'mismatch_detected') {
              verificationPassed = false;
              emitVerificationNotification(
                broadcastVerification, orderId,
                result.status, result.mismatches,
              );
            }
          }
        }
      } else {
        onProgress(95, 'Verifica posticipata');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('[SubmitOrder] Inline verification failed, continuing', {
        orderId,
        error: message,
      });
      onProgress(95, 'Verifica posticipata');
    }
  }

  if (verificationPassed) {
    await pool.query('DELETE FROM agents.pending_orders WHERE id = $1', [data.pendingOrderId]);
    onProgress(100, 'Ordine completato');
  } else {
    await pool.query(
      `UPDATE agents.pending_orders
       SET status = 'error', error_message = $1, archibald_order_id = $2, updated_at = $3
       WHERE id = $4`,
      ['Discrepanze rilevate nell\'ordine - verifica necessaria', orderId, Date.now(), data.pendingOrderId],
    );
    onProgress(100, 'Ordine creato con discrepanze');
  }

  return { orderId, verificationStatus };
}

type AutoCorrectionDepsWithoutPool = Omit<AutoCorrectionDeps, 'pool' | 'inlineSyncDeps'>;

type SubmitOrderBroadcast = (userId: string, event: Record<string, unknown>) => void;

function createSubmitOrderHandler(
  pool: DbPool,
  createBot: (userId: string) => SubmitOrderBot,
  inlineSyncDeps?: Omit<InlineSyncDeps, 'pool'>,
  autoCorrectionDepsPartial?: AutoCorrectionDepsWithoutPool,
  broadcast?: SubmitOrderBroadcast,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as SubmitOrderData;
    const deps = inlineSyncDeps ? { ...inlineSyncDeps, pool } : undefined;
    const correctionDeps = deps && autoCorrectionDepsPartial
      ? { ...autoCorrectionDepsPartial, pool, inlineSyncDeps: deps }
      : undefined;
    const broadcastVerification: BroadcastVerificationFn | undefined = broadcast
      ? (orderId, notification) => broadcast(userId, {
          event: 'VERIFICATION_RESULT',
          orderId,
          notification,
        })
      : undefined;
    const result = await handleSubmitOrder(pool, bot, typedData, userId, onProgress, deps, correctionDeps, broadcastVerification);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSubmitOrder, createSubmitOrderHandler, calculateAmounts, type SubmitOrderData, type SubmitOrderBot, type SubmitOrderItem };
export type { InlineSyncDeps } from '../../verification/inline-order-sync';
export type { AutoCorrectionDeps } from '../../verification/auto-correction';

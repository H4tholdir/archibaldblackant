import { createHash } from 'node:crypto';
import { copyFile } from 'node:fs/promises';
import type { DbPool } from '../../db/pool';
import { batchMarkSold, batchRelease, batchReturnSold } from '../../db/repositories/warehouse';
import { logger } from '../../logger';
import { SyncStoppedError } from './customer-sync';

type ParsedOrder = {
  id: string;
  orderNumber: string;
  customerAccountNum?: string;
  customerName: string;
  date: string;
  deliveryDate?: string;
  status?: string;
  orderType?: string;
  documentState?: string;
  salesOrigin?: string;
  transferStatus?: string;
  transferDate?: string;
  completionDate?: string;
  isQuote?: string;
  discountPercent?: string;
  grossAmount?: string;
  total?: string;
  isGiftOrder?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  orderDescription?: string;
  customerReference?: string;
  email?: string;
};

type OrderSyncDeps = {
  pool: DbPool;
  downloadPdf: (userId: string) => Promise<string>;
  parsePdf: (pdfPath: string) => Promise<ParsedOrder[]>;
  cleanupFile: (filePath: string) => Promise<void>;
};

type OrderSyncResult = {
  success: boolean;
  ordersProcessed: number;
  ordersInserted: number;
  ordersUpdated: number;
  ordersSkipped: number;
  ordersDeleted: number;
  duration: number;
  error?: string;
};

async function syncOrders(
  deps: OrderSyncDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  shouldStop: () => boolean,
): Promise<OrderSyncResult> {
  const { pool, downloadPdf, parsePdf, cleanupFile } = deps;
  const startTime = Date.now();
  let pdfPath: string | null = null;

  try {
    if (shouldStop()) throw new SyncStoppedError('start');

    onProgress(5, 'Download PDF ordini');
    pdfPath = await downloadPdf(userId);
    await copyFile(pdfPath, '/app/data/debug-ordini.pdf').catch(() => {});

    if (shouldStop()) throw new SyncStoppedError('download');

    onProgress(20, 'Lettura PDF');
    const parsedOrders = await parsePdf(pdfPath);

    if (shouldStop()) throw new SyncStoppedError('parse');

    onProgress(40, `Aggiornamento ${parsedOrders.length} ordini`);

    let ordersInserted = 0;
    let ordersUpdated = 0;
    let ordersSkipped = 0;
    const now = Math.floor(Date.now() / 1000);
    const preservedIds = new Set<string>();

    const computeHash = (o: ParsedOrder) =>
      [
        o.id, o.orderNumber, o.customerAccountNum, o.customerName,
        o.date, o.deliveryDate, o.status, o.orderType, o.documentState,
        o.salesOrigin, o.transferStatus, o.transferDate, o.completionDate,
        o.isQuote, o.discountPercent, o.grossAmount, o.total,
        o.isGiftOrder, o.deliveryName, o.deliveryAddress,
        o.orderDescription, o.customerReference, o.email,
      ].join('|');

    for (const order of parsedOrders) {
      const hash = createHash('md5').update(computeHash(order)).digest('hex');

      const { rows: [existing] } = await pool.query<{ hash: string; order_number: string; transfer_status: string | null }>(
        'SELECT hash, order_number, transfer_status FROM agents.order_records WHERE id = $1 AND user_id = $2',
        [order.id, userId],
      );

      if (!existing) {
        const { rows: [upserted] } = await pool.query<{ id: string; was_inserted: boolean }>(
          `INSERT INTO agents.order_records (
            id, user_id, order_number, customer_account_num, customer_name,
            delivery_name, delivery_address, creation_date, delivery_date,
            order_description, customer_reference, sales_status,
            order_type, document_status, sales_origin, transfer_status,
            transfer_date, completion_date, is_quote, discount_percent, gross_amount,
            total_amount, is_gift_order, hash, last_sync, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
          ON CONFLICT (order_number, user_id) DO UPDATE SET
            customer_account_num = EXCLUDED.customer_account_num,
            customer_name = EXCLUDED.customer_name,
            delivery_name = EXCLUDED.delivery_name,
            delivery_address = EXCLUDED.delivery_address,
            creation_date = EXCLUDED.creation_date,
            delivery_date = EXCLUDED.delivery_date,
            order_description = EXCLUDED.order_description,
            customer_reference = EXCLUDED.customer_reference,
            sales_status = EXCLUDED.sales_status,
            order_type = EXCLUDED.order_type,
            document_status = EXCLUDED.document_status,
            sales_origin = EXCLUDED.sales_origin,
            transfer_status = EXCLUDED.transfer_status,
            transfer_date = EXCLUDED.transfer_date,
            completion_date = EXCLUDED.completion_date,
            discount_percent = EXCLUDED.discount_percent,
            gross_amount = EXCLUDED.gross_amount,
            total_amount = EXCLUDED.total_amount,
            is_quote = EXCLUDED.is_quote,
            is_gift_order = EXCLUDED.is_gift_order,
            hash = EXCLUDED.hash,
            last_sync = EXCLUDED.last_sync
          RETURNING id, (xmax = 0) AS was_inserted`,
          [
            order.id, userId, order.orderNumber, order.customerAccountNum ?? null, order.customerName,
            order.deliveryName ?? null, order.deliveryAddress ?? null, order.date, order.deliveryDate ?? null,
            order.orderDescription ?? null, order.customerReference ?? null, order.status ?? null,
            order.orderType ?? null, order.documentState ?? null, order.salesOrigin ?? null, order.transferStatus ?? null,
            order.transferDate ?? null, order.completionDate ?? null, order.isQuote ?? null, order.discountPercent ?? null, order.grossAmount ?? null,
            order.total ?? null, order.isGiftOrder ?? null, hash, now, new Date().toISOString(),
          ],
        );
        if (upserted.was_inserted) {
          ordersInserted++;
          const isRecentOrder = order.customerAccountNum && new Date(order.date) > new Date(Date.now() - 7 * 86400000);
          if (isRecentOrder) {
            await pool.query(
              `UPDATE agents.customer_reminders
               SET status = 'done', completed_at = NOW(), updated_at = NOW()
               WHERE user_id = $2
                 AND source = 'auto'
                 AND status NOT IN ('done', 'cancelled')
                 AND customer_erp_id IN (
                   SELECT erp_id FROM agents.customers
                   WHERE user_id = $2 AND account_num = $1
                 )`,
              [order.customerAccountNum, userId],
            );
          }
        } else {
          logger.warn('[OrderSync] ERP internal ID changed for existing order', {
            order_number: order.orderNumber, new_erp_id: order.id, preserved_id: upserted.id,
          });
          preservedIds.add(upserted.id);
          ordersUpdated++;
        }
      } else if (existing.hash !== hash) {
        const oldTransferStatus = existing.transfer_status;
        const newTransferStatus = order.transferStatus ?? null;

        await pool.query(
          `UPDATE agents.order_records SET
            order_number=$3, customer_account_num=$4, customer_name=$5,
            delivery_name=$6, delivery_address=$7, creation_date=$8, delivery_date=$9,
            order_description=$10, customer_reference=$11, sales_status=$12,
            order_type=$13, document_status=$14, sales_origin=$15, transfer_status=$16,
            transfer_date=$17, completion_date=$18, is_quote=$19, discount_percent=$20, gross_amount=$21,
            total_amount=$22, is_gift_order=$23, hash=$24, last_sync=$25
          WHERE id=$1 AND user_id=$2`,
          [
            order.id, userId, order.orderNumber, order.customerAccountNum ?? null, order.customerName,
            order.deliveryName ?? null, order.deliveryAddress ?? null, order.date, order.deliveryDate ?? null,
            order.orderDescription ?? null, order.customerReference ?? null, order.status ?? null,
            order.orderType ?? null, order.documentState ?? null, order.salesOrigin ?? null, newTransferStatus,
            order.transferDate ?? null, order.completionDate ?? null, order.isQuote ?? null, order.discountPercent ?? null, order.grossAmount ?? null,
            order.total ?? null, order.isGiftOrder ?? null, hash, now,
          ],
        );

        if (oldTransferStatus === 'Modifica' && newTransferStatus !== 'Modifica') {
          try {
            const sold = await batchMarkSold(pool, userId, `pending-${order.id}`, {
              customerName: order.customerName,
              orderNumber: order.orderNumber,
              orderDate: order.date,
            });
            if (sold > 0) {
              logger.info('[OrderSync] Warehouse items marked as sold', {
                orderId: order.id, oldTransferStatus, newTransferStatus, sold,
              });
            }
          } catch (warehouseError) {
            logger.warn('[OrderSync] Failed to mark warehouse items as sold', {
              orderId: order.id,
              error: warehouseError instanceof Error ? warehouseError.message : String(warehouseError),
            });
          }
        }

        const isRecentUpdate = order.customerAccountNum && new Date(order.date) > new Date(Date.now() - 7 * 86400000);
        if (isRecentUpdate) {
          await pool.query(
            `UPDATE agents.customer_reminders
             SET status = 'done', completed_at = NOW(), updated_at = NOW()
             WHERE user_id = $2
               AND source = 'auto'
               AND status NOT IN ('done', 'cancelled')
               AND customer_erp_id IN (
                 SELECT erp_id FROM agents.customers
                 WHERE user_id = $2 AND account_num = $1
               )`,
            [order.customerAccountNum, userId],
          );
        }
        ordersUpdated++;
      } else {
        ordersSkipped++;
      }
    }

    // Propagate emails from orders to customers
    // Match by account_num (PROFILO CLIENTE) first, fallback to name
    const emailEntries: Array<{ profileId?: string; name: string; email: string }> = [];
    const seen = new Set<string>();
    for (const order of parsedOrders) {
      if (!order.email || !order.customerName) continue;
      const key = order.customerAccountNum ?? order.customerName;
      if (seen.has(key)) continue;
      seen.add(key);
      emailEntries.push({
        profileId: order.customerAccountNum ?? undefined,
        name: order.customerName,
        email: order.email,
      });
    }
    for (const entry of emailEntries) {
      let updated = 0;
      if (entry.profileId) {
        const res = await pool.query(
          `UPDATE agents.customers SET email = $1
           WHERE user_id = $2 AND account_num = $3
           AND (email IS NULL OR email = '' OR email != $1)`,
          [entry.email, userId, entry.profileId],
        );
        updated = res.rowCount ?? 0;
      }
      if (updated === 0) {
        await pool.query(
          `UPDATE agents.customers SET email = $1
           WHERE user_id = $2 AND LOWER(name) = LOWER($3)
           AND (email IS NULL OR email = '' OR email != $1)`,
          [entry.email, userId, entry.name],
        );
      }
    }

    onProgress(80, 'Rimozione ordini obsoleti');

    let ordersDeleted = 0;
    const validIds = [...parsedOrders.map((o) => o.id), ...preservedIds];
    if (validIds.length > 0) {
      const placeholders = validIds.map((_, i) => `$${i + 2}`).join(', ');
      const { rows: stale } = await pool.query<{ id: string }>(
        `SELECT id FROM agents.order_records WHERE user_id = $1 AND id NOT IN (${placeholders})`,
        [userId, ...validIds],
      );
      if (stale.length > 0) {
        const staleIds = stale.map((r) => r.id);

        for (const staleId of staleIds) {
          try {
            const released = await batchRelease(pool, userId, `pending-${staleId}`);
            const returned = await batchReturnSold(pool, userId, `pending-${staleId}`, 'stale_order_sync');
            if (released > 0 || returned > 0) {
              logger.info('[OrderSync] Warehouse items released for stale order', {
                orderId: staleId, released, returned,
              });
            }
          } catch (warehouseError) {
            logger.warn('[OrderSync] Failed to release warehouse items for stale order', {
              orderId: staleId,
              error: warehouseError instanceof Error ? warehouseError.message : String(warehouseError),
            });
          }
        }

        const sp = staleIds.map((_, i) => `$${i + 1}`).join(', ');
        await pool.query(`DELETE FROM agents.order_articles WHERE order_id IN (${sp})`, staleIds);
        await pool.query(`DELETE FROM agents.order_state_history WHERE order_id IN (${sp})`, staleIds);
        const dp = staleIds.map((_, i) => `$${i + 2}`).join(', ');
        const { rowCount } = await pool.query(
          `DELETE FROM agents.order_records WHERE user_id = $1 AND id IN (${dp})`,
          [userId, ...staleIds],
        );
        ordersDeleted = rowCount ?? 0;
      }
    }

    onProgress(100, 'Sincronizzazione ordini completata');

    return {
      success: true,
      ordersProcessed: parsedOrders.length,
      ordersInserted,
      ordersUpdated,
      ordersSkipped,
      ordersDeleted,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const isStopped = error instanceof SyncStoppedError;
    return {
      success: false,
      ordersProcessed: 0,
      ordersInserted: 0,
      ordersUpdated: 0,
      ordersSkipped: 0,
      ordersDeleted: 0,
      duration: Date.now() - startTime,
      error: isStopped ? error.message : (error instanceof Error ? error.message : String(error)),
    };
  } finally {
    if (pdfPath) await cleanupFile(pdfPath);
  }
}

export { syncOrders, type OrderSyncDeps, type OrderSyncResult, type ParsedOrder };

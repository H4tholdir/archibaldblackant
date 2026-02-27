import type { DbPool } from '../../db/pool';
import { SyncStoppedError } from './customer-sync';
import { copyFile } from 'node:fs/promises';

type ParsedOrder = {
  id: string;
  orderNumber: string;
  customerProfileId?: string;
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
  remainingSalesFinancial?: string;
  customerReference?: string;
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

    const computeHash = (o: ParsedOrder) =>
      [o.id, o.orderNumber, o.status, o.documentState, o.transferStatus, o.total, o.isQuote, o.isGiftOrder].join('|');

    for (const order of parsedOrders) {
      const hash = require('crypto').createHash('md5').update(computeHash(order)).digest('hex');

      const { rows: [existing] } = await pool.query<{ hash: string; order_number: string }>(
        'SELECT hash, order_number FROM agents.order_records WHERE id = $1 AND user_id = $2',
        [order.id, userId],
      );

      if (!existing) {
        await pool.query(
          `INSERT INTO agents.order_records (
            id, user_id, order_number, customer_profile_id, customer_name,
            delivery_name, delivery_address, creation_date, delivery_date,
            remaining_sales_financial, customer_reference, sales_status,
            order_type, document_status, sales_origin, transfer_status,
            transfer_date, completion_date, is_quote, discount_percent, gross_amount,
            total_amount, is_gift_order, hash, last_sync, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
          [
            order.id, userId, order.orderNumber, order.customerProfileId ?? null, order.customerName,
            order.deliveryName ?? null, order.deliveryAddress ?? null, order.date, order.deliveryDate ?? null,
            order.remainingSalesFinancial ?? null, order.customerReference ?? null, order.status ?? null,
            order.orderType ?? null, order.documentState ?? null, order.salesOrigin ?? null, order.transferStatus ?? null,
            order.transferDate ?? null, order.completionDate ?? null, order.isQuote ?? null, order.discountPercent ?? null, order.grossAmount ?? null,
            order.total ?? null, order.isGiftOrder ?? null, hash, now, new Date().toISOString(),
          ],
        );
        ordersInserted++;
      } else if (existing.hash !== hash) {
        await pool.query(
          `UPDATE agents.order_records SET
            order_number=$3, customer_profile_id=$4, customer_name=$5,
            delivery_name=$6, delivery_address=$7, creation_date=$8, delivery_date=$9,
            remaining_sales_financial=$10, customer_reference=$11, sales_status=$12,
            order_type=$13, document_status=$14, sales_origin=$15, transfer_status=$16,
            transfer_date=$17, completion_date=$18, is_quote=$19, discount_percent=$20, gross_amount=$21,
            total_amount=$22, is_gift_order=$23, hash=$24, last_sync=$25
          WHERE id=$1 AND user_id=$2`,
          [
            order.id, userId, order.orderNumber, order.customerProfileId ?? null, order.customerName,
            order.deliveryName ?? null, order.deliveryAddress ?? null, order.date, order.deliveryDate ?? null,
            order.remainingSalesFinancial ?? null, order.customerReference ?? null, order.status ?? null,
            order.orderType ?? null, order.documentState ?? null, order.salesOrigin ?? null, order.transferStatus ?? null,
            order.transferDate ?? null, order.completionDate ?? null, order.isQuote ?? null, order.discountPercent ?? null, order.grossAmount ?? null,
            order.total ?? null, order.isGiftOrder ?? null, hash, now,
          ],
        );
        ordersUpdated++;
      } else {
        ordersSkipped++;
      }
    }

    onProgress(80, 'Rimozione ordini obsoleti');

    let ordersDeleted = 0;
    const validIds = parsedOrders.map((o) => o.id);
    if (validIds.length > 0) {
      const placeholders = validIds.map((_, i) => `$${i + 2}`).join(', ');
      const { rows: stale } = await pool.query<{ id: string }>(
        `SELECT id FROM agents.order_records WHERE user_id = $1 AND id NOT IN (${placeholders})`,
        [userId, ...validIds],
      );
      if (stale.length > 0) {
        const staleIds = stale.map((r) => r.id);
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

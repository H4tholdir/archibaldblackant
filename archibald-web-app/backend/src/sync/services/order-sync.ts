import { createHash } from 'node:crypto';
import type { DbPool } from '../../db/pool';
import { batchMarkSold, batchRelease, batchReturnSold } from '../../db/repositories/warehouse';
import { logger } from '../../logger';
import { SyncStoppedError } from './customer-sync';
import type { DryRunLogger } from '../../conductor/dry-run';

// Corregge date ambigue (DD ≤ 12 e MM ≤ 12) usando la sequenza crescente degli ID ERP
// e il vincolo logico delivery_date ≥ creation_date.
// Deve essere chiamata DOPO fetchRows, prima del loop di upsert.
function heelAmbiguousDates(orders: ParsedOrder[]): void {
  if (orders.length < 2) return;

  // Ordina per ID ERP numerico (xx.yyy → float, emesso in ordine crescente dall'ERP)
  const toNum = (id: string) => parseFloat(id.replace(',', '.'));
  const byId = [...orders].sort((a, b) => toNum(a.id) - toNum(b.id));

  // Scambia mese e giorno in una data ISO "YYYY-MM-DDThh:mm:ss" o "YYYY-MM-DD"
  const swapMD = (iso: string) =>
    iso.slice(0, 5) + iso.slice(8, 10) + '-' + iso.slice(5, 7) + iso.slice(10);

  const mth = (iso: string) => parseInt(iso.slice(5, 7), 10);
  const day = (iso: string) => parseInt(iso.slice(8, 10), 10);

  // Una data è ambigua se sia DD che MM sono ≤ 12 e diversi tra loro
  const isAmb = (iso: string) => {
    const m = mth(iso); const d = day(iso);
    return m >= 1 && m <= 12 && d >= 1 && d <= 12 && m !== d;
  };

  // Distanza temporale in ms tra due date ISO (confronto stringa funziona su ISO sortabili)
  const msApart = (a: string, b: string) =>
    Math.abs(new Date(a).getTime() - new Date(b).getTime());

  const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < byId.length; i++) {
    const o = byId[i];
    if (!o.date || !isAmb(o.date)) continue;

    const alt = swapMD(o.date);
    // alt deve essere una data valida (anno uguale, mese 1-12, giorno 1-28+)
    if (mth(alt) < 1 || mth(alt) > 12) continue;

    // Check 1: delivery_date unambigua (giorno > 12) impone creation ≤ delivery
    // Se delivery.day > 12 non è ambigua e possiamo fidarci del suo mese
    if (o.deliveryDate && day(o.deliveryDate) > 12) {
      const delMonth = mth(o.deliveryDate);
      if (mth(o.date) > delMonth && mth(alt) <= delMonth) {
        // interpretazione corrente pone creation DOPO delivery → impossibile
        logger.warn(`[OrderSync] heel-date ${o.id} (${o.orderNumber}): delivery-check ${o.date}→${alt}`);
        o.date = alt;
        continue;
      }
    }

    // Check 2: coerenza con i vicini nella sequenza ID
    // Gli ID ERP sono crescenti nel tempo → le date dei vicini delimitano il range atteso
    const prevDate = byId[i - 1]?.date;
    const nextDate = byId[i + 1]?.date;
    if (!prevDate && !nextDate) continue;

    const scoreCur = (prevDate ? msApart(o.date, prevDate) : 0)
                   + (nextDate ? msApart(o.date, nextDate) : 0);
    const scoreAlt = (prevDate ? msApart(alt, prevDate) : 0)
                   + (nextDate ? msApart(alt, nextDate) : 0);

    // Corregge solo se il miglioramento è netto (>10x) e la distanza corrente è >30 giorni
    if (scoreAlt < scoreCur / 10 && scoreCur > MS_30_DAYS) {
      logger.warn(`[OrderSync] heel-date ${o.id} (${o.orderNumber}): seq-check ${o.date}→${alt} (neighbors: ${prevDate?.slice(0, 10)} / ${nextDate?.slice(0, 10)})`);
      o.date = alt;
    }
  }
}

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
  fetchRows: (userId: string) => Promise<ParsedOrder[]>;
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
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
  const { pool, fetchRows, dryRun = false, dryRunLogger } = deps;
  const startTime = Date.now();

  try {
    if (shouldStop()) throw new SyncStoppedError('start');

    onProgress(5, 'Recupero ordini');
    const parsedOrders = await fetchRows(userId);
    heelAmbiguousDates(parsedOrders);

    if (shouldStop()) throw new SyncStoppedError('fetch');

    onProgress(40, `Aggiornamento ${parsedOrders.length} ordini`);

    let ordersInserted = 0;
    let ordersUpdated = 0;
    let ordersSkipped = 0;
    let nullTotalCount = 0;
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

    const nullTotalIds: string[] = [];
    for (const order of parsedOrders) {
      if (!order.total) { nullTotalCount++; nullTotalIds.push(order.id); }
      const hash = createHash('md5').update(computeHash(order)).digest('hex');

      const { rows: [existing] } = await pool.query<{ hash: string; order_number: string; transfer_status: string | null }>(
        'SELECT hash, order_number, transfer_status FROM agents.order_records WHERE id = $1 AND user_id = $2',
        [order.id, userId],
      );

      if (!existing) {
        if (!dryRun) {
          // ON CONFLICT (id, user_id) — uses the PRIMARY KEY of agents.order_records.
          // Previously used (order_number, user_id), which caused draft orders
          // (order_number='') to silently overwrite each other.
          const { rows: [upserted] } = await pool.query<{ id: string; was_inserted: boolean }>(
            `INSERT INTO agents.order_records (
              id, user_id, order_number, customer_account_num, customer_name,
              delivery_name, delivery_address, creation_date, delivery_date,
              order_description, customer_reference, sales_status,
              order_type, document_status, sales_origin, transfer_status,
              transfer_date, completion_date, is_quote, discount_percent, gross_amount,
              total_amount, is_gift_order, hash, last_sync, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
            ON CONFLICT (id, user_id) DO UPDATE SET
              order_number = EXCLUDED.order_number,
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
              gross_amount = COALESCE(EXCLUDED.gross_amount, order_records.gross_amount),
              total_amount = COALESCE(EXCLUDED.total_amount, order_records.total_amount),
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
            // With ON CONFLICT (id, user_id), this branch is unreachable: a row not found
            // by (id, user_id) cannot conflict on the same key. Kept as defensive log only.
            logger.warn('[OrderSync] Unexpected upsert conflict on PK (id, user_id)', {
              order_number: order.orderNumber, erp_id: order.id, preserved_id: upserted.id,
            });
            preservedIds.add(upserted.id);
            ordersUpdated++;
          }
        } else {
          dryRunLogger?.recordUpsert(order.id, 'insert', {
            order_number: order.orderNumber, customer_name: order.customerName,
            date: order.date, hash,
          });
          ordersInserted++;
        }
      } else if (existing.hash !== hash) {
        const oldTransferStatus = existing.transfer_status;
        const newTransferStatus = order.transferStatus ?? null;

        if (!dryRun) {
          await pool.query(
            `UPDATE agents.order_records SET
              order_number=$3, customer_account_num=$4, customer_name=$5,
              delivery_name=$6, delivery_address=$7, creation_date=$8, delivery_date=$9,
              order_description=$10, customer_reference=$11, sales_status=$12,
              order_type=$13, document_status=$14, sales_origin=$15, transfer_status=$16,
              transfer_date=$17, completion_date=$18, is_quote=$19, discount_percent=$20,
              gross_amount=COALESCE($21, gross_amount),
              total_amount=COALESCE($22, total_amount),
              is_gift_order=$23, hash=$24, last_sync=$25
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
        } else {
          dryRunLogger?.recordUpsert(order.id, 'update', {
            order_number: order.orderNumber, customer_name: order.customerName,
            transfer_status: newTransferStatus, hash,
          });
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
    if (!dryRun) {
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
    }

    if (nullTotalCount > 0) {
      logger.warn('[OrderSync] Orders with null/empty total_amount scraped from ERP — previous DB value preserved', { nullTotalCount, userId, totalOrders: parsedOrders.length, nullTotalIds });
    }

    onProgress(80, 'Rimozione ordini obsoleti');

    // Fail-closed guard: refuse to delete if scrape is provably incomplete.
    // Any scrape that returns fewer rows than currently in DB cannot be authoritative —
    // proceeding would cascade-delete valid orders. Throw to trigger a retry; the
    // upserts above are already safe (they only update confirmed-present orders).
    const { rows: [countRow] } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM agents.order_records
       WHERE user_id = $1 AND NOT (order_number LIKE 'PENDING-%' AND id ~ '^[0-9]+$')`,
      [userId],
    );
    const currentDbCount = parseInt(countRow?.count ?? '0', 10);
    if (currentDbCount > 0 && parsedOrders.length < currentDbCount) {
      throw new Error(
        `[OrderSync] Scrape non completa: ERP ha restituito ${parsedOrders.length} ordini ` +
        `ma il DB ne contiene ${currentDbCount}. ` +
        `Cancellazione stale annullata — la sync verrà ritentata.`,
      );
    }

    // Protect orders submitted in the last 2h that may not yet appear in the ERP PDF
    const { rows: pendingRows } = await pool.query<{ id: string }>(
      `SELECT id FROM agents.order_records
       WHERE user_id = $1 AND order_number LIKE 'PENDING-%' AND created_at > NOW() - INTERVAL '2 hours'`,
      [userId],
    );
    for (const row of pendingRows) preservedIds.add(row.id);

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

        if (!dryRun) {
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
        } else {
          staleIds.forEach((id) => dryRunLogger?.recordDelete(id));
          ordersDeleted = staleIds.length;
        }
      }
    }

    if (ordersDeleted > 0) {
      logger.warn('[OrderSync] Stale orders deleted', { ordersDeleted, userId, validIdsCount: validIds.length });
    }

    // Reconcile PENDING-* placeholders: when the ERP confirms an order (appears in scraped list),
    // merge the local snapshot data into the ERP record and delete the duplicate placeholder.
    // This prevents two records showing for the same order during the 2h protection window.
    if (!dryRun) {
      const stripDots = (id: string) => { const s = id.replace(/\./g, ''); return /^\d+$/.test(s) ? s : id; };
      const erpByNormalized = new Map(parsedOrders.map((o) => [stripDots(o.id), o.id]));

      const { rows: pendingToReconcile } = await pool.query<{
        id: string;
        delivery_address_id: string | null;
        delivery_address_snapshot: unknown;
        notes: string | null;
        text_internal: string | null;
      }>(
        `SELECT id, delivery_address_id, delivery_address_snapshot, notes, text_internal
         FROM agents.order_records
         WHERE user_id = $1 AND order_number LIKE 'PENDING-%' AND id ~ '^[0-9]+$'`,
        [userId],
      );

      for (const pending of pendingToReconcile) {
        const erpId = erpByNormalized.get(pending.id);
        if (!erpId) continue;

        await pool.query(
          `UPDATE agents.order_records
           SET delivery_address_id       = COALESCE(delivery_address_id, $3),
               delivery_address_snapshot = COALESCE(delivery_address_snapshot, $4),
               notes                     = COALESCE(notes, $5),
               text_internal             = COALESCE(text_internal, $6)
           WHERE id = $1 AND user_id = $2`,
          [erpId, userId, pending.delivery_address_id, pending.delivery_address_snapshot, pending.notes, pending.text_internal],
        );
        await pool.query('DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2', [pending.id, userId]);
        await pool.query('DELETE FROM agents.order_state_history WHERE order_id = $1 AND user_id = $2', [pending.id, userId]);
        await pool.query('DELETE FROM agents.order_records WHERE id = $1 AND user_id = $2', [pending.id, userId]);
        logger.info('[OrderSync] Reconciled PENDING placeholder with confirmed ERP record', {
          pendingId: pending.id, erpId, userId,
        });
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
  }
}

export { syncOrders, type OrderSyncDeps, type OrderSyncResult, type ParsedOrder };

import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { InlineSyncDeps } from '../../verification/inline-order-sync';
import { arcaLineAmount, round2 } from '../../utils/arca-math';
import { isCustomerComplete } from '../../utils/customer-completeness-backend';
import { saveOrderVerificationSnapshot, getOrderVerificationSnapshot, updateVerificationStatus } from '../../db/repositories/order-verification';
import type { VerificationStatus } from '../../db/repositories/order-verification';
import { performInlineOrderSync } from '../../verification/inline-order-sync';
import { verifyOrderArticles } from '../../verification/verify-order-articles';
import type { ArticleMismatch } from '../../verification/verify-order-articles';
import { formatVerificationNotification } from '../../verification/format-notification';
import type { VerificationNotification } from '../../verification/format-notification';
import { batchTransfer } from '../../db/repositories/warehouse';
import { getUnitPricesByProductIds } from '../../db/repositories/prices';
import { logger } from '../../logger';
import type { CustomerAddress } from '../../db/repositories/customer-addresses';
import { getAddressById } from '../../db/repositories/customer-addresses';
import { buildOrderNotesText } from '../../utils/order-notes';
import { updateTaskPhase } from '../../db/repositories/agent-queue';
import type { MetricsRecorder } from '../../conductor/metrics-recorder';

const SHIPPING_COST = 15.45;
const SHIPPING_TAX_PERCENT = 22;
const SHIPPING_THRESHOLD = 200;
const SHIPPING_ARTICLE_CODE = 'Spese di trasporto K3';

type SubmitOrderItem = {
  articleCode: string;
  productName?: string;
  description?: string;
  quantity: number;
  price: number;
  discount?: number;
  vat?: number;
  articleId?: string;
  packageContent?: number;
  warehouseQuantity?: number;
  warehouseSources?: Array<{ warehouseItemId: number; boxName: string; quantity: number }>;
  isGhostArticle?: boolean;
};

type SubmitOrderData = {
  pendingOrderId: string;
  customerId: string;
  customerName: string;
  customerNameFallback?: string;
  customerInternalId?: string;
  items: SubmitOrderItem[];
  discountPercent?: number;
  targetTotalWithVAT?: number;
  noShipping?: boolean;
  notes?: string;
  deliveryAddressId?: number;
  deliveryAddress?: CustomerAddress | null;
  _resumeFromErpSaveDone?: boolean;
  _resumeOrderId?: string;
  forceIncomplete?: boolean;
};

type OrderHeaderData = {
  orderNumber: string | null;
  orderDescription: string | null;
  customerReference: string | null;
  deliveryDate: string | null;
  deliveryName: string | null;
  deliveryAddress: string | null;
  salesStatus: string | null;
  documentStatus: string | null;
  transferStatus: string | null;
};

export type OrderDetailArticle = {
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineAmount: number;
};

export type OrderDetailData = {
  orderId: string | null;
  orderNumber: string | null;
  customerAccountNum: string | null;
  customerName: string | null;
  creationDate: string | null;
  deliveryDate: string | null;
  deliveryName: string | null;
  deliveryAddress: string | null;
  orderDescription: string | null;
  customerReference: string | null;
  notes: string | null;
  textInternal: string | null;
  salesStatus: string | null;
  documentStatus: string | null;
  transferStatus: string | null;
  transferDate: string | null;
  completionDate: string | null;
  orderType: string | null;
  articles: OrderDetailArticle[];
  totalAmount: string | null;
  grossAmount: string | null;
};

type SubmitOrderBot = {
  createOrder: (orderData: SubmitOrderData) => Promise<string>;
  deleteOrderFromArchibald: (orderId: string) => Promise<{ success: boolean; message: string }>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
  readOrderHeader: (orderId: string) => Promise<OrderHeaderData | null>;
  scrapeRecentOrders?: (opts: { customerId: string; sinceHours: number }) => Promise<Array<{ orderId: string; numArticles: number; grossAmount: number }>>;
  setMetricsContext?: (ctx: { recorder: MetricsRecorder; taskId: bigint } | undefined) => void;
  // Verifica puntuale post-piazzamento: download PDF linee di vendita
  downloadOrderArticlesPDF?: (archibaldOrderId: string) => Promise<string>;
  readOrderFromDetailView?: (orderId: string) => Promise<OrderDetailData | null>;
};

function calculateAmounts(
  items: SubmitOrderItem[],
  discountPercent?: number,
): { grossAmount: number; total: number } {
  const grossAmount = items.reduce((sum, item) => {
    return sum + arcaLineAmount(item.quantity, item.price, item.discount ?? 0);
  }, 0);

  const scontif = 1 - (discountPercent ?? 0) / 100;
  const total = round2(grossAmount * scontif);

  return { grossAmount, total };
}

const BOT_PROGRESS_MAP: Record<string, { progress: number; label: string }> = {
  'navigation.ordini': { progress: 7, label: 'Apertura sezione ordini' },
  'form.nuovo': { progress: 11, label: 'Apertura nuovo ordine' },
  'form.customer': { progress: 18, label: 'Inserimento cliente' },
  'form.articles.start': { progress: 21, label: 'Inizio inserimento articoli' },
  'form.articles.complete': { progress: 46, label: 'Articoli inseriti' },
  'form.discount': { progress: 49, label: 'Applicazione sconto globale' },
  'form.notes': { progress: 51, label: 'Inserimento note ordine' },
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

async function checkRecentDuplicateOnErp(
  bot: SubmitOrderBot,
  customerId: string,
  numArticles: number,
  grossAmount: number,
): Promise<string | null> {
  // bot.scrapeRecentOrders è opzionale — introdotto in C2; senza di esso il check è no-op
  if (!bot.scrapeRecentOrders) return null;
  try {
    const recent = await bot.scrapeRecentOrders({ customerId, sinceHours: 2 });
    const AMOUNT_TOLERANCE = 0.02;
    const match = recent.find(
      (o) => o.numArticles === numArticles && Math.abs(o.grossAmount - grossAmount) <= AMOUNT_TOLERANCE,
    );
    return match?.orderId ?? null;
  } catch (err) {
    logger.warn('[SubmitOrder] Anti-duplicate check failed, proceeding normally', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function handleSubmitOrder(
  pool: DbPool,
  bot: SubmitOrderBot,
  data: SubmitOrderData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  inlineSyncDeps?: InlineSyncDeps,
  broadcastVerification?: BroadcastVerificationFn,
  taskContext?: { taskId: bigint; metricsRecorder?: MetricsRecorder },
): Promise<{ orderId: string; verificationStatus?: string }> {
  // Completeness guard: verify customer has all required fields before any bot work.
  // Also fetch name/archibald_name to ensure the bot searches by the current ERP name,
  // not the potentially stale name stored in the pending order at creation time.
  type CompletenessRow = {
    vat_validated_at: string | null;
    pec: string | null;
    sdi: string | null;
    street: string | null;
    postal_code: string | null;
    name: string | null;
    archibald_name: string | null;
  };

  let { rows: [completenessRow] } = await pool.query<CompletenessRow>(
    `SELECT vat_validated_at, pec, sdi, street, postal_code, name, archibald_name
     FROM agents.customers
     WHERE erp_id = $1 AND user_id = $2`,
    [data.customerId, userId],
  );

  // Fallback: if the customerId was a TEMP profile (created during interactive session),
  // the customer may have been re-profiled by a subsequent sync. Try to find by name.
  if (!completenessRow && data.customerId.startsWith('TEMP-')) {
    const { rows: [fallbackRow] } = await pool.query<CompletenessRow>(
      `SELECT vat_validated_at, pec, sdi, street, postal_code, name, archibald_name
       FROM agents.customers
       WHERE user_id = $1
         AND erp_id NOT LIKE 'TEMP-%'
         AND (name ILIKE '%' || $2 || '%' OR archibald_name ILIKE '%' || $2 || '%')
       LIMIT 1`,
      [userId, data.customerName],
    );
    completenessRow = fallbackRow;
  }

  if (!completenessRow) {
    throw new Error('Cliente non trovato');
  }

  const isGhostOnly = data.items.length > 0 && data.items.every((i) => i.isGhostArticle);

  const effectiveCustomerName =
    completenessRow.archibald_name ?? completenessRow.name ?? data.customerName;

  let orderId: string;
  if (isGhostOnly) {
    orderId = `ghost-${Date.now()}`;
  } else if (data._resumeFromErpSaveDone && data._resumeOrderId) {
    // Recovery: ERP ha già salvato l'ordine in una run precedente — salta tutto il bot
    orderId = data._resumeOrderId;
    logger.info('[SubmitOrder] Resuming from erp_save_done', { orderId });
  } else {
    if (!data.forceIncomplete && !isCustomerComplete(completenessRow)) {
      throw new Error('Dati cliente incompleti. Aggiorna la scheda cliente prima di inviare l\'ordine.');
    }

    if (taskContext?.metricsRecorder && taskContext.taskId) {
      bot.setMetricsContext?.({ recorder: taskContext.metricsRecorder, taskId: taskContext.taskId });
    }

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

    // Pre-retry cleanup: check if a previous attempt left a partial order
    const { rows: [previousOrder] } = await pool.query<{ id: string }>(
      `SELECT id FROM agents.order_records
       WHERE user_id = $1 AND id IN (
         SELECT archibald_order_id FROM agents.pending_orders
         WHERE id = $2 AND archibald_order_id IS NOT NULL
       )`,
      [userId, data.pendingOrderId],
    );

    if (!previousOrder) {
      // Also check order_records created from a previous attempt with this pendingOrderId
      const { rows: [prevByPending] } = await pool.query<{ id: string }>(
        `SELECT o.id FROM agents.order_records o
         WHERE o.user_id = $1
           AND o.order_number LIKE 'PENDING-%'
           AND EXISTS (
             SELECT 1 FROM agents.order_articles oa
             WHERE oa.order_id = o.id AND oa.user_id = $1
           )
           AND o.created_at > NOW() - INTERVAL '1 hour'
           AND o.customer_name = $2
         ORDER BY o.created_at DESC LIMIT 1`,
        [userId, data.customerName],
      );
      if (prevByPending) {
        // Non mostrare il dettaglio tecnico all'utente — è cleanup interno
        try {
          const deleteResult = await bot.deleteOrderFromArchibald(prevByPending.id);
          if (deleteResult.success) {
            logger.info('[SubmitOrder] Deleted partial order from previous attempt', {
              deletedOrderId: prevByPending.id, pendingOrderId: data.pendingOrderId,
            });
            await pool.query('DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2', [prevByPending.id, userId]);
            await pool.query('DELETE FROM agents.order_records WHERE id = $1 AND user_id = $2', [prevByPending.id, userId]);
          }
        } catch (cleanupError) {
          logger.warn('[SubmitOrder] Failed to cleanup partial order, proceeding anyway', {
            orderId: prevByPending.id,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          });
        }
      }
    }

    onProgress(4, 'Creazione ordine su Archibald');

    // Enrich data with account_num (PROFILO CLIENTE in Archibald) for customer disambiguation
    if (!data.customerInternalId) {
      const { rows: [customerRow] } = await pool.query<{ account_num: string | null }>(
        'SELECT account_num FROM agents.customers WHERE erp_id = $1 AND user_id = $2',
        [data.customerId, userId],
      );
      if (customerRow?.account_num) {
        data = { ...data, customerInternalId: customerRow.account_num };
      }
    }

    if (data.deliveryAddressId) {
      data = { ...data, deliveryAddress: await getAddressById(pool, userId, data.deliveryAddressId) ?? null };
    }

    const customerNameFallback =
      effectiveCustomerName.trim() !== data.customerName.trim() ? data.customerName : undefined;

    // Replica la logica di filtraggio del bot (archibald-bot.ts:4230-4262):
    // items completamente da magazzino vengono saltati; items parzialmente da magazzino
    // vengono ridotti alla quantità residua. La firma usa il set ERP effettivo.
    const erpItems = data.items
      .map((item) => {
        const warehouseQty = item.warehouseQuantity ?? 0;
        if (warehouseQty >= item.quantity) return null;
        if (warehouseQty > 0) return { ...item, quantity: item.quantity - warehouseQty };
        return item;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const { grossAmount, total: _ } = calculateAmounts(erpItems, data.discountPercent);

    const candidate = await checkRecentDuplicateOnErp(bot, data.customerId, erpItems.length, grossAmount);
    if (candidate) {
      orderId = candidate;
      logger.info('[SubmitOrder] Anti-duplicate match found, skipping ERP save', { orderId });
    } else {
      orderId = await bot.createOrder({ ...data, customerName: effectiveCustomerName, customerNameFallback });
    }
  }

  if (taskContext?.taskId) {
    await updateTaskPhase(pool, taskContext.taskId, 'erp_save_done', orderId);
  }

  const isWarehouseOnly = orderId.startsWith('warehouse-') || orderId.startsWith('ghost-');

  let erpDetail: OrderDetailData | null = null;
  if (bot.readOrderFromDetailView && !isWarehouseOnly) {
    erpDetail = await bot.readOrderFromDetailView(orderId).catch((err) => {
      logger.warn('[SubmitOrder] readOrderFromDetailView fallito', {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    if (erpDetail) {
      logger.info('[SubmitOrder] Dati ERP letti dal DetailView', {
        orderId,
        orderNumber: erpDetail.orderNumber,
        articlesCount: erpDetail.articles.length,
      });
    }
  }

  onProgress(60, 'Salvataggio nel database');

  const { grossAmount, total } = calculateAmounts(data.items, data.discountPercent);

  const scontif = 1 - (data.discountPercent ?? 0) / 100;
  const totalWithVatFromItems = parseFloat(
    data.items
      .filter(item => !item.isGhostArticle)
      .reduce((sum, item) => {
        const lineAmt = arcaLineAmount(item.quantity, item.price, item.discount ?? 0);
        const adjustedLine = data.discountPercent ? round2(lineAmt * scontif) : lineAmt;
        const vatPercent = item.vat ?? 0;
        const lineTotalWithVat = round2(adjustedLine + Math.round(adjustedLine * vatPercent) / 100);
        return sum + lineTotalWithVat;
      }, 0)
      .toFixed(2),
  );

  const now = new Date().toISOString();

  // Campi autoritativi dall'ERP se il read-back ha avuto successo; fallback ai dati PWA
  const orderNumber = erpDetail?.orderNumber ?? (isWarehouseOnly ? orderId : `PENDING-${orderId}`);
  const deliveryName = erpDetail?.deliveryName ?? data.deliveryAddress?.nome ?? null;
  const deliveryAddress = erpDetail?.deliveryAddress
    ?? (data.deliveryAddress
      ? [data.deliveryAddress.via, data.deliveryAddress.cap, data.deliveryAddress.citta, data.deliveryAddress.stato]
          .filter(Boolean).join(' ') || null
      : null);
  const deliveryDate = erpDetail?.deliveryDate ?? null;
  const notesValue = erpDetail?.notes ?? (buildOrderNotesText(data.noShipping, data.notes) || null);
  const textInternal = erpDetail?.textInternal ?? null;
  const salesStatus = erpDetail?.salesStatus ?? (isWarehouseOnly ? 'WAREHOUSE_FULFILLED' : null);
  const documentStatus = erpDetail?.documentStatus ?? null;
  // Conservativo: setta articles_synced_at solo se abbiamo righe E un totalAmount plausibile (>0).
  // Evita di marcare come sincronizzati ordini letti parzialmente (SALESLINEs page-size non impostabile in VIEW mode).
  const erpTotalAmountPlausible = parseFloat(erpDetail?.totalAmount ?? '0') > 0;
  const erpArticlesSynced = !isWarehouseOnly && (erpDetail?.articles.length ?? 0) >= 1 && erpTotalAmountPlausible;

  await pool.withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO agents.order_records (
        id, user_id, order_number, customer_account_num, customer_name,
        delivery_name, delivery_address, creation_date, delivery_date,
        order_description, customer_reference, sales_status,
        order_type, document_status, sales_origin, transfer_status,
        transfer_date, completion_date, discount_percent, gross_amount,
        total_amount, hash, last_sync, created_at, articles_synced_at,
        notes, total_with_vat,
        delivery_address_id, delivery_address_snapshot, text_internal
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
      ON CONFLICT (id, user_id) DO UPDATE SET
        order_number = EXCLUDED.order_number,
        gross_amount = EXCLUDED.gross_amount,
        total_amount = EXCLUDED.total_amount,
        delivery_address_id = COALESCE(EXCLUDED.delivery_address_id, agents.order_records.delivery_address_id),
        delivery_address_snapshot = COALESCE(EXCLUDED.delivery_address_snapshot, agents.order_records.delivery_address_snapshot),
        last_sync = EXCLUDED.last_sync,
        order_description = EXCLUDED.order_description,
        notes = EXCLUDED.notes,
        text_internal = EXCLUDED.text_internal`,
      [
        orderId,
        userId,
        orderNumber,
        data.customerId,
        effectiveCustomerName,
        deliveryName,
        deliveryAddress,
        now,  // creationDate
        deliveryDate,
        notesValue, // orderDescription mirrors PURCHORDERFORMNUM written by bot
        null, // customerReference
        salesStatus,
        isWarehouseOnly ? 'Warehouse' : 'Giornale',
        documentStatus,
        isWarehouseOnly ? 'PWA' : 'Agent',
        isWarehouseOnly ? null : 'Modifica',
        null, // transferDate
        null, // completionDate
        data.discountPercent?.toString() ?? null,
        grossAmount.toFixed(2).replace('.', ','),
        total.toFixed(2).replace('.', ','),
        '', // hash
        Math.floor(Date.now() / 1000),
        now,
        isWarehouseOnly ? now : (erpArticlesSynced ? now : null),
        notesValue,
        totalWithVatFromItems > 0 ? totalWithVatFromItems.toString() : null,
        data.deliveryAddressId ?? null,
        data.deliveryAddress ? JSON.stringify(data.deliveryAddress) : null,
        textInternal,
      ],
    );

    onProgress(63, 'Salvataggio articoli');

    const articleValues: unknown[] = [];
    const articlePlaceholders: string[] = [];

    for (let i = 0; i < data.items.length; i++) {
      const base = i * 15;
      articlePlaceholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15})`,
      );
      const item = data.items[i];
      const lineAmount = arcaLineAmount(item.quantity, item.price, item.discount ?? 0);
      const vatPercent = item.vat ?? 0;
      const vatAmount = Math.round(lineAmount * vatPercent) / 100;
      const lineTotalWithVat = Math.round((lineAmount + vatAmount) * 100) / 100;
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
        !!item.isGhostArticle,
      );
    }

    if (articlePlaceholders.length > 0) {
      if (isWarehouseOnly) {
        await tx.query(
          `INSERT INTO agents.order_articles (
            order_id, user_id, article_code, article_description, quantity,
            unit_price, discount_percent, line_amount, warehouse_quantity, warehouse_sources_json, created_at,
            vat_percent, vat_amount, line_total_with_vat, is_ghost
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

      const catalogPrices = await getUnitPricesByProductIds(
        pool,
        kometItems.map(item => item.articleCode),
      );

      const snapshotItems = kometItems.map(item => {
        const unitPrice = catalogPrices.get(item.articleCode) ?? item.price;
        return {
          articleCode: item.articleCode,
          articleDescription: item.description ?? item.productName ?? null,
          quantity: item.quantity,
          unitPrice,
          lineDiscountPercent: item.discount ?? null,
          expectedLineAmount: arcaLineAmount(item.quantity, unitPrice, item.discount ?? 0),
        };
      });

      const { grossAmount: kometGross, total: kometTotal } = calculateAmounts(kometItems, data.discountPercent);

      await saveOrderVerificationSnapshot(tx, orderId, userId, {
        globalDiscountPercent: data.discountPercent,
        expectedGrossAmount: kometGross,
        expectedTotalAmount: kometTotal,
        items: snapshotItems,
      });

      // Replace raw article rows with authoritative data: ERP DetailView if available, else catalog-priced snapshot
      await tx.query(
        'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
        [orderId, userId],
      );

      const articleRows: unknown[][] = [];

      if (erpArticlesSynced) {
        // Path A: usa righe lette direttamente dall'ERP — fonte di verità post-save
        // ERP non espone IVA per riga in view mode: default 22%
        const DEFAULT_VAT = 22;
        for (const a of erpDetail!.articles) {
          const lineAmt = a.lineAmount;
          const vatAmt = Math.round(lineAmt * DEFAULT_VAT) / 100;
          articleRows.push([
            orderId, userId, a.code, a.name, a.quantity,
            a.unitPrice, a.lineDiscount > 0 ? a.lineDiscount : null, lineAmt,
            0, null, now,
            DEFAULT_VAT, vatAmt, Math.round((lineAmt + vatAmt) * 100) / 100, false,
          ]);
        }
      } else {
        // Path B: fallback snapshot PWA con prezzi catalogo
        for (let i = 0; i < kometItems.length; i++) {
          const item = kometItems[i];
          const snap = snapshotItems[i];
          const vatPct = item.vat ?? 0;
          const vatAmt = Math.round(snap.expectedLineAmount * vatPct) / 100;
          const lineTotalVat = Math.round((snap.expectedLineAmount + vatAmt) * 100) / 100;
          articleRows.push([
            orderId, userId, item.articleCode, snap.articleDescription, snap.quantity,
            snap.unitPrice, snap.lineDiscountPercent, snap.expectedLineAmount,
            item.warehouseQuantity ?? 0,
            item.warehouseSources ? JSON.stringify(item.warehouseSources) : null,
            now, vatPct, vatAmt, lineTotalVat, !!item.isGhostArticle,
          ]);
        }

        if (!data.noShipping && kometTotal < SHIPPING_THRESHOLD) {
          const shippingVat = Math.round(SHIPPING_COST * SHIPPING_TAX_PERCENT) / 100;
          articleRows.push([
            orderId, userId, SHIPPING_ARTICLE_CODE, null, 1,
            SHIPPING_COST, null, SHIPPING_COST,
            0, null, now,
            SHIPPING_TAX_PERCENT, shippingVat,
            Math.round((SHIPPING_COST + shippingVat) * 100) / 100, false,
          ]);
        }
      }

      if (articleRows.length > 0) {
        const placeholders = articleRows.map((_, i) => {
          const b = i * 15;
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15})`;
        });
        await tx.query(
          `INSERT INTO agents.order_articles (
            order_id, user_id, article_code, article_description, quantity,
            unit_price, discount_percent, line_amount, warehouse_quantity, warehouse_sources_json, created_at,
            vat_percent, vat_amount, line_total_with_vat, is_ghost
          ) VALUES ${placeholders.join(', ')}`,
          articleRows.flat(),
        );
      }

      // article_search_text calcolato dagli articoli finali (Path A: ERP; Path B: snapshot PWA)
      // row[2] = article_code, row[3] = article_description
      const articleSearchText = articleRows
        .map(row => `${String(row[2])} ${String(row[3] ?? '')}`.trim())
        .join(' | ');
      await tx.query(
        'UPDATE agents.order_records SET article_search_text = $1 WHERE id = $2 AND user_id = $3',
        [articleSearchText, orderId, userId],
      );

      // Path A: articles_synced_at già impostato a now nell'INSERT (erpArticlesSynced=true).
      // Path B: articles_synced_at rimane NULL → il sync periodico leggerà le righe dall'ERP in seguito.
    }

    onProgress(67, 'Aggiornamento storico');

    await tx.query(
      `UPDATE agents.fresis_history
       SET archibald_order_id = $1, current_state = 'piazzato', state_updated_at = $2, updated_at = $2
       WHERE user_id = $3
         AND (merged_into_order_id = $4 OR original_pending_order_id = $4)
         AND archibald_order_id IS NULL`,
      [orderId.replace(/\./g, ''), now, userId, data.pendingOrderId],
    );

    // DELETE pending sempre dentro la transazione: l'ordine è su ERP (o warehouse/ghost),
    // il pending non ha più ragione di esistere indipendentemente dall'esito della verification.
    // La verification è informativa, non un gate per la rimozione del pending.
    await tx.query(
      'DELETE FROM agents.pending_orders WHERE id = $1',
      [data.pendingOrderId],
    );

  });

  if (taskContext?.taskId) {
    await updateTaskPhase(pool, taskContext.taskId, 'db_committed');
  }

  // batchTransfer è fuori dalla transazione principale per evitare lock prolungati su warehouse.
  // Finestra di crash residua: se il backend crolla dopo db_committed ma prima di batchTransfer,
  // le riserve warehouse restano su pending-${pendingOrderId} invece di essere migrate a
  // pending-${orderId}. Recovery: il warehouse sync periodico riconcilia le riserve orfane.
  // Non produce duplicati ERP perché phase='db_committed' attiva il fast-finalize del Conductor,
  // che chiama completeTask senza re-eseguire l'ERP save (checkRecentDuplicateOnErp).
  // Complessità di inserire batchTransfer nella tx: lock lunghi non accettabili.
  // Complessità di aggiungere batchTransfer al recovery path: dipendenze warehouse nel Worker.
  // Limitazione documentata come tradeoff accettato.

  pool.query(
    `UPDATE agents.customers SET last_activity_at = NOW() WHERE erp_id = $1 AND user_id = $2`,
    [data.customerId, userId],
  ).catch(() => {});

  if (!isWarehouseOnly) {
    const transferred = await batchTransfer(pool, userId, [`pending-${data.pendingOrderId}`], `pending-${orderId}`);
    logger.info('[SubmitOrder] Warehouse reservations transferred to Archibald order', {
      orderId, pendingOrderId: data.pendingOrderId, transferred,
    });
  }

  onProgress(100, 'Ordine piazzato su ERP');

  // Verifica puntuale post-piazzamento (fire-and-forget — non blocca il Conductor).
  // Scarica il PDF linee di vendita dall'ERP, confronta 1:1 con lo snapshot PWA.
  // Se discrepanza → VERIFICATION_RESULT broadcast + badge "Verifica articoli" in /orders.
  // La PWA è la fonte di verità; questa verifica certifica che il bot ha eseguito fedelmente.
  if (!isWarehouseOnly && inlineSyncDeps) {
    void runPostSubmitVerification(
      pool, inlineSyncDeps, orderId, userId, broadcastVerification,
    ).catch(err => logger.warn('[SubmitOrder] Post-submit verification failed silently', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  // Cooldown: mantieni il lock agentivo per dare respiro al DOM DevExpress
  if (!isWarehouseOnly) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 2_000); });
  }

  return { orderId };
}

// ─── Verifica puntuale post-piazzamento ─────────────────────────────────────

const PRICE_TOLERANCE = 0.02; // €0.02 di tolleranza su arrotondamenti ERP

async function runPostSubmitVerification(
  pool: DbPool,
  deps: Omit<InlineSyncDeps, 'pool'>,
  orderId: string,
  userId: string,
  broadcastVerification?: BroadcastVerificationFn,
): Promise<void> {
  // Attende 5s per dare tempo all'ERP di indicizzare il PDF dell'ordine
  await new Promise<void>(r => setTimeout(r, 5_000));

  logger.info('[SubmitOrder] Avvio verifica puntuale post-piazzamento', { orderId });

  // 1. Scarica PDF linee di vendita dall'ERP
  let pdfPath: string;
  try {
    pdfPath = await deps.downloadOrderArticlesPDF(orderId);
  } catch (err) {
    logger.warn('[SubmitOrder] PDF linee di vendita non disponibile, verifica posticipata a sync periodica', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    await updateVerificationStatus(pool, orderId, userId, 'pending_verification', null);
    return;
  }

  let erpArticles: Array<{ articleCode: string; quantity: number; unitPrice: number; discountPercent: number }> = [];
  try {
    const parsed = await deps.parsePdf(pdfPath);
    erpArticles = parsed.map(a => ({
      articleCode: a.articleCode,
      quantity: a.quantity,
      unitPrice: a.unitPrice,
      discountPercent: a.discountPercent,
    }));
  } finally {
    await deps.cleanupFile(pdfPath).catch(() => {});
  }

  // 2. Carica snapshot PWA
  const snapshot = await getOrderVerificationSnapshot(pool, orderId, userId);

  // Caso B: ordine non ha articoli su ERP (piazzamento non riuscito)
  if (erpArticles.length === 0) {
    logger.error('[SubmitOrder] VERIFICA FALLITA — 0 articoli su ERP dopo piazzamento', { orderId });
    await updateVerificationStatus(pool, orderId, userId, 'mismatch_detected',
      JSON.stringify([{ type: 'missing', field: 'articles_count', expected: snapshot?.items?.length ?? null, found: 0 }]),
    );
    emitVerificationNotification(broadcastVerification, orderId, 'mismatch_detected', [{
      type: 'missing' as const,
      snapshotArticleCode: null,
      syncedArticleCode: null,
      field: 'articles_count',
      expected: snapshot?.items?.length ?? null,
      found: 0,
    }]);
    return;
  }

  // Caso A: articoli presenti ma confronto 1:1 con snapshot
  if (!snapshot || snapshot.items.length === 0) {
    // Nessuno snapshot → niente da confrontare, consideriamo verificato
    await updateVerificationStatus(pool, orderId, userId, 'verified', null);
    return;
  }

  // Il sistema di confezionamento della PWA può generare più righe con lo stesso codice articolo
  // (es. H129FSQ.104.023 qty=5 + H129FSQ.104.023 qty=2 per 7pz = K5 + 2xK1).
  // La Map non può avere duplicate keys → aggregiamo le quantità per codice.

  // Aggrega quantità ERP per codice (somma confezionamenti multipli)
  const erpByCode = new Map<string, { totalQty: number; unitPrice: number }>();
  for (const a of erpArticles) {
    const existing = erpByCode.get(a.articleCode);
    if (existing) {
      existing.totalQty += a.quantity;
    } else {
      erpByCode.set(a.articleCode, { totalQty: a.quantity, unitPrice: a.unitPrice });
    }
  }

  // Aggrega quantità snapshot per codice (stesso motivo)
  const snapshotByCode = new Map<string, { totalQty: number; unitPrice: number }>();
  for (const item of snapshot.items) {
    const existing = snapshotByCode.get(item.articleCode);
    if (existing) {
      existing.totalQty += item.quantity;
    } else {
      snapshotByCode.set(item.articleCode, { totalQty: item.quantity, unitPrice: item.unitPrice });
    }
  }

  const mismatches: ArticleMismatch[] = [];

  for (const [code, expected] of snapshotByCode) {
    const found = erpByCode.get(code);

    if (!found) {
      mismatches.push({ type: 'missing', snapshotArticleCode: code, syncedArticleCode: null, field: 'missing', expected: null, found: null });
      continue;
    }

    // Quantità: confronto sul totale aggregato per codice
    if (found.totalQty !== expected.totalQty) {
      mismatches.push({ type: 'quantity_diff', snapshotArticleCode: code, syncedArticleCode: code, field: 'quantity', expected: expected.totalQty, found: found.totalQty });
    }

    // Prezzo: tolleranza ±€0.02 (ERP può arrotondare diversamente)
    if (Math.abs(found.unitPrice - expected.unitPrice) > PRICE_TOLERANCE) {
      mismatches.push({ type: 'price_diff', snapshotArticleCode: code, syncedArticleCode: code, field: 'unitPrice', expected: expected.unitPrice, found: found.unitPrice });
    }
  }

  const status: VerificationStatus = mismatches.length === 0 ? 'verified' : 'mismatch_detected';
  await updateVerificationStatus(
    pool, orderId, userId, status,
    mismatches.length > 0 ? JSON.stringify(mismatches) : null,
  );

  if (status === 'verified') {
    logger.info('[SubmitOrder] Verifica puntuale OK — articoli 1:1 con snapshot PWA', { orderId });
  } else {
    logger.warn('[SubmitOrder] VERIFICA PUNTUALE: discrepanze rilevate', { orderId, mismatches });
    emitVerificationNotification(broadcastVerification, orderId, 'mismatch_detected', mismatches);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

type SubmitOrderBroadcast = (userId: string, event: Record<string, unknown>) => void;

function createSubmitOrderHandler(
  pool: DbPool,
  createBot: (userId: string) => SubmitOrderBot,
  inlineSyncDeps?: Omit<InlineSyncDeps, 'pool'>,
  broadcast?: SubmitOrderBroadcast,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as SubmitOrderData;
    const deps = inlineSyncDeps ? { ...inlineSyncDeps, pool } : undefined;
    const broadcastVerification: BroadcastVerificationFn | undefined = broadcast
      ? (orderId, notification) => broadcast(userId, {
          event: 'VERIFICATION_RESULT',
          orderId,
          notification,
        })
      : undefined;
    const result = await handleSubmitOrder(pool, bot, typedData, userId, onProgress, deps, broadcastVerification);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSubmitOrder, createSubmitOrderHandler, calculateAmounts, type SubmitOrderData, type SubmitOrderBot, type SubmitOrderItem, type OrderHeaderData };
export type { InlineSyncDeps } from '../../verification/inline-order-sync';

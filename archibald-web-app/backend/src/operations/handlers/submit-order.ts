import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';

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
  'navigation.ordini': { progress: 10, label: 'Apertura sezione ordini' },
  'form.nuovo': { progress: 15, label: 'Apertura nuovo ordine' },
  'form.customer': { progress: 25, label: 'Inserimento cliente' },
  'form.articles.start': { progress: 30, label: 'Inizio inserimento articoli' },
  'form.articles.complete': { progress: 65, label: 'Articoli inseriti' },
  'form.discount': { progress: 70, label: 'Applicazione sconto globale' },
  'form.submit.start': { progress: 75, label: 'Salvataggio ordine in corso' },
  'form.submit.complete': { progress: 80, label: 'Ordine salvato' },
};

function calculateArticleProgress(current: number, total: number): number {
  const start = 30;
  const end = 65;
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

async function handleSubmitOrder(
  pool: DbPool,
  bot: SubmitOrderBot,
  data: SubmitOrderData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ orderId: string }> {
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

  onProgress(5, 'Creazione ordine su Archibald');
  const orderId = await bot.createOrder(data);

  onProgress(85, 'Salvataggio nel database');

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

    onProgress(90, 'Salvataggio articoli');

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

    onProgress(95, 'Aggiornamento storico');

    await tx.query(
      `UPDATE agents.fresis_history
       SET archibald_order_id = $1, current_state = 'piazzato', state_updated_at = $2, updated_at = $2
       WHERE user_id = $3 AND merged_into_order_id = $4 AND archibald_order_id IS NULL`,
      [orderId, now, userId, data.pendingOrderId],
    );

    await tx.query(
      'DELETE FROM agents.pending_orders WHERE id = $1',
      [data.pendingOrderId],
    );
  });

  onProgress(100, 'Ordine completato');

  return { orderId };
}

function createSubmitOrderHandler(pool: DbPool, createBot: (userId: string) => SubmitOrderBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as SubmitOrderData;
    const result = await handleSubmitOrder(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSubmitOrder, createSubmitOrderHandler, calculateAmounts, type SubmitOrderData, type SubmitOrderBot, type SubmitOrderItem };

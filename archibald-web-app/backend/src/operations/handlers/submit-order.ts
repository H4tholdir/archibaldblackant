import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';

type SubmitOrderItem = {
  articleCode: string;
  productName?: string;
  description?: string;
  quantity: number;
  price: number;
  discount?: number;
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
): { grossAmount: number; totalAmount: number } {
  const grossAmount = items.reduce((sum, item) => {
    const lineAmount = item.price * item.quantity * (1 - (item.discount || 0) / 100);
    return sum + lineAmount;
  }, 0);

  const totalAmount = discountPercent
    ? grossAmount * (1 - discountPercent / 100)
    : grossAmount;

  return { grossAmount, totalAmount };
}

async function handleSubmitOrder(
  pool: DbPool,
  bot: SubmitOrderBot,
  data: SubmitOrderData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ orderId: string }> {
  bot.setProgressCallback(async (category, metadata) => {
    onProgress(50, category);
  });

  onProgress(10, 'Creazione ordine su Archibald');
  const orderId = await bot.createOrder(data);

  onProgress(70, 'Salvataggio ordine nel database');

  const { grossAmount, totalAmount } = calculateAmounts(data.items, data.discountPercent);

  const isWarehouseOnly = orderId.startsWith('warehouse-');
  const now = new Date().toISOString();

  await pool.query(
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
      null, // documentStatus
      isWarehouseOnly ? 'PWA' : 'Agent',
      isWarehouseOnly ? null : 'Modifica',
      null, // transferDate
      null, // completionDate
      data.discountPercent?.toString() ?? null,
      grossAmount.toFixed(2),
      totalAmount.toFixed(2),
      '', // hash
      Math.floor(Date.now() / 1000),
      now,
    ],
  );

  onProgress(80, 'Salvataggio articoli');

  const articleValues: unknown[] = [];
  const articlePlaceholders: string[] = [];

  for (let i = 0; i < data.items.length; i++) {
    const base = i * 9;
    articlePlaceholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`,
    );
    const item = data.items[i];
    const lineAmount = item.price * item.quantity * (1 - (item.discount || 0) / 100);
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
    );
  }

  if (articlePlaceholders.length > 0) {
    await pool.query(
      `INSERT INTO agents.order_articles (
        order_id, user_id, article_code, article_description, quantity,
        unit_price, discount_percent, line_amount, warehouse_quantity
      ) VALUES ${articlePlaceholders.join(', ')}`,
      articleValues,
    );
  }

  onProgress(90, 'Aggiornamento storico');

  await pool.query(
    `UPDATE agents.fresis_history
     SET archibald_order_id = $1, current_state = 'piazzato', state_updated_at = $2, updated_at = $2
     WHERE user_id = $3 AND merged_into_order_id = $4 AND archibald_order_id IS NULL`,
    [orderId, now, userId, data.pendingOrderId],
  );

  await pool.query(
    'DELETE FROM agents.pending_orders WHERE id = $1',
    [data.pendingOrderId],
  );

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

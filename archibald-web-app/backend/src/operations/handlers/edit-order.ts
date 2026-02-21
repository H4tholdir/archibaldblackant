import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';

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
};

type EditOrderBot = {
  ensureReadyWithContext: (context: unknown) => Promise<void>;
  editOrderInArchibald: (orderId: string, modifications: Array<Record<string, unknown>>) => Promise<{ success: boolean; message: string }>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleEditOrder(
  pool: DbPool,
  bot: EditOrderBot,
  data: EditOrderData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ success: boolean; message: string }> {
  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  onProgress(10, 'Modifica ordine su Archibald');
  const result = await bot.editOrderInArchibald(data.orderId, data.modifications);

  if (!result.success) {
    throw new Error(result.message);
  }

  if (data.updatedItems && data.updatedItems.length > 0) {
    onProgress(70, 'Aggiornamento articoli nel database');

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
    });
  }

  onProgress(100, 'Modifica completata');

  return { success: true, message: result.message };
}

function createEditOrderHandler(pool: DbPool, createBot: (userId: string) => EditOrderBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    await bot.ensureReadyWithContext(context);
    const typedData = data as unknown as EditOrderData;
    const result = await handleEditOrder(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleEditOrder, createEditOrderHandler, type EditOrderData, type EditOrderBot, type EditOrderArticle };

import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { checkBotResult, saveBotResult, clearBotResult } from '../bot-result-store';

type DeleteOrderData = {
  orderId: string;
};

type DeleteOrderBot = {
  ensureReadyWithContext: (context: unknown) => Promise<void>;
  deleteOrderFromArchibald: (orderId: string) => Promise<{ success: boolean; message: string }>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleDeleteOrder(
  pool: DbPool,
  bot: DeleteOrderBot,
  data: DeleteOrderData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ success: boolean; message: string }> {
  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  onProgress(10, 'Cancellazione ordine da Archibald');

  const savedResult = await checkBotResult(pool, userId, 'delete-order', data.orderId);
  let result: { success: boolean; message: string };

  if (savedResult) {
    result = { success: savedResult.success as boolean, message: savedResult.message as string };
  } else {
    result = await bot.deleteOrderFromArchibald(data.orderId);
    if (!result.success) {
      throw new Error(result.message);
    }
    await saveBotResult(pool, userId, 'delete-order', data.orderId, { success: true, message: result.message });
  }

  onProgress(70, 'Rimozione ordine dal database');

  await pool.withTransaction(async (tx) => {
    await tx.query(
      'DELETE FROM agents.order_state_history WHERE order_id = $1 AND user_id = $2',
      [data.orderId, userId],
    );
    await tx.query(
      'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
      [data.orderId, userId],
    );
    await tx.query(
      'DELETE FROM agents.order_records WHERE id = $1 AND user_id = $2',
      [data.orderId, userId],
    );
  });

  await clearBotResult(pool, userId, 'delete-order', data.orderId);

  onProgress(100, 'Cancellazione completata');

  return { success: true, message: result.message };
}

function createDeleteOrderHandler(pool: DbPool, createBot: (userId: string) => DeleteOrderBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    await bot.ensureReadyWithContext(context);
    const typedData = data as unknown as DeleteOrderData;
    const result = await handleDeleteOrder(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleDeleteOrder, createDeleteOrderHandler, type DeleteOrderData, type DeleteOrderBot };

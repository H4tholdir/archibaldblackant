import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';

type DeleteOrderData = {
  orderId: string;
};

type DeleteOrderBot = {
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
  const result = await bot.deleteOrderFromArchibald(data.orderId);

  if (!result.success) {
    throw new Error(result.message);
  }

  onProgress(70, 'Rimozione ordine dal database');

  await pool.query(
    'DELETE FROM agents.order_state_history WHERE order_id = $1 AND user_id = $2',
    [data.orderId, userId],
  );
  await pool.query(
    'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
    [data.orderId, userId],
  );
  await pool.query(
    'DELETE FROM agents.order_records WHERE id = $1 AND user_id = $2',
    [data.orderId, userId],
  );

  onProgress(100, 'Cancellazione completata');

  return { success: true, message: result.message };
}

function createDeleteOrderHandler(pool: DbPool, createBot: (userId: string) => DeleteOrderBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as DeleteOrderData;
    const result = await handleDeleteOrder(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleDeleteOrder, createDeleteOrderHandler, type DeleteOrderData, type DeleteOrderBot };

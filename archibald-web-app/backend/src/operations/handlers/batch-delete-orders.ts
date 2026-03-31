import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { batchRelease, batchReturnSold } from '../../db/repositories/warehouse';
import { logger } from '../../logger';

type BatchDeleteOrdersData = {
  orderIds: string[];
};

type BatchDeleteOrdersBot = {
  batchDeleteOrdersFromArchibald: (orderIds: string[]) => Promise<{
    success: boolean;
    message: string;
    deletedIds: string[];
    notFoundIds: string[];
  }>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

const BOT_BATCH_DELETE_PROGRESS: Record<string, { progress: number; label: string }> = {
  'batchDelete.navigation': { progress: 10, label: 'Apertura sezione ordini' },
  'batchDelete.filter': { progress: 20, label: 'Impostazione filtro ordini' },
  'batchDelete.scan': { progress: 30, label: 'Ricerca ordini nella griglia' },
  'batchDelete.select': { progress: 45, label: 'Selezione ordini' },
  'batchDelete.confirm': { progress: 60, label: 'Conferma eliminazione' },
  'batchDelete.verify': { progress: 70, label: 'Verifica eliminazione' },
  'batchDelete.complete': { progress: 80, label: 'Ordini rimossi da Archibald' },
};

async function handleBatchDeleteOrders(
  pool: DbPool,
  bot: BatchDeleteOrdersBot,
  data: BatchDeleteOrdersData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  broadcast?: (userId: string, event: Record<string, unknown>) => void,
): Promise<{ success: boolean; message: string; deletedIds: string[]; notFoundIds: string[] }> {
  bot.setProgressCallback(async (category) => {
    const mapped = BOT_BATCH_DELETE_PROGRESS[category];
    if (mapped) onProgress(mapped.progress, mapped.label);
  });

  onProgress(5, `Avvio eliminazione ${data.orderIds.length} ordini`);
  const result = await bot.batchDeleteOrdersFromArchibald(data.orderIds);

  if (!result.success) {
    throw new Error(result.message);
  }

  onProgress(85, 'Rilascio articoli magazzino');

  for (const orderId of result.deletedIds) {
    try {
      const released = await batchRelease(pool, userId, orderId);
      const returned = await batchReturnSold(pool, userId, orderId, 'order_deleted');
      if (released > 0 || returned > 0) {
        logger.info('[BatchDeleteOrders] Warehouse items released', { orderId, released, returned });
      }
    } catch (warehouseError) {
      logger.warn('[BatchDeleteOrders] Failed to release warehouse items', {
        orderId,
        error: warehouseError instanceof Error ? warehouseError.message : String(warehouseError),
      });
    }
  }

  onProgress(92, 'Rimozione ordini dal database');

  await pool.withTransaction(async (tx) => {
    for (const orderId of result.deletedIds) {
      await tx.query(
        'DELETE FROM agents.order_state_history WHERE order_id = $1 AND user_id = $2',
        [orderId, userId],
      );
      await tx.query(
        'DELETE FROM agents.order_articles WHERE order_id = $1 AND user_id = $2',
        [orderId, userId],
      );
      await tx.query(
        'DELETE FROM agents.order_records WHERE id = $1 AND user_id = $2',
        [orderId, userId],
      );
    }
  });

  onProgress(100, `${result.deletedIds.length} ordini eliminati`);

  for (const orderId of result.deletedIds) {
    broadcast?.(userId, { event: 'ORDER_DELETE_COMPLETE', orderId });
  }

  return result;
}

function createBatchDeleteOrdersHandler(
  pool: DbPool,
  createBot: (userId: string) => BatchDeleteOrdersBot,
  broadcast?: (userId: string, event: Record<string, unknown>) => void,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as BatchDeleteOrdersData;
    const result = await handleBatchDeleteOrders(pool, bot, typedData, userId, onProgress, broadcast);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleBatchDeleteOrders,
  createBatchDeleteOrdersHandler,
  type BatchDeleteOrdersData,
  type BatchDeleteOrdersBot,
};

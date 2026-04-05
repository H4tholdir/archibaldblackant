import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { batchRelease, batchReturnSold } from '../../db/repositories/warehouse';
import { audit } from '../../db/repositories/audit-log';
import { logger } from '../../logger';

type DeleteOrderData = {
  orderId: string;
};

type DeleteOrderBot = {
  deleteOrderFromArchibald: (orderId: string) => Promise<{ success: boolean; message: string }>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

const BOT_DELETE_PROGRESS_MAP: Record<string, { progress: number; label: string }> = {
  'delete.navigation': { progress: 15, label: 'Apertura sezione ordini' },
  'delete.filter': { progress: 25, label: 'Impostazione filtro ordini' },
  'delete.search': { progress: 35, label: 'Ricerca ordine su Archibald' },
  'delete.select': { progress: 45, label: 'Selezione ordine trovato' },
  'delete.confirm': { progress: 55, label: 'Conferma eliminazione su Archibald' },
  'delete.verify': { progress: 65, label: 'Verifica eliminazione' },
  'delete.complete': { progress: 75, label: 'Ordine rimosso da Archibald' },
};

async function handleDeleteOrder(
  pool: DbPool,
  bot: DeleteOrderBot,
  data: DeleteOrderData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  broadcast?: (userId: string, event: Record<string, unknown>) => void,
): Promise<{ success: boolean; message: string }> {
  bot.setProgressCallback(async (category) => {
    const mapped = BOT_DELETE_PROGRESS_MAP[category];
    if (mapped) {
      onProgress(mapped.progress, mapped.label);
    }
  });

  onProgress(5, 'Avvio eliminazione ordine');
  const result = await bot.deleteOrderFromArchibald(data.orderId);

  if (!result.success) {
    throw new Error(result.message);
  }

  onProgress(80, 'Rilascio articoli magazzino');
  try {
    const released = await batchRelease(pool, userId, data.orderId);
    const returned = await batchReturnSold(pool, userId, data.orderId, 'order_deleted');
    if (released > 0 || returned > 0) {
      logger.info('[DeleteOrder] Warehouse items released', {
        orderId: data.orderId, released, returned,
      });
    }
  } catch (warehouseError) {
    logger.warn('[DeleteOrder] Failed to release warehouse items', {
      orderId: data.orderId,
      error: warehouseError instanceof Error ? warehouseError.message : String(warehouseError),
    });
  }

  onProgress(90, 'Rimozione ordine dal database');

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

  onProgress(100, 'Ordine eliminato con successo');

  void audit(pool, {
    actorId: userId,
    action: 'order.deleted',
    targetType: 'order',
    targetId: data.orderId,
    metadata: { reason: 'manual_delete' },
  });

  broadcast?.(userId, { event: 'ORDER_DELETE_COMPLETE', orderId: data.orderId });

  return { success: true, message: result.message };
}

function createDeleteOrderHandler(
  pool: DbPool,
  createBot: (userId: string) => DeleteOrderBot,
  broadcast?: (userId: string, event: Record<string, unknown>) => void,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as DeleteOrderData;
    const result = await handleDeleteOrder(pool, bot, typedData, userId, onProgress, broadcast);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleDeleteOrder, createDeleteOrderHandler, type DeleteOrderData, type DeleteOrderBot };

import type { DbPool } from '../../db/pool';
import * as ordersRepo from '../../db/repositories/orders';
import type { OperationHandler } from '../operation-processor';

type SendToVeronaData = {
  orderId: string;
};

type SendToVeronaBot = {
  sendOrderToVerona: (orderId: string) => Promise<{ success: boolean; message: string }>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

const SEND_TO_VERONA_PROGRESS: Record<string, { progress: number; label: string }> = {
  'sendToVerona.navigation': { progress: 10, label: 'Navigazione alla lista ordini' },
  'sendToVerona.filter': { progress: 20, label: 'Impostazione filtro ordini' },
  'sendToVerona.search': { progress: 30, label: 'Ricerca ordine' },
  'sendToVerona.select': { progress: 40, label: 'Selezione ordine' },
  'sendToVerona.confirm': { progress: 50, label: 'Conferma invio a Verona' },
  'sendToVerona.verify': { progress: 65, label: 'Verifica invio completato' },
  'sendToVerona.complete': { progress: 80, label: 'Finalizzazione' },
};

async function handleSendToVerona(
  pool: DbPool,
  bot: SendToVeronaBot,
  data: SendToVeronaData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ success: boolean; message: string; sentToMilanoAt: string }> {
  bot.setProgressCallback(async (category) => {
    const mapped = SEND_TO_VERONA_PROGRESS[category];
    if (mapped) {
      onProgress(mapped.progress, mapped.label);
    } else {
      onProgress(50, 'Invio in corso...');
    }
  });

  onProgress(5, 'Avvio invio a Verona');
  const result = await bot.sendOrderToVerona(data.orderId);

  if (!result.success) {
    throw new Error(result.message);
  }

  const sentToMilanoAt = new Date().toISOString();

  onProgress(70, 'Aggiornamento stato ordine');

  await ordersRepo.updateOrderState(pool, userId, data.orderId, 'inviato_milano', 'system', result.message, null, 'send-to-verona');

  await pool.query(
    'UPDATE agents.order_records SET sent_to_milano_at = $1 WHERE id = $2 AND user_id = $3',
    [sentToMilanoAt, data.orderId, userId],
  );

  onProgress(100, 'Invio completato');

  return { success: true, message: result.message, sentToMilanoAt };
}

function createSendToVeronaHandler(pool: DbPool, createBot: (userId: string) => SendToVeronaBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as SendToVeronaData;
    const result = await handleSendToVerona(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSendToVerona, createSendToVeronaHandler, type SendToVeronaData, type SendToVeronaBot };

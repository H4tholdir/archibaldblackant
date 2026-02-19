import type { DbPool } from '../../db/pool';
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

async function handleSendToVerona(
  pool: DbPool,
  bot: SendToVeronaBot,
  data: SendToVeronaData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ success: boolean; message: string; sentToMilanoAt: string }> {
  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  onProgress(10, 'Invio ordine a Verona');
  const result = await bot.sendOrderToVerona(data.orderId);

  if (!result.success) {
    throw new Error(result.message);
  }

  const sentToMilanoAt = new Date().toISOString();

  onProgress(70, 'Aggiornamento stato ordine');

  await pool.query(
    `UPDATE agents.order_records
     SET current_state = $1, sent_to_milano_at = $2, last_sync = $3
     WHERE id = $4 AND user_id = $5`,
    ['inviato_milano', sentToMilanoAt, Math.floor(Date.now() / 1000), data.orderId, userId],
  );

  await pool.query(
    `INSERT INTO agents.audit_log (user_id, action, entity_id, details, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, 'send_to_milano', data.orderId, JSON.stringify({ sentToMilanoAt, message: result.message }), sentToMilanoAt],
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

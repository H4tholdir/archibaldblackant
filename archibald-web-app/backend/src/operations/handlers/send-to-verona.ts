import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { checkBotResult, saveBotResult, clearBotResult } from '../bot-result-store';

type SendToVeronaData = {
  orderId: string;
};

type SendToVeronaBot = {
  ensureReadyWithContext: (context: unknown) => Promise<void>;
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
): Promise<{ success: boolean; message: string; sentToVeronaAt: string }> {
  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  onProgress(10, 'Invio ordine a Verona');

  const savedResult = await checkBotResult(pool, userId, 'send-to-verona', data.orderId);
  let result: { success: boolean; message: string };

  if (savedResult) {
    result = { success: savedResult.success as boolean, message: savedResult.message as string };
  } else {
    result = await bot.sendOrderToVerona(data.orderId);
    if (!result.success) {
      throw new Error(result.message);
    }
    await saveBotResult(pool, userId, 'send-to-verona', data.orderId, { success: true, message: result.message });
  }

  const sentToVeronaAt = new Date().toISOString();

  onProgress(70, 'Aggiornamento stato ordine');

  await pool.query(
    `UPDATE agents.order_records
     SET current_state = $1, sent_to_verona_at = $2, last_sync = $3
     WHERE id = $4 AND user_id = $5`,
    ['inviato_verona', sentToVeronaAt, Math.floor(Date.now() / 1000), data.orderId, userId],
  );

  await clearBotResult(pool, userId, 'send-to-verona', data.orderId);

  onProgress(100, 'Invio completato');

  return { success: true, message: result.message, sentToVeronaAt };
}

function createSendToVeronaHandler(pool: DbPool, createBot: (userId: string) => SendToVeronaBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    await bot.ensureReadyWithContext(context);
    const typedData = data as unknown as SendToVeronaData;
    const result = await handleSendToVerona(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSendToVerona, createSendToVeronaHandler, type SendToVeronaData, type SendToVeronaBot };

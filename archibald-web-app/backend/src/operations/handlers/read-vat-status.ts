import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { updateVatValidatedAt } from '../../db/repositories/customers';
import { logger } from '../../logger';

type ReadVatStatusData = {
  customerProfile: string;
};

type ReadVatStatusBot = {
  readCustomerVatStatus: (customerProfile: string) => Promise<{ vatValidated: string; lastChecked: string } | null>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleReadVatStatus(
  pool: DbPool,
  bot: ReadVatStatusBot,
  data: ReadVatStatusData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ vatValidated: string | null }> {
  onProgress(10, 'Lettura stato IVA da Archibald');
  bot.setProgressCallback(async () => {});

  let vatValidated: string | null = null;
  try {
    const result = await bot.readCustomerVatStatus(data.customerProfile);
    vatValidated = result?.vatValidated ?? null;

    if (vatValidated === 'Sì' || vatValidated === 'Si') {
      await updateVatValidatedAt(pool, userId, data.customerProfile);
      logger.info('readVatStatus: IVA validata persistita', { customerProfile: data.customerProfile });
    }
  } catch (err) {
    logger.warn('readVatStatus: lettura fallita', { error: String(err), customerProfile: data.customerProfile });
  }

  onProgress(100, 'Stato IVA aggiornato');
  return { vatValidated };
}

function createReadVatStatusHandler(
  pool: DbPool,
  createBot: (userId: string) => ReadVatStatusBot,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as ReadVatStatusData;
    const result = await handleReadVatStatus(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleReadVatStatus, createReadVatStatusHandler, type ReadVatStatusData, type ReadVatStatusBot };

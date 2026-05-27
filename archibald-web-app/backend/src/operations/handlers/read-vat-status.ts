import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { updateVatValidatedAt, updateVatLastBgCheckAt } from '../../db/repositories/customers';
import { logger } from '../../logger';

type ReadVatStatusData = {
  erpId: string;
  vatNumber?: string;
};

type ReadVatStatusBot = {
  readCustomerVatStatus: (erpId: string) => Promise<{ vatValidated: string; lastChecked: string } | null>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

type EnqueueNextFn = (
  taskType: string,
  userId: string,
  payload: Record<string, unknown>,
  priority: number,
) => Promise<void>;

async function handleReadVatStatus(
  pool: DbPool,
  bot: ReadVatStatusBot,
  data: ReadVatStatusData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  enqueueNext?: EnqueueNextFn,
): Promise<{ vatValidated: string | null }> {
  onProgress(10, 'Lettura stato IVA da Archibald');
  bot.setProgressCallback(async () => {});

  let vatValidated: string | null = null;
  try {
    const result = await bot.readCustomerVatStatus(data.erpId);
    vatValidated = result?.vatValidated ?? null;

    if (vatValidated === 'Sì' || vatValidated === 'Si') {
      await updateVatValidatedAt(pool, userId, data.erpId);
      await updateVatLastBgCheckAt(pool, userId, data.erpId);
      logger.info('readVatStatus: IVA già validata in ERP — persistita', { erpId: data.erpId });
    } else if (data.vatNumber && enqueueNext) {
      await updateVatLastBgCheckAt(pool, userId, data.erpId);
      await enqueueNext('bg-validate-vat', userId, {
        erpId: data.erpId,
        vatNumber: data.vatNumber,
      }, 500);
      logger.info('readVatStatus: catena bg-validate-vat', { erpId: data.erpId });
    }
  } catch (err) {
    logger.warn('readVatStatus: lettura fallita', { error: String(err), erpId: data.erpId });
  }

  onProgress(100, 'Stato IVA aggiornato');
  return { vatValidated };
}

function createReadVatStatusHandler(
  pool: DbPool,
  createBot: (userId: string) => ReadVatStatusBot,
  enqueueNext?: EnqueueNextFn,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as ReadVatStatusData;
    const result = await handleReadVatStatus(pool, bot, typedData, userId, onProgress, enqueueNext);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleReadVatStatus, createReadVatStatusHandler, type ReadVatStatusData, type ReadVatStatusBot };

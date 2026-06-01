import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { CustomerFormInput } from '../../db/repositories/customers';
import { upsertSingleCustomer, setErpDetailReadAt } from '../../db/repositories/customers';
import { logger } from '../../logger';

type RefreshCustomerData = {
  erpId: string;
};

type RefreshCustomerBot = {
  initialize: () => Promise<void>;
  readCustomerFields: (erpId: string) => Promise<CustomerFormInput>;
  close: () => Promise<void>;
};

async function handleRefreshCustomer(
  pool: DbPool,
  bot: RefreshCustomerBot,
  data: RefreshCustomerData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ erpId: string }> {
  const { erpId } = data;

  await bot.initialize();
  try {
    onProgress(40, 'Lettura dati ERP');
    let fields: CustomerFormInput;
    try {
      fields = await bot.readCustomerFields(erpId);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Error.aspx')) {
        logger.warn('handleRefreshCustomer: ERP redirect Error.aspx — cliente non apribile in modifica, skip', { erpId, userId });
        onProgress(100, 'Non aggiornabile (ERP non accessibile)');
        return { erpId };
      }
      throw err;
    }

    onProgress(90, 'Aggiornamento database');
    await upsertSingleCustomer(pool, userId, fields, erpId, 'synced');
    await setErpDetailReadAt(pool, userId, erpId);

    onProgress(100, 'Completato');
    logger.info('handleRefreshCustomer: completato', { erpId, userId });
    return { erpId };
  } finally {
    await bot.close();
  }
}

function createRefreshCustomerHandler(
  pool: DbPool,
  createBot: (userId: string) => RefreshCustomerBot,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as RefreshCustomerData;
    const result = await handleRefreshCustomer(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleRefreshCustomer,
  createRefreshCustomerHandler,
  type RefreshCustomerData,
  type RefreshCustomerBot,
};

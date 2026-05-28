import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { updateVatValidatedAt, updateVatLastBgCheckAt } from '../../db/repositories/customers';
import { logger } from '../../logger';
import { normalizeVatStatus } from './vat-status-normalizer';

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

  if (!data.erpId) {
    logger.warn('readVatStatus: payload mancante erpId — skip');
    onProgress(100, 'Payload non valido');
    return { vatValidated: null };
  }

  let vatValidated: string | null = null;
  try {
    const result = await bot.readCustomerVatStatus(data.erpId);
    vatValidated = result?.vatValidated ?? null;
    const normalized = normalizeVatStatus(vatValidated);

    if (normalized === 'validated') {
      await updateVatValidatedAt(pool, userId, data.erpId);
      await updateVatLastBgCheckAt(pool, userId, data.erpId);
      logger.info('readVatStatus: IVA già validata in ERP — persistita', { erpId: data.erpId });
    } else if (normalized === 'invalid' && data.vatNumber && enqueueNext) {
      // ERP dice esplicitamente "No" → catena Phase 2 per conferma via form edit
      await updateVatLastBgCheckAt(pool, userId, data.erpId);
      await enqueueNext('bg-validate-vat', userId, {
        erpId: data.erpId,
        vatNumber: data.vatNumber,
      }, 500);
      logger.info('readVatStatus: catena bg-validate-vat (ERP=No)', { erpId: data.erpId });
    } else if (normalized === 'unknown' && data.vatNumber && enqueueNext) {
      // Campo vuoto/non trovato → tenta comunque Phase 2
      await updateVatLastBgCheckAt(pool, userId, data.erpId);
      await enqueueNext('bg-validate-vat', userId, {
        erpId: data.erpId,
        vatNumber: data.vatNumber,
      }, 500);
      logger.info('readVatStatus: catena bg-validate-vat (stato sconosciuto)', { erpId: data.erpId });
    }
  } catch (err) {
    // Qualsiasi errore bot (navigazione, login, slot esauriti) → rilancia per Conductor retry.
    // vat_last_bg_check_at NON viene aggiornato: il cliente rimane candidato al prossimo sweep.
    logger.warn('readVatStatus: errore bot — retry da Conductor', { error: String(err), erpId: data.erpId });
    throw err;
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

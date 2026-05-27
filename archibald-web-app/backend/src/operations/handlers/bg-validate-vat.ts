import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { VatLookupResult } from '../../types';
import {
  updateVatValidatedAt,
  updateVatLastBgCheckAt,
  setVatInvalid,
} from '../../db/repositories/customers';
import { logger } from '../../logger';

type BgValidateVatData = {
  erpId: string;
  vatNumber: string;
};

type BroadcastFn = (userId: string, event: { type: string; payload: Record<string, unknown> }) => void;

type BgValidateVatBot = {
  openCustomerAndValidateVat: (erpId: string, vatNumber: string) => Promise<VatLookupResult | null>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleBgValidateVat(
  pool: DbPool,
  bot: BgValidateVatBot,
  data: BgValidateVatData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  broadcast?: BroadcastFn,
): Promise<{ vatValidated: boolean }> {
  onProgress(10, 'Apertura scheda cliente ERP');
  bot.setProgressCallback(async () => {});

  let result: VatLookupResult | null = null;
  try {
    result = await bot.openCustomerAndValidateVat(data.erpId, data.vatNumber);
  } catch (err) {
    logger.warn('bgValidateVat: errore bot', { error: String(err), erpId: data.erpId });
    await updateVatLastBgCheckAt(pool, userId, data.erpId);
    onProgress(100, 'Errore — riproverà al prossimo sweep');
    return { vatValidated: false };
  }

  onProgress(80, 'Lettura risultato P.IVA');
  await updateVatLastBgCheckAt(pool, userId, data.erpId);

  if (result?.vatValidated === 'Sì' || result?.vatValidated === 'Si') {
    await updateVatValidatedAt(pool, userId, data.erpId);
    broadcast?.(userId, { type: 'VAT_BG_VALIDATED', payload: { erpId: data.erpId } });
    logger.info('bgValidateVat: P.IVA validata', { erpId: data.erpId, userId });
    onProgress(100, 'P.IVA validata ✓');
    return { vatValidated: true };
  }

  if (result !== null) {
    await setVatInvalid(pool, userId, data.erpId);
    broadcast?.(userId, {
      type: 'VAT_BG_INVALID',
      payload: { erpId: data.erpId, vatNumber: data.vatNumber },
    });
    logger.warn('bgValidateVat: P.IVA non valida', { erpId: data.erpId, vatNumber: data.vatNumber });
  } else {
    logger.warn('bgValidateVat: bot timeout/null — skip vat_invalid', { erpId: data.erpId });
  }

  onProgress(100, 'Validazione completata');
  return { vatValidated: false };
}

function createBgValidateVatHandler(
  pool: DbPool,
  createBot: (userId: string) => BgValidateVatBot,
  broadcast?: BroadcastFn,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as BgValidateVatData;
    const result = await handleBgValidateVat(pool, bot, typedData, userId, onProgress, broadcast);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleBgValidateVat,
  createBgValidateVatHandler,
  type BgValidateVatData,
  type BgValidateVatBot,
  type BroadcastFn as VatBgBroadcastFn,
};

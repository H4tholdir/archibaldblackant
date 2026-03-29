import type { DbPool } from '../../db/pool';
import type { ParsedDdt, DdtSyncResult } from '../../sync/services/ddt-sync';
import { syncDdt } from '../../sync/services/ddt-sync';
import type { OperationHandler } from '../operation-processor';

type SyncDdtBot = {
  downloadDdtPdf: () => Promise<string>;
};

function createSyncDdtHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedDdt[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncDdtBot,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: DdtSyncResult = await syncDdt(
      { pool, downloadPdf: () => bot.downloadDdtPdf(), parsePdf, cleanupFile },
      userId,
      onProgress,
      () => false,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncDdtHandler, type SyncDdtBot };

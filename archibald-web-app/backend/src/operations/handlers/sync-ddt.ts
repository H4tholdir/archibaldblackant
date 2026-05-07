import type { DbPool } from '../../db/pool';
import type { ParsedDdt, DdtSyncResult } from '../../sync/services/ddt-sync';
import { syncDdt } from '../../sync/services/ddt-sync';
import type { OperationHandler } from '../operation-processor';
import type { DryRunLogger } from '../../conductor/dry-run';

type SyncDdtBot = {
  downloadDdtPdf: () => Promise<string>;
};

type SyncDdtDryRunOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncDdt(
  pool: DbPool,
  bot: SyncDdtBot,
  parsePdf: (pdfPath: string) => Promise<ParsedDdt[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: SyncDdtDryRunOpts = {},
): Promise<DdtSyncResult> {
  return syncDdt(
    { pool, downloadPdf: () => bot.downloadDdtPdf(), parsePdf, cleanupFile, ...opts },
    userId,
    onProgress,
    () => false,
  );
}

function createSyncDdtHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedDdt[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncDdtBot,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: DdtSyncResult = await handleSyncDdt(pool, bot, parsePdf, cleanupFile, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSyncDdt, createSyncDdtHandler, type SyncDdtBot, type SyncDdtDryRunOpts };

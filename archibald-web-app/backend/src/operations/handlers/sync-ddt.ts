import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import type { ParsedDdt, DdtSyncResult } from '../../sync/services/ddt-sync';
import { syncDdt } from '../../sync/services/ddt-sync';
import type { OperationHandler } from '../operation-processor';
import type { DryRunLogger } from '../../conductor/dry-run';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ddtConfig } from '../../sync/scraper/configs/ddt';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import { checkScraperCompleteness, makeCooperativeShouldStop } from './html-sync-utils';
import type { BrowserPoolLike } from './sync-prices';

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

type HtmlSyncDdtDeps = {
  pool: DbPool;
  browserPool: BrowserPoolLike;
};

type HtmlSyncDdtOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncDdtViaHtml(
  deps: HtmlSyncDdtDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: HtmlSyncDdtOpts = {},
): Promise<DdtSyncResult> {
  const { pool, browserPool } = deps;
  const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
  let page: Page | null = null;
  let success = false;

  try {
    page = await ctx.newPage();

    const progressCb = (progress: ScrapeProgress): void => {
      onProgress(
        Math.min(90, progress.currentPage * 15),
        `Scraping DDT: pagina ${progress.currentPage} (${progress.totalRowsSoFar} righe)`,
      );
    };

    const rows = await scrapeListView(page, ddtConfig, progressCb, makeCooperativeShouldStop(pool, userId));

    await checkScraperCompleteness(pool, 'agents.order_ddts', userId, rows.length, 'ddt');

    const result = await syncDdt(
      {
        pool,
        downloadPdf: async () => 'html-scrape',
        parsePdf: async () => rows as ParsedDdt[],
        cleanupFile: async () => {},
        dryRun: opts.dryRun,
        dryRunLogger: opts.dryRunLogger,
      },
      userId,
      onProgress,
      () => false,
    );

    success = true;
    return result;
  } finally {
    if (page) await page.close().catch(() => {});
    await browserPool.releaseContext(userId, ctx, success);
  }
}

export { handleSyncDdt, createSyncDdtHandler, handleSyncDdtViaHtml, type SyncDdtBot, type SyncDdtDryRunOpts, type HtmlSyncDdtDeps, type HtmlSyncDdtOpts };

import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import type { ParsedCustomer, CustomerSyncResult, DeletedProfileInfo, RestoredProfileInfo } from '../../sync/services/customer-sync';
import { syncCustomers } from '../../sync/services/customer-sync';
import type { OperationHandler } from '../operation-processor';
import type { DryRunLogger } from '../../conductor/dry-run';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { customersConfig } from '../../sync/scraper/configs/customers';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import { checkScraperCompleteness, makeCooperativeShouldStop } from './html-sync-utils';
import { PreemptedSignal } from '../../conductor/preempted-signal';
import type { BrowserPoolLike } from './sync-prices';

type SyncCustomersBot = {
  downloadCustomersPdf: () => Promise<string>;
};

type SyncCustomersDryRunOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncCustomers(
  pool: DbPool,
  bot: SyncCustomersBot,
  parsePdf: (pdfPath: string) => Promise<ParsedCustomer[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: SyncCustomersDryRunOpts = {},
  onDeletedCustomers?: (infos: DeletedProfileInfo[]) => Promise<void>,
  onRestoredCustomers?: (infos: RestoredProfileInfo[]) => Promise<void>,
): Promise<CustomerSyncResult> {
  return syncCustomers(
    { pool, downloadPdf: () => bot.downloadCustomersPdf(), parsePdf, cleanupFile, onDeletedCustomers, onRestoredCustomers, ...opts },
    userId,
    onProgress,
    () => false,
  );
}

function createSyncCustomersHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedCustomer[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncCustomersBot,
  onDeletedCustomers?: (infos: DeletedProfileInfo[]) => Promise<void>,
  onRestoredCustomers?: (infos: RestoredProfileInfo[]) => Promise<void>,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: CustomerSyncResult = await handleSyncCustomers(
      pool, bot, parsePdf, cleanupFile, userId, onProgress, {}, onDeletedCustomers, onRestoredCustomers,
    );
    return result as unknown as Record<string, unknown>;
  };
}

type HtmlSyncCustomersDeps = {
  pool: DbPool;
  browserPool: BrowserPoolLike;
  onDeletedCustomers?: (infos: DeletedProfileInfo[]) => Promise<void>;
  onRestoredCustomers?: (infos: RestoredProfileInfo[]) => Promise<void>;
};

type HtmlSyncCustomersOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncCustomersViaHtml(
  deps: HtmlSyncCustomersDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: HtmlSyncCustomersOpts = {},
): Promise<CustomerSyncResult> {
  const { pool, browserPool, onDeletedCustomers, onRestoredCustomers } = deps;
  const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
  let page: Page | null = null;
  let success = false;

  try {
    page = await ctx.newPage();

    const progressCb = (progress: ScrapeProgress): void => {
      onProgress(
        Math.min(90, progress.currentPage * 15),
        `Scraping clienti: pagina ${progress.currentPage} (${progress.totalRowsSoFar} righe)`,
      );
    };

    const { rows, preempted } = await scrapeListView(page, customersConfig, progressCb, makeCooperativeShouldStop(pool, userId));
    if (preempted) {
      throw new PreemptedSignal();
    }

    await checkScraperCompleteness(pool, 'agents.customers', userId, rows.length, 'customers');

    const result = await syncCustomers(
      {
        pool,
        downloadPdf: async () => 'html-scrape',
        parsePdf: async () => rows as ParsedCustomer[],
        cleanupFile: async () => {},
        onDeletedCustomers,
        onRestoredCustomers,
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

export {
  handleSyncCustomers,
  createSyncCustomersHandler,
  handleSyncCustomersViaHtml,
  type SyncCustomersBot,
  type SyncCustomersDryRunOpts,
  type HtmlSyncCustomersDeps,
  type HtmlSyncCustomersOpts,
};

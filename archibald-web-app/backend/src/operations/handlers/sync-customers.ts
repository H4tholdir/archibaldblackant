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
import { logger } from '../../logger';
import { scrapeCustomerAltreInfoTab } from '../../sync/scraper/altre-info-scraper';
import { getCustomersNeedingAltreInfoSync, updateCustomerAltreInfo, updateVatValidatedAt } from '../../db/repositories/customers';
import { config } from '../../config';
export { fixCustomersColumnChooser } from '../../sync/scraper/fix-customers-column-chooser';

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
    const existingPages = await ctx.pages();
    page = existingPages[0] ?? await ctx.newPage();

    const progressCb = (progress: ScrapeProgress): void => {
      onProgress(
        Math.min(90, progress.currentPage * 15),
        `Scraping clienti: pagina ${progress.currentPage} (${progress.totalRowsSoFar} righe)`,
      );
    };

    const syncStartMs = Date.now();
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

    // Phase 2c: sync "Altre informazioni" — max 5 per run per non bloccare il sync principale.
    // Budget temporale: se il sync ListView ha impiegato > 90s saltiamo per questa run.
    if (!opts.dryRun) {
      const syncElapsedMs = Date.now() - syncStartMs;
      if (syncElapsedMs < 90_000) {
        await syncAltreInfoBatch(pool, page, userId, 5);
      } else {
        logger.info('[syncCustomers] Skip "Altre informazioni": sync già durato %ds', Math.round(syncElapsedMs / 1000));
      }
    }

    success = true;
    return result;
  } finally {
    // Page lifecycle is managed by releaseContext (closes all pages on release).
    await browserPool.releaseContext(userId, ctx, success);
  }
}

async function syncAltreInfoBatch(pool: DbPool, page: Page, userId: string, limit = 5): Promise<void> {
  const erpBaseUrl = config.archibald.url;
  const toSync = await getCustomersNeedingAltreInfoSync(pool, userId, limit);

  if (toSync.length === 0) return;

  logger.info('[syncCustomers] Sync "Altre informazioni": %d clienti da aggiornare', toSync.length);

  let synced = 0;
  for (const { erp_id } of toSync) {
    try {
      const data = await scrapeCustomerAltreInfoTab(page, erpBaseUrl, erp_id);
      if (data.ok) {
        const { ok: _ok, vatValidatedByErp: _v, ...fields } = data;
        await updateCustomerAltreInfo(pool, userId, erp_id, fields);
        if (data.vatValidatedByErp === true) {
          await updateVatValidatedAt(pool, userId, erp_id);
        }
        synced++;
      } else {
        logger.warn('[syncCustomers] Scrape "Altre informazioni" fallito per %s', erp_id);
      }
    } catch (err) {
      logger.warn('[syncCustomers] Errore "Altre informazioni" per %s: %s', erp_id, String(err));
    }
  }

  logger.info('[syncCustomers] Sync "Altre informazioni" completato: %d/%d', synced, toSync.length);
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

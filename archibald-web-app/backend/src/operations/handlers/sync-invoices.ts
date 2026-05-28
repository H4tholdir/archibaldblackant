import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import type { ParsedInvoice, InvoiceSyncResult } from '../../sync/services/invoice-sync';
import { syncInvoices } from '../../sync/services/invoice-sync';
import type { OperationHandler } from '../operation-processor';
import type { DryRunLogger } from '../../conductor/dry-run';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { invoicesConfig } from '../../sync/scraper/configs/invoices';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import { checkScraperCompleteness, makeCooperativeShouldStop } from './html-sync-utils';
import { PreemptedSignal } from '../../conductor/preempted-signal';
import type { BrowserPoolLike } from './sync-prices';
import { checkListViewSentinel } from '../../sync/scraper/sentinel-check';
import { getAllFreshnessForUser } from '../../db/repositories/sync-freshness';
import { logger } from '../../logger';

type SyncInvoicesBot = {
  downloadInvoicesPdf: () => Promise<string>;
};

type SyncInvoicesDryRunOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncInvoices(
  pool: DbPool,
  bot: SyncInvoicesBot,
  parsePdf: (pdfPath: string) => Promise<ParsedInvoice[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: SyncInvoicesDryRunOpts = {},
): Promise<InvoiceSyncResult> {
  return syncInvoices(
    { pool, downloadPdf: () => bot.downloadInvoicesPdf(), parsePdf, cleanupFile, ...opts },
    userId,
    onProgress,
    () => false,
  );
}

function createSyncInvoicesHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedInvoice[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncInvoicesBot,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: InvoiceSyncResult = await handleSyncInvoices(pool, bot, parsePdf, cleanupFile, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

type HtmlSyncInvoicesDeps = {
  pool: DbPool;
  browserPool: BrowserPoolLike;
};

type HtmlSyncInvoicesOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncInvoicesViaHtml(
  deps: HtmlSyncInvoicesDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: HtmlSyncInvoicesOpts = {},
): Promise<InvoiceSyncResult> {
  const { pool, browserPool } = deps;
  const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
  let page: Page | null = null;
  let success = false;

  try {
    const existingPages = await ctx.pages();
    page = existingPages[0] ?? await ctx.newPage();

    const freshness = await getAllFreshnessForUser(pool, userId);
    const sentinel = await checkListViewSentinel(page, invoicesConfig.url, freshness['sync-invoices'] ?? null);
    if (sentinel.status === 'unchanged') {
      logger.info('[sync-invoices] sentinel: nessun cambio rilevato — scraping saltato', { userId });
      success = true;
      return { success: true, invoicesProcessed: 0, invoicesUpdated: 0, invoicesSkipped: 0, duration: 0 };
    }

    const progressCb = (progress: ScrapeProgress): void => {
      onProgress(
        Math.min(90, progress.currentPage * 15),
        `Scraping fatture: pagina ${progress.currentPage} (${progress.totalRowsSoFar} righe)`,
      );
    };

    const { rows, preempted } = await scrapeListView(page, invoicesConfig, progressCb, makeCooperativeShouldStop(pool, userId));
    if (preempted) {
      throw new PreemptedSignal();
    }

    await checkScraperCompleteness(pool, 'agents.order_invoices', userId, rows.length, 'invoices');

    const result = await syncInvoices(
      {
        pool,
        downloadPdf: async () => 'html-scrape',
        parsePdf: async () => rows as ParsedInvoice[],
        cleanupFile: async () => {},
        dryRun: opts.dryRun,
        dryRunLogger: opts.dryRunLogger,
      },
      userId,
      onProgress,
      () => false,
    );

    // Il browser ha funzionato — rilasciamo il contesto come healthy.
    // Se syncInvoices ha catturato un errore interno e restituito success:false,
    // rilanciamo il messaggio reale così il Conductor lo storicizza in error_message.
    success = true;
    if (!result.success) {
      throw new Error(result.error ?? 'Invoice sync returned success:false');
    }
    return result;
  } finally {
    // Page lifecycle is managed by releaseContext (closes all pages on release).
    await browserPool.releaseContext(userId, ctx, success);
  }
}

export { handleSyncInvoices, createSyncInvoicesHandler, handleSyncInvoicesViaHtml, type SyncInvoicesBot, type SyncInvoicesDryRunOpts, type HtmlSyncInvoicesDeps, type HtmlSyncInvoicesOpts };

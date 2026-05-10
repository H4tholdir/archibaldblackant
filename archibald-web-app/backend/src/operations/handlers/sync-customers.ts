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
import { getCustomersNeedingAltreInfoSync, updateCustomerAltreInfo } from '../../db/repositories/customers';
import { config } from '../../config';

// Colonne ERP CUSTTABLE aggiunte con update Germania 2026-05-10 — vivono nel custwindow sub-panel
// e non sono visibili nelle righe DOM per default. Vanno attivate via Column Chooser prima dello scraping.
// Pattern: gvCOColumnShow (custwindow) → diverso dal gvCOColumnHide usato per le ListView standard.
const CUSTTABLE_CUSTWINDOW_COL_INDICES = [7, 8, 9, 10, 11, 19]; // EXCLUSIV* + MECHANOGRAPHICNUMBER

async function fixCustomersColumnChooser(page: Page): Promise<void> {
  const cellCount = await page.evaluate(() => {
    const row = document.querySelector('tr.dxgvDataRow_XafTheme, tr[class*="dxgvDataRow"]');
    return row ? row.querySelectorAll('td').length : 0;
  });

  if (cellCount >= 34) {
    logger.info('[syncCustomers] Column Chooser già applicato (%d celle), skip', cellCount);
    return;
  }

  logger.info('[syncCustomers] Applico Column Chooser custwindow (%d celle → 34)', cellCount);

  await page.evaluate(() => {
    const w = window as any;
    const gk = Object.keys(w).find(k => typeof w[k]?.ShowCustomizationDialog === 'function');
    if (gk) w[gk].ShowCustomizationDialog();
  });

  const dialogOpen = await page.waitForSelector('[id*="DXCDWindow"]', { timeout: 4000 })
    .then(() => true)
    .catch(() => false);

  if (!dialogOpen) {
    logger.warn('[syncCustomers] Column Chooser dialog non aperto, skip');
    return;
  }

  await page.evaluate(() => {
    const tab = document.querySelector('[id$="DXCDWindow_DXCDPageControl_T3T"]') as HTMLElement | null;
    tab?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  let enabled = 0;
  for (const idx of CUSTTABLE_CUSTWINDOW_COL_INDICES) {
    const found = await page.evaluate((i: number) => {
      const gridKey = Object.keys(window as any).find(k => typeof (window as any)[k]?.ShowCustomizationDialog === 'function');
      if (!gridKey) return false;
      const item = document.getElementById(`${gridKey}_3_drag_C${i}`) ||
                   document.getElementById(`${gridKey}_DXCDWindow_FieldChooserPage`)
                     ?.querySelector(`[id*="_3_drag_C${i}"]`);
      const eye = item?.querySelector('[class*="gvCOColumnShow"]') as HTMLElement | null;
      if (eye) { eye.click(); return true; }
      return false;
    }, idx);
    if (found) enabled++;
    await new Promise(r => setTimeout(r, 100));
  }

  const applied = await page.evaluate(() => {
    const btn = document.querySelector('[id$="DXCDWindow_DXCBtn201"]') as HTMLElement | null;
    if (btn && !btn.className.includes('Disabled')) { btn.click(); return true; }
    return false;
  });

  logger.info('[syncCustomers] Column Chooser: enabled=%d, applied=%s', enabled, applied);
  if (applied) await new Promise(r => setTimeout(r, 2000));
}

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

    await fixCustomersColumnChooser(page);
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

    // Phase 2c: sync "Altre informazioni" per i clienti ancora non sincronizzati (max 50 per run)
    if (!opts.dryRun) {
      await syncAltreInfoBatch(pool, page, userId);
    }

    success = true;
    return result;
  } finally {
    // Page lifecycle is managed by releaseContext (closes all pages on release).
    await browserPool.releaseContext(userId, ctx, success);
  }
}

async function syncAltreInfoBatch(pool: DbPool, page: Page, userId: string): Promise<void> {
  const erpBaseUrl = config.archibald.url;
  const toSync = await getCustomersNeedingAltreInfoSync(pool, userId, 50);

  if (toSync.length === 0) return;

  logger.info('[syncCustomers] Sync "Altre informazioni": %d clienti da aggiornare', toSync.length);

  let synced = 0;
  for (const { erp_id } of toSync) {
    try {
      const data = await scrapeCustomerAltreInfoTab(page, erpBaseUrl, erp_id);
      if (data.ok) {
        const { ok: _ok, ...fields } = data;
        await updateCustomerAltreInfo(pool, userId, erp_id, fields);
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

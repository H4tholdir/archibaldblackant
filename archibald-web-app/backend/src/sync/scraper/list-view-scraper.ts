import type { Page } from 'puppeteer';
import type { ScraperConfig, ScrapedRow } from './types';
import { logger } from '../../logger';
import {
  waitForDevExpressIdle,
  getGridFieldMap,
  gotoFirstPage,
  setGridPageSize,
  getVisibleRowCount,
  hasNextPage,
  goToNextPage,
  ensureFilterValue,
  restoreFilterValue,
  forceGridRefreshViaFilterToggle,
} from './devexpress-utils';
import { buildRowExtractor } from './header-mapper';

type ScrapeProgress = {
  currentPage: number;
  rowsOnPage: number;
  totalRowsSoFar: number;
};

/**
 * Extract ALL rows from the current grid page using the DevExpress GetRowValues API.
 * This completely bypasses DOM scraping — no offset issues, no phantom cells,
 * no JavaScript markup in cells, no rendering differences between pages.
 *
 * GetRowValues(rowIndex, fieldNames, callback) returns values for the requested
 * fields from the grid's data source. For rows ON the current page, this is
 * instantaneous (cached client-side). For rows OFF the current page, it would
 * trigger a server callback (slow) — but since we paginate, we only request
 * rows on the current page.
 */
async function extractPageRowsViaApi(
  page: Page,
  fieldNames: string[],
): Promise<string[][]> {
  const fieldStr = fieldNames.join(';');

  return page.evaluate((fields: string, fNames: string[]) => {
    return new Promise<string[][]>((resolve) => {
      const w = window as any;
      const gn = Object.keys(w).find((k) => {
        try {
          return w[k]?.GetRowValues && typeof w[k].GetRowValues === 'function' && w[k]?.GetColumn;
        } catch { return false; }
      });
      if (!gn) return resolve([]);

      const grid = w[gn];
      const visibleRows = grid.GetVisibleRowsOnPage();
      if (visibleRows === 0) return resolve([]);

      const results: string[][] = [];
      let completed = 0;

      for (let r = 0; r < visibleRows; r++) {
        grid.GetRowValues(r, fields, (values: any[]) => {
          // Convert all values to strings (matching the old DOM extraction behavior)
          results[r] = values.map((v: any) => v == null ? '' : String(v));
          completed++;
          if (completed >= visibleRows) resolve(results);
        });
      }

      // Safety timeout: if some callbacks never fire
      setTimeout(() => resolve(results.filter(Boolean)), 30000);
    });
  }, fieldStr, fieldNames);
}

async function scrapeListView(
  page: Page,
  config: ScraperConfig,
  onProgress?: (progress: ScrapeProgress) => void,
  shouldStop?: () => boolean,
): Promise<ScrapedRow[]> {
  const pageSize = config.pageSize ?? 200;
  let originalXafValue: string | null = null;
  let filterControlId: string | undefined;

  await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForDevExpressIdle(page);

  await gotoFirstPage(page);

  if (config.filter) {
    const filterResult = await ensureFilterValue(
      page,
      config.filter.xafValuePattern,
      config.filter.xafAllValue,
    );
    originalXafValue = filterResult.originalXafValue;
    filterControlId = filterResult.controlId;
  }

  try {
    await setGridPageSize(page, pageSize);

    const { fieldMap } = await getGridFieldMap(page);

    const missingColumns = config.columns.filter((col) => !(col.fieldName in fieldMap));
    if (missingColumns.length > 0) {
      logger.warn('Missing columns in grid: %s', missingColumns.map((c) => c.fieldName).join(', '));
    }

    // Build the list of fieldNames sorted by visibleIndex
    const apiFieldNames = Object.keys(fieldMap).sort((a, b) => fieldMap[a] - fieldMap[b]);

    // Try API extraction first (reliable, no DOM offset issues).
    // Some pages (DDT, Invoices) don't support GetRowValues — detect and fall back to DOM.
    const useApiExtraction = await page.evaluate((fields: string) => {
      return new Promise<boolean>((resolve) => {
        const w = window as any;
        const gn = Object.keys(w).find((k) => {
          try { return w[k]?.GetRowValues && typeof w[k].GetRowValues === 'function' && w[k]?.GetColumn; }
          catch { return false; }
        });
        if (!gn || w[gn].GetVisibleRowsOnPage() === 0) return resolve(false);
        let answered = false;
        w[gn].GetRowValues(0, fields, (values: unknown[]) => {
          if (!answered) { answered = true; resolve(values[0] != null); }
        });
        setTimeout(() => { if (!answered) { answered = true; resolve(false); } }, 5000);
      });
    }, apiFieldNames.join(';'));

    if (useApiExtraction) {
      logger.info('[scraper] Using GetRowValues API extraction (%d fields)', apiFieldNames.length);
    } else {
      logger.info('[scraper] GetRowValues not available — falling back to DOM extraction');

      // Workaround: some pages (DDT, Invoices) have empty DOM on first load.
      // Toggle the filter to force the server to send cell data.
      if (config.filterToggleWorkaround) {
        const hasData = await page.evaluate(() => {
          const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
          return Array.from(rows).some(r =>
            Array.from(r.querySelectorAll('td')).some(c => {
              const t = (c.textContent || '').trim();
              return t && t !== 'N/A' && !t.startsWith('<!--') && t.length > 1;
            }),
          );
        });

        if (!hasData) {
          logger.info('[scraper] DOM is empty — applying filter toggle workaround');
          const { filterInputSelector, listboxSelector, tempItemTexts, finalItemTexts } = config.filterToggleWorkaround;
          await forceGridRefreshViaFilterToggle(page, filterInputSelector, listboxSelector, tempItemTexts, finalItemTexts);
        }
      }
    }

    const extractor = buildRowExtractor(config.columns, fieldMap);
    const allRows: ScrapedRow[] = [];
    let currentPage = 1;

    // For DOM fallback: calculate offset = totalDomCells - visibleApiColumns
    let domOffset = 0;
    if (!useApiExtraction) {
      const { systemColumnCount } = await getGridFieldMap(page);
      domOffset = systemColumnCount;
      // Also check DOM for extra cells beyond what API reports
      const domCellCount = await page.evaluate(() => {
        const row = document.querySelector('tr.dxgvDataRow_XafTheme, tr[class*="dxgvDataRow"]');
        return row ? row.querySelectorAll('td').length : 0;
      });
      const totalApiVisible = apiFieldNames.length + systemColumnCount;
      if (domCellCount > totalApiVisible) {
        // DDT/Invoices have extra cells — offset = domCells - dataColumns
        domOffset = domCellCount - apiFieldNames.length;
      }
      logger.info('[scraper] DOM offset: %d (domCells=%d, apiFields=%d)', domOffset, domCellCount, apiFieldNames.length);
    }

    while (true) {
      const rowCount = await getVisibleRowCount(page);

      if (rowCount > 0) {
        let cellRows: string[][];
        if (useApiExtraction) {
          cellRows = await extractPageRowsViaApi(page, apiFieldNames);
        } else {
          // DOM fallback: extract cells and skip the offset
          cellRows = await page.evaluate((offset: number) => {
            const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
            const target = rows.length > 0 ? rows : document.querySelectorAll('tr[class*="dxgvDataRow"]');
            return Array.from(target).map((row) => {
              const cells = row.querySelectorAll('td');
              return Array.from(cells).slice(offset).map((c) => c.textContent?.trim() ?? '');
            });
          }, domOffset);
        }
        const extracted = cellRows.map(extractor);
        allRows.push(...extracted);

        onProgress?.({
          currentPage,
          rowsOnPage: cellRows.length,
          totalRowsSoFar: allRows.length,
        });
      }

      if (shouldStop?.()) {
        logger.info('Scraping stopped by shouldStop at page %d', currentPage);
        break;
      }

      const morePages = await hasNextPage(page);
      if (!morePages) break;

      await goToNextPage(page);
      currentPage++;
    }

    logger.info('Scraping complete: %d rows from %d pages', allRows.length, currentPage);
    return allRows;
  } finally {
    if (originalXafValue !== null) {
      await restoreFilterValue(page, originalXafValue, filterControlId);
    }
  }
}

export { scrapeListView };
export type { ScrapeProgress };

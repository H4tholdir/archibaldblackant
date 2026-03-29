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
} from './devexpress-utils';
import { buildRowExtractor } from './header-mapper';

type ScrapeProgress = {
  currentPage: number;
  rowsOnPage: number;
  totalRowsSoFar: number;
};

async function detectSystemColumnOffset(page: Page): Promise<number> {
  // Use the grid API to count system columns (fieldName === "")
  // This is MORE RELIABLE than DOM inspection because empty data cells
  // can be mistaken for system cells.
  const apiCount = await page.evaluate(() => {
    const w = window as any;
    const gn = Object.keys(w).find((k) => {
      try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; }
      catch { return false; }
    });
    if (!gn) return 0;
    const grid = w[gn];
    let systemCols = 0;
    let i = 0;
    while (true) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (col.visible !== false && (!col.fieldName || col.fieldName === '')) {
          systemCols++;
        }
        i++;
      } catch { break; }
    }
    return systemCols;
  });

  // The DOM may have MORE cells than the API reports as visible columns
  // (e.g., DDT has 22 cells but 17+1 visible columns).
  // Use the API count as a baseline, but verify against DOM.
  // The actual offset = max(apiCount, dom-detected-markup-cells)
  const domOffset = await page.evaluate(() => {
    const row = document.querySelector('tr.dxgvDataRow_XafTheme') ||
                document.querySelector('tr[class*="dxgvDataRow"]');
    if (!row) return 0;
    const cells = row.querySelectorAll('td');
    let offset = 0;
    for (let i = 0; i < Math.min(cells.length, 5); i++) {
      const html = cells[i].innerHTML;
      // ONLY detect by positive markup indicators — NOT by empty text
      const isDefinitelySystem =
        html.includes('<!--') ||
        html.includes('dxICheckBox') ||
        html.includes('type="checkbox"') ||
        html.includes('AddDisabledItems');
      if (isDefinitelySystem) offset++;
      else break;
    }
    return offset;
  });

  return Math.max(apiCount, domOffset);
}

async function extractPageRows(page: Page, systemColumnOffset: number): Promise<string[][]> {
  return page.evaluate((offset: number) => {
    const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
    const target = rows.length > 0
      ? rows
      : document.querySelectorAll('tr[class*="dxgvDataRow"]');

    return Array.from(target).map((row) => {
      const cells = row.querySelectorAll('td');
      const dataCells = Array.from(cells).slice(offset);
      return dataCells.map((cell) => cell.textContent?.trim() ?? '');
    });
  }, systemColumnOffset);
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

    const systemColumnOffset = await detectSystemColumnOffset(page);
    logger.info('[scraper] Detected %d system column(s) to skip', systemColumnOffset);

    const extractor = buildRowExtractor(config.columns, fieldMap);
    const allRows: ScrapedRow[] = [];
    let currentPage = 1;

    while (true) {
      const rowCount = await getVisibleRowCount(page);

      if (rowCount > 0) {
        const cellRows = await extractPageRows(page, systemColumnOffset);
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

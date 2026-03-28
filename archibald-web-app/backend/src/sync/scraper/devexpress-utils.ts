import type { Page } from 'puppeteer';
import { logger } from '../../logger';

const DEFAULT_IDLE_TIMEOUT = 15000;
const POLL_INTERVAL = 200;
const STABLE_COUNT_REQUIRED = 3;

async function waitForDevExpressIdle(page: Page, timeout = DEFAULT_IDLE_TIMEOUT): Promise<void> {
  await page.waitForFunction(
    (stableRequired: number) => {
      const w = window as any;

      const hasLoadingPanel = document.querySelector(
        '.dxgvLoadingPanel_XafTheme, .dxlp, [class*="LoadingPanel"]',
      );
      if (hasLoadingPanel && (hasLoadingPanel as HTMLElement).offsetParent !== null) {
        w.__dxIdleCount = 0;
        return false;
      }

      let anyInCallback = false;
      const collection = w.ASPxClientControl?.GetControlCollection?.();
      if (collection && typeof collection.ForEachControl === 'function') {
        collection.ForEachControl((c: any) => {
          if (typeof c.InCallback === 'function' && c.InCallback()) {
            anyInCallback = true;
          }
        });
      }
      if (anyInCallback) {
        w.__dxIdleCount = 0;
        return false;
      }

      w.__dxIdleCount = (w.__dxIdleCount || 0) + 1;
      return w.__dxIdleCount >= stableRequired;
    },
    { timeout, polling: POLL_INTERVAL },
    STABLE_COUNT_REQUIRED,
  );
}

async function getGridFieldMap(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const w = window as any;

    const gridName = Object.keys(w).find((k) => {
      try {
        return w[k]?.GetColumn && typeof w[k].GetColumn === 'function';
      } catch {
        return false;
      }
    });
    if (!gridName) return {};

    const grid = w[gridName];
    const columns: Array<{ fieldName: string; visibleIndex: number }> = [];
    let i = 0;

    while (true) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (col.visible !== false && col.fieldName) {
          columns.push({ fieldName: col.fieldName, visibleIndex: col.visibleIndex });
        }
        i++;
      } catch {
        break;
      }
    }

    columns.sort((a, b) => a.visibleIndex - b.visibleIndex);

    const map: Record<string, number> = {};
    columns.forEach((col, idx) => {
      map[col.fieldName] = idx;
    });
    return map;
  });
}

async function setGridPageSize(page: Page, size: number): Promise<void> {
  await page.evaluate((pageSize: number) => {
    const w = window as any;
    const gridName = Object.keys(w).find((k) => {
      try {
        return w[k]?.PerformCallback && typeof w[k].PerformCallback === 'function'
          && w[k]?.GetColumn && typeof w[k].GetColumn === 'function';
      } catch {
        return false;
      }
    });
    if (gridName) {
      w[gridName].PerformCallback(`PAGESIZE|${pageSize}`);
    }
  }, size);

  await waitForDevExpressIdle(page);
}

async function getVisibleRowCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
    if (rows.length > 0) return rows.length;

    return document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
  });
}

async function hasNextPage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const w = window as any;
    const gridName = Object.keys(w).find((k) => {
      try {
        return w[k]?.GetPageIndex && typeof w[k].GetPageIndex === 'function';
      } catch {
        return false;
      }
    });
    if (!gridName) return false;

    const grid = w[gridName];
    return grid.GetPageIndex() < grid.GetPageCount() - 1;
  });
}

async function goToNextPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    const gridName = Object.keys(w).find((k) => {
      try {
        return w[k]?.NextPage && typeof w[k].NextPage === 'function';
      } catch {
        return false;
      }
    });
    if (gridName) {
      w[gridName].NextPage();
    }
  });

  await waitForDevExpressIdle(page);
}

type FilterResult = { originalXafValue: string | null; controlId: string | undefined };

async function ensureFilterValue(
  page: Page,
  xafValuePattern: string,
  xafAllValue: string,
): Promise<FilterResult> {
  const result = await page.evaluate((pattern: string, allValue: string) => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(
      'input[name*="mainMenu"][name*="Cb"]',
    ));

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      if (input.name.endsWith('Cb_VI') || input.name.includes('Cb$DDD$L')) continue;

      const controlId = input.name.replace(/\$/g, '_');
      const w = window as any;
      const ctrl = w[controlId];
      if (!ctrl || typeof ctrl.GetValue !== 'function') continue;

      const currentValue = ctrl.GetValue() as string | null;
      if (!currentValue || !currentValue.includes(pattern)) continue;

      if (currentValue === allValue) {
        return { found: true as const, controlId, originalXafValue: null };
      }

      return { found: true as const, controlId, originalXafValue: currentValue };
    }

    return { found: false as const };
  }, xafValuePattern, xafAllValue) as
    | { found: false }
    | { found: true; controlId: string; originalXafValue: string | null };

  if (!result.found) {
    logger.warn('[scraper] Filter combo not found — no input matches pattern', { xafValuePattern });
    return { originalXafValue: null, controlId: undefined };
  }

  if (result.originalXafValue === null) {
    return { originalXafValue: null, controlId: result.controlId };
  }

  logger.info('[scraper] Changing filter from %s to %s (ctrl: %s)', result.originalXafValue, xafAllValue, result.controlId);

  await page.evaluate((ctrlId: string, targetValue: string) => {
    const w = window as any;
    const ctrl = w[ctrlId];
    if (ctrl && typeof ctrl.SetValue === 'function') {
      ctrl.SetValue(targetValue);
    }
  }, result.controlId, xafAllValue);

  await waitForDevExpressIdle(page);

  return { originalXafValue: result.originalXafValue, controlId: result.controlId };
}

async function restoreFilterValue(page: Page, originalXafValue: string, controlId?: string): Promise<void> {
  await page.evaluate((targetValue: string, ctrlId: string | undefined) => {
    if (!ctrlId) return;
    const w = window as any;
    const ctrl = w[ctrlId];
    if (ctrl && typeof ctrl.SetValue === 'function') {
      ctrl.SetValue(targetValue);
    }
  }, originalXafValue, controlId);

  await waitForDevExpressIdle(page);
}

export {
  waitForDevExpressIdle,
  getGridFieldMap,
  setGridPageSize,
  getVisibleRowCount,
  hasNextPage,
  goToNextPage,
  ensureFilterValue,
  restoreFilterValue,
};

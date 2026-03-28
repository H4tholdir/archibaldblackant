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

async function ensureFilterValue(
  page: Page,
  safeValue: string,
  safeValueAlt?: string,
): Promise<string | null> {
  const currentText = await page.evaluate(() => {
    const w = window as any;
    const collection = w.ASPxClientControl?.GetControlCollection?.();
    if (!collection) return null;

    let comboText: string | null = null;
    if (typeof collection.ForEachControl === 'function') {
      collection.ForEachControl((c: any) => {
        if (typeof c.GetText === 'function' && typeof c.SetText === 'function'
          && typeof c.ShowDropDown === 'function' && !comboText) {
          comboText = c.GetText();
        }
      });
    }
    return comboText;
  }) as string | null;

  if (currentText === safeValue) return null;
  if (safeValueAlt && currentText === safeValueAlt) return null;

  logger.info('Changing filter from %s to %s', currentText, safeValue);

  await page.evaluate((targetValue: string) => {
    const w = window as any;
    const collection = w.ASPxClientControl?.GetControlCollection?.();
    if (!collection) return;

    if (typeof collection.ForEachControl === 'function') {
      collection.ForEachControl((c: any) => {
        if (typeof c.SetText === 'function' && typeof c.ShowDropDown === 'function') {
          const item = c.FindItemByText?.(targetValue);
          if (item) {
            c.SetSelectedItem(item);
          } else {
            c.SetText(targetValue);
          }
        }
      });
    }
  }, safeValue);

  await waitForDevExpressIdle(page);

  return currentText;
}

async function restoreFilterValue(page: Page, originalText: string): Promise<void> {
  await page.evaluate((targetValue: string) => {
    const w = window as any;
    const collection = w.ASPxClientControl?.GetControlCollection?.();
    if (!collection) return;

    if (typeof collection.ForEachControl === 'function') {
      collection.ForEachControl((c: any) => {
        if (typeof c.SetText === 'function' && typeof c.ShowDropDown === 'function') {
          const item = c.FindItemByText?.(targetValue);
          if (item) {
            c.SetSelectedItem(item);
          } else {
            c.SetText(targetValue);
          }
        }
      });
    }
  }, originalText);

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

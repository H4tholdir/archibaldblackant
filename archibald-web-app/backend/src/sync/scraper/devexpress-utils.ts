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

type FilterResult = { originalValue: string | null; comboName: string | undefined };

async function ensureFilterValue(
  page: Page,
  safeValue: string,
  safeValueAlt?: string,
): Promise<FilterResult> {
  // Find the CORRECT combo — the one that contains safeValue in its items.
  // Pages can have multiple ComboBox controls (e.g. View selector + Data filter).
  // We must only change the data filter, not the view selector.
  const result = await page.evaluate((safe: string, safeAlt: string | undefined) => {
    const w = window as any;
    const collection = w.ASPxClientControl?.GetControlCollection?.();
    if (!collection) return { found: false as const };

    let targetComboName: string | null = null;
    let currentText: string | null = null;

    if (typeof collection.ForEachControl === 'function') {
      collection.ForEachControl((c: any, name: string) => {
        if (targetComboName) return; // already found
        if (typeof c.GetText !== 'function' || typeof c.ShowDropDown !== 'function') return;
        if (typeof c.FindItemByText !== 'function') return;

        // Check if this combo contains our safe value as an item
        const hasSafe = c.FindItemByText(safe);
        const hasSafeAlt = safeAlt ? c.FindItemByText(safeAlt) : null;

        if (hasSafe || hasSafeAlt) {
          targetComboName = name;
          currentText = c.GetText();
        }
      });
    }

    if (!targetComboName) return { found: false as const };
    return { found: true as const, comboName: targetComboName, currentText };
  }, safeValue, safeValueAlt) as { found: false } | { found: true; comboName: string; currentText: string | null };

  if (!result.found) {
    logger.warn('[scraper] Filter combo not found — safe value not in any combo items', { safeValue });
    return { originalValue: null, comboName: undefined };
  }

  if (result.currentText === safeValue) return { originalValue: null, comboName: result.comboName };
  if (safeValueAlt && result.currentText === safeValueAlt) return { originalValue: null, comboName: result.comboName };

  logger.info('[scraper] Changing filter from %s to %s (combo: %s)', result.currentText, safeValue, result.comboName);

  // Set the value ONLY on the identified combo, not all combos
  await page.evaluate((comboName: string, targetValue: string) => {
    const w = window as any;
    const combo = w[comboName];
    if (!combo) return;

    const item = combo.FindItemByText?.(targetValue);
    if (item) {
      combo.SetSelectedItem(item);
    }
  }, result.comboName, safeValue);

  await waitForDevExpressIdle(page);

  return { originalValue: result.currentText, comboName: result.comboName };
}

async function restoreFilterValue(page: Page, originalText: string, comboName?: string): Promise<void> {
  await page.evaluate((targetValue: string, name: string | undefined) => {
    const w = window as any;

    // If we know the combo name, use it directly
    if (name && w[name]) {
      const item = w[name].FindItemByText?.(targetValue);
      if (item) w[name].SetSelectedItem(item);
      return;
    }

    // Fallback: find combo that contains the target value
    const collection = w.ASPxClientControl?.GetControlCollection?.();
    if (!collection) return;
    if (typeof collection.ForEachControl === 'function') {
      collection.ForEachControl((c: any) => {
        if (typeof c.FindItemByText !== 'function') return;
        const item = c.FindItemByText(targetValue);
        if (item) c.SetSelectedItem(item);
      });
    }
  }, originalText, comboName);

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

import type { Page } from 'puppeteer';
import { logger } from '../../logger';

const DEFAULT_IDLE_TIMEOUT = 15000;
const POLL_INTERVAL = 200;
const STABLE_COUNT_REQUIRED = 3;

async function waitForDevExpressIdle(page: Page, timeout = DEFAULT_IDLE_TIMEOUT): Promise<void> {
  // Reset the stable-count tracker so every call genuinely waits for 3 consecutive
  // idle polls — without this, a leftover high count from a previous call would cause
  // the very first poll to pass immediately, masking in-flight server callbacks.
  await page.evaluate(() => { (window as any).__dxIdleCount = 0; });

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

type GridFieldMapResult = {
  fieldMap: Record<string, number>;
  systemColumnCount: number;
};

async function getGridFieldMap(page: Page): Promise<GridFieldMapResult> {
  return page.evaluate(() => {
    const w = window as any;

    const gridName = Object.keys(w).find((k) => {
      try {
        return w[k]?.GetColumn && typeof w[k].GetColumn === 'function';
      } catch {
        return false;
      }
    });
    if (!gridName) return { fieldMap: {}, systemColumnCount: 0 };

    const grid = w[gridName];
    const allColumns: Array<{ fieldName: string; visibleIndex: number; visible: boolean }> = [];
    let i = 0;

    while (true) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (col.visible !== false) {
          allColumns.push({
            fieldName: col.fieldName ?? '',
            visibleIndex: col.visibleIndex,
            visible: true,
          });
        }
        i++;
      } catch {
        break;
      }
    }

    allColumns.sort((a, b) => a.visibleIndex - b.visibleIndex);

    let systemColumnCount = 0;
    const map: Record<string, number> = {};
    let dataIndex = 0;

    for (const col of allColumns) {
      if (!col.fieldName) {
        systemColumnCount++;
      } else {
        map[col.fieldName] = dataIndex;
        dataIndex++;
      }
    }

    return { fieldMap: map, systemColumnCount };
  });
}

async function gotoFirstPage(page: Page): Promise<void> {
  const wasNotFirst = await page.evaluate(() => {
    const w = window as any;
    const gridName = Object.keys(w).find((k) => {
      try {
        return w[k]?.GotoPage && typeof w[k].GotoPage === 'function' && w[k]?.GetColumn;
      } catch {
        return false;
      }
    });
    if (gridName && w[gridName].GetPageIndex() !== 0) {
      w[gridName].GotoPage(0);
      return true;
    }
    return false;
  });

  if (wasNotFirst) {
    await waitForDevExpressIdle(page);
    logger.info('[scraper] Reset grid to page 0 (was on a different page)');
  }
}

async function setGridPageSize(page: Page, size: number): Promise<void> {
  const changed = await page.evaluate((pageSize: number) => {
    const w = window as any;

    // Find the pager's PSI input element
    const psi = document.querySelector('input[id*="DXPagerBottom_PSI"]') as HTMLInputElement | null;
    if (!psi) return false;

    // Check if already the right size
    if (psi.value === String(pageSize)) return false;

    // Derive the pager ID: "...DXPagerBottom_PSI" → "...DXPagerBottom"
    const pagerId = psi.id.replace('_PSI', '');

    // Set the input value
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(psi, String(pageSize));
    else psi.value = String(pageSize);

    // Trigger ASPx.POnPageSizeBlur — the DevExpress internal handler that
    // submits the page size change to the server via callback
    if (typeof w.ASPx?.POnPageSizeBlur === 'function') {
      w.ASPx.POnPageSizeBlur(pagerId, new Event('blur'));
      return true;
    }

    return false;
  }, size);

  if (changed) {
    await waitForDevExpressIdle(page);
    logger.info('[scraper] Page size set to %d', size);
  }
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
  const result = await page.evaluate((_pattern: string, allValue: string) => {
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

      // Identify the combo by checking if the current XAF value OR any item value
      // relates to this filter. Two strategies:
      // 1. Check if current value matches the allValue exactly (already correct)
      // 2. Check if current value contains a pattern from the allValue
      //    (e.g. "PackingSlipsThisMonth" and "PackingSlipsAll" both contain "PackingSlips")
      // 3. Fallback: check if GetItemCount > 1 (it's a filter combo, not a view selector)
      const currentValue = ctrl.GetValue() as string | null;
      if (!currentValue) continue;

      // Extract the entity-specific part from allValue for broad matching
      // e.g. "xaf_xaf_a2ListViewPackingSlipsAll" → check if current contains "PackingSlips"
      //      "xaf_xaf_a2All_invoices" → check if current contains "invoices" (case insensitive)
      const allValueLower = allValue.toLowerCase();
      const currentLower = currentValue.toLowerCase();

      // Strategy: both current and target must share the same xaf prefix structure
      // All XAF filter values start with "xaf_xaf_a" followed by a digit
      const currentPrefix = currentValue.match(/^xaf_xaf_a\d+/)?.[0];
      const allPrefix = allValue.match(/^xaf_xaf_a\d+/)?.[0];
      if (!currentPrefix || !allPrefix || currentPrefix !== allPrefix) continue;

      // This is our combo. Check if already at the "all" value.
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

/**
 * Workaround for DDT/Invoices pages where the grid DOM is empty on first load.
 * Toggles the filter (e.g. "Tutti" → "Oggi" → "Tutti") to force the server to
 * send cell data. SetValue/SetSelectedIndex do NOT trigger a server callback on
 * these pages — only real mouse events on the listbox items do.
 *
 * Strategy:
 *   1. Open dropdown via ctrl.ShowDropDown() (no stale element reference)
 *   2. Find the target listbox <td> by display text
 *   3. Puppeteer elementHandle.click() → fires full mousedown+mouseup+click sequence
 *   4. Wait for DevExpress idle (the click triggers a real server callback)
 *   5. Repeat for the second selection ("Tutti")
 */
async function forceGridRefreshViaFilterToggle(
  page: Page,
  filterInputSelector: string,
  tempItemTexts: string[],
  finalItemTexts: string[],
): Promise<boolean> {
  // Resolve the control ID from the input's name attribute
  const ctrlId = await page.evaluate((inputSel: string) => {
    const input = document.querySelector<HTMLInputElement>(inputSel);
    if (!input) return null;
    const id = input.name.replace(/\$/g, '_');
    const w = window as any;
    return w[id]?.GetItemCount ? id : null;
  }, filterInputSelector);

  if (!ctrlId) {
    logger.warn('[scraper] forceGridRefresh: filter combo not found (%s)', filterInputSelector);
    return false;
  }

  // Listbox items are td elements inside #{ctrlId}_DDD_L
  const listboxSel = `#${ctrlId}_DDD_L td`;

  const clickDropdownItem = async (targetTexts: string[], label: string): Promise<boolean> => {
    // Open the dropdown via the DevExpress API
    await page.evaluate((id: string) => { (window as any)[id].ShowDropDown(); }, ctrlId);
    await new Promise(r => setTimeout(r, 600));

    // Locate the target td by display text — Puppeteer evaluateHandle returns a live DOM node
    const handle = await page.evaluateHandle(
      (sel: string, texts: string[]) => {
        const tds = Array.from(document.querySelectorAll<HTMLElement>(sel));
        return tds.find(td => texts.includes((td.textContent ?? '').trim())) ?? null;
      },
      listboxSel,
      targetTexts,
    );

    const el = handle.asElement() as import('puppeteer').ElementHandle<Element> | null;
    if (!el) {
      logger.warn('[scraper] forceGridRefresh: "%s" item not found in listbox', label);
      return false;
    }

    // Real Puppeteer click fires mousedown + mouseup + click — exactly what DevExpress needs
    await el.click();
    logger.info('[scraper] forceGridRefresh: clicked "%s"', label);
    await waitForDevExpressIdle(page);
    return true;
  };

  logger.info('[scraper] forceGridRefresh: opening filter dropdown (ctrl: %s)', ctrlId);

  const tempOk = await clickDropdownItem(tempItemTexts, tempItemTexts[0]);
  if (!tempOk) return false;

  const allOk = await clickDropdownItem(finalItemTexts, finalItemTexts[0]);
  if (!allOk) return false;

  logger.info('[scraper] forceGridRefresh: done');
  return true;
}

export {
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
};
export type { GridFieldMapResult };

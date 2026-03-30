/**
 * AUTOPSY of the Orders ListView page on Archibald ERP.
 *
 * Usage:
 *   ARCHIBALD_USERNAME=ikiA0930 ARCHIBALD_PASSWORD=Fresis26@ \
 *   node archibald-web-app/backend/scripts/diagnose-orders-listview.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASSWORD = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const SCREENSHOT_DIR = '/Users/hatholdir/Downloads/Archibald/docs/diagnostics';
const REPORT_PATH = path.join(SCREENSHOT_DIR, 'orders-listview-autopsy-raw.json');

const report = {};

function log(section, msg) {
  console.log(`[${section}] ${msg}`);
}

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `diag-${name}-${Date.now()}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage: true });
    log('SCREENSHOT', filePath);
    return filePath;
  } catch (e) {
    log('SCREENSHOT', `FAILED: ${e.message}`);
    return null;
  }
}

async function waitForDevExpressIdle(page, timeout = 20000) {
  await page.waitForFunction(
    (stableRequired) => {
      const w = window;
      const hasLoadingPanel = document.querySelector(
        '.dxgvLoadingPanel_XafTheme, .dxlp, [class*="LoadingPanel"]'
      );
      if (hasLoadingPanel && hasLoadingPanel.offsetParent !== null) {
        w.__dxIdleCount = 0;
        return false;
      }
      let anyInCallback = false;
      const collection = w.ASPxClientControl?.GetControlCollection?.();
      if (collection && typeof collection.ForEachControl === 'function') {
        collection.ForEachControl((c) => {
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
    { timeout, polling: 200 },
    3
  );
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    // ================================================================
    // FASE 1: Login
    // ================================================================
    log('FASE1', 'Navigating to login page...');
    await page.goto(`${ARCHIBALD_URL}/Login.aspx`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });

    // Find username and password fields
    const usernameField = await page.$('input[type="text"][id*="UserName"], input[type="text"][name*="UserName"]');
    const passwordField = await page.$('input[type="password"]');

    if (!usernameField || !passwordField) {
      // Try broader selectors
      const allInputs = await page.$$('input');
      log('FASE1', `Found ${allInputs.length} inputs on login page`);
    }

    await usernameField.type(USERNAME, { delay: 50 });
    await passwordField.type(PASSWORD, { delay: 50 });

    // Click login button
    const loginBtn = await page.$('button[id*="Logon"], a[id*="Logon"], .dxm-content [id*="Logon"], [id*="Logon_PopupActions_Menu"]');
    if (loginBtn) {
      await loginBtn.click();
    } else {
      // Try to find button by text
      await page.evaluate(() => {
        const elements = [...document.querySelectorAll('*')];
        const btn = elements.find(el => el.textContent?.trim() === 'Accedi' || el.textContent?.trim() === 'Log In');
        if (btn) btn.click();
      });
    }

    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    const postLoginUrl = page.url();
    log('FASE1', `Post-login URL: ${postLoginUrl}`);
    report.fase1 = { postLoginUrl };

    await screenshot(page, '01-post-login');

    // ================================================================
    // FASE 1b: Navigate to Orders ListView
    // ================================================================
    log('FASE1', 'Navigating to SALESTABLE_ListView_Agent...');
    await page.goto(`${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for grid to load
    try {
      await waitForDevExpressIdle(page, 25000);
    } catch (e) {
      log('FASE1', `DevExpress idle wait failed: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 2000));
    await screenshot(page, '02-orders-listview-initial');

    // ================================================================
    // FASE 2: Stato iniziale della griglia
    // ================================================================
    log('FASE2', 'Analyzing initial grid state...');

    const fase2 = await page.evaluate(() => {
      const result = {};

      // 1. Count visible rows
      const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
      result.visibleRowsByExact = rows.length;

      const rowsFallback = document.querySelectorAll('tr[class*="dxgvDataRow"]');
      result.visibleRowsByFallback = rowsFallback.length;

      // 2. Find the grid object
      const w = window;
      let gridName = null;
      let grid = null;
      for (const k of Object.keys(w)) {
        try {
          if (w[k]?.GetColumn && typeof w[k].GetColumn === 'function' &&
              w[k]?.GetPageIndex && typeof w[k].GetPageIndex === 'function') {
            gridName = k;
            grid = w[k];
            break;
          }
        } catch {}
      }
      result.gridName = gridName;

      if (grid) {
        result.pageIndex = grid.GetPageIndex();
        result.pageCount = grid.GetPageCount();

        // Try to get visible row count via API
        try { result.visibleRowCountAPI = grid.GetVisibleRowsOnPage?.(); } catch {}
        try { result.topVisibleIndex = grid.GetTopVisibleIndex?.(); } catch {}
      }

      // 3. Find PSI input for page size
      const psi = document.querySelector('input[id*="DXPagerBottom_PSI"]');
      result.psiFound = !!psi;
      if (psi) {
        result.psiId = psi.id;
        result.psiValue = psi.value;
        result.psiName = psi.name;
      }

      // Also check DXPagerTop
      const psiTop = document.querySelector('input[id*="DXPagerTop_PSI"]');
      result.psiTopFound = !!psiTop;
      if (psiTop) {
        result.psiTopId = psiTop.id;
        result.psiTopValue = psiTop.value;
      }

      // 4. Check for "no data" messages
      const noData = document.querySelector('.dxgvEmptyDataRow_XafTheme, [class*="EmptyData"]');
      result.hasNoDataMessage = !!noData;
      if (noData) {
        result.noDataText = noData.textContent?.trim();
      }

      // 5. Check for loading panel
      const loading = document.querySelector('.dxgvLoadingPanel_XafTheme, .dxlp, [class*="LoadingPanel"]');
      result.hasLoadingPanel = !!loading;
      if (loading) {
        result.loadingPanelVisible = loading.offsetParent !== null;
      }

      // 6. Check page summary text (e.g., "Page 1 of 5 (943 items)")
      const pagerCells = document.querySelectorAll('.dxpSummary_XafTheme, [class*="pSummary"], td[class*="dxpButton"]');
      result.pagerTexts = Array.from(pagerCells).map(el => el.textContent?.trim()).filter(Boolean);

      // Look for any pager text
      const allPagerElements = document.querySelectorAll('[class*="dxp"], [class*="Pager"]');
      result.allPagerTexts = Array.from(allPagerElements)
        .map(el => ({
          className: el.className,
          text: el.textContent?.trim().substring(0, 100)
        }))
        .filter(item => item.text);

      return result;
    });

    report.fase2 = fase2;
    log('FASE2', JSON.stringify(fase2, null, 2));

    // ================================================================
    // FASE 3: Filtro (Combo analysis)
    // ================================================================
    log('FASE3', 'Analyzing filter combos...');

    const fase3 = await page.evaluate(() => {
      const result = {};
      const w = window;

      // Find ALL inputs matching the combo pattern
      const inputs = Array.from(document.querySelectorAll('input'));
      const comboInputs = inputs.filter(inp =>
        inp.name?.includes('mainMenu') ||
        inp.id?.includes('mainMenu') ||
        inp.name?.includes('Cb') ||
        inp.id?.includes('Cb')
      );

      result.totalComboInputsFound = comboInputs.length;
      result.comboDetails = comboInputs.map(inp => ({
        id: inp.id,
        name: inp.name,
        value: inp.value,
        type: inp.type,
        hidden: inp.type === 'hidden',
      }));

      // Find DevExpress combo controls
      const comboControls = [];
      const collection = w.ASPxClientControl?.GetControlCollection?.();
      if (collection && typeof collection.ForEachControl === 'function') {
        collection.ForEachControl((ctrl) => {
          if (typeof ctrl.GetValue === 'function' && typeof ctrl.GetItemCount === 'function') {
            try {
              const controlId = ctrl.name || ctrl.clientID || 'unknown';
              const currentValue = ctrl.GetValue();
              const itemCount = ctrl.GetItemCount();
              const items = [];
              for (let i = 0; i < itemCount; i++) {
                try {
                  const item = ctrl.GetItem(i);
                  items.push({
                    index: i,
                    text: item?.text || item?.GetText?.() || '',
                    value: item?.value || item?.GetValue?.() || '',
                  });
                } catch {}
              }
              comboControls.push({
                controlId,
                currentValue,
                itemCount,
                items,
                controlType: ctrl.constructor?.name || typeof ctrl,
              });
            } catch {}
          }
        });
      }

      result.comboControls = comboControls;

      // Specifically look for the filter combo with xaf_xaf pattern
      const filterCombo = comboControls.find(c => {
        const val = String(c.currentValue || '');
        return val.includes('xaf_xaf_a') || val.includes('ListView');
      });
      result.filterCombo = filterCombo || null;

      return result;
    });

    report.fase3_initial = fase3;
    log('FASE3', `Found ${fase3.comboControls?.length} combo controls`);
    log('FASE3', `Filter combo: ${JSON.stringify(fase3.filterCombo?.currentValue)}`);
    if (fase3.filterCombo) {
      log('FASE3', `Filter items: ${JSON.stringify(fase3.filterCombo.items)}`);
    }

    // FASE 3b: Change to "All Orders" if needed
    const currentFilterValue = fase3.filterCombo?.currentValue;
    const targetFilter = 'xaf_xaf_a2ListViewSalesTableOrdersAll';

    if (currentFilterValue && currentFilterValue !== targetFilter) {
      log('FASE3', `Changing filter from "${currentFilterValue}" to "${targetFilter}"...`);

      await page.evaluate((ctrlId, targetValue) => {
        const w = window;
        const ctrl = w[ctrlId];
        if (ctrl && typeof ctrl.SetValue === 'function') {
          ctrl.SetValue(targetValue);
        }
      }, fase3.filterCombo.controlId, targetFilter);

      try {
        await waitForDevExpressIdle(page, 30000);
      } catch (e) {
        log('FASE3', `Idle wait after filter change failed: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 3000));

      const afterFilter = await page.evaluate(() => {
        const w = window;
        const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
        let grid = null;
        for (const k of Object.keys(w)) {
          try {
            if (w[k]?.GetPageIndex && typeof w[k].GetPageIndex === 'function' &&
                w[k]?.GetColumn && typeof w[k].GetColumn === 'function') {
              grid = w[k];
              break;
            }
          } catch {}
        }
        return {
          visibleRows: rows.length,
          pageIndex: grid?.GetPageIndex?.(),
          pageCount: grid?.GetPageCount?.(),
        };
      });

      report.fase3_afterFilter = afterFilter;
      log('FASE3', `After filter change: ${JSON.stringify(afterFilter)}`);
      await screenshot(page, '03-after-filter-change');
    } else if (currentFilterValue === targetFilter) {
      log('FASE3', 'Filter is already set to "All Orders"');
      report.fase3_afterFilter = { note: 'Already at All Orders' };
    } else {
      log('FASE3', 'No filter combo found, skipping filter change');
      report.fase3_afterFilter = { note: 'No filter combo found' };
    }

    // ================================================================
    // FASE 4: Page Size
    // ================================================================
    log('FASE4', 'Analyzing page size...');

    const fase4_before = await page.evaluate(() => {
      const psi = document.querySelector('input[id*="DXPagerBottom_PSI"]');
      return {
        psiFound: !!psi,
        psiValue: psi?.value,
        psiId: psi?.id,
      };
    });
    report.fase4_before = fase4_before;
    log('FASE4', `Current PSI: ${JSON.stringify(fase4_before)}`);

    // Try to set page size to 200
    log('FASE4', 'Attempting to set page size to 200...');

    const pageSizeResult = await page.evaluate(() => {
      const w = window;
      const psi = document.querySelector('input[id*="DXPagerBottom_PSI"]');
      if (!psi) return { success: false, reason: 'PSI input not found' };

      const pagerId = psi.id.replace('_PSI', '');
      const currentValue = psi.value;

      // Method 1: ASPx.POnPageSizeBlur
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(psi, '200');
      else psi.value = '200';

      if (typeof w.ASPx?.POnPageSizeBlur === 'function') {
        try {
          w.ASPx.POnPageSizeBlur(pagerId, new Event('blur'));
          return { success: true, method: 'ASPx.POnPageSizeBlur', pagerId, previousValue: currentValue };
        } catch (e) {
          return { success: false, method: 'ASPx.POnPageSizeBlur', error: e.message, pagerId };
        }
      }

      return { success: false, reason: 'ASPx.POnPageSizeBlur not available' };
    });

    report.fase4_setResult = pageSizeResult;
    log('FASE4', `Page size set result: ${JSON.stringify(pageSizeResult)}`);

    if (pageSizeResult.success) {
      try {
        await waitForDevExpressIdle(page, 30000);
      } catch (e) {
        log('FASE4', `Idle wait after page size change failed: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    const fase4_after = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
      const psi = document.querySelector('input[id*="DXPagerBottom_PSI"]');
      const w = window;
      let grid = null;
      for (const k of Object.keys(w)) {
        try {
          if (w[k]?.GetPageIndex && typeof w[k].GetPageIndex === 'function' &&
              w[k]?.GetColumn && typeof w[k].GetColumn === 'function') {
            grid = w[k];
            break;
          }
        } catch {}
      }
      return {
        visibleRows: rows.length,
        pageIndex: grid?.GetPageIndex?.(),
        pageCount: grid?.GetPageCount?.(),
        psiValue: psi?.value,
      };
    });

    report.fase4_after = fase4_after;
    log('FASE4', `After page size change: ${JSON.stringify(fase4_after)}`);
    await screenshot(page, '04-after-pagesize-200');

    // ================================================================
    // FASE 5: Paginazione
    // ================================================================
    log('FASE5', 'Testing pagination...');

    // Go to page 0
    log('FASE5', 'Going to page 0...');
    await page.evaluate(() => {
      const w = window;
      for (const k of Object.keys(w)) {
        try {
          if (w[k]?.GotoPage && typeof w[k].GotoPage === 'function' &&
              w[k]?.GetColumn && typeof w[k].GetColumn === 'function') {
            w[k].GotoPage(0);
            break;
          }
        } catch {}
      }
    });

    try {
      await waitForDevExpressIdle(page, 20000);
    } catch (e) {
      log('FASE5', `Idle wait failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));

    const page0 = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
      const w = window;
      let grid = null;
      for (const k of Object.keys(w)) {
        try {
          if (w[k]?.GetPageIndex && typeof w[k].GetPageIndex === 'function' &&
              w[k]?.GetColumn && typeof w[k].GetColumn === 'function') {
            grid = w[k];
            break;
          }
        } catch {}
      }
      return {
        visibleRows: rows.length,
        pageIndex: grid?.GetPageIndex?.(),
        pageCount: grid?.GetPageCount?.(),
      };
    });

    report.fase5_page0 = page0;
    log('FASE5', `Page 0: ${JSON.stringify(page0)}`);

    // Go to page 1
    log('FASE5', 'Going to page 1...');
    await page.evaluate(() => {
      const w = window;
      for (const k of Object.keys(w)) {
        try {
          if (w[k]?.GotoPage && typeof w[k].GotoPage === 'function' &&
              w[k]?.GetColumn && typeof w[k].GetColumn === 'function') {
            w[k].GotoPage(1);
            break;
          }
        } catch {}
      }
    });

    try {
      await waitForDevExpressIdle(page, 20000);
    } catch (e) {
      log('FASE5', `Idle wait failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));

    const page1 = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
      const w = window;
      let grid = null;
      for (const k of Object.keys(w)) {
        try {
          if (w[k]?.GetPageIndex && typeof w[k].GetPageIndex === 'function' &&
              w[k]?.GetColumn && typeof w[k].GetColumn === 'function') {
            grid = w[k];
            break;
          }
        } catch {}
      }
      return {
        visibleRows: rows.length,
        pageIndex: grid?.GetPageIndex?.(),
        pageCount: grid?.GetPageCount?.(),
      };
    });

    report.fase5_page1 = page1;
    log('FASE5', `Page 1: ${JSON.stringify(page1)}`);

    // Go back to page 0 — does it reset correctly?
    log('FASE5', 'Going back to page 0...');
    await page.evaluate(() => {
      const w = window;
      for (const k of Object.keys(w)) {
        try {
          if (w[k]?.GotoPage && typeof w[k].GotoPage === 'function' &&
              w[k]?.GetColumn && typeof w[k].GetColumn === 'function') {
            w[k].GotoPage(0);
            break;
          }
        } catch {}
      }
    });

    try {
      await waitForDevExpressIdle(page, 20000);
    } catch (e) {
      log('FASE5', `Idle wait failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));

    const page0_again = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
      const w = window;
      let grid = null;
      for (const k of Object.keys(w)) {
        try {
          if (w[k]?.GetPageIndex && typeof w[k].GetPageIndex === 'function' &&
              w[k]?.GetColumn && typeof w[k].GetColumn === 'function') {
            grid = w[k];
            break;
          }
        } catch {}
      }
      return {
        visibleRows: rows.length,
        pageIndex: grid?.GetPageIndex?.(),
        pageCount: grid?.GetPageCount?.(),
      };
    });

    report.fase5_page0_again = page0_again;
    log('FASE5', `Page 0 (again): ${JSON.stringify(page0_again)}`);

    // ================================================================
    // FASE 6: Struttura dati delle righe (Field Map + Samples)
    // ================================================================
    log('FASE6', 'Analyzing grid structure and data...');

    const fase6 = await page.evaluate(() => {
      const w = window;
      let grid = null;
      let gridName = null;
      for (const k of Object.keys(w)) {
        try {
          if (w[k]?.GetColumn && typeof w[k].GetColumn === 'function' &&
              w[k]?.GetPageIndex && typeof w[k].GetPageIndex === 'function') {
            grid = w[k];
            gridName = k;
            break;
          }
        } catch {}
      }

      if (!grid) return { error: 'Grid not found' };

      const result = { gridName };

      // 1. Complete column map
      const columns = [];
      let i = 0;
      while (true) {
        try {
          const col = grid.GetColumn(i);
          if (!col) break;
          columns.push({
            index: i,
            fieldName: col.fieldName || null,
            visible: col.visible !== false,
            visibleIndex: col.visibleIndex,
            name: col.name || null,
            caption: col.caption || null,
            width: col.width || null,
          });
          i++;
        } catch {
          break;
        }
      }
      result.totalColumns = columns.length;
      result.visibleColumns = columns.filter(c => c.visible);
      result.hiddenColumns = columns.filter(c => !c.visible);

      // 2. Build field map (sorted by visibleIndex, visible only)
      const sortedVisible = columns
        .filter(c => c.visible && c.fieldName)
        .sort((a, b) => a.visibleIndex - b.visibleIndex);

      result.fieldMap = {};
      sortedVisible.forEach((col, idx) => {
        result.fieldMap[col.fieldName] = idx;
      });

      // 3. Extract 3 sample rows from DOM
      const dataRows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
      result.domSampleRows = [];
      for (let r = 0; r < Math.min(3, dataRows.length); r++) {
        const cells = dataRows[r].querySelectorAll('td');
        result.domSampleRows.push(Array.from(cells).map(cell => cell.textContent?.trim() ?? ''));
      }

      // 4. Extract last 3 rows too (to check if data varies)
      result.domLastRows = [];
      for (let r = Math.max(0, dataRows.length - 3); r < dataRows.length; r++) {
        const cells = dataRows[r].querySelectorAll('td');
        result.domLastRows.push(Array.from(cells).map(cell => cell.textContent?.trim() ?? ''));
      }

      // 5. Check for alternating row styles
      result.rowClasses = [];
      for (let r = 0; r < Math.min(5, dataRows.length); r++) {
        result.rowClasses.push(dataRows[r].className);
      }

      // 6. Count cells per row in first 5 rows
      result.cellsPerRow = [];
      for (let r = 0; r < Math.min(5, dataRows.length); r++) {
        result.cellsPerRow.push(dataRows[r].querySelectorAll('td').length);
      }

      return result;
    });

    report.fase6 = fase6;
    log('FASE6', `Grid name: ${fase6.gridName}`);
    log('FASE6', `Total columns: ${fase6.totalColumns}`);
    log('FASE6', `Visible columns: ${fase6.visibleColumns?.length}`);
    log('FASE6', `Field map: ${JSON.stringify(fase6.fieldMap, null, 2)}`);
    log('FASE6', `Cells per row (first 5): ${JSON.stringify(fase6.cellsPerRow)}`);
    log('FASE6', `DOM sample row 0: ${JSON.stringify(fase6.domSampleRows?.[0])}`);

    // FASE 6b: Try GetRowValues API for comparison
    log('FASE6', 'Testing GetRowValues API...');

    const fase6b_api = await page.evaluate(() => {
      return new Promise((resolve) => {
        const w = window;
        let grid = null;
        for (const k of Object.keys(w)) {
          try {
            if (w[k]?.GetColumn && typeof w[k].GetColumn === 'function' &&
                w[k]?.GetRowValues && typeof w[k].GetRowValues === 'function') {
              grid = w[k];
              break;
            }
          } catch {}
        }

        if (!grid) return resolve({ error: 'Grid not found for GetRowValues' });

        // Get visible field names
        const fieldNames = [];
        let i = 0;
        while (true) {
          try {
            const col = grid.GetColumn(i);
            if (!col) break;
            if (col.visible !== false && col.fieldName) {
              fieldNames.push(col.fieldName);
            }
            i++;
          } catch { break; }
        }

        // Try to get row 0 values
        const results = [];
        let completed = 0;
        const rowsToGet = [0, 1, 2];

        for (const rowIdx of rowsToGet) {
          try {
            grid.GetRowValues(rowIdx, fieldNames.join(';'), (values) => {
              results.push({ rowIndex: rowIdx, values, fieldNames });
              completed++;
              if (completed >= rowsToGet.length) {
                resolve({ apiResults: results, fieldNames });
              }
            });
          } catch (e) {
            results.push({ rowIndex: rowIdx, error: e.message });
            completed++;
            if (completed >= rowsToGet.length) {
              resolve({ apiResults: results, fieldNames });
            }
          }
        }

        // Timeout after 10 seconds
        setTimeout(() => {
          resolve({ apiResults: results, fieldNames, timedOut: true, completed });
        }, 10000);
      });
    });

    report.fase6b_api = fase6b_api;
    log('FASE6', `API results: ${JSON.stringify(fase6b_api, null, 2)}`);

    // ================================================================
    // FASE 7: Edge cases
    // ================================================================
    log('FASE7', 'Testing edge cases...');

    // 7a: Navigate away and back
    log('FASE7', 'Navigating away and back...');
    await page.goto(`${ARCHIBALD_URL}/Default.aspx`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 2000));

    await page.goto(`${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    try {
      await waitForDevExpressIdle(page, 25000);
    } catch (e) {
      log('FASE7', `Idle wait failed after navigate back: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 3000));

    const afterNavigateBack = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
      const psi = document.querySelector('input[id*="DXPagerBottom_PSI"]');
      const w = window;
      let grid = null;
      for (const k of Object.keys(w)) {
        try {
          if (w[k]?.GetPageIndex && typeof w[k].GetPageIndex === 'function' &&
              w[k]?.GetColumn && typeof w[k].GetColumn === 'function') {
            grid = w[k];
            break;
          }
        } catch {}
      }

      // Check if the filter combo still has the same value
      let filterValue = null;
      const collection = w.ASPxClientControl?.GetControlCollection?.();
      if (collection && typeof collection.ForEachControl === 'function') {
        collection.ForEachControl((ctrl) => {
          if (typeof ctrl.GetValue === 'function') {
            try {
              const val = String(ctrl.GetValue() || '');
              if (val.includes('xaf_xaf_a')) {
                filterValue = val;
              }
            } catch {}
          }
        });
      }

      return {
        visibleRows: rows.length,
        pageIndex: grid?.GetPageIndex?.(),
        pageCount: grid?.GetPageCount?.(),
        psiValue: psi?.value,
        filterValue,
        note: 'State AFTER navigating away and back',
      };
    });

    report.fase7_navigateBack = afterNavigateBack;
    log('FASE7', `After navigate back: ${JSON.stringify(afterNavigateBack)}`);
    await screenshot(page, '07-after-navigate-back');

    // 7b: Check for loading panels/spinners
    const loadingElements = await page.evaluate(() => {
      const selectors = [
        '.dxgvLoadingPanel_XafTheme',
        '.dxlp',
        '[class*="LoadingPanel"]',
        '.dxgvLoadingDiv_XafTheme',
        '[class*="LoadingDiv"]',
        '.dx-loading-panel',
      ];
      return selectors.map(sel => ({
        selector: sel,
        count: document.querySelectorAll(sel).length,
        visible: Array.from(document.querySelectorAll(sel)).filter(el => el.offsetParent !== null).length,
      }));
    });
    report.fase7_loadingElements = loadingElements;
    log('FASE7', `Loading elements: ${JSON.stringify(loadingElements)}`);

    // ================================================================
    // FASE 8: Callback Analysis
    // ================================================================
    log('FASE8', 'Setting up callback listeners...');

    // First, make sure we're on the orders page with grid loaded
    // Register callback listeners
    await page.evaluate(() => {
      const w = window;
      w.__diagCallbackLog = [];

      let grid = null;
      let gridName = null;
      for (const k of Object.keys(w)) {
        try {
          if (w[k]?.GetColumn && typeof w[k].GetColumn === 'function' &&
              w[k]?.BeginCallback && typeof w[k].BeginCallback?.AddHandler === 'function') {
            grid = w[k];
            gridName = k;
            break;
          }
        } catch {}
      }

      if (!grid) {
        w.__diagCallbackLog.push({ error: 'Grid not found for callback registration' });
        return;
      }

      w.__diagGridName = gridName;

      grid.BeginCallback.AddHandler((s, e) => {
        w.__diagCallbackLog.push({
          type: 'BeginCallback',
          timestamp: Date.now(),
          command: e?.command || null,
          commandArg: s?.callbackArg || null,
        });
      });

      grid.EndCallback.AddHandler((s, e) => {
        const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
        w.__diagCallbackLog.push({
          type: 'EndCallback',
          timestamp: Date.now(),
          visibleRows: rows.length,
          pageIndex: grid.GetPageIndex(),
          pageCount: grid.GetPageCount(),
        });
      });

      w.__diagCallbackLog.push({ type: 'LISTENERS_REGISTERED', gridName });
    });

    // 8a: Trigger a page change callback
    log('FASE8', 'Testing page change callback...');
    await page.evaluate(() => {
      const w = window;
      const grid = w[w.__diagGridName];
      if (grid) grid.GotoPage(1);
    });

    try {
      await waitForDevExpressIdle(page, 20000);
    } catch (e) {
      log('FASE8', `Idle wait failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));

    // Go back
    await page.evaluate(() => {
      const w = window;
      const grid = w[w.__diagGridName];
      if (grid) grid.GotoPage(0);
    });

    try {
      await waitForDevExpressIdle(page, 20000);
    } catch (e) {
      log('FASE8', `Idle wait failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));

    const callbackLog = await page.evaluate(() => window.__diagCallbackLog);
    report.fase8_callbacks = callbackLog;
    log('FASE8', `Callback log: ${JSON.stringify(callbackLog, null, 2)}`);

    // ================================================================
    // FASE EXTRA: Deep DOM analysis for row extraction reliability
    // ================================================================
    log('EXTRA', 'Deep DOM analysis...');

    const extraAnalysis = await page.evaluate(() => {
      const result = {};

      // 1. Check all tables on the page
      const tables = document.querySelectorAll('table');
      result.totalTables = tables.length;

      // 2. Check the main grid table
      const gridTable = document.querySelector('table[class*="dxgvTable"], table[id*="DXMainTable"]');
      result.gridTableFound = !!gridTable;
      if (gridTable) {
        result.gridTableId = gridTable.id;
        result.gridTableClass = gridTable.className;
      }

      // 3. Check header row
      const headerRows = document.querySelectorAll('tr.dxgvHeader_XafTheme, tr[class*="dxgvHeader"]');
      result.headerRowCount = headerRows.length;
      if (headerRows.length > 0) {
        const headerCells = headerRows[0].querySelectorAll('td, th');
        result.headerTexts = Array.from(headerCells).map(cell => cell.textContent?.trim() ?? '');
      }

      // 4. Check for group rows (which could confuse row counting)
      const groupRows = document.querySelectorAll('tr.dxgvGroupRow_XafTheme, tr[class*="GroupRow"]');
      result.groupRowCount = groupRows.length;

      // 5. Check for detail rows (expanded sub-grids)
      const detailRows = document.querySelectorAll('tr.dxgvDetailRow_XafTheme, tr[class*="DetailRow"]');
      result.detailRowCount = detailRows.length;

      // 6. Check for filter row
      const filterRow = document.querySelector('tr.dxgvFilterRow_XafTheme, tr[class*="FilterRow"]');
      result.hasFilterRow = !!filterRow;

      // 7. Check pager structure
      const pagerBottom = document.querySelector('[id*="DXPagerBottom"]');
      result.pagerBottomFound = !!pagerBottom;
      if (pagerBottom) {
        result.pagerBottomHTML = pagerBottom.innerHTML?.substring(0, 500);
      }

      // 8. Check if there are iframes that might contain data
      const iframes = document.querySelectorAll('iframe');
      result.iframeCount = iframes.length;

      // 9. Check ASPx global state
      const w = window;
      result.hasASPx = !!w.ASPx;
      result.hasASPxClientControl = !!w.ASPxClientControl;
      result.viewstateLength = document.querySelector('#__VIEWSTATE')?.value?.length || 0;

      return result;
    });

    report.extra = extraAnalysis;
    log('EXTRA', `Header texts: ${JSON.stringify(extraAnalysis.headerTexts)}`);
    log('EXTRA', `Tables on page: ${extraAnalysis.totalTables}`);
    log('EXTRA', `Group rows: ${extraAnalysis.groupRowCount}`);
    log('EXTRA', `VIEWSTATE length: ${extraAnalysis.viewstateLength}`);

    // ================================================================
    // SAVE REPORT
    // ================================================================
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    log('DONE', `Raw report saved to ${REPORT_PATH}`);

    // Final screenshot
    await screenshot(page, '99-final-state');

    // Print summary
    console.log('\n\n========================================');
    console.log('DIAGNOSTIC SUMMARY');
    console.log('========================================');
    console.log(`Grid name: ${fase6.gridName}`);
    console.log(`Initial rows: ${fase2.visibleRowsByExact}`);
    console.log(`Initial page: ${fase2.pageIndex} / ${fase2.pageCount}`);
    console.log(`Initial page size (PSI): ${fase2.psiValue}`);
    console.log(`Filter combo value: ${fase3.filterCombo?.currentValue || 'NOT FOUND'}`);
    console.log(`Filter items: ${fase3.filterCombo?.items?.map(i => i.text).join(', ') || 'N/A'}`);
    console.log(`After filter change rows: ${report.fase3_afterFilter?.visibleRows}`);
    console.log(`After filter change pages: ${report.fase3_afterFilter?.pageCount}`);
    console.log(`After page size=200 rows: ${fase4_after.visibleRows}`);
    console.log(`After page size=200 pages: ${fase4_after.pageCount}`);
    console.log(`Page 0 rows: ${page0.visibleRows}`);
    console.log(`Page 1 rows: ${page1.visibleRows}`);
    console.log(`Page 0 (return) rows: ${page0_again.visibleRows}`);
    console.log(`Visible columns: ${fase6.visibleColumns?.length}`);
    console.log(`Cells per row: ${JSON.stringify(fase6.cellsPerRow)}`);
    console.log(`Navigate back state preserved: filter=${afterNavigateBack.filterValue}, rows=${afterNavigateBack.visibleRows}, pageSize=${afterNavigateBack.psiValue}`);
    console.log('========================================\n');

  } catch (err) {
    console.error('FATAL ERROR:', err);
    await screenshot(page, 'ERROR');
    report.fatalError = err.message;
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  } finally {
    // Don't close the browser so the user can inspect
    log('DONE', 'Browser left open for inspection. Close manually when done.');
    // Wait indefinitely
    await new Promise(r => setTimeout(r, 600000));
    await browser.close();
  }
}

main();

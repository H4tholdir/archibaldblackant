/**
 * Diagnostic: multi-selection on SALESTABLE_ListView_Agent.
 *
 * Goals:
 *  1. Identify checkbox column structure in the DevExpress grid
 *  2. Understand how to select multiple rows (checkbox click vs ASPxGridView API)
 *  3. Verify toolbar buttons react correctly to multi-row selection
 *  4. Document selectors and JS APIs needed for batch send/delete
 *
 * Usage:
 *   ARCHIBALD_USERNAME=ikiA0930 ARCHIBALD_PASSWORD=Fresis26@ \
 *   node archibald-web-app/backend/scripts/diag-multiselect-orders.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASSWORD = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const SCREENSHOT_DIR = '/Users/hatholdir/Downloads/Archibald/docs/diagnostics';

const report = {};

function log(section, msg) {
  console.log(`[${section}] ${msg}`);
}

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `diag-multisel-${name}-${Date.now()}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage: false });
    log('SCREENSHOT', filePath);
  } catch (e) {
    log('SCREENSHOT', `FAILED: ${e.message}`);
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

async function login(page) {
  log('LOGIN', 'Navigating to login page...');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7' });
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForSelector('input[type="text"]', { timeout: 10000 });
  await page.waitForSelector('input[type="password"]', { timeout: 10000 });

  const filled = await page.evaluate((user, pass) => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
    const userInput = inputs.find(i =>
      i.name?.includes('UserName') ||
      i.placeholder?.toLowerCase().includes('account') ||
      i.placeholder?.toLowerCase().includes('username'),
    ) || inputs[0];
    const passwordField = document.querySelector('input[type="password"]');
    if (!userInput || !passwordField) return false;

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    userInput.focus();
    userInput.click();
    if (setter) setter.call(userInput, user); else userInput.value = user;
    userInput.dispatchEvent(new Event('input', { bubbles: true }));
    userInput.dispatchEvent(new Event('change', { bubbles: true }));

    passwordField.focus();
    passwordField.click();
    if (setter) setter.call(passwordField, pass); else passwordField.value = pass;
    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
    passwordField.dispatchEvent(new Event('change', { bubbles: true }));

    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a, div[role="button"]'));
    const loginBtn = buttons.find(btn => {
      const text = (btn.textContent || '').toLowerCase().replace(/\s+/g, '');
      return text.includes('accedi') || text === 'login';
    }) || buttons.find(btn => {
      const id = (btn.id || '').toLowerCase();
      if (id.includes('logo')) return false;
      return id.includes('login') || id.includes('logon');
    });
    if (loginBtn) loginBtn.click();
    return true;
  }, USERNAME, PASSWORD);

  if (!filled) throw new Error('Login form fields not found');

  await page.waitForFunction(
    () => !window.location.href.includes('Login.aspx'),
    { timeout: 30000 },
  );
  await new Promise(r => setTimeout(r, 2000));
  log('LOGIN', `Post-login URL: ${page.url()}`);
}

async function navigateToOrders(page) {
  log('NAV', 'Navigating to SALESTABLE_ListView_Agent...');
  await page.goto(`${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  try {
    await waitForDevExpressIdle(page, 20000);
  } catch (e) {
    log('NAV', `Idle wait timeout: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 1500));
}

async function setFilterTutti(page) {
  log('FILTER', 'Setting filter to "Tutti gli ordini"...');
  await page.evaluate(() => {
    const collection = window.ASPxClientControl?.GetControlCollection?.();
    if (!collection) return;
    collection.ForEachControl((c) => {
      if (c.name?.includes('criteriaList') || c.name?.toLowerCase().includes('filter')) {
        if (typeof c.SetSelectedIndex === 'function') c.SetSelectedIndex(0);
      }
    });
  });
  // Try clicking the combo that shows filter options
  const filterClicked = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input, select, [class*="dxeT"]')];
    const filterInput = inputs.find(el => {
      const val = el.value || el.textContent || '';
      return val.toLowerCase().includes('ordini') || val.toLowerCase().includes('order');
    });
    if (filterInput) {
      filterInput.click();
      return true;
    }
    return false;
  });
  log('FILTER', `Filter click attempt: ${filterClicked}`);
  await new Promise(r => setTimeout(r, 1000));
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
    // ===== FASE 1: Login + Navigate =====
    await login(page);
    await navigateToOrders(page);
    await screenshot(page, '01-initial');

    // ===== FASE 2: Analyze grid structure =====
    log('FASE2', 'Analyzing grid row/cell structure...');
    const gridStructure = await page.evaluate(() => {
      const result = {};

      // Count rows
      const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
      result.rowCount = rows.length;

      if (rows.length === 0) {
        result.note = 'No rows found — possibly filter active or empty list';
        return result;
      }

      // Inspect first row cells
      const firstRow = rows[0];
      const cells = firstRow.querySelectorAll('td');
      result.cellCount = cells.length;
      result.cells = [...cells].map((td, i) => ({
        index: i,
        class: td.className,
        id: td.id,
        innerHTML: td.innerHTML.substring(0, 200),
      }));

      // Look for checkboxes anywhere in the grid
      const checkboxes = document.querySelectorAll('tr[class*="dxgvDataRow"] input[type="checkbox"]');
      result.checkboxCount = checkboxes.length;
      if (checkboxes.length > 0) {
        const cb = checkboxes[0];
        result.firstCheckbox = {
          id: cb.id,
          name: cb.name,
          class: cb.className,
          parentTag: cb.parentElement?.tagName,
          parentClass: cb.parentElement?.className,
          checked: cb.checked,
        };
      }

      // Look for checkbox column in header
      const headerCheckboxes = document.querySelectorAll('th input[type="checkbox"], td.dxgvHeader_XafTheme input[type="checkbox"]');
      result.headerCheckboxCount = headerCheckboxes.length;

      // Look for ASPxCheckBox (DevExpress client-side checkbox)
      const dxCheckboxes = document.querySelectorAll('[id*="checkBox"], [id*="CheckBox"], [class*="dxchk"]');
      result.dxCheckboxCount = dxCheckboxes.length;
      result.dxCheckboxIds = [...dxCheckboxes].slice(0, 5).map(el => ({
        id: el.id,
        class: el.className,
        tagName: el.tagName,
      }));

      // Look for command column (for selection)
      const cmdCells = document.querySelectorAll('td.dxgvCommandColumn_XafTheme');
      result.commandCellCount = cmdCells.length;
      if (cmdCells.length > 0) {
        result.firstCmdCell = {
          class: cmdCells[0].className,
          innerHTML: cmdCells[0].innerHTML.substring(0, 300),
        };
      }

      // Grid id
      const grid = document.querySelector('[id*="grid"], [id*="Grid"], [id*="ASPxGridView"]');
      result.gridId = grid?.id;

      return result;
    });

    log('FASE2', JSON.stringify(gridStructure, null, 2));
    report.gridStructure = gridStructure;
    await screenshot(page, '02-grid-structure');

    // ===== FASE 3: Inspect DevExpress grid API =====
    log('FASE3', 'Inspecting ASPxClientGridView API for selection...');
    const gridApi = await page.evaluate(() => {
      const result = {};

      // Find ASPxClientGridView control
      const collection = window.ASPxClientControl?.GetControlCollection?.();
      if (!collection) {
        result.noCollection = true;
        return result;
      }

      const gridControls = [];
      collection.ForEachControl((c) => {
        if (c.constructor?.name?.includes('Grid') || c.name?.includes('grid') || c.name?.includes('Grid')) {
          gridControls.push({
            name: c.name,
            constructorName: c.constructor?.name,
            methods: Object.getOwnPropertyNames(Object.getPrototypeOf(c)).filter(m => typeof c[m] === 'function').slice(0, 30),
          });
        }
      });
      result.gridControls = gridControls;

      // Try to get the main grid
      let mainGrid = null;
      collection.ForEachControl((c) => {
        if (!mainGrid && (c.SelectRows || c.SelectRowsByKey || c.SelectRow || c.GetSelectedKeysOnPage)) {
          mainGrid = c;
        }
      });

      if (mainGrid) {
        result.mainGridName = mainGrid.name;
        result.selectionMethods = [];
        const proto = Object.getPrototypeOf(mainGrid);
        for (const m of Object.getOwnPropertyNames(proto)) {
          if (m.toLowerCase().includes('select') || m.toLowerCase().includes('check')) {
            result.selectionMethods.push(m);
          }
        }

        // Try GetSelectedRowCount
        if (typeof mainGrid.GetSelectedRowCount === 'function') {
          result.selectedRowCount = mainGrid.GetSelectedRowCount();
        }
        if (typeof mainGrid.GetSelectedKeysOnPage === 'function') {
          result.selectedKeys = mainGrid.GetSelectedKeysOnPage();
        }
      }

      return result;
    });

    log('FASE3', JSON.stringify(gridApi, null, 2));
    report.gridApi = gridApi;

    // ===== FASE 4: Try selecting first row =====
    log('FASE4', 'Selecting first row via command column click...');
    const sel1 = await page.evaluate(() => {
      const firstRow = document.querySelector('tr[class*="dxgvDataRow"]');
      if (!firstRow) return { success: false, reason: 'no rows' };

      const cmdCell = firstRow.querySelector('td.dxgvCommandColumn_XafTheme');
      if (cmdCell) {
        cmdCell.click();
        return { success: true, method: 'commandColumn' };
      }
      const firstCell = firstRow.querySelector('td');
      if (firstCell) {
        firstCell.click();
        return { success: true, method: 'firstCell' };
      }
      return { success: false, reason: 'no clickable cell' };
    });

    log('FASE4', `Row 1 select: ${JSON.stringify(sel1)}`);
    await new Promise(r => setTimeout(r, 500));

    // Check selection state
    const stateAfterRow1 = await page.evaluate(() => {
      const result = { selectedRows: [] };
      const collection = window.ASPxClientControl?.GetControlCollection?.();
      if (collection) {
        collection.ForEachControl((c) => {
          if (typeof c.GetSelectedRowCount === 'function') {
            result.selectedRowCount = c.GetSelectedRowCount();
          }
          if (typeof c.GetSelectedKeysOnPage === 'function') {
            result.selectedKeys = c.GetSelectedKeysOnPage();
          }
        });
      }
      // Check selected row classes
      const selectedRows = document.querySelectorAll('tr.dxgvFocusedRow_XafTheme, tr[class*="dxgvSelectedRow"], tr[class*="dxgvFocused"]');
      result.selectedRowClasses = [...selectedRows].map(r => r.className);
      result.selectedRowCount_dom = selectedRows.length;

      // Check toolbar button state
      const sendBtn = document.querySelector('#Vertical_mainMenu_Menu_DXI4_T');
      const deleteBtn = document.querySelector('#Vertical_mainMenu_Menu_DXI5_T, #Vertical_mainMenu_Menu_DXI3_T');
      result.sendBtnDisabled = sendBtn?.classList.contains('dxm-disabled') ?? null;
      result.sendBtnId = sendBtn?.id;
      result.sendBtnText = sendBtn?.textContent?.trim();
      result.deleteBtnId = deleteBtn?.id;
      result.deleteBtnDisabled = deleteBtn?.classList.contains('dxm-disabled') ?? null;
      result.deleteBtnText = deleteBtn?.textContent?.trim();

      return result;
    });

    log('FASE4', `State after row 1 selected: ${JSON.stringify(stateAfterRow1, null, 2)}`);
    report.stateAfterRow1 = stateAfterRow1;
    await screenshot(page, '03-after-row1-select');

    // ===== FASE 5: Try selecting second row using ASPxGridView API =====
    log('FASE5', 'Attempting multi-selection of second row...');
    const multiSel = await page.evaluate(() => {
      const result = { attempts: [] };

      // Attempt A: ASPxClientGridView.SelectRow(visibleIndex)
      const collection = window.ASPxClientControl?.GetControlCollection?.();
      let grid = null;
      if (collection) {
        collection.ForEachControl((c) => {
          if (!grid && typeof c.SelectRow === 'function') grid = c;
        });
      }

      if (grid) {
        result.gridFound = true;
        result.gridName = grid.name;
        try {
          grid.SelectRow(0); // select first row
          grid.SelectRow(1); // select second row
          result.attempts.push({ method: 'SelectRow(0)+SelectRow(1)', success: true });
        } catch (e) {
          result.attempts.push({ method: 'SelectRow', error: e.message });
        }

        try {
          result.selectedCount = grid.GetSelectedRowCount?.();
          result.selectedKeys = grid.GetSelectedKeysOnPage?.();
        } catch (e) {
          result.selectedCountError = e.message;
        }
      } else {
        result.gridFound = false;

        // Attempt B: Ctrl+click second row
        const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
        if (rows.length >= 2) {
          const secondRow = rows[1];
          const cmdCell = secondRow.querySelector('td.dxgvCommandColumn_XafTheme') ?? secondRow.querySelector('td');
          if (cmdCell) {
            cmdCell.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
            result.attempts.push({ method: 'ctrlClick row 2', success: true });
          }
        }
      }

      return result;
    });

    log('FASE5', `Multi-select attempt: ${JSON.stringify(multiSel, null, 2)}`);
    report.multiSelectAttempt = multiSel;
    await new Promise(r => setTimeout(r, 800));
    await screenshot(page, '04-after-multiselect');

    // Check state after multi-select attempt
    const stateAfterMulti = await page.evaluate(() => {
      const result = {};
      const collection = window.ASPxClientControl?.GetControlCollection?.();
      if (collection) {
        collection.ForEachControl((c) => {
          if (typeof c.GetSelectedRowCount === 'function') {
            result.selectedRowCount = c.GetSelectedRowCount();
          }
          if (typeof c.GetSelectedKeysOnPage === 'function') {
            result.selectedKeys = c.GetSelectedKeysOnPage();
          }
        });
      }
      const selectedRows = document.querySelectorAll('tr.dxgvFocusedRow_XafTheme, tr[class*="dxgvSelectedRow"], tr[class*="dxgvFocused"]');
      result.selectedRowCount_dom = selectedRows.length;
      result.selectedRowClasses = [...selectedRows].map(r => r.className);

      const sendBtn = document.querySelector('#Vertical_mainMenu_Menu_DXI4_T');
      result.sendBtnDisabled = sendBtn?.classList.contains('dxm-disabled') ?? null;
      result.sendBtnText = sendBtn?.textContent?.trim();

      return result;
    });

    log('FASE5', `State after multi-select: ${JSON.stringify(stateAfterMulti, null, 2)}`);
    report.stateAfterMulti = stateAfterMulti;

    // ===== FASE 6: Inspect all toolbar menu items =====
    log('FASE6', 'Listing all toolbar menu items...');
    const menuItems = await page.evaluate(() => {
      const items = [];
      const menuLinks = document.querySelectorAll('a[id*="Vertical_mainMenu_Menu_DXI"]');
      menuLinks.forEach(link => {
        const li = link.closest('li');
        items.push({
          id: link.id,
          text: link.textContent?.trim(),
          disabled: link.classList.contains('dxm-disabled') || li?.classList.contains('dxm-disabled'),
          liClass: li?.className,
        });
      });
      return items;
    });

    log('FASE6', `Menu items: ${JSON.stringify(menuItems, null, 2)}`);
    report.menuItems = menuItems;

    // ===== FASE 7: Try checkbox column approach =====
    log('FASE7', 'Looking for checkbox-based selection in grid...');
    const checkboxSel = await page.evaluate(() => {
      const result = {};

      // DevExpress ASPxGridView can have a "Select All" checkbox in header
      const headerRow = document.querySelector('tr.dxgvHeader_XafTheme, tr[class*="dxgvHeader"]');
      if (headerRow) {
        const headerCells = headerRow.querySelectorAll('td');
        result.headerCellCount = headerCells.length;
        result.headerCells = [...headerCells].slice(0, 5).map((td, i) => ({
          index: i,
          class: td.className,
          innerHTML: td.innerHTML.substring(0, 150),
        }));
      }

      // Look for any checkbox-like elements in the first few data rows
      const dataRows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
      result.dataRowCount = dataRows.length;

      // Check if rows have "selection" class cells (DevExpress selection column)
      if (dataRows.length > 0) {
        const firstRowCells = [...dataRows[0].querySelectorAll('td')];
        result.firstRowAllCells = firstRowCells.map((td, i) => ({
          index: i,
          class: td.className,
          id: td.id,
          hasCheckbox: !!td.querySelector('input[type="checkbox"]'),
          hasASPxCheckBox: !!td.querySelector('[id*="CheckBox"], [id*="checkBox"]'),
          innerHTML: td.innerHTML.substring(0, 100),
        }));
      }

      // ASPxGridView multi-selection: look for grid's CheckBoxColumnID
      const collection = window.ASPxClientControl?.GetControlCollection?.();
      const selectionInfo = {};
      if (collection) {
        collection.ForEachControl((c) => {
          if (typeof c.GetSelectedRowCount === 'function') {
            selectionInfo.gridName = c.name;
            selectionInfo.allowMultipleSelection = c.allowMultipleSelection;
            selectionInfo.allowSelectAll = c.allowSelectAll;
            // Check if grid has a selection column
            selectionInfo.hasSelectAll = typeof c.SelectAll === 'function';
            selectionInfo.hasSelectRow = typeof c.SelectRow === 'function';
            selectionInfo.hasSelectRowsByKey = typeof c.SelectRowsByKey === 'function';
            selectionInfo.hasGetAllSelected = typeof c.GetSelectedRowCount === 'function';
            selectionInfo.currentSelectedCount = c.GetSelectedRowCount?.();
          }
        });
      }
      result.selectionInfo = selectionInfo;

      return result;
    });

    log('FASE7', JSON.stringify(checkboxSel, null, 2));
    report.checkboxSel = checkboxSel;
    await screenshot(page, '05-header-row');

    // ===== FASE 8: Try SelectAll via API =====
    log('FASE8', 'Testing SelectAll via ASPxGridView API...');
    const selectAllResult = await page.evaluate(() => {
      const result = {};
      const collection = window.ASPxClientControl?.GetControlCollection?.();
      if (!collection) return { error: 'no collection' };

      let grid = null;
      collection.ForEachControl((c) => {
        if (!grid && typeof c.SelectAll === 'function') grid = c;
      });

      if (!grid) {
        collection.ForEachControl((c) => {
          if (!grid && typeof c.SelectRow === 'function') grid = c;
        });
      }

      if (!grid) return { error: 'no grid with SelectAll/SelectRow' };

      result.gridName = grid.name;

      try {
        if (typeof grid.SelectAll === 'function') {
          grid.SelectAll();
          result.selectAllCalled = true;
        } else if (typeof grid.SelectRow === 'function') {
          grid.SelectRow(0);
          grid.SelectRow(1);
          grid.SelectRow(2);
          result.selectRowCalled = [0, 1, 2];
        }

        result.selectedCount = grid.GetSelectedRowCount?.();
        result.selectedKeys = grid.GetSelectedKeysOnPage?.();
      } catch (e) {
        result.error = e.message;
      }

      return result;
    });

    log('FASE8', `SelectAll result: ${JSON.stringify(selectAllResult, null, 2)}`);
    report.selectAllResult = selectAllResult;
    await new Promise(r => setTimeout(r, 1000));
    await screenshot(page, '06-after-selectall');

    // Final state check
    const finalState = await page.evaluate(() => {
      const result = {};
      const collection = window.ASPxClientControl?.GetControlCollection?.();
      if (collection) {
        collection.ForEachControl((c) => {
          if (typeof c.GetSelectedRowCount === 'function') {
            result.selectedCount = c.GetSelectedRowCount();
            result.selectedKeys = c.GetSelectedKeysOnPage?.();
          }
        });
      }
      const selectedRows = document.querySelectorAll('tr[class*="dxgvSelectedRow"], tr[class*="dxgvFocused"]');
      result.selectedRowsDom = selectedRows.length;
      result.selectedRowClasses = [...selectedRows].slice(0, 3).map(r => r.className);

      const sendBtn = document.querySelector('#Vertical_mainMenu_Menu_DXI4_T');
      result.sendBtnDisabled = sendBtn?.classList.contains('dxm-disabled') ?? null;

      return result;
    });

    log('FASE8 FINAL', JSON.stringify(finalState, null, 2));
    report.finalState = finalState;

  } catch (err) {
    log('ERROR', err.message);
    report.error = err.message;
    await screenshot(page, 'error');
  }

  // Save report
  const reportPath = path.join(SCREENSHOT_DIR, `multiselect-diag-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log('DONE', `Report saved to ${reportPath}`);

  await new Promise(r => setTimeout(r, 3000)); // keep browser open briefly
  await browser.close();
}

main().catch(console.error);

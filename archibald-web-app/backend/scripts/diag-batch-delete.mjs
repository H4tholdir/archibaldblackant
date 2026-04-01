/**
 * Diagnostic: batch delete of test orders 51979 and 51980.
 *
 * Steps:
 *  1. Login + navigate to SALESTABLE_ListView_Agent
 *  2. Set filter "Tutti gli ordini", page size 200
 *  3. Find rows for 51979 and 51980 via DOM scan (no search box)
 *  4. Select row 1 → read full toolbar state
 *  5. Select row 2 additionally → read full toolbar state
 *  6. Expand "..." menu if needed
 *  7. Find and click the delete button (red X / "Cancellare")
 *  8. Handle confirmation popup
 *  9. Verify orders are gone
 *
 * Usage:
 *   ARCHIBALD_USERNAME=ikiA0930 ARCHIBALD_PASSWORD=Fresis26@ \
 *   node archibald-web-app/backend/scripts/diag-batch-delete.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASSWORD = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const SCREENSHOT_DIR = '/Users/hatholdir/Downloads/Archibald/docs/diagnostics';
const TARGET_IDS = ['51980', '51979'];

const report = {};
function log(s, m) { console.log(`[${s}] ${m}`); }

async function shot(page, name) {
  const p = path.join(SCREENSHOT_DIR, `batchdel-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  log('SHOT', p);
}

async function waitIdle(page, timeout = 15000) {
  await page.waitForFunction(
    (n) => {
      const loading = document.querySelector('.dxgvLoadingPanel_XafTheme,.dxlp,[class*="LoadingPanel"]');
      if (loading?.offsetParent !== null) { window.__dxI = 0; return false; }
      let busy = false;
      window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.((c) => {
        if (typeof c.InCallback === 'function' && c.InCallback()) busy = true;
      });
      if (busy) { window.__dxI = 0; return false; }
      window.__dxI = (window.__dxI || 0) + 1;
      return window.__dxI >= n;
    },
    { timeout, polling: 150 }, 3,
  ).catch(() => {});
}

async function login(page) {
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9' });
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('input[type="text"]', { timeout: 10000 });
  await page.waitForSelector('input[type="password"]', { timeout: 10000 });
  await page.evaluate((user, pass) => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
    const u = inputs.find(i => i.name?.includes('UserName')) || inputs[0];
    const pw = document.querySelector('input[type="password"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const set = (el, val) => {
      el.focus(); el.click();
      if (setter) setter.call(el, val); else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set(u, user); set(pw, pass);
    const btn = Array.from(document.querySelectorAll('button, a')).find(b => {
      const t = (b.textContent || '').toLowerCase().replace(/\s+/g, '');
      return t.includes('accedi') || (!b.id?.includes('logo') && (b.id?.includes('login') || b.id?.includes('logon')));
    });
    btn?.click();
  }, USERNAME, PASSWORD);
  await page.waitForFunction(() => !window.location.href.includes('Login.aspx'), { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  log('LOGIN', `OK → ${page.url()}`);
}

async function readFullToolbar(page) {
  return page.evaluate(() => {
    const result = { menuLinks: [], visibleButtons: [], hiddenMenu: [] };

    // All DXI menu links
    document.querySelectorAll('a[id*="Vertical_mainMenu_Menu_DXI"]').forEach(link => {
      const li = link.closest('li');
      result.menuLinks.push({
        id: link.id,
        text: link.textContent?.replace(/\s+/g, ' ').trim(),
        disabled: link.classList.contains('dxm-disabled') || !!li?.classList.contains('dxm-disabled'),
        liClass: li?.className,
      });
    });

    // All visible buttons in the toolbar area (look for images, icons, SVG buttons)
    document.querySelectorAll('[id*="mainMenu"] img, [id*="mainMenu"] svg, [id*="mainMenu"] span[class*="Icon"]').forEach(el => {
      const btn = el.closest('a,button') || el.parentElement;
      if (btn) result.visibleButtons.push({
        id: btn.id,
        title: btn.getAttribute('title') || btn.getAttribute('aria-label') || '',
        class: btn.className?.substring(0, 100),
      });
    });

    // Check if there is a "Show hidden items" expanded sub-menu
    const hiddenMenu = document.querySelectorAll('[id*="mainMenu"][id*="DXI8"], [id*="mainMenu"][id*="DXI9"], .dxm-ami, [class*="dxm-ami"]');
    hiddenMenu.forEach(m => {
      const links = m.querySelectorAll('a');
      links.forEach(link => {
        result.hiddenMenu.push({
          id: link.id,
          text: link.textContent?.replace(/\s+/g, ' ').trim(),
        });
      });
    });

    return result;
  });
}

async function readSelection(page) {
  return page.evaluate(() => {
    const r = { count: 0, keys: [] };
    window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.((c) => {
      if (typeof c.GetSelectedRowCount === 'function') {
        r.count = c.GetSelectedRowCount();
        r.keys = c.GetSelectedKeysOnPage?.() ?? [];
        r.gridName = c.name;
      }
    });
    return r;
  });
}

async function selectRowOnPage(page, rowIndex) {
  return page.evaluate((idx) => {
    let called = false;
    window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.((c) => {
      if (!called && typeof c.SelectRowOnPage === 'function') {
        c.SelectRowOnPage(idx);
        called = true;
      }
    });
    return called;
  }, rowIndex);
}

async function findOrderRowIndex(page, normalizedId) {
  return page.evaluate((id) => {
    const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      // cell 2 = order id (with dot notation like "51.980")
      const cellText = cells[2]?.textContent?.trim().replace(/\./g, '') ?? '';
      if (cellText === id) return i;
    }
    return -1;
  }, normalizedId);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    // ===== LOGIN =====
    await login(page);
    await page.goto(`${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitIdle(page, 20000);
    await new Promise(r => setTimeout(r, 1500));
    await shot(page, '01-initial');

    // ===== STEP 1: Read initial toolbar =====
    log('INIT', 'Toolbar before any selection:');
    const toolbarInit = await readFullToolbar(page);
    log('INIT', JSON.stringify(toolbarInit.menuLinks, null, 2));
    report.toolbarInit = toolbarInit;

    // ===== STEP 2: Find target rows =====
    log('FIND', `Looking for rows: ${TARGET_IDS.join(', ')}`);
    const rowIndices = {};
    for (const id of TARGET_IDS) {
      const idx = await findOrderRowIndex(page, id);
      rowIndices[id] = idx;
      log('FIND', `Order ${id} → row index ${idx}`);
    }
    report.rowIndices = rowIndices;

    // If orders not found, try with page size change
    const notFound = Object.entries(rowIndices).filter(([, idx]) => idx === -1).map(([id]) => id);
    if (notFound.length > 0) {
      log('FIND', `Orders not found in current view: ${notFound.join(', ')}. Checking total rows...`);
      const totalRows = await page.evaluate(() => document.querySelectorAll('tr[class*="dxgvDataRow"]').length);
      log('FIND', `Total visible rows: ${totalRows}`);

      // Read first 5 rows to understand the data
      const first5 = await page.evaluate(() => {
        const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
        return [...rows].slice(0, 5).map((row, i) => {
          const cells = row.querySelectorAll('td');
          return { index: i, orderId: cells[2]?.textContent?.trim() };
        });
      });
      log('FIND', `First 5 rows: ${JSON.stringify(first5)}`);
      report.first5Rows = first5;

      // If not found in default view, orders might be on next page or need filter reset
      // Try setting page size to 200 and filter to "Tutti gli ordini"
      // First check if filter is active
      const filterState = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, select, [class*="dxeCB"]'));
        return inputs.slice(0, 10).map(el => ({
          id: el.id?.substring(0, 80),
          value: (el.value || el.textContent || '').substring(0, 50),
          class: el.className?.substring(0, 50),
        }));
      });
      log('FIND', `Filter elements: ${JSON.stringify(filterState)}`);
    }

    // ===== STEP 3: Select first order =====
    const firstId = TARGET_IDS[0]; // 51980
    const firstIdx = rowIndices[firstId];

    if (firstIdx === -1) {
      log('ERROR', `Order ${firstId} not found in grid. Cannot proceed.`);
      await shot(page, 'error-not-found');
      return;
    }

    log('SEL1', `Selecting order ${firstId} (row ${firstIdx}) via SelectRowOnPage...`);
    await selectRowOnPage(page, firstIdx);
    await new Promise(r => setTimeout(r, 800));

    const toolbar1 = await readFullToolbar(page);
    const sel1 = await readSelection(page);
    log('SEL1', `Selection: ${JSON.stringify(sel1)}`);
    log('SEL1', `Toolbar after 1st selection: ${JSON.stringify(toolbar1.menuLinks, null, 2)}`);
    report.toolbar1 = toolbar1;
    report.sel1 = sel1;
    await shot(page, '02-first-selected');

    // ===== STEP 4: Select second order =====
    const secondId = TARGET_IDS[1]; // 51979
    const secondIdx = rowIndices[secondId];

    if (secondIdx === -1) {
      log('ERROR', `Order ${secondId} not found in grid. Cannot proceed.`);
      return;
    }

    log('SEL2', `Selecting order ${secondId} (row ${secondIdx}) via SelectRowOnPage...`);
    await selectRowOnPage(page, secondIdx);
    await new Promise(r => setTimeout(r, 800));

    const toolbar2 = await readFullToolbar(page);
    const sel2 = await readSelection(page);
    log('SEL2', `Selection: ${JSON.stringify(sel2)}`);
    log('SEL2', `Toolbar after 2nd selection: ${JSON.stringify(toolbar2.menuLinks, null, 2)}`);
    report.toolbar2 = toolbar2;
    report.sel2 = sel2;
    await shot(page, '03-both-selected');

    // ===== STEP 5: Find delete button =====
    // Look for delete button: red X, "Cancellare", or inside "..." menu
    log('DEL', 'Looking for delete button...');

    const deleteBtn = await page.evaluate(() => {
      const result = { found: false, strategy: '', id: '', text: '' };

      // Strategy 1: any enabled "Cancellare" or "Delete" in main menu
      const mainLinks = Array.from(document.querySelectorAll('a[id*="Vertical_mainMenu_Menu_DXI"]'));
      for (const link of mainLinks) {
        const text = link.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
        const li = link.closest('li');
        const disabled = link.classList.contains('dxm-disabled') || !!li?.classList.contains('dxm-disabled');
        if (!disabled && (text.includes('cancell') || text.includes('elimin') || text === 'delete')) {
          result.found = true;
          result.strategy = 'main-menu-text';
          result.id = link.id;
          result.text = link.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          return result;
        }
      }

      // Strategy 2: any button with title/aria-label containing delete
      const allBtns = Array.from(document.querySelectorAll('a[id*="mainMenu"], button[id*="mainMenu"]'));
      for (const btn of allBtns) {
        const title = (btn.getAttribute('title') || btn.getAttribute('aria-label') || '').toLowerCase();
        if (title.includes('cancell') || title.includes('elimin') || title.includes('delete')) {
          result.found = true;
          result.strategy = 'title-attr';
          result.id = btn.id;
          result.text = title;
          return result;
        }
      }

      // Strategy 3: try "Show hidden items" ("...") dropdown to expand it
      const showHiddenLinks = Array.from(document.querySelectorAll('a[id*="Vertical_mainMenu_Menu_DXI"]'))
        .filter(el => (el.textContent || '').toLowerCase().includes('hidden') || (el.textContent || '').toLowerCase().includes('nascost'));
      if (showHiddenLinks.length > 0) {
        result.found = false;
        result.strategy = 'need-expand-hidden-menu';
        result.id = showHiddenLinks[0].id;
        result.text = showHiddenLinks[0].textContent?.replace(/\s+/g, ' ').trim() ?? '';
      }

      return result;
    });

    log('DEL', `Delete button search: ${JSON.stringify(deleteBtn)}`);
    report.deleteBtn = deleteBtn;

    // ===== STEP 6: Expand "..." menu if needed =====
    if (!deleteBtn.found && deleteBtn.strategy === 'need-expand-hidden-menu') {
      log('DEL', `Expanding "..." menu (${deleteBtn.id})...`);
      await page.evaluate((btnId) => {
        const btn = document.getElementById(btnId) || document.querySelector(`a[id="${btnId}"]`);
        btn?.click();
      }, deleteBtn.id);
      await new Promise(r => setTimeout(r, 800));

      await shot(page, '04-dots-menu-expanded');

      // Now read the toolbar again
      const toolbarExpanded = await readFullToolbar(page);
      log('DEL', `Toolbar after expanding "...": ${JSON.stringify(toolbarExpanded.menuLinks, null, 2)}`);
      log('DEL', `Hidden menu items: ${JSON.stringify(toolbarExpanded.hiddenMenu, null, 2)}`);
      report.toolbarExpanded = toolbarExpanded;

      // Try to find delete button again
      const deleteBtnAfterExpand = await page.evaluate(() => {
        const allLinks = Array.from(document.querySelectorAll('a[id*="mainMenu"], a[id*="Menu"]'));
        const result = [];
        allLinks.forEach(link => {
          const text = link.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
          const li = link.closest('li');
          const disabled = link.classList.contains('dxm-disabled') || !!li?.classList.contains('dxm-disabled');
          if (text.includes('cancell') || text.includes('elimin') || text === 'delete') {
            result.push({ id: link.id, text: link.textContent?.replace(/\s+/g, ' ').trim(), disabled });
          }
        });
        return result;
      });
      log('DEL', `Delete candidates after expand: ${JSON.stringify(deleteBtnAfterExpand)}`);
      report.deleteCandidatesAfterExpand = deleteBtnAfterExpand;
    }

    // ===== STEP 7: Read full page DOM for ALL toolbar elements =====
    log('DOM', 'Full DOM dump of toolbar area...');
    const toolbarDom = await page.evaluate(() => {
      const toolbar = document.querySelector('[id*="Vertical_mainMenu"]')?.parentElement?.parentElement;
      if (!toolbar) {
        // Fallback: all links/buttons with id containing "Menu"
        const items = [];
        document.querySelectorAll('a[id*="Menu_DXI"], button[id*="Menu"]').forEach(el => {
          const li = el.closest('li');
          items.push({
            id: el.id,
            text: el.textContent?.replace(/\s+/g, ' ').trim(),
            href: el.getAttribute('href')?.substring(0, 50),
            class: el.className?.substring(0, 100),
            liClass: li?.className?.substring(0, 100),
            disabled: el.classList.contains('dxm-disabled') || !!li?.classList.contains('dxm-disabled'),
          });
        });
        return { type: 'fallback', items };
      }
      return { type: 'html', html: toolbar.innerHTML?.substring(0, 5000) };
    });
    log('DOM', JSON.stringify(toolbarDom).substring(0, 2000));
    report.toolbarDom = toolbarDom;

    // ===== STEP 8: Try to click the delete button — any strategy =====
    log('CLICK', 'Attempting to click delete button...');
    const clickResult = await page.evaluate(() => {
      const strategies = [];

      // Try all menu links, find the best candidate
      const allLinks = Array.from(document.querySelectorAll('a, button'));
      for (const link of allLinks) {
        const id = link.id || '';
        const text = link.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
        const li = link.closest('li');
        const disabled = link.classList.contains('dxm-disabled') || !!li?.classList.contains('dxm-disabled');

        // Only try enabled buttons
        if (disabled) continue;

        // Match delete-like text
        if (text.includes('cancell') || text.includes('elimin') || text === 'delete') {
          // Make sure it's in the menu area
          if (id.includes('mainMenu') || id.includes('Menu_DXI') || link.closest('[id*="mainMenu"]')) {
            strategies.push({ id, text, type: 'text-match' });
            link.click();
            return { clicked: true, strategy: 'text', id, text };
          }
        }
      }

      return { clicked: false, strategies };
    });

    log('CLICK', `Click result: ${JSON.stringify(clickResult)}`);
    report.clickResult = clickResult;
    await new Promise(r => setTimeout(r, 1000));
    await shot(page, '05-after-delete-click');

    // ===== STEP 9: Handle any confirmation dialogs =====
    log('CONFIRM', 'Checking for confirmation dialogs...');

    // Listen for native browser dialogs
    let dialogHandled = false;
    page.once('dialog', async (dialog) => {
      log('CONFIRM', `Browser dialog: ${dialog.type()} — "${dialog.message()}"`);
      report.dialog = { type: dialog.type(), message: dialog.message() };
      await dialog.accept();
      dialogHandled = true;
      log('CONFIRM', 'Browser dialog accepted');
    });

    await new Promise(r => setTimeout(r, 2000));

    if (!dialogHandled) {
      // Try DevExpress popup
      const dxPopup = await page.evaluate(() => {
        const selectors = [
          'div[id*="Confirm"] a[id*="btnOk"]',
          'div[id*="Dialog"] a[id*="btnOk"]',
          '[class*="dxpc"] a[id*="btnOk"]',
          'div[id*="Confirm"] a[id*="btnYes"]',
          'div[id*="Dialog"] a[id*="btnYes"]',
          '[class*="dxpc"] button',
          'a[id*="btnOk"]',
          'a[id*="btnYes"]',
        ];
        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null) {
            btn.click();
            return { found: true, selector: sel, text: btn.textContent?.trim() };
          }
        }

        // Also look for any visible popup/modal
        const popups = document.querySelectorAll('[class*="dxpc"], [id*="Popup"], [id*="Dialog"], [id*="Confirm"]');
        const visible = [];
        popups.forEach(p => {
          if (p.offsetParent !== null) {
            visible.push({ id: p.id, class: p.className?.substring(0, 80), html: p.innerHTML?.substring(0, 300) });
          }
        });
        return { found: false, visiblePopups: visible };
      });

      log('CONFIRM', `DevExpress popup check: ${JSON.stringify(dxPopup, null, 2)}`);
      report.dxPopup = dxPopup;
    }

    await new Promise(r => setTimeout(r, 2000));
    await shot(page, '06-after-confirm');

    // ===== STEP 10: Verify orders are gone =====
    log('VERIFY', 'Checking if orders were deleted...');
    const verifyResult = await page.evaluate((ids) => {
      const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
      const remaining = [];
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const id = cells[2]?.textContent?.trim().replace(/\./g, '') ?? '';
        if (ids.includes(id)) remaining.push(id);
      });
      return { foundIds: remaining, totalRows: rows.length };
    }, TARGET_IDS);

    log('VERIFY', `Remaining target orders: ${JSON.stringify(verifyResult)}`);
    report.verifyResult = verifyResult;
    await shot(page, '07-verify');

  } catch (err) {
    log('ERROR', err.message + '\n' + err.stack?.substring(0, 500));
    report.error = err.message;
    await shot(page, 'error').catch(() => {});
  }

  const p = path.join(SCREENSHOT_DIR, `batchdel-report-${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify(report, null, 2));
  log('DONE', `Report: ${p}`);

  await new Promise(r => setTimeout(r, 4000));
  await browser.close();
}

main().catch(console.error);

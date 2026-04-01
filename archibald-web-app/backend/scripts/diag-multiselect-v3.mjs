/**
 * Diagnostic v3: test 2x Giornale rows selected together.
 * Do NOT click send - only check menu state.
 *
 * Usage:
 *   ARCHIBALD_USERNAME=ikiA0930 ARCHIBALD_PASSWORD=Fresis26@ \
 *   node archibald-web-app/backend/scripts/diag-multiselect-v3.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASSWORD = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const SCREENSHOT_DIR = '/Users/hatholdir/Downloads/Archibald/docs/diagnostics';

function log(s, m) { console.log(`[${s}] ${m}`); }

async function screenshot(page, name) {
  const p = path.join(SCREENSHOT_DIR, `ms3-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  log('SHOT', p);
}

async function waitIdle(page, timeout = 15000) {
  await page.waitForFunction(
    (n) => {
      const loading = document.querySelector('.dxgvLoadingPanel_XafTheme, .dxlp');
      if (loading && loading.offsetParent !== null) { window.__dxI = 0; return false; }
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
    if (btn) btn.click();
  }, USERNAME, PASSWORD);
  await page.waitForFunction(() => !window.location.href.includes('Login.aspx'), { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  log('LOGIN', `OK → ${page.url()}`);
}

async function readMenu(page) {
  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('a[id*="Vertical_mainMenu_Menu_DXI"]').forEach(link => {
      const li = link.closest('li');
      items.push({
        id: link.id,
        text: link.textContent?.replace(/\s+/g, ' ').trim(),
        disabled: link.classList.contains('dxm-disabled') || !!li?.classList.contains('dxm-disabled'),
      });
    });
    return items;
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

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  const report = {};

  try {
    await login(page);
    await page.goto(`${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitIdle(page);
    await new Promise(r => setTimeout(r, 1500));

    // Find first 5 Giornale rows
    const giornaleRows = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
      const found = [];
      rows.forEach((row, i) => {
        const cells = row.querySelectorAll('td');
        const type = cells[13]?.textContent?.trim();
        const orderId = cells[2]?.textContent?.trim();
        const approval = cells[16]?.textContent?.trim();
        const status = cells[12]?.textContent?.trim();
        if (type === 'Giornale') found.push({ rowIndex: i, orderId, status, type, approval });
        if (found.length >= 5) return;
      });
      return found;
    });
    log('INIT', `Giornale rows found: ${JSON.stringify(giornaleRows, null, 2)}`);
    report.giornaleRows = giornaleRows;

    if (giornaleRows.length < 2) {
      log('SKIP', 'Less than 2 Giornale rows found');
      return;
    }

    // Select first Giornale row
    const idx0 = giornaleRows[0].rowIndex;
    await page.evaluate((idx) => {
      const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
      rows[idx]?.querySelector('td.dxgvCommandColumn_XafTheme')?.click();
    }, idx0);
    await new Promise(r => setTimeout(r, 600));

    const menuAfter1 = await readMenu(page);
    const selAfter1 = await readSelection(page);
    log('ROW1', `Menu: ${JSON.stringify(menuAfter1)}`);
    log('ROW1', `Sel: ${JSON.stringify(selAfter1)}`);
    report.menuAfter1Giornale = menuAfter1;
    report.selAfter1 = selAfter1;
    await screenshot(page, '1-giornale-selected');

    // Ctrl+click second Giornale row
    const idx1 = giornaleRows[1].rowIndex;
    await page.evaluate((idx) => {
      const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
      const cmdCell = rows[idx]?.querySelector('td.dxgvCommandColumn_XafTheme') || rows[idx]?.querySelector('td');
      cmdCell?.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true }));
    }, idx1);
    await new Promise(r => setTimeout(r, 600));

    const menuAfter2 = await readMenu(page);
    const selAfter2 = await readSelection(page);
    log('ROW2', `Menu: ${JSON.stringify(menuAfter2)}`);
    log('ROW2', `Sel: ${JSON.stringify(selAfter2)}`);
    report.menuAfter2Giornale = menuAfter2;
    report.selAfter2 = selAfter2;
    await screenshot(page, '2-giornale-selected');

    // Check specific buttons
    const sendBtn = menuAfter2.find(m => m.text?.includes('invia ordine'));
    const deleteBtn = menuAfter2.find(m => m.text?.toLowerCase().includes('cancell'));
    log('RESULT', `Send button: ${JSON.stringify(sendBtn)}`);
    log('RESULT', `Delete button: ${JSON.stringify(deleteBtn)}`);
    report.sendButton = sendBtn;
    report.deleteButton = deleteBtn;

    // Also test 3 Giornale rows if available
    if (giornaleRows.length >= 3) {
      const idx2 = giornaleRows[2].rowIndex;
      await page.evaluate((idx) => {
        const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
        const cmdCell = rows[idx]?.querySelector('td.dxgvCommandColumn_XafTheme') || rows[idx]?.querySelector('td');
        cmdCell?.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true }));
      }, idx2);
      await new Promise(r => setTimeout(r, 600));

      const menuAfter3 = await readMenu(page);
      const selAfter3 = await readSelection(page);
      log('ROW3', `Menu after 3 Giornale: ${JSON.stringify(menuAfter3)}`);
      log('ROW3', `Sel: ${JSON.stringify(selAfter3)}`);
      report.menuAfter3Giornale = menuAfter3;
      report.selAfter3 = selAfter3;

      const sendBtn3 = menuAfter3.find(m => m.text?.includes('invia ordine'));
      log('RESULT3', `Send button with 3 Giornale: ${JSON.stringify(sendBtn3)}`);
    }

    // Test: can we select rows by clicking the checkbox span directly?
    log('SPAN', 'Testing direct span click for selection...');
    await page.evaluate(() => {
      window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.((c) => {
        if (typeof c.UnselectAllRowsOnPage === 'function') c.UnselectAllRowsOnPage();
      });
    });
    await new Promise(r => setTimeout(r, 300));

    // Click first 2 Giornale rows via SelectRowOnPage API
    const selRowOnPageResult = await page.evaluate((indices) => {
      const result = {};
      window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.((c) => {
        if (typeof c.SelectRowOnPage === 'function') {
          try {
            c.SelectRowOnPage(indices[0]);
            c.SelectRowOnPage(indices[1]);
            result.called = true;
            result.gridName = c.name;
          } catch (e) {
            result.error = e.message;
          }
        }
      });
      return result;
    }, [idx0, idx1]);
    await new Promise(r => setTimeout(r, 600));

    const menuAfterOnPage = await readMenu(page);
    const selAfterOnPage = await readSelection(page);
    log('ONPAGE', `SelectRowOnPage result: ${JSON.stringify(selRowOnPageResult)}`);
    log('ONPAGE', `Menu: ${JSON.stringify(menuAfterOnPage)}`);
    log('ONPAGE', `Sel: ${JSON.stringify(selAfterOnPage)}`);
    report.selRowOnPageResult = selRowOnPageResult;
    report.menuAfterOnPage = menuAfterOnPage;
    report.selAfterOnPage = selAfterOnPage;
    await screenshot(page, '3-onpage-selected');

  } catch (err) {
    log('ERROR', err.message);
    await screenshot(page, 'error');
  }

  const p = path.join(SCREENSHOT_DIR, `ms3-report-${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify(report, null, 2));
  log('DONE', `Report: ${p}`);

  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
}

main().catch(console.error);

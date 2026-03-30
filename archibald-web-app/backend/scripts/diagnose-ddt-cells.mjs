/**
 * DDT cell content diagnostic — answers THREE questions:
 *   Q1: What does the HTML inside each DDT cell look like (innerHTML)?
 *   Q2: Are there data attributes / computed CSS content that hold the values?
 *   Q3: Do ALL window globals with GetRowValues return null, or just the first one found?
 *
 * Usage (run locally on Mac with visible browser):
 *   node archibald-web-app/backend/scripts/diagnose-ddt-cells.mjs
 */

import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const DDT_URL = `${ARCHIBALD_URL}/CUSTPACKINGSLIPJOUR_ListView/`;
const USERNAME = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASSWORD = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';

function log(section, msg, data) {
  if (data !== undefined) console.log(`[${section}]`, msg, JSON.stringify(data, null, 2));
  else console.log(`[${section}]`, msg);
}

async function waitIdle(page, timeout = 30000) {
  await page.evaluate(() => { window.__dxIdleCount = 0; });
  await page.waitForFunction(
    (n) => {
      const w = window;
      const panel = document.querySelector('.dxgvLoadingPanel_XafTheme,.dxlp,[class*="LoadingPanel"]');
      if (panel && panel.offsetParent !== null) { w.__dxIdleCount = 0; return false; }
      let busy = false;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      if (col && typeof col.ForEachControl === 'function') {
        col.ForEachControl((c) => { if (typeof c.InCallback === 'function' && c.InCallback()) busy = true; });
      }
      if (busy) { w.__dxIdleCount = 0; return false; }
      w.__dxIdleCount = (w.__dxIdleCount || 0) + 1;
      return w.__dxIdleCount >= n;
    },
    { timeout, polling: 200 }, 3,
  );
}

async function login(page) {
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]'))
      .find(i => i.id.includes('UserName') || i.name?.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u && p) ? { userId: u.id, passId: p.id } : null;
  });
  if (!fields) throw new Error('Login fields not found');
  const fill = async (id, val) => {
    await page.evaluate((id, v) => {
      const el = document.getElementById(id);
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (s) s.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, id, val);
    await page.keyboard.press('Tab');
    await new Promise(r => setTimeout(r, 300));
  };
  await fill(fields.userId, USERNAME);
  await fill(fields.passId, PASSWORD);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button,input[type="submit"],a,div[role="button"]'))
      .find(b => (b.textContent || '').toLowerCase().replace(/\s+/g, '').includes('accedi') ||
                 (b.textContent || '').toLowerCase() === 'login');
    if (btn) btn.click();
    else { const byId = Array.from(document.querySelectorAll('[id]')).find(b => b.id && (b.id.toLowerCase().includes('login') || b.id.toLowerCase().includes('logon'))); if (byId) byId.click(); }
  });
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  log('LOGIN', `URL: ${page.url()}`);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  await login(page);

  log('NAV', `Going to DDT page: ${DDT_URL}`);
  await page.goto(DDT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitIdle(page);

  // ── Set page size 200 ──
  const pageSizeChanged = await page.evaluate(() => {
    const psi = document.querySelector('input[id*="DXPagerBottom_PSI"]');
    if (!psi || psi.value === '200') return false;
    const pagerId = psi.id.replace('_PSI', '');
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (s) s.call(psi, '200'); else psi.value = '200';
    if (typeof window.ASPx?.POnPageSizeBlur === 'function') {
      window.ASPx.POnPageSizeBlur(pagerId, new Event('blur'));
      return true;
    }
    return false;
  });
  if (pageSizeChanged) await waitIdle(page);
  log('PAGESIZE', `Changed: ${pageSizeChanged}`);

  // ── Q3: ALL window globals with GetRowValues ──
  const gridScan = await page.evaluate((fields) => {
    const found = [];
    for (const k of Object.keys(window)) {
      try {
        const obj = (window)[k];
        if (!obj || typeof obj.GetRowValues !== 'function') continue;
        const hasGetColumn = !!obj.GetColumn;
        let rowCount = -1;
        try { rowCount = obj.GetVisibleRowsOnPage?.() ?? -1; } catch {}
        found.push({ name: k, hasGetColumn, rowCount });
      } catch {}
    }
    return found;
  }, '');
  log('GRIDS', `All window globals with GetRowValues (${gridScan.length}):`, gridScan);

  // Try GetRowValues(0) on each grid
  for (const g of gridScan) {
    const testFields = 'SALESID;PACKINGSLIPID;ID';
    const result = await page.evaluate((gName, fields) => {
      return new Promise((resolve) => {
        const grid = (window)[gName];
        let answered = false;
        grid.GetRowValues(0, fields, (values) => {
          if (!answered) { answered = true; resolve({ fired: true, values }); }
        });
        setTimeout(() => { if (!answered) { answered = true; resolve({ fired: false, values: null }); } }, 3000);
      });
    }, g.name, testFields);
    log('GETROWVALUES', `Grid "${g.name}" row 0: fired=${result.fired}, values=${JSON.stringify(result.values)}`);
  }

  // ── Q1+Q2: DOM cell analysis (first 3 rows) ──
  const cellAnalysis = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[class*="dxgvDataRow"]');
    return Array.from(rows).slice(0, 3).map((row, ri) => {
      const cells = row.querySelectorAll('td');
      return {
        rowIndex: ri,
        cellCount: cells.length,
        cells: Array.from(cells).slice(0, 6).map((td, ci) => ({
          ci,
          textContent: td.textContent?.trim() ?? '',
          innerHTML: td.innerHTML?.trim().slice(0, 200),
          dataAttrs: Object.fromEntries(
            Array.from(td.attributes)
              .filter(a => a.name.startsWith('data-'))
              .map(a => [a.name, a.value])
          ),
          classes: td.className,
        })),
      };
    });
  });
  log('CELLS', 'First 3 rows DOM analysis:', cellAnalysis);

  // ── Wait 5 seconds and re-check cells (maybe lazy fill) ──
  log('WAIT', 'Waiting 5 seconds for lazy cell fill...');
  await new Promise(r => setTimeout(r, 5000));

  const cellsAfterWait = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[class*="dxgvDataRow"]');
    return Array.from(rows).slice(0, 3).map((row, ri) => {
      const cells = row.querySelectorAll('td');
      return {
        rowIndex: ri,
        cells: Array.from(cells).slice(1, 5).map((td, ci) => ({
          ci: ci + 1,
          text: td.textContent?.trim() ?? '',
          html: td.innerHTML?.trim().slice(0, 150),
        })),
      };
    });
  });
  log('CELLS_AFTER_WAIT', 'After 5s wait:', cellsAfterWait);

  // ── Scroll to bottom and back to trigger virtual rendering ──
  log('SCROLL', 'Scrolling to bottom of grid...');
  await page.evaluate(() => {
    const grid = document.querySelector('.dxgv_XafTheme, .dx-g-bs4-table, [id*="GridView"]');
    if (grid) grid.scrollTop = grid.scrollHeight;
    else window.scrollTo(0, document.body.scrollHeight);
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await new Promise(r => setTimeout(r, 1000));

  const cellsAfterScroll = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[class*="dxgvDataRow"]');
    return Array.from(rows).slice(0, 3).map((row, ri) => {
      const cells = row.querySelectorAll('td');
      return {
        rowIndex: ri,
        cells: Array.from(cells).slice(1, 5).map((td, ci) => ({
          ci: ci + 1,
          text: td.textContent?.trim() ?? '',
        })),
      };
    });
  });
  log('CELLS_AFTER_SCROLL', 'After scroll:', cellsAfterScroll);

  // ── Try the filter combo SetSelectedIndex approach ──
  log('FILTER', 'Trying SetSelectedIndex on DDT date filter combo...');
  const filterInfo = await page.evaluate((inputSel) => {
    const input = document.querySelector(inputSel);
    if (!input) return { error: 'no input' };
    const ctrlId = input.name.replace(/\$/g, '_');
    const ctrl = (window)[ctrlId];
    if (!ctrl) return { error: `no ctrl: ${ctrlId}` };
    const count = ctrl.GetItemCount();
    const items = [];
    for (let i = 0; i < count; i++) {
      const item = ctrl.GetItem(i);
      items.push({ index: i, text: item.text, value: item.value });
    }
    return { ctrlId, currentValue: ctrl.GetValue(), items };
  }, 'input[name*="ITCNT4"][name*="xaf_a2"][name*="Cb"]:not([name*="VI"]):not([name*="DDD"])');
  log('FILTER', 'Combo info:', filterInfo);

  if (filterInfo.items && filterInfo.items.length > 1) {
    // Pick a temp item different from current and from "all"
    const allItem = filterInfo.items.find(i => ['Tutti', 'All'].includes(i.text));
    const tempItem = filterInfo.items.find(i =>
      i.value !== filterInfo.currentValue &&
      i.value !== allItem?.value
    );

    if (tempItem) {
      log('FILTER', `SetSelectedIndex(${tempItem.index}) = "${tempItem.text}"`);
      await page.evaluate((ctrlId, idx) => { (window)[ctrlId].SetSelectedIndex(idx); }, filterInfo.ctrlId, tempItem.index);
      await waitIdle(page).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));

      const cellsAfterTemp = await page.evaluate(() => {
        const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[class*="dxgvDataRow"]');
        return Array.from(rows).slice(0, 2).map((row, ri) => ({
          ri, cells: Array.from(row.querySelectorAll('td')).slice(1, 5).map(td => td.textContent?.trim() ?? ''),
        }));
      });
      log('FILTER', `Cells after SetSelectedIndex(${tempItem.text}):`, cellsAfterTemp);

      if (allItem) {
        log('FILTER', `SetSelectedIndex(${allItem.index}) = "${allItem.text}"`);
        await page.evaluate((ctrlId, idx) => { (window)[ctrlId].SetSelectedIndex(idx); }, filterInfo.ctrlId, allItem.index);
        await waitIdle(page).catch(() => {});
        await new Promise(r => setTimeout(r, 3000));

        const cellsAfterAll = await page.evaluate(() => {
          const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[class*="dxgvDataRow"]');
          return Array.from(rows).slice(0, 3).map((row, ri) => ({
            ri, cells: Array.from(row.querySelectorAll('td')).slice(1, 5).map(td => td.textContent?.trim() ?? ''),
          }));
        });
        log('FILTER', `Cells after SetSelectedIndex(${allItem.text}):`, cellsAfterAll);
      }
    }
  }

  // ── Try grid.Refresh() ──
  log('REFRESH', 'Trying grid.Refresh() if available...');
  const refreshResult = await page.evaluate(() => {
    const gn = Object.keys(window).find(k => { try { return (window)[k]?.GetRowValues && typeof (window)[k].GetRowValues === 'function'; } catch { return false; } });
    if (!gn) return 'no grid';
    const grid = (window)[gn];
    if (typeof grid.Refresh === 'function') { grid.Refresh(); return 'called'; }
    if (typeof grid.PerformCallback === 'function') { grid.PerformCallback(''); return 'PerformCallback'; }
    return 'no method';
  });
  log('REFRESH', `Result: ${refreshResult}`);
  await waitIdle(page).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  const cellsAfterRefresh = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[class*="dxgvDataRow"]');
    return Array.from(rows).slice(0, 3).map((row, ri) => ({
      ri, cells: Array.from(row.querySelectorAll('td')).slice(1, 5).map(td => td.textContent?.trim() ?? ''),
    }));
  });
  log('CELLS_AFTER_REFRESH', 'After Refresh():', cellsAfterRefresh);

  log('DONE', 'Browser stays open 15s...');
  await new Promise(r => setTimeout(r, 15000));
  await browser.close();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });

import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitIdle(page, timeout = 20000) {
  await page.evaluate(() => { window.__dxIdleCount = 0; });
  await page.waitForFunction((n) => {
    const panel = document.querySelector('.dxgvLoadingPanel_XafTheme,.dxlp,[class*="LoadingPanel"]');
    if (panel && panel.offsetParent !== null) { window.__dxIdleCount = 0; return false; }
    let busy = false;
    const col = window.ASPxClientControl?.GetControlCollection?.();
    if (col) col.ForEachControl?.((c) => { if (typeof c.InCallback === 'function' && c.InCallback()) busy = true; });
    if (busy) { window.__dxIdleCount = 0; return false; }
    window.__dxIdleCount = (window.__dxIdleCount || 0) + 1;
    return window.__dxIdleCount >= n;
  }, { timeout, polling: 200 }, 3);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false, ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2' });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u && p) ? { userId: u.id, passId: p.id } : null;
  });
  for (const [id, val] of [[fields.userId, USERNAME], [fields.passId, PASSWORD]]) {
    await page.evaluate((id, v) => {
      const el = document.getElementById(id);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, id, val);
    await page.keyboard.press('Tab');
  }
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button,input[type="submit"],a')).find(b => /accedi|login/i.test(b.textContent));
    if (b) b.click();
  });
  await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
  console.log('[LOGIN] OK');

  await page.goto('https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/', { waitUntil: 'domcontentloaded' });
  await waitIdle(page);

  // Apply filter toggle (Oggi → Tutti)
  const comboInfo = await page.evaluate(() => {
    const input = document.querySelector('input[name*="ITCNT4"][name*="xaf_a2"][name*="Cb"]:not([name*="VI"]):not([name*="DDD"])');
    if (!input) return null;
    let combo = null;
    window.ASPxClientControl?.GetControlCollection?.().ForEachControl?.((c) => {
      if (!combo && typeof c.ShowDropDown === 'function' && c.GetInputElement?.()?.id === input.id) combo = c;
    });
    if (!combo) return null;
    combo.ShowDropDown();
    return { ctrlId: combo.name || input.name };
  });
  await sleep(800);

  // Click Oggi
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[id*="ITCNT4"][id*="xaf_a2"][id*="Cb_DDD_L"] td'));
    const oggi = items.find(i => i.textContent?.trim() === 'Oggi' && i.offsetParent !== null);
    if (oggi) oggi.click();
  });
  await waitIdle(page).catch(() => {});
  await sleep(2000);

  // Reopen and click Tutti
  await page.evaluate(() => {
    const input = document.querySelector('input[name*="ITCNT4"][name*="xaf_a2"][name*="Cb"]:not([name*="VI"]):not([name*="DDD"])');
    if (!input) return;
    window.ASPxClientControl?.GetControlCollection?.().ForEachControl?.((c) => {
      if (typeof c.ShowDropDown === 'function' && c.GetInputElement?.()?.id === input.id) c.ShowDropDown();
    });
  });
  await sleep(800);
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[id*="ITCNT4"][id*="xaf_a2"][id*="Cb_DDD_L"] td'));
    const tutti = items.find(i => i.textContent?.trim() === 'Tutti' && i.offsetParent !== null);
    if (tutti) tutti.click();
  });
  await waitIdle(page).catch(() => {});
  await sleep(2000);
  console.log('[FILTER] toggle complete');

  // Now test GetRowValues
  const result = await page.evaluate(() => {
    return new Promise((resolve) => {
      const gn = Object.keys(window).find(k => {
        try { return window[k]?.GetRowValues && typeof window[k].GetRowValues === 'function' && window[k]?.GetColumn; }
        catch { return false; }
      });
      if (!gn) return resolve({ error: 'no grid' });

      const grid = window[gn];
      const visibleRows = grid.GetVisibleRowsOnPage();
      console.log('[GetRowValues] visibleRows:', visibleRows);

      const fields = 'SALESID;PACKINGSLIPID;ID;DELIVERYDATE;ORDERACCOUNT';
      const results = [];
      let completed = 0;
      const toFetch = Math.min(3, visibleRows || 3);

      if (toFetch === 0) return resolve({ error: 'visibleRows=0', visibleRows });

      for (let r = 0; r < toFetch; r++) {
        grid.GetRowValues(r, fields, (values) => {
          results[r] = values;
          completed++;
          if (completed >= toFetch) resolve({ visibleRows, results });
        });
      }
      setTimeout(() => resolve({ timeout: true, visibleRows, results }), 5000);
    });
  });

  console.log('[GetRowValues] result:', JSON.stringify(result, null, 2));

  await sleep(3000);
  await browser.close();
})();

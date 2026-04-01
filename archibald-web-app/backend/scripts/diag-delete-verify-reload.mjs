/**
 * Verifica se il delete persiste dopo page reload completo.
 * Cerca gli ordini 51979/51980/51981 nella griglia DOPO ricaricamento pagina.
 *
 * node archibald-web-app/backend/scripts/diag-delete-verify-reload.mjs
 */

import puppeteer from 'puppeteer';
const URL_BASE = 'https://4.231.124.90/Archibald';
const TARGETS = ['51979', '51980', '51981'];
const PROD_ARGS = ['--no-sandbox','--disable-setuid-sandbox','--disable-web-security','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-gpu','--disable-extensions','--no-zygote','--disable-accelerated-2d-canvas','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--memory-pressure-off','--js-flags=--max-old-space-size=512'];

const log = (t, m) => console.log(`[${new Date().toISOString().slice(11,23)}][${t}] ${m}`);

const browser = await puppeteer.launch({ headless: true, slowMo: 50, ignoreHTTPSErrors: true, args: PROD_ARGS, defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
page.setDefaultTimeout(30000);
await page.setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9' });

// Login
await page.goto(`${URL_BASE}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('input[type="text"]', { timeout: 10000 });
await page.evaluate((u, p) => {
  const el = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.name?.includes('UserName')) || document.querySelector('input[type="text"]');
  const pw = document.querySelector('input[type="password"]');
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  const set = (e, v) => { e.focus(); e.click(); if (s) s.call(e, v); else e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
  set(el, u); set(pw, p);
  Array.from(document.querySelectorAll('button,a')).find(b => { const t = (b.textContent || '').toLowerCase().replace(/\s+/g, ''); return t.includes('accedi') || (!b.id?.includes('logo') && (b.id?.includes('login') || b.id?.includes('logon'))); })?.click();
}, 'ikiA0930', 'Fresis26@');
await page.waitForFunction(() => !window.location.href.includes('Login.aspx'), { timeout: 30000 });
await new Promise(r => setTimeout(r, 2000));
log('LOGIN', `OK → ${page.url()}`);

// Naviga e GotoPage(0)
await page.goto(`${URL_BASE}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => Array.from(document.querySelectorAll('span,button,a')).some(e => { const t = e.textContent?.trim().toLowerCase() ?? ''; return t === 'nuovo' || t === 'new'; }), { timeout: 15000 });
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => { window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => { if (typeof c.GotoPage === 'function') c.GotoPage(0); }); });
await new Promise(r => setTimeout(r, 500));

// Cerca gli ordini nella griglia FRESH (dopo reload completo)
const presentInGrid = await page.evaluate((targets) => {
  const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
  return targets.filter(tid =>
    rows.some(row => {
      const cells = row.querySelectorAll('td');
      return (cells[2]?.textContent?.trim().replace(/\./g, '') ?? '') === tid;
    })
  );
}, TARGETS);

log('CHECK', `Ordini ANCORA PRESENTI nella griglia dopo reload: [${presentInGrid.join(', ')}]`);
log('CHECK', `Ordini ELIMINATI dalla griglia dopo reload:       [${TARGETS.filter(t => !presentInGrid.includes(t)).join(', ')}]`);

if (presentInGrid.length > 0) {
  log('CONCLUSIONE', '❌ Il delete NON ha persistito sul server — il DOM si aggiornava client-side ma il server non ha cancellato');
} else {
  log('CONCLUSIONE', '✅ Il delete è persisto — ordini non presenti neanche dopo reload');
}

await browser.close();

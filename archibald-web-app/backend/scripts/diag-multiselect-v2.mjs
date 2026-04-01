/**
 * Test: multi-select con waitForFunction(Cancellare enabled) dopo ogni click.
 * node archibald-web-app/backend/scripts/diag-multiselect-v2.mjs
 */
import puppeteer from 'puppeteer';
import path from 'path';

const URL_BASE = 'https://4.231.124.90/Archibald';
const TARGETS = ['51983', '51984'];
const SHOT_DIR = '/Users/hatholdir/Downloads/Archibald/docs/diagnostics';
const PROD_ARGS = ['--no-sandbox','--disable-setuid-sandbox','--disable-web-security','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-gpu','--disable-extensions','--no-zygote','--disable-accelerated-2d-canvas','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--memory-pressure-off','--js-flags=--max-old-space-size=512'];

const log = (t, m) => console.log(`[${new Date().toISOString().slice(11,23)}][${t}] ${m}`);
const shot = async (page, name) => { const p = path.join(SHOT_DIR, `msv2-${name}-${Date.now()}.png`); await page.screenshot({ path: p }).catch(() => {}); log('SHOT', p); };
async function waitNoLoading(page, timeout = 10000) {
  await page.waitForFunction(() => { const panels = Array.from(document.querySelectorAll('[id*="LPV"],.dxlp,[id*="Loading"]')); return !panels.some(el => { const s = window.getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0; }); }, { timeout, polling: 200 }).catch(() => {});
}

const browser = await puppeteer.launch({ headless: true, slowMo: 50, ignoreHTTPSErrors: true, args: PROD_ARGS, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.setDefaultTimeout(30000);
await page.setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9' });
page.on('console', m => { if (m.text().startsWith('[D]')) log('BR', m.text()); });

// LOGIN
await page.goto(`${URL_BASE}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[type="text"]');
await page.evaluate((u, p) => {
  const el = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.name?.includes('UserName')) || document.querySelector('input[type="text"]');
  const pw = document.querySelector('input[type="password"]');
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  const set = (e, v) => { e.focus(); e.click(); if (s) s.call(e, v); else e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
  set(el, u); set(pw, p);
  Array.from(document.querySelectorAll('button,a')).find(b => { const t = (b.textContent || '').toLowerCase().replace(/\s+/g, ''); return t.includes('accedi') || (!b.id?.includes('logo') && (b.id?.includes('login') || b.id?.includes('logon'))); })?.click();
}, 'ikiA0930', 'Fresis26@');
await page.waitForFunction(() => !window.location.href.includes('Login.aspx'));
await new Promise(r => setTimeout(r, 2000));
log('LOGIN', `OK → ${page.url()}`);

// NAVIGA + setup griglia
await page.goto(`${URL_BASE}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Array.from(document.querySelectorAll('span,button,a')).some(e => { const t = e.textContent?.trim().toLowerCase() ?? ''; return t === 'nuovo' || t === 'new'; }));
await new Promise(r => setTimeout(r, 1000));

// Clear search + GotoPage(0) — griglia piena visibile
await page.evaluate(() => {
  const input = document.querySelector('input[id*="SearchAC"][id*="Ed_I"]');
  if (input) { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; if (s) s.call(input, ''); else input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
});
await page.keyboard.press('Enter');
await waitNoLoading(page, 8000);
await page.evaluate(() => { window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => { if (typeof c.GotoPage === 'function') c.GotoPage(0); }); });
await new Promise(r => setTimeout(r, 500));
await shot(page, '01-loaded');

const presentBefore = await page.evaluate((targets) => {
  const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
  return targets.filter(tid => rows.some(r => (r.querySelectorAll('td')[2]?.textContent?.trim().replace(/\./g, '') ?? '') === tid));
}, TARGETS);
log('CHECK', `Ordini presenti: [${presentBefore.join(', ')}]`);

// MULTI-SELECT: click cells[0] + waitForFunction(Cancellare enabled) per ogni riga
log('SEL', '--- Multi-select con wait AJAX dopo ogni click ---');
for (const targetId of TARGETS) {
  log('SEL', `Click cells[0] per ${targetId}...`);
  const clicked = await page.evaluate((tid) => {
    const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if ((cells[2]?.textContent?.trim().replace(/\./g, '') ?? '') !== tid) continue;
      const span = cells[0]?.querySelector('span[id*="DXSelBtn"]');
      const target = span ?? cells[0];
      console.log('[D] Click su ' + (span ? 'span#' + span.id : 'td cells[0]'));
      target?.click();
      return true;
    }
    return false;
  }, targetId);

  if (!clicked) { log('SEL', `  ❌ ${targetId} non trovato`); continue; }

  // Aspetta AJAX server-side: Cancellare abilitato = server ha ricevuto la selezione
  const t0 = Date.now();
  const enabled = await page.waitForFunction(
    () => { const btn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T'); return btn && !btn.classList.contains('dxm-disabled'); },
    { timeout: 8000, polling: 100 },
  ).catch(() => null);
  const elapsed = Date.now() - t0;

  const selState = await page.evaluate(() => {
    let count = 0, keys = [];
    window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => { if (typeof c.GetSelectedRowCount === 'function') { count = c.GetSelectedRowCount(); keys = c.GetSelectedKeysOnPage?.() ?? []; } });
    return { count, keys, btnDisabled: document.querySelector('#Vertical_mainMenu_Menu_DXI1_T')?.classList.contains('dxm-disabled') ?? true };
  });
  log('SEL', `  ${targetId}: btnEnabled=${!!enabled} (${elapsed}ms) count=${selState.count} keys=${JSON.stringify(selState.keys)}`);

  if (!enabled || selState.btnDisabled) {
    log('CONCLUSIONE', `❌ Cancellare non si abilita dopo click JS su ${targetId} — il click sintetico NON triggera AJAX server`);
    await shot(page, `fail-${targetId}`);
    await browser.close();
    process.exit(0);
  }
}

await shot(page, '02-after-multiselect');
const finalSel = await page.evaluate(() => {
  let count = 0, keys = [];
  window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => { if (typeof c.GetSelectedRowCount === 'function') { count = c.GetSelectedRowCount(); keys = c.GetSelectedKeysOnPage?.() ?? []; } });
  return { count, keys };
});
log('SEL', `Selezione finale: count=${finalSel.count} keys=${JSON.stringify(finalSel.keys)}`);

if (finalSel.count < 2) {
  log('CONCLUSIONE', `⚠️  Solo ${finalSel.count} selezionati — ogni click rimpiazza la selezione (single-select). Procedo comunque con delete dell'ultimo selezionato.`);
}

// CANCELLA
log('DELETE', `Procedo con Cancellare (${finalSel.count} selezionati)...`);
let dialogHandled = false;
const dp = new Promise(res => {
  let done = false;
  const h = d => { if (done) return; done = true; dialogHandled = true; log('DIALOG', `"${d.message()}"`); d.accept(); res(true); };
  page.once('dialog', h);
  setTimeout(() => { if (!done) { done = true; page.off('dialog', h); log('DIALOG', 'TIMEOUT'); res(false); } }, 10000);
});
await page.evaluate(() => { const btn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T'); console.log('[D] Cancellare click'); btn?.click(); });
await dp;
log('DELETE', `dialogHandled=${dialogHandled}`);
await waitNoLoading(page, 12000);
await new Promise(r => setTimeout(r, 1000));
await shot(page, '03-after-delete');

// RELOAD per verifica server-side
log('RELOAD', 'Reload completo...');
await page.goto(`${URL_BASE}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Array.from(document.querySelectorAll('span,button,a')).some(e => { const t = e.textContent?.trim().toLowerCase() ?? ''; return t === 'nuovo' || t === 'new'; }));
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => { window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => { if (typeof c.GotoPage === 'function') c.GotoPage(0); }); });
await new Promise(r => setTimeout(r, 500));

const stillPresent = await page.evaluate((targets) => {
  const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
  return targets.filter(tid => rows.some(r => (r.querySelectorAll('td')[2]?.textContent?.trim().replace(/\./g, '') ?? '') === tid));
}, TARGETS);
log('VERIFY', `Ancora presenti: [${stillPresent.join(', ')}]`);
log('VERIFY', `Eliminati:       [${TARGETS.filter(t => !stillPresent.includes(t)).join(', ')}]`);
await shot(page, '04-verify');

if (stillPresent.length === 0) {
  log('CONCLUSIONE', '✅ MULTI-SELECT FUNZIONA — entrambi eliminati con 1 Cancellare. La wait AJAX era il fix.');
} else if (stillPresent.length < TARGETS.length) {
  log('CONCLUSIONE', `⚠️  Parziale: ${TARGETS.length - stillPresent.length}/${TARGETS.length} eliminati`);
} else {
  log('CONCLUSIONE', '❌ NON funziona — ordini ancora presenti dopo reload');
}
await browser.close();

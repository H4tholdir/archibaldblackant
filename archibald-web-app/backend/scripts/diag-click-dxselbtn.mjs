/**
 * Clicca il vero checkbox di selezione (cells[0] = DXSelBtn) per triggare
 * il callback server-side, poi verifica il delete con page reload.
 *
 * node archibald-web-app/backend/scripts/diag-click-dxselbtn.mjs
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const URL_BASE = 'https://4.231.124.90/Archibald';
const TARGETS = ['51981', '51979'];  // due ordini per testare il batch
const SHOT_DIR = '/Users/hatholdir/Downloads/Archibald/docs/diagnostics';
const PROD_ARGS = ['--no-sandbox','--disable-setuid-sandbox','--disable-web-security','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-gpu','--disable-extensions','--no-zygote','--disable-accelerated-2d-canvas','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--memory-pressure-off','--js-flags=--max-old-space-size=512'];

const log = (t, m) => console.log(`[${new Date().toISOString().slice(11,23)}][${t}] ${m}`);
const shot = async (page, name) => {
  const p = path.join(SHOT_DIR, `dxselbtn-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p }).catch(() => {});
  log('SHOT', p);
};
async function waitNoLoading(page, timeout = 10000) {
  await page.waitForFunction(
    () => {
      const panels = Array.from(document.querySelectorAll('[id*="LPV"],.dxlp,[id*="Loading"]'));
      return !panels.some(el => {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
      });
    },
    { timeout, polling: 200 },
  ).catch(() => {});
}

const browser = await puppeteer.launch({ headless: true, slowMo: 50, ignoreHTTPSErrors: true, args: PROD_ARGS, defaultViewport: { width: 1440, height: 900 } });
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

// NAVIGA
await page.goto(`${URL_BASE}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Array.from(document.querySelectorAll('span,button,a')).some(e => { const t = e.textContent?.trim().toLowerCase() ?? ''; return t === 'nuovo' || t === 'new'; }));
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => { window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => { if (typeof c.GotoPage === 'function') c.GotoPage(0); }); });
await new Promise(r => setTimeout(r, 500));
await shot(page, '01-loaded');

// Ispeziona cells[0] per capire esattamente la struttura del checkbox
const cell0Info = await page.evaluate((targets) => {
  const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
  const result = [];
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    const id = cells[2]?.textContent?.trim().replace(/\./g, '') ?? '';
    if (!targets.includes(id)) continue;
    const cell0 = cells[0];
    const rect = cell0?.getBoundingClientRect();
    // Trova il primo elemento cliccabile dentro cells[0]
    const span = cell0?.querySelector('span[id*="DXSelBtn"]');
    const spanRect = span?.getBoundingClientRect();
    const inp = cell0?.querySelector('input');
    result.push({
      id,
      cell0Html: cell0?.innerHTML?.substring(0, 400),
      cellRect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
      spanId: span?.id,
      spanRect: spanRect ? { x: Math.round(spanRect.x), y: Math.round(spanRect.y), w: Math.round(spanRect.width), h: Math.round(spanRect.height) } : null,
      inputId: inp?.id,
      inputType: inp?.type,
    });
  }
  return result;
}, TARGETS);
log('INSPECT', `cells[0] info: ${JSON.stringify(cell0Info, null, 2)}`);

if (cell0Info.length === 0) {
  log('ERROR', `Ordini non trovati: ${TARGETS.join(', ')}`);
  await browser.close();
  process.exit(1);
}

// Clicca il DXSelBtn (cells[0]) per ciascun target
log('SEL', `Click su DXSelBtn per ogni ordine target...`);
for (const info of cell0Info) {
  log('SEL', `Clic per ordine ${info.id}...`);
  if (info.spanRect && info.spanRect.w > 0) {
    const cx = info.spanRect.x + info.spanRect.w / 2;
    const cy = info.spanRect.y + info.spanRect.h / 2;
    log('SEL', `  mouse.click(${cx.toFixed(0)}, ${cy.toFixed(0)}) su span DXSelBtn`);
    await page.mouse.click(cx, cy);
  } else if (info.cellRect && info.cellRect.w > 0) {
    const cx = info.cellRect.x + info.cellRect.w / 2;
    const cy = info.cellRect.y + info.cellRect.h / 2;
    log('SEL', `  mouse.click(${cx.toFixed(0)}, ${cy.toFixed(0)}) al centro di cells[0]`);
    await page.mouse.click(cx, cy);
  } else {
    log('SEL', `  Fallback: click via JS su span/input in cells[0]`);
    await page.evaluate((targetId) => {
      const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if ((cells[2]?.textContent?.trim().replace(/\./g, '') ?? '') !== targetId) continue;
        const el = cells[0]?.querySelector('span[id*="DXSelBtn"]') || cells[0]?.querySelector('input') || cells[0];
        console.log('[D] JS click su ' + el?.id + ' ' + el?.tagName);
        el?.click();
        break;
      }
    }, info.id);
  }
  await new Promise(r => setTimeout(r, 400));
  await waitNoLoading(page, 5000);
  await new Promise(r => setTimeout(r, 200));
}

// Verifica stato selezione
const selState = await page.evaluate(() => {
  let count = 0, keys = [];
  window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => {
    if (typeof c.GetSelectedRowCount === 'function') { count = c.GetSelectedRowCount(); keys = c.GetSelectedKeysOnPage?.() ?? []; }
  });
  const visualChecked = document.querySelectorAll('input[id*="DXSelB"]:checked, input[id*="DXSel"]:checked').length;
  const cssSelected = document.querySelectorAll('tr[class*="dxgvDataRow_Selected"]').length;
  const btnDisabled = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T')?.classList.contains('dxm-disabled') ?? true;
  return { count, keys, visualChecked, cssSelected, btnDisabled };
});
log('SEL_STATE', `count=${selState.count} keys=${JSON.stringify(selState.keys)} visualChecked=${selState.visualChecked} cssSelected=${selState.cssSelected} btnDisabled=${selState.btnDisabled}`);
await shot(page, '02-after-dxselbtn-click');

if (selState.btnDisabled) {
  log('ERROR', 'Cancellare ancora disabilitato dopo click su DXSelBtn — investigare ulteriormente');
  await browser.close();
  process.exit(0);
}

// TENTA DELETE
log('DELETE', `Cancellare abilitato (count=${selState.count}) — procedo con delete...`);

let dialogHandled = false;
const dp = new Promise(res => {
  let done = false;
  const h = d => { if (done) return; done = true; dialogHandled = true; log('DIALOG', `type=${d.type()} "${d.message()}"`); d.accept(); log('DIALOG', 'Accepted ✓'); res(true); };
  page.once('dialog', h);
  setTimeout(() => { if (!done) { done = true; page.off('dialog', h); log('DIALOG', 'TIMEOUT'); res(false); } }, 10000);
});

await page.evaluate(() => {
  const btn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');
  console.log('[D] Cancellare click disabled=' + btn?.classList.contains('dxm-disabled'));
  btn?.click();
});
await dp;
log('DELETE', `dialogHandled=${dialogHandled}`);

await waitNoLoading(page, 12000);
await new Promise(r => setTimeout(r, 1500));
await shot(page, '03-after-delete');

// Reload completo per verifica persistenza server
log('RELOAD', 'Reload completo per verifica server-side...');
await page.goto(`${URL_BASE}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Array.from(document.querySelectorAll('span,button,a')).some(e => { const t = e.textContent?.trim().toLowerCase() ?? ''; return t === 'nuovo' || t === 'new'; }));
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => { window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => { if (typeof c.GotoPage === 'function') c.GotoPage(0); }); });
await new Promise(r => setTimeout(r, 500));

const stillPresent = await page.evaluate((targets) => {
  const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
  return targets.filter(tid => rows.some(r => (r.querySelectorAll('td')[2]?.textContent?.trim().replace(/\./g, '') ?? '') === tid));
}, TARGETS);

log('VERIFY', `Ancora presenti dopo reload: [${stillPresent.join(', ')}]`);
log('VERIFY', `Eliminati e confermati:      [${TARGETS.filter(t => !stillPresent.includes(t)).join(', ')}]`);

if (stillPresent.length === 0) {
  log('CONCLUSIONE', '✅ DELETE PERSISTITO — click su DXSelBtn funziona! Questo è il fix corretto.');
} else if (stillPresent.length < TARGETS.length) {
  log('CONCLUSIONE', `⚠️  Delete parziale: ${TARGETS.length - stillPresent.length}/${TARGETS.length} eliminati`);
} else {
  log('CONCLUSIONE', '❌ Delete NON persistito — anche con DXSelBtn click il server non cancella');
}

await shot(page, '04-verify-reload');
await browser.close();

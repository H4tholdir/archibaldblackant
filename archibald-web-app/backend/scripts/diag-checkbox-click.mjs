/**
 * Testa click fisico sul checkbox della riga per triggare il callback server-side.
 * Verifica con page reload che la selezione sia persistita.
 *
 * node archibald-web-app/backend/scripts/diag-checkbox-click.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const URL_BASE = 'https://4.231.124.90/Archibald';
const TARGET_ID = '51981'; // uno degli ordini ancora presenti
const SHOT_DIR = '/Users/hatholdir/Downloads/Archibald/docs/diagnostics';
const PROD_ARGS = ['--no-sandbox','--disable-setuid-sandbox','--disable-web-security','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-gpu','--disable-extensions','--no-zygote','--disable-accelerated-2d-canvas','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--memory-pressure-off','--js-flags=--max-old-space-size=512'];

const log = (t, m) => console.log(`[${new Date().toISOString().slice(11,23)}][${t}] ${m}`);
const shot = async (page, name) => {
  const p = path.join(SHOT_DIR, `chk-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
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
page.on('console', m => { if (m.text().includes('[D]')) log('BR', m.text()); });

// ── LOGIN ──
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

// ── NAVIGA + GOTOPAGE(0) ──
await page.goto(`${URL_BASE}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => Array.from(document.querySelectorAll('span,button,a')).some(e => { const t = e.textContent?.trim().toLowerCase() ?? ''; return t === 'nuovo' || t === 'new'; }), { timeout: 15000 });
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => { window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => { if (typeof c.GotoPage === 'function') c.GotoPage(0); }); });
await new Promise(r => setTimeout(r, 500));
await shot(page, '01-loaded');

// ── TROVA LA RIGA TARGET ──
const rowInfo = await page.evaluate((targetId) => {
  const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll('td');
    const id = cells[2]?.textContent?.trim().replace(/\./g, '') ?? '';
    if (id !== targetId) continue;

    // Ispeziona cells[1] (la "ghost" checkbox)
    const cell1 = cells[1];
    const cell1Html = cell1?.innerHTML?.substring(0, 300) ?? 'N/A';
    const cb = cell1?.querySelector('input[type="checkbox"]');
    const cbId = cb?.id ?? null;
    const cbChecked = cb?.checked ?? null;

    // Ispezione generale del contenuto di cells[0] e cells[1]
    return {
      rowIndex: i,
      cell0Html: cells[0]?.innerHTML?.substring(0, 200) ?? '',
      cell1Html,
      cbFound: !!cb,
      cbId,
      cbChecked,
      rowClass: rows[i].className?.substring(0, 100),
    };
  }
  return null;
}, TARGET_ID);

log('INSPECT', `Row info: ${JSON.stringify(rowInfo, null, 2)}`);

if (!rowInfo) {
  log('ERROR', `Ordine ${TARGET_ID} non trovato`);
  await browser.close();
  process.exit(1);
}

// ── STEP A: Testa SelectRowOnPage (vecchio approccio) + verifica selCount ──
log('TEST_A', '--- TEST A: SelectRowOnPage (vecchio approccio) ---');
await page.evaluate(idx => {
  const c = window.ASPxClientControl?.GetControlCollection?.();
  c?.ForEachControl?.(x => { if (typeof x.UnselectAllRowsOnPage === 'function') x.UnselectAllRowsOnPage(); });
  c?.ForEachControl?.(x => { if (typeof x.SelectRowOnPage === 'function') x.SelectRowOnPage(idx); });
}, rowInfo.rowIndex);
await new Promise(r => setTimeout(r, 600));

const selA = await page.evaluate(() => {
  let count = 0, keys = [], name = null;
  window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => {
    if (typeof c.GetSelectedRowCount === 'function') { count = c.GetSelectedRowCount(); keys = c.GetSelectedKeysOnPage?.() ?? []; name = c.name; }
  });
  const visual = document.querySelectorAll('tr[class*="dxgvDataRow"] input[type="checkbox"]:checked').length;
  const cssSelected = document.querySelectorAll('tr[class*="dxgvDataRow_Selected"],tr[class*="dxgvFocusedRow"]').length;
  const btnDisabled = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T')?.classList.contains('dxm-disabled') ?? true;
  return { count, keys, name, visual, cssSelected, btnDisabled };
});
log('TEST_A', `selCount=${selA.count} keys=${JSON.stringify(selA.keys)} visual=${selA.visual} css=${selA.cssSelected} btnDisabled=${selA.btnDisabled}`);
await shot(page, '02-after-api-select');

// Reset selezione prima del test B
await page.evaluate(() => {
  window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => {
    if (typeof c.UnselectAllRowsOnPage === 'function') c.UnselectAllRowsOnPage();
  });
});
await new Promise(r => setTimeout(r, 400));

// ── STEP B: Testa click fisico sul checkbox in cells[1] ──
log('TEST_B', '--- TEST B: Click fisico su cells[1] checkbox ---');

// Trova il bounding rect della riga per click coordinato
const rowBBox = await page.evaluate((targetId) => {
  const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    const id = cells[2]?.textContent?.trim().replace(/\./g, '') ?? '';
    if (id !== targetId) continue;

    // cells[1] - la cella checkbox
    const cell = cells[1];
    const rect = cell?.getBoundingClientRect();
    const cb = cell?.querySelector('input[type="checkbox"]');
    const cbRect = cb?.getBoundingClientRect();
    return {
      cellRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      cbRect: cbRect ? { x: cbRect.x, y: cbRect.y, width: cbRect.width, height: cbRect.height } : null,
      cbId: cb?.id ?? null,
      cellInnerText: cell?.innerText?.substring(0, 50) ?? '',
    };
  }
  return null;
}, TARGET_ID);

log('TEST_B', `cells[1] bbox: ${JSON.stringify(rowBBox)}`);

if (rowBBox?.cbRect && rowBBox.cbRect.width > 0) {
  // Click diretto sull'input checkbox
  const cbCenterX = rowBBox.cbRect.x + rowBBox.cbRect.width / 2;
  const cbCenterY = rowBBox.cbRect.y + rowBBox.cbRect.height / 2;
  log('TEST_B', `Click su checkbox a (${cbCenterX.toFixed(0)}, ${cbCenterY.toFixed(0)})`);
  await page.mouse.click(cbCenterX, cbCenterY);
} else if (rowBBox?.cellRect) {
  // Click al centro di cells[1]
  const cellCenterX = rowBBox.cellRect.x + rowBBox.cellRect.width / 2;
  const cellCenterY = rowBBox.cellRect.y + rowBBox.cellRect.height / 2;
  log('TEST_B', `Nessun checkbox trovato, click al centro di cells[1] a (${cellCenterX.toFixed(0)}, ${cellCenterY.toFixed(0)})`);
  await page.mouse.click(cellCenterX, cellCenterY);
} else {
  log('TEST_B', 'Impossibile determinare posizione — fallback: click via evaluate su element');
  await page.evaluate((targetId) => {
    const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      const id = cells[2]?.textContent?.trim().replace(/\./g, '') ?? '';
      if (id !== targetId) continue;
      const cell = cells[1];
      const cb = cell?.querySelector('input[type="checkbox"]') || cell;
      console.log('[D] Click evaluate su cells[1]: ' + cell?.innerHTML?.substring(0, 100));
      cb?.click();
      break;
    }
  }, TARGET_ID);
}

await new Promise(r => setTimeout(r, 800));
await waitNoLoading(page, 5000);

const selB = await page.evaluate(() => {
  let count = 0, keys = [], name = null;
  window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => {
    if (typeof c.GetSelectedRowCount === 'function') { count = c.GetSelectedRowCount(); keys = c.GetSelectedKeysOnPage?.() ?? []; name = c.name; }
  });
  const visual = document.querySelectorAll('tr[class*="dxgvDataRow"] input[type="checkbox"]:checked').length;
  const cssSelected = document.querySelectorAll('tr[class*="dxgvDataRow_Selected"],tr[class*="dxgvFocusedRow"]').length;
  const btnDisabled = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T')?.classList.contains('dxm-disabled') ?? true;
  return { count, keys, name, visual, cssSelected, btnDisabled };
});
log('TEST_B', `selCount=${selB.count} keys=${JSON.stringify(selB.keys)} visual=${selB.visual} css=${selB.cssSelected} btnDisabled=${selB.btnDisabled}`);
await shot(page, '03-after-checkbox-click');

// ── STEP C: Se la selezione B è riuscita, testa il delete ──
if (!selB.btnDisabled && (selB.count > 0 || selB.visual > 0 || selB.cssSelected > 0)) {
  log('DELETE', '✅ Selezione fisica OK — provo il delete...');

  let dialogHandled = false;
  const dp = new Promise(res => {
    let done = false;
    const h = d => {
      if (done) return;
      done = true;
      dialogHandled = true;
      log('DIALOG', `type=${d.type()} msg="${d.message()}"`);
      d.accept();
      log('DIALOG', 'Accepted ✓');
      res(true);
    };
    page.once('dialog', h);
    setTimeout(() => { if (!done) { done = true; page.off('dialog', h); log('DIALOG', 'TIMEOUT'); res(false); } }, 10000);
  });

  await page.evaluate(() => {
    const btn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');
    if (btn) { console.log('[D] Click Cancellare'); btn.click(); }
  });
  await dp;
  log('DELETE', `dialogHandled=${dialogHandled}`);

  await waitNoLoading(page, 10000);
  await new Promise(r => setTimeout(r, 1000));
  await shot(page, '04-after-delete');

  // Reload completo per verificare persistenza
  log('RELOAD', 'Reload completo per verifica server-side...');
  await page.goto(`${URL_BASE}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('span,button,a')).some(e => { const t = e.textContent?.trim().toLowerCase() ?? ''; return t === 'nuovo' || t === 'new'; }), { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => { window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c => { if (typeof c.GotoPage === 'function') c.GotoPage(0); }); });
  await new Promise(r => setTimeout(r, 500));

  const stillPresent = await page.evaluate(id => {
    const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
    return rows.some(r => (r.querySelectorAll('td')[2]?.textContent?.trim().replace(/\./g, '') ?? '') === id);
  }, TARGET_ID);

  log('VERIFY', `Ordine ${TARGET_ID} ANCORA presente dopo reload: ${stillPresent}`);
  if (stillPresent) {
    log('CONCLUSIONE', '❌ Delete con click fisico: NON persiste nemmeno con checkbox click');
  } else {
    log('CONCLUSIONE', '✅ Delete con click fisico: PERSISTE! Questo è il fix corretto.');
  }
  await shot(page, '05-verify-reload');
} else {
  log('DELETE', `❌ Selezione fisica NON riuscita — btnDisabled=${selB.btnDisabled} count=${selB.count}`);
  log('CONCLUSIONE', 'Il click su cells[1] non sta abilitando il pulsante Cancellare — cercare alternativa');
}

await browser.close();

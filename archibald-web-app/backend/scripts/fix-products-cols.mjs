/**
 * Fix: abilita DATAAREAID e MODIFIEDDATETIME nella pagina Prodotti
 */
import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function login(page) {
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName') || i.name?.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u && p) ? { userId: u.id, passId: p.id } : null;
  });
  const fill = async (id, val) => {
    await page.evaluate((id, v) => {
      const el = document.getElementById(id);
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (s) s.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, id, val);
    await page.keyboard.press('Tab');
  };
  await fill(fields.userId, 'ikiA0930');
  await fill(fields.passId, 'Fresis26@');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button,input[type='submit'],a")).find(btn => /accedi|login/i.test((btn.textContent||'').toLowerCase().trim()));
    if(b)b.click();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('✅ Login OK');
}

async function waitIdle(page, timeout = 20000) {
  await page.evaluate(() => { window.__dxIdle = 0; });
  await page.waitForFunction(
    (n) => {
      const panel = document.querySelector('.dxgvLoadingPanel_XafTheme,.dxlp,[class*="LoadingPanel"]');
      if (panel && panel.offsetParent !== null) { window.__dxIdle = 0; return false; }
      window.__dxIdle = (window.__dxIdle || 0) + 1;
      return window.__dxIdle >= n;
    },
    { timeout, polling: 200 }, 3,
  );
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(40000);
  page.on('dialog', d => d.accept());

  await login(page);
  await sleep(1000);

  console.log('\nNavigazione → Prodotti...');
  await page.goto(`${ARCHIBALD_URL}/INVENTTABLE_ListView/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitIdle(page).catch(() => {});
  await sleep(1000);

  // Leggi indici XAF per i campi target
  const targets = await page.evaluate(() => {
    const w = window;
    const gn = Object.keys(w).find(k => { try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; } catch { return false; } });
    if (!gn) return null;
    const grid = w[gn];
    const result = {};
    for (let i = 0; ; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (['DATAAREAID', 'MODIFIEDDATETIME'].includes(col.fieldName)) {
          result[col.fieldName] = { index: i, visible: col.visible !== false };
        }
      } catch { break; }
    }
    return result;
  });
  console.log('XAF column info:', JSON.stringify(targets));

  const hidden = Object.entries(targets).filter(([, v]) => !v.visible);
  if (hidden.length === 0) {
    console.log('✅ Tutti i campi già visibili, nulla da fare');
    await browser.close();
    return;
  }

  // Apri Column Chooser
  const hdr = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td');
  await hdr.click({ button: 'right' });
  await sleep(1200);
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.dxm-item')).find(el => /show customization dialog/i.test(el.textContent||''));
    if(item) item.click();
  });
  await sleep(2000);

  // Tab Column Chooser
  const tabId = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.width>0 && r.height>0 && r.height<60; });
    const t = tabs.find(el => /^column.?chooser$/i.test(el.textContent?.trim()||''));
    if(t) { t.click(); return t.id; }
    return null;
  });
  console.log('Tab Column Chooser:', tabId);
  await sleep(1500);

  // Abilita ogni campo nascosto tramite ID pattern C{N}Chk5
  for (const [fieldName, info] of hidden) {
    const idx = info.index;
    console.log(`\nAbilito ${fieldName} (XAF index=${idx})...`);
    const res = await page.evaluate((idx) => {
      const span = document.querySelector(`[id*="C${idx}Chk5_D"], [id*="C${idx}Chk5"]`);
      if (!span) return { ok: false, msg: 'span non trovato' };
      span.scrollIntoView({ block: 'center', behavior: 'smooth' });
      span.click();
      return { ok: true, id: span.id, cls: span.className };
    }, idx);
    console.log(`  ${JSON.stringify(res)}`);
    await sleep(600);
  }

  // Conferma
  await sleep(500);
  const confirmed = await page.evaluate(() => {
    // Prova prima DXCBtn21, poi DXCBtn201, poi sprite
    const btn21 = document.querySelector('[id$="DXCDWindow_DXCBtn21"]');
    if (btn21 && !btn21.className.includes('Disabled')) { btn21.click(); return { ok: true, method: 'DXCBtn21' }; }
    const btn201 = document.querySelector('[id$="DXCDWindow_DXCBtn201"]');
    if (btn201 && !btn201.className.includes('Disabled')) { btn201.click(); return { ok: true, method: 'DXCBtn201' }; }
    // Sprite fallback (funziona anche se "disabled" visualmente — usa l'img)
    const img = Array.from(document.querySelectorAll('[id*="DXCDWindow"] img[class*="gvCOApply"]')).find(e => e.getBoundingClientRect().width > 0);
    if (img) { img.closest('a, button')?.click() || img.click(); return { ok: true, method: 'sprite', id: img.id }; }
    const byArgs = document.querySelector('[data-args*="CustDialogApply"]');
    if (byArgs) { byArgs.click(); return { ok: true, method: 'data-args' }; }
    return { ok: false };
  });
  console.log('\nConfirm:', JSON.stringify(confirmed));
  await sleep(2000);
  await waitIdle(page).catch(() => {});

  // Verifica finale
  const after = await page.evaluate(() => {
    const w = window;
    const gn = Object.keys(w).find(k => { try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; } catch { return false; } });
    if (!gn) return {};
    const grid = w[gn];
    const result = {};
    for (let i = 0; ; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (['DATAAREAID', 'MODIFIEDDATETIME'].includes(col.fieldName)) {
          result[col.fieldName] = { index: i, visible: col.visible !== false };
        }
      } catch { break; }
    }
    return result;
  });
  console.log('\nStato finale:', JSON.stringify(after));

  for (const [fn, info] of Object.entries(after)) {
    console.log(`  ${fn}: ${info.visible ? '✅ visibile' : '❌ ancora nascosto'}`);
  }

  console.log('\nChiudi il browser manualmente.');
})();

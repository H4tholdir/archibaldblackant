/**
 * Fix mirato: abilita DLVCITY (Città di consegna) nella pagina DDT
 * DLVCITY ha XAF index=9, span ID pattern: C9Chk5_D
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

  // Naviga alla pagina DDT
  console.log('\nNavigazione → DDT...');
  await page.goto(`${ARCHIBALD_URL}/CUSTPACKINGSLIPJOUR_ListView/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitIdle(page).catch(() => {});
  await sleep(1000);

  // Verifica stato attuale
  const before = await page.evaluate(() => {
    const w = window;
    const gn = Object.keys(w).find(k => { try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; } catch { return false; } });
    if (!gn) return null;
    const grid = w[gn];
    for (let i = 0; ; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (col.fieldName === 'DLVCITY') return { index: i, visible: col.visible !== false };
      } catch { break; }
    }
    return null;
  });
  console.log(`DLVCITY stato attuale: ${JSON.stringify(before)}`);
  if (before?.visible) { console.log('✅ DLVCITY già visibile, nulla da fare'); await browser.close(); return; }

  // Apri Column Chooser via right-click sull'header
  const hdr = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td');
  await hdr.click({ button: 'right' });
  await sleep(1200);

  // Click Show Customization Dialog
  const opened = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.dxm-item')).find(el => /show customization dialog/i.test(el.textContent||''));
    if(item) { item.click(); return true; }
    return false;
  });
  if (!opened) { console.log('❌ Customization Dialog non trovato'); await browser.close(); return; }
  await sleep(2000);
  console.log('✅ Dialog aperto');

  // Click tab Column Chooser
  const tabOk = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.width>0 && r.height>0 && r.height<60; });
    const t = tabs.find(el => /^column.?chooser$/i.test(el.textContent?.trim()||''));
    if(t) { t.click(); return t.id; }
    return null;
  });
  console.log(`✅ Tab Column Chooser: ${tabOk}`);
  await sleep(1500);

  // Abilita DLVCITY tramite ID pattern C9Chk5
  const result = await page.evaluate(() => {
    // DLVCITY = XAF index 9, hidden span ID: ...C9Chk5_D
    const span = document.querySelector('[id*="C9Chk5_D"], [id*="C9Chk5"]');
    if (!span) {
      const allHidden = Array.from(document.querySelectorAll('span.dxGridView_gvCOColumnHide_XafTheme'));
      return { ok: false, msg: `span non trovato, hidden count=${allHidden.length}` };
    }
    span.scrollIntoView({ block: 'center', behavior: 'smooth' });
    span.click();
    return { ok: true, id: span.id, className: span.className };
  });
  console.log(`DLVCITY click: ${JSON.stringify(result)}`);
  await sleep(800);

  // Conferma
  const confirmed = await page.evaluate(() => {
    const btn = document.querySelector('[id$="DXCDWindow_DXCBtn21"]');
    if (btn) { btn.click(); return { ok: true, method: 'DXCBtn21' }; }
    const img = Array.from(document.querySelectorAll('[id*="DXCDWindow"] img[class*="gvCOApply"]')).find(e => e.getBoundingClientRect().width > 0);
    if (img) { img.click(); return { ok: true, method: 'sprite' }; }
    const byArgs = document.querySelector('[data-args*="CustDialogApply"]');
    if (byArgs) { byArgs.click(); return { ok: true, method: 'data-args' }; }
    return { ok: false };
  });
  console.log(`Confirm: ${JSON.stringify(confirmed)}`);
  await sleep(2000);
  await waitIdle(page).catch(() => {});

  // Verifica finale
  const after = await page.evaluate(() => {
    const w = window;
    const gn = Object.keys(w).find(k => { try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; } catch { return false; } });
    if (!gn) return null;
    const grid = w[gn];
    for (let i = 0; ; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (col.fieldName === 'DLVCITY') return { index: i, visible: col.visible !== false };
      } catch { break; }
    }
    return null;
  });
  console.log(`DLVCITY dopo fix: ${JSON.stringify(after)}`);

  if (after?.visible) {
    console.log('\n✅ DLVCITY ora visibile! Fix applicato.');
  } else {
    console.log('\n❌ DLVCITY ancora nascosta.');
  }

  console.log('\nChiudi il browser manualmente quando pronto.');
})();

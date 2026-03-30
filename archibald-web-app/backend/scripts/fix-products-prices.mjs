/**
 * Fix: abilita DATAAREAID + MODIFIEDDATETIME (prodotti) e DATAAREAID (prezzi)
 * Usa il pattern C{XAF_index}Chk5_D per trovare gli eye span nascosti
 */
import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function login(page) {
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u && p) ? { uid: u.id, pid: p.id } : null;
  });
  const fill = async (id, v) => {
    await page.evaluate((id,v) => {
      const el = document.getElementById(id);
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
      if(s) s.call(el,v); else el.value=v;
      el.dispatchEvent(new Event('input',{bubbles:true}));
    }, id, v);
    await page.keyboard.press('Tab');
  };
  await fill(fields.uid, 'ikiA0930');
  await fill(fields.pid, 'Fresis26@');
  await page.evaluate(() => { const b=Array.from(document.querySelectorAll('button,input[type=submit],a')).find(b=>/accedi|login/i.test((b.textContent||'').toLowerCase().trim())); if(b)b.click(); });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('✅ Login OK');
}

async function waitIdle(page, timeout=20000) {
  await page.evaluate(() => { window.__dxIdle = 0; });
  await page.waitForFunction(
    n => {
      const panel = document.querySelector('.dxgvLoadingPanel_XafTheme,.dxlp,[class*="LoadingPanel"]');
      if (panel && panel.offsetParent !== null) { window.__dxIdle = 0; return false; }
      window.__dxIdle = (window.__dxIdle || 0) + 1;
      return window.__dxIdle >= n;
    },
    { timeout, polling: 200 }, 3,
  ).catch(() => {});
}

async function getHiddenTargets(page, fieldNames) {
  return page.evaluate((fns) => {
    const w = window;
    const gn = Object.keys(w).find(k => { try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; } catch { return false; } });
    if (!gn) return {};
    const grid = w[gn];
    const result = {};
    for (let i=0; ; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (fns.includes(col.fieldName)) {
          result[col.fieldName] = { index: i, visible: col.visible !== false && col.visible !== null };
        }
      } catch { break; }
    }
    return result;
  }, fieldNames);
}

async function openColumnChooser(page) {
  const hdr = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td');
  await hdr.click({ button: 'right' });
  await sleep(1200);
  const ok = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.dxm-item')).find(el => /show customization dialog/i.test(el.textContent||''));
    if(item) { item.click(); return true; }
    return false;
  });
  if (!ok) throw new Error('Show Customization Dialog non trovato');
  await sleep(2000);

  const tabId = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.width>0 && r.height>0 && r.height<60; });
    const t = tabs.find(el => /^column.?chooser$/i.test(el.textContent?.trim()||''));
    if(t) { t.click(); return t.id; }
    return null;
  });
  await sleep(1500);
  return tabId;
}

async function enableByIndex(page, xafIndex) {
  return page.evaluate((idx) => {
    const span = document.querySelector(`[id*="C${idx}Chk5_D"], [id*="C${idx}Chk5"]`);
    if (!span) return { ok: false, msg: `C${idx}Chk5 non trovato` };
    span.scrollIntoView({ block: 'center', behavior: 'smooth' });
    span.click();
    return { ok: true, id: span.id, cls: span.className };
  }, xafIndex);
}

async function confirm(page) {
  return page.evaluate(() => {
    // Prova i due possibili ID del pulsante Apply
    for (const suffix of ['DXCDWindow_DXCBtn21', 'DXCDWindow_DXCBtn201']) {
      const btn = document.querySelector(`[id$="${suffix}"]`);
      if (btn) { btn.click(); return { ok: true, method: suffix }; }
    }
    // Fallback: img Apply
    const img = Array.from(document.querySelectorAll('[id*="DXCDWindow"] img[class*="gvCOApply"]')).find(e => e.getBoundingClientRect().width > 0);
    if (img) {
      const parent = img.closest('[data-args*="CustDialogApply"]') || img.parentElement;
      parent?.click();
      return { ok: true, method: 'sprite' };
    }
    return { ok: false };
  });
}

async function fixPage(page, url, fieldNames) {
  console.log(`\n--- ${url} ---`);
  await page.goto(`${ARCHIBALD_URL}/${url}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitIdle(page);

  const targets = await getHiddenTargets(page, fieldNames);
  console.log('Stato iniziale:', JSON.stringify(targets));

  const toEnable = Object.entries(targets).filter(([,v]) => !v.visible);
  if (toEnable.length === 0) { console.log('✅ Tutti già visibili'); return; }

  const tabId = await openColumnChooser(page);
  console.log('Tab Column Chooser:', tabId);

  for (const [fn, info] of toEnable) {
    console.log(`\nAbilito ${fn} (index=${info.index})...`);
    const res = await enableByIndex(page, info.index);
    console.log(' ', JSON.stringify(res));
    await sleep(600);
  }

  await sleep(400);
  const confirmed = await confirm(page);
  console.log('Confirm:', JSON.stringify(confirmed));
  await sleep(2000);
  await waitIdle(page);

  const after = await getHiddenTargets(page, fieldNames);
  console.log('Stato dopo:', JSON.stringify(after));
  for (const [fn, info] of Object.entries(after)) {
    console.log(`  ${fn}: ${info.visible ? '✅' : '❌'}`);
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--ignore-certificate-errors','--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(40000);
  page.on('dialog', d => d.accept());

  await login(page);

  await fixPage(page, 'INVENTTABLE_ListView', ['DATAAREAID', 'MODIFIEDDATETIME']);
  await fixPage(page, 'PRICEDISCTABLE_ListView', ['DATAAREAID']);

  console.log('\n✅ Done. Chiudi il browser manualmente.');
})();

/**
 * Fix completo: abilita tutti i campi nascosti necessari per lo scraper
 * Usa page.click() (eventi mouse reali) invece di el.click() (JS) per
 * triggerare correttamente DevExpress → Apply button si abilita → AJAX salva il profilo
 */
import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Colonne nascoste da abilitare per pagina (fieldName → XAF index)
// Ottenute da check-all-scraper-cols.mjs
const TO_ENABLE = {
  customers: [
    { fn: 'BUSRELTYPEID.TYPEID', idx: 3 },
    { fn: 'EXTERNALACCOUNTNUM', idx: 7 },
    { fn: 'OURACCOUNTNUM', idx: 18 },
  ],
  orders: [
    { fn: 'EMAIL', idx: 27 },
  ],
  ddt: [
    { fn: 'DLVCITY', idx: 9 },
    { fn: 'ID', idx: 19 },
  ],
  invoices: [
    { fn: 'SALESID', idx: 40 },
  ],
  products: [
    { fn: 'BRASFIGURE', idx: 0 },
    { fn: 'BRASITEMIDBULK', idx: 1 },
    { fn: 'BRASPACKAGEEXPERTS', idx: 2 },
    { fn: 'BRASSIZE', idx: 5 },
    { fn: 'CONFIGID', idx: 6 },
    { fn: 'CREATEDBY', idx: 7 },
    { fn: 'CREATEDDATETIME', idx: 8 },
    { fn: 'DATAAREAID', idx: 9 },
    { fn: 'DEFAULTSALESQTY', idx: 10 },
    { fn: 'DISPLAYPRODUCTNUMBER', idx: 12 },
    { fn: 'ENDDISC', idx: 13 },
    { fn: 'ID', idx: 15 },
    { fn: 'LINEDISC.ID', idx: 18 },
    { fn: 'MODIFIEDBY', idx: 20 },
    { fn: 'MODIFIEDDATETIME', idx: 21 },
    { fn: 'ORDERITEM', idx: 24 },
    { fn: 'PURCHPRICEPCS', idx: 29 },
    { fn: 'STANDARDCONFIGID', idx: 31 },
    { fn: 'STANDARDQTY', idx: 32 },
    { fn: 'STOPPED', idx: 33 },
    { fn: 'TAXITEMGROUPID', idx: 34 },
    { fn: 'UNITID', idx: 35 },
  ],
  prices: [
    { fn: 'DATAAREAID', idx: 13 },
    { fn: 'MODIFIEDDATETIME', idx: 31 },
  ],
};

const PAGE_URLS = {
  customers: 'CUSTTABLE_ListView_Agent',
  orders: 'SALESTABLE_ListView_Agent',
  ddt: 'CUSTPACKINGSLIPJOUR_ListView',
  invoices: 'CUSTINVOICEJOUR_ListView',
  products: 'INVENTTABLE_ListView',
  prices: 'PRICEDISCTABLE_ListView',
};

async function login(page) {
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u&&p)?{uid:u.id,pid:p.id}:null;
  });
  const fill = async (id,v) => {
    await page.evaluate((id,v) => {
      const el=document.getElementById(id);
      const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
      if(s)s.call(el,v);else el.value=v;
      el.dispatchEvent(new Event('input',{bubbles:true}));
    },id,v);
    await page.keyboard.press('Tab');
  };
  await fill(fields.uid,'ikiA0930'); await fill(fields.pid,'Fresis26@');
  await page.evaluate(()=>{
    const b=Array.from(document.querySelectorAll('button,input[type=submit],a')).find(b=>/accedi|login/i.test((b.textContent||'').toLowerCase().trim()));
    if(b)b.click();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('✅ Login OK');
}

async function waitIdle(page, timeout=25000) {
  await page.evaluate(() => { window.__dxIdle = 0; });
  await page.waitForFunction(
    n => {
      const p = document.querySelector('.dxgvLoadingPanel_XafTheme,.dxlp,[class*="LoadingPanel"]');
      if(p && p.offsetParent !== null) { window.__dxIdle=0; return false; }
      window.__dxIdle=(window.__dxIdle||0)+1;
      return window.__dxIdle>=n;
    },
    { timeout, polling:200 }, 3
  ).catch(()=>{});
}

async function fixPage(page, name, url, targets) {
  console.log(`\n${'═'.repeat(50)}\n${name}: ${targets.length} colonne da abilitare`);

  await page.goto(`${ARCHIBALD_URL}/${url}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitIdle(page);
  await sleep(500);

  // 1. Right-click sull'header per aprire il context menu
  await page.waitForSelector('.dxgvHeader_XafTheme td, .dxgv_hc td', { timeout: 5000 });
  const hdrHandle = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td');
  await hdrHandle.click({ button: 'right' });
  await sleep(1200);

  // 2. Click "Show Customization Dialog"
  const menuItemId = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.dxm-item')).find(el => /show customization dialog/i.test(el.textContent||''));
    if(item) { item.click(); return item.id; }
    return null;
  });
  if (!menuItemId) { console.log(`  ❌ Show Customization Dialog non trovato`); return; }
  await sleep(2000);

  // 3. Click tab "Column Chooser"
  const tabId = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]'))
      .filter(el => { const r=el.getBoundingClientRect(); return r.width>0 && r.height>0 && r.height<60; });
    const t = tabs.find(el => /^column.?chooser$/i.test(el.textContent?.trim()||''));
    if(t) { t.click(); return t.id; }
    return null;
  });
  if (!tabId) { console.log(`  ❌ Tab Column Chooser non trovato`); return; }
  console.log(`  Tab: ${tabId}`);
  await sleep(1500);

  // 4. Per ogni colonna da abilitare: usa page.click() per eventi mouse reali
  let clickedCount = 0;
  for (const { fn, idx } of targets) {
    // Trova lo span nell'area _3_drag (hidden) — pattern: C{idx}Chk5
    const spanId = await page.evaluate((idx) => {
      const span = document.querySelector(`[id*="C${idx}Chk5_D"], [id*="C${idx}Chk5"]`);
      return span ? span.id : null;
    }, idx);

    if (!spanId) {
      console.log(`  ⚠️  ${fn}[${idx}]: span non trovato`);
      continue;
    }

    try {
      // Usa page.click() per veri mouse events — scroll automatico + mousedown+up+click
      await page.click(`#${CSS.escape(spanId)}`);
      clickedCount++;
      console.log(`  ✅ ${fn}[${idx}]: clicked (${spanId.slice(-20)})`);
      await sleep(300);
    } catch (err) {
      console.log(`  ❌ ${fn}[${idx}]: page.click errore: ${err.message}`);
    }
  }

  if (clickedCount === 0) { console.log(`  ⚠️  Nessun click eseguito, salto confirm`); return; }

  // 5. Attendi che Apply button si abiliti (DevExpress lo abilita dopo modifiche)
  await sleep(500);
  const btnState = await page.evaluate(() => {
    const btn = document.querySelector('[id*="DXCDWindow_DXCBtn201"]') || document.querySelector('[id*="DXCDWindow_DXCBtn21"]');
    if (!btn) return { found: false };
    return {
      found: true,
      id: btn.id,
      disabled: btn.classList.contains('dxbDisabled_XafTheme'),
      hasHref: !!btn.href || !!btn.getAttribute('href'),
    };
  });
  console.log(`  Apply btn: ${JSON.stringify(btnState)}`);

  // 6. Clicca Apply con page.click() per veri mouse events
  const applySelector = btnState.id ? `#${CSS.escape(btnState.id)}` : '[id*="DXCDWindow_DXCBtn201"], [id*="DXCDWindow_DXCBtn21"]';

  // Se ancora disabled, prova a rimuovere la classe e forzare click
  if (btnState.disabled) {
    console.log(`  ⚠️  Apply ancora disabled, forzo abilitazione...`);
    await page.evaluate(() => {
      const btn = document.querySelector('[id*="DXCDWindow_DXCBtn201"]') || document.querySelector('[id*="DXCDWindow_DXCBtn21"]');
      if (!btn) return;
      btn.classList.remove('dxbDisabled_XafTheme');
      const img = btn.querySelector('img');
      if (img) img.classList.remove('dxGridView_gvCOApplyDisabled_XafTheme');
      // Ripristina href se necessario
      const sh = btn.getAttribute('savedhref');
      if (sh && sh !== 'javascript:;') btn.href = sh;
    });
  }

  try {
    await page.click(applySelector);
    console.log(`  ✅ Apply clicked`);
  } catch (err) {
    // Fallback: click via evaluate
    await page.evaluate(() => {
      const btn = document.querySelector('[id*="DXCDWindow_DXCBtn201"]') || document.querySelector('[id*="DXCDWindow_DXCBtn21"]');
      const img = btn?.querySelector('img[class*="gvCOApply"]');
      if (img) img.click();
      else btn?.click();
    });
    console.log(`  ✅ Apply fallback clicked`);
  }

  // 7. Attendi salvataggio AJAX
  await sleep(3000);
  await waitIdle(page);

  // 8. Verifica finale (ricarica la pagina per leggere lo stato server)
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1000);

  const afterReload = await page.evaluate((tgts) => {
    const w = window;
    const gn = Object.keys(w).find(k => { try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; } catch { return false; } });
    if (!gn) return {};
    const grid = w[gn];
    const result = {};
    for (let i=0; ; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (tgts.some(t => t.fn === col.fieldName)) result[col.fieldName] = col.visible !== false;
      } catch { break; }
    }
    return result;
  }, targets);

  const ok = targets.every(t => afterReload[t.fn] === true);
  console.log(`  Risultato dopo reload: ${ok ? '✅ TUTTO OK' : '❌ ANCORA NASCOSTI'}`);
  for (const { fn } of targets) {
    const v = afterReload[fn];
    if (v !== true) console.log(`    ❌ ${fn}: ${v}`);
  }
}

// CSS.escape polyfill se non disponibile
if (typeof CSS === 'undefined') {
  global.CSS = {
    escape: (str) => str.replace(/([^\w\-])/g, '\\$1'),
  };
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

  for (const [name, targets] of Object.entries(TO_ENABLE)) {
    if (!targets.length) continue;
    try {
      await fixPage(page, name, PAGE_URLS[name], targets);
    } catch (err) {
      console.log(`\n❌ ${name}: ERRORE — ${err.message}`);
    }
    await sleep(500);
  }

  console.log('\n\n✅ Fix completato. Chiudi il browser manualmente.');
})();

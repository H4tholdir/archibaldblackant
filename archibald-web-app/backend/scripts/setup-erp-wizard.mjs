/**
 * ERP Setup Wizard — DEFINITIVO
 *
 * Per ogni pagina ERP esegue il flusso completo:
 *   1. Imposta filtro permanente (se presente)
 *   2. Apre Column Chooser (tasto destro → Show Customization Dialog → tab Column Chooser)
 *   3. Per ogni colonna necessaria: controlla via XAF API, se nascosta clicca l'eye span
 *   4. Salva via grid.PerformCallback (NON btn.click — non persiste)
 *
 * Usage:
 *   node archibald-web-app/backend/scripts/setup-erp-wizard.mjs
 */

import puppeteer from 'puppeteer';
import path from 'path';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASSWORD = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Configurazione pagine ─────────────────────────────────────────────────────
// Tutte le colonne richieste dallo scraper per ogni pagina.
// enableColumn salta automaticamente quelle già visibili.

const PAGES = [
  {
    name: 'customers',
    url: `${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/`,
    columnsToEnable: [
      { fieldName: 'ACCOUNTNUM' },
      { fieldName: 'NAME' },
      { fieldName: 'VATNUM' },
      { fieldName: 'FISCALCODE' },
      { fieldName: 'LEGALAUTHORITY' },
      { fieldName: 'LEGALEMAIL' },
      { fieldName: 'PHONE' },
      { fieldName: 'CELLULARPHONE' },
      { fieldName: 'URL' },
      { fieldName: 'BRASCRMATTENTIONTO' },
      { fieldName: 'STREET' },
      { fieldName: 'LOGISTICSADDRESSZIPCODE.ZIPCODE' },
      { fieldName: 'CITY' },
      { fieldName: 'SALESACT' },
      { fieldName: 'BUSRELTYPEID.TYPEID' },
      { fieldName: 'DLVMODE.TXT' },
      { fieldName: 'BUSRELTYPEID.TYPEDESCRIPTION' },
      { fieldName: 'LASTORDERDATE' },
      { fieldName: 'ORDERCOUNTACT' },
      { fieldName: 'ORDERCOUNTPREV' },
      { fieldName: 'SALESPREV' },
      { fieldName: 'ORDERCOUNTPREV2' },
      { fieldName: 'SALESPREV2' },
      { fieldName: 'EXTERNALACCOUNTNUM' },
      { fieldName: 'OURACCOUNTNUM' },
      { fieldName: 'ID' },
    ],
  },
  {
    name: 'orders',
    url: `${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`,
    columnsToEnable: [
      { fieldName: 'ID' },
      { fieldName: 'SALESID' },
      { fieldName: 'CUSTACCOUNT' },
      { fieldName: 'SALESNAME' },
      { fieldName: 'CREATEDDATETIME' },
      { fieldName: 'DELIVERYDATE' },
      { fieldName: 'SALESSTATUS' },
      { fieldName: 'SALESTYPE' },
      { fieldName: 'DOCUMENTSTATUS' },
      { fieldName: 'SALESORIGINID.DESCRIPTION' },
      { fieldName: 'TRANSFERSTATUS' },
      { fieldName: 'TRANSFERREDDATE' },
      { fieldName: 'COMPLETEDDATE' },
      { fieldName: 'QUOTE' },
      { fieldName: 'MANUALDISCOUNT' },
      { fieldName: 'GROSSAMOUNT' },
      { fieldName: 'AmountTotal' },
      { fieldName: 'SAMPLEORDER' },
      { fieldName: 'DELIVERYNAME' },
      { fieldName: 'DLVADDRESS' },
      { fieldName: 'PURCHORDERFORMNUM' },
      { fieldName: 'CUSTOMERREF' },
      { fieldName: 'EMAIL' },
    ],
  },
  {
    name: 'ddt',
    url: `${ARCHIBALD_URL}/CUSTPACKINGSLIPJOUR_ListView/`,
    columnsToEnable: [
      { fieldName: 'SALESID' },
      { fieldName: 'PACKINGSLIPID' },
      { fieldName: 'DELIVERYDATE' },
      { fieldName: 'ID' },
      { fieldName: 'ORDERACCOUNT' },
      { fieldName: 'SALESTABLE.SALESNAME' },
      { fieldName: 'DELIVERYNAME' },
      { fieldName: 'DLVTERM.TXT' },
      { fieldName: 'DLVMODE.TXT' },
      { fieldName: 'DLVCITY' },
      { fieldName: 'BRASCRMATTENTIONTO' },
      { fieldName: 'DLVADDRESS' },
      { fieldName: 'QTY' },
      { fieldName: 'CUSTOMERREF' },
      { fieldName: 'PURCHASEORDER' },
      { fieldName: 'BRASTRACKINGNUMBER' },
    ],
  },
  {
    name: 'invoices',
    url: `${ARCHIBALD_URL}/CUSTINVOICEJOUR_ListView/`,
    columnsToEnable: [
      { fieldName: 'SALESID' },
      { fieldName: 'INVOICEID' },
      { fieldName: 'INVOICEDATE' },
      { fieldName: 'INVOICEAMOUNTMST' },
      { fieldName: 'INVOICEACCOUNT' },
      { fieldName: 'INVOICINGNAME' },
      { fieldName: 'QTY' },
      { fieldName: 'REMAINAMOUNTMST' },
      { fieldName: 'SUMTAXMST' },
      { fieldName: 'SUMLINEDISCMST' },
      { fieldName: 'ENDDISCMST' },
      { fieldName: 'DUEDATE' },
      { fieldName: 'PAYMTERMID.DESCRIPTION' },
      { fieldName: 'PURCHASEORDER' },
      { fieldName: 'CLOSED' },
      { fieldName: 'OVERDUEDAYS' },
      { fieldName: 'SETTLEAMOUNTMST' },
      { fieldName: 'LASTSETTLEVOUCHER' },
      { fieldName: 'LASTSETTLEDATE' },
    ],
  },
  {
    name: 'products',
    url: `${ARCHIBALD_URL}/INVENTTABLE_ListView/`,
    columnsToEnable: [
      { fieldName: 'ITEMID' },
      { fieldName: 'NAME' },
      { fieldName: 'SEARCHNAME' },
      { fieldName: 'PRODUCTGROUPID.ID' },
      { fieldName: 'BRASPACKINGCONTENTS' },
      { fieldName: 'DESCRIPTION' },
      { fieldName: 'PRICEUNIT' },
      { fieldName: 'PRODUCTGROUPID.PRODUCTGROUPID' },
      { fieldName: 'LOWESTQTY' },
      { fieldName: 'MULTIPLEQTY' },
      { fieldName: 'HIGHESTQTY' },
      { fieldName: 'BRASFIGURE' },
      { fieldName: 'BRASITEMIDBULK' },
      { fieldName: 'BRASPACKAGEEXPERTS' },
      { fieldName: 'BRASSIZE' },
      { fieldName: 'TAXITEMGROUPID' },
      { fieldName: 'PRODUCTGROUPID.PRODUCTGROUP1' },
      { fieldName: 'CONFIGID' },
      { fieldName: 'CREATEDBY' },
      { fieldName: 'CREATEDDATETIME' },
      { fieldName: 'DATAAREAID' },
      { fieldName: 'DEFAULTSALESQTY' },
      { fieldName: 'DISPLAYPRODUCTNUMBER' },
      { fieldName: 'ENDDISC' },
      { fieldName: 'ID' },
      { fieldName: 'LINEDISC.ID' },
      { fieldName: 'MODIFIEDBY' },
      { fieldName: 'MODIFIEDDATETIME' },
      { fieldName: 'ORDERITEM' },
      { fieldName: 'PURCHPRICEPCS' },
      { fieldName: 'STANDARDCONFIGID' },
      { fieldName: 'STANDARDQTY' },
      { fieldName: 'STOPPED' },
      { fieldName: 'UNITID' },
    ],
  },
  {
    name: 'prices',
    url: `${ARCHIBALD_URL}/PRICEDISCTABLE_ListView/`,
    columnsToEnable: [
      { fieldName: 'ITEMRELATIONID' },
      { fieldName: 'ITEMRELATIONTXT' },
      { fieldName: 'AMOUNT' },
      { fieldName: 'CURRENCY' },
      { fieldName: 'FROMDATE' },
      { fieldName: 'TODATE' },
      { fieldName: 'PRICEUNIT' },
      { fieldName: 'ACCOUNTRELATIONTXT' },
      { fieldName: 'ACCOUNTRELATIONID' },
      { fieldName: 'QUANTITYAMOUNTFROM' },
      { fieldName: 'QUANTITYAMOUNTTO' },
      { fieldName: 'MODIFIEDDATETIME' },
      { fieldName: 'DATAAREAID' },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function log(section, msg) {
  const t = new Date().toISOString().substring(11, 23);
  console.log(`[${t}][${section}] ${msg}`);
}

async function waitIdle(page, timeout = 25000) {
  await page.evaluate(() => { window.__dxIdle = 0; });
  await page.waitForFunction(
    (n) => {
      const panel = document.querySelector('.dxgvLoadingPanel_XafTheme,.dxlp,[class*="LoadingPanel"]');
      if (panel && panel.offsetParent !== null) { window.__dxIdle = 0; return false; }
      let busy = false;
      const col = window.ASPxClientControl?.GetControlCollection?.();
      if (col && typeof col.ForEachControl === 'function') {
        col.ForEachControl((c) => { if (typeof c.InCallback === 'function' && c.InCallback()) busy = true; });
      }
      if (busy) { window.__dxIdle = 0; return false; }
      window.__dxIdle = (window.__dxIdle || 0) + 1;
      return window.__dxIdle >= n;
    },
    { timeout, polling: 200 }, 3,
  );
}

async function login(page) {
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`,
    { waitUntil: 'networkidle2', timeout: 30000 });
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
  };
  await fill(fields.userId, USERNAME);
  await fill(fields.passId, PASSWORD);
  const ok = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button,input[type='submit'],a,div[role='button']"))
      .find(btn => /accedi|^login$/i.test((btn.textContent || '').toLowerCase().trim()) ||
        /login|logon/i.test(btn.id || '') && !/(logo)/i.test(btn.id || ''));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!ok) throw new Error('Submit button not found');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  log('login', '✅ OK');
}

// ─── Apri Column Chooser ──────────────────────────────────────────────────────
async function openColumnChooser(page, pageName) {
  const hdr = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td, table[id*="DXHeadersRow"] td');
  if (!hdr) { log(pageName, '❌ Header non trovato'); return false; }

  await hdr.click({ button: 'right' });
  await sleep(1200);

  const clicked = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.dxm-item'))
      .find(el => /show customization dialog/i.test(el.textContent || ''));
    if (item) { item.click(); return true; }
    const fallback = Array.from(document.querySelectorAll('.dxm-item'))
      .find(el => /customiz/i.test(el.textContent || '') && !/column.chooser/i.test(el.textContent || ''));
    if (fallback) { fallback.click(); return true; }
    return false;
  });

  if (!clicked) { log(pageName, '❌ "Show Customization Dialog" non trovato'); return false; }
  log(pageName, '✅ Dialog aperto');
  await sleep(2000);
  return true;
}

// ─── Clicca tab "Column Chooser" ─────────────────────────────────────────────
// IMPORTANTE: usa page.mouse.click (non el.click sintetico) per triggerare
// correttamente il handler DevExpress che rende visibile FieldChooserPage.
async function clickColumnChooserTab(page, pageName) {
  const tabInfo = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]'))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 60;
      });
    const colChooser = tabs.find(el => /^column.?chooser$/i.test(el.textContent?.trim() || ''));
    if (!colChooser) return null;
    const r = colChooser.getBoundingClientRect();
    return { id: colChooser.id, x: r.x, y: r.y, w: r.width, h: r.height };
  });

  if (!tabInfo) {
    log(pageName, `❌ Tab Column Chooser non trovato`);
    return false;
  }

  await page.mouse.click(tabInfo.x + tabInfo.w / 2, tabInfo.y + tabInfo.h / 2);
  log(pageName, `✅ Tab Column Chooser (${tabInfo.id})`);
  await sleep(2000);
  return true;
}

// ─── Abilita colonna tramite XAF index ────────────────────────────────────────
// Ritorna: 'skipped' (già visibile) | 'clicked' (eye cliccato) | 'failed' (non trovato)
async function enableColumn(page, fieldName) {
  const xafInfo = await page.evaluate((fn) => {
    const gn = Object.keys(window).find(k => {
      try { return window[k]?.GetColumn && typeof window[k].GetColumn === 'function'; }
      catch { return false; }
    });
    if (!gn) return null;
    const grid = window[gn];
    for (let i = 0; ; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (col.fieldName === fn) return { hidden: col.visible === false, index: i };
      } catch { break; }
    }
    return null;
  }, fieldName);

  if (xafInfo === null) {
    log('column', `  ⚠️  "${fieldName}" non trovato nella XAF API`);
    return 'failed';
  }
  if (!xafInfo.hidden) {
    log('column', `  ℹ️  "${fieldName}" → già visibile (skip)`);
    return 'skipped';
  }

  const idx = xafInfo.index;
  log('column', `  🔍 "${fieldName}" nascosto (XAF idx=${idx}) → click eye...`);

  // Dopo page.mouse.click su T3 tab, FieldChooserPage è visibile e gli span hanno rect > 0.
  // ElementHandle.click() gestisce scroll+click atomicamente via CDP Puppeteer.
  const el = await page.$(`[id*="_3_drag_C${idx}Chk5_D"]`);
  if (!el) {
    log('column', `  ❌ "${fieldName}" C${idx}Chk5_D non trovato nel DOM (idx=${idx})`);
    return 'failed';
  }

  const spanId = await el.evaluate(e => e.id);
  await el.click();  // Puppeteer CDP: scroll + mouse events atomici

  log('column', `  ✅ Eye cliccato → ${spanId}`);
  await sleep(300);
  return 'clicked';
}

// ─── Salva cliccando il pulsante Apply ───────────────────────────────────────
// Dopo scrollIntoView sugli eye span, la testata dialog (con Apply) può essere
// uscita dal viewport verso y negativo. ElementHandle.click() fa scroll automatico
// all'elemento prima del click → Apply sempre raggiungibile.
async function applyChanges(page, pageName) {
  const btnEl = await page.$('[data-args*="CustDialogApply"]');
  if (!btnEl) {
    log(pageName, '❌ Apply button non trovato');
    return false;
  }

  const { id, disabled, y } = await btnEl.evaluate(btn => {
    const r = btn.getBoundingClientRect();
    return {
      id: btn.id,
      disabled: btn.classList.contains('dxbDisabled_XafTheme'),
      y: Math.round(r.y),
    };
  });

  if (disabled) {
    log(pageName, '⚠️ Apply button ancora disabled (nessuna modifica registrata da DevExpress)');
    return false;
  }

  log(pageName, `  Apply button y=${y}${y < 0 ? ' (FUORI viewport — scroll necessario)' : ''}`);
  await btnEl.click();  // ElementHandle.click: scroll automatico + click CDP
  log(pageName, `✅ Apply button cliccato (${id})`);
  await sleep(2500);
  await waitIdle(page, 20000).catch(() => log(pageName, '⚠️ waitIdle timeout dopo apply'));
  return true;
}

// ─── Setup di una pagina ──────────────────────────────────────────────────────
async function setupPage(page, config) {
  const { name, url, columnsToEnable } = config;
  log(name, `${'═'.repeat(50)}`);
  log(name, `Navigazione → ${url}`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitIdle(page, 20000).catch(() => log(name, 'waitIdle timeout'));

  // Apri Column Chooser
  const opened = await openColumnChooser(page, name);
  if (!opened) return { ok: false, error: 'column-chooser-not-opened' };

  const tabOk = await clickColumnChooserTab(page, name);
  if (!tabOk) return { ok: false, error: 'tab-not-clicked' };

  // Abilita colonne
  log(name, `Verifico ${columnsToEnable.length} colonne...`);
  const results = { clicked: [], skipped: [], failed: [] };

  for (const { fieldName } of columnsToEnable) {
    const outcome = await enableColumn(page, fieldName);
    results[outcome].push(fieldName);
  }

  log(name, `  Cliccati: ${results.clicked.length} | Skip: ${results.skipped.length} | Falliti: ${results.failed.length}`);
  if (results.clicked.length > 0) {
    log(name, `  Nuovi: ${results.clicked.join(', ')}`);
  }
  if (results.failed.length > 0) {
    log(name, `  ⚠️  Falliti: ${results.failed.join(', ')}`);
  }

  // Salva solo se ci sono modifiche
  if (results.clicked.length > 0) {
    const saved = await applyChanges(page, name);
    if (!saved) return { ok: false, error: 'apply-failed', ...results };
  } else {
    log(name, '✅ Nessuna modifica necessaria — skip apply');
  }

  // Verifica finale
  const stillHidden = await page.evaluate((fields) => {
    const gn = Object.keys(window).find(k => {
      try { return window[k]?.GetColumn && typeof window[k].GetColumn === 'function'; }
      catch { return false; }
    });
    if (!gn) return [];
    const grid = window[gn];
    const hidden = [];
    for (let i = 0; ; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (col.visible === false && fields.includes(col.fieldName)) hidden.push(col.fieldName);
      } catch { break; }
    }
    return hidden;
  }, columnsToEnable.map(c => c.fieldName));

  if (stillHidden.length > 0) {
    log(name, `⚠️  Ancora nascosti dopo apply: ${stillHidden.join(', ')}`);
  } else {
    log(name, `✅ Tutte le colonne visibili`);
  }

  return { ok: stillHidden.length === 0, ...results, stillHidden };
}

// ─── Entry point ─────────────────────────────────────────────────────────────
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(40000);

  page.on('dialog', async (dialog) => {
    log('🔔', `Dialog [${dialog.type()}]: "${dialog.message().substring(0, 80)}" → accept`);
    await dialog.accept();
  });

  page.on('pageerror', err => log('⚠️ JS', err.message?.substring(0, 80)));

  try {
    await login(page);
    await waitIdle(page, 20000).catch(() => {});

    const results = [];
    for (const config of PAGES) {
      try {
        const result = await setupPage(page, config);
        results.push({ page: config.name, ...result });
      } catch (err) {
        log(config.name, `❌ ERRORE: ${err.message}`);
        results.push({ page: config.name, ok: false, error: err.message });
      }
      await sleep(1000);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('RIEPILOGO WIZARD ERP SETUP');
    console.log('═'.repeat(60));
    for (const r of results) {
      const s = r.ok ? '✅' : '❌';
      const detail = r.error
        ? `ERRORE: ${r.error}`
        : `nuove=${r.clicked?.length ?? 0} skip=${r.skipped?.length ?? 0} fallite=${r.failed?.length ?? 0}`;
      console.log(`${s} ${r.page}: ${detail}`);
      if (r.stillHidden?.length) console.log(`   Ancora nascosti: ${r.stillHidden.join(', ')}`);
    }
    console.log('═'.repeat(60));
    console.log('\nChiudi il browser manualmente.');

  } catch (err) {
    console.error('FATAL:', err.message);
    console.error(err.stack);
  }
})();

/**
 * ERP Column Diagnostics — post "Ripristina impostazioni di visualizzazione"
 *
 * Per ogni pagina ERP scrapa:
 *   1. Colonne visibili nel grid (via GetColumnFieldNames)
 *   2. Colonne nascoste nel Column Chooser (via ShowCustomizationDialog)
 *   3. Gap: quali fieldName richiesti dal nostro scraper sono mancanti
 *
 * Usage (run locally con browser visibile):
 *   node archibald-web-app/backend/scripts/diagnose-erp-columns.mjs
 */

import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASSWORD = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';

// ─── Colonne richieste per ogni pagina ────────────────────────────────────────
const REQUIRED_COLUMNS = {
  customers: {
    url: `${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/`,
    fields: ['ACCOUNTNUM','NAME','VATNUM','FISCALCODE','LEGALAUTHORITY','LEGALEMAIL',
             'PHONE','CELLULARPHONE','URL','BRASCRMATTENTIONTO','STREET',
             'LOGISTICSADDRESSZIPCODE.ZIPCODE','CITY','SALESACT','BUSRELTYPEID.TYPEID',
             'DLVMODE.TXT','BUSRELTYPEID.TYPEDESCRIPTION','LASTORDERDATE',
             'ORDERCOUNTACT','ORDERCOUNTPREV','SALESPREV','ORDERCOUNTPREV2','SALESPREV2',
             'EXTERNALACCOUNTNUM','OURACCOUNTNUM','ID'],
  },
  orders: {
    url: `${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`,
    fields: ['ID','SALESID','CUSTACCOUNT','SALESNAME','CREATEDDATETIME','DELIVERYDATE',
             'SALESSTATUS','SALESTYPE','DOCUMENTSTATUS','SALESORIGINID.DESCRIPTION',
             'TRANSFERSTATUS','TRANSFERREDDATE','COMPLETEDDATE','QUOTE','MANUALDISCOUNT',
             'GROSSAMOUNT','AmountTotal','SAMPLEORDER','DELIVERYNAME','DLVADDRESS',
             'PURCHORDERFORMNUM','CUSTOMERREF','EMAIL'],
  },
  ddt: {
    url: `${ARCHIBALD_URL}/CUSTPACKINGSLIPJOUR_ListView/`,
    fields: ['SALESID','PACKINGSLIPID','DELIVERYDATE','ID','ORDERACCOUNT',
             'SALESTABLE.SALESNAME','DELIVERYNAME','DLVTERM.TXT','DLVMODE.TXT',
             'DLVCITY','BRASCRMATTENTIONTO','DLVADDRESS','QTY','CUSTOMERREF',
             'PURCHASEORDER','BRASTRACKINGNUMBER'],
  },
  invoices: {
    url: `${ARCHIBALD_URL}/CUSTINVOICEJOUR_ListView/`,
    fields: ['SALESID','INVOICEID','INVOICEDATE','INVOICEAMOUNTMST','INVOICEACCOUNT',
             'INVOICINGNAME','QTY','REMAINAMOUNTMST','SUMTAXMST','SUMLINEDISCMST',
             'ENDDISCMST','DUEDATE','PAYMTERMID.DESCRIPTION','PURCHASEORDER',
             'CLOSED','OVERDUEDAYS','SETTLEAMOUNTMST','LASTSETTLEVOUCHER','LASTSETTLEDATE'],
  },
  products: {
    url: `${ARCHIBALD_URL}/INVENTTABLE_ListView/`,
    fields: ['ITEMID','NAME','SEARCHNAME','PRODUCTGROUPID.ID','BRASPACKINGCONTENTS',
             'DESCRIPTION','PRICEUNIT','PRODUCTGROUPID.PRODUCTGROUPID','LOWESTQTY',
             'MULTIPLEQTY','HIGHESTQTY','BRASFIGURE','BRASITEMIDBULK','BRASPACKAGEEXPERTS',
             'BRASSIZE','TAXITEMGROUPID','PRODUCTGROUPID.PRODUCTGROUP1','CONFIGID',
             'CREATEDBY','CREATEDDATETIME','DATAAREAID','DEFAULTSALESQTY',
             'DISPLAYPRODUCTNUMBER','ENDDISC','ID','LINEDISC.ID','MODIFIEDBY',
             'MODIFIEDDATETIME','ORDERITEM','STOPPED','PURCHPRICEPCS',
             'STANDARDCONFIGID','STANDARDQTY','UNITID'],
  },
  prices: {
    url: `${ARCHIBALD_URL}/PRICEDISCTABLE_ListView/`,
    fields: ['ITEMRELATIONID','ITEMRELATIONTXT','AMOUNT','CURRENCY','FROMDATE','TODATE',
             'PRICEUNIT','ACCOUNTRELATIONTXT','ACCOUNTRELATIONID','QUANTITYAMOUNTFROM',
             'QUANTITYAMOUNTTO','MODIFIEDDATETIME','DATAAREAID'],
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(section, msg, data) {
  if (data !== undefined) console.log(`[${section}]`, msg, JSON.stringify(data, null, 2));
  else console.log(`[${section}]`, msg);
}

async function waitIdle(page, timeout = 30000) {
  await page.evaluate(() => { window.__dxIdleCount = 0; });
  await page.waitForFunction(
    (n) => {
      const panel = document.querySelector('.dxgvLoadingPanel_XafTheme,.dxlp,[class*="LoadingPanel"]');
      if (panel && panel.offsetParent !== null) { window.__dxIdleCount = 0; return false; }
      let busy = false;
      const col = window.ASPxClientControl?.GetControlCollection?.();
      if (col && typeof col.ForEachControl === 'function') {
        col.ForEachControl((c) => { if (typeof c.InCallback === 'function' && c.InCallback()) busy = true; });
      }
      if (busy) { window.__dxIdleCount = 0; return false; }
      window.__dxIdleCount = (window.__dxIdleCount || 0) + 1;
      return window.__dxIdleCount >= n;
    },
    { timeout, polling: 200 }, 3,
  );
}

async function login(page) {
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
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
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a, div[role='button']"));
    const byText = buttons.find(btn => {
      const text = (btn.textContent || '').toLowerCase().replace(/\s+/g, '');
      return text.includes('accedi') || text === 'login';
    });
    const byId = !byText && buttons.find(btn => {
      const id = (btn.id || '').toLowerCase();
      if (id.includes('logo')) return false;
      return id.includes('login') || id.includes('logon');
    });
    const loginBtn = byText || byId;
    if (loginBtn) { loginBtn.click(); return true; }
    return false;
  });
  if (!clicked) throw new Error('Submit button not found');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  log('login', 'OK');
}

function findGrid() {
  const candidates = Object.entries(window)
    .filter(([k, v]) => v && typeof v === 'object' && typeof v.GetColumnCount === 'function')
    .map(([k, v]) => ({ key: k, obj: v }));
  if (candidates.length === 0) return null;
  // Prefer the one whose key contains the page suffix
  return candidates[0].obj;
}

async function getVisibleColumns(page) {
  return page.evaluate(() => {
    const grid = (() => {
      const candidates = Object.entries(window)
        .filter(([k, v]) => v && typeof v === 'object' && typeof v.GetColumnCount === 'function')
        .map(([, v]) => v);
      return candidates[0] || null;
    })();
    if (!grid) return [];
    const count = grid.GetColumnCount();
    const cols = [];
    for (let i = 0; i < count; i++) {
      const col = grid.GetColumn(i);
      if (!col) continue;
      cols.push({
        index: i,
        fieldName: col.fieldName || '',
        caption: col.name || col.caption || '',
        visible: col.visible !== false,
      });
    }
    return cols.filter(c => c.visible !== false);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function openCustomizationDialog(page) {
  // Right-click on first visible header cell to open context menu
  const headerHandle = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td, table[id*="DXHeadersRow"] td');
  if (!headerHandle) {
    log('colchooser', 'No header cell found for right-click');
    return false;
  }
  await headerHandle.click({ button: 'right' });
  await sleep(1000);

  // Look for "Show Customization Dialog" in context menu
  const menuItem = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.dxm-item, [class*="ContextMenu"] td, .dx-menu-item'));
    const found = items.find(el => /customiz|colonne|column/i.test(el.textContent || ''));
    if (found) { found.click(); return true; }
    return false;
  });

  if (!menuItem) {
    // Try DevExpress API directly
    const opened = await page.evaluate(() => {
      const candidates = Object.entries(window)
        .filter(([, v]) => v && typeof v === 'object' && typeof v.ShowCustomizationDialog === 'function')
        .map(([, v]) => v);
      if (candidates.length > 0) {
        candidates[0].ShowCustomizationDialog();
        return true;
      }
      return false;
    });
    if (!opened) {
      log('colchooser', 'Could not open Column Chooser (no ShowCustomizationDialog or context menu item)');
      return false;
    }
  }

  await sleep(2000);
  return true;
}

async function getHiddenColumnsFromDialog(page) {
  return page.evaluate(() => {
    // Also enumerate ALL columns including hidden ones from the DevExpress grid API
    const grid = (() => {
      const candidates = Object.entries(window)
        .filter(([k, v]) => v && typeof v === 'object' && typeof v.GetColumnCount === 'function')
        .map(([, v]) => v);
      return candidates[0] || null;
    })();

    const allGridColumns = [];
    if (grid) {
      let i = 0;
      while (true) {
        try {
          const col = grid.GetColumn(i);
          if (!col) break;
          allGridColumns.push({
            index: i,
            fieldName: col.fieldName || '',
            caption: col.name || col.caption || col.headerCaption || '',
            visible: col.visible !== false,
            visibleIndex: col.visibleIndex,
          });
          i++;
        } catch { break; }
      }
    }

    const hiddenCols = allGridColumns.filter(c => !c.visible || c.visibleIndex < 0);

    // The Column Chooser dialog
    const dialogs = Array.from(document.querySelectorAll('[id*="Customiz"],[id*="_CC"],[class*="Customiz"]'));
    if (dialogs.length === 0) return { found: false, hiddenFromApi: hiddenCols, columns: [] };

    const dialog = dialogs[0];
    const html = dialog.outerHTML.substring(0, 5000);

    return {
      found: true,
      dialogId: dialog.id || dialog.className,
      hiddenFromApi: hiddenCols,
      dialogHtmlPreview: html,
    };
  });
}

async function closeCustomizationDialog(page) {
  await page.evaluate(() => {
    // Try close button
    const btns = Array.from(document.querySelectorAll('button, [class*="close"], [class*="Close"]'));
    const closeBtn = btns.find(b => /close|chiudi|ok|✓/i.test(b.textContent || b.title || ''));
    if (closeBtn) closeBtn.click();
  });
  await sleep(500);
}

// ─── Main diagnostic per pagina ───────────────────────────────────────────────
async function diagnosePage(page, name, config) {
  log(name, `Navigating to ${config.url}`);
  await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitIdle(page, 20000).catch(() => log(name, 'waitIdle timeout, continuing'));

  // Step 1: visible columns
  const visibleCols = await getVisibleColumns(page);
  const visibleFieldNames = visibleCols.map(c => c.fieldName).filter(Boolean);
  log(name, `Visible columns: ${visibleFieldNames.length}`, visibleFieldNames);

  // Step 2: gap analysis
  const missing = config.fields.filter(f => !visibleFieldNames.includes(f));
  const extra = visibleFieldNames.filter(f => !config.fields.includes(f));
  log(name, `Missing (needed but not visible): ${missing.length}`, missing);
  if (extra.length > 0) log(name, `Extra (visible but not needed): ${extra.length}`, extra);

  // Step 3: Column Chooser DOM capture
  const opened = await openCustomizationDialog(page);
  if (opened) {
    await sleep(1500);
    const chooserInfo = await getHiddenColumnsFromDialog(page);
    if (chooserInfo.found) {
      log(name, 'Column Chooser dialog found', {
        dialogId: chooserInfo.dialogId,
        itemCount: chooserInfo.itemCount,
        sampleItems: chooserInfo.sampleItems,
      });
      log(name, 'Column Chooser HTML preview:\n' + chooserInfo.dialogHtmlPreview);
    } else {
      log(name, 'Column Chooser dialog NOT found in DOM after open attempt');
    }
    await closeCustomizationDialog(page);
  }

  return {
    page: name,
    visibleCount: visibleFieldNames.length,
    requiredCount: config.fields.length,
    missingFields: missing,
    ok: missing.length === 0,
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(40000);

  try {
    await login(page);
    await waitIdle(page, 20000).catch(() => {});

    const results = [];
    for (const [name, config] of Object.entries(REQUIRED_COLUMNS)) {
      try {
        const result = await diagnosePage(page, name, config);
        results.push(result);
      } catch (err) {
        log(name, `ERROR: ${err.message}`);
        results.push({ page: name, error: err.message });
      }
    }

    console.log('\n\n═══════════════════════════════════════');
    console.log('RIEPILOGO DIAGNOSTICA COLONNE ERP');
    console.log('═══════════════════════════════════════');
    for (const r of results) {
      if (r.error) {
        console.log(`❌ ${r.page}: ERROR — ${r.error}`);
        continue;
      }
      const status = r.ok ? '✅' : '❌';
      console.log(`${status} ${r.page}: ${r.visibleCount}/${r.requiredCount} colonne visibili`);
      if (!r.ok) {
        console.log(`   MANCANTI: ${r.missingFields.join(', ')}`);
      }
    }
    console.log('═══════════════════════════════════════\n');

  } finally {
    console.log('Diagnostica completata. Chiudi il browser manualmente.');
    // Non chiudiamo il browser automaticamente per permettere ispezione manuale
    // await browser.close();
  }
})();

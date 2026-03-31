/**
 * Diagnostico: scopre i selettori XAF per i campi header di un ordine
 * nella SALESTABLE_DetailViewAgent.
 *
 * Flusso: login → ListView → filtro Tutti → cerca ordine → click View/Modifica → scan DOM
 *
 * Uso: node archibald-web-app/backend/scripts/diag-order-header-fields.mjs ORDER_ID
 * Esempio: node archibald-web-app/backend/scripts/diag-order-header-fields.mjs 51980
 * Oppure:  node archibald-web-app/backend/scripts/diag-order-header-fields.mjs any
 *          (usa la prima riga disponibile nella ListView)
 */

import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const ORDER_ID = process.argv[2] ?? '';

const log = (tag, msg) => console.log(`[${new Date().toISOString().slice(11, 23)}][${tag}] ${msg}`);

const PROD_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security',
  '--ignore-certificate-errors', '--disable-dev-shm-usage', '--disable-gpu',
];

const TARGET_FIELDS = [
  'SALESID', 'PURCHORDERFORMNUM', 'CUSTOMERREF', 'DELIVERYDATE',
  'DELIVERYNAME', 'DLVADDRESS', 'SALESSTATUS', 'DOCUMENTSTATUS', 'TRANSFERSTATUS',
];

async function waitNoLoading(page, timeout = 10_000) {
  await page.waitForFunction(
    () => {
      const panels = Array.from(document.querySelectorAll('[id*="LPV"],.dxlp,[id*="Loading"]'));
      return !panels.some((el) => {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
      });
    },
    { timeout, polling: 200 },
  ).catch(() => {});
}

async function main() {
  if (!ORDER_ID) {
    log('ERR', 'Uso: node diag-order-header-fields.mjs ORDER_ID');
    process.exit(1);
  }

  const normalizedId = ORDER_ID.replace(/\./g, '');
  const scanFirstAvailable = (ORDER_ID === 'any' || ORDER_ID === '');
  log('INIT', `Scansione DetailView ordine ${ORDER_ID === '' ? 'PRIMO DISPONIBILE' : ORDER_ID} (normalizzato: ${normalizedId})`);

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 100,
    args: PROD_ARGS,
    ignoreHTTPSErrors: true,
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8' });

  // ── LOGIN ──
  log('AUTH', 'Login...');
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('input[type="text"]', { timeout: 10_000 });
  await page.evaluate((user, pass) => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.name?.includes('UserName')) || document.querySelector('input[type="text"]');
    const pw = document.querySelector('input[type="password"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const set = (el, val) => {
      el.focus(); el.click();
      if (setter) setter.call(el, val); else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set(u, user); set(pw, pass);
    const btn = Array.from(document.querySelectorAll('button,a')).find(b => {
      const t = (b.textContent || '').toLowerCase().replace(/\s+/g, '');
      return t.includes('accedi') || (!b.id?.includes('logo') && (b.id?.includes('login') || b.id?.includes('logon')));
    });
    btn?.click();
  }, USERNAME, PASSWORD);
  await page.waitForFunction(() => !window.location.href.includes('Login.aspx'), { timeout: 30_000 });
  await new Promise(r => setTimeout(r, 2000));
  log('AUTH', `Login OK → ${page.url()}`);

  // ── STEP 1: Naviga alla ListView ordini ──
  const ordersUrl = `${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`;
  log('NAV', 'Navigazione ListView ordini...');
  await page.goto(ordersUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('span,button,a')).some(
      (el) => { const t = el.textContent?.trim().toLowerCase() ?? ''; return t === 'nuovo' || t === 'new'; },
    ),
    { timeout: 15_000 },
  );
  await new Promise(r => setTimeout(r, 500));
  log('NAV', 'ListView caricata');

  // ── STEP 2: Imposta filtro "Tutti gli ordini" via DevExpress API ──
  log('FILTER', 'Imposto filtro Tutti gli ordini...');
  const filterResult = await page.evaluate(() => {
    const ALL_ORDERS_VALUE = 'xaf_xaf_a0ListViewSalesTableOrdersAll';
    const EXACT = 'input[name="Vertical$mainMenu$Menu$ITCNT8$xaf_a1$Cb"]';
    const BROAD = 'input[name*="mainMenu"][name*="Cb"]';
    const input = document.querySelector(EXACT) || document.querySelector(BROAD);

    // Prova via DevExpress SetValue API
    for (const key of Object.keys(window)) {
      if (key.includes('mainMenu') && key.includes('Cb') && !key.endsWith('_B-1')) {
        const ctrl = window[key];
        if (ctrl && typeof ctrl.SetValue === 'function' && typeof ctrl.GetValue === 'function') {
          const val = ctrl.GetValue() ?? '';
          if (val.includes('ListViewSalesTable') || val.includes('Orders')) {
            ctrl.SetValue(ALL_ORDERS_VALUE);
            return { method: 'dx-api', comboId: key, prevVal: val };
          }
        }
      }
    }
    return { method: 'not-found', inputName: input?.name };
  });
  log('FILTER', `Filtro: ${JSON.stringify(filterResult)}`);
  await new Promise(r => setTimeout(r, 2000));
  await waitNoLoading(page, 10_000);

  // ── STEP 3: Cerca l'ordine (o usa il primo disponibile) ──
  if (scanFirstAvailable) {
    log('SEARCH', 'Modalità: usa prima riga disponibile (nessun ordine specificato)');
  } else {
    log('SEARCH', `Cerco ordine ${normalizedId}...`);

    // Scopri il selettore search corretto
    const searchInfo = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('input[id*="SearchAC"], input[id*="search"]'));
      return candidates.map(el => ({ id: el.id, name: el.name, visible: el.offsetParent !== null }));
    });
    log('SEARCH', `Search inputs trovati: ${JSON.stringify(searchInfo)}`);

    const searchSelector = '#Vertical_SearchAC_Menu_ITCNT0_xaf_a0_Ed_I';
    let searchHandle = await page.waitForSelector(searchSelector, { timeout: 5_000, visible: true }).catch(() => null);

    if (!searchHandle) {
      log('WARN', 'Search input non trovato con selettore esatto, provo alternativo');
      searchHandle = await page.$('input[id*="SearchAC"][id*="_I"]');
      if (!searchHandle) {
        searchHandle = await page.$('input[id*="SearchAC"]');
      }
      if (!searchHandle) {
        log('ERR', 'Nessun campo di ricerca trovato nella ListView');
        await browser.close();
        process.exit(1);
      }
    }

    const rowCountBefore = await page.evaluate(() => document.querySelectorAll('tr[class*="dxgvDataRow"]').length);
    log('SEARCH', `Righe prima della ricerca: ${rowCountBefore}`);
    await searchHandle.click({ clickCount: 3 });
    await searchHandle.type(normalizedId);
    await page.keyboard.press('Enter');

    await page.waitForFunction(
      (prevCount) => {
        const loadingPanels = Array.from(document.querySelectorAll('[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]'));
        const hasLoading = loadingPanels.some((el) => {
          const s = window.getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
        });
        if (hasLoading) return false;
        const currentCount = document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
        const hasEmpty = document.querySelector('tr[class*="dxgvEmptyData"]') !== null;
        return currentCount !== prevCount || hasEmpty || currentCount <= 5;
      },
      { timeout: 15_000, polling: 200 },
      rowCountBefore,
    ).catch(() => log('WARN', 'Search wait timed out'));
    await new Promise(r => setTimeout(r, 300));

    const rowCount = await page.evaluate(() => document.querySelectorAll('tr[class*="dxgvDataRow"]').length);
    log('SEARCH', `Righe trovate: ${rowCount}`);
    if (rowCount === 0) {
      log('WARN', `Ordine ${ORDER_ID} non trovato. Procedo con la prima riga disponibile...`);
    }
  }

  // Verifica che ci siano righe disponibili
  const availableRows = await page.evaluate(() => document.querySelectorAll('tr[class*="dxgvDataRow"]').length);
  log('SEARCH', `Righe disponibili: ${availableRows}`);
  if (availableRows === 0) {
    log('ERR', 'Nessuna riga disponibile nella ListView');
    await browser.close();
    process.exit(1);
  }

  // Dump ID della prima riga per sapere quale ordine stiamo aprendo
  const firstRowId = await page.evaluate(() => {
    const firstRow = document.querySelector('tr[class*="dxgvDataRow"]');
    if (!firstRow) return null;
    const cells = Array.from(firstRow.querySelectorAll('td'));
    return cells.map(td => td.textContent?.trim().slice(0, 30)).filter(Boolean);
  });
  log('SEARCH', `Prima riga: ${JSON.stringify(firstRowId)}`);

  // ── STEP 4: Apri la DetailView (click View o Modifica) ──
  log('OPEN', 'Apro DetailView ordine...');

  // Prova prima con View (binocolo), poi con Modifica (matita)
  const openClicked = await page.evaluate(() => {
    const firstRow = document.querySelector('tr[class*="dxgvDataRow"]');
    if (!firstRow) return { clicked: false, reason: 'no row' };

    // Prova data-args="View"
    const viewLink = firstRow.querySelector('a[data-args*="View"]');
    if (viewLink) { viewLink.click(); return { clicked: true, via: 'data-args-View' }; }

    // Prova data-args="Edit" (apre in mode View ugualmente per la lettura)
    const editLink = firstRow.querySelector('a[data-args*="Edit"]');
    if (editLink) { editLink.click(); return { clicked: true, via: 'data-args-Edit' }; }

    // Prova img con alt/title contenente "View" o "Visualizza"
    for (const img of firstRow.querySelectorAll('img')) {
      const t = (img.title || img.alt || '').toLowerCase();
      if (t.includes('view') || t.includes('visualiz') || t.includes('modif')) {
        img.click(); return { clicked: true, via: `img-${img.title || img.alt}` };
      }
    }

    // Fallback: primo link nella riga
    const firstLink = firstRow.querySelector('a');
    if (firstLink) { firstLink.click(); return { clicked: true, via: 'first-link' }; }

    return { clicked: false, reason: 'no link found' };
  });
  log('OPEN', `Click: ${JSON.stringify(openClicked)}`);

  if (!openClicked.clicked) {
    log('ERR', 'Impossibile aprire la DetailView');
    await browser.close();
    process.exit(1);
  }

  // Aspetta navigazione alla DetailView
  await page.waitForFunction(
    () => window.location.href.includes('SALESTABLE_DetailViewAgent'),
    { timeout: 15_000 },
  ).catch(() => log('WARN', 'Navigazione DetailView timeout — procedo comunque'));
  await new Promise(r => setTimeout(r, 1000));
  await waitNoLoading(page, 15_000);
  await new Promise(r => setTimeout(r, 2000));

  const currentUrl = page.url();
  const pageTitle = await page.title();
  log('DOM', `URL effettivo: ${currentUrl}`);
  log('DOM', `Titolo pagina: ${pageTitle}`);

  const debugInfo = await page.evaluate(() => {
    const allEls = document.querySelectorAll('*');
    const inputs = document.querySelectorAll('input, textarea, select');
    const divs = document.querySelectorAll('div[id]');
    const sample = Array.from(divs).slice(0, 10).map(el => el.id);
    return { total: allEls.length, inputs: inputs.length, namedDivs: divs.length, sampleIds: sample };
  });
  log('DOM', `Elementi totali: ${debugInfo.total}, input: ${debugInfo.inputs}, divs con id: ${debugInfo.namedDivs}`);
  log('DOM', `Campione id: ${debugInfo.sampleIds.join(', ')}`);

  // ── STEP 5: Scansione campi target ──
  log('SCAN', `--- Ricerca di ${TARGET_FIELDS.length} campi ---`);
  const results = await page.evaluate((fields) => {
    return fields.map((field) => {
      const all = Array.from(document.querySelectorAll(`[id*="${field}"]`));
      return {
        field,
        count: all.length,
        elements: all.slice(0, 5).map((el) => ({
          id: el.id,
          tag: el.tagName,
          text: (el.textContent || '').trim().slice(0, 100),
          isVisible: el.getBoundingClientRect().width > 0,
        })),
      };
    });
  }, TARGET_FIELDS);

  for (const r of results) {
    if (r.count === 0) {
      log('MISS', `${r.field}: NON TROVATO`);
    } else {
      log('FOUND', `${r.field}: ${r.count} elemento/i`);
      for (const el of r.elements) {
        log('  ', `id="${el.id}" tag=${el.tag} visibile=${el.isVisible} text="${el.text}"`);
      }
    }
  }

  // ── STEP 6: Dump completo di tutti gli id xaf_dvi ──
  const xafIds = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[id*="xaf_dvi"]'))
      .map((el) => ({ id: el.id, text: (el.textContent || '').trim().slice(0, 60) }));
  });

  log('XAF', `--- Tutti gli elementi xaf_dvi (${xafIds.length}) ---`);
  for (const x of xafIds) {
    log('  ', `id="${x.id}" text="${x.text}"`);
  }

  await browser.close();
  log('DONE', 'Scansione completata. Usa gli id trovati per implementare readOrderHeader.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

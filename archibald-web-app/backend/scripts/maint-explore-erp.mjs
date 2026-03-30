/**
 * ERP Setup - Script di Esplorazione
 *
 * Per ogni pagina ERP, documenta TUTTO:
 *   1. Pulsanti toolbar (trova il pulsante "Ripristina visualizzazione")
 *   2. Combo filtro permanente + opzioni
 *   3. Controllo paginazione (pager)
 *   4. Context menu dal tasto destro sull'header
 *   5. Dialog "Show Customization Dialog" → tab "Column Chooser"
 *      → elenco colonne con stato occhio (aperto/chiuso)
 *
 * Produce: ./erp-explore-report/<page>.json + screenshot ad ogni step
 *
 * Usage:
 *   node archibald-web-app/backend/scripts/maint-explore-erp.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASSWORD = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const REPORT_DIR = './erp-explore-report';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const PAGES = [
  { name: 'orders',    url: `${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/` },
  { name: 'ddt',       url: `${ARCHIBALD_URL}/CUSTPACKINGSLIPJOUR_ListView/` },
  { name: 'prices',    url: `${ARCHIBALD_URL}/PRICEDISCTABLE_ListView/` },
  { name: 'customers', url: `${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/` },
  { name: 'invoices',  url: `${ARCHIBALD_URL}/CUSTINVOICEJOUR_ListView/` },
  { name: 'products',  url: `${ARCHIBALD_URL}/INVENTTABLE_ListView/` },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(section, msg) {
  const time = new Date().toISOString().substring(11, 23);
  console.log(`[${time}][${section}] ${msg}`);
}

function ensureDirs() {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
}

async function shot(page, name) {
  const file = path.join(REPORT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  log('📷', `→ ${file}`);
  return file;
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
    const btn = byText || byId;
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!clicked) throw new Error('Submit button not found');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  log('login', '✅ OK');
}

// ─── Step 1: Dump toolbar ─────────────────────────────────────────────────────
async function dumpToolbar(page) {
  return page.evaluate(() => {
    // Cerca tutti i bottoni/link nel toolbar XAF (area in alto)
    const selectors = [
      'a[href]', 'button', 'input[type=button]', 'input[type=submit]',
      '[class*="ActionContainer"] a', '[class*="ActionContainer"] span',
      '[class*="toolbar"] a', '[class*="toolbar"] button',
      '[class*="Bar"] a', '[class*="Bar"] button',
      '[id*="Action"] a', '[id*="Reset"] a', '[id*="reset"] a',
    ];

    const seen = new Set();
    const results = [];

    for (const sel of selectors) {
      const els = Array.from(document.querySelectorAll(sel));
      for (const el of els) {
        const key = el.id || el.href || el.title || el.textContent?.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);

        const rect = el.getBoundingClientRect();
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 100);
        const title = el.title || el.getAttribute('data-original-title') || '';
        const imgSrc = el.querySelector('img')?.src || '';
        const imgAlt = el.querySelector('img')?.alt || '';

        // Filtra elementi invisibili o fuori schermo
        if (rect.width === 0 && rect.height === 0) continue;
        if (rect.top < 0 || rect.top > 900) continue;

        results.push({
          tag: el.tagName,
          id: el.id || null,
          cls: el.className?.substring(0, 80) || null,
          text: text || null,
          title: title || null,
          href: el.href?.substring(0, 120) || null,
          imgAlt: imgAlt || null,
          imgSrc: imgSrc?.substring(0, 80) || null,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        });
      }
    }

    // Ordina per Y poi X (ordine visivo)
    results.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    return results;
  });
}

// ─── Step 1b: Trova e clicca il pulsante di reset ─────────────────────────────
async function findAndClickResetButton(page) {
  // Cerca il pulsante "Ripristina / Formatta / Reset" nella toolbar
  const result = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('a, button, [class*="ActionContainer"] *'));

    // Parole chiave che identificano il pulsante reset visualizzazione
    const keywords = [
      'ripristina', 'reset', 'formatta', 'impostazioni',
      'predefinit', 'default', 'restore', 'layout'
    ];

    const matches = allEls.filter(el => {
      const text = (el.textContent || '').toLowerCase();
      const title = (el.title || el.getAttribute('title') || '').toLowerCase();
      const alt = (el.querySelector?.('img')?.alt || '').toLowerCase();
      const combined = text + ' ' + title + ' ' + alt;
      return keywords.some(kw => combined.includes(kw));
    });

    const visible = matches.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

    return visible.map(el => ({
      tag: el.tagName,
      id: el.id || null,
      cls: el.className?.substring(0, 80) || null,
      text: (el.textContent || '').trim().substring(0, 100),
      title: el.title || null,
      href: el.href?.substring(0, 100) || null,
      imgAlt: el.querySelector?.('img')?.alt || null,
      rect: (() => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      })(),
    }));
  });

  log('reset', `Candidati pulsante reset: ${result.length}`);
  result.forEach((r, i) => log('reset', `  [${i}] <${r.tag}> id="${r.id}" cls="${r.cls?.substring(0, 40)}" text="${r.text?.substring(0, 60)}" title="${r.title}"`));

  return result;
}

// ─── Step 2: Dump combo filtro ────────────────────────────────────────────────
async function dumpFilterCombos(page) {
  return page.evaluate(() => {
    // Combo/select/dropdown che sembrano filtri di lista
    const combos = [];

    // DevExpress ASPxComboBox
    const dxCombos = Array.from(document.querySelectorAll('[id*="Combo"], [id*="combo"], [id*="Filter"], [id*="filter"], select, [class*="Combo"], [class*="dxeListBox"]'));

    for (const el of dxCombos) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) continue;

      // Cerca le opzioni
      let options = [];
      if (el.tagName === 'SELECT') {
        options = Array.from(el.options).map(o => ({ value: o.value, text: o.text }));
      } else {
        // DevExpress: cerca input nascosto con il valore
        const input = el.querySelector?.('input[type="hidden"]') || el.querySelector?.('input');
        const hiddenVal = input?.value || null;
        const visibleText = el.querySelector?.('[class*="B0"], [class*="button"], span:not([class*="arrow"])')?.textContent?.trim() || el.textContent?.trim().substring(0, 60);

        options = [{ value: hiddenVal, text: visibleText }];
      }

      combos.push({
        id: el.id || null,
        cls: el.className?.substring(0, 80) || null,
        tag: el.tagName,
        currentValue: el.value || null,
        options,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      });
    }

    return combos;
  });
}

// ─── Step 3: Dump pager (page size) ──────────────────────────────────────────
async function dumpPager(page) {
  return page.evaluate(() => {
    // Cerca il pager DevExpress in fondo alla griglia
    const pagerEls = Array.from(document.querySelectorAll(
      '[class*="Pager"], [class*="pager"], [id*="Pager"], [id*="pager"], ' +
      '[class*="pgr"], [id*="pgr"], [class*="DXPagerRow"]'
    ));

    return pagerEls.map(el => ({
      id: el.id || null,
      cls: el.className?.substring(0, 80) || null,
      text: el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 200),
      htmlPreview: el.outerHTML?.substring(0, 1000),
    }));
  });
}

// ─── Step 4: Colonne visibili dalla DevExpress API ────────────────────────────
async function dumpVisibleColumns(page) {
  return page.evaluate(() => {
    const candidates = Object.entries(window)
      .filter(([, v]) => v && typeof v === 'object' && typeof v.GetColumnCount === 'function')
      .map(([k, v]) => ({ key: k, grid: v }));

    if (candidates.length === 0) return { grids: [], columns: [] };

    const results = [];
    for (const { key, grid } of candidates) {
      const count = grid.GetColumnCount?.() ?? 0;
      const cols = [];
      for (let i = 0; i < count; i++) {
        const col = grid.GetColumn(i);
        if (!col) continue;
        cols.push({
          index: i,
          fieldName: col.fieldName || '',
          name: col.name || '',
          caption: col.caption || col.headerCaption || '',
          visible: col.visible !== false,
          visibleIndex: col.visibleIndex ?? null,
        });
      }
      results.push({ key, columnCount: count, columns: cols });
    }
    return results;
  });
}

// ─── Step 5: Right-click → dump context menu ─────────────────────────────────
async function rightClickHeaderDumpMenu(page, pageName) {
  const headerCell = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td, table[id*="DXHeadersRow"] td');
  if (!headerCell) {
    log('menu', '❌ Nessuna cella header trovata');
    return null;
  }

  // Intercetta il context menu
  await headerCell.click({ button: 'right' });
  await sleep(1200);
  await shot(page, `${pageName}-context-menu`);

  const menuItems = await page.evaluate(() => {
    const selectors = [
      '.dxm-item', '[class*="ContextMenu"] td', '.dx-menu-item',
      '[id*="DXPEForm"] td', '[class*="dxm"] td', '[role="menuitem"]',
      '[class*="menu"] li', '[class*="menu"] a',
    ];
    const seen = new Set();
    const results = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const text = el.textContent?.trim().replace(/\s+/g, ' ') || '';
        if (!text || seen.has(text)) continue;
        seen.add(text);
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) continue;
        results.push({
          sel,
          id: el.id || null,
          cls: el.className?.substring(0, 60) || null,
          text: text.substring(0, 100),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width) },
        });
      }
    }
    return results;
  });

  log('menu', `Voci context menu (${menuItems.length}):`);
  menuItems.forEach(m => log('menu', `  - "${m.text}" [id=${m.id}] [${m.cls?.substring(0, 40)}]`));

  return menuItems;
}

// ─── Step 6: Click "Show Customization Dialog" → vai alla tab Column Chooser ──
async function openCustomizationDialogAndClickTab(page, pageName) {
  // Clicca la voce "Show Customization Dialog" / "Personalizza" nel context menu
  const clicked = await page.evaluate(() => {
    const selectors = [
      '.dxm-item', '[class*="ContextMenu"] td', '.dx-menu-item',
      '[id*="DXPEForm"] td', '[class*="dxm"] td', '[role="menuitem"]',
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const text = el.textContent?.trim() || '';
        if (/customiz|personaliz/i.test(text)) {
          el.click();
          return { ok: true, text };
        }
      }
    }
    return { ok: false };
  });

  if (!clicked.ok) {
    log('dialog', '❌ "Show Customization Dialog" non trovato nel menu');
    return null;
  }

  log('dialog', `✅ Cliccato: "${clicked.text}"`);
  await sleep(2000);
  await shot(page, `${pageName}-custdialog-opened`);

  // Dump dialog structure
  const dialogDump = await page.evaluate(() => {
    // Cerca il dialog/modal aperto
    const dialogSelectors = [
      '[class*="Customiz"]', '[id*="Customiz"]',
      '[role="dialog"]', '[class*="popup"]', '[class*="Popup"]',
      '[class*="modal"]', '[class*="Modal"]',
      '.dxpnlCT', '[class*="dxpc"]',
    ];

    const dialogs = [];
    for (const sel of dialogSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || !el.offsetParent) continue;
        dialogs.push({
          sel,
          id: el.id || null,
          cls: el.className?.substring(0, 80) || null,
          visible: true,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          htmlPreview: el.outerHTML?.substring(0, 3000),
        });
      }
    }
    return dialogs;
  });

  log('dialog', `Dialog trovati: ${dialogDump.length}`);
  dialogDump.forEach((d, i) => {
    log('dialog', `  [${i}] sel="${d.sel}" id="${d.id}" cls="${d.cls?.substring(0, 50)}" ${d.rect.w}×${d.rect.h}`);
  });

  return dialogDump;
}

// ─── Step 7: Dump tab nel dialog e click Column Chooser ──────────────────────
async function dumpAndClickColumnChooserTab(page, pageName) {
  // Prima: cerca tutti i tab nel dialog tramite il pattern ID DevExpress
  // Pattern: [id*="DXCDWindow_DXCDPageControl_T"] oppure [id*="DXCDWindow_DXCDPageControl_AT"]
  const tabResult = await page.evaluate(() => {
    // Approccio 1: ID pattern DevExpress (più affidabile)
    const dxTabs = Array.from(document.querySelectorAll(
      '[id*="DXCDPageControl_T"], [id*="DXCDPageControl_AT"]'
    )).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 5 && r.height < 60;
    });

    const dxTabInfo = dxTabs.map(el => ({
      id: el.id,
      cls: el.className?.substring(0, 60) || null,
      text: el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 80) || '',
      rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
    }));

    // Cerca "Column Chooser" tra i tab DX — match ESATTO (esclude il container _TC)
    const colChooserDx = dxTabInfo.find(t => /^column.?chooser$/i.test(t.text.trim()));

    // Approccio 2: fallback su qualunque elemento con testo esatto "Column Chooser"
    let colChooserFallback = null;
    if (!colChooserDx) {
      const allEls = Array.from(document.querySelectorAll('*'));
      const exact = allEls.find(el => {
        const own = (el.childNodes[0]?.nodeValue || el.textContent || '').trim();
        const r = el.getBoundingClientRect();
        return /^column.?chooser$/i.test(own) && r.width > 0 && r.height < 60;
      });
      if (exact) {
        colChooserFallback = {
          id: exact.id, cls: exact.className?.substring(0, 60),
          text: exact.textContent?.trim() || '',
        };
      }
    }

    return { dxTabInfo, colChooserDx, colChooserFallback };
  });

  log('tabs', `Tab DevExpress trovati (${tabResult.dxTabInfo.length}):`);
  tabResult.dxTabInfo.forEach(t => log('tabs', `  - id="${t.id}" text="${t.text}" [${t.rect.x},${t.rect.y}]`));

  const target = tabResult.colChooserDx || tabResult.colChooserFallback;

  if (!target) {
    log('tabs', '❌ Tab "Column Chooser" non trovata');
    await shot(page, `${pageName}-tabs-notfound`);
    return tabResult;
  }

  log('tabs', `✅ Clickerò tab: id="${target.id}" text="${target.text}"`);

  // Click diretto per ID (non per testo - evita il problema del container parent)
  const clickResult = await page.evaluate((tabId) => {
    const el = document.getElementById(tabId);
    if (!el) return { ok: false, error: 'id-not-found' };
    el.scrollIntoView({ block: 'nearest' });
    el.click();
    return { ok: true };
  }, target.id);

  log('tabs', `Click result: ok=${clickResult.ok} ${clickResult.error || ''}`);

  await sleep(1500);
  await shot(page, `${pageName}-colchooser-tab`);

  return tabResult;
}

// ─── Step 8: Dump colonne nel Column Chooser (con stato occhio) ───────────────
async function dumpColumnChooserColumns(page) {
  return page.evaluate(() => {
    // La tab Column Chooser mostra righe con: handle | nome colonna | icona occhio
    // Cerca tutti gli elementi occhio/visibilità
    const rows = [];

    // Strategia 1: cerca per struttura riga
    const rowSelectors = [
      'tr', 'li', '[class*="row"]', '[class*="item"]',
      '[class*="Column"]', '[class*="column"]',
    ];

    // Prima, cerca il contenitore del Column Chooser
    const containers = Array.from(document.querySelectorAll(
      '[class*="Customiz"], [id*="Customiz"], [class*="ColChooser"], [id*="ColChooser"], ' +
      '[class*="columnChooser"], [role="dialog"] [class*="content"], [class*="popup"] [class*="content"]'
    )).filter(el => el.getBoundingClientRect().width > 0 && el.offsetParent);

    const container = containers[0] || document.body;

    // Cerca icone occhio nel container
    const eyeSelectors = [
      '[class*="eye"]', '[class*="Eye"]',
      '[class*="visib"]', '[class*="Visib"]',
      'img[src*="eye"]', 'img[src*="visib"]',
      'svg', 'i[class*="fa"]',
      '[class*="icon"]', '[class*="Icon"]',
    ];

    // Approccio: trova tutti gli elementi che hanno un testo colonna + un'icona vicino
    // Guarda le righe della lista
    const listItems = Array.from(container.querySelectorAll('tr, li, [class*="item"], [class*="row"]'))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 100 && r.height > 10 && r.height < 80;
      });

    for (const item of listItems) {
      const text = item.textContent?.trim().replace(/\s+/g, ' ') || '';
      if (!text || text.length > 200) continue;

      // Cerca icona occhio in questa riga
      const eyeEl = item.querySelector(eyeSelectors.join(', '));
      const eyeInfo = eyeEl ? {
        tag: eyeEl.tagName,
        id: eyeEl.id || null,
        cls: eyeEl.className?.substring(0, 60) || null,
        src: eyeEl.src?.substring(0, 80) || null,
        style: eyeEl.getAttribute('style')?.substring(0, 100) || null,
        outerHtml: eyeEl.outerHTML?.substring(0, 200) || null,
      } : null;

      rows.push({
        text: text.substring(0, 100),
        eyeEl: eyeInfo,
        rowId: item.id || null,
        rowCls: item.className?.substring(0, 60) || null,
        rowHtml: item.outerHTML?.substring(0, 500),
      });
    }

    // Se non abbiamo trovato righe, dumpa il container HTML
    if (rows.length === 0) {
      return {
        found: false,
        containerHtml: container.outerHTML?.substring(0, 5000),
        bodyHtml: document.body.innerHTML?.substring(0, 3000),
      };
    }

    return { found: true, rows };
  });
}

// ─── Esplorazione completa di una pagina ──────────────────────────────────────
async function explorePage(page, config) {
  const { name, url } = config;
  const report = { name, url, steps: {} };

  log(name, `\n${'═'.repeat(60)}`);
  log(name, `Navigazione a ${url}`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitIdle(page, 20000).catch(() => log(name, 'waitIdle timeout'));
  await shot(page, `${name}-00-initial`);

  // STEP A: Dump toolbar
  log(name, '--- STEP A: Dump toolbar ---');
  report.steps.toolbar = await dumpToolbar(page);
  log(name, `Toolbar: ${report.steps.toolbar.length} elementi`);
  report.steps.toolbar.slice(0, 30).forEach(b =>
    log(name, `  [${b.rect.x},${b.rect.y}] <${b.tag}> id="${b.id}" text="${b.text?.substring(0, 60)}" title="${b.title?.substring(0, 60)}"`)
  );

  // STEP B: Trova pulsante reset
  log(name, '--- STEP B: Cerca pulsante reset ---');
  report.steps.resetCandidates = await findAndClickResetButton(page);

  // STEP C: Dump filter combos
  log(name, '--- STEP C: Dump combo filtro ---');
  report.steps.filterCombos = await dumpFilterCombos(page);
  log(name, `Filter combos: ${report.steps.filterCombos.length}`);
  report.steps.filterCombos.forEach(c =>
    log(name, `  id="${c.id}" text="${c.options?.[0]?.text?.substring(0, 60)}"`)
  );

  // STEP D: Dump pager
  log(name, '--- STEP D: Dump pager ---');
  report.steps.pager = await dumpPager(page);
  report.steps.pager.forEach(p =>
    log(name, `  id="${p.id}" text="${p.text?.substring(0, 80)}"`)
  );

  // STEP E: Colonne visibili via DevExpress API
  log(name, '--- STEP E: Colonne visibili (DevExpress API) ---');
  report.steps.visibleColumns = await dumpVisibleColumns(page);
  if (Array.isArray(report.steps.visibleColumns)) {
    report.steps.visibleColumns.forEach(g => {
      log(name, `  Grid "${g.key}": ${g.columnCount} colonne`);
      g.columns.filter(c => c.visible).forEach(c =>
        log(name, `    [${c.index}] ${c.fieldName} (visible=${c.visible})`)
      );
    });
  }

  // STEP F: Right-click header → context menu
  log(name, '--- STEP F: Right-click header → context menu ---');
  report.steps.contextMenu = await rightClickHeaderDumpMenu(page, name);

  if (report.steps.contextMenu && report.steps.contextMenu.length > 0) {
    // STEP G: Apri Show Customization Dialog
    log(name, '--- STEP G: Apri Show Customization Dialog ---');
    report.steps.customizationDialog = await openCustomizationDialogAndClickTab(page, name);

    await sleep(1000);

    // STEP H: Dump tab e click Column Chooser
    log(name, '--- STEP H: Dump tab → click Column Chooser ---');
    report.steps.tabs = await dumpAndClickColumnChooserTab(page, name);

    await sleep(1500);

    // STEP I: Dump colonne nel Column Chooser
    log(name, '--- STEP I: Dump colonne Column Chooser (con stato occhio) ---');
    report.steps.columnChooserRows = await dumpColumnChooserColumns(page);

    if (report.steps.columnChooserRows?.found) {
      log(name, `Righe nel Column Chooser: ${report.steps.columnChooserRows.rows?.length}`);
      report.steps.columnChooserRows.rows?.forEach(r =>
        log(name, `  row="${r.text?.substring(0, 60)}" eye=${r.eyeEl ? JSON.stringify({ cls: r.eyeEl.cls?.substring(0, 30), tag: r.eyeEl.tag }) : 'non trovato'}`)
      );
    } else {
      log(name, '⚠️  Column Chooser rows non trovate');
      if (report.steps.columnChooserRows?.containerHtml) {
        log(name, `Container HTML preview:\n${report.steps.columnChooserRows.containerHtml?.substring(0, 1000)}`);
      }
    }

    await shot(page, `${name}-09-colchooser-final`);

    // Chiudi il dialog (premi Escape o trova il pulsante ✓)
    await page.keyboard.press('Escape');
    await sleep(800);
  } else {
    log(name, '⚠️  Context menu vuoto, skip dialog exploration');
  }

  // Salva report JSON
  const reportFile = path.join(REPORT_DIR, `${name}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  log(name, `📄 Report salvato: ${reportFile}`);

  return report;
}

// ─── Entry point ─────────────────────────────────────────────────────────────
(async () => {
  ensureDirs();

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(40000);

  // Accetta dialog del browser (confirm/alert)
  page.on('dialog', async (dialog) => {
    log('🔔', `Dialog [${dialog.type()}]: "${dialog.message()}" → ACCEPT`);
    await dialog.accept();
  });

  // Log errori JS del browser
  page.on('pageerror', err => log('❌ JS', err.message?.substring(0, 100)));

  try {
    await login(page);
    await waitIdle(page, 20000).catch(() => {});

    const summary = {};

    for (const pageConfig of PAGES) {
      try {
        const report = await explorePage(page, pageConfig);
        summary[pageConfig.name] = {
          toolbarButtons: report.steps.toolbar?.length ?? 0,
          filterCombos: report.steps.filterCombos?.length ?? 0,
          visibleColumnCount: report.steps.visibleColumns?.[0]?.columns?.filter(c => c.visible)?.length ?? 0,
          contextMenuItems: report.steps.contextMenu?.length ?? 0,
          columnChooserFound: report.steps.columnChooserRows?.found ?? false,
          columnChooserRows: report.steps.columnChooserRows?.rows?.length ?? 0,
        };
      } catch (err) {
        log(pageConfig.name, `❌ ERRORE: ${err.message}`);
        console.error(err.stack);
        summary[pageConfig.name] = { error: err.message };
      }

      // Pausa tra pagine
      await sleep(1000);
    }

    console.log('\n\n' + '═'.repeat(60));
    console.log('RIEPILOGO ESPLORAZIONE ERP');
    console.log('═'.repeat(60));
    for (const [name, info] of Object.entries(summary)) {
      if (info.error) {
        console.log(`❌ ${name}: ERROR — ${info.error}`);
      } else {
        console.log(`✅ ${name}:`);
        console.log(`   toolbar=${info.toolbarButtons} filtri=${info.filterCombos} colVisibili=${info.visibleColumnCount}`);
        console.log(`   contextMenu=${info.contextMenuItems} colChooser=${info.columnChooserFound ? '✅' : '❌'} righeCC=${info.columnChooserRows}`);
      }
    }
    console.log('═'.repeat(60));
    console.log(`\nReport JSON + screenshot in: ${path.resolve(REPORT_DIR)}`);
    console.log('Chiudi il browser manualmente per ispezionare lo stato finale.');

  } catch (err) {
    console.error('FATAL:', err.message);
    console.error(err.stack);
  }
})();

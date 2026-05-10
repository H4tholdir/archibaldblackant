/**
 * ERP Autopsy — 2026-05-10
 *
 * Visita tutte le pagine ERP Archibald e produce uno snapshot strutturato JSON.
 *
 * Pagine ListView:
 *   - CUSTTABLE_ListView_Agent
 *   - SALESTABLE_ListView_Agent
 *   - CUSTPACKINGSLIPJOUR_ListView (DDT)
 *   - CUSTINVOICEJOUR_ListView (Fatture)
 *   - INVENTTABLE_ListView (Prodotti)
 *   - PRICEDISCTABLE_ListView (Prezzi)
 *
 * Pagine DetailView:
 *   - CUSTTABLE_DetailView/55258 (cliente campione)
 *
 * Output: docs/diagnostics/erp-full-autopsy-2026-05-10.json
 *
 * Usage:
 *   node scripts/erp-autopsy-2026-05-10.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Config ───────────────────────────────────────────────────────────────────
const ERP_BASE = 'https://formicanera.com/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';

// Output path: scripts/ → backend/ → archibald-web-app/ → root/ → docs/diagnostics/
const OUTPUT_PATH = path.resolve(__dirname, '../../../docs/diagnostics/erp-full-autopsy-2026-05-10.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function log(section, msg) {
  const time = new Date().toISOString().substring(11, 23);
  console.log(`[${time}][${section}] ${msg}`);
}

// ─── DevExpress Idle Wait ─────────────────────────────────────────────────────
async function waitIdle(page, timeout = 20000) {
  try {
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
  } catch {
    // timeout acceptable — grid may already be idle
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function login(page) {
  log('login', `Navigating to ${ERP_BASE}/Default.aspx`);
  await page.goto(`${ERP_BASE}/Default.aspx`, { waitUntil: 'networkidle2', timeout: 40000 });

  // Find username/password fields
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
      .find(i => i.id?.includes('UserName') || i.name?.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u && p) ? { userId: u.id, passId: p.id } : null;
  });

  if (!fields) throw new Error('Login fields not found on page');

  // Fill with native setter to bypass DevExpress React-like binding
  const fillField = async (id, val) => {
    await page.evaluate((fieldId, value) => {
      const el = document.getElementById(fieldId);
      if (!el) throw new Error(`Field not found: ${fieldId}`);
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, id, val);
    await page.keyboard.press('Tab');
  };

  await fillField(fields.userId, USERNAME);
  await fillField(fields.passId, PASSWORD);

  // Click submit
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a, div[role='button']"));
    const byText = buttons.find(btn => {
      const text = (btn.textContent || '').toLowerCase().replace(/\s+/g, '');
      return text.includes('accedi') || text === 'login' || text.includes('signin');
    });
    const byId = !byText && buttons.find(btn => {
      const id = (btn.id || '').toLowerCase();
      if (id.includes('logo')) return false;
      return id.includes('login') || id.includes('logon') || id.includes('submit');
    });
    const btn = byText || byId;
    if (btn) { btn.click(); return btn.id || btn.textContent?.trim(); }
    return null;
  });

  if (!clicked) throw new Error('Login submit button not found');
  log('login', `Clicked: ${clicked}`);
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 40000 });
  await waitIdle(page, 15000);
  log('login', 'Login OK');
}

// ─── Grid Extraction ──────────────────────────────────────────────────────────

async function extractGridInfo(page) {
  return page.evaluate(() => {
    // Find grid
    const candidates = Object.entries(window)
      .filter(([, v]) => {
        try { return v && typeof v === 'object' && typeof v.GetColumnCount === 'function'; }
        catch { return false; }
      });
    if (candidates.length === 0) return { found: false, error: 'No grid object found' };

    const [gridKey, grid] = candidates.find(([, v]) => typeof v.GetPageCount === 'function') || candidates[0];

    // Columns
    const colCount = grid.GetColumnCount?.() ?? 0;
    const allColumns = [];
    for (let i = 0; i < colCount; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        allColumns.push({
          index: i,
          fieldName: col.fieldName || '',
          caption: col.headerCaption || col.caption || col.name || '',
          visible: col.visible !== false,
          visibleIndex: typeof col.visibleIndex === 'number' ? col.visibleIndex : -1,
        });
      } catch { break; }
    }

    const visibleColumns = allColumns.filter(c => c.visible && c.visibleIndex >= 0)
      .sort((a, b) => a.visibleIndex - b.visibleIndex);
    const hiddenColumns = allColumns.filter(c => !c.visible || c.visibleIndex < 0);

    // Pagination
    let pageCount = null;
    let pageIndex = null;
    let pageSize = null;
    try { pageCount = grid.GetPageCount?.() ?? null; } catch {}
    try { pageIndex = grid.GetPageIndex?.() ?? null; } catch {}

    // Row count from page size input
    const pagerInput = document.querySelector('input[id*="PSI"]');
    if (pagerInput) pageSize = parseInt(pagerInput.value, 10) || null;

    // Visible rows in DOM
    const domRows = document.querySelectorAll('tr[id*="DXDataRow"]');

    return {
      found: true,
      gridKey,
      gridSuffix: gridKey.replace(/^[^_]*/, ''),
      pageIndex,
      pageCount,
      pageSize,
      domRowCount: domRows.length,
      estimatedTotal: (pageCount && pageSize) ? pageCount * pageSize : null,
      visibleColumns: visibleColumns.map(c => ({
        fieldName: c.fieldName,
        caption: c.caption,
        visibleIndex: c.visibleIndex,
      })),
      hiddenColumnsCount: hiddenColumns.length,
      hiddenColumns: hiddenColumns.map(c => ({ fieldName: c.fieldName, caption: c.caption })),
      systemCellOffset: 2, // standard XAF offset: edit + checkbox columns before data
    };
  });
}

/**
 * Set page size to 200 and call GotoPage(0).
 * Waits for idle after each operation.
 */
async function setupGridPagination(page) {
  // Set page size to 200 via blur trick (PerformCallback does NOT work)
  await page.evaluate(() => {
    const pagerInput = document.querySelector('input[id*="PSI"]');
    if (!pagerInput) return;
    const pagerId = pagerInput.id.replace('_PSI', '');
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(pagerInput, '200'); else pagerInput.value = '200';
    pagerInput.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof ASPx !== 'undefined' && typeof ASPx.POnPageSizeBlur === 'function') {
      ASPx.POnPageSizeBlur(pagerId, new Event('blur'));
    } else {
      pagerInput.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  });
  await waitIdle(page, 15000);

  // GotoPage(0) — ALWAYS before reading data (page index persists across navigations)
  await page.evaluate(() => {
    const grid = (() => {
      const candidates = Object.entries(window)
        .filter(([, v]) => { try { return v && typeof v === 'object' && typeof v.GotoPage === 'function'; } catch { return false; } });
      return candidates[0]?.[1] ?? null;
    })();
    if (grid) grid.GotoPage(0);
  });
  await waitIdle(page, 15000);
}

// ─── ListView Snapshot ────────────────────────────────────────────────────────
async function snapshotListView(page, config) {
  log(config.name, `Navigating to ${config.url}`);
  await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 40000 });
  await waitIdle(page, 20000);

  // DDT/Invoices first-load workaround: a brief delay forces the async grid to settle
  // before we set page size. Without it, the first load may return zero rows.
  if (config.toggleFilter) {
    log(config.name, 'Waiting extra 2s for DDT/Invoices async grid settlement');
    await sleep(2000);
  }

  await setupGridPagination(page);

  const gridInfo = await extractGridInfo(page);

  // Capture first-row sample values for validation
  const firstRowSample = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr[id*="DXDataRow"]');
    if (rows.length === 0) return null;
    const cells = Array.from(rows[0].querySelectorAll('td'));
    return cells.slice(2, 8).map(td => td.textContent?.trim()?.substring(0, 60) || '');
  });

  return {
    name: config.name,
    url: config.url,
    timestamp: new Date().toISOString(),
    grid: gridInfo,
    first_row_sample: firstRowSample,
    notes: config.notes || null,
  };
}

// ─── DetailView Snapshot ──────────────────────────────────────────────────────
async function snapshotDetailView(page, config) {
  log(config.name, `Navigating to ${config.url}`);
  await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 40000 });
  await waitIdle(page, 20000);

  const result = await page.evaluate(() => {
    // Extract available tabs
    const tabSelectors = [
      '.dxtce_XafTheme[id*="Tab"]',
      '[id*="tabStrip"] td',
      '[class*="TabControl"] td[role="tab"]',
      '[id*="TabControl"] td',
    ];
    let tabs = [];
    for (const sel of tabSelectors) {
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length > 0) {
        tabs = els.map(el => ({
          id: el.id || '',
          text: el.textContent?.trim()?.replace(/\s+/g, ' ') || '',
        })).filter(t => t.text);
        break;
      }
    }

    // Extract fields via xaf_dvi pattern
    const dviFields = Array.from(document.querySelectorAll('[id*="xaf_dvi"][id*="_View"]'))
      .filter(el => {
        // Only include visible elements
        const rect = el.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0 || el.offsetParent !== null;
      })
      .map(el => {
        const match = el.id.match(/xaf_dvi(\w+)_View/);
        const field = match?.[1];
        if (!field) return null;
        // Clean text: remove HTML comments
        const rawText = el.textContent || '';
        const cleaned = rawText.trim().replace(/<!--[\s\S]*?-->/g, '').trim();
        return {
          field,
          selector: `[id*="xaf_dvi${field}_View"]`,
          tag: el.tagName,
          value: cleaned.substring(0, 120),
        };
      })
      .filter(Boolean);

    // Also capture label-value pairs from form layout
    const formItems = Array.from(document.querySelectorAll('[class*="dxfl_FormLayout"] tr, .dx-fieldset-field'))
      .map(row => {
        const labelEl = row.querySelector('[class*="Label"], [class*="label"], th');
        const valueEl = row.querySelector('[class*="Editor"], [class*="View"], td:last-child');
        if (!labelEl || !valueEl) return null;
        return {
          label: labelEl.textContent?.trim() || '',
          value: valueEl.textContent?.trim()?.substring(0, 120) || '',
        };
      })
      .filter(Boolean);

    return { tabs, dviFields, formItems };
  });

  // Try to access second tab (Altre informazioni) if tabs exist
  let tab2Fields = [];
  if (result.tabs.length > 1) {
    log(config.name, `Found ${result.tabs.length} tabs: ${result.tabs.map(t => t.text).join(', ')}`);
    // Click second tab
    const tab2Clicked = await page.evaluate(() => {
      const tabSelectors = [
        '.dxtce_XafTheme[id*="Tab"]',
        '[id*="tabStrip"] td',
        '[class*="TabControl"] td[role="tab"]',
        '[id*="TabControl"] td',
      ];
      for (const sel of tabSelectors) {
        const els = Array.from(document.querySelectorAll(sel));
        if (els.length > 1) {
          els[1].click();
          return true;
        }
      }
      return false;
    });

    if (tab2Clicked) {
      await waitIdle(page, 10000);
      tab2Fields = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[id*="xaf_dvi"][id*="_View"]'))
          .filter(el => el.offsetParent !== null)
          .map(el => {
            const match = el.id.match(/xaf_dvi(\w+)_View/);
            const field = match?.[1];
            if (!field) return null;
            const cleaned = (el.textContent || '').trim().replace(/<!--[\s\S]*?-->/g, '').trim();
            return { field, selector: `[id*="xaf_dvi${field}_View"]`, tag: el.tagName, value: cleaned.substring(0, 120) };
          })
          .filter(Boolean);
      });
    }
  }

  return {
    name: config.name,
    url: config.url,
    timestamp: new Date().toISOString(),
    tabs: result.tabs,
    tab_main_fields: result.dviFields,
    tab2_fields: tab2Fields,
    form_items_sample: result.formItems.slice(0, 30),
    notes: config.notes || null,
  };
}

// ─── Pages Config ─────────────────────────────────────────────────────────────
const LIST_VIEWS = [
  {
    name: 'CUSTTABLE_ListView',
    url: `${ERP_BASE}/CUSTTABLE_ListView_Agent/`,
    notes: 'Agent view. Colonne fantasma +2 (edit+checkbox). ID con comma = thousands IT.',
  },
  {
    name: 'SALESTABLE_ListView',
    url: `${ERP_BASE}/SALESTABLE_ListView_Agent/`,
    notes: 'Ordini agente. ID con comma per numeri grandi (es. 51,847 = 51847).',
  },
  {
    name: 'CUSTPACKINGSLIPJOUR_ListView',
    url: `${ERP_BASE}/CUSTPACKINGSLIPJOUR_ListView/`,
    toggleFilter: true,
    notes: 'DDT. Primo load può essere vuoto → toggle filter workaround.',
  },
  {
    name: 'CUSTINVOICEJOUR_ListView',
    url: `${ERP_BASE}/CUSTINVOICEJOUR_ListView/`,
    toggleFilter: true,
    notes: 'Fatture. Primo load può essere vuoto. parseNumber con separatore migliaia IT.',
  },
  {
    name: 'INVENTTABLE_ListView',
    url: `${ERP_BASE}/INVENTTABLE_ListView/`,
    notes: 'Prodotti. Column Chooser per-sessione: fixProductsColumnChooser() obbligatorio.',
  },
  {
    name: 'PRICEDISCTABLE_ListView',
    url: `${ERP_BASE}/PRICEDISCTABLE_ListView/`,
    notes: 'Prezzi/Listini. DATAAREAID colonna aggiunta manualmente.',
  },
];

const DETAIL_VIEWS = [
  {
    name: 'CUSTTABLE_DetailView_55258',
    url: `${ERP_BASE}/CUSTTABLE_DetailView/55258/?mode=View`,
    notes: 'Cliente campione: FRESIS (account 55258). Verifica tab Principale + Altre informazioni.',
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  log('main', 'Starting ERP Autopsy 2026-05-10');
  log('main', `Output: ${OUTPUT_PATH}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--disable-web-security',
    ],
    defaultViewport: { width: 1600, height: 900 },
  });

  const output = {
    snapshot_date: '2026-05-10',
    erp_version_note: 'post-update-germany-2026-05-10',
    erp_base_url: ERP_BASE,
    generated_at: new Date().toISOString(),
    pages: {},
    errors: [],
  };

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(45000);

  // Suppress certificate errors in navigation
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8' });

  try {
    // ── Login ──
    await login(page);

    // ── ListView snapshots ──
    for (const config of LIST_VIEWS) {
      log('main', `---- ListView: ${config.name} ----`);
      try {
        const snapshot = await snapshotListView(page, config);
        output.pages[config.name] = snapshot;
        log(config.name, `OK — visible cols: ${snapshot.grid?.visibleColumns?.length ?? '?'}, hidden: ${snapshot.grid?.hiddenColumnsCount ?? '?'}, estimated rows: ${snapshot.grid?.estimatedTotal ?? '?'}`);
      } catch (err) {
        log(config.name, `ERROR: ${err.message}`);
        output.pages[config.name] = { name: config.name, error: err.message, url: config.url };
        output.errors.push({ page: config.name, error: err.message });
      }
      await sleep(1500);
    }

    // ── DetailView snapshots ──
    for (const config of DETAIL_VIEWS) {
      log('main', `---- DetailView: ${config.name} ----`);
      try {
        const snapshot = await snapshotDetailView(page, config);
        output.pages[config.name] = snapshot;
        log(config.name, `OK — tabs: ${snapshot.tabs.length}, dvi fields: ${snapshot.tab_main_fields.length}`);
      } catch (err) {
        log(config.name, `ERROR: ${err.message}`);
        output.pages[config.name] = { name: config.name, error: err.message, url: config.url };
        output.errors.push({ page: config.name, error: err.message });
      }
      await sleep(1500);
    }

  } catch (err) {
    log('FATAL', err.message);
    output.errors.push({ page: 'global', error: err.message, stack: err.stack });
  } finally {
    await browser.close();
    log('main', 'Browser closed');
  }

  // ── Write output ──
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  log('main', `Written: ${OUTPUT_PATH}`);

  const pageCount = Object.keys(output.pages).length;
  const errCount = output.errors.length;
  log('main', `Done. Pages: ${pageCount}, Errors: ${errCount}`);
  if (errCount > 0) {
    log('main', `Errors: ${output.errors.map(e => `${e.page}: ${e.error}`).join('; ')}`);
  }
})();

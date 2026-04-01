/**
 * Diagnostico batch delete con FLOW IDENTICO al bot di produzione.
 * Ordine target: 51980
 *
 * Include: ensureFilterSetToAll, clearSearchBox, GotoPage(0),
 *          UnselectAll + SelectRowOnPage, dialog handler prima del click,
 *          verifica griglia post-delete.
 *
 * node archibald-web-app/backend/scripts/diag-batch-51980.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const TARGET_IDS = ['51980']; // stesso formato del bot
const SHOT_DIR = '/Users/hatholdir/Downloads/Archibald/docs/diagnostics';

const log = (tag, msg) => console.log(`[${new Date().toISOString().slice(11, 23)}][${tag}] ${msg}`);
const shot = async (page, name) => {
  const p = path.join(SHOT_DIR, `batch51980-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  log('SHOT', p);
};

const PROD_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security',
  '--ignore-certificate-errors', '--disable-dev-shm-usage', '--disable-gpu',
  '--disable-extensions', '--no-zygote', '--disable-accelerated-2d-canvas',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--memory-pressure-off',
  '--js-flags=--max-old-space-size=512',
];

async function waitNoLoading(page, timeout = 10000) {
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
  const report = {};
  const normalizedTargets = TARGET_IDS.map(id => id.replace(/\./g, ''));

  log('INIT', `=== BATCH DELETE FLOW — ordini: ${TARGET_IDS.join(', ')} ===`);
  log('INIT', 'headless: true (identico produzione)');

  const browser = await puppeteer.launch({
    headless: true,
    slowMo: 50,
    ignoreHTTPSErrors: true,
    args: PROD_ARGS,
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9' });

  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[DIAG]')) log('BROWSER', t);
  });

  try {
    // ── LOGIN ──
    log('LOGIN', 'Avvio...');
    await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });
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
    await page.waitForFunction(() => !window.location.href.includes('Login.aspx'), { timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    log('LOGIN', `OK → ${page.url()}`);

    // ── STEP 1: Naviga alla ListView ordini (come batchDelete) ──
    const ordersUrl = `${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`;
    log('NAV', 'Navigazione SALESTABLE_ListView_Agent...');
    await page.goto(ordersUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('span,button,a')).some(
        (el) => { const t = el.textContent?.trim().toLowerCase() ?? ''; return t === 'nuovo' || t === 'new'; },
      ),
      { timeout: 15000 },
    );
    await new Promise(r => setTimeout(r, 500));
    await shot(page, '01-loaded');

    // ── STEP 2: ensureOrdersFilterSetToAll (versione semplificata) ──
    log('FILTER', 'Imposto filtro Tutti gli ordini...');
    const filterResult = await page.evaluate(() => {
      const EXACT = 'input[name="Vertical$mainMenu$Menu$ITCNT8$xaf_a1$Cb"]';
      const BROAD = 'input[name*="mainMenu"][name*="Cb"]';
      const input = document.querySelector(EXACT) || document.querySelector(BROAD);
      if (!input) return { found: false, value: null };
      return { found: true, value: input.value, visible: input.offsetParent !== null };
    });
    log('FILTER', `Filter input: ${JSON.stringify(filterResult)}`);
    report.filterResult = filterResult;

    if (filterResult.found && filterResult.value !== 'Tutti gli ordini') {
      log('FILTER', `Valore corrente: "${filterResult.value}" — cambio a "Tutti gli ordini"...`);
      // Click sul dropdown filter
      await page.evaluate(() => {
        const EXACT = 'input[name="Vertical$mainMenu$Menu$ITCNT8$xaf_a1$Cb"]';
        const BROAD = 'input[name*="mainMenu"][name*="Cb"]';
        const input = document.querySelector(EXACT) || document.querySelector(BROAD);
        if (input) input.click();
      });
      await new Promise(r => setTimeout(r, 500));
      // Seleziona "Tutti gli ordini" nel listbox
      await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[class*="dxeListBoxItem"]'));
        const all = items.find(el => (el.textContent || '').toLowerCase().includes('tutti'));
        if (all) all.click();
      });
      await new Promise(r => setTimeout(r, 300));
      await page.keyboard.press('Enter');
      await waitNoLoading(page, 8000);
      await new Promise(r => setTimeout(r, 500));
    } else {
      log('FILTER', 'Filtro già corretto o non trovato — skip');
    }

    // ── STEP 3: Pulisci search box (come batchDelete) ──
    log('SCAN', 'Pulizia search box...');
    const searchHandle = await page.$('input[id*="SearchAC"][id*="Ed_I"]').catch(() => null);
    if (searchHandle) {
      await page.evaluate((input) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, '');
        else input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, searchHandle);
      await page.keyboard.press('Enter');
      await waitNoLoading(page, 10000);
      await new Promise(r => setTimeout(r, 500));
    }

    // ── STEP 4: GotoPage(0) ──
    log('GRID', 'GotoPage(0)...');
    await page.evaluate(() => {
      const collection = window.ASPxClientControl?.GetControlCollection?.();
      collection?.ForEachControl?.((c) => { if (typeof c.GotoPage === 'function') c.GotoPage(0); });
    });
    await new Promise(r => setTimeout(r, 300));

    // ── STEP 5: Scansiona griglia (esattamente come il bot) ──
    log('SCAN', `Ricerca ordini: ${normalizedTargets.join(', ')}`);
    const rowIndices = await page.evaluate((targets) => {
      const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
      const found = [];
      rows.forEach((row, rowIndex) => {
        const cells = row.querySelectorAll('td');
        // cells[0]=edit ghost, cells[1]=checkbox ghost, cells[2]=order ID
        const cellText = cells[2]?.textContent?.trim().replace(/\./g, '') ?? '';
        if (targets.includes(cellText)) {
          found.push({ rowIndex, normalizedId: cellText });
        }
      });
      return found;
    }, normalizedTargets);

    log('SCAN', `Trovati: ${JSON.stringify(rowIndices)}`);
    report.rowIndices = rowIndices;

    if (rowIndices.length === 0) {
      const totalRows = await page.evaluate(() => document.querySelectorAll('tr[class*="dxgvDataRow"]').length);
      const first3 = await page.evaluate(() =>
        [...document.querySelectorAll('tr[class*="dxgvDataRow"]')].slice(0, 3).map(r =>
          r.querySelectorAll('td')[2]?.textContent?.trim()
        )
      );
      log('ERROR', `Nessun ordine trovato. Total rows: ${totalRows}. Prime 3: ${JSON.stringify(first3)}`);
      await shot(page, 'error-not-found');
      await browser.close();
      return;
    }

    // ── STEP 6: UnselectAll + SelectRowOnPage (esattamente come il bot) ──
    log('SEL', `Selezione righe: ${rowIndices.map(r => r.rowIndex).join(', ')}`);
    await page.evaluate((indices) => {
      const collection = window.ASPxClientControl?.GetControlCollection?.();
      if (!collection) { console.log('[DIAG] ERROR: ASPxClientControl collection null'); return; }
      // Unselect all
      collection.ForEachControl?.((c) => {
        if (typeof c.UnselectAllRowsOnPage === 'function') {
          console.log('[DIAG] UnselectAllRowsOnPage su: ' + (c.name || 'unknown'));
          c.UnselectAllRowsOnPage();
        }
      });
      // Select each
      collection.ForEachControl?.((c) => {
        if (typeof c.SelectRowOnPage === 'function') {
          for (const idx of indices) {
            console.log('[DIAG] SelectRowOnPage(' + idx + ') su: ' + (c.name || 'unknown'));
            c.SelectRowOnPage(idx);
          }
        }
      });
    }, rowIndices.map(r => r.rowIndex));
    await new Promise(r => setTimeout(r, 800));

    // Verifica selezione
    const selInfo = await page.evaluate(() => {
      const info = { count: 0, keys: [], gridName: null };
      window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.((c) => {
        if (typeof c.GetSelectedRowCount === 'function') {
          info.count = c.GetSelectedRowCount();
          info.keys = c.GetSelectedKeysOnPage?.() ?? [];
          info.gridName = c.name;
        }
      });
      // Verifica visiva: righe con checkbox selezionato
      const checkedRows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"] input[type="checkbox"]:checked'));
      info.visualCheckedCount = checkedRows.length;
      // Verifica classe: righe selezionate devono avere classe diversa
      const selectedRows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow_Selected"],tr[class*="dxgvFocusedRow"]'));
      info.cssSelectedCount = selectedRows.length;
      return info;
    });
    log('SEL', `Selezione: count=${selInfo.count} visualChecked=${selInfo.visualCheckedCount} cssSelected=${selInfo.cssSelectedCount} keys=${JSON.stringify(selInfo.keys)} grid=${selInfo.gridName}`);
    report.selInfo = selInfo;
    await shot(page, '02-selected');

    // ── STEP 7: Stato pulsante Cancellare + attendi abilitazione ──
    log('BTN', 'Stato pulsante Cancellare...');
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');
        return btn && !btn.classList.contains('dxm-disabled');
      },
      { timeout: 5000, polling: 100 },
    ).catch(() => log('BTN', 'TIMEOUT 5s: pulsante mai diventato enabled'));

    const btnState = await page.evaluate(() => {
      const btn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');
      if (!btn) return { found: false };
      const li = btn.closest('li');
      return {
        found: true,
        disabled: btn.classList.contains('dxm-disabled') || !!li?.classList.contains('dxm-disabled'),
        liClass: li?.className?.substring(0, 120),
      };
    });
    log('BTN', `Cancellare: ${JSON.stringify(btnState)}`);
    report.btnState = btnState;
    await shot(page, '03-before-click');

    // ── STEP 8: Registra dialog handler PRIMA del click ──
    let dialogHandled = false;
    let dialogAccepted = false;
    const dialogPromise = new Promise((resolve) => {
      let resolved = false;
      const handler = (dialog) => {
        if (resolved) return;
        resolved = true;
        dialogHandled = true;
        log('DIALOG', `Intercettato! type=${dialog.type()} msg="${dialog.message()}"`);
        dialog.accept();
        dialogAccepted = true;
        log('DIALOG', 'Accepted ✓');
        resolve(true);
      };
      page.once('dialog', handler);
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          page.off('dialog', handler);
          log('DIALOG', '*** TIMEOUT 10s — Puppeteer NON ha intercettato nessun dialog ***');
          resolve(false);
        }
      }, 10000);
    });

    // ── STEP 9: Click Cancellare (esattamente come il bot) ──
    log('CLICK', 'Clic su #Vertical_mainMenu_Menu_DXI1_T...');
    const clickResult = await page.evaluate(() => {
      const btn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');
      if (btn) {
        console.log('[DIAG] CLICK: btn trovato, disabled=' + btn.classList.contains('dxm-disabled'));
        btn.click();
        return { clicked: true, strategy: 'by-id', disabled: btn.classList.contains('dxm-disabled') };
      }
      for (const link of Array.from(document.querySelectorAll('a[id*="Vertical_mainMenu"],a[id*="mainMenu_Menu"]'))) {
        const text = link.textContent?.trim().toLowerCase();
        if (text === 'cancellare' || text === 'elimina' || text === 'delete') {
          console.log('[DIAG] CLICK: by-text id=' + link.id);
          link.click();
          return { clicked: true, strategy: 'by-text', id: link.id };
        }
      }
      return { clicked: false };
    });
    log('CLICK', `Risultato: ${JSON.stringify(clickResult)}`);
    report.clickResult = clickResult;
    await shot(page, '04-after-click');

    // ── STEP 10: Attendi dialog ──
    log('DIALOG', 'Attendo dialog (max 10s)...');
    const gotDialog = await dialogPromise;
    report.dialogHandled = dialogHandled;
    report.dialogAccepted = dialogAccepted;
    log('DIALOG', `gotDialog=${gotDialog} handled=${dialogHandled} accepted=${dialogAccepted}`);

    await new Promise(r => setTimeout(r, 500));
    await shot(page, '05-after-dialog');

    // ── STEP 11: Attendi reload griglia ──
    log('VERIFY', 'Attendo reload griglia...');
    await waitNoLoading(page, 10000);
    await new Promise(r => setTimeout(r, 1000));
    await shot(page, '06-after-reload');

    // ── STEP 12: Verifica griglia (esattamente come il bot ora) ──
    const stillInGrid = await page.evaluate((normalizedIds) => {
      const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
      return normalizedIds.filter((nid) =>
        rows.some((row) => {
          const cells = row.querySelectorAll('td');
          return (cells[2]?.textContent?.trim().replace(/\./g, '') ?? '') === nid;
        })
      );
    }, normalizedTargets);

    const deletedNormalized = normalizedTargets.filter(n => !stillInGrid.includes(n));
    log('VERIFY', `Still in grid: [${stillInGrid.join(', ')}]`);
    log('VERIFY', `Eliminati:     [${deletedNormalized.join(', ')}]`);
    report.stillInGrid = stillInGrid;
    report.deletedNormalized = deletedNormalized;
    await shot(page, '07-final');

  } catch (err) {
    log('ERROR', err.message + '\n' + err.stack?.slice(0, 600));
    report.error = err.message;
    await shot(page, 'error').catch(() => {});
  }

  const reportPath = path.join(SHOT_DIR, `batch51980-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  log('DONE', '=== RIEPILOGO FINALE ===');
  log('DONE', `rowIndices=${JSON.stringify(report.rowIndices)}`);
  log('DONE', `selCount=${report.selInfo?.count} visualChecked=${report.selInfo?.visualCheckedCount} cssSelected=${report.selInfo?.cssSelectedCount}`);
  log('DONE', `btnDisabled=${report.btnState?.disabled}`);
  log('DONE', `clickResult=${JSON.stringify(report.clickResult)}`);
  log('DONE', `dialogHandled=${report.dialogHandled} dialogAccepted=${report.dialogAccepted}`);
  log('DONE', `stillInGrid=[${(report.stillInGrid || []).join(', ')}]`);
  log('DONE', `deletedNormalized=[${(report.deletedNormalized || []).join(', ')}]`);
  log('DONE', `Report: ${reportPath}`);

  await browser.close();
}

main().catch(console.error);

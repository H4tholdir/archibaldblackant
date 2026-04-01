/**
 * Diagnostico mirato: batch delete ordine 51981.
 * Misura esattamente dove il delete si rompe, step per step.
 *
 * STESSA configurazione del bot di produzione:
 *   - headless: true (come prod, non false)
 *   - stessi args
 *   - stesso pattern dialog: registra handler PRIMA del click
 *
 * Uso:
 *   node archibald-web-app/backend/scripts/diag-delete-51981.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const TARGET_ID = '51981'; // ordine da cancellare
const SHOT_DIR = '/Users/hatholdir/Downloads/Archibald/docs/diagnostics';

const log = (tag, msg) => console.log(`[${new Date().toISOString().slice(11,23)}][${tag}] ${msg}`);
const shot = async (page, name) => {
  const p = path.join(SHOT_DIR, `del51981-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  log('SHOT', p);
};

// ── STESSI ARGS DEL BOT DI PRODUZIONE (src/config.ts) ──
const PROD_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security',
  '--ignore-certificate-errors', '--disable-dev-shm-usage', '--disable-gpu',
  '--disable-extensions', '--no-zygote', '--disable-accelerated-2d-canvas',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--memory-pressure-off',
  '--js-flags=--max-old-space-size=512',
];

async function waitIdle(page, timeout = 15000) {
  await page.waitForFunction(
    (n) => {
      const loading = document.querySelector('.dxgvLoadingPanel_XafTheme,.dxlp,[class*="LoadingPanel"]');
      if (loading?.offsetParent !== null) { window.__dxI = 0; return false; }
      let busy = false;
      window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.((c) => {
        if (typeof c.InCallback === 'function' && c.InCallback()) busy = true;
      });
      if (busy) { window.__dxI = 0; return false; }
      window.__dxI = (window.__dxI || 0) + 1;
      return window.__dxI >= n;
    },
    { timeout, polling: 150 }, 3,
  ).catch(() => {});
}

async function main() {
  const report = {};

  // ── FASE 0: headless TRUE come produzione ──
  log('INIT', '=== HEADLESS TRUE (come produzione) ===');
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

  // ── LISTENER GLOBALE dialog (non once) ──
  // Questo listener vive per tutta la sessione e ci dice se Puppeteer emette il dialog
  let globalDialogCount = 0;
  page.on('dialog', async (dialog) => {
    globalDialogCount++;
    log('DIALOG_GLOBAL', `#${globalDialogCount} type=${dialog.type()} msg="${dialog.message()}"`);
    report[`dialog_${globalDialogCount}`] = { type: dialog.type(), message: dialog.message() };
    // NON lo gestiamo qui — lasciamo che lo gestisca il handler specifico
  });

  // ── LISTENER console del browser ──
  page.on('console', (msg) => {
    if (msg.text().includes('DIAG')) log('BROWSER_CONSOLE', msg.text());
  });

  try {
    // ── STEP 1: Login ──
    log('LOGIN', 'Avvio login...');
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

    // ── STEP 2: Naviga alla ListView ordini ──
    log('NAV', 'Navigazione SALESTABLE_ListView_Agent...');
    await page.goto(`${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitIdle(page, 20000);
    await new Promise(r => setTimeout(r, 1500));
    await shot(page, '01-loaded');

    // ── STEP 3: GotoPage(0) ──
    log('GRID', 'GotoPage(0)...');
    await page.evaluate(() => {
      const collection = window.ASPxClientControl?.GetControlCollection?.();
      collection?.ForEachControl?.((c) => { if (typeof c.GotoPage === 'function') c.GotoPage(0); });
    });
    await new Promise(r => setTimeout(r, 500));

    // ── STEP 4: Cerca ordine 51981 nella griglia ──
    const rowIndex = await page.evaluate((targetId) => {
      const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
      for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        const cellText = cells[2]?.textContent?.trim().replace(/\./g, '') ?? '';
        if (cellText === targetId) return i;
      }
      return -1;
    }, TARGET_ID);

    log('FIND', `Ordine ${TARGET_ID} → row index ${rowIndex}`);
    report.rowIndex = rowIndex;

    if (rowIndex === -1) {
      const totalRows = await page.evaluate(() => document.querySelectorAll('tr[class*="dxgvDataRow"]').length);
      const first3 = await page.evaluate(() => {
        const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
        return [...rows].slice(0, 3).map((r) => r.querySelectorAll('td')[2]?.textContent?.trim());
      });
      log('FIND', `Non trovato. Tot righe visibili: ${totalRows}. Prime 3: ${JSON.stringify(first3)}`);
      report.notFound = { totalRows, first3 };
      await shot(page, 'error-not-found');
      await browser.close();
      return;
    }

    // ── STEP 5: SelectRowOnPage ──
    log('SEL', `SelectRowOnPage(${rowIndex})...`);
    await page.evaluate((idx) => {
      let called = false;
      window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.((c) => {
        if (!called && typeof c.SelectRowOnPage === 'function') {
          c.SelectRowOnPage(idx);
          called = true;
        }
      });
      return called;
    }, rowIndex);
    await new Promise(r => setTimeout(r, 800));

    // Verifica selezione
    const selCount = await page.evaluate(() => {
      let count = 0;
      window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.((c) => {
        if (typeof c.GetSelectedRowCount === 'function') count = c.GetSelectedRowCount();
      });
      return count;
    });
    log('SEL', `Righe selezionate: ${selCount}`);
    report.selCount = selCount;
    await shot(page, '02-selected');

    // ── STEP 6: Stato pulsante "Cancellare" ──
    const btnState = await page.evaluate(() => {
      const btn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');
      if (!btn) return { found: false };
      const li = btn.closest('li');
      return {
        found: true,
        id: btn.id,
        text: btn.textContent?.trim(),
        disabled: btn.classList.contains('dxm-disabled') || !!li?.classList.contains('dxm-disabled'),
        liClass: li?.className?.substring(0, 100),
      };
    });
    log('BTN', `Pulsante Cancellare: ${JSON.stringify(btnState)}`);
    report.btnState = btnState;

    if (btnState.disabled) {
      log('BTN', 'ATTENZIONE: pulsante disabilitato. Aspetto che si abiliti...');
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');
          return btn && !btn.classList.contains('dxm-disabled');
        },
        { timeout: 8000, polling: 100 },
      ).catch(() => log('BTN', 'TIMEOUT: pulsante mai abilitato dopo 8s'));
      const btnState2 = await page.evaluate(() => {
        const btn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');
        return { disabled: btn?.classList.contains('dxm-disabled'), liClass: btn?.closest('li')?.className?.substring(0, 100) };
      });
      log('BTN', `Stato dopo wait: ${JSON.stringify(btnState2)}`);
      report.btnStateAfterWait = btnState2;
    }

    await shot(page, '03-before-click');

    // ── STEP 7: Inietta override window.confirm PER LOGGARE se viene chiamato ──
    // IMPORTANTE: sovrascriviamo SOLO per logging, poi chiamiamo l'originale
    // Questo ci dice se window.confirm viene chiamato nel browser
    await page.evaluate(() => {
      const orig = window.confirm.bind(window);
      window.__diagConfirmCalled = false;
      window.__diagConfirmResult = null;
      window.confirm = function(msg) {
        console.log('[DIAG] window.confirm chiamato! msg=' + msg);
        window.__diagConfirmCalled = true;
        // NON chiamiamo orig: lasciamo che Puppeteer intercetti via CDP
        // Puppeteer intercetterà questo confirm e emetterà dialog event
        // Se Puppeteer NON intercetta, questa funzione NON ritornerà finché
        // non arriva Page.handleJavaScriptDialog dal CDP
        const result = orig(msg);
        console.log('[DIAG] window.confirm result=' + result);
        window.__diagConfirmResult = result;
        return result;
      };
    });
    log('DIAG', 'Override window.confirm iniettato per diagnostica');

    // ── STEP 8: Registra handler dialog PRIMA del click (come il bot di produzione) ──
    let dialogHandled = false;
    let dialogType = null;
    let dialogMessage = null;

    const dialogPromise = new Promise((resolve) => {
      let resolved = false;
      const handler = (dialog) => {
        if (resolved) return;
        resolved = true;
        dialogType = dialog.type();
        dialogMessage = dialog.message();
        log('DIALOG', `Dialog intercettato da Puppeteer! type=${dialogType} msg="${dialogMessage}"`);
        dialog.accept();
        dialogHandled = true;
        resolve(true);
      };
      page.once('dialog', handler);
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          page.off('dialog', handler);
          log('DIALOG', 'TIMEOUT: nessun dialog intercettato da Puppeteer in 10s');
          resolve(false);
        }
      }, 10000);
    });

    // ── STEP 9: Click "Cancellare" ──
    log('CLICK', 'Clic su Cancellare...');
    const clickResult = await page.evaluate(() => {
      const btn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');
      if (btn) {
        console.log('[DIAG] Clic su #Vertical_mainMenu_Menu_DXI1_T');
        btn.click();
        return { clicked: true, strategy: 'by-id', disabled: btn.classList.contains('dxm-disabled') };
      }
      // fallback text
      for (const link of Array.from(document.querySelectorAll('a[id*="Vertical_mainMenu"],a[id*="mainMenu_Menu"]'))) {
        const text = link.textContent?.trim().toLowerCase();
        if (text === 'cancellare' || text === 'elimina' || text === 'delete') {
          console.log('[DIAG] Clic via text: ' + link.id);
          link.click();
          return { clicked: true, strategy: 'by-text', id: link.id };
        }
      }
      return { clicked: false };
    });
    log('CLICK', `Risultato click: ${JSON.stringify(clickResult)}`);
    report.clickResult = clickResult;

    await shot(page, '04-after-click');

    // ── STEP 10: Aspetta il dialog ──
    log('DIALOG', 'Attendo dialog promise (max 10s)...');
    await dialogPromise;
    log('DIALOG', `dialogHandled=${dialogHandled} type=${dialogType} msg="${dialogMessage}"`);
    report.dialogHandled = dialogHandled;
    report.dialogType = dialogType;
    report.dialogMessage = dialogMessage;

    // Leggi stato window.confirm nel browser
    await new Promise(r => setTimeout(r, 500));
    const confirmState = await page.evaluate(() => ({
      called: window.__diagConfirmCalled,
      result: window.__diagConfirmResult,
    })).catch(() => ({ called: 'error', result: 'error' }));
    log('DIAG', `window.confirm nel browser: called=${confirmState.called} result=${confirmState.result}`);
    report.confirmState = confirmState;

    await shot(page, '05-after-dialog');

    // ── STEP 11: Attendi reload griglia ──
    log('VERIFY', 'Attesa reload griglia...');
    await page.waitForFunction(
      () => {
        const panels = Array.from(document.querySelectorAll('[id*="LPV"],.dxlp,[id*="Loading"]'));
        return !panels.some((el) => {
          const s = window.getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
        });
      },
      { timeout: 10000, polling: 300 },
    ).catch(() => log('VERIFY', 'Timeout attesa loading panel'));
    await new Promise(r => setTimeout(r, 1000));

    await shot(page, '06-after-reload');

    // ── STEP 12: Verifica se 51981 è ancora nella griglia ──
    const stillInGrid = await page.evaluate((id) => {
      const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]');
      return Array.from(rows).some((row) => {
        const cells = row.querySelectorAll('td');
        return (cells[2]?.textContent?.trim().replace(/\./g, '') ?? '') === id;
      });
    }, TARGET_ID);

    log('VERIFY', `Ordine ${TARGET_ID} ancora nella griglia: ${stillInGrid}`);
    report.stillInGrid = stillInGrid;
    report.deleteSucceeded = !stillInGrid;

    await shot(page, '07-final');

  } catch (err) {
    log('ERROR', err.message + '\n' + err.stack?.slice(0, 600));
    report.error = err.message;
    await shot(page, 'error').catch(() => {});
  }

  const reportPath = path.join(SHOT_DIR, `del51981-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log('DONE', `Report: ${reportPath}`);
  log('DONE', `=== RIEPILOGO ===`);
  log('DONE', `rowIndex=${report.rowIndex} selCount=${report.selCount}`);
  log('DONE', `btnDisabled=${report.btnState?.disabled}`);
  log('DONE', `dialogHandled=${report.dialogHandled}`);
  log('DONE', `confirmCalledInBrowser=${report.confirmState?.called} confirmResult=${report.confirmState?.result}`);
  log('DONE', `stillInGrid=${report.stillInGrid} → deleteSucceeded=${report.deleteSucceeded}`);

  await browser.close();
}

main().catch(console.error);

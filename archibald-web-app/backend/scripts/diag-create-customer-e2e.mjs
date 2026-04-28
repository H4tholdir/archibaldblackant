/**
 * diag-create-customer-e2e.mjs
 *
 * Script diagnostico E2E per la creazione cliente HSR SRL UNIPERSONALE.
 * Riproduce il flusso interattivo esatto del bot:
 *   1. Naviga al form nuovo cliente
 *   2. Valida la P.IVA
 *   3. Attende 5 secondi (simula l'utente che compila il form)
 *   4. Chiama completeCustomerCreation (simulato: dismissPopups + tab click + fields)
 *
 * Diagnostica:
 *   - URL della pagina prima e dopo ogni step
 *   - Stato dei popup DevExpress
 *   - Errori Puppeteer
 *   - Motivo esatto del crash
 *
 * Usage: node scripts/diag-create-customer-e2e.mjs
 */

import puppeteer from 'puppeteer';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const VAT_NUMBER = '05875570656'; // HSR SRL UNIPERSONALE

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg, data = '') {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${msg}`, data ? JSON.stringify(data) : '');
}

async function waitForDevExpressIdle(page, { timeout = 8000, label = 'idle' } = {}) {
  try {
    await page.waitForFunction(
      () => {
        const w = window;
        const col = w.ASPxClientControl?.GetControlCollection?.();
        if (!col || typeof col.ForEachControl !== 'function') return true;
        let busy = false;
        col.ForEachControl((c) => { try { if (c.InCallback?.()) busy = true; } catch {} });
        return !busy;
      },
      { timeout, polling: 100 }
    );
    log(`waitForDevExpressIdle OK (${label})`);
  } catch (e) {
    log(`waitForDevExpressIdle TIMEOUT/ERROR (${label})`, e.message);
  }
}

async function getPageState(page) {
  try {
    const url = page.url();
    const popupInfo = await page.evaluate(() => {
      const w = window;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      const popups = [];
      if (col) {
        col.ForEachControl((c) => {
          const name = c?.name || c?.GetName?.() || '';
          if (name.includes('PopupWindow') || name.includes('popupWindow') || name.includes('UPPopup')) {
            const visible = typeof c.IsVisible === 'function' ? c.IsVisible() : '?';
            popups.push({ name, visible });
          }
        });
      }
      // Check DXHFP buttons
      const dxhfpBtns = Array.from(document.querySelectorAll('[id*="DXHFP"]'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({ id: el.id, text: el.textContent?.trim() }));

      // Check tabs
      const tabs = Array.from(document.querySelectorAll('a.dxtc-link'))
        .map(el => ({ text: el.textContent?.trim(), visible: el.offsetParent !== null }));

      return { popups, dxhfpBtns, tabs };
    });
    return { url, ...popupInfo };
  } catch (e) {
    return { url: '(error reading URL)', error: e.message };
  }
}

async function dismissDevExpressPopups(page) {
  try {
    const result = await page.evaluate(() => {
      const w = window;
      const collection = w.ASPxClientControl?.GetControlCollection?.();
      const popups = [];

      if (collection) {
        collection.ForEachControl((c) => {
          const name = c?.name || c?.GetName?.() || '';
          if ((name.includes('PopupWindow') || name.includes('popupWindow') || name.includes('UPPopup')) &&
              typeof c.Hide === 'function') {
            try {
              const isVisible = typeof c.IsVisible === 'function' ? c.IsVisible() : true;
              if (isVisible) { c.Hide(); popups.push(name); }
            } catch { c.Hide(); popups.push(name); }
          }
        });
      }

      // DXHFP cancel buttons
      const cancelBtns = Array.from(document.querySelectorAll('[id*="DXHFP"][id$="_C"]'))
        .filter(el => el.offsetParent !== null);
      for (const btn of cancelBtns) {
        btn.click();
        popups.push(btn.id);
      }

      return { dismissed: popups.length > 0, popups };
    });
    if (result.dismissed) log('dismissDevExpressPopups: dismissed', result.popups);
    return result.dismissed;
  } catch (e) {
    log('dismissDevExpressPopups ERROR', e.message);
    throw e;
  }
}

async function openCustomerTab(page, tabText) {
  const candidates = tabText === 'Principale' ? ['Principale', 'Main'] : [tabText];

  for (const candidate of candidates) {
    const clicked = await page.evaluate((text) => {
      const links = Array.from(document.querySelectorAll('a.dxtc-link, span.dx-vam'));
      for (const el of links) {
        const elText = el.textContent?.trim() || '';
        if (elText.includes(text)) {
          const clickTarget = el.tagName === 'A' ? el : el.parentElement;
          if (clickTarget && clickTarget.offsetParent !== null) {
            clickTarget.click();
            return { clicked: true, tag: el.tagName, id: el.id, href: el.href || '(none)', text: elText };
          }
        }
      }
      return null;
    }, candidate);

    if (clicked) {
      log(`Tab "${candidate}" clicked`, clicked);
      try {
        await page.waitForFunction(
          () => {
            const col = window.ASPxClientControl?.GetControlCollection?.();
            if (!col) return true;
            let busy = false;
            col.ForEachControl((c) => { try { if (c.InCallback?.()) busy = true; } catch {} });
            return !busy;
          },
          { timeout: 5000, polling: 100 }
        );
        log('Tab switch: DevExpress idle');
      } catch (e) {
        log('Tab switch waitForFunction error (caught)', e.message);
      }
      return true;
    }
  }

  log(`Tab "${tabText}" NOT FOUND`);
  return false;
}

async function run() {
  log('Starting E2E diagnostic for customer creation');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
    slowMo: 25,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', async dialog => {
    log(`Dialog (${dialog.type()}): ${dialog.message()} → accepting`);
    await dialog.accept();
  });

  try {
    // ── Step 1: Login ───────────────────────────────────────────────────────
    log('Step 1: Logging in');
    const loginUrl = `${ERP_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
    await page.goto(loginUrl, { waitUntil: 'load', timeout: 60000 });
    log('Login page loaded. URL:', page.url());

    // Find fields via evaluate (same as real bot)
    const fields = await page.evaluate(() => {
      const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
      const userInput = textInputs.find(i =>
        i.id.includes('UserName') || i.name.includes('UserName') ||
        i.placeholder?.toLowerCase().includes('account') || i.placeholder?.toLowerCase().includes('username')
      ) || textInputs[0];
      const passInput = document.querySelector('input[type="password"]');
      if (!userInput || !passInput) return null;
      return { userFieldId: userInput.id, passFieldId: passInput.id };
    });
    if (!fields) throw new Error('Login fields not found');
    log('Login fields found', fields);

    // Fill username via native setter (same as real bot)
    await page.evaluate((fieldId, val) => {
      const input = document.getElementById(fieldId);
      if (!input) return;
      input.scrollIntoView({ block: 'center' });
      input.focus(); input.click();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, val); else input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, fields.userFieldId, USERNAME);
    await page.keyboard.press('Tab');
    await waitForDevExpressIdle(page, { label: 'login-user', timeout: 3000 });

    // Fill password via native setter
    await page.evaluate((fieldId, val) => {
      const input = document.getElementById(fieldId);
      if (!input) return;
      input.scrollIntoView({ block: 'center' });
      input.focus(); input.click();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, val); else input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, fields.passFieldId, PASSWORD);
    await page.keyboard.press('Tab');
    await waitForDevExpressIdle(page, { label: 'login-pass', timeout: 3000 });

    // Click login button via evaluate
    const loginResult = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a, div[role='button']"));
      const btn = buttons.find(b => {
        const text = (b.textContent || '').toLowerCase().replace(/\s+/g, '');
        return text.includes('accedi') || text === 'login';
      }) || buttons.find(b => {
        const id = (b.id || '').toLowerCase();
        return !id.includes('logo') && (id.includes('login') || id.includes('logon'));
      });
      if (btn) { btn.click(); return { ok: true, id: btn.id, text: btn.textContent?.trim() }; }
      return { ok: false };
    });
    if (!loginResult.ok) throw new Error('Login button not found');
    log('Login button clicked', loginResult);

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
    log('Logged in. URL:', page.url());

    // ── Step 2: Navigate to new customer form ──────────────────────────────
    log('Step 2: Navigating to new customer form');
    await page.goto(`${ERP_URL}/CUSTTABLE_ListView_Agent/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForDevExpressIdle(page, { label: 'after-listview', timeout: 10000 });

    // Click "Nuovo" / "New"
    const nuovoClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('a, span, button'));
      const btn = btns.find(el => ['Nuovo', 'New'].includes(el.textContent?.trim() || ''));
      if (btn) { btn.click(); return btn.textContent?.trim(); }
      return null;
    });
    if (!nuovoClicked) throw new Error("'Nuovo'/'New' button not found");
    log(`Clicked "${nuovoClicked}"`);

    await page.waitForFunction(
      () => !window.location.href.includes('ListView'),
      { timeout: 15000, polling: 200 }
    );
    await waitForDevExpressIdle(page, { label: 'new-form-ready', timeout: 10000 });
    log('New customer form ready. URL:', page.url());

    // ── Step 3: Enter VAT number ───────────────────────────────────────────
    log(`Step 3: Entering VAT number ${VAT_NUMBER}`);
    const vatField = await page.$('input[id*="VATNUM"][id$="_I"]');
    if (!vatField) throw new Error('VAT field not found');
    await vatField.click();
    await vatField.type(VAT_NUMBER, { delay: 50 });
    await page.keyboard.press('Tab');
    log('VAT entered, waiting for validation callback...');

    // Wait for VAT validation
    await page.waitForFunction(
      () => {
        const el = Array.from(document.querySelectorAll('input')).find(i => /VATLASTCHECK/i.test(i.id));
        return el && el.value !== '';
      },
      { timeout: 35000, polling: 500 }
    );
    log('VAT validated. Page state:', await getPageState(page));

    await waitForDevExpressIdle(page, { label: 'post-vat', timeout: 5000 });
    log('Post-VAT idle. Full state:', await getPageState(page));

    // ── Step 4: Simulate user wait (5 seconds) ─────────────────────────────
    log('Step 4: Waiting 5 seconds (simulating user filling form)...');
    await wait(5000);
    log('Pre-completeCustomerCreation. Page state:', await getPageState(page));

    // ── Step 5: completeCustomerCreation flow ──────────────────────────────
    log('Step 5: Starting completeCustomerCreation simulation');

    // 5a. First dismissDevExpressPopups
    log('5a. dismissDevExpressPopups (before tab click)');
    await dismissDevExpressPopups(page);
    log('After first dismiss. URL:', page.url());

    // 5b. openCustomerTab "Principale"
    log('5b. openCustomerTab("Principale")');
    await openCustomerTab(page, 'Principale');
    log('After tab click. URL:', page.url());

    // 5c. Second dismissDevExpressPopups (this is where it crashes in production)
    log('5c. dismissDevExpressPopups (AFTER tab click - this is the crash point in prod)');
    try {
      await dismissDevExpressPopups(page);
      log('SUCCESS: second dismissDevExpressPopups completed. URL:', page.url());
    } catch (e) {
      log('CRASH HERE: second dismissDevExpressPopups threw', e.message);
      log('Final URL:', page.url());
      throw e;
    }

    // 5d. waitForDevExpressIdle
    log('5d. waitForDevExpressIdle (tab-principale-interactive)');
    await waitForDevExpressIdle(page, { label: 'tab-principale-interactive', timeout: 5000 });
    log('Tab switch idle. URL:', page.url());

    log('');
    log('=== SCRIPT COMPLETED WITHOUT CRASH ===');
    log('Customer creation flow would proceed normally from here');

  } catch (e) {
    log('FATAL ERROR', e.message);
    log('Stack', e.stack);
    log('Final page URL:', page.url().catch?.() || '(could not read)');
  } finally {
    log('Waiting 10s before closing browser...');
    await wait(10000);
    await browser.close();
  }
}

run().catch(e => { console.error('Unhandled:', e); process.exit(1); });

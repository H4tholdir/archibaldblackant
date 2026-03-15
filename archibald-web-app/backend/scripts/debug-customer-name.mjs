/**
 * Script di debug per diagnosticare il problema del campo NAME vuoto
 * durante la creazione cliente in Archibald ERP.
 *
 * Eseguire sul VPS: node /app/scripts/debug-customer-name.mjs
 *
 * Cosa fa:
 * 1. Apre il form nuovo cliente
 * 2. Digita la P.IVA e aspetta l'auto-fill
 * 3. Va su "Prezzi e sconti" → imposta LINEDISC
 * 4. Torna su "Principale" → fa i lookup
 * 5. Digita il NAME
 * 6. Ad ogni step dumpa il valore del campo NAME e lo stato DevExpress
 * 7. Prima di salvare verifica tutti i campi
 */

import puppeteer from 'puppeteer';

const ARCHIBALD_URL = process.env.ARCHIBALD_URL || 'https://4.231.124.90/Archibald';
const ARCHIBALD_USER = process.env.ARCHIBALD_USER;
const ARCHIBALD_PASS = process.env.ARCHIBALD_PASS;

const TEST_CUSTOMER = {
  vatNumber: '04101491217',
  name: 'Odontoiatrica Mediterranea Gestione E Servizi Per L\'Odontoiatria Di Perna Ottavio E C. S.a.s.',
  pec: 'odonto.mediterranea@pec.it',
  sdi: 'M5UXCR1',
  street: 'Via Vittorio Veneto 116',
  postalCode: '80058',
  postalCodeCity: 'Torre Annunziata',
  paymentTerms: '206',
  phone: '+390815364399',
  lineDiscount: 'N/A',
};

function log(msg, data) {
  const ts = new Date().toISOString().slice(11, 23);
  if (data !== undefined) {
    console.log(`[${ts}] ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${ts}] ${msg}`);
  }
}

async function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDevExpressIdle(page, label = '', timeoutMs = 10000) {
  try {
    await page.waitForFunction(() => {
      const w = window;
      if (typeof w.ASPx === 'undefined') return true;
      const pending = (w.ASPx._pendingCallbacks || 0) +
                      (w.ASPx._sendingRequests || 0) +
                      (w.ASPx._pendingRequestCount || 0);
      return pending === 0;
    }, { timeout: timeoutMs, polling: 200 });
  } catch {
    log(`waitForDevExpressIdle timeout (${label})`);
  }
}

async function dumpNameField(page, label) {
  const result = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const nameInput = inputs.find(i => /xaf_dviNAME_Edit_I$/.test(i.id));
    if (!nameInput) return { found: false };

    const w = window;
    let dxValue = null;
    const col = w.ASPxClientControl?.GetControlCollection?.();
    if (col) {
      col.ForEachControl((c) => {
        try {
          const el = c.GetInputElement?.();
          if (el === nameInput || el?.id === nameInput.id) {
            dxValue = c.GetValue?.() ?? c.GetText?.() ?? null;
          }
        } catch {}
      });
    }

    return {
      found: true,
      id: nameInput.id,
      domValue: nameInput.value,
      dxValue,
      disabled: nameInput.disabled,
      readOnly: nameInput.readOnly,
      visible: nameInput.offsetParent !== null,
    };
  });
  log(`[NAME DUMP] ${label}`, result);
  return result;
}

async function dumpAllRequiredFields(page) {
  const result = await page.evaluate(() => {
    const fields = {};
    const fieldRegexes = {
      NAME: /xaf_dviNAME_Edit_I$/,
      VATNUM: /xaf_dviVATNUM_Edit_I$/,
      PHONE: /xaf_dviPHONE_Edit_I$/,
      LEGALEMAIL: /xaf_dviLEGALEMAIL_Edit_I$/,
      LEGALAUTHORITY: /xaf_dviLEGALAUTHORITY_Edit_I$/,
      STREET: /xaf_dviSTREET_Edit_I$/,
    };

    const inputs = Array.from(document.querySelectorAll('input'));
    for (const [key, regex] of Object.entries(fieldRegexes)) {
      const input = inputs.find(i => regex.test(i.id));
      fields[key] = input ? { id: input.id, value: input.value, disabled: input.disabled } : null;
    }

    // Dump DevExpress validation errors visible on page
    const errorTexts = [];
    document.querySelectorAll('[class*="dxeError"], [class*="ErrorFrame"], .dxpc-main').forEach(el => {
      if (el.offsetParent !== null && el.textContent?.trim()) {
        errorTexts.push(el.textContent.trim().substring(0, 200));
      }
    });

    return { fields, errorTexts, url: window.location.href };
  });
  log('[ALL FIELDS DUMP]', result);
  return result;
}

async function typeField(page, regex, value, label) {
  log(`typeField START: ${label} = "${value.substring(0, 50)}..."`);

  const inputId = await page.evaluate((regexStr, val) => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const input = inputs.find(i => new RegExp(regexStr).test(i.id));
    if (!input) return null;

    input.scrollIntoView({ block: 'center' });
    input.focus();
    input.click();
    input.select();
    document.execCommand('delete');
    document.execCommand('insertText', false, val);

    const w = window;
    const col = w.ASPxClientControl?.GetControlCollection?.();
    if (col) {
      col.ForEachControl((c) => {
        try {
          const el = c.GetInputElement?.();
          if (el === input || el?.id === input.id) {
            if (typeof c.SetValue === 'function') c.SetValue(val);
            else if (typeof c.SetText === 'function') c.SetText(val);
          }
        } catch {}
      });
    }

    return input.id;
  }, regex.source, value);

  if (!inputId) {
    log(`typeField ERROR: field not found: ${label}`);
    return;
  }

  log(`typeField found: ${inputId}`);

  // Check value immediately after execCommand
  const afterExecCommand = await page.evaluate((id) => {
    return (document.getElementById(id))?.value ?? '';
  }, inputId);
  log(`typeField after execCommand: "${afterExecCommand.substring(0, 60)}"`);

  await page.keyboard.press('Tab');

  await waitForDevExpressIdle(page, `typed-${label}`, 8000);

  const afterIdle = await page.evaluate((id) => {
    return (document.getElementById(id))?.value ?? '';
  }, inputId);
  log(`typeField after DevExpress idle: "${afterIdle.substring(0, 60)}"`);

  if (afterIdle !== value) {
    log(`typeField VALUE MISMATCH for ${label}!`, {
      expected: value.substring(0, 60),
      actual: afterIdle.substring(0, 60),
    });
  } else {
    log(`typeField OK: ${label}`);
  }
}

async function clickTab(page, tabName) {
  const clicked = await page.evaluate((name) => {
    const tabs = Array.from(document.querySelectorAll('li.dxtl, span.dxtl_T, a'));
    const tab = tabs.find(el => el.textContent?.trim().includes(name));
    if (tab) {
      tab.click();
      return true;
    }
    return false;
  }, tabName);

  if (!clicked) {
    log(`Tab "${tabName}" not found, trying text search`);
  } else {
    log(`Tab "${tabName}" clicked`);
    await waitForDevExpressIdle(page, `tab-${tabName}`, 5000);
  }
  return clicked;
}

async function main() {
  if (!ARCHIBALD_URL) {
    log('ERROR: ARCHIBALD_URL not set');
    process.exit(1);
  }

  // Read credentials from DB if not provided via env
  let username = ARCHIBALD_USER;
  let password = ARCHIBALD_PASS;
  if (!username || !password) {
    log('Credentials not provided via env, reading from DB...');
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: process.env.PG_HOST || 'postgres',
        port: parseInt(process.env.PG_PORT || '5432'),
        database: process.env.PG_DATABASE || 'archibald',
        user: process.env.PG_USER || 'archibald',
        password: process.env.PG_PASSWORD,
      });
      const { rows } = await pool.query(
        `SELECT username, encrypted_password FROM agents.users WHERE role = 'admin' OR role = 'agent' LIMIT 1`
      );
      if (rows.length > 0) {
        username = rows[0].username;
        log(`Using username from DB: ${username}`);
        // Note: encrypted_password needs decryption - use ARCHIBALD_PASS env instead
        log('WARNING: cannot decrypt password from script - set ARCHIBALD_USER and ARCHIBALD_PASS env vars');
      }
      await pool.end();
    } catch (err) {
      log('DB read failed', { error: err.message });
    }
  }

  if (!username || !password) {
    log('ERROR: Set ARCHIBALD_USER and ARCHIBALD_PASS env vars');
    log('Example: ARCHIBALD_URL=https://... ARCHIBALD_USER=agent1 ARCHIBALD_PASS=... node /app/scripts/debug-customer-name.mjs');
    process.exit(1);
  }

  log('Starting Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('console', msg => {
    if (msg.type() === 'error') log(`[PAGE ERROR] ${msg.text()}`);
  });

  try {
    // Step 1: Login
    log('STEP 1: Login');
    await page.goto(`${ARCHIBALD_URL}/Default.aspx`, { waitUntil: 'networkidle2', timeout: 60000 });
    log(`Current URL: ${page.url()}`);

    // Fill login form if present
    const loginField = await page.$('input[id*="USER"], input[name*="user"], input[type="text"]');
    if (loginField) {
      log('Login form found, filling credentials');
      await loginField.click();
      await loginField.type(username, { delay: 50 });
      const passField = await page.$('input[type="password"]');
      if (passField) {
        await passField.click();
        await passField.type(password, { delay: 50 });
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      }
    } else {
      log('No login form found - already logged in?');
    }

    log(`After login URL: ${page.url()}`);

    // Step 2: Navigate to customer list
    log('STEP 2: Navigate to CUSTTABLE_ListView_Agent');
    await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForDevExpressIdle(page, 'custtable-load', 10000);
    log(`ListView URL: ${page.url()}`);

    // Step 3: Click "Nuovo"
    log('STEP 3: Click Nuovo');
    const clicked = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, span, button'));
      const el = els.find(e => e.textContent?.trim() === 'Nuovo' || e.textContent?.trim() === 'New');
      if (el) { el.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error('"Nuovo" button not found');

    await page.waitForFunction(
      (baseUrl) => !window.location.href.includes('ListView'),
      { timeout: 15000, polling: 200 },
      ARCHIBALD_URL,
    );
    await waitForDevExpressIdle(page, 'form-load', 10000);
    log(`Form URL: ${page.url()}`);
    await dumpNameField(page, 'after form open');

    // Step 4: Fill VAT number
    log('STEP 4: Fill VAT number');
    const vatInputId = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const input = inputs.find(i => /xaf_dviVATNUM_Edit_I$/.test(i.id));
      if (!input) return null;
      input.scrollIntoView({ block: 'center' });
      input.focus();
      input.click();
      input.value = '';
      return input.id;
    });

    if (!vatInputId) throw new Error('VAT input not found');
    log(`VAT input: ${vatInputId}`);
    await page.type(`[id="${vatInputId}"]`, TEST_CUSTOMER.vatNumber, { delay: 30 });
    await page.keyboard.press('Tab');
    await waitMs(500);
    await waitForDevExpressIdle(page, 'vat-autofill', 20000);

    // Poll until autofill completes
    for (let i = 0; i < 10; i++) {
      const filled = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const nameInput = inputs.find(i => /xaf_dviNAME_Edit_I$/.test(i.id));
        return nameInput?.value?.length > 0;
      });
      if (filled) {
        log(`VAT autofill populated (attempt ${i + 1})`);
        break;
      }
      log(`Waiting for autofill (attempt ${i + 1})`);
      await waitMs(2000);
    }

    await dumpNameField(page, 'after VAT autofill');
    await dumpAllRequiredFields(page);

    // Step 5: Go to "Prezzi e sconti"
    log('STEP 5: Tab Prezzi e sconti → set LINEDISC');
    await clickTab(page, 'Prezzi e sconti');
    await waitMs(500);
    await dumpNameField(page, 'after tab Prezzi e sconti');

    // Set LINEDISC combo
    const linediscSet = await page.evaluate(() => {
      const w = window;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      if (!col) return false;
      let found = false;
      col.ForEachControl((c) => {
        const name = c.name || '';
        if (/LINEDISC.*dropdown/i.test(name)) {
          try { c.SetValue('N/A'); found = true; } catch {}
        }
      });
      return found;
    });
    log(`LINEDISC set: ${linediscSet}`);
    await waitForDevExpressIdle(page, 'linedisc', 5000);
    await dumpNameField(page, 'after LINEDISC set');

    // Step 6: Back to "Principale"
    log('STEP 6: Tab Principale');
    await clickTab(page, 'Principale');
    await waitForDevExpressIdle(page, 'tab-principale', 5000);
    await dumpNameField(page, 'after tab Principale');

    // Step 7: Payment terms lookup (simplified - just click the button)
    if (TEST_CUSTOMER.paymentTerms) {
      log('STEP 7: Payment terms lookup');
      const lookupClicked = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const btn = inputs.find(i => /PAYMTERMID.*find.*B0/.test(i.id));
        if (btn) { btn.click(); return true; }
        // Try button elements
        const btns = Array.from(document.querySelectorAll('img, input[type="button"], button'));
        const b = btns.find(b => /PAYMTERMID.*B0/.test(b.id || ''));
        if (b) { b.click(); return true; }
        return false;
      });
      log(`Payment terms lookup clicked: ${lookupClicked}`);
      await waitMs(2000);
      await dumpNameField(page, 'after payment terms lookup click');

      // Check if popup opened
      const popupOpen = await page.evaluate(() => {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        return iframes.some(f => f.src?.includes('FindPopup'));
      });
      log(`Popup opened: ${popupOpen}`);

      if (popupOpen) {
        // Search for payment terms in iframe
        await waitMs(1000);
        const iframeSrc = await page.evaluate(() => {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          const f = iframes.find(f => f.src?.includes('FindPopup'));
          return f?.src ?? null;
        });
        log(`Iframe src: ${iframeSrc}`);

        // Type search term in popup search
        await page.evaluate((searchTerm) => {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          const iframe = iframes.find(f => f.src?.includes('FindPopup'));
          if (!iframe?.contentDocument) return;
          const inputs = Array.from(iframe.contentDocument.querySelectorAll('input'));
          const searchInput = inputs[0];
          if (searchInput) {
            searchInput.value = searchTerm;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, TEST_CUSTOMER.paymentTerms);
        await page.keyboard.press('Enter');
        await waitMs(2000);

        // Try to find and click the first result
        const resultClicked = await page.evaluate(() => {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          const iframe = iframes.find(f => f.src?.includes('FindPopup'));
          if (!iframe?.contentDocument) return false;
          const rows = iframe.contentDocument.querySelectorAll('tr.dxgvDataRow, tr[id*="row"]');
          if (rows.length > 0) {
            (rows[0]).click();
            return true;
          }
          return false;
        });
        log(`Lookup result clicked: ${resultClicked}`);
        await waitForDevExpressIdle(page, 'payment-terms-select', 5000);
      }
    }

    await dumpNameField(page, 'after payment terms lookup done');

    // Step 8: Fill NAME field
    log('STEP 8: Fill NAME field');
    await dumpNameField(page, 'BEFORE typeField NAME');
    await typeField(page, /xaf_dviNAME_Edit_I$/, TEST_CUSTOMER.name, 'NAME');
    await dumpNameField(page, 'after typeField NAME');

    // Step 9: Fill other fields and check NAME after each
    if (TEST_CUSTOMER.pec) {
      log('STEP 9a: Fill PEC');
      await typeField(page, /xaf_dviLEGALEMAIL_Edit_I$/, TEST_CUSTOMER.pec, 'PEC');
      await dumpNameField(page, 'after PEC fill');
    }

    if (TEST_CUSTOMER.sdi) {
      log('STEP 9b: Fill SDI');
      await typeField(page, /xaf_dviLEGALAUTHORITY_Edit_I$/, TEST_CUSTOMER.sdi, 'SDI');
      await dumpNameField(page, 'after SDI fill');
    }

    if (TEST_CUSTOMER.street) {
      log('STEP 9c: Fill STREET');
      await typeField(page, /xaf_dviSTREET_Edit_I$/, TEST_CUSTOMER.street, 'STREET');
      await dumpNameField(page, 'after STREET fill');
    }

    if (TEST_CUSTOMER.phone) {
      log('STEP 9d: Fill PHONE');
      await typeField(page, /xaf_dviPHONE_Edit_I$/, TEST_CUSTOMER.phone, 'PHONE');
      await dumpNameField(page, 'after PHONE fill');
    }

    // Step 10: Final state before save
    log('STEP 10: Final dump before save attempt');
    await dumpAllRequiredFields(page);
    await dumpNameField(page, 'FINAL before save');

    // Take screenshot
    const screenshotPath = '/tmp/debug-customer-name-final.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`Screenshot saved: ${screenshotPath}`);

    // Step 11: Attempt save
    log('STEP 11: Click Salva e chiudi');
    const saveClicked = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, span, div, li'));
      const el = els.find(e => e.textContent?.trim() === 'Salva e chiudi');
      if (el) { el.click(); return true; }
      return false;
    });
    log(`Save clicked: ${saveClicked}`);
    await waitForDevExpressIdle(page, 'save', 8000);

    // Step 12: Check result
    log('STEP 12: Check result after save');
    await waitMs(2000);
    const urlAfterSave = page.url();
    log(`URL after save: ${urlAfterSave}`);

    const formClosed = !urlAfterSave.includes('DetailView');
    log(`Form closed: ${formClosed}`);

    if (!formClosed) {
      log('Form still open - checking validation errors');
      await dumpAllRequiredFields(page);

      // Check for warning checkbox
      const checkboxInfo = await page.evaluate(() => {
        const checkbox = document.querySelector('input[id$="_ErrorInfo_Ch_S"]');
        if (checkbox) return { found: true, id: checkbox.id, checked: checkbox.checked };

        const allInputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        return { found: false, checkboxes: allInputs.map(i => ({ id: i.id, checked: i.checked, parentText: i.closest('tr')?.textContent?.trim()?.substring(0, 100) })) };
      });
      log('Warning checkbox info', checkboxInfo);

      const finalScreenshot = '/tmp/debug-customer-name-error.png';
      await page.screenshot({ path: finalScreenshot, fullPage: true });
      log(`Error screenshot: ${finalScreenshot}`);
    }

  } catch (error) {
    log('ERROR', { message: error.message, stack: error.stack });
    try {
      await page.screenshot({ path: '/tmp/debug-customer-name-crash.png', fullPage: true });
      log('Crash screenshot saved: /tmp/debug-customer-name-crash.png');
    } catch {}
  } finally {
    await browser.close();
    log('Browser closed. Done.');
  }
}

main();

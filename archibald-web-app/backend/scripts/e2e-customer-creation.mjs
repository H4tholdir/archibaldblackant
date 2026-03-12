/**
 * E2E test per la creazione completa di un cliente in Archibald ERP.
 *
 * Replica ESATTAMENTE i pattern di archibald-bot.ts:
 *   - typeDevExpressField (execCommand + SetValue + Tab + retry)
 *   - selectFromDevExpressLookup (dialog + iframe + row selection)
 *   - openCustomerTab (a.dxtc-link / span.dx-vam)
 *   - dismissDevExpressPopups
 *   - setDevExpressComboBox
 *   - ensureNameFieldBeforeSave
 *   - saveAndCloseCustomer (warning checkbox)
 *
 * Eseguire sul VPS:
 *   ARCHIBALD_URL=https://4.231.124.90/Archibald \
 *   ARCHIBALD_USER=agent1 ARCHIBALD_PASS=xxx \
 *   node /app/scripts/e2e-customer-creation.mjs
 *
 * Flag env opzionali:
 *   SKIP_SAVE=true        — ferma prima del salvataggio (no creazione nel DB)
 *   SCREENSHOT_DIR=/tmp   — dove salvare screenshot (default /tmp)
 */

import puppeteer from 'puppeteer';

// ─── Configurazione ───────────────────────────────────────────────────────────

const ARCHIBALD_URL = (process.env.ARCHIBALD_URL || 'https://4.231.124.90/Archibald').replace(/\/$/, '');
const ARCHIBALD_USER = process.env.ARCHIBALD_USER;
const ARCHIBALD_PASS = process.env.ARCHIBALD_PASS;
const SKIP_SAVE = process.env.SKIP_SAVE === 'true';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp';

const TEST_CUSTOMER = {
  vatNumber:        '04101491217',
  name:             "Odontoiatrica Mediterranea Gestione E Servizi Per L'Odontoiatria Di Perna Ottavio E C. S.a.s.",
  pec:              'odonto.mediterranea@pec.it',
  sdi:              'M5UXCR1',
  street:           'Via Vittorio Veneto 116',
  postalCode:       '80058',
  postalCodeCity:   'Torre Annunziata',
  paymentTerms:     '206',
  phone:            '+390815364399',
  mobile:           '+390815364399',
  email:            'massimiliano94@hotmail.it',
  url:              'https://example.com',
  deliveryMode:     'FedEx',
  lineDiscount:     'N/A',
};

// ─── Utility ──────────────────────────────────────────────────────────────────

let screenshotIndex = 0;

function ts() { return new Date().toISOString().slice(11, 23); }

function log(msg, data) {
  if (data !== undefined) {
    console.log(`[${ts()}] ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${ts()}] ${msg}`);
  }
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function screenshot(page, label) {
  screenshotIndex++;
  const path = `${SCREENSHOT_DIR}/e2e-${String(screenshotIndex).padStart(3,'0')}-${label.replace(/[^a-z0-9]/gi, '-')}.png`;
  try {
    await page.screenshot({ path, fullPage: true });
    log(`📸 Screenshot: ${path}`);
  } catch (err) {
    log(`Screenshot failed (${label}): ${err.message}`);
  }
}

// ─── DevExpress helpers (specchio esatto di archibald-bot.ts) ─────────────────

async function waitForDevExpressIdle(page, label = '', timeoutMs = 10000) {
  try {
    await page.waitForFunction(() => {
      const w = window;
      if (typeof w.ASPx === 'undefined') return true;
      const pending = (w.ASPx._pendingCallbacks || 0)
                    + (w.ASPx._sendingRequests || 0)
                    + (w.ASPx._pendingRequestCount || 0);
      return pending === 0;
    }, { timeout: timeoutMs, polling: 200 });
  } catch {
    log(`  waitForDevExpressIdle timeout (${label})`);
  }
}

async function waitForDevExpressReady(page, timeoutMs = 10000) {
  try {
    await page.waitForFunction(() => {
      const w = window;
      return (
        document.readyState === 'complete' &&
        typeof w.ASPxClientControl !== 'undefined' &&
        typeof w.ASPx !== 'undefined'
      );
    }, { timeout: timeoutMs, polling: 200 });
    await waitForDevExpressIdle(page, 'ready', timeoutMs);
  } catch {
    log('  waitForDevExpressReady timeout');
  }
}

/**
 * Replica esatta di ArchibaldBot.typeDevExpressField
 * execCommand + SetValue + Tab + waitForDevExpressIdle + retry se mismatch
 */
async function typeDevExpressField(page, fieldRegex, value, label) {
  log(`  typeDevExpressField: ${label || fieldRegex} = "${value.substring(0, 60)}${value.length > 60 ? '...' : ''}"`);

  // Find field, focus, and clear via native setter (not execCommand)
  const inputId = await page.evaluate(regex => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const input = inputs.find(i => new RegExp(regex).test(i.id));
    if (!input) return null;

    input.scrollIntoView({ block: 'center' });
    input.focus();
    input.click();
    input.select();

    // Clear via native setter so page.type() appends to empty field
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, '');
    else input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    return input.id;
  }, fieldRegex.source);

  if (!inputId) {
    log(`  typeDevExpressField ERROR: field not found for ${label || fieldRegex}`);
    return null;
  }

  // Type via real CDP keyboard events: generates authentic keydown/keypress/keyup/input
  // events that DevExpress XAF tracks to commit the value to the server-side model.
  // execCommand('insertText') only fires 'input' and does NOT trigger the server commit.
  await page.type(`#${inputId}`, value, { delay: 5 });
  await page.keyboard.press('Tab');
  // Give server 1s to process the field's callback before verifying or moving to the next field
  // (waitForDevExpressIdle is a no-op on this ERP since window.ASPx is undefined)
  await wait(1000);
  await waitForDevExpressIdle(page, `typed-${inputId}`, 8000);

  const actual = await page.evaluate(id => {
    return (document.getElementById(id))?.value ?? '';
  }, inputId);

  if (actual !== value) {
    log(`  typeDevExpressField mismatch → retry`, { expected: value.substring(0, 60), actual: actual.substring(0, 60) });

    await page.evaluate(id => {
      const input = document.getElementById(id);
      if (!input) return;
      input.scrollIntoView({ block: 'center' });
      input.focus();
      input.click();
      input.select();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, '');
      else input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, inputId);

    await page.type(`#${inputId}`, value, { delay: 5 });
    await page.keyboard.press('Tab');
    await wait(1000);
    await waitForDevExpressIdle(page, `typed-retry-${inputId}`, 8000);

    const actualAfterRetry = await page.evaluate(id => {
      return (document.getElementById(id))?.value ?? '';
    }, inputId);
    log(`  typeDevExpressField after retry: "${actualAfterRetry.substring(0, 60)}" ok=${actualAfterRetry === value}`);
  } else {
    log(`  typeDevExpressField OK: "${actual.substring(0, 60)}"`);
  }

  return inputId;
}

/**
 * Replica esatta di ArchibaldBot.setDevExpressComboBox
 */
async function setDevExpressComboBox(page, fieldRegex, value) {
  log(`  setDevExpressComboBox: ${fieldRegex} = "${value}"`);

  const result = await page.evaluate((regex, val) => {
    const w = window;
    const inputs = Array.from(document.querySelectorAll('input'));
    const input = inputs.find(i => new RegExp(regex).test(i.id));
    if (!input) return { found: false, method: 'not-found' };

    input.scrollIntoView({ block: 'center' });

    const col = w.ASPxClientControl?.GetControlCollection?.();
    if (col) {
      let combo = null;
      col.ForEachControl(c => {
        if (combo) return;
        try {
          const el = c.GetInputElement?.();
          if (el === input || (el && el.id === input.id)) { combo = c; return; }
        } catch {}
        try {
          const mainEl = c.GetMainElement?.();
          if (mainEl && mainEl.contains(input) && (typeof c.GetItemCount === 'function' || typeof c.SetSelectedIndex === 'function')) {
            combo = c;
          }
        } catch {}
      });

      if (combo) {
        if (typeof combo.GetItemCount === 'function') {
          const count = combo.GetItemCount();
          for (let i = 0; i < count; i++) {
            const itemText = typeof combo.GetItem === 'function' ? combo.GetItem(i)?.text : null;
            if (itemText === val && typeof combo.SetSelectedIndex === 'function') {
              combo.SetSelectedIndex(i);
              return { found: true, method: 'SetSelectedIndex', actual: input.value };
            }
          }
        }
        if (typeof combo.SetText === 'function') {
          combo.SetText(val);
          return { found: true, method: 'SetText', actual: input.value };
        }
        if (typeof combo.SetValue === 'function') {
          combo.SetValue(val);
          return { found: true, method: 'SetValue', actual: input.value };
        }
      }
    }
    return { found: false, method: 'no-control', inputId: input.id };
  }, fieldRegex.source, value);

  log(`  setDevExpressComboBox result`, result);
  await waitForDevExpressIdle(page, `combo-${value}`, 5000);
}

/**
 * Replica esatta di ArchibaldBot.openCustomerTab (con TAB_ALIASES)
 */
const TAB_ALIASES = {
  'Principale': ['Principale', 'Main'],
  'Prezzi e sconti': ['Prezzi e sconti', 'Price Discount', 'Prices and Discounts'],
  'Indirizzo alt': ['Indirizzo alt', 'Alt. address', 'Alt. Address', 'Alternative address'],
};

async function openCustomerTab(page, tabText) {
  const candidates = TAB_ALIASES[tabText] || [tabText];
  for (const candidate of candidates) {
    const clicked = await page.evaluate(text => {
      const links = Array.from(document.querySelectorAll('a.dxtc-link, span.dx-vam'));
      for (const el of links) {
        if ((el.textContent?.trim() || '').includes(text)) {
          const target = el.tagName === 'A' ? el : el.parentElement;
          if (target && target.offsetParent !== null) {
            target.click();
            return true;
          }
        }
      }
      const tabs = Array.from(document.querySelectorAll('li[id*="_pg_AT"]'));
      for (const tab of tabs) {
        const link = tab.querySelector('a.dxtc-link');
        const span = tab.querySelector('span.dx-vam');
        if ((span?.textContent?.trim() || '').includes(text) && link && link.offsetParent !== null) {
          link.click();
          return true;
        }
      }
      return false;
    }, candidate);

    if (clicked) {
      log(`  Tab "${candidate}" clicked`);
      try {
        await page.waitForFunction(() => {
          const w = window;
          const col = w.ASPxClientControl?.GetControlCollection?.();
          if (!col) return true;
          let busy = false;
          col.ForEachControl(c => { try { if (c.InCallback?.()) busy = true; } catch {} });
          return !busy;
        }, { timeout: 5000, polling: 100 });
      } catch {}
      return true;
    }
  }
  log(`  Tab "${tabText}" NOT FOUND`);
  return false;
}

async function dismissDevExpressPopups(page) {
  const result = await page.evaluate(() => {
    const w = window;
    const col = w.ASPxClientControl?.GetControlCollection?.();
    if (!col) return [];
    const dismissed = [];
    col.ForEachControl(c => {
      const name = c?.name || c?.GetName?.() || '';
      if ((name.includes('PopupWindow') || name.includes('popupWindow') || name.includes('UPPopup')) && typeof c.Hide === 'function') {
        try {
          const isVisible = typeof c.IsVisible === 'function' ? c.IsVisible() : true;
          if (isVisible) { c.Hide(); dismissed.push(name); }
        } catch {}
      }
    });
    return dismissed;
  });
  if (result.length > 0) log(`  Dismissed popups: ${result.join(', ')}`);
}

/**
 * Replica esatta di ArchibaldBot.selectFromDevExpressLookup
 */
async function selectFromDevExpressLookup(page, buttonRegex, searchValue, matchHint) {
  log(`  selectFromDevExpressLookup: ${searchValue}${matchHint ? ` (hint: ${matchHint})` : ''}`);

  const buttonId = await page.evaluate(regex => {
    const els = Array.from(document.querySelectorAll('td, img, button, a, div'));
    const btn = els.find(el => new RegExp(regex).test(el.id));
    if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); return btn.id; }
    return null;
  }, buttonRegex.source);

  if (!buttonId) throw new Error(`Lookup button not found: ${buttonRegex}`);
  log(`  Lookup button clicked: ${buttonId}`);

  // Wait for dialog to appear
  try {
    await page.waitForFunction(() => {
      const dialogs = Array.from(document.querySelectorAll(
        '[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, .dxpc-content, [id*="PopupControl"], [id*="_PW"], .dxpnlControl',
      )).filter(el => el.offsetParent !== null && el.getBoundingClientRect().width > 0);
      return dialogs.length > 0;
    }, { timeout: 10000, polling: 100 });
  } catch {
    log(`  Lookup dialog not detected, waiting 2s...`);
    await wait(2000);
  }

  // Check for iframe (FindPopup)
  let iframeInfo = { hasIframe: false, src: '', id: '' };
  const iframeWaitStart = Date.now();
  while (Date.now() - iframeWaitStart < 5000) {
    iframeInfo = await page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('iframe'))
        .filter(f => f.offsetParent !== null && f.src);
      const findPopup = visible.find(f => f.src.includes('FindPopup'));
      if (findPopup) return { hasIframe: true, src: findPopup.src, id: findPopup.id };
      for (const f of visible) {
        const parent = f.closest('[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, [id*="PopupControl"], [id*="_PW"]');
        if (parent) return { hasIframe: true, src: f.src, id: f.id };
      }
      return { hasIframe: false, src: '', id: '' };
    });
    if (iframeInfo.hasIframe) break;
    await wait(300);
  }

  log(`  Lookup iframe check`, { hasIframe: iframeInfo.hasIframe, id: iframeInfo.id });

  if (iframeInfo.hasIframe) {
    await selectLookupViaIframe(page, iframeInfo.id, searchValue, matchHint);
  } else {
    await selectLookupDirect(page, searchValue, matchHint);
  }

  await waitForDevExpressIdle(page, 'lookup-close', 5000);
  log(`  selectFromDevExpressLookup done: ${searchValue}`);
}

async function selectLookupViaIframe(page, iframeId, searchValue, matchHint) {
  const iframeHandle = await page.$(`#${iframeId}`);
  if (!iframeHandle) {
    log(`  Iframe #${iframeId} not found, fallback to direct`);
    return selectLookupDirect(page, searchValue, matchHint);
  }
  const frame = await iframeHandle.contentFrame();
  if (!frame) {
    log('  contentFrame() null, fallback to direct');
    return selectLookupDirect(page, searchValue, matchHint);
  }

  // Wait for iframe DevExpress ready
  try {
    await frame.waitForFunction(() => {
      const w = window;
      return document.readyState === 'complete' && !!w.ASPxClientControl?.GetControlCollection;
    }, { timeout: 10000, polling: 200 });
  } catch { log('  Iframe not fully ready'); }
  await wait(300);

  // Focus search input
  await frame.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]'))
      .filter(i => i.offsetParent !== null);
    const searchInput = inputs.find(i => /_DXSE_I$/.test(i.id) || /_DXFREditorcol0_I$/.test(i.id)) || inputs[0];
    if (searchInput) { searchInput.focus(); searchInput.click(); searchInput.value = ''; }
  });

  await page.keyboard.type(searchValue, { delay: 20 });
  await wait(200);
  await page.keyboard.press('Enter');

  // Wait for rows
  try {
    await frame.waitForFunction(() => {
      const w = window;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      if (col) {
        let busy = false;
        col.ForEachControl(c => { try { if (c.InCallback?.()) busy = true; } catch {} });
        if (busy) return false;
      }
      return document.querySelectorAll('tr[class*="dxgvDataRow"], tr[class*="dxgvFocusedRow"]').length > 0;
    }, { timeout: 12000, polling: 150 });
  } catch {
    const diag = await frame.evaluate(() => ({
      body: document.body?.innerHTML?.substring(0, 500),
      rows: document.querySelectorAll('tr').length,
    }));
    log('  Iframe rows not found', diag);
  }

  // Select row
  const sel = await frame.evaluate((query, hint) => {
    const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
      .filter(r => r.offsetParent !== null);
    if (rows.length === 0) return { clicked: false, reason: 'no-rows', rowCount: 0 };
    if (rows.length === 1) {
      const t = rows[0].querySelector('td') || rows[0];
      t.scrollIntoView({ block: 'center' }); t.click();
      return { clicked: true, reason: 'single-row', rowCount: 1 };
    }
    const qLower = query.trim().toLowerCase();
    for (const row of rows) {
      if (hint && row.textContent?.toLowerCase().includes(hint.trim().toLowerCase())) {
        const t = row.querySelector('td') || row;
        t.scrollIntoView({ block: 'center' }); t.click();
        return { clicked: true, reason: 'hint-match', rowCount: rows.length };
      }
    }
    for (const row of rows) {
      if (Array.from(row.querySelectorAll('td')).some(c => c.textContent?.trim().toLowerCase() === qLower)) {
        const t = row.querySelector('td') || row;
        t.scrollIntoView({ block: 'center' }); t.click();
        return { clicked: true, reason: 'exact-match', rowCount: rows.length };
      }
    }
    for (const row of rows) {
      if (row.textContent?.toLowerCase().includes(qLower)) {
        const t = row.querySelector('td') || row;
        t.scrollIntoView({ block: 'center' }); t.click();
        return { clicked: true, reason: 'contains-match', rowCount: rows.length };
      }
    }
    const t = rows[0].querySelector('td') || rows[0];
    t.scrollIntoView({ block: 'center' }); t.click();
    return { clicked: true, reason: 'fallback-first', rowCount: rows.length };
  }, searchValue, matchHint);
  log(`  Iframe row selection`, sel);
  await wait(300);

  // Click OK (in iframe or main page)
  let okClicked = await frame.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('span, button, a, td'))
      .find(el => el.offsetParent !== null && el.textContent?.trim() === 'OK');
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!okClicked) {
    okClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('span, button, a, td'))
        .find(el => el.offsetParent !== null && el.textContent?.trim() === 'OK');
      if (btn) { btn.click(); return true; }
      return false;
    });
  }
  log(`  OK clicked: ${okClicked}`);

  // Wait for iframe to disappear
  try {
    await page.waitForFunction(() =>
      !Array.from(document.querySelectorAll('iframe'))
        .some(f => f.offsetParent !== null && f.src?.includes('FindPopup')),
      { timeout: 8000, polling: 200 });
  } catch {
    log('  Iframe popup did not close, pressing Escape');
    await page.keyboard.press('Escape');
    await wait(1000);
  }
}

async function selectLookupDirect(page, searchValue, matchHint) {
  const searchInputId = await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll(
      '[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, .dxpc-content, [id*="PopupControl"], [id*="_PW"], .dxpnlControl',
    )).filter(el => el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    for (const d of dialogs) {
      const si = d.querySelector('input[id*="_DXSE_I"], input[id*="_DXFREditorcol0_I"]');
      if (si && si.offsetParent !== null) return si.id;
      const vis = Array.from(d.querySelectorAll('input[type="text"]')).filter(i => i.offsetParent !== null);
      if (vis.length > 0) return vis[0].id;
    }
    return null;
  });

  if (searchInputId) {
    await page.evaluate((id, val) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.focus(); input.click();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, val); else input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, searchInputId, searchValue);
    await page.keyboard.press('Enter');
  } else {
    await page.keyboard.type(searchValue, { delay: 30 });
    await page.keyboard.press('Enter');
  }

  // Wait for rows
  try {
    await page.waitForFunction(() => {
      const dialogs = Array.from(document.querySelectorAll(
        '[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, .dxpc-content, [id*="PopupControl"], [id*="_PW"], .dxpnlControl',
      )).filter(el => el.offsetParent !== null && el.getBoundingClientRect().width > 0);
      for (const d of dialogs) {
        if (d.querySelectorAll('tr[class*="dxgvDataRow"], tr[class*="dxgvFocusedRow"]').length > 0) return true;
      }
      return false;
    }, { timeout: 12000, polling: 150 });
  } catch {
    log('  Direct lookup: rows not detected');
  }

  // Select row in dialog
  await page.evaluate((query, hint) => {
    const dialogs = Array.from(document.querySelectorAll(
      '[id*="_DDD"], .dxpcLite, .dxpc-content, .dxpc-mainDiv, [id*="PopupControl"], [id*="_PW"], .dxpnlControl',
    )).filter(el => el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    let container = null;
    for (const d of dialogs) {
      if (d.querySelector('tr[class*="dxgvDataRow"]')) { container = d; break; }
    }
    if (!container) return;
    const rows = Array.from(container.querySelectorAll('tr[class*="dxgvDataRow"]'))
      .filter(r => r.offsetParent !== null);
    if (rows.length === 0) return;
    const qLower = query.trim().toLowerCase();
    for (const row of rows) {
      if (hint && row.textContent?.toLowerCase().includes(hint.trim().toLowerCase())) {
        (row.querySelector('td') || row).click(); return;
      }
    }
    for (const row of rows) {
      if (Array.from(row.querySelectorAll('td')).some(c => c.textContent?.trim().toLowerCase() === qLower)) {
        (row.querySelector('td') || row).click(); return;
      }
    }
    for (const row of rows) {
      if (row.textContent?.toLowerCase().includes(qLower)) {
        (row.querySelector('td') || row).click(); return;
      }
    }
    (rows[0].querySelector('td') || rows[0]).click();
  }, searchValue, matchHint);

  await wait(200);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('span, button, a, td'))
      .find(el => el.offsetParent !== null && el.textContent?.trim() === 'OK');
    if (btn) btn.click();
  });
  await page.waitForFunction(() => {
    const dialogs = Array.from(document.querySelectorAll('[id*="_DDD"], .dxpcLite'))
      .filter(el => el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    return dialogs.every(d => d.querySelectorAll('tr[class*="dxgvDataRow"]').length === 0);
  }, { timeout: 8000, polling: 200 }).catch(() => {});
}

/**
 * Replica esatta di ArchibaldBot.ensureNameFieldBeforeSave
 */
async function ensureNameFieldBeforeSave(page, expectedName) {
  const { currentValue, maxLength } = await page.evaluate(() => {
    const input = document.querySelector('input[id*="dviNAME"][id$="_I"]');
    return {
      currentValue: input?.value ?? null,
      maxLength: input?.maxLength ?? 0,
    };
  });

  const effectiveExpected = maxLength > 0 ? expectedName.substring(0, maxLength) : expectedName;

  if (currentValue !== effectiveExpected) {
    log(`  ⚠ NAME mismatch: maxLength=${maxLength} expected="${effectiveExpected.substring(0, 70)}" current="${String(currentValue).substring(0, 70)}"`);
  } else {
    log(`  NAME DOM is correct (maxLength=${maxLength}), re-typing to commit to server`);
  }

  // Always re-type NAME right before save: subsequent field callbacks (PEC, SDI, …)
  // can race with NAME's DevExpress callback, leaving the server model without NAME.
  const inputId = await page.evaluate(() => {
    const input = document.querySelector('input[id*="dviNAME"][id$="_I"]');
    if (!input) return null;
    input.scrollIntoView({ block: 'center' });
    input.focus(); input.click(); input.select();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, ''); else input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.id;
  });

  if (!inputId) { log('  NAME field not found for refill'); return; }

  await page.type(`#${inputId}`, effectiveExpected, { delay: 20 });
  await page.keyboard.press('Tab');
  await waitForDevExpressIdle(page, 'name-prefill', 5000);

  const verified = await page.evaluate(id => {
    return (document.getElementById(id))?.value ?? '';
  }, inputId);

  log(`  ensureNameFieldBeforeSave result: "${verified.substring(0, 70)}" ok=${verified === effectiveExpected}`);
}

// ─── Dump helpers ─────────────────────────────────────────────────────────────

async function dumpNameField(page, label) {
  const result = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const nameInput = inputs.find(i => /xaf_dviNAME_Edit_I$/.test(i.id));
    if (!nameInput) return { found: false };
    const w = window;
    let dxValue = null;
    const col = w.ASPxClientControl?.GetControlCollection?.();
    if (col) {
      col.ForEachControl(c => {
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
      maxLength: nameInput.maxLength,
      valueLength: nameInput.value.length,
    };
  });
  log(`[NAME DUMP] ${label}`, result);
  return result;
}

async function dumpAllFields(page, label) {
  const result = await page.evaluate(() => {
    const fieldPatterns = {
      NAME:           /xaf_dviNAME_Edit_I$/,
      VATNUM:         /xaf_dviVATNUM_Edit_I$/,
      PHONE:          /xaf_dviPHONE_Edit_I$/,
      MOBILEPHONE:    /xaf_dviCELLULARPHONE_Edit_I$/,
      EMAIL:          /xaf_dviEMAIL_Edit_I$/,
      URL:            /xaf_dviURL_Edit_I$/,
      LEGALEMAIL:     /xaf_dviLEGALEMAIL_Edit_I$/,
      LEGALAUTHORITY: /xaf_dviLEGALAUTHORITY_Edit_I$/,
      STREET:         /xaf_dviSTREET_Edit_I$/,
      LINEDISC:       /xaf_dviLINEDISC_Edit_dropdown_DD_I$/,
      DLVMODE:        /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
      ACCOUNTNUM:     /xaf_dviACCOUNTNUM_Edit_I$/,
    };
    const fields = {};
    const inputs = Array.from(document.querySelectorAll('input'));
    for (const [key, regex] of Object.entries(fieldPatterns)) {
      const inp = inputs.find(i => regex.test(i.id));
      fields[key] = inp ? { value: inp.value, maxLength: inp.maxLength || 0, disabled: inp.disabled, visible: inp.offsetParent !== null } : null;
    }
    const errorTexts = [];
    document.querySelectorAll('[class*="dxeError"], [class*="ErrorFrame"], .dxpc-main, [class*="ErrorInfo"], [id*="ErrorInfo"]').forEach(el => {
      if (el.offsetParent !== null && el.textContent?.trim()) {
        errorTexts.push(el.textContent.trim().substring(0, 300));
      }
    });
    const bodyText = document.body.innerText || '';
    const validationKeywords = ['Data Validation Error', 'non deve essere vuoto', 'must not be empty', 'cannot be blank'];
    const hasValidationError = validationKeywords.some(kw => bodyText.includes(kw));
    const validationSnippet = hasValidationError
      ? (() => {
          for (const kw of validationKeywords) {
            const idx = bodyText.indexOf(kw);
            if (idx >= 0) return bodyText.substring(Math.max(0, idx - 50), idx + 200);
          }
          return '';
        })()
      : '';
    const warningCheckbox = !!document.querySelector('input[id$="_ErrorInfo_Ch_S"]');
    return { fields, errorTexts, hasValidationError, validationSnippet, warningCheckbox, url: window.location.href };
  });
  log(`[ALL FIELDS DUMP] ${label}`, result);
  return result;
}

async function dumpDevExpressState(page, label) {
  const result = await page.evaluate(() => {
    const w = window;
    const info = {
      pendingCallbacks: w.ASPx?._pendingCallbacks ?? 'n/a',
      sendingRequests: w.ASPx?._sendingRequests ?? 'n/a',
      pendingRequestCount: w.ASPx?._pendingRequestCount ?? 'n/a',
    };
    return info;
  });
  log(`[DX STATE] ${label}`, result);
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!ARCHIBALD_USER || !ARCHIBALD_PASS) {
    log('ERROR: ARCHIBALD_USER e ARCHIBALD_PASS sono obbligatori');
    log('Esempio: ARCHIBALD_URL=https://... ARCHIBALD_USER=agent1 ARCHIBALD_PASS=xxx node /app/scripts/e2e-customer-creation.mjs');
    process.exit(1);
  }

  if (SKIP_SAVE) log('⚠ SKIP_SAVE=true — il salvataggio NON verrà eseguito');
  else log('⚠ SKIP_SAVE non impostato → il cliente VERRÀ CREATO IN PRODUZIONE');

  log(`Test customer: ${TEST_CUSTOMER.vatNumber} — ${TEST_CUSTOMER.name.substring(0, 50)}...`);
  log(`Archibald URL: ${ARCHIBALD_URL}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('console', msg => {
    if (msg.type() === 'error') log(`[PAGE ERROR] ${msg.text()}`);
  });

  const results = {
    steps: [],
    issues: [],
    nameValues: {},
    finalUrl: null,
    formClosed: null,
    customerProfile: null,
  };

  const step = (name) => {
    log(`\n═══ STEP: ${name} ═══`);
    results.steps.push(name);
  };

  try {
    // ── STEP 1: Login ─────────────────────────────────────────────────────────
    step('1. Login');
    await page.goto(`${ARCHIBALD_URL}/Default.aspx`, { waitUntil: 'networkidle2', timeout: 60000 });
    await screenshot(page, 'login-page');
    log(`URL: ${page.url()}`);

    const loginField = await page.$('input[id*="USER"], input[name*="user"], input[type="text"]');
    if (loginField) {
      log('Login form found');
      await loginField.click();
      await loginField.type(ARCHIBALD_USER, { delay: 50 });
      const passField = await page.$('input[type="password"]');
      if (passField) {
        await passField.click();
        await passField.type(ARCHIBALD_PASS, { delay: 50 });
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      }
    } else {
      log('No login form — already logged in?');
    }
    log(`After login URL: ${page.url()}`);
    if (page.url().includes('Login.aspx')) throw new Error('Login failed — still on Login page');

    // ── STEP 2: Navigate to ListView ──────────────────────────────────────────
    step('2. Navigate to CUSTTABLE_ListView_Agent');
    await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForDevExpressReady(page, 10000);
    log(`ListView URL: ${page.url()}`);

    // ── STEP 3: Click "Nuovo" ─────────────────────────────────────────────────
    step('3. Click Nuovo');
    const nuovoClicked = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, span, button'));
      const el = els.find(e => {
        const t = e.textContent?.trim() || '';
        return (t === 'Nuovo' || t === 'New') && e.offsetParent !== null;
      });
      if (el) { el.click(); return true; }
      return false;
    });
    if (!nuovoClicked) throw new Error('"Nuovo"/"New" button not found');

    await page.waitForFunction(
      (base) => !window.location.href.includes('ListView'),
      { timeout: 15000, polling: 200 },
      ARCHIBALD_URL,
    );
    await waitForDevExpressReady(page, 10000);
    log(`Form URL: ${page.url()}`);
    await screenshot(page, 'form-loaded');
    await dumpNameField(page, 'after form open');
    await dumpDevExpressState(page, 'after form open');

    // ── STEP 4: Tab "Prezzi e sconti" → LINEDISC ──────────────────────────────
    step('4. Tab Prezzi e sconti → LINEDISC = N/A');
    await openCustomerTab(page, 'Prezzi e sconti');
    await dismissDevExpressPopups(page);

    // Wait for LINEDISC to be visible
    try {
      await page.waitForFunction(() => {
        const input = document.querySelector('input[id*="LINEDISC"][id$="_I"]');
        return input && input.offsetParent !== null;
      }, { timeout: 10000, polling: 200 });
    } catch {
      log('  LINEDISC not visible — retrying tab');
      await openCustomerTab(page, 'Prezzi e sconti');
      await dismissDevExpressPopups(page);
      await wait(1000);
    }

    await setDevExpressComboBox(page, /xaf_dviLINEDISC_Edit_dropdown_DD_I$/, TEST_CUSTOMER.lineDiscount);
    await dumpNameField(page, 'after LINEDISC set');

    // ── STEP 5: Tab "Principale" ───────────────────────────────────────────────
    step('5. Tab Principale');
    await openCustomerTab(page, 'Principale');
    await dismissDevExpressPopups(page);
    await waitForDevExpressIdle(page, 'tab-principale', 5000);
    await dumpNameField(page, 'after tab Principale');
    await dumpDevExpressState(page, 'after tab Principale');

    // ── STEP 6: Payment terms lookup ──────────────────────────────────────────
    step('6. Payment terms lookup: 206');
    await selectFromDevExpressLookup(page, /xaf_dviPAYMTERMID_Edit_find_Edit_B0/, TEST_CUSTOMER.paymentTerms);
    await dumpNameField(page, 'after payment terms lookup');
    await screenshot(page, 'after-payment-terms');

    // ── STEP 7: CAP lookup ────────────────────────────────────────────────────
    step(`7. CAP lookup: ${TEST_CUSTOMER.postalCode} / ${TEST_CUSTOMER.postalCodeCity}`);
    try {
      await selectFromDevExpressLookup(
        page,
        /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/,
        TEST_CUSTOMER.postalCode,
        TEST_CUSTOMER.postalCodeCity,
      );
    } catch (capErr) {
      log(`  CAP lookup failed: ${capErr.message} — pressing Escape`);
      await page.keyboard.press('Escape'); await wait(500);
      await page.keyboard.press('Escape'); await wait(300);
    }
    await dumpNameField(page, 'after CAP lookup');
    await dumpDevExpressState(page, 'after CAP lookup');
    await screenshot(page, 'after-cap-lookup');

    // ── STEP 8: VAT number — wait 5s for async callback ───────────────────────
    step('8. VAT number (with async callback wait)');
    await typeDevExpressField(page, /xaf_dviVATNUM_Edit_I$/, TEST_CUSTOMER.vatNumber, 'VATNUM');
    log('  Waiting 5s for async VAT validation callback...');
    await wait(5000);
    await waitForDevExpressIdle(page, 'vat-validation', 10000);
    await dumpNameField(page, 'after VAT + 5s wait');
    await dumpDevExpressState(page, 'after VAT callback');
    await screenshot(page, 'after-vat');

    // ── STEP 9: DeliveryMode combo ────────────────────────────────────────────
    step('9. DeliveryMode = FedEx');
    await setDevExpressComboBox(page, /xaf_dviDLVMODE_Edit_dropdown_DD_I$/, TEST_CUSTOMER.deliveryMode);
    await dumpNameField(page, 'after DeliveryMode set');

    // ── STEP 10: NAME field ───────────────────────────────────────────────────
    step('10. TYPE NAME');
    await dumpNameField(page, 'BEFORE typeDevExpressField NAME');
    await typeDevExpressField(page, /xaf_dviNAME_Edit_I$/, TEST_CUSTOMER.name, 'NAME');
    await dumpNameField(page, 'AFTER typeDevExpressField NAME');
    await dumpDevExpressState(page, 'after NAME');

    // ── STEP 11: PEC ──────────────────────────────────────────────────────────
    step('11. PEC');
    await typeDevExpressField(page, /xaf_dviLEGALEMAIL_Edit_I$/, TEST_CUSTOMER.pec, 'PEC');
    await dumpNameField(page, 'after PEC');

    // ── STEP 12: SDI ──────────────────────────────────────────────────────────
    step('12. SDI');
    await typeDevExpressField(page, /xaf_dviLEGALAUTHORITY_Edit_I$/, TEST_CUSTOMER.sdi, 'SDI');
    await dumpNameField(page, 'after SDI');

    // ── STEP 13: STREET ───────────────────────────────────────────────────────
    step('13. STREET');
    await typeDevExpressField(page, /xaf_dviSTREET_Edit_I$/, TEST_CUSTOMER.street, 'STREET');
    await dumpNameField(page, 'after STREET');

    // ── STEP 14: PHONE ────────────────────────────────────────────────────────
    step('14. PHONE');
    await typeDevExpressField(page, /xaf_dviPHONE_Edit_I$/, TEST_CUSTOMER.phone, 'PHONE');
    await dumpNameField(page, 'after PHONE');

    // ── STEP 14b: CELLULARPHONE ───────────────────────────────────────────────
    step('14b. CELLULARPHONE');
    await typeDevExpressField(page, /xaf_dviCELLULARPHONE_Edit_I$/, TEST_CUSTOMER.mobile, 'CELLULARPHONE');
    await dumpNameField(page, 'after CELLULARPHONE');

    // ── STEP 15: EMAIL ────────────────────────────────────────────────────────
    step('15. EMAIL');
    await typeDevExpressField(page, /xaf_dviEMAIL_Edit_I$/, TEST_CUSTOMER.email, 'EMAIL');
    await dumpNameField(page, 'after EMAIL');

    // ── STEP 15b: URL ─────────────────────────────────────────────────────────
    step('15b. URL');
    await typeDevExpressField(page, /xaf_dviURL_Edit_I$/, TEST_CUSTOMER.url, 'URL');
    await dumpNameField(page, 'after URL');

    // ── STEP 16: ensureNameFieldBeforeSave ────────────────────────────────────
    step('16. ensureNameFieldBeforeSave');
    await ensureNameFieldBeforeSave(page, TEST_CUSTOMER.name);
    await dumpNameField(page, 'AFTER ensureNameFieldBeforeSave');

    // ── STEP 17: Final state dump ─────────────────────────────────────────────
    step('17. Final state dump before save');
    const finalState = await dumpAllFields(page, 'FINAL before save');
    await screenshot(page, 'before-save');

    // Collect issues
    // NAME field has maxLength=60 in Archibald ERP, compare truncated
    const nameMaxLength = finalState.fields.NAME?.maxLength || 60;
    const expectedNameTruncated = TEST_CUSTOMER.name.substring(0, nameMaxLength);
    if (finalState.fields.NAME?.value !== expectedNameTruncated) {
      results.issues.push(`NAME mismatch: expected="${expectedNameTruncated}" got="${finalState.fields.NAME?.value?.substring(0, 60)}"`);
    }
    if (!finalState.fields.VATNUM?.value) {
      results.issues.push('VATNUM is empty');
    }
    if (finalState.hasValidationError) {
      results.issues.push('Validation error text present on page');
    }

    results.nameValues = {
      beforeSave: finalState.fields.NAME?.value,
    };

    if (SKIP_SAVE) {
      log('\n⏭ SKIP_SAVE=true — fermato prima del salvataggio');
      results.formClosed = 'skipped';
    } else {
      // ── STEP 18: Salva e chiudi ─────────────────────────────────────────────
      step('18. Salva e chiudi');

      const saveClicked = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a, span, div, li'));
        const el = els.find(e =>
          (e.textContent?.trim() === 'Salva e chiudi' || e.textContent?.trim() === 'Save and Close') &&
          e.offsetParent !== null,
        );
        if (el) { el.click(); return 'direct-text'; }
        // Try dropdown with "Salvare"
        const salvare = Array.from(document.querySelectorAll('span, button, a')).find(e => {
          const text = e.textContent?.trim().toLowerCase() || '';
          return text.includes('salvare');
        });
        if (salvare) { salvare.click(); return 'dropdown-attempt'; }
        // Fallback: by-id
        const byId = document.querySelector('#Vertical_mainMenu_Menu_DXI1i1_T');
        if (byId) { byId.click(); return 'by-id'; }
        return false;
      });
      log(`  Save button: ${saveClicked}`);

      if (!saveClicked) throw new Error('Save button not found');

      // Wait for server to process save and show any validation popup or redirect
      await wait(2000);
      await waitForDevExpressIdle(page, 'save-customer', 8000);
      await screenshot(page, 'after-save-click');

      // ── STEP 19: Handle warning checkbox ───────────────────────────────────
      step('19. Handle warning checkbox');
      const warningSelector = await page.evaluate(() => {
        const cb = document.querySelector('input[id$="_ErrorInfo_Ch_S"]');
        if (cb) {
          const wrapper = cb.closest('span[id$="_ErrorInfo_Ch_S_D"]');
          if (wrapper) return { selector: `#${wrapper.id}`, type: 'errorinfo-wrapper' };
          return { selector: `#${cb.id}`, type: 'errorinfo-checkbox' };
        }
        const clickable = Array.from(document.querySelectorAll('a, span, button, div, td'));
        for (const el of clickable) {
          const text = el.textContent?.trim();
          if (text === 'Ignore warnings' || text === 'Ignora avvisi') {
            if (el.id) return { selector: `#${el.id}`, type: 'ignore-warnings' };
            el.click();
            return { selector: null, type: 'ignore-warnings-js' };
          }
        }
        return null;
      });

      // Helper: click save button
      const clickSaveButton = async (label) => {
        const clicked = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('a, span, div, li'));
          const el = els.find(e =>
            (e.textContent?.trim() === 'Salva e chiudi' || e.textContent?.trim() === 'Save and Close') &&
            e.offsetParent !== null,
          );
          if (el) { el.click(); return 'direct-text'; }
          const byId = document.querySelector('#Vertical_mainMenu_Menu_DXI1i1_T');
          if (byId) { byId.click(); return 'by-id'; }
          return false;
        });
        log(`  ${label}: ${clicked}`);
        if (clicked) {
          await wait(2000);
          await waitForDevExpressIdle(page, label, 8000);
        }
        return clicked;
      };

      // Helper: acknowledge DevExpress warning checkbox
      const clickWarningCheckbox = async () => {
        const result = await page.evaluate(() => {
          const input = document.querySelector('input[id$="_ErrorInfo_Ch_S"]');
          if (!input) return null;

          const uncheckedValue = input.value; // e.g. "U"
          const log = [];

          // Strategy 0: DevExpress registers each control as window[clientId]
          // ASPxCheckBox clientId = the hidden input's id (without _I suffix, checkboxes use plain id)
          const ctrlDirect = window[input.id];
          if (ctrlDirect && typeof ctrlDirect.SetChecked === 'function') {
            ctrlDirect.SetChecked(true);
            log.push(`window['${input.id}'].SetChecked(true) direct`);
          }

          // Strategy 1: use DevExpress ASPxClientControl API to call SetChecked(true)
          const w = window;
          const col = w.ASPxClientControl?.GetControlCollection?.();
          if (col) {
            col.ForEachControl(c => {
              try {
                const inputEl = c.GetInputElement?.();
                const mainEl = c.GetMainElement?.();
                if ((inputEl?.id === input.id) ||
                    (mainEl?.id && input.closest(`#${mainEl.id}`))) {
                  if (typeof c.SetChecked === 'function') {
                    c.SetChecked(true);
                    log.push('SetChecked(true) via API');
                  }
                  if (typeof c.RaiseCheckedChanged === 'function') {
                    c.RaiseCheckedChanged();
                    log.push('RaiseCheckedChanged()');
                  }
                }
              } catch {}
            });
          }

          // Strategy 2: simulate full mouse events on the wrapper span
          const wrapper = input.closest('span[id$="_ErrorInfo_Ch_S_D"]');
          if (wrapper) {
            ['mousedown', 'mouseup', 'click'].forEach(evtType => {
              const evt = new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window });
              wrapper.dispatchEvent(evt);
            });
            log.push('mouse events on wrapper');
          }

          // Strategy 3: simulate keyboard Space on the wrapper (triggers DevExpress checkbox toggle)
          if (wrapper) {
            wrapper.focus?.();
            const spaceEvt = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
            wrapper.dispatchEvent(spaceEvt);
            log.push('Space keydown on wrapper');
          }

          // Strategy 4: force-set the value to the expected "checked" variant
          // DevExpress ASPxCheckBox uses "T"=true, "U"=unchecked (or custom values)
          const checkedValue = uncheckedValue === 'U' ? 'T' : 'T';
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, checkedValue); else input.value = checkedValue;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          log.push(`force-set value to ${checkedValue}`);

          return {
            inputId: input.id,
            wrapperId: wrapper?.id ?? null,
            valueBefore: uncheckedValue,
            valueAfter: input.value,
            log,
          };
        });

        if (!result) {
          // Fallback: click "Ignore warnings" text
          const jsClicked = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('a, span, button, div, td'));
            for (const el of all) {
              const text = el.textContent?.trim();
              if ((text === 'Ignore warnings' || text === 'Ignora avvisi') && el.offsetParent !== null) {
                el.click();
                return true;
              }
            }
            return false;
          });
          log(`  Warning: no checkbox found, JS click: ${jsClicked}`);
          if (jsClicked) await wait(800);
          return jsClicked ? { type: 'ignore-warnings-js' } : null;
        }

        log(`  Checkbox acknowledgment`, result);
        await wait(800);
        await waitForDevExpressIdle(page, 'warning-ack', 3000);
        return result;
      };

      if (warningSelector) {
        log(`  Initial warning found`, warningSelector);
        results.issues.push(`Warning checkbox found: ${warningSelector.type}`);
        if (warningSelector.selector) {
          await page.click(warningSelector.selector);
          await wait(800);
          await waitForDevExpressIdle(page, 'warning-ack-1', 3000);
        }
        await screenshot(page, 'after-warning-click');

        // Loop: save → check warning → save up to 3 times
        for (let attempt = 1; attempt <= 3; attempt++) {
          const alreadyClosed = await page.evaluate(() => !window.location.href.includes('DetailView'));
          if (alreadyClosed) break;

          await clickSaveButton(`save-attempt-${attempt}`);
          await screenshot(page, `after-save-attempt-${attempt}`);

          const alreadyClosed2 = await page.evaluate(() => !window.location.href.includes('DetailView'));
          if (alreadyClosed2) break;

          const nextWarning = await clickWarningCheckbox();
          if (!nextWarning) {
            log(`  No more warnings at attempt ${attempt}`);
            break;
          }
          results.issues.push(`Warning checkbox attempt ${attempt + 1}: ${nextWarning.type}`);
        }
      } else {
        log('  No warning checkbox found — waiting for form to close naturally');
        await dumpAllFields(page, 'no-warning-state');
      }

      // ── STEP 20: Check result ───────────────────────────────────────────────
      step('20. Check result');

      // Wait for form to close (URL leaves DetailView), timeout 10s
      try {
        await page.waitForFunction(
          () => !window.location.href.includes('DetailView'),
          { timeout: 10000, polling: 200 },
        );
        results.formClosed = true;
      } catch {
        results.formClosed = false;
      }

      results.finalUrl = page.url();
      log(`  Final URL: ${results.finalUrl}`);
      log(`  Form closed: ${results.formClosed}`);

      if (!results.formClosed) {
        log('  ⚠ Form still open — dumping error state');
        await dumpAllFields(page, 'form-still-open');
        await screenshot(page, 'form-still-open-error');
      } else {
        // Try to read customer profile ID
        const profileId = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          const inp = inputs.find(i => /xaf_dviACCOUNTNUM_Edit_I$/.test(i.id));
          return inp?.value ?? null;
        });
        results.customerProfile = profileId;
        log(`  Customer profile ID: ${profileId}`);
        await screenshot(page, 'success-final');
      }
    }

  } catch (error) {
    log(`\n💥 FATAL ERROR: ${error.message}`);
    results.issues.push(`FATAL: ${error.message}`);
    try {
      await screenshot(page, 'crash');
      await dumpAllFields(page, 'crash-state');
    } catch {}
  } finally {
    await browser.close();

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n');
    log('══════════════════════════════════════════════════');
    log('SUMMARY');
    log('══════════════════════════════════════════════════');
    log(`Steps completed: ${results.steps.length}`);
    log(`Form closed: ${results.formClosed}`);
    log(`Customer profile: ${results.customerProfile ?? 'n/a'}`);
    log(`Issues found (${results.issues.length}):`, results.issues.length > 0 ? results.issues : ['none']);
    log(`Screenshots in: ${SCREENSHOT_DIR}`);
    log('══════════════════════════════════════════════════');

    if (results.issues.length > 0) {
      log('\n⚠ POTENTIAL FIXES NEEDED:');
      for (const issue of results.issues) {
        if (issue.includes('NAME mismatch') || issue.includes('NAME is empty')) {
          log('  → NAME field: investigate which step clears it (CAP/VAT callback race)');
        }
        if (issue.includes('Warning checkbox')) {
          log('  → Warning checkbox: Cellulare/URL vuoto — handle in saveAndCloseCustomer');
        }
        if (issue.includes('Hard validation')) {
          log('  → Hard validation error: check which field is empty (NAME? altro campo required?)');
        }
      }
    }

    process.exit(results.issues.some(i => i.includes('FATAL')) ? 1 : 0);
  }
}

main();

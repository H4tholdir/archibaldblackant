/**
 * dump-update-customer.mjs
 *
 * Script diagnostico per esplorare il flow di MODIFICA cliente in Archibald ERP.
 * Cliente di test: ID 55839 — Pescuma Dr. Saverio (P.IVA 01006500761, Venosa PZ)
 *
 * Obiettivi:
 *  1. Enumera TUTTE le opzioni combo (DLVMODE, SETTORE, PAYMTERMID, GRUPPO_PREZZO, SCONTO_LINEA)
 *  2. Studia Tab Prezzi e sconti: legge valori, cambia e verifica persistenza
 *  3. Studia Tab Indirizzo alternativo: legge righe, AddNewRow test, CancelEdit
 *  4. Studia il flusso di salvataggio + warning dialog in condizioni reali
 *  5. Studia i casi limite P.IVA su cliente con IVA già validata
 *  6. Documenta la strategia per Nome di Ricerca
 *
 * NOTA: Lo script MODIFICA il campo MEMO del cliente (da vuoto a "TEST DUMP") e lo ripristina.
 *
 * Uso:
 *   node scripts/dump-update-customer.mjs
 *
 * Output:
 *   /tmp/customer-field-dump/upd-NNN-<label>.png   — screenshot per ogni step
 *   /tmp/customer-field-dump/update-report.json    — tutti i findings strutturati
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch { /* dotenv opzionale */ }

// ─── Configurazione ───────────────────────────────────────────────────────────

const ARCHIBALD_URL   = (process.env.ARCHIBALD_URL     || 'https://4.231.124.90/Archibald').replace(/\/$/, '');
const ARCHIBALD_USER  = process.env.ARCHIBALD_USERNAME || process.env.ARCHIBALD_USER || 'ikiA0930';
const ARCHIBALD_PASS  = process.env.ARCHIBALD_PASSWORD || process.env.ARCHIBALD_PASS || 'Fresis26@';
const SCREENSHOT_DIR  = process.env.SCREENSHOT_DIR || '/tmp/customer-field-dump';
const REPORT_FILE     = path.join(SCREENSHOT_DIR, 'update-report.json');

// Cliente di test
const CUSTOMER_ID     = '55839';   // Pescuma Dr. Saverio, Venosa PZ
const CUSTOMER_URL    = `${ARCHIBALD_URL}/CUSTTABLE_DetailView/${CUSTOMER_ID}/`;

// Valore di test per il MEMO (ripristinato alla fine)
const MEMO_TEST_VALUE = 'TEST DUMP - script diagnostico';

// ─── Report ───────────────────────────────────────────────────────────────────

const report = {
  timestamp:    new Date().toISOString(),
  customerId:   CUSTOMER_ID,
  erpUrl:       ARCHIBALD_URL,
  fields:       {},
  comboOptions: {},
  autoFill:     {},
  timing:       {},
  saveFlow:     {},
  findings:     [],
};

function finding(category, msg) {
  const entry = { category, msg, ts: new Date().toISOString().slice(11, 23) };
  report.findings.push(entry);
  log(`  [${category}] ${msg}`);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

let shotIdx = 0;
function ts()  { return new Date().toISOString().slice(11, 23); }
function log(msg, data) {
  process.stdout.write(`[${ts()}] ${msg}\n`);
  if (data !== undefined) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function cssEscape(id) { return id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1'); }

async function shot(page, label) {
  const p = path.join(SCREENSHOT_DIR, `upd-${String(++shotIdx).padStart(3, '0')}-${label.replace(/[^a-z0-9]/gi, '-')}.png`);
  try   { await page.screenshot({ path: p, fullPage: true }); log(`📸 ${path.basename(p)}`); }
  catch (e) { log(`Screenshot fail: ${e.message}`); }
}

// ─── DevExpress wait ──────────────────────────────────────────────────────────

async function waitIdle(page, label = '', ms = 10000) {
  try {
    await page.waitForFunction(() => {
      const w = window;
      if (typeof w.ASPx !== 'undefined') {
        const pending = (w.ASPx._pendingCallbacks || 0)
                      + (w.ASPx._sendingRequests  || 0)
                      + (w.ASPx._pendingRequestCount || 0);
        if (pending > 0) return false;
      }
      const col = w.ASPxClientControl?.GetControlCollection?.();
      if (col) {
        let busy = false;
        try { col.ForEachControl(c => { if (c?.InCallback?.()) busy = true; }); } catch {}
        if (busy) return false;
      }
      return true;
    }, { timeout: ms, polling: 150 });
  } catch { log(`  waitIdle timeout (${label})`); }
}

async function waitReady(page, ms = 15000) {
  try {
    await page.waitForFunction(() =>
      document.readyState === 'complete' &&
      typeof window.ASPxClientControl !== 'undefined',
    { timeout: ms, polling: 200 });
    await waitIdle(page, 'ready', ms);
  } catch { log('  waitReady timeout'); }
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

async function snapshot(page) {
  return page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('input, textarea')) {
      if (el.offsetParent !== null && el.id) out[el.id] = el.value ?? '';
    }
    return out;
  });
}

function diff(before, after) {
  const changed = {};
  for (const [k, v] of Object.entries(after)) {
    if (before[k] !== v) changed[k] = { before: before[k] ?? '(assente)', after: v };
  }
  return changed;
}

// ─── Campo discovery ──────────────────────────────────────────────────────────

async function discover(page, idRegex) {
  return page.evaluate(re => {
    const pat = new RegExp(re);
    return Array.from(document.querySelectorAll('input, textarea, select'))
      .filter(el => el.offsetParent !== null && pat.test(el.id))
      .map(el => ({
        id:        el.id,
        tagName:   el.tagName,
        type:      el.type || el.tagName.toLowerCase(),
        maxLength: el.maxLength > 0 ? el.maxLength : null,
        value:     (el.value || '').substring(0, 120),
        readOnly:  el.readOnly || false,
        disabled:  el.disabled || false,
      }));
  }, idRegex.source || String(idRegex));
}

// ─── DevExpress field interaction ─────────────────────────────────────────────

async function typeField(page, idRegex, value, { waitAfterMs = 800 } = {}) {
  const inputId = await page.evaluate(re => {
    const pat = new RegExp(re);
    const el = Array.from(document.querySelectorAll('input, textarea'))
      .find(i => i.offsetParent !== null && pat.test(i.id));
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.click();
    if (typeof el.select === 'function') el.select();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, ''); else el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.id;
  }, idRegex.source || String(idRegex));

  if (!inputId) return { found: false, id: null };

  await page.type(`#${cssEscape(inputId)}`, value, { delay: 5 });
  await page.keyboard.press('Tab');
  await wait(waitAfterMs);
  await waitIdle(page, `type-${inputId}`, 8000);

  const actual = await page.evaluate(id => document.getElementById(id)?.value ?? '', inputId);
  if (actual !== value) {
    // Secondo tentativo
    await page.evaluate(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.focus(); el.select?.();
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, ''); else el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, inputId);
    await page.type(`#${cssEscape(inputId)}`, value, { delay: 5 });
    await page.keyboard.press('Tab');
    await wait(waitAfterMs);
    await waitIdle(page, `type-retry-${inputId}`, 8000);
  }

  const finalVal = await page.evaluate(id => document.getElementById(id)?.value ?? '', inputId);
  return { found: true, id: inputId, value: finalVal, ok: finalVal === value };
}

async function clearField(page, idRegex) {
  return typeField(page, idRegex, ' ', { waitAfterMs: 500 })
    .then(async () => {
      // Svuota del tutto con property descriptor
      await page.evaluate(re => {
        const pat = new RegExp(re);
        const el = Array.from(document.querySelectorAll('input, textarea')).find(i => pat.test(i.id));
        if (!el) return;
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, ''); else el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, idRegex.source || String(idRegex));
    });
}

/**
 * Enumera le opzioni di un combobox DevExpress con caricamento lazy.
 * 1. Tenta GetItemCount/GetItem direttamente (se già caricate)
 * 2. Se vuoto: ShowDropDown() + waitIdle per forzare caricamento + riprova API
 * 3. Fallback: legge DOM della lista aperta
 */
async function enumComboOptions(page, idRegex) {
  const reStr = idRegex.source || String(idRegex);

  const readViaApi = () => page.evaluate(re => {
    const pat = new RegExp(re);
    const input = Array.from(document.querySelectorAll('input'))
      .find(i => i.offsetParent !== null && pat.test(i.id));
    if (!input) return null;
    const col = window.ASPxClientControl?.GetControlCollection?.();
    if (!col) return [];
    const items = [];
    col.ForEachControl(c => {
      if (items.length) return;
      try {
        const direct   = c.GetInputElement?.()?.id === input.id;
        const contains = !direct && c.GetMainElement?.()?.contains(input) && typeof c.GetItemCount === 'function';
        if (!direct && !contains) return;
        if (typeof c.GetItemCount !== 'function') return;
        const n = c.GetItemCount();
        for (let i = 0; i < n; i++) {
          const item = c.GetItem?.(i);
          if (item?.text != null) items.push(item.text);
        }
      } catch {}
    });
    return items;
  }, reStr);

  const direct = await readViaApi();
  if (direct === null) return [];
  if (direct.length > 0) return direct;

  // Lazy: triggera ShowDropDown per forzare caricamento opzioni
  const triggered = await page.evaluate(re => {
    const pat = new RegExp(re);
    const input = Array.from(document.querySelectorAll('input'))
      .find(i => i.offsetParent !== null && pat.test(i.id));
    if (!input) return false;
    const col = window.ASPxClientControl?.GetControlCollection?.();
    if (!col) return false;
    let done = false;
    col.ForEachControl(c => {
      if (done) return;
      try {
        const d = c.GetInputElement?.()?.id === input.id;
        const cont = !d && c.GetMainElement?.()?.contains(input);
        if (!d && !cont) return;
        if (typeof c.ShowDropDown === 'function') { c.ShowDropDown(); done = true; }
      } catch {}
    });
    if (!done) {
      let btnId = input.id.replace(/_DD_I$/, '_DD_B');
      if (btnId === input.id) btnId = input.id.replace(/_I$/, '_B');
      const btn = document.getElementById(btnId) ?? input.closest('td,tr')?.querySelector('[id$="_DD_B"],[id$="_B"]');
      if (btn) { btn.click(); done = true; }
    }
    return done;
  }, reStr);

  if (!triggered) return [];

  await waitIdle(page, `enum-lazy`, 5000);
  await wait(300);

  const afterLoad = await readViaApi();
  if (afterLoad && afterLoad.length > 0) {
    await page.keyboard.press('Escape');
    await wait(300);
    return afterLoad;
  }

  const domItems = await page.evaluate(() => {
    for (const sel of ['.dxeListBoxItem_XafTheme','[class*="dxeListBoxItem"]','[id*="_DDD_L_LBT"] td','[id*="_DDLB"] li']) {
      const items = Array.from(document.querySelectorAll(sel))
        .filter(el => el.offsetParent !== null)
        .map(el => el.textContent?.trim()).filter(Boolean);
      if (items.length) return items;
    }
    return [];
  });
  await page.keyboard.press('Escape');
  await wait(300);
  return domItems;
}

async function setCombo(page, idRegex, value) {
  const result = await page.evaluate((re, val) => {
    const pat = new RegExp(re);
    const input = Array.from(document.querySelectorAll('input'))
      .find(i => i.offsetParent !== null && pat.test(i.id));
    if (!input) return { found: false };
    input.scrollIntoView({ block: 'center' });

    const col = window.ASPxClientControl?.GetControlCollection?.();
    if (col) {
      let combo = null;
      col.ForEachControl(c => {
        if (combo) return;
        try {
          if (c.GetInputElement?.()?.id === input.id) combo = c;
          else {
            const main = c.GetMainElement?.();
            if (main?.contains(input) && typeof c.SetSelectedIndex === 'function') combo = c;
          }
        } catch {}
      });
      if (combo) {
        if (typeof combo.GetItemCount === 'function') {
          const n = combo.GetItemCount();
          for (let i = 0; i < n; i++) {
            const text = combo.GetItem?.(i)?.text;
            if (text === val) { combo.SetSelectedIndex(i); return { found: true, method: 'SetSelectedIndex', text }; }
          }
        }
        if (typeof combo.SetText === 'function') { combo.SetText(val); return { found: true, method: 'SetText' }; }
        if (typeof combo.SetValue === 'function') { combo.SetValue(val); return { found: true, method: 'SetValue' }; }
      }
    }
    return { found: false, inputId: input.id };
  }, idRegex.source || String(idRegex), value);
  await waitIdle(page, `combo-${value}`, 5000);
  return result;
}

/**
 * Apre la tab di un form DevExpress tramite il testo del tab link.
 */
async function openTab(page, tabText) {
  const aliases = {
    'Principale':       ['Principale', 'Main'],
    'Prezzi e sconti':  ['Prezzi e sconti', 'Price', 'Prices and Discounts', 'Prezzi'],
    'Indirizzo alt':    ['Indirizzo alt', 'Alt. address', 'Alt. Address', 'Indirizzo'],
  };
  const candidates = aliases[tabText] || [tabText];
  for (const cand of candidates) {
    const clicked = await page.evaluate(text => {
      for (const el of document.querySelectorAll('a.dxtc-link, span.dx-vam')) {
        if (el.textContent?.trim().includes(text) && el.offsetParent !== null) {
          (el.tagName === 'A' ? el : el.parentElement)?.click();
          return true;
        }
      }
      for (const tab of document.querySelectorAll('li[id*="_pg_AT"]')) {
        const lnk = tab.querySelector('a.dxtc-link');
        const spn = tab.querySelector('span.dx-vam');
        if (spn?.textContent?.trim().includes(text) && lnk?.offsetParent !== null) {
          lnk.click(); return true;
        }
      }
      return false;
    }, cand);
    if (clicked) { await waitIdle(page, `tab-${cand}`, 6000); return true; }
  }
  log(`  ⚠️  Tab "${tabText}" non trovata`);
  return false;
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(page) {
  log('→ Login...');
  await page.goto(`${ARCHIBALD_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });

  if (!page.url().toLowerCase().includes('login')) { log('  Già autenticato'); return; }

  const userInputId = await page.evaluate(() => {
    const textInputs = Array.from(document.querySelectorAll('input'))
      .filter(i => i.type !== 'hidden' && i.type !== 'submit' && i.type !== 'button' && i.type !== 'password');
    const uField = textInputs.find(i =>
      i.id.includes('UserName') || i.name.includes('UserName') ||
      i.placeholder?.toLowerCase().includes('account') ||
      i.placeholder?.toLowerCase().includes('username')
    ) || textInputs[0];
    if (uField) { uField.scrollIntoView(); uField.focus(); }
    return uField?.id ?? null;
  });
  if (!userInputId) throw new Error('Campo username non trovato');

  await page.evaluate(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, ''); else el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, userInputId);
  await page.type(`#${cssEscape(userInputId)}`, ARCHIBALD_USER, { delay: 30 });
  await page.keyboard.press('Tab');
  await waitIdle(page, 'login-user', 5000);

  const pwdInputId = await page.evaluate(() => {
    const pField = document.querySelector('input[type="password"]');
    if (pField) { pField.scrollIntoView(); pField.focus(); }
    return pField?.id ?? null;
  });
  if (!pwdInputId) throw new Error('Campo password non trovato');

  await page.evaluate(id => {
    const el = document.getElementById(id);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, ''); else el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, pwdInputId);
  await page.type(`#${cssEscape(pwdInputId)}`, ARCHIBALD_PASS, { delay: 30 });
  await page.keyboard.press('Tab');
  await waitIdle(page, 'login-pass', 5000);

  const submitClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"], a, button'))
      .find(el => el.offsetParent !== null && /accedi|login|sign in|entra/i.test(el.textContent + (el.value || '')));
    if (btn) { btn.click(); return true; }
    const fallback = document.querySelector('input[type="submit"]');
    if (fallback) { fallback.click(); return true; }
    return false;
  });
  if (!submitClicked) await page.keyboard.press('Enter');

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  if (page.url().toLowerCase().includes('login')) throw new Error('Login fallito');
  log('  Login OK → ' + page.url());
}

// ─── Entrata in edit mode ──────────────────────────────────────────────────────

async function openCustomerEdit(page, customerId) {
  log(`\n── Apertura cliente ${customerId} in edit mode ──`);
  await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_DetailView/${customerId}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitReady(page, 15000);
  await shot(page, '00-view-mode');
  log('  View mode: ' + page.url());

  // Clicca il bottone di modifica (matita / "Modifica" / "Edit")
  const editClicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('a, button, input[type="button"]'))
      .filter(el => el.offsetParent !== null);
    const btn = candidates.find(el =>
      /modif|edit/i.test(el.title ?? '') ||
      /modif|edit/i.test(el.textContent?.trim() ?? '') ||
      el.className?.includes('EditAction') ||
      el.id?.includes('EditAction')
    );
    if (btn) { btn.click(); return btn.id || btn.textContent?.trim() || 'found'; }

    // Fallback: primo link nella toolbar con icona matita
    const toolbarBtn = document.querySelector('a[id*="Edit"], a[title*="Modif"], a[title*="Edit"]');
    if (toolbarBtn) { toolbarBtn.click(); return toolbarBtn.id; }
    return null;
  });

  if (!editClicked) {
    // Fallback: naviga direttamente all'URL ?mode=Edit
    log('  Bottone edit non trovato, navigazione diretta...');
    await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_DetailView/${customerId}/?mode=Edit`, { waitUntil: 'networkidle2', timeout: 30000 });
  } else {
    log(`  Edit button: "${editClicked}"`);
    await page.waitForFunction(() => window.location.href.includes('mode=Edit') ||
      document.querySelector('input[id$="Save_Button"], a[id*="SaveAndClose"]') !== null,
    { timeout: 10000, polling: 300 }).catch(() => {});
  }

  await waitReady(page, 15000);
  await shot(page, '01-edit-mode');
  log('  Edit mode: ' + page.url());
}

// ─── Lettura valori attuali ────────────────────────────────────────────────────

async function readCurrentFieldValues(page) {
  return page.evaluate(() => {
    const result = {};
    for (const el of document.querySelectorAll('input, textarea, select')) {
      if (el.offsetParent !== null && el.id && !el.id.includes('EditorClientInfo')) {
        result[el.id] = {
          value:    (el.value || '').substring(0, 200),
          readOnly: el.readOnly || false,
          disabled: el.disabled || false,
          type:     el.type || el.tagName.toLowerCase(),
          maxLen:   el.maxLength > 0 ? el.maxLength : null,
        };
      }
    }
    return result;
  });
}

// ─── Save & close ─────────────────────────────────────────────────────────────

async function saveAndClose(page) {
  log('  → click "Salva e chiudi"...');
  const t0 = Date.now();

  const clicked = await page.evaluate(() => {
    // XAF salva: cerca per testo, title, id o classe specifica
    const all = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"]'))
      .filter(el => el.offsetParent !== null);
    const btn = all.find(el => {
      const text = (el.textContent || '').trim();
      const title = el.title || '';
      const id = el.id || '';
      return /salva\s*e\s*chiudi/i.test(text + title) ||
             /save.*close/i.test(text + title) ||
             /SaveAndClose/i.test(id) ||
             id.endsWith('_SaveAndClose_Button') ||
             /^salvar[ei]?$/i.test(text) ||   // "Salvare" o "Salva" (ERP v2 senza "e chiudi")
             title === 'Salvare' || title === 'Save';
    });
    if (btn) { btn.click(); return btn.id || btn.textContent?.trim() || 'clicked'; }
    return null;
  });
  if (!clicked) {
    finding('SAVE', '⚠️  Bottone "Salva e chiudi" non trovato — dump tutti i pulsanti visibili:');
    const allBtns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a, button, input[type="button"]'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({ id: el.id, text: el.textContent?.trim()?.substring(0, 40), title: el.title }))
        .filter(el => el.id || el.text)
        .slice(0, 20)
    );
    log('  Pulsanti visibili:', allBtns);
    report.saveFlow['buttons_visible'] = allBtns;
    return false;
  }
  log(`  Save button clicked: "${clicked}"`);

  // Aspetta 2.5s poi cerca warning checkbox
  await wait(2500);
  await waitIdle(page, 'after-save', 5000);

  // Gestione warning checkbox (campo con "ErrorInfo")
  const warningHandled = await page.evaluate(() => {
    const chk = document.querySelector('input[id$="_ErrorInfo_Ch_S"]');
    if (!chk || chk.offsetParent === null) return false;
    const col = window.ASPxClientControl?.GetControlCollection?.();
    if (col) {
      let handled = false;
      col.ForEachControl(c => {
        if (handled) return;
        try {
          const main = c.GetMainElement?.();
          if (main?.contains(chk) && typeof c.SetChecked === 'function') {
            c.SetChecked(true); handled = true;
          }
        } catch {}
      });
      if (handled) return true;
    }
    // Fallback native
    try { chk.click(); return true; } catch { return false; }
  });

  if (warningHandled) {
    log('  ⚠️  Warning checkbox trovato e spuntato');
    await wait(500);
    // Reclicca salva — stesso selettore della prima volta (include title="Salvare")
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"]'))
        .filter(el => el.offsetParent !== null);
      const btn = all.find(el => {
        const text = (el.textContent || '').trim();
        const title = el.title || '';
        const id = el.id || '';
        return /salva\s*e\s*chiudi/i.test(text + title) ||
               /save.*close/i.test(text + title) ||
               /SaveAndClose/i.test(id) ||
               id.endsWith('_SaveAndClose_Button') ||
               /^salvar[ei]?$/i.test(text) ||
               title === 'Salvare' || title === 'Save';
      });
      btn?.click();
    });
    await wait(2500);
    await waitIdle(page, 'after-save-retry', 8000);
  }

  // Gestione modale "Fondersi" (conflitto di versione)
  const fondersiHandled = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a, button'))
      .find(el => el.offsetParent !== null && /fonder|merge/i.test(el.textContent || ''));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (fondersiHandled) {
    log('  ⚠️  Modale "Fondersi" gestita');
    await wait(2000);
    await waitIdle(page, 'after-fondersi', 8000);
  }

  // Aspetta ritorno a view mode o qualsiasi navigazione (max 20s)
  try {
    await page.waitForFunction(() => !window.location.href.includes('mode=Edit'), { timeout: 20000, polling: 300 });
  } catch {
    log('  ⚠️  ERP rimasto in edit mode dopo save — potrebbe essere comportamento normale');
  }

  const saveMs = Date.now() - t0;
  log(`  Save completato in ${saveMs}ms. URL: ${page.url()}`);
  return { clicked, warningHandled, fondersiHandled, saveMs };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  log('══════════════════════════════════════════');
  log('  CUSTOMER UPDATE DUMP');
  log(`  Cliente: ${CUSTOMER_ID} — Pescuma Dr. Saverio`);
  log(`  ERP:  ${ARCHIBALD_URL}`);
  log(`  User: ${ARCHIBALD_USER}`);
  log(`  Dir:  ${SCREENSHOT_DIR}`);
  log('══════════════════════════════════════════');

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 60,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    // ── 0. Login ─────────────────────────────────────────────────────────────
    await login(page);

    // ── 1. Apri il cliente in edit mode ──────────────────────────────────────
    await openCustomerEdit(page, CUSTOMER_ID);

    // ── 2. Leggi tutti i campi in edit mode (baseline) ────────────────────────
    log('\n══ STEP 2: BASELINE CAMPI IN EDIT MODE ══');
    const baseline = await readCurrentFieldValues(page);
    report.fields['_baseline_edit'] = baseline;
    log(`  ${Object.keys(baseline).length} campi trovati in edit mode`);

    // ── 3. Studia stato P.IVA ─────────────────────────────────────────────────
    log('\n══ STEP 3: STUDIO STATO P.IVA ══');
    const vatState = await page.evaluate(() => {
      const byPattern = (re) => {
        const pat = new RegExp(re, 'i');
        const el = Array.from(document.querySelectorAll('input, textarea'))
          .find(i => pat.test(i.id));
        return el ? { id: el.id, value: el.value, readOnly: el.readOnly } : null;
      };
      return {
        vatNum:           byPattern(/VATNUM.*_I$/),
        vatValidated:     byPattern(/VATVALI[EE]D.*_I$/),    // VATVALIDE o VATVALIEDE (doppia E)
        vatLastCheck:     byPattern(/VATLASTCHECKED.*_I$/),
        vatAddress:       byPattern(/VATADDRESS.*_I$/),
        fiscalCode:       byPattern(/dviFISCALCODE_Edit_I$/),
        fiscalValidated:  byPattern(/FISCALCODEVALID.*_I$/),
        fiscalLastCheck:  byPattern(/FISCALCODELASTCHECK.*_I$/),
      };
    });
    report.fields['vatState'] = vatState;
    log('  Stato P.IVA:', vatState);

    finding('PIVA', `P.IVA: "${vatState.vatNum?.value}" (readOnly=${vatState.vatNum?.readOnly})`);
    finding('PIVA', `IVA Validata: "${vatState.vatValidated?.value}" (readOnly=${vatState.vatValidated?.readOnly})`);
    finding('PIVA', `Ultimo controllo: "${vatState.vatLastCheck?.value}"`);
    finding('PIVA', `CF: "${vatState.fiscalCode?.value}" (readOnly=${vatState.fiscalCode?.readOnly})`);
    finding('PIVA', `Indirizzo IVA: "${vatState.vatAddress?.value?.substring(0, 80)}"`);

    // Casi limite documentati:
    finding('PIVA_EDGECASES', 'CASO A — P.IVA valida con dati registro: CF+PEC+indirizzo auto-fill (~20s). Attende waitForVatCallback(28s).');
    finding('PIVA_EDGECASES', 'CASO B — P.IVA valida senza dati registro: VATVALIDE="Sì" ma CF/PEC/indirizzo vuoti. Bot deve digitare CF e PEC manualmente.');
    finding('PIVA_EDGECASES', 'CASO C — P.IVA non valida (formato corretto ma non in registro): VATVALIDE="No". ERP consente salvataggio ma mostra warning → bot deve spuntare il checkbox.');
    finding('PIVA_EDGECASES', 'CASO D — P.IVA formato errato: ERP mostra errore immediato in rosso. VATVALIDE resta "No". Bot deve procedere con warning.');
    finding('PIVA_EDGECASES', 'CASO E — P.IVA API timeout: VATVALIDE non cambia dopo 28s. Bot considera non validata e procede.');
    finding('PIVA_EDGECASES', 'CASO F — P.IVA obbligatoria: se vuota, save produce errore di validazione ERP non dismissibile. Il bot non può procedere senza P.IVA.');
    finding('PIVA_EDGECASES', 'STRATEGIA: dopo typeField(VATNUM), aspetta max 28s con waitForVatCallback(). Poi legge snap diff → gestisce ogni caso in base ai campi auto-compilati.');

    // Studia se il campo P.IVA è modificabile (può causare re-trigger validazione)
    if (!vatState.vatNum?.readOnly) {
      finding('PIVA', 'ATTENZIONE: P.IVA è modificabile in edit mode → modificarla re-triggera la validazione con attesa 20s+');
      finding('PIVA', 'STRATEGIA BOT: cambia P.IVA solo se effettivamente diversa. Confronta con valore DB prima di scrivere.');
    }

    await shot(page, '02-piva-state');

    // ── 4. Enumera opzioni combo — Tab Principale ─────────────────────────────
    log('\n══ STEP 4: ENUM COMBO OPTIONS — TAB PRINCIPALE ══');

    // DLVMODE
    const dlvmodeOpts = await enumComboOptions(page, /DLVMODE.*_DD_I$/);
    report.comboOptions['dlvmode'] = dlvmodeOpts;
    finding('DLVMODE', `Opzioni (${dlvmodeOpts.length}): ${dlvmodeOpts.join(' | ')}`);

    const dlvmodeCurrent = await discover(page, /DLVMODE.*_DD_I$/);
    finding('DLVMODE', `Valore attuale: "${dlvmodeCurrent[0]?.value}"`);

    // SETTORE (BUSINESSSECTORID)
    const settoreOpts = await enumComboOptions(page, /BUSINESSSECTORID.*_DD_I$/);
    report.comboOptions['settore'] = settoreOpts;
    finding('SETTORE', `Opzioni (${settoreOpts.length}): ${settoreOpts.join(' | ')}`);

    const settoreCurrent = await discover(page, /BUSINESSSECTORID.*_DD_I$/);
    finding('SETTORE', `Valore attuale: "${settoreCurrent[0]?.value}"`);

    // PAYMTERMID — lookup field (non combo, usa dialog)
    const paymFields = await discover(page, /PAYMTERMID.*_I$/);
    const paymBtnB0  = await discover(page, /PAYMTERMID.*_B0$/);
    const paymBtnB   = await discover(page, /PAYMTERMID.*_B$/);
    const paymBtnNear = await page.evaluate(re => {
      const pat = new RegExp(re);
      const input = Array.from(document.querySelectorAll('input')).find(i => pat.test(i.id));
      if (!input) return null;
      const row = input.closest('tr') || input.closest('td') || input.parentElement;
      // Buttons in this ERP are IMG elements with suffix _B0Img or anchor _B0
      const btn = row?.querySelector('img[id$="_B0Img"], a[id$="_B0"], button[id$="_B0"], img[id$="_B0"]');
      return btn ? { id: btn.id, tagName: btn.tagName } : null;
    }, /PAYMTERMID.*_I$/.source);

    // Cerca il pulsante anche tra elementi non-input (a, button, img, div)
    const paymBtnWide = await page.evaluate(re => {
      const pat = new RegExp(re, 'i');
      return Array.from(document.querySelectorAll('a, button, img, input'))
        .filter(el => el.offsetParent !== null && pat.test(el.id || ''))
        .map(el => ({ id: el.id, tagName: el.tagName, title: el.title }));
    }, 'PAYMTERMID');

    report.fields['paymtermid'] = { input: paymFields, btnB0: paymBtnB0, btnB: paymBtnB, btnNear: paymBtnNear, btnWide: paymBtnWide };
    finding('PAYMTERM', `Input: "${paymFields[0]?.id}" value="${paymFields[0]?.value?.substring(0, 60)}"`);
    finding('PAYMTERM', `Find button _B0: ${JSON.stringify(paymBtnB0[0] ?? null)}`);
    finding('PAYMTERM', `Find button _B: ${JSON.stringify(paymBtnB[0] ?? null)}`);
    finding('PAYMTERM', `Find button near input: ${JSON.stringify(paymBtnNear)}`);
    finding('PAYMTERM', `Tutti elementi con PAYMTERMID nel DOM: ${JSON.stringify(paymBtnWide)}`);

    await shot(page, '03-principale-combos');

    // ── 5. NOME DI RICERCA — Studio e strategia ───────────────────────────────
    log('\n══ STEP 5: NOME DI RICERCA — STRATEGIA ══');

    const searchnameFields = await discover(page, /NAMEALIAS.*_I$|SEARCHNAME.*_I$/);
    const nameFields       = await discover(page, /dviNAME_Edit_I$/);
    report.fields['searchname'] = searchnameFields;

    const sn = searchnameFields[0];
    const nm = nameFields[0];
    finding('SEARCHNAME', `id="${sn?.id}"  maxLength=${sn?.maxLength}  value="${sn?.value}"  readOnly=${sn?.readOnly}`);
    finding('SEARCHNAME', `NAME id="${nm?.id}"  maxLength=${nm?.maxLength}  value="${nm?.value}"`);

    if (sn && nm) {
      const nameLen = nm.value.length;
      const snMaxLen = sn.maxLength ?? 20;
      finding('SEARCHNAME', `Nome lunghezza: ${nameLen} | SEARCHNAME maxLength: ${snMaxLen}`);

      if (nameLen <= snMaxLen) {
        finding('SEARCHNAME', 'STRATEGIA A [applicabile]: nome ≤ maxLength → ERP imposta SEARCHNAME = nome completo → NON sovrascrivere');
      } else {
        // Calcola il truncamento intelligente: ultima parola completa entro maxLength
        const words = nm.value.split(/\s+/);
        let best = '';
        for (const w of words) {
          const candidate = best ? `${best} ${w}` : w;
          if (candidate.length <= snMaxLen) best = candidate;
          else break;
        }
        finding('SEARCHNAME', `STRATEGIA B [applicabile]: nome > maxLength → ERP tronca a "${nm.value.substring(0, snMaxLen)}" (mid-word)`);
        finding('SEARCHNAME', `ALTERNATIVA SMART: ultima parola completa entro ${snMaxLen} = "${best}"`);
        finding('SEARCHNAME', `RACCOMANDAZIONE: sovrascrivere con la versione smart; aggiungere campo "searchname" al DB per permettere valore custom`);
      }
    }
    finding('SEARCHNAME', 'REGOLA GENERALE: lascia auto-fill ERP, poi sovrascivi con ultima-parola-completa se il nome è stato troncato (è overrideable confermato)');

    await shot(page, '04-searchname');

    // ── 6. TAB PREZZI E SCONTI ────────────────────────────────────────────────
    log('\n══ STEP 6: TAB PREZZI E SCONTI ══');
    const tabPrezziOpened = await openTab(page, 'Prezzi e sconti');
    finding('TAB_PREZZI', `Tab aperta: ${tabPrezziOpened}`);
    await shot(page, '05-tab-prezzi-sconti');

    // 6a. Leggi tutti i campi visibili nella tab
    const prezziFields = await readCurrentFieldValues(page);
    const prezziVisible = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input, select, textarea'))
        .filter(el => el.offsetParent !== null && el.id && !el.id.includes('EditorClientInfo'))
        .map(el => ({ id: el.id, value: (el.value || '').substring(0, 80), readOnly: el.readOnly }))
    );
    report.fields['prezziScontiTab'] = prezziVisible;
    log('  Campi visibili in Tab Prezzi e sconti:', prezziVisible);

    // 6b. GRUPPO PREZZO — enumera opzioni
    const gpOpts = await enumComboOptions(page, /PRICEGROUP.*_DD_I$/);
    report.comboOptions['gruppoPrezzo'] = gpOpts;
    const gpCurrent = await discover(page, /PRICEGROUP.*_DD_I$/);
    finding('GRUPPO_PREZZO', `Opzioni (${gpOpts.length}): ${gpOpts.join(' | ')}`);
    finding('GRUPPO_PREZZO', `Valore attuale: "${gpCurrent[0]?.value}"`);

    // 6c. SCONTO LINEA — enumera opzioni
    const slOpts = await enumComboOptions(page, /LINEDISC.*_DD_I$/);
    report.comboOptions['scontoLinea'] = slOpts;
    const slCurrent = await discover(page, /LINEDISC.*_DD_I$/);
    const originalSL = slCurrent[0]?.value ?? '';
    finding('SCONTO_LINEA', `Opzioni (${slOpts.length}): ${slOpts.join(' | ')}`);
    finding('SCONTO_LINEA', `Valore attuale: "${originalSL}"`);

    await shot(page, '06-prezzi-sconti-letti');

    // 6d. Cambia SCONTO LINEA a un valore diverso per testare il write
    if (slOpts.length > 0) {
      const targetSL = slOpts.find(o => o !== originalSL) ?? slOpts[0];
      log(`  Cambio SCONTO_LINEA da "${originalSL}" a "${targetSL}"...`);
      const setResult = await setCombo(page, /LINEDISC.*_DD_I$/, targetSL);
      finding('SCONTO_LINEA', `Test set a "${targetSL}": ${JSON.stringify(setResult)}`);
      await shot(page, '07-sconto-linea-cambiato');

      // Leggi il valore effettivo dopo il set
      const slAfter = await discover(page, /LINEDISC.*_DD_I$/);
      finding('SCONTO_LINEA', `Valore dopo set: "${slAfter[0]?.value}" (atteso: "${targetSL}")`);

      // Testa anche un secondo valore se disponibile (per confermare la selezione)
      if (slOpts.length > 1) {
        const targetSL2 = slOpts.find(o => o !== targetSL) ?? slOpts[0];
        const setResult2 = await setCombo(page, /LINEDISC.*_DD_I$/, targetSL2);
        finding('SCONTO_LINEA', `Test set a "${targetSL2}": ${JSON.stringify(setResult2)}`);
      }

      // Ripristina il valore originale per non sporcare il cliente
      if (originalSL) {
        const restoreResult = await setCombo(page, /LINEDISC.*_DD_I$/, originalSL);
        finding('SCONTO_LINEA', `Ripristino a "${originalSL}": ${JSON.stringify(restoreResult)}`);
      }
    }

    // 6e. GRUPPO PREZZO — cambia e ripristina
    if (gpOpts.length > 1) {
      const gpOriginal = gpCurrent[0]?.value ?? '';
      const gpTarget = gpOpts.find(o => o !== gpOriginal) ?? gpOpts[0];
      log(`  Cambio GRUPPO_PREZZO da "${gpOriginal}" a "${gpTarget}"...`);
      const gpSet = await setCombo(page, /PRICEGROUP.*_DD_I$/, gpTarget);
      finding('GRUPPO_PREZZO', `Test set a "${gpTarget}": ${JSON.stringify(gpSet)}`);
      await shot(page, '08-gruppo-prezzo-cambiato');

      // Ripristina
      const gpRestore = await setCombo(page, /PRICEGROUP.*_DD_I$/, gpOriginal);
      finding('GRUPPO_PREZZO', `Ripristino a "${gpOriginal}": ${JSON.stringify(gpRestore)}`);
    } else {
      finding('GRUPPO_PREZZO', 'Una sola opzione disponibile — nessun test di cambio effettuato');
    }

    // 6f. ENDDISCOUNT — campo aggiuntivo in Tab Prezzi e sconti
    const endDiscOpts = await enumComboOptions(page, /ENDDISC.*_DD_I$/);
    report.comboOptions['endDiscount'] = endDiscOpts;
    const endDiscCurrent = await discover(page, /ENDDISC.*_DD_I$/);
    finding('END_DISC', `id="${endDiscCurrent[0]?.id}"  valore="${endDiscCurrent[0]?.value}"  opzioni (${endDiscOpts.length}): ${endDiscOpts.join(' | ')}`);

    // 6g. Cerca tutti gli altri campi nella tab (per scoprire campi nascosti)
    const extraPrezzi = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input, textarea'))
        .filter(el => el.offsetParent !== null && el.id &&
          !el.id.includes('EditorClientInfo') &&
          !/(PRICEGROUP|LINEDISC|ENDDISC)/i.test(el.id))
        .map(el => ({ id: el.id, value: (el.value || '').substring(0, 80), readOnly: el.readOnly }))
    );
    finding('TAB_PREZZI', `Altri campi nella tab: ${extraPrezzi.length > 0 ? extraPrezzi.map(f => `${f.id}="${f.value}"`).join(' | ') : 'nessuno'}`);

    // ── 7. TAB INDIRIZZO ALTERNATIVO ──────────────────────────────────────────
    log('\n══ STEP 7: TAB INDIRIZZO ALTERNATIVO ══');
    const tabIndirizzoOpened = await openTab(page, 'Indirizzo alt');
    finding('ALT_ADDR', `Tab aperta: ${tabIndirizzoOpened}`);
    await shot(page, '09-tab-indirizzo-alt');

    // 7a. Leggi righe esistenti
    const existingRows = await page.evaluate(() => {
      const grid = Array.from(document.querySelectorAll('table[id*="ADDRESSes"]')).find(t => t.offsetParent !== null);
      if (!grid) return [];
      return Array.from(grid.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[id*="DXDataRow"]'))
        .map(row => {
          const cells = Array.from(row.querySelectorAll('td'))
            .map(td => td.textContent?.trim())
            .filter(Boolean);
          return cells;
        });
    });
    report.fields['altAddrRows'] = existingRows;
    finding('ALT_ADDR', `Righe esistenti: ${existingRows.length}`);
    if (existingRows.length > 0) {
      existingRows.forEach((row, i) => finding('ALT_ADDR', `  Riga ${i}: ${row.join(' | ')}`));
    }

    // 7b. Scopri il nome del controllo griglia
    const gridInfo = await page.evaluate(() => {
      const col = window.ASPxClientControl?.GetControlCollection?.();
      if (!col) return null;
      const grids = [];
      col.ForEachControl(c => {
        try {
          if (typeof c.AddNewRow === 'function' && typeof c.CancelEdit === 'function') {
            const el = c.GetMainElement?.();
            grids.push({ id: el?.id ?? 'unknown', name: c.name ?? '?' });
          }
        } catch {}
      });
      return grids;
    });
    report.fields['altAddrGrid'] = gridInfo;
    finding('ALT_ADDR', `Grid controls: ${JSON.stringify(gridInfo)}`);

    // 7c. Cerca il bottone "Nuovo" specifico della toolbar della griglia ADDRESSes
    // (NON il bottone globale "Nuovo" del form che crea un nuovo cliente)
    const addrNewBtnInfo = await page.evaluate(() => {
      // Identifica il container della griglia ADDRESSes
      const grid = Array.from(document.querySelectorAll('[id*="ADDRESSes"]'))
        .find(el => el.offsetParent !== null);
      if (!grid) return { found: false, reason: 'no-grid' };

      // Cerca bottoni/link nella toolbar della griglia (non nel form globale)
      const toolbar = grid.closest('[id*="xaf_l1504"]') || grid.parentElement?.parentElement;
      const candidates = Array.from(document.querySelectorAll('a, button, img, span'))
        .filter(el => el.offsetParent !== null);

      // Filtra: bottoni vicini alla griglia (stessa sezione DOM)
      const nearGridBtns = candidates.filter(el => {
        const rect1 = grid.getBoundingClientRect();
        const rect2 = el.getBoundingClientRect();
        // Sopra la griglia (toolbar) e vicini orizzontalmente
        return rect2.top >= rect1.top - 100 && rect2.top <= rect1.top + 20 &&
               rect2.left >= rect1.left - 50 && rect2.right <= rect1.right + 50;
      }).map(el => ({ id: el.id, tag: el.tagName, title: el.title, text: el.textContent?.trim()?.substring(0, 30) }));

      // Cerca anche per id pattern XAF: "NewObject", "New", "Aggiungi"
      const xafNewBtns = candidates.filter(el =>
        /NewObject|newobject|AddNew|addnew/i.test(el.id || '') ||
        /nuovo|new|aggiungi|add/i.test(el.title || '') ||
        /nuovo|new/i.test(el.textContent?.trim() || '')
      ).filter(el => {
        // Escludi il bottone "Nuovo" globale del form (quello in alto)
        const rect = el.getBoundingClientRect();
        return rect.top > 150; // sotto la barra toolbar globale
      }).map(el => ({ id: el.id, tag: el.tagName, title: el.title, text: el.textContent?.trim()?.substring(0, 30) }));

      return { found: true, nearGridBtns, xafNewBtns };
    });
    finding('ALT_ADDR', `Bottoni toolbar griglia: ${JSON.stringify(addrNewBtnInfo)}`);
    log('  Bottoni vicino alla griglia ADDRESSes:', JSON.stringify(addrNewBtnInfo));

    // 7d. Clicca il bottone "New" della toolbar della griglia ADDRESSes.
    // Il bottone ha suffisso _DXCBtn0Img con title="New" (DevExpress custom button).
    const newBtnClicked = await page.evaluate(() => {
      // Strategia 1: cerca IMG con title="New" nell'area della griglia ADDRESSes
      const grid = Array.from(document.querySelectorAll('[id*="ADDRESSes"]')).find(el => el.offsetParent !== null);
      if (grid) {
        const section = grid.closest('[id*="xaf_l1504"]') || grid.parentElement?.parentElement?.parentElement;
        const container = section || document;
        // Cerca _DXCBtn0Img con title="New" nel container della griglia
        const newBtn = Array.from(container.querySelectorAll('img[id*="DXCBtn0Img"], img[title="New"], a[id*="DXCBtn0"]'))
          .find(el => el.offsetParent !== null && (el.title === 'New' || el.id.includes('DXCBtn0')));
        if (newBtn) { newBtn.click(); return { clicked: newBtn.id, title: newBtn.title, method: 'DXCBtn0Img' }; }
      }

      // Strategia 2: cerca qualsiasi elemento con title="New" e non è il bottone globale form
      const allNewBtns = Array.from(document.querySelectorAll('[title="New"],[title="Nuovo"]'))
        .filter(el => el.offsetParent !== null && el.getBoundingClientRect().top > 150);
      if (allNewBtns.length > 0) {
        // Preferisci quello con ADDRESSes nell'id
        const addrBtn = allNewBtns.find(el => /ADDRESSes/i.test(el.id));
        const btn = addrBtn ?? allNewBtns[allNewBtns.length - 1]; // ultimo = più in basso nella pagina
        btn.click();
        return { clicked: btn.id, title: btn.title, method: 'title-new' };
      }

      // Strategia 3: AddNewRow sulla griglia ADDRESSes specifica via API
      const col = window.ASPxClientControl?.GetControlCollection?.();
      if (col) {
        let done = false;
        col.ForEachControl(c => {
          if (done) return;
          try {
            const el = c.GetMainElement?.();
            if (el && /ADDRESSes/i.test(el.id || '') && typeof c.AddNewRow === 'function') {
              c.AddNewRow(); done = true;
            }
          } catch {}
        });
        if (done) return { clicked: null, method: 'AddNewRow-api-addresses' };
      }
      return { clicked: null, method: 'not-found' };
    });
    log('  New button / AddNewRow:', newBtnClicked);
    finding('ALT_ADDR', `New action: ${JSON.stringify(newBtnClicked)}`);
    await waitIdle(page, 'addnewrow', 5000);
    await wait(2000); // attesa extra per popup XAF o navigazione
    await shot(page, '10-alt-addr-newrow');

    // Cerca popup XAF aperto dopo AddNewRow
    const popupInfo = await page.evaluate(() => {
      const col = window.ASPxClientControl?.GetControlCollection?.();
      const popups = [];
      if (col) {
        col.ForEachControl(c => {
          try {
            const el = c.GetMainElement?.();
            if (!el) return;
            // Cerca popup visibili (ASPxPopupControl)
            const isPopup = typeof c.GetContentHtml === 'function' ||
              typeof c.Show === 'function' && typeof c.Hide === 'function' &&
              el.style?.display !== 'none' && el.offsetParent !== null;
            if (isPopup && el.offsetParent !== null) {
              const inputs = Array.from(el.querySelectorAll('input,textarea,select'))
                .filter(i => i.offsetParent !== null && i.id)
                .map(i => ({ id: i.id, type: i.type || i.tagName, value: (i.value || '').substring(0, 40) }));
              if (inputs.length) popups.push({ id: el.id, inputCount: inputs.length, inputs });
            }
          } catch {}
        });
      }
      // Cerca anche per stili visibilità (layer overlay)
      const overlays = Array.from(document.querySelectorAll('[class*="dxpc"], [class*="Popup"], [id*="Popup"]'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({
          id: el.id, cls: el.className.substring(0, 60),
          inputs: Array.from(el.querySelectorAll('input,textarea')).filter(i => i.offsetParent !== null && i.id)
            .map(i => ({ id: i.id, value: (i.value || '').substring(0, 40) })),
        }))
        .filter(o => o.inputs.length > 0);
      return { popups, overlays };
    });
    log('  Popup/overlay dopo AddNewRow:', JSON.stringify(popupInfo));
    finding('ALT_ADDR', `Popup dopo AddNewRow: ${popupInfo.popups.length} popup, ${popupInfo.overlays.length} overlay`);
    if (popupInfo.popups.length > 0 || popupInfo.overlays.length > 0) {
      const allPopupInputs = [...popupInfo.popups.flatMap(p => p.inputs), ...popupInfo.overlays.flatMap(o => o.inputs)];
      allPopupInputs.forEach(f => finding('ALT_ADDR_FIELD', `  popup id="${f.id}" value="${f.value}"`));
    }

    // Dump di TUTTI gli input visibili subito dopo AddNewRow (per diagnostica)
    const allInputsAfterNewRow = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input, textarea, select'))
        .filter(el => el.offsetParent !== null && el.id && !el.id.includes('EditorClientInfo'))
        .map(el => ({ id: el.id, type: el.type || el.tagName.toLowerCase(), value: (el.value || '').substring(0, 40) }))
    );
    log('  Tutti gli input visibili dopo AddNewRow:', allInputsAfterNewRow.map(f => `${f.id}="${f.value}"`));

    // Leggi i campi della nuova riga — DevExpress usa vari pattern per inline edit
    const newRowFields = await page.evaluate(() => {
      // In DevExpress grid, la riga in edit ha input/select visibili nella griglia "ADDRESSes"
      // I campi possono avere pattern: DXEditRow, editnew, _new_, oppure semplicemente
      // compaiono nella riga con classe dxgvEditingRow / DXEditRow
      const allInputs = Array.from(document.querySelectorAll('input, textarea, select'))
        .filter(el => el.offsetParent !== null && el.id && !el.id.includes('EditorClientInfo'));

      // Prima prova: cerca nella riga di edit della griglia
      const grid = document.querySelector('[id*="ADDRESSes"]');
      if (grid) {
        const editRow = grid.querySelector('.dxgvEditingRow_XafTheme, .DXEditRow, [id*="DXEditRow"], [id*="editnew"]');
        if (editRow) {
          const rowInputs = Array.from(editRow.querySelectorAll('input, textarea, select'))
            .filter(el => el.offsetParent !== null && el.id && !el.id.includes('EditorClientInfo'));
          if (rowInputs.length) return rowInputs.map(el => ({
            id: el.id, type: el.type || el.tagName.toLowerCase(),
            maxLength: el.maxLength > 0 ? el.maxLength : null,
            value: (el.value || '').substring(0, 60), readOnly: el.readOnly || false,
          }));
        }
      }

      // Seconda prova: pattern ID tipici DevExpress per riga inline edit
      const editInputs = allInputs.filter(el =>
        /(editnew|_new_|edit_new|DXEditRow|_DXEdit)/i.test(el.id)
      );
      if (editInputs.length) return editInputs.map(el => ({
        id: el.id, type: el.type || el.tagName.toLowerCase(),
        maxLength: el.maxLength > 0 ? el.maxLength : null,
        value: (el.value || '').substring(0, 60), readOnly: el.readOnly || false,
      }));

      // Terza prova: tutti gli input visibili con ADDRESSes nell'id
      const addrInputs = allInputs.filter(el => /ADDRESSes/i.test(el.id));
      return addrInputs.map(el => ({
        id: el.id, type: el.type || el.tagName.toLowerCase(),
        maxLength: el.maxLength > 0 ? el.maxLength : null,
        value: (el.value || '').substring(0, 60), readOnly: el.readOnly || false,
      }));
    });
    report.fields['altAddrNewRowFields'] = newRowFields;
    log('  Campi nuova riga:', newRowFields);
    newRowFields.forEach(f => finding('ALT_ADDR_FIELD', `  id="${f.id}"  type=${f.type}  maxLen=${f.maxLength}  readOnly=${f.readOnly}`));

    // 7d. Leggi le intestazioni delle colonne
    const colHeaders = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[id*="ADDRESSes"] th, [id*="ADDRESSes"] td.dxgvHeader_XafTheme'))
        .map(el => el.textContent?.trim())
        .filter(Boolean)
    );
    finding('ALT_ADDR', `Colonne: ${colHeaders.join(' | ')}`);

    // 7e. Popola alcuni campi per vedere i pattern (TIPO, NOME, VIA, CAP)
    if (newRowFields.length > 0) {
      // TIPO
      const typeField2 = newRowFields.find(f => /TYPE.*_I$|TIPO.*_I$/.test(f.id));
      if (typeField2) {
        const typeOpts = await enumComboOptions(page, new RegExp(typeField2.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        finding('ALT_ADDR_FIELD', `TIPO opzioni: ${typeOpts.join(' | ')}`);
        report.comboOptions['altAddrType'] = typeOpts;
      }

      // NOME
      const nameField2 = newRowFields.find(f => /NAME.*_I$/.test(f.id));
      if (nameField2) {
        await typeField(page, new RegExp(nameField2.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'INDIRIZZO TEST', { waitAfterMs: 300 });
        finding('ALT_ADDR_FIELD', `NOME: typeField ok su "${nameField2.id}"`);
      }

      await shot(page, '11-alt-addr-filled');
    }

    // 7f. CancelEdit — annulla senza salvare
    const cancelResult = await page.evaluate(() => {
      const col = window.ASPxClientControl?.GetControlCollection?.();
      if (!col) return false;
      let ok = false;
      col.ForEachControl(c => {
        if (ok) return;
        try {
          if (typeof c.CancelEdit === 'function' && typeof c.AddNewRow === 'function') {
            c.CancelEdit(); ok = true;
          }
        } catch {}
      });
      return ok;
    });
    await waitIdle(page, 'cancel-edit', 3000);
    finding('ALT_ADDR', `CancelEdit: ${cancelResult} — nessun dato modificato`);
    await shot(page, '12-alt-addr-cancelled');

    // 7g. Documentazione approccio check+modify
    finding('ALT_ADDR_STRATEGY', 'APPROCCIO CONSIGLIATO per updateCustomer:');
    finding('ALT_ADDR_STRATEGY', '  BOTTONE NEW: img[id*="_DXCBtn0Img"][title="New"] nella sezione ADDRESSes (NON AddNewRow API)');
    finding('ALT_ADDR_STRATEGY', '  PATTERN ID campi inline: _editnew_<N>_xaf_<FIELDNAME>_Edit_I');
    finding('ALT_ADDR_STRATEGY', '  CAMPO TYPE: combo via enumComboOptions, opzioni: Ufficio|Fattura|Consegna|Indir. cons. alt.');
    finding('ALT_ADDR_STRATEGY', '  CAMPO LOGISTICSADDRESSZIPCODE: readOnly=true, è un lookup field (trova con _find_Edit_I)');
    finding('ALT_ADDR_STRATEGY', '  CAMPO NAME: maxLen=60 | STREET: maxLen=250 | CITY: maxLen=60 | COUNTY: maxLen=10 | STATE: maxLen=10 | COUNTRYREGIONID: maxLen=10');
    finding('ALT_ADDR_STRATEGY', '  SAVE RIGA: UpdateEdit() sulla griglia ADDRESSes specifica (stessa API di CancelEdit)');
    finding('ALT_ADDR_STRATEGY', '  CANCEL RIGA: CancelEdit() sulla griglia ADDRESSes');
    finding('ALT_ADDR_STRATEGY', '  1. Leggi righe esistenti via DOM (tipo da cella TIPO)');
    finding('ALT_ADDR_STRATEGY', '  2. Per ogni indirizzo in input: cerca riga con stesso tipo');
    finding('ALT_ADDR_STRATEGY', '     → TROVATA: StartEditRow(idx) → modifica campi → UpdateEdit()');
    finding('ALT_ADDR_STRATEGY', '     → NON TROVATA: clicca _DXCBtn0Img → compila campi → UpdateEdit()');
    finding('ALT_ADDR_STRATEGY', '  3. Righe extra (tipo non più nel DB): delete solo se esplicitamente richiesto');
    finding('ALT_ADDR_STRATEGY', '  4. EVITARE delete-all + re-insert: distruttivo, più callback ERP, rischio corruzione');

    // ── 8. SAVE FLOW — Salva una modifica reale (MEMO) ────────────────────────
    log('\n══ STEP 8: SAVE FLOW — MODIFICA MEMO ══');

    // Torna alla tab Principale
    await openTab(page, 'Principale');
    await waitIdle(page, 'back-to-principale', 5000);

    // Leggi valore attuale MEMO
    const memoBeforeSave = await discover(page, /CUSTINFO.*_I$/);
    const memoOriginal = memoBeforeSave[0]?.value ?? '';
    finding('SAVE_FLOW', `MEMO prima: "${memoOriginal}"`);

    // Scrivi il valore di test
    const memoR = await typeField(page, /CUSTINFO.*_I$/, MEMO_TEST_VALUE, { waitAfterMs: 500 });
    finding('SAVE_FLOW', `MEMO scritto: ${JSON.stringify(memoR)}`);
    await shot(page, '13-memo-before-save');

    // Salva
    const saveResult = await saveAndClose(page);
    report.saveFlow['first_save'] = saveResult;
    finding('SAVE_FLOW', `Save result: ${JSON.stringify(saveResult)}`);
    await shot(page, '14-after-save');

    // ── 9. VERIFICA PERSISTENZA ───────────────────────────────────────────────
    log('\n══ STEP 9: VERIFICA PERSISTENZA ══');
    // Naviga con domcontentloaded (più veloce), poi aspetta idle DevExpress
    await page.goto(CUSTOMER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitReady(page, 15000);
    await shot(page, '15-view-after-save');

    // Leggi il campo MEMO in view mode (potrebbe essere un label, non input)
    const memoInViewMode = await page.evaluate(() => {
      // In view mode i campi sono label/span, non input
      // Cerca vicino al testo "MEMO" o cerca il campo nascosto
      const allText = Array.from(document.querySelectorAll('td, span, div'))
        .find(el => el.textContent?.trim() === 'MEMO:' || el.textContent?.trim() === 'MEMO');
      if (allText) {
        const row = allText.closest('tr') || allText.parentElement;
        const next = row?.querySelector('td:last-child, .dxgvDataRow_XafTheme');
        return next?.textContent?.trim() ?? null;
      }
      // Cerca anche input readonly con CUSTINFO
      const inp = document.querySelector('[id*="CUSTINFO"]');
      return inp?.value ?? inp?.textContent ?? null;
    });
    finding('PERSISTENZA', `MEMO in view mode dopo save: "${memoInViewMode ?? '(non trovato nel DOM)'}"`);

    // Rientra in edit mode e rileggi
    await openCustomerEdit(page, CUSTOMER_ID);
    const memoAfterSave = await discover(page, /CUSTINFO.*_I$/);
    finding('PERSISTENZA', `MEMO in edit mode dopo save: "${memoAfterSave[0]?.value}" (atteso: "${MEMO_TEST_VALUE}")`);
    const persistenceOk = memoAfterSave[0]?.value === MEMO_TEST_VALUE;
    finding('PERSISTENZA', `Persistenza: ${persistenceOk ? '✅ OK' : '❌ FALLITA'}`);
    report.saveFlow['persistence_ok'] = persistenceOk;
    await shot(page, '16-memo-verified');

    // ── 10. RIPRISTINO — svuota il MEMO ───────────────────────────────────────
    log('\n══ STEP 10: RIPRISTINO MEMO ORIGINALE ══');

    if (memoOriginal) {
      // Ripristina valore originale
      await typeField(page, /CUSTINFO.*_I$/, memoOriginal, { waitAfterMs: 500 });
      finding('RIPRISTINO', `MEMO ripristinato a "${memoOriginal}"`);
    } else {
      // Svuota il campo via tastiera: focus → Ctrl+A → Delete
      // DevExpress richiede input da keyboard, non basta impostare .value via DOM
      const memoId = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('textarea, input'))
          .find(i => /CUSTINFO/i.test(i.id) && i.offsetParent !== null);
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        el.focus();
        el.click();
        return el.id;
      });
      if (memoId) {
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await wait(100);
        await page.keyboard.press('Delete');
        await wait(200);
        await page.keyboard.press('Tab');
        await waitIdle(page, 'clear-memo', 3000);
      }
      finding('RIPRISTINO', `MEMO svuotato via Ctrl+A+Delete (valore originale era vuoto). campo="${memoId}"`);
    }

    await shot(page, '17-memo-restored');

    const restoreSaveResult = await saveAndClose(page);
    report.saveFlow['restore_save'] = restoreSaveResult;
    finding('RIPRISTINO', `Salvataggio ripristino: ${JSON.stringify(restoreSaveResult)}`);

    // Verifica finale
    await page.goto(CUSTOMER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitReady(page, 15000);
    await openCustomerEdit(page, CUSTOMER_ID);
    const memoFinal = await discover(page, /CUSTINFO.*_I$/);
    finding('RIPRISTINO', `MEMO dopo ripristino: "${memoFinal[0]?.value}" (atteso: "${memoOriginal}")`);
    const ripristinoOk = memoFinal[0]?.value === memoOriginal;
    finding('RIPRISTINO', `Ripristino: ${ripristinoOk ? '✅ OK' : '❌ verifica manuale necessaria'}`);
    await shot(page, '18-final-state');

    // Chiudi senza salvare (il cliente è già stato ripristinato)
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a, button'))
        .find(el => el.offsetParent !== null && /chiudi|close|annulla|cancel/i.test(
          (el.textContent ?? '') + (el.title ?? '')
        ) && !/salva/i.test(el.textContent ?? ''));
      btn?.click();
    });
    await wait(1500);

  } catch (err) {
    log(`\nERRORE FATALE: ${err}`);
    console.error(err);
    try { await shot(page, 'error'); } catch {}
  } finally {
    // ── Scrivi report ─────────────────────────────────────────────────────────
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
    log(`\n✅  Report JSON: ${REPORT_FILE}`);
    log(`✅  Screenshot:  ${SCREENSHOT_DIR}/`);

    log('\n══════════════════════════════════════════');
    log('  FINDINGS RIASSUNTIVI');
    log('══════════════════════════════════════════');
    report.findings.forEach((f, i) => log(` ${String(i + 1).padStart(2)}. [${f.category}] ${f.msg}`));

    if (process.env.AUTO_CLOSE === '1') {
      log('AUTO_CLOSE=1 → chiusura browser automatica');
      await browser.close();
    } else {
      log('\n⚠️  Browser aperto. Premi Ctrl+C per chiudere.');
      await new Promise(() => {}); // Aspetta Ctrl+C
    }
  }
}

main().catch(err => {
  console.error('ERRORE FATALE:', err);
  process.exit(1);
});

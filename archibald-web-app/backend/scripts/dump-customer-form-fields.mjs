/**
 * dump-customer-form-fields.mjs
 *
 * Script diagnostico per esplorare il form di creazione cliente in Archibald ERP.
 *
 * Obiettivi:
 *  - Scopre ID, tipo, maxLength e comportamento di ogni campo target
 *  - Studia il comportamento di auto-fill dopo validazione P.IVA
 *  - Studia quando/come l'ERP auto-popola Nome di Ricerca (SEARCHNAME)
 *  - Enumera le opzioni di tutti i combobox (Settore, Modalità Consegna, Sconto Linea, Gruppo Prezzo)
 *  - Misura i tempi di attesa tra un campo e l'altro
 *  - Verifica quali campi vengono auto-compilati dal CAP lookup
 *  - NON salva mai la scheda cliente
 *
 * Uso:
 *   node scripts/dump-customer-form-fields.mjs
 *
 * Output:
 *   /tmp/customer-field-dump/NNN-<label>.png   — screenshot per ogni step
 *   /tmp/customer-field-dump/report.json       — tutti i findings strutturati
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Carica .env dal backend (stesso pattern degli altri script)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch { /* dotenv opzionale */ }

// ─── Configurazione ───────────────────────────────────────────────────────────

const ARCHIBALD_URL  = (process.env.ARCHIBALD_URL      || 'https://4.231.124.90/Archibald').replace(/\/$/, '');
const ARCHIBALD_USER = process.env.ARCHIBALD_USERNAME  || process.env.ARCHIBALD_USER || 'ikiA0930';
const ARCHIBALD_PASS = process.env.ARCHIBALD_PASSWORD  || process.env.ARCHIBALD_PASS || 'Fresis26@';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR  || '/tmp/customer-field-dump';
const REPORT_FILE    = path.join(SCREENSHOT_DIR, 'report.json');

// Dati dal screenshot fornito dall'utente — cliente di prova
const TEST = {
  vatNumber:    '15576861007',
  name:         "BRACIO SOCIETA' A RESPONSABILITA' LIMITATA SEMPLIFICATA",
  deliveryMode: 'FedEx',
  attentionTo:  'PROVA',
  fiscalCode:   '15576861007',
  memo:         'PROVA',
  settore:      'Spett. Studio Dentistico',
  paymentTerms: '206',
  pec:          'amministrazione@pec.abracia.it',
  sdi:          '0000000',
  street:       'VIA ENRICO FERMI, 142',
  postalCode:   '00146',
  city:         'Roma',
  phone:        '+3906',
  mobile:       '+3933',
  email:        'test@test.it',
  url:          'https://test.it',
  priceGroup:   'DETTAGLIO (consigliato)',
  lineDiscount: 'Discount to get street price',
};

// ─── Report accumulatore ──────────────────────────────────────────────────────

const report = {
  timestamp: new Date().toISOString(),
  erpUrl: ARCHIBALD_URL,
  fields: {},          // id, maxLength, readOnly per campo
  autoFill: {},        // campi che cambiano in autonomia
  comboOptions: {},    // opzioni enumerate per ogni combo
  timing: {},          // ms di attesa rilevati per fase
  findings: [],        // osservazioni testuali ordinate
};

function finding(category, msg) {
  const entry = { category, msg, ts: new Date().toISOString().slice(11, 23) };
  report.findings.push(entry);
  log(`  [${category}] ${msg}`);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

let shotIdx = 0;

function ts()      { return new Date().toISOString().slice(11, 23); }
// CSS.escape non esiste in Node.js — implementazione minimale
function cssEscape(id) { return id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1'); }
function log(msg, data) {
  process.stdout.write(`[${ts()}] ${msg}\n`);
  if (data !== undefined) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}
function wait(ms)  { return new Promise(r => setTimeout(r, ms)); }

async function shot(page, label) {
  const p = path.join(SCREENSHOT_DIR, `${String(++shotIdx).padStart(3, '0')}-${label.replace(/[^a-z0-9]/gi, '-')}.png`);
  try   { await page.screenshot({ path: p, fullPage: true }); log(`📸 ${path.basename(p)}`); }
  catch (e) { log(`Screenshot fail: ${e.message}`); }
}

// ─── DevExpress wait helpers ──────────────────────────────────────────────────

async function waitIdle(page, label = '', ms = 10000) {
  try {
    await page.waitForFunction(() => {
      const w = window;
      // Controlla sia il flag ASPx (pending callbacks) che ForEachControl InCallback
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

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

/**
 * Legge TUTTI gli input/textarea visibili e restituisce { id → value }.
 * Serve per confrontare "prima" e "dopo" un'azione e scoprire gli auto-fill.
 */
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

/**
 * Cerca input/textarea visibili il cui id corrisponde a idRegex.
 * Restituisce array di { id, tagName, type, maxLength, value, readOnly }.
 */
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
        value:     (el.value || '').substring(0, 80),
        readOnly:  el.readOnly || false,
        disabled:  el.disabled || false,
      }));
  }, idRegex.source || String(idRegex));
}

/**
 * Cerca TUTTI i campi visibili il cui contesto DOM si trova vicino a un label
 * che contiene `labelText`. Utile per trovare campi con ID non prevedibili.
 */
async function discoverByLabel(page, labelText) {
  return page.evaluate(text => {
    const norm = t => t.replace(/\s+/g, ' ').trim().toLowerCase();
    const target = norm(text);
    for (const el of document.querySelectorAll('td, th, span, div, label')) {
      if (norm(el.textContent || '') === target) {
        const row = el.closest('tr') || el.closest('td') || el.parentElement;
        if (!row) continue;
        const fields = Array.from(row.querySelectorAll('input, textarea, select'))
          .filter(f => f.offsetParent !== null)
          .map(f => ({
            id:       f.id,
            tagName:  f.tagName,
            type:     f.type || f.tagName.toLowerCase(),
            maxLength: f.maxLength > 0 ? f.maxLength : null,
            value:    (f.value || '').substring(0, 80),
            readOnly: f.readOnly || false,
          }));
        if (fields.length) return fields;
      }
    }
    return [];
  }, labelText);
}

// ─── DevExpress field interaction ────────────────────────────────────────────

/**
 * Tipizza un campo di testo DevExpress.
 * Usa CDP page.type() con delay per generare keydown/keypress/keyup autentici.
 * Include retry in caso di mismatch.
 */
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
    const setter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value')?.set;
    if (setter) setter.call(el, '');
    else el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.id;
  }, idRegex.source || String(idRegex));

  if (!inputId) return { found: false, id: null };

  await page.type(`#${cssEscape(inputId)}`, value, { delay: 5 });
  await page.keyboard.press('Tab');
  await wait(waitAfterMs);
  await waitIdle(page, `type-${inputId}`, 8000);

  const actual = await page.evaluate(id => document.getElementById(id)?.value ?? '', inputId);
  const ok = actual === value || actual === value.substring(0, 524288); // rispetta eventuale maxLength

  if (!ok) {
    log(`  retry: expected "${value.substring(0,60)}" got "${actual.substring(0,60)}"`);
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

/**
 * Imposta un combobox DevExpress tramite SetSelectedIndex / SetText / SetValue.
 */
async function setCombo(page, idRegex, value) {
  const result = await page.evaluate((re, val) => {
    const pat = new RegExp(re);
    const w = window;
    const input = Array.from(document.querySelectorAll('input'))
      .find(i => i.offsetParent !== null && pat.test(i.id));
    if (!input) return { found: false };

    input.scrollIntoView({ block: 'center' });
    const col = w.ASPxClientControl?.GetControlCollection?.();
    if (col) {
      let combo = null;
      col.ForEachControl(c => {
        if (combo) return;
        try { if (c.GetInputElement?.()?.id === input.id) { combo = c; return; } } catch {}
        try {
          const main = c.GetMainElement?.();
          if (main?.contains(input) && typeof c.SetSelectedIndex === 'function') combo = c;
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
    return { found: false, reason: 'no-control', inputId: input.id };
  }, idRegex.source || String(idRegex), value);

  await waitIdle(page, `combo-${value}`, 5000);
  return result;
}

/**
 * Enumera le opzioni di un combobox DevExpress.
 *
 * I combo DevExpress caricano le opzioni LAZY la prima volta che ShowDropDown() viene
 * chiamato (callback asincrono). La sequenza corretta è:
 *  1. Tenta GetItemCount/GetItem direttamente
 *  2. Se 0 → chiama ShowDropDown() → waitIdle → riprova GetItemCount/GetItem
 *  3. Fallback finale: legge il DOM della lista aperta
 */
async function enumComboOptions(page, idRegex) {
  const reStr = idRegex.source || String(idRegex);

  // Helper: legge items via API DevExpress (controllo per ID diretto O per contenimento)
  const readViaApi = () => page.evaluate(re => {
    const pat = new RegExp(re);
    const input = Array.from(document.querySelectorAll('input'))
      .find(i => i.offsetParent !== null && pat.test(i.id));
    if (!input) return null; // null = input non trovato

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

  // 1. Prova direttamente — valida se le opzioni sono già caricate
  const direct = await readViaApi();
  if (direct === null) return []; // input non trovato
  if (direct.length > 0) return direct;

  // 2. Le opzioni non sono caricate (lazy) → triggera ShowDropDown() e aspetta il callback
  const showResult = await page.evaluate(re => {
    const pat = new RegExp(re);
    const input = Array.from(document.querySelectorAll('input'))
      .find(i => i.offsetParent !== null && pat.test(i.id));
    if (!input) return 'no-input';

    const col = window.ASPxClientControl?.GetControlCollection?.();
    if (!col) return 'no-collection';

    let found = false;
    col.ForEachControl(c => {
      if (found) return;
      try {
        const direct   = c.GetInputElement?.()?.id === input.id;
        const contains = !direct && c.GetMainElement?.()?.contains(input);
        if (!direct && !contains) return;
        if (typeof c.ShowDropDown === 'function') { c.ShowDropDown(); found = true; }
      } catch {}
    });
    if (found) return 'showdropdown-ok';

    // Fallback: click sul pulsante dropdown
    let btnId = input.id.replace(/_DD_I$/, '_DD_B');
    if (btnId === input.id) btnId = input.id.replace(/_I$/, '_B');
    const btn = document.getElementById(btnId)
      ?? input.closest('td,tr')?.querySelector('[id$="_DD_B"],[id$="_B"]');
    if (btn) { btn.click(); return 'click-btn'; }
    return 'no-trigger';
  }, reStr);

  if (showResult === 'no-input' || showResult === 'no-trigger') return [];

  // Aspetta che il callback asincrono di caricamento items sia completato
  await waitIdle(page, `enum-lazy-${reStr.substring(0, 20)}`, 5000);
  await wait(300);

  // 3. Riprova via API — ora gli items dovrebbero essere caricati in memoria
  const afterLoad = await readViaApi();
  if (afterLoad && afterLoad.length > 0) {
    await page.keyboard.press('Escape');
    await wait(300);
    return afterLoad;
  }

  // 4. Fallback finale: leggi gli items dal DOM della lista aperta
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

/**
 * Apre la tab di un form DevExpress tramite il testo del tab link.
 */
async function openTab(page, tabText) {
  const aliases = {
    'Principale':      ['Principale', 'Main'],
    'Prezzi e sconti': ['Prezzi e sconti', 'Price Discount', 'Prices and Discounts'],
    'Indirizzo alt':   ['Indirizzo alt', 'Alt. address', 'Alt. Address'],
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
    if (clicked) {
      await waitIdle(page, `tab-${cand}`, 5000);
      return true;
    }
  }
  log(`  ⚠️  Tab "${tabText}" non trovato`);
  return false;
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(page) {
  log('→ Login...');
  await page.goto(`${ARCHIBALD_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await shot(page, 'login');

  // Se siamo già loggati (redirect a una ListView) usciamo subito
  if (!page.url().toLowerCase().includes('login') && !page.url().endsWith('/')) {
    log('  Già autenticato');
    return;
  }

  // ── Trova il campo username (stesso pattern del bot reale) ──
  const userInputId = await page.evaluate(() => {
    const textInputs = Array.from(document.querySelectorAll('input'))
      .filter(i => i.type !== 'hidden' && i.type !== 'submit' && i.type !== 'button' && i.type !== 'password');
    const uField = textInputs.find(i =>
      i.id.includes('UserName') ||
      i.name.includes('UserName') ||
      i.placeholder?.toLowerCase().includes('account') ||
      i.placeholder?.toLowerCase().includes('username')
    ) || textInputs[0];
    if (uField) { uField.scrollIntoView(); uField.focus(); }
    return uField?.id ?? null;
  });

  if (!userInputId) throw new Error('Campo username non trovato nella pagina di login');
  log(`  Username field: #${userInputId}`);

  // Svuota e tipizza il campo username via CDP (genera keydown/keypress/keyup autentici)
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

  // ── Trova il campo password ──
  const pwdInputId = await page.evaluate(() => {
    const pField = document.querySelector('input[type="password"]');
    if (pField) { pField.scrollIntoView(); pField.focus(); }
    return pField?.id ?? null;
  });

  if (!pwdInputId) throw new Error('Campo password non trovato nella pagina di login');
  log(`  Password field: #${pwdInputId}`);

  await page.evaluate(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, ''); else el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, pwdInputId);
  await page.type(`#${cssEscape(pwdInputId)}`, ARCHIBALD_PASS, { delay: 30 });
  await page.keyboard.press('Tab');
  await waitIdle(page, 'login-pass', 5000);

  // ── Clicca il pulsante di submit ──
  const submitClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"], a, button'))
      .find(el => el.offsetParent !== null && /accedi|login|sign in|entra/i.test(el.textContent + (el.value || '')));
    if (btn) { btn.click(); return true; }
    // Fallback: qualsiasi submit visibile
    const fallback = document.querySelector('input[type="submit"]');
    if (fallback) { fallback.click(); return true; }
    return false;
  });

  if (!submitClicked) {
    // Ultimo fallback: Enter
    await page.keyboard.press('Enter');
  }

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await shot(page, 'post-login');

  if (page.url().toLowerCase().includes('login')) {
    throw new Error(`Login fallito — ancora sulla pagina di login: ${page.url()}`);
  }
  log('  Login OK → ' + page.url());
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  log('══════════════════════════════════════════');
  log('  CUSTOMER FORM FIELD DUMP');
  log(`  ERP:  ${ARCHIBALD_URL}`);
  log(`  User: ${ARCHIBALD_USER}`);
  log(`  Dir:  ${SCREENSHOT_DIR}`);
  log('══════════════════════════════════════════');

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 80,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1400, height: 900 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // ─── 0. Login ─────────────────────────────────────────────────────────────
  await login(page);

  // ─── 1. Apri form nuovo cliente ───────────────────────────────────────────
  log('\n── Apertura form nuovo cliente ──');
  await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitReady(page);

  const nuovoClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a, span, button'))
      .find(el => el.textContent?.trim() === 'Nuovo' || el.textContent?.trim() === 'New');
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!nuovoClicked) throw new Error('Pulsante "Nuovo" non trovato');

  await page.waitForFunction(() => !window.location.href.includes('ListView'), { timeout: 15000, polling: 200 });
  await waitReady(page, 12000);
  await shot(page, '00-form-vuoto');
  log('  Form caricato: ' + page.url());

  // ─── 1.1 Discovery baseline ───────────────────────────────────────────────
  log('\n── Discovery baseline (tutti i campi visibili al caricamento) ──');
  const allFieldsAtLoad = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input, textarea, select'))
      .filter(el => el.offsetParent !== null && el.id)
      .map(el => ({
        id: el.id, tagName: el.tagName, type: el.type || el.tagName.toLowerCase(),
        maxLength: el.maxLength > 0 ? el.maxLength : null,
        value: (el.value || '').substring(0, 60), readOnly: el.readOnly || false,
      }))
  );
  report.fields['_baseline'] = allFieldsAtLoad;
  log(`  ${allFieldsAtLoad.length} campi trovati al caricamento`);
  allFieldsAtLoad.forEach(f => log(`    ${f.id}  maxLen=${f.maxLength}  readOnly=${f.readOnly}  val="${f.value}"`));

  const snap0 = await snapshot(page);

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 1 — PARTITA IVA
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 1: PARTITA IVA ══');

  const vatFields = await discover(page, /VATNUM.*_I$|TAXNUM.*_I$/);
  log('  Discovery:', vatFields);
  report.fields['vatNumber'] = vatFields;
  if (vatFields[0]) finding('VATNUM', `id="${vatFields[0].id}"  maxLength=${vatFields[0].maxLength}`);

  const snapBeforeVat = await snapshot(page);
  const t0vat = Date.now();

  const vatR = await typeField(page, /VATNUM.*_I$|TAXNUM.*_I$/, TEST.vatNumber, { waitAfterMs: 400 });
  log('  Typed:', vatR);

  // Attendi la validazione asincrona — l'ERP chiama l'Agenzia delle Entrate
  // Casi limite: può richiedere 20+ secondi, può non rispondere, può rispondere parzialmente
  log('  Attendo validazione P.IVA (max 28s)...');
  let vatValidated = false;
  try {
    await page.waitForFunction(() => {
      // Il campo VATVALIDE o VATLASTEDCHECKED cambia quando la validazione è completa
      const anyValidated = Array.from(document.querySelectorAll('input')).some(i =>
        /VATVALIED|VATLASTEDCHECK|VATLASTCHECKED/i.test(i.id) && i.value !== '' && i.value !== 'No'
      );
      const anyDateSet = Array.from(document.querySelectorAll('input')).some(i =>
        /VATLASTCHECKEDDATE|VATLASTEDCHECKEDDATE/i.test(i.id) && i.value !== ''
      );
      return anyValidated || anyDateSet;
    }, { timeout: 28000, polling: 300 });
    vatValidated = true;
  } catch {
    // Timeout: la validazione non è arrivata — continua comunque
    log('  ⚠️  Validazione P.IVA non completata entro 28s (timeout API Agenzia Entrate o P.IVA non trovata)');
  }

  await waitIdle(page, 'vat-validation', 5000);
  const vatMs = Date.now() - t0vat;
  report.timing['vat_validation_ms'] = vatMs;
  finding('VATNUM', `Validazione completata in ~${vatMs}ms. IVA validata: ${vatValidated}`);

  await shot(page, '01-dopo-vat');

  const snapAfterVat = await snapshot(page);
  const vatDiff = diff(snapBeforeVat, snapAfterVat);
  report.autoFill['after_vat'] = vatDiff;
  log('  Campi auto-compilati dopo P.IVA:', vatDiff);

  if (Object.keys(vatDiff).length === 0) {
    finding('VATNUM_AUTOFILL', 'Nessun campo auto-compilato — dati non disponibili da Agenzia Entrate per questa P.IVA di test');
  } else {
    Object.entries(vatDiff).forEach(([id, { before, after }]) =>
      finding('VATNUM_AUTOFILL', `"${id}" : "${before}" → "${after}"`));
  }

  // Leggi i campi che potrebbero essere stati auto-compilati
  for (const [label, re] of [
    ['CF_FIELD',          /TAXREGISTRATIONNUM.*_I$|FISCALCODE.*_I$|INVOICEACCOUNT.*_I$/],
    ['IVA_VALIDATA',      /VALIDATED.*_I$|IvaValidated/i],
    ['INDIRIZZO_IVA',     /INVOICEADDRESS.*_I$|InvoiceAddress/i],
    ['ULTIMO_CTRL_IVA',   /VATREGISTRATIONDATE.*_I$|LastCheck/i],
  ]) {
    const f = await discover(page, re);
    if (f.length > 0) {
      report.fields[label] = f;
      finding('VATNUM_AUTOFILL', `${label}: id="${f[0].id}"  val="${f[0].value}"  readOnly=${f[0].readOnly}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 2 — NOME
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 2: NOME ══');

  const nameFields = await discover(page, /dviNAME.*_I$|^NAME_Edit_I$/);
  log('  Discovery:', nameFields);
  report.fields['name'] = nameFields;
  if (nameFields[0]) {
    finding('NOME', `id="${nameFields[0].id}"  maxLength=${nameFields[0].maxLength}`);
    if (nameFields[0].maxLength && TEST.name.length > nameFields[0].maxLength) {
      finding('NOME', `⚠️  TEST.name (${TEST.name.length} chars) > maxLength (${nameFields[0].maxLength}) → sarà troncato`);
    }
  }

  // Leggi SEARCHNAME PRIMA di digitare il nome
  const searchNamePre = await discover(page, /SEARCHNAME.*_I$|NAMEALIAS.*_I$/);
  log('  SEARCHNAME prima di Nome:', searchNamePre);
  report.fields['searchName_before_name'] = searchNamePre;

  const snapBeforeName = await snapshot(page);

  const nameR = await typeField(page, /dviNAME.*_I$|^NAME_Edit_I$/, TEST.name, { waitAfterMs: 1500 });
  log('  Typed:', nameR);
  await waitIdle(page, 'name-typed', 6000);
  await shot(page, '02-dopo-nome');

  const snapAfterName = await snapshot(page);
  const nameDiff = diff(snapBeforeName, snapAfterName);
  report.autoFill['after_name'] = nameDiff;
  log('  Campi cambiati dopo Nome:', nameDiff);

  // Leggi SEARCHNAME DOPO aver digitato il nome
  const searchNamePost = await discover(page, /SEARCHNAME.*_I$|NAMEALIAS.*_I$/);
  log('  SEARCHNAME dopo Nome:', searchNamePost);
  report.fields['searchName_after_name'] = searchNamePost;

  const snBeforeVal = searchNamePre[0]?.value ?? '';
  const snAfterVal  = searchNamePost[0]?.value ?? '';

  if (snBeforeVal !== snAfterVal) {
    finding('SEARCHNAME', `Auto-popolato da Nome: "${snAfterVal}"  (maxLength=${searchNamePost[0]?.maxLength})`);

    // Analisi algoritmo di troncamento
    const full = TEST.name;
    const snLen = snAfterVal.length;
    const snMax = searchNamePost[0]?.maxLength;
    finding('SEARCHNAME', `Nome completo: "${full.substring(0,60)}" (${full.length} chars)`);
    finding('SEARCHNAME', `SEARCHNAME prodotto: "${snAfterVal}" (${snLen} chars, maxLength=${snMax})`);

    if (full.toLowerCase().startsWith(snAfterVal.toLowerCase())) {
      finding('SEARCHNAME', `Algoritmo ERP: substring(0, ${snLen}) con eventuale uppercase`);
    } else {
      finding('SEARCHNAME', `Algoritmo non è semplice substring — verificare manualmente`);
    }

    // Testa se il campo è sovrascrivibile
    if (searchNamePost[0] && !searchNamePost[0].readOnly) {
      const overR = await typeField(page, /SEARCHNAME.*_I$|NAMEALIAS.*_I$/, 'BRACIO SRL DUMP', { waitAfterMs: 400 });
      const overVal = (await discover(page, /SEARCHNAME.*_I$|NAMEALIAS.*_I$/))[0]?.value ?? '';
      finding('SEARCHNAME', `Sovrascrivibile: sì  → valore dopo sovrascrittura: "${overVal}"`);
      // Ripristina il valore auto
      await typeField(page, /SEARCHNAME.*_I$|NAMEALIAS.*_I$/, snAfterVal, { waitAfterMs: 300 });
    } else {
      finding('SEARCHNAME', `readOnly: ${searchNamePost[0]?.readOnly} — non sovrascrivibile`);
    }
  } else {
    finding('SEARCHNAME', 'Non auto-popolato dopo digitazione Nome — richiede inserimento manuale');
    if (searchNamePost[0] && !searchNamePost[0].readOnly) {
      finding('SEARCHNAME', `Campo editabile: sì  id="${searchNamePost[0].id}"  maxLength=${searchNamePost[0].maxLength}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 3 — MODALITÀ DI CONSEGNA
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 3: MODALITÀ DI CONSEGNA ══');

  const dlvFields = await discover(page, /DLVMODE.*_I$/);
  log('  Discovery:', dlvFields);
  report.fields['deliveryMode'] = dlvFields;

  const dlvOptions = await enumComboOptions(page, /DLVMODE.*_DD_B$/);
  log('  Opzioni:', dlvOptions);
  report.comboOptions['deliveryMode'] = dlvOptions;
  finding('DLVMODE', `Opzioni: ${dlvOptions.join(' | ')}`);
  await shot(page, '03-dlvmode-opzioni');

  const dlvR = await setCombo(page, /DLVMODE.*_DD_I$/, TEST.deliveryMode);
  log('  Set combo:', dlvR);
  finding('DLVMODE', `Set "${TEST.deliveryMode}": ${JSON.stringify(dlvR)}`);

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 4 — ALL'ATTENZIONE DI
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 4: ALL\'ATTENZIONE DI ══');

  // Il campo potrebbe non avere "ATTENTION" nel nome — cerca per label
  let attFields = await discover(page, /ATTENTION.*_I$|CONTACTPERSON.*_I$/);
  if (attFields.length === 0) attFields = await discoverByLabel(page, "ALL'ATTENZIONE DI:");
  if (attFields.length === 0) attFields = await discoverByLabel(page, 'ALL\'ATTENZIONE DI');
  log('  Discovery:', attFields);
  report.fields['attentionTo'] = attFields;

  if (attFields[0]) {
    finding('ATTENTION', `id="${attFields[0].id}"  maxLength=${attFields[0].maxLength}`);
    const attR = await typeField(page, new RegExp(attFields[0].id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), TEST.attentionTo, { waitAfterMs: 300 });
    log('  Typed:', attR);
  } else {
    finding('ATTENTION', '⚠️  Campo non trovato con pattern standard né per label — ID diverso da atteso');
    // Discovery ampia per debugging
    const allIds = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).filter(el => el.offsetParent !== null).map(el => el.id)
    );
    finding('ATTENTION', `Tutti gli input visibili: ${allIds.join(', ').substring(0, 200)}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 5 — CODICE FISCALE
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 5: CODICE FISCALE ══');

  const cfPatterns = [
    /TAXREGISTRATIONNUM.*_I$/,
    /FISCALCODE.*_I$/,
    /INVOICEACCOUNT.*_I$/,
    /CF_Edit_I$/,
  ];
  let cfFields = [];
  let cfPatternUsed = null;
  for (const pat of cfPatterns) {
    cfFields = await discover(page, pat);
    if (cfFields.length > 0) { cfPatternUsed = pat.source; break; }
  }
  // Fallback per label
  if (cfFields.length === 0) cfFields = await discoverByLabel(page, 'CODICE FISCALE:');
  log('  Discovery (pattern=' + cfPatternUsed + '):', cfFields);
  report.fields['fiscalCode'] = cfFields;
  await shot(page, '05-codice-fiscale');

  if (cfFields[0]) {
    const isAutoFilled = cfFields[0].value !== '';
    finding('CF', `id="${cfFields[0].id}"  maxLength=${cfFields[0].maxLength}  autoFilled=${isAutoFilled}  val="${cfFields[0].value}"`);
    if (!isAutoFilled && !cfFields[0].readOnly) {
      const cfR = await typeField(page, new RegExp(cfFields[0].id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), TEST.fiscalCode, { waitAfterMs: 400 });
      log('  CF typed:', cfR);
    }
  } else {
    finding('CF', '⚠️  Campo CF non trovato — probabilmente ha ID non standard');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 6 — MEMO
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 6: MEMO ══');

  // MEMO è spesso un textarea — nel form Archibald usa CUSTINFO
  const memoInput    = await discover(page, /MEMO.*_I$|NOTES.*_I$|CUSTINFO.*_I$/);
  const allTextareas = await page.evaluate(() =>
    Array.from(document.querySelectorAll('textarea'))
      .filter(el => el.offsetParent !== null && !el.readOnly)
      .map(el => ({ id: el.id, maxLength: el.maxLength > 0 ? el.maxLength : null, value: el.value.substring(0, 60) }))
  );
  log('  MEMO input discovery:', memoInput);
  log('  Textarea editabili visibili:', allTextareas);
  report.fields['memo'] = { inputs: memoInput, textareas: allTextareas };

  // Preferisci il match diretto; tra le textarea preferisci quella con maxLength più grande (CUSTINFO=4000)
  const memoTarget = memoInput[0] ?? allTextareas.sort((a, b) => (b.maxLength ?? 0) - (a.maxLength ?? 0))[0];
  if (memoTarget) {
    const memoR = await typeField(page, new RegExp(memoTarget.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), TEST.memo, { waitAfterMs: 300 });
    finding('MEMO', `id="${memoTarget.id}"  maxLength=${memoTarget.maxLength}  typed=${memoR.found}`);
  } else {
    finding('MEMO', '⚠️  Campo MEMO non trovato');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 7 — SETTORE
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 7: SETTORE ══');

  // Cerca prima per ID pattern, poi per label
  let settoreFields = await discover(page, /SECTOR.*_I$|SEGMENT.*_I$|CUSTGROUP.*_DD_I$/);
  if (settoreFields.length === 0) settoreFields = await discoverByLabel(page, 'SETTORE:');
  log('  Discovery:', settoreFields);
  report.fields['settore'] = settoreFields;

  // Per enumerare le opzioni devo trovare il pulsante dropdown
  const settoreDropdownId = await page.evaluate(() => {
    // Cerca un input vicino al label SETTORE e trova il DD_B associato
    for (const el of document.querySelectorAll('td, span, div')) {
      if (el.textContent?.trim() === 'SETTORE:') {
        const row = el.closest('tr') || el.parentElement;
        const btn = row?.querySelector('[id*="_DD_B"], [id*="_DDB"]');
        if (btn) return btn.id;
      }
    }
    // Fallback: cerca DD_B nella sezione "Vendite"
    const vendite = Array.from(document.querySelectorAll('[id*="_DD_B"]'))
      .filter(el => el.offsetParent !== null);
    // Di solito è il primo dopo termini di pagamento
    return vendite[0]?.id ?? null;
  });
  log('  Dropdown button id:', settoreDropdownId);

  const settoreOptions = settoreDropdownId
    ? await enumComboOptions(page, new RegExp(settoreDropdownId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    : [];

  log('  Opzioni Settore:', settoreOptions);
  report.comboOptions['settore'] = settoreOptions;
  if (settoreOptions.length > 0) {
    finding('SETTORE', `Opzioni enumerate: ${settoreOptions.join(' | ')}`);
  } else {
    finding('SETTORE', '⚠️  Opzioni non enumerate — ID dropdown non rilevato');
  }

  await shot(page, '07-settore');

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 8 — TERMINI DI PAGAMENTO (lookup dialog)
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 8: TERMINI DI PAGAMENTO ══');

  const payFields = await discover(page, /PAYMTERMID.*_I$/);
  // DevExpress lookup: il bottone può avere _B0 oppure _B come suffisso
  const payFindBtnB0 = await discover(page, /PAYMTERMID.*_B0$/);
  const payFindBtnB  = await discover(page, /PAYMTERMID.*_B$/);
  const payFindBtn   = [...payFindBtnB0, ...payFindBtnB];
  // Cerca anche vicino all'input per ID non predittivo
  const payFindBtnNear = payFindBtn.length === 0 ? await page.evaluate(re => {
    const pat = new RegExp(re);
    const input = Array.from(document.querySelectorAll('input')).find(i => pat.test(i.id));
    if (!input) return null;
    const row = input.closest('tr') || input.closest('td') || input.parentElement;
    const btn = row?.querySelector('a[id$="_B0"], a[id$="_B"], button[id$="_B0"], button[id$="_B"], img[id$="_B0"]');
    return btn ? { id: btn.id, tagName: btn.tagName } : null;
  }, /PAYMTERMID.*_I$/) : null;

  log('  Input discovery:', payFields);
  log('  Find button _B0:', payFindBtnB0);
  log('  Find button _B:', payFindBtnB);
  log('  Find button near input:', payFindBtnNear);
  report.fields['paymentTerms'] = { input: payFields, findBtn: payFindBtn, findBtnNear: payFindBtnNear };

  if (payFindBtn[0] || payFindBtnNear) {
    const btnInfo = payFindBtn[0] ?? payFindBtnNear;
    finding('PAYMT', `Find button trovato: "${btnInfo.id}" — usa selectFromDevExpressLookup`);
    finding('PAYMT', `Input id="${payFields[0]?.id}"  maxLength=${payFields[0]?.maxLength}`);
  } else {
    finding('PAYMT', `⚠️  Find button non trovato. Input: "${payFields[0]?.id}" — il campo potrebbe usare un selettore diverso`);
    finding('PAYMT', 'Pattern da provare: cerca tutti gli elementi vicino all\'input PAYMTERMID con tag a/button/img');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 9 — PEC
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 9: PEC ══');

  const pecFields = await discover(page, /LEGALEMAIL.*_I$|PEC.*_I$/);
  log('  Discovery:', pecFields);
  report.fields['pec'] = pecFields;

  if (pecFields[0]) {
    finding('PEC', `id="${pecFields[0].id}"  maxLength=${pecFields[0].maxLength}`);
    const pecR = await typeField(page, /LEGALEMAIL.*_I$|PEC.*_I$/, TEST.pec, { waitAfterMs: 300 });
    log('  Typed:', pecR);
  } else {
    finding('PEC', '⚠️  Campo non trovato con LEGALEMAIL/PEC pattern');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 10 — SDI
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 10: SDI ══');

  const sdiFields = await discover(page, /LEGALAUTHORITY.*_I$|SDI.*_I$/);
  log('  Discovery:', sdiFields);
  report.fields['sdi'] = sdiFields;

  if (sdiFields[0]) {
    finding('SDI', `id="${sdiFields[0].id}"  maxLength=${sdiFields[0].maxLength}`);
    const sdiR = await typeField(page, /LEGALAUTHORITY.*_I$|SDI.*_I$/, TEST.sdi, { waitAfterMs: 300 });
    log('  Typed:', sdiR);
  } else {
    finding('SDI', '⚠️  Campo non trovato con LEGALAUTHORITY/SDI pattern');
  }

  await shot(page, '10-sdi-pec-compilati');

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 11 — VIA / INDIRIZZO
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 11: VIA / INDIRIZZO ══');

  const streetFields = await discover(page, /dviSTREET.*_I$|STREET.*_Edit_I$/);
  log('  Discovery:', streetFields);
  report.fields['street'] = streetFields;

  if (streetFields[0]) {
    finding('VIA', `id="${streetFields[0].id}"  maxLength=${streetFields[0].maxLength}`);
    const streetR = await typeField(page, /dviSTREET.*_I$|STREET.*_Edit_I$/, TEST.street, { waitAfterMs: 400 });
    log('  Typed:', streetR);
  } else {
    finding('VIA', '⚠️  Campo non trovato con STREET pattern');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPO 12 — CAP + auto-fill città/provincia/regione/paese
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPO 12: CAP (lookup) ══');

  const capInput   = await discover(page, /LOGISTICSADDRESSZIPCODE.*_I$/);
  const capFindBtn = await discover(page, /LOGISTICSADDRESSZIPCODE.*_B0$/);
  log('  CAP input:', capInput);
  log('  CAP find button:', capFindBtn);
  report.fields['cap'] = { input: capInput, findBtn: capFindBtn };

  finding('CAP', `Input id="${capInput[0]?.id}"  maxLength=${capInput[0]?.maxLength}`);
  finding('CAP', `Find button id="${capFindBtn[0]?.id}" — usa selectFromDevExpressLookup`);

  // Snapshot prima del CAP per vedere cosa cambia dopo il lookup
  const snapBeforeCap = await snapshot(page);

  // Apri il dialog e documentalo (poi chiudi senza selezionare)
  if (capFindBtn[0]) {
    await page.evaluate(id => { document.getElementById(id)?.click(); }, capFindBtn[0].id);
    await wait(1500);
    await shot(page, '12-cap-dialog');

    const dialogStructure = await page.evaluate(() => {
      const popups = Array.from(document.querySelectorAll('.dxpcLite, .dxpcWindow, [id*="PopupControl"]'))
        .filter(el => el.offsetParent !== null);
      const iframes = Array.from(document.querySelectorAll('iframe')).filter(el => el.offsetParent !== null);
      const searchInputs = Array.from(document.querySelectorAll('input')).filter(el => el.offsetParent !== null && el.id);
      return {
        popupIds: popups.map(p => p.id),
        iframeIds: iframes.map(f => f.id),
        visibleInputIds: searchInputs.map(i => i.id).slice(0, 20),
      };
    });
    log('  Dialog structure:', dialogStructure);
    report.fields['cap_dialog'] = dialogStructure;
    finding('CAP_DIALOG', `popup=${dialogStructure.popupIds.join(',')}  iframe=${dialogStructure.iframeIds.join(',')}`);

    // Chiudi senza selezionare
    await page.keyboard.press('Escape');
    await wait(500);
    await waitIdle(page, 'cap-dialog-close', 3000);
  }

  // Ora leggi i campi Città/Provincia/Regione/Paese per documentare i loro ID
  const addrFields = {};
  for (const [name, re] of [
    ['city',     /CITY.*_I$/],
    ['province', /COUNTY.*_I$|STATEID.*_I$|PROVINCE.*_I$/],
    ['region',   /STATE_Edit_I$|REGION.*_I$/],
    ['country',  /COUNTRYREGIONID.*_I$|COUNTRY.*_Edit_I$/],
  ]) {
    const f = await discover(page, re);
    addrFields[name] = f;
    log(`  ${name.toUpperCase()}: ${JSON.stringify(f)}`);
    if (f[0]) finding('CAP_AUTOFILL', `${name}: id="${f[0].id}"  maxLength=${f[0].maxLength}  readOnly=${f[0].readOnly}`);
  }
  report.fields['address'] = addrFields;
  finding('CAP', 'Questi campi vengono auto-compilati dopo lookup CAP — NON digitare manualmente');

  await shot(page, '12-address-fields');

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPI 13-16 — TELEFONO, CELLULARE, EMAIL, URL
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ CAMPI 13-16: CONTATTI ══');

  const contactDefs = [
    { key: 'phone',  re: /dviPHONE.*_I$|PHONE.*_Edit_I$/,         val: TEST.phone  },
    { key: 'mobile', re: /CELLULARPHONE.*_I$|MOBILE.*_Edit_I$/,    val: TEST.mobile },
    { key: 'email',  re: /dviEMAIL.*_I$|EMAIL.*_Edit_I$/,          val: TEST.email  },
    { key: 'url',    re: /dviURL.*_I$|URL.*_Edit_I$/,              val: TEST.url    },
  ];

  for (const def of contactDefs) {
    const f = await discover(page, def.re);
    log(`  ${def.key.toUpperCase()} discovery:`, f);
    report.fields[def.key] = f;

    if (f[0]) {
      finding('CONTATTI', `${def.key}: id="${f[0].id}"  maxLength=${f[0].maxLength}`);
      const r = await typeField(page, def.re, def.val, { waitAfterMs: 250 });
      log(`  ${def.key} typed:`, r);
    } else {
      finding('CONTATTI', `${def.key}: ⚠️  campo non trovato`);
    }
  }

  // Controlla il warning icon sull'URL
  const urlWarning = await page.evaluate(() => {
    const urlEl = Array.from(document.querySelectorAll('input')).find(i => /URL.*_Edit_I$|dviURL/.test(i.id));
    if (!urlEl) return null;
    const container = urlEl.closest('td') || urlEl.parentElement;
    const warningEl = container?.querySelector('[class*="warn"], [class*="error"], [class*="alert"], img');
    return warningEl
      ? { found: true, tagName: warningEl.tagName, classes: warningEl.className.substring(0, 80), title: warningEl.title || '' }
      : { found: false };
  });
  log('  URL warning:', urlWarning);
  report.fields['url_warning'] = urlWarning;
  if (urlWarning?.found) finding('URL', `Warning icon rilevato: class="${urlWarning.classes}" title="${urlWarning.title}"`);
  else                    finding('URL', 'Nessun warning icon sul campo URL (o scompare dopo digitazione)');

  await shot(page, '16-contatti-compilati');

  // ══════════════════════════════════════════════════════════════════════════
  // TAB: PREZZI E SCONTI
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ TAB: PREZZI E SCONTI ══');

  const tabOk = await openTab(page, 'Prezzi e sconti');
  finding('TAB_PREZZI', `Tab aperta: ${tabOk}`);

  if (tabOk) {
    await shot(page, '17-tab-prezzi-sconti');

    // Tutti i campi nella tab
    const prezziFields = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input, select'))
        .filter(el => el.offsetParent !== null && el.id)
        .map(el => ({ id: el.id, type: el.type, maxLength: el.maxLength > 0 ? el.maxLength : null, value: el.value.substring(0,60) }))
    );
    log('  Campi in tab Prezzi e Sconti:', prezziFields);
    report.fields['tab_prezzi_all'] = prezziFields;

    // GRUPPO DI PREZZO
    let priceGroupF = await discover(page, /PRICEGROUP.*_I$|LINEPRICETYPE.*_I$/);
    if (priceGroupF.length === 0) priceGroupF = await discoverByLabel(page, 'GRUPPO DI PREZZO:');
    log('  GRUPPO PREZZO:', priceGroupF);
    report.fields['priceGroup'] = priceGroupF;

    if (priceGroupF[0]) {
      finding('GRUPPO_PREZZO', `id="${priceGroupF[0].id}"  valore attuale="${priceGroupF[0].value}"  maxLength=${priceGroupF[0].maxLength}`);

      // Enumera opzioni
      const pgDropBtnId = priceGroupF[0].id.replace(/_I$/, '_DD_B').replace(/_DD_I$/, '_DD_B');
      const pgOptions = await enumComboOptions(page, new RegExp(pgDropBtnId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      log('  Opzioni Gruppo Prezzo:', pgOptions);
      report.comboOptions['priceGroup'] = pgOptions;
      finding('GRUPPO_PREZZO', `Opzioni: ${pgOptions.join(' | ')}`);
      await shot(page, '17b-gruppo-prezzo-opzioni');

      // Verifica se è già su "DETTAGLIO"
      const isDettaglio = priceGroupF[0].value.toUpperCase().includes('DETTAGLIO');
      finding('GRUPPO_PREZZO', `Già su DETTAGLIO: ${isDettaglio} — ${isDettaglio ? 'nessuna azione richiesta' : 'deve essere impostato'}`);
    } else {
      finding('GRUPPO_PREZZO', '⚠️  Campo non trovato — verificare ID nella tab Prezzi e Sconti');
    }

    // SCONTO LINEA
    const linediscF = await discover(page, /LINEDISC.*_I$/);
    log('  SCONTO LINEA:', linediscF);
    report.fields['lineDiscount'] = linediscF;

    if (linediscF[0]) {
      const ldOptions = await enumComboOptions(page, /LINEDISC.*_DD_B$/);
      log('  Opzioni Sconto Linea:', ldOptions);
      report.comboOptions['lineDiscount'] = ldOptions;
      finding('SCONTO_LINEA', `id="${linediscF[0].id}"  opzioni: ${ldOptions.join(' | ')}`);
      await shot(page, '17c-sconto-linea-opzioni');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB: INDIRIZZO ALTERNATIVO
  // Obiettivo: scoprire la struttura della griglia, i dati per riga, e capire
  // se è possibile un approccio check+modify invece di delete-all+re-insert.
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ TAB: INDIRIZZO ALTERNATIVO ══');

  await openTab(page, 'Indirizzo alt');
  await shot(page, '19-tab-indirizzo-alt');

  // ── A. Scopri il nome del grid control DevExpress ─────────────────────────
  const altGridName = await page.evaluate(() => {
    const w = window;
    if (!w.ASPxClientControl?.GetControlCollection) return null;
    let found = null;
    w.ASPxClientControl.GetControlCollection().ForEachControl(c => {
      const name = c?.name || c?.GetName?.() || '';
      if (name.includes('ADDRESSes') && typeof c?.AddNewRow === 'function') found = name;
    });
    return found;
  });
  log('  Grid control name:', altGridName);
  report.fields['altGrid_controlName'] = altGridName;
  finding('ALT_ADDR', `Grid control name: "${altGridName}" — usato per AddNewRow() e UpdateEdit()`);

  // ── B. Leggi le righe esistenti e la loro struttura completa ─────────────
  const altGridState = await page.evaluate(() => {
    const grid = document.querySelector('[id*="ADDRESSes"][class*="dxgvControl"]');
    if (!grid) return { gridId: null, rowCount: 0, rows: [], headerCells: [] };

    const headerCells = Array.from(grid.querySelectorAll('[class*="dxgvHeader"] th, [class*="dxgvHeader"] td'))
      .map(th => ({ id: th.id, text: (th.textContent || '').trim() }))
      .filter(h => h.text);

    const dataRows = Array.from(grid.querySelectorAll('[class*="dxgvDataRow_"]'));

    const rows = dataRows.map((row, idx) => {
      const cells = Array.from(row.querySelectorAll('td')).map(td => ({
        id: td.id,
        text: (td.textContent || '').trim().substring(0, 80),
        // Cerca input inline (per capire se la cella è editabile inline)
        hasInput: !!td.querySelector('input, select'),
        inputId: td.querySelector('input')?.id ?? null,
      }));
      const selBtn = row.querySelector('[id*="DXSelBtn"]');
      const editBtn = row.querySelector('[id*="Edit"], img[title*="Modifica"], a[title*="Edit"]');
      return {
        rowIndex: idx,
        cells,
        selBtnId: selBtn?.id ?? null,
        editBtnId: editBtn?.id ?? null,
        // Estrai i valori delle celle non-vuote come snapshot del record
        values: cells.filter(c => c.text).map(c => c.text),
      };
    });

    return {
      gridId: grid.id,
      rowCount: dataRows.length,
      rows,
      headerCells,
    };
  });

  log('  Grid state:', JSON.stringify(altGridState, null, 2));
  report.fields['altGrid_state'] = altGridState;
  finding('ALT_ADDR', `Grid id="${altGridState.gridId}"  righe esistenti=${altGridState.rowCount}`);
  finding('ALT_ADDR', `Intestazioni colonne: ${altGridState.headerCells.map(h => h.text).join(' | ')}`);

  if (altGridState.rowCount > 0) {
    altGridState.rows.forEach((r, i) =>
      finding('ALT_ADDR', `Riga ${i}: ${r.values.join(' | ')}`));
  } else {
    finding('ALT_ADDR', 'Griglia vuota — nessun indirizzo alternativo presente');
  }

  // ── C. Studia se una riga può essere editata inline (click su riga) ───────
  // L'approccio attuale (delete-all + re-insert) è distruttivo.
  // Se la griglia supporta edit-in-place, possiamo fare check+modify.
  const inlineEditSupport = await page.evaluate(() => {
    const w = window;
    if (!w.ASPxClientControl?.GetControlCollection) return { supported: false, reason: 'no-collection' };
    let gridCtrl = null;
    w.ASPxClientControl.GetControlCollection().ForEachControl(c => {
      if ((c?.name || '').includes('ADDRESSes') && typeof c?.AddNewRow === 'function') gridCtrl = c;
    });
    if (!gridCtrl) return { supported: false, reason: 'grid-not-found' };

    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(gridCtrl))
      .filter(m => /edit|update|start/i.test(m));
    const hasStartEdit = typeof gridCtrl.StartEditRow === 'function';
    const hasUpdateEdit = typeof gridCtrl.UpdateEdit === 'function';
    const hasGetRowValues = typeof gridCtrl.GetRowValues === 'function';

    return {
      supported: hasStartEdit,
      hasStartEdit,
      hasUpdateEdit,
      hasGetRowValues,
      availableEditMethods: methods,
      reason: hasStartEdit ? 'StartEditRow available' : 'StartEditRow missing',
    };
  });

  log('  Inline edit support:', inlineEditSupport);
  report.fields['altGrid_inlineEdit'] = inlineEditSupport;

  if (inlineEditSupport.hasStartEdit) {
    finding('ALT_ADDR', '✅ INLINE EDIT SUPPORTATO: StartEditRow() disponibile → possibile approccio check+modify');
    finding('ALT_ADDR', `Metodi disponibili: ${inlineEditSupport.availableEditMethods?.join(', ')}`);
  } else {
    finding('ALT_ADDR', `⚠️  StartEditRow() NON disponibile — ${inlineEditSupport.reason}`);
    finding('ALT_ADDR', 'Possibile approccio alternativo: click sulla riga per aprirla in edit mode tramite click su cella');
  }

  // ── D. Se ci sono righe, tenta di leggere i valori strutturati via GetRowValues ──
  if (altGridState.rowCount > 0 && inlineEditSupport.hasGetRowValues) {
    const rowValues = await page.evaluate(gridName => {
      const w = window;
      let gridCtrl = null;
      w.ASPxClientControl.GetControlCollection().ForEachControl(c => {
        if ((c?.name || '') === gridName) gridCtrl = c;
      });
      if (!gridCtrl) return null;
      try {
        // GetRowValues(visibleIndex, fieldNames, callback)
        // fieldsNames = null → tutti i campi
        const result = [];
        for (let i = 0; i < gridCtrl.GetVisibleRowsOnPage?.() ?? 1; i++) {
          const vals = gridCtrl.GetRowValues?.(i, null, v => result.push(v));
          if (!vals && result.length === 0) break;
        }
        return result;
      } catch (e) {
        return { error: e.message };
      }
    }, altGridName);
    log('  GetRowValues result:', rowValues);
    report.fields['altGrid_rowValues'] = rowValues;
    finding('ALT_ADDR', `GetRowValues() result: ${JSON.stringify(rowValues)?.substring(0, 200)}`);
  }

  // ── E. Documenta la logica check+modify raccomandata ─────────────────────
  finding('ALT_ADDR', '--- APPROCCIO CONSIGLIATO (da implementare nel bot refactor) ---');
  finding('ALT_ADDR', '1. Leggi righe esistenti via GetRowValues() o DOM cell text');
  finding('ALT_ADDR', '2. Per ogni indirizzo in input: cerca una riga con stesso tipo (AlternateDelivery/Business/Facture)');
  finding('ALT_ADDR', '3. Se trovata: usa StartEditRow(idx) → modifica solo i campi cambiati → UpdateEdit()');
  finding('ALT_ADDR', '4. Se non trovata: AddNewRow() → compila tutti i campi → UpdateEdit()');
  finding('ALT_ADDR', '5. Righe in eccesso (tipo non più presente in input): seleziona + elimina');
  finding('ALT_ADDR', 'Questo evita di cancellare e reinserire dati invariati — meno callback ERP, meno rischio corruzione');

  // ── F. Aggiungi una riga di test per studiare la struttura del form inline ──
  log('  Test: aggiunta riga per studio struttura inline...');
  if (altGridName) {
    await page.evaluate(gridName => {
      const w = window;
      let gridCtrl = null;
      w.ASPxClientControl.GetControlCollection().ForEachControl(c => {
        if ((c?.name || '') === gridName) gridCtrl = c;
      });
      gridCtrl?.AddNewRow?.();
    }, altGridName);
    await waitIdle(page, 'alt-addnew', 5000);
    await shot(page, '19b-alt-addr-new-row');

    // Scopri i campi della riga in edit mode
    const newRowFields = await page.evaluate(() => {
      const grid = document.querySelector('[id*="ADDRESSes"][class*="dxgvControl"]');
      if (!grid) return [];
      return Array.from(grid.querySelectorAll('input, select, textarea'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({
          id: el.id, tagName: el.tagName, type: el.type,
          maxLength: el.maxLength > 0 ? el.maxLength : null,
          value: el.value.substring(0, 60),
        }));
    });
    log('  Campi nella riga nuova:', newRowFields);
    report.fields['altGrid_newRowFields'] = newRowFields;
    newRowFields.forEach(f =>
      finding('ALT_ADDR_FIELDS', `id="${f.id}"  type=${f.type}  maxLength=${f.maxLength}`));

    // Leggi anche le colonne della griglia quando la riga è in edit
    const editRowCols = await page.evaluate(() => {
      // DevExpress mette la riga in edit mode con classe specifica
      const editRow = document.querySelector('[id*="ADDRESSes"] [class*="dxgvEditingRow"], [id*="ADDRESSes"] [class*="EditRow"]');
      if (!editRow) return null;
      return {
        rowClass: editRow.className,
        cellsWithInputs: Array.from(editRow.querySelectorAll('td'))
          .map(td => ({
            tdId: td.id,
            inputId: td.querySelector('input')?.id ?? null,
            inputMaxLen: (td.querySelector('input'))?.maxLength > 0 ? td.querySelector('input').maxLength : null,
            comboId: Array.from(td.querySelectorAll('[id*="_DD_B"], [id*="_DD_I"]')).map(el => el.id),
            lookupBtnId: Array.from(td.querySelectorAll('[id*="_B0"]')).map(el => el.id),
          }))
          .filter(c => c.inputId || c.comboId.length > 0 || c.lookupBtnId.length > 0),
      };
    });
    log('  Edit row columns structure:', editRowCols);
    report.fields['altGrid_editRowCols'] = editRowCols;

    // Annulla la riga (Cancel) senza salvare
    await page.evaluate(gridName => {
      const w = window;
      let gridCtrl = null;
      w.ASPxClientControl.GetControlCollection().ForEachControl(c => {
        if ((c?.name || '') === gridName) gridCtrl = c;
      });
      gridCtrl?.CancelEdit?.();
    }, altGridName);
    await waitIdle(page, 'alt-cancel', 3000);
    finding('ALT_ADDR', 'Riga di test annullata con CancelEdit() — nessun dato modificato');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCAN: CAMPI OBBLIGATORI / REQUIRED / WARNING
  // Torna sulla tab Principale per scansionare i marker visivi di obbligatorietà
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ SCAN: CAMPI OBBLIGATORI / REQUIRED ══');

  await openTab(page, 'Principale');
  await shot(page, '20-scan-required-fields');

  const requiredScan = await page.evaluate(() => {
    // Strategia 1: attributo HTML required
    const htmlRequired = Array.from(document.querySelectorAll('input[required], textarea[required], select[required]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, source: 'html-required', value: el.value }));

    // Strategia 2: asterisco (*) nel testo del label associato
    const labelAsterisk = [];
    for (const label of document.querySelectorAll('td, span, div, label')) {
      const text = label.textContent?.trim() ?? '';
      if (text.endsWith('*') || text.endsWith(':*') || text.includes(' *')) {
        const row = label.closest('tr') || label.parentElement;
        const inputs = row ? Array.from(row.querySelectorAll('input, textarea, select'))
          .filter(el => el.offsetParent !== null && el.id)
          : [];
        if (inputs.length > 0) {
          labelAsterisk.push({
            label: text.replace(/[:*\s]+$/, '').trim(),
            inputs: inputs.map(i => ({ id: i.id, value: i.value.substring(0, 40) })),
            source: 'asterisk-label',
          });
        }
      }
    }

    // Strategia 3: classi CSS DevExpress per campi con errore/warning
    const dxErrors = Array.from(document.querySelectorAll(
      '[class*="dxv-errorCell"], [class*="dxeErrorFrame"], [class*="dxv-errorText"], [class*="dxeInvalid"]'
    ))
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        id: el.id,
        className: el.className.substring(0, 80),
        text: (el.textContent || '').trim().substring(0, 60),
        source: 'dx-error-class',
      }));

    // Strategia 4: icone warning (img con alt/title warning o classi alert)
    const warningIcons = Array.from(document.querySelectorAll('img, span[class*="warn"], span[class*="alert"], span[class*="Error"]'))
      .filter(el => {
        if (el.offsetParent === null) return false;
        const title = el.title || el.alt || el.className || '';
        return /warn|error|alert|invalid|required/i.test(title);
      })
      .map(el => ({
        id: el.id,
        tagName: el.tagName,
        title: el.title || '',
        alt: el.alt || '',
        className: el.className.substring(0, 60),
        nearText: (el.closest('tr')?.textContent || el.parentElement?.textContent || '').trim().substring(0, 60),
        source: 'warning-icon',
      }));

    // Strategia 5: testo "non deve essere vuoto" / "obbligatorio" visibile
    const validationTexts = Array.from(document.querySelectorAll('[class*="dxv-"], [class*="dxe"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => (el.textContent || '').trim())
      .filter(t => /obbligatori|vuoto|required|mandatory|non deve/i.test(t))
      .filter(Boolean);

    return { htmlRequired, labelAsterisk, dxErrors, warningIcons, validationTexts };
  });

  log('  HTML required:', requiredScan.htmlRequired);
  log('  Label asterisk:', requiredScan.labelAsterisk);
  log('  DX error classes:', requiredScan.dxErrors);
  log('  Warning icons:', requiredScan.warningIcons);
  log('  Validation texts:', requiredScan.validationTexts);
  report.fields['required_scan'] = requiredScan;

  if (requiredScan.htmlRequired.length > 0) {
    finding('REQUIRED', `HTML required: ${requiredScan.htmlRequired.map(f => f.id).join(', ')}`);
  }
  requiredScan.labelAsterisk.forEach(l =>
    finding('REQUIRED', `Label con asterisco "${l.label}": ${l.inputs.map(i => i.id).join(', ')}`));
  if (requiredScan.dxErrors.length > 0) {
    finding('REQUIRED', `Classi DX error visibili: ${requiredScan.dxErrors.map(e => e.id || e.text).join(' | ')}`);
  }
  if (requiredScan.warningIcons.length > 0) {
    requiredScan.warningIcons.forEach(w =>
      finding('REQUIRED', `Warning icon: "${w.nearText.substring(0, 50)}" → ${w.className}`));
  }
  if (requiredScan.validationTexts.length > 0) {
    finding('REQUIRED', `Testi di validazione visibili: ${requiredScan.validationTexts.join(' | ')}`);
  }

  // Scansiona anche le altre tab per warning visibili
  for (const tabName of ['Prezzi e sconti', 'Indirizzo alt']) {
    await openTab(page, tabName);
    const tabWarnings = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="dxv-errorCell"], [class*="dxeInvalid"], img[title*="warn"]'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({ id: el.id, text: (el.textContent || '').trim().substring(0, 60), cls: el.className.substring(0, 60) }))
    );
    if (tabWarnings.length > 0) {
      finding('REQUIRED', `Tab "${tabName}" — warning visibili: ${JSON.stringify(tabWarnings).substring(0, 200)}`);
    } else {
      finding('REQUIRED', `Tab "${tabName}" — nessun warning visibile`);
    }
  }

  await openTab(page, 'Principale');

  // ══════════════════════════════════════════════════════════════════════════
  // DOCUMENTAZIONE: MODALE "FONDERSI" (CONCURRENT EDIT CONFLICT)
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ DOCUMENTAZIONE: MODALE "FONDERSI" ══');

  // La modale "Fondersi" / "Merge" appare quando:
  //   - Un altro utente (o un'altra sessione dello stesso utente) ha modificato
  //     la stessa scheda cliente MENTRE il nostro bot la teneva aperta.
  //   - L'ERP rileva il conflitto al momento del salvataggio e propone di
  //     "fondere" le due versioni invece di sovrascrivere.
  //
  // NON è un duplicato di cliente — è un conflitto di versione concorrente.
  //
  // Gestione attuale nel bot (archibald-bot.ts, saveAndCloseCustomer):
  //   1. Dopo click "Salva e chiudi" → waitForDevExpressIdle
  //   2. Cerca: Array.from(document.querySelectorAll('a, span, button, td'))
  //             .find(el => el.textContent?.trim() === 'Fondersi' || === 'Merge')
  //   3. Se trovato: click sull'elemento
  //   4. waitForDevExpressIdle 3000ms
  //   5. Il salvataggio prosegue normalmente
  //
  //   NOTA: il check avviene in DUE punti:
  //     - Immediatamente dopo il primo click "Salva e chiudi"
  //     - Dopo il secondo click (post-warning checkbox)
  //   Questo perché in rari casi la modale appare con delay.
  //
  //   Scenari che la scatenano:
  //     - Bot A apre cliente → Bot B (altra sessione) modifica e salva → Bot A tenta save
  //     - Sync automatica modifica il cliente mentre il bot lo stava editando
  //     - Utente apre la scheda manualmente dalla PWA nello stesso momento

  // Verifica se è visibile ora (improbabile senza save, ma documentiamo)
  const fondersiNow = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('a, span, button, td'))
      .find(e => {
        const t = e.textContent?.trim();
        return (t === 'Fondersi' || t === 'Merge') && e.offsetParent !== null;
      });
    return el ? { found: true, tagName: el.tagName, id: el.id, text: el.textContent?.trim() } : { found: false };
  });
  log('  Fondersi visibile ora:', fondersiNow);
  report.fields['fondersi_pre_save'] = fondersiNow;

  finding('FONDERSI', `Visibile pre-save: ${fondersiNow.found} (atteso: false — appare solo dopo save con conflitto)`);
  finding('FONDERSI', 'Selettore: elementi con textContent "Fondersi" o "Merge" && offsetParent !== null');
  finding('FONDERSI', 'Gestione: click sul bottone → waitIdle 3s → il save prosegue');
  finding('FONDERSI', 'Causa: conflitto di versione concorrente (altra sessione modificò il record nel frattempo)');
  finding('FONDERSI', 'Da studiare nel dump-update-customer.mjs: simulare due sessioni aperte per riprodurre il conflitto');

  await shot(page, '20b-fondersi-check');

  // ══════════════════════════════════════════════════════════════════════════
  // SEZIONE DOCUMENTAZIONE: WARNING AL SALVATAGGIO
  // (non salviamo — documentazione basata sul codice già implementato)
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ DOCUMENTAZIONE: WARNING AL SALVATAGGIO ══');

  // L'ERP mostra una o più di queste dialog DOPO aver cliccato "Salva e chiudi"
  // quando alcuni campi obbligatori/consigliati sono vuoti o non validi.
  //
  // Meccanismo noto dal codice esistente (archibald-bot.ts + e2e-customer-creation.mjs):
  //
  //   1. DevExpress "ErrorInfo" checkbox
  //      Selettore:  input[id$="_ErrorInfo_Ch_S"]
  //      Wrapper:    span[id$="_ErrorInfo_Ch_S_D"]
  //      Testo link: "Ignore warnings" / "Ignora avvisi"
  //      Come agire: SetChecked(true) via ASPxClientControl o window[id].SetChecked(true)
  //                  oppure click nativo sull'input
  //
  //   2. Dopo aver spuntato il checkbox → recliccare "Salva e chiudi"
  //      (il salvataggio non avviene automaticamente)
  //
  //   3. Campi che tipicamente scatenano warning se vuoti:
  //      - Settore (SECTOR/SEGMENT)
  //      - Termini Pagamento (PAYMTERMID) — campo lookup
  //      - Modalità Consegna (DLVMODE) — se rimasto N/A
  //      - Codice Fiscale (CF) — se diverso dalla P.IVA e non validato
  //      - Gruppo di Prezzo — se non impostato a DETTAGLIO
  //
  //   L'ERP PERMETTE COMUNQUE il salvataggio dopo aver confermato i warning.
  //   Non esistono campi che BLOCCANO in modo definitivo (eccetto P.IVA mancante).

  // Verifica se ci sono già warning visibili ADESSO (senza aver salvato)
  const warningNow = await page.evaluate(() => {
    const cb = document.querySelector('input[id$="_ErrorInfo_Ch_S"]');
    const ignoreLink = Array.from(document.querySelectorAll('a, span, div'))
      .find(el => el.textContent?.trim() === 'Ignore warnings' || el.textContent?.trim() === 'Ignora avvisi');
    const validationErrors = Array.from(document.querySelectorAll('[class*="dxv-errorCell"], [class*="ErrorText"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => el.textContent?.trim())
      .filter(Boolean);
    return { checkboxVisible: !!cb, ignoreLinkVisible: !!ignoreLink, validationErrors };
  });
  log('  Warning visibili pre-save:', warningNow);
  report.fields['warnings_pre_save'] = warningNow;

  if (warningNow.validationErrors.length > 0) {
    finding('WARNING', `Errori validazione visibili PRIMA del save: ${warningNow.validationErrors.join(' | ')}`);
  } else {
    finding('WARNING', 'Nessun warning visibile pre-save (compaiono solo dopo click su "Salva e chiudi")');
  }

  finding('WARNING', 'Flusso completo post-save (da codice esistente): clicca "Salva e chiudi" → wait 2s → cerca input[id$="_ErrorInfo_Ch_S"] → SetChecked(true) → reclicca "Salva e chiudi"');
  finding('WARNING', 'NOTA: per studiare i warning reali in azione usare dump-update-customer.mjs che salva su cliente esistente');

  await shot(page, '18-warnings-check');

  // ══════════════════════════════════════════════════════════════════════════
  // SNAPSHOT FINALE
  // ══════════════════════════════════════════════════════════════════════════
  log('\n══ SNAPSHOT FINALE ══');
  await openTab(page, 'Principale');
  await shot(page, '18-stato-finale-principale');

  const finalSnap = await snapshot(page);
  report.fields['_final_snapshot'] = finalSnap;

  const totalAutoFilled = Object.values(report.autoFill).reduce((acc, obj) => acc + Object.keys(obj).length, 0);
  finding('SUMMARY', `Campi auto-compilati totali rilevati: ${totalAutoFilled}`);
  finding('SUMMARY', `Campi con trovati: ${Object.keys(report.fields).filter(k => !k.startsWith('_')).length}`);
  finding('SUMMARY', `⚠️  NESSUN SALVATAGGIO — form lasciato aperto`);

  // ─── Salva report ──────────────────────────────────────────────────────────
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  log('\n══════════════════════════════════════════');
  log('  FINDINGS RIASSUNTIVI');
  log('══════════════════════════════════════════');
  report.findings.forEach((f, i) => log(`${String(i + 1).padStart(2, ' ')}. [${f.category}] ${f.msg}`));

  log(`\n✅  Report JSON: ${REPORT_FILE}`);
  log(`✅  Screenshot:  ${SCREENSHOT_DIR}/`);

  if (process.env.AUTO_CLOSE === '1') {
    log('AUTO_CLOSE=1 → chiusura browser automatica');
    await browser.close();
  } else {
    log('\n⚠️  Browser aperto. Premi Ctrl+C per chiudere.');
    await new Promise(() => {});
  }
}

main().catch(e => {
  console.error('ERRORE FATALE:', e);
  process.exit(1);
});

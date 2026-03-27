/**
 * dump-remaining-fields.mjs
 *
 * Script diagnostico per i campi ancora da certificare:
 *  1. CAP e Email nel form principale
 *  2. PAYMTERMID — studia il dialog lookup (click _B0Img)
 *  3. Alt Addr CRUD completo:
 *       a. New → compila tutti i campi → UpdateEdit (salva riga)
 *       b. Verifica riga appare nella griglia
 *       c. StartEditRow(0) → modifica NAME → UpdateEdit
 *       d. DeleteRow(0) → verifica griglia vuota
 *  4. Alt Addr CAP (LOGISTICSADDRESSZIPCODE) — studia il lookup
 *  5. TUTTO SENZA COMMIT: cancel del form padre alla fine
 *
 * Cliente di test: 55839 — Pescuma Dr. Saverio
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); } catch {}

const ARCHIBALD_URL  = (process.env.ARCHIBALD_URL || 'https://4.231.124.90/Archibald').replace(/\/$/, '');
const ARCHIBALD_USER = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const ARCHIBALD_PASS = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/remaining-fields-dump';
const REPORT_FILE    = path.join(SCREENSHOT_DIR, 'remaining-report.json');
const CUSTOMER_ID    = '55839';

const report = { timestamp: new Date().toISOString(), findings: [], fields: {}, altAddr: {} };
let shotIdx = 0;

function ts()  { return new Date().toISOString().slice(11, 23); }
function log(msg, data) {
  process.stdout.write(`[${ts()}] ${msg}\n`);
  if (data !== undefined) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function cssEscape(id) { return id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1'); }
function finding(cat, msg) {
  report.findings.push({ cat, msg, ts: ts() });
  log(`  [${cat}] ${msg}`);
}

async function shot(page, label) {
  const p = path.join(SCREENSHOT_DIR, `rem-${String(++shotIdx).padStart(3,'0')}-${label.replace(/[^a-z0-9]/gi,'-')}.png`);
  try { await page.screenshot({ path: p, fullPage: true }); log(`📸 ${path.basename(p)}`); }
  catch (e) { log(`Screenshot fail: ${e.message}`); }
}

async function waitIdle(page, label = '', ms = 10000) {
  try {
    await page.waitForFunction(() => {
      const w = window;
      if (typeof w.ASPx !== 'undefined') {
        const p = (w.ASPx._pendingCallbacks||0)+(w.ASPx._sendingRequests||0)+(w.ASPx._pendingRequestCount||0);
        if (p > 0) return false;
      }
      const col = w.ASPxClientControl?.GetControlCollection?.();
      if (col) { let busy=false; try{col.ForEachControl(c=>{if(c?.InCallback?.())busy=true;});}catch{} if(busy)return false; }
      return true;
    }, { timeout: ms, polling: 150 });
  } catch { log(`  waitIdle timeout (${label})`); }
}

async function waitReady(page, ms = 15000) {
  try {
    await page.waitForFunction(() =>
      document.readyState === 'complete' && typeof window.ASPxClientControl !== 'undefined',
    { timeout: ms, polling: 200 });
    await waitIdle(page, 'ready', ms);
  } catch { log('  waitReady timeout'); }
}

function discover(page, idRegex) {
  return page.evaluate(re => {
    const pat = new RegExp(re);
    return Array.from(document.querySelectorAll('input, textarea, select'))
      .filter(el => el.offsetParent !== null && pat.test(el.id))
      .map(el => ({ id: el.id, tagName: el.tagName, type: el.type||el.tagName.toLowerCase(),
        maxLength: el.maxLength > 0 ? el.maxLength : null,
        value: (el.value||'').substring(0, 120), readOnly: el.readOnly||false, disabled: el.disabled||false }));
  }, idRegex.source || String(idRegex));
}

async function enumComboOptions(page, idRegex) {
  const reStr = idRegex.source || String(idRegex);
  const readViaApi = () => page.evaluate(re => {
    const pat = new RegExp(re);
    const input = Array.from(document.querySelectorAll('input')).find(i => i.offsetParent !== null && pat.test(i.id));
    if (!input) return null;
    const col = window.ASPxClientControl?.GetControlCollection?.();
    if (!col) return [];
    const items = [];
    col.ForEachControl(c => {
      if (items.length) return;
      try {
        const direct  = c.GetInputElement?.()?.id === input.id;
        const contains = !direct && c.GetMainElement?.()?.contains(input) && typeof c.GetItemCount === 'function';
        if (!direct && !contains) return;
        if (typeof c.GetItemCount !== 'function') return;
        const n = c.GetItemCount();
        for (let i = 0; i < n; i++) { const item = c.GetItem?.(i); if (item?.text != null) items.push(item.text); }
      } catch {}
    });
    return items;
  }, reStr);
  const direct = await readViaApi();
  if (direct === null) return [];
  if (direct.length > 0) return direct;
  const triggered = await page.evaluate(re => {
    const pat = new RegExp(re);
    const input = Array.from(document.querySelectorAll('input')).find(i => i.offsetParent !== null && pat.test(i.id));
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
    return done;
  }, reStr);
  if (!triggered) return [];
  await waitIdle(page, 'enum-lazy', 5000);
  await wait(300);
  const afterLoad = await readViaApi();
  if (afterLoad && afterLoad.length > 0) { await page.keyboard.press('Escape'); await wait(200); return afterLoad; }
  const domItems = await page.evaluate(() => {
    for (const sel of ['.dxeListBoxItem_XafTheme','[class*="dxeListBoxItem"]','[id*="_DDD_L_LBT"] td','[id*="_DDLB"] li']) {
      const items = Array.from(document.querySelectorAll(sel)).filter(el=>el.offsetParent!==null).map(el=>el.textContent?.trim()).filter(Boolean);
      if (items.length) return items;
    }
    return [];
  });
  await page.keyboard.press('Escape'); await wait(200);
  return domItems;
}

async function setCombo(page, idRegex, value) {
  const result = await page.evaluate((re, val) => {
    const pat = new RegExp(re);
    const input = Array.from(document.querySelectorAll('input')).find(i => i.offsetParent !== null && pat.test(i.id));
    if (!input) return { found: false };
    input.scrollIntoView({ block: 'center' });
    const col = window.ASPxClientControl?.GetControlCollection?.();
    if (col) {
      let combo = null;
      col.ForEachControl(c => {
        if (combo) return;
        try {
          if (c.GetInputElement?.()?.id === input.id) combo = c;
          else { const main = c.GetMainElement?.(); if (main?.contains(input) && typeof c.SetSelectedIndex === 'function') combo = c; }
        } catch {}
      });
      if (combo && typeof combo.GetItemCount === 'function') {
        const n = combo.GetItemCount();
        for (let i = 0; i < n; i++) {
          const text = combo.GetItem?.(i)?.text;
          if (text === val) { combo.SetSelectedIndex(i); return { found: true, method: 'SetSelectedIndex', text }; }
        }
      }
    }
    return { found: false, inputId: input.id };
  }, idRegex.source || String(idRegex), value);
  await waitIdle(page, `combo-${value}`, 5000);
  return result;
}

async function typeField(page, idRegex, value, { waitAfterMs = 800 } = {}) {
  const inputId = await page.evaluate(re => {
    const pat = new RegExp(re);
    const el = Array.from(document.querySelectorAll('input, textarea')).find(i => i.offsetParent !== null && pat.test(i.id));
    if (!el) return null;
    el.scrollIntoView({ block: 'center' }); el.focus(); el.click();
    if (typeof el.select === 'function') el.select();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, ''); else el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.id;
  }, idRegex.source || String(idRegex));
  if (!inputId) return { found: false };
  await page.type(`#${cssEscape(inputId)}`, value, { delay: 5 });
  await page.keyboard.press('Tab'); await wait(waitAfterMs);
  await waitIdle(page, `type-${inputId}`, 8000);
  const actual = await page.evaluate(id => document.getElementById(id)?.value ?? '', inputId);
  return { found: true, id: inputId, value: actual, ok: actual === value };
}

async function openTab(page, tabText) {
  const aliases = {
    'Principale':      ['Principale', 'Main'],
    'Prezzi e sconti': ['Prezzi e sconti', 'Price', 'Prezzi'],
    'Indirizzo alt':   ['Indirizzo alt', 'Alt. address', 'Indirizzo'],
  };
  const candidates = aliases[tabText] || [tabText];
  for (const cand of candidates) {
    const clicked = await page.evaluate(text => {
      for (const el of document.querySelectorAll('a.dxtc-link, span.dx-vam')) {
        if (el.textContent?.trim().includes(text) && el.offsetParent !== null) {
          (el.tagName === 'A' ? el : el.parentElement)?.click(); return true;
        }
      }
      for (const tab of document.querySelectorAll('li[id*="_pg_AT"]')) {
        const lnk = tab.querySelector('a.dxtc-link');
        const spn = tab.querySelector('span.dx-vam');
        if (spn?.textContent?.trim().includes(text) && lnk?.offsetParent !== null) { lnk.click(); return true; }
      }
      return false;
    }, cand);
    if (clicked) { await waitIdle(page, `tab-${cand}`, 6000); return true; }
  }
  log(`  ⚠️  Tab "${tabText}" non trovata`);
  return false;
}

async function login(page) {
  log('→ Login...');
  await page.goto(`${ARCHIBALD_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  if (!page.url().toLowerCase().includes('login')) { log('  Già autenticato'); return; }
  const userInputId = await page.evaluate(() => {
    const textInputs = Array.from(document.querySelectorAll('input'))
      .filter(i => i.type !== 'hidden' && i.type !== 'submit' && i.type !== 'button' && i.type !== 'password');
    const uField = textInputs.find(i => i.id.includes('UserName') || i.name.includes('UserName')) || textInputs[0];
    if (uField) { uField.scrollIntoView(); uField.focus(); }
    return uField?.id ?? null;
  });
  if (!userInputId) throw new Error('Campo username non trovato');
  await page.evaluate(id => { const el=document.getElementById(id); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set; if(s)s.call(el,'');else el.value=''; el.dispatchEvent(new Event('input',{bubbles:true})); }, userInputId);
  await page.type(`#${cssEscape(userInputId)}`, ARCHIBALD_USER, { delay: 30 });
  await page.keyboard.press('Tab'); await waitIdle(page, 'login-user', 5000);
  const pwdId = await page.evaluate(() => { const p=document.querySelector('input[type="password"]'); p?.scrollIntoView(); p?.focus(); return p?.id??null; });
  if (!pwdId) throw new Error('Campo password non trovato');
  await page.evaluate(id => { const el=document.getElementById(id); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set; if(s)s.call(el,'');else el.value=''; el.dispatchEvent(new Event('input',{bubbles:true})); }, pwdId);
  await page.type(`#${cssEscape(pwdId)}`, ARCHIBALD_PASS, { delay: 30 });
  await page.keyboard.press('Tab'); await waitIdle(page, 'login-pass', 5000);
  const submitted = await page.evaluate(() => { const btn=Array.from(document.querySelectorAll('input[type="submit"],button[type="submit"],a,button')).find(el=>el.offsetParent!==null&&/accedi|login|sign in|entra/i.test(el.textContent+(el.value||''))); if(btn){btn.click();return true;} const f=document.querySelector('input[type="submit"]'); if(f){f.click();return true;} return false; });
  if (!submitted) await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  if (page.url().toLowerCase().includes('login')) throw new Error('Login fallito');
  log('  Login OK → ' + page.url());
}

async function openCustomerEdit(page) {
  await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_DetailView/${CUSTOMER_ID}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitReady(page, 15000);
  const editClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a,button,input[type="button"]')).filter(el=>el.offsetParent!==null)
      .find(el => /modif|edit/i.test(el.title??'') || /modif|edit/i.test(el.textContent?.trim()??'') || el.className?.includes('EditAction') || (el.id??'').includes('EditAction'));
    if (btn) { btn.click(); return btn.id||'found'; }
    const tb = document.querySelector('a[id*="Edit"],a[title*="Modif"],a[title*="Edit"]');
    if (tb) { tb.click(); return tb.id; }
    return null;
  });
  if (!editClicked) {
    await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_DetailView/${CUSTOMER_ID}/?mode=Edit`, { waitUntil: 'networkidle2', timeout: 30000 });
  } else {
    await page.waitForFunction(() => window.location.href.includes('mode=Edit') || document.querySelector('input[id$="Save_Button"]') !== null, { timeout: 10000, polling: 300 }).catch(() => {});
  }
  await waitReady(page, 15000);
  log('  Edit mode: ' + page.url());
}

// ─── Cerca bottoni vicini a un input (per lookup fields) ──────────────────────
async function findNearButtons(page, inputIdPattern) {
  return page.evaluate(re => {
    const pat = new RegExp(re);
    const input = Array.from(document.querySelectorAll('input')).find(i => pat.test(i.id));
    if (!input) return [];
    const row = input.closest('tr,td,div.dxfl-layoutItemContent,div') || input.parentElement;
    return Array.from(document.querySelectorAll('a,button,img,span[onclick]'))
      .filter(el => el.offsetParent !== null && (row?.contains(el) || (() => {
        const r1 = input.getBoundingClientRect(), r2 = el.getBoundingClientRect();
        return Math.abs(r1.top - r2.top) < 30 && r2.left >= r1.left - 5;
      })()))
      .map(el => ({ id: el.id, tag: el.tagName, title: el.title, text: el.textContent?.trim()?.substring(0,20) }));
  }, inputIdPattern);
}

// ─── Griglia ADDRESSes: chiama un metodo su di essa ─────────────────────────
async function addrGridMethod(page, method, ...args) {
  return page.evaluate((m, a) => {
    const col = window.ASPxClientControl?.GetControlCollection?.();
    if (!col) return { ok: false, reason: 'no-collection' };
    let result = null;
    col.ForEachControl(c => {
      if (result !== null) return;
      try {
        const el = c.GetMainElement?.();
        if (el && /ADDRESSes/i.test(el.id||'') && typeof c[m] === 'function') {
          result = c[m](...a) ?? 'called';
        }
      } catch (e) { result = { error: e.message }; }
    });
    return result !== null ? { ok: true, result } : { ok: false, reason: `method ${m} not found on ADDRESSes grid` };
  }, method, args);
}

// ─── Leggi righe della griglia ADDRESSes ─────────────────────────────────────
async function readAddrRows(page) {
  return page.evaluate(() => {
    const grid = Array.from(document.querySelectorAll('table[id*="ADDRESSes"]')).find(t => t.offsetParent !== null);
    if (!grid) return [];
    return Array.from(grid.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[id*="DXDataRow"]'))
      .map(row => {
        const cells = Array.from(row.querySelectorAll('td'))
          .map(td => {
            // DevExpress cells may have inner span/div with the text, or checkboxes/images in first cells
            // Skip cells that contain only inputs/imgs/checkboxes (action cells)
            const hasInput = td.querySelector('input[type="checkbox"],input[type="button"]');
            if (hasInput && !td.querySelector('span,div')) return null;
            // Prefer inner span/div text, fallback to direct textContent (filtering HTML comment artifacts)
            const inner = td.querySelector('span:not([style*="display:none"]), div.dxgv');
            const text = (inner?.textContent ?? td.innerText ?? td.textContent)?.trim();
            // Filter out DevExpress template artifacts and empty strings
            if (!text || text.startsWith('<!--') || text === '&nbsp;') return null;
            return text;
          })
          .filter(Boolean);
        return cells;
      })
      .filter(cells => cells.length > 0);
  });
}

// ─── Dump DOM diff: nuovi elementi visibili dopo un'azione ────────────────────
async function domDiff(page, beforeSnapshot, label) {
  const afterSnapshot = await page.evaluate(() => {
    const items = {};
    for (const el of document.querySelectorAll('input,textarea,select,div[class*="dxpc"],div[id*="Popup"]')) {
      if (el.id && el.offsetParent !== null) items[el.id] = (el.value||el.textContent||'').substring(0,60);
    }
    return items;
  });
  const newItems = {};
  for (const [k, v] of Object.entries(afterSnapshot)) {
    if (!(k in beforeSnapshot)) newItems[k] = v;
  }
  log(`  DOM diff [${label}] — ${Object.keys(newItems).length} nuovi elementi:`, newItems);
  return { afterSnapshot, newItems };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  log('══════════════════════════════════════════');
  log('  REMAINING FIELDS DUMP');
  log(`  Cliente: ${CUSTOMER_ID} | Dir: ${SCREENSHOT_DIR}`);
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
    await login(page);
    await openCustomerEdit(page);
    await shot(page, '00-edit-mode');

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 0: Elenca tutti i tab della form (alcuni non esplorati)
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ STEP 0: TAB DELLA FORM ══');
    const allTabs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a.dxtc-link, li[id*="_pg_AT"] a'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({ id: el.id, text: el.textContent?.trim() }));
    });
    finding('TABS', `Tab trovate: ${JSON.stringify(allTabs)}`);
    report.fields['tabs'] = allTabs;

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 1: CAP e EMAIL nel form principale
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ STEP 1: CAP e EMAIL (form principale) ══');

    // Snapshot DOM completo per diff successivo
    const domBefore = await page.evaluate(() => {
      const items = {};
      for (const el of document.querySelectorAll('input,textarea,select')) {
        if (el.id && el.offsetParent !== null) items[el.id] = el.value||'';
      }
      return items;
    });

    // ── 1a. Dump di TUTTI i campi visibili nella tab corrente ─────────────────
    // Email è tra cellulare e url; CAP è un campo della tab principale.
    // Stampiamo tutto con etichetta per scoprire i nomi reali.
    const allLabeledFields = await page.evaluate(() => {
      const results = [];
      // Strategia A: cerca label/span vicino a ogni input
      for (const input of document.querySelectorAll('input,textarea')) {
        if (!input.offsetParent || !input.id || input.id.includes('EditorClientInfo')) continue;
        const container = input.closest('.dxfl-layoutItem, tr, td, div') || input.parentElement;
        // Cerca l'etichetta nel container (di solito è un elemento label o span.dxfl-editorLabel)
        const labelEl = container?.querySelector('label,.dxfl-editorLabel,.dxfl-labelCell,span.dxfl-caption')
          ?? container?.previousElementSibling?.querySelector('label,span')
          ?? null;
        const labelTxt = labelEl?.textContent?.trim() ?? '';
        results.push({
          id: input.id,
          label: labelTxt.substring(0,40),
          value: (input.value||'').substring(0,80),
          maxLen: input.maxLength > 0 ? input.maxLength : null,
          readOnly: input.readOnly,
          type: input.type || input.tagName.toLowerCase(),
        });
      }
      return results;
    });
    report.fields['allLabeledFields'] = allLabeledFields;
    finding('ALL_FIELDS', `Campi visibili (con etichette): ${allLabeledFields.length}`);
    allLabeledFields.forEach(f =>
      finding('FIELD', `label="${f.label}" | id="${f.id}" | val="${f.value}" | maxLen=${f.maxLen} | readOnly=${f.readOnly}`)
    );
    await shot(page, '01-all-fields');

    // ── 1b. Cerca specificamente per etichette note ────────────────────────
    const specificFields = await page.evaluate(() => {
      // Cerca per etichetta: ogni keyword associa a un campo vicino
      const keywords = ['cap', 'zip', 'email', 'e-mail', 'cellulare', 'mobile', 'telefon', 'tel.', 'url', 'sito', 'fax', 'via:', 'strada', 'città', 'indirizzo'];
      const results = [];
      for (const el of document.querySelectorAll('label, .dxfl-editorLabel, td, th, span, div')) {
        const txt = el.textContent?.trim()?.toLowerCase();
        if (!txt || txt.length > 60 || txt.length < 2) continue;
        const match = keywords.find(k => txt.includes(k));
        if (!match) continue;
        // Cerca input nella stessa riga/div
        const container = el.closest('tr, .dxfl-layoutItem, div.dxfl-editorContainer') || el.parentElement;
        const input = container?.querySelector('input,textarea');
        if (input?.id && input.offsetParent !== null) {
          results.push({ keyword: match, label: txt, id: input.id, value: (input.value||'').substring(0,80), readOnly: input.readOnly, maxLen: input.maxLength>0?input.maxLength:null });
        }
      }
      return results;
    });
    report.fields['specificFields'] = specificFields;
    finding('SPECIFIC_FIELDS', `Campi trovati per keyword: ${specificFields.length}`);
    specificFields.forEach(f => finding('SPECIFIC', `kw="${f.keyword}" label="${f.label}" → id="${f.id}" val="${f.value}" maxLen=${f.maxLen} readOnly=${f.readOnly}`));

    // ── 1c. Studio CAP nel form principale (ricorda: stesso comportamento in alt addr) ──
    log('  ─ 1c. Studio CAP ─');
    const capFields = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).filter(el =>
        /ZIP|CAP|POSTAL/i.test(el.id||'') && !el.id.includes('EditorClientInfo')
      ).map(el => ({ id: el.id, value: el.value||'', readOnly: el.readOnly, maxLen: el.maxLength>0?el.maxLength:null, visible: el.offsetParent!==null }))
    );
    finding('CAP', `Campi CAP nel form principale: ${JSON.stringify(capFields)}`);

    // Cerca il bottone _B0Img del CAP per ID diretto (non proximity)
    const capBtnDirect = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img,a'))
        .filter(el => /LOGISTICSADDRESSZIPCODE.*_B0Img|ZIPCODE.*_B0Img|CAP.*_B0Img/i.test(el.id||''))
        .map(el => ({ id: el.id, tag: el.tagName, visible: el.offsetParent!==null }));
    });
    finding('CAP', `Bottoni CAP per ID diretto: ${JSON.stringify(capBtnDirect)}`);

    // Cerca anche il find button associato al CAP (se è un lookup)
    for (const capField of capFields) {
      const capBtns = await findNearButtons(page, new RegExp(capField.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      finding('CAP', `Bottoni vicini a CAP "${capField.id}": ${JSON.stringify(capBtns)}`);

      // Se ha un B0Img → è un lookup, proviamo a cliccare per vedere il dialog
      const capB0 = capBtns.find(b => /_B0Img|_B0$/.test(b.id||''));
      if (capB0) {
        finding('CAP', `CAP è un campo LOOKUP — bottone: ${capB0.id}`);
        const domBeforeCap = await page.evaluate(() => { const items={}; for(const el of document.querySelectorAll('input,textarea,[id*="Popup"],[class*="dxpc"]')) { if(el.id&&el.offsetParent!==null)items[el.id]=(el.value||el.textContent||'').substring(0,40); } return items; });
        await page.evaluate(id => document.getElementById(id)?.click(), capB0.id);
        await waitIdle(page, 'cap-dialog-main', 6000);
        await wait(1500);
        await shot(page, '02-cap-dialog-main');
        const { newItems: capItems } = await domDiff(page, domBeforeCap, 'cap-dialog-main');
        finding('CAP_DIALOG', `Nuovi elementi dopo click bottone CAP: ${Object.keys(capItems).length}`);
        // Prime righe del dialog
        const capRows = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('.dxgvDataRow_XafTheme, tr[id*="DXDataRow"]'))
            .filter(tr => tr.offsetParent !== null)
            .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim()).filter(Boolean).join(' | '));
          return rows.slice(0, 8);
        });
        finding('CAP_DIALOG', `Prime righe risultato CAP: ${JSON.stringify(capRows)}`);
        // Cerca campo filtro nel dialog (per cercare per CAP)
        const capDialogInputs = await page.evaluate(() =>
          Array.from(document.querySelectorAll('input')).filter(el => el.offsetParent !== null && !el.id.includes('EditorClientInfo'))
            .map(el => ({ id: el.id, value: el.value||'', placeholder: el.placeholder||'' }))
        );
        finding('CAP_DIALOG', `Input nel dialog CAP: ${JSON.stringify(capDialogInputs.slice(0,5))}`);
        // Chiudi
        const capClose = await page.evaluate(() => { const btn=Array.from(document.querySelectorAll('a,button')).find(el=>el.offsetParent!==null&&/chiudi|close|cancel|annulla/i.test((el.title||'')+(el.textContent||''))); if(btn){btn.click();return btn.id;} return null; });
        if (!capClose) await page.keyboard.press('Escape');
        await waitIdle(page, 'cap-close-main', 3000);
        finding('CAP', `Dialog CAP chiuso: ${capClose}`);
      } else if (!capField.readOnly) {
        finding('CAP', `CAP è un campo TESTO LIBERO — maxLen=${capField.maxLen} — si scrive direttamente`);
        // Testa la scrittura
        const capWriteR = await typeField(page, new RegExp(capField.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '80100', { waitAfterMs: 500 });
        finding('CAP', `Test scrittura CAP "80100": ${JSON.stringify(capWriteR)}`);
        // Ripristina valore originale
        if (capField.value && capWriteR.ok) {
          await typeField(page, new RegExp(capField.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), capField.value, { waitAfterMs: 300 });
          finding('CAP', `CAP ripristinato a "${capField.value}"`);
        }
      } else {
        finding('CAP', `CAP readOnly=true, nessun bottone vicino — campo probabilmente non editabile direttamente`);
        // Prova forzatura DOM
        const capForced = await page.evaluate(id => {
          const el = document.getElementById(id);
          if (!el) return null;
          el.focus(); el.click();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(el, '00118'); else el.value = '00118';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return el.value;
        }, capField.id);
        finding('CAP', `CAP forzatura DOM → valore dopo: ${JSON.stringify(capForced)} (accepted=${capForced==='00118'})`);
        // Ripristina
        if (capField.value) {
          await page.evaluate((id, v) => { const el=document.getElementById(id); if(!el)return; const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set; if(s)s.call(el,v);else el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); }, capField.id, capField.value);
        }
      }
    }
    await shot(page, '01-main-contact-fields');

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 2: PAYMTERMID — click bottone lookup e studia il dialog
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ STEP 2: PAYMTERMID — LOOKUP DIALOG ══');

    const paymInput = await discover(page, /PAYMTERMID.*_find_Edit_I$/);
    finding('PAYMTERM', `Input: id="${paymInput[0]?.id}" value="${paymInput[0]?.value?.substring(0,60)}" readOnly=${paymInput[0]?.readOnly}`);

    // Bottoni vicini al campo PAYMTERMID
    const paymBtns = await findNearButtons(page, /PAYMTERMID.*_find_Edit_I$/);
    finding('PAYMTERM', `Bottoni vicini: ${JSON.stringify(paymBtns)}`);

    // Cerca bottone _B0Img specifico
    const paymB0Id = await page.evaluate(re => {
      const pat = new RegExp(re);
      const img = Array.from(document.querySelectorAll('img,a'))
        .find(el => el.offsetParent !== null && pat.test(el.id||''));
      return img ? { id: img.id, tag: img.tagName } : null;
    }, 'PAYMTERMID.*_B0Img');
    finding('PAYMTERM', `Bottone _B0Img: ${JSON.stringify(paymB0Id)}`);

    if (paymB0Id) {
      // Snapshot DOM prima del click
      const domBeforePaym = await page.evaluate(() => { const items={}; for(const el of document.querySelectorAll('input,textarea,select,[class*="dxpc"],[id*="Popup"]')) { if(el.id&&el.offsetParent!==null)items[el.id]=(el.value||el.textContent||'').substring(0,60); } return items; });

      // Clicca il bottone
      await page.evaluate(id => document.getElementById(id)?.click(), paymB0Id.id);
      log('  Bottone _B0Img cliccato, attesa dialog...');
      await waitIdle(page, 'paym-dialog', 8000);
      await wait(2000);
      await shot(page, '02-paymterm-dialog-open');

      // DOM diff: cosa è apparso dopo il click
      const { newItems } = await domDiff(page, domBeforePaym, 'paym-dialog');
      report.fields['paymDialog'] = newItems;

      // Il dialog ha: campo di ricerca (input+lente) + griglia risultati + OK + Annulla
      // I risultati sono VUOTI — bisogna premere Enter/click Search per caricarli
      // Trova il popup container (ID dalla DOM diff)
      const popupId = Object.keys(newItems).find(k => k.includes('PopupWindow') && k.endsWith('_PW-1'));
      finding('PAYMTERM_DIALOG', `Popup container ID: ${popupId}`);

      // Il popup DevExpress ha struttura: _PW-1 (wrapper) → _PWC-1 (content div con iframe o DOM)
      // Cerca l'input nel content div o nel documento (il popup potrebbe renderizzare fuori dal _PW-1)
      const searchInputId = await page.evaluate(pid => {
        // Prova 1: cerca nel content div del popup (_PWC-1)
        const contentId = pid?.replace('_PW-1', '_PWC-1');
        const contentDiv = document.getElementById(contentId);
        if (contentDiv) {
          const inp = contentDiv.querySelector('input[type="text"],input:not([type="hidden"]):not([type="checkbox"])');
          if (inp?.id) return inp.id;
        }
        // Prova 2: cerca nel wrapper popup
        const popup = document.getElementById(pid);
        if (popup) {
          const inp = popup.querySelector('input[type="text"],input:not([type="hidden"]):not([type="checkbox"])');
          if (inp?.id) return inp.id;
        }
        // Prova 3: cerca in tutto il documento ma solo input visibili nuovi (non quelli del form)
        const knownFormInputs = new Set(Array.from(document.querySelectorAll('input[id*="xaf_l44"]')).map(el => el.id));
        const allInputs = Array.from(document.querySelectorAll('input[type="text"],input:not([type])'))
          .filter(el => el.offsetParent !== null && !knownFormInputs.has(el.id));
        return allInputs[0]?.id ?? null;
      }, popupId ?? '');
      finding('PAYMTERM_DIALOG', `Campo di ricerca nel popup: ${searchInputId}`);

      if (searchInputId) {
        // Clicca campo di ricerca e premi Enter per caricare tutti i risultati
        await page.evaluate(id => { const el=document.getElementById(id); el?.focus(); el?.click(); }, searchInputId);
        await wait(200);
        await page.keyboard.press('Enter');
        await waitIdle(page, 'paym-search', 8000);
        await wait(2000);
        await shot(page, '02b-paymterm-results');

        // Leggi le righe del risultato (dentro il popup)
        const dialogRows = await page.evaluate(pid => {
          const popup = document.getElementById(pid);
          const container = popup ?? document;
          const rows = Array.from(container.querySelectorAll('.dxgvDataRow_XafTheme, tr[id*="DXDataRow"]'))
            .filter(tr => tr.offsetParent !== null)
            .map(tr => ({
              cells: Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim()).filter(Boolean),
              id: tr.id,
            }));
          return rows.slice(0, 8);
        }, popupId ?? '');
        finding('PAYMTERM_DIALOG', `Righe risultato dopo search: ${dialogRows.length}`);
        dialogRows.forEach((r, i) => finding('PAYMTERM_DIALOG', `  Riga ${i}: ${r.cells.join(' | ')}`));
        log('  Righe PAYMTERM dialog:', dialogRows);

        // Struttura del dialog per il bot: per selezionare un termine
        finding('PAYMTERM_STRATEGY', 'STRATEGIA PAYMTERMID:');
        finding('PAYMTERM_STRATEGY', '  1. Clicca _B0Img → popup "Termini di pagamento" apre');
        finding('PAYMTERM_STRATEGY', '  2. Trova input di ricerca nel popup, digita ID o parte del nome, premi Enter');
        finding('PAYMTERM_STRATEGY', '  3. Click su riga corrispondente nella griglia → dialog si chiude automaticamente');
        finding('PAYMTERM_STRATEGY', '  4. Se non si chiude: click OK nel popup');

        // Prova a cliccare la prima riga per selezionarla
        if (dialogRows.length > 0) {
          const firstRowId = dialogRows[0].id;
          await page.evaluate(rowId => {
            const row = document.getElementById(rowId);
            row?.click();
          }, firstRowId);
          await waitIdle(page, 'paym-select', 5000);
          await wait(1000);
          await shot(page, '02c-paymterm-selected');
          // Controlla se il dialog si è chiuso (se sì, il valore è stato selezionato)
          const dialogStillOpen = await page.evaluate(pid => !!document.getElementById(pid)?.offsetParent, popupId ?? '');
          finding('PAYMTERM_DIALOG', `Dialog ancora aperto dopo click riga: ${dialogStillOpen}`);
          if (!dialogStillOpen) {
            const paymAfter = await discover(page, /PAYMTERMID.*_find_Edit_I$/);
            finding('PAYMTERM_DIALOG', `PAYMTERMID dopo selezione: "${paymAfter[0]?.value?.substring(0,80)}"`);
            // Ripristina al valore originale (è già rimasto quello vecchio se il dialog si è chiuso senza cambiare)
          } else {
            // Dialog ancora aperto → click OK oppure Annulla DENTRO il popup
            const popupClose = await page.evaluate(pid => {
              const popup = document.getElementById(pid);
              if (!popup) return null;
              const btn = Array.from(popup.querySelectorAll('a,button'))
                .find(el => el.offsetParent !== null && /annulla|cancel|ok/i.test(el.textContent?.trim()||''));
              if (btn) { btn.click(); return { id: btn.id, text: btn.textContent?.trim() }; }
              return null;
            }, popupId ?? '');
            finding('PAYMTERM_DIALOG', `Chiusura popup: ${JSON.stringify(popupClose)}`);
            if (!popupClose) await page.keyboard.press('Escape');
            await waitIdle(page, 'paym-close2', 5000);
          }
        } else {
          // Nessuna riga → chiudi con Annulla DENTRO il popup
          const popupClose = await page.evaluate(pid => {
            const popup = document.getElementById(pid);
            if (!popup) return null;
            const btn = Array.from(popup.querySelectorAll('a,button'))
              .find(el => el.offsetParent !== null && /annulla|cancel/i.test(el.textContent?.trim()||''));
            if (btn) { btn.click(); return { id: btn.id, text: btn.textContent?.trim() }; }
            return null;
          }, popupId ?? '');
          finding('PAYMTERM_DIALOG', `Chiusura popup (no results): ${JSON.stringify(popupClose)}`);
          if (!popupClose) await page.keyboard.press('Escape');
          await waitIdle(page, 'paym-close3', 5000);
        }
      } else {
        // Nessun input trovato → chiudi con Escape
        await page.keyboard.press('Escape');
        await waitIdle(page, 'paym-esc', 3000);
        finding('PAYMTERM_DIALOG', 'Campo di ricerca non trovato — chiuso con Escape');
      }

      await shot(page, '03-paymterm-dialog-closed');
      // Verifica che il form sia ancora in edit mode dopo la chiusura del popup
      const stillEdit = page.url().includes('mode=Edit');
      finding('PAYMTERM', `Form ancora in edit mode dopo chiusura popup: ${stillEdit}`);
    } else {
      finding('PAYMTERM', '⚠️  Bottone _B0Img non trovato');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 3: TAB INDIRIZZO ALT — CRUD COMPLETO
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ STEP 3: ALT ADDR — CRUD COMPLETO ══');
    const tabOpened = await openTab(page, 'Indirizzo alt');
    finding('ALT_ADDR', `Tab aperta: ${tabOpened}`);
    await shot(page, '04-altaddr-empty');

    const rowsBefore = await readAddrRows(page);
    finding('ALT_ADDR', `Righe prima del test: ${rowsBefore.length}`);

    // ── 3a. NEW ROW ─────────────────────────────────────────────────────────
    log('\n  ─ 3a. AddNewRow via _DXCBtn0Img ─');
    const newBtnId = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('img[title="New"],[title="Nuovo"]'))
        .find(el => el.offsetParent !== null && el.getBoundingClientRect().top > 150);
      return btn?.id ?? null;
    });
    if (!newBtnId) { finding('ALT_ADDR', '⚠️  Bottone New non trovato'); }
    else {
      await page.evaluate(id => document.getElementById(id)?.click(), newBtnId);
      await waitIdle(page, 'new-row', 5000);
      await wait(1000);
      finding('ALT_ADDR', `Bottone New cliccato: "${newBtnId}"`);
      await shot(page, '05-altaddr-newrow-open');

      // Enumera opzioni TIPO prima di settarlo
      const tipoOpts = await enumComboOptions(page, /editnew.*TYPE.*_I$/);
      finding('ALT_ADDR', `TIPO opzioni: ${tipoOpts.join(' | ')}`);
      report.altAddr['tipoOptions'] = tipoOpts;

      // Leggi tutti i campi nuova riga
      const newRowFields = await page.evaluate(() =>
        Array.from(document.querySelectorAll('input,textarea'))
          .filter(el => el.offsetParent !== null && /editnew/i.test(el.id) && !el.id.includes('EditorClientInfo'))
          .map(el => ({ id: el.id, maxLen: el.maxLength>0?el.maxLength:null, readOnly: el.readOnly, value: (el.value||'').substring(0,40) }))
      );
      finding('ALT_ADDR', `Campi nuova riga: ${newRowFields.length}`);
      newRowFields.forEach(f => finding('ALT_ADDR_FIELD', `  id="${f.id}" maxLen=${f.maxLen} readOnly=${f.readOnly}`));
      report.altAddr['newRowFields'] = newRowFields;

      // Imposta TIPO = "Consegna"
      const tipoSet = await setCombo(page, /editnew.*TYPE.*_I$/, 'Consegna');
      finding('ALT_ADDR', `TIPO set "Consegna": ${JSON.stringify(tipoSet)}`);

      // Compila NAME
      const nameR = await typeField(page, /editnew.*NAME.*_I$/, 'INDIRIZZO TEST DUMP', { waitAfterMs: 300 });
      finding('ALT_ADDR', `NAME: ${JSON.stringify(nameR)}`);

      // Compila STREET
      const streetR = await typeField(page, /editnew.*STREET.*_I$/, 'Via Roma 123', { waitAfterMs: 300 });
      finding('ALT_ADDR', `STREET: ${JSON.stringify(streetR)}`);

      // Compila CITY
      const cityR = await typeField(page, /editnew.*CITY.*_I$/, 'Roma', { waitAfterMs: 300 });
      finding('ALT_ADDR', `CITY: ${JSON.stringify(cityR)}`);

      // Compila STATE (provincia)
      const stateR = await typeField(page, /editnew.*STATE.*_I$/, 'RM', { waitAfterMs: 300 });
      finding('ALT_ADDR', `STATE: ${JSON.stringify(stateR)}`);

      // Compila COUNTRYREGIONID
      const countryR = await typeField(page, /editnew.*COUNTRYREGIONID.*_I$/, 'ITA', { waitAfterMs: 300 });
      finding('ALT_ADDR', `COUNTRYREGIONID: ${JSON.stringify(countryR)}`);

      // Nota: CAP (LOGISTICSADDRESSZIPCODE) si comporta uguale al CAP del form principale.
      // Strategia già documentata in STEP 1 — non dupliciamo il test qui.
      finding('ALT_ADDR_CAP', 'CAP alt addr: stesso meccanismo del form principale (vedi STEP 1)');
      await shot(page, '07-altaddr-filled');

      // ── 3b. UpdateEdit — salva la nuova riga ─────────────────────────────
      log('  ─ 3b. UpdateEdit ─');
      const updateResult = await addrGridMethod(page, 'UpdateEdit');
      finding('ALT_ADDR', `UpdateEdit: ${JSON.stringify(updateResult)}`);
      await waitIdle(page, 'update-edit', 6000);
      await wait(1000);
      await shot(page, '08-altaddr-after-update');

      const rowsAfterCreate = await readAddrRows(page);
      finding('ALT_ADDR', `Righe dopo UpdateEdit: ${rowsAfterCreate.length}`);
      rowsAfterCreate.forEach((r, i) => finding('ALT_ADDR', `  Riga ${i}: ${r.join(' | ')}`));
      report.altAddr['rowsAfterCreate'] = rowsAfterCreate;

      const createOk = rowsAfterCreate.length > rowsBefore.length;
      finding('ALT_ADDR', `Nuova riga creata: ${createOk ? '✅' : '❌ (righe non aumentate)'}`);

      if (createOk) {
        // ── 3c. StartEditRow — modifica la riga appena creata (ultima) ─────────
        // La riga creata è l'ultima della griglia. Usiamo snapshot diff per trovare i campi.
        log('  ─ 3c. StartEditRow (ultima riga) ─');
        const rowCount = rowsAfterCreate.length;
        const targetRowIdx = rowCount - 1; // ultima riga = quella appena creata

        // Snapshot DOM prima di StartEditRow
        const domBeforeEdit = await page.evaluate(() => {
          const items = {};
          for (const el of document.querySelectorAll('input,textarea'))
            if (el.id && el.offsetParent !== null) items[el.id] = (el.value||'').substring(0,60);
          return items;
        });

        const startEditResult = await addrGridMethod(page, 'StartEditRow', targetRowIdx);
        finding('ALT_ADDR', `StartEditRow(${targetRowIdx}): ${JSON.stringify(startEditResult)}`);
        await waitIdle(page, 'start-edit-row', 5000);
        await wait(1000);
        await shot(page, '09-altaddr-startedirow');

        // Trova nuovi input via DOM diff (qualsiasi pattern)
        const domAfterEdit = await page.evaluate(() => {
          const items = {};
          for (const el of document.querySelectorAll('input,textarea'))
            if (el.id && el.offsetParent !== null) items[el.id] = (el.value||'').substring(0,60);
          return items;
        });
        const editRowNewInputs = Object.entries(domAfterEdit)
          .filter(([k]) => !(k in domBeforeEdit))
          .map(([k, v]) => ({ id: k, value: v }));
        finding('ALT_ADDR', `Nuovi input dopo StartEditRow: ${editRowNewInputs.length}`);
        editRowNewInputs.forEach(f => finding('ALT_ADDR_EDITROW', `  id="${f.id}" val="${f.value}"`));
        report.altAddr['editRowFields'] = editRowNewInputs;

        // Cerca il campo NAME tra i nuovi input
        const editNameField = editRowNewInputs.find(f => /NAME/i.test(f.id) && !/ALIAS|ACCOUNTNUM/i.test(f.id));
        if (editNameField) {
          const modR = await typeField(page, new RegExp(editNameField.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'TEST MODIFICATO', { waitAfterMs: 300 });
          finding('ALT_ADDR', `NAME modificato: ${JSON.stringify(modR)}`);
        } else {
          finding('ALT_ADDR', `⚠️  Campo NAME non trovato. Nuovi inputs: ${editRowNewInputs.map(f=>f.id).join(', ')}`);
        }

        const updateModResult = await addrGridMethod(page, 'UpdateEdit');
        finding('ALT_ADDR', `UpdateEdit dopo modifica: ${JSON.stringify(updateModResult)}`);
        await waitIdle(page, 'update-mod', 5000);
        await shot(page, '10-altaddr-after-modify');

        const rowsAfterMod = await readAddrRows(page);
        finding('ALT_ADDR', `Righe dopo modifica: ${rowsAfterMod.length}`);
        rowsAfterMod.forEach((r, i) => finding('ALT_ADDR', `  Riga ${i}: ${r.join(' | ')}`));

        // ── 3d. Delete — seleziona via checkbox poi toolbar delete ──────────
        log('  ─ 3d. Delete ─');

        // Cerca la checkbox dell'ultima riga (quella da eliminare)
        const checkboxClicked = await page.evaluate(idx => {
          const grid = Array.from(document.querySelectorAll('table[id*="ADDRESSes"]')).find(t => t.offsetParent !== null);
          if (!grid) return false;
          const rows = Array.from(grid.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[id*="DXDataRow"]'));
          const row = rows[idx];
          if (!row) return false;
          // Cerca checkbox nella riga
          const chk = row.querySelector('input[type="checkbox"]');
          if (chk) { chk.click(); return { method: 'checkbox', id: chk.id }; }
          // Fallback: click sulla riga stessa
          row.click(); return { method: 'row-click' };
        }, targetRowIdx);
        finding('ALT_ADDR', `Selezione riga ${targetRowIdx}: ${JSON.stringify(checkboxClicked)}`);
        await wait(500);

        // Cerca bottone Delete nella toolbar della griglia ADDRESSes
        const deleteBtnId = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a,img,button'))
            .filter(el => el.offsetParent !== null && el.getBoundingClientRect().top > 200)
            .find(el => /Cancellare|Delete|Elimina|cancell/i.test(el.title||''))
            ? { id: Array.from(document.querySelectorAll('a,img,button'))
                .filter(el => el.offsetParent !== null && el.getBoundingClientRect().top > 200)
                .find(el => /Cancellare|Delete|Elimina|cancell/i.test(el.title||''))?.id,
               title: Array.from(document.querySelectorAll('a,img,button'))
                .filter(el => el.offsetParent !== null && el.getBoundingClientRect().top > 200)
                .find(el => /Cancellare|Delete|Elimina|cancell/i.test(el.title||''))?.title?.substring(0,40) }
            : null;
        });
        finding('ALT_ADDR', `Bottone Delete: ${JSON.stringify(deleteBtnId)}`);

        if (deleteBtnId?.id) {
          await page.evaluate(id => document.getElementById(id)?.click(), deleteBtnId.id);
          await waitIdle(page, 'delete-row', 6000);
          await wait(1500);
          await shot(page, '11-altaddr-after-delete-click');

          // Gestione eventuale dialog conferma (cerca DENTRO il popup, non il form globale)
          const confirmResult = await page.evaluate(() => {
            // Cerca popup di conferma
            const popup = Array.from(document.querySelectorAll('[class*="dxpc-content"],[id*="Popup"],[id*="MessageBox"]'))
              .find(el => el.offsetParent !== null);
            if (popup) {
              const btns = Array.from(popup.querySelectorAll('a,button'))
                .filter(el => el.offsetParent !== null);
              const okBtn = btns.find(el => /sì|yes|ok|confirm|Delete/i.test(el.textContent?.trim()||'') || /ok|yes/i.test(el.id||''));
              if (okBtn) { okBtn.click(); return { clicked: okBtn.id, text: okBtn.textContent?.trim() }; }
            }
            // Se non c'è popup, il delete è avvenuto direttamente
            return { clicked: null, reason: 'no-confirm-popup' };
          });
          finding('ALT_ADDR', `Conferma delete: ${JSON.stringify(confirmResult)}`);
          await waitIdle(page, 'delete-confirm', 5000);
          await shot(page, '12-altaddr-after-delete-confirmed');

          const rowsAfterDelete = await readAddrRows(page);
          finding('ALT_ADDR', `Righe dopo delete: ${rowsAfterDelete.length}`);
          const deleteOk = rowsAfterDelete.length < rowsAfterMod.length;
          finding('ALT_ADDR', `Delete: ${deleteOk ? '✅' : '❌ righe non diminuite'}`);
          if (!deleteOk) {
            // Tenta via API come fallback
            const deleteApiResult = await addrGridMethod(page, 'DeleteRow', targetRowIdx);
            finding('ALT_ADDR', `DeleteRow API fallback: ${JSON.stringify(deleteApiResult)}`);
            await waitIdle(page, 'delete-api', 5000);
            await page.evaluate(() => { const btn=Array.from(document.querySelectorAll('a,button')).find(el=>el.offsetParent!==null&&/sì|yes|ok/i.test(el.textContent?.trim()||'')); btn?.click(); });
            await waitIdle(page, 'delete-api-confirm', 3000);
            const rowsAfterApi = await readAddrRows(page);
            finding('ALT_ADDR', `Righe dopo DeleteRow API: ${rowsAfterApi.length} (${rowsAfterApi.length < rowsAfterMod.length ? '✅' : '❌'})`);
          }
          report.altAddr['deleteOk'] = deleteOk;
        } else {
          const deleteApiResult = await addrGridMethod(page, 'DeleteRow', targetRowIdx);
          finding('ALT_ADDR', `DeleteRow(${targetRowIdx}) via API: ${JSON.stringify(deleteApiResult)}`);
          await waitIdle(page, 'delete-api', 5000);
          await page.evaluate(() => { const btn=Array.from(document.querySelectorAll('a,button')).find(el=>el.offsetParent!==null&&/sì|yes|ok/i.test(el.textContent?.trim()||'')); btn?.click(); });
          await waitIdle(page, 'delete-api-confirm', 5000);
          await shot(page, '12-altaddr-after-delete-api');
          const rowsAfterDeleteApi = await readAddrRows(page);
          finding('ALT_ADDR', `Righe dopo DeleteRow API: ${rowsAfterDeleteApi.length} (${rowsAfterDeleteApi.length < rowsAfterMod.length ? '✅' : '❌'})`);
        }
      } else {
        // UpdateEdit fallita, CancelEdit per non lasciare riga sospesa
        await addrGridMethod(page, 'CancelEdit');
        finding('ALT_ADDR', '⚠️  UpdateEdit fallita — CancelEdit chiamato come ripristino');
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 4: CANCEL — chiudi senza salvare il form padre
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ STEP 4: CANCEL FORM (nessun commit) ══');
    const cancelClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a,button'))
        .find(el => el.offsetParent !== null &&
          (/chiudi|close|annulla|cancel/i.test((el.textContent?.trim()??'')+(el.title??''))) &&
          !/salva/i.test(el.textContent?.trim()??'')
        );
      if (btn) { btn.click(); return { id: btn.id, text: btn.textContent?.trim() }; }
      return null;
    });
    finding('CANCEL', `Bottone Cancel/Annulla: ${JSON.stringify(cancelClicked)}`);
    await wait(2000);
    // Gestione eventuale "Vuoi salvare le modifiche?" dialog
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a,button')).find(el =>
        el.offsetParent !== null && /no|discard|non sal/i.test(el.textContent?.trim()||'')
      );
      btn?.click();
    });
    await wait(1500);
    log('  URL dopo cancel: ' + page.url());
    await shot(page, '13-after-cancel');

  } catch (err) {
    log(`\nERRORE FATALE: ${err}`);
    console.error(err);
    try { await shot(page, 'error'); } catch {}
  } finally {
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
    log(`\n✅  Report: ${REPORT_FILE}`);
    log('\n══════════════════════════════════════════');
    log('  FINDINGS');
    log('══════════════════════════════════════════');
    report.findings.forEach((f, i) => log(` ${String(i+1).padStart(3)}. [${f.cat}] ${f.msg}`));

    if (process.env.AUTO_CLOSE === '1') {
      await browser.close();
    } else {
      log('\n⚠️  Browser aperto. Ctrl+C per chiudere.');
      await new Promise(() => {});
    }
  }
}

main().catch(err => { console.error('ERRORE:', err); process.exit(1); });

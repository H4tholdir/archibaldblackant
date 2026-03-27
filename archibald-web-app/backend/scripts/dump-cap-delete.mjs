/**
 * dump-cap-delete.mjs
 *
 * Script mirato per certificare:
 *   A) DELETE riga indirizzo alternativo con SelectRow API
 *   B) CAP dialog completo:
 *      - apre popup con _B0Img
 *      - aspetta il campo di ricerca (AJAX lazy)
 *      - cerca un CAP noto e mostra TUTTI i risultati
 *      - studia il problema "stesso CAP, città diverse"
 *      - documenta la struttura delle righe per identificare la scelta corretta
 *
 * Cliente di test: 55839 — Pescuma Dr. Saverio
 * NON salva nulla — CancelEdit + Annulla form
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
const SCREENSHOT_DIR = '/tmp/cap-delete-dump';
const CUSTOMER_ID    = '55839';

// CAP di test da cercare (scegliamo uno che probabilmente ha più città)
const CAP_TEST_QUERIES = ['00100', '20100', '80100', '85029'];

const report = { findings: [], capDialogs: {} };
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
  const p = path.join(SCREENSHOT_DIR, `cap-${String(++shotIdx).padStart(3,'0')}-${label.replace(/[^a-z0-9]/gi,'-')}.png`);
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
  if (!userInputId) throw new Error('Username input non trovato');
  await page.evaluate(id => { const el=document.getElementById(id); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set; if(s)s.call(el,'');else el.value=''; el.dispatchEvent(new Event('input',{bubbles:true})); }, userInputId);
  await page.type(`#${cssEscape(userInputId)}`, ARCHIBALD_USER, { delay: 30 });
  await page.keyboard.press('Tab'); await waitIdle(page, 'login-user', 5000);
  const pwdId = await page.evaluate(() => { const p=document.querySelector('input[type="password"]'); p?.scrollIntoView(); p?.focus(); return p?.id??null; });
  if (!pwdId) throw new Error('Password input non trovato');
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
      .find(el => /modif|edit/i.test(el.title??'') || /modif|edit/i.test(el.textContent?.trim()??'') || (el.id??'').includes('EditAction'));
    if (btn) { btn.click(); return btn.id||'found'; }
    const tb = document.querySelector('a[id*="Edit"],a[title*="Modif"],a[title*="Edit"]');
    if (tb) { tb.click(); return tb.id; }
    return null;
  });
  if (!editClicked) {
    await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_DetailView/${CUSTOMER_ID}/?mode=Edit`, { waitUntil: 'networkidle2', timeout: 30000 });
  } else {
    await page.waitForFunction(() => window.location.href.includes('mode=Edit') || document.querySelector('[title="Salvare"]') !== null, { timeout: 10000, polling: 300 }).catch(() => {});
  }
  await waitReady(page, 15000);
  log('  Edit mode: ' + page.url());
}

async function openTab(page, tabText) {
  const aliases = { 'Indirizzo alt': ['Indirizzo alt', 'Alt. address', 'Indirizzo'] };
  const candidates = aliases[tabText] || [tabText];
  for (const cand of candidates) {
    const clicked = await page.evaluate(text => {
      for (const el of document.querySelectorAll('a.dxtc-link, span.dx-vam, a'))
        if (el.textContent?.trim().includes(text) && el.offsetParent !== null) { (el.tagName==='A'?el:el.parentElement)?.click(); return true; }
      return false;
    }, cand);
    if (clicked) { await waitIdle(page, `tab-${cand}`, 6000); return true; }
  }
  return false;
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
          else { const main = c.GetMainElement?.(); if (main?.contains(input) && typeof c.SetSelectedIndex==='function') combo=c; }
        } catch {}
      });
      if (combo && typeof combo.GetItemCount === 'function') {
        const n = combo.GetItemCount();
        for (let i = 0; i < n; i++) {
          const text = combo.GetItem?.(i)?.text;
          if (text === val) { combo.SetSelectedIndex(i); return { found:true, method:'SetSelectedIndex', text }; }
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
    const proto = el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el,''); else el.value='';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.id;
  }, idRegex.source || String(idRegex));
  if (!inputId) return { found: false };
  await page.type(`#${cssEscape(inputId)}`, value, { delay: 5 });
  await page.keyboard.press('Tab'); await wait(waitAfterMs);
  await waitIdle(page, `type-${inputId}`, 8000);
  const actual = await page.evaluate(id => document.getElementById(id)?.value??'', inputId);
  return { found: true, id: inputId, value: actual, ok: actual === value };
}

// Chiama un metodo sulla griglia ADDRESSes specifica
async function addrGrid(page, method, ...args) {
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
    return result !== null ? { ok: true, result } : { ok: false, reason: `${m} non trovato su ADDRESSes` };
  }, method, args);
}

async function readAddrRows(page) {
  return page.evaluate(() => {
    const grid = Array.from(document.querySelectorAll('table[id*="ADDRESSes"]')).find(t => t.offsetParent !== null);
    if (!grid) return [];
    return Array.from(grid.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[id*="DXDataRow"]'))
      .map(row => {
        const cells = Array.from(row.querySelectorAll('td'))
          .map(td => {
            const hasOnlyControl = td.querySelector('input[type="checkbox"],input[type="button"]') && !td.querySelector('span,div');
            if (hasOnlyControl) return null;
            const inner = td.querySelector('span:not([style*="display:none"]), div.dxgv');
            const text = (inner?.textContent ?? td.innerText ?? td.textContent)?.trim();
            if (!text || text.startsWith('<!--') || text === '&nbsp;') return null;
            return text;
          })
          .filter(Boolean);
        return cells;
      })
      .filter(cells => cells.length > 0);
  });
}

// ─── Ottieni il frame dell'iframe del popup (CAP e PAYMTERMID usano iframe) ──
// Il popup DevExpress usa un <iframe id="*_CIF-1"> per caricare il contenuto.
// Il campo di ricerca è DENTRO l'iframe, non nel DOM principale.
async function getPopupIframeFrame(page) {
  // Aspetta che l'iframe CIF-1 appaia e sia visibile
  const iframeEl = await page.waitForSelector('[id$="_CIF-1"]', { visible: false, timeout: 8000 }).catch(() => null);
  if (!iframeEl) {
    finding('POPUP_IFRAME', '⚠️  Iframe CIF-1 non trovato');
    return null;
  }
  const iframeId = await iframeEl.evaluate(el => el.id);
  finding('POPUP_IFRAME', `Iframe trovato: ${iframeId}`);

  // Aspetta che l'iframe sia caricato (src impostato e contenuto presente)
  let iframeFrame = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    await wait(500);
    const frames = page.frames();
    iframeFrame = frames.find(f => {
      const url = f.url();
      return url.includes('FindPopup=true') || url.includes('ActionID=');
    });
    if (iframeFrame) break;
  }

  if (!iframeFrame) {
    finding('POPUP_IFRAME', '⚠️  Frame iframe non trovato nei frames della pagina');
    // Lista tutti i frames per diagnostica
    const frameUrls = page.frames().map(f => f.url());
    finding('POPUP_IFRAME', `Frames disponibili: ${JSON.stringify(frameUrls)}`);
    return null;
  }

  finding('POPUP_IFRAME', `Frame trovato: ${iframeFrame.url()}`);
  // Aspetta che il frame sia completamente caricato
  try {
    await iframeFrame.waitForFunction(() => document.readyState === 'complete', { timeout: 8000 });
  } catch { /* continua */ }

  return iframeFrame;
}

// ─── CAP dialog: apre il popup, ritorna il frame dell'iframe ─────────────────
async function openCapDialog(page, btnIdPattern) {
  const btnId = await page.evaluate(re => {
    const pat = new RegExp(re);
    return Array.from(document.querySelectorAll('img,a'))
      .find(el => pat.test(el.id||'') && el.offsetParent !== null)?.id ?? null;
  }, btnIdPattern);

  if (!btnId) {
    finding('CAP_DIALOG', `⚠️  Bottone CAP non trovato (pattern: ${btnIdPattern})`);
    return null;
  }
  finding('CAP_DIALOG', `Bottone trovato: ${btnId}`);
  await page.evaluate(id => document.getElementById(id)?.click(), btnId);
  log('  Attesa caricamento iframe popup...');

  const iframeFrame = await getPopupIframeFrame(page);
  if (!iframeFrame) return null;
  await shot(page, 'cap-dialog-open');

  // Trova il campo di ricerca nell'iframe
  const searchInput = await iframeFrame.waitForSelector(
    'input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="submit"])',
    { timeout: 6000 }
  ).catch(() => null);

  if (!searchInput) {
    finding('CAP_DIALOG', '⚠️  Campo di ricerca non trovato nel iframe');
    // Dump tutti gli input nell'iframe
    const iframeInputs = await iframeFrame.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(el => ({ id: el.id, type: el.type, cls: el.className }))
    );
    finding('CAP_DIALOG', `Inputs nel iframe: ${JSON.stringify(iframeInputs)}`);
    return null;
  }

  const searchInputId = await searchInput.evaluate(el => el.id);
  finding('CAP_DIALOG', `Campo di ricerca nell'iframe: ${searchInputId}`);
  return { iframeFrame, searchInput };
}

// ─── CAP dialog: cerca, legge risultati, studia struttura ────────────────────
async function searchCapDialog(page, ctx, query) {
  const { iframeFrame, searchInput } = ctx;
  log(`  Ricerca: "${query}"...`);

  // Svuota e scrivi nel campo di ricerca dell'iframe
  await searchInput.click({ clickCount: 3 }); // seleziona tutto
  await searchInput.type(query, { delay: 30 });

  // Premi Enter per cercare
  await searchInput.press('Enter');
  await waitIdle(page, `search-${query}`, 8000);
  await wait(2000);
  await shot(page, `cap-results-${query}`);

  // Leggi risultati e headers dall'iframe
  const results = await iframeFrame.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[id*="DXDataRow"]'))
      .filter(tr => tr.offsetParent !== null);
    return rows.map(row => ({
      rowId: row.id,
      cells: Array.from(row.querySelectorAll('td'))
        .map((td, idx) => ({
          idx,
          text: td.textContent?.trim() ?? '',
          hasInput: !!td.querySelector('input'),
        })),
    }));
  });

  const headers = await iframeFrame.evaluate(() =>
    Array.from(document.querySelectorAll('th, td.dxgvHeader_XafTheme, .dxgvHeaderCell_XafTheme'))
      .filter(el => el.offsetParent !== null)
      .map(el => el.textContent?.trim()).filter(Boolean)
  );

  finding('CAP_SEARCH', `Query "${query}": ${results.length} risultati. Headers: ${headers.join(' | ')}`);
  results.slice(0, 10).forEach((r, i) => {
    const cells = r.cells.filter(c => c.text && !c.hasInput).map(c => c.text);
    finding('CAP_ROW', `  [${i}] ${cells.join(' | ')} (rowId="${r.rowId}")`);
  });

  return { results, headers };
}

// ─── Seleziona riga nel popup iframe, aspetta chiusura + callback ERP ────────
// Dopo OK il sistema fa un callback AJAX per auto-popolare i campi correlati
// (CITY, STATE, COUNTY per il CAP). Bisogna aspettare il completamento.
async function selectPopupRow(page, ctx, rowId) {
  const { iframeFrame } = ctx;

  // Click singolo sulla riga nell'iframe
  await iframeFrame.evaluate(id => {
    const row = document.getElementById(id);
    row?.click();
  }, rowId);
  await wait(500);

  // Controlla se il popup si è chiuso automaticamente (doppio click o auto-select)
  const isClosed = await page.evaluate(() => {
    const cifs = Array.from(document.querySelectorAll('[id$="_CIF-1"]'));
    return !cifs.some(el => el.offsetParent !== null);
  }).catch(() => true);

  if (!isClosed) {
    // Popup ancora aperto → click OK nell'iframe
    const okResult = await iframeFrame.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="submit"]'))
        .find(el => el.offsetParent !== null && /^ok$/i.test((el.textContent||el.value||'').trim()));
      if (btn) { btn.click(); return { clicked: btn.id || btn.value, text: (btn.textContent||btn.value).trim() }; }
      return null;
    }).catch(() => null);

    if (!okResult) {
      // Fallback: doppio click
      await iframeFrame.evaluate(id => {
        const row = document.getElementById(id);
        row?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }, rowId);
      await wait(500);
    }
    finding('POPUP_SELECT', `OK/dblclick nel popup: ${JSON.stringify(okResult)}`);
  } else {
    finding('POPUP_SELECT', 'Click riga → popup chiuso automaticamente');
  }

  // Aspetta che il popup sia completamente chiuso
  await page.waitForFunction(() => {
    const cifs = Array.from(document.querySelectorAll('[id$="_CIF-1"]'));
    return !cifs.some(el => el.offsetParent !== null);
  }, { timeout: 8000, polling: 200 }).catch(() => {
    finding('POPUP_SELECT', '⚠️  Timeout attesa chiusura popup');
  });

  // ── CRITICO: aspetta il callback AJAX post-selezione ──────────────────────
  // Dopo la chiusura del popup, l'ERP fa un callback AJAX per auto-popolare
  // i campi correlati (CITY, STATE, COUNTY). waitIdle prima, poi pausa extra.
  await waitIdle(page, 'popup-callback-start', 3000);
  // Il callback può partire con delay — aspettiamo che ASPx torni idle una seconda volta
  await wait(500);
  await waitIdle(page, 'popup-callback-done', 10000);

  return 'selected';
}

async function closePopupDialog(page) {
  // Premi Escape — funziona per tutti i popup DevExpress
  await page.keyboard.press('Escape');
  await waitIdle(page, 'popup-escape', 3000);
  finding('POPUP_SELECT', 'Popup chiuso con Escape');
}

// ─── Clicca il checkbox di selezione di una riga della griglia ADDRESSes ─────
// In DevExpress ASPxGridView la checkbox di selezione è nel primo <td> della riga.
// Non è sempre un <input type="checkbox"> — può essere un custom control.
async function selectAddrRowCheckbox(page, rowIndex) {
  return page.evaluate(idx => {
    const grid = Array.from(document.querySelectorAll('table[id*="ADDRESSes"]')).find(t => t.offsetParent !== null);
    if (!grid) return { ok: false, reason: 'no-grid' };
    const rows = Array.from(grid.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[id*="DXDataRow"]'));
    const row = rows[idx];
    if (!row) return { ok: false, reason: `no-row-${idx}`, totalRows: rows.length };

    // Prova 1: input[type="checkbox"] nella riga
    const chk = row.querySelector('input[type="checkbox"]');
    if (chk) { chk.click(); return { ok: true, method: 'input-checkbox', id: chk.id }; }

    // Prova 2: DevExpress custom checkbox (div/span con classe "dxchk" o "dx-checkbox")
    const dxChk = row.querySelector('[class*="dxchk"],[class*="dxCheckBox"],[id*="CheckBox"]');
    if (dxChk) { dxChk.click(); return { ok: true, method: 'dxchk', id: dxChk.id }; }

    // Prova 3: primo <td> della riga (cella di selezione)
    const firstTd = row.querySelector('td:first-child');
    if (firstTd) { firstTd.click(); return { ok: true, method: 'first-td-click' }; }

    return { ok: false, reason: 'no-clickable-element', rowHtml: row.innerHTML.substring(0, 200) };
  }, rowIndex);
}

// ─── PAYMTERMID dialog: apre popup (iframe), aspetta input, dumpa tutte le opzioni ──
async function dumpPaymTermDialog(page) {
  const btnId = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .find(el => /PAYMTERMID.*_B0Img/.test(el.id||'') && el.offsetParent !== null)?.id ?? null
  );
  if (!btnId) { finding('PAYM_DIALOG', '⚠️  Bottone PAYMTERMID _B0Img non trovato'); return null; }
  finding('PAYM_DIALOG', `Bottone PAYMTERMID: ${btnId}`);

  // Clicca e aspetta il frame dell'iframe (stesso meccanismo del CAP)
  await page.evaluate(id => document.getElementById(id)?.click(), btnId);
  log('  Attesa iframe popup PAYMTERMID...');
  const iframeFrame = await getPopupIframeFrame(page);

  if (!iframeFrame) {
    finding('PAYM_DIALOG', '⚠️  Iframe non trovato per PAYMTERMID');
    await page.keyboard.press('Escape');
    await waitIdle(page, 'paym-esc', 3000);
    return null;
  }

  // Trova il campo di ricerca nell'iframe
  const searchInput = await iframeFrame.waitForSelector(
    'input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="submit"])',
    { timeout: 6000 }
  ).catch(() => null);

  if (!searchInput) {
    finding('PAYM_DIALOG', '⚠️  Campo ricerca non trovato nell\'iframe PAYMTERMID');
    await shot(page, 'paym-no-input');
    await page.keyboard.press('Escape');
    await waitIdle(page, 'paym-esc', 3000);
    return null;
  }
  const searchInputId = await searchInput.evaluate(el => el.id);
  finding('PAYM_DIALOG', `Campo ricerca trovato nell'iframe: ${searchInputId}`);
  await shot(page, 'paym-dialog-open');

  // Cerca con query vuota per caricare TUTTI i termini di pagamento
  log('  Ricerca tutti i termini (query vuota + Enter)...');
  await searchInput.click({ clickCount: 3 });
  await searchInput.press('Enter');
  await waitIdle(page, 'paym-search-all', 8000);
  await wait(2000);
  await shot(page, 'paym-all-results');

  // Leggi headers e tutte le righe dall'iframe
  const { headers, rows: paymRows } = await iframeFrame.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('th, td.dxgvHeader_XafTheme, .dxgvHeaderCell_XafTheme'))
      .filter(el => el.offsetParent !== null).map(el => el.textContent?.trim()).filter(Boolean);

    const rows = Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[id*="DXDataRow"]'))
      .filter(tr => tr.offsetParent !== null)
      .map(tr => ({
        rowId: tr.id,
        cells: Array.from(tr.querySelectorAll('td'))
          .map(td => td.textContent?.trim() ?? '')
          .filter(t => t && !t.startsWith('<!--')),
      }));
    return { headers, rows };
  });

  finding('PAYM_DIALOG', `Headers: ${headers.join(' | ')}`);
  finding('PAYM_DIALOG', `Righe trovate: ${paymRows.length}`);
  paymRows.forEach((r, i) => finding('PAYM_TERM', `  [${i}]: ${r.cells.join(' | ')}`));

  // Prova a selezionare il termine attuale (cerca "201" per questo cliente)
  const current201 = paymRows.find(r => r.cells.some(c => c.includes('201')));
  if (current201) {
    finding('PAYM_DIALOG', `Termine "201" trovato nella lista: ${current201.cells.join(' | ')}`);
    // Doppio click per selezionare
    await page.evaluate(id => {
      const row = document.getElementById(id);
      row?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }, current201.rowId);
    // Doppio click nell'iframe per selezionare
    await iframeFrame.evaluate(id => {
      const row = document.getElementById(id);
      row?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }, current201.rowId);
    await waitIdle(page, 'paym-dblclick', 5000);
    await wait(500);

    // Controlla se il popup iframe è scomparso (dialog chiuso)
    const dialogClosed = await page.evaluate(() => {
      const cifs = Array.from(document.querySelectorAll('[id$="_CIF-1"]'));
      return !cifs.some(el => el.offsetParent !== null);
    }).catch(() => true);
    finding('PAYM_DIALOG', `Doppio click → popup chiuso: ${dialogClosed}`);

    if (!dialogClosed) {
      // Cerca OK nell'iframe
      const okBtn = await iframeFrame.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="submit"]'))
          .find(el => el.offsetParent !== null && /^ok$/i.test((el.textContent||el.value||'').trim()));
        if (btn) { btn.click(); return btn.id||btn.value; }
        return null;
      }).catch(() => null);
      finding('PAYM_DIALOG', `Click OK nell'iframe: ${okBtn}`);
      if (okBtn) await waitIdle(page, 'paym-ok', 5000);
    }
  }

  const paymAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input'))
      .find(el => /PAYMTERMID.*_find_Edit_I$/.test(el.id) && el.offsetParent !== null)?.value ?? null
  );
  finding('PAYM_DIALOG', `Valore PAYMTERMID dopo selezione: "${paymAfter?.substring(0, 80)}"`);
  await shot(page, 'paym-after-select');

  // Chiudi se ancora aperto
  const cifs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[id$="_CIF-1"]')).some(el => el.offsetParent !== null)
  );
  if (cifs) {
    await page.keyboard.press('Escape');
    await waitIdle(page, 'paym-final-close', 3000);
    finding('PAYM_DIALOG', 'Popup chiuso con Escape');
  }

  return { headers, rows: paymRows };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  log('══════════════════════════════════════════');
  log('  CAP DIALOG + DELETE DUMP');
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

  // ── Handler globale per window.confirm() / window.alert() ─────────────────
  // Il delete (e potenzialmente altre azioni XAF) usa window.confirm().
  // Puppeteer congela qualsiasi page.evaluate() se il dialog non viene gestito.
  // L'handler globale accetta TUTTI i dialogs — quelli del delete vengono gestiti qui.
  const dialogLog = [];
  page.on('dialog', async dialog => {
    const msg = dialog.message();
    const type = dialog.type();
    dialogLog.push({ type, msg, ts: ts() });
    log(`  [DIALOG] ${type}: "${msg}" → accept()`);
    await dialog.accept();
  });

  try {
    await login(page);
    await openCustomerEdit(page);
    await shot(page, '00-edit-mode');

    // ══════════════════════════════════════════════════════════════════════════
    // PARTE A: CAP DIALOG — form principale
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ PARTE A: CAP DIALOG (form principale) ══');

    const capBtnPattern = 'LOGISTICSADDRESSZIPCODE.*_B0Img';
    const searchInputId = await openCapDialog(page, capBtnPattern);

    // Aggiorna selettore: openCapDialog ora ritorna { iframeFrame, searchInput } o null
    const ctx = await openCapDialog(page, capBtnPattern);

    if (ctx) {
      for (const capQuery of CAP_TEST_QUERIES) {
        const { results, headers } = await searchCapDialog(page, ctx, capQuery);

        if (results.length === 0) {
          finding('CAP_SEARCH', `"${capQuery}": nessun risultato`);
          // Svuota per prossima query
          await page.evaluate(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.focus();
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(el, ''); else el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }, searchInputId);
          await wait(300);
          continue;
        }

        // Esamina struttura del primo risultato in dettaglio
        const firstRow = results[0];
        const firstRowDetail = await page.evaluate(rowId => {
          const row = document.getElementById(rowId);
          if (!row) return null;
          return {
            id: row.id,
            cells: Array.from(row.querySelectorAll('td')).map((td, i) => ({
              idx: i,
              text: td.textContent?.trim() ?? '',
              innerHtml: td.innerHTML.substring(0, 100),
            })),
          };
        }, firstRow.rowId);
        finding('CAP_STRUCTURE', `Prima riga struttura: ${JSON.stringify(firstRowDetail?.cells?.filter(c => c.text))}`);

        // Se ci sono più risultati con stesso CAP → studia il problema delle città
        const capValues = results.map(r => r.cells.find(c => c.text === capQuery)?.text ?? r.cells[0]?.text);
        const allSameCap = capValues.every(v => v === capQuery);
        if (allSameCap && results.length > 1) {
          finding('CAP_MULTI_CITY', `⚠️  CAP "${capQuery}" ha ${results.length} risultati con la stessa P.IVA — città diverse!`);
          finding('CAP_MULTI_CITY', `Headers: ${headers.join(' | ')}`);
          results.forEach((r, i) => {
            const cells = r.cells.filter(c => c.text && !c.hasInput).map(c => c.text);
            finding('CAP_MULTI_CITY', `  [${i}]: ${cells.join(' | ')}`);
          });
        }

        report.capDialogs[capQuery] = { headers, results: results.slice(0, 15).map(r => r.cells.filter(c=>c.text&&!c.hasInput).map(c=>c.text)) };

        // Seleziona il primo risultato
        if (results.length > 0) {
          await shot(page, `cap-before-select-${capQuery}`);
          const selectResult = await selectPopupRow(page, ctx, firstRow.rowId);
          await wait(500);
          await shot(page, `cap-after-select-${capQuery}`);

          // Leggi CAP, CITY, STATE dopo la selezione
          const addrAfter = await page.evaluate(() => {
            const get = re => Array.from(document.querySelectorAll('input')).find(el=>new RegExp(re).test(el.id)&&el.offsetParent!==null)?.value??null;
            return {
              cap:     get(/LOGISTICSADDRESSZIPCODE.*(?<!editnew).*_I$/),
              city:    get(/dviCITY_Edit_I$/),
              county:  get(/dviCOUNTY_Edit_I$/),
              state:   get(/dviSTATE_Edit_I$/),
              country: get(/dviCOUNTRYREGIONID_Edit_I$/),
            };
          });
          finding('CAP_SELECT', `CAP dopo selezione "${capQuery}": selectResult="${selectResult}"`);
          finding('CAP_AUTOFILL', `Auto-fill dopo selezione: ${JSON.stringify(addrAfter)}`);
          finding('CAP_AUTOFILL', `CITY auto-fill: "${addrAfter.city}" | COUNTY: "${addrAfter.county}" | STATE: "${addrAfter.state}"`);

          if (selectResult === 'still-open') await closePopupDialog(page);
          break;
        }
      }
    }

    await shot(page, '10-after-cap-tests');

    // ══════════════════════════════════════════════════════════════════════════
    // PARTE B: CAP DIALOG — indirizzo alternativo
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ PARTE B: CAP DIALOG in Alt Addr (nuova riga) ══');
    await openTab(page, 'Indirizzo alt');
    await waitIdle(page, 'tab-altaddr', 5000);

    const newBtnId = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img[title="New"],img[title="Nuovo"]'))
        .find(el => el.offsetParent !== null && el.getBoundingClientRect().top > 150)?.id ?? null
    );
    if (!newBtnId) { finding('ALT_CAP', '⚠️  Bottone New non trovato'); }
    else {
      await page.evaluate(id => document.getElementById(id)?.click(), newBtnId);
      await waitIdle(page, 'new-row', 5000);
      await wait(1000);
      await setCombo(page, /editnew.*TYPE.*_I$/, 'Consegna');
      await typeField(page, /editnew.*NAME.*_I$/, 'TEST CAP', { waitAfterMs: 200 });

      const altCtx = await openCapDialog(page, 'ADDRESSes.*editnew.*LOGISTICSADDRESSZIPCODE.*_B0Img');
      if (altCtx) {
        const { results: altResults, headers: altHeaders } = await searchCapDialog(page, altCtx, '80100');
        report.capDialogs['altAddr_80100'] = { altHeaders, results: altResults.slice(0, 15).map(r => r.cells.filter(c=>c.text&&!c.hasInput).map(c=>c.text)) };
        finding('ALT_CAP', `CAP "80100" in Alt Addr: ${altResults.length} risultati | Headers: ${altHeaders.join(' | ')}`);
        altResults.slice(0, 8).forEach((r, i) => {
          finding('ALT_CAP', `  [${i}]: ${r.cells.filter(c=>c.text&&!c.hasInput).map(c=>c.text).join(' | ')}`);
        });

        if (altResults.length > 0) {
          const selAlt = await selectPopupRow(page, altCtx, altResults[0].rowId);
          await wait(500);
          await shot(page, 'alt-cap-after-select');
          const altAddrAfter = await page.evaluate(() => {
            const get = re => Array.from(document.querySelectorAll('input')).find(el=>new RegExp(re).test(el.id)&&el.offsetParent!==null)?.value??null;
            return { cap: get(/editnew.*LOGISTICSADDRESSZIPCODE.*_I$/), city: get(/editnew.*CITY.*_I$/), county: get(/editnew.*COUNTY.*_I$/), state: get(/editnew.*STATE.*_I$/), country: get(/editnew.*COUNTRYREGIONID.*_I$/) };
          });
          finding('ALT_CAP', `Auto-fill alt addr: ${JSON.stringify(altAddrAfter)}`);
          if (selAlt === 'still-open') await closePopupDialog(page);
        }
      }

      await addrGrid(page, 'CancelEdit');
      await waitIdle(page, 'cancel-edit', 3000);
      finding('ALT_CAP', 'CancelEdit — riga di test scartata');
    }

    await shot(page, '20-after-altaddr-cap');

    // ══════════════════════════════════════════════════════════════════════════
    // PARTE C: DELETE con SelectRow API
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ PARTE C: DELETE con SelectRow API ══');

    // Leggi righe esistenti
    const rowsBefore = await readAddrRows(page);
    finding('DELETE', `Righe prima: ${rowsBefore.length}`);
    rowsBefore.forEach((r, i) => finding('DELETE', `  [${i}]: ${r.join(' | ')}`));

    // Crea una riga di test da eliminare
    const newBtn2 = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img[title="New"],img[title="Nuovo"]'))
        .find(el => el.offsetParent !== null && el.getBoundingClientRect().top > 150)?.id ?? null
    );
    if (!newBtn2) { finding('DELETE', '⚠️  Bottone New non trovato'); }
    else {
      await page.evaluate(id => document.getElementById(id)?.click(), newBtn2);
      await waitIdle(page, 'new-row-delete', 5000);
      await wait(1000);
      await setCombo(page, /editnew.*TYPE.*_I$/, 'Ufficio');
      await typeField(page, /editnew.*NAME.*_I$/, 'TEST DELETE', { waitAfterMs: 200 });
      await typeField(page, /editnew.*STREET.*_I$/, 'Via del Test 99', { waitAfterMs: 200 });
      await addrGrid(page, 'UpdateEdit');
      await waitIdle(page, 'update-test-row', 5000);
      await shot(page, '21-test-row-created');

      const rowsAfterCreate = await readAddrRows(page);
      finding('DELETE', `Righe dopo creazione riga test: ${rowsAfterCreate.length}`);
      rowsAfterCreate.forEach((r, i) => finding('DELETE', `  [${i}]: ${r.join(' | ')}`));

      const targetIdx = rowsAfterCreate.length - 1; // ultima riga = quella appena creata

      // ── Strategia 1: SelectRow via API ────────────────────────────────────
      log('  ─ DELETE Strategia 1: SelectRow API ─');
      const selectResult = await addrGrid(page, 'SelectRow', targetIdx);
      finding('DELETE', `SelectRow(${targetIdx}): ${JSON.stringify(selectResult)}`);
      await wait(500);

      // Verifica selezione
      const isSelected = await addrGrid(page, 'IsRowSelectedOnPage', targetIdx);
      finding('DELETE', `IsRowSelectedOnPage(${targetIdx}): ${JSON.stringify(isSelected)}`);
      await shot(page, '22-row-selected');

      // Clicca bottone Delete
      const deleteBtnId = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a,img,button'))
          .filter(el => el.offsetParent !== null && el.getBoundingClientRect().top > 200)
          .find(el => /Cancellare|Delete|Elimina/i.test(el.title||''))?.id ?? null;
      });
      finding('DELETE', `Bottone delete: ${deleteBtnId}`);

      // ── Strategia corretta: checkbox riga → X toolbar → OK dialog ──────────
      // Dump della struttura della riga per capire dove si trova il checkbox
      const rowStructure = await page.evaluate(idx => {
        const grid = Array.from(document.querySelectorAll('table[id*="ADDRESSes"]')).find(t => t.offsetParent !== null);
        const rows = Array.from(grid?.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[id*="DXDataRow"]') ?? []);
        const row = rows[idx];
        if (!row) return null;
        return {
          rowId: row.id,
          // Prima cella: struttura per trovare il checkbox
          firstTd: row.querySelector('td:first-child')?.innerHTML?.substring(0, 300) ?? '',
          // Tutti gli elementi cliccabili nella riga
          clickables: Array.from(row.querySelectorAll('input,button,a,img,[onclick],[class*="chk"],[class*="check"]'))
            .map(el => ({ tag: el.tagName, id: el.id, cls: el.className?.substring(0,60), type: el.type, title: el.title })),
        };
      }, targetIdx);
      finding('DELETE', `Struttura riga ${targetIdx}: firstTdLen=${rowStructure?.firstTd?.length} | clickables=${JSON.stringify(rowStructure?.clickables)}`);

      // Clicca il checkbox usando la funzione specializzata
      const checkboxResult = await selectAddrRowCheckbox(page, targetIdx);
      finding('DELETE', `Checkbox click: ${JSON.stringify(checkboxResult)}`);
      await wait(500);
      await shot(page, '22-row-checkbox-clicked');

      // Cerca bottone delete (X rossa) — potrebbe essere nella toolbar DELLA GRIGLIA
      // Il bottone ha title "Cancellare" e ID con "ADDRESSes_ToolBar"
      const deleteBtnInfo = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('a,img,button'))
          .filter(el => el.offsetParent !== null && el.getBoundingClientRect().top > 200);
        return btns
          .filter(el => /Cancellare|Delete|Elimina|cancell/i.test(el.title||'') || /ADDRESSes_ToolBar.*DXI0/i.test(el.id||''))
          .map(el => ({ id: el.id, tag: el.tagName, title: el.title?.substring(0,60), disabled: el.disabled }));
      });
      finding('DELETE', `Bottoni delete disponibili: ${JSON.stringify(deleteBtnInfo)}`);

      if (deleteBtnInfo.length > 0) {
        const deleteBtn = deleteBtnInfo[0];

        // Handler globale già registrato — accetta automaticamente window.confirm()
        await page.evaluate(id => document.getElementById(id)?.click(), deleteBtn.id);
        // Aspetta 2s per il dialog (gestito dall'handler globale) + idle
        await wait(2500);
        await waitIdle(page, 'after-delete-confirm', 6000);
        await shot(page, '23-after-delete-confirmed');

        const lastDialog = dialogLog[dialogLog.length - 1];
        finding('DELETE', `Ultimo dialog intercettato: ${JSON.stringify(lastDialog)}`);
        await shot(page, '24-after-delete-confirmed');

        const rowsAfterDel = await readAddrRows(page);
        finding('DELETE', `Righe dopo delete: ${rowsAfterDel.length}`);
        rowsAfterDel.forEach((r,i) => finding('DELETE', `  [${i}]: ${r.join(' | ')}`));
        const delOk = rowsAfterDel.length < rowsAfterCreate.length;
        finding('DELETE', `Delete via checkbox+toolbar: ${delOk ? '✅' : '❌'}`);

        if (!delOk) {
          // Fallback: DeleteRow via API DevExpress
          log('  ─ DELETE Fallback: DeleteRow API ─');
          const delApi = await addrGrid(page, 'DeleteRow', targetIdx);
          finding('DELETE', `DeleteRow(${targetIdx}) API: ${JSON.stringify(delApi)}`);
          await waitIdle(page, 'deleterow-api', 6000);
          await wait(1500);
          await shot(page, '25-deleterow-api');
          // Gestione conferma popup
          await page.evaluate(() => {
            const allBtns = Array.from(document.querySelectorAll('a,button')).filter(el=>el.offsetParent!==null);
            const ok = allBtns.find(el=>/^(sì|si|yes|ok)$/i.test(el.textContent?.trim()||'') && el.getBoundingClientRect().top > window.innerHeight*0.3);
            ok?.click();
          });
          await waitIdle(page, 'deleterow-api-confirm', 5000);
          const rowsAfterApi = await readAddrRows(page);
          finding('DELETE', `Righe dopo DeleteRow API: ${rowsAfterApi.length} (${rowsAfterApi.length < rowsAfterCreate.length ? '✅' : '❌'})`);
        }
      } else {
        finding('DELETE', '⚠️  Nessun bottone delete trovato dopo checkbox');
        await shot(page, '22b-no-delete-btn');
        // Fallback: DeleteRow via API
        const delApi = await addrGrid(page, 'DeleteRow', targetIdx);
        finding('DELETE', `DeleteRow API fallback: ${JSON.stringify(delApi)}`);
        await waitIdle(page, 'deleterow-fallback', 5000);
        await wait(1500);
        await page.evaluate(() => { const ok=Array.from(document.querySelectorAll('a,button')).find(el=>el.offsetParent!==null&&/^(sì|si|yes|ok)$/i.test(el.textContent?.trim()||'')&&el.getBoundingClientRect().top>window.innerHeight*0.3); ok?.click(); });
        await waitIdle(page, 'deleterow-fallback-confirm', 5000);
        const rowsAfterFallback = await readAddrRows(page);
        finding('DELETE', `Righe dopo DeleteRow fallback: ${rowsAfterFallback.length} (${rowsAfterFallback.length < rowsAfterCreate.length ? '✅' : '❌'})`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PARTE D: PAYMTERMID dialog — dump completo opzioni + test selezione
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ PARTE D: PAYMTERMID — DUMP COMPLETO ══');
    finding('PAYM_DIALOG', 'Torno alla tab Principale per accedere a PAYMTERMID...');
    // Torna alla tab principale (PAYMTERMID è lì)
    await page.evaluate(() => {
      const mainTab = Array.from(document.querySelectorAll('a'))
        .find(el => el.offsetParent !== null && el.textContent?.trim() === 'Principale');
      mainTab?.click();
    });
    await waitIdle(page, 'tab-principale', 5000);

    const paymData = await dumpPaymTermDialog(page);
    if (paymData) {
      report.capDialogs['paymTerms'] = paymData;
      finding('PAYM_STRATEGY', 'STRATEGIA PAYMTERMID per il bot:');
      finding('PAYM_STRATEGY', '  1. Dal DB leggi il codice PAYMTERMID del cliente (es. "201")');
      finding('PAYM_STRATEGY', '  2. Clicca _B0Img → aspetta campo ricerca nel popup');
      finding('PAYM_STRATEGY', '  3. Digita il codice nel campo ricerca + Enter');
      finding('PAYM_STRATEGY', '  4. Doppio-click sulla riga corrispondente (o click + OK)');
      finding('PAYM_STRATEGY', '  5. Verifica campo PAYMTERMID aggiornato');
      finding('PAYM_STRATEGY', `  Le opzioni disponibili sono ${paymData.rows?.length ?? 0} — memorizzarle in shared.payment_terms`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FINE: Cancel form senza salvare
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ CANCEL FORM ══');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a,button'))
        .find(el => el.offsetParent !== null && /^annulla$|^cancel$/i.test(el.textContent?.trim()??'') && /DXI[23]/.test(el.id??''));
      btn?.click();
    });
    await wait(2000);
    log('  URL dopo cancel: ' + page.url());
    await shot(page, '99-final');

  } catch (err) {
    log(`\nERRORE: ${err}`);
    console.error(err);
    try { await shot(page, 'error'); } catch {}
  } finally {
    const reportFile = path.join(SCREENSHOT_DIR, 'cap-delete-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
    log(`\n✅  Report: ${reportFile}`);
    log('\n══ FINDINGS ══');
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

/**
 * dump-final-fields.mjs
 *
 * Script finale per certificare tutti i campi rimanenti e gli edge case:
 *
 *  A) Scrittura di TUTTI i campi testo semplici non ancora testati:
 *     PHONE, CELLULARPHONE, EMAIL, URL, STREET, BRASCRMATTENTIONTO, LEGALEMAIL, LEGALAUTHORITY
 *
 *  B) Campo "PROFILO CLIENTE" — identificazione e comportamento
 *
 *  C) CAP multi-città — strategia di selezione per CITTÀ specifica
 *     Test con 40050 (5 città) e logica di match su CITTÀ del DB
 *
 *  D) CAP clear button (_B1Img) — come svuotare il campo CAP
 *
 *  E) PAYMTERMID clear button (_B1Img)
 *
 *  F) CAP non trovato nel DB ERP — cosa succede?
 *
 *  G) Form CREA nuovo cliente — diff campi vs Edit
 *
 * Cliente test: 55839 — Pescuma Dr. Saverio (non viene salvato nulla)
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
const SCREENSHOT_DIR = '/tmp/final-fields-dump';
const CUSTOMER_ID    = '55839';

const report = { findings: [], fields: {} };
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
  const p = path.join(SCREENSHOT_DIR, `fin-${String(++shotIdx).padStart(3,'0')}-${label.replace(/[^a-z0-9]/gi,'-')}.png`);
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

async function typeField(page, idRegex, value, { waitAfterMs = 600 } = {}) {
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

async function login(page) {
  log('→ Login...');
  await page.goto(`${ARCHIBALD_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  if (!page.url().toLowerCase().includes('login')) { log('  Già autenticato'); return; }
  const uid = await page.evaluate(() => { const t=Array.from(document.querySelectorAll('input')).filter(i=>i.type!=='hidden'&&i.type!=='submit'&&i.type!=='button'&&i.type!=='password'); const f=t.find(i=>i.id.includes('UserName')||i.name.includes('UserName'))||t[0]; if(f){f.scrollIntoView();f.focus();} return f?.id??null; });
  if (!uid) throw new Error('Username non trovato');
  await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},uid);
  await page.type(`#${cssEscape(uid)}`, ARCHIBALD_USER, {delay:30});
  await page.keyboard.press('Tab'); await waitIdle(page,'login-user',5000);
  const pid = await page.evaluate(()=>{const p=document.querySelector('input[type="password"]');p?.scrollIntoView();p?.focus();return p?.id??null;});
  if (!pid) throw new Error('Password non trovata');
  await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},pid);
  await page.type(`#${cssEscape(pid)}`, ARCHIBALD_PASS, {delay:30});
  await page.keyboard.press('Tab'); await waitIdle(page,'login-pass',5000);
  const submitted = await page.evaluate(()=>{const btn=Array.from(document.querySelectorAll('input[type="submit"],button[type="submit"],a,button')).find(el=>el.offsetParent!==null&&/accedi|login|sign in|entra/i.test(el.textContent+(el.value||'')));if(btn){btn.click();return true;}const f=document.querySelector('input[type="submit"]');if(f){f.click();return true;}return false;});
  if (!submitted) await page.keyboard.press('Enter');
  await page.waitForNavigation({waitUntil:'networkidle2',timeout:20000}).catch(()=>{});
  if (page.url().toLowerCase().includes('login')) throw new Error('Login fallito');
  log('  Login OK → '+page.url());
}

async function openCustomerEdit(page, customerId) {
  await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_DetailView/${customerId}/`, {waitUntil:'networkidle2',timeout:30000});
  await waitReady(page,15000);
  const editClicked = await page.evaluate(()=>{
    const btn=Array.from(document.querySelectorAll('a,button,input[type="button"]')).filter(el=>el.offsetParent!==null).find(el=>/modif|edit/i.test(el.title??'')||/modif|edit/i.test(el.textContent?.trim()??'')||(el.id??'').includes('EditAction'));
    if(btn){btn.click();return btn.id||'found';}
    const tb=document.querySelector('a[id*="Edit"],a[title*="Modif"],a[title*="Edit"]');
    if(tb){tb.click();return tb.id;}
    return null;
  });
  if (!editClicked) {
    await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_DetailView/${customerId}/?mode=Edit`,{waitUntil:'networkidle2',timeout:30000});
  } else {
    await page.waitForFunction(()=>window.location.href.includes('mode=Edit')||document.querySelector('[title="Salvare"]')!==null,{timeout:10000,polling:300}).catch(()=>{});
  }
  await waitReady(page,15000);
  log('  Edit mode: '+page.url());
}

// ── Apre il popup iframe (CAP o PAYMTERMID) ────────────────────────────────
async function openPopupIframe(page, btnIdOrPattern) {
  const btnId = await page.evaluate(pat => {
    const re = new RegExp(pat);
    return Array.from(document.querySelectorAll('img,a'))
      .find(el => re.test(el.id||'') && el.offsetParent !== null)?.id ?? null;
  }, btnIdOrPattern);
  if (!btnId) return null;
  await page.evaluate(id => document.getElementById(id)?.click(), btnId);
  // Aspetta iframe
  const iframeEl = await page.waitForSelector('[id$="_CIF-1"]', { timeout: 8000 }).catch(() => null);
  if (!iframeEl) return null;
  let iframeFrame = null;
  for (let i = 0; i < 20; i++) {
    await wait(400);
    iframeFrame = page.frames().find(f => f.url().includes('FindPopup=true') || f.url().includes('ActionID='));
    if (iframeFrame) break;
  }
  if (!iframeFrame) return null;
  try { await iframeFrame.waitForFunction(() => document.readyState === 'complete', { timeout: 6000 }); } catch {}
  const searchInput = await iframeFrame.waitForSelector(
    'input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="submit"])',
    { timeout: 6000 }
  ).catch(() => null);
  if (!searchInput) return null;
  return { iframeFrame, searchInput, btnId };
}

async function searchAndGetResults(iframeFrame, searchInput, query) {
  await searchInput.click({ clickCount: 3 });
  if (query) await searchInput.type(query, { delay: 20 });
  await searchInput.press('Enter');
  await wait(2000);
  const results = await iframeFrame.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('th,.dxgvHeaderCell_XafTheme'))
      .filter(el=>el.offsetParent!==null).map(el=>el.textContent?.trim()).filter(Boolean);
    const rows = Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[id*="DXDataRow"]'))
      .filter(tr=>tr.offsetParent!==null)
      .map(tr => ({
        rowId: tr.id,
        cells: Array.from(tr.querySelectorAll('td')).map(td=>td.textContent?.trim()||'').filter(Boolean),
      }));
    return { headers, rows };
  });
  return results;
}

async function selectRowAndWait(page, iframeFrame, rowId) {
  await iframeFrame.evaluate(id => {
    const row = document.getElementById(id);
    row?.click();
  }, rowId);
  await wait(400);
  // Cerca bottone OK nell'iframe
  const ok = await iframeFrame.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="submit"]'))
      .find(el => el.offsetParent !== null && /^ok$/i.test((el.textContent||el.value||'').trim()));
    if (btn) { btn.click(); return btn.id||btn.value; }
    return null;
  }).catch(() => null);
  // Aspetta chiusura + callback AJAX
  await page.waitForFunction(() => {
    const cifs = Array.from(document.querySelectorAll('[id$="_CIF-1"]'));
    return !cifs.some(el => el.offsetParent !== null);
  }, { timeout: 8000, polling: 200 }).catch(() => {});
  await waitIdle(page, 'popup-callback', 5000);
  await wait(600);
  await waitIdle(page, 'popup-callback-done', 8000);
  return ok;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  log('══ FINAL FIELDS DUMP ══');

  const browser = await puppeteer.launch({
    headless: false, slowMo: 60,
    args: ['--ignore-certificate-errors','--no-sandbox','--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // Handler globale per dialogs
  const dialogLog = [];
  page.on('dialog', async dialog => {
    dialogLog.push({ type: dialog.type(), msg: dialog.message(), ts: ts() });
    log(`  [DIALOG] ${dialog.type()}: "${dialog.message()}" → accept()`);
    await dialog.accept();
  });

  try {
    await login(page);
    await openCustomerEdit(page, CUSTOMER_ID);
    await shot(page, '00-edit-mode');

    // ══════════════════════════════════════════════════════════════════════════
    // PARTE A: Scrittura di TUTTI i campi semplici non ancora testati
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ PARTE A: CAMPI TESTO SEMPLICI ══');

    // Leggi e salva i valori originali per tutti i campi che modifichiamo
    const originals = await page.evaluate(() => {
      const get = re => Array.from(document.querySelectorAll('input,textarea'))
        .find(el => new RegExp(re).test(el.id) && el.offsetParent !== null)?.value ?? null;
      return {
        phone:      get(/dviPHONE_Edit_I$/),
        cell:       get(/dviCELLULARPHONE_Edit_I$/),
        email:      get(/dviEMAIL_Edit_I$/),
        url:        get(/dviURL_Edit_I$/),
        street:     get(/dviSTREET_Edit_I$/),
        attention:  get(/dviBRASCRMATTENTIONTO_Edit_I$/),
        legalemail: get(/dviLEGALEMAIL_Edit_I$/),
        legalauth:  get(/dviLEGALAUTHORITY_Edit_I$/),
      };
    });
    log('  Valori originali:', originals);
    report.fields['originals'] = originals;

    const textTests = [
      { name: 'PHONE',          regex: /dviPHONE_Edit_I$/,            test: '+39099999999', maxLen: 255 },
      { name: 'CELLULARPHONE',  regex: /dviCELLULARPHONE_Edit_I$/,   test: '+39333333333', maxLen: 255 },
      { name: 'EMAIL',          regex: /dviEMAIL_Edit_I$/,            test: 'test@test.it',  maxLen: 255 },
      { name: 'URL',            regex: /dviURL_Edit_I$/,              test: 'https://test.it', maxLen: 255 },
      { name: 'STREET',         regex: /dviSTREET_Edit_I$/,           test: 'Via Test 123',  maxLen: 250 },
      { name: 'BRASCRMATTENTIONTO', regex: /dviBRASCRMATTENTIONTO_Edit_I$/, test: 'TEST ATTENZIONE', maxLen: 50 },
      { name: 'LEGALEMAIL',     regex: /dviLEGALEMAIL_Edit_I$/,      test: 'pec@test.it',   maxLen: 255 },
      { name: 'LEGALAUTHORITY', regex: /dviLEGALAUTHORITY_Edit_I$/,  test: 'SDI',           maxLen: 10  },
    ];

    for (const t of textTests) {
      const result = await typeField(page, t.regex, t.test, { waitAfterMs: 400 });
      finding('TEXT_FIELD', `${t.name}: found=${result.found} | written="${result.value}" | ok=${result.ok} | maxLen=${t.maxLen}`);
      if (!result.found) finding('TEXT_FIELD', `  ⚠️  Campo ${t.name} non trovato nel DOM`);
    }

    await shot(page, '01-text-fields-written');

    // Ripristina valori originali
    for (const [key, orig] of Object.entries(originals)) {
      if (orig === null) continue;
      const map = {
        phone: /dviPHONE_Edit_I$/, cell: /dviCELLULARPHONE_Edit_I$/,
        email: /dviEMAIL_Edit_I$/, url: /dviURL_Edit_I$/,
        street: /dviSTREET_Edit_I$/, attention: /dviBRASCRMATTENTIONTO_Edit_I$/,
        legalemail: /dviLEGALEMAIL_Edit_I$/, legalauth: /dviLEGALAUTHORITY_Edit_I$/,
      };
      if (map[key]) await typeField(page, map[key], orig, { waitAfterMs: 200 });
    }
    finding('TEXT_FIELD', 'Ripristino valori originali completato');

    // ══════════════════════════════════════════════════════════════════════════
    // PARTE B: Campo "PROFILO CLIENTE" — identificazione
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ PARTE B: PROFILO CLIENTE ══');

    const profiloFields = await page.evaluate(() => {
      // Cerca per testo "PROFILO" nelle etichette
      const byLabel = Array.from(document.querySelectorAll('label,.dxfl-editorLabel,td,span'))
        .filter(el => /profilo/i.test(el.textContent?.trim() || ''))
        .map(el => {
          const cont = el.closest('tr,.dxfl-layoutItem,div') || el.parentElement;
          const inp = cont?.querySelector('input,textarea,select');
          return inp ? { label: el.textContent?.trim(), id: inp.id, type: inp.type||inp.tagName, value: inp.value||'', readOnly: inp.readOnly } : null;
        })
        .filter(Boolean);

      // Cerca per ID pattern
      const byId = Array.from(document.querySelectorAll('input,select,textarea'))
        .filter(el => /profil|PROFILE|CUST_PROFILE|CUSTOMERPROFILE/i.test(el.id||'') && el.offsetParent !== null)
        .map(el => ({ id: el.id, type: el.type||el.tagName, value: el.value||'', readOnly: el.readOnly }));

      // Dump di tutti i campi visibili per trovare quelli non ancora mappati
      const allVisible = Array.from(document.querySelectorAll('input,textarea,select'))
        .filter(el => el.offsetParent !== null && el.id && !el.id.includes('EditorClientInfo'))
        .map(el => ({ id: el.id, value: (el.value||'').substring(0,50), readOnly: el.readOnly, type: el.type||el.tagName }));

      return { byLabel, byId, totalVisible: allVisible.length, allVisible };
    });

    finding('PROFILO', `Trovati per label "profilo": ${profiloFields.byLabel.length}`);
    profiloFields.byLabel.forEach(f => finding('PROFILO', `  label="${f.label}" → id="${f.id}" val="${f.value}" readOnly=${f.readOnly}`));
    finding('PROFILO', `Trovati per ID "profil*": ${profiloFields.byId.length}`);
    profiloFields.byId.forEach(f => finding('PROFILO', `  id="${f.id}" val="${f.value}" readOnly=${f.readOnly}`));
    finding('PROFILO', `Totale campi visibili: ${profiloFields.totalVisible}`);

    // Dump completo per trovare campi non ancora mappati
    const knownPatterns = /VATNUM|VATLAST|VATVALI|VATADDR|ACCOUNTNUM|dviID_|NAME|DLVMODE|FISCAL|CURRENCY|BRASCR|CUSTINFO|BUSINESS|PAYMT|LEGAL|BLOCKED|ADDRESS|STREET|ZIPCODE|COUNTRYREGION|dviCITY|COUNTY|dviSTATE|dviPHONE|CELLULAR|EMAIL|URL/i;
    const unknownFields = profiloFields.allVisible.filter(f => !knownPatterns.test(f.id));
    finding('PROFILO', `Campi SCONOSCIUTI (non ancora mappati): ${unknownFields.length}`);
    unknownFields.forEach(f => finding('UNKNOWN_FIELD', `  id="${f.id}" val="${f.value}" readOnly=${f.readOnly} type=${f.type}`));
    report.fields['unknownFields'] = unknownFields;

    await shot(page, '02-profilo-discovery');

    // ══════════════════════════════════════════════════════════════════════════
    // PARTE C: CAP multi-città — selezione per CITTÀ specifica
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ PARTE C: CAP MULTI-CITTÀ (40050) ══');

    const capCtx = await openPopupIframe(page, 'LOGISTICSADDRESSZIPCODE.*_B0Img');
    if (capCtx) {
      const { iframeFrame, searchInput } = capCtx;
      const { headers, rows } = await searchAndGetResults(iframeFrame, searchInput, '40050');

      finding('CAP_MULTI', `Headers: ${headers.join(' | ')}`);
      finding('CAP_MULTI', `Risultati per "40050": ${rows.length}`);
      rows.forEach((r, i) => finding('CAP_MULTI', `  [${i}]: ${r.cells.join(' | ')}`));

      // Struttura celle: [CAP, CITTÀ, STATO, CONTEA, PAESE]
      // Headers potrebbe essere vuoto dal iframe — usiamo indice fisso.
      // Dalla analisi: cells[0]=CAP, cells[1]=CITTÀ, cells[2]=STATO, cells[3]=CONTEA, cells[4]=PAESE
      const capColIdx   = 0;
      const cityColIdx  = 1;
      const stateColIdx = 2;
      const countyColIdx = 3;
      const countryColIdx = 4;
      finding('CAP_MULTI', `Headers iframe: [${headers.join('|')}]`);
      finding('CAP_MULTI', `Layout celle (fisso): 0=CAP, 1=CITTÀ, 2=STATO, 3=CONTEA, 4=PAESE`);

      // Strategia di selezione per città specifica:
      // Il bot legge la città dal DB e cerca la riga con CITTÀ corrispondente
      const targetCity = 'Loiano';
      const targetRow = rows.find(r => r.cells[cityColIdx]?.trim() === targetCity);
      finding('CAP_MULTI', `Strategia: cerca riga con cells[${cityColIdx}]="${targetCity}" → ${targetRow ? `trovata rowId="${targetRow.rowId}"` : 'NON TROVATA'}`);

      if (targetRow) {
        const ok = await selectRowAndWait(page, iframeFrame, targetRow.rowId);
        finding('CAP_MULTI', `Selezione "${targetCity}": OK clicked="${ok}"`);
        await wait(500);
        await shot(page, '03-cap-40050-loiano-selected');

        // Verifica auto-fill
        const afterSelect = await page.evaluate(() => {
          const get = re => Array.from(document.querySelectorAll('input')).find(el=>new RegExp(re).test(el.id)&&el.offsetParent!==null)?.value??null;
          return { cap: get(/LOGISTICSADDRESSZIPCODE.*_I$/), city: get(/dviCITY_Edit_I$/), county: get(/dviCOUNTY_Edit_I$/), state: get(/dviSTATE_Edit_I$/), country: get(/dviCOUNTRYREGIONID_Edit_I$/) };
        });
        finding('CAP_MULTI', `Auto-fill dopo selezione "${targetCity}": ${JSON.stringify(afterSelect)}`);
      }

      // Test anche: CAP non trovato nel DB ERP
      const capCtx2 = await openPopupIframe(page, 'LOGISTICSADDRESSZIPCODE.*_B0Img');
      if (capCtx2) {
        const { iframeFrame: ifr2, searchInput: si2 } = capCtx2;
        const { rows: notFoundRows } = await searchAndGetResults(ifr2, si2, '99999');
        finding('CAP_NOT_FOUND', `CAP "99999" (inventato): ${notFoundRows.length} risultati → ${notFoundRows.length === 0 ? 'NESSUN RISULTATO (come previsto)' : 'TROVATO!'}`);
        await shot(page, '04-cap-not-found');
        // Chiudi senza selezionare
        await page.keyboard.press('Escape');
        await waitIdle(page, 'cap-escape', 3000);
      }
    } else {
      finding('CAP_MULTI', '⚠️  Non riuscito ad aprire il popup CAP');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PARTE D: CAP clear button (_B1Img) — come svuotare il campo CAP
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ PARTE D: CAP CLEAR BUTTON (_B1Img) ══');

    // Prima leggi il valore attuale
    const capBefore = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).find(el=>/LOGISTICSADDRESSZIPCODE.*_I$/.test(el.id)&&el.offsetParent!==null)?.value??null
    );
    finding('CAP_CLEAR', `CAP prima del clear: "${capBefore}"`);

    // Trova il bottone _B1Img del CAP
    const capClearBtn = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img,a'))
        .find(el => /LOGISTICSADDRESSZIPCODE.*_B1Img/.test(el.id||'') && el.offsetParent !== null)
        ?.id ?? null
    );
    finding('CAP_CLEAR', `Bottone _B1Img CAP: ${capClearBtn}`);

    if (capClearBtn) {
      await page.evaluate(id => document.getElementById(id)?.click(), capClearBtn);
      await waitIdle(page, 'cap-clear', 5000);
      await wait(500);
      await shot(page, '05-cap-after-clear');

      const capAfterClear = await page.evaluate(() => {
        const get = re => Array.from(document.querySelectorAll('input')).find(el=>new RegExp(re).test(el.id)&&el.offsetParent!==null)?.value??null;
        return { cap: get(/LOGISTICSADDRESSZIPCODE.*_I$/), city: get(/dviCITY_Edit_I$/), county: get(/dviCOUNTY_Edit_I$/), state: get(/dviSTATE_Edit_I$/) };
      });
      finding('CAP_CLEAR', `Dopo _B1Img: ${JSON.stringify(capAfterClear)}`);
      finding('CAP_CLEAR', `CITY svuotata: ${capAfterClear.city === '' ? '✅' : '❌ (rimasta: '+capAfterClear.city+')'}`);
      finding('CAP_CLEAR', `COUNTY svuotata: ${capAfterClear.county === '' ? '✅' : '❌'}`);
    } else {
      finding('CAP_CLEAR', '⚠️  Bottone _B1Img CAP non trovato');
      // Cerca tutti i bottoni vicini al campo CAP
      const nearBtns = await page.evaluate(() => {
        const capInput = Array.from(document.querySelectorAll('input')).find(el=>/LOGISTICSADDRESSZIPCODE.*_I$/.test(el.id)&&el.offsetParent!==null);
        if (!capInput) return [];
        return Array.from(document.querySelectorAll('img,a,button'))
          .filter(el => el.offsetParent !== null && /LOGISTICSADDRESSZIPCODE/i.test(el.id||''))
          .map(el => ({ id: el.id, tag: el.tagName, title: el.title }));
      });
      finding('CAP_CLEAR', `Tutti i bottoni CAP: ${JSON.stringify(nearBtns)}`);
    }

    // Ripristina il CAP originale (85029)
    const capRestoreCtx = await openPopupIframe(page, 'LOGISTICSADDRESSZIPCODE.*_B0Img');
    if (capRestoreCtx) {
      const { iframeFrame: ifrR, searchInput: siR } = capRestoreCtx;
      const { rows: restoreRows } = await searchAndGetResults(ifrR, siR, '85029');
      if (restoreRows.length > 0) {
        await selectRowAndWait(page, ifrR, restoreRows[0].rowId);
        finding('CAP_CLEAR', `CAP ripristinato a 85029 (Venosa)`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PARTE E: PAYMTERMID clear button (_B1Img)
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ PARTE E: PAYMTERMID CLEAR BUTTON ══');

    const paymBefore = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).find(el=>/PAYMTERMID.*_find_Edit_I$/.test(el.id)&&el.offsetParent!==null)?.value??null
    );
    finding('PAYM_CLEAR', `PAYMTERMID prima: "${paymBefore?.substring(0,60)}"`);

    const allPaymBtns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img,a'))
        .filter(el => /PAYMTERMID/i.test(el.id||'') && el.offsetParent !== null)
        .map(el => ({ id: el.id, tag: el.tagName, title: el.title }))
    );
    finding('PAYM_CLEAR', `Tutti i bottoni PAYMTERMID: ${JSON.stringify(allPaymBtns)}`);

    const paymClearBtn = allPaymBtns.find(b => /_B1Img$/.test(b.id));
    finding('PAYM_CLEAR', `Bottone clear _B1Img: ${JSON.stringify(paymClearBtn)}`);

    if (paymClearBtn) {
      await page.evaluate(id => document.getElementById(id)?.click(), paymClearBtn.id);
      await waitIdle(page, 'paym-clear', 5000);
      await wait(500);
      await shot(page, '06-paymterm-after-clear');

      const paymAfterClear = await page.evaluate(() =>
        Array.from(document.querySelectorAll('input')).find(el=>/PAYMTERMID.*_find_Edit_I$/.test(el.id)&&el.offsetParent!==null)?.value??null
      );
      finding('PAYM_CLEAR', `PAYMTERMID dopo clear: "${paymAfterClear}"`);
      finding('PAYM_CLEAR', `Clear funziona: ${paymAfterClear === '' || paymAfterClear === null ? '✅' : '❌'}`);

      // Ripristina il PAYMTERMID originale
      const paymCtx = await openPopupIframe(page, 'PAYMTERMID.*_B0Img');
      if (paymCtx) {
        const { iframeFrame: paymIfr, searchInput: paymSi } = paymCtx;
        const { rows: paymRows } = await searchAndGetResults(paymIfr, paymSi, '201');
        const row201 = paymRows.find(r => r.cells.some(c => c.includes('201')));
        if (row201) {
          await selectRowAndWait(page, paymIfr, row201.rowId);
          finding('PAYM_CLEAR', 'PAYMTERMID "201" ripristinato');
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PARTE F: Form CREA — diff campi vs Edit
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ PARTE F: FORM CREA NUOVO CLIENTE ══');

    // Chiudi prima il form di edit senza salvare
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a,button'))
        .find(el => el.offsetParent !== null && /^annulla$|^annullare$/i.test(el.textContent?.trim()??'') && /DXI[23]/.test(el.id??''));
      btn?.click();
    });
    await wait(2000);
    await waitIdle(page, 'cancel-edit', 5000);
    log('  Form edit chiuso. URL: '+page.url());

    // Navigazione corretta per il form CREATE:
    // esattamente come fa createCustomer nel bot: CUSTTABLE_ListView_Agent → Nuovo
    await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitReady(page, 15000);
    log('  URL ListView: '+page.url());

    // Clicca "Nuovo" dalla list view
    const newBtnClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('a,span,button'))
        .filter(el => el.offsetParent !== null);
      const btn = btns.find(el => /^nuovo$|^new$/i.test(el.textContent?.trim()??''));
      if (btn) { btn.click(); return btn.id||btn.textContent?.trim(); }
      return null;
    });
    log('  Bottone Nuovo: '+newBtnClicked);
    if (!newBtnClicked) { finding('CREATE_FORM', '⚠️  Bottone Nuovo non trovato nella ListView'); }

    // Attendi che la URL non contenga più "ListView"
    await page.waitForFunction(() => !window.location.href.includes('ListView'), { timeout: 15000, polling: 200 }).catch(() => {});
    await waitReady(page, 15000);
    log('  URL dopo Nuovo: '+page.url());
    await shot(page, '07-create-form');

    // Dump di tutti i campi nella form di creazione
    const createFields = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input,textarea,select'))
        .filter(el => el.offsetParent !== null && el.id && !el.id.includes('EditorClientInfo'))
        .map(el => ({
          id: el.id, value: (el.value||'').substring(0,50),
          readOnly: el.readOnly, type: el.type||el.tagName,
          maxLength: el.maxLength > 0 ? el.maxLength : null,
        }))
    );
    finding('CREATE_FORM', `Campi nella form CREA: ${createFields.length}`);
    createFields.forEach(f => finding('CREATE_FIELD', `  id="${f.id}" val="${f.value}" readOnly=${f.readOnly} maxLen=${f.maxLength}`));
    report.fields['createFormFields'] = createFields;

    // Confronto con edit: quanti campi sono in create ma non in edit?
    const editFieldIds = new Set((profiloFields.allVisible||[]).map(f => {
      // Normalizza l'id rimuovendo il prefisso dinamico per confronto
      return f.id.replace(/^Vertical_v\d+_\d+_/, '').replace(/^Vertical_v\d+_/, '');
    }));
    const createFieldIds = createFields.map(f => f.id.replace(/^Vertical_v\d+_\d+_/, '').replace(/^Vertical_v\d+_/, ''));
    finding('CREATE_FORM', `Campi in create ma NON in edit: TODO (vedi report JSON per confronto)`);

    await shot(page, '08-create-form-fields');

    // Chiudi senza salvare
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a,button'))
        .find(el => el.offsetParent !== null && /^annulla$|^annullare$/i.test(el.textContent?.trim()??'') && /DXI[23]/.test(el.id??''));
      btn?.click();
    });
    await wait(2000);

  } catch (err) {
    log(`\nERRORE: ${err}`);
    console.error(err);
    try { await shot(page, 'error'); } catch {}
  } finally {
    const reportFile = path.join(SCREENSHOT_DIR, 'final-report.json');
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

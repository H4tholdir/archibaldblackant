/**
 * dump-order-save-snapshot.mjs
 *
 * Script definitivo per certificare:
 *
 *  A) ORDINE DEI CAMPI — i callback si interferiscono?
 *     - VAT callback: resetta CAP? DLVMODE? altri testi?
 *     - CAP callback: resetta DLVMODE? PAYMTERMID?
 *     - Test sequenza "sbagliata" (testo prima, lookup dopo)
 *
 *  B) FULL ROUND-TRIP — imposta TUTTI i campi → salva → riapri → leggi → confronta
 *     - Ogni campo che impostiamo lo confrontiamo con il valore letto post-save
 *     - Identifica campi "che si perdono" al salvataggio
 *
 *  C) MODIFICA PUNTUALE — cambia solo un campo, verifica che gli altri non cambino
 *     - Snapshot pre-modifica
 *     - Modifica solo NAME
 *     - Salva
 *     - Snapshot post-modifica
 *     - Diff: solo NAME deve essere cambiato
 *
 *  D) STRUTTURA SNAPSHOT — definisce il formato ritornato al sistema
 *     - Tutti i campi rilevanti per la PWA
 *     - Timestamp
 *     - Flag "pending-sync"
 *
 * NOTA: Il test B modifica i campi del cliente 55839 temporaneamente.
 *       Lo script ripristina TUTTO alla fine (ultimo save = valori originali).
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); } catch {}

const ARCHIBALD_URL  = (process.env.ARCHIBALD_URL || 'https://4.231.124.90/Archibald').replace(/\/$/, '');
const ARCHIBALD_USER = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const ARCHIBALD_PASS = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const SCREENSHOT_DIR = '/tmp/order-save-snapshot';
const CUSTOMER_ID    = '55839';
const CUSTOMER_URL   = `${ARCHIBALD_URL}/CUSTTABLE_DetailView/${CUSTOMER_ID}/`;

const report = { findings: [], tests: {}, snapshot: null };
let shotIdx = 0;

function ts()  { return new Date().toISOString().slice(11, 23); }
function log(msg, data) {
  process.stdout.write(`[${ts()}] ${msg}\n`);
  if (data !== undefined) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function cssEscape(id) { return id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1'); }
function finding(cat, msg) { report.findings.push({ cat, msg, ts: ts() }); log(`  [${cat}] ${msg}`); }

async function shot(page, label) {
  const p = path.join(SCREENSHOT_DIR, `oss-${String(++shotIdx).padStart(3,'0')}-${label.replace(/[^a-z0-9]/gi,'-')}.png`);
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
    await page.waitForFunction(() => document.readyState === 'complete' && typeof window.ASPxClientControl !== 'undefined', { timeout: ms, polling: 200 });
    await waitIdle(page, 'ready', ms);
  } catch { log('  waitReady timeout'); }
}

// ── Snapshot di tutti i campi visibili ────────────────────────────────────────
async function readAllFields(page) {
  return page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('input,textarea,select')) {
      if (el.offsetParent !== null && el.id && !el.id.includes('EditorClientInfo'))
        out[el.id] = { value: (el.value||'').substring(0,200), readOnly: el.readOnly };
    }
    return out;
  });
}

// ── Snapshot strutturato per la PWA ──────────────────────────────────────────
async function buildCustomerSnapshot(page) {
  return page.evaluate(() => {
    const get = re => Array.from(document.querySelectorAll('input,textarea'))
      .find(el => new RegExp(re).test(el.id) && el.offsetParent !== null)?.value ?? null;
    return {
      // Identificatori
      internalId:    get(/dviID_Edit_I$/),
      accountNum:    get(/dviACCOUNTNUM_Edit_I$/),
      // Dati fiscali
      vatNumber:     get(/dviVATNUM_Edit_I$/),
      vatValidated:  get(/dviVATVALIEDE_Edit_I$/),
      fiscalCode:    get(/dviFISCALCODE_Edit_I$/),
      pec:           get(/dviLEGALEMAIL_Edit_I$/),
      sdi:           get(/dviLEGALAUTHORITY_Edit_I$/),
      // Dati anagrafici
      name:          get(/dviNAME_Edit_I$/),
      nameAlias:     get(/dviNAMEALIAS_Edit_I$/),
      attentionTo:   get(/dviBRASCRMATTENTIONTO_Edit_I$/),
      notes:         get(/dviCUSTINFO_Edit_I$/),
      // Indirizzo principale
      street:        get(/dviSTREET_Edit_I$/),
      postalCode:    get(/dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_I$/),
      city:          get(/dviCITY_Edit_I$/),
      county:        get(/dviCOUNTY_Edit_I$/),
      state:         get(/dviSTATE_Edit_I$/),
      country:       get(/dviCOUNTRYREGIONID_Edit_I$/),
      // Contatti
      phone:         get(/dviPHONE_Edit_I$/),
      mobile:        get(/dviCELLULARPHONE_Edit_I$/),
      email:         get(/dviEMAIL_Edit_I$/),
      url:           get(/dviURL_Edit_I$/),
      // Logistica
      deliveryMode:  get(/dviDLVMODE_Edit_dropdown_DD_I$/),
      paymentTerms:  get(/dviPAYMTERMID_Edit_find_Edit_I$/),
      sector:        get(/dviBUSINESSSECTORID_Edit_dropdown_DD_I$/),
    };
  });
}

async function buildPrezziSnapshot(page) {
  return page.evaluate(() => {
    const get = re => Array.from(document.querySelectorAll('input'))
      .find(el => new RegExp(re).test(el.id) && el.offsetParent !== null)?.value ?? null;
    return {
      priceGroup:  get(/dviPRICEGROUP_Edit_dropdown_DD_I$/),
      lineDisc:    get(/dviLINEDISC_Edit_dropdown_DD_I$/),
      multiLineDisc: get(/dviMULTILINEDISC_Edit_dropdown_DD_I$/),
      endDisc:     get(/dviENDDISC_Edit_dropdown_DD_I$/),
    };
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(page) {
  await page.goto(`${ARCHIBALD_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  if (!page.url().toLowerCase().includes('login')) { log('  Già autenticato'); return; }
  const uid = await page.evaluate(() => { const t=Array.from(document.querySelectorAll('input')).filter(i=>i.type!=='hidden'&&i.type!=='submit'&&i.type!=='button'&&i.type!=='password'); const f=t.find(i=>i.id.includes('UserName')||i.name.includes('UserName'))||t[0]; if(f){f.scrollIntoView();f.focus();} return f?.id??null; });
  if (!uid) throw new Error('Username non trovato');
  await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},uid);
  await page.type(`#${cssEscape(uid)}`,ARCHIBALD_USER,{delay:30}); await page.keyboard.press('Tab'); await waitIdle(page,'login-user',5000);
  const pid = await page.evaluate(()=>{const p=document.querySelector('input[type="password"]');p?.scrollIntoView();p?.focus();return p?.id??null;});
  if (!pid) throw new Error('Password non trovata');
  await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},pid);
  await page.type(`#${cssEscape(pid)}`,ARCHIBALD_PASS,{delay:30}); await page.keyboard.press('Tab'); await waitIdle(page,'login-pass',5000);
  const ok=await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('input[type="submit"],button[type="submit"],a,button')).find(el=>el.offsetParent!==null&&/accedi|login|sign in|entra/i.test(el.textContent+(el.value||'')));if(b){b.click();return true;}const f=document.querySelector('input[type="submit"]');if(f){f.click();return true;}return false;});
  if (!ok) await page.keyboard.press('Enter');
  await page.waitForNavigation({waitUntil:'networkidle2',timeout:20000}).catch(()=>{});
  if (page.url().toLowerCase().includes('login')) throw new Error('Login fallito');
  log('  Login OK → '+page.url());
}

async function openEdit(page) {
  await page.goto(CUSTOMER_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitReady(page, 15000);
  const editClicked = await page.evaluate(()=>{
    const btn=Array.from(document.querySelectorAll('a,button,input[type="button"]')).filter(el=>el.offsetParent!==null).find(el=>/modif|edit/i.test(el.title??'')||/modif|edit/i.test(el.textContent?.trim()??'')||(el.id??'').includes('EditAction'));
    if(btn){btn.click();return btn.id||'found';}
    const tb=document.querySelector('a[id*="Edit"],a[title*="Modif"],a[title*="Edit"]');
    if(tb){tb.click();return tb.id;}return null;
  });
  if (!editClicked) await page.goto(`${CUSTOMER_URL}?mode=Edit`,{waitUntil:'networkidle2',timeout:30000});
  else await page.waitForFunction(()=>window.location.href.includes('mode=Edit')||document.querySelector('[title="Salvare"]')!==null,{timeout:10000,polling:300}).catch(()=>{});
  await waitReady(page,15000);
  log('  Edit mode: '+page.url());
}

async function openTab(page, tabText) {
  const aliases = { 'Prezzi e sconti': ['Prezzi e sconti','Price','Prezzi'], 'Principale': ['Principale','Main'] };
  const candidates = aliases[tabText] || [tabText];
  for (const cand of candidates) {
    const clicked = await page.evaluate(text => {
      for (const el of document.querySelectorAll('a.dxtc-link,span.dx-vam,a'))
        if (el.textContent?.trim().includes(text) && el.offsetParent !== null) { (el.tagName==='A'?el:el.parentElement)?.click(); return true; }
      return false;
    }, cand);
    if (clicked) { await waitIdle(page,`tab-${cand}`,6000); return true; }
  }
  return false;
}

async function typeField(page, idRegex, value, { waitAfterMs=600 } = {}) {
  const inputId = await page.evaluate(re => {
    const pat = new RegExp(re);
    const el = Array.from(document.querySelectorAll('input,textarea')).find(i=>i.offsetParent!==null&&pat.test(i.id));
    if (!el) return null;
    el.scrollIntoView({block:'center'}); el.focus(); el.click();
    if (typeof el.select==='function') el.select();
    const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    if(setter)setter.call(el,'');else el.value='';
    el.dispatchEvent(new Event('input',{bubbles:true}));
    return el.id;
  }, idRegex.source||String(idRegex));
  if (!inputId) return { found: false };
  await page.type(`#${cssEscape(inputId)}`,value,{delay:5});
  await page.keyboard.press('Tab'); await wait(waitAfterMs); await waitIdle(page,`type`,8000);
  const actual = await page.evaluate(id=>document.getElementById(id)?.value??'',inputId);
  return { found:true, id:inputId, actual, ok:actual===value };
}

async function setCombo(page, idRegex, value) {
  const result = await page.evaluate((re,val)=>{
    const pat=new RegExp(re);
    const input=Array.from(document.querySelectorAll('input')).find(i=>i.offsetParent!==null&&pat.test(i.id));
    if(!input)return{found:false};
    input.scrollIntoView({block:'center'});
    const col=window.ASPxClientControl?.GetControlCollection?.();
    if(col){let combo=null;col.ForEachControl(c=>{if(combo)return;try{if(c.GetInputElement?.()?.id===input.id)combo=c;else{const m=c.GetMainElement?.();if(m?.contains(input)&&typeof c.SetSelectedIndex==='function')combo=c;}}catch{}});
    if(combo&&typeof combo.GetItemCount==='function'){const n=combo.GetItemCount();for(let i=0;i<n;i++){const t=combo.GetItem?.(i)?.text;if(t===val){combo.SetSelectedIndex(i);return{found:true,method:'SetSelectedIndex',text:t};}}}}
    return{found:false,inputId:input.id};
  },idRegex.source||String(idRegex),value);
  await waitIdle(page,`combo-${value}`,5000);
  return result;
}

async function openLookupAndSelect(page, btnPattern, searchQuery, cityHint) {
  const btnId = await page.evaluate(re => {
    const pat=new RegExp(re);
    return Array.from(document.querySelectorAll('img,a')).find(el=>pat.test(el.id||'')&&el.offsetParent!==null)?.id??null;
  }, btnPattern);
  if (!btnId) return { ok: false, reason: 'button-not-found' };
  await page.evaluate(id=>document.getElementById(id)?.click(),btnId);
  let iframeFrame = null;
  for (let i=0;i<20;i++) { await wait(400); iframeFrame=page.frames().find(f=>f.url().includes('FindPopup')); if(iframeFrame)break; }
  if (!iframeFrame) return { ok:false, reason:'iframe-not-found' };
  try { await iframeFrame.waitForFunction(()=>document.readyState==='complete',{timeout:6000}); } catch {}
  const searchInput = await iframeFrame.waitForSelector('input[type="text"],input:not([type="hidden"]):not([type="checkbox"])',{timeout:6000}).catch(()=>null);
  if (!searchInput) return { ok:false, reason:'search-input-not-found' };
  await searchInput.click({clickCount:3});
  await searchInput.type(searchQuery,{delay:20});
  await searchInput.press('Enter');
  await wait(2000);
  const rows = await iframeFrame.evaluate((hint)=>{
    const rs=Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[id*="DXDataRow"]')).filter(tr=>tr.offsetParent!==null);
    return rs.map(r=>({rowId:r.id,cells:Array.from(r.querySelectorAll('td')).map(td=>td.textContent?.trim()||'').filter(Boolean)}));
  },cityHint);
  if (rows.length===0) return { ok:false, reason:'no-results', rows:[] };
  const targetRow = cityHint
    ? (rows.find(r=>r.cells[1]?.trim()===cityHint) ?? rows[0])
    : rows[0];
  await iframeFrame.evaluate(id=>{document.getElementById(id)?.click();},targetRow.rowId);
  await wait(400);
  const okClicked = await iframeFrame.evaluate(()=>{const btn=Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="submit"]')).find(el=>el.offsetParent!==null&&/^ok$/i.test((el.textContent||el.value||'').trim()));if(btn){btn.click();return btn.id||btn.value;}return null;}).catch(()=>null);
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('[id$="_CIF-1"]')).some(el=>el.offsetParent!==null),{timeout:8000,polling:200}).catch(()=>{});
  await waitIdle(page,'popup-callback',5000); await wait(600); await waitIdle(page,'popup-done',8000);
  return { ok:true, okClicked, selectedRow:targetRow, totalRows:rows.length };
}

async function saveCustomer(page) {
  const t0=Date.now();
  await page.evaluate(()=>{
    const all=Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="submit"]')).filter(el=>el.offsetParent!==null);
    const btn=all.find(el=>{const t=(el.textContent||'').trim();const ti=el.title||'';const id=el.id||'';
      return /salva\s*e\s*chiudi/i.test(t+ti)||/save.*close/i.test(t+ti)||/SaveAndClose/i.test(id)||/^salvar[ei]?$/i.test(t)||ti==='Salvare'||ti==='Save';});
    btn?.click();
  });
  await wait(2500); await waitIdle(page,'after-save',5000);
  const warningHandled = await page.evaluate(()=>{
    const chk=document.querySelector('input[id$="_ErrorInfo_Ch_S"]');
    if(!chk||!chk.offsetParent)return false;
    const col=window.ASPxClientControl?.GetControlCollection?.();
    if(col){let h=false;col.ForEachControl(c=>{if(h)return;try{const m=c.GetMainElement?.();if(m?.contains(chk)&&typeof c.SetChecked==='function'){c.SetChecked(true);h=true;}}catch{}});if(h)return true;}
    try{chk.click();return true;}catch{return false;}
  });
  if(warningHandled){
    log('  ⚠️  Warning checkbox trovato e spuntato');
    await wait(500);
    await page.evaluate(()=>{const all=Array.from(document.querySelectorAll('a,button')).filter(el=>el.offsetParent!==null);const btn=all.find(el=>{const t=(el.textContent||'').trim();const ti=el.title||'';return /salva\s*e\s*chiudi/i.test(t+ti)||/^salvar[ei]?$/i.test(t)||ti==='Salvare';});btn?.click();});
    await wait(2500); await waitIdle(page,'after-save-retry',8000);
  }
  try { await page.waitForFunction(()=>!window.location.href.includes('mode=Edit'),{timeout:20000,polling:300}); } catch { log('  ⚠️  ERP rimasto in edit mode'); }
  return { saveMs: Date.now()-t0, warningHandled };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  log('══ ORDER / SAVE / SNAPSHOT DUMP ══');

  const browser = await puppeteer.launch({
    headless:false, slowMo:60,
    args:['--ignore-certificate-errors','--no-sandbox','--disable-setuid-sandbox'],
    defaultViewport:{width:1440,height:900},
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('dialog', async dialog => {
    log(`  [DIALOG] ${dialog.type()}: "${dialog.message()}" → accept()`);
    await dialog.accept();
  });

  try {
    await login(page);

    // ═══════════════════════════════════════════════════════════════════════
    // BASELINE — leggi tutti i valori attuali PRIMA di qualsiasi modifica
    // ═══════════════════════════════════════════════════════════════════════
    log('\n══ BASELINE — lettura valori originali ══');
    await openEdit(page);
    const baseline = await buildCustomerSnapshot(page);
    await openTab(page, 'Prezzi e sconti');
    const baselinePrezzi = await buildPrezziSnapshot(page);
    await openTab(page, 'Principale');
    log('  Baseline:', baseline);
    finding('BASELINE', JSON.stringify(baseline));
    report.tests['baseline'] = { snapshot: baseline, prezzi: baselinePrezzi };
    await shot(page, '00-baseline');

    // ═══════════════════════════════════════════════════════════════════════
    // TEST A — ORDINE DEI CAMPI: callback si interferiscono?
    // ═══════════════════════════════════════════════════════════════════════
    log('\n══ TEST A: ORDINE CAMPI — test interferenze callback ══');

    // A1: Imposta DLVMODE → poi imposta VATNUM → il callback VAT resetta DLVMODE?
    log('  A1: DLVMODE → VATNUM → callback VAT → leggi DLVMODE');
    const dlvOriginal = baseline.deliveryMode || '';
    const dlvTest = dlvOriginal === 'FedEx' ? 'GLS' : 'FedEx';
    const setDlv = await setCombo(page, /dviDLVMODE_Edit_dropdown_DD_I$/, dlvTest);
    finding('TEST_A1', `DLVMODE impostato a "${dlvTest}": ${JSON.stringify(setDlv)}`);
    const dlvAfterSet = await page.evaluate(()=>Array.from(document.querySelectorAll('input')).find(el=>/DLVMODE.*_DD_I$/.test(el.id)&&el.offsetParent!==null)?.value??null);
    finding('TEST_A1', `DLVMODE dopo set (pre-VAT): "${dlvAfterSet}"`);

    // Ora imposta VATNUM (trigger callback)
    const vatId = await page.evaluate(()=>Array.from(document.querySelectorAll('input')).find(el=>/dviVATNUM_Edit_I$/.test(el.id)&&el.offsetParent!==null)?.id??null);
    if (vatId) {
      await page.evaluate(id=>{const el=document.getElementById(id);el?.focus();el?.click();if(typeof el?.select==='function')el.select();const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},vatId);
      await page.type(`#${cssEscape(vatId)}`,baseline.vatNumber||'01006500761',{delay:5});
      await page.keyboard.press('Tab');
      // Aspetta callback VAT (max 28s)
      log('  Attesa callback VAT (max 28s)...');
      await page.waitForFunction(()=>{
        const el=Array.from(document.querySelectorAll('input')).find(i=>/VATLASTCHECKED.*_I$/.test(i.id));
        return el&&el.value!=='';
      },{timeout:30000,polling:500}).catch(()=>{log('  ⚠️  VAT callback timeout');});
      await waitIdle(page,'vat-callback',10000);
    }

    const dlvAfterVat = await page.evaluate(()=>Array.from(document.querySelectorAll('input')).find(el=>/DLVMODE.*_DD_I$/.test(el.id)&&el.offsetParent!==null)?.value??null);
    finding('TEST_A1', `DLVMODE dopo callback VAT: "${dlvAfterVat}"`);
    const dlvSurvived = dlvAfterVat === dlvTest;
    finding('TEST_A1', `DLVMODE sopravvissuto al VAT callback: ${dlvSurvived ? '✅ SÌ' : '❌ NO — è stato resettato!'}`);
    await shot(page, '01-a1-dlvmode-after-vat');

    // A2: Imposta CAP → leggi DLVMODE e PAYMTERMID → sono stati resettati?
    log('  A2: CAP → verifica DLVMODE e PAYMTERMID non resettati');
    const capResult = await openLookupAndSelect(page, 'LOGISTICSADDRESSZIPCODE.*_B0Img', baseline.postalCode || '85029', baseline.city || 'Venosa');
    finding('TEST_A2', `CAP lookup: ${JSON.stringify({ ok: capResult.ok, city: capResult.selectedRow?.cells[1] })}`);
    const afterCapSnap = await buildCustomerSnapshot(page);
    finding('TEST_A2', `DLVMODE dopo CAP: "${afterCapSnap.deliveryMode}" (era: "${dlvTest}")`);
    finding('TEST_A2', `PAYMTERMID dopo CAP: "${afterCapSnap.paymentTerms?.substring(0,30)}" (era: "${baseline.paymentTerms?.substring(0,30)}")`);
    const dlvSurvivedCap = afterCapSnap.deliveryMode === dlvTest;
    const paymSurvivedCap = afterCapSnap.paymentTerms === baseline.paymentTerms;
    finding('TEST_A2', `DLVMODE sopravvissuto al CAP callback: ${dlvSurvivedCap ? '✅' : '❌ resettato!'}`);
    finding('TEST_A2', `PAYMTERMID sopravvissuto al CAP callback: ${paymSurvivedCap ? '✅' : '❌ resettato!'}`);
    await shot(page, '02-a2-after-cap');

    // Ripristina DLVMODE al valore originale
    await setCombo(page, /dviDLVMODE_Edit_dropdown_DD_I$/, dlvOriginal || 'N/A');

    // ═══════════════════════════════════════════════════════════════════════
    // TEST B — FULL ROUND-TRIP: imposta N campi → salva → riapri → confronta
    // ═══════════════════════════════════════════════════════════════════════
    log('\n══ TEST B: FULL ROUND-TRIP ══');

    // Valori di test (specifici per poterli riconoscere)
    const testValues = {
      name:       baseline.name,          // non cambiare il nome (potrebbe usarsi altrove)
      phone:      '+39099000001',
      mobile:     '+39333000001',
      email:      'roundtrip@test.it',
      street:     'Via Round Trip 99',
      attentionTo: 'TEST ROUND TRIP',
      notes:      'TEST ROUND TRIP - round trip test',
    };

    // Applica i valori di test
    await typeField(page, /dviPHONE_Edit_I$/, testValues.phone, {waitAfterMs:300});
    await typeField(page, /dviCELLULARPHONE_Edit_I$/, testValues.mobile, {waitAfterMs:300});
    await typeField(page, /dviEMAIL_Edit_I$/, testValues.email, {waitAfterMs:300});
    await typeField(page, /dviSTREET_Edit_I$/, testValues.street, {waitAfterMs:300});
    await typeField(page, /dviBRASCRMATTENTIONTO_Edit_I$/, testValues.attentionTo, {waitAfterMs:300});
    await typeField(page, /dviCUSTINFO_Edit_I$/, testValues.notes, {waitAfterMs:300});

    // Snapshot PRE-SAVE
    await openTab(page,'Prezzi e sconti');
    const preSavePrezzi = await buildPrezziSnapshot(page);
    await openTab(page,'Principale');
    const preSaveSnap = await buildCustomerSnapshot(page);
    finding('TEST_B', `Pre-save snapshot: ${JSON.stringify({phone:preSaveSnap.phone,mobile:preSaveSnap.mobile,email:preSaveSnap.email,street:preSaveSnap.street})}`);
    await shot(page,'03-b-pre-save');

    // SALVA
    const saveResult = await saveCustomer(page);
    finding('TEST_B', `Save: ${JSON.stringify(saveResult)}`);
    await shot(page,'04-b-after-save');

    // Riapri in EDIT per leggere i valori salvati
    await page.goto(CUSTOMER_URL, {waitUntil:'domcontentloaded',timeout:60000});
    await waitReady(page,15000);
    await openEdit(page);
    await shot(page,'05-b-reopen-edit');

    // Snapshot POST-SAVE
    await openTab(page,'Prezzi e sconti');
    const postSavePrezzi = await buildPrezziSnapshot(page);
    await openTab(page,'Principale');
    const postSaveSnap = await buildCustomerSnapshot(page);
    finding('TEST_B', `Post-save snapshot: ${JSON.stringify({phone:postSaveSnap.phone,mobile:postSaveSnap.mobile,email:postSaveSnap.email,street:postSaveSnap.street})}`);

    // Confronto intento vs realtà
    const roundTripCheck = {
      phone:      { intended: testValues.phone,       actual: postSaveSnap.phone,       ok: postSaveSnap.phone === testValues.phone },
      mobile:     { intended: testValues.mobile,      actual: postSaveSnap.mobile,      ok: postSaveSnap.mobile === testValues.mobile },
      email:      { intended: testValues.email,       actual: postSaveSnap.email,       ok: postSaveSnap.email === testValues.email },
      street:     { intended: testValues.street,      actual: postSaveSnap.street,      ok: postSaveSnap.street === testValues.street },
      attentionTo:{ intended: testValues.attentionTo, actual: postSaveSnap.attentionTo, ok: postSaveSnap.attentionTo === testValues.attentionTo },
      notes:      { intended: testValues.notes,       actual: postSaveSnap.notes,       ok: postSaveSnap.notes === testValues.notes },
      // Campi che NON abbiamo modificato — devono restare invariati
      vatNumber:  { intended: baseline.vatNumber,   actual: postSaveSnap.vatNumber,   ok: postSaveSnap.vatNumber === baseline.vatNumber },
      postalCode: { intended: baseline.postalCode,  actual: postSaveSnap.postalCode,  ok: postSaveSnap.postalCode === baseline.postalCode },
      city:       { intended: baseline.city,        actual: postSaveSnap.city,        ok: postSaveSnap.city === baseline.city },
      paymTerms:  { intended: baseline.paymentTerms, actual: postSaveSnap.paymentTerms, ok: postSaveSnap.paymentTerms === baseline.paymentTerms },
      dlvMode:    { intended: baseline.deliveryMode, actual: postSaveSnap.deliveryMode, ok: postSaveSnap.deliveryMode === baseline.deliveryMode },
      priceGroup: { intended: baselinePrezzi.priceGroup, actual: postSavePrezzi.priceGroup, ok: postSavePrezzi.priceGroup === baselinePrezzi.priceGroup },
      lineDisc:   { intended: baselinePrezzi.lineDisc,   actual: postSavePrezzi.lineDisc,   ok: postSavePrezzi.lineDisc === baselinePrezzi.lineDisc },
    };
    Object.entries(roundTripCheck).forEach(([k,v]) => finding('ROUND_TRIP', `${k}: intended="${v.intended?.substring?.(0,40)??v.intended}" actual="${v.actual?.substring?.(0,40)??v.actual}" → ${v.ok?'✅':'❌ DISCREPANZA'}`));
    report.tests['roundTrip'] = roundTripCheck;

    // ═══════════════════════════════════════════════════════════════════════
    // TEST C — MODIFICA PUNTUALE: cambia solo NAME → altri campi invariati?
    // ═══════════════════════════════════════════════════════════════════════
    log('\n══ TEST C: MODIFICA PUNTUALE (solo PHONE) ══');

    const snapBeforePartial = await buildCustomerSnapshot(page);
    finding('TEST_C', `Snapshot prima modifica puntuale: ${JSON.stringify({phone:snapBeforePartial.phone,email:snapBeforePartial.email,street:snapBeforePartial.street})}`);

    const newPhone = '+39099000099';
    await typeField(page, /dviPHONE_Edit_I$/, newPhone, {waitAfterMs:300});
    // NON toccare nessun altro campo

    const partialSave = await saveCustomer(page);
    finding('TEST_C', `Save puntuale: ${JSON.stringify(partialSave)}`);

    await page.goto(CUSTOMER_URL,{waitUntil:'domcontentloaded',timeout:60000});
    await waitReady(page,15000);
    await openEdit(page);
    const snapAfterPartial = await buildCustomerSnapshot(page);

    const partialCheck = {
      phone:  { changed: newPhone, actual: snapAfterPartial.phone, ok: snapAfterPartial.phone === newPhone },
      email:  { unchanged: snapBeforePartial.email, actual: snapAfterPartial.email, ok: snapAfterPartial.email === snapBeforePartial.email },
      street: { unchanged: snapBeforePartial.street, actual: snapAfterPartial.street, ok: snapAfterPartial.street === snapBeforePartial.street },
      notes:  { unchanged: snapBeforePartial.notes, actual: snapAfterPartial.notes, ok: snapAfterPartial.notes === snapBeforePartial.notes },
      city:   { unchanged: snapBeforePartial.city, actual: snapAfterPartial.city, ok: snapAfterPartial.city === snapBeforePartial.city },
      postalCode: { unchanged: snapBeforePartial.postalCode, actual: snapAfterPartial.postalCode, ok: snapAfterPartial.postalCode === snapBeforePartial.postalCode },
    };
    Object.entries(partialCheck).forEach(([k,v])=>{
      if ('changed' in v) finding('TEST_C', `${k} (modificato): "${v.changed}" → actual="${v.actual}" ${v.ok?'✅':'❌'}`);
      else finding('TEST_C', `${k} (invariato): atteso="${v.unchanged?.substring?.(0,40)??v.unchanged}" actual="${v.actual?.substring?.(0,40)??v.actual}" ${v.ok?'✅':'❌ CAMBIATO!'}`);
    });
    report.tests['partialUpdate'] = partialCheck;
    await shot(page,'06-c-after-partial-save');

    // ═══════════════════════════════════════════════════════════════════════
    // TEST D — SNAPSHOT COMPLETO post-save (per PWA)
    // ═══════════════════════════════════════════════════════════════════════
    log('\n══ TEST D: SNAPSHOT COMPLETO per PWA ══');

    const finalSnap = await buildCustomerSnapshot(page);
    await openTab(page,'Prezzi e sconti');
    const finalPrezziSnap = await buildPrezziSnapshot(page);
    await openTab(page,'Principale');

    const customerSnapshot = {
      _snapshotAt:  new Date().toISOString(),
      _pendingSync: true,      // flag: sync ERP → DB non ancora avvenuto
      _source:      'bot',     // chi ha prodotto questo snapshot
      ...finalSnap,
      pricing: finalPrezziSnap,
    };
    log('  Snapshot PWA completo:', customerSnapshot);
    report.snapshot = customerSnapshot;
    finding('SNAPSHOT', `Snapshot generato con ${Object.keys(customerSnapshot).length} campi`);
    finding('SNAPSHOT', `Struttura: ${Object.keys(customerSnapshot).filter(k=>!k.startsWith('_')).join(', ')}`);

    // ═══════════════════════════════════════════════════════════════════════
    // RIPRISTINO — rimetti i valori originali
    // ═══════════════════════════════════════════════════════════════════════
    log('\n══ RIPRISTINO valori originali ══');

    const restoreMap = [
      [/dviPHONE_Edit_I$/, baseline.phone || ''],
      [/dviCELLULARPHONE_Edit_I$/, baseline.mobile || ''],
      [/dviEMAIL_Edit_I$/, baseline.email || ''],
      [/dviSTREET_Edit_I$/, baseline.street || ''],
      [/dviBRASCRMATTENTIONTO_Edit_I$/, baseline.attentionTo || ''],
    ];
    for (const [re, val] of restoreMap) {
      if (val !== null) await typeField(page, re, val, {waitAfterMs:200});
    }
    // MEMO (CUSTINFO) — se era vuoto, usa Ctrl+A+Delete
    const memoToRestore = baseline.notes ?? '';
    const memoId = await page.evaluate(()=>Array.from(document.querySelectorAll('textarea,input')).find(i=>/CUSTINFO/i.test(i.id)&&i.offsetParent!==null)?.id??null);
    if (memoId) {
      if (memoToRestore) {
        await typeField(page, /dviCUSTINFO_Edit_I$/, memoToRestore, {waitAfterMs:300});
      } else {
        // Svuota con tastiera
        await page.evaluate(id=>{const el=document.getElementById(id);el?.scrollIntoView();el?.focus();el?.click();},memoId);
        await wait(200);
        await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
        await wait(100); await page.keyboard.press('Delete'); await wait(200); await page.keyboard.press('Tab');
        await waitIdle(page,'clear-memo',3000);
      }
    }

    const restoreSave = await saveCustomer(page);
    finding('RIPRISTINO', `Save ripristino: ${JSON.stringify(restoreSave)}`);

    // Verifica finale
    await page.goto(CUSTOMER_URL,{waitUntil:'domcontentloaded',timeout:60000});
    await waitReady(page,15000);
    await openEdit(page);
    const finalCheck = await buildCustomerSnapshot(page);
    const restoredOk = finalCheck.phone === (baseline.phone||'') && finalCheck.email === (baseline.email||'') && finalCheck.street === (baseline.street||'');
    finding('RIPRISTINO', `Verifica finale: phone="${finalCheck.phone}" email="${finalCheck.email}" street="${finalCheck.street}"`);
    finding('RIPRISTINO', `Ripristino: ${restoredOk ? '✅ OK' : '❌ VERIFICA MANUALE NECESSARIA'}`);
    await shot(page,'07-restore-verified');

  } catch(err) {
    log(`\nERRORE: ${err}`);
    console.error(err);
    try { await shot(page, 'error'); } catch {}
  } finally {
    const reportFile = path.join(SCREENSHOT_DIR, 'order-save-snapshot-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
    log(`\n✅  Report: ${reportFile}`);
    log('\n══ FINDINGS ══');
    report.findings.forEach((f,i)=>log(` ${String(i+1).padStart(3)}. [${f.cat}] ${f.msg}`));
    if (process.env.AUTO_CLOSE==='1') await browser.close();
    else { log('\n⚠️  Browser aperto. Ctrl+C per chiudere.'); await new Promise(()=>{}); }
  }
}

main().catch(err=>{console.error('ERRORE:',err);process.exit(1);});

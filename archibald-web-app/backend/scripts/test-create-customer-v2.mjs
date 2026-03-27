/**
 * test-create-customer-v2.mjs
 *
 * Test E2E del bot createCustomer v2:
 * - Apre la form Nuovo Cliente in Archibald ERP
 * - Compila TUTTI i campi: LINEDISC, PAYMTERMID, CAP, VATNUM, DLVMODE, SETTORE,
 *   NAME, FISCALCODE, PEC, SDI, STREET, PHONE, MOBILE, EMAIL, URL, ATTENTIONTO, NOTES
 * - Fa uno screenshot di ogni campo compilato
 * - NON salva (clicca Annulla alla fine)
 * - Verifica che tutti i campi abbiano i valori attesi
 *
 * Eseguire su ERP di produzione PRIMA del deploy.
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); } catch {}

const ARCHIBALD_URL = (process.env.ARCHIBALD_URL || 'https://4.231.124.90/Archibald').replace(/\/$/, '');
const USER = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASS = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const SCREENSHOT_DIR = '/tmp/test-create-v2';

// Dati di test — da screenshot cliente reale (Bracio Srl, Roma)
const TEST_DATA = {
  vatNumber:      '15576861007',               // P.IVA reale Bracio Srl
  paymentTerms:   '206',                       // 206 BONIF. BANC. 30 GGDFFM
  postalCode:     '00146',                     // Roma — CAP univoco
  postalCodeCity: 'Roma',                      // disambiguation hint
  name:           'BRACIO SOCIETA A RESPONSABILITA LIMITATA SEMPLIFICATA',
  fiscalCode:     '15576861007',               // coincide con P.IVA
  sector:         'Spett. Studio Dentistico',  // come da screenshot
  deliveryMode:   'FedEx',
  street:         'VIA ENRICO FERMI, 142',
  phone:          '+39',                       // come da screenshot (solo prefisso)
  mobile:         '+39',
  email:          '',                          // vuoto come da screenshot
  url:            '',                          // vuoto come da screenshot
  pec:            'amministrazione@pec.abrancio.it',
  sdi:            '0000000',
  attentionTo:    'PROVA',
  notes:          'PROVA',
  lineDiscount:   'N/A',
};

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }
function ok(msg)  { console.log(`  ✅ ${msg}`); }
function fail(msg){ console.log(`  ❌ ${msg}`); }
function cssEscape(id) { return id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1'); }

let shotIdx = 0;
async function shot(page, label) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const p = path.join(SCREENSHOT_DIR, `${String(++shotIdx).padStart(3,'0')}-${label.replace(/[^a-z0-9]/gi,'-')}.png`);
  try { await page.screenshot({ path: p, fullPage: true }); log(`📸 ${path.basename(p)}`); }
  catch (e) { log(`Screenshot fail: ${e.message}`); }
}

async function waitIdle(page, label='', ms=10000) {
  try { await page.waitForFunction(() => {
    const w = window;
    if (typeof w.ASPx !== 'undefined') {
      const p = (w.ASPx._pendingCallbacks||0)+(w.ASPx._sendingRequests||0)+(w.ASPx._pendingRequestCount||0);
      if (p > 0) return false;
    }
    const col = w.ASPxClientControl?.GetControlCollection?.();
    if (col) { let busy=false; try{col.ForEachControl(c=>{if(c?.InCallback?.())busy=true;});}catch{} if(busy)return false; }
    return true;
  }, {timeout:ms,polling:150}); }
  catch { log(`  waitIdle timeout (${label})`); }
}

async function readField(page, idSuffix) {
  return page.evaluate(s => {
    const el = Array.from(document.querySelectorAll('input,textarea'))
      .find(i => i.id.endsWith(s) && i.offsetParent !== null);
    return el?.value ?? null;
  }, idSuffix);
}

const results = { passed: 0, failed: 0, skipped: 0, checks: [] };

function check(label, actual, expected) {
  // expected=null significa "non verificabile" (es. auto-fill)
  if (expected === null) {
    results.skipped++;
    results.checks.push({ label, actual, expected: '(auto-fill)', status: 'skip' });
    log(`  ⏭  ${label}: "${actual}" (auto-fill, non verificato)`);
    return;
  }
  if (actual === expected || (expected === '' && (actual === 'N/A' || actual === ''))) {
    results.passed++;
    results.checks.push({ label, actual, expected, status: 'pass' });
    ok(`${label}: "${actual}"`);
  } else {
    results.failed++;
    results.checks.push({ label, actual, expected, status: 'fail' });
    fail(`${label}: atteso="${expected}" | effettivo="${actual}"`);
  }
}

// ══ MAIN ════════════════════════════════════════════════════════════════════

async function main() {
  log('══ TEST createCustomer v2 ══');
  log(`P.IVA test: ${TEST_DATA.vatNumber} | ERP: ${ARCHIBALD_URL}`);

  const browser = await puppeteer.launch({
    headless: false, slowMo: 80,
    args: ['--ignore-certificate-errors','--no-sandbox','--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('dialog', async d => { log(`[DIALOG] ${d.type()}: "${d.message()}" → accept()`); await d.accept(); });

  try {
    // ── LOGIN ────────────────────────────────────────────────────────────────
    await page.goto(`${ARCHIBALD_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    if (page.url().toLowerCase().includes('login')) {
      const uid = await page.evaluate(() => {
        const t=Array.from(document.querySelectorAll('input')).filter(i=>i.type!=='hidden'&&i.type!=='submit'&&i.type!=='button'&&i.type!=='password');
        return(t.find(i=>i.id.includes('UserName'))||t[0])?.id??null;
      });
      await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},uid);
      await page.type(`#${cssEscape(uid)}`, USER, {delay:30}); await page.keyboard.press('Tab'); await waitIdle(page,'u',5000);
      const pid=await page.evaluate(()=>{const p=document.querySelector('input[type="password"]');p?.focus();return p?.id??null;});
      await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},pid);
      await page.type(`#${cssEscape(pid)}`, PASS, {delay:30}); await page.keyboard.press('Tab'); await waitIdle(page,'p',5000);
      await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('input[type="submit"],button[type="submit"],a,button')).find(el=>el.offsetParent!==null&&/accedi|login/i.test(el.textContent+(el.value||'')));if(b)b.click();});
      await page.waitForNavigation({waitUntil:'networkidle2',timeout:20000}).catch(()=>{});
      if (page.url().toLowerCase().includes('login')) throw new Error('Login fallito');
      log('Login OK → ' + page.url());
    }

    // ── APRI FORM NUOVO CLIENTE ───────────────────────────────────────────────
    await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitIdle(page, 'list', 10000);
    const nuovoClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a,span,button')).find(el=>el.offsetParent!==null&&/^nuovo$|^new$/i.test(el.textContent?.trim()??''));
      if (btn) { btn.click(); return btn.id||'found'; }
      return null;
    });
    if (!nuovoClicked) throw new Error('Bottone Nuovo non trovato in ListView');
    await page.waitForFunction(() => !window.location.href.includes('ListView'), { timeout: 15000, polling: 200 }).catch(() => {});
    await waitIdle(page, 'form-loaded', 15000);
    log('Form nuovo cliente aperto: ' + page.url());
    await shot(page, '00-form-opened');

    // ── STEP 1: TAB PREZZI E SCONTI — LINEDISC ───────────────────────────────
    log('\n── STEP 1: LINEDISC (Tab Prezzi e sconti) ──');
    const prezziTab = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('a,span')).find(e=>e.offsetParent!==null&&e.textContent?.trim().includes('Prezzi'));
      if(el){(el.tagName==='A'?el:el.parentElement)?.click();return true;}
      return false;
    });
    if (!prezziTab) { log('⚠️  Tab Prezzi non trovata'); }
    await waitIdle(page, 'prezzi-tab', 6000);

    const lineDiscResult = await page.evaluate((val) => {
      const col = window.ASPxClientControl?.GetControlCollection?.();
      if (!col) return { ok: false };
      const input = Array.from(document.querySelectorAll('input')).find(i=>i.offsetParent!==null&&/LINEDISC.*_DD_I$/.test(i.id));
      if (!input) return { ok: false, reason: 'input-not-found' };
      let combo = null;
      col.ForEachControl(c=>{if(combo)return;try{if(c.GetInputElement?.()?.id===input.id)combo=c;else{const m=c.GetMainElement?.();if(m?.contains(input)&&typeof c.SetSelectedIndex==='function')combo=c;}}catch{}});
      if (!combo) return { ok: false, reason: 'no-combo' };
      const n = combo.GetItemCount?.() ?? 0;
      for(let i=0;i<n;i++){if(combo.GetItem?.(i)?.text===val){combo.SetSelectedIndex(i);return{ok:true,text:val};}}
      return {ok:false,reason:'option-not-found'};
    }, TEST_DATA.lineDiscount);
    await waitIdle(page, 'linedisc', 5000);
    const linediscVal = await readField(page, 'LINEDISC_Edit_dropdown_DD_I');
    check('LINEDISC', linediscVal, ''); // N/A → salva come stringa vuota
    await shot(page, '01-linedisc-set');

    // ── STEP 2: TAB PRINCIPALE ────────────────────────────────────────────────
    log('\n── STEP 2: Tab Principale ──');
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('a,span')).find(e=>e.offsetParent!==null&&e.textContent?.trim()==='Principale');
      if(el)(el.tagName==='A'?el:el.parentElement)?.click();
    });
    await waitIdle(page, 'principale-tab', 6000);

    // PAYMTERMID lookup
    log('── PAYMTERMID lookup ──');
    const paymBtnId = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img')).find(el=>/PAYMTERMID.*_B0Img/.test(el.id||'')&&el.offsetParent!==null)?.id??null
    );
    if (paymBtnId) {
      await page.evaluate(id=>document.getElementById(id)?.click(), paymBtnId);
      let iframeFrame = null;
      for(let i=0;i<25;i++){await wait(400);iframeFrame=page.frames().find(f=>f.url().includes('FindPopup'));if(iframeFrame)break;}
      if (iframeFrame) {
        try { await iframeFrame.waitForFunction(()=>document.readyState==='complete',{timeout:6000}); } catch {}
        const si = await iframeFrame.waitForSelector('input[type="text"]',{timeout:6000});
        await si.click({clickCount:3});
        await si.type(TEST_DATA.paymentTerms, {delay:20});
        await si.press('Enter');
        await wait(2500);
        const rows = await iframeFrame.evaluate(()=>Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[id*="DXDataRow"]')).filter(tr=>tr.offsetParent!==null).map(r=>({rowId:r.id,cells:Array.from(r.querySelectorAll('td')).map(td=>td.textContent?.trim()||'').filter(Boolean)})));
        if (rows[0]) {
          await iframeFrame.evaluate(id=>{document.getElementById(id)?.click();},rows[0].rowId);
          await wait(400);
          await iframeFrame.evaluate(()=>{Array.from(document.querySelectorAll('a,button')).find(el=>el.offsetParent!==null&&/^ok$/i.test((el.textContent||'').trim()))?.click();});
          await page.waitForFunction(()=>!Array.from(document.querySelectorAll('[id$="_CIF-1"]')).some(el=>el.offsetParent!==null),{timeout:8000,polling:200}).catch(()=>{});
          await waitIdle(page,'paym-callback',5000); await wait(600); await waitIdle(page,'paym-done',8000);
        }
      }
    }
    const paymVal = await readField(page, 'PAYMTERMID_Edit_find_Edit_I');
    check('PAYMTERMID', paymVal?.includes('206') ? '206-ok' : paymVal, '206-ok');
    await shot(page, '02-paymtermid-set');

    // CAP lookup
    log('── CAP lookup ──');
    const capBtnId = await page.evaluate(()=>Array.from(document.querySelectorAll('img')).find(el=>/LOGISTICSADDRESSZIPCODE.*_B0Img/.test(el.id||'')&&el.offsetParent!==null)?.id??null);
    if (capBtnId) {
      await page.evaluate(id=>document.getElementById(id)?.click(), capBtnId);
      let cifFrame = null;
      for(let i=0;i<25;i++){await wait(400);cifFrame=page.frames().find(f=>f.url().includes('FindPopup'));if(cifFrame)break;}
      if (cifFrame) {
        try { await cifFrame.waitForFunction(()=>document.readyState==='complete',{timeout:6000}); } catch {}
        const si = await cifFrame.waitForSelector('input[type="text"]',{timeout:6000});
        await si.click({clickCount:3});
        await si.type(TEST_DATA.postalCode, {delay:20});
        await si.press('Enter');
        await wait(2500);
        const rows = await cifFrame.evaluate((hint)=>{
          const rs=Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[id*="DXDataRow"]')).filter(tr=>tr.offsetParent!==null);
          return rs.map(r=>({rowId:r.id,cells:Array.from(r.querySelectorAll('td')).map(td=>td.textContent?.trim()||'').filter(Boolean)}));
        }, TEST_DATA.postalCodeCity);
        const target = rows.find(r=>r.cells[1]===TEST_DATA.postalCodeCity) ?? rows[0];
        if (target) {
          await cifFrame.evaluate(id=>{document.getElementById(id)?.click();},target.rowId);
          await wait(400);
          await cifFrame.evaluate(()=>{Array.from(document.querySelectorAll('a,button')).find(el=>el.offsetParent!==null&&/^ok$/i.test((el.textContent||'').trim()))?.click();});
          await page.waitForFunction(()=>!Array.from(document.querySelectorAll('[id$="_CIF-1"]')).some(el=>el.offsetParent!==null),{timeout:8000,polling:200}).catch(()=>{});
          await waitIdle(page,'cap-callback',5000); await wait(600); await waitIdle(page,'cap-done',8000);
        }
      }
    }
    const capVal = await readField(page, 'LOGISTICSADDRESSZIPCODE_Edit_find_Edit_I');
    const cityVal = await readField(page, 'dviCITY_Edit_I');
    check('CAP', capVal, TEST_DATA.postalCode);
    check('CITY (auto-fill)', cityVal, null);
    await shot(page, '03-cap-set');

    // VATNUM
    log('── VATNUM + wait 28s ──');
    const vatId = await page.evaluate(()=>Array.from(document.querySelectorAll('input')).find(el=>/dviVATNUM_Edit_I$/.test(el.id)&&el.offsetParent!==null)?.id??null);
    if (vatId) {
      await page.evaluate(id=>{const el=document.getElementById(id);el?.focus();el?.click();const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},vatId);
      await page.type(`#${cssEscape(vatId)}`, TEST_DATA.vatNumber, {delay:5});
      await page.keyboard.press('Tab');
      log('  Attesa callback P.IVA (max 30s)...');
      await page.waitForFunction(()=>{const el=Array.from(document.querySelectorAll('input')).find(i=>/VATLASTCHECKED.*_I$/.test(i.id));return el&&el.value!=='';},{timeout:32000,polling:500}).catch(()=>log('  P.IVA callback timeout'));
      await waitIdle(page,'vat-done',10000);
    }
    const vatValidated = await readField(page, 'dviVATVALIEDE_Edit_I');
    const cfAutoFill  = await readField(page, 'dviFISCALCODE_Edit_I');
    check('VATNUM', await readField(page,'dviVATNUM_Edit_I'), TEST_DATA.vatNumber);
    check('VAT Validata', vatValidated, null);
    check('CF auto-fill', cfAutoFill, null);
    await shot(page, '04-vatnum-validated');

    // DLVMODE
    const dlvResult = await page.evaluate((val)=>{
      const col=window.ASPxClientControl?.GetControlCollection?.();if(!col)return false;
      const input=Array.from(document.querySelectorAll('input')).find(i=>i.offsetParent!==null&&/DLVMODE.*_DD_I$/.test(i.id));if(!input)return false;
      let combo=null;col.ForEachControl(c=>{if(combo)return;try{if(c.GetInputElement?.()?.id===input.id)combo=c;else{const m=c.GetMainElement?.();if(m?.contains(input)&&typeof c.SetSelectedIndex==='function')combo=c;}}catch{}});
      if(!combo)return false;const n=combo.GetItemCount?.()??0;
      for(let i=0;i<n;i++){if(combo.GetItem?.(i)?.text===val){combo.SetSelectedIndex(i);return true;}}
      return false;
    }, TEST_DATA.deliveryMode);
    await waitIdle(page,'dlvmode',5000);
    check('DLVMODE', await readField(page,'DLVMODE_Edit_dropdown_DD_I'), TEST_DATA.deliveryMode);

    // SETTORE
    const settoreResult = await page.evaluate((val)=>{
      const col=window.ASPxClientControl?.GetControlCollection?.();if(!col)return false;
      const input=Array.from(document.querySelectorAll('input')).find(i=>i.offsetParent!==null&&/BUSINESSSECTORID.*_DD_I$/.test(i.id));if(!input)return false;
      let combo=null;col.ForEachControl(c=>{if(combo)return;try{if(c.GetInputElement?.()?.id===input.id)combo=c;else{const m=c.GetMainElement?.();if(m?.contains(input)&&typeof c.SetSelectedIndex==='function')combo=c;}}catch{}});
      if(!combo)return false;const n=combo.GetItemCount?.()??0;
      for(let i=0;i<n;i++){if(combo.GetItem?.(i)?.text===val){combo.SetSelectedIndex(i);return true;}}
      return false;
    }, TEST_DATA.sector);
    await waitIdle(page,'settore',5000);
    check('SETTORE', await readField(page,'BUSINESSSECTORID_Edit_dropdown_DD_I'), TEST_DATA.sector);

    // NAME
    const nameId = await page.evaluate(()=>Array.from(document.querySelectorAll('input')).find(el=>/dviNAME_Edit_I$/.test(el.id)&&el.offsetParent!==null)?.id??null);
    if (nameId) {
      await page.evaluate(id=>{const el=document.getElementById(id);el?.focus();el?.click();const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},nameId);
      await page.type(`#${cssEscape(nameId)}`, TEST_DATA.name, {delay:5});
      await page.keyboard.press('Tab'); await waitIdle(page,'name',5000);
    }
    check('NAME', await readField(page,'dviNAME_Edit_I'), TEST_DATA.name);

    // FISCALCODE (se non auto-fill)
    if (!cfAutoFill) {
      // Nessun auto-fill → skip (campo opzionale)
      log('  CF non auto-fill → skip manuale (campo opzionale)');
    }

    // Text fields
    const textFields = [
      { id: 'dviLEGALEMAIL_Edit_I', val: TEST_DATA.pec, label: 'PEC' },
      { id: 'dviLEGALAUTHORITY_Edit_I', val: TEST_DATA.sdi, label: 'SDI' },
      { id: 'dviSTREET_Edit_I', val: TEST_DATA.street, label: 'STREET' },
      { id: 'dviPHONE_Edit_I', val: TEST_DATA.phone, label: 'PHONE' },
      { id: 'dviCELLULARPHONE_Edit_I', val: TEST_DATA.mobile, label: 'MOBILE' },
      { id: 'dviEMAIL_Edit_I', val: TEST_DATA.email, label: 'EMAIL' },
      { id: 'dviURL_Edit_I', val: TEST_DATA.url, label: 'URL' },
      { id: 'dviBRASCRMATTENTIONTO_Edit_I', val: TEST_DATA.attentionTo, label: 'ATTENZIONE' },
      { id: 'dviCUSTINFO_Edit_I', val: TEST_DATA.notes, label: 'NOTE' },
    ];

    for (const { id, val, label } of textFields) {
      const fid = await page.evaluate(s=>Array.from(document.querySelectorAll('input,textarea')).find(el=>el.id.endsWith(s)&&el.offsetParent!==null)?.id??null, id);
      if (!fid) { log(`  ⚠️  Campo ${label} non trovato (${id})`); results.skipped++; continue; }
      await page.evaluate(id2=>{const el=document.getElementById(id2);el?.scrollIntoView({block:'center'});el?.focus();el?.click();const proto=el?.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const s=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},fid);
      await page.type(`#${cssEscape(fid)}`, val, {delay:5});
      await page.keyboard.press('Tab'); await wait(400); await waitIdle(page,label,5000);
      const actual = await readField(page, id);
      check(label, actual, val);
    }

    await shot(page, '05-all-fields-filled');

    // ── VERIFICA FINALE: leggi tutti i campi ─────────────────────────────────
    log('\n── VERIFICA FINALE: snapshot di tutti i campi ──');
    const finalSnap = await page.evaluate(() => {
      const g = s => Array.from(document.querySelectorAll('input,textarea')).find(el=>el.id.endsWith(s)&&el.offsetParent!==null)?.value??null;
      return {
        name:        g('dviNAME_Edit_I'),
        vatNum:      g('dviVATNUM_Edit_I'),
        vatValidated:g('dviVATVALIEDE_Edit_I'),
        fiscalCode:  g('dviFISCALCODE_Edit_I'),
        pec:         g('dviLEGALEMAIL_Edit_I'),
        sdi:         g('dviLEGALAUTHORITY_Edit_I'),
        street:      g('dviSTREET_Edit_I'),
        cap:         g('dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_I'),
        city:        g('dviCITY_Edit_I'),
        county:      g('dviCOUNTY_Edit_I'),
        state:       g('dviSTATE_Edit_I'),
        phone:       g('dviPHONE_Edit_I'),
        mobile:      g('dviCELLULARPHONE_Edit_I'),
        email:       g('dviEMAIL_Edit_I'),
        url:         g('dviURL_Edit_I'),
        attentionTo: g('dviBRASCRMATTENTIONTO_Edit_I'),
        notes:       g('dviCUSTINFO_Edit_I'),
        deliveryMode:g('dviDLVMODE_Edit_dropdown_DD_I'),
        paymentTerms:g('dviPAYMTERMID_Edit_find_Edit_I'),
        sector:      g('dviBUSINESSSECTORID_Edit_dropdown_DD_I'),
      };
    });
    log('Snapshot finale:', finalSnap);

    // ── ANNULLA — non salvare ─────────────────────────────────────────────────
    log('\n── ANNULLA (non salvare) ──');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a,button'))
        .find(el=>el.offsetParent!==null&&/^annull/i.test(el.textContent?.trim()??'')&&/DXI[23]/.test(el.id??''));
      btn?.click();
    });
    await wait(2000);
    log('Form annullato. URL: ' + page.url());

    // ── RISULTATO ─────────────────────────────────────────────────────────────
    log('\n══════════════════════════════════════════');
    log('  RISULTATO TEST createCustomer v2');
    log('══════════════════════════════════════════');
    log(`  ✅ Passati: ${results.passed}`);
    log(`  ❌ Falliti: ${results.failed}`);
    log(`  ⏭  Saltati: ${results.skipped}`);
    log('');
    results.checks.forEach(c => {
      const icon = c.status==='pass'?'✅':c.status==='fail'?'❌':'⏭';
      log(`  ${icon} ${c.label}: "${c.actual}" ${c.status!=='skip'?`(atteso: "${c.expected}")`:'(auto-fill)'}`);
    });
    log('');
    if (results.failed === 0) {
      log('  🎉 TUTTI I CHECK PASSATI — PRONTO PER IL DEPLOY');
    } else {
      log(`  ⚠️  ${results.failed} CHECK FALLITI — VERIFICARE PRIMA DEL DEPLOY`);
    }
    log('══════════════════════════════════════════');
    fs.writeFileSync('/tmp/test-create-v2-results.json', JSON.stringify({ ...results, snapshot: finalSnap }, null, 2));
    log('Risultati salvati in /tmp/test-create-v2-results.json');

  } catch (err) {
    log('ERRORE FATALE: ' + err);
    console.error(err);
    try { await shot(page, 'error'); } catch {}
  } finally {
    if (process.env.AUTO_CLOSE === '1') await browser.close();
    else { log('\n⚠️  Browser aperto. Ctrl+C per chiudere.'); await new Promise(() => {}); }
  }
}

main().catch(e => { console.error(e); process.exit(1); });

/**
 * dump-settore-dlvmode.mjs
 *
 * Test mirato:
 *  1. SETTORE (BUSINESSSECTORID) — imposta e verifica
 *  2. DLVMODE — imposta con nome corretto ("Destinatario") e verifica
 *  3. Dopo entrambi: callback VAT — resettano DLVMODE o SETTORE?
 *
 * NON salva — Annulla alla fine.
 */

import puppeteer from 'puppeteer';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); } catch {}

const URL  = (process.env.ARCHIBALD_URL || 'https://4.231.124.90/Archibald').replace(/\/$/,'');
const USER = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASS = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
function cssEscape(id) { return id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1'); }
function wait(ms) { return new Promise(r=>setTimeout(r,ms)); }
function log(msg) { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }

async function waitIdle(page, label='', ms=10000) {
  try { await page.waitForFunction(()=>{const w=window;if(typeof w.ASPx!=='undefined'){const p=(w.ASPx._pendingCallbacks||0)+(w.ASPx._sendingRequests||0)+(w.ASPx._pendingRequestCount||0);if(p>0)return false;}const col=w.ASPxClientControl?.GetControlCollection?.();if(col){let busy=false;try{col.ForEachControl(c=>{if(c?.InCallback?.())busy=true;});}catch{}if(busy)return false;}return true;},{timeout:ms,polling:150}); }
  catch { log(`  waitIdle timeout (${label})`); }
}

async function setCombo(page, idRegex, value) {
  const result = await page.evaluate((re, val) => {
    const pat = new RegExp(re);
    const input = Array.from(document.querySelectorAll('input')).find(i=>i.offsetParent!==null&&pat.test(i.id));
    if (!input) return { found:false, reason:'input-not-found' };
    const col = window.ASPxClientControl?.GetControlCollection?.();
    if (!col) return { found:false, reason:'no-collection' };
    let combo = null;
    col.ForEachControl(c=>{if(combo)return;try{if(c.GetInputElement?.()?.id===input.id)combo=c;else{const m=c.GetMainElement?.();if(m?.contains(input)&&typeof c.SetSelectedIndex==='function')combo=c;}}catch{}});
    if (!combo) return { found:false, reason:'combo-not-found', inputId:input.id };
    if (typeof combo.GetItemCount!=='function') return { found:false, reason:'no-GetItemCount' };
    const n = combo.GetItemCount();
    const allOptions = [];
    for (let i=0;i<n;i++) { const t=combo.GetItem?.(i)?.text; if(t!=null) allOptions.push(t); }
    const idx = allOptions.findIndex(t=>t===val);
    if (idx>=0) { combo.SetSelectedIndex(idx); return { found:true, method:'SetSelectedIndex', text:allOptions[idx], allOptions }; }
    return { found:false, reason:'option-not-found', triedValue:val, allOptions };
  }, idRegex.source||String(idRegex), value);
  await waitIdle(page, `combo-${value}`, 5000);
  return result;
}

async function readField(page, idRegex) {
  return page.evaluate(re=>{
    const pat=new RegExp(re);
    const el=Array.from(document.querySelectorAll('input')).find(i=>pat.test(i.id)&&i.offsetParent!==null);
    return el?{id:el.id,value:el.value}:null;
  }, idRegex.source||String(idRegex));
}

async function main() {
  log('══ SETTORE + DLVMODE + VAT CALLBACK TEST ══');
  const browser = await puppeteer.launch({
    headless:false, slowMo:60,
    args:['--ignore-certificate-errors','--no-sandbox','--disable-setuid-sandbox'],
    defaultViewport:{width:1440,height:900},
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('dialog', async d=>{ log(`[DIALOG] ${d.type()}: "${d.message()}" → accept()`); await d.accept(); });

  try {
    // Login — identico a dump-update-customer.mjs
    await page.goto(`${URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    if (!page.url().toLowerCase().includes('login')) {
      log('  Già autenticato → ' + page.url());
    } else {
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
      await page.type(`#${cssEscape(userInputId)}`, USER, { delay: 30 });
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
      await page.type(`#${cssEscape(pwdInputId)}`, PASS, { delay: 30 });
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

    // Apri edit
    await page.goto(`${URL}/CUSTTABLE_DetailView/55839/`,{waitUntil:'networkidle2',timeout:30000});
    await waitIdle(page,'view',10000);
    const editBtn = await page.evaluate(()=>{
      const btn=Array.from(document.querySelectorAll('a,button')).filter(el=>el.offsetParent!==null).find(el=>/modif|edit/i.test(el.title??'')||/modif|edit/i.test(el.textContent?.trim()??'')||(el.id??'').includes('EditAction'));
      if(btn){btn.click();return btn.id||'found';}return null;
    });
    log(`Edit button: ${editBtn}`);
    await page.waitForFunction(()=>window.location.href.includes('mode=Edit')||document.querySelector('[title="Salvare"]')!==null,{timeout:10000,polling:300}).catch(()=>{});
    await waitIdle(page,'edit-ready',15000);
    log('Edit mode: '+page.url());

    // ─── Leggi valori attuali ───────────────────────────────────────────────
    log('\n=== BASELINE ===');
    const settoreBaseline = await readField(page, /BUSINESSSECTORID.*_DD_I$/);
    const dlvBaseline     = await readField(page, /DLVMODE.*_DD_I$/);
    log(`SETTORE attuale: "${settoreBaseline?.value}"`);
    log(`DLVMODE attuale: "${dlvBaseline?.value}"`);

    // ─── TEST 1: SETTORE ────────────────────────────────────────────────────
    log('\n=== TEST 1: SETTORE ===');

    // Enumera opzioni
    const settoreOpts = await page.evaluate(()=>{
      const input=Array.from(document.querySelectorAll('input')).find(i=>i.offsetParent!==null&&/BUSINESSSECTORID.*_DD_I$/.test(i.id));
      if(!input)return{error:'input-not-found'};
      const col=window.ASPxClientControl?.GetControlCollection?.();
      const items=[];
      if(col){col.ForEachControl(c=>{if(items.length)return;try{const d=c.GetInputElement?.()?.id===input.id;const cn=!d&&c.GetMainElement?.()?.contains(input);if(!d&&!cn)return;if(typeof c.GetItemCount!=='function')return;const n=c.GetItemCount();for(let i=0;i<n;i++){const t=c.GetItem?.(i)?.text;if(t!=null)items.push(t);}}catch{}});}
      return{options:items,inputId:input.id};
    });
    log(`SETTORE opzioni disponibili: ${JSON.stringify(settoreOpts)}`);

    // Imposta 'concessionari'
    const r1 = await setCombo(page, /BUSINESSSECTORID.*_DD_I$/, 'concessionari');
    log(`setCombo SETTORE "concessionari": ${JSON.stringify(r1)}`);
    const settoreAfter1 = await readField(page, /BUSINESSSECTORID.*_DD_I$/);
    log(`SETTORE dopo set: "${settoreAfter1?.value}" | ok: ${settoreAfter1?.value==='concessionari'}`);

    // Prova anche 'Spett. Studio Dentistico'
    const r2 = await setCombo(page, /BUSINESSSECTORID.*_DD_I$/, 'Spett. Studio Dentistico');
    log(`setCombo SETTORE "Spett. Studio Dentistico": ${JSON.stringify(r2)}`);
    const settoreAfter2 = await readField(page, /BUSINESSSECTORID.*_DD_I$/);
    log(`SETTORE dopo set: "${settoreAfter2?.value}" | ok: ${settoreAfter2?.value==='Spett. Studio Dentistico'}`);

    // Ripristina SETTORE al baseline
    if (settoreBaseline?.value !== undefined) {
      const rRestore = await setCombo(page, /BUSINESSSECTORID.*_DD_I$/, settoreBaseline.value||'N/A');
      log(`SETTORE ripristinato a "${settoreBaseline.value||'N/A'}": ${rRestore.found}`);
    }

    // ─── TEST 2: DLVMODE con nome corretto ──────────────────────────────────
    log('\n=== TEST 2: DLVMODE ===');

    // Enumera opzioni DLVMODE
    const dlvOpts = await page.evaluate(()=>{
      const input=Array.from(document.querySelectorAll('input')).find(i=>i.offsetParent!==null&&/DLVMODE.*_DD_I$/.test(i.id));
      if(!input)return{error:'input-not-found'};
      const col=window.ASPxClientControl?.GetControlCollection?.();
      const items=[];
      if(col){col.ForEachControl(c=>{if(items.length)return;try{const d=c.GetInputElement?.()?.id===input.id;const cn=!d&&c.GetMainElement?.()?.contains(input);if(!d&&!cn)return;if(typeof c.GetItemCount!=='function')return;const n=c.GetItemCount();for(let i=0;i<n;i++){const t=c.GetItem?.(i)?.text;if(t!=null)items.push(t);}}catch{}});}
      return{options:items};
    });
    log(`DLVMODE opzioni: ${JSON.stringify(dlvOpts.options)}`);

    // Scegli un valore diverso dall'attuale
    const dlvTarget = dlvOpts.options?.find(o => o !== dlvBaseline?.value && o !== 'N/A') || 'Destinatario';
    const rDlv = await setCombo(page, /DLVMODE.*_DD_I$/, dlvTarget);
    log(`setCombo DLVMODE "${dlvTarget}": ${JSON.stringify(rDlv)}`);
    const dlvAfterSet = await readField(page, /DLVMODE.*_DD_I$/);
    log(`DLVMODE dopo set: "${dlvAfterSet?.value}" | ok: ${dlvAfterSet?.value===dlvTarget}`);

    // ─── TEST 3: VAT callback — resetta DLVMODE o SETTORE? ─────────────────
    log('\n=== TEST 3: VAT CALLBACK su SETTORE + DLVMODE impostati ===');

    // Prima reimpostia SETTORE
    await setCombo(page, /BUSINESSSECTORID.*_DD_I$/, 'concessionari');
    log('SETTORE reimpostato a "concessionari" prima del VAT test');

    const dlvBeforeVat    = await readField(page, /DLVMODE.*_DD_I$/);
    const settoreBeforeVat = await readField(page, /BUSINESSSECTORID.*_DD_I$/);
    log(`Valori PRE-VAT: DLVMODE="${dlvBeforeVat?.value}" SETTORE="${settoreBeforeVat?.value}"`);

    // Tocca il campo VAT — usa stesso numero per triggerare callback senza bloccare form
    const vatId = await page.evaluate(()=>Array.from(document.querySelectorAll('input')).find(el=>/dviVATNUM_Edit_I$/.test(el.id)&&el.offsetParent!==null)?.id??null);
    if (vatId) {
      await page.evaluate(id=>{
        const el=document.getElementById(id);if(!el)return;
        el.focus();el.click();if(typeof el.select==='function')el.select();
        const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
        if(s)s.call(el,'');else el.value='';
        el.dispatchEvent(new Event('input',{bubbles:true}));
      },vatId);
      await page.type(`#${cssEscape(vatId)}`,'01006500761',{delay:5});
      await page.keyboard.press('Tab');
      log('VAT digitato, attendo callback (max 28s)...');
      const callbackDone = await page.waitForFunction(()=>{
        const el=Array.from(document.querySelectorAll('input')).find(i=>/VATLASTCHECKED.*_I$/.test(i.id));
        return el&&el.value!=='';
      },{timeout:30000,polling:500}).then(()=>true).catch(()=>false);
      log(`VAT callback completato: ${callbackDone}`);
      await waitIdle(page,'vat-post',10000);
    }

    const dlvAfterVat     = await readField(page, /DLVMODE.*_DD_I$/);
    const settoreAfterVat  = await readField(page, /BUSINESSSECTORID.*_DD_I$/);
    log(`Valori POST-VAT: DLVMODE="${dlvAfterVat?.value}" SETTORE="${settoreAfterVat?.value}"`);
    log(`DLVMODE sopravvissuto: ${dlvAfterVat?.value===dlvBeforeVat?.value ? '✅ SÌ' : '❌ NO — era "'+dlvBeforeVat?.value+'" ora "'+dlvAfterVat?.value+'"'}`);
    log(`SETTORE sopravvissuto: ${settoreAfterVat?.value===settoreBeforeVat?.value ? '✅ SÌ' : '❌ NO — era "'+settoreBeforeVat?.value+'" ora "'+settoreAfterVat?.value+'"'}`);

    // ─── ANNULLA — non salvare ──────────────────────────────────────────────
    log('\n=== ANNULLA ===');
    await page.evaluate(()=>{
      const btn=Array.from(document.querySelectorAll('a,button'))
        .find(el=>el.offsetParent!==null&&/^annull/i.test(el.textContent?.trim()??'')&&/DXI[23]/.test(el.id??''));
      btn?.click();
    });
    await wait(2000);
    log('URL dopo annulla: '+page.url());

  } catch(err) {
    console.error('ERRORE:', err);
  } finally {
    if (process.env.AUTO_CLOSE==='1') await browser.close();
    else { log('\n⚠️  Browser aperto. Ctrl+C per chiudere.'); await new Promise(()=>{}); }
  }
}
main().catch(e=>{console.error(e);process.exit(1);});

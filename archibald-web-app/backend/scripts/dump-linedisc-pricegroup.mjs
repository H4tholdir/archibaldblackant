/**
 * dump-linedisc-pricegroup.mjs
 *
 * Test CRITICO: setCombo(LINEDISC) resetta PRICEGROUP?
 *
 * Scenari:
 *  A) Leggi baseline PRICEGROUP e LINEDISC
 *  B) Apri Tab Prezzi e Sconti → setCombo(LINEDISC, "N/A") → leggi PRICEGROUP → resettato?
 *  C) Apri Tab Prezzi e Sconti → setCombo(LINEDISC, X) → setCombo(PRICEGROUP, "DETTAGLIO") → salva → riapri → leggi entrambi
 *  D) NON aprire Tab Prezzi e Sconti → salva → riapri → PRICEGROUP invariato?
 *
 * NON salva in scenario B/D — solo in C per verificare persistenza.
 * Ripristina sempre i valori originali.
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
const CUSTOMER_ID = '55839';
const CUSTOMER_URL = `${URL}/CUSTTABLE_DetailView/${CUSTOMER_ID}/`;

function cssEscape(id) { return id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1'); }
function wait(ms) { return new Promise(r=>setTimeout(r,ms)); }
function log(msg) { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }

async function waitIdle(page, label='', ms=10000) {
  try { await page.waitForFunction(()=>{const w=window;if(typeof w.ASPx!=='undefined'){const p=(w.ASPx._pendingCallbacks||0)+(w.ASPx._sendingRequests||0)+(w.ASPx._pendingRequestCount||0);if(p>0)return false;}const col=w.ASPxClientControl?.GetControlCollection?.();if(col){let busy=false;try{col.ForEachControl(c=>{if(c?.InCallback?.())busy=true;});}catch{}if(busy)return false;}return true;},{timeout:ms,polling:150});}
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
    if (!combo) return { found:false, reason:'combo-not-found' };
    if (typeof combo.GetItemCount!=='function') return { found:false, reason:'no-GetItemCount' };
    const n = combo.GetItemCount();
    const allOptions = [];
    for (let i=0;i<n;i++) { const t=combo.GetItem?.(i)?.text; if(t!=null)allOptions.push(t); }
    const idx = allOptions.findIndex(t=>t===val);
    if (idx>=0) { combo.SetSelectedIndex(idx); return { found:true, text:allOptions[idx], allOptions }; }
    return { found:false, reason:'option-not-found', triedValue:val, allOptions };
  }, idRegex.source||String(idRegex), value);
  await waitIdle(page, `combo-${value}`, 5000);
  return result;
}

async function readPrezziFields(page) {
  return page.evaluate(() => {
    const get = re => Array.from(document.querySelectorAll('input')).find(el=>new RegExp(re).test(el.id)&&el.offsetParent!==null)?.value??null;
    return {
      priceGroup: get(/dviPRICEGROUP_Edit_dropdown_DD_I$/),
      lineDisc:   get(/dviLINEDISC_Edit_dropdown_DD_I$/),
      multiLine:  get(/dviMULTILINEDISC_Edit_dropdown_DD_I$/),
      endDisc:    get(/dviENDDISC_Edit_dropdown_DD_I$/),
    };
  });
}

async function openTab(page, tabText) {
  const clicked = await page.evaluate(text => {
    for (const el of document.querySelectorAll('a.dxtc-link,span.dx-vam,a'))
      if (el.textContent?.trim().includes(text) && el.offsetParent !== null) { (el.tagName==='A'?el:el.parentElement)?.click(); return true; }
    return false;
  }, tabText);
  if (clicked) await waitIdle(page, `tab-${tabText}`, 6000);
  return clicked;
}

async function saveAndReopen(page) {
  // Click Salvare
  await page.evaluate(()=>{
    const btn=Array.from(document.querySelectorAll('a,button')).find(el=>el.offsetParent!==null&&(el.title==='Salvare'||/^salvar/i.test(el.textContent?.trim()||'')));
    btn?.click();
  });
  await wait(2500); await waitIdle(page,'after-save',5000);
  // Warning checkbox
  const chkHandled = await page.evaluate(()=>{
    const chk=document.querySelector('input[id$="_ErrorInfo_Ch_S"]');
    if(!chk||!chk.offsetParent)return false;
    const col=window.ASPxClientControl?.GetControlCollection?.();
    if(col){let h=false;col.ForEachControl(c=>{if(h)return;try{const m=c.GetMainElement?.();if(m?.contains(chk)&&typeof c.SetChecked==='function'){c.SetChecked(true);h=true;}}catch{}});if(h)return true;}
    try{chk.click();return true;}catch{return false;}
  });
  if(chkHandled){
    log('  ⚠️  Warning checkbox spuntato');
    await wait(500);
    await page.evaluate(()=>{const btn=Array.from(document.querySelectorAll('a,button')).find(el=>el.offsetParent!==null&&(el.title==='Salvare'||/^salvar/i.test(el.textContent?.trim()||'')));btn?.click();});
    await wait(2500); await waitIdle(page,'after-save-retry',8000);
  }
  try { await page.waitForFunction(()=>!window.location.href.includes('mode=Edit'),{timeout:20000,polling:300}); } catch { log('  ERP rimasto in edit'); }
  // Riapri in edit
  await page.goto(CUSTOMER_URL,{waitUntil:'domcontentloaded',timeout:60000});
  await waitIdle(page,'reopen',10000);
  const editClicked = await page.evaluate(()=>{
    const btn=Array.from(document.querySelectorAll('a,button')).filter(el=>el.offsetParent!==null).find(el=>/modif|edit/i.test(el.title??'')||/modif|edit/i.test(el.textContent?.trim()??''));
    if(btn){btn.click();return btn.id;}return null;
  });
  await page.waitForFunction(()=>window.location.href.includes('mode=Edit')||document.querySelector('[title="Salvare"]')!==null,{timeout:10000,polling:300}).catch(()=>{});
  await waitIdle(page,'edit-ready',10000);
  return { saved: true, editClicked };
}

async function main() {
  log('══ LINEDISC → PRICEGROUP RESET TEST ══');

  const browser = await puppeteer.launch({
    headless:false, slowMo:60,
    args:['--ignore-certificate-errors','--no-sandbox','--disable-setuid-sandbox'],
    defaultViewport:{width:1440,height:900},
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('dialog', async d=>{ log(`[DIALOG] ${d.type()}: "${d.message()}" → accept()`); await d.accept(); });

  try {
    // Login
    await page.goto(`${URL}/`,{waitUntil:'networkidle2',timeout:30000});
    if (page.url().toLowerCase().includes('login')) {
      const uid = await page.evaluate(()=>{const t=Array.from(document.querySelectorAll('input')).filter(i=>i.type!=='hidden'&&i.type!=='submit'&&i.type!=='button'&&i.type!=='password');return(t.find(i=>i.id.includes('UserName')||i.name.includes('UserName'))||t[0])?.id??null;});
      if (!uid) throw new Error('Username non trovato');
      await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},uid);
      await page.type(`#${cssEscape(uid)}`,USER,{delay:30}); await page.keyboard.press('Tab'); await waitIdle(page,'u',5000);
      const pid = await page.evaluate(()=>{const p=document.querySelector('input[type="password"]');p?.scrollIntoView();p?.focus();return p?.id??null;});
      if (!pid) throw new Error('Password non trovata');
      await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},pid);
      await page.type(`#${cssEscape(pid)}`,PASS,{delay:30}); await page.keyboard.press('Tab'); await waitIdle(page,'p',5000);
      const sub = await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('input[type="submit"],button[type="submit"],a,button')).find(el=>el.offsetParent!==null&&/accedi|login|sign in|entra/i.test(el.textContent+(el.value||'')));if(b){b.click();return true;}const f=document.querySelector('input[type="submit"]');if(f){f.click();return true;}return false;});
      if(!sub) await page.keyboard.press('Enter');
      await page.waitForNavigation({waitUntil:'networkidle2',timeout:20000}).catch(()=>{});
      if (page.url().toLowerCase().includes('login')) throw new Error('Login fallito');
      log('Login OK → '+page.url());
    }

    // ── Apri in edit ─────────────────────────────────────────────────────────
    await page.goto(CUSTOMER_URL,{waitUntil:'networkidle2',timeout:30000});
    await waitIdle(page,'view',10000);
    const editBtn = await page.evaluate(()=>{
      const btn=Array.from(document.querySelectorAll('a,button')).filter(el=>el.offsetParent!==null).find(el=>/modif|edit/i.test(el.title??'')||/modif|edit/i.test(el.textContent?.trim()??''));
      if(btn){btn.click();return btn.id||'found';}return null;
    });
    await page.waitForFunction(()=>window.location.href.includes('mode=Edit')||document.querySelector('[title="Salvare"]')!==null,{timeout:10000,polling:300}).catch(()=>{});
    await waitIdle(page,'edit-ready',10000);
    log('Edit mode: '+page.url());

    // ── BASELINE ─────────────────────────────────────────────────────────────
    log('\n══ BASELINE ══');
    await openTab(page, 'Prezzi e sconti');
    const baseline = await readPrezziFields(page);
    log(`PRICEGROUP: "${baseline.priceGroup}"`);
    log(`LINEDISC:   "${baseline.lineDisc}"`);
    log(`MULTILINE:  "${baseline.multiLine}"`);
    log(`ENDDISC:    "${baseline.endDisc}"`);

    // ══════════════════════════════════════════════════════════════════════════
    // TEST A: setCombo(LINEDISC, "N/A") → PRICEGROUP si azzera?
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ TEST A: setCombo(LINEDISC="N/A") → PRICEGROUP reset? ══');

    const rA = await setCombo(page, /dviLINEDISC_Edit_dropdown_DD_I$/, 'N/A');
    log(`setCombo LINEDISC "N/A": found=${rA.found}`);
    await wait(1000); // aspetta callback XAF

    const afterA = await readPrezziFields(page);
    log(`PRICEGROUP dopo LINEDISC="N/A": "${afterA.priceGroup}"`);
    log(`LINEDISC dopo:                  "${afterA.lineDisc}"`);
    const priceGroupResetA = afterA.priceGroup !== baseline.priceGroup;
    log(`PRICEGROUP RESETTATO: ${priceGroupResetA ? '❌ SÌ — CONFERMATO BUG' : '✅ NO — non resettato'}`);

    // ══════════════════════════════════════════════════════════════════════════
    // TEST B: setCombo(LINEDISC) con valore diverso → PRICEGROUP si azzera?
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ TEST B: setCombo(LINEDISC="Discount to get street price") → PRICEGROUP reset? ══');

    const rB = await setCombo(page, /dviLINEDISC_Edit_dropdown_DD_I$/, 'Discount to get street price');
    log(`setCombo LINEDISC "Discount to get street price": found=${rB.found}`);
    await wait(1000);

    const afterB = await readPrezziFields(page);
    log(`PRICEGROUP dopo LINEDISC cambiato: "${afterB.priceGroup}"`);
    log(`LINEDISC dopo:                     "${afterB.lineDisc}"`);
    const priceGroupResetB = afterB.priceGroup !== baseline.priceGroup;
    log(`PRICEGROUP RESETTATO: ${priceGroupResetB ? '❌ SÌ — CONFERMATO BUG' : '✅ NO — non resettato'}`);

    // ══════════════════════════════════════════════════════════════════════════
    // TEST C: Apri Tab Prezzi → NON toccare nulla → vai a Principale → torna → PRICEGROUP?
    // (Verifica se solo aprire la tab resetta qualcosa)
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ TEST C: Apri Prezzi e Sconti → vai a Principale → torna → PRICEGROUP invariato? ══');

    await openTab(page, 'Principale');
    await wait(500);
    await openTab(page, 'Prezzi e sconti');
    await wait(1000);

    const afterC = await readPrezziFields(page);
    log(`PRICEGROUP dopo cambio tab: "${afterC.priceGroup}"`);
    const priceGroupResetC = afterC.priceGroup !== baseline.priceGroup;
    log(`PRICEGROUP RESETTATO da cambio tab: ${priceGroupResetC ? '❌ SÌ' : '✅ NO'}`);

    // ══════════════════════════════════════════════════════════════════════════
    // TEST D: setCombo(LINEDISC) → poi setCombo(PRICEGROUP) → salva → riapri → entrambi OK?
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ TEST D: setCombo(LINEDISC) → setCombo(PRICEGROUP) → salva → verifica persistenza ══');

    // Imposta LINEDISC
    const rD1 = await setCombo(page, /dviLINEDISC_Edit_dropdown_DD_I$/, 'N/A');
    log(`setCombo LINEDISC "N/A": found=${rD1.found}`);
    await wait(1000);

    const midD = await readPrezziFields(page);
    log(`PRICEGROUP dopo LINEDISC (prima di reimpostare): "${midD.priceGroup}"`);

    // Ora reimposta esplicitamente PRICEGROUP
    const rD2 = await setCombo(page, /dviPRICEGROUP_Edit_dropdown_DD_I$/, 'DETTAGLIO (consigliato)');
    log(`setCombo PRICEGROUP "DETTAGLIO (consigliato)": found=${rD2.found}`);
    await wait(500);

    const beforeSaveD = await readPrezziFields(page);
    log(`Prima del save: PRICEGROUP="${beforeSaveD.priceGroup}" LINEDISC="${beforeSaveD.lineDisc}"`);

    // Salva
    log('  Salvataggio...');
    const saveRes = await saveAndReopen(page);
    log(`  Save: ${JSON.stringify(saveRes)}`);

    // Riapri Tab Prezzi e sconti
    await openTab(page, 'Prezzi e sconti');
    const afterSaveD = await readPrezziFields(page);
    log(`Dopo save+riapri: PRICEGROUP="${afterSaveD.priceGroup}" LINEDISC="${afterSaveD.lineDisc}"`);
    log(`PRICEGROUP persistito: ${afterSaveD.priceGroup === 'DETTAGLIO (consigliato)' ? '✅' : '❌'}`);
    log(`LINEDISC persistito:   ${afterSaveD.lineDisc === 'N/A' ? '✅' : '❌'}`);

    // ══════════════════════════════════════════════════════════════════════════
    // RIPRISTINO: valori originali
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══ RIPRISTINO ══');
    await openTab(page, 'Prezzi e sconti');
    if (baseline.lineDisc) await setCombo(page, /dviLINEDISC_Edit_dropdown_DD_I$/, baseline.lineDisc);
    if (baseline.priceGroup) await setCombo(page, /dviPRICEGROUP_Edit_dropdown_DD_I$/, baseline.priceGroup);
    log('  LINEDISC e PRICEGROUP ripristinati');
    const r2 = await saveAndReopen(page);
    log(`  Ripristino save: ${r2.saved}`);
    await openTab(page, 'Prezzi e sconti');
    const finalCheck = await readPrezziFields(page);
    log(`  Verifica finale: PRICEGROUP="${finalCheck.priceGroup}" LINEDISC="${finalCheck.lineDisc}"`);
    const restoredOk = finalCheck.priceGroup === baseline.priceGroup && finalCheck.lineDisc === baseline.lineDisc;
    log(`  Ripristino: ${restoredOk ? '✅ OK' : '❌ VERIFICA MANUALE'}`);

    // ══════════════════════════════════════════════════════════════════════════
    // SOMMARIO
    // ══════════════════════════════════════════════════════════════════════════
    log('\n══════════════════════════════════════════');
    log('  SOMMARIO RISULTATI');
    log('══════════════════════════════════════════');
    log(`Baseline:   PRICEGROUP="${baseline.priceGroup}" LINEDISC="${baseline.lineDisc}"`);
    log(`TEST A (LINEDISC→N/A):                  PRICEGROUP resettato? ${priceGroupResetA ? '❌ SÌ' : '✅ NO'}`);
    log(`TEST B (LINEDISC→"Discount..."):         PRICEGROUP resettato? ${priceGroupResetB ? '❌ SÌ' : '✅ NO'}`);
    log(`TEST C (cambio tab senza toccare):       PRICEGROUP resettato? ${priceGroupResetC ? '❌ SÌ' : '✅ NO'}`);
    log(`TEST D (LINEDISC→PRICEGROUP→save):       PRICEGROUP persiste? ${afterSaveD.priceGroup==='DETTAGLIO (consigliato)'?'✅ SÌ':'❌ NO'}`);

  } catch(err) {
    log('ERRORE: '+err);
    console.error(err);
  } finally {
    if (process.env.AUTO_CLOSE === '1') await browser.close();
    else { log('\n⚠️  Browser aperto. Ctrl+C per chiudere.'); await new Promise(()=>{}); }
  }
}
main().catch(e=>{console.error(e);process.exit(1);});

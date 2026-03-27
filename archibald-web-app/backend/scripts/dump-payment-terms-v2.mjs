/**
 * dump-payment-terms-v2.mjs — cerca specificamente i termini mancanti
 * e studia la struttura del pager del dialog
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
  catch {}
}

async function openPaymDialog(page) {
  const paymBtnId = await page.evaluate(()=>
    Array.from(document.querySelectorAll('img')).find(el=>/PAYMTERMID.*_B0Img/.test(el.id||'')&&el.offsetParent!==null)?.id??null
  );
  if (!paymBtnId) throw new Error('Bottone PAYMTERMID non trovato');
  await page.evaluate(id=>document.getElementById(id)?.click(), paymBtnId);
  let iframeFrame = null;
  for (let i=0; i<25; i++) { await wait(400); iframeFrame = page.frames().find(f=>f.url().includes('FindPopup')); if(iframeFrame)break; }
  if (!iframeFrame) throw new Error('Iframe non trovato');
  try { await iframeFrame.waitForFunction(()=>document.readyState==='complete',{timeout:6000}); } catch {}
  const searchInput = await iframeFrame.waitForSelector('input[type="text"]',{timeout:6000});
  return { iframeFrame, searchInput };
}

async function searchAndRead(iframeFrame, searchInput, query) {
  await searchInput.click({clickCount:3});
  if (query) await searchInput.type(query, {delay:20});
  await searchInput.press('Enter');
  await wait(2500);
  const rows = await iframeFrame.evaluate(()=>
    Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[id*="DXDataRow"]'))
      .filter(tr=>tr.offsetParent!==null)
      .map(r=>({ rowId:r.id, cells:Array.from(r.querySelectorAll('td')).map(td=>td.textContent?.trim()||'').filter(Boolean) }))
  );
  return rows;
}

async function main() {
  log('══ PAYMENT TERMS V2 ══');
  const browser = await puppeteer.launch({ headless:false, slowMo:50,
    args:['--ignore-certificate-errors','--no-sandbox','--disable-setuid-sandbox'],
    defaultViewport:{width:1440,height:900} });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('dialog', async d=>await d.accept());

  try {
    // Login
    await page.goto(`${URL}/`, {waitUntil:'networkidle2',timeout:30000});
    if (page.url().toLowerCase().includes('login')) {
      const uid = await page.evaluate(()=>{const t=Array.from(document.querySelectorAll('input')).filter(i=>i.type!=='hidden'&&i.type!=='submit'&&i.type!=='button'&&i.type!=='password');return(t.find(i=>i.id.includes('UserName'))||t[0])?.id??null;});
      await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},uid);
      await page.type(`#${cssEscape(uid)}`,USER,{delay:30}); await page.keyboard.press('Tab'); await waitIdle(page,'u',5000);
      const pid=await page.evaluate(()=>{const p=document.querySelector('input[type="password"]');p?.focus();return p?.id??null;});
      await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},pid);
      await page.type(`#${cssEscape(pid)}`,PASS,{delay:30}); await page.keyboard.press('Tab'); await waitIdle(page,'p',5000);
      await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('input[type="submit"],button[type="submit"],a,button')).find(el=>el.offsetParent!==null&&/accedi|login/i.test(el.textContent+(el.value||'')));if(b)b.click();});
      await page.waitForNavigation({waitUntil:'networkidle2',timeout:20000}).catch(()=>{});
      log('Login OK → '+page.url());
    }

    // Apri cliente in edit
    await page.goto(`${URL}/CUSTTABLE_DetailView/55839/`,{waitUntil:'networkidle2',timeout:30000});
    await waitIdle(page,'view',10000);
    await page.evaluate(()=>{const btn=Array.from(document.querySelectorAll('a,button')).filter(el=>el.offsetParent!==null).find(el=>/modif|edit/i.test(el.title??'')||/modif|edit/i.test(el.textContent?.trim()??''));btn?.click();});
    await page.waitForFunction(()=>window.location.href.includes('mode=Edit'),{timeout:10000,polling:300}).catch(()=>{});
    await waitIdle(page,'edit',10000);

    // ── TEST 1: cerca "201" ────────────────────────────────────────────────
    log('\n── TEST 1: cerca "201" ──');
    const { iframeFrame: ifr1, searchInput: si1 } = await openPaymDialog(page);
    const rows201 = await searchAndRead(ifr1, si1, '201');
    log(`Risultati per "201": ${rows201.length}`);
    rows201.forEach(r => log(`  ${r.cells.join(' | ')}`));

    // dump HTML completo dell'iframe per diagnostica
    const iframeHtml = await ifr1.evaluate(()=>document.body?.innerHTML?.substring(0,2000));
    log(`\nIframe HTML (primi 2000 char):\n${iframeHtml}`);

    await page.keyboard.press('Escape');
    await waitIdle(page,'close1',3000);

    // ── TEST 2: cerca "206" ────────────────────────────────────────────────
    log('\n── TEST 2: cerca "206" ──');
    const { iframeFrame: ifr2, searchInput: si2 } = await openPaymDialog(page);
    const rows206 = await searchAndRead(ifr2, si2, '206');
    log(`Risultati per "206": ${rows206.length}`);
    rows206.forEach(r => log(`  ${r.cells.join(' | ')}`));
    await page.keyboard.press('Escape');
    await waitIdle(page,'close2',3000);

    // ── TEST 3: cerca vuoto, aumenta page size se possibile ───────────────
    log('\n── TEST 3: query vuota + studia pager completo ──');
    const { iframeFrame: ifr3, searchInput: si3 } = await openPaymDialog(page);
    await si3.click({clickCount:3}); await si3.press('Enter'); await wait(2500);

    // Dump totale elementi del dialog
    const fullDump = await ifr3.evaluate(()=>{
      const totalText = Array.from(document.querySelectorAll('*'))
        .filter(el=>el.offsetParent!==null&&el.children.length===0)
        .map(el=>({tag:el.tagName,id:el.id,cls:el.className?.substring(0,40),text:el.textContent?.trim()?.substring(0,50)}))
        .filter(el=>el.text&&el.text.length>0);
      const pagerEl = document.querySelector('[class*="dxp"],[id*="pager"],[id*="Pager"]');
      const allRows = Array.from(document.querySelectorAll('tr')).map(tr=>({id:tr.id,cls:tr.className?.substring(0,40),cells:Array.from(tr.querySelectorAll('td')).map(td=>td.textContent?.trim()).filter(Boolean)})).filter(r=>r.cells.length>0);
      return { totalElements: totalText.length, pagerHtml: pagerEl?.outerHTML?.substring(0,500)??'no pager', allRows };
    });
    log(`Totale elementi visibili: ${fullDump.totalElements}`);
    log(`Pager: ${fullDump.pagerHtml}`);
    log(`Tutte le righe nel dialog:`);
    fullDump.allRows.forEach(r => log(`  [${r.cls}] ${r.cells.join(' | ')}`));

    await page.keyboard.press('Escape');
    await waitIdle(page,'close3',3000);

    // Annulla form
    await page.evaluate(()=>{const btn=Array.from(document.querySelectorAll('a,button')).find(el=>el.offsetParent!==null&&/^annull/i.test(el.textContent?.trim()??'')&&/DXI[23]/.test(el.id??''));btn?.click();});
    await wait(2000);

  } catch(err) { log('ERRORE: '+err); console.error(err); }
  finally {
    if (process.env.AUTO_CLOSE==='1') await browser.close();
    else { log('\n⚠️  Browser aperto. Ctrl+C.'); await new Promise(()=>{}); }
  }
}
main().catch(e=>{console.error(e);process.exit(1);});

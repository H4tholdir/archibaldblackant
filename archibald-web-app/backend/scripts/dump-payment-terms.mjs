/**
 * dump-payment-terms.mjs
 *
 * Scrapa TUTTI i termini di pagamento disponibili nel dialog PAYMTERMID dell'ERP.
 * - Apre il popup iframe
 * - Cerca con query vuota (lista completa)
 * - Scorre TUTTE le pagine del dialog (paginato)
 * - Salva in /tmp/payment-terms.json per aggiornare il frontend
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); } catch {}

const URL  = (process.env.ARCHIBALD_URL || 'https://4.231.124.90/Archibald').replace(/\/$/,'');
const USER = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASS = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const OUTPUT = '/tmp/payment-terms.json';

function cssEscape(id) { return id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1'); }
function wait(ms) { return new Promise(r=>setTimeout(r,ms)); }
function log(msg) { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }

async function waitIdle(page, label='', ms=10000) {
  try { await page.waitForFunction(()=>{const w=window;if(typeof w.ASPx!=='undefined'){const p=(w.ASPx._pendingCallbacks||0)+(w.ASPx._sendingRequests||0)+(w.ASPx._pendingRequestCount||0);if(p>0)return false;}const col=w.ASPxClientControl?.GetControlCollection?.();if(col){let busy=false;try{col.ForEachControl(c=>{if(c?.InCallback?.())busy=true;});}catch{}if(busy)return false;}return true;},{timeout:ms,polling:150}); }
  catch { log(`  waitIdle timeout (${label})`); }
}

async function main() {
  log('══ PAYMENT TERMS SCRAPER ══');

  const browser = await puppeteer.launch({
    headless: false, slowMo: 40,
    args: ['--ignore-certificate-errors','--no-sandbox','--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('dialog', async d => { await d.accept(); });

  try {
    // Login
    await page.goto(`${URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    if (page.url().toLowerCase().includes('login')) {
      const uid = await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll('input')).filter(i=>i.type!=='hidden'&&i.type!=='submit'&&i.type!=='button'&&i.type!=='password');
        return (t.find(i=>i.id.includes('UserName')||i.name.includes('UserName'))||t[0])?.id??null;
      });
      if (!uid) throw new Error('Username non trovato');
      await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},uid);
      await page.type(`#${cssEscape(uid)}`, USER, {delay:30});
      await page.keyboard.press('Tab'); await waitIdle(page,'u',5000);
      const pid = await page.evaluate(()=>{const p=document.querySelector('input[type="password"]');p?.scrollIntoView();p?.focus();return p?.id??null;});
      if (!pid) throw new Error('Password non trovata');
      await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},pid);
      await page.type(`#${cssEscape(pid)}`, PASS, {delay:30});
      await page.keyboard.press('Tab'); await waitIdle(page,'p',5000);
      const sub = await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('input[type="submit"],button[type="submit"],a,button')).find(el=>el.offsetParent!==null&&/accedi|login|sign in|entra/i.test(el.textContent+(el.value||'')));if(b){b.click();return true;}const f=document.querySelector('input[type="submit"]');if(f){f.click();return true;}return false;});
      if (!sub) await page.keyboard.press('Enter');
      await page.waitForNavigation({waitUntil:'networkidle2',timeout:20000}).catch(()=>{});
      if (page.url().toLowerCase().includes('login')) throw new Error('Login fallito');
      log('Login OK → '+page.url());
    }

    // Apri un cliente in edit mode per accedere al campo PAYMTERMID
    await page.goto(`${URL}/CUSTTABLE_DetailView/55839/`, {waitUntil:'networkidle2',timeout:30000});
    await waitIdle(page,'view',10000);
    const editBtn = await page.evaluate(()=>{
      const btn=Array.from(document.querySelectorAll('a,button')).filter(el=>el.offsetParent!==null).find(el=>/modif|edit/i.test(el.title??'')||/modif|edit/i.test(el.textContent?.trim()??''));
      if(btn){btn.click();return btn.id;}return null;
    });
    await page.waitForFunction(()=>window.location.href.includes('mode=Edit')||document.querySelector('[title="Salvare"]')!==null,{timeout:10000,polling:300}).catch(()=>{});
    await waitIdle(page,'edit-ready',10000);
    log('Edit mode: '+page.url());

    // Clicca _B0Img del PAYMTERMID
    const paymBtnId = await page.evaluate(()=>
      Array.from(document.querySelectorAll('img')).find(el=>/PAYMTERMID.*_B0Img/.test(el.id||'')&&el.offsetParent!==null)?.id??null
    );
    if (!paymBtnId) throw new Error('Bottone PAYMTERMID _B0Img non trovato');
    log(`Bottone PAYMTERMID: ${paymBtnId}`);
    await page.evaluate(id=>document.getElementById(id)?.click(), paymBtnId);

    // Attendi iframe
    let iframeFrame = null;
    for (let i=0; i<25; i++) {
      await wait(400);
      iframeFrame = page.frames().find(f=>f.url().includes('FindPopup=true'));
      if (iframeFrame) break;
    }
    if (!iframeFrame) throw new Error('Iframe PAYMTERMID non trovato');
    try { await iframeFrame.waitForFunction(()=>document.readyState==='complete',{timeout:6000}); } catch {}
    log('Iframe trovato: '+iframeFrame.url());

    // Trova campo di ricerca
    const searchInput = await iframeFrame.waitForSelector(
      'input[type="text"],input:not([type="hidden"]):not([type="checkbox"])',
      {timeout:6000}
    );
    if (!searchInput) throw new Error('Campo ricerca non trovato');
    const searchId = await searchInput.evaluate(el=>el.id);
    log('Campo ricerca: '+searchId);

    // Cerca con query vuota per tutti i termini
    await searchInput.click({clickCount:3});
    await searchInput.press('Enter');
    await wait(3000);

    // Leggi headers
    const headers = await iframeFrame.evaluate(()=>
      Array.from(document.querySelectorAll('th,.dxgvHeaderCell_XafTheme'))
        .filter(el=>el.offsetParent!==null).map(el=>el.textContent?.trim()).filter(Boolean)
    );
    log(`Headers: ${headers.join(' | ')}`);

    // Raccogli tutti i termini paginando
    const allTerms = [];
    let pageNum = 1;

    while (true) {
      await wait(1000);

      // Leggi righe della pagina corrente
      const rows = await iframeFrame.evaluate(()=>{
        const rs = Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[id*="DXDataRow"]'))
          .filter(tr=>tr.offsetParent!==null);
        return rs.map(r=>({
          rowId: r.id,
          cells: Array.from(r.querySelectorAll('td')).map(td=>td.textContent?.trim()||'').filter(Boolean)
        }));
      });

      log(`Pagina ${pageNum}: ${rows.length} righe`);
      rows.forEach(r => {
        if (r.cells.length >= 2) {
          allTerms.push({ code: r.cells[0], description: r.cells[1] });
        }
      });

      // Debug: dump pager HTML per capire la struttura
      const pagerDebug = await iframeFrame.evaluate(()=>{
        const pagerEl = document.querySelector('[id*="pager"],[id*="Pager"],[class*="dxp"],[class*="Pager"]');
        const allClickable = Array.from(document.querySelectorAll('a,button,td,span'))
          .filter(el => el.offsetParent !== null && el.textContent?.trim().match(/^[0-9>›»]+$/))
          .map(el => ({ tag: el.tagName, id: el.id, cls: el.className?.substring(0,50), text: el.textContent?.trim() }));
        return { pagerHtml: pagerEl?.innerHTML?.substring(0,500) ?? 'no pager found', clickable: allClickable };
      });
      log(`  Pager debug: ${JSON.stringify(pagerDebug.clickable.slice(0,10))}`);
      if (pagerDebug.pagerHtml !== 'no pager found') log(`  Pager HTML: ${pagerDebug.pagerHtml.substring(0,200)}`);

      // Cerca il pulsante "Pagina successiva" nel pager della griglia iframe
      const hasNextPage = await iframeFrame.evaluate((pNum)=>{
        // Cerca tutti gli elementi cliccabili che sembrano numeri di pagina o pulsanti next
        const allEls = Array.from(document.querySelectorAll('a,td,span,div,button'))
          .filter(el => el.offsetParent !== null);

        // Cerca ">" o "›" o "Next"
        const nextBtn = allEls.find(el => {
          const text = el.textContent?.trim();
          const title = el.getAttribute('title') || '';
          return (text === '>' || text === '›' || text === '»' || text === '>>' || /next|prossim|succ/i.test(title));
        });
        if (nextBtn) { nextBtn.click(); return { found: true, method: 'next-button', text: nextBtn.textContent?.trim() }; }

        // Cerca il numero di pagina pNum+1
        const nextNumBtn = allEls.find(el => el.textContent?.trim() === String(pNum + 1) && /dxp|pager|PBN|page/i.test(el.id || el.className || ''));
        if (nextNumBtn) { nextNumBtn.click(); return { found: true, method: 'page-number', page: pNum + 1 }; }

        // Fallback: qualsiasi elemento con testo = pNum+1
        const anyNext = allEls.find(el => el.textContent?.trim() === String(pNum + 1) && !el.querySelector('*'));
        if (anyNext) { anyNext.click(); return { found: true, method: 'any-next', page: pNum + 1 }; }

        return false;
      }, pageNum);

      if (hasNextPage) log(`  → Pagina successiva: ${JSON.stringify(hasNextPage)}`);

      if (!hasNextPage) {
        log('Nessuna pagina successiva — scraping completato');
        break;
      }

      pageNum++;
      if (pageNum > 20) { log('⚠️  Limite sicurezza: max 20 pagine'); break; }

      log('Attesa pagina successiva...');
      await wait(2000);
    }

    // Chiudi il dialog con Escape
    await page.keyboard.press('Escape');
    await waitIdle(page,'close',3000);

    // Annulla il form senza salvare
    await page.evaluate(()=>{
      const btn=Array.from(document.querySelectorAll('a,button')).find(el=>el.offsetParent!==null&&/^annull/i.test(el.textContent?.trim()??'')&&/DXI[23]/.test(el.id??''));
      btn?.click();
    });
    await wait(2000);

    // Salva risultati
    const result = {
      scraped_at: new Date().toISOString(),
      source: 'Archibald ERP PAYMTERMID dialog',
      total: allTerms.length,
      headers,
      terms: allTerms,
    };
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf8');

    log('\n══ RISULTATI ══');
    log(`Totale termini trovati: ${allTerms.length}`);
    log(`Salvati in: ${OUTPUT}`);
    allTerms.forEach((t, i) => log(`  [${i+1}] "${t.code}" — "${t.description}"`));

  } catch(err) {
    log('ERRORE: '+err);
    console.error(err);
  } finally {
    if (process.env.AUTO_CLOSE==='1') await browser.close();
    else { log('\n⚠️  Browser aperto. Ctrl+C per chiudere.'); await new Promise(()=>{}); }
  }
}
main().catch(e=>{console.error(e);process.exit(1);});

/**
 * dump-payment-terms-scroll.mjs
 * Il dialog PAYMTERMID usa virtual scroll — scrolla per caricare tutti i termini.
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); } catch {}

const URL  = (process.env.ARCHIBALD_URL || 'https://4.231.124.90/Archibald').replace(/\/$/,'');
const USER = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASS = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const OUTPUT = '/tmp/payment-terms-complete.json';

function cssEscape(id) { return id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1'); }
function wait(ms) { return new Promise(r=>setTimeout(r,ms)); }
function log(msg) { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }

async function waitIdle(page, ms=8000) {
  try { await page.waitForFunction(()=>{const w=window;if(typeof w.ASPx!=='undefined'){const p=(w.ASPx._pendingCallbacks||0)+(w.ASPx._sendingRequests||0)+(w.ASPx._pendingRequestCount||0);if(p>0)return false;}return true;},{timeout:ms,polling:150}); } catch {}
}

async function readAllRows(iframeFrame) {
  return iframeFrame.evaluate(()=>{
    const rows = Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[id*="DXDataRow"]'))
      .filter(tr=>tr.offsetParent!==null || tr.getBoundingClientRect().height>0);
    return rows.map(r=>({
      rowId: r.id,
      cells: Array.from(r.querySelectorAll('td')).map(td=>td.textContent?.trim()||'').filter(Boolean)
    }));
  });
}

async function main() {
  log('══ PAYMENT TERMS — VIRTUAL SCROLL SCRAPER ══');
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
      await page.type(`#${cssEscape(uid)}`,USER,{delay:30}); await page.keyboard.press('Tab'); await waitIdle(page,5000);
      const pid=await page.evaluate(()=>{const p=document.querySelector('input[type="password"]');p?.focus();return p?.id??null;});
      await page.evaluate(id=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(s)s.call(el,'');else el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));},pid);
      await page.type(`#${cssEscape(pid)}`,PASS,{delay:30}); await page.keyboard.press('Tab'); await waitIdle(page,5000);
      await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('input[type="submit"],button[type="submit"],a,button')).find(el=>el.offsetParent!==null&&/accedi|login/i.test(el.textContent+(el.value||'')));if(b)b.click();});
      await page.waitForNavigation({waitUntil:'networkidle2',timeout:20000}).catch(()=>{});
      log('Login OK');
    }

    // Apri cliente in edit
    await page.goto(`${URL}/CUSTTABLE_DetailView/55839/`,{waitUntil:'networkidle2',timeout:30000});
    await waitIdle(page,10000);
    await page.evaluate(()=>{const btn=Array.from(document.querySelectorAll('a,button')).filter(el=>el.offsetParent!==null).find(el=>/modif|edit/i.test(el.title??'')||/modif|edit/i.test(el.textContent?.trim()??''));btn?.click();});
    await page.waitForFunction(()=>window.location.href.includes('mode=Edit'),{timeout:10000,polling:300}).catch(()=>{});
    await waitIdle(page,10000);

    // Apri popup PAYMTERMID
    const paymBtnId = await page.evaluate(()=>
      Array.from(document.querySelectorAll('img')).find(el=>/PAYMTERMID.*_B0Img/.test(el.id||'')&&el.offsetParent!==null)?.id??null
    );
    await page.evaluate(id=>document.getElementById(id)?.click(), paymBtnId);
    let iframeFrame = null;
    for (let i=0; i<25; i++) { await wait(400); iframeFrame = page.frames().find(f=>f.url().includes('FindPopup')); if(iframeFrame)break; }
    if (!iframeFrame) throw new Error('Iframe non trovato');
    try { await iframeFrame.waitForFunction(()=>document.readyState==='complete',{timeout:6000}); } catch {}

    // Trova campo di ricerca e carica tutti i risultati con query vuota
    const si = await iframeFrame.waitForSelector('input[type="text"]',{timeout:6000});
    await si.click({clickCount:3});
    await si.press('Enter');
    await wait(3000);
    log('Query vuota inviata. Avvio scroll...');

    // ── VIRTUAL SCROLL: scorri fino in fondo, raccogli tutti i dati ────────
    const allTerms = new Map(); // key=code, value=description (dedup)

    let lastCount = 0;
    let noNewRowsStreak = 0;

    for (let scrollRound = 0; scrollRound < 50; scrollRound++) {
      // Leggi tutte le righe visibili (anche quelle fuori viewport nel DOM)
      const rows = await iframeFrame.evaluate(()=>{
        // DevExpress virtual scroll: le righe sono tutte nel DOM ma alcune potrebbero essere placeholder
        const allTrs = Array.from(document.querySelectorAll('tr'));
        return allTrs
          .filter(tr => {
            // Includi righe con classe dxgv o DXDataRow, anche se fuori viewport
            return (tr.classList.contains('dxgvDataRow_XafTheme') || tr.id.includes('DXDataRow')) &&
                   !tr.classList.contains('dxgvGroupRow_XafTheme') &&
                   !tr.classList.contains('dxgvEditingRow_XafTheme');
          })
          .map(r=>({
            rowId: r.id,
            cells: Array.from(r.querySelectorAll('td')).map(td=>td.textContent?.trim()||'').filter(Boolean)
          }))
          .filter(r=>r.cells.length>=2);
      });

      // Aggiungi nuovi termini
      rows.forEach(r => {
        const code = r.cells[0];
        const desc = r.cells[1] || '';
        if (code && !allTerms.has(code)) {
          allTerms.set(code, desc);
        }
      });

      const currentCount = allTerms.size;
      log(`Round ${scrollRound+1}: ${rows.length} righe DOM, ${currentCount} termini unici totali`);

      if (currentCount === lastCount) {
        noNewRowsStreak++;
        if (noNewRowsStreak >= 3) {
          log('3 rounds senza nuovi termini — scroll completato');
          break;
        }
      } else {
        noNewRowsStreak = 0;
        lastCount = currentCount;
      }

      // Scrolla verso il basso nella griglia dell'iframe
      await iframeFrame.evaluate(()=>{
        // Trova il container scrollabile della griglia
        const grid = document.querySelector('[class*="dxgvControl"],[class*="dxgv_"],.dxgvContainerDiv');
        const scrollTarget = grid?.querySelector('.dxgvContainerDiv,.dxgv_') || grid || document.documentElement;

        // Scorri all'ultima riga visibile
        const lastRow = Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme,tr[id*="DXDataRow"]')).pop();
        if (lastRow) {
          lastRow.scrollIntoView({ block: 'end', behavior: 'instant' });
        } else {
          // Fallback: scorri il body
          window.scrollTo(0, document.body.scrollHeight);
          document.documentElement.scrollTop = document.documentElement.scrollHeight;
        }

        // Anche: prova a scorrere qualsiasi elemento con overflow
        const scrollables = Array.from(document.querySelectorAll('*')).filter(el=>{
          const style = getComputedStyle(el);
          return (style.overflow==='auto'||style.overflow==='scroll'||style.overflowY==='auto'||style.overflowY==='scroll') && el.scrollHeight > el.clientHeight;
        });
        scrollables.forEach(el => { el.scrollTop = el.scrollHeight; });
      });

      await wait(1200); // aspetta virtual scroll load
    }

    // Chiudi dialog
    await page.keyboard.press('Escape');
    await waitIdle(page,3000);

    // Annulla form
    await page.evaluate(()=>{const btn=Array.from(document.querySelectorAll('a,button')).find(el=>el.offsetParent!==null&&/^annull/i.test(el.textContent?.trim()??'')&&/DXI[23]/.test(el.id??''));btn?.click();});
    await wait(2000);

    // Risultati finali
    const termsList = Array.from(allTerms.entries()).map(([code,description])=>({code,description}));
    termsList.sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));

    const result = {
      scraped_at: new Date().toISOString(),
      source: 'Archibald ERP PAYMTERMID dialog — virtual scroll',
      total: termsList.length,
      terms: termsList,
    };
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf8');

    log('\n══ RISULTATI FINALI ══');
    log(`Totale termini: ${termsList.length}`);
    log(`Salvati in: ${OUTPUT}`);
    termsList.forEach((t,i)=>log(`  [${i+1}] "${t.code}" — "${t.description}"`));

    // Verifica se 201 e 206 sono presenti
    const has201 = termsList.find(t=>t.code==='201');
    const has206 = termsList.find(t=>t.code==='206');
    log(`\n201 trovato: ${has201 ? '✅ '+has201.description : '❌ NO'}`);
    log(`206 trovato: ${has206 ? '✅ '+has206.description : '❌ NO'}`);

  } catch(err) { log('ERRORE: '+err); console.error(err); }
  finally {
    if (process.env.AUTO_CLOSE==='1') await browser.close();
    else { log('\n⚠️  Browser aperto. Ctrl+C.'); await new Promise(()=>{}); }
  }
}
main().catch(e=>{console.error(e);process.exit(1);});

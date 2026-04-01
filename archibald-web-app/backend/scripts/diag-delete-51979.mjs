import puppeteer from 'puppeteer';
const URL = 'https://4.231.124.90/Archibald';
const ARGS = ['--no-sandbox','--disable-setuid-sandbox','--disable-web-security','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-gpu','--disable-extensions','--no-zygote','--disable-accelerated-2d-canvas','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--memory-pressure-off','--js-flags=--max-old-space-size=512'];
const log = (t,m) => console.log(`[${new Date().toISOString().slice(11,23)}][${t}] ${m}`);
async function waitLoad(page,t=10000){await page.waitForFunction(()=>{const p=Array.from(document.querySelectorAll('[id*="LPV"],.dxlp,[id*="Loading"]'));return!p.some(el=>{const s=window.getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.getBoundingClientRect().width>0;});},{timeout:t,polling:200}).catch(()=>{});}
const br = await puppeteer.launch({headless:true,slowMo:50,ignoreHTTPSErrors:true,args:ARGS,defaultViewport:{width:1440,height:900}});
const pg = await br.newPage();
pg.setDefaultTimeout(30000);
await pg.setExtraHTTPHeaders({'Accept-Language':'it-IT,it;q=0.9'});
pg.on('console',m=>{if(m.text().includes('[D]'))log('BR',m.text());});
// login
await pg.goto(`${URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`,{waitUntil:'domcontentloaded',timeout:30000});
await pg.waitForSelector('input[type="text"]',{timeout:10000});
await pg.evaluate((u,p)=>{const el=Array.from(document.querySelectorAll('input[type="text"]')).find(i=>i.name?.includes('UserName'))||document.querySelector('input[type="text"]');const pw=document.querySelector('input[type="password"]');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;const set=(e,v)=>{e.focus();e.click();if(s)s.call(e,v);else e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};set(el,u);set(pw,p);Array.from(document.querySelectorAll('button,a')).find(b=>{const t=(b.textContent||'').toLowerCase().replace(/\s+/g,'');return t.includes('accedi')||(!b.id?.includes('logo')&&(b.id?.includes('login')||b.id?.includes('logon')));})?.click();},'ikiA0930','Fresis26@');
await pg.waitForFunction(()=>!window.location.href.includes('Login.aspx'),{timeout:30000});
await new Promise(r=>setTimeout(r,2000));
log('LOGIN',`OK → ${pg.url()}`);
// nav
await pg.goto(`${URL}/SALESTABLE_ListView_Agent/`,{waitUntil:'domcontentloaded',timeout:30000});
await pg.waitForFunction(()=>Array.from(document.querySelectorAll('span,button,a')).some(e=>{const t=e.textContent?.trim().toLowerCase()??'';return t==='nuovo'||t==='new';}),{timeout:15000});
await new Promise(r=>setTimeout(r,500));
// GotoPage(0)
await pg.evaluate(()=>{window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c=>{if(typeof c.GotoPage==='function')c.GotoPage(0);});});
await new Promise(r=>setTimeout(r,300));
// find row
const idx = await pg.evaluate(()=>{const rows=Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));for(let i=0;i<rows.length;i++){const cells=rows[i].querySelectorAll('td');const t=cells[2]?.textContent?.trim().replace(/\./g,'')?? '';if(t==='51979')return i;}return -1;});
log('FIND',`51979 → rowIndex=${idx}`);
if(idx===-1){log('ERROR','Non trovato');await br.close();process.exit(1);}
// select
await pg.evaluate(i=>{const c=window.ASPxClientControl?.GetControlCollection?.();c?.ForEachControl?.(x=>{if(typeof x.UnselectAllRowsOnPage==='function')x.UnselectAllRowsOnPage();});c?.ForEachControl?.(x=>{if(typeof x.SelectRowOnPage==='function')x.SelectRowOnPage(i);});},idx);
await new Promise(r=>setTimeout(r,800));
const sel=await pg.evaluate(()=>{let n=0,k=[];window.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.(c=>{if(typeof c.GetSelectedRowCount==='function'){n=c.GetSelectedRowCount();k=c.GetSelectedKeysOnPage?.()??[];}});return{n,k};});
log('SEL',`count=${sel.n} keys=${JSON.stringify(sel.k)}`);
// wait btn enabled
await pg.waitForFunction(()=>{const b=document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');return b&&!b.classList.contains('dxm-disabled');},{timeout:5000,polling:100}).catch(()=>log('BTN','TIMEOUT'));
const btnDis=await pg.evaluate(()=>{const b=document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');return b?.classList.contains('dxm-disabled')??true;});
log('BTN',`disabled=${btnDis}`);
// dialog handler BEFORE click
let handled=false;
const dp=new Promise(res=>{let done=false;const h=d=>{if(done)return;done=true;handled=true;log('DIALOG',`type=${d.type()} msg="${d.message()}"`);d.accept();log('DIALOG','Accepted ✓');res(true);};pg.once('dialog',h);setTimeout(()=>{if(!done){done=true;pg.off('dialog',h);log('DIALOG','TIMEOUT — nessun dialog in 10s');res(false);}},10000);});
// click
const cr=await pg.evaluate(()=>{const b=document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');if(b){console.log('[D] click disabled='+b.classList.contains('dxm-disabled'));b.click();return{ok:true};}return{ok:false};});
log('CLICK',`clicked=${cr.ok}`);
await dp;
log('RESULT',`dialogHandled=${handled}`);
await waitLoad(pg,10000);
await new Promise(r=>setTimeout(r,1000));
const gone=await pg.evaluate(()=>{return!Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]')).some(r=>(r.querySelectorAll('td')[2]?.textContent?.trim().replace(/\./g,'')?? '')==='51979');});
log('VERIFY',`ordine 51979 eliminato dall'ERP: ${gone}`);
await br.close();

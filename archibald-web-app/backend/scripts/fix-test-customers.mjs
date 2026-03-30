/**
 * Test diagnostico: monitora XHR e prova PerformCallback diretto
 * Solo su customers (3 colonne) per capire il meccanismo Apply
 */
import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: false, args: ['--ignore-certificate-errors','--no-sandbox'], defaultViewport: {width:1440,height:900} });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(40000);
  page.on('dialog', d => d.accept());

  // Monitora tutte le richieste POST
  const xhrLog = [];
  page.on('request', req => {
    if (req.method() === 'POST') {
      const url = req.url().replace(ARCHIBALD_URL, '');
      const body = req.postData()?.substring(0, 200) || '';
      xhrLog.push({ url, body });
    }
  });

  // Login
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u&&p)?{uid:u.id,pid:p.id}:null;
  });
  const fill = async (id,v) => {
    await page.evaluate((id,v) => { const el=document.getElementById(id); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set; if(s)s.call(el,v);else el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); },id,v);
    await page.keyboard.press('Tab');
  };
  await fill(fields.uid,'ikiA0930'); await fill(fields.pid,'Fresis26@');
  await page.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button,input[type=submit],a')).find(b=>/accedi|login/i.test((b.textContent||'').toLowerCase().trim())); if(b)b.click(); });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('Login OK');

  // Vai alla pagina
  await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);
  xhrLog.length = 0; // reset log

  // Open Column Chooser
  const hdr = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td');
  await hdr.click({ button: 'right' });
  await sleep(1200);
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.dxm-item')).find(el => /show customization dialog/i.test(el.textContent||''));
    if(item) item.click();
  });
  await sleep(2000);
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]')).filter(el => { const r=el.getBoundingClientRect(); return r.width>0&&r.height>0&&r.height<60; });
    const t = tabs.find(el => /^column.?chooser$/i.test(el.textContent?.trim()||''));
    if(t) t.click();
  });
  await sleep(1500);
  console.log('Column Chooser aperto');
  xhrLog.length = 0;

  // Clicca C3Chk5 (BUSRELTYPEID.TYPEID)
  console.log('\nClick C3Chk5...');
  await page.click('[id*="C3Chk5_D"], [id*="C3Chk5"]');
  await sleep(1000);
  console.log(`  XHR dopo click: ${xhrLog.length}`);
  xhrLog.forEach(x => console.log(`    POST ${x.url} — ${x.body}`));
  xhrLog.length = 0;

  // Controlla stato button
  const btnInfo = await page.evaluate(() => {
    const btn201 = document.querySelector('[id*="DXCDWindow_DXCBtn201"]');
    const btn21  = document.querySelector('[id*="DXCDWindow_DXCBtn21"]');
    const btn = btn201 || btn21;
    if (!btn) return { found: false };
    return {
      found: true, id: btn.id,
      disabled: btn.classList.contains('dxbDisabled_XafTheme'),
      hasHref: btn.href,
      dataArgs: btn.getAttribute('data-args'),
    };
  });
  console.log('\nApply button:', JSON.stringify(btnInfo));

  // Prova PerformCallback diretto
  console.log('\nProvo PerformCallback diretto...');
  const perfResult = await page.evaluate(() => {
    const w = window;
    const gn = Object.keys(w).find(k => { try { return w[k]?.PerformCallback && w[k]?.GetColumn; } catch { return false; } });
    if (!gn) return { ok: false, msg: 'grid non trovato' };
    const grid = w[gn];
    // Cerca il callback arg per Apply
    const btn = document.querySelector('[id*="DXCDWindow_DXCBtn201"]') || document.querySelector('[id*="DXCDWindow_DXCBtn21"]');
    const dataArgs = btn?.getAttribute('data-args') || "[['CustDialogApply'],0]";
    console.log('dataArgs:', dataArgs);
    // Prova a chiamare PerformCallback con il valore giusto
    try {
      grid.PerformCallback(dataArgs);
      return { ok: true, gridName: gn, dataArgs };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  });
  console.log('PerformCallback result:', JSON.stringify(perfResult));
  await sleep(3000);
  console.log(`  XHR dopo PerformCallback: ${xhrLog.length}`);
  xhrLog.forEach(x => console.log(`    POST ${x.url}\n    body: ${x.body.substring(0,300)}`));

  // Reload verifica
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1000);
  const verify = await page.evaluate(() => {
    const w=window; const gn=Object.keys(w).find(k=>{try{return w[k]?.GetColumn&&typeof w[k].GetColumn==='function';}catch{return false;}});
    if(!gn)return null;
    const grid=w[gn];
    for(let i=0;;i++){try{const c=grid.GetColumn(i);if(!c)break;if(c.fieldName==='BUSRELTYPEID.TYPEID')return{fn:c.fieldName,visible:c.visible};}catch{break;}}
    return null;
  });
  console.log('\nBUSRELTYPEID.TYPEID dopo reload:', JSON.stringify(verify));

  console.log('\nChiudi il browser manualmente per ispezionare.');
})();

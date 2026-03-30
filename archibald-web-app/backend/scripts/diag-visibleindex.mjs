import puppeteer from 'puppeteer';
const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--ignore-certificate-errors','--no-sandbox'], defaultViewport: {width:1440,height:900} });
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u && p) ? { uid: u.id, pid: p.id } : null;
  });
  const fill = async (id, v) => {
    await page.evaluate((id,v) => {
      const el = document.getElementById(id);
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
      if(s) s.call(el,v); else el.value=v;
      el.dispatchEvent(new Event('input',{bubbles:true}));
    }, id, v);
    await page.keyboard.press('Tab');
  };
  await fill(fields.uid, 'ikiA0930');
  await fill(fields.pid, 'Fresis26@');
  await page.evaluate(() => { const b=Array.from(document.querySelectorAll('button,input[type=submit],a')).find(b=>/accedi|login/i.test((b.textContent||'').toLowerCase().trim())); if(b)b.click(); });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('Login OK');

  const PAGES = {
    products: 'INVENTTABLE_ListView',
    prices: 'PRICEDISCTABLE_ListView',
  };

  for (const [name, slug] of Object.entries(PAGES)) {
    await page.goto(`${ARCHIBALD_URL}/${slug}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    const cols = await page.evaluate(() => {
      const w = window;
      const gn = Object.keys(w).find(k => { try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; } catch { return false; } });
      if (!gn) return [];
      const grid = w[gn];
      const out = [];
      for (let i=0; ; i++) {
        try {
          const col = grid.GetColumn(i);
          if (!col) break;
          // Dump raw properties
          const isHiddenByVisibleFalse = col.visible === false;
          const isHiddenByIndex = col.visibleIndex < 0 || col.visibleIndex === undefined;
          out.push({
            index: i,
            fn: col.fieldName || '(system)',
            visible: col.visible,
            visibleIndex: col.visibleIndex,
            hiddenByFalse: isHiddenByVisibleFalse,
            hiddenByIndex: isHiddenByIndex,
          });
        } catch { break; }
      }
      return out;
    });

    console.log(`\n=== ${name} (${cols.length} cols) ===`);
    // Mostra solo le colonne rilevanti
    const relevant = cols.filter(c => ['DATAAREAID','MODIFIEDDATETIME','TAXITEMGROUPID','ACCOUNTRELATIONID','MODIFIEDDATETIME'].includes(c.fn) || c.hiddenByFalse || c.hiddenByIndex);
    console.log('Cols where visible===false or visibleIndex<0:');
    relevant.slice(0, 30).forEach(c => console.log(`  ${JSON.stringify(c)}`));

    // Conta per tipologia
    const hidden_false = cols.filter(c => c.visible === false);
    const hidden_idx = cols.filter(c => c.visibleIndex < 0);
    const hidden_undef = cols.filter(c => c.visibleIndex === undefined || c.visibleIndex === null);
    console.log(`  hidden via visible===false: ${hidden_false.length}`);
    console.log(`  hidden via visibleIndex<0: ${hidden_idx.length}`);
    console.log(`  visibleIndex undefined/null: ${hidden_undef.length}`);
  }

  await browser.close();
  console.log('\nDone');
})();

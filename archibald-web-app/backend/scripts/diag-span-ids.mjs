/**
 * Trova la relazione tra XAF column index e eye span ID nel Column Chooser
 * Per ogni colonna hidden che vogliamo abilitare, trova lo span corretto
 */
import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Campi nascosti che vogliamo abilitare
const TARGETS = {
  customers: ['OURACCOUNTNUM', 'EXTERNALACCOUNTNUM', 'BUSRELTYPEID.TYPEID'],
  orders: ['EMAIL'],
  ddt: ['DLVCITY'],
  invoices: ['SALESID'],
};

async function login(page) {
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName') || i.name?.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u && p) ? { userId: u.id, passId: p.id } : null;
  });
  if (!fields) throw new Error('Login fields not found');
  const fill = async (id, val) => {
    await page.evaluate((id, v) => {
      const el = document.getElementById(id);
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (s) s.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, id, val);
    await page.keyboard.press('Tab');
  };
  await fill(fields.userId, 'ikiA0930');
  await fill(fields.passId, 'Fresis26@');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button,input[type='submit'],a")).find(btn => /accedi|login/i.test((btn.textContent||'').toLowerCase().trim()));
    if(b)b.click();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
}

async function getXafColumns(page) {
  return page.evaluate(() => {
    const w = window;
    const gn = Object.keys(w).find(k => { try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; } catch { return false; } });
    if (!gn) return [];
    const grid = w[gn];
    const cols = [];
    for (let i = 0; ; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        cols.push({ index: i, fieldName: col.fieldName || '', caption: col.caption || '', visible: col.visible !== false });
      } catch { break; }
    }
    return cols;
  });
}

async function openColumnChooserAndGetSpans(page) {
  // Right-click header
  const hdr = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td');
  await hdr.click({ button: 'right' });
  await sleep(1200);
  // Click Show Customization Dialog
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.dxm-item')).find(el => /show customization dialog/i.test(el.textContent||''));
    if(item) item.click();
  });
  await sleep(2000);
  // Click Column Chooser tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.width>0 && r.height>0 && r.height<60; });
    const t = tabs.find(el => /^column.?chooser$/i.test(el.textContent?.trim()||''));
    if(t) t.click();
  });
  await sleep(1500);
  
  // Get ALL eye spans with their IDs, class, and surrounding text
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span[class*="dxGridView_gvCOColumn"]'));
    return spans.map((span, orderIdx) => {
      const isHidden = /gvCOColumnHide/i.test(span.className);
      // Try to find text around it
      let text = '';
      let el = span;
      for (let i = 0; i < 8; i++) {
        el = el.parentElement;
        if (!el) break;
        const direct = Array.from(el.childNodes)
          .filter(n => n.nodeType === 3 && n.textContent?.trim().length > 0)
          .map(n => n.textContent.trim())
          .join(' ').trim();
        if (direct) { text = direct; break; }
        const sib = Array.from(el.children).find(c => {
          if (c.querySelector?.('span[class*="dxGridView_gvCOColumn"]')) return false;
          if ((c.className||'').includes('gvCD_CIP') || (c.className||'').includes('dxgvCD_CI')) return false;
          const t = c.textContent?.trim() || '';
          return t.length > 0 && t.length < 80;
        });
        if (sib) {
          text = Array.from(sib.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim() || sib.textContent.trim();
          if (text) break;
        }
      }
      return { orderIdx, id: span.id, isHidden, text };
    });
  });
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--ignore-certificate-errors', '--no-sandbox'], defaultViewport: { width: 1440, height: 900 } });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(40000);
  page.on('dialog', d => d.accept());
  
  await login(page);
  await sleep(1000);

  for (const [name, targets] of Object.entries(TARGETS)) {
    const url = {
      customers: 'CUSTTABLE_ListView_Agent',
      orders: 'SALESTABLE_ListView_Agent',
      ddt: 'CUSTPACKINGSLIPJOUR_ListView',
      invoices: 'CUSTINVOICEJOUR_ListView',
    }[name];
    
    console.log(`\n${'═'.repeat(50)}\nPAGE: ${name}`);
    await page.goto(`${ARCHIBALD_URL}/${url}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);
    
    const xafCols = await getXafColumns(page);
    
    // Trova gli indici dei target nel XAF
    console.log('\n  XAF target columns:');
    for (const fn of targets) {
      const col = xafCols.find(c => c.fieldName === fn);
      if (col) console.log(`    index=${col.index} fn="${fn}" visible=${col.visible}`);
      else console.log(`    ❌ "${fn}" not in XAF`);
    }
    
    // Apri Column Chooser e prendi gli span
    const spans = await openColumnChooserAndGetSpans(page);
    
    console.log(`\n  Column Chooser: ${spans.length} spans, ${spans.filter(s=>s.isHidden).length} hidden`);
    console.log('\n  Hidden spans:');
    for (const s of spans.filter(s => s.isHidden)) {
      console.log(`    orderIdx=${s.orderIdx} id="${s.id}" text="${s.text}"`);
    }
    
    // Mostra anche prime 10 visible per correlazione
    console.log('\n  First 10 visible spans:');
    for (const s of spans.filter(s => !s.isHidden).slice(0, 10)) {
      console.log(`    orderIdx=${s.orderIdx} id="${s.id}" text="${s.text}"`);
    }
    
    // Chiudi il dialog
    await page.evaluate(() => {
      const x = document.querySelector('[id*="DXCDWindow"] [id*="DXCBtn0"], .dxbButton_XafTheme[id*="DXCBtn0"]');
      if(x) x.click();
    });
    await sleep(1000);
  }
  
  await browser.close();
  console.log('\n✅ Done');
})();

/**
 * Diagnostico rapido: dump fieldName→caption per ogni pagina ERP
 * Trova le caption corrette per i campi mancanti nel wizard
 */
import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGES_URLS = {
  customers: `${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/`,
  orders:    `${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`,
  ddt:       `${ARCHIBALD_URL}/CUSTPACKINGSLIPJOUR_ListView/`,
  invoices:  `${ARCHIBALD_URL}/CUSTINVOICEJOUR_ListView/`,
  products:  `${ARCHIBALD_URL}/INVENTTABLE_ListView/`,
  prices:    `${ARCHIBALD_URL}/PRICEDISCTABLE_ListView/`,
};

// Campi che ci interessano per ogni pagina
const NEEDED = {
  customers: ['OURACCOUNTNUM', 'EXTERNALACCOUNTNUM', 'BUSRELTYPEID.TYPEID', 'SALESACT', 'SALESPREV', 'SALESPREV2', 'LASTORDERDATE', 'ORDERCOUNTACT', 'ORDERCOUNTPREV', 'ORDERCOUNTPREV2'],
  orders: ['EMAIL'],
  ddt: ['DLVCITY'],
  invoices: ['SALESID'],
  products: ['DATAAREAID', 'MODIFIEDDATETIME', 'TAXITEMGROUPID'],
  prices: ['DATAAREAID'],
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
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, id, val);
    await page.keyboard.press('Tab');
  };
  await fill(fields.userId, 'ikiA0930');
  await fill(fields.passId, 'Fresis26@');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button,input[type='submit'],a")).find(btn => /accedi|login/i.test((btn.textContent || btn.value || '').toLowerCase().trim()));
    if (b) b.click();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('✅ Login OK');
}

async function getColumns(page) {
  return page.evaluate(() => {
    const w = window;
    const gn = Object.keys(w).find(k => {
      try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; }
      catch { return false; }
    });
    if (!gn) return [];
    const grid = w[gn];
    const cols = [];
    let i = 0;
    while (true) {
      try {
        const col = grid.GetColumn(i++);
        if (!col) break;
        cols.push({ fieldName: col.fieldName || '', caption: col.caption || '', visible: col.visible !== false, visibleIndex: col.visibleIndex });
      } catch { break; }
    }
    return cols;
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(40000);
  page.on('dialog', d => d.accept());

  await login(page);
  await sleep(1000);

  for (const [name, url] of Object.entries(PAGES_URLS)) {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`PAGE: ${name}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    const cols = await getColumns(page);
    const needed = NEEDED[name] || [];

    // Prima mostra i campi cercati
    console.log(`\n  ► Campi cercati:`);
    for (const fn of needed) {
      const col = cols.find(c => c.fieldName === fn);
      if (col) {
        console.log(`    ${fn} → caption="${col.caption}" visible=${col.visible}`);
      } else {
        console.log(`    ${fn} → ❌ NON TROVATO nel grid`);
      }
    }

    // Poi mostra tutte le colonne non-visibili (hidden)
    const hidden = cols.filter(c => !c.visible && c.fieldName);
    if (hidden.length > 0) {
      console.log(`\n  ► Colonne NASCOSTE (${hidden.length}):`);
      for (const c of hidden.slice(0, 30)) {
        console.log(`    fieldName="${c.fieldName}" caption="${c.caption}"`);
      }
      if (hidden.length > 30) console.log(`    ... +${hidden.length - 30} altri`);
    }
  }

  await browser.close();
  console.log('\n✅ Diagnostico completato');
})();

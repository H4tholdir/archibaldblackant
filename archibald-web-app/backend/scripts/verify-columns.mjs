/**
 * Verifica la persistenza delle colonne dopo il wizard.
 * Ricarica ogni pagina in una nuova sessione e controlla la visibilità via XAF API.
 */
import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASSWORD = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CHECK_COLUMNS = [
  { name: 'customers', url: `${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/`, fields: ['BUSRELTYPEID.TYPEID', 'EXTERNALACCOUNTNUM', 'OURACCOUNTNUM'] },
  { name: 'orders',    url: `${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`, fields: ['EMAIL'] },
  { name: 'ddt',       url: `${ARCHIBALD_URL}/CUSTPACKINGSLIPJOUR_ListView/`, fields: ['DLVCITY', 'ID'] },
  { name: 'invoices',  url: `${ARCHIBALD_URL}/CUSTINVOICEJOUR_ListView/`, fields: ['SALESID'] },
  { name: 'products',  url: `${ARCHIBALD_URL}/INVENTTABLE_ListView/`, fields: ['BRASFIGURE', 'DATAAREAID', 'MODIFIEDDATETIME', 'TAXITEMGROUPID', 'ID', 'STOPPED'] },
  { name: 'prices',    url: `${ARCHIBALD_URL}/PRICEDISCTABLE_ListView/`, fields: ['DATAAREAID', 'MODIFIEDDATETIME'] },
];

async function checkPage(page, config) {
  await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  const results = await page.evaluate((fields) => {
    const gn = Object.keys(window).find(k => {
      try { return window[k]?.GetColumn && typeof window[k].GetColumn === 'function'; }
      catch { return false; }
    });
    if (!gn) return { error: 'no grid' };
    const grid = window[gn];
    const out = {};
    for (let i = 0; ; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        if (fields.includes(col.fieldName)) {
          out[col.fieldName] = { visible: col.visible !== false, raw: col.visible };
        }
      } catch { break; }
    }
    return out;
  }, config.fields);

  return results;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const page = await browser.newPage();

  // Login
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName') || i.name?.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u && p) ? { userId: u.id, passId: p.id } : null;
  });
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
  await fill(fields.userId, USERNAME);
  await fill(fields.passId, PASSWORD);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button,input[type='submit'],a")).find(btn => /accedi|login/i.test(btn.textContent || btn.id || ''));
    if (b) b.click();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('[login] OK');

  let allGood = true;
  for (const config of CHECK_COLUMNS) {
    const result = await checkPage(page, config);
    if (result.error) {
      console.log(`[${config.name}] ❌ ${result.error}`);
      allGood = false;
      continue;
    }
    const hidden = config.fields.filter(f => result[f] && !result[f].visible);
    const missing = config.fields.filter(f => !result[f]);
    const visible = config.fields.filter(f => result[f]?.visible);

    if (hidden.length === 0 && missing.length === 0) {
      console.log(`[${config.name}] ✅ Tutte visibili: ${visible.join(', ')}`);
    } else {
      allGood = false;
      if (hidden.length > 0) console.log(`[${config.name}] ❌ Ancora nascosti: ${hidden.join(', ')}`);
      if (missing.length > 0) console.log(`[${config.name}] ⚠️  Non trovati in grid: ${missing.join(', ')}`);
      if (visible.length > 0) console.log(`[${config.name}]    Visibili OK: ${visible.join(', ')}`);
    }
  }

  console.log('\n' + (allGood ? '✅ TUTTO OK — wizard ha persistito correttamente' : '❌ ALCUNE COLONNE ANCORA NASCOSTE'));
  await browser.close();
})();

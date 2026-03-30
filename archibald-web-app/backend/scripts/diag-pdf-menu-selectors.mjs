/**
 * Diagnostica i selettori del menu verticale ERP per il download PDF.
 * Naviga in ogni pagina e dumpa tutti i DXI* presenti con testo e stato.
 */
import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGES = [
  { name: 'Ordini',    url: `${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/` },
  { name: 'DDT',       url: `${ARCHIBALD_URL}/CUSTPACKINGSLIPJOUR_ListView/` },
  { name: 'Fatture',   url: `${ARCHIBALD_URL}/CUSTINVOICEJOUR_ListView/` },
  { name: 'Prezzi',    url: `${ARCHIBALD_URL}/PRICEDISCTABLE_ListView/` },
  { name: 'Prodotti',  url: `${ARCHIBALD_URL}/INVENTTABLE_ListView/` },
  { name: 'Clienti',   url: `${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/` },
];

async function login(page) {
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]'))
      .find(i => i.id.includes('UserName') || i.name?.includes('UserName'));
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
    const b = Array.from(document.querySelectorAll("button,input[type='submit'],a"))
      .find(btn => /accedi|login/i.test((btn.textContent || '').toLowerCase().trim()));
    if (b) b.click();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('Login OK');
}

async function dumpMenuItems(page) {
  return page.evaluate(() => {
    // Tutti gli <li> con id Vertical_mainMenu_Menu_DXI*
    const items = Array.from(document.querySelectorAll('li[id^="Vertical_mainMenu_Menu_DXI"]'));
    return items.map(li => {
      const anchor = li.querySelector('a[id$="_T"]');
      const span = li.querySelector('span.dxm-content') || anchor;
      const text = (anchor?.textContent || li.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      const disabled = li.classList.contains('dxm-disabled') || anchor?.classList.contains('dxm-disabled');
      return {
        id: li.id,
        anchorId: anchor?.id ?? null,
        text,
        disabled,
        visible: !!(li.offsetWidth || li.offsetHeight),
      };
    });
  });
}

async function waitForDevExpressReady(page) {
  await page.waitForFunction(
    () => {
      const body = document.body;
      return body && !body.classList.contains('dxfw-wait');
    },
    { timeout: 20000 },
  ).catch(() => {});
  await sleep(1500);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
    ignoreHTTPSErrors: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    await login(page);

    for (const { name, url } of PAGES) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Pagina: ${name}  (${url})`);
      console.log('='.repeat(60));

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForDevExpressReady(page);

      const items = await dumpMenuItems(page);

      if (items.length === 0) {
        console.log('  ⚠️  Nessun elemento DXI* trovato!');
        // Dump generico dei menu visibili
        const generic = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('li[id*="mainMenu"]')).map(li => ({
            id: li.id,
            text: li.textContent?.trim().slice(0, 60),
          }));
        });
        console.log('  Menu generici trovati:', JSON.stringify(generic, null, 2));
      } else {
        for (const item of items) {
          const status = item.disabled ? '🚫 DISABLED' : (item.visible ? '✅ visible' : '👁️ hidden');
          const exportHint = /esporta|export|pdf|excel|stampa|print/i.test(item.text) ? ' ◀️ EXPORT CANDIDATE' : '';
          console.log(`  ${item.id}  |  anchor: ${item.anchorId}  |  ${status}${exportHint}`);
          console.log(`    text: "${item.text}"`);
        }
      }
    }

    console.log('\n✅ Diagnostica completata');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Errore:', err);
  process.exit(1);
});

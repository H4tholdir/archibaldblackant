/**
 * diag-alt-addresses-option1.mjs
 *
 * Verifica se la navigazione Option 1 (no ?mode=View + domcontentloaded)
 * permette di leggere correttamente gli indirizzi alternativi del cliente.
 *
 * Test case: cliente 55.227 (Indelli Enrico) — ha 3 indirizzi alt. nell'ERP.
 *
 * Confronto tra i due approcci:
 *   CURRENT:  goto(...?mode=View, { waitUntil: 'networkidle2' })
 *   OPTION1:  goto(baseUrl,        { waitUntil: 'domcontentloaded' })
 *
 * Usage: node scripts/diag-alt-addresses-option1.mjs  (dalla dir backend)
 */

import puppeteer from 'puppeteer';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const CUSTOMER_ERP_ID = '55227'; // Indelli Enrico — 3 indirizzi alt. confermati

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForDevExpressIdle(page, { timeout = 8000 } = {}) {
  await page.waitForFunction(
    () => {
      const pending = window.ASPx?._pendingCallbacks;
      return !pending || pending === 0;
    },
    { timeout, polling: 200 }
  ).catch(() => {});
}

async function login(page) {
  console.log('[LOGIN] navigating...');
  const loginUrl = `${ERP_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
  await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

  // Trova i campi dinamicamente (come fa il bot reale)
  const fields = await page.evaluate(() => {
    const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
    const userInput = textInputs.find(i =>
      i.id.includes('UserName') || i.name?.includes('UserName') ||
      i.placeholder?.toLowerCase().includes('account') ||
      i.placeholder?.toLowerCase().includes('username')
    ) || textInputs[0];
    const passInput = document.querySelector('input[type="password"]');
    if (!userInput || !passInput) return null;
    return { userFieldId: userInput.id, passFieldId: passInput.id };
  });

  if (!fields) throw new Error('Campi login non trovati');
  console.log('[LOGIN] fields found:', fields);

  // Username via native setter (come fa il bot)
  await page.evaluate((fieldId, val) => {
    const input = document.getElementById(fieldId);
    if (!input) return;
    input.focus(); input.click();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, val); else input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, fields.userFieldId, USERNAME);
  await page.keyboard.press('Tab');
  await wait(300);

  // Password via page.type
  await page.focus('#' + fields.passFieldId.replace(/([.#[\]()])/g, '\\$1'));
  await page.type('#' + fields.passFieldId.replace(/([.#[\]()])/g, '\\$1'), PASSWORD, { delay: 30 });
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('[LOGIN] done →', page.url());
}

async function tryClickAltAddressTab(page) {
  // Stessa logica di openCustomerTab / TAB_ALIASES in archibald-bot.ts
  // "Indirizzo alt" → candidates: ["Indirizzo alt", "Alt. address", "Alt. Address", "Alternative address"]
  const candidates = ['Indirizzo alt', 'Alt. address', 'Alt. Address', 'Alternative address', 'Alt. addresses'];

  for (const text of candidates) {
    const result = await page.evaluate((text) => {
      const links = Array.from(document.querySelectorAll('a.dxtc-link, span.dx-vam'));
      for (const el of links) {
        const elText = el.textContent?.trim() || '';
        if (elText.includes(text)) {
          const clickTarget = el.tagName === 'A' ? el : el.parentElement;
          if (clickTarget && clickTarget.offsetParent !== null) {
            clickTarget.click();
            return { clicked: true, via: 'dxtc-link/dx-vam', label: elText };
          } else {
            // Esiste ma offsetParent null (hidden)
            return { clicked: false, foundButHidden: true, label: elText };
          }
        }
      }
      // Fallback: li[id*="_pg_AT"]
      const tabs = Array.from(document.querySelectorAll('li[id*="_pg_AT"]'));
      for (const tab of tabs) {
        const link = tab.querySelector('a.dxtc-link');
        const span = tab.querySelector('span.dx-vam');
        const tabLabel = span?.textContent?.trim() || '';
        if (tabLabel.includes(text) && link && link.offsetParent !== null) {
          link.click();
          return { clicked: true, via: 'li[pg_AT]', label: tabLabel };
        }
      }
      return null; // non trovato con questo candidate
    }, text);

    if (result) return { ...result, candidate: text };
  }
  return { clicked: false, reason: 'no candidate matched' };
}

async function readAddressesFromGrid(page) {
  return page.evaluate(() => {
    // Prova il selettore del bot
    const grid = document.querySelector('[id*="ADDRESSes"][class*="dxgvControl"]');
    if (!grid) {
      // Diagnostica avanzata: quali grids esistono nel DOM?
      const allGrids = Array.from(document.querySelectorAll('[class*="dxgvControl"]'))
        .map(el => ({ id: el.id, classes: el.className.split(' ').filter(c => c.includes('dxgv')) }));
      // Cerca qualsiasi elemento con "ADDRESSes" nell'id
      const addrEls = Array.from(document.querySelectorAll('[id*="ADDRESSes"]'))
        .map(el => ({ id: el.id, tag: el.tagName, classes: el.className?.substring(0, 80) }));
      return { gridFound: false, allGrids, addrEls };
    }

    const rows = Array.from(grid.querySelectorAll('[class*="dxgvDataRow_"]'));
    const addresses = rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td.dxgv:not([class*="dxgvCommandColumn"])'));
      const t = (i) => cells[i]?.textContent?.trim() || null;
      return { tipo: t(0), nome: t(1), via: t(2), cap: t(3), citta: t(4) };
    });
    return { gridFound: true, gridId: grid.id, rowCount: rows.length, addresses };
  });
}

async function testApproach(page, label, navigateFn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[TEST] ${label}`);
  console.log('='.repeat(60));

  await navigateFn();
  await waitForDevExpressIdle(page, { timeout: 8000 });

  const url = page.url();
  console.log('[NAV] URL dopo navigate:', url);

  // Controlla se il menu toolbar ha elementi (indicatore di rendering completo)
  const menuItems = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#Vertical_mainMenu_Menu li'))
      .map(el => el.textContent?.trim()).filter(Boolean)
  );
  console.log('[MENU] Vertical_mainMenu items:', menuItems.length > 0 ? menuItems : '⚠️ VUOTO');

  // Prova click tab
  const tabResult = await tryClickAltAddressTab(page);
  console.log('[TAB] Click result:', JSON.stringify(tabResult));

  if (tabResult.clicked) {
    await waitForDevExpressIdle(page, { timeout: 5000 });
    // Aspetta grid con lo stesso timeout del bot (12s)
    const gridAppeared = await page.waitForFunction(
      () => document.querySelector('[id*="ADDRESSes"][class*="dxgvControl"]') !== null,
      { timeout: 12000, polling: 300 }
    ).then(() => true).catch(() => false);

    console.log('[GRID] ADDRESSes grid appeared within 12s:', gridAppeared);
  }

  await wait(1000);
  const result = await readAddressesFromGrid(page);
  console.log('[RESULT]', JSON.stringify(result, null, 2));

  return result;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  try {
    await login(page);

    // TEST 1: approccio CORRENTE (buggato) — ?mode=View + networkidle2
    const currentResult = await testApproach(
      page,
      'CURRENT: ?mode=View + networkidle2',
      () => page.goto(
        `${ERP_URL}/CUSTTABLE_DetailView/${CUSTOMER_ERP_ID}/?mode=View`,
        { waitUntil: 'networkidle2', timeout: 60000 }
      )
    );

    await wait(2000);

    // TEST 2: OPTION 1 — URL base + domcontentloaded (come navigateToEditCustomerById step 1)
    const option1Result = await testApproach(
      page,
      'OPTION 1: URL base + domcontentloaded',
      () => page.goto(
        `${ERP_URL}/CUSTTABLE_DetailView/${CUSTOMER_ERP_ID}/`,
        { waitUntil: 'domcontentloaded', timeout: 30000 }
      )
    );

    console.log('\n' + '='.repeat(60));
    console.log('[SUMMARY]');
    console.log('  CURRENT  → addresses:', currentResult.addresses?.length ?? 'n/a', '(grid found:', currentResult.gridFound, ')');
    console.log('  OPTION 1 → addresses:', option1Result.addresses?.length ?? 'n/a', '(grid found:', option1Result.gridFound, ')');
    console.log('='.repeat(60));

  } catch (err) {
    console.error('[FATAL]', err);
  } finally {
    await browser.close();
  }
})();

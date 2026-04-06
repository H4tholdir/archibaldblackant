/**
 * Diagnostica lookup CAP iframe - testa cosa vede il bot dentro il popup
 * Usage: node diag-cap-lookup.mjs
 */

import puppeteer from 'puppeteer';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const CAP_TO_SEARCH = '84100';

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  ignoreHTTPSErrors: true,
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // --- Login ---
  console.log('1. Login...');
  await page.goto(`${ERP_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('input[id*="user"], input[type="text"]', { timeout: 10000 });

  const userInput = await page.$('input[id*="UserName"], input[name="UserName"]');
  const passInput = await page.$('input[id*="Password"], input[name="Password"]');
  if (userInput) await userInput.type(USERNAME, { delay: 50 });
  if (passInput) await passInput.type(PASSWORD, { delay: 50 });
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('   Login OK — URL:', page.url());

  // --- Apri form nuovo cliente ---
  console.log('2. Apri CUSTTABLE_ListView_Agent...');
  await page.goto(`${ERP_URL}/CUSTTABLE_ListView_Agent/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(2000);

  // Click "Nuovo"
  const nuovoBtn = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a, span, button'));
    const btn = els.find(el => el.textContent?.trim() === 'Nuovo' || el.textContent?.trim() === 'New');
    if (btn) { (btn).click(); return true; }
    return false;
  });
  console.log('   Nuovo clicked:', nuovoBtn);

  await page.waitForFunction(
    () => !window.location.href.includes('ListView'),
    { timeout: 15000 }
  );
  await wait(2000);
  console.log('   Form aperto — URL:', page.url());

  // --- Click tab Principale ---
  console.log('3. Click tab Principale...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('*'));
    const tab = tabs.find(el => el.textContent?.trim() === 'Principale' && (el).offsetParent !== null);
    if (tab) (tab).click();
  });
  await wait(2000);

  // --- Trova pulsante B0 del CAP e clicca ---
  console.log(`4. Cerca pulsante B0 per LOGISTICSADDRESSZIPCODE...`);
  const btnId = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('td, img, button, a, div'));
    const btn = all.find(el => /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/.test(el.id));
    if (btn) {
      console.log('FOUND btn id:', btn.id);
      (btn).scrollIntoView();
      (btn).click();
      return btn.id;
    }
    return null;
  });
  console.log('   B0 trovato:', btnId);

  if (!btnId) {
    console.log('   ERRORE: pulsante B0 non trovato! Dump id elementi visibili:');
    const ids = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[id*="LOGISTICS"]')).map(e => e.id)
    );
    console.log('   LOGISTICS ids:', ids);
    process.exit(1);
  }

  await wait(2000);

  // --- Controlla se popup/iframe aperto ---
  console.log('5. Controlla iframe nel popup...');
  const iframeInfo = await page.evaluate(() => {
    const visible = Array.from(document.querySelectorAll('iframe')).filter(f => {
      
      return el.offsetParent !== null && f.src;
    });
    return visible.map(f => ({ id: f.id, src: f.src.substring(0, 120) }));
  });
  console.log('   Iframe visibili:', JSON.stringify(iframeInfo, null, 2));

  if (iframeInfo.length === 0) {
    console.log('   Nessun iframe! Dump popup visibili:');
    const popups = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.dxpcLite, .dxpc-mainDiv, [id*="PopupWindow"]'))
        .filter(el => (el).offsetParent !== null)
        .map(el => ({ id: el.id, text: el.textContent?.substring(0, 200) }))
    );
    console.log('   Popups:', JSON.stringify(popups, null, 2));
    process.exit(1);
  }

  const iframeEl = await page.$(`#${iframeInfo[0].id}`);
  const frame = await iframeEl?.contentFrame();
  if (!frame) {
    console.log('   contentFrame() null!');
    process.exit(1);
  }

  // --- Aspetta che l'iframe sia pronto ---
  console.log('6. Attendo iframe pronto...');
  try {
    await frame.waitForFunction(
      () => document.readyState === 'complete',
      { timeout: 8000 }
    );
  } catch { console.log('   iframe non fully loaded, continuo...'); }
  await wait(500);

  // --- Dump stato iframe iniziale ---
  const initialState = await frame.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
      id: i.id, type: i.type, value: i.value, visible: i.offsetParent !== null
    }));
    const rows = document.querySelectorAll('tr').length;
    const bodyText = document.body?.innerText?.substring(0, 500) || '';
    const bodyHtml = document.body?.innerHTML?.substring(0, 1000) || '';
    return { inputs, rows, bodyText, bodyHtml };
  });
  console.log('   Stato iniziale iframe:');
  console.log('   - input:', JSON.stringify(initialState.inputs));
  console.log('   - righe tr:', initialState.rows);
  console.log('   - bodyText:', initialState.bodyText.substring(0, 300));

  // --- Trova campo di ricerca ---
  const searchInputId = await frame.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]'))
      .filter(i => i.offsetParent !== null);
    const found = inputs.find(i => /_DXSE_I$/.test(i.id) || /_DXFREditorcol0_I$/.test(i.id)) || inputs[0];
    if (!found) return null;
    found.focus();
    found.click();
    found.value = '';
    if (!found.id) found.id = '_diag_search_';
    return found.id;
  });
  console.log(`7. Search input id: ${searchInputId}`);

  if (!searchInputId) {
    console.log('   NESSUN input trovato nell\'iframe!');
    process.exit(1);
  }

  // --- Approccio 1: frame.type() ---
  console.log(`8. Tentativo frame.type("${CAP_TO_SEARCH}")...`);
  await frame.type(`#${searchInputId}`, CAP_TO_SEARCH, { delay: 100 });
  await wait(300);
  await page.keyboard.press('Enter');
  await wait(3000);

  const afterType = await frame.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
      id: i.id, value: i.value
    }));
    const rows = document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
    const allRows = document.querySelectorAll('tr').length;
    return { inputs, dataRows: rows, allRows, bodyText: document.body?.innerText?.substring(0, 500) };
  });
  console.log('   Dopo frame.type():');
  console.log('   - inputs:', JSON.stringify(afterType.inputs));
  console.log('   - data rows:', afterType.dataRows);
  console.log('   - all tr:', afterType.allRows);
  console.log('   - bodyText:', afterType.bodyText.substring(0, 300));

  // --- Approccio 2: setValue via JS + Enter ---
  console.log('9. Tentativo setValue JS + events...');
  const jsResult = await frame.evaluate((id, val) => {
    const input = document.getElementById(id);
    if (!input) return 'input not found';
    input.focus();
    input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
    return 'ok';
  }, searchInputId, CAP_TO_SEARCH);
  console.log('   JS dispatch result:', jsResult);
  await wait(5000);

  const afterJs = await frame.evaluate(() => ({
    dataRows: document.querySelectorAll('tr[class*="dxgvDataRow"]').length,
    allRows: document.querySelectorAll('tr').length,
    bodyText: document.body?.innerText?.substring(0, 500)
  }));
  console.log('   Dopo JS dispatch:');
  console.log('   - data rows:', afterJs.dataRows);
  console.log('   - all tr:', afterJs.allRows);
  console.log('   - bodyText:', afterJs.bodyText.substring(0, 300));

  // --- Screenshot ---
  await page.screenshot({ path: '/tmp/diag-cap-popup.png', fullPage: false });
  console.log('   Screenshot: /tmp/diag-cap-popup.png');

  // --- DevExpress API ---
  console.log('10. Controlla DevExpress API nell\'iframe...');
  const dxApi = await frame.evaluate(() => {
    const w = window;
    const col = w.ASPxClientControl?.GetControlCollection?.();
    if (!col) return { hasCol: false };
    const controls = [];
    col.ForEachControl((c) => {
      try { controls.push(c.name || c.constructor?.name || 'unknown'); } catch {}
    });
    return { hasCol: true, controls };
  });
  console.log('   DX API:', JSON.stringify(dxApi));

} finally {
  await browser.close();
  console.log('\nDone.');
}

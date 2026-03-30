/**
 * Diagnostico approfondito prodotti:
 * 1. Colonne visibili vs nascoste nel Column Chooser
 * 2. Menu "Esportare in" — opzioni disponibili
 * 3. Verifica dati completi prima riga
 */
import puppeteer from 'puppeteer';
import fs from 'fs';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const PRODUCTS_URL = `${ERP_URL}/INVENTTABLE_ListView/`;
const SCREENSHOT_DIR = '/tmp/diag-products';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function waitIdle(page, timeout = 8000) {
  await page.waitForFunction(
    () => !document.querySelector('.dxgv-loadingPanel') && !document.querySelector('.dxss-loading'),
    { timeout }
  ).catch(() => {});
  await new Promise(r => setTimeout(r, 500));
}

async function setValue(page, fieldId, val) {
  await page.evaluate((id, v) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, v); else input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, fieldId, val);
}

async function login(page) {
  console.log('→ Login...');
  const loginUrl = `${ERP_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
  await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
    const userInput = textInputs.find(i => i.id.includes('UserName') || i.name.includes('UserName')) || textInputs[0];
    const passInput = document.querySelector('input[type="password"]');
    if (!userInput || !passInput) return null;
    return { userFieldId: userInput.id, passFieldId: passInput.id };
  });
  if (!fields) throw new Error('Campi login non trovati');
  await setValue(page, fields.userFieldId, USERNAME);
  await page.keyboard.press('Tab');
  await new Promise(r => setTimeout(r, 300));
  await setValue(page, fields.passFieldId, PASSWORD);
  await page.keyboard.press('Tab');
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button, input[type='submit'], a"));
    const btn = btns.find(b => (b.textContent || b.value || '').toLowerCase().match(/login|accedi|sign in/));
    if (btn) btn.click();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  if (page.url().includes('Login.aspx')) throw new Error('Login fallito');
  console.log('✓ Login OK');
}

async function run() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    await login(page);
    await page.goto(PRODUCTS_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitIdle(page);

    // ── 1. Trova tutti i td con stili display:none (colonne nascoste nel DOM) ──
    console.log('\n── ANALISI COLONNE NASCOSTE ──');
    const hiddenHeaders = await page.evaluate(() => {
      const allTh = document.querySelectorAll('td.dxgvHeader_XafTheme');
      return Array.from(allTh).map((th, i) => ({
        idx: i,
        text: th.innerText?.trim(),
        visible: th.offsetWidth > 0,
        width: th.offsetWidth,
        display: window.getComputedStyle(th).display,
      }));
    });
    console.log('Tutte le colonne header:');
    hiddenHeaders.forEach(h =>
      console.log(`  [${h.idx}] ${h.visible ? '✅' : '❌'} w=${h.width} "${h.text}"`)
    );

    // ── 2. Prima riga completa — anche celle nascoste ──
    console.log('\n── PRIMA RIGA DATI (tutte le celle) ──');
    const firstRowFull = await page.evaluate(() => {
      const row = document.querySelector('tr.dxgvDataRow_XafTheme');
      if (!row) return null;
      return Array.from(row.querySelectorAll('td')).map((td, i) => ({
        idx: i,
        text: td.innerText?.trim(),
        visible: td.offsetWidth > 0,
        width: td.offsetWidth,
      }));
    });
    if (firstRowFull) {
      console.log(`Celle totali nella prima riga: ${firstRowFull.length}`);
      firstRowFull.forEach(c =>
        console.log(`  [${c.idx}] ${c.visible ? '✅' : '❌'} w=${c.width} "${c.text}"`)
      );
    }

    // ── 3. Click "Esportare in" button (nel toolbar, non nel menu laterale) ──
    console.log('\n── MENU ESPORTARE IN ──');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10-before-export-click.png` });

    // Il bottone è nel toolbar in alto
    const exportClicked = await page.evaluate(() => {
      // Cerca sia nel menu verticale che come bottone diretto
      const allLinks = Array.from(document.querySelectorAll('a, button, li, div[role="button"]'));
      const exportBtn = allLinks.find(el => {
        const t = el.innerText?.trim() || el.textContent?.trim() || '';
        return t.toLowerCase().includes('esportare') || t.toLowerCase().includes('export');
      });
      if (exportBtn) {
        console.log('Found export element:', exportBtn.tagName, exportBtn.id, exportBtn.className);
        exportBtn.click();
        return { found: true, tag: exportBtn.tagName, id: exportBtn.id, text: exportBtn.innerText?.trim() };
      }
      return { found: false };
    });
    console.log('Export button:', exportClicked);
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11-export-menu.png` });

    // Leggi le voci del submenu
    const exportOptions = await page.evaluate(() => {
      // Cerca voci visibili dopo il click
      const allVisible = Array.from(document.querySelectorAll('*')).filter(el => {
        if (el.offsetParent === null) return false;
        const t = el.innerText?.trim() || '';
        return t.length > 0 && t.length < 50 && !t.includes('\n');
      });
      // Filtra per elementi che sembrano voci di menu export
      return allVisible
        .filter(el => {
          const t = el.innerText?.trim().toLowerCase() || '';
          return t.includes('pdf') || t.includes('excel') || t.includes('csv') || t.includes('rtf') || t.includes('xlsx') || t.includes('xls');
        })
        .map(el => ({ tag: el.tagName, id: el.id, text: el.innerText?.trim() }));
    });
    console.log('Export options disponibili:', exportOptions);

    // Screenshot largo per vedere tutte le colonne
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));
    await page.setViewport({ width: 2560, height: 900 });
    await page.goto(PRODUCTS_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitIdle(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/12-wide-view.png`, fullPage: false });
    console.log('Screenshot wide (2560px) salvato');

    // ── 4. Conta totale prodotti ──
    const totalProducts = await page.evaluate(() => {
      const info = document.querySelector('[id*="StatusBar"], [class*="StatusBar"], [id*="statusBar"]');
      if (info) return info.innerText?.trim();
      // cerca testo con numero totale
      const allText = Array.from(document.querySelectorAll('*'))
        .map(el => el.childNodes)
        .reduce((a, b) => [...a, ...b], [])
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent?.trim())
        .filter(t => t && /\d{3,}/.test(t) && t.length < 30);
      return allText[0] || 'N/D';
    });
    console.log('\n► Totale prodotti stimato:', totalProducts);

    console.log('\nScreenshot salvati in', SCREENSHOT_DIR);
    await new Promise(r => setTimeout(r, 30000));

  } catch (err) {
    console.error('ERRORE:', err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/99-error2.png` });
  }

  await browser.close();
}

run().catch(console.error);

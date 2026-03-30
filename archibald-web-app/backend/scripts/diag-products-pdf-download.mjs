/**
 * Diagnostico export PDF prodotti:
 * 1. Apre menu "Esportare in" e vede le opzioni
 * 2. Scarica il PDF e controlla struttura/pagine
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const PRODUCTS_URL = `${ERP_URL}/INVENTTABLE_ListView/`;
const SCREENSHOT_DIR = '/tmp/diag-products';
const PDF_PATH = '/tmp/diag-products/products-export.pdf';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function waitIdle(page, timeout = 10000) {
  await page.waitForFunction(
    () => !document.querySelector('.dxgv-loadingPanel') && !document.querySelector('.dxss-loading'),
    { timeout }
  ).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
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
    // Abilita download
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  // Configura download directory
  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: SCREENSHOT_DIR,
  });

  try {
    await login(page);
    await page.goto(PRODUCTS_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitIdle(page);
    console.log('✓ Pagina prodotti caricata');

    // ── 1. Hover + click sul bottone "Esportare in" nel toolbar ──
    console.log('\n→ Cerco il bottone "Esportare in"...');

    // Trova il bottone "Esportare in" nel toolbar (è un <a> o <button> con testo)
    const exportBtnInfo = await page.evaluate(() => {
      // Cerca nel toolbar in alto a destra
      const allEls = Array.from(document.querySelectorAll('a, button, li, span'));
      const btn = allEls.find(el => {
        const t = (el.innerText || '').trim();
        return t === 'Esportare in' || t.includes('Esportare in');
      });
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return {
        id: btn.id,
        tag: btn.tagName,
        text: btn.innerText?.trim(),
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        className: btn.className,
      };
    });
    console.log('Export button info:', exportBtnInfo);

    if (!exportBtnInfo) {
      throw new Error('Bottone Esportare in non trovato');
    }

    // Hover e screenshot prima del click
    await page.mouse.move(exportBtnInfo.x, exportBtnInfo.y);
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: `${SCREENSHOT_DIR}/20-hover-export.png` });

    // Click
    await page.mouse.click(exportBtnInfo.x, exportBtnInfo.y);
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${SCREENSHOT_DIR}/21-after-click-export.png` });
    console.log('Screenshot dopo click export salvato');

    // ── 2. Leggi le voci del submenu (ora dovrebbe essere aperto) ──
    const menuOptions = await page.evaluate(() => {
      // Cerca elementi visibili nel popup/dropdown del menu
      const popups = document.querySelectorAll('[class*="dxm-popup"], [class*="dxm-list"], [id*="DXPopupControl"], .dx-popup-content');
      const results = [];

      // Cerca tutti gli elementi visibili con testo breve
      const allEls = Array.from(document.querySelectorAll('*'));
      for (const el of allEls) {
        if (el.offsetParent === null && el.offsetWidth === 0) continue;
        const t = el.innerText?.trim();
        if (!t || t.length > 60 || t.includes('\n')) continue;
        if (el.children.length > 2) continue; // skip container elements
        const rect = el.getBoundingClientRect();
        // Cerca elementi nella zona del menu (di solito a destra, nella metà superiore)
        if (rect.x > 800 && rect.y < 400 && rect.width > 30 && rect.width < 300) {
          results.push({
            tag: el.tagName,
            id: el.id,
            text: t,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            className: el.className?.substring(0, 50),
          });
        }
      }
      return results;
    });
    console.log('\nVoci menu visibili (zona destra/alto):');
    menuOptions.forEach(m => console.log(`  [${m.x},${m.y}] ${m.tag} "${m.text}" (${m.className})`));

    // ── 3. Screenshot ampio del menu aperto ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/22-menu-open-full.png`, fullPage: false });

    // Cerca specificamente PDF nel DOM
    const pdfOption = await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('*'));
      const pdf = allEls.find(el => {
        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
        return (t === 'pdf' || t.includes('pdf')) && el.offsetWidth > 0;
      });
      if (!pdf) return null;
      const rect = pdf.getBoundingClientRect();
      return { tag: pdf.tagName, id: pdf.id, text: pdf.innerText?.trim(), x: rect.x, y: rect.y };
    });
    console.log('\nOpzione PDF trovata:', pdfOption);

    if (pdfOption) {
      // ── 4. Aspetta download PDF ──
      console.log('\n→ Clicco su PDF...');

      // Registra richiesta di download
      let downloadStarted = false;
      page.on('response', response => {
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('pdf') || response.url().includes('.pdf')) {
          console.log('PDF response detected:', response.url(), ct);
          downloadStarted = true;
        }
      });

      await page.mouse.click(pdfOption.x + pdfOption.width / 2 || pdfOption.x, pdfOption.y);
      console.log('Click su PDF eseguito, aspetto download...');

      // Aspetta che il file appaia
      await new Promise(r => setTimeout(r, 3000));
      await page.screenshot({ path: `${SCREENSHOT_DIR}/23-after-pdf-click.png` });

      // Controlla file scaricati
      const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.pdf'));
      console.log('File PDF scaricati:', files);

      if (files.length > 0) {
        const pdfFile = path.join(SCREENSHOT_DIR, files[0]);
        const stats = fs.statSync(pdfFile);
        console.log(`\n► PDF scaricato: ${files[0]}`);
        console.log(`  Dimensione: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Path: ${pdfFile}`);
      }
    } else {
      console.log('\n⚠ Opzione PDF non trovata nel menu');
      // Screenshot completo per debug
      await page.screenshot({ path: `${SCREENSHOT_DIR}/23-no-pdf-debug.png`, fullPage: true });
    }

  } catch (err) {
    console.error('\nERRORE:', err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/99-error3.png` });
  }

  console.log('\nScreenshot salvati in', SCREENSHOT_DIR);
  await new Promise(r => setTimeout(r, 20000));
  await browser.close();
}

run().catch(console.error);

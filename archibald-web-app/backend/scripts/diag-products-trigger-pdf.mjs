/**
 * Scarica il PDF prodotti cliccando il selettore usato dal bot reale
 * e usa pdfplumber per contare pagine e colonne
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import { spawnSync } from 'child_process';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const PRODUCTS_URL = `${ERP_URL}/INVENTTABLE_ListView/`;
const DOWNLOAD_DIR = '/tmp/diag-products';

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

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

function analyzePdf(pdfPath) {
  const script = `
import pdfplumber, json, sys
with pdfplumber.open(sys.argv[1]) as pdf:
    info = {'total_pages': len(pdf.pages), 'pages': []}
    for i, page in enumerate(pdf.pages[:5]):
        tables = page.extract_tables()
        headers = []
        rows = 0
        if tables and tables[0]:
            headers = [str(h or '').strip() for h in tables[0][0]]
            rows = len(tables[0]) - 1
        info['pages'].append({'page': i+1, 'headers': headers, 'data_rows': rows})
    print(json.dumps(info, ensure_ascii=False))
`;
  const result = spawnSync('python3', ['-c', script, pdfPath], { encoding: 'utf8', timeout: 30000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

async function run() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_DIR,
  });

  try {
    await login(page);
    await page.goto(PRODUCTS_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitIdle(page);
    await new Promise(r => setTimeout(r, 2000));
    console.log('✓ Pagina prodotti pronta');

    // Verifica selettori
    const containerOk = await page.$('#Vertical_mainMenu_Menu_DXI3_');
    const textLinkOk = await page.$('#Vertical_mainMenu_Menu_DXI3_T');
    console.log('Container DXI3_:', !!containerOk);
    console.log('Text link DXI3_T:', !!textLinkOk);

    // Tutti gli ID con DXI nel menu (per debug)
    const allMenuIds = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[id*="mainMenu_Menu_DXI"]'))
        .map(el => ({ id: el.id, text: el.innerText?.trim().substring(0, 30), visible: el.offsetWidth > 0 }))
    );
    console.log('\nMenu items:', JSON.stringify(allMenuIds, null, 2));

    // Registra PDF downloads
    page.on('response', response => {
      const ct = response.headers()['content-type'] || '';
      if (ct.includes('pdf') || ct.includes('octet-stream')) {
        console.log(`\n► Response PDF/binary: ${response.url().substring(0, 80)} [${ct}]`);
      }
    });

    // Rimuovi PDF esistenti prima del download
    fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.pdf')).forEach(f =>
      fs.unlinkSync(`${DOWNLOAD_DIR}/${f}`)
    );

    console.log('\n→ Triggero download PDF...');
    await page.waitForSelector('#Vertical_mainMenu_Menu_DXI3_', { timeout: 5000 });

    // Click come fa il bot
    await page.evaluate(() => {
      const el = document.getElementById('Vertical_mainMenu_Menu_DXI3_T')
               || document.getElementById('Vertical_mainMenu_Menu_DXI3_');
      if (el) el.click();
    });

    console.log('Click eseguito. Aspetto file PDF (max 5 min)...');
    const startWait = Date.now();
    let pdfFile = null;

    while (Date.now() - startWait < 300000) {
      const files = fs.readdirSync(DOWNLOAD_DIR)
        .filter(f => f.toLowerCase().endsWith('.pdf'));
      if (files.length > 0) {
        pdfFile = files[0];
        break;
      }
      await new Promise(r => setTimeout(r, 3000));
      const elapsed = Math.round((Date.now() - startWait) / 1000);
      process.stdout.write(`\r  Attendo... ${elapsed}s`);
    }
    console.log('');

    if (pdfFile) {
      const fullPath = `${DOWNLOAD_DIR}/${pdfFile}`;
      const sizeMB = (fs.statSync(fullPath).size / 1024 / 1024).toFixed(2);
      console.log(`\n✅ PDF: ${pdfFile} (${sizeMB} MB)`);

      console.log('\n→ Analisi struttura PDF...');
      const info = analyzePdf(fullPath);
      console.log(`\n► Totale pagine: ${info.total_pages}`);
      info.pages.forEach(p => {
        console.log(`\n  Pagina ${p.page} — ${p.data_rows} righe dati`);
        console.log(`  Header: ${JSON.stringify(p.headers)}`);
      });

      // Calcola cycle size stimato
      const cycleSize = info.total_pages > 0 ? Math.round(info.total_pages / 4541 * 5) || '?' : '?';
      console.log(`\n► Stima cycle size: ~${info.total_pages} pagine totali per ~4540 prodotti`);
      if (info.total_pages > 0) {
        const cs = Math.round(info.total_pages / 4541);
        console.log(`  Cycle size stimato: ${cs === 0 ? info.total_pages : cs} pagine/prodotto`);
      }
    } else {
      console.log('\n⚠ Nessun PDF scaricato entro 5 minuti');
      await page.screenshot({ path: `${DOWNLOAD_DIR}/31-no-pdf.png` });
    }

  } catch (err) {
    console.error('\nERRORE:', err.message);
    await page.screenshot({ path: `${DOWNLOAD_DIR}/99-error4.png` });
  }

  await browser.close();
}

run().catch(console.error);

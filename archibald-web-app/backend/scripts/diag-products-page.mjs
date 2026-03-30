/**
 * Diagnostico INVENTTABLE_ListView
 * - Colonne visibili nella griglia (via GetColumn API)
 * - Quante righe DOM sono presenti
 * - Opzioni export PDF disponibili
 * - Struttura prima pagina del PDF (se avviato)
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

  // Trova campi dinamicamente come fa il bot
  const fields = await page.evaluate(() => {
    const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
    const userInput = textInputs.find(i =>
      i.id.includes('UserName') || i.name.includes('UserName') ||
      (i.placeholder || '').toLowerCase().includes('account')
    ) || textInputs[0];
    const passInput = document.querySelector('input[type="password"]');
    if (!userInput || !passInput) return null;
    return { userFieldId: userInput.id, passFieldId: passInput.id };
  });

  if (!fields) throw new Error('Campi login non trovati');
  console.log('Fields trovati:', fields);

  await setValue(page, fields.userFieldId, USERNAME);
  await page.keyboard.press('Tab');
  await new Promise(r => setTimeout(r, 500));
  await setValue(page, fields.passFieldId, PASSWORD);
  await page.keyboard.press('Tab');
  await new Promise(r => setTimeout(r, 500));

  // Clicca il bottone login
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button, input[type='submit'], a, div[role='button']"));
    const btn = btns.find(b => {
      const t = (b.textContent || b.value || '').toLowerCase();
      return t.includes('login') || t.includes('accedi') || t.includes('sign in');
    });
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('Button clicked:', clicked);

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  const url = page.url();
  if (url.includes('Login.aspx')) throw new Error('Login fallito — ancora sulla pagina login');
  console.log('✓ Login OK — URL:', url);
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

    // ── 1. Naviga alla ListView prodotti ──
    console.log('\n→ Navigo a INVENTTABLE_ListView...');
    await page.goto(PRODUCTS_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitIdle(page);
    await new Promise(r => setTimeout(r, 2000));

    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-products-initial.png`, fullPage: false });
    console.log('Screenshot 01 salvato');

    // ── 2. GotoPage(0) obbligatorio ──
    const gridId = await page.evaluate(() => {
      const grid = document.querySelector('[id$="_LE_v4"]');
      return grid ? grid.id : null;
    });
    console.log('Grid ID:', gridId);

    if (gridId) {
      const gridName = gridId.replace('_LE_v4', '');
      await page.evaluate((name) => {
        if (typeof ASPx !== 'undefined') {
          const g = ASPx.GetControlCollection().GetByName(name + '_LE_v4');
          if (g) g.GotoPage(0);
        }
      }, gridName);
      await waitIdle(page);
      await new Promise(r => setTimeout(r, 1000));
    }

    // ── 3. Conta righe DOM ──
    const rowCount = await page.evaluate(() => {
      return document.querySelectorAll('tr.dxgvDataRow_XafTheme').length;
    });
    console.log(`\n► Righe DOM visibili: ${rowCount}`);

    // ── 4. Page size → 200 ──
    console.log('\n→ Setto page size a 200...');
    const pagerId = await page.evaluate(() => {
      const pager = document.querySelector('[id*="PagerTop"]');
      return pager ? pager.id : null;
    });
    console.log('Pager ID:', pagerId);

    if (pagerId) {
      const psInput = await page.$(`#${pagerId} input[id*="PSI"]`);
      if (psInput) {
        await psInput.click({ clickCount: 3 });
        await page.keyboard.type('200');
        await page.evaluate((pid) => {
          const input = document.querySelector(`#${pid} input[id*="PSI"]`);
          if (input) ASPx.POnPageSizeBlur(pid.replace('_PagerTop', ''), new Event('blur'));
        }, pagerId);
        await waitIdle(page);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const rowCount200 = await page.evaluate(() => {
      return document.querySelectorAll('tr.dxgvDataRow_XafTheme').length;
    });
    console.log(`► Righe DOM dopo page size 200: ${rowCount200}`);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-products-ps200.png`, fullPage: false });

    // ── 5. Colonne visibili tramite GetColumn API ──
    console.log('\n→ Leggo colonne visibili...');
    const columns = await page.evaluate(() => {
      const results = [];
      try {
        const grids = ASPx.GetControlCollection();
        for (const key of Object.keys(grids)) {
          const ctrl = grids[key];
          if (ctrl && ctrl.GetColumn && ctrl.GetColumnCount) {
            const count = ctrl.GetColumnCount();
            if (count > 5) {
              for (let i = 0; i < count; i++) {
                const col = ctrl.GetColumn(i);
                if (col) results.push({ idx: i, fieldName: col.fieldName || col.name, caption: col.caption || '' });
              }
              break;
            }
          }
        }
      } catch (e) {
        return [{ error: e.message }];
      }
      return results;
    });
    console.log(`► Colonne trovate: ${columns.length}`);
    columns.forEach(c => console.log(`  [${c.idx}] ${c.fieldName} — "${c.caption}"`));

    // ── 6. Colonne HTML DOM (th header cells) ──
    console.log('\n→ Leggo header cells DOM...');
    const headers = await page.evaluate(() => {
      const ths = document.querySelectorAll('td.dxgvHeader_XafTheme');
      return Array.from(ths).map((th, i) => ({ idx: i, text: th.innerText?.trim() }));
    });
    console.log(`► Header DOM cells: ${headers.length}`);
    headers.forEach(h => console.log(`  [${h.idx}] "${h.text}"`));

    // ── 7. Prima riga dati (se presenti) ──
    if (rowCount200 > 0) {
      console.log('\n→ Prima riga dati...');
      const firstRow = await page.evaluate(() => {
        const row = document.querySelector('tr.dxgvDataRow_XafTheme');
        if (!row) return null;
        const cells = Array.from(row.querySelectorAll('td'));
        return cells.map((td, i) => ({ idx: i, text: td.innerText?.trim() }));
      });
      if (firstRow) {
        console.log(`► Celle nella prima riga: ${firstRow.length}`);
        firstRow.forEach(c => console.log(`  [${c.idx}] "${c.text}"`));
      }
    }

    // ── 8. Cerca il menu Export ──
    console.log('\n→ Cerco menu Export...');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-before-export.png`, fullPage: false });

    // Cerca il main menu
    const menuItems = await page.evaluate(() => {
      const items = document.querySelectorAll('li[id*="mainMenu_Menu_DXI"], li[id*="Vertical_mainMenu_Menu_DXI"]');
      return Array.from(items).map(li => ({ id: li.id, text: li.innerText?.trim().split('\n')[0] }));
    });
    console.log(`► Menu items trovati: ${menuItems.length}`);
    menuItems.forEach(m => console.log(`  ${m.id}: "${m.text}"`));

    // Clicca su Export (di solito DXI3 o DXI4)
    const exportMenu = menuItems.find(m => m.text.toLowerCase().includes('export') || m.id.includes('DXI3') || m.id.includes('DXI4'));
    if (exportMenu) {
      console.log(`\n→ Clicco su "${exportMenu.text}" (${exportMenu.id})...`);
      await page.click(`#${exportMenu.id}`);
      await new Promise(r => setTimeout(r, 1500));
      await page.screenshot({ path: `${SCREENSHOT_DIR}/04-export-menu-open.png`, fullPage: false });

      // Leggi le opzioni del sottomenu
      const subItems = await page.evaluate(() => {
        const items = document.querySelectorAll('li[id*="mainMenu_Menu_DXI3_"], li[id*="mainMenu_Menu_DXI4_"], li[id*="Vertical_mainMenu"]');
        return Array.from(items)
          .filter(li => li.offsetParent !== null)
          .map(li => ({ id: li.id, text: li.innerText?.trim() }));
      });
      console.log(`► Sottomenu Export items: ${subItems.length}`);
      subItems.forEach(s => console.log(`  ${s.id}: "${s.text}"`));
    } else {
      console.log('► Menu Export non trovato');
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-final.png`, fullPage: true });

    // ── 9. Totale prodotti dalla pager ──
    const totalText = await page.evaluate(() => {
      const pager = document.querySelector('[id*="PagerTop"]');
      return pager ? pager.innerText?.trim() : 'N/D';
    });
    console.log('\n► Pager text:', totalText);

  } catch (err) {
    console.error('ERRORE:', err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/99-error.png`, fullPage: false });
  }

  console.log(`\nScreenshot salvati in ${SCREENSHOT_DIR}`);
  console.log('Premi CTRL+C per chiudere il browser...');
  // Non chiudo il browser automaticamente per ispezione manuale
  await new Promise(r => setTimeout(r, 60000));
  await browser.close();
}

run().catch(console.error);

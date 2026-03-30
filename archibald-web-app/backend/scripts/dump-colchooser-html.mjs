import puppeteer from 'puppeteer';
const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(40000);
  page.on('dialog', async d => { console.log('DIALOG:', d.message()); await d.accept(); });

  // Login
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (s) { s.call(u, 'ikiA0930'); u.dispatchEvent(new Event('input',{bubbles:true})); s.call(p, 'Fresis26@'); p.dispatchEvent(new Event('input',{bubbles:true})); }
    Array.from(document.querySelectorAll("button,a")).find(b => /accedi|login/i.test(b.textContent))?.click();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('[login] OK');

  // Naviga ordini
  await page.goto(`${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`, { waitUntil: 'networkidle2' });
  await sleep(3000);

  // Right-click header
  const hdr = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td');
  await hdr.click({ button: 'right' });
  await sleep(1200);

  // Click Show Customization Dialog
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.dxm-item')).find(el => /customiz/i.test(el.textContent))?.click();
  });
  await sleep(2000);

  // Click Column Chooser tab (_T3)
  const tabId = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]'))
      .filter(el => /^column.?chooser$/i.test(el.textContent?.trim()) && el.getBoundingClientRect().width > 0);
    if (tabs[0]) { tabs[0].click(); return tabs[0].id; }
    return null;
  });
  console.log('Tab clicked:', tabId);
  await sleep(1500);

  // Dump HTML del panel Column Chooser
  const html = await page.evaluate(() => {
    // Cerca il panel attivo del Column Chooser (AP3 = active panel 3)
    const selectors = [
      '[id*="DXCDPageControl_AP3"]',
      '[id*="DXCDPageControl_PC3"]',
      '[id*="DXCDPageControl_PP3"]',
      '.dxgvCD_ColumnChooserPage',
      '[class*="ColumnChooser"]',
      '[class*="columnChooser"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return { sel, id: el.id, cls: el.className, html: el.outerHTML.substring(0, 8000) };
    }

    // Fallback: cerca il panel visibile dentro la dialog
    const dialog = document.querySelector('.dxgvCustDialog_XafTheme');
    if (dialog) {
      // Trova tutti i panel dentro il dialogo
      const panels = Array.from(dialog.querySelectorAll('[id*="PageControl"], [class*="PageContent"], [class*="pageContent"]'));
      return {
        sel: 'fallback-panels',
        panels: panels.map(p => ({ id: p.id, cls: p.className.substring(0, 60), html: p.outerHTML.substring(0, 2000) })),
        dialogHtml: dialog.outerHTML.substring(0, 10000),
      };
    }
    return { error: 'nothing found' };
  });

  console.log('PANEL RESULT:');
  if (html.html) {
    console.log('Selector:', html.sel, 'ID:', html.id);
    console.log('HTML:');
    console.log(html.html);
  } else if (html.panels) {
    console.log('Fallback panels:', html.panels.length);
    html.panels.forEach((p, i) => { console.log(`  [${i}] id=${p.id} cls=${p.cls}`); console.log('  HTML:', p.html.substring(0, 500)); });
    console.log('\nDIALOG HTML (first 6000):');
    console.log(html.dialogHtml?.substring(0, 6000));
  } else {
    console.log(JSON.stringify(html));
  }

  console.log('\nDone. Close browser manually.');
})();

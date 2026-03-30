/**
 * Debug: mappa completa del Column Chooser - trova elementi per colonne nascoste.
 * NON clicca il tab Column Chooser (T3) - usa solo il dialog di default.
 */
import puppeteer from 'puppeteer';
import fs from 'fs';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const posts = [];
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.method() === 'POST') posts.push({ url: req.url(), body: (req.postData() || '').substring(0, 600), ts: Date.now() });
    req.continue();
  });
  page.on('dialog', async d => { await d.accept(); });

  // Login
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName'));
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

  await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_ListView_Agent/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  // Apri Column Chooser — NON cliccando tab T3, solo dialog di default
  const hdr = await page.$('.dxgvHeader_XafTheme td');
  await hdr.click({ button: 'right' });
  await sleep(1200);
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.dxm-item')).find(el => /show customization dialog/i.test(el.textContent || ''));
    if (item) item.click();
  });
  await sleep(2500);

  // Screenshot SENZA aver cliccato tab Column Chooser
  await page.screenshot({ path: '/tmp/cc-no-tab-click.png' });
  console.log('[screenshot] /tmp/cc-no-tab-click.png (senza click tab T3)');

  // Mappa TUTTI gli span con classe dxGridView_gvCOColumn*
  const allSpans = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('span[class*="dxGridView_gvCOColumn"]'))
      .map(s => {
        const r = s.getBoundingClientRect();
        return {
          id: s.id,
          class: s.className.substring(0, 100),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        };
      });
  });
  console.log(`\n[ALL SPANS] Totale: ${allSpans.length}`);
  console.log(`  Con rect > 0: ${allSpans.filter(s => s.rect.w > 0 || s.rect.h > 0).length}`);
  console.log(`  Con rect = 0: ${allSpans.filter(s => s.rect.w === 0 && s.rect.h === 0).length}`);

  // Trova colonna 3 (BUSRELTYPEID.TYPEID) in QUALSIASI sezione
  const col3Spans = allSpans.filter(s => /C3Chk/.test(s.id));
  console.log(`\n[COLONNA 3 (BUSRELTYPEID.TYPEID)] Tutti gli span:`);
  for (const s of col3Spans) {
    console.log(`  ${s.id}`);
    console.log(`  class: ${s.class}`);
    console.log(`  rect: ${JSON.stringify(s.rect)}`);
  }

  // Mappa tutti gli span visibili per capire la struttura
  const visibleSpans = allSpans.filter(s => s.rect.w > 0 || s.rect.h > 0);
  console.log('\n[TUTTI GLI SPAN VISIBILI]:');
  for (const s of visibleSpans) {
    console.log(`  ${s.id.substring(0, 80)} ${s.class.substring(0, 60)} @ (${s.rect.x},${s.rect.y})`);
  }

  // Clicca tab T3 Column Chooser e riprendi analisi
  console.log('\n--- DOPO CLICK TAB T3 ---');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]')).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const cc = tabs.find(el => /column.?chooser/i.test(el.textContent || ''));
    if (cc) { cc.click(); console.log('[js] Tab clicked:', cc.id); }
  });
  await sleep(2000);
  await page.screenshot({ path: '/tmp/cc-after-tab-click.png' });
  console.log('[screenshot] /tmp/cc-after-tab-click.png (dopo click tab T3)');

  const allSpansAfter = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('span[class*="dxGridView_gvCOColumn"]'))
      .map(s => {
        const r = s.getBoundingClientRect();
        return {
          id: s.id,
          class: s.className.substring(0, 100),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        };
      });
  });
  const visibleAfter = allSpansAfter.filter(s => s.rect.w > 0 || s.rect.h > 0);
  const col3After = allSpansAfter.filter(s => /C3Chk/.test(s.id));
  console.log(`\n[DOPO T3] Span visibili: ${visibleAfter.length} (prima: ${visibleSpans.length})`);
  console.log(`[DOPO T3] Colonna 3 spans:`);
  for (const s of col3After) console.log(`  ${s.id} rect=${JSON.stringify(s.rect)} class=${s.class.substring(0, 60)}`);

  console.log('\n[DOPO T3] Tutti span visibili:');
  for (const s of visibleAfter) {
    console.log(`  ${s.id.substring(0, 80)} ${s.class.substring(0, 50)} @ (${s.rect.x},${s.rect.y})`);
  }

  console.log('\nChiudi il browser per continuare.');
})();

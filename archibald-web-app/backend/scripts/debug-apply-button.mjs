/**
 * Test diagnostico: dopo click su T3 tab + click eye span,
 * l'Apply button diventa enabled?
 * Se rimane disabled → DevExpress non registra il click → PerformCallback salva stato invariato.
 */
import puppeteer from 'puppeteer';

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
  page.on('dialog', async d => { await d.accept(); });

  // Cattura POST per verificare cosa viene inviato
  const posts = [];
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.method() === 'POST') {
      posts.push({ url: req.url().substring(0, 100), body: (req.postData() || '').substring(0, 500), ts: Date.now() });
    }
    req.continue();
  });

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

  // Apri dialog
  const hdr = await page.$('.dxgvHeader_XafTheme td');
  await hdr.click({ button: 'right' });
  await sleep(1200);
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.dxm-item')).find(el => /show customization dialog/i.test(el.textContent || ''));
    if (item) item.click();
  });
  await sleep(2500);
  console.log('[dialog] aperto');

  // Stato Apply button PRIMA di qualsiasi azione
  const applyBefore = await page.evaluate(() => {
    const btn = document.querySelector('[data-args*="CustDialogApply"]');
    return btn ? { id: btn.id, disabled: btn.classList.contains('dxbDisabled_XafTheme'), class: btn.className.substring(0, 80) } : null;
  });
  console.log('[Apply PRIMA]:', JSON.stringify(applyBefore));

  // Click T3 tab via page.mouse.click
  const tabInfo = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 60; });
    const cc = tabs.find(el => /^column.?chooser$/i.test(el.textContent?.trim() || ''));
    if (!cc) return null;
    const r = cc.getBoundingClientRect();
    return { id: cc.id, x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (!tabInfo) { console.log('[T3] non trovato!'); return; }
  await page.mouse.click(tabInfo.x + tabInfo.w / 2, tabInfo.y + tabInfo.h / 2);
  console.log(`[T3 clicked] @ (${Math.round(tabInfo.x + tabInfo.w/2)},${Math.round(tabInfo.y + tabInfo.h/2)})`);
  await sleep(2000);

  // Stato FieldChooserPage e C3Chk5_D
  const fpState = await page.evaluate(() => {
    const fp = document.querySelector('[id*="FieldChooserPage"]');
    const c3 = document.querySelector('[id*="_3_drag_C3Chk5_D"]');
    return {
      fp: fp ? { display: window.getComputedStyle(fp).display } : null,
      c3rect: c3 ? (() => { const r = c3.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; })() : null,
    };
  });
  console.log('[dopo T3]:', JSON.stringify(fpState));

  // Stato Apply dopo T3 click (ma prima di click eye)
  const applyAfterT3 = await page.evaluate(() => {
    const btn = document.querySelector('[data-args*="CustDialogApply"]');
    return btn ? { disabled: btn.classList.contains('dxbDisabled_XafTheme') } : null;
  });
  console.log('[Apply dopo T3]:', JSON.stringify(applyAfterT3));

  // Click su C3Chk5_D (eye span per BUSRELTYPEID.TYPEID)
  const el = await page.$('[id*="_3_drag_C3Chk5_D"]');
  if (!el) { console.log('[C3] span non trovato!'); }
  else {
    const spanId = await el.evaluate(e => e.id);
    console.log(`\n[click eye span] ${spanId}`);
    await el.click();
    await sleep(1000);

    // Stato Apply DOPO click eye
    const applyAfterEye = await page.evaluate(() => {
      const btn = document.querySelector('[data-args*="CustDialogApply"]');
      return btn ? { disabled: btn.classList.contains('dxbDisabled_XafTheme'), class: btn.className.substring(0, 80) } : null;
    });
    console.log('[Apply DOPO eye click]:', JSON.stringify(applyAfterEye));

    if (applyAfterEye?.disabled) {
      console.log('\n❌ CONFERMATO: DevExpress NON ha registrato il click eye (Apply rimane disabled)');
      console.log('   → PerformCallback invia stato invariato → colonne rimangono nascoste');
    } else {
      console.log('\n✅ DevExpress HA registrato il click eye (Apply è ora enabled)!');
    }
  }

  // Screenshot
  await page.screenshot({ path: '/tmp/diag-apply-button.png' });
  console.log('\n[screenshot] /tmp/diag-apply-button.png');

  // Aspetta 3 sec, poi controlla i POST intercettati
  await sleep(3000);
  console.log('\n[POST intercettati]:', posts.length);
  for (const p of posts) {
    console.log(`  ${p.url}\n  body: ${p.body.substring(0, 200)}`);
  }

  console.log('\nChiudi il browser per continuare.');
})();

/**
 * Diagnostica mirata: dopo click T3 tab con page.mouse.click (non el.click),
 * verifica se FieldChooserPage diventa visibile e cosa vede elementFromPoint
 * alle coordinate del primo hidden column span.
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
    const b = Array.from(document.querySelectorAll("button,input[type='submit'],a"))
      .find(btn => /accedi|login/i.test(btn.textContent || btn.id || ''));
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
    const item = Array.from(document.querySelectorAll('.dxm-item'))
      .find(el => /show customization dialog/i.test(el.textContent || ''));
    if (item) item.click();
  });
  await sleep(2500);
  console.log('[dialog] aperto');

  // STEP 1: Stato PRIMA del click T3 — FieldChooserPage e C3Chk5_D
  const before = await page.evaluate(() => {
    const fp = document.querySelector('[id*="FieldChooserPage"]');
    const c3 = document.querySelector('[id*="_3_drag_C3Chk5_D"]');
    const cawp = document.querySelector('.dxgvCD_CAWP');
    return {
      fp: fp ? { id: fp.id, display: fp.style.display, computed: window.getComputedStyle(fp).display } : null,
      c3: c3 ? { id: c3.id, rect: (() => { const r = c3.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; })() } : null,
      cawp: cawp ? { display: cawp.style.display, computed: window.getComputedStyle(cawp).display } : null,
    };
  });
  console.log('\n[PRIMA di T3 click]:');
  console.log('  FieldChooserPage:', JSON.stringify(before.fp));
  console.log('  C3Chk5_D:', JSON.stringify(before.c3));
  console.log('  CAWP:', JSON.stringify(before.cawp));

  // STEP 2: Trova coordinate T3 tab e clicca con page.mouse.click (NON el.click)
  const tabInfo = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]'))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 60;
      });
    const colChooser = tabs.find(el => /^column.?chooser$/i.test(el.textContent?.trim() || ''));
    if (!colChooser) return null;
    const r = colChooser.getBoundingClientRect();
    return { id: colChooser.id, x: r.x, y: r.y, w: r.width, h: r.height };
  });
  console.log('\n[T3 tab info]:', JSON.stringify(tabInfo));

  if (tabInfo) {
    // USA page.mouse.click (non el.click) per triggerare evento reale DevExpress
    await page.mouse.click(tabInfo.x + tabInfo.w / 2, tabInfo.y + tabInfo.h / 2);
    console.log(`[T3] clicked via page.mouse.click @ (${Math.round(tabInfo.x + tabInfo.w/2)},${Math.round(tabInfo.y + tabInfo.h/2)})`);
    await sleep(2500);
  }

  // STEP 3: Stato DOPO click T3 — FieldChooserPage, C3Chk5_D, elementFromPoint
  const after = await page.evaluate(() => {
    const fp = document.querySelector('[id*="FieldChooserPage"]');
    const c3 = document.querySelector('[id*="_3_drag_C3Chk5_D"]');
    const cawp = document.querySelector('.dxgvCD_CAWP');
    return {
      fp: fp ? { id: fp.id, display: fp.style.display, computed: window.getComputedStyle(fp).display } : null,
      c3: c3 ? { id: c3.id, rect: (() => { const r = c3.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; })() } : null,
      cawp: cawp ? { display: cawp.style.display, computed: window.getComputedStyle(cawp).display } : null,
    };
  });
  console.log('\n[DOPO T3 mouse.click]:');
  console.log('  FieldChooserPage:', JSON.stringify(after.fp));
  console.log('  C3Chk5_D:', JSON.stringify(after.c3));
  console.log('  CAWP:', JSON.stringify(after.cawp));

  // STEP 4: Se FieldChooserPage è ancora display:none → force-show + analisi elementFromPoint
  const c3Rect = after.c3?.rect;
  if (c3Rect && c3Rect.w === 0) {
    console.log('\n[FieldChooserPage ancora nascosta] → Force-show e test elementFromPoint...');

    const forceResult = await page.evaluate(() => {
      const c3 = document.querySelector('[id*="_3_drag_C3Chk5_D"]');
      if (!c3) return null;

      // Force-show antenati
      const forced = [];
      let el = c3.parentElement;
      while (el) {
        if (window.getComputedStyle(el).display === 'none') {
          el.style.display = 'block';
          forced.push((el.id || el.className).substring(0, 60));
        }
        if (el.className?.includes('dxgvCustDialogContent_XafTheme')) break;
        el = el.parentElement;
      }

      c3.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = c3.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;

      // Cosa c'è alle coordinate del click?
      const topEl = document.elementFromPoint(cx, cy);
      const allAtPoint = [];
      let probe = topEl;
      while (probe && allAtPoint.length < 5) {
        allAtPoint.push({ tag: probe.tagName, id: probe.id.substring(0, 60), class: probe.className.substring(0, 60) });
        probe = probe.parentElement;
      }

      return {
        c3Id: c3.id,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        clickPoint: { x: Math.round(cx), y: Math.round(cy) },
        topElement: topEl ? { id: topEl.id, class: topEl.className?.substring(0, 80) } : null,
        isTarget: topEl === c3,
        domChain: allAtPoint,
        forced,
      };
    });

    console.log('\n[Force-show result]:');
    console.log('  C3 span:', forceResult.c3Id);
    console.log('  rect:', JSON.stringify(forceResult.rect));
    console.log('  clickPoint:', JSON.stringify(forceResult.clickPoint));
    console.log('  TOP element at point:', JSON.stringify(forceResult.topElement));
    console.log('  isTarget (click lands on C3Chk5_D):', forceResult.isTarget);
    console.log('  DOM chain from top:');
    for (const el of forceResult.domChain) {
      console.log(`    <${el.tag}> id="${el.id}" class="${el.class}"`);
    }
    console.log('  Forced containers:', forceResult.forced.join(', ') || 'none');

    await page.screenshot({ path: '/tmp/diag-force-show.png' });
    console.log('\n[screenshot] /tmp/diag-force-show.png');
  } else if (c3Rect && c3Rect.w > 0) {
    console.log('\n[FieldChooserPage VISIBILE dopo mouse.click] C3 rect:', JSON.stringify(c3Rect));

    // elementFromPoint check
    const epResult = await page.evaluate((c3r) => {
      const cx = c3r.x + c3r.w / 2;
      const cy = c3r.y + c3r.h / 2;
      const topEl = document.elementFromPoint(cx, cy);
      const c3 = document.querySelector('[id*="_3_drag_C3Chk5_D"]');
      return {
        topElement: topEl ? { id: topEl.id, class: topEl.className?.substring(0, 80) } : null,
        isTarget: topEl === c3,
      };
    }, c3Rect);
    console.log('  elementFromPoint isTarget:', epResult.isTarget);
    console.log('  topElement:', JSON.stringify(epResult.topElement));

    await page.screenshot({ path: '/tmp/diag-t3-visible.png' });
    console.log('\n[screenshot] /tmp/diag-t3-visible.png');
  }

  console.log('\nChiudi il browser per continuare.');
})();

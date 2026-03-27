/**
 * Cleanup script — svuota il campo MEMO del cliente 55839 dopo i test diagnostici.
 * Usa lo stesso approccio di login del main dump script.
 */
import puppeteer from 'puppeteer';
const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USER = 'ikiA0930', PASS = 'Fresis26@', CUSTOMER_ID = '55839';
function cssEscape(id) { return id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1'); }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitIdle(page, label = '', ms = 10000) {
  try {
    await page.waitForFunction(() => {
      const w = window;
      if (typeof w.ASPx !== 'undefined') {
        const pending = (w.ASPx._pendingCallbacks || 0) + (w.ASPx._sendingRequests || 0) + (w.ASPx._pendingRequestCount || 0);
        if (pending > 0) return false;
      }
      const col = w.ASPxClientControl?.GetControlCollection?.();
      if (col) { let busy = false; try { col.ForEachControl(c => { if (c?.InCallback?.()) busy = true; }); } catch {} if (busy) return false; }
      return true;
    }, { timeout: ms, polling: 150 });
  } catch { console.log(`waitIdle timeout (${label})`); }
}

const browser = await puppeteer.launch({
  headless: false,
  slowMo: 60,
  args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
page.setDefaultTimeout(30000);

try {
  // ─── Login (stesso approccio del main script) ─────────────────────────────
  await page.goto(`${ARCHIBALD_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  if (!page.url().toLowerCase().includes('login')) {
    console.log('Già autenticato →', page.url());
  } else {
    const userInputId = await page.evaluate(() => {
      const textInputs = Array.from(document.querySelectorAll('input'))
        .filter(i => i.type !== 'hidden' && i.type !== 'submit' && i.type !== 'button' && i.type !== 'password');
      const uField = textInputs.find(i =>
        i.id.includes('UserName') || i.name.includes('UserName') ||
        i.placeholder?.toLowerCase().includes('account') ||
        i.placeholder?.toLowerCase().includes('username')
      ) || textInputs[0];
      if (uField) { uField.scrollIntoView(); uField.focus(); }
      return uField?.id ?? null;
    });
    if (!userInputId) throw new Error('Campo username non trovato');
    await page.evaluate(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, ''); else el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, userInputId);
    await page.type(`#${cssEscape(userInputId)}`, USER, { delay: 30 });
    await page.keyboard.press('Tab');
    await waitIdle(page, 'login-user', 5000);

    const pwdInputId = await page.evaluate(() => {
      const pField = document.querySelector('input[type="password"]');
      if (pField) { pField.scrollIntoView(); pField.focus(); }
      return pField?.id ?? null;
    });
    if (!pwdInputId) throw new Error('Campo password non trovato');
    await page.evaluate(id => {
      const el = document.getElementById(id);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, ''); else el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, pwdInputId);
    await page.type(`#${cssEscape(pwdInputId)}`, PASS, { delay: 30 });
    await page.keyboard.press('Tab');
    await waitIdle(page, 'login-pass', 5000);

    const submitClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"], a, button'))
        .find(el => el.offsetParent !== null && /accedi|login|sign in|entra/i.test(el.textContent + (el.value || '')));
      if (btn) { btn.click(); return true; }
      const fallback = document.querySelector('input[type="submit"]');
      if (fallback) { fallback.click(); return true; }
      return false;
    });
    if (!submitClicked) await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    if (page.url().toLowerCase().includes('login')) throw new Error('Login fallito — URL: ' + page.url());
    console.log('Login OK →', page.url());
  }

  // ─── Apri cliente in edit mode ────────────────────────────────────────────
  await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_DetailView/${CUSTOMER_ID}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitIdle(page, 'view-mode', 10000);

  const editClicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('a, button, input[type="button"]'))
      .filter(el => el.offsetParent !== null);
    const btn = candidates.find(el =>
      /modif|edit/i.test(el.title ?? '') ||
      /modif|edit/i.test(el.textContent?.trim() ?? '') ||
      el.className?.includes('EditAction') ||
      (el.id ?? '').includes('EditAction')
    );
    if (btn) { btn.click(); return btn.id || 'found'; }
    const toolbarBtn = document.querySelector('a[id*="Edit"], a[title*="Modif"], a[title*="Edit"]');
    if (toolbarBtn) { toolbarBtn.click(); return toolbarBtn.id; }
    return null;
  });
  console.log('Edit button:', editClicked);

  if (!editClicked) {
    await page.goto(`${ARCHIBALD_URL}/CUSTTABLE_DetailView/${CUSTOMER_ID}/?mode=Edit`, { waitUntil: 'networkidle2', timeout: 30000 });
  } else {
    await page.waitForFunction(() =>
      window.location.href.includes('mode=Edit') ||
      document.querySelector('input[id$="Save_Button"], a[id*="SaveAndClose"]') !== null,
    { timeout: 10000, polling: 300 }).catch(() => {});
  }
  await waitIdle(page, 'edit-ready', 10000);
  console.log('Edit mode URL:', page.url());

  // ─── Debug: dump campo MEMO ───────────────────────────────────────────────
  const dbg = await page.evaluate(() => ({
    url: window.location.href,
    custinfo: Array.from(document.querySelectorAll('textarea,input'))
      .filter(i => /CUSTINFO/i.test(i.id))
      .map(i => ({ id: i.id, visible: i.offsetParent !== null, value: i.value?.substring(0, 80) })),
    totalInputs: document.querySelectorAll('input,textarea').length,
  }));
  console.log('Debug:', JSON.stringify(dbg, null, 2));

  const memoId = await page.evaluate(() =>
    Array.from(document.querySelectorAll('textarea,input'))
      .find(i => /CUSTINFO/i.test(i.id) && i.offsetParent !== null)?.id
  );
  if (!memoId) {
    console.log('MEMO field non visibile — niente da fare (potrebbe essere già vuoto o in tab non attiva)');
    await browser.close();
    process.exit(0);
  }
  const currentVal = await page.evaluate(id => document.getElementById(id)?.value, memoId);
  console.log('MEMO attuale:', JSON.stringify(currentVal));
  if (!currentVal) { console.log('MEMO già vuoto — niente da fare.'); await browser.close(); process.exit(0); }

  // ─── Svuota MEMO via tastiera ─────────────────────────────────────────────
  await page.evaluate(id => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: 'center' });
    el?.focus();
    el?.click();
  }, memoId);
  await wait(300);
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await wait(150); await page.keyboard.press('Delete'); await wait(300); await page.keyboard.press('Tab');
  await waitIdle(page, 'after-clear', 3000);
  const afterClear = await page.evaluate(id => document.getElementById(id)?.value, memoId);
  console.log('MEMO dopo clear:', JSON.stringify(afterClear));

  // ─── Save ─────────────────────────────────────────────────────────────────
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('a,button')).filter(el => el.offsetParent !== null);
    const btn = all.find(el => el.title === 'Salvare' || /^salvar/i.test((el.textContent || '').trim()));
    btn?.click();
  });
  await wait(3000);
  const chkClicked = await page.evaluate(() => {
    const chk = document.querySelector('input[id$="_ErrorInfo_Ch_S"]');
    if (chk?.offsetParent) { chk.click(); return true; } return false;
  });
  if (chkClicked) {
    await wait(500);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('a,button'))
        .find(el => el.offsetParent !== null && (el.title === 'Salvare' || /^salvar/i.test((el.textContent || '').trim())))
        ?.click();
    });
  }
  await wait(15000);
  console.log('Save OK. URL:', page.url());
} catch (err) {
  console.error('ERRORE:', err.message);
} finally {
  await browser.close();
}

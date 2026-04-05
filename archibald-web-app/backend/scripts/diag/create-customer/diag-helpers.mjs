// archibald-web-app/backend/scripts/diag/create-customer/diag-helpers.mjs
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const __dir = dirname(fileURLToPath(import.meta.url));
export const FINDINGS_DIR = join(__dir, 'findings');

// Copia questi valori da scripts/diag-field-callbacks.mjs
export const ERP_URL = process.env.ERP_URL ?? 'https://4.231.124.90/Archibald';
export const USERNAME = process.env.ERP_USER ?? 'ikiA0930';
export const PASSWORD = process.env.ERP_PASS ?? 'Fresis26@';

export function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function cssEscape(s) {
  return s.replace(/([.#[\]()])/g, '\\$1');
}

export async function launchBrowser() {
  return puppeteer.launch({
    headless: false,
    slowMo: 40,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox'],
  });
}

export async function login(page) {
  await page.goto(`${ERP_URL}/Default.aspx`, { waitUntil: 'networkidle2', timeout: 60000 });
  const userInput = await page.$('input[id*="USER"], input[name*="user"], input[type="text"]');
  if (!userInput) return; // già autenticato
  await userInput.click();
  await userInput.type(USERNAME, { delay: 50 });
  const passInput = await page.$('input[type="password"]');
  if (passInput) {
    await passInput.click();
    await passInput.type(PASSWORD, { delay: 50 });
  }
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('[LOGIN] OK —', page.url());
}

export async function navigateToNewCustomerForm(page) {
  await page.goto(`${ERP_URL}/CUSTTABLE_ListView_Agent/`, {
    waitUntil: 'networkidle2', timeout: 60000,
  });
  await waitForDevExpressReady(page);

  // Clic "Nuovo" / "New"
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a,span,button'))
      .find(el => /^(Nuovo|New)$/i.test((el.textContent ?? '').trim()) && el.offsetParent);
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!clicked) throw new Error('"Nuovo"/"New" button not found');

  await page.waitForFunction(
    () => window.location.href.includes('CUSTTABLE_DetailView'),
    { timeout: 15000, polling: 200 },
  );
  await waitForDevExpressReady(page);
  console.log('[NAV] Form nuovo cliente pronto —', page.url());
}

export async function waitForDevExpressReady(page, { timeout = 15000, label = '' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ready = await page.evaluate(() => {
      try { return (window.ASPx?._pendingCallbacks ?? 0) === 0 && document.readyState === 'complete'; }
      catch { return false; }
    }).catch(() => false);
    if (ready) return;
    await wait(200);
  }
  console.warn(`[waitForDevExpressReady] timeout${label ? ` (${label})` : ''}`);
}

export async function waitForXhrSettle(page, cdpSession, {
  formUrlPattern = 'CUSTTABLE_DetailView',
  quietMs = 400,
  maxWaitMs = 35000,
} = {}) {
  const pending = new Set();
  let totalXhr = 0;
  let quietStart = null;
  const start = Date.now();

  const onSent = ({ requestId, request }) => {
    if (request?.url?.includes(formUrlPattern)) { pending.add(requestId); totalXhr++; }
  };
  const onDone = ({ requestId }) => pending.delete(requestId);

  cdpSession.on('Network.requestWillBeSent', onSent);
  cdpSession.on('Network.loadingFinished', onDone);
  cdpSession.on('Network.loadingFailed', onDone);

  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      const elapsed = Date.now() - start;
      const pendingCallbacks = await page.evaluate(() => {
        try { return window.ASPx?._pendingCallbacks ?? 0; } catch { return 0; }
      }).catch(() => 0);

      const settled = pending.size === 0 && pendingCallbacks === 0;
      if (settled) {
        if (!quietStart) quietStart = Date.now();
        if (Date.now() - quietStart >= quietMs) {
          clearInterval(timer);
          cdpSession.off('Network.requestWillBeSent', onSent);
          cdpSession.off('Network.loadingFinished', onDone);
          cdpSession.off('Network.loadingFailed', onDone);
          resolve({ settleMs: elapsed, xhrCount: totalXhr });
          return;
        }
      } else {
        quietStart = null;
      }
      if (elapsed >= maxWaitMs) {
        clearInterval(timer);
        cdpSession.off('Network.requestWillBeSent', onSent);
        cdpSession.off('Network.loadingFinished', onDone);
        cdpSession.off('Network.loadingFailed', onDone);
        resolve({ settleMs: elapsed, xhrCount: totalXhr, timedOut: true });
      }
    }, 100);
  });
}

export function snapshotXafInputs(page) {
  return page.evaluate(() => {
    const snap = {};
    document.querySelectorAll('input[id*="xaf_dvi"]').forEach(el => {
      snap[el.id] = el.value ?? '';
    });
    return snap;
  });
}

export function diffDomSnapshots(before, after) {
  const changed = {};
  for (const [id, afterVal] of Object.entries(after)) {
    const beforeVal = before[id] ?? '';
    if (afterVal !== beforeVal) changed[id] = { before: beforeVal, after: afterVal };
  }
  return changed;
}

export function saveFindings(filename, data) {
  mkdirSync(FINDINGS_DIR, { recursive: true });
  const path = join(FINDINGS_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`[SAVED] ${path}`);
}

export async function openTab(page, tabLabel) {
  const clicked = await page.evaluate((label) => {
    const el = Array.from(document.querySelectorAll('a,span,td,li'))
      .find(e => e.offsetParent && (e.textContent ?? '').trim() === label);
    if (el) { el.click(); return true; }
    return false;
  }, tabLabel);
  if (!clicked) throw new Error(`Tab "${tabLabel}" non trovato`);
  await waitForDevExpressReady(page, { label: `tab-${tabLabel}` });
  await wait(500);
}

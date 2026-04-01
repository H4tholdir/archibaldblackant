/**
 * diag-field-callbacks.mjs
 * Phase 1: sonda callback XHR dei campi del form nuovo cliente ERP
 * Phase 2: corregge Palmese (erp_id 57396) con i dati corretti
 * Usage: node scripts/diag-field-callbacks.mjs  (dalla dir backend)
 */

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const LOGS_DIR = join(__dirname, '..', 'logs');

const PROBE_FIELDS = {
  NAME: {
    inputIdPattern: /dviNAME_Edit_I$/,
    value: 'Dr. Test Palmese',
  },
  FISCALCODE: {
    inputIdPattern: /dviFISCALCODE_Edit_I$/,
    value: 'PLMCLD76T10A390T',
  },
  VATNUM: {
    inputIdPattern: /dviVATNUM_Edit_I$/,
    value: '13890640967',
  },
};

const PALMESE_ERP_ID = '57396';
const PALMESE_FIX = {
  CAP: '80038',
  FISCALCODE: 'PLMCLD76T10A390T',
  NAMEALIAS: 'Dr. Claudio Palmese',
  SDI: 'C3UCNRB',
};

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function cssEscape(s) {
  return s.replace(/([.#[\]()])/g, '\\$1');
}

async function login(page) {
  console.log('[LOGIN] navigating...');
  await page.goto(`${ERP_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('input[name="UserName"]', { timeout: 10000 });
  await page.type('input[name="UserName"]', USERNAME, { delay: 50 });
  await page.type('input[name="Password"]', PASSWORD, { delay: 50 });
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('[LOGIN] OK —', page.url());
}

async function waitForDevExpressReady(page, { timeout = 15000, label = '' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ready = await page.evaluate(() => {
      try {
        return (window.ASPx?._pendingCallbacks ?? 0) === 0
          && document.readyState === 'complete';
      } catch { return false; }
    }).catch(() => false);
    if (ready) return;
    await wait(200);
  }
  console.warn(`[waitForDevExpressReady] timeout${label ? ` (${label})` : ''}`);
}

async function waitForXhrSettle(page, cdpSession, {
  formUrlPattern = 'CUSTTABLE_DetailView',
  quietMs = 400,
  maxWaitMs = 35000,
} = {}) {
  const pending = new Set();
  let totalXhr = 0;
  let quietStart = null;
  const start = Date.now();

  const onSent = ({ requestId, request }) => {
    if (request?.url?.includes(formUrlPattern)) {
      pending.add(requestId);
      totalXhr++;
    }
  };
  const onDone = ({ requestId }) => pending.delete(requestId);

  cdpSession.on('Network.requestWillBeSent', onSent);
  cdpSession.on('Network.loadingFinished', onDone);
  cdpSession.on('Network.loadingFailed', onDone);

  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      const elapsed = Date.now() - start;

      const pendingCallbacks = await page
        .evaluate(() => {
          try { return window.ASPx?._pendingCallbacks ?? 0; }
          catch { return 0; }
        })
        .catch(() => 0);

      const isSettled = pending.size === 0 && pendingCallbacks === 0;

      if (isSettled) {
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
        console.warn(`[waitForXhrSettle] timeout dopo ${elapsed}ms — pending: ${pending.size}`);
        resolve({ settleMs: elapsed, xhrCount: totalXhr, timedOut: true });
      }
    }, 100);
  });
}

async function snapshotXafInputs(page) {
  return page.evaluate(() => {
    const snap = {};
    document.querySelectorAll('input[id*="xaf_dvi"]').forEach(el => {
      snap[el.id] = el.value ?? '';
    });
    return snap;
  });
}

function diffSnapshots(before, after) {
  const changed = {};
  for (const [id, afterVal] of Object.entries(after)) {
    const beforeVal = before[id] ?? '';
    if (afterVal !== beforeVal) {
      changed[id] = { before: beforeVal, after: afterVal };
    }
  }
  return changed;
}

function logProbeResult(fieldName, result) {
  const timedOutNote = result.timedOut ? ', TIMEOUT' : '';
  console.log(`\n[PROBE] ${fieldName}`);
  console.log(`  → XHR: ${result.xhrCount} (settle: ${result.settleMs}ms${timedOutNote})`);
  const entries = Object.entries(result.changedFields);
  if (entries.length === 0) {
    console.log('  → CHANGED: (nessuno)');
  } else {
    for (const [id, { before, after }] of entries) {
      const short = id.replace(/^xaf_dvi/, '').replace(/_Edit_I$/, '');
      console.log(`  → CHANGED: ${short} "${before}" → "${after}"`);
    }
  }
}

async function probeTextField(page, cdpSession, fieldName, { inputIdPattern, value }) {
  const before = await snapshotXafInputs(page);

  const inputId = await page.evaluate((patternSrc) => {
    const re = new RegExp(patternSrc);
    const input = Array.from(document.querySelectorAll('input[id*="xaf_dvi"]'))
      .find(el => re.test(el.id) && el.offsetParent !== null);
    if (!input) return null;
    input.scrollIntoView({ block: 'center' });
    return input.id;
  }, inputIdPattern.source);

  if (!inputId) throw new Error(`Campo non trovato: ${fieldName} (${inputIdPattern})`);

  const escaped = cssEscape(inputId);
  await page.click(`#${escaped}`, { clickCount: 3 });
  await wait(100);
  await page.type(`#${escaped}`, value, { delay: 60 });

  const settlePromise = waitForXhrSettle(page, cdpSession);
  await page.keyboard.press('Tab');
  const settle = await settlePromise;
  const after = await snapshotXafInputs(page);
  const changedFields = diffSnapshots(before, after);

  return { field: fieldName, ...settle, changedFields };
}

async function probeCap(page, cdpSession, capValue) {
  const before = await snapshotXafInputs(page);

  // Clicca pulsante B0 (lente lookup CAP)
  const btnClicked = await page.evaluate(() => {
    const btn = document.querySelector('[id*="LOGISTICSADDRESSZIPCODE"][id*="B0"]');
    if (!btn) return false;
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    return true;
  });
  if (!btnClicked) throw new Error('Pulsante B0 CAP non trovato');
  await wait(1500);

  // Trova iframe del popup (non-main frame con input visibili)
  let frame = null;
  for (let attempt = 0; attempt < 15 && !frame; attempt++) {
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue;
      const hasInputs = await f.evaluate(() =>
        document.querySelectorAll('input[type="text"]').length > 0
      ).catch(() => false);
      if (hasInputs) { frame = f; break; }
    }
    if (!frame) await wait(400);
  }
  if (!frame) throw new Error('Iframe popup CAP non trovato');

  await frame.waitForFunction(
    () => document.readyState === 'complete',
    { timeout: 8000 }
  ).catch(() => {});
  await wait(300);

  // Trova input di ricerca visibile
  const searchId = await frame.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]'))
      .filter(el => el.offsetParent !== null);
    const found = inputs.find(i =>
      /_DXSE_I$/.test(i.id) || /_DXFREditorcol0_I$/.test(i.id)
    ) || inputs[0];
    if (!found) return null;
    if (!found.id) found.id = '_diag_cap_search_';
    found.focus();
    found.value = '';
    return found.id;
  });
  if (!searchId) throw new Error('Input ricerca CAP non trovato nell\'iframe');

  // Digita CAP con delay SAC (100ms per triggerare textChanged)
  await frame.type(`#${cssEscape(searchId)}`, capValue, { delay: 100 });
  await wait(1000);

  // Attendi righe risultato (fino a 7.5s)
  let rowCount = 0;
  for (let i = 0; i < 15; i++) {
    rowCount = await frame.evaluate(() =>
      document.querySelectorAll('tr[class*="dxgvDataRow"]').length
    ).catch(() => 0);
    if (rowCount > 0) break;
    await wait(500);
  }
  if (rowCount === 0) {
    await frame.keyboard.press('Enter');
    await wait(2000);
    rowCount = await frame.evaluate(() =>
      document.querySelectorAll('tr[class*="dxgvDataRow"]').length
    ).catch(() => 0);
  }
  if (rowCount === 0) throw new Error(`Nessuna riga CAP trovata per "${capValue}"`);

  // Clicca prima riga
  await frame.evaluate(() => {
    const row = document.querySelector('tr[class*="dxgvDataRow"]');
    if (row) row.click();
  });
  await wait(300);

  const settlePromise = waitForXhrSettle(page, cdpSession);

  // Clicca OK
  await frame.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('input[type="button"], button'));
    const ok = btns.find(b =>
      (b.value?.trim() === 'OK') || (b.textContent?.trim() === 'OK')
    );
    if (ok) ok.click();
  });

  const settle = await settlePromise;
  const after = await snapshotXafInputs(page);
  const changedFields = diffSnapshots(before, after);

  return { field: 'CAP', ...settle, changedFields };
}

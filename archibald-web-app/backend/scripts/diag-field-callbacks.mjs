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
    value: 'TSTFSC99T01A001Z', // CF fittizio — solo per osservare callback, non dati reali
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
  await page.goto(`${ERP_URL}/Default.aspx`, { waitUntil: 'networkidle2', timeout: 60000 });
  console.log('[LOGIN] URL:', page.url());

  const userInput = await page.$('input[id*="USER"], input[name*="user"], input[type="text"]');
  if (!userInput) {
    console.log('[LOGIN] Nessun form login — già autenticato');
    return;
  }

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

async function runPhase1(page, cdpSession) {
  console.log('\n=== PHASE 1: Field Probe ===');

  await page.goto(
    `${ERP_URL}/CUSTTABLE_ListView_Agent/`,
    { waitUntil: 'networkidle2', timeout: 60000 }
  );
  await wait(2000);

  const clicked = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('a, span, button, td'))
      .find(e => e.textContent?.trim() === 'Nuovo' || e.textContent?.trim() === 'New');
    if (el) { el.click(); return true; }
    return false;
  });
  if (!clicked) throw new Error('Pulsante Nuovo non trovato');

  await page.waitForFunction(
    () => !window.location.href.includes('ListView'),
    { timeout: 15000 }
  );
  await wait(2000);
  console.log('[PHASE1] Form nuovo aperto —', page.url());

  // Assicura tab Principale attivo
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('*'))
      .find(el => el.textContent?.trim() === 'Principale' && el.offsetParent !== null);
    if (tab) tab.click();
  });
  await wait(1000);

  const results = {};

  // Probe 1: NAME
  const nameResult = await probeTextField(page, cdpSession, 'NAME', PROBE_FIELDS.NAME);
  logProbeResult('NAME', nameResult);
  results.NAME = nameResult;

  // Probe 2: FISCALCODE
  const fcResult = await probeTextField(page, cdpSession, 'FISCALCODE', PROBE_FIELDS.FISCALCODE);
  logProbeResult('FISCALCODE', fcResult);
  results.FISCALCODE = fcResult;

  // Probe 3: CAP (popup iframe)
  const capResult = await probeCap(page, cdpSession, '80038');
  logProbeResult('CAP', capResult);
  results.CAP = capResult;

  // Probe 4: VATNUM (possibile attesa fino a 35s)
  console.log('\n[PROBE] VATNUM — avvio (possibile wait fino a 35s)...');
  const vatResult = await probeTextField(page, cdpSession, 'VATNUM', PROBE_FIELDS.VATNUM);
  logProbeResult('VATNUM', vatResult);
  results.VATNUM = vatResult;

  // Naviga via SENZA salvare — XAF mostra dialog beforeunload, va accettato
  console.log('\n[PHASE1] Navigazione via (no save)...');
  page.once('dialog', async dialog => { await dialog.accept().catch(() => {}); });
  await page.goto(
    `${ERP_URL}/CUSTTABLE_ListView_Agent/`,
    { waitUntil: 'networkidle2', timeout: 30000 }
  );
  await wait(1500);

  // Dismissi eventuale dialog DevExpress "Vuoi salvare?"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('input[type="button"], button, a'));
    const discard = btns.find(b =>
      /no|annulla|cancel|discard|ignore/i.test(b.textContent?.trim() ?? b.value?.trim() ?? '')
    );
    if (discard) discard.click();
  }).catch(() => {});
  await wait(1000);

  console.log('[PHASE1] completata.');
  return results;
}

async function runPhase2(page, cdpSession) {
  console.log('\n=== PHASE 2: Fix Palmese (erp_id 57396) ===');

  await page.goto(
    `${ERP_URL}/CUSTTABLE_DetailView/${PALMESE_ERP_ID}/?mode=Edit`,
    { waitUntil: 'networkidle2', timeout: 30000 }
  );
  await waitForDevExpressReady(page, { label: 'phase2-load' });
  await wait(2000);
  console.log('[PHASE2] Form aperto —', page.url());

  // Assicura tab Principale attivo
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('*'))
      .find(el => el.textContent?.trim() === 'Principale' && el.offsetParent !== null);
    if (tab) tab.click();
  });
  await wait(1000);

  const steps = {};

  // Passo 1: CAP = 80038 (prima di FISCALCODE per evitare race VATNUM)
  console.log('[PHASE2] Passo 1: CAP...');
  await probeCap(page, cdpSession, PALMESE_FIX.CAP);
  steps.CAP = true;
  console.log(`  CAP → ${PALMESE_FIX.CAP}: OK`);

  // Passo 2: FISCALCODE
  console.log('[PHASE2] Passo 2: FISCALCODE...');
  const fcId = await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll('input[id*="xaf_dvi"]'))
      .find(el => /dviFISCALCODE_Edit_I$/.test(el.id) && el.offsetParent !== null);
    if (!input) return null;
    input.scrollIntoView({ block: 'center' });
    return input.id;
  });
  if (!fcId) throw new Error('FISCALCODE input non trovato');
  await page.click(`#${cssEscape(fcId)}`, { clickCount: 3 });
  await page.type(`#${cssEscape(fcId)}`, PALMESE_FIX.FISCALCODE, { delay: 60 });
  const fcSettle = waitForXhrSettle(page, cdpSession, { quietMs: 800 });
  await page.keyboard.press('Tab');
  await fcSettle;
  steps.FISCALCODE = true;
  console.log(`  FISCALCODE → ${PALMESE_FIX.FISCALCODE}: OK`);

  // Passo 3: NAMEALIAS esplicito (sovrascrive callback FISCALCODE che setta CF nel nome)
  // NAMEALIAS è maxLen 20 — "Dr. Claudio Palmese" = 19 chars, entra per intero
  console.log('[PHASE2] Passo 3: NAMEALIAS...');
  const naId = await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll('input[id*="xaf_dvi"]'))
      .find(el => /dviNAMEALIAS_Edit_I$/.test(el.id) && el.offsetParent !== null);
    if (!input) return null;
    input.scrollIntoView({ block: 'center' });
    return input.id;
  });
  if (!naId) throw new Error('NAMEALIAS input non trovato');
  await page.click(`#${cssEscape(naId)}`, { clickCount: 3 });
  await page.type(`#${cssEscape(naId)}`, PALMESE_FIX.NAMEALIAS, { delay: 60 });
  const naSettle = waitForXhrSettle(page, cdpSession, { quietMs: 400 });
  await page.keyboard.press('Tab');
  await naSettle;
  steps.NAMEALIAS = true;
  console.log(`  NAMEALIAS → ${PALMESE_FIX.NAMEALIAS}: OK`);

  // Passo 4: SDI (nessun callback atteso)
  console.log('[PHASE2] Passo 4: SDI...');
  const sdiId = await page.evaluate(() => {
    // Il campo SDI è LEGALAUTHORITY nel DOM XAF
    const input = Array.from(document.querySelectorAll('input[id*="xaf_dvi"]'))
      .find(el =>
        /LEGALAUTHORITY/i.test(el.id) &&
        el.offsetParent !== null
      );
    if (!input) return null;
    input.scrollIntoView({ block: 'center' });
    return input.id;
  });
  if (!sdiId) throw new Error('SDI input non trovato (cercato: LEGALAUTHORITY)');
  await page.click(`#${cssEscape(sdiId)}`, { clickCount: 3 });
  await page.type(`#${cssEscape(sdiId)}`, PALMESE_FIX.SDI, { delay: 60 });
  await page.keyboard.press('Tab');
  await wait(500);
  steps.SDI = true;
  console.log(`  SDI → ${PALMESE_FIX.SDI}: OK`);

  // Salva — dropdown "Salvare" → click opzione "Salvare" (stesso pattern del bot clickSaveOnly)
  console.log('[PHASE2] Salvataggio...');
  const dropOpened = await page.evaluate(() => {
    const allElements = Array.from(document.querySelectorAll('span, button, a'));
    const salvareBtn = allElements.find(el => {
      const text = el.textContent?.trim().toLowerCase() || '';
      return text.includes('salvare') || text === 'save';
    });
    if (!salvareBtn) return false;
    const parent = salvareBtn.closest('li') || salvareBtn.parentElement;
    if (!parent) return false;
    const popOut = parent.querySelector('div.dxm-popOut') || parent.querySelector('[id*="_P"]');
    if (popOut && popOut.offsetParent !== null) { popOut.click(); return true; }
    const arrow = parent.querySelector('img[id*="_B-1"], img[alt*="down"]');
    if (arrow) { arrow.click(); return true; }
    salvareBtn.click(); return true;
  });
  if (!dropOpened) throw new Error('Pulsante Salvare non trovato');

  // Aspetta che il popup dropdown sia visibile (fino a 3s)
  let popupVisible = false;
  const popupStart = Date.now();
  while (Date.now() - popupStart < 3000) {
    popupVisible = await page.evaluate(() => {
      const popups = Array.from(document.querySelectorAll(
        '[class*="dxm-popup"], [class*="subMenu"], [id*="_menu_DXI"], [class*="dxm-content"]'
      ));
      for (const popup of popups) {
        if (popup.offsetParent !== null && popup.offsetHeight > 0) {
          const items = Array.from(popup.querySelectorAll('a, span'));
          if (items.some(i => { const t = i.textContent?.trim(); return t === 'Salvare' || t === 'Save'; })) return true;
        }
      }
      return false;
    });
    if (popupVisible) break;
    await wait(100);
  }

  const saveClicked = await page.evaluate(() => {
    const popups = Array.from(document.querySelectorAll(
      '[class*="dxm-popup"], [class*="subMenu"], [id*="_menu_DXI"], [class*="dxm-content"]'
    ));
    for (const popup of popups) {
      for (const item of popup.querySelectorAll('a, span')) {
        const t = item.textContent?.trim() ?? '';
        if ((t === 'Salvare' || t === 'Save') && item.offsetParent !== null) {
          item.click(); return true;
        }
      }
    }
    // fallback: tutti gli elementi visibili con testo "Salvare" dentro un menu popup
    for (const item of document.querySelectorAll('a, span, li')) {
      const text = item.textContent?.trim() || '';
      if (text === 'Salvare' && item.offsetParent !== null) {
        const isInMenu = item.closest('[class*="dxm-popup"]') || item.closest('[class*="subMenu"]')
          || item.closest('[id*="_DXI"]') || item.closest('[class*="dxm-content"]');
        if (isInMenu) { item.click(); return true; }
      }
    }
    return false;
  });
  if (!saveClicked) throw new Error('Opzione Salvare nel dropdown non trovata');

  // Attendi callbacks post-save
  await waitForXhrSettle(page, cdpSession, { maxWaitMs: 15000, quietMs: 600 });
  await wait(2000);

  // Dismissi eventuale "Ignora avvisi" o dialog di conferma
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('input[type="button"], button, a'));
    const confirm = btns.find(b =>
      /ignora|ignore|sì|si\b|yes\b|ok\b/i.test(b.textContent?.trim() ?? b.value?.trim() ?? '')
    );
    if (confirm) confirm.click();
  }).catch(() => {});
  await wait(1500);

  const urlAfterSave = page.url();
  // Per customer esistente, l'ERP rimane in mode=Edit anche dopo save — comportamento normale.
  // Il save è fallito solo se l'URL contiene ancora NewObject (nuovo record non salvato).
  if (urlAfterSave.includes('NewObject')) {
    console.warn('[PHASE2] URL ancora NewObject — save fallito');
    steps.SAVE = false;
  } else {
    steps.SAVE = true;
  }

  console.log(`[PHASE2] Salvato — URL: ${urlAfterSave}`);

  return steps;
}

async function verifyPalmese(page) {
  console.log('\n[VERIFY] Naviga view mode...');
  // XAF può mostrare dialog beforeunload se c'è ancora roba unsaved — accettiamo automaticamente
  page.once('dialog', async dialog => { await dialog.accept().catch(() => {}); });
  await page.goto(
    `${ERP_URL}/CUSTTABLE_DetailView/${PALMESE_ERP_ID}/`,
    { waitUntil: 'networkidle2', timeout: 30000 }
  );
  await waitForDevExpressReady(page, { label: 'verify' });
  await wait(2000);

  // Assicura tab Principale attivo
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('*'))
      .find(el => el.textContent?.trim() === 'Principale' && el.offsetParent !== null);
    if (tab) tab.click();
  });
  await wait(1000);

  const rawValues = await page.evaluate(() => {
    const get = (pattern) => {
      const re = new RegExp(pattern, 'i');
      const el = Array.from(document.querySelectorAll('[id]'))
        .find(e => re.test(e.id) && e.offsetParent !== null);
      return el?.value?.trim() ?? el?.textContent?.trim() ?? '';
    };
    return {
      NAMEALIAS: get('NAMEALIAS'),
      FISCALCODE: get('FISCALCODE'),
      CAP: get('LOGISTICSADDRESSZIPCODE'),
      SDI: get('PDVFATTELLETTR'),
    };
  });

  const expected = {
    NAMEALIAS: 'Dr. Claudio Palmese',
    FISCALCODE: 'PLMCLD76T10A390T',
    CAP: '80038',
    SDI: 'C3UCNRB',
  };

  console.log('\n[VERIFY] Risultati:');
  const fieldsVerified = {};
  for (const [field, exp] of Object.entries(expected)) {
    const got = rawValues[field] ?? '';
    const ok = got === exp;
    fieldsVerified[field] = ok;
    console.log(`  ${field}=${got} ${ok ? '✓' : `✗ (atteso: ${exp})`}`);
  }

  return { fieldsVerified, rawValues };
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 60,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
    ignoreHTTPSErrors: true,
  });

  const report = {
    timestamp: new Date().toISOString(),
    erpUrl: ERP_URL,
    phase1: {},
    phase2Palmese: { success: false, fieldsVerified: {} },
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    const cdpSession = await page.target().createCDPSession();
    await cdpSession.send('Network.enable');

    await login(page);

    // Phase 1
    const phase1Results = await runPhase1(page, cdpSession);
    for (const [field, result] of Object.entries(phase1Results)) {
      report.phase1[field] = {
        xhrCount: result.xhrCount,
        settleMs: result.settleMs,
        timedOut: result.timedOut ?? false,
        changedFields: result.changedFields,
      };
    }

    // Phase 2
    const phase2Steps = await runPhase2(page, cdpSession);
    const { fieldsVerified, rawValues } = await verifyPalmese(page);

    report.phase2Palmese = {
      success: Object.values(fieldsVerified).every(Boolean),
      steps: phase2Steps,
      fieldsVerified,
      rawValues,
    };

    console.log('\n[FINAL] Phase 2 success:', report.phase2Palmese.success);

  } finally {
    await browser.close();

    mkdirSync(LOGS_DIR, { recursive: true });
    const date = new Date().toISOString().split('T')[0];
    const reportPath = join(LOGS_DIR, `diag-field-callbacks-${date}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n[REPORT] Salvato: ${reportPath}`);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

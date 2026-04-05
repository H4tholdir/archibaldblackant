// archibald-web-app/backend/scripts/diag/create-customer/d1-xhr-callbacks.mjs
// Sonda: per ogni campo testo del Tab Principale, quali callback XHR vengono triggerati?
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d1-xhr-callbacks.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  waitForXhrSettle, snapshotXafInputs, diffDomSnapshots, saveFindings,
  cssEscape, wait,
} from './diag-helpers.mjs';

const FIELDS_TO_PROBE = [
  { name: 'NAME',             pattern: /xaf_dviNAME_Edit_I$/,              value: 'Societa Test Diagnostica Srl' },
  { name: 'NAMEALIAS',        pattern: /xaf_dviNAMEALIAS_Edit_I$/,         value: 'SOCTEST' },
  { name: 'FISCALCODE',       pattern: /xaf_dviFISCALCODE_Edit_I$/,        value: 'TSTFSC99T01A001Z' },
  { name: 'LEGALEMAIL',       pattern: /xaf_dviLEGALEMAIL_Edit_I$/,        value: 'test@test.it' },
  { name: 'LEGALAUTHORITY',   pattern: /xaf_dviLEGALAUTHORITY_Edit_I$/,   value: 'TSTX001' },
  { name: 'STREET',           pattern: /xaf_dviSTREET_Edit_I$/,            value: 'Via Test 1' },
  { name: 'PHONE',            pattern: /xaf_dviPHONE_Edit_I$/,             value: '0810000001' },
  { name: 'CELLULARPHONE',    pattern: /xaf_dviCELLULARPHONE_Edit_I$/,    value: '3331234567' },
  { name: 'EMAIL',            pattern: /xaf_dviEMAIL_Edit_I$/,             value: 'info@test.it' },
  { name: 'URL',              pattern: /xaf_dviURL_Edit_I$/,               value: 'test.it' },
  { name: 'BRASCRMATTENTIONTO', pattern: /xaf_dviBRASCRMATTENTIONTO_Edit_I$/, value: 'Att. Ufficio Test' },
  { name: 'CUSTINFO',         pattern: /xaf_dviCUSTINFO_Edit_I$/,          value: 'Nota di test' },
];

async function probeField(page, cdpSession, { name, pattern, value }) {
  // Wait for DOM to settle before snapshotting
  await waitForDevExpressReady(page);
  const before = await snapshotXafInputs(page);

  const inputId = await page.evaluate((patSrc) => {
    const re = new RegExp(patSrc);
    const el = Array.from(document.querySelectorAll('input[id*="xaf_dvi"]'))
      .find(e => re.test(e.id) && e.offsetParent !== null);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    return el.id;
  }, pattern.source);

  if (!inputId) {
    console.warn(`[D1] Campo non trovato: ${name}`);
    return { name, found: false };
  }

  // Registra listener PRIMA del type
  const settlePromise = waitForXhrSettle(page, cdpSession);

  // Use page.evaluate to click + focus to avoid stale element ref issues after XHR DOM refresh
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ block: 'center' }); el.click(); el.focus(); el.select(); }
  }, inputId);
  await wait(80);
  // Clear existing value then type via keyboard only (no page.click() which uses element handles)
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await page.keyboard.press('Delete');
  for (const char of value) {
    await page.keyboard.type(char);
    await wait(30);
  }
  await page.keyboard.press('Tab');

  const settle = await settlePromise;
  const after = await snapshotXafInputs(page);
  const changedFields = diffDomSnapshots(before, after);

  // Filter to only _Edit_I inputs (visible fields) — ignore hidden state metadata inputs
  const relevantChanges = Object.entries(changedFields).filter(([id]) => id.endsWith('_Edit_I'));

  const result = {
    name,
    found: true,
    inputId,
    xhrFired: settle.xhrCount > 0,
    xhrCount: settle.xhrCount,
    settleMs: settle.settleMs,
    timedOut: settle.timedOut ?? false,
    affectedFields: relevantChanges.map(([id, v]) => ({
      id,
      shortName: id.replace(/^.*?xaf_dvi/, '').replace(/_Edit_I$/, ''),
      before: v.before,
      after: v.after,
    })),
  };

  const affectedLog = result.affectedFields.length
    ? result.affectedFields.map(f => `${f.shortName}: "${f.before}" → "${f.after}"`).join(', ')
    : '(nessuno)';
  console.log(`[D1] ${name}: xhr=${settle.xhrCount}, settle=${settle.settleMs}ms → ${affectedLog}`);

  return result;
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  try {
    await login(page);
    await navigateToNewCustomerForm(page);

    const cdpSession = await page.createCDPSession();
    await cdpSession.send('Network.enable');

    const findings = [];
    for (const field of FIELDS_TO_PROBE) {
      await wait(400);
      const result = await probeField(page, cdpSession, field);
      findings.push(result);
    }

    saveFindings('d1-xhr-callbacks.json', {
      certifiedAt: new Date().toISOString(),
      description: 'Per ogni campo testo del Tab Principale: quali XHR callback vengono triggerati e quali campi DOM modificano',
      findings,
    });

    console.log('\n[D1] RIEPILOGO:');
    findings.filter(f => f.xhrFired).forEach(f => {
      console.log(`  ${f.name} → modifica: ${f.affectedFields.map(a => a.shortName).join(', ')}`);
    });
    findings.filter(f => f.found && !f.xhrFired).forEach(f => {
      console.log(`  ${f.name} → nessun XHR`);
    });

  } finally {
    await browser.close();
  }
})();

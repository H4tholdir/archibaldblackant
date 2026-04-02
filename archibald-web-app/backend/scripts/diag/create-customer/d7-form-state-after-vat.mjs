// archibald-web-app/backend/scripts/diag/create-customer/d7-form-state-after-vat.mjs
// Certifica: stato form DOPO digitazione VATNUM (callback XHR ~20-28s)
// ⚠️ NON SALVA — chiude il browser senza salvare
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d7-form-state-after-vat.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  waitForXhrSettle, snapshotXafInputs, diffDomSnapshots, cssEscape, saveFindings, wait,
} from './diag-helpers.mjs';

const TEST_DATA = {
  vatnum: '15576861007',
  name: 'BRACIO SOCIETA\' A RESPONSABILITA\' LIMITATA SEMPLIFICATA',
  fiscalCode: '15576861007',
};

async function typeField(page, idPattern, value) {
  const inputId = await page.evaluate((patSrc) => {
    const re = new RegExp(patSrc);
    const el = Array.from(document.querySelectorAll('input[id*="xaf_dvi"]'))
      .find(e => re.test(e.id) && e.offsetParent !== null);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    return el.id;
  }, idPattern);

  if (!inputId) {
    console.warn(`[D7] Campo non trovato: ${idPattern}`);
    return null;
  }

  const esc = cssEscape(inputId);
  await page.click(`#${esc}`, { clickCount: 3 });
  await page.type(`#${esc}`, value, { delay: 60 });
  await page.keyboard.press('Tab');
  await wait(300);
  return inputId;
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  // CRITICAL: Never save — dismiss any dialog asking to save
  page.on('dialog', async d => {
    console.log('[D7] Dialog appeared:', d.type(), d.message());
    // Always dismiss (cancel) any save dialogs
    await d.dismiss();
  });

  try {
    await login(page);
    await navigateToNewCustomerForm(page);

    // Step 1: Type NAME first (may auto-fill NAMEALIAS)
    console.log('[D7] Step 1: Typing NAME...');
    const snapshot0 = await snapshotXafInputs(page);
    await typeField(page, 'xaf_dviNAME_Edit_I$', TEST_DATA.name);
    await wait(800);
    const snapshot1 = await snapshotXafInputs(page);
    const afterName = diffDomSnapshots(snapshot0, snapshot1);
    console.log('[D7] Changes after NAME:', JSON.stringify(afterName));

    // Step 2: Type CAP using direct input (no popup — just to establish a baseline value)
    console.log('[D7] Step 2: Typing CAP directly (baseline)...');
    const capId = await typeField(page, 'LOGISTICSADDRESSZIPCODE.*Edit_I$', '00146');
    const snapshot2 = await snapshotXafInputs(page);
    console.log('[D7] CAP value after typing:', capId ? (snapshot2[capId] ?? 'N/A') : 'field not found');

    // Step 3: Snapshot BEFORE VATNUM
    console.log('\n[D7] Step 3: Snapshot BEFORE VATNUM...');
    const snapshotBeforeVat = await snapshotXafInputs(page);

    // Step 4: Start XHR tracker BEFORE typing VATNUM
    const cdpSession = await page.createCDPSession();
    await cdpSession.send('Network.enable');
    const xhrSettlePromise = waitForXhrSettle(page, cdpSession, {
      formUrlPattern: 'CUSTTABLE_DetailView',
      quietMs: 400,
      maxWaitMs: 40000, // 40s max — VATNUM callback can take 20-28s
    });

    // Step 5: Type VATNUM
    console.log('[D7] Step 4: Typing VATNUM:', TEST_DATA.vatnum);
    const vatStart = Date.now();
    const vatnumId = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('input[id*="xaf_dvi"]'))
        .find(e => /VATNUM.*Edit_I$/.test(e.id) && e.offsetParent !== null);
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      return el.id;
    });

    if (vatnumId) {
      const esc = cssEscape(vatnumId);
      await page.click(`#${esc}`, { clickCount: 3 });
      await page.type(`#${esc}`, TEST_DATA.vatnum, { delay: 60 });
      await page.keyboard.press('Tab');
      console.log('[D7] VATNUM typed, waiting for XHR callback (up to 40s)...');
    } else {
      console.error('[D7] VATNUM field not found!');
    }

    // Step 6: Wait for XHR callback to settle
    const settle = await xhrSettlePromise;
    const vatCallbackMs = Date.now() - vatStart;
    console.log(`[D7] XHR settled: ${settle.settleMs}ms, xhrCount=${settle.xhrCount}, timedOut=${settle.timedOut}`);
    console.log(`[D7] Total time from type to settle: ${vatCallbackMs}ms`);

    await wait(500); // Extra buffer after XHR settles

    // Step 7: Snapshot AFTER VATNUM callback
    const snapshotAfterVat = await snapshotXafInputs(page);
    const changesFromVat = diffDomSnapshots(snapshotBeforeVat, snapshotAfterVat);

    console.log('\n[D7] === CHANGES CAUSED BY VATNUM CALLBACK ===');
    for (const [id, change] of Object.entries(changesFromVat)) {
      const shortName = id.replace(/^.*xaf_dvi/, '').replace(/_Edit_I$/, '');
      console.log(`  ${shortName}: "${change.before}" -> "${change.after}"`);
    }

    // Step 8: Read specific fields of interest
    const fieldsOfInterest = await page.evaluate(() => {
      const fields = [
        'VATNUM', 'NAMEALIAS', 'NAME', 'LEGALEMAIL', 'LEGALAUTHORITY',
        'LOGISTICSADDRESSZIPCODE', 'CITY', 'COUNTY', 'STATE', 'COUNTRYREGIONID',
        'VATVALIDE', 'VATVALIDATEDDATE',
      ];
      const result = {};
      for (const f of fields) {
        const el = document.querySelector(`input[id*="xaf_dvi${f}"][id*="_Edit_I"]`)
          ?? document.querySelector(`input[id*="${f}"][id*="_Edit_I"]`);
        if (el) result[f] = el.value;

        // Also check for readonly/display fields
        const displayEl = document.querySelector(`[id*="xaf_dvi${f}_View"]`);
        if (displayEl) result[`${f}_VIEW`] = displayEl.textContent?.trim();
      }
      return result;
    });

    console.log('\n[D7] Fields of interest after VATNUM:', JSON.stringify(fieldsOfInterest, null, 2));

    // Step 9: Check IVA_VALIDATA status
    const ivaValidata = await page.evaluate(() => {
      // Look for VATVALIDE field — may be a checkbox or display field
      const el = document.querySelector('[id*="VATVALIDE"]');
      if (!el) return null;
      return {
        id: el.id,
        tag: el.tagName,
        value: el.value ?? el.textContent?.trim(),
        checked: el.checked,
        class: el.className,
      };
    });
    console.log('[D7] IVA_VALIDATA state:', JSON.stringify(ivaValidata));

    // Step 10: Also snapshot ALL visible inputs for completeness
    const fullSnapshotAfter = await page.evaluate(() => {
      const snap = {};
      document.querySelectorAll('input[id*="xaf_dvi"]').forEach(el => {
        if (el.value) snap[el.id] = el.value;
      });
      // Also grab textareas
      document.querySelectorAll('textarea[id*="xaf_dvi"]').forEach(el => {
        if (el.value) snap[el.id] = el.value;
      });
      return snap;
    });
    const nonEmptyCount = Object.keys(fullSnapshotAfter).length;
    console.log(`\n[D7] Non-empty fields after VATNUM: ${nonEmptyCount}`);

    saveFindings('d7-form-state-after-vat.json', {
      certifiedAt: new Date().toISOString(),
      description: 'Stato form dopo VATNUM callback: campi modificati, timing, IVA_VALIDATA',
      testVatnum: TEST_DATA.vatnum,
      vatCallbackMs,
      xhrSettle: settle,
      changesFromVat: Object.entries(changesFromVat).map(([id, change]) => ({
        fieldId: id,
        shortName: id.replace(/^.*xaf_dvi/, '').replace(/_Edit_I$/, ''),
        before: change.before,
        after: change.after,
      })),
      fieldsOfInterest,
      ivaValidata,
      fullSnapshotAfterVat: fullSnapshotAfter,
      notes: 'Form NOT saved. Browser closed without save.',
    });

  } finally {
    // CRITICAL: Close WITHOUT saving
    console.log('\n[D7] Closing browser WITHOUT saving...');
    await browser.close();
  }
})();

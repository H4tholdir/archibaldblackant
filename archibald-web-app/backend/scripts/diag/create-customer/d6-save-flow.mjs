// archibald-web-app/backend/scripts/diag/create-customer/d6-save-flow.mjs
// Certifica: flusso completo salvataggio nuovo cliente ERP
// ⚠️ CREA UN CLIENTE TEST REALE (prefisso ZZTEST_DIAG_D6_) — eliminarlo manualmente dopo
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d6-save-flow.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  cssEscape, saveFindings, wait,
} from './diag-helpers.mjs';

// Mirrors archibald-bot.ts::typeDevExpressField
// Step 1: evaluate → scroll/focus/clear; Step 2: page.type via CSS selector (CDP events)
async function typeField(page, idPattern, value) {
  const inputId = await page.evaluate((patSrc) => {
    const re = new RegExp(patSrc);
    const inputs = Array.from(document.querySelectorAll('input,textarea'));
    const el = inputs.find(i => re.test(i.id) && i.offsetParent !== null);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.click();
    el.select?.();
    // Clear with native setter — no dispatchEvent to avoid triggering XHR
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, ''); else el.value = '';
    return el.id;
  }, idPattern);

  if (!inputId) {
    console.warn(`[D6] Campo non trovato: ${idPattern}`);
    return null;
  }

  // Use page.type with CSS selector — routes CDP key events directly to element
  const esc = cssEscape(inputId);
  await page.type(`#${esc}`, value, { delay: 5 });
  await page.keyboard.press('Tab');
  // Wait for DevExpress idle after tab press (XHR callbacks may fire)
  await waitForDevExpressReady(page, { timeout: 5000 });
  await wait(200);
  return inputId;
}

// Fill CAP via popup (mirrors archibald-bot.ts::selectFromDevExpressLookupViaIframe)
async function fillCapViaPopup(page, capCode) {
  // Click the CAP find button (B0Img) to open the popup
  const btnId = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('td,img,button,a,div')).filter(el => {
      return el.offsetParent !== null && /LOGISTICSADDRESSZIPCODE.*_B0$/.test(el.id);
    });
    if (btns.length > 0) {
      const btn = btns[btns.length - 1];
      btn.click();
      return btn.id;
    }
    // Fallback: B0Img
    const btn2 = document.querySelector('img[id*="LOGISTICSADDRESSZIPCODE"][id*="B0Img"]');
    if (btn2) { btn2.click(); return btn2.id; }
    return null;
  });
  if (!btnId) {
    console.warn('[D6] CAP popup button not found');
    return { success: false, reason: 'button-not-found' };
  }
  console.log('[D6] CAP popup button clicked:', btnId);

  // Wait for iframe
  let frame = null;
  for (let i = 0; i < 25; i++) {
    await wait(400);
    frame = page.frames().find(f => f.url().includes('FindPopup'));
    if (frame) break;
  }
  if (!frame) return { success: false, reason: 'iframe-not-found' };

  try {
    await frame.waitForFunction(
      () => document.readyState === 'complete' && !!window.ASPxClientControl?.GetControlCollection,
      { timeout: 10000, polling: 200 },
    );
  } catch { console.warn('[D6] CAP iframe not fully ready, proceeding...'); }
  await wait(300);

  // Find search input
  const searchInputId = await frame.evaluate(() => {
    const visibleInputs = Array.from(document.querySelectorAll('input[type="text"]'))
      .filter(i => i.offsetParent !== null);
    const preferred = visibleInputs.find(i => /_DXSE_I$/.test(i.id) || /_DXFREditorcol0_I$/.test(i.id));
    const target = preferred ?? visibleInputs[0] ?? null;
    if (!target) return null;
    if (!target.id) target.id = '_archibald_iframe_search_';
    return target.id;
  });

  if (!searchInputId) return { success: false, reason: 'search-input-not-found' };

  const searchInput = await frame.$(`#${cssEscape(searchInputId)}`);
  if (!searchInput) return { success: false, reason: 'elementhandle-not-found' };

  await searchInput.click({ clickCount: 3 });
  // delay:100ms required — DevExpress SAC fires textChanged callbacks between characters
  await searchInput.type(capCode, { delay: 100 });
  await wait(500);

  // Click search/filter button (B1Img)
  const searchBtnClicked = await frame.evaluate((inputId) => {
    const candidates = [
      inputId.replace(/_Ed_I$/, '_Ed_B1'),
      inputId.replace(/_DXSE_I$/, '_DXSE_Btn'),
      inputId.replace(/_DXFREditorcol0_I$/, '_DXFREditorcol0_B1'),
    ].filter(id => id !== inputId);
    for (const id of candidates) {
      const el = document.getElementById(id);
      if (el && el.offsetParent !== null) { el.click(); return id; }
    }
    return null;
  }, searchInputId);

  if (searchBtnClicked) {
    await wait(2000);
  } else {
    await searchInput.press('Enter');
    await wait(2000);
  }

  // Wait for rows to appear
  try {
    await frame.waitForFunction(
      () => document.querySelectorAll('tr[class*="dxgvDataRow"], tr[class*="dxgvFocusedRow"]').length > 0,
      { timeout: 10000, polling: 150 },
    );
  } catch { console.warn('[D6] CAP rows not detected in iframe'); }

  // Click matching row (using rowId for precision like D2 does)
  const rowInfo = await frame.evaluate((cap) => {
    const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
      .filter(r => r.offsetParent !== null);
    const matchRow = rows.find(r => r.textContent?.includes(cap)) ?? rows[0];
    if (!matchRow) return null;
    return { id: matchRow.id, text: matchRow.textContent?.trim().slice(0, 80) };
  }, capCode);

  let rowClicked = null;
  if (rowInfo?.id) {
    await frame.evaluate((id) => {
      const row = document.getElementById(id);
      row?.click();
    }, rowInfo.id);
    rowClicked = rowInfo;
  } else if (rowInfo) {
    await frame.evaluate((cap) => {
      const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
        .filter(r => r.offsetParent !== null);
      const matchRow = rows.find(r => r.textContent?.includes(cap)) ?? rows[0];
      if (matchRow) (matchRow.querySelector('td') || matchRow).click();
    }, capCode);
    rowClicked = rowInfo;
  }
  await wait(400);

  // Click OK button if present (D2 found this is needed to confirm selection)
  const okClicked = await frame.evaluate(() => {
    const okBtn = Array.from(document.querySelectorAll('a,button'))
      .find(el => el.offsetParent !== null && /^ok$/i.test((el.textContent ?? el.value ?? '').trim()));
    if (okBtn) { okBtn.click(); return okBtn.id || 'ok-btn'; }
    return null;
  });
  console.log('[D6] CAP OK button:', okClicked ?? 'not found (may not be needed)');

  // Wait for popup to close
  await page.waitForFunction(
    () => !page.frames().some(f => f.url().includes('FindPopup=true')),
    { timeout: 8000 },
  ).catch(() => {});
  await wait(600);
  await waitForDevExpressReady(page);

  // Read what got auto-filled after CAP selection
  const autoFill = await page.evaluate(() => {
    const fields = ['LOGISTICSADDRESSZIPCODE', 'CITY', 'COUNTY', 'STATE', 'COUNTRYREGIONID'];
    const result = {};
    for (const f of fields) {
      const el = document.querySelector(`input[id*="${f}"][id*="_Edit_I"]`);
      if (el) result[f] = el.value;
    }
    return result;
  });
  console.log('[D6] Auto-fill after CAP selection:', autoFill);

  return { success: !!rowClicked, btnId, searchInputId, searchBtnClicked, rowClicked, okClicked, autoFill };
}

// Two-step save: open dropdown → click "Salvare" in popup
// Mirrors archibald-bot.ts::clickSaveOnly()
async function clickSaveOnly(page) {
  const step1 = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('span,button,a'));
    const salvareBtn = allEls.find(el => {
      const text = el.textContent?.trim().toLowerCase() ?? '';
      return text.includes('salvare') || text === 'save';
    });
    if (!salvareBtn) return { opened: false, reason: 'button-not-found' };
    const parent = salvareBtn.closest('li') || salvareBtn.parentElement;
    const arrow = parent?.querySelector('img[id*="_B-1"], img[alt*="down"]');
    if (arrow) { arrow.click(); return { opened: true, via: 'arrow', id: arrow.id }; }
    salvareBtn.click();
    return { opened: true, via: 'direct-click', id: salvareBtn.id, text: salvareBtn.textContent?.trim() };
  });

  console.log('[D6] Save step 1 (open dropdown):', JSON.stringify(step1));
  await wait(800);

  const step2 = await page.evaluate(() => {
    const popups = Array.from(document.querySelectorAll(
      '[class*="dxm-popup"], [class*="subMenu"], [id*="_menu_DXI"], [class*="dxm-content"]',
    ));
    for (const popup of popups) {
      for (const item of Array.from(popup.querySelectorAll('a,span'))) {
        const text = item.textContent?.trim() ?? '';
        if ((text === 'Salvare' || text === 'Save') && item.offsetParent !== null) {
          item.click();
          return { clicked: true, via: 'popup', id: item.id, text };
        }
      }
    }
    return { clicked: false, reason: 'salvare-not-in-popup' };
  });

  console.log('[D6] Save step 2 (Salvare from popup):', JSON.stringify(step2));
  return { step1, step2 };
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  const timestamp = Date.now();
  const testName = `ZZTEST_DIAG_D6_${timestamp}`;
  const testVat = String(timestamp).slice(-11).padStart(11, '9');

  const findings = {
    testName,
    timestamp: new Date().toISOString(),
    certifiedAt: new Date().toISOString(),
    description: 'Flusso completo save nuovo cliente: fill all fields → save → ERP ID from URL',
    certifiedMandatoryFields: [
      'NAME', 'VATNUM', 'STREET', 'LOGISTICSADDRESSZIPCODE (CAP via popup)',
      'URL (fallback: nd.it)', 'probably: PHONE, MOBILE, EMAIL, SDI, PEC',
    ],
    certifiedWriteOrder: 'NAME → SDI/PEC/STREET/PHONE/MOBILE/EMAIL/URL → VATNUM (last, wait 5s) → NAMEALIAS',
    certifiedSaveFlow: 'Two-step: click SalvareSalvare → dropdown appears → click "Salvare"',
  };

  try {
    await login(page);
    await navigateToNewCustomerForm(page);

    findings.urlBefore = page.url();
    console.log('[D6] URL before fill:', findings.urlBefore);

    // Fill fields in order from archibald-bot.ts::createCustomer():
    // NAME → FISCALCODE → PEC → SDI → STREET → PHONE → MOBILE → EMAIL → URL →
    // CAP popup → VATNUM (LAST, wait 5s) → NAMEALIAS

    // 1. NAME
    const nameId = await typeField(page, 'xaf_dviNAME_Edit_I$', testName);
    await wait(500);
    await waitForDevExpressReady(page);
    findings.nameFieldId = nameId;

    // 2. FISCALCODE (codice fiscale) — fill with placeholder
    await typeField(page, 'xaf_dviFISCALCODE_Edit_I$', 'ZZTEST00A00Z000A');
    await wait(500);
    await waitForDevExpressReady(page);

    // 3. PEC (LEGALEMAIL)
    await typeField(page, 'xaf_dviLEGALEMAIL_Edit_I$', 'zztest@pec.test.it');
    await wait(400);
    await waitForDevExpressReady(page);

    // 4. SDI (LEGALAUTHORITY)
    await typeField(page, 'xaf_dviLEGALAUTHORITY_Edit_I$', 'ZZTEST000');
    await wait(400);
    await waitForDevExpressReady(page);

    // 5. STREET (Via) — mandatory
    const streetId = await typeField(page, 'xaf_dviSTREET_Edit_I$', 'Via Test Diagnostico 1');
    await wait(400);
    findings.streetFieldId = streetId;

    // 6. PHONE — international format +[1-9]\d{1,15}
    await typeField(page, 'xaf_dviPHONE_Edit_I$', '+390000000000');
    await wait(400);
    await waitForDevExpressReady(page);

    // 7. MOBILE — same international format
    await typeField(page, 'xaf_dviCELLULARPHONE_Edit_I$', '+393000000000');
    await wait(400);
    await waitForDevExpressReady(page);

    // 8. EMAIL
    await typeField(page, 'xaf_dviEMAIL_Edit_I$', 'zztest@test.it');
    await wait(400);
    await waitForDevExpressReady(page);

    // 9. URL — production bot fallback "nd.it"
    await typeField(page, 'xaf_dviURL_Edit_I$', 'nd.it');
    await wait(400);
    await waitForDevExpressReady(page);

    // 10. CAP via popup
    console.log('[D6] Filling CAP via popup...');
    const capResult = await fillCapViaPopup(page, '80038');
    findings.capPopupResult = capResult;
    console.log('[D6] CAP result:', JSON.stringify(capResult));

    // 11. VATNUM (LAST — after all other fields. Wait 5s for callbacks.)
    const vatId = await typeField(page, 'xaf_dviVATNUM_Edit_I$', testVat);
    findings.vatFieldId = vatId;
    console.log('[D6] VATNUM typed, waiting 5s for XHR callbacks...');
    await wait(5000);
    await waitForDevExpressReady(page);

    // 12. Re-fill FISCALCODE, PEC, SDI AFTER VATNUM callback settles
    // (VATNUM XHR callback with invalid VAT may clear adjacent fields)
    const fcId = await typeField(page, 'xaf_dviFISCALCODE_Edit_I$', 'ZZTEST00A00Z000A');
    await wait(400);
    await waitForDevExpressReady(page);
    const fcVal = await page.evaluate(() => {
      const el = document.querySelector('input[id*="xaf_dviFISCALCODE_Edit_I"]');
      return { id: el?.id, value: el?.value };
    });
    console.log('[D6] FISCALCODE after fill:', fcVal);

    const pecId = await typeField(page, 'xaf_dviLEGALEMAIL_Edit_I$', 'zztest@pec.test.it');
    await wait(400);
    await waitForDevExpressReady(page);
    const pecVal = await page.evaluate(() => {
      const el = document.querySelector('input[id*="xaf_dviLEGALEMAIL_Edit_I"]');
      return { id: el?.id, value: el?.value };
    });
    console.log('[D6] PEC after fill:', pecVal);

    const sdiId = await typeField(page, 'xaf_dviLEGALAUTHORITY_Edit_I$', 'ZZTEST000');
    await wait(400);
    await waitForDevExpressReady(page);
    const sdiVal = await page.evaluate(() => {
      const el = document.querySelector('input[id*="xaf_dviLEGALAUTHORITY_Edit_I"]');
      return { id: el?.id, value: el?.value };
    });
    console.log('[D6] SDI after fill:', sdiVal);
    findings.refillAfterVatnum = { fcId, fcVal, pecId, pecVal, sdiId, sdiVal };

    // 13. NAMEALIAS (after VATNUM — FISCALCODE callback overwrites it)
    const nameAliasId = await typeField(page, 'xaf_dviNAMEALIAS_Edit_I$', testName);
    findings.nameAliasFieldId = nameAliasId;
    await wait(400);
    await waitForDevExpressReady(page);

    // Verify key fields before save
    const snapshotBeforeSave = await page.evaluate(() => {
      const snap = {};
      document.querySelectorAll('input[id*="xaf_dvi"],textarea[id*="xaf_dvi"]').forEach(el => {
        if (el.value && !el.id.includes('_State') && !el.id.includes('_EditorClientInfo') && !el.id.includes('_HDN')) {
          const shortId = el.id.replace(/^.*xaf_dvi/, 'xaf_dvi');
          snap[shortId] = el.value;
        }
      });
      return snap;
    });
    findings.snapshotBeforeSave = snapshotBeforeSave;
    console.log('[D6] Key fields before save:', {
      NAME: snapshotBeforeSave['xaf_dviNAME_Edit_I'],
      NAMEALIAS: snapshotBeforeSave['xaf_dviNAMEALIAS_Edit_I'],
      VATNUM: snapshotBeforeSave['xaf_dviVATNUM_Edit_I'],
      STREET: snapshotBeforeSave['xaf_dviSTREET_Edit_I'],
      CAP: snapshotBeforeSave['xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_I'],
      URL: snapshotBeforeSave['xaf_dviURL_Edit_I'],
      PHONE: snapshotBeforeSave['xaf_dviPHONE_Edit_I'],
    });

    // Save
    console.log('\n[D6] Attempting save (two-step Salvare flow)...');
    const saveResult = await clickSaveOnly(page);
    findings.saveResult = saveResult;

    // Wait for URL to change from ?NewObject=true
    console.log('[D6] Waiting for URL change after save (max 15s)...');
    await Promise.race([
      page.waitForFunction(
        () => !window.location.search.includes('NewObject'),
        { timeout: 15000, polling: 200 },
      ).catch(() => null),
      wait(15000),
    ]);
    await waitForDevExpressReady(page);

    const urlAfterSave = page.url();
    findings.urlAfterSave = urlAfterSave;
    console.log('[D6] URL after save:', urlAfterSave);

    // Check validation errors
    const errors = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[class*="error"], [class*="Error"], [class*="validation"]'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({ id: el.id, text: el.textContent?.trim(), class: el.className }))
        .filter(e => e.text && e.text.length > 0 && e.text.length < 400);
    });
    findings.validationErrors = errors;
    if (errors.length > 0) {
      console.log('[D6] Validation errors:', JSON.stringify(errors));
    }

    // Extract ERP ID: Strategy 1 - from URL (CUSTTABLE_DetailView/{numericId}/?mode=Edit)
    const erpIdMatch = urlAfterSave.match(/CUSTTABLE_DetailView(?:Agent)?\/(\d+)\//);
    if (erpIdMatch) {
      const rawId = erpIdMatch[1];
      // ERP profile ID format: 57396 → "57.396" (thousands dot separator)
      const profileId = rawId.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      findings.erpIdFromUrl = rawId;
      findings.erpProfileId = profileId;
      findings.saveSucceeded = true;
      findings.urlPattern = `/CUSTTABLE_DetailView/{numericId}/?mode=Edit`;
      console.log('[D6] Save SUCCEEDED. ERP raw ID:', rawId, 'Profile ID:', profileId);
    } else {
      findings.erpIdFromUrl = null;
      findings.saveSucceeded = false;
      findings.urlPattern = 'unknown — save failed or used Salvare (form stays open)';
      console.log('[D6] URL after save:', urlAfterSave);

      // Strategy 2: read dviID_Edit_I from form (present even with "Salvare" in edit mode)
      const dviId = await page.evaluate(() => {
        const inp = Array.from(document.querySelectorAll('input'))
          .find(i => /xaf_dviID_Edit_I$/.test(i.id));
        return inp?.value ?? null;
      });
      findings.erpIdFromDviField = dviId;
      if (dviId && dviId.trim() && dviId !== '0') {
        findings.saveSucceeded = true;
        findings.urlPattern = `Salvare keeps form open — ID in xaf_dviID_Edit_I: ${dviId}`;
        console.log('[D6] ERP ID from dviID field:', dviId);
      } else {
        console.log('[D6] dviID_Edit_I value:', dviId, '(0 = not saved yet)');
      }
    }

    // Scan visible buttons after save
    findings.visibleButtonsAfterSave = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a,button,span,input[type="button"]'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({ id: el.id, text: (el.textContent ?? el.value ?? '').trim() }))
        .filter(el => el.text && el.text.length > 0 && el.text.length < 60)
        .slice(0, 25);
    });

  } finally {
    await browser.close();
  }

  saveFindings('d6-save-flow.json', findings);

  console.log('\n[D6] === SUMMARY ===');
  console.log('  Save succeeded:', findings.saveSucceeded);
  console.log('  ERP ID from URL:', findings.erpIdFromUrl);
  console.log('  URL pattern:', findings.urlPattern);
  console.log('  Validation errors:', findings.validationErrors?.length ?? 0);
  console.log('  Certified write order:', findings.certifiedWriteOrder);
  console.log('  Certified save flow:', findings.certifiedSaveFlow);

  if (findings.erpIdFromUrl) {
    console.log('\n⚠️  AZIONE RICHIESTA: eliminare manualmente il cliente di test dal ERP:');
    console.log(`  Nome: ${findings.testName}`);
    console.log(`  ID ERP: ${findings.erpIdFromUrl}`);
  }
})();

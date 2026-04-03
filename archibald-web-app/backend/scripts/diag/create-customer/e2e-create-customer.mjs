// e2e-create-customer.mjs
// E2E test: crea cliente reale e verifica snapshot
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/e2e-create-customer.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  waitForXhrSettle, snapshotXafInputs, diffDomSnapshots, cssEscape,
  saveFindings, wait,
} from './diag-helpers.mjs';

const CUSTOMER_DATA = {
  name: 'CENTRO DENTISTICO D.G.F. di FORTINO ANNA s.a.s.',
  vatNumber: '04464890658',
  fiscalCode: '04464890658',
  sdi: 'DUDU0GE',
  pec: null,           // non fornita
  street: 'Via Siniscalchi, 62',
  postalCode: '84014', // Nocera Inferiore (SA)
  phone: '+390000000000',
  mobile: '+390000000000',
  email: null,
  url: 'nd.it',        // fallback obbligatorio ERP
  deliveryMode: null,
  paymentTerms: null,
  lineDiscount: 'N/A',
  sector: null,
  attentionTo: null,
  notes: null,
};

// Mirrors d6-save-flow.mjs::typeField — uses page.evaluate to focus/select,
// then page.type with CSS selector to avoid stale-element-handle errors on XAF re-render.
async function typeField(page, idPattern, value) {
  if (!value) return null;
  const inputId = await page.evaluate((patSrc) => {
    const re = new RegExp(patSrc);
    const inputs = Array.from(document.querySelectorAll('input,textarea'));
    const el = inputs.find(i => re.test(i.id) && i.offsetParent !== null);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.click();
    el.select?.();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, ''); else el.value = '';
    return el.id;
  }, idPattern);

  if (!inputId) { console.warn(`[E2E] Campo non trovato: ${idPattern}`); return null; }

  const esc = cssEscape(inputId);
  await page.type(`#${esc}`, value, { delay: 5 });
  await page.keyboard.press('Tab');
  await waitForDevExpressReady(page, { timeout: 5000 });
  await wait(200);
  return inputId;
}

// Mirrors d6-save-flow.mjs::fillCapViaPopup
async function doCapLookup(page, cap, targetCity) {
  const btnId = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('td,img,button,a,div')).filter(el => {
      return el.offsetParent !== null && /LOGISTICSADDRESSZIPCODE.*_B0$/.test(el.id);
    });
    if (btns.length > 0) {
      const btn = btns[btns.length - 1];
      btn.click();
      return btn.id;
    }
    const btn2 = document.querySelector('img[id*="LOGISTICSADDRESSZIPCODE"][id*="B0Img"]');
    if (btn2) { btn2.click(); return btn2.id; }
    return null;
  });
  if (!btnId) { console.warn('[E2E] CAP popup button not found'); return { success: false, reason: 'button-not-found' }; }
  console.log('[E2E] CAP popup button clicked:', btnId);

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
  } catch { console.warn('[E2E] CAP iframe not fully ready, proceeding...'); }
  await wait(300);

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
  await searchInput.type(cap, { delay: 100 });
  await wait(500);

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

  try {
    await frame.waitForFunction(
      () => document.querySelectorAll('tr[class*="dxgvDataRow"], tr[class*="dxgvFocusedRow"]').length > 0,
      { timeout: 10000, polling: 150 },
    );
  } catch { console.warn('[E2E] CAP rows not detected in iframe'); }

  const rowInfo = await frame.evaluate((city) => {
    const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
      .filter(r => r.offsetParent !== null);
    const matchRow = rows.find(r => r.textContent?.toLowerCase().includes(city.toLowerCase())) ?? rows[0];
    if (!matchRow) return null;
    console.log('CAP rows found:', rows.length, 'first:', rows[0]?.textContent?.slice(0, 60));
    return { id: matchRow.id, text: matchRow.textContent?.trim().slice(0, 80) };
  }, targetCity ?? cap);

  console.log('[E2E] CAP row to select:', rowInfo);

  let rowClicked = null;
  if (rowInfo?.id) {
    await frame.evaluate((id) => {
      const row = document.getElementById(id);
      row?.click();
    }, rowInfo.id);
    rowClicked = rowInfo;
  } else if (rowInfo) {
    await frame.evaluate((city) => {
      const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
        .filter(r => r.offsetParent !== null);
      const matchRow = rows.find(r => r.textContent?.toLowerCase().includes(city.toLowerCase())) ?? rows[0];
      if (matchRow) (matchRow.querySelector('td') || matchRow).click();
    }, targetCity ?? cap);
    rowClicked = rowInfo;
  }
  await wait(400);

  const okClicked = await frame.evaluate(() => {
    const okBtn = Array.from(document.querySelectorAll('a,button'))
      .find(el => el.offsetParent !== null && /^ok$/i.test((el.textContent ?? el.value ?? '').trim()));
    if (okBtn) { okBtn.click(); return okBtn.id || 'ok-btn'; }
    return null;
  });
  console.log('[E2E] CAP OK button:', okClicked ?? 'not found');

  await page.waitForFunction(
    () => !page.frames().some(f => f.url().includes('FindPopup=true')),
    { timeout: 8000 },
  ).catch(() => {});
  await wait(600);
  await waitForDevExpressReady(page);

  const autoFill = await page.evaluate(() => {
    const fields = ['LOGISTICSADDRESSZIPCODE', 'CITY', 'COUNTY', 'STATE', 'COUNTRYREGIONID'];
    const result = {};
    for (const f of fields) {
      const el = document.querySelector(`input[id*="${f}"][id*="_Edit_I"]`);
      if (el) result[f] = el.value;
    }
    return result;
  });
  console.log('[E2E] CAP auto-fill:', autoFill);

  return { success: !!rowClicked, btnId, searchInputId, rowClicked, okClicked, autoFill };
}

// Mirrors d6-save-flow.mjs::clickSaveOnly
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

  console.log('[E2E] Save step 1 (open dropdown):', JSON.stringify(step1));
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

  console.log('[E2E] Save step 2 (Salvare from popup):', JSON.stringify(step2));
  return { step1, step2 };
}

async function readbackAllFields(page) {
  return page.evaluate(() => {
    const fields = [
      'NAME', 'NAMEALIAS', 'VATNUM', 'VATVALIDE', 'FISCALCODE',
      'LEGALEMAIL', 'LEGALAUTHORITY', 'STREET',
      'LOGISTICSADDRESSZIPCODE', 'CITY', 'COUNTY', 'STATE', 'COUNTRYREGIONID',
      'PHONE', 'CELLULARPHONE', 'EMAIL', 'URL',
      'BRASCRMATTENTIONTO',
    ];
    const result = {};
    for (const f of fields) {
      const el = document.querySelector(`input[id*="${f}"][id*="_Edit_I"]`)
        ?? document.querySelector(`input[id*="${f}"]`);
      if (el) result[f] = el.value;
    }
    const custinfo = document.querySelector('textarea[id*="xaf_dviCUSTINFO"]');
    if (custinfo) result['CUSTINFO'] = custinfo.value;
    return result;
  });
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  const findings = {
    certifiedAt: new Date().toISOString(),
    description: 'E2E test creazione cliente CENTRO DENTISTICO D.G.F.',
    customerData: CUSTOMER_DATA,
  };

  try {
    await login(page);
    await navigateToNewCustomerForm(page);

    console.log('\n[E2E] === SCRITTURA CAMPI (ordine certificato) ===');

    // 1. NAME
    await typeField(page, 'xaf_dviNAME_Edit_I$', CUSTOMER_DATA.name);
    await wait(500);
    await waitForDevExpressReady(page);

    // 2. FISCALCODE
    await typeField(page, 'xaf_dviFISCALCODE_Edit_I$', CUSTOMER_DATA.fiscalCode);
    await wait(400);
    await waitForDevExpressReady(page);

    // 3. PEC (LEGALEMAIL) — skip se null
    if (CUSTOMER_DATA.pec) {
      await typeField(page, 'xaf_dviLEGALEMAIL_Edit_I$', CUSTOMER_DATA.pec);
      await wait(400);
      await waitForDevExpressReady(page);
    }

    // 4. SDI (LEGALAUTHORITY)
    await typeField(page, 'xaf_dviLEGALAUTHORITY_Edit_I$', CUSTOMER_DATA.sdi);
    await wait(400);
    await waitForDevExpressReady(page);

    // 5. STREET
    await typeField(page, 'xaf_dviSTREET_Edit_I$', CUSTOMER_DATA.street);
    await wait(400);
    await waitForDevExpressReady(page);

    // 6. PHONE
    await typeField(page, 'xaf_dviPHONE_Edit_I$', CUSTOMER_DATA.phone);
    await wait(400);
    await waitForDevExpressReady(page);

    // 7. CELLULARPHONE
    await typeField(page, 'xaf_dviCELLULARPHONE_Edit_I$', CUSTOMER_DATA.mobile);
    await wait(400);
    await waitForDevExpressReady(page);

    // 8. EMAIL — skip se null
    if (CUSTOMER_DATA.email) {
      await typeField(page, 'xaf_dviEMAIL_Edit_I$', CUSTOMER_DATA.email);
      await wait(400);
      await waitForDevExpressReady(page);
    }

    // 9. URL (fallback nd.it)
    await typeField(page, 'xaf_dviURL_Edit_I$', CUSTOMER_DATA.url);
    await wait(400);
    await waitForDevExpressReady(page);

    // 10. CAP lookup
    console.log('\n[E2E] Step 10: CAP lookup...');
    const capResult = await doCapLookup(page, CUSTOMER_DATA.postalCode, 'Nocera Inferiore');
    findings.capLookupResult = capResult;
    console.log('[E2E] CAP result:', JSON.stringify(capResult));

    // 11. VATNUM (last text field — triggers XHR that can overwrite FISCALCODE/NAMEALIAS)
    console.log('\n[E2E] Step 11: VATNUM (wait 5s for XHR callbacks)...');
    await typeField(page, 'xaf_dviVATNUM_Edit_I$', CUSTOMER_DATA.vatNumber);
    console.log('[E2E] VATNUM typed, waiting 5s for callbacks...');
    await wait(5000);
    await waitForDevExpressReady(page);

    // 12. Re-fill FISCALCODE after VATNUM (VATNUM callback may overwrite it)
    await typeField(page, 'xaf_dviFISCALCODE_Edit_I$', CUSTOMER_DATA.fiscalCode);
    await wait(400);
    await waitForDevExpressReady(page);

    // 13. Re-fill SDI after VATNUM (may be cleared)
    await typeField(page, 'xaf_dviLEGALAUTHORITY_Edit_I$', CUSTOMER_DATA.sdi);
    await wait(400);
    await waitForDevExpressReady(page);

    // 14. NAMEALIAS — set last, after FISCALCODE callback that may overwrite it
    const nameAlias = CUSTOMER_DATA.name.slice(0, 20).toUpperCase();
    await typeField(page, 'xaf_dviNAMEALIAS_Edit_I$', nameAlias);
    await wait(400);
    await waitForDevExpressReady(page);

    // Snapshot before save
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
    console.log('\n[E2E] Snapshot prima di save:', {
      NAME: snapshotBeforeSave['xaf_dviNAME_Edit_I'],
      NAMEALIAS: snapshotBeforeSave['xaf_dviNAMEALIAS_Edit_I'],
      VATNUM: snapshotBeforeSave['xaf_dviVATNUM_Edit_I'],
      FISCALCODE: snapshotBeforeSave['xaf_dviFISCALCODE_Edit_I'],
      LEGALAUTHORITY: snapshotBeforeSave['xaf_dviLEGALAUTHORITY_Edit_I'],
      STREET: snapshotBeforeSave['xaf_dviSTREET_Edit_I'],
      URL: snapshotBeforeSave['xaf_dviURL_Edit_I'],
    });

    console.log('\n[E2E] === SALVATAGGIO ===');
    const saveResult = await clickSaveOnly(page);
    findings.saveResult = saveResult;

    console.log('[E2E] Waiting for URL change after save (max 15s)...');
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
    console.log('[E2E] URL after save:', urlAfterSave);

    // Check validation errors
    const errors = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[class*="error"], [class*="Error"], [class*="validation"]'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({ id: el.id, text: el.textContent?.trim(), class: el.className }))
        .filter(e => e.text && e.text.length > 0 && e.text.length < 400);
    });
    findings.validationErrors = errors;
    if (errors.length > 0) {
      console.log('[E2E] Validation errors:', JSON.stringify(errors.slice(0, 5)));
    }

    // Extract ERP ID from URL
    const erpIdMatch = urlAfterSave.match(/CUSTTABLE_DetailView(?:Agent)?\/(\d+)\//);
    let erpId = { numericId: null, formatted: null, url: urlAfterSave };
    if (erpIdMatch) {
      const numericId = erpIdMatch[1];
      const formatted = numericId.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      erpId = { numericId, formatted, url: urlAfterSave };
      findings.erpId = erpId;
      findings.saveSucceeded = true;
      console.log(`[E2E] Salvato! ERP ID: ${numericId} (${formatted})`);
    } else {
      // Fallback: read from xaf_dviID_Edit_I field
      const dviId = await page.evaluate(() => {
        const inp = Array.from(document.querySelectorAll('input'))
          .find(i => /xaf_dviID_Edit_I$/.test(i.id));
        return inp?.value ?? null;
      });
      if (dviId && dviId.trim() && dviId !== '0') {
        findings.saveSucceeded = true;
        findings.erpId = { numericId: dviId, formatted: dviId, url: urlAfterSave };
        findings.erpIdFromDviField = dviId;
        console.log('[E2E] ERP ID from dviID field:', dviId);
      } else {
        findings.saveSucceeded = false;
        console.warn('[E2E] Save may have failed. URL:', urlAfterSave);
      }
    }

    if (findings.saveSucceeded) {
      console.log('\n[E2E] === READBACK (verifica persistenza) ===');
      await wait(1000);
      const readback = await readbackAllFields(page);
      findings.readback = readback;

      console.log('\n[E2E] Campi letti dall\'ERP:');
      for (const [k, v] of Object.entries(readback)) {
        console.log(`  ${k}: "${v}"`);
      }

      const divergences = [];
      const toCheck = [
        { sent: CUSTOMER_DATA.name, key: 'NAME' },
        { sent: CUSTOMER_DATA.vatNumber, key: 'VATNUM' },
        { sent: CUSTOMER_DATA.fiscalCode, key: 'FISCALCODE' },
        { sent: CUSTOMER_DATA.sdi, key: 'LEGALAUTHORITY' },
        { sent: CUSTOMER_DATA.street, key: 'STREET' },
        { sent: CUSTOMER_DATA.url, key: 'URL' },
      ];
      for (const { sent, key } of toCheck) {
        if (!sent) continue;
        const actual = readback[key] ?? '';
        if (sent.trim().toLowerCase() !== actual.trim().toLowerCase()) {
          divergences.push({ field: key, sent, actual });
          console.warn(`  DIVERGENZA ${key}: inviato="${sent}" != letto="${actual}"`);
        }
      }
      findings.divergences = divergences;

      if (divergences.length === 0) {
        console.log('\n  Tutti i campi verificati coincidono!');
      }
    }

    saveFindings('e2e-create-customer.json', findings);

    console.log('\n[E2E] === COMPLETATO ===');
    if (findings.erpId?.formatted) {
      console.log(`  ERP ID: ${findings.erpId.formatted}`);
      console.log(`  URL: ${findings.erpId.url}`);
    }
    console.log('\nIl cliente e\' stato creato nell\'ERP. Verificare e aggiornare i dati (telefono placeholder, ecc.)');

  } catch (err) {
    console.error('[E2E] ERRORE:', err.message);
    console.error(err.stack);
    findings.error = err.message;
    saveFindings('e2e-create-customer.json', findings);
  } finally {
    await browser.close();
  }
})();

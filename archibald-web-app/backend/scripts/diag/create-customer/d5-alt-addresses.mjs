// archibald-web-app/backend/scripts/diag/create-customer/d5-alt-addresses.mjs
// Certifica: CRUD indirizzi alternativi nel form cliente ERP (tab "Indirizzo alt." + griglia ADDRESSes)
// Strategia: "Indirizzo alt." è un TAB della form (non una griglia bottom) — navigare al tab,
// poi scansionare la griglia inside. Memory erp-customer-form-fields.md pre-documenta il flow.
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d5-alt-addresses.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  saveFindings, wait,
} from './diag-helpers.mjs';

// ──────────────────────────────────────────────────────────────────────────────
// Step 1: Scan all tabs on the new customer form
// ──────────────────────────────────────────────────────────────────────────────

async function scanAllTabsAndGrids(page) {
  return page.evaluate(() => {
    const tabs = Array.from(
      document.querySelectorAll('li.dxtc-tab, li.dxtc-lead, li.dxtc-activeTab, a.dxtc-link')
    )
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, text: (el.textContent ?? '').trim(), tag: el.tagName }))
      .filter(el => el.text.length > 0 && el.text.length < 80);

    // Deduplicate by text
    const seen = new Set();
    const uniqueTabs = tabs.filter(t => {
      if (seen.has(t.text)) return false;
      seen.add(t.text);
      return true;
    });

    return { tabs: uniqueTabs };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 2: Navigate to "Indirizzo alt." tab, then scan everything inside
// NOTE: From run 1, "Indirizzo alt." is definitely a TAB (not a bottom section)
// ──────────────────────────────────────────────────────────────────────────────

async function navigateToAltAddressTab(page) {
  // Try multiple possible tab labels
  const tabLabels = ['Indirizzo alt.', 'Indirizzi alternativi', 'Addresses', 'Alt. Addresses'];

  for (const label of tabLabels) {
    const clicked = await page.evaluate((lbl) => {
      const el = Array.from(document.querySelectorAll('li.dxtc-tab, li.dxtc-lead, li.dxtc-activeTab, a.dxtc-link, a, span'))
        .filter(e => e.offsetParent !== null)
        .find(e => (e.textContent ?? '').trim() === lbl);
      if (el) { el.click(); return { clicked: true, id: el.id, tag: el.tagName }; }
      return { clicked: false };
    }, label);

    if (clicked.clicked) {
      console.log(`[D5] Clicked tab "${label}":`, JSON.stringify(clicked));
      await waitForDevExpressReady(page, { label: `tab-${label}` });
      await wait(800);
      return { label, ...clicked };
    }
    console.log(`[D5] Tab "${label}" not found, trying next...`);
  }

  return { clicked: false, reason: 'No address tab found with known labels' };
}

async function scanAddressGrid(page) {
  return page.evaluate(() => {
    // All visible elements after tab switch — broad scan
    const newBtns = Array.from(document.querySelectorAll('img[title="New"], a[title="New"], img[title="Nuovo"], a[title="Nuovo"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, title: el.title, tag: el.tagName }));

    // All visible toolbar elements including their text/title
    const toolbars = Array.from(document.querySelectorAll('[id*="ToolBar"], [id*="Toolbar"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        id: el.id,
        tag: el.tagName,
        text: (el.innerText ?? el.textContent ?? '').trim().slice(0, 40),
        title: el.title ?? '',
      }))
      .slice(0, 30);

    // All visible grid containers (broadened scan — no ADDRESSes filter yet)
    const gridContainers = Array.from(document.querySelectorAll('table, div[id*="gv"], div[id*="Grid"]'))
      .filter(el => el.offsetParent !== null && el.id)
      .map(el => ({ id: el.id, tag: el.tagName }))
      .filter(el => el.id.length > 5)
      .slice(0, 20);

    // All visible data rows
    const dataRows = Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[class*="DataRow"]'))
      .filter(el => el.offsetParent !== null)
      .map((row, idx) => ({
        rowIndex: idx,
        rowId: row.id,
        cells: Array.from(row.querySelectorAll('td')).map(td => ({
          colIndex: td.cellIndex,
          text: (td.innerText ?? td.textContent ?? '').trim().slice(0, 50),
        })),
      }));

    // All header cells
    const headers = Array.from(document.querySelectorAll('th, td.dxgvHeader_XafTheme'))
      .filter(el => el.offsetParent !== null)
      .map(el => (el.innerText ?? el.textContent ?? '').trim())
      .filter(Boolean);

    // All visible inputs (to see if there's anything interactive)
    const visibleInputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, value: el.value, readOnly: el.readOnly }))
      .slice(0, 20);

    // All visible buttons/links in ADDRESSes area with text/title
    const addressAreaBtns = Array.from(
      document.querySelectorAll('[id*="ADDRESSes"] a, [id*="ADDRESSes"] button, [id*="ADDRESSes"] img')
    )
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        id: el.id,
        tag: el.tagName,
        text: (el.innerText ?? el.textContent ?? '').trim().slice(0, 30),
        title: el.title ?? '',
        src: el.tagName === 'IMG' ? (el.src ?? '').split('/').slice(-1)[0] : undefined,
      }))
      .slice(0, 30);

    // DevExpress grid command buttons (DXCBtn pattern)
    const cmdBtns = Array.from(document.querySelectorAll('[id*="DXCBtn"], [id*="DXCmd"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        id: el.id,
        tag: el.tagName,
        title: el.title ?? '',
        text: (el.innerText ?? el.textContent ?? '').trim().slice(0, 30),
        src: el.tagName === 'IMG' ? (el.src ?? '').split('/').slice(-1)[0] : undefined,
      }))
      .slice(0, 20);

    return { newBtns, toolbars, gridContainers, dataRows, headers, visibleInputs, addressAreaBtns, cmdBtns };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 4: Click the "New" button in ADDRESSes grid and capture the inline row
// From run 2: New button is in toolbar as DXI0_T anchor element (not img[title="New"])
// Grid key: ...xaf_dviADDRESSes_v7_..._LE_v7 with StartEditRow + UpdateEdit
// ──────────────────────────────────────────────────────────────────────────────

async function clickNewAddressAndScanRow(page) {
  const beforeInputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input[id*="editnew"], input[id*="xaf_"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => el.id)
  );

  const clickResult = await page.evaluate(() => {
    // Strategy 1: DevExpress grid AddNewRow via window global (most reliable)
    // Key pattern: ...xaf_dviADDRESSes_v7_..._LE_v7
    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        const obj = window[key];
        if (!obj || typeof obj !== 'object') continue;
        if (!/ADDRESSes.*LE_v\d+$/i.test(key)) continue;
        if (typeof obj.AddNewRow === 'function') {
          obj.AddNewRow();
          return { found: true, method: 'AddNewRow-window-global', key };
        }
      } catch { /* ignore */ }
    }

    // Strategy 2: Look for "Crea nuovo" / "Nuovo" text in ADDRESSes area links
    const addrLinks = Array.from(document.querySelectorAll('[id*="ADDRESSes"] a, [id*="ADDRESSes"] span'))
      .filter(el => el.offsetParent !== null);
    const newLink = addrLinks.find(el => {
      const t = (el.textContent ?? '').trim().toLowerCase();
      return t === 'new' || t === 'nuovo' || t === 'crea nuovo' || t === '+';
    });
    if (newLink) {
      newLink.click();
      return { found: true, method: 'text-link', id: newLink.id, text: newLink.textContent?.trim() };
    }

    // Strategy 3: DXCBtn buttons (DevExpress command buttons for grids)
    const cmdBtns = Array.from(document.querySelectorAll('[id*="ADDRESSes"][id*="DXCBtn"]'))
      .filter(el => el.offsetParent !== null);
    if (cmdBtns.length > 0) {
      cmdBtns[0].click();
      return { found: true, method: 'DXCBtn', id: cmdBtns[0].id };
    }

    // Fallback: log all ADDRESSes clickable elements for diagnosis
    const allAddressElems = Array.from(document.querySelectorAll('[id*="ADDRESSes"] a, [id*="ADDRESSes"] img, [id*="ADDRESSes"] button'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, tag: el.tagName, title: el.title, text: (el.innerText ?? '').trim().slice(0, 20) }));

    return { found: false, allAddressElems };
  });

  console.log('[D5] Click "New" result:', JSON.stringify(clickResult));

  // Wait longer for the new inline edit row to appear
  await wait(2000);
  await waitForDevExpressReady(page, { label: 'after-new-address' });
  await wait(500);

  // Broad scan — capture everything that changed
  const afterInputs = await page.evaluate(() => {
    // Editnew pattern
    const editnewInputs = Array.from(document.querySelectorAll('input[id*="editnew"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, value: el.value, readOnly: el.readOnly, type: el.type }));

    // All xaf inputs (might be in a new row with different pattern)
    const xafInputsInGrid = Array.from(document.querySelectorAll('[id*="ADDRESSes"] input'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, value: el.value, readOnly: el.readOnly, type: el.type }));

    // Any new TR rows (including edit rows)
    const allRows = Array.from(document.querySelectorAll('[id*="ADDRESSes"] tr'))
      .filter(el => el.offsetParent !== null)
      .map(row => ({
        rowId: row.id,
        class: row.className,
        cellCount: row.querySelectorAll('td').length,
        hasInputs: row.querySelectorAll('input').length > 0,
        firstCellText: (row.querySelector('td')?.innerText ?? '').trim().slice(0, 30),
      }));

    // Combo buttons in ADDRESSes grid
    const addrComboBtns = Array.from(document.querySelectorAll('[id*="ADDRESSes"] img[id*="B-1Img"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, title: el.title }));

    // Look for edit row via class (DevExpress uses dxgvEditingRow or similar)
    const editRows = Array.from(document.querySelectorAll('[class*="EditRow"], [id*="EditRow"], [class*="dxgvERow"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, class: el.className.slice(0, 60) }));

    // IADD button (row-level add button observed from run 3)
    const iaddBtns = Array.from(document.querySelectorAll('[id*="IADD"], [id*="IADU"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, tag: el.tagName, title: el.title }));

    return { editnewInputs, xafInputsInGrid, allRows, addrComboBtns, editRows, iaddBtns };
  });

  const newInputIds = afterInputs.xafInputsInGrid
    .map(i => i.id)
    .filter(id => !beforeInputs.includes(id));

  console.log('[D5] New inputs in ADDRESSes grid:', JSON.stringify(afterInputs.xafInputsInGrid));
  console.log('[D5] editnew inputs:', JSON.stringify(afterInputs.editnewInputs));
  console.log('[D5] All ADDRESSes rows:', JSON.stringify(afterInputs.allRows));
  console.log('[D5] Edit rows:', JSON.stringify(afterInputs.editRows));
  console.log('[D5] IADD buttons:', JSON.stringify(afterInputs.iaddBtns));
  console.log('[D5] ADDRESSes combo buttons:', JSON.stringify(afterInputs.addrComboBtns));

  return { clickResult, afterInputs, newInputIds };
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 5: Scan the TYPE combo options for alt address
// From run 2: window globals already contain TYPE combo options (4 items discovered)
// Key pattern: ...ADDRESSes_v7_..._LE_v7_DXFREditorcol19
// ──────────────────────────────────────────────────────────────────────────────

async function scanTypeComboOptions(page) {
  // The TYPE combo is already registered in window globals from the filter row
  // No need to click "New" first — it's accessible via window globals
  const windowScan = await page.evaluate(() => {
    const results = [];
    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        const obj = window[key];
        if (!obj || typeof obj !== 'object') continue;
        if (typeof obj.GetItem !== 'function' || typeof obj.GetItemCount !== 'function') continue;
        if (!/ADDRESSes/i.test(key) || /Menu|Context|FilterRow/i.test(key)) continue;
        const count = obj.GetItemCount();
        if (count === 0) continue;
        const items = [];
        for (let i = 0; i < Math.min(count, 20); i++) {
          const item = obj.GetItem(i);
          if (item) items.push({ text: item.text, value: item.value });
        }
        results.push({ key, count, items });
      } catch { /* ignore */ }
    }
    return results;
  });

  // Also try to open the TYPE combo in the editnew row (if present)
  const editnewTypeBtn = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('img[id*="editnew"][id*="TYPE"][id*="B-1Img"]'))
      .find(el => el.offsetParent !== null);
    if (btn) {
      btn.click();
      return { found: true, id: btn.id };
    }
    // Also try any editnew B-1Img
    const anyBtn = Array.from(document.querySelectorAll('img[id*="editnew"][id*="B-1Img"]'))
      .find(el => el.offsetParent !== null);
    if (anyBtn) {
      anyBtn.click();
      return { found: true, method: 'first-editnew-combo', id: anyBtn.id };
    }
    return { found: false };
  });

  await wait(400);

  const domItems = await page.evaluate(() =>
    Array.from(document.querySelectorAll('li[class*="dxeListBoxItem"], td[class*="dxeListBoxItem"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ text: (el.innerText ?? el.textContent ?? '').trim(), id: el.id }))
  );

  if (editnewTypeBtn.found) {
    await page.keyboard.press('Escape');
    await wait(300);
  }

  return { windowScan, editnewTypeBtn, domItems };
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 5: Cancel the new row (Escape) and verify the grid is still intact
// ──────────────────────────────────────────────────────────────────────────────

async function cancelNewRow(page) {
  // Press Escape to cancel the new row edit
  await page.keyboard.press('Escape');
  await wait(500);
  await waitForDevExpressReady(page, { label: 'cancel-new-row' });

  // Verify no editnew inputs remain visible
  const remainingEditnew = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input[id*="editnew"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => el.id)
  );

  return { remainingEditnew };
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 7: Full CRUD probe — try IADD button + AddNewRow on new form, then on existing customer
// Key finding: AddNewRow() calls succeed but no edit row appears on unsaved form
// Hypothesis: ERP requires customer to be saved before adding alt addresses
// ──────────────────────────────────────────────────────────────────────────────

async function probeFullAddressAdd(page) {
  // Try IADD button (row-level add — seen in addressAreaBtns)
  const iaddResult = await page.evaluate(() => {
    const iaddBtn = Array.from(document.querySelectorAll('[id*="IADD"]'))
      .find(el => el.offsetParent !== null);
    if (iaddBtn) {
      iaddBtn.click();
      return { found: true, id: iaddBtn.id, method: 'IADD-btn' };
    }
    return { found: false };
  });
  console.log('[D5] IADD button click:', JSON.stringify(iaddResult));

  await wait(1500);
  await waitForDevExpressReady(page, { label: 'after-IADD' });

  // Check if any edit row appeared
  const afterIADD = await page.evaluate(() => {
    const editnewInputs = Array.from(document.querySelectorAll('input[id*="editnew"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, value: el.value }));
    const editRows = Array.from(document.querySelectorAll('[class*="EditRow"], [class*="dxgvERow"], [id*="EditRow"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, class: el.className.slice(0, 80) }));
    const allAddrInputs = Array.from(document.querySelectorAll('[id*="ADDRESSes"] input'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, value: el.value, readOnly: el.readOnly }));
    return { editnewInputs, editRows, allAddrInputs };
  });
  console.log('[D5] After IADD click — editnew:', JSON.stringify(afterIADD.editnewInputs));
  console.log('[D5] After IADD click — allAddrInputs:', JSON.stringify(afterIADD.allAddrInputs));
  console.log('[D5] After IADD click — editRows:', JSON.stringify(afterIADD.editRows));

  // AddNewRow via window global (second try after IADD)
  const newClicked = await page.evaluate(() => {
    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        const obj = window[key];
        if (!obj || typeof obj !== 'object') continue;
        if (!/ADDRESSes.*LE_v\d+$/i.test(key)) continue;
        if (typeof obj.AddNewRow === 'function') {
          obj.AddNewRow();
          return { found: true, method: 'AddNewRow', key };
        }
      } catch { /* ignore */ }
    }
    return { found: false };
  });

  if (!newClicked.found) {
    return { iaddResult, afterIADD, skipped: true, reason: 'AddNewRow not found for full probe' };
  }

  await wait(2000);
  await waitForDevExpressReady(page, { label: 'full-probe-new' });

  // Read all visible editnew inputs
  const editnewFields = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input[id*="editnew"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => {
        const idMatch = el.id.match(/editnew_\d+_xaf_([A-Z0-9_]+)_Edit_I$/i);
        return {
          id: el.id,
          shortName: idMatch ? idMatch[1] : el.id,
          value: el.value,
          readOnly: el.readOnly,
          type: el.type,
        };
      });
  });

  console.log('[D5] Full probe editnew fields:');
  editnewFields.forEach(f => console.log(`  ${f.shortName}: "${f.value}" (readOnly=${f.readOnly})`));

  // Try to scan the TYPE combo options via window globals (already triggered from previous step)
  const typeOptions = await page.evaluate(() => {
    const result = [];
    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        const obj = window[key];
        if (!obj || typeof obj !== 'object') continue;
        if (typeof obj.GetItem !== 'function' || typeof obj.GetItemCount !== 'function') continue;
        if (!/TYPE/i.test(key) || /Menu|Context|FilterRow/i.test(key)) continue;
        const count = obj.GetItemCount();
        if (count === 0) continue;
        const items = [];
        for (let i = 0; i < Math.min(count, 20); i++) {
          const item = obj.GetItem(i);
          if (item) items.push({ text: item.text, value: item.value });
        }
        result.push({ key, count, items });
      } catch { /* ignore */ }
    }
    return result;
  });

  // Try to open the TYPE combo to trigger lazy init
  await page.evaluate(() => {
    // Find TYPE B-1Img button in editnew row
    const btn = Array.from(document.querySelectorAll('img[id*="editnew"][id*="TYPE"][id*="B-1Img"]'))
      .find(el => el.offsetParent !== null);
    if (btn) btn.click();
  });
  await wait(600);

  const typeOptionsAfterClick = await page.evaluate(() => {
    const domItems = Array.from(document.querySelectorAll('li[class*="dxeListBoxItem"], td[class*="dxeListBoxItem"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ text: (el.innerText ?? el.textContent ?? '').trim(), id: el.id }));

    const windowItems = [];
    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        const obj = window[key];
        if (!obj || typeof obj !== 'object') continue;
        if (typeof obj.GetItem !== 'function' || typeof obj.GetItemCount !== 'function') continue;
        if (!/TYPE/i.test(key) || /Menu|Context|FilterRow/i.test(key)) continue;
        const count = obj.GetItemCount();
        if (count === 0) continue;
        const items = [];
        for (let i = 0; i < Math.min(count, 20); i++) {
          const item = obj.GetItem(i);
          if (item) items.push({ text: item.text, value: item.value, key });
        }
        windowItems.push(...items);
      } catch { /* ignore */ }
    }

    return { domItems, windowItems };
  });

  console.log('[D5] TYPE combo options (DOM):', JSON.stringify(typeOptionsAfterClick.domItems));
  console.log('[D5] TYPE combo options (window):', JSON.stringify(typeOptionsAfterClick.windowItems));

  await page.keyboard.press('Escape'); // close combo
  await wait(300);

  // Cancel the new row
  await page.keyboard.press('Escape');
  await wait(500);
  await waitForDevExpressReady(page, { label: 'full-probe-cancel' });

  return {
    iaddResult,
    afterIADD,
    newClicked,
    editnewFields,
    typeOptionsBeforeClick: typeOptions,
    typeOptionsAfterClick,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Bonus: Navigate to existing customer and probe alt address add
// Uses test customer 55839 (Pescuma Dr. Saverio) to certify full CRUD on saved form
// ──────────────────────────────────────────────────────────────────────────────

async function probeOnExistingCustomer(page) {
  const ERP_URL = 'https://4.231.124.90/Archibald';
  const TEST_CUSTOMER_ID = '55.839'; // Pescuma Dr. Saverio — known test customer

  // Navigate directly to edit mode for existing customer
  await page.goto(`${ERP_URL}/CUSTTABLE_DetailView/${TEST_CUSTOMER_ID}/?mode=Edit`, {
    waitUntil: 'networkidle2', timeout: 60000,
  });
  await waitForDevExpressReady(page, { label: 'existing-customer-edit' });
  await wait(1000);

  // Verify we're in edit mode
  const editClicked = await page.evaluate(() => {
    const url = window.location.href;
    const hasEditMode = url.includes('mode=Edit') || url.includes('?NewObject');
    // Look for save button (edit mode indicator)
    const saveBtn = Array.from(document.querySelectorAll('a,button'))
      .find(el => el.offsetParent !== null && (el.title === 'Salvare' || /^salvar/i.test((el.textContent ?? '').trim())));
    return { url, hasEditMode, hasSaveBtn: !!saveBtn, saveBtnId: saveBtn?.id };
  });
  console.log('[D5] Edit mode check:', JSON.stringify(editClicked));

  // Navigate to "Indirizzo alt." tab
  const tabNav = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('li.dxtc-tab, li.dxtc-lead, li.dxtc-activeTab, a.dxtc-link, a, span'))
      .filter(e => e.offsetParent !== null)
      .find(e => (e.textContent ?? '').trim() === 'Indirizzo alt.');
    if (el) { el.click(); return { clicked: true, id: el.id }; }
    return { clicked: false };
  });
  console.log('[D5] Tab nav on existing customer:', JSON.stringify(tabNav));

  await waitForDevExpressReady(page, { label: 'existing-tab-indirizzo' });
  await wait(800);

  // Scan existing rows
  const existingRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme'))
      .filter(el => el.offsetParent !== null)
      .map((row, idx) => ({
        rowIndex: idx,
        rowId: row.id,
        cells: Array.from(row.querySelectorAll('td')).map((td, ci) => ({
          ci,
          text: (td.innerText ?? td.textContent ?? '').trim().slice(0, 40),
        })).filter(c => c.text),
      }));
    return rows;
  });
  console.log('[D5] Existing rows on saved customer:', JSON.stringify(existingRows));

  // Try AddNewRow on the existing customer form
  const addNewResult = await page.evaluate(() => {
    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        const obj = window[key];
        if (!obj || typeof obj !== 'object') continue;
        if (!/ADDRESSes.*LE_v\d+$/i.test(key)) continue;
        if (typeof obj.AddNewRow === 'function') {
          obj.AddNewRow();
          return { found: true, method: 'AddNewRow', key };
        }
      } catch { /* ignore */ }
    }
    // Fallback: IADD button
    const iaddBtn = Array.from(document.querySelectorAll('[id*="IADD"]'))
      .find(el => el.offsetParent !== null);
    if (iaddBtn) {
      iaddBtn.click();
      return { found: true, method: 'IADD-btn', id: iaddBtn.id };
    }
    return { found: false };
  });
  console.log('[D5] AddNewRow on existing customer:', JSON.stringify(addNewResult));

  await wait(2000);
  await waitForDevExpressReady(page, { label: 'existing-after-addnew' });

  // Scan for edit row inputs
  const editRowScan = await page.evaluate(() => {
    const editnewInputs = Array.from(document.querySelectorAll('input[id*="editnew"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => {
        const m = el.id.match(/editnew_(\d+)_xaf_([A-Z0-9_]+)_Edit_I$/i);
        return { id: el.id, rowIdx: m ? m[1] : '?', fieldName: m ? m[2] : el.id, value: el.value, readOnly: el.readOnly };
      });

    const allAddrInputs = Array.from(document.querySelectorAll('[id*="ADDRESSes"] input:not([type="hidden"])'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, value: el.value, readOnly: el.readOnly }));

    const editRows = Array.from(document.querySelectorAll('[class*="ERow"], [class*="EditRow"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, class: el.className.slice(0, 80) }));

    const comboBtns = Array.from(document.querySelectorAll('[id*="editnew"][id*="B-1Img"], [id*="ADDRESSes"][id*="B-1Img"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id }));

    return { editnewInputs, allAddrInputs, editRows, comboBtns };
  });

  console.log('[D5] Edit row inputs (existing customer):', JSON.stringify(editRowScan.editnewInputs));
  console.log('[D5] All ADDRESSes inputs:', JSON.stringify(editRowScan.allAddrInputs));
  console.log('[D5] Edit rows:', JSON.stringify(editRowScan.editRows));
  console.log('[D5] Combo buttons in editnew:', JSON.stringify(editRowScan.comboBtns));

  // Cancel without saving
  await page.keyboard.press('Escape');
  await wait(500);

  return { editClicked, tabNav, existingRows, addNewResult, editRowScan };
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 7: Scan ALL window globals for ADDRESS-related DevExpress controls
// ──────────────────────────────────────────────────────────────────────────────

async function scanWindowGlobalsForAddressControls(page) {
  return page.evaluate(() => {
    const results = [];
    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        const obj = window[key];
        if (!obj || typeof obj !== 'object') continue;
        // Check for DevExpress grid-like objects with StartEditRow
        if (typeof obj.StartEditRow === 'function' && /ADDRESSes|address/i.test(key)) {
          results.push({ key, type: 'grid', hasStartEditRow: true, hasUpdateEdit: typeof obj.UpdateEdit === 'function' });
        }
        // Check for combo controls related to address
        if (typeof obj.GetItem === 'function' && typeof obj.GetItemCount === 'function') {
          if (/ADDRESSes|TYPE|editnew/i.test(key) && !/Menu|Context|FilterRow/i.test(key)) {
            const count = obj.GetItemCount();
            if (count > 0) {
              const items = [];
              for (let i = 0; i < Math.min(count, 20); i++) {
                const item = obj.GetItem(i);
                if (item) items.push({ text: item.text, value: item.value });
              }
              results.push({ key, type: 'combo', count, items });
            }
          }
        }
      } catch { /* ignore */ }
    }
    return results;
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  // CRITICAL: global dialog handler — native window.confirm for delete
  page.on('dialog', async d => {
    console.log('[D5] Dialog intercepted:', d.type(), d.message().slice(0, 80));
    await d.accept();
  });

  try {
    await login(page);
    await navigateToNewCustomerForm(page);

    // Step 1: Scan all tabs (to discover tab names)
    console.log('\n[D5] === Step 1: Scan all tabs ===');
    const tabsAndGrids = await scanAllTabsAndGrids(page);
    console.log('[D5] Tabs found:', JSON.stringify(tabsAndGrids.tabs.map(t => t.text)));

    // Step 2: Navigate to "Indirizzo alt." tab
    console.log('\n[D5] === Step 2: Navigate to alt address tab ===');
    const tabNav = await navigateToAltAddressTab(page);
    console.log('[D5] Tab navigation result:', JSON.stringify(tabNav));

    // Step 3: Scan the grid inside the tab
    console.log('\n[D5] === Step 3: Scan grid inside alt address tab ===');
    const gridScan = await scanAddressGrid(page);
    console.log('[D5] New buttons found:', JSON.stringify(gridScan.newBtns));
    console.log('[D5] Toolbars (first 10):', JSON.stringify(gridScan.toolbars.slice(0, 10)));
    console.log('[D5] Grid containers (first 5):', JSON.stringify(gridScan.gridContainers.slice(0, 5)));
    console.log('[D5] Headers:', JSON.stringify(gridScan.headers));
    console.log('[D5] Existing data rows:', gridScan.dataRows.length);
    console.log('[D5] ADDRESSes area buttons:', JSON.stringify(gridScan.addressAreaBtns));
    console.log('[D5] DXCBtn command buttons:', JSON.stringify(gridScan.cmdBtns));

    // Step 4: Click "New" and scan the inline edit row
    console.log('\n[D5] === Step 4: Click New and scan inline edit row ===');
    const newRowScan = await clickNewAddressAndScanRow(page);

    // Step 5: Scan TYPE combo options
    console.log('\n[D5] === Step 5: Scan TYPE combo options ===');
    const typeCombo = await scanTypeComboOptions(page);
    console.log('[D5] TYPE combo:', JSON.stringify(typeCombo));

    // Step 6: Cancel the new row
    console.log('\n[D5] === Step 6: Cancel new row ===');
    const cancelResult = await cancelNewRow(page);
    console.log('[D5] Remaining editnew inputs after cancel:', cancelResult.remainingEditnew.length);

    // Step 7: Full CRUD probe (IADD + AddNewRow + TYPE combo on new form)
    console.log('\n[D5] === Step 7: Full CRUD probe on new form ===');
    const fullProbe = await probeFullAddressAdd(page);

    // Step 8: Window globals scan
    console.log('\n[D5] === Step 8: Window globals for ADDRESS controls ===');
    const windowGlobals = await scanWindowGlobalsForAddressControls(page);
    console.log('[D5] Address-related window globals:', JSON.stringify(windowGlobals, null, 2));

    // Step 9: Probe on existing saved customer (ID 55.839) to certify full CRUD
    console.log('\n[D5] === Step 9: Probe on existing customer 55.839 ===');
    const existingCustomerProbe = await probeOnExistingCustomer(page);

    // Summary
    console.log('\n[D5] === FINAL SUMMARY ===');
    console.log('  Tabs found:', tabsAndGrids.tabs.map(t => t.text).join(', '));
    console.log('  Tab navigation:', JSON.stringify(tabNav));
    console.log('  New buttons found:', gridScan.newBtns.length);
    console.log('  AddNewRow result (new form):', JSON.stringify(newRowScan.clickResult));
    console.log('  IADD button result:', JSON.stringify(fullProbe.iaddResult));
    console.log('  New-row inputs on new form:', newRowScan.newInputIds.length);
    console.log('  Existing customer add new result:', JSON.stringify(existingCustomerProbe.addNewResult));
    console.log('  Existing customer editnew fields:', existingCustomerProbe.editRowScan?.editnewInputs?.length ?? 0);
    console.log('  TYPE combo window items (certified):', typeCombo.windowScan?.length ?? 0);

    saveFindings('d5-alt-addresses.json', {
      certifiedAt: new Date().toISOString(),
      description: 'CRUD indirizzi alternativi: tab discovery, struttura griglia ADDRESSes, flusso new-row inline edit, opzioni TYPE combo.',
      tabsOnPage: tabsAndGrids.tabs,
      tabNavigation: tabNav,
      gridScan: {
        newBtns: gridScan.newBtns,
        toolbars: gridScan.toolbars,
        headers: gridScan.headers,
        gridContainers: gridScan.gridContainers,
        existingRows: gridScan.dataRows.length,
        visibleInputs: gridScan.visibleInputs,
      },
      newRowProbe: {
        clickResult: newRowScan.clickResult,
        newInputIds: newRowScan.newInputIds,
        editnewInputs: newRowScan.afterInputs.editnewInputs,
        comboBtns: newRowScan.afterInputs.comboBtns,
      },
      typeCombo,
      cancelResult,
      fullProbeOnNewForm: {
        iaddResult: fullProbe.iaddResult,
        afterIADD: fullProbe.afterIADD,
        newClicked: fullProbe.newClicked,
        editnewFields: fullProbe.editnewFields,
        typeOptionsBeforeClick: fullProbe.typeOptionsBeforeClick,
        typeOptionsAfterClick: fullProbe.typeOptionsAfterClick,
      },
      windowGlobals,
      existingCustomerProbe,
    });

  } finally {
    await browser.close();
  }
})();

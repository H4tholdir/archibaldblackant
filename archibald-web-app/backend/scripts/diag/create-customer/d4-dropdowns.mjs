// archibald-web-app/backend/scripts/diag/create-customer/d4-dropdowns.mjs
// Certifica: opzioni esatte di ogni dropdown + verifica XHR side-effects + persistenza dopo switch tab
// Strategia: A6 window-scan per GetItem/GetItemCount (DevExpress registra ogni control come window global)
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d4-dropdowns.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  snapshotXafInputs, saveFindings, wait,
} from './diag-helpers.mjs';

// ──────────────────────────────────────────────────────────────────────────────
// Core helper: get all DevExpress combo/listbox items via window global scan
// DevExpress registers every ASPxClientComboBox/ListBox as a window property
// with methods GetItem(index) and GetItemCount()
// ──────────────────────────────────────────────────────────────────────────────

function getAllDevExpressListboxes(page) {
  return page.evaluate(() => {
    const result = [];
    const seen = new Set();
    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        const obj = window[key];
        if (!obj || typeof obj !== 'object') continue;
        if (typeof obj.GetItem !== 'function' || typeof obj.GetItemCount !== 'function') continue;
        // Skip menu items (SAC_Menu, mainMenu, nestedFrameMenu, DXFilterRow, DXContextMenu)
        if (/Menu|Context|FilterRow|DXFREditor/i.test(key)) continue;
        if (seen.has(key)) continue;
        seen.add(key);

        const count = obj.GetItemCount();
        if (count === 0) continue;

        const items = [];
        for (let i = 0; i < Math.min(count, 60); i++) {
          const item = obj.GetItem(i);
          if (!item) continue;
          items.push({
            text: item.text ?? null,
            value: item.value ?? null,
          });
        }
        result.push({ key, count, items });
      } catch { /* ignore */ }
    }
    return result;
  });
}

/**
 * Trigger lazy-init of dropdowns on a tab by clicking B-1 buttons and waiting for XHR.
 * DevExpress loads the listbox content lazily on first open.
 */
async function triggerLazyInit(page, fieldPatterns) {
  for (const pattern of fieldPatterns) {
    const clicked = await page.evaluate((p) => {
      const btn = document.querySelector(`img[id*="${p}"][id*="B-1Img"]`);
      if (btn && !btn.className?.includes('Disabled')) {
        btn.click();
        return btn.id;
      }
      return null;
    }, pattern);
    if (clicked) {
      await wait(600); // Let XHR fire and register the control
      await page.keyboard.press('Escape');
      await wait(200);
    }
  }
  await waitForDevExpressReady(page, { label: 'lazy-init' });
}

/**
 * Get current value of a field's input.
 */
async function getFieldCurrentValue(page, pattern) {
  return page.evaluate((p) => {
    const input = document.querySelector(`input[id*="${p}_Edit_dropdown_DD_I"]`) ||
                  document.querySelector(`input[id*="${p}_Edit_I"]`);
    return input?.value ?? null;
  }, pattern);
}

/**
 * Verify XHR side effects: snapshot before/after clicking the dropdown.
 */
async function checkXhrSideEffects(page, pattern) {
  const before = await snapshotXafInputs(page);

  await page.evaluate((p) => {
    const btn = document.querySelector(`img[id*="${p}"][id*="B-1Img"]`);
    if (btn) btn.click();
  }, pattern);
  await wait(800);
  await page.keyboard.press('Escape');
  await wait(400);
  await waitForDevExpressReady(page, { label: `xhr-check-${pattern}` });

  const after = await snapshotXafInputs(page);
  const changed = [];
  for (const [id, afterVal] of Object.entries(after)) {
    const beforeVal = before[id] ?? '';
    if (afterVal !== beforeVal) {
      const m = id.match(/xaf_dvi([A-Z0-9_]+)_Edit/);
      changed.push({ id, shortName: m ? m[1] : id, before: beforeVal, after: afterVal });
    }
  }
  return changed;
}

/**
 * Persistence test: set a dropdown value and check it survives a tab switch.
 */
async function testPersistence(page, fieldPattern, targetText) {
  // Open dropdown
  await page.evaluate((p) => {
    const btn = document.querySelector(`img[id*="${p}"][id*="B-1Img"]`);
    if (btn) btn.click();
  }, fieldPattern);
  await wait(600);

  // Click the target item in the popup (look for li/td with dxeListBoxItem class that is now visible)
  const clicked = await page.evaluate((text) => {
    const items = Array.from(document.querySelectorAll('li[class*="dxeListBoxItem"], td[class*="dxeListBoxItem"]'))
      .filter(el => el.offsetParent !== null && el.textContent?.trim() === text);
    if (items.length) { items[0].click(); return true; }
    // Fallback: use GetItem to find value, then set via DevExpress API
    return false;
  }, targetText);

  if (!clicked) {
    // Alternative: use DevExpress SetValue API
    const setOk = await page.evaluate((pattern, text) => {
      for (const key of Object.getOwnPropertyNames(window)) {
        try {
          const obj = window[key];
          if (!key.toUpperCase().includes(pattern.toUpperCase())) continue;
          if (typeof obj?.GetItem !== 'function') continue;
          const count = obj.GetItemCount();
          for (let i = 0; i < count; i++) {
            const item = obj.GetItem(i);
            if (item?.text === text) {
              obj.SetSelectedIndex?.(i);
              return `set via SetSelectedIndex(${i})`;
            }
          }
        } catch { /* ignore */ }
      }
      return null;
    }, fieldPattern, targetText);

    await page.keyboard.press('Escape');
    await wait(300);
    if (!setOk) return { skipped: true, reason: `item "${targetText}" not clickable and no SetSelectedIndex found` };
  }

  await wait(400);
  await waitForDevExpressReady(page, { label: `persist-select-${fieldPattern}` });
  const valueAfterSelect = await getFieldCurrentValue(page, fieldPattern);
  console.log(`  Value after select: "${valueAfterSelect}"`);

  // Switch to another tab
  const tabSwitched = await page.evaluate(() => {
    const others = Array.from(document.querySelectorAll('li.dxtc-tab'))
      .filter(e => e.offsetParent !== null);
    if (!others.length) return null;
    others[0].click();
    return (others[0].textContent ?? '').trim();
  });
  console.log(`  Tab switched to: "${tabSwitched}"`);

  if (tabSwitched) {
    await waitForDevExpressReady(page, { label: 'persist-tab-away' });
    await wait(400);

    // Come back
    const principaleTab = await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('li.dxtc-tab, li.dxtc-activeTab'))
        .find(e => /^(Principale|Main)$/i.test((e.textContent ?? '').trim()));
      if (tab) { tab.click(); return true; }
      return false;
    });

    if (!principaleTab) {
      // Click the first tab (usually Principale)
      await page.evaluate(() => {
        const firstTab = document.querySelector('li.dxtc-lead');
        if (firstTab) firstTab.click();
      });
    }
    await waitForDevExpressReady(page, { label: 'persist-tab-back' });
    await wait(400);

    // Navigate to Prezzi e sconti if needed
    const isOnPrezzo = await page.evaluate((p) => {
      return document.querySelector(`img[id*="${p}"][id*="B-1Img"]`) !== null;
    }, fieldPattern);
    if (!isOnPrezzo) {
      await page.evaluate(() => {
        const tab = Array.from(document.querySelectorAll('li.dxtc-tab, li.dxtc-activeTab, a'))
          .find(e => (e.textContent ?? '').trim() === 'Prezzi e sconti');
        if (tab) tab.click();
      });
      await waitForDevExpressReady(page, { label: 'persist-back-prezzi' });
      await wait(400);
    }
  }

  const valueAfterTabSwitch = await getFieldCurrentValue(page, fieldPattern);
  console.log(`  Value after tab switch: "${valueAfterTabSwitch}"`);

  return {
    targetOption: targetText,
    valueAfterSelect,
    tabSwitchedTo: tabSwitched,
    valueAfterTabSwitch,
    persists: valueAfterSelect !== null && valueAfterSelect === valueAfterTabSwitch,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab definitions: which tab to visit + which fields to trigger lazy-init for
// ──────────────────────────────────────────────────────────────────────────────

const TAB_PROBES = [
  {
    tab: 'Principale',
    fields: ['DLVMODE', 'BUSINESSSECTORID'],
  },
  {
    tab: 'Orari di consegna',
    fields: ['BRASCRMOPENMONDAY', 'BRASCRMOPENTUESDAY', 'BRASCRMOPENWEDNESDAY'],
  },
  {
    tab: 'Info CRM',
    fields: ['BRASCRMTYPEOFPRACTICE', 'BRASCRMPRIMARYSIC', 'BRASCRMPRIMARYSPECIALTY_ID', 'BRASCRMTYPOFBUYER_ID', 'BRASCRMMEDICALSCOOL'],
  },
  {
    tab: 'Prezzi e sconti',
    fields: ['PRICEGROUP', 'LINEDISC'],
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  try {
    await login(page);
    await navigateToNewCustomerForm(page);

    // Visit each tab to trigger lazy-init of dropdown controls
    for (const { tab, fields } of TAB_PROBES) {
      if (tab !== 'Principale') {
        const switched = await page.evaluate((label) => {
          const el = Array.from(document.querySelectorAll('a.dxtc-link,li.dxtc-tab,li.dxtc-lead,li.dxtc-activeTab'))
            .find(e => e.offsetParent !== null && (e.textContent ?? '').trim() === label);
          if (el) { el.click(); return true; }
          return false;
        }, tab);
        if (!switched) { console.warn(`[D4] Tab "${tab}" not found`); continue; }
        await waitForDevExpressReady(page, { label: `tab-${tab}` });
        await wait(600);
      }

      console.log(`\n[D4] Triggering lazy-init on tab "${tab}" for: ${fields.join(', ')}`);
      await triggerLazyInit(page, fields);
    }

    // Now collect ALL registered DevExpress listboxes from window
    // (should now include all tab controls that were triggered)
    console.log('\n[D4] Collecting all DevExpress listbox controls...');
    const allListboxes = await getAllDevExpressListboxes(page);

    // Filter to form-relevant ones (contains xaf_dvi in key)
    const formListboxes = allListboxes.filter(lb => lb.key.includes('xaf_dvi'));
    console.log(`[D4] Form listboxes found: ${formListboxes.length}`);
    formListboxes.forEach(lb => {
      const fieldMatch = lb.key.match(/xaf_dvi([A-Z0-9_]+)_Edit/);
      const fieldName = fieldMatch?.[1] ?? lb.key;
      console.log(`  ${fieldName} (${lb.count} items): ${lb.items.map(i => `"${i.text}"`).join(', ')}`);
    });

    // Deduplicate by fieldName (DevExpress registers both _DDD_L and _DD versions)
    const seenFields = new Map();
    for (const lb of formListboxes) {
      const m = lb.key.match(/xaf_dvi([A-Z0-9_]+)_Edit/);
      if (!m) continue;
      const fieldName = m[1];
      if (!seenFields.has(fieldName)) seenFields.set(fieldName, lb);
    }
    const deduped = Array.from(seenFields.entries()).map(([fieldName, lb]) => ({ fieldName, ...lb }));

    // Check XHR side effects for the key fields
    console.log('\n[D4] Checking XHR side effects...');
    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('a.dxtc-link,li.dxtc-tab,li.dxtc-lead,li.dxtc-activeTab'))
        .find(e => e.offsetParent !== null && (e.textContent ?? '').trim() === 'Principale');
      if (tab) tab.click();
    });
    await waitForDevExpressReady(page, { label: 'back-to-principale' });
    await wait(500);

    const xhrSideEffects = {};
    for (const pattern of ['DLVMODE', 'BUSINESSSECTORID']) {
      const sideEffects = await checkXhrSideEffects(page, pattern);
      xhrSideEffects[pattern] = sideEffects;
      if (sideEffects.length) console.warn(`  [XHR] ${pattern} caused side effects:`, sideEffects);
      else console.log(`  [OK] ${pattern}: no XHR side effects`);
    }

    // Navigate to Prezzi e sconti for those fields
    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('a.dxtc-link,li.dxtc-tab'))
        .find(e => e.offsetParent !== null && (e.textContent ?? '').trim() === 'Prezzi e sconti');
      if (tab) tab.click();
    });
    await waitForDevExpressReady(page, { label: 'to-prezzi' });
    await wait(500);

    for (const pattern of ['LINEDISC', 'PRICEGROUP']) {
      const sideEffects = await checkXhrSideEffects(page, pattern);
      xhrSideEffects[pattern] = sideEffects;
      if (sideEffects.length) console.warn(`  [XHR] ${pattern} caused side effects:`, sideEffects);
      else console.log(`  [OK] ${pattern}: no XHR side effects`);
    }

    // Persistence test: test LINEDISC — pick second item (non-default)
    console.log('\n[D4] Persistence test for LINEDISC...');
    const lineDiscEntry = deduped.find(d => d.fieldName === 'LINEDISC');
    const persistenceResults = [];

    if (lineDiscEntry && lineDiscEntry.items.length > 1) {
      // Choose the first item that is not the current value
      const currentLinedisc = await getFieldCurrentValue(page, 'LINEDISC');
      const targetItem = lineDiscEntry.items.find(i => i.text && i.text !== currentLinedisc && i.text !== 'N/A');
      if (targetItem) {
        try {
          const persResult = await testPersistence(page, 'LINEDISC', targetItem.text);
          persistenceResults.push({ field: 'LINEDISC', ...persResult });
        } catch (err) {
          console.error('[D4] Persistence test error:', err.message);
          persistenceResults.push({ field: 'LINEDISC', error: err.message });
        }
      } else {
        persistenceResults.push({ field: 'LINEDISC', skipped: true, reason: 'no suitable target item found' });
      }
    } else {
      persistenceResults.push({ field: 'LINEDISC', skipped: true, reason: lineDiscEntry ? 'only 1 option available' : 'LINEDISC not found' });
    }

    // Summary
    const PRIORITY = ['LINEDISC', 'DLVMODE', 'CUSTGROUP', 'CUSTSTATUS', 'BRASCRMTYPE', 'BUSINESSSECTORID', 'PRICEGROUP', 'BLOCKED'];
    const missingPriority = PRIORITY.filter(n => !deduped.some(d => d.fieldName === n));

    console.log('\n[D4] === FINAL SUMMARY ===');
    deduped.forEach(d => console.log(`  ${d.fieldName}: ${d.count} options — [${d.items.map(i => `"${i.text}"=${JSON.stringify(i.value)}`).join(', ')}]`));
    if (missingPriority.length) console.warn('  Missing priority fields:', missingPriority);

    saveFindings('d4-dropdowns.json', {
      certifiedAt: new Date().toISOString(),
      description: 'Opzioni esatte di ogni dropdown nel form nuovo cliente (via A6 window-scan). Verifica XHR side-effects e persistenza dopo switch tab.',
      summary: {
        totalDropdownsFound: deduped.length,
        missingPriorityCombos: missingPriority,
        dropdownsWithOptions: deduped.map(d => ({
          fieldName: d.fieldName,
          optionCount: d.count,
          options: d.items,
        })),
        xhrSideEffectsChecked: Object.fromEntries(
          Object.entries(xhrSideEffects).map(([k, v]) => [k, { sideEffectsCount: v.length, sideEffects: v }])
        ),
      },
      deduplicatedDropdowns: deduped,
      persistenceResults,
    });

  } finally {
    await browser.close();
  }
})();

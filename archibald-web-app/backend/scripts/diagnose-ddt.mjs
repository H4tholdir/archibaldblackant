/**
 * Diagnostic for DDT ListView scraping.
 *
 * Usage:
 *   ARCHIBALD_USERNAME=ikiA0930 ARCHIBALD_PASSWORD=Fresis26@ \
 *   node archibald-web-app/backend/scripts/diagnose-ddt.mjs
 */

import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const DDT_URL = `${ARCHIBALD_URL}/CUSTPACKINGSLIPJOUR_ListView/`;
const USERNAME = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASSWORD = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';

function log(section, msg, data) {
  const prefix = `[${section}]`;
  if (data !== undefined) {
    console.log(prefix, msg, JSON.stringify(data, null, 2));
  } else {
    console.log(prefix, msg);
  }
}

async function waitIdle(page, timeout = 20000) {
  await page.waitForFunction(
    (stableRequired) => {
      const w = window;
      const panel = document.querySelector('.dxgvLoadingPanel_XafTheme, .dxlp, [class*="LoadingPanel"]');
      if (panel && panel.offsetParent !== null) { w.__dxIdleCount = 0; return false; }
      let busy = false;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      if (col && typeof col.ForEachControl === 'function') {
        col.ForEachControl((c) => { if (typeof c.InCallback === 'function' && c.InCallback()) busy = true; });
      }
      if (busy) { w.__dxIdleCount = 0; return false; }
      w.__dxIdleCount = (w.__dxIdleCount || 0) + 1;
      return w.__dxIdleCount >= stableRequired;
    },
    { timeout, polling: 200 },
    3,
  );
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // ── LOGIN ──
  const loginUrl = `${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
  log('LOGIN', `Navigating to ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

  const fields = await page.evaluate(() => {
    const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
    const userInput = textInputs.find(i => i.id.includes('UserName') || i.name?.includes('UserName')) || textInputs[0];
    const passInput = document.querySelector('input[type="password"]');
    if (!userInput || !passInput) return null;
    return { userId: userInput.id, passId: passInput.id };
  });

  if (!fields) {
    log('LOGIN', 'ERROR: could not find login fields');
    await browser.close();
    return;
  }

  const fillField = async (fieldId, val) => {
    await page.evaluate((id, v) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.scrollIntoView({ block: 'center' });
      input.focus();
      input.click();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, v); else input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, fieldId, val);
    await page.keyboard.press('Tab');
    await new Promise(r => setTimeout(r, 500));
  };

  await fillField(fields.userId, USERNAME);
  await fillField(fields.passId, PASSWORD);

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a, div[role="button"]'));
    const btn = buttons.find(b => (b.textContent || '').toLowerCase().replace(/\s+/g, '').includes('accedi') || (b.textContent || '').toLowerCase() === 'login');
    if (btn) btn.click();
    else {
      const byId = buttons.find(b => b.id && !b.id.includes('logo') && (b.id.toLowerCase().includes('login') || b.id.toLowerCase().includes('logon')));
      if (byId) byId.click();
    }
  });

  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));
  log('LOGIN', `Post-login URL: ${page.url()}`);

  // ── NAVIGATE TO DDT ──
  log('NAV', `Navigating to DDT page: ${DDT_URL}`);
  await page.goto(DDT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitIdle(page);
  log('NAV', 'DDT page loaded');

  // ── RESET TO PAGE 0 ──
  const wasNotFirst = await page.evaluate(() => {
    const w = window;
    const gn = Object.keys(w).find(k => { try { return w[k]?.GotoPage && typeof w[k].GotoPage === 'function' && w[k]?.GetColumn; } catch { return false; } });
    if (gn && w[gn].GetPageIndex() !== 0) { w[gn].GotoPage(0); return true; }
    return false;
  });
  if (wasNotFirst) {
    await waitIdle(page);
    log('NAV', 'Reset grid to page 0');
  }

  // ── GET FIELD MAP ──
  const fieldMapResult = await page.evaluate(() => {
    const w = window;
    const gn = Object.keys(w).find(k => { try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; } catch { return false; } });
    if (!gn) return { fieldMap: {}, systemColumnCount: 0, allColumns: [] };
    const grid = w[gn];
    const all = [];
    let i = 0;
    while (true) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        all.push({ index: i, fieldName: col.fieldName ?? '', visibleIndex: col.visibleIndex, visible: col.visible });
        i++;
      } catch { break; }
    }
    all.sort((a, b) => a.visibleIndex - b.visibleIndex);
    let sysCount = 0;
    const map = {};
    let di = 0;
    for (const col of all) {
      if (!col.fieldName) { sysCount++; } else { map[col.fieldName] = di++; }
    }
    return { fieldMap: map, systemColumnCount: sysCount, allColumns: all };
  });

  log('FIELDMAP', 'Grid columns (sorted by visibleIndex):', fieldMapResult.allColumns);
  log('FIELDMAP', `systemColumnCount: ${fieldMapResult.systemColumnCount}`);
  log('FIELDMAP', 'fieldMap (fieldName → data-index):', fieldMapResult.fieldMap);

  // ── CHECK IF DOM IS EMPTY ──
  const domRows = await page.evaluate(() => {
    return document.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[class*="dxgvDataRow"]').length;
  });
  log('DOM', `Row count before filter toggle: ${domRows}`);

  const hasData = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
    return Array.from(rows).some(r =>
      Array.from(r.querySelectorAll('td')).some(c => {
        const t = (c.textContent || '').trim();
        return t && t !== 'N/A' && !t.startsWith('<!--') && t.length > 1;
      }),
    );
  });
  log('DOM', `Has populated cell data: ${hasData}`);

  // ── FILTER TOGGLE WORKAROUND ──
  const filterInputSelector = 'input[name*="ITCNT4"][name*="xaf_a2"][name*="Cb"]:not([name*="VI"]):not([name*="DDD"])';
  const listboxSelector = '[id*="ITCNT4"][id*="xaf_a2"][id*="Cb_DDD_L"] td';

  // helper: show dropdown via DevExpress API (more reliable than clicking input)
  const showDropDown = async () => {
    return page.evaluate((inputSel) => {
      const input = document.querySelector(inputSel);
      if (!input) return 'no-input';
      const col = window.ASPxClientControl?.GetControlCollection?.();
      if (col) {
        let found = null;
        col.ForEachControl?.((c) => {
          if (!found && typeof c.ShowDropDown === 'function' && c.GetInputElement?.()?.id === input.id) {
            found = c;
          }
        });
        if (found) { found.ShowDropDown(); return 'ok:collection'; }
      }
      // fallback: find combo by window keys
      const w = window;
      const combo = Object.keys(w).map(k => { try { return w[k]; } catch { return null; } })
        .find(c => c && typeof c.ShowDropDown === 'function' && c.GetInputElement?.()?.id === input.id);
      if (combo) { combo.ShowDropDown(); return 'ok:global'; }
      return 'not-found';
    }, filterInputSelector);
  };

  // helper: click item in listbox
  const clickListboxItem = async (texts) => {
    return page.evaluate((sel, txts) => {
      const items = Array.from(document.querySelectorAll(sel));
      for (const t of txts) {
        const item = items.find(i => i.textContent?.trim() === t && i.offsetParent !== null);
        if (item) { item.click(); return t; }
      }
      return null;
    }, listboxSelector, texts);
  };

  // helper: read current selected value from combo input
  const readCurrentValue = async () => {
    return page.evaluate((inputSel) => {
      const input = document.querySelector(inputSel);
      if (!input) return null;
      // The display input (VI) shows the label — find it
      const col = window.ASPxClientControl?.GetControlCollection?.();
      if (col) {
        let val = null;
        col.ForEachControl?.((c) => {
          if (!val && typeof c.GetValue === 'function' && c.GetInputElement?.()?.id === input.id) {
            val = c.GetValue();
          }
        });
        if (val !== null) return String(val);
      }
      return input.value || '';
    }, filterInputSelector);
  };

  if (!hasData) {
    log('FILTER', 'DOM empty — applying filter toggle workaround');

    // 1. Read current filter value
    const sdResult1 = await showDropDown();
    await new Promise(r => setTimeout(r, 800));
    const currentValue = await readCurrentValue();
    log('FILTER', `ShowDropDown result: ${sdResult1}, current value: "${currentValue}"`);

    // Show available items
    const items1 = await page.evaluate((sel) => {
      return Array.from(document.querySelectorAll(sel)).map(td => ({
        text: td.textContent?.trim(), visible: td.offsetParent !== null,
      }));
    }, listboxSelector);
    log('FILTER', 'Available items:', items1.filter(i => i.visible).map(i => i.text));

    // 2. Pick a temp value different from current AND different from "Tutti/All"
    const tempCandidates = ['Questo mese', 'Questa settimana', 'Ultimi 3 mesi', 'Oggi', 'Today', 'This week', 'This month'];
    const clickedTemp = await page.evaluate((sel, currVal, candidates) => {
      const items = Array.from(document.querySelectorAll(sel));
      for (const c of candidates) {
        if (c.toLowerCase() === currVal.toLowerCase()) continue;
        const item = items.find(i => i.textContent?.trim() === c && i.offsetParent !== null);
        if (item) { item.click(); return c; }
      }
      return null;
    }, listboxSelector, currentValue || '', tempCandidates);

    if (!clickedTemp) {
      log('FILTER', 'ERROR: no suitable temp item found');
    } else {
      log('FILTER', `Clicked temp: "${clickedTemp}", waiting for callback...`);
      await waitIdle(page).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));

      // 3. Reopen dropdown via DevExpress API
      const sdResult2 = await showDropDown();
      await new Promise(r => setTimeout(r, 1000));
      log('FILTER', `ShowDropDown for Tutti: ${sdResult2}`);

      const items2 = await page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel)).map(td => ({
          text: td.textContent?.trim(), visible: td.offsetParent !== null,
        }));
      }, listboxSelector);
      log('FILTER', 'Items visible before Tutti click:', items2.filter(i => i.visible).map(i => i.text));

      // 4. Click "Tutti/All"
      const clickedFinal = await clickListboxItem(['Tutti', 'All']);
      if (!clickedFinal) {
        log('FILTER', 'WARNING: Tutti/All not found');
      } else {
        log('FILTER', `Clicked "${clickedFinal}", waiting for callback...`);
        await waitIdle(page).catch(() => {});
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  } else {
    log('FILTER', 'DOM already has data — skipping filter toggle');
  }

  // ── COMPUTE DOM OFFSET ──
  const domCellCount = await page.evaluate(() => {
    const row = document.querySelector('tr.dxgvDataRow_XafTheme, tr[class*="dxgvDataRow"]');
    return row ? row.querySelectorAll('td').length : 0;
  });

  const apiFieldNames = Object.keys(fieldMapResult.fieldMap).sort(
    (a, b) => fieldMapResult.fieldMap[a] - fieldMapResult.fieldMap[b],
  );
  const totalApiVisible = apiFieldNames.length + fieldMapResult.systemColumnCount;
  let domOffset = fieldMapResult.systemColumnCount;
  if (domCellCount > totalApiVisible) {
    domOffset = domCellCount - apiFieldNames.length;
  }

  log('OFFSET', `domCells=${domCellCount}, apiFields=${apiFieldNames.length}, systemCols=${fieldMapResult.systemColumnCount}, totalApiVisible=${totalApiVisible}, computed domOffset=${domOffset}`);
  log('OFFSET', `apiFieldNames in order:`, apiFieldNames);

  // ── READ FIRST 5 ROWS RAW CELLS ──
  const rawRows = await page.evaluate((offset) => {
    const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[class*="dxgvDataRow"]');
    return Array.from(rows).slice(0, 5).map((row, ri) => {
      const cells = Array.from(row.querySelectorAll('td'));
      return {
        rowIndex: ri,
        totalCells: cells.length,
        allCells: cells.map((c, ci) => ({ ci, text: c.textContent?.trim() ?? '' })),
        afterOffset: cells.slice(offset).map((c, ci) => ({ ci, text: c.textContent?.trim() ?? '' })),
      };
    });
  }, domOffset);

  log('ROWS', `First ${rawRows.length} rows (raw DOM cells):`, rawRows);

  // ── SHOW FIELD ASSIGNMENTS ──
  if (rawRows.length > 0) {
    log('EXTRACT', 'Field extraction for first 3 rows:');
    for (const row of rawRows.slice(0, 3)) {
      const extracted = {};
      for (const [field, idx] of Object.entries(fieldMapResult.fieldMap)) {
        extracted[field] = row.afterOffset[idx]?.text ?? '(missing)';
      }
      log('EXTRACT', `Row ${row.rowIndex}:`, extracted);
    }

    // Focus on SALESID specifically
    const salesidIdx = fieldMapResult.fieldMap['SALESID'];
    log('SALESID', `SALESID is at fieldMap index ${salesidIdx}`);
    for (const row of rawRows.slice(0, 5)) {
      const salesid = row.afterOffset[salesidIdx]?.text ?? '(missing)';
      log('SALESID', `Row ${row.rowIndex}: "${salesid}" (DOM cell ${salesidIdx + domOffset})`);
    }
  }

  log('DONE', 'Diagnostic complete. Browser will stay open for 10 seconds...');
  await new Promise(r => setTimeout(r, 10000));
  await browser.close();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });

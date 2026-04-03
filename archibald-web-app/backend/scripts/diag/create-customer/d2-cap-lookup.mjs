// archibald-web-app/backend/scripts/diag/create-customer/d2-cap-lookup.mjs
// Certifica: iframe CAP, struttura righe, auto-fill, CAP multi-città, CAP non trovato
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d2-cap-lookup.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  saveFindings, wait,
} from './diag-helpers.mjs';

const TEST_CAPS = [
  { cap: '80038', city: 'Pomigliano d\'Arco', label: 'singola_città' },
  { cap: '00100', city: null, label: 'multi_città_roma' },
  { cap: '99999', city: null, label: 'cap_non_trovato' },
];

async function clickCapButton(page) {
  const btnId = await page.evaluate(() => {
    const btn = document.querySelector('img[id*="LOGISTICSADDRESSZIPCODE"][id*="B0Img"]');
    if (btn) { btn.click(); return btn.id; }
    const btn2 = Array.from(document.querySelectorAll('img')).find(
      el => el.title?.toLowerCase().includes('select') || el.title?.toLowerCase().includes('scegliere')
        && el.id.includes('ZIPCODE')
    );
    if (btn2) { btn2.click(); return btn2.id; }
    return null;
  });
  if (!btnId) throw new Error('CAP button (B0Img) non trovato');
  return btnId;
}

async function waitForCapIframe(page) {
  let iframeFrame = null;
  for (let i = 0; i < 25; i++) {
    await wait(400);
    iframeFrame = page.frames().find(f => f.url().includes('FindPopup=true'));
    if (iframeFrame) break;
  }
  if (!iframeFrame) throw new Error('FindPopup iframe non apparso dopo 10s');
  await iframeFrame.waitForFunction(() => document.readyState === 'complete', { timeout: 8000 });
  await wait(200);
  return iframeFrame;
}

async function probeCapScenario(page, { cap, city, label }) {
  console.log(`\n[D2] Scenario: ${label} (CAP=${cap})`);

  const btnId = await clickCapButton(page);
  const iframeFrame = await waitForCapIframe(page);

  const frameInfo = await iframeFrame.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"],input:not([type])'))
      .filter(el => el.offsetParent !== null);
    const searchBtns = Array.from(document.querySelectorAll('a,img,button'))
      .filter(el => el.offsetParent !== null && (
        el.title?.toLowerCase().includes('filter') ||
        el.title?.toLowerCase().includes('filtr') ||
        el.id?.includes('_B1') || el.id?.includes('_B0')
      ));
    return {
      inputIds: inputs.map(el => ({ id: el.id, placeholder: el.placeholder })),
      searchBtnIds: searchBtns.map(el => ({ id: el.id, title: el.title, tagName: el.tagName })),
      iframeUrl: window.location.href,
    };
  });

  console.log(`  iframe URL: ${frameInfo.iframeUrl}`);
  console.log(`  input fields:`, JSON.stringify(frameInfo.inputIds));
  console.log(`  search buttons:`, JSON.stringify(frameInfo.searchBtnIds));

  const searchInputId = frameInfo.inputIds[0]?.id;
  if (!searchInputId) throw new Error('Nessun input trovato nell\'iframe');

  await iframeFrame.click(`#${searchInputId.replace(/([.#[\]()])/g, '\\$1')}`, { clickCount: 3 });
  await iframeFrame.type(`#${searchInputId.replace(/([.#[\]()])/g, '\\$1')}`, cap, { delay: 100 });
  // keyboard belongs to the page, not the frame
  await page.keyboard.press('Enter');
  await wait(2000);

  const gridInfo = await iframeFrame.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[class*="DataRow"]'));
    return rows.map((row, idx) => {
      const cells = Array.from(row.querySelectorAll('td')).map(td => ({
        text: td.innerText?.trim() ?? '',
        colIndex: td.cellIndex,
      }));
      return { rowIndex: idx, cells, rowId: row.id };
    });
  });

  console.log(`  righe trovate: ${gridInfo.length}`);
  gridInfo.slice(0, 5).forEach(r => {
    console.log(`    riga ${r.rowIndex}:`, r.cells.map(c => `[${c.colIndex}]"${c.text}"`).join(' '));
  });

  let selectedRow = null;
  if (gridInfo.length > 0) {
    const targetRow = city
      ? gridInfo.find(r => r.cells.some(c => c.text.toLowerCase().includes(city.toLowerCase())))
        ?? gridInfo[0]
      : gridInfo[0];

    selectedRow = targetRow;
    const rowId = targetRow.rowId;
    if (rowId) {
      await iframeFrame.evaluate(id => {
        const row = document.getElementById(id);
        row?.click();
      }, rowId);
    }
    await wait(400);

    await iframeFrame.evaluate(() => {
      const okBtn = Array.from(document.querySelectorAll('a,button'))
        .find(el => el.offsetParent !== null && /^ok$/i.test((el.textContent ?? el.value ?? '').trim()));
      okBtn?.click();
    });
  } else {
    await page.keyboard.press('Escape');
    await wait(500);
  }

  await page.waitForFunction(
    () => !page.frames().some(f => f.url().includes('FindPopup=true')),
    { timeout: 8000 }
  ).catch(() => {});
  await wait(600);

  const autoFill = await page.evaluate(() => {
    const fields = ['CITY', 'COUNTY', 'STATE', 'COUNTRYREGIONID', 'LOGISTICSADDRESSZIPCODE'];
    const result = {};
    for (const f of fields) {
      const el = document.querySelector(`input[id*="${f}"][id*="_Edit_I"]`);
      if (el) result[f] = el.value;
    }
    return result;
  });

  console.log(`  auto-fill dopo selezione:`, autoFill);

  return {
    label,
    cap,
    city,
    iframe: frameInfo,
    rowCount: gridInfo.length,
    rows: gridInfo.slice(0, 10),
    selectedRow,
    btnId,
    autoFill,
  };
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  try {
    await login(page);
    await navigateToNewCustomerForm(page);

    const scenarios = [];
    for (const testCase of TEST_CAPS) {
      await navigateToNewCustomerForm(page); // form fresco per ogni scenario
      try {
        const result = await probeCapScenario(page, testCase);
        scenarios.push({ ...result, error: null });
      } catch (err) {
        console.error(`[D2] Errore scenario ${testCase.label}:`, err.message);
        scenarios.push({ ...testCase, error: err.message });
        await page.keyboard.press('Escape').catch(() => {});
        await wait(500);
      }
    }

    saveFindings('d2-cap-lookup.json', {
      certifiedAt: new Date().toISOString(),
      description: 'Struttura iframe CAP, colonne, auto-fill, scenari multi-città e cap-non-trovato',
      scenarios,
      manualCheck: 'Verificare D2-Scenario-D (Tab Principale vs Alt Address) manualmente',
    });

  } finally {
    await browser.close();
  }
})();

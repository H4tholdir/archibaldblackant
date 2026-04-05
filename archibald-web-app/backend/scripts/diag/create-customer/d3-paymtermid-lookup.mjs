// archibald-web-app/backend/scripts/diag/create-customer/d3-paymtermid-lookup.mjs
// Certifica: iframe PAYMTERMID, struttura colonne, ricerca per codice, termine non trovato
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d3-paymtermid-lookup.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  saveFindings, wait,
} from './diag-helpers.mjs';

async function probePaymTermId(page, termCode) {
  console.log(`\n[D3] Ricerca PAYMTERMID: "${termCode}"`);

  // Apri il campo PAYMTERMID — prova B0Img prima (stesso pattern di CAP)
  const btnId = await page.evaluate(() => {
    const btn = document.querySelector('img[id*="PAYMTERMID"][id*="B0Img"]');
    if (btn) { btn.click(); return btn.id; }
    // Fallback: qualsiasi elemento visibile con PAYMTERMID nell'id
    const all = Array.from(document.querySelectorAll('img,a,input[type="button"]'))
      .filter(el => el.offsetParent && el.id?.includes('PAYMTERMID'));
    if (all.length) { all[0].click(); return all[0].id; }
    return null;
  });
  if (!btnId) throw new Error('PAYMTERMID button non trovato');
  console.log(`  btnId: ${btnId}`);

  // Aspetta iframe FindPopup
  let iframeFrame = null;
  for (let i = 0; i < 25; i++) {
    await wait(400);
    iframeFrame = page.frames().find(f => f.url().includes('FindPopup=true'));
    if (iframeFrame) break;
  }
  if (!iframeFrame) throw new Error('FindPopup iframe non apparso dopo 10s');
  await iframeFrame.waitForFunction(() => document.readyState === 'complete', { timeout: 8000 });
  await wait(200);

  // Struttura iframe: input, bottoni, header colonne
  const frameInfo = await iframeFrame.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"],input:not([type])'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, type: el.type, placeholder: el.placeholder }));
    const btns = Array.from(document.querySelectorAll('a,img,input[type="button"],button'))
      .filter(el => el.offsetParent !== null && (
        el.id?.includes('_B0') || el.id?.includes('_B1') ||
        el.title?.toLowerCase().includes('filter') ||
        el.title?.toLowerCase().includes('filtr') ||
        el.title?.toLowerCase().includes('search') ||
        /^(ok|cancel|annulla)$/i.test((el.textContent ?? '').trim())
      ))
      .map(el => ({ id: el.id, title: el.title, text: el.textContent?.trim(), tag: el.tagName }));
    const headers = Array.from(document.querySelectorAll('th,td.dxgvHeader_XafTheme'))
      .map(el => el.innerText?.trim()).filter(Boolean);
    const allVisibleBtns = Array.from(document.querySelectorAll('a,img,input[type="button"],button'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ id: el.id, title: el.title, text: el.textContent?.trim().slice(0, 30), tag: el.tagName }));
    return { inputs, btns, headers, iframeUrl: window.location.href, allVisibleBtns };
  });

  console.log('  iframeUrl:', frameInfo.iframeUrl);
  console.log('  inputs:', JSON.stringify(frameInfo.inputs));
  console.log('  headers:', frameInfo.headers);
  console.log('  filtered btns:', JSON.stringify(frameInfo.btns));

  // Cerca per codice — usa page.keyboard (non iframeFrame.keyboard)
  const searchInput = frameInfo.inputs[0];
  if (searchInput?.id) {
    const esc = searchInput.id.replace(/([.#[\]()])/g, '\\$1');
    await iframeFrame.click(`#${esc}`, { clickCount: 3 });
    await iframeFrame.type(`#${esc}`, termCode, { delay: 100 });
    // Click all'interno dell'iframe prima di premere Enter per assicurare il focus corretto
    await iframeFrame.click(`#${esc}`);
    await page.keyboard.press('Enter');
    await wait(2000);
  } else {
    console.warn('  [WARN] nessun input trovato nell\'iframe, skip ricerca');
  }

  // Leggi le righe risultato
  const rows = await iframeFrame.evaluate(() => {
    return Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[class*="DataRow"]'))
      .slice(0, 15)
      .map((row, idx) => ({
        rowIndex: idx,
        rowId: row.id,
        cells: Array.from(row.querySelectorAll('td')).map(td => ({
          colIndex: td.cellIndex,
          text: td.innerText?.trim() ?? '',
        })),
      }));
  });

  console.log(`  righe trovate: ${rows.length}`);
  rows.forEach(r => console.log(`    riga ${r.rowIndex}:`, r.cells.map(c => `[${c.colIndex}]"${c.text}"`).join(' ')));

  // Chiudi senza selezionare
  await page.keyboard.press('Escape');
  await wait(600);

  return { termCode, btnId, frameInfo, rows };
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  try {
    await login(page);
    await navigateToNewCustomerForm(page);

    const results = [];
    for (const code of ['201', '206', 'INESISTENTE']) {
      await navigateToNewCustomerForm(page);
      try {
        results.push(await probePaymTermId(page, code));
      } catch (err) {
        console.error(`[D3] Errore per "${code}":`, err.message);
        results.push({ termCode: code, error: err.message });
        await page.keyboard.press('Escape').catch(() => {});
        await wait(500);
      }
    }

    saveFindings('d3-paymtermid-lookup.json', {
      certifiedAt: new Date().toISOString(),
      description: 'Struttura iframe PAYMTERMID, ricerca per codice, righe risultato',
      results,
    });

  } finally {
    await browser.close();
  }
})();

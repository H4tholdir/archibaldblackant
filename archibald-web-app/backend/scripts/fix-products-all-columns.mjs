/**
 * Abilita TUTTE le colonne nascoste nella pagina Prodotti via Column Chooser,
 * poi scarica il PDF e verifica che torni a 8 pagine per ciclo.
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import { spawnSync } from 'child_process';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const DOWNLOAD_DIR = '/tmp/diag-products';
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitIdle(page, timeout = 20000) {
  await page.waitForFunction(
    (n) => {
      const panel = document.querySelector('.dxgvLoadingPanel_XafTheme,.dxlp,[class*="LoadingPanel"]');
      if (panel && panel.offsetParent !== null) { window.__dxIdle = 0; return false; }
      window.__dxIdle = (window.__dxIdle || 0) + 1;
      return window.__dxIdle >= n;
    },
    { timeout, polling: 200 }, 3,
  ).catch(() => {});
}

async function login(page) {
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName') || i.name?.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u && p) ? { userId: u.id, passId: p.id } : null;
  });
  const fill = async (id, val) => {
    await page.evaluate((id, v) => {
      const el = document.getElementById(id);
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (s) s.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, id, val);
    await page.keyboard.press('Tab');
    await sleep(200);
  };
  await fill(fields.userId, 'ikiA0930');
  await fill(fields.passId, 'Fresis26@');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button,input[type='submit'],a")).find(btn => /accedi|login/i.test((btn.textContent || '').toLowerCase().trim()));
    if (b) b.click();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  if (page.url().includes('Login.aspx')) throw new Error('Login fallito');
  console.log('✅ Login OK');
}

function getAllColumns(page) {
  return page.evaluate(() => {
    const w = window;
    const gn = Object.keys(w).find(k => {
      try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; }
      catch { return false; }
    });
    if (!gn) return { error: 'Grid non trovata', gridName: null, columns: [] };
    const grid = w[gn];
    const columns = [];
    for (let i = 0; i < 100; i++) {
      try {
        const col = grid.GetColumn(i);
        if (!col) break;
        columns.push({
          index: i,
          fieldName: col.fieldName || col.name || `col_${i}`,
          caption: col.caption || '',
          visible: col.visible !== false,
        });
      } catch { break; }
    }
    return { gridName: gn, columns };
  });
}

async function openColumnChooser(page) {
  // Right-click su header
  const hdr = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td');
  if (!hdr) throw new Error('Header non trovato per right-click');
  await hdr.click({ button: 'right' });
  await sleep(1200);
  await page.screenshot({ path: `${DOWNLOAD_DIR}/40-ctx-menu.png` });

  // Clicca "Show customization dialog"
  const opened = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.dxm-item, li, a'))
      .find(el => /show customization|customization dialog/i.test(el.textContent || ''));
    if (item) { item.click(); return item.textContent?.trim(); }
    return null;
  });
  console.log('Context menu item clicked:', opened);
  await sleep(2000);
  await page.screenshot({ path: `${DOWNLOAD_DIR}/41-dialog-open.png` });

  // Naviga al tab "Column Chooser"
  const tabClicked = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[id*="DXCDPageControl_T"]'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 80; });
    const t = tabs.find(el => /column.?chooser/i.test(el.textContent?.trim() || ''));
    if (t) { t.click(); return t.textContent?.trim(); }
    // Prova anche altri tab label comuni
    const anyTab = tabs.find(el => /chooser|colonne/i.test(el.textContent?.trim() || ''));
    if (anyTab) { anyTab.click(); return anyTab.textContent?.trim(); }
    return null;
  });
  console.log('Tab Column Chooser:', tabClicked);
  await sleep(1500);
  await page.screenshot({ path: `${DOWNLOAD_DIR}/42-column-chooser-tab.png` });
}

async function enableAllHiddenColumns(page, hiddenColumns) {
  console.log(`\n→ Abilito ${hiddenColumns.length} colonne nascoste...`);

  // Scrolla il dialog in cima prima di iniziare (workaround bug Apply)
  await page.evaluate(() => {
    const dialog = document.querySelector('[id*="DXCDWindow"]') || document.querySelector('.dxcd-dialog');
    if (dialog) dialog.scrollTop = 0;
  });

  let enabled = 0;
  for (const col of hiddenColumns) {
    const idx = col.index;
    const result = await page.evaluate((idx) => {
      // Cerca il checkbox nel dialog con pattern C{idx}Chk5
      const selectors = [
        `[id*="C${idx}Chk5_D"]`,
        `[id*="C${idx}Chk5"]`,
        `[id$="C${idx}Chk5_D"]`,
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          el.click();
          return { ok: true, sel, id: el.id };
        }
      }
      // Fallback: cerca per nome colonna nel dialog
      return { ok: false, tried: selectors };
    }, idx);

    if (result.ok) {
      console.log(`  ✅ [${idx}] ${col.fieldName} — ${result.sel}`);
      enabled++;
    } else {
      console.log(`  ⚠ [${idx}] ${col.fieldName} — non trovato`);
    }
    await sleep(300);
  }

  console.log(`\n  ${enabled}/${hiddenColumns.length} colonne abilitate`);
  return enabled;
}

async function applyColumnChooser(page) {
  await sleep(500);
  // Scrolla dialog a 0 prima di Apply (workaround bug reset)
  await page.evaluate(() => {
    const dialog = document.querySelector('[id*="DXCDWindow"]');
    if (dialog) dialog.scrollTop = 0;
  });
  await sleep(300);

  const result = await page.evaluate(() => {
    // Prova in ordine: DXCBtn21, DXCBtn201, sprite gvCOApply, data-args
    const btn21 = document.querySelector('[id$="DXCDWindow_DXCBtn21"]');
    if (btn21 && !btn21.className.includes('Disabled')) { btn21.click(); return { ok: true, method: 'DXCBtn21' }; }
    const btn201 = document.querySelector('[id$="DXCDWindow_DXCBtn201"]');
    if (btn201 && !btn201.className.includes('Disabled')) { btn201.click(); return { ok: true, method: 'DXCBtn201' }; }
    const sprite = Array.from(document.querySelectorAll('[id*="DXCDWindow"] img[class*="gvCOApply"]')).find(e => e.getBoundingClientRect().width > 0);
    if (sprite) { (sprite.closest('a, button') || sprite).click(); return { ok: true, method: 'sprite', id: sprite.id }; }
    const byArgs = document.querySelector('[data-args*="CustDialogApply"]');
    if (byArgs) { byArgs.click(); return { ok: true, method: 'data-args' }; }
    return { ok: false };
  });
  console.log('\n→ Apply:', JSON.stringify(result));
  await sleep(2000);
  await waitIdle(page);
  return result;
}

async function downloadPdf(page) {
  console.log('\n→ Scarico PDF post-fix...');

  // Rimuovi PDF esistenti
  fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.pdf')).forEach(f =>
    fs.unlinkSync(`${DOWNLOAD_DIR}/${f}`)
  );

  await page.waitForSelector('#Vertical_mainMenu_Menu_DXI3_', { timeout: 5000 });
  await page.evaluate(() => {
    const el = document.getElementById('Vertical_mainMenu_Menu_DXI3_T')
             || document.getElementById('Vertical_mainMenu_Menu_DXI3_');
    if (el) el.click();
  });

  console.log('  Click PDF eseguito. Attendo download...');
  const start = Date.now();
  while (Date.now() - start < 300000) {
    const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.pdf'));
    if (files.length > 0) return `${DOWNLOAD_DIR}/${files[0]}`;
    await sleep(3000);
    process.stdout.write('.');
  }
  console.log('');
  return null;
}

function analyzePdf(pdfPath) {
  const script = `
import pdfplumber, json, sys
with pdfplumber.open(sys.argv[1]) as pdf:
    total = len(pdf.pages)
    pages = []
    # Leggi tutte le pagine per trovare il ciclo
    seen_headers = []
    cycle_size = None
    for i, page in enumerate(pdf.pages[:30]):
        tables = page.extract_tables()
        if tables and tables[0] and tables[0][0]:
            headers = tuple(str(h or '').strip() for h in tables[0][0])
            if headers in seen_headers:
                cycle_size = seen_headers.index(headers) + 1
                break
            seen_headers.append(headers)
        if i < 12:
            h = []
            r = 0
            if tables and tables[0]:
                h = [str(x or '').strip() for x in tables[0][0]]
                r = len(tables[0]) - 1
            pages.append({'page': i+1, 'headers': h, 'rows': r})
    print(json.dumps({'total_pages': total, 'cycle_size': cycle_size, 'pages': pages}))
`;
  const r = spawnSync('python3', ['-c', script, pdfPath], { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

// ── MAIN ──
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR });

  try {
    await login(page);
    await page.goto(`${ARCHIBALD_URL}/INVENTTABLE_ListView/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitIdle(page);
    await sleep(1500);

    // ── 1. Leggi stato attuale colonne ──
    console.log('\n── STATO COLONNE (prima) ──');
    const { gridName, columns, error } = await getAllColumns(page);
    if (error || !columns.length) {
      console.log('Errore lettura colonne:', error);
    } else {
      console.log(`Grid: ${gridName}, Colonne totali: ${columns.length}`);
      const hidden = columns.filter(c => !c.visible);
      const visible = columns.filter(c => c.visible);
      console.log(`Visibili: ${visible.length}, Nascoste: ${hidden.length}`);
      hidden.forEach(c => console.log(`  ❌ [${c.index}] ${c.fieldName} — ${c.caption}`));

      if (hidden.length === 0) {
        console.log('\n✅ Tutte le colonne già visibili — nessun fix necessario');
      } else {
        // ── 2. Apri Column Chooser e abilita tutto ──
        await openColumnChooser(page);
        const enabled = await enableAllHiddenColumns(page, hidden);
        await page.screenshot({ path: `${DOWNLOAD_DIR}/43-after-enable.png` });
        await applyColumnChooser(page);
        await page.screenshot({ path: `${DOWNLOAD_DIR}/44-after-apply.png` });
        await sleep(1000);

        // ── 3. Verifica stato dopo fix ──
        console.log('\n── STATO COLONNE (dopo) ──');
        const { columns: colsAfter } = await getAllColumns(page);
        const hiddenAfter = colsAfter.filter(c => !c.visible);
        const visibleAfter = colsAfter.filter(c => c.visible);
        console.log(`Visibili: ${visibleAfter.length}, Nascoste: ${hiddenAfter.length}`);
        if (hiddenAfter.length > 0) {
          console.log('⚠ Ancora nascoste:');
          hiddenAfter.forEach(c => console.log(`  ❌ [${c.index}] ${c.fieldName}`));
        } else {
          console.log('✅ Tutte le colonne ora visibili!');
        }
      }
    }

    // ── 4. Scarica PDF e analizza ──
    const pdfPath = await downloadPdf(page);
    if (pdfPath) {
      const sizeMB = (fs.statSync(pdfPath).size / 1024 / 1024).toFixed(2);
      console.log(`\n✅ PDF scaricato (${sizeMB} MB)`);
      const info = analyzePdf(pdfPath);
      console.log(`\n► Totale pagine: ${info.total_pages}`);
      console.log(`► Cycle size rilevato: ${info.cycle_size ?? 'non rilevato (controlla prime pagine)'}`);
      console.log('\n► Prime pagine:');
      info.pages.forEach(p => {
        console.log(`  Pagina ${p.page} (${p.rows} righe): ${JSON.stringify(p.headers)}`);
      });
    }

  } catch (err) {
    console.error('\nERRORE:', err.message);
    await page.screenshot({ path: `${DOWNLOAD_DIR}/99-error5.png` });
  }

  console.log('\nScreenshot in', DOWNLOAD_DIR);
  await sleep(10000);
  await browser.close();
})();

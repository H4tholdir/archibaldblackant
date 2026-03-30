/**
 * ERP Column Setup Wizard
 *
 * Per ogni pagina ERP:
 *   1. Tasto destro sull'header della griglia
 *   2. Click "Show Customization Dialog"
 *   3. Vai alla tab "Column Chooser" (in alto a destra)
 *   4. Clicca l'icona occhio della colonna target
 *
 * Pagine:
 *   - DDT:    aggiungi DLVCITY ("CITTÀ DI CONSEGNA")
 *   - Prices: aggiungi DATAAREAID
 *
 * Usage:
 *   node archibald-web-app/backend/scripts/setup-erp-columns.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const USERNAME = process.env.ARCHIBALD_USERNAME || 'ikiA0930';
const PASSWORD = process.env.ARCHIBALD_PASSWORD || 'Fresis26@';
const DEBUG_DIR = './erp-setup-debug';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Colonne da aggiungere per ogni pagina ────────────────────────────────────
// captionText: testo visibile nel Column Chooser (case-insensitive parziale)
const PAGES_TO_FIX = [
  {
    name: 'ddt',
    url: `${ARCHIBALD_URL}/CUSTPACKINGSLIPJOUR_ListView/`,
    missingColumns: [
      { fieldName: 'DLVCITY', captionText: 'CITTÀ DI CONSEGNA' },
    ],
  },
  {
    name: 'prices',
    url: `${ARCHIBALD_URL}/PRICEDISCTABLE_ListView/`,
    missingColumns: [
      { fieldName: 'DATAAREAID', captionText: 'DATAAREAID' },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(section, msg) {
  console.log(`[${section}]`, msg);
}

function ensureDebugDir() {
  if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

async function screenshot(page, name) {
  ensureDebugDir();
  const file = path.join(DEBUG_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: false });
  log('debug', `Screenshot: ${file}`);
}

async function waitIdle(page, timeout = 30000) {
  await page.evaluate(() => { window.__dxIdleCount = 0; });
  await page.waitForFunction(
    (n) => {
      const panel = document.querySelector('.dxgvLoadingPanel_XafTheme,.dxlp,[class*="LoadingPanel"]');
      if (panel && panel.offsetParent !== null) { window.__dxIdleCount = 0; return false; }
      let busy = false;
      const col = window.ASPxClientControl?.GetControlCollection?.();
      if (col && typeof col.ForEachControl === 'function') {
        col.ForEachControl((c) => { if (typeof c.InCallback === 'function' && c.InCallback()) busy = true; });
      }
      if (busy) { window.__dxIdleCount = 0; return false; }
      window.__dxIdleCount = (window.__dxIdleCount || 0) + 1;
      return window.__dxIdleCount >= n;
    },
    { timeout, polling: 200 }, 3,
  );
}

async function login(page) {
  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]'))
      .find(i => i.id.includes('UserName') || i.name?.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u && p) ? { userId: u.id, passId: p.id } : null;
  });
  if (!fields) throw new Error('Login fields not found');
  const fill = async (id, val) => {
    await page.evaluate((id, v) => {
      const el = document.getElementById(id);
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (s) s.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, id, val);
    await page.keyboard.press('Tab');
  };
  await fill(fields.userId, USERNAME);
  await fill(fields.passId, PASSWORD);
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a, div[role='button']"));
    const byText = buttons.find(btn => {
      const text = (btn.textContent || '').toLowerCase().replace(/\s+/g, '');
      return text.includes('accedi') || text === 'login';
    });
    const byId = !byText && buttons.find(btn => {
      const id = (btn.id || '').toLowerCase();
      if (id.includes('logo')) return false;
      return id.includes('login') || id.includes('logon');
    });
    const loginBtn = byText || byId;
    if (loginBtn) { loginBtn.click(); return true; }
    return false;
  });
  if (!clicked) throw new Error('Submit button not found');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  log('login', 'OK');
}

async function getVisibleFieldNames(page) {
  return page.evaluate(() => {
    const candidates = Object.entries(window)
      .filter(([, v]) => v && typeof v === 'object' && typeof v.GetColumnCount === 'function')
      .map(([, v]) => v);
    const grid = candidates[0] || null;
    if (!grid) return [];
    const count = grid.GetColumnCount();
    const fields = [];
    for (let i = 0; i < count; i++) {
      const col = grid.GetColumn(i);
      if (!col) continue;
      if (col.visible !== false && col.fieldName) fields.push(col.fieldName);
    }
    return fields;
  });
}

// ─── Flusso principale per abilitare una colonna ──────────────────────────────
//
// 1. Tasto destro sull'header → context menu → "Show Customization Dialog"
// 2. Click tab "Column Chooser" (in alto a destra nel dialog)
// 3. Trova la riga con il caption desiderato → click sull'icona occhio
//

async function openShowCustomizationDialog(page) {
  // Step 1: Tasto destro sul primo header visibile
  const headerCell = await page.$('.dxgvHeader_XafTheme td, .dxgv_hc td, table[id*="DXHeadersRow"] td');
  if (!headerCell) {
    log('dialog', '❌ Nessuna cella header trovata per il right-click');
    return false;
  }

  await headerCell.click({ button: 'right' });
  await sleep(1200);
  await screenshot(page, 'after-rightclick');

  // Step 2: Cerca "Show Customization Dialog" nel context menu
  const menuResult = await page.evaluate(() => {
    const allMenuItems = Array.from(document.querySelectorAll(
      '.dxm-item, [class*="ContextMenu"] td, .dx-menu-item, [id*="DXPEForm"] td, [class*="dxm"] td'
    ));
    const texts = allMenuItems.map(el => ({ text: el.textContent?.trim() || '', id: el.id, cls: el.className }));

    // Cerca "customiz" o "personaliz" nel testo
    const found = allMenuItems.find(el =>
      /customiz|personaliz/i.test(el.textContent || '')
    );
    if (found) {
      found.click();
      return { ok: true, clickedText: found.textContent?.trim() };
    }
    return { ok: false, availableItems: texts.slice(0, 30) };
  });

  if (!menuResult.ok) {
    log('dialog', '❌ "Show Customization Dialog" non trovato nel context menu');
    log('dialog', 'Voci di menu disponibili:');
    (menuResult.availableItems || []).forEach(item => {
      if (item.text) log('dialog', `  - "${item.text}" [id=${item.id}] [cls=${item.cls?.substring(0, 50)}]`);
    });
    return false;
  }

  log('dialog', `✅ Cliccato: "${menuResult.clickedText}"`);
  await sleep(2000);
  await screenshot(page, 'after-menu-click');
  return true;
}

async function navigateToColumnChooserTab(page) {
  // Cerca la tab "Column Chooser" (potrebbe essere in italiano o inglese)
  const tabResult = await page.evaluate(() => {
    // Selettori tipici per tab in DevExpress
    const tabSelectors = [
      '[class*="Tab"] span', '[class*="Tab"] td', '[role="tab"]',
      '.dxtc-tab', '.dxtc-tabText', '[id*="Tab"]',
      '[class*="tab"] span', '[class*="header"] li',
    ];

    const allTabs = [];
    for (const sel of tabSelectors) {
      const found = Array.from(document.querySelectorAll(sel));
      allTabs.push(...found.map(el => ({ el, text: el.textContent?.trim() || '' })));
    }

    // Dedup by text
    const seen = new Set();
    const unique = allTabs.filter(({ text }) => {
      if (!text || seen.has(text)) return false;
      seen.add(text);
      return true;
    });

    const colChooser = unique.find(({ text }) =>
      /column.?chooser|selettore.?colonne|scelta.?colonne/i.test(text)
    );

    if (colChooser) {
      colChooser.el.click();
      return { found: true, text: colChooser.text };
    }

    return { found: false, availableTabs: unique.map(({ text }) => text).filter(Boolean).slice(0, 20) };
  });

  if (!tabResult.found) {
    log('tab', '⚠️  Tab "Column Chooser" non trovata. Tab disponibili:');
    (tabResult.availableTabs || []).forEach(t => log('tab', `  - "${t}"`));
    log('tab', 'Procedo senza click tab (potrebbe già essere nel pannello giusto)');
    return false;
  }

  log('tab', `✅ Tab cliccata: "${tabResult.text}"`);
  await sleep(1000);
  return true;
}

async function dumpColumnChooserContent(page) {
  return page.evaluate(() => {
    // Prova a trovare il dialog/pannello aperto
    const dialogs = Array.from(document.querySelectorAll(
      '[class*="Customiz"], [class*="customiz"], [id*="Customiz"], [id*="customiz"], ' +
      '[class*="ColChooser"], [id*="ColChooser"], [role="dialog"], .dxpnlCT'
    ));

    if (dialogs.length === 0) return { found: false };

    const info = dialogs.map(d => ({
      id: d.id,
      cls: d.className?.substring(0, 80),
      visible: d.offsetParent !== null,
      htmlPreview: d.outerHTML?.substring(0, 3000),
    }));

    return { found: true, dialogs: info };
  });
}

async function findAndClickEyeIcon(page, captionText) {
  log('eye', `Cerco occhio per "${captionText}"...`);

  // Prima: dump del contenuto del dialog per debug
  const dump = await dumpColumnChooserContent(page);
  if (!dump.found) {
    log('eye', '❌ Nessun dialog/pannello Column Chooser trovato nel DOM');
    return false;
  }

  await screenshot(page, `dialog-open-${captionText.replace(/\s/g, '-')}`);

  // Strategia 1: cerca una riga con il testo della colonna + cerca l'icona occhio nella stessa riga
  const result = await page.evaluate((caption) => {
    // Tutti gli elementi che contengono il testo della caption
    const allEls = Array.from(document.querySelectorAll('*'));
    const matches = allEls.filter(el => {
      const text = el.textContent?.trim() || '';
      return text.toUpperCase() === caption.toUpperCase() ||
             (text.toUpperCase().includes(caption.toUpperCase()) && text.length < caption.length * 3);
    });

    if (matches.length === 0) {
      // Fallback: partial match
      const partial = allEls.filter(el => {
        const text = el.textContent?.trim().toUpperCase() || '';
        return text.includes(caption.toUpperCase()) && el.children.length < 5;
      });

      return {
        found: false,
        strategy: 'no-exact-match',
        partialMatches: partial.map(el => ({
          tag: el.tagName,
          id: el.id,
          cls: el.className?.substring(0, 60),
          text: el.textContent?.trim().substring(0, 80),
        })).slice(0, 20),
      };
    }

    // Prova a trovare un'icona occhio nella stessa riga/contenitore
    for (const match of matches) {
      // Risali al contenitore riga (tr, li, div riga)
      let row = match;
      for (let i = 0; i < 5; i++) {
        if (!row.parentElement) break;
        row = row.parentElement;
        if (['TR', 'LI'].includes(row.tagName) || row.className?.includes('row') || row.className?.includes('item')) break;
      }

      // Cerca icona occhio nel row
      const eyeCandidates = Array.from(row.querySelectorAll(
        '[class*="eye"], [class*="Eye"], [class*="visib"], [class*="Visib"], ' +
        '[title*="visib"], [title*="Visib"], [title*="eye"], [aria-label*="visib"], ' +
        'img[src*="eye"], img[src*="visib"], span[class*="icon"]'
      ));

      if (eyeCandidates.length > 0) {
        eyeCandidates[0].scrollIntoView({ block: 'center' });
        eyeCandidates[0].click();
        return { found: true, strategy: 'eye-icon', clickedEl: eyeCandidates[0].tagName + '#' + eyeCandidates[0].id };
      }

      // Nessuna icona occhio trovata: prova il click diretto sull'elemento riga
      // DevExpress potrebbe usare click sulla riga per toggle
      const rowInfo = {
        tag: row.tagName, id: row.id, cls: row.className?.substring(0, 80),
        html: row.outerHTML?.substring(0, 500),
      };

      return {
        found: false,
        strategy: 'found-row-but-no-eye',
        rowInfo,
        matchInfo: { tag: match.tagName, id: match.id, cls: match.className?.substring(0, 60), text: match.textContent?.trim().substring(0, 80) },
      };
    }

    return { found: false, strategy: 'no-row-with-eye' };
  }, captionText);

  if (result.found) {
    log('eye', `✅ Icona occhio cliccata (${result.strategy}): ${result.clickedEl}`);
    return true;
  }

  log('eye', `❌ Occhio non trovato. Strategia: ${result.strategy}`);
  if (result.partialMatches) {
    log('eye', 'Match parziali per il testo:');
    result.partialMatches.forEach(m => log('eye', `  - <${m.tag}> id="${m.id}" cls="${m.cls}" text="${m.text}"`));
  }
  if (result.rowInfo) {
    log('eye', `Riga trovata per il testo: <${result.rowInfo.tag}> id="${result.rowInfo.id}" cls="${result.rowInfo.cls}"`);
    log('eye', `HTML row preview:\n${result.rowInfo.html}`);
  }
  if (result.matchInfo) {
    log('eye', `Elemento match: <${result.matchInfo.tag}> id="${result.matchInfo.id}" text="${result.matchInfo.text}"`);
  }

  return false;
}

async function closeDialog(page) {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [class*="close"], [class*="Close"], [class*="btn"]'));
    const closeBtn = btns.find(b => /close|chiudi|ok|✓|×|✗/i.test(b.textContent || b.title || b.getAttribute('aria-label') || ''));
    if (closeBtn) closeBtn.click();
  });
  await sleep(800);
}

// ─── Setup colonne per una pagina ─────────────────────────────────────────────
async function setupPageColumns(page, config) {
  log(config.name, `Navigazione a ${config.url}`);
  await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitIdle(page, 20000).catch(() => log(config.name, 'waitIdle timeout, continuo'));

  const before = await getVisibleFieldNames(page);
  log(config.name, `Colonne visibili prima: ${before.length} → [${before.join(', ')}]`);

  const missing = config.missingColumns.filter(c => !before.includes(c.fieldName));
  if (missing.length === 0) {
    log(config.name, `✅ Tutte le colonne richieste già visibili, skip`);
    return { ok: true, added: [] };
  }

  log(config.name, `Mancanti: ${missing.map(c => c.fieldName).join(', ')}`);

  const added = [];
  for (const { fieldName, captionText } of missing) {
    log(config.name, `\n--- Aggiunta colonna: ${fieldName} (caption: "${captionText}") ---`);

    // Passo 1: Apri Show Customization Dialog
    const dialogOpened = await openShowCustomizationDialog(page);
    if (!dialogOpened) {
      log(config.name, `❌ Dialog non aperto per ${fieldName}`);
      continue;
    }

    // Passo 2: Vai alla tab Column Chooser
    await navigateToColumnChooserTab(page);
    await screenshot(page, `${config.name}-colchooser-tab`);

    // Passo 3: Clicca l'icona occhio
    const clicked = await findAndClickEyeIcon(page, captionText);

    if (clicked) {
      await sleep(2000);
      await waitIdle(page, 10000).catch(() => {});

      // Verifica
      const current = await getVisibleFieldNames(page);
      if (current.includes(fieldName)) {
        added.push(fieldName);
        log(config.name, `✅ ${fieldName} ora visibile nella griglia`);
      } else {
        log(config.name, `⚠️  Click eseguito ma ${fieldName} non ancora visibile. Colonne attuali: ${current.join(', ')}`);
      }
    }

    // Chiudi il dialog prima di passare alla colonna successiva
    await closeDialog(page);
    await sleep(500);
  }

  const after = await getVisibleFieldNames(page);
  log(config.name, `Colonne visibili dopo: ${after.length}`);

  const stillMissing = config.missingColumns.filter(c => !after.includes(c.fieldName));
  if (stillMissing.length > 0) {
    log(config.name, `⚠️  Ancora mancanti: ${stillMissing.map(c => c.fieldName).join(', ')}`);
  } else {
    log(config.name, `✅ Tutte le colonne ora visibili`);
  }

  return { ok: stillMissing.length === 0, added, stillMissing };
}

// ─── Entry point ─────────────────────────────────────────────────────────────
(async () => {
  ensureDebugDir();
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(40000);

  // Log console del browser per debug
  page.on('console', msg => {
    if (msg.type() === 'log') log('browser', msg.text());
  });

  try {
    await login(page);
    await waitIdle(page, 20000).catch(() => {});

    const results = [];
    for (const config of PAGES_TO_FIX) {
      try {
        const result = await setupPageColumns(page, config);
        results.push({ page: config.name, ...result });
      } catch (err) {
        log(config.name, `ERROR: ${err.message}`);
        console.error(err.stack);
        results.push({ page: config.name, ok: false, error: err.message });
      }
    }

    console.log('\n\n═══════════════════════════════════════');
    console.log('RIEPILOGO COLUMN SETUP WIZARD');
    console.log('═══════════════════════════════════════');
    for (const r of results) {
      const status = r.ok ? '✅' : '❌';
      if (r.error) {
        console.log(`${status} ${r.page}: ERROR — ${r.error}`);
      } else {
        const addedStr = r.added?.length > 0 ? `aggiunte: ${r.added.join(', ')}` : 'niente da aggiungere';
        console.log(`${status} ${r.page}: ${addedStr}`);
        if (r.stillMissing?.length > 0) {
          console.log(`   ANCORA MANCANTI: ${r.stillMissing.join(', ')}`);
        }
      }
    }
    console.log('═══════════════════════════════════════');
    console.log(`\nScreenshot di debug salvati in: ${path.resolve(DEBUG_DIR)}`);
    console.log('Wizard completato. Chiudi il browser manualmente.');

  } catch (err) {
    console.error('FATAL:', err.message);
    console.error(err.stack);
  }
})();

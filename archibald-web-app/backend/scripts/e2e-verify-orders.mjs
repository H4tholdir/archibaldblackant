/**
 * Verifica articoli e delivery address sugli ordini E2E già creati.
 *
 * Uso:
 *   ORDER_IDS=51.047,51.048,51.049 node /app/scripts/e2e-verify-orders.mjs
 *
 * Variabili opzionali:
 *   EXPECTED_COUNTS=4,2,2   — articoli attesi per ogni ordine (stessa posizione)
 *   EXPECTED_DELIVERY=,,Petrarca — testo atteso in DELIVERYPOSTALADDRESS (vuoto = skip)
 *   SCREENSHOT_DIR=/tmp
 */

import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);

const ARCHIBALD_URL = (process.env.ARCHIBALD_URL || process.env.ARCHIBALD_BASE_URL || 'https://4.231.124.90/Archibald').replace(/\/$/, '');
const ARCHIBALD_USERNAME = process.env.ARCHIBALD_USERNAME || '';
const ARCHIBALD_PASSWORD = process.env.ARCHIBALD_PASSWORD || '';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp';

if (!ARCHIBALD_USERNAME || !ARCHIBALD_PASSWORD) {
  console.error('❌  ARCHIBALD_USERNAME e ARCHIBALD_PASSWORD devono essere impostati');
  process.exit(1);
}

const rawIds = process.env.ORDER_IDS || '';
if (!rawIds) {
  console.error('❌  ORDER_IDS deve essere impostato (es. ORDER_IDS=51,047;51,048 oppure 51.047,51.048)');
  process.exit(1);
}

// Supporta ; o , come separatore tra gli ID
const orderIds = rawIds.split(/[;|]/).map(s => s.trim()).filter(Boolean);
const rawCounts = (process.env.EXPECTED_COUNTS || '').split(',').map(s => parseInt(s.trim()) || null);
const rawDelivery = (process.env.EXPECTED_DELIVERY || '').split(',').map(s => s.trim());

function log(msg) { console.log(`[VERIFY] ${msg}`); }
function ok(msg)  { console.log(`✅ ${msg}`); }
function fail(msg) { console.error(`❌ ${msg}`); }
function warn(msg) { console.warn(`⚠️  ${msg}`); }

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `verify-${name}-${Date.now()}.png`);
  try { await page.screenshot({ path: filePath, fullPage: true }); log(`Screenshot: ${filePath}`); }
  catch (e) { warn(`Screenshot failed: ${e.message}`); }
}

async function verifyOrder(bot, orderId, expectedCount, expectedDelivery) {
  const page = bot.page;
  log(`\nVerifica ordine ${orderId}...`);

  // Normalizza ID: "51,047" → "51.047" per la ricerca
  const normalizedId = orderId.replace(',', '.');

  try {
    await page.goto(`${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await bot.waitForDevExpressIdle({ label: 'list-loaded', timeout: 20000 });
    await screenshot(page, `list-${normalizedId}`);

    // Cerca e apri l'ordine
    // Cerca il bottone di modifica per l'ordine specifico e assegna ID univoco
    const idsToTry = [...new Set([normalizedId, orderId, normalizedId.replace('.', ','), orderId.replace(',', '.')])];
    let editBtnSelector = null;
    for (const idVariant of idsToTry) {
      editBtnSelector = await page.evaluate((id) => {
        const allTds = Array.from(document.querySelectorAll('td'));
        const idCell = allTds.find(td => td.textContent?.trim() === id);
        if (!idCell) return null;
        const row = idCell.closest('tr');
        if (!row) return null;
        // Pencil/edit icon è solitamente il primo link nella riga
        const btn = row.querySelector('a') || row.querySelector('[onclick]');
        if (!btn) return null;
        const uniqueId = `__e2e_btn_${Date.now()}`;
        btn.id = uniqueId;
        btn.scrollIntoView();
        return '#' + uniqueId;
      }, idVariant);
      if (editBtnSelector) break;
    }

    if (!editBtnSelector) {
      warn(`Ordine ${normalizedId}: bottone edit non trovato nella lista`);
      await screenshot(page, `notfound-${normalizedId}`);
      return { orderId: normalizedId, articleCount: null, deliveryOk: null, error: 'edit button not found' };
    }

    // Click Puppeteer nativo + waitForNavigation in parallelo (pattern corretto)
    log(`Click su bottone edit ordine ${normalizedId}...`);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      page.click(editBtnSelector),
    ]);
    await bot.waitForDevExpressIdle({ label: 'order-opened', timeout: 20000 });
    await screenshot(page, `order-${normalizedId}`);

    // Conta articoli nel grid più grande
    const articleCount = await page.evaluate(() => {
      const grids = Array.from(document.querySelectorAll('[class*="dxgvControl"]'));
      let maxRows = 0;
      for (const grid of grids) {
        const rows = grid.querySelectorAll('tr[class*="dxgvDataRow"]');
        if (rows.length > maxRows) maxRows = rows.length;
      }
      return maxRows;
    });

    if (expectedCount !== null) {
      if (articleCount === expectedCount) {
        ok(`Ordine ${normalizedId}: ${articleCount}/${expectedCount} articoli ✓`);
      } else if (articleCount === 0) {
        fail(`Ordine ${normalizedId}: 0 articoli! (attesi ${expectedCount}) — XAF ObjectSpace reset`);
      } else {
        warn(`Ordine ${normalizedId}: ${articleCount} articoli (attesi ${expectedCount})`);
      }
    } else {
      log(`Ordine ${normalizedId}: ${articleCount} articoli (nessun atteso specificato)`);
    }

    // Verifica delivery address
    let deliveryOk = null;
    if (expectedDelivery) {
      const addrValue = await page.evaluate(() => {
        const input = document.querySelector('input[id*="DELIVERYPOSTALADDRESS"][id$="_I"]');
        return input?.value?.trim() ?? '';
      });
      if (addrValue.includes(expectedDelivery)) {
        ok(`Ordine ${normalizedId}: delivery address contiene "${expectedDelivery}" ✓`);
        deliveryOk = true;
      } else {
        fail(`Ordine ${normalizedId}: delivery address "${addrValue}" NON contiene "${expectedDelivery}"`);
        deliveryOk = false;
      }
    }

    return { orderId: normalizedId, articleCount, deliveryOk, error: null };

  } catch (err) {
    warn(`Errore verifica ${normalizedId}: ${err.message}`);
    await screenshot(page, `error-${normalizedId}`).catch(() => {});
    return { orderId: normalizedId, articleCount: null, deliveryOk: null, error: err.message };
  }
}

async function main() {
  log('Caricamento ArchibaldBot...');
  const { ArchibaldBot } = require('/app/dist/bot/archibald-bot.js');

  process.env.ARCHIBALD_URL = ARCHIBALD_URL;
  process.env.ARCHIBALD_USERNAME = ARCHIBALD_USERNAME;
  process.env.ARCHIBALD_PASSWORD = ARCHIBALD_PASSWORD;
  process.env.NODE_ENV = 'production';

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    ok('Browser pronto');
    await bot.login();
    ok('Login completato');

    const results = [];
    for (let i = 0; i < orderIds.length; i++) {
      const r = await verifyOrder(bot, orderIds[i], rawCounts[i] ?? null, rawDelivery[i] ?? '');
      results.push(r);
    }

    console.log('\n' + '='.repeat(60));
    console.log('RIEPILOGO VERIFICA ORDINI');
    console.log('='.repeat(60));
    for (const r of results) {
      const icon = r.error ? '❌' : (r.articleCount !== null ? '✅' : '⚠️ ');
      console.log(`${icon} Ordine ${r.orderId}: ${r.articleCount ?? 'N/A'} articoli${r.deliveryOk !== null ? `, delivery: ${r.deliveryOk ? 'OK' : 'FAIL'}` : ''}${r.error ? ` [ERRORE: ${r.error}]` : ''}`);
    }
    console.log('='.repeat(60));

  } finally {
    try { await bot.browser?.close(); } catch {}
    try {
      const { execSync } = require('child_process');
      execSync('pkill -9 -f "Google Chrome for Testing" 2>/dev/null || true');
    } catch {}
  }
}

main().catch(err => {
  console.error('Errore fatale:', err);
  process.exit(1);
});

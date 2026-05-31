/**
 * TEST AUTOMATICO — Inserimento Ordine Fresis (30 articoli)
 * Pattern identici al bot (archibald-bot.ts).
 *
 * npx tsx test-erp/fresis-order-auto.ts 2>&1 | tee test-erp/run.log
 */

import { chromium, Page } from '@playwright/test';

const ERP = 'https://4.231.124.90/Archibald';
const USER = 'ikiA0930';
const PASS = 'Fresis26@';
const CUSTOMER_NAME = 'Fresis Soc Cooperativa';
const GLOBAL_START = Date.now();

const ARTICLES = [
  { code: '801.316.023',      variantId: '016012K2',  qty: 5,  discount: 63 }, // 1
  { code: '801.316.029',      variantId: '011879K2',  qty: 5,  discount: 63 }, // 2
  { code: 'H207D.316.012',    variantId: '040755K2',  qty: 5,  discount: 63 }, // 3
  { code: 'A100B.000.',       variantId: '10009335',  qty: 3,  discount: 63 }, // 4
  { code: 'A100S.000',        variantId: '10009341',  qty: 3,  discount: 63 }, // 5
  { code: 'A100G.000.',       variantId: '10009337',  qty: 3,  discount: 63 }, // 6
  { code: 'LD0542A.000.',     variantId: '10004659',  qty: 1,  discount: 63 }, // 7
  { code: 'SFD1F.000.',       variantId: '043257K0',  qty: 1,  discount: 63 }, // 8
  { code: 'SFM1F.000.',       variantId: '043259K0',  qty: 1,  discount: 63 }, // 9
  { code: 'SFD3F.000.',       variantId: '043261K0',  qty: 1,  discount: 63 }, // 10
  { code: 'SFM3F.000.',       variantId: '043263K0',  qty: 1,  discount: 63 }, // 11
  { code: '9933L3.000.',      variantId: '039625K0',  qty: 2,  discount: 63 }, // 12
  { code: 'SFS109.000.025',   variantId: '044694R0',  qty: 1,  discount: 63 }, // 13
  { code: '9933L6.000.',      variantId: '045151K0',  qty: 1,  discount: 63 }, // 14
  { code: '959KRD.314.018',   variantId: '039381K3',  qty: 2,  discount: 63 }, // 15
  { code: '8959KR.314.018',   variantId: '018129K2',  qty: 2,  discount: 63 }, // 16 ← CRITICO
  { code: '847KR.314.014',    variantId: '020402K2',  qty: 2,  discount: 63 }, // 17
  { code: '868.314.012',      variantId: '004535K2',  qty: 5,  discount: 63 }, // 18
  { code: '8868.314.012',     variantId: '033161K2',  qty: 5,  discount: 63 }, // 19
  { code: '868.314.016',      variantId: '004536K2',  qty: 5,  discount: 63 }, // 20
  { code: '8868.314.016',     variantId: '005059K2',  qty: 5,  discount: 63 }, // 21
  { code: '6862D.314.012',    variantId: '042991K2',  qty: 5,  discount: 63 }, // 22
  { code: '6862D.314.016',    variantId: '042992K2',  qty: 5,  discount: 63 }, // 23
  { code: '6863D.314.012',    variantId: '049005K2',  qty: 5,  discount: 63 }, // 24
  { code: '6863D.314.016',    variantId: '049006K2',  qty: 5,  discount: 63 }, // 25
  { code: '6850.314.012',     variantId: '013920K2',  qty: 5,  discount: 63 }, // 26
  { code: '6379.314.023',     variantId: '013889K2',  qty: 5,  discount: 63 }, // 27
  { code: 'KP6370.314.035',   variantId: '10006293',  qty: 5,  discount: 63 }, // 28
  { code: '6856.310.018',     variantId: '013145K2',  qty: 5,  discount: 63 }, // 29
  { code: 'H162SXL.314.014',  variantId: '040890K2',  qty: 5,  discount: 63 }, // 30
] as const;

// ── LOG ──────────────────────────────────────────────────────────────────────
function log(msg: string, data?: unknown) {
  const e = ((Date.now() - GLOBAL_START) / 1000).toFixed(1).padStart(7);
  const s = data !== undefined ? `  ${JSON.stringify(data)}` : '';
  console.log(`[${e}s] ${msg}${s}`);
}

// ── DX HELPERS (pattern identici al bot) ────────────────────────────────────
// Helper DX: usa ForEachControl (API corretta del bot)
function dxCol(w: Record<string, unknown>) {
  return (w['ASPxClientControl'] as { GetControlCollection?: () => { ForEachControl?: (fn: (c: unknown) => void) => void; GetByName?: (n: string) => unknown } } | undefined)?.GetControlCollection?.();
}

async function waitForDXInit(page: Page, maxMs = 30000): Promise<void> {
  try {
    await page.waitForFunction(() => {
      const w = window as Record<string, unknown>;
      const c = (w['ASPxClientControl'] as { GetControlCollection?: () => { ForEachControl?: (fn: (c: unknown) => void) => void } } | undefined)?.GetControlCollection?.();
      if (!c) return false;
      let cnt = 0;
      c.ForEachControl?.(() => cnt++);
      return cnt > 0;
    }, { timeout: maxMs, polling: 500 });
  } catch { /* DX non inizializzato nel timeout */ }
}

async function dxIdle(page: Page, maxMs = 10000): Promise<void> {
  try {
    await page.waitForFunction(() => {
      const w = window as Record<string, unknown>;
      const col = (w['ASPxClientControl'] as { GetControlCollection?: () => { ForEachControl?: (fn: (c: { InCallback?: () => boolean }) => void) => void } } | undefined)?.GetControlCollection?.();
      if (!col) return true;
      let busy = false;
      col.ForEachControl?.((c) => { if ((c as { InCallback?: () => boolean })?.InCallback?.()) busy = true; });
      return !busy;
    }, { timeout: maxMs, polling: 200 });
  } catch { /* timeout, proceed */ }
}

async function getGridName(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const w = window as Record<string, unknown>;
    const col = (w['ASPxClientControl'] as { GetControlCollection?: () => { ForEachControl?: (fn: (c: Record<string, unknown>) => void) => void } } | undefined)?.GetControlCollection?.();
    if (!col) return null;
    let result: string | null = null;
    // Pattern identico al bot: dviSALESLINEs + AddNewRow (è un grid, non un button)
    col.ForEachControl?.((c) => {
      const nm = (c as { name?: string })?.name ?? '';
      if (nm.includes('dviSALESLINEs') && typeof (c as { AddNewRow?: unknown }).AddNewRow === 'function') result = nm;
    });
    return result;
  });
}

async function getGridState(page: Page, gn: string): Promise<{ isEditing: boolean; rowCount: number; inCallback: boolean }> {
  return page.evaluate((g: string) => {
    const w = window as Record<string, unknown>;
    const grid = (w['ASPxClientControl'] as { GetControlCollection?: () => { GetByName?: (n: string) => { IsEditing?: () => boolean; GetRowCount?: () => number; InCallback?: () => boolean } } } | undefined)?.GetControlCollection?.()?.GetByName?.(g);
    return { isEditing: grid?.IsEditing?.() ?? false, rowCount: grid?.GetRowCount?.() ?? 0, inCallback: grid?.InCallback?.() ?? false };
  }, gn);
}

// ── NAVIGAZIONE (pattern bot) ─────────────────────────────────────────────
async function gotoWithAbortFix(page: Page, url: string, waitUntil: 'domcontentloaded' | 'networkidle' | 'load' = 'domcontentloaded', timeout = 30000): Promise<void> {
  try {
    await page.goto(url, { waitUntil, timeout });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ERR_ABORTED') || msg.includes('net::ERR')) {
      // ERR_ABORTED è normale nell'ERP (redirect cascade), verifica URL finale
      const finalUrl = page.url();
      if (finalUrl !== 'about:blank') {
        log(`  [nav] ERR_ABORTED su ${url.split('/').pop()} → URL finale: ${finalUrl.split('/').pop()}`);
        return; // Continuiamo con la pagina caricata
      }
    }
    throw err;
  }
}

// ── CUSTOMER SELECTION ────────────────────────────────────────────────────
const CUSTOMER_ID = '55.261'; // Fresis Soc Cooperativa

async function selectCustomer(page: Page): Promise<void> {
  const t0 = Date.now();

  // Trova il campo cliente CUSTTABLE
  const custInfo = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const inp = inputs.find(el => el.id.toLowerCase().includes('custtable') && !el.disabled && el.getBoundingClientRect().height > 0);
    if (!inp) return null;
    const baseId = inp.id.endsWith('_I') ? inp.id.slice(0, -2) : inp.id;
    for (const suf of ['_B-1', '_B-1Img', '_B']) {
      const b = document.getElementById(baseId + suf);
      if (b && b.offsetParent !== null) return { inputId: inp.id, baseId, btnId: baseId + suf };
    }
    return { inputId: inp.id, baseId, btnId: null };
  });

  if (!custInfo) { log('  ⚠️ Campo CUSTTABLE non trovato'); return; }
  log(`  Campo cliente baseId: ${custInfo.baseId}`);

  // Approccio 1: SetValue via DevExpress API (più affidabile)
  const dxSet = await page.evaluate(({ baseId, custId }: { baseId: string; custId: string }) => {
    const w = window as Record<string, unknown>;
    const col = (w['ASPxClientControl'] as { GetControlCollection?: () => { ForEachControl?: (fn: (c: Record<string, unknown>) => void) => void } } | undefined)?.GetControlCollection?.();
    if (!col) return false;
    let found = false;
    col.ForEachControl?.((c) => {
      const nm = (c as { name?: string })?.name ?? '';
      if (nm.includes('CUSTTABLE') && typeof (c as { SetValue?: unknown }).SetValue === 'function') {
        (c as { SetValue: (v: string) => void }).SetValue(custId);
        found = true;
      }
    });
    return found;
  }, { baseId: custInfo.baseId, custId: CUSTOMER_ID });

  if (dxSet) {
    log(`  SetValue API: ID ${CUSTOMER_ID} impostato`);
    await dxIdle(page, 8000);
  } else {
    // Approccio 2: apri popup con doppio click sull'input e cerca
    log('  SetValue non disponibile, provo popup...');
    if (custInfo.btnId) {
      await page.click(`#${custInfo.btnId}`);
      await page.waitForTimeout(2000);

      // Cerca search input con selettore più generico
      const anySearchInput = await page.evaluate((baseId: string) => {
        const popup = document.querySelector(`[id*="${baseId}_DDD"]`);
        if (!popup) return null;
        const inputs = Array.from(popup.querySelectorAll('input[type="text"]'))
          .filter(el => (el as HTMLElement).offsetParent !== null) as HTMLInputElement[];
        return inputs[0]?.id ?? null;
      }, custInfo.baseId);

      if (anySearchInput) {
        log(`  Popup search: ${anySearchInput}`);
        await page.fill(`#${anySearchInput}`, CUSTOMER_NAME.substring(0, 20));
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        await page.keyboard.press('Tab'); // Tab invece di click per selezionare
        await dxIdle(page, 8000);
      } else {
        log('  ⚠️ Popup non trovato, continuo senza cliente');
        await page.keyboard.press('Escape');
      }
    }
  }

  const custVal = await page.evaluate((id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '', custInfo.inputId).catch(() => '?');
  log(`  URL: ${page.url()}`);
  log(`  Valore campo cliente: "${custVal}" in ${Date.now() - t0}ms`);
}

// ── INSERIMENTO ARTICOLO (pattern identico al bot) ───────────────────────
async function insertArticle(page: Page, art: (typeof ARTICLES)[number], num: number, gridName: string): Promise<{ ok: boolean; stuck: boolean; ms: number }> {
  const t0 = Date.now();
  log(`\n${'━'.repeat(60)}\nArt ${num}/30: ${art.code} | qty:${art.qty} | disc:${art.discount}% | var:${art.variantId}`);

  // ── AddNew (via API DevExpress o DOM) ──────────────────────────────
  // Tenta prima DOM click, poi API diretta come fallback
  const t_addnew = Date.now();
  const addNewDomClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a[data-args*="AddNew"]'))
      .find(el => (el as HTMLElement).offsetParent !== null) as HTMLElement | null;
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!addNewDomClicked) {
    // Fallback: API DevExpress AddNewRow
    await page.evaluate((gn: string) => {
      const w = window as Record<string, unknown>;
      const grid = (w['ASPxClientControl'] as { GetControlCollection?: () => { GetByName?: (n: string) => { AddNewRow?: () => void } } } | undefined)?.GetControlCollection?.()?.GetByName?.(gn);
      grid?.AddNewRow?.();
    }, gridName);
    log(`  AddNew via API`);
  }
  await page.waitForSelector('tr[id*="editnew"]', { state: 'visible', timeout: 10000 }).catch(() => log('  editnew row timeout'));
  log(`  AddNew: ${Date.now() - t_addnew}ms`);

  // ── Focus INVENTTABLE (Strategy 1: JS focus — identico al bot) ──────
  let inventtableId: string | null = null;

  await page.waitForFunction(() => {
    const inputs = Array.from(document.querySelectorAll('input[id*="INVENTTABLE"][id$="_I"]'));
    return inputs.some(inp => (inp as HTMLElement).offsetParent !== null && (inp as HTMLElement).offsetWidth > 0);
  }, { timeout: 8000, polling: 300 }).catch(() => log('  INVENTTABLE wait timeout'));

  inventtableId = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[id*="INVENTTABLE"][id$="_I"]'));
    for (const inp of inputs) {
      if ((inp as HTMLElement).offsetParent !== null && (inp as HTMLElement).offsetWidth > 0) return (inp as HTMLInputElement).id;
    }
    return null;
  });

  if (!inventtableId) {
    // Fallback: clicca cella N/A nella editnew row (Strategy 2 del bot)
    await page.evaluate(() => {
      const row = document.querySelector('tr[id*="editnew"]');
      if (!row) return;
      const cells = Array.from(row.querySelectorAll('td'));
      for (const cell of cells) {
        const txt = cell.textContent?.trim() || '';
        if (txt === 'N/A' || cell.querySelector('[class*="dxeDropDown"]')) {
          const rect = cell.getBoundingClientRect();
          if (rect.width > 0) { (cell as HTMLElement).click(); break; }
        }
      }
    });
    await page.waitForTimeout(500);
    inventtableId = await page.evaluate(() => {
      const inp = document.querySelector('input[id*="INVENTTABLE"][id$="_I"]') as HTMLInputElement | null;
      return inp?.id ?? null;
    });
  }

  if (!inventtableId) { log(`  ❌ INVENTTABLE non trovato`); return { ok: false, stuck: false, ms: Date.now() - t0 }; }

  await page.evaluate((id: string) => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); el.click(); }
  }, inventtableId);
  await page.waitForTimeout(200);

  const inventtableBaseId = inventtableId.endsWith('_I') ? inventtableId.slice(0, -2) : inventtableId;

  // ── Digita codice articolo (OTTIMIZZATO: paste+ultimo char) ─────────
  const code = art.code;
  const t_type = Date.now();
  if (code.length > 1) {
    await page.evaluate((text: string) => {
      const input = document.activeElement as HTMLInputElement;
      if (input?.tagName === 'INPUT') {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      }
    }, code.slice(0, -1));
    await page.keyboard.type(code.slice(-1), { delay: 30 });
  } else {
    await page.keyboard.type(code, { delay: 30 });
  }
  log(`  Typed "${code}": ${Date.now() - t_type}ms`);

  // ── Aspetta dropdown IncrementalFiltering (pattern identico al bot) ──
  let rowCount = 0;
  try {
    await page.waitForFunction((baseId: string) => {
      for (const suffix of ['_DDD_L', '_DDD_PW', '_DDD']) {
        const el = document.getElementById(baseId + suffix);
        if (el) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && el.querySelector('tr[class*="dxgvDataRow"]')) return true; }
      }
      const popups = Array.from(document.querySelectorAll('.dxpcLite, .dxpc-content'));
      return popups.some(p => (p as HTMLElement).getBoundingClientRect().width > 0 && p.querySelector('tr[class*="dxgvDataRow"]'));
    }, { timeout: 8000, polling: 100 }, inventtableBaseId);

    rowCount = await page.evaluate((baseId: string) => {
      for (const suffix of ['_DDD_L', '_DDD_PW', '_DDD']) {
        const el = document.getElementById(baseId + suffix);
        if (el && el.getBoundingClientRect().width > 0) { const rows = el.querySelectorAll('tr[class*="dxgvDataRow"]'); if (rows.length > 0) return rows.length; }
      }
      return document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
    }, inventtableBaseId);
    log(`  Dropdown: ${rowCount} righe`);
  } catch {
    log(`  ⚠️ Dropdown timeout per ${code}`);
  }

  // ── Seleziona variante ───────────────────────────────────────────────
  const suffix = art.variantId.replace(/^\d+/, ''); // e.g. "K2", "K3", "K0"
  if (rowCount > 0) {
    const selected = await page.evaluate((baseId: string, suf: string) => {
      // Trova container dropdown
      let container: Element | null = null;
      for (const sfx of ['_DDD_L', '_DDD_PW', '_DDD']) {
        const el = document.getElementById(baseId + sfx);
        if (el && el.getBoundingClientRect().width > 0 && el.querySelector('tr[class*="dxgvDataRow"]')) { container = el; break; }
      }
      if (!container) {
        container = Array.from(document.querySelectorAll('.dxpcLite, .dxpc-content')).find(p => (p as HTMLElement).getBoundingClientRect().width > 0 && p.querySelector('tr[class*="dxgvDataRow"]')) ?? null;
      }
      if (!container) return false;

      const rows = Array.from(container.querySelectorAll('tr[class*="dxgvDataRow"]'));
      if (rows.length === 0) return false;
      if (rows.length === 1 || !suf) { (rows[0] as HTMLElement).click(); return true; }

      for (const row of rows) {
        const txt = row.textContent ?? '';
        if (txt.includes(suf)) { (row as HTMLElement).click(); return true; }
      }
      (rows[0] as HTMLElement).click(); return true;
    }, inventtableBaseId, suffix);

    if (!selected) log(`  ⚠️ Riga variante non trovata`);
    else log(`  Variante "${suffix}" selezionata`);
  }

  await dxIdle(page, 5000);
  const t_afterVariant = Date.now() - t0;
  log(`  Post-variante: ${t_afterVariant}ms`);

  // ── Quantità ─────────────────────────────────────────────────────────
  const editRow = page.locator('tr[id*="editnew"]').first();
  const qtyInput = editRow.locator('input[id*="QTY" i], input[id*="Qty" i], input[id*="LINEQTY" i]').first();
  if (await qtyInput.isVisible().catch(() => false)) {
    const cur = parseInt(await qtyInput.inputValue().catch(() => '1'), 10);
    if (cur !== art.qty) {
      await qtyInput.click({ clickCount: 3 });
      await qtyInput.fill(art.qty.toString());
      await page.keyboard.press('Tab');
      await dxIdle(page, 4000);
      log(`  Qty ${cur}→${art.qty}: ${Date.now() - t0}ms`);
    }
  }

  // ── Sconto (pattern bot: paste+Enter con retry) ───────────────────
  const discInput = editRow.locator('input[id*="MANUALDISCOUNT" i], input[id*="LineDisc" i], input[id*="DISCPCT" i]').first();
  if (await discInput.isVisible().catch(() => false)) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        await dxIdle(page, 5000);
        await page.waitForTimeout(2000);
      }
      const discId = await discInput.getAttribute('id');
      if (discId) {
        const coord = await page.evaluate((id: string) => {
          const inp = document.getElementById(id);
          if (!inp) return null;
          inp.scrollIntoView({ block: 'center' });
          const r = inp.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }, discId);
        if (coord) await page.mouse.click(coord.x, coord.y, { clickCount: 2 });
      }
      await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
      await page.evaluate((v: string) => document.execCommand('insertText', false, v), art.discount.toString());
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);

      const raw = await discInput.inputValue().catch(() => '');
      const num = parseFloat(raw.replace(/[^0-9.,]/g, '').replace(',', '.'));
      log(`  Disc attempt ${attempt}: letto="${raw}" (${Date.now() - t0}ms)`);
      if (Math.abs(num - art.discount) < 0.5) break;
      if (attempt === 3) log('  ❌ Discount non impostato');
    }
  }

  // ── UpdateEdit + monitoring IsEditing ────────────────────────────────
  const t_update = Date.now();
  const updateBtn = page.locator('a[data-args*="UpdateEdit"]:visible').first();
  await updateBtn.click();
  log(`  UpdateEdit click: ${Date.now() - t_update}ms dopo start`);

  // Polling con log ogni 5s
  const MAX_WAIT = 90_000;
  let editingCleared = false;
  for (let elapsed = 0; elapsed < MAX_WAIT; elapsed += 2000) {
    await page.waitForTimeout(2000);
    const state = await getGridState(page, gridName);
    if (!state.isEditing) {
      log(`  ✅ IsEditing=false a ${Date.now() - t_update}ms (rows:${state.rowCount})`);
      editingCleared = true;
      break;
    }
    if ((elapsed + 2000) % 10000 < 2001) {
      log(`  ⏳ IsEditing true a ${Date.now() - t_update}ms`, { inCallback: state.inCallback, rows: state.rowCount });
    }
  }

  if (!editingCleared) {
    log(`  ⚠️ STUCK dopo ${Date.now() - t_update}ms`);
    return { ok: false, stuck: true, ms: Date.now() - t0 };
  }

  log(`  ✅ Art ${num} in ${Date.now() - t0}ms total`);
  return { ok: true, stuck: false, ms: Date.now() - t0 };
}

// ── RELOAD AND RESUME ─────────────────────────────────────────────────────
async function reloadAndResume(page: Page): Promise<{ gn: string; rows: number }> {
  log('\n🔄 RELOAD & RESUME...');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  await dxIdle(page, 30_000);
  const gn = await getGridName(page);
  if (!gn) throw new Error('Grid non trovata dopo reload');
  const state = await getGridState(page, gn);
  log(`  Post-reload: rows=${state.rowCount}`);
  return { gn, rows: state.rowCount };
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  log(`=== START ${ERP} user:${USER} ===`);

  const browser = await chromium.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: [
      '--ignore-certificate-errors',
      '--ignore-ssl-errors',
      '--disable-web-security',
      '--allow-running-insecure-content',
    ],
  });

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  // ── LOGIN ──────────────────────────────────────────────────────────────
  log('=== LOGIN ===');
  await gotoWithAbortFix(page, `${ERP}/Login.aspx`, 'networkidle', 30000);
  log(`Login page: ${page.url()}`);

  await page.locator('input[type="text"][id$="_I"]').first().fill(USER);
  await page.locator('input[type="password"][id$="_I"]').first().fill(PASS);
  // Click Accedi e aspetta la navigazione (DevExpress usa JS submit, ci vogliono 3-5s)
  await page.locator('a:has-text("Accedi"), a:has-text("Login")').first().click();
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000); // extra buffer per redirect cascata
  log(`Post-login URL: ${page.url()}`);

  // Se ancora su Login.aspx, prova a risubmittare via form
  if (page.url().includes('Login.aspx')) {
    log('  Retry login via form submit...');
    await page.evaluate(() => {
      const forms = document.forms;
      if (forms.length > 0) (forms[0] as HTMLFormElement).submit();
    });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    log(`  Post-retry URL: ${page.url()}`);
  }

  // ── LISTA ORDINI → CLICK NUOVO ──────────────────────────────────────────
  log('=== LISTA ORDINI ===');
  await gotoWithAbortFix(page, `${ERP}/SALESTABLE_ListView_Agent/`, 'domcontentloaded', 30000);
  await dxIdle(page, 10000);
  log(`ListView URL: ${page.url()}`);

  // Aspetta bottone "Nuovo" (DevExpress menu item a.dxm-content)
  await page.waitForSelector('a.dxm-content:has-text("Nuovo"), a:has-text("Nuovo")', { state: 'visible', timeout: 15000 });

  log('=== CLICK NUOVO ===');
  const urlBefore = page.url();
  // Playwright native click (non JS) per triggerare eventi DevExpress corretti
  await page.locator('a.dxm-content:has-text("Nuovo"), a[id*="mainMenu"][id$="_T"]:has-text("Nuovo")').first().click();

  // Aspetta navigazione verso DetailView
  await page.waitForFunction((old: string) => window.location.href !== old && window.location.href.includes('SALESTABLE_DetailViewAgent'), { timeout: 15000, polling: 300 }, urlBefore).catch(() => log('  Timeout navigazione DetailView'));
  await dxIdle(page, 10000);
  log(`Form ordine (pre-edit): ${page.url()}`);

  // Se non in edit mode, clicca "Modifica" (identico a navigateToOrderEditModeForChunk)
  if (!page.url().includes('mode=Edit')) {
    log('  Clicca Modifica per entrare in edit mode...');
    const modifica = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a, button'))
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .find(el => /^modif/i.test((el as HTMLElement).title?.trim() ?? '') || /^modif$/i.test(el.textContent?.trim() ?? '') || /^edit$/i.test(el.textContent?.trim() ?? ''));
      if (btn) { (btn as HTMLElement).click(); return true; }
      return false;
    });
    if (modifica) {
      await page.waitForFunction(() => window.location.href.includes('mode=Edit'), { timeout: 10000, polling: 300 }).catch(() => log('  mode=Edit timeout, continuo'));
      await dxIdle(page, 10000);
    } else {
      log('  Modifica non trovato');
    }
  }
  log(`Form ordine: ${page.url()}`);

  // Aspetta DX init
  await waitForDXInit(page, 20000);
  await dxIdle(page, 8000);

  // ── SELEZIONA CLIENTE ──────────────────────────────────────────────────
  log('=== CLIENTE ===');
  await selectCustomer(page);

  // ── SALVA L'HEADER per rendere SALESLINES editabile ──────────────────
  // In XAF, ?NewObject=true ha SALESLINES read-only. Dopo "Salvare",
  // il form passa a mode=Edit con ordine reale e grid editabile.
  log('=== SALVA HEADER ===');
  const saveBtnHeader = page.locator('a[id*="mainMenu"][id$="_T"]:has-text("Salvare"), a[id*="mainMenu"][id$="_T"]:has-text("Save")').first();
  if (await saveBtnHeader.isVisible().catch(() => false)) {
    // Usa Promise.race: il click causa navigazione che distrugge il contesto — gestiamo entrambi i casi
    await Promise.race([
      saveBtnHeader.click().then(() => page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 })),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
    ]).catch(() => page.waitForTimeout(3000));

    log(`Post-save URL: ${page.url()}`);
    await waitForDXInit(page, 15000);
    await dxIdle(page, 10000);

    // Se non in mode=Edit, clicca Modifica
    if (!page.url().includes('mode=Edit') && !page.url().includes('NewObject')) {
      const modifica2 = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('a, button')).filter(el => (el as HTMLElement).offsetParent !== null)
          .find(el => /^modif/i.test(el.textContent?.trim() ?? ''));
        if (btn) { (btn as HTMLElement).click(); return true; }
        return false;
      }).catch(() => false);
      if (modifica2) {
        await page.waitForFunction(() => window.location.href.includes('mode=Edit'), { timeout: 10000, polling: 300 }).catch(() => {});
        await waitForDXInit(page, 15000);
        await dxIdle(page, 10000);
      }
      log(`Edit mode URL: ${page.url()}`);
    }
  } else {
    log('  Salvare non visibile, provo a continuare');
  }

  // ── SCOPRI GRIGLIA ─────────────────────────────────────────────────────
  await waitForDXInit(page, 20000);
  await dxIdle(page, 8000);
  let gridName = await getGridName(page);
  if (!gridName) {
    await page.waitForTimeout(5000);
    gridName = await getGridName(page);
  }
  if (!gridName) throw new Error('Grid SALESLINES non trovata');
  log(`Grid: ${gridName}`);

  // ── INSERIMENTO ARTICOLI ───────────────────────────────────────────────
  log(`\n${'═'.repeat(70)}\nINSERIMENTO 30 ARTICOLI\n${'═'.repeat(70)}`);

  const timings: { num: number; code: string; ms: number; ok: boolean; stuck: boolean }[] = [];
  let currentGrid = gridName;
  let idx = 0;

  while (idx < ARTICLES.length) {
    const art = ARTICLES[idx];
    const num = idx + 1;

    const result = await insertArticle(page, art, num, currentGrid);
    timings.push({ num, code: art.code, ms: result.ms, ok: result.ok, stuck: result.stuck });

    if (result.stuck) {
      try {
        const { gn, rows } = await reloadAndResume(page);
        currentGrid = gn;
        if (rows >= num) { log(`Art ${num} già salvato (rows=${rows}). Avanzo.`); idx++; }
        else { log(`Art ${num} non salvato (rows=${rows}). Re-inserisco.`); }
      } catch (err) {
        log(`Reload fallito: ${err}. Skip art ${num}.`);
        idx++;
      }
    } else {
      idx++;
    }
  }

  // ── RIEPILOGO ──────────────────────────────────────────────────────────
  log(`\n${'═'.repeat(70)}\nRIEPILOGO\n${'═'.repeat(70)}`);
  for (const t of timings) {
    const flag = t.stuck ? '⚠️  STUCK' : t.ok ? '✅ OK   ' : '❌ FAIL ';
    log(`  Art ${String(t.num).padStart(2)}: ${t.code.padEnd(22)} ${flag} ${t.ms}ms`);
  }
  log(`Totale: ${((Date.now() - GLOBAL_START) / 1000).toFixed(1)}s`);

  // ── SALVA ──────────────────────────────────────────────────────────────
  log('\n=== SALVATAGGIO ===');
  const saveBtn = page.locator('a[id*="Save" i]:visible, a:has-text("Salva"):visible').first();
  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
    await dxIdle(page, 30000);
    log(`Salvato! URL: ${page.url()}`);
  } else {
    log('⚠️ Salva non trovato — ordine non salvato');
  }

  await browser.close();
  log(`=== FINE ${((Date.now() - GLOBAL_START) / 1000).toFixed(1)}s ===`);
}

main().catch(err => { log(`ERRORE: ${err}`); process.exit(1); });

/**
 * TEST E2E — Inserimento Ordine Fresis Soc Cooperativa (30 articoli)
 *
 * Esegui:
 *   cd /Users/hatholdir/Downloads/Archibald
 *   ERP_USER=xxx ERP_PASS=yyy npx --prefix archibald-web-app/frontend tsx test-erp/fresis-order.ts
 *
 * Richiede Playwright Chromium installato:
 *   npx --prefix archibald-web-app/frontend playwright install chromium
 */

import { chromium, Page } from '@playwright/test';
import * as readline from 'readline';

// ── CONFIGURAZIONE ───────────────────────────────────────────────────────────
const ERP = 'https://4.231.124.90/Archibald';
const USER = process.env.ERP_USER ?? '';
const PASS = process.env.ERP_PASS ?? '';
const CUSTOMER_ID = '55.261'; // Fresis Soc Cooperativa

if (!USER || !PASS) {
  console.error('⚠️  Imposta ERP_USER e ERP_PASS prima di eseguire.');
  process.exit(1);
}

// ── ARTICOLI (30 ERP, esclusi 3 warehouse-only) ──────────────────────────────
// Nota: articleId = variantId dalla PWA (es. "016012K2" → suffisso "K2")
const ARTICLES = [
  { code: '801.316.023',       variantId: '016012K2',  qty: 5,  discount: 63 }, // 1
  { code: '801.316.029',       variantId: '011879K2',  qty: 5,  discount: 63 }, // 2
  { code: 'H207D.316.012',     variantId: '040755K2',  qty: 5,  discount: 63 }, // 3
  { code: 'A100B.000.',        variantId: '10009335',  qty: 3,  discount: 63 }, // 4
  { code: 'A100S.000',         variantId: '10009341',  qty: 3,  discount: 63 }, // 5
  { code: 'A100G.000.',        variantId: '10009337',  qty: 3,  discount: 63 }, // 6
  { code: 'LD0542A.000.',      variantId: '10004659',  qty: 1,  discount: 63 }, // 7
  { code: 'SFD1F.000.',        variantId: '043257K0',  qty: 1,  discount: 63 }, // 8
  { code: 'SFM1F.000.',        variantId: '043259K0',  qty: 1,  discount: 63 }, // 9
  { code: 'SFD3F.000.',        variantId: '043261K0',  qty: 1,  discount: 63 }, // 10
  { code: 'SFM3F.000.',        variantId: '043263K0',  qty: 1,  discount: 63 }, // 11
  { code: '9933L3.000.',       variantId: '039625K0',  qty: 2,  discount: 63 }, // 12
  { code: 'SFS109.000.025',    variantId: '044694R0',  qty: 1,  discount: 63 }, // 13
  { code: '9933L6.000.',       variantId: '045151K0',  qty: 1,  discount: 63 }, // 14
  { code: '959KRD.314.018',    variantId: '039381K3',  qty: 2,  discount: 63 }, // 15
  { code: '8959KR.314.018',    variantId: '018129K2',  qty: 2,  discount: 63 }, // 16 ← CRITICO
  { code: '847KR.314.014',     variantId: '020402K2',  qty: 2,  discount: 63 }, // 17
  { code: '868.314.012',       variantId: '004535K2',  qty: 5,  discount: 63 }, // 18
  { code: '8868.314.012',      variantId: '033161K2',  qty: 5,  discount: 63 }, // 19
  { code: '868.314.016',       variantId: '004536K2',  qty: 5,  discount: 63 }, // 20
  { code: '8868.314.016',      variantId: '005059K2',  qty: 5,  discount: 63 }, // 21
  { code: '6862D.314.012',     variantId: '042991K2',  qty: 5,  discount: 63 }, // 22
  { code: '6862D.314.016',     variantId: '042992K2',  qty: 5,  discount: 63 }, // 23
  { code: '6863D.314.012',     variantId: '049005K2',  qty: 5,  discount: 63 }, // 24
  { code: '6863D.314.016',     variantId: '049006K2',  qty: 5,  discount: 63 }, // 25
  { code: '6850.314.012',      variantId: '013920K2',  qty: 5,  discount: 63 }, // 26
  { code: '6379.314.023',      variantId: '013889K2',  qty: 5,  discount: 63 }, // 27
  { code: 'KP6370.314.035',    variantId: '10006293',  qty: 5,  discount: 63 }, // 28
  { code: '6856.310.018',      variantId: '013145K2',  qty: 5,  discount: 63 }, // 29
  { code: 'H162SXL.314.014',   variantId: '040890K2',  qty: 5,  discount: 63 }, // 30
] as const;

// ── HELPERS ──────────────────────────────────────────────────────────────────
function ts(): string {
  return new Date().toISOString().substring(11, 19);
}

function log(msg: string, extra?: unknown): void {
  const suffix = extra !== undefined ? `  ${JSON.stringify(extra)}` : '';
  console.log(`[${ts()}] ${msg}${suffix}`);
}

async function pause(msg = 'Premi INVIO per continuare...'): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>(resolve => rl.question(`\n⏸  ${msg}\n`, () => { rl.close(); resolve(); }));
}

/** Aspetta che TUTTI i controlli DevExpress abbiano InCallback=false */
async function waitDXIdle(page: Page, label: string, maxMs = 12000): Promise<void> {
  const t0 = Date.now();
  try {
    await page.waitForFunction(
      () => {
        const w = window as Record<string, unknown>;
        const ASPx = w['ASPxClientControl'] as { GetControlCollection?: () => { GetCount?: () => number; Get?: (i: number) => { InCallback?: () => boolean } } } | undefined;
        const col = ASPx?.GetControlCollection?.();
        if (!col) return true;
        const n = col.GetCount?.() ?? 0;
        for (let i = 0; i < n; i++) { if (col.Get?.(i)?.InCallback?.()) return false; }
        return true;
      },
      { timeout: maxMs, polling: 200 }
    );
    log(`  ↳ DX idle [${label}] in ${Date.now() - t0}ms`);
  } catch {
    log(`  ↳ DX idle [${label}] TIMEOUT ${Date.now() - t0}ms`);
  }
}

/** Scopre il nome della griglia SALESLINES */
async function discoverGrid(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const w = window as Record<string, unknown>;
    const ASPx = w['ASPxClientControl'] as { GetControlCollection?: () => { GetCount?: () => number; Get?: (i: number) => { name?: string } } } | undefined;
    const col = ASPx?.GetControlCollection?.();
    if (!col) return null;
    const n = col.GetCount?.() ?? 0;
    for (let i = 0; i < n; i++) {
      const nm = col.Get?.(i)?.name ?? '';
      if (nm.toUpperCase().includes('SLIN') || nm.toUpperCase().includes('SALESLIN')) return nm;
    }
    return null;
  });
}

/** Numero di righe nella griglia */
async function getRowCount(page: Page, gridName: string): Promise<number> {
  return page.evaluate((gn: string) => {
    const w = window as Record<string, unknown>;
    const ASPx = w['ASPxClientControl'] as { GetControlCollection?: () => { GetByName?: (n: string) => { GetRowCount?: () => number } } } | undefined;
    const g = ASPx?.GetControlCollection?.()?.GetByName?.(gn);
    return g?.GetRowCount?.() ?? 0;
  }, gridName);
}

/** IsEditing della griglia */
async function isEditing(page: Page, gridName: string): Promise<boolean> {
  return page.evaluate((gn: string) => {
    const w = window as Record<string, unknown>;
    const ASPx = w['ASPxClientControl'] as { GetControlCollection?: () => { GetByName?: (n: string) => { IsEditing?: () => boolean } } } | undefined;
    const g = ASPx?.GetControlCollection?.()?.GetByName?.(gn);
    return g?.IsEditing?.() ?? false;
  }, gridName);
}

/** Clicca AddNew e aspetta la riga di editing */
async function clickAddNew(page: Page): Promise<void> {
  const t0 = Date.now();
  const btn = page.locator('a[data-args*="AddNew"]').filter({ has: page.locator(':visible') }).first();
  await btn.click();
  await page.waitForSelector('tr[id*="editnew"]', { state: 'visible', timeout: 10000 });
  log(`  AddNew: ${Date.now() - t0}ms`);
}

/** Digita il codice articolo e seleziona la variante giusta */
async function typeAndSelectVariant(page: Page, code: string, variantId: string): Promise<void> {
  const t0 = Date.now();
  const editRow = page.locator('tr[id*="editnew"]').first();

  // Il campo articolo in DevExpress è un LookupEdit su INVENTTABLE
  const articleInput = editRow.locator('input').filter({
    has: page.locator('[id*="INVENTTABLE" i], [id*="InventTable" i]'),
  }).or(editRow.locator('input').first());

  await articleInput.click({ clickCount: 3 });
  await page.keyboard.type(code, { delay: 30 });
  log(`  Typed ${code}: ${Date.now() - t0}ms`);

  // Aspetta dropdown IncrementalFiltering
  await waitDXIdle(page, 'after-type', 8000);
  await page.waitForTimeout(300);

  // Dropdown DevExpress (ListBox o popup)
  const dropdownRow = page.locator('.dxeListBoxItem, [class*="dxLb"] td, [id*="DDD"] td').filter({ hasText: code.split('.')[0] });

  const ddVisible = await dropdownRow.first().isVisible().catch(() => false);
  if (!ddVisible) {
    // Fallback: cerca qualsiasi riga nel dropdown
    const anyRow = page.locator('.dxeListBoxItem, [class*="dxLb"] td').first();
    const anyVis = await anyRow.isVisible().catch(() => false);
    if (!anyVis) {
      log(`  ⚠️ Dropdown non visibile per ${code} — verificare in browser`);
      await pause(`Seleziona manualmente la variante "${variantId}" poi premi INVIO`);
      return;
    }
  }

  // Conta le righe
  const allRows = page.locator('.dxeListBoxItem, [class*="dxLb"] td');
  const count = await allRows.count();
  log(`  Dropdown: ${count} righe`);

  if (count === 0) {
    await pause(`Nessuna riga per ${code}. Seleziona manualmente poi premi INVIO`);
    return;
  }

  // Estrai suffisso variante (es. "K2" da "016012K2")
  const suffix = variantId.replace(/^\d+/, '');

  if (count === 1 || !suffix) {
    await allRows.first().click();
    log(`  Variante selezionata (unica): ${Date.now() - t0}ms`);
  } else {
    let found = false;
    for (let i = 0; i < Math.min(count, 10); i++) {
      const txt = await allRows.nth(i).textContent() ?? '';
      if (suffix && txt.includes(suffix)) {
        await allRows.nth(i).click();
        log(`  Variante selezionata (row ${i}, suffix ${suffix}): ${Date.now() - t0}ms`);
        found = true;
        break;
      }
    }
    if (!found) {
      log(`  ⚠️ Suffisso "${suffix}" non trovato, seleziono prima riga`);
      await allRows.first().click();
    }
  }

  await waitDXIdle(page, 'post-variant', 5000);
}

/** Imposta quantità */
async function setQuantity(page: Page, qty: number): Promise<void> {
  const t0 = Date.now();
  const editRow = page.locator('tr[id*="editnew"]').first();

  // Il campo quantità in DevExpress potrebbe avere ID con QTY, Qty, LINEQTY ecc.
  const qtyInput = editRow.locator('input[id*="QTY" i], input[id*="Qty" i], input[id*="LINEQTY" i]').first();

  if (!await qtyInput.isVisible().catch(() => false)) {
    log('  Qty input non trovato — skip');
    return;
  }

  const current = parseInt(await qtyInput.inputValue(), 10);
  if (current === qty) { log(`  Qty già ${qty} — skip`); return; }

  await qtyInput.click({ clickCount: 3 });
  await qtyInput.fill(qty.toString());
  await page.keyboard.press('Tab');
  await waitDXIdle(page, 'post-qty', 5000);
  log(`  Qty ${current}→${qty}: ${Date.now() - t0}ms`);
}

/** Imposta sconto con retry */
async function setDiscount(page: Page, pct: number): Promise<void> {
  const t0 = Date.now();
  const editRow = page.locator('tr[id*="editnew"]').first();
  const discInput = editRow.locator(
    'input[id*="MANUALDISCOUNT" i], input[id*="LineDisc" i], input[id*="Discount" i], input[id*="DISCPCT" i]'
  ).first();

  if (!await discInput.isVisible().catch(() => false)) {
    log('  Discount input non trovato — skip');
    return;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      await waitDXIdle(page, `disc-retry-${attempt}`, 5000);
      await page.waitForTimeout(2000); // extra settle per ERP callback
    }

    await discInput.click({ clickCount: 2 });
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.evaluate((val: string) => document.execCommand('insertText', false, val), pct.toString());
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    const raw = await discInput.inputValue();
    const num = parseFloat(raw.replace(/[^0-9.,]/g, '').replace(',', '.'));
    if (Math.abs(num - pct) < 0.5) {
      log(`  Discount ${pct}% [attempt ${attempt}]: ${Date.now() - t0}ms`);
      return;
    }
    log(`  ⚠️ Discount attempt ${attempt} failed: letto "${raw}"`);
  }
  log('  ❌ Discount NOT set dopo 3 tentativi');
}

/** Salva riga con UpdateEdit e monitora IsEditing */
async function saveRow(page: Page, gridName: string, articleNum: number): Promise<boolean> {
  const t0 = Date.now();

  const updateBtn = page.locator('a[data-args*="UpdateEdit"]').filter({ has: page.locator(':visible') }).first();
  await updateBtn.click();
  log(`  UpdateEdit cliccato: ${Date.now() - t0}ms`);

  // Monitora IsEditing ogni 1s con log
  const MAX_WAIT = 90_000;
  const POLL = 1000;
  const start = Date.now();
  let prev = true;

  while (Date.now() - start < MAX_WAIT) {
    await page.waitForTimeout(POLL);
    const editing = await isEditing(page, gridName);
    const elapsed = Date.now() - start;

    if (editing !== prev) {
      log(`  IsEditing changed → ${editing} at ${elapsed}ms`);
      prev = editing;
    }

    if (!editing) {
      log(`  ✅ Grid uscita da edit mode: ${elapsed}ms`);
      return true;
    }

    if (elapsed > 30_000 && elapsed % 10_000 < POLL) {
      log(`  ⏳ IsEditing ancora true (${Math.round(elapsed / 1000)}s) — articolo ${articleNum}`);
    }
  }

  log(`  ⚠️ IsEditing STUCK dopo ${MAX_WAIT / 1000}s — articolo ${articleNum}`);
  return false;
}

/** Recovery: reload della pagina e verifica righe */
async function reloadAndResume(page: Page, articleNum: number): Promise<{ rowCount: number; gridName: string }> {
  log(`\n🔄 RELOAD & RESUME — articolo ${articleNum}`);
  log('  Ricarico la pagina (stesso URL mode=Edit)...');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitDXIdle(page, 'post-reload', 30_000);

  const gn = await discoverGrid(page);
  if (!gn) throw new Error('Grid SALESLINES non trovata dopo reload!');

  const rowCount = await getRowCount(page, gn);
  log(`  Righe nel grid dopo reload: ${rowCount}`);
  log(`  Articolo ${articleNum} era: ${rowCount >= articleNum ? '✅ SALVATO' : '❌ NON SALVATO (verrà re-inserito)'}`);

  return { rowCount, gridName: gn };
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('=== TEST E2E — Ordine Fresis (30 articoli) ===');
  log(`ERP: ${ERP} | Cliente: ${CUSTOMER_ID}`);

  const browser = await chromium.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    slowMo: 50,
  });

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') log(`  [console.error] ${msg.text()}`);
  });

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  log('\n=== LOGIN ===');
  await page.goto(`${ERP}/Login.aspx`, { waitUntil: 'networkidle', timeout: 30_000 });

  await page.locator('input[id*="UserName" i], input[name*="UserName" i]').fill(USER);
  await page.locator('input[id*="Password" i], input[name*="Password" i]').fill(PASS);
  await page.locator('input[type="submit"], a[id*="Login" i], input[id*="Login" i]').click();
  await waitDXIdle(page, 'post-login', 15_000);
  log('✅ Login completato');

  // ── NUOVO ORDINE ───────────────────────────────────────────────────────────
  log('\n=== NUOVO ORDINE ===');
  await page.goto(`${ERP}/SALESTABLE_DetailViewAgent/New/mode=Edit`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await waitDXIdle(page, 'new-order', 30_000);
  log('✅ Pagina nuovo ordine caricata');

  // ── CLIENTE ────────────────────────────────────────────────────────────────
  const custInput = page.locator('input[id*="CUSTACCOUNT" i], input[id*="CustAccount" i]').first();
  await custInput.fill('');
  await custInput.type(CUSTOMER_ID, { delay: 50 });
  await page.keyboard.press('Tab');
  await waitDXIdle(page, 'customer', 10_000);
  log(`✅ Cliente impostato: ${CUSTOMER_ID}`);

  // ── SCOPRI GRIGLIA ─────────────────────────────────────────────────────────
  let gridName = await discoverGrid(page);
  if (!gridName) {
    await pause('Griglia SALESLINES non trovata. Verifica in browser e premi INVIO');
    gridName = await discoverGrid(page);
    if (!gridName) throw new Error('Griglia SALESLINES non trovata!');
  }
  log(`✅ Griglia scoperta: ${gridName}`);

  // ── INSERIMENTO ARTICOLI ───────────────────────────────────────────────────
  log(`\n${'═'.repeat(70)}\nINSERIMENTO 30 ARTICOLI\n${'═'.repeat(70)}`);

  let currentGridName = gridName;

  for (let idx = 0; idx < ARTICLES.length; idx++) {
    const art = ARTICLES[idx];
    const num = idx + 1;

    // ── Pausa prima dell'articolo critico ──────────────────────────────────
    if (num === 16) {
      const rows = await getRowCount(page, currentGridName);
      log(`\n${'⚡'.repeat(20)}`);
      log(`ARTICOLO 16 — 8959KR.314.018 (IL PROBLEMATICO)`);
      log(`Righe attualmente nel grid: ${rows}/30`);
      log(`URL corrente: ${page.url()}`);
      log(`IsEditing: ${await isEditing(page, currentGridName)}`);
      log(`${'⚡'.repeat(20)}\n`);
      await pause('Osserva lo stato ERP. Premi INVIO per inserire articolo 16');
    }

    log(`\n${'─'.repeat(60)}`);
    log(`ARTICOLO ${num}/30: ${art.code} | qty:${art.qty} | disc:${art.discount}% | variantId:${art.variantId}`);

    const t0 = Date.now();
    let saved = false;

    try {
      await clickAddNew(page);
      await typeAndSelectVariant(page, art.code, art.variantId);
      await setQuantity(page, art.qty);
      await setDiscount(page, art.discount);

      saved = await saveRow(page, currentGridName, num);

      if (!saved) {
        // ── GESTIONE STUCK ───────────────────────────────────────────────
        log(`\n⚠️  Articolo ${num} stuck! Avvio reload-and-resume...`);
        await pause(`Articolo ${num} STUCK. Osserva ERP. Premi INVIO per reload`);

        const { rowCount, gridName: newGrid } = await reloadAndResume(page, num);
        currentGridName = newGrid;

        if (rowCount < num) {
          log(`\nRe-inserisco articolo ${num} (non era stato salvato)...`);
          await clickAddNew(page);
          await typeAndSelectVariant(page, art.code, art.variantId);
          await setQuantity(page, art.qty);
          await setDiscount(page, art.discount);
          saved = await saveRow(page, currentGridName, num);
          if (!saved) {
            await pause(`Articolo ${num} ancora stuck dopo reload. Intervento manuale. Premi INVIO quando ok`);
            currentGridName = await discoverGrid(page) ?? currentGridName;
          }
        } else {
          log(`✅ Articolo ${num} era già salvato. Continuo dal ${rowCount + 1}.`);
          saved = true;
        }
      }
    } catch (err) {
      log(`❌ ERRORE articolo ${num}: ${err}`);
      await pause(`Errore! Intervento manuale richiesto. Premi INVIO per continuare`);
      currentGridName = await discoverGrid(page) ?? currentGridName;
    }

    const total = Date.now() - t0;
    log(`${saved ? '✅' : '⚠️ '} Articolo ${num} terminato in ${total}ms`);

    if (num === 16) {
      const rows = await getRowCount(page, currentGridName);
      log(`\n🎯 POST ART.16: ${rows} righe nel grid`);
      await pause('Articolo 16 completato! Verifica ERP. Premi INVIO per continuare');
    }
  }

  // ── SALVA ORDINE ──────────────────────────────────────────────────────────
  log(`\n${'═'.repeat(70)}\nSALVATAGGIO ORDINE\n${'═'.repeat(70)}`);
  await pause('Tutti gli articoli inseriti. Premi INVIO per SALVARE l\'ordine');

  const saveBtn = page.locator(
    'a[id*="Save" i]:visible, input[id*="Save" i]:visible, a:has-text("Salva"):visible, a:has-text("Save"):visible'
  ).first();

  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
    await waitDXIdle(page, 'post-save', 30_000);
    log(`✅ Ordine salvato! URL: ${page.url()}`);
  } else {
    log('⚠️ Bottone Salva non trovato. Salva manualmente nel browser.');
    await pause('Salva manualmente e premi INVIO');
  }

  log('\n🎉 TEST COMPLETATO!');
  await pause('Premi INVIO per chiudere il browser');
  await browser.close();
}

main().catch(err => {
  console.error('\n❌ ERRORE FATALE:', err);
  process.exit(1);
});

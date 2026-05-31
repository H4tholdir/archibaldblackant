/**
 * Esplora il flow di download PDF fatture dalla tab "Fatture dei clienti"
 * nella DetailView cliente ERP.
 *
 * Esegui:
 *   ERP_USER=xxx ERP_PASS=yyy npx --prefix archibald-web-app/frontend tsx test-erp/inspect-invoice-pdf.ts
 *
 * Output: struttura DOM della tab fatture + click flow per download PDF
 */

import { chromium } from '@playwright/test';

const ERP = 'https://4.231.124.90/Archibald';
const USER = process.env.ERP_USER ?? '';
const PASS = process.env.ERP_PASS ?? '';
const CUSTOMER_ID = '55.261'; // Fresis

if (!USER || !PASS) {
  console.error('Imposta ERP_USER e ERP_PASS');
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({ headless: false, ignoreHTTPSErrors: true });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  await page.goto(`${ERP}/Login.aspx`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="text"]', USER);
  await page.fill('input[type="password"]', PASS);
  await page.click('text=Accedi');
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
  console.log('✓ Login OK');

  // ── NAVIGA ALLA DETAILVIEW CLIENTE ─────────────────────────────────────────
  const customerNum = CUSTOMER_ID.replace('.', '');
  await page.goto(
    `${ERP}/CUSTTABLE_DetailView/${customerNum}/?mode=View`,
    { waitUntil: 'networkidle', timeout: 30000 }
  );
  console.log('✓ DetailView cliente aperta');

  // ── TROVA E CLICCA TAB "Fatture dei clienti" ─────────────────────────────
  await page.waitForTimeout(2000);
  const tabs = await page.$$eval('[role="tab"], .dxpc-header, .aspxTCItem', els =>
    els.map(el => ({ text: el.textContent?.trim(), id: el.id, class: el.className }))
  );
  console.log('\n=== TAB disponibili ===');
  for (const t of tabs) {
    if (t.text) console.log(JSON.stringify(t));
  }

  // Prova a cliccare la tab fatture
  const invoiceTabSelectors = [
    'text=Fatture dei clienti',
    'text=Fatture',
    '[title*="fatture"]',
    '[title*="Fatture"]',
  ];
  for (const sel of invoiceTabSelectors) {
    const el = await page.$(sel);
    if (el) {
      await el.click();
      console.log(`\n✓ Cliccato tab con selettore: ${sel}`);
      break;
    }
  }
  await page.waitForTimeout(3000);

  // ── STRUTTURA GRIGLIA FATTURE ──────────────────────────────────────────────
  console.log('\n=== STRUTTURA GRIGLIA FATTURE ===');
  const gridInfo = await page.evaluate(() => {
    // Cerca griglie ASPxGridView
    const grids = document.querySelectorAll('[id*="grid"],[id*="Grid"],[id*="ASPx"]');
    const gridIds = Array.from(grids).map(g => ({ id: g.id, class: g.className.substring(0, 60) }));

    // Cerca checkbox nella pagina
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const cbInfo = Array.from(checkboxes).map(cb => ({
      id: cb.id, name: cb.name,
      parentId: cb.parentElement?.id,
      grandParentId: cb.parentElement?.parentElement?.id,
    }));

    // Cerca bottoni/link con "PDF", "Stampa", "Esporta", "Download"
    const downloadEls = Array.from(document.querySelectorAll('a,button,[role="button"]'))
      .filter(el => /pdf|print|stampa|esporta|download|scarica/i.test(el.textContent ?? '') ||
                    /pdf|print|stamp|export|download/i.test(el.id ?? ''))
      .map(el => ({
        tag: el.tagName,
        id: el.id,
        text: el.textContent?.trim().substring(0, 50),
        onclick: el.getAttribute('onclick')?.substring(0, 100),
        href: (el as HTMLAnchorElement).href?.substring(0, 100),
      }));

    return { gridIds: gridIds.slice(0, 20), checkboxes: cbInfo.slice(0, 10), downloadEls };
  });

  console.log('\nGrid IDs:', JSON.stringify(gridInfo.gridIds, null, 2));
  console.log('\nCheckboxes:', JSON.stringify(gridInfo.checkboxes, null, 2));
  console.log('\nDownload elements:', JSON.stringify(gridInfo.downloadEls, null, 2));

  // ── SCREENSHOT STATO CORRENTE ──────────────────────────────────────────────
  await page.screenshot({ path: 'test-erp/invoice-tab.png', fullPage: false });
  console.log('\n✓ Screenshot salvato: test-erp/invoice-tab.png');

  // ── PROVA CLICK SU PRIMO CHECKBOX ─────────────────────────────────────────
  console.log('\n--- Tentativo selezione prima riga ---');
  const firstCheckbox = await page.$('input[type="checkbox"]:not([disabled])');
  if (firstCheckbox) {
    await firstCheckbox.click();
    await page.waitForTimeout(1500);
    console.log('✓ Prima checkbox cliccata');

    // Cerca nuovi elementi apparse (download link?)
    const afterClick = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a,button,[role="button"]'))
        .filter(el => /pdf|print|stampa|esporta|download|scarica/i.test(el.textContent ?? '') ||
                      /pdf|print|stamp|export|download/i.test(el.id ?? ''))
        .map(el => ({
          tag: el.tagName, id: el.id,
          text: el.textContent?.trim().substring(0, 80),
          visible: (el as HTMLElement).offsetParent !== null,
          onclick: el.getAttribute('onclick')?.substring(0, 120),
          href: (el as HTMLAnchorElement).href?.substring(0, 120),
        }));
    });
    console.log('\nElementi dopo click checkbox:', JSON.stringify(afterClick, null, 2));
    await page.screenshot({ path: 'test-erp/invoice-tab-checked.png' });
    console.log('✓ Screenshot con checkbox: test-erp/invoice-tab-checked.png');
  } else {
    console.log('Nessuna checkbox trovata nella pagina');
  }

  console.log('\n⏸ Pausa 10s — osserva il browser...');
  await page.waitForTimeout(10000);
  await browser.close();
}

main().catch(console.error);

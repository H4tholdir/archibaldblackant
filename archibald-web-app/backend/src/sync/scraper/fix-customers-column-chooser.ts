import type { Page } from 'puppeteer';
import { logger } from '../../logger';

// Colonne ERP CUSTTABLE nel custwindow sub-panel — post-update Germania 2026-05-10.
// EXCLUSIV* (C7-C11) + MECHANOGRAPHICNUMBER (C19). Usano gvCOColumnShow (non gvCOColumnHide).
const CUSTTABLE_CUSTWINDOW_COL_INDICES = [7, 8, 9, 10, 11, 19];

async function fixCustomersColumnChooser(page: Page): Promise<void> {
  const cellCount = await page.evaluate(() => {
    const row = document.querySelector('tr.dxgvDataRow_XafTheme, tr[class*="dxgvDataRow"]');
    return row ? row.querySelectorAll('td').length : 0;
  });

  if (cellCount >= 34) {
    logger.info('[syncCustomers] Column Chooser già applicato (%d celle), skip', cellCount);
    return;
  }

  logger.info('[syncCustomers] Applico Column Chooser custwindow (%d celle → 34)', cellCount);

  await page.evaluate(() => {
    const w = window as any;
    const gk = Object.keys(w).find(k => typeof w[k]?.ShowCustomizationDialog === 'function');
    if (gk) w[gk].ShowCustomizationDialog();
  });

  const dialogOpen = await page.waitForSelector('[id*="DXCDWindow"]', { timeout: 4000 })
    .then(() => true)
    .catch(() => false);

  if (!dialogOpen) {
    logger.warn('[syncCustomers] Column Chooser dialog non aperto, skip');
    return;
  }

  // Vai al tab Column Chooser (T3) — cerca per testo "Column Chooser" come fallback
  const tabClicked = await page.evaluate(() => {
    const byId = document.querySelector('[id$="DXCDWindow_DXCDPageControl_T3T"]') as HTMLElement | null;
    if (byId) { byId.click(); return 'id'; }
    const byText = Array.from(document.querySelectorAll('[id*="DXCDWindow"]'))
      .find(el => /column.?chooser/i.test(el.textContent ?? '')) as HTMLElement | undefined;
    if (byText) { byText.click(); return 'text'; }
    return null;
  });
  logger.info('[syncCustomers] Column Chooser tab clicked via: %s', tabClicked);
  await new Promise(r => setTimeout(r, 1200));

  // Strategia 1: cerca per classe gvCOColumnShow (eye icon - il modo che abbiamo certificato in Playwright)
  // Strategia 2: cerca per testo del campo (fallback robusto)
  const TARGET_LABELS = [
    'ESCLUSIVIT', 'FINE ESCLUSIVA', 'IN ANTEPRIMA',
    'PREVISIONI ESCLUSIVE', 'VENDITE IN ESCLUSIVA', 'MECCANOGRAFICO',
  ];

  const diagnostics = await page.evaluate((labels: string[]) => {
    // Diagnostica: cosa c'è nel FieldChooserPage?
    const fp = document.querySelector('[id*="FieldChooserPage"]');
    const allItems = Array.from(fp?.querySelectorAll('[class*="CustDialogColumnItem"]') ?? []);
    const withShow = allItems.filter(i => i.querySelector('[class*="gvCOColumnShow"]'));
    const withHide = allItems.filter(i => i.querySelector('[class*="gvCOColumnHide"]'));

    // Attiva le colonne target via gvCOColumnHide (nel FieldChooser standard: hidden = gvCOColumnHide)
    // O via gvCOColumnShow (nel custwindow: da attivare = gvCOColumnShow)
    let enabled = 0;
    for (const item of allItems) {
      const text = item.textContent?.toUpperCase() ?? '';
      if (!labels.some(l => text.includes(l))) continue;
      const eye = (item.querySelector('[class*="gvCOColumnShow"]') ??
                   item.querySelector('[class*="gvCOColumnHide"]')) as HTMLElement | null;
      if (eye) { eye.click(); enabled++; }
    }

    return {
      fpFound: !!fp,
      totalItems: allItems.length,
      withShow: withShow.length,
      withHide: withHide.length,
      enabled,
      itemTexts: allItems.slice(0, 8).map(i => i.textContent?.trim().substring(0, 30)),
    };
  }, TARGET_LABELS);

  logger.info('[syncCustomers] Column Chooser diagnostics: %o', diagnostics);

  const applied = await page.evaluate(() => {
    // Premi Apply — cerca con selettore più ampio
    const btn = (
      document.querySelector('[id$="DXCDWindow_DXCBtn201"]') ??
      document.querySelector('[id*="DXCDWindow"][id*="DXCBtn2"]')
    ) as HTMLElement | null;
    if (btn && !btn.className.includes('Disabled') && btn.offsetParent !== null) {
      btn.click(); return true;
    }
    return false;
  });

  logger.info('[syncCustomers] Column Chooser: enabled=%d, applied=%s', diagnostics.enabled, applied);
  if (applied) await new Promise(r => setTimeout(r, 2000));
}

export { fixCustomersColumnChooser };

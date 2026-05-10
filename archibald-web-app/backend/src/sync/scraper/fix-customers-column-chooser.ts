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

  await page.evaluate(() => {
    const tab = document.querySelector('[id$="DXCDWindow_DXCDPageControl_T3T"]') as HTMLElement | null;
    tab?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  let enabled = 0;
  for (const idx of CUSTTABLE_CUSTWINDOW_COL_INDICES) {
    const found = await page.evaluate((i: number) => {
      const w = window as any;
      const gridKey = Object.keys(w).find(k => typeof w[k]?.ShowCustomizationDialog === 'function');
      if (!gridKey) return false;
      const fp = document.getElementById(`${gridKey}_DXCDWindow_FieldChooserPage`);
      const item = document.getElementById(`${gridKey}_3_drag_C${i}`) || fp?.querySelector(`[id*="_3_drag_C${i}"]`);
      const eye = item?.querySelector('[class*="gvCOColumnShow"]') as HTMLElement | null;
      if (eye) { eye.click(); return true; }
      return false;
    }, idx);
    if (found) enabled++;
    await new Promise(r => setTimeout(r, 100));
  }

  const applied = await page.evaluate(() => {
    const btn = document.querySelector('[id$="DXCDWindow_DXCBtn201"]') as HTMLElement | null;
    if (btn && !btn.className.includes('Disabled')) { btn.click(); return true; }
    return false;
  });

  logger.info('[syncCustomers] Column Chooser: enabled=%d, applied=%s', enabled, applied);
  if (applied) await new Promise(r => setTimeout(r, 2000));
}

export { fixCustomersColumnChooser };

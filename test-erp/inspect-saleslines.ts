import { chromium } from '@playwright/test';
const ERP = 'https://4.231.124.90/Archibald';
const USER = 'ikiA0930', PASS = 'Fresis26@';

async function main() {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--ignore-certificate-errors', '--ignore-ssl-errors', '--disable-web-security'] });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  // Login
  await page.goto(`${ERP}/Login.aspx`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="text"][id$="_I"]').first().fill(USER);
  await page.locator('input[type="password"][id$="_I"]').first().fill(PASS);
  await page.locator('a:has-text("Accedi")').first().click();
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Vai lista ordini e click Nuovo
  await page.goto(`${ERP}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.locator('a.dxm-content:has-text("Nuovo")').first().click();
  await page.waitForFunction((old: string) => window.location.href !== old && window.location.href.includes('SALESTABLE_DetailViewAgent'), { timeout: 15000, polling: 300 }, page.url()).catch(() => {});
  await page.waitForTimeout(5000);

  console.log('URL:', page.url());

  // Dump tutto il contenuto del container SALESLINEs
  const salesLinesInfo = await page.evaluate(() => {
    const w = window as Record<string, unknown>;
    // Find SALESLINEs grid
    const col = (w['ASPxClientControl'] as { GetControlCollection?: () => { ForEachControl?: (fn: (c: Record<string, unknown>) => void) => void } } | undefined)?.GetControlCollection?.();
    let gridInfo: Record<string, unknown> = {};
    col?.ForEachControl?.((c) => {
      const nm = (c as { name?: string })?.name ?? '';
      if (nm.includes('dviSALESLINEs') && typeof (c as { AddNewRow?: unknown }).AddNewRow === 'function') {
        const g = c as Record<string, unknown>;
        gridInfo = {
          name: nm,
          hasAddNewRow: typeof g.AddNewRow === 'function',
          rowCount: typeof g.GetRowCount === 'function' ? (g.GetRowCount as () => number)() : 'N/A',
          isEditing: typeof g.IsEditing === 'function' ? (g.IsEditing as () => boolean)() : 'N/A',
          inCallback: typeof g.InCallback === 'function' ? (g.InCallback as () => boolean)() : 'N/A',
        };
      }
    });
    return gridInfo;
  });
  console.log('SALESLINEs grid:', JSON.stringify(salesLinesInfo, null, 2));

  // Check for AddNew buttons
  const addNewBtns = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('[data-args*="AddNew"], [data-args*="addnew"]'));
    return btns.map(b => ({ id: b.id, cls: b.className.toString().substring(0, 40), visible: (b as HTMLElement).offsetParent !== null }));
  });
  console.log('AddNew buttons:', JSON.stringify(addNewBtns));

  // Check SALESLINEs HTML container
  const container = await page.evaluate(() => {
    const el = document.querySelector('[id*="dviSALESLINEs"]');
    if (!el) return 'NOT FOUND';
    return {
      id: el.id.substring(0, 80),
      visible: (el as HTMLElement).offsetParent !== null,
      innerHTML: el.innerHTML.substring(0, 500),
    };
  });
  console.log('SALESLINEs container:', JSON.stringify(container, null, 2));

  await browser.close();
}
main().catch(console.error);

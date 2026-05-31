import { chromium } from '@playwright/test';
const ERP = 'https://4.231.124.90/Archibald';
const USER = 'ikiA0930', PASS = 'Fresis26@';

async function main() {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--ignore-certificate-errors', '--ignore-ssl-errors', '--disable-web-security'] });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  await page.goto(`${ERP}/Login.aspx`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="text"][id$="_I"]').first().fill(USER);
  await page.locator('input[type="password"][id$="_I"]').first().fill(PASS);
  await page.locator('a:has-text("Accedi")').first().click();
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  await page.goto(`${ERP}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.locator('a.dxm-content:has-text("Nuovo")').first().click();
  await page.waitForFunction((old: string) => window.location.href !== old && window.location.href.includes('SALESTABLE_DetailViewAgent'), { timeout: 15000, polling: 300 }, page.url()).catch(() => {});
  await page.waitForTimeout(5000); // aspetta caricamento completo

  console.log('URL:', page.url());

  // Dump tutti i controlli DevExpress
  const controls = await page.evaluate(() => {
    const w = window as Record<string, unknown>;
    const col = (w['ASPxClientControl'] as { GetControlCollection?: () => { GetCount?: () => number; Get?: (i: number) => { name?: string; constructor?: { name?: string } } } } | undefined)?.GetControlCollection?.();
    if (!col) return [];
    const n = col.GetCount?.() ?? 0;
    const result = [];
    for (let i = 0; i < n; i++) {
      const ctrl = col.Get?.(i);
      result.push({ name: ctrl?.name, type: ctrl?.constructor?.name ?? 'unknown' });
    }
    return result;
  });
  console.log('DevExpress controls:', controls.length);
  for (const c of controls) console.log(' ', JSON.stringify(c));

  // Dump visible inputs
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input:not([type="hidden"])'))
      .filter(el => (el as HTMLElement).offsetParent !== null)
      .map(el => ({ type: (el as HTMLInputElement).type, id: el.id.substring(0, 60), val: (el as HTMLInputElement).value.substring(0, 20) }))
  );
  console.log('Visible inputs:', inputs.length);
  for (const i of inputs.slice(0, 15)) console.log(' ', JSON.stringify(i));

  // Dump visible buttons/links
  const btns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a, button'))
      .filter(el => (el as HTMLElement).offsetParent !== null && el.textContent?.trim())
      .map(el => ({ tag: el.tagName, id: el.id.substring(0, 40), text: el.textContent?.trim().substring(0, 30) }))
      .slice(0, 15)
  );
  console.log('Visible buttons:');
  for (const b of btns) console.log(' ', JSON.stringify(b));

  await browser.close();
}
main().catch(console.error);

import { chromium } from '@playwright/test';
const ERP = 'https://4.231.124.90/Archibald';
const USER = 'ikiA0930', PASS = 'Fresis26@';

async function main() {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  // Login
  await page.goto(`${ERP}/Login.aspx`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="text"][id$="_I"]').first().fill(USER);
  await page.locator('input[type="password"][id$="_I"]').first().fill(PASS);
  await page.locator('a:has-text("Accedi")').first().click();
  await page.waitForURL(u => !u.includes('Login.aspx'), { timeout: 10000 }).catch(() => {});
  await page.goto(`${ERP}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('Main URL:', page.url());

  // Prova a navigare a SALESTABLE
  console.log('\n=== Tentativo SALESTABLE New ===');
  try {
    await page.goto(`${ERP}/SALESTABLE_DetailViewAgent/New/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    console.log('URL dopo goto New/:', page.url());

    // Dump tutti gli input visibili
    const inputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input:not([type="hidden"])'))
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .map(el => ({ type: (el as HTMLInputElement).type, id: el.id.substring(0, 60), value: (el as HTMLInputElement).value.substring(0, 20) }))
    );
    console.log('Inputs visibili:', inputs.length);
    for (const i of inputs.slice(0, 10)) console.log(' ', JSON.stringify(i));

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a:visible, a'))
        .filter(a => (a as HTMLElement).offsetParent !== null && a.textContent?.trim())
        .slice(0, 15)
        .map(a => ({ id: a.id.substring(0, 40), text: a.textContent?.trim().substring(0, 30) }))
    );
    console.log('Link visibili:');
    for (const l of links) console.log(' ', JSON.stringify(l));
  } catch (err) {
    console.log('ERRORE goto SALESTABLE New:', err);
  }

  // Prova URL alternativa
  try {
    await page.goto(`${ERP}/SALESTABLE_DetailViewAgent/New/?mode=Edit`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    console.log('\nURL ?mode=Edit:', page.url());
  } catch (err) {
    console.log('ERRORE ?mode=Edit:', err);
  }

  await browser.close();
}
main().catch(console.error);

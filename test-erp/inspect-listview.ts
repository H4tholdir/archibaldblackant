import { chromium } from '@playwright/test';
const ERP = 'https://4.231.124.90/Archibald';
const USER = 'ikiA0930', PASS = 'Fresis26@';

async function main() {
  const browser = await chromium.launch({
    headless: true, ignoreHTTPSErrors: true,
    args: ['--ignore-certificate-errors', '--ignore-ssl-errors', '--disable-web-security'],
  });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  // Login
  await page.goto(`${ERP}/Login.aspx`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="text"][id$="_I"]').first().fill(USER);
  await page.locator('input[type="password"][id$="_I"]').first().fill(PASS);
  await page.locator('a:has-text("Accedi")').first().click();
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('Post-login:', page.url());

  // Vai alla lista ordini
  try {
    await page.goto(`${ERP}/SALESTABLE_ListView_Agent/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) { console.log('goto err:', e); }
  await page.waitForTimeout(3000);
  console.log('ListView URL:', page.url());

  // Dump elementi visibili con "Nuovo" o "New"
  const elements = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'))
      .filter(el => (el as HTMLElement).offsetParent !== null)
      .filter(el => /nuovo|new/i.test(el.textContent?.trim() ?? ''))
      .filter(el => el.children.length <= 2) // foglie quasi-leaf
      .slice(0, 15)
      .map(el => ({
        tag: el.tagName, id: el.id.substring(0, 50),
        text: el.textContent?.trim().substring(0, 20),
        cls: el.className.toString().substring(0, 40),
        href: el.getAttribute('href')?.substring(0, 40),
        dataArgs: el.getAttribute('data-args')?.substring(0, 40),
      }));
    return all;
  });
  console.log('Elementi "Nuovo/New":');
  for (const e of elements) console.log(JSON.stringify(e));

  // Prova anche a prendere screenshot base64 di un'area
  const title = await page.title();
  console.log('Page title:', title);

  await browser.close();
}
main().catch(console.error);

import { chromium } from '@playwright/test';
const ERP = 'https://4.231.124.90/Archibald';
const USER = 'ikiA0930';
const PASS = 'Fresis26@';

async function main() {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  // Login
  await page.goto(`${ERP}/Login.aspx`, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Pre-login URL:', page.url());

  const userInput = await page.locator('input[type="text"][id$="_I"]').first();
  const passInput = await page.locator('input[type="password"][id$="_I"]').first();
  await userInput.fill(USER);
  await passInput.fill(PASS);

  // Get the submit button
  const submitBtn = await page.locator('a:has-text("Accedi"), a:has-text("Login"), input[type="submit"]').first();
  const btnId = await submitBtn.getAttribute('id');
  const btnOnclick = await submitBtn.getAttribute('onclick');
  console.log('Button id:', btnId, 'onclick:', btnOnclick);

  await submitBtn.click();

  // Wait a bit for navigation
  await page.waitForTimeout(3000);
  console.log('Post-click URL (3s):', page.url());

  await page.waitForTimeout(5000);
  console.log('Post-click URL (8s):', page.url());

  // If still on login page, check for errors
  if (page.url().includes('Login')) {
    const errors = await page.locator('.dxeErrorCell, [class*="error"], [class*="Error"]').allTextContents();
    console.log('Login errors:', errors);
  } else {
    console.log('✅ Login successful!');
    // Show main page links
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a:not([id*="Logo"])'))
        .filter(a => (a as HTMLElement).offsetParent !== null)
        .slice(0, 20)
        .map(a => ({ id: a.id, text: a.textContent?.trim().substring(0, 40), href: a.getAttribute('href')?.substring(0, 60) }))
    );
    console.log('Main page links:');
    for (const l of links) console.log(' ', JSON.stringify(l));
  }

  await browser.close();
}
main().catch(console.error);

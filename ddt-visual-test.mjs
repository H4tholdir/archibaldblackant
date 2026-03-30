import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: false,
  args: ['--ignore-certificate-errors'],
  slowMo: 500, // più lento per vedere ogni azione
});

const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

// Login
console.log('Login...');
await page.goto('https://4.231.124.90/Archibald/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.evaluate(({ u, p }) => {
  const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
  const ui = inputs.find(i => i.name?.includes('UserName')) || inputs[0];
  const pi = document.querySelector('input[type="password"]');
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  ui.focus(); s.call(ui, u); ui.dispatchEvent(new Event('input', { bubbles: true })); ui.dispatchEvent(new Event('change', { bubbles: true }));
  pi.focus(); s.call(pi, p); pi.dispatchEvent(new Event('input', { bubbles: true })); pi.dispatchEvent(new Event('change', { bubbles: true }));
  const b = Array.from(document.querySelectorAll('button,input[type="submit"],a,div[role="button"]'));
  (b.find(x => (x.textContent || '').toLowerCase().trim() === 'log in') ||
   b.find(x => (x.textContent || '').toLowerCase().includes('accedi')) ||
   b.find(x => { const id = (x.id || '').toLowerCase(); return !id.includes('logo') && (id.includes('logon') || id.includes('login')); }))?.click();
}, { u: 'ikiA0930', p: 'Fresis26@' });
await page.waitForFunction(() => !window.location.href.includes('Login.aspx'), { timeout: 30000 });
console.log('Logged in');

// Navigate to DDT
console.log('Navigating to DDT...');
await page.goto('https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

const checkData = async (label) => {
  const r = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
    let withData = 0;
    let sample = '';
    for (const row of rows) {
      const texts = Array.from(row.querySelectorAll('td')).map(c => (c.textContent || '').trim()).filter(t => t && t !== 'N/A' && !t.startsWith('<!--') && t.length > 1);
      if (texts.length > 2) { withData++; if (!sample) sample = texts.slice(0, 4).join(' | '); }
    }
    return { rows: rows.length, withData, sample };
  });
  console.log(`[${label}] rows=${r.rows} withData=${r.withData} sample="${r.sample}"`);
  return r;
};

await checkData('INITIAL');

// Use the EXACT filter input selector from the Bibbia
// DDT filter combo: Vertical$mainMenu$Menu$ITCNT4$xaf_a2$Cb
const filterSelector = 'input[name="Vertical$mainMenu$Menu$ITCNT4$xaf_a2$Cb"]';

// Step 1: Click the filter input to open the dropdown
console.log('\n>>> Step 1: Click filter input to open dropdown...');
await page.click(filterSelector);
await page.waitForTimeout(2000);

// Take screenshot to see what dropdown looks like
await page.screenshot({ path: '/tmp/ddt-dropdown-open.png' });
console.log('Screenshot saved: /tmp/ddt-dropdown-open.png');

// Step 2: Find and click "Oggi" — use locator for visible text
console.log('>>> Step 2: Click "Oggi"...');
// The dropdown creates a listbox — find it by looking for the DDD$L element
const listboxSelector = '[id*="ITCNT4"][id*="xaf_a2"][id*="Cb_DDD_L"] td';
const oggiItem = page.locator(listboxSelector, { hasText: /^Oggi$|^Today$/ }).first();
const oggiVisible = await oggiItem.isVisible().catch(() => false);
console.log('Oggi item visible?', oggiVisible);

if (oggiVisible) {
  await oggiItem.click();
} else {
  // Fallback: try clicking by text anywhere in the page
  console.log('Trying text locator fallback...');
  await page.locator('text=/^Oggi$/').first().click().catch(() =>
    page.locator('text=/^Today$/').first().click()
  ).catch(() => console.log('Could not click Oggi/Today'));
}

console.log('>>> Waiting for callback (8s)...');
await page.waitForTimeout(8000);
await checkData('AFTER OGGI');

// Step 3: Click dropdown again
console.log('\n>>> Step 3: Click filter dropdown again...');
await page.click(filterSelector);
await page.waitForTimeout(2000);

// Step 4: Click "Tutti" / "All"
console.log('>>> Step 4: Click "Tutti"...');
const tuttiItem = page.locator(listboxSelector, { hasText: /^Tutti$|^All$/ }).first();
const tuttiVisible = await tuttiItem.isVisible().catch(() => false);
console.log('Tutti item visible?', tuttiVisible);

if (tuttiVisible) {
  await tuttiItem.click();
} else {
  console.log('Trying text locator fallback...');
  await page.locator('text=/^Tutti$/').first().click().catch(() =>
    page.locator('text=/^All$/').first().click()
  ).catch(() => console.log('Could not click Tutti/All'));
}

console.log('>>> Waiting for callback (8s)...');
await page.waitForTimeout(8000);
const final = await checkData('AFTER TUTTI');

if (final.withData > 0) {
  console.log('\n✅ SUCCESS! Data appeared!');
} else {
  console.log('\n❌ Still no data');
}

console.log('\n🔍 Browser stays open 120s — you can interact manually!');
await page.waitForTimeout(120000);
await browser.close();

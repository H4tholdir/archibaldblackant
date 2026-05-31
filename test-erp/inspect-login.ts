import { chromium } from '@playwright/test';
const ERP = 'https://4.231.124.90/Archibald';

async function main() {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  await page.goto(`${ERP}/Login.aspx`, { waitUntil: 'networkidle', timeout: 30000 });

  // Dump tutti gli input e button visibili
  const elements = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input')).map(el => ({
      type: el.type, id: el.id, name: el.name, value: el.value.substring(0, 30), visible: el.offsetParent !== null
    }));
    const links = Array.from(document.querySelectorAll('a, button')).filter(el => (el as HTMLElement).offsetParent !== null).map(el => ({
      tag: el.tagName, id: el.id, text: el.textContent?.trim().substring(0, 30), onclick: el.getAttribute('onclick')?.substring(0, 60)
    }));
    return { inputs, links };
  });

  console.log('=== INPUTS ===');
  for (const i of elements.inputs) console.log(JSON.stringify(i));
  console.log('\n=== VISIBLE LINKS/BUTTONS ===');
  for (const l of elements.links) console.log(JSON.stringify(l));

  await browser.close();
}
main().catch(console.error);

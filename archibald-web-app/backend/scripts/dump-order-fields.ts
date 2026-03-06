/**
 * Dump all DevExpress input controls on the order detail page.
 * Usage: npx tsx scripts/dump-order-fields.ts <orderUrl>
 *
 * Example: npx tsx scripts/dump-order-fields.ts "https://4.231.124.90/Archibald/SALESTABLE_DetailViewAgent/49649/?mode=Edit"
 */
import puppeteer from 'puppeteer';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: npx tsx scripts/dump-order-fields.ts <orderUrl>');
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: false, args: ['--ignore-certificate-errors'] });
  const page = await browser.newPage();

  console.log('Navigate to the order page and login manually, then press Enter...');
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});

  // Wait for user to login
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  await new Promise(r => setTimeout(r, 2000));

  const fields = await page.evaluate(() => {
    const results: Array<{
      tag: string;
      id: string;
      type: string;
      value: string;
      label: string;
      rect: string;
    }> = [];

    const elements = document.querySelectorAll('input, textarea, select, [class*="dxeEditArea"]');
    elements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.offsetParent === null) return;

      const rect = htmlEl.getBoundingClientRect();
      let label = '';
      const parentTd = htmlEl.closest('td');
      if (parentTd) {
        const prevTd = parentTd.previousElementSibling;
        if (prevTd) label = prevTd.textContent?.trim().substring(0, 60) || '';
      }

      results.push({
        tag: el.tagName.toLowerCase(),
        id: htmlEl.id || '',
        type: (el as HTMLInputElement).type || '',
        value: (el as HTMLInputElement).value?.substring(0, 30) || '',
        label,
        rect: `(${Math.round(rect.x)},${Math.round(rect.y)})`,
      });
    });
    return results;
  });

  console.log(`\n=== Found ${fields.length} fields ===\n`);
  const sorted = fields.sort((a, b) => {
    const ay = parseInt(a.rect.split(',')[1]) || 0;
    const by = parseInt(b.rect.split(',')[1]) || 0;
    return ay - by;
  });

  for (const f of sorted) {
    console.log(`[${f.tag}:${f.type}] id="${f.id}" value="${f.value}" label="${f.label}" pos=${f.rect}`);
  }

  // Search for target fields
  console.log('\n=== Target fields ===\n');
  const targets = await page.evaluate(() => {
    const found: string[] = [];
    const keywords = ['DESCRIZIONE', 'TESTO ORDINE'];
    document.querySelectorAll('td, span, label').forEach((el) => {
      const text = el.textContent?.trim() || '';
      if (text.length > 80) return;
      for (const kw of keywords) {
        if (text.toUpperCase().includes(kw)) {
          const row = el.closest('tr');
          const input = row?.querySelector('input, textarea');
          found.push(`"${text}" => input id="${input ? (input as HTMLElement).id : 'none'}"`);
          break;
        }
      }
    });
    return found;
  });

  for (const t of targets) console.log(t);

  await browser.close();
}

main().catch(console.error);

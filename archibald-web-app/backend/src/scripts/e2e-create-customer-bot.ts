// e2e-create-customer-bot.ts
// E2E test: usa ArchibaldBot.completeCustomerCreation() reale
// Usage: npx tsx src/scripts/e2e-create-customer-bot.ts
import puppeteer from 'puppeteer';
import { ArchibaldBot } from '../bot/archibald-bot.js';
import type { CustomerFormData } from '../types.js';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';

const CUSTOMER: CustomerFormData = {
  name: 'ELBA DENTAL SRL',
  vatNumber: '05437461212',
  fiscalCode: '05437461212',
  pec: 'elbadentalsrl@pec.it',
  sdi: 'DUDU0GE',
  street: 'VIA RAIOLA N 56',
  postalCode: '80053',
  phone: '+390818018960',
  mobile: '+390818018960',
  url: 'nd.it',
};

async function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function login(page: import('puppeteer').Page): Promise<void> {
  await page.goto(`${ERP_URL}/Default.aspx`, { waitUntil: 'networkidle2', timeout: 60000 });
  const userInput = await page.$('input[id*="USER"], input[type="text"]');
  if (!userInput) {
    console.log('[E2E] Already logged in');
    return;
  }
  await userInput.click();
  await userInput.type(USERNAME, { delay: 50 });
  const passInput = await page.$('input[type="password"]');
  if (passInput) {
    await passInput.click();
    await passInput.type(PASSWORD, { delay: 50 });
  }
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('[E2E] Login OK —', page.url());
}

async function navigateToNewCustomerForm(page: import('puppeteer').Page): Promise<void> {
  await page.goto(`${ERP_URL}/CUSTTABLE_ListView_Agent/`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await wait(1000);

  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a,span,button')).find(
      el =>
        /^(Nuovo|New)$/i.test((el.textContent ?? '').trim()) &&
        (el as HTMLElement).offsetParent,
    );
    if (btn) {
      (btn as HTMLElement).click();
      return true;
    }
    return false;
  });

  if (!clicked) throw new Error('"Nuovo" button not found');

  await page.waitForFunction(
    () => window.location.href.includes('CUSTTABLE_DetailView'),
    { timeout: 15000, polling: 200 },
  );
  await wait(1000);
  console.log('[E2E] Form nuovo cliente pronto —', page.url());
}

async function manualSearchErpId(page: import('puppeteer').Page, name: string): Promise<string> {
  await page.goto(`${ERP_URL}/CUSTTABLE_ListView_Agent/`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await wait(2000);

  // GotoPage(0) before reading — ERP page index persists between navigations (Bibbia ERP rule 1)
  await page.evaluate(() => {
    (window as any).ASPx?.GotoPage?.(document.querySelector('[id*="grid"]')?.id ?? '', 0);
  }).catch(() => {});
  await wait(1000);

  const nameLower = name.trim().toLowerCase();

  const profileId = await page.evaluate((targetName: string) => {
    const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]')).filter(
      r => (r as HTMLElement).offsetParent !== null,
    );

    for (const row of rows) {
      const cellTexts = Array.from(row.querySelectorAll('td')).map(c => {
        const clone = c.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('script, style').forEach(s => s.remove());
        return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      });

      if (!cellTexts.some(t => t === targetName || t.includes(targetName))) continue;

      const editLink = row.querySelector('a[href*="DetailView"], a[data-args*="Edit"]') as HTMLAnchorElement | null;
      if (editLink?.href) {
        const match = editLink.href.match(/DetailView[^/]*\/([^/?#]+)\//);
        if (match?.[1]) return match[1];
      }
    }
    return '';
  }, nameLower);

  return profileId ?? '';
}

(async () => {
  console.log('=== E2E CREATE CUSTOMER — completeCustomerCreation() ===\n');
  console.log('[E2E] Cliente da creare:', JSON.stringify(CUSTOMER, null, 2));
  console.log('');

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 30,
    args: [
      '--ignore-certificate-errors',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  const bot = new ArchibaldBot('e2e-test-user');
  bot.page = page;

  bot.setProgressCallback(async (category, meta) => {
    console.log(`[BOT] ${category}`, meta ? JSON.stringify(meta) : '');
  });

  try {
    await login(page);
    await navigateToNewCustomerForm(page);

    console.log('\n[E2E] Chiamata completeCustomerCreation()...');
    const startMs = Date.now();

    const realErpId = await bot.completeCustomerCreation(CUSTOMER, false);

    const elapsed = Date.now() - startMs;
    console.log(`\n[E2E] completeCustomerCreation completato in ${elapsed}ms`);
    console.log(`[E2E] ERP ID restituito: ${realErpId}`);

    let resolvedErpId = realErpId;

    // If ERP ID extraction failed during creation, search the ListView manually.
    if (!resolvedErpId || resolvedErpId === 'UNKNOWN') {
      console.log('\n[E2E] ERP ID non trovato — ricerca manuale in ListView...');
      resolvedErpId = await manualSearchErpId(page, CUSTOMER.name);
      console.log(`[E2E] ID trovato da ListView: ${resolvedErpId}`);
    }

    if (resolvedErpId && resolvedErpId !== 'UNKNOWN') {
      console.log('\n[E2E] Chiamata buildSnapshotWithDiff()...');
      const { snapshot, divergences } = await bot.buildSnapshotWithDiff(resolvedErpId, CUSTOMER);

      console.log('\n[E2E] === SNAPSHOT ERP ===');
      if (snapshot) {
        for (const [k, v] of Object.entries(snapshot)) {
          if (v !== null) console.log(`  ${k}: "${v}"`);
        }
      } else {
        console.log('  (snapshot null)');
      }

      console.log('\n[E2E] === DIVERGENZE (inviato vs letto) ===');
      if (divergences.length === 0) {
        console.log('  Nessuna divergenza — tutti i campi corrispondono!');
      } else {
        for (const d of divergences) {
          console.log(`  ${d.field}: sent="${d.sent}" actual="${d.actual}"`);
        }
      }

      console.log('\n[E2E] === RISULTATO FINALE ===');
      console.log(`  ERP ID (originale): ${realErpId}`);
      console.log(`  ERP ID (risolto): ${resolvedErpId}`);
      console.log(`  Snapshot: ${snapshot ? 'OK' : 'NULL'}`);
      console.log(`  Divergenze: ${divergences.length}`);
    } else {
      console.log('\n[E2E] WARN: ERP ID non trovato — impossibile leggere snapshot.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('\n[E2E] ERRORE:', (err as Error).message);
    console.error((err as Error).stack);
    process.exitCode = 1;
  } finally {
    console.log('\n[E2E] Chiusura browser...');
    await browser.close();
  }
})();

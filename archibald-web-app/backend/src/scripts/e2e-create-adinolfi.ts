// e2e-create-adinolfi.ts
// E2E test: D.ssa FRANCA ADINOLFI — verifica fix post-apply:
//   - VATNUM scritto PRIMO con attesa callback
//   - CF personale diverso da P.IVA
//   - SDI salvato (non azzerato da callback)
//   - FedEx via combo click
//   - Settore "Spett. Studio Dentistico"
//   - Termini pagamento 206
//   - Mobile diverso dal telefono
// Usage: npx tsx src/scripts/e2e-create-adinolfi.ts
import puppeteer from 'puppeteer';
import { ArchibaldBot } from '../bot/archibald-bot.js';
import type { CustomerFormData } from '../types.js';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';

const CUSTOMER: CustomerFormData = {
  name: 'D.ssa FRANCA ADINOLFI',
  vatNumber: '03725961217',
  fiscalCode: 'DNLFNC61E44G813S', // CF personale — DIVERSO dalla P.IVA
  sdi: '0000000',
  pec: undefined, // non fornita
  street: 'VIA Carlo Alberto, I Trav. 3',
  postalCode: '80045', // Pompei (NA)
  phone: '+390818500864',
  mobile: '+393319509408', // diverso dal phone
  email: 'franca.adinolfi@alice.it',
  url: undefined, // non fornita — NON usare nd.it
  deliveryMode: 'FedEx',
  paymentTerms: '206',
  sector: 'Spett. Studio Dentistico',
  lineDiscount: undefined,
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
  console.log('=== E2E CREATE CUSTOMER — D.ssa FRANCA ADINOLFI ===\n');
  console.log('[E2E] Cliente da creare:', JSON.stringify(CUSTOMER, null, 2));
  console.log('');
  console.log('[E2E] Verifiche previste:');
  console.log('  - VATNUM scritto PRIMO con attesa callback (~2.6s)');
  console.log('  - CF personale DNLFNC61E44G813S (DIVERSO da P.IVA 03725961217)');
  console.log('  - SDI = 0000000 (non azzerato dal callback)');
  console.log('  - deliveryMode = FedEx');
  console.log('  - sector = Spett. Studio Dentistico');
  console.log('  - paymentTerms = 206');
  console.log('  - mobile DIVERSO dal phone');
  console.log('  - url NON impostato (non usare nd.it)');
  console.log('  - pec NON impostata');
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

    console.log('\n[E2E] Chiamata completeCustomerCreation(CUSTOMER, false)...');
    const startMs = Date.now();

    const realErpId = await bot.completeCustomerCreation(CUSTOMER, false);

    const elapsed = Date.now() - startMs;
    console.log(`\n[E2E] completeCustomerCreation completato in ${elapsed}ms`);
    console.log(`[E2E] ERP ID restituito: ${realErpId}`);

    let resolvedErpId = realErpId;

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

      // Verifiche specifiche per questo test
      console.log('\n[E2E] === VERIFICHE SPECIFICHE ===');
      if (snapshot) {
        const cfOk = snapshot.fiscalCode === CUSTOMER.fiscalCode;
        const cfNotVat = snapshot.fiscalCode !== CUSTOMER.vatNumber;
        const sdiOk = snapshot.sdi === CUSTOMER.sdi;
        const delivOk = snapshot.deliveryMode?.toLowerCase().includes('fedex');
        const sectorOk = snapshot.sector?.toLowerCase().includes('studio dentistico');
        const paymOk = snapshot.paymentTerms === CUSTOMER.paymentTerms;
        const mobileOk = snapshot.mobile === CUSTOMER.mobile;
        const mobileDiffPhone = snapshot.mobile !== snapshot.phone;
        const urlEmpty = !snapshot.url || snapshot.url === '' || snapshot.url === 'N/A';
        const pecEmpty = !snapshot.pec || snapshot.pec === '' || snapshot.pec === 'N/A';

        console.log(`  CF corretto (${CUSTOMER.fiscalCode}): ${cfOk ? 'OK' : 'FAIL — got: ' + snapshot.fiscalCode}`);
        console.log(`  CF != P.IVA: ${cfNotVat ? 'OK' : 'FAIL — CF coincide con P.IVA!'}`);
        console.log(`  SDI = 0000000: ${sdiOk ? 'OK' : 'FAIL — got: ' + snapshot.sdi}`);
        console.log(`  deliveryMode FedEx: ${delivOk ? 'OK' : 'FAIL — got: ' + snapshot.deliveryMode}`);
        console.log(`  sector Studio Dentistico: ${sectorOk ? 'OK' : 'FAIL — got: ' + snapshot.sector}`);
        console.log(`  paymentTerms = 206: ${paymOk ? 'OK' : 'FAIL — got: ' + snapshot.paymentTerms}`);
        console.log(`  mobile = ${CUSTOMER.mobile}: ${mobileOk ? 'OK' : 'FAIL — got: ' + snapshot.mobile}`);
        console.log(`  mobile != phone: ${mobileDiffPhone ? 'OK' : 'FAIL — coincidono!'}`);
        console.log(`  URL vuoto: ${urlEmpty ? 'OK' : 'FAIL — got: ' + snapshot.url}`);
        console.log(`  PEC vuota: ${pecEmpty ? 'OK' : 'FAIL — got: ' + snapshot.pec}`);

        const allOk = cfOk && cfNotVat && sdiOk && delivOk && sectorOk && paymOk && mobileOk && mobileDiffPhone && urlEmpty;
        console.log(`\n  Risultato complessivo: ${allOk ? 'TUTTI OK' : 'FALLITO — vedere dettagli sopra'}`);
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

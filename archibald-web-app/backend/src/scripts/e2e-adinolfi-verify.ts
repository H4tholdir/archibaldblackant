// e2e-adinolfi-verify.ts
// Verifica snapshot D.ssa FRANCA ADINOLFI (ERP ID 57.410) tramite buildSnapshotWithDiff.
// Usa buildCustomerSnapshot del bot che internamente legge i campi senza page.evaluate custom.
// Usage: npx tsx src/scripts/e2e-adinolfi-verify.ts
import puppeteer from 'puppeteer';
import { ArchibaldBot } from '../bot/archibald-bot.js';
import type { CustomerFormData } from '../types.js';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';

// Found via e2e-find-adinolfi.ts — cells showed "57.410" in ID column
const ERP_ID_DOT = '57.410';

const CUSTOMER: CustomerFormData = {
  name: 'D.ssa FRANCA ADINOLFI',
  vatNumber: '03725961217',
  fiscalCode: 'DNLFNC61E44G813S',
  sdi: '0000000',
  pec: undefined,
  street: 'VIA Carlo Alberto, I Trav. 3',
  postalCode: '80045',
  phone: '+390818500864',
  mobile: '+393319509408',
  email: 'franca.adinolfi@alice.it',
  url: undefined,
  deliveryMode: 'FedEx',
  paymentTerms: '206',
  sector: 'Spett. Studio Dentistico',
  lineDiscount: undefined,
};

async function login(page: import('puppeteer').Page): Promise<void> {
  await page.goto(`${ERP_URL}/Default.aspx`, { waitUntil: 'networkidle2', timeout: 60000 });
  const userInput = await page.$('input[id*="USER"], input[type="text"]');
  if (!userInput) { console.log('[E2E] Already logged in'); return; }
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

(async () => {
  console.log('=== E2E ADINOLFI VERIFY — ERP ID 57.410 ===\n');
  console.log('Cliente atteso:', JSON.stringify(CUSTOMER, null, 2));
  console.log('');

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 30,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox'],
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

    console.log(`\n[E2E] buildSnapshotWithDiff con ERP ID "${ERP_ID_DOT}"...`);
    const { snapshot, divergences } = await bot.buildSnapshotWithDiff(ERP_ID_DOT, CUSTOMER);

    console.log('\n[E2E] === SNAPSHOT ERP (tutti i campi) ===');
    if (snapshot) {
      for (const [k, v] of Object.entries(snapshot)) {
        console.log(`  ${k}: "${v ?? '(null)'}"`);
      }
    } else {
      console.log('  (snapshot null — buildCustomerSnapshot fallì)');
    }

    console.log('\n[E2E] === DIVERGENZE (inviato vs letto) ===');
    if (divergences.length === 0) {
      console.log('  Nessuna divergenza — tutti i campi corrispondono!');
    } else {
      for (const d of divergences) {
        console.log(`  ${d.field}: sent="${d.sent}" actual="${d.actual}"`);
      }
    }

    // Specific verifications from snapshot
    if (snapshot) {
      console.log('\n[E2E] === VERIFICHE SPECIFICHE ===');
      const cfOk = snapshot.fiscalCode === CUSTOMER.fiscalCode;
      const cfNotVat = snapshot.fiscalCode !== CUSTOMER.vatNumber;
      const sdiOk = snapshot.sdi === CUSTOMER.sdi;
      const delivOk = (snapshot.deliveryMode ?? '').toLowerCase().includes('fedex');
      const sectorOk = (snapshot.sector ?? '').toLowerCase().includes('studio dentistico');
      const paymOk = snapshot.paymentTerms === CUSTOMER.paymentTerms;
      const mobileOk = snapshot.mobile === CUSTOMER.mobile;
      const mobileDiffPhone = snapshot.mobile !== snapshot.phone;
      const urlEmpty = !snapshot.url || snapshot.url === '' || snapshot.url === 'N/A';
      const pecEmpty = !snapshot.pec || snapshot.pec === '' || snapshot.pec === 'N/A';
      const nameOk = snapshot.name === CUSTOMER.name;
      const vatOk = snapshot.vatNumber === CUSTOMER.vatNumber;

      console.log(`  name = "${CUSTOMER.name}": ${nameOk ? 'OK' : 'FAIL — got: ' + snapshot.name}`);
      console.log(`  vatNumber = "${CUSTOMER.vatNumber}": ${vatOk ? 'OK' : 'FAIL — got: ' + snapshot.vatNumber}`);
      console.log(`  CF corretto (${CUSTOMER.fiscalCode}): ${cfOk ? 'OK' : 'FAIL — got: ' + snapshot.fiscalCode}`);
      console.log(`  CF != P.IVA: ${cfNotVat ? 'OK' : 'FAIL — CF coincide con P.IVA!'}`);
      console.log(`  SDI = 0000000: ${sdiOk ? 'OK' : 'FAIL — got: ' + snapshot.sdi}`);
      console.log(`  deliveryMode FedEx: ${delivOk ? 'OK' : 'FAIL — got: ' + snapshot.deliveryMode}`);
      console.log(`  sector Studio Dentistico: ${sectorOk ? 'OK' : 'FAIL — got: ' + snapshot.sector}`);
      console.log(`  paymentTerms = 206: ${paymOk ? 'OK' : 'FAIL — got: ' + snapshot.paymentTerms}`);
      console.log(`  mobile = "${CUSTOMER.mobile}": ${mobileOk ? 'OK' : 'FAIL — got: ' + snapshot.mobile}`);
      console.log(`  mobile != phone: ${mobileDiffPhone ? 'OK' : 'FAIL — coincidono!'}`);
      console.log(`  URL vuoto: ${urlEmpty ? 'OK' : 'FAIL — got: ' + snapshot.url}`);
      console.log(`  PEC vuota: ${pecEmpty ? 'OK' : 'FAIL — got: ' + snapshot.pec}`);

      const allOk = cfOk && cfNotVat && sdiOk && delivOk && sectorOk && paymOk && mobileOk && mobileDiffPhone && urlEmpty && nameOk && vatOk;

      console.log('\n[E2E] === RISULTATO FINALE ===');
      console.log(`  ERP ID: ${ERP_ID_DOT}`);
      console.log(`  Snapshot: OK`);
      console.log(`  Divergenze totali: ${divergences.length}`);
      console.log(`  Verifiche specifiche: ${allOk ? 'TUTTI OK' : 'ATTENZIONE — vedere sopra'}`);

      if (!allOk) process.exitCode = 1;
    } else {
      console.log('\n[E2E] WARN: snapshot null — impossibile verificare i campi');
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

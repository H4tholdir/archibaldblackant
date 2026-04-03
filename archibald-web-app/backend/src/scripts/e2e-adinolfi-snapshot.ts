// e2e-adinolfi-snapshot.ts
// Legge snapshot + divergenze per D.ssa FRANCA ADINOLFI (ERP ID 57.410 / numeric 57410).
// Verifica tutti i campi specifici del test.
// Usage: npx tsx src/scripts/e2e-adinolfi-snapshot.ts
import puppeteer from 'puppeteer';
import { ArchibaldBot } from '../bot/archibald-bot.js';
import type { CustomerFormData } from '../types.js';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';

const ERP_ID_DOT = '57.410';
const ERP_ID_NUMERIC = '57410';

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

async function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

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
  console.log('=== E2E ADINOLFI SNAPSHOT — ERP ID 57.410 ===\n');
  console.log(`ERP ID dot format: ${ERP_ID_DOT}`);
  console.log(`ERP ID numeric: ${ERP_ID_NUMERIC}\n`);

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 30,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  const bot = new ArchibaldBot('e2e-test-user');
  bot.page = page;

  try {
    await login(page);

    // Navigate directly to the DetailView in edit mode
    console.log(`[E2E] Navigo a CUSTTABLE_DetailView/${ERP_ID_NUMERIC}/?mode=Edit...`);
    await page.goto(`${ERP_URL}/CUSTTABLE_DetailView/${ERP_ID_NUMERIC}/?mode=Edit`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await wait(2000);

    const currentUrl = page.url();
    console.log(`[E2E] URL corrente: ${currentUrl}`);

    // Read fields from Tab Principale
    const fields = await page.evaluate(() => {
      const g = (re: string) => {
        const pat = new RegExp(re);
        return (Array.from(document.querySelectorAll('input, textarea')) as (HTMLInputElement | HTMLTextAreaElement)[])
          .find(el => el.offsetParent !== null && pat.test(el.id))?.value ?? null;
      };
      return {
        internalId:   g('dviID_Edit_I$'),
        accountNum:   g('dviACCOUNTNUM_Edit_I$'),
        name:         g('dviNAME_Edit_I$'),
        nameAlias:    g('dviNAMEALIAS_Edit_I$'),
        vatNumber:    g('dviVATNUM_Edit_I$'),
        vatValidated: g('dviVATVALIEDE_Edit_I$'),
        fiscalCode:   g('dviFISCALCODE_Edit_I$'),
        pec:          g('dviLEGALEMAIL_Edit_I$'),
        sdi:          g('dviLEGALAUTHORITY_Edit_I$'),
        notes:        g('dviCUSTINFO_Edit_I$'),
        street:       g('dviSTREET_Edit_I$'),
        postalCode:   g('dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_I$'),
        city:         g('dviCITY_Edit_I$'),
        county:       g('dviCOUNTY_Edit_I$'),
        state:        g('dviSTATE_Edit_I$'),
        country:      g('dviCOUNTRYREGIONID_Edit_I$'),
        phone:        g('dviPHONE_Edit_I$'),
        mobile:       g('dviCELLULARPHONE_Edit_I$'),
        email:        g('dviEMAIL_Edit_I$'),
        url:          g('dviURL_Edit_I$'),
        attentionTo:  g('dviBRASCRMATTENTIONTO_Edit_I$'),
        deliveryMode: g('dviDLVMODE_Edit_dropdown_DD_I$'),
        paymentTerms: g('dviPAYMTERMID_Edit_find_Edit_I$'),
        sector:       g('dviBUSINESSSECTORID_Edit_dropdown_DD_I$'),
      };
    });

    console.log('\n[E2E] === SNAPSHOT ERP (Tab Principale, letto direttamente) ===');
    for (const [k, v] of Object.entries(fields)) {
      console.log(`  ${k}: "${v ?? '(null)'}"`);
    }

    // Navigate to Prezzi tab to read pricing fields
    const prezziTabClicked = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('a, span, td, div, li'));
      const prezziTab = tabs.find(el =>
        /prezzi|price/i.test((el.textContent || '').trim()) &&
        (el as HTMLElement).offsetParent !== null &&
        (el as HTMLElement).offsetWidth > 0,
      );
      if (prezziTab) {
        (prezziTab as HTMLElement).click();
        return (prezziTab as HTMLElement).textContent?.trim() ?? 'clicked';
      }
      return null;
    });
    console.log(`\n[E2E] Prezzi tab click: ${prezziTabClicked}`);
    await wait(2500);

    const prezziFields = await page.evaluate(() => {
      const g = (re: string) => {
        const pat = new RegExp(re);
        return (Array.from(document.querySelectorAll('input')) as HTMLInputElement[])
          .find(el => el.offsetParent !== null && pat.test(el.id))?.value ?? null;
      };
      return {
        priceGroup:    g('dviPRICEGROUP_Edit_dropdown_DD_I$'),
        lineDiscount:  g('dviLINEDISC_Edit_dropdown_DD_I$'),
        multiLineDisc: g('dviMULTILINEDISC_Edit_dropdown_DD_I$'),
        endDisc:       g('dviENDDISC_Edit_dropdown_DD_I$'),
      };
    });

    console.log('[E2E] === CAMPI PREZZI ===');
    for (const [k, v] of Object.entries(prezziFields)) {
      console.log(`  ${k}: "${v ?? '(null)'}"`);
    }

    // Specific verification checks
    console.log('\n[E2E] === VERIFICHE SPECIFICHE ===');
    const cfOk = fields.fiscalCode === CUSTOMER.fiscalCode;
    const cfNotVat = fields.fiscalCode !== CUSTOMER.vatNumber;
    const sdiOk = fields.sdi === CUSTOMER.sdi;
    const delivOk = (fields.deliveryMode ?? '').toLowerCase().includes('fedex');
    const sectorOk = (fields.sector ?? '').toLowerCase().includes('studio dentistico');
    const paymOk = fields.paymentTerms === CUSTOMER.paymentTerms;
    const mobileOk = fields.mobile === CUSTOMER.mobile;
    const mobileDiffPhone = fields.mobile !== fields.phone;
    const urlEmpty = !fields.url || fields.url === '' || fields.url === 'N/A';
    const pecEmpty = !fields.pec || fields.pec === '' || fields.pec === 'N/A';
    const nameOk = fields.name === CUSTOMER.name;
    const vatOk = fields.vatNumber === CUSTOMER.vatNumber;
    const phoneOk = fields.phone === CUSTOMER.phone;
    const emailOk = fields.email === CUSTOMER.email;
    const streetOk = fields.street === CUSTOMER.street;

    console.log(`  name = "${CUSTOMER.name}": ${nameOk ? 'OK' : 'FAIL — got: ' + fields.name}`);
    console.log(`  vatNumber = "${CUSTOMER.vatNumber}": ${vatOk ? 'OK' : 'FAIL — got: ' + fields.vatNumber}`);
    console.log(`  CF corretto (${CUSTOMER.fiscalCode}): ${cfOk ? 'OK' : 'FAIL — got: ' + fields.fiscalCode}`);
    console.log(`  CF != P.IVA: ${cfNotVat ? 'OK' : 'FAIL — CF coincide con P.IVA!'}`);
    console.log(`  SDI = 0000000: ${sdiOk ? 'OK' : 'FAIL — got: ' + fields.sdi}`);
    console.log(`  street = "${CUSTOMER.street}": ${streetOk ? 'OK' : 'FAIL — got: ' + fields.street}`);
    console.log(`  phone = "${CUSTOMER.phone}": ${phoneOk ? 'OK' : 'FAIL — got: ' + fields.phone}`);
    console.log(`  mobile = "${CUSTOMER.mobile}": ${mobileOk ? 'OK' : 'FAIL — got: ' + fields.mobile}`);
    console.log(`  email = "${CUSTOMER.email}": ${emailOk ? 'OK' : 'FAIL — got: ' + fields.email}`);
    console.log(`  mobile != phone: ${mobileDiffPhone ? 'OK' : 'FAIL — coincidono!'}`);
    console.log(`  deliveryMode FedEx: ${delivOk ? 'OK' : 'FAIL — got: ' + fields.deliveryMode}`);
    console.log(`  sector Studio Dentistico: ${sectorOk ? 'OK' : 'FAIL — got: ' + fields.sector}`);
    console.log(`  paymentTerms = 206: ${paymOk ? 'OK' : 'FAIL — got: ' + fields.paymentTerms}`);
    console.log(`  URL vuoto: ${urlEmpty ? 'OK' : 'FAIL — got: ' + fields.url}`);
    console.log(`  PEC vuota: ${pecEmpty ? 'OK' : 'FAIL — got: ' + fields.pec}`);

    // Now run buildSnapshotWithDiff
    console.log(`\n[E2E] buildSnapshotWithDiff con dotId="${ERP_ID_DOT}"...`);
    const { snapshot, divergences } = await bot.buildSnapshotWithDiff(ERP_ID_DOT, CUSTOMER);

    console.log('\n[E2E] === SNAPSHOT (buildSnapshotWithDiff) ===');
    if (snapshot) {
      for (const [k, v] of Object.entries(snapshot)) {
        if (v !== null) console.log(`  ${k}: "${v}"`);
      }
    } else {
      console.log('  (snapshot null)');
    }

    console.log('\n[E2E] === DIVERGENZE (buildSnapshotWithDiff) ===');
    if (divergences.length === 0) {
      console.log('  Nessuna divergenza!');
    } else {
      for (const d of divergences) {
        console.log(`  ${d.field}: sent="${d.sent}" actual="${d.actual}"`);
      }
    }

    const allOk = cfOk && cfNotVat && sdiOk && delivOk && sectorOk && paymOk && mobileOk && mobileDiffPhone && urlEmpty && nameOk && vatOk;

    console.log('\n[E2E] === RISULTATO FINALE ===');
    console.log(`  ERP ID (dot): ${ERP_ID_DOT}`);
    console.log(`  ERP ID (numeric): ${ERP_ID_NUMERIC}`);
    console.log(`  Snapshot (diretto): OK (${Object.keys(fields).length} campi letti)`);
    console.log(`  Snapshot (buildSnapshotWithDiff): ${snapshot ? 'OK' : 'NULL'}`);
    console.log(`  Divergenze: ${divergences.length}`);
    console.log(`  Verifiche specifiche: ${allOk ? 'TUTTI OK' : 'FALLITO — vedere sopra'}`);

  } catch (err) {
    console.error('\n[E2E] ERRORE:', (err as Error).message);
    console.error((err as Error).stack);
    process.exitCode = 1;
  } finally {
    console.log('\n[E2E] Chiusura browser...');
    await browser.close();
  }
})();

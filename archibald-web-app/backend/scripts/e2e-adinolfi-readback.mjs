/**
 * e2e-adinolfi-readback.mjs
 * Legge i campi di D.ssa FRANCA ADINOLFI (ERP ID 57.410) in VIEW mode per verificare
 * cosa è stato effettivamente salvato nell'ERP, e poi in EDIT mode per confronto.
 * Usage: node scripts/e2e-adinolfi-readback.mjs
 */
import puppeteer from 'puppeteer';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const ERP_ID_NUMERIC = '57410';

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const browser = await puppeteer.launch({
  headless: false,
  slowMo: 30,
  args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox'],
  ignoreHTTPSErrors: true,
});

try {
  const page = await browser.newPage();
  page.on('dialog', async d => { console.log('[dialog]', d.message()); await d.accept(); });

  // Login
  console.log('1. Login...');
  await page.goto(`${ERP_URL}/Default.aspx`, { waitUntil: 'networkidle2', timeout: 60000 });
  const userInput = await page.$('input[id*="USER"], input[type="text"]');
  if (userInput) {
    await userInput.click();
    await userInput.type(USERNAME, { delay: 50 });
    const passInput = await page.$('input[type="password"]');
    if (passInput) {
      await passInput.click();
      await passInput.type(PASSWORD, { delay: 50 });
    }
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  }
  console.log('   Login OK —', page.url());

  // Navigate to VIEW mode (no ?mode=Edit)
  console.log(`\n2. Navigo a CUSTTABLE_DetailView/${ERP_ID_NUMERIC}/?mode=View...`);
  await page.goto(`${ERP_URL}/CUSTTABLE_DetailView/${ERP_ID_NUMERIC}/?mode=View`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await wait(3000);
  console.log('   URL:', page.url());

  // Read visible text content (VIEW mode shows values as text spans, not inputs)
  console.log('\n3. Leggo contenuto pagina in VIEW mode...');

  // Get all visible text on page to understand structure
  const pageText = await page.evaluate(() => document.body.innerText);
  console.log('\n=== CONTENUTO PAGINA (prime 3000 char) ===');
  console.log(pageText.substring(0, 3000));

  // Try reading via input values too (some might be visible)
  const readViewField = async (pattern) => {
    return page.evaluate((pat) => {
      const re = new RegExp(pat);
      // Try input/textarea first
      const inputEl = Array.from(document.querySelectorAll('input, textarea'))
        .find(e => e.offsetParent !== null && re.test(e.id));
      if (inputEl) return inputEl.value;
      // Then try span/div with matching ID
      const spanEl = Array.from(document.querySelectorAll('span, div'))
        .find(e => e.offsetParent !== null && re.test(e.id));
      if (spanEl) return spanEl.textContent?.trim() || null;
      return null;
    }, pattern);
  };

  const viewFields = {
    internalId:   await readViewField('dviID'),
    name:         await readViewField('dviNAME'),
    nameAlias:    await readViewField('dviNAMEALIAS'),
    vatNumber:    await readViewField('dviVATNUM'),
    vatValidated: await readViewField('dviVATVALIEDE'),
    fiscalCode:   await readViewField('dviFISCALCODE'),
    pec:          await readViewField('dviLEGALEMAIL'),
    sdi:          await readViewField('dviLEGALAUTHORITY'),
    street:       await readViewField('dviSTREET'),
    postalCode:   await readViewField('dviLOGISTICSADDRESSZIPCODE'),
    city:         await readViewField('dviCITY'),
    phone:        await readViewField('dviPHONE'),
    mobile:       await readViewField('dviCELLULARPHONE'),
    email:        await readViewField('dviEMAIL'),
    url:          await readViewField('dviURL'),
    deliveryMode: await readViewField('dviDLVMODE'),
    paymentTerms: await readViewField('dviPAYMTERMID'),
    sector:       await readViewField('dviBUSINESSSECTORID'),
  };

  console.log('\n=== CAMPI LETTI (VIEW mode — pattern match) ===');
  for (const [k, v] of Object.entries(viewFields)) {
    console.log(`  ${k}: "${v ?? '(null)'}"`);
  }

  // Navigate to EDIT mode
  console.log('\n4. Click Modifica per entrare in edit mode...');
  const editBtn = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('a, button, span'));
    const editB = buttons.find(el =>
      el.offsetParent !== null &&
      (el.title === 'Modificare' || /modif/i.test(el.title || '') || el.textContent?.trim() === 'Modifica')
    );
    if (editB) { editB.click(); return editB.textContent?.trim() || editB.title; }
    return null;
  });
  console.log('   Pulsante cliccato:', editBtn);

  await page.waitForFunction(
    () => window.location.href.includes('mode=Edit'),
    { timeout: 15000, polling: 300 },
  ).catch(() => console.log('   WARN: mode=Edit non visto in URL'));
  await wait(2000);
  console.log('   URL in edit:', page.url());

  const readField = async (pattern) => {
    return page.evaluate((pat) => {
      const re = new RegExp(pat);
      const els = Array.from(document.querySelectorAll('input, textarea'));
      const el = els.find(e => e.offsetParent !== null && re.test(e.id));
      return el ? el.value : null;
    }, pattern);
  };

  const editFields = {
    internalId:   await readField('dviID_Edit_I$'),
    accountNum:   await readField('dviACCOUNTNUM_Edit_I$'),
    name:         await readField('dviNAME_Edit_I$'),
    nameAlias:    await readField('dviNAMEALIAS_Edit_I$'),
    vatNumber:    await readField('dviVATNUM_Edit_I$'),
    vatValidated: await readField('dviVATVALIEDE_Edit_I$'),
    fiscalCode:   await readField('dviFISCALCODE_Edit_I$'),
    pec:          await readField('dviLEGALEMAIL_Edit_I$'),
    sdi:          await readField('dviLEGALAUTHORITY_Edit_I$'),
    notes:        await readField('dviCUSTINFO_Edit_I$'),
    street:       await readField('dviSTREET_Edit_I$'),
    postalCode:   await readField('dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_I$'),
    city:         await readField('dviCITY_Edit_I$'),
    county:       await readField('dviCOUNTY_Edit_I$'),
    state:        await readField('dviSTATE_Edit_I$'),
    country:      await readField('dviCOUNTRYREGIONID_Edit_I$'),
    phone:        await readField('dviPHONE_Edit_I$'),
    mobile:       await readField('dviCELLULARPHONE_Edit_I$'),
    email:        await readField('dviEMAIL_Edit_I$'),
    url:          await readField('dviURL_Edit_I$'),
    attentionTo:  await readField('dviBRASCRMATTENTIONTO_Edit_I$'),
    deliveryMode: await readField('dviDLVMODE_Edit_dropdown_DD_I$'),
    paymentTerms: await readField('dviPAYMTERMID_Edit_find_Edit_I$'),
    sector:       await readField('dviBUSINESSSECTORID_Edit_dropdown_DD_I$'),
  };

  console.log('\n=== SNAPSHOT ERP (EDIT mode) ===');
  for (const [k, v] of Object.entries(editFields)) {
    console.log(`  ${k}: "${v ?? '(null)'}"`);
  }

  // Navigate to Prezzi tab
  console.log('\n5. Tab Prezzi e sconti...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('a, span, td, div, li'));
    const prezziTab = tabs.find(el =>
      /prezzi.*sconti|price.*disc/i.test((el.textContent || '').trim()) &&
      el.offsetParent !== null
    );
    if (prezziTab) { prezziTab.click(); return true; }
    return false;
  });
  await wait(2500);

  const priceGroup    = await readField('dviPRICEGROUP_Edit_dropdown_DD_I$');
  const lineDiscount  = await readField('dviLINEDISC_Edit_dropdown_DD_I$');

  console.log(`  priceGroup:   "${priceGroup}"`);
  console.log(`  lineDiscount: "${lineDiscount}"`);

  // Final summary
  console.log('\n=== RIEPILOGO FINALE ===');
  console.log(`  ERP ID: 57.410 (numeric: 57410)`);
  console.log(`  name: "${editFields.name}"`);
  console.log(`  vatNumber: "${editFields.vatNumber}"`);
  console.log(`  fiscalCode: "${editFields.fiscalCode}" — atteso: "DNLFNC61E44G813S"`);
  console.log(`  sdi: "${editFields.sdi}" — atteso: "0000000"`);
  console.log(`  deliveryMode: "${editFields.deliveryMode}" — atteso: "FedEx"`);
  console.log(`  paymentTerms: "${editFields.paymentTerms}" — atteso: "206"`);
  console.log(`  sector: "${editFields.sector}" — atteso: "Spett. Studio Dentistico"`);
  console.log(`  lineDiscount: "${lineDiscount}" — atteso: "N/A"`);
  console.log(`  mobile: "${editFields.mobile}" — atteso: "+393319509408"`);
  console.log(`  phone: "${editFields.phone}" — atteso: "+390818500864"`);
  console.log(`  postalCode: "${editFields.postalCode}" — city: "${editFields.city}"`);

} catch (err) {
  console.error('\n[E2E] ERRORE:', err.message);
  console.error(err.stack);
  process.exitCode = 1;
} finally {
  console.log('\n[E2E] Chiusura browser...');
  await browser.close();
}

/**
 * e2e-adinolfi-verify.mjs
 * Verifica snapshot D.ssa FRANCA ADINOLFI (ERP ID 57.410 / numeric 57410).
 * Legge tutti i campi direttamente dall'ERP DetailView e confronta con dati attesi.
 * Usage: node scripts/e2e-adinolfi-verify.mjs
 */
import puppeteer from 'puppeteer';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';
const ERP_ID_NUMERIC = '57410';
const ERP_ID_DOT = '57.410';

const EXPECTED = {
  name: 'D.ssa FRANCA ADINOLFI',
  vatNumber: '03725961217',
  fiscalCode: 'DNLFNC61E44G813S',
  sdi: '0000000',
  pec: '',
  street: 'VIA Carlo Alberto, I Trav. 3',
  postalCode: '80045',
  phone: '+390818500864',
  mobile: '+393319509408',
  email: 'franca.adinolfi@alice.it',
  url: '',
  deliveryMode: 'FedEx',
  paymentTerms: '206',
  sector: 'Spett. Studio Dentistico',
};

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

  // Navigate to DetailView in view mode first
  console.log(`\n2. Navigo a CUSTTABLE_DetailView/${ERP_ID_NUMERIC}/...`);
  await page.goto(`${ERP_URL}/CUSTTABLE_DetailView/${ERP_ID_NUMERIC}/`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await wait(2000);
  console.log('   URL:', page.url());

  // Check if page loaded correctly
  const pageTitle = await page.title();
  console.log('   Titolo pagina:', pageTitle);

  // Click edit button to enter edit mode
  console.log('\n3. Click pulsante Modifica...');
  const editClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('a, button, span'));
    const editBtn = buttons.find(el =>
      el.offsetParent !== null &&
      (el.title === 'Modificare' || /modif/i.test(el.title || '') || /modif/i.test(el.textContent || ''))
    );
    if (editBtn) {
      editBtn.click();
      return editBtn.textContent?.trim() || editBtn.title || 'clicked';
    }
    return null;
  });
  console.log('   Pulsante cliccato:', editClicked);

  if (editClicked) {
    await page.waitForFunction(
      () => window.location.href.includes('mode=Edit'),
      { timeout: 15000, polling: 300 },
    ).catch(() => console.log('   WARN: mode=Edit non visto in URL'));
    await wait(2000);
    console.log('   URL in edit mode:', page.url());
  }

  // Read all fields with individual evaluate calls to avoid __name issue
  console.log('\n4. Leggo tutti i campi...');

  const readField = async (pattern) => {
    return page.evaluate((pat) => {
      const re = new RegExp(pat);
      const els = Array.from(document.querySelectorAll('input, textarea'));
      const el = els.find(e => e.offsetParent !== null && re.test(e.id));
      return el ? el.value : null;
    }, pattern);
  };

  const fields = {
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

  console.log('\n=== SNAPSHOT ERP (Tab Principale) ===');
  for (const [k, v] of Object.entries(fields)) {
    console.log(`  ${k}: "${v ?? '(null)'}"`);
  }

  // Navigate to Prezzi tab
  console.log('\n5. Tab Prezzi...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('a, span, td, div, li'));
    const prezziTab = tabs.find(el =>
      /prezzi|price/i.test((el.textContent || '').trim()) &&
      el.offsetParent !== null &&
      el.offsetWidth > 0
    );
    if (prezziTab) prezziTab.click();
  });
  await wait(2500);

  const priceGroup    = await readField('dviPRICEGROUP_Edit_dropdown_DD_I$');
  const lineDiscount  = await readField('dviLINEDISC_Edit_dropdown_DD_I$');
  const multiLineDisc = await readField('dviMULTILINEDISC_Edit_dropdown_DD_I$');
  const endDisc       = await readField('dviENDDISC_Edit_dropdown_DD_I$');

  console.log('\n=== CAMPI PREZZI ===');
  console.log(`  priceGroup:    "${priceGroup}"`);
  console.log(`  lineDiscount:  "${lineDiscount}"`);
  console.log(`  multiLineDisc: "${multiLineDisc}"`);
  console.log(`  endDisc:       "${endDisc}"`);

  // Specific verifications
  console.log('\n=== VERIFICHE SPECIFICHE ===');

  const checks = [
    { label: `name = "${EXPECTED.name}"`,                    ok: fields.name === EXPECTED.name,                    got: fields.name },
    { label: `vatNumber = "${EXPECTED.vatNumber}"`,          ok: fields.vatNumber === EXPECTED.vatNumber,          got: fields.vatNumber },
    { label: `CF = "${EXPECTED.fiscalCode}"`,                ok: fields.fiscalCode === EXPECTED.fiscalCode,        got: fields.fiscalCode },
    { label: 'CF != P.IVA',                                  ok: fields.fiscalCode !== EXPECTED.vatNumber,         got: `CF=${fields.fiscalCode}, VAT=${EXPECTED.vatNumber}` },
    { label: `SDI = "${EXPECTED.sdi}"`,                      ok: fields.sdi === EXPECTED.sdi,                      got: fields.sdi },
    { label: `street = "${EXPECTED.street}"`,                ok: fields.street === EXPECTED.street,                got: fields.street },
    { label: `phone = "${EXPECTED.phone}"`,                  ok: fields.phone === EXPECTED.phone,                  got: fields.phone },
    { label: `mobile = "${EXPECTED.mobile}"`,                ok: fields.mobile === EXPECTED.mobile,                got: fields.mobile },
    { label: 'mobile != phone',                              ok: fields.mobile !== fields.phone,                   got: `mobile=${fields.mobile}, phone=${fields.phone}` },
    { label: `email = "${EXPECTED.email}"`,                  ok: fields.email === EXPECTED.email,                  got: fields.email },
    { label: 'URL vuoto (null/empty/N/A)',                    ok: !fields.url || fields.url === '' || fields.url === 'N/A', got: fields.url },
    { label: 'PEC vuota (null/empty/N/A)',                    ok: !fields.pec || fields.pec === '' || fields.pec === 'N/A', got: fields.pec },
    { label: 'deliveryMode include "FedEx"',                 ok: (fields.deliveryMode || '').toLowerCase().includes('fedex'), got: fields.deliveryMode },
    { label: 'sector include "Studio Dentistico"',           ok: (fields.sector || '').toLowerCase().includes('studio dentistico'), got: fields.sector },
    { label: `paymentTerms = "${EXPECTED.paymentTerms}"`,   ok: fields.paymentTerms === EXPECTED.paymentTerms,    got: fields.paymentTerms },
    { label: 'lineDiscount = "N/A"',                         ok: lineDiscount === 'N/A',                           got: lineDiscount },
  ];

  let allOk = true;
  for (const c of checks) {
    if (c.ok) {
      console.log(`  OK   ${c.label}`);
    } else {
      console.log(`  FAIL ${c.label}  →  got: "${c.got}"`);
      allOk = false;
    }
  }

  // Divergences — simple manual comparison
  console.log('\n=== DIVERGENZE (inviato vs letto) ===');
  const sentVsActual = [
    { field: 'name',         sent: EXPECTED.name,         actual: fields.name },
    { field: 'vatNumber',    sent: EXPECTED.vatNumber,     actual: fields.vatNumber },
    { field: 'fiscalCode',   sent: EXPECTED.fiscalCode,    actual: fields.fiscalCode },
    { field: 'sdi',          sent: EXPECTED.sdi,           actual: fields.sdi },
    { field: 'pec',          sent: '',                     actual: fields.pec ?? '' },
    { field: 'street',       sent: EXPECTED.street,        actual: fields.street },
    { field: 'postalCode',   sent: EXPECTED.postalCode,    actual: fields.postalCode },
    { field: 'phone',        sent: EXPECTED.phone,         actual: fields.phone },
    { field: 'mobile',       sent: EXPECTED.mobile,        actual: fields.mobile },
    { field: 'email',        sent: EXPECTED.email,         actual: fields.email },
    { field: 'url',          sent: '',                     actual: fields.url ?? '' },
    { field: 'deliveryMode', sent: EXPECTED.deliveryMode,  actual: fields.deliveryMode },
    { field: 'paymentTerms', sent: EXPECTED.paymentTerms,  actual: fields.paymentTerms },
    { field: 'sector',       sent: EXPECTED.sector,        actual: fields.sector },
    { field: 'lineDiscount', sent: 'N/A',                  actual: lineDiscount ?? '' },
  ];

  const divs = sentVsActual.filter(c => (c.sent || '') !== (c.actual || ''));
  if (divs.length === 0) {
    console.log('  Nessuna divergenza!');
  } else {
    for (const d of divs) {
      console.log(`  ${d.field}: sent="${d.sent}" actual="${d.actual}"`);
    }
  }

  console.log('\n=== RISULTATO FINALE ===');
  console.log(`  ERP ID (dot): ${ERP_ID_DOT}`);
  console.log(`  ERP ID (numeric): ${ERP_ID_NUMERIC}`);
  console.log(`  internalId letto: ${fields.internalId}`);
  console.log(`  accountNum: ${fields.accountNum}`);
  console.log(`  postalCode letto: ${fields.postalCode} — city: ${fields.city}`);
  console.log(`  Divergenze: ${divs.length}`);
  console.log(`  Verifiche specifiche: ${allOk ? 'TUTTI OK' : 'FALLITO — vedere sopra'}`);

  if (!allOk || divs.length > 0) process.exitCode = 1;

} catch (err) {
  console.error('\n[E2E] ERRORE:', err.message);
  console.error(err.stack);
  process.exitCode = 1;
} finally {
  console.log('\n[E2E] Chiusura browser...');
  await browser.close();
}

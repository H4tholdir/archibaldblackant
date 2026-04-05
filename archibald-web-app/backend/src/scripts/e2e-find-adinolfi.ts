// e2e-find-adinolfi.ts
// Cerca D.ssa FRANCA ADINOLFI nell'ERP ListView e legge il suo snapshot + divergenze.
// Usato come step 2 dopo e2e-create-adinolfi.ts che ha restituito UNKNOWN.
// Usage: npx tsx src/scripts/e2e-find-adinolfi.ts
import puppeteer from 'puppeteer';
import { ArchibaldBot } from '../bot/archibald-bot.js';
import type { CustomerFormData } from '../types.js';

const ERP_URL = 'https://4.231.124.90/Archibald';
const USERNAME = 'ikiA0930';
const PASSWORD = 'Fresis26@';

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
  console.log('=== E2E FIND ADINOLFI — cerca + snapshot ===\n');

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

    // Navigate to customer ListView
    await page.goto(`${ERP_URL}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await wait(2000);

    // GotoPage(0) — Bibbia ERP rule 1
    await page.evaluate(() => {
      const grids = Array.from(document.querySelectorAll('[id*="grid"]'));
      grids.forEach(g => {
        try { (window as any).ASPx?.GotoPage?.(g.id, 0); } catch {}
      });
    });
    await wait(1500);

    console.log('[E2E] ListView caricata, cerco ADINOLFI nelle righe visibili...');

    // Search for Adinolfi in visible rows
    const found = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]')).filter(
        r => (r as HTMLElement).offsetParent !== null,
      );

      for (const row of rows) {
        const cellTexts = Array.from(row.querySelectorAll('td')).map(c => {
          const clone = c.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('script, style').forEach(s => s.remove());
          return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
        });

        const text = cellTexts.join(' ').toLowerCase();
        if (!text.includes('adinolfi')) continue;

        console.log('Found row:', cellTexts.slice(0, 6).join(' | '));

        // Look for edit link or ID
        const editLink = row.querySelector('a[href*="DetailView"]') as HTMLAnchorElement | null;
        if (editLink?.href) {
          const match = editLink.href.match(/DetailView[^/]*\/([^/?#]+)\//);
          if (match?.[1]) return { id: match[1], cells: cellTexts.slice(0, 8) };
        }

        // Fallback: read ID from cells (Bibbia ERP: skip first 2 ghost columns)
        const idCell = cellTexts[2]; // 3rd cell after 2 ghost columns
        return { id: idCell, cells: cellTexts.slice(0, 8) };
      }
      return null;
    });

    if (!found) {
      console.log('[E2E] Adinolfi non trovata nella prima pagina. Verifico se è sulla pagina successiva...');
      // Emit all visible row data for debugging
      const allRows = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]')).filter(
          r => (r as HTMLElement).offsetParent !== null,
        );
        return rows.slice(0, 10).map(row => {
          const cellTexts = Array.from(row.querySelectorAll('td')).map(c => {
            const clone = c.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('script, style').forEach(s => s.remove());
            return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
          });
          return cellTexts.slice(0, 5).join(' | ');
        });
      });
      console.log('[E2E] Prime 10 righe visibili:');
      allRows.forEach((r, i) => console.log(`  [${i}] ${r}`));

      // Try searching via the ERP search filter
      console.log('\n[E2E] Provo a cercare tramite filtro ricerca ERP...');
      const searchInput = await page.$('input[id*="search"], input[id*="Search"], input[type="text"][id*="find"]');
      if (searchInput) {
        await searchInput.click({ clickCount: 3 });
        await searchInput.type('ADINOLFI', { delay: 50 });
        await page.keyboard.press('Enter');
        await wait(3000);

        const foundAfterSearch = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]')).filter(
            r => (r as HTMLElement).offsetParent !== null,
          );
          for (const row of rows) {
            const cellTexts = Array.from(row.querySelectorAll('td')).map(c => {
              const clone = c.cloneNode(true) as HTMLElement;
              clone.querySelectorAll('script, style').forEach(s => s.remove());
              return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
            });
            const text = cellTexts.join(' ').toLowerCase();
            if (!text.includes('adinolfi')) continue;
            const editLink = row.querySelector('a[href*="DetailView"]') as HTMLAnchorElement | null;
            if (editLink?.href) {
              const match = editLink.href.match(/DetailView[^/]*\/([^/?#]+)\//);
              if (match?.[1]) return { id: match[1], cells: cellTexts.slice(0, 8) };
            }
            return { id: cellTexts[2], cells: cellTexts.slice(0, 8) };
          }
          return null;
        });

        if (foundAfterSearch) {
          console.log('[E2E] Trovata dopo ricerca:', foundAfterSearch);
        } else {
          console.log('[E2E] Adinolfi non trovata neanche dopo ricerca. Il cliente potrebbe non essere stato salvato.');
          process.exitCode = 1;
        }
      } else {
        console.log('[E2E] Nessun campo di ricerca trovato.');
        process.exitCode = 1;
      }
      return;
    }

    console.log('[E2E] Trovata!', JSON.stringify(found));
    const rawId = found.id;

    // Convert to numeric if it has dots
    const numericId = rawId.replace(/\./g, '');
    const dotId = rawId.includes('.') ? rawId : rawId.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    console.log(`[E2E] ID raw: ${rawId}, numericId: ${numericId}, dotId: ${dotId}`);

    // Navigate directly to the DetailView in edit mode
    console.log(`\n[E2E] Navigo a CUSTTABLE_DetailView/${numericId}/?mode=Edit...`);
    await page.goto(`${ERP_URL}/CUSTTABLE_DetailView/${numericId}/?mode=Edit`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await wait(2000);

    const currentUrl = page.url();
    console.log(`[E2E] URL corrente: ${currentUrl}`);

    // Read all fields
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

    console.log('\n[E2E] === SNAPSHOT ERP (letto direttamente) ===');
    for (const [k, v] of Object.entries(fields)) {
      console.log(`  ${k}: "${v ?? '(null)'}"`);
    }

    // Verifiche specifiche
    console.log('\n[E2E] === VERIFICHE SPECIFICHE ===');
    const cfOk = fields.fiscalCode === CUSTOMER.fiscalCode;
    const cfNotVat = fields.fiscalCode !== CUSTOMER.vatNumber;
    const sdiOk = fields.sdi === CUSTOMER.sdi;
    const delivOk = fields.deliveryMode?.toLowerCase().includes('fedex') ?? false;
    const sectorOk = fields.sector?.toLowerCase().includes('studio dentistico') ?? false;
    const paymOk = fields.paymentTerms === CUSTOMER.paymentTerms;
    const mobileOk = fields.mobile === CUSTOMER.mobile;
    const mobileDiffPhone = fields.mobile !== fields.phone;
    const urlEmpty = !fields.url || fields.url === '' || fields.url === 'N/A';
    const pecEmpty = !fields.pec || fields.pec === '' || fields.pec === 'N/A';

    console.log(`  CF corretto (${CUSTOMER.fiscalCode}): ${cfOk ? 'OK' : 'FAIL — got: ' + fields.fiscalCode}`);
    console.log(`  CF != P.IVA: ${cfNotVat ? 'OK' : 'FAIL — CF coincide con P.IVA!'}`);
    console.log(`  SDI = 0000000: ${sdiOk ? 'OK' : 'FAIL — got: ' + fields.sdi}`);
    console.log(`  deliveryMode FedEx: ${delivOk ? 'OK' : 'FAIL — got: ' + fields.deliveryMode}`);
    console.log(`  sector Studio Dentistico: ${sectorOk ? 'OK' : 'FAIL — got: ' + fields.sector}`);
    console.log(`  paymentTerms = 206: ${paymOk ? 'OK' : 'FAIL — got: ' + fields.paymentTerms}`);
    console.log(`  mobile = ${CUSTOMER.mobile}: ${mobileOk ? 'OK' : 'FAIL — got: ' + fields.mobile}`);
    console.log(`  mobile != phone: ${mobileDiffPhone ? 'OK' : 'FAIL — coincidono!'}`);
    console.log(`  URL vuoto: ${urlEmpty ? 'OK' : 'FAIL — got: ' + fields.url}`);
    console.log(`  PEC vuota: ${pecEmpty ? 'OK' : 'FAIL — got: ' + fields.pec}`);

    // Now run buildSnapshotWithDiff
    console.log(`\n[E2E] buildSnapshotWithDiff con dotId="${dotId}"...`);
    const { snapshot, divergences } = await bot.buildSnapshotWithDiff(dotId, CUSTOMER);

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

    const allOk = cfOk && cfNotVat && sdiOk && delivOk && sectorOk && paymOk && mobileOk && mobileDiffPhone && urlEmpty;

    console.log('\n[E2E] === RISULTATO FINALE ===');
    console.log(`  ERP ID (dot): ${dotId}`);
    console.log(`  ERP ID (numeric): ${numericId}`);
    console.log(`  Snapshot: ${snapshot ? 'OK' : 'NULL'}`);
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

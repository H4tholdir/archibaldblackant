/**
 * Verifica quali campi del scraper sono nascosti in ogni pagina ERP
 */
import puppeteer from 'puppeteer';

const ARCHIBALD_URL = 'https://4.231.124.90/Archibald';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Campi richiesti per ogni pagina (da scraper configs)
const SCRAPER_FIELDS = {
  customers: ['ACCOUNTNUM','NAME','VATNUM','FISCALCODE','LEGALAUTHORITY','LEGALEMAIL','PHONE','CELLULARPHONE','URL','BRASCRMATTENTIONTO','STREET','LOGISTICSADDRESSZIPCODE.ZIPCODE','CITY','SALESACT','BUSRELTYPEID.TYPEID','DLVMODE.TXT','BUSRELTYPEID.TYPEDESCRIPTION','LASTORDERDATE','ORDERCOUNTACT','ORDERCOUNTPREV','SALESPREV','ORDERCOUNTPREV2','SALESPREV2','EXTERNALACCOUNTNUM','OURACCOUNTNUM','ID'],
  orders: ['ID','SALESID','CUSTACCOUNT','SALESNAME','CREATEDDATETIME','DELIVERYDATE','SALESSTATUS','SALESTYPE','DOCUMENTSTATUS','SALESORIGINID.DESCRIPTION','TRANSFERSTATUS','TRANSFERREDDATE','COMPLETEDDATE','QUOTE','MANUALDISCOUNT','GROSSAMOUNT','AmountTotal','SAMPLEORDER','DELIVERYNAME','DLVADDRESS','PURCHORDERFORMNUM','CUSTOMERREF','EMAIL'],
  ddt: ['SALESID','PACKINGSLIPID','DELIVERYDATE','ID','ORDERACCOUNT','SALESTABLE.SALESNAME','DELIVERYNAME','DLVTERM.TXT','DLVMODE.TXT','DLVCITY','BRASCRMATTENTIONTO','DLVADDRESS','QTY','CUSTOMERREF','PURCHASEORDER','BRASTRACKINGNUMBER'],
  invoices: ['SALESID','INVOICEID','INVOICEDATE','INVOICEAMOUNTMST','INVOICEACCOUNT','INVOICINGNAME','QTY','REMAINAMOUNTMST','SUMTAXMST','SUMLINEDISCMST','ENDDISCMST','DUEDATE','PAYMTERMID.DESCRIPTION','PURCHASEORDER','CLOSED','OVERDUEDAYS','SETTLEAMOUNTMST','LASTSETTLEVOUCHER','LASTSETTLEDATE'],
  products: ['ITEMID','NAME','SEARCHNAME','PRODUCTGROUPID.ID','BRASPACKINGCONTENTS','DESCRIPTION','PRICEUNIT','PRODUCTGROUPID.PRODUCTGROUPID','LOWESTQTY','MULTIPLEQTY','HIGHESTQTY','BRASFIGURE','BRASITEMIDBULK','BRASPACKAGEEXPERTS','BRASSIZE','TAXITEMGROUPID','PRODUCTGROUPID.PRODUCTGROUP1','CONFIGID','CREATEDBY','CREATEDDATETIME','DATAAREAID','DEFAULTSALESQTY','DISPLAYPRODUCTNUMBER','ENDDISC','ID','LINEDISC.ID','MODIFIEDBY','MODIFIEDDATETIME','ORDERITEM','STOPPED','PURCHPRICEPCS','STANDARDCONFIGID','STANDARDQTY','UNITID'],
  prices: ['ITEMRELATIONID','ITEMRELATIONTXT','AMOUNT','CURRENCY','FROMDATE','TODATE','PRICEUNIT','ACCOUNTRELATIONTXT','ACCOUNTRELATIONID','QUANTITYAMOUNTFROM','QUANTITYAMOUNTTO','MODIFIEDDATETIME','DATAAREAID'],
};

const PAGE_URLS = {
  customers: 'CUSTTABLE_ListView_Agent',
  orders: 'SALESTABLE_ListView_Agent',
  ddt: 'CUSTPACKINGSLIPJOUR_ListView',
  invoices: 'CUSTINVOICEJOUR_ListView',
  products: 'INVENTTABLE_ListView',
  prices: 'PRICEDISCTABLE_ListView',
};

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--ignore-certificate-errors','--no-sandbox'], defaultViewport: {width:1440,height:900} });
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());

  await page.goto(`${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`, { waitUntil: 'networkidle2', timeout: 30000 });
  const fields = await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.id.includes('UserName'));
    const p = document.querySelector('input[type="password"]');
    return (u&&p)?{uid:u.id,pid:p.id}:null;
  });
  const fill = async (id,v) => {
    await page.evaluate((id,v) => {
      const el=document.getElementById(id); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
      if(s)s.call(el,v);else el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));
    },id,v);
    await page.keyboard.press('Tab');
  };
  await fill(fields.uid,'ikiA0930'); await fill(fields.pid,'Fresis26@');
  await page.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button,input[type=submit],a')).find(b=>/accedi|login/i.test((b.textContent||'').toLowerCase().trim())); if(b)b.click(); });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('Login OK\n');

  const results = {};

  for (const [name, slug] of Object.entries(PAGE_URLS)) {
    await page.goto(`${ARCHIBALD_URL}/${slug}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    const colInfo = await page.evaluate((needed) => {
      const w = window;
      const gn = Object.keys(w).find(k => { try { return w[k]?.GetColumn && typeof w[k].GetColumn === 'function'; } catch { return false; } });
      if (!gn) return {};
      const grid = w[gn];
      const out = {};
      for (let i=0; ; i++) {
        try {
          const col = grid.GetColumn(i);
          if (!col) break;
          if (needed.includes(col.fieldName)) {
            out[col.fieldName] = { index: i, visible: col.visible !== false };
          }
        } catch { break; }
      }
      return out;
    }, SCRAPER_FIELDS[name]);

    const missing = SCRAPER_FIELDS[name].filter(fn => !(fn in colInfo));
    const hidden = Object.entries(colInfo).filter(([,v]) => !v.visible);

    results[name] = { missing, hidden: hidden.map(([fn,v]) => ({ fn, index: v.index })) };

    console.log(`=== ${name} ===`);
    if (missing.length) console.log(`  ❓ Non trovati nella grid: ${missing.join(', ')}`);
    if (hidden.length) console.log(`  ❌ Nascosti (${hidden.length}): ${hidden.map(h => `${h.fn}[${h.index}]`).join(', ')}`);
    if (!missing.length && !hidden.length) console.log('  ✅ Tutti visibili');
    console.log();
  }

  await browser.close();
  console.log('\nRiepilogo nascosti per fix:');
  console.log(JSON.stringify(results, null, 2));
})();

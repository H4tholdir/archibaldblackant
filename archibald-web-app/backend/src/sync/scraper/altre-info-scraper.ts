import type { Page } from 'puppeteer';
import type { AltreInfoInput } from '../../db/repositories/customers';
import { logger } from '../../logger';

// Selettori certificati dalla discovery 2026-05-10 su cliente 55258
const SELECTORS = {
  tab:                    `[id*="xaf_l497_pg_T3"]`,
  // CRM / Rubrica
  REFID:                  `[id*="xaf_dviREFID_View"]`,
  REFIDOLDCRM:            `[id*="xaf_dviREFIDOLDCRM_View"]`,
  BUSRELACCOUNT:          `[id*="xaf_dviBUSRELACCOUNT_View"]`,
  BUSRELTYPEID:           `[id*="xaf_dviBUSRELTYPEID_View"]`,
  // Sistema ERP
  CREATEDDATETIME:        `[id*="xaf_dviCREATEDDATETIME_View"]`,
  MODIFIEDDATETIME:       `[id*="xaf_dviMODIFIEDDATETIME_View"]`,
  CREATEDBY:              `[id*="xaf_dviCREATEDBY_View"]`,
  MODIFIEDBY:             `[id*="xaf_dviMODIFIEDBY_View"]`,
  // Geo
  GROADDRESS:             `[id*="xaf_dviGROADDRESS_View"]`,
  LATITUDE:               `[id*="xaf_dviLATITUDE_View"]`,
  LONGITUDE:              `[id*="xaf_dviLONGITUDE_View"]`,
  // Esclusività — fallback rispetto al Column Chooser ListView
  EXCLUSIVACTIVE:         `[id*="xaf_dviEXCLUSIVACTIVE_View"]`,
  EXCLUSIVPERIODEND:      `[id*="xaf_dviEXCLUSIVPERIODEND_View"]`,
  EXCLUSIVPERIODSTART:    `[id*="xaf_dviEXCLUSIVPERIODSTART_View"]`,
  EXCLUSIVSALESFORECAST:  `[id*="xaf_dviEXCLUSIVSALESFORECAST_View"]`,
  EXCLUSIVSALESINPERIOD:  `[id*="xaf_dviEXCLUSIVSALESINPERIOD_View"]`,
  // Meccanografico
  MECHANOGRAPHICNUMBER:   `[id*="xaf_dviMECHANOGRAPHICNUMBER_View"]`,
  // P.IVA validata (tab Principale — letta prima del click T3)
  VATVALIEDE:             `[id*="xaf_dviVATVALIEDE_View"]`,
} as const;

type ScrapeAltreInfoResult = AltreInfoInput & { ok: boolean; vatValidatedByErp?: boolean | null };

async function scrapeCustomerAltreInfoTab(
  page: Page,
  erpBaseUrl: string,
  erpId: string,
): Promise<ScrapeAltreInfoResult> {
  // erpId è nel formato "55.258" — la URL usa il numero senza punto
  const numericId = erpId.replace('.', '');
  const url = `${erpBaseUrl}/CUSTTABLE_DetailView/${numericId}/?mode=View`;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelector('[id*="xaf_l497_pg_T3"]') !== null,
      { timeout: 10000 },
    );
  } catch (err) {
    logger.warn('[altreInfoScraper] Navigazione fallita per %s: %s', erpId, String(err));
    return { ok: false };
  }

  // Clicca il tab "Altre informazioni" (T3)
  const tabClicked = await page.evaluate((sel: string) => {
    const tab = document.querySelector(sel) as HTMLElement | null;
    if (tab) { tab.click(); return true; }
    return false;
  }, SELECTORS.tab);

  if (!tabClicked) {
    logger.warn('[altreInfoScraper] Tab "Altre informazioni" non trovato per %s', erpId);
    return { ok: false };
  }

  await new Promise(r => setTimeout(r, 800));

  const fields = await page.evaluate((sels: typeof SELECTORS) => {
    const read = (sel: string): string =>
      (document.querySelector(sel) as HTMLElement | null)?.textContent?.trim() ?? '';

    return {
      refId:                  read(sels.REFID),
      refIdOldCrm:            read(sels.REFIDOLDCRM),
      busRelAccount:          read(sels.BUSRELACCOUNT),
      busRelTypeId:           read(sels.BUSRELTYPEID),
      createdDatetime:        read(sels.CREATEDDATETIME),
      modifiedDatetime:       read(sels.MODIFIEDDATETIME),
      createdBy:              read(sels.CREATEDBY),
      modifiedBy:             read(sels.MODIFIEDBY),
      groAddress:             read(sels.GROADDRESS),
      latitude:               read(sels.LATITUDE),
      longitude:              read(sels.LONGITUDE),
      exclusivActive:         read(sels.EXCLUSIVACTIVE),
      exclusivPeriodEnd:      read(sels.EXCLUSIVPERIODEND),
      exclusivPeriodStart:    read(sels.EXCLUSIVPERIODSTART),
      exclusivForecast:       read(sels.EXCLUSIVSALESFORECAST),
      exclusivActual:         read(sels.EXCLUSIVSALESINPERIOD),
      mechanographicNumber:   read(sels.MECHANOGRAPHICNUMBER),
      vatValidated:           read(sels.VATVALIEDE),
    };
  }, SELECTORS);

  return {
    ok: true,
    crmRefId:                 fields.refId || null,
    crmOldRefId:              fields.refIdOldCrm || null,
    crmAccountCommercial:     fields.busRelAccount || null,
    crmContactType:           fields.busRelTypeId || null,
    erpCreatedAt:             parseItDatetime(fields.createdDatetime),
    erpCreatedBy:             fields.createdBy || null,
    erpModifiedAt:            parseItDatetime(fields.modifiedDatetime),
    erpModifiedBy:            fields.modifiedBy || null,
    geoAddress:               fields.groAddress || null,
    geoLatitude:              parseFloat(fields.latitude) || null,
    geoLongitude:             parseFloat(fields.longitude) || null,
    // Esclusività letta direttamente dal DetailView (fallback rispetto al Column Chooser)
    exclusivityDaysRemaining: parseFloat(fields.exclusivActive) || null,
    exclusivityEndDate:       parseItDate(fields.exclusivPeriodEnd),
    exclusivityStartDate:     parseItDate(fields.exclusivPeriodStart),
    exclusivitySalesForecast: parseFloat(fields.exclusivForecast) || null,
    exclusivitySalesActual:   parseFloat(fields.exclusivActual.replace(',', '.')) || null,
    fnomceo:                  fields.mechanographicNumber || null,
    vatValidatedByErp:        fields.vatValidated === 'Sì' ? true : fields.vatValidated === 'No' ? false : null,
  };
}

// Converte "23/01/2026 10:05:25" → "2026-01-23T10:05:25" (formato IT DetailView)
function parseItDatetime(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min, ss] = m;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

// Converte "07/02/2027" → "2027-02-07" (data sola, formato IT)
function parseItDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

export { scrapeCustomerAltreInfoTab, parseItDatetime, parseItDate, type ScrapeAltreInfoResult };

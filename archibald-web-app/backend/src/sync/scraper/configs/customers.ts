import type { ScraperConfig } from '../types';
import { parseDate, parseNumber, parseErpId } from './parsers';

const customersConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/CUSTTABLE_ListView_Agent/',
  filter: {
    xafValuePattern: 'All_Customers',
    xafAllValue: 'xaf_xaf_a1All_Customers',  // ERP post-manutenzione usa a1
  },
  // Force DOM extraction: GetRowValues API keeps InCallback=true, causing
  // waitForDevExpressIdle to timeout at 45s during page navigation.
  domExtraction: true,
  columns: [
    { fieldName: 'ACCOUNTNUM', targetField: 'accountNum' },
    { fieldName: 'NAME', targetField: 'name' },
    { fieldName: 'VATNUM', targetField: 'vatNumber' },
    { fieldName: 'FISCALCODE', targetField: 'fiscalCode' },
    { fieldName: 'LEGALAUTHORITY', targetField: 'sdi' },
    { fieldName: 'LEGALEMAIL', targetField: 'pec' },
    { fieldName: 'PHONE', targetField: 'phone' },
    { fieldName: 'CELLULARPHONE', targetField: 'mobile' },
    { fieldName: 'URL', targetField: 'url' },
    { fieldName: 'BRASCRMATTENTIONTO', targetField: 'attentionTo' },
    { fieldName: 'STREET', targetField: 'street' },
    { fieldName: 'LOGISTICSADDRESSZIPCODE.ZIPCODE', targetField: 'postalCode' },
    { fieldName: 'CITY', targetField: 'city' },
    { fieldName: 'SALESACT', targetField: 'customerType' },
    { fieldName: 'BUSRELTYPEID.TYPEID', targetField: 'type' },
    { fieldName: 'DLVMODE.TXT', targetField: 'deliveryTerms' },
    { fieldName: 'BUSRELTYPEID.TYPEDESCRIPTION', targetField: 'description' },
    { fieldName: 'LASTORDERDATE', targetField: 'lastOrderDate', parser: parseDate },
    { fieldName: 'ORDERCOUNTACT', targetField: 'actualOrderCount', parser: parseNumber },
    { fieldName: 'ORDERCOUNTPREV', targetField: 'previousOrderCount1', parser: parseNumber },
    { fieldName: 'SALESPREV', targetField: 'previousSales1', parser: parseNumber },
    { fieldName: 'ORDERCOUNTPREV2', targetField: 'previousOrderCount2', parser: parseNumber },
    { fieldName: 'SALESPREV2', targetField: 'previousSales2', parser: parseNumber },
    { fieldName: 'EXTERNALACCOUNTNUM', targetField: 'externalAccountNumber' },
    { fieldName: 'OURACCOUNTNUM', targetField: 'ourAccountNumber' },
    { fieldName: 'ID', targetField: 'erpId', parser: parseErpId },
    // Colonne attivabili via Column Chooser (custwindow sub-panel) — post-update ERP 2026-05-10.
    // Richiedono fixCustomersColumnChooser() prima dello scraping.
    { fieldName: 'EXCLUSIVACTIVE', targetField: 'exclusivityDaysRemaining', parser: parseNumber },
    { fieldName: 'EXCLUSIVPERIODEND', targetField: 'exclusivityEndDate', parser: parseDate },
    { fieldName: 'EXCLUSIVPERIODSTART', targetField: 'exclusivityStartDate', parser: parseDate },
    { fieldName: 'EXCLUSIVSALESFORECAST', targetField: 'exclusivitySalesForecast', parser: parseNumber },
    { fieldName: 'EXCLUSIVSALESINPERIOD', targetField: 'exclusivitySalesActual', parser: parseNumber },
    { fieldName: 'MECHANOGRAPHICNUMBER', targetField: 'fnomceo' },
  ],
};

export { customersConfig };

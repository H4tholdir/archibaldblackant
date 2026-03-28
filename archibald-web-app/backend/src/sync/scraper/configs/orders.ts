import type { ScraperConfig } from '../types';
import { parseDate, parseCurrency } from './parsers';

const ordersConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/',
  filter: {
    safeValue: 'Tutti gli ordini',
    safeValueAlt: 'All orders',
  },
  columns: [
    { fieldName: 'ID', targetField: 'id' },
    { fieldName: 'SALESID', targetField: 'orderNumber' },
    { fieldName: 'CUSTACCOUNT', targetField: 'customerProfileId' },
    { fieldName: 'SALESNAME', targetField: 'customerName' },
    { fieldName: 'CREATEDDATETIME', targetField: 'date', parser: parseDate },
    { fieldName: 'DELIVERYDATE', targetField: 'deliveryDate', parser: parseDate },
    { fieldName: 'SALESSTATUS', targetField: 'status' },
    { fieldName: 'SALESTYPE', targetField: 'orderType' },
    { fieldName: 'DOCUMENTSTATUS', targetField: 'documentState' },
    { fieldName: 'SALESORIGINID.DESCRIPTION', targetField: 'salesOrigin' },
    { fieldName: 'TRANSFERSTATUS', targetField: 'transferStatus' },
    { fieldName: 'TRANSFERREDDATE', targetField: 'transferDate', parser: parseDate },
    { fieldName: 'COMPLETEDDATE', targetField: 'completionDate', parser: parseDate },
    { fieldName: 'QUOTE', targetField: 'isQuote' },
    { fieldName: 'MANUALDISCOUNT', targetField: 'discountPercent' },
    { fieldName: 'GROSSAMOUNT', targetField: 'grossAmount', parser: parseCurrency },
    { fieldName: 'AmountTotal', targetField: 'total', parser: parseCurrency },
    { fieldName: 'SAMPLEORDER', targetField: 'isGiftOrder' },
    { fieldName: 'DELIVERYNAME', targetField: 'deliveryName' },
    { fieldName: 'DLVADDRESS', targetField: 'deliveryAddress' },
    { fieldName: 'PURCHORDERFORMNUM', targetField: 'remainingSalesFinancial' },
    { fieldName: 'CUSTOMERREF', targetField: 'customerReference' },
    { fieldName: 'EMAIL', targetField: 'email' },
  ],
};

export { ordersConfig };

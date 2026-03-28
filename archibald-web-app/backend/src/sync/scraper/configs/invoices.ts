import type { ScraperConfig } from '../types';
import { parseDate, parseNumber, parseBoolean, parseCurrency } from './parsers';

const invoicesConfig: ScraperConfig = {
  url: 'https://4.231.124.90/Archibald/CUSTINVOICEJOUR_ListView/',
  filter: {
    safeValue: 'Tutti',
    safeValueAlt: 'All',
  },
  columns: [
    { fieldName: 'SALESID', targetField: 'orderNumber' },
    { fieldName: 'INVOICEID', targetField: 'invoiceNumber' },
    { fieldName: 'INVOICEDATE', targetField: 'invoiceDate', parser: parseDate },
    { fieldName: 'INVOICEAMOUNTMST', targetField: 'invoiceAmount', parser: parseCurrency },
    { fieldName: 'INVOICEACCOUNT', targetField: 'invoiceCustomerAccount' },
    { fieldName: 'INVOICINGNAME', targetField: 'invoiceBillingName' },
    { fieldName: 'QTY', targetField: 'invoiceQuantity', parser: parseNumber },
    { fieldName: 'REMAINAMOUNTMST', targetField: 'invoiceRemainingAmount', parser: parseCurrency },
    { fieldName: 'SUMTAXMST', targetField: 'invoiceTaxAmount', parser: parseCurrency },
    { fieldName: 'SUMLINEDISCMST', targetField: 'invoiceLineDiscount', parser: parseCurrency },
    { fieldName: 'ENDDISCMST', targetField: 'invoiceTotalDiscount', parser: parseCurrency },
    { fieldName: 'DUEDATE', targetField: 'invoiceDueDate', parser: parseDate },
    { fieldName: 'PAYMTERMID.DESCRIPTION', targetField: 'invoicePaymentTermsId' },
    { fieldName: 'PURCHASEORDER', targetField: 'invoicePurchaseOrder' },
    { fieldName: 'CLOSED', targetField: 'invoiceClosed', parser: parseBoolean },
    { fieldName: 'OVERDUEDAYS', targetField: 'invoiceDaysPastDue' },
    { fieldName: 'SETTLEAMOUNTMST', targetField: 'invoiceSettledAmount', parser: parseCurrency },
    { fieldName: 'LASTSETTLEVOUCHER', targetField: 'invoiceLastPaymentId' },
    { fieldName: 'LASTSETTLEDATE', targetField: 'invoiceLastSettlementDate', parser: parseDate },
  ],
};

export { invoicesConfig };
